import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { SHOT_SYSTEM } from "../js/weapons.js";

const RT = 7;
const PARTICLE_RADIUS = SHOT_SYSTEM.radius;
const G = 9.8;
const NEAR = 2;
const MAX_JUMP = 0.03;
const MIN_ENERGY = 1;
const SECONDS = 6;
/** Frames con la mira quieta antes de disparar: el robot asienta la pose `aim` en ~1 s y la boca deja de moverse. */
const AIM_SETTLE_FRAMES = 90;

/**
 * Agua 6 s con la mira quieta. `skip(f)` es el salto de reloj antes del frame f. Devuelve la mayor suba relativa de
 * ½|v|² + g·y entre dos frames para partículas a menos de 2 m de la boca, la cantidad de subas > 3 % y la menor
 * distancia entre una partícula y cualquier otra en el instante en que nace.
 */
async function measure(skip, frames) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    const { players, particleSystem: system, store, emitter } = game.state;
    const fire = emitter.fire.bind(emitter);
    const pos = () => Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = () => Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    let minBirth = Infinity;
    let born = [];
    emitter.fire = (...args) => {
        const first = system.GetParticleCount();
        const made = fire(...args);
        const p = pos();
        const count = system.GetParticleCount();
        for (let i = first; i < count; i++) {
            born.push(store.slotAt(i));
            for (let j = 0; j < count; j++) {
                if (j === i) continue;
                const d = Math.hypot(Box2D.HEAPF32[p + 2 * i] - Box2D.HEAPF32[p + 2 * j], Box2D.HEAPF32[p + 2 * i + 1] - Box2D.HEAPF32[p + 2 * j + 1]);
                if (d < minBirth) minBirth = d;
            }
        }
        return made;
    };

    game.setPad(0, { axes: [0, 0, 1, 0] });
    game.frames(AIM_SETTLE_FRAMES);
    game.setPad(0, { buttons: [RT], axes: [0, 0, 1, 0] });
    const player = players[0];
    const water = player.weapon;
    let prev = new Map();
    let worst = 1;
    let jumps = 0;
    for (let f = 0; f < frames; f++) {
        player.tanks.set(water, 1000);
        game.skipTime(skip(f));
        born = [];
        game.frame();
        for (const slot of born) prev.delete(slot);
        const muzzle = player.muzzle();
        const p = pos();
        const v = vel();
        const next = new Map();
        for (let i = 0; i < system.GetParticleCount(); i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || !store.alive[slot]) continue;
            const x = Box2D.HEAPF32[p + 2 * i];
            const y = Box2D.HEAPF32[p + 2 * i + 1];
            const vx = Box2D.HEAPF32[v + 2 * i];
            const vy = Box2D.HEAPF32[v + 2 * i + 1];
            const e = 0.5 * (vx * vx + vy * vy) + G * y;
            if (Math.hypot(x - muzzle.x, y - muzzle.y) < NEAR && prev.has(slot) && prev.get(slot) > MIN_ENERGY) {
                const ratio = e / prev.get(slot);
                if (ratio > worst) worst = ratio;
                if (ratio > 1 + MAX_JUMP) jumps++;
            }
            next.set(slot, e);
        }
        prev = next;
    }
    return { worst, jumps, minBirth };
}

const FRAME = 1 / 60;
const conditions = [
    ["120 Hz", () => -FRAME / 2],
    ["60 Hz con jitter de ±2,5 ms", (f) => (f % 2 ? 0.0025 : -0.0025)],
];

for (const [name, skip] of conditions) {
    test(`el chorro de Agua no crea energía al nacer: ${name}`, async () => {
        const frames = Math.round(SECONDS * (name.startsWith("120") ? 120 : 60));
        const { worst, jumps, minBirth } = await measure(skip, frames);
        console.log(`${name}: suba máxima ×${worst.toFixed(3)}, ${jumps} subas > 3 %, distancia mínima al nacer ${(minBirth * 1000).toFixed(1)} mm`);
        assert.equal(jumps, 0, `${jumps} subas de energía > 3 % (máx ×${worst.toFixed(3)})`);
        assert.ok(minBirth >= 1.5 * PARTICLE_RADIUS - 0.001, `distancia mínima al nacer ${minBirth}`);
    });
}
