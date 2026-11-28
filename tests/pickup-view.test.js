/**
 * Ítems sueltos animados (#358, docs/design/04-fluidos.md §4.2) con el `PIXI` falso: el frasco sube y baja, cada líquido mueve
 * su superficie con su período, la lava pulsa y burbujea, el ácido burbujea y la llave de la reparación gira una vuelta cada 3 s.
 * Sin crear gráficos por frame.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { WEAPONS, FLUID } = await import("../src/combat/weapons.js");
const { PickupView, ITEM_ICON } = await import("../src/render/pickupView.js");

const PIXELS_PER_METER = 32;
const TOLERANCE = 1e-6;
const FULL_TURN = 2 * Math.PI;
const WATCH_FRAMES = 30;
const FRAME_SECONDS = 1 / 60;

function newView() {
    const pixi = installFakePixi();
    const view = new PickupView({ parent: new pixi.Container(), pixelsPerMeter: PIXELS_PER_METER, weapons: WEAPONS });
    return { pixi, view };
}

const liquidPoint = (weapon) => ({ x: 3, y: 4, weapon, kind: undefined, active: true });
const repairPoint = { x: 5, y: 4, weapon: undefined, kind: "repair", active: true };

/** Altura (m) de la cresta `index` del ítem de la entrada `entry`, sin el movimiento del frasco. */
const crestHeight = (entry, index) => entry.crests[index].position.y / PIXELS_PER_METER;

/** Mínimo y máximo (m) que toma `read` sobre la primera entrada a lo largo de un período, con `samples` lecturas repartidas. */
function swing(view, points, read, period, samples = 200) {
    let low = Infinity;
    let high = -Infinity;
    for (let sample = 0; sample < samples; sample++) {
        view.update(points, 0, (period * sample) / samples);
        const value = read(view.entries[0]);
        low = Math.min(low, value);
        high = Math.max(high, value);
    }
    return { low, high };
}

test("el frasco sube y baja 0,08 m con período de 2 s", () => {
    const { view } = newView();
    const points = [liquidPoint(FLUID.WATER)];
    const { low, high } = swing(view, points, (entry) => entry.bottle.position.y / PIXELS_PER_METER, ITEM_ICON.bob.period);
    assert.ok(Math.abs(high - ITEM_ICON.bob.amplitude) < 1e-3 && Math.abs(low + ITEM_ICON.bob.amplitude) < 1e-3);
    assert.equal(ITEM_ICON.bob.amplitude, 0.08);
    assert.equal(ITEM_ICON.bob.period, 2);
    view.update(points, 0, 0);
    const start = view.entries[0].bottle.position.y;
    view.update(points, 0, ITEM_ICON.bob.period);
    assert.ok(Math.abs(view.entries[0].bottle.position.y - start) < TOLERANCE, "se repite cada período");
});

test("la superficie se mueve con el período y la amplitud de cada material: agua rápida, miel lenta y chica", () => {
    const { view } = newView();
    const { materials } = ITEM_ICON.liquid;
    assert.equal(materials[FLUID.WATER].wavePeriod, 0.6);
    assert.equal(materials[FLUID.HONEY].wavePeriod, 3);
    assert.ok(materials[FLUID.HONEY].waveAmplitude < materials[FLUID.WATER].waveAmplitude, "la miel es más chica");
    for (const fluid of [FLUID.WATER, FLUID.HONEY, FLUID.LAVA, FLUID.ACID]) {
        const material = materials[fluid];
        const points = [liquidPoint(fluid)];
        view.update(points, 0, 0);
        const level = view.geometry.liquidLevel;
        const { low, high } = swing(view, points, (entry) => crestHeight(entry, 0), material.wavePeriod);
        assert.ok(Math.abs(high - level - material.waveAmplitude) < 1e-3 && Math.abs(level - low - material.waveAmplitude) < 1e-3, `amplitud de ${fluid}`);
        view.update(points, 0, 0);
        const start = crestHeight(view.entries[0], 0);
        view.update(points, 0, material.wavePeriod);
        assert.ok(Math.abs(crestHeight(view.entries[0], 0) - start) < 1e-3, `período de ${fluid}`);
    }
});

test("el líquido toma el color de la tabla de armas; la lava pulsa de brillo y burbujea, el ácido burbujea, el agua y la miel no", () => {
    const { view } = newView();
    const points = [liquidPoint(FLUID.WATER), liquidPoint(FLUID.HONEY), liquidPoint(FLUID.LAVA), liquidPoint(FLUID.ACID)];
    const pulses = [];
    for (let sample = 0; sample < 100; sample++) {
        view.update(points, 0, sample * 0.05);
        pulses.push(view.entries.map((entry) => entry.liquid.tint));
    }
    const distinct = (column) => new Set(pulses.map((row) => row[column])).size;
    assert.equal(distinct(0), 1, "el agua no pulsa");
    assert.equal(distinct(1), 1, "la miel no pulsa");
    assert.ok(distinct(2) > 1, "la lava pulsa");
    assert.equal(distinct(3), 1, "el ácido no pulsa");
    const visibleBubbles = view.entries.map((entry) => entry.bubbles.filter((bubble) => bubble.visible).length);
    assert.deepEqual(visibleBubbles, [0, 0, ITEM_ICON.liquid.materials[FLUID.LAVA].bubbles.count, ITEM_ICON.liquid.materials[FLUID.ACID].bubbles.count]);
    const acidBubble = view.entries[3].bubbles[0];
    const heights = [];
    for (let sample = 0; sample < 10; sample++) {
        view.update(points, 0, sample * 0.05);
        heights.push(acidBubble.position.y);
    }
    assert.ok(heights.every((height, index) => index === 0 || height > heights[index - 1]), "las burbujas del ácido suben");
    view.entries.forEach((entry, index) => {
        const weapon = WEAPONS.find((candidate) => candidate.id === points[index].weapon);
        const [red, green, blue] = weapon.color;
        assert.equal(entry.liquid.fills[0].color, (red << 16) | (green << 8) | blue);
    });
});

test("la llave de la reparación da una vuelta cada 3 s, y la tuerca y el halo quedan quietos", () => {
    const { view } = newView();
    const points = [repairPoint];
    view.update(points, 0, 0);
    assert.equal(view.entries[0].wrench.rotation, 0);
    view.update(points, 0, ITEM_ICON.repair.wrenchTurnPeriod / 2);
    assert.ok(Math.abs(view.entries[0].wrench.rotation - FULL_TURN / 2) < TOLERANCE, "media vuelta a los 1,5 s");
    view.update(points, 0, ITEM_ICON.repair.wrenchTurnPeriod);
    assert.ok(Math.abs(view.entries[0].wrench.rotation - FULL_TURN) < TOLERANCE, "una vuelta a los 3 s");
    assert.equal(ITEM_ICON.repair.wrenchTurnPeriod, 3);
    assert.equal(view.entries[0].nut.rotation, 0);
    assert.equal(view.entries[0].halo.rotation, 0);
});

test("la animación no crea gráficos ni textos por frame y una entrada que pasa a otro punto solo se repinta", () => {
    const { pixi, view } = newView();
    const points = [liquidPoint(FLUID.LAVA), repairPoint];
    view.update(points, 0, 0);
    const graphics = pixi.Graphics.constructed;
    const texts = pixi.Text.constructed;
    for (let frame = 0; frame < WATCH_FRAMES; frame++) view.update(points, 0, frame * FRAME_SECONDS);
    assert.equal(pixi.Graphics.constructed, graphics);
    assert.equal(pixi.Text.constructed, texts);
    view.update([points[1], points[0]], 0, 0);
    assert.equal(pixi.Graphics.constructed, graphics, "al cambiar de punto no se crea nada");
    assert.equal(view.entries[0].repair.visible, true);
    assert.equal(view.entries[0].bottle.visible, false);
    assert.equal(view.entries[1].bottle.visible, true);
});
