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
    assert.deepEqual(Object.values(SURFACES).map((surface) => surface.id), [1, 2, 3, 4]);
});

test("la tabla da el ataque del ácido: acero 1, hormigón 1 y vidrio 0, y el vidrio es translúcido", () => {
    assert.equal(SURFACES.steel.acidAttack, 1);
    assert.equal(SURFACES.concrete.acidAttack, 1);
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

test("el hormigón pierde la misma materia que el acero con el mismo ácido", () => {
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
    assert.ok(Math.abs(concreteLost / steelLost - SURFACES.concrete.acidAttack) < RATIO_TOLERANCE, `proporción ${concreteLost / steelLost}`);
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

test("el terreno entrega cada tramo con su material, sus contornos y la grilla de la que sale el desgaste", () => {
    const terrain = newTerrain();
    terrain.addSolid({ ...SLAB, material: "steel" });
    terrain.addSolid({ ...SLAB, x: FAR_SLAB_X, kind: "floor" });
    const clean = terrain.shape;
    assert.deepEqual([...new Set(clean.tiles.map((tile) => tile.surface))].sort(), ["concrete", "steel"]);
    assert.ok(clean.tiles.every((tile) => tile.rings.length > 0 && tile.grid.wornCells().length === 0));
    const version = clean.version;
    erodeOver(terrain, SLAB.x);
    terrain.update();
    const worn = terrain.shape;
    assert.notEqual(worn.version, version);
    const wornTiles = worn.tiles.filter((tile) => tile.grid.wornCells().length > 0);
    assert.ok(wornTiles.length > 0 && wornTiles.every((tile) => tile.surface === "steel"));
    terrain.dispose();
});
test("el shader reconoce los tres materiales por id, no usa texturas externas y el código del color es reversible", () => {
    for (const name of ["STEEL", "CONCRETE"]) assert.ok(SURFACE_FRAGMENT.includes(`id == ${name}_ID`), `rama de ${name}`);
    assert.ok(SURFACE_FRAGMENT.includes("glassColor(world)"), "rama del vidrio");
    for (const name of ["STEEL", "CONCRETE", "GLASS"]) assert.ok(SURFACE_FRAGMENT.includes(`const int ${name}_ID`), `id de ${name}`);
    assert.equal(SURFACE_FRAGMENT.match(/sampler2D/g).length, 2, "la textura de entrada del filtro y el mapa de luz");
    assert.equal(SURFACE_FRAGMENT.match(/texture\(/g).length, 3, "la lectura del fragmento, la de la cobertura de los vecinos del bisel y la del mapa de luz");
    assert.ok(SURFACE_FRAGMENT.includes("uOutputFrame") && SURFACE_FRAGMENT.includes("uInputSize"));

    const code = encodeSurface({ surface: "concrete", wear: 0.5 });
    assert.equal(Math.round(((code >> RED_SHIFT) & CHANNEL_MAX) / CHANNEL_MAX * SURFACE_ID_SCALE), SURFACES.concrete.id);
    assert.equal((code >> GREEN_SHIFT) & CHANNEL_MAX, Math.round(0.5 * CHANNEL_MAX));
    assert.equal(code & CHANNEL_MAX, 0, "el canal azul ya no se usa");
    assert.ok(!/code\.b\b/.test(SURFACE_FRAGMENT), "el fragmento no lee el canal azul");
    assert.ok(!SURFACE_FRAGMENT.includes("_EDGE"), "sin aclarado de borde por material");
});

test("el shader come el borde visible con un ruido de mundo: hasta 4 cm en los cantos y 8 cm en las esquinas, solo en el alfa", () => {
    assert.ok(SURFACE_FRAGMENT.includes("const float ERODE_REACH = 0.04;"));
    assert.ok(SURFACE_FRAGMENT.includes("const float ERODE_CORNER_REACH = 0.08;"));
    assert.ok(SURFACE_FRAGMENT.includes("valueNoise(world * ERODE_FREQUENCY)"), "ruido en coordenadas de mundo");
    assert.ok(SURFACE_FRAGMENT.includes("surface.a * encoded.a * (1.0 - edgeErosion("), "afecta al alfa y no a la física");
});

test("el filtro se crea una vez y la cámara se actualiza sin reconstruirlo ni crear uniforms nuevos", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const created = pixi.Filter.constructed;
    assert.deepEqual(view.fixedContainer.filters, [view.surfaceFilter]);
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

/** Tramo publicado de 1 m x 1 m con su borde izquierdo en `minX`, como lo entrega `Terrain.shape`. */
function publishedTile(surface, minX) {
    const grid = new DensityGrid({ originX: minX, originY: 0, width: 1, height: 1 });
    grid.fillRectangle({ minX, minY: 0, maxX: minX + 1, maxY: 1 });
    const ring = [minX, 0, minX + 1, 0, minX + 1, 1, minX, 1];
    return { surface, grid, bounds: { minX, minY: 0, maxX: minX + 1, maxY: 1 }, rings: [ring], shapeVersion: 1, wearVersion: 1 };
}

/** Lo que publica `Terrain.shape` para esos tramos. */
function publish(tiles, { version, tilesVersion }) {
    return { version, tilesVersion, tiles };
}

/** Cantidad de veces que se vació el `Graphics` de cada tramo. */
function clearsOf(view, tiles) {
    return tiles.map((tile) => view.tileEntries.get(tile).graphics.clears);
}

test("LevelView pinta cada tramo con el color de su material y no redibuja si no cambian la forma ni el desgaste", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const steel = publishedTile("steel", 0);
    const concrete = publishedTile("concrete", FAR_SLAB_X);
    const level = { solids: [] };
    view.update(level, 0, 0, SCREEN_SCALE, publish([steel, concrete], { version: 1, tilesVersion: 1 }));
    const builds = view.fixedBuilds;
    const colorOf = (tile) => view.tileEntries.get(tile).graphics.fills.map((fill) => fill.color);
    assert.deepEqual(colorOf(steel), [encodeSurface({ surface: "steel", wear: 0 })]);
    assert.deepEqual(colorOf(concrete), [encodeSurface({ surface: "concrete", wear: 0 })]);
    const strokes = view.tileEntries.get(steel).graphics.strokes;
    assert.equal(strokes.length, 1, "un solo trazo por tramo: el solape con los vecinos");
    assert.equal(strokes[0].color, encodeSurface({ surface: "steel", wear: 0 }), "del color del relleno, no un contorno claro");
    assert.ok(Math.abs(strokes[0].width * SCREEN_SCALE / PIXELS_PER_METER - 1) < RATIO_TOLERANCE, "mide 1 px de pantalla: medio píxel por lado");
    assert.equal(view.fixedContainer.children.length, 4, "los rectángulos sin terreno, las rompibles y un Graphics por tramo");
    view.update(level, 0, 0, SCREEN_SCALE, publish([steel, concrete], { version: 1, tilesVersion: 1 }));
    assert.equal(view.fixedBuilds, builds, "misma forma y mismo desgaste: no redibuja");

    const cellArea = steel.grid.cellWidth * steel.grid.cellHeight;
    steel.grid.erode({ x: 0.25, y: 0.25, reach: steel.grid.cellWidth / 4, area: 0.3 * cellArea });
    steel.grid.erode({ x: 0.75, y: 0.75, reach: steel.grid.cellWidth / 4, area: 0.3 * cellArea });
    steel.wearVersion++;
    view.update(level, 0, 0, SCREEN_SCALE, publish([steel, concrete], { version: 2, tilesVersion: 1 }));
    assert.equal(view.fixedBuilds, builds + 1, "cambió el desgaste: redibuja");
    const worn = steel.grid.wornCells();
    assert.equal(worn.length, 2);
    assert.equal(view.tileEntries.get(steel).graphics.rectangles, 2, "una forma por celda con desgaste");
    assert.ok(view.tileEntries.get(steel).graphics.fills.some((fill) => fill.color === encodeSurface({ surface: "steel", wear: Math.round(0.3 * CHANNEL_MAX) / CHANNEL_MAX })));
});

test("LevelView solo redibuja el tramo que cambió, y reusa el Graphics de un tramo quitado", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const left = publishedTile("steel", 0);
    const right = publishedTile("steel", 1);
    const far = publishedTile("steel", FAR_SLAB_X);
    const tiles = [left, right, far];
    const level = { solids: [] };
    view.update(level, 0, 0, SCREEN_SCALE, publish(tiles, { version: 1, tilesVersion: 1 }));
    assert.deepEqual(clearsOf(view, tiles), [1, 1, 1], "el primer dibujo vacía cada Graphics una vez");

    far.wearVersion++;
    view.update(level, 0, 0, SCREEN_SCALE, publish(tiles, { version: 2, tilesVersion: 1 }));
    assert.deepEqual(clearsOf(view, tiles), [1, 1, 2], "solo el desgaste de un tramo: se redibuja ese tramo");

    left.shapeVersion++;
    view.update(level, 0, 0, SCREEN_SCALE, publish(tiles, { version: 3, tilesVersion: 1 }));
    assert.deepEqual(clearsOf(view, tiles), [2, 1, 2], "la forma de un tramo solo redibuja ese tramo");

    const built = pixi.Graphics.constructed;
    view.update(level, 0, 0, SCREEN_SCALE, publish([left, right], { version: 4, tilesVersion: 2 }));
    assert.equal(view.fixedContainer.children.length, 4, "el Graphics del tramo quitado sale del contenedor");
    const replacement = publishedTile("concrete", FAR_SLAB_X);
    view.update(level, 0, 0, SCREEN_SCALE, publish([left, right, replacement], { version: 5, tilesVersion: 3 }));
    assert.equal(pixi.Graphics.constructed, built, "el tramo nuevo reusa el Graphics del pool");
    assert.deepEqual(clearsOf(view, [left, right]), [2, 1], "los tramos que siguen no se tocan");
});

test("SURFACES.plate es la chapa fina oxidada: ataque del ácido 1, nervadura cada 0,25 m y opaca", () => {
    assert.equal(SURFACES.plate.id, 4);
    assert.equal(SURFACES.plate.acidAttack, 1);
    assert.equal(SURFACES.plate.patternSize, 0.25);
    assert.equal(SURFACES.plate.alpha, 1);
    assert.ok(SURFACES.plate.baseColor.every((channel) => channel >= 0 && channel <= 1));
    assert.ok(SURFACE_FRAGMENT.includes("id == PLATE_ID"), "rama de la chapa");
    assert.ok(SURFACE_FRAGMENT.includes("plateColor(world, code.g)"), "la grieta sale del canal verde");
    const plateBody = SURFACE_FRAGMENT.split("vec3 plateColor")[1].split("vec4 glassColor")[0];
    assert.ok(!plateBody.includes("panelEdgeOffset") && !plateBody.includes("JOINT"), "la chapa no tiene juntas de panel");
});

test("el fragmento solo usa funciones de GLSL ES 1.00: sin texelFetch, textureSize, resto ni operaciones de bits", () => {
    for (const forbidden of ["texelFetch", "textureSize", "%", "<<", ">>", "floatBitsToInt", "uint "]) {
        assert.ok(!SURFACE_FRAGMENT.includes(forbidden), forbidden);
    }
});

test("las rompibles van en el contenedor con el filtro y codifican su grieta en el canal verde", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    assert.ok(view.fixedContainer.children.includes(view.breakableGraphics), "mismo contenedor que el filtro");
    assert.ok(!view.container.children.includes(view.breakableGraphics), "ya no cuelga fuera del filtro");
    const crack = 0.5;
    const level = { solids: [{ x: 5, y: 3, w: 2, h: 0.4, kind: "platform", breakable: true, crack }] };
    view.update(level, 0, 0, SCREEN_SCALE, null);
    const { fills, strokes } = view.breakableGraphics;
    assert.deepEqual(fills.map((fill) => fill.color), [encodeSurface({ surface: "plate", wear: crack })]);
    const code = fills[0].color;
    assert.equal((code >> GREEN_SHIFT) & CHANNEL_MAX, Math.round(crack * CHANNEL_MAX), "la grieta en G");
    assert.equal(strokes.length, 0, "sin contorno");
    level.solids[0].crack = 0;
    view.update(level, 0, 0, SCREEN_SCALE, null);
    assert.equal((view.breakableGraphics.fills[0].color >> GREEN_SHIFT) & CHANNEL_MAX, 0, "sin grieta, la chapa entera");
});

test("la luz base y el brillo del acero dan contraste sin luces cercanas sin oscurecer la plataforma en promedio", async () => {
    const { LIGHTING } = await import("../src/render/lighting.js");
    const { base, fill } = LIGHTING;
    assert.deepEqual(base, { direction: [-0.45, 0.89], front: 0.8, color: [1, 0.93, 0.82], intensity: 0.88, ambient: 0.12 });
    assert.deepEqual(fill, { color: [0.45, 0.55, 0.75], intensity: 0.25 });
    assert.ok(SURFACE_FRAGMENT.includes("const float SPECULAR_STRENGTH = 0.6;"));
});