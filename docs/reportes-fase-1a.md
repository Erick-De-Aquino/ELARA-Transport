# Reportes Fase 1A

Lecturas exclusivas de la interfaz bajo contexto activo confirmado `superadmin`.
Las fuentes conservan sus políticas administrativas existentes: esto no crea un
permiso de backend nuevo ni un contrato de agregación exclusivo de Superadmin.
No se realizan escrituras. Los dos scripts de datos simulados de Reportes dejan
de cargarse; los archivos históricos se conservan. No se invocan reconciliaciones.

## Fechas y métricas

Todos los límites y agrupaciones usan Europe/Madrid. Los campos SQL `date` se
conservan como fecha civil; los timestamps se convierten a Madrid. Periodos:
mes actual, 3/6/12 meses naturales incluyendo el actual, o personalizado inclusivo
de hasta 60 meses. Los filtros se conservan al cambiar de sección.

| Métrica | Criterio y fecha |
|---|---|
| Ingresos cobrados | `service_payments.payment_status=completed`, `paid_at`; se comprueba relación con servicio y financiero y moneda. Excluye pending/failed/cancelled/reversed. No suma precios ni movimientos de Caja. |
| Gastos registrados · aprobados | Subconjunto explícito `get_admin_expenses.status=approved`, `expense_date`, campo `amount` (total almacenado). Incluye aprobados todavía no pagados; no añade pagos ni reembolsos al gasto. |
| Servicios finalizados | Un servicio por UUID con cierre completed, fechado por `service_closures.closed_at`. |
| Tasa de finalización | Numerador: completed. Denominador: completed + cancelled + no_show + not_performed. Solo cierres terminales del periodo; no pendientes, futuros programados o en curso. Sin cierres: «Sin cierres», no 0 %. No mide satisfacción. |
| Cancelaciones | `services.cancelled_at`. Para cierres sin fecha directa se admite únicamente historial terminal inequívoco (`service_status_history.changed_at`); contradicciones impiden presentar totales completos. |
| Distribución por tipo | `services.scheduled_start_at`; tipo persistido, traducciones ya usadas en Servicios, código original para otros tipos; vacío: «Sin clasificar». Incluye programación, no equivale a finalización. |

El gráfico operativo agrupa no_show y not_performed como «No realizados»,
explicándolo en su encabezado. El económico presenta cobros y gastos en series
distintas y escalas identificadas por moneda; no representa beneficio neto.
Solo existen tres gráficos, también reutilizados al ampliar el modal.

## Análisis individual

- Conductor: consulta al seleccionar una entidad autorizada. La atribución usa
  `closure.assignment_id` o historial inequívoco; para cancelación sin vínculo
  explícito exige una sola asignación temporal compatible. Una asignación anterior
  no convierte un servicio reasignado en actividad de ambos conductores.
- Servicios del conductor: fecha terminal. Importes de sus servicios realizados:
  precios definitivos persistidos. Cobros de esos servicios: pagos confirmados
  dentro del periodo; son brutos del servicio, no participación del conductor.
- Liquidaciones: `get_admin_settlements` contrastado con cabeceras de `settlements`.
  Generadas según `generated_at`, excluyendo borradores. Participación: `driver_amount`
  almacenado en cabeceras generadas en el periodo, excluyendo anuladas/rechazadas;
  no se recalculan porcentajes, compensaciones ni versiones del contrato.
- Pagos al conductor: `settlement_payments.payment_status=completed`, `paid_at`,
  incluyendo pagos en el periodo de liquidaciones generadas anteriormente.
- Cliente particular/empresa: contrataciones según `services.created_at`,
  finalizados por fecha de cierre, frecuencia como número de días de Madrid con
  contrataciones. No se denomina satisfacción. Importes de contrataciones: solo
  si todos sus financieros tienen precio definitivo. Cobros: `paid_at` de los
  servicios del cliente, aunque se contrataran antes del periodo.
- Deuda del cliente: `v_admin_receivable_overview`, estados open/overdue/partial,
  `pending_amount` actual. No se filtra por el periodo ni se presenta como histórica.
- Evolución detallada: desglose mensual y tabla cronológica paginada a 25 filas;
  cliente por creación, conductor por evento terminal. No hay análisis de vehículos.

## Cobertura y seguridad

Se reutilizan `readAll`, `readRpc`, `shareRead` e indexación/exclusión QA/legacy.
Las identidades necesarias se leen para excluir descendientes de entidades QA.
La paginación valida recuento y UUID únicos y aplica el límite seguro existente.
Un error o cobertura ambigua produce «No disponible», nunca un total parcial.
Los importes se suman como céntimos BigInt por moneda. Los gráficos no admiten
sumas de céntimos superiores al rango entero seguro de JavaScript.
Se conservan los servicios históricos autorizados con borrado lógico: ese
marcador no anula por sí mismo sus cobros ni sus cierres registrados.

Las lecturas de tablas distintas no son un snapshot transaccional. Reflejan los
registros disponibles al consultar; no certifican un cierre histórico. Los estados
de pagos/gastos son sus estados actuales, no reconstrucciones de estados pasados.
No se inventan horas, kilómetros, rentabilidad neta ni valoraciones.

La base se carga al entrar/Actualizar y se reutiliza para cambiar periodos.
Los detalles solo se cargan al seleccionar una entidad; su caché queda limitada
a esa consulta del módulo. Actualizar, navegación y cambios de sesión invalidan
datos y gráficos. Se verifica contexto antes y después de lecturas y entre lotes;
respuestas tardías de otra entidad o sesión no pueden restablecer resultados.

Se mantienen las clases históricas de tarjetas, filtros, gráficos y modales.
PDF/Excel/CSV y «Preparar exportación» están deshabilitados. Chart.js 4.4.0 ya
existía en el proyecto; no se añade ninguna biblioteca.
