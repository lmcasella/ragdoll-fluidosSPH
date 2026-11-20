/**
 * Menú principal (#154) como datos. Cada fila tiene `id`, `label` y sus `values` (`id`, `label`, y opcionalmente
 * `disabled` con su `note`); `default` es el `id` inicial. La fila `play` no tiene valores: al confirmarla se abre la
 * pantalla de asignación de controles (`ControlsScreen`).
 * `storageKey` es la clave de `localStorage` donde se recuerda la última elección; se le sube la versión cuando cambia un default
 * que tiene que llegarle a todos (una elección guardada con la clave vieja se ignora una vez).
 */
export const MENU = {
    storageKey: "ragdoll-fluidos.menu.v3",
    rows: [
        {
            id: "difficulty",
            label: "Dificultad",
            default: "normal",
            values: [
                { id: "easy", label: "Fácil" },
                { id: "normal", label: "Normal" },
                { id: "hard", label: "Difícil" },
            ],
        },
        {
            id: "map",
            label: "Mapa",
            default: "infinite",
            values: [
                { id: "classic", label: "Clásico" },
                { id: "infinite", label: "Infinito" },
            ],
        },
        { id: "play", label: "Jugar", values: [] },
    ],
};

/**
 * Estado del menú principal: fila elegida y valor de cada opción. Consume las intenciones de `Input.menu`
 * (`x`, `y`, `confirm`, `back`) y nunca lee dispositivos. `back` no hace nada: este es el menú raíz.
 * La elección se guarda en `storage` (algo con `getItem` y `setItem`, o `null`) con try/catch: si falla, se usan los
 * valores por defecto.
 */
export class Menu {
    /**
     * @param {object} [options]
     * @param {object|null} [options.storage] Almacenamiento con `getItem`/`setItem` (por ejemplo `localStorage`).

     * @param {object} [options.table] Tabla del menú.
     */
    constructor({ storage = null, table = MENU } = {}) {
        this.table = table;
        this.storage = storage;
        this.values = Object.fromEntries(table.rows.filter((r) => r.values.length).map((r) => [r.id, r.default]));
        this.load();

        this.reset();
    }

    load() {
        try {
            const saved = JSON.parse(this.storage?.getItem(this.table.storageKey) ?? "null");
            for (const row of this.table.rows) {
                const value = row.values.find((v) => v.id === saved?.[row.id] && !v.disabled);
                if (value) this.values[row.id] = value.id;
            }
        } catch {
            return;
        }
    }

    save() {
        try {
            this.storage?.setItem(this.table.storageKey, JSON.stringify(this.values));
        } catch {
            return;
        }
    }

    /** Vuelve el cursor a la fila de jugar (al entrar al título). */
    reset() {
        this.cursor = this.table.rows.length - 1;
    }

    /** Elección actual: un `id` por opción. */
    get choice() {
        return { ...this.values };
    }

    /** Filas listas para dibujar: `{ label, selected, values: [{ label, note, chosen, disabled }] }`. */
    get view() {
        return this.table.rows.map((row, i) => ({
            label: row.label,
            selected: i === this.cursor,
            values: row.values.map((v) => ({
                label: v.label,
                note: v.note ?? null,
                chosen: v.id === this.values[row.id],
                disabled: !!v.disabled,
            })),
        }));
    }

    /**
     * Aplica las intenciones de un frame; devuelve "play" al confirmar sobre la fila de jugar y `null` en el resto.
     * @param {{ x: number, y: number, confirm: boolean, back: boolean }} intent
     */
    update({ x = 0, y = 0, confirm = false }) {
        if (y) this.move(y);
        if (x) this.change(x);
        return confirm && this.table.rows[this.cursor].id === "play" ? "play" : null;
    }

    /** Mueve el cursor a la fila siguiente en la dirección `dir`; en los extremos se queda. */
    move(dir) {
        this.cursor = Math.max(0, Math.min(this.table.rows.length - 1, this.cursor + dir));
    }

    /** Cambia el valor de la fila actual al contiguo en la dirección `dir` que no esté deshabilitado. */
    change(dir) {
        const row = this.table.rows[this.cursor];
        const index = row.values.findIndex((v) => v.id === this.values[row.id]);
        for (let i = index + dir; i >= 0 && i < row.values.length; i += dir) {
            if (row.values[i].disabled) continue;
            this.values[row.id] = row.values[i].id;
            this.save();
            return;
        }
    }
}

/**
 * Pantalla de asignación de controles. Los jugadores son `PLAYERS`; las columnas, de izquierda a derecha, son J1,
 * sin jugar y J2. `storageKey` es la clave de `localStorage` de la última asignación (`{ [id de dispositivo]: jugador o
 * null }`); si el conjunto de dispositivos guardado no es el conectado, vale `defaultAssignment`.
 */
export const CONTROLS = { storageKey: "ragdoll-fluidos.controls.v1", players: 2, columns: ["J1", "Sin jugar", "J2"] };

/**
 * Asignación por defecto de los dispositivos `ids` (el teclado, `"keyboard"`, primero): sin gamepads, el teclado en
 * J1; con uno, el teclado en J1 y el gamepad en J2; con dos, el gamepad 1 en J1, el 2 en J2 y el teclado en J1. Los
 * gamepads de más quedan sin jugar.
 */
export function defaultAssignment(ids) {
    const pads = ids.filter((id) => id !== "keyboard");
    const assignment = { keyboard: 0 };
    pads.forEach((id, i) => {
        assignment[id] = pads.length === 1 ? 1 : i < CONTROLS.players ? i : null;
    });
    return assignment;
}

/**
 * Estado de la pantalla de asignación: dónde está cada dispositivo conectado y cuáles ya se sumaron. Consume los
 * `devices` de `Input` y nunca lee dispositivos. Cada dispositivo se mueve solo, con su propio stick, cruceta o A/D y
 * flechas. Select o A de un gamepad lo suman (el teclado está sumado siempre); A de un gamepad ya sumado y Start
 * o Enter de cualquiera confirman; B o Escape vuelven. Un gamepad sin sumar se dibuja atenuado.
 */
export class ControlsScreen {
    /** @param {{ storage?: object|null }} [options] Almacenamiento con `getItem`/`setItem`, o `null`. */
    constructor({ storage = null } = {}) {
        this.storage = storage;
        this.ids = ["keyboard"];
        this.assignment = defaultAssignment(this.ids);
        this.joined = new Set(["keyboard"]);
    }

    /** Abre la pantalla con los dispositivos `ids`: nadie sumado todavía salvo el teclado. */
    open(ids) {
        this.joined = new Set(["keyboard"]);
        this.ids = [];
        this.sync(ids);
    }

    /** Actualiza los dispositivos conectados `ids`: si cambian, la asignación guardada o la de por defecto. */
    sync(ids) {
        if (ids.length === this.ids.length && ids.every((id, i) => id === this.ids[i])) return;
        this.ids = [...ids];
        this.joined = new Set([...this.joined].filter((id) => ids.includes(id)));
        this.assignment = this.saved() ?? defaultAssignment(ids);
    }

    saved() {
        try {
            const saved = JSON.parse(this.storage?.getItem(CONTROLS.storageKey) ?? "null");
            const keys = Object.keys(saved ?? {});
            const valid = keys.length === this.ids.length && this.ids.every((id) => id in saved);
            return valid && keys.every((id) => [null, 0, 1].includes(saved[id])) ? saved : null;
        } catch {
            return null;
        }
    }

    /** Guarda la asignación actual. */
    save() {
        try {
            this.storage?.setItem(CONTROLS.storageKey, JSON.stringify(this.assignment));
        } catch {
            return;
        }
    }

    /** Jugadores sin ningún dispositivo: los maneja el bot. */
    get bots() {
        const used = new Set(Object.values(this.assignment));
        return Array.from({ length: CONTROLS.players }, (_, k) => k).filter((k) => !used.has(k));
    }

    /** Columna de un dispositivo: 0 es J1, 1 sin jugar y 2 J2. */
    column(id) {
        const player = this.assignment[id] ?? null;
        return player === null ? 1 : player === 0 ? 0 : 2;
    }

    /**
     * Aplica las intenciones de un frame (`Input.devices`); devuelve "start", "back" o `null`.
     * @param {{ id: string, kind: string, x: number, select: boolean, a: boolean, start: boolean, back: boolean }[]} devices
     */
    update(devices) {
        let result = null;
        for (const d of devices) {
            if (!this.ids.includes(d.id)) continue;
            const joining = !this.joined.has(d.id) && (d.select || d.a);
            if (joining) this.joined.add(d.id);
            if (d.x) {
                const column = Math.max(0, Math.min(2, this.column(d.id) + d.x));
                this.assignment[d.id] = column === 1 ? null : column === 0 ? 0 : 1;
            }
            if (d.back) result ??= "back";
            else if (d.start || (d.a && !joining)) result = "start";
        }
        return result;
    }

    /**
     * Para dibujar: `{ columns, devices: [{ label, column, joined }], bots }`, con `bots` los jugadores (0 o 1) que
     * maneja el bot.
     */
    get view() {
        let pad = 0;
        return {
            columns: CONTROLS.columns,
            devices: this.ids.map((id) => ({
                label: id === "keyboard" ? "Teclado y mouse" : `Gamepad ${++pad}`,
                column: this.column(id),
                joined: this.joined.has(id),
            })),
            bots: this.bots,
        };
    }
}