import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { ingestDocument } from "@/lib/ai/ingest";
import { createServiceClient } from "@/lib/supabase/service";
import fixture from "../fixtures/rag-fixture-kb.json";

const RUN = process.env.HF_TOKEN && process.env.SUPABASE_DB_URL;
const d = RUN ? describe : describe.skip;

d("retriever (live)", () => {
  beforeAll(async () => {
    const supabase = createServiceClient();
    // Clean up any previous test data
    await supabase.from("knowledge_chunks").delete().eq("tenant_id", fixture.tenantId);
    await supabase.from("knowledge_docs").delete().eq("tenant_id", fixture.tenantId);

    // Ingest all fixture docs
    for (const doc of fixture.docs) {
      const { data, error } = await supabase.from("knowledge_docs").insert({
        tenant_id: fixture.tenantId,
        title: doc.title,
        type: doc.type,
        status: "processing",
      }).select("id").single();
      if (error) throw error;

      await ingestDocument({
        docId: data.id,
        tenantId: fixture.tenantId,
        type: doc.type as never,
        kbType: doc.kbType as never,
        buffer: Buffer.from(""),
        docTitle: doc.title,
        faqPairs: doc.faqPairs,
      });
    }
  });

  it("retrieves the price chunk for an English query", async () => {
    const r = await retrieveKnowledge({
      query: "how much does the starter cost",
      tenantId: fixture.tenantId,
    });
    expect(r.status).toBe("success");
    expect(r.chunks[0].content).toContain("4,999");
  });

  it("retrieves the price chunk for a Taglish query", async () => {
    const r = await retrieveKnowledge({
      query: "magkano po yung starter",
      tenantId: fixture.tenantId,
    });
    expect(r.status).toBe("success");
    expect(r.chunks[0].content).toContain("4,999");
  });

  it("retrieves the refund chunk for a refund query", async () => {
    const r = await retrieveKnowledge({
      query: "can i get my money back",
      tenantId: fixture.tenantId,
    });
    expect(r.chunks.some((c) => c.content.toLowerCase().includes("refund"))).toBe(true);
  });

  afterAll(async () => {
    const supabase = createServiceClient();
    // Clean up test data
    await supabase.from("knowledge_docs").delete().eq("tenant_id", fixture.tenantId);
  });
});
