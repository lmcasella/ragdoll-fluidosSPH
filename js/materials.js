/**
 * Densidad areal del agua en la rebanada 2D (kg/m²): `σ_w = ρ_w · b`, con espesor equivalente b = 12 mm.
 * Ver docs/design/14-agua.md §14.1.
 */
export const SIGMA_W = 12.0;

/**
 * Gravedad específica (`SG`) de cada material: la masa de fluido es `SG · σ_w · A`. `c` es el calor
 * específico (J/(kg·K)) y `mu` la viscosidad dinámica (Pa·s) a 20 °C.
 * Valores de referencia de la literatura, a confirmar por physics-reviewer.
 */
export const MATERIALS = {
    water: { SG: 1.0, c: 4186, mu: 1.0e-3 },
    acid: { SG: 1.05 },
    honey: { SG: 1.42, mu: 10 },
    lava: { SG: 2.6 },
};
