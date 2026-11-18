// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.

const FLASH_COLOR = [255, 40, 40];
// Algo mayor que el radio físico (0,1 m) para que el filtro goo una las gotas vecinas
const PARTICLE_RADIUS = 0.14;

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(base, k) {
    const r = Math.round(base[0] + (FLASH_COLOR[0] - base[0]) * k);
    const g = Math.round(base[1] + (FLASH_COLOR[1] - base[1]) * k);
    const b = Math.round(base[2] + (FLASH_COLOR[2] - base[2]) * k);
    return `rgb(${r}, ${g}, ${b})`;
}

export function drawLevel(ctx, level, scale) {
    ctx.fillStyle = "#2b2b38";
    ctx.strokeStyle = "#555566";
    ctx.lineWidth = 2 / scale;
    for (const s of level.solids) {
        ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
        ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    }
}

// Piezas de render de un robot (en metros) a partir de su .rag.json; con flipX se espejan en el marco del cuerpo
export function buildRenderItems(rag, json, flipX) {
    const mirror = flipX ? -1 : 1;
    const items = [];
    for (const b of json.bodies) {
        const body = rag.bodies.get(b.id);
        for (const f of b.fixtures) {
            const s = f.shape;
            const item = {
                body,
                bodyId: b.id,
                type: s.type,
                cx: (s.center?.[0] ?? 0) * mirror,
                cy: s.center?.[1] ?? 0,
                angle: (s.angle ?? 0) * mirror,
            };
            if (s.type === "box") {
                item.hw = s.width / 2;
                item.hh = s.height / 2;
            } else if (s.type === "circle") {
                item.radius = s.radius;
            } else if (s.type === "polygon") {
                item.vertices = s.vertices.map(([vx, vy]) => [vx * mirror, vy]);
            }
            items.push(item);
        }
    }
    return items;
}

export function drawRobot(ctx, player, color, scale, now) {
    const base = hexToRgb(color);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / scale;
    for (const item of player.renderItems) {
        const pos = item.body.GetPosition();
        const x = pos.get_x();
        const y = pos.get_y();
        const angle = item.body.GetAngle();

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.translate(item.cx, item.cy);
        ctx.rotate(item.angle);
        ctx.fillStyle = mix(base, player.flashAmount(item.bodyId, now));
        ctx.beginPath();
        if (item.type === "box") {
            ctx.rect(-item.hw, -item.hh, item.hw * 2, item.hh * 2);
        } else if (item.type === "circle") {
            ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        } else if (item.type === "polygon") {
            item.vertices.forEach(([vx, vy], k) => (k === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy)));
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

// Mira láser: desde la boca del arma hasta el primer impacto (o el alcance máximo)
export function drawAimLaser(ctx, laser, color, scale) {
    if (!laser) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (laser.hit) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(laser.x2, laser.y2, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function drawParticles(ctx, particleSystem) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    for (let i = 0; i < count; i++) {
        const c = colorBase + i * 4;
        ctx.fillStyle = `rgb(${colors[c]}, ${colors[c + 1]}, ${colors[c + 2]})`;
        ctx.beginPath();
        ctx.arc(positions[posBase + i * 2], positions[posBase + i * 2 + 1], PARTICLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}
