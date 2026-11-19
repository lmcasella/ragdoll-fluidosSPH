import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Primer argumento de la llamada a `fn(` en el script de `index.html`. */
function firstArg(fn) {
    const call = html.match(new RegExp(`\\b${fn}\\(\\s*([\\w.]+)`));
    assert.ok(call, `no se encontró la llamada a ${fn}`);
    return call[1];
}

/** z-index de un canvas según el CSS de `index.html`. */
function zIndex(id) {
    const rule = html.match(new RegExp(`#${id}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `no hay regla CSS para #${id}`);
    const z = rule[1].match(/z-index:\s*(\d+)/);
    return z ? Number(z[1]) : 0;
}

/** #53: el HUD, la mira y los golpes se dibujan por encima de las partículas. Verificación estática del HTML. */
test("hudCanvas tiene el z-index más alto y no captura el mouse", () => {
    const hud = zIndex("hudCanvas");
    assert.ok(hud > zIndex("pickupCanvas"));
    assert.ok(zIndex("pickupCanvas") > zIndex("fluidCanvas"));
    assert.match(html.match(/#hudCanvas\s*\{([^}]*)\}/)[1], /pointer-events:\s*none/);
    assert.ok(html.indexOf('id="hudCanvas"') > html.indexOf('id="pickupCanvas"'));
});

test("drawHud, drawAimLaser y drawHits reciben el contexto de la capa correcta", () => {
    assert.equal(firstArg("drawHud"), "hudCtx");
    assert.equal(firstArg("drawAimLaser"), "pickupCtx");
    assert.equal(firstArg("drawHits"), "pickupCtx");
    assert.match(html, /hudCtx\s*=\s*hudCanvas\.getContext/);
    assert.match(html, /\[canvas, fluidCanvas, pickupCanvas, hudCanvas\]/);
});

test("la rueda de armas se dibuja después de la mira y los golpes", () => {
    assert.ok(html.indexOf("drawWeaponWheel(") > html.indexOf("drawHits(pickupCtx"));
    assert.ok(html.indexOf("drawHits(pickupCtx") > html.indexOf("drawAimLaser(pickupCtx"));
});
