---
name: next
description: Elige el issue abierto más relevante para trabajar a continuación, explica por qué y, al confirmar, crea su rama convencional desde main.
---

# /next

Elegir la próxima tarea entre los issues abiertos de GitHub. No tomar simplemente el primero o el más viejo. La taxonomía (labels, milestones) y el formato de rama están en `CLAUDE.md`.

## 1. Reunir

```powershell
gh issue list --state open --limit 300 --json number,title,labels,milestone,body,assignees
gh api "repos/{owner}/{repo}/milestones?state=open" --jq '.[] | {title, due_on}'
gh pr list --state open --json number,headRefName,body
git branch --list
```

## 2. Descartar

- Issues con una dependencia abierta ("Depende de" lista un issue abierto) o marcados como bloqueados.
- Issues en curso: hay un PR abierto que los referencia, o una rama local contiene `issue-<número>`.
- Issues asignados a otra persona (`gh api user --jq .login` es el usuario actual).

## 3. Ordenar los que quedan

1. **Bugs de prioridad alta:** lo roto va primero.
2. **Milestone más cercano** (por fecha de vencimiento; sin fecha, por orden de creación): el orden del plan manda.
3. **Poder de desbloqueo:** cuántos issues abiertos dependen de este, directa o indirectamente.
4. **Label de prioridad:** alta > media > baja.
5. **Número de issue más bajo** como desempate final.

## 4. Presentar

- El issue recomendado (número, título, milestone, labels) y 2–3 líneas de **por qué** queda primero, citando los criterios.
- Las dos alternativas siguientes, con una línea de motivo cada una.
- El agente que debería empezar, según el flujo de `CLAUDE.md`.

Pedir confirmación al usuario antes de hacer cualquier otra cosa.

## 5. Al confirmar

```powershell
git switch main
git pull --ff-only
git switch -c <tipo>/issue-<número>-<descripcion-corta>
gh issue edit <número> --add-assignee "@me"
```

`<tipo>` y el formato de la descripción siguen la convención de ramas de `CLAUDE.md`.
