import { test } from "node:test";
import assert from "node:assert/strict";
import { BUTTON, AIM_RIGHT, AIM_LEFT, startDuel, run } from "./helpers/duel.js";

const GAP = 0.8;

/** J1 empieza `combo1` en el frame 0; J2 aprieta el bloqueo en `blockFrame` y lo mantiene, con la mira en `p2Aim`. */
async function reflex(blockFrame, { p2Aim = AIM_LEFT, setup = () => {} } = {}) {
    const game = await startDuel(GAP);
    setup(game);
    return run(game, 40, (f) => {
        game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT });
        game.setPad(1, { buttons: f >= blockFrame ? [BUTTON.LT] : [], axes: p2Aim });
    });
}

test("#238: un bloqueo apretado 3 frames antes de la ventana activa del golpe lo bloquea", async () => {
    const hits = await reflex(9);
    assert.deepEqual(hits.map((h) => h.kind), ["block"]);
});

test("#238: con el bloqueo mantenido, apuntar al lado del golpe da vuelta la guardia y bloquea", async () => {
    const hits = await reflex(0, {
        p2Aim: AIM_LEFT,
        setup: (game) => {
            game.setPad(1, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
            game.frames(20);
        },
    });
    assert.deepEqual(hits.map((h) => h.kind), ["block"]);
});
