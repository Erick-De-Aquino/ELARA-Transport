# Gastos — Fase 1A

Se reutilizan el encabezado, las seis tarjetas, el listado, los filtros, la búsqueda, la paginación y los modales originales de Gastos (referencia `31b25e2`). El botón existente de acción principal muestra «Registrar gasto» en el extremo derecho con `button button--primary`. No se inicializan los controladores históricos ni se consultan datos mock.

## Fuentes e integridad

- `get_admin_expenses`: listado completo paginado con control de integridad y permisos. Categoría, fecha, concepto, responsabilidades, estado administrativo, pago, reembolso, relaciones y número de documentos.
- `get_admin_expense_detail`: cantidades originales, documentos, pagos, cuentas de Caja, reembolsos, historial y distribuciones. Los métodos de pago y referencias se consultan aquí; el contrato de listado no proporciona esos métodos.
- Los indicadores representan los registros del filtro completo, no una página. Importes aprobados, borradores, pago por ELARA, aprobado pendiente de pago y aprobado pendiente de reembolso permanecen separados. Los borradores, solicitudes y anulados no se presentan como gasto aprobado. Los importes pendientes de aprobación se conservan en las filas con su estado real.
- Totales en céntimos `BigInt`, separados por moneda. No se suman pagos, movimientos de Caja, distribuciones ni liquidaciones al importe del gasto. Se suspende el total monetario cuando faltan importes. Fechas en Europe/Madrid.

## Operaciones

- `create_expense`: únicamente borrador a cargo de ELARA en EUR (la RPC no recibe moneda), base e impuesto explícitos, categoría activa y relaciones reales opcionales con proveedor, servicio, vehículo y conductor. No registra pago ni salida de Caja. No admite crear adelantos ni simular estructuras mediante notas.
- `submit_expense`: envío de un borrador administrativo compatible a revisión. Los borradores del conductor mantienen su flujo de envío en el portal del conductor.
- `approve_expense` / `reject_expense`: gastos enviados; motivo obligatorio para rechazar.
- `register_expense_payment`: pago total en efectivo de un gasto aprobado a cargo de ELARA y sin pagar. La RPC fija el importe, bloquea el registro, comprueba el saldo y crea el pago y el único movimiento de Caja.
- `reimburse_expense`: reembolso en efectivo de un adelanto aprobado de conductor, pendiente y reembolsable. No se utiliza para adelantos de usuarios.
- `cancel_expense`: Superadmin, motivo obligatorio, estados compatibles y sin pagos/reembolsos completados. No revierte movimientos.

La interfaz bloquea conservadoramente pago, reembolso y anulación cuando el contrato de lectura informa referencias a liquidaciones, incluidas las históricas: no aporta un indicador inequívoco de bloqueo activo. El backend conserva la validación final y el bloqueo transaccional. No se modifica Caja, Servicios, Liquidaciones ni 0050.

## Respuestas inciertas y límites

Las RPC administrativas utilizadas no ofrecen clave idempotente de creación. Cada envío se conserva en almacenamiento de sesión asociado al actor y contexto antes de despacharlo. Se bloquean envíos simultáneos y no se reenvía un resultado incierto. El botón de revisión ejecuta exclusivamente lecturas. Una creación sin identificador confirmado requiere revisión administrativa antes de permitir otro registro; no se atribuye por coincidencia de campos ni se inventa un recibo. Esta protección local no sustituye un contrato de idempotencia entre dispositivos.

Los errores conocidos de validación o autorización permiten corregir el formulario; una operación confirmada solo refresca lecturas. Los saldos y el listado no cambian antes de la confirmación. Se conservan filtros, búsqueda y página durante las operaciones. Navegación, cierre y cambio de sesión invalidan respuestas tardías; las respuestas de un actor anterior conservan su propio espacio de intentos.

No se habilita edición general (falta RPC administrativa de actualización), reversión de pagos/reembolsos (falta contrato seguro de reversión de Gastos), ni carga/descarga de archivos desde esta ficha. Se muestran metadatos y referencias originales; el flujo privado de archivos queda pendiente de integrar con autorización de Storage. No se crean nuevas RPC ni migraciones.

## Archivos

- `src/js/expenses.js`
- `src/css/responsive.css` (reglas acotadas a Gastos)
- `tests/expenses-presentation-harness.cjs`
- `tests/expenses-presentation.test.cjs`
- `tests/expenses-admin.local.test.cjs`
- `tests/expenses-presentation.visual.cjs`
- `docs/gastos-fase-1a.md`

## Validación

Pruebas de lectura/presentación con fixtures aisladas y nueve escenarios de escritura del controlador real contra PostgreSQL local en memoria, con transacciones revertidas: ciclo administrativo y pago de 0,29 EUR, creación y pago con respuesta perdida, saldo insuficiente, permisos, rechazo, reembolso separado del pago, anulación Superadmin, formulario real con refresco y doble envío/cambio de actor.

Chrome local en 390, 640, 768, 1024 y 1440 px: listado, detalle, formulario, pago, encabezado alineado a la derecha, pie del formulario alcanzable, paginación, IDs únicos y ausencia de desbordamientos. Pendiente la validación visual autenticada del usuario. Sin consultas ni escrituras remotas de prueba, cambios de rama, commits, push o deploy. Se conserva el trabajo previo y el respaldo `1be4711`.

Resultado final: **638 PASS / 0 FAIL** en la suite global, incluidos 13 casos de presentación y 9 escenarios PostgreSQL locales nuevos. `git diff --check` correcto, incluidos los archivos nuevos. Los hashes previos confirman que únicamente cambiaron `src/js/expenses.js` y `src/css/responsive.css` entre los archivos existentes de frontend y SQL; los demás módulos y las migraciones permanecen intactos en esta intervención.
