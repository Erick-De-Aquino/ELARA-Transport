# 0057 — Resultado de instalación autorizada

Proyecto: `pfdvehcyauoncxeolcjc` (ELARA Transport).
Fecha UTC: 2026-11-20, COMMIT confirmado a las 13:26:41.
Versión registrada: `20261120005700`, nombre `0057_admin_users`.

## Ejecución

- Preflight inmediato satisfactorio: seis fuentes y artefactos coincidentes con sus manifiestos, SQL con SHA-256 autorizado `d3246ed536478b8a204d01fd63e3aaddc03ddb8aee4fe2909927dd080aa656f7`, 0056 presente y 0057 ausente, historial y dependencias sin deriva.
- Session pooler 5432, libpq `sslmode=verify-full`, certificado aprobado `prod-ca-2021.crt`; validación de cadena y nombre del servidor. `pg_stat_ssl` informa sobre el tramo interno del pooler y no se utiliza como sustituto de la verificación TLS del cliente.
- Ejecutado una sola vez el artefacto individual aprobado, sin alterarlo y dentro de su única transacción. COMMIT reconocido, salida 0 y sin errores SQL reportados. Registro individual dentro de la misma transacción.
- Ninguna otra migración, seed, QA, operación administrativa ni invitación ejecutada.

## Verificación posterior exclusivamente de lectura

El verificador aprobado devuelve `verification=true`, `read_only=on`, versión `20261120005700`. Comprueba historial exacto anterior más registro único de 0057, fuente registrada, 17 funciones con cuerpos/propietarios/search_path/ACL esperados, dependencias conservadas, columna técnica y cuatro tablas privadas vacías con RLS y sin permisos directos para clientes. Se confirman las seis RPC nuevas y las dos funciones relacionadas con 0051.

Las cinco operaciones nuevas permanecen desactivadas: metadata, status, assign, revoke e invite. La tabla de activación permanece vacía; ninguna funcionalidad fue activada.

Comparación agregada antes/después: sin diferencias en Auth users, Auth sessions, personas, usuarios (excluida únicamente la columna técnica nueva admin_version), roles, asignaciones de roles, conductores, vínculos y auditoría.

**Incidencia:** el fingerprint de `public.app_sessions` difiere entre las lecturas previa y posterior. No se ha determinado la causa ni se atribuye el cambio a la migración. No puede certificarse la conservación exacta de esa tabla entre ambas lecturas. Ante esta anomalía se detuvieron las operaciones remotas, sin investigar mediante nuevas consultas ni intentar reparaciones. No se reintentó la instalación.

## Evidencia local

- `0057-session-preflight-results.json`
- `0057-deployment-attempted.json`
- `0057-session-install-results.json`
- `0057-session-post-results.json` (pass=false por la diferencia indicada; verificador de instalación=true)
- Ejecutor acotado: `../scripts/0057-session-install.cjs`; no acepta SQL arbitrario, fija hashes y exige preflight fresco y marca exclusiva de intento.

Los manifiestos aprobados se conservan sin regenerarlos; sus campos históricos remoteApplied=false describen el estado previo. Este documento registra la instalación efectiva.

Permanecen sin desplegar Edge Function user-administration, callback, GitHub Pages y SMTP. No se modificó configuración Auth ni se realizaron operaciones reales de administración. No hubo commit, push, merge, cambio de rama ni descarte de trabajo local.

## Aclaración de app_sessions — investigación posterior de solo lectura

### Resultado y límites

No se ha identificado una alteración inesperada ni evidencia de sesiones comprometidas. La actividad observada es compatible con el funcionamiento normal de sesiones, pero **no puede determinarse retrospectivamente la causa exacta del fingerprint distinto durante la instalación**. No se atribuye a 0057 ni se certifica que fuera exclusivamente una renovación.

El cálculo original era `md5(coalesce(string_agg((to_jsonb(t)-'admin_version')::text,'' order by (to_jsonb(t)-'admin_version')::text collate "C"),''))`, acompañado de count(*). En app_sessions no existe admin_version: entraban las 14 columnas completas: id, auth_user_id, app_user_id, supabase_session_id, active_context, created_at, updated_at, expires_at, ended_at, last_seen_at, device_label, ip_hash, user_agent_hash y ended_reason. No se extrajeron sus valores sensibles en esta investigación. Cualquier actualización de actividad, expiración, contexto, cierre, inserción o eliminación puede cambiar el hash; el orden físico de las filas no influye porque se ordena expresamente. La serialización de timestamptz también depende de la zona horaria de la conexión, que no se fijó ni registró en las comparaciones originales: es una limitación adicional, no una causa demostrada.

El preflight final se guardó a las 13:26:21.444 UTC con 39 filas y hash a232a83aaa6382220441a8859458f7e0. El postcheck de las 13:26:56.258 guardó únicamente unchanged=false: descartó el snapshot y no conservó hash, contador ni valores posteriores. Por ello no puede reconstruirse el delta exacto. Las lecturas posteriores no reemplazan esa evidencia perdida.

### Evidencia remota agregada actual

- Continúan 39 filas. Fingerprint actual fc6c431c4e07c546e6c7c610b86df21d; no es el fingerprint posterior original, que no fue conservado.
- Una fila tiene updated_at posterior al preflight; fue creada antes, sigue abierta y updated_at coincide con last_seen_at. Última actividad observada: 2026-11-20 13:31:19.979658 UTC. Las 39 filas tienen updated_at=last_seen_at.
- Ninguna fecha actual de creación, actualización, last_seen_at o cierre cae en el intervalo 13:26:21–13:26:57. Esto NO descarta actualizaciones intermedias: una posterior puede haber sustituido la marca previa.
- Ningún cierre posterior al preflight; último ended_at observado: 2026-11-06 13:32:20.166079 UTC.
- Cero incoherencias entre identidad Auth y usuario de aplicación, cero roles inválidos y cero sesiones Auth ausentes para las sesiones abiertas y no vencidas comprobadas.
- RLS habilitada y constraints validadas. Permanecen los tres triggers esperados: updated_at, validación diferida de contexto y auditoría de contexto. Las 14 columnas corresponden al esquema existente; 0057 no altera app_sessions.
- initialize_app_session(text) conserva el MD5 previo bf0e7b11cd6c7276d4223d992b5ac4ce. Inicialización, cambio de contexto y cierre mantienen EXECUTE para authenticated. No se invocaron estas funciones mutantes.
- Un registro de 20261120005700. user_admin_rollout y user_admin_requests continúan vacías: activaciones cerradas y sin recibos administrativos.

### Revisión de efectos y compatibilidad

0057 contiene UPDATE de app_sessions dentro de admin_manage_user para revocar roles o inactivar usuarios; son cuerpos de función, no sentencias ejecutadas por la instalación. El servidor exige activación explícita antes de esas mutaciones. No hay DDL ni backfill sobre app_sessions ni instalación de triggers nuevos en esa tabla. Los triggers nuevos de roles/vínculos actualizan la versión técnica de app_users; no cierran sesiones por sí mismos.

El flujo existente 0053 initialize_app_session actualiza last_seen_at y expires_at al reutilizar la sesión, y el trigger existente actualiza updated_at. set_active_context actualiza contexto y actividad; end_current_app_session marca cierre. auth.js reutiliza estos contratos al sincronizar Auth y cambiar contexto, conserva validaciones de rol y sesión y descarta respuestas obsoletas. La renovación observada es compatible con estos mecanismos, sin que ello identifique la operación histórica exacta.

No se detecta un bloqueo técnico adicional para continuar la preparación controlada de Usuarios Fase 1B por esta incidencia. Edge, callback, correo y activación gradual conservan sus requisitos y requieren autorización separada; este informe no los despliega ni habilita. No equivale a una prueba autenticada de extremo a extremo, que podría modificar sesiones y no se realizó.

Para una comprobación futura más precisa, tomar dos instantáneas exclusivamente de lectura con UTC/serialización canónica, conteos y hashes separados por fila pseudonimizada: identidad/contexto/cierre por un lado y actividad/expiración por otro. Compararlas localmente sin exportar tokens ni identificadores reales. Esto permitiría clasificar cambios futuros; no reconstruiría el delta perdido de esta instalación. No hace falta modificar tablas ni activar auditorías para esa comprobación.

Solo se actualizaron documentos locales; no hubo escrituras remotas, cierre de sesiones, cambio de usuarios/roles ni despliegues.

Validación local adicional: 27 pruebas de autenticación, concurrencia 0053 y selector multirrol superadas con Auth simulado/PGlite aislado. El primer lanzamiento carecía de ELARA_PGLITE_ROOT; se repitió con el runtime local existente y finalizó 27 PASS / 0 FAIL. No se instalaron dependencias. git diff --check sin errores de whitespace.
