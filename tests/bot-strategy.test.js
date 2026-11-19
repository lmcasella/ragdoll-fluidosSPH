/**
 * Bots estratégicos en Infinito (#168): bot contra bot sobre la escena real con LiquidFun, semillas 1 a 3, 60 s o hasta
 * que termina la ronda. Mide la altura del que va adelante, cuánto del tiempo que dispara está quieto apoyado, la ráfaga
 * continua más larga y el tanque que gasta con el rival lejos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { PAD } = await import("../js/Input.js");
const { Bot } = await import("../js/bot.js");
const { weaponById, refillTanks } = await import("../js/weapons.js");
const { CLIMB } = await import("../js/climb.js");

const SEEDS = [1, 2, 3];
const FRAMES = 60 * 60;
const STILL_SPEED = 0.3;
const FAR = 3;

/** Plataformas de la fila más baja generada, de izquierda a derecha. */
function firstStageRow(game) {
    const solids = game.state.climb.level.solids.filter((s) => s.kind === "platform" && s.y + s.h / 2 > CLIMB.baseMaxTop);
    const top = Math.min(...solids.map((s) => s.y + s.h / 2));
    return solids.filter((s) => Math.abs(s.y + s.h / 2 - top) < 1e-6).sort((a, b) => a.x - b.x);
}

/** Pone al robot `k` con el torso en (x, y), sin velocidad. */
function place(game, k, x, y) {
    const player = game.state.players[k];
    const torso = player.torso.GetPosition();
    const dx = x - torso.get_x();
    const dy = y - torso.get_y();
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y() + dy);
        body.SetTransform(v, body.GetAngle());
        body.SetAwake(true);
    }
    Box2D.destroy(v);
}

/** Corre una partida de bots en Infinito y devuelve las métricas por semilla. */
async function measure(seed, armed) {
    globalThis.location = { search: `?bot=1,2&seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    const { players, bots, match } = game.state;
    if (armed) {
        players.forEach(refillTanks);
        const row = firstStageRow(game);
        place(game, 0, row[0].x, row[0].y + row[0].h / 2 + 0.9);
        place(game, 1, row[row.length - 1].x, row[row.length - 1].y + row[row.length - 1].h / 2 + 0.9);
        console.log(`  fila a ${(row[0].y + row[0].h / 2).toFixed(1)} m, plataformas x: ${row.map((s) => s.x.toFixed(1)).join(", ")}`);
    }
    const stats = players.map(() => ({ fireFrames: 0, stillFrames: 0, run: 0, longest: 0, minFarFraction: 1, emptiedFar: 0, maxY: 0, hadTank: false }));
    let frames = 0;
    while (frames < FRAMES && match.state === "playing") {
        game.frame();
        frames++;
        players.forEach((me, k) => {
            const s = stats[k];
            const pos = me.torso.GetPosition();
            s.maxY = Math.max(s.maxY, pos.get_y());
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
    const pickups = game.state.climb.points.filter((p) => p.y <= CLIMB.baseMaxTop + 1).length;
    console.log(`  fin: ${players.map((p) => `hp ${p.hp.toFixed(0)} dead ${p.dead} y ${p.torso.GetPosition().get_y().toFixed(1)}`).join(" | ")}, agua ${game.state.flood.level.toFixed(1)}, estado ${match.state}`);
    return { seed, seconds: frames / 60, lead, fireSeconds: fireFrames / 60, stillShare: fireFrames ? stillFrames / fireFrames : 0, longest, minFar, pickups, stats };
}

test("Infinito: la etapa 0 no tiene armas y las etapas 1 a 4 respetan los tiers de armas", async () => {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    assert.ok(game.state.pickups.points.length > 0);
    assert.ok(game.state.pickups.points.every((p) => p.y > CLIMB.baseMaxTop), "ninguna arma en la etapa 0");
    const names = (entry) => Object.keys(entry.weights).sort();
    assert.deepEqual(names(CLIMB.pickups[0]), ["WATER"]);
    assert.deepEqual(names(CLIMB.pickups[1]), ["HONEY", "LAVA", "WATER"]);
    assert.ok(CLIMB.pickups[1].weights.LAVA < CLIMB.pickups[1].weights.WATER, "lava ocasional");
    assert.deepEqual(names(CLIMB.pickups[2]), ["LAVA"]);
    assert.deepEqual(names(CLIMB.pickups[3]), ["ACID", "LAVA"]);
    globalThis.location = { search: "" };
});

test("bot contra bot armados en la primera fila, semillas 1 a 3: ganan altura, disparan en ráfagas cortas moviéndose y guardan tanque", { timeout: 900000 }, async () => {
    const failures = [];
    for (const seed of SEEDS) {
        const m = await measure(seed, true);
        console.log(
            `semilla ${seed}: ${m.seconds.toFixed(1)} s, adelante ${m.lead.toFixed(1)} m, dispara ${m.fireSeconds.toFixed(1)} s, quieto ${(m.stillShare * 100).toFixed(0)} %, ráfaga más larga ${m.longest.toFixed(2)} s, tanque mínimo con rival lejos ${(m.minFar * 100).toFixed(0)} %`,
        );
        if (m.lead < 30) failures.push(`semilla ${seed}: adelante ${m.lead.toFixed(1)} m`);
        if (m.fireSeconds <= 0) failures.push(`semilla ${seed}: no disparó`);
        if (m.stillShare > 0.15) failures.push(`semilla ${seed}: quieto ${(m.stillShare * 100).toFixed(0)} %`);
        if (m.longest > 0.8) failures.push(`semilla ${seed}: ráfaga ${m.longest.toFixed(2)} s`);
        if (m.minFar <= 0) failures.push(`semilla ${seed}: vació el tanque con el rival lejos`);
    }
    assert.deepEqual(failures, []);
});

test("bot contra bot desde el arranque de Infinito, semillas 1 a 3 (informativo)", { timeout: 900000 }, async () => {
    for (const seed of SEEDS) {
        const m = await measure(seed, false);
        console.log(`desde el arranque, semilla ${seed}: ${m.seconds.toFixed(1)} s, adelante ${m.lead.toFixed(1)} m`);
    }
});
const noop = () => {};

/** Un bot solo (`k`), el otro robot inerte e inmortal: devuelve si llegó a la primera fila generada y cuándo, o cómo falló. */
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
            if (node !== null && bot.nav.nodes[node].top > CLIMB.baseMaxTop) result = { ok: true, at: frame / 60 };
        }
    }
    globalThis.location = { search: "" };
    return result ?? { ok: false, why: "no llegó en 40 s" };
}

test("primera fila: J1 y J2, cada uno solo, llegan a la primera fila generada sin caer al agua (semillas 1 a 10)", { timeout: 1800000 }, async () => {
    const failures = [];
    for (let seed = 1; seed <= 10; seed++) {
        for (const k of [0, 1]) {
            const r = await firstRowRun(seed, k);
            console.log(`semilla ${seed} J${k + 1}: ${r.ok ? `llegó a los ${r.at.toFixed(1)} s` : r.why}`);
            if (!r.ok) failures.push(`semilla ${seed} J${k + 1}: ${r.why}`);
        }
    }
    assert.deepEqual(failures, []);
});
