export type ExcelSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

const AMP = "\u0026amp;";
const LT = "\u0026lt;";
const GT = "\u0026gt;";
const QUOT = "\u0026quot;";

function xmlEscape(value: string): string {
  return value.replace(/&/g, AMP).replace(/</g, LT).replace(/>/g, GT).replace(/"/g, QUOT);
}

function cellXml(value: string | number, style?: string): string {
  const styleAttr = style ? ` ss:StyleID="${style}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell${styleAttr}><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell${styleAttr}><Data ss:Type="String">${xmlEscape(String(value ?? ""))}</Data></Cell>`;
}

export function toSpreadsheetXml(sheets: ExcelSheet[]): string {
  const worksheets = sheets
    .map((sheet) => {
      const header = `<Row>${sheet.headers.map((h) => cellXml(h, "header")).join("")}</Row>`;
      const body = sheet.rows
        .map((row) => `<Row>${row.map((c) => cellXml(c)).join("")}</Row>`)
        .join("");
      const colCount = Math.max(sheet.headers.length, 1);
      const cols = Array.from({ length: colCount }, () => `<Column ss:AutoFitWidth="1" ss:Width="90"/>`).join(
        "",
      );
      return `<Worksheet ss:Name="${xmlEscape(sheet.name.slice(0, 31))}"><Table>${cols}${header}${body}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#F4EFE4"/><Interior ss:Color="#3D4A32" ss:Pattern="Solid"/></Style>
</Styles>
${worksheets}
</Workbook>`;
}

export function csvWithBom(lines: string[]): string {
  return `\uFEFF${lines.join("\n")}`;
}
