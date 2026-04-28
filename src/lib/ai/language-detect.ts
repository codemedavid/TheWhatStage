const TAGALOG_MARKERS = [
  "ang", "ng", "sa", "po", "opo", "yung", "iyong", "ba", "kasi", "para",
  "pala", "naman", "lang", "talaga", "sana", "pwede", "puwede", "ako",
  "ikaw", "kayo", "tayo", "sila", "ito", "iyan", "magkano", "ilan",
  "saan", "kailan", "anong", "paano", "bakit",
];
const ENGLISH_STOPWORDS = [
  "the", "is", "are", "was", "were", "and", "or", "but", "to", "of", "in",
  "on", "at", "for", "with", "by", "from", "this", "that", "do", "does",
  "small", "size",
];

export type Language = "en" | "tl" | "taglish" | "other";

export function detectLanguage(text: string): Language {
  const cleaned = text.toLowerCase().trim();
  if (cleaned.length < 4) return "other";
  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 2) return "other";

  const tlHits = tokens.filter((t) => TAGALOG_MARKERS.includes(t)).length;
  const enHits = tokens.filter((t) => ENGLISH_STOPWORDS.includes(t)).length;

  if (tlHits >= 2 && enHits >= 2) return "taglish";
  if (tlHits > enHits) return "tl";
  if (enHits > tlHits) return "en";
  return "other";
}
