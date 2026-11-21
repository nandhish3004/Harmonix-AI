import test from "node:test";
import assert from "node:assert/strict";
import { idealFrequency, modeAmplitude } from "../src/app/film/plateModel.ts";

test("simply supported plate frequencies agree with independent reference values", () => {
  for (const [m, n, expected] of [[1, 1, 187.23], [2, 1, 389.45], [2, 2, 748.94]]) {
    assert.ok(Math.abs(idealFrequency(m, n) - expected) < 0.01);
  }
});

test("mode shape vanishes at supports and the expected internal nodes", () => {
  for (const u of [0, 0.2, 0.5, 1]) {
    assert.ok(Math.abs(modeAmplitude(u, 0, 2, 2)) < 1e-12);
    assert.ok(Math.abs(modeAmplitude(u, 1, 2, 2)) < 1e-12);
    assert.ok(Math.abs(modeAmplitude(u, 0.5, 2, 2)) < 1e-12);
  }
  assert.ok(Math.abs(modeAmplitude(0.5, 0.3, 2, 1)) < 1e-12);
  assert.ok(Math.abs(modeAmplitude(0.25, 0.5, 2, 1) - 1) < 1e-12);
});
