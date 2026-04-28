import { createServiceClient } from "@/lib/supabase/service";
import { embedBatch } from "@/lib/ai/embedding";

const BATCH = 32;

async function main() {
  const supabase = createServiceClient();
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, content")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const embeddings = await embedBatch(data.map((c) => c.content));
    for (let i = 0; i < data.length; i++) {
      const { error: updErr } = await supabase
        .from("knowledge_chunks")
        .update({ embedding: embeddings[i] as unknown as string })
        .eq("id", data[i].id);
      if (updErr) throw updErr;
    }
    total += data.length;
    console.log(`re-embedded ${total} chunks`);
    offset += BATCH;
  }
  console.log(`done — ${total} total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
