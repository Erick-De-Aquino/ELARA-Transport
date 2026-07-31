# ELARA Transport — Wireframes / Servicios

## Proyecto

**Nombre interno:** Proyecto Atlas
**Versión:** 0.1.0

---

# Índice

1. Módulo Servicios
2. Flujo general
3. Pantallas Administrador

   * Lista de servicios
   * Nuevo servicio
   * Detalle del servicio
4. Pantallas Cliente *(pendiente)*
5. Pantallas Colaborador *(pendiente)*
6. Centro de Alertas *(Parte 2)*
7. Flujo de Estados *(Parte 2)*
8. Reglas UX *(Parte 2)*
9. Reglas Operativas *(Parte 2)*
10. Funcionalidades futuras *(Parte 2)*

---

# 1. Módulo Servicios

## Objetivo

Gestionar todas las reservas y servicios de ELARA Transport.

Este módulo constituye el núcleo operativo de la plataforma.

Todo el resto del sistema gira alrededor del servicio.

---

## Usuarios

### Administrador

Puede crear, modificar, asignar, cancelar y supervisar cualquier servicio.

### Cliente

Puede crear reservas, consultar su estado y gestionar sus servicios.

### Colaborador

Puede consultar sus servicios asignados, aceptar o rechazar asignaciones y ejecutar el servicio.

---

# Flujo general

```text
Cliente crea reserva
        │
        ▼
Servicio pendiente de asignación
        │
        ▼
Administrador asigna colaborador
        │
        ▼
Colaborador acepta
        │
        ▼
Servicio confirmado
        │
        ▼
Inicio del servicio
        │
        ▼
Servicio finalizado
```

---

# 2. Pantalla Administrador — Lista de Servicios

## Objetivo

Permitir visualizar y gestionar todos los servicios desde una única pantalla.

---

## Información visible

Cada fila mostrará:

* Estado
* Fecha
* Hora
* Tipo de servicio
* Cliente
* Origen
* Destino
* Colaborador
* Vehículo
* Método de pago
* Precio
* Acciones

---

## Acciones

* Ver
* Editar
* Asignar colaborador
* Cambiar estado
* Cancelar

---

## Filtros

* Fecha
* Estado
* Cliente
* Colaborador
* Tipo de servicio
* Pendientes de asignación

---

## Regla UX

Los servicios con riesgo operativo deberán resaltarse visualmente.

---

# 3. Pantalla Administrador — Nuevo Servicio

## Objetivo

Registrar un servicio de forma rápida y ordenada.

Tiempo objetivo:

**Menos de 2 minutos.**

---

## Bloque 1

Tipo de servicio

Fecha

Hora

---

## Bloque 2

Cliente

* Buscar cliente
* Nuevo cliente

Autocompletar cuando exista.

---

## Bloque 3

Pasajeros

* Pasajero principal
* Añadir pasajeros

El cliente puede ser diferente del pasajero.

---

## Bloque 4

Trayecto

* Origen
* Destino
* Paradas
* Observaciones

Las paradas podrán:

* Agregarse
* Eliminarse
* Reordenarse

---

## Bloque 5

Información específica

Ejemplo:

### Aeropuerto

* Número de vuelo
* Terminal

### Mascotas

* Tipo
* Tamaño
* Observaciones

---

## Bloque 6

Pago

* Método
* Precio estimado
* Observaciones

---

## Botones

* Guardar borrador
* Crear servicio
* Cancelar

---

## Regla UX

Solicitar únicamente la información necesaria.

Todo lo demás será opcional.

---

# 4. Pantalla Administrador — Detalle del Servicio

## Objetivo

Gestionar completamente un servicio desde una única pantalla.

El administrador no debería necesitar abandonar esta vista para operar.

---

## Secciones

### Estado

* Estado actual
* Riesgo operativo
* Fecha
* Hora

---

### Cliente

* Nombre
* Teléfono
* Email
* Historial resumido

Botón:

Ver ficha completa.

---

### Pasajeros

* Lista de pasajeros
* Datos de contacto
* Observaciones

Botón:

Añadir pasajero.

---

### Trayecto

* Origen
* Paradas
* Destino
* Tiempo estimado
* Distancia estimada

Acciones:

* Editar recorrido
* Añadir parada
* Reordenar paradas

---

### Colaborador

* Fotografía
* Nombre
* Teléfono
* Estado

Botones

* Asignar
* Reasignar
* Contactar

---

### Vehículo

* Marca
* Modelo
* Color
* Matrícula
* Capacidad

---

### Pago

* Método
* Precio estimado
* Precio final
* Estado del pago

---

### Observaciones

* Cliente
* Administrador
* Colaborador

---

### Historial Operativo

Cronología completa del servicio.

Ejemplo:

* Servicio creado.
* Colaborador asignado.
* Colaborador aceptó.
* Vuelo retrasado.
* Colaborador inició desplazamiento.
* Pasajero a bordo.
* Servicio finalizado.

---

## Acciones disponibles

* Editar
* Asignar colaborador
* Cambiar vehículo
* Modificar recorrido
* Modificar precio
* Reprogramar
* Cancelar
* Duplicar servicio
* Imprimir
* Enviar información al cliente
* Contactar colaborador

---

## Regla UX

Toda la información relevante deberá encontrarse en una única pantalla.

---

# 5. Centro de Alertas Operativas

## Objetivo

Mostrar al administrador cualquier situación que requiera atención inmediata.

Las alertas siempre tendrán prioridad sobre la información estadística.

---

## Riesgo Alto

Situaciones que pueden afectar directamente la correcta ejecución del servicio.

Ejemplos:

* Servicio sin colaborador asignado.
* Colaborador rechaza una asignación.
* Vuelo adelantado.
* Vuelo cancelado.
* Vehículo no disponible.
* Servicio próximo sin confirmar.

---

## Riesgo Medio

Situaciones que requieren revisión.

Ejemplos:

* Cliente modifica el destino.
* Cliente agrega una parada.
* Cambio de precio pendiente.
* Vuelo retrasado sin afectar todavía la operación.

---

## Información

Eventos relevantes.

Ejemplos:

* Servicio creado.
* Colaborador aceptó.
* Servicio iniciado.
* Servicio finalizado.

---

## Alertas de vuelos

Cuando el servicio sea de tipo aeropuerto y exista un número de vuelo, el sistema consultará una API externa.

Información obtenida:

* Hora programada.
* Hora estimada.
* Retraso.
* Adelanto.
* Cancelación.
* Terminal (si está disponible).

Todo cambio importante generará una alerta operativa.

---

# 6. Flujo de Estados del Servicio

## Estados

```text
Pendiente de asignación
Asignado
Confirmado
Colaborador en camino
Colaborador llegó
Pasajero a bordo
En curso
Finalizado
Cancelado
No Show
Reprogramado
```

---

## Flujo normal

```text
Pendiente de asignación
        │
        ▼
Asignado
        │
        ▼
Confirmado
        │
        ▼
Colaborador en camino
        │
        ▼
Colaborador llegó
        │
        ▼
Pasajero a bordo
        │
        ▼
En curso
        │
        ▼
Finalizado
```

---

## Acciones del colaborador

Los cambios de estado se realizarán mediante un control deslizable.

Orden:

* Deslizar para ir en camino.
* Deslizar para indicar llegada.
* Deslizar para indicar pasajero a bordo.
* Deslizar para iniciar trayecto.
* Deslizar para finalizar servicio.

---

## Cambios durante el servicio

El colaborador podrá:

* Agregar destinos.
* Modificar destinos.
* Eliminar destinos.
* Reordenar destinos.

Todos los cambios quedarán registrados.

---

## Navegación

Desde el servicio activo el colaborador podrá abrir directamente:

* Google Maps.
* Waze.

---

## Notificaciones

Cada cambio de estado enviará una notificación Push al cliente.

Cuando corresponda también podrá enviarse por:

* WhatsApp.
* Correo electrónico.

---

## Tiempos internos

El sistema registrará automáticamente:

* Hora de asignación.
* Hora de aceptación.
* Hora de salida.
* Hora de llegada.
* Tiempo de espera.
* Hora de inicio del trayecto.
* Hora de finalización.

Estos datos serán exclusivamente para métricas internas.

No serán visibles para el cliente ni para el colaborador.

---

# 7. Reglas UX

## Riesgo operativo

Toda situación que represente un riesgo operativo deberá destacarse visualmente.

---

## Información crítica

Siempre aparecerá antes que la información estadística.

---

## Cambios de estado

Los cambios críticos nunca se realizarán mediante un botón simple.

Siempre utilizarán un control deslizable.

---

## Tiempo de operación

El administrador debe poder crear un servicio en menos de dos minutos.

---

## Pantalla de detalle

Toda la información necesaria para operar un servicio deberá encontrarse en una única pantalla.

---

# 8. Reglas Operativas

La asignación de colaboradores tendrá en cuenta:

* Disponibilidad.
* Próximo servicio asignado.
* Duración estimada del nuevo servicio.
* Tiempo de margen entre servicios.
* Especialidad del colaborador.
* Tipo de vehículo.

El sistema podrá advertir al administrador cuando una asignación pueda generar retrasos, pero la decisión final siempre será del administrador.

---

# 9. Funcionalidades Futuras

Quedan previstas para versiones posteriores:

* Seguimiento del colaborador en tiempo real.
* Mapa en tiempo real para el cliente.
* Compartir seguimiento mediante enlace.
* Firma digital.
* Códigos QR.
* Integración con calendarios.
* Inteligencia para sugerir automáticamente el mejor colaborador.
* Recomendación automática de hora de salida según el tráfico.
* Estimación dinámica de tiempos mediante APIs de navegación.

---

# Principio del módulo

El módulo de Servicios constituye el corazón operativo de ELARA Transport.

Toda decisión de diseño deberá priorizar:

* Rapidez de operación.
* Reducción de errores.
* Trazabilidad completa.
* Experiencia del cliente.
* Facilidad para administradores y colaboradores.
