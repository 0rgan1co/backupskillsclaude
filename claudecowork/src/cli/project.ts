import { listProjects, getProject, createProject } from '../models/project.js'
import { closeDb } from '../db.js'

const [action, ...args] = process.argv.slice(2)

function printProject(p: { id: string; name: string; description: string | null }) {
  console.log(`  [${p.id}] ${p.name}`)
  if (p.description) console.log(`    ${p.description}`)
}

try {
  switch (action) {
    case 'list': {
      const projects = listProjects()
      console.log(`\nProyectos (${projects.length}):\n`)
      for (const p of projects) printProject(p)
      console.log()
      break
    }
    case 'show': {
      const p = getProject(args[0])
      if (!p) { console.error(`Proyecto "${args[0]}" no encontrado`); process.exit(1) }
      console.log(`\n  ID:          ${p.id}`)
      console.log(`  Nombre:      ${p.name}`)
      console.log(`  Descripción: ${p.description ?? '-'}`)
      console.log(`  Creado:      ${p.created_at}\n`)
      break
    }
    case 'add': {
      if (args.length < 2) { console.error('Uso: project add <id> <name> [description]'); process.exit(1) }
      const p = createProject(args[0], args[1], args[2])
      console.log(`\nProyecto creado:`)
      printProject(p)
      console.log()
      break
    }
    default:
      console.log('Uso: project <list|show|add> [args]')
      console.log('  list                     - Listar proyectos')
      console.log('  show <id>                - Ver detalle')
      console.log('  add <id> <name> [desc]   - Crear proyecto')
  }
} finally {
  closeDb()
}
