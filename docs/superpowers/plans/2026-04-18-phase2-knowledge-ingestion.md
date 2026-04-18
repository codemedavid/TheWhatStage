# Phase 2: Knowledge Ingestion Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the document processing pipeline that extracts text from uploaded files (PDF, DOCX, XLSX), chunks it semantically, embeds each chunk, and stores them in `knowledge_chunks` for RAG retrieval.

**Architecture:** Files are uploaded to Cloudinary, then processed async via Vercel `waitUntil()`. A type-detection step routes to the correct processor (PDF/DOCX/XLSX/FAQ/product), which extracts plain text. The chunking engine splits text into ~500-token segments with 50-token overlap. The existing `embedBatch()` from Phase 1 embeds chunks, which are stored in `knowledge_chunks`. Status polling lets the UI track progress.

**Tech Stack:** pdf-parse, mammoth, xlsx (SheetJS), Zod, Next.js App Router, Supabase, Vitest

---

## File Structure

```
src/lib/ai/
├── chunking.ts              # Semantic text splitter (~500 tokens, 50 overlap)
├── ingest.ts                # Orchestrator: detect type → extract → chunk → embed → store
├── processors/
│   ├── pdf.ts               # PDF → plain text (pdf-parse)
│   ├── docx.ts              # DOCX → plain text (mammoth)
│   ├── xlsx.ts              # XLSX → plain text rows (SheetJS)
│   ├── faq.ts               # FAQ Q+A pair → chunk (no splitting)
│   └── product.ts           # Product struct → natural text chunk

src/app/api/knowledge/
├── upload/route.ts          # Upload endpoint (async processing via waitUntil)
├── status/route.ts          # Processing status polling
└── faq/route.ts             # FAQ CRUD endpoint

tests/unit/
├── chunking.test.ts
├── processors/
│   ├── pdf.test.ts
│   ├── docx.test.ts
│   ├── xlsx.test.ts
│   ├── faq.test.ts
│   └── product.test.ts

tests/integration/
└── knowledge-upload.test.ts
```

---

## Task 0: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install processing libraries**

```bash
npm install pdf-parse mammoth xlsx
```

- [ ] **Step 2: Install type declarations**

```bash
npm install -D @types/pdf-parse
```

Note: `mammoth` ships its own types. `xlsx` (SheetJS) ships its own types.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse, mammoth, xlsx for document processing"
```

---

## Task 1: Chunking Engine

**Files:**
- Create: `src/lib/ai/chunking.ts`
- Create: `tests/unit/chunking.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/chunking.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/ai/chunking";

describe("chunkText", () => {
  it("returns the full text as one chunk when under the token limit", () => {
    const text = "This is a short paragraph about our services.";
    const chunks = chunkText(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple chunks with overlap", () => {
    // Generate text that's ~1500 words (well over 500 tokens)
    const sentences = Array.from(
      { length: 150 },
      (_, i) => `Sentence number ${i} describes an important fact about the product.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be under ~500 tokens (~2000 chars as rough estimate)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(3000);
    }
  });

  it("preserves overlap between consecutive chunks", () => {
    const sentences = Array.from(
      { length: 150 },
      (_, i) => `Unique sentence ${i} with specific content about topic ${i}.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    // Check overlap: the end of chunk N should appear at the start of chunk N+1
    for (let i = 0; i < chunks.length - 1; i++) {
      const endWords = chunks[i].split(/\s+/).slice(-10);
      const startOfNext = chunks[i + 1];
      // At least some overlap words should appear at the start of the next chunk
      const hasOverlap = endWords.some((word) => startOfNext.startsWith(word) || startOfNext.includes(word));
      expect(hasOverlap).toBe(true);
    }
  });

  it("splits on sentence boundaries when possible", () => {
    const sentences = Array.from(
      { length: 100 },
      (_, i) => `This is sentence ${i}. It has two parts.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    // Chunks should end at sentence boundaries (period followed by space or end)
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      expect(trimmed).toMatch(/[.!?]$/);
    }
  });

  it("returns empty array for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText("\n\n")).toEqual([]);
  });

  it("handles text with no sentence boundaries gracefully", () => {
    // Long text with no periods — should still chunk by word count
    const words = Array.from({ length: 800 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("accepts custom chunk size and overlap", () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `Sentence ${i} about the product.`
    );
    const text = sentences.join(" ");

    const smallChunks = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    const largeChunks = chunkText(text, { maxTokens: 1000, overlapTokens: 50 });

    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/chunking.test.ts
```

Expected: FAIL — `chunkText` not found.

- [ ] **Step 3: Implement the chunking engine**

Create `src/lib/ai/chunking.ts`:

```typescript
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
// Rough chars-per-token estimate for English text
const CHARS_PER_TOKEN = 4;

interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

/**
 * Split text into chunks of approximately `maxTokens` tokens each,
 * with `overlapTokens` tokens of overlap between consecutive chunks.
 * Splits on sentence boundaries when possible.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  // If text fits in one chunk, return as-is
  if (trimmed.length <= maxChars) return [trimmed];

  // Split into sentences
  const sentences = splitSentences(trimmed);
  if (sentences.length === 0) return [trimmed];

  const chunks: string[] = [];
  let currentChunk = "";
  let overlapBuffer: string[] = [];

  for (const sentence of sentences) {
    const candidate = currentChunk
      ? currentChunk + " " + sentence
      : sentence;

    if (candidate.length > maxChars && currentChunk) {
      // Flush current chunk
      chunks.push(currentChunk.trim());

      // Build overlap from recent sentences
      const overlapText = overlapBuffer.join(" ");
      if (overlapText.length > 0 && overlapText.length <= overlapChars) {
        currentChunk = overlapText + " " + sentence;
      } else {
        currentChunk = sentence;
      }
      overlapBuffer = [sentence];
    } else {
      currentChunk = candidate;
      overlapBuffer.push(sentence);
      // Keep overlap buffer roughly within overlap size
      while (
        overlapBuffer.length > 1 &&
        overlapBuffer.join(" ").length > overlapChars
      ) {
        overlapBuffer.shift();
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Split text into sentences. Handles common abbreviations
 * and avoids splitting on decimal numbers.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.filter((s) => s.trim().length > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/chunking.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chunking.ts tests/unit/chunking.test.ts
git commit -m "feat: add semantic text chunking engine with sentence-boundary splitting"
```

---

## Task 2: PDF Processor

**Files:**
- Create: `src/lib/ai/processors/pdf.ts`
- Create: `tests/unit/processors/pdf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/processors/pdf.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { extractPdfText } from "@/lib/ai/processors/pdf";

// Mock pdf-parse
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/processors/pdf.test.ts
```

Expected: FAIL — `extractPdfText` not found.

- [ ] **Step 3: Implement the PDF processor**

Create `src/lib/ai/processors/pdf.ts`:

```typescript
import pdfParse from "pdf-parse";

export interface PdfResult {
  text: string;
  pageCount: number;
}

/**
 * Extract plain text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/processors/pdf.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/pdf.ts tests/unit/processors/pdf.test.ts
git commit -m "feat: add PDF text extraction processor"
```

---

## Task 3: DOCX Processor

**Files:**
- Create: `src/lib/ai/processors/docx.ts`
- Create: `tests/unit/processors/docx.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/processors/docx.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { extractDocxText } from "@/lib/ai/processors/docx";

// Mock mammoth
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/processors/docx.test.ts
```

Expected: FAIL — `extractDocxText` not found.

- [ ] **Step 3: Implement the DOCX processor**

Create `src/lib/ai/processors/docx.ts`:

```typescript
import mammoth from "mammoth";

/**
 * Extract plain text from a DOCX buffer using mammoth.
 */
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/processors/docx.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/docx.ts tests/unit/processors/docx.test.ts
git commit -m "feat: add DOCX text extraction processor"
```

---

## Task 4: XLSX Processor

**Files:**
- Create: `src/lib/ai/processors/xlsx.ts`
- Create: `tests/unit/processors/xlsx.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/processors/xlsx.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";

// Mock xlsx
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

import * as XLSX from "xlsx";
const mockRead = vi.mocked(XLSX.read);
const mockSheetToJson = vi.mocked(XLSX.utils.sheet_to_json);

describe("extractXlsxText", () => {
  it("extracts rows from a single-sheet workbook", () => {
    mockRead.mockReturnValueOnce({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);

    mockSheetToJson.mockReturnValueOnce([
      { Name: "Widget A", Price: "$10", Description: "A blue widget" },
      { Name: "Widget B", Price: "$20", Description: "A red widget" },
    ]);

    const buffer = Buffer.from("fake-xlsx");
    const result = extractXlsxText(buffer);

    expect(result).toHaveLength(2);
    expect(result[0]).toContain("Widget A");
    expect(result[0]).toContain("$10");
    expect(result[1]).toContain("Widget B");
  });

  it("extracts rows from multiple sheets", () => {
    mockRead.mockReturnValueOnce({
      SheetNames: ["Products", "Pricing"],
      Sheets: { Products: {}, Pricing: {} },
    } as unknown as XLSX.WorkBook);

    mockSheetToJson
      .mockReturnValueOnce([{ Name: "Product 1" }])
      .mockReturnValueOnce([{ Tier: "Basic", Price: "$5" }]);

    const result = extractXlsxText(Buffer.from("fake"));

    expect(result).toHaveLength(2);
    expect(result[0]).toContain("Product 1");
    expect(result[1]).toContain("Basic");
  });

  it("skips empty rows", () => {
    mockRead.mockReturnValueOnce({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);

    mockSheetToJson.mockReturnValueOnce([
      { Name: "Product" },
      {}, // empty row
      { Name: "Another" },
    ]);

    const result = extractXlsxText(Buffer.from("fake"));
    expect(result).toHaveLength(2);
  });

  it("throws on empty workbook (no data rows)", () => {
    mockRead.mockReturnValueOnce({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);

    mockSheetToJson.mockReturnValueOnce([]);

    expect(() => extractXlsxText(Buffer.from("fake"))).toThrow(
      "No data rows found in Excel file"
    );
  });

  it("serializes each row as key-value pairs", () => {
    mockRead.mockReturnValueOnce({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);

    mockSheetToJson.mockReturnValueOnce([
      { Name: "Laptop", Price: 999, Specs: "16GB RAM" },
    ]);

    const result = extractXlsxText(Buffer.from("fake"));
    expect(result[0]).toBe("Name: Laptop\nPrice: 999\nSpecs: 16GB RAM");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/processors/xlsx.test.ts
```

Expected: FAIL — `extractXlsxText` not found.

- [ ] **Step 3: Implement the XLSX processor**

Create `src/lib/ai/processors/xlsx.ts`:

```typescript
import * as XLSX from "xlsx";

/**
 * Extract text from an Excel buffer. Each row becomes a separate text entry,
 * serialized as "Key: Value" pairs. Rows from all sheets are combined.
 */
export function extractXlsxText(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    for (const row of data) {
      const entries = Object.entries(row).filter(
        ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
      );
      if (entries.length === 0) continue;

      const text = entries.map(([k, v]) => `${k}: ${v}`).join("\n");
      rows.push(text);
    }
  }

  if (rows.length === 0) {
    throw new Error("No data rows found in Excel file");
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/processors/xlsx.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/xlsx.ts tests/unit/processors/xlsx.test.ts
git commit -m "feat: add Excel text extraction processor"
```

---

## Task 5: FAQ Processor

**Files:**
- Create: `src/lib/ai/processors/faq.ts`
- Create: `tests/unit/processors/faq.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/processors/faq.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatFaqChunk } from "@/lib/ai/processors/faq";

describe("formatFaqChunk", () => {
  it("formats a Q+A pair into a single chunk string", () => {
    const result = formatFaqChunk("What are your hours?", "We are open 9-5 Mon-Fri.");

    expect(result).toBe("Q: What are your hours?\nA: We are open 9-5 Mon-Fri.");
  });

  it("trims whitespace from question and answer", () => {
    const result = formatFaqChunk("  Where are you?  ", "  123 Main St  ");

    expect(result).toBe("Q: Where are you?\nA: 123 Main St");
  });

  it("throws if question is empty", () => {
    expect(() => formatFaqChunk("", "Some answer")).toThrow(
      "FAQ question cannot be empty"
    );
  });

  it("throws if answer is empty", () => {
    expect(() => formatFaqChunk("Some question", "  ")).toThrow(
      "FAQ answer cannot be empty"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/processors/faq.test.ts
```

Expected: FAIL — `formatFaqChunk` not found.

- [ ] **Step 3: Implement the FAQ processor**

Create `src/lib/ai/processors/faq.ts`:

```typescript
/**
 * Format a FAQ question-answer pair into a single chunk string.
 * FAQ chunks are stored as-is — no splitting needed.
 */
export function formatFaqChunk(question: string, answer: string): string {
  const q = question.trim();
  const a = answer.trim();

  if (!q) throw new Error("FAQ question cannot be empty");
  if (!a) throw new Error("FAQ answer cannot be empty");

  return `Q: ${q}\nA: ${a}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/processors/faq.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/faq.ts tests/unit/processors/faq.test.ts
git commit -m "feat: add FAQ pair formatter for knowledge chunks"
```

---

## Task 6: Product Serializer

**Files:**
- Create: `src/lib/ai/processors/product.ts`
- Create: `tests/unit/processors/product.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/processors/product.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeProduct } from "@/lib/ai/processors/product";

describe("serializeProduct", () => {
  it("serializes a full product into natural text", () => {
    const result = serializeProduct({
      name: "Premium Widget",
      price: 49.99,
      description: "A high-quality widget for professionals.",
      specs: { color: "Blue", weight: "200g" },
    });

    expect(result).toContain("Premium Widget");
    expect(result).toContain("49.99");
    expect(result).toContain("high-quality widget");
    expect(result).toContain("Blue");
    expect(result).toContain("200g");
  });

  it("handles product with only name and price", () => {
    const result = serializeProduct({
      name: "Basic Item",
      price: 10,
    });

    expect(result).toContain("Basic Item");
    expect(result).toContain("10");
    expect(result).not.toContain("undefined");
  });

  it("includes category when provided", () => {
    const result = serializeProduct({
      name: "Shoes",
      price: 80,
      category: "Footwear",
    });

    expect(result).toContain("Footwear");
  });

  it("serializes specs as key-value pairs", () => {
    const result = serializeProduct({
      name: "Gadget",
      price: 25,
      specs: { battery: "5000mAh", screen: "6.5 inch" },
    });

    expect(result).toContain("battery: 5000mAh");
    expect(result).toContain("screen: 6.5 inch");
  });

  it("throws if name is empty", () => {
    expect(() => serializeProduct({ name: "", price: 10 })).toThrow(
      "Product name is required"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/processors/product.test.ts
```

Expected: FAIL — `serializeProduct` not found.

- [ ] **Step 3: Implement the product serializer**

Create `src/lib/ai/processors/product.ts`:

```typescript
export interface ProductInput {
  name: string;
  price: number;
  description?: string;
  category?: string;
  specs?: Record<string, string>;
}

/**
 * Serialize a product into natural text for embedding.
 * Each product becomes a single chunk in the Product KB.
 */
export function serializeProduct(product: ProductInput): string {
  const { name, price, description, category, specs } = product;

  if (!name.trim()) throw new Error("Product name is required");

  const lines: string[] = [];
  lines.push(`Product: ${name.trim()}`);
  lines.push(`Price: ${price}`);

  if (category) {
    lines.push(`Category: ${category.trim()}`);
  }

  if (description) {
    lines.push(`Description: ${description.trim()}`);
  }

  if (specs && Object.keys(specs).length > 0) {
    lines.push("Specifications:");
    for (const [key, value] of Object.entries(specs)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/processors/product.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/product.ts tests/unit/processors/product.test.ts
git commit -m "feat: add product-to-text serializer for product KB chunks"
```

---

## Task 7: Ingest Orchestrator

**Files:**
- Create: `src/lib/ai/ingest.ts`
- Reads: `src/lib/ai/chunking.ts`, `src/lib/ai/embedding.ts`, `src/lib/ai/processors/*.ts`, `src/lib/supabase/service.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ingest.test.ts`:

```typescript
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
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedBatch: vi.fn(),
}));

const mockInsert = vi.fn().mockReturnValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ error: null }),
});
const mockDelete = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ error: null }),
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_chunks") {
        return { insert: mockInsert, delete: mockDelete };
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
  };

  it("processes a PDF: extract → chunk → embed → store", async () => {
    mockExtractPdf.mockResolvedValueOnce({ text: "PDF content here.", pageCount: 1 });
    mockChunk.mockReturnValueOnce(["PDF content here."]);
    mockEmbedBatch.mockResolvedValueOnce([Array(1536).fill(0.1)]);

    await ingestDocument({
      ...baseParams,
      type: "pdf",
      buffer: Buffer.from("fake-pdf"),
    });

    expect(mockExtractPdf).toHaveBeenCalledOnce();
    expect(mockChunk).toHaveBeenCalledWith("PDF content here.");
    expect(mockEmbedBatch).toHaveBeenCalledWith(["PDF content here."]);
    expect(mockInsert).toHaveBeenCalledOnce();
    // Should update doc status to 'ready'
    expect(mockUpdate).toHaveBeenCalledWith({ status: "ready", metadata: { page_count: 1 } });
  });

  it("processes a DOCX: extract → chunk → embed → store", async () => {
    mockExtractDocx.mockResolvedValueOnce("DOCX paragraph one. Paragraph two.");
    mockChunk.mockReturnValueOnce(["DOCX paragraph one.", "Paragraph two."]);
    mockEmbedBatch.mockResolvedValueOnce([
      Array(1536).fill(0.1),
      Array(1536).fill(0.2),
    ]);

    await ingestDocument({
      ...baseParams,
      type: "docx",
      buffer: Buffer.from("fake-docx"),
    });

    expect(mockExtractDocx).toHaveBeenCalledOnce();
    expect(mockChunk).toHaveBeenCalledWith("DOCX paragraph one. Paragraph two.");
    expect(mockInsert).toHaveBeenCalledOnce();
    // 2 chunks inserted
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
  });

  it("processes XLSX: each row becomes a chunk (no splitting)", async () => {
    mockExtractXlsx.mockReturnValueOnce([
      "Name: Widget\nPrice: 10",
      "Name: Gadget\nPrice: 20",
    ]);
    mockEmbedBatch.mockResolvedValueOnce([
      Array(1536).fill(0.1),
      Array(1536).fill(0.2),
    ]);

    await ingestDocument({
      ...baseParams,
      type: "xlsx",
      buffer: Buffer.from("fake-xlsx"),
    });

    expect(mockExtractXlsx).toHaveBeenCalledOnce();
    // XLSX rows go directly to embedding, no chunkText call
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/ingest.test.ts
```

Expected: FAIL — `ingestDocument` not found.

- [ ] **Step 3: Implement the ingest orchestrator**

Create `src/lib/ai/ingest.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { chunkText } from "@/lib/ai/chunking";
import { embedBatch } from "@/lib/ai/embedding";
import { extractPdfText } from "@/lib/ai/processors/pdf";
import { extractDocxText } from "@/lib/ai/processors/docx";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";

export interface IngestParams {
  docId: string;
  tenantId: string;
  type: "pdf" | "docx" | "xlsx";
  kbType: "general" | "product";
  buffer: Buffer;
}

/**
 * Orchestrate document ingestion: detect type → extract text → chunk → embed → store.
 * On success, sets knowledge_docs.status = 'ready'.
 * On failure, sets knowledge_docs.status = 'error' with error message in metadata.
 */
export async function ingestDocument(params: IngestParams): Promise<void> {
  const { docId, tenantId, type, kbType, buffer } = params;
  const supabase = createServiceClient();

  try {
    let texts: string[];
    let docMetadata: Record<string, unknown> = {};

    switch (type) {
      case "pdf": {
        const result = await extractPdfText(buffer);
        texts = chunkText(result.text);
        docMetadata = { page_count: result.pageCount };
        break;
      }
      case "docx": {
        const text = await extractDocxText(buffer);
        texts = chunkText(text);
        break;
      }
      case "xlsx": {
        // Each row is already a natural chunk — no splitting needed
        texts = extractXlsxText(buffer);
        break;
      }
      default:
        throw new Error(`Unsupported document type: ${type}`);
    }

    // Embed all chunks
    const embeddings = await embedBatch(texts);

    // Store chunks
    const chunkRows = texts.map((content, i) => ({
      doc_id: docId,
      tenant_id: tenantId,
      content,
      kb_type: kbType,
      embedding: embeddings[i],
      metadata: {},
    }));

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRows);

    if (insertError) {
      throw new Error(`Failed to store chunks: ${insertError.message}`);
    }

    // Mark doc as ready
    await supabase
      .from("knowledge_docs")
      .update({ status: "ready", metadata: docMetadata })
      .eq("id", docId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Don't swallow unsupported type errors — re-throw them
    if (message.startsWith("Unsupported document type")) throw err;

    // Mark doc as errored
    await supabase
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: message } })
      .eq("id", docId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/ingest.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ingest.ts tests/unit/ingest.test.ts
git commit -m "feat: add document ingest orchestrator (detect → extract → chunk → embed → store)"
```

---

## Task 8: Upload API Endpoint

**Files:**
- Create: `src/app/api/knowledge/upload/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/knowledge-upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Next.js server-side imports
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_docs") {
        return {
          insert: mockInsert,
          select: mockSelect,
        };
      }
      return {};
    }),
  })),
}));

vi.mock("@/lib/ai/ingest", () => ({
  ingestDocument: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Import the route handler after mocks are set up
import { POST } from "@/app/api/knowledge/upload/route";

describe("POST /api/knowledge/upload", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const formData = new FormData();
    formData.append("title", "Test Doc");
    formData.append("type", "pdf");
    formData.append("file", new Blob(["fake"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const formData = new FormData();
    // Missing title and type
    formData.append("file", new Blob(["fake"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 201 with docId and kicks off async processing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "doc-123" },
          error: null,
        }),
      }),
    });

    const formData = new FormData();
    formData.append("title", "Test PDF");
    formData.append("type", "pdf");
    formData.append("file", new Blob(["fake-pdf-content"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.docId).toBe("doc-123");
    expect(body.status).toBe("processing");
  });

  it("returns 400 for unsupported file type", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const formData = new FormData();
    formData.append("title", "Test");
    formData.append("type", "txt");
    formData.append("file", new Blob(["data"]), "test.txt");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/integration/knowledge-upload.test.ts
```

Expected: FAIL — route handler not found.

- [ ] **Step 3: Implement the upload route**

Create `src/app/api/knowledge/upload/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const ALLOWED_TYPES = ["pdf", "docx", "xlsx"] as const;

const schema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(ALLOWED_TYPES),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Parse form data
  const formData = await request.formData();
  const title = formData.get("title") as string | null;
  const type = formData.get("type") as string | null;
  const file = formData.get("file") as File | null;

  const parsed = schema.safeParse({ title, type });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  // 3. Create knowledge_docs record with status = 'processing'
  const service = createServiceClient();
  const { data: doc, error: insertError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      type: parsed.data.type,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return NextResponse.json(
      { error: "Failed to create document record" },
      { status: 500 }
    );
  }

  // 4. Kick off async processing (non-blocking)
  const buffer = Buffer.from(await file.arrayBuffer());

  // Use waitUntil if available (Vercel runtime), otherwise fire-and-forget
  const processPromise = ingestDocument({
    docId: doc.id,
    tenantId,
    type: parsed.data.type,
    kbType: "general",
    buffer,
  });

  // @ts-expect-error — waitUntil exists on Vercel runtime but not in Node types
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error
    globalThis.waitUntil(processPromise);
  } else {
    // Development: fire-and-forget with error logging
    processPromise.catch((err) =>
      console.error("Document processing failed:", err)
    );
  }

  return NextResponse.json(
    { docId: doc.id, status: "processing" },
    { status: 201 }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/integration/knowledge-upload.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/knowledge/upload/route.ts tests/integration/knowledge-upload.test.ts
git commit -m "feat: add knowledge upload API endpoint with async processing"
```

---

## Task 9: Status Polling Endpoint

**Files:**
- Create: `src/app/api/knowledge/status/route.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/knowledge-upload.test.ts` (append new describe block):

```typescript
// At the top, add this import alongside the existing POST import:
// import { POST, GET } from ... — but status is a separate route, so:
// Create a separate test or mock the status route.
```

Actually, create a separate test file `tests/unit/knowledge-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockSingle = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
      }),
    })),
  })),
}));

beforeEach(() => vi.clearAllMocks());

import { GET } from "@/app/api/knowledge/status/route";

describe("GET /api/knowledge/status", () => {
  it("returns 401 if not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/status?docId=123");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 if docId is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const request = new Request("http://localhost/api/knowledge/status");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("returns document status", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({
      data: { id: "doc-1", status: "ready", metadata: { page_count: 5 } },
      error: null,
    });

    const request = new Request("http://localhost/api/knowledge/status?docId=doc-1");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.metadata.page_count).toBe(5);
  });

  it("returns 404 if document not found", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    const request = new Request("http://localhost/api/knowledge/status?docId=nonexistent");
    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/knowledge-status.test.ts
```

Expected: FAIL — route handler not found.

- [ ] **Step 3: Implement the status endpoint**

Create `src/app/api/knowledge/status/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Get docId from query params
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");

  if (!docId) {
    return NextResponse.json({ error: "docId is required" }, { status: 400 });
  }

  // 3. Fetch document status (scoped to tenant)
  const service = createServiceClient();
  const { data: doc, error } = await service
    .from("knowledge_docs")
    .select("id, status, metadata")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    docId: doc.id,
    status: doc.status,
    metadata: doc.metadata,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/knowledge-status.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/knowledge/status/route.ts tests/unit/knowledge-status.test.ts
git commit -m "feat: add knowledge document status polling endpoint"
```

---

## Task 10: FAQ CRUD Endpoint

**Files:**
- Create: `src/app/api/knowledge/faq/route.ts`
- Create: `tests/unit/knowledge-faq.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/knowledge-faq.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_docs") {
        return {
          insert: mockInsert,
          select: mockSelect,
          delete: mockDelete,
        };
      }
      if (table === "knowledge_chunks") {
        return { insert: mockInsert };
      }
      return {};
    }),
  })),
}));

vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

beforeEach(() => vi.clearAllMocks());

import { POST } from "@/app/api/knowledge/faq/route";

describe("POST /api/knowledge/faq", () => {
  const authedUser = {
    data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
    error: null,
  };

  it("returns 401 if not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Q?", answer: "A." }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 if question or answer is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Q?" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates a FAQ doc + chunk and returns 201", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    // knowledge_docs insert
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "faq-doc-1" },
          error: null,
        }),
      }),
    });
    // knowledge_chunks insert
    mockInsert.mockReturnValueOnce({ error: null });

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What time?", answer: "9 to 5." }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.docId).toBe("faq-doc-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/knowledge-faq.test.ts
```

Expected: FAIL — route handler not found.

- [ ] **Step 3: Implement the FAQ CRUD route**

Create `src/app/api/knowledge/faq/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { formatFaqChunk } from "@/lib/ai/processors/faq";
import { embedText } from "@/lib/ai/embedding";

const createSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // 2. Validate input
  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { question, answer } = parsed.data;
  const service = createServiceClient();

  // 3. Create knowledge_docs record (type = faq)
  const { data: doc, error: docError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: question,
      type: "faq",
      content: `${question}\n---\n${answer}`,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (docError || !doc) {
    return NextResponse.json(
      { error: "Failed to create FAQ" },
      { status: 500 }
    );
  }

  // 4. Format, embed, and store the chunk
  const chunkContent = formatFaqChunk(question, answer);
  const embedding = await embedText(chunkContent);

  const { error: chunkError } = await service
    .from("knowledge_chunks")
    .insert({
      doc_id: doc.id,
      tenant_id: tenantId,
      content: chunkContent,
      kb_type: "general",
      embedding,
      metadata: {},
    });

  if (chunkError) {
    // Mark doc as errored
    await service
      .from("knowledge_docs")
      .update({ status: "error", metadata: { error: chunkError.message } })
      .eq("id", doc.id);

    return NextResponse.json(
      { error: "Failed to store FAQ chunk" },
      { status: 500 }
    );
  }

  // 5. Mark as ready
  await service
    .from("knowledge_docs")
    .update({ status: "ready", metadata: {} })
    .eq("id", doc.id);

  return NextResponse.json({ docId: doc.id }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/knowledge-faq.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/knowledge/faq/route.ts tests/unit/knowledge-faq.test.ts
git commit -m "feat: add FAQ CRUD endpoint with inline embedding"
```

---

## Task 11: Product-to-Chunk Sync Hook

**Files:**
- Create: `src/lib/ai/sync-product.ts`
- Create: `tests/unit/sync-product.test.ts`

This hook will be called from the product CRUD API routes (which may not exist yet). It's a standalone function that can be imported and called on product create/update/delete.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/sync-product.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProductChunk } from "@/lib/ai/sync-product";

vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "doc-1" }, error: null }),
  }),
});
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ error: null }),
});
const mockUpsert = vi.fn().mockReturnValue({ error: null });
const mockDeleteChunks = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ error: null }),
});
const mockDeleteDocs = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ error: null }),
  }),
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_docs") {
        return { insert: mockInsert, update: mockUpdate, delete: mockDeleteDocs };
      }
      if (table === "knowledge_chunks") {
        return { upsert: mockUpsert, delete: mockDeleteChunks };
      }
      return {};
    }),
  })),
}));

beforeEach(() => vi.clearAllMocks());

describe("syncProductChunk", () => {
  it("creates a doc and chunk for a new product (upsert)", async () => {
    await syncProductChunk({
      tenantId: "t-1",
      productId: "prod-1",
      product: { name: "Widget", price: 25, description: "A great widget" },
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("deletes the doc (cascades to chunks) on product delete", async () => {
    await syncProductChunk({
      tenantId: "t-1",
      productId: "prod-1",
      product: null, // null = delete
    });

    expect(mockDeleteDocs).toHaveBeenCalledOnce();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/sync-product.test.ts
```

Expected: FAIL — `syncProductChunk` not found.

- [ ] **Step 3: Implement the sync hook**

Create `src/lib/ai/sync-product.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/ai/embedding";
import { serializeProduct, type ProductInput } from "@/lib/ai/processors/product";

interface SyncParams {
  tenantId: string;
  productId: string;
  /** Pass null to delete the product's knowledge entry */
  product: ProductInput | null;
}

/**
 * Sync a product to the knowledge base.
 * - On create/update: upsert knowledge_docs (type=product) + knowledge_chunks
 * - On delete (product=null): delete the doc (chunks cascade via FK)
 */
export async function syncProductChunk(params: SyncParams): Promise<void> {
  const { tenantId, productId, product } = params;
  const supabase = createServiceClient();

  if (!product) {
    // Delete: remove knowledge_docs where metadata.product_id matches
    await supabase
      .from("knowledge_docs")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("metadata->>product_id", productId);
    return;
  }

  // Serialize and embed
  const text = serializeProduct(product);
  const embedding = await embedText(text);

  // Upsert knowledge_docs record for this product
  const { data: doc, error: docError } = await supabase
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: product.name,
      type: "product",
      content: text,
      status: "ready",
      metadata: { product_id: productId },
    })
    .select("id")
    .single();

  if (docError || !doc) return;

  // Upsert the single chunk
  await supabase.from("knowledge_chunks").upsert({
    doc_id: doc.id,
    tenant_id: tenantId,
    content: text,
    kb_type: "product",
    embedding,
    metadata: { product_id: productId },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/sync-product.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/sync-product.ts tests/unit/sync-product.test.ts
git commit -m "feat: add product-to-chunk sync hook for product KB"
```

---

## Task 12: Run All Tests & Final Verification

- [ ] **Step 1: Run all Phase 2 tests together**

```bash
npm test -- tests/unit/chunking.test.ts tests/unit/processors/ tests/unit/ingest.test.ts tests/unit/knowledge-status.test.ts tests/unit/knowledge-faq.test.ts tests/unit/sync-product.test.ts tests/integration/knowledge-upload.test.ts
```

Expected: All tests PASS.

- [ ] **Step 2: Run the full test suite to ensure no regressions**

```bash
npm test
```

Expected: All existing Phase 1 tests + new Phase 2 tests PASS.

- [ ] **Step 3: Run type checking**

```bash
npm run typecheck
```

Expected: No type errors.

- [ ] **Step 4: Run linting**

```bash
npm run lint
```

Expected: No lint errors.

- [ ] **Step 5: Update AI_PLAN.md — mark Phase 2 tasks as complete**

In `AI_PLAN.md`, change all Phase 2 checkboxes from `- [ ]` to `- [x]`.

- [ ] **Step 6: Commit**

```bash
git add AI_PLAN.md
git commit -m "docs: mark Phase 2 knowledge ingestion tasks as complete"
```
