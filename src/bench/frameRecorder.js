import { BENCH } from "./benchScript.js";

/**
 * Percentil por rango más cercano: el menor valor que deja por debajo a `percent` % de las muestras.
 * @param {number[]} sortedValues muestras ordenadas de menor a mayor, no vacías
 * @param {number} percent de 0 a 100
 */
export function percentile(sortedValues, percent) {
    const rank = Math.ceil((percent / 100) * sortedValues.length);
    return sortedValues[Math.min(Math.max(rank, 1), sortedValues.length) - 1];
}

const sortedCopy = (values) => [...values].sort((first, second) => first - second);

/**
 * Junta los tiempos por frame y por subsistema de cada grupo (una escena o un minuto de partida) y los resume (ver
 * `src/bench/benchReport.js`). Solo guarda números: no conoce el juego.
 */
export class FrameRecorder {
    constructor() {
        this.groups = new Map();
        this.lapNames = [];
    }

    /** Nombres de los grupos, en el orden en que se crearon. */
    get names() {
        return [...this.groups.keys()];
    }

    groupOf(name) {
        let group = this.groups.get(name);
        if (!group) {
            group = { frameMs: [], gpuMs: [], laps: new Map(), maxParticles: 0 };
            this.groups.set(name, group);
        }
        return group;
    }

    /**
     * Anota un frame en cada grupo de `names`.
     * @param {string[]} names grupos que incluyen este frame
     * @param {number} frameMs tiempo entre este frame y el anterior, en ms
     * @param {Object<string, number>} laps ms de cada subsistema en el frame
     * @param {number} particles partículas vivas
     */
    record(names, frameMs, laps, particles) {
        for (const name of names) {
            const group = this.groupOf(name);
            group.frameMs.push(frameMs);
            group.maxParticles = Math.max(group.maxParticles, particles);
            for (const key in laps) {
                let samples = group.laps.get(key);
                if (!samples) {
                    samples = [];
                    group.laps.set(key, samples);
                    if (!this.lapNames.includes(key)) this.lapNames.push(key);
                }
                samples.push(laps[key]);
            }
        }
    }

    /** Anota un tiempo de GPU, en ms, en cada grupo de `names`. */
    recordGpu(names, gpuMs) {
        for (const name of names) this.groupOf(name).gpuMs.push(gpuMs);
    }

    /**
     * Resumen de un grupo: `frames`, `median`, `p95`, `p99` y `worst` (ms por frame), `maxParticles`, `gpuMedian` (ms, o
     * `null` sin GPU) y `laps` (mediana en ms de cada subsistema).
     */
    summary(name) {
        const group = this.groupOf(name);
        const frames = sortedCopy(group.frameMs);
        if (frames.length === 0) return { frames: 0, median: 0, p95: 0, p99: 0, worst: 0, maxParticles: 0, gpuMedian: null, laps: {} };
        const { median, p95, p99 } = BENCH.percentiles;
        const laps = {};
        for (const [key, samples] of group.laps) laps[key] = percentile(sortedCopy(samples), median);
        return {
            frames: frames.length,
            median: percentile(frames, median),
            p95: percentile(frames, p95),
            p99: percentile(frames, p99),
            worst: frames[frames.length - 1],
            maxParticles: group.maxParticles,
            gpuMedian: group.gpuMs.length > 0 ? percentile(sortedCopy(group.gpuMs), median) : null,
            laps,
        };
    }
}
