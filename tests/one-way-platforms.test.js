/**
 * Plataformas atravesables desde abajo (#149) sobre la escena real: el script de `index.html` con LiquidFun real y
 * gamepad simulado. Usa el escalón izquierdo de `LEVEL` (x 3 a 6, cara inferior 6,6 y tope 7,0) sobre la isla (tope 4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { LEVEL } = await import("../js/level.js");
const { ONE_WAY } = await import("../js/platforms.js");
const { FLUID, weaponById } = await import("../js/weapons.js");
const { PARTICLE } = await import("../js/particles.js");
const { ORIGIN } = await import("../js/particleStore.js");

const BUTTON_A = 0;
const STEP = { x: 4.5, bottom: 6.6, top: 7.0 };
const NO_PAD = { axes: [0, 0, 0, 0] };
const PRESS_DROP = { buttons: [BUTTON_A], axes: [0, 1, 0, 0] };

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(40);
    return game;
}

const torsoX = (game, k = 0) => game.state.players[k].torso.GetPosition().get_x();
const torsoVy = (game, k = 0) => game.state.players[k].torso.GetLinearVelocity().get_y();
const extent = (game, k = 0) => game.state.platforms.measure(game.state.platforms.owners.get(k));

/** Camina con el stick izquierdo hasta que el torso pasa `x` en esa dirección y frena un medio segundo. */
function walkTo(game, x, dir) {
    game.setPad(0, { axes: [dir, 0, dir, 0] });
    for (let i = 0; i < 400 && (dir < 0 ? torsoX(game) > x : torsoX(game) < x); i++) game.frame();
    game.setPad(0);
    game.frames(30);
}

/** Salto completo: mantiene A hasta pasado el apex (#152 corta el salto al soltarlo mientras sube). */
function jump(game) {
    game.setPad(0, { buttons: [BUTTON_A] });
    game.frames(60);
    game.setPad(0);
}

/** Cantidad de contactos tocándose entre una plataforma atravesable y una pieza de robot cuyo dueño está por debajo del tope. */
function stuckContacts(game) {
    const { world, platforms } = game.state;
    let stuck = 0;
    for (let contact = world.GetContactList(); Box2D.getPointer(contact) !== 0; contact = contact.GetNext()) {
        if (!contact.IsTouching()) continue;
        const a = contact.GetFixtureA();
        const b = contact.GetFixtureB();
        const platform = platforms.platforms.get(Box2D.getPointer(a)) ?? platforms.platforms.get(Box2D.getPointer(b));
        if (!platform) continue;
        const body = (platforms.platforms.has(Box2D.getPointer(a)) ? b : a).GetBody();
        const owner = platforms.byBody.get(Box2D.getPointer(body));
        if (owner && platforms.measure(owner).low < platform.top - ONE_WAY.tolerance - 0.02) stuck++;
    }
    return stuck;
}

test("plataformas: el robot salta desde abajo del escalón, lo atraviesa y queda parado arriba", async () => {
    const game = await start();
    walkTo(game, STEP.x + 0.8, -1);
    assert.ok(extent(game).high < STEP.bottom, "el robot arranca por debajo del escalón");
    jump(game);
    let apex = -Infinity;
    for (let i = 0; i < 120; i++) {
        game.frame();
        apex = Math.max(apex, extent(game).low);
    }
    const { low } = extent(game);
    console.log(`punto más bajo máximo ${apex.toFixed(3)} m, final ${low.toFixed(3)} m (tope ${STEP.top})`);
    assert.ok(game.state.players[0].grounded);
    assert.ok(Math.abs(low - STEP.top) < 0.05, `parado sobre el tope: ${low}`);
    assert.ok(torsoX(game) > 3 && torsoX(game) < 6);
});

/**
 * Pone al robot sobre el escalón, aprieta abajo + A y devuelve los segundos hasta que su punto más alto queda por
 * debajo de la cara inferior y los segundos hasta que su punto más bajo la pasa.
 */
async function dropOnStep() {
    const game = await start();
    walkTo(game, STEP.x + 0.8, -1);
    jump(game);
    game.frames(120);
    assert.ok(Math.abs(extent(game).low - STEP.top) < 0.05, "arranca parado sobre el escalón");
    game.setPad(0, PRESS_DROP);
    game.frame();
    game.setPad(0, NO_PAD);
    let frames = 0;
    let feetFrames = null;
    while (extent(game).high >= STEP.bottom && frames < 120) {
        game.frame();
        frames++;
        if (feetFrames === null && extent(game).low < STEP.bottom) feetFrames = frames;
    }
    return { game, seconds: frames / 60, feetSeconds: feetFrames / 60 };
}

test("plataformas: abajo + A cruza los pies en 0,3 s y al robot entero en 0,6 s o menos", async () => {
    const { seconds, feetSeconds } = await dropOnStep();
    console.log(`bajada: robot entero ${seconds.toFixed(3)} s, pies ${feetSeconds.toFixed(3)} s`);
    assert.ok(feetSeconds <= 0.3, `pies ${feetSeconds} s`);
    assert.ok(seconds <= 0.6, `${seconds} s`);
});

test("plataformas: tras bajar, el robot no vuelve a subir y la bajada termina", async () => {
    const { game } = await dropOnStep();
    let highestLow = -Infinity;
    for (let i = 0; i < 60; i++) {
        game.frame();
        highestLow = Math.max(highestLow, extent(game).low);
    }
    assert.ok(highestLow < STEP.top - ONE_WAY.tolerance, `volvió a subir: ${highestLow}`);
    assert.equal(game.state.platforms.owners.get(0).drops.size, 0);
});

test("plataformas: abajo + A sobre el piso de la isla salta", async () => {
    const game = await start();
    assert.ok(game.state.players[0].grounded);
    assert.equal(game.state.platforms.drop(0), false, "el piso no es atravesable");
    game.setPad(0, PRESS_DROP);
    let peak = -Infinity;
    for (let i = 0; i < 12; i++) {
        game.frame();
        peak = Math.max(peak, torsoVy(game));
    }
    console.log(`velocidad vertical máxima del torso ${peak.toFixed(2)} m/s`);
    assert.ok(peak > 5, `${peak} m/s`);
});

test("plataformas: ninguna pieza queda trabada a medio cruzar al subir ni al bajar", async () => {
    const game = await start();
    walkTo(game, STEP.x + 0.8, -1);
    jump(game);
    let stuck = 0;
    for (let i = 0; i < 120; i++) {
        game.frame();
        stuck += stuckContacts(game);
    }
    assert.ok(Math.abs(extent(game).low - STEP.top) < 0.05);
    game.setPad(0, PRESS_DROP);
    game.frame();
    game.setPad(0, NO_PAD);
    for (let i = 0; i < 120; i++) {
        game.frame();
        stuck += stuckContacts(game);
    }
    assert.ok(extent(game).high < STEP.bottom);
    assert.equal(stuck, 0, `${stuck} contactos trabados`);
});

/** Traslada todas las piezas de un robot `dx` metros, sin tocar velocidades. */
function shiftRobot(game, k, dx) {
    const vec = new Box2D.b2Vec2(0, 0);
    for (const body of game.state.players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y());
        body.SetTransform(vec, body.GetAngle());
    }
    Box2D.destroy(vec);
}

test("plataformas: los robots siguen chocando entre sí y con el piso", async () => {
    const game = await start();
    shiftRobot(game, 1, -37.5);
    game.frames(60);
    const x1 = torsoX(game, 1);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    for (let i = 0; i < 300 && torsoX(game) < x1 - 1.2; i++) game.frame();
    game.frames(30);
    game.setPad(0);
    console.log(`robot 0 en x ${torsoX(game).toFixed(2)} m, robot 1 en x ${torsoX(game, 1).toFixed(2)} m (arrancó en ${x1.toFixed(2)})`);
    assert.ok(torsoX(game) < torsoX(game, 1), "el robot 0 no pasa a través del robot 1");
    assert.ok(torsoX(game, 1) > x1, "el robot 1 recibe el empujón");
    assert.ok(Math.abs(extent(game, 0).low - 4) < 0.1 && Math.abs(extent(game, 1).low - 4) < 0.1, "los dos apoyan en el piso");
});

test("plataformas: el robot sigue chocando con la pared", async () => {
    const game = await start();
    game.setPad(0, { axes: [-1, 0, -1, 0] });
    game.frames(300);
    game.setPad(0);
    game.frames(30);
    console.log(`robot en x ${torsoX(game).toFixed(2)} m, borde izquierdo ${extent(game).minX.toFixed(3)} m`);
    assert.ok(extent(game).minX > -0.05, `borde izquierdo: ${extent(game).minX}`);
    assert.ok(Math.abs(extent(game).low - 4) < 0.1, "apoyado en el piso");
});

test("plataformas: una partícula soltada sobre una plataforma queda apoyada", async () => {
    const game = await start();
    const { store, particleSystem } = game.state;
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(28, 9.5);
    const color = new Box2D.b2ParticleColor(...weaponById(FLUID.WATER).color, 255);
    def.set_position(position);
    def.set_color(color);
    def.set_flags(weaponById(FLUID.WATER).flags | PARTICLE.CONTACT_LISTENER);
    const index = store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    Box2D.destroy(def);
    Box2D.destroy(position);
    Box2D.destroy(color);
    assert.ok(index >= 0);
    game.frames(180);
    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const y = Box2D.HEAPF32[pos + 1];
    const top = LEVEL.solids.find((s) => s.x === 28 && s.y === 7.6).y + 0.2;
    console.log(`partícula en y ${y.toFixed(3)} m, tope ${top.toFixed(1)} m`);
    assert.ok(y > top && y < top + 0.3, `y ${y}`);
});

/**
 * Dirección donde dlmalloc ubica un bloque de 1 MiB: con el heap casi libre sale del tope, así que lo que se filtre
 * (reservas sin liberar) la corre hacia arriba.
 */
function heapTop() {
    const p = Box2D._malloc(1 << 20);
    Box2D._free(p);
    return p;
}

test("plataformas: el heap nativo no crece con el filtro activo", async () => {
    const game = await start();
    walkTo(game, STEP.x + 0.8, -1);
    jump(game);
    game.frames(120);
    const before = heapTop();
    for (let i = 0; i < 12; i++) {
        game.setPad(0, PRESS_DROP);
        game.frame();
        game.setPad(0, NO_PAD);
        game.frames(80);
        jump(game);
        game.frames(100);
    }
    const after = heapTop();
    console.log(`tope del heap antes ${before}, después ${after}`);
    assert.ok(after - before <= 4096, `el tope subió ${after - before} B`);
});

test("plataformas: 50 000 consultas del filtro y 5 000 actualizaciones no reservan memoria nativa", async () => {
    const game = await start();
    const { platforms, players } = game.state;
    const [platformPtr] = platforms.platforms.keys();
    const footPtr = Box2D.getPointer(players[0].torso.GetFixtureList());
    game.frames(30);
    const before = heapTop();
    for (let i = 0; i < 50000; i++) platforms.shouldCollide(platformPtr, footPtr);
    for (let i = 0; i < 5000; i++) platforms.update(i / 60);
    const after = heapTop();
    console.log(`tope del heap antes ${before}, después ${after}`);
    assert.ok(after - before <= 4096, `el tope subió ${after - before} B`);
});
