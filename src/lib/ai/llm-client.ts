const HF_API_URL =
  "https://router.huggingface.co/novita/v3/openai/v1/chat/completions";

const MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

export interface LLMConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
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

export async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  config?: LLMConfig,
  retries = MAX_RETRIES
): Promise<LLMResponse> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: config?.temperature ?? 0.7,
        top_p: config?.topP ?? 0.9,
        max_tokens: config?.maxTokens ?? 512,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 503 && retries > 0) {
        await new Promise((r) =>
          setTimeout(r, RETRY_BACKOFF_MS * (MAX_RETRIES - retries + 1))
        );
        return generateResponse(systemPrompt, userMessage, config, retries - 1);
      }
      throw new Error(
        `HuggingFace text generation API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
