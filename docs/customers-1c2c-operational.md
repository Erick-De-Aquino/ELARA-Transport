# ELARA Transport — Clientes Fase 1C.2-C: alta empresarial operativa

17 de noviembre de 2026. Frontend preparado para validación visual autenticada.
**Sin despliegue de frontend ni operaciones sobre Supabase remoto.**

## Archivos de esta intervención

- `src/js/catalog-admin.js`: disponibilidad operativa de Empresa, preservación
  de binding y de filtros/búsqueda/página después de confirmar el alta.
- `src/index.html`: retirado únicamente el aviso temporal de alta deshabilitada.
- `tests/catalog-admin.test.cjs`: disponibilidad, validación, permisos,
  idempotencia, concurrencia y errores contra PostgreSQL local.
- `tests/customers-presentation.test.cjs`: integración real de 0055 local con
  listado, filtros, página, ficha e historial por UUID.
- `tests/customers-presentation.visual.cjs`: guardas visuales actualizadas,
  disponibilidad de Guardar con campos válidos y accesibilidad responsive.
- `scripts/qa/0055-auth-validation.cjs`: actualizadas las expectativas del
  formulario local: vacío bloqueado, válido habilitado y sin feature flag.
- Este informe y `customers-1c2c-results.json`: documentación/evidencia.

Los otros archivos que Git ya mostraba modificados al comenzar son cambios
previos conservados. No se han editado CSS, customers.js, Dashboard, Servicios,
SQL, migraciones, RLS ni configuración. La rama sigue siendo
`backup/elara-restauracion-2026-11-15` y se conserva el respaldo 1be4711.

## Bloqueo retirado y condiciones actuales

Se elimina la condición temporal que exigía entorno local, opt-in
`companyCustomerCreation=true` y URLs de loopback. La RPC 0055 ya está instalada
según el despliegue anterior; esta intervención no la modifica ni la invoca
contra el remoto.

No se añade otra ruta de escritura: el único envío empresarial sigue siendo
`ElaraCatalogAdmin.execute` → `client.rpc('admin_create_company_customer', args)`.
El SDK y su URL configurada deben coincidir. El endpoint se captura por intento
y se vuelve a comprobar después de las lecturas asíncronas, antes del envío,
al recibir respuesta y durante reintentos. Cambiar ambos endpoints a otra URL
no permite recuperar allí un intento ya enviado a la anterior.

Guardar empresa se habilita cuando:

- Empresa está seleccionada en el único modal existente.
- Hay identidad autenticada y contexto administrativo/superadmin vigente.
- Razón social y NIF/CIF están informados; correos y contacto opcional son válidos.
- No hay envío en curso ni confirmación pendiente de cambio de tipo.
- La sesión/vista siguen vigentes y el binding es coherente con el intento.

Un intento enviado permanece inmutable; si fue incierto se habilita su
comprobación con los mismos datos. Si ya fue confirmado, el botón actualiza
lecturas sin otra escritura. Las guardas de execute siguen siendo necesarias:
no se confía únicamente en la propiedad disabled del botón. Supabase mantiene
la autorización final en la RPC; no se cambian sus permisos.

Se conserva Particular como valor inicial de una apertura nueva, el selector,
los grupos de campos, contacto, notas y un único `#new-customer-modal`.
Persona existente sigue deshabilitada y explicada, sin entrada manual de UUID.
No hay listeners ni IDs duplicados. El mensaje temporal de alta empresarial
deshabilitada desaparece; validaciones, permisos y errores legítimos permanecen.
Un aviso de obligatorios ya corregido se limpia cuando el borrador empresarial
queda válido. Particular conserva su comportamiento anterior.

## Payload y contacto

Se conserva exactamente el contrato con request_id estable y los once campos
de negocio de 0055, sin estados ni IDs de nuevas entidades enviados por cliente.
Razón social y NIF/CIF obligatorios; NIF/CIF recortado y en mayúsculas,
manteniendo guiones y espacios interiores conforme al contrato. No se añade
un validador fiscal nacional o dígito de control no previsto en SQL.

Las notas de empresa, internas del cliente y de facturación siguen separadas.
Los opcionales vacíos se envían NULL y los correos se normalizan a minúsculas.
Sin contacto se envía p_contact=null. Persona nueva exige nombre/apellidos y
teléfono o email; cargo opcional. La creación atómica de persona/vínculo sigue
correspondiendo a 0055, que devuelve empresa active y cliente new.

## Idempotencia, sesión y lectura posterior

Se preservan UUID por intento, payload serializado inmutable, exclusión global
de envíos y bloqueo de doble clic. Una pérdida de respuesta no se interpreta
como rollback: se conserva el request_id para recuperar el recibo. No se
muestra éxito sin una respuesta TABLE válida; duplicados se presentan como
rechazo y una respuesta malformada como resultado incierto.

Cambios de actor, sesión, rol, navegación o cierre invalidan el contexto y
evitan reabrir modales o refrescar otra vista con respuestas tardías. Un cambio
de conexión también impide enviar o confirmar bajo un endpoint diferente.
Tras confirmar, un fallo de recarga solo reintenta lecturas, sin repetir RPC.

La recarga existente reconstruye el listado y reiniciaba sus controles. Se
añade, solo en el callback de confirmación empresarial del controlador, una
captura/restauración de búsqueda, filtros aún disponibles y página limitada
al conjunto actualizado. Se conserva ese estado también si falla el primer
refresco. No se altera el código de lectura compartido ni el de Clientes.

El nuevo cliente aparece como Empresa/Nuevo y su ficha e historial usan el
customer_id retornado, nunca el company_id. La prueba local comprueba también
su pertenencia al conjunto new/active que utiliza Nuevo servicio. Las pruebas
SQL 0055 existentes verifican su uso por el contrato de Servicios; no se ha
modificado el módulo Servicios ni creado servicios reales de prueba.

## Pruebas y evidencias

Resultados finales y rutas de evidencia en `customers-1c2c-results.json`:

- Suite global: **500 PASS / 0 FAIL**, sin omitidos ni cancelados. Incluye
  regresiones 0048/0049/0050, Clientes, Dashboard, Servicios y alta individual.
- Controlador: 71 pruebas dentro de la suite; creación empresarial y errores
  de duplicidad se ejercitan con PostgreSQL/PGlite local y SQL auténtico.
- Integración Clientes: 51 pruebas, incluida creación local, listado, filtros,
  página, ficha/historial por UUID y elegibilidad new/active.
- Supabase Auth/PostgREST/PostgreSQL/Supabase JS locales: **10 escenarios PASS**,
  incluido formulario real, JWT de GoTrue, commit HTTP real, pérdida de respuesta
  inyectada y reintento idempotente. Contenedores/red descartables eliminados.
- Responsive: **390, 640, 768, 1024 y 1440 px**, sin desbordamiento de tarjetas,
  campos y modales; Guardar accesible y habilitado únicamente con datos válidos;
  confirmación de descarte y regresiones de ficha/historial/servicio conservadas.
- Sintaxis de archivos JS modificados y `git diff --check` correctos. Los avisos
  LF/CRLF corresponden a la configuración ya existente.
- Hashes iniciales de 179 archivos de src/supabase/tests permiten comprobar
  conservación de módulos y contratos excluidos del alcance.

Las pruebas de UI usan fixtures aisladas y las escrituras positivas usan SQL
local real. No se reactivan mocks en la aplicación ni se cargan credenciales
o endpoints de producción durante las pruebas. Las direcciones remotas usadas
en un test de disponibilidad son solo metadatos de un SDK sin transporte de
red: ese test no envía la RPC.

Durante la adaptación se corrigieron dos expectativas de los verificadores:
LinkeDOM expone crypto como getter, y el formulario empresarial vacío ahora
debe tener Guardar deshabilitado incluso en el harness de Auth. No se cambió
la lógica de producción para acomodar esas expectativas.

## Límites y entrega

No se han creado empresas, personas, clientes o servicios de prueba en remoto.
No se han consultado ni modificado Supabase remoto en esta intervención.
No hay commit, push, merge, cambio de rama o publicación de GitHub Pages.

Queda pendiente vuestra **validación visual autenticada** del frontend servido
con estos cambios. Las capturas automáticas son de fixtures locales; no se
presentan como una sesión real del usuario. No se avanza a gestión de contactos,
activación/inactivación ni otra fase. La rama de trabajo queda preparada y
sin desplegar, detenida para revisión.
