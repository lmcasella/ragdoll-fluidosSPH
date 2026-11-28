// Ejecuta el index.js en Node, con LiquidFun real y todo lo del navegador simulado, para probar
// gameplay de punta a punta: `const game = await loadGame()`, `game.setPad(0, { buttons: [0] })`, `game.frames(60)`.
// Hay un juego por llamada a loadGame; el estado del juego está en `game.state` (globalThis.game del script).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WEAPONS } from "../../src/combat/weapons.js";
import { inert } from "./inert.js";
import { FakeElement } from "./fake-dom.js";
import { installFakePixi } from "./fake-pixi.js";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);

export const FRAME_MS = 1000 / 60;

/** Pone en el inventario de cada jugador todas las armas de la tabla con el tanque lleno, como si ya se hubieran recogido. */
export function giveAllWeapons(game) {
    for (const player of game.state.players) {
        for (const w of WEAPONS) player.tanks.set(w.id, w.tank);
    }
}

/**
 * Quita las cajas del juego (sin pedazos) y deja los ítems sueltos y activos en su lugar original, para las pruebas que no son
 * de las cajas y necesitan el escenario despejado o el ítem a mano. El sistema queda sin cajas aunque empiece otra ronda.
 */
export function removeCrates(game) {
    game.state.crates.dispose();
    game.state.pickups.reset();
}

/**
 * Carga el juego en Node. `options.assets` mapea una URL del juego (por ejemplo "./assets/robot.rag.json") a una
 * función que recibe el JSON leído y devuelve el JSON a usar: sirve para probar cambios al rig solo en memoria.
 * `options.audioContext` es el constructor de un `AudioContext` falso (ver `tests/helpers/fake-audio.js`); sin él el
 * juego corre sin `AudioContext`, como en Node. El juego arranca en `playing`, como si se hubiera elegido Jugar con la
 * elección por defecto del menú (o la que pidan `?bot=` y `localStorage`), para que las pruebas de gameplay no pasen
 * por el título y la cuenta regresiva; con `options.intro` arranca en `title`, como en el navegador.
 * `options.storage` es el `localStorage` falso del juego (con `getItem` y `setItem`); sin él no hay almacenamiento.
 * `game.hudTexts` y `game.laserStrokes` leen lo dibujado en el último frame (panel de debug HTML y mira láser en PIXI).
 * El `PIXI` es el falso de `tests/helpers/fake-pixi.js`; el DOM falso tiene `document.querySelectorAll` por etiqueta.
 * Sin `intro`, la asignación de controles es la clásica de las pruebas: el teclado y el gamepad 0 en J1, el gamepad 1 en J2.
 * `options.map` es el mapa de la partida ("classic" por defecto, o "infinite"); se escribe en el menú antes de arrancar.
 */
export async function loadGame(options = {}) {
    globalThis.__TEST_HOOKS__ = true;
    globalThis.Box2D = require("../../vendor/liquidfun.js");
    installFakePixi();

    const handlers = {};
    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener: (type, fn) => (handlers[type] ??= []).push(fn),
    };
    class FakeCanvas extends FakeElement {
        constructor() {
            super("canvas");
        }
    }
    const body = new FakeElement("body");
    const gameContainer = body.appendChild(new FakeElement("div"));
    globalThis.document = {
        body,
        getElementById: (id) => (id === "gameContainer" ? gameContainer : inert()),
        createElement: (tag) => (tag === "canvas" ? new FakeCanvas() : new FakeElement(tag)),
        querySelectorAll: (tag) => body.findAllByTag(tag),
    };

    if (options.storage) globalThis.localStorage = options.storage;
    else delete globalThis.localStorage;

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

    const source = readFileSync(new URL("index.js", root), "utf8").replace(
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

    if (!options.intro) {
        globalThis.game.menu.values.map = options.map ?? "classic";
        globalThis.game.asignacion.assignment = { keyboard: 0, "pad:0": 0, "pad:1": 1 };
        globalThis.game.arrancarPartida();
        globalThis.game.match.state = "playing";
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
        /** Líneas de texto que muestra el panel de debug HTML en el último frame (vacío con el menú cerrado). */
        get hudTexts() {
            const { root, body } = globalThis.game.debugPanel;
            return root.hidden ? [] : body.textContent.split("\n");
        },
        /** Trazos de la mira láser de los dos jugadores en el último frame. */
        get laserStrokes() {
            return globalThis.game.aimLaserView.graphics.reduce((total, graphics) => total + graphics.strokes.length, 0);
        },
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
        /** Desconecta el gamepad k; los que siguen conectados se renumeran por posición. */
        removePad(k) {
            padState[k] = undefined;
            refreshPads();
        },
        emit(type, event = {}) {
            (handlers[type] ?? []).forEach((fn) => fn(event));
        },
    };
}
