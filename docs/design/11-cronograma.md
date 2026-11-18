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
- **M2:** grabador de escenarios (#67), identidad estable de partículas (#68), disparos con agua pura (#69) y módulo `ShallowWater` (#70);
- **M3:** pileta e inundación como campo de alturas con absorción (#71), flotación por pieza (#72) y debug básico (#29);
- **M4:** evaporación de agua detenida (#73, D7), reacción de los cuerpos sobre el agua (#74) y térmica y fases (#75);
- **M5:** mezcla (#76), adherencia (#77) y debug completo (#78).

**Remapeo del gamepad y gancho** 🔨 (pedido del usuario, 18/11): el remapeo base va con #14, la rueda de armas (#15) después de #72 y el gancho después de la rueda; los tres entran en la entrega. El modo ragdoll y la pausa consensuada son M5. Las plataformas atravesables no tienen issue todavía.

Los sub-issues son #67 (A), #68 (B), #69 (C), #70 (D1), #71 (D2), #72 (F), #29 (K1), #73 (E), #74 (G), #75 (H), #76 (I), #77 (J) y #78 (K2). El mínimo de #62 para entregar es #67, #68, #69, #70, #71 y #72.

**Orden de trabajo acordado** (18/11), en serie:

1. Diseño (esta rama).
2. #67 grabador de escenarios.
3. #68 identidad estable de partículas.
4. #69 disparos con agua pura.
5. #14 armas recogibles + remapeo base del gamepad ([10](10-controles.md)).
6. #70 `ShallowWater`.
7. #71 campo de alturas con absorción.
8. #72 flotación.
9. #15 rueda de armas.
10. Gancho ([03 §3.5](03-robots.md#35-gancho-)).
11. #26 render de partículas en Canvas2D.
12. #53 HUD.
13. #29 debug básico.
14. #73 evaporación.
15. #75 térmica.
16. #74 reacción de los cuerpos sobre el agua.
17. M5.

**Si algo se atrasa, se recorta desde el final del orden** (pasa a M5), en este orden:
1. #74 reacción de los cuerpos sobre el agua.
2. #75 térmica y fases.
3. #73 evaporación (sin ella, los disparos en plataformas vencen a los 6 s, D5).
4. #29 debug básico.
5. #53 HUD.
6. #26 render de partículas (queda el dibujo actual con goo).
7. Gancho.
8. #15 rueda de armas (quedan LB/RB y la cruceta).

Los ventiladores (#24), el viento como arma (#17) y el lanzallamas (#16, decisión del usuario del 18/11) ya están fuera del orden: pasan a M5. Si #71 no llega a tiempo, `main` se queda con el agua en partículas de hoy: la rama no se mergea a medias. La pausa consensuada, el modo ragdoll y las plataformas atravesables (sin issue) quedan para M5 o después.

**Mínimo para entregar:**
- rondas completas ✅;
- golpe melee ✅;
- pileta ✅;
- raycast de piso, mira y golpe ✅;
- disparo continuo con tanque;
- tres armas que se recogen;
- inundación.

**Reparto sugerido** (💬): una persona en combate y partida, otra en fluidos y escenario. Los módulos separados ([09-arquitectura](09-arquitectura.md)) reducen los conflictos de merge.
