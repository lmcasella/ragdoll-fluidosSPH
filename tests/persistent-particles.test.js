/** Las partículas no desaparecen (#160): recorte por rendimiento, con LiquidFun real. */
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

function assertMassBook(game, kind) {
    const { store } = game.state;
    const gone = store.destroyed.reduce((sum, book) => sum + book[kind], 0);
    assert.equal(store.created[kind] - gone, alive(game, kind), "libro de masa: creadas - destruidas = vivas");
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

test("un charco quieto 30 s no pierde partículas", async () => {
    const game = await start();
    const { store } = game.state;
    const made = addPuddle(game, FLUID.HONEY, PARTICLE.VISCOUS, PUDDLE_X);
    game.frames(60 * 30);
    assert.equal(alive(game, FLUID.HONEY), made);
    assert.equal(destroyedBy(game, FLUID.HONEY, Object.values(SINK)), 0);
    assertMassBook(game, FLUID.HONEY);
});

function fill(game, count, shotOf) {
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

/** Corre `fn` con `PARTICLES.minCount` en `value` y lo restaura al terminar. */
async function withMinCount(value, fn) {
    const saved = PARTICLES.minCount;
    PARTICLES.minCount = value;
    try {
        await fn();
    } finally {
        PARTICLES.minCount = saved;
    }
}

test("recorte con carga simulada: las más viejas primero y el mapa al final, de a 100", () => withMinCount(0, async () => {
    const game = await start();
    const { store } = game.state;
    fill(game, 400, (n) => (n < 50 ? 0 : n));
    assert.equal(store.trim(25, 0.5), 0, "con menos de 1 s de frame lento no recorta");
    assert.equal(store.trim(25, 0.5), PARTICLES.trimBatch);
    let shots = liveShots(game);
    assert.equal(shots.length, 300);
    assert.ok(shots.every((s) => s === 0 || s >= 150), "se fueron las de id menor");
    store.trim(25, 0.1);
    shots = liveShots(game);
    assert.equal(shots.length, 200);
    assert.ok(shots.every((s) => s === 0 || s >= 250));
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
}));

test("el recorte no baja de minCount partículas vivas", async () => {
    const game = await start();
    const { store } = game.state;
    await withMinCount(350, async () => {
        fill(game, 400, (n) => n + 1);
        store.trim(25, 1);
        assert.equal(liveShots(game).length, 350, "recorta solo lo que pasa de minCount");
        assert.equal(store.trim(25, 1), 0, "en minCount ya no recorta");
    });
});

test("#266 a 40 fps sostenidos con un disparo de lava no se recorta nada", async () => {
    const game = await start();
    const { store, players } = game.state;
    players[0].weapon = FLUID.LAVA;
    game.setPad(0, { buttons: [RT] });
    for (let n = 0; n < 150; n++) {
        if (n === 60) game.setPad(0);
        game.skipTime(1 / 40 - 1 / 60);
        game.frame();
    }
    assert.equal(destroyedBy(game, FLUID.LAVA, [SINK.PERF]), 0);
    assert.ok(game.state.particleSystem.GetParticleCount() > 50, "la lava sigue viva");
    assert.equal(store.destroyed[SINK.PERF].reduce((a, b) => a + b, 0), 0);
});
test("sin carga no se recorta nada: 30 s a 60 fps con 400 partículas", async () => {
    const game = await start();
    fill(game, 400, (n) => n + 1);
    game.frames(60 * 30);
    assert.equal(destroyedBy(game, FLUID.WATER, [SINK.PERF]), 0);
});

test("con frames lentos en el juego se recortan las más viejas con causa PERF hasta recuperar", () => withMinCount(0, async () => {
    const game = await start();
    const { store } = game.state;
    fill(game, 600, (n) => n + 1);
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
}));
