// Wrapper to handle pdf-parse's CJS-only export in our ESM codebase.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export async function parsePdf(
  buffer: Buffer
): Promise<{ text: string; numpages: number }> {
  return pdfParse(buffer);
}
