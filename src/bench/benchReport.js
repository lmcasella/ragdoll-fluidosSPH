const MILLISECONDS_DIGITS = 2;

const formatMs = (value) => (value === null ? "-" : value.toFixed(MILLISECONDS_DIGITS));
const row = (cells) => `| ${cells.join(" | ")} |`;
const separator = (count) => row(Array(count).fill("---"));

/**
 * Líneas de la cabecera con el contexto de la máquina.
 * @param {object} context `userAgent`, `devicePixelRatio`, `canvas: { width, height }`, `renderer` (texto o `null`),
 * `gpuAvailable` y, si se pudo leer, `terrain: { grids, polygons, wornCells }`
 */
function headerLines(context) {
    const lines = [
        `Navegador: ${context.userAgent}`,
        `Pantalla: canvas ${context.canvas.width} x ${context.canvas.height} px, devicePixelRatio ${context.devicePixelRatio}`,
        `Renderizador: ${context.renderer ?? "no disponible"}`,
        `GPU: ${context.gpuAvailable ? "EXT_disjoint_timer_query_webgl2" : "no disponible"}`,
    ];
    if (context.terrain) {
        const { grids, polygons, wornCells } = context.terrain;
        lines.push(`Terreno al final: ${grids} grillas, ${polygons} polígonos, ${wornCells} celdas con óxido`);
    }
    return lines.map((line) => `- ${line}`);
}

/**
 * Informe en markdown, corto para un comentario de GitHub (`BENCH.reportMaxLines`): la cabecera de contexto, una tabla de
 * tiempo por frame (una fila por grupo) y otra con la mediana de cada subsistema (una columna por grupo).
 * @param {object} options
 * @param {object} options.context contexto de la máquina (ver `headerLines`)
 * @param {import("./frameRecorder.js").FrameRecorder} options.recorder
 * @returns {string}
 */
export function buildReport({ context, recorder }) {
    const names = recorder.names;
    const summaries = names.map((name) => recorder.summary(name));
    const lines = ["**Medición ?bench=1**", "", ...headerLines(context), ""];
    const frameColumns = ["Grupo", "Frames", "Mediana ms", "p95 ms", "p99 ms", "Peor ms", "Partículas máx.", "GPU mediana ms"];
    lines.push(row(frameColumns), separator(frameColumns.length));
    names.forEach((name, index) => {
        const { frames, median, p95, p99, worst, maxParticles, gpuMedian } = summaries[index];
        lines.push(row([name, frames, formatMs(median), formatMs(p95), formatMs(p99), formatMs(worst), maxParticles, formatMs(gpuMedian)]));
    });
    lines.push("", "Mediana por subsistema (ms):", "", row(["Subsistema", ...names]), separator(names.length + 1));
    for (const key of recorder.lapNames) {
        lines.push(row([key, ...summaries.map(({ laps }) => formatMs(laps[key] ?? null))]));
    }
    return lines.join("\n");
}
