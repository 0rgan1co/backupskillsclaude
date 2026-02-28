import {
  createTask, getTask, listTasks, moveTask,
  setSubState, clearSubState, editTask,
  getCelebrateTasks, archiveAllDone, stateLabel,
  getWipCount, type Task
} from '../models/task.js'
import { getInitiative, phaseLabel } from '../models/initiative.js'
import { closeDb } from '../db.js'

const [action, ...args] = process.argv.slice(2)

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1]
      i++
    }
  }
  return flags
}

function printTask(t: Task) {
  const sub = t.sub_state ? ` [${t.sub_state.toUpperCase()}${t.blocked_reason ? ': ' + t.blocked_reason : ''}]` : ''
  const priority = t.priority > 0 ? ` ${'!'.repeat(t.priority)}` : ''
  const due = t.due_date ? ` (vence: ${t.due_date})` : ''
  const person = t.person_ref ? ` → ${t.person_ref}` : ''
  console.log(`  [${t.id}] ${t.title} — ${stateLabel(t.state)}${sub}${priority}${due}${person}`)
  if (t.description) console.log(`    ${t.description}`)
}

try {
  switch (action) {
    case 'add': {
      const initId = parseInt(args[0])
      const title = args[1]
      if (!initId || !title) {
        console.error('Uso: task add <initiative-id> <title> [--priority 0|1|2] [--due YYYY-MM-DD] [--person "name"] [--description "..."]')
        process.exit(1)
      }
      if (!getInitiative(initId)) {
        console.error(`Iniciativa ${initId} no encontrada`)
        process.exit(1)
      }
      const flags = parseFlags(args.slice(2))
      const task = createTask({
        initiative_id: initId,
        title,
        description: flags.description,
        priority: flags.priority ? parseInt(flags.priority) : undefined,
        due_date: flags.due,
        person_ref: flags.person,
      })
      console.log(`\nTarea creada:`)
      printTask(task)
      console.log()
      break
    }
    case 'list': {
      const flags = parseFlags(args)
      const tasks = listTasks({
        initiative_id: flags.initiative ? parseInt(flags.initiative) : undefined,
        state: flags.state,
        project_id: flags.project,
      })
      const wip = getWipCount()
      console.log(`\nTareas (${tasks.length}) | WIP: ${wip}/5\n`)
      let currentState = ''
      for (const t of tasks) {
        if (t.state !== currentState) {
          currentState = t.state
          console.log(`  --- ${stateLabel(currentState)} ---`)
        }
        printTask(t)
      }
      if (tasks.length === 0) console.log('  (ninguna)')
      console.log()
      break
    }
    case 'show': {
      const t = getTask(parseInt(args[0]))
      if (!t) { console.error('Tarea no encontrada'); process.exit(1) }
      const init = getInitiative(t.initiative_id)
      console.log(`\n  ID:          ${t.id}`)
      console.log(`  Título:      ${t.title}`)
      console.log(`  Iniciativa:  ${init ? `${init.title} (${phaseLabel(init.phase)})` : t.initiative_id}`)
      console.log(`  Estado:      ${stateLabel(t.state)}${t.sub_state ? ` [${t.sub_state}]` : ''}`)
      if (t.blocked_reason) console.log(`  Razón:       ${t.blocked_reason}`)
      console.log(`  Prioridad:   ${'!'.repeat(t.priority) || 'normal'}`)
      console.log(`  Persona:     ${t.person_ref ?? '-'}`)
      console.log(`  Vence:       ${t.due_date ?? '-'}`)
      console.log(`  Fuente:      ${t.source}${t.source_ref ? ` (${t.source_ref})` : ''}`)
      if (t.description) console.log(`  Descripción: ${t.description}`)
      console.log(`  Creada:      ${t.created_at}`)
      if (t.started_at) console.log(`  Iniciada:    ${t.started_at}`)
      if (t.completed_at) console.log(`  Completada:  ${t.completed_at}`)
      console.log()
      break
    }
    case 'move': {
      const result = moveTask(parseInt(args[0]), args[1])
      if (!result.success) { console.error(`\n${result.error}\n`); process.exit(1) }
      console.log(`\nTarea movida a ${stateLabel(result.task!.state)}`)
      printTask(result.task!)
      console.log()
      break
    }
    case 'block': {
      const result = setSubState(parseInt(args[0]), 'bloqueado', args.slice(1).join(' ') || undefined)
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nTarea bloqueada:`)
      printTask(result.task!)
      console.log()
      break
    }
    case 'wait': {
      const result = setSubState(parseInt(args[0]), 'esperando', args.slice(1).join(' ') || undefined)
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nTarea en espera:`)
      printTask(result.task!)
      console.log()
      break
    }
    case 'unblock': {
      const result = clearSubState(parseInt(args[0]))
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nTarea desbloqueada:`)
      printTask(result.task!)
      console.log()
      break
    }
    case 'celebrate': {
      const tasks = getCelebrateTasks()
      if (tasks.length === 0) {
        console.log('\nNo hay tareas para celebrar. Seguí trabajando.\n')
      } else {
        console.log(`\n  Tareas completadas para celebrar (${tasks.length}):\n`)
        for (const t of tasks) {
          console.log(`  [${t.id}] ${t.title}`)
          console.log(`    Completada: ${t.completed_at}`)
        }
        console.log()
      }
      break
    }
    case 'archive': {
      if (args.includes('--all-done')) {
        const count = archiveAllDone()
        console.log(`\n${count} tarea(s) archivada(s).\n`)
      } else {
        const result = moveTask(parseInt(args[0]), 'archivo')
        if (!result.success) { console.error(result.error); process.exit(1) }
        console.log(`\nTarea archivada: "${result.task!.title}"\n`)
      }
      break
    }
    case 'edit': {
      const id = parseInt(args[0])
      const flags = parseFlags(args.slice(1))
      const result = editTask(id, {
        title: flags.title,
        description: flags.description,
        due_date: flags.due,
        priority: flags.priority ? parseInt(flags.priority) : undefined,
        person_ref: flags.person,
      })
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nTarea actualizada:`)
      printTask(result.task!)
      console.log()
      break
    }
    default:
      console.log('Uso: task <action> [args]')
      console.log('  add <init-id> <title> [--priority N] [--due YYYY-MM-DD] [--person "X"]')
      console.log('  list [--initiative N] [--state X] [--project X]')
      console.log('  show <id>')
      console.log('  move <id> <estado>    (menu|por_hacer|haciendo|hecho|archivo)')
      console.log('  block <id> <razón>')
      console.log('  wait <id> <persona>')
      console.log('  unblock <id>')
      console.log('  celebrate             Ver tareas completadas')
      console.log('  archive <id>          Archivar tarea')
      console.log('  archive --all-done    Archivar todas las completadas')
      console.log('  edit <id> [--title X] [--due X] [--priority N]')
  }
} finally {
  closeDb()
}
