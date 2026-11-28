import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFixedSteps, MAX_STEPS_PER_FRAME } from "../src/core/fixedStep.js";

const STEP_SECONDS = 1 / 60;
const BACKLOG_STEPS = 5;
const PARTIAL_BACKLOG_STEPS = 1.5;
const FLOAT_TOLERANCE_SECONDS = 1e-12;
const HALF_STEP_SECONDS = 0.5 * STEP_SECONDS;
const THREE_STEPS_SECONDS = 3 * STEP_SECONDS;

test("consumeFixedSteps: con mucho atraso corre el tope y descarta el exceso", () => {
    const result = consumeFixedSteps(BACKLOG_STEPS * STEP_SECONDS, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    assert.equal(result.steps, MAX_STEPS_PER_FRAME);
    assert.ok(result.accumulator >= 0 && result.accumulator < STEP_SECONDS);
});

test("consumeFixedSteps: bajo el tope corre los pasos enteros y conserva el resto", () => {
    const result = consumeFixedSteps(PARTIAL_BACKLOG_STEPS * STEP_SECONDS, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    assert.equal(result.steps, 1);
    assert.ok(Math.abs(result.accumulator - HALF_STEP_SECONDS) < FLOAT_TOLERANCE_SECONDS);
    assert.equal(result.discarded, 0);
});

test("consumeFixedSteps: lo descartado, el resto y los pasos corridos suman el acumulador original", () => {
    const accumulator = BACKLOG_STEPS * STEP_SECONDS;
    const result = consumeFixedSteps(accumulator, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    const total = result.discarded + result.accumulator + result.steps * STEP_SECONDS;
    assert.ok(Math.abs(total - accumulator) < FLOAT_TOLERANCE_SECONDS);
});

test("consumeFixedSteps: con el acumulador a un ulp de tres pasos el resto queda en [0, dt) y no se descarta tiempo negativo", () => {
    const accumulator = THREE_STEPS_SECONDS - Number.EPSILON * THREE_STEPS_SECONDS;
    const result = consumeFixedSteps(accumulator, STEP_SECONDS, MAX_STEPS_PER_FRAME);
    assert.ok(result.accumulator >= 0 && result.accumulator < STEP_SECONDS);
    assert.ok(result.discarded >= 0);
});
