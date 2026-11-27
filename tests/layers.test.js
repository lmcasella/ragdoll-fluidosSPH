import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadGame } from "./helpers/game.js";

const { FLUID } = await import("../src/combat/weapons.js");
const { ORIGIN } = await import("../src/fluids/particleStore.js");

const thresholdFilterSource = readFileSync(new URL("../src/render/thresholdFilter.js", import.meta.url), "utf8");
const renderDirectory = new URL("../src/render/", import.meta.url);

/** Crea 20 gotas de agua en el aire para que aparezca una capa de fluido. */
function spawnWater(game) {
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let k = 0; k < 20; k++) {
        at.set_x(k * 0.1);
        at.set_y(5);
        def.set_position(at);
        game.state.store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
}

/** Nombres de las capas de `scene.hud` de abajo a arriba: `fluidParent` con sus capas de fluido y la capa superpuesta. */
function hudOrder(scene) {
    const names = new Map([[scene.fluidParent, "fluid"], [scene.overlayLayer, "overlay"]]);
    return scene.hud.children.map((child) => names.get(child));
}

/** #53: la mira, los golpes y el debug se dibujan por encima de las partículas, y estas por encima del nivel y los robots. */
test("de abajo a arriba: nivel, robots, agua, fluidos y capa superpuesta", async () => {
    const game = await loadGame();
    const { scene } = game.state;
    assert.deepEqual(hudOrder(scene), ["fluid", "overlay"]);
    assert.deepEqual(scene.world.children, [scene.levelLayer, scene.ragdollLayer, scene.effectsLayer, scene.waterLayer]);
    assert.deepEqual(scene.application.stage.children, [scene.world, scene.hud], "el nivel va debajo de todo lo de pantalla");
});

test("la mira y los golpes se dibujan en gráficos de la capa superpuesta, no en un canvas aparte", async () => {
    const game = await loadGame();
    const { scene, aimLaserView, hitEffectsView, weaponWheelView } = game.state;
    for (const graphics of aimLaserView.graphics) assert.equal(graphics.parent, scene.overlayLayer);
    assert.equal(hitEffectsView.graphics.parent, scene.overlayLayer);
    const order = scene.overlayLayer.children;
    const [lastLaser] = aimLaserView.graphics.slice(-1);
    assert.ok(order.indexOf(hitEffectsView.graphics) > order.indexOf(lastLaser), "los golpes van después de la mira");
    assert.ok(order.indexOf(weaponWheelView.wheels[0].node) > order.indexOf(hitEffectsView.graphics), "la rueda de armas va después de la mira y los golpes");
});

test("la capa superpuesta apila recogibles, miras, golpes, debug y rueda de armas, en ese orden", async () => {
    const game = await loadGame();
    const { scene, pickupView, aimLaserView, hitEffectsView, debugView, weaponWheelView } = game.state;
    const expected = [
        pickupView.container,
        ...aimLaserView.graphics,
        hitEffectsView.graphics,
        debugView.pointsGraphics,
        ...Object.values(debugView.layerGraphics),
        ...weaponWheelView.wheels.map((wheel) => wheel.node),
    ];
    assert.deepEqual(scene.overlayLayer.children, expected);
});

test("las capas de fluido van entre el mundo (nivel, robots y agua) y la superpuesta, con el filtro de umbral y sin desenfoque", async () => {
    const game = await loadGame();
    const { scene, fluidLayers } = game.state;
    spawnWater(game);
    game.frames(2);
    assert.ok(fluidLayers.layers.size > 0, "hay capas de fluido");
    assert.equal(scene.fluidParent.sortableChildren, true, "las capas de fluido se ordenan por material");
    for (const { node } of fluidLayers.layers.values()) {
        assert.equal(node.filters.length, 1);
        assert.ok(node.filters[0].options.glProgram.fragment.includes("clamp"), "el filtro es el de umbral");
    }
    assert.doesNotMatch(thresholdFilterSource, /gaussian|blur/i);
    assert.deepEqual(hudOrder(scene), ["fluid", "overlay"]);
});

test("nada de src/render/ usa un canvas fuera de pantalla ni un contexto 2D", () => {
    const files = readdirSync(renderDirectory).filter((name) => name.endsWith(".js"));
    assert.ok(files.length > 0);
    for (const name of files) {
        const source = readFileSync(new URL(name, renderDirectory), "utf8");
        assert.doesNotMatch(source, /createElement|getContext|OffscreenCanvas|CanvasLayer/, name);
    }
    const page = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    assert.doesNotMatch(page, /FluidLayers\(\{\s*doc/);
    assert.doesNotMatch(page, /getContext|overlayCtx|panelCtx/);
});
