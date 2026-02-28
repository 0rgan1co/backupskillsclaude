# EcoCycle Planning Skill

## Trigger
Activate when user mentions: iniciativas, ecocycle, tablero, kanban,
tareas, backlog, WIP, en progreso, bloqueo, board, compost,
semilla, brote, crecimiento, trampa, celebrar, archivar tareas,
mapa de iniciativas, qué tengo pendiente, qué estoy haciendo

## Overview
Sistema de gestión de iniciativas (EcoCycle) y tareas (Kanban) en SQLite local.
Todas las operaciones se ejecutan desde /Users/roldanjorgex/claudecowork/

## Quick Views

```bash
# Tablero kanban
npx tsx src/cli/board.ts
npx tsx src/cli/board.ts --project ai-change-lab

# Mapa EcoCycle (infinity loop de iniciativas)
npx tsx src/cli/ecocycle.ts

# Alertas (ejecutar al inicio de sesión)
npx tsx src/cli/alerts.ts
```

## Task Management

```bash
# Crear tarea
npx tsx src/cli/task.ts add <initiative-id> "<title>" [--priority 0|1|2] [--due YYYY-MM-DD] [--person "name"] [--description "..."]

# Mover tarea (menu → por_hacer → haciendo → hecho → archivo)
npx tsx src/cli/task.ts move <task-id> <state>

# Bloquear / esperar / desbloquear
npx tsx src/cli/task.ts block <task-id> "<reason>"
npx tsx src/cli/task.ts wait <task-id> "<person>"
npx tsx src/cli/task.ts unblock <task-id>

# Listar y ver
npx tsx src/cli/task.ts list [--project X] [--initiative N] [--state X]
npx tsx src/cli/task.ts show <id>

# Celebrar y archivar
npx tsx src/cli/task.ts celebrate
npx tsx src/cli/task.ts archive <id>
npx tsx src/cli/task.ts archive --all-done
```

## Initiative Management

```bash
# Crear iniciativa
npx tsx src/cli/initiative.ts add <project-id> "<title>" [--phase semilla] [--description "..."]

# Avanzar/retroceder fase (semilla → brote → crecimiento → compost → semilla)
npx tsx src/cli/initiative.ts advance <id>
npx tsx src/cli/initiative.ts retreat <id>

# Marcar/quitar trampa
npx tsx src/cli/initiative.ts trap <id> <rigidez|escasez>
npx tsx src/cli/initiative.ts untrap <id>

# Compostar directamente
npx tsx src/cli/initiative.ts compost <id> --reason "..."
```

## Projects

```bash
npx tsx src/cli/project.ts list
npx tsx src/cli/project.ts show <project-id>
```

Project IDs: `ai-change-lab`, `circulos-impacto`, `argenwagyu`, `brasil-regenera`

## EcoCycle Phases
- **Semilla**: Ideas nuevas, exploración
- **Brote**: Crecimiento temprano, necesita recursos
- **Crecimiento**: Establecida, produce resultados
- **Compost**: Valor decreciente, podar o transformar

Trampas:
- **Rigidez**: Entre crecimiento y compost — consume recursos sin evolucionar
- **Escasez**: Entre semilla y brote — nunca recibe suficientes recursos

## Task States
- **Menu**: Backlog sin priorizar
- **Por Hacer**: Priorizada (puede estar bloqueada o esperando)
- **Haciendo**: En progreso (WIP limit: 5)
- **Hecho**: Completada, pendiente de celebrar
- **Archivo**: Archivada post-celebración

## Behavior Rules
- Mostrar tablero después de cambios de estado
- Respetar WIP limit de 5 — avisar, no agregar silenciosamente
- Cuando se completan tareas, sugerir celebración antes de archivar
- Correr alertas al inicio de cada sesión
- Al importar desde Granola: presentar tareas para confirmación antes de insertar

## Granola Integration
1. Usar herramientas MCP de Granola para leer notas de reuniones recientes
2. Identificar action items, compromisos y seguimientos
3. Presentar al usuario para confirmación
4. Importar tareas confirmadas:
   ```bash
   npx tsx src/cli/granola.ts import --initiative <id> --tasks '<json>' --source-ref "<granola-doc-id>"
   ```
