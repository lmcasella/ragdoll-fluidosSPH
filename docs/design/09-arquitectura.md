# 9. Arquitectura y rendimiento

Los **patrones** que sigue el código (raíz de composición, paso fijo, juntar y actuar, sistemas por módulo, intención en lugar de dispositivo, máquinas de estado, datos en tablas, memoria nativa, contrato de RagImporter) están en `CLAUDE.md`. Esta sección describe los módulos y el rendimiento.

## 9.1 Módulos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Raíz de composición: crea mundo, sistemas y jugadores; loop; disparos, giro y golpe |
| `js/ActiveRagdoll.js` | Un jugador: vida, estados (miel, quemadura, aturdido, ahogado), movimiento, mira, golpe, clips |
| `js/Input.js` | Gamepad y teclado → estado por jugador |
| `js/camera.js` | Encuadre compartido y conversión pantalla ↔ mundo |
| `js/level.js` | Datos del nivel, sólidos, sensor y agua de la pileta |
| `js/raycast.js` | Rayos con callback reutilizado, uno por mundo |
| `js/damage.js` | Contact listener: impactos, partículas, pileta → daño |
| `js/round.js` | Rondas, victorias, cámara lenta, revancha |
| `js/render.js` | Dibujo del nivel, robots, fluidos, mira, golpes y HUD |
| `js/clips.js` | Transformaciones de clips antes de `parse` (`walk_back`) |
| `lib/` | RagImporter, copiado de ragassembler2d `d067775`; no se edita acá |
| `assets/*.rag.json` | Rigs (robot en uso; dino sin uso) |
| `tests/` | Tests de humo, que corre el CI antes de cada deploy (PR #3) |

Previstos: un módulo de armas y emisores (#13) y uno de métricas (#29).

## 9.2 Rendimiento medido

| Escenario | Física + lógica por frame |
|---|---|
| Dos robots, pileta (726 partículas) | ~1,4 ms (Node, 18/11) |

El dibujo todavía no está medido: se mide con el panel de métricas (#29).

## 9.3 Presupuestos y métricas

- **Memoria:** el heap de LiquidFun es **fijo de 16 MiB**. Se fija un tope por sistema con `maxCount`. Con 20.000 partículas todavía entra (medido).
- **Tiempo:** un frame a 60 FPS dura 16,6 ms. Meta: física ≤ ~8 ms, el resto para el render.

**Benchmark de partículas** (18/11, Node, mismo build; agua en reposo en una caja de 60 m):

| Partículas | 1 paso por frame | 8 subpasos por frame (`stepWorld`) |
|---|---|---|
| 2.000 | 0,5 ms | 2,0 ms |
| 5.000 | 0,9 ms | 4,5 ms |
| 10.000 | 1,2 ms | 8,8 ms |
| 20.000 | 1,9 ms | 14,4 ms |

**Lectura:**
- El costo crece casi lineal con N: LiquidFun ordena las partículas por celda y solo arma pares entre vecinas.
- Lo que más pesa son los **8 subpasos**, que exige RagImporter para la estabilidad de los ragdolls.
- Techo razonable: **8.000–10.000 partículas** en total.

**Optimizaciones previstas para la inundación**, en orden y midiendo cada una:
1. Partículas más grandes en un sistema propio (radio 0,25 m: ~2,8 veces menos partículas para el mismo volumen).
2. Pausar ese sistema (`SetPaused`) en parte de los subpasos, compensando el tiempo.
3. Reemplazar el agua quieta del fondo por un bloque estático con sensor (híbrido: "cuándo usar qué").
4. Render en GPU (#26).

**Panel de métricas** 🔨 #29: partículas por sistema, ms de física y de render, rayos por frame, contactos partícula↔cuerpo y FPS. Base de los benchmarks de la defensa.
