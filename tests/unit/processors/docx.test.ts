import { describe, it, expect, vi } from "vitest";
import { extractDocxText } from "@/lib/ai/processors/docx";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

import mammoth from "mammoth";
const mockExtract = vi.mocked(mammoth.extractRawText);

describe("extractDocxText", () => {
  it("extracts text from a DOCX buffer", async () => {
    mockExtract.mockResolvedValueOnce({
      value: "Heading\n\nParagraph one.\n\nParagraph two.",
      messages: [],
    });

    const buffer = Buffer.from("fake-docx");
    const result = await extractDocxText(buffer);

    expect(result).toBe("Heading\n\nParagraph one.\n\nParagraph two.");
    expect(mockExtract).toHaveBeenCalledWith({ buffer });
  });

  it("trims whitespace from extracted text", async () => {
    mockExtract.mockResolvedValueOnce({
      value: "  Content here  \n ",
      messages: [],
    });

    const result = await extractDocxText(Buffer.from("fake"));
    expect(result).toBe("Content here");
  });

  it("throws on empty DOCX", async () => {
    mockExtract.mockResolvedValueOnce({
      value: "   ",
      messages: [],
    });

    await expect(extractDocxText(Buffer.from("fake"))).rejects.toThrow(
      "No text content extracted from DOCX"
    );
  });

  it("throws on mammoth failure", async () => {
    mockExtract.mockRejectedValueOnce(new Error("Corrupt file"));

    await expect(extractDocxText(Buffer.from("bad"))).rejects.toThrow(
      "DOCX extraction failed: Corrupt file"
    );
  });
});
