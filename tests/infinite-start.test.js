/**
 * Ascenso infinito (#25): equipo inicial sin armas, el bot que las busca, el premio por etapa y el cartel de controles
 * solo en el menú (#163), sobre LiquidFun real con gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { WEAPONS, FLUID } from "../js/weapons.js";
import { CLIMB, StagePrizes } from "../js/climb.js";

const FIRE = 7;
const AIM_RIGHT = [0, 0, 1, 0];
const tankOf = (id) => WEAPONS.find((w) => w.id === id).tank;

async function infinite(search = "?seed=1") {
    globalThis.location = { search };
    return loadGame({ map: "infinite" });
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

/** Plataformas de la etapa `stage` (alturas locales), de la más ancha a la más angosta. */
function platformsOfStage(game, stage) {
    return game.state.climb.level.solids
        .filter((s) => s.kind === "platform" && s.y + s.h / 2 >= stage * CLIMB.stageHeight && s.y + s.h / 2 < (stage + 1) * CLIMB.stageHeight)
        .sort((a, b) => b.w - a.w);
}

/** Plataformas de la etapa stage sin arma encima, para que pararse no recoja nada. */
function bareOfStage(game, stage) {
    const points = game.state.climb.points;
    return platformsOfStage(game, stage).filter((s) => !points.some((p) => Math.abs(p.x - s.x) < 1e-6 && Math.abs(p.y - (s.y + s.h / 2 + CLIMB.pickupLift)) < 1e-6));
}

function standOn(game, k, solid) {
    place(game, k, solid.x, solid.y + solid.h / 2 + 0.9 + game.state.climb.offsetY);
}

test("Infinito: J1 arranca sin arma ni tanques, el gatillo no crea partículas y no hay mira láser ni tanque en el HUD", async () => {
    const game = await infinite();
    const [p1, p2] = game.state.players;
    assert.equal(p1.weapon, null);
    assert.equal(p2.weapon, null);
    assert.equal(p1.tanks.size, 0);
    game.setPad(0, { buttons: [FIRE], axes: AIM_RIGHT });
    game.frames(90);
    assert.equal(game.state.particleSystem.GetParticleCount(), 0);
    assert.equal(game.laserMoves, 0, "ninguna mira láser");
    assert.ok(game.hudTexts.some((t) => t.startsWith("J1 0 %") && !t.includes("·")), `HUD: ${game.hudTexts}`);
    assert.ok(!game.hudTexts.includes("VACÍO"));
});

test("Infinito: tocar un punto de aparición da esa arma (agua, en la etapa 1) equipada con el tanque lleno y vuelve la mira", async () => {
    const game = await infinite();
    const point = game.state.pickups.points.find((p) => p.weapon === FLUID.WATER);
    assert.ok(point, "hay un punto de agua en la etapa 1");
    place(game, 0, point.x, point.y + game.state.pickups.offsetY);
    game.frames(5);
    const p1 = game.state.players[0];
    assert.equal(p1.weapon, FLUID.WATER);
    assert.equal(p1.tanks.get(FLUID.WATER), tankOf(FLUID.WATER));
    assert.equal(game.state.players[1].weapon, null);
    game.setPad(0, { buttons: [FIRE], axes: AIM_RIGHT });
    game.frames(20);
    assert.ok(game.state.particleSystem.GetParticleCount() > 0, "con arma el gatillo dispara");
    assert.ok(game.laserMoves > 0, "con arma se dibuja la mira");
});

test("Clásico: sigue arrancando con agua y el tanque lleno", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame();
    for (const player of game.state.players) {
        assert.equal(player.weapon, FLUID.WATER);
        assert.equal(player.tanks.get(FLUID.WATER), tankOf(FLUID.WATER));
    }
});

test("Infinito: el bot de J2 sin arma, en la etapa 1, va a buscar el punto de aparición cercano y lo recoge en 15 s", { timeout: 120000 }, async () => {
    const game = await infinite("?bot=2&seed=1");
    assert.equal(game.state.players[1].weapon, null);
    assert.ok(game.state.pickups.points.every((p) => p.y >= CLIMB.stageHeight), "la etapa 0 no tiene armas");
    const first = game.state.pickups.points.find((p) => p.kind !== "repair");
    const near = platformsOfStage(game, 1).find((s) => Math.abs(s.x - first.x) < s.w / 2 + 3 && Math.abs(s.y + s.h / 2 - first.y + CLIMB.pickupLift) < 1e-6);
    place(game, 1, near.x + near.w / 2 - 0.4, near.y + near.h / 2 + 0.9 + game.state.climb.offsetY);
    let at = null;
    for (let frame = 0; frame < 15 * 60 && at === null; frame++) {
        game.frame();
        if (game.state.players[1].weapon !== null) at = frame / 60;
    }
    const p2 = game.state.players[1];
    console.log(`bot sin arma: recogió ${p2.weapon === null ? "nada" : `el arma ${p2.weapon}`} a los ${at?.toFixed(1)} s`);
    assert.notEqual(at, null, "recogió un arma");
    assert.ok(p2.tanks.get(p2.weapon) > 0);
});

test("Premio por etapa: el primero que se apoya en la etapa 1 baja el daño a 0 % y llena los tanques; el segundo, la misma ronda y la ronda nueva", async () => {
    const game = await infinite();
    const { players, stagePrizes } = game.state;
    const [first, second] = bareOfStage(game, 1);
    assert.ok(first && second, "hay dos plataformas sin arma en la etapa 1");
    for (const player of players) {
        player.damagePct = 60;
        player.weapon = FLUID.WATER;
        player.tanks.set(FLUID.WATER, 0);
        player.tanks.set(FLUID.HONEY, 3);
    }

    standOn(game, 0, first);
    game.frames(40);
    assert.equal(players[0].damagePct, 0);
    assert.equal(players[0].tanks.get(FLUID.WATER), tankOf(FLUID.WATER));
    assert.equal(players[0].tanks.get(FLUID.HONEY), tankOf(FLUID.HONEY));
    assert.equal(stagePrizes.banner.text, "ETAPA 1 · J1");
    assert.ok(game.hudTexts.includes("ETAPA 1 · J1"), `HUD: ${game.hudTexts}`);

    standOn(game, 1, second);
    game.frames(40);
    assert.equal(players[1].damagePct, 60, "el segundo no recibe nada");
    assert.equal(players[1].tanks.get(FLUID.WATER), 0);

    players[0].damagePct = 50;
    standOn(game, 0, second);
    game.frames(5);
    standOn(game, 0, first);
    game.frames(40);
    assert.equal(players[0].damagePct, 50, "no se repite en la misma ronda");

    game.state.arrancarPartida();
    game.state.match.state = "playing";
    const again = bareOfStage(game, 1)[0];
    players[0].damagePct = 30;
    standOn(game, 0, again);
    game.frames(40);
    assert.equal(game.state.players[0].damagePct, 0, "en la ronda nueva vuelve a estar disponible");
});

test("Premio por etapa: el cartel desaparece al cumplirse el tiempo de la tabla", async () => {
    const game = await infinite();
    const [platform] = bareOfStage(game, 1);
    standOn(game, 0, platform);
    game.frames(40);
    assert.ok(game.hudTexts.includes("ETAPA 1 · J1"));
    game.frames(Math.ceil(CLIMB.stagePrize.banner * 60) + 10);
    assert.ok(!game.hudTexts.includes("ETAPA 1 · J1"), `HUD: ${game.hudTexts}`);
});

test("StagePrizes: apply es el único lugar que aplica el evento, con los valores de la tabla", () => {
    const prizes = new StagePrizes({ stagePrize: { banner: 2, repair: "full", refill: false }, stageHeight: 15 });
    const player = { repaired: false, repair() { this.repaired = true; }, tanks: new Map([[FLUID.WATER, 0]]) };
    prizes.events.push({ k: 0, stage: 3 });
    const applied = prizes.apply([player], 10);
    assert.deepEqual(applied, [{ k: 0, stage: 3 }]);
    assert.equal(player.repaired, true);
    assert.equal(player.tanks.get(FLUID.WATER), 0, "sin refill no se llenan los tanques");
    assert.deepEqual(prizes.banner, { text: "ETAPA 3 · J1", until: 12 });
    assert.equal(prizes.events.length, 0);
});
