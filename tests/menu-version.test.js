import { test } from "node:test";
import assert from "node:assert/strict";
import { Screens, versionLabel } from "../src/ui/screens.js";
import { fakeDocument } from "./helpers/fake-dom.js";

test("el menú tiene el elemento de versión y no es una fila navegable", () => {
    const doc = fakeDocument();
    const screens = new Screens(doc, doc.body);
    const { menu } = screens;
    assert.ok(menu.ver);
    assert.ok(menu.ver.classes.has("ver"));
    assert.equal(menu.ver.parent, menu.el);
    assert.equal(menu.ver.textContent, "");
    assert.ok(!("ver" in menu.rows));
    assert.ok(!Object.values(menu.rows).some((r) => r.el === menu.ver));
});

test("versionLabel formatea versión y commit, solo versión, o dev", () => {
    assert.equal(versionLabel({ version: "v0.52.3", commit: "da518ab" }), "v0.52.3 · da518ab");
    assert.equal(versionLabel({ version: "v0.52.3" }), "v0.52.3");
    assert.equal(versionLabel(null), "dev");
    assert.equal(versionLabel(undefined), "dev");
    assert.equal(versionLabel({}), "dev");
    assert.equal(versionLabel("x"), "dev");
});
