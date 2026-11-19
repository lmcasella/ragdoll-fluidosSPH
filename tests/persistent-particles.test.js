/** Las partículas no desaparecen (#160): congelado de las quietas y recorte por rendimiento, con LiquidFun real. */
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { loadGame, giveAllWeapons } from "./helpers/game.js";

const { FLUID, weaponById } = await import("../js/weapons.js");
const { ORIGIN, SINK, PARTICLES } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");

const RT = 7;
const FLOOR_Y = 4;
const PUDDLE_X = 12;
const ALLOWED = [SINK.ABSORBED, SINK.OUT];

async function start() {
    const game = await loadGame();
    giveAllWeapons(game);
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

function addPuddle(game, kind, flags, centerX, columns = 14, layers = 3) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(flags | PARTICLE.CONTACT_LISTENER);
    def.set_color(color);
    let made = 0;
    for (let c = 0; c < columns; c++) {
        for (let layer = 0; layer < layers; layer++) {
            position.set_x(centerX - (columns * 0.1) / 2 + c * 0.1);
            position.set_y(FLOOR_Y + 0.1 + layer * 0.1);
            def.set_position(position);
            if (store.create(def, { kind, origin: ORIGIN.MAP }) >= 0) made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    return made;
}

function alive(game, kind) {
    const { store, particleSystem } = game.state;
    let n = 0;
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (slot >= 0 && store.alive[slot] === 1 && store.kind[slot] === kind) n++;
    }
    return n;
}

function destroyedBy(game, kind, causes) {
    const { store } = game.state;
    return causes.reduce((sum, cause) => sum + store.destroyed[cause][kind], 0);
}

function positions(game, kind) {
    const { store, particleSystem } = game.state;
    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const out = new Map();
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (slot >= 0 && store.alive[slot] === 1 && store.kind[slot] === kind) out.set(slot, [Box2D.HEAPF32[pos + 2 * i], Box2D.HEAPF32[pos + 2 * i + 1]]);
    }
    return out;
}

function maxDisplacement(before, after) {
    let max = 0;
    for (const [slot, [x, y]] of before) {
        const p = after.get(slot);
        if (p) max = Math.max(max, Math.hypot(p[0] - x, p[1] - y));
    }
    return max;
}

function assertMassBook(game, kind) {
    const { store } = game.state;
    const gone = store.destroyed.reduce((sum, book) => sum + book[kind], 0);
    assert.equal(store.created[kind] - gone, alive(game, kind), "libro de masa: creadas - destruidas = vivas");
}

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

test("un disparo de agua sobre la plataforma conserva todas sus partículas 30 s", async () => {
    const game = await start();
    const { players } = game.state;
    game.setPad(0, { buttons: [RT], axes: [0, 0, 0.5, 0.85] });
    game.frames(120);
    game.setPad(0);
    const emitted = game.state.store.created[FLUID.WATER];
    assert.ok(emitted >= 100, `emitidas ${emitted}`);
    const before = alive(game, FLUID.WATER);
    const lost = destroyedBy(game, FLUID.WATER, ALLOWED);
    game.frames(60 * 30);
    assert.equal(alive(game, FLUID.WATER), before - (destroyedBy(game, FLUID.WATER, ALLOWED) - lost));
    assert.equal(destroyedBy(game, FLUID.WATER, [SINK.HIT, SINK.EVAPORATED, SINK.RESET, SINK.PERF]), 0);
    assertMassBook(game, FLUID.WATER);
    assert.ok(players[0]);
});

test("la miel por encima del viejo tope de 1.200 se conserva 30 s", async () => {
    const game = await start();
    const { store } = game.state;
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
        store.create(def, { kind: FLUID.HONEY, origin: ORIGIN.SHOT, shot: 1 + n });
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    game.frames(60 * 30);
    assert.equal(destroyedBy(game, FLUID.HONEY, Object.values(SINK)), 0);
    assert.equal(alive(game, FLUID.HONEY), total);
    assertMassBook(game, FLUID.HONEY);
});

test("un charco quieto 30 s no pierde partículas y queda congelado", async () => {
    const game = await start();
    const { store } = game.state;
    const made = addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X);
    game.frames(60 * 30);
    assert.equal(alive(game, FLUID.HONEY), made);
    assert.equal(destroyedBy(game, FLUID.HONEY, Object.values(SINK)), 0);
    assert.ok(store.frozenCount >= 0.9 * made, `congeladas ${store.frozenCount} de ${made}`);
    assertMassBook(game, FLUID.HONEY);
});

test("las congeladas siguen soportando: una gota que cae sobre el charco queda encima", async () => {
    const game = await start();
    const { store, particleSystem } = game.state;
    const made = addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X);
    game.frames(60 * 5);
    assert.ok(store.frozenCount >= 0.9 * made);
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(PUDDLE_X, FLOOR_Y + 1);
    def.set_flags(PARTICLE.CONTACT_LISTENER);
    def.set_position(position);
    const drop = store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT, shot: 1 });
    Box2D.destroy(def);
    Box2D.destroy(position);
    game.frames(120);
    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    assert.ok(Box2D.HEAPF32[pos + 2 * drop + 1] > FLOOR_Y + 0.12, `la gota quedó en y = ${Box2D.HEAPF32[pos + 2 * drop + 1]}`);
});

/** Desplazamiento máximo del charco de miel tras pisarlo con el robot 1, con o sin congelado. */
async function walkOnPuddle(frozenEnabled) {
    const game = await start();
    const { store } = game.state;
    if (!frozenEnabled) store.updateSleep = () => {};
    const made = addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X);
    game.frames(60 * 5);
    const frozen = store.frozenCount;
    if (frozenEnabled) assert.ok(frozen >= 0.9 * made);
    const before = positions(game, FLUID.HONEY);
    shift(game, 0, PUDDLE_X - game.state.players[0].torso.GetPosition().get_x());
    game.frames(30);
    if (frozenEnabled) assert.ok(store.frozenCount < 0.5 * frozen, `quedan congeladas ${store.frozenCount} de ${frozen}`);
    game.frames(60 * 4);
    assertMassBook(game, FLUID.HONEY);
    return maxDisplacement(before, positions(game, FLUID.HONEY));
}

test("un robot que pisa el charco despierta las partículas y escurren como sin congelado", async (t) => {
    const baseline = await walkOnPuddle(false);
    const moved = await walkOnPuddle(true);
    t.diagnostic(`desplazamiento máximo: sin congelado ${baseline} m, con congelado ${moved} m`);
    assert.ok(baseline > 0.01, "el robot mueve el charco");
    assert.ok(moved >= 0.8 * baseline, `${moved} m contra ${baseline} m`);
});
test("un disparo sobre el charco despierta las partículas", async () => {
    const game = await start();
    const { store } = game.state;
    const made = addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X);
    game.frames(60 * 5);
    const frozen = store.frozenCount;
    assert.ok(frozen >= 0.9 * made);
    game.setPad(0, { buttons: [RT], axes: [0, 0, 0.9, 0.3] });
    game.frames(60);
    game.setPad(0);
    game.frames(30);
    assert.ok(store.frozenCount < frozen, `congeladas ${store.frozenCount} de ${frozen}`);
});

test("freeze y wake devuelven las flags de origen de la partícula", async () => {
    const game = await start();
    const { store, particleSystem } = game.state;
    addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X, 2, 1);
    const flags = particleSystem.GetParticleFlags(0);
    assert.ok((flags & PARTICLE.VISCOUS) !== 0);
    store.freeze(0);
    assert.equal(particleSystem.GetParticleFlags(0), flags | PARTICLE.WALL);
    assert.equal(store.frozenCount, 1);
    store.wake(0);
    assert.equal(particleSystem.GetParticleFlags(0), flags);
    assert.equal(store.frozenCount, 0);
});

function fill(game, count, frozenFrom, shotOf) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    for (let n = 0; n < count; n++) {
        position.set_x(2 + (n % 40) * 0.12);
        position.set_y(FLOOR_Y + 0.1 + Math.floor(n / 40) * 0.12);
        def.set_position(position);
        store.create(def, { kind: FLUID.WATER, origin: shotOf(n) === 0 ? ORIGIN.MAP : ORIGIN.SHOT, shot: shotOf(n) });
    }
    Box2D.destroy(def);
    Box2D.destroy(position);
    for (let i = frozenFrom; i < count; i++) store.freeze(i);
}

function liveShots(game) {
    const { store, particleSystem } = game.state;
    const shots = [];
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (slot >= 0 && store.alive[slot] === 1) shots.push(store.shot[slot]);
    }
    return shots;
}

test("recorte con carga simulada: primero las congeladas, luego las más viejas y el mapa al final, de a 100", async () => {
    const game = await start();
    const { store } = game.state;
    fill(game, 400, 300, (n) => (n < 50 ? 0 : n));
    assert.equal(store.trim(25, 0.5), 0, "con menos de 1 s de frame lento no recorta");
    assert.equal(store.trim(25, 0.5), PARTICLES.trimBatch);
    let shots = liveShots(game);
    assert.equal(shots.length, 300);
    assert.equal(store.frozenCount, 0, "se fueron las 100 congeladas");
    assert.ok(shots.every((s) => s < 300));
    store.trim(25, 0.1);
    shots = liveShots(game);
    assert.equal(shots.length, 200);
    assert.ok(shots.every((s) => s === 0 || s >= 150), "se fueron las de id menor");
    store.trim(25, 0.1);
    shots = liveShots(game);
    assert.equal(shots.length, 100);
    assert.equal(shots.filter((s) => s === 0).length, 50, "el mapa queda para el final");
    assert.ok(shots.every((s) => s === 0 || s >= 250));
    store.trim(25, 0.1);
    assert.equal(liveShots(game).length, 0);
    assert.equal(store.destroyed[SINK.PERF][FLUID.WATER], 400);
    assert.equal(store.trim(10, 1), 0, "con el frame recuperado no recorta");
    assertMassBook(game, FLUID.WATER);
});
test("sin carga no se recorta nada: 30 s a 60 fps con 400 partículas", async () => {
    const game = await start();
    fill(game, 400, 400, (n) => n + 1);
    game.frames(60 * 30);
    assert.equal(destroyedBy(game, FLUID.WATER, [SINK.PERF]), 0);
});

test("con frames lentos en el juego se recortan las más viejas con causa PERF hasta recuperar", async () => {
    const game = await start();
    const { store } = game.state;
    fill(game, 600, 600, (n) => n + 1);
    for (let n = 0; n < 90; n++) {
        game.skipTime(0.01);
        game.frame();
    }
    const trimmed = store.destroyed[SINK.PERF][FLUID.WATER];
    assert.ok(trimmed >= PARTICLES.trimBatch, `recortadas ${trimmed}`);
    assert.equal(trimmed % PARTICLES.trimBatch, 0);
    game.frames(60);
    assert.equal(store.destroyed[SINK.PERF][FLUID.WATER], trimmed, "al recuperar el frame deja de recortar");
    assertMassBook(game, FLUID.WATER);
});
