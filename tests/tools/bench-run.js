import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Corre el modo de medición (`?bench=1`) de punta a punta sin nadie frente a la pantalla y publica el informe en un issue.
 * Levanta `http-server` (el de `npx http-server -c-1 .`, sin instalar nada) en un puerto libre, abre Helium en una ventana
 * real a pantalla completa con un perfil temporal y, por el protocolo DevTools con el `WebSocket` nativo de Node, espera a
 * que el panel de la medición muestre el informe. Valida la cabecera contra la máquina de referencia (`REFERENCE`) y solo
 * entonces lo publica con `gh issue comment`. Cierra el navegador y el servidor siempre. Pensado para la tarea programada de
 * `tests/tools/bench-task.ps1`: tiene que correr en la sesión de la consola física, no por SSH ni por RDP.
 *
 * Uso: `node tests/tools/bench-run.js --issue <n> --label "<texto>" [--browser <chrome.exe>]`.
 */
const DEFAULT_BROWSER = join(process.env.LOCALAPPDATA ?? "", "imput", "Helium", "Application", "chrome.exe");
const REPOSITORY_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const LOOPBACK_HOST = "127.0.0.1";
/** `npx` de la instalación de Node que corre este script, lanzado sin shell (en Windows `npx` es un `.cmd`). */
const NPX_SCRIPT = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const BENCH_QUERY = "?bench=1";

/** Máquina de referencia: la medición solo vale con esta pantalla y esta GPU. */
const REFERENCE = { canvasWidth: 1536, canvasHeight: 864, devicePixelRatio: 1.25, rendererMark: "MX150" };

const SERVER_START_ATTEMPTS = 100;
const BROWSER_START_ATTEMPTS = 150;
const START_RETRY_MS = 200;
const POLL_INTERVAL_MS = 5000;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const SAFETY_TIMEOUT_MINUTES = 10;
const SAFETY_TIMEOUT_MS = SAFETY_TIMEOUT_MINUTES * MILLISECONDS_PER_MINUTE;
const BROWSER_CLOSE_MS = 2000;
const PROFILE_REMOVE_RETRIES = 10;

/** Selectores del panel de la medición (`src/ui/benchPanel.js`): el estado y el informe, oculto con `off` hasta terminar. */
const PANEL_STATE_EXPRESSION = `(() => {
    const report = document.querySelector(".bench-panel .bench-report");
    const status = document.querySelector(".bench-panel .debug-lines");
    const done = report !== null && !report.classList.contains("off");
    return { status: status?.textContent ?? null, report: done ? report.textContent : null };
})()`;

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function parseArguments(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith("--")) continue;
        const name = argv[i].slice(2);
        const hasValue = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--");
        options[name] = hasValue ? argv[++i] : true;
    }
    return options;
}

/** Pide al sistema un puerto TCP libre en la interfaz local y lo suelta para que lo use otro proceso. */
function findFreePort() {
    return new Promise((done, fail) => {
        const probe = createServer();
        probe.once("error", fail);
        probe.listen(0, LOOPBACK_HOST, () => {
            const { port } = probe.address();
            probe.close(() => done(port));
        });
    });
}

/** Mata un proceso con todos sus hijos: `npx` y el navegador lanzan procesos propios que `kill` no alcanza en Windows. */
function killTree(child) {
    if (child.exitCode !== null) return;
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
}

async function waitForResponse(url, attempts, failureMessage) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch {
            await sleep(START_RETRY_MS);
            continue;
        }
        await sleep(START_RETRY_MS);
    }
    throw new Error(failureMessage);
}

/**
 * Copia del entorno con el PATH sin comillas. Una comilla suelta en una entrada del PATH hace que `cmd` (con el que `npx`
 * lanza `http-server`) y `gh` dejen de buscar en las siguientes y no encuentren `node` ni `git`.
 */
function environmentWithoutPathQuotes() {
    const environment = { ...process.env };
    const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === "PATH");
    if (pathKey) environment[pathKey] = environment[pathKey].replaceAll('"', "");
    return environment;
}

async function startHttpServer() {
    const port = await findFreePort();
    const server = spawn(process.execPath, [NPX_SCRIPT, "--no-install", "http-server", "-c-1", "-s", "-a", LOOPBACK_HOST, "-p", String(port), "."], {
        cwd: REPOSITORY_ROOT, stdio: "ignore", env: environmentWithoutPathQuotes(),
    });
    await waitForResponse(`http://${LOOPBACK_HOST}:${port}/`, SERVER_START_ATTEMPTS, "http-server no respondió (¿está en la caché de npx?)");
    return { server, port };
}

async function startBrowser(browserPath, url, profileDirectory) {
    const debugPort = await findFreePort();
    const browser = spawn(browserPath, [
        `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDirectory}`, "--start-fullscreen",
        "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", url,
    ], { stdio: "ignore" });
    const listUrl = `http://${LOOPBACK_HOST}:${debugPort}/json/list`;
    for (let attempt = 0; attempt < BROWSER_START_ATTEMPTS; attempt++) {
        try {
            const targets = await (await fetch(listUrl)).json();
            const page = targets.find((target) => target.type === "page" && target.url.startsWith(url));
            if (page) return { browser, debugPort, pageSocketUrl: page.webSocketDebuggerUrl };
        } catch {
            await sleep(START_RETRY_MS);
            continue;
        }
        await sleep(START_RETRY_MS);
    }
    killTree(browser);
    throw new Error("El navegador no abrió el puerto de DevTools con la página del juego");
}

async function openSession(socketUrl) {
    const socket = new WebSocket(socketUrl);
    await new Promise((done, fail) => {
        socket.addEventListener("open", done);
        socket.addEventListener("error", () => fail(new Error(`No se pudo conectar a ${socketUrl}`)));
    });
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
    });
    const send = (method, params = {}) => new Promise((done) => {
        const id = nextId++;
        pending.set(id, done);
        socket.send(JSON.stringify({ id, method, params }));
    });
    return { send, close: () => socket.close() };
}

async function readPanel(send) {
    const reply = await send("Runtime.evaluate", { expression: PANEL_STATE_EXPRESSION, returnByValue: true });
    return reply.result?.result?.value ?? { status: null, report: null };
}

/** Espera al informe consultando el panel cada `POLL_INTERVAL_MS`; corta con error a los `SAFETY_TIMEOUT_MS`. */
async function waitForReport(send) {
    const deadline = Date.now() + SAFETY_TIMEOUT_MS;
    let lastStatus = null;
    while (Date.now() < deadline) {
        const { status, report } = await readPanel(send);
        if (report) return report;
        if (status !== lastStatus) console.log(status ?? "(sin panel todavía)");
        lastStatus = status;
        await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`La medición no terminó en el tope de seguridad. Último estado: ${lastStatus}`);
}

async function closeBrowser(browser, debugPort) {
    try {
        const { webSocketDebuggerUrl } = await (await fetch(`http://${LOOPBACK_HOST}:${debugPort}/json/version`)).json();
        const session = await openSession(webSocketDebuggerUrl);
        session.send("Browser.close");
        await sleep(BROWSER_CLOSE_MS);
        session.close();
    } catch {
        await sleep(BROWSER_CLOSE_MS);
    }
    killTree(browser);
}

/**
 * Compara la cabecera del informe (`src/bench/benchReport.js`) con `REFERENCE`.
 * @param {string} report
 * @returns {string[]} motivos por los que la medición no vale; vacío si vale
 */
export function headerProblems(report) {
    const problems = [];
    const screen = report.match(/Pantalla: canvas (\d+) x (\d+) px, devicePixelRatio ([\d.]+)/);
    const renderer = report.match(/Renderizador: (.*)/)?.[1] ?? "";
    if (!screen) problems.push("la cabecera no trae la línea de pantalla");
    else {
        const [, width, height, pixelRatio] = screen;
        if (Number(width) !== REFERENCE.canvasWidth || Number(height) !== REFERENCE.canvasHeight) {
            problems.push(`el canvas es ${width} x ${height} y tiene que ser ${REFERENCE.canvasWidth} x ${REFERENCE.canvasHeight}`);
        }
        if (Number(pixelRatio) !== REFERENCE.devicePixelRatio) {
            problems.push(`el devicePixelRatio es ${pixelRatio} y tiene que ser ${REFERENCE.devicePixelRatio}`);
        }
    }
    if (!renderer.includes(REFERENCE.rendererMark)) {
        problems.push(`el renderizador es "${renderer.trim() || "desconocido"}" y tiene que decir ${REFERENCE.rendererMark}`);
    }
    return problems;
}

const twoDigits = (value) => String(value).padStart(2, "0");

/** Fecha y hora local como `AAAA-MM-DD HH:MM`. */
function localTimestamp(date) {
    return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/** Cuerpo del comentario: el label y la fecha arriba y el informe plegado en un `<details>`. */
export function commentBody({ label, report, date }) {
    return [
        `**${label}** — ${localTimestamp(date)}`, "",
        "<details><summary>Informe <code>?bench=1</code></summary>", "", report, "", "</details>", "",
    ].join("\n");
}

function publish(issue, body, workDirectory) {
    const bodyFile = join(workDirectory, "comment.md");
    writeFileSync(bodyFile, body);
    const result = spawnSync("gh", ["issue", "comment", String(issue), "--body-file", bodyFile], {
        cwd: REPOSITORY_ROOT, encoding: "utf8", env: environmentWithoutPathQuotes(),
    });
    if (result.status !== 0) throw new Error(`gh issue comment falló: ${(result.stderr || result.error?.message || "").trim()}`);
    console.log(result.stdout.trim());
}

async function measure(browserPath, workDirectory) {
    const { server, port } = await startHttpServer();
    try {
        const url = `http://${LOOPBACK_HOST}:${port}/${BENCH_QUERY}`;
        const { browser, debugPort, pageSocketUrl } = await startBrowser(browserPath, url, join(workDirectory, "profile"));
        try {
            const session = await openSession(pageSocketUrl);
            try {
                return await waitForReport(session.send);
            } finally {
                session.close();
            }
        } finally {
            await closeBrowser(browser, debugPort);
        }
    } finally {
        killTree(server);
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const issue = Number.parseInt(options.issue, 10);
    if (!Number.isInteger(issue)) throw new Error("Falta --issue <n>");
    if (typeof options.label !== "string") throw new Error('Falta --label "<texto>"');
    const workDirectory = mkdtempSync(join(tmpdir(), "bench-run-"));
    try {
        const report = await measure(options.browser ?? DEFAULT_BROWSER, workDirectory);
        console.log(report);
        const problems = headerProblems(report);
        if (problems.length > 0) throw new Error(`No se publica: la medición no corrió en la máquina de referencia (${problems.join("; ")})`);
        publish(issue, commentBody({ label: options.label, report, date: new Date() }), workDirectory);
    } finally {
        rmSync(workDirectory, { recursive: true, force: true, maxRetries: PROFILE_REMOVE_RETRIES, retryDelay: START_RETRY_MS });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
