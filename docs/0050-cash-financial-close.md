# 0050: cierre financiero en efectivo (implementación local; NO desplegada)

## Decisiones y alcance

- El conductor registra un único cierre inicial: full, partial o unpaid; un precio final cero se resuelve exclusivamente como `no_charge`.
- Los cobros adicionales corresponden únicamente a Administración y van a una cuenta central o administrativa receptora, nunca driver.
- Corregir significa añadir cobros sobre el saldo; no anular pagos, devolver efectivo ni modificar pagos confirmados.
- Solo efectivo. Sin transferencia, tarjeta, métodos mixtos, backfill ni QA congelado.
- 0001–0049 permanecen intactas. La finalización moderna no se sustituye por `complete_service`.

## Dos transacciones y recuperación

La UI consulta precio/saldo por RPC. Al finalizar, primero confirma `advance_driver_service_progress(service,'finished')` y después solicita el cierre financiero. Un fallo financiero NO revierte `completed`.

`get_service_financial_close_context` devuelve `financial_close=pending` si no existe el recibo inicial 0050. No se inserta un pago ficticio ni un error persistente mediante una segunda escritura. El servicio completado sin recibo se recupera desde Historial (conductor) o Servicios (Administración). El error puntual se muestra en el modal.

Si el precio es draft, la UI ofrece completar solo la operación y deja el cierre financiero pendiente de Administración. El conductor nunca fija el precio. Administración usa el contrato existente `finalize_service_pricing`, una sola vez, con base e impuesto explícitos.

Antes de enviar se conserva en sessionStorage únicamente un sobre de transporte (actor/contexto, servicio, entrada, key y argumentos inmutables), nunca saldos autoritativos. Si no puede persistirse, se bloquea el envío. Tras reload se consulta `get_financial_close_receipt`: aplicado muestra el resultado backend sin repetir la mutación; ausente permite únicamente replay con la misma key/payload. Error, sobre corrupto o recibo incompatible bloquean un nuevo intento y ofrecen «Revisar estado del cobro». La key nueva se genera solo al preparar un envío, después de consultar contexto. Servicios y CxC comparten el sobre por actor/contexto/servicio. Tras un recibo aplicado y saldo restante, iniciar otro cobro exige una acción explícita; no se borra un intento incierto para generar otra key.

El sobre sobrevive al reload en la misma pestaña; no se comparte con otro navegador/dispositivo ni pretende sustituir los recibos backend. El contexto expone el último recibo propio para reconocer cobros previos incluso sin sobre. No hay reenvío automático al cargar.

## Contratos públicos

Todos requieren sesión/contexto válidos y niegan anon. Nuevos retornos de cierre: JSONB con `service_id`, `payment_result`, `amount_received`, `total_amount`, `paid_amount`, `pending_amount`, `currency_code`, `payment_id`, `allocation_id`, `receivable_id`, `receivable_allocation_id`, `cash_movement_id`, `cash_account_id`, `financial_close`.

| RPC | Argumentos en orden | Retorno / autorización |
|---|---|---|
| `close_driver_service_financial` | `p_service_id uuid, p_payment_result text, p_amount_received numeric, p_request_key text, p_reason_code text=null, p_notes text=null` | JSONB; conductor que terminó el servicio, asignación aceptada/terminada y closure concordante |
| `close_admin_service_financial` | `p_service_id uuid, p_payment_result text, p_amount_received numeric, p_cash_account_id uuid, p_request_key text, p_reason_code text=null, p_notes text=null` | JSONB; Administración, servicio completed |
| `collect_receivable_cash` | `p_receivable_id uuid, p_payment_result text, p_amount_received numeric, p_cash_account_id uuid, p_request_key text, p_reason_code text=null, p_notes text=null` | JSONB; Administración, CxC activa concordante |
| `get_service_financial_close_context` | `p_service_id uuid` | JSONB de lectura: precio/estado, saldo, pagos, CxC y disponibilidad de cuenta; Administración o conductor autorizado |
| `get_financial_close_receipt` | `p_service_id uuid, p_request_key text` | JSONB de lectura: `{status:not_found}` o `{status:applied,request_key,result}`; requiere acceso al servicio y recibo del mismo actor/servicio; sin auditoría ni escrituras |
| `provision_driver_cash_account` | `p_driver_id uuid` | UUID; Administración; explícita e idempotente; driver activo |

`register_service_payment` conserva argumentos y retorno TABLE(payment_id,cash_movement_id), admite un importe positivo completo/parcial y delega al motor común. `collect_receivable` conserva argumentos y retorno TABLE(payment_id,receivable_allocation_id,cash_movement_id), cobra todo el saldo y delega al mismo motor. Las keys antes opcionales ahora son obligatorias. Los defaults `p_paid_at` pasan a NULL; el backend asigna la hora al ejecutar, evitando fingerprints cambiantes cuando se omite la fecha. No se aceptan métodos distintos de cash.

## Reglas contables

Precio finalized, pendiente positivo, importes finitos con máximo dos decimales:

- full: recibido = pendiente anterior > 0.
- partial: 0 < recibido < pendiente anterior; motivo obligatorio.
- unpaid: recibido = 0; motivo obligatorio. Sin payment/allocation/cash movement.
- no_charge: servicio completed, precio finalized exactamente cero, pagado/pendiente cero y sin pagos/CxC existentes. No requiere cuenta, no es unpaid y no crea payment/allocation/CxC/cash movement. Solo añade el recibo/auditoría inicial append-only con `payment_result=no_charge`, `financial_close=resolved`. Repetir la misma key devuelve el recibo; una segunda resolución inicial se rechaza. El estado de cierre es explícito en el contrato, sin forzar artificialmente el estado legacy de pagos a «paid».
- `paid_amount + pending_amount = total_amount` se mantiene por el recálculo existente.

Si falta CxC y hay saldo tras cerrar, se abre antes de insertar el parcial, conservando el importe original de deuda. La allocation parcial reduce el saldo; la completa liquida. No se modifica original_amount para simular un cobro. Los historiales y auditoría existentes se mantienen.

El trigger de 0007 sigue siendo el ÚNICO creador de service_payment_allocations. Se retira el índice que impedía varios pagos completados y se mantienen unicidad por payment, receipt y clave de movimiento. Los payments completados no pueden cambiar sus datos económicos.

## Efectivo y cuentas

El conductor no envía account_id. Se deriva la cuenta driver activa con su identidad y moneda. El cobro genera únicamente un inflow en esa cuenta, con actor_driver_id. Administración solo admite central/administrative activas y de la moneda del servicio.

0050 no crea cuentas históricas. Para un conductor nuevo, Administración debe pulsar **Preparar cuenta de efectivo del conductor** tras el alta y antes del primer cobro, mediante la RPC explícita. Si existe una cuenta inactiva, se exige revisión separada; no se crea otra para sortear su estado. Unpaid no necesita cuenta.

El efectivo se convierte en una sola fuente de `driver_cash_available`; las reservas 0045/0046 conservan su capacidad compartida. La rendición continúa siendo create_driver_cash_remittance → receive_cash_remittance → verify_cash_remittance, sin modificar esas RPC. Caja ofrece «Revisar rendición», recibe solo submitted y verifica solo received con importe contado explícito. Lee detalle antes/después: un resultado ya confirmado no vuelve a mutar. Una respuesta perdida se reconcilia con el estado remoto; un traslado diferido por discrepancia no se anuncia como confirmado. Busy bloquea doble submit. Las RPC antiguas rechazan replay directo de estados finales; la UI lo resuelve mediante lectura, sin invocarlas otra vez.

Tras éxito se releen cuentas, movimientos y rendiciones. Los saldos operativos derivados se muestran por custodia driver/central/administrative y moneda; incluyen apertura y movimientos operativos completos, independientemente de filtros de búsqueda. No equivalen al saldo agregado QA/legacy. Un cobro driver NO se presenta como ingreso central. No se habilitan mutaciones demo ni anulaciones.

Servicios consulta el contexto real de cada completed, muestra pendiente/resuelto/sin importe y ofrece filtro «Cierre financiero pendiente» y acción directa «Revisar cierre». Un fallo de lectura se muestra como revisión necesaria, nunca se infiere un cierre a partir del saldo.

## Idempotencia, locks y seguridad

Sin tablas nuevas. Recibos append-only en audit_logs, identificados por financial_contract=0050, con key global única, actor, fingerprint normalizado y resultado. Una key no puede reutilizarse por otro actor ni con otros argumentos. El replay se resuelve tras autenticar/autorizar y antes de comprobar saldo/estado de cuenta. Un índice adicional limita a uno el cierre inicial por servicio.

Orden: advisory lock transaccional por request → cuenta (si procede) → servicio → financial → CxC. Se requiere READ COMMITTED. Las dos entradas de cobro usan el mismo orden y motor. Los constraints diferidos verifican el estado financiero final; cualquier fallo revierte todas las escrituras financieras.

Helpers privados owner postgres, search_path pg_catalog y REVOKE explícito a PUBLIC/anon/authenticated/service_role. Nuevas RPC owner postgres, search_path pg_catalog, REVOKE explícito y EXECUTE solo authenticated, con autorización interna. Sin grants DML ni cambios de policies/RLS. Las RPC reemplazadas conservan ACL/owner. No se depende de grants automáticos de Supabase.

## Pruebas locales

Con ELARA_PGLITE_ROOT apuntando al runtime aislado existente:

```powershell
node --test tests/*.test.cjs
node tests/financial-0050.local.cjs
```

El runner nativo conecta SOLO a 127.0.0.1:54422, crea una base con nombre generado `elara_0050_<uuid>`, carga desde cero hasta 0050 y elimina únicamente esa base al terminar. No aplica 0050 a la base Supabase local habitual ni al remoto. Credentials del contenedor local solo en memoria, sin logs.

Cobertura: completo/parcial/unpaid, CxC previa/ausente, replay, saldo/custodia, sesión/anon, rollback allocation/CxC/cash/audit/constraint diferido, SQL real con dos backends, recuperación tras completed, fuente única y sobreconsumo rendición/offset. Frontend: orden de RPC, doble submit, respuesta perdida, payload estable, recuperación, errores y modal real con adaptador DOM.

Antes de desplegar: revisión diferencial de seguridad y contratos; después, autorización separada para precheck remoto READ ONLY, aplicación condicionada SOLO 0050 y QA específico autorizado. No reejecutar el QA congelado ni habilitar Pages por este documento.

## Cierre local de hallazgos — 2026-10-25

- Suite completa: 145 PASS, 0 FAIL, 0 SKIP.
- PostgreSQL nativo: carga limpia 0001→0050, 15 escenarios semánticos, 5 escenarios con backends independientes, 2 rechazos de aislamiento y finalización operativa conservada ante fallo financiero: PASS. Snapshots de rollback incluyen también rendiciones, items y reservas de fuentes.
- Concurrencia: Servicios/CxC sobre el mismo saldo, replay de cierre parcial, dos cierres iniciales distintos, replay de no_charge y dos verificaciones de la misma rendición. Sin sobrepago, segundo traslado ni doble allocation.
- La identidad de discrepancy_id se prioriza frente a su remittance_id padre. La regresión prueba dos discrepancias de una misma rendición y conserva el aislamiento QA sin excluir al padre compartido.
- Servicios/CxC comparten el sobre de transporte. Reconocer un recibo no genera otra key; solo el botón explícito de cobro adicional limpia los alias resueltos y prepara una petición nueva en la entrada elegida. Un sobre corrupto ofrece revisión de solo lectura y bloquea el cobro.

Smoke con frontend actual, Auth y PostgREST reales contra una copia desechable del Supabase **local**, nunca producción. config.js se sirvió adaptado solo en memoria para esa copia; el archivo del repositorio no se modificó. Las identidades y registros de prueba existieron únicamente en la copia.

Evidencia del smoke:

- SRV-000030: no_charge/resolved, un recibo, cero pagos/movimientos/CxC; desaparece del filtro de pendientes.
- SRV-000031: respuesta de cobro parcial perdida deliberadamente; después de reload la UI reconoce el recibo de 25 EUR y muestra 75 EUR pendientes. Un pago y una CxC de importe original 100/saldo 75. No se inició otro cobro al reabrir; el transporte puede repetir la misma petición idempotente.
- SRV-000029: finalización moderna y cobro driver de 100 EUR desde UI; un pago y una transición in_progress→completed.
- REM-000008: presentación desde UI conductor, recepción y verificación desde Caja. Recibir conserva cero movimientos de traslado; verificar deja una salida driver y una entrada central de 100 EUR, una reserva aplicada por 100 y ningún segundo pago de cliente. La UI muestra verified sin acciones de repetición.
- En la copia con otros fixtures, saldo operativo driver 270→170 EUR y central 164→264 EUR. Los importes son de prueba; no describen producción.
- Console final: sin errores/warnings capturados; lecturas y operaciones finales revisadas con HTTP 200. Los 500 iniciales de diagnóstico de la copia y la pérdida de respuesta simulada no se confunden con la captura final.

Limitación de entorno: la copia necesitó ANALYZE, JIT desactivado y un pool/timeout propios (1 conexión, 60 s) para completar sus consultas RLS con conteo exacto. Esto no modifica RLS ni el producto y **no certifica rendimiento bajo los timeouts normales de producción**. Revisar latencia/lecturas en el predeploy. Las bases/servicios de prueba son desechables; el Supabase original conserva 0049.

La persistencia de retry es sessionStorage: sobrevive al reload en la misma pestaña, no garantiza conservar la key al cerrar la pestaña o borrar su almacenamiento. Los recibos backend siguen siendo la autoridad y permiten reconocer un cobro propio ya aplicado. No se promete recuperación de un intento desconocido en otro dispositivo.

Clasificación local: PASS CON OBSERVACIONES. Sin BLOCKER/HIGH confirmados pendientes en los cuatro hallazgos corregidos; rendimiento del entorno y alcance de persistencia deben revisarse explícitamente antes de autorizar 0050 remoto. No constituye autorización de despliegue.

Limpieza final confirmada: cero bases elara_0050_* y cero contenedores de smoke restantes; script temporal eliminado. El Supabase local original continúa en 0049 y no contiene las RPC 0050. Se conserva únicamente una captura de evidencia fuera del repositorio. config.js mantiene SHA-256 D7B2A82708D12BFC557611FF3A9652F31FAA2CBBB04857248C9E1E06E0221AA1. Producción no fue consultada ni modificada; sin db push, commit ni push.
