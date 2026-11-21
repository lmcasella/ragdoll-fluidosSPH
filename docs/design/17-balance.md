# 17. Balance

Valores con los que se juega hoy, en palabras simples. Si otro archivo del diseño da un número distinto, vale el de acá: está tomado del código el 20/11/2026.

## Robots

| Qué | Valor | Dónde está |
|---|---|---|
| Vida | 100 | `js/ActiveRagdoll.js:5` |
| Caminar | 6 m/s | `js/ActiveRagdoll.js:47` |
| Salto | 9 m/s hacia arriba | `js/ActiveRagdoll.js:48` |
| Roll | dura 0,8 s, 4 m/s, se repite cada 0,5 s | `js/ActiveRagdoll.js:75` |
| Caída fuerte | a partir de 11 m/s de choque, 2 de daño por cada m/s de más | `js/damage.js:18-20` |
| Daño según la pieza | cabeza ×1,5; pecho y pelvis ×1; brazos y piernas ×0,75 | `index.html:187-188` |

## Golpes

Todos empujan al rival y lo dejan aturdido un momento. El bloqueo (LT) frena todo el daño; un golpe fuerte contra la guardia la rompe y deja al que bloqueaba aturdido 0,7 s, sin empujarlo.

| Golpe | Daño | Aturdimiento |
|---|---|---|
| Combo 1 y 2 | 8 cada uno | 0,4 s |
| Combo 3 (remate) | 14 | 0,7 s |
| Golpe en el aire | 8 | 0,4 s |
| Patada en el aire | 12 | 0,6 s |

El 2.º y el 3.er golpe del combo hacen avanzar al atacante 2,5 m/s durante su ventana activa (`lunge`).

Los datos de cada golpe están en `MELEE` (`js/melee.js:16-84`).

## Armas

Cada arma se recoge del mapa con el tanque lleno y solo se recarga al recogerla otra vez o al empezar la ronda. Un arma recogida vuelve a aparecer a los 15 s (`js/pickups.js:4`).

| Arma | Qué hace | Tanque | Caudal | Daño |
|---|---|---|---|---|
| Agua | Moja y hace cortocircuito al robot | 600 | 155/s | 3 de vida por segundo mientras está mojado y hasta 3 s después |
| Ácido | Quema al contacto y también hace cortocircuito | 272 | 155/s | 20 por segundo de chorro, más el cortocircuito |
| Lava | Quema y, al enfriarse, se vuelve piedra | 180 | 111/s | 4 por segundo durante 1,5 s después de cada contacto |
| Miel | No daña: se pega, pesa y frena | 304 | 200/s | 0 |

El vapor y la piedra que salen de las reacciones no dañan. Los valores están en la tabla de armas (`js/weapons.js:39-42`) y el daño en `js/damage.js:242-250`.

**Reparación:** suma 35 de vida, sin pasar de 100, y reaparece a los 20 s (`js/pickups.js:10`).

## Partida (Clásico)

| Qué | Valor | Dónde está |
|---|---|---|
| Rondas para ganar | 2 (al mejor de 3) | `js/round.js:22` |
| Duración de la ronda | sin límite: termina cuando queda uno en pie | `js/round.js:67-75` |
| Cuenta regresiva | 3 s y un "¡YA!" de 0,6 s | `js/round.js:6-9` |
| Final de ronda | cámara lenta 1,5 s y cartel 3 s | `js/round.js:1-3` |
| Inundación | empieza a los 60 s y el agua sube 0,15 m/s hasta 15 m | `js/level.js:41-43` |

## Infinito

| Qué | Valor | Dónde está |
|---|---|---|
| Nocaut | con la vida en 0 el robot queda inconsciente 5 s la primera vez en la ronda, 3 s más cada vez siguiente (hasta 18 s), y se levanta con 50 de vida; solo el agua mata | `js/ActiveRagdoll.js:7-12` |
| Agua que sube | arranca a los 5 s, a 0,25 m/s, y va 0,04 m/s más rápido por etapa | `js/climb.js:69` |
| Reparación | deja la vida en 100 y levanta al robot en nocaut (en el Clásico suma 35) | `js/ActiveRagdoll.js` (`repair`) |
