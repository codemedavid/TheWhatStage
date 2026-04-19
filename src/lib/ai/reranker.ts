import { InferenceClient } from "@huggingface/inference";
import type { ChunkResult } from "@/lib/ai/vector-search";

const MODEL = "BAAI/bge-reranker-v2-m3";
const RERANKER_TIMEOUT_MS = 8_000;
const TOP_K = 5;

function getClient(): InferenceClient {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not set");
  return new InferenceClient(token);
}

function extractScore(raw: unknown, index: number): number {
  if (!raw) return 0;
  const entry = (raw as unknown[])[index];
  if (Array.isArray(entry)) return (entry[0] as { score: number })?.score ?? 0;
  return (entry as { score: number })?.score ?? 0;
}

export async function rerankChunks(
  query: string,
  chunks: ChunkResult[]
): Promise<ChunkResult[]> {
  if (chunks.length === 0) return [];
  if (chunks.length === 1) return chunks;

  try {
    const client = getClient();

    const inputs = chunks.map((chunk) => ({
      text: query,
      text_pair: chunk.content,
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RERANKER_TIMEOUT_MS);

    const scores = await client.textClassification({
      model: MODEL,
      inputs: inputs as Parameters<typeof client.textClassification>[0]["inputs"],
    });

    clearTimeout(timeoutId);

    const scored = chunks.map((chunk, i) => ({
      chunk: { ...chunk, similarity: extractScore(scores, i) },
      score: extractScore(scores, i),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, TOP_K).map(({ chunk }) => chunk);
  } catch {
    // Graceful fallback: vector similarity ordering
    return [...chunks]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, TOP_K);
  }
}
