import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appDateKey, formatAppTime, parseLocalDateTime, toAppDateTimeInput } from "./datetime.ts";

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

it("rejects impossible dates instead of moving the visit to another day", () => {
  for (const value of [
    "2026-02-30T09:00",
    "2026-13-01T09:00",
    "2026-09-07T24:00",
    "2026-02-29T10:00Z",
    "09/07/2026",
  ])
    assert.ok(Number.isNaN(parseLocalDateTime(value).getTime()), value);
  assert.equal(parseLocalDateTime("2028-02-29T09:00").toISOString(), "2028-02-29T16:00:00.000Z");
});
it("editing preserves midnight and evening in Sinaloa regardless of browser timezone", () => {
  for (const value of ["2026-09-07T00:00", "2026-09-07T19:30"])
    assert.equal(toAppDateTimeInput(parseLocalDateTime(value)), value);
});
