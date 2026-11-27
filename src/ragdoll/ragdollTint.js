/**
 * Efectos de color del robot (destello de golpe, tinte de mojado y color del jugador) como `tint` de los hijos de
 * `rag.view`, sin suponer que son `Graphics` (ver `docs/design/03-robots.md`). Las figuras se dibujan en blanco, así que el
 * `tint` es el color final.
 */

import { TAU, lerp } from "../core/math/scalar.js";

/** Color del destello de golpe, `[r, g, b]` de 0 a 255. */
const FLASH_COLOR = [255, 40, 40];

/** Color del tinte de mojado, `[r, g, b]` de 0 a 255. */
const WET_COLOR = [40, 220, 255];

/** Frecuencia del parpadeo del tinte de mojado, en Hz. */
const WET_BLINK_HZ = 4;

/** Mezcla media del tinte de mojado y cuánto sube y baja al parpadear (fracciones de 0 a 1). */
const WET_MEAN = 0.35;
const WET_SWING = 0.35;

const HEX_RADIX = 16;
const BITS_PER_CHANNEL = 8;
const CHANNEL_MASK = 0xff;

/**
 * Convierte un color `"#rrggbb"` en `[r, g, b]` de 0 a 255.
 * @param {string} hex
 * @returns {number[]}
 */
export function parseHexColor(hex) {
    const packed = parseInt(hex.slice(1), HEX_RADIX);
    const red = (packed >> (BITS_PER_CHANNEL * 2)) & CHANNEL_MASK;
    const green = (packed >> BITS_PER_CHANNEL) & CHANNEL_MASK;
    const blue = packed & CHANNEL_MASK;
    return [red, green, blue];
}

/**
 * Mezcla del color base hacia el destello y de ahí hacia el tinte de mojado, redondeada por canal.
 * @param {number[]} base color del jugador, `[r, g, b]` de 0 a 255
 * @param {number} flash 0 es el color original y 1 el destello pleno
 * @param {number} wet 0 es seco y 1 el tinte de mojado pleno
 * @returns {number} color `0xRRGGBB`
 */
export function mixTint(base, flash, wet) {
    let packed = 0;
    for (let channel = 0; channel < base.length; channel++) {
        const flashed = lerp(base[channel], FLASH_COLOR[channel], flash);
        const mixed = lerp(flashed, WET_COLOR[channel], wet);
        packed = (packed << BITS_PER_CHANNEL) | Math.round(mixed);
    }
    return packed;
}

/**
 * Mezcla del tinte de mojado de un robot: parpadea mientras está mojado y vale 0 si está seco o muerto.
 * @param {{ wet: boolean, dead: boolean }} player
 * @param {number} now reloj de juego, en s
 */
export function wetBlend(player, now) {
    return player.wet && !player.dead ? WET_MEAN + WET_SWING * Math.sin(now * WET_BLINK_HZ * TAU) : 0;
}

/**
 * Pone en cada pieza el tinte que le toca por su destello y por el mojado. Solo escribe `tint` si cambió.
 * @param {import("./ragdollSync.js").RagdollPart[]} parts
 * @param {{ wet: boolean, dead: boolean, flashAmount: (bodyId: string, now: number) => number }} player
 * @param {number[]} baseColor color del jugador, `[r, g, b]` de 0 a 255
 * @param {number} now reloj de juego, en s
 */
export function tintParts(parts, player, baseColor, now) {
    const wet = wetBlend(player, now);
    for (const part of parts) {
        const tint = mixTint(baseColor, player.flashAmount(part.bodyId, now), wet);
        if (part.tint === tint) continue;
        part.tint = tint;
        part.fill.tint = tint;
    }
}
