# ELARA Transport — UI / UX

## Proyecto

**Nombre interno:** Proyecto Atlas
**Versión:** 0.1.0

---

# 1. Objetivo

La interfaz de ELARA Transport debe transmitir la misma filosofía que la empresa:

* Cercanía.
* Confianza.
* Profesionalidad.
* Simplicidad.
* Elegancia.

El usuario nunca debe sentirse perdido.

Cada acción importante deberá poder realizarse con pocos pasos.

---

# 2. Principios de diseño

Toda la interfaz deberá cumplir los siguientes principios:

* Limpia.
* Clara.
* Moderna.
* Intuitiva.
* Responsive.
* Accesible.
* Consistente.

El usuario no debe necesitar aprender a utilizar la aplicación.

La aplicación debe resultar natural desde el primer uso.

---

# 3. Filosofía UX

El sistema debe reducir el trabajo del usuario.

Siempre que sea posible:

* Autocompletar información.
* Recordar preferencias.
* Evitar escribir datos repetidos.
* Mostrar únicamente la información necesaria.

---

# 4. Roles

Cada rol verá únicamente aquello que necesita.

## Cliente

La aplicación estará orientada a reservar servicios rápidamente.

La prioridad será:

* Próximo servicio.
* Nueva reserva.
* Estado del servicio.
* Historial.

---

## Colaborador

La prioridad será:

* Servicios asignados.
* Servicio actual.
* Próximo servicio.
* Cambiar estado del servicio.
* Historial.

---

## Administrador

La prioridad será la operación.

Al iniciar sesión deberá visualizar inmediatamente:

* Servicios de hoy.
* Servicios pendientes.
* Servicios activos.
* Servicios cancelados.
* Colaboradores disponibles.
* Asignaciones pendientes.
* Ingresos del día.

---

# 5. Navegación

La navegación será simple.

Siempre existirá:

* Sidebar.
* Header.
* Área principal.

Nunca habrá ventanas innecesarias.

Nunca se abrirán múltiples páginas HTML.

Toda la navegación será interna.

---

# 6. Dashboard

El Dashboard debe responder una única pregunta:

> ¿Qué está ocurriendo ahora mismo en la empresa?

No será una pantalla llena de gráficos.

Será un centro de operaciones.

---

# 7. Servicios

El módulo Servicios será el núcleo de la aplicación.

Cada tarjeta o fila deberá mostrar como mínimo:

* Estado.
* Fecha.
* Hora.
* Cliente.
* Pasajeros.
* Colaborador.
* Vehículo.
* Tipo de servicio.

El estado deberá poder identificarse visualmente en menos de un segundo.

---

# 8. Estados

Los estados utilizarán color e iconografía.

Ejemplo:

* Gris → Borrador.
* Azul → Confirmado.
* Amarillo → Pendiente.
* Verde → En curso.
* Rojo → Cancelado.

Los colores definitivos se definirán en el Design System.

---

# 9. Formularios

Todos los formularios seguirán la misma estructura.

Orden recomendado:

1. Información principal.
2. Información opcional.
3. Observaciones.
4. Acciones.

Se minimizará el número de campos obligatorios.

---

# 10. Botones

Todos los botones utilizarán componentes reutilizables.

Acciones principales:

* Guardar.
* Cancelar.
* Editar.
* Eliminar.
* Asignar.
* Confirmar.

No existirán botones con estilos individuales.

---

# 11. Listas operativas, filtros y tarjetas resumen

Las pantallas administrativas de ELARA Transport no deben comportarse como hojas Excel pesadas.

Se priorizan listas operativas con filas o tarjetas horizontales, pensadas para lectura rápida, densidad útil y toma de decisiones. La información crítica debe aparecer primero y las acciones deben quedar claras sin convertir la interfaz en una tabla pesada.

## 11.1. Listas operativas

Las listas principales deben usar filas o tarjetas horizontales siempre que sea posible.

Las cabeceras y las filas deben compartir la misma estructura de columnas.

No se deben usar márgenes mágicos, desplazamientos manuales o ajustes visuales a ojo para alinear columnas. La alineación debe resolverse desde una estructura común de layout.

Cada fila debe mostrar solo la información necesaria para decidir o actuar. La información ampliada debe ir en modales o pantallas de detalle.

## 11.2. Tarjetas resumen compactas

Las tarjetas resumen superiores deben ser compactas.

Regla general:

* Título a la izquierda.
* Número a la derecha.
* Sin tercera línea descriptiva salvo necesidad crítica.
* Altura reducida.
* Disposición horizontal en desktop.
* Grid responsive en móvil.

Las tarjetas resumen no deben ocupar más altura de la necesaria ni desplazar la lista principal fuera de la primera vista cuando pueda evitarse.

## 11.3. Filtros compactos

Los filtros deben ocupar poco espacio vertical.

Regla general:

* Buscar siempre visible.
* Un único botón/desplegable Filtro con opciones agrupadas.
* Evitar varios selectores grandes ocupando filas completas.
* Agrupar las opciones por categoría dentro del desplegable.

El patrón recomendado es:

* Buscar.
* Filtro.
  * Tipo.
  * Estado.
  * Asignación u otros criterios propios de la pantalla.

## 11.4. Leyendas integradas

Las leyendas deben integrarse en la toolbar del panel cuando exista espacio suficiente.

La distribución estándar de una toolbar de lista en desktop es:

* Izquierda: eyebrow del panel y título de la lista.
* Centro: leyenda compacta, si existe.
* Derecha: Buscar y botón Filtro.

La leyenda debe ser discreta, no debe superponerse con cabeceras o filas, y no debe ocupar una fila completa si puede evitarse.

Si una leyenda es larga, puede dividirse en grupos compactos, pero debe mantenerse dentro del patrón de toolbar.

## 11.5. Responsive

En móvil:

* Ocultar cabeceras si no caben.
* Convertir filas en tarjetas verticales si hace falta.
* Mantener Buscar y Filtro accesibles.
* Mantener la leyenda visible sin superponerla con el contenido.
* Evitar cualquier scroll horizontal.

---
# 12. Modales

Los modales solo se utilizarán para acciones rápidas.

Las operaciones complejas tendrán su propia pantalla.

---

# 13. Notificaciones

Las notificaciones deberán ser claras.

El usuario siempre debe entender:

* Qué ocurrió.
* Por qué ocurrió.
* Qué debe hacer ahora.

---

# 14. Responsive

La aplicación deberá funcionar correctamente en:

* Escritorio.
* Tablet.
* Móvil.

Cada interfaz se adaptará al dispositivo sin perder funcionalidad.

---

# 15. Identidad visual

Toda la interfaz deberá respetar la identidad gráfica de ELARA Transport.

Se utilizarán:

* Logo oficial.
* Colores corporativos.
* Tipografía corporativa.
* Iconografía consistente.

---

# 16. Principio final

La mejor interfaz será aquella que permita al usuario completar una tarea sin pensar en cómo funciona la aplicación.

El software debe adaptarse al usuario, nunca al contrario.
