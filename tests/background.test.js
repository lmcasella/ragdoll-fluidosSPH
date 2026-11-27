/**
 * Fondo de planta industrial (docs/design/13-arte.md §13.1): cuenta de parallax, azar con semilla por tramo, colores más
 * oscuros que las plataformas y vista retenida que recicla tramos sin crear nodos nuevos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

installFakePixi();
const { BACKGROUND, SKY_STOPS, layerPlacement, generateSegment, segmentKey } = await import("../src/render/background.js");
const { BackgroundView } = await import("../src/render/backgroundView.js");
const { piecewiseLinear } = await import("../src/core/math/numeric.js");

const PIXELS_PER_METER = 32;
const VIEW_WIDTH = 1920;
const VIEW_HEIGHT = 1080;
const CAMERA_ZOOM = 1.5;
const CAMERA_X = 20;
const CAMERA_Y = 10;
const PLATFORM_FILL = [0x2b, 0x2b, 0x38];
const COLOR_CHANNEL_BITS = [16, 8, 0];
const BYTE_MASK = 0xff;
const TOLERANCE = 1e-9;
const FAR_MOVE_METERS = 500;
const FLOOR_HEIGHT = 10;
const SUMMIT_HEIGHT = 150;
const SPLIT_ROWS = 40;
const SPLIT_COLUMNS = 40;
const SEGMENT_SAMPLE = 20;

function channelsOf(color) {
    return COLOR_CHANNEL_BITS.map((shift) => (color >> shift) & BYTE_MASK);
}

function placementFor(depth, overrides = {}) {
    return layerPlacement(
        { depth, x: CAMERA_X, y: CAMERA_Y, zoom: CAMERA_ZOOM, viewWidth: VIEW_WIDTH, viewHeight: VIEW_HEIGHT, pixelsPerMeter: PIXELS_PER_METER, ...overrides },
        {},
    );
}

function cameraAt(x, y) {
    return { x, y, zoom: CAMERA_ZOOM, viewWidth: VIEW_WIDTH, viewHeight: VIEW_HEIGHT };
}

test("profundidad 0 deja la capa fija a la pantalla y 1 la mueve como el escenario", () => {
    const fixed = placementFor(0);
    assert.equal(fixed.zoom, 1);
    assert.equal(fixed.positionX, VIEW_WIDTH / 2);
    assert.equal(fixed.positionY, VIEW_HEIGHT / 2);
    const stage = placementFor(1);
    assert.equal(stage.zoom, CAMERA_ZOOM);
    const scale = PIXELS_PER_METER * CAMERA_ZOOM;
    assert.ok(Math.abs(stage.positionX - (VIEW_WIDTH / 2 - CAMERA_X * scale)) < TOLERANCE);
    assert.ok(Math.abs(stage.positionY - (VIEW_HEIGHT / 2 + CAMERA_Y * scale)) < TOLERANCE);
});

test("el desplazamiento y el zoom de cada capa crecen con su factor de profundidad", () => {
    const placements = BACKGROUND.layers.map((layer) => placementFor(layer.depth));
    for (let index = 1; index < placements.length; index++) {
        assert.ok(placements[index].zoom > placements[index - 1].zoom);
    }
    const [depth] = BACKGROUND.layers.map((layer) => layer.depth);
    const half = placementFor(depth);
    assert.ok(Math.abs(half.zoom - (1 + (CAMERA_ZOOM - 1) * depth)) < TOLERANCE);
    const centerX = (half.left + half.right) / 2;
    assert.ok(Math.abs(centerX - CAMERA_X * depth) < TOLERANCE);
});

test("las capas van de lejos a cerca y nunca son más claras que las plataformas", () => {
    const depths = BACKGROUND.layers.map((layer) => layer.depth);
    assert.deepEqual([...depths].sort((first, second) => first - second), depths);
    const colors = [...BACKGROUND.layers.map((layer) => layer.color), BACKGROUND.smokeColor];
    for (const color of colors) {
        channelsOf(color).forEach((channel, index) => assert.ok(channel <= PLATFORM_FILL[index]));
    }
    for (const band of BACKGROUND.bands) {
        band.sky.forEach((channel, index) => assert.ok(channel <= PLATFORM_FILL[index]));
    }
});

test("el cielo se funde entre franjas sin saltos", () => {
    const floor = piecewiseLinear(SKY_STOPS, FLOOR_HEIGHT, []);
    assert.deepEqual(floor, BACKGROUND.bands[0].sky);
    const summit = piecewiseLinear(SKY_STOPS, SUMMIT_HEIGHT, []);
    assert.deepEqual(summit, BACKGROUND.bands[2].sky);
    const edge = BACKGROUND.bands[1].minHeight;
    const middle = piecewiseLinear(SKY_STOPS, edge, []);
    middle.forEach((channel, index) => {
        const low = Math.min(BACKGROUND.bands[0].sky[index], BACKGROUND.bands[1].sky[index]);
        const high = Math.max(BACKGROUND.bands[0].sky[index], BACKGROUND.bands[1].sky[index]);
        assert.ok(channel >= low && channel <= high);
    });
});

test("el mismo tramo se genera siempre igual y los vecinos se ven distintos", () => {
    BACKGROUND.layers.forEach((layer, layerIndex) => {
        const first = generateSegment(layerIndex, 3, -2);
        assert.deepEqual(generateSegment(layerIndex, 3, -2), first);
        const signatures = new Set();
        for (let column = 0; column < SEGMENT_SAMPLE; column++) {
            signatures.add(JSON.stringify(generateSegment(layerIndex, column, 0)));
        }
        assert.ok(signatures.size > SEGMENT_SAMPLE / 2, `capa ${layerIndex}: tramos vecinos distintos`);
        assert.notDeepEqual(generateSegment(layerIndex, 3, -2), generateSegment(layerIndex, 4, -2));
        assert.notDeepEqual(generateSegment(layerIndex, 3, -2), generateSegment(layerIndex, 3, -1));
    });
    assert.notDeepEqual(generateSegment(0, 5, 0), generateSegment(1, 5, 0));
});

test("las claves de tramo no se repiten entre columnas y filas, también negativas", () => {
    const keys = new Set();
    for (let column = -SPLIT_COLUMNS; column < SPLIT_COLUMNS; column++) {
        for (let row = -SPLIT_ROWS; row < SPLIT_ROWS; row++) keys.add(segmentKey(column, row));
    }
    assert.equal(keys.size, 4 * SPLIT_COLUMNS * SPLIT_ROWS);
});

test("la vista no dibuja ni crea nada en frames con la cámara quieta y recicla al alejarse", () => {
    const parent = new PIXI.Container();
    const view = new BackgroundView({ parent, pixelsPerMeter: PIXELS_PER_METER });
    view.update(cameraAt(CAMERA_X, CAMERA_Y));
    const builds = view.segmentBuilds;
    const graphics = PIXI.Graphics.constructed;
    assert.ok(builds > 0);
    for (let frame = 0; frame < SEGMENT_SAMPLE; frame++) view.update(cameraAt(CAMERA_X, CAMERA_Y));
    assert.equal(view.segmentBuilds, builds, "ningún tramo se vuelve a dibujar");
    assert.equal(PIXI.Graphics.constructed, graphics, "ningún Graphics nuevo");
    view.update(cameraAt(CAMERA_X + FAR_MOVE_METERS, CAMERA_Y + FAR_MOVE_METERS));
    assert.ok(view.segmentBuilds > builds, "los tramos nuevos se dibujan al entrar a la vista");
    const created = PIXI.Graphics.constructed - graphics;
    const redrawn = view.segmentBuilds - builds;
    assert.ok(created < redrawn, `se reciclan los tramos que salieron (${created} nuevos de ${redrawn} dibujados)`);
});
