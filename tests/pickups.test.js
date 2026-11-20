// Armas recogibles (#14, docs/design/04-fluidos.md §4.2): el script de index.html con LiquidFun real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { FLUID, weaponById } = await import("../js/weapons.js");
const { LEVEL } = await import("../js/level.js");
const { PICKUP_RESPAWN } = await import("../js/pickups.js");

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const pointOf = (game, weapon, nth = 0) => game.state.pickups.points.filter((p) => p.weapon === weapon)[nth];

/** Mueve todas las piezas del jugador `k` para que el torso quede en (x, y), sin tocar velocidades. */
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

function finishRound(game) {
    game.state.players[1].hp = 0;
    game.frames(1);
    assert.equal(game.state.match.state, "roundOver");
    game.frames(190);
}

test("los puntos de aparición están 0,6 m sobre la cara superior de una plataforma y el inventario inicial es solo el agua", async () => {
    for (const p of LEVEL.pickups) {
        const platform = LEVEL.solids.find((s) => s.kind === "platform" && Math.abs(p.x - s.x) <= s.w / 2 && Math.abs(p.y - 0.6 - (s.y + s.h / 2)) < 1e-9);
        assert.ok(platform, `punto (${p.x}, ${p.y}) sin plataforma debajo`);
        assert.ok(weaponById(p.weapon));
    }
    assert.deepEqual(LEVEL.pickups.map((p) => p.weapon).sort(), [1, 2, 2, 3, 3, 4]);
    const game = await start();
    for (const player of game.state.players) {
        assert.deepEqual([...player.tanks], [[FLUID.WATER, weaponById(FLUID.WATER).tank]]);
        assert.equal(player.weapon, FLUID.WATER);
    }
    assert.ok(game.state.pickups.points.every((p) => p.active));
});

test("tocar el punto del ácido lo suma al inventario con el tanque lleno, sin cambiar el arma equipada, y el punto queda inactivo", async () => {
    const game = await start();
    const { players, pickups } = game.state;
    const acid = pointOf(game, FLUID.ACID);
    place(game, 0, acid.x, acid.y + 0.3);
    game.frames(3);
    assert.equal(players[0].tanks.get(FLUID.ACID), weaponById(FLUID.ACID).tank);
    assert.equal(players[0].weapon, FLUID.WATER);
    assert.equal(players[1].tanks.has(FLUID.ACID), false);
    assert.equal(acid.active, false);
    assert.equal(pickups.points.filter((p) => !p.active).length, 1);
});

test("el punto reaparece a los 15 s de juego y se puede volver a recoger", async () => {
    const game = await start();
    const { players } = game.state;
    const acid = pointOf(game, FLUID.ACID);
    place(game, 0, acid.x, acid.y + 0.3);
    game.frames(3);
    assert.equal(acid.active, false);
    place(game, 0, 8, 8);
    players[0].tanks.delete(FLUID.ACID);
    game.frames(Math.round((PICKUP_RESPAWN - 1) * 60));
    assert.equal(acid.active, false, "a los 14 s sigue esperando");
    game.frames(Math.round(1.5 * 60));
    assert.equal(acid.active, true, "a los 15,5 s volvió");
    place(game, 0, acid.x, acid.y + 0.3);
    game.frames(3);
    assert.equal(players[0].tanks.get(FLUID.ACID), weaponById(FLUID.ACID).tank);
    assert.equal(acid.active, false);
});

test("recoger un arma que ya se tiene con el tanque a medias lo rellena", async () => {
    const game = await start();
    const { players } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    players[0].tanks.set(FLUID.LAVA, 40);
    place(game, 0, lava.x, lava.y + 0.3);
    game.frames(3);
    assert.equal(players[0].tanks.get(FLUID.LAVA), weaponById(FLUID.LAVA).tank);
    assert.equal(lava.active, false);
});

test("con el tanque lleno del mismo líquido el robot atraviesa el punto caminando con el pad y el punto sigue en el mapa", async () => {
    const game = await start();
    const { players } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    players[0].tanks.set(FLUID.LAVA, weaponById(FLUID.LAVA).tank);
    place(game, 0, lava.x - 1.2, lava.y + 0.3);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(90);
    game.setPad(0);
    game.frames(10);
    assert.ok(players[0].torso.GetPosition().get_x() > lava.x + 0.3, "el robot pasó por encima del punto");
    assert.equal(lava.active, true);
    assert.equal(players[0].tanks.get(FLUID.LAVA), weaponById(FLUID.LAVA).tank);
    assert.equal(players[1].tanks.has(FLUID.LAVA), false);
});

test("si un robot con el tanque lleno y otro sin el arma tocan el punto, lo toma el que no la tiene", async () => {
    const game = await start();
    const { players } = game.state;
    const acid = pointOf(game, FLUID.ACID);
    players[0].tanks.set(FLUID.ACID, weaponById(FLUID.ACID).tank);
    place(game, 0, acid.x, acid.y + 0.3);
    place(game, 1, acid.x, acid.y + 0.3);
    game.frames(3);
    assert.equal(players[1].tanks.get(FLUID.ACID), weaponById(FLUID.ACID).tank);
    assert.equal(acid.active, false);
});

test("si los dos robots tocan el punto en el mismo paso lo toma uno solo", async () => {
    const game = await start();
    const { players } = game.state;
    const honey = pointOf(game, FLUID.HONEY, 0);
    place(game, 0, honey.x, honey.y + 0.3);
    place(game, 1, honey.x, honey.y + 0.3);
    game.frames(3);
    const owners = players.filter((p) => p.tanks.has(FLUID.HONEY)).length;
    assert.equal(owners, 1);
    assert.equal(honey.active, false);
});

test("un robot en el punto del agua con el tanque vacío lo rellena", async () => {
    const game = await start();
    const { players } = game.state;
    const water = pointOf(game, FLUID.WATER);
    players[0].tanks.set(FLUID.WATER, 0);
    place(game, 0, water.x, water.y + 0.3);
    game.frames(3);
    assert.equal(players[0].tanks.get(FLUID.WATER), weaponById(FLUID.WATER).tank);
});

test("al empezar la ronda siguiente el inventario vuelve al agua llena y todos los puntos están disponibles", async () => {
    const game = await start();
    const { match } = game.state;
    const acid = pointOf(game, FLUID.ACID);
    place(game, 0, acid.x, acid.y + 0.3);
    game.frames(3);
    assert.equal(acid.active, false);
    finishRound(game);
    assert.equal(match.round, 2);
    const { players, pickups } = game.state;
    assert.deepEqual([...players[0].tanks], [[FLUID.WATER, weaponById(FLUID.WATER).tank]]);
    assert.ok(pickups.points.every((p) => p.active));
});

test("el robot que gira sobre el punto recoge para el jugador vigente", async () => {
    const game = await start();
    const acid = pointOf(game, FLUID.ACID);
    place(game, 0, acid.x, acid.y + 0.3);
    game.setPad(0, { axes: [0, 0, -1, 0] });
    game.frames(5);
    game.setPad(0);
    assert.equal(game.state.players[0].flipX, true);
    assert.equal(game.state.players[0].tanks.get(FLUID.ACID), weaponById(FLUID.ACID).tank);
});
