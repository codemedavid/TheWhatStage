import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestDocument } from "@/lib/ai/ingest";

// Mock all dependencies
vi.mock("@/lib/ai/processors/pdf", () => ({
  extractPdfText: vi.fn(),
}));
vi.mock("@/lib/ai/processors/docx", () => ({
  extractDocxText: vi.fn(),
}));
vi.mock("@/lib/ai/processors/xlsx", () => ({
  extractXlsxText: vi.fn(),
}));
vi.mock("@/lib/ai/chunking", () => ({
  chunkText: vi.fn(),
  chunkFaqAtomic: vi.fn(),
}));
vi.mock("@/lib/ai/language-detect", () => ({
  detectLanguage: vi.fn(() => "en"),
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedBatch: vi.fn(),
}));

const mockInsert = vi.fn().mockReturnValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ error: null }),
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_chunks") {
        return { insert: mockInsert };
      }
      if (table === "knowledge_docs") {
        return { update: mockUpdate };
      }
      return {};
    }),
  })),
}));

import { extractPdfText } from "@/lib/ai/processors/pdf";
import { extractDocxText } from "@/lib/ai/processors/docx";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";
import { chunkText } from "@/lib/ai/chunking";
import { embedBatch } from "@/lib/ai/embedding";

const mockExtractPdf = vi.mocked(extractPdfText);
const mockExtractDocx = vi.mocked(extractDocxText);
const mockExtractXlsx = vi.mocked(extractXlsxText);
const mockChunk = vi.mocked(chunkText);
const mockEmbedBatch = vi.mocked(embedBatch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestDocument", () => {
  const baseParams = {
    docId: "doc-1",
    tenantId: "tenant-1",
    kbType: "general" as const,
    docTitle: "Test Document",
  };

  it("processes a PDF: extract → chunk → embed → store", async () => {
    mockExtractPdf.mockResolvedValueOnce({ text: "PDF content here.", pageCount: 1 });
    mockChunk.mockReturnValueOnce(["PDF content here."]);
    mockEmbedBatch.mockResolvedValueOnce([Array(1024).fill(0.1)]);

    await ingestDocument({
      ...baseParams,
      type: "pdf",
      buffer: Buffer.from("fake-pdf"),
    });

    expect(mockExtractPdf).toHaveBeenCalledOnce();
    expect(mockChunk).toHaveBeenCalledWith("PDF content here.");
    expect(mockEmbedBatch).toHaveBeenCalledWith(["PDF content here."]);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith({ status: "ready", metadata: { doc_title: "Test Document", page_count: 1 } });
  });

  it("processes a DOCX: extract → chunk → embed → store", async () => {
    mockExtractDocx.mockResolvedValueOnce("DOCX paragraph one. Paragraph two.");
    mockChunk.mockReturnValueOnce(["DOCX paragraph one.", "Paragraph two."]);
    mockEmbedBatch.mockResolvedValueOnce([
      Array(1024).fill(0.1),
      Array(1024).fill(0.2),
    ]);

    await ingestDocument({
      ...baseParams,
      type: "docx",
      buffer: Buffer.from("fake-docx"),
    });

    expect(mockExtractDocx).toHaveBeenCalledOnce();
    expect(mockChunk).toHaveBeenCalledWith("DOCX paragraph one. Paragraph two.");
    expect(mockInsert).toHaveBeenCalledOnce();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
  });

  it("processes XLSX: each row becomes a chunk (no splitting)", async () => {
    mockExtractXlsx.mockReturnValueOnce([
      "Name: Widget\nPrice: 10",
      "Name: Gadget\nPrice: 20",
    ]);
    mockEmbedBatch.mockResolvedValueOnce([
      Array(1024).fill(0.1),
      Array(1024).fill(0.2),
    ]);

    await ingestDocument({
      ...baseParams,
      type: "xlsx",
      buffer: Buffer.from("fake-xlsx"),
    });

    expect(mockExtractXlsx).toHaveBeenCalledOnce();
    expect(mockChunk).not.toHaveBeenCalled();
    expect(mockEmbedBatch).toHaveBeenCalledWith([
      "Name: Widget\nPrice: 10",
      "Name: Gadget\nPrice: 20",
    ]);
  });

  it("sets doc status to 'error' on processing failure", async () => {
    mockExtractPdf.mockRejectedValueOnce(new Error("Corrupt PDF"));

    await ingestDocument({
      ...baseParams,
      type: "pdf",
      buffer: Buffer.from("bad-pdf"),
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      status: "error",
      metadata: { error: "Corrupt PDF" },
    });
  });

  it("throws for unsupported document type", async () => {
    await expect(
      ingestDocument({
        ...baseParams,
        type: "unknown" as "pdf",
        buffer: Buffer.from("data"),
      })
    ).rejects.toThrow("Unsupported document type: unknown");
  });
});
