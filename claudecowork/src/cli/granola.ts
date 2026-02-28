import { createTask } from '../models/task.js'
import { getInitiative } from '../models/initiative.js'
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

interface ImportTask {
  title: string
  description?: string
  person?: string
  due?: string
  priority?: number
}

try {
  switch (action) {
    case 'import': {
      const flags = parseFlags(args)
      const initiativeId = parseInt(flags.initiative)
      const sourceRef = flags['source-ref'] ?? 'granola-import'

      if (!initiativeId) {
        console.error('Uso: granola import --initiative <id> --tasks \'[...]\' [--source-ref "doc-id"]')
        process.exit(1)
      }

      const init = getInitiative(initiativeId)
      if (!init) {
        console.error(`Iniciativa ${initiativeId} no encontrada`)
        process.exit(1)
      }

      let tasks: ImportTask[]
      try {
        tasks = JSON.parse(flags.tasks)
      } catch {
        console.error('Error parseando JSON de tareas. Formato esperado:')
        console.error('[{"title":"...", "person":"...", "due":"YYYY-MM-DD"}]')
        process.exit(1)
      }

      console.log(`\nImportando ${tasks.length} tarea(s) a "${init.title}":\n`)

      for (const t of tasks) {
        const task = createTask({
          initiative_id: initiativeId,
          title: t.title,
          description: t.description,
          person_ref: t.person,
          due_date: t.due,
          priority: t.priority ?? 0,
          source: 'granola',
          source_ref: sourceRef,
        })
        console.log(`  + [${task.id}] ${task.title}${t.person ? ` → ${t.person}` : ''}${t.due ? ` (vence: ${t.due})` : ''}`)
      }

      console.log(`\nImportación completa. Fuente: ${sourceRef}\n`)
      break
    }
    default:
      console.log('Uso: granola <action>')
      console.log('  import --initiative <id> --tasks \'[...]\' [--source-ref "doc-id"]')
      console.log('')
      console.log('Formato de tareas (JSON):')
      console.log('  [{"title":"...", "person":"...", "due":"YYYY-MM-DD", "priority": 0}]')
      console.log('')
      console.log('Nota: Claudia usa las herramientas MCP de Granola para extraer')
      console.log('las tareas de notas de reuniones y luego las importa aquí.')
  }
} finally {
  closeDb()
}
