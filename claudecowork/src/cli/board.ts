import { listTasks } from '../models/task.js'
import { getProject } from '../models/project.js'
import { renderBoard, renderBoardByInitiative } from '../views/board.js'
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
  const projectId = flags.project

  const tasks = listTasks({
    project_id: projectId,
  }).filter(t => t.state !== 'archivo')

  if (tasks.length === 0) {
    console.log('\nNo hay tareas activas.\n')
  } else if (args.includes('--by-initiative')) {
    console.log(renderBoardByInitiative(tasks))
  } else {
    const projectName = projectId ? getProject(projectId)?.name : undefined
    console.log(renderBoard(tasks, projectName))
  }
} finally {
  closeDb()
}
