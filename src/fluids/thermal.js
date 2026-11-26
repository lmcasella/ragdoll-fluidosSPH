import { MATERIALS, REACTIONS, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "../water/immersion.js";
import { FLUID } from "../combat/weapons.js";
import { PARTICLE } from "./particles.js";
import { Contacts } from "./contacts.js";
import { ORIGIN, SINK } from "./particleStore.js";

/**
 * Datos de la térmica (docs/design/14-agua.md §14.8). `restSpeed` (m/s) y `restTime` (s): la piedra por debajo de esa
 * rapidez durante ese tiempo pasa de `POWDER` a `WALL`. `thickness` es el espesor `b` de la rebanada (m) y
 * `waterDensity` la densidad del agua (kg/m³) con la que sale de `σ_w`. `hotWater` es el color (RGB) al que se
 * acerca el agua a 100 °C, `stone` el color de la piedra fría y `steam` el del vapor y `fog` el de la niebla (el vapor que se enfría pasa del primero al segundo con el título `x`); `maxSteam` es el tope de
 * partículas de vapor vivas (las columnas no emiten más y el excedente espera en `boiled`); `incandescence` son los anclas de color por
 * temperatura (°C, RGB) de docs/design/15-quimica.md §15.1, con interpolación lineal entre ellas y, debajo de la
 * primera, desde el color propio del material desde `glowFrom` (°C).
 */
export const THERMAL = {
    /**
     * Tiempo de juego (#186, docs/design/14-agua.md §14.8): factores de aceleración nombrados que el juego pasa al
     * constructor; los tests físicos usan 1 (tiempo real). `timeScale` multiplica todo intercambio de calor y las
     * pérdidas al aire; `quenchScale` solo el contacto de basalto caliente con agua o ácido (el agua hierve al tocar
     * la lava); `plumeScale` el arrastre de aire del vapor (desaparece en 3–6 s; con el factor, la velocidad de la
     * pluma no baja de la terminal, así el vapor trabado bajo un techo también se disipa). `filmEmission`: el calor del basalto
     * sumergido en una columna sin hervir sale como vapor (ebullición en película) en vez de calentar el agua.
     */
    game: { timeScale: 25, quenchScale: 8000, plumeScale: 30, filmEmission: true },
    restSpeed: 0.05,
    restTime: 0.5,
    waterDensity: 1000,
    hotWater: [160, 210, 255],
    stone: [52, 50, 47],
    steam: [242, 244, 245],
    fog: [255, 255, 255],
    maxSteam: 300,
    glowFrom: 425,
    incandescence: [
        [525, [90, 15, 8]],
        [700, [178, 42, 14]],
        [900, [224, 73, 15]],
        [1000, [255, 106, 19]],
        [1100, [255, 140, 26]],
        [1300, [255, 192, 64]],
    ],
};

const KIND_STRIDE = 8;
const KIND_SLOTS = 256;
const KELVIN = 273.15;

/** `C_a C_b / (C_a + C_b)` con capacidades posiblemente infinitas (meseta del cambio de fase). */
function seriesCapacity(a, b) {
    if (a === Infinity) return b;
    if (b === Infinity) return a;
    return (a * b) / (a + b);
}

/**
 * Térmica de las partículas y de las columnas del campo (docs/design/14-agua.md §14.8, #75). Una vez por paso fijo,
 * después de `evaporation.step`.
 *
 * Cada partícula del store lleva su entalpía específica `e` (`store.enthalpy`, J/kg, 0 a 0 °C). Agua, ácido y miel:
 * `T = e / c`. Basalto (lava y piedra, la misma sustancia en dos fases): sólido hasta `e_s = c_piedra · solidus`,
 * fusión a `solidus` entre `e_s` y `e_s + L_f` y líquido por encima con `c_lava`. La masa de cada partícula es
 * `SG · σ_w · A_p` con `A_p = (1,5 r)²` del radio del sistema.
 *
 * Por paso: (1) intercambio entre vecinas por los contactos de `src/fluids/contacts.js`, `Q = K w ΔT` aplicado como suma de
 * pares antisimétrica, con el limitador de igualar temperaturas dividido por el número de vecinas (basalto contra
 * otro fluido `K = h_b D b`; entre basaltos conducción `k b`; entre fluidos de la misma familia `b (k + ρ c C_s |Δv| D)`,
 * con `C_s` en `MATERIALS.heat`); (2) basalto sumergido (`immersion.submerged`) contra su columna, `h_b P b`, con el
 * mismo limitador, y el basalto al aire pierde `P b [ε σ (T⁴ − T_a⁴) + h_a (T − T_a)]`; las columnas pierden `h_a dx b`
 * por la superficie; (3) fases: la lava sin entalpía de fusión pasa a piedra (fila `solidify` de `REACTIONS`, flag
 * `POWDER`), la piedra en reposo (|v| < `restSpeed` durante `restTime`) pasa a `WALL`, y la que supera `e_s + L_f`
 * vuelve a lava (fila `remelt`, sin flags); (4) color por temperatura y fase.
 *
 * Ebullición (#112, docs/design/14-agua.md §14.8). El agua tiene tramos: líquida hasta `e_l = c_w · 100`, mezcla a
 * 100 °C hasta `e_v = e_l + L_v` y vapor por encima (`c_v`). La partícula de agua que llega a `e_v` pasa a `STEAM`
 * (fila `boil`) y la de vapor que baja a `e_l` vuelve a agua (fila `condense`): la masa no cambia y la energía se
 * conserva por construcción. Las columnas del campo no pasan de 100 °C: el excedente va a `water.boiled[i]` (J) y
 * cuando llega a `m_w L_v` la columna pierde `A_p` de volumen y `m_w e_l` de energía y se crea una partícula `STEAM`
 * en `η + 1,5 r` con `e_v`; a lo sumo una por columna y por paso, y hasta `THERMAL.maxSteam` vivas. Solo emite una
 * columna a 100 °C, así que bajo agua subenfriada el calor queda en el agua. Una columna no emite si quedaría con
 * `h < hMin`. El vapor que toca el campo se absorbe (`Immersion`, es miscible) con su entalpía.
 * Vapor y niebla (#113, docs/design/14-agua.md §14.8). El vapor en el aire pierde `Q = λ m c_v (T − T_a)` con
 * `λ = 2 α w / R` (arrastre de aire de Morton–Taylor–Turner, `w` la velocidad de ascenso y `R = √(ρ_w A_p / (π ρ_s))`
 * el radio del volumen real que representa la parcela), sin bajar de `e_l`; con `e` por debajo de `e_v` es niebla
 * (mezcla de título `x`) y su color va de `THERMAL.steam` a `THERMAL.fog`. El vapor que llega a `e_l` sin haber tocado
 * en ese paso agua, ácido ni piedra se destruye con `SINK.HUMIDITY` (humedad del aire) y su energía `m e_l` va a
 * `lost`: nunca vuelve como gota. Por contacto directo con agua, ácido o piedra fría el vapor intercambia calor
 * (`K = h D b` con `MATERIALS.heat.condensation`, el mismo limitador): el vapor que llega a `e_l` con contacto pasa a
 * agua por la fila `condense`. La piedra a 100 °C o más no intercambia con el vapor (se calienta solo hasta 100 °C).
 * Dinámica del vapor en el aire: el motor ya aplicó −g; se suma el empuje `g ρ_a/ρ_s` como impulso del paso y el
 * arrastre cuadrático `½ ρ_a C_d D |v| v / (ρ_s A_p)` integrado en forma exacta (`v ← v / (1 + k |v| dt)`), con
 * velocidad terminal `√(2 g (ρ_a − ρ_s) A_p / (ρ_a C_d D))`.
 *
 * Si el buffer nativo de contactos no se encuentra, `stats.enabled` queda en falso y el módulo no hace nada.
 * `airLosses` en falso apaga las pérdidas al aire y la superficie (pruebas de intercambio entre partículas).
 * `gravity` (m/s²) llega por constructor, como en `Immersion`.
 *
 * `stats`: `enabled`, `lost` (J que salieron al aire), `E_perdida` (`energyLost()` al final del último paso), `solidified`, `remelted`, `walled`
 * (cambios de fase y de flag), `boiled` (agua que pasó a vapor), `condensed` (vapor que volvió a agua), `emitted`
 * (partículas de vapor creadas por las columnas), `humidity` (niebla disuelta en el aire, `SINK.HUMIDITY`),
 * `steam` (vapores vivos al principio del último paso),
 * `advance` (kg de avance de cada fila de `REACTIONS`, para el invariante I2), `pairs`
 * (contactos del último paso) y `contacts` (offsets hallados por `Contacts`).
 *
 * Monitor de energía (T1): `energy() + energyLost()` es constante. `energy()` suma `m (1 − φ) e` de las partículas
 * vivas, el vapor que ya salió (`evaporation.stats.vapor`), `Σ E dx` de las columnas y el excedente pendiente de
 * ebullición (`Σ boiled`); `energyLost()` suma `lost`, el
 * latente de la evaporación (negativo) y menos el calor de la pérdida inelástica de la absorción, que entra a las
 * columnas sin salir de ninguna partícula. No cuenta lo que se destruye con otra causa que la absorción o la
 * evaporación (recorte, fuera del mundo, daño).
 *
 * Lo que dejan para `src/fluids/viscosity.js`: `temp[i]`, `slotOf[i]` y `kindOf[i]` por índice de partícula del último
 * paso, `walled[slot]` (piedra inmóvil) y los contactos (`contacts.pairA/B/W`, `stats.pairs`).
 */
export class Thermal {
    constructor(system, store, water, immersion = null, { evaporation = null, airLosses = true, gravity = 10, timeScale = 1, quenchScale = 1, plumeScale = 1, filmEmission = false } = {}) {
        this.timeScale = timeScale;
        this.quenchScale = quenchScale;
        this.plumeScale = plumeScale;
        this.filmEmission = filmEmission;
        this.system = system;
        this.store = store;
        this.water = water;
        this.immersion = immersion;
        this.evaporation = evaporation;
        this.airLosses = airLosses;
        this.gravity = gravity;
        this.contacts = new Contacts(system);
        this.ambient = water.config.ambientT;
        const heat = MATERIALS.heat;
        const lava = MATERIALS.lava;
        const stone = MATERIALS.stone;
        const diameter = 1.5 * system.GetRadius();
        const area = diameter * diameter;
        this.diameter = diameter;
        this.thickness = SIGMA_W / THERMAL.waterDensity;
        this.perimeter = 2 * Math.sqrt(Math.PI * area);
        this.filmBoiling = heat.filmBoiling;
        this.convection = heat.convection;
        this.stefan = heat.stefanBoltzmann;
        this.cLiquid = lava.c;
        this.cSolid = stone.c;
        this.solidus = lava.solidus;
        this.eSolid = stone.c * lava.solidus;
        this.eLiquid = this.eSolid + lava.latentFusion;
        this.kindLava = FLUID.LAVA;
        this.kindStone = FLUID.STONE;
        this.kindWater = FLUID.WATER;
        this.kindSteam = FLUID.STEAM;
        this.kindAcid = FLUID.ACID;
        const liquid = MATERIALS.water;
        const steam = MATERIALS.steam;
        this.boilingPoint = liquid.boilingPoint;
        this.eBoil = liquid.c * liquid.boilingPoint;
        this.eVapor = this.eBoil + liquid.latentVaporization;
        this.cVapor = steam.c;
        this.cWater = liquid.c;
        this.steamForce = (this.gravity * MATERIALS.air.rho) / steam.rho;
        this.steamDrag = (0.5 * MATERIALS.air.rho * steam.Cd * diameter) / (steam.rho * area);
        this.area = area;
        this.steamTerminal = Math.sqrt(Math.max(0, this.steamForce - this.gravity) / this.steamDrag);
        this.entrainment = steam.entrainment;
        this.plumeRadius = Math.sqrt((THERMAL.waterDensity * area) / (Math.PI * steam.rho));
        this.wetting = new Uint8Array(KIND_SLOTS);
        this.steamPair = new Uint8Array(KIND_STRIDE * KIND_STRIDE);
        this.mass = new Float64Array(KIND_SLOTS);
        this.family = new Uint8Array(KIND_SLOTS);
        this.c = new Float64Array(KIND_SLOTS);
        this.emissivity = new Float64Array(KIND_SLOTS);
        this.ambientEnthalpy = new Float64Array(KIND_SLOTS);
        this.known = new Uint8Array(KIND_SLOTS);
        this.exchange = new Float64Array(KIND_STRIDE * KIND_STRIDE);
        this.shear = new Float64Array(KIND_STRIDE * KIND_STRIDE);
        const names = {};
        for (const [kind, entry] of Object.entries(KIND_MATERIAL)) {
            const id = Number(kind);
            if (id >= KIND_STRIDE) throw new Error("Thermal: id de material fuera de KIND_STRIDE");
            const material = entry.material;
            names[Object.keys(MATERIALS).find((name) => MATERIALS[name] === material)] = id;
            this.known[id] = 1;
            this.mass[id] = material.SG * SIGMA_W * area;
            this.c[id] = material.c;
            this.emissivity[id] = material.emissivity ?? 0;
            this.family[id] = material === lava ? 1 : material === stone ? 2 : 0;
            this.ambientEnthalpy[id] = this.enthalpyAt(id, this.ambient);
            store.enthalpyInit[id] = this.enthalpyAt(id, material.temperature);
        }
        for (const [a, ma] of Object.entries(KIND_MATERIAL)) {
            for (const [b, mb] of Object.entries(KIND_MATERIAL)) {
                const i = Number(a) * KIND_STRIDE + Number(b);
                if (Number(a) === this.kindSteam || Number(b) === this.kindSteam) continue;
                const basalt = (this.family[a] > 0) + (this.family[b] > 0);
                const kMean = 0.5 * (ma.material.k + mb.material.k);
                const watery = [this.kindWater, this.kindAcid].includes(Number(a)) || [this.kindWater, this.kindAcid].includes(Number(b));
                if (basalt === 1) this.exchange[i] = heat.filmBoiling * diameter * this.thickness * (watery ? quenchScale : timeScale);
                else this.exchange[i] = this.thickness * kMean * timeScale;
                const fluids = this.family[a] !== 2 && this.family[b] !== 2 && (basalt === 0 || basalt === 2);
                if (fluids && heat.shearCoefficient > 0) {
                    const rhoC = 0.5 * (ma.material.SG * THERMAL.waterDensity * ma.material.c + mb.material.SG * THERMAL.waterDensity * mb.material.c);
                    this.shear[i] = this.thickness * rhoC * heat.shearCoefficient * diameter * timeScale;
                }
            }
        }
        const condensation = heat.condensation;
        for (const kind of [this.kindWater, this.kindAcid, this.kindStone]) {
            const h = kind === this.kindStone ? condensation.stone : condensation.liquid;
            this.wetting[kind] = 1;
            this.exchange[this.kindSteam * KIND_STRIDE + kind] = h * diameter * this.thickness;
            this.exchange[kind * KIND_STRIDE + this.kindSteam] = h * diameter * this.thickness;
            this.steamPair[this.kindSteam * KIND_STRIDE + kind] = 1;
            this.steamPair[kind * KIND_STRIDE + this.kindSteam] = 1;
        }
        this.reactions = {};
        for (const row of REACTIONS) {
            const from = names[Object.keys(row.from)[0]];
            const to = names[Object.keys(row.to)[0]];
            if (from === undefined || to === undefined) continue;
            this.reactions[row.id] = { id: row.id, from, to };
        }
        const capacity = Math.max(system.GetMaxParticleCount(), 1);
        this.slotOf = new Int32Array(capacity);
        this.kindOf = new Uint8Array(capacity);
        this.temp = new Float64Array(capacity);
        this.heatCap = new Float64Array(capacity);
        this.effMass = new Float64Array(capacity);
        this.neighbors = new Int16Array(capacity);
        this.submergedMark = new Uint8Array(capacity);
        this.wet = new Uint8Array(capacity);
        const slots = store.capacity;
        this.seen = new Uint32Array(slots);
        this.restTime = new Float32Array(slots);
        this.walled = new Uint8Array(slots);
        this.altitude = new Float32Array(slots);
        this.altitudeGeneration = new Uint32Array(slots);
        this.tinted = new Uint8Array(slots);
        this.base = new Uint8Array(3 * slots);
        this.steamCount = 0;
        this.def = new Box2D.b2ParticleDef();
        this.at = new Box2D.b2Vec2(0, 0);
        this.velocity = new Box2D.b2Vec2(0, 0);
        this.color = new Box2D.b2ParticleColor(THERMAL.steam[0], THERMAL.steam[1], THERMAL.steam[2], 255);
        this.def.set_color(this.color);
        store.thermal = true;
        this.reset();
    }

    /** Libera los objetos nativos de trabajo. */
    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.at);
        Box2D.destroy(this.velocity);
        Box2D.destroy(this.color);
    }

    /** Pone en cero las estadísticas. */
    reset() {
        this.stats = {
            enabled: !this.contacts.failed,
            lost: 0,
            E_perdida: 0,
            solidified: 0,
            remelted: 0,
            walled: 0,
            boiled: 0,
            condensed: 0,
            emitted: 0,
            humidity: 0,
            steam: 0,
            advance: Object.fromEntries(REACTIONS.map((row) => [row.id, 0])),
            pairs: 0,
            contacts: this.contacts.stats,
        };
    }

    /** Entalpía específica (J/kg) del material `kind` a la temperatura `T` (°C). */
    enthalpyAt(kind, T) {
        if (kind === this.kindWater) return T <= this.boilingPoint ? this.cWater * T : this.eVapor + this.cVapor * (T - this.boilingPoint);
        if (kind === this.kindSteam) return this.eVapor + this.cVapor * Math.max(0, T - this.boilingPoint);
        if (this.family[kind] === 0) return this.c[kind] * T;
        if (T <= this.solidus) return this.cSolid * T;
        return this.eLiquid + this.cLiquid * (T - this.solidus);
    }

    /**
     * Temperatura (°C) del material `kind` con entalpía `e` (J/kg); en la fusión del basalto vale el solidus y en la
     * mezcla del agua, 100 °C. Agua y vapor comparten los tramos: líquido, mezcla y vapor.
     */
    temperature(kind, e) {
        if (kind === this.kindWater || kind === this.kindSteam) {
            if (e >= this.eVapor) return this.boilingPoint + (e - this.eVapor) / this.cVapor;
            return e > this.eBoil ? this.boilingPoint : e / this.cWater;
        }
        if (kind === this.kindAcid) return Math.min(this.boilingPoint, e / this.c[kind]);
        if (this.family[kind] === 0) return e / this.c[kind];
        if (e <= this.eSolid) return e / this.cSolid;
        if (e >= this.eLiquid) return this.solidus + (e - this.eLiquid) / this.cLiquid;
        return this.solidus;
    }

    /** Fracción fundida del basalto con entalpía `e`, de 0 (sólido) a 1 (líquido). */
    meltFraction(e) {
        return Math.min(1, Math.max(0, (e - this.eSolid) / (this.eLiquid - this.eSolid)));
    }

    /** Calor específico sensible (J/(kg·K)) de la partícula; infinito en la meseta de fusión. */
    specificHeat(kind, e) {
        if (kind === this.kindWater || kind === this.kindSteam) {
            if (e >= this.eVapor) return this.cVapor;
            return e > this.eBoil ? Infinity : this.cWater;
        }
        if (kind === this.kindAcid && e >= this.c[kind] * this.boilingPoint) return Infinity;
        if (this.family[kind] === 0) return this.c[kind];
        if (e < this.eSolid) return this.cSolid;
        if (e <= this.eLiquid) return Infinity;
        return this.cLiquid;
    }

    /** Energía de las partículas vivas, el vapor que ya salió y las columnas (J). Ver el monitor de la clase. */
    energy() {
        const { store, water } = this;
        let sum = 0;
        for (let slot = 0; slot < store.capacity; slot++) {
            if (store.alive[slot] === 0) continue;
            sum += this.mass[store.kind[slot]] * (1 - store.evaporated[slot]) * store.enthalpy[slot];
        }
        return sum + (this.evaporation?.stats.vapor ?? 0) + water.energy() + this.boiledEnergy();
    }

    /** Excedente de ebullición pendiente de las columnas (J): lo que pasó de 100 °C y todavía no salió como vapor. */
    boiledEnergy() {
        const { boiled, N } = this.water;
        let sum = 0;
        for (let i = 0; i < N; i++) sum += boiled[i];
        return sum;
    }

    /** `E_perdida` (J): lo que salió al aire, más el latente de la evaporación, menos el calor inelástico de la absorción. */
    energyLost() {
        return this.stats.lost + (this.evaporation?.stats.latent ?? 0) - (this.immersion?.stats.inelastic ?? 0);
    }

    /** Avanza la térmica un paso fijo `dt` (s). */
    step(dt) {
        const { system, store, stats } = this;
        const total = system.GetParticleCount();
        if (total === 0) {
            stats.pairs = 0;
            this.steamCount = 0;
            stats.steam = 0;
            if (stats.enabled) this.boilColumns();
            return;
        }
        const count = this.contacts.pairs(total);
        stats.enabled = count >= 0;
        if (!stats.enabled) return;
        stats.pairs = count;
        this.gather(total);
        this.exchangePairs(count, dt);
        this.condenseOnBodies(total, dt);
        this.exchangeColumns(total, dt);
        if (this.airLosses) {
            this.loseToAir(total, dt);
            this.loseSteam(total, dt);
            this.loseSurface(dt);
        }
        this.phases(total, dt);
        this.steamInAir(total, dt);
        this.boilColumns();
        stats.E_perdida = this.energyLost();
    }

    /**
     * Empuje del aire y arrastre cuadrático sobre cada vapor vivo, como impulso del paso `dt`. El motor ya aplicó −g;
     * se suma `g ρ_a/ρ_s` y el arrastre, `v ← v / (1 + k |v₀| dt)` con `k = ½ ρ_a C_d D / (ρ_s A_p)`, exacto para el
     * arrastre solo. `v₀` es la velocidad del principio del paso (la actual con la `g dt` del motor deshecha): así
     * el régimen permanente da exactamente la velocidad terminal, sin sesgo de primer orden. Cuenta los vapores
     * vivos en `steamCount` y `stats.steam`.
     */
    steamInAir(total, dt) {
        const { store, stats } = this;
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        let count = 0;
        for (let i = 0; i < total; i++) {
            const slot = this.slotOf[i];
            if (slot < 0 || store.kind[slot] !== this.kindSteam) continue;
            count++;
            const vx = heap[vel + 2 * i];
            const vy = heap[vel + 2 * i + 1];
            const f = 1 / (1 + this.steamDrag * Math.hypot(vx, vy + this.gravity * dt) * dt);
            heap[vel + 2 * i] = vx * f;
            heap[vel + 2 * i + 1] = (vy + this.steamForce * dt) * f;
        }
        this.steamCount = count;
        stats.steam = count;
    }

    /**
     * Ebullición de las columnas: la que pasaría de 100 °C queda en 100 °C y el excedente (J) va a `water.boiled`;
     * cuando llega a `m_w L_v` y la columna está a 100 °C, pierde `A_p` de volumen y `m_w e_l` de energía (con su
     * velocidad) y se crea un `STEAM` con `e_v` sobre la superficie. Una por columna y por paso, hasta el tope.
     */
    boilColumns() {
        const { water, stats } = this;
        const { h, q, E, boiled, dx } = water;
        const { hDry, hMin } = water.config;
        const mass = this.mass[this.kindWater];
        const batch = mass * (this.eVapor - this.eBoil);
        const dh = this.area / dx;
        const heatE = SIGMA_W * this.cWater * this.boilingPoint;
        for (let i = water.i0; i < water.i1; i++) {
            const hh = h[i];
            if (hh <= hDry) continue;
            const full = heatE * hh;
            const excess = E[i] - full;
            if (excess > 0) {
                E[i] = full;
                boiled[i] += excess * dx;
            }
            const saturated = E[i] >= full * (1 - 1e-9);
            const eColumn = saturated ? this.eBoil : E[i] / (SIGMA_W * hh);
            const cost = saturated ? batch : mass * (this.eVapor - eColumn);
            if (boiled[i] < cost || this.steamCount >= THERMAL.maxSteam || hh - dh < hMin || (!saturated && !this.filmEmission)) continue;
            const u = q[i] / hh;
            if (this.emit(water.center(i), water.b[i] + hh - dh + 1.5 * this.system.GetRadius(), u) < 0) continue;
            h[i] = hh - dh;
            q[i] = u * h[i];
            E[i] -= (mass * eColumn) / dx;
            boiled[i] -= cost;
            this.steamCount++;
            stats.emitted++;
        }
    }

    /** Crea un vapor en `(x, y)` con velocidad horizontal `u` y entalpía `e_v`; devuelve su índice o −1. */
    emit(x, y, u) {
        this.at.set_x(x);
        this.at.set_y(y);
        this.def.set_position(this.at);
        this.velocity.set_x(u);
        this.velocity.set_y(0);
        this.def.set_velocity(this.velocity);
        return this.store.create(this.def, { kind: this.kindSteam, origin: ORIGIN.STEAM, enthalpy: this.eVapor });
    }

    /** Temperatura, capacidad y vecinas de cada partícula viva conocida, por índice. */
    gather(total) {
        const { store } = this;
        for (let i = 0; i < total; i++) {
            const slot = store.slotAt(i);
            this.neighbors[i] = 0;
            this.submergedMark[i] = 0;
            this.wet[i] = 0;
            if (slot < 0 || store.alive[slot] === 0 || this.known[store.kind[slot]] === 0) {
                this.slotOf[i] = -1;
                continue;
            }
            const kind = store.kind[slot];
            const e = store.enthalpy[slot];
            this.slotOf[i] = slot;
            this.kindOf[i] = kind;
            this.temp[i] = this.temperature(kind, e);
            this.effMass[i] = this.mass[kind] * Math.max(1e-3, 1 - store.evaporated[slot]);
            this.heatCap[i] = this.specificHeat(kind, e) * this.effMass[i];
        }
    }

    /** Calor entre partículas vecinas, en paralelo sobre las temperaturas del principio del paso. */
    exchangePairs(count, dt) {
        const { store, contacts } = this;
        const { pairA, pairB, pairW } = contacts;
        for (let c = 0; c < count; c++) {
            if (this.slotOf[pairA[c]] < 0 || this.slotOf[pairB[c]] < 0) continue;
            this.neighbors[pairA[c]]++;
            this.neighbors[pairB[c]]++;
        }
        const shearOn = MATERIALS.heat.shearCoefficient > 0;
        const vel = shearOn ? Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2 : 0;
        const heap = Box2D.HEAPF32;
        for (let c = 0; c < count; c++) {
            const a = pairA[c];
            const b = pairB[c];
            const sa = this.slotOf[a];
            const sb = this.slotOf[b];
            if (sa < 0 || sb < 0) continue;
            const pair = this.kindOf[a] * KIND_STRIDE + this.kindOf[b];
            if (this.steamPair[pair] === 1) {
                const steam = this.kindOf[a] === this.kindSteam ? a : b;
                const other = steam === a ? b : a;
                this.wet[steam] = 1;
                if (this.kindOf[other] === this.kindStone && this.temp[other] >= this.boilingPoint) continue;
            }
            const dT = this.temp[b] - this.temp[a];
            if (dT === 0) continue;
            let K = this.exchange[pair];
            if (shearOn && this.shear[pair] > 0) {
                K += this.shear[pair] * Math.hypot(heap[vel + 2 * b] - heap[vel + 2 * a], heap[vel + 2 * b + 1] - heap[vel + 2 * a + 1]);
            }
            let dE = K * pairW[c] * dT * dt;
            const limit = (Math.abs(dT) * seriesCapacity(this.heatCap[a], this.heatCap[b])) / Math.max(this.neighbors[a], this.neighbors[b]);
            if (Math.abs(dE) > limit) dE = Math.sign(dE) * limit;
            store.enthalpy[sa] += dE / this.effMass[a];
            store.enthalpy[sb] -= dE / this.effMass[b];
        }
    }

    /**
     * Condensación del vapor sobre cuerpos fríos (techo, paredes, plataformas, robots), que se toman como reservorio a
     * temperatura ambiente: `K = h_c D b w (T − T_a)` con `h_c` de la piedra fría, multiplicado por `quenchScale`
     * (tiempo de juego, #186), sin bajar de `e_l`; el calor va a `lost`. El vapor queda mojado, así que al llegar a
     * `e_l` vuelve a agua (fila `condense`) y gotea, en vez de disolverse como humedad.
     */
    condenseOnBodies(total, dt) {
        const { store, contacts } = this;
        if (this.quenchScale <= 1) return;
        const n = contacts.bodies(total);
        if (n <= 0) return;
        const K = MATERIALS.heat.condensation.stone * this.diameter * this.thickness * this.quenchScale;
        const Ta = this.ambient;
        for (let c = 0; c < n; c++) {
            const i = contacts.bodyIndex[c];
            const slot = this.slotOf[i];
            if (slot < 0 || this.kindOf[i] !== this.kindSteam) continue;
            this.wet[i] = 1;
            const e = store.enthalpy[slot];
            const limit = this.effMass[i] * (e - this.eBoil);
            if (limit <= 0) continue;
            const dE = Math.min(limit, K * contacts.bodyW[c] * (this.temperature(this.kindSteam, e) - Ta) * dt);
            store.enthalpy[slot] = e - dE / this.effMass[i];
            this.stats.lost += dE;
        }
    }

    /** Basalto sumergido contra su columna del campo: `h_b P b ΔT`, con el limitador de igualar temperaturas. */
    exchangeColumns(total, dt) {
        const { immersion, water, store } = this;
        if (!immersion) return;
        const hDry = water.config.hDry;
        const cWater = MATERIALS.water.c;
        const coefficient = this.filmBoiling * this.perimeter * this.thickness * this.quenchScale;
        for (let j = 0; j < immersion.count; j++) {
            const i = immersion.submerged[j];
            if (i >= total) continue;
            const slot = this.slotOf[i];
            if (slot < 0 || this.family[this.kindOf[i]] === 0) continue;
            const column = immersion.columns[j];
            const h = water.h[column];
            if (h <= hDry) continue;
            this.submergedMark[i] = 1;
            const kind = this.kindOf[i];
            const e = store.enthalpy[slot];
            const Tp = this.temperature(kind, e);
            const capColumn = SIGMA_W * cWater * h;
            const Tc = water.E[column] / capColumn;
            const dT = Tp - Tc;
            let dE = coefficient * dT * dt;
            const limit = Math.abs(dT) * seriesCapacity(this.specificHeat(kind, e) * this.mass[kind], capColumn * water.dx);
            if (Math.abs(dE) > limit) dE = Math.sign(dE) * limit;
            store.enthalpy[slot] -= dE / this.mass[kind];
            if (this.filmEmission && dE > 0 && Tc < this.boilingPoint) water.boiled[column] += dE;
            else water.E[column] += dE / water.dx;
        }
    }

    /** Pérdida al aire del basalto no sumergido: radiación más convección. Va a `stats.lost`. */
    loseToAir(total, dt) {
        const { store } = this;
        const Ta = this.ambient;
        const Tak = (Ta + KELVIN) ** 4;
        const area = this.perimeter * this.thickness;
        for (let i = 0; i < total; i++) {
            const slot = this.slotOf[i];
            if (slot < 0 || this.submergedMark[i] === 1) continue;
            const kind = this.kindOf[i];
            if (this.family[kind] === 0) continue;
            const e = store.enthalpy[slot];
            const T = this.temperature(kind, e);
            const power = this.timeScale * area * (this.emissivity[kind] * this.stefan * ((T + KELVIN) ** 4 - Tak) + this.convection * (T - Ta));
            let dE = power * dt;
            const limit = this.mass[kind] * Math.abs(e - this.ambientEnthalpy[kind]);
            if (Math.abs(dE) > limit) dE = Math.sign(dE) * limit;
            store.enthalpy[slot] = e - dE / this.mass[kind];
            this.stats.lost += dE;
        }
    }

    /**
     * Enfriamiento del vapor por el aire que arrastra la pluma: `Q = λ m c_v (T − T_a)` con `λ = 2 α w / R`, `w` la
     * velocidad de ascenso medida con el desplazamiento vertical del paso anterior (en el primer paso de una parcela, 0).
     * No baja de `e_l`. Va a `stats.lost`.
     */
    loseSteam(total, dt) {
        const { store } = this;
        const pos = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const Ta = this.ambient;
        const cm = this.cVapor * this.mass[this.kindSteam];
        const k = (2 * this.entrainment * this.plumeScale) / this.plumeRadius;
        for (let i = 0; i < total; i++) {
            const slot = this.slotOf[i];
            if (slot < 0 || this.kindOf[i] !== this.kindSteam) continue;
            const y = heap[pos + 2 * i + 1];
            const fresh = this.altitudeGeneration[slot] !== store.generation[slot];
            const rise = fresh ? 0 : Math.max(0, (y - this.altitude[slot]) / dt);
            const w = this.plumeScale > 1 ? Math.max(rise, this.steamTerminal) : rise;
            this.altitude[slot] = y;
            this.altitudeGeneration[slot] = store.generation[slot];
            const e = store.enthalpy[slot];
            const T = this.temperature(this.kindSteam, e);
            const share = this.effMass[i] / this.mass[this.kindSteam];
            let dE = k * w * cm * share * (T - Ta) * dt;
            const limit = this.effMass[i] * (e - this.eBoil);
            if (dE <= 0) continue;
            store.enthalpy[slot] = dE >= limit ? this.eBoil : e - dE / this.effMass[i];
            this.stats.lost += Math.min(dE, limit);
        }
    }

    /** Pérdida de la superficie de las columnas al aire, `h_a dx b (T − T_a)`, sin cruzar la temperatura ambiente. */
    loseSurface(dt) {
        const { water } = this;
        const hDry = water.config.hDry;
        const cWater = MATERIALS.water.c;
        const Ta = this.ambient;
        const coefficient = this.convection * water.dx * this.thickness * this.timeScale;
        for (let i = water.i0; i < water.i1; i++) {
            const h = water.h[i];
            if (h <= hDry) continue;
            const capColumn = SIGMA_W * cWater * h;
            const E = water.E[i];
            const T = E / capColumn;
            let dE = coefficient * (T - Ta) * dt;
            const limit = Math.abs(E - capColumn * Ta) * water.dx;
            if (Math.abs(dE) > limit) dE = Math.sign(dE) * limit;
            water.E[i] = E - dE / water.dx;
            this.stats.lost += dE;
        }
    }

    /** Cambios de fase del basalto, de flag de la piedra y color de cada partícula. */
    phases(total, dt) {
        const { system, store, stats } = this;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const colors = Box2D.getPointer(system.GetColorBuffer());
        const heapF = Box2D.HEAPF32;
        const heapU = Box2D.HEAPU8;
        const rest2 = THERMAL.restSpeed * THERMAL.restSpeed;
        for (let i = 0; i < total; i++) {
            const slot = this.slotOf[i];
            if (slot < 0) continue;
            let kind = this.kindOf[i];
            const family = this.family[kind];
            const c = colors + 4 * i;
            if (this.seen[slot] !== store.generation[slot]) {
                this.seen[slot] = store.generation[slot];
                this.restTime[slot] = 0;
                this.walled[slot] = 0;
                this.tinted[slot] = 0;
                this.base[3 * slot] = heapU[c];
                this.base[3 * slot + 1] = heapU[c + 1];
                this.base[3 * slot + 2] = heapU[c + 2];
            }
            if (family === 0) {
                const e = store.enthalpy[slot];
                if (kind === this.kindWater && e >= this.eVapor) {
                    this.react(this.reactions.boil, slot, i, 0);
                    stats.boiled++;
                    kind = this.kindSteam;
                } else if (kind === this.kindSteam && e <= this.eBoil) {
                    if (this.wet[i] === 0) {
                        stats.lost += this.effMass[i] * e;
                        stats.humidity++;
                        store.destroy(i, SINK.HUMIDITY);
                        continue;
                    }
                    this.react(this.reactions.condense, slot, i, 0);
                    stats.condensed++;
                    kind = this.kindWater;
                }
                if (kind === this.kindWater) this.tintWater(slot, e / this.cWater, c);
                else if (kind === this.kindSteam) this.paintSteam(slot, c, (e - this.eBoil) / (this.eVapor - this.eBoil));
                continue;
            }
            const e = store.enthalpy[slot];
            if (kind === this.kindLava && e <= this.eSolid) {
                this.react(this.reactions.solidify, slot, i, PARTICLE.POWDER);
                stats.solidified++;
                kind = this.kindStone;
            } else if (kind === this.kindStone && e > this.eLiquid) {
                this.react(this.reactions.remelt, slot, i, 0);
                stats.remelted++;
                kind = this.kindLava;
            }
            if (kind === this.kindStone && this.walled[slot] === 0) {
                const vx = heapF[vel + 2 * i];
                const vy = heapF[vel + 2 * i + 1];
                if (vx * vx + vy * vy < rest2) this.restTime[slot] += dt;
                else this.restTime[slot] = 0;
                if (this.restTime[slot] >= THERMAL.restTime) {
                    this.setFlags(i, PARTICLE.WALL);
                    this.walled[slot] = 1;
                    stats.walled++;
                }
            }
            this.glow(this.temperature(kind, e), c);
        }
    }

    /** Ejecuta la fila `row` de `REACTIONS` sobre la partícula `i` y deja los flags `flag` en lugar de `POWDER` y `WALL`. */
    react(row, slot, i, flag) {
        const { store } = this;
        store.kind[slot] = row.to;
        this.stats.advance[row.id] += this.mass[row.from];
        this.walled[slot] = 0;
        this.restTime[slot] = 0;
        this.setFlags(i, flag);
    }

    /** Reemplaza `POWDER` y `WALL` de la partícula `i` por `flag`, sin tocar los demás. */
    setFlags(i, flag) {
        const keep = this.system.GetParticleFlags(i) & ~(PARTICLE.POWDER | PARTICLE.WALL);
        this.system.SetParticleFlags(i, keep | flag);
    }

    /** Agua a `T` °C: del color con que nació al de `hotWater` entre el ambiente y 100 °C; solo escribe si cambia. */
    tintWater(slot, T, c) {
        const t = Math.min(1, Math.max(0, (T - this.ambient - 1) / (100 - this.ambient)));
        if (t === 0 && this.tinted[slot] === 0) return;
        this.tinted[slot] = t > 0 ? 1 : 0;
        const heapU = Box2D.HEAPU8;
        for (let k = 0; k < 3; k++) {
            const base = this.base[3 * slot + k];
            heapU[c + k] = Math.round(base + (THERMAL.hotWater[k] - base) * t);
        }
    }

    /** Color del vapor con título `x` (1 vapor, 0 niebla): de `THERMAL.fog` a `THERMAL.steam`; deja `tinted` para que, al condensar, el agua recupere su tinte. */
    paintSteam(slot, c, x) {
        const heapU = Box2D.HEAPU8;
        const t = Math.min(1, Math.max(0, x));
        this.tinted[slot] = 1;
        for (let k = 0; k < 3; k++) heapU[c + k] = Math.round(THERMAL.fog[k] + (THERMAL.steam[k] - THERMAL.fog[k]) * t);
    }

    /** Color de basalto a `T` °C por incandescencia; debajo de `glowFrom` el de la piedra fría. */
    glow(T, c) {
        const heapU = Box2D.HEAPU8;
        const stops = THERMAL.incandescence;
        const cold = THERMAL.stone;
        let r;
        let g;
        let b;
        if (T <= THERMAL.glowFrom) {
            [r, g, b] = cold;
        } else if (T < stops[0][0]) {
            const t = (T - THERMAL.glowFrom) / (stops[0][0] - THERMAL.glowFrom);
            const to = stops[0][1];
            r = cold[0] + (to[0] - cold[0]) * t;
            g = cold[1] + (to[1] - cold[1]) * t;
            b = cold[2] + (to[2] - cold[2]) * t;
        } else if (T >= stops[stops.length - 1][0]) {
            [r, g, b] = stops[stops.length - 1][1];
        } else {
            let k = 0;
            while (T >= stops[k + 1][0]) k++;
            const t = (T - stops[k][0]) / (stops[k + 1][0] - stops[k][0]);
            const from = stops[k][1];
            const to = stops[k + 1][1];
            r = from[0] + (to[0] - from[0]) * t;
            g = from[1] + (to[1] - from[1]) * t;
            b = from[2] + (to[2] - from[2]) * t;
        }
        heapU[c] = Math.round(r);
        heapU[c + 1] = Math.round(g);
        heapU[c + 2] = Math.round(b);
    }
}
