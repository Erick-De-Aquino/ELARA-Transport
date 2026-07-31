/*
  Proyecto Atlas / ELARA Transport
  Archivo: users.mock.js
  Responsabilidad: usuarios mock para pruebas visuales de acceso por rol.
*/

"use strict";

window.ElaraUsersMock = [
  {
    id: "USR-001",
    firstName: "Erick",
    lastName: "De Aquino",
    name: "Erick De Aquino",
    email: "chofer@elara.test",
    password: "123456",
    roles: ["superadmin", "conductor"],
    defaultContext: "superadmin",
    activeContext: "superadmin",
    role: "superadmin",
    status: "activo",
    lastAccess: "Hoy 09:20",
    driverId: "col-001",
    protected: true,
    note: "Superadmin inicial y conductor interno",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  },
];
