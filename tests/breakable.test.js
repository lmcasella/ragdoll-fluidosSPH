/**
 * Plataformas rompibles (#301, docs/design/05-escenario.md §5.4 y 16-ascenso.md §16.4): un toque arma la cuenta, la
 * plataforma se rompe y reaparece sin encajar robots, el generador de Infinito sigue la tabla de probabilidades y los
 * cambios de mapa y el fin de partida las dejan enteras. Escena real de index.html con LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { LEVEL } from "../js/level.js";
import { BREAKABLE } from "../js/breakable.js";
import { ClimbGenerator, CLIMB } from "../js/climb.js";

const STEP = 1 / 60;
const FLOOR_TOP = 4;
/** Distancia (m) entre los topes de las dos plataformas apiladas: el robot mide 1,2 m, así que a 2,2 m (distancia mínima de filas) no llega a la de arriba; a 0,6 m su torso queda dentro y, sin `forget`, el robot salta 0,19 m. */
const STACK_GAP = 0.6;

const sides = LEVEL.solids.filter((s) => s.breakable);

/** Traslada todo el robot `k` para que su torso quede en `x` y su punto más bajo en `low`, sin velocidad y sin tocar la pose. */
function place(game, k, x, low) {
    const { platforms, players } = game.state;
    const owner = platforms.owners.get(k);
    const dx = x - players[k].torso.GetPosition().get_x();
    const dy = low - platforms.measure(owner).low;
    const vec = new Box2D.b2Vec2(0, 0);
    const still = new Box2D.b2Vec2(0, 0);
    for (const body of players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y() + dy);
        body.SetTransform(vec, body.GetAngle());
        body.SetLinearVelocity(still);
        body.SetAngularVelocity(0);
    }
    Box2D.destroy(vec);
    Box2D.destroy(still);
    platforms.update(game.now);
}

/** Crea una plataforma atravesable estática de tope `top` y la registra en `OneWayPlatforms`; con `breakable` también en `BreakablePlatforms`. */
function addBox(game, x, top, w, breakable) {
    const { world, platforms } = game.state;
    const bodyDef = new Box2D.b2BodyDef();
    bodyDef.set_type(Box2D.b2_staticBody);
    const body = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const center = new Box2D.b2Vec2(x, top - 0.2);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(w / 2, 0.2, center, 0);
    const fixture = body.CreateFixture(shape, 0);
    Box2D.destroy(shape);
    Box2D.destroy(center);
    platforms.addPlatform(fixture);
    const solid = { x, y: top - 0.2, w, h: 0.4, kind: "platform", oneWay: true };
    if (breakable) {
        solid.breakable = breakable;
        game.state.breakable.add(fixture, solid);
    }
    return { fixture, solid, top, bottom: top - 0.4 };
}

async function idleGame(options) {
    const game = await loadGame(options);
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

test("Clásico: un toque de un frame rompe la plataforma a los 2 s, rota no sostiene al robot y reaparece a los 4 s", async () => {
    const game = await idleGame();
    const { breakable, players } = game.state;
    assert.equal(sides.length, 2);
    assert.deepEqual(sides.map((s) => s.x), [21, 35]);
    const solid = sides[0];
    const top = solid.y + solid.h / 2;
    const entry = [...breakable.entries.values()].find((e) => e.solid === solid);

    place(game, 0, solid.x, top + 0.02);
    let touched = 0;
    while (solid.crack === 0 && touched < 60) {
        game.frame();
        touched++;
    }
    assert.ok(solid.crack > 0, "el toque no armó la cuenta");
    const armedAt = game.now;
    place(game, 0, 12, FLOOR_TOP + 0.02);

    let crackBefore = 0;
    while (!solid.broken && game.now - armedAt < 4) {
        game.frame();
        if (!solid.broken) {
            assert.ok(solid.crack >= crackBefore, "crack bajó con la plataforma vacía");
            crackBefore = solid.crack;
        }
    }
    assert.ok(solid.broken, "no se rompió con el robot ya abajo");
    const brokeAfter = game.now - armedAt;
    assert.ok(Math.abs(brokeAfter - solid.breakable) <= STEP * 1.5, `se rompió a los ${brokeAfter.toFixed(3)} s`);
    assert.equal(solid.crack, 0);
    assert.equal(Boolean(entry.fixture.IsSensor()), true);
    assert.equal(sides[1].broken, false);

    const brokeAt = game.now;
    place(game, 0, solid.x, top + 0.5);
    game.frames(30);
    assert.ok(game.state.platforms.measure(game.state.platforms.owners.get(0)).low < top - 0.5, "la rota sostuvo al robot");

    while (solid.broken && game.now - brokeAt < 6) game.frame();
    assert.ok(!solid.broken, "no reapareció");
    const gone = game.now - brokeAt;
    assert.ok(Math.abs(gone - BREAKABLE.respawn) <= STEP * 1.5, `reapareció a los ${gone.toFixed(3)} s`);
    assert.equal(Boolean(entry.fixture.IsSensor()), false);
    assert.equal(solid.crack, 0);
    assert.equal(players.length, 2);
});

test("una plataforma que reaparece con un robot parado debajo y el torso dentro no lo deja encajado", async () => {
    const game = await idleGame();
    const { platforms } = game.state;
    const lower = addBox(game, 45, 20, 8, 0);
    const upper = addBox(game, 45, 20 + STACK_GAP, 8, 1);
    const owner = platforms.owners.get(0);

    place(game, 0, 45, upper.top + 0.02);
    let waited = 0;
    while (!upper.solid.broken && waited < 240) {
        game.frame();
        waited++;
    }
    assert.ok(upper.solid.broken, "la de arriba no se rompió");
    game.frames(60);
    const box = platforms.measure(owner);
    assert.ok(box.high > upper.bottom, `el torso no entra en la rompible: cabeza ${box.high}, fondo ${upper.bottom}`);
    assert.ok(Math.abs(box.low - lower.top) < 0.1, `no quedó apoyado abajo: ${box.low}`);

    let previous = box.low;
    let jump = 0;
    let frames = 0;
    while (upper.solid.broken && frames < 400) {
        game.frame();
        frames++;
        previous = platforms.measure(owner).low;
    }
    assert.ok(!upper.solid.broken);
    for (let i = 0; i < 90; i++) {
        game.frame();
        const low = platforms.measure(owner).low;
        jump = Math.max(jump, Math.abs(low - previous));
        previous = low;
    }
    const low = platforms.measure(owner).low;
    assert.ok(jump <= 0.1, `lowestPoint saltó ${jump.toFixed(3)} m`);
    assert.ok(Math.abs(low - lower.top) < 0.1, `quedó fuera de la de abajo: ${low}`);
    assert.equal(game.state.players[0].grounded, true);
});

test("forget borra pares y bajadas de una fixture en todos los dueños sin sacarla del registro", async () => {
    const game = await idleGame();
    const { platforms } = game.state;
    const box = addBox(game, 45, 20, 8, 0);
    const ptr = Box2D.getPointer(box.fixture);
    place(game, 0, 45, box.top + 0.02);
    game.frames(5);
    const owner = platforms.owners.get(0);
    assert.ok(owner.pairs.has(ptr));
    platforms.drop(0);
    assert.ok(owner.drops.has(ptr));
    platforms.forget(box.fixture);
    assert.equal(owner.pairs.has(ptr), false);
    assert.equal(owner.drops.has(ptr), false);
    assert.ok(platforms.platforms.has(ptr));
});

test("Infinito: sin objetos encima, y la proporción de rompibles por etapa sigue la tabla en 50 semillas", () => {
    const { fromStage, chance, perStage, max } = CLIMB.breakable;
    const byStage = new Map();
    for (let seed = 1; seed <= 50; seed++) {
        const generator = new ClimbGenerator(seed);
        let p;
        do {
            p = generator.next();
            const entry = byStage.get(p.stage) ?? { free: 0, broken: 0 };
            byStage.set(p.stage, entry);
            if (p.breakable) assert.equal(p.pickups.length, 0, `semilla ${seed}: rompible con objetos`);
            if (p.stage < fromStage) assert.equal(p.breakable, false);
            if (p.pickups.length === 0) {
                entry.free++;
                if (p.breakable) entry.broken++;
            }
        } while (p.y < 13 * CLIMB.stageHeight);
    }
    for (let stage = fromStage; stage <= 11; stage++) {
        const { free, broken } = byStage.get(stage);
        const expected = Math.min(max, chance + perStage * (stage - fromStage));
        const share = broken / free;
        assert.ok(free >= 300, `etapa ${stage}: solo ${free} plataformas`);
        assert.ok(Math.abs(share - expected) <= 0.07, `etapa ${stage}: ${share.toFixed(3)} y la tabla pide ${expected.toFixed(2)} (${broken}/${free})`);
    }
    console.log(`rompibles por etapa: ${[...byStage.entries()].filter(([s]) => s >= fromStage && s <= 11).map(([s, e]) => `${s}:${(e.broken / e.free).toFixed(2)}`).join(" ")}`);
});

test("ida y vuelta Clásico, Infinito, Clásico y fin de partida dejan todas las rompibles enteras", async () => {
    const game = await idleGame();
    const { breakable, match, menu } = game.state;
    const entire = () => [...breakable.entries.values()].every((e) => !e.solid.broken && e.solid.crack === 0 && !Boolean(e.fixture.IsSensor()));

    place(game, 0, sides[0].x, sides[0].y + sides[0].h / 2 + 0.02);
    game.frames(40);
    assert.ok(sides[0].crack > 0);
    assert.equal(breakable.entries.size, 2);

    menu.values.map = "infinite";
    game.state.arrancarPartida();
    match.state = "playing";
    game.frames(120);
    assert.ok(game.state.climb);
    for (const entry of breakable.entries.values()) assert.ok(entry.solid.kind === "platform");

    menu.values.map = "classic";
    game.state.arrancarPartida();
    match.state = "playing";
    game.frames(30);
    assert.equal(game.state.climb, null);
    assert.equal(breakable.entries.size, 2);
    assert.ok(entire(), "no quedaron enteras al volver al Clásico");

    for (const entry of breakable.entries.values()) {
        entry.solid.broken = true;
        entry.fixture.SetSensor(true);
    }
    breakable.reset();
    assert.ok(entire(), "reset dejó alguna rota");

    place(game, 0, sides[1].x, sides[1].y + sides[1].h / 2 + 0.02);
    game.frames(40);
    assert.ok(sides[1].crack > 0);
    match.state = "matchOver";
    game.frames(2);
    assert.ok(entire(), "el fin de partida dejó alguna armada");

    place(game, 0, sides[0].x, sides[0].y + sides[0].h / 2 + 0.02);
    match.state = "playing";
    game.frames(40);
    assert.ok(sides[0].crack > 0);
    match.state = "title";
    game.frames(2);
    assert.ok(entire(), "volver al título dejó alguna armada");
});
