# 12. Decisiones y preguntas abiertas

## 12.1 Decisiones tomadas

| Fecha | Tema | Decisión |
|---|---|---|
| 18/11 | Input | Gamepad primero; teclado y mouse solo como respaldo |
| 18/11 | Daño del agua | El robot mojado pierde vida por cortocircuito, con chispas visibles |
| 18/11 | Armas | Se recogen en el mapa, van al inventario y se eligen con una rueda |
| 18/11 | Disparo | Chorro continuo mientras se mantiene el botón, con tanque que no se recarga solo |
| 18/11 | Muerte súbita | Lluvia desde arriba que inunda el mapa |
| 18/11 | Fuego | Cuenta como fluido gaseoso: SPH en un sistema con gravedad negativa |
| 18/11 | Ácido vs agua | Ácido: más daño por partícula y corrosión. Agua: daño continuo por cortocircuito |
| 18/11 | Golpe | Empuja moviendo a todo el robot (velocidad sumada a todas las piezas), con aturdimiento breve |
| 18/11 | Fuego amigo | El fluido propio daña a quien lo disparó pasados 0,4 s (gracia solo al salir del cañón). Pisar el charco propio de ácido o lava, o la miel propia, tiene costo |
| 18/11 | Inundación: módulo | Módulo nuevo `js/flood.js` (`Flood`); datos en `LEVEL.flood`. `Match` lleva el reloj de ronda (`roundTime`) y `Flood` lo lee una vez por paso fijo. `reiniciarRonda()` llama a `Flood.reset()`, fuera de callbacks |
| 18/11 | Inundación: sistema | La lluvia va en el mismo sistema que la pileta ("agua del nivel"), que pasa a radio 0,25 m y `maxCount` 5.500, para que el agua de la pileta suba de verdad. Las gotas se marcan con −1 en `userData` para destruirlas al reiniciar sin chocar con los ids de disparo. Es el candidato a sistema único de líquidos (ver 12.2) |
| 18/11 | Inundación: nivel | Nivel controlado, no medido: sube a 0,15 m/s desde 3 m a partir de los 90 s, hasta 15 m (por encima de todas las plataformas). El emisor repone las gotas que faltan para ese nivel (tope 90/s) y elimina las que se quedan quietas a más de 1 m sobre él |
| 18/11 | Inundación: sensor | El sensor de la pileta no sube: hundirse en el hueco sigue matando; el resto del agua solo daña por cortocircuito |
| 18/11 | Cortocircuito | Estado `mojado` en `ActiveRagdoll` (`soak`): 3 s, −3 de vida/s sin multiplicador por parte, renovable. Lo disparan las fuentes desde `DamageSystem.process`: la inundación por nivel (#22) y el arma de agua por contacto (#18). Chispas en #18; en #22, tinte cian |
| 18/11 | Caminar hacia atrás y apuntado | Arreglos provisorios en el juego (`walk_back`, cañón alineado). Lo definitivo depende de la librería: Gann4Life/RagAssembler2D#231 y #232 |

## 12.2 Preguntas abiertas

1. **Plataformas atravesables desde abajo:** el build no lo permite (sin `PreSolve`). ¿Lo aceptamos?
2. **Sonido:** otra unidad de la materia; planificado para después de la entrega (#35).
3. **Issues en ragassembler2d** (#231, #232): ¿se mantienen o se cierran?
4. **Todos los líquidos en un sistema** (pedido del usuario): solo entra con un radio común de 0,25 m, así que los disparos pasarían de 0,1 a 0,25 m y habría que rebalancear su daño y caudal. Propuesta en [07-sph](07-sph.md#un-solo-sistema-para-todos-los-líquidos-) y fuera de #22: ¿se acepta disparar con partículas más gruesas a cambio de que todo interactúe?
