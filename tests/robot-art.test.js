/**
 * Arte por pieza del robot (#351, docs/design/13-arte.md §13.4): los SVG de `assets/robot/` son los que genera
 * `tests/tools/robotArt.js` y la tabla `ROBOT_ART` cubre todos los cuerpos del `.rag.json`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROBOT_ART, robotArtPath } from "../src/ragdoll/robotArt.js";
import { MAX_SCALE } from "../src/render/camera.js";
import { buildPieceSvgs } from "./tools/robotArt.js";

const ROBOT_JSON = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));
const MIN_RASTER_FACTOR = 2;
const ROOT = new URL("../", import.meta.url);

test("regenerar el arte da los mismos SVG que están en assets/robot", () => {
    const generated = buildPieceSvgs();
    assert.ok(Object.keys(generated).length > 0);
    for (const [fileName, content] of Object.entries(generated)) {
        assert.equal(readFileSync(new URL(`assets/robot/${fileName}`, ROOT), "utf8"), content, fileName);
    }
});

test("cada cuerpo del JSON tiene pieza y cada pieza tiene sus dos SVG", () => {
    const generatedNames = new Set(Object.keys(buildPieceSvgs()));
    for (const body of ROBOT_JSON.bodies) {
        const piece = ROBOT_ART.pieceOfBody[body.id];
        assert.ok(piece, body.id);
        for (const layer of ["paint", "trim"]) {
            assert.ok(generatedNames.has(robotArtPath(piece, layer).split("/").pop()), `${piece} ${layer}`);
        }
    }
});

test("el SVG se rasteriza con al menos el doble de píxeles por metro que el zoom máximo de la cámara", () => {
    assert.ok(ROBOT_ART.rasterPixels / ROBOT_ART.sideMeters >= MIN_RASTER_FACTOR * MAX_SCALE);
});
