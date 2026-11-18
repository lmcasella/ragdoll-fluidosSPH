// Lluvia en vuelo dibujada como trazos (#44, docs/design/07-sph.md §7.4): decisión trazo/círculo sin canvas
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";

const { rainStroke, SHOT_DRAW: DRAW } = await import("../js/render.js");

test("una gota lenta (agua acumulada) se dibuja como círculo", () => {
    assert.equal(rainStroke(0, -(DRAW.streakSpeed - 0.1), DRAW), null);
    assert.equal(rainStroke(0, 0, DRAW), null);
});

test("una gota rápida se dibuja como trazo opuesto a su velocidad", () => {
    const s = rainStroke(0, -DRAW.streakSpeed, DRAW);
    assert.ok(s);
    assert.ok(Math.abs(s.dx) < 1e-9);
    assert.ok(s.dy > 0, "la cola queda arriba de una gota que cae");
    assert.ok(Math.abs(s.dy - DRAW.streakSpeed * DRAW.streakScale) < 1e-9 || s.dy === DRAW.streakLength);
});

test("el largo es proporcional a la rapidez y tiene tope", () => {
    const speed = DRAW.streakSpeed;
    const a = Math.hypot(...Object.values({ ...rainStroke(speed, 0, DRAW) }));
    const b = Math.hypot(...Object.values({ ...rainStroke(speed * 1.2, 0, DRAW) }));
    assert.ok(DRAW.streakSpeed * DRAW.streakScale <= DRAW.streakLength, "el umbral no debería caer ya en el tope");
    assert.ok(b > a);
    const fast = rainStroke(300, 400, DRAW);
    assert.ok(Math.abs(Math.hypot(fast.dx, fast.dy) - DRAW.streakLength) < 1e-9);
    assert.ok(fast.dx < 0 && fast.dy < 0);
});

test("el ancho del trazo es menor que la mitad del radio del círculo", () => {
    assert.ok(DRAW.streakWidth < DRAW.radius / 2);
});
