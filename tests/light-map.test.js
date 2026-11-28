/**
 * Mapa de luz con sombras de los robots (#349, docs/design/13-arte.md §13.3): el mapa de oclusión y el de luz se crean una
 * vez y se reutilizan, el shader marcha 16 pasos con cota constante, y los filtros del fondo, las plataformas, los robots
 * y el agua leen el mapa. Ya no hay filtro de sombras por objeto.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { LIGHT_MAP, sharedLightMap } = await import("../src/render/lightMap.js");
const { LIGHT_MAP_FRAGMENT, createLightMapFilter } = await import("../src/render/lightMapFilter.js");
const { LIGHT_MAP_FUNCTIONS, createLightSet } = await import("../src/render/lighting.js");
const { RENDER_QUALITY } = await import("../src/render/renderQuality.js");
const { Scene } = await import("../src/render/scene.js");
const { SURFACE_FRAGMENT, createSurfaceFilter } = await import("../src/render/surfaceFilter.js");
const { ROBOT_FRAGMENT, createRobotFilter } = await import("../src/render/robotFilter.js");
const { LIGHT_FILTER_FRAGMENT, createLightFilter } = await import("../src/render/lightFilter.js");
const { WATER_FRAGMENT, createWaterFilter, createWaterHeights } = await import("../src/render/waterFilter.js");

const WIDTH = 800;
const HEIGHT = 600;
const CAMERA = { originX: 400, originY: 300, pixelsPerMeter: 40 };
const REPEATED_FRAMES = 1000;
const MARCH_STEPS = 16;
const NEAR_PIXEL_IGNORE = 0.15;
const WATER_COLUMNS = { x0: 0, dx: 1, count: 4 };
const WATER_OPTIONS = { look: { refraction: 1, fresnel: 1 }, color: [0, 0, 0], acidColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 2, columns: WATER_COLUMNS };

function createScene(pixi, size = { width: WIDTH, height: HEIGHT }) {
    const application = { stage: new pixi.Container(), renderer: { screen: size, renders: [], render(options) { this.renders.push(options); } } };
    return { scene: new Scene(application), application };
}

test("el filtro de sombras por objeto ya no existe", () => {
    assert.equal(existsSync(new URL("../src/render/shadowFilter.js", import.meta.url)), false);
    const pixi = installFakePixi();
    const { scene } = createScene(pixi);
    assert.equal(scene.setShadowLights, undefined);
    assert.equal(scene.levelLayer.filters, null);
});

test("el fragment del mapa de luz marcha 16 pasos con cota constante y omite 0,15 m junto al píxel y el radio de la fuente", () => {
    assert.equal(LIGHT_MAP.marchSteps, MARCH_STEPS);
    assert.equal(LIGHT_MAP.nearPixelIgnore, NEAR_PIXEL_IGNORE);
    assert.equal(LIGHT_MAP.shadowedLights, 2);
    assert.ok(LIGHT_MAP_FRAGMENT.includes(`marchStep < ${MARCH_STEPS}`), "cota constante");
    assert.ok(LIGHT_MAP_FRAGMENT.includes("const float NEAR_PIXEL_IGNORE = 0.1500;"));
    assert.ok(LIGHT_MAP_FRAGMENT.includes("reach - along < sourceRadius"), "omite el radio de la fuente");
    assert.ok(LIGHT_MAP_FRAGMENT.includes("tint.a > 0.0"), "solo las luces con radio de fuente tienen sombra");
    for (const forbidden of ["texelFetch", "textureSize", "gaussian", "blur"]) assert.ok(!LIGHT_MAP_FRAGMENT.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
    assert.ok(LIGHT_MAP_FRAGMENT.includes("precision highp float;"));
    for (const declaration of LIGHT_MAP_FRAGMENT.match(/^uniform (?!sampler2D).*$/gm)) assert.match(declaration, /^uniform highp /, declaration);
    const bounds = [...LIGHT_MAP_FRAGMENT.matchAll(/for \(int \w+ = 0; \w+ < (\w+);/g)].map((match) => match[1]);
    assert.equal(bounds.length, 2, "la marcha y el recorrido de luces");
    for (const bound of bounds) assert.match(bound, /^(MAX_LIGHTS|\d+)$/, "cota constante");
});

test("el mapa de luz toma la posición de pantalla del píxel en la textura de destino, no de vTextureCoord", () => {
    for (const declaration of ["uInputSize", "uOutputFrame", "uOutputTexture"]) assert.ok(LIGHT_MAP_FRAGMENT.includes(`uniform highp vec4 ${declaration};`), declaration);
    assert.ok(LIGHT_MAP_FRAGMENT.includes("vec2 screen = (vTextureCoord * uInputSize.xy + uOutputFrame.xy) / uOutputTexture.xy * uScreenSize;"));
    assert.ok(!LIGHT_MAP_FRAGMENT.includes("vTextureCoord * uScreenSize"));
});

test("el filtro del mapa de luz se dibuja a la resolución del destino y con el antialias de RENDER_QUALITY", () => {
    installFakePixi();
    const filter = createLightMapFilter();
    assert.equal(filter.options.resolution, "inherit");
    assert.equal(filter.options.antialias, RENDER_QUALITY.filterAntialias);
    assert.equal(filter.options.resources.uOcclusion, sharedLightMap().occlusion.source);
});

test("las dos texturas se crean una vez, a media resolución, y se reutilizan en cada frame", () => {
    const pixi = installFakePixi();
    const { scene, application } = createScene(pixi);
    const maps = sharedLightMap();
    const created = [pixi.RenderTexture.constructed, pixi.Filter.constructed, pixi.Sprite.constructed];
    const lightSet = createLightSet();
    for (let frame = 0; frame < REPEATED_FRAMES; frame++) scene.renderLightMap(CAMERA, lightSet);
    assert.equal(sharedLightMap(), maps);
    assert.deepEqual([pixi.RenderTexture.constructed, pixi.Filter.constructed, pixi.Sprite.constructed], created);
    assert.equal(maps.occlusion.resizes, 1, "solo el primer frame ajusta el tamaño");
    assert.equal(maps.light.resizes, 1);
    assert.equal(maps.occlusion.resolution, LIGHT_MAP.resolution);
    assert.deepEqual([...maps.screenSize], [WIDTH, HEIGHT]);
    assert.equal(application.renderer.renders.length, REPEATED_FRAMES * 2, "un dibujo de oclusión y uno de luz por frame");
    scene.renderLightMap(CAMERA, lightSet);
    application.renderer.screen = { width: WIDTH / 2, height: HEIGHT / 2 };
    scene.renderLightMap(CAMERA, lightSet);
    assert.equal(maps.occlusion.resizes, 2, "se redimensiona solo al cambiar el tamaño");
    assert.deepEqual([...maps.screenSize], [WIDTH / 2, HEIGHT / 2]);
});

test("solo el nivel tapa la luz: el mapa de oclusión se dibuja con el nivel y sin sus filtros de material", () => {
    const pixi = installFakePixi();
    const { scene, application } = createScene(pixi);
    const materialFilter = new pixi.Filter({});
    scene.addOccluderFilters(materialFilter);
    const enabledDuringRender = [];
    application.renderer.render = function render(options) {
        this.renders.push(options);
        enabledDuringRender.push(materialFilter.enabled);
    };
    scene.renderLightMap(CAMERA, createLightSet());
    const [occlusionRender, lightRender] = application.renderer.renders;
    assert.equal(occlusionRender.container, scene.levelLayer);
    assert.notEqual(occlusionRender.container, scene.ragdollLayer, "los robots no tapan la luz");
    assert.equal(occlusionRender.target, sharedLightMap().occlusion);
    assert.equal(occlusionRender.clear, true);
    assert.ok(occlusionRender.transform, "con la transformación de world");
    assert.equal(lightRender.target, sharedLightMap().light);
    assert.deepEqual(enabledDuringRender, [false, true]);
    assert.equal(materialFilter.enabled, true, "el filtro vuelve a estar activo");
    for (const layer of [scene.effectsLayer, scene.fluidParent, scene.waterLayer]) {
        assert.ok(!application.renderer.renders.some((options) => options.container === layer), "los líquidos no están en el mapa de oclusión");
    }
});

test("los filtros del fondo, las plataformas, los robots y el agua leen el mapa de luz compartido", () => {
    installFakePixi();
    const source = sharedLightMap().light.source;
    const filters = [
        createSurfaceFilter(),
        createRobotFilter(),
        createLightFilter({ pointLight: 1, keyLight: 0, fog: 0 }),
        createWaterFilter({ ...WATER_OPTIONS, heights: createWaterHeights(WATER_COLUMNS.count).source }),
    ];
    for (const filter of filters) assert.equal(filter.options.resources.uLightMap, source);
    for (const fragment of [SURFACE_FRAGMENT, ROBOT_FRAGMENT, LIGHT_FILTER_FRAGMENT, WATER_FRAGMENT]) {
        assert.ok(fragment.includes(LIGHT_MAP_FUNCTIONS));
        assert.ok(fragment.includes("mappedLight(screen)"));
        assert.ok(!fragment.includes("lightSum"));
    }
    const sizes = filters.map((filter) => Object.values(filter.resources).find((group) => group.uniforms.uScreenSize).uniforms.uScreenSize);
    for (const size of sizes) assert.equal(size, sharedLightMap().screenSize, "un solo arreglo de tamaño de pantalla compartido");
});

test("el relieve modula el mapa con 0,55 + 0,45 por N·L", () => {
    assert.ok(LIGHT_MAP_FUNCTIONS.includes("const float RELIEF_FLOOR = 0.55;"));
    assert.ok(LIGHT_MAP_FUNCTIONS.includes("const float RELIEF_GAIN = 0.45;"));
    assert.ok(LIGHT_MAP_FUNCTIONS.includes("RELIEF_FLOOR + RELIEF_GAIN * max(0.0, dot(normal, normalize(toStrongest)))"));
});
