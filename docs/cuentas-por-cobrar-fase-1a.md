# Cuentas por cobrar — Fase 1A

Restauración de los componentes originales de `31b25e2`: encabezado, cinco tarjetas, filas de cartera, filtros, búsqueda, paginación y modal existente. No se inicializan los controladores ni la conciliación demo.

## Fuentes y operaciones

- `v_admin_receivable_overview`: deuda exigible, cobrado aplicado, pendiente, cliente, servicio, moneda, vencimiento y estado. No se suman precios previstos, facturas ni movimientos de Caja. Los totales se agrupan por moneda y se calculan con céntimos `BigInt`; una incoherencia impide presentar el total como confirmado.
- Vencido: saldo de una cuenta abierta/parcial con `due_at` registrado y anterior al momento de consulta. No se infieren fechas ni se modifica el estado administrativo. Fechas en Europe/Madrid.
- Detalle: `get_service_financial_close_context`, lectura de `receivable_allocations` y `service_payments` bajo RLS, `get_admin_cash_movements` para identificar los movimientos y cuentas de Caja asociados, y nueva lectura de la cuenta. Los pagos anulados/revertidos mantienen su estado y no se suman al saldo. El importe del pago se identifica como tal, distinto del cobrado aplicado a la cuenta.
- Cobro: controlador compartido `ElaraFinancialClose`, RPC `collect_receivable_cash` de 0050, cuenta central/administrativa, precio definitivo y servicio completado. Conserva validación remota, recibos, clave idempotente, bloqueo de doble envío y recuperación de respuestas inciertas. El botón solo aparece para una cuenta cobrable confirmada.
- Ajuste compartido mínimo: guardia opcional de vigencia de la vista y refresco de CxC sin remontar el listado. Conserva búsqueda, filtros y página. Incluye recuperación de un intento administrativo previo abierto desde CxC.

## Límites

No hay acción global de crear/reconciliar deuda. La vista no aporta factura ni una previsión separada: no se inventan ni se contabilizan. Sin `due_at` se indica que no hay vencimiento registrado.

No se habilitan anulación, cambio manual de estado o edición de vencimiento. Existen RPC históricas `annul_receivable_payment`/`reverse_service_payment`; no se reutilizan como un flujo nuevo sin una recuperación inequívoca del intento y validación de compatibilidad con recibos/custodia de 0050. La anulación carece del recibo idempotente de cobro utilizado por esta interfaz. No se afirma que esas RPC no existan.

## Verificación

Pruebas aisladas de presentación y del controlador financiero: importes exactos, monedas, estados, vencimientos, historial revertido, permisos, búsqueda/filtros/paginación, lecturas tardías, sesión/navegación, aperturas repetidas, vacíos, errores y refresco confirmado. La suite global incluye las pruebas PostgreSQL locales de 0050 y las regresiones de los módulos aprobados.

Chrome local aislado en 390, 640, 768, 1024 y 1440 px: listado, detalle, acción de cobro, paginación alcanzable, IDs únicos y ausencia de desbordamientos. No se realizaron cobros ni escrituras remotas. Pendiente la validación visual autenticada del usuario.

Resultado final: **616 PASS / 0 FAIL** en la suite global. `git diff --check` correcto, incluidos los archivos nuevos. Sin cambios de rama, commits, push o deploy; sin modificar migraciones ni descartar trabajo previo.

Archivos de esta intervención:

- `src/js/receivables.js`
- `src/js/financial-close.js` (guardia opcional y refresco compartido)
- `src/css/responsive.css` (reglas acotadas a CxC)
- `tests/receivables-presentation-harness.cjs`
- `tests/receivables-presentation.test.cjs`
- `tests/receivables-presentation.visual.cjs`
- `tests/financial-close.test.cjs`
- `docs/cuentas-por-cobrar-fase-1a.md`
