# ELARA Transport — Arquitectura

## Proyecto

**Nombre interno:** Proyecto Atlas  
**Versión:** 0.1.0  
**Estado:** Arquitectura inicial

---

# 1. Principio general

ELARA Transport seguirá la arquitectura ABE.

La aplicación se construirá con una estructura modular, clara y escalable.

Cada archivo tendrá una única responsabilidad.

---

# 2. Tipo de aplicación

La primera versión será una aplicación web.

Se utilizará:

- HTML.
- CSS.
- JavaScript.
- Supabase.

No se utilizarán frameworks en la primera etapa.

---

# 3. Estructura base

```text
ELARA-Transport/
│
├── docs/
├── src/
├── assets/
├── supabase/
└── README.md

```

---

# 4. Regla para Codex

Codex debe respetar la estructura actual del proyecto.

No debe crear carpetas ni archivos nuevos si ya existe un archivo adecuado.

Para la primera tarea, debe usar los archivos existentes del módulo Dashboard.

---

# 5. Dashboard

El Dashboard será el Centro de Operaciones del administrador.

Debe mostrar:

- Servicios de hoy.
- Servicios en curso.
- Servicios pendientes.
- Servicios cancelados.
- Ingresos del día.
- Alertas operativas.
- Próximos servicios.
- Actividad reciente.

---

# 6. Principio final

La arquitectura debe permitir avanzar rápido sin romper ABE.

Cada módulo tendrá responsabilidad única.