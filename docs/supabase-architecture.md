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

## 5. Relaciones principales

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

## 6. Fuentes de verdad

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

## 7. Campos legacy que no migrarán como fuentes de verdad

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

Algunos de estos valores podrán transformarse durante el seed o conservarse como snapshots históricos solo cuando exista una razón de auditoría.

## 8. Datos mock y estrategia de seed

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

Los mocks no se copiarán literalmente a tablas.

## 9. Decisiones abiertas

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

## 10. Próximos dominios

- Servicios y asignaciones de servicio.
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
