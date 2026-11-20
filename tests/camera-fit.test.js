/**
 * Cámara (#173): con alto infinito (Infinito) el zoom puede alejarse hasta mostrar `MAX_VIEW_HEIGHT` m de alto para que
 * dos jugadores muy separados en vertical entren en cuadro; con mundo acotado el zoom es el de siempre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Camera, MAX_VIEW_HEIGHT } from "../js/camera.js";

const PPM = 20;
const VIEW_W = 1280;
const VIEW_H = 720;

/** Cámara con la vista dada, convergida sobre `points` en el mundo `bounds`. */
function converge(bounds, points) {
    const camera = new Camera({ minX: 0, maxX: 56, minY: 0, maxY: 31.5 }, PPM);
    camera.resize(VIEW_W, VIEW_H);
    camera.setBounds(bounds);
    for (let i = 0; i < 600; i++) camera.update(points, 1 / 60, i === 0);
    return camera;
}

test("mundo infinito: puntos separados 30 m en vertical quedan dentro de la vista", () => {
    const bounds = { minX: 10, maxX: 46, minY: 0, maxY: Infinity };
    const points = [{ x: 28, y: 50 }, { x: 28, y: 80 }];
    const camera = converge(bounds, points);
    const halfH = VIEW_H / (2 * camera.scale);
    const halfW = VIEW_W / (2 * camera.scale);
    assert.ok(VIEW_H / camera.scale <= MAX_VIEW_HEIGHT + 1e-6);
    for (const p of points) {
        assert.ok(Math.abs(p.y - camera.y) <= halfH, `y ${p.y} fuera de la vista`);
        assert.ok(Math.abs(p.x - camera.x) <= halfW, `x ${p.x} fuera de la vista`);
    }
});

test("mundo acotado: el zoom es el que muestra el mundo entero, sin cambios", () => {
    const bounds = { minX: 0, maxX: 56, minY: 0, maxY: 31.5 };
    const camera = converge(bounds, [{ x: 10, y: 2 }, { x: 50, y: 30 }]);
    const expected = Math.max(VIEW_W / (56 * PPM), VIEW_H / (31.5 * PPM));
    assert.ok(Math.abs(camera.zoom - expected) < 1e-9, `zoom ${camera.zoom} != ${expected}`);
});
