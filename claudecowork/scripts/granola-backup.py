#!/usr/bin/env python3
"""
Backup semanal de transcripciones y notas de Granola.
Lee directamente del cache local — sin API, sin tokens.

Uso:
  python3 granola-backup.py                    # backup completo
  python3 granola-backup.py --since 7          # solo últimos 7 días
  python3 granola-backup.py --output ~/backups # directorio custom

Salida:
  <output_dir>/
    YYYY-MM-DD/
      raw/granola-cache-YYYY-MM-DD.json        # copia cruda (red de seguridad)
      meetings/
        YYYY-MM-DD_titulo-de-la-reunion.md     # notas + transcripción por reunión
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

CACHE_PATH = Path.home() / "Library/Application Support/Granola/cache-v4.json"
DEFAULT_OUTPUT = Path.home() / "Documents/granola-backups"


def slugify(text: str, max_len: int = 60) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:max_len]


def prosemirror_to_text(node: dict, depth: int = 0) -> str:
    """Convierte ProseMirror JSON a texto plano legible."""
    if not isinstance(node, dict):
        return ""

    lines = []
    node_type = node.get("type", "")

    if node_type == "text":
        return node.get("text", "")

    if node_type == "heading":
        level = node.get("attrs", {}).get("level", 1)
        prefix = "#" * level + " "
        content = "".join(prosemirror_to_text(c) for c in node.get("content", []))
        lines.append(prefix + content)

    elif node_type == "bulletList":
        for item in node.get("content", []):
            lines.append(prosemirror_to_text(item, depth))

    elif node_type == "orderedList":
        for i, item in enumerate(node.get("content", []), 1):
            text = prosemirror_to_text(item, depth)
            lines.append(text.replace("- ", f"{i}. ", 1) if text.startswith("- ") else text)

    elif node_type == "listItem":
        indent = "  " * depth
        content = "".join(prosemirror_to_text(c, depth + 1) for c in node.get("content", []))
        lines.append(f"{indent}- {content.strip()}")

    elif node_type == "paragraph":
        content = "".join(prosemirror_to_text(c) for c in node.get("content", []))
        lines.append(content)

    elif node_type == "blockquote":
        content = "\n".join(prosemirror_to_text(c) for c in node.get("content", []))
        lines.append("\n".join(f"> {line}" for line in content.split("\n")))

    elif node_type == "horizontalRule":
        lines.append("---")

    elif node_type in ("doc",):
        for child in node.get("content", []):
            lines.append(prosemirror_to_text(child, depth))

    else:
        for child in node.get("content", []):
            lines.append(prosemirror_to_text(child, depth))

    return "\n".join(lines)


def parse_iso(iso_str: str):
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        return None


def format_timestamp(iso_str: str) -> str:
    dt = parse_iso(iso_str)
    return dt.strftime("%H:%M:%S") if dt else (iso_str or "")


def format_date(iso_str: str) -> str:
    dt = parse_iso(iso_str)
    return dt.strftime("%Y-%m-%d") if dt else "unknown"


def format_date_long(iso_str: str) -> str:
    """Fecha legible: 'Miércoles 29 de enero, 2026'."""
    dt = parse_iso(iso_str)
    if not dt:
        return "Fecha desconocida"
    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
             "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return f"{dias[dt.weekday()]} {dt.day} de {meses[dt.month - 1]}, {dt.year}"


def calc_duration(transcript_lines: list) -> str:
    """Calcula duración aproximada del transcript."""
    if not transcript_lines:
        return ""
    sorted_lines = sorted(transcript_lines, key=lambda x: x.get("start_timestamp", ""))
    start = parse_iso(sorted_lines[0].get("start_timestamp", ""))
    end = parse_iso(sorted_lines[-1].get("end_timestamp", ""))
    if not start or not end:
        return ""
    delta = end - start
    mins = int(delta.total_seconds() / 60)
    if mins < 1:
        return "< 1 min"
    if mins < 60:
        return f"{mins} min"
    hours = mins // 60
    remaining = mins % 60
    return f"{hours}h {remaining:02d}min" if remaining else f"{hours}h"


def extract_participants(doc: dict) -> list:
    """Extrae nombres de participantes de la estructura people."""
    people = doc.get("people") or {}
    names = []
    if isinstance(people, dict):
        creator = people.get("creator", {})
        if creator.get("name"):
            names.append(creator["name"])
        for att in people.get("attendees", []):
            if isinstance(att, dict):
                name = att.get("name") or att.get("email", "")
                if name and name not in names:
                    names.append(name)
    elif isinstance(people, list):
        for p in people:
            if isinstance(p, dict):
                name = p.get("name") or p.get("email", "")
                if name:
                    names.append(name)
            elif isinstance(p, str):
                names.append(p)
    return names


def generate_executive_summary(doc: dict, transcript_lines: list) -> str:
    """Genera un resumen ejecutivo a partir de las notas y/o el transcript."""
    # Si Granola ya generó un summary, usarlo
    summary = doc.get("summary", "")
    if summary and summary.strip():
        return summary.strip()

    # Extraer notas como resumen si existen
    notes_md = doc.get("notes_markdown", "")
    if not notes_md and doc.get("notes"):
        notes_md = prosemirror_to_text(doc["notes"])

    if notes_md and notes_md.strip():
        return notes_md.strip()

    # Sin notas ni summary: generar resumen básico del transcript
    if not transcript_lines:
        return "*Sin contenido disponible para esta reunión.*"

    sorted_lines = sorted(transcript_lines, key=lambda x: x.get("start_timestamp", ""))

    # Extraer fragmentos representativos (inicio, medio, final)
    texts = [l.get("text", "").strip() for l in sorted_lines if l.get("text", "").strip()]
    if not texts:
        return "*Transcripción sin texto legible.*"

    # Tomar las primeras oraciones sustanciales como preview
    preview_lines = []
    for t in texts:
        if len(t) > 20:  # ignorar fragmentos muy cortos
            preview_lines.append(t)
        if len(preview_lines) >= 5:
            break

    if preview_lines:
        return "> " + "\n> ".join(f"*\"{line}\"*" for line in preview_lines) + "\n\n*Resumen generado automáticamente a partir de las primeras intervenciones.*"

    return "*Reunión registrada sin notas editadas.*"


def build_meeting_md(doc: dict, transcript_lines: list) -> str:
    """Genera el markdown completo de una reunión con formato atractivo."""
    title = doc.get("title", "Sin título")
    created = doc.get("created_at", "")
    cal_event = doc.get("google_calendar_event") or {}

    sections = []

    # ── Header ──
    sections.append(f"# {title}")
    sections.append("")

    # Metadata como tabla compacta
    meta_rows = []
    meta_rows.append(f"| **Fecha** | {format_date_long(created)} |")

    # Horario desde calendar event o desde transcript
    start_time = ""
    end_time = ""
    if cal_event.get("start", {}).get("dateTime"):
        start_time = format_timestamp(cal_event["start"]["dateTime"])
        end_time = format_timestamp(cal_event.get("end", {}).get("dateTime", ""))
    elif transcript_lines:
        sorted_t = sorted(transcript_lines, key=lambda x: x.get("start_timestamp", ""))
        start_time = format_timestamp(sorted_t[0].get("start_timestamp", ""))
        end_time = format_timestamp(sorted_t[-1].get("end_timestamp", ""))

    if start_time:
        meta_rows.append(f"| **Horario** | {start_time} — {end_time} |")

    duration = calc_duration(transcript_lines)
    if duration:
        meta_rows.append(f"| **Duración** | {duration} |")

    participants = extract_participants(doc)
    if participants:
        meta_rows.append(f"| **Participantes** | {', '.join(participants)} |")

    transcript_count = len(transcript_lines)
    if transcript_count:
        meta_rows.append(f"| **Intervenciones** | {transcript_count} |")

    if meta_rows:
        sections.append("| | |")
        sections.append("|:--|:--|")
        sections.extend(meta_rows)
        sections.append("")

    # ── Separador visual ──
    sections.append("---")
    sections.append("")

    # ── Resumen Ejecutivo ──
    sections.append("## Resumen Ejecutivo")
    sections.append("")
    sections.append(generate_executive_summary(doc, transcript_lines))
    sections.append("")

    # ── Separador ──
    sections.append("---")
    sections.append("")

    # ── Transcripción ──
    if transcript_lines:
        sections.append("<details>")
        sections.append("<summary><strong>Transcripción completa</strong> "
                        f"({transcript_count} intervenciones)</summary>")
        sections.append("")

        sorted_lines = sorted(transcript_lines, key=lambda x: x.get("start_timestamp", ""))

        # Agrupar por bloques de ~5 minutos para mejor legibilidad
        current_block_start = None
        for line in sorted_lines:
            ts_str = line.get("start_timestamp", "")
            ts = parse_iso(ts_str)
            text = line.get("text", "").strip()
            source = line.get("source", "")

            if not text:
                continue

            # Insertar separador cada 5 minutos
            if ts and current_block_start:
                delta = (ts - current_block_start).total_seconds()
                if delta >= 300:  # 5 minutos
                    sections.append("")
                    sections.append(f"#### — {format_timestamp(ts_str)} —")
                    sections.append("")
                    current_block_start = ts
            elif ts and not current_block_start:
                current_block_start = ts
                sections.append(f"#### — {format_timestamp(ts_str)} —")
                sections.append("")

            time_label = format_timestamp(ts_str)
            icon = " `pantalla`" if source == "screen" else ""
            sections.append(f"> `{time_label}`{icon} {text}  ")

        sections.append("")
        sections.append("</details>")
        sections.append("")

    # ── Footer ──
    sections.append("---")
    sections.append(f"*Backup generado el {datetime.now().strftime('%Y-%m-%d %H:%M')} "
                    f"desde Granola cache local.*")
    sections.append("")

    return "\n".join(sections)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Backup de Granola")
    parser.add_argument("--since", type=int, default=0,
                        help="Solo reuniones de los últimos N días (0 = todas)")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT),
                        help="Directorio de salida")
    args = parser.parse_args()

    if not CACHE_PATH.exists():
        print(f"Error: No se encontró el cache en {CACHE_PATH}")
        print("¿Está instalado Granola?")
        sys.exit(1)

    output_dir = Path(args.output)
    today = datetime.now().strftime("%Y-%m-%d")
    backup_dir = output_dir / today
    raw_dir = backup_dir / "raw"
    meetings_dir = backup_dir / "meetings"

    raw_dir.mkdir(parents=True, exist_ok=True)
    meetings_dir.mkdir(parents=True, exist_ok=True)

    # Opción A: copia cruda
    raw_dest = raw_dir / f"granola-cache-{today}.json"
    shutil.copy2(CACHE_PATH, raw_dest)
    print(f"✓ Cache crudo copiado → {raw_dest}")

    # Opción B: export a markdown
    data = json.loads(CACHE_PATH.read_text())
    state = data.get("cache", {}).get("state", {})
    documents = state.get("documents", {})
    transcripts = state.get("transcripts", {})

    cutoff = None
    if args.since > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=args.since)

    exported = 0
    skipped = 0

    for doc_id, doc in documents.items():
        if doc.get("deleted_at"):
            continue

        created = doc.get("created_at", "")
        if cutoff and created:
            try:
                doc_date = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if doc_date < cutoff:
                    skipped += 1
                    continue
            except ValueError:
                pass

        title = doc.get("title", "sin-titulo")
        date_prefix = format_date(created)
        filename = f"{date_prefix}_{slugify(title)}.md"

        transcript_lines = transcripts.get(doc_id, [])
        md_content = build_meeting_md(doc, transcript_lines)

        (meetings_dir / filename).write_text(md_content, encoding="utf-8")
        exported += 1

    print(f"✓ {exported} reuniones exportadas → {meetings_dir}")
    if skipped:
        print(f"  ({skipped} reuniones anteriores omitidas por filtro --since {args.since})")

    # Limpieza: mantener solo los últimos 12 backups
    all_backups = sorted([d for d in output_dir.iterdir()
                          if d.is_dir() and d.name != ".git"], reverse=True)
    for old in all_backups[12:]:
        shutil.rmtree(old)
        print(f"  🗑️ Backup antiguo eliminado: {old.name}")

    # Git: commit y push al repo remoto
    git_dir = output_dir / ".git"
    if git_dir.exists():
        print("\n📤 Subiendo a GitHub...")
        env = {**os.environ, "GIT_SSH_COMMAND": "ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes"}
        try:
            subprocess.run(["git", "add", "-A"], cwd=output_dir, env=env, check=True)
            result = subprocess.run(
                ["git", "status", "--porcelain"], cwd=output_dir,
                env=env, capture_output=True, text=True
            )
            if result.stdout.strip():
                subprocess.run(
                    ["git", "commit", "-m", f"backup: {exported} reuniones ({today})"],
                    cwd=output_dir, env=env, check=True
                )
                subprocess.run(
                    ["git", "push"], cwd=output_dir, env=env, check=True
                )
                print("✓ Push a GitHub exitoso")
            else:
                print("  Sin cambios nuevos para commitear")
        except subprocess.CalledProcessError as e:
            print(f"⚠️ Error en git: {e}", file=sys.stderr)

    print(f"\n✅ Backup completo: {backup_dir}")


if __name__ == "__main__":
    main()
