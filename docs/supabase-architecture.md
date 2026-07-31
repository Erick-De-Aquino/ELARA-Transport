# Arquitectura Supabase — ELARA Transport V4.0

## 1. Estado del documento

- Fecha: 31/07/2026.
- Fase: diseño previo a implementación.
- Este documento consolida decisiones aprobadas para la futura migración a Supabase.
- Todavía no se ha creado ninguna tabla.
- Todavía no se ha conectado ELARA Transport a Supabase.
- Todavía no se han escrito migraciones SQL.

## 2. Principios generales

- Todas las entidades principales usarán UUID interno como clave primaria.
- Se conservarán códigos humanos visibles para operación diaria.
- Los códigos humanos serán generados por la base de datos mediante una función transaccional segura, nunca por el navegador.
- Los registros con historial operativo no se eliminarán físicamente; se aplicará inactivación o soft delete.
- Los estados técnicos serán estables y estarán separados de las etiquetas visuales.
- RLS y permisos deberán validarse en backend mediante usuario autenticado, sesión, contexto activo y roles activos.
- No se confiará en `localStorage`, parámetros enviados por el navegador, `user_metadata` ni campos de rol mantenidos solo en frontend.
- Los datos mock actuales podrán utilizarse como base para seed de desarrollo, pero deberán transformarse.
- No se copiarán literalmente los mocks a tablas.
- No se almacenarán campos derivados cuando puedan calcularse desde fuentes centrales.

## 3. Identidad, usuarios, roles y sesiones

`persons` será la identidad humana central. Una persona podrá tener simultáneamente cuenta de usuario, perfil de cliente particular, perfil de conductor y relación como contacto de una o varias empresas.

Una persona tendrá como máximo un `app_user` y un perfil `driver`. Los cambios históricos se conservarán mediante estados, fechas y auditoría, no creando perfiles duplicados.

`app_users` representará el usuario funcional de ELARA y estará asociado a `auth.users`. La autenticación dependerá de `auth.users`; las contraseñas nunca se almacenarán en tablas públicas.

Los roles actuales son:

- `superadmin`
- `administrativo`
- `conductor`

Los usuarios podrán tener múltiples roles mediante `user_roles`. Los permisos efectivos dependerán exclusivamente del contexto activo.

`default_context` se guardará directamente en `app_users`. Debe pertenecer a los roles activos del usuario.

`active_context` no se guardará globalmente en `app_users`, porque un usuario puede tener sesiones abiertas en dispositivos distintos. Se guardará por sesión en `app_sessions`, asociada a:

- `auth_user_id`
- `app_user_id`
- identificador de sesión de Supabase
- `active_context`
- fechas de creación, actualización y expiración

El cambio de contexto deberá comprobar que el usuario posee el rol activo correspondiente, actualizar únicamente la sesión actual e impedir que una sesión seleccione un contexto no asignado.

Las políticas RLS y funciones seguras deberán resolver el contexto activo mediante usuario autenticado, identificador de la sesión actual, registro válido en `app_sessions` y roles activos en `user_roles`.

La protección del último Superadmin deberá realizarse en la base de datos mediante una función o trigger transaccional, no solo desde la interfaz.

`user_driver_links` conservará la trazabilidad histórica entre usuario y conductor:

- un solo vínculo activo por usuario;
- un solo vínculo activo por conductor;
- fechas de inicio y finalización;
- estado activo o inactivo.

Los códigos humanos aprobados para este dominio son:

- `USR-000001` para usuarios.
- `CL-000001` para clientes particulares.
- `EMP-000001` para clientes empresa.
- `DRV-000001` para conductores.

`customers` representará la relación comercial con ELARA:

- cliente particular: tendrá `person_id`;
- cliente empresa: tendrá `company_id`;
- nunca podrá tener ambos;
- siempre deberá tener exactamente uno de ellos.

El código comercial del cliente estará únicamente en `customers.human_code`. `companies` no tendrá un segundo código humano duplicado.

Los conductores usarán `driver_type`:

- `internal_driver` para Chofer.
- `external_collaborator` para Colaborador.

`driver_type` no es un rol de autenticación y no debe depender del prefijo del código.

Los tres choferes internos actuales serán:

- Erick De Aquino.
- Roner De Aquino.
- Angely Hernandez.

El resto de conductores se clasificará como `external_collaborator`.

## 4. Vehículos

`vehicles` será la entidad principal del vehículo, con UUID interno y código humano visible `VEH-000001`.

La titularidad tendrá valores técnicos separados de la etiqueta visual:

- `owned` para propio.
- `external` para externo.

Los vehículos externos podrán requerir aprobación ELARA. Los propietarios externos, cuando corresponda, se modelarán mediante `vehicle_external_owners`.

La documentación se modelará con:

- `vehicle_document_types`
- `vehicle_documents`

La documentación mínima será:

- seguro;
- ITV;
- permiso de circulación;
- licencia VTC.

`vehicle_documents` será la fuente de verdad documental. El estado documental global del vehículo se calculará desde sus documentos activos.

El estado operativo y el estado documental son conceptos separados. El estado operativo deberá considerar:

- estado manual;
- documentación;
- mantenimiento;
- avería;
- bloqueo;
- aprobación ELARA para vehículos externos.

Las reglas aprobadas de asignabilidad son:

- documentación vencida o pendiente implica vehículo inoperativo;
- taller, avería o bloqueo implica vehículo inoperativo;
- asignable = operativo + documentación al día o próxima a vencer;
- vehículo inoperativo asignado solo permite quitar asignación;
- vehículo inoperativo sin asignar no permite asignación.

`driver_vehicle_assignments` será la fuente de verdad para la asignación conductor-vehículo. La relación actual `collaborator.vehicleId` del MVP será transformada en una asignación activa con historial.

Los campos legacy `assignedCollaboratorId`, `assignedCollaboratorName` y `driver` no se convertirán en una segunda fuente de verdad.

La asignación deberá cumplir:

- una sola asignación activa por vehículo;
- una sola asignación activa por conductor, salvo decisión expresa futura;
- reasignación mediante cierre de la asignación anterior y creación de una nueva;
- retirada mediante cierre de la asignación activa;
- conservación completa del historial.

El kilometraje se modelará con `vehicle_odometer_readings`. El kilometraje actual deberá derivarse de la última lectura válida o mantenerse como caché controlada por base de datos si se decide más adelante.

El mantenimiento se modelará con `vehicle_maintenance_records`, incluyendo revisiones, taller, próximas fechas o kilómetros y estado del registro.

La matrícula española se normalizará con:

- formato visible `0000-MMM`;
- cuatro números;
- tres consonantes válidas;
- exclusión de vocales, Ñ y Q.

Se conservará valor original y valor normalizado. Para vehículos futuros con matrícula extranjera deberá contemplarse país y formato, sin cerrar la arquitectura solo a España.

## 5. Servicios y asignaciones operativas

`services` será la entidad operativa central del sistema. Representará una reserva programada de transporte contratada por un cliente y ejecutada, cuando corresponda, por un conductor y un vehículo.

Cada servicio tendrá UUID interno y código humano visible con formato `SRV-000001`, generado por la base de datos mediante una función transaccional segura.

Tablas del dominio:

- `services`: servicio central, cliente contratante, tipo de servicio, fecha/hora programada y estado operativo.
- `service_locations`: origen, destino y paradas ordenadas.
- `service_passengers`: pasajeros del servicio, registrados o no como personas del sistema.
- `service_assignments`: historial de asignaciones de conductor y vehículo.
- `service_driver_progress`: etapa actual de ejecución desde el Portal conductor.
- `service_closures`: cierre finalizado, no show o no realizado.
- `service_cancellations`: cancelaciones del servicio.
- `service_status_history`: historial append-only de cambios de estado operativo.
- `service_events`: bitácora operativa append-only.
- `service_snapshots`: snapshots históricos mínimos para auditoría.

Fuentes de verdad aprobadas:

- `services.operational_status` será la fuente de verdad del estado operativo.
- `service_assignments.assignment_status` será la fuente de verdad de asignación, aceptación y rechazo.
- `service_driver_progress.stage` será la fuente de verdad de la etapa actual del conductor.
- Los historiales y eventos serán append-only.
- Los campos financieros quedan fuera de este dominio.
- Los nombres, matrículas y etiquetas visuales no serán fuentes de verdad.

Estados operativos técnicos:

- `pending`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `no_show`
- `not_performed`

Estados visuales o derivados:

- por asignar;
- por aceptar;
- confirmado;
- en curso;
- reasignación requerida.

Estos estados visuales no deberán almacenarse como fuente de verdad. Se calcularán desde `services.operational_status` y `service_assignments.assignment_status`.

Estados de asignación:

- `pending_acceptance`
- `accepted`
- `rejected`
- `ended`
- `cancelled`
- `reassignment_required`

Etapas del conductor:

- `not_started`
- `on_way`
- `waiting_passenger`
- `passenger_on_board`
- `finishing`
- `finished`

Reglas de asignación:

- La asignación deberá validar la relación conductor-vehículo contra `driver_vehicle_assignments`.
- No podrá existir más de una asignación activa por servicio.
- Asignar creará una fila en `service_assignments`.
- Reasignar cerrará la asignación anterior y creará una nueva.
- Rechazar conservará la asignación rechazada y dejará trazabilidad.
- Aceptar solo podrá hacerlo el conductor vinculado a la asignación y con contexto autorizado.
- Un servicio confirmado futuro no pone al conductor en servicio.
- El conductor solo estará “En servicio” cuando exista ejecución activa.

Reglas de inicio, avance y cierre:

- Iniciar requiere servicio asignado, asignación aceptada, conductor correcto, usuario conductor activo y vehículo válido.
- Al iniciar, `services.operational_status` pasa a `in_progress`.
- Las etapas del Portal conductor avanzan mediante `service_driver_progress.stage`.
- Cada avance relevante deberá registrar un evento operativo.
- Finalizar creará un registro en `service_closures`, cerrará el progreso y cambiará el estado operativo a `completed`.
- No show y no realizado también se registrarán en `service_closures` y cambiarán el estado operativo a `no_show` o `not_performed`.

Reglas de cancelación:

- Cancelar creará un registro en `service_cancellations`.
- La cancelación cambiará `services.operational_status` a `cancelled`.
- Si existe asignación activa, deberá cerrarse.
- El servicio no se eliminará físicamente.

Snapshots históricos mínimos:

- Cliente: identificador, código humano, tipo y nombre visible al momento operativo.
- Pasajero: nombre mostrado, contacto operativo y notas relevantes.
- Conductor: identificador, código humano, nombre visible y `driver_type`.
- Vehículo: identificador, código humano, matrícula, marca y modelo.
- Ruta: origen, destino, paradas ordenadas y fecha/hora programada.

Los snapshots no reemplazarán las relaciones vivas; servirán para auditoría si los datos maestros cambian.

Campos derivados que no deberán almacenarse como fuente de verdad:

- etiqueta visual del estado;
- `por asignar`, `por aceptar` y `reasignación requerida`;
- nombre del cliente;
- nombre del conductor;
- marca/modelo del vehículo como relación viva;
- matrícula duplicada como verdad;
- conductor “En servicio”;
- próximo servicio de cliente o conductor;
- contador de servicios;
- estado financiero;
- importes cobrados o pendientes;
- disponibilidad efectiva del conductor;
- asignabilidad del vehículo.

Transformación de mocks:

- `serviceId` se transformará en `services.human_code`.
- `status` se normalizará a `services.operational_status`.
- `date` y `time` se transformarán en fecha/hora programada.
- `customerCode` se transformará en `customer_id`.
- `origin`, `destination` y paradas se transformarán en `service_locations`.
- Datos de pasajero se transformarán en `service_passengers`.
- `collaboratorId` y `vehicleId` se transformarán en `service_assignments`.
- `assignmentStatus` se transformará en `service_assignments.assignment_status`.
- `closing`, `closedAt`, `closureType` y campos de motivo se transformarán en `service_closures`.
- `client`, `customerType`, `collaborator`, `vehicle`, `plate`, `action`, `payment`, `price`, `financial` y `billing` no serán fuentes de verdad en este dominio.

Decisiones abiertas del dominio:

- Catálogo final de tipos de servicio.
- Si la primera versión normalizada permitirá múltiples pasajeros por servicio.
- Si origen, destino y paradas serán texto libre o direcciones normalizadas con geocoding futuro.
- Si una asignación aceptada debe cambiar siempre el servicio a `confirmed`.
- Cómo modelar exactamente `reassignment_required`: estado derivado o estado de asignación.
- Reglas de un futuro flujo de emergencia para cambios durante `in_progress`.
- Si `service_driver_progress` guardará solo estado actual o también historial; la decisión actual conserva historial mediante eventos append-only.
- Si snapshots viven en tabla genérica o en estructuras específicas asociadas a eventos/asignaciones.
- Coordinación futura con Finanzas para no mezclar precio, cobro ni facturación en este dominio.
- Políticas RLS para que el conductor vea y opere solo servicios propios.

Diagrama textual:

```text
customers
  └── N services
          │
          ├── N service_locations
          │       ├── origin
          │       ├── destination
          │       └── stops
          │
          ├── N service_passengers
          │
          ├── N service_assignments
          │       ├── 1 drivers
          │       ├── 1 vehicles
          │       └── 0..1 driver_vehicle_assignments
          │
          ├── 0..1 service_driver_progress
          ├── 0..1 service_closures
          ├── 0..1 service_cancellations
          ├── N service_status_history
          ├── N service_events
          └── N service_snapshots

services.operational_status = fuente de verdad del estado operativo
service_assignments.assignment_status = fuente de verdad de asignación y aceptación
service_driver_progress.stage = fuente de verdad de etapa actual
```

## 6. Relaciones principales

Dominio de identidad:

```text
auth.users
  1 ── 0..1 app_users
          │
          ├── N user_roles ── 1 roles
          │
          ├── N app_sessions
          │
          └── N user_driver_links ── 1 drivers
                                      │
persons ─────────────────────────────┘
  │
  ├── 0..1 app_users
  ├── 0..1 drivers
  ├── 0..1 customers (individual)
  └── N company_contacts ── 1 companies ── 0..1 customers (company)

customers
  ├── exactly one person_id for individual
  └── exactly one company_id for company
```

Dominio de vehículos:

```text
vehicle_external_owners
  ├── 0..1 persons
  └── 0..1 companies
        │
        └── N vehicles
              │
              ├── N vehicle_documents ── 1 vehicle_document_types
              ├── N vehicle_technical_incidents ── 1 vehicle_status_reasons
              ├── N vehicle_maintenance_records
              ├── N vehicle_odometer_readings
              └── N driver_vehicle_assignments ── 1 drivers

drivers
  └── N driver_vehicle_assignments

Asignación activa:
driver_vehicle_assignments.status = active
and ended_at is null
```

## 7. Fuentes de verdad

- `auth.users`: autenticación.
- `persons`: identidad humana central.
- `app_users`: perfil funcional de usuario de ELARA.
- `user_roles`: roles activos e históricos del usuario.
- `app_sessions`: contexto activo por sesión.
- `user_driver_links`: vínculo usuario-conductor.
- `customers`: relación comercial con ELARA.
- `companies`: entidad empresa.
- `company_contacts`: personas asociadas a empresas.
- `drivers`: perfil operativo de conductor interno o colaborador externo.
- `driver_vehicle_assignments`: asignación conductor-vehículo.
- `vehicle_documents`: documentación del vehículo.
- `vehicle_odometer_readings`: kilometraje.
- `vehicle_maintenance_records`: mantenimiento.
- `vehicle_technical_incidents`: incidencias técnicas o causas de inactividad.
- `services`: estado operativo del servicio.
- `service_assignments`: asignación, aceptación y rechazo.
- `service_driver_progress`: etapa actual de ejecución.
- `service_status_history`: historial append-only de estados.
- `service_events`: eventos operativos append-only.

## 8. Campos legacy que no migrarán como fuentes de verdad

No deberán migrarse como fuentes de verdad:

- `users.role`
- `activeContext` global
- contraseñas mock
- `drivers.vehicleId`
- `assignedCollaboratorId`
- `assignedCollaboratorName`
- `vehicle.driver`
- `documentationStatus` almacenado
- `operationalStatus` derivable
- nombres completos derivados
- resúmenes duplicados
- próximos servicios legacy
- totales calculables desde relaciones
- `services.client`
- `services.customerType`
- `services.collaborator`
- `services.vehicle`
- `services.plate`
- `services.action`
- etiquetas visuales de estado de servicio
- campos financieros embebidos en el servicio para este dominio

Algunos de estos valores podrán transformarse durante el seed o conservarse como snapshots históricos solo cuando exista una razón de auditoría.

## 9. Datos mock y estrategia de seed

Los datos ficticios actuales se transformarán antes de cargarse como seed de desarrollo.

Durante la transformación:

- recibirán UUID internos;
- conservarán códigos humanos adaptados;
- no se migrarán contraseñas mock;
- no se migrarán campos derivados como fuente de verdad;
- se eliminarán duplicados conceptuales;
- se convertirán relaciones legacy en relaciones normalizadas;
- se transformará `collaborator.vehicleId` en `driver_vehicle_assignments`;
- se transformarán documentos embebidos en `vehicle_documents`;
- se transformará el kilometraje en `vehicle_odometer_readings`;
- se transformará mantenimiento embebido en `vehicle_maintenance_records`.
- se transformarán servicios mock en `services`, `service_locations`, `service_passengers`, `service_assignments`, cierres, cancelaciones, eventos y snapshots mínimos.

Los mocks no se copiarán literalmente a tablas.

## 10. Decisiones abiertas

Decisiones pendientes del dominio de identidad:

- Cómo obtener de forma fiable el identificador de sesión Supabase dentro de funciones y RLS.
- Si se necesitará una Edge Function para crear o actualizar `app_sessions`.
- Estrategia exacta para invalidar sesiones cuando se revocan roles.
- Si `roles.id` será UUID o `key` textual como clave primaria.
- Si `customers` permitirá múltiples relaciones históricas para la misma persona o empresa, o solo una activa.
- Catálogo final de estados técnicos en inglés frente a etiquetas españolas.
- Modelo común de auditoría: columnas por tabla o tabla global de eventos.
- Si `person.contact_email` será único opcional o permitirá duplicados.
- Cómo migrar nombres actuales sin almacenar `full_name`.
- Si `settlement_config` en `drivers` será JSON inicial o tabla normalizada en un dominio posterior.

Decisiones pendientes del dominio de vehículos:

- Si `vtc_license` siempre aplicará a todos los vehículos.
- Si vehículos externos podrán existir sin propietario normalizado.
- Si `vehicles.current_km` será caché o solo vista derivada.
- Si la matrícula será única global o solo entre vehículos activos.
- Catálogo final de causas bloqueantes.
- Si la aprobación ELARA será campo en `vehicles` o tabla de revisiones.
- Si un conductor podrá tener más de un vehículo activo en futuros escenarios.
- Política RLS para documentación sensible y archivos.
- Diseño de Storage para documentos: bucket, ruta, acceso y caducidad de URLs.
- Coordinación con el futuro dominio Servicios para impedir asignaciones a vehículos no asignables.

Decisiones pendientes del dominio de servicios:

- Catálogo final de tipos de servicio.
- Alcance inicial de múltiples pasajeros por servicio.
- Modelo final de direcciones y geocoding.
- Regla definitiva para pasar de asignación aceptada a servicio confirmado.
- Representación final de reasignación requerida.
- Diseño futuro del flujo de emergencia durante servicios en curso.
- Ubicación definitiva de snapshots históricos.
- RLS para operación exclusiva de servicios propios por conductor.

## 11. Próximos dominios

- Finanzas del servicio.
- Caja y rendiciones.
- Cuentas por cobrar.
- Gastos.
- Liquidaciones.
- Incidencias y auditoría.
- Configuración.
- RLS completo.
- Migraciones SQL.
- Seed.
