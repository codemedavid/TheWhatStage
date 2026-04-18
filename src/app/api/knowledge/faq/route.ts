import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { formatFaqChunk } from "@/lib/ai/processors/faq";
import { embedText } from "@/lib/ai/embedding";

const createSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
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
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { question, answer } = parsed.data;
  const service = createServiceClient();

  const { data: doc, error: docError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: question,
      type: "faq",
      content: `${question}\n---\n${answer}`,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (docError || !doc) {
    return NextResponse.json(
      { error: "Failed to create FAQ" },
      { status: 500 }
    );
  }

  const chunkContent = formatFaqChunk(question, answer);
  const embedding = await embedText(chunkContent);

  const { error: chunkError } = await service
    .from("knowledge_chunks")
    .insert({
      doc_id: doc.id,
      tenant_id: tenantId,
      content: chunkContent,
      kb_type: "general",
      embedding,
      metadata: {},
    });

  if (chunkError) {
    await service
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: chunkError.message } })
      .eq("id", doc.id);

    return NextResponse.json(
      { error: "Failed to store FAQ chunk" },
      { status: 500 }
    );
  }

  // Best-effort status update — failure here does not block the response
  try {
    await service
      .from("knowledge_docs")
      .update({ status: "ready", metadata: {} })
      .eq("id", doc.id);
  } catch {
    // non-fatal: chunk is already stored, doc can be re-indexed later
  }

  return NextResponse.json({ docId: doc.id }, { status: 201 });
}
