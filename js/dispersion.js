import { Fft } from "./fft.js";

/**
 * Datos de la dispersión (docs/design/14-agua.md §14.3). `levels` y `depthMin` fijan los niveles de profundidad de la
 * teoría de Airy, geométricos de `depthMin` m en adelante con razón 2 (8 niveles: de 0,25 a 32 m). `cutoff` es `k h̄` de
 * corte del pasabajos: lo que tiene `k h̄ < cutoff` se queda en el volumen. `beach` es la profundidad `h̄` (m) bajo la cual
 * no hay superficie. `quiet` es el umbral (m y m²/s) bajo el cual no hay superficie que avanzar. `steepness` es la
 * pendiente límite `H/λ` de Stokes y Michell. `reserve` es la fracción de `h̄` que la superficie puede quitar a una columna.
 * `nonlinear` es la amplitud máxima de `h̃` relativa a `h̄` en una cuenca: la teoría lineal no vale con ondas grandes y esa
 * cuenca sigue entera con Saint-Venant ese paso.
 * `minCells` es el ancho mínimo (celdas) de una cuenca mojada.
 */
export const DISPERSION = { levels: 8, depthMin: 0.25, cutoff: 0.5, beach: 0.1, quiet: 1e-6, steepness: 0.142, reserve: 0.9, nonlinear: 0.25, minCells: 4 };

const RHO_W = 1000;

/** Pendiente máxima de la superficie `∂h̃/∂x` de una onda senoidal en la rotura: `π H/λ`. */
const SLOPE_MAX = Math.PI * DISPERSION.steepness;

/** Tablas de una cuenca de `n` celdas con el paso `dt`: la FFT de longitud `2n`, los buffers y la rotación de fase por nivel. */
class Plan {
    constructor(n, dt, dx, g) {
        const { levels, depthMin } = DISPERSION;
        this.n = n;
        this.dt = dt;
        this.fft = new Fft(2 * n);
        this.re = new Float64Array(2 * n);
        this.im = new Float64Array(2 * n);
        this.hk = new Float64Array(n);
        this.qk = new Float64Array(n);
        this.cosT = new Float64Array(n);
        this.sinT = new Float64Array(n);
        this.a1 = [];
        this.b1 = [];
        this.a2 = [];
        this.b2 = [];
        for (let k = 0; k < n; k++) {
            this.cosT[k] = Math.cos((Math.PI * k) / (2 * n));
            this.sinT[k] = Math.sin((Math.PI * k) / (2 * n));
        }
        for (let j = 0; j < levels; j++) {
            const depth = depthMin * 2 ** j;
            const a1 = new Float64Array(n);
            const b1 = new Float64Array(n);
            const a2 = new Float64Array(n);
            const b2 = new Float64Array(n);
            for (let k = 1; k < n; k++) {
                const kappa = (Math.PI * k) / (n * dx);
                const omega = Math.sqrt(g * kappa * Math.tanh(kappa * depth));
                const c = Math.cos(omega * dt);
                const s = Math.sin(omega * dt);
                const half = (kappa * dx) / 2;
                const sinc = Math.sin(half) / half;
                a1[k] = s / omega / sinc;
                b1[k] = (1 - c) / kappa / sinc;
                a2[k] = c;
                b2[k] = (omega / kappa) * s;
            }
            this.a1.push(a1);
            this.b1.push(b1);
            this.a2.push(a2);
            this.b2.push(b2);
        }
        this.lv = new Int32Array(n);
        this.fr = new Float64Array(n);
        this.lvF = new Int32Array(n + 1);
        this.frF = new Float64Array(n + 1);
        this.used = new Uint8Array(levels);
        this.flux = new Float64Array(n + 1);
        this.qNew = new Float64Array(n);
    }
}

/**
 * Dispersión de las ondas cortas del campo de alturas (docs/design/14-agua.md §14.3), a la manera de Jeschke y Wojtan
 * (*ACM Trans. Graph.* 42(4), 2023): el volumen sigue con Saint-Venant y la superficie con la teoría lineal de Airy.
 *
 * `split()` corre antes de los subpasos de Saint-Venant: en cada cuenca mojada (tramo contiguo con `h > hDry`) separa
 * `η = b + h` y `q` en un pasabajos `(h̄, q̄)` y el resto `(h̃, q̃)`. El pasabajos es una difusión implícita conservativa de
 * dos pasadas, de coeficiente `(h/cutoff)²` por cara, con flujo cero en paredes y celdas secas. Deja `h̄` y `q̄` en los
 * arreglos del campo, para que los integre Saint-Venant, y devuelve `false` (sin tocar nada) si `h̃` y `q̃` son menores que
 * `quiet`. Antes de eso, la superficie se atenúa donde la pendiente pasa de `steepness` (rotura: lo que se quita pasa al
 * volumen de la misma celda, donde Saint-Venant lo disipa como resalto, declarado) y donde `h̄ < beach` (el déficit
 * también va al `h̄` de la misma celda).
 *
 * `merge(dt)` corre después: avanza `(h̃, q̃)` con la solución exacta de Airy, `ω = √(g k tanh(k h̄))`, modo por modo de
 * la serie coseno (`h̃`) y seno (`q̃`) de la cuenca (extensión espejo: paredes reflectivas), con la FFT de longitud `2n`
 * que empaqueta dos señales reales. La profundidad local `h̄` se interpola entre los niveles de `DISPERSION` por celda.
 * `h̃` se actualiza en forma de flujo con el flujo de cara `∫q̃ dt` (masa exacta; limitado para no pasar de `reserve` de
 * `h̄` ni entrar en las playas), y `E`, `M` y `A` se transportan con ese mismo flujo (upwind). Después, difusión implícita
 * de `h̃` y `q̃` con `2ν` por columna (amortiguamiento de Lamb, `γ = 2νk²`).
 *
 * Aproximaciones declaradas: superficie lineal, sin arrastre por la corriente ni tensor de radiación; el pasabajos usa `η`
 * en lugar de `h` para que el reposo sobre un lecho no plano sea exacto.
 */
export class Dispersion {
    constructor(water, g) {
        this.water = water;
        this.g = g;
        const N = water.N;
        const make = (n = N) => new Float64Array(n);
        this.starts = new Int32Array(N);
        this.lengths = new Int32Array(N);
        this.count = 0;
        this.ht = make();
        this.qt = make();
        this.hbar = make();
        this.qbar = make();
        this.sE = make();
        this.sM = make();
        this.sA = make();
        this.eta = make();
        this.qq = make();
        this.work = make();
        this.coef = make(N + 1);
        this.lo = make();
        this.cp = make();
        this.den = make();
        this.ys = make();
        this.flux = make(N + 1);
        this.out = make();
        this.tn = make();
        this.pre = make();
        this.nu = make();
        this.plans = new Map();
    }

    /** Busca las cuencas mojadas del span activo con agua de al menos `depthMin` y `minCells` celdas. */
    findBasins() {
        const { i0, i1, h, config } = this.water;
        const hDry = config.hDry;
        this.count = 0;
        let i = i0;
        while (i < i1) {
            if (!(h[i] > hDry)) {
                i++;
                continue;
            }
            let j = i;
            let deepest = 0;
            while (j < i1 && h[j] > hDry) {
                if (h[j] > deepest) deepest = h[j];
                j++;
            }
            if (j - i >= DISPERSION.minCells && deepest >= DISPERSION.depthMin) {
                this.starts[this.count] = i;
                this.lengths[this.count] = j - i;
                this.count++;
            }
            i = j;
        }
    }

    /**
     * Factoriza la matriz tridiagonal `I − ∂x(D ∂x)` de la cuenca `(a, n)` con el coeficiente `D` por cara en
     * `coef[a + f]` (cara `f` entre las celdas `a + f − 1` y `a + f`). En los extremos el flujo es cero (`wall` falso: la
     * variable es par, como `h`) o la variable vale cero en la pared, con el coeficiente `coef[a]` y `coef[a + n]` (`wall`:
     * es impar, como `q`).
     */
    factor(a, n, wall) {
        const { coef, lo, cp, den } = this;
        const inv = 1 / (this.water.dx * this.water.dx);
        let prev = 0;
        for (let i = 0; i < n; i++) {
            const dl = i > 0 ? coef[a + i] : wall ? 2 * coef[a] : 0;
            const dr = i < n - 1 ? coef[a + i + 1] : wall ? 2 * coef[a + n] : 0;
            const l = -dl * inv;
            const u = -dr * inv;
            const d = 1 + (dl + dr) * inv;
            lo[a + i] = l;
            const denom = d - l * prev;
            den[a + i] = denom;
            prev = u / denom;
            cp[a + i] = prev;
        }
    }

    /** Resuelve en el lugar, sobre `x[a .. a + n)`, el sistema que dejó `factor`. */
    solve(a, n, x) {
        const { lo, cp, den, ys } = this;
        let prev = 0;
        for (let i = 0; i < n; i++) {
            prev = (x[a + i] - lo[a + i] * prev) / den[a + i];
            ys[a + i] = prev;
        }
        let next = 0;
        for (let i = n - 1; i >= 0; i--) {
            next = ys[a + i] - cp[a + i] * next;
            x[a + i] = next;
        }
    }

    /**
     * Separa el estado en volumen y superficie en todas las cuencas. Devuelve `true` si hay superficie que avanzar y
     * entonces deja `h` y `q` (y `E`, `M`, `A`) del campo en la parte de volumen.
     */
    split() {
        const water = this.water;
        const { h, q, b, E, M, A, dx } = water;
        const { ht, qt, hbar, qbar, eta, qq, work, coef } = this;
        const { cutoff, beach, quiet, nonlinear } = DISPERSION;
        this.findBasins();
        if (this.count === 0) return false;
        let peakH = 0;
        let peakQ = 0;
        for (let k = 0; k < this.count; k++) {
            const a = this.starts[k];
            const n = this.lengths[k];
            for (let f = 1; f < n; f++) {
                const hf = (h[a + f - 1] + h[a + f]) / (2 * cutoff);
                coef[a + f] = hf * hf;
            }
            const first = h[a] / cutoff;
            const last = h[a + n - 1] / cutoff;
            coef[a] = first * first;
            coef[a + n] = last * last;
            for (let i = a; i < a + n; i++) {
                eta[i] = b[i] + h[i];
                qq[i] = q[i];
            }
            this.factor(a, n, false);
            this.solve(a, n, eta);
            this.solve(a, n, eta);
            this.factor(a, n, true);
            this.solve(a, n, qq);
            this.solve(a, n, qq);
            for (let i = a; i < a + n; i++) {
                const hb = Math.max(0, eta[i] - b[i]);
                hbar[i] = hb;
                qbar[i] = qq[i];
                ht[i] = h[i] - hb;
                qt[i] = q[i] - qq[i];
            }
            let linear = true;
            for (let i = a; i < a + n; i++) {
                const left = i > a ? ht[i - 1] : ht[i];
                const right = i < a + n - 1 ? ht[i + 1] : ht[i];
                const span = (i > a ? 1 : 0) + (i < a + n - 1 ? 1 : 0);
                const slope = Math.abs(right - left) / (span * dx);
                work[i] = hbar[i] < beach ? 0 : slope > SLOPE_MAX ? SLOPE_MAX / slope : 1;
                if (hbar[i] >= beach && Math.abs(ht[i]) > nonlinear * hbar[i]) linear = false;
            }
            for (let i = a; i < a + n; i++) {
                const f = linear ? work[i] : 0;
                if (f < 1) {
                    hbar[i] += (1 - f) * ht[i];
                    qbar[i] += (1 - f) * qt[i];
                    ht[i] *= f;
                    qt[i] *= f;
                }
                peakH = Math.max(peakH, Math.abs(ht[i]));
                peakQ = Math.max(peakQ, Math.abs(qt[i]));
            }
        }
        if (peakH < quiet && peakQ < quiet) return false;
        const { sE, sM, sA } = this;
        for (let k = 0; k < this.count; k++) {
            const a = this.starts[k];
            for (let c = a; c < a + this.lengths[k]; c++) {
                const inv = 1 / h[c];
                sE[c] = E[c] * inv;
                sM[c] = M[c] * inv;
                sA[c] = A[c] * inv;
                E[c] -= sE[c] * ht[c];
                M[c] -= sM[c] * ht[c];
                A[c] -= sA[c] * ht[c];
                h[c] = hbar[c];
                q[c] = qbar[c];
            }
        }
        return true;
    }

    /** Tablas de la cuenca de `n` celdas para el paso `dt` (se rehacen si cambian). */
    plan(n, dt) {
        let plan = this.plans.get(n);
        if (!plan || plan.dt !== dt) {
            if (this.plans.size > 16) this.plans.clear();
            plan = new Plan(n, dt, this.water.dx, this.g);
            this.plans.set(n, plan);
        }
        return plan;
    }

    /** Asigna a la celda o cara `i` de la cuenca los dos niveles vecinos y el peso del superior para la profundidad `depth`. */
    level(plan, depth, lv, fr, i) {
        const { levels, depthMin } = DISPERSION;
        const t = Math.min(levels - 1 - 1e-9, Math.max(0, Math.log2(Math.max(depth, depthMin) / depthMin)));
        const j = Math.floor(t);
        lv[i] = j;
        fr[i] = t - j;
        plan.used[j] = 1;
        if (t - j > 1e-9) plan.used[j + 1] = 1;
    }

    /** Avanza la superficie `dt` en todas las cuencas y la suma otra vez al volumen que acaba de integrar Saint-Venant. */
    merge(dt) {
        const water = this.water;
        const { h, q, E, M, A, dx } = water;
        const { ht, sE, sM, sA, flux, out, tn, pre } = this;
        const { beach, reserve } = DISPERSION;
        for (let k = 0; k < this.count; k++) {
            const a = this.starts[k];
            const n = this.lengths[k];
            const plan = this.plan(n, dt);
            this.spectrum(plan, a, n);
            const faces = plan.flux;
            for (let f = 1; f < n; f++) {
                flux[a + f] = Math.min(h[a + f - 1], h[a + f]) < beach ? 0 : faces[f];
            }
            flux[a] = 0;
            flux[a + n] = 0;
            for (let c = a; c < a + n; c++) out[c] = 0;
            for (let g = a + 1; g < a + n; g++) {
                if (flux[g] > 0) out[g - 1] += flux[g];
                else out[g] -= flux[g];
            }
            for (let g = a + 1; g < a + n; g++) {
                const donor = flux[g] > 0 ? g - 1 : g;
                const allowed = Math.max(0, (ht[donor] + reserve * h[donor]) * dx);
                if (out[donor] > allowed) flux[g] *= allowed / out[donor];
            }
            for (let c = a; c < a + n; c++) {
                tn[c] = ht[c] - (flux[c + 1] - flux[c]) / dx;
                pre[c] = tn[c];
            }
            this.damp(a, n, dt, plan);
            let moved = 0;
            for (let g = a + 1; g < a + n; g++) {
                moved += (tn[g - 1] - pre[g - 1]) * dx;
                flux[g] -= moved;
            }
            for (let c = a; c < a + n; c++) {
                const inL = flux[c];
                const inR = flux[c + 1];
                const upL = inL > 0 ? c - 1 : c;
                const upR = inR > 0 ? c : c + 1;
                E[c] += sE[c] * ht[c] - (this.carried(inR, sE, upR) - this.carried(inL, sE, upL)) / dx;
                M[c] += sM[c] * ht[c] - (this.carried(inR, sM, upR) - this.carried(inL, sM, upL)) / dx;
                A[c] += sA[c] * ht[c] - (this.carried(inR, sA, upR) - this.carried(inL, sA, upL)) / dx;
                h[c] += tn[c];
                q[c] += plan.qNew[c - a];
            }
            this.repair(a, n);
        }
        water.settle(water);
    }

    /** Flujo `flux` por la cara que arrastra el escalar específico `s[up]` de la celda aguas arriba (0 si no hay flujo). */
    carried(flux, s, up) {
        return flux === 0 ? 0 : flux * s[up];
    }

    /**
     * Coeficiente de difusión `2ν` (m²/s) de la cara `g` (entre las columnas `g − 1` y `g`), con `ν = μ/ρ` de la mezcla de
     * cada columna, y difusión implícita de `h̃` (`tn`) y `q̃` (`plan.qNew`) de la cuenca `(a, n)`.
     */
    damp(a, n, dt, plan) {
        const water = this.water;
        const { nu, coef, tn } = this;
        const sg = water.sgHoney;
        for (let c = a; c < a + n; c++) {
            const X = water.honeyFraction(c);
            nu[c] = water.muOf(c) / (RHO_W * (1 + (sg - 1) * X));
        }
        for (let g = a + 1; g < a + n; g++) coef[g] = dt * (nu[g - 1] + nu[g]);
        coef[a] = dt * 2 * nu[a];
        coef[a + n] = dt * 2 * nu[a + n - 1];
        this.factor(a, n, false);
        this.solve(a, n, tn);
        this.factor(a, n, true);
        const shifted = this.work;
        for (let i = 0; i < n; i++) shifted[a + i] = plan.qNew[i];
        this.solve(a, n, shifted);
        for (let i = 0; i < n; i++) plan.qNew[i] = shifted[a + i];
    }

    /**
     * Pasa el contenido (h, q, E, M, A) de una columna que quedó con h negativo (redondeo o el límite de la
     * difusión) a la vecina más mojada de la cuenca: conserva las cinco sumas.
     */
    repair(a, n) {
        const { h, q, E, M, A } = this.water;
        for (let c = a; c < a + n; c++) {
            if (h[c] >= 0) continue;
            const left = c > a ? h[c - 1] : -Infinity;
            const right = c < a + n - 1 ? h[c + 1] : -Infinity;
            const to = left >= right ? c - 1 : c + 1;
            h[to] += h[c];
            q[to] += q[c];
            E[to] += E[c];
            M[to] += M[c];
            A[to] += A[c];
            h[c] = 0;
            q[c] = 0;
            E[c] = 0;
            M[c] = 0;
            A[c] = 0;
        }
    }

    /**
     * Rotación de fase exacta de la superficie de la cuenca `(a, n)`: calcula en `plan.flux` el flujo de cara `∫q̃ dt`
     * (cara `f` entre las celdas `f − 1` y `f`) y en `plan.qNew` el `q̃` nuevo, con la profundidad interpolada por celda
     * entre los niveles.
     */
    spectrum(plan, a, n) {
        const { re, im, hk, qk, cosT, sinT, fft, used, lv, fr, lvF, frF, flux, qNew } = plan;
        const { ht, qt } = this;
        const { h } = this.water;
        const m = 2 * n;
        for (let j = 0; j < n; j++) {
            re[j] = ht[a + j];
            re[m - 1 - j] = ht[a + j];
            im[j] = qt[a + j];
            im[m - 1 - j] = -qt[a + j];
        }
        fft.forward(re, im);
        for (let k = 1; k < n; k++) {
            const zr = re[k];
            const zi = im[k];
            const cr = re[m - k];
            const ci = im[m - k];
            const er = (zr + cr) / 2;
            const ei = (zi - ci) / 2;
            const oRe = (zi + ci) / 2;
            const oIm = -(zr - cr) / 2;
            hk[k] = (cosT[k] * er + sinT[k] * ei) / n;
            qk[k] = -(cosT[k] * oIm - sinT[k] * oRe) / n;
        }
        used.fill(0);
        for (let i = 0; i < n; i++) this.level(plan, h[a + i], lv, fr, i);
        for (let f = 1; f < n; f++) this.level(plan, (h[a + f - 1] + h[a + f]) / 2, lvF, frF, f);
        flux.fill(0);
        qNew.fill(0);
        for (let j = 0; j < DISPERSION.levels; j++) {
            if (used[j] === 0) continue;
            const { a1, b1, a2, b2 } = { a1: plan.a1[j], b1: plan.b1[j], a2: plan.a2[j], b2: plan.b2[j] };
            re.fill(0);
            im.fill(0);
            for (let k = 1; k < n; k++) {
                const fc = a1[k] * qk[k] + b1[k] * hk[k];
                const qc = a2[k] * qk[k] + b2[k] * hk[k];
                re[k] = (qc * cosT[k]) / 2;
                im[k] = -fc / 2 + (qc * sinT[k]) / 2;
                re[m - k] = -(qc * cosT[k]) / 2;
                im[m - k] = fc / 2 + (qc * sinT[k]) / 2;
            }
            fft.inverse(re, im);
            for (let f = 1; f < n; f++) {
                const w = lvF[f] === j ? 1 - frF[f] : lvF[f] + 1 === j ? frF[f] : 0;
                if (w !== 0) flux[f] += w * re[f];
            }
            for (let c = 0; c < n; c++) {
                const w = lv[c] === j ? 1 - fr[c] : lv[c] + 1 === j ? fr[c] : 0;
                if (w !== 0) qNew[c] += w * im[c];
            }
        }
    }
}
