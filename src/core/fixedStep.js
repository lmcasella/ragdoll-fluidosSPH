/** Tope de pasos de física por frame. `STEP_SETTINGS` es de `lib/` y no se edita, por eso el tope vive acá. */
export const MAX_STEPS_PER_FRAME = 2;

/**
 * Cuántos pasos de física corre un frame con paso fijo (patrón "Paso fijo" de `CLAUDE.md`) y qué acumulador queda.
 * Con tope: si tras `maxSteps` pasos todavía sobra tiempo para otro, ese exceso se descarta y queda solo el resto
 * fraccionario, menor que `dt`. Así, en una máquina lenta el juego va más lento que el tiempo real en vez de entrar en
 * espiral (frame lento, más pasos, frame más lento).
 * El resto se calcula restando pasos enteros (no con `%`) y se acota a [0, `stepDuration`) para absorber el redondeo
 * de coma flotante. `discarded` es el tiempo que el tope tiró: quien avance relojes del juego con el `dt` del frame
 * tiene que restárselo, para que no corran más rápido que la física.
 * @param {number} accumulator tiempo pendiente de simular, en s
 * @param {number} stepDuration duración de un paso, en s
 * @param {number} maxSteps tope de pasos por frame
 * @returns {{ steps: number, accumulator: number, discarded: number }} pasos a correr, tiempo pendiente que queda y
 * tiempo descartado por el tope, en s
 */
export function consumeFixedSteps(accumulator, stepDuration, maxSteps) {
    const availableSteps = Math.floor(accumulator / stepDuration);
    const steps = Math.min(availableSteps, maxSteps);
    let remaining = Math.max(0, accumulator - availableSteps * stepDuration);
    if (remaining >= stepDuration) remaining -= stepDuration;
    const discarded = Math.max(0, accumulator - steps * stepDuration - remaining);
    return { steps, accumulator: remaining, discarded };
}
