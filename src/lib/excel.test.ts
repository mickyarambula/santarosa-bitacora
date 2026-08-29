import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvWithBom, toSpreadsheetXml } from "./excel.ts";

describe("excel export", () => {
  it("escapes xml and marks header cells", () => {
    const xml = toSpreadsheetXml([
      {
        name: "Captura 26-27",
        headers: ["Comisionista", "Notas"],
        rows: [["Luis Cota", 'Falta "predial" & INE']],
      },
    ]);
    assert.match(xml, /ss:Name="Captura 26-27"/);
    assert.match(xml, /ss:StyleID="header"/);
    assert.match(xml, /Falta \u0026quot;predial\u0026quot; \u0026amp; INE/);
  });

  it("prefixes csv with utf-8 bom", () => {
    const csv = csvWithBom(["a,b", "1,2"]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /a,b/);
  });
});
