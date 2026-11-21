# Conductores Fase 1A

Restauración sobre los nodos y estilos originales de `31b25e2`, conservando la ruta operativa autenticada. No se inicializan controladores ni persistencia legacy.

- Listado, contacto, estado administrativo, búsqueda, filtros, paginación y ficha en el modal existente.
- Contadores del conjunto accesible filtrado, no de disponibilidad efectiva. Los vínculos y asignaciones se presentan como accesibles por la sesión; no se deduce que un conductor esté libre o en servicio.
- Lecturas mediante `ElaraOperationalData`: personas, conductores, vehículos, vínculos y, al abrir la ficha, asignaciones y servicios. Lecturas completas paginadas bajo los permisos actuales; un error no se convierte en cero registros.

## Operaciones existentes reutilizadas

- `admin_create_driver`: alta activa, disponibilidad inicial no disponible; no crea usuario ni acceso al portal.
- `admin_update_driver`: estado `active`, `pending_documents` o `inactive`, licencia y observaciones; motivo obligatorio. Excluye conductores suspendidos. Exige persona activa y licencia válida para activar; los vínculos activos de vehículo/usuario o asignaciones pendientes impiden abandonar el estado activo según 0048.
- `admin_assign_driver_vehicle` y `admin_close_driver_vehicle_assignment`: elegibilidad y vínculo explícito mediante el controlador administrativo existente. No asignan servicios ni transfieren vínculos automáticamente.
- Los intentos con recibo conservan su identificador. Una respuesta incierta de actualización/cierre sin recibo no se reenvía; el formulario ofrece comprobar por lectura y cerrar.
- Cierre, navegación y cambios de sesión invalidan respuestas pendientes; un envío confirmado solo refresca la lectura.

## Contratos que faltan para habilitar más controles

- No hay una RPC **administrativa** para editar nombre, teléfono o correo de la persona compartida desde Conductores. 0048 no modifica `persons`; estos datos quedan en lectura.
- No hay una RPC **administrativa** para cambiar `drivers.availability_preference`. `update_current_driver_availability` (0028) corresponde al propio conductor y no autoriza esta acción administrativa. Control deshabilitado.
- No hay contrato administrativo de suspensión/desbloqueo en 0048. No se ofrece esa transición.
- La preferencia disponible/no disponible no equivale a disponibilidad operativa. No se publican indicadores derivados de actividad ni un próximo servicio supuesto.

## Validación

Pruebas aisladas de presentación y controlador; regresión global. Verificación visual local a 390, 640, 768, 1024 y 1440 px para listado, ficha y alta. Sin pruebas de escritura ni datos ficticios en producción. Pendiente validación visual del usuario con sesión autenticada y datos reales.
