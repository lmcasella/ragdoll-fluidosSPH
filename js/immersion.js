// Puente agua del nivel -> disparos, en un solo sentido. LiquidFun no hace interactuar sistemas de partículas
// distintos: una vez por paso fijo, después de stepWorld, se detecta qué disparos están dentro del agua del nivel y
// se les escribe la velocidad (frenado hacia la corriente local y flotación). Ver docs/design/07-sph.md §7.6.
import { WEAPONS, fluidFromColor } from "./weapons.js";
import { LEVEL } from "./level.js";

export const IMMERSION = {
    cell: 0.5, // m, lado de la grilla
    calmSpeed: 4, // m/s; el agua más rápida (lluvia en vuelo, salpicadura) no cuenta como agua
    minNeighbors: 4, // partículas de agua en la vecindad 3x3 para que la celda esté mojada
    fullDepth: 0.5, // m de profundidad con la que la sumersión llega a 1
};

export class Immersion {
    // `gravity` (m/s², positivo) se pasa por constructor para no crear un b2Vec2 al leerla del mundo
    constructor(shotSystem, levelWater, { weapons = WEAPONS, bounds = LEVEL.bounds, gravity = 10, ...config } = {}) {
        this.shots = shotSystem;
        this.water = levelWater;
        this.config = { ...IMMERSION, ...config };
        this.gravity = gravity;
        this.minX = bounds.minX;
        this.minY = bounds.minY;
        const cell = this.config.cell;
        this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
        this.rows = Math.ceil((bounds.maxY - bounds.minY) / cell);
        const cells = this.cols * this.rows;
        this.n = new Uint16Array(cells);
        this.sumVx = new Float32Array(cells);
        this.sumVy = new Float32Array(cells);
        this.rowN = new Float32Array(cells);
        this.rowVx = new Float32Array(cells);
        this.rowVy = new Float32Array(cells);
        this.n3 = new Float32Array(cells);
        this.sum3Vx = new Float32Array(cells);
        this.sum3Vy = new Float32Array(cells);
        this.depth = new Float32Array(cells);

        // Respuesta por id de fluido (índice directo: los ids son enteros chicos)
        this.response = [];
        for (const w of weapons) this.response[w.id] = w.immersion ?? null;

        this.capacity = Math.max(shotSystem.GetMaxParticleCount(), 1);
        this.submerged = new Int32Array(this.capacity);
        this.kinds = new Uint8Array(this.capacity);
        this.count = 0;
    }

    reset() {
        this.count = 0;
    }

    // Una vez por paso fijo, después de stepWorld
    step(dt) {
        this.count = 0;
        const shotCount = this.shots.GetParticleCount();
        if (shotCount === 0) return;
        this.buildGrid();
        this.apply(dt, shotCount);
    }

    buildGrid() {
        const { cols, rows, n, sumVx, sumVy } = this;
        const { cell, calmSpeed, minNeighbors } = this.config;
        const calm2 = calmSpeed * calmSpeed;
        n.fill(0);
        sumVx.fill(0);
        sumVy.fill(0);

        const water = this.water;
        const total = water.GetParticleCount();
        const pos = Box2D.getPointer(water.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(water.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const invCell = 1 / cell;
        for (let i = 0; i < total; i++) {
            const vx = heap[vel + i * 2];
            const vy = heap[vel + i * 2 + 1];
            if (vx * vx + vy * vy >= calm2) continue;
            const cx = Math.floor((heap[pos + i * 2] - this.minX) * invCell);
            const cy = Math.floor((heap[pos + i * 2 + 1] - this.minY) * invCell);
            if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
            const c = cy * cols + cx;
            n[c]++;
            sumVx[c] += vx;
            sumVy[c] += vy;
        }

        // Caja 3x3 separable: primero a lo largo de la fila, después a lo largo de la columna
        const { rowN, rowVx, rowVy, n3, sum3Vx, sum3Vy, depth } = this;
        for (let cy = 0; cy < rows; cy++) {
            const base = cy * cols;
            for (let cx = 0; cx < cols; cx++) {
                const c = base + cx;
                let a = n[c];
                let b = sumVx[c];
                let d = sumVy[c];
                if (cx > 0) {
                    a += n[c - 1];
                    b += sumVx[c - 1];
                    d += sumVy[c - 1];
                }
                if (cx < cols - 1) {
                    a += n[c + 1];
                    b += sumVx[c + 1];
                    d += sumVy[c + 1];
                }
                rowN[c] = a;
                rowVx[c] = b;
                rowVy[c] = d;
            }
        }
        for (let cy = 0; cy < rows; cy++) {
            const base = cy * cols;
            for (let cx = 0; cx < cols; cx++) {
                const c = base + cx;
                let a = rowN[c];
                let b = rowVx[c];
                let d = rowVy[c];
                if (cy > 0) {
                    a += rowN[c - cols];
                    b += rowVx[c - cols];
                    d += rowVy[c - cols];
                }
                if (cy < rows - 1) {
                    a += rowN[c + cols];
                    b += rowVx[c + cols];
                    d += rowVy[c + cols];
                }
                n3[c] = a;
                sum3Vx[c] = b;
                sum3Vy[c] = d;
            }
        }

        // Profundidad por columna, de arriba hacia abajo
        for (let cx = 0; cx < cols; cx++) {
            let run = 0;
            for (let cy = rows - 1; cy >= 0; cy--) {
                const c = cy * cols + cx;
                if (n3[c] >= minNeighbors) {
                    run += cell;
                    depth[c] = run - cell / 2;
                } else {
                    run = 0;
                    depth[c] = 0;
                }
            }
        }
    }

    apply(dt, shotCount) {
        const { cols, rows, n3, sum3Vx, sum3Vy, depth, response, submerged, kinds } = this;
        const { cell, fullDepth } = this.config;
        const system = this.shots;
        // Los punteros se releen en cada paso: el motor puede reubicar los buffers al crear o borrar
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const colors = Box2D.getPointer(system.GetColorBuffer());
        const heap = Box2D.HEAPF32;
        const bytes = Box2D.HEAPU8;
        const invCell = 1 / cell;
        let count = 0;
        for (let i = 0; i < shotCount && count < this.capacity; i++) {
            const cx = Math.floor((heap[pos + i * 2] - this.minX) * invCell);
            const cy = Math.floor((heap[pos + i * 2 + 1] - this.minY) * invCell);
            if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
            const c = cy * cols + cx;
            const d = depth[c];
            if (d <= 0) continue;
            const kind = fluidFromColor(bytes[colors + i * 4], bytes[colors + i * 4 + 1]);
            submerged[count] = i;
            kinds[count] = kind;
            count++;
            const reaction = response[kind];
            if (!reaction) continue;

            const s = d >= fullDepth ? 1 : d / fullDepth;
            const inv = 1 / n3[c];
            const ux = sum3Vx[c] * inv;
            const uy = sum3Vy[c] * inv;
            const keep = Math.exp(-reaction.drag * s * dt);
            const vx = heap[vel + i * 2];
            const vy = heap[vel + i * 2 + 1];
            heap[vel + i * 2] = ux + (vx - ux) * keep;
            heap[vel + i * 2 + 1] = uy + (vy - uy) * keep + reaction.buoyancy * this.gravity * s * dt;
        }
        this.count = count;
    }
}
