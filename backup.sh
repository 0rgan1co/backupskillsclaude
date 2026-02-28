#!/bin/bash
# Backup semanal de Claudia a GitHub
# Se ejecuta automáticamente los sábados a mediodía via LaunchAgent

set -e

BACKUP_DIR="/Users/roldanjorgex/claudecowork/backupskillsclaude"
SOURCE_DIR="/Users/roldanjorgex/claudecowork"
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

log "Inicio de backup"

# Sincronizar CLAUDE.md global
cp /Users/roldanjorgex/CLAUDE.md "$BACKUP_DIR/claudia-global/CLAUDE.md"

# Sincronizar proyecto claudecowork
cp "$SOURCE_DIR/CLAUDE.md" "$BACKUP_DIR/claudecowork/CLAUDE.md"
cp "$SOURCE_DIR/context/me.md" "$BACKUP_DIR/claudecowork/context/me.md" 2>/dev/null || true

# Sincronizar skills
mkdir -p "$BACKUP_DIR/claudecowork/.claude/skills"
rsync -a --delete "$SOURCE_DIR/.claude/skills/" "$BACKUP_DIR/claudecowork/.claude/skills/"

# Sincronizar código fuente
rsync -a --delete "$SOURCE_DIR/src/" "$BACKUP_DIR/claudecowork/src/"

# Sincronizar scripts
mkdir -p "$BACKUP_DIR/claudecowork/scripts"
rsync -a --delete "$SOURCE_DIR/scripts/" "$BACKUP_DIR/claudecowork/scripts/"

# Sincronizar config files
cp "$SOURCE_DIR/package.json" "$BACKUP_DIR/claudecowork/package.json" 2>/dev/null || true
cp "$SOURCE_DIR/tsconfig.json" "$BACKUP_DIR/claudecowork/tsconfig.json" 2>/dev/null || true

# Sincronizar context adicional (commitments, patterns, learnings, etc.)
for f in commitments.md waiting.md patterns.md learnings.md; do
  if [ -f "$SOURCE_DIR/context/$f" ]; then
    cp "$SOURCE_DIR/context/$f" "$BACKUP_DIR/claudecowork/context/$f"
  fi
done

# Sincronizar people/ si existe
if [ -d "$SOURCE_DIR/people" ]; then
  mkdir -p "$BACKUP_DIR/claudecowork/people"
  rsync -a --delete "$SOURCE_DIR/people/" "$BACKUP_DIR/claudecowork/people/"
fi

# Sincronizar DB EcoCycle
cp "$SOURCE_DIR/data/ecocycle.db" "$BACKUP_DIR/claudecowork/data/ecocycle.db" 2>/dev/null || true

# Commit y push si hay cambios
cd "$BACKUP_DIR"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Backup automático $(date '+%Y-%m-%d %H:%M')"
  git push origin main
  log "Backup pusheado con cambios"
else
  log "Sin cambios, nada que pushear"
fi

log "Backup completado"
