/**
 * Filtro de los robots (#351, docs/design/13-arte.md §13.4): shader de metal pintado con bisel, juntas y luz, creado una vez
 * y actualizado sin crear objetos, y contorno de las piezas con el color de junta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { LIGHT_FUNCTIONS, LIGHT_MAP_FUNCTIONS, createLightSet } = await import("../src/render/lighting.js");
const { BEVEL_FUNCTIONS } = await import("../src/render/bevelFunctions.js");
const { ROBOT_FRAGMENT, ROBOT_JOINT_COLOR, createRobotFilter, setRobotFilterLights, updateRobotFilter } = await import("../src/render/robotFilter.js");
const { RagdollShapes } = await import("../src/ragdoll/RagdollShapes.js");

const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;
const FIRST_CAMERA = { originX: 10, originY: 20, pixelsPerMeter: SCREEN_SCALE };
const SECOND_CAMERA = { originX: 100, originY: 200, pixelsPerMeter: SCREEN_SCALE * 2 };
const LIGHT_COUNT = 3;
const REPEATED_UPDATES = 1000;
const BOX_HALF_SIZE = 0.5;

test("el fragment tiene bisel, junta, pintura gastada, suma de luces y especular, y no usa funciones de GLSL 3.00", () => {
    for (const name of ["coverageSlope", "jointSlope", "jointAt", "outerEdgeAmount", "STEEL_BASE", "mappedLight(", "lightRelief(", "specular", "LIGHT_FLOOR"]) {
        assert.ok(ROBOT_FRAGMENT.includes(name), name);
    }
    assert.ok(ROBOT_FRAGMENT.includes(LIGHT_FUNCTIONS));
    assert.ok(ROBOT_FRAGMENT.includes(BEVEL_FUNCTIONS));
    for (const forbidden of ["texelFetch", "textureSize"]) assert.ok(!ROBOT_FRAGMENT.includes(forbidden), forbidden);
    for (const declaration of ROBOT_FRAGMENT.match(/^uniform (?!sampler2D).*$/gm)) assert.match(declaration, /^uniform highp /, declaration);
    assert.ok(ROBOT_FRAGMENT.includes("uInputSize") && ROBOT_FRAGMENT.includes("uOutputFrame"));
});

test("el mapa de luz de los robots suma sin dividir por la luz de una cara plana", () => {
    assert.ok(ROBOT_FRAGMENT.includes("baseLight(normal) / baseLight(flatNormal)"));
    assert.ok(ROBOT_FRAGMENT.includes("baseRelief + mappedLight(screen) * lightRelief("));
    assert.ok(!/mappedLight\([^)]*\)\s*\/\s*flat/.test(ROBOT_FRAGMENT), "el mapa de luz no se normaliza");
    assert.ok(ROBOT_FRAGMENT.includes(LIGHT_MAP_FUNCTIONS));
});
test("el filtro se crea una vez y la cámara y las luces se actualizan sin reconstruirlo ni crear buffers", () => {
    const pixi = installFakePixi();
    const layer = new pixi.Container();
    const filter = createRobotFilter();
    layer.filters = [filter];
    const created = pixi.Filter.constructed;
    const { uniforms } = filter.resources.robotUniforms;
    const originBuffer = uniforms.uOrigin;
    const lightBuffer = uniforms.uLights;
    const lightSet = createLightSet();
    lightSet.count = LIGHT_COUNT;
    updateRobotFilter(filter, FIRST_CAMERA);
    assert.deepEqual([originBuffer[0], originBuffer[1], uniforms.uPixelsPerMeter], [FIRST_CAMERA.originX, FIRST_CAMERA.originY, SCREEN_SCALE]);
    for (let update = 0; update < REPEATED_UPDATES; update++) {
        updateRobotFilter(filter, SECOND_CAMERA);
        setRobotFilterLights(filter, lightSet);
    }
    assert.deepEqual([originBuffer[0], originBuffer[1], uniforms.uPixelsPerMeter], [SECOND_CAMERA.originX, SECOND_CAMERA.originY, SECOND_CAMERA.pixelsPerMeter]);
    assert.equal(uniforms.uLightCount, LIGHT_COUNT);
    assert.equal(uniforms.uOrigin, originBuffer, "mismo buffer de origen");
    assert.equal(uniforms.uLights, lightBuffer, "mismo buffer de luces");
    assert.equal(pixi.Filter.constructed, created, "ningún filtro nuevo");
    assert.deepEqual(layer.filters, [filter]);
});

test("el contorno de las piezas se traza con el color de junta que reconoce el filtro", () => {
    installFakePixi();
    const item = { type: "box", body: null, bodyId: "b_1", centerX: 0, centerY: 0, angle: 0, halfWidth: BOX_HALF_SIZE, halfHeight: BOX_HALF_SIZE };
    const shapes = new RagdollShapes({ view: new PIXI.Container(), items: [item], pixelsPerMeter: PIXELS_PER_METER });
    shapes.followZoom(SCREEN_SCALE);
    assert.equal(ROBOT_JOINT_COLOR, 0x000000);
    assert.equal(shapes.parts[0].outline.strokes[0].color, ROBOT_JOINT_COLOR);
});
