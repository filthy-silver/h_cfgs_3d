import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHolidayInfo,
  buildNormalizedEvents,
  DAYS_CONFIG,
  SUBJECTS
} from '../src/data/schedule.data.js';

describe('schedule.data.js · Festivos y Bloques Lectivos', () => {

  it('getHolidayInfo reconoce festivos autonómicos de la Comunitat Valenciana', () => {
    // 9 de Octubre (Día de la Comunitat Valenciana)
    const diaComunitat = new Date('2026-10-09T10:00:00');
    const info = getHolidayInfo(diaComunitat);
    assert.equal(info.isHoliday, true);
    assert.equal(info.name, 'Día de la Comunitat Valenciana');

    // 19 de Marzo (Fallas)
    const fallas = new Date('2027-03-19T10:00:00');
    const infoFallas = getHolidayInfo(fallas);
    assert.equal(infoFallas.isHoliday, true);
    assert.equal(infoFallas.name, 'San José (Fallas)');
  });

  it('getHolidayInfo reconoce un día lectivo ordinario como no festivo', () => {
    const ordinaryDay = new Date('2026-10-21T10:00:00'); // Miércoles
    const info = getHolidayInfo(ordinaryDay);
    assert.equal(info.isHoliday, false);
    assert.equal(info.name, null);
  });

  it('buildNormalizedEvents genera los 5 días lectivos con recreo inyectado', () => {
    const events = buildNormalizedEvents();

    assert.equal(Object.keys(events).length, 5);

    DAYS_CONFIG.forEach(({ id: dayId }) => {
      const dayList = events[dayId];
      assert.ok(Array.isArray(dayList));
      assert.ok(dayList.length >= 3);

      // Cada día debe incluir el recreo a las 18:30 - 18:50
      const breakEvent = dayList.find(e => e.mod === 'recreo');
      assert.ok(breakEvent, `El día ${dayId} no tiene recreo`);
      assert.equal(breakEvent.start, '18:30');
      assert.equal(breakEvent.end, '18:50');
    });
  });

  it('todas las asignaturas del horario existen en SUBJECTS', () => {
    const events = buildNormalizedEvents();

    DAYS_CONFIG.forEach(({ id: dayId }) => {
      events[dayId].forEach(ev => {
        assert.ok(SUBJECTS[ev.mod], `Módulo "${ev.mod}" no encontrado en SUBJECTS`);
      });
    });
  });

});
