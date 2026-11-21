# 0056 — LISTO para autorización de despliegue

17/11/2026. Proyecto `pfdvehcyauoncxeolcjc`, ELARA Transport, ACTIVE_HEALTHY.
**No se ha aplicado 0056 ni ejecutado SQL remoto de escritura.**

- Auth local real + PostgREST + SDK: 7 escenarios PASS. Tres RPC, permisos,
  persona nueva/existente, sustitución, desactivación, HTTP/replay y persona
  compartida intacta. Éxito HTTP 200, permiso denegado 403, payload cambiado
  409/23505; versión obsoleta 500/40001 (requiere recargar estado).
- Suite global solicitada: **519 PASS, 0 FAIL, 0 omitidas**.
- Artefacto exacto: **5 comprobaciones nativas PASS**, incluyendo verificador,
  rechazo de reinstalación y desactivación de emergencia. No se repitieron las
  29 pruebas de concurrencia ya superadas en la fase anterior.
- Remoto READ ONLY: 57 entradas, 0055 instalada y su fuente coincidente;
  0056 y sus objetos ausentes. Dependencias, índices, trigger diferido, RLS y
  permisos compatibles. Sin conflictos observados en la instantánea.
- Session pooler **5432**, credencial específica del proyecto, backend estable,
  TLS **verify-full** con cadena y nombre del servidor verificados, certificado
  aprobado `Downloads/prod-ca-2021.crt`. Credenciales solo en memoria/entorno.

## Procedimiento preparado, pendiente de autorización

1. Repetir solo el preflight operativo inmediato:
   `node scripts/qa/0056-session-readonly.cjs`. Debe pasar y tener menos de 5 minutos.
2. Verificar el manifiesto y enviar **únicamente**
   `docs/0056-atomic-deployment.sql` con el controlador
   `scripts/qa/0056-session-deployment.cjs`, modo `deploy`, y la bandera de
   autorización ligada al SHA del artefacto. Ese modo **no se ha ejecutado**.
3. Un solo BEGIN/COMMIT original: locks y comprobación de baseline, columna,
   trigger y cinco funciones, grants, INSERT único de historial, postcheck
   interno y notificación de recarga de esquema a PostgREST. Historial 57 → 58,
   versión `20261117005600`. No recorre ni aplica otras migraciones.
4. Exigir salida cero y COMMIT confirmado. Después usar el modo `post`, que
   ejecuta el `.verify.sql` en READ ONLY y no invoca las RPC de negocio.
5. Si el resultado del COMMIT es incierto, **no reenviar**. Consultar primero
   el verificador/historial. El marcador local exclusivo impide reenvíos automáticos.

SHA-256 del artefacto probado:
`b791cac7942ca12de10fa21e40917ed068f101525872348d52feafb4a24d5342`.

Fuente 0056 intacta:
`2a4dfadbeae7834e15591eef1a016c7b50524e9b58477145b525cac05497d297`.

## Fallo y desactivación

Un error previo al COMMIT revierte la instalación completa, incluido historial.
Timeout de lock: 5 s; sentencia: 60 s. ALTER TABLE requiere brevemente un lock
exclusivo en `company_contacts`; si hay actividad incompatible, abortar y revisar.

Si después del COMMIT fuese necesario detener el uso, queda preparado y probado
`0056-atomic-deployment.sql.disable.sql`: revoca EXECUTE en las tres RPC nuevas
y pide recarga de caché. Requiere autorización expresa; **no se ha ejecutado en
remoto**. Conserva registros, columna, trigger, historial y contratos anteriores.
No deshace operaciones ya confirmadas ni cancela llamadas que ya estaban en curso.

Sin riesgos críticos abiertos. El fingerprint de funciones se ordena con
COLLATE "C" para que la colación local/remota no produzca falsos conflictos.
El timeout inicial al crear la red Docker fue resuelto repitiendo la prueba
por separado; la red vacía y todos los contenedores de pruebas fueron eliminados.
Ninguno de esos ajustes cambió la migración.

Evidencia compacta: `0056-readiness-results.json`; SQL/manifiesto/verificadores
adyacentes. Rama, respaldo 1be4711 y cambios previos conservados. Sin frontend,
Dashboard, Servicios, commit, push, merge o deploy. **Detenido para autorización.**
