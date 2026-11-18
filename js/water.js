import { LEVEL } from "./level.js";
import { MATERIALS, SIGMA_W } from "./materials.js";

/** Gravedad del mundo (m/s²), la misma de `b2World`. */
const G = 10;

/** Densidad del agua (kg/m³). */
const RHO_W = 1000;

/** Altura por debajo de la cual una cara se trata como seca en las velocidades de onda (m). */
const TINY = 1e-12;
const SQRT_G = Math.sqrt(G);

/** Velocidad máxima física (m/s): frente de Ritter con h_max = 15 m, `2√(g h_max)`. */
const U_MAX = 2 * Math.sqrt(G * 15);

/** Profundidad máxima de repeticiones de un subpaso con `dt/2` tras una altura negativa. */
const MAX_HALVINGS = 10;

/** Iteraciones máximas y tolerancia relativa a la carga del Newton de `project` (arranca en `h`, donde `f = bs − b > 0`, y converge monótono). */
const PROJ_ITERATIONS = 40;
const PROJ_TOLERANCE = 1e-10;

/**
 * Datos del campo de alturas (docs/design/14-agua.md §14.3): `dx` (m), `cfl`, `maxSubsteps`, `hDry` (m),
 * `manning` (s/m^(1/3)), `ambientT` (°C) y `draw` (datos de dibujo: `alpha` es la opacidad del agua, `color` y
 * `lineColor` RGB del relleno y de la línea de superficie, `lineWidth` el grosor de la línea en píxeles).
 */
export const WATER_FIELD = {
    dx: 0.1,
    cfl: 0.45,
    maxSubsteps: 32,
    hDry: 1e-3,
    manning: 0.012,
    ambientT: 20,
    draw: { alpha: 0.55, color: [40, 120, 255], lineColor: [170, 220, 255], lineWidth: 2 },
};

const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

let projH = 0;
let projU = 0;

/**
 * Proyecta el estado `(h, u)` sobre el lecho `b` a la cota de cara `bs` conservando la carga total y el caudal
 * `q = h·u` (Newton en la rama del régimen del lado; estrangulado si la carga no alcanza). Deja el resultado en
 * `projH` y `projU`. El llamador lo invoca solo con `bs > b`, `h` sobre el umbral seco y `u ≠ 0`; en los demás
 * casos queda la reconstrucción hidrostática.
 */
function project(h, u, b, bs) {
    const q = h * u;
    const E = h + b + (u * u) / (2 * G) - bs;
    if (E <= 0) {
        projH = 0;
        projU = 0;
        return;
    }
    if (E * E * E <= (27 / 8) * ((q * q) / G)) {
        const hs = Math.min(h, (2 / 3) * E);
        projH = hs;
        projU = Math.sign(u) * Math.sqrt(G * hs);
        return;
    }
    const q2 = (q * q) / (2 * G);
    let x = h;
    for (let k = 0; k < PROJ_ITERATIONS; k++) {
        const r = q2 / (x * x);
        const dx = (x + r - E) / (1 - (2 * r) / x);
        x -= dx;
        if (Math.abs(dx) < PROJ_TOLERANCE * E) break;
    }
    const hs = Math.min(h, x);
    projH = hs;
    projU = q / hs;
}

/**
 * Agua del nivel como campo de alturas: Saint-Venant 1D conservativo con lecho variable, volúmenes finitos
 * HLL, reconstrucción hidrostática (Audusse et al., 2004), MUSCL con minmod y SSP-RK2. Es JS puro: no usa
 * `Box2D`. Unidades: metros, segundos, rebanada 2D con `σ_w` = `SIGMA_W`.
 *
 * `h` (m), `q` (m²/s), `E` (J/m) y `M` (m) son los arreglos de estado; `b` es el lecho, `d` el
 * desplazamiento por cuerpos (cero hasta #74) y `boiled` los J pendientes de vaporización.
 * `stats` cuenta los subpasos, las repeticiones con `dt/2` (`halvings`), las activaciones del tope de
 * subpasos (`capHits`), el `h` mínimo aceptado (`minH`) y la cantidad de movimiento que se anuló en celdas
 * secas (`droppedMomentum`, ΣΔq·dx).
 */
export class ShallowWater {
    constructor(level = LEVEL, config = WATER_FIELD) {
        this.level = level;
        this.config = config;
        const { minX, maxX } = level.bounds;
        this.dx = config.dx;
        this.x0 = minX;
        this.N = Math.round((maxX - minX) / config.dx);
        const N = this.N;
        const make = (n = N) => new Float64Array(n);
        this.b = make();
        this.h = make();
        this.q = make();
        this.E = make();
        this.M = make();
        this.d = make();
        this.boiled = make();
        this.saved = { h: make(), q: make(), E: make(), M: make() };
        this.stage = { h: make(), q: make(), E: make(), M: make() };
        this.rate = { h: make(), q: make(), E: make(), M: make() };
        this.ext = { H: make(N + 2), ETA: make(N + 2), U: make(N + 2), SH: make(N + 2), SETA: make(N + 2), SU: make(N + 2) };
        this.face = {
            hL: make(N + 1),
            hR: make(N + 1),
            bL: make(N + 1),
            bR: make(N + 1),
            fm: make(N + 1),
            fqL: make(N + 1),
            fqR: make(N + 1),
            fE: make(N + 1),
            fM: make(N + 1),
        };
        this.cWater = MATERIALS.water.c;
        this.lnMuWater = Math.log(MATERIALS.water.mu);
        this.lnMuHoney = Math.log(MATERIALS.honey.mu);
        this.sgHoney = MATERIALS.honey.SG;
        for (let i = 0; i < N; i++) {
            const xc = this.center(i);
            let top = 0;
            for (const s of level.solids) {
                if (s.kind === "floor" && Math.abs(xc - s.x) <= s.w / 2) top = Math.max(top, s.y + s.h / 2);
            }
            this.b[i] = top;
        }
        this.reset();
    }

    /** Coordenada x del centro de la celda `i` (m). */
    center(i) {
        return this.x0 + (i + 0.5) * this.dx;
    }

    /** Vuelve al estado asentado: lago en `pool.surface` entre `x1` y `x2`, `q` = 0, `T` ambiente, sin miel. */
    reset() {
        const { N, level, config } = this;
        const pool = level.pool;
        for (let i = 0; i < N; i++) {
            const xc = this.center(i);
            const wet = pool && xc > pool.x1 && xc < pool.x2;
            this.h[i] = wet ? Math.max(0, pool.surface - this.b[i]) : 0;
            this.q[i] = 0;
            this.E[i] = SIGMA_W * this.cWater * this.h[i] * config.ambientT;
            this.M[i] = 0;
            this.d[i] = 0;
            this.boiled[i] = 0;
        }
        this.stats = { steps: 0, substeps: 0, halvings: 0, capHits: 0, minH: Infinity, droppedMomentum: 0 };
    }

    /** Velocidad de la columna `i` (m/s), desingularizada como en Kurganov y Petrova (2007). */
    uOf(i) {
        const h = this.h[i];
        const hd = this.config.hDry;
        return (2 * h * this.q[i]) / (h * h + Math.max(h * h, hd * hd));
    }

    /** Fracción volumétrica de miel `X_v = M/h` de la columna `i` (0 en columnas secas). */
    honeyFraction(i) {
        const h = this.h[i];
        if (h < this.config.hDry) return 0;
        return Math.min(1, Math.max(0, this.M[i] / h));
    }

    /** Viscosidad dinámica de la mezcla (Pa·s), regla logarítmica `ln μ = X ln μ_miel + (1 − X) ln μ_agua`. */
    muOf(i) {
        const X = this.honeyFraction(i);
        if (X === 0) return MATERIALS.water.mu;
        return Math.exp(X * this.lnMuHoney + (1 - X) * this.lnMuWater);
    }

    /** Temperatura de la columna `i` (°C). */
    temperatureOf(i) {
        const h = this.h[i];
        if (h < this.config.hDry) return this.config.ambientT;
        return this.E[i] / (SIGMA_W * this.cWater * h);
    }

    /** Interpolación lineal entre centros de celda de `fn(i)` en `x`, sin extrapolar. */
    sample(x, fn) {
        const s = (x - this.x0) / this.dx - 0.5;
        const i = Math.min(Math.max(Math.floor(s), 0), this.N - 2);
        const t = Math.min(1, Math.max(0, s - i));
        return (1 - t) * fn(i) + t * fn(i + 1);
    }

    /** Altura de la superficie `η = b + h` en `x` (m); en columnas secas es el lecho. */
    surfaceAt(x) {
        return this.sample(x, (i) => this.b[i] + this.h[i]);
    }

    /** Espesor de agua `h` en `x` (m). */
    depthAt(x) {
        return this.sample(x, (i) => this.h[i]);
    }

    /** Velocidad horizontal del agua en `x` (m/s). */
    velocityAt(x) {
        return this.sample(x, (i) => this.uOf(i));
    }

    /** Densidad de la columna `ρ_col = ρ_w (1 + (SG_miel − 1) X_v)` en `x` (kg/m³). */
    densityAt(x) {
        return this.sample(x, (i) => RHO_W * (1 + (this.sgHoney - 1) * this.honeyFraction(i)));
    }

    /** Viscosidad dinámica de la mezcla en `x` (Pa·s). */
    viscosityAt(x) {
        return this.sample(x, (i) => this.muOf(i));
    }

    /** Temperatura del agua en `x` (°C). */
    temperatureAt(x) {
        return this.sample(x, (i) => this.temperatureOf(i));
    }

    /** Volumen por ancho `Σ h dx` (m²). */
    volume() {
        let sum = 0;
        for (let i = 0; i < this.N; i++) sum += this.h[i];
        return sum * this.dx;
    }

    /** Cantidad de movimiento por ancho `Σ q dx` (m³/s). */
    momentum() {
        let sum = 0;
        for (let i = 0; i < this.N; i++) sum += this.q[i];
        return sum * this.dx;
    }

    /** Energía térmica `Σ E dx` (J). */
    energy() {
        let sum = 0;
        for (let i = 0; i < this.N; i++) sum += this.E[i];
        return sum * this.dx;
    }

    /** Volumen de miel `Σ M dx` (m²). */
    honey() {
        let sum = 0;
        for (let i = 0; i < this.N; i++) sum += this.M[i];
        return sum * this.dx;
    }

    /**
     * Suma una fuente en `x` repartida entre las dos celdas vecinas con pesos lineales (cloud-in-cell):
     * `area` (m²), `momentum` (`Σ SG A v_x`, m³/s), `energy` (J) y `honey` (m²). Se aplica en el acto: equivale
     * a acumularla y sumarla al principio de `step`, porque nada corre entre ambos.
     */
    deposit(x, area, momentum, energy, honey) {
        const { N, dx } = this;
        const s = (x - this.x0) / dx - 0.5;
        const i = Math.floor(s);
        const w1 = s - i;
        const targets = [[Math.min(Math.max(i, 0), N - 1), 1 - w1], [Math.min(Math.max(i + 1, 0), N - 1), w1]];
        for (const [c, w] of targets) {
            this.h[c] += (w * area) / dx;
            this.q[c] += (w * momentum) / dx;
            this.E[c] += (w * energy) / dx;
            this.M[c] += (w * honey) / dx;
        }
    }

    /** Suma `dq` (m²/s) al caudal de la columna `i`. */
    addMomentum(i, dq) {
        this.q[i] += dq;
    }

    /**
     * Calcula en `rate` la derivada temporal del estado `(h, q, E, M)` y devuelve la mayor velocidad de onda
     * `max(|S_L|, |S_R|)` sobre las caras (m/s).
     */
    evaluate(h, q, E, M) {
        const { N, dx, b, d, rate } = this;
        const hd = this.config.hDry;
        const { H, ETA, U, SH, SETA, SU } = this.ext;
        const { hL, hR, bL, bR, fm, fqL, fqR, fE, fM } = this.face;
        for (let i = 0; i < N; i++) {
            const k = i + 1;
            const hh = h[i];
            H[k] = hh;
            ETA[k] = b[i] + d[i] + hh;
            U[k] = (2 * hh * q[i]) / (hh * hh + Math.max(hh * hh, hd * hd));
        }
        H[0] = H[1];
        ETA[0] = ETA[1];
        U[0] = -U[1];
        H[N + 1] = H[N];
        ETA[N + 1] = ETA[N];
        U[N + 1] = -U[N];
        for (let k = 1; k <= N; k++) {
            if (H[k] < hd || H[k - 1] < hd || H[k + 1] < hd) {
                SH[k] = 0;
                SETA[k] = 0;
                SU[k] = 0;
            } else {
                const lim = 2 * H[k];
                SETA[k] = Math.max(-lim, Math.min(lim, minmod(ETA[k] - ETA[k - 1], ETA[k + 1] - ETA[k])));
                SH[k] = SETA[k];
                SU[k] = minmod(U[k] - U[k - 1], U[k + 1] - U[k]);
            }
        }
        let smax = 0;
        for (let f = 0; f <= N; f++) {
            const hRf = H[f + 1] - SH[f + 1] / 2;
            const bRf = ETA[f + 1] - SETA[f + 1] / 2 - hRf;
            const uRf = U[f + 1] - SU[f + 1] / 2;
            let hLf, bLf, uLf, hRv = hRf, bRv = bRf, uRv = uRf;
            if (f === 0) {
                hLf = hRf;
                bLf = bRf;
                uLf = -uRf;
            } else {
                hLf = H[f] + SH[f] / 2;
                bLf = ETA[f] + SETA[f] / 2 - hLf;
                uLf = U[f] + SU[f] / 2;
            }
            if (f === N) {
                hRv = hLf;
                bRv = bLf;
                uRv = -uLf;
            }
            hL[f] = hLf;
            hR[f] = hRv;
            bL[f] = bLf;
            bR[f] = bRv;
            const bs = Math.max(bLf, bRv);
            const hLh = Math.max(0, hLf + bLf - bs);
            const hRh = Math.max(0, hRv + bRv - bs);
            let hLs = hLh;
            let uLs = uLf;
            let hRs = hRh;
            let uRs = uRv;
            if (bs > bLf && hLf > hd && uLf !== 0) {
                project(hLf, uLf, bLf, bs);
                hLs = projH;
                uLs = projU;
            }
            if (bs > bRv && hRv > hd && uRv !== 0) {
                project(hRv, uRv, bRv, bs);
                hRs = projH;
                uRs = projU;
            }
            const qLs = hLs * uLs;
            const qRs = hRs * uRs;
            const rl = Math.sqrt(hLs);
            const rr = Math.sqrt(hRs);
            const cL = SQRT_G * rl;
            const cR = SQRT_G * rr;
            let sL, sR;
            if (hLs <= TINY && hRs <= TINY) {
                sL = 0;
                sR = 0;
            } else if (hRs <= TINY) {
                sL = uLs - cL;
                sR = uLs + 2 * cL;
            } else if (hLs <= TINY) {
                sL = uRs - 2 * cR;
                sR = uRs + cR;
            } else {
                const uRoe = (rl * uLs + rr * uRs) / (rl + rr);
                const cRoe = Math.sqrt((G * (hLs + hRs)) / 2);
                sL = Math.min(uLs - cL, uRoe - cRoe);
                sR = Math.max(uRs + cR, uRoe + cRoe);
            }
            smax = Math.max(smax, Math.abs(sL), Math.abs(sR));
            const flM = qLs;
            const frM = qRs;
            const flQ = hLs > TINY ? qLs * uLs + 0.5 * G * hLs * hLs : 0;
            const frQ = hRs > TINY ? qRs * uRs + 0.5 * G * hRs * hRs : 0;
            let gM, gQ;
            if (sL >= 0) {
                gM = flM;
                gQ = flQ;
            } else if (sR <= 0) {
                gM = frM;
                gQ = frQ;
            } else {
                const inv = 1 / (sR - sL);
                gM = (sR * flM - sL * frM + sL * sR * (hRs - hLs)) * inv;
                gQ = (sR * flQ - sL * frQ + sL * sR * (qRs - qLs)) * inv;
            }
            fm[f] = gM;
            fqL[f] = gQ + 0.5 * G * (hLf * hLf - hLs * hLs);
            fqR[f] = gQ + 0.5 * G * (hRv * hRv - hRs * hRs);
            if (f === 0 || f === N) {
                fE[f] = 0;
                fM[f] = 0;
            } else if (gM >= 0) {
                const c = f - 1;
                const s = h[c] > 0 ? gM / h[c] : 0;
                fE[f] = s * E[c];
                fM[f] = s * M[c];
            } else {
                const s = h[f] > 0 ? gM / h[f] : 0;
                fE[f] = s * E[f];
                fM[f] = s * M[f];
            }
        }
        for (let i = 0; i < N; i++) {
            const sc = -G * ((hR[i] + hL[i + 1]) / 2) * (bL[i + 1] - bR[i]);
            rate.h[i] = -(fm[i + 1] - fm[i]) / dx;
            rate.q[i] = -(fqL[i + 1] - fqR[i] - sc) / dx;
            rate.E[i] = -(fE[i + 1] - fE[i]) / dx;
            rate.M[i] = -(fM[i + 1] - fM[i]) / dx;
        }
        return smax;
    }

    /**
     * Mayor velocidad de onda `|u| + c` sobre las celdas mojadas (m/s), sin calcular flujos.
     */
    maxSpeed(h, q) {
        const { N } = this;
        const hd = this.config.hDry;
        let smax = 0;
        for (let i = 0; i < N; i++) {
            const hh = h[i];
            if (hh <= TINY) continue;
            const u = (2 * hh * q[i]) / (hh * hh + Math.max(hh * hh, hd * hd));
            smax = Math.max(smax, Math.abs(u) + Math.sqrt(G * hh));
        }
        return smax;
    }

    /**
     * Anula `q` en las columnas secas del estado `s`, suma lo anulado a `stats.droppedMomentum`, y devuelve
     * `false` si alguna altura es negativa (las negativas por redondeo, hasta 10⁻¹², se llevan a 0).
     */
    settle(s) {
        const { N, dx } = this;
        const hd = this.config.hDry;
        let ok = true;
        for (let i = 0; i < N; i++) {
            if (s.h[i] < 0) {
                if (s.h[i] > -1e-12) s.h[i] = 0;
                else ok = false;
            }
            if (s.h[i] < hd && s.q[i] !== 0) {
                this.stats.droppedMomentum += s.q[i] * dx;
                s.q[i] = 0;
            }
        }
        return ok;
    }

    /** Un subpaso SSP-RK2 de `dt`; devuelve `false` (sin cambiar el estado) si algún `h` quedó negativo. */
    attempt(dt) {
        const { N, h, q, E, M, stage, rate } = this;
        this.evaluate(h, q, E, M);
        for (let i = 0; i < N; i++) {
            stage.h[i] = h[i] + dt * rate.h[i];
            stage.q[i] = q[i] + dt * rate.q[i];
            stage.E[i] = E[i] + dt * rate.E[i];
            stage.M[i] = M[i] + dt * rate.M[i];
        }
        if (!this.settle(stage)) return false;
        this.evaluate(stage.h, stage.q, stage.E, stage.M);
        for (let i = 0; i < N; i++) {
            stage.h[i] = 0.5 * (h[i] + stage.h[i] + dt * rate.h[i]);
            stage.q[i] = 0.5 * (q[i] + stage.q[i] + dt * rate.q[i]);
            stage.E[i] = 0.5 * (E[i] + stage.E[i] + dt * rate.E[i]);
            stage.M[i] = 0.5 * (M[i] + stage.M[i] + dt * rate.M[i]);
        }
        if (!this.settle(stage)) return false;
        this.friction(stage, dt);
        this.settle(stage);
        for (let i = 0; i < N; i++) {
            h[i] = stage.h[i];
            q[i] = stage.q[i];
            E[i] = stage.E[i];
            M[i] = stage.M[i];
            this.stats.minH = Math.min(this.stats.minH, h[i]);
        }
        return true;
    }

    /** Fricción de fondo semi-implícita (Manning y película laminar) sobre `q` del estado `s`. */
    friction(s, dt) {
        const { N, config } = this;
        const n2 = config.manning * config.manning;
        const nuWater = MATERIALS.water.mu / RHO_W;
        for (let i = 0; i < N; i++) {
            const hh = s.h[i];
            if (hh < config.hDry) continue;
            const inv = 1 / hh;
            const u = s.q[i] * inv;
            const X = Math.min(1, Math.max(0, s.M[i] * inv));
            const nu = X === 0 ? nuWater : Math.exp(X * this.lnMuHoney + (1 - X) * this.lnMuWater) / (RHO_W * (1 + (this.sgHoney - 1) * X));
            const kappa = (G * n2 * Math.abs(u) * inv) / Math.cbrt(hh) + 3 * nu * inv * inv;
            s.q[i] /= 1 + dt * kappa;
        }
    }

    /** Avanza un subpaso de `dt`; si da `h < 0` lo repite en dos mitades, hasta `MAX_HALVINGS` niveles. */
    advance(dt, depth = 0) {
        const { saved, h, q, E, M } = this;
        saved.h.set(h);
        saved.q.set(q);
        saved.E.set(E);
        saved.M.set(M);
        if (this.attempt(dt)) return;
        h.set(saved.h);
        q.set(saved.q);
        E.set(saved.E);
        M.set(saved.M);
        if (depth >= MAX_HALVINGS) throw new Error("ShallowWater: h negativa con dt mínimo");
        this.stats.halvings++;
        this.advance(dt / 2, depth + 1);
        this.advance(dt / 2, depth + 1);
    }

    /**
     * Avanza un paso fijo `dt` con `n = ceil(dt · S_max / (CFL · dx))` subpasos, con tope `maxSubsteps`: al
     * llegar al tope se recorta `|u|` a `U_MAX` y se cuenta en `stats.capHits`.
     */
    step(dt) {
        const { N, h, q, config } = this;
        this.settle(this);
        const smax = this.maxSpeed(h, q);
        let n = Math.max(1, Math.ceil((dt * smax) / (config.cfl * this.dx)));
        if (n > config.maxSubsteps) {
            n = config.maxSubsteps;
            this.stats.capHits++;
            for (let i = 0; i < N; i++) {
                const hh = h[i];
                const lim = hh * U_MAX;
                if (Math.abs(q[i]) > lim) q[i] = Math.sign(q[i]) * lim;
            }
        }
        const sub = dt / n;
        for (let s = 0; s < n; s++) this.advance(sub);
        this.stats.steps++;
        this.stats.substeps += n;
    }
}
