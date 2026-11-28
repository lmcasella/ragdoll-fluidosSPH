/**
 * Orden de dibujo de las piezas del robot (#379, docs/design/13-arte.md §13.4): de atrás hacia adelante, brazo trasero,
 * pierna trasera, cuerpo, pierna frontal y brazo frontal, según el lado al que mira el robot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakePixi } from "./helpers/fake-pixi.js";
import { buildRenderItems } from "../src/ragdoll/renderItems.js";
import { RagdollShapes } from "../src/ragdoll/RagdollShapes.js";
import { ROBOT_DRAW_LAYER, robotLayerOf } from "../src/ragdoll/robotLayers.js";

const ROBOT_JSON = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));
const PIXELS_PER_METER = ROBOT_JSON.units.pixelsPerMeter;

const ORIGINAL_ARM = ["b_13", "b_3"];
const COPY_ARM = ["b_15", "b_14"];
const ORIGINAL_LEG = ["b_9", "b_8", "b_4"];
const COPY_LEG = ["b_18", "b_17", "b_16"];
const CORE = ["b_1", "b_2", "b_6"];

/**
 * Ids de cuerpo de los hijos de `view` en el orden en que PIXI los dibuja: por `zIndex` y, a igual capa, por orden de alta.
 * @param {number} side
 * @returns {string[]}
 */
function drawOrder(side) {
    installFakePixi();
    const view = new PIXI.Container();
    const rag = { bodies: new Map(ROBOT_JSON.bodies.map((body) => [body.id, null])) };
    const items = buildRenderItems(rag, ROBOT_JSON, side < 0);
    const shapes = new RagdollShapes({ view, items, pixelsPerMeter: PIXELS_PER_METER, side });
    assert.equal(view.sortableChildren, true);
    const owner = new Map();
    for (const part of shapes.parts) {
        owner.set(part.fill, part.bodyId);
        owner.set(part.outline, part.bodyId);
    }
    const sorted = view.children.map((child, index) => ({ child, index })).sort((first, second) => first.child.zIndex - second.child.zIndex || first.index - second.index);
    return sorted.map(({ child }) => owner.get(child));
}

function assertLayersInOrder(order, groups) {
    let previousEnd = -1;
    for (const group of groups) {
        const positions = order.map((id, index) => (group.includes(id) ? index : -1)).filter((index) => index >= 0);
        assert.ok(positions[0] > previousEnd, `${group} va después del grupo anterior`);
        assert.equal(positions[positions.length - 1] - positions[0] + 1, positions.length, `${group} queda junto`);
        previousEnd = positions[positions.length - 1];
    }
}

test("mirando a la derecha, el juego de miembros copia (front_*) queda adelante y el original atrás", () => {
    const order = drawOrder(1);
    assertLayersInOrder(order, [ORIGINAL_ARM, ORIGINAL_LEG, CORE, COPY_LEG, COPY_ARM]);
});

test("mirando a la izquierda, el juego original queda adelante y la copia atrás", () => {
    assertLayersInOrder(drawOrder(-1), [COPY_ARM, COPY_LEG, CORE, ORIGINAL_LEG, ORIGINAL_ARM]);
});

test("las capas de la tabla van de atrás hacia adelante y la cabeza, el torso y la pelvis son el cuerpo", () => {
    const { backArm, backLeg, core, frontLeg, frontArm } = ROBOT_DRAW_LAYER;
    assert.ok(backArm < backLeg && backLeg < core && core < frontLeg && frontLeg < frontArm);
    for (const id of CORE) assert.equal(robotLayerOf(id, 1), core);
    assert.equal(robotLayerOf("b_13", 1), backArm);
    assert.equal(robotLayerOf("b_13", -1), frontArm);
});

test("cada cuerpo del JSON con miembros está en la tabla de capas", () => {
    const limbIds = [...ORIGINAL_ARM, ...COPY_ARM, ...ORIGINAL_LEG, ...COPY_LEG];
    for (const id of limbIds) assert.notEqual(robotLayerOf(id, 1), ROBOT_DRAW_LAYER.core, id);
    const jsonIds = ROBOT_JSON.bodies.map((body) => body.id).sort();
    assert.deepEqual([...limbIds, ...CORE].sort(), jsonIds);
});
