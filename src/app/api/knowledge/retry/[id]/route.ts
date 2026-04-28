import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";
import type { IngestParams } from "@/lib/ai/ingest";

const ALLOWED_TYPES = ["pdf", "docx", "xlsx"] as const;

const schema = z.object({
  type: z.enum(ALLOWED_TYPES),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: docId } = await params;

  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Parse and validate form data early (fail fast before hitting DB)
  const formData = await request.formData();
  const type = formData.get("type") as string | null;
  const file = formData.get("file") as File | null;

  const parsed = schema.safeParse({ type });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  // 3. Verify doc exists, belongs to tenant, and is in error state
  const service = createServiceClient();
  const { data: doc, error: fetchError } = await service
    .from("knowledge_docs")
    .select("id, type, status, title")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (doc.status !== "error") {
    return NextResponse.json(
      { error: "Only documents with error status can be retried" },
      { status: 409 }
    );
  }

  // 4. Delete old chunks for this document
  const { error: deleteError } = await service
    .from("knowledge_chunks")
    .delete()
    .eq("doc_id", docId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to clear previous chunks" },
      { status: 500 }
    );
  }

  // 5. Reset status to processing
  const { error: resetError } = await service
    .from("knowledge_docs")
    .update({ status: "processing", metadata: {} })
    .eq("id", docId);

  if (resetError) {
    return NextResponse.json(
      { error: "Failed to reset document status" },
      { status: 500 }
    );
  }

  // 6. Kick off async re-processing (non-blocking)
  const buffer = Buffer.from(await file.arrayBuffer());

  const processPromise = Promise.resolve(
    ingestDocument({
      docId,
      tenantId,
      type: parsed.data.type as IngestParams["type"],
      kbType: "general",
      buffer,
      docTitle: doc.title,
    })
  );

  // @ts-expect-error waitUntil exists on Vercel runtime but not in Node types
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error waitUntil is a Vercel runtime API
    globalThis.waitUntil(processPromise);
  } else {
    processPromise.catch((err) =>
      console.error("Document retry processing failed:", err)
    );
  }

  return NextResponse.json({ docId, status: "processing" });
}
