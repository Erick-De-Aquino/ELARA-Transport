# ELARA Transport: auditoría de interfaz y cierre temporal de rendimiento

Fecha: 12 de noviembre de 2026 (Europe/Madrid).
Estado: auditoría y propuesta para revisión; NO autoriza implementación.

## 1. Alcance y estado de trabajo

Se pausa la investigación de rendimiento por instrucción del responsable del
proyecto. La prioridad propuesta pasa a recuperar progresivamente la experiencia
visual prevista, manteniendo la arquitectura operativa actual. Los tiempos no
son bloqueantes si la operación es correcta.

HEAD inspeccionado: `8464445060493f7ccb099061a970fa56f87a19f7`.
Rama: `main`. La rama local contiene además cambios sin commit:

- `src/js/config.js`: remoto por defecto, local explícito y separación Auth en loopback.
- `src/js/services.js`, `src/js/operational-data.js`, `src/css/responsive.css`:
  Fase 1A y optimización frontend de lecturas.
- Tests nuevos: `config-supabase`, `navigation-load`, `services-presentation`,
  su harness y script de verificación visual.

Estos cambios se conservan. Este informe no los publica, elimina ni revierte.
La implementación de optimización no debe confundirse con una corrección del
overview remoto ni con una nueva interfaz definitiva de Dashboard.

## 2. Registro de rendimiento aportado por el usuario

Mediciones manuales del frontend local conectado al proyecto remoto. No se
capturó un HAR completo; no se recibieron credenciales ni cabeceras Auth.

| Transición | Hasta mostrar contenido | Fetch/XHR | Requests más lentos / observaciones |
| --- | ---: | ---: | --- |
| Dashboard → Servicios | 6,45 s | No informado | Overview 7,43 s; services 4,62 s; persons 4,46 s; drivers 3,86 s; vehicles 3,59 s. Todos 200. |
| Servicios → Dashboard | 5,70 s | 7 | Overview 5,28 s; services 3,39 s; persons 3,28 s. Todos 200. |
| Servicios → Clientes | 1,40 s | 9 | persons 1,06 s; locations 971 ms; customers 407 ms; cinco contextos financieros visibles. Todos 200. Captura con trabajo ajeno al cargador de Clientes. |
| Clientes → Servicios | 7,50 s | 13 | Overview 5,84 s; services 4,08 s; persons 3,87 s; cinco contextos. Todos 200. |
| Servicios → Conductores | 2,43 s | 2 | persons 2,00 s; drivers 1,33 s. Sin locations/contextos. Todos 200. |
| Conductores → Servicios | 6,89 s | 13 | Overview 5,42 s; services 3,59 s; persons 3,43 s; cinco contextos. Todos 200. |

La duración del overview de la primera captura supera el cronómetro total.
No se puede tratar esa fila como un waterfall perfectamente delimitado.
No hubo muestras repetidas suficientes para una comparación causal antes/después.

### Desglose de una lectura del overview

- GET, `select=*`, `order=service_id.asc`, `offset=0`, `limit=500`.
- `Prefer: count=exact`; `Content-Range: 0-15/16`.
- Queueing 14,08 ms; Stalled 36,51 ms; envío 0,18 ms.
- TTFB 5,18 s; descarga 3,32 ms; total 5,23 s.
- `x-envoy-upstream-service-time: 5063` ms; `server-timing: cfExtPri`.

Conclusión acotada: esa espera corresponde principalmente al servicio upstream,
no a transferir 16 filas ni a la cola del navegador. No separa PostgreSQL,
políticas RLS, planificación, pool o gateway. La pila del iniciador disponible
solo mostraba el SDK; no se obtuvo plan SQL ni se cambió SQL.

### Lecturas aisladas de proyección, mismo orden/rango

| Proyección | Conteo exacto | Tiempo | Filas |
| --- | --- | ---: | ---: |
| Todas las columnas, control inicial | Sí | 5,12 s | 16 |
| Todas las columnas | No | 4,35 s | 16 |
| Solo service_id | No | 1,00 s | 16 |
| Básicos del servicio | No | 0,94 s | 16 |
| Básicos + cliente | No | 1,72 s | 16 |
| Básicos + asignación/conductor/vehículo | No | 1,06 s | 16 |
| Básicos + finanzas | No | 1,36 s | 16 |
| Básicos + CxC | No | 0,92 s | 16 |
| Todas las columnas, repetición | No | 2,17 s | 16 |
| Todas las columnas, repetición | Sí | 2,89 s | 16 |

Todas devolvieron error null. Diferencias observadas con/sin conteo: 0,77 y
0,72 s, sin atribución definitiva por variabilidad temporal. Ningún grupo
aislado reproduce por sí solo la primera espera de más de cuatro segundos.
No se decidió eliminar columnas, conteo, joins ni controles.

### Trabajo después de abandonar Servicios

- Salida de control, Servicios completamente cargado → Clientes: solo companies
  (354 ms), customers (592 ms) y persons (1,17 s).
- Salida inmediata durante carga: siete lecturas de Servicios y tres de Clientes;
  se repiten persons/companies/customers entre dos navegaciones distintas.
- El overview terminó HTTP 200 en ~6 s, TTFB ~5,94 s. Comenzó a ~18,81 ms.
- El customers de Clientes comenzó a ~580,57 ms y tardó ~2,04 s:
  Stalled ~863,95 ms; TTFB ~1,15 s.
- Por tanto, hubo unos 5,4 s de solapamiento del overview antiguo con la nueva
  navegación. No aparecieron locations ni contextos posteriores de esa carga.

Los guards evitan aplicar resultados viejos y frenan etapas siguientes; no
cancelan el HTTP ya iniciado. Dos nombres iguales no equivalen por sí solos a
doble inicialización: en esta prueba corresponden a dos módulos sucesivos.

### Deuda técnica suspendida

| ID | Pendiente | Condición de cierre futura |
| --- | --- | --- |
| PERF-01 | Desglosar ejecución remota del overview, joins/RLS/conteo | Plan y mediciones autorizadas de solo lectura; cambio separado si procede. |
| PERF-02 | Validar efecto de proyecciones y count con series alternadas | Varias muestras comparables; conservar paginación completa y filtros. |
| PERF-03 | Cancelar o reducir trabajo HTTP obsoleto | Cancelación por consumidor/ámbito que no perjudique lecturas compartidas. |
| PERF-04 | Revisar volumen de dependencias QA | Equivalencia probada de marcadores, ancestros y exclusiones antes de proyectar/reducir. |
| PERF-05 | Posible enriquecimiento progresivo de rutas/cierre | Aprobación UX; estados desconocidos explícitos y filtros globales correctos. |
| PERF-06 | Seguimiento de cinco contextos financieros | Conservar contrato 0050; ninguna inferencia de cierre a partir de importes. |
| PERF-07 | Reutilizar formateadores/adaptación | Sin persistir datos de negocio ni alterar precio draft/0/positivo. |

No se continuarán experimentos ni optimizaciones en esta fase de restauración.

## 3. Procedencia de la interfaz

| Referencia | Evidencia | Uso correcto |
| --- | --- | --- |
| `docs/05-ui-ux.md`, `docs/wireframes/dashboard.md`, `docs/wireframes/servicios.md` | Documentos 0.1.0 presentes desde `04b2c64`, 31/07/2026 | Intención UX y estructura; no demuestran contratos actuales para cada función. |
| `04b2c6417ef48a11d80c8564305b51e2cb73eb02`, tag `v4.0.0-mvp` | El tag apunta al commit inicial | Referencia antigua; el nombre del tag no lo convierte en estado final actual. |
| `31b25e2b634062cb998bc630b5aecb02f49bee48`, 10/10/2026 | Padre inmediato de a765739; última referencia anterior al reemplazo genérico | Base de presentación rica a comparar por componentes, sin copiar archivos completos. |
| `a765739d2e72025a984396c3a8325f7e592e573b`, 23/10/2026 | Introdujo operational-data/catalog-admin, guards legacy y entradas operativas | Arquitectura que debe conservarse y punto probado de desconexión visual. |
| HEAD + cambios locales | 0050–0054, correcciones driver/Auth/precio y Fase 1A | Autoridad para comportamiento operativo ya validado. |

En refs locales solo se observó main/origin/main y ese tag; no una rama separada
identificada como «interfaz definitiva». No se afirma que existan o no diseños
externos al repositorio.

La referencia visual propuesta es la implementación rica de 31b25e2 contrastada
con los wireframes y con la aprobación del responsable. No hay un único snapshot
que pueda restaurarse como producto completo, definitivo y conectado.

En Dashboard el blob de dashboard.js en 31b25e2 coincide con el inicial:
`906ca410ef1ef684f17c0f7c46200f12c45aef20`. La especificación y el render histórico
no coinciden totalmente: el wireframe incluye ingresos, pendientes/cancelados;
getDashboardMetrics presenta servicios hoy/en curso y capacidad interna/externa.
La composición final de métricas requiere revisión, no una elección silenciosa.

## 4. Componentes conservados y punto de desconexión

- `src/index.html:119`: Dashboard original con summary-cards, dashboard-grid,
  alerts-list, upcoming-services, incidents-list y recent-activity-list.
- `src/index.html:175`: estructura original de Servicios, resumen, toolbar,
  filtros, listado e historial; hay otros paneles/modales en el mismo HTML.
- CSS base conservado: variables, base, layout, sidebar, header, buttons, forms,
  cards, tables, modals, pages y responsive.
- Entre 31b25e2 y HEAD, index.html solo añade los cuatro scripts operativos;
  no se suprimieron los bloques originales. En CSS solo cambia modals.css con
  26 líneas del cierre financiero. Localmente hay además los overrides de Fase 1A
  en responsive.css, que deben preservarse.
- `operational-data.js:214`, panelFor: oculta los hijos originales de la vista
  y monta un panel operativo. Esto explica por qué el HTML sigue presente pero
  no se ve.
- `dashboard.js:46,67`: initDashboard retorna sin inicializar handlers antiguos;
  showDashboard retorna showOperationalDashboard. La ruta actual, al final del
  archivo, dibuja tabla genérica y resumen real, no el centro de operaciones.
- El patrón de guard y entrada operativa también está en Clientes, Conductores,
  Vehículos, Gastos, Liquidaciones y CxC. Caja entra por showOperationalCash.

Los textos de comentarios «mock» o «read-only» no bastan para clasificar un
archivo entero: coexisten código antiguo y wrappers operativos de escritura.

## 5. Inventario por módulo

| Módulo | Presentación recuperable | Situación funcional / adaptación necesaria |
| --- | --- | --- |
| Dashboard | Resúmenes, tres zonas operativas, alertas, próximos servicios, incidencias y actividad; renderers en dashboard.js | La entrada real es genérica. Renderers antiguos leen mocks de servicios, clientes, conductores, vehículos, incidencias y actividad; getDashboardServices llama reconciliación legacy. No reactivar initDashboard/renderDashboard sin adaptación. |
| Servicios | Fase 1A YA recupera resumen/toolbar/cards/responsive con datos reales. Detalle rico e historial originales siguen en services.js y HTML | Preservar entrada actual, UUID, estados, wrappers y Fase 1A. Fase 1B debe adaptar detalle/historial, no reactivar cálculos financieros, formularios ni initServices legacy. |
| Clientes | Resumen, cards, filtros y detalle particular/empresa en customers.js | Catálogo actual usa datos reales y ElaraCatalogAdmin. Edición general/bloqueo/altas complejas antiguas no equivalen a contratos permitidos actuales. |
| Conductores | Listado, fichas, estados y presentación de vínculos en collaborators.js | Mantener driver/person IDs, lifecycle y vínculos reales; portal 0051 y provisionamiento siguen por admin-controls/financial-close. Preferencia manual no significa disponibilidad operativa comprobada. |
| Vehículos | Cards, documentos, incidentes y vínculos en vehicles.js | Mantener elegibilidad/documentación reales. No volver a asignación mock ni interpretar manual_status available como elegibilidad. |
| Caja | Paneles/resúmenes/rendiciones/discrepancias en HTML/cash.js; existen implementaciones reales además de legacy | Mantener rutas actuales, movimientos/remesas/discrepancias, central operativa y guards; no sustituir ledger por finance.mock ni cálculos locales. |
| CxC | Listado, filtros y fichas en receivables.js/HTML | Mantener overview y cobro vía contrato 0050. Las acciones históricas y métodos de pago visibles antiguos no son autorización para habilitarlos. |
| Gastos | Listado, formularios y detalle ricos en expenses.js | Hay código real de lectura/pago/reembolso previo, actualmente rodeado por entrada genérica. Recuperar presentación pasando por contratos vigentes; no reconectar todo el módulo a ciegas. |
| Liquidaciones | Paneles/filtros/detalle en settlements.js y helpers actuales | Conservar generador/consulta, protección de saldo y estados actuales. Que exista un handler real antiguo no prueba que deba activarse junto al nuevo. |
| Reportes | Layout, gráficos Chart.js e historial en reports.js | No está sustituido por una entrada genérica: sigue usando mocks/snapshots históricos. No presentar esos números como producción; requiere adaptación contractual aparte. |
| Usuarios | Página y formularios antiguos presentes | showUsers termina en unavailableView. initUsers sí sigue preparando estado/handlers antiguos; no retirar HTML sin analizar esas referencias. No confundirlo con acceso real del conductor vía 0051. |
| Configuración | Tarjetas/formularios presentes | showSettings termina en unavailableView; inicialización antigua continúa. Contratos para editar esos parámetros no quedan demostrados por tener formulario. |
| Portal conductor | Presentación propia y flujos reales actuales en driver.js | No incluirlo en restauración administrativa. Preservar cierre de modal, precio definitivo, 0053, aceptación 0054 y finanzas/gastos reales. |

## 6. Qué reutilizar y qué NO reactivar

Reutilización directa de presentación: tokens, rejillas, paneles, cards, botones,
chips, campos y contenedores originales. El HTML de un componente no demuestra
que todos sus controles tengan backend válido.

Requieren adaptación: renderers que acceden a Elara*Mock, helpers de nombres/IDs,
fechas, estados, agregados y enlaces de navegación. Usar view-models puros y filas
reales; nunca poblar mocks para satisfacer un renderer antiguo.

NO recuperar automáticamente: inicializadores completos, reconciliación local,
generación de IDs, fórmulas financieras, lifecycle local, escrituras mock,
permisos simulados o acciones no soportadas por los contratos actuales.

Conservar como capa funcional: operational-data, router, auth, permissions,
catalog-admin, admin-controls, financial-close y RPC existentes. Las cinco
consultas 0050 de los completados siguen intactas. No inferir cierre desde pago
o saldo; no confundir completed con cierre resuelto.

Montaje único: reutilizar contenedores existentes o montar un renderer opcional
en el panel operativo con una sola instancia de cada componente/ID. No copiar
bloques con IDs duplicados ni añadir una segunda colección de clases CSS. El
renderer genérico debe seguir disponible como fallback de los módulos pendientes.

## 7. Riesgos y decisiones previas a restaurar Dashboard

1. Contratos de datos: servicios hoy/en curso, agenda, asignación, cliente y
   vehículo tienen fuentes operativas. Se debe definir zona horaria, horizonte
   temporal y tratamiento de QA con las reglas vigentes.
2. Capacidad real: disponibilidad de conductor/vehículo requiere reglas operativas;
   no basta availability_preference o estado manual.
3. Ingresos del día: no sumar total_amount ni paid_amount por fecha de agenda.
   Requiere cobros reales por fecha y moneda y regla de negocio aprobada.
4. Incidencias/actividad: los adaptadores históricos usan mocks. Existen datos
   operativos dispersos, pero no se ha demostrado un contrato agregado equivalente
   al feed original. Definir fuentes/cobertura antes de mostrar «sin incidencias».
5. Historial: usar evidencia 0049/0050 y UUID, nunca historial mock o códigos como
   claves backend.
6. Eventos y helpers globales: inicializadores parcialmente activos, nombres
   globales y listeners compartidos pueden acoplar módulos. Registrar handlers
   selectivos con idempotencia y probar entradas/salidas repetidas.
7. El genérico sirve de capa de paginación, QA, guards y acciones. Eliminarlo
   prematuramente haría perder funcionalidad aunque la pantalla parezca correcta.
8. Reportes y las pantallas no disponibles son casos diferentes de «vista genérica»;
   requieren su propio inventario antes de activar controles.

## 8. Plan propuesto (requiere aprobación por fase)

| Fase | Módulo / alcance | Criterio de salida |
| --- | --- | --- |
| R0 | Aprobar referencia de presentación y matriz componente → dato → permiso → acción. Mantener documento de rendimiento como deuda. | Lista explícita de componentes actuales/pendientes; ninguna recuperación de archivo completa autorizada implícitamente. |
| R1A — primero | Dashboard: recuperar estructura original de centro de operaciones, resúmenes acordados y próximos servicios con fuentes reales; conservar entrada operativa y navegación a Servicios. | No tabla básica como interfaz definitiva. Un solo montaje, sin mocks/reconciliación. Métricas con definición y fuente; faltantes claramente «no disponible», sin cifras inventadas. |
| R1B | Dashboard: completar alertas, revisión de incidencias, actividad y drill-down donde haya contrato autorizado equivalente. | Cada alerta enlaza por UUID y permisos; no se habilita una escritura sin wrapper. Bloques sin contrato se registran como dependencia, no se simulan. |
| R2 | Servicios Fase 1B: detalle rico e historial 0049, manteniendo lista Fase 1A y formularios operativos vigentes. | Draft/0/positivo, estados independientes, cinco contextos y 0050 intactos; detalle abre/cierra sin listeners duplicados y conserva todas las acciones actuales. |
| R3 | Clientes → Conductores → Vehículos, una intervención y aprobación por módulo. | Cards/filtros/fichas reales, relaciones correctas, lifecycle/portal/documentos/elegibilidad por wrappers vigentes; no falsas capacidades. |
| R4 | Caja → CxC → Gastos → Liquidaciones, por módulo y con revisión específica financiera. | Sin escrituras de prueba remotas. Contratos, idempotencia, recuperación de respuesta incierta, saldos y permisos preservados. |
| R5 | Reportes → Usuarios → Configuración según disponibilidad de contratos. | Datos actuales comprobados; controles sin soporte permanecen explícitamente no disponibles. No generar backend nuevo por decisión visual. |
| R6 | Retirada selectiva de fallback/legacy tras aceptación y análisis de referencias. | Sin consumidores de los nodos/handlers retirados. Mantener genérico donde siga en uso. No borrar mocks o scripts globalmente sin inventario de dependencias. |

La prioridad es R1A Dashboard, no una nueva funcionalidad operativa ni otra
optimización. R1B puede necesitar decisiones de producto sobre cobertura de datos;
esa dependencia no impide recuperar primero los componentes ya respaldados.

La referencia histórica se consultará con git show/diff. Cualquier recuperación
concreta se enumerará en la propuesta de la fase y requerirá autorización antes
de aplicar cambios. No revert/checkout/cherry-pick ni reemplazos de archivos.

## 9. Validación por intervención

- Matriz antes/después de fuentes, controles y permisos; no perder acciones reales
  existentes aunque estuvieran en el panel genérico.
- Pruebas de adaptadores puros, escaping, ausencia de lectura mock/localStorage,
  QA directo y por ancestros, paginación y filtros del conjunto completo.
- Request/generation/session guards y respuestas tardías; una inicialización y
  un handler por acción; abrir/cerrar y navegar repetidamente.
- Revisión visual en 390, 640, 768, 1024 y 1440 px, teclado/foco, textos largos,
  scroll, empty/loading/error y falta de permisos. Sin publicar para revisar.
- Para Servicios/finanzas: conservar wrappers, precio finalized cero, monedas,
  separación operativo/asignación/pricing/cierre, historial y recibos 0050.
- Tests específicos de la fase, suites afectadas, global y git diff --check.
- Aprobación visual/funcional antes de desconectar cada fallback. No aceptar el
  Dashboard básico por el hecho de que sus tests técnicos pasen.
- Registrar rendimiento observado como seguimiento, sin reabrir su investigación
  ni usarlo ahora como bloqueo si la funcionalidad es correcta.

## 10. Comprobaciones no destructivas de esta auditoría

- Suite actual ejecutada nuevamente: **301 PASS / 0 FAIL**, 0 omitidos/cancelados.
  Incluye config, navegación, Fase 1A, acciones, Auth, 0049, 0050 y 0054.
- node --check: operational-data.js, services.js y config.js, PASS.
- git diff --check: PASS. Git avisa de normalización LF/CRLF; no hay errores de
  whitespace. No se efectuó staging.
- Son comprobaciones locales con mocks/DOM y PostgreSQL desechable de tests;
  no una certificación E2E remota de todos los módulos ni aprobación visual.
- Ninguna consulta nueva al Supabase remoto, modificación de datos, migración,
  RLS, permisos o funciones. No commit/push/merge/reset/checkout/deploy.
- Único archivo escrito por esta auditoría: este documento. Los archivos de
  aplicación se inspeccionaron en modo lectura y permanecen sin nuevos cambios.

## Decisión pendiente

Aprobar el alcance R1A y la selección exacta de métricas del Dashboard con el
wireframe y el render histórico a la vista. La interfaz rica está parcialmente
conservada y recuperable; su antigua lógica no es un reemplazo seguro de la
arquitectura actual. No comenzar implementación hasta revisar y aprobar el plan.
