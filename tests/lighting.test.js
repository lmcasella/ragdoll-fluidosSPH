/**
 * Luz dinámica (#349, docs/design/13-arte.md §13.3): agrupado de las partículas en luces, shaders de relieve y luz, y
 * vistas que reciben las luces sin redibujar ni reconstruir filtros.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

const {
    LIGHTING,
    LIGHT_FUNCTIONS,
    LIGHT_MAP_FUNCTIONS,
    LIGHT_STRIDE,
    MAX_LIGHTS,
    addRobotLight,
    applyLights,
    buildKindSources,
    createLightSet,
    gatherLights,
} = await import("../src/render/lighting.js");
const { SURFACE_FRAGMENT } = await import("../src/render/surfaceFilter.js");
const { LIGHT_FILTER_FRAGMENT, createLightFilter, updateLightFilter } = await import("../src/render/lightFilter.js");
const { LevelView } = await import("../src/render/levelView.js");
const { BackgroundView } = await import("../src/render/backgroundView.js");

const KINDS = { lava: 2, acid: 1 };
const WATER_KIND = 4;
const SOURCES = buildKindSources(KINDS);
const VIEW = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
const FAR_OUT_OF_VIEW = 100;
const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;
const REPEATED_CALLS = 1000;
const ZONE_SIDE = 2;
const TOLERANCE = 1e-5;

function cluster(count, centerX, centerY, kind) {
    const positions = new Float32Array(count * 2);
    const kinds = new Uint8Array(count).fill(kind);
    for (let index = 0; index < count; index++) {
        positions[index * 2] = centerX + (index % 2 === 0 ? -0.1 : 0.1);
        positions[index * 2 + 1] = centerY + (index % 4 < 2 ? -0.1 : 0.1);
    }
    return { positions, kinds };
}

function gather({ positions, kinds }, output = createLightSet(), view = VIEW) {
    return gatherLights({
        positions,
        firstValue: 0,
        count: kinds.length,
        materialAt: (index) => kinds[index],
        sourceOfKind: SOURCES,
        view,
        output,
    });
}

test("gatherLights: menos de 6 partículas no dan luz y 40 de lava dan la intensidad completa en su centroide", () => {
    assert.equal(gather(cluster(LIGHTING.minParticles - 1, 1, 1, KINDS.lava)).count, 0);
    const lights = gather(cluster(LIGHTING.fullIntensityParticles, 1, 1, KINDS.lava));
    assert.equal(lights.count, 1);
    const [x, y, range, intensity, red, green, blue] = lights.data;
    assert.ok(Math.abs(x - 1) < TOLERANCE && Math.abs(y - 1) < TOLERANCE);
    assert.equal(range, LIGHTING.sources.lava.range);
    assert.ok(Math.abs(intensity - LIGHTING.sources.lava.intensity) < TOLERANCE);
    assert.deepEqual([red, green, blue].map((value) => Math.round(value * 100)), LIGHTING.sources.lava.color.map((value) => Math.round(value * 100)));
});

test("gatherLights: la intensidad crece con la cantidad y los materiales sin luz no cuentan", () => {
    const half = gather(cluster(LIGHTING.fullIntensityParticles / 2, 1, 1, KINDS.acid));
    assert.ok(Math.abs(half.data[3] - LIGHTING.sources.acid.intensity / 2) < TOLERANCE);
    assert.equal(gather(cluster(LIGHTING.fullIntensityParticles, 1, 1, WATER_KIND)).count, 0);
});

test("gatherLights: tope de 8 con las más fuertes, de mayor a menor", () => {
    const zones = MAX_LIGHTS + 4;
    const kinds = [];
    const positions = [];
    for (let zone = 0; zone < zones; zone++) {
        const particles = LIGHTING.minParticles + zone;
        for (let index = 0; index < particles; index++) {
            positions.push(zone * ZONE_SIDE * 2 - 20 + 0.5, 0.5);
            kinds.push(KINDS.acid);
        }
    }
    const wide = { minX: -50, maxX: 50, minY: -10, maxY: 10 };
    const lights = gather({ positions: Float32Array.from(positions), kinds: Uint8Array.from(kinds) }, createLightSet(), wide);
    assert.equal(lights.count, MAX_LIGHTS);
    const intensities = Array.from({ length: MAX_LIGHTS }, (_, slot) => lights.data[slot * LIGHT_STRIDE + 3]);
    assert.deepEqual([...intensities].sort((a, b) => b - a), intensities);
    const weakestKept = LIGHTING.sources.acid.intensity * (LIGHTING.minParticles + zones - MAX_LIGHTS) / LIGHTING.fullIntensityParticles;
    assert.ok(Math.abs(intensities[MAX_LIGHTS - 1] - weakestKept) < TOLERANCE, "se descartaron las más débiles");
});

test("gatherLights: lo que está a más de un alcance de la vista se descarta", () => {
    assert.equal(gather(cluster(LIGHTING.fullIntensityParticles, FAR_OUT_OF_VIEW, 1, KINDS.lava)).count, 0);
    const justOutside = VIEW.maxX + LIGHTING.sources.lava.range - 1;
    assert.equal(gather(cluster(LIGHTING.fullIntensityParticles, justOutside, 1, KINDS.lava)).count, 1);
});

test("buildKindSources no toma la fila de los robots, que no es un material", () => {
    assert.equal(SOURCES[KINDS.lava], LIGHTING.sources.lava);
    assert.equal(Object.keys(SOURCES).length, Object.keys(KINDS).length);
});

test("addRobotLight: color del jugador, intensidad, alcance y radio de la tabla; solo la luz de robot lleva radio de fuente", () => {
    const output = gather(cluster(LIGHTING.fullIntensityParticles, 1, 1, KINDS.lava));
    const playerColor = [0.2, 0.4, 0.6];
    addRobotLight(output, 3, 4, playerColor);
    assert.equal(output.count, 2);
    const SOURCE_RADIUS_OFFSET = 7;
    const robotSlot = 1 * LIGHT_STRIDE;
    const robot = Array.from(output.data.slice(robotSlot, robotSlot + LIGHT_STRIDE));
    const { range, intensity, sourceRadius } = LIGHTING.sources.robot;
    assert.deepEqual(robot.slice(0, 4).map((value) => Math.round(value * 100)), [3, 4, range, intensity].map((value) => Math.round(value * 100)));
    assert.deepEqual(robot.slice(4, 7).map((value) => Math.round(value * 100)), playerColor.map((value) => Math.round(value * 100)));
    assert.ok(Math.abs(robot[SOURCE_RADIUS_OFFSET] - sourceRadius) < TOLERANCE);
    assert.ok(sourceRadius > 0 && LIGHTING.sources.lava.sourceRadius === undefined && LIGHTING.sources.acid.sourceRadius === undefined);
    assert.equal(output.data[SOURCE_RADIUS_OFFSET], 0, "la lava no proyecta sombras");
});

test("addRobotLight entra en el orden por intensidad, respeta el tope y no crea buffers", () => {
    const output = createLightSet();
    const { data } = output;
    for (let call = 0; call < MAX_LIGHTS + 3; call++) addRobotLight(output, call, 0, [1, 1, 1]);
    assert.equal(output.count, MAX_LIGHTS);
    assert.equal(output.data, data);
});

test("gatherLights: devuelve el mismo buffer tras 1000 llamadas", () => {
    const output = createLightSet();
    const { data } = output;
    const particles = cluster(LIGHTING.fullIntensityParticles, 1, 1, KINDS.lava);
    for (let call = 0; call < REPEATED_CALLS; call++) assert.equal(gather(particles, output), output);
    assert.equal(output.data, data);
    assert.equal(output.count, 1);
});

test("el fragment de materiales tiene altura, normal, bisel y suma de luces, todo con precisión alta", () => {
    for (const name of ["surfaceHeight", "surfaceNormal", "bevelSlope", "mappedLight(screen)", "lightRelief(", "uBaseDirection", "specular"]) {
        assert.ok(SURFACE_FRAGMENT.includes(name), name);
    }
    assert.ok(SURFACE_FRAGMENT.includes(LIGHT_FUNCTIONS));
    assert.ok(SURFACE_FRAGMENT.includes(LIGHT_MAP_FUNCTIONS));
    assert.ok(!SURFACE_FRAGMENT.includes("lightSum"), "ya no suma las luces una por una");
    for (const fragment of [SURFACE_FRAGMENT, LIGHT_FILTER_FRAGMENT]) {
        for (const declaration of fragment.match(/^uniform (?!sampler2D).*$/gm)) assert.match(declaration, /^uniform highp /, declaration);
    }
    assert.ok(LIGHT_FILTER_FRAGMENT.includes(LIGHT_FUNCTIONS));
    assert.ok(LIGHT_FILTER_FRAGMENT.includes(LIGHT_MAP_FUNCTIONS) && LIGHT_FILTER_FRAGMENT.includes("mappedLight(screen)"));
    assert.ok(!/surfaceNormal/.test(LIGHT_FILTER_FRAGMENT), "el fondo no usa normales");
});

test("los uniforms de luz son un arreglo de vec4 y los filtros no se reconstruyen al cambiar las luces", () => {
    const pixi = installFakePixi();
    const view = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const { uniforms } = view.surfaceFilter.resources.surfaceUniforms;
    assert.equal(view.surfaceFilter.options.resources.surfaceUniforms.uLights.type, "vec4<f32>");
    assert.equal(view.surfaceFilter.options.resources.surfaceUniforms.uLights.size, MAX_LIGHTS * 2);
    const created = pixi.Filter.constructed;
    const lights = gather(cluster(LIGHTING.fullIntensityParticles, 1, 1, KINDS.lava));
    const buffer = uniforms.uLights;
    view.setLights(lights);
    assert.equal(uniforms.uLights, buffer);
    assert.equal(uniforms.uLightCount, 1);
    assert.ok(Math.abs(buffer[3] - LIGHTING.sources.lava.intensity) < TOLERANCE);
    assert.equal(pixi.Filter.constructed, created);

    const standalone = createLightFilter({ scale: 1 });
    applyLights(standalone.resources.lightUniforms.uniforms, lights);
    updateLightFilter(standalone, { viewHeight: 2 });
    assert.equal(standalone.resources.lightUniforms.uniforms.uViewHeight, 2);
});

test("LevelView y BackgroundView reciben las luces sin redibujar sus Graphics", () => {
    const pixi = installFakePixi();
    const level = new LevelView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const background = new BackgroundView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const levelData = { solids: [{ x: 5, y: 1, w: 4, h: 1, kind: "floor" }] };
    const camera = { x: 0, y: 0, zoom: 1, viewWidth: 800, viewHeight: 600 };
    level.update(levelData, 0, 0, SCREEN_SCALE, null, { x: 0, y: 0 });
    background.update(camera);
    const builds = [level.fixedBuilds, background.segmentBuilds];
    const created = pixi.Filter.constructed;
    const lights = gather(cluster(LIGHTING.fullIntensityParticles, 1, 1, KINDS.lava));
    level.setLights(lights);
    background.setLights(lights, { originX: 400, originY: 300, pixelsPerMeter: SCREEN_SCALE });
    level.update(levelData, 0, 0, SCREEN_SCALE, null, { x: 0, y: 0 });
    background.update(camera);
    assert.deepEqual([level.fixedBuilds, background.segmentBuilds], builds);
    assert.equal(pixi.Filter.constructed, created);
    const lit = background.layers.filter((layer) => layer.container.filters?.length === 1);
    assert.equal(lit.length, LIGHTING.backgroundLayers.length, "todas las capas llevan filtro de luz y niebla");
    assert.deepEqual(lit, background.layers.slice(-LIGHTING.backgroundLayers.length));
    assert.equal(lit[0].container.filters[0].resources.lightUniforms.uniforms.uLightCount, 1);
});

test("el fondo suma la luz clave en degradé vertical y la niebla crece con la lejanía, sin tocar el dibujo", () => {
    const pixi = installFakePixi();
    const background = new BackgroundView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const fogs = background.lightFilters.map((filter) => filter.resources.lightUniforms.uniforms.uFog);
    assert.deepEqual(fogs, LIGHTING.backgroundLayers.map((look) => look.fog));
    assert.ok(fogs.every((fog, nearness) => nearness === 0 || fog >= fogs[nearness - 1]), "más niebla cuanto más lejos");
    assert.ok(LIGHT_FILTER_FRAGMENT.includes("uKeyColor") && LIGHT_FILTER_FRAGMENT.includes("uFogColor"));
    assert.ok(LIGHT_FILTER_FRAGMENT.includes("screen.y / uViewHeight"), "degradé por la altura de pantalla");
    updateLightFilter(background.lightFilters[0], { originX: 0, originY: 0, pixelsPerMeter: 1, viewHeight: 600 });
    assert.equal(background.lightFilters[0].resources.lightUniforms.uniforms.uViewHeight, 600);
});