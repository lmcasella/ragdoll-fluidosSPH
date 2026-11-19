import { loadGame } from "./game.js";
import { LEVEL } from "../../js/level.js";

/** Botones del mapeo "standard" que usan los duelos: A salta, B golpea, LT bloquea, RT dispara. */
export const BUTTON = { A: 0, B: 1, LT: 6, RT: 7 };

/** x (m) de J1 en los duelos: sobre el piso, entre la plataforma baja (x de 3 a 6 m) y la alta (de 9 a 17 m). */
export const LEFT_X = 6.5;

/** Stick derecho (ejes 2 y 3) hacia la derecha: el robot de J1 mira a +x. */
export const AIM_RIGHT = [0, 0, 1, 0];

/** Stick derecho hacia la izquierda: el robot de J2 mira a -x. */
export const AIM_LEFT = [0, 0, -1, 0];

/**
 * Carga el juego con los dos robots enfrentados a `gap` m sobre el piso de la isla izquierda, sin tocar los datos
 * reales del nivel. Con `gap` mayor que 2,4 m el rival aparece sobre la plataforma alta. J1 mira a +x y J2 a -x; los
 * dos esperan 60 frames quietos.
 * @param {number} gap Distancia horizontal entre los dos robots, m.
 */
export async function startDuel(gap) {
    const real = LEVEL.spawns;
    LEVEL.spawns = [{ x: LEFT_X, flipX: false }, { x: LEFT_X + gap, flipX: true }];
    let game;
    try {
        game = await loadGame();
    } finally {
        LEVEL.spawns = real;
    }
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

/**
 * Ejecuta frames y devuelve los eventos de `melee.hits` que aparecieron, cada uno con el frame en que salió.
 * @param {object} game Resultado de `loadGame`.
 * @param {number} frames Cantidad de frames.
 * @param {(frame: number) => void} [before] Se llama antes de cada frame (para mover los pads).
 * @param {(frame: number) => void} [after] Se llama después de cada frame (para medir).
 */
export function run(game, frames, before = () => {}, after = () => {}) {
    const seen = new Set();
    const events = [];
    for (let f = 0; f < frames; f++) {
        before(f);
        game.frame();
        for (const hit of game.state.melee.hits) {
            if (seen.has(hit)) continue;
            seen.add(hit);
            events.push({ ...hit, frame: f });
        }
        after(f);
    }
    return events;
}

/**
 * Pone los brazos de `ActiveRagdoll.rag` a rastrear llamadas: devuelve cuántas veces se llamó a cada método.
 * @param {object} player Jugador.
 * @param {string[]} methods Métodos de `player.rag` a envolver.
 */
export function spyRag(player, methods) {
    const counts = Object.fromEntries(methods.map((m) => [m, 0]));
    for (const method of methods) {
        const original = player.rag[method].bind(player.rag);
        player.rag[method] = (...args) => {
            counts[method]++;
            return original(...args);
        };
    }
    return counts;
}
