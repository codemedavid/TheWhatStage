import { describe, it, expect } from "vitest";
import path from "path";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { loadGoldenSet } from "@/lib/ai/eval/golden-set";
import { chunkContainsFact } from "@/lib/ai/eval/faithfulness";

const RUN = process.env.HF_TOKEN && process.env.SUPABASE_DB_URL;
const d = RUN ? describe : describe.skip;
const TENANT = "00000000-0000-0000-0000-000000000099";

d("RAG golden-set faithfulness", () => {
  const items = loadGoldenSet(path.join(__dirname, "../fixtures/rag-golden/sample-tenant.jsonl"));
  for (const item of items) {
    it(`retrieves expected fact for "${item.query}" (${item.language})`, async () => {
      const r = await retrieveKnowledge({ query: item.query, tenantId: TENANT });
      expect(chunkContainsFact(r.chunks, item.expected_fact))
        .toBe(true);
    });
  }
});
