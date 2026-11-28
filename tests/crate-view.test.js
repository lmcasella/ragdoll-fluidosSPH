/**
 * Vista de las cajas (#358, docs/design/04-fluidos.md §4.2, docs/design/13-arte.md §13.2) con el `PIXI` falso: la madera y
 * la marca de embalaje siguen a la caja (posición y giro), cada caja y cada pedazo tiene su filtro, y los filtros se crean
 * una sola vez.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { SURFACES } = await import("../src/level/surfaces.js");
const { CRATE } = await import("../src/level/crates.js");
const { WEAPONS, FLUID } = await import("../src/combat/weapons.js");
const { SURFACE_FRAGMENT, SURFACE_ID_SCALE, encodeSurface } = await import("../src/render/surfaceFilter.js");
const { createLightSet } = await import("../src/render/lighting.js");
const { CrateView } = await import("../src/render/crateView.js");

const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;
const SCREEN_ORIGIN = { x: 100, y: 300 };
const RED_SHIFT = 16;
const CHANNEL_MAX = 255;
const COORDINATE_TOLERANCE = 1e-5;
const POSE_A = { x: 4, y: 2, angle: 0.3 };
const POSE_B = { x: -7.5, y: 11, angle: -1.2 };
const CORNER = { x: CRATE.side / 2, y: CRATE.side / 2 };
const PIECE_SIZE = { width: CRATE.side * CRATE.pieceSize.width, height: CRATE.side * CRATE.pieceSize.height };
const WATCH_FRAMES = 3;

/** Punto del marco de la caja (m) en el mundo, para una caja con la pose `pose`. */
function toWorld(point, pose) {
    const cosine = Math.cos(pose.angle);
    const sine = Math.sin(pose.angle);
    return { x: pose.x + cosine * point.x - sine * point.y, y: pose.y + sine * point.x + cosine * point.y };
}

/** Lo mismo que hace el shader (`frameOf`) con los uniforms del filtro. */
function toFrame(world, filter) {
    const { uFrameCenter: center, uFrameRotation: rotation, uFrameOffset: offset } = filter.resources.surfaceUniforms.uniforms;
    const relativeX = world.x - center[0];
    const relativeY = world.y - center[1];
    return {
        x: relativeX * rotation[0] + relativeY * rotation[1] + offset[0],
        y: relativeY * rotation[0] - relativeX * rotation[1] + offset[1],
    };
}

function newView() {
    const pixi = installFakePixi();
    const registered = [];
    const view = new CrateView({
        levelParent: new pixi.Container(),
        parent: new pixi.Container(),
        pixelsPerMeter: PIXELS_PER_METER,
        weapons: WEAPONS,
        crateSide: CRATE.side,
        pieceSize: PIECE_SIZE,
        registerOccluder: (filter) => registered.push(filter),
    });
    view.setLights(createLightSet());
    return { pixi, view, registered };
}

const crateAt = (pose, weapon) => ({ point: { weapon, kind: undefined }, ...pose, wear: 0 });

function update(view, crates, pieces = []) {
    view.update({ crates, pieces, screenOrigin: SCREEN_ORIGIN, screenScale: SCREEN_SCALE });
}

test("la madera es el material 5: el shader la reconoce, la dibuja en el marco local y el código de color entra en el canal", () => {
    assert.equal(SURFACES.wood.id, 5);
    assert.equal(SURFACES.wood.patternSize, CRATE.side, "el patrón de la madera es el lado de la caja");
    assert.ok(SURFACE_FRAGMENT.includes("id == WOOD_ID"));
    assert.ok(SURFACE_FRAGMENT.includes("woodColor(frameOf(world), code.g)"), "la madera usa el marco local");
    assert.ok(!/steelColor\(frameOf|concreteColor\(frameOf|plateColor\(frameOf/.test(SURFACE_FRAGMENT), "solo la madera usa el marco");
    assert.ok(SURFACE_FRAGMENT.includes("vec3(world, 0.0)"), "la luz sigue en coordenadas de mundo");
    for (const surface of Object.keys(SURFACES)) {
        const code = encodeSurface({ surface, wear: 1 });
        const red = (code >> RED_SHIFT) & CHANNEL_MAX;
        assert.ok(red <= CHANNEL_MAX);
        assert.equal(Math.round((red / CHANNEL_MAX) * SURFACE_ID_SCALE), SURFACES[surface].id, `id de ${surface}`);
    }
});

test("cada caja y cada pedazo tiene su filtro, creado una sola vez y registrado como oclusor", () => {
    const { pixi, view, registered } = newView();
    const crates = [crateAt(POSE_A, FLUID.LAVA), crateAt(POSE_B, FLUID.ACID)];
    const pieces = [{ ...POSE_A, offsetX: 0, offsetY: 0.2 }];
    update(view, crates, pieces);
    assert.equal(registered.length, 3);
    assert.equal(new Set(registered).size, 3, "ninguno compartido");
    const created = pixi.Filter.constructed;
    for (let frame = 0; frame < WATCH_FRAMES; frame++) update(view, crates, pieces);
    assert.equal(pixi.Filter.constructed, created, "ningún filtro nuevo");
    assert.equal(registered.length, 3);
    assert.deepEqual(view.crateEntries[0].body.filters, [view.crateEntries[0].filter]);
});

test("la veta va pegada a la caja: un mismo punto de la caja da el mismo resultado en el marco local con dos posiciones y giros", () => {
    const { view } = newView();
    update(view, [crateAt(POSE_A, FLUID.LAVA), crateAt(POSE_B, FLUID.LAVA)]);
    const [first, second] = view.crateEntries.map((entry) => entry.filter);
    const fromA = toFrame(toWorld(CORNER, POSE_A), first);
    const fromB = toFrame(toWorld(CORNER, POSE_B), second);
    assert.ok(Math.abs(fromA.x - CORNER.x) < COORDINATE_TOLERANCE && Math.abs(fromA.y - CORNER.y) < COORDINATE_TOLERANCE);
    assert.ok(Math.abs(fromB.x - fromA.x) < COORDINATE_TOLERANCE && Math.abs(fromB.y - fromA.y) < COORDINATE_TOLERANCE);
    const moved = { ...POSE_A, x: POSE_A.x + 3, angle: POSE_A.angle + 0.9 };
    update(view, [crateAt(moved, FLUID.LAVA)]);
    const afterMove = toFrame(toWorld(CORNER, moved), view.crateEntries[0].filter);
    assert.ok(Math.abs(afterMove.x - CORNER.x) < COORDINATE_TOLERANCE && Math.abs(afterMove.y - CORNER.y) < COORDINATE_TOLERANCE, "la misma caja movida");
});

test("un pedazo muestra su tramo de la caja: su centro cae en su desplazamiento dentro de la caja entera", () => {
    const { view } = newView();
    const piece = { ...POSE_B, offsetX: 0, offsetY: -0.2625 };
    update(view, [], [piece]);
    const center = toFrame({ x: piece.x, y: piece.y }, view.pieceEntries[0].filter);
    assert.ok(Math.abs(center.x - piece.offsetX) < COORDINATE_TOLERANCE && Math.abs(center.y - piece.offsetY) < COORDINATE_TOLERANCE);
});
