import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, FrameRecorder } from "../src/bench/frameRecorder.js";
import { buildReport } from "../src/bench/benchReport.js";
import { BENCH, BENCH_SCENES } from "../src/bench/benchScript.js";
import { GpuTimer } from "../src/bench/gpuTimer.js";
import { BenchPanel } from "../src/ui/benchPanel.js";
import { FakeElement } from "./helpers/fake-dom.js";
import { loadGame } from "./helpers/game.js";

/** Factor de las duraciones de las escenas en las pruebas: el recorrido entero corre en unos 6,4 s de juego. */
const BENCH_TIME_SCALE = 0.02;
const MAX_TEST_FRAMES = 2000;
const SAMPLE_COUNT = 100;
const MAX_TOTAL_SECONDS = 360;
const SIMPLE_CONTEXT = { userAgent: "navegador de prueba", devicePixelRatio: 1, canvas: { width: 1920, height: 1080 }, renderer: null, gpuAvailable: false };

test("percentile: rango más cercano sobre 1 a 100", () => {
    const values = Array.from({ length: SAMPLE_COUNT }, (_, index) => index + 1);
    assert.equal(percentile(values, BENCH.percentiles.median), 50);
    assert.equal(percentile(values, BENCH.percentiles.p95), 95);
    assert.equal(percentile(values, BENCH.percentiles.p99), 99);
    assert.equal(percentile([7], BENCH.percentiles.p99), 7);
});

test("FrameRecorder: resumen con peor frame, cantidad, subsistemas y GPU", () => {
    const recorder = new FrameRecorder();
    for (let frame = 1; frame <= SAMPLE_COUNT; frame++) {
        recorder.record(["a", "a min 1"], frame, { física: frame / 10, render: 1 }, frame);
    }
    recorder.recordGpu(["a"], 2);
    recorder.recordGpu(["a"], 4);
    const summary = recorder.summary("a");
    assert.equal(summary.frames, SAMPLE_COUNT);
    assert.equal(summary.median, 50);
    assert.equal(summary.p95, 95);
    assert.equal(summary.p99, 99);
    assert.equal(summary.worst, 100);
    assert.equal(summary.maxParticles, 100);
    assert.equal(summary.laps.física, 5);
    assert.equal(summary.gpuMedian, 2);
    assert.equal(recorder.summary("a min 1").gpuMedian, null);
    assert.deepEqual(recorder.names, ["a", "a min 1"]);
});

test("buildReport: entra en el tope de líneas y lleva todos los grupos", () => {
    const recorder = new FrameRecorder();
    const names = [...BENCH_SCENES.map((scene) => scene.name), "match min 1", "match min 2", "match min 3"];
    for (const name of names) recorder.record([name], 16, { física: 3, corrosión: 1, luces: 1, dibujo: 2, render: 4 }, 10);
    const report = buildReport({ context: { ...SIMPLE_CONTEXT, terrain: { grids: 9, polygons: 20, wornCells: 5 } }, recorder });
    assert.ok(report.split("\n").length < BENCH.reportMaxLines);
    for (const name of names) assert.ok(report.includes(`| ${name} |`), name);
    assert.ok(report.includes("GPU: no disponible"));
    assert.ok(report.includes("5 celdas con óxido"));
});

test("el informe lleva la física por paso y los pasos por frame", () => {
    const recorder = new FrameRecorder();
    const stepMilliseconds = [[1, 2], [3], [4, 5]];
    for (const steps of stepMilliseconds) recorder.record(["a"], 16, { física: 9 }, 10, steps);
    const summary = recorder.summary("a");
    assert.deepEqual(summary.step, { median: 3, p95: 5, p99: 5 });
    assert.deepEqual(summary.stepsPerFrame, { median: 2, max: 2 });
    const report = buildReport({ context: SIMPLE_CONTEXT, recorder });
    assert.ok(report.includes("Física/paso p95 ms"));
    assert.ok(report.includes("Pasos/frame máx."));
    assert.ok(report.includes("| a | 3 | 16.00 | 16.00 | 16.00 | 16.00 | 10 | - | 3.00 | 5.00 | 5.00 | 2 | 2 |"));
    assert.ok(report.includes("física (frame)"));
});

test("las escenas suman menos de 6 minutos", () => {
    const total = BENCH_SCENES.reduce((sum, scene) => sum + scene.seconds, 0);
    assert.ok(total < MAX_TOTAL_SECONDS);
});

test("GpuTimer: sin la extensión no mide; con ella lee los resultados resueltos", () => {
    assert.equal(new GpuTimer({ getExtension: () => null }).available, false);
    assert.equal(new GpuTimer(null).available, false);
    const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
    const ready = new Set();
    const glContext = {
        QUERY_RESULT_AVAILABLE: 3,
        QUERY_RESULT: 4,
        getExtension: () => extension,
        createQuery: () => ({ id: ready.size }),
        beginQuery() {},
        endQuery() {},
        getParameter: () => false,
        getQueryParameter: (query, parameter) => (parameter === glContext.QUERY_RESULT_AVAILABLE ? ready.has(query) : 2e6),
    };
    const timer = new GpuTimer(glContext);
    assert.equal(timer.available, true);
    timer.begin();
    timer.end();
    assert.deepEqual([...timer.poll()], []);
    ready.add(timer.pending[0]);
    assert.deepEqual([...timer.poll()], [2]);
});

test("BenchPanel: copia el informe y, si falla, lo deja seleccionado", async () => {
    const listeners = [];
    class ClickableElement extends FakeElement {
        addEventListener(type, listener) {
            listeners.push(listener);
        }
    }
    const doc = { createElement: (tag) => new ClickableElement(tag) };
    const copied = [];
    const selected = [];
    let clipboardWorks = true;
    const panel = new BenchPanel(doc, new FakeElement("div"), {
        writeText: async (value) => {
            if (!clipboardWorks) throw new Error("sin permiso");
            copied.push(value);
        },
        selectContents: (node) => selected.push(node),
    });
    panel.update({ status: "Medición terminada", report: "informe" });
    assert.equal(panel.copy.hidden, false);
    listeners[0]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(copied, ["informe"]);
    clipboardWorks = false;
    listeners[0]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(selected, [panel.report]);
});

test("sin ?bench=1 no se crea el corredor ni se miden las estadísticas", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame();
    game.frames(3);
    assert.equal(game.state.bench, null);
    assert.equal(game.state.debug.stats, false);
    delete globalThis.location;
});

test("?bench=1 recorre todas las escenas con LiquidFun real y produce el informe", async () => {
    globalThis.location = { search: "?bench=1" };
    const game = await loadGame();
    const { runner } = game.state.bench;
    runner.timeScale = BENCH_TIME_SCALE;
    let frames = 0;
    while (runner.state !== "done" && frames < MAX_TEST_FRAMES) {
        game.frame();
        frames++;
    }
    delete globalThis.location;
    assert.equal(runner.state, "done");
    const report = game.state.bench.panel.report.textContent;
    assert.equal(report, runner.reportText);
    assert.ok(report.split("\n").length < BENCH.reportMaxLines);
    for (const scene of BENCH_SCENES) assert.ok(report.includes(`| ${scene.name} |`), scene.name);
    for (const minute of [1, 2, 3]) assert.ok(report.includes(`| match min ${minute} |`), `minuto ${minute}`);
    assert.ok(report.includes("GPU: no disponible"));
    for (const key of ["corrosión", "luces", "dibujo", "render", "física"]) assert.ok(runner.recorder.lapNames.includes(key), key);
    assert.ok(runner.recorder.summary("particles-water").maxParticles >= BENCH_SCENES[1].spawns[0].count);
    assert.equal(game.state.bench.panel.copy.hidden, false);
});
