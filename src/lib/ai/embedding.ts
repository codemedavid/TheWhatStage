const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/Qwen/Qwen3-Embedding-8B/pipeline/feature-extraction";

const BATCH_SIZE = 10;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

/**
 * MRL truncation dimension. Qwen3-Embedding-8B outputs 4096 dims but supports
 * Matryoshka Representation Learning — we truncate to 1536 for pgvector HNSW
 * compatibility (max 2000 dims) while preserving semantic quality.
 */
export const EMBEDDING_DIM = 1536;

function truncate(vector: number[]): number[] {
  return vector.slice(0, EMBEDDING_DIM);
}

function validateDimension(vector: number[], label: string): void {
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch (${label}): expected ${EMBEDDING_DIM}, got ${vector.length}`
    );
  }
}

function getApiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY is not set");
  return key;
}

async function callEmbeddingApi(
  inputs: string | string[],
  retries = MAX_RETRIES
): Promise<number[][]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Retry on 503 (model loading) with backoff
      if (response.status === 503 && retries > 0) {
        await new Promise((r) =>
          setTimeout(r, RETRY_BACKOFF_MS * (MAX_RETRIES - retries + 1))
        );
        return callEmbeddingApi(inputs, retries - 1);
      }
      throw new Error(
        `HuggingFace embedding API error (${response.status}): ${errorText}`
      );
    }

    const result = await response.json();

    // C2: Handle both response shapes — some HF endpoints return number[]
    // for single-string input instead of number[][]
    if (typeof inputs === "string" && !Array.isArray(result[0])) {
      return [result as number[]];
    }

    return result as number[][];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Embed a single text string. Returns a 1536-dim float vector (MRL-truncated).
 */
export async function embedText(text: string): Promise<number[]> {
  const [raw] = await callEmbeddingApi(text);
  const embedding = truncate(raw);
  validateDimension(embedding, "embedText");
  return embedding;
}

/**
 * Embed multiple texts in batches of up to 10.
 * Returns one 1536-dim embedding per input text, in order.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const rawEmbeddings = await callEmbeddingApi(batch);
    const truncated = rawEmbeddings.map(truncate);
    truncated.forEach((v, j) => validateDimension(v, `embedBatch[${i + j}]`));
    results.push(...truncated);
  }

  return results;
}
