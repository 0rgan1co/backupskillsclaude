import { getDb } from '../db.js'

export interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export function listProjects(): Project[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY name').all() as Project[]
}

export function getProject(id: string): Project | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
}

export function createProject(id: string, name: string, description?: string): Project {
  getDb().prepare(
    'INSERT INTO projects (id, name, description) VALUES (?, ?, ?)'
  ).run(id, name, description ?? null)
  return getProject(id)!
}
