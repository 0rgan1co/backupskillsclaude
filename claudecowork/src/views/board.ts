import type { Task } from '../models/task.js'
import { stateLabel, getWipCount } from '../models/task.js'
import { getInitiative } from '../models/initiative.js'

const STATES = ['menu', 'por_hacer', 'haciendo', 'hecho'] as const
const COL_WIDTH = 28

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - s.length))
}

function formatTaskLine(t: Task): string {
  let label = truncate(t.title, COL_WIDTH - 4)
  if (t.sub_state === 'bloqueado') label = `[!] ${label}`
  else if (t.sub_state === 'esperando') label = `[~] ${label}`
  if (t.priority >= 2) label = `** ${label}`
  else if (t.priority === 1) label = `* ${label}`
  return label
}

export function renderBoard(tasks: Task[], projectName?: string): string {
  const wip = getWipCount()
  const lines: string[] = []

  // Group tasks by state
  const byState: Record<string, Task[]> = {}
  for (const s of STATES) byState[s] = []
  for (const t of tasks) {
    if (t.state in byState) byState[t.state].push(t)
  }

  // Header
  const title = projectName ? `Tablero: ${projectName}` : 'Tablero General'
  lines.push('')
  lines.push(`  ${title}  |  WIP: ${wip}/5`)
  lines.push('  ' + '─'.repeat(COL_WIDTH * 4 + 7))

  // Column headers
  const headers = STATES.map(s => pad(stateLabel(s), COL_WIDTH))
  lines.push('  ' + headers.join(' │ '))
  lines.push('  ' + STATES.map(() => '─'.repeat(COL_WIDTH)).join('─┼─'))

  // Find max rows
  const maxRows = Math.max(...STATES.map(s => byState[s].length), 1)

  // Render rows
  for (let r = 0; r < maxRows; r++) {
    const cols = STATES.map(s => {
      const t = byState[s][r]
      return pad(t ? formatTaskLine(t) : '', COL_WIDTH)
    })
    lines.push('  ' + cols.join(' │ '))
  }

  lines.push('  ' + '─'.repeat(COL_WIDTH * 4 + 7))

  // Legend
  lines.push('')
  lines.push('  [!] bloqueado  [~] esperando  * prioridad alta  ** urgente')
  lines.push('')

  return lines.join('\n')
}

export function renderBoardByInitiative(tasks: Task[]): string {
  const byInit: Record<number, Task[]> = {}
  for (const t of tasks) {
    if (!byInit[t.initiative_id]) byInit[t.initiative_id] = []
    byInit[t.initiative_id].push(t)
  }

  const sections: string[] = []
  for (const [initId, initTasks] of Object.entries(byInit)) {
    const init = getInitiative(parseInt(initId))
    const name = init ? `${init.title} (${init.phase})` : `Iniciativa ${initId}`
    sections.push(renderBoard(initTasks, name))
  }

  return sections.join('\n')
}
