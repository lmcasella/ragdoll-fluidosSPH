/**
 * Ascenso infinito (#25, docs/design/16-ascenso.md) sobre LiquidFun real. C2: memoria y conteos de `Climb` con mundo propio.
 * C4: un bot sube. C5: la ronda termina por agua. C7 sobre la escena real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "../helpers/game.js";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../../vendor/liquidfun.js");

const { Climb, CLIMB, stageOf } = await import("../../js/climb.js");
const { OneWayPlatforms } = await import("../../js/platforms.js");
const { Pickups } = await import("../../js/pickups.js");

/**
 * Dirección donde dlmalloc ubica un bloque de 1 MiB: con el heap casi libre sale del tope, así que lo que se filtre
 * (reservas sin liberar) la corre hacia arriba.
 */
function heapTop() {
    const p = Box2D._malloc(1 << 20);
    Box2D._free(p);
    return p;
}

/**
 * Tolerancia del tope del heap (B). Crear y destruir fixtures en LiquidFun deja una deriva de unos 16 B por
 * elemento, también en un lazo de Box2D puro sin código del juego, y el heap sube de a trozos de 16 KiB del
 * `b2BlockAllocator`: se admiten dos trozos.
 */
const DRIFT = 2 * (16 * 1024 + 16);

function climbRun(climb, seed, from, to) {
    const { world, platforms } = climb;
    climb.reset(seed);
    const stats = { created: 0, destroyed: 0, maxFixtures: 0, afterStage1: 0 };
    for (let level = from; level < to; level += 0.4) {
        world.Step(0.4, 8, 3);
        platforms.update(0);
        const result = climb.update({ top: level + 12, level, reached: level + 5 });
        stats.created += result.created;
        stats.destroyed += result.destroyed;
        stats.maxFixtures = Math.max(stats.maxFixtures, climb.level.solids.length);
        if (!stats.afterStage1 && stageOf(level) >= 1) stats.afterStage1 = heapTop();
        consistent(climb);
    }
    return stats;
}

function consistent(climb) {
    const { world, platforms, pickups } = climb;
    assert.equal(platforms.platforms.size, climb.level.solids.filter((s) => s.oneWay).length);
    assert.equal(pickups.points.length, climb.points.length);
    assert.equal(world.GetBodyCount(), 1 + climb.points.length);
    let fixtures = 0;
    for (let f = climb.body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) fixtures++;
    assert.equal(fixtures, climb.level.solids.length);
}

test("C2: generar y liberar 6 etapas no hace crecer el heap y los registros coinciden con lo vivo", () => {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const platforms = new OneWayPlatforms(world);
    const pickups = new Pickups(world, { sensorHooks: new Map() }, []);
    const climb = new Climb({ world, platforms, pickups });
    const first = climbRun(climb, 5, 3, 200);
    const afterStage6 = heapTop();
    console.log(
        `C2: creados ${first.created}, destruidos ${first.destroyed}, fixtures máximas ${first.maxFixtures}; tope del heap tras la etapa 1 ${first.afterStage1}, tras la 6 ${afterStage6} (+${afterStage6 - first.afterStage1} B)`,
    );
    assert.ok(first.maxFixtures <= 200, `fixtures ${first.maxFixtures}`);
    assert.ok(afterStage6 - first.afterStage1 <= DRIFT, `el tope subió ${afterStage6 - first.afterStage1} B`);
    climb.dispose();
    pickups.dispose();
    assert.equal(world.GetBodyCount(), 0);
});
test("Climb: cameraBounds sigue el ancho de la etapa y no tiene techo", () => {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const climb = new Climb({ world, platforms: new OneWayPlatforms(world), pickups: new Pickups(world, { sensorHooks: new Map() }, []) });
    assert.deepEqual(climb.cameraBounds(10), { minX: 0, maxX: 56, minY: 0, maxY: Infinity });
    assert.deepEqual(climb.cameraBounds(20), { minX: 10, maxX: 46, minY: 0, maxY: Infinity });
    assert.deepEqual(climb.cameraBounds(35), { minX: 12, maxX: 44, minY: 0, maxY: Infinity });
    assert.equal(climb.cameraBounds(500).maxX - climb.cameraBounds(500).minX, CLIMB.width.min);
});

const noop = () => {};

test("C4: con la inundación activa el bot de J2 sube pasando los 60 m locales (4 etapas) antes de ahogarse, con J1 quieto e inmortal, en 3 semillas", { timeout: 900000 }, async () => {
    const failures = [];
    for (const seed of [1, 2, 3]) {
        globalThis.location = { search: `?bot=2&seed=${seed}` };
        const game = await loadGame({ map: "infinite" });
        const { players } = game.state;
        Object.assign(players[0], { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
        assert.equal(game.state.map, "infinite");
        const torsoY = () => players[1].torso.GetPosition().get_y() - game.state.climb.offsetY;
        let frames = 0;
        let best = -Infinity;
        while (frames < 240 * 60 && best < 60 && !players[1].dead) {
            game.frame();
            frames++;
            best = Math.max(best, torsoY());
        }
        console.log(`C4 semilla ${seed}: J2 llegó a ${best.toFixed(1)} m locales en ${(frames / 60).toFixed(1)} s simulados, vivo ${!players[1].dead}, agua en ${game.state.flood.level.toFixed(1)} m`);
        if (best < 60) failures.push(`semilla ${seed}: ${best.toFixed(1)} m, ${players[1].dead ? "murió" : "vivo"}`);
    }
    globalThis.location = { search: "" };
    assert.deepEqual(failures, []);
});

test("C5 y C7: sin pads (semilla 1) el agua ahoga a los dos robots antes de los 30 s y el libro del campo cierra en cada paso", { timeout: 300000 }, async () => {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    const { water, players, match, immersion } = game.state;
    const initial = water.volume();
    let worst = 0;
    let roundOverAt = null;
    const drowned = [false, false];
    for (let frame = 0; frame < 60 * 60 && !(drowned[0] && drowned[1] && roundOverAt !== null); frame++) {
        game.frame();
        players.forEach((p, k) => (drowned[k] ||= p.drowned));
        if (roundOverAt === null && match.state === "roundOver") roundOverAt = match.roundTime;
        const expected = initial + immersion.stats.volume + water.stats.sourced - water.stats.floorCut.volume;
        worst = Math.max(worst, Math.abs(water.volume() - expected) / expected);
    }
    console.log(`C5: roundOver a los ${roundOverAt?.toFixed(1)} s de ronda, ahogados ${drowned.join(", ")}, nivel ${game.state.flood.level.toFixed(2)} m`);
    console.log(`C7: error relativo máximo del libro en la escena real ${worst.toExponential(2)}`);
    assert.ok(drowned[0] && drowned[1], "los dos mueren por drown");
    assert.ok(roundOverAt !== null && roundOverAt < 30, `roundOver a los ${roundOverAt} s`);
    assert.ok(worst < 1e-6);
});
