// Calibra `MATERIALS.honey.filmFactor` (docs/design/14-agua.md §14.10, #77) con el corte de Couette de
// `tests/helpers/film-scene.js`: busca el factor con el que la fuerza sobre la placa iguala a `μ V L b / δ`.
// Uso: node tests/tools/film-calibration.js
import { couette } from "../helpers/film-scene.js";

const LAYERS = 3;
let factor = 1;
for (let iteration = 0; iteration < 6; iteration++) {
    const { force, reference, gap } = couette({ filmFactor: factor, layers: LAYERS });
    console.log(`factor ${factor.toFixed(4)}: fuerza ${force.toFixed(4)} N, referencia ${reference.toFixed(4)} N, δ ${gap.toFixed(3)} m`);
    factor *= reference / force;
}
console.log(`filmFactor medido: ${factor.toFixed(3)}`);
