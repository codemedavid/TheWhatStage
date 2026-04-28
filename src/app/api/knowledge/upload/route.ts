import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const ALLOWED_TYPES = ["pdf", "docx", "xlsx"] as const;

const schema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(ALLOWED_TYPES),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  // 2. Parse form data
  const formData = await request.formData();
  const title = formData.get("title") as string | null;
  const type = formData.get("type") as string | null;
  const file = formData.get("file") as File | null;

  const parsed = schema.safeParse({ title, type });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  // 3. Create knowledge_docs record with status = 'processing'
  const service = createServiceClient();
  const { data: doc, error: insertError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      type: parsed.data.type,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return NextResponse.json(
      { error: "Failed to create document record" },
      { status: 500 }
    );
  }

  // 4. Kick off async processing (non-blocking)
  const buffer = Buffer.from(await file.arrayBuffer());

  const processPromise = Promise.resolve(
    ingestDocument({
      docId: doc.id,
      tenantId,
      type: parsed.data.type,
      kbType: "general",
      buffer,
      docTitle: parsed.data.title,
    })
  );

  // @ts-expect-error waitUntil exists on Vercel runtime but not in Node types
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error waitUntil is a Vercel runtime API
    globalThis.waitUntil(processPromise);
  } else {
    processPromise.catch((err) =>
      console.error("Document processing failed:", err)
    );
  }

  return NextResponse.json(
    { docId: doc.id, status: "processing" },
    { status: 201 }
  );
}
