import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foldIcsLine, generateIcsFeed } from '../functions/api/calendar.ics.js';

describe('calendar.ics.js · Feed iCalendar y Plegado RFC 5545', () => {

  it('no pliega líneas cortas de menos de 75 octetos', () => {
    const shortLine = 'SUMMARY:Realización de proyectos';
    assert.equal(foldIcsLine(shortLine), shortLine);
  });

  it('pliega líneas largas insertando CRLF y espacio de continuación', () => {
    const longLine = 'DESCRIPTION:Este es un texto extremadamente largo que supera claramente el limite de setenta y cinco octetos especificado por el RFC 5545 de iCalendar';
    const folded = foldIcsLine(longLine);

    assert.ok(folded.includes('\r\n '));
    const parts = folded.split('\r\n');
    parts.forEach((part, index) => {
      const encoder = new TextEncoder();
      const byteLength = encoder.encode(part).length;
      assert.ok(byteLength <= 75, `La línea ${index} mide ${byteLength} bytes (supera 75 bytes)`);
    });
  });

  it('generateIcsFeed genera un feed VCALENDAR válido y completo', () => {
    const feed = generateIcsFeed();

    assert.ok(feed.startsWith('BEGIN:VCALENDAR'));
    assert.ok(feed.endsWith('END:VCALENDAR'));
    assert.ok(feed.includes('BEGIN:VTIMEZONE'));
    assert.ok(feed.includes('TZID:Europe/Madrid'));
    assert.ok(feed.includes('BEGIN:VEVENT'));
    assert.ok(feed.includes('BEGIN:VALARM'));

    // Verificar que ninguna línea en el feed completo supere 75 octetos
    const lines = feed.split('\r\n');
    const encoder = new TextEncoder();
    lines.forEach((line, idx) => {
      const bytes = encoder.encode(line).length;
      assert.ok(bytes <= 75, `Línea ${idx} en el feed excede 75 bytes: "${line.slice(0, 30)}..." (${bytes} bytes)`);
    });
  });

});
