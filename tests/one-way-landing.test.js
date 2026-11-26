/**
 * Aterrizaje rápido sobre una plataforma atravesable (#171): el robot cae desde arriba con las piernas extendidas sobre
 * una plataforma fija y sobre una cinemática (moving: true) y ninguna pieza queda dentro de la caja más de 0,2 s.
 * Escena real de index.js con LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { land } from "./helpers/landing.js";

const { ONE_WAY } = await import("../src/level/platforms.js");
const MAX_INSIDE = 0.2;
for (const moving of [false, true]) {
    test(`aterrizaje rápido sobre una plataforma ${moving ? "cinemática" : "fija"}: ninguna pieza queda dentro más de 0,2 s y el robot termina arriba`, async () => {
        const { longest, worst, low, platform } = await land(moving);
        assert.ok(longest <= MAX_INSIDE, `${longest} s dentro, peor ${JSON.stringify(worst)}`);
        assert.ok(low >= platform.top - ONE_WAY.tolerance - 0.05, `quedó debajo del tope: ${low} (tope ${platform.top})`);
    });
}
