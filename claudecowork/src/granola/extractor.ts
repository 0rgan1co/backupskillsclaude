export interface ExtractedTask {
  title: string
  description?: string
  person?: string
  initiative_hint?: string
  due_date?: string
  source_ref: string
}

export interface GranolaMeeting {
  id: string
  title: string
  content: string
}

/**
 * Parse meeting notes and extract potential tasks/action items.
 * This provides structured extraction that Claudia can use as a starting point.
 * Claudia's judgment refines the results before presenting to the user.
 */
export function parseTasksFromNotes(
  meetingTitle: string,
  noteContent: string,
  documentId: string
): ExtractedTask[] {
  const tasks: ExtractedTask[] = []
  const lines = noteContent.split('\n')

  // Patterns that indicate action items
  const actionPatterns = [
    /^[\s]*[-*]\s*\[[ ]\]\s*(.+)/,           // - [ ] task
    /^[\s]*[-*]\s*(?:TODO|HACER|PENDIENTE):\s*(.+)/i,
    /^[\s]*[-*]\s*(?:Action|Acción):\s*(.+)/i,
    /(?:(?:hay que|necesitamos|debemos|vamos a|se debe)\s+)(.+)/i,
    /(?:(?:enviar|preparar|revisar|contactar|agendar|definir|crear|armar)\s+)(.+)/i,
  ]

  // Patterns for person assignment
  const personPattern = /(?:@(\w+)|→\s*(\w+)|para\s+(\w+)|asignar(?:le)?\s+a\s+(\w+))/i

  // Patterns for dates
  const datePatterns = [
    /(?:para el|antes del?|deadline|fecha[:\s]+)\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:para el|antes del?)\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i,
    /(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i,
  ]

  for (const line of lines) {
    for (const pattern of actionPatterns) {
      const match = line.match(pattern)
      if (match) {
        const taskText = match[1].trim()
        if (taskText.length < 5) continue // skip tiny matches

        const task: ExtractedTask = {
          title: taskText.slice(0, 100), // cap at 100 chars
          source_ref: documentId,
        }

        // Try to extract person
        const personMatch = line.match(personPattern)
        if (personMatch) {
          task.person = (personMatch[1] || personMatch[2] || personMatch[3] || personMatch[4]).trim()
        }

        // Try to extract date
        for (const dp of datePatterns) {
          const dateMatch = line.match(dp)
          if (dateMatch?.[1]) {
            task.due_date = normalizeDate(dateMatch[1])
            break
          }
        }

        // Use meeting title as initiative hint
        task.initiative_hint = meetingTitle

        tasks.push(task)
        break // one match per line is enough
      }
    }
  }

  return tasks
}

function normalizeDate(dateStr: string): string | undefined {
  // If already YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = dateStr.split(/[/-]/)
  if (parts.length >= 2) {
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    const year = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : new Date().getFullYear().toString()
    return `${year}-${month}-${day}`
  }

  return undefined
}
