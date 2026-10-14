/**
 * @file subject-matcher.js
 * @description Mapeo y reconocimiento heurístico de asignaturas escolares (soporte bilingüe valenciano/castellano).
 */

import { SUBJECTS } from '../data/schedule.data.js';

/**
 * Tabla de equivalencias para mapear cursos y entregas de Aules (soporte bilingüe valenciano/castellano).
 */
export const AULES_SUBJECT_PATTERNS = [
  {
    mod: "proye",
    keywords: ["realització de projectes", "realitzacio de projectes", "projectes", "realización de proyectos", "realizacion de proyectos", "proyectos", "pts 06"]
  },
  {
    mod: "dibujo",
    keywords: ["disseny, dibuix i modelatge", "dibuix", "disseny", "modelatge", "diseño, dibujo y modelado", "diseño y dibujo", "dibujo", "modelado"]
  },
  {
    mod: "anim",
    keywords: ["animació d'elements", "animació", "animacion", "animación de elementos", "elementos 2d", "animación 3d"]
  },
  {
    mod: "color",
    keywords: ["color, il·luminació i acabats", "color, il-luminacio", "il·luminació", "iluminació", "color, iluminación y acabados", "color e iluminación", "iluminación", "color", "acabados"]
  },
  {
    mod: "fol",
    keywords: ["itinerari personal", "itinerari per a l'ocupabilitat", "itinerari", "ocupabilitat", "itinerario personal", "itinerario para la empleabilidad", "fol", "empleabilidad"]
  },
  {
    mod: "inter",
    keywords: ["projecte intermodular", "proyecto intermodular", "intermodular"]
  },
  {
    mod: "ingles",
    keywords: ["anglés professional", "anglés", "angles", "inglés profesional", "ingles profesional", "inglés", "ingles", "english", "ang 02"]
  }
];

/**
 * Determina qué módulo corresponde a una entrega analizando prioritariamente su categoría (nombre del curso en Aules)
 * y posteriormente el título o descripción.
 * @param {Object} assignment
 * @returns {{ mod: string|null, colorVar: string, name: string }}
 */
export function matchSubject(assignment) {
  if (!assignment) {
    return { mod: null, colorVar: "--muted", name: "General" };
  }

  const categoryText = (assignment.category || '').toLowerCase();

  // 1. Prioridad: Coincidencia con la categoría del curso en Aules
  for (const item of AULES_SUBJECT_PATTERNS) {
    if (item.keywords.some(kw => categoryText.includes(kw.toLowerCase()))) {
      const subject = SUBJECTS[item.mod];
      if (subject) {
        return {
          mod: item.mod,
          colorVar: subject.colorVar,
          name: subject.legend || subject.name
        };
      }
    }
  }

  // 2. Coincidencia secundaria con el título y descripción
  const fullText = `${assignment.title || ''} ${assignment.description || ''}`.toLowerCase();
  for (const item of AULES_SUBJECT_PATTERNS) {
    if (item.keywords.some(kw => fullText.includes(kw.toLowerCase()))) {
      const subject = SUBJECTS[item.mod];
      if (subject) {
        return {
          mod: item.mod,
          colorVar: subject.colorVar,
          name: subject.legend || subject.name
        };
      }
    }
  }

  // 3. Si el elemento ya define su módulo directamente (exámenes manuales)
  if (assignment.mod && SUBJECTS[assignment.mod]) {
    const subject = SUBJECTS[assignment.mod];
    return {
      mod: assignment.mod,
      colorVar: subject.colorVar,
      name: subject.legend || subject.name
    };
  }

  // Asignatura no identificada / Entrega general
  return {
    mod: null,
    colorVar: "--muted",
    name: "General"
  };
}
