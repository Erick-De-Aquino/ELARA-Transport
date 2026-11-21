# 0057: lista para autorización de instalación individual inerte

Validación específica: 20/11/2026. Proyecto `pfdvehcyauoncxeolcjc`, ELARA Transport, ACTIVE_HEALTHY. **No se ha instalado 0057 ni realizado escrituras remotas.**

| Comprobación | Resultado |
| --- | --- |
| Integridad de las seis fuentes | CORRECTA; manifiesto original sin regenerar ni modificar |
| Instalación inerte y persistencia tras COMMIT | CONFIRMADA |
| Compatibilidad remota | CONFIRMADA en la lectura actual: 58 migraciones, 0056 presente, 0057 y sus objetos ausentes |
| Procedimiento individual | PREPARADO y probado en PostgreSQL nativo aislado |

Fuente SQL SHA-256: `d3246ed536478b8a204d01fd63e3aaddc03ddb8aee4fe2909927dd080aa656f7`.

Artefacto para autorizar: `0057-atomic-deployment.sql`.
SHA-256: `298c4ac07dd473d13a2992364c9706ae36f05413c5652c84b6875e841d2aba34`.
Historial propuesto: versión **`20261120005700`**, nombre `0057_admin_users`, un único registro dentro de la misma transacción.

## Evidencia

- 109 pruebas relevantes PASS / 0 FAIL, ejecutadas sobre las fuentes actuales. No se repitió la suite global; su último resultado se mantiene en 810 PASS.
- 21 comprobaciones PostgreSQL nativas PASS: siete del artefacto, nueve de compatibilidad/instalación inerte y cinco de Usuarios. Contenedores eliminados; sin red ni acceso a producción.
- La prueba del artefacto parte de cuentas, roles, sesiones y vínculo de conductor preexistentes en el fixture. Compara fingerprints internos de Auth, personas, usuarios, roles, sesiones, conductores, vínculos y auditoría antes/después. Se excluye únicamente la columna técnica nueva `admin_version` de la comparación de registros. Los datos de negocio permanecen idénticos.
- Un fallo inyectado después del DDL revierte esquema e historial. Una instalación correcta conserva las 58 versiones anteriores, añade solo 0057 y mantiene vacías las cuatro tablas privadas nuevas, incluida la de activación.
- Dos backends autenticados nuevos verifican después del COMMIT: `authorized=true`, `manage=false` y las cinco operaciones false. Intentos directos de mutación reciben `55000` sin generar recibos ni modificar usuarios. Un segundo intento del artefacto falla sin afectar la instalación confirmada.
- El verificador revisa cuerpos, propietarios, search_path y ACL de las 17 funciones incluidas, preservación de las otras dependencias, RLS y permisos privados, historial y estado inicial. No invoca RPC de negocio.
- Lecturas remotas de catálogos: tablas/columnas requeridas disponibles, diez funciones de dependencia presentes, sin conflictos de tablas/índice/triggers/nombres nuevos ni permisos CREATE inseguros para clientes. Las seis fuentes coinciden con el manifiesto antes y después de las pruebas.

## Ejecución futura, solo después de autorización

1. Confirmar los seis hashes de `0057-local-manifest.json` y los hashes de artefacto, verificador y baseline en `0057-atomic-deployment.sql.manifest.json`. Cualquier discrepancia obliga a detenerse; no regenerar manifiestos para aceptarla.
2. Repetir el preflight de lectura inmediatamente antes: proyecto, 0056 presente, 0057 ausente, historial/funciones sin deriva y objetos nuevos ausentes. La instantánea local de esta validación no sustituye ese control de actualidad.
3. Establecer exclusivamente la conexión Session pooler **5432**, usuario ligado al proyecto, base `postgres`, `sslmode=verify-full`, certificado aprobado `prod-ca-2021.crt` y nombre de servidor verificado. Obtener la credencial por el mecanismo seguro existente, sin DSN completo, logs ni secretos en archivos. Esta conexión de ejecución no se ha abierto en esta intervención. Exigir `standard_conforming_strings=on`.
4. Ejecutar **solo** el artefacto individual, con el cliente configurado para detenerse ante el primer error:

   ```text
   psql -X -v ON_ERROR_STOP=1 -f docs/0057-atomic-deployment.sql
   ```

   Usar las variables de conexión seguras verificadas del paso anterior; el comando no contiene credenciales. No añadir otra transacción ni recorrer la carpeta de migraciones. No usar db push, seed o QA en producción.
5. El archivo contiene un único BEGIN/COMMIT, límites de bloqueo de 5 s y sentencia de 30 s, guardas del destino/historial/dependencias/conflictos, la fuente validada sin alterarla, registro de historial, postcheck interno y recarga de caché. No crea cuentas Auth, no ejecuta asignaciones de roles ni invoca las funciones que define. Solo añade la columna técnica de versión a usuarios; no actualiza sus datos de negocio.
6. Exigir COMMIT confirmado. Si la respuesta es incierta, **no reenviar**: consultar primero historial/objetos y el verificador de solo lectura:

   ```text
   psql -X -v ON_ERROR_STOP=1 -f docs/0057-atomic-deployment.sql.verify.sql
   ```

   Debe informar `verification=true`, `read_only=on` y la versión propuesta. Un conflicto o resultado distinto exige detenerse y revisar, sin reparaciones ni reintentos automáticos.
7. Mantener todas las activaciones cerradas. No desplegar Edge, callback, Pages, SMTP ni cambios Auth. La activación gradual requiere otra autorización y las verificaciones de dependencias documentadas en el preflight.

El generador `scripts/qa/0057-prepare-atomic.cjs` solo genera archivos locales y valida las fuentes contra el manifiesto; no tiene conexión ni modo de despliegue. `0057-final-readonly-baseline.json` contiene únicamente metadatos y definiciones de funciones, sin registros de cuentas ni secretos. Resultados del artefacto: `0057-final-local-results.json`.

Sin riesgos críticos abiertos para instalar SQL inerte. SMTP/callback/Edge siguen pendientes de su despliegue y activación independientes; no bloquean esta instalación inerte. Se conservan las protecciones de último Superadministrador, idempotencia, sesión y compatibilidad 0051.
