# 0056 desplegada e integración de contactos preparada

17/11/2026. Proyecto ELARA Transport `pfdvehcyauoncxeolcjc`.

## Despliegue confirmado

Se aplicó una sola vez el artefacto aprobado de 0056, SHA-256
`b791cac7942ca12de10fa21e40917ed068f101525872348d52feafb4a24d5342`.
Preflight inmediato correcto: proyecto, 0055 presente, 0056 ausente,
dependencias, permisos, ausencia de conflictos y hashes aprobados.

Session pooler 5432, TLS verify-full, cadena y nombre del servidor verificados
con `Downloads/prod-ca-2021.crt`. Credencial existente solo en memoria/entorno.
Una transacción, límites de bloqueo preparados e historial atómico. Salida 0 y
COMMIT confirmado; no hubo reintento ni resultado incierto.

Verificación posterior READ ONLY correcta:

- Versión `20261117005600`, registro único; historial 57 → 58.
- `admin_add_company_contact(uuid,uuid,jsonb,boolean,text)`.
- `admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text)`.
- `admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)`.
- Las tres devuelven jsonb, propietario postgres, SECURITY DEFINER,
  search_path=pg_catalog; EXECUTE para authenticated, sin PUBLIC/anon/service_role.
- Cuerpos, columna version, trigger y constraint correctos. Funciones/ACL
  anteriores —incluidos 0048/0049/0050/0055— y metadatos previos conservados.

No se recorrieron otras migraciones ni se invocaron RPC de negocio en producción.
No se hicieron UPDATE/DELETE de datos empresariales existentes. Solo se ejecutó
la instalación aditiva autorizada y su registro de historial. La desactivación
de emergencia permanece preparada; no se ejecutó.

Evidencia: `0056-session-deploy-results.json`, `0056-session-post-results.json`,
`0056-deployment-attempted.json` y preflight de esta intervención.

## Frontend local

Archivos de aplicación modificados en esta intervención:

- `src/js/catalog-admin.js`: tres acciones 0056 sobre el mismo execute/recibos,
  validación de respuesta jsonb y gestión dentro de `new-customer-modal`.
- `src/js/customers.js`: acceso «Gestionar contactos» desde la ficha empresarial
  y visualización de principal. No se edita Dashboard, Servicios, CSS o HTML.

Disponible para sesión administrativa/superadmin, cliente empresarial new/active
y empresa activa: persona nueva, vincular persona existente, principal,
editar cargo/notas del vínculo y desactivar vínculo. Las personas existentes
se eligen únicamente de la colección autenticada que ya usa la ficha: activas,
accesibles bajo RLS, excluyendo QA/legacy y personas ya vinculadas activamente.
No hay entrada manual de UUID ni edición de identidad compartida.

Se reutilizan componentes y estilos existentes. Un solo modal de gestión;
retorno a la ficha con lectura renovada, sin reconstruir el listado ni perder
búsqueda/filtros/página. Los vínculos inactivos permanecen visibles y sin edición.
Puede quedar la empresa sin principal. La elección al añadir no sustituye otro
principal; la sustitución expresa envía UUID/versiones esperadas y motivo.

UUID estable, payload inmutable, exclusión de doble envío, endpoint coherente,
guardas de sesión/actor/rol/vista y respuestas tardías. Si se pierde la respuesta,
se conserva el intento incluso al cerrar/reabrir; un éxito con fallo de recarga
solo vuelve a leer. Un conflicto 40001 exige lectura explícita y nuevo intento,
sin reenvío ciego. Ninguna prueba de frontend apuntó a producción.

## Validación y parada

- Suite global: **528 PASS / 0 FAIL / 0 omitidas**.
- 8 pruebas específicas de payload, permisos, reintentos, concurrencia de UI,
  versiones obsoletas y cierre/navegación/sesión/endpoint.
- Flujo completo desde ficha contra SQL 0056 local real: alta nueva, vinculación,
  respuesta perdida y replay, principal, cargo/notas, ambas desactivaciones,
  persona compartida intacta y conservación del listado.
- Responsive: 390/640/768/1024/1440; lista, alta nueva, persona existente,
  principal, edición y desactivación. Capturas de fixtures locales, sin escritura.
- Sintaxis JS y git diff --check correctos. Tests modificados:
  `catalog-admin.test.cjs`, `customers-presentation.test.cjs` y su verificador visual.

Fuente 0056 y todas las migraciones anteriores intactas. Rama y respaldo 1be4711
conservados. Sin commit, push, merge o publicación de GitHub.

**Pendiente: vuestra validación visual autenticada del frontend local.** No hay
pruebas de escritura reales ni despliegue del frontend. No se avanza a otros módulos.
