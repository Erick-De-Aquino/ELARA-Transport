# Liquidaciones — Fase 1A

Restauración de los componentes originales de `31b25e2`: encabezado, siete tarjetas, listado, búsqueda, filtros, paginación, detalle, desglose, historial y formularios existentes. El botón del encabezado «Generar liquidación» reutiliza `button button--primary`. No se inicializan controladores históricos, configuraciones mock ni persistencia financiera alternativa.

## Fuentes y significado de los importes

- `get_admin_settlements` y `get_admin_settlement_detail` (0044): identificación, periodos, estados, importes y porcentajes almacenados, servicios, pagos e historial.
- Lectura autorizada de `settlements` bajo RLS: `calculation_version`, `cash_offset_amount`, `payable_amount` y `percentage_source` incorporados en 0046, ausentes del contrato de lectura 0044. Se contrastan identidades, estados, fechas y cantidades comunes antes de combinar las respuestas. Si no coinciden o están incompletas, se pide actualizar y no se muestran totales parciales.
- `preview_settlement_generation` (0046): condiciones reales de elegibilidad, exclusiones, reglas vigentes y porcentajes por servicio, bruto, participación del conductor, importe ELARA y compensación propuesta. La generación recalcula y valida de nuevo en servidor; la previsualización se presenta como tal.
- Se distinguen precio bruto/base, participación del conductor, importe ELARA, deducciones, ajustes, efectivo reservado, importe pagable, pago efectivo y pendiente. No se suman movimientos de Caja, pagos ni gastos otra vez al importe de la liquidación.
- En versión 2 se muestran los porcentajes de cada servicio. La regla de cabecera es referencia, no un porcentaje global aplicado en el navegador. En versión 1 se conservan los porcentajes y cantidades históricos, sin recalcularlos.
- La compensación reservada no es pago ni salida de Caja. Una liquidación totalmente compensada puede tener `payment_status=paid` con `paid_amount=0`: se muestra «Sin saldo pendiente» y no se cuenta como un pago efectivo completo.
- Los indicadores abarcan todos los registros del filtro y separan monedas. «Aprobado pendiente» suma solo saldos de liquidaciones aprobadas. Céntimos exactos `BigInt`, incluyendo ajustes negativos; sin fórmulas de comisión en JavaScript. Fechas en Europe/Madrid. Las tarjetas sin registros muestran `0`.

## Operaciones disponibles y restricciones reales

- Previsualizar servicios liquidables y excluidos; generar mediante `generate_settlement`. Selección de un conductor activo y fechas; sin porcentajes, importes ni servicios editables. Internos: mes natural completo. Externos: semana de lunes a domingo. El backend determina las reglas y redondeos; la generación requiere servicios completados, precio definitivo y condiciones económicas compatibles.
- `submit_settlement`: **generated → submitted**. Los triggers vigentes no permiten enviar un borrador directamente, aunque la RPC antigua enumere también `draft`.
- `approve_settlement` / `reject_settlement`: **submitted → approved/rejected**. Los triggers no permiten aprobación/rechazo directo desde `generated`. Motivo obligatorio al rechazar.
- `pay_settlement`: todo el saldo pendiente de una liquidación aprobada, en efectivo y desde una cuenta activa central/administrativa de la misma moneda. La RPC obtiene el importe y crea el pago y un único movimiento de Caja. No admite elegir importe parcial; la UI no añade cálculos ni reglas financieras distintas.
- `cancel_settlement`: draft/generated/submitted, con motivo.
- `cancel_approved_settlement`: solo Superadmin, aprobada y sin pagos completados. No se utiliza como reversión de pagos.

Se muestran pagos parciales históricos cuando existen, pero no se ofrece una operación de pago parcial: falta un contrato operativo que reciba ese importe. `annul_settlement_payment` es un marcador no implementado y no está autorizado a `authenticated`; no se habilita. Tampoco hay flujo administrativo seguro para editar repartos, añadir ajustes/deducciones o configurar reglas desde esta ficha.

**Anular o rechazar no libera servicios incluidos ni reservas de compensación.** Así lo define 0046; se avisa antes de confirmar y en el detalle. Falta un procedimiento explícito de conciliación/liberación para reutilizarlos. Los reembolsos informados en la previsualización no se convierten en deducciones automáticas.

## Seguridad y recuperación

Permisos administrativos, RLS, identificadores reales y validación final en servidor. Bloqueo de doble envío y comprobación de sesión, vista y estado actual antes del envío. Si cambia la previsualización, hay que consultarla otra vez. El servidor sigue siendo la autoridad ante concurrencia durante la generación.

Estas RPC no proporcionan claves idempotentes de solicitud. El intento se conserva en almacenamiento de sesión del actor y contexto antes de enviarlo. Una respuesta incierta no se reenvía automáticamente ni con otra clave. «Revisar estado remoto» solo lee; una generación sin identificador confirmado requiere revisión administrativa. No se atribuye una operación por coincidencia de datos. Esta protección local no sustituye idempotencia contractual entre dispositivos.

Una respuesta confirmada permite refrescar solo lecturas. El listado, búsqueda, filtros y página se mantienen. Cierre, navegación y cambio de sesión invalidan respuestas tardías. Las respuestas de una sesión anterior conservan su propio espacio de intentos.

Ajuste compartido mínimo: opción `keepEmptyFilters` en el adaptador de lectura, habilitada únicamente por Liquidaciones. Mantiene los cuatro filtros en el primer listado vacío para poblarlos después de generar, sin remontar la vista ni perder búsqueda. Sin esta opción, el adaptador descartaba al inicio los filtros sin resultados. El comportamiento de los demás módulos permanece igual.

## Archivos de esta intervención

- `src/js/settlements.js`
- `src/css/responsive.css` (reglas acotadas a Liquidaciones)
- `src/js/operational-data.js` (opción de presentación de filtros vacíos)
- `tests/settlements-presentation-harness.cjs`
- `tests/settlements-presentation.test.cjs`
- `tests/settlements-admin.local.test.cjs`
- `tests/settlements-presentation.visual.cjs`
- `docs/liquidaciones-fase-1a.md`

## Validación

Doce pruebas de presentación y diez escenarios del controlador real contra PostgreSQL local en memoria, con transacciones revertidas: generación, envío, aprobación, pago único, regla semanal externa, compensación sin pago, servicios incompletos excluidos, respuestas inciertas, anulación con reservas conservadas, formulario con refresco sin perder búsqueda, concurrencia/sesión/permisos y cancelación aprobada con las restricciones de Superadmin.

Chrome local aislado en 390, 640, 768, 1024 y 1440 px: listado, detalle, previsualización y pago; botón alineado a la derecha, formularios desplazables con pie accesible, paginación, IDs únicos y ausencia de desbordamientos.

Sin consultas ni escrituras remotas de prueba, migraciones, cambios de contratos, rama, commits, push, merge o deploy. Se conserva el trabajo previo y el respaldo `1be4711`. Pendiente la validación visual autenticada del usuario.

Resultado final: **660 PASS / 0 FAIL** en la suite global. `git diff --check` correcto, incluidos los archivos nuevos. Los hashes previos confirman que los únicos archivos existentes de frontend/SQL modificados en esta intervención son `settlements.js`, `operational-data.js` y `responsive.css`; las migraciones y los demás módulos permanecen intactos.
