import { listInitiatives } from '../models/initiative.js'
import { renderEcocycleMap } from '../views/ecocycle-map.js'
import { closeDb } from '../db.js'

const args = process.argv.slice(2)

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

try {
  const flags = parseFlags(args)
  const initiatives = listInitiatives({
    project_id: flags.project,
  })

  console.log(renderEcocycleMap(initiatives))
} finally {
  closeDb()
}
