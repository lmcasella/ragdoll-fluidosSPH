/**
 * Capa de debug del terreno de densidad (#346, docs/design/05-escenario.md §5.5): la vista dibuja densidad, tramos, polígonos,
 * contorno y destello solo con la capa encendida, y el panel muestra los conteos y el costo de reconstruir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "./helpers/game.js";
import { installFakePixi } from "./helpers/fake-pixi.js";
import { Debug } from "../src/core/debug.js";
import { DebugView } from "../src/render/debugView.js";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");

const { Terrain } = await import("../src/level/terrain.js");
const { SOLID_FRICTION } = await import("../src/level/level.js");

const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;
const FAR_VIEW = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
const NO_VIEW = { minX: 500, minY: 500, maxX: 600, maxY: 600 };
const FLASH_ALPHA = 0.5;
const SETTLE_FRAMES = 4;
const ISLAND_TOP = 4;
const TOP_TOLERANCE = 1e-6;

function newTerrain() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const definition = new Box2D.b2BodyDef();
    const body = world.CreateBody(definition);
    Box2D.destroy(definition);
    const terrain = new Terrain({ body, friction: SOLID_FRICTION });
    terrain.addSolid({ x: 2, y: 0.5, w: 3, h: 1 });
    terrain.addSolid({ x: 8, y: 0.5, w: 1, h: 1 });
    return terrain;
}

function refsOf(terrain, view = FAR_VIEW) {
    return { tiles: terrain.tiles, frame: terrain.frame, offsetX: terrain.offsetX, offsetY: terrain.offsetY, view };
}

function newView(debug) {
    installFakePixi();
    return new DebugView({ parent: new PIXI.Container(), pixelsPerMeter: PIXELS_PER_METER, debug });
}

test("la capa del terreno dibuja densidad, bordes de tramo, polígonos y contorno, y destella el tramo rehecho en este frame", () => {
    const terrain = newTerrain();
    const debug = new Debug();
    debug.layers.terreno = true;
    const view = newView(debug);
    const graphics = view.layerGraphics.terreno;
    view.drawLayers(SCREEN_SCALE, { terrain: refsOf(terrain) });
    assert.equal(graphics.strokes.length, 3, "bordes de tramo, polígonos y contorno");
    assert.ok(graphics.fills.length > 0, "celdas con densidad");
    assert.ok(graphics.fills.every((fill) => fill.alpha > 0 && fill.alpha <= 0.5), "alfa según densidad");
    const cellFills = graphics.fills.length;
    terrain.tiles.values().next().value.grid.dirty = true;
    terrain.update();
    view.drawLayers(SCREEN_SCALE, { terrain: refsOf(terrain) });
    const flashes = graphics.fills.filter((fill) => fill.alpha === FLASH_ALPHA);
    assert.equal(flashes.length, 1, "destella solo el tramo rehecho");
    assert.equal(graphics.fills.length, cellFills + 1);
    terrain.update();
    view.drawLayers(SCREEN_SCALE, { terrain: refsOf(terrain) });
    assert.equal(graphics.fills.filter((fill) => fill.alpha === FLASH_ALPHA).length, 0, "el destello dura un frame");
    terrain.dispose();
});

test("la capa del terreno apagada no dibuja nada, se borra una vez al apagarla y solo dibuja los tramos a la vista", () => {
    const terrain = newTerrain();
    const debug = new Debug();
    const view = newView(debug);
    const graphics = view.layerGraphics.terreno;
    view.drawLayers(SCREEN_SCALE, null);
    assert.equal(graphics.clears, 0, "apagada desde el principio no se toca");
    debug.layers.terreno = true;
    view.drawLayers(SCREEN_SCALE, { terrain: refsOf(terrain, NO_VIEW) });
    assert.equal(graphics.strokes.length + graphics.fills.length, 0, "ningún tramo a la vista, nada que dibujar");
    view.drawLayers(SCREEN_SCALE, { terrain: refsOf(terrain) });
    assert.ok(graphics.fills.length > 0);
    debug.layers.terreno = false;
    const built = PIXI.Graphics.constructed;
    view.drawLayers(SCREEN_SCALE, null);
    view.drawLayers(SCREEN_SCALE, null);
    assert.equal(graphics.strokes.length + graphics.fills.length, 0, "la capa apagada queda vacía");
    assert.equal(PIXI.Graphics.constructed, built, "no se crean gráficos por frame");
    terrain.dispose();
});

test("el panel suma las grillas, los polígonos, los vértices, las reconstrucciones por frame y su costo", () => {
    const debug = new Debug();
    debug.stats = true;
    debug.open = true;
    const data = {
        fps: 60,
        ms: {},
        particles: {},
        contacts: 0,
        cflSubsteps: 1,
        volume: { total: 1 },
        bots: [],
        terrain: { grids: 46, polygons: 46, vertices: 184, rebuilds: 4, rebuildMs: 1.25 },
    };
    debug.frame(data);
    const line = debug.lines().find((candidate) => candidate.startsWith("terreno:"));
    assert.equal(line, "terreno: 46 grillas · 46 polígonos · 184 vértices · 4.00 reconstrucciones por frame · 1.250 ms");
    delete data.terrain;
    const without = new Debug();
    without.stats = true;
    without.frame(data);
    assert.ok(!without.lines().some((candidate) => candidate.startsWith("terreno:")), "sin datos del terreno no hay línea");
});

test("en el juego, la fila Terreno enciende la capa y el panel muestra los conteos del mapa y lo que costó rehacer un tramo", async () => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(SETTLE_FRAMES);
    const { debug, debugView, terrain } = game.state;
    assert.equal(debugView.layerGraphics.terreno.strokes.length, 0, "apagada no dibuja");
    debug.layers.terreno = true;
    debug.stats = true;
    debug.open = true;
    game.frames(SETTLE_FRAMES);
    assert.equal(debugView.layerGraphics.terreno.strokes.length, 3);
    const counts = terrain.counts();
    const line = () => game.hudTexts.find((text) => text.startsWith("terreno:"));
    assert.ok(line().startsWith(`terreno: ${counts.grids} grillas · ${counts.polygons} polígonos · ${counts.vertices} vértices`), line());
    const torsoX = game.state.players[0].torso.GetPosition().get_x();
    const underRobot = [...terrain.tiles].find(
        ({ grid }) => grid.originX <= torsoX && torsoX < grid.originX + grid.width && Math.abs(grid.originY + grid.height - ISLAND_TOP) < TOP_TOLERANCE,
    );
    underRobot.grid.dirty = true;
    game.frame();
    assert.equal(terrain.lastRebuilds, 1);
    assert.equal(debugView.layerGraphics.terreno.fills.filter((fill) => fill.alpha === FLASH_ALPHA).length, 1, "el tramo rehecho destella");
    assert.ok(debug.avg.terrain.rebuilds > 0, "el panel promedia las reconstrucciones");
    debug.layers.terreno = false;
    game.frames(SETTLE_FRAMES);
    assert.equal(debugView.layerGraphics.terreno.strokes.length + debugView.layerGraphics.terreno.fills.length, 0, "apagada vuelve a quedar vacía");
});
