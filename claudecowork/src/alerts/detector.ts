import { getDb } from '../db.js'
import { stateLabel } from '../models/task.js'
import { phaseLabel } from '../models/initiative.js'

export interface Alert {
  type: 'wip_overflow' | 'blocked_stale' | 'waiting_stale' | 'initiative_trap' |
    'initiative_stale' | 'due_soon' | 'overdue' | 'celebrate'
  severity: 'info' | 'warning' | 'critical'
  message: string
  entity_type: 'task' | 'initiative'
  entity_id: number
}

const SEVERITY_ICONS: Record<string, string> = {
  critical: '[!!]',
  warning: '[!]',
  info: '[i]',
}

export function detectAlerts(): Alert[] {
  const db = getDb()
  const alerts: Alert[] = []
  const now = new Date().toISOString()

  // WIP overflow
  const wipCount = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE state = 'haciendo'").get() as { c: number }).c
  if (wipCount > 5) {
    alerts.push({
      type: 'wip_overflow',
      severity: 'warning',
      message: `WIP excedido: ${wipCount}/5 tareas en Haciendo`,
      entity_type: 'task',
      entity_id: 0,
    })
  }

  // Blocked stale (>3 days)
  const blockedStale = db.prepare(`
    SELECT id, title, blocked_reason, updated_at FROM tasks
    WHERE sub_state = 'bloqueado'
      AND julianday('now') - julianday(updated_at) > 3
  `).all() as { id: number; title: string; blocked_reason: string; updated_at: string }[]

  for (const t of blockedStale) {
    const days = Math.floor((Date.now() - new Date(t.updated_at + 'Z').getTime()) / 86400000)
    alerts.push({
      type: 'blocked_stale',
      severity: 'warning',
      message: `"${t.title}" bloqueada hace ${days} días: ${t.blocked_reason ?? 'sin razón'}`,
      entity_type: 'task',
      entity_id: t.id,
    })
  }

  // Waiting stale (>5 days)
  const waitingStale = db.prepare(`
    SELECT id, title, blocked_reason, updated_at FROM tasks
    WHERE sub_state = 'esperando'
      AND julianday('now') - julianday(updated_at) > 5
  `).all() as { id: number; title: string; blocked_reason: string; updated_at: string }[]

  for (const t of waitingStale) {
    const days = Math.floor((Date.now() - new Date(t.updated_at + 'Z').getTime()) / 86400000)
    alerts.push({
      type: 'waiting_stale',
      severity: 'warning',
      message: `"${t.title}" esperando hace ${days} días: ${t.blocked_reason ?? ''}`,
      entity_type: 'task',
      entity_id: t.id,
    })
  }

  // Initiative traps
  const trapped = db.prepare(`
    SELECT id, title, phase, trap FROM initiatives WHERE trap IS NOT NULL
  `).all() as { id: number; title: string; phase: string; trap: string }[]

  for (const i of trapped) {
    alerts.push({
      type: 'initiative_trap',
      severity: 'critical',
      message: `"${i.title}" en trampa de ${i.trap.toUpperCase()} (fase: ${phaseLabel(i.phase)})`,
      entity_type: 'initiative',
      entity_id: i.id,
    })
  }

  // Initiative stale (>30 days same phase, no task activity)
  const staleInit = db.prepare(`
    SELECT i.id, i.title, i.phase, i.phase_entered_at FROM initiatives i
    WHERE i.trap IS NULL
      AND julianday('now') - julianday(i.phase_entered_at) > 30
      AND NOT EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.initiative_id = i.id
          AND julianday('now') - julianday(t.updated_at) < 14
      )
  `).all() as { id: number; title: string; phase: string; phase_entered_at: string }[]

  for (const i of staleInit) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(i.phase_entered_at + 'Z').getTime()) / 86400000))
    alerts.push({
      type: 'initiative_stale',
      severity: 'warning',
      message: `"${i.title}" lleva ${days} días en ${phaseLabel(i.phase)} sin actividad`,
      entity_type: 'initiative',
      entity_id: i.id,
    })
  }

  // Due soon (within 48h)
  const dueSoon = db.prepare(`
    SELECT id, title, due_date FROM tasks
    WHERE due_date IS NOT NULL
      AND state NOT IN ('hecho', 'archivo')
      AND julianday(due_date) - julianday('now') BETWEEN 0 AND 2
  `).all() as { id: number; title: string; due_date: string }[]

  for (const t of dueSoon) {
    alerts.push({
      type: 'due_soon',
      severity: 'info',
      message: `"${t.title}" vence el ${t.due_date}`,
      entity_type: 'task',
      entity_id: t.id,
    })
  }

  // Overdue
  const overdue = db.prepare(`
    SELECT id, title, due_date FROM tasks
    WHERE due_date IS NOT NULL
      AND state NOT IN ('hecho', 'archivo')
      AND julianday(due_date) < julianday('now')
  `).all() as { id: number; title: string; due_date: string }[]

  for (const t of overdue) {
    alerts.push({
      type: 'overdue',
      severity: 'critical',
      message: `"${t.title}" VENCIDA (era para ${t.due_date})`,
      entity_type: 'task',
      entity_id: t.id,
    })
  }

  // Celebrate
  const celebrate = db.prepare(`
    SELECT id, title FROM tasks WHERE state = 'hecho'
  `).all() as { id: number; title: string }[]

  if (celebrate.length > 0) {
    alerts.push({
      type: 'celebrate',
      severity: 'info',
      message: `${celebrate.length} tarea(s) completada(s) para celebrar y archivar`,
      entity_type: 'task',
      entity_id: 0,
    })
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => order[a.severity] - order[b.severity])

  return alerts
}

export function formatAlerts(alerts: Alert[]): string {
  if (alerts.length === 0) return '  Sin alertas. Todo en orden.'

  const lines: string[] = []
  for (const a of alerts) {
    const icon = SEVERITY_ICONS[a.severity]
    lines.push(`  ${icon} ${a.message}`)
  }
  return lines.join('\n')
}
