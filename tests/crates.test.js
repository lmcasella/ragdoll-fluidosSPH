/**
 * Cajas físicas de los ítems (#358, docs/design/04-fluidos.md §4.2): el script de `index.js` con LiquidFun real, gamepad
 * simulado y el bot en Node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { place } from "./helpers/place.js";
import { BUTTON, AIM_RIGHT } from "./helpers/duel.js";

const { FLUID, weaponById } = await import("../src/combat/weapons.js");
const { LEVEL } = await import("../src/level/level.js");
const { PICKUP_RESPAWN, REPAIR } = await import("../src/level/pickups.js");
const { CRATE } = await import("../src/level/crates.js");
const { MELEE } = await import("../src/combat/melee.js");

const FRAMES_PER_SECOND = 60;
const REST_SPEED = 0.05;
const REST_TOLERANCE = 0.02;
/** Cuánto (m) puede moverse la caja en el paso en que se rompe respecto de la última posición que se copió a sus datos. */
const BREAK_PLACE_TOLERANCE = 0.1;
const PLATFORM_TO_ITEM = 0.6;
const TORSO_ABOVE_PLATFORM = 0.9;
const PUNCH_PERIOD_FRAMES = 25;
const MAX_BREAK_FRAMES = 20 * FRAMES_PER_SECOND;
const PROBE_BYTES = 1 << 20;
const RESET_CYCLES = 15;
const WATCH_FRAMES = 120;
const SETTLED_FRAMES = 2 * FRAMES_PER_SECOND;
const PIECE_WATCH_FRAMES = 20;

/** Juego clásico con las dos entradas conectadas y las cajas ya apoyadas. */
async function start() {
    globalThis.location = { search: "" };
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(SETTLED_FRAMES);
    return game;
}

const pointOf = (game, weapon, nth = 0) => game.state.pickups.points.filter((point) => point.weapon === weapon)[nth];

/** Altura (m) a la que el centro de la caja del punto queda apoyada en su plataforma. */
const restingHeight = (point) => point.homeY - PLATFORM_TO_ITEM + CRATE.side / 2;

const speedOf = (crate) => {
    const velocity = crate.body.GetLinearVelocity();
    return Math.hypot(velocity.get_x(), velocity.get_y());
};

/** Pone al jugador 0 de pie en la plataforma de la caja, a `distance` m a su izquierda, mirando a la derecha. */
function standLeftOf(game, crate, distance) {
    place(game, 0, crate.x - distance, crate.y - CRATE.side / 2 + TORSO_ABOVE_PLATFORM);
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
}

/** Un golpe de B cada `PUNCH_PERIOD_FRAMES` hasta que la caja del punto se rompe; devuelve los frames que tardó. */
function punchUntilBroken(game, point) {
    for (let frame = 0; frame < MAX_BREAK_FRAMES; frame++) {
        const pressed = frame % PUNCH_PERIOD_FRAMES === 0;
        game.setPad(0, { buttons: pressed ? [BUTTON.B] : [], axes: AIM_RIGHT });
        game.frame();
        if (point.crate === null) return frame;
    }
    return null;
}

function heapTop() {
    const pointer = Box2D._malloc(PROBE_BYTES);
    Box2D._free(pointer);
    return pointer;
}

test("al empezar la ronda cada punto tiene su caja: cae, queda en reposo en menos de 2 s y el ítem no se recoge con la caja entera", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    const { crates, pickups, players } = game.state;
    assert.equal(crates.crates.length, LEVEL.pickups.length);
    assert.ok(pickups.points.every((point) => point.crate !== null && point.active === false));
    let restedAt = null;
    for (let frame = 1; frame <= SETTLED_FRAMES && restedAt === null; frame++) {
        game.frame();
        const resting = crates.crates.every((crate) => speedOf(crate) < REST_SPEED && Math.abs(crate.y - restingHeight(crate.point)) < REST_TOLERANCE);
        if (resting) restedAt = frame / FRAMES_PER_SECOND;
    }
    console.log(`las ${crates.crates.length} cajas quedaron apoyadas en reposo a los ${restedAt?.toFixed(2)} s`);
    assert.notEqual(restedAt, null, "todas las cajas quedan apoyadas en menos de 2 s");
    const acid = pointOf(game, FLUID.ACID);
    place(game, 0, acid.x, acid.y + 0.3);
    game.frames(10);
    assert.equal(players[0].tanks.has(FLUID.ACID), false, "con la caja entera el ítem no se recoge");
    assert.equal(acid.active, false);
});

test("los golpes de un jugador rompen la caja con el daño de la tabla de melee: quedan 4 pedazos que duran 1,5 s y el ítem se recoge donde estaba la caja", async () => {
    const game = await start();
    const { crates, players } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    const crate = lava.crate;
    standLeftOf(game, crate, 1.2);
    game.setPad(0, { buttons: [BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    assert.equal(crate.damage, MELEE.attacks.combo1.damage, "el primer golpe gasta el daño del golpe");
    assert.ok(crate.wear > 0 && crate.wear < 1);
    const broke = punchUntilBroken(game, lava);
    assert.notEqual(broke, null, "la caja se rompe a golpes");
    const brokenX = crate.x;
    const brokenY = crate.y;
    assert.equal(crates.pieces.length, CRATE.pieceLayout.length);
    assert.equal(crates.pieces.length, 4);
    assert.equal(lava.active, true, "el ítem queda activo");
    assert.ok(Math.hypot(lava.x - brokenX, lava.y - brokenY) < BREAK_PLACE_TOLERANCE, "donde estaba la caja");
    game.setPad(0);
    game.frames(Math.round((CRATE.pieceLife - 0.3) * FRAMES_PER_SECOND));
    assert.equal(crates.pieces.length, 4, "a los 1,2 s siguen");
    game.frames(Math.round(0.6 * FRAMES_PER_SECOND));
    assert.equal(crates.pieces.length, 0, "a los 1,8 s ya no están");
    place(game, 0, lava.x, lava.y + 0.3);
    game.frames(3);
    assert.equal(players[0].tanks.get(FLUID.LAVA), weaponById(FLUID.LAVA).tank);
    assert.equal(lava.active, false);
    assert.equal(players[1].tanks.has(FLUID.LAVA), false, "sin dueño ni crédito para ningún jugador");
});

test("un robot que camina contra la caja la empuja y la caja no se rompe", async () => {
    const game = await start();
    const lava = pointOf(game, FLUID.LAVA, 0);
    const crate = lava.crate;
    const startX = crate.x;
    standLeftOf(game, crate, 1.8);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(90);
    game.setPad(0);
    console.log(`la caja avanzó ${(crate.x - startX).toFixed(2)} m empujada por el robot`);
    assert.ok(crate.x - startX > 0.2, "la caja se movió");
    assert.equal(lava.crate, crate, "sigue entera");
});

test("el ácido que toca la caja la rompe", async () => {
    const game = await start();
    const { players } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    const crate = lava.crate;
    standLeftOf(game, crate, 1.5);
    players[0].weapon = FLUID.ACID;
    players[0].tanks.set(FLUID.ACID, 1e6);
    let frames = 0;
    for (; frames < MAX_BREAK_FRAMES && lava.crate !== null; frames++) {
        game.setPad(0, { buttons: [BUTTON.RT], axes: [0, 0, 1, 0.45] });
        game.frame();
    }
    game.setPad(0);
    console.log(`el ácido rompió la caja en ${(frames / FRAMES_PER_SECOND).toFixed(1)} s`);
    assert.equal(lava.crate, null, "la caja se rompió");
    assert.equal(lava.active, true);
});

test("una caja que cae de muy alto se daña por el choque, y de más alto todavía se rompe", async () => {
    const game = await start();
    const { crates } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    const crate = lava.crate;
    const lift = new Box2D.b2Vec2(0, 0);
    const dropFrom = (height) => {
        lift.set_x(crate.x);
        lift.set_y(crate.y + height);
        crate.body.SetTransform(lift, 0);
        crate.body.SetAwake(true);
        game.frames(3 * FRAMES_PER_SECOND);
    };
    dropFrom(12);
    console.log(`caída de 12 m: daño ${crate.damage.toFixed(1)} de ${CRATE.strength}`);
    assert.ok(crate.damage > 0 && crate.damage < CRATE.strength, "se daña pero aguanta");
    assert.equal(lava.crate, crate);
    dropFrom(25);
    Box2D.destroy(lift);
    assert.equal(lava.crate, null, "con una caída de 25 m se rompe");
    assert.equal(crates.pieces.length > 0, true);
});

test("a los 15 s de recogido el ítem cae una caja nueva en el punto original, y a los 20 s la de la reparación", async () => {
    const game = await start();
    const { crates } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    const repair = game.state.pickups.points.find((point) => point.kind === "repair");
    for (const point of [lava, repair]) crates.enqueueDamage(point.crate, Infinity);
    game.frames(2);
    place(game, 0, 8, 8);
    game.state.players[0].hp = 10;
    place(game, 0, repair.x, repair.y + 0.3);
    game.frames(3);
    place(game, 0, lava.x, lava.y + 0.3);
    game.frames(3);
    assert.equal(lava.active, false);
    assert.equal(repair.active, false);
    place(game, 0, 8, 8);
    game.frames(Math.round((PICKUP_RESPAWN - 1) * FRAMES_PER_SECOND));
    assert.equal(lava.crate, null, "a los 14 s todavía no");
    game.frames(2 * FRAMES_PER_SECOND);
    assert.notEqual(lava.crate, null, "a los 16 s volvió la caja");
    assert.equal(lava.active, false, "el ítem vuelve a estar encerrado");
    assert.equal(repair.crate, null, "la reparación tarda más");
    game.frames(Math.round((REPAIR.respawn - PICKUP_RESPAWN) * FRAMES_PER_SECOND));
    assert.notEqual(repair.crate, null, "a los 21 s volvió la de la reparación");
    game.frames(SETTLED_FRAMES);
    assert.ok(Math.abs(lava.crate.x - lava.homeX) < 0.05, "en el punto original");
    assert.ok(Math.abs(lava.crate.y - restingHeight(lava)) < REST_TOLERANCE, "apoyada de nuevo");
});

test("la ronda nueva deja todas las cajas nuevas y sin pedazos", async () => {
    const game = await start();
    const { crates, pickups, match } = game.state;
    const lava = pointOf(game, FLUID.LAVA, 0);
    crates.enqueueDamage(lava.crate, Infinity);
    crates.enqueueDamage(pointOf(game, FLUID.ACID).crate, CRATE.strength / 2);
    game.frames(2);
    assert.equal(crates.pieces.length, 4);
    game.state.players[1].hp = 0;
    game.frames(1);
    assert.equal(match.state, "roundOver");
    game.frames(190);
    assert.equal(match.round, 2);
    assert.equal(game.state.crates.pieces.length, 0);
    assert.equal(game.state.crates.crates.length, pickups.points.length);
    assert.ok(pickups.points.every((point) => point.crate !== null && point.active === false && point.x === point.homeX && point.y === point.homeY));
    assert.ok(game.state.crates.crates.every((crate) => crate.damage === 0));
});

test("el bot sin arma rompe la caja de un ítem a golpes y lo recoge", async () => {
    globalThis.location = { search: "?bot=2&seed=1" };
    const game = await loadGame();
    globalThis.location = { search: "" };
    game.frames(SETTLED_FRAMES);
    const bot = game.state.players[1];
    bot.tanks.clear();
    bot.weapon = null;
    const lava = pointOf(game, FLUID.LAVA, 0);
    place(game, 1, lava.homeX + 2.5, lava.homeY - PLATFORM_TO_ITEM + TORSO_ABOVE_PLATFORM);
    let frames = 0;
    for (; frames < MAX_BREAK_FRAMES && bot.tanks.size === 0; frames++) game.frame();
    console.log(`el bot rompió la caja y recogió ${bot.weapon === null ? "nada" : `el arma ${bot.weapon}`} a los ${(frames / FRAMES_PER_SECOND).toFixed(1)} s`);
    assert.ok(bot.tanks.size > 0, "recogió un arma");
    assert.equal(lava.crate, null);
});

test("la vista no crea objetos nuevos por frame y reiniciar o romper cajas no hace crecer el heap nativo", async () => {
    const game = await start();
    const { crates, crateView } = game.state;
    crates.enqueueDamage(crates.crates[0], Infinity);
    game.frames(3);
    const graphics = PIXI.Graphics.constructed;
    const texts = PIXI.Text.constructed;
    const filters = PIXI.Filter.constructed;
    const crateEntries = crateView.crateEntries.length;
    const pieceEntries = crateView.pieceEntries.length;
    game.frames(WATCH_FRAMES);
    assert.equal(PIXI.Graphics.constructed, graphics, "ningún Graphics nuevo");
    assert.equal(PIXI.Text.constructed, texts, "ningún Text nuevo");
    assert.equal(PIXI.Filter.constructed, filters, "ningún filtro nuevo");
    assert.equal(crateView.crateEntries.length, crateEntries);
    assert.equal(crateView.pieceEntries.length, pieceEntries);
    for (let cycle = 0; cycle < 2; cycle++) {
        for (const crate of [...crates.crates]) crates.enqueueDamage(crate, Infinity);
        game.frames(2);
        crates.reset();
    }
    const before = heapTop();
    const size = Box2D.HEAP8.length;
    for (let cycle = 0; cycle < RESET_CYCLES; cycle++) {
        for (const crate of [...crates.crates]) crates.enqueueDamage(crate, Infinity);
        game.frames(2);
        crates.reset();
    }
    assert.equal(heapTop(), before, "el heap nativo no crece");
    assert.equal(Box2D.HEAP8.length, size);
});

/** Cantidad de contactos tocándose entre los cuerpos de los pedazos y los del robot `player`. */
function pieceRobotContacts(crates, player) {
    const robotBodies = new Set([...player.rag.bodies.values()].map((body) => Box2D.getPointer(body)));
    let count = 0;
    for (const piece of crates.pieces) {
        for (let edge = piece.body.GetContactList(); Box2D.getPointer(edge) !== 0; edge = edge.get_next()) {
            const contact = edge.get_contact();
            if (!contact.IsTouching()) continue;
            const other = Box2D.getPointer(contact.GetFixtureA().GetBody()) === Box2D.getPointer(piece.body) ? contact.GetFixtureB() : contact.GetFixtureA();
            if (robotBodies.has(Box2D.getPointer(other.GetBody()))) count++;
        }
    }
    return count;
}

/** Cantidad de contactos (aunque ya se hayan separado) entre un pedazo y otro: el filtro los impide desde que se crean. */
function pieceToPieceContacts(crates) {
    const piecePointers = new Set(crates.pieces.map((piece) => Box2D.getPointer(piece.body)));
    let count = 0;
    for (const piece of crates.pieces) {
        for (let edge = piece.body.GetContactList(); Box2D.getPointer(edge) !== 0; edge = edge.get_next()) {
            const contact = edge.get_contact();
            const other = Box2D.getPointer(contact.GetFixtureA().GetBody()) === Box2D.getPointer(piece.body) ? contact.GetFixtureB() : contact.GetFixtureA();
            if (piecePointers.has(Box2D.getPointer(other.GetBody()))) count++;
        }
    }
    return count;
}

/** Rompe la caja de lava, deja al robot 0 encima de sus pedazos y devuelve cuántos contactos pedazo-robot y pedazo-pedazo hubo en `PIECE_WATCH_FRAMES` frames. */
function breakAndOverlap(game) {
    const { crates, players } = game.state;
    const crate = pointOf(game, FLUID.LAVA, 0).crate;
    const { x, y } = crate;
    crates.enqueueDamage(crate, CRATE.strength);
    game.frame();
    place(game, 0, x, y);
    const contacts = { robot: 0, piece: 0 };
    for (let frame = 0; frame < PIECE_WATCH_FRAMES; frame++) {
        game.frame();
        contacts.robot += pieceRobotContacts(crates, players[0]);
        contacts.piece += pieceToPieceContacts(crates);
    }
    return contacts;
}

test("los pedazos de una caja no chocan con los robots ni entre sí, aunque se rompa pegada a uno", async () => {
    const game = await start();
    const contacts = breakAndOverlap(game);
    assert.equal(contacts.robot, 0, "con el robot");
    assert.equal(contacts.piece, 0, "entre pedazos");
});

test("sin la regla de pedazos, los pedazos sí chocan con el robot y entre sí (control del test anterior)", async () => {
    const game = await start();
    game.state.platforms.setPieceFilter(() => false);
    const contacts = breakAndOverlap(game);
    assert.ok(contacts.robot > 0, "con el robot");
    assert.ok(contacts.piece > 0, "entre pedazos");
});
