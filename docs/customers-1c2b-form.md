# Clientes Fase 1C.2-B — formulario empresarial preparado, remoto bloqueado

Se conserva el único `#new-customer-modal`, sus agrupaciones y los radios/chips
originales. El botón del encabezado se denomina «Nuevo cliente». Cada apertura
nueva comienza en Particular. Un recibo enviado pendiente tiene prioridad: se
recupera su tipo y sus datos inmutables, sin crear otro intento.

El cambio de tipo con datos requiere confirmación dentro del mismo formulario.
Cancelar conserva el borrador; confirmar limpia ambos grupos. No se puede
cambiar un intento enviado, incierto o pendiente de confirmar/refrescar.

## Adaptadores y validación

`customerCreate` conserva 0048; `companyCreate` prepara 0055. Ambos comparten
`operation`, `execute`, permisos, sesión, exclusión de envíos simultáneos,
idempotencia, comprobación de respuesta y refresco condicionado al contexto.
No se generan UUID de entidades ni códigos humanos en el navegador.

Empresa incluye razón social y NIF/CIF obligatorios; nombre comercial, teléfono,
correo y dirección de facturación opcionales; notas de empresa, internas del
cliente y de facturación separadas. NIF/CIF se recorta y convierte a mayúsculas,
sin inventar una comprobación fiscal que no forma parte de 0055. Los correos se
validan y normalizan a minúsculas. Los estados provienen del servidor.

Contacto: ninguno o persona nueva con nombre, apellidos y teléfono o correo;
cargo opcional. No hay un selector operativo autorizado de personas existentes
en Clientes: esa opción está deshabilitada y explicada. No se añaden consultas
ni campos para introducir UUID. El adaptador rechaza esa modalidad.

«Validar datos» ejecuta únicamente validación local y nunca llama a la RPC.

## Bloqueo y futura habilitación

`companyEnabled()` exige simultáneamente:

- entorno explícitamente local;
- opt-in `ElaraConfig.companyCustomerCreation === true`;
- URL de configuración y URL del cliente SDK iguales y de loopback HTTP.

La aplicación no activa ese opt-in. El controlador comprueba la condición al
entrar en `execute` y otra vez después de las lecturas asíncronas, justo antes
del envío. El botón Guardar permanece deshabilitado con aviso visible.
Una página servida desde localhost conectada al proyecto remoto sigue bloqueada.
La bandera por sí sola tampoco permite escrituras remotas.

La prueba del adaptador activa el opt-in exclusivamente en su entorno aislado
y ejecuta el SQL real de 0055 en PGlite, sin HTTP ni acceso al proyecto remoto.
Comprueba formularios reales, contacto opcional/nuevo, pérdida de respuesta
después del commit, repetición idempotente y respuestas tardías tras cierre,
navegación y cambio de sesión. No simula confirmaciones empresariales exitosas.

Tras aprobar y desplegar 0055 en una intervención posterior, la habilitación
remota requerirá revisar expresamente esta política central; se reutilizará
el mismo adaptador, sin otra implementación de creación empresarial.

## Verificación

Pruebas en `tests/catalog-admin.test.cjs` y regresión visual en
`tests/customers-presentation.visual.cjs`. El navegador comprueba visibilidad,
desbordamiento, validaciones, confirmación, vuelta a Particular y los flujos
de ficha/historial/servicio en 390, 640, 768, 1024 y 1440 px.

Resultado: 69 pruebas del controlador y 497/497 globales, sin fallos ni
omisiones; 50 regresiones de Clientes adicionales en la ejecución visual.
Sintaxis de los archivos JavaScript modificados y `git diff --check` correctos.

Revisión de RPC según la [documentación oficial](https://supabase.com/docs/reference/javascript/rpc).
No se modifican ni despliegan contratos SQL, Dashboard, Servicios o lógica
financiera. Queda pendiente la validación visual autenticada del usuario y
la autorización de habilitación empresarial real. No se avanza a gestión de
contactos.
