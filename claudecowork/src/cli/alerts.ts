import { detectAlerts, formatAlerts } from '../alerts/detector.js'
import { detectPotentialTraps } from '../models/initiative.js'
import { closeDb } from '../db.js'

try {
  const alerts = detectAlerts()
  const traps = detectPotentialTraps()

  console.log('\n  EcoCycle Alertas')
  console.log('  ' + '─'.repeat(50))

  if (alerts.length === 0 && traps.length === 0) {
    console.log('  Sin alertas. Todo en orden.')
  } else {
    console.log(formatAlerts(alerts))

    if (traps.length > 0) {
      console.log('\n  Posibles trampas detectadas:')
      for (const t of traps) {
        console.log(`  [?] "${t.initiative.title}" — posible trampa de ${t.suggested_trap.toUpperCase()}`)
        console.log(`      ${t.reason}`)
      }
    }
  }

  console.log()
} finally {
  closeDb()
}
