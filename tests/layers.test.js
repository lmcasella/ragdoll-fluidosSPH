import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";

const { FLUID } = await import("../src/combat/weapons.js");
const { ORIGIN } = await import("../src/fluids/particleStore.js");

const page = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const thresholdFilterSource = readFileSync(new URL("../src/render/thresholdFilter.js", import.meta.url), "utf8");

/** Primer argumento de la llamada a `fn(` en `index.js`. */
function firstArg(fn) {
    const call = page.match(new RegExp(`\\b${fn}\\(\\s*([\\w.]+)`));
    assert.ok(call, `no se encontró la llamada a ${fn}`);
    return call[1];
}

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

/** Nombres de las capas de `scene.hud` de abajo a arriba: un sprite por capa 2D y `fluidParent` con sus capas de fluido. */
function hudOrder(scene) {
    const names = new Map(scene.layers.map((layer) => [layer.sprite, layer.canvas.id]));
    return scene.hud.children.map((child) => (child === scene.fluidParent ? "fluid" : names.get(child)));
}

/** #53: el panel de debug, la mira y los golpes se dibujan por encima de las partículas, y estas por encima del nivel y los robots. */
test("de abajo a arriba: nivel, robots, agua, fluidos, superpuesta y panel de debug", async () => {
    const game = await loadGame();
    const { scene } = game.state;
    assert.deepEqual(hudOrder(scene), ["fluid", "overlayLayer", "panelLayer"]);
    assert.deepEqual(scene.world.children, [scene.levelLayer, scene.ragdollLayer, scene.effectsLayer, scene.waterLayer]);
    assert.deepEqual(scene.application.stage.children, [scene.world, scene.hud], "el nivel va debajo de todo lo de pantalla");
});

test("drawAimLaser y drawHits reciben el contexto de la capa correcta", () => {
    assert.equal(firstArg("drawAimLaser"), "overlayCtx");
    assert.equal(firstArg("drawHits"), "overlayCtx");
    assert.match(page, /overlayCtx\s*=\s*scene\.overlayLayer\.ctx/);
    assert.match(page, /panelCtx\s*=\s*scene\.panelLayer\.ctx/);
});

test("las capas de fluido van entre el mundo (nivel, robots y agua) y la superpuesta, con el filtro de umbral y sin desenfoque", async () => {
    const game = await loadGame();
    const { scene, fluidLayers } = game.state;
    spawnWater(game);
    game.frames(2);
    assert.ok(fluidLayers.layers.size > 0, "hay capas de fluido");
    assert.equal(scene.fluidParent.sortableChildren, true, "las capas de fluido se ordenan por material");
    for (const { layer } of fluidLayers.layers.values()) {
        assert.equal(layer.sprite.filters.length, 1);
        assert.ok(layer.sprite.filters[0].options.glProgram.fragment.includes("clamp"), "el filtro es el de umbral");
    }
    assert.doesNotMatch(thresholdFilterSource, /gaussian|blur/i);
    assert.deepEqual(hudOrder(scene), ["fluid", "overlayLayer", "panelLayer"]);
});

test("la rueda de armas se dibuja después de la mira y los golpes", () => {
    assert.ok(page.indexOf("drawWeaponWheel(") > page.indexOf("drawHits(overlayCtx"));
    assert.ok(page.indexOf("drawHits(overlayCtx") > page.indexOf("drawAimLaser(overlayCtx"));
});
