import { getDb } from '../db.js'

export interface Initiative {
  id: number
  project_id: string
  title: string
  description: string | null
  phase: 'semilla' | 'brote' | 'crecimiento' | 'compost'
  trap: 'rigidez' | 'escasez' | null
  objectives: string | null
  achievements: string | null
  obstacles: string | null
  learnings: string | null
  next_steps: string | null
  phase_entered_at: string
  created_at: string
  updated_at: string
}

export interface TrapSuggestion {
  initiative: Initiative
  suggested_trap: 'rigidez' | 'escasez'
  reason: string
}

const PHASE_ORDER: Initiative['phase'][] = ['semilla', 'brote', 'crecimiento', 'compost']

const PHASE_LABELS: Record<string, string> = {
  semilla: 'Semilla',
  brote: 'Brote',
  crecimiento: 'Crecimiento',
  compost: 'Compost',
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

export function createInitiative(input: {
  project_id: string
  title: string
  description?: string
  phase?: Initiative['phase']
}): Initiative {
  const db = getDb()
  const phase = input.phase ?? 'semilla'

  const result = db.prepare(
    'INSERT INTO initiatives (project_id, title, description, phase) VALUES (?, ?, ?, ?)'
  ).run(input.project_id, input.title, input.description ?? null, phase)

  logActivity('initiative', result.lastInsertRowid as number, 'created', null, phase)

  return getInitiative(result.lastInsertRowid as number)!
}

export function getInitiative(id: number): Initiative | undefined {
  return getDb().prepare('SELECT * FROM initiatives WHERE id = ?').get(id) as Initiative | undefined
}

export function listInitiatives(filters?: {
  project_id?: string
  phase?: string
  trap_only?: boolean
}): Initiative[] {
  let sql = 'SELECT * FROM initiatives WHERE 1=1'
  const params: unknown[] = []

  if (filters?.project_id) {
    sql += ' AND project_id = ?'
    params.push(filters.project_id)
  }
  if (filters?.phase) {
    sql += ' AND phase = ?'
    params.push(filters.phase)
  }
  if (filters?.trap_only) {
    sql += ' AND trap IS NOT NULL'
  }

  sql += ' ORDER BY phase, created_at'
  return getDb().prepare(sql).all(...params) as Initiative[]
}

export function advancePhase(id: number): { success: boolean; from: string; to: string; error?: string } {
  const init = getInitiative(id)
  if (!init) return { success: false, from: '', to: '', error: 'Iniciativa no encontrada' }

  const idx = PHASE_ORDER.indexOf(init.phase)
  const nextIdx = (idx + 1) % PHASE_ORDER.length
  const newPhase = PHASE_ORDER[nextIdx]

  getDb().prepare(
    "UPDATE initiatives SET phase = ?, phase_entered_at = datetime('now'), updated_at = datetime('now'), trap = NULL WHERE id = ?"
  ).run(newPhase, id)

  logActivity('initiative', id, 'phase_change', init.phase, newPhase)

  return { success: true, from: init.phase, to: newPhase }
}

export function retreatPhase(id: number): { success: boolean; from: string; to: string; error?: string } {
  const init = getInitiative(id)
  if (!init) return { success: false, from: '', to: '', error: 'Iniciativa no encontrada' }

  const idx = PHASE_ORDER.indexOf(init.phase)
  const prevIdx = idx === 0 ? PHASE_ORDER.length - 1 : idx - 1
  const newPhase = PHASE_ORDER[prevIdx]

  getDb().prepare(
    "UPDATE initiatives SET phase = ?, phase_entered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(newPhase, id)

  logActivity('initiative', id, 'phase_change', init.phase, newPhase)

  return { success: true, from: init.phase, to: newPhase }
}

export function setTrap(id: number, trap: 'rigidez' | 'escasez'): Initiative | undefined {
  getDb().prepare(
    "UPDATE initiatives SET trap = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(trap, id)

  logActivity('initiative', id, 'trap_set', null, trap)

  return getInitiative(id)
}

export function clearTrap(id: number): Initiative | undefined {
  const init = getInitiative(id)
  getDb().prepare(
    "UPDATE initiatives SET trap = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(id)

  logActivity('initiative', id, 'trap_cleared', init?.trap ?? null, null)

  return getInitiative(id)
}

export function detectPotentialTraps(): TrapSuggestion[] {
  const db = getDb()
  const suggestions: TrapSuggestion[] = []

  // Rigidez: en crecimiento >60 días sin actividad de tareas
  const rigidez = db.prepare(`
    SELECT i.* FROM initiatives i
    WHERE i.phase = 'crecimiento'
      AND i.trap IS NULL
      AND julianday('now') - julianday(i.phase_entered_at) > 60
      AND NOT EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.initiative_id = i.id
          AND julianday('now') - julianday(t.updated_at) < 14
      )
  `).all() as Initiative[]

  for (const i of rigidez) {
    const days = Math.floor(
      (Date.now() - new Date(i.phase_entered_at).getTime()) / 86400000
    )
    suggestions.push({
      initiative: i,
      suggested_trap: 'rigidez',
      reason: `Lleva ${days} días en Crecimiento sin actividad reciente en tareas`,
    })
  }

  // Escasez: en semilla o brote >45 días con tareas mayormente en menu
  const escasez = db.prepare(`
    SELECT i.* FROM initiatives i
    WHERE i.phase IN ('semilla', 'brote')
      AND i.trap IS NULL
      AND julianday('now') - julianday(i.phase_entered_at) > 45
  `).all() as Initiative[]

  for (const i of escasez) {
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE initiative_id = ?').get(i.id) as { c: number }
    const inMenu = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE initiative_id = ? AND state = 'menu'").get(i.id) as { c: number }

    if (total.c === 0 || inMenu.c / total.c > 0.7) {
      const days = Math.floor(
        (Date.now() - new Date(i.phase_entered_at).getTime()) / 86400000
      )
      suggestions.push({
        initiative: i,
        suggested_trap: 'escasez',
        reason: `Lleva ${days} días en ${phaseLabel(i.phase)} con ${total.c === 0 ? 'ninguna tarea' : 'la mayoría de tareas sin priorizar'}`,
      })
    }
  }

  return suggestions
}

export function moveToPhase(id: number, newPhase: Initiative['phase']): { success: boolean; from: string; to: string; error?: string } {
  const init = getInitiative(id)
  if (!init) return { success: false, from: '', to: '', error: 'Iniciativa no encontrada' }
  if (init.phase === newPhase) return { success: true, from: newPhase, to: newPhase }

  getDb().prepare(
    "UPDATE initiatives SET phase = ?, phase_entered_at = datetime('now'), updated_at = datetime('now'), trap = NULL WHERE id = ?"
  ).run(newPhase, id)

  logActivity('initiative', id, 'phase_change', init.phase, newPhase)

  return { success: true, from: init.phase, to: newPhase }
}

export function updateInitiativeDetails(id: number, updates: {
  title?: string
  description?: string
  objectives?: string
  achievements?: string
  obstacles?: string
  learnings?: string
  next_steps?: string
}): Initiative | undefined {
  const init = getInitiative(id)
  if (!init) return undefined

  const sets: string[] = ["updated_at = datetime('now')"]
  const params: unknown[] = []

  if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description) }
  if (updates.objectives !== undefined) { sets.push('objectives = ?'); params.push(updates.objectives) }
  if (updates.achievements !== undefined) { sets.push('achievements = ?'); params.push(updates.achievements) }
  if (updates.obstacles !== undefined) { sets.push('obstacles = ?'); params.push(updates.obstacles) }
  if (updates.learnings !== undefined) { sets.push('learnings = ?'); params.push(updates.learnings) }
  if (updates.next_steps !== undefined) { sets.push('next_steps = ?'); params.push(updates.next_steps) }

  params.push(id)
  getDb().prepare(`UPDATE initiatives SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  logActivity('initiative', id, 'edited', null, null)

  return getInitiative(id)
}

function logActivity(entityType: string, entityId: number, action: string, oldValue: string | null, newValue: string | null, note?: string) {
  getDb().prepare(
    'INSERT INTO activity_log (entity_type, entity_id, action, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(entityType, entityId, action, oldValue, newValue, note ?? null)
}
