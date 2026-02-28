import type Database from 'better-sqlite3'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS initiatives (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  title           TEXT NOT NULL,
  description     TEXT,
  phase           TEXT NOT NULL DEFAULT 'semilla'
                    CHECK (phase IN ('semilla','brote','crecimiento','compost')),
  trap            TEXT CHECK (trap IN (NULL, 'rigidez', 'escasez')),
  phase_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id   INTEGER NOT NULL REFERENCES initiatives(id),
  title           TEXT NOT NULL,
  description     TEXT,
  state           TEXT NOT NULL DEFAULT 'menu'
                    CHECK (state IN ('menu','por_hacer','haciendo','hecho','archivo')),
  sub_state       TEXT CHECK (sub_state IN (NULL, 'bloqueado', 'esperando')),
  blocked_reason  TEXT,
  person_ref      TEXT,
  source          TEXT DEFAULT 'manual',
  source_ref      TEXT,
  priority        INTEGER DEFAULT 0,
  due_date        TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  archived_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task','initiative','project')),
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_initiative ON tasks(initiative_id);
CREATE INDEX IF NOT EXISTS idx_tasks_haciendo ON tasks(state) WHERE state = 'haciendo';
CREATE INDEX IF NOT EXISTS idx_initiatives_project ON initiatives(project_id);
CREATE INDEX IF NOT EXISTS idx_initiatives_phase ON initiatives(phase);
CREATE INDEX IF NOT EXISTS idx_initiatives_trap ON initiatives(trap) WHERE trap IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
`

const SEED_PROJECTS = [
  { id: 'ai-change-lab', name: 'AI.Change.LAB', description: 'AI adoption for Buenos Aires city government (GCBA)' },
  { id: 'circulos-impacto', name: 'Círculos Impacto+', description: 'Peer learning for LATAM science-tech founders' },
  { id: 'argenwagyu', name: 'Argenwagyu', description: 'Agricultural commercial strategy' },
  { id: 'brasil-regenera', name: 'Brasil Regenera', description: 'Agricultural immersion program' },
]

const MIGRATIONS = [
  // v1: Add rich fields to initiatives
  `ALTER TABLE initiatives ADD COLUMN objectives TEXT`,
  `ALTER TABLE initiatives ADD COLUMN achievements TEXT`,
  `ALTER TABLE initiatives ADD COLUMN obstacles TEXT`,
  `ALTER TABLE initiatives ADD COLUMN learnings TEXT`,
  `ALTER TABLE initiatives ADD COLUMN next_steps TEXT`,
]

export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA)

  // Run incremental migrations (safe to re-run)
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists — skip
    }
  }
}

export function seedProjects(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO projects (id, name, description) VALUES (?, ?, ?)'
  )

  const tx = db.transaction(() => {
    for (const p of SEED_PROJECTS) {
      insert.run(p.id, p.name, p.description)
    }
  })

  tx()
}
