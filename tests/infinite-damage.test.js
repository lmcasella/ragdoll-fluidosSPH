/**
 * Infinito: el daño es un % acumulado que sube el empuje y solo el agua mata (#162), sobre LiquidFun real con gamepad
 * simulado. El mapa clásico conserva la vida de 100 y la muerte por daño.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { BUTTON, AIM_RIGHT, startDuel, run } from "./helpers/duel.js";

const { KNOCKBACK, MAX_HP, extraScale } = await import("../js/ActiveRagdoll.js");
const { REPAIR } = await import("../js/pickups.js");
const { MELEE } = await import("../js/melee.js");

async function infinite(search = "?seed=1") {
    globalThis.location = { search };
    return loadGame({ map: "infinite" });
}

/** Pasa de J2 el robot a acumular daño, como en Infinito, con `pct` % ya recibidos. */
function accumulate(player, pct) {
    player.accumulates = true;
    player.damagePct = pct;
}

/**
 * Cambio de velocidad horizontal (m/s) del torso de J2 en el frame en que conecta el primer golpe de J1 (el empuje del
 * juego sin la reacción posterior ni el roce de los cuerpos), con `pct` % de daño acumulado.
 */
async function meleeKick(pct) {
    const game = await startDuel(0.8);
    const [, p2] = game.state.players;
    accumulate(p2, pct);
    let previous = p2.torso.GetLinearVelocity().get_x();
    let jump = null;
    const hits = run(
        game,
        30,
        (f) => game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT }),
        () => {
            const vx = p2.torso.GetLinearVelocity().get_x();
            if (jump === null && game.state.melee.hits.length > 0) jump = vx - previous;
            previous = vx;
        },
    );
    assert.equal(hits.length, 1);
    return jump;
}

test("Infinito: un robot con 300 % de daño no muere por daño y muere al quedar sumergido", async () => {
    const game = await infinite();
    const [p1, p2] = game.state.players;
    assert.equal(p1.accumulates, true);
    assert.equal(p1.damagePct, 0);
    p1.hurt("b_1", 300);
    p1.takeDamage(10);
    game.frames(10);
    assert.ok(p1.damagePct >= 300);
    assert.equal(p1.dead, false, "300 % no mata");
    assert.equal(game.state.match.state, "playing");
    p2.drown(game.state.match.roundTime);
    assert.equal(p2.dead, true, "ahogado muere");
    game.frames(5);
    assert.notEqual(game.state.match.state, "playing", "la ronda termina por el ahogado");
    assert.equal(game.state.match.roundWinner, 0);
});

test("Infinito: el HUD muestra el % de daño en lugar de la salud, y Clásico sigue mostrando la salud", async () => {
    const game = await infinite();
    game.state.players[0].damagePct = 47.9;
    game.frames(2);
    const panel = game.state.hud.panels[0];
    assert.ok(panel.el.classes.has("infinite") && !panel.el.classes.has("classic"));
    assert.equal(panel.bigValue.textContent, "47");
    globalThis.location = { search: "" };
    const classic = await loadGame();
    classic.frames(2);
    const classicPanel = classic.state.hud.panels[0];
    assert.ok(classicPanel.el.classes.has("classic") && !classicPanel.el.classes.has("infinite"));
    assert.equal(classicPanel.num.textContent, "100");
});

test("Clásico: la vida sigue siendo 100 y el daño mata", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame();
    const [p1] = game.state.players;
    assert.equal(p1.accumulates, false);
    assert.equal(p1.hp, MAX_HP);
    p1.takeDamage(150);
    assert.equal(p1.hp, 0);
    assert.equal(p1.dead, true);
    assert.equal(p1.knockbackFactor, 1);
});

test("Empuje: el factor es 1 + scale · daño / 100", async () => {
    const game = await infinite();
    const [p1] = game.state.players;
    assert.equal(KNOCKBACK.scale, 1);
    assert.equal(p1.knockbackFactor, 1);
    p1.damagePct = 100;
    assert.equal(p1.knockbackFactor, 1 + KNOCKBACK.scale);
    p1.damagePct = 250;
    assert.equal(p1.knockbackFactor, 1 + (KNOCKBACK.scale * 250) / 100);
});

test("Melee: el mismo golpe cambia el doble la velocidad del torso con 100 % que con 0 % (±10 %)", { timeout: 120000 }, async (t) => {
    const base = await meleeKick(0);
    const doubled = await meleeKick(100);
    t.diagnostic(`golpe 1 del combo: 0 % -> ${base.toFixed(3)} m/s, 100 % -> ${doubled.toFixed(3)} m/s, razón ${(doubled / base).toFixed(3)}`);
    assert.ok(MELEE.attacks.combo1.push[0] > 0);
    assert.ok(base > 0.5, `0 %: ${base}`);
    assert.ok(Math.abs(doubled / base - 2) <= 0.2, `razón ${doubled / base}`);
});

/** Corrimiento horizontal (m) de J2 con un chorro de agua de J1 durante 1,5 s, con `pct` % de daño acumulado. */
async function jetPush(pct) {
    const game = await startDuel(2);
    const [p1, p2] = game.state.players;
    accumulate(p2, pct);
    const x0 = p2.torso.GetPosition().get_x();
    let peak = 0;
    run(
        game,
        90,
        () => game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT }),
        () => {
            peak = Math.max(peak, p2.torso.GetPosition().get_x() - x0);
        },
    );
    assert.ok(p1.tanks.size > 0);
    return peak;
}

test("Chorro: el agua desplaza más a un robot con 100 % que con 0 %", { timeout: 120000 }, async (t) => {
    const base = await jetPush(0);
    const loaded = await jetPush(100);
    t.diagnostic(`chorro de agua 1,5 s: 0 % -> ${base.toFixed(3)} m, 100 % -> ${loaded.toFixed(3)} m, razón ${(loaded / base).toFixed(2)}`);
    assert.ok(loaded > base * 1.3, `0 %: ${base}, 100 %: ${loaded}`);
});

test("Reparación: con 30 % de daño queda en 0 % y nunca negativo; con 0 % no se recoge", async () => {
    const game = await infinite();
    const [p1] = game.state.players;
    p1.damagePct = 0;
    assert.equal(p1.intact, true);
    p1.damagePct = 30;
    assert.equal(p1.intact, false);
    p1.repair(REPAIR.hp);
    assert.equal(p1.damagePct, 0);
    p1.damagePct = 100;
    p1.repair(REPAIR.hp);
    assert.equal(p1.damagePct, 100 - REPAIR.hp);
    p1.repair(Infinity);
    assert.equal(p1.damagePct, 0);
});

test("Infinito: una ronda de dos bots termina por agua y no por daño", { timeout: 300000 }, async (t) => {
    const game = await infinite("?bot=1,2&seed=1");
    let frames = 0;
    for (; frames < 240 * 60 && game.state.match.state === "playing"; frames++) game.frame();
    const [p1, p2] = game.state.players;
    t.diagnostic(`fin a los ${(frames / 60).toFixed(1)} s: estado ${game.state.match.state}, daño ${p1.damagePct.toFixed(0)} % / ${p2.damagePct.toFixed(0)} %, ahogados ${p1.drowned} / ${p2.drowned}`);
    assert.notEqual(game.state.match.state, "playing", "la ronda terminó");
    const loser = [p1, p2].find((p) => p.dead);
    assert.ok(loser, "alguien murió");
    assert.equal(loser.drowned, true, "murió ahogado");
});

test("Daño acumulado: se satura en KNOCKBACK.maxPct con daño forzado de 10.000", async () => {
    const game = await infinite();
    const [p1] = game.state.players;
    assert.equal(KNOCKBACK.maxPct, 500);
    p1.takeDamage(10000);
    assert.equal(p1.damagePct, 500);
    p1.hurt("b_1", 10000);
    assert.equal(p1.damagePct, 500);
    p1.repair(100);
    assert.equal(p1.damagePct, 400);
    p1.takeDamage(10000);
    assert.equal(p1.damagePct, 500);
    assert.equal(p1.knockbackFactor, 6);
});

test("extraScale: recorta el extra para no pasar del límite y no suma rapidez a una pieza ya más rápida", () => {
    assert.equal(extraScale(0, 0, 10, 0, 25), 1);
    assert.equal(extraScale(0, 0, 0, 0, 25), 1);
    const t = extraScale(20, 0, 10, 0, 25);
    assert.ok(Math.abs(t - 0.5) < 1e-9, `t ${t}`);
    assert.equal(extraScale(30, 0, 10, 0, 25), 0);
    assert.equal(extraScale(30, 0, -10, 0, 25), 1);
    assert.ok(Math.hypot(20 + 10 * extraScale(20, 0, 10, 5, 25), 5 * extraScale(20, 0, 10, 5, 25)) <= 25 + 1e-9);
});

/** Rapidez máxima (m/s) de las piezas de `player` en este instante. */
function peakSpeed(player) {
    let peak = 0;
    for (const body of player.rag.bodies.values()) {
        const v = body.GetLinearVelocity();
        peak = Math.max(peak, Math.hypot(v.get_x(), v.get_y()));
    }
    return peak;
}

test("Con 500 % de daño, un golpe y un chorro de 2 s no pasan de 25 m/s, sin NaN y con el robot entero", { timeout: 120000 }, async (t) => {
    const game = await startDuel(0.8);
    const [p1, p2] = game.state.players;
    accumulate(p2, KNOCKBACK.maxPct);
    const bodies = p2.rag.bodies.size;
    const fixtures = p2.countFixtures();
    let peak = 0;
    let finite = true;
    const watch = () => {
        peak = Math.max(peak, peakSpeed(p2));
        for (const body of p2.rag.bodies.values()) {
            const pos = body.GetPosition();
            if (!Number.isFinite(pos.get_x()) || !Number.isFinite(pos.get_y())) finite = false;
        }
    };
    const hits = run(game, 40, (f) => game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT }), watch);
    assert.ok(hits.length >= 1, "el golpe conecta");
    const afterHit = peak;
    game.setPad(0);
    game.frames(30);
    run(game, 120, () => game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT }), watch);
    t.diagnostic(`500 %: pico tras el golpe ${afterHit.toFixed(2)} m/s, pico con el chorro ${peak.toFixed(2)} m/s`);
    assert.ok(p1.tanks.size > 0);
    assert.equal(finite, true, "sin NaN");
    assert.ok(peak <= KNOCKBACK.maxSpeed + 1e-3, `pico ${peak}`);
    assert.equal(p2.rag.bodies.size, bodies);
    assert.equal(p2.countFixtures(), fixtures);
    assert.equal(p2.damagePct, 500);
});


