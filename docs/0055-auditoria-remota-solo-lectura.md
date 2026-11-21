# ELARA Transport — auditoría remota previa a 0055

Fecha: 16 de noviembre de 2026. Dictamen: **APTO CON CONDICIONES** para una
aplicación individual, expresamente autorizada y con verificación posterior.
**No se ha aplicado 0055 ni se ha habilitado el alta empresarial remota.**

## Alcance y garantías

Se usó el conector Supabase para identificar proyecto/organización y tres
consultas de metadatos: inventario/comparación, permisos efectivos y control
final. Cada consulta SQL se ejecutó dentro de `BEGIN READ ONLY` y terminó
con `ROLLBACK`; el servidor confirmó `transaction_read_only=on`.
Solo se consultaron catálogos PostgreSQL e historial de migraciones
(version/name, sin sus statements). No se leyeron ni exportaron registros de
clientes, empresas, personas, contactos, auditoría de negocio o Auth.
No se ejecutaron RPC de negocio, pruebas de escritura, migraciones, reparaciones,
DDL, cambios de permisos/configuración ni comandos de sincronización.

Para comparar definiciones se reconstruyó **en memoria local** la cadena del
repositorio hasta 0054 con PGlite y los harness existentes. No se copiaron datos
remotos a esa base. No se ejecutó la suite global en esta auditoría: sus
497 PASS pertenecen a la validación anterior y no se presentan como nuevos.

Se añaden solo este informe, evidencia JSON saneada y la consulta principal
de metadatos. Rama conservada: `backup/elara-restauracion-2026-11-15`.
El respaldo `1be471170e2c62815f140300d050afc2a85b195f` existe. No se han cambiado
código funcional, migraciones, configuración ni cambios previos; no hay commit,
push, merge o deploy.

## 1. Destino identificado

| Comprobación | Resultado realizado |
|---|---|
| Referencia remota | `pfdvehcyauoncxeolcjc` |
| Nombre obtenido de Supabase | `ELARA Transport` |
| Organización | `xvasmgenedxtyosexfex`; organización de la cuenta ELARA identificada por el conector |
| Región / estado | `eu-west-3` / `ACTIVE_HEALTHY` |
| Base | PostgreSQL 17.6; API de proyecto informa build `17.6.1.166`, major 17 |
| Repositorio | `supabase/.temp/project-ref` coincide con esa referencia |
| Frontend remoto | Host de `src/js/config.js` coincide con esa referencia |
| Configuración local | `project_id=ELARA-Transport`, major 17; no identifica por sí sola al proyecto remoto |
| CLI instalada | Paquete/binario declarado 2.116.0; no se invocó para conectar, sincronizar o modificar nada |
| Overrides de entorno inspeccionados | SUPABASE_PROJECT_ID, SUPABASE_PROJECT_REF, SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN y SUPABASE_CLI_BINARY_OVERRIDE ausentes en el proceso |

Las llamadas del conector especificaron explícitamente el project_id ya
verificado. No se cambió el vínculo ni se inspeccionaron almacenes de secretos.
La versión ejecutable de CLI había sido comprobada en la validación anterior;
esta auditoría confirma su paquete instalado, no repite esa ejecución.

## 2. Historial: 56 registros remotos frente a 57 archivos locales

Las versiones 0001 a 0052, incluidos los ordinales históricos 00031 y 00051,
están registradas. Las últimas dos migraciones tienen esta correspondencia:

| Archivo local | Versión remota | Nombre remoto | Interpretación |
|---|---|---|---|
| 0053_app_session_concurrency.sql | `20261105141040` | `0053_app_session_concurrency` | Aplicada con identificador timestamp |
| 0054_driver_accept_confirms_service.sql | `20261106145018` | `0054_driver_accept_confirms_service` | Última registrada; aplicada con identificador timestamp |
| 0055_admin_create_company_customer.sql | Ausente | Ausente | Único contrato funcional pendiente identificado |

También se confirmó que no hay ninguna sobrecarga pública llamada
`admin_create_company_customer`, ni registro 0055/empresa equivalente en el
historial. La comparación de todas las funciones hasta 0054 coincide con el
esquema remoto, reforzando la correspondencia de 0053 y 0054 por sus efectos.
No se verificaron hashes de los statements históricos ni efectos históricos
sobre datos: no confundir equivalencia actual de esquema con identidad de
bytes de todos los archivos originalmente ejecutados.

**Diferencia que afecta al despliegue:** por comparación literal de versiones,
los identificadores locales 0053 y 0054 no existen en el historial, y los dos
timestamps remotos no tienen archivo con igual prefijo local. No son dos
contratos pendientes. Un push genérico desde este árbol no es un plan
aceptable: puede rechazar la divergencia o proponer actuaciones adicionales.
No usar `--include-all`, renombrar archivos existentes ni reparar historial
para forzar el despliegue. No se detectaron otras migraciones funcionales
anteriores pendientes en el ámbito comparado.

## 3. Compatibilidad comprobada

Comparación contra las migraciones locales hasta 0054:

| Metadato | Resultado |
|---|---|
| Columnas de companies/customers/persons/company_contacts/audit_logs/human_code_counters | 90 iguales: tipo, nulabilidad, default, identity y generated |
| Índices de esas seis tablas | 20 iguales, válidos y listos; mismas expresiones, predicados y unicidad |
| Restricciones remotas de esas tablas | 55 iguales en definición, validación y diferibilidad |
| Triggers de tablas public, excluidos internos | 194 iguales en definición, función y estado enabled |
| Políticas de public | 77 iguales |
| Funciones de aplicación public/elara_private, excluidas las pertenecientes a extensiones | 302 con definición, propietario, SECURITY DEFINER y search_path iguales |

El runtime local es PostgreSQL 18.6/PGlite 0.5.12; representa además 37
restricciones NOT NULL como entradas separadas en pg_constraint, ausentes en
el catálogo PostgreSQL 17 remoto. Las 37 columnas correspondientes conservan
`attnotnull` idéntico. Es una diferencia de representación del catálogo,
no 37 restricciones de negocio ausentes. La validación nativa previa usó
PostgreSQL 17.6; no se la ha repetido en esta auditoría.

Los cinco ID de entidades usan `extensions.gen_random_uuid()` y se verificó
la existencia de esa función. Los estados admitidos incluyen empresa active/
inactive y cliente new/active/blocked/inactive. El cliente empresarial exige
company_id y person_id nulo; las claves foráneas usan las reglas esperadas.

El trigger `assign_customers_human_code` llama a `assign_customer_human_code`
y `next_human_code(text)`: rama empresarial EMP y formato de cuatro cifras.
Los triggers de integridad de customers y company_contacts son DEFERRABLE
INITIALLY DEFERRED y están habilitados. Los demás triggers relevantes de
auditoría y timestamps también coinciden.

Los cuatro índices exigidos expresamente por 0055 están presentes e iguales:

- `companies_tax_id_unique_idx`.
- `audit_logs_catalog_request_unique`.
- `company_contacts_one_primary_active_per_company_idx`.
- `company_contacts_one_active_per_company_person_idx`.

También coinciden las restricciones de unicidad por sujeto de customers.
Se verificaron pgcrypto 1.3 y btree_gist 1.7, UUID y digest requeridos.
No se leyó el contenido de human_code_counters: existencia/actividad/capacidad
restante del prefijo EMP son datos operativos, no metadatos, y quedan fuera
del alcance autorizado. No se garantiza un alta exitosa remota a partir de
una auditoría que deliberadamente no ejecuta esa alta.

## 4. Contratos administrativos y permisos

Firmas verificadas, con definiciones idénticas al repositorio:

```text
public.require_admin_user()
elara_private.catalog_request(text,uuid,jsonb)
elara_private.catalog_person(text,text,text,text,text)
elara_private.catalog_audit(text,text,text,uuid,text,jsonb,jsonb,text,uuid,jsonb,jsonb)
public.admin_create_individual_customer(uuid,text,text,text,text,text,text)
```

Todas pertenecen a postgres y son SECURITY DEFINER. require_admin_user usa
search_path public y delega en require_any_role para superadmin/administrativo;
los helpers y el alta individual usan public,extensions. Sus cuerpos y la
cadena de autorización/sesión coinciden con los locales. Se revisaron las
llamadas de sus cuerpos, no solo pg_depend: PL/pgSQL no registra allí todas
las referencias internas. pg_depend de los helpers muestra sus dependencias
de lenguaje/esquema; no se interpreta como un grafo completo de ejecución.

Permisos efectivos, comprobados sin invocar las funciones:

- authenticated puede ejecutar el alta individual; anon y service_role no.
- Ninguno de esos tres roles puede ejecutar los tres helpers privados.
- anon/authenticated no pueden ejecutar next_human_code ni el trigger de códigos.
- anon/authenticated no tienen INSERT, UPDATE, DELETE o TRUNCATE, ni INSERT/
  UPDATE por columna, en las seis tablas inspeccionadas. authenticated tiene
  SELECT en las cinco tablas de negocio, sujeto a RLS; no en el contador.
- RLS está habilitado; las políticas relevantes son SELECT. force_rls=false,
  compatible con el propietario privilegiado y el diseño SECURITY DEFINER.
- anon/authenticated no tienen CREATE en public ni extensions. El esquema
  elara_private conserva acceso únicamente del propietario en su ACL.
- postgres tiene BYPASSRLS, CREATE en public y USAGE en elara_private; satisface
  los requisitos del propietario esperado para la instalación de 0055.
- Aislamiento por defecto READ COMMITTED. La consulta observó statement_timeout
  2 minutos y lock_timeout 0 en su sesión; no demuestra los valores de cada
  conexión futura de PostgREST ni de la herramienta de despliegue.

**Diferencias de ACL:** 74 funciones tienen una representación de ACL distinta
del runtime local, sin cambios de cuerpo, propietario, definer o search_path.
Entre ellas están grants heredados a service_role en funciones antiguas como
require_admin_user y next_human_code, y ACL explícitas frente a defaults en
otras funciones. Se guardan todas las diferencias en la evidencia, no se
asume igualdad completa de permisos. service_role además tiene DML y BYPASSRLS
en las tablas: privilegio preexistente, no concedido por 0055. No se modifica.

Los default privileges remotos otorgan EXECUTE de nuevas funciones public a
roles API. 0055 lo contempla: CREATE, revocación de PUBLIC/anon/authenticated/
service_role y concesión exclusiva a authenticated en la misma transacción.
El check final comprueba ese resultado. No separar esos pasos ni publicar
la función antes de sus revocaciones. Los permisos de funciones anteriores
no se alteran por esa revocación específica.

## 5. Revisión completa del archivo 0055

SHA-256 validado:
`31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723`.

| Instrucción | Efecto al instalar |
|---|---|
| BEGIN | Abre la transacción del archivo |
| DO prerequisites | Lee privilegios de esquemas, firmas e índices; aborta si falta alguno |
| CREATE FUNCTION | Crea únicamente la RPC empresarial; no reemplaza funciones previas |
| REVOKE ALL | Retira permisos de esa firma a PUBLIC, anon, authenticated y service_role |
| GRANT EXECUTE | Concede ejecución de esa firma solo a authenticated |
| COMMENT ON FUNCTION | Añade comentario de catálogo de esa firma |
| DO security | Comprueba propietario, definer, search_path y permisos; aborta si no cumplen |
| COMMIT | Confirma los cambios de catálogo |

Los DO contienen comprobaciones de metadatos y RAISE, no escrituras de negocio.
El cuerpo de la nueva función contiene INSERT, auditoría, lectura FOR UPDATE
y bloqueos asesores, pero **no se invoca al instalarse**. Posteriormente, una
llamada autorizada crea empresa/cliente, persona/vínculo opcionales, recibo y
auditoría; reutiliza los helpers y el contador transaccional existentes.
No adopta ni actualiza empresas/personas existentes automáticamente.

No hay UPDATE/DELETE/TRUNCATE de datos existentes al instalar, backfill,
ALTER TABLE, índices nuevos, políticas nuevas ni cambios a 0048/0049/0050.
No se ha encontrado conflicto de nombre ni de firma. Las definiciones
existentes de esos contratos permanecen iguales a la cadena local.

CREATE/GRANT/REVOKE/COMMENT y los DO implican acceso a catálogos y locks DDL;
no constituyen una operación sin bloqueos, aunque no hay reescritura masiva
de tablas. Las consultas de comprobación también toman locks de lectura
compatibles con DML normal, pero pueden esperar frente a DDL concurrente.
La invocación posterior introduce sus propios locks de recibo/fiscalidad/
persona/contador, distintos de los de instalación. No se midieron esperas
del futuro despliegue ni se garantiza ausencia de deadlocks bajo toda carga.

## 6. Procedimiento específico propuesto — NO ejecutado

### Antes de pedir autorización de aplicación

1. Reconfirmar por el conector nombre, organización y ref
   `pfdvehcyauoncxeolcjc`. Repetir en READ ONLY la ausencia de la función, el
   historial y los checks de prerrequisitos. Si cambia cualquier resultado,
   detenerse. Registrar que se espera la última versión `20261106145018` y
   56 registros; cualquier registro posterior requiere nueva revisión.
2. Volver a calcular el SHA del archivo original. Mantenerlo íntegro, incluidos
   ambos DO, permisos y BEGIN/COMMIT. No modificar archivos previos ni reparar
   versiones 0053/0054. Revisar ventana, backup disponible y responsable.
3. Preparar y presentar esta **única operación** de herramienta Supabase:

   ```text
   apply_migration(
     project_id = "pfdvehcyauoncxeolcjc",
     name = "0055_admin_create_company_customer",
     query = contenido íntegro de supabase/migrations/0055_admin_create_company_customer.sql
   )
   ```

   `query` debe ser el archivo leído y validado por SHA, no el texto literal
   de la descripción ni SQL regenerado. La herramienta aplica una migración
   explícita y registra una versión generada; no recorre pendientes del árbol
   como db push. Es compatible con la convención timestamp ya observada para
   0053/0054. Guardar la correspondencia nueva versión↔0055↔SHA en la evidencia
   de despliegue, sin renombrar las migraciones originales.
4. Aprobar humanamente ese destino, payload, mecanismo, ventana y tratamiento
   de fallos. Esta auditoría **no** concede esa aprobación. No se ha ensayado
   apply_migration con este archivo en el remoto ni verificado su tratamiento
   exacto del BEGIN/COMMIT interno y el registro de historial ante fallos.
   Antes de ejecutar, comprobar esa compatibilidad en un entorno descartable
   autorizado. Si el mecanismo exige reescribir la transacción del contrato,
   detenerse y presentar la incompatibilidad; no cambiar el archivo aquí.

### Después de la autorización posterior

5. Ejecutar una sola vez la llamada aprobada. No ejecutar db push, --include-all,
   seeds, SQL suelto más reparación de historial ni comandos de sincronización.
   La herramienta no ofrece aquí parámetros de timeout: confirmar su límite
   efectivo para esta operación y que es aceptable en la ventana; no inventar
   flags ni añadir cambios globales a 0055. No lanzar despliegues concurrentes.
6. Confirmar por metadatos que solo apareció un registro de migración y una
   nueva RPC con firma exacta; guardar el identificador generado. Comparar
   todas las funciones previas/ACL/RLS para asegurar que no cambiaron.
7. Verificar propietario postgres/BYPASSRLS, SECURITY DEFINER,
   `search_path=pg_catalog`, 3 argumentos obligatorios, 8 defaults y respuesta
   TABLE de siete campos. Verificar con has_function_privilege/aclexplode:
   authenticated EXECUTE=true, anon/service_role=false y PUBLIC sin EXECUTE.
   Repetir permisos de tablas y esquemas sin realizar INSERT de prueba.
8. La inspección de firma, defaults, resultado y ACL no crea datos reales.
   La comprobación de ejecución exitosa por HTTP pertenece al staging
   descartable; no invocar la RPC con datos válidos en producción. La caché
   de PostgREST/gateway se comprobará en la intervención aprobada sin crear
   clientes; no se ha inspeccionado ahora ni se ha solicitado recarga.
9. Si hay timeout/respuesta incierta, **no repetir automáticamente**:
   comprobar historial y función primero. Si ambos existen y coinciden,
   registrar el resultado confirmado; si solo existe uno, detenerse y revisar
   la atomicidad del mecanismo. No reparar ni borrar historial para ocultarlo.

### Contención posterior, solo si se autoriza

10. Mantener el alta empresarial remota deshabilitada en el frontend. Ante un
    defecto, proponer un cambio auditado separado que revoque EXECUTE de
    authenticated en la firma exacta. La revocación no cancela llamadas ya
    iniciadas ni elimina datos previamente confirmados; revisar llamadas en
    curso antes de declarar la operación detenida.

    ```sql
    revoke execute on function public.admin_create_company_customer(
      uuid,text,text,text,text,text,text,text,text,text,jsonb
    ) from authenticated;
    ```

    No se ha ejecutado. Si se requiere retirar la función, usar una migración
    posterior aprobada con DROP FUNCTION de firma exacta y RESTRICT, nunca
    CASCADE. No eliminar empresas, clientes, contactos, recibos ni el historial
    0055 para simular rollback. Su reactivación requiere otra revisión.

## 7. Condiciones y límites del dictamen

**APTO CON CONDICIONES:** el destino está identificado; los prerrequisitos,
esquema relevante y contratos son compatibles; no hay conflicto de firma ni
operación destructiva inesperada en el archivo. El historial está comprendido.
El despliegue individual propuesto evita el problema de versiones ordinales.

Condiciones antes de ejecutar: aprobación humana específica, comprobación
inmediata de que la instantánea no cambió y validación del runner con el
BEGIN/COMMIT del archivo y su registro de historial. **No apto para un db push
genérico desde la carpeta actual.** Ninguna de estas condiciones se resuelve
automáticamente por los PASS locales.

No comprobado: filas/capacidad EMP, calidad o duplicidad de datos existentes,
backup/restauración, carga y bloqueos en la ventana futura, configuración
completa Auth/JWKS/PostgREST/gateway ni una invocación exitosa empresarial
remota. No se habilita el alta empresarial ni se cambia configuración.
Son límites explícitos, no resultados positivos implícitos.

## Evidencias y referencias

- `0055-remote-audit-evidence.json`: inventario, historial completo, ACL,
  permisos efectivos y fingerprints de las 302 definiciones comparadas.
- `0055-remote-readonly-audit.sql`: consulta principal realmente utilizada.
- En TEMP: snapshots de metadatos local/remoto y diferencias, sin registros
  de negocio ni credenciales. Las consultas adicionales verificaron permisos
  y ausencia de conflicto; sus resultados están resumidos en este informe/JSON.
- [Supabase CLI: migration list compara versiones](https://supabase.com/docs/reference/cli/supabase-migration-list).
- [Supabase CLI: db push y registro de pendientes](https://supabase.com/docs/reference/cli/supabase-db-push).

Se aplicó la skill Supabase. Se usaron sus herramientas de lectura y búsqueda
documental; ninguna herramienta de mutación fue invocada. Se detiene el trabajo
tras este informe para revisión del equipo.
