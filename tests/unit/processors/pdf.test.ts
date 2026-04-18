import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractPdfText } from "@/lib/ai/processors/pdf";

vi.mock("@/lib/ai/processors/pdf-parse-wrapper", () => ({
  parsePdf: vi.fn(),
}));

import { parsePdf } from "@/lib/ai/processors/pdf-parse-wrapper";
const mockParsePdf = vi.mocked(parsePdf);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractPdfText", () => {
  it("extracts text from a PDF buffer", async () => {
    mockParsePdf.mockResolvedValueOnce({
      text: "Page 1 content.\n\nPage 2 content.",
      numpages: 2,
    });

    const buffer = Buffer.from("fake-pdf-data");
    const result = await extractPdfText(buffer);

    expect(result.text).toBe("Page 1 content.\n\nPage 2 content.");
    expect(result.pageCount).toBe(2);
    expect(mockParsePdf).toHaveBeenCalledWith(buffer);
  });

  it("trims whitespace from extracted text", async () => {
    mockParsePdf.mockResolvedValueOnce({
      text: "  \n  Some content with extra whitespace  \n\n  ",
      numpages: 1,
    });

    const result = await extractPdfText(Buffer.from("fake"));
    expect(result.text).toBe("Some content with extra whitespace");
  });

  it("throws on empty PDF (no text extracted)", async () => {
    mockParsePdf.mockResolvedValueOnce({
      text: "   ",
      numpages: 1,
    });

    await expect(extractPdfText(Buffer.from("fake"))).rejects.toThrow(
      "No text content extracted from PDF"
    );
  });

  it("throws on pdf-parse failure", async () => {
    mockParsePdf.mockRejectedValueOnce(new Error("Invalid PDF"));

    await expect(extractPdfText(Buffer.from("bad"))).rejects.toThrow(
      "PDF extraction failed: Invalid PDF"
    );
  });
});
