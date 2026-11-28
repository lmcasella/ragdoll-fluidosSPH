/**
 * Filtro de los robots (#351, docs/design/13-arte.md §13.4): shader de metal pintado con bisel, juntas y luz, creado una vez
 * y actualizado sin crear objetos, y contorno de las piezas con el color de junta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { LIGHT_FUNCTIONS, LIGHT_MAP_FUNCTIONS, createLightSet } = await import("../src/render/lighting.js");
const { BEVEL_FUNCTIONS } = await import("../src/render/bevelFunctions.js");
const { ROBOT_FRAGMENT, ROBOT_JOINT_COLOR, ROBOT_METAL_COLOR, ROBOT_VISOR_SLOTS, ROBOT_VISOR_SLOT_STEP, createRobotFilter, robotVisorCode, setRobotFilterLights, updateRobotFilter } = await import("../src/render/robotFilter.js");
const { RagdollShapes } = await import("../src/ragdoll/RagdollShapes.js");
const { ROBOT_DETAIL, visorWorldPoint } = await import("../src/ragdoll/robotDetail.js");
const { readFileSync } = await import("node:fs");

const ROBOT_JSON = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));

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

test("el fragment reconoce el código de metal pelado y el del visor emisivo, y el filtro lleva los colores de los visores", () => {
    for (const name of ["metalAmount", "visorAt", "visorHalo", "METAL_BRIGHTNESS", "VISOR_GLOW", "uVisorColors"]) {
        assert.ok(ROBOT_FRAGMENT.includes(name), name);
    }
    const visorColors = [[1, 0.6, 0.2], [0.2, 0.7, 1]];
    const filter = createRobotFilter(visorColors);
    const palette = filter.resources.robotUniforms.uniforms.uVisorColors;
    assert.deepEqual([...palette.slice(0, 3)].map((channel) => Number(channel.toFixed(2))), visorColors[0]);
    assert.deepEqual([...palette.slice(4, 7)].map((channel) => Number(channel.toFixed(2))), visorColors[1]);
    assert.equal(ROBOT_METAL_COLOR, 0x808080);
    assert.equal(robotVisorCode(0), 0xff0040);
    assert.equal(robotVisorCode(1), 0xff0080);
    assert.ok(robotVisorCode(ROBOT_VISOR_SLOTS - 1) <= 0xffffff && (ROBOT_VISOR_SLOTS * ROBOT_VISOR_SLOT_STEP) <= 255, "el azul del código entra en un byte");
});

test("el detalle del robot se dibuja una sola vez por cuerpo, en el contorno, con los códigos del filtro y sin crear Graphics", () => {
    const pixi = installFakePixi();
    const view = new pixi.Container();
    const items = [
        { type: "circle", body: null, bodyId: "b_1", centerX: 0, centerY: 0, angle: 0, radius: 0.16 },
        { type: "circle", body: null, bodyId: "b_2", centerX: 0, centerY: 0, angle: 0, radius: 0.24 },
        { type: "circle", body: null, bodyId: "b_2", centerX: 0, centerY: 0, angle: 0, radius: 0.1 },
        { type: "circle", body: null, bodyId: "b_6", centerX: 0, centerY: 0, angle: 0, radius: 0.17 },
        { type: "box", body: null, bodyId: "b_13", centerX: 0, centerY: 0, angle: 0, halfWidth: 0.07, halfHeight: 0.16 },
    ];
    const shapes = new RagdollShapes({ view, items, pixelsPerMeter: PIXELS_PER_METER, side: 1, slot: 1 });
    const created = pixi.Graphics.constructed;
    shapes.followZoom(SCREEN_SCALE);
    const [head, torso, torsoSecond, pelvis, arm] = shapes.parts.map((part) => part.outline);
    const panelLines = (bodyId) => ROBOT_DETAIL.panelLines.filter((line) => line.bodyId === bodyId).length;
    const discs = (bodyId) => [...ROBOT_DETAIL.screws, ...ROBOT_DETAIL.joints].filter((disc) => disc.bodyId === bodyId).length;
    assert.equal(head.rectangles, 1, "visor");
    assert.equal(head.fills.at(-1), robotVisorCode(1), "con el código de su jugador");
    assert.equal(torso.lineTos, panelLines("b_2"));
    assert.equal(torso.circles.length, 1 + discs("b_2"));
    assert.equal(torsoSecond.lineTos, 0, "el detalle de un cuerpo con dos figuras va solo en la primera");
    assert.equal(pelvis.lineTos, panelLines("b_6"));
    assert.equal(arm.circles.length, discs("b_13"));
    assert.ok(arm.fills.every((style) => style === ROBOT_METAL_COLOR));
    assert.ok(torso.strokes.slice(1).every((style) => style.color === ROBOT_JOINT_COLOR), "hendiduras con el color de junta");
    shapes.followZoom(SCREEN_SCALE * 2);
    assert.equal(pixi.Graphics.constructed, created, "ningún Graphics nuevo al rehacer");
    assert.equal(head.rectangles, 1, "el visor se rehace, no se acumula");
});

test("ROBOT_DETAIL: cada detalle pertenece a un cuerpo del JSON y los discos están sobre sus uniones", () => {
    const bodyIds = new Set(ROBOT_JSON.bodies.map((body) => body.id));
    const all = [ROBOT_DETAIL.visor, ...ROBOT_DETAIL.panelLines, ...ROBOT_DETAIL.screws, ...ROBOT_DETAIL.joints];
    for (const detail of all) assert.ok(bodyIds.has(detail.bodyId), detail.bodyId);
    const bodyById = new Map(ROBOT_JSON.bodies.map((body) => [body.id, body]));
    const anchorsOfNames = ["back_shoulder", "back_elbow", "back_hip", "back_knee", "front_shoulder", "front_elbow", "front_hip", "front_knee"];
    const anchors = ROBOT_JSON.joints.filter((joint) => anchorsOfNames.includes(joint.name)).map((joint) => joint.anchor);
    const TOLERANCE = 0.001;
    for (const disc of ROBOT_DETAIL.joints) {
        const [bodyX, bodyY] = bodyById.get(disc.bodyId).position;
        const hit = anchors.some(([anchorX, anchorY]) => Math.hypot(bodyX + disc.x - anchorX, bodyY + disc.y - anchorY) < TOLERANCE);
        assert.ok(hit, `${disc.bodyId} (${disc.x}, ${disc.y}) está sobre una unión`);
    }
});

test("el punto del visor sigue a la cabeza: se espeja con el lado y gira con el ángulo", () => {
    const head = { GetAngle: () => 0, GetPosition: () => ({ get_x: () => 2, get_y: () => 3 }) };
    const output = { x: 0, y: 0 };
    visorWorldPoint(head, 1, output);
    assert.ok(Math.abs(output.x - (2 + ROBOT_DETAIL.visor.centerX)) < 1e-9 && Math.abs(output.y - (3 + ROBOT_DETAIL.visor.centerY)) < 1e-9);
    assert.equal(visorWorldPoint(head, -1, output), output, "sin objetos nuevos");
    assert.ok(Math.abs(output.x - (2 - ROBOT_DETAIL.visor.centerX)) < 1e-9);
});
