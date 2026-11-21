# Vehículos Fase 1A

Interfaz recuperada con el HTML y los componentes de `31b25e2`: resumen, tarjetas, búsqueda, filtros, paginación y ficha existentes. El botón único «Nuevo vehículo» se sitúa en el encabezado con `button button--primary`.

Operaciones reutilizadas de 0048:

- `admin_create_vehicle`: alta de vehículo propio con matrícula española, marca, modelo, estado manual inicial y notas. Sin altas externas ni atributos adicionales no admitidos por la RPC.
- `admin_inactivate_vehicle`: motivo obligatorio; conserva los rechazos por conductor vinculado, asignación de servicio, mantenimiento en curso o incidencia abierta. Sin reactivación.
- `admin_register_vehicle_document`: registro y reemplazo explícito de metadatos de seguro, ITV, permiso de circulación y licencia VTC. Fechas, referencia, estado y motivo de reemplazo según el contrato. Sin carga física de archivos.
- `admin_assign_driver_vehicle` y `admin_close_driver_vehicle_assignment`: mismo controlador, elegibilidad y recibos que Conductores. No crean, transfieren ni cierran servicios.

No existen contratos administrativos para editar los datos generales del vehículo, dar de alta vehículos externos, reactivar o cambiar libremente el estado manual/aprobación. La ficha deja esas acciones deshabilitadas. Tampoco se habilitan escrituras de kilometraje, mantenimiento o incidencias.

Los estados se muestran por separado: activo/inactivo según `inactive_at`, estado manual almacenado y disponibilidad efectiva que requiere comprobación operativa. Los documentos visibles, sus fechas y su historial no se presentan como una confirmación de cumplimiento documental completo.

Las lecturas conservan permisos, exclusión QA, relaciones por UUID y protecciones de sesión/navegación. El refresco administrativo conserva búsqueda, filtros y página; los envíos inciertos sin recibo no se repiten automáticamente. Se corrigió una invalidación del modal compartido para que el cierre anterior no oculte una apertura nueva.

Validación con datos aislados: presentación, cinco formularios administrativos, paginación, documentación, permisos, sesiones, respuestas tardías, doble envío, recibos y respuestas inciertas. Comprobación responsive a 390, 640, 768, 1024 y 1440 px. No se han creado ni modificado registros reales ni ejecutado migraciones remotas. Pendiente validación visual autenticada del usuario.
