# 🗓️ Horario Semanal · CFGS Animaciones 3D

Aplicación web progresiva (PWA) moderna, interactiva y sin dependencias externas para consultar el horario semanal del ciclo formativo de grado superior en **Animaciones 3D, Juegos y Entornos Interactivos**.

Incluye seguimiento de clases en tiempo real, gestión de notas, exportación a calendario digital, un **panel unificado de tareas y exámenes** centralizado mediante **Cloudflare Pages Functions** con protección de PIN, y una **suite completa de pruebas unitarias nativas**.

---

## ✨ Características Principales

- ⏱️ **Seguimiento en Tiempo Real ("Ahora" y "Siguiente")**:
  - Indica la asignatura actual, el aula/taller correspondiente y una cuenta atrás regresiva sincronizada con el reloj del sistema.
  - Barra de progreso visual del tiempo transcurrido en la clase actual.
  - Muestra la próxima clase programada (o el próximo día lectivo si la jornada ha concluido).
- 📌 **Panel Unificado de Tareas y Exámenes (Listo para Kanban)**:
  - Flujo unificado con tareas comunes, entregas de proyectos y exámenes.
  - **Destacado especial para exámenes**: Diseñados con borde reforzado de **7px**, fondo tintado con **sombra interna especial (`inset glow`)** y etiqueta `[⚠️ EXAMEN]`.
  - Checkbox interactivo para que cada alumno marque tareas como completadas de forma personal (`localStorage`).
  - Filtros rápidos: `[ Todos | ⚠️ Solo Exámenes | Pendientes | Completadas ]`.
  - La estructura de datos incluye estados (`stage: "todo" | "in_progress" | "done"`), dejando la base preparada para un futuro tablero Kanban.
- 🔐 **Modo Profesor / Delegado con PIN (Cloudflare Pages Functions)**:
  - La API serverless (`/api/events`) valida el PIN directamente en el Edge de Cloudflare mediante la variable/secreto `ADMIN_PIN`.
  - El PIN **nunca está expuesto al navegador del alumno**.
  - Permite añadir, editar y eliminar eventos oficiales compartidos para toda la clase.
- 📱 **Diseño Híbrido y Selector de Vista**:
  - **Semana completa**: Tabla semanal con franjas horarias y celdas agrupadas. Resalta automáticamente el día actual (*"Hoy"*), la clase activa y los badges de exámenes próximos.
  - **Día a día (Timeline vertical)**: Vista optimizada para móvil con tarjetas secuenciales y navegación por pestañas de lunes a viernes.
  - Selector manual `[ Auto | Semana | Día ]` para alternar la vista en cualquier pantalla.
- 📝 **Notas Personales del Alumno**:
  - Al hacer clic en cualquier clase o módulo se abre un panel de detalles con un bloc de notas personales guardadas en el navegador (`localStorage`).
- 📅 **Exportación a Calendario (.ics)**:
  - Genera y descarga un archivo estándar `horario_cfgs_3d.ics` (iCalendar / RFC 5545).
  - Incluye clases semanales recurrentes y los exámenes/entregas con alarma de aviso de 24 horas antes para el móvil.
- 🧪 **Suite Completa de Pruebas Unitarias Nativas**:
  - 23 pruebas automatizadas sin dependencias usando `node:test` y `node:assert`.
  - Cubre matemáticas temporales, ausencia de solapamientos, seguridad del PIN, integridad de PWA y formato iCalendar.
- 📦 **PWA 100% Instalable y Offline**:
  - Service Worker con estrategia híbrida y almacenamiento en caché para funcionar sin conexión en aulas sin cobertura.

---

## 📂 Estructura del Proyecto

```text
h_cfgs_3d-main/
├── css/
│   └── style.css            # Hoja de estilos (variables CSS, temas, panel de tareas, exámenes)
├── functions/
│   └── api/
│       └── events.js        # Cloudflare Pages Function (API REST protegida con PIN)
├── js/
│   ├── data.js              # Datos del horario, esquema de eventos y funciones de cálculo
│   └── app.js               # Lógica, sincronización de tareas, modo profesor y modales
├── tests/
│   ├── api.test.js          # Pruebas unitarias de Cloudflare API y seguridad de PIN
│   ├── calendar.test.js     # Pruebas de exportación a iCalendar (RFC 5545)
│   ├── data.test.js         # Pruebas de utilidades temporales y ausencia de solapamientos
│   └── pwa.test.js          # Pruebas de integridad de manifest, iconos PNG y Service Worker
├── scripts/
│   ├── generate-icons.js    # Generador de iconos PNG (192x192 y 512x512) sin dependencias
│   ├── test-api.js          # Script auxiliar de prueba
│   └── validate-schedule.js # Script auxiliar de validación de tramos
├── favicon.svg              # Icono vectorial SVG
├── icon-192.png             # Icono PWA para dispositivos móviles (192x192)
├── icon-512.png             # Icono PWA de alta resolución (512x512)
├── index.html               # Marcado principal HTML5 semántico
├── manifest.json            # Manifiesto de la aplicación PWA
├── package.json             # Configuración de pruebas nativas (npm test / node --test)
├── sw.js                    # Service Worker v2 para funcionamiento offline
└── README.md                # Documentación del proyecto
```

---

## 🧪 Ejecución de Pruebas Unitarias

El proyecto utiliza el **ejecutor nativo de pruebas de Node.js** (`node:test`), sin necesidad de instalar dependencias externas:

```bash
# Ejecutar todas las pruebas unitarias:
node --test tests/*.test.js

# O mediante npm:
npm test
```

### Resultados de la Suite (23 pruebas, 100% pasando):
- `tests/data.test.js`: Conversiones temporales, cálculo de vencimientos, continuidad de franjas y ausencia de solapamientos.
- `tests/api.test.js`: Verificación de PIN en el Edge (401 vs 201), CRUD de eventos y persistencia en KV.
- `tests/pwa.test.js`: Integridad del `manifest.json`, cabecera binaria mágica de los iconos PNG y correspondencia de `sw.js`.
- `tests/calendar.test.js`: Cumplimiento del estándar RFC 5545, recurrencias semanales y alarmas de exámenes.

---

## 🔐 Configuración del Secreto del PIN en Cloudflare Pages

El secreto del PIN se llama exactamente **`ADMIN_PIN`**.

Para configurarlo en Cloudflare:
1. Ve al panel de control de tu proyecto en **Cloudflare Pages**.
2. Entra en **Settings > Environment variables**.
3. En **Production** (y opcionalmente en Preview), pulsa **Add variable**:
   - **Variable name**: `ADMIN_PIN`
   - **Value**: El PIN que desees (ej: `4815` o `1234`).
   - **Type**: Selecciona **Encrypted** (Secreto cifrado).
4. Guarda los cambios. A partir de ese momento, el servidor validará ese PIN sin exponerlo jamás al navegador.
