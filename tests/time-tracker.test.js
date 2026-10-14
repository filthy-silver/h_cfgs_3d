import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes,
  formatDuration,
  getSmartInitialMobileDay,
  findCurrentEvent,
  findUpcomingEventToday,
  findNextEventInFutureCalendar,
  computeEventProgress
} from '../src/domain/time-tracker.js';
import { buildNormalizedEvents } from '../src/data/schedule.data.js';

describe('time-tracker.js · Cálculos Horarios y Dominio', () => {

  it('toMinutes convierte correctamente cadenas "HH:mm" a minutos enteros', () => {
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('15:45'), 15 * 60 + 45); // 945
    assert.equal(toMinutes('18:30'), 18 * 60 + 30); // 1110
    assert.equal(toMinutes('21:35'), 21 * 60 + 35); // 1295
  });

  it('formatDuration formatea minutos en horas y minutos legibles', () => {
    assert.equal(formatDuration(45), '45 min');
    assert.equal(formatDuration(60), '1 h');
    assert.equal(formatDuration(80), '1 h 20 min');
    assert.equal(formatDuration(120), '2 h');
  });

  it('getSmartInitialMobileDay calcula el día inteligente inicial para la vista móvil', () => {
    // Caso 1: Lunes a las 16:00 (durante jornada escolar) -> Lunes (1)
    const monInClass = new Date('2026-10-19T16:00:00');
    assert.equal(getSmartInitialMobileDay(monInClass), 1);

    // Caso 2: Lunes a las 22:00 (jornada terminada) -> Salto automático a Martes (2)
    const monAfterHours = new Date('2026-10-19T22:00:00');
    assert.equal(getSmartInitialMobileDay(monAfterHours), 2);

    // Caso 3: Jueves a las 22:00 -> Salto automático a Viernes (5)
    const thuAfterHours = new Date('2026-10-22T22:00:00');
    assert.equal(getSmartInitialMobileDay(thuAfterHours), 5);

    // Caso 4: Viernes a las 22:00 (fin de semana) -> Salto a Lunes (1)
    const friAfterHours = new Date('2026-10-23T22:00:00');
    assert.equal(getSmartInitialMobileDay(friAfterHours), 1);

    // Caso 5: Sábado / Domingo -> Lunes (1)
    const saturday = new Date('2026-10-24T12:00:00');
    const sunday = new Date('2026-10-25T18:00:00');
    assert.equal(getSmartInitialMobileDay(saturday), 1);
    assert.equal(getSmartInitialMobileDay(sunday), 1);
  });

  it('findCurrentEvent detecta la clase en curso exacta', () => {
    const events = [
      { start: '15:45', end: '16:40', name: 'Realización de proyectos' },
      { start: '16:40', end: '18:30', name: 'Color, iluminación y acabados' }
    ];

    // A las 16:00 (en la primera clase)
    const cur = findCurrentEvent(events, 16 * 60);
    assert.ok(cur);
    assert.equal(cur.name, 'Realización de proyectos');

    // A las 17:00 (en la segunda clase)
    const cur2 = findCurrentEvent(events, 17 * 60);
    assert.ok(cur2);
    assert.equal(cur2.name, 'Color, iluminación y acabados');

    // A las 19:00 (fuera de horario)
    const cur3 = findCurrentEvent(events, 19 * 60);
    assert.equal(cur3, null);
  });

  it('findUpcomingEventToday encuentra la siguiente clase del mismo día', () => {
    const events = [
      { start: '15:45', end: '16:40', name: 'Clase 1' },
      { start: '16:40', end: '18:30', name: 'Clase 2' }
    ];

    // Antes de empezar (14:00) -> Clase 1
    const next = findUpcomingEventToday(events, 14 * 60);
    assert.ok(next);
    assert.equal(next.name, 'Clase 1');

    // Durante la clase 1 (16:00) -> Clase 2
    const next2 = findUpcomingEventToday(events, 16 * 60);
    assert.ok(next2);
    assert.equal(next2.name, 'Clase 2');

    // Al final del día (19:00) -> null
    const next3 = findUpcomingEventToday(events, 19 * 60);
    assert.equal(next3, null);
  });

  it('findNextEventInFutureCalendar salta fines de semana y festivos escolares', () => {
    const eventsByDay = buildNormalizedEvents();

    // Viernes 23 de octubre de 2026 a las 22:00 -> la próxima clase debe ser el Lunes siguiente
    const friNight = new Date('2026-10-23T22:00:00');
    const future = findNextEventInFutureCalendar(eventsByDay, friNight);

    assert.ok(future);
    assert.equal(future.when, 'Lunes');
    assert.equal(future.event.start, '15:45');
    assert.equal(future.event.name, 'Realización de proyectos');
  });

  it('computeEventProgress calcula porcentaje y tiempo restante con precisión', () => {
    const event = { start: '15:45', end: '16:45', name: 'Prueba' }; // 60 minutos
    
    // A las 16:15 han pasado 30 minutos (50%)
    const mid = computeEventProgress(event, 16 * 60 + 15);
    assert.equal(mid.progressPercent, 50);
    assert.equal(mid.remainingMinutes, 30);
    assert.equal(mid.formattedRemaining, 'Quedan 30 min');
  });

});
