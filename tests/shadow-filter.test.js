/**
 * Filtro de sombras proyectadas (#349, docs/design/13-arte.md §13.3): una sola instancia por capa, con `padding`, la
 * calidad de `RENDER_QUALITY`, sin funciones de GLSL prohibidas ni desenfoque gaussiano y actualizado sin crear objetos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { RENDER_QUALITY } = await import("../src/render/renderQuality.js");
const { createLightSet } = await import("../src/render/lighting.js");
const { SHADOW, SHADOW_FRAGMENT, createShadowFilter, setShadowFilterLights, shadowPadding, updateShadowFilter } = await import("../src/render/shadowFilter.js");
const { Scene } = await import("../src/render/scene.js");

const SCREEN_SCALE = 40;
const CAMERA = { originX: 100, originY: 200, pixelsPerMeter: SCREEN_SCALE };
const LIGHT_COUNT = 2;
const REPEATED_UPDATES = 1000;
const EXPECTED_SHADOW = { distance: 0.35, alpha: 0.45, softRadius: 0.06 };

function createScene(pixi) {
    return new Scene({ stage: new pixi.Container(), renderer: {} });
}

test("el filtro de sombra usa padding, la calidad de RENDER_QUALITY y los valores pedidos", () => {
    const pixi = installFakePixi();
    const filter = createShadowFilter();
    assert.ok(filter.options.padding > 0, "padding para dibujar fuera de la silueta");
    assert.equal(filter.options.antialias, RENDER_QUALITY.filterAntialias);
    assert.equal(filter.options.antialias, "inherit");
    assert.equal(filter.options.resolution, RENDER_QUALITY.filterResolution);
    assert.equal(SHADOW.distance, EXPECTED_SHADOW.distance);
    assert.equal(SHADOW.alpha, EXPECTED_SHADOW.alpha);
    assert.equal(SHADOW.softRadius, EXPECTED_SHADOW.softRadius);
    assert.equal(pixi.Filter.constructed > 0, true);
});

test("el fragment no usa funciones prohibidas ni desenfoque gaussiano, y todos sus uniforms son highp", () => {
    for (const forbidden of ["texelFetch", "textureSize", "gaussian", "blur"]) {
        assert.ok(!SHADOW_FRAGMENT.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
    }
    for (const declaration of SHADOW_FRAGMENT.match(/^uniform (?!sampler2D).*$/gm)) assert.match(declaration, /^uniform highp /, declaration);
    assert.ok(SHADOW_FRAGMENT.includes("precision highp float;"));
    assert.ok(SHADOW_FRAGMENT.includes("shadowDirection") && SHADOW_FRAGMENT.includes("lightFalloff("));
});

test("la sombra está en la capa del nivel y en la de los robots, después del filtro de material", () => {
    const pixi = installFakePixi();
    const scene = createScene(pixi);
    assert.deepEqual(scene.levelLayer.filters, [scene.levelShadowFilter]);
    const robotMaterial = new pixi.Filter({});
    scene.ragdollLayer.filters = [robotMaterial, scene.ragdollShadowFilter];
    assert.equal(scene.ragdollLayer.filters.at(-1), scene.ragdollShadowFilter, "el material de los robots va antes");
    assert.notEqual(scene.levelShadowFilter, scene.ragdollShadowFilter);
    assert.ok(readFileSync(new URL("../index.js", import.meta.url), "utf8").includes("[robotFilter, scene.ragdollShadowFilter]"), "index.js arma el orden");
});

test("la actualización de cámara, padding y luces no crea filtros ni buffers", () => {
    const pixi = installFakePixi();
    const scene = createScene(pixi);
    const created = pixi.Filter.constructed;
    const { uniforms } = scene.levelShadowFilter.resources.shadowUniforms;
    const originBuffer = uniforms.uOrigin;
    const lightBuffer = uniforms.uLights;
    const lightSet = createLightSet();
    lightSet.count = LIGHT_COUNT;
    for (let update = 0; update < REPEATED_UPDATES; update++) scene.setShadowLights(CAMERA, lightSet);
    assert.equal(pixi.Filter.constructed, created);
    assert.equal(uniforms.uOrigin, originBuffer);
    assert.equal(uniforms.uLights, lightBuffer);
    assert.equal(uniforms.uLightCount, LIGHT_COUNT);
    assert.deepEqual([originBuffer[0], originBuffer[1], uniforms.uPixelsPerMeter], [CAMERA.originX, CAMERA.originY, SCREEN_SCALE]);
    assert.equal(scene.ragdollShadowFilter.padding, shadowPadding(SCREEN_SCALE));
    assert.equal(shadowPadding(SCREEN_SCALE), Math.ceil((SHADOW.distance + SHADOW.softRadius) * SCREEN_SCALE));
});

test("las funciones sueltas de actualización escriben en el mismo filtro", () => {
    const pixi = installFakePixi();
    const filter = createShadowFilter();
    updateShadowFilter(filter, CAMERA);
    setShadowFilterLights(filter, createLightSet());
    assert.equal(filter.resources.shadowUniforms.uniforms.uLightCount, 0);
    assert.ok(pixi.Filter.constructed >= 1);
});