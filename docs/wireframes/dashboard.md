# ELARA Transport — Wireframe / Dashboard

## Proyecto

**Nombre interno:** Proyecto Atlas  
**Versión:** 0.1.0

---

# Dashboard — Centro de Operaciones

## Objetivo

Mostrar al administrador qué está ocurriendo ahora y qué requiere atención inmediata.

## Usuario principal

Administrador.

## Pregunta que responde

¿Qué necesita mi atención ahora mismo?

---

# Información principal

El Dashboard deberá mostrar:

- Servicios programados para hoy.
- Servicios en curso.
- Servicios pendientes de asignación.
- Servicios cancelados.
- Colaboradores disponibles.
- Ingresos del día.
- Alertas operativas.
- Próximos servicios.
- Actividad reciente.

---

# Alertas operativas

Las alertas tendrán prioridad sobre cualquier otra información.

Ejemplos:

- Servicio próximo sin colaborador asignado.
- Colaborador rechazó asignación.
- Vuelo retrasado.
- Vuelo adelantado.
- Servicio activo sin actualización.
- Vehículo no disponible.
- Documentación vencida.

---

# Wireframe

```text
--------------------------------------------------
ELARA Transport

Buenos días, Erick

Hoy tienes 8 servicios programados.

--------------------------------------------------

[ Hoy: 8 ] [ En curso: 2 ] [ Pendientes: 3 ] [ Cancelados: 1 ] [ Ingresos: 180€ ]

--------------------------------------------------

ALERTAS OPERATIVAS

🔴 Servicio 1542 sin colaborador
Empieza en 45 minutos

🔴 Vuelo IB1234 adelantado 25 minutos
Revisar hora de salida del colaborador

🟡 Carlos rechazó una asignación
Servicio pendiente de reasignar

--------------------------------------------------

PRÓXIMOS SERVICIOS

08:30 | Aeropuerto | Juan Pérez | Pendiente
10:00 | Punto a punto | Ana López | Confirmado
12:30 | Mascotas | Laura Díaz | Confirmado

--------------------------------------------------

ACTIVIDAD RECIENTE

Carlos aceptó servicio 1541
Cliente modificó destino del servicio 1539
Servicio 1538 finalizado

--------------------------------------------------

```

---

# Acciones disponibles

Desde el Dashboard el administrador podrá:

- Ver servicio.
- Asignar colaborador.
- Reasignar colaborador.
- Revisar alerta.
- Ir a lista completa de servicios.

---

# Regla UX

La información crítica debe aparecer primero.

El Dashboard debe funcionar como centro de operaciones, no como una pantalla decorativa.