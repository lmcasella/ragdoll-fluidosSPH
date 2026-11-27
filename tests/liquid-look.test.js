import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { FLUID_LOOK, lookOf, SHOT_DRAW } = await import("../src/render/fluidDraw.js");
const { createLiquidFilter, updateLiquidFilter, liquidFragment, LIQUID_UNIFORM_GROUP } = await import("../src/render/liquidFilter.js");
const { createWaterFilter, createWaterHeights, decodeSurfaceHeight, HEIGHT_CHANNELS, HEIGHT_STEP_M, setWaterFilterLights, WATER_FRAGMENT, encodeWater } = await import("../src/render/waterFilter.js");
const { FluidLayers } = await import("../src/render/fluidLayers.js");
const { THRESHOLD_GAIN, THRESHOLD_OFFSET } = await import("../src/render/thresholdFilter.js");
const { WaterView, writeSurfaceHeights } = await import("../src/render/waterView.js");
const { WATER_FIELD, ShallowWater } = await import("../src/water/water.js");
const { createLightSet } = await import("../src/render/lighting.js");
const { MATERIALS } = await import("../src/fluids/materials.js");

const ACID = 1;
const LAVA = 2;
const HONEY = 3;
const WATER = 4;
const STONE = 5;
const STEAM = 6;

/** Opciones de textura de alturas para crear un filtro de agua suelto: `columnCount` columnas de 0,1 m desde x = 0. */
function heightsOptions(columnCount) {
    return { heights: createWaterHeights(columnCount).source, columns: { x0: 0, dx: 0.1, count: columnCount } };
}

const FRAME ={ time: 1.5, originX: 10, originY: 20, pixelsPerMeter: 40 };

test("la tabla de aspecto tiene los valores pedidos y solo el agua refracta", () => {
    const expected = {
        [ACID]: { fresnel: 0.5, rim: 0.3, glow: 0.25, emissive: 0 },
        [LAVA]: { fresnel: 0, rim: 0.2, glow: 1, emissive: 1 },
        [HONEY]: { fresnel: 0.4, rim: 0.35, glow: 0, emissive: 0 },
        [WATER]: { fresnel: 0.8, rim: 0.35, glow: 0, emissive: 0 },
    };
    for (const [kind, values] of Object.entries(expected)) {
        for (const [name, value] of Object.entries(values)) assert.equal(FLUID_LOOK[kind][name], value, `${kind}.${name}`);
    }
    assert.equal(FLUID_LOOK[WATER].refraction, 0.06);
    for (const kind of [ACID, LAVA, HONEY, STONE]) assert.equal(FLUID_LOOK[kind].refraction, 0, `kind ${kind}`);
    assert.equal(lookOf(STEAM).refraction, 0);
    assert.equal(lookOf(STEAM).glow, 0);
    assert.ok(Object.keys(FLUID_LOOK).every((kind) => SHOT_DRAW.kinds[kind] !== undefined), "cada fila corresponde a un material dibujado");
    assert.equal(FLUID_LOOK[LAVA].glowColor.length, 3);
    assert.equal(FLUID_LOOK[ACID].glowColor.length, 3);
});

test("solo el filtro del agua pide el fondo y declara uBackTexture", () => {
    installFakePixi();
    for (const kind of [ACID, LAVA, HONEY, STONE]) {
        const filter = createLiquidFilter(lookOf(kind));
        assert.equal(filter.options.blendRequired, false, `kind ${kind}`);
        assert.doesNotMatch(filter.options.glProgram.fragment, /uBackTexture/);
        assert.equal("uRefraction" in filter.resources[LIQUID_UNIFORM_GROUP].uniforms, false);
    }
    const water = createLiquidFilter(lookOf(WATER));
    assert.equal(water.options.blendRequired, true);
    assert.match(water.options.glProgram.fragment, /uniform sampler2D uBackTexture/);
    assert.equal(water.resources[LIQUID_UNIFORM_GROUP].uniforms.uRefraction, 0.06);
});

test("el fragmento de líquido conserva el umbral, no desenfoca y tiene halo, rama emisiva lisa y fresnel", () => {
    for (const refractive of [false, true]) {
        const fragment = liquidFragment(refractive);
        assert.ok(fragment.includes(`const float THRESHOLD_GAIN = ${THRESHOLD_GAIN.toFixed(4)};`));
        assert.ok(fragment.includes(`const float THRESHOLD_OFFSET = ${THRESHOLD_OFFSET.toFixed(4)};`));
        assert.ok(fragment.includes("clamp(field * THRESHOLD_GAIN + THRESHOLD_OFFSET, 0.0, 1.0)"));
        assert.doesNotMatch(fragment, /gaussian|blur/i);
        assert.match(fragment, /HALO_START_FIELD/, "halo");
        assert.doesNotMatch(fragment, /crust|crack/i, "sin costra ni grietas");
        assert.match(fragment, /uEmissive > 0\.0 \? moltenColor/, "rama emisiva");
        assert.match(fragment, /1\.0 - uFresnel/, "fresnel");
        assert.match(fragment, /uniform highp vec4 uInputSize;/);
        assert.match(fragment, /uniform highp vec4 uOutputFrame;/);
        assert.match(fragment, /precision highp float;/);
    }
});

test("el fragmento del agua del nivel lee el fondo, la profundidad y las luces con uniforms compartidos en highp", () => {
    assert.match(WATER_FRAGMENT, /precision highp float;/);
    assert.match(WATER_FRAGMENT, /uniform highp vec4 uInputSize;/);
    assert.match(WATER_FRAGMENT, /uniform highp vec4 uOutputFrame;/);
    assert.match(WATER_FRAGMENT, /uniform sampler2D uBackTexture;/);
    assert.match(WATER_FRAGMENT, /uniform sampler2D uHeights;/);
    assert.match(WATER_FRAGMENT, /surfaceDepth/);
    assert.match(WATER_FRAGMENT, /surface - world\.y/, "profundidad = eta - y desde la textura");
    assert.doesNotMatch(WATER_FRAGMENT, /PROBE_COUNT|REFINE_COUNT|coverageAbove|PROBE_GROWTH/, "sin sondas de profundidad ni bisección");
    assert.match(WATER_FRAGMENT, /lightSum/);
    assert.match(WATER_FRAGMENT, /lightSpecular/);
    assert.doesNotMatch(WATER_FRAGMENT, /gaussian|blur/i);
    installFakePixi();
    const filter = createWaterFilter({ look: lookOf(WATER), color: [40, 120, 255], acidColor: MATERIALS.acid.tint, lineColor: [170, 220, 255], lineWidth: 2, ...heightsOptions(4) });
    assert.equal(filter.options.blendRequired, true);
});

test("cada capa crea su filtro una vez y actualizar el tiempo y la cámara no crea objetos", () => {
    const PIXI = installFakePixi();
    const parent = new PIXI.Container();
    const renderer = { generateTexture: (graphics) => ({ source: {}, graphics }) };
    const layers = new FluidLayers({
        renderer,
        parent,
        createFilter: (kind) => createLiquidFilter(lookOf(kind)),
        updateFilter: updateLiquidFilter,
        pixelsPerMeter: 32,
    });
    const filtersAtStart = PIXI.Filter.constructed;
    layers.begin();
    layers.acquire(WATER, 0.05, false);
    layers.acquire(LAVA, 0.05, false);
    layers.acquire(STEAM, 0.05, true);
    layers.end();
    assert.equal(PIXI.Filter.constructed - filtersAtStart, 2, "un filtro por capa con filtro; el vapor no tiene");
    const constructedBefore = PIXI.Filter.constructed;
    const originBuffer = [...layers.layers.values()][0].filter.resources[LIQUID_UNIFORM_GROUP].uniforms.uOrigin;
    layers.setFrame(FRAME);
    layers.setFrame({ ...FRAME, time: 2 });
    layers.begin();
    layers.acquire(WATER, 0.05, false);
    layers.end();
    assert.equal(PIXI.Filter.constructed, constructedBefore, "no se crean filtros por frame");
    const { uniforms } = [...layers.layers.values()][0].filter.resources[LIQUID_UNIFORM_GROUP];
    assert.equal(uniforms.uTime, 2);
    assert.equal(uniforms.uPixelsPerMeter, FRAME.pixelsPerMeter);
    assert.strictEqual(uniforms.uOrigin, originBuffer, "mismo buffer");
    assert.deepEqual([uniforms.uOrigin[0], uniforms.uOrigin[1]], [FRAME.originX, FRAME.originY]);
});

test("WaterView arma su filtro una vez y no crea degradados ni objetos por frame", () => {
    const PIXI = installFakePixi();
    const water = new ShallowWater();
    const view = new WaterView({ parent: new PIXI.Container(), pixelsPerMeter: 32, look: lookOf(WATER), draw: WATER_FIELD.draw, water });
    assert.deepEqual(view.graphics.filters, [view.filter]);
    assert.equal(view.filter.options.blendRequired, true);
    const lightSet = createLightSet();
    const gradientsBefore = PIXI.FillGradient.constructed;
    const filtersBefore = PIXI.Filter.constructed;
    const graphicsBefore = PIXI.Graphics.constructed;
    const heightSourcesBefore = PIXI.BufferImageSource.constructed;
    const { source, data } = view.heights;
    for (let frame = 0; frame < 3; frame++) {
        view.setFrame({ ...FRAME, time: frame });
        view.setLights(lightSet);
        view.draw(water);
    }
    assert.equal(PIXI.FillGradient.constructed, gradientsBefore);
    assert.equal(PIXI.Filter.constructed, filtersBefore);
    assert.equal(PIXI.Graphics.constructed, graphicsBefore);
    assert.equal(PIXI.BufferImageSource.constructed, heightSourcesBefore, "la textura de alturas no se recrea");
    assert.strictEqual(view.heights.source, source);
    assert.strictEqual(view.heights.data, data, "se actualiza en el lugar");
    assert.equal(source.updates, 3, "una actualización por frame");
    assert.strictEqual(view.filter.options.resources.uHeights, source);
    assert.equal(view.filter.resources[LIQUID_UNIFORM_GROUP].uniforms.uTime, 2);
});

test("la textura de alturas lleva la superficie y la marca de columna mojada de cada columna", () => {
    const PIXI = installFakePixi();
    const water = new ShallowWater();
    const heights = createWaterHeights(water.N);
    assert.equal(heights.data.length, water.N * HEIGHT_CHANNELS);
    assert.deepEqual([heights.source.options.width, heights.source.options.height], [water.N, 1]);
    assert.equal(PIXI.BufferImageSource.constructed > 0, true);
    writeSurfaceHeights(water, heights.data);
    let wetColumns = 0;
    for (let column = 0; column < water.N; column++) {
        const wet = column >= water.i0 && column < water.i1 && water.h[column] > water.config.hDry;
        const decoded = decodeSurfaceHeight(heights.data, column * HEIGHT_CHANNELS);
        assert.equal(decoded.wet, wet, `marca de la columna ${column}`);
        assert.ok(Math.abs(decoded.eta - (water.b[column] + water.h[column])) <= HEIGHT_STEP_M / 2 + 1e-9, `eta de la columna ${column}`);
        if (wet) wetColumns++;
    }
    assert.ok(wetColumns > 0, "el campo inicial tiene agua");
});

test("el código del agua guarda la fracción de ácido solo en el canal rojo", () => {
    assert.equal(encodeWater(0), 0);
    assert.equal(encodeWater(1), 0xff0000);
    assert.equal(encodeWater(0.5), 0x800000);
    installFakePixi();
    const filter = createWaterFilter({ look: lookOf(WATER), color: [0, 0, 0], acidColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 2, ...heightsOptions(4) });
    const lightSet = createLightSet();
    lightSet.count = 3;
    setWaterFilterLights(filter, lightSet);
    assert.equal(filter.resources[LIQUID_UNIFORM_GROUP].uniforms.uLightCount, 3);
});
