import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loanOf, suggestedFinancing, suggestedPerHa } from "./utils.ts";

describe("loan by hectare", () => {
  it("multiplies rate by hectares", () => {
    assert.equal(loanOf(80, 35000), 2_800_000);
    assert.equal(loanOf(0, 35000), 0);
  });

  it("uses crop default per hectare", () => {
    assert.equal(suggestedPerHa("maiz_blanco"), 35000);
    assert.equal(suggestedFinancing("maiz_blanco", 80, "financiamiento"), 2_800_000);
    assert.equal(suggestedFinancing("maiz_blanco", 80, "acopio"), 0);
  });
});
