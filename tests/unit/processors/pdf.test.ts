import { describe, it, expect, vi } from "vitest";
import { extractPdfText } from "@/lib/ai/processors/pdf";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";
const mockPdfParse = vi.mocked(pdfParse);

describe("extractPdfText", () => {
  it("extracts text from a PDF buffer", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "Page 1 content.\n\nPage 2 content.",
      numpages: 2,
      numrender: 2,
      info: {},
      metadata: null,
      version: "1.0",
    });

    const buffer = Buffer.from("fake-pdf-data");
    const result = await extractPdfText(buffer);

    expect(result.text).toBe("Page 1 content.\n\nPage 2 content.");
    expect(result.pageCount).toBe(2);
    expect(mockPdfParse).toHaveBeenCalledWith(buffer);
  });

  it("trims whitespace from extracted text", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "  \n  Some content with extra whitespace  \n\n  ",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: "1.0",
    });

    const result = await extractPdfText(Buffer.from("fake"));
    expect(result.text).toBe("Some content with extra whitespace");
  });

  it("throws on empty PDF (no text extracted)", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "   ",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: "1.0",
    });

    await expect(extractPdfText(Buffer.from("fake"))).rejects.toThrow(
      "No text content extracted from PDF"
    );
  });

  it("throws on pdf-parse failure", async () => {
    mockPdfParse.mockRejectedValueOnce(new Error("Invalid PDF"));

    await expect(extractPdfText(Buffer.from("bad"))).rejects.toThrow(
      "PDF extraction failed: Invalid PDF"
    );
  });
});
