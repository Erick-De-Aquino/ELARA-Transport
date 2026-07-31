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

## 6. Finanzas del servicio y pagos

El dominio financiero del servicio quedará separado del estado operativo. Un servicio podrá estar finalizado, cancelado o no realizado sin que eso altere por sí mismo su estado financiero; el cobro, la deuda, la facturación y la trazabilidad económica se resolverán desde tablas financieras específicas.

Tablas del dominio:

- `service_financials`: configuración financiera normalizada del servicio.
- `service_payment_methods`: catálogo controlado de métodos de pago.
- `service_payments`: pagos registrados contra servicios.
- `service_payment_events`: eventos append-only asociados a cada pago.
- `service_billing`: datos y estado de facturación del servicio.
- `service_financial_events`: eventos append-only de cambios financieros del servicio.

Fuentes de verdad aprobadas:

- Cada servicio tendrá una sola fila en `service_financials`.
- `service_financials` será la fuente de verdad de precio base, IVA configurado, total financiero y estado financiero materializado cuando se decida mantenerlo.
- `service_payments` será la fuente de verdad de los pagos.
- El importe pagado y el importe pendiente deberán validarse desde el total del servicio y los pagos activos.
- `service_payment_events` y `service_financial_events` serán append-only.
- Los campos financieros embebidos actuales no serán fuentes paralelas de verdad.

Configuración de precio e IVA:

- El IVA inicial del MVP será 0 %, con estructura preparada para cambios futuros.
- El precio base y el porcentaje de IVA deberán guardarse en `service_financials`.
- El total podrá guardarse como valor controlado o recalcularse desde base e IVA, según la decisión final de integridad financiera.
- Los cambios de precio deberán quedar auditados mediante eventos financieros.
- No se migrarán `price`, `payment`, `paidAmount` ni `pendingAmount` como fuentes paralelas.

Métodos de pago:

- El método activo inicial será `cash`.
- `bank_transfer` y `card` quedarán modelados, pero no activados todavía.
- `service_payment_methods` permitirá controlar disponibilidad, etiqueta visual y activación futura sin cambiar el modelo de pagos.

Pagos administrativos:

- Un cobro administrativo registrará un pago en `service_payments` con origen `administration`.
- Ese cobro deberá integrarse después con una entrada en Caja.
- La integración con Caja queda fuera de este dominio, pero la relación futura debe quedar trazable mediante referencias al pago y al servicio.
- La operación deberá prevenir duplicados mediante claves de idempotencia o referencias únicas cuando se diseñe la implementación.

Cobros del conductor:

- Un cobro del conductor registrará la recaudación asociada al servicio con origen `driver`.
- Ese cobro generará una obligación de rendición futura.
- No generará una entrada inmediata en Caja, porque el efectivo todavía no ha sido entregado físicamente a ELARA.
- La rendición se diseñará en el dominio de Caja y rendiciones.

Estados financieros:

- `undefined`
- `pending`
- `partial`
- `paid`
- `refunded`
- `uncollectible`

El estado financiero deberá validarse desde el total del servicio y los pagos activos, sin depender de importes legacy almacenados como fuente paralela.

Estados de pago:

- `registered`
- `annulled`
- `refunded`

Los pagos no se eliminarán. Se anularán o reembolsarán con trazabilidad, eventos append-only y referencias a usuario, contexto, fecha y motivo cuando corresponda.

Anulaciones y reembolsos:

- Una anulación no deberá borrar el pago original.
- Un reembolso no deberá sobrescribir el pago original.
- Los eventos de anulación y reembolso deberán quedar en `service_payment_events`.
- La reversión económica futura deberá coordinarse con Caja cuando el pago haya tenido impacto en efectivo.

Idempotencia:

- El código humano previsto para pagos será `PAY-000001`.
- La base de datos generará códigos humanos de forma transaccional segura.
- Los registros de pago deberán incluir un mecanismo de idempotencia o referencia única para evitar cobros duplicados.
- No se deberá permitir que una misma acción de cobro cree varios pagos activos equivalentes.

Facturación:

- `service_billing` almacenará el estado de facturación, referencia fiscal futura y snapshots mínimos necesarios.
- La facturación no será fuente de verdad del pago.
- Los datos históricos de cliente necesarios para facturas deberán conservarse como snapshot controlado.
- La generación documental, numeración fiscal definitiva y obligaciones tributarias quedan como decisiones abiertas.

Transformación de mocks:

- `service.financial` se transformará en `service_financials`.
- Los pagos embebidos se transformarán en `service_payments` y `service_payment_events`.
- Los datos de facturación mock se transformarán en `service_billing` solo si representan información funcional.
- `price`, `payment`, `paidAmount` y `pendingAmount` no se migrarán como fuentes de verdad.
- Los importes calculables se derivarán desde `service_financials` y `service_payments`.

Decisiones abiertas del dominio:

- Si se permitirán pagos parciales en la primera implementación Supabase.
- Si `service_financials.financial_status` será campo materializado validado o vista derivada.
- Regla exacta para modificar precio cuando ya existan pagos.
- Activación operativa futura de transferencia y tarjeta.
- Modelo definitivo de integración con Caja.
- Modelo definitivo de obligación de rendición del conductor.
- Reglas de reembolso parcial o total.
- Alcance fiscal de `service_billing` y numeración de facturas.
- Política RLS para que conductores vean solo pagos relacionados con sus servicios.

Diagrama textual:

```text
services
  └── 1 service_financials
          │
          ├── N service_payments ── 1 service_payment_methods
          │       └── N service_payment_events
          │
          ├── 0..1 service_billing
          └── N service_financial_events

service_financials = fuente de verdad de configuración financiera del servicio
service_payments = fuente de verdad de pagos
service_payment_events = historial append-only del pago
service_financial_events = historial append-only financiero del servicio
```

## 7. Caja, rendiciones y arqueos

El dominio de Caja representará una única Caja física consolidada para ELARA. Caja no duplicará ingresos, deudas ni pagos de otros dominios; registrará únicamente movimientos de efectivo físico y sus reversiónes trazables.

Tablas del dominio:

- `cash_boxes`: caja física consolidada.
- `cash_movement_categories`: catálogo de categorías de movimientos.
- `cash_movements`: movimientos de entrada, salida, ajuste y reversión.
- `driver_remittances`: entregas de efectivo realizadas por conductores.
- `driver_remittance_differences`: diferencias detectadas en rendiciones.
- `cash_counts`: arqueos de Caja.
- `cash_count_events`: eventos append-only de arqueos.
- `cash_movement_events`: eventos append-only de movimientos.

Decisiones fijadas:

- Existe una única Caja física consolidada.
- `cash_movements` será la fuente de verdad de Caja.
- El saldo teórico se derivará de movimientos válidos.
- Los importes se almacenarán siempre positivos.
- `movement_type` determinará si el movimiento suma o resta.
- Ningún movimiento financiero se eliminará.
- Toda reversión creará un movimiento inverso vinculado al movimiento original.
- El cobro administrativo generará entrada inmediata en Caja.
- El cobro del conductor no entrará en Caja hasta la rendición.
- Una rendición válida generará una entrada en Caja.
- Las diferencias no modificarán Caja automáticamente.
- Los ajustes manuales requerirán justificación y permiso de Superadmin.
- Los arqueos cerrados no se reabrirán.
- Cualquier corrección posterior requerirá nuevo arqueo o ajuste auditado.
- Las integraciones usarán `idempotency_key`.

Códigos humanos previstos:

- `CASH-000001` para movimientos de Caja.
- `REM-000001` para rendiciones.
- `DIF-000001` para diferencias.
- `ARC-000001` para arqueos.

Fuentes de verdad:

- `cash_boxes`: identidad de la Caja física única.
- `cash_movements`: movimientos válidos y saldo teórico derivado.
- `driver_remittances`: entregas de efectivo por conductor.
- `driver_remittance_differences`: diferencias de rendición.
- `cash_counts`: arqueos.
- `cash_movement_events`: trazabilidad append-only de movimientos.
- `cash_count_events`: trazabilidad append-only de arqueos.

Movimientos de Caja:

- `inflow`: entrada de efectivo.
- `outflow`: salida de efectivo.
- `adjustment`: ajuste manual justificado.
- `reversal`: movimiento inverso vinculado a uno anterior.

Cada movimiento deberá incluir importe positivo, moneda, fecha operativa, usuario registrador, contexto activo, categoría, estado, origen y, cuando corresponda, motivo u observaciones.

Estados de movimiento:

- `registered`
- `annulled`
- `reversed`

La anulación o reversión no borrará el movimiento original. La corrección financiera se hará con trazabilidad, evento y movimiento inverso si corresponde.

Rendiciones:

- Una rendición representa efectivo entregado por un conductor.
- Puede cubrir total o parcialmente obligaciones de rendición.
- Una rendición parcial no genera diferencia por sí sola.
- Una sobrerendición deberá quedar registrada y señalada como inconsistencia o diferencia administrativa, sin autocorrección de datos.
- Una rendición válida generará una entrada en `cash_movements`.
- Una rendición anulada conservará su registro y deberá quedar vinculada a la reversión de Caja correspondiente si ya impactó el saldo.

Diferencias:

- Las diferencias se registrarán en `driver_remittance_differences`.
- No modificarán Caja automáticamente.
- Podrán originar un ajuste manual posterior si lo aprueba un Superadmin.
- Deberán conservar conductor, importe esperado, importe rendido, diferencia, motivo, estado y auditoría.

Arqueos:

- `cash_counts` comparará saldo teórico con importe contado.
- El saldo teórico se calculará desde `cash_movements` válidos.
- El importe contado será el dato observado en el arqueo.
- La diferencia no modificará el saldo por sí misma.
- Un arqueo cerrado no se reabrirá.
- Cualquier corrección posterior se registrará mediante nuevo arqueo o ajuste auditado.

Idempotencia:

- Las integraciones con otros dominios deberán enviar o generar `idempotency_key`.
- No deberá existir más de un movimiento activo para la misma operación origen.
- Una reversión deberá vincularse al movimiento original y evitar duplicidades.
- El registro de rendiciones, ajustes y arqueos deberá ser resistente a dobles envíos del navegador.

Relaciones polimórficas:

- `cash_movements` usará `source_type` y `source_id` para identificar el origen funcional.
- Se podrán añadir referencias específicas cuando el dominio lo requiera, por ejemplo `service_payment_id`, `receivable_payment_id`, `expense_id`, `settlement_id` o `remittance_id`.
- La ventaja es mantener una Caja única integrable con varios dominios.
- El riesgo es que las claves polimórficas no garantizan integridad por sí solas; deberán reforzarse con funciones seguras, checks de dominio e integridades periódicas.

Puntos de integración:

- Pagos administrativos de servicios: entrada inmediata.
- Pagos de cuentas por cobrar: entrada inmediata.
- Gastos: salida o reversión según el flujo.
- Liquidaciones: salida por pago a conductor o colaborador.
- Rendiciones: entrada al entregar efectivo recaudado por conductor.
- Diferencias: registro administrativo, sin impacto automático.
- Ajustes: movimiento manual justificado.
- Anulaciones: movimiento inverso vinculado al original.

Datos derivados que no deberán almacenarse como fuentes paralelas:

- saldo actual;
- saldo por día;
- total de entradas;
- total de salidas;
- total rendido por conductor;
- pendiente de rendir;
- diferencia agregada;
- métricas de Caja;
- contadores de arqueos o movimientos.

Transformación de mocks:

- Los movimientos mock se transformarán en `cash_movements` y `cash_movement_events`.
- Las categorías visibles se normalizarán en `cash_movement_categories`.
- Las rendiciones mock se transformarán en `driver_remittances`.
- Las diferencias mock se transformarán en `driver_remittance_differences`.
- Los arqueos mock se transformarán en `cash_counts` y `cash_count_events`.
- Los saldos, totales y resúmenes mock no se migrarán como fuentes de verdad.
- Las referencias legacy a servicios, pagos, gastos o liquidaciones se transformarán en `source_type`, `source_id` y referencias específicas cuando existan.

Decisiones abiertas del dominio:

- Catálogo final de categorías de Caja.
- Si el saldo teórico se expondrá mediante vista derivada o función segura.
- Reglas exactas para sobrerendición y autorización.
- Estados finales de diferencias y su flujo de resolución.
- Nivel de detalle de denominaciones en arqueos.
- Diseño final de ajustes manuales y límites por rol.
- Validación final de relaciones polimórficas por base de datos.
- Integración definitiva con Cuentas por cobrar, Gastos y Liquidaciones.
- Políticas RLS para visualizar y registrar movimientos sensibles.

Diagrama textual:

```text
cash_boxes
  └── N cash_movements ── 1 cash_movement_categories
          ├── N cash_movement_events
          ├── 0..1 driver_remittances ── 1 drivers
          └── 0..1 reversal_of_movement

drivers
  ├── N driver_remittances
  └── N driver_remittance_differences

cash_boxes
  └── N cash_counts
          └── N cash_count_events

cash_movements.source_type/source_id
  ├── service_payment
  ├── receivable_payment
  ├── expense
  ├── settlement
  ├── remittance
  ├── difference
  └── adjustment

cash_movements = fuente de verdad de movimientos
saldo teórico = derivado de movimientos válidos
```

## 8. Relaciones principales

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

## 9. Fuentes de verdad

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
- `service_financials`: configuración financiera del servicio.
- `service_payment_methods`: catálogo controlado de métodos de pago.
- `service_payments`: pagos del servicio.
- `service_payment_events`: eventos append-only de pagos.
- `service_billing`: facturación del servicio.
- `service_financial_events`: eventos financieros append-only.
- `cash_boxes`: Caja física consolidada.
- `cash_movements`: movimientos de Caja y saldo teórico derivado.
- `cash_movement_categories`: categorías de movimientos.
- `driver_remittances`: entregas de efectivo por conductor.
- `driver_remittance_differences`: diferencias de rendición.
- `cash_counts`: arqueos.
- `cash_movement_events`: eventos append-only de movimientos de Caja.
- `cash_count_events`: eventos append-only de arqueos.

## 10. Campos legacy que no migrarán como fuentes de verdad

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
- `services.price`
- `services.payment`
- `service.financial.paidAmount`
- `service.financial.pendingAmount`
- saldos mock de Caja
- resúmenes manuales de Caja
- totales rendidos calculables
- pendientes de rendición calculables
- diferencias agregadas calculables

Algunos de estos valores podrán transformarse durante el seed o conservarse como snapshots históricos solo cuando exista una razón de auditoría.

## 11. Datos mock y estrategia de seed

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
- se transformarán datos financieros mock en `service_financials`, `service_payments`, `service_payment_events`, `service_billing` y eventos financieros cuando corresponda.
- se transformarán movimientos, rendiciones, diferencias y arqueos mock en las tablas de Caja, sin migrar saldos ni métricas como verdad.

Los mocks no se copiarán literalmente a tablas.

## 12. Decisiones abiertas

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

Decisiones pendientes del dominio de finanzas del servicio:

- Alcance inicial de pagos parciales.
- Materialización o derivación del estado financiero.
- Reglas de modificación de precio con pagos existentes.
- Activación futura de transferencia y tarjeta.
- Integración definitiva con Caja.
- Modelo de obligación de rendición por cobro del conductor.
- Reglas completas de reembolsos.
- Alcance fiscal de facturación y numeración.
- RLS sobre pagos visibles para conductores.

Decisiones pendientes del dominio de Caja:

- Catálogo final de categorías.
- Exposición del saldo teórico mediante vista derivada o función segura.
- Reglas definitivas de sobrerendición.
- Flujo completo de resolución de diferencias.
- Denominaciones en arqueos.
- Límites y permisos de ajustes manuales.
- Validación final de relaciones polimórficas.
- Integración detallada con Cuentas por cobrar, Gastos y Liquidaciones.
- RLS sobre movimientos, rendiciones y arqueos.

## 13. Próximos dominios

- Cuentas por cobrar.
- Gastos.
- Liquidaciones.
- Incidencias y auditoría.
- Configuración.
- RLS completo.
- Migraciones SQL.
- Seed.
