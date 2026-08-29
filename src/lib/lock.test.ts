import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessCodeOk, hashAccessCode, namesMatchForDelete, normalizeAccessCode } from "./lock.ts";

describe("access lock", () => {
  it("normalizes the team code", () => {
    assert.equal(normalizeAccessCode("  rosa 26 "), "ROSA26");
  });

  it("accepts the same code ignoring spaces and case", () => {
    const stored = hashAccessCode("Rosa26");
    assert.equal(accessCodeOk("rosa 26", stored), true);
    assert.equal(accessCodeOk("otra", stored), false);
    assert.equal(accessCodeOk("", stored), false);
  });

  it("requires the name to match before delete", () => {
    assert.equal(namesMatchForDelete("Luis Cota", "Luis Cota"), true);
    assert.equal(namesMatchForDelete(" luis cota ", "Luis Cota"), true);
    assert.equal(namesMatchForDelete("Luis", "Luis Cota"), false);
    assert.equal(namesMatchForDelete("", "Luis Cota"), false);
  });
});
