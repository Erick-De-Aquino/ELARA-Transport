# Usuarios 1B — implementación local, sin despliegue

Proyecto previsto: ELARA Transport `pfdvehcyauoncxeolcjc`. No se han consultado ni modificado cuentas, roles, Auth o SQL remotos. Rama, respaldo `1be4711` y cambios anteriores conservados.

## Contratos

- `assign_user_role(uuid,text,text)` y `revoke_user_role(uuid,text)` permanecen intactos y se reutilizan desde la nueva operación coordinada.
- Migración **0057_admin_users.sql**, aditiva y transaccional, con timeout de bloqueo de 5 s y de sentencia de instalación de 30 s.
- `admin_get_user_control(uuid)` comprueba disponibilidad y devuelve estado, nota, contexto y versión del usuario para edición.
- `admin_manage_user(uuid,uuid,bigint,text,jsonb,text)` coordina `metadata`, `status`, `assign` y `revoke`, con motivo obligatorio, versión esperada, recibo inmutable y auditoría.
- `admin_get_user_request(uuid)` permite conciliar resultados; solo el operador propietario puede leerlos.
- Invitaciones: `admin_prepare_user_invitation(uuid,jsonb)`, `admin_claim_user_invitation(uuid,uuid,uuid)` y `admin_complete_user_invitation(uuid,uuid)`. Claim accesible exclusivamente con rol de servicio desde backend; las demás operaciones exigen usuario, sesión Auth existente y contexto Superadministrador confirmado.
- Los cambios de roles/vínculos efectuados por contratos existentes incrementan también la versión administrativa. No cambian sus firmas, permisos ni políticas RLS.

## Comportamiento y límites deliberados

- Sin backend 0057, los botones quedan deshabilitados. Sin Edge Function operativa, también queda deshabilitada la invitación. Las comprobaciones de disponibilidad solo leen; no preparan invitaciones ni escriben sesiones.
- Se permite editar nota interna y contexto predeterminado, no nombres, correo, contraseñas ni la identidad compartida de `persons`.
- Invitación nueva: roles Superadmin y/o Administrativo. El acceso Conductor sigue el flujo 0051, sin duplicarlo ni habilitar un portal por el mero rol. Contactos/personas ya existentes requieren revisión específica; no se crea una segunda identidad silenciosamente.
- Inactivar termina sesiones funcionales y cierra temporalmente el vínculo de conductor conservando su historial. Reactivar puede crear un nuevo vínculo únicamente para la suspensión registrada por 0057, si persona, rol y conductor siguen siendo válidos y no hubo una revocación posterior por 0051. No modifica la ficha del conductor ni bloquea/desbloquea Auth.
- Revocar un rol exige alternativa vigente cuando afecta al contexto predeterminado y termina las sesiones que lo usan. La revocación del acceso Conductor vinculado se realiza mediante 0051.
- Se conserva la protección del último Superadmin. La propia inactivación y la revocación del propio rol Superadmin requieren otro Superadmin.
- No se borran cuentas ni se elimina historial. La reactivación nunca reabre sesiones terminadas: el usuario deberá iniciar una nueva sesión.

## Invitación e incertidumbre

La Edge Function `user-administration` verifica el bearer con Auth y autoriza preparación con el JWT del operador. Después reclama un envío único y duradero en la base de datos antes de llamar a Auth Admin. No acepta URLs de retorno proporcionadas por el navegador. El correo queda reservado para evitar solicitudes paralelas o duplicadas.

La operación externa de correo no es atómica con PostgreSQL: si el envío o su respuesta se pierde, el estado permanece pendiente. Los reintentos buscan la identidad por el correo aprobado y completan el registro funcional sin reenviar la invitación. Si no aparece identidad, se requiere revisión; no hay reenvío automático ni desbloqueo de la reserva. Los recibos sobreviven al navegador. El formulario conserva la solicitud incierta en memoria durante la sesión; después de recargar completamente, un operador deberá conciliar el recibo antes de resolver una reserva pendiente.

La interfaz no anuncia éxito hasta recibir confirmación. Impide doble envío y descarta respuestas tras navegación o cambio de identidad/contexto. La recuperación manual utiliza el mismo UUID y payload; nunca genera otra solicitud para un resultado incierto.

La página nueva `accept-user-invite.html` usa el contexto predeterminado confirmado por `initialize_app_session(NULL)`. No modifica la página del portal Conductor. Admite enlace de invitación implícito o `token_hash&type=invite`; rechaza una sesión preexistente sin invitación válida. Los tokens no se registran ni se persisten por esta página. Si la contraseña ya fue confirmada y el registro funcional sigue pendiente, ofrece comprobar acceso sin volver a modificarla. Tras recargar esa página sin enlace, se vuelve al inicio de sesión.

Corrección de seguridad posterior: las peticiones de contraseña y acceso funcional usan explícitamente el bearer inmutable de la invitación validada, sin `updateUser()` ni RPC sobre la sesión global mutable. Un cambio de sesión/cuenta invalida el flujo; respuestas tardías no producen navegación ni éxito. Un envío ya recibido por Auth puede haberse aplicado únicamente a la cuenta invitada; no se reenvía una contraseña cuyo resultado es incierto. Detalle y pruebas en `0057-preflight-security.md`. El despliegue permanece pendiente de completar el preflight remoto.

## Autorizaciones pendientes antes del uso real

1. Autorizar preflight remoto de solo lectura: confirmar proyecto, historial 0055/0056, ausencia de 0057, funciones previas, RLS, estructura de `auth.sessions` y ausencia de conflictos con los nuevos nombres/columnas/triggers. La compatibilidad remota de 0057 aún no se ha comprobado.
2. Autorizar exclusivamente la instalación individual de 0057 mediante Session pooler 5432, TLS `verify-full` y certificado aprobado. Revisar hashes del manifiesto. Preparar el artefacto final incluyendo registro único en `supabase_migrations.schema_migrations` dentro del mismo BEGIN/COMMIT; no usar `db push` genérico. Ante COMMIT incierto, consultar primero historial y objetos antes de reenviar.
3. Autorizar el despliegue de la Edge Function y su configuración segura: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` solo en runtime, `ELARA_ALLOWED_ORIGINS` y **`ELARA_USER_INVITE_REDIRECT_URL`** con URL HTTPS fija terminada en `/accept-user-invite.html`. Mantener verificación JWT habilitada. No se han leído ni creado secretos para esta intervención.
4. Autorizar publicación del frontend/callback y añadir su URL exacta a las redirecciones permitidas de Auth. Comprobar configuración de correo/plantilla sin enviar invitaciones a cuentas reales durante validación. La configuración del flujo 0051 permanece independiente.
5. Postcheck de solo lectura: firmas y ACL de las seis RPC, acceso denegado a anon, claim denegado a authenticated, tablas privadas inaccesibles, RLS previa conservada y recibo único de migración. No crear usuarios de prueba en producción.

Para detener nuevas operaciones sin perder registros: revocar EXECUTE a authenticated en `admin_get_user_control`, `admin_manage_user`, `admin_prepare_user_invitation` y `admin_complete_user_invitation`, y suspender la Edge Function. Requiere autorización remota; no revocar los contratos 0013/0051 ni borrar tablas o historial. No cancela operaciones ya en curso ni deshace cambios confirmados.

## Validación local

Pruebas SQL semánticas: `tests/users-0057.test.cjs`. Transporte Auth Admin aislado: `tests/users-edge-0057.test.cjs`. Callback con SDK real fijado y transporte offline: `tests/accept-user-invite-0057.test.cjs`. Interfaz y regresión: `tests/users-admin.test.cjs` y `tests/users-presentation.test.cjs`. Responsive: `tests/users-admin.visual.cjs` (390, 640, 768, 1024 y 1440 px).

Concurrencia PostgreSQL nativa: `scripts/qa/0057-users.local.cjs`, contenedor desechable sin red, puertos ni volúmenes de producción. Cinco comprobaciones: edición concurrente, recibos, COMMIT de inactivación, claim único y revocación del operador durante una espera. Contenedor eliminado.

Las referencias oficiales consultadas para el límite de Auth Admin y autorización de Edge Functions son [invitaciones](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) y [seguridad de Edge Functions](https://supabase.com/docs/guides/functions/auth).

Resultado final: **748 PASS / 0 FAIL** en suite global (35 pruebas nuevas: 14 SQL, 9 de interfaz administrativa, 8 de Edge y 4 de aceptación). Las 12 pruebas de consulta 1A permanecen correctas. Cinco comprobaciones nativas PASS y contenedor eliminado; un timeout de infraestructura al repetirlas en paralelo con la suite global se resolvió ejecutándolas por separado. Responsive de los cinco formularios correcto en los cinco anchos. Comprobación sintáctica JS/TS, cinco hashes del manifiesto y `git diff --check` correctos. Sin despliegue ni acceso remoto.
