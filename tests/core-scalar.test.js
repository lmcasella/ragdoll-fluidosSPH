/**
 * Funciones escalares comunes de `src/core/math/scalar.js` (#307): acotar, interpolar, signo y ángulos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    TAU,
    QUARTER_TURN,
    clamp,
    clampUnit,
    lerp,
    inverseLerp,
    signOr,
    signOrOne,
    wrapAngle,
    shortestAngleDifference,
    exponentialApproachFactor,
} from "../src/core/math/scalar.js";

const ANGLE_TOLERANCE = 1e-12;

test("TAU es una vuelta y QUARTER_TURN un cuarto", () => {
    assert.equal(TAU, 2 * Math.PI);
    assert.equal(QUARTER_TURN * 4, TAU);
});

test("clamp acota a los dos lados y deja pasar lo que está dentro", () => {
    assert.equal(clamp(5, 0, 3), 3);
    assert.equal(clamp(-5, 0, 3), 0);
    assert.equal(clamp(2, 0, 3), 2);
    assert.equal(clamp(7, 4, 2), 2, "con el mínimo sobre el máximo gana el máximo");
});

test("clampUnit acota a [0, 1]", () => {
    assert.equal(clampUnit(1.5), 1);
    assert.equal(clampUnit(-0.5), 0);
    assert.equal(clampUnit(0.25), 0.25);
});

test("lerp e inverseLerp son inversas y dan los extremos", () => {
    assert.equal(lerp(10, 20, 0), 10);
    assert.equal(lerp(10, 20, 1), 20);
    assert.equal(lerp(10, 20, 0.25), 12.5);
    assert.equal(lerp(10, 20, 2), 30, "no acota");
    assert.equal(inverseLerp(10, 20, 12.5), 0.25);
    assert.equal(inverseLerp(10, 20, lerp(10, 20, 0.7)), 0.7);
});

test("signOr y signOrOne usan el respaldo solo con 0", () => {
    assert.equal(signOrOne(-3), -1);
    assert.equal(signOrOne(3), 1);
    assert.equal(signOrOne(0), 1);
    assert.equal(signOr(0, -1), -1);
    assert.equal(signOr(2, -1), 1);
    assert.equal(signOr(NaN, 1), 1);
});

test("wrapAngle lleva cualquier ángulo a (-π, π]", () => {
    assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < ANGLE_TOLERANCE);
    assert.ok(Math.abs(wrapAngle(-TAU - 0.5) - -0.5) < ANGLE_TOLERANCE);
    assert.equal(wrapAngle(0.3), Math.atan2(Math.sin(0.3), Math.cos(0.3)));
});

test("shortestAngleDifference toma el camino corto", () => {
    const nearlyFullTurn = TAU - 0.1;
    assert.ok(Math.abs(shortestAngleDifference(0, nearlyFullTurn) - -0.1) < ANGLE_TOLERANCE);
    assert.ok(Math.abs(shortestAngleDifference(nearlyFullTurn, 0) - 0.1) < ANGLE_TOLERANCE);
    assert.equal(shortestAngleDifference(1, 1), 0);
});

test("exponentialApproachFactor va de 0 a 1 y vale 1 - e^-x", () => {
    assert.equal(exponentialApproachFactor(0), 0);
    assert.equal(exponentialApproachFactor(2), 1 - Math.exp(-2));
    assert.ok(exponentialApproachFactor(50) > 1 - 1e-12);
});
