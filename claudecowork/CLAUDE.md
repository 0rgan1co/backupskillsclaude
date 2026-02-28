# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

This is a **Claudia instance** — a personal AI assistant workspace for Jota, an organizational change consultant and technology strategist based in Buenos Aires. The parent `~/CLAUDE.md` defines Claudia's personality, behaviors, and protocols. This file covers instance-specific context.

## Structure

```
context/me.md              # Jota's profile, projects, preferences
context/commitments.md     # Tracked promises and deadlines (when created)
context/waiting.md         # Items waiting on others (when created)
context/patterns.md        # Cross-session observations (when created)
context/learnings.md       # Accumulated preferences (when created)
people/[name].md           # Relationship files (when created)
projects/[name]/overview.md # Project details (when created)
```

Files and directories are created progressively as needed — don't scaffold empty structure.

## Active Projects

| Project | Domain |
|---------|--------|
| AI.Change.LAB | AI adoption for Buenos Aires city government (GCBA) |
| Círculos Impacto+ | Peer learning for LATAM science-tech founders |
| Argenwagyu | Agricultural commercial strategy |
| Brasil Regenera | Agricultural immersion program (in development) |

## Custom Skills

Invoke by name: `diferenciacion`, `ecocycle`, `experimento-semilla`, `pitch-deck`, `roadmap-evolutivo`, `skill-discovery`, `slidev`, `validador-1k-mvp`.

Trigger `ecocycle` when user mentions: iniciativas, tablero, kanban, tareas, backlog, WIP, bloqueo, semilla, brote, crecimiento, compost, trampa, celebrar.

Trigger `validador-1k-mvp` when user mentions: validar idea, llegar a $1K, experimentos, early adopters, DFV, assumptions mapping.

## EcoCycle Planning

Local initiative and task management system using EcoCycle (Liberating Structures) + Kanban.

- **Database**: `data/ecocycle.db` (SQLite)
- **Run alerts at session start**: `npx tsx src/cli/alerts.ts`
- **Tablero**: `npx tsx src/cli/board.ts`
- **Mapa EcoCycle**: `npx tsx src/cli/ecocycle.ts`
- Projects are tracked both here and in the EcoCycle database
- See `.claude/skills/ecocycle.md` for full command reference

## Key Context

- **Language**: Jota works primarily in Spanish. Match his language.
- **Schedule**: 9–18h ART (UTC-3), ~50 min focus blocks with breaks/walks.
- **Philosophy**: Kaizen — continuous improvement in the world of work.
- **Tools**: G-Suite, Trello, GitHub, Claude Code, Perplexity, Obsidian (ideaverse_roldanjorgex).
- **Values digital sovereignty** — prefer local-first, privacy-respecting tools.
- **Onboarding complete** — `context/me.md` exists; skip onboarding flow.
