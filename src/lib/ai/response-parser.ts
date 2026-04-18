export interface ParsedResponse {
  cleanMessage: string;
  extractedImageIds: string[];
}

const SEND_IMAGE_REGEX = /\[SEND_IMAGE:([^\]\s]+)\]/g;

/**
 * Strip [SEND_IMAGE:id] tokens from LLM text output.
 * Returns the cleaned message and any extracted image IDs (deduplicated).
 */
export function parseResponse(rawMessage: string): ParsedResponse {
  const ids: string[] = [];

  const cleaned = rawMessage.replace(SEND_IMAGE_REGEX, (_, id: string) => {
    if (id.length > 0) {
      ids.push(id);
    }
    return "";
  });

  // Collapse multiple spaces into one, trim
  const cleanMessage = cleaned.replace(/\s{2,}/g, " ").trim();

  // Deduplicate
  const extractedImageIds = [...new Set(ids)];

  return { cleanMessage, extractedImageIds };
}
