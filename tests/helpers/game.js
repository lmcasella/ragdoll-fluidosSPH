// Ejecuta el script de index.html en Node, con LiquidFun real y todo lo del navegador simulado, para probar
// gameplay de punta a punta: `const game = await loadGame()`, `game.setPad(0, { buttons: [0] })`, `game.frames(60)`.
// Hay un juego por llamada a loadGame; el estado del juego está en `game.state` (globalThis.game del script).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WEAPONS } from "../../js/weapons.js";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);

// Objeto que acepta cualquier llamada y propiedad sin hacer nada (canvas, contexto 2D, nodos del DOM)
function inert(stored = {}) {
    const noop = () => undefined;
    return new Proxy(noop, {
        get: (_, prop) => (prop in stored ? stored[prop] : noop),
        set: (_, prop, value) => {
            stored[prop] = value;
            return true;
        },
    });
}

export const FRAME_MS = 1000 / 60;

/** Pone en el inventario de cada jugador todas las armas de la tabla con el tanque lleno, como si ya se hubieran recogido. */
export function giveAllWeapons(game) {
    for (const player of game.state.players) {
        for (const w of WEAPONS) player.tanks.set(w.id, w.tank);
    }
}

/**
 * Carga el juego en Node. `options.assets` mapea una URL del juego (por ejemplo "./assets/robot.rag.json") a una
 * función que recibe el JSON leído y devuelve el JSON a usar: sirve para probar cambios al rig solo en memoria.
 * `options.audioContext` es el constructor de un `AudioContext` falso (ver `tests/helpers/fake-audio.js`); sin él el
 * juego corre sin `AudioContext`, como en Node.
 */
export async function loadGame(options = {}) {
    globalThis.__TEST_HOOKS__ = true;
    globalThis.Box2D = require("../../vendor/liquidfun.js");
    globalThis.PIXI = {
        Container: class {
            addChild(child) {
                return child;
            }
            removeChild() {}
            destroy() {}
        },
    };

    const handlers = {};
    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener: (type, fn) => (handlers[type] ??= []).push(fn),
    };
    const elements = new Map();
    globalThis.document = {
        getElementById: (id) => {
            if (!elements.has(id)) elements.set(id, inert({ width: 0, height: 0, getContext: () => inert({ createLinearGradient: () => inert() }) }));
            return elements.get(id);
        },
    };

    let pads = [];
    Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => pads }, configurable: true });

    let clock = 1000; // ms
    Object.defineProperty(globalThis, "performance", { value: { now: () => clock }, configurable: true, writable: true });

    let pending = null;
    globalThis.requestAnimationFrame = (fn) => {
        pending = fn;
    };
    if (options.audioContext) globalThis.AudioContext = options.audioContext;
    else delete globalThis.AudioContext;
    globalThis.fetch = async (url) => {
        if (String(url).endsWith(".ogg")) {
            return { ok: true, arrayBuffer: async () => ({ url: String(url) }) };
        }
        const text = readFileSync(new URL(String(url), root), "utf8");
        const patch = options.assets?.[String(url)];
        return { json: async () => (patch ? patch(JSON.parse(text)) : JSON.parse(text)) };
    };

    const html = readFileSync(new URL("index.html", root), "utf8");
    const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
        /from "(\.\/[^"]+)"/g,
        (_, path) => `from "${new URL(path, root).href}"`,
    );
    const dir = mkdtempSync(join(tmpdir(), "ragdoll-game-"));
    const file = join(dir, "game.mjs");
    writeFileSync(file, source);
    try {
        await import(pathToFileURL(file).href);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    const padState = [];
    const refreshPads = () => {
        pads = padState.filter(Boolean).map((p) => ({
            connected: true,
            axes: p.axes,
            buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: p.buttons.includes(i) })),
        }));
    };

    return {
        state: globalThis.game,
        handlers,
        get now() {
            return clock / 1000;
        },
        // Un frame de 1/60 s: ejecuta el callback pendiente de requestAnimationFrame
        frame() {
            clock += FRAME_MS;
            const fn = pending;
            pending = null;
            fn(clock);
        },
        // Salto del reloj real sin ejecutar frames (pestaña oculta, pausa del depurador)
        skipTime(seconds) {
            clock += seconds * 1000;
        },
        frames(n) {
            for (let i = 0; i < n; i++) this.frame();
        },
        // Gamepad k (0 = J1) con botones del mapeo "standard" y ejes [lx, ly, rx, ry]; sin argumentos, todo suelto
        setPad(k, { buttons = [], axes = [0, 0, 0, 0] } = {}) {
            padState[k] = { buttons, axes };
            refreshPads();
        },
        emit(type, event = {}) {
            (handlers[type] ?? []).forEach((fn) => fn(event));
        },
    };
}
