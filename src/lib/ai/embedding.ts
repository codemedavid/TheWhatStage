import { InferenceClient } from "@huggingface/inference";

const MODEL = "BAAI/bge-m3";

export const EMBEDDING_DIM = 1024;

const BATCH_SIZE = 10;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

function getClient(): InferenceClient {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not set");
  return new InferenceClient(token);
}

function validateDimension(vector: number[], label: string): void {
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch (${label}): expected ${EMBEDDING_DIM}, got ${vector.length}`
    );
  }
}

async function callFeatureExtraction(
  inputs: string | string[],
  retries = MAX_RETRIES
): Promise<number[][]> {
  const client = getClient();

  try {
    const result = await client.featureExtraction({
      model: MODEL,
      inputs,
      provider: "hf-inference",
    });

    // SDK returns number[] for single string, number[][] for array
    if (!Array.isArray(result[0])) {
      return [result as number[]];
    }
    return result as number[][];
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof Error &&
      error.message.includes("503")
    ) {
      await new Promise((r) =>
        setTimeout(r, RETRY_BACKOFF_MS * (MAX_RETRIES - retries + 1))
      );
      return callFeatureExtraction(inputs, retries - 1);
    }
    throw error;
  }
}

/**
 * Embed a single text string. Returns a 1024-dim float vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await callFeatureExtraction(text);
  validateDimension(embedding, "embedText");
  return embedding;
}

/**
 * Embed multiple texts in batches of up to 10.
 * Returns one 1024-dim embedding per input text, in order.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callFeatureExtraction(batch);
    embeddings.forEach((v, j) => validateDimension(v, `embedBatch[${i + j}]`));
    results.push(...embeddings);
  }

  return results;
}
