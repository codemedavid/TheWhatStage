import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { embedBatch } from "@/lib/ai/embedding";
import { chunkText } from "@/lib/ai/chunking";
import {
  diffSections,
  hashContent,
  type ExistingDoc,
  type ParsedSection,
} from "@/lib/knowledge/section-diff";

const sectionSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(50_000),
  order: z.number().int().min(0),
});
const bodySchema = z.object({
  sections: z.array(sectionSchema).max(200),
});

async function reEmbedAndStoreChunks(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  rows: Array<{ id: string; content: string; isUpdate: boolean }>
): Promise<{ failures: Array<{ id: string; error: string }> }> {
  const failures: Array<{ id: string; error: string }> = [];
  if (rows.length === 0) return { failures };

  const chunkPlan: Array<{ docId: string; content: string }> = [];
  for (const row of rows) {
    const chunks = chunkText(row.content);
    for (const c of chunks) {
      chunkPlan.push({ docId: row.id, content: c });
    }
  }

  let embeddings: number[][];
  try {
    embeddings = await embedBatch(chunkPlan.map((c) => c.content));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const row of rows) {
      failures.push({ id: row.id, error: msg });
      await service
        .from("knowledge_docs")
        .update({ status: "error", metadata: { error: msg } })
        .eq("id", row.id);
    }
    return { failures };
  }

  for (const row of rows) {
    if (row.isUpdate) {
      const { error } = await service
        .from("knowledge_chunks")
        .delete()
        .eq("doc_id", row.id)
        .eq("tenant_id", tenantId);
      if (error) failures.push({ id: row.id, error: error.message });
    }
  }

  const chunkRows = chunkPlan.map((c, i) => ({
    doc_id: c.docId,
    tenant_id: tenantId,
    content: c.content,
    kb_type: "general" as const,
    embedding: embeddings[i],
    metadata: {},
  }));

  const { error: insertErr } = await service
    .from("knowledge_chunks")
    .insert(chunkRows);
  if (insertErr) {
    failures.push({ id: "chunks", error: insertErr.message });
  }

  return { failures };
}

export async function PUT(request: Request) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Reject duplicate titles up front (case-insensitive)
  const seen = new Set<string>();
  for (const s of parsed.data.sections) {
    const key = s.title.trim().toLowerCase();
    if (seen.has(key)) {
      return NextResponse.json(
        { error: `Duplicate section title: "${s.title}"` },
        { status: 400 }
      );
    }
    seen.add(key);
  }

  const service = createServiceClient();

  const { data: existingRaw, error: loadErr } = await service
    .from("knowledge_docs")
    .select("id, title, content, content_hash, display_order")
    .eq("tenant_id", tenantId)
    .eq("type", "richtext");

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const existing: ExistingDoc[] = (existingRaw ?? []).map((d: any) => ({
    id: d.id,
    title: d.title,
    contentHash: d.content_hash,
  }));

  const incoming: ParsedSection[] = parsed.data.sections;
  const diff = diffSections(existing, incoming);

  // 1. Delete removed sections (chunks cascade)
  if (diff.deleted.length > 0) {
    const ids = diff.deleted.map((d) => d.id);
    const { error } = await service
      .from("knowledge_docs")
      .delete()
      .in("id", ids)
      .eq("tenant_id", tenantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 2. Update unchanged display_order only (no embedding)
  for (const s of diff.unchanged) {
    await service
      .from("knowledge_docs")
      .update({ display_order: s.order })
      .eq("id", s.id)
      .eq("tenant_id", tenantId);
  }

  // 3. Update changed sections
  for (const s of diff.updated) {
    await service
      .from("knowledge_docs")
      .update({
        title: s.title,
        content: s.content,
        content_hash: hashContent(s.content),
        display_order: s.order,
        status: "processing",
        metadata: {},
      })
      .eq("id", s.id)
      .eq("tenant_id", tenantId);
  }

  // 4. Create new sections
  const createdIds: Array<{ id: string; content: string }> = [];
  for (const s of diff.created) {
    const { data, error } = await service
      .from("knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: s.title,
        type: "richtext",
        content: s.content,
        content_hash: hashContent(s.content),
        display_order: s.order,
        status: "processing",
        metadata: {},
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed" },
        { status: 500 }
      );
    }
    createdIds.push({ id: data.id, content: s.content });
  }

  // 5. Re-embed updated + created
  const toEmbed = [
    ...diff.updated.map((s) => ({ id: s.id, content: s.content, isUpdate: true })),
    ...createdIds.map((c) => ({ id: c.id, content: c.content, isUpdate: false })),
  ];

  const { failures } = await reEmbedAndStoreChunks(service, tenantId, toEmbed);

  // 6. Mark embedded docs as ready
  const succeededIds = toEmbed
    .map((r) => r.id)
    .filter((id) => !failures.some((f) => f.id === id));
  for (const id of succeededIds) {
    await service
      .from("knowledge_docs")
      .update({ status: "ready", metadata: {} })
      .eq("id", id)
      .eq("tenant_id", tenantId);
  }

  const status = failures.length > 0 ? 207 : 200;
  return NextResponse.json(
    {
      created: diff.created.length,
      updated: diff.updated.length,
      deleted: diff.deleted.length,
      unchanged: diff.unchanged.length,
      failures,
    },
    { status }
  );
}
