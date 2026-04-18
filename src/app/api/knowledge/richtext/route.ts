import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: doc, error: insertError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      type: "richtext",
      content: parsed.data.content,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }

  // Strip HTML for plain text, then ingest
  const plainText = parsed.data.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const buffer = Buffer.from(plainText, "utf-8");

  const processPromise = Promise.resolve(
    ingestDocument({
      docId: doc.id,
      tenantId,
      type: "richtext",
      kbType: "general",
      buffer,
    })
  );

  // @ts-expect-error waitUntil exists on Vercel runtime
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error waitUntil is a Vercel runtime API
    globalThis.waitUntil(processPromise);
  } else {
    processPromise.catch((err) => console.error("Richtext processing failed:", err));
  }

  return NextResponse.json({ docId: doc.id, status: "processing" }, { status: 201 });
}
