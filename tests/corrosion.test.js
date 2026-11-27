/**
 * El ácido corroe el terreno de densidad (#347): un chorro abre un hueco pasante en una plataforma, la masa disuelta sigue
 * la estequiometría, el libro de masa cierra y los robots caen o no según el hueco. LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "./helpers/game.js";
import { place } from "./helpers/place.js";
import { FLUID } from "../src/combat/weapons.js";
import { CORROSION, MATERIALS, SIGMA_W } from "../src/fluids/materials.js";
import { SINK } from "../src/fluids/particleStore.js";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");
const { LEVEL } = await import("../src/level/level.js");

const RIGHT_TRIGGER = 7;
const FRAMES_PER_SECOND = 60;
const MAX_SECONDS = 8;
const PLATFORM = { x: 28, y: 7.6, width: 8, height: 0.4 };
const PLATFORM_TOP = PLATFORM.y + PLATFORM.height / 2;
LEVEL.solids.find((solid) => solid.x === PLATFORM.x && solid.y === PLATFORM.y).material = "steel";
const SHOOTER_X = 25;
const SHOOTER_TORSO_HEIGHT = 0.7;
const FAR_X = 50;
const AIM_AXES = [0.97, 0.26];
const THROUGH_DENSITY = 0.5;
const MIN_HOLE_WIDTH = 0.3;
const ROBOT_HOLE_WIDTH = 1;
const WIDENING_AREA = 0.02;
const SHOOTER_DRIFT = 0.3;
const MASS_TOLERANCE = 0.01;
const FALL_SECONDS = 2;
const FALL_DISTANCE = 1;
const PARTICLE_SIDE_IN_RADII = 1.5;
const ROUND_OVER_FRAMES = 200;
const EXPECTED_HOLE_SECONDS = 2;
const HOLE_TOLERANCE_SECONDS = 1;
const RESTING_SECONDS = 1;
const SPENT_TOLERANCE = 1e-6;

/** Tramo del terreno que contiene el centro de la plataforma de prueba. */
function platformTile(game) {
    for (const tile of game.state.terrain.tiles) {
        const { grid } = tile;
        if (PLATFORM.x > grid.originX && PLATFORM.x < grid.originX + grid.width && PLATFORM.y > grid.originY && PLATFORM.y < grid.originY + grid.height) return tile;
    }
    return null;
}

/** Columnas contiguas más largas de la grilla sin ninguna celda con densidad: por ahí pasa un hueco de lado a lado. */
function widestHole(grid) {
    let best = [];
    let current = [];
    for (let column = 0; column < grid.columns; column++) {
        let through = true;
        for (let row = 0; row < grid.rows; row++) if (grid.values[row * grid.columns + column] > THROUGH_DENSITY) through = false;
        current = through ? [...current, column] : [];
        if (current.length > best.length) best = current;
    }
    return best;
}

/** Ancho del hueco pasante más ancho de la grilla, en m. */
function holeWidth(grid) {
    return widestHole(grid).length * grid.cellWidth;
}

/** Área de materia que queda en la grilla, en m². */
function materialArea(grid) {
    let total = 0;
    for (const value of grid.values) total += value;
    return total * grid.cellWidth * grid.cellHeight;
}

async function startJet() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(10);
    place(game, 0, SHOOTER_X, PLATFORM_TOP + SHOOTER_TORSO_HEIGHT);
    place(game, 1, FAR_X, PLATFORM_TOP + SHOOTER_TORSO_HEIGHT);
    game.frames(30);
    const shooter = game.state.players[0];
    shooter.weapon = FLUID.ACID;
    shooter.tanks.set(FLUID.ACID, 1e6);
    game.state.match.roundTime = 1e6;
    return game;
}

test("un chorro continuo de ácido abre un hueco pasante en una plataforma de 0,4 m en unos 2 s", async (t) => {
    const game = await startJet();
    const tile = platformTile(game);
    const startArea = materialArea(tile.grid);
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: [0, 0, ...AIM_AXES] });
    let seconds = null;
    for (let frame = 1; frame <= MAX_SECONDS * FRAMES_PER_SECOND && seconds === null; frame++) {
        game.frame();
        if (holeWidth(tile.grid) >= MIN_HOLE_WIDTH) seconds = frame / FRAMES_PER_SECOND;
    }
    game.setPad(0);
    t.diagnostic(`hueco pasante a los ${seconds} s; material ${startArea.toFixed(3)} -> ${materialArea(tile.grid).toFixed(3)} m2; partículas gastadas ${game.state.corrosion.stats.consumed}`);
    assert.ok(seconds !== null, "no se abrió un hueco pasante");
    assert.ok(Math.abs(seconds - EXPECTED_HOLE_SECONDS) <= HOLE_TOLERANCE_SECONDS, `tardó ${seconds} s`);
});

test("la masa de acero disuelta coincide con la estequiometría por el factor y el libro de masa cierra", async (t) => {
    const game = await startJet();
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: [0, 0, ...AIM_AXES] });
    game.frames(2 * FRAMES_PER_SECOND);
    game.setPad(0);
    game.frames(FRAMES_PER_SECOND);
    const { store, corrosion } = game.state;
    const side = PARTICLE_SIDE_IN_RADII * game.state.particleSystem.GetRadius();
    const acidMass = MATERIALS.acid.SG * SIGMA_W * side * side * MATERIALS.acid.species.H2SO4;
    const steelPerParticle = (acidMass * CORROSION.ironMolarMass * CORROSION.speedup) / CORROSION.acidMolarMass;
    const expected = corrosion.stats.spentAcid * steelPerParticle;
    t.diagnostic(`ácido gastado ${corrosion.stats.spentAcid.toFixed(1)} partículas; destruidas ${corrosion.stats.consumed}; acero ${corrosion.stats.dissolvedMass.toFixed(4)} kg esperado ${expected.toFixed(4)} kg`);
    assert.ok(corrosion.stats.spentAcid > 0);
    assert.ok(Math.abs(corrosion.stats.dissolvedMass - expected) <= MASS_TOLERANCE * expected);
    assert.equal(store.destroyed[SINK.CORRODED][FLUID.ACID], corrosion.stats.consumed);
    for (const kind of [FLUID.ACID, FLUID.WATER]) {
        let live = 0;
        for (let slot = 0; slot < store.capacity; slot++) if (store.alive[slot] === 1 && store.kind[slot] === kind) live++;
        let destroyed = 0;
        for (const book of store.destroyed) destroyed += book[kind];
        assert.equal(store.created[kind], live + destroyed, `masa del material ${kind}`);
    }
});

test("el ácido apoyado sigue corroyendo después de cortar el chorro y ninguna gota pasa de su ácido", async (t) => {
    const game = await startJet();
    const { corrosion, store } = game.state;
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: [0, 0, ...AIM_AXES] });
    game.frames(FRAMES_PER_SECOND);
    game.setPad(0);
    game.frames(1);
    const afterJet = corrosion.stats.dissolvedMass;
    game.frames(RESTING_SECONDS * FRAMES_PER_SECOND);
    t.diagnostic(`acero al cortar ${afterJet.toFixed(3)} kg, ${RESTING_SECONDS} s después ${corrosion.stats.dissolvedMass.toFixed(3)} kg; gotas destruidas ${corrosion.stats.consumed}`);
    assert.ok(corrosion.stats.dissolvedMass > afterJet, "el ácido apoyado no siguió corroyendo");
    for (let slot = 0; slot < store.capacity; slot++) assert.ok(corrosion.spent[slot] <= 1 + SPENT_TOLERANCE);
});

test("la ronda nueva devuelve el terreno corroído a su forma original", async () => {
    const game = await startJet();
    const tile = platformTile(game);
    const startArea = materialArea(tile.grid);
    const startPolygons = tile.polygons.length;
    while (holeWidth(tile.grid) < ROBOT_HOLE_WIDTH) {
        game.state.terrain.erodeAt({ x: PLATFORM.x, y: PLATFORM.y, reach: game.state.corrosion.reach, area: WIDENING_AREA });
        game.frame();
    }
    assert.ok(materialArea(tile.grid) < startArea);
    game.state.players[1].hp = 0;
    game.frames(ROUND_OVER_FRAMES);
    assert.equal(holeWidth(tile.grid), 0, "quedó el hueco después de la ronda nueva");
    assert.ok(Math.abs(materialArea(tile.grid) - startArea) < MASS_TOLERANCE * startArea);
    assert.equal(tile.polygons.length, startPolygons);
});

test("un robot lejos del hueco no se mueve y uno sobre el hueco cae", async (t) => {
    const game = await startJet();
    const tile = platformTile(game);
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: [0, 0, ...AIM_AXES] });
    for (let frame = 0; frame < MAX_SECONDS * FRAMES_PER_SECOND && holeWidth(tile.grid) < MIN_HOLE_WIDTH; frame++) game.frame();
    game.setPad(0);
    assert.ok(holeWidth(tile.grid) >= MIN_HOLE_WIDTH, "no se abrió el hueco");
    const columns = widestHole(tile.grid);
    const holeX = tile.grid.originX + (columns[Math.floor(columns.length / 2)] + 0.5) * tile.grid.cellWidth;
    while (holeWidth(tile.grid) < ROBOT_HOLE_WIDTH) {
        game.state.terrain.erodeAt({ x: holeX, y: PLATFORM.y, reach: game.state.corrosion.reach, area: WIDENING_AREA });
        game.frame();
    }
    game.frames(FRAMES_PER_SECOND);
    const [shooter, far] = game.state.players;
    const shooterBefore = shooter.torso.GetPosition().get_x();
    const dropHeight = PLATFORM_TOP + SHOOTER_TORSO_HEIGHT;
    place(game, 1, holeX, dropHeight);
    game.frames(FALL_SECONDS * FRAMES_PER_SECOND);
    t.diagnostic(`hueco en x ${holeX.toFixed(2)} de ${holeWidth(tile.grid).toFixed(2)} m; robot sobre el hueco: y ${dropHeight.toFixed(2)} -> ${far.torso.GetPosition().get_y().toFixed(2)}; tirador x ${shooterBefore.toFixed(2)} -> ${shooter.torso.GetPosition().get_x().toFixed(2)}, y ${shooter.torso.GetPosition().get_y().toFixed(2)}`);
    assert.ok(dropHeight - far.torso.GetPosition().get_y() > FALL_DISTANCE, "el robot sobre el hueco no cayó");
    assert.ok(Math.abs(shooter.torso.GetPosition().get_x() - shooterBefore) < SHOOTER_DRIFT, "el tirador, lejos del hueco, se movió");
    assert.ok(Math.abs(shooter.torso.GetPosition().get_y() - dropHeight) < SHOOTER_DRIFT, "el tirador, lejos del hueco, cambió de altura");
});