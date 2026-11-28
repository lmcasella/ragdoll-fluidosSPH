/**
 * Ítem de reparación (#156, docs/design/04-fluidos.md §4.2): el script de `index.js` con LiquidFun real, el bot en Node
 * y el generador del ascenso.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, removeCrates } from "./helpers/game.js";

const { FLUID } = await import("../src/combat/weapons.js");
const { LEVEL } = await import("../src/level/level.js");
const { REPAIR, PICKUP_RESPAWN } = await import("../src/level/pickups.js");
const { MAX_HP } = await import("../src/ragdoll/ActiveRagdoll.js");
const { Bot, BOT } = await import("../src/ai/bot.js");
const { ClimbGenerator, CLIMB } = await import("../src/level/climb.js");

async function start({ pad1 = true } = {}) {
    globalThis.location = { search: "" };
    const game = await loadGame();
    removeCrates(game);
    game.setPad(0);
    if (pad1) game.setPad(1);
    game.frames(30);
    return game;
}

const repairOf = (game) => game.state.pickups.points.find((p) => p.kind === "repair");

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
        v.set_x(0);
        v.set_y(0);
        body.SetLinearVelocity(v);
        body.SetAwake(true);
    }
    Box2D.destroy(v);
}

test("el mapa clásico tiene la reparación en x = 30 y el agua corrida a x = 26 sobre la misma plataforma", async () => {
    const game = await start();
    const repair = repairOf(game);
    assert.deepEqual([repair.x, repair.y], [30, 8.4]);
    const water = game.state.pickups.points.find((p) => p.weapon === FLUID.WATER && p.y === 8.4);
    assert.equal(water.x, 26);
    assert.equal(LEVEL.pickups.filter((p) => p.kind === "repair").length, 1);
});

test("tocar la reparación suma 35 con tope en la salud máxima, queda inactiva y reaparece a los 20 s", async () => {
    const game = await start();
    const { players } = game.state;
    const repair = repairOf(game);
    players[0].hp = 50;
    place(game, 0, repair.x, repair.y + 0.3);
    game.frames(3);
    assert.equal(players[0].hp, 50 + REPAIR.hp);
    assert.equal(repair.active, false);
    place(game, 0, 8, 8);
    game.frames(Math.round(PICKUP_RESPAWN * 60) + 30);
    assert.equal(repair.active, false, "a los 15,5 s sigue esperando");
    game.frames(Math.round((REPAIR.respawn - PICKUP_RESPAWN) * 60));
    assert.equal(repair.active, true, "a los 20,5 s volvió");
    players[0].hp = MAX_HP - 10;
    place(game, 0, repair.x, repair.y + 0.3);
    game.frames(3);
    assert.equal(players[0].hp, MAX_HP);
    assert.equal(repair.active, false);
});

test("con la salud llena el robot atraviesa la reparación caminando con el pad y sigue activa", async () => {
    const game = await start();
    const { players } = game.state;
    const repair = repairOf(game);
    assert.equal(players[0].hp, MAX_HP);
    place(game, 0, repair.x - 1.2, repair.y + 0.3);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(90);
    game.setPad(0);
    game.frames(10);
    assert.ok(players[0].torso.GetPosition().get_x() > repair.x + 0.3, "el robot pasó por encima del punto");
    assert.equal(repair.active, true);
    assert.equal(players[0].hp, MAX_HP);
    assert.equal(game.state.pickups.events.length, 0);
});

test("el bot con salud menor que 40 camina hasta la reparación y la recoge", async () => {
    const game = await start({ pad1: false });
    const bot = new Bot({ k: 1, world: game.state.world, rng: () => 0 });
    game.state.bots.set(1, bot);
    const repair = repairOf(game);
    const me = game.state.players[1];
    me.hp = 30;
    place(game, 1, 31.8, repair.y + 0.3);
    let frames = 0;
    for (; frames < 10 * 60 && repair.active; frames++) game.frame();
    console.log(`el bot recogió la reparación en ${(frames / 60).toFixed(2)} s; salud ${me.hp}`);
    assert.equal(repair.active, false);
    assert.ok(me.hp >= 30 + REPAIR.hp - 5);
});

test("el bot con salud menor que 40 busca la reparación y con 40 o más no", async () => {
    const game = await start();
    const bot = new Bot({ k: 1, world: game.state.world, rng: () => 0 });
    const repair = repairOf(game);
    const me = game.state.players[1];
    assert.equal(BOT.repairHp, 40);
    place(game, 1, 31.8, repair.y + 0.3);
    game.frames(30);
    const cur = bot.supportOf(me);
    assert.notEqual(cur, null);
    me.hp = 39;
    assert.equal(bot.seekPickup(me, cur, [repair]), true);
    me.hp = 40;
    assert.equal(bot.seekPickup(me, cur, [repair]), false);
    me.hp = 100;
    assert.equal(bot.seekPickup(me, cur, [repair]), false);
});

test("Infinito: cada etapa generada a partir de la 1 tiene exactamente un ítem de reparación sobre una plataforma", () => {
    for (let seed = 1; seed <= 20; seed++) {
        const generator = new ClimbGenerator(seed);
        const platforms = [];
        do platforms.push(generator.next());
        while (platforms[platforms.length - 1].y < 200);
        const last = platforms[platforms.length - 1].stage;
        const byStage = new Map();
        for (const p of platforms) {
            for (const point of p.pickups.filter((q) => q.kind === "repair")) {
                assert.ok(Math.abs(point.y - (p.y + CLIMB.pickupLift)) < 1e-9, "a 0,6 m sobre el tope de la plataforma");
                assert.ok(Math.abs(point.x - p.x) <= p.w / 2, "dentro del ancho de la plataforma");
                byStage.set(p.stage, (byStage.get(p.stage) ?? 0) + 1);
            }
        }
        for (let stage = 1; stage < last; stage++) assert.equal(byStage.get(stage), 1, `semilla ${seed}, etapa ${stage}`);
        assert.equal(byStage.has(0), false);
    }
});
