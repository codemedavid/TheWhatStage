import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const ALLOWED_TYPES = ["pdf", "docx", "xlsx"] as const;

const schema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(ALLOWED_TYPES),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

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
    })
  );

  // @ts-expect-error — waitUntil exists on Vercel runtime but not in Node types
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error
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
