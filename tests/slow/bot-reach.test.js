/**
 * Calibración del alcance del bot (#174, S8): sobre la escena real con LiquidFun, el bot de J2 va de una plataforma atravesable
 * `A` a otra `B` con la regla de despegue de `navigate` (la de producción), para una grilla de desnivel `dy` y hueco `gap`
 * dentro de `BOT.reach`, con tres puntos de partida sobre `A`. Informa el porcentaje de éxito en el límite de la regla y en toda
 * la grilla; no cambia la regla ni el alcance (que genera los mapas), solo exige que se hayan medido los saltos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "../helpers/game.js";

const { BOT, buildNav } = await import("../../src/ai/bot.js");

const PLATFORM_WIDTH = 8;
const THICKNESS = 0.4;
const A_LEFT = 10;
const BASE_TOP = 30;
const STARTS = [1.5, 4, 6.5];
const TRIAL_SECONDS = 5;

const { up, short, downGap } = BOT.reach;
const GRID = [
    ...[1.5, 2.5, up.dy].flatMap((dy) => [0, 1, up.gap].map((gap) => ({ dy, gap, limit: dy === up.dy || gap === up.gap }))),
    ...[1, short.dy].flatMap((dy) => [3, short.gap].map((gap) => ({ dy, gap, limit: dy === short.dy || gap === short.gap }))),
    ...[0, -1, -3].flatMap((dy) => [2, downGap].map((gap) => ({ dy, gap, limit: gap === downGap }))),
];

/** Crea una plataforma atravesable de ancho `PLATFORM_WIDTH` con el tope en `top` y el borde izquierdo en `left`. */
function addPlatform(game, left, top) {
    const { world, platforms } = game.state;
    const bodyDef = new Box2D.b2BodyDef();
    const body = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(left + PLATFORM_WIDTH / 2, top - THICKNESS / 2);
    shape.SetAsBox(PLATFORM_WIDTH / 2, THICKNESS / 2, center, 0);
    const fixture = body.CreateFixture(shape, 0);
    fixture.SetFriction(0.8);
    platforms.addPlatform(fixture);
    Box2D.destroy(shape);
    Box2D.destroy(center);
    return { body, fixture };
}

/** Traslada todas las piezas del robot `k` para que el torso quede en `(x, y)`, con velocidades en cero. */
function teleport(game, k, x, y) {
    const player = game.state.players[k];
    const base = player.torso.GetPosition();
    const dx = x - base.get_x();
    const dy = y - base.get_y();
    const vec = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y() + dy);
        body.SetTransform(vec, body.GetAngle());
        vec.set_x(0);
        vec.set_y(0);
        body.SetLinearVelocity(vec);
    }
    Box2D.destroy(vec);
}

/** Un salto de A a B con `dy` y `gap` desde `start` m del borde izquierdo de A: verdadero si el bot termina apoyado en B. */
function trial(game, bot, { dy, gap }, start) {
    const { world, platforms, players } = game.state;
    const aTop = BASE_TOP;
    const bTop = BASE_TOP + dy;
    const bLeft = gap === 0 && dy > 0 ? A_LEFT + PLATFORM_WIDTH - 3 : A_LEFT + PLATFORM_WIDTH + gap;
    const a = addPlatform(game, A_LEFT, aTop);
    const b = addPlatform(game, bLeft, bTop);
    const solid = (left, top) => ({ kind: "platform", oneWay: true, x: left + PLATFORM_WIDTH / 2, y: top - THICKNESS / 2, w: PLATFORM_WIDTH, h: THICKNESS });
    bot.nav = buildNav({ solids: [solid(A_LEFT, aTop), solid(bLeft, bTop)] }, BOT);
    bot.reset();
    teleport(game, 1, A_LEFT + start, aTop + 1);
    game.frames(40);
    const me = players[1];
    let landed = false;
    for (let frame = 0; frame < TRIAL_SECONDS * 60 && !landed; frame++) {
        game.frame();
        landed = me.grounded && bot.supportOf(me) === 1;
    }
    platforms.removePlatform(a.fixture);
    platforms.removePlatform(b.fixture);
    world.DestroyBody(a.body);
    world.DestroyBody(b.body);
    return landed;
}

test("S8: éxito del salto con la regla de despegue de navigate, en el límite de BOT.reach y en toda la grilla", { timeout: 900000 }, async () => {
    globalThis.location = { search: "?bot=2" };
    const game = await loadGame();
    const bot = game.state.bots.get(1);
    bot.think = (g) => {
        const me = g.players[1];
        const cur = bot.currentSupport(me);
        bot.cur = cur;
        bot.active = true;
        bot.base = "safe";
        bot.mode = "safe";
        bot.minTop = -Infinity;
        bot.riskMin = 0;
        bot.foeAt = null;
        bot.navigate(me, cur, 1);
    };
    const results = [];
    for (const point of GRID) {
        const ok = STARTS.filter((start) => trial(game, bot, point, start)).length;
        results.push({ ...point, ok, total: STARTS.length });
        console.log(`S8 dy ${point.dy} m, hueco ${point.gap} m${point.limit ? " (límite)" : ""}: ${ok} de ${STARTS.length}`);
    }
    globalThis.location = { search: "" };
    const sum = (rows) => rows.reduce((acc, r) => ({ ok: acc.ok + r.ok, total: acc.total + r.total }), { ok: 0, total: 0 });
    const limit = sum(results.filter((r) => r.limit));
    const all = sum(results);
    console.log(`S8: en el límite de BOT.reach ${limit.ok} de ${limit.total} (${((limit.ok / limit.total) * 100).toFixed(0)} %); en toda la grilla ${all.ok} de ${all.total} (${((all.ok / all.total) * 100).toFixed(0)} %)`);
    assert.equal(all.total, GRID.length * STARTS.length);
});
