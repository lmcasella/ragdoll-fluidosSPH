/** Bits de un canal de color de 8 bits. */
const BITS_PER_CHANNEL = 8;

/** Bytes de un color RGBA en el buffer de color del motor. */
export const COLOR_BYTES = 4;

/**
 * Tinte de PIXI (`0xRRGGBB`) a partir de un color de tres bytes, por ejemplo uno del buffer de color del motor.
 * @param {number} red de 0 a 255
 * @param {number} green de 0 a 255
 * @param {number} blue de 0 a 255
 * @returns {number}
 */
export function tintOf(red, green, blue) {
    return (red << (2 * BITS_PER_CHANNEL)) | (green << BITS_PER_CHANNEL) | blue;
}
