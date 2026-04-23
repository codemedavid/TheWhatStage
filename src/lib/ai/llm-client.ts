const HF_API_URL =
  "https://router.huggingface.co/v1/chat/completions";

// Primary model + fallbacks for resilience when a provider is down
const MODELS = [
  "google/gemma-3-27b-it",
  "mistralai/Mistral-7B-Instruct-v0.3",
] as const;

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

export interface LLMConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface LLMResponse {
  content: string;
  finishReason: string;
}

function getApiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY is not set");
  return key;
}

async function callModel(
  model: string,
  systemPrompt: string,
  userMessage: string,
  config: LLMConfig | undefined,
  apiKey: string,
  retries: number
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const bodyPayload: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: config?.temperature ?? 0.4,
      top_p: config?.topP ?? 0.9,
      max_tokens: config?.maxTokens ?? 512,
    };
    if ((config?.responseFormat ?? "json_object") === "json_object") {
      bodyPayload.response_format = { type: "json_object" };
    }

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Retry on transient errors (503 overloaded, 429 rate limit)
      if ((response.status === 503 || response.status === 429) && retries > 0) {
        await new Promise((r) =>
          setTimeout(r, RETRY_BACKOFF_MS * (MAX_RETRIES - retries + 1))
        );
        return callModel(model, systemPrompt, userMessage, config, apiKey, retries - 1);
      }
      throw new Error(
        `HuggingFace API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error("HuggingFace returned empty response");
    }

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  config?: LLMConfig,
  retries = MAX_RETRIES
): Promise<LLMResponse> {
  const apiKey = getApiKey();

  // Try each model in order; fall back on non-retryable errors (400, 404, 422)
  let lastError: Error | null = null;
  for (const model of MODELS) {
    try {
      return await callModel(model, systemPrompt, userMessage, config, apiKey, retries);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isModelUnavailable =
        lastError.message.includes("(400)") ||
        lastError.message.includes("(404)") ||
        lastError.message.includes("(422)") ||
        lastError.message.includes("not supported");
      // Only fall through to next model if the model itself is the problem
      if (!isModelUnavailable) throw lastError;
      console.warn(`[llm-client] Model ${model} unavailable, trying fallback...`);
    }
  }

  throw lastError ?? new Error("All LLM models failed");
}
