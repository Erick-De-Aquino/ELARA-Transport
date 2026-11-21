# Caja Fase 1A

Se recuperan los nodos y estilos de `31b25e2`: resumen, columnas, rendiciones, historial, discrepancias, movimientos, arqueos y modales. El botón existente de ajuste se reutiliza en el encabezado como «Registrar movimiento», con `button button--primary`. No se inicializan los controladores ni los datos mock históricos.

## Fuentes y significado de las cifras

| Presentación | Fuente | Significado |
| --- | --- | --- |
| Saldo calculado de cada cuenta | `v_admin_cash_account_overview.theoretical_balance` | Saldo inicial más movimientos firmados. No es un saldo conciliado. |
| Validación del saldo | `cash_accounts`, `cash_movements` y `get_admin_cash_movements` | Se exige una lectura completa, sin registros excluidos y coincidente con la vista. Si falta información o cambian las cifras se muestra «Importe no disponible». |
| Ingresos y egresos del filtro | `get_admin_cash_movements` | Número de registros de cada naturaleza; no sumas de custodia ni previsiones. Los importes individuales conservan naturaleza y moneda. |
| Rendiciones | `get_admin_cash_remittances` y su detalle | Declarado y verificado se distinguen. Una presentación o recepción no se interpreta como traslado confirmado a central. |
| Discrepancias | `get_admin_cash_discrepancies` y su detalle | Esperado, real y diferencia originales; no son nuevos movimientos. |
| Arqueos | `cash_counts`, bajo RLS | Cantidad esperada y contada en ese arqueo y su estado original; no se presentan como saldo actual conciliado. |

La comprobación y el formato decimal usan céntimos enteros con `BigInt`; no suman monedas ni tipos de cuenta entre sí. Las fechas se muestran y filtran en Europe/Madrid. No se utilizan servicios previstos, precios ni servicios completados para calcular efectivo.

## Operaciones

- `create_cash_movement`: ingreso/egreso manual en cuenta central o administrativa activa, concepto obligatorio, importe decimal exacto e intento inmutable con clave de idempotencia. Se comprueba el movimiento por lectura; una pérdida de respuesta no genera una clave nueva ni un reenvío automático. La auditoría la produce el backend.
- `receive_cash_remittance` y `verify_cash_remittance`: se reutiliza el flujo operativo existente de 0050. Tras una respuesta incierta se relee el estado; no se duplica un cobro de cliente ni se anticipa un traslado a central.
- `review_cash_discrepancy`, `resolve_cash_discrepancy` y `cancel_cash_discrepancy`: revisión/resolución administrativas y cancelación exclusiva de Superadmin, con notas obligatorias cuando corresponden. No modifican los importes ni generan movimientos.
- Preparación de central: controlador administrativo 0051 existente, sin duplicarlo.

Los cobros, pagos de gastos y liquidaciones continúan en sus módulos y contratos actuales. No hay edición directa de movimientos. El registro de arqueos permanece deshabilitado: existe `create_cash_count`, pero no un recibo recuperable/idempotente para habilitar aquí un reintento seguro. No se inventa un contrato de conciliación/cierre de arqueos. Las reversiones genéricas tampoco se ofrecen como sustituto de los flujos de corrección por origen; la RPC `reverse_cash_movement` exige Superadmin y no reemplaza la reversión de un pago de servicio.

## Validación

Datos aislados de presentación, precisión, monedas, signos, filtros, paginación, errores, sesión, navegación, doble envío y respuestas inciertas. Pruebas PostgreSQL en memoria del alta manual real, céntimos, saldo y auditoría, incluyendo respuesta perdida. Responsive a 390, 640, 768, 1024 y 1440 px. Sin escrituras ni consultas de prueba en producción. Pendiente validación visual autenticada.
