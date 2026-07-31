# ELARA Transport — Reglas de Negocio

## Proyecto

**Nombre interno:** Proyecto Atlas

---

# 1. Regla principal

El sistema debe adaptarse a la forma de trabajar de ELARA Transport.

La empresa nunca deberá cambiar su forma de operar para adaptarse al software.

---

# 2. El servicio

La unidad principal del sistema es el **Servicio**.

Un servicio representa una reserva de transporte realizada para uno o varios pasajeros.

Todo gira alrededor del servicio.

---

# 3. Creación de servicios

Un servicio podrá ser creado por:

* Un cliente.
* Un administrador.
* Un colaborador autorizado.

Todos los servicios serán programados mediante reserva previa.

No existirán servicios inmediatos bajo demanda.

---

# 4. Tipos de servicio

Inicialmente existirán:

* Traslado al aeropuerto.
* Punto a punto.
* Larga distancia.
* Full Day.
* Transporte de mascotas.
* Servicios personalizados.

El sistema deberá permitir añadir nuevos tipos sin modificar la arquitectura.

---

# 5. Clientes

El cliente es quien contrata el servicio.

El cliente podrá reservar un servicio para sí mismo o para otras personas.

Un cliente podrá tener múltiples reservas.

Un cliente podrá tener varios pasajeros asociados a un mismo servicio.

---

# 6. Pasajeros

Los pasajeros representan las personas que serán transportadas.

Un servicio podrá tener uno o varios pasajeros.

Los pasajeros no necesitan estar registrados como usuarios del sistema.

---

# 7. Colaboradores

Los conductores serán denominados **Colaboradores**.

Los colaboradores no son empleados de ELARA Transport.

Un colaborador podrá:

* Conducir distintos vehículos.
* Aceptar o rechazar asignaciones.
* Gestionar el estado del servicio.
* Finalizar un servicio.

---

# 8. Vehículos

Los vehículos podrán ser:

* Propios.
* De colaboradores.

Un vehículo podrá ser utilizado por distintos colaboradores en momentos diferentes.

Un colaborador podrá conducir distintos vehículos.

---

# 9. Asignaciones

Las asignaciones serán realizadas inicialmente por un administrador.

El colaborador podrá aceptar o rechazar la asignación.

El administrador podrá modificar la asignación cuando sea necesario.

---

# 10. Estados del servicio

Inicialmente existirán los siguientes estados:

* Borrador.
* Solicitado.
* Pendiente de asignación.
* Asignado.
* Confirmado.
* Colaborador en camino.
* Colaborador llegó.
* Pasajero a bordo.
* En curso.
* Finalizado.
* Cancelado.
* Reprogramado.
* No Show.

El sistema deberá permitir incorporar nuevos estados sin modificar la arquitectura.

---

# 11. Seguimiento

Cada cambio realizado sobre un servicio deberá quedar registrado.

Se almacenará un historial completo de eventos para facilitar auditoría, soporte y análisis operativo.

---

# 12. Notificaciones

El sistema notificará los eventos importantes mediante los canales disponibles.

Inicialmente:

* Notificaciones Push.
* WhatsApp.
* Correo electrónico.

La arquitectura permitirá incorporar nuevos canales en el futuro.

---

# 13. Pagos

La primera versión permitirá:

* Pago en efectivo.
* Pago mediante datáfono.

Posteriormente podrán incorporarse pasarelas de pago digitales.

---

# 14. Fotografías

Cuando exista una asignación, el cliente visualizará:

* Fotografía del colaborador.
* Información del vehículo.
* Información del servicio.

El objetivo es aumentar la confianza y la transparencia.

---

# 15. Reportes

El sistema deberá generar información para la toma de decisiones.

Entre otros:

* Servicios realizados.
* Servicios cancelados.
* Ingresos.
* Clientes frecuentes.
* Colaboradores.
* Vehículos.
* Rutas.
* Zonas.
* Tipos de servicio.

---

# 16. Escalabilidad

Toda funcionalidad nueva deberá respetar la arquitectura existente.

No se permitirá implementar soluciones rápidas que comprometan el crecimiento futuro del sistema.

---

# 17. Principio rector

Cada nueva funcionalidad deberá responder a una necesidad real de ELARA Transport y aportar valor operativo antes de ser incorporada al sistema.


## Riesgo operativo

Toda situación que pueda afectar la ejecución de un servicio deberá destacarse visualmente como alerta operativa.

Ejemplos:

- Servicio próximo sin colaborador asignado.
- Colaborador rechaza una asignación.
- Vehículo no disponible.
- Documentación vencida.
- Servicio de aeropuerto con vuelo retrasado.
- Servicio de aeropuerto con vuelo adelantado.
- Cambio de hora estimada de llegada del vuelo.
- Servicio activo sin actualización reciente.