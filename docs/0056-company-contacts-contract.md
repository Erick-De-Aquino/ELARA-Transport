# Clientes 1C.3-A — contactos empresariales, backend local

17 de noviembre de 2026. Implementación exclusivamente local, sin aplicar a
Supabase remoto y sin integración visual. Rama conservada:
`backup/elara-restauracion-2026-11-15`; respaldo `1be4711` conservado.

## Auditoría previa y decisiones

Se inspeccionaron las definiciones reales de 0003, 0004, 0013, 0014, 0048 y
0055, sus helpers y las lecturas de ficha en `src/js/customers.js`:

- `customers`: UUID comercial, `customer_type`, `company_id`, estado comercial.
  Los contactos pertenecen a la empresa, no al UUID comercial.
- `persons`: nombre/apellidos, `phone`, `contact_email`, estado e identidad
  compartida. No hay una restricción única general de email/teléfono.
- `company_contacts`: UUID, empresa/persona, `role_label`, `notes`,
  `is_primary`, `status`, `started_at`, `ended_at`, actores y timestamps.
  El esquema sí admite notas propias del vínculo.
- Los índices parciales existentes impiden duplicar empresa/persona activos
  y tener más de un principal activo por empresa. Un vínculo inactivo puede
  conservarse mientras se crea otro período activo para esa persona.
- Los triggers de integridad de 0004 son diferidos y validan empresa/persona
  activas para vínculos activos; el vínculo inactivo requiere `ended_at`.
  No se sustituyen ni deshabilitan esos triggers.
- `updated_at` usa tiempo de transacción: no sirve como versión inequívoca.
  Se añade `company_contacts.version bigint NOT NULL DEFAULT 1` con CHECK
  positivo y trigger que asigna `OLD.version + 1` en cada UPDATE. Incluso un
  escritor privilegiado que envíe otra versión no evita el incremento.
- La ficha actual lee contactos por `company_id`. No se modifica su código,
  presentación, filtros, historial ni fuentes de lectura.
- RLS permite lectura administrativa y los accesos operativos ya existentes.
  `authenticated` conserva solo SELECT; no se añaden políticas de escritura.

Migración nueva: `supabase/migrations/0056_admin_company_contacts.sql`, aditiva
y transaccional. No se editó ninguna migración anterior ni contrato existente.
El número corto 0056 mantiene la convención vigente de este repositorio.

## Firmas definitivas

Las tres funciones devuelven **jsonb**, sin sobrecargas:

```sql
public.admin_add_company_contact(
  p_request_id uuid,
  p_customer_id uuid,
  p_contact jsonb,
  p_is_primary boolean DEFAULT false,
  p_notes text DEFAULT null
) RETURNS jsonb;

public.admin_set_company_primary_contact(
  p_request_id uuid,
  p_customer_id uuid,
  p_company_contact_id uuid,
  p_expected_version bigint,
  p_expected_primary_contact_id uuid,
  p_expected_primary_version bigint,
  p_reason text
) RETURNS jsonb;

public.admin_update_company_contact(
  p_request_id uuid,
  p_customer_id uuid,
  p_company_contact_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_reason text
) RETURNS jsonb;
```

Resultado común: `customer_id`, `company_id`, `company_contact_id`, `person_id`,
`status`, `is_primary`, `version`. Designar añade
`previous_primary_contact_id`; actualizar añade `ended_at`.
El recibo devuelve exactamente el resultado original, aunque el vínculo haya
cambiado después: una recuperación idempotente no equivale a una lectura actual.

## Creación y vinculación

`p_contact` acepta exclusivamente:

```json
{"mode":"new","first_name":"Nombre","last_name":"Apellidos",
 "phone":null,"email":"contacto@example.invalid","role_label":"Cargo"}
```

o `{"mode":"existing","person_id":"UUID","role_label":"Cargo"}`.

Se rechazan claves desconocidas y valores distintos de texto/null. Nombres y
apellidos son obligatorios para persona nueva, además de teléfono o correo.
Se recortan textos; el correo se pasa a minúsculas y se valida su formato.
La persona existente debe existir y estar activa. Nunca se actualizan sus
nombres, teléfono, email, notas, estado o relaciones con otras entidades.

Se reutiliza `elara_private.catalog_person`: rechaza duplicidad por email
normalizado, o mismo teléfono recortado con nombre/apellidos iguales sin
distinguir mayúsculas. Incluye personas inactivas. No hay adopción automática
ni coincidencias aproximadas; otros posibles duplicados requieren revisión.
Se mantienen los mismos locks de email y después teléfono que 0048/0055.

La operación exige cliente de tipo empresa en estado `new` o `active`, y
empresa activa. Se rechazan clientes bloqueados/inactivos y clientes
individuales. Esta es una restricción explícita de la nueva gestión de
contactos; no cambia estados comerciales ni reglas de servicios.

El vínculo nuevo comienza activo, con fecha del servidor y versión 1. Puede
ser secundario aunque no haya principal. Si se pide principal y ya existe
otro activo, se rechaza: añadir nunca sustituye al principal.

## Principal, actualización y desactivación

Designar exige versión actual del destino, UUID y versión del principal leído
previamente, y motivo no vacío. Si no había principal, ambos valores esperados
del principal son NULL. Las discrepancias se rechazan con SQLSTATE `40001`.
Se retira primero el principal anterior y después se designa el nuevo, dentro
de la misma transacción; se auditan ambos cambios. Si ya es el principal
esperado, se conserva la versión y se registra el recibo de la operación.

Actualizar acepta un patch no vacío con **solo** `role_label`, `notes` y
`status`. Omitir una clave la conserva; null o texto vacío limpia cargo/notas.
El único estado aceptado es `inactive`. No acepta `is_primary`, cambios de
persona, fechas, datos personales ni reactivación. Exige versión positiva y
motivo en toda actualización. Solo permite editar vínculos activos.

Desactivar conserva la fila, `started_at`, creador e historial; asigna
`ended_at` del servidor, `inactive_by` y `updated_by`, quita `is_primary` e
incrementa la versión. La empresa puede quedar sin principal. La persona no
se elimina ni inactiva. Un posterior vínculo de esa persona es otra fila,
con otro UUID y período de vigencia; la fila histórica permanece intacta.

## Idempotencia, concurrencia y rollback

Se reutilizan `catalog_request` y `catalog_audit` de 0048:

- Request UUID estable, namespace por actor compartido con 0048 y 0055.
- Hash de argumentos normalizados y recibo inmutable en `audit_logs`.
  Mismo actor/request con otra operación o payload devuelve `23505`.
- READ COMMITTED obligatorio por el helper. La recuperación del recibo ocurre
  antes de comprobar estados mutables: un resultado confirmado puede recuperarse
  después de una desactivación. La autorización siempre se comprueba de nuevo.
- Orden de locks: recibo, cliente, empresa, personas en orden UUID y vínculos.
  Las tres nuevas RPC bloquean la misma fila de empresa. La sustitución usa
  las versiones del destino y principal, además del UUID esperado del principal.
- Índices únicos existentes como última defensa de integridad.
- Persona nueva, vínculo, sustitución, eventos y recibo pertenecen a una sola
  transacción. Un error, incluido uno diferido al COMMIT, revierte todo.

Se probaron conexiones PostgreSQL independientes con dos administradores,
roles SQL `authenticated` y espera de lock observada en `pg_stat_activity`:
primer principal simultáneo, sustituciones simultáneas, vínculo duplicado,
persona nueva duplicada entre empresas, actualizaciones con la misma versión,
desactivación frente a sustitución, replay concurrente del mismo request y
reintento después del rollback de la primera conexión.

El contrato detecta versiones obsoletas de las filas esperadas; no es una
versión global del conjunto de contactos. Los escritores privilegiados ajenos
a estas RPC deben respetar el orden de locks si necesitan las mismas garantías.
Los índices siguen protegiendo sus invariantes aun para otros escritores.
No se afirma que PGlite de un backend pruebe concurrencia entre sesiones.

## Seguridad y auditoría

Las tres RPC y el helper de resolución de empresa usan SECURITY DEFINER porque
el navegador no tiene permiso directo de escritura. Todas comprueban
`require_admin_user()` y usan `search_path=pg_catalog` con objetos cualificados.
La autorización proviene de las funciones existentes de identidad, sesión
vigente, roles y contexto; no se usan metadatos editables del usuario.

EXECUTE solo para `authenticated` en las tres RPC. Revocado a PUBLIC, anon y
service_role; helpers nuevos sin EXECUTE para roles API. No se cambian grants,
RLS, funciones ni ACL anteriores. El trigger de versión no necesita privilegios
elevados. Los propietarios y grants se verifican mediante catálogos en pruebas.

Auditoría en `audit_logs` mediante el escritor y sanitizadores existentes:
actor, sesión, operación, motivo, IDs, estado/principal y versiones. Cambios de
cargo/notas se indican como booleanos; no se copian al evento. El recibo guarda
fingerprint y resultado, no el payload con nombres, teléfono o correo.
Los conflictos de duplicados al añadir devuelven un error genérico, sin DETAIL
de índices con datos personales. No se crean tablas auxiliares de auditoría.

## Validación y archivos

- `tests/company-contacts-0056-harness.cjs`: 18 escenarios compartidos.
- `tests/company-contacts-0056.test.cjs`: esos escenarios en PGlite y una prueba
  de conservación de todas las funciones/ACL anteriores y políticas RLS.
- `scripts/qa/0056-company-contacts.local.cjs`: 29 escenarios PASS en PostgreSQL
  17.6 nativo, incluidos locks entre conexiones y fallos reales de COMMIT.
  Imagen ya instalada `public.ecr.aws/supabase/postgres:17.6.1.165`,
  `--pull=never`, sin red, puertos publicados o volúmenes, con datos en tmpfs.
  Contenedor eliminado al terminar; credenciales efímeras solo en memoria/env.
- Migración nueva y este informe, más `docs/0056-company-contacts-results.json`.

Suite global final: **519 PASS / 0 FAIL / 0 omitidas**. Sintaxis JS y
`git diff --check` correctos. Los hashes de 122 archivos preexistentes de src y
migraciones permanecen idénticos. Los resultados completos constan en el JSON
de evidencia. Las pruebas de 0048, 0049, 0050 y 0055 se ejecutan también como
parte de la suite global.

La CLI instalada falló incluso en `--version`/`migration new --help` al intentar
escribir su archivo de telemetría fuera del workspace. No se instaló software,
no se cambió configuración y no se concedió acceso adicional para esa escritura.
Se conserva la numeración del repositorio y se valida SQL directamente en los
dos motores locales; no se presenta un resultado de advisors de la CLI.
La revisión de seguridad se apoyó además en la documentación oficial de
[funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Límites y parada

No se modificó frontend, Dashboard, Servicios, Clientes, SQL anterior, RLS,
configuración o datos remotos. No se consultó Supabase remoto, no se instalaron
migraciones remotas y no se crearon registros reales. No hubo commit, push,
merge, cambio de rama ni deploy.

Pendiente de aprobación: aplicar 0056 a remoto en una fase autorizada y, después,
integrar la interfaz de gestión. Antes de un despliegue deberá revisarse la
ventana de bloqueo del ALTER TABLE y confirmar el estado remoto real; esta fase
no sustituye esa auditoría. No hay edición de identidad compartida ni gestión
de estado comercial. Se detiene aquí sin avanzar a la integración visual.
