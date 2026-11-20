/**
 * Densidad areal del agua en la rebanada 2D (kg/m²): `σ_w = ρ_w · b`, con espesor equivalente b = 12 mm.
 * Ver docs/design/14-agua.md §14.1.
 */
export const SIGMA_W = 12.0;

/**
 * Gravedad específica (`SG`) de cada material: la masa de fluido es `SG · σ_w · A`. `c` es el calor
 * específico (J/(kg·K)), `mu` la viscosidad dinámica (Pa·s) a 20 °C, `Cd` el coeficiente de arrastre de la
 * partícula inmiscible y `miscible` si se absorbe en el campo de alturas (docs/design/14-agua.md §14.4).
 * `species` es la fracción másica de cada especie química del material (cada fila suma 1; el ácido es H2SO4 al
 * 8 % m/m) y la usan los invariantes de masa (docs/design/14-agua.md §14.1 y §14.16 G).
 * `sigmaE` es la conductividad eléctrica (S/m) del agua de red y del ácido al 8 %; `tint` (RGB) y `tintAbsorbance`
 * (absorbancia decimal de una columna al 8 %) son el tinte de juego del ácido, que en la realidad es incoloro
 * (docs/design/14-agua.md §14.1 y §14.3, #98).
 * `evaporationScale` (solo el agua) es el factor de aceleración `F_evap` de la evaporación de agua detenida, una
 * aproximación nombrada: la tasa real es de milímetros por día y no se vería en una ronda (docs/design/14-agua.md
 * §14.7b); un material sin este dato no se evapora.
 * Valores de referencia de la literatura, a confirmar por physics-analyst.
 */
export const MATERIALS = {
    water: { SG: 1.0, c: 4186, mu: 1.0e-3, sigmaE: 5e-3, miscible: true, species: { H2O: 1 }, evaporationScale: 3e5 },
    acid: { SG: 1.05, c: 3850, mu: 1.17e-3, sigmaE: 32, tint: [50, 255, 50], tintAbsorbance: 2, miscible: true, species: { H2O: 0.92, H2SO4: 0.08 } },
    honey: { SG: 1.42, mu: 10, Cd: 1.2, miscible: false, species: { honey: 1 } },
    lava: { SG: 2.6, Cd: 1.2, miscible: false, species: { basalt: 1 } },
    drag: { box: 2.0, circle: 1.2 },
};

/**
 * Constante `k_μ` del término viscoso del arrastre sobre una pieza sumergida, `−k_μ μ b v_r`: el orden del arrastre
 * de Stokes–Lamb sobre un cilindro sin el factor logarítmico (docs/design/14-agua.md §14.5, aproximación declarada).
 */
export const K_MU = 4 * Math.PI;

/**
 * Reacciones diseñadas, hoy ninguna. Cada fila es `{ id, from: { material: kg }, to: { material: kg } }` por kg
 * de avance, con `Σ from = Σ to` y cada especie conservada. Ningún código cambia el material de una masa si no es
 * ejecutando una fila de esta tabla.
 */
export const REACTIONS = [];
