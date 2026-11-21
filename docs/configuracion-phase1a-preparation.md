# Configuración Fase 1A — preparación de restauración

Investigación específica, 20/11/2026. Referencia histórica: 31b25e2, anterior a a765739. Inspección local y consultas remotas exclusivamente de lectura en pfdvehcyauoncxeolcjc. Sin cambios funcionales ni remotos.

## A. Interfaz histórica y componentes

`src/index.html`: `main#configuracion.settings-page.view` y `section#settings-grid.settings-grid`, conservados actualmente. Navegación mediante router.js → ElaraSettings.showSettings().

`src/js/settings.js` histórico contenía cinco tarjetas:

1. Empresa / Datos generales: nombre comercial, correo y teléfono operativos, ciudad y país.
2. Operación / Preferencias generales: moneda, zona horaria, idioma, antelación mínima y margen de alerta.
3. Notificaciones / Comunicaciones: email cliente, email colaborador y avisos internos; WhatsApp futuro.
4. Seguridad y acceso: lista estática de reglas, solo visual.
5. Integraciones futuras: estados estáticos de Supabase, pagos, WhatsApp, vuelos e historial.

Las tres primeras editaban `settingsState` en memoria con FormData y mostraban un toast; no persistían en Supabase ni almacenamiento local. Las restantes eran textos informativos, sin comprobación real. Las integraciones y envíos nunca se implementaron en ese controlador. No hay pestañas, modales propios ni interruptores históricos: los estados de notificaciones usaban selectores.

Actualmente el código sigue presente, con retornos inmediatos `unavailableView` en showSettings y `blocked` en saveSettingsCard. initSettings aún renderiza las tarjetas demo durante la inicialización global; no basta con retirar el bloqueo de la vista. Deben sustituirse estado y render inicial demo antes de habilitarla. Las afirmaciones históricas sobre integraciones o seguridad no son evidencia del estado real.

Reutilizables: panel, panel__header, panel__eyebrow, settings-grid, settings-card, settings-card--wide, settings-card__actions, settings-read-list, settings-note, settings-form, settings-field, field, button/button--primary/button--muted/button--compact y status-pill. CSS en pages.css:5140–5306 y responsive.css:201/500; cuadrícula de dos columnas que pasa a una y acciones con wrap. Recuperar estructura y estilos, sin copiar controladores demo. Para futuras confirmaciones utilizar el patrón modal compartido ya operativo, sin crear uno ahora.

## B. Fuentes y contratos reales

Confirmado remotamente: app_settings, app_setting_history, configurable_catalogs y configurable_catalog_items tienen RLS y SELECT para authenticated; carecen de DML directo para ese rol. Hay ocho parámetros activos. is_editable=true es metadato, no autorización ni garantía de efecto operativo.

| Opción / finalidad | Almacenamiento y lectura | Modificación real y permisos | Consumidores / efectos / recomendación |
| --- | --- | --- | --- |
| Identidad y contacto de ELARA | Sin fuente empresarial específica identificada para el formulario histórico; companies corresponde a clientes empresa | set_app_setting no admite esas claves | No convertir companies ni el mock en identidad corporativa. Posponer edición; requiere contrato específico |
| Idioma, zona horaria, antelación mínima, margen de alerta | Valores históricos en memoria; sin claves autorizadas equivalentes | Sin escritura empresarial disponible | No confundir con formato de fechas/moneda o preferencias locales. Posponer |
| operations.default_service_conflict_minutes | app_settings, scope operations; SELECT/RLS | set_app_setting; Superadmin o excepción explícita para contexto administrativo | Sin consumidor operativo encontrado en JS/funciones remotas de aplicación; no prometer que cambie conflictos. Consulta inicial |
| operations.vehicle_document_expiring_days | Igual | Igual | Sin consumidor operativo encontrado; no prometer que cambie estados documentales. Consulta inicial |
| operations.internal_driver_priority_enabled | app_settings, operations | set_app_setting; Superadmin y motivo | La regla de asignación preserva prioridad interna y declara que este parámetro no puede debilitarla. Solo lectura explicativa |
| operations.periodic_services_enabled | app_settings, operations | set_app_setting rechaza true con 0A000 | create_service y contrato MVP restringen periódicos. No ofrecer activación |
| finance.default_currency / finance.default_tax_rate | app_settings, finance | set_app_setting; Superadmin y motivo | finalize_service_pricing lee impuesto cuando no recibe tasa; existen defaults EUR independientes. Efecto financiero real/parcial; excluir de esta fase |
| system.audit_retention_mode / system.environment_label | app_settings, system | set_app_setting; Superadmin y motivo | No hay consumidor operativo de retención/despliegue identificado; etiqueta no prueba entorno real. Consulta, sin conmutadores de seguridad |
| Catálogos de tipos/motivos | configurable_catalogs/items; SELECT/RLS | create_configurable_catalog_item, update_configurable_catalog_item, set_configurable_catalog_item_active; require_admin_user y Superadmin en casos de sistema | Catálogos de service_types, incident_reason_codes, cancellation_reason_codes, payment_reference_types, expense_reason_codes y settlement_adjustment_reasons. Añadir etiqueta no habilita workflow ni amplía códigos admitidos por contratos. Consulta inicial; sin CRUD operativo ni financiero |
| Notificaciones e integraciones | Sin claves/contrato para los selectores históricos | Sin escritura/envío configurables en este módulo | No activar email, WhatsApp, pagos o vuelos; no mostrar estados inventados. Posponer |
| Seguridad, roles y sesiones | Auth, app_users/roles/app_sessions y contratos existentes | Pertenecen a Usuarios/Auth; 0057 inerte | Información contextual limitada, sin duplicar gestión ni configurar tokens/SMTP/roles |
| Preferencias visuales locales | No se identificó persistencia en settings.js | No hay contrato empresarial | Posponer; una preferencia local nunca representa configuración compartida |

Lectura empresarial recomendada: SELECT explícito de columnas no sensibles de app_settings con RLS para obtener scope, tipo, versión y vigencia; historia solo Superadmin. get_app_setting(text,text,uuid) existe, pero devuelve solo valor y tiene autorización distinta: usuario activo y restricción de valor sensible por rol asignado, no exclusividad del contexto Superadmin. No usarla como prueba de acceso exclusivo al módulo.

## C. Alcance recomendado

Restaurar la presentación histórica con datos reales **en consulta**: parámetros operativos soportados, parámetros de sistema claramente descritos e historial contextual de configuración; catálogos operativos como consulta breve si resultan útiles al despliegue. Sin valores inventados ni formulario corporativo vacío presentado como configurado. Ausencias con mensaje comprensible.

No es imprescindible habilitar escrituras para el primer despliegue. Posponer empresa, comunicaciones, preferencias sin fuente, edición de catálogos y cambios de parámetros hasta decidir qué efectos necesita el negocio. Excluir Finanzas y Gestoría; no trasladar registros de Usuarios, Conductores, Vehículos, Servicios, Caja, Gastos o Liquidaciones.

## D. Seguridad y dependencias mínimas

- permissions.js concede ruta configuracion y settings.manage al contexto superadmin; router/auth deben confirmar contexto y sesión. Esa matriz es presentación, no autorización backend.
- RLS de app_settings: Superadmin y lectura no sensible para administrativo; historia solo Superadmin. Catálogos permiten administradores y subconjuntos a conductor. Por tanto exclusividad de pantalla no equivale a exclusividad global de lectura de todas las tablas.
- RPC verificadas remotamente: get_app_setting(text,text,uuid), set_app_setting(text,text,uuid,text,jsonb,text), create_configurable_catalog_item(uuid,text,text,text,integer,jsonb), update_configurable_catalog_item(uuid,text,text,integer,jsonb), set_configurable_catalog_item_active(uuid,boolean). EXECUTE authenticated=true, anon=false; SECURITY DEFINER/search_path=public. No CREATE para anon/authenticated en public. Conservar guardas reales; no ampliar permisos para la restauración.
- set_app_setting limita claves, impide secretos y exige motivo para cambios críticos. Trigger valida tipo/forma, gestiona versión e historial inmutable con auditoría. No hay parámetro expected_version ni request_id: bloqueo de fila no evita sobreescritura de una edición obsoleta, ni ofrece recibo idempotente ante respuesta incierta. p_reason se exige, pero no se persiste explícitamente por esa función; el trigger de actualización registra motivo nulo. is_editable y rangos semánticos de cada clave tampoco constituyen una barrera completa en la RPC. Estas limitaciones importan antes de habilitar edición.
- Revertir: no existe RPC dedicada de rollback; reponer el valor anterior por una escritura autorizada genera nueva versión. No borrar historia. No ofrecer restauración automática todavía.
- Dependencias para consulta: cliente Supabase autenticado, RLS existente y ciclo de invalidación de sesión/contexto. No necesita 0058, Edge nueva ni activar 0057.
- Reutilizar patrón de Usuarios: scope por usuario/identidad/sesión/contexto, revisión por petición, descarte de respuestas tardías e invalidación al navegar/cambiar contexto/cerrar sesión. No reutilizar su gestión administrativa ni modificar sus archivos.

## E. Implementación futura y validaciones

Archivos previstos: src/js/settings.js (sustituir demo por controlador de lectura con autorización y estados); src/index.html solo si requiere estado accesible o conexión de componentes; pages.css/responsive.css solo si existe un déficit demostrado. Adaptador acotado en settings.js o API común conforme al patrón existente, sin duplicar cliente ni modificar módulos aprobados. Nuevas pruebas específicas de Configuración; router/permissions/auth ya contienen la ruta y no necesitan ampliación de permisos.

Validaciones futuras locales/aisladas: contexto Superadmin confirmado; rechazo de administrativo/conductor, incluso usuario multirrol en otro contexto; RLS; carga vacía/error; tipos/vigencias y escapes; ausencia de demo; cierre de sesión/navegación/revocación; respuestas tardías; aperturas repetidas sin listeners duplicados. Si se autorizan escrituras, añadir valores inválidos/rangos, motivo/auditoría, edición concurrente, doble envío y respuesta incierta antes de habilitarlas. Responsive 390/640/768/1024/1440, regresión de módulos aprobados y suite global en la implementación.

Esta intervención no ejecutó pruebas de escritura ni RPC mutantes; se limita a investigación documental/código y metadatos remotos. Único archivo añadido: este informe. No se modificaron archivos funcionales, usuarios, roles, sesiones, configuración ni operaciones de 0057. Sin commit, push, cambio de rama o despliegue.

## Restauración de consulta implementada

Configuración Fase 1A restaurada en modo consulta. Se conserva main#configuracion y settings-grid, sin duplicar componentes. Cinco tarjetas: Empresa (no disponible), Operación (cuatro claves operations verificadas), Notificaciones (no disponible), Seguridad y acceso / Sistema (dos claves system) y Catálogos operativos (service_types, incident_reason_codes, cancellation_reason_codes). No se incluyen claves ni catálogos financieros.

settings.js ya no contiene estado demo, formularios ni acciones de escritura. Reutiliza ElaraOperationalData.readAll con filtros explícitos de claves e IDs, paginación y comprobación de lectura completa del adaptador existente. Presenta únicamente parámetros activos, no sensibles, de ámbito correcto y vigentes; un valor ausente, ambiguo o inválido no se convierte en dato confirmado. Las advertencias distinguen valor registrado y efecto operativo. Se requiere usuario y sesión de aplicación con contexto superadmin; limpia contenido ante cambios de sesión/contexto y navegación, y descarta respuestas obsoletas antes de continuar consultas o pintar resultados.

CSS: solo reglas existentes de Configuración en pages.css para proporción etiqueta/valor, saltos de texto largo y tarjetas ajustadas al contenido. Los cambios previos de otros módulos en ese archivo se conservaron intactos.

Archivos de esta intervención: src/js/settings.js; src/css/pages.css (solo selectores settings); tests/settings-presentation-harness.cjs; tests/settings-presentation.test.cjs; tests/settings-presentation.visual.cjs; este informe.

Validación: 13 pruebas específicas superadas; suite global 823 PASS / 0 FAIL con runtimes locales existentes. El primer intento global no tenía configurada ELARA_SUPABASE_SDK_FILE y dos archivos de invitaciones no arrancaron; se utilizó el SDK público ya disponible en TEMP y se repitió la suite completa satisfactoriamente, sin modificar invitaciones. Chrome headless con fixtures locales y adaptador real: 390, 640, 768, 1024 y 1440 px, cinco tarjetas, cero controles de edición y sin desbordamientos; capturas revisadas de móvil y escritorio, incluyendo textos largos. Evidencia visual temporal: elara-settings-UDBYn2. git diff --check sin errores de whitespace; avisos de CRLF preexistentes.

No se efectuaron consultas SQL remotas, cambios Supabase, activaciones 0057, escrituras de configuración ni despliegues. La consulta autenticada de producción queda para validación visual del usuario; las pruebas automatizadas usaron datos exclusivamente locales. Empresa, notificaciones y toda edición permanecen pendientes de contratos apropiados. Se detiene para validación visual autenticada.
