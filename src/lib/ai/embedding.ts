const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/Qwen/Qwen3-Embedding-8B/pipeline/feature-extraction";

const BATCH_SIZE = 10;

/**
 * MRL truncation dimension. Qwen3-Embedding-8B outputs 4096 dims but supports
 * Matryoshka Representation Learning — we truncate to 1536 for pgvector HNSW
 * compatibility (max 2000 dims) while preserving semantic quality.
 */
export const EMBEDDING_DIM = 1536;

function truncate(vector: number[]): number[] {
  return vector.slice(0, EMBEDDING_DIM);
}

function getApiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY is not set");
  return key;
}

async function callEmbeddingApi(inputs: string | string[]): Promise<number[][]> {
  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HuggingFace embedding API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Embed a single text string. Returns a float vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await callEmbeddingApi(text);
  return truncate(embedding);
}

/**
 * Embed multiple texts in batches of up to 10.
 * Returns one embedding per input text, in order.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callEmbeddingApi(batch);
    results.push(...embeddings.map(truncate));
  }

  return results;
}
