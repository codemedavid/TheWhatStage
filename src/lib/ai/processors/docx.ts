import mammoth from "mammoth";

export async function extractDocxText(buffer: Buffer): Promise<string> {
  let result;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`DOCX extraction failed: ${message}`);
  }

  const text = result.value.trim();
  if (!text) {
    throw new Error("No text content extracted from DOCX");
  }

  return text;
}
