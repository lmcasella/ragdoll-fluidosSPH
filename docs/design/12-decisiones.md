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
| 18/11 | Caminar hacia atrás y apuntado | Arreglos provisorios en el juego (`walk_back`, cañón alineado). Lo definitivo depende de la librería: Gann4Life/RagAssembler2D#231 y #232 |

## 12.2 Preguntas abiertas

1. **Plataformas atravesables desde abajo:** el build no lo permite (sin `PreSolve`). ¿Lo aceptamos?
2. **Sonido:** otra unidad de la materia; planificado para después de la entrega (#35).
3. **Issues en ragassembler2d** (#231, #232): ¿se mantienen o se cierran?
