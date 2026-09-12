"use client";

/** Client-side .xlsx export — a real spreadsheet file, not a CSV mislabeled
 * with an .xlsx extension. `rows` must already be plain, display-ready
 * values (formatted strings/numbers) since this writes exactly what's
 * passed.
 *
 * Built on exceljs rather than the `xlsx` package, which carries an
 * unpatched prototype-pollution and ReDoS advisory with no upstream fix on
 * npm. Only the write path was ever used here, so neither was reachable —
 * but a dependency with no route to a fix is a liability regardless.
 *
 * exceljs is imported dynamically: it is large, and nobody should pay for it
 * on first paint to have an export button available. */
export async function exportRowsToXlsx(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number>[],
): Promise<void> {
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Column order comes from the first row, matching how the old json_to_sheet
  // call behaved — the callers build rows in display order deliberately.
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet.columns = columns.map((key) => ({ header: key, key }));
  worksheet.addRows(rows);
  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
