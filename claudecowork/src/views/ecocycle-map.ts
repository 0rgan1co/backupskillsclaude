import type { Initiative } from '../models/initiative.js'
import { phaseLabel } from '../models/initiative.js'
import { listTasks } from '../models/task.js'

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function daysSince(dateStr: string): number {
  // SQLite stores datetime without timezone — treat as UTC
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'Z')
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

export function renderEcocycleMap(initiatives: Initiative[]): string {
  const byPhase: Record<string, Initiative[]> = {
    crecimiento: [],
    compost: [],
    semilla: [],
    brote: [],
  }

  for (const i of initiatives) {
    byPhase[i.phase]?.push(i)
  }

  const lines: string[] = []
  const W = 60

  lines.push('')
  lines.push('  ╔' + '═'.repeat(W) + '╗')
  lines.push('  ║' + centerText('EcoCycle Planning Map', W) + '║')
  lines.push('  ╠' + '═'.repeat(W) + '╣')

  // Top half: Crecimiento + Compost
  lines.push('  ║' + centerText('CRECIMIENTO (Growth)', W) + '║')
  for (const i of byPhase.crecimiento) {
    const tasks = listTasks({ initiative_id: i.id })
    const active = tasks.filter(t => t.state !== 'archivo').length
    const trap = i.trap === 'rigidez' ? ' ⚠ RIGIDEZ' : ''
    const days = daysSince(i.phase_entered_at)
    lines.push('  ║' + padRight(`  • ${truncate(i.title, 35)} (${active}t, ${days}d)${trap}`, W) + '║')
  }
  if (byPhase.crecimiento.length === 0) {
    lines.push('  ║' + padRight('  (ninguna)', W) + '║')
  }

  lines.push('  ║' + ' '.repeat(W) + '║')
  lines.push('  ║' + centerText('↓ madurez → compostar ↓', W) + '║')
  lines.push('  ║' + ' '.repeat(W) + '║')

  lines.push('  ║' + centerText('COMPOST (Creative Destruction)', W) + '║')
  for (const i of byPhase.compost) {
    const days = daysSince(i.phase_entered_at)
    lines.push('  ║' + padRight(`  • ${truncate(i.title, 35)} (${days}d en compost)`, W) + '║')
  }
  if (byPhase.compost.length === 0) {
    lines.push('  ║' + padRight('  (ninguna)', W) + '║')
  }

  // Infinity crossing
  lines.push('  ╠' + '═'.repeat(W / 2 - 3) + ' ∞ ' + '═'.repeat(W / 2 - 2) + '╣')

  // Bottom half: Semilla + Brote
  lines.push('  ║' + centerText('SEMILLA (Renewal/Seed)', W) + '║')
  for (const i of byPhase.semilla) {
    const tasks = listTasks({ initiative_id: i.id })
    const active = tasks.filter(t => t.state !== 'archivo').length
    const trap = i.trap === 'escasez' ? ' ⚠ ESCASEZ' : ''
    const days = daysSince(i.phase_entered_at)
    lines.push('  ║' + padRight(`  • ${truncate(i.title, 35)} (${active}t, ${days}d)${trap}`, W) + '║')
  }
  if (byPhase.semilla.length === 0) {
    lines.push('  ║' + padRight('  (ninguna)', W) + '║')
  }

  lines.push('  ║' + ' '.repeat(W) + '║')
  lines.push('  ║' + centerText('↑ renovar → germinar ↑', W) + '║')
  lines.push('  ║' + ' '.repeat(W) + '║')

  lines.push('  ║' + centerText('BROTE (Birth/Germination)', W) + '║')
  for (const i of byPhase.brote) {
    const tasks = listTasks({ initiative_id: i.id })
    const active = tasks.filter(t => t.state !== 'archivo').length
    const trap = i.trap === 'escasez' ? ' ⚠ ESCASEZ' : ''
    const days = daysSince(i.phase_entered_at)
    lines.push('  ║' + padRight(`  • ${truncate(i.title, 35)} (${active}t, ${days}d)${trap}`, W) + '║')
  }
  if (byPhase.brote.length === 0) {
    lines.push('  ║' + padRight('  (ninguna)', W) + '║')
  }

  lines.push('  ╚' + '═'.repeat(W) + '╝')
  lines.push('')

  return lines.join('\n')
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length)
  const left = Math.floor(padding / 2)
  const right = padding - left
  return ' '.repeat(left) + text + ' '.repeat(right)
}

function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}
