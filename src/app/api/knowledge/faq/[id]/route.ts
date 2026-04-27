import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { embedText } from "@/lib/ai/embedding";
import { formatFaqChunk } from "@/lib/ai/processors/faq";
import { hashContent } from "@/lib/knowledge/section-diff";

const updateSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;
  const { id } = await ctx.params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { question, answer } = parsed.data;
  const service = createServiceClient();

  const { data: doc, error: lookupErr } = await service
    .from("knowledge_docs")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  const chunkContent = formatFaqChunk(question, answer);
  const newContent = `${question}\n---\n${answer}`;

  let embedding: number[];
  try {
    embedding = await embedText(chunkContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: msg } })
      .eq("id", id);
    return NextResponse.json({ error: "Embedding failed" }, { status: 502 });
  }

  const { error: docErr } = await service
    .from("knowledge_docs")
    .update({
      title: question,
      content: newContent,
      content_hash: hashContent(newContent),
      status: "ready",
      metadata: {},
    })
    .eq("id", id);

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  const { error: chunkErr } = await service
    .from("knowledge_chunks")
    .update({ content: chunkContent, embedding })
    .eq("doc_id", id)
    .eq("tenant_id", tenantId);

  if (chunkErr) {
    return NextResponse.json({ error: chunkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session;
  const { id } = await ctx.params;
  const service = createServiceClient();

  const { error } = await service
    .from("knowledge_docs")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
