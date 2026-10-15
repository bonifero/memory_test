import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, pairedTest, tCritical, tTestPValue, verdict } from "./stats.js";
import { score } from "./protocol.js";

const close = (actual: number | null, expected: number, digits = 3) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 10 ** -digits, `${actual} ≈ ${expected}`);

test("t distribution matches reference tables", () => {
  close(tTestPValue(2.262, 9), 0.05);
  close(tTestPValue(2, 10), 0.0734);
  close(tTestPValue(1, 1), 0.5);
  close(tCritical(9), 2.262);
  close(tCritical(29), 2.045);
});

test("paired t-test", () => {
  const result = pairedTest([1, 2, 3, 4, 5]);
  close(result.t, 4.2426);
  assert.equal(result.df, 4);
  close(result.p, 0.0132);
  close(result.dz, 1.8974);
  assert.equal(result.supporting, 5);
  assert.equal(verdict(result), "confirmed");
  assert.equal(verdict(pairedTest([1, -1, 2])), "not_confirmed");
  assert.equal(verdict(pairedTest([1, 2])), "insufficient");
  assert.equal(verdict(pairedTest([-3, -4, -5, -4])), "opposite");
});

test("confidence interval", () => {
  const d = describe([10, 20, 30]);
  close(d.mean, 20);
  close(d.ciLow, 20 - 4.303 * 10 / Math.sqrt(3), 2);
});

test("scoring", () => {
  assert.deepEqual(score([1, 2, 3], [3, 1, 2]), { missed: [], extra: [], accuracy: 100, exact: true });
  const partial = score([1, 2, 3, 4], [1, 2, 9]);
  assert.deepEqual(partial.missed, [3, 4]);
  assert.deepEqual(partial.extra, [9]);
  assert.equal(partial.accuracy, 25);
  assert.equal(score([1, 2, 3], []).accuracy, 0);
});
