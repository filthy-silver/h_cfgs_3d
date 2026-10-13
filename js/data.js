/**
 * Datos y utilidades del Horario CFGS 3D
 * Compatible con navegador (window.CFGS_DATA) y Node.js (module.exports).
 */
(function (global) {
  'use strict';

  // Tramos horarios (8 puntos = 7 intervalos lectivos/descanso)
  const T = ['15:45', '16:40', '17:35', '18:30', '18:50', '19:45', '20:40', '21:35'];
  const BREAK_INDEX = 3; // 18:30 - 18:50

  const SUBJECTS = {
    proye: {
      name: 'Realización de proyectos',
      meta: 'PTS 06 · INF-1',
      legend: 'Proyectos',
      code: 'PRY',
      colorVar: '--mod-proye',
      description: 'Planificación, dirección y desarrollo integral de proyectos interactivos y 3D.'
    },
    color: {
      name: 'Color, iluminación y acabados',
      meta: 'PTS 01 / PTS 04 · INF-1',
      legend: 'Color e iluminación',
      code: 'CLR',
      colorVar: '--mod-color',
      description: 'Técnicas de color digital, shading, texturizado, renderizado e iluminación escénica.'
    },
    dibujo: {
      name: 'Diseño, dibujo y modelado',
      meta: 'PS SO 01 / PS SO 03 · INF-1',
      legend: 'Diseño y dibujo',
      code: 'DIS',
      colorVar: '--mod-dibujo',
      description: 'Concept art, anatomía artística, modelado poligonal y escultura digital 3D.'
    },
    anim: {
      name: 'Animación de elementos',
      meta: 'PS SO 01 / PS SO 02 · INF-1',
      legend: 'Animación 2D/3D',
      code: 'ANM',
      colorVar: '--mod-anim',
      description: 'Principios de animación, rigging, timing, animación de personajes y props.'
    },
    fol: {
      name: 'Itinerario personal',
      meta: 'FOL 04 · POLI 2',
      legend: 'Itinerario / FOL',
      code: 'IPE',
      colorVar: '--mod-fol',
      description: 'Itinerario personal para la empleabilidad, orientación laboral y relaciones de trabajo.'
    },
    inter: {
      name: 'Proyecto intermodular',
      meta: 'PS SO 03 · INF-1',
      legend: 'Intermodular',
      code: 'INT',
      colorVar: '--mod-inter',
      description: 'Integración interdisciplinar y proyectos colaborativos transversales.'
    },
    ingles: {
      name: 'Inglés profesional',
      meta: 'ANG 02 · ANG 1',
      legend: 'Inglés',
      code: 'ING',
      colorVar: '--mod-ingles',
      description: 'Terminología técnica de la industria 3D y comunicación profesional en lengua inglesa.'
    },
    recreo: {
      name: 'Recreo',
      meta: 'Descanso',
      legend: 'Recreo',
      code: 'REC',
      colorVar: '--mod-recreo',
      description: 'Pausa de 20 minutos entre bloques lectivos.'
    }
  };

  // Horario semanal lectivo por día (1: Lunes ... 5: Viernes)
  // Formato: [id_modulo, indice_inicio, indice_fin, meta_opcional]
  const SCHEDULE = {
    1: [
      ['proye', 0, 1],
      ['color', 1, 3],
      ['dibujo', 4, 7]
    ],
    2: [
      ['fol', 0, 1],
      ['inter', 1, 2],
      ['proye', 2, 3],
      ['proye', 4, 6],
      ['ingles', 6, 7]
    ],
    3: [
      ['color', 0, 3],
      ['fol', 4, 5],
      ['proye', 5, 7]
    ],
    4: [
      ['anim', 0, 3],
      ['anim', 4, 5],
      ['ingles', 5, 6],
      ['fol', 6, 7, 'FOL 04 · POLI 1']
    ],
    5: [
      ['anim', 0, 3],
      ['anim', 4, 5],
      ['dibujo', 5, 7]
    ]
  };

  const DAYS = [1, 2, 3, 4, 5];
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Tipos de elementos para el flujo unificado de tareas y exámenes
  const EVENT_TYPES = {
    examen: {
      label: 'Examen',
      badge: '⚠️ EXAMEN',
      icon: '📝',
      isExam: true,
      priority: 'high'
    },
    entrega: {
      label: 'Entrega de Proyecto',
      badge: '📦 Entrega',
      icon: '📦',
      isExam: false,
      priority: 'normal'
    },
    tarea: {
      label: 'Tarea / Práctica',
      badge: '📋 Tarea',
      icon: '📋',
      isExam: false,
      priority: 'normal'
    }
  };

  // Tareas y exámenes de muestra para pruebas offline y primer arranque
  const INITIAL_SAMPLE_EVENTS = [
    {
      id: 'ev-sample-1',
      title: 'Examen Parcial: Principios de Animación y Rigging',
      mod: 'anim',
      type: 'examen',
      date: '2026-10-23',
      time: '17:35',
      notes: 'Temas 1 al 4. Entregar ejercicio previo en Aules.',
      priority: 'high',
      stage: 'todo'
    },
    {
      id: 'ev-sample-2',
      title: 'Entrega Fase 1: Guion y Storyboard del Proyecto 3D',
      mod: 'proye',
      type: 'entrega',
      date: '2026-10-27',
      time: '15:45',
      notes: 'Subir archivo PDF y enlace a carpeta Drive de referencias.',
      priority: 'normal',
      stage: 'todo'
    },
    {
      id: 'ev-sample-3',
      title: 'Práctica: Iluminación de tres puntos en Blender',
      mod: 'color',
      type: 'tarea',
      date: '2026-10-30',
      time: '16:40',
      notes: 'Renderizar en formato PNG 1920x1080 con color grading.',
      priority: 'normal',
      stage: 'todo'
    }
  ];

  // Convierte "HH:MM" a minutos desde medianoche
  function toMin(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // Da formato legible a minutos: "1 h 40 min", "2 h", "45 min"
  function formatMinutes(m) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h > 0) {
      return r > 0 ? `${h} h ${r} min` : `${h} h`;
    }
    return `${m} min`;
  }

  // Calcula días restantes entre una fecha "YYYY-MM-DD" y hoy
  function getDaysUntil(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  // Texto amigable para fecha de entrega / examen
  function formatDueText(dateStr) {
    const diff = getDaysUntil(dateStr);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === 2) return 'Pasado mañana';
    if (diff > 2 && diff <= 7) return `En ${diff} días`;
    if (diff < 0) return `Venció hace ${Math.abs(diff)} d`;

    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  // Genera el listado completo de eventos por día incluyendo el recreo
  function buildEvents() {
    const result = {};
    DAYS.forEach((d) => {
      const daySlots = SCHEDULE[d] || [];
      const list = daySlots.map(([mod, from, to, customMeta]) => ({
        mod,
        from,
        to,
        start: T[from],
        end: T[to],
        name: SUBJECTS[mod]?.name || mod,
        meta: customMeta || SUBJECTS[mod]?.meta || '',
        isBreak: mod === 'recreo'
      }));

      // Añadir recreo automático
      list.push({
        mod: 'recreo',
        from: BREAK_INDEX,
        to: BREAK_INDEX + 1,
        start: T[BREAK_INDEX],
        end: T[BREAK_INDEX + 1],
        name: 'Recreo',
        meta: 'Descanso',
        isBreak: true
      });

      result[d] = list.sort((a, b) => a.from - b.from);
    });
    return result;
  }

  // Calcula estadísticas de carga horaria semanal por módulo
  function calculateSubjectStats() {
    const stats = {};
    Object.keys(SUBJECTS).forEach((k) => {
      if (k !== 'recreo') {
        stats[k] = { ...SUBJECTS[k], key: k, totalMinutes: 0, periods: 0 };
      }
    });

    DAYS.forEach((d) => {
      (SCHEDULE[d] || []).forEach(([mod, from, to]) => {
        if (stats[mod]) {
          const duration = toMin(T[to]) - toMin(T[from]);
          stats[mod].totalMinutes += duration;
          stats[mod].periods += (to - from);
        }
      });
    });

    return Object.values(stats).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  const dataExport = {
    T,
    BREAK_INDEX,
    SUBJECTS,
    SCHEDULE,
    DAYS,
    DAY_NAMES,
    DAY_SHORT,
    EVENT_TYPES,
    INITIAL_SAMPLE_EVENTS,
    toMin,
    formatMinutes,
    getDaysUntil,
    formatDueText,
    buildEvents,
    calculateSubjectStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dataExport;
  } else {
    global.CFGS_DATA = dataExport;
  }
})(typeof window !== 'undefined' ? window : globalThis);
