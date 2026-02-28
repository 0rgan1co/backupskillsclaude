import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb, closeDb } from '../db.js'
import { listProjects } from '../models/project.js'
import {
  listInitiatives, getInitiative, advancePhase, retreatPhase,
  setTrap, clearTrap, detectPotentialTraps, moveToPhase, updateInitiativeDetails
} from '../models/initiative.js'
import {
  listTasks, moveTask, setSubState, clearSubState, getWipCount,
  createTask, getTask, editTask
} from '../models/task.js'
import { detectAlerts } from '../alerts/detector.js'
import { runMigrations } from '../schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT ?? '3000')

const app = express()
app.use(express.json())

// Ensure migrations run (adds new columns if needed)
runMigrations(getDb())

// --- API Routes ---

app.get('/api/projects', (_req, res) => {
  res.json(listProjects())
})

app.get('/api/initiatives', (req, res) => {
  const projectId = req.query.project as string | undefined
  res.json(listInitiatives({ project_id: projectId }))
})

app.get('/api/initiatives/:id', (req, res) => {
  const init = getInitiative(parseInt(req.params.id))
  if (!init) { res.status(404).json({ error: 'Not found' }); return }
  const tasks = listTasks({ initiative_id: init.id })
  res.json({ ...init, tasks })
})

app.post('/api/initiatives/:id/advance', (req, res) => {
  res.json(advancePhase(parseInt(req.params.id)))
})

app.post('/api/initiatives/:id/retreat', (req, res) => {
  res.json(retreatPhase(parseInt(req.params.id)))
})

app.post('/api/initiatives/:id/phase', (req, res) => {
  const { phase } = req.body
  if (!['semilla', 'brote', 'crecimiento', 'compost'].includes(phase)) {
    res.status(400).json({ error: 'Invalid phase' }); return
  }
  res.json(moveToPhase(parseInt(req.params.id), phase))
})

app.put('/api/initiatives/:id', (req, res) => {
  const init = updateInitiativeDetails(parseInt(req.params.id), req.body)
  if (!init) { res.status(404).json({ error: 'Not found' }); return }
  res.json(init)
})

app.post('/api/initiatives/:id/trap', (req, res) => {
  const { trap } = req.body
  if (!['rigidez', 'escasez'].includes(trap)) {
    res.status(400).json({ error: 'Trap must be rigidez or escasez' }); return
  }
  res.json(setTrap(parseInt(req.params.id), trap))
})

app.post('/api/initiatives/:id/untrap', (req, res) => {
  res.json(clearTrap(parseInt(req.params.id)))
})

app.get('/api/tasks', (req, res) => {
  const projectId = req.query.project as string | undefined
  const initiativeId = req.query.initiative ? parseInt(req.query.initiative as string) : undefined
  const state = req.query.state as string | undefined
  res.json(listTasks({ project_id: projectId, initiative_id: initiativeId, state }))
})

app.get('/api/tasks/:id', (req, res) => {
  const task = getTask(parseInt(req.params.id))
  if (!task) { res.status(404).json({ error: 'Not found' }); return }
  res.json(task)
})

app.post('/api/tasks', (req, res) => {
  res.json(createTask(req.body))
})

app.put('/api/tasks/:id', (req, res) => {
  const result = editTask(parseInt(req.params.id), req.body)
  if (!result.success) { res.status(400).json(result); return }
  res.json(result.task)
})

app.post('/api/tasks/:id/move', (req, res) => {
  const result = moveTask(parseInt(req.params.id), req.body.state)
  if (!result.success) { res.status(400).json(result); return }
  res.json(result)
})

app.post('/api/tasks/:id/block', (req, res) => {
  res.json(setSubState(parseInt(req.params.id), 'bloqueado', req.body.reason))
})

app.post('/api/tasks/:id/wait', (req, res) => {
  res.json(setSubState(parseInt(req.params.id), 'esperando', req.body.person))
})

app.post('/api/tasks/:id/unblock', (req, res) => {
  res.json(clearSubState(parseInt(req.params.id)))
})

app.get('/api/alerts', (_req, res) => {
  res.json({ alerts: detectAlerts(), traps: detectPotentialTraps() })
})

app.get('/api/stats', (_req, res) => {
  const db = getDb()
  const totalTasks = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c
  const byState = db.prepare("SELECT state, COUNT(*) as c FROM tasks GROUP BY state").all() as { state: string; c: number }[]
  const byPhase = db.prepare("SELECT phase, COUNT(*) as c FROM initiatives GROUP BY phase").all() as { phase: string; c: number }[]
  res.json({ totalTasks, byState, byPhase, wip: getWipCount(), wipLimit: 5 })
})

// --- Frontend ---
app.get('/', (_req, res) => { res.type('html').send(dashboardHTML()) })

const server = app.listen(PORT, () => {
  console.log(`\n  EcoCycle Dashboard corriendo en http://localhost:${PORT}\n`)
  import('child_process').then(({ exec }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    exec(`${cmd} http://localhost:${PORT}`)
  })
})

process.on('SIGINT', () => { server.close(); closeDb(); process.exit(0) })

function dashboardHTML(): string {
  return HTML
}

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EcoCycle Dashboard</title>
<style>
:root {
  --bg: #0f1117; --surface: #1a1d27; --surface2: #242836; --surface3: #2c3044;
  --border: #2e3348; --text: #e2e4ed; --text-dim: #8b8fa3; --text-muted: #5c6078;
  --accent: #7c6ff7; --accent2: #5b8def;
  --green: #4ade80; --yellow: #fbbf24; --red: #f87171; --orange: #fb923c;
  --seed: #a78bfa; --sprout: #34d399; --growth: #60a5fa; --compost: #f97316;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

/* Header */
.header { padding: 16px 32px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.header h1 { font-size: 20px; font-weight: 600; }
.header h1 span { color: var(--accent); }
.header-right { display: flex; gap: 12px; align-items: center; }
.wip-badge { background: var(--surface2); padding: 6px 14px; border-radius: 20px; font-size: 13px; border: 1px solid var(--border); }
.wip-badge.over { border-color: var(--red); color: var(--red); }
select { background: var(--surface2); color: var(--text); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.container { padding: 24px 32px; display: flex; flex-direction: column; gap: 24px; }

/* Alerts */
.alerts { display: flex; gap: 8px; flex-wrap: wrap; }
.alert { padding: 8px 14px; border-radius: 8px; font-size: 13px; }
.alert.critical { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); color: var(--red); }
.alert.warning { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); color: var(--yellow); }
.alert.info { background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3); color: var(--accent2); }

/* Stats */
.stats { display: flex; gap: 12px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px; min-width: 110px; }
.stat-card .label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; }
.stat-card .value { font-size: 26px; font-weight: 700; margin-top: 2px; }

/* EcoCycle Map */
.section-title { font-size: 15px; margin-bottom: 12px; color: var(--text-dim); font-weight: 500; }
.ecocycle-map { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr auto 1fr; background: var(--surface); border-radius: 16px; border: 1px solid var(--border); overflow: hidden; min-height: 240px; }
.phase-box { padding: 16px; display: flex; flex-direction: column; gap: 6px; min-height: 120px; transition: background 0.15s; }
.phase-box.drop-over { background: rgba(124,111,247,0.06); }
.phase-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; }
.phase-crecimiento { border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); }
.phase-crecimiento h3 { color: var(--growth); }
.phase-compost { border-bottom: 1px solid var(--border); }
.phase-compost h3 { color: var(--compost); }
.phase-semilla { border-right: 1px solid var(--border); }
.phase-semilla h3 { color: var(--seed); }
.phase-brote h3 { color: var(--sprout); }
.infinity-divider { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; padding: 6px; background: var(--surface2); font-size: 20px; color: var(--accent); letter-spacing: 8px; }

.init-card { background: var(--surface2); padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: grab; transition: all 0.15s; border: 1px solid transparent; }
.init-card:hover { border-color: var(--accent); }
.init-card.dragging { opacity: 0.35; }
.init-card .init-info { cursor: pointer; flex: 1; }
.init-card .meta { color: var(--text-dim); font-size: 11px; margin-top: 2px; }
.trap-badge { background: rgba(248,113,113,0.2); color: var(--red); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.empty-phase { color: var(--text-muted); font-style: italic; font-size: 12px; padding: 8px 0; }

/* Kanban */
.kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; min-height: 280px; }
.kanban-col { background: var(--surface); border-radius: 12px; border: 1px solid var(--border); padding: 14px; display: flex; flex-direction: column; gap: 8px; transition: all 0.15s; }
.kanban-col.drop-over { border-color: var(--accent); background: rgba(124,111,247,0.05); }
.col-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.col-header h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.col-count { background: var(--surface2); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text-dim); }

.task-card { background: var(--surface2); padding: 12px; border-radius: 8px; font-size: 13px; cursor: grab; transition: all 0.15s; border: 1px solid transparent; border-left: 3px solid var(--border); }
.task-card:hover { border-color: var(--accent); }
.task-card.dragging { opacity: 0.35; }
.task-card.priority-1 { border-left-color: var(--yellow); }
.task-card.priority-2 { border-left-color: var(--red); }
.task-card .task-title { font-weight: 500; margin-bottom: 4px; cursor: pointer; }
.task-card .task-title:hover { color: var(--accent); }
.task-card .task-meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--text-dim); }
.sub-badge { padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.sub-badge.bloqueado { background: rgba(248,113,113,0.2); color: var(--red); }
.sub-badge.esperando { background: rgba(251,191,36,0.2); color: var(--yellow); }

/* Modal overlay */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: flex-start; justify-content: center; padding-top: 60px; backdrop-filter: blur(4px); }
.modal-overlay.open { display: flex; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 680px; max-width: 95vw; max-height: 85vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 24px 24px 0; }
.modal-header h2 { font-size: 20px; font-weight: 600; flex: 1; }
.modal-close { background: none; border: none; color: var(--text-dim); font-size: 24px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.modal-close:hover { background: var(--surface2); color: var(--text); }
.modal-body { padding: 16px 24px 24px; }
.modal-meta { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0 20px; font-size: 13px; color: var(--text-dim); }
.modal-meta .tag { background: var(--surface2); padding: 4px 10px; border-radius: 6px; }
.phase-tag { font-weight: 600; }
.phase-tag.semilla { color: var(--seed); }
.phase-tag.brote { color: var(--sprout); }
.phase-tag.crecimiento { color: var(--growth); }
.phase-tag.compost { color: var(--compost); }

/* Editable sections */
.section { margin-bottom: 20px; }
.section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.section-label .icon { font-size: 14px; }
.section-content { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; min-height: 60px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; cursor: text; transition: border-color 0.15s; }
.section-content:hover { border-color: var(--text-dim); }
.section-content:focus { outline: none; border-color: var(--accent); }
.section-content:empty::before { content: attr(data-placeholder); color: var(--text-muted); }

/* Task modal specific */
.task-modal-state { display: flex; gap: 6px; margin: 12px 0; }
.state-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text-dim); padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.state-btn:hover { border-color: var(--accent); color: var(--text); }
.state-btn.active { background: var(--accent); border-color: var(--accent); color: white; }
.task-field { margin-bottom: 14px; }
.task-field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); display: block; margin-bottom: 4px; }
.task-field input, .task-field select { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; width: 100%; }
.task-field input:focus, .task-field select:focus { outline: none; border-color: var(--accent); }
.task-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* Initiative tasks list inside modal */
.init-tasks-list { margin-top: 8px; }
.init-task-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface2); border-radius: 6px; margin-bottom: 4px; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
.init-task-item:hover { border-color: var(--border); }
.init-task-item .state-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.state-dot.menu { background: var(--text-muted); }
.state-dot.por_hacer { background: var(--accent2); }
.state-dot.haciendo { background: var(--yellow); }
.state-dot.hecho { background: var(--green); }

.save-indicator { color: var(--green); font-size: 12px; opacity: 0; transition: opacity 0.3s; }
.save-indicator.show { opacity: 1; }

@media (max-width: 768px) {
  .kanban { grid-template-columns: 1fr 1fr; }
  .ecocycle-map { grid-template-columns: 1fr; }
  .container { padding: 16px; }
  .modal { width: 100%; border-radius: 12px; }
  .task-field-row { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<div class="header">
  <h1><span>EcoCycle</span> Dashboard</h1>
  <div class="header-right">
    <select id="projectFilter"><option value="">Todos los proyectos</option></select>
    <div class="wip-badge" id="wipBadge">WIP: -/5</div>
  </div>
</div>

<div class="container">
  <div class="alerts" id="alertsContainer"></div>
  <div class="stats" id="statsContainer"></div>

  <div>
    <div class="section-title">Mapa EcoCycle</div>
    <div class="ecocycle-map">
      <div class="phase-box phase-crecimiento" id="phase-crecimiento" data-phase="crecimiento"><h3>Crecimiento</h3></div>
      <div class="phase-box phase-compost" id="phase-compost" data-phase="compost"><h3>Compost</h3></div>
      <div class="infinity-divider">&#8734;</div>
      <div class="phase-box phase-semilla" id="phase-semilla" data-phase="semilla"><h3>Semilla</h3></div>
      <div class="phase-box phase-brote" id="phase-brote" data-phase="brote"><h3>Brote</h3></div>
    </div>
  </div>

  <div>
    <div class="section-title">Tablero de Tareas</div>
    <div class="kanban" id="kanbanBoard">
      <div class="kanban-col" data-state="menu"><div class="col-header"><h3>Menu</h3><span class="col-count" id="count-menu">0</span></div></div>
      <div class="kanban-col" data-state="por_hacer"><div class="col-header"><h3>Por Hacer</h3><span class="col-count" id="count-por_hacer">0</span></div></div>
      <div class="kanban-col" data-state="haciendo"><div class="col-header"><h3>Haciendo</h3><span class="col-count" id="count-haciendo">0</span></div></div>
      <div class="kanban-col" data-state="hecho"><div class="col-header"><h3>Hecho</h3><span class="col-count" id="count-hecho">0</span></div></div>
    </div>
  </div>
</div>

<!-- Initiative Modal -->
<div class="modal-overlay" id="initModal">
  <div class="modal">
    <div class="modal-header">
      <h2 id="initModalTitle" contenteditable="true" style="outline:none;border-bottom:2px solid transparent;cursor:text;" onfocus="this.style.borderBottomColor='var(--accent)'" onblur="this.style.borderBottomColor='transparent';saveInitTitle()"></h2>
      <span class="save-indicator" id="initSaveIndicator">guardado</span>
      <button class="modal-close" onclick="closeInitModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="modal-meta" id="initModalMeta"></div>

      <div class="section">
        <div class="section-label"><span class="icon">&#127919;</span> Descripcion</div>
        <div class="section-content" contenteditable="true" id="initDescription" data-field="description" data-placeholder="Describir la iniciativa..."></div>
      </div>
      <div class="section">
        <div class="section-label"><span class="icon">&#127919;</span> Objetivos</div>
        <div class="section-content" contenteditable="true" id="initObjectives" data-field="objectives" data-placeholder="Definir los objetivos de esta iniciativa..."></div>
      </div>
      <div class="section">
        <div class="section-label"><span class="icon">&#127942;</span> Logros</div>
        <div class="section-content" contenteditable="true" id="initAchievements" data-field="achievements" data-placeholder="Registrar logros y avances..."></div>
      </div>
      <div class="section">
        <div class="section-label"><span class="icon">&#9888;&#65039;</span> Obstaculos</div>
        <div class="section-content" contenteditable="true" id="initObstacles" data-field="obstacles" data-placeholder="Identificar bloqueos y desafios..."></div>
      </div>
      <div class="section">
        <div class="section-label"><span class="icon">&#128161;</span> Aprendizajes</div>
        <div class="section-content" contenteditable="true" id="initLearnings" data-field="learnings" data-placeholder="Documentar lecciones aprendidas..."></div>
      </div>
      <div class="section">
        <div class="section-label"><span class="icon">&#128640;</span> Proximos pasos</div>
        <div class="section-content" contenteditable="true" id="initNextSteps" data-field="next_steps" data-placeholder="Definir las acciones siguientes..."></div>
      </div>

      <div class="section">
        <div class="section-label"><span class="icon">&#9745;</span> Tareas de esta iniciativa</div>
        <div class="init-tasks-list" id="initTasksList"></div>
      </div>
    </div>
  </div>
</div>

<!-- Task Modal -->
<div class="modal-overlay" id="taskModal">
  <div class="modal" style="width:560px">
    <div class="modal-header">
      <h2 id="taskModalTitle"></h2>
      <button class="modal-close" onclick="closeTaskModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="modal-meta" id="taskModalMeta"></div>

      <div class="task-modal-state" id="taskStateButtons"></div>

      <div class="section">
        <div class="section-label">Descripcion</div>
        <div class="section-content" contenteditable="true" id="taskDescription" data-placeholder="Agregar descripcion de la tarea..."></div>
      </div>

      <div class="task-field-row">
        <div class="task-field">
          <label>Persona asignada</label>
          <input type="text" id="taskPerson" placeholder="Nombre...">
        </div>
        <div class="task-field">
          <label>Fecha de vencimiento</label>
          <input type="date" id="taskDue">
        </div>
      </div>

      <div class="task-field-row">
        <div class="task-field">
          <label>Prioridad</label>
          <select id="taskPriority">
            <option value="0">Normal</option>
            <option value="1">Alta</option>
            <option value="2">Urgente</option>
          </select>
        </div>
        <div class="task-field">
          <label>Sub-estado</label>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="state-btn" id="btnBlock" onclick="toggleBlock()">Bloqueado</button>
            <button class="state-btn" id="btnWait" onclick="toggleWait()">Esperando</button>
          </div>
        </div>
      </div>

      <div class="task-field" id="blockReasonField" style="display:none">
        <label>Razon del bloqueo / a quien espera</label>
        <input type="text" id="taskBlockReason" placeholder="Razon...">
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="state-btn" onclick="saveTask()" style="background:var(--accent);border-color:var(--accent);color:white;padding:8px 24px">Guardar</button>
      </div>
    </div>
  </div>
</div>

<script>
let currentProject = '';
let currentInitId = null;
let currentTaskId = null;
let initSaveTimer = null;

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

// --- Projects ---
async function loadProjects() {
  const projects = await api('/api/projects');
  const sel = document.getElementById('projectFilter');
  projects.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name; sel.appendChild(o);
  });
  sel.onchange = (e) => { currentProject = e.target.value; refresh(); };
}

// --- Alerts ---
async function loadAlerts() {
  const { alerts, traps } = await api('/api/alerts');
  const c = document.getElementById('alertsContainer');
  c.innerHTML = '';
  const all = [...alerts, ...traps.map(t => ({ severity: 'warning', message: t.initiative.title + ' — posible trampa ' + t.suggested_trap.toUpperCase() }))];
  all.forEach(a => { c.innerHTML += '<div class="alert ' + a.severity + '">' + a.message + '</div>'; });
}

// --- Stats ---
async function loadStats() {
  const s = await api('/api/stats');
  const wb = document.getElementById('wipBadge');
  wb.textContent = 'WIP: ' + s.wip + '/' + s.wipLimit;
  wb.className = 'wip-badge' + (s.wip > s.wipLimit ? ' over' : '');
  const c = document.getElementById('statsContainer');
  c.innerHTML = '';
  const labels = { menu:'Menu', por_hacer:'Por Hacer', haciendo:'Haciendo', hecho:'Hecho' };
  s.byState.filter(x => x.state !== 'archivo').forEach(x => {
    c.innerHTML += '<div class="stat-card"><div class="label">' + (labels[x.state]||x.state) + '</div><div class="value">' + x.c + '</div></div>';
  });
}

// --- Initiatives (with drag & drop) ---
async function loadInitiatives() {
  const qs = currentProject ? '?project=' + currentProject : '';
  const inits = await api('/api/initiatives' + qs);
  const phases = { semilla:[], brote:[], crecimiento:[], compost:[] };
  inits.forEach(i => { if (phases[i.phase]) phases[i.phase].push(i); });

  Object.entries(phases).forEach(([phase, items]) => {
    const box = document.getElementById('phase-' + phase);
    const h = box.querySelector('h3');
    box.innerHTML = ''; box.appendChild(h);

    if (!items.length) {
      box.innerHTML += '<div class="empty-phase">(ninguna)</div>';
    } else {
      items.forEach(i => {
        const card = document.createElement('div');
        card.className = 'init-card';
        card.draggable = true;
        card.dataset.initId = i.id;

        let html = '<div class="init-info" onclick="openInitModal(' + i.id + ')"><div>' + i.title + '</div><div class="meta">' + i.project_id + '</div></div>';
        if (i.trap) html += '<span class="trap-badge">' + i.trap.toUpperCase() + '</span>';
        card.innerHTML = html;

        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/init-id', String(i.id));
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));

        box.appendChild(card);
      });
    }
  });
}

// Phase drop zones
document.querySelectorAll('.phase-box').forEach(box => {
  box.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/init-id')) {
      e.preventDefault(); box.classList.add('drop-over');
    }
  });
  box.addEventListener('dragleave', () => box.classList.remove('drop-over'));
  box.addEventListener('drop', async (e) => {
    e.preventDefault(); box.classList.remove('drop-over');
    const initId = e.dataTransfer.getData('application/init-id');
    if (!initId) return;
    const newPhase = box.dataset.phase;
    await api('/api/initiatives/' + initId + '/phase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: newPhase })
    });
    refresh();
  });
});

// --- Tasks (with drag & drop + click to open) ---
async function loadTasks() {
  const qs = currentProject ? '?project=' + currentProject : '';
  const tasks = await api('/api/tasks' + qs);
  const states = ['menu','por_hacer','haciendo','hecho'];
  const counts = {};

  states.forEach(s => {
    const col = document.querySelector('.kanban-col[data-state="' + s + '"]');
    col.querySelectorAll('.task-card').forEach(c => c.remove());
    counts[s] = 0;
  });

  tasks.filter(t => t.state !== 'archivo').forEach(t => {
    counts[t.state] = (counts[t.state] || 0) + 1;
    const col = document.querySelector('.kanban-col[data-state="' + t.state + '"]');
    if (!col) return;

    const card = document.createElement('div');
    card.className = 'task-card' + (t.priority > 0 ? ' priority-' + t.priority : '');
    card.draggable = true;
    card.dataset.taskId = t.id;

    let html = '<div class="task-title" onclick="openTaskModal(' + t.id + ')">' + t.title + '</div>';
    html += '<div class="task-meta">';
    if (t.sub_state) html += '<span class="sub-badge ' + t.sub_state + '">' + t.sub_state + (t.blocked_reason ? ': ' + t.blocked_reason : '') + '</span>';
    if (t.due_date) html += '<span>&#128197; ' + t.due_date + '</span>';
    if (t.person_ref) html += '<span>&#128100; ' + t.person_ref + '</span>';
    html += '</div>';
    card.innerHTML = html;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(t.id));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    col.appendChild(card);
  });

  states.forEach(s => {
    const el = document.getElementById('count-' + s);
    if (el) el.textContent = counts[s] || 0;
  });
}

// Kanban drop zones
document.querySelectorAll('.kanban-col').forEach(col => {
  col.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault(); col.classList.add('drop-over');
    }
  });
  col.addEventListener('dragleave', () => col.classList.remove('drop-over'));
  col.addEventListener('drop', async (e) => {
    e.preventDefault(); col.classList.remove('drop-over');
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const result = await api('/api/tasks/' + taskId + '/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: col.dataset.state })
    });
    if (!result.success) alert(result.error);
    refresh();
  });
});

// --- Initiative Modal ---
async function openInitModal(id) {
  currentInitId = id;
  const data = await api('/api/initiatives/' + id);

  document.getElementById('initModalTitle').textContent = data.title;

  const phaseLabels = { semilla:'Semilla', brote:'Brote', crecimiento:'Crecimiento', compost:'Compost' };
  let meta = '<span class="tag phase-tag ' + data.phase + '">' + phaseLabels[data.phase] + '</span>';
  meta += '<span class="tag">' + data.project_id + '</span>';
  if (data.trap) meta += '<span class="trap-badge">' + data.trap.toUpperCase() + '</span>';
  meta += '<span class="tag">Creada: ' + (data.created_at || '').slice(0,10) + '</span>';
  document.getElementById('initModalMeta').innerHTML = meta;

  document.getElementById('initDescription').textContent = data.description || '';
  document.getElementById('initObjectives').textContent = data.objectives || '';
  document.getElementById('initAchievements').textContent = data.achievements || '';
  document.getElementById('initObstacles').textContent = data.obstacles || '';
  document.getElementById('initLearnings').textContent = data.learnings || '';
  document.getElementById('initNextSteps').textContent = data.next_steps || '';

  // Tasks list
  const tl = document.getElementById('initTasksList');
  tl.innerHTML = '';
  if (data.tasks && data.tasks.length) {
    data.tasks.filter(t => t.state !== 'archivo').forEach(t => {
      const stateLabels = { menu:'Menu', por_hacer:'Por Hacer', haciendo:'Haciendo', hecho:'Hecho' };
      tl.innerHTML += '<div class="init-task-item" onclick="closeInitModal();openTaskModal(' + t.id + ')"><span class="state-dot ' + t.state + '"></span><span style="flex:1">' + t.title + '</span><span style="font-size:11px;color:var(--text-dim)">' + (stateLabels[t.state]||t.state) + '</span></div>';
    });
  } else {
    tl.innerHTML = '<div class="empty-phase">Sin tareas</div>';
  }

  document.getElementById('initModal').classList.add('open');
}

function closeInitModal() {
  document.getElementById('initModal').classList.remove('open');
  currentInitId = null;
}

// Save initiative title on blur
async function saveInitTitle() {
  if (!currentInitId) return;
  const title = document.getElementById('initModalTitle').textContent.trim();
  if (!title) return;
  await api('/api/initiatives/' + currentInitId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  const ind = document.getElementById('initSaveIndicator');
  ind.classList.add('show');
  clearTimeout(initSaveTimer);
  initSaveTimer = setTimeout(() => ind.classList.remove('show'), 2000);
  refresh();
}

// Auto-save initiative fields on blur
document.querySelectorAll('#initModal .section-content[contenteditable]').forEach(el => {
  el.addEventListener('blur', async () => {
    if (!currentInitId) return;
    const field = el.dataset.field;
    const value = el.textContent.trim();
    const body = {}; body[field] = value || null;
    await api('/api/initiatives/' + currentInitId, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const ind = document.getElementById('initSaveIndicator');
    ind.classList.add('show');
    clearTimeout(initSaveTimer);
    initSaveTimer = setTimeout(() => ind.classList.remove('show'), 2000);
  });
});

// --- Task Modal ---
async function openTaskModal(id) {
  currentTaskId = id;
  const t = await api('/api/tasks/' + id);

  document.getElementById('taskModalTitle').textContent = t.title;

  const stateLabels = { menu:'Menu', por_hacer:'Por Hacer', haciendo:'Haciendo', hecho:'Hecho', archivo:'Archivo' };
  let meta = '<span class="tag">' + (stateLabels[t.state]||t.state) + '</span>';
  if (t.source !== 'manual') meta += '<span class="tag">Fuente: ' + t.source + '</span>';
  meta += '<span class="tag">Creada: ' + (t.created_at||'').slice(0,10) + '</span>';
  if (t.started_at) meta += '<span class="tag">Iniciada: ' + t.started_at.slice(0,10) + '</span>';
  if (t.completed_at) meta += '<span class="tag" style="color:var(--green)">Completada: ' + t.completed_at.slice(0,10) + '</span>';
  document.getElementById('taskModalMeta').innerHTML = meta;

  // State buttons
  const validMoves = {
    menu: ['por_hacer'],
    por_hacer: ['haciendo', 'menu'],
    haciendo: ['hecho', 'por_hacer'],
    hecho: ['archivo'],
    archivo: []
  };
  const btns = document.getElementById('taskStateButtons');
  btns.innerHTML = '';
  (validMoves[t.state] || []).forEach(s => {
    btns.innerHTML += '<button class="state-btn" onclick="moveTaskTo(' + t.id + ',\\'' + s + '\\')">' + (stateLabels[s]||s) + '</button>';
  });

  document.getElementById('taskDescription').textContent = t.description || '';
  document.getElementById('taskPerson').value = t.person_ref || '';
  document.getElementById('taskDue').value = t.due_date || '';
  document.getElementById('taskPriority').value = t.priority || 0;

  document.getElementById('btnBlock').className = 'state-btn' + (t.sub_state === 'bloqueado' ? ' active' : '');
  document.getElementById('btnWait').className = 'state-btn' + (t.sub_state === 'esperando' ? ' active' : '');
  document.getElementById('blockReasonField').style.display = t.sub_state ? 'block' : 'none';
  document.getElementById('taskBlockReason').value = t.blocked_reason || '';

  document.getElementById('taskModal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
  currentTaskId = null;
}

async function moveTaskTo(id, state) {
  const result = await api('/api/tasks/' + id + '/move', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  });
  if (!result.success) { alert(result.error); return; }
  closeTaskModal();
  refresh();
}

async function toggleBlock() {
  if (!currentTaskId) return;
  const t = await api('/api/tasks/' + currentTaskId);
  if (t.sub_state === 'bloqueado') {
    await api('/api/tasks/' + currentTaskId + '/unblock', { method: 'POST' });
  } else {
    const reason = prompt('Razon del bloqueo:');
    if (reason === null) return;
    await api('/api/tasks/' + currentTaskId + '/block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
  }
  openTaskModal(currentTaskId);
}

async function toggleWait() {
  if (!currentTaskId) return;
  const t = await api('/api/tasks/' + currentTaskId);
  if (t.sub_state === 'esperando') {
    await api('/api/tasks/' + currentTaskId + '/unblock', { method: 'POST' });
  } else {
    const person = prompt('Esperando a:');
    if (person === null) return;
    await api('/api/tasks/' + currentTaskId + '/wait', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person })
    });
  }
  openTaskModal(currentTaskId);
}

async function saveTask() {
  if (!currentTaskId) return;
  const body = {
    description: document.getElementById('taskDescription').textContent.trim() || undefined,
    person_ref: document.getElementById('taskPerson').value || undefined,
    due_date: document.getElementById('taskDue').value || undefined,
    priority: parseInt(document.getElementById('taskPriority').value)
  };
  await api('/api/tasks/' + currentTaskId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  closeTaskModal();
  refresh();
}

// Close modals on overlay click
document.getElementById('initModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeInitModal(); });
document.getElementById('taskModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTaskModal(); });

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeInitModal(); closeTaskModal(); }
});

// --- Refresh ---
async function refresh() {
  await Promise.all([loadAlerts(), loadStats(), loadInitiatives(), loadTasks()]);
}

loadProjects().then(refresh);
setInterval(refresh, 30000);
</script>
</body>
</html>`
