# ELARA Transport — preparación final del despliegue individual de 0055

16 de noviembre de 2026. **Solo preparación. No hay despliegue remoto.**

## Método recomendado

Ejecutar con psql, tras una autorización posterior, el artefacto revisado
`docs/0055-atomic-deployment.sql`. Es un runner individual explícito: no usa
db push, migration repair, apply_migration ni recorre directorios de pendientes.
La propuesta anterior de usar apply_migration queda sustituida por este método,
cuyo control transaccional se ha probado directamente en PostgreSQL 17.6.

El generador `scripts/qa/0055-prepare-atomic.cjs`:

1. Exige el SHA aprobado de 0055 y el baseline de funciones auditadas.
2. Conserva íntegramente todas las instrucciones originales de 0055 y su único
   BEGIN/COMMIT. No modifica el archivo original ni elimina sus DO/ACL/comment.
3. Inserta guardas después del BEGIN original y un INSERT de historial más
   comprobación final **antes del COMMIT original**, en el artefacto derivado.
4. Demuestra que, retirando únicamente esas adiciones, reconstruye el archivo
   fuente exacto. El generador no abre conexiones a bases de datos.

La fila nueva usa el esquema de historial Supabase realmente inspeccionado,
no una tabla de control alternativa:

```sql
insert into supabase_migrations.schema_migrations
  (version,name,statements,created_by,idempotency_key)
values
  ('20261116005500','0055_admin_create_company_customer',
   array[/* literal completo del archivo fuente aprobado */]::text[],
   'elara_0055_atomic_psql_v1',
   'elara/0055_admin_create_company_customer/31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723');
-- A continuación, postcheck y el COMMIT original de 0055.
```

El literal completo, no este resumen, está materializado en el artefacto.
created_by identifica el runner; el responsable humano se registra en la
evidencia de ejecución. Las columnas opcionales restantes quedan NULL.
statements conserva el SQL original, incluidos sus límites transaccionales.
No debe reutilizarse ese array como un runner de múltiples migraciones:
su finalidad aquí es trazabilidad; el artefacto es la unidad de ejecución.

## Historial y destino reconfirmados mediante lectura

El conector volvió a confirmar `ELARA Transport`, ref `pfdvehcyauoncxeolcjc`,
organización `xvasmgenedxtyosexfex`, región eu-west-3 y build PostgreSQL
17.6.1.166 (servidor major 17). La consulta usó BEGIN READ ONLY/ROLLBACK y
confirmó transaction_read_only=on, 56 registros y ausencia de la RPC.

| Contrato | Versión registrada | Tratamiento |
|---|---|---|
| 0053 | 20261105141040 | Conservar; no ejecutar ni renombrar |
| 0054 | 20261106145018 | Conservar; última aplicada |
| 0055 | No existe | Propuesta: 20261116005500, solo tras aprobación |

La versión propuesta es un identificador timestamp estable, posterior a la
última versión; no pretende representar la hora real de una ejecución futura.
Se comprueba su ausencia y la de su nombre/idempotency_key. Se espera pasar
de 56 a 57 filas, preservando las 56 anteriores. No se corrige la divergencia
de nombres ordinales del repositorio. Un futuro uso de herramientas generales
de migración deberá respetar esta correspondencia; este plan no habilita db push.

La tabla remota de historial tiene version text NOT NULL/PK, statements text[],
name text, created_by text, idempotency_key text UNIQUE y rollback text[].
No tiene triggers de usuario. postgres tiene INSERT y privilegio suficiente
para el lock previsto. No se han leído sus statements ni datos de negocio.

## Seguridad transaccional y guardas

El orden efectivo es:

```text
BEGIN original
  timeouts locales + synchronous_commit=on
  locks + guardas de estado auditado
  DO prerequisites original
  CREATE FUNCTION original
  REVOKE / GRANT / COMMENT originales
  DO security original
  INSERT historial
  postcheck conjunto función/historial
COMMIT original
```

La instalación y el registro son operaciones dentro de **la misma transacción**,
no dos llamadas independientes ni una escritura posterior al COMMIT. Un error
de DDL, ACL, INSERT, postcheck o constraint diferible aborta toda la transacción.
psql usa `-X`, `ON_ERROR_STOP=1` y un solo archivo; ante error termina la sesión
y PostgreSQL revierte la transacción abierta. No usar --single-transaction ni
añadir un BEGIN externo: el artefacto ya conserva el límite original.

Las guardas exigen:

- Base postgres, rol postgres y servidor major 17. La identidad del proyecto
  se garantiza además mediante la comprobación del conector y el host TLS
  explícito; el nombre de la base por sí solo no identifica un proyecto.
- Historial version/name exactamente igual a las 56 entradas auditadas;
  ausencia de cualquier sobrecarga empresarial y de identidad de migración.
- Ningún trigger de usuario inesperado en el historial.
- Las 302 funciones previas con los cuerpos/propietarios/definer/search_path
  y ACL auditados. Se normalizan solo CR y orden de ACL, no sus privilegios.
- Columnas, constraints, índices, triggers y políticas del ámbito auditado
  iguales al baseline; sin DML directo para anon/authenticated en las seis tablas.
- Los prerrequisitos y checks de seguridad propios de 0055, sin modificarlos.

El lock SHARE ROW EXCLUSIVE en schema_migrations serializa escrituras de
historial durante la instalación; no bloquea sus SELECT normales. ACCESS SHARE
en las seis tablas de negocio evita DDL incompatible mientras se comprueban;
no bloquea su DML normal. Se fijan **solo en la transacción** lock_timeout=5s,
statement_timeout=60s e idle_in_transaction_session_timeout=60s.
La creación/ACL/comentario también toman locks de catálogo. No se promete
impacto cero: se requiere una ventana sin otros despliegues administrativos.

No hay backfill ni modificación de registros empresariales; la única fila
persistente añadida por el runner es su registro de migración. Los privilegios
de la nueva firma quedan authenticated EXECUTE y sin EXECUTE para anon,
service_role o PUBLIC; SECURITY DEFINER/search_path=pg_catalog y propietario
postgres. Se reutilizan los helpers privados auditados de 0048.

## Pruebas nativas locales

Verificador: `scripts/qa/0055-atomic-deployment.local.cjs`. Usa exclusivamente
una imagen PostgreSQL 17.6 ya existente, `--pull=never`, `--network none`,
sin puertos, volúmenes ni datos reales; contraseña aleatoria. Carga las
migraciones locales hasta 0054, reproduce los grants auditados y un historial
sintético equivalente en version/name y estructura, sin copiar statements reales.

Se prueban y registran en `0055-atomic-local-results.json`:

1. Solo 0055 instalada, una fila añadida y COMMIT conjunto; las 56 filas previas,
   funciones/ACL anteriores y filas sintéticas de negocio permanecen iguales.
2. Verificador posterior READ ONLY: historial, SHA del SQL registrado, cuerpo
   de RPC, firma, definer, search_path, defaults y permisos esperados.
3. Reintento tras instalación completa: rechazo sin cambios ni duplicados.
4. Error real en CREATE por lenguaje inexistente (42704): ni función ni fila.
5. Error real en INSERT de historial (23514): revierte la función ya creada.
6. Reintento tras fallo: instalación completa y una sola fila.
7. Error diferido en COMMIT (23514): revierte DDL e historial.
8. Cierre de conexión antes de COMMIT: ni función ni fila quedan confirmadas.
9. Acuse de éxito descartado deliberadamente: resolución por metadatos y
   rechazo del replay. No se presenta como un corte físico de red durante WAL.
10. Función preexistente sin historial: detectar y conservar, sin reparar.
11. Historial preexistente sin función: detectar y conservar, sin reparar.
12. Columna de esquema inesperada: rechazo previo a instalar.
13. Nombre previo del historial distinto: rechazo sin repair.
14. Grant INSERT inesperado a authenticated: rechazo previo a instalar.

Las inyecciones de lenguaje/constraint/trigger se realizan únicamente en la
base o en variantes en memoria del SQL local de prueba, nunca en 0055 ni en
el artefacto aprobado. Durante el ajuste del verificador se corrigió el uso
de reemplazo JavaScript al insertar el fallo de COMMIT: los signos dólar del
SQL debían conservarse literalmente. No fue un defecto del artefacto final.

El JSON final debe mostrar **14 PASS / 0 FAIL**, limpieza del contenedor y
hash del artefacto igual al manifiesto. No se repite la suite funcional de
497 pruebas: no cambió código funcional ni contratos; ese resultado sigue
siendo evidencia anterior, no una ejecución nueva de esta preparación.

## Archivos y reproducción local

- Fuente original SHA-256:
  `31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723`.
- Artefacto ejecutable SHA-256:
  `eb18779bbfbdc36bab3edadb437edc2af306402fb0e2ef2e504af779fb854da6`.
- `0055-atomic-deployment.sql.manifest.json` fija versión, proyecto y hashes
  del fuente, artefacto, verificador posterior y baseline de funciones.
- `0055-atomic-functions.json` contiene fingerprints auditados derivados,
  sin cuerpos completos ni registros personales. El generador verifica su SHA.
- `0055-atomic-deployment.sql.verify.sql` es únicamente lectura.

Comandos locales de preparación/prueba, sin secretos ni acceso remoto:

```powershell
node scripts/qa/0055-prepare-atomic.cjs
node scripts/qa/0055-atomic-deployment.local.cjs
node --check scripts/qa/0055-prepare-atomic.cjs
node --check scripts/qa/0055-atomic-deployment.local.cjs
git diff --check
```

El generador no instala dependencias ni necesita TEMP. La prueba necesita
Docker accesible y la imagen ya existente. Comparar el SHA generado con el
aprobado; no regenerar y aceptar silenciosamente otro hash.

## Checklist inmediatamente anterior a una futura ejecución

1. Autorización humana escrita para este método, proyecto, versión y hash.
2. Reconfirmar con el conector nombre/ref/organización y última versión;
   repetir ausencia de 0055 y de toda sobrecarga empresarial.
3. Verificar configuración TLS y host explícito del proyecto; mediante esa
   misma conexión realizar primero consultas READ ONLY de identidad/metadatos.
   Ante cualquier duda o fallo de certificado, detenerse; no relajar TLS.
4. Recalcular los hashes de fuente/artefacto/verificador y comprobar el manifiesto.
5. Historial y dependencias intactos; permisos suficientes, sin conflictos.
   Las guardas repetirán los checks dentro de la transacción antes del CREATE.
6. Confirmar ventana sin despliegues concurrentes, backup disponible,
   observador y plan de contingencia. No crear ni configurar recursos remotos
   automáticamente para satisfacer esta lista.
7. Confirmar frontend sin cambios y alta empresarial remota deshabilitada.

## Comando previsto — NO ejecutado remotamente

Plantilla de ejecución futura mediante el psql de la imagen existente.
Se deberá proporcionar una credencial autorizada de forma segura en el
entorno del proceso y la CA aprobada del proyecto; no hay credenciales reales
en esta plantilla. No usar la contraseña de ninguna prueba local.

```powershell
# Solo después de autorización explícita. PGPASSWORD se suministra de forma segura.
$approvedArtifact = (Resolve-Path 'docs/0055-atomic-deployment.sql').Path
$approvedCa = (Resolve-Path '<ARCHIVO_CA_APROBADO_DEL_PROYECTO>').Path
docker run --rm --pull=never `
  --mount "type=bind,source=$approvedArtifact,target=/tmp/0055.sql,readonly" `
  --mount "type=bind,source=$approvedCa,target=/tmp/project-ca.crt,readonly" `
  --env PGPASSWORD --env PGSSLMODE=verify-full `
  --env PGSSLROOTCERT=/tmp/project-ca.crt `
  --entrypoint psql public.ecr.aws/supabase/postgres:17.6.1.165 `
  -X -h db.pfdvehcyauoncxeolcjc.supabase.co -p 5432 -U postgres -d postgres `
  -v ON_ERROR_STOP=1 -f /tmp/0055.sql
$deploymentExit = $LASTEXITCODE
# No reintentar automáticamente, incluso si deploymentExit no es cero.
```

El ejemplo es una plantilla con marcador de CA, no un comando listo para
copiar sin revisión. Conectividad directa/IPv6, CA y credencial remota no se
han probado ni provisionado en esta preparación. Si la conexión directa no
está disponible, detenerse y revisar una alternativa de sesión autorizada;
no sustituir por un pooler transaccional o por apply_migration sin verificar
de nuevo sus garantías. No pasar URI/contraseña por argumentos ni imprimirlas.

## Comprobación posterior sin crear empresas

Ejecutar `0055-atomic-deployment.sql.verify.sql` por la conexión aprobada,
con los mismos parámetros de host/TLS y psql -X/ON_ERROR_STOP. Es BEGIN READ
ONLY, SELECT de metadatos y ROLLBACK; no llama a la nueva RPC.

Exigir read_only=on, history_exact=true, recorded_source_matches=true y
old_functions_intact=true. La RPC debe informar owner postgres, definer=true,
search_path=pg_catalog, defaults=8, cuerpo coincidente y siete campos TABLE;
authenticated_execute=true, anon/service_role/public_execute=false.
Guardar la versión 20261116005500 y la relación fuente↔artefacto↔historial.
Comparar también índices, triggers, políticas y permisos directos con el
baseline si se observan cambios concurrentes o cualquier anomalía.

La prueba local verifica preservación completa de las filas previas de
historial, incluidos todos sus campos. El SQL posterior remoto compara sus
version/name sin extraer statements históricos; verifica el SHA únicamente
del nuevo registro. Una modificación concurrente de statements antiguos no
queda certificada por ese SELECT, y este runner no actualiza esas filas.

Revisar git diff/status del frontend y la política companyEnabled: este
procedimiento no compila, publica ni despliega frontend, ni cambia el opt-in.
Una instalación de contrato no constituye autorización para habilitarlo.

## Contingencia

| Situación | Acción prevista |
|---|---|
| Error antes de COMMIT | psql detiene y desconecta; comprobar por lectura que función y fila están ausentes |
| Constraint/error durante COMMIT | PostgreSQL revierte ambas; confirmar estado, registrar error y corregir solo tras revisión |
| Pérdida de conexión/acuse incierto | No repetir: consultar función e historial desde otra conexión; pueden estar ambos o ninguno |
| Ambos presentes y correctos | Instalación confirmada; no ejecutar otra vez |
| Ambos ausentes | Instalación no confirmada; revisar causa y decidir un nuevo intento autorizado del mismo artefacto |
| Función sin historial | Inconsistencia; detenerse y auditar; no insertar fila suelta para aparentar éxito |
| Historial sin función | Inconsistencia; detenerse y auditar; no borrar historial ni recrear automáticamente |
| Objeto/versión ya existentes | Guardas rechazan; inspección y clasificación, sin CREATE OR REPLACE ni repair |

El método impide crear una inconsistencia nueva dentro de su transacción;
no puede impedir que otro administrador altere o elimine objetos después del
COMMIT. Los estados parciales preexistentes se detectan y quedan intactos.
No se garantiza un resultado conocido por el cliente durante un corte de red;
se garantiza la unidad transaccional del estado confirmado en PostgreSQL.

Si, tras una instalación confirmada, se necesita contener un defecto, priorizar
una **revocación autorizada y auditada** de EXECUTE a authenticated sobre la
firma exacta. No cancela llamadas ya iniciadas ni revierte datos ya creados.
No borrar filas de negocio, recibos o migraciones históricas; no DROP CASCADE.
Una retirada de objeto o reactivación exige otra intervención aprobada.

## Dictamen

**LISTO PARA AUTORIZACIÓN**, sujeto a que la ejecución final cumpla el checklist
y conserve exactamente el artefacto validado. El método individual y su
consistencia transaccional están comprobados en PostgreSQL 17.6; quedan
como riesgos operativos normales la disponibilidad de conexión TLS/credencial,
el cambio de estado entre preparación y ejecución y la carga concurrente.
No se autoriza ni ejecuta ahora ninguna escritura remota.

Se conserva la rama, el respaldo 1be4711 y todos los avances previos. No se
modifican 0048/0049/0050/0055, configuración ni frontend. Sin commit/push/merge.

Referencias oficiales: [transacciones PostgreSQL 17](https://www.postgresql.org/docs/17/tutorial-transactions.html)
y [psql: ejecución de archivos y ON_ERROR_STOP](https://www.postgresql.org/docs/17/app-psql.html).
Se usa la skill Supabase; ninguna herramienta remota de mutación se ha invocado.
