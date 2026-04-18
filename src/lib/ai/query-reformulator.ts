const FILLER_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "can", "could", "would", "should", "will", "shall", "may", "might",
  "do", "does", "did", "has", "have", "had",
  "i", "me", "my", "you", "your", "we", "our", "they", "their",
  "it", "its", "this", "that", "these", "those",
  "to", "of", "in", "on", "at", "for", "with", "by", "from",
  "and", "or", "but", "not", "no",
  "please", "just", "also", "very", "really", "actually",
  "tell", "know", "want", "need", "like", "get",
  "what", "where", "when", "how", "why", "who", "which",
  "about", "some", "any",
]);

export function reformulateQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  const cleaned = trimmed
    .toLowerCase()
    .replace(/[?!.,;:'"()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ");
  const contentWords = words.filter((w) => !FILLER_WORDS.has(w));

  if (contentWords.length === 0) return cleaned;

  return contentWords.join(" ");
}
