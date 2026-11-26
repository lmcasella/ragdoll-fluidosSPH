import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Captura el juego en un navegador real sin ventana (Chromium con WebGL por SwiftShader) mediante el protocolo
 * DevTools y el `WebSocket` nativo de Node: sin dependencias. Sirve una carpeta con un servidor estático propio (por
 * defecto la del repo; `--root` elige otra) y lo apaga junto con el navegador al terminar.
 *
 * Uso: `node tests/tools/screenshot.js --out <carpeta> [--sizes 1280x720,1000x300] [--query "?bot=1,2"] [opciones]`.
 * - `--keys Enter,ArrowUp`: teclas que se aprietan después de cargar. `--wait 4000`: ms de espera antes de capturar.
 * - `--hooks`: expone `globalThis.game` (los `__TEST_HOOKS__` de `index.js`) para `--eval` y `--probe`.
 * - `--eval "<expresion>"`: se evalúa una vez cargada la página y se muestra su resultado (por ejemplo, arrancar la ronda).
 * - `--probe "<expresion>"`: se evalúa antes de cada captura y se muestra (por ejemplo, para medir capas tras un cambio de tamaño).
 * - `--storage clave=valor`: siembra un valor de `localStorage` antes de cargar (por ejemplo, el mapa del menú).
 * - `--frames N`: modo determinista. Reloj y `requestAnimationFrame` virtuales (16,7 ms por frame) y `Math.random` con semilla
 *   fija: el juego arranca detenido en el frame 5, `--eval` corre ahí, se avanzan exactamente N frames y se captura. Dos corridas del mismo código dan
 *   la misma imagen, así que se pueden comparar entre ramas. Reemplaza a `--keys` y `--wait`.
 * - `--hot`: carga una sola vez en el primer tamaño y cambia el tamaño en caliente, sin recargar, para los siguientes.
 * - `--browser <chrome.exe>`: navegador; si falta, la variable de entorno `SCREENSHOT_BROWSER` o `DEFAULT_BROWSER`.
 */
const DEFAULT_BROWSER = join(process.env.LOCALAPPDATA ?? "", "imput", "Helium", "Application", "chrome.exe");
const REPOSITORY_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DEBUG_PORT = 9333;
const DEVICE_SCALE_FACTOR = 1;
const BROWSER_START_ATTEMPTS = 100;
const BROWSER_START_RETRY_MS = 200;
const PROFILE_RELEASE_MS = 1000;
const PROFILE_REMOVE_RETRIES = 10;
const LOAD_SETTLE_MS = 2500;
const KEY_HOLD_MS = 80;
const KEY_PAUSE_MS = 400;
const RESIZE_SETTLE_MS = 1500;
const RESIZE_FRAMES = 30;
const BOOT_FRAMES = 5;
const FRAME_MS = 1000 / 60;
const VIRTUAL_START_MS = 1000;
const RANDOM_SEED = 20261126;
const DEFAULT_WAIT_MS = 4000;
const DEFAULT_SIZES = "1280x720";
const LOG_LINES_SHOWN = 20;
const ENTER_KEY_CODE = 13;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
};

const KEY_CODES = {
    Enter: ENTER_KEY_CODE,
    Escape: 27,
    Space: 32,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
};

/** Script que se inyecta en cada página del modo determinista: reloj virtual, `requestAnimationFrame` (con cola propia, porque PIXI también lo usa) con tope de frames y `Math.random` con semilla (mulberry32). */
const VIRTUAL_CLOCK_SOURCE = `(() => {
    let now = ${VIRTUAL_START_MS};
    let seed = ${RANDOM_SEED};
    let frames = 0;
    let limit = ${BOOT_FRAMES};
    let held = null;
    let waiter = null;
    Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    performance.now = () => now;
    const realRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const queue = [];
    let nextId = 1;
    let driving = false;
    const drive = () => {
        if (driving || queue.length === 0) return;
        driving = true;
        realRequestAnimationFrame(tick);
    };
    const tick = () => {
        driving = false;
        if (frames >= limit) {
            if (waiter) waiter();
            waiter = null;
            return;
        }
        frames++;
        now += ${FRAME_MS};
        for (const entry of queue.splice(0)) entry.callback(now);
        drive();
    };
    window.requestAnimationFrame = (callback) => {
        const id = nextId++;
        queue.push({ id, callback });
        drive();
        return id;
    };
    window.cancelAnimationFrame = (id) => {
        const index = queue.findIndex((entry) => entry.id === id);
        if (index >= 0) queue.splice(index, 1);
    };
    window.__runFrames = (count) => new Promise((done) => {
        limit = frames + count;
        waiter = done;
        drive();
    });
})();`;

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

function startStaticServer(root) {
    const server = createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        let file = join(root, normalize(pathname));
        try {
            if (statSync(file).isDirectory()) file = join(file, "index.html");
            response.writeHead(200, { "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
            response.end(readFileSync(file));
        } catch {
            response.writeHead(404);
            response.end();
        }
    });
    return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

async function connectToPage(browserPath, profileDirectory) {
    const browser = spawn(browserPath, [
        "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDirectory}`,
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        "--no-first-run", "--autoplay-policy=no-user-gesture-required", "about:blank",
    ], { stdio: "ignore" });
    for (let attempt = 0; attempt < BROWSER_START_ATTEMPTS; attempt++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
            const page = targets.find((target) => target.type === "page");
            if (page) return { browser, pageUrl: page.webSocketDebuggerUrl };
        } catch {
            await sleep(BROWSER_START_RETRY_MS);
        }
    }
    browser.kill();
    throw new Error("El navegador no abrió el puerto de DevTools");
}

async function openSession(pageUrl, logs) {
    const socket = new WebSocket(pageUrl);
    await new Promise((done) => socket.addEventListener("open", done));
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
        if (message.method === "Runtime.consoleAPICalled") {
            logs.push(`${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
        }
        if (message.method === "Runtime.exceptionThrown") {
            const details = message.params.exceptionDetails;
            logs.push(`EXCEPTION: ${details.exception?.description ?? details.text}`);
        }
    });
    const send = (method, params = {}) => new Promise((done) => {
        const id = nextId++;
        pending.set(id, done);
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    return { send, close: () => socket.close() };
}

async function pressKey(send, name) {
    const base = { key: name === "Space" ? " " : name, code: name, windowsVirtualKeyCode: KEY_CODES[name] ?? 0 };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await sleep(KEY_HOLD_MS);
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(KEY_PAUSE_MS);
}

async function setViewport(send, width, height) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: DEVICE_SCALE_FACTOR, mobile: false });
}

async function evaluate(send, expression) {
    const reply = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return reply.result.result?.value ?? reply.result.exceptionDetails?.exception?.description;
}

async function capture(send, file) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    const info = await evaluate(send, "JSON.stringify({ canvases: document.querySelectorAll('canvas').length, width: innerWidth, height: innerHeight })");
    console.log(file, info);
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (typeof options.out !== "string") throw new Error("Falta --out <carpeta>");
    const outputDirectory = resolve(options.out);
    mkdirSync(outputDirectory, { recursive: true });
    const browserPath = options.browser ?? process.env.SCREENSHOT_BROWSER ?? DEFAULT_BROWSER;
    const sizes = (options.sizes ?? DEFAULT_SIZES).split(",").map((size) => size.split("x").map(Number));
    const keys = typeof options.keys === "string" ? options.keys.split(",") : [];
    const waitMs = Number(options.wait ?? DEFAULT_WAIT_MS);
    const frames = Number(options.frames ?? 0);
    const profileDirectory = mkdtempSync(join(tmpdir(), "screenshot-profile-"));
    const logs = [];
    const server = await startStaticServer(typeof options.root === "string" ? resolve(options.root) : REPOSITORY_ROOT);
    const url = `http://127.0.0.1:${server.address().port}/index.html${typeof options.query === "string" ? options.query : ""}`;
    const { browser, pageUrl } = await connectToPage(browserPath, profileDirectory);
    const session = await openSession(pageUrl, logs);
    try {
        const { send } = session;
        if (typeof options.storage === "string") {
            const separator = options.storage.indexOf("=");
            const entry = [options.storage.slice(0, separator), options.storage.slice(separator + 1)];
            await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem(${JSON.stringify(entry[0])}, ${JSON.stringify(entry[1])});` });
        }
        if (options.hooks) await send("Page.addScriptToEvaluateOnNewDocument", { source: "globalThis.__TEST_HOOKS__ = true;" });
        if (frames > 0) await send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_CLOCK_SOURCE });
        for (const [index, [width, height]] of sizes.entries()) {
            const reload = !options.hot || index === 0;
            await setViewport(send, width, height);
            if (reload) {
                await send("Page.navigate", { url });
                await sleep(LOAD_SETTLE_MS);
                for (const key of keys) await pressKey(send, key);
                if (typeof options.eval === "string") console.log("eval:", await evaluate(send, options.eval));
                if (frames > 0) await evaluate(send, `__runFrames(${frames})`);
                else await sleep(waitMs);
            } else if (frames > 0) {
                await evaluate(send, `__runFrames(${RESIZE_FRAMES})`);
            } else {
                await sleep(RESIZE_SETTLE_MS);
            }
            if (typeof options.probe === "string") console.log("probe:", await evaluate(send, options.probe));
            await capture(send, join(outputDirectory, `${width}x${height}.png`));
        }        console.log(logs.slice(0, LOG_LINES_SHOWN).join("\n"));
    } finally {
        session.close();
        browser.kill();
        server.close();
        await sleep(PROFILE_RELEASE_MS);
        try {
            rmSync(profileDirectory, { recursive: true, force: true, maxRetries: PROFILE_REMOVE_RETRIES, retryDelay: BROWSER_START_RETRY_MS });
        } catch (error) {
            console.warn(`No se pudo borrar el perfil temporal ${profileDirectory}: ${error.code}`);
        }
    }
}

await main();
process.exit(0);
