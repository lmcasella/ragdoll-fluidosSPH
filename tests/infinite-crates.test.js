/**
 * Cajas en Infinito (#358, docs/design/04-fluidos.md §4.2, docs/design/16-ascenso.md): aparecen en los puntos de ítem de cada
 * etapa, sueltan el ítem al romperse y se liberan, con sus cuerpos, cuando el ascenso libera la geometría de abajo o empieza
 * la ronda, sobre LiquidFun real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { CLIMB } = await import("../src/level/climb.js");
const { CRATE } = await import("../src/level/crates.js");

const FRAMES_PER_SECOND = 60;
const SETTLED_FRAMES = 2 * FRAMES_PER_SECOND;
const PROBE_BYTES = 1 << 20;
const ROUND_CYCLES = 8;
const PLATFORM_TO_ITEM = CLIMB.pickupLift;
const REST_TOLERANCE = 0.05;
const BODIES_PER_POINT = 2;
const FAR_ABOVE_ITEMS = 1e6;
const BOT_ROUND_FRAMES = 150 * FRAMES_PER_SECOND;
const TORSO_ABOVE_FEET = 0.9;
const STAND_WATCH_FRAMES = 5 * FRAMES_PER_SECOND;
const PIECES_GONE_FRAMES = Math.round((CRATE.pieceLife + 0.5) * FRAMES_PER_SECOND);

async function infinite() {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    game.setPad(0);
    game.setPad(1);
    return game;
}

const bodyCount = (game) => game.state.world.GetBodyCount();

function heapTop() {
    const pointer = Box2D._malloc(PROBE_BYTES);
    Box2D._free(pointer);
    return pointer;
}

test("en Infinito cada punto de ítem de cada etapa tiene su caja, apoyada en su plataforma y con el ítem encerrado", async () => {
    const game = await infinite();
    const { crates, pickups, climb } = game.state;
    assert.ok(pickups.points.length > 0, "hay ítems en las etapas");
    assert.equal(crates.crates.length, pickups.points.length);
    assert.ok(pickups.points.every((point) => point.crate !== null && point.active === false));
    game.frames(SETTLED_FRAMES);
    for (const point of pickups.points) {
        const rest = point.homeY - PLATFORM_TO_ITEM + CRATE.side / 2 + climb.offsetY;
        assert.ok(Math.abs(point.crate.y - rest) < REST_TOLERANCE, `la caja del punto ${point.homeX.toFixed(1)} quedó apoyada (${point.crate.y.toFixed(2)} contra ${rest.toFixed(2)})`);
        assert.ok(Math.abs(point.crate.x - point.homeX) < REST_TOLERANCE);
    }
    console.log(`${crates.crates.length} cajas en Infinito, todas apoyadas en su plataforma`);
});

test("al romperse una caja de Infinito suelta el ítem donde estaba y queda en juego", async () => {
    const game = await infinite();
    const { crates, pickups } = game.state;
    game.frames(SETTLED_FRAMES);
    const point = pickups.points[0];
    const { crate } = point;
    crates.enqueueDamage(crate, CRATE.strength);
    game.frames(2);
    assert.equal(point.crate, null);
    assert.equal(point.active, true, "el ítem queda suelto");
    assert.ok(Math.hypot(point.x - crate.x, point.y + pickups.offsetY - crate.y) < 0.2, "donde estaba la caja");
    assert.equal(crates.pieces.length, CRATE.pieceLayout.length);
});

test("cuando el ascenso libera la geometría de abajo se liberan las cajas y los puntos sin dejar cuerpos huérfanos", async () => {
    const game = await infinite();
    const { crates, pickups, climb } = game.state;
    game.frames(SETTLED_FRAMES);
    const pointsBefore = pickups.points.length;
    const bodiesBefore = bodyCount(game);
    const released = climb.update({ top: -FAR_ABOVE_ITEMS, level: FAR_ABOVE_ITEMS, reached: -Infinity });
    const pointsAfter = pickups.points.length;
    const freed = pointsBefore - pointsAfter;
    console.log(`se liberaron ${freed} de ${pointsBefore} puntos (${released.destroyed} elementos destruidos); cuerpos ${bodiesBefore} -> ${bodyCount(game)}`);
    assert.ok(freed > 0, "se liberó al menos un punto");
    assert.equal(bodyCount(game), bodiesBefore - freed * BODIES_PER_POINT, "sale el cuerpo del punto y el de su caja");
    assert.equal(crates.crates.length, pointsAfter, "ninguna caja de un punto liberado");
    assert.equal(crates.byBody.size, crates.crates.length);
    assert.ok(crates.crates.every((crate) => pickups.points.includes(crate.point)));
    assert.ok(pickups.points.every((point) => point.crate === null || crates.crates.includes(point.crate)));
});

test("los pedazos de una caja rota de Infinito vencen a los 1,5 s y la cuenta de cuerpos vuelve a la de los puntos y las cajas", async () => {
    const game = await infinite();
    const { crates, pickups } = game.state;
    game.frames(SETTLED_FRAMES);
    const otherBodies = bodyCount(game) - pickups.points.length - crates.crates.length;
    crates.enqueueDamage(pickups.points[0].crate, CRATE.strength);
    game.frames(2);
    assert.equal(crates.pieces.length, CRATE.pieceLayout.length);
    game.frames(PIECES_GONE_FRAMES);
    assert.equal(crates.pieces.length, 0, "ya no hay pedazos");
    assert.equal(bodyCount(game), otherBodies + pickups.points.length + crates.crates.length, "solo quedan los cuerpos de los puntos, de las cajas y los de siempre");
});

test("la ronda nueva de Infinito deja cajas nuevas, sin pedazos, sin cuerpos de más y sin crecer el heap nativo", async () => {
    const game = await infinite();
    const { crates, pickups, match } = game.state;
    game.frames(SETTLED_FRAMES);
    crates.enqueueDamage(pickups.points[0].crate, CRATE.strength);
    game.frames(2);
    assert.equal(crates.pieces.length, CRATE.pieceLayout.length);
    game.state.arrancarPartida();
    match.state = "playing";
    game.frames(2);
    const bodiesAtStart = bodyCount(game);
    assert.equal(game.state.crates.pieces.length, 0, "sin pedazos");
    assert.equal(game.state.crates.crates.length, game.state.pickups.points.length);
    assert.ok(game.state.pickups.points.every((point) => point.crate !== null && point.active === false));
    const heapBefore = heapTop();
    for (let cycle = 0; cycle < ROUND_CYCLES; cycle++) {
        game.state.arrancarPartida();
        match.state = "playing";
        game.frames(2);
    }
    assert.equal(bodyCount(game), bodiesAtStart, "mismos cuerpos tras varias rondas");
    assert.equal(heapTop(), heapBefore, "el heap nativo no crece");
});

test("Infinito: el bot de J2 sin arma, en una ronda desde su aparición, rompe una caja de ítem y recoge un arma", async () => {
    globalThis.location = { search: "?bot=2&seed=1" };
    const game = await loadGame({ map: "infinite" });
    const { pickups, players, match } = game.state;
    const doNothing = () => {};
    Object.assign(players[0], { drown: doNothing, hurt: doNothing, burn: doNothing, takeDamage: doNothing });
    assert.equal(players[1].weapon, null);
    let brokeAt = null;
    let pickedAt = null;
    for (let frame = 0; frame < BOT_ROUND_FRAMES && pickedAt === null && match.state === "playing"; frame++) {
        game.frame();
        if (brokeAt === null && pickups.points.some((point) => point.crate === null && point.active)) brokeAt = frame / FRAMES_PER_SECOND;
        if (players[1].weapon !== null) pickedAt = frame / FRAMES_PER_SECOND;
    }
    console.log(`el bot rompió una caja a los ${brokeAt?.toFixed(1)} s y recogió el arma ${players[1].weapon} a los ${pickedAt?.toFixed(1)} s de juego`);
    assert.notEqual(brokeAt, null, "rompió una caja");
    assert.notEqual(pickedAt, null, "recogió un arma");
    assert.ok(players[1].tanks.get(players[1].weapon) > 0);
});
test("Infinito: un bot que cae parado encima de una caja se baja por el costado en vez de quedarse sobre ella", async () => {
    globalThis.location = { search: "?bot=2&seed=2" };
    const game = await loadGame({ map: "infinite" });
    game.frames(SETTLED_FRAMES);
    const { pickups, players } = game.state;
    const doNothing = () => {};
    Object.assign(players[0], { drown: doNothing, hurt: doNothing, burn: doNothing, takeDamage: doNothing });
    const bot = game.state.bots.get(1);
    const { crate } = pickups.points.find((candidate) => candidate.kind !== "repair");
    const torso = players[1].torso.GetPosition();
    const lift = new Box2D.b2Vec2(0, 0);
    const shiftX = crate.x - torso.get_x();
    const shiftY = crate.y + CRATE.side / 2 + TORSO_ABOVE_FEET - torso.get_y();
    for (const body of players[1].rag.bodies.values()) {
        const position = body.GetPosition();
        lift.set_x(position.get_x() + shiftX);
        lift.set_y(position.get_y() + shiftY);
        body.SetTransform(lift, body.GetAngle());
        body.SetAwake(true);
    }
    Box2D.destroy(lift);
    let landedAt = null;
    let offAt = null;
    for (let frame = 0; frame < STAND_WATCH_FRAMES && offAt === null; frame++) {
        game.frame();
        const standing = bot.crateUnderFoot(players[1]) === crate;
        if (standing && landedAt === null) landedAt = frame;
        if (!standing && landedAt !== null) offAt = frame;
    }
    console.log(`el bot quedó parado sobre la caja en el frame ${landedAt} y bajó en el ${offAt}`);
    assert.notEqual(landedAt, null, "cayó parado sobre la caja");
    assert.notEqual(offAt, null, "se bajó de la caja");
});