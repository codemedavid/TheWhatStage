import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

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
      docTitle: parsed.data.title,
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
