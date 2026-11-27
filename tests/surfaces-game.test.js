/**
 * El ácido sobre acero y sobre hormigón del nivel (#348, docs/design/13-arte.md §13.2): con LiquidFun real y gamepad
 * simulado, el acero pierde tanta materia como el ácido disuelto y el hormigón un tercio de eso; el vidrio no se toca.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "./helpers/game.js";
import { place } from "./helpers/place.js";
import { FLUID } from "../src/combat/weapons.js";
import { CORROSION, SIGMA_W } from "../src/fluids/materials.js";
import { WATER_DENSITY } from "../src/core/physics/constants.js";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");
const { LEVEL } = await import("../src/level/level.js");

const RIGHT_TRIGGER = 7;
const FRAMES_PER_SECOND = 60;
const SHOT_SECONDS = 3;
const SHOOTER_TORSO_HEIGHT = 0.7;
const FAR_X = 50;
const SLICE_THICKNESS = SIGMA_W / WATER_DENSITY;
const STEEL_PLATFORM = { x: 28, y: 7.6, width: 8, height: 0.4, shooterX: 25, aim: [0.97, 0.26] };
const CONCRETE_FLOOR = { top: 4, shooterX: 3, aim: [0.97, -0.1] };
const MIN_DISSOLVED_AREA = 0.01;
const PROPORTION_TOLERANCE = 0.02;
const CONCRETE_ATTACK = 1 / 3;

LEVEL.solids.find((solid) => solid.x === STEEL_PLATFORM.x && solid.y === STEEL_PLATFORM.y).material = "steel";

function areaOf(game, surface) {
    let total = 0;
    for (const tile of game.state.terrain.tiles) {
        if (tile.surface !== surface) continue;
        for (const value of tile.grid.values) total += value * tile.grid.cellWidth * tile.grid.cellHeight;
    }
    return total;
}

/** Dispara ácido `SHOT_SECONDS` desde `shooterX` sobre `top` y devuelve el área de acero equivalente disuelta y lo perdido por material, en m². */
async function shoot({ shooterX, top, aim }) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(10);
    place(game, 0, shooterX, top + SHOOTER_TORSO_HEIGHT);
    place(game, 1, FAR_X, top + SHOOTER_TORSO_HEIGHT);
    game.frames(30);
    const shooter = game.state.players[0];
    shooter.weapon = FLUID.ACID;
    shooter.tanks.set(FLUID.ACID, 1e6);
    game.state.match.roundTime = 1e6;
    const before = { steel: areaOf(game, "steel"), concrete: areaOf(game, "concrete"), glass: areaOf(game, "glass") };
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: [0, 0, ...aim] });
    game.frames(SHOT_SECONDS * FRAMES_PER_SECOND);
    game.setPad(0);
    const equivalent = game.state.corrosion.stats.dissolvedMass / (CORROSION.steelDensity * SLICE_THICKNESS);
    return {
        equivalent,
        steelLost: before.steel - areaOf(game, "steel"),
        concreteLost: before.concrete - areaOf(game, "concrete"),
        glassLost: before.glass - areaOf(game, "glass"),
    };
}

test("el ácido sobre una plataforma de acero quita tanta materia como el ácido disuelto y no toca el vidrio", async (t) => {
    const result = await shoot({ shooterX: STEEL_PLATFORM.shooterX, top: STEEL_PLATFORM.y + STEEL_PLATFORM.height / 2, aim: STEEL_PLATFORM.aim });
    t.diagnostic(`acero: equivalente ${result.equivalent.toFixed(4)} m2, perdido ${result.steelLost.toFixed(4)} m2, hormigón ${result.concreteLost.toFixed(4)} m2`);
    assert.ok(result.equivalent > MIN_DISSOLVED_AREA, "se disolvió algo");
    assert.ok(Math.abs(result.steelLost / result.equivalent - 1) < PROPORTION_TOLERANCE, "el acero pierde lo disuelto");
    assert.equal(result.glassLost, 0, "el vidrio no pierde nada");
});

test("el ácido sobre el piso de hormigón quita un tercio de la materia que quitaría sobre acero", async (t) => {
    const result = await shoot({ shooterX: CONCRETE_FLOOR.shooterX, top: CONCRETE_FLOOR.top, aim: CONCRETE_FLOOR.aim });
    t.diagnostic(`hormigón: equivalente ${result.equivalent.toFixed(4)} m2, perdido ${result.concreteLost.toFixed(4)} m2`);
    assert.ok(result.equivalent > MIN_DISSOLVED_AREA, "se disolvió algo");
    assert.ok(Math.abs(result.concreteLost / result.equivalent - CONCRETE_ATTACK) < PROPORTION_TOLERANCE, "el hormigón pierde un tercio");
    assert.equal(result.steelLost, 0, "no hay acero en el piso");
    assert.equal(result.glassLost, 0, "el vidrio no pierde nada");
});
