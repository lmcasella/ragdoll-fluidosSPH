# 8. Raycast

Código: `src/core/raycast.js` (`Raycaster`, uno por mundo con `getRaycaster`), sobre `world.RayCast` con `JSRayCastCallback` (*verificado*). Usa un solo callback y vectores reutilizados: no reserva memoria nativa por rayo.

El valor que devuelve el callback define el modo, como enseña la materia:

| Valor de retorno | Modo | Uso |
|---|---|---|
| `fraction` | El impacto más cercano | Todos los rayos actuales |
| `-1` | Ignorar esa forma | Sensores y los cuerpos del propio robot (`ownBodies`) |
| `0` | Cortar: solo importa si hay línea de visión | Arco eléctrico, explosión (🔨) |

| Uso | Rayos | Detalle | Estado |
|---|---|---|---|
| **Piso** | 1 por pie y paso (2 por robot) | 0,3 m hacia abajo desde cada pie. Habilita el salto solo apoyado | ✅ |
| **Mira láser** | 1 por jugador y frame | Desde la boca del arma, 25 m, hasta el primer impacto. Línea con un punto al final | ✅ |
| **Aparición** | 1 por robot al aparecer | Vertical desde el techo: encuentra la superficie donde aparece | ✅ |
| **Golpe melee** | 3 en abanico durante la ventana activa | El más cercano define parte y punto de impacto ([03-robots](03-robots.md#32-golpe-melee-)) | ✅ |
| **Arco eléctrico** | 1 por par de robots mojados cada 0,2 s | Si hay línea de visión a < 2,5 m, salta un arco con daño. Las paredes lo bloquean | 🔨 #31 |
| **Explosión de vapor** | 32 desde el centro | Empuja solo lo que tiene línea de visión ("explosión que respeta obstáculos") | 🔨 #32 |

**Costo:** ~5 rayos por frame hoy y ~50 en picos con todo lo previsto. Cada rayo es O(log n) sobre el árbol de AABBs de Box2D. El contador `Raycaster.count` alimenta el panel de métricas (#29).
