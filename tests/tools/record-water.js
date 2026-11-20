/**
 * Graba los escenarios de video de #71 con el grabador del juego: I3 (20 gotas en x₀, un frame por paso fijo) e I7
 * (la inundación completa sin robots, un frame cada 10 pasos). Cada grabación trae las partículas del sistema de
 * disparos y `η` por celda en `eta`. Uso: `node tests/tools/record-water.js <carpeta> [i3|i7]`; se reproducen con
 * `tests/tools/viewer.html`.
 */
import { join } from "node:path";
import { Recorder } from "../helpers/recorder.js";
import { wavePulse, floodRun } from "../helpers/water-scene.js";

const dir = process.argv[2];
const only = process.argv[3];
if (!dir) throw new Error("uso: node tests/tools/record-water.js <carpeta> [i3|i7]");

const recorderFor = (name, options) => (scene) =>
    new Recorder({
        name,
        systems: { disparos: scene.system },
        stores: { disparos: scene.store },
        pieces: {},
        water: scene.water,
        ...options,
    });

if (!only || only === "i3") {
    const recorders = [];
    wavePulse({
        x0: 28,
        seconds: 2.4,
        makeRecorder: (scene) => {
            const recorder = recorderFor("I3 20 gotas en x0", { view: [14, -0.5, 42, 9] })(scene);
            recorders.push(recorder);
            return recorder;
        },
    });
    console.log(recorders[0].save(join(dir, "i3-ondas.json")));
}

if (!only || only === "i7") {
    const recorders = [];
    const stride = 10;
    floodRun({
        seconds: 100,
        stride,
        makeRecorder: (scene) => {
            const recorder = recorderFor("I7 inundacion", { dt: stride / 60, view: [-1, -1, 57, 33] })(scene);
            recorders.push(recorder);
            return recorder;
        },
    });
    console.log(recorders[0].save(join(dir, "i7-inundacion.json")));
}
