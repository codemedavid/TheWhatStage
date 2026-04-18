export function formatFaqChunk(question: string, answer: string): string {
  const q = question.trim();
  const a = answer.trim();

  if (!q) throw new Error("FAQ question cannot be empty");
  if (!a) throw new Error("FAQ answer cannot be empty");

  return `Q: ${q}\nA: ${a}`;
}
