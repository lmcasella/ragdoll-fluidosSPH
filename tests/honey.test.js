// Disparo y persistencia de la miel (#41, #110): el script de index.html con LiquidFun real y gamepads simulados.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { loadGame, giveAllWeapons } from "./helpers/game.js";

const { FLUID, weaponById } = await import("../js/weapons.js");
const { ORIGIN, SINK } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");

const RT = 7;
const J2 = 1;

async function start() {
    const game = await loadGame();
    giveAllWeapons(game);
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const torso = (game, k) => game.state.players[k].torso.GetPosition();
const fmt = (n) => n.toFixed(3);

// Mueve todas las piezas del jugador `dx` metros en x, sin tocar velocidades
function shift(game, k, dx) {
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of game.state.players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y());
        body.SetTransform(v, body.GetAngle());
    }
    Box2D.destroy(v);
}

// Cantidad de partículas del sistema de disparos del tipo dado (por color), con userData opcional
function count(game, kind, tagAbove = -1) {
    const { store, particleSystem } = game.state;
    let n = 0;
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (store.alive[slot] === 1 && store.kind[slot] === kind && store.shot[slot] > tagAbove) n++;
    }
    return n;
}

/**
 * Miel total en partículas de disparo: las que siguen en el sistema más las que el campo de alturas absorbió
 * (`Σ M dx / A_p`), la parte de la pileta (x entre 18 y 38) y las de afuera.
 */
function honeyTotal(game) {
    const { water, immersion } = game.state;
    let pool = 0;
    for (let i = 0; i < water.N; i++) if (water.center(i) > 18 && water.center(i) < 38) pool += water.M[i] * water.dx;
    const field = water.honey() / immersion.area;
    return { particles: count(game, FLUID.HONEY), field, pool: pool / immersion.area, total: count(game, FLUID.HONEY) + field };
}

function tags(game, kind) {
    const { store, particleSystem } = game.state;
    const out = [];
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (store.alive[slot] === 1 && store.kind[slot] === kind) out.push(store.shot[slot]);
    }
    return out;
}

// J2 a 3 m de J1 (J1 mira a la derecha y J2 a la izquierda); los dos disparan a la vez
test("J1 dispara miel a J2 a ~3 m: a los 8 s la miel se conserva y nada del ácido", async () => {
    const game = await start();
    const { players, damage } = game.state;
    shift(game, J2, 7.5 + 3 - torso(game, J2).get_x());
    game.frames(30);
    const firstTag = damage.nextShot;
    players[0].weapon = FLUID.HONEY;
    players[J2].weapon = FLUID.ACID;
    game.setPad(0, { buttons: [RT] });
    game.setPad(J2, { buttons: [RT], axes: [0, 0, -0.7, -0.7] }); // el ácido sale hacia arriba: no cruza el chorro de miel
    game.frames(90);
    game.setPad(0);
    game.setPad(J2);
    game.frames(60);
    const emitted = weaponById(FLUID.HONEY).tank - game.state.players[0].tanks.get(FLUID.HONEY);
    assert.ok(emitted >= 140, `emitió ${emitted}`);
    game.frames(60 * 8);
    const honey = honeyTotal(game);
    console.log(`miel emitida ${emitted}, en el sistema ${count(game, FLUID.HONEY, firstTag - 1)}, en las columnas ${fmt(honey.field)}`);
    assert.ok(Math.abs(honey.total - emitted) < 1e-3 * emitted, `${honey.total} contra ${emitted}: la miel se conserva entre partículas y columnas`);
    assert.equal(count(game, FLUID.ACID), 0, "el ácido venció");
});

test("la miel que cae al agua del nivel no se absorbe ni se destruye: queda como partículas y se conserva a los 8 s (#110)", async () => {
    const game = await start();
    const { players, store, particleSystem } = game.state;
    shift(game, 0, 16.5 - torso(game, 0).get_x());
    game.frames(30);
    players[0].weapon = FLUID.HONEY;
    game.setPad(0, { buttons: [RT], axes: [0, 0, 0.87, -0.5] }); // stick derecho a 30° sobre la horizontal: cae en la pileta
    game.frames(90);
    game.setPad(0);
    const emitted = weaponById(FLUID.HONEY).tank - game.state.players[0].tanks.get(FLUID.HONEY);
    assert.ok(emitted >= 140);
    game.frames(60 * 8);
    const honey = honeyTotal(game);
    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    let inPool = 0;
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        const x = Box2D.HEAPF32[pos + 2 * i];
        if (store.alive[slot] === 1 && store.kind[slot] === FLUID.HONEY && x > 18 && x < 38) inPool++;
    }
    console.log(`miel emitida ${emitted}, en el sistema ${honey.particles}, en la pileta ${inPool}, en las columnas ${fmt(honey.field)}`);
    assert.ok(inPool > 0, "ninguna cayó a la pileta: la prueba no ejercita el agua");
    assert.equal(honey.field, 0, "el campo no tiene miel");
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.HONEY], 0, "ninguna partícula de miel absorbida");
    assert.equal(honey.particles, emitted, `${honey.particles} partículas contra ${emitted} emitidas`);
});
/**
 * Un tanque no emite 1500 partículas de miel, así que se crean en el aire, con id de disparo creciente, y se mide el
 * primer frame de limpieza, antes de que caigan.
 */
test(`sin tope: 1500 partículas de miel disparadas se conservan todas`, async () => {
    const game = await start();
    const { store, damage } = game.state;
    const firstTag = damage.nextShot;
    const total = 1500;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(FLUID.HONEY).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.VISCOUS | PARTICLE.CONTACT_LISTENER);
    def.set_color(color);
    for (let n = 0; n < total; n++) {
        position.set_x(2 + (n % 50) * 0.15);
        position.set_y(20 + Math.floor(n / 50) * 0.15);
        def.set_position(position);
        store.create(def, { kind: FLUID.HONEY, origin: ORIGIN.SHOT, shot: firstTag + n });
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    game.frames(2);
    const left = tags(game, FLUID.HONEY).filter((tag) => tag > 0);
    console.log(`creó ${total}, quedan ${left.length}`);
    assert.equal(left.length, total, `quedan ${left.length} de ${total}`);
});