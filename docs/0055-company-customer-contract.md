# Clientes 1C.2-A: contrato empresarial local

La migración `0055_admin_create_company_customer.sql` es aditiva. No modifica
0048, 0049, 0050, tablas, índices, políticas RLS ni frontend. No está aplicada
a Supabase remoto. El ordinal 0055 continúa la numeración del repositorio.

## Firma

```sql
public.admin_create_company_customer(
  p_request_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_trade_name text default null,
  p_billing_phone text default null,
  p_billing_email text default null,
  p_billing_address text default null,
  p_company_notes text default null,
  p_customer_internal_notes text default null,
  p_customer_billing_notes text default null,
  p_contact jsonb default null
) returns table (
  company_id uuid, customer_id uuid, customer_human_code text,
  company_status text, customer_status text,
  contact_person_id uuid, company_contact_id uuid
)
```

`customer_id` es el UUID de navegación de Clientes y Servicios. La empresa se
crea activa y el cliente `new`. Los UUID y el código EMP de cuatro cifras los
generan los defaults y triggers vigentes. No se reciben estados ni IDs nuevos.

## Contacto opcional

SQL NULL o JSON null: no crear persona ni vínculo.

Persona nueva: objeto con `mode: "new"`, `first_name`, `last_name`, y al menos
`phone` o `email`; `role_label` es opcional. Se rechazan claves desconocidas,
tipos no textuales y datos incompletos. Se crea una persona activa mediante
`elara_private.catalog_person`, conservando sus bloqueos y reglas de duplicidad
por email o por teléfono/nombre/apellidos. Una coincidencia se rechaza, sin
adopción, fusión ni modificación de la persona previa.

Persona existente: objeto con `mode: "existing"`, UUID `person_id` y
`role_label` opcional. La autorización administrativa proporciona el acceso
de lectura previsto por RLS; se comprueba y bloquea la persona activa con
FOR UPDATE. No se modifican sus datos ni sus otras relaciones.

En ambos modos el nuevo vínculo es activo y principal, con inicio del servidor.
No se implementa gestión posterior, sustitución de principal ni lifecycle.

## Normalización y seguridad

Se recortan espacios exteriores, el NIF/CIF se convierte a mayúsculas y los
correos a minúsculas. No se eliminan guiones o espacios interiores del NIF/CIF:
la comparación coincide con el índice existente. Los opcionales vacíos son
NULL y los correos informados requieren formato válido. No hay validación de
dígito fiscal por país ni deduplicación empresarial por nombre.

La RPC usa `SECURITY DEFINER`, `search_path=pg_catalog`, tablas/helpers
cualificados y `require_admin_user()`. EXECUTE se concede únicamente al rol
authenticated; anon, PUBLIC y service_role no reciben ejecución. El rol
authenticated sigue sin escritura directa en las tablas. Las comprobaciones
de instalación verifican los helpers, índices, privilegios de esquemas y la
propiedad/grants de la nueva función.

Solo se auditan IDs, estados, actor, sesión y huella criptográfica; no nombres,
contactos, NIF/CIF ni notas. Los errores de unicidad se vuelven a emitir sin
DETAIL que pueda contener datos fiscales o personales.

## Atomicidad, recibos y concurrencia

Se reutilizan `catalog_request`, `catalog_person` y `catalog_audit`, sin
copiarlos ni alterarlos. El recibo usa el namespace `catalog_contract=0048`
con operación propia `admin_company_customer_created`. Es compatible con su
índice único actor/request y rechaza colisiones entre operaciones.

El orden es: autorización/validación, bloqueo de recibo actor/request, bloqueo
transaccional de NIF/CIF, inserciones de empresa/cliente, persona/vínculo
opcionales y auditoría/recibo. El índice fiscal protege también frente a
escritores que no participen en el bloqueo asesor. Las personas nuevas usan
los mismos bloqueos email/teléfono de los creadores 0048.

READ COMMITTED es obligatorio por el helper de recibos. Un reintento con los
mismos argumentos normalizados devuelve el recibo original antes de volver
a comprobar estados o duplicados que podrían haber cambiado. Otro payload
con el mismo actor/request se rechaza. Una respuesta incierta se recupera
repitiendo la solicitud idéntica, sin generar un request_id nuevo. La respuesta
del recibo describe el resultado original, no necesariamente el estado actual.

Las empresas existentes se rechazan incluso si están inactivas o carecen de
cliente. No se actualizan ni adoptan automáticamente. Cualquier fallo revierte
todas las inserciones, el contador comercial transaccional y la auditoría. Las
restricciones diferibles siguen comprobándose al confirmar la transacción.

## Validación local

Las pruebas `tests/company-customer-0055.test.cjs` cargan las migraciones reales
hasta 0055 sobre PostgreSQL WASM/PGlite descartable, sin URL ni acceso remoto.
Verifican alta sin/con contacto, defaults, normalización, errores, permisos,
recibos, aislamiento, integridad, fallos inyectados, COMMIT con restricciones
diferidas, compatibilidad con Servicios, y preservación de funciones/ACL/RLS.

Usar el runtime aislado de las suites existentes:

```powershell
$env:ELARA_PGLITE_ROOT = Join-Path $env:TEMP 'elara-0048-runtime/node_modules'
$env:ELARA_SUPABASE_SDK_FILE = Join-Path $env:TEMP 'elara-supabase-2.118.0.js'
node --test tests/company-customer-0055.test.cjs
node --test tests/admin-catalog-0048.test.cjs tests/history-0049.test.cjs tests/financial-0050.test.cjs
node --test tests/*.test.cjs
git diff --check
```

Resultado local de esta intervención: **34/34** pruebas específicas,
**90/90** incluyendo los contratos relacionados 0048/0049/0050 y
**489 PASS / 0 FAIL** en la suite global, sin omitidos ni cancelados. La
migración se ejecutó y la función se compiló/ejercitó en PostgreSQL/PGlite;
`node --check` de la prueba y la comprobación de whitespace son correctos.
Los cinco archivos previos de Clientes 1C.1 y todas las migraciones anteriores
se compararon por SHA-256 y conservaron exactamente su contenido.

## Validación adicional nativa y HTTP (15 de noviembre de 2026)

Se completaron las dos verificaciones anteriormente pendientes sin instalar
software ni utilizar bases existentes. Docker Desktop estaba instalado pero
detenido; se inició el motor y se utilizaron exclusivamente imágenes ya
presentes, con `--pull=never`. No se modificó configuración global.

Herramientas comprobadas: Node.js 24.19.0; Docker Desktop 4.87.0 / Engine
29.7.2; PostgreSQL 17.6 de la imagen local
`public.ecr.aws/supabase/postgres:17.6.1.165`; PostgREST 16.1 de
`public.ecr.aws/supabase/postgrest:v16.1`; SDK de navegador Supabase JS
2.118.0 ya disponible en TEMP; PGlite 0.5.12 y LinkeDOM del runtime aislado.
El paquete CLI instalado declara 2.116.0. No se utilizó para aplicar cambios
remotos. No se encontraron binarios PostgreSQL/PostgREST nativos en Windows;
los binarios de las imágenes existentes proporcionaron la alternativa.

El paquete `pg` de TEMP estaba incompleto. Se emplearon procesos persistentes
de `psql` de la imagen, cada uno con una conexión y backend PostgreSQL propios.
La base se inicializó desde cero en el filesystem temporal de un contenedor
nuevo, cargando las migraciones hasta 0055 y los límites mínimos de Auth/Storage
del harness existente. No se montaron datos de la pila local anterior.

### Concurrencia: 9 PASS / 0 FAIL

Cada fila observó realmente la espera con `pg_blocking_pids` y `pg_locks`.
Se comprobaron las filas y recibos después de COMMIT/ROLLBACK, no solo dentro
de las transacciones. Los PID siguientes pertenecen al contenedor desechable
`elara0055-aeca30447571-pg`, eliminado al finalizar.

| Escenario | PID independientes | Espera observada | Resultado confirmado |
|---|---|---|---|
| Mismo request y argumentos | 78 / 85 | advisory | Mismo resultado; una empresa/cliente/recibo |
| Mismo request, argumentos distintos | 92 / 106 | advisory | 23505; sin segunda empresa ni recibo |
| Distintos request, mismo NIF/CIF | 113 / 120 | advisory | 23505; una empresa y cliente |
| Rollback del primer solicitante | 128 / 136 | advisory | El segundo crea; no quedan filas del primero |
| Dos empresas con contacto nuevo coincidente | 150 / 158 | transactionid | Una persona/empresa; segundo alta revertida |
| Persona 0048 primero, empresa 0055 después | 172 / 179 | advisory | Persona duplicada rechazada; sin empresa parcial |
| Empresa 0055 primero, persona 0048 después | 186 / 194 | advisory | Segundo alta rechazada; una persona |
| Timeout de bloqueo y rollback completo | 202 / 217 | advisory | 55P03; snapshot idéntico tras rollback; reintento válido |
| Persona existente inactivada concurrentemente | 224 / 231 | transactionid | 23514; sin empresa/cliente/vínculo/recibo parcial |

Se fijaron `lock_timeout=4s` y `statement_timeout=8s` en las conexiones de
contención; el caso de timeout usó 800 ms. No se observaron errores de deadlock
en estos escenarios. Esto no constituye una prueba de ausencia de deadlocks
para cualquier combinación futura de operaciones.

### HTTP/PostgREST: 13 PASS / 0 FAIL

Se ejecutaron solicitudes HTTP reales contra PostgREST 16.1, conectado a la
base nativa desechable. El rol authenticator, contraseñas y clave JWT fueron
generados exclusivamente para la prueba, sin credenciales reales.

1. OpenAPI descubre la RPC, argumentos nominados y defaults.
2. POST devuelve un array de una fila con los siete campos; datos confirmados.
3. Reintento idéntico no escribe; payload diferente con mismo request devuelve 409/23505.
4. NIF/CIF duplicado devuelve 409/23505 sin exponerlo en el error.
5. Parámetro superior desconocido devuelve 404/PGRST202 desde la caché real.
6. Campos/contactos inválidos devuelven 400/22023.
7. Contacto nuevo y existente persisten; la persona existente queda intacta.
8. Anónimo, conductor y service_role no pueden ejecutar (401/403, código 42501).
9. Firma JWT inválida y JWT caducado devuelven 401 antes de escribir.
10. JWT válido sin sesión de aplicación correspondiente devuelve 28000.
11. GET no puede crear mediante una función VOLATILE: 405, sin escrituras.
12. Fallo inyectado de constraint diferible al COMMIT devuelve 400/23514 y revierte todo.
13. El bundle real Supabase JS 2.118.0 invoca `.rpc()` y recupera el mismo resultado.

Para el SDK se utilizó un proxy local transparente que elimina únicamente el
prefijo `/rest/v1`; no simuló respuestas ni escrituras. Ambos POST del SDK
llegaron a PostgREST y PostgreSQL reales, verificándose las filas confirmadas.
La clave verificadora JWT fue efímera; no se ejecutó GoTrue ni se usaron tokens
de usuarios reales.

### Seguridad, regresión y límites

El catálogo nativo confirmó `SECURITY DEFINER`, `search_path=pg_catalog`, tres
argumentos obligatorios, ocho defaults y los siete campos TABLE de respuesta.
La revisión mantiene tablas/helpers cualificados, EXECUTE limitado, autorización
de usuario/sesión/contexto mediante `require_admin_user`, helpers privados,
aislamiento READ COMMITTED, bloqueos e índices, e integridad diferida.
Los helpers heredados siguen usando sus search_path originales; 0055 comprueba
que los roles API no pueden crear objetos en public/extensions. No se cambiaron
esas funciones ni sus permisos.

No se reprodujo ningún defecto del contrato 0055 ni de sus pruebas versionadas;
no se modificaron la migración ni el test. Los ajustes durante la validación
afectaron solo al verificador temporal: conexión TCP en vez de socket Unix,
comparación fiscal normalizada, fixtures independientes y carga del SDK en VM.
Una ejecución concurrente con suites PGlite sufrió timeout del verificador;
la ejecución final completa se realizó por separado y pasó.

Regresión repetida: **34/34** de 0055, **90/90** con 0048/0049/0050 y
**489 PASS / 0 FAIL** globales, sin omitidos ni cancelados. Sintaxis y whitespace
correctos. SHA-256 confirmó conservación de los cinco archivos de 1C.1 y de
todas las migraciones, incluida 0055. Solo se actualiza este documento.

Evidencias locales en TEMP:

- `elara-0055-native-validation.cjs`: verificador usado, sin dependencias nuevas.
- `elara-0055-native-validation.log`: ejecución nativa/HTTP completa.
- `elara-0055-native-results.json`: versiones, firma, PID, bloqueos y limpieza.
- `elara-0055-extra-related.log` y `elara-0055-extra-global.log`: regresión.

Se eliminaron ambos contenedores, su red y el almacenamiento temporal; la
consulta Docker posterior no encontró recursos con el prefijo de pruebas.
La pila local que Docker inició automáticamente se devolvió al estado detenido.

**Cobertura pendiente:** plataforma Supabase completa con GoTrue/Kong y sus
esquemas de sistema reales, advisors y configuración/versiones exactas del
destino. No se consultó ni aplicó nada remoto. La prueba valida la RPC SQL y
PostgREST reales sobre una base limpia con límites Auth/Storage del harness,
no una réplica completa de producción.

La migración supera los criterios locales adicionales y está preparada para
revisión y aprobación de una aplicación controlada. Antes de producción se
recomienda comprobar el entorno Supabase de staging con Auth real y los
prerrequisitos de 0055. Esta conclusión no autoriza ni realiza un despliegue.

Referencias oficiales consultadas: [RPC y parámetros de PostgREST](https://docs.postgrest.org/en/stable/references/api/functions.html)
y [roles/JWT de PostgREST](https://docs.postgrest.org/en/stable/references/auth.html).
