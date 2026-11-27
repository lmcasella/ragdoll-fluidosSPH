import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { installFakePixi } from "./helpers/fake-pixi.js";

const {
    DROP_STRETCH,
    METABALL_RADIUS,
    METABALL_THRESHOLD,
    metaballAlpha,
    metaballPeak,
    metaballVisibleRadius,
    drawParticles,
    SHOT_DRAW: DRAW,
    PARTICLE_RADIUS,
} = await import("../src/render/fluidDraw.js");
const { FluidLayers } = await import("../src/render/fluidLayers.js");
const { tintOf } = await import("../src/core/color.js");

const PIXELS_PER_METER = 32;
const FIELD_TEXTURE_SIZE_PX = 64;
const WATER = 4;
const HONEY = 3;
const STONE = 5;
const STEAM = 6;

/** Alfa de `n` capas de alfa `a` en `source-over`: `1 − Π(1 − a_i)`. */
const over = (...alphas) => 1 - alphas.reduce((acc, a) => acc * (1 - a), 1);

test("una gota aislada de cada material mide PARTICLE_RADIUS · radiusScale (±5 %)", (t) => {
    for (const [kind, row] of Object.entries(DRAW.kinds)) {
        const radius = Math.min(DRAW.radius * row.radiusScale, DRAW.maxRadius);
        const peak = metaballPeak(radius);
        const visible = metaballVisibleRadius(peak);
        t.diagnostic(`kind ${kind}: pico ${peak.toFixed(3)}, radio visible ${visible.toFixed(4)} m, esperado ${(PARTICLE_RADIUS * row.radiusScale).toFixed(4)} m`);
        assert.ok(peak <= 1);
        assert.ok(Math.abs(visible / (PARTICLE_RADIUS * row.radiusScale) - 1) < 0.05);
        assert.ok(metaballAlpha(radius * 0.999, peak) > METABALL_THRESHOLD);
        assert.ok(metaballAlpha(radius * 1.001, peak) < METABALL_THRESHOLD);
    }
});

test("dos gotas a 0,12 m superan el umbral en el punto medio y a 0,2 m no", (t) => {
    for (const [kind, row] of Object.entries(DRAW.kinds)) {
        const peak = metaballPeak(Math.min(DRAW.radius * row.radiusScale, DRAW.maxRadius));
        const mid = over(metaballAlpha(0.06, peak), metaballAlpha(0.06, peak));
        t.diagnostic(`kind ${kind}: alfa en el punto medio a 0,12 m = ${mid.toFixed(3)}`);
        assert.ok(mid > METABALL_THRESHOLD + 0.1, `kind ${kind}: ${mid}`);
        assert.ok(over(metaballAlpha(0.1, peak), metaballAlpha(0.1, peak)) < METABALL_THRESHOLD);
    }
});

/** `FluidLayers` sobre el `PIXI` falso, con un renderer que cuenta las texturas generadas y un filtro de relleno. */
function newLayers() {
    installFakePixi();
    const parent = new PIXI.Container();
    const renderer = {
        generatedTextures: 0,
        generateTexture(graphics) {
            this.generatedTextures++;
            return { source: {}, graphics };
        },
    };
    return { parent, renderer, layers: new FluidLayers({ renderer, parent, filter: {}, pixelsPerMeter: PIXELS_PER_METER }) };
}

function fakeSystem(kinds, colors) {
    const n = kinds.length;
    const heap = new Float32Array(5 * n + 16);
    const u8 = new Uint8Array(heap.buffer);
    kinds.forEach((_, i) => {
        heap[i * 2] = 10 + i * 0.1;
        heap[i * 2 + 1] = 30;
        u8.set(colors[i], n * 8 + i * 4);
    });
    return {
        system: { GetPositionBuffer: () => 0, GetColorBuffer: () => n * 8, GetVelocityBuffer: () => n * 12, GetParticleCount: () => n },
        box: { HEAPF32: heap, HEAPU8: u8, getPointer: (a) => a },
    };
}

function run(layers, kinds, colors, velocity = null) {
    const { system, box } = fakeSystem(kinds, colors);
    if (velocity !== null) {
        kinds.forEach((_, i) => {
            box.HEAPF32[kinds.length * 3 + i * 2] = velocity[0];
            box.HEAPF32[kinds.length * 3 + i * 2 + 1] = velocity[1];
        });
    }
    const previous = globalThis.Box2D;
    globalThis.Box2D = box;
    try {
        drawParticles(layers, system, DRAW, { kind: kinds, slotAt: (i) => i });
    } finally {
        globalThis.Box2D = previous;
    }
}

/** Partículas del `ParticleContainer` de la capa del nodo `node`. */
const particlesOf = (node) => node.children[0].particleChildren;

test("drawParticles: una capa por material presente y sin mezclar materiales", () => {
    const { layers, parent } = newLayers();
    const kinds = [WATER, WATER, HONEY, STONE, WATER, HONEY];
    const white = [200, 200, 200];
    run(layers, kinds, kinds.map(() => white));
    const layerNodes = parent.children;
    assert.equal(layerNodes.length, 3, "una capa por material presente");
    const byZ = Object.fromEntries(layerNodes.map((node) => [node.zIndex, particlesOf(node).length]));
    assert.deepEqual(byZ, { [HONEY]: 2, [WATER]: 3, [STONE]: 1 });
    assert.ok(layerNodes.every((node) => node.filters.length === 1), "cada capa lleva el filtro de umbral");
    run(layers, [WATER, WATER], [white, white]);
    assert.equal(layerNodes.find((node) => node.zIndex === HONEY).visible, false, "el material que no se usa queda oculto");
    assert.equal(particlesOf(layerNodes.find((node) => node.zIndex === HONEY)).length, 0, "y sin partículas");
    assert.equal(layerNodes.find((node) => node.zIndex === WATER).visible, true);
    assert.equal(particlesOf(layerNodes.find((node) => node.zIndex === WATER)).length, 2);
});

test("cada capa declara límites que cubren todas sus gotas, para que PIXI no saltee el filtro de umbral", () => {
    const { layers, parent } = newLayers();
    run(layers, [WATER, WATER, WATER], [[1, 2, 3], [1, 2, 3], [1, 2, 3]], [0, 18]);
    const { boundsArea, particleChildren } = parent.children[0].children[0];
    assert.ok(boundsArea !== undefined && boundsArea.width > 0 && boundsArea.height > 0, "límites con área: ParticleContainer informa límites vacíos");
    for (const particle of particleChildren) {
        const halfExtent = (FIELD_TEXTURE_SIZE_PX / 2) * Math.max(particle.scaleX, particle.scaleY);
        assert.ok(boundsArea.x <= particle.x - halfExtent && boundsArea.x + boundsArea.width >= particle.x + halfExtent, "cubre la gota en x");
        assert.ok(boundsArea.y <= particle.y - halfExtent && boundsArea.y + boundsArea.height >= particle.y + halfExtent, "cubre la gota en y");
    }
});

test("el vapor se dibuja difuso, sin filtro de umbral, y los líquidos con umbral", () => {
    const { layers, parent } = newLayers();
    run(layers, [WATER, STEAM], [[1, 2, 3], [200, 200, 200]]);
    const filtersOf = (kind) => parent.children.find((node) => node.zIndex === kind).filters;
    assert.equal(filtersOf(WATER).length, 1);
    assert.equal(filtersOf(STEAM).length, 0);
});

test("cada material tiene su textura de campo, generada una vez, y el color sale del buffer como tinte", () => {
    const { layers, parent, renderer } = newLayers();
    const kinds = [WATER, HONEY, WATER, HONEY];
    const colors = [[255, 80, 20], [10, 20, 30], [252, 81, 22], [0, 0, 0]];
    run(layers, kinds, colors);
    assert.equal(renderer.generatedTextures, 2, "una textura por material presente");
    const water = parent.children.find((node) => node.zIndex === WATER);
    const honey = parent.children.find((node) => node.zIndex === HONEY);
    const [waterFirst, waterSecond] = particlesOf(water);
    assert.equal(waterFirst.texture, waterSecond.texture, "las partículas de un material comparten textura");
    assert.notEqual(waterFirst.texture, particlesOf(honey)[0].texture, "materiales distintos, texturas distintas");
    assert.deepEqual([waterFirst.tint, waterSecond.tint], [tintOf(255, 80, 20), tintOf(252, 81, 22)]);
    assert.equal(particlesOf(honey)[0].tint, tintOf(10, 20, 30));
});

test("la textura de campo de un material tiene el pico y el perfil de su dibujo, en blanco", () => {
    const { layers, renderer } = newLayers();
    run(layers, [WATER], [[1, 2, 3]]);
    const { graphics } = layers.layers.get(WATER).texture;
    assert.equal(renderer.generatedTextures, 1);
    assert.equal(graphics.rectangles, 1);
    const { colorStops } = graphics.fills[0].fill;
    const radius = DRAW.radius * DRAW.kinds[WATER].radiusScale;
    const alphas = colorStops.map(({ color }) => Number(color.match(/rgba\(255, 255, 255, ([\d.]+)\)/)[1]));
    assert.ok(Math.abs(alphas[0] - metaballPeak(radius)) < 1e-4, "el centro vale el pico");
    assert.equal(alphas.at(-1), 0, "el campo vale 0 en el borde");
    assert.equal(colorStops[0].offset, 0);
    assert.equal(colorStops.at(-1).offset, 1);
    assert.ok(alphas.every((alpha, i) => i === 0 || alpha <= alphas[i - 1]), "el perfil baja hacia el borde");
    assert.equal(layers.scalePerMeter, (2 * PIXELS_PER_METER) / FIELD_TEXTURE_SIZE_PX);
});
test("en frames sucesivos con las mismas partículas no se crean texturas ni partículas nuevas", () => {
    const { layers, renderer } = newLayers();
    const kinds = Array.from({ length: 300 }, (_, i) => 1 + (i % 5));
    const colors = kinds.map(() => [120, 130, 140]);
    run(layers, kinds, colors);
    const textures = renderer.generatedTextures;
    const particles = globalThis.PIXI.Particle.constructed;
    const pooled = [...layers.layers.values()].map((layer) => layer.pool.length);
    for (let frame = 0; frame < 30; frame++) run(layers, kinds, colors);
    assert.equal(renderer.generatedTextures, textures, "ninguna textura nueva");
    assert.equal(globalThis.PIXI.Particle.constructed, particles, "ninguna partícula nueva");
    assert.deepEqual([...layers.layers.values()].map((layer) => layer.pool.length), pooled, "los pools no crecen");
});

test("una gota lenta es redonda y una rápida se estira a lo largo de su velocidad", () => {
    const { layers, parent } = newLayers();
    run(layers, [WATER], [[1, 2, 3]], [0, 0]);
    const [still] = particlesOf(parent.children[0]);
    assert.equal(still.scaleX, still.scaleY, "sin velocidad no se estira");
    assert.equal(still.rotation, 0);
    run(layers, [WATER], [[1, 2, 3]], [0, 18]);
    const [fast] = particlesOf(parent.children[0]);
    assert.ok(fast.scaleX > fast.scaleY, "estirada a lo largo del movimiento");
    assert.ok(Math.abs(fast.rotation - Math.PI / 2) < 1e-6, "en la dirección de la velocidad");
});

test("la posición de cada partícula son los metros de la física en px a la escala del mundo", () => {
    const { layers, parent } = newLayers();
    run(layers, [WATER, WATER], [[1, 2, 3], [1, 2, 3]]);
    const [first, second] = particlesOf(parent.children[0]);
    assert.ok(Math.abs(first.x - 10 * PIXELS_PER_METER) < 1e-3);
    assert.ok(Math.abs(first.y - 30 * PIXELS_PER_METER) < 1e-3);
    assert.ok(Math.abs(second.x - 10.1 * PIXELS_PER_METER) < 1e-3);
});

test("costo de drawParticles con 4.000 partículas y 5 materiales (diagnóstico, sin objetos por partícula)", (t) => {
    const { layers, renderer } = newLayers();
    const n = 4000;
    const kinds = Array.from({ length: n }, (_, i) => 1 + (i % 5));
    const colors = Array.from({ length: n }, (_, i) => [((i * 7) % 20) * 12, ((i * 13) % 20) * 12, ((i * 29) % 20) * 12]);
    const { system, box } = fakeSystem(kinds, colors);
    const previous = globalThis.Box2D;
    globalThis.Box2D = box;
    const store = { kind: kinds, slotAt: (i) => i };
    try {
        for (let i = 0; i < 20; i++) drawParticles(layers, system, DRAW, store);
        const frames = 200;
        const start = performance.now();
        for (let i = 0; i < frames; i++) drawParticles(layers, system, DRAW, store);
        const ms = (performance.now() - start) / frames;
        t.diagnostic(`${n} partículas: ${ms.toFixed(3)} ms por frame (CPU de JS, PIXI falso); texturas generadas ${renderer.generatedTextures}`);
        assert.ok(ms < 5);
    } finally {
        globalThis.Box2D = previous;
    }
    assert.ok(METABALL_RADIUS > 0);
});
test("#213: dos gotas del chorro de agua a 18 m/s y 0,18 m se funden en el punto medio solo con el estiramiento por velocidad", () => {
    const radius = DRAW.radius * DRAW.kinds[4].radiusScale;
    const peak = metaballPeak(radius);
    const gap = 18 * 0.01;
    const half = METABALL_RADIUS + Math.min(DROP_STRETCH.max, (18 * DROP_STRETCH.time) / 2);
    const stretched = 2 * metaballAlpha(((gap / 2) * METABALL_RADIUS) / half, peak);
    const round = 2 * metaballAlpha(gap / 2, peak);
    assert.ok(round < METABALL_THRESHOLD, `sin estirar ${round.toFixed(3)}`);
    assert.ok(stretched > METABALL_THRESHOLD, `estirado ${stretched.toFixed(3)}`);
});