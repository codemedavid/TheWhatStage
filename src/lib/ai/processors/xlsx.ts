import * as XLSX from "xlsx";

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
