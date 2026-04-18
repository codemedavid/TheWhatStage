const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  if (trimmed.length <= maxChars) return [trimmed];

  const sentences = splitSentences(trimmed);
  if (sentences.length === 0) return [trimmed];

  const chunks: string[] = [];
  let currentChunk = "";
  let overlapBuffer: string[] = [];

  for (const sentence of sentences) {
    // If a single sentence exceeds maxChars, split it by words first
    const segments = sentence.length > maxChars
      ? splitByWords(sentence, maxChars, overlapChars)
      : [sentence];

    for (const segment of segments) {
      const candidate = currentChunk
        ? currentChunk + " " + segment
        : segment;

      if (candidate.length > maxChars && currentChunk) {
        chunks.push(currentChunk.trim());

        const overlapText = overlapBuffer.join(" ");
        if (overlapText.length > 0 && overlapText.length <= overlapChars) {
          currentChunk = overlapText + " " + segment;
        } else {
          currentChunk = segment;
        }
        overlapBuffer = [segment];
      } else {
        currentChunk = candidate;
        overlapBuffer.push(segment);
        while (
          overlapBuffer.length > 1 &&
          overlapBuffer.join(" ").length > overlapChars
        ) {
          overlapBuffer.shift();
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.filter((s) => s.trim().length > 0);
}

function splitByWords(text: string, maxChars: number, overlapChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let overlapWords: string[] = [];

  for (const word of words) {
    const candidate = current.length > 0 ? current.join(" ") + " " + word : word;
    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current.join(" "));
      current = [...overlapWords, word];
      overlapWords = [word];
    } else {
      current.push(word);
      overlapWords.push(word);
      while (overlapWords.length > 1 && overlapWords.join(" ").length > overlapChars) {
        overlapWords.shift();
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks;
}
