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

## 8. Cuentas por cobrar

El dominio de Cuentas por cobrar representará servicios finalizados que mantienen saldo pendiente válido. No será una deuda independiente del servicio: reflejará una obligación de cobro derivada de `service_financials` y se cerrará mediante un cobro completo conectado con `service_payments` y `cash_movements`.

Tablas del dominio:

- `receivables`: cuenta por cobrar asociada a un servicio.
- `receivable_payments`: cobros posteriores registrados contra una cuenta.
- `receivable_events`: eventos append-only de creación, reconciliación, cobro, anulación y cambios de estado.

Decisiones fijadas:

- Solo se creará CxC para servicios finalizados con saldo pendiente válido.
- No se creará CxC para servicios cancelados, no show ni no realizados.
- Solo podrá existir una cuenta activa por servicio.
- En esta primera versión, el cobro será completo, no parcial.
- `receivables` será la fuente de verdad de la cuenta.
- `receivable_payments` será la fuente de verdad del cobro posterior.
- Todo cobro deberá crear de forma atómica `receivable_payment`, `service_payment`, entrada en `cash_movements`, actualización de `receivable` y actualización de `service_financials`.
- La anulación solo podrá realizarla Superadmin.
- La anulación deberá anular el `receivable_payment`, revertir el `service_payment`, crear movimiento inverso en Caja, devolver la cuenta a `pending` y restaurar el estado financiero del servicio.
- No se eliminarán registros.
- La reconciliación deberá ser idempotente.
- Los permisos dependerán del `active_context` de la sesión.
- El conductor no tendrá acceso a CxC.

Códigos humanos previstos:

- `REC-000001` para cuentas por cobrar.
- `RCP-000001` para cobros de cuentas por cobrar.

Estados de cuenta:

- `pending`
- `collected`
- `annulled`

Estados de cobro:

- `registered`
- `annulled`

Método inicial:

- `cash`

Origen desde servicios finalizados:

- La cuenta nacerá desde un servicio existente.
- El servicio deberá estar finalizado.
- El servicio no podrá estar cancelado, no show ni no realizado.
- El cliente deberá ser válido.
- `service_financials` deberá indicar saldo pendiente válido.
- No deberá existir otra cuenta activa para el mismo servicio.

Saldo original y pendiente:

- `receivables.original_amount` conservará el importe pendiente original al crear la cuenta.
- `receivables.pending_amount` representará el saldo pendiente de la cuenta.
- Mientras la cuenta esté `pending`, `pending_amount` deberá ser mayor que cero.
- Al cobrar, `pending_amount` pasará a cero.
- Al anular el cobro, `pending_amount` volverá al importe original.
- Las métricas y totales agregados se derivarán, no se almacenarán como fuente paralela.

Reconciliación idempotente:

- La reconciliación revisará servicios finalizados con saldo pendiente.
- Creará una cuenta solo si no existe una cuenta activa para ese `service_id`.
- No duplicará cuentas al ejecutarse varias veces.
- No recreará automáticamente una cuenta anulada sin una regla explícita.
- No modificará cuentas ya cobradas salvo decisión futura controlada.
- Podrá actualizar snapshots no financieros mientras la cuenta siga pendiente.

Cobro completo:

- El importe cobrado deberá coincidir exactamente con `pending_amount`.
- No se permitirán pagos parciales en esta primera versión.
- El cobro deberá registrar un `receivable_payment`.
- El cobro deberá crear un `service_payment` asociado al servicio.
- El cobro deberá crear una entrada en `cash_movements`.
- El cobro deberá cambiar `receivables.status` a `collected`.
- El cobro deberá actualizar `service_financials` para reflejar el servicio cobrado.

Integración con `service_payments`:

- `service_payments` seguirá siendo la fuente de verdad de pagos del servicio.
- El pago de CxC deberá crear o vincular un pago de servicio.
- El estado financiero del servicio deberá validarse desde total financiero y pagos activos.
- La anulación del cobro deberá revertir el pago de servicio asociado sin eliminarlo.

Integración con `service_financials`:

- La cuenta se origina desde el saldo pendiente de `service_financials`.
- Al cobrar, el estado financiero deberá quedar como cobrado o pagado según el catálogo final.
- Al anular, el estado financiero deberá volver a pendiente.
- No se alterará precio, IVA, total financiero ni estado operativo del servicio.

Integración con `cash_movements`:

- El cobro de CxC generará una entrada en Caja.
- La entrada tendrá origen trazable hacia `receivable_payment`, `receivable` y `service`.
- La anulación generará un movimiento inverso de Caja vinculado al movimiento original.
- `cash_movements` seguirá siendo la fuente de verdad de Caja.

Anulación:

- Solo Superadmin podrá anular un cobro.
- La anulación requerirá motivo.
- No se eliminará el cobro original.
- El `receivable_payment` quedará `annulled`.
- El `service_payment` asociado quedará revertido o anulado según el catálogo final de pagos.
- La Caja registrará un movimiento inverso.
- La cuenta volverá a `pending`.
- `service_financials` volverá a pendiente.

Permisos:

- Superadmin: ver CxC, registrar cobros y anular cobros.
- Administrativo: ver CxC y registrar cobros.
- Conductor: sin acceso a CxC.

Los permisos efectivos dependerán del `active_context` de la sesión, no de la suma de roles asignados al usuario.

Métricas derivadas:

- Importe pendiente: suma de `pending_amount` de cuentas `pending`.
- Servicios pendientes: cantidad de cuentas `pending`.
- Clientes con deuda: clientes únicos con cuentas `pending`.
- Total cobrado: suma de `receivable_payments` con estado `registered`.
- Cobros registrados: cantidad de `receivable_payments` con estado `registered`.

Datos derivados que no deberán almacenarse como fuentes paralelas:

- métricas superiores;
- saldo total por cliente;
- contadores por estado;
- estado visual;
- nombre vivo del cliente;
- nombre vivo del servicio;
- importe cobrado agregado;
- importe pendiente agregado;
- resúmenes mock.

Transformación de mocks:

- Las cuentas REC mock se transformarán en `receivables`.
- Los cobros RCP mock se transformarán en `receivable_payments`.
- Los eventos relevantes se transformarán en `receivable_events`.
- Las referencias a servicio, cliente, pago de servicio y Caja se normalizarán mediante relaciones.
- Las métricas, resúmenes y totales visibles no se migrarán como fuentes de verdad.
- Los snapshots de cliente o servicio solo se conservarán cuando tengan valor de auditoría.

Decisiones abiertas del dominio:

- Regla para cuentas anuladas si el servicio vuelve a quedar pendiente.
- Catálogo final de estados financieros compartidos con `service_financials`.
- Activación futura de métodos distintos de `cash`.
- Alcance de snapshots históricos de cliente y servicio.
- Nivel de atomicidad entre CxC, pagos de servicio y Caja.
- Validación final de integridad entre `receivable_payment`, `service_payment` y `cash_movement`.
- Políticas RLS para lectura y operación administrativa.

Diagrama textual:

```text
services
  └── 1 service_financials
          └── 0..1 receivables
                    ├── N receivable_events
                    └── N receivable_payments
                              ├── 1 service_payments
                              ├── 1 cash_movements
                              └── 0..1 reversal_cash_movement

customers
  └── N receivables

receivables = fuente de verdad de la cuenta
receivable_payments = fuente de verdad del cobro posterior
service_payments = fuente de verdad de pagos de servicio
cash_movements = fuente de verdad de Caja
```

## 9. Gastos

El dominio de Gastos representará costes operativos de ELARA y solicitudes declaradas desde el Portal conductor. Una solicitud del conductor no será un gasto aprobado hasta superar revisión administrativa.

Tablas del dominio:

- `expense_categories`: catálogo de categorías de gasto.
- `suppliers`: proveedores vinculables a gastos.
- `expenses`: entidad central del gasto o solicitud.
- `expense_receipts`: metadatos de justificantes y rutas futuras de Storage.
- `expense_reviews`: decisiones administrativas de revisión.
- `expense_payments`: pagos a proveedores.
- `expense_reimbursements`: devoluciones al conductor.
- `expense_events`: eventos append-only del ciclo del gasto.
- `expense_liquidation_links`: vínculo futuro con Liquidaciones para evitar doble inclusión activa.

Decisiones fijadas:

- Una solicitud del conductor no es un gasto aprobado.
- `expenses` será la fuente de verdad del gasto.
- `expense_reviews` conservará las decisiones administrativas.
- `expense_payments` representará pagos a proveedores.
- `expense_reimbursements` representará devoluciones al conductor.
- Los pagos y reembolsos en efectivo generarán salidas en `cash_movements`.
- No se eliminará ningún registro financiero.
- Las anulaciones quedan reservadas a Superadmin.
- Toda anulación con impacto en Caja creará un movimiento inverso.
- El método activo inicial será `cash`.
- En aprobación parcial, el máximo pagable o reembolsable será `approved_amount`.
- Los justificantes se guardarán posteriormente en Supabase Storage; la base solo conservará metadatos y rutas.
- El conductor solo podrá ver y operar sus propios gastos.
- Solo gastos aprobados y marcados como computables podrán incluirse en Liquidaciones.
- `expense_liquidation_links` impedirá la doble inclusión activa.

Códigos humanos previstos:

- `EXP-000001` para gastos.
- `SUP-000001` para proveedores.
- `EXPPAY-000001` para pagos de gastos.
- `EXPRMB-000001` para reembolsos.

Proveedores:

- `suppliers` será la entidad conceptual de proveedor para gastos.
- Cada proveedor tendrá UUID interno y código humano `SUP-000001`.
- `supplier_type` podrá ser `individual` o `company`.
- Deberá tener exactamente una relación normalizada mediante `person_id` o `company_id`, cuando exista.
- Podrá conservar `legal_name` o `display_name` cuando el proveedor no esté normalizado todavía como persona o empresa.
- Podrá incluir `tax_id`, email, teléfono, dirección, estado `active` o `inactive`, timestamps y auditoría.
- `expenses.supplier_id` será FK opcional hacia `suppliers`.

Estados del gasto:

- `draft`
- `pending_review`
- `information_required`
- `approved`
- `partially_approved`
- `rejected`
- `pending_payment`
- `pending_reimbursement`
- `paid`
- `reimbursed`
- `annulled`

Diferencias conceptuales:

- Gasto administrativo: coste creado desde Administración y gestionado por ELARA.
- Solicitud del conductor: declaración creada desde Portal conductor que requiere revisión.
- Gasto aprobado: gasto validado total o parcialmente por Administración.
- Pago: salida a proveedor, registrada en `expense_payments`.
- Reembolso: devolución al conductor, registrada en `expense_reimbursements`.
- Gasto computable para liquidación: gasto aprobado, marcado como computable y no incluido activamente en otra liquidación.

Fuentes de verdad:

- `expenses`: gasto, solicitud, importe solicitado, importe aprobado y estado actual.
- `suppliers`: proveedores asociados a gastos.
- `expense_reviews`: decisiones administrativas y motivos.
- `expense_payments`: pagos a proveedores.
- `expense_reimbursements`: devoluciones al conductor.
- `expense_receipts`: metadatos de justificantes.
- `cash_movements`: impacto en Caja.
- `expense_events`: historial append-only.
- `expense_liquidation_links`: inclusión futura en Liquidaciones.

Creación y edición:

- Administración podrá crear gastos administrativos.
- El conductor podrá crear solicitudes propias desde el Portal.
- La edición estará limitada a estados previos a revisión o a estados que requieran información, según permisos.
- No se deberá editar directamente una aprobación ya emitida; cualquier cambio relevante deberá quedar en revisión o evento.
- Un gasto podrá relacionarse con conductor, vehículo, servicio o proveedor cuando corresponda.

Revisión total o parcial:

- Aprobar total fija `approved_amount` igual al importe solicitado.
- Aprobar parcialmente fija `approved_amount` menor que el importe solicitado.
- El importe aprobado deberá ser mayor que cero.
- En aprobación parcial, el máximo pagable o reembolsable será `approved_amount`.
- La decisión quedará registrada en `expense_reviews`.

Solicitud de información:

- Requerirá motivo.
- Cambiará el gasto a `information_required`.
- No aprobará importes ni generará pagos, reembolsos o movimientos de Caja.

Rechazo:

- Requerirá motivo.
- Cambiará el gasto a `rejected`.
- No generará pagos, reembolsos ni movimientos de Caja.
- La decisión quedará en `expense_reviews` y `expense_events`.

Integración con Caja:

- Un pago a proveedor en efectivo generará una salida en `cash_movements`.
- Un reembolso al conductor en efectivo generará una salida en `cash_movements`.
- `cash_movements` seguirá siendo la fuente de verdad del efectivo físico.
- Si una anulación afecta Caja, deberá crear un movimiento inverso vinculado al movimiento original.
- No se borrarán movimientos de Caja.

Justificantes y Storage futuro:

- `expense_receipts` guardará estado del comprobante, nombre de archivo, tipo MIME, tamaño, bucket, ruta, usuario y fecha.
- El archivo binario vivirá en Supabase Storage cuando se implemente.
- La sustitución de documentos deberá conservar historial mediante relación con el justificante reemplazado o evento.
- El conductor solo podrá acceder a justificantes de sus propios gastos.
- Administración accederá según permisos y contexto activo.

Estados de justificante:

- `attached`
- `pending_attachment`
- `not_available`
- `not_required`
- `replaced`
- `annulled`

Idempotencia:

- Los pagos, reembolsos, anulaciones y acciones sensibles deberán usar `idempotency_key`.
- No deberá existir doble pago activo para el mismo gasto.
- No deberá existir doble reembolso activo para el mismo gasto.
- No deberá existir doble reversión del mismo movimiento de Caja.
- `expense_liquidation_links` impedirá doble inclusión activa en Liquidaciones.

Permisos:

- Superadmin: ver, crear, revisar, aprobar, aprobar parcialmente, requerir información, rechazar, pagar, reembolsar y anular.
- Administrativo: ver y gestionar gastos según política; revisar, aprobar, aprobar parcialmente, requerir información, rechazar, pagar y reembolsar si se mantiene la regla funcional.
- Conductor: crear solicitudes propias, ver sus gastos y aportar información o justificantes; no aprobar, pagar, reembolsar ni anular.

Los permisos efectivos dependerán del `active_context` de la sesión. El conductor solo podrá ver y operar gastos asociados a su `driver_id`.

Relación futura con Liquidaciones:

- Solo gastos aprobados y marcados como computables podrán incluirse.
- Se deberá conservar snapshot de importe computado, categoría, conductor, fecha y estado.
- `expense_liquidation_links` impedirá doble inclusión activa del mismo gasto.
- Una anulación o reversión posterior deberá coordinarse con Liquidaciones para no alterar snapshots históricos sin evento compensatorio.

Datos derivados que no deberán almacenarse como fuentes paralelas:

- métricas superiores de gastos;
- totales por estado;
- importe pendiente de pago calculable;
- importe pendiente de reembolso calculable;
- nombre visible del conductor;
- nombre visible del proveedor;
- estado visual;
- contadores de justificantes;
- total computable para liquidación.

Transformación de mocks:

- Los gastos mock se transformarán en `expenses`.
- Los proveedores mock se transformarán en `suppliers` cuando representen una entidad funcional.
- Las categorías mock se normalizarán en `expense_categories`.
- Las decisiones de revisión se transformarán en `expense_reviews`.
- Los pagos mock se transformarán en `expense_payments`.
- Los reembolsos mock se transformarán en `expense_reimbursements`.
- Los justificantes mock se transformarán en `expense_receipts`.
- Los eventos relevantes se transformarán en `expense_events`.
- Los vínculos futuros con Liquidaciones se transformarán en `expense_liquidation_links` solo si representan inclusión real.
- Las métricas y resúmenes mock no se migrarán como fuentes de verdad.

Decisiones abiertas del dominio:

- Catálogo final de categorías.
- Métodos de pago activos más allá de `cash`.
- Reglas exactas de edición en `information_required`.
- Cuándo un gasto aprobado pasa a `pending_payment` o `pending_reimbursement`.
- Reglas fiscales futuras para facturas de gastos.
- Integración exacta con Liquidaciones.
- RLS para aislamiento estricto del Portal conductor.

Diagrama textual:

```text
drivers
  └── N expenses
          ├── 1 expense_categories
          ├── 0..1 suppliers
          ├── N expense_receipts
          ├── N expense_reviews
          ├── N expense_events
          ├── 0..N expense_payments ── 0..1 cash_movements
          ├── 0..N expense_reimbursements ── 0..1 cash_movements
          ├── 0..N expense_liquidation_links
          ├── 0..1 services
          └── 0..1 vehicles

expenses = fuente de verdad del gasto o solicitud
expense_reviews = decisiones administrativas
expense_payments = pagos a proveedores
expense_reimbursements = devoluciones al conductor
cash_movements = fuente de verdad de impacto en Caja
expense_events = historial append-only
```

## 10. Liquidaciones

El dominio de Liquidaciones calculará y registrará los importes a pagar a conductores internos y colaboradores externos por servicios realizados dentro de un periodo. Las liquidaciones conservarán snapshots históricos de porcentajes, servicios, gastos computables e importes para que una aprobación no dependa de configuraciones futuras.

Tablas del dominio:

- `settlement_configs`: configuración vigente de modalidad y porcentajes.
- `settlements`: cabecera y estado de la liquidación.
- `settlement_service_items`: servicios incluidos.
- `settlement_expense_items`: gastos computables incluidos.
- `settlement_payments`: pagos de liquidación.
- `settlement_events`: eventos append-only del ciclo de liquidación.

Decisiones fijadas:

- Chofer interno: liquidación mensual y 35 % del margen para el conductor.
- Colaborador externo: liquidación semanal; ELARA conserva 10 % por defecto y puede existir porcentaje personalizado.
- Los porcentajes aplicados se conservarán como snapshots históricos.
- Los servicios pendientes de cobro pueden mostrarse como información, pero no cuentan como ingreso cobrado.
- `settlements` será la fuente de verdad de la liquidación.
- `settlement_service_items` será la fuente de verdad de los servicios incluidos.
- `settlement_expense_items` será la fuente de verdad de los gastos incluidos.
- `settlement_payments` será la fuente de verdad del pago.
- El pago de una liquidación generará una salida en `cash_movements`.
- La anulación del pago solo podrá hacerla Superadmin, generará movimiento inverso en Caja, devolverá la liquidación a `approved` y no eliminará ningún registro.
- Administrativo podrá generar, revisar, aprobar y pagar.
- El conductor solo podrá ver sus propias liquidaciones.
- No se permitirá un mismo servicio en dos liquidaciones activas.
- No se permitirá un mismo gasto en dos liquidaciones activas.
- No se permitirán dos pagos activos para una misma liquidación.
- No se permitirán dos liquidaciones activas del mismo conductor para el mismo periodo y modalidad.
- El redondeo monetario será a 2 decimales y se aplicará con una única regla en base de datos.
- El periodo se almacenará directamente en `settlements`; no habrá tabla `settlement_periods` inicialmente.

Códigos humanos previstos:

- `SET-000001` para liquidaciones.
- `SETPAY-000001` para pagos de liquidación.

Modalidades y frecuencias:

- `internal_driver_monthly`: chofer interno, frecuencia mensual.
- `external_collaborator_weekly`: colaborador externo, frecuencia semanal.

Configuración de porcentajes:

- `settlement_configs` definirá configuración vigente por tipo de conductor y, cuando corresponda, por conductor.
- Para chofer interno, el porcentaje aplicado será 35 % del margen para el conductor.
- Para colaborador externo, ELARA conservará 10 % por defecto.
- Un colaborador podrá tener porcentaje personalizado.
- La configuración vigente no modificará liquidaciones ya generadas o aprobadas.

Snapshots históricos:

- `settlements` conservará snapshot de modalidad, periodo, porcentaje aplicado, modo de porcentaje, conductor y totales.
- `settlement_service_items` conservará snapshot de servicio, estado de cobro, ingreso cobrado, ingreso pendiente informativo, margen e importes relevantes.
- `settlement_expense_items` conservará snapshot de gasto, categoría, estado e importe computado.
- Los snapshots serán evidencia histórica, no fuentes vivas para recalcular datos maestros.

Estados de liquidación:

- `draft`
- `under_review`
- `pending_approval`
- `approved`
- `paid`
- `annulled`

Estados de pago:

- `pending`
- `registered`
- `annulled`

Servicios incluidos:

- Deberán estar asociados al conductor de la liquidación.
- Deberán pertenecer al periodo.
- Deberán cumplir reglas de elegibilidad financiera.
- No podrán estar incluidos en otra liquidación activa.
- Los servicios pendientes de cobro podrán mostrarse de forma informativa, pero no sumarán como ingreso cobrado.

Gastos computables:

- Solo gastos aprobados y marcados como computables podrán incluirse.
- La inclusión se coordinará con `expense_liquidation_links`.
- No podrá existir doble inclusión activa del mismo gasto.
- La anulación posterior de un gasto deberá resolverse mediante evento o liquidación compensatoria, sin alterar snapshots históricos ya aprobados.

Cálculo de margen:

- El ingreso del servicio se tomará desde importes cobrados activos, no desde saldos pendientes.
- Los costes o gastos computables se tomarán desde gastos aprobados incluidos.
- El margen será el ingreso cobrado menos gastos computables aplicables.
- Para chofer interno se calculará 35 % del margen para el conductor.
- Para colaborador externo se aplicará el porcentaje de ELARA vigente o personalizado, conservado como snapshot.
- La moneda inicial será EUR.
- El redondeo será a 2 decimales mediante una regla única en base de datos.

Revisión y aprobación:

- Una liquidación podrá nacer como `draft`.
- La revisión validará servicios, gastos, porcentaje, periodo y totales.
- La aprobación congelará los snapshots definitivos.
- Una liquidación aprobada no deberá recalcularse silenciosamente por cambios posteriores en servicios, gastos o configuración.

Pago:

- El pago requerirá liquidación `approved`.
- El importe deberá coincidir con el importe aprobado para pagar.
- Se registrará en `settlement_payments`.
- Generará una salida en `cash_movements`.
- Cambiará la liquidación a `paid`.
- Registrará evento append-only.

Anulación del pago:

- Solo Superadmin podrá anular un pago.
- Requerirá motivo.
- No eliminará el pago original.
- Marcará el pago como `annulled`.
- Creará movimiento inverso en Caja vinculado a la salida original.
- Devolverá la liquidación a `approved`.
- Registrará evento append-only.

Integración con Caja:

- `settlement_payments` será la fuente de verdad del pago de liquidación.
- `cash_movements` será la fuente de verdad del impacto en efectivo.
- El pago generará salida.
- La anulación del pago generará entrada inversa o movimiento inverso según el catálogo final de Caja.
- La salida original permanecerá registrada.

Permisos:

- Superadmin: generar, revisar, aprobar, pagar, anular pago y ver todas las liquidaciones.
- Administrativo: generar, revisar, aprobar, pagar y ver liquidaciones administrativas.
- Conductor: ver únicamente sus propias liquidaciones; no puede generar, revisar, aprobar, pagar ni anular.

Los permisos efectivos dependerán del `active_context` de la sesión.

Idempotencia:

- La generación deberá impedir dos liquidaciones activas del mismo conductor para el mismo periodo y modalidad.
- `settlement_service_items` impedirá incluir un servicio en dos liquidaciones activas.
- `settlement_expense_items` y `expense_liquidation_links` impedirán incluir un gasto en dos liquidaciones activas.
- `settlement_payments` impedirá dos pagos activos para una misma liquidación.
- La anulación impedirá dos movimientos inversos para el mismo pago.
- Generación, pago y anulación deberán usar `idempotency_key` o una restricción equivalente.

Relaciones principales:

- `drivers`: titular de la liquidación.
- `services`: origen operativo de servicios liquidados.
- `service_financials`: importes y estado financiero de servicios.
- `service_payments`: pagos cobrados que determinan ingreso real.
- `expenses`: gastos computables.
- `expense_liquidation_links`: control de inclusión de gastos.
- `cash_movements`: salida de pago y movimiento inverso de anulación.

Datos derivados que no deberán almacenarse como fuentes paralelas:

- métricas superiores;
- total liquidado por conductor;
- próximos pagos;
- estado visual;
- nombre visible del conductor;
- resumen vivo por periodo;
- servicios elegibles no incluidos;
- gastos computables disponibles;
- importes recalculables de borradores.

Los totales de una liquidación aprobada sí podrán guardarse como snapshots históricos congelados.

Transformación de mocks:

- Las liquidaciones mock se transformarán en `settlements`.
- La configuración mock de porcentajes se transformará en `settlement_configs`.
- Los servicios incluidos se transformarán en `settlement_service_items`.
- Los gastos computables se transformarán en `settlement_expense_items` y `expense_liquidation_links`.
- Los pagos mock se transformarán en `settlement_payments` y `cash_movements`.
- Los eventos relevantes se transformarán en `settlement_events`.
- Los snapshots de porcentaje se conservarán.
- Las métricas y resúmenes mock no se migrarán como fuentes de verdad.

Decisiones abiertas del dominio:

- Catálogo final de estados de revisión si se requiere más granularidad.
- Regla exacta para servicios parcialmente cobrados en fases futuras.
- Si una liquidación `annulled` libera automáticamente servicios y gastos o requiere liquidación correctiva.
- Detalle del método de pago de liquidaciones más allá de `cash`.
- Tratamiento fiscal futuro de pagos a colaboradores.
- RLS exacta para vista consultiva del Portal conductor.
- Integridad definitiva entre `settlement_payments` y `cash_movements`.

Diagrama textual:

```text
drivers
  └── N settlements
          ├── N settlement_service_items ── 1 services
          │                                 └── 1 service_financials
          ├── N settlement_expense_items ── 1 expenses
          │                                 └── 1 expense_liquidation_links
          ├── 0..N settlement_payments ── 0..1 cash_movements
          └── N settlement_events

settlement_configs
  └── aplica por driver_type o driver_id

settlements = fuente de verdad de la liquidación
settlement_service_items = servicios incluidos
settlement_expense_items = gastos incluidos
settlement_payments = pagos de liquidación
cash_movements = impacto en Caja
```

## 11. Incidencias, auditoría, configuración y RLS global

Este dominio consolida los elementos transversales del sistema: incidencias, auditoría global, configuración persistente, catálogos técnicos, permisos y diseño conceptual de RLS. La auditoría no sustituye los estados de las tablas principales; cada dominio conserva su fuente de verdad y sus propios eventos.

Tablas del dominio:

- `incident_categories`: catálogo de categorías de incidencia.
- `incidents`: incidencias operativas, administrativas, financieras o técnicas.
- `incident_events`: eventos append-only de incidencias.
- `audit_events`: auditoría global de acciones sensibles y relevantes.
- `app_settings`: configuración persistente global o por alcance.
- `app_setting_events`: historial append-only de cambios de configuración.
- `technical_catalogs`: agrupaciones de catálogos técnicos.
- `technical_catalog_items`: valores de catálogo con clave técnica y etiqueta visible.
- `permission_policies`: posibilidad documental para persistir permisos declarativos por contexto.
- `integrity_checks`: registro opcional de ejecuciones de validaciones de integridad.

Decisiones fijadas:

- La auditoría no sustituye los estados de las tablas principales.
- Los eventos de dominio y auditoría serán append-only.
- `audit_events` registrará acciones sensibles y relevantes.
- La configuración dejará de depender de memoria o `localStorage`.
- `app_settings` será la fuente persistente de configuración global o por alcance.
- Los valores históricos usados en operaciones financieras se conservarán como snapshots en cada dominio.
- Los permisos se resolverán usando `auth.uid()`, usuario activo, `session_id` verificado del JWT, `app_sessions`, `active_context`, `user_roles` activos y `user_driver_links` cuando corresponda.
- No se confiará en frontend, `localStorage`, `user_metadata` ni parámetros enviados por el navegador.
- Superadmin tendrá acceso total.
- Administrativo tendrá acceso operativo sin acciones reservadas.
- Conductor solo podrá acceder a sus propios datos del Portal.
- Los ajustes de Caja, anulaciones críticas y protección del último Superadmin quedan reservados a Superadmin.
- Los documentos y justificantes usarán Supabase Storage con control por entidad y URLs firmadas cuando corresponda.
- Las operaciones financieras y cambios críticos deberán ejecutarse mediante funciones seguras y transacciones atómicas.
- Los estados técnicos estables podrán usar checks o enums.
- Los catálogos configurables usarán tablas con claves técnicas en inglés y etiquetas visibles en español.
- Los elementos de catálogo con historial se inactivarán, no se eliminarán.
- Reportes permanece fuera del alcance actual.

Diferencias conceptuales:

- Incidencia: registro gestionable que requiere seguimiento, revisión o resolución.
- Alerta operativa: aviso derivado del estado actual de los datos; puede no persistirse.
- Evento de dominio: historial append-only dentro de un módulo concreto.
- Evento de auditoría: registro global de una acción sensible o relevante.
- Log técnico: diagnóstico de sistema, no necesariamente funcional ni visible para operación.
- Movimiento financiero: impacto económico real registrado en su dominio, no en auditoría.

Modelo de incidencias:

- `incidents` será la fuente de verdad de la incidencia.
- `incident_events` conservará historial append-only.
- Las categorías vivirán en `incident_categories`.
- Las prioridades podrán ser `low`, `medium`, `high` y `critical`.
- Los estados podrán ser `open`, `in_review`, `pending_action`, `resolved`, `dismissed` y `annulled`.
- Una incidencia podrá relacionarse con servicio, conductor, vehículo, cliente, Caja, CxC, gasto, liquidación u otra entidad relevante mediante referencias específicas cuando existan.
- Resolver una incidencia actualizará su estado principal y añadirá evento; no borrará el historial.

Modelo de auditoría global:

- `audit_events` registrará actor, sesión, contexto activo, acción, entidad afectada, valores anteriores y posteriores cuando aplique, metadata y fecha.
- Deberán auditarse cambios de usuarios, roles, contexto, inactivaciones, asignaciones, pagos, cobros, rendiciones, ajustes, anulaciones, aprobaciones, rechazos, reversiones y cambios de configuración.
- El acceso a auditoría será restringido, con visibilidad total para Superadmin y alcance administrativo si se aprueba.
- `audit_events` tendrá retención indefinida durante la primera versión productiva.
- No se permitirá modificación ni eliminación de auditoría global desde la aplicación.
- Los logs técnicos de infraestructura no se mezclarán con `audit_events`.

Configuración persistente:

- `app_settings` almacenará valores globales y por alcance.
- `app_setting_events` registrará cambios de configuración.
- La configuración financiera vigente podrá leerse desde configuración o tablas específicas, pero los valores usados en operaciones se conservarán como snapshots del dominio correspondiente.
- La configuración podrá aplicar por alcance global, por entidad o por tipo, según se defina en cada dominio.

Catálogos técnicos:

- Los estados técnicos muy estables podrán usar checks o enums.
- Los catálogos configurables deberán usar tablas.
- Las claves técnicas estarán en inglés.
- Las etiquetas visibles estarán en español.
- Los elementos con historial se inactivarán, no se eliminarán.

Matriz global de permisos:

- Usuarios: Superadmin gestiona todo; Administrativo sin acciones reservadas; Conductor sin acceso administrativo.
- Clientes: Superadmin y Administrativo gestionan; Conductor sin acceso salvo datos relacionados con sus servicios si se aprueba.
- Conductores: Superadmin y Administrativo gestionan; Conductor ve su perfil operativo propio.
- Vehículos: Superadmin y Administrativo gestionan; Conductor ve vehículo propio asignado si corresponde.
- Servicios: Superadmin y Administrativo gestionan; Conductor opera solo servicios propios.
- Pagos: Superadmin y Administrativo registran según reglas; Conductor solo registra acciones permitidas del Portal cuando correspondan.
- Caja: Superadmin acceso total; Administrativo acceso operativo; ajustes y anulaciones críticas reservadas a Superadmin; Conductor sin acceso administrativo.
- CxC: Superadmin y Administrativo ven y cobran; anulación reservada a Superadmin; Conductor sin acceso.
- Gastos: Superadmin acceso total; Administrativo gestión operativa; Conductor crea y ve gastos propios.
- Liquidaciones: Superadmin acceso total; Administrativo genera, revisa, aprueba y paga; Conductor ve liquidaciones propias.
- Incidencias: Superadmin acceso total; Administrativo gestión operativa; Conductor acceso solo a incidencias propias o relacionadas si se habilita.
- Configuración: Superadmin gestiona; Administrativo lectura o gestión limitada si se aprueba; Conductor sin acceso.

Diseño conceptual de RLS:

- Toda política deberá partir de `auth.uid()`.
- El usuario funcional deberá estar activo en `app_users`.
- La sesión deberá existir, no estar expirada y coincidir con el `session_id` verificado del JWT.
- El `active_context` se resolverá desde `app_sessions`.
- El rol del contexto deberá existir activo en `user_roles`.
- Para contexto conductor, deberá existir vínculo activo en `user_driver_links`.
- Los permisos no se acumularán entre roles: solo aplica el `active_context` de la sesión.
- Las sesiones expiradas, usuarios inactivos, roles revocados o vínculos conductor inactivos no tendrán acceso operativo.
- Ninguna política deberá confiar en frontend, `localStorage`, `user_metadata` ni parámetros manipulables enviados por el navegador.

Aislamiento del Portal conductor:

- El `driver_id` operativo se resolverá desde `user_driver_links`.
- El conductor solo accederá a servicios, gastos, liquidaciones, justificantes e información propia.
- Si el vínculo usuario-conductor no existe o está inactivo, el Portal no deberá exponer datos operativos.
- Un `driver_id` enviado por el navegador no será suficiente para autorizar acceso.

Storage futuro:

- Existirá un bucket privado para documentos de vehículos.
- Existirá un bucket privado para justificantes de gastos.
- Las rutas se organizarán por entidad UUID.
- El acceso se validará con RLS de Storage y URLs firmadas de duración limitada cuando corresponda.
- No se guardarán URLs públicas permanentes.
- La base conservará bucket, path, nombre, MIME, tamaño, checksum opcional, estado, usuario, fechas y relaciones, no el binario.

Funciones seguras necesarias:

- cambiar contexto activo;
- generar códigos humanos;
- proteger el último Superadmin;
- asignar conductor-vehículo;
- asignar servicio;
- registrar pagos;
- cobrar CxC;
- registrar rendición;
- pagar o reembolsar gastos;
- pagar liquidaciones;
- crear reversiones;
- validar integridad.

Operaciones transaccionales y atómicas:

- cambio de contexto;
- cambios de roles e inactivaciones críticas;
- protección del último Superadmin;
- asignación y reasignación conductor-vehículo;
- asignación y reasignación de servicio;
- inicio, avance y cierre de servicio;
- registro y anulación de pagos;
- cobro y anulación de CxC;
- rendiciones, ajustes y arqueos;
- pagos, reembolsos y anulaciones de gastos;
- generación, aprobación, pago y anulación de liquidaciones;
- creación de movimientos inversos.

Datos derivados que no deberán almacenarse como fuentes paralelas:

- métricas;
- saldos;
- estados visuales;
- permisos efectivos;
- totales agregados;
- próximos servicios;
- disponibilidad efectiva;
- asignabilidad;
- nombres completos;
- resúmenes por cliente, conductor, servicio o periodo;
- alertas derivadas de datos actuales.

Transformación de mocks:

- Las incidencias mock se transformarán en `incidents` e `incident_events`.
- Las configuraciones mock pasarán a `app_settings` o catálogos específicos.
- Los catálogos mock se normalizarán como `technical_catalogs` y `technical_catalog_items` cuando sean configurables.
- Los eventos históricos relevantes se transformarán en eventos de dominio o `audit_events` según su alcance.
- Los permisos mock se convertirán en reglas RLS y funciones seguras; `permission_policies` solo se usará si se decide persistir una capa declarativa.
- No se migrarán logs técnicos, métricas ni alertas derivadas como fuentes de verdad.

Riesgos pendientes:

- Separación final entre auditoría funcional y logs técnicos.
- Qué permisos se persistirán en tablas y cuáles quedarán en funciones/políticas.
- Alcance administrativo exacto sobre incidencias.
- Estrategia de vistas o funciones para métricas derivadas.
- Orden de implementación de funciones transaccionales.
- Pruebas de RLS para evitar fugas entre conductores.

Diagrama textual:

```text
auth.users
  └── app_users
        ├── user_roles
        ├── app_sessions
        └── audit_events

app_sessions.active_context
  └── valida permisos por contexto

incidents
  ├── incident_categories
  └── incident_events

app_settings
  └── app_setting_events

technical_catalogs
  └── technical_catalog_items

audit_events
  ├── actor_user_id
  ├── app_session_id
  ├── active_context
  └── entity_type / entity_id

domain tables
  ├── created_by / updated_by
  ├── domain_events append-only
  └── audit_events globales
```

## 12. Decisiones consolidadas previas a SQL

Esta sección cierra las inconsistencias críticas detectadas en la auditoría consolidada antes de escribir migraciones SQL.

### Sesión y RLS

- El identificador de sesión se obtendrá desde el claim verificado `session_id` del JWT de Supabase.
- Ese valor corresponde a `auth.sessions.id`.
- Las funciones y políticas podrán leerlo desde `auth.jwt()`.
- La autorización deberá comprobar siempre `auth.uid()`, `session_id`, `app_users.status = active`, `app_sessions` válida y no finalizada, `active_context`, `user_roles` activos y `user_driver_links` activo cuando corresponda.
- No se confiará únicamente en claims de rol del JWT porque pueden quedar desactualizados hasta que el token se refresque.

### Estado financiero del servicio

- `service_financials.financial_status` será una columna materializada.
- No podrá ser modificada directamente por el frontend.
- Se recalculará exclusivamente mediante funciones o lógica transaccional en base de datos.
- La fuente económica subyacente seguirá siendo `total_amount`, `service_payments` activos, anulaciones y reembolsos.
- Las validaciones de integridad deberán detectar cualquier divergencia.

### Importe pendiente de CxC

- `receivables.original_amount` será snapshot histórico al crear la cuenta.
- `receivables.pending_amount` será una columna materializada.
- En la versión inicial, como el cobro es completo, `pending` implica `original_amount`, `collected` implica 0 y tras anulación del cobro vuelve a `original_amount`.
- No podrá modificarse directamente desde el frontend.
- Se actualizará únicamente dentro de operaciones transaccionales seguras.

### Relación entre pagos

- `service_payments` representa el pago económico aplicado al servicio.
- `receivable_payments` representa la operación administrativa de cobrar una cuenta pendiente.
- Todo `receivable_payment` activo deberá vincularse exactamente con un `service_payment` y un `cash_movement` de entrada.
- La anulación deberá vincularse con la anulación o reversión del `service_payment` y un `cash_movement` inverso.
- La operación completa será atómica.

### Gastos

- Solo Superadmin podrá anular gastos, pagos de gastos y reembolsos.
- Administrativo podrá crear, revisar, aprobar, rechazar, pagar y reembolsar según las reglas aprobadas.
- No quedará abierta ninguna decisión que permita anulación administrativa en esta primera implementación.

### Gastos en Liquidaciones

- `settlement_expense_items` será el snapshot histórico del gasto incluido en una liquidación.
- `expense_liquidation_links` será el mecanismo de bloqueo y trazabilidad que impide doble inclusión.
- Al añadir un gasto a una liquidación, ambas filas se crearán en la misma transacción.
- Al anular una liquidación o excluir un gasto, el item histórico no se borra, el link cambia a `reversed` o `excluded`, y se registra evento.
- Ninguna de las dos tablas sustituye a la otra.

### Historiales y eventos

- `service_status_history` registrará únicamente transiciones de `operational_status`.
- `service_events` registrará acciones operativas generales.
- `service_payment_events` registrará acciones sobre un pago concreto.
- `service_financial_events` registrará cambios generales de precio, IVA o estado financiero.
- No deberán duplicarse eventos sin una razón de auditoría explícita.

### Movimientos inversos

- Todos los importes de Caja se almacenan positivos.
- Una reversión usa un nuevo movimiento con el tipo contrario al original: `inflow` se revierte con `outflow`, y `outflow` se revierte con `inflow`.
- `reversal_of_movement_id` enlaza el nuevo movimiento con el original.
- Un movimiento original solo puede tener una reversión activa, salvo flujo futuro expresamente aprobado.
- No se usará el término ambiguo "importe negativo".

### Proveedores

- `suppliers` será tabla conceptual del dominio Gastos.
- Tendrá UUID interno, código humano `SUP-000001`, `supplier_type` `individual` o `company`, y exactamente una relación mediante `person_id` o `company_id` cuando exista normalización.
- Podrá conservar `legal_name` o `display_name` cuando el proveedor no esté normalizado.
- Podrá incluir `tax_id`, email, teléfono, dirección, estado `active` o `inactive`, timestamps y auditoría.
- `expenses.supplier_id` será FK opcional hacia `suppliers`.

### Permission policies

- `permission_policies` no será una fuente de autorización en la primera implementación.
- RLS y funciones seguras serán la autoridad real.
- Puede mantenerse solo como documentación o catálogo futuro.
- No deberá crearse inicialmente salvo necesidad comprobada.

### Pagos parciales

- Cuentas por cobrar no admitirá pagos parciales en la primera versión.
- Pagos directos del servicio tampoco admitirán pagos parciales inicialmente.
- Todo pago activo deberá cubrir exactamente el importe pendiente.
- El estado `partial` puede conservarse en el modelo para evolución futura, pero no estará habilitado en los flujos iniciales.

### Catálogos y estados

- Se usarán checks o enums para estados estructurales muy estables.
- Se usarán tablas para valores configurables o ampliables.
- Las claves técnicas estarán en inglés.
- Las etiquetas visibles estarán en español.
- Los catálogos usados históricamente se inactivarán, no se eliminarán.

### Storage

- Habrá bucket privado para documentos de vehículos.
- Habrá bucket privado para justificantes de gastos.
- Las rutas se organizarán por entidad UUID.
- El acceso se hará mediante RLS de Storage y URLs firmadas de duración limitada.
- No se guardarán URLs públicas permanentes.
- Las tablas guardarán bucket, path, nombre, MIME, tamaño y checksum opcional.

### Auditoría

- `audit_events` tendrá retención indefinida durante la primera versión productiva.
- No se permitirá modificación ni eliminación desde la aplicación.
- Solo Superadmin podrá consultar la auditoría global.
- Los logs técnicos de infraestructura no se mezclarán con `audit_events`.

### Operaciones atómicas

Deberán ejecutarse mediante función segura o transacción:

- cambiar contexto activo;
- asignar o revocar roles;
- proteger último Superadmin;
- asignar o reasignar conductor-vehículo;
- asignar o reasignar servicio;
- iniciar, finalizar, cancelar o cerrar servicio;
- registrar o anular pago de servicio;
- cobrar o anular CxC;
- registrar o anular rendición;
- registrar ajuste o reversión de Caja;
- pagar, reembolsar o anular gasto;
- generar, aprobar, pagar o anular liquidación;
- incluir servicios o gastos en liquidaciones;
- generar códigos humanos.

## 13. Plan formal de migraciones SQL

Este plan traduce la arquitectura aprobada en una secuencia formal de migraciones. No contiene SQL ejecutable; define orden, responsabilidades, dependencias, restricciones, funciones, RLS, Storage, vistas, seed y puntos de QA.

### Principios del plan

- Las migraciones serán pequeñas, numeradas y con una responsabilidad principal.
- Cada migración declarará dependencias previas y validaciones posteriores.
- La estructura, funciones, RLS, Storage, vistas e integridades, y seed se mantendrán separados.
- Los cambios con historial tendrán rollback lógico mediante inactivación, anulación, reversión o migración compensatoria.
- La integridad, permisos, códigos humanos e idempotencia dependerán de base de datos y funciones seguras, no del frontend.
- Las tablas base y catálogos se crearán antes que relaciones operativas.
- Las funciones transaccionales se crearán antes de cerrar RLS estricta sobre operaciones sensibles.
- El seed será el último bloque, ya validado contra restricciones y funciones.

### Inventario completo de tablas por dominio

Infraestructura e identidad:

- `persons`
- `app_users`
- `roles`
- `user_roles`
- `app_sessions`
- `user_driver_links`

Clientes, empresas, proveedores y conductores:

- `companies`
- `customers`
- `company_contacts`
- `drivers`
- `suppliers`

Vehículos:

- `vehicles`
- `vehicle_external_owners`
- `vehicle_document_types`
- `vehicle_documents`
- `vehicle_status_reasons`
- `vehicle_technical_incidents`
- `vehicle_odometer_readings`
- `vehicle_maintenance_records`
- `driver_vehicle_assignments`

Servicios:

- `services`
- `service_locations`
- `service_passengers`
- `service_assignments`
- `service_driver_progress`
- `service_closures`
- `service_cancellations`
- `service_status_history`
- `service_events`
- `service_snapshots`

Finanzas del servicio:

- `service_financials`
- `service_payment_methods`
- `service_payments`
- `service_payment_events`
- `service_billing`
- `service_financial_events`

Caja y rendiciones:

- `cash_boxes`
- `cash_movement_categories`
- `cash_movements`
- `driver_remittances`
- `driver_remittance_differences`
- `cash_counts`
- `cash_count_events`
- `cash_movement_events`

Cuentas por cobrar:

- `receivables`
- `receivable_payments`
- `receivable_events`

Gastos:

- `expense_categories`
- `expenses`
- `expense_receipts`
- `expense_reviews`
- `expense_payments`
- `expense_reimbursements`
- `expense_events`
- `expense_liquidation_links`

Liquidaciones:

- `settlement_configs`
- `settlements`
- `settlement_service_items`
- `settlement_expense_items`
- `settlement_payments`
- `settlement_events`

Incidencias, configuración y auditoría:

- `incident_categories`
- `incidents`
- `incident_events`
- `audit_events`
- `app_settings`
- `app_setting_events`
- `technical_catalogs`
- `technical_catalog_items`
- `integrity_checks`

`permission_policies` queda fuera de la primera implementación. Podrá documentarse como catálogo futuro, pero no será autoridad de permisos ni debe crearse inicialmente salvo necesidad comprobada.

### Clasificación de estados y catálogos

- Estados de usuario: check o enum estable, con valores técnicos como `active` e `inactive`.
- Roles y contextos: tabla `roles`, porque participan en gestión, RLS y auditoría.
- Tipos de cliente: check estable para `individual` y `company`.
- Tipos y estados de conductor: check o enum para `internal_driver`, `external_collaborator`, `active` e `inactive`.
- Vehículos y titularidad: checks para estados estructurales; tablas para tipos documentales, causas e incidencias técnicas.
- Servicios: checks o enums para estados operativos, asignación y etapas.
- Pagos: checks o enums para estados de pago; tabla catálogo para métodos.
- Caja: checks o enums para `movement_type` y estados; tabla para categorías.
- CxC: checks o enums para estados de cuenta y cobro.
- Gastos: checks o enums para estados; tabla para categorías.
- Liquidaciones: checks o enums para estados; tabla/configuración para porcentajes.
- Incidencias: tabla para categorías; checks o enums para prioridad y estado.
- Catálogos configurables: tablas con clave técnica en inglés, etiqueta visible en español, estado activo/inactivo e historial.

### Migraciones numeradas

1. `0001_extensions_and_base_helpers.sql`
   - Objetivo: extensiones, utilidades base, timestamps y convenciones comunes.
   - Tablas: ninguna funcional.
   - Funciones auxiliares: helpers de timestamps y auditoría base.
   - Dependencias: ninguna.
   - Validaciones: extensiones disponibles y helpers invocables.

2. `0002_human_code_generation.sql`
   - Objetivo: generación transaccional de códigos humanos.
   - Tablas: mecanismo interno de secuencias o contador de códigos, si se decide tabla auxiliar.
   - Funciones auxiliares: generación por prefijo.
   - Dependencias: 0001.
   - Validaciones: unicidad y no generación desde frontend.

3. `0003_identity_roles_sessions.sql`
   - Objetivo: identidad funcional, roles, roles por usuario y sesiones.
   - Tablas: `app_users`, `roles`, `user_roles`, `app_sessions`.
   - FKs: `app_users` hacia `auth.users`; roles por usuario; sesiones por usuario.
   - Índices: usuario auth, sesión, rol activo.
   - Restricciones: `default_context` válido, rol activo único por usuario y rol.
   - Dependencias: 0001, 0002.
   - Validaciones: usuario activo, sesión activa, contexto válido.
   - Punto de control: QA tras 0003.

4. `0004_people_customers_drivers_suppliers.sql`
   - Objetivo: personas, empresas, clientes, contactos, conductores, proveedores y vínculo usuario-conductor.
   - Tablas: `persons`, `companies`, `customers`, `company_contacts`, `drivers`, `suppliers`, `user_driver_links`.
   - FKs: persona, empresa, cliente, conductor, usuario.
   - Índices: códigos humanos, email de contacto si aplica, vínculos activos.
   - Restricciones: cliente individual o empresa exactamente uno; proveedor persona o empresa exactamente uno cuando esté normalizado; vínculo activo único usuario-conductor.
   - Dependencias: 0003.
   - Validaciones: tres choferes internos posibles y proveedor opcional en gastos futuros.

5. `0005_vehicles_documents_assignments.sql`
   - Objetivo: vehículos, documentación, mantenimiento, kilometraje y asignación conductor-vehículo.
   - Tablas: `vehicles`, `vehicle_external_owners`, `vehicle_document_types`, `vehicle_documents`, `vehicle_status_reasons`, `vehicle_technical_incidents`, `vehicle_odometer_readings`, `vehicle_maintenance_records`, `driver_vehicle_assignments`.
   - FKs: vehículos con propietarios, documentos, conductores.
   - Índices: matrícula normalizada, asignación activa por vehículo y conductor.
   - Restricciones: matrícula española normalizada, asignación activa única, kilometraje coherente.
   - Dependencias: 0004.
   - Validaciones: asignabilidad derivable y documentación obligatoria.

6. `0006_services_operations.sql`
   - Objetivo: servicios, ubicaciones, pasajeros, asignaciones, progreso, cierres, cancelaciones y eventos operativos.
   - Tablas: `services`, `service_locations`, `service_passengers`, `service_assignments`, `service_driver_progress`, `service_closures`, `service_cancellations`, `service_status_history`, `service_events`, `service_snapshots`.
   - FKs: cliente, conductor, vehículo, asignación conductor-vehículo.
   - Índices: fecha/hora, cliente, conductor, estado, asignación activa.
   - Restricciones: una asignación activa por servicio; estados válidos; orden de ubicaciones.
   - Dependencias: 0004, 0005.
   - Validaciones: servicio futuro confirmado no pone conductor en servicio.
   - Punto de control: QA tras 0006.

7. `0007_service_financials_payments.sql`
   - Objetivo: finanzas del servicio, métodos, pagos, billing y eventos financieros.
   - Tablas: `service_financials`, `service_payment_methods`, `service_payments`, `service_payment_events`, `service_billing`, `service_financial_events`.
   - FKs: servicio y usuarios registradores.
   - Índices: servicio, estado financiero, pagos activos.
   - Restricciones: una fila financiera por servicio; pago activo completo; importes positivos; IVA inicial 0 %.
   - Dependencias: 0006.
   - Validaciones: `financial_status` materializado coincide con pagos activos.

8. `0008_cash_remittances_counts.sql`
   - Objetivo: Caja única, movimientos, rendiciones, diferencias y arqueos.
   - Tablas: `cash_boxes`, `cash_movement_categories`, `cash_movements`, `driver_remittances`, `driver_remittance_differences`, `cash_counts`, `cash_count_events`, `cash_movement_events`.
   - FKs: Caja, categorías, conductor, usuarios.
   - Índices: Caja activa, origen polimórfico, reversión, fecha.
   - Restricciones: una Caja activa; importes positivos; reversión activa única.
   - Dependencias: 0004, 0007.
   - Validaciones: saldo teórico derivable y reversión por movimiento.
   - Punto de control: QA tras 0008.

9. `0009_receivables.sql`
   - Objetivo: cuentas por cobrar y cobros posteriores.
   - Tablas: `receivables`, `receivable_payments`, `receivable_events`.
   - FKs: servicio, cliente, `service_payment`, `cash_movement`.
   - Índices: cuenta activa por servicio, cobro activo por cuenta.
   - Restricciones: cobro completo, `pending_amount` materializado, sin pago parcial.
   - Dependencias: 0007, 0008.
   - Validaciones: cobro crea pago de servicio y entrada Caja de forma atómica.

10. `0010_expenses.sql`
    - Objetivo: gastos, categorías, justificantes, revisiones, pagos, reembolsos y vínculos futuros con liquidaciones.
    - Tablas: `expense_categories`, `expenses`, `expense_receipts`, `expense_reviews`, `expense_payments`, `expense_reimbursements`, `expense_events`, `expense_liquidation_links`.
    - FKs: conductor, vehículo, servicio, proveedor, Caja.
    - Índices: estado, conductor, proveedor, pagos activos, reembolsos activos.
    - Restricciones: anulación solo Superadmin mediante función, importe aprobado como máximo pagable/reembolsable.
    - Dependencias: 0004, 0005, 0006, 0008.
    - Validaciones: conductor solo ve gastos propios.

11. `0011_settlements.sql`
    - Objetivo: configuración, liquidaciones, servicios incluidos, gastos incluidos, pagos y eventos.
    - Tablas: `settlement_configs`, `settlements`, `settlement_service_items`, `settlement_expense_items`, `settlement_payments`, `settlement_events`.
    - FKs: conductor, servicios, gastos, `expense_liquidation_links`, Caja.
    - Índices: conductor-periodo-modalidad activo, servicio incluido activo, gasto incluido activo, pago activo.
    - Restricciones: no doble inclusión; redondeo a 2 decimales; periodo en `settlements`.
    - Dependencias: 0007, 0008, 0010.
    - Validaciones: servicios pendientes de cobro solo informativos.
    - Punto de control: QA tras 0011.

12. `0012_incidents_settings_audit.sql`
    - Objetivo: incidencias, configuración, catálogos, auditoría e integridades opcionales.
    - Tablas: `incident_categories`, `incidents`, `incident_events`, `audit_events`, `app_settings`, `app_setting_events`, `technical_catalogs`, `technical_catalog_items`, `integrity_checks`.
    - Índices: entidad auditada, actor, sesión, incidencia por estado.
    - Restricciones: eventos append-only, auditoría no modificable desde aplicación.
    - Dependencias: 0003 a 0011.
    - Validaciones: configuración persistente y auditoría consultable solo por Superadmin.

13. `0013_domain_secure_functions.sql`
    - Objetivo: funciones transaccionales de dominio.
    - Funciones: contexto, códigos, roles, asignaciones, servicios, pagos, CxC, rendiciones, Caja, gastos, liquidaciones e integridades.
    - Dependencias: 0001 a 0012.
    - Validaciones: idempotencia, atomicidad y eventos/auditoría generados.

14. `0014_rls_policies.sql`
    - Objetivo: activar RLS y políticas por contexto.
    - Tablas: todas las tablas expuestas.
    - Dependencias: 0013.
    - Validaciones: Superadmin, Administrativo, Conductor, usuario inactivo, sesión expirada y rol revocado.
    - Punto de control: QA tras 0014.

15. `0015_storage_buckets_policies.sql`
    - Objetivo: buckets privados y políticas de Storage.
    - Buckets: documentos de vehículos y justificantes de gastos.
    - Dependencias: 0014.
    - Validaciones: rutas por UUID, URLs firmadas y aislamiento por entidad.

16. `0016_views_integrity_checks.sql`
    - Objetivo: vistas derivadas y funciones de validación.
    - Vistas: saldos, estados derivados, métricas e integridades.
    - Dependencias: 0014, 0015.
    - Validaciones: métricas derivadas sin datos duplicados.

17. `0017_seed_development_data.sql`
    - Objetivo: seed transformado de desarrollo.
    - Datos: roles, primer Superadmin, personas, clientes, conductores, vehículos, servicios, finanzas, Caja, gastos, liquidaciones, incidencias y configuración.
    - Dependencias: 0016.
    - Validaciones: integridad global y pruebas funcionales base.
    - Punto de control: QA final tras 0017.

### Dependencias principales

- Identidad y sesiones preceden a RLS y auditoría.
- Personas, clientes, conductores y proveedores preceden a operación.
- Vehículos y asignaciones conductor-vehículo preceden a servicios.
- Servicios preceden a finanzas, CxC, gastos relacionados y liquidaciones.
- `service_financials`, `service_payments` y `cash_movements` preceden a CxC.
- Caja precede a rendiciones, pagos de gastos, CxC y liquidaciones.
- Gastos precede a Liquidaciones.
- Funciones seguras preceden a RLS estricta.
- RLS precede al seed validado.

### Índices y restricciones críticas

- Códigos humanos únicos por tabla y prefijo.
- Email de autenticación único gestionado por Supabase Auth.
- Un rol activo por usuario y rol.
- `default_context` incluido en roles activos.
- Una sesión activa válida por registro de `app_sessions`.
- Un vínculo activo usuario-conductor por usuario.
- Un vínculo activo usuario-conductor por conductor.
- Una asignación activa conductor-vehículo por conductor.
- Una asignación activa conductor-vehículo por vehículo.
- Una asignación activa por servicio.
- Una fila en `service_financials` por servicio.
- Una cuenta por cobrar activa por servicio.
- Un pago activo por operación.
- Una reversión activa por movimiento de Caja.
- Una Caja activa.
- Un servicio o gasto no puede estar en dos liquidaciones activas.
- Una liquidación activa por conductor, periodo y modalidad.
- Protección transaccional del último Superadmin activo.

### Funciones seguras

- `set_active_context`: cambia contexto activo; valida `auth.uid()`, `session_id`, usuario, rol y sesión; actualiza solo la sesión actual y audita.
- `next_human_code`: genera códigos humanos; valida prefijo, serialización e idempotencia.
- `assign_user_role` y `revoke_user_role`: gestionan roles; protegen último Superadmin y auditan.
- `link_user_driver`: crea o cierra vínculo usuario-conductor; valida unicidad activa.
- `assign_driver_vehicle`: asigna o reasigna conductor-vehículo; valida disponibilidad, documentación y unicidad activa.
- `assign_service_driver`: asigna o reasigna servicio; valida servicio, conductor, vehículo y relación vigente.
- `start_service` y `close_service`: inician y cierran servicios; actualizan estados, progreso, cierres y eventos.
- `register_service_payment` y `annul_service_payment`: registran o anulan pago de servicio; actualizan `service_financials`, eventos y Caja cuando corresponda.
- `collect_receivable` y `annul_receivable_payment`: coordinan CxC, pago de servicio, Caja y estado financiero.
- `register_driver_remittance` y `annul_driver_remittance`: registran rendición y reversión si impactó Caja.
- `register_cash_adjustment` y `reverse_cash_movement`: crean ajustes o movimientos inversos; reservadas a permisos aprobados.
- `pay_expense`, `reimburse_expense` y `annul_expense_flow`: coordinan gasto, Caja, eventos y auditoría.
- `generate_settlement`, `approve_settlement`, `pay_settlement` y `annul_settlement_payment`: gestionan snapshots, inclusión, pagos, Caja y eventos.
- `run_integrity_checks`: valida coherencia global y registra resultado en `integrity_checks` si aplica.

### Plan conceptual de RLS

- Todas las políticas partirán de `auth.uid()` y `auth.jwt().session_id`.
- El acceso requerirá `app_users.status = active`, `app_sessions` válida, `active_context` y `user_roles` activos.
- Superadmin tendrá acceso total salvo operaciones críticas que solo se ejecutarán por funciones.
- Administrativo tendrá acceso operativo sin acciones reservadas a Superadmin.
- Conductor solo accederá a datos propios del Portal mediante `driver_id` resuelto desde `user_driver_links`.
- Usuarios inactivos, sesiones expiradas, roles revocados o vínculos conductor inactivos no tendrán acceso operativo.
- Tablas financieras, Caja, CxC, liquidaciones, roles, códigos y auditoría no se modificarán directamente desde frontend.
- `audit_events` será consultable solo por Superadmin y no modificable desde la aplicación.

### Plan de Supabase Storage

- Bucket privado para documentos de vehículos.
- Bucket privado para justificantes de gastos.
- Rutas organizadas por entidad UUID.
- Relación con `vehicle_documents` y `expense_receipts`.
- Metadatos en tablas: bucket, path, nombre, MIME, tamaño y checksum opcional.
- Acceso mediante RLS de Storage y URLs firmadas de duración limitada.
- Sustitución mediante nuevo registro o referencia histórica; no sobrescritura destructiva.
- Sin URLs públicas permanentes.

### Vistas e integridades

- `v_cash_balance`: saldo teórico de Caja.
- `v_vehicle_document_status`: estado documental derivado.
- `v_vehicle_assignability`: asignabilidad de vehículos.
- `v_driver_effective_availability`: disponibilidad efectiva de conductores.
- `v_service_financial_status`: verificación de estado financiero.
- `v_receivables_metrics`: métricas de CxC.
- `v_expenses_pending_actions`: gastos pendientes de revisión, pago o reembolso.
- `v_settlement_summaries`: resúmenes de liquidaciones.
- `v_users_with_roles`: usuarios con roles activos.
- `check_global_integrity`: validación global de roles, vínculos, servicios, pagos, Caja, CxC, gastos y liquidaciones.

### Estrategia de seed

- Cargar roles y catálogos base.
- Crear primer Superadmin.
- Crear personas, empresas, clientes, proveedores y conductores.
- Crear los tres choferes internos aprobados.
- Crear vehículos, documentos, kilometraje y asignaciones.
- Crear servicios, asignaciones y eventos.
- Crear finanzas del servicio y pagos iniciales.
- Crear Caja, movimientos, rendiciones y arqueos.
- Crear CxC, gastos, liquidaciones e incidencias.
- Crear configuración inicial en `app_settings`.
- Transformar IDs mock a UUID.
- Conservar códigos humanos adaptados.
- No migrar contraseñas mock ni campos legacy.
- Ejecutar validaciones después de cada bloque relevante y una validación global final.

### Pruebas por fase

- Tras 0003: usuarios, roles, sesiones, contexto y último Superadmin.
- Tras 0006: servicios, asignaciones, estados y aislamiento conceptual de conductor.
- Tras 0008: Caja única, movimientos, rendiciones, reversión y saldo derivado.
- Tras 0011: finanzas completas, CxC, gastos, liquidaciones, pagos y doble inclusión.
- Tras 0014: RLS por Superadmin, Administrativo y Conductor; usuario inactivo; sesión expirada; rol revocado.
- Tras 0017: seed completo, integridad global, métricas derivadas y recorridos funcionales base.

### Riesgos y puntos de control

- Mayor riesgo: RLS por sesión y contexto activo.
- Mayor riesgo: funciones financieras atómicas.
- Mayor riesgo: Caja, reversión e idempotencia.
- Mayor riesgo: liquidaciones y doble inclusión.
- Mayor riesgo: transformación de mocks a seed.
- Requieren QA obligatorio: 0003, 0006, 0008, 0011, 0014 y 0017.
- No deben ejecutarse manualmente pagos, anulaciones, ajustes de Caja, liquidaciones, generación de códigos ni revocación crítica de roles fuera de funciones seguras.
- Antes de ejecutar en entorno compartido deberá existir copia de seguridad o entorno descartable.

### Estimación de trabajo

- Preparar migraciones: 5 a 8 jornadas.
- Revisar SQL: 2 a 3 jornadas.
- Ejecutar en entorno de desarrollo: 1 a 2 jornadas.
- Cargar seed transformado: 1 a 2 jornadas.
- Conectar la aplicación: 5 a 10 jornadas.
- Pruebas y estabilización: 5 a 8 jornadas.
- Estimación total: 3 a 5 semanas de trabajo cuidadoso para una primera migración estable del MVP.

## 14. Relaciones principales

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

## 15. Fuentes de verdad

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
- `receivables`: cuentas por cobrar.
- `receivable_payments`: cobros posteriores de cuentas por cobrar.
- `receivable_events`: eventos append-only de CxC.
- `expense_categories`: categorías de gasto.
- `suppliers`: proveedores asociados a gastos.
- `expenses`: gastos y solicitudes.
- `expense_receipts`: metadatos de justificantes.
- `expense_reviews`: decisiones administrativas.
- `expense_payments`: pagos a proveedores.
- `expense_reimbursements`: devoluciones al conductor.
- `expense_events`: eventos append-only de gastos.
- `expense_liquidation_links`: inclusión futura en Liquidaciones.
- `settlement_configs`: configuración vigente de liquidaciones.
- `settlements`: liquidaciones.
- `settlement_service_items`: servicios incluidos en liquidaciones.
- `settlement_expense_items`: gastos incluidos en liquidaciones.
- `settlement_payments`: pagos de liquidaciones.
- `settlement_events`: eventos append-only de liquidaciones.
- `incidents`: incidencias.
- `incident_categories`: categorías de incidencia.
- `incident_events`: eventos append-only de incidencias.
- `audit_events`: auditoría global.
- `app_settings`: configuración persistente.
- `app_setting_events`: eventos append-only de configuración.
- `technical_catalogs`: catálogos técnicos.
- `technical_catalog_items`: elementos de catálogo.
- `permission_policies`: posible documentación futura de permisos declarativos; no fuente de autorización inicial.
- `integrity_checks`: registro opcional de validaciones de integridad.

## 16. Campos legacy que no migrarán como fuentes de verdad

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
- métricas mock de CxC
- saldos agregados por cliente
- estados visuales de CxC
- resúmenes manuales de cuentas por cobrar
- métricas mock de Gastos
- estados visuales de gastos
- totales pendientes de pago calculables
- totales pendientes de reembolso calculables
- nombres de proveedor o conductor como relación viva
- métricas mock de Liquidaciones
- resúmenes manuales de liquidaciones
- porcentajes actuales aplicados retroactivamente
- servicios liquidados como texto visible
- gastos liquidados como texto visible
- configuración en memoria
- configuración en `localStorage`
- permisos efectivos calculados en frontend
- alertas derivadas como registros operativos principales
- logs técnicos como auditoría funcional

Algunos de estos valores podrán transformarse durante el seed o conservarse como snapshots históricos solo cuando exista una razón de auditoría.

## 17. Datos mock y estrategia de seed

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
- se transformarán cuentas y cobros mock de CxC en `receivables`, `receivable_payments` y `receivable_events`, sin migrar métricas ni resúmenes como verdad.
- se transformarán gastos mock en `expense_categories`, `expenses`, `expense_receipts`, `expense_reviews`, `expense_payments`, `expense_reimbursements`, `expense_events` y, cuando exista inclusión real, `expense_liquidation_links`.
- se transformarán proveedores mock en `suppliers` cuando representen una entidad funcional.
- se transformarán liquidaciones mock en `settlement_configs`, `settlements`, `settlement_service_items`, `settlement_expense_items`, `settlement_payments` y `settlement_events`.
- se transformarán incidencias, configuración y catálogos mock en `incidents`, `incident_events`, `app_settings`, `technical_catalogs` y `technical_catalog_items` cuando representen datos funcionales.
- se crearán `audit_events` solo para acciones históricas relevantes que deban conservarse como evidencia.

Los mocks no se copiarán literalmente a tablas.

## 18. Decisiones abiertas

Decisiones pendientes del dominio de identidad:

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

Decisiones pendientes del dominio de Cuentas por cobrar:

- Tratamiento de cuentas anuladas si el servicio vuelve a quedar pendiente.
- Catálogo final compartido de estados financieros.
- Activación futura de métodos distintos de efectivo.
- Alcance de snapshots de cliente y servicio.
- Atomicidad definitiva entre CxC, pagos de servicio y Caja.
- Integridad cruzada entre `receivable_payment`, `service_payment` y `cash_movement`.
- RLS para lectura y operación administrativa.

Decisiones pendientes del dominio de Gastos:

- Catálogo final de categorías.
- Métodos de pago activos más allá de efectivo.
- Reglas de edición cuando se requiere información.
- Transición exacta hacia pago o reembolso pendiente.
- Reglas fiscales futuras.
- Integración exacta con Liquidaciones.
- RLS para aislamiento del Portal conductor.

Decisiones pendientes del dominio de Liquidaciones:

- Catálogo final de estados de revisión.
- Tratamiento futuro de servicios parcialmente cobrados.
- Efecto exacto de anular una liquidación completa sobre servicios y gastos incluidos.
- Métodos de pago de liquidación más allá de efectivo.
- Tratamiento fiscal futuro de pagos a colaboradores.
- RLS exacta para el Portal conductor.
- Integridad definitiva entre pagos de liquidación y Caja.

Decisiones pendientes del dominio transversal:

- Separación definitiva entre auditoría funcional y logs técnicos.
- Alcance administrativo sobre incidencias.
- Estrategia de vistas o funciones para métricas derivadas.
- Orden de implementación de funciones seguras transaccionales.
- Batería final de pruebas de RLS por contexto.

## 19. Próximos dominios

- Migraciones SQL.
- Seed.
