# 11. Cronograma

**Fechas:**
- **Martes 24/11:** entrega. El juego cerrado y funcionando en la URL pública.
- **Martes 1/12:** presentación frente a los compañeros.

**Prioridad:** juego completo antes que detalles. El backlog vive en los issues de GitHub, agrupados en milestones. El orden lo da `/next`.

| Milestone | Vence | Contenido | Estado |
|---|---|---|---|
| M1 – Combate | 20/11 | Mundo fijo, cámara, raycast (piso, mira, aparición), daño por parte con destello, impacto, golpe melee, rondas, pileta | ✅ (PRs #6, #9, #10, #11) |
| M2 – Armas y fluidos | 21/11 | Bug de mira (#12), disparo continuo con tanque (#13), armas recogibles (#14), rueda (#15), gases y fuego (#16), viento (#17), agua (#18), ácido (#19), autodaño (#20), deploy (#21) | 🔨 |
| M3 – Escenario e inundación | 22/11 | Inundación (#22), miel (#23), ventiladores (#24), mapa definitivo (#25) | 🔨 |
| M4 – Cierre de entrega | 24/11 | Render metaball (#26), balance (#27), documentación (#28). **El lunes 23 se congelan las funcionalidades** | 🔨 |
| M5 – Pulido y defensa | 1/12 | Métricas (#29), reacciones (#30), arco (#31), explosión (#32), plataformas cinemáticas (#33), sprites (#34), sonido (#35), apuntado exacto (#8) | 🔨 |

**Rediseño del agua (#62)** 🔨, sub-issues en [14.17](14-agua.md#1417-división-en-sub-issues-y-prioridades):
- **M2:** grabador de escenarios (A), identidad estable de partículas (B), disparos con agua pura (C) y módulo `ShallowWater` (D1);
- **M3:** pileta e inundación como campo de alturas con absorción (D2), flotación por pieza (F) y debug básico (K1);
- **M4:** reacción de los cuerpos sobre el agua (G) y térmica y fases (H);
- **M5:** mezcla (I), adherencia (J) y debug completo (K2).

El mínimo de #62 para entregar es A, B, C, D1, D2 y F.

**Si algo se atrasa, se recorta en este orden** (pasa a M5):
1. Ventiladores (#24).
2. Viento como arma (#17).
3. Rueda de armas (#15), dejando LB/RB.
4. Reacción de los cuerpos sobre el agua (#62-G).
5. Térmica y fases (#62-H).
6. Debug básico (#62-K1).

Si D2 no llega a tiempo, `main` se queda con el agua en partículas de hoy: la rama no se mergea a medias.

**Mínimo para entregar:**
- rondas completas ✅;
- golpe melee ✅;
- pileta ✅;
- raycast de piso, mira y golpe ✅;
- disparo continuo con tanque;
- tres armas que se recogen;
- inundación.

**Reparto sugerido** (💬): una persona en combate y partida, otra en fluidos y escenario. Los módulos separados ([09-arquitectura](09-arquitectura.md)) reducen los conflictos de merge.
