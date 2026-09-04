"use client";

import * as XLSX from "xlsx";

/** Client-side .xlsx export — a real spreadsheet file, not a CSV mislabeled
 * with an .xlsx extension. `rows` must already be plain, display-ready
 * values (formatted strings/numbers) since this writes exactly what's
 * passed. */
export function exportRowsToXlsx(filename: string, sheetName: string, rows: Record<string, string | number>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
