import { getDb } from '../db.js'

export interface Task {
  id: number
  initiative_id: number
  title: string
  description: string | null
  state: 'menu' | 'por_hacer' | 'haciendo' | 'hecho' | 'archivo'
  sub_state: 'bloqueado' | 'esperando' | null
  blocked_reason: string | null
  person_ref: string | null
  source: string
  source_ref: string | null
  priority: number
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateTaskInput {
  initiative_id: number
  title: string
  description?: string
  priority?: number
  due_date?: string
  person_ref?: string
  source?: string
  source_ref?: string
}

const WIP_LIMIT = 5

const VALID_TRANSITIONS: Record<string, string[]> = {
  menu: ['por_hacer'],
  por_hacer: ['haciendo', 'menu', 'archivo'],
  haciendo: ['hecho', 'por_hacer'],
  hecho: ['archivo'],
  archivo: [],
}

const STATE_LABELS: Record<string, string> = {
  menu: 'Menu',
  por_hacer: 'Por Hacer',
  haciendo: 'Haciendo',
  hecho: 'Hecho',
  archivo: 'Archivo',
}

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO tasks (initiative_id, title, description, priority, due_date, person_ref, source, source_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.initiative_id,
    input.title,
    input.description ?? null,
    input.priority ?? 0,
    input.due_date ?? null,
    input.person_ref ?? null,
    input.source ?? 'manual',
    input.source_ref ?? null
  )

  logActivity('task', result.lastInsertRowid as number, 'created', null, 'menu')

  return getTask(result.lastInsertRowid as number)!
}

export function getTask(id: number): Task | undefined {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function listTasks(filters?: {
  initiative_id?: number
  state?: string
  project_id?: string
}): Task[] {
  let sql = 'SELECT t.* FROM tasks t'
  const params: unknown[] = []

  if (filters?.project_id) {
    sql += ' JOIN initiatives i ON t.initiative_id = i.id WHERE i.project_id = ?'
    params.push(filters.project_id)
  } else {
    sql += ' WHERE 1=1'
  }

  if (filters?.initiative_id) {
    sql += ' AND t.initiative_id = ?'
    params.push(filters.initiative_id)
  }
  if (filters?.state) {
    sql += ' AND t.state = ?'
    params.push(filters.state)
  }

  sql += ' ORDER BY t.priority DESC, t.created_at'
  return getDb().prepare(sql).all(...params) as Task[]
}

export function moveTask(id: number, newState: string): { success: boolean; error?: string; task?: Task } {
  const task = getTask(id)
  if (!task) return { success: false, error: 'Tarea no encontrada' }

  const allowed = VALID_TRANSITIONS[task.state]
  if (!allowed?.includes(newState)) {
    return {
      success: false,
      error: `No se puede mover de ${stateLabel(task.state)} a ${stateLabel(newState)}. Transiciones válidas: ${allowed?.map(stateLabel).join(', ') || 'ninguna'}`,
    }
  }

  // WIP limit check
  if (newState === 'haciendo') {
    const wipCount = getWipCount()
    if (wipCount >= WIP_LIMIT) {
      const current = getHaciendoTasks()
      const list = current.map(t => `  - [${t.id}] ${t.title}`).join('\n')
      return {
        success: false,
        error: `WIP limit alcanzado (${wipCount}/${WIP_LIMIT}). Tareas en progreso:\n${list}\nCompletá o pausá alguna antes de tomar otra.`,
      }
    }
  }

  const updates: string[] = [
    "state = ?",
    "sub_state = NULL",
    "blocked_reason = NULL",
    "updated_at = datetime('now')",
  ]

  if (newState === 'haciendo') updates.push("started_at = datetime('now')")
  if (newState === 'hecho') updates.push("completed_at = datetime('now')")
  if (newState === 'archivo') updates.push("archived_at = datetime('now')")

  getDb().prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(newState, id)

  logActivity('task', id, 'state_change', task.state, newState)

  return { success: true, task: getTask(id) }
}

export function setSubState(
  id: number,
  subState: 'bloqueado' | 'esperando' | null,
  reason?: string
): { success: boolean; error?: string; task?: Task } {
  const task = getTask(id)
  if (!task) return { success: false, error: 'Tarea no encontrada' }

  if (task.state !== 'por_hacer' && task.state !== 'haciendo') {
    return { success: false, error: `Solo se puede bloquear/esperar tareas en Por Hacer o Haciendo` }
  }

  getDb().prepare(
    "UPDATE tasks SET sub_state = ?, blocked_reason = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(subState, reason ?? null, id)

  const action = subState ? `sub_state_${subState}` : 'sub_state_cleared'
  logActivity('task', id, action, task.sub_state, subState)

  return { success: true, task: getTask(id) }
}

export function clearSubState(id: number): { success: boolean; error?: string; task?: Task } {
  return setSubState(id, null)
}

export function editTask(id: number, updates: {
  title?: string
  description?: string
  due_date?: string
  priority?: number
  person_ref?: string
}): { success: boolean; error?: string; task?: Task } {
  const task = getTask(id)
  if (!task) return { success: false, error: 'Tarea no encontrada' }

  const sets: string[] = ["updated_at = datetime('now')"]
  const params: unknown[] = []

  if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description) }
  if (updates.due_date !== undefined) { sets.push('due_date = ?'); params.push(updates.due_date) }
  if (updates.priority !== undefined) { sets.push('priority = ?'); params.push(updates.priority) }
  if (updates.person_ref !== undefined) { sets.push('person_ref = ?'); params.push(updates.person_ref) }

  params.push(id)
  getDb().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  logActivity('task', id, 'edited', null, null)

  return { success: true, task: getTask(id) }
}

export function getWipCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) as c FROM tasks WHERE state = 'haciendo'").get() as { c: number }
  return row.c
}

export function getHaciendoTasks(): Task[] {
  return getDb().prepare("SELECT * FROM tasks WHERE state = 'haciendo' ORDER BY started_at").all() as Task[]
}

export function getCelebrateTasks(): Task[] {
  return getDb().prepare("SELECT * FROM tasks WHERE state = 'hecho' ORDER BY completed_at").all() as Task[]
}

export function archiveAllDone(): number {
  const result = getDb().prepare(
    "UPDATE tasks SET state = 'archivo', archived_at = datetime('now'), updated_at = datetime('now') WHERE state = 'hecho'"
  ).run()
  return result.changes
}

function logActivity(entityType: string, entityId: number, action: string, oldValue: string | null, newValue: string | null) {
  getDb().prepare(
    'INSERT INTO activity_log (entity_type, entity_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
  ).run(entityType, entityId, action, oldValue, newValue)
}
