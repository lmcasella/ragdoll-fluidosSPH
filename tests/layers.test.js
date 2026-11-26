import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE_FILES = ["../index.html", "../src/ui/layout.css", "../index.js"];
const page = PAGE_FILES.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");

/** Primer argumento de la llamada a `fn(` en `index.js`. */
function firstArg(fn) {
    const call = page.match(new RegExp(`\\b${fn}\\(\\s*([\\w.]+)`));
    assert.ok(call, `no se encontró la llamada a ${fn}`);
    return call[1];
}

/** z-index de un canvas según `src/ui/layout.css`. */
function zIndex(id) {
    const rule = page.match(new RegExp(`#${id}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `no hay regla CSS para #${id}`);
    const z = rule[1].match(/z-index:\s*(\d+)/);
    return z ? Number(z[1]) : 0;
}

/** #53: el HUD, la mira y los golpes se dibujan por encima de las partículas. Verificación estática del HTML. */
test("hudCanvas tiene el z-index más alto y no captura el mouse", () => {
    const hud = zIndex("hudCanvas");
    assert.ok(hud > zIndex("pickupCanvas"));
    assert.ok(zIndex("pickupCanvas") > 6);
    assert.match(page.match(/#hudCanvas\s*\{([^}]*)\}/)[1], /pointer-events:\s*none/);
    assert.ok(page.indexOf('id="hudCanvas"') > page.indexOf('id="pickupCanvas"'));
});

test("drawAimLaser y drawHits reciben el contexto de la capa correcta", () => {
    assert.equal(firstArg("drawAimLaser"), "pickupCtx");
    assert.equal(firstArg("drawHits"), "pickupCtx");
    assert.match(page, /hudCtx\s*=\s*hudCanvas\.getContext/);
    assert.match(page, /\[canvas, pickupCanvas, hudCanvas\]/);
});

test("las capas de fluidos van antes del canvas de recogibles, con el filtro goo y sin desenfoque", () => {
    assert.match(page.match(/\.fluidLayer\s*\{([^}]*)\}/)[1], /filter:\s*url\("#goo"\)/);
    assert.match(page, /new FluidLayers\(document, pickupCanvas/);
    assert.doesNotMatch(page, /feGaussianBlur/);
});

test("la rueda de armas se dibuja después de la mira y los golpes", () => {
    assert.ok(page.indexOf("drawWeaponWheel(") > page.indexOf("drawHits(pickupCtx"));
    assert.ok(page.indexOf("drawHits(pickupCtx") > page.indexOf("drawAimLaser(pickupCtx"));
});
