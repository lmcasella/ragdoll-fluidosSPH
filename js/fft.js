/** Factores primos con los que la FFT hace mariposas directas; con otro factor primo se usa Bluestein. */
const RADICES = [2, 3, 5, 7];

/**
 * FFT compleja directa (`e^{-2πi jk/n}`, sin normalizar) de longitud `n` cualquiera, en el lugar y con buffers
 * propios reutilizados. Si `n` solo tiene los factores 2, 3, 5 y 7 usa una FFT de base mixta recursiva
 * (decimación en el tiempo); si no, el algoritmo de Bluestein (Rabiner, Schafer y Rader, 1969) sobre una FFT de
 * longitud potencia de 2. `inverse` hace la transformada de signo opuesto, también sin normalizar. Módulo hoja:
 * JS puro, sin `Box2D`.
 */
export class Fft {
    constructor(n) {
        this.n = n;
        this.factors = [];
        let rest = n;
        for (const p of RADICES) {
            while (rest % p === 0) {
                this.factors.push(p);
                rest /= p;
            }
        }
        this.smooth = rest === 1;
        if (this.smooth) {
            this.cos = new Float64Array(n);
            this.sin = new Float64Array(n);
            for (let j = 0; j < n; j++) {
                this.cos[j] = Math.cos((2 * Math.PI * j) / n);
                this.sin[j] = Math.sin((2 * Math.PI * j) / n);
            }
            this.outRe = new Float64Array(n);
            this.outIm = new Float64Array(n);
            this.tRe = new Float64Array(RADICES[RADICES.length - 1]);
            this.tIm = new Float64Array(RADICES[RADICES.length - 1]);
        } else {
            let m = 1;
            while (m < 2 * n - 1) m *= 2;
            this.m = m;
            this.sub = new Fft(m);
            this.chirpRe = new Float64Array(n);
            this.chirpIm = new Float64Array(n);
            this.aRe = new Float64Array(m);
            this.aIm = new Float64Array(m);
            this.kRe = new Float64Array(m);
            this.kIm = new Float64Array(m);
            for (let j = 0; j < n; j++) {
                const angle = (Math.PI * ((j * j) % (2 * n))) / n;
                this.chirpRe[j] = Math.cos(angle);
                this.chirpIm[j] = -Math.sin(angle);
                this.kRe[j] = Math.cos(angle);
                this.kIm[j] = Math.sin(angle);
                if (j > 0) {
                    this.kRe[m - j] = this.kRe[j];
                    this.kIm[m - j] = this.kIm[j];
                }
            }
            this.sub.forward(this.kRe, this.kIm);
        }
    }

    /** Transformada directa en el lugar de `(re, im)`, de longitud `n`. */
    forward(re, im) {
        if (this.smooth) {
            this.rec(re, im, 0, 1, this.outRe, this.outIm, 0, this.n, 0);
            re.set(this.outRe.subarray(0, this.n));
            im.set(this.outIm.subarray(0, this.n));
        } else {
            this.bluestein(re, im);
        }
    }

    /** Transformada de signo opuesto en el lugar, sin dividir por `n`. */
    inverse(re, im) {
        for (let j = 0; j < this.n; j++) im[j] = -im[j];
        this.forward(re, im);
        for (let j = 0; j < this.n; j++) im[j] = -im[j];
    }

    /** Un nivel de la recursión: transforma `n` muestras de `in` desde `inOff` con paso `stride` y las deja en `out` desde `outOff`. */
    rec(inRe, inIm, inOff, stride, outRe, outIm, outOff, n, level) {
        if (n === 1) {
            outRe[outOff] = inRe[inOff];
            outIm[outOff] = inIm[inOff];
            return;
        }
        const p = this.factors[level];
        const m = n / p;
        for (let r = 0; r < p; r++) {
            this.rec(inRe, inIm, inOff + r * stride, stride * p, outRe, outIm, outOff + r * m, m, level + 1);
        }
        const total = this.n;
        const step = total / n;
        const base = total / p;
        const { tRe, tIm, cos, sin } = this;
        for (let k = 0; k < m; k++) {
            for (let r = 0; r < p; r++) {
                const at = outOff + r * m + k;
                const idx = (r * k * step) % total;
                const wr = cos[idx];
                const wi = -sin[idx];
                tRe[r] = outRe[at] * wr - outIm[at] * wi;
                tIm[r] = outRe[at] * wi + outIm[at] * wr;
            }
            for (let s = 0; s < p; s++) {
                let sr = 0;
                let si = 0;
                for (let r = 0; r < p; r++) {
                    const idx = ((r * s) % p) * base;
                    const wr = cos[idx];
                    const wi = -sin[idx];
                    sr += tRe[r] * wr - tIm[r] * wi;
                    si += tRe[r] * wi + tIm[r] * wr;
                }
                outRe[outOff + k + s * m] = sr;
                outIm[outOff + k + s * m] = si;
            }
        }
    }

    /** Transformada de Bluestein en el lugar: convolución con el chirp `e^{iπ j²/n}` sobre la FFT de longitud `m`. */
    bluestein(re, im) {
        const { n, m, chirpRe, chirpIm, aRe, aIm, kRe, kIm, sub } = this;
        aRe.fill(0);
        aIm.fill(0);
        for (let j = 0; j < n; j++) {
            aRe[j] = re[j] * chirpRe[j] - im[j] * chirpIm[j];
            aIm[j] = re[j] * chirpIm[j] + im[j] * chirpRe[j];
        }
        sub.forward(aRe, aIm);
        for (let j = 0; j < m; j++) {
            const r = aRe[j] * kRe[j] - aIm[j] * kIm[j];
            aIm[j] = aRe[j] * kIm[j] + aIm[j] * kRe[j];
            aRe[j] = r;
        }
        sub.inverse(aRe, aIm);
        for (let k = 0; k < n; k++) {
            const cr = aRe[k] / m;
            const ci = aIm[k] / m;
            re[k] = cr * chirpRe[k] - ci * chirpIm[k];
            im[k] = cr * chirpIm[k] + ci * chirpRe[k];
        }
    }
}
