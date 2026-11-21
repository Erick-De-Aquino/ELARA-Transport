# ELARA Transport — Clientes 1C.2: validación y preparación de 0055

Fecha: 16 de noviembre de 2026. **No se ha aplicado nada a Supabase remoto.**

## Dictamen

La validación local pasa, incluida autenticación real con Supabase Auth,
PostgREST, PostgreSQL y Supabase JS. No se ha reproducido un defecto del
contrato ni del formulario que requiera modificar código operativo.
0055 está preparada para revisión del despliegue, pero **no recomiendo una
autorización incondicional de aplicación remota**: faltan la identificación
autorizada del destino, su historial, esquema efectivo, ACL y versiones.
Las pruebas locales no certifican ese entorno.

Se conserva la rama `backup/elara-restauracion-2026-11-15`, el respaldo
`1be471170e2c62815f140300d050afc2a85b195f` y los cambios preexistentes.
Esta intervención añade únicamente el verificador, sus resultados saneados
y este informe. No cambia migraciones, frontend, Dashboard, Servicios ni
lógica financiera. No hay commit, push, merge ni deploy.

## Entorno y aislamiento

| Componente | Comprobación |
|---|---|
| Docker Desktop | 4.87.0; inicialmente detenido, iniciado para esta prueba |
| Docker Engine | 29.7.2, Linux/amd64; accesible tras arrancar Desktop |
| Supabase CLI | 2.116.0, versión y ayuda ejecutadas; sin iniciar ni enlazar proyectos |
| Configuración del repositorio | `project_id=ELARA-Transport`; API 54421, DB 54422, PostgreSQL major 17; seed deshabilitado |
| Base descartable | Imagen existente `public.ecr.aws/supabase/postgres:17.6.1.165`, servidor PostgreSQL 17.6 |
| Auth real | Imagen existente `public.ecr.aws/supabase/gotrue:v2.196.0`; migraciones propias de Auth reales |
| PostgREST real | Imagen existente `public.ecr.aws/supabase/postgrest:v16.1` |
| Supabase JS | Bundle 2.118.0 previamente disponible en TEMP |

Se creó una red y tres contenedores con nombres aleatorios `elara1c2-*`.
PostgreSQL usó `/tmp` en tmpfs, sin montar volúmenes ni bases anteriores.
Auth y PostgREST publicaron puertos aleatorios exclusivamente en 127.0.0.1.
Un proxy HTTP local enrutó `/auth/v1` y `/rest/v1` a esos servicios; no fabricó
respuestas. Todos los contenedores usaron `--pull=never`. Contraseñas, clave
JWT y usuarios se generaron para cada ejecución y no se guardaron en el informe.
No se ejecutó `config.js` del frontend ni se cargaron credenciales remotas.

La pila local anterior permaneció detenida. Tras finalizar, el JSON registra
la eliminación de los tres contenedores y su red; una inspección Docker
independiente no encontró recursos `elara1c2-*` ni contenedores en ejecución.
Docker Desktop queda iniciado; no se modificó su configuración global.

No es una réplica completa de Supabase hospedado: Storage usa un esquema
mínimo para compilar las migraciones; no se arrancan Storage, Realtime,
Edge Functions, Studio ni Kong. El proxy cubre el enrutamiento necesario,
pero no reproduce las políticas del gateway remoto. Auth usa HS256 efímero;
no se certifican las claves asimétricas/JWKS del destino.

## Resultados de Auth, RPC y permisos

**10 escenarios integrales PASS / 0 FAIL**, más carga satisfactoria de todas
las migraciones de aplicación hasta 0055 sobre el esquema real de Auth:

1. Usuarios efímeros administrativo y conductor creados por Auth Admin local;
   login mediante `signInWithPassword`, JWT emitido por GoTrue y sesión
   existente en `auth.sessions`. `initialize_app_session` se invoca por SDK
   con `p_requested_context`, sin insertar sesiones de aplicación a mano.
2. `.rpc('admin_create_company_customer', args)` devuelve un array con una
   fila y siete campos; empresa `active`, cliente `new`, código EMP generado
   por servidor y contacto nulo. Repetición idéntica conserva el resultado;
   argumentos distintos con el mismo request producen `23505`.
3. Contacto nuevo, campos opcionales y notas de empresa/internas/facturación
   independientes comprobados en filas confirmadas. Correo normalizado.
4. Persona existente enlazada sin modificar su fila.
5. Razón social/NIF vacíos y contacto incompleto producen `22023`; NIF
   duplicado produce `23505`. Conteos de empresa, cliente, persona, vínculo
   y auditoría idénticos después de los rechazos.
6. Conductor autenticado recibe `42501` al invocar la RPC.
7. Peticiones sin JWT, con firma falsa o token expirado reciben 401/403.
   SDK anónimo recibe `42501`. Los tokens válidos de los casos positivos
   provienen de GoTrue; solo los negativos se fabrican deliberadamente.
8. INSERT, UPDATE y DELETE directos sobre companies/customers/persons/
   company_contacts se rechazan con `42501`, incluso con sesión administrativa.
9. SELECT HTTP bajo RLS y el `loadIdentity` real de `operational-data.js`
   recuperan el cliente y su nombre empresarial. Se verifica el predicado
   `new/active` empleado por Servicios.
10. Formulario HTML real y controladores de `catalog-admin.js` en DOM LinkeDOM,
    conectados al SDK autenticado y servicios reales. Habilitación solo en la
    instancia de prueba, con URL de configuración/SDK iguales y de loopback.
    Alta con contacto; pérdida de respuesta inyectada **después del commit
    HTTP real**; reintento con argumentos idénticos; una sola empresa y recarga
    confirmada. El opt-in se elimina al terminar y nunca se escribe en src.

Las primeras ejecuciones detectaron errores del propio verificador:
fixtures de app_users/roles fuera de una transacción, nombre incorrecto del
parámetro de sesión, rol vacío en el usuario Auth de prueba, uso de indexRecords
sin cargar las colecciones y comparación fiscal sin convertir a mayúsculas.
Se corrigió el verificador, no el contrato ni las migraciones previas.

## Formulario y compatibilidad de lectura

Las pruebas existentes verifican payload exacto, tres notas separadas,
obligatorios, contacto ninguno/nuevo, guardas de sesión/navegación, respuestas
tardías y preservación de Particular. El modo persona existente se prueba por
RPC; permanece deshabilitado en el formulario por el alcance aprobado.

El botón empresarial continúa bloqueado por defecto. Las pruebas confirman
que una bandera aislada, una URL remota, URLs locales distintas o un cambio
de binding durante una lectura asíncrona no permiten enviar.

Clientes utiliza persons/companies/customers. Servicios utiliza esas
colecciones y filtra clientes `new` o `active`: lectura real bajo RLS y nombre
empresarial correctos. La prueba 0055 existente también crea un servicio local
con el UUID nuevo y comprueba su contexto financiero. **No se modificó Servicios.**

Límite: se ejercitan los handlers reales del formulario en DOM, no un navegador
con el módulo completo `auth.js`, ni los clics del selector de Servicios.
No se repitió la suite visual `.visual.cjs` en esta intervención: no hubo
cambios visuales; se conserva la aprobación visual previa. Quedan pendientes
la comprobación visual autenticada en navegador aislado y la equivalencia
del entorno de destino. No se presentan como pruebas realizadas.

## Regresión y evidencias

| Ejecución actual | Resultado |
|---|---|
| 0055 + catálogo/formulario + Clientes + 0048/0049/0050 | 209 PASS, 0 FAIL, 0 omitidos/cancelados |
| Suite global `node --test tests/*.test.cjs` | 497 PASS, 0 FAIL, 0 omitidos/cancelados |
| Nuevo verificador Auth/HTTP/SDK | 10 PASS, 0 FAIL |
| Sintaxis | `node --check` correcto en catalog-admin.js, customers.js, pruebas 0055/catálogo/Clientes/visual y nuevo verificador |
| Whitespace | `git diff --check` correcto; avisos informativos LF/CRLF de archivos previamente modificados |

Las suites PGlite usan una base en memoria sin URL ni fallback remoto.
Los 9 escenarios nativos de concurrencia y 13 HTTP anteriores permanecen
documentados en `0055-company-customer-contract.md`; **no se han vuelto a
ejecutar ni se suman a los resultados actuales**.

Artefactos reproducibles:

- `scripts/qa/0055-auth-validation.cjs`: verificador autocontenido con Node
  built-ins, psql de la imagen, bundle SDK y LinkeDOM ya presentes en TEMP.
- `docs/0055-auth-local-results.json`: resultados saneados y limpieza.
- TEMP: `elara-1c2-auth-validation.log`, `elara-1c2-auth-results.json`,
  `elara-1c2-integral-related.log` y `elara-1c2-integral-global.log`.

Desde la raíz, con Docker iniciado y esos recursos previamente disponibles:

```powershell
node scripts/qa/0055-auth-validation.cjs
$env:ELARA_PGLITE_ROOT = Join-Path $env:TEMP 'elara-0048-runtime/node_modules'
$env:ELARA_SUPABASE_SDK_FILE = Join-Path $env:TEMP 'elara-supabase-2.118.0.js'
node --test tests/company-customer-0055.test.cjs tests/catalog-admin.test.cjs tests/customers-presentation.test.cjs tests/admin-catalog-0048.test.cjs tests/history-0049.test.cjs tests/financial-0050.test.cjs
node --test tests/*.test.cjs
node --check scripts/qa/0055-auth-validation.cjs
git diff --check
```

No instalar dependencias si faltan: registrar el requisito pendiente. El
verificador necesita acceso a Docker; no utiliza la CLI para desplegar.

## Procedimiento propuesto de despliegue — NO ejecutado

Todos los puntos remotos siguientes quedan **pendientes** y requieren una
intervención posterior expresamente autorizada. No ejecutar los SQL de este
apartado durante esta validación.

### Puertas previas

- [ ] Confirmar con el responsable organización, nombre, entorno y project ref.
  `src/js/config.js` y `supabase/.temp/project-ref` coinciden en
  `pfdvehcyauoncxeolcjc`; esto es evidencia local, **no confirmación remota**.
  Comparar con el Dashboard y host de conexión aprobados; no usar solo el
  nombre ELARA-Transport ni asumir que el enlace local sigue siendo correcto.
- [ ] Autorizar primero la inspección remota de solo lectura. Obtener historial
  de `supabase_migrations.schema_migrations`, migraciones pendientes y esquema
  efectivo. Si falta esa tabla, no inventar registros: acordar reconciliación.
  Confirmar 0055 ausente y dependencias presentes. Si la función ya existe,
  detenerse: 0055 usa CREATE FUNCTION, no es reaplicable automáticamente.
- [ ] Comparar definiciones, propietarios y ACL de require_admin_user,
  catalog_request, catalog_person, catalog_audit, inicialización 0053 y
  funciones/triggers de códigos; comparar tablas, defaults, constraints,
  índices y políticas RLS con los contratos locales. No basta que existan
  objetos con el mismo nombre. Incluir 0048 y toda la cadena previa hasta
  0054; no modificar ni volver a aplicar migraciones anteriores.
- [ ] Revisar especialmente companies_tax_id_unique_idx,
  audit_logs_catalog_request_unique,
  company_contacts_one_primary_active_per_company_idx y
  company_contacts_one_active_per_company_person_idx. Validar expresiones,
  unicidad, predicados y validez de cada índice.
- [ ] Verificar API schemas/grants, versiones de PostgreSQL/Auth/PostgREST,
  JWT/JWKS, sesión real y aislamiento READ COMMITTED. Los roles API no deben
  poder crear objetos en public/extensions. Revisar diferencias de extensiones,
  privilegios por defecto y configuración del gateway. No trasladar nuestras
  claves de prueba ni cambiar las claves remotas.
- [ ] Revisar el plan del runner aprobado con la CLI instalada y su ayuda
  actual. Exigir que seleccione **solo 0055**, sin semillas, reparaciones de
  historial, migraciones extra ni cambios de configuración. Atención a los
  ordinales históricos `00031` y `00051`: el orden lógico del harness no
  acredita por sí mismo el orden que proponga el runner. No ejecutar un
  `db push` genérico para resolver divergencias.
- [ ] Fijar y revisar el archivo exacto. SHA-256 de 0055 validada:
  `31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723`.
  Cualquier cambio obliga a repetir revisión y pruebas relevantes.
- [ ] Confirmar backup/restauración disponibles y responsables de ejecución,
  observación y desactivación; revisar sesiones/transacciones largas antes
  de la ventana. Fijar timeouts de bloqueo y sentencia en la conexión del
  runner, sin cambiar configuración global; un timeout debe abortar.

Consultas orientativas para la **futura inspección autorizada**:

```sql
select current_database(), current_user, version();
select version, name from supabase_migrations.schema_migrations order by version;
select pg_get_functiondef('public.require_admin_user()'::regprocedure);
select to_regprocedure('public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)');
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('companies','customers','company_contacts','audit_logs');
```

Estas consultas no confirman por sí solas el project ref: combinar resultados
con la identificación del proyecto y conexión aprobadas.

### Revisión de efectos y aplicación posterior

0055 contiene una transacción con checks de prerrequisitos, CREATE FUNCTION,
REVOKE/GRANT, comentario y checks finales. No hay backfill, DML sobre datos
existentes, nuevas tablas, índices ni políticas. No cambia firmas de 0048,
0049 o 0050. Es una función VOLATILE SECURITY DEFINER con
`search_path=pg_catalog`, referencias cualificadas y autorización administrativa.
EXECUTE se concede solo a authenticated; PUBLIC, anon y service_role quedan
revocados. El propietario debe satisfacer el check de superusuario/bypassrls.

La instalación escribe catálogos PostgreSQL y, mediante el runner, historial
de migraciones; puede esperar por locks de catálogo. No hace reescrituras
masivas de tablas. Eso no implica bloqueo cero: revisar actividad concurrente
y abortar ante esperas fuera de ventana. Al invocar posteriormente la RPC,
sí se escriben empresa/cliente/contactos/auditoría/contador y se toman locks
de recibo, fiscalidad y personas; sus efectos son distintos de la instalación.

- [ ] Presentar destino, diferencias, plan exacto y riesgos para autorización.
- [ ] Solo después, aplicar el archivo íntegro con el runner aprobado y registrar
  el historial mediante su mecanismo normal. No editar historial a mano ni
  mezclar una transacción externa que altere el BEGIN/COMMIT del archivo.
- [ ] Mantener el botón remoto deshabilitado. Desplegar el contrato no autoriza
  habilitar el alta empresarial ni cambiar la política central del frontend.

### Verificación posterior y desactivación

- [ ] Confirmar historial, definición, propietario, ACL, search_path, 3 argumentos
  obligatorios, 8 defaults y 7 columnas TABLE; comprobar los checks de 0055.
- [ ] Verificar descubrimiento/caché PostgREST. Si falta la RPC, revisar caché y
  logs por el mecanismo aprobado; no volver a aplicar CREATE FUNCTION.
- [ ] Comprobar anónimo, no administrador y JWT inválido sin altas válidas.
  Para probar la respuesta exitosa completa sin crear clientes remotos,
  usar staging descartable con esquema/configuración equivalentes y JWT real.
  Una prueba exitosa en producción requeriría autorización adicional para
  sus datos: no tratarla como lectura ni prometer rollback a través de HTTP.
- [ ] Comparar métricas y logs de errores/bloqueos y consultas de Clientes y
  Servicios. Mantener cerrado el opt-in remoto durante toda la revisión.
- [ ] Si falla la instalación antes de COMMIT, comprobar rollback e historial;
  no asumir que un corte de red significa que no se confirmó.
- [ ] Si ya confirmó y es necesario detener usos, revocar EXECUTE de
  authenticated con cambio separado, autorizado y auditado. La revocación
  no cancela invocaciones ya iniciadas ni revierte datos ya confirmados.
  Revisar/drainar llamadas en curso antes de declarar la desactivación completa.

SQL de contención propuesto, **no ejecutado**:

```sql
revoke execute on function public.admin_create_company_customer(
  uuid,text,text,text,text,text,text,text,text,text,jsonb
) from authenticated;
```

Preferir contención a borrar objetos. Una retirada posterior, si se aprueba,
debe usar DROP FUNCTION con firma exacta y RESTRICT, nunca CASCADE, y registrarse
como nueva migración. No borrar empresas, clientes, personas ni recibos para
simular una reversión; los datos confirmados necesitan un procedimiento de
negocio aparte. No borrar el historial 0055. La reactivación exige revisión
del defecto, permisos y pruebas antes de reotorgar EXECUTE.

## Referencias oficiales consultadas

- [Supabase Auth: configuración y funcionamiento](https://github.com/supabase/auth/blob/master/README.md)
- [Supabase JS: login con contraseña](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Supabase JS: invocación RPC](https://supabase.com/docs/reference/javascript/rpc)
- [Changelog de Supabase](https://supabase.com/changelog.md)

No se actualizó software. La revisión del changelog no sustituye la
comprobación de las versiones y condiciones efectivas del destino.
