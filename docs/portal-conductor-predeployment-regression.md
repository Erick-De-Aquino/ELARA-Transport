# Portal Conductor — regresión previa al despliegue inicial

20/11/2026. Inspección y pruebas no destructivas. Dictamen: **APTO para incluir el alcance del Portal Conductor previamente validado en el despliegue inicial**. No se ha reproducido una regresión relevante que exija excluirlo o reconstruirlo. Este dictamen sustituye la clasificación provisional de «pendiente» de la revisión general; incorpora el antecedente manual comunicado por el propietario.

## Antecedentes y diferencias

El propietario confirma validación manual autenticada en septiembre: acceso, vínculo usuario–conductor, recuperación, seis secciones, lecturas reales y aislamiento. Es evidencia aportada por el propietario; no se inventa un acta ni se asigna esa validación a un commit exacto. No se encontró un informe local que vincule esa sesión manual a un SHA concreto.

Git confirma implementación real de las seis secciones durante septiembre:

- 8d989db / 03-09: autenticación real; 4a8a67d: restauración de sesión.
- 400178e / 04-09: Mis servicios; a5e4315 / 04-09: Historial.
- 31510be / 05-09: Mis finanzas; 80c6b57 / 05-09: Mis liquidaciones.
- a883486 / 06-09 y 59df0c2 / 21-09: gastos y solicitudes reales.
- 7472be7 / 09-09 y 1d017a5 / 21-09: perfil y edición real autorizada.
- d508518, be32795, 73e8c82, cf6e151: aceptación, inicio, progreso e incidencias.
- 339f8ad, 0732354, 35fb103 / 22-09: discrepancias, rendiciones y cierre de sesión.
- e3b3e75 / 23-09: historial; sirve como referencia técnica de final de septiembre, no como prueba de la fecha exacta de aceptación manual.

Cambios posteriores relevantes: e6fac0f (gastos reales), a765739 (guardas y operación administrativa), 54c6544 (cierre financiero 0050), 929cc57 (acceso 0051), 4353ecb (concurrencia de inicialización de sesión), f09a508 (cierre de ficha), 1799a3c (aceptación confirma servicio), 8464445 (precio definitivo al conductor).

El driver.js actual coincide en contenido con 8464445; la diferencia binaria de hashes se explica por CRLF/LF y desaparece al normalizar saltos de línea. Desde el respaldo 1be4711 no cambiaron driver.js, router.js, permissions.js ni app.js. Sí cambiaron auth.js, operational-data.js y HTML/CSS compartidos. Estos cambios se revisaron en el alcance de sesión/contexto, invalidación y navegación. Todos los IDs históricos dentro de las seis vistas se conservan: 5/3/11/13/13/5, respectivamente.

## Resultado por sección

| Sección | Evidencia anterior | Compatibilidad actual / fuentes | Pruebas actuales | Limitaciones |
| --- | --- | --- | --- | --- |
| Mis servicios | 400178e y validación manual comunicada; aceptación/progreso posteriores documentados en Git | Ruta mis-servicios; get_driver_service_overview sin identidad proporcionada por navegador; identidad real resuelta | Pruebas existentes de precio, aceptación 0054 y seguridad; carga vacía/error aisladas; navegación multirrol | No se aceptaron ni progresaron servicios reales en esta intervención |
| Historial | a5e4315 y e3b3e75; validación manual comunicada | Ruta historial, alias historial-conductor; mismo overview real; detalle y precio definitivo | Ficha/cierre, precio, carga vacía/error; IDs conservados | Helpers históricos de incidencias permanecen; no son una nueva fuente certificada de cobros |
| Mis finanzas | 31510be, 339f8ad, 0732354; validación manual comunicada | get_driver_cash_finance_summary y cash_remittances; RLS por conductor | Carga vacía/error aisladas; identidad y contexto; metadatos remotos | Sin crear rendiciones/discrepancias ni probar importes reales nuevos |
| Mis gastos | a883486, 59df0c2 y e6fac0f; validación manual comunicada | get_driver_expenses/get_driver_expense_detail; consulta propia mediante RPC | Carga vacía/error aisladas y regresiones de sesión/contexto | Sin solicitudes ni reenvíos reales; el rol conductor no obtiene SELECT directo general de expenses |
| Mis liquidaciones | 80c6b57; validación manual comunicada | v_driver_settlement_summary con security_invoker=true; settlements con RLS por conductor | Carga vacía/error aisladas; revisión de identidad/RLS; navegación | Sin pagos ni generación de liquidaciones de prueba |
| Mi perfil | 7472be7 y 1d017a5; validación manual comunicada | Identidad resuelta por Auth, auth.getUser, driver_vehicle_assignments y vehicles bajo RLS | Carga sin vehículo/error de Auth aisladas; selección de contexto e identidad | No se modificó teléfono ni disponibilidad real |

## Sesión, permisos y backend actual

- 122 pruebas existentes relevantes PASS / 0 FAIL: driver*.test.cjs, auth*.test.cjs, session-0053, control-0051, edge-0051, accept-invite-0051 y users-0057. Incluyen distintas identidades aisladas, RLS/arranque de sesión, rechazo de precio ajeno, permisos, revocación, respuestas obsoletas y coordinación multirrol. No representan una nueva sesión autenticada de producción.
- Doce comprobaciones adicionales, ejecutadas en memoria sin añadir archivos funcionales: invocación de los controladores reales de las seis secciones con respuestas vacías y errores simulados. El harness LinkeDOM requirió adaptar su propiedad select.value; el primer intento del harness no era compatible con ese setter, no fue un fallo del navegador ni una regresión del producto. Se contabilizan como comprobaciones de renderizado/lectura, no como pruebas integrales de cada operación.
- Prueba existente auth-multirole.visual.cjs en Chrome: 390/640/768/1024/1440, seis enlaces del conductor, redirección de rutas administrativas no autorizadas, identidad resolved, retorno a contexto administrativo y coordinación de dos pestañas. Las once operaciones de contexto registradas por ese fixture son llamadas simuladas interceptadas; no escrituras en Supabase. Esta comprobación responsive se limita al selector/navegación, no vuelve a certificar cada formulario del portal.
- Lectura remota de catálogos: RPC get_driver_service_overview, get_driver_cash_finance_summary, get_driver_expenses y get_driver_expense_detail presentes; EXECUTE authenticated y no anon. initialize_app_session(text) presente. Las funciones internas no necesitan EXECUTE público para ser llamadas dentro de contratos autorizados.
- Políticas remotas: cash_remittances, driver_vehicle_assignments y settlements restringen conductor a driver_id=rls_current_driver_id(); drivers a su propio id; vehicles mediante rls_driver_can_access_vehicle. La vista de liquidaciones usa security_invoker=true. Expenses mantiene acceso directo de lectura administrativa, con acceso del conductor por las RPC propias. Estas verificaciones son de definición/compatibilidad, no una suplantación remota de identidades.
- 0057 registrada una sola vez como 20261120005700 y rollout vacío. Sus cinco operaciones nuevas siguen desactivadas. No modifica los contratos de consulta del portal. Las regresiones aisladas de 0051/0057 pasan, incluidas las protecciones de revocación.
- auth.js exige contexto y rol confirmados, resuelve identidad antes de reabrir navegación y suspende el contexto mientras verifica. El módulo conserva invalidación de sus caches y de peticiones de vista; los tests de multirrol/revisión de sesión no identificaron una regresión nueva.

## Mock y legacy: alcance de la conclusión

Existen archivos y helpers históricos. No se certifica «cero referencias mock». Las rutas reales usan las lecturas descritas y loadServices devuelve datos reales/cargados para identidad real antes del fallback demo. Los controles administrativos restaurados no reactivan reconciliaciones históricas; saveServices del portal es no operativo.

Quedan accesos residuales a colecciones históricas: búsqueda de colaborador por ID antes del fallback a identidad real y helper de incidencias de cobro del historial. No se identificó una regresión posterior que los convierta en origen de servicios, gastos, liquidaciones o saldos reales. No deben interpretarse como historial financiero completo ni como evidencia de operaciones persistidas. Su mera presencia no justifica reconstruir el portal ni elimina la necesidad de respetar las exclusiones QA existentes.

## Límites y decisión

Se acepta el antecedente manual de septiembre y se añade evidencia concreta de regresión actual. No se repitió autenticación real de conductor ni se enviaron invitaciones, formularios financieros o cambios de sesión remotos. No se concluye que todos los casos históricos fueron repetidos hoy, ni que una comprobación estática sustituya todas las pruebas autenticadas. La última suite global permanece 823 PASS / 0 FAIL de la revisión previa; esta intervención repitió únicamente las 122 pruebas pertinentes y los checks indicados.

No hay evidencia suficiente para mantener el bloqueo provisional del portal por falta de una nueva validación manual completa. Puede incluirse el alcance previamente aprobado, conservando contratos, RLS, controles de identidad y restricciones existentes. El dictamen no autoriza la publicación ni activa Usuarios 1B, y no resuelve por sí mismo el empaquetado/exclusión del callback administrativo pendiente de la revisión general.

Único archivo de proyecto añadido: este informe de preparación del despliegue. Sin modificaciones funcionales, SQL remoto de escritura, cambios de cuentas/roles/vínculos/sesiones, migraciones, commits, cambios de rama ni despliegues. git diff --check sin errores de whitespace (avisos CRLF previos).
