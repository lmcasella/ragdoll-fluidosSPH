/**
 * Bots estratégicos en Infinito (#168): bot contra bot sobre la escena real con LiquidFun, semillas 1 a 3, 60 s o hasta
 * que termina la ronda. Mide la altura del que va adelante, cuánto del tiempo que dispara está quieto apoyado, la ráfaga
 * continua más larga y el tanque que gasta con el rival lejos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "../helpers/game.js";

const { PAD } = await import("../../src/input/Input.js");
const { Bot } = await import("../../src/ai/bot.js");
const { weaponById, refillTanks } = await import("../../src/combat/weapons.js");
const { CLIMB } = await import("../../src/level/climb.js");

const SEEDS = [1, 2, 3];
const FRAMES = 60 * 60;
const STILL_SPEED = 0.3;
const FAR = 3;

/** Corre una partida de bots en Infinito y devuelve las métricas por semilla. */
async function measure(seed, armed) {
    globalThis.location = { search: `?bot=1,2&seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    const { players, bots, match } = game.state;
    if (armed) players.forEach(refillTanks);
    const stats = players.map(() => ({ fireFrames: 0, stillFrames: 0, run: 0, longest: 0, minFarFraction: 1, emptiedFar: 0, maxY: 0, hadTank: false }));
    let frames = 0;
    while (frames < FRAMES && match.state === "playing") {
        game.frame();
        frames++;
        players.forEach((me, k) => {
            const s = stats[k];
            const pos = me.torso.GetPosition();
            s.maxY = Math.max(s.maxY, pos.get_y() - game.state.climb.offsetY);
            if (me.dead) {
                s.run = 0;
                return;
            }
            const firing = bots.get(k).pad.buttons[PAD.fire].pressed && (me.tanks.get(me.weapon) ?? 0) > 0;
            const foe = players[1 - k];
            const dist = Math.hypot(foe.torso.GetPosition().get_x() - pos.get_x(), foe.torso.GetPosition().get_y() - pos.get_y());
            if (firing) {
                s.fireFrames++;
                s.run++;
                s.longest = Math.max(s.longest, s.run);
                if (me.grounded && Math.abs(me.torso.GetLinearVelocity().get_x()) < STILL_SPEED) s.stillFrames++;
            } else {
                s.run = 0;
            }
            const weapon = weaponById(me.weapon);
            if (weapon && dist > FAR) {
                const tank = me.tanks.get(weapon.id) ?? 0;
                if (tank > 0) s.hadTank = true;
                s.minFarFraction = Math.min(s.minFarFraction, tank / weapon.tank);
                if (s.hadTank && tank <= 0 && firing === false && me.tanks.get(weapon.id) === 0) s.emptiedFar++;
            }
        });
    }
    globalThis.location = { search: "" };
    const lead = Math.max(...stats.map((s) => s.maxY));
    const fireFrames = stats.reduce((a, s) => a + s.fireFrames, 0);
    const stillFrames = stats.reduce((a, s) => a + s.stillFrames, 0);
    const longest = Math.max(...stats.map((s) => s.longest)) / 60;
    const minFar = Math.min(...stats.map((s) => s.minFarFraction));
    console.log(`  fin: ${players.map((p) => `hp ${p.hp.toFixed(0)} dead ${p.dead} y ${p.torso.GetPosition().get_y().toFixed(1)}`).join(" | ")}, agua ${game.state.flood.level.toFixed(1)}, estado ${match.state}`);
    return { seed, seconds: frames / 60, lead, fireSeconds: fireFrames / 60, stillShare: fireFrames ? stillFrames / fireFrames : 0, longest, minFar, stats };
}

test("Infinito: la etapa 0 no tiene armas y las etapas 1 a 4 respetan los tiers de armas", async () => {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    assert.ok(game.state.pickups.points.length > 0);
    assert.ok(game.state.pickups.points.every((p) => p.y >= CLIMB.stageHeight), "ninguna arma en la etapa 0");
    const names = (entry) => Object.keys(entry.weights).sort();
    assert.deepEqual(names(CLIMB.pickups[0]), ["WATER"]);
    assert.deepEqual(names(CLIMB.pickups[1]), ["HONEY", "LAVA", "WATER"]);
    assert.ok(CLIMB.pickups[1].weights.LAVA < CLIMB.pickups[1].weights.WATER, "lava ocasional");
    assert.deepEqual(names(CLIMB.pickups[2]), ["LAVA"]);
    assert.deepEqual(names(CLIMB.pickups[3]), ["ACID", "LAVA"]);
    globalThis.location = { search: "" };
});

test("bot contra bot armados desde el arranque, semillas 1 a 3: disparan en ráfagas cortas moviéndose y guardan tanque", { timeout: 900000 }, async () => {
    const failures = [];
    let fireSeconds = 0;
    let stillSeconds = 0;
    for (const seed of SEEDS) {
        const m = await measure(seed, true);
        fireSeconds += m.fireSeconds;
        stillSeconds += m.fireSeconds * m.stillShare;
        console.log(
            `semilla ${seed}: ${m.seconds.toFixed(1)} s, adelante ${m.lead.toFixed(1)} m, dispara ${m.fireSeconds.toFixed(1)} s, quieto ${(m.stillShare * 100).toFixed(0)} %, ráfaga más larga ${m.longest.toFixed(2)} s, tanque mínimo con rival lejos ${(m.minFar * 100).toFixed(0)} %`,
        );
        if (m.longest > 0.8) failures.push(`semilla ${seed}: ráfaga ${m.longest.toFixed(2)} s`);
        if (m.minFar <= 0) failures.push(`semilla ${seed}: vació el tanque con el rival lejos`);
    }
    assert.deepEqual(failures, []);
});

test("bot contra bot desde el arranque de Infinito, semillas 1 a 3: el que va adelante sube al menos 30 m de altura local", { timeout: 900000 }, async () => {
    const failures = [];
    for (const seed of SEEDS) {
        const m = await measure(seed, false);
        console.log(`desde el arranque, semilla ${seed}: ${m.seconds.toFixed(1)} s, adelante ${m.lead.toFixed(1)} m locales`);
        if (m.lead < 30) failures.push(`semilla ${seed}: adelante ${m.lead.toFixed(1)} m`);
    }
    assert.deepEqual(failures, []);
});

const noop = () => {};

/** Un bot solo (`k`), el otro robot inerte e inmortal: devuelve si llegó a una plataforma de la etapa 1 y cuándo, o cómo falló. */
async function firstRowRun(seed, k) {
    globalThis.location = { search: `?seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    const { players, bots } = game.state;
    bots.set(k, new Bot({ k, world: game.state.world, seed: seed + k, level: game.state.climb.level }));
    Object.assign(players[1 - k], { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
    const bot = bots.get(k);
    let result = null;
    for (let frame = 0; frame < 60 * 40 && result === null; frame++) {
        game.frame();
        const me = players[k];
        if (me.dead) result = { ok: false, why: `murió a los ${(frame / 60).toFixed(1)} s` };
        else if (me.grounded) {
            const node = bot.supportOf(me);
            if (node !== null && bot.nav.nodes[node].top > CLIMB.stageHeight) result = { ok: true, at: frame / 60 };
        }
    }
    globalThis.location = { search: "" };
    return result ?? { ok: false, why: "no llegó en 40 s" };
}

/** Con las filas de #227 llegan los dos bots en 7 de 10 semillas como mínimo; la revisión del bot es #174 (M5). */
test("etapa 1: J1 y J2, cada uno solo, llegan a una plataforma de la etapa 1 sin caer al agua (al menos 7 de 10 semillas)", { timeout: 1800000 }, async () => {
    const failures = [];
    let good = 0;
    for (let seed = 1; seed <= 10; seed++) {
        let both = true;
        for (const k of [0, 1]) {
            const r = await firstRowRun(seed, k);
            console.log(`semilla ${seed} J${k + 1}: ${r.ok ? `llegó a los ${r.at.toFixed(1)} s` : r.why}`);
            if (!r.ok) {
                both = false;
                failures.push(`semilla ${seed} J${k + 1}: ${r.why}`);
            }
        }
        if (both) good++;
    }
    assert.ok(good >= 7, `${good} de 10 semillas: ${failures.join("; ")}`);
});
