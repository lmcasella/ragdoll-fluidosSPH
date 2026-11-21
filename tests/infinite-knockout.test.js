/**
 * Infinito: con la vida en 0 el robot queda en nocaut `KNOCKOUT.time` s y se levanta con `KNOCKOUT.reviveHp` (#275),
 * sobre LiquidFun real con gamepad simulado. El Clásico conserva la muerte con vida 0 y la tuerca de 35.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { BUTTON } from "./helpers/duel.js";
import { FLUID } from "../js/weapons.js";

const { KNOCKOUT, MAX_HP } = await import("../js/ActiveRagdoll.js");
const { REPAIR } = await import("../js/pickups.js");

const FRAME = 1 / 60;
const AIM_RIGHT = [0, 0, 1, 0];
const EVERYTHING = { buttons: [BUTTON.A, BUTTON.B, BUTTON.RT, BUTTON.LT], axes: [1, 0, 1, 0] };

async function infinite(search = "?seed=1") {
    globalThis.location = { search };
    const game = await loadGame({ map: "infinite" });
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

/** Congela la inundación: las pruebas largas miden el nocaut, no el agua. */
function freezeFlood(game) {
    game.state.flood.step = () => {};
}

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

const x = (player) => player.torso.GetPosition().get_x();

test("Infinito: con la vida en 0 el robot no muere, queda en nocaut con land_hurt y la ronda sigue", async () => {
    const game = await infinite();
    freezeFlood(game);
    const [p1] = game.state.players;
    assert.equal(p1.knocksOut, true);
    p1.hurt("b_1", 300);
    game.frames(3);
    assert.equal(p1.hp, 0);
    assert.equal(p1.dead, false);
    assert.equal(p1.knockedOut, true);
    assert.equal(p1.clipState, "landHurt");
    assert.equal(game.state.match.state, "playing");
    assert.ok(Math.abs(p1.knockoutLeft() - KNOCKOUT.time) < 0.2, `faltan ${p1.knockoutLeft()} s`);
});

test("Infinito: cada nocaut de la ronda dura KNOCKOUT.step s más que el anterior, hasta maxTime", async () => {
    const game = await infinite();
    freezeFlood(game);
    const [p1] = game.state.players;
    const expected = [5, 8, 11, 14, 17, 18];
    for (const seconds of expected) {
        p1.hurt("b_1", 300);
        game.frames(3);
        assert.equal(p1.knockedOut, true);
        assert.ok(Math.abs(p1.knockoutLeft() - seconds) < 0.2, `esperaba ${seconds} s, faltan ${p1.knockoutLeft()} s`);
        p1.wake(KNOCKOUT.reviveHp);
        game.frames(2);
    }
});

test("Infinito: en nocaut no responde a ningún control durante 15 s y después se levanta con 50 de vida", { timeout: 300000 }, async (t) => {
    const game = await infinite();
    freezeFlood(game);
    let [p1] = game.state.players;
    p1.weapon = FLUID.WATER;
    p1.tanks.set(FLUID.WATER, 500);
    game.setPad(0, EVERYTHING);
    game.frames(30);
    [p1] = game.state.players;
    p1.hurt("b_1", 300);
    game.frames(3);
    game.frames(60);
    const elapsed = 63;
    const before = game.state.particleSystem.GetParticleCount();
    const x0 = x(p1);
    const jumpAt = p1.jumpAt;
    let frames = 0;
    let end = null;
    let drift = 0;
    let particles = 0;
    let attacked = false;
    for (; frames < 20 * 60; frames++) {
        game.frame();
        if (!p1.knockedOut) {
            end = frames;
            break;
        }
        drift = Math.max(drift, Math.abs(x(p1) - x0));
        particles = Math.max(particles, game.state.particleSystem.GetParticleCount() - before);
        attacked ||= p1.attack !== null;
        assert.equal(p1.clipState, "landHurt");
    }
    t.diagnostic(`nocaut de ${((end + elapsed) * FRAME).toFixed(2)} s, deriva ${drift.toFixed(3)} m, partículas nuevas ${particles}`);
    assert.notEqual(end, null, "se levantó");
    const lasted = (end + elapsed) * FRAME;
    assert.ok(lasted >= KNOCKOUT.time - 0.2 && lasted <= KNOCKOUT.time + 0.2, `duró ${lasted} s`);
    assert.ok(drift < 0.2, `se movió ${drift} m con el stick a la derecha`);
    assert.equal(particles, 0, "no disparó");
    assert.equal(attacked, false, "no golpeó");
    assert.equal(p1.jumpAt, jumpAt, "no saltó");
    assert.equal(p1.hp, KNOCKOUT.reviveHp);
    assert.equal(p1.dead, false);
    assert.ok(p1.clipState === "getupFront" || p1.clipState === "getupBack", p1.clipState);
    game.frames(150);
    assert.equal(p1.recoverState, null, "terminó de levantarse");
    game.setPad(0, { axes: [1, 0, 0, 0] });
    const x1 = x(p1);
    game.frames(30);
    assert.ok(x(p1) - x1 > 1, "vuelve a responder al stick");
});

test("Infinito: más daño en nocaut no reinicia ni alarga el contador", async () => {
    const game = await infinite();
    freezeFlood(game);
    const [p1] = game.state.players;
    p1.hurt("b_1", 300);
    game.frames(3);
    const end = p1.knockoutEnd;
    game.frames(120);
    p1.hurt("b_1", 50);
    p1.burn("b_1");
    game.frames(30);
    assert.equal(p1.knockedOut, true);
    assert.equal(p1.knockoutEnd, end);
    assert.equal(p1.hp, 0);
});

test("Infinito: los golpes empujan a un robot en nocaut", async (t) => {
    const game = await infinite();
    freezeFlood(game);
    const [p1, p2] = game.state.players;
    place(game, 1, x(p1) + 0.9, p2.torso.GetPosition().get_y());
    game.frames(40);
    p2.hurt("b_1", 300);
    game.frames(3);
    const end = p2.knockoutEnd;
    const x0 = x(p2);
    let peak = 0;
    let hits = 0;
    let previous = p2.torso.GetLinearVelocity().get_x();
    for (let f = 0; f < 40; f++) {
        game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT });
        game.frame();
        hits = Math.max(hits, game.state.melee.hits.length);
        const vx = p2.torso.GetLinearVelocity().get_x();
        peak = Math.max(peak, vx - previous);
        previous = vx;
    }
    t.diagnostic(`golpe: pico de cambio de velocidad ${peak.toFixed(2)} m/s, corrimiento ${(x(p2) - x0).toFixed(2)} m`);
    assert.ok(hits >= 1, "el golpe conecta");
    assert.ok(peak > 0.5, `empuje ${peak}`);
    assert.ok(x(p2) - x0 > 0.3, `corrimiento ${x(p2) - x0}`);
    assert.equal(p2.knockedOut, true);
    assert.equal(p2.knockoutEnd, end);
});

test("Infinito: el chorro de agua empuja a un robot en nocaut", async (t) => {
    const game = await infinite();
    freezeFlood(game);
    const [p1, p2] = game.state.players;
    p1.weapon = FLUID.WATER;
    p1.tanks.set(FLUID.WATER, 500);
    place(game, 1, x(p1) + 2, p2.torso.GetPosition().get_y());
    game.frames(40);
    p2.hurt("b_1", 300);
    game.frames(3);
    const x0 = x(p2);
    const contacts = game.state.damage.stats.fluidContacts;
    let peak = 0;
    for (let f = 0; f < 90; f++) {
        game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT });
        game.frame();
        peak = Math.max(peak, x(p2) - x0);
    }
    t.diagnostic(`chorro 1,5 s: corrimiento máximo ${peak.toFixed(3)} m, contactos ${game.state.damage.stats.fluidContacts - contacts}`);
    assert.ok(game.state.damage.stats.fluidContacts > contacts, "el agua toca al robot");
    assert.ok(peak > 0.05, `corrimiento ${peak}`);
    assert.equal(p2.knockedOut, true);
});

test("Infinito: la tuerca deja la vida en 100 y levanta en el acto a un robot en nocaut", async () => {
    const game = await infinite();
    freezeFlood(game);
    const [p1] = game.state.players;
    const nut = game.state.pickups.points.find((p) => p.kind === "repair");
    assert.ok(nut, "hay una tuerca");
    p1.hp = 20;
    p1.repair(REPAIR.hp);
    assert.equal(p1.hp, MAX_HP, "con 20 de vida deja 100 y no 55");
    p1.hurt("b_1", 300);
    game.frames(3);
    assert.equal(p1.knockedOut, true);
    assert.equal(p1.intact, false);
    place(game, 0, nut.x, nut.y + game.state.pickups.offsetY);
    game.frames(5);
    assert.equal(p1.knockedOut, false, "la tuerca lo levantó");
    assert.equal(p1.hp, MAX_HP);
    assert.ok(p1.clipState === "getupFront" || p1.clipState === "getupBack", p1.clipState);
    assert.equal(nut.active, false, "la tuerca se consumió");
});

test("Infinito: el agua saca a un robot en nocaut y la ronda termina", async () => {
    const game = await infinite();
    const [p1] = game.state.players;
    p1.hurt("b_1", 300);
    game.frames(3);
    assert.equal(p1.knockedOut, true);
    const surface = game.state.flood.eta;
    place(game, 0, x(p1), surface - 1.5);
    game.frames(30);
    assert.equal(p1.dead, true, "ahogado en nocaut");
    assert.equal(p1.knockedOut, false);
    assert.equal(p1.clipState, "dead");
    game.frames(10);
    assert.notEqual(game.state.match.state, "playing");
    assert.equal(game.state.match.roundWinner, 1);
});

test("Infinito: el HUD muestra la barra y el número de vida, el '−N' de daño y el contador del nocaut", async () => {
    const game = await infinite();
    freezeFlood(game);
    const [p1] = game.state.players;
    const panel = game.state.hud.panels[0];
    p1.takeDamage(40);
    game.frames(2);
    assert.equal(panel.num.textContent, "60");
    assert.equal(panel.fill.style.width, "60.0%");
    const floaters = game.state.hud.floaters.filter((fl) => fl.active);
    assert.equal(floaters.length, 1);
    assert.equal(floaters[0].n.textContent, "−40");
    const counter = game.state.hud.knockouts[0];
    assert.ok(counter.el.hidden, "sin nocaut no hay contador");
    p1.hurt("b_1", 300);
    game.frames(3);
    assert.equal(panel.num.textContent, "0");
    assert.equal(counter.el.hidden, false);
    assert.equal(counter.n.textContent, String(KNOCKOUT.time));
    game.frames(60);
    assert.equal(counter.n.textContent, String(KNOCKOUT.time - 1));
    assert.equal(game.state.hud.knockouts[1].el.hidden, true);
    p1.repair(REPAIR.hp);
    game.frames(2);
    assert.ok(counter.el.hidden, "al levantarse el contador desaparece");
    assert.equal(panel.num.textContent, "100");
});

test("Clásico: la vida en 0 mata y la tuerca suma 35", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame();
    const [p1] = game.state.players;
    assert.equal(p1.knocksOut, false);
    assert.equal(p1.hp, MAX_HP);
    p1.hp = 50;
    assert.equal(p1.intact, false);
    p1.repair(REPAIR.hp);
    assert.equal(p1.hp, 50 + REPAIR.hp);
    p1.repair(REPAIR.hp);
    assert.equal(p1.hp, MAX_HP, "con tope en 100");
    p1.takeDamage(150);
    assert.equal(p1.hp, 0);
    assert.equal(p1.dead, true);
    assert.equal(p1.knockedOut, false);
    game.frames(5);
    assert.equal(p1.clipState, "dead");
    assert.equal(game.state.hud.panels[0].num.textContent, "0");
});
