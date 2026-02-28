import { getDb, closeDb } from '../db.js'
import { runMigrations, seedProjects } from '../schema.js'

function main() {
  console.log('Inicializando EcoCycle Planning...\n')

  const db = getDb()

  console.log('  Creando esquema de base de datos...')
  runMigrations(db)

  console.log('  Sembrando proyectos...')
  seedProjects(db)

  const projects = db.prepare('SELECT id, name FROM projects').all() as { id: string; name: string }[]
  console.log(`\n  Proyectos cargados (${projects.length}):`)
  for (const p of projects) {
    console.log(`    - ${p.name} (${p.id})`)
  }

  closeDb()
  console.log('\nEcoCycle listo. Base de datos creada en data/ecocycle.db')
}

main()
