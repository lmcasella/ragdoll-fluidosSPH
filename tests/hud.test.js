import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** #86: el octavo argumento de drawHud es el inicio real de la inundación, el de la inundación activa del mapa (#25). */
test("drawHud recibe el inicio de la inundación activa como floodStart", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const call = html.match(/drawHud\(([\s\S]*?)\);/);
    assert.ok(call, "no se encontró la llamada a drawHud");
    const args = call[1].split(",").map((a) => a.trim()).filter(Boolean);
    assert.equal(args.length, 8);
    assert.equal(args[7], "flood.config.start");
});
