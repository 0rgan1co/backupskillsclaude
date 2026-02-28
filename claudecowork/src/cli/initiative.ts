import {
  createInitiative, getInitiative, listInitiatives,
  advancePhase, retreatPhase, setTrap, clearTrap,
  phaseLabel, type Initiative
} from '../models/initiative.js'
import { getProject } from '../models/project.js'
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

function printInitiative(i: Initiative) {
  const trap = i.trap ? ` [TRAMPA ${i.trap.toUpperCase()}]` : ''
  console.log(`  [${i.id}] ${i.title} — ${phaseLabel(i.phase)}${trap}`)
  console.log(`    Proyecto: ${i.project_id} | Desde: ${i.phase_entered_at}`)
  if (i.description) console.log(`    ${i.description}`)
}

try {
  switch (action) {
    case 'add': {
      const projectId = args[0]
      const title = args[1]
      if (!projectId || !title) {
        console.error('Uso: initiative add <project-id> <title> [--phase semilla] [--description "..."]')
        process.exit(1)
      }
      if (!getProject(projectId)) {
        console.error(`Proyecto "${projectId}" no encontrado`)
        process.exit(1)
      }
      const flags = parseFlags(args.slice(2))
      const init = createInitiative({
        project_id: projectId,
        title,
        description: flags.description,
        phase: (flags.phase as Initiative['phase']) ?? undefined,
      })
      console.log(`\nIniciativa creada:`)
      printInitiative(init)
      console.log()
      break
    }
    case 'list': {
      const flags = parseFlags(args)
      const items = listInitiatives({
        project_id: flags.project,
        phase: flags.phase,
        trap_only: args.includes('--trap'),
      })
      console.log(`\nIniciativas (${items.length}):\n`)
      let currentPhase = ''
      for (const i of items) {
        if (i.phase !== currentPhase) {
          currentPhase = i.phase
          console.log(`  --- ${phaseLabel(currentPhase)} ---`)
        }
        printInitiative(i)
      }
      if (items.length === 0) console.log('  (ninguna)')
      console.log()
      break
    }
    case 'show': {
      const id = parseInt(args[0])
      const i = getInitiative(id)
      if (!i) { console.error('Iniciativa no encontrada'); process.exit(1) }
      console.log(`\n  ID:          ${i.id}`)
      console.log(`  Título:      ${i.title}`)
      console.log(`  Proyecto:    ${i.project_id}`)
      console.log(`  Fase:        ${phaseLabel(i.phase)}`)
      console.log(`  Trampa:      ${i.trap ? i.trap.toUpperCase() : '-'}`)
      console.log(`  Descripción: ${i.description ?? '-'}`)
      console.log(`  En fase desde: ${i.phase_entered_at}`)
      console.log(`  Creada:      ${i.created_at}\n`)
      break
    }
    case 'advance': {
      const result = advancePhase(parseInt(args[0]))
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nFase avanzada: ${phaseLabel(result.from)} → ${phaseLabel(result.to)}\n`)
      break
    }
    case 'retreat': {
      const result = retreatPhase(parseInt(args[0]))
      if (!result.success) { console.error(result.error); process.exit(1) }
      console.log(`\nFase retrocedida: ${phaseLabel(result.from)} → ${phaseLabel(result.to)}\n`)
      break
    }
    case 'trap': {
      const trap = args[1] as 'rigidez' | 'escasez'
      if (!['rigidez', 'escasez'].includes(trap)) {
        console.error('Uso: initiative trap <id> <rigidez|escasez>')
        process.exit(1)
      }
      const i = setTrap(parseInt(args[0]), trap)
      if (!i) { console.error('Iniciativa no encontrada'); process.exit(1) }
      console.log(`\nTrampa ${trap.toUpperCase()} activada en "${i.title}"\n`)
      break
    }
    case 'untrap': {
      const i = clearTrap(parseInt(args[0]))
      if (!i) { console.error('Iniciativa no encontrada'); process.exit(1) }
      console.log(`\nTrampa desactivada en "${i.title}"\n`)
      break
    }
    case 'compost': {
      const flags = parseFlags(args.slice(1))
      const init = getInitiative(parseInt(args[0]))
      if (!init) { console.error('Iniciativa no encontrada'); process.exit(1) }

      // Move to compost regardless of current phase
      const db = (await import('../db.js')).getDb()
      db.prepare(
        "UPDATE initiatives SET phase = 'compost', phase_entered_at = datetime('now'), updated_at = datetime('now'), trap = NULL WHERE id = ?"
      ).run(init.id)

      console.log(`\n"${init.title}" movida a Compost.`)
      if (flags.reason) console.log(`  Razón: ${flags.reason}`)
      console.log(`  Fase anterior: ${phaseLabel(init.phase)}\n`)
      break
    }
    default:
      console.log('Uso: initiative <action> [args]')
      console.log('  add <project-id> <title> [--phase X] [--description "..."]')
      console.log('  list [--project X] [--phase X] [--trap]')
      console.log('  show <id>')
      console.log('  advance <id>        Avanzar fase')
      console.log('  retreat <id>        Retroceder fase')
      console.log('  trap <id> <tipo>    Marcar trampa (rigidez|escasez)')
      console.log('  untrap <id>         Quitar trampa')
      console.log('  compost <id>        Mover a compost [--reason "..."]')
  }
} finally {
  closeDb()
}
