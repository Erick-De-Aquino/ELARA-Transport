# Clientes Fase 1B — Ficha e historial operativo

Fecha: 15 de noviembre de 2026. Implementación local, pendiente de revisión visual en la sesión autenticada.

## Archivos de esta intervención

- `src/js/customers.js`: ficha por tipo, contactos, historial bajo demanda, navegación y retorno desde Servicios, invalidación y reintentos de lectura.
- `src/index.html`: adaptación del modal original de historial; se elimina la valoración sin respaldo operativo, se conservan el total y las listas originales y se añade el grupo de cancelados/no realizados y el retorno a la ficha.
- `src/css/responsive.css`: ajustes acotados a las acciones de la ficha y al modal de historial, con cuerpo desplazable.
- `tests/customers-presentation.test.cjs`: cobertura de Fase 1B y regresiones de Fase 1A.
- `tests/customers-presentation.visual.cjs`: validación de particulares, empresas, historial y navegación mediante el router y el modal de Servicios existentes.
- Este informe.

Se conservaron los cambios locales anteriores. Dashboard, router, permisos y contratos administrativos/financieros no se editaron. Tras la revisión visual se añadió la adaptación mínima de apertura pública del controlador de Servicios descrita a continuación.

## Componentes recuperados

Se reutilizan `#customer-detail-modal`, `#customer-history-modal`, `#customer-history-list`, `#customer-upcoming-list` y el renderer puro de secciones/cards conservado de la interfaz anterior a `a765739`. No se inicializan manejadores históricos, persistencia demo ni reconciliaciones legacy.

La ficha de particulares contiene código, UUID, nombre completo y componentes del nombre, estado administrativo en español, teléfono, correo, código de país y notas autorizadas. La ficha de empresa contiene razón social, nombre comercial, NIF/CIF, dirección y contacto de facturación, estado, notas y contactos empresariales accesibles. No mezcla campos exclusivos de ambos tipos. `inactive` se presenta como Inactivo con tono neutro.

Activar/Inactivar permanece en las acciones superiores del modal con las restricciones existentes del contrato 0048. No se habilita edición libre. El botón Nuevo cliente individual del encabezado principal permanece conservado.

## Fuentes y contratos

Las lecturas utilizan exclusivamente el cliente autenticado y las primitivas vigentes de `ElaraOperationalData`:

- `customers`, `persons`, `companies`: identidad y ficha, con exclusiones QA existentes.
- `company_contacts` y sus personas accesibles: contactos y estado, sin inventar contactos ni exponer personas excluidas.
- `services`, filtrado por `customer_id` del UUID elegido: historial y próximos servicios. Se descartan filas eliminadas, QA y de otros clientes.
- `service_locations`, limitado por UUID de los servicios obtenidos: origen y destino; ubicaciones ambiguas se presentan como no disponibles.

Las lecturas respetan las políticas y permisos actuales; no se modificó RLS. Un resultado vacío se describe como ausencia de registros accesibles, sin afirmar que no existan registros fuera de ese alcance.

El historial separa próximos servicios/en curso, servicios anteriores y cancelados/no presentados/no realizados. Los servicios pendientes vencidos permanecen en anteriores con su estado real. Orden determinista por fecha y UUID; fechas explícitas en Europe/Madrid. No se inventan eventos ni valoraciones.

Corrección posterior de navegación: cada servicio utiliza `ElaraServices.openOperationalDetail(UUID, {viewId:'clientes', isCurrent})`, que delega en el mismo controlador de `#service-summary-modal`. La causa del cambio de módulo anterior era la combinación de `navigateOperationalService` con una guardia vinculada exclusivamente a la visibilidad de Servicios. La guardia ahora valida la vista de origen activa (solo Clientes o Servicios), además de conservar UUID, usuario, contexto administrativo, sesión y vigencia de la solicitud. Los llamadores normales de Servicios siguen usando su vista como origen por defecto.

No se cambia la ruta `#clientes`, no se activa Servicios y no se desmonta ni recarga Clientes. El historial se suspende ocultándolo, conservando sus nodos, datos y desplazamiento. Al cerrar el servicio y sus diálogos asociados se vuelve a mostrar ese mismo historial y se restaura su foco/desplazamiento. Búsqueda, filtros, página y desplazamientos del listado permanecen intactos porque no se toca el listado. Si el usuario navega voluntariamente o cambia de sesión/cliente, se invalida el servicio y no se restaura el contexto abandonado. Se retiró el puente anterior de navegación y reconstrucción del listado.

Archivos de esta corrección puntual: `src/js/services.js` (interfaz pública y origen de la guardia), `src/js/customers.js` (suspensión y retorno local), las dos pruebas de presentación de Clientes y este informe. No se modificaron HTML, CSS, contenido del modal ni lógica financiera.

Los contratos 0048, 0049 y 0050 permanecen intactos. La ficha y el historial de Clientes no añaden consultas financieras; el detalle delegado a Servicios conserva sus lecturas y restricciones actuales.

## Estabilidad

- Historial solo al solicitarlo; no se bloquea el listado para cargar servicios.
- Estados separados de carga, vacío y error, con reintentos exclusivamente de lectura.
- Invalidación al cerrar, volver a la ficha, cambiar de cliente, navegar, reiniciar datos o cambiar sesión/contexto.
- Sin repoblación desde respuestas antiguas ni datos residuales del cliente anterior.
- Reutilización de lecturas pendientes y guardias actuales; handlers asignados sin acumulación y observadores transitorios desconectados al salir.
- Si el servicio deja de estar disponible antes de abrirlo, se regresa al historial con un error explícito.
- Un cambio de sesión durante Servicios descarta el retorno al cliente anterior.

## Validación

La cobertura incluye particulares/empresas, contactos y personas QA, los cuatro estados administrativos, todos los estados de servicio solicitados, fechas Madrid, aislamiento por cliente, vacíos, errores/reintentos, lecturas simultáneas, respuestas tardías, cierres y cambios de sesión.

La integración automatizada usa el código real de Servicios para abrir UUID de servicios pendientes y finalizados desde Clientes, verifica la exclusión de superposiciones y comprueba que siguen siendo los mismos nodos del historial/listado, con filtros combinados, página 2 y desplazamientos intactos. Comprueba respuestas tardías, servicios consecutivos, sesión, navegación voluntaria, el historial 0049 y una sola consulta financiera 0050 para el servicio finalizado. El verificador en Chrome usa además el router real y exige que la ruta permanezca en `#clientes` durante todo el flujo.

Se validaron 390, 640, 768, 1024 y 1440 px, con capturas de ficha particular, empresa e historial, controles dentro del viewport, cuerpos sin desbordamiento horizontal e IDs únicos. No se duplican los modales de cliente o servicio.

Resultados tras la corrección de navegación: **436 PASS / 0 FAIL** globales, **47 PASS / 0 FAIL** de Clientes y **103 PASS / 0 FAIL** de Dashboard/Servicios (subconjuntos de la suite global), sin omitidos ni cancelados. Sintaxis JavaScript y `git diff --check` correctos; Git solo avisa de normalización LF/CRLF. La referencia de Fase 1B anterior a esta corrección era 429 PASS / 0 FAIL.

Evidencias locales de la corrección en `%TEMP%`: `elara-service-inline-global.log`, `elara-service-inline-tests.log`, `elara-service-inline-regression.log` y `elara-service-inline-visual.log`. Capturas y métricas en `%TEMP%/elara-customers-Vm8mhB`, incluidos los cinco anchos con el modal de servicio superpuesto a Clientes. Las evidencias anteriores de Fase 1B se conservan.

Una repetición visual concurrente sufrió un timeout de arranque de Chrome/CDP; se repitió de forma aislada y completó correctamente los cinco anchos, ambas fichas, historial, formulario administrativo y navegación con el router real.

## Límites deliberados

### Corrección del retorno entre modales tras validación autenticada

Se añadió una regresión que recorre la cadena mediante eventos DOM: abrir ficha, historial, servicio, cerrar servicio y comprobar el historial realmente visible, pulsar Volver a la ficha y cerrar la ficha. Antes de la corrección fallaba el caso Escape: el foco podía seguir en un control del historial oculto y su handler cerraba toda la cadena. El controlador del servicio tampoco aislaba el evento de cierre de otros gestores. El retorno normal dependía únicamente de inferir cambios de visibilidad mediante observadores.

El controlador compartido admite ahora un callback `onClose` y distingue cierre normal, sustitución, navegación, invalidación y cesión a otro diálogo. El cierre normal restaura explícitamente el historial propietario después de limpiar el servicio. El servicio recibe el foco al abrirse; botón/fondo consumen su evento y Escape se resuelve en captura para el modal activo. Ficha e historial suspendidos ignoran eventos de cierre. Los observadores conservan la invalidación y la espera a diálogos auxiliares, sin sustituir el retorno explícito normal. Las restricciones administrativas, sesión, UUID, historial 0049 y lecturas financieras no se cambian.

Archivos de esta corrección: `src/js/services.js`, `src/js/customers.js`, las dos pruebas de presentación de Clientes y este informe. No hay cambios de HTML/CSS ni rediseño.

Resultado: **439 PASS / 0 FAIL** globales; **50/50** de Clientes y **63/63** del subconjunto específico de Servicios. Sintaxis y `git diff --check` correctos. Chrome reproduce clics de ratón, Escape nativo y clic en fondo en 390, 640, 768, 1024 y 1440 px. Comprueba historial visible e interactivo mediante `elementFromPoint`, misma ruta `#clientes`, mismos nodos/datos y desplazamiento, retorno a ficha y ausencia de fondos visibles o de modales ocultos interceptando el listado. Las pruebas conservan casos de navegación voluntaria, cambio de cliente/sesión y respuestas tardías.

Evidencias en `%TEMP%`: `elara-modal-return-before.log` (fallo reproducido antes), `elara-modal-return-tests.log`, `elara-modal-return-services.log`, `elara-modal-return-global.log` y `elara-modal-return-visual-final.log`. Capturas y métricas en `%TEMP%/elara-customers-s7Cd3l`. Queda pendiente repetir la validación autenticada por el usuario; no se avanza a Fase 1C.

No se recuperan valoraciones, necesidades ficticias, edición sin contrato ni datos financieros nuevos. No se implementa Fase 1C. Se mantiene el límite de lectura segura existente: un volumen superior al admitido produce un error, sin presentar un historial parcial como completo.

Las pruebas utilizan fixtures locales y bases aisladas; no realizan escrituras ni consultas de negocio sobre datos reales. La revisión visual final en la sesión local autenticada corresponde al usuario. No se ha hecho commit, push, merge ni deploy.
