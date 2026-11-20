/**
 * Graba la rotura de presa de Ritter de W4 (h0 = 2 m sobre lecho seco, sin fricción) con el grabador del juego:
 * un frame por paso fijo con el perfil `η(x)` por celda en `eta`, sin partículas ni piezas. Uso:
 * `node tests/tools/record-dam-break.js <archivo.json> [segundos]`. Las celdas están en
 * `meta.field` ({ x0, dx, n }), y la solución de Ritter se calcula con `h = (2 c0 − (x − x_presa)/t)² / (9 g)`.
 */
import { Recorder } from "../helpers/recorder.js";
import { ShallowWater, WATER_FIELD } from "../../js/water.js";

const G = 10;
const DAM = 15;
const LENGTH = 43;
const file = process.argv[2];
const seconds = Number(process.argv[3] ?? 3);
if (!file) throw new Error("uso: node tests/tools/record-dam-break.js <archivo.json> [segundos]");

const floor = { x: LENGTH / 2, y: -0.5, w: LENGTH, h: 1 };
const level = { bounds: { minX: 0, maxX: LENGTH, minY: 0, maxY: 32 }, solids: [{ ...floor, kind: "floor" }] };
const water = new ShallowWater(level, { ...WATER_FIELD, manning: 0 });
for (let i = 0; i < water.N; i++) water.h[i] = water.center(i) < DAM ? 2 : 0;

const recorder = new Recorder({ name: "rotura de presa W4", systems: {}, pieces: {}, view: [0, -1, LENGTH, 4], solids: [floor] });
recorder.meta.field = { x0: water.x0, dx: water.dx, n: water.N, dam: DAM, h0: 2 };
const profile = () => Array.from(water.h, (h, i) => Math.round((water.b[i] + h) * 1e4) / 1e4);

recorder.capture(profile());
const steps = Math.round(seconds * 60);
for (let s = 0; s < steps; s++) {
    water.step(1 / 60);
    recorder.capture(profile());
}
console.log(recorder.save(file));
