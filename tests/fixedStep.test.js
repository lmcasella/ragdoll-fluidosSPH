import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFixedSteps, MAX_STEPS_PER_FRAME } from "../src/core/fixedStep.js";

const STEP_SECONDS = 1 / 60;
const BACKLOG_STEPS = 5;
const PARTIAL_BACKLOG_STEPS = 1.5;
const FLOAT_TOLERANCE_SECONDS = 1e-12;

test("consumeFixedSteps: con mucho atraso corre el tope y descarta el exceso", () => {
    const result = consumeFixedSteps(BACKLOG_STEPS * STEP_SECONDS, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    assert.equal(result.steps, MAX_STEPS_PER_FRAME);
    assert.ok(result.accumulator >= 0 && result.accumulator < STEP_SECONDS);
});

test("consumeFixedSteps: bajo el tope corre los pasos enteros y conserva el resto", () => {
    const result = consumeFixedSteps(PARTIAL_BACKLOG_STEPS * STEP_SECONDS, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    assert.equal(result.steps, 1);
    assert.ok(Math.abs(result.accumulator - 0.5 * STEP_SECONDS) < FLOAT_TOLERANCE_SECONDS);
});
