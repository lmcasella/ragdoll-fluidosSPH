/**
 * Constantes y fórmulas de `src/core/physics/` (#307).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAVITY, WATER_DENSITY, KELVIN_OFFSET, STEFAN_BOLTZMANN } from "../src/core/physics/constants.js";
import { mixtureViscosity, kelvinFourthPower, radiativeHeatFlux, limitTransfer, fallTime } from "../src/core/physics/formulas.js";

const TOLERANCE = 1e-9;

test("las constantes físicas tienen su valor", () => {
    assert.equal(GRAVITY, 10);
    assert.equal(WATER_DENSITY, 1000);
    assert.equal(KELVIN_OFFSET, 273.15);
    assert.equal(STEFAN_BOLTZMANN, 5.670374e-8);
});

test("mixtureViscosity da los extremos y la media geométrica", () => {
    const solute = 1000;
    const solvent = 0.001;
    const logSolute = Math.log(solute);
    const logSolvent = Math.log(solvent);
    assert.ok(Math.abs(mixtureViscosity(1, logSolute, logSolvent) - solute) < TOLERANCE * solute);
    assert.ok(Math.abs(mixtureViscosity(0, logSolute, logSolvent) - solvent) < TOLERANCE);
    assert.ok(Math.abs(mixtureViscosity(0.5, logSolute, logSolvent) - Math.sqrt(solute * solvent)) < TOLERANCE);
});

test("radiativeHeatFlux es cero en equilibrio y positivo si está más caliente", () => {
    const ambient = 20;
    const ambientFourth = kelvinFourthPower(ambient);
    assert.equal(radiativeHeatFlux(0.9, ambient, ambientFourth), 0);
    const expected = 0.9 * STEFAN_BOLTZMANN * (kelvinFourthPower(1000) - ambientFourth);
    assert.equal(radiativeHeatFlux(0.9, 1000, ambientFourth), expected);
    assert.ok(radiativeHeatFlux(0.9, 0, ambientFourth) < 0);
});

test("limitTransfer recorta el módulo y conserva el signo", () => {
    assert.equal(limitTransfer(5, 3), 3);
    assert.equal(limitTransfer(-5, 3), -3);
    assert.equal(limitTransfer(2, 3), 2);
    assert.equal(limitTransfer(-2, 3), -2);
});

test("fallTime coincide con la caída libre y con el tiro vertical", () => {
    assert.ok(Math.abs(fallTime(0, 5) - 1) < TOLERANCE, "5 m con g = 10 tardan 1 s");
    const upward = 4;
    const time = fallTime(upward, 0);
    assert.ok(Math.abs(time - (2 * upward) / GRAVITY) < TOLERANCE, "sube y vuelve a la misma altura");
    assert.ok(Math.abs(fallTime(0, 20, 20) - Math.sqrt(2)) < TOLERANCE, "con la gravedad pasada por parámetro");
});
