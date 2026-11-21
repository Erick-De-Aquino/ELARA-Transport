# Usuarios 1B — validación final y requisitos de despliegue

## Validación definitiva de la versión inerte — 2026-11-20

**Lista para autorizar exclusivamente la instalación SQL inerte; no instalada.** Integridad del manifiesto CORRECTA, instalación inerte CONFIRMADA, compatibilidad remota CONFIRMADA y procedimiento individual PREPARADO. Los seis archivos controlados permanecen sin cambios; no se regeneró `0057-local-manifest.json`. Fuente SHA-256 `d3246ed536478b8a204d01fd63e3aaddc03ddb8aee4fe2909927dd080aa656f7`.

Se cerró la preparación que faltaba: artefacto individual `0057-atomic-deployment.sql`, verificador de solo lectura y manifiesto separado del artefacto. Conserva la fuente exacta, usa un único BEGIN/COMMIT y registra solo `20261120005700`/`0057_admin_users` dentro de esa transacción. Guardas de historial, dependencias y conflictos; límites de bloqueo/sentencia; sin db push, seed ni otras migraciones. Instrucciones exactas y hashes en [0057-installation-ready.md](0057-installation-ready.md).

Validación actual: 109 pruebas relevantes y 21 comprobaciones PostgreSQL nativas PASS. Incluye fallo tardío con rollback completo, instalación sobre identidades/vínculos preexistentes conservados, activación vacía persistente tras COMMIT desde conexiones nuevas, rechazo servidor de escrituras desactivadas, verificador de cuerpos/ACL y rechazo de reinstalación. Se mantienen las regresiones 0051 y de último Superadministrador. Contenedores eliminados; pruebas sin red ni producción. La suite global previa de 810 no se repitió, conforme al alcance específico solicitado.

Lecturas remotas actuales: proyecto correcto y saludable; 58 migraciones, 0056 presente, 0057 ausente; dependencias/tablas/columnas disponibles, sin conflictos conocidos. Solo metadatos, sin cuentas ni credenciales. No se ejecutó SQL remoto de escritura ni se abrió una conexión de despliegue. La futura autorización debe ligar el artefacto aprobado a un preflight inmediato y conexión TLS verificada. SMTP, Edge, callback y todas las activaciones permanecen pendientes, sin bloquear la instalación inerte.

Solo se añadieron archivos de preparación, validación aislada y documentación; las seis fuentes validadas y su manifiesto permanecen intactos. Este resultado prevalece sobre el historial inferior.

## Activación gradual corregida localmente — 2026-11-20

**La instalación independiente de la versión local nueva puede permanecer inerte. No se ha instalado ni desplegado nada.** El hash anterior deja de representar esta versión: se actualiza `0057-local-manifest.json`, que incluye también `src/js/users-admin.js`. La autorización de instalación anterior no se ejecutó y no se reutiliza automáticamente para este SQL modificado.

### Causa y corrección imprescindible en SQL

`users.js` solo inicia la preparación y añade acciones a la ficha; no interpreta `manage`. El controlador `users-admin.js` usaba `manage=true` como disponibilidad de edición, estado, asignación y revocación. Solo la invitación comprobaba además Edge. No había un bloqueo de despliegue en el servidor. Cambiar únicamente botones no habría impedido invocar las RPC directamente.

Por eso se modifica exclusivamente 0057 entre las migraciones: nueva tabla **privada** `elara_private.user_admin_rollout`, vacía al instalar, con RLS y sin SELECT/INSERT/UPDATE/DELETE para PUBLIC, anon, authenticated o service_role. No se crea una RPC para activarla. Cada operación tiene una fila de activación explícita; fila ausente o `enabled=false` significa cerrada. Su trigger coordina cambios con los mismos bloqueos transaccionales de administración/0051. Helpers privados sin EXECUTE para aplicaciones. No se toca 0051 ni otras migraciones, roles, cuentas o políticas existentes.

La autorización sigue comprobándose mediante Superadministrador, contexto y sesiones vigentes. Después se exige activación en el servidor, antes de crear recibos o ejecutar cambios. Una operación cerrada rechaza con `55000`, incluso con un cliente antiguo o una llamada directa. Prepare, claim y complete de invitación tienen el mismo bloqueo; claim conserva además su control exclusivo de servidor y del operador/sesión. Los recibos se pueden consultar en modo lectura aunque se retire la activación.

`admin_get_user_control(NULL)` publica `authorized=true` únicamente tras autorizar al usuario, `availability_contract='0057.availability.v1'` y `operations` con cinco booleanos. **`manage=false` permanece como compatibilidad cerrada para clientes antiguos**: no debe usarse para autorizar ni habilitar acciones. Las ocho firmas públicas y sus ACL se conservan. El nuevo contrato de disponibilidad es deliberadamente incompatible con clientes que solo conocen `manage=true`.

| Operación | Condiciones para habilitarla |
| --- | --- |
| Información administrativa (`metadata`) | Superadministrador autorizado + contrato de disponibilidad compatible + activación explícita de metadata + RPC de gestión/consulta de recibos disponibles con EXECUTE correcto. |
| Activar/inactivar (`status`) | Las mismas dependencias SQL + activación independiente de status; permanecen todas las restricciones reales de estado, rol, persona y conductor. |
| Asignar rol (`assign`) | Las mismas dependencias SQL + activación independiente de assign; no concede permisos nuevos ni evita las restricciones 0051. |
| Revocar rol (`revoke`) | Las mismas dependencias SQL + activación independiente de revoke; conserva protección del último Superadministrador, sesiones y vínculos. |
| Invitar (`invite`) | Activación explícita + comprobación de las tres RPC de invitación y recibos + `edge_verified`, `callback_verified`, `mail_verified` y URL HTTPS exacta aprobada; además el navegador exige capabilities autenticadas de Edge con versión compatible, invite=true y URL coincidente. Edge compara esa URL con su configuración real antes de prepare/claim/invite/complete. |

Las cuatro operaciones SQL no dependen de Edge, callback o SMTP: pueden activarse por separado cuando se aprueben sus propios requisitos. No se activan automáticamente al instalar SQL. Invitaciones permanecen cerradas si falta cualquiera de sus requisitos. Que un endpoint responda, que exista `manage=true` o que el navegador altere un botón no activa nada. Las señales de despliegue son constancias privadas de verificaciones realizadas por un operador de confianza, no permisos de usuario ni una comprobación ficticia de entrega de correo. No se prueban invitaciones para determinar disponibilidad.

### Cliente y Edge

`users-admin.js` comprueba el contrato y cada acción, descarta respuestas antiguas por generación/sesión/contexto, actualiza los controles ya abiertos sin añadir listeners y repite las lecturas antes de abrir/enviar. Ante fallo, versión antigua o señal incompleta, cierra disponibilidad. El envío duplicado permanece bloqueado durante esas esperas. En conciliación puede consultar el recibo; si falta activación conserva el UUID y no reenvía mutaciones. Las comprobaciones de disponibilidad usan solo `admin_get_user_control` y capabilities de Edge, que únicamente valida Auth y consulta esa RPC.

Edge nunca interpreta la autorización como permiso de desplegar funciones: devuelve disponibilidad por operación, comprueba el callback configurado y rechaza invitaciones no activadas antes de usar credenciales privilegiadas. No se cambia el callback corregido, los permisos SQL ni la autenticación JWT. No se exponen credenciales ni se añaden banderas activables en localStorage, query strings o configuración pública.

### Secuencia de activación futura, sin ejecutar

1. Revalidar y autorizar el nuevo hash SQL y el artefacto individual. Instalar solo 0057 en una transacción: tabla de activación vacía, todas las operaciones false y manage=false. Verificarlo mediante lecturas.
2. Publicar el frontend compatible cuando se autorice; mantener las operaciones cerradas. Los clientes antiguos también permanecen cerrados por manage=false.
3. Tras comprobar las dependencias SQL, activar explícitamente y por separado las filas metadata/status/assign/revoke que se autoricen, mediante una transacción administrativa del propietario. No requiere desplegar Edge ni habilita invitaciones. Registrar la autorización y evidencia de cada activación; no hay acción pública para hacerlo.
4. Para invite: desplegar y verificar Edge, publicar/verificar callback y assets HTTPS, confirmar allowlist/plantilla y correo operativo. Registrar la URL exacta y las tres verificaciones en la fila privada de invite; activar enabled solo cuando estén completas. Hasta entonces la ausencia de SMTP personalizado indicada por el usuario mantiene mail_verified=false. Verificar después las capabilities autenticadas, sin enviar correos.
5. Para detener una operación, desactivar únicamente su fila mediante una intervención administrativa autorizada; el bloqueo aplica en el servidor a nuevas mutaciones aunque el navegador tenga una señal anterior. No borra recibos ni revierte operaciones confirmadas. Un envío Auth que ya fue autorizado y despachado puede no ser cancelable; no se reenvía automáticamente ante resultado incierto.

Se mantienen los límites y precondiciones del despliegue individual anterior, pero sus hashes y dictámenes quedan supersedidos por esta revisión. No se modifica configuración remota ni se habilita ninguna fila real en esta intervención.

**Validación final:** suite global **810 PASS / 0 FAIL**, sin omitidas ni canceladas. Incluye 109 pruebas relevantes de Usuarios, SQL 0057, Edge y callback (107 ejecutadas además por separado antes de añadir las dos últimas regresiones de cuenta/navegación). **14 escenarios PostgreSQL nativos PASS**: nueve de instalación inerte/compatibilidad 0051 y cinco existentes de Usuarios. Se verificaron SQL ausente, instalación sin activación, activación SQL independiente sin Edge, callback/correo sin verificar, flujo completo simulado, usuario sin permiso, contexto/cuenta/navegación, respuesta tardía, contrato antiguo/incompatible, disponibilidad retirada, doble envío, conciliación y privilegios privados. Los contenedores se eliminaron y las evidencias indican remoteAccess=false.

QA visual aislada en **390, 640, 768, 1024 y 1440 px** correcta: listado, ficha y cinco formularios conservan diseño, apertura/cierre, foco y desplazamiento sin desbordamientos. Inspección de capturas de invitación móvil y edición en escritorio correcta. No se enviaron escrituras ni correos en QA visual. Seis hashes de fuentes coincidentes, sintaxis JS correcta y `git diff --check` correcto; también se revisa espacio en blanco de archivos nuevos no seguidos por Git.

Archivos modificados en esta revisión: `supabase/migrations/0057_admin_users.sql`; `src/js/users-admin.js`; `supabase/functions/user-administration/core.mjs` e `index.ts`; `tests/users-0057.test.cjs`, `users-admin.test.cjs`, `users-edge-0057.test.cjs`, `users-admin.visual.cjs` y nuevo `users-rollout-0057-fixture.cjs`; `scripts/qa/0057-users.local.cjs` y `0057-preflight-probe.local.cjs` (activación únicamente de fixtures desechables); `docs/0057-local-manifest.json` y este documento. `users.js` fue revisado y no necesitó cambios.

**Dictamen:** SÍ, esta versión local de 0057 admite instalación individual sin habilitar prematuramente operaciones nuevas. Requiere el preflight inmediato y autorización del nuevo hash/artefacto antes de cualquier instalación. Todas las etapas de activación real permanecen pendientes. Sin cambios remotos, Git ni publicación. Los apartados inferiores son historia previa a este mecanismo.

## Instalación controlada: detenida en preflight — 2026-11-20

La autorización nueva permite instalar únicamente la fuente validada y exige mantener bloqueadas las operaciones de invitación/administración mientras falten sus componentes. El usuario confirma manualmente Site URL, redirects compatibles y plantilla estándar; SMTP personalizado no configurado. No se vuelven a modificar ni consultar esos ajustes mediante navegador.

Lecturas remotas inmediatas: proyecto `pfdvehcyauoncxeolcjc`, ELARA Transport, ACTIVE_HEALTHY; 58 migraciones, 0056 `20261117005600` presente, 0057 ausente; cero RPC nuevas, tablas privadas y `admin_version` ausentes. Cinco hashes del manifiesto coincidentes. Fuente SQL exacta: `5b8a5ad5c75c35d487b59d420ded17d35b1d4329f4e1f38f558674f1ffb0753f`, sin modificarla.

**Condición no satisfecha: instalación inerte.** El bloque ACL de 0057 concede EXECUTE en cinco RPC nuevas a `authenticated` (claim solo a service_role), y `admin_get_user_control(NULL)` devuelve `manage=true`. `src/js/users-admin.js`, `prepare()`, calcula `capability` únicamente con esa RPC; `attach()` habilita información/estado/asignación/revocación con `capability`, sin depender de Edge. Solo `invitation` depende además de capabilities de Edge. Por tanto, no desplegar Edge/callback/Pages no bloquea esas operaciones SQL ni garantiza el bloqueo en un frontend que ya contiene este controlador. Las RPC siguen exigiendo Superadministrador: el problema es la habilitación prematura respecto a la restricción de esta instalación, no una concesión anónima ni una elusión de autorización.

La fuente no ofrece un modo de instalación inerte. Añadir REVOKE, alterar capabilities o crear una bandera operativa cambiaría el contrato/artefacto exacto o añadiría SQL de escritura fuera de lo autorizado. Se requiere preparar y validar explícitamente ese modo antes de instalar bajo esta condición. No se ha implementado tal cambio ni alterado el manifiesto.

**Resultado: NO INSTALADA; ningún intento remoto de escritura y ningún identificador nuevo registrado.** No se llamó a apply_migration, no se ejecutaron scripts de despliegue, seed ni QA. No se abrió una conexión PostgreSQL para escribir ni se realizaron verificaciones posteriores a una instalación inexistente. No hubo errores de SQL de instalación ni COMMIT incierto. La comprobación transaccional/TLS y el resto del preflight de ejecución no se certifican como completados, pues se detiene ante esta condición. Edge, callback, Pages, SMTP, Auth, cuentas, roles, sesiones y vínculos permanecen sin cambios.

El dictamen técnico anterior se conserva; este registro prevalece para la autorización de instalación condicionada actual.

## Dictamen final previo al despliegue — 2026-11-20

| Componente | Dictamen | Alcance |
| --- | --- | --- |
| Migración 0057 | **APTA técnicamente** | Dependencias verificadas, contratos y pruebas correctos. No constituye autorización ni artefacto transaccional de despliegue aprobado. |
| Edge `user-administration` | **BLOQUEADA operativamente** | Código compatible; falta verificar configuración Auth/URL/correo y preparar configuración de runtime. |
| Callback y URL | **BLOQUEADOS como conjunto publicado** | Callback APTO localmente; destino Pages determinado, disponibilidad HTTPS y allowlist remota no verificadas. |

### URL de GitHub Pages y Auth

Origen previsto: `https://erick-de-aquino.github.io`. Site URL propuesta: `https://erick-de-aquino.github.io/ELARA-Transport/`. Callback exacto propuesto: **`https://erick-de-aquino.github.io/ELARA-Transport/accept-user-invite.html`**. Se deduce del remote `Erick-De-Aquino/ELARA-Transport` y de `.github/workflows/pages.yml`, que publica `./src` como raíz, sin CNAME encontrado. No debe incluir `/src/`. No se ha confirmado una configuración Pages de dominio personalizado: si existe, debe revisarse la propuesta antes de autorizarla. [Formato de sitios de proyecto en GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

La URL debe coincidir exactamente con la allowlist Auth y `ELARA_USER_INVITE_REDIRECT_URL`, sin comodines amplios, query ni hash configurados. `ELARA_ALLOWED_ORIGINS` debe contener solo `https://erick-de-aquino.github.io` para este frontend de producción, sin ruta ni barra final. El retorno relativo `index.html#dashboard` conserva `/ELARA-Transport/`. Assets y enlaces relativos comprobados localmente. [Configuración de redirects](https://supabase.com/docs/guides/auth/redirect-urls).

**Configuración Auth real no verificada:** el conector no expone un getter de configuración Auth. La inspección de Dashboard mediante Computer Use se detuvo porque no pudo determinar con suficiente certeza la URL del navegador; no se continuó con acciones de navegador ni se alteró configuración. Los intentos de lectura pública de Pages resultaron inaccesibles desde este entorno: no prueban un 404 ni que el sitio esté sin publicar. `supabase/config.toml` contiene URLs locales de loopback y no representa la configuración del proyecto alojado.

Falta comprobar por lectura en Dashboard/Management API: Site URL, allowlist exacta, proveedor Email habilitado, expiración de invitaciones, requisitos de contraseña compatibles, plantilla de invitación y SMTP/remitente. La plantilla debe conservar `{{ .ConfirmationURL }}` (verificación Auth y retorno `type=invite` con sesión en fragmento) o un enlace al callback con `token_hash` y `type=invite`, que el callback ya admite. Un enlace simple a Site URL, un código PKCE sin soporte o un OTP aislado no corresponde a este flujo. No es necesario habilitar registro público para invitar; no se propone cambiarlo. [Plantillas Auth](https://supabase.com/docs/guides/auth/auth-email-templates). Debe verificarse SMTP apto para destinatarios reales: el servicio integrado restringe destinatarios al equipo del proyecto y no certifica entrega operativa. [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

### Contratos y ejecución

Consulta remota de lectura actual: proyecto correcto y saludable, historial hasta 0056, 0057 ausente, Edge nueva ausente. Ninguna coincidencia con las tres tablas privadas nuevas, `admin_version` ni funciones `user_admin_%`/seis RPC nuevas. Las dos funciones 0051 existentes conservan las firmas esperadas, propietario postgres, SECURITY DEFINER, `search_path=pg_catalog` y EXECUTE solo postgres/authenticated. No se invocaron RPC remotas de negocio.

Inspección de catálogo en PGlite desechable con 0057: las ocho firmas/parámetros coinciden y todas usan SECURITY DEFINER + `search_path=pg_catalog`. `anon` no puede ejecutarlas. `authenticated` ejecuta las siguientes salvo claim; `service_role` ejecuta solo claim, además del acceso del propietario:

- `admin_get_user_control(uuid)` (`p_user_id`, default NULL).
- `admin_get_user_request(uuid)` (`p_request_id`).
- `admin_manage_user(uuid,uuid,bigint,text,jsonb,text)` (`p_request_id,p_user_id,p_expected_version,p_action,p_changes,p_reason`).
- `admin_prepare_user_invitation(uuid,jsonb)` (`p_request_id,p_details`).
- `admin_claim_user_invitation(uuid,uuid,uuid)` (`p_request_id,p_actor_auth_id,p_actor_session_id`).
- `admin_complete_user_invitation(uuid,uuid)` (`p_request_id,p_auth_user_id`).
- `admin_begin_driver_portal_access(uuid,uuid,text,text,boolean)` y `admin_link_driver_portal_access(uuid,uuid,boolean)`, mismos parámetros y defaults de 0051.

Edge sigue usando JWT del operador para getUser/prepare/complete y credencial de servidor solo para claim/Auth invite. Los parámetros nombrados coinciden; la corrección de revocación vive en SQL y no requiere cambiar Edge. Gateway `verify_jwt=true` más autorización SQL efectiva de Superadministrador, sesión/contexto activos y claim ligado al operador/sesión. CORS no sustituye autorización. Sin operaciones sensibles basadas en sesión global mutable; callback mantiene bearer inmutable. Preparar únicamente en runtime servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ELARA_ALLOWED_ORIGINS`, `ELARA_USER_INVITE_REDIRECT_URL`. El código actual usa la clave service_role compatible con su JWT/claim; no sustituirla por una clave pública ni por otro formato sin validación. Ningún secreto se ha obtenido, copiado ni incluido en Pages.

### Orden exacto propuesto, pendiente de autorización

1. Cerrar las verificaciones Auth/Pages anteriores por lectura. Confirmar URL y SMTP, y revisar cualquier cambio de configuración necesario por separado. No autorizar el flujo conjunto mientras falte esta evidencia.
2. Preparar y probar en PostgreSQL aislado el artefacto individual basado en SHA-256 `5b8a5ad5c75c35d487b59d420ded17d35b1d4329f4e1f38f558674f1ffb0753f`. Mantener un único BEGIN/COMMIT, lock_timeout 5 s y statement_timeout 30 s; incorporar registro único en historial y recarga de caché antes del COMMIT. Versión propuesta `20261120005700`, nombre `admin_users`, solo tras confirmar que sigue libre. No reutilizar sin adaptar los scripts de 0056 ni envolver la fuente en otra transacción anidada. Aprobar el hash del artefacto final.
3. Con autorización expresa: preflight inmediato de proyecto, historial, dependencias, cuerpos/ACL 0051 y hashes. Session pooler 5432, TLS verify-full, certificado aprobado `prod-ca-2021.crt` y nombre del servidor verificado. Esta conexión no se ha vuelto a probar en esta intervención. Aplicar solo el artefacto aprobado, sin db push genérico ni otras migraciones. Ante fallo de precondición, abortar sin escribir.
4. Confirmar COMMIT; verificar por SELECT el registro único, seis RPC, dos cuerpos 0051 actualizados, helpers, ACL, RLS, triggers y conservación de migraciones anteriores. Si COMMIT incierto, consultar antes de reintentar. No crear ni modificar usuarios para comprobarlo.
5. Con autorización de publicación, publicar el frontend/callback corregido en Pages mediante el workflow existente. Verificar HTTPS/HTTP 200, assets, base path y hashes, sin tokens ni invitaciones reales. No se ha realizado publicación GitHub en esta intervención.
6. Con autorización de configuración, conservar las URLs vigentes necesarias y añadir/confirmar el callback exacto en Auth; verificar plantilla/SMTP. Alinear las dos variables ELARA con ese origen/URL. No cambiar globalmente Site URL sin revisar los demás flujos existentes.
7. Con autorización, desplegar exclusivamente `user-administration` con `verify_jwt=true` y variables servidor. No desplegar ni cambiar `driver-portal-access`. Comprobar disponibilidad y autorización mediante capabilities de solo lectura, sin enviar invitaciones ni invocar acciones de escritura.
8. Validación visual autenticada. Para detener uso ante fallo, retirar acceso operativo a invitaciones/Edge mediante cambio expresamente autorizado; no revertir las protecciones 0051 ni borrar auditoría, historial o identidades. Cualquier revocación de EXECUTE debe planificarse aparte y no deshace operaciones confirmadas.

Validación de esta intervención: **71 pruebas relevantes PASS / 0 FAIL**, inspección aislada de las ocho firmas/ACL PASS, cinco hashes PASS, assets/URLs relativas PASS y `git diff --check` correcto. Se conservan como evidencia previa **784 globales y 13 escenarios nativos PASS**; no se repitieron sin cambios funcionales. Solo se actualiza este documento. Ninguna instalación, despliegue, invitación, cambio Auth ni escritura remota.

El historial de correcciones y dictámenes anteriores se conserva a continuación; prevalece este dictamen final.

## Corrección de compatibilidad — 2026-11-20

La comparación temporal del hallazgo inferior se sustituye en 0057 por **fronteras de recibos inmutables**: una lista ordenada de IDs de revocación 0051 capturada al suspender el vínculo y al preparar cada intento de acceso. Antes de restaurar o conciliar se exige que la lista siga siendo idéntica. Las lecturas, capturas y escrituras se realizan bajo el bloqueo transaccional `0051/control` ya compartido, con READ COMMITTED. Las fechas dejan de decidir si una operación conserva autorización. Una revocación confirmada invalida cualquier frontera anterior; una revocación revertida no deja recibo y no invalida nada.

**Necesidad demostrada de proteger también dos funciones 0051:** el control negativo nativo mantiene la corrección de suspensión 0057 pero restaura, solo en la base desechable, los cuerpos originales de `admin_begin_driver_portal_access` y `admin_link_driver_portal_access`. Iniciando la transacción de revocación antes de la invitación y ejecutando la revocación después de preparar esta, una conciliación antigua devuelve `linked`. Por tanto, corregir exclusivamente la reactivación no garantiza el objetivo solicitado.

La migración **0057 local** incluye la sustitución de esas dos funciones existentes, conservando firmas, ACL, SECURITY DEFINER, `search_path=pg_catalog`, bloqueos, comprobaciones de identidad, elegibilidad y recibos. Solo cambian la validez de reintentos, la selección del intento pendiente canónico y la frontera de revocación. El archivo de migración 0051 y todas las demás migraciones anteriores permanecen intactos. No se modifica la función de revocación ni la Edge de conductores.

La nueva tabla privada `user_driver_access_attempts` guarda las fronteras de los intentos. Tiene RLS y carece de permisos para PUBLIC, anon, authenticated y service_role. Los dos helpers privados tampoco conceden EXECUTE a esos roles. No se añaden permisos ni API públicas. Los recibos duplicados siguen sin repetir escrituras; un recibo histórico de activación no restaura el estado ni las sesiones después de revocar.

**Compatibilidad y límites conservados:** una nueva autorización 0051 tras revocar un intento todavía no vinculado puede capturar una frontera nueva y completar el vínculo. Una suspensión posterior de esa autorización válida se puede restaurar si no hubo otra revocación. 0051 continúa exigiendo revisión separada para vínculos ya cerrados o roles revocados; esta corrección no crea un mecanismo de reapertura. Los intentos anteriores a instalar 0057 sin frontera capturada siguen siendo utilizables si no existe historial de revocación; si existe, se exige una autorización nueva en vez de deducir el orden mediante fechas.

Pruebas de esta corrección: **71 pruebas locales relevantes PASS**, incluidas las 14 del contrato 0051 ejecutadas con 0057 instalada, 23 del callback, Edge, interfaz administrativa y nuevas pruebas de fronteras/ACL. **Suite global: 784 PASS / 0 FAIL**, sin omitidas ni canceladas. **13 escenarios PostgreSQL nativos PASS:** ocho de compatibilidad y cinco regresiones existentes de Usuarios. El escenario original ahora devuelve `reactivated=false`, `activeLinks=0`, SQLSTATE `23514`, aun verificando que la fecha de auditoría es anterior a la suspensión. Los ocho escenarios cubren vinculación inicial, reintentos duplicados, sesiones cerradas, conciliación tardía con fechas invertidas, nueva autorización válida, restauración de esa autorización sin revocación nueva, ambas órdenes de concurrencia para vinculación y activación, replay histórico sin escritura y revocación revertida. El control negativo con cuerpos 0051 originales falla como se esperaba (`Unexpected replay state: linked`), demostrando la necesidad de proteger esos dos cuerpos.

Los contenedores nativos se eliminaron; `remoteAccess=false` en las evidencias temporales. `git diff --check` correcto; se revisa también el espacio en blanco de los archivos nuevos, que Git aún no sigue. Los cinco hashes del manifiesto local coinciden; solo se actualizó el de SQL 0057. Archivos de esta intervención: `supabase/migrations/0057_admin_users.sql`, `tests/users-0057.test.cjs`, `scripts/qa/0057-preflight-probe.local.cjs`, este documento y `docs/0057-local-manifest.json`.

Pendiente para despliegue: finalizar/actualizar el preflight, revisar los nuevos objetos y los dos cuerpos sustituidos, comprobar configuración Auth y URL definitiva y aprobar el hash actualizado de 0057. Esta corrección no autoriza instalar ni desplegar nada. No se han realizado consultas ni escrituras remotas en esta intervención.

Los dictámenes bloqueados siguientes describen el hallazgo previo a esta corrección y se conservan como registro histórico.

## Registro del hallazgo anterior a la corrección — 2026-11-20

**0057: BLOQUEADA. Edge: BLOQUEADA para despliegue conjunto. Callback: APTO en las pruebas locales de identidad.** No se ha instalado ni desplegado ningún componente ni efectuado escrituras remotas.

### Incompatibilidad reproducida

La reactivación de `admin_manage_user` decide si puede restaurar un vínculo suspendido comparando `audit_logs.occurred_at` de una revocación 0051 con `user_driver_links.ended_at`. Ambas fechas pueden proceder de `now()`, que representa el inicio de la transacción, no el orden efectivo de las operaciones.

Reproducción PostgreSQL nativa aislada (`scripts/qa/0057-preflight-probe.local.cjs`): iniciar la transacción de revocación; suspender y confirmar el usuario en otra conexión; ejecutar y confirmar después `admin_revoke_driver_portal_access`; solicitar reactivación 0057. La revocación ya no encuentra vínculo activo y deja su recibo de auditoría, cuya fecha precede a la suspensión. 0057 no la detecta y crea un vínculo activo.

Resultado observado: `revocationAfterSuspensionCommit=true`, `auditTransactionTimestampEarlier=true`, `reactivated=true`, `activeLinks=1`. Esto contradice la revocación explícita posterior. El escenario usa únicamente identidades sintéticas en PostgreSQL local, sin red, puertos ni volúmenes de producción. La evidencia se guarda temporalmente sin credenciales. La limpieza elimina el contenedor aislado.

**Corrección necesaria antes de instalar:** sustituir la comparación temporal por una comprobación estable de la generación/versión de autorización o de los recibos de revocación, coordinada bajo los bloqueos compartidos con 0051. Una revocación posterior debe impedir restaurar la suspensión incluso si no había vínculo activo. Cambiar simplemente a otra fecha de reloj no proporciona una ordenación transaccional fiable. Añadir esta regresión y probar ambos órdenes de transacciones. No se ha modificado SQL ni código funcional para corregirlo en esta intervención.

### Dependencias y seguridad verificadas por lectura

- Proyecto `pfdvehcyauoncxeolcjc` confirmado; dependencias hasta 0056 presentes, 0057 y Edge `user-administration` ausentes. Sin conflictos de nombres nuevos ni columna `app_users.admin_version` preexistente.
- Tablas, columnas, firmas y parámetros requeridos, restricciones y triggers de identidad, roles, sesiones y vínculos presentes. Las firmas existentes de asignación/revocación, inicialización de sesión, auditoría y contratos 0051 coinciden con las llamadas de 0057.
- RLS habilitada en las ocho tablas relevantes. Catorce políticas revisadas: lectura administrativa/propia según contexto; auditoría exclusiva de Superadministrador. `authenticated` carece de INSERT/UPDATE/DELETE directos en esas tablas; `anon` carece de SELECT. Ninguno puede crear objetos en `public`; `authenticated` no tiene USAGE de `elara_private`.
- Funciones existentes privilegiadas y autorización efectiva revisadas por definición y ACL: control de usuario/sesión/contexto y rol vigente; protección del último Superadministrador y triggers diferidos activos. Las funciones 0051 usan `search_path=pg_catalog`; helpers existentes con `search_path=public` permanecen en un esquema sin CREATE para clientes. Sin invocar RPC administrativas remotas.
- Las seis RPC locales 0057 usan SECURITY DEFINER y `search_path=pg_catalog`, sin EXECUTE para PUBLIC/anon; la reclamación de invitación es exclusiva de `service_role`. Las restantes requieren autorización efectiva de Superadministrador. Se revisaron recibos, versión optimista y separación de credenciales de Edge; el hallazgo anterior impide certificar la compatibilidad integral.

### Validación y pendientes

54 pruebas locales relevantes superadas: SQL 0057, interfaz administrativa, Edge y 23 pruebas del callback corregido. La última suite global previa fue 767 PASS; no se repitió. El escenario nativo nuevo reproduce el defecto, que no estaba cubierto por las pruebas previas. Se detiene el preflight ante este hallazgo crítico.

La configuración real de Auth (URL exacta de aceptación, allowlist y correo) y las variables del despliegue continúan pendientes de verificación; no se obtuvieron secretos. Variables necesarias: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ELARA_ALLOWED_ORIGINS`, `ELARA_USER_INVITE_REDIRECT_URL`. La clave privilegiada debe permanecer exclusivamente en servidor; gateway JWT más autorización efectiva en las RPC, sin exposición anónima. El callback conserva bearer/identidad/sesión inmutables para las operaciones sensibles; no usa una sesión global mutable para elegir la cuenta destinataria.

Secuencia mínima pendiente, sin ejecutarla: corregir la coordinación 0057/0051 y sus regresiones; completar comprobación de configuración Auth y hashes aprobados; renovar autorización; instalar exclusivamente el artefacto 0057 y su historial en una transacción con límites de bloqueo; verificar mediante lecturas; publicar callback y autorizar su URL HTTPS exacta; configurar y desplegar Edge con JWT y secretos solo en servidor. Ante COMMIT incierto, comprobar estado antes de reintentar. Ninguna de estas acciones queda autorizada por este informe.

El registro histórico siguiente se conserva como evidencia de intervenciones anteriores; el dictamen vigente es el de esta sección.

## Corrección del callback

El hallazgo descrito más abajo queda corregido en `src/js/accept-user-invite.js`. La verificación fija en memoria el usuario, `session_id`, bearer exacto y vencimiento de la invitación, comprobados con Auth. La actualización de contraseña ya no utiliza `auth.updateUser()` del cliente global mutable: envía `PUT /auth/v1/user` con ese bearer inmutable y la clave pública del proyecto. Auth determina el destinatario por el JWT validado, sin aceptar un ID de usuario como destino. La inicialización de acceso funcional también utiliza el mismo bearer fijo.

Antes del envío se vuelve a verificar la identidad mediante Auth y la coincidencia exacta de sesión/token. Cambios de cuenta, sesión, cierre de sesión, almacenamiento de otra pestaña o navegación invalidan el flujo y abortan las peticiones pendientes. Las comprobaciones después de cada espera impiden que respuestas tardías habiliten formularios, anuncien éxito o redirijan. Una renovación de token también obliga a reiniciar el flujo de forma conservadora. No se guardan copias adicionales de tokens ni contraseñas en almacenamiento; la vinculación vive únicamente en memoria.

La garantía de destinatario no depende de que llegue un evento de cambio a tiempo: los headers y la URL de cada petición sensible contienen el bearer y proyecto originales. Ninguna operación consulta la sesión global para elegir el destinatario del cambio. No fue necesario añadir backend ni modificar 0057, roles o permisos.

**Límite de cancelación:** si Auth ya recibió una petición antes de detectar el cambio de sesión, abortar el navegador no puede deshacer una actualización que el servidor haya aplicado. Esa petición solo puede afectar a la cuenta invitada, nunca a la cuenta que la sustituyó. Ante respuesta perdida o incierta no se reenvía la contraseña ni se anuncia éxito; se indica comprobar el acceso desde el inicio de sesión. Solo una respuesta explícita de rechazo de validación permite corregir la contraseña y realizar otro intento. Si la contraseña ya está confirmada, el botón de reintento únicamente inicializa/comprueba acceso funcional.

Las pruebas usan el SDK real 2.118.0 fijado por SHA-256 y transporte HTTP completamente interceptado. Cubren invitación válida e inválida/vencida, token hash, sustitución antes/durante/después de verificar, justo antes y durante la actualización, sesión diferente de la misma cuenta, cierre de sesión, respuestas tardías, doble envío, respuesta incierta, reintento de acceso, dos pestañas, navegación y respuesta de identidad discordante. Los destinatarios de todas las peticiones enviadas se comprueban expresamente.

La revisión remota anterior sigue siendo parcial: esta corrección local no autoriza instalar 0057 ni desplegar Edge. Deben completarse el preflight remoto pendiente y la configuración/URL definitiva de Auth. No se realizó ninguna consulta ni modificación remota durante esta corrección.

**Resultado de esta corrección:** 23 pruebas específicas PASS, suite global **767 PASS / 0 FAIL**, sintaxis JS correcta, `git diff --check` correcto y cinco hashes del manifiesto coincidentes. El hash del callback se actualizó en `0057-local-manifest.json`; las fuentes SQL y Edge no se modificaron. El caso crítico de identidad diferente queda resuelto localmente; permanece pendiente completar el preflight remoto antes de autorizar el despliegue conjunto.

## Registro del preflight anterior (antes de corregir)

## Hallazgo crítico local

`src/js/accept-user-invite.js`: `identity()` lee la sesión y espera a `getUser(token)`, pero no vincula la posterior operación `auth.updateUser({password})` a esa misma sesión. `updateUser` utiliza el cliente compartido y su sesión vigente. Si cambia la cuenta durante la espera, la verificación puede aprobar la cuenta anterior y el cambio de contraseña dirigirse a la cuenta nueva.

Reproducción aislada: se reutilizó el fixture de aceptación con el SDK fijado y transporte offline. Tras validar la invitación A, se sustituyó la sesión activa por B durante la respuesta de verificación de identidad. Se interceptó el intento de actualización: se dirigía a B. Resultado: `wrongIdentityPasswordUpdateAttempt: true`, `remoteAccess: false`. No se imprimieron tokens, contraseñas ni identificadores de cuentas reales.

Corrección necesaria: vincular la operación de contraseña a la sesión y al bearer verificados de la invitación mediante un cliente aislado sin persistencia compartida; invalidar el flujo ante cambios de cuenta/sesión y descartar respuestas tardías. Comprobar de nuevo la identidad confirmada antes de habilitar la navegación. Añadir regresión con sustitución de sesión durante verificación y durante la operación, con el SDK real y transporte interceptado. Una segunda lectura de la sesión, por sí sola, no elimina la carrera si el envío sigue usando una sesión global mutable.

No se modificó código funcional. Conforme a la instrucción de detenerse ante un problema crítico, no se prosiguió con pruebas generales ni con consultas remotas adicionales.

## Comprobaciones remotas realmente efectuadas

Conector Supabase, exclusivamente herramientas de proyecto, historial, listado de Edge Functions y un SELECT de metadatos/catálogo. No se usaron credenciales PostgreSQL ni se consultaron valores de cuentas, personas, contraseñas o tokens.

- Proyecto confirmado: `pfdvehcyauoncxeolcjc`, ELARA Transport, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166.
- Historial: 0003/00031, 0004, 0012–0014 y dependencias 0051–0056 presentes. 0055 figura como `20261116005500` y 0056 como `20261117005600`. 0057 ausente.
- Tablas requeridas de identidad, roles, sesiones, conductores y auditoría presentes, con RLS habilitada. Columnas requeridas de `auth.users` y `auth.sessions` presentes; solo se leyeron nombres y tipos del catálogo.
- Firmas previas presentes: `assign_user_role(uuid,text,text)`, `revoke_user_role(uuid,text)`, `require_superadmin_user()`, `user_has_active_role(uuid,text)`, `initialize_app_session(text)`, `current_auth_session_id()` y `write_audit_log(text,text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid)`.
- Contratos 0051 presentes: `admin_begin_driver_portal_access(uuid,uuid,text,text,boolean)`, `admin_link_driver_portal_access(uuid,uuid,boolean)`, `admin_revoke_driver_portal_access(uuid,uuid,text)` y `get_admin_driver_portal_access_context(uuid)`.
- ACL consultadas: asignación/revocación y contratos 0051 invocables por authenticated; helpers de Superadmin y auditoría sin concesión a authenticated. No se invocó ninguna RPC de negocio.
- Catálogo técnico: Superadmin, Administrativo y Conductor activos.
- Sin coincidencias para los seis nombres de RPC 0057, sus helpers `user_admin_%` y las dos tablas e índice privados nuevos. `app_users.admin_version` ausente, como corresponde antes de instalar.
- Edge remota: `driver-portal-access` activa, versión 1, `verify_jwt=true`. `user-administration` ausente.

**No completado:** revisión detallada de políticas y restricciones remotas, cuerpos de todas las funciones, conflictos de todos los triggers/índices y configuración de Auth/redirects/correo. RLS habilitada no equivale a haber verificado todas sus políticas. No se certifica todavía compatibilidad completa ni ausencia de efectos sobre la operación.

## Dictamen y secuencia pendiente

- **0057: BLOQUEADA para autorización de instalación**, por preflight detenido e incompleto; las comprobaciones estructurales realizadas no revelaron incompatibilidad.
- **Edge: BLOQUEADA para despliegue operativo**, hasta corregir y verificar el callback y completar el preflight.
- URL futura: `<origen HTTPS aprobado>/<ruta base>/accept-user-invite.html`. No hay dominio definitivo confirmado. Debe coincidir exactamente con `ELARA_USER_INVITE_REDIRECT_URL` y la allowlist de Auth. El retorno local es fijo a `index.html#dashboard`, sin URL arbitraria proporcionada por el usuario.

Orden, sin ejecutar: (1) corregir callback y probar carreras; (2) repetir SQL aislado, Edge, callback, suite global y diff-check, actualizando hashes; (3) completar preflight remoto de solo lectura y revisar configuración Auth sin secretos; (4) autorizar y preparar artefacto individual 0057 con historial dentro de una sola transacción, TLS verificado y límites de bloqueo; (5) instalar solo tras autorización y verificar por lecturas; (6) publicar callback/frontend y autorizar su URL exacta en Auth; (7) configurar y desplegar Edge con privilegios solo en servidor; (8) validar disponibilidad sin invitaciones ni cuentas ficticias en producción. Ante COMMIT incierto, comprobar historial/objetos antes de cualquier reintento.

Las 748 pruebas globales y cinco escenarios nativos corresponden a la intervención anterior; no se ejecutaron de nuevo tras detectar el hallazgo. El caso de carrera confirmado no estaba cubierto. No se aplicó 0057, no se desplegó Edge, no se cambió configuración remota y no se modificaron cuentas, roles, sesiones ni datos. Rama y cambios anteriores conservados.
