import { describe, it, expect, vi } from "vitest";
import { extractXlsxText } from "@/lib/ai/processors/xlsx";

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
      {},
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
