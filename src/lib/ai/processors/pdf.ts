import { parsePdf } from "./pdf-parse-wrapper";

export interface PdfResult {
  text: string;
  pageCount: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  let parsed;
  try {
    parsed = await parsePdf(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF extraction failed: ${message}`);
  }

  const text = parsed.text.trim();
  if (!text) {
    throw new Error("No text content extracted from PDF");
  }

  return { text, pageCount: parsed.numpages };
}
