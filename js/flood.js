// Inundación (muerte súbita): lluvia desde el techo en el sistema de partículas del agua del nivel.
// El nivel no se mide sobre las partículas: lo da una curva por tiempo de ronda y el emisor repone las gotas
// necesarias para llenarlo. No aplica daño: expone `level` y DamageSystem moja a los robots que quedan bajo él.
import { LEVEL } from "./level.js";

const SLICE = 0.05; // m, paso de integración del ancho libre
const GOLDEN = 0.6180339887498949;
// GetUserDataBuffer devuelve el puntero como número (no como objeto envuelto): no pasa por getPointer
export const RAIN_MARK = -1; // userData de las gotas; la pileta queda en 0 y los disparos usan ids positivos

// Nivel objetivo del agua (m) según el tiempo de ronda
export function floodLevel(roundTime, level = LEVEL) {
    const { start, riseSpeed, maxLevel } = level.flood;
    if (roundTime <= start) return level.pool.surface;
    return Math.min(maxLevel, level.pool.surface + riseSpeed * (roundTime - start));
}

// Ancho libre (m) a cada franja de 0,05 m desde pool.surface, descontando los sólidos que la cruzan,
// y área acumulada. Se calcula una vez por nivel de datos.
const tables = new WeakMap();

function freeWidths(level) {
    let table = tables.get(level);
    if (table) return table;
    const { minX, maxX, maxY } = level.bounds;
    const base = level.pool.surface;
    const count = Math.ceil((maxY - base) / SLICE);
    const widths = new Float64Array(count);
    const cumulative = new Float64Array(count + 1);
    const spans = [];
    for (let k = 0; k < count; k++) {
        const y = base + (k + 0.5) * SLICE;
        spans.length = 0;
        for (const s of level.solids) {
            if (y > s.y - s.h / 2 && y < s.y + s.h / 2) {
                spans.push([Math.max(minX, s.x - s.w / 2), Math.min(maxX, s.x + s.w / 2)]);
            }
        }
        spans.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        let reach = minX;
        for (const [a, b] of spans) {
            if (b <= reach) continue;
            covered += b - Math.max(a, reach);
            reach = b;
        }
        widths[k] = maxX - minX - covered;
        cumulative[k + 1] = cumulative[k] + widths[k] * SLICE;
    }
    table = { widths, cumulative, count, base };
    tables.set(level, table);
    return table;
}

// Área libre (m²) entre pool.surface y `height`
export function waterArea(height, level = LEVEL) {
    const { widths, cumulative, count, base } = freeWidths(level);
    const rel = Math.max(0, height - base) / SLICE;
    const k = Math.min(count - 1, Math.floor(rel));
    if (k < 0) return 0;
    return cumulative[k] + widths[k] * (rel - k) * SLICE;
}

// Gotas de lluvia necesarias en el mapa para sostener el nivel de ese instante
export function rainTarget(roundTime, level = LEVEL) {
    return Math.round(level.flood.density * waterArea(floodLevel(roundTime, level), level));
}

// x de la gota número i: secuencia áurea, reparto parejo y determinista
export function rainX(i, flood = LEVEL.flood) {
    const frac = (i * GOLDEN) % 1;
    return flood.emitX1 + frac * (flood.emitX2 - flood.emitX1);
}

export class Flood {
    constructor(world, system, level = LEVEL) {
        this.world = world;
        this.system = system;
        this.data = level;
        this.config = level.flood;
        // Objetos nativos de trabajo: se crean una vez y se reutilizan en cada gota
        this.def = new Box2D.b2ParticleDef();
        this.position = new Box2D.b2Vec2(0, this.config.emitY);
        this.velocity = new Box2D.b2Vec2(0, -this.config.dropSpeed);
        this.color = new Box2D.b2ParticleColor(40, 120, 255, 255);
        this.def.set_velocity(this.velocity);
        this.def.set_color(this.color);
        this.roundTime = 0;
        this.emitted = 0;
        this.credit = 0;
        this.drops = 0;
    }

    get active() {
        return this.roundTime >= this.config.start;
    }

    // Nivel del agua para el daño; -Infinity antes de que empiece la inundación
    get level() {
        return this.active ? floodLevel(this.roundTime, this.data) : -Infinity;
    }

    // Una vez por paso fijo, antes de stepWorld
    step(roundTime, dt) {
        this.roundTime = roundTime;
        const cfg = this.config;
        const system = this.system;
        const count = system.GetParticleCount();
        const marks = system.GetUserDataBuffer() >> 2;
        const positions = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const velocities = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const drainAbove = floodLevel(roundTime, this.data) + cfg.drainHeight;
        const drainSpeed2 = cfg.drainSpeed * cfg.drainSpeed;

        // Cuenta las gotas vivas y escurre las quietas muy por encima del agua
        let drops = 0;
        for (let i = 0; i < count; i++) {
            if (Box2D.HEAP32[marks + i] !== RAIN_MARK) continue;
            const vx = Box2D.HEAPF32[velocities + i * 2];
            const vy = Box2D.HEAPF32[velocities + i * 2 + 1];
            if (Box2D.HEAPF32[positions + i * 2 + 1] > drainAbove && vx * vx + vy * vy < drainSpeed2) {
                system.DestroyParticle(i);
            } else {
                drops++;
            }
        }
        this.drops = drops;
        if (!this.active) return;

        const missing = rainTarget(roundTime, this.data) - drops;
        if (missing <= 0) {
            this.credit = 0;
            return;
        }
        this.credit += cfg.maxRate * dt;
        const wanted = Math.floor(this.credit);
        const room = cfg.maxParticles - count;
        const n = Math.min(wanted, missing, Math.max(0, room));
        for (let k = 0; k < n; k++) this.emit();
        this.credit = n < wanted ? this.credit - wanted : this.credit - n;
    }

    emit() {
        this.position.set_x(rainX(this.emitted++, this.config));
        this.def.set_position(this.position);
        const index = this.system.CreateParticle(this.def);
        if (index < 0) return;
        Box2D.HEAP32[(this.system.GetUserDataBuffer() >> 2) + index] = RAIN_MARK;
        this.drops++;
    }

    // Destruye la lluvia y reinicia el estado; llamar fuera de callbacks (entre frames)
    reset() {
        const count = this.system.GetParticleCount();
        const marks = this.system.GetUserDataBuffer() >> 2;
        for (let i = 0; i < count; i++) {
            if (Box2D.HEAP32[marks + i] === RAIN_MARK) this.system.DestroyParticle(i);
        }
        this.roundTime = 0;
        this.emitted = 0;
        this.credit = 0;
        this.drops = 0;
    }

    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        Box2D.destroy(this.velocity);
        Box2D.destroy(this.color);
    }
}
