/**
 * Materiales de las plataformas (#348, docs/design/13-arte.md §13.2): material por defecto y explícito, reactividad al
 * ácido según la tabla, desgaste por celda, shader sin texturas y vista del nivel que redibuja solo cuando cambia algo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { installFakePixi } from "./helpers/fake-pixi.js";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");

const { SURFACES, surfaceOf } = await import("../src/level/surfaces.js");
const { DensityGrid, NEIGHBOR_WEAR } = await import("../src/level/densityGrid.js");
const { Terrain } = await import("../src/level/terrain.js");
const { SOLID_FRICTION } = await import("../src/level/level.js");
const { SURFACE_FRAGMENT, SURFACE_ID_SCALE, createSurfaceFilter, encodeSurface, updateSurfaceFilter } = await import("../src/render/surfaceFilter.js");
const { LevelView } = await import("../src/render/levelView.js");

const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;
const ERODE_AREA = 0.05;
const ERODE_REACH = 0.2;
const SLAB = { x: 2, y: 1, w: 2, h: 1 };
const FAR_SLAB_X = 20;
const RATIO_TOLERANCE = 1e-3;
const GRID = { originX: 0, originY: 0, width: 1, height: 1 };
const CELL_ROW = 10;
const CELL_COLUMN = 10;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const CHANNEL_MAX = 255;
const SECOND_ORIGIN = { x: 100, y: 200 };
const FIRST_ORIGIN = { x: 10, y: 20 };
const LEVEL_OFFSET_Y = 3;

function newTerrain() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const definition = new Box2D.b2BodyDef();
    const body = world.CreateBody(definition);
    Box2D.destroy(definition);
    return new Terrain({ body, friction: SOLID_FRICTION });
}

function gridArea(terrain, surface) {
    let total = 0;
    for (const tile of terrain.tiles) {
        if (tile.surface !== surface) continue;
        for (const value of tile.grid.values) total += value;
    }
    return total;
}

function erodeOver(terrain, x) {
    return terrain.erodeAt({ x, y: SLAB.y, reach: ERODE_REACH, area: ERODE_AREA });
}

test("surfaceOf: material explícito, y por defecto piso y pared de hormigón, el resto de acero y vidrio solo declarado", () => {
    assert.equal(surfaceOf({ kind: "floor" }), "concrete");
    assert.equal(surfaceOf({ kind: "wall" }), "concrete");
    assert.equal(surfaceOf({ kind: "platform", oneWay: true }), "steel");
    assert.equal(surfaceOf({ kind: "platform" }), "steel");
    assert.equal(surfaceOf({}), "steel");
    assert.equal(surfaceOf({ kind: "floor", material: "steel" }), "steel");
    assert.equal(surfaceOf({ kind: "platform", oneWay: true, material: "concrete" }), "concrete");
    assert.deepEqual(Object.values(SURFACES).map((surface) => surface.id), [1, 2, 3]);
});

test("la tabla da el ataque del ácido: acero 1, hormigón 1/3 y vidrio 0, y el vidrio es translúcido", () => {
    assert.equal(SURFACES.steel.acidAttack, 1);
    assert.equal(SURFACES.concrete.acidAttack, 1 / 3);
    assert.equal(SURFACES.glass.acidAttack, 0);
    assert.equal(SURFACES.glass.alpha, 0.45);
    assert.equal(SURFACES.steel.patternSize, 1);
    assert.equal(SURFACES.concrete.patternSize, 0.15);
});

test("el terreno asigna el material por sólido y el vidrio no pierde densidad con ácido encima", () => {
    const terrain = newTerrain();
    terrain.addSolid({ ...SLAB, kind: "platform", oneWay: true, material: "glass" }, { oneWay: true });
    assert.equal([...terrain.tiles][0].surface, "glass");
    const before = gridArea(terrain, "glass");
    assert.equal(erodeOver(terrain, SLAB.x), 0, "no quita nada");
    assert.equal(terrain.touches({ x: SLAB.x, y: SLAB.y, reach: ERODE_REACH }), false, "no cuenta como contacto");
    assert.equal(gridArea(terrain, "glass"), before);
    terrain.dispose();
});

test("el hormigón pierde un tercio de la materia que pierde el acero con el mismo ácido", () => {
    const terrain = newTerrain();
    terrain.addSolid({ ...SLAB, material: "steel" });
    terrain.addSolid({ ...SLAB, x: FAR_SLAB_X, kind: "floor" });
    const steelBefore = gridArea(terrain, "steel");
    const concreteBefore = gridArea(terrain, "concrete");
    const steelEquivalent = erodeOver(terrain, SLAB.x);
    const concreteEquivalent = erodeOver(terrain, FAR_SLAB_X);
    const steelLost = steelBefore - gridArea(terrain, "steel");
    const concreteLost = concreteBefore - gridArea(terrain, "concrete");
    assert.ok(Math.abs(steelEquivalent - ERODE_AREA) < RATIO_TOLERANCE * ERODE_AREA, "el acero gasta el ácido entero");
    assert.ok(Math.abs(concreteEquivalent - ERODE_AREA) < RATIO_TOLERANCE * ERODE_AREA, "el hormigón gasta lo mismo");
    assert.ok(Math.abs(concreteLost / steelLost - 1 / 3) < RATIO_TOLERANCE, `proporción ${concreteLost / steelLost}`);
    terrain.dispose();
});

test("desgaste: cero en una grilla nueva, crece con la corrosión, los vecinos de una celda eliminada valen 0,6 o más y la ronda nueva lo borra", () => {
    const grid = new DensityGrid(GRID);
    grid.fillRectangle({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.ok(grid.wear.every((wear) => wear === 0), "una plataforma nueva no tiene desgaste");
    assert.equal(grid.wornCells().length, 0);

    const centerX = (CELL_COLUMN + 0.5) * grid.cellWidth;
    const centerY = (CELL_ROW + 0.5) * grid.cellHeight;
    const cellArea = grid.cellWidth * grid.cellHeight;
    const index = CELL_ROW * grid.columns + CELL_COLUMN;
    grid.erode({ x: centerX, y: centerY, reach: grid.cellWidth / 4, area: cellArea / 2 });
    assert.ok(Math.abs(grid.wear[index] - 0.5) < RATIO_TOLERANCE, "la mitad de la densidad perdida es desgaste 0,5");
    assert.ok(grid.wornCells().some((cell) => cell.wear > 0), "la celda con desgaste se informa para dibujar");

    grid.erode({ x: centerX, y: centerY, reach: grid.cellWidth / 4, area: cellArea / 2 });
    assert.equal(grid.values[index], 0, "la celda se eliminó");
    for (const [rowOffset, columnOffset] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
        const neighbor = (CELL_ROW + rowOffset) * grid.columns + CELL_COLUMN + columnOffset;
        assert.ok(grid.wear[neighbor] >= NEIGHBOR_WEAR, `vecino (${rowOffset}, ${columnOffset}) con desgaste ${grid.wear[neighbor]}`);
    }
    assert.equal(NEIGHBOR_WEAR, 0.6);

    grid.fillRectangle({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.ok(grid.wear.every((wear) => wear === 0), "restaurar borra el desgaste");
});

test("el terreno entrega el material de cada contorno y las celdas con desgaste en su forma", () => {
    const terrain = newTerrain();
    terrain.addSolid({ ...SLAB, material: "steel" });
    terrain.addSolid({ ...SLAB, x: FAR_SLAB_X, kind: "floor" });
    const clean = terrain.shape;
    assert.equal(clean.rings.length, clean.ringSurfaces.length);
    assert.deepEqual([...new Set(clean.ringSurfaces)].sort(), ["concrete", "steel"]);
    assert.equal(clean.wornCells.length, 0);
    erodeOver(terrain, SLAB.x);
    terrain.update();
    const worn = terrain.shape;
    assert.notEqual(worn.version, clean.version);
    assert.ok(worn.wornCells.length > 0 && worn.wornCells.every((cell) => cell.surface === "steel"));
    terrain.dispose();
});

test("el shader reconoce los tres materiales por id, no usa texturas externas y el código del color es reversible", () => {
    for (const name of ["STEEL", "CONCRETE"]) assert.ok(SURFACE_FRAGMENT.includes(`id == ${name}_ID`), `rama de ${name}`);
    assert.ok(SURFACE_FRAGMENT.includes("glassColor(world)"), "rama del vidrio");
    for (const name of ["STEEL", "CONCRETE", "GLASS"]) assert.ok(SURFACE_FRAGMENT.includes(`const int ${name}_ID`), `id de ${name}`);
    assert.equal(SURFACE_FRAGMENT.match(/sampler2D/g).length, 1, "solo la textura de entrada del filtro");
    assert.equal(SURFACE_FRAGMENT.match(/texture\(/g).length, 1);
    assert.ok(SURFACE_FRAGMENT.includes("uOutputFrame") && SURFACE_FRAGMENT.includes("uInputSize"));

    const code = encodeSurface({ surface: "concrete", wear: 0.5, edge: true });
    assert.equal(Math.round(((code >> RED_SHIFT) & CHANNEL_MAX) / CHANNEL_MAX * SURFACE_ID_SCALE), SURFACES.concrete.id);
    assert.equal((code >> GREEN_SHIFT) & CHANNEL_MAX, Math.round(0.5 * CHANNEL_MAX));
    assert.equal(code & CHANNEL_MAX, CHANNEL_MAX);
    assert.equal(encodeSurface({ surface: "steel", wear: 0, edge: false }) & CHANNEL_MAX, 0);
});

test("el filtro se crea una vez y la cámara se actualiza sin reconstruirlo ni crear uniforms nuevos", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const created = pixi.Filter.constructed;
    assert.deepEqual(view.fixedGraphics.filters, [view.surfaceFilter]);
    const { uniforms } = view.surfaceFilter.resources.surfaceUniforms;
    const originBuffer = uniforms.uOrigin;
    const level = { solids: [{ x: 5, y: 1, w: 4, h: 1, kind: "floor" }] };
    view.update(level, 0, 0, SCREEN_SCALE, null, FIRST_ORIGIN);
    assert.deepEqual([originBuffer[0], originBuffer[1], uniforms.uPixelsPerMeter], [FIRST_ORIGIN.x, FIRST_ORIGIN.y, SCREEN_SCALE]);
    view.update(level, LEVEL_OFFSET_Y, 0, SCREEN_SCALE, null, SECOND_ORIGIN);
    assert.deepEqual([originBuffer[0], originBuffer[1]], [SECOND_ORIGIN.x, SECOND_ORIGIN.y - LEVEL_OFFSET_Y * SCREEN_SCALE]);
    assert.equal(view.surfaceFilter.resources.surfaceUniforms.uniforms.uOrigin, originBuffer, "mismo buffer");
    assert.equal(pixi.Filter.constructed, created, "ningún filtro nuevo");

    const standalone = createSurfaceFilter();
    updateSurfaceFilter(standalone, { originX: 1, originY: 2, pixelsPerMeter: 3 });
    assert.deepEqual([...standalone.resources.surfaceUniforms.uniforms.uOrigin], [1, 2]);
});

test("LevelView pinta cada material con su color y no redibuja si no cambian la forma ni el desgaste", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const square = [0, 0, 1, 0, 1, 1, 0, 1];
    const shape = (version, wornCells) => ({ version, rings: [square, square.map((v) => v + 5)], ringSurfaces: ["steel", "concrete"], wornCells });
    const level = { solids: [] };
    view.update(level, 0, 0, SCREEN_SCALE, shape(1, []));
    const builds = view.fixedBuilds;
    const colors = view.fixedGraphics.fills.map((fill) => fill.color);
    assert.deepEqual(colors, [encodeSurface({ surface: "steel", wear: 0, edge: false }), encodeSurface({ surface: "concrete", wear: 0, edge: false })]);
    assert.equal(view.fixedGraphics.strokes.length, 2, "un trazo por material");
    view.update(level, 0, 0, SCREEN_SCALE, shape(1, []));
    assert.equal(view.fixedBuilds, builds, "misma forma y mismo desgaste: no redibuja");

    const worn = [{ surface: "steel", x: 0, y: 0, width: 0.05, height: 0.05, wear: 0.8 }, { surface: "steel", x: 0.05, y: 0, width: 0.05, height: 0.05, wear: 0.8 }];
    view.update(level, 0, 0, SCREEN_SCALE, shape(2, worn));
    assert.equal(view.fixedBuilds, builds + 1, "cambió el desgaste: redibuja");
    assert.equal(view.fixedGraphics.rectangles, 2, "una forma por celda con desgaste");
    assert.ok(view.fixedGraphics.fills.some((fill) => fill.color === encodeSurface({ surface: "steel", wear: Math.round(0.8 * CHANNEL_MAX) / CHANNEL_MAX, edge: false })));
});
