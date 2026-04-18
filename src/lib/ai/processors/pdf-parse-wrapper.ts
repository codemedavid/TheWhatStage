// Wrapper to handle pdf-parse's CJS-only export in our ESM codebase.
// When loaded as a serverExternalPackage, require() may return the module
// wrapper object rather than the function directly — handle both cases.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require("pdf-parse");
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
  typeof mod === "function" ? mod : (mod.default ?? mod);

export async function parsePdf(
  buffer: Buffer
): Promise<{ text: string; numpages: number }> {
  if (typeof pdfParse !== "function") {
    throw new Error("pdf-parse failed to load — check serverExternalPackages config");
  }
  return pdfParse(buffer);
}
