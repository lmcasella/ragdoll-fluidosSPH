import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { SHOT_SYSTEM } = await import("../js/weapons.js");
const { ORIGIN } = await import("../js/particleStore.js");
const { FLUID } = await import("../js/weapons.js");

/**
 * El heap de LiquidFun es fijo (16 MiB): el juego completo con el sistema de disparos lleno hasta `maxCount` no aborta
 * y sigue avanzando.
 */
test(`heap: el sistema llena ${SHOT_SYSTEM.maxCount} partículas y el juego sigue 120 frames sin abortar`, async (t) => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(10);
    const { store, particleSystem } = game.state;
    const def = new Box2D.b2ParticleDef();
    const color = new Box2D.b2ParticleColor(90, 170, 255, 255);
    const at = new Box2D.b2Vec2(0, 0);
    def.set_color(color);
    let made = 0;
    for (let row = 0; made < SHOT_SYSTEM.maxCount; row++) {
        for (let col = 0; col < 520 && made < SHOT_SYSTEM.maxCount; col++) {
            at.set_x(2 + col * 0.1);
            at.set_y(8 + row * 0.1);
            def.set_position(at);
            if (store.create(def, { kind: FLUID.LAVA, origin: ORIGIN.SHOT }) >= 0) made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(at);
    game.frames(120);
    t.diagnostic(`creadas ${made}, vivas ${particleSystem.GetParticleCount()} de ${SHOT_SYSTEM.maxCount}`);
    assert.equal(made, SHOT_SYSTEM.maxCount);
    assert.ok(particleSystem.GetParticleCount() > 0);
});
