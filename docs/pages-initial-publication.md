# Publicación inicial — artefacto estático preparado

Dictamen: **APTO para publicación del frontend autorizado**, previa autorización de Git y despliegue. No se ha publicado nada ni modificado Supabase. El Portal Conductor queda incluido conforme a su informe de regresión. Usuarios 1B permanece inerte.

## Procedimiento reproducible

Desde la raíz del repositorio, con Node.js disponible y sin instalar dependencias:

```text
node scripts/package-pages.cjs build
node scripts/package-pages.cjs verify
```

Salida preparada: `dist/pages/`. Manifiesto externo: `dist/pages.manifest.json`. El generador se niega a sobrescribir un directorio existente o escribir fuera de dist; para otra construcción usar un directorio nuevo, por ejemplo `node scripts/package-pages.cjs build dist/pages-next`, y verificarlo con el mismo argumento. No elimina archivos existentes.

Se copian literalmente 57 fuentes aprobadas, verificando hashes, sintaxis de scripts clásicos, referencias HTML/CSS/manifest, rutas de subdirectorio, exclusión del callback y ausencia de claves privilegiadas reconocibles. La inclusión es explícita en scripts/pages-package.json: archivos nuevos de src no se publican automáticamente. La lista completa, estado de archivos nuevos y separación de material interno están en pages-initial-publication-inventory.json. Los archivos copiados coinciden byte por byte con las fuentes actuales.

Identidad del contenido generado: SHA-256 `517a20e49c6096bf33ab5e7c0d037fedc4534bf2944694e74dc1b90c47df881d` (hash determinista de la lista ordenada de rutas, tamaños y SHA-256 individuales; no es un hash de un ZIP). Dos construcciones independientes producen la misma identidad y bytes. El manifiesto guarda el commit base 1be471170e2c62815f140300d050afc2a85b195f; **el árbol actual está modificado y ese commit no contiene todavía la restauración**. La identidad del contenido, no HEAD por sí solo, identifica este paquete. El commit de publicación será el SHA del checkout autorizado de CI, que imprimirá el constructor junto con el hash del contenido.

## Inclusiones y exclusiones

Incluidos: index.html, accept-invite.html y su controlador del flujo 0051, los CSS existentes, icono propio, manifest, controladores aprobados, autenticación/contextos/navegación, Portal Conductor y users-admin.js. Se mantienen los scripts históricos aún referenciados por HTML/dependencias actuales; no se eliminan por llamarse mock. El empaquetado no reactiva sus controladores ni modifica fuentes.

Exclusiones exactas dentro de src:

- accept-user-invite.html y js/accept-user-invite.js: callback administrativo pendiente.
- js/assignments.js, js/cache.js, js/passengers.js, js/payments.js, js/state-engine.js y js/utils.js: no forman parte del grafo de recursos utilizado por los HTML aprobados.
- js/mock/reports-history.mock.js, js/mock/reports.mock.js y js/mock/users.mock.js: proveedores históricos no necesarios para las vistas restauradas.

Docs, tests, scripts, migraciones, Edge Functions, configuración local y secretos quedan fuera por construcción: solo puede copiarse la lista explícita bajo src. El manifiesto y fixtures negativos de tests se generan fuera de dist/pages y nunca se suben con ese directorio. dist está ignorado por Git.

Archivo de frontend sin seguimiento **imprescindible para publicar**: src/js/users-admin.js. No confundirlo con src/js/accept-user-invite.js, que debe conservarse como trabajo local/de desarrollo pero no publicarse todavía.

También deben conservarse en Git el constructor, su JSON de inclusión, el workflow, las pruebas de empaquetado y toda la restauración aprobada, incluidos tests, documentación, migraciones y Edge pendientes tras revisar que no contengan secretos. Los archivos de desarrollo excluidos del paquete no se borran. Nunca incorporar pgpass, .env, tokens privilegiados, cadenas de conexión con contraseña, claves privadas, perfiles locales o credenciales seguras. La detección estática no sustituye revisar lo que se añadirá a Git.

## Workflow

.github/workflows/pages.yml anteriormente subía ./src. Ahora construye y verifica mediante scripts/package-pages.cjs y sube exclusivamente ./dist/pages. Conserva los disparadores existentes: push a main y workflow_dispatch. No se ha ejecutado ninguno. CI debe hacer checkout del commit autorizado completo, incluyendo archivos nuevos; no ejecutar manualmente desde una referencia distinta por error. El manifiesto queda fuera del sitio público; conservarlo junto al artefacto y la evidencia del run para recuperación.

## Validación del paquete

- Seis pruebas de empaquetado PASS: reproducibilidad, igualdad con fuentes, exclusiones, dependencia nueva, detección de secreto sintético, corrupción, archivo inesperado, referencia rota, JavaScript inválido, destinos inseguros y rechazo de sobrescritura.
- 98 pruebas relevantes PASS / 0 FAIL ejecutando los controladores **desde dist/pages**, mediante un preloader de pruebas que remapea lecturas de src al artefacto: autenticación 0053, multirrol, portal/precios/seguridad, Usuarios/0057, Configuración y consultas de Usuarios. No son llamadas de negocio reales.
- Prueba Chrome del paquete completo servido sin transformar HTML bajo /ELARA-Transport/: 16 módulos presentes, inicio de sesión visible, usuario no autenticado, configuración de backend remote y cero excepciones. Callback conductor, users-admin.js y manifest HTTP 200; los dos recursos del callback administrativo HTTP 404.
- En ese smoke test se interceptan HTTPS: Supabase SDK 2.118.0 y Chart.js 4.4.0 desde las copias públicas ya disponibles en TEMP; CSS externo de iconos neutralizado. Cero peticiones reales a backend. Por ello confirma carga/inicialización y ruta base, no disponibilidad en vivo de CDN ni una sesión real autenticada.
- Prueba multirrol existente ejecutada sobre los archivos del paquete: 390/640/768/1024/1440, navegación de los tres contextos, seis rutas del conductor, rechazo de ruta no autorizada y coordinación de dos pestañas. Las llamadas del fixture son locales e interceptadas.
- Consulta remota de solo lectura: 0057 instalada una vez y tabla de activación vacía. No se activó ninguna operación.
- git diff --check sin errores de whitespace; avisos CRLF preexistentes. La última suite global completa sigue siendo 823 PASS; esta tarea ejecutó las pruebas de empaquetado y las 98 relevantes, no la suite global completa de nuevo.

Los recursos y el manifest emplean rutas relativas; el callback 0051 retorna a index.html#mis-servicios dentro de la misma ruta base. El proyecto configurado permanece pfdvehcyauoncxeolcjc con clave pública. Los dominios Auth/REST y CORS ya fueron comprobados en la revisión previa. La Site URL y allowlist remota completa proceden de la confirmación manual del propietario: no se han modificado ni se presentan como reconsultadas aquí.

El artefacto local es reproducible en bytes; dependencias externas siguen siendo las del frontend aprobado. En particular el HTML principal usa Supabase @2, una referencia móvil. No se ha fijado ni sustituido en producción su versión durante este empaquetado; el smoke usa la versión pública ya validada localmente. Debe mantenerse la comprobación de carga de CDN tras publicar. No se promete funcionamiento offline ni se añade service worker.

## Punto de recuperación: preparado, NO ejecutado

1. Copiar íntegramente el árbol local, incluidos archivos nuevos y los artefactos/manifiestos, a un respaldo de acceso restringido. Las credenciales ignoradas, si se respaldan, deben permanecer en almacenamiento protegido separado del repositorio y del paquete.
2. Revisar status y el inventario. Preparar posteriormente una inclusión explícita de cambios aprobados; no usar git add indiscriminado con archivos sensibles. Revisar también los archivos nuevos necesarios para pruebas/contratos aunque no se publiquen.
3. Solo con autorización posterior: crear un commit de recuperación de toda la restauración y herramientas. Registrar su SHA y el hash de contenido del paquete. Preservar 1be4711 y 8464445; no resetear ni reescribir el historial actual.
4. Reconstruir desde ese checkout completo y limpio en CI. Revisar manifiesto, exclusiones y checks antes de autorizar su publicación desde main. La integración o promoción de rama requiere autorización propia; no se ha realizado aquí.

## Publicación y reversión: preparado, NO ejecutado

Antes de publicar, conservar el artefacto de la versión anterior asociada al run de main en 8464445 si todavía está disponible. Si no existe ya por retención, reconstruirlo desde ese commit en un checkout aislado usando su procedimiento histórico y verificarlo; no sobrescribir el árbol de trabajo restaurado ni asumir que el empaquetador nuevo puede ejecutarse sobre un commit que aún no contiene users-admin.js.

Publicación autorizada futura: checkout del commit revisado → build/verify → upload de dist/pages → deploy Pages → conservar artefacto, manifiesto, SHA y run. Verificar HTTPS en https://erick-de-aquino.github.io/ELARA-Transport/, recursos, los dos 404 administrativos, login/restauración/logout y navegación de contextos con usuarios autorizados. Estas verificaciones autenticadas pueden actualizar sesiones y no se realizaron en esta tarea. No crear operaciones financieras ficticias.

Reversión ante un fallo crítico: republicar el artefacto anterior conservado mediante una ejecución de recuperación autorizada. Si solo se dispone del código, preparar una referencia de recuperación del frontend anterior en un entorno aislado y ejecutar el workflow correspondiente, con nueva autorización. No asumir que workflow_dispatch acepta un SHA suelto: seleccionar una rama o etiqueta revisada. No hacer force-push, reset destructivo ni rollback SQL; la publicación del frontend no revierte cuentas, sesiones ni transacciones de negocio. 0057 permanece instalada e inerte.

Archivos de herramientas/configuración/pruebas nuevos o modificados en esta tarea: .github/workflows/pages.yml; scripts/package-pages.cjs; scripts/pages-package.json; tests/pages-package.test.cjs; tests/pages-package-preload.cjs; tests/pages-package.browser.cjs; este procedimiento y su inventario. Ningún módulo funcional ni fuente de Supabase modificado. Sin git add, commit, push, merge, cambio de rama, invitaciones o despliegue.
