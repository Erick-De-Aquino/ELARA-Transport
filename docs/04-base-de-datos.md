# ELARA Transport — Base de Datos

## Proyecto

**Nombre interno:** Proyecto Atlas
**Versión:** 0.1.0
**Estado:** Modelo inicial

---

# 1. Principio general

La base de datos deberá permitir operar ELARA Transport mediante reservas, servicios, colaboradores, vehículos, clientes, pagos, notificaciones e historial operativo.

El diseño debe permitir crecimiento sin rehacer la estructura principal.

---

# 2. Tecnología

La base de datos será gestionada con Supabase.

Se usará:

* Supabase Auth.
* PostgreSQL.
* Row Level Security.
* Políticas de acceso.
* Tablas relacionadas.
* Migraciones versionadas.

---

# 3. Tablas principales

## Usuarios y roles

```text
profiles
roles
user_roles
```

## Clientes y colaboradores

```text
customers
collaborators
vehicles
```

## Servicios

```text
services
service_passengers
service_stops
service_assignments
service_events
```

## Operación

```text
payments
notifications
reviews
```

---

# 4. profiles

Representa el perfil general de un usuario registrado.

Campos iniciales:

```text
id
auth_user_id
full_name
phone
email
avatar_url
status
created_at
updated_at
```

Un usuario podrá tener uno o varios roles.

---

# 5. roles

Define los roles disponibles en el sistema.

Roles iniciales:

```text
admin
customer
collaborator
```

---

# 6. user_roles

Relaciona usuarios con roles.

Permite que una misma persona sea, por ejemplo:

* Administrador.
* Colaborador.
* Cliente.

---

# 7. customers

Representa clientes que contratan servicios.

Campos iniciales:

```text
id
profile_id
customer_type
company_name
tax_id
notes
created_at
updated_at
```

El cliente puede ser persona natural o empresa.

---

# 8. collaborators

Representa conductores colaboradores.

Campos iniciales:

```text
id
profile_id
document_id
license_number
license_expiration
photo_url
status
notes
created_at
updated_at
```

Los colaboradores no son empleados.

---

# 9. vehicles

Representa vehículos propios o de colaboradores.

Campos iniciales:

```text
id
owner_profile_id
plate
brand
model
color
capacity
fuel_type
vehicle_type
photo_url
status
created_at
updated_at
```

Un vehículo podrá ser usado por distintos colaboradores.

---

# 10. services

Representa la reserva principal.

Campos iniciales:

```text
id
customer_id
service_type
status
scheduled_date
scheduled_time
origin_address
destination_address
passenger_count
luggage_notes
flight_number
payment_method
estimated_price
final_price
notes
created_by
created_at
updated_at
```

El servicio es la entidad central del sistema.

---

# 11. service_passengers

Representa pasajeros asociados a un servicio.

Campos iniciales:

```text
id
service_id
full_name
phone
email
notes
created_at
updated_at
```

Un pasajero no necesita ser usuario registrado.

---

# 12. service_stops

Representa paradas u objetivos del servicio.

Campos iniciales:

```text
id
service_id
stop_order
address
notes
created_at
updated_at
```

Un servicio podrá tener una o varias paradas.

---

# 13. service_assignments

Representa la asignación de colaborador y vehículo a un servicio.

Campos iniciales:

```text
id
service_id
collaborator_id
vehicle_id
assignment_status
accepted_at
rejected_at
created_at
updated_at
```

Un servicio podrá tener una o varias asignaciones.

---

# 14. service_events

Registra el historial operativo del servicio.

Campos iniciales:

```text
id
service_id
event_type
description
created_by
created_at
```

Ejemplos de eventos:

```text
service_created
service_updated
assignment_created
assignment_accepted
assignment_rejected
driver_on_way
driver_arrived
passenger_on_board
service_started
service_finished
service_cancelled
```

---

# 15. payments

Representa pagos asociados a servicios.

Campos iniciales:

```text
id
service_id
amount
payment_method
payment_status
paid_at
created_at
updated_at
```

Métodos iniciales:

```text
cash
card_terminal
```

Métodos futuros:

```text
online_card
bank_transfer
wallet
```

---

# 16. notifications

Registra notificaciones generadas por el sistema.

Campos iniciales:

```text
id
profile_id
service_id
channel
title
message
status
sent_at
created_at
```

Canales previstos:

```text
push
whatsapp
email
```

---

# 17. reviews

Representa valoraciones del servicio.

Campos iniciales:

```text
id
service_id
customer_id
collaborator_id
rating
comment
created_at
```

---

# 18. Estados iniciales del servicio

```text
draft
requested
pending_assignment
assigned
confirmed
driver_on_way
driver_arrived
passenger_on_board
in_progress
completed
cancelled
rescheduled
no_show
```

---

# 19. Estados iniciales de asignación

```text
pending
accepted
rejected
cancelled
completed
```

---

# 20. Principio final

La base de datos deberá registrar no solo el resultado final de cada servicio, sino también su evolución.

La trazabilidad será parte central del sistema.
