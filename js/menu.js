/**
 * Menú principal (#154) como datos. Cada fila tiene `id`, `label` y sus `values` (`id`, `label`, y opcionalmente
 * `disabled` con su `note`, o `bots` con los jugadores que maneja el bot en ese modo); `default` es el `id` inicial.
 * `needsBot` deja la fila habilitada solo si el modo elegido tiene bots. La fila `play` no tiene valores.
 * `storageKey` es la clave de `localStorage` donde se recuerda la última elección.
 */
export const MENU = {
    storageKey: "ragdoll-fluidos.menu",
    rows: [
        {
            id: "mode",
            label: "Modo",
            default: "versus",
            values: [
                { id: "versus", label: "1v1", bots: [] },
                { id: "bot", label: "Contra el bot", bots: [1] },
                { id: "botbot", label: "Bot contra bot", bots: [0, 1] },
            ],
        },
        {
            id: "difficulty",
            label: "Dificultad",
            default: "normal",
            needsBot: true,
            values: [
                { id: "easy", label: "Fácil" },
                { id: "normal", label: "Normal" },
                { id: "hard", label: "Difícil" },
            ],
        },
        {
            id: "map",
            label: "Mapa",
            default: "classic",
            values: [
                { id: "classic", label: "Clásico" },
                { id: "infinite", label: "Infinito", disabled: true, note: "próximamente" },
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
     * @param {number[]|null} [options.bots] Jugadores con bot pedidos por la URL (`?bot=`): preseleccionan el modo si
     *   coinciden con alguno; gana sobre lo guardado.
     * @param {object} [options.table] Tabla del menú.
     */
    constructor({ storage = null, bots = null, table = MENU } = {}) {
        this.table = table;
        this.storage = storage;
        this.values = Object.fromEntries(table.rows.filter((r) => r.values.length).map((r) => [r.id, r.default]));
        this.load();
        const mode = bots && table.rows[0].values.find((v) => v.bots.length === bots.length && v.bots.every((b) => bots.includes(b)));
        if (mode) this.values[table.rows[0].id] = mode.id;
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

    enabled(row) {
        if (!row.needsBot) return true;
        return this.mode.bots.length > 0;
    }

    get mode() {
        const row = this.table.rows[0];
        return row.values.find((v) => v.id === this.values[row.id]);
    }

    /** Elección actual: un `id` por opción y los jugadores que maneja el bot. */
    get choice() {
        return { ...this.values, bots: [...this.mode.bots] };
    }

    /** Filas listas para dibujar: `{ label, selected, enabled, values: [{ label, note, chosen, disabled }] }`. */
    get view() {
        return this.table.rows.map((row, i) => ({
            label: row.label,
            selected: i === this.cursor,
            enabled: this.enabled(row),
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

    /** Mueve el cursor a la fila habilitada siguiente en la dirección `dir`; en los extremos se queda. */
    move(dir) {
        const rows = this.table.rows;
        for (let i = this.cursor + dir; i >= 0 && i < rows.length; i += dir) {
            if (!this.enabled(rows[i])) continue;
            this.cursor = i;
            return;
        }
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
