const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../js/data.js');

describe('js/data.js - Utilidades Temporales', () => {
  it('toMin() convierte horas HH:MM a minutos desde medianoche', () => {
    assert.equal(data.toMin('00:00'), 0);
    assert.equal(data.toMin('15:45'), 945);
    assert.equal(data.toMin('18:30'), 1110);
    assert.equal(data.toMin('21:35'), 1295);
  });

  it('formatMinutes() formatea duraciones legibles en horas y minutos', () => {
    assert.equal(data.formatMinutes(20), '20 min');
    assert.equal(data.formatMinutes(55), '55 min');
    assert.equal(data.formatMinutes(60), '1 h');
    assert.equal(data.formatMinutes(125), '2 h 5 min');
    assert.equal(data.formatMinutes(180), '3 h');
  });

  it('getDaysUntil() y formatDueText() calculan diferencias de días', () => {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    assert.equal(data.getDaysUntil(todayStr), 0);
    assert.equal(data.formatDueText(todayStr), 'Hoy');

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    assert.equal(data.getDaysUntil(tomorrowStr), 1);
    assert.equal(data.formatDueText(tomorrowStr), 'Mañana');

    const in3Days = new Date(now);
    in3Days.setDate(now.getDate() + 3);
    const in3DaysStr = `${in3Days.getFullYear()}-${pad(in3Days.getMonth() + 1)}-${pad(in3Days.getDate())}`;
    assert.equal(data.getDaysUntil(in3DaysStr), 3);
    assert.equal(data.formatDueText(in3DaysStr), 'En 3 días');
  });
});

describe('js/data.js - Integridad del Horario Semanal', () => {
  const events = data.buildEvents();

  it('Cada día lectivo (1 al 5) contiene clases y el recreo automático', () => {
    data.DAYS.forEach((d) => {
      assert.ok(events[d], `El día ${d} debe existir`);
      assert.ok(events[d].length > 0, `El día ${d} debe tener clases`);

      const breakEvent = events[d].find((e) => e.isBreak);
      assert.ok(breakEvent, `El día ${d} debe incluir el recreo automático`);
      assert.equal(breakEvent.start, '18:30');
      assert.equal(breakEvent.end, '18:50');
      assert.equal(breakEvent.mod, 'recreo');
    });
  });

  it('Todos los módulos referenciados en el horario existen en SUBJECTS', () => {
    data.DAYS.forEach((d) => {
      events[d].forEach((ev) => {
        assert.ok(
          data.SUBJECTS[ev.mod],
          `El módulo ${ev.mod} en día ${d} debe estar definido en SUBJECTS`
        );
      });
    });
  });

  it('No existen solapamientos entre clases en ningún día de la semana', () => {
    data.DAYS.forEach((d) => {
      const list = events[d];
      for (let i = 0; i < list.length - 1; i++) {
        assert.ok(
          list[i].to <= list[i + 1].from,
          `Solapamiento detectado en día ${d}: ${list[i].mod} (hasta ${data.T[list[i].to]}) con ${list[i+1].mod} (desde ${data.T[list[i+1].from]})`
        );
      }
    });
  });

  it('La carga lectiva semanal suma exactamente 27 h 30 min (1650 minutos)', () => {
    const stats = data.calculateSubjectStats();
    const totalMinutes = stats.reduce((sum, s) => sum + s.totalMinutes, 0);
    assert.equal(totalMinutes, 1650);
  });
});
