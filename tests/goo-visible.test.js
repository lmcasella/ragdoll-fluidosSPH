import { test } from "node:test";
import assert from "node:assert/strict";

const { GOO_BLUR, SHOT_DRAW, gooPeakAlpha } = await import("../js/render.js");

/** Umbral del filtro goo de index.html: alfa · 20 − 10 > 0. */
const GOO_THRESHOLD = 0.5;

test("#124: una partícula aislada de cualquier material sobrevive al umbral del filtro goo", (t) => {
    for (const [kind, row] of Object.entries(SHOT_DRAW.kinds)) {
        const radius = Math.min(SHOT_DRAW.radius * row.radiusScale, SHOT_DRAW.maxRadius);
        const alpha = gooPeakAlpha(radius, GOO_BLUR);
        t.diagnostic(`kind ${kind}: r = ${radius.toFixed(4)} m, alfa en el centro ${alpha.toFixed(3)}`);
        assert.ok(alpha > GOO_THRESHOLD + 0.1, `kind ${kind}: alfa ${alpha} no supera el umbral con margen`);
    }
});

test("#124: con el desenfoque anterior (0,07 m) la gota aislada desaparecía", () => {
    assert.ok(gooPeakAlpha(SHOT_DRAW.radius, 0.07) < GOO_THRESHOLD);
});
