# Clientes 1C.4 — activar e inactivar particulares

Implementación local del frontend, 17/11/2026. Sin consultas ni modificaciones
en Supabase remoto, migraciones, estados reales o registros de producción.

- Interacción dentro de `#customer-detail-modal`, conservando la ficha y su
  botón «Activar / Inactivar». No se usa un segundo modal ni se añade estado
  al formulario Nuevo cliente.
- Nuevo: Activar / Inactivar como acciones diferenciadas. Activo: Inactivar.
  Inactivo: Activar. Acción seleccionada resaltada y confirmación explícita.
- Empresa y Bloqueado: sin acciones no soportadas y con nota de restricción.
- Motivo obligatorio para todo cambio. Persona activa y lectura reciente del
  estado; prevalidación de servicios no terminales antes de inactivar.
- Única escritura: `admin_set_customer_status(p_customer_id,p_status,p_reason)`.
  Autorización y reglas finales en servidor, sin UPDATE de tablas desde el cliente.

Se inspeccionó el contrato real 0048: solo particulares; transiciones new→active,
new→inactive, active→inactive e inactive→active; sin retorno a new. El servidor
bloquea servicios no terminales y exige persona activa, con lock de services y
de la fila del cliente. No se modificó SQL.

## Confirmación, concurrencia e incertidumbre

No se actualiza el estado desde el borrador. Tras respuesta válida se leen de
nuevo los datos, se renuevan listado/contadores y se abre la ficha actualizada.
Se conservan búsqueda, filtros y página, limitada si cambia el tamaño del filtro.
Incluso si el cliente deja de pertenecer al filtro, su ficha sigue abierta y el
filtro se conserva. Las opciones del filtro incorporan los estados recién aparecidos.

Doble envío bloqueado, contexto de sesión/actor/rol/endpoint comprobado, respuestas
tardías descartadas. Un éxito con fallo de recarga solo reintenta lecturas.

**Límite del contrato:** no recibe request_id ni versión esperada y no genera
recibos inmutables para esta operación. No se le atribuyen garantías de CAS ni
exactamente una ejecución que no ofrece. La UI detecta un estado cambiado en la
lectura previa; los locks del servidor mantienen sus restricciones transaccionales,
pero no son un CAS entre esa lectura y la llamada.

Ante respuesta incierta, no se reenvía automáticamente ni se ofrece un botón
que repita la escritura. «Comprobar estado (solo lectura)» muestra el estado
actual sin atribuirlo con certeza al envío anterior. Solo después de comprobarlo
puede el usuario preparar explícitamente otro cambio, con nuevo motivo y lectura.
El intento pendiente se conserva por actor/cliente al cerrar/reabrir la ficha.

## Archivos y validación

Aplicación:

- `src/js/catalog-admin.js`: interacción de estado, protección de envío y mensajes.
- `src/js/customers.js`: entrada desde ficha, restricciones y coordinación de recarga.
- `src/js/operational-data.js`: callback opcional de recarga de filas conservando
  controles y contexto de detalle, utilizado solo por Clientes. Dashboard y
  Servicios mantienen sus rutas/comportamiento y no se editaron sus módulos.

Pruebas: `tests/catalog-admin.test.cjs`, `tests/customers-presentation.test.cjs`
y `tests/customers-presentation.visual.cjs`.

- **539 pruebas globales PASS, 0 FAIL, 0 omitidas.**
- 9 escenarios específicos de opciones, permisos, motivo, persona/servicios,
  estado obsoleto, doble envío, incertidumbre y cierre/sesión/navegación.
- Flujo desde ficha contra SQL 0048 local real: las cuatro transiciones, rechazo
  por servicio creado tras la prelectura, respuesta perdida sin reenvío, fallo
  posterior de lectura, ficha/listado/contadores y filtros/página conservados.
- Caso específico del primer estado nuevo que aparece en el filtro.
- Responsive en 390, 640, 768, 1024 y 1440; cancelación, confirmación accesible,
  un único modal y regresiones de ficha/historial/contactos.
- Sintaxis JS y `git diff --check` correctos. Regresiones de altas particular y
  empresa, contactos 0056, Dashboard y Servicios incluidas en la suite global.

No se modificó HTML/CSS, SQL, RLS, contratos o configuración. Rama y respaldo
1be4711 conservados; sin commit, push, merge o deploy. Evidencia en
`customers-1c4-status-results.json`.

**Detenido para validación visual autenticada del frontend local.**
