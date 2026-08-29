import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appDateKey, formatAppTime, parseLocalDateTime } from "./datetime.ts";

describe("Sinaloa wall clock", () => {
  it("stores 9:00 as 9:00 in Mazatlan, not 2:00", () => {
    const d = parseLocalDateTime("2026-08-25T09:00");
    assert.match(formatAppTime(d), /9:00|09:00/);
    assert.equal(d.toISOString(), "2026-08-25T16:00:00.000Z");
  });

  it("stores 19:00 as evening, not 2 a.m. the next day on screen", () => {
    const d = parseLocalDateTime("2026-08-24T19:00");
    assert.match(formatAppTime(d), /7:00|19:00/);
    assert.equal(appDateKey(d), "2026-08-24");
  });

  it("keeps an ISO instant as-is", () => {
    const d = parseLocalDateTime("2026-08-25T16:00:00.000Z");
    assert.equal(d.toISOString(), "2026-08-25T16:00:00.000Z");
    assert.match(formatAppTime(d), /9:00|09:00/);
  });
});
