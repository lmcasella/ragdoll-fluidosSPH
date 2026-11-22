/**
 * El lector de contactos en el juego entero (#268): el buffer partícula-cuerpo se ubica con la partida real y sin
 * avisos aunque los primeros contactos sean de partículas dentro de un robot, con pesos mayores que 1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { FLUID } = await import("../js/weapons.js");
const { ORIGIN } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");

/** Corre `fn` capturando los `console.warn` que empiezan con `contacts.js`. */
function withWarnings(fn) {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => {
        if (String(args[0]).startsWith("contacts.js")) warnings.push(args.join(" "));
        else original(...args);
    };
    try {
        fn();
    } finally {
        console.warn = original;
    }
    return warnings;
}

test("seis partículas de miel dentro del torso al empezar la partida: el lector de contactos las ve, sin aviso", async () => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    const { store, adhesion, players } = game.state;
    const torso = players[0].torso.GetPosition();
    const def = new Box2D.b2ParticleDef();
    const pos = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.WATER);
    for (let k = 0; k < 6; k++) {
        pos.set_x(torso.get_x() - 0.15 + k * 0.06);
        pos.set_y(torso.get_y() + 0.1);
        def.set_position(pos);
        store.create(def, { kind: FLUID.HONEY, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(pos);
    const warnings = withWarnings(() => game.frames(5));
    assert.deepEqual(warnings, []);
    assert.equal(adhesion.contacts.stats.failed, false);
    assert.notEqual(adhesion.contacts.stats.bodyOffset, null, "el offset partícula-cuerpo se encontró");
});
