import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { ORIGIN } from "../js/particleStore.js";
import { PARTICLE } from "../js/particles.js";
import { FLUID, weaponById } from "../js/weapons.js";

/**
 * #214: un robot sobre un charco de miel de 3 capas. Mide altura de los pies, `isGrounded`, torso, velocidad media y
 * dispersión de vx bajo el pie, en seco, con agua y con miel (todo activo, sin viscosity, sin adhesion, sin ninguno), e
 * imprime la tabla. Los asserts son sobre la miel con todo activo: parado entre 1 y 3 s después de soltar el stick y
 * caminando por el charco.
 */

const FLOOR_Y = 4;
const SPACING = 0.12;
const LAYERS = 3;
const X0 = 11;
const X1 = 15;
const STOP_X = 13;
const NEAR = 0.2;
const SETTLE_FRAMES = 60;

const fmt = (value, digits = 3) => (Number.isFinite(value) ? Number(value).toFixed(digits) : "-");

/** Cajas de los fixtures de cada pie: `lx`, `ux` y `ly` (base) en metros. */
function footBoxes(player) {
    return player.rig.feet.map((id) => {
        let lx = Infinity;
        let ux = -Infinity;
        let ly = Infinity;
        for (let f = player.rag.bodies.get(id).GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
            const box = f.GetAABB(0);
            lx = Math.min(lx, box.get_lowerBound().get_x());
            ux = Math.max(ux, box.get_upperBound().get_x());
            ly = Math.min(ly, box.get_lowerBound().get_y());
        }
        return { lx, ux, ly };
    });
}

/** Partículas de `kind` en `LAYERS` capas entre `X0` y `X1` sobre la plataforma de aparición. */
function puddle(game, kind) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.WATER);
    def.set_color(color);
    let made = 0;
    for (let x = X0; x <= X1; x += SPACING) {
        for (let layer = 0; layer < LAYERS; layer++) {
            position.set_x(x);
            position.set_y(FLOOR_Y + 0.1 + layer * SPACING);
            def.set_position(position);
            if (store.create(def, { kind, origin: ORIGIN.MAP }) >= 0) made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    return made;
}

/** Desviación estándar de vx de las partículas a menos de `NEAR` del centro de algún pie; null con menos de 3. */
function vxSpread(game, boxes) {
    const { particleSystem: system, store } = game.state;
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const centers = boxes.map((b) => (b.lx + b.ux) / 2);
    const values = [];
    const n = system.GetParticleCount();
    for (let i = 0; i < n; i++) {
        const slot = store.slotAt(i);
        if (slot < 0 || store.alive[slot] === 0) continue;
        const x = Box2D.HEAPF32[pos + 2 * i];
        if (centers.some((c) => Math.abs(x - c) < NEAR)) values.push(Box2D.HEAPF32[vel + 2 * i]);
    }
    if (values.length < 3) return null;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

async function setup(kind, variant) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    const particles = kind ? puddle(game, kind) : 0;
    if (variant.noViscosity) game.state.viscosity.step = () => {};
    if (variant.noAdhesion) game.state.adhesion.update = () => {};
    game.frames(60);
    return { game, particles, player: game.state.players[0] };
}

function lift(player) {
    return Math.max(...footBoxes(player).map((b) => b.ly - FLOOR_Y));
}

/** El robot camina hasta `STOP_X`, suelta el stick y se mide 3 s parado. */
async function standing(kind, variant) {
    const { game, particles, player } = await setup(kind, variant);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    let guard = 0;
    while (player.torso.GetPosition().get_x() < STOP_X && guard++ < 600) game.frame();
    game.setPad(0);
    const arrivedAt = player.torso.GetPosition().get_x();
    const lifts = [];
    const torso = [];
    const spreads = [];
    const groundedFrames = [];
    let grounded = 0;
    for (let f = 0; f < 180; f++) {
        game.frame();
        lifts.push(lift(player));
        torso.push(player.torso.GetPosition().get_y());
        const g = player.isGrounded();
        groundedFrames.push(g);
        if (g) grounded++;
        const s = vxSpread(game, footBoxes(player));
        if (s !== null) spreads.push(s);
    }
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
    const window = (a) => a.slice(SETTLE_FRAMES);
    const sorted = window(lifts).sort((a, b) => a - b);
    return {
        particles,
        arrivedAt,
        liftMean: mean(lifts),
        liftMax: Math.max(...lifts),
        liftMedian: sorted[Math.floor(sorted.length / 2)],
        torsoMean: mean(torso) - FLOOR_Y,
        torsoWindow: mean(window(torso)) - FLOOR_Y,
        grounded: grounded / 180,
        groundedWindow: window(groundedFrames).filter(Boolean).length / (180 - SETTLE_FRAMES),
        spread: mean(spreads),
        endX: player.torso.GetPosition().get_x(),
    };
}

/** Camina 6 s a la derecha: velocidad media entre `X0` y `X1`, altura máxima del pie y fracción de frames con `grounded` dentro. */
async function walking(kind, variant) {
    const { game, particles, player } = await setup(kind, variant);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    const xs = [];
    let inside = 0;
    let grounded = 0;
    let liftMax = -Infinity;
    const torso = [];
    const spreads = [];
    for (let f = 0; f < 360; f++) {
        game.frame();
        const x = player.torso.GetPosition().get_x();
        xs.push(x);
        if (x >= X0 && x <= X1) {
            inside++;
            if (player.isGrounded()) grounded++;
            liftMax = Math.max(liftMax, lift(player));
            torso.push(player.torso.GetPosition().get_y() - FLOOR_Y);
            const s = vxSpread(game, footBoxes(player));
            if (s !== null) spreads.push(s);
        }
    }
    const at = (x) => xs.findIndex((v) => v >= x) / 60;
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
    const crossing = at(X1) - at(X0);
    return {
        particles,
        speed: crossing > 0 ? (X1 - X0) / crossing : NaN,
        liftMax,
        grounded: inside ? grounded / inside : NaN,
        torsoMean: mean(torso),
        spread: mean(spreads),
        endX: xs[xs.length - 1],
    };
}

const CASES = [
    ["seco", 0, {}],
    ["agua", FLUID.WATER, {}],
    ["miel todo activo", FLUID.HONEY, {}],
    ["miel sin viscosity", FLUID.HONEY, { noViscosity: true }],
    ["miel sin adhesion", FLUID.HONEY, { noAdhesion: true }],
    ["miel sin ninguno", FLUID.HONEY, { noViscosity: true, noAdhesion: true }],
];

test("#214: el robot pisa el piso bajo la miel y la cruza caminando", async () => {
    const rows = [];
    for (const [name, kind, variant] of CASES) {
        const s = await standing(kind, variant);
        const w = await walking(kind, variant);
        rows.push({ name, s, w });
    }
    const lines = [
        "caso | parts | PARADO 1-3 s: pie_mediana torso grounded | PARADO 0-3 s: pie_med pie_max torso grounded sdVx | CAMINANDO: m/s pie_max grounded torso sdVx x_final",
    ];
    for (const { name, s, w } of rows) {
        lines.push(
            `${name} | ${w.particles} | ${fmt(s.liftMedian)} ${fmt(s.torsoWindow)} ${fmt(s.groundedWindow, 2)} | ` +
                `${fmt(s.liftMean)} ${fmt(s.liftMax)} ${fmt(s.torsoMean, 2)} ${fmt(s.grounded, 2)} ${fmt(s.spread)} | ` +
                `${fmt(w.speed, 2)} ${fmt(w.liftMax)} ${fmt(w.grounded, 2)} ${fmt(w.torsoMean, 2)} ${fmt(w.spread)} ${fmt(w.endX, 1)}`,
        );
    }
    console.log(lines.join("\n"));
    const dry = rows[0];
    const honey = rows[2];
    assert.ok(honey.s.liftMedian <= 0.05, `mediana del pie parado ${fmt(honey.s.liftMedian)} m > 0,05`);
    assert.ok(honey.s.groundedWindow >= 0.95, `grounded parado ${fmt(honey.s.groundedWindow, 2)} < 0,95`);
    assert.ok(
        Math.abs(honey.s.torsoWindow - dry.s.torsoWindow) <= 0.02,
        `torso ${fmt(honey.s.torsoWindow)} vs seco ${fmt(dry.s.torsoWindow)}`,
    );
    assert.ok(honey.w.grounded >= 0.9, `grounded caminando ${fmt(honey.w.grounded, 2)} < 0,90`);
    assert.ok(honey.w.liftMax <= 0.2, `pie máximo caminando ${fmt(honey.w.liftMax)} m > 0,20`);
    assert.ok(honey.w.endX > 19, `x final ${fmt(honey.w.endX, 1)} <= 19`);
});
