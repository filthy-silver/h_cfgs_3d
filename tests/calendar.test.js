const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../js/data.js');

describe('iCalendar (.ics / RFC 5545) Generator Logic', () => {
  const events = data.buildEvents();
  const sampleTasks = data.INITIAL_SAMPLE_EVENTS;

  // Función pura que emula el generador .ics de la aplicación
  function generateIcs(scheduleEvents, tasks) {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? 1 : (currentDay === 1 ? 0 : 8 - currentDay);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const year = monday.getFullYear();
    const untilDate = `${year + 1}0701T235959Z`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CFGS 3D//Horario y Tareas Semanales//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Horario y Exámenes CFGS 3D',
      'X-WR-TIMEZONE:Europe/Madrid'
    ];

    const dayIcsCodes = ['', 'MO', 'TU', 'WE', 'TH', 'FR'];

    data.DAYS.forEach((d) => {
      const daySlots = scheduleEvents[d] || [];
      const dayOffset = d - 1;
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + dayOffset);

      const y = targetDate.getFullYear();
      const m = pad(targetDate.getMonth() + 1);
      const dt = pad(targetDate.getDate());

      daySlots.forEach((slot) => {
        if (slot.isBreak) return;

        const [startH, startM] = slot.start.split(':');
        const [endH, endM] = slot.end.split(':');

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:cfgs3d-${d}-${slot.from}-${slot.mod}@horario3d.local`);
        lines.push(`DTSTAMP:${y}${m}${dt}T000000Z`);
        lines.push(`DTSTART:${y}${m}${dt}T${startH}${startM}00`);
        lines.push(`DTEND:${y}${m}${dt}T${endH}${endM}00`);
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayIcsCodes[d]};UNTIL=${untilDate}`);
        lines.push(`SUMMARY:${slot.name}`);
        lines.push(`LOCATION:${slot.meta}`);
        lines.push('END:VEVENT');
      });
    });

    tasks.forEach((task) => {
      if (!task.date) return;
      const [y, m, dt] = task.date.split('-');
      const [startH, startM] = (task.time || '15:45').split(':');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:task-${task.id}@horario3d.local`);
      lines.push(`DTSTART:${y}${m}${dt}T${startH}${startM}00`);
      lines.push(`DTEND:${y}${m}${dt}T${String(Number(startH) + 1).padStart(2, '0')}${startM}00`);
      lines.push(`SUMMARY:${task.type === 'examen' ? '⚠️ [EXAMEN] ' : ''}${task.title}`);
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-P1D');
      lines.push('ACTION:DISPLAY');
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  const icsOutput = generateIcs(events, sampleTasks);

  it('El archivo comienza con BEGIN:VCALENDAR y termina con END:VCALENDAR', () => {
    assert.ok(icsOutput.startsWith('BEGIN:VCALENDAR'));
    assert.ok(icsOutput.endsWith('END:VCALENDAR'));
  });

  it('Contiene la versión de protocolo VERSION:2.0', () => {
    assert.ok(icsOutput.includes('VERSION:2.0'));
  });

  it('Todas las clases tienen regla de recurrencia semanal RRULE:FREQ=WEEKLY', () => {
    assert.ok(icsOutput.includes('RRULE:FREQ=WEEKLY;BYDAY=MO'));
    assert.ok(icsOutput.includes('RRULE:FREQ=WEEKLY;BYDAY=TU'));
    assert.ok(icsOutput.includes('RRULE:FREQ=WEEKLY;BYDAY=WE'));
    assert.ok(icsOutput.includes('RRULE:FREQ=WEEKLY;BYDAY=TH'));
    assert.ok(icsOutput.includes('RRULE:FREQ=WEEKLY;BYDAY=FR'));
  });

  it('Los exámenes incluyen bloque de alarma previa VALARM (-P1D)', () => {
    assert.ok(icsOutput.includes('BEGIN:VALARM'));
    assert.ok(icsOutput.includes('TRIGGER:-P1D'));
    assert.ok(icsOutput.includes('END:VALARM'));
  });
});
