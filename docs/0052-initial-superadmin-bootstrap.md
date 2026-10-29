# 0052: bootstrap excepcional del primer superadmin

Estado: implementación local. No crea usuarios Auth ni ejecuta datos de bootstrap
al aplicar la migración. No cambia 0051, frontend, Edge ni permisos del
administrativo existente. No requiere tablas nuevas.

## Motivo e identidad

`assign_user_role` requiere `require_superadmin_user`: con cero superadmins no
puede crear el primero. El seed QA local no es una solución productiva.
0052 añade una función interna y un índice de consumo global sobre `audit_logs`.
Primero debe prepararse, por Auth Admin/Dashboard, una identidad Auth **dedicada**,
verificada y controlada por su titular. Su contraseña se establece privadamente,
nunca mediante SQL, parámetros del bootstrap o logs. No usar el administrativo,
conductores reales, QA/legacy ni ocupar sin revisión el email reservado al smoke.

## Contrato y permisos

`elara_private.bootstrap_initial_superadmin(p_request_id uuid, p_auth_user_id uuid,
p_expected_email text, p_first_name text, p_last_name text, p_reason text,
p_operator_reference text) RETURNS jsonb`.

Owner `postgres`, `SECURITY INVOKER`, `search_path=pg_catalog`, referencias
calificadas. Sin EXECUTE para PUBLIC, anon, authenticated ni service_role. Solo
rol efectivo `postgres`, conexión administrativa real y sin `auth.uid()`.
No es una RPC pública PostgREST, endpoint HTTP, operación del navegador ni Edge.
El propietario DB es la frontera de confianza; esta función no impide que un
administrador DB deliberadamente altere el esquema o las protecciones.

## Precondiciones y transacción

UUIDs no nulos/cero, email válido normalizado, nombres, motivo y referencia del
operador obligatorios y acotados. READ COMMITTED obligatorio. Cero superadmins
efectivos y ningún recibo de consumo. El catálogo superadmin debe estar activo.
Auth debe existir por UUID exacto, coincidir en email normalizado, estar confirmado,
no anónimo, no eliminado y no bloqueado. Se rechazan Auth duplicados por email,
Auth ya vinculado a cualquier app_user y personas existentes con el mismo email,
incluso inactivas: no hay adopción ni reactivación.

Orden fijo de locks: advisory transaccional `(451004,3003)` (el de los guards
existentes); tablas persons, app_users, user_roles, roles en SHARE ROW EXCLUSIVE
NOWAIT; fila Auth FOR UPDATE NOWAIT. Los locks de tabla protegen también frente a
escritores que no usan el advisory. Si están ocupados, 55P03 sin escritura parcial.
El orden y NOWAIT evitan ciclos con escritores que llegan al guard después de
haber bloqueado filas. No mantener abierta la transacción esperando al usuario.

Una sola transacción crea persona, app_user activo con default_context superadmin,
rol superadmin vigente sin ends_at, auditoría automática del rol y recibo explícito.
No crea conductor, otros roles ni app_sessions. Las validaciones diferidas siguen
activas. Solo COMMIT confirma el resultado; una respuesta de la función antes de
COMMIT no prueba persistencia. Un fallo de cualquier fase, incluido COMMIT,
revierte persona/app/rol/auditoría/consumo y permite un intento limpio posterior.

## Un solo uso, auditoría e idempotencia

Índice único parcial `audit_logs_0052_bootstrap_once`: solo un registro aplicado
global con `metadata.bootstrap_contract=0052_initial_superadmin` y phase applied.
La auditoría es append-only y no se actualiza para guardar IDs posteriormente.
El recibo contiene request_id (columna y metadata), target Auth, person/app/role,
argumentos normalizados y fingerprint SHA-256, resultado, before/after, motivo,
operator_reference, session_user, rol efectivo y timestamps/transaction_id.
Actor funcional, Auth actor y contexto quedan NULL: no se atribuye al administrativo
ni se finge que el nuevo usuario se concedió permisos a sí mismo.

Tras consumo **toda repetición de escritura falla** (23514); misma key con payload
distinto falla 23505. Es idempotencia de efectos mediante recuperación READ-ONLY,
no un segundo bootstrap. El recibo sigue bloqueando aunque después vuelva a haber
cero superadmins. No es una herramienta de recuperación de cuentas.

Recuperación de una respuesta perdida, con la request UUID aprobada como parámetro:

```sql
SELECT request_id, occurred_at, metadata->'result' AS result
FROM public.audit_logs
WHERE metadata->>'bootstrap_contract' = '0052_initial_superadmin'
  AND metadata->>'phase' = 'applied'
  AND request_id = $1;
```

Comprobar consumo global y superadmins efectivos:

```sql
SELECT count(*) AS consumed
FROM public.audit_logs
WHERE metadata->>'bootstrap_contract' = '0052_initial_superadmin'
  AND metadata->>'phase' = 'applied';

SELECT count(*) AS effective_superadmins
FROM public.app_users u
WHERE public.user_has_active_role(u.id, 'superadmin');
```

Dos intentos simultáneos se serializan en el advisory: uno confirma; el segundo
ve el recibo y falla de forma controlada. La unicidad es defensa adicional. Si el
primero revierte, no hubo bootstrap aplicado y otro intento puede ganar.

Los guards existentes de último superadmin siguen activos y comparten el lock.
Impiden quitar el único rol vigente o inactivar su app_user. No sustituyen el
recibo permanente ni cubren toda operación privilegiada sobre Auth/catálogo.

## Validación local reproducible

Configurar ELARA_PGLITE_ROOT al runtime local ya usado por los tests 0051.
`node --test tests/bootstrap-0052.test.cjs` ejecuta SQL real en PGlite desechable.
`node tests/bootstrap-0052.local.cjs` usa conexiones independientes al PostgreSQL
local 127.0.0.1:54422 y bases elara_0052_UUID eliminadas en finally. No tiene
fallback remoto ni ejecuta seed QA. Auth users locales son modelos desechables.
La suite histórica completa también necesita ELARA_SUPABASE_SDK_FILE, igual que
los tests de aceptación 0051 (bundle público 2.118.0 fijado por hash).

## Procedimiento productivo futuro (requiere autorización separada)

1. Revisar hashes, catálogo, suite completa y concurrencia; aprobar predeploy 0052.
2. Aplicar únicamente 0052 y verificar owner/invoker/path/revokes; no ejecuta datos.
3. Preparar Auth dedicado por canal oficial, verificación de titularidad incluida.
4. Aprobar UUID Auth exacto, email, nombre/apellidos, request UUID estable, motivo y
   referencia del operador/aprobación. No interpolar parámetros en SQL.
5. Verificar identidad y cero superadmins/recibos por lectura. Conexión DB
   administrativa real con rol efectivo postgres; sin claims de aplicación.
6. BEGIN READ COMMITTED, llamar función con parámetros aprobados, COMMIT. Si hay
   contención, no forzar; tras error, rollback y consultar recibo antes de reintentar.
7. Verificar un recibo, un superadmin efectivo, persona/app/rol correctos, sesión
   administrativa anterior intacta y repetición bloqueada. No borrar auditoría.
8. Login normal del nuevo titular y initialize_app_session en contexto superadmin.
9. Reanudar validación de autorización Edge 0051, commit/publicación y smoke.

No crear Auth por SQL, conceder EXECUTE a roles API, usar service_role como bypass,
promover al administrativo, reactivar cuentas, editar 0051, borrar recibos,
deshabilitar triggers/RLS o volver a usar este mecanismo para recuperación futura.
