/**
 * Script de validación automatizada para el horario lectivo.
 * Verifica integridad de datos, ausencia de solapamientos y continuidad temporal.
 */
const data = require('../js/data.js');
const { T, SUBJECTS, SCHEDULE, DAYS, toMin, buildEvents, calculateSubjectStats } = data;

console.log('--- Iniciando validación del Horario CFGS 3D ---');

let errors = 0;

// 1. Validar tramos horarios (T)
if (!Array.isArray(T) || T.length < 2) {
  console.error('✖ Error: Array de horas T inválido');
  errors++;
} else {
  for (let i = 0; i < T.length - 1; i++) {
    const startM = toMin(T[i]);
    const endM = toMin(T[i + 1]);
    if (startM >= endM) {
      console.error(`✖ Error: Tramo horario no secuencial: T[${i}]=${T[i]} >= T[${i+1}]=${T[i+1]}`);
      errors++;
    }
  }
  console.log(`✓ Tramos horarios verificados (${T.length} marcas temporales, ${T.length - 1} franjas).`);
}

// 2. Validar asignaturas (SUBJECTS)
const subjectKeys = Object.keys(SUBJECTS);
console.log(`✓ Asignaturas registradas: ${subjectKeys.length} módulos (${subjectKeys.join(', ')}).`);

// 3. Validar programación por días y solapamientos
const events = buildEvents();

DAYS.forEach((d) => {
  const dayEvents = events[d];
  if (!dayEvents || dayEvents.length === 0) {
    console.warn(`! Aviso: El día ${d} no tiene clases programadas.`);
    return;
  }

  // Verificar existencia de asignaturas y rangos de índices
  dayEvents.forEach((ev) => {
    if (!SUBJECTS[ev.mod]) {
      console.error(`✖ Error en día ${d}: Módulo '${ev.mod}' no existe en SUBJECTS.`);
      errors++;
    }
    if (ev.from < 0 || ev.to >= T.length || ev.from >= ev.to) {
      console.error(`✖ Error en día ${d}: Índices de tramo inválidos para '${ev.mod}': from=${ev.from}, to=${ev.to}`);
      errors++;
    }
  });

  // Verificar que no haya solapamientos
  for (let i = 0; i < dayEvents.length - 1; i++) {
    const cur = dayEvents[i];
    const next = dayEvents[i + 1];
    if (cur.to > next.from) {
      console.error(`✖ SOLAPAMIENTO en día ${d}: '${cur.mod}' (hasta ${T[cur.to]}) se solapa con '${next.mod}' (desde ${T[next.from]})`);
      errors++;
    }
  }
});

// 4. Estadísticas
const stats = calculateSubjectStats();
let totalMin = 0;
stats.forEach(s => {
  totalMin += s.totalMinutes;
  console.log(`   - ${s.name}: ${s.periods} periodos (${data.formatMinutes(s.totalMinutes)})`);
});
console.log(`✓ Carga lectiva semanal total: ${data.formatMinutes(totalMin)}`);

if (errors === 0) {
  console.log('✔ ¡Todas las validaciones pasaron satisfactoriamente!');
  process.exit(0);
} else {
  console.error(`✖ Validación fallida con ${errors} errores.`);
  process.exit(1);
}
