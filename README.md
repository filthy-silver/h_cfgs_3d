# 📅 Horario Semanal & Tablero Kanban · CFGS 3D

> Aplicación web progresiva (PWA) de alto rendimiento, feed iCalendar y Tablero Kanban independiente para el ciclo formativo de **Animaciones 3D, Juegos y Entornos Interactivos**.

Diseñada con **Vanilla JavaScript (ES Modules)** y **Vanilla CSS**, sin dependencias de frameworks ni librerías pesadas, garantizando una carga instantánea y funcionamiento tanto online como offline.

---

## ✨ Características Principales

- **Contexto Temporal Inteligente:**
  - Panel "Ahora / Siguiente" con cálculo dinámico del tiempo restante y barra de progreso de la clase en curso.
  - Reconocimiento automático de descansos (recreo), jornadas finalizadas, fines de semana y festivos oficiales escolares de la Comunitat Valenciana (curso 2026/2027).
  - Auto-salto de jornada: a partir de las 21:35 la vista móvil avanza automáticamente a las clases del día siguiente (o al lunes durante el fin de semana).
- **Vista Dual Adaptable y Accesible:**
  - **Escritorio:** Tabla semanal completa con fila de recreo destacada y barra de leyendas interactiva con aislamiento y resaltado de asignaturas.
  - **Móvil:** Timeline vertical accesible con patrón WAI-ARIA Tablist, navegación con teclado (flechas, Home, End), respuesta háptica sutil y gestos táctiles de deslizamiento (*Swipe*).
- **Suscripción a Calendario Oficial (`/api/calendar.ics`):**
  - Feed iCalendar dinámico compatible con RFC 5545 (con alarmas a 15 min y plegado estricto de líneas a 75 octetos).
  - Suscripción directa en un clic para Google Calendar, Apple Calendar y Microsoft Outlook.
- **Proxy Edge de Aules (Moodle GVA):**
  - Consulta y parseo seguro del feed privado iCal de Aules con ajuste automático a la zona horaria peninsular española (`Europe/Madrid`).
  - Detección heurística de asignaturas tanto en valenciano como en castellano.
- **Gestión de Exámenes de Curso (`/api/events`):**
  - Lectura pública para todos los alumnos y mutaciones (crear, editar, eliminar) protegidas mediante `ADMIN_PIN`.
  - Persistencia distribuida mediante Cloudflare KV.
- **Tablero Kanban Autónomo (`kanban.html`):**
  - Gestión visual de entregas de Aules, exámenes oficiales y tareas personales del alumno en 3 columnas (*Pendiente*, *Trabajando*, *Hecho*).
  - Drag & Drop nativo de HTML5 con selectores accesibles de columna para pantallas táctiles y lectores de pantalla.
  - Panel inferior colapsable de notas rápidas y recordatorios tipo post-it con guardado en tiempo real y paleta de colores.
  - **Sincronización en la Nube (Móvil ↔ Torre) Zero-Knowledge:** Vinculación segura entre dispositivos mediante PIN efímero de 6 dígitos con cuenta atrás de 5 minutos, detección de canje por sondeo y auto-destrucción inmediata de los datos en la nube.
- **PWA Completa & Modo Oscuro:**
  - Service Worker con estrategia *Network-First* para páginas y *Stale-While-Revalidate* para recursos estáticos.
  - Soporte nativo para temas Claro, Oscuro y Automático mediante CSS `light-dark()`.

---

## 🏗️ Estructura del Proyecto

```text
├── index.html                  # Vista principal: Horario semanal y panel de entregas
├── kanban.html                 # Vista del Tablero Kanban y notas rápidas
├── manifest.json               # Manifiesto PWA para instalación
├── sw.js                       # Service Worker (caché offline y sincronización)
├── _headers                    # Reglas de caché y seguridad para Cloudflare Pages
├── wrangler.toml               # Configuración de despliegue para Cloudflare Workers
├── .dev.vars.example           # Plantilla de variables de entorno locales
├── package.json                # Manifiesto de scripts y entorno
├── css/
│   ├── styles.css              # Estilos del horario semanal y modales
│   └── kanban.css              # Estilos del tablero Kanban y notas
├── src/
│   ├── main.js                 # Orquestador principal de la vista de horario
│   ├── data/                   # Definición de horarios, materias y festivos
│   ├── domain/                 # Lógica de cálculo horario y cuentas atrás
│   ├── ui/                     # Componentes visuales (tabla, timeline, temas, modales)
│   └── kanban/                 # Módulos del tablero Kanban (store, cards, dnd, sync, notes)
├── functions/api/              # Endpoints para Cloudflare Pages Functions
│   ├── aules.js                # Edge Proxy de Moodle Aules
│   ├── events.js               # API REST de exámenes de clase (KV)
│   ├── sync.js                 # API de emparejamiento efímero de 5 min (KV)
│   └── calendar.ics.js         # Generador del feed RFC 5545 iCalendar
└── worker/
    └── index.js                # Enrutador standalone para Cloudflare Workers
```

---

## 🚀 Puesta en Marcha en Local

### Requisitos
- [Node.js](https://nodejs.org/) v18 o superior.
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/).

### 1. Configurar variables de entorno
Copia la plantilla de variables de entorno y personaliza tus secretos:
```bash
cp .dev.vars.example .dev.vars
```

Edita `.dev.vars`:
```env
# URL de exportación de tu calendario privado en Aules (Moodle):
AULES_ICAL_URL="https://aules.edu.gva.es/fp/calendar/export_execute.php?userid=...&authtoken=..."

# PIN de acceso de profesor / delegado para editar exámenes:
ADMIN_PIN="tu_pin_secreto"
```

> **Tip:** También puedes probar el modo de demostración sin conexión a Aules fijando `AULES_ICAL_URL="demo"`.

### 2. Iniciar el servidor de desarrollo
```bash
npx wrangler dev
```
La aplicación estará disponible en `http://localhost:8787`.

---

## ☁️ Despliegue en Cloudflare Workers / Pages

### 1. Crear el Namespace en Cloudflare KV
El proyecto utiliza un almacén KV (`EVENTS_KV`) para almacenar los exámenes y gestionar los códigos de emparejamiento temporal:

```bash
# Crear el almacén para producción:
npx wrangler kv:namespace create EVENTS_KV

# Crear el almacén para pruebas locales:
npx wrangler kv:namespace create EVENTS_KV --preview
```

Copia los identificadores generados y pégalos en `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "EVENTS_KV"
id = "<ID_DE_PRODUCCION>"
preview_id = "<ID_DE_PREVIEW>"
```

### 2. Configurar los Secretos de Producción
Configura las variables seguras en el panel de Cloudflare o mediante la terminal:
```bash
npx wrangler secret put AULES_ICAL_URL
npx wrangler secret put ADMIN_PIN
```

### 3. Desplegar
```bash
npx wrangler deploy
```

---

## 🔒 Privacidad y Arquitectura Zero-Knowledge

- **Sin base de datos de usuarios:** Los alumnos no necesitan registrarse, iniciar sesión ni proporcionar datos personales.
- **Almacenamiento Local:** Las tareas personales y notas rápidas residen exclusivamente en el `localStorage` del dispositivo del estudiante.
- **Emparejamiento Efímero:** Cuando se utiliza la opción de *"Vincular dispositivos"*, el paquete de datos se transfiere a través de un canal con PIN de 6 dígitos que se destruye automáticamente en un máximo de **5 minutos** (o a los **60 segundos** de ser canjeado), sin dejar rastro en ningún servidor permanente.

---

## 🧪 Pruebas Unitarias

Para ejecutar la suite de pruebas automatizadas:
```bash
npm test
```

---

## 📄 Licencia

Distribuido bajo licencia MIT. Consulta el código fuente para más detalles.
