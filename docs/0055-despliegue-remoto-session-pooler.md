# ELARA Transport — despliegue remoto de 0055 mediante Session pooler

Fecha: **17 de noviembre de 2026**. Resultado: **DESPLIEGUE CORRECTO**.

## Destino y autorización

Proyecto ELARA Transport, ref `pfdvehcyauoncxeolcjc`, organización
`xvasmgenedxtyosexfex`, región `eu-west-3`, confirmado de nuevo por el conector.
Se aplicó exclusivamente el artefacto 0055 autorizado mediante Session pooler
5432. No se utilizó el puerto 6543 ni una herramienta que recorra pendientes.

La conexión usó el usuario de pooler específico del proyecto y la credencial
local existente, leída en memoria y suministrada al proceso psql por entorno.
No se escribieron ni mostraron contraseñas, tokens o URI de conexión. El
certificado `prod-ca-2021.crt` de Descargas se montó en modo lectura.
libpq/psql conectó con `sslmode=verify-full`, validando cadena y nombre del
servidor; autenticación y TLS satisfactorios.

## Preflight

Todas las comprobaciones pasaron antes del envío del artefacto:

- Historial exactamente igual al baseline: 56 registros; última versión
  `20261106145018`, correspondiente a 0054.
- Versión `20261116005500` y toda sobrecarga empresarial ausentes.
- 0053 (`20261105141040`) y 0054 registradas; ninguna necesitaba ejecutarse.
- Coincidencia de columnas, constraints, índices, triggers, RLS, esquemas,
  roles y las 302 funciones previas con sus ACL/propietarios/search_path.
- Permisos necesarios de esquema privado/público y de historial disponibles;
  tabla de historial con estructura esperada y sin triggers de usuario.
- Sin escritura directa de anon/authenticated en las tablas inspeccionadas.
- Ningún lock incompatible ni actividad de migración detectados por las
  consultas de catálogos. Es una instantánea, no una garantía contra acciones
  administrativas posteriores; los locks/timeouts del artefacto siguen activos.
- Backend PID constante antes, durante y después de la transacción de lectura
  en la misma conexión. Puerto 5432 y modo Session compatibles con las
  transacciones, locks y estado de sesión requeridos por el método.
- Lecturas ejecutadas en READ ONLY. Fuente, artefacto y verificador posterior
  coincidieron con los hashes aprobados y las pruebas locales guardadas.

El lector local del preflight inicialmente esperaba un envoltorio JSON que
psql no devuelve. Se corrigió únicamente ese lector temporal y se completó
de nuevo la comparación de solo lectura. No fue un error SQL remoto ni una
divergencia del esquema; no se escribió nada antes del preflight satisfactorio.
No se modificó ni regeneró el SQL aprobado para evitar controles.

## Artefacto aplicado y COMMIT

Archivo: `docs/0055-atomic-deployment.sql`.

SHA-256 aplicado:
`eb18779bbfbdc36bab3edadb437edc2af306402fb0e2ef2e504af779fb854da6`.

SHA-256 del fuente 0055 conservado:
`31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723`.

Se envió exactamente una vez mediante psql 17 con `ON_ERROR_STOP=1`, una
conexión Session pooler y una transacción del artefacto. Se mantuvieron el
BEGIN/COMMIT único, los checks y límites de espera originales del runner.
La creación de función y el INSERT de historial se confirmaron juntos.

psql terminó con código **0** y devolvió **COMMIT** confirmado. No hubo error,
timeout ni resultado incierto del despliegue. No se realizó una segunda
instalación ni reparación automática. Las consultas posteriores se hicieron
en conexiones de lectura independientes.

## Resultado de la RPC y del historial

Función instalada:

```text
public.admin_create_company_customer(
  p_request_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_trade_name text DEFAULT NULL,
  p_billing_phone text DEFAULT NULL,
  p_billing_email text DEFAULT NULL,
  p_billing_address text DEFAULT NULL,
  p_company_notes text DEFAULT NULL,
  p_customer_internal_notes text DEFAULT NULL,
  p_customer_billing_notes text DEFAULT NULL,
  p_contact jsonb DEFAULT NULL
)
RETURNS TABLE (
  company_id uuid, customer_id uuid, customer_human_code text,
  company_status text, customer_status text,
  contact_person_id uuid, company_contact_id uuid
)
```

Verificado por metadatos: 11 entradas, 3 obligatorias, 8 defaults, función
set-returning y siete salidas TABLE con nombres/tipos correctos; cuerpo
coincidente con el aprobado; propietario postgres, SECURITY DEFINER,
`search_path=pg_catalog`. ACL efectiva:

- authenticated: EXECUTE concedido.
- anon, service_role y PUBLIC: sin EXECUTE.

El historial contiene exactamente **57 registros**. Existe una sola fila
`20261116005500` / `0055_admin_create_company_customer`, y el SHA del SQL
registrado coincide con el fuente original. Todas las parejas version/name
anteriores permanecen iguales, incluidas 0053 y 0054. No apareció ninguna
otra migración nueva ni se ejecutó ninguna migración anterior.

## Verificación posterior y conservación

El SQL de verificación aprobado se ejecutó en READ ONLY y confirmó:
history_exact, recorded_source_matches, old_functions_intact y body_matches.
Se repitió además el inventario de catálogos y la comprobación de parámetros.

Permanecen iguales al baseline las 302 funciones previas, sus definiciones y
ACL (incluidos los contratos 0048/0049/0050 y sus helpers), columnas,
constraints, índices, triggers, políticas RLS, roles, privilegios de esquema
y ACL de las seis tablas inspeccionadas. La única nueva función de aplicación
es la empresarial aprobada. No se hicieron cambios a Auth o su configuración.

No se invocó la RPC empresarial ni ninguna prueba de escritura de negocio.
No se crearon ni modificaron empresas, clientes, personas o servicios por
este procedimiento: el SQL ejecutado instala el contrato y añade su registro
de historial; no llama al cuerpo de la RPC. No se leyeron ni compararon filas
empresariales para afirmar un checksum de sus datos.

La comparación de historial remoto verifica version/name de las entradas
anteriores y el SQL de la nueva fila. No exporta statements históricos.
El artefacto no contiene UPDATE/DELETE de historial anterior.

## Frontend y repositorio

No se modificó ni publicó frontend. companyEnabled sigue exigiendo entorno
local, opt-in explícito y URLs loopback coincidentes. El alta empresarial
conectada a producción continúa bloqueada y el botón Guardar cliente para
empresas permanece sin habilitar. La instalación del contrato no activa el
formulario. No se modificaron Clientes, Dashboard ni Servicios.

Se conservan la rama `backup/elara-restauracion-2026-11-15`, el respaldo
`1be471170e2c62815f140300d050afc2a85b195f` y los cambios locales previos.
Sin commit, push, merge, publicación de GitHub Pages, cambios de configuración
o instalación de software. `git diff --check` correcto (solo avisos LF/CRLF
ya existentes). Únicos archivos de proyecto añadidos por esta intervención:
este informe y `0055-session-deployment-results.json`.

## Incidencias y límites pendientes

No hay incidencia de ejecución ni COMMIT pendiente de resolver. El ajuste del
lector local de preflight está descrito arriba. No se repitieron las suites
locales: se usó el artefacto con el mismo hash que pasó las 14 pruebas nativas.

No se ha probado un alta real en producción ni la invocación HTTP posterior
de la nueva RPC; no forman parte de esta autorización. La activación del
formulario y cualquier otra fase requieren autorización separada.

La compatibilidad de Session pooling se contrastó con la
[documentación oficial de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
y con la prueba de sesión. La evidencia saneada de preflight, ejecución y
postverificación se conserva en `0055-session-deployment-results.json`.

**Trabajo detenido tras confirmar instalación e historial.**
