/*
  Proyecto Atlas / ELARA Transport
  Archivo: activity-log.mock.js
  Responsabilidad: registro central de eventos recientes de sesion.
*/

"use strict";

window.ElaraActivityLogMock = {
  events: [
    {
      eventId: "ACT-0001",
      eventType: "SERVICE_ASSIGNED",
      createdAt: "2026-07-21T06:05:00.000Z",
      actorType: "Administraci\u00f3n",
      actorId: "admin-001",
      actorName: "Erick",
      entityType: "Servicio",
      entityId: "SRV-0003",
      title: "Servicio asignado",
      description: "SRV-0003 fue asignado a Erick De Aquino.",
      metadata: {
        collaboratorId: "col-001",
      },
    },
    {
      eventId: "ACT-0002",
      eventType: "ASSIGNMENT_ACCEPTED",
      createdAt: "2026-07-21T06:12:00.000Z",
      actorType: "Conductor",
      actorId: "col-001",
      actorName: "Erick De Aquino",
      entityType: "Servicio",
      entityId: "SRV-0002",
      title: "Asignaci\u00f3n aceptada",
      description: "Erick De Aquino acept\u00f3 el servicio SRV-0002.",
      metadata: {},
    },
    {
      eventId: "ACT-0003",
      eventType: "SERVICE_STARTED",
      createdAt: "2026-07-21T06:25:00.000Z",
      actorType: "Conductor",
      actorId: "col-001",
      actorName: "Erick De Aquino",
      entityType: "Servicio",
      entityId: "SRV-0002",
      title: "Servicio iniciado",
      description: "Erick De Aquino inici\u00f3 SRV-0002.",
      metadata: {
        driverStage: "en_camino",
      },
    },
    {
      eventId: "ACT-0004",
      eventType: "SERVICE_FINALIZED",
      createdAt: "2026-07-20T10:48:00.000Z",
      actorType: "Conductor",
      actorId: "col-012",
      actorName: "Bruno Casta\u00f1o",
      entityType: "Servicio",
      entityId: "SRV-0007",
      title: "Servicio finalizado",
      description: "Bruno Casta\u00f1o finaliz\u00f3 SRV-0007.",
      metadata: {},
    },
    {
      eventId: "ACT-0005",
      eventType: "INCIDENT_RESOLVED",
      createdAt: "2026-07-20T17:05:00.000Z",
      actorType: "Administraci\u00f3n",
      actorId: "admin-001",
      actorName: "Erick",
      entityType: "Incidencia",
      entityId: "INC-OPR-0004",
      title: "Incidencia resuelta",
      description: "INC-OPR-0004 fue marcada como resuelta.",
      metadata: {},
    },
  ],
};

window.ElaraActivityLog = {
  addEvent(eventData = {}) {
    const events = window.ElaraActivityLogMock.events;
    const createdAt = eventData.createdAt || new Date().toISOString();
    const eventType = eventData.eventType || "";
    const entityId = eventData.entityId || "";
    const isDuplicate = events.some(
      (event) => event.eventType === eventType && event.entityId === entityId && event.createdAt === createdAt,
    );

    if (isDuplicate) {
      return null;
    }

    const nextEvent = {
      eventId: getNextElaraActivityEventId(),
      eventType,
      createdAt,
      actorType: eventData.actorType || "Sistema",
      actorId: eventData.actorId || "",
      actorName: eventData.actorName || "Sistema",
      entityType: eventData.entityType || "",
      entityId,
      title: eventData.title || "Actividad registrada",
      description: eventData.description || "",
      metadata: eventData.metadata || {},
    };

    events.unshift(nextEvent);
    events.sort((first, second) => getElaraActivityLogSortTime(second.createdAt) - getElaraActivityLogSortTime(first.createdAt));
    events.splice(100);
    window.dispatchEvent(createElaraActivityLogEvent(nextEvent));

    return nextEvent;
  },
};

function createElaraActivityLogEvent(eventData) {
  if (typeof CustomEvent === "function") {
    return new CustomEvent("elara:activity-updated", { detail: eventData });
  }

  const event = new Event("elara:activity-updated");
  event.detail = eventData;
  return event;
}

function getNextElaraActivityEventId() {
  const maxId = window.ElaraActivityLogMock.events.reduce((maxValue, event) => {
    const match = String(event.eventId || "").match(/^ACT-(\d+)$/);

    return match ? Math.max(maxValue, Number(match[1])) : maxValue;
  }, 0);

  return `ACT-${String(maxId + 1).padStart(4, "0")}`;
}

function getElaraActivityLogSortTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
