import { make, text, flag } from "./uikit.js";

/**
 * Cartel y resultados del modo de medición (`src/bench/benchRunner.js`), en HTML con los estilos del panel de debug
 * (`src/ui/debugPanel.css`). Durante la medición muestra una línea de estado; al terminar, el informe en un `<pre>` y el
 * botón "Copiar resultados". Módulo hoja: recibe las funciones del navegador al construirse.
 */
export class BenchPanel {
    /**
     * @param {Document} doc documento donde crear los elementos
     * @param {HTMLElement} container elemento sobre el que se monta la capa
     * @param {object} browser funciones del navegador
     * @param {(text: string) => Promise<void>} browser.writeText copia al portapapeles
     * @param {(node: HTMLElement) => void} browser.selectContents deja el texto del nodo seleccionado
     */
    constructor(doc, container, { writeText, selectContents }) {
        this.root = make(doc, "div", "ui debug-panel bench-panel", container);
        this.status = make(doc, "pre", "debug-lines", this.root);
        this.report = make(doc, "pre", "debug-lines bench-report off", this.root);
        this.copy = make(doc, "button", "bench-copy off", this.root, "Copiar resultados");
        this.copy.addEventListener("click", () => {
            Promise.resolve()
                .then(() => writeText(this.report.textContent))
                .catch(() => selectContents(this.report));
        });
    }

    /**
     * Muestra el estado y, si hay informe, el informe con el botón.
     * @param {{status: string, report: string|null}} view
     */
    update({ status, report }) {
        text(this.status, status);
        flag(this.report, "off", report === null);
        flag(this.copy, "off", report === null);
        if (report !== null) text(this.report, report);
    }
}
