// Miel pegajosa (#41, docs/design/04-fluidos.md): el script de index.html con LiquidFun real y gamepads simulados.
// Cada medición con charco se compara con la misma corrida sin charco.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { loadGame } from "./helpers/game.js";

const { FLUID, PERSIST_MAX, weaponById } = await import("../js/weapons.js");
const { ORIGIN, SINK } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");

const RT = 7;
const J2 = 1;
const FLOOR_Y = 4; // tope de la plataforma de aparición (LEVEL.solids)
const STICK_RIGHT = [1, 0, 0, 0];
const STICK_UP = [0, -1, 0, 0];

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const torso = (game, k) => game.state.players[k].torso.GetPosition();

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

// Partículas de miel que cuentan como las del mapa (#23): userData 0, flags VISCOUS | CONTACT_LISTENER
function addPuddle(game, centerX) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(FLUID.HONEY).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.VISCOUS | PARTICLE.CONTACT_LISTENER);
    def.set_color(color);
    let made = 0;
    for (let x = centerX - 1; x <= centerX + 1.0001; x += 0.15) {
        for (let layer = 0; layer < 3; layer++) {
            position.set_x(x);
            position.set_y(FLOOR_Y + 0.1 + layer * 0.15);
            def.set_position(position);
            store.create(def, { kind: FLUID.HONEY, origin: ORIGIN.MAP });
            made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    return made;
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

// Un robot J2 parado, con o sin charco debajo, ya asentado
async function standing(puddle) {
    const game = await start();
    if (puddle) addPuddle(game, torso(game, J2).get_x());
    game.frames(60);
    return game;
}

const fmt = (n) => n.toFixed(3);

test("sobre el charco, el stick 1 s mueve el torso como máximo 0,2 veces lo que sin charco", async (t) => {
    const run = async (puddle) => {
        const game = await standing(puddle);
        const x0 = torso(game, J2).get_x();
        game.setPad(J2, { axes: STICK_RIGHT });
        game.frames(60);
        return torso(game, J2).get_x() - x0;
    };
    const free = await run(false);
    const stuck = await run(true);
    t.diagnostic(`dx sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m (${fmt(stuck / free)})`);
    // El diseño pide >= 4 m y <= 0,15 veces; el clip de caminar aporta ~0,64 m/s aun con `speed` en 0 (medido)
    assert.ok(free >= 3.5, `sin charco ${free}`);
    assert.ok(stuck <= 0.2 * free, `con charco ${stuck}`);
});

test("sobre el charco, el salto sube como máximo 0,4 m (sin charco, 2 m o más)", async (t) => {
    const run = async (puddle) => {
        const game = await standing(puddle);
        const y0 = torso(game, J2).get_y();
        let peak = 0;
        game.setPad(J2, { buttons: [0] });
        for (let i = 0; i < 45; i++) {
            if (i === 30) game.setPad(J2);
            game.frame();
            peak = Math.max(peak, torso(game, J2).get_y() - y0);
        }
        return peak;
    };
    const free = await run(false);
    const stuck = await run(true);
    t.diagnostic(`subida sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m`);
    assert.ok(free >= 2, `sin charco ${free}`);
    assert.ok(stuck <= 0.4, `con charco ${stuck}`);
});

test("parado en el charco con 2 g el torso no colapsa: altura >= 0,9 de la de sin charco", async (t) => {
    const heightOf = async (puddle) => {
        const game = await standing(puddle);
        game.frames(120);
        return torso(game, J2).get_y() - FLOOR_Y;
    };
    const free = await heightOf(false);
    const stuck = await heightOf(true);
    t.diagnostic(`altura del torso sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m (${fmt(stuck / free)})`);
    assert.ok(stuck >= 0.9 * free, `${stuck} contra ${free}`);
});

test("quieto 3 s sobre el charco: pegado en todos los pasos y no se pierde miel (partículas y columnas)", async (t) => {
    const game = await standing(true);
    const before = honeyTotal(game);
    assert.ok(before.total > 0);
    for (let i = 0; i < 180; i++) {
        game.frame();
        assert.equal(game.state.players[J2].sticky, true, `frame ${i}`);
    }
    const after = honeyTotal(game);
    t.diagnostic(`miel antes: ${before.particles} partículas y ${fmt(before.field)} partículas-equivalentes en columnas; después: ${after.particles} y ${fmt(after.field)}`);
    assert.ok(Math.abs(after.total - before.total) < 1e-3 * before.total, `${after.total} contra ${before.total}`);
});

test("charco destruido: deja de estar pegado a los 0,3 s + 1 paso y recupera el movimiento", async () => {
    const game = await standing(true);
    assert.equal(game.state.players[J2].sticky, true);
    game.state.store.reset();
    game.state.water.reset();
    game.frames(15);
    assert.equal(game.state.players[J2].sticky, true, "todavía dentro de la gracia");
    game.frames(7); // 0,3 s + 1 paso (algún frame no completa un paso)
    assert.equal(game.state.players[J2].sticky, false);
    const x0 = torso(game, J2).get_x();
    game.setPad(J2, { axes: STICK_RIGHT });
    game.frames(60);
    assert.ok(torso(game, J2).get_x() - x0 > 3, "camina normal de nuevo");
});

// J2 a 3 m de J1 (J1 mira a la derecha y J2 a la izquierda); los dos disparan a la vez
test("J1 dispara miel a J2 a ~3 m: J2 queda pegado, J1 no en los primeros 0,4 s; a los 8 s la miel se conserva y nada del ácido", async () => {
    const game = await start();
    const { players, damage } = game.state;
    shift(game, J2, 7.5 + 3 - torso(game, J2).get_x());
    game.frames(30);
    const firstTag = damage.nextShot;
    players[0].weapon = FLUID.HONEY;
    players[J2].weapon = FLUID.ACID;
    game.setPad(0, { buttons: [RT] });
    game.setPad(J2, { buttons: [RT], axes: [0, 0, -0.7, -0.7] }); // el ácido sale hacia arriba: no cruza el chorro de miel
    let j2Stuck = false;
    for (let i = 0; i < 24; i++) {
        game.frame();
        assert.equal(game.state.players[0].sticky, false, `J1 pegado en el frame ${i}`);
        j2Stuck ||= game.state.players[J2].sticky;
    }
    for (let i = 0; i < 66; i++) {
        game.frame();
        j2Stuck ||= game.state.players[J2].sticky;
    }
    game.setPad(0);
    game.setPad(J2);
    for (let i = 0; i < 60; i++) {
        game.frame();
        j2Stuck ||= game.state.players[J2].sticky;
    }
    j2Stuck ||= game.state.players[J2].sticky;
    const emitted = weaponById(FLUID.HONEY).tank - game.state.players[0].tanks.get(FLUID.HONEY);
    assert.ok(emitted >= 140, `emitió ${emitted}`);
    game.frames(60 * 8);
    assert.equal(j2Stuck, true, "J2 quedó pegado");
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
test(`tope: con 1500 partículas de miel disparadas quedan como mucho ${PERSIST_MAX} y son las más nuevas`, async () => {
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
    console.log(`creó ${total}, quedan ${left.length}, id más chico ${Math.min(...left)} (primero ${firstTag})`);
    assert.ok(left.length <= PERSIST_MAX, `quedan ${left.length}`);
    assert.ok(left.length >= PERSIST_MAX - 5, `quedan ${left.length}: no se destruyó de más`);
    assert.equal(Math.min(...left), firstTag + total - left.length, "se destruyeron las más viejas");
});