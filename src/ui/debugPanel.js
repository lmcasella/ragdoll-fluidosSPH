import { make, text, flag } from "./uikit.js";

/**
 * Panel de debug en HTML y CSS (`docs/design/10-controles.md` §10.5, estilos en `src/ui/debugPanel.css`): el menú de filas y,
 * debajo, las estadísticas. Módulo hoja: recibe las líneas ya armadas por `Debug.panelLines` y solo escribe el texto cuando cambia.
 * Va dentro de una capa `.ui`, con las variables de color y fuente del HUD (`docs/design/18-interfaz.md`).
 */
export class DebugPanel {
    /**
     * @param {Document} doc documento donde crear los elementos (inyectado para poder probarlo sin navegador)
     * @param {HTMLElement} container elemento sobre el que se monta la capa
     */
    constructor(doc, container) {
        this.root = make(doc, "div", "ui debug-panel off", container);
        this.body = make(doc, "pre", "debug-lines", this.root);
    }

    /**
     * Muestra las líneas, o oculta el panel con `null`.
     * @param {string[]|null} lines líneas de texto, o `null` con el menú cerrado
     */
    update(lines) {
        flag(this.root, "off", lines === null);
        if (lines !== null) text(this.body, lines.join("\n"));
    }
}
