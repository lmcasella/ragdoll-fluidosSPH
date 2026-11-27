import { MATERIALS, SIGMA_W, K_MU } from "../fluids/materials.js";
import { bodyShapes } from "../fluids/bodyShapes.js";
import { FLUID, weaponById, particleFlags } from "../combat/weapons.js";
import { ORIGIN } from "../fluids/particleStore.js";
import { createSeededRandom } from "../core/math/random.js";

/** Densidad del agua (kg/m³). */
const RHO_W = 1000;

/** Espesor `b` de la rebanada 2D (m): `σ_w / ρ_w`. Pasa las fuerzas por unidad de ancho a newtons. */
const THICKNESS = SIGMA_W / RHO_W;

/** Área (m²) por debajo de la cual un corte de franja se descarta por ser una esquirla numérica. */
const MIN_AREA = 1e-12;

/** Tolerancia (m) para asignar una arista vertical a la franja que la contiene cuando cae justo en una cara. */
const FACE_EPS = 1e-9;

/**
 * Datos de las salpicaduras (docs/design/14-agua.md §14.5). `efficiency` es la fracción del trabajo que el arrastre de
 * una franja le hace al agua que se vuelve energía cinética de las gotas: aproximación declarada, aprobada por el
 * usuario, con rango de 5 % a 10 %. `angle` y `spread` (rad) dan la dirección de lanzamiento sobre la horizontal.
 * `maxHoney` y `maxAcid` son las fracciones de miel (volumen) y de ácido (masa) de la columna desde las que ya no
 * salpica: solo sale agua (límite declarado).
 */
export const SPLASH = { efficiency: 0.08, angle: Math.PI / 3, spread: (10 * Math.PI) / 180, maxHoney: 0.01, maxAcid: 0.005 };

/**
 * Recorta el polígono `src` (`n` vértices `[x, y, …]`) con el semiplano `a x + b y ≤ c` (Sutherland–Hodgman) y deja el
 * resultado en `dst`. Devuelve la cantidad de vértices.
 */
function clip(src, n, dst, a, b, c) {
    let m = 0;
    let px = src[2 * n - 2];
    let py = src[2 * n - 1];
    let pd = a * px + b * py - c;
    for (let i = 0; i < n; i++) {
        const x = src[2 * i];
        const y = src[2 * i + 1];
        const d = a * x + b * y - c;
        if (d <= 0) {
            if (pd > 0) {
                const t = pd / (pd - d);
                dst[2 * m] = px + (x - px) * t;
                dst[2 * m + 1] = py + (y - py) * t;
                m++;
            }
            dst[2 * m] = x;
            dst[2 * m + 1] = y;
            m++;
        } else if (pd <= 0) {
            const t = pd / (pd - d);
            dst[2 * m] = px + (x - px) * t;
            dst[2 * m + 1] = py + (y - py) * t;
            m++;
        }
        px = x;
        py = y;
        pd = d;
    }
    return m;
}

/**
 * Flotación de Arquímedes por pieza sobre el campo de alturas `ShallowWater` (docs/design/14-agua.md §14.5). Una vez por
 * paso fijo y antes de `stepWorld`, `apply(dt)` recorta cada pieza de los robots registrados contra cada columna del
 * campo y le da, como impulsos (Box2D borra las fuerzas en cada subpaso), una vez por pieza:
 *
 * - el empuje de Froude–Krylov por franja, `ρ_col g b A_i (−∂η/∂x, 1)`, aplicado en el centroide sumergido (el
 *   gradiente usa solo las columnas vecinas mojadas);
 * - el arrastre de presión por arista original sumergida, `−½ ρ_col C_d (n·v̂_r)₊ ℓ |v_r| v_r b`, con `C_d` de
 *   `materials.drag` por forma, más un término viscoso `−k_μ μ_col b v_r` repartido entre las franjas según su área
 *   y aplicado en su centroide;
 * - el tope por masa reducida de cada franja, `|J_arrastre,i| ≤ m_red |v_r,i|` con `m_red = m m_col/(m + m_col)` y
 *   `m_col = σ_w h_i dx`, y la reacción horizontal sobre el agua, `addMomentum(i, −J_x/(σ_w dx))`.
 *
 * Salpicaduras (con `splash: { store, seed }`): la pieza que perfora la superficie en una franja con `v_n < 0` y
 * `Fr = v_n²/(g ℓ) > 1` (ℓ, ancho mojado de la franja) encola gotas durante `apply`, con la energía acotada por
 * `ε W` (`W = −J·v_r`, el trabajo del arrastre de la franja; el resto se acarrea por columna), el espesor mínimo de
 * la columna y el impulso vertical `|J_y|` de la franja. `releaseSplashes()`, después de `stepWorld`, las crea con
 * `store.create` (`ORIGIN.SPLASH`) y le quita al campo, columna por columna, su `h`, `q` y `E`. `stats.splash` lleva
 * lo lanzado: gotas, área (m²), cantidad de movimiento horizontal y vertical (kg·m/s) e impulso vertical de las franjas.
 *
 * No modela la reacción vertical sobre el campo ni la masa agregada. `config.dragScale` y `config.viscousK` en 0 apagan el
 * arrastre de presión y el viscoso. Cada pieza expone `area` (suma de las áreas de sus fixtures) y `submerged` (área
 * sumergida del último `apply`), en m², y, para el monitor de `src/core/debug.js`, `cx` y `cy` (centro de masa en el mundo, m),
 * `buoyancy` y `drag` (fuerza media del último paso, N, `{ x, y }`: el arrastre incluye el viscoso y el tope). Reusa buffers y dos `b2Vec2` propios: `dispose` los libera.
 */
export class Buoyancy {
    constructor(water, materials = MATERIALS, { gravity = 10, dragScale = 1, viscousK = K_MU, splash = null } = {}) {
        this.water = water;
        this.drag = materials.drag;
        this.gravity = gravity;
        this.dragScale = dragScale;
        this.viscousK = viscousK;
        this.pieces = [];
        this.stats = { capped: 0 };
        const N = water.N;
        this.polyA = new Float64Array(128);
        this.polyB = new Float64Array(128);
        this.world = new Float64Array(32);
        this.area = new Float64Array(N);
        this.cx = new Float64Array(N);
        this.cy = new Float64Array(N);
        this.jx = new Float64Array(N);
        this.jy = new Float64Array(N);
        this.jl = new Float64Array(N);
        this.rho = new Float64Array(N);
        this.mu = new Float64Array(N);
        this.stamp = new Int32Array(N);
        this.clock = 0;
        this.xlo = new Float64Array(N);
        this.xhi = new Float64Array(N);
        this.pierce = new Uint8Array(N);
        this.impulse = new Box2D.b2Vec2(0, 0);
        this.point = new Box2D.b2Vec2(0, 0);
        this.store = splash?.store ?? null;
        this.events = [];
        this.eventCount = 0;
        if (this.store) {
            const rain = weaponById(FLUID.WATER);
            this.seed = splash.seed ?? null;
            this.dropArea = (1.5 * this.store.system.GetRadius()) ** 2;
            this.carry = new Float64Array(N);
            this.pending = new Float64Array(N);
            this.def = new Box2D.b2ParticleDef();
            this.position = new Box2D.b2Vec2(0, 0);
            this.velocity = new Box2D.b2Vec2(0, 0);
            this.color = new Box2D.b2ParticleColor(...rain.color, 255);
            this.def.set_flags(particleFlags(rain));
            this.def.set_color(this.color);
            this.props = { kind: FLUID.WATER, origin: ORIGIN.SPLASH, enthalpy: 0 };
        }
        this.reset();
    }

    /** Vacía las salpicaduras pendientes, el resto de energía por columna y las estadísticas, y reinicia el azar con la semilla. */
    reset() {
        this.eventCount = 0;
        this.stats.splash = { drops: 0, area: 0, momentumX: 0, momentumY: 0, impulseY: 0 };
        if (!this.store) return;
        this.carry.fill(0);
        this.pending.fill(0);
        this.random = createSeededRandom(this.seed ?? (Math.random() * 2 ** 32) >>> 0);
    }

    /** Libera los vectores nativos. */
    dispose() {
        Box2D.destroy(this.impulse);
        Box2D.destroy(this.point);
        if (!this.store) return;
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        Box2D.destroy(this.velocity);
        Box2D.destroy(this.color);
    }

    /**
     * Lee las formas de todos los cuerpos de `players` (cada uno con `rag.bodies`); se vuelve a llamar cada vez que
     * cambian los robots (aparición, giro, ronda nueva), igual que `DamageSystem.register`.
     */
    register(players) {
        this.pieces = [];
        for (const player of players) {
            for (const body of player.rag.bodies.values()) {
                const shapes = bodyShapes(body);
                if (shapes.length === 0) continue;
                const center = body.GetLocalCenter();
                let area = 0;
                for (const s of shapes) area += s.area;
                this.pieces.push({ body, shapes, lx: center.get_x(), ly: center.get_y(), area, submerged: 0, cx: 0, cy: 0, buoyancy: { x: 0, y: 0 }, drag: { x: 0, y: 0 } });
            }
        }
    }

    /** Aplica el empuje y el arrastre de este paso a todas las piezas. `dt` es el paso fijo (s). */
    apply(dt) {
        this.clock++;
        this.stats.capped = 0;
        for (const piece of this.pieces) this.applyPiece(piece, dt);
    }

    /** Densidad y viscosidad de la columna `c`, calculadas una vez por `apply`. */
    column(c) {
        if (this.stamp[c] === this.clock) return;
        this.stamp[c] = this.clock;
        const x = this.water.center(c);
        this.rho[c] = this.water.densityAt(x);
        this.mu[c] = this.viscousK > 0 ? this.water.viscosityAt(x) : 0;
    }

    /** Pendiente de la superficie `∂η/∂x` en la columna `c` con sus vecinas mojadas (0 si no tiene). */
    slope(c) {
        const { b, h, i0, i1, dx, config } = this.water;
        const hd = config.hDry;
        const left = c > i0 && h[c - 1] > hd;
        const right = c < i1 - 1 && h[c + 1] > hd;
        const eta = b[c] + h[c];
        if (left && right) return (b[c + 1] + h[c + 1] - b[c - 1] - h[c - 1]) / (2 * dx);
        if (right) return (b[c + 1] + h[c + 1] - eta) / dx;
        if (left) return (eta - b[c - 1] - h[c - 1]) / dx;
        return 0;
    }

    applyPiece(piece, dt) {
        const { water, world, polyA, polyB } = this;
        const body = piece.body;
        const mass = body.GetMass();
        piece.submerged = 0;
        piece.buoyancy.x = piece.buoyancy.y = piece.drag.x = piece.drag.y = 0;
        if (mass <= 0) return;
        const { x0, dx, N, h, b, config } = water;
        const hd = config.hDry;
        const pos = body.GetPosition();
        const px = pos.get_x();
        const py = pos.get_y();
        const angle = body.GetAngle();
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cxm = px + cos * piece.lx - sin * piece.ly;
        const cym = py + sin * piece.lx + cos * piece.ly;
        const vel = body.GetLinearVelocity();
        const vcx = vel.get_x();
        const vcy = vel.get_y();
        const omega = body.GetAngularVelocity();
        const gb = this.gravity * THICKNESS;
        const cdScale = this.dragScale;
        let jx = 0;
        let jy = 0;
        let jl = 0;
        this.lo = N;
        this.hi = -1;

        for (const shape of piece.shapes) {
            const { n, verts } = shape;
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (let i = 0; i < n; i++) {
                const lxv = verts[2 * i];
                const lyv = verts[2 * i + 1];
                const wx = px + cos * lxv - sin * lyv;
                const wy = py + sin * lxv + cos * lyv;
                world[2 * i] = wx;
                world[2 * i + 1] = wy;
                if (wx < minX) minX = wx;
                if (wx > maxX) maxX = wx;
                if (wy < minY) minY = wy;
                if (wy > maxY) maxY = wy;
            }
            if (maxX <= x0 + water.i0 * dx || minX >= x0 + water.i1 * dx) continue;
            const c0 = Math.max(water.i0, Math.floor((minX - x0) / dx));
            const c1 = Math.min(water.i1 - 1, Math.floor((maxX - x0) / dx));

            for (let c = c0; c <= c1; c++) {
                if (h[c] <= hd) continue;
                const zeta = b[c] + h[c];
                if (minY >= zeta) continue;
                const xl = x0 + c * dx;
                let m = clip(world, n, polyA, -1, 0, -xl);
                if (m < 3) continue;
                m = clip(polyA, m, polyB, 1, 0, xl + dx);
                if (m < 3) continue;
                m = clip(polyB, m, polyA, 0, 1, zeta);
                if (m < 3) continue;
                let a2 = 0;
                let sx = 0;
                let sy = 0;
                for (let i = 0, j = m - 1; i < m; j = i++) {
                    const cross = polyA[2 * j] * polyA[2 * i + 1] - polyA[2 * i] * polyA[2 * j + 1];
                    a2 += cross;
                    sx += (polyA[2 * j] + polyA[2 * i]) * cross;
                    sy += (polyA[2 * j + 1] + polyA[2 * i + 1]) * cross;
                }
                const area = a2 / 2;
                if (area <= MIN_AREA) continue;
                const ccx = sx / (6 * area);
                const ccy = sy / (6 * area);
                this.column(c);
                const f = this.rho[c] * gb * area;
                const fx = -this.slope(c) * f;
                jx += fx * dt;
                jy += f * dt;
                jl += ((ccx - cxm) * f - (ccy - cym) * fx) * dt;
                if (this.store) this.markStrip(c, m, maxY > zeta);
                this.area[c] += area;
                this.cx[c] += area * ccx;
                this.cy[c] += area * ccy;
                piece.submerged += area;
                if (c < this.lo) this.lo = c;
                if (c > this.hi) this.hi = c;
            }

            if (cdScale > 0) {
                const cd = this.drag[shape.kind] * cdScale;
                for (let k = 0, j = n - 1; k < n; j = k++) {
                    this.edgeDrag(world[2 * j], world[2 * j + 1], world[2 * k], world[2 * k + 1], cd, cxm, cym, vcx, vcy, omega, dt);
                }
            }
        }

        piece.cx = cxm;
        piece.cy = cym;
        piece.buoyancy.x = jx / dt;
        piece.buoyancy.y = jy / dt;
        const { lo, hi } = this;
        let sub = 0;
        for (let c = lo; c <= hi; c++) sub += this.area[c];
        for (let c = lo; c <= hi; c++) {
            const area = this.area[c];
            if (area <= MIN_AREA) {
                this.clearColumn(c);
                continue;
            }
            const ccx = this.cx[c] / area;
            const ccy = this.cy[c] / area;
            const rx = ccx - cxm;
            const ry = ccy - cym;
            const rvx = vcx - omega * ry - water.uOf(c);
            const rvy = vcy + omega * rx;
            let dX = this.jx[c];
            let dY = this.jy[c];
            let dL = this.jl[c];
            if (this.viscousK > 0) {
                const k = (-this.viscousK * this.mu[c] * THICKNESS * (area / sub)) * dt;
                const vx = k * rvx;
                const vy = k * rvy;
                dX += vx;
                dY += vy;
                dL += rx * vy - ry * vx;
            }
            const massCol = SIGMA_W * h[c] * dx;
            const reduced = (mass * massCol) / (mass + massCol);
            const limit = reduced * Math.hypot(rvx, rvy);
            const mag = Math.hypot(dX, dY);
            if (mag > limit && mag > 0) {
                const s = limit / mag;
                dX *= s;
                dY *= s;
                dL *= s;
                this.stats.capped++;
            }
            if (this.store && this.pierce[c] === 1 && rvy < 0) this.queueSplash(c, ccx > cxm, rvx, rvy, dX, dY);
            jx += dX;
            jy += dY;
            jl += dL;
            water.addMomentum(c, -dX / (SIGMA_W * dx));
            this.clearColumn(c);
        }

        piece.drag.x = jx / dt - piece.buoyancy.x;
        piece.drag.y = jy / dt - piece.buoyancy.y;
        if (jx !== 0 || jy !== 0) {
            this.impulse.set_x(jx);
            this.impulse.set_y(jy);
            this.point.set_x(cxm);
            this.point.set_y(cym);
            body.ApplyLinearImpulse(this.impulse, this.point, true);
        }
        if (jl !== 0) body.ApplyAngularImpulse(jl, true);
    }

    /**
     * Anota en la franja `c` el recorte `polyA` de `m` vértices: el tramo horizontal que moja (`xlo`, `xhi`, unión de
     * las fixtures) y si la pieza perfora la superficie (`pierce`).
     */
    markStrip(c, m, pierces) {
        const { polyA } = this;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < m; i++) {
            const x = polyA[2 * i];
            if (x < lo) lo = x;
            if (x > hi) hi = x;
        }
        if (this.area[c] === 0) {
            this.xlo[c] = lo;
            this.xhi[c] = hi;
            this.pierce[c] = 0;
        } else {
            if (lo < this.xlo[c]) this.xlo[c] = lo;
            if (hi > this.xhi[c]) this.xhi[c] = hi;
        }
        if (pierces) this.pierce[c] = 1;
    }

    /**
     * Encola las gotas de la franja `c` que entra al agua: `outward` dice si salen hacia `+x`, `(rvx, rvy)` es la
     * velocidad relativa al agua y `(dX, dY)` el impulso del arrastre de la franja. Las crea `releaseSplashes`.
     */
    queueSplash(c, outward, rvx, rvy, dX, dY) {
        const { water, dropArea } = this;
        const speed = -rvy;
        const width = this.xhi[c] - this.xlo[c];
        if (width <= 0 || (speed * speed) / (this.gravity * width) <= 1) return;
        if (water.honeyFraction(c) >= SPLASH.maxHoney || water.acidFraction(c) >= SPLASH.maxAcid) {
            this.carry[c] = 0;
            return;
        }
        const work = -(dX * rvx + dY * rvy);
        if (work <= 0) return;
        const mass = SIGMA_W * dropArea;
        const energy = 0.5 * mass * speed * speed;
        this.carry[c] += SPLASH.efficiency * work;
        const room = Math.floor(((water.h[c] - water.config.hMin) * water.dx - this.pending[c]) / dropArea);
        const wanted = Math.min(Math.floor(this.carry[c] / energy), room);
        if (wanted <= 0) return;
        const event = (this.events[this.eventCount] ??= { c: 0, x: 0, speed: 0, side: 1, impulseY: 0, angles: [] });
        event.angles.length = 0;
        let left = Math.abs(dY);
        for (let k = 0; k < wanted; k++) {
            const angle = SPLASH.angle + SPLASH.spread * (2 * this.random() - 1);
            const lift = mass * speed * Math.sin(angle);
            if (lift > left) break;
            left -= lift;
            event.angles.push(angle);
        }
        const count = event.angles.length;
        if (count === 0) return;
        this.carry[c] = Math.min(this.carry[c] - count * energy, energy);
        this.pending[c] += count * dropArea;
        event.c = c;
        event.speed = speed;
        event.side = outward ? 1 : -1;
        event.x = (outward ? this.xhi[c] : this.xlo[c]) + event.side * 1.5 * this.store.system.GetRadius();
        event.impulseY = Math.abs(dY);
        this.eventCount++;
    }

    /**
     * Crea las gotas encoladas por `apply`, una vez por paso fijo y después de `stepWorld` (y de `store.afterStep()`):
     * nunca dentro de un callback. Cada gota sale con `|v| = v_n` desde el borde mojado de la franja, 2 r sobre la
     * superficie que tenía la columna, separadas `1,5 r` sobre su rayo, y le quita al campo `A_p/dx` de `h`, su
     * cantidad de movimiento `A_p v_x/dx` de `q` y su parte de `E`, con su entalpía específica. Si el motor no tiene
     * lugar para una gota, no sale ni se descuenta.
     */
    releaseSplashes() {
        const { water, dropArea, store, def, position, velocity, props } = this;
        const radius = store.system.GetRadius();
        const part = dropArea / water.dx;
        const mass = SIGMA_W * dropArea;
        const total = this.stats.splash;
        for (let e = 0; e < this.eventCount; e++) {
            const event = this.events[e];
            const c = event.c;
            this.pending[c] = 0;
            const y0 = water.surfaceAt(event.x) + 2 * radius;
            let made = 0;
            for (let k = 0; k < event.angles.length; k++) {
                if (water.h[c] - part < water.config.hMin) break;
                const angle = event.angles[k];
                const reach = k * 1.5 * radius;
                const vx = event.side * event.speed * Math.cos(angle);
                const vy = event.speed * Math.sin(angle);
                position.set_x(event.x + event.side * reach * Math.cos(angle));
                position.set_y(y0 + reach * Math.sin(angle));
                velocity.set_x(vx);
                velocity.set_y(vy);
                def.set_position(position);
                def.set_velocity(velocity);
                const hh = water.h[c];
                const energy = water.E[c];
                props.enthalpy = energy / (SIGMA_W * hh);
                if (store.create(def, props) < 0) break;
                water.h[c] = hh - part;
                water.q[c] -= (dropArea * vx) / water.dx;
                water.E[c] = energy - (part * energy) / hh;
                total.drops++;
                total.area += dropArea;
                total.momentumX += mass * vx;
                total.momentumY += mass * vy;
                made++;
            }
            if (made > 0) total.impulseY += event.impulseY;
        }
        this.eventCount = 0;
    }

    /** Pone en cero los acumuladores de la franja `c`. */
    clearColumn(c) {
        this.area[c] = 0;
        this.cx[c] = 0;
        this.cy[c] = 0;
        this.jx[c] = 0;
        this.jy[c] = 0;
        this.jl[c] = 0;
    }

    /**
     * Arrastre de presión de la arista `(ax, ay)`→`(bx, by)` de un polígono antihorario, ya en el mundo, por franja:
     * suma el impulso y su momento respecto del centro de masa `(cxm, cym)` en los acumuladores de la franja.
     */
    edgeDrag(ax, ay, bx, by, cd, cxm, cym, vcx, vcy, omega, dt) {
        const { water } = this;
        const { x0, dx, h, b, config } = water;
        const ex = bx - ax;
        const ey = by - ay;
        const len = Math.hypot(ex, ey);
        if (len < 1e-12) return;
        const nx = ey / len;
        const ny = -ex / len;
        const vertical = Math.abs(ex) < 1e-12;
        let c0;
        let c1;
        if (vertical) {
            c0 = Math.floor((ax - x0) / dx - FACE_EPS * Math.sign(nx));
            c1 = c0;
        } else {
            c0 = Math.floor((Math.min(ax, bx) - x0) / dx);
            c1 = Math.floor((Math.max(ax, bx) - x0) / dx);
        }
        c0 = Math.max(c0, water.i0);
        c1 = Math.min(c1, water.i1 - 1);
        for (let c = c0; c <= c1; c++) {
            if (h[c] <= config.hDry) continue;
            let t0 = 0;
            let t1 = 1;
            if (!vertical) {
                const xl = x0 + c * dx;
                let ta = (xl - ax) / ex;
                let tb = (xl + dx - ax) / ex;
                if (ta > tb) [ta, tb] = [tb, ta];
                t0 = Math.max(t0, ta);
                t1 = Math.min(t1, tb);
            }
            const zeta = b[c] + h[c];
            if (Math.abs(ey) < 1e-12) {
                if (ay > zeta) continue;
            } else {
                const ts = (zeta - ay) / ey;
                if (ey > 0) t1 = Math.min(t1, ts);
                else t0 = Math.max(t0, ts);
            }
            if (t1 - t0 <= 1e-12) continue;
            const tm = (t0 + t1) / 2;
            const mx = ax + tm * ex;
            const my = ay + tm * ey;
            this.column(c);
            const rvx = vcx - omega * (my - cym) - water.uOf(c);
            const rvy = vcy + omega * (mx - cxm);
            const speed = Math.hypot(rvx, rvy);
            if (speed < 1e-9) continue;
            const facing = (nx * rvx + ny * rvy) / speed;
            if (facing <= 0) continue;
            const coef = 0.5 * this.rho[c] * cd * facing * (t1 - t0) * len * speed * THICKNESS * dt;
            const dX = -coef * rvx;
            const dY = -coef * rvy;
            this.jx[c] += dX;
            this.jy[c] += dY;
            this.jl[c] += (mx - cxm) * dY - (my - cym) * dX;
            if (c < this.lo) this.lo = c;
            if (c > this.hi) this.hi = c;
        }
    }
}
