# GDD — ragdoll-fluidosSPH

Documento de diseño del juego para la materia Simulación 1 (UNAHUR). Este archivo es el **índice**: cada tema vive en su propio archivo de `docs/design/`. Leer solo el que hace falta.

- **Estado:** ✅ hecho, 🔨 diseñado y pendiente (con su issue), 💬 propuesta sin acordar.
- **Valores:** puntos de partida para ajustar jugando. Los que están en el código figuran con su valor real.
- **Verificación:** lo marcado *verificado* se probó contra el build de LiquidFun que usamos (`vendor/liquidfun.js`).
- **Mantenimiento:** en cada merge a `main` se revisa si el diseño cambió y se actualiza el archivo correspondiente (ver `CLAUDE.md`, definición de terminado).

| § | Archivo | Contenido |
|---|---|---|
| 1 | [Concepto y materia](docs/design/01-concepto.md) | Idea del juego, pilares, referencias y cómo cumple con la materia |
| 2 | [Loop de partida](docs/design/02-partida.md) | Rondas, fin de ronda, partida al mejor de 3, revancha, inundación |
| 3 | [Robots](docs/design/03-robots.md) | Movimiento, apuntado, golpe melee, daño por parte, destello, empuje |
| 4 | [Fluidos](docs/design/04-fluidos.md) | Armas y disparo continuo con tanque, recogida e inventario, peligros, reacciones |
| 5 | [Escenario](docs/design/05-escenario.md) | Mapa, cámara, aparición, pileta |
| 6 | [Box2D](docs/design/06-box2d.md) | Equivalencias con la materia, contactos, sensores, impulsos |
| 7 | [Fluidos / SPH](docs/design/07-sph.md) | Modelo de LiquidFun, sistemas de partículas, contactos, render |
| 8 | [Raycast](docs/design/08-raycast.md) | Modos del callback y cada uso de rayos |
| 9 | [Arquitectura y rendimiento](docs/design/09-arquitectura.md) | Módulos, rendimiento medido, presupuestos, benchmark, optimizaciones |
| 10 | [Controles](docs/design/10-controles.md) | Gamepad, teclado y mouse de respaldo |
| 11 | [Cronograma](docs/design/11-cronograma.md) | Fechas, milestones, orden de recorte, mínimo para entregar |
| 12 | [Decisiones y preguntas abiertas](docs/design/12-decisiones.md) | Registro de decisiones y lo que falta decidir |
| 13 | [Arte](docs/design/13-arte.md) | Estilo, placeholders e imágenes necesarias |

Los patrones de arquitectura y las convenciones de trabajo están en `CLAUDE.md`.
