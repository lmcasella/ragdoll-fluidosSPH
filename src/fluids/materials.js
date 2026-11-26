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
 * Térmica (docs/design/14-agua.md §14.8, #75): `k` es la conductividad (W/(m·K)) y `temperature` la temperatura
 * (°C) con que nace una partícula. La lava y la piedra son el mismo basalto en dos fases: `c` de la lava es el del
 * líquido y el de la piedra el del sólido; `solidus` (°C) y `latentFusion` `L_f` (J/kg) los tiene la lava y
 * `emissivity` ε las dos. `viscosity` de la lava es `μ(T) = mu0 · 10^((T0 − T)/deltaT)` (Pa·s, T en °C), acotada a
 * `[min, max]`: una aproximación nombrada, la miel (#76) reutiliza el módulo. `heat` son los coeficientes de
 * transferencia: `filmBoiling` `h_b` (basalto contra otro fluido, W/(m²·K)), `convection` `h_a` (al aire),
 * `stefanBoltzmann` (W/(m²·K⁴)) y `shearCoefficient` `C_s` de la difusividad por cizalla entre fluidos iguales
 * (sin calibrar, a la espera de #76: con 0 queda solo la conducción molecular).
 * Ebullición (#112): `boilingPoint` (°C) y `latentVaporization` `L_v` (J/kg a esa temperatura) del agua. El vapor
 * (`steam`) es una parcela con la masa de la partícula de agua de la que vino (`SG` 1), y `rho` (kg/m³) es la
 * densidad del vapor real a 100 °C que fija su empuje y su arrastre en el aire (`air.rho`), con `Cd` de arrastre. Es
 * miscible: al tocar el campo se absorbe con su entalpía. `entrainment` es el coeficiente de arrastre de aire `α` de
 * Morton–Taylor–Turner (#113, rango 0,07–0,13). `heat.condensation` son los `h` (W/(m²·K)) de la condensación por
 * contacto directo del vapor sobre líquidos (agua y ácido) y sobre piedra: el extremo superior de los rangos de las
 * fichas 7 (10⁴–10⁶) y 37 (5·10³–2·10⁴).
 * Adherencia (#77, #214): `honey.viscosityScale` es el factor `F` de la viscosidad efectiva `μ_ef = F · μ` que usan la
 * película miel–cuerpo (`src/fluids/adhesion.js`) y los hilos miel–miel (`src/fluids/viscosity.js`). Es una similitud viscosa-gravitatoria,
 * una aproximación nombrada: con partículas de 9 cm la miel real escurre y se desprende en ~0,02 s, y `F = 100` iguala a esa
 * escala los tiempos de escurrido y de desprendimiento de una película real de 2–3 mm (inestabilidad de Rayleigh–Taylor de
 * película, Fermigier et al. 1992).
 * Valores de referencia de la literatura, a confirmar por physics-analyst.
 */
export const MATERIALS = {
    water: {
        SG: 1.0,
        c: 4186,
        k: 0.6,
        temperature: 20,
        mu: 1.0e-3,
        sigmaE: 5e-3,
        miscible: true,
        species: { H2O: 1 },
        evaporationScale: 3e5,
        boilingPoint: 100,
        latentVaporization: 2.257e6,
    },
    steam: { SG: 1.0, c: 2010, k: 0.025, temperature: 100, rho: 0.598, Cd: 1.0, entrainment: 0.1, miscible: true, species: { H2O: 1 } },
    air: { rho: 1.2 },
    acid: { SG: 1.05, c: 3850, k: 0.6, temperature: 20, mu: 1.17e-3, sigmaE: 32, tint: [50, 255, 50], tintAbsorbance: 2, miscible: true, species: { H2O: 0.92, H2SO4: 0.08 } },
    honey: { SG: 1.42, c: 2400, k: 0.5, temperature: 20, mu: 10, viscosityScale: 100, Cd: 1.2, miscible: false, species: { honey: 1 } },
    lava: {
        SG: 2.6,
        c: 1200,
        k: 1.5,
        temperature: 1150,
        solidus: 1000,
        latentFusion: 4.0e5,
        emissivity: 0.9,
        viscosity: { mu0: 300, T0: 1150, deltaT: 80 / 3, min: 10, max: 1e6 },
        Cd: 1.2,
        miscible: false,
        species: { basalt: 1 },
    },
    stone: { SG: 2.6, c: 1000, k: 1.5, temperature: 20, emissivity: 0.9, Cd: 1.2, miscible: false, species: { basalt: 1 } },
    drag: { box: 2.0, circle: 1.2 },
    heat: {
        filmBoiling: 500,
        convection: 10,
        stefanBoltzmann: 5.670374e-8,
        shearCoefficient: 0,
        condensation: { liquid: 1e6, stone: 2e4 },
    },
};

/**
 * Constante `k_μ` del término viscoso del arrastre sobre una pieza sumergida, `−k_μ μ b v_r`: el orden del arrastre
 * de Stokes–Lamb sobre un cilindro sin el factor logarítmico (docs/design/14-agua.md §14.5, aproximación declarada).
 */
export const K_MU = 4 * Math.PI;

/**
 * Reacciones diseñadas. Cada fila es `{ id, from: { material: kg }, to: { material: kg } }` por kg de avance, con
 * `Σ from = Σ to` y cada especie conservada. Ningún código cambia el material de una masa si no es ejecutando una
 * fila de esta tabla. Hoy son las de las fases (docs/design/14-agua.md §14.8, #75 y #112): `solidify` (la lava sin
 * entalpía de fusión pasa a piedra), `remelt` (la piedra que supera `solidus + L_f` vuelve a lava), `boil` (el agua
 * que llega a `e_v` pasa a vapor) y `condense` (el vapor que baja a `e_l` vuelve a agua); las decide la entalpía de
 * la partícula, en `src/fluids/thermal.js`.
 */
export const REACTIONS = [
    { id: "solidify", from: { lava: 1 }, to: { stone: 1 } },
    { id: "remelt", from: { stone: 1 }, to: { lava: 1 } },
    { id: "boil", from: { water: 1 }, to: { steam: 1 } },
    { id: "condense", from: { steam: 1 }, to: { water: 1 } },
];
