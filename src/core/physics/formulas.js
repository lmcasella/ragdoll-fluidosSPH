import { GRAVITY, KELVIN_OFFSET, STEFAN_BOLTZMANN } from "./constants.js";

/**
 * Viscosidad dinámica de una mezcla por la regla logarítmica de Arrhenius: `ln μ = X ln μ_soluto + (1 − X) ln μ_solvente`.
 * @param {number} fraction fracción del soluto, de 0 (solvente puro) a 1 (soluto puro)
 * @param {number} logViscositySolute logaritmo natural de la viscosidad del soluto, con la viscosidad en Pa·s
 * @param {number} logViscositySolvent logaritmo natural de la viscosidad del solvente, con la viscosidad en Pa·s
 * @returns {number} en Pa·s
 */
export function mixtureViscosity(fraction, logViscositySolute, logViscositySolvent) {
    return Math.exp(fraction * logViscositySolute + (1 - fraction) * logViscositySolvent);
}

/**
 * Cuarta potencia de una temperatura absoluta, la que entra en la ley de Stefan–Boltzmann.
 * @param {number} celsius temperatura, en °C
 * @returns {number} en K⁴
 */
export function kelvinFourthPower(celsius) {
    return (celsius + KELVIN_OFFSET) ** 4;
}

/**
 * Flujo neto de calor por radiación de una superficie gris contra el ambiente: `ε σ (T⁴ − T_a⁴)`. Positivo si la superficie
 * está más caliente que el ambiente.
 * @param {number} emissivity emisividad `ε`, de 0 a 1
 * @param {number} celsius temperatura de la superficie, en °C
 * @param {number} ambientKelvinFourth cuarta potencia de la temperatura ambiente, de `kelvinFourthPower`, en K⁴
 * @returns {number} en W/m²
 */
export function radiativeHeatFlux(emissivity, celsius, ambientKelvinFourth) {
    return emissivity * STEFAN_BOLTZMANN * (kelvinFourthPower(celsius) - ambientKelvinFourth);
}

/**
 * Recorta una transferencia de energía a un máximo en módulo, conservando su signo: evita pasar el equilibrio en un paso.
 * @param {number} amount energía a transferir, en J (con signo)
 * @param {number} limit máximo en módulo, en J, no negativo
 * @returns {number} en J
 */
export function limitTransfer(amount, limit) {
    return Math.abs(amount) > limit ? Math.sign(amount) * limit : amount;
}

/**
 * Tiempo que tarda en caer una altura con velocidad vertical inicial hacia arriba: raíz positiva de
 * `−fallHeight = v t − g t² / 2`.
 * @param {number} initialUpwardSpeed velocidad vertical inicial, en m/s, positiva hacia arriba
 * @param {number} fallHeight desnivel a caer, en m, no negativo
 * @param {number} [gravity] aceleración de la gravedad, en m/s²
 * @returns {number} en s
 */
export function fallTime(initialUpwardSpeed, fallHeight, gravity = GRAVITY) {
    return (initialUpwardSpeed + Math.sqrt(initialUpwardSpeed * initialUpwardSpeed + 2 * gravity * fallHeight)) / gravity;
}
