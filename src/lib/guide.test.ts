import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupMessage } from "./guide.ts";

describe("group recado", () => {
  it("includes the app url and the five steps", () => {
    const text = groupMessage("https://santarosa.example");
    assert.match(text, /https:\/\/santarosa\.example/);
    assert.match(text, /Capturar productor/);
    assert.match(text, /Hacer cita/);
    assert.match(text, /Cómo se usa/);
    assert.match(text, /26-27/);
  });
});
