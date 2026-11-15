/*
  Proyecto Atlas / ELARA Transport
  Archivo: dashboard.js
  Responsabilidad: renderizado y logica del Dashboard administrador.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const dashboardData = window.ElaraDashboardMock;

const statusClassByName = {
  Pendiente: "status--warning",
  "Sin asignar": "status--warning",
  "Por asignar": "status--warning",
  "Por aceptar": "status--warning",
  "Reasignaci\u00f3n requerida": "status--warning",
  Confirmado: "status--success",
  "En curso": "status--info",
  Cancelado: "status--danger",
  "No realizado": "status--neutral",
};

const dashboardAlertLevelLabelByName = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

const DASHBOARD_CLOSED_SERVICE_STATUSES = ["Cancelado", "Finalizado", "No show", "No realizado"];
const DASHBOARD_INCIDENT_STATUSES = ["Pendiente", "En revisi\u00f3n", "Resuelta"];

let dashboardIncidentDetailId = "";
let dashboardIncidentHistoryQuery = "";
let dashboardReturnToIncidentHistory = false;
let isDashboardServicesUpdatedListenerRegistered = false;

// =========================
// Inicializacion y estado de vista
// =========================

function initDashboard() {
  // Operational view owns its read-only controls; do not initialize demo handlers.
  return;

  initDashboardAlertControls();
  initDashboardIncidentControls();
  initDashboardActivityLogControls();
  initDashboardServicesUpdatedControls();
  renderDashboard();
}

function initDashboardServicesUpdatedControls() {
  if (isDashboardServicesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:services-updated", renderDashboard);
  window.addEventListener("elara:collaborators-updated", renderDashboard);
  isDashboardServicesUpdatedListenerRegistered = true;
}

function showDashboard() {
  return showOperationalDashboard();

  renderDashboard();
  setText("page-eyebrow", "Centro de operaciones");
  setText("page-title", `Buenos días, ${dashboardData.administratorName}`);
  setText("page-summary", getDashboardDailySummary());
  setText("primary-action", "Nuevo servicio");
  setModalTarget("primary-action", "new-service-modal");
}

// =========================
// Render principal
// =========================

function renderDashboard() {
  const alerts = getDashboardAlerts();
  const dashboardView = getElement("dashboard");

  setText("alerts-count", String(alerts.length));
  if (dashboardView && !dashboardView.hidden) {
    setText("page-summary", getDashboardDailySummary());
  }
  renderSummaryCards();
  renderAlerts(alerts);
  renderUpcomingServices();
  renderIncidents();
  renderRecentActivity();
}

function renderSummaryCards() {
  const container = getElement("summary-cards");

  container.innerHTML = getDashboardMetrics()
    .map(
      (metric) => `
        <article class="summary-card summary-card--${metric.tone}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.detail)}</small>
        </article>
      `,
    )
    .join("");
}

function renderAlerts(alerts = getDashboardAlerts()) {
  const container = getElement("alerts-list");

  container.innerHTML = alerts
    .map(
      (alert) => `
        <section class="alert-item alert-item--${alert.level}">
          <div class="alert-item__marker" aria-hidden="true"></div>
          <div class="alert-item__content">
            <span class="alert-item__level">${escapeHtml(alert.levelLabel)}</span>
            <h3>${escapeHtml(alert.title)}</h3>
            <p>${escapeHtml(alert.description)}</p>
            ${renderDashboardDriverTypeChip(alert.driverTypeLabel, "alert-item__driver-type")}
          </div>
          ${renderDashboardAlertAction(alert)}
        </section>
      `,
    )
    .join("");
}

function renderDashboardAlertAction(alert) {
  if (!alert.targetType || !alert.targetId) {
    return "";
  }

  return `
    <button
      class="button button--compact"
      type="button"
      data-dashboard-alert-target="${escapeHtml(alert.targetType)}"
      data-dashboard-alert-id="${escapeHtml(alert.targetId)}"
    >${escapeHtml(alert.action)}</button>
  `;
}

function renderUpcomingServices() {
  const container = getElement("upcoming-services");

  container.innerHTML = getDashboardUpcomingServices()
    .map((service) => {
      const assignmentLabel = getDashboardServiceAssignmentLabel(service);
      const statusClass = statusClassByName[assignmentLabel] || "status--neutral";
      const collaborator = getDashboardServiceCollaboratorRecord(service);
      const collaboratorLabel = getDashboardServiceCollaborator(service, collaborator);
      const driverTypeChip = renderDashboardDriverTypeChip(getDashboardDriverType(collaborator));

      return `
        <section class="service-item">
          <div class="service-item__schedule">
            <span class="service-item__date">${escapeHtml(formatDashboardServiceDate(service))}</span>
            <time class="service-item__time" datetime="${escapeHtml(getDashboardServiceDateTimeValue(service))}">${escapeHtml(getDashboardServiceTime(service))}</time>
          </div>
          <div class="service-item__main">
            <h3>${escapeHtml(service.type)}</h3>
            <p>${escapeHtml(getDashboardServiceClientName(service))} | ${escapeHtml(getDashboardServiceIdentifier(service))}</p>
            <span class="service-item__assignment">
              <span>${escapeHtml(collaboratorLabel)}</span>
              ${driverTypeChip}
              <span>| ${escapeHtml(getDashboardServiceVehicle(service))}</span>
            </span>
          </div>
          <span class="status-pill ${statusClass}">${escapeHtml(assignmentLabel)}</span>
        </section>
      `;
    })
    .join("");
}

function renderIncidents() {
  const container = getElement("incidents-list");
  const incidents = getDashboardAdministrativeIncidents();

  renderDashboardIncidentPanelState();

  if (!incidents.length) {
    container.innerHTML = `<li class="incident-empty">Sin incidencias administrativas pendientes.</li>`;
    return;
  }

  container.innerHTML = incidents.map(renderDashboardOpenIncidentItem).join("");
}

function renderDashboardOpenIncidentItem(incident) {
  return `
        <li class="incident-item incident-item--${escapeHtml(incident.priority || "normal")}">
          <time>${escapeHtml(incident.time)}</time>
          <span class="incident-item__content">
            <strong>${escapeHtml(incident.reportedByType)} &middot; ${escapeHtml(incident.reportedByName)}</strong>
            <span class="incident-item__category">${escapeHtml(getDashboardIncidentDisplayCategory(incident))}</span>
            <span class="incident-item__id">${escapeHtml(incident.incidentId || incident.id || "Sin ID")}</span>
            <small>${escapeHtml(getDashboardIncidentPriorityLabel(incident.priority))} &middot; ${escapeHtml(incident.status || "Pendiente")}</small>
            ${renderDashboardIncidentAction(incident)}
          </span>
        </li>
      `;
}

function renderDashboardIncidentPanelState() {
  const heading = getElement("incidents-heading");
  const historyAction = getElement("incidents-history-action");

  if (heading) {
    heading.textContent = "Revisi\u00f3n administrativa";
  }

  if (historyAction) {
    historyAction.hidden = false;
  }
}

function renderDashboardIncidentHistoryModal() {
  const list = getElement("incidents-history-list");

  if (!list) {
    return;
  }

  const incidents = getDashboardResolvedIncidents();

  if (!incidents.length) {
    list.innerHTML = `<p class="incident-empty">No hay incidencias resueltas en el historial.</p>`;
    return;
  }

  list.innerHTML = `
    <div class="admin-incident-history-row admin-incident-history-row--head" aria-hidden="true">
      <span>Fecha</span>
      <span>Reportante</span>
      <span>Categor\u00eda</span>
      <span>Incidencia</span>
      <span>Prioridad</span>
      <span>Resuelta</span>
      <span>Acci\u00f3n</span>
    </div>
    ${incidents.map(renderDashboardIncidentHistoryRow).join("")}
  `;
}

function renderDashboardIncidentHistoryRow(incident) {
  return `
    <article class="admin-incident-history-row">
      <time>${escapeHtml(incident.time)}</time>
      <strong>${escapeHtml(incident.reportedByType)} &middot; ${escapeHtml(incident.reportedByName)}</strong>
      <span>${escapeHtml(getDashboardIncidentDisplayCategory(incident))}</span>
      <span class="incident-item__id">${escapeHtml(incident.incidentId || incident.id || "Sin ID")}</span>
      <small>${escapeHtml(getDashboardIncidentPriorityLabel(incident.priority))}</small>
      <span>${escapeHtml(formatDashboardIncidentDateTime(incident.resolvedAt))}</span>
      <button
        class="button button--compact button--muted"
        type="button"
        data-dashboard-incident-history-detail="${escapeHtml(incident.incidentId || "")}"
      >Ver detalle</button>
    </article>
  `;
}

function renderRecentActivity() {
  const container = getElement("recent-activity-list");
  const events = getDashboardRecentActivityEvents();

  if (!events.length) {
    container.innerHTML = `<li class="activity-empty">A\u00fan no hay actividad reciente.</li>`;
    return;
  }

  container.innerHTML = events
    .map(
      (event) => `
        <li class="recent-activity-item">
          <time>${escapeHtml(formatDashboardActivityTime(event.createdAt))}</time>
          <span>${escapeHtml(`${event.title}: ${getDashboardActivityDescription(event)}`)}</span>
        </li>
      `,
    )
    .join("");
}

// =========================
// Datos derivados
// =========================

function getDashboardMetrics() {
  const services = getDashboardServices();
  const collaborators = getDashboardCollaborators();
  const referenceDate = getDashboardReferenceDate();
  const activeServices = getDashboardActiveServices(services);
  const activeServicesToday = activeServices.filter((service) => isDashboardSameDate(service.date, referenceDate));
  const servicesInProgress = activeServices.filter((service) => getDashboardServiceStatus(service) === "En curso");
  const availableDrivers = collaborators.filter(
    (collaborator) => getDashboardCollaboratorCapacityType(collaborator) === "Chofer" && isDashboardCollaboratorAvailableForCapacity(collaborator),
  );
  const driversInService = collaborators.filter(
    (collaborator) => getDashboardCollaboratorCapacityType(collaborator) === "Chofer" && isDashboardCollaboratorInService(collaborator),
  );
  const availableExternalCollaborators = collaborators.filter(
    (collaborator) => getDashboardCollaboratorCapacityType(collaborator) === "Colaborador" && isDashboardCollaboratorAvailableForCapacity(collaborator),
  );
  const externalCollaboratorsInService = collaborators.filter(
    (collaborator) => getDashboardCollaboratorCapacityType(collaborator) === "Colaborador" && isDashboardCollaboratorInService(collaborator),
  );

  return [
    {
      label: "Servicios hoy",
      value: String(activeServicesToday.length),
      detail: "Agenda operativa del día",
      tone: "neutral",
    },
    {
      label: "Servicios en curso",
      value: String(servicesInProgress.length),
      detail: "Seguimiento activo",
      tone: "info",
    },
    {
      label: "Ch\u00f3feres disponibles",
      value: String(availableDrivers.length),
      detail: "Capacidad interna",
      tone: "success",
    },
    {
      label: "Ch\u00f3feres en servicio",
      value: String(driversInService.length),
      detail: "Operacion interna",
      tone: "info",
    },
    {
      label: "Col. disponibles",
      value: String(availableExternalCollaborators.length),
      detail: "Capacidad externa",
      tone: "success",
    },
    {
      label: "Col. en servicio",
      value: String(externalCollaboratorsInService.length),
      detail: "Operacion externa",
      tone: "info",
    },
  ];
}

function getDashboardAlerts() {
  const alertsByKey = new Map();

  getDashboardServicesForOperationalAlerts().forEach((service) => {
    const alert = getDashboardServiceAlert(service);

    if (alert) {
      alertsByKey.set(getDashboardAlertKey(alert), alert);
    }
  });

  return Array.from(alertsByKey.values())
    .sort(compareDashboardAlerts)
    .slice(0, 8);
}

function getDashboardAlertKey(alert) {
  return `${alert.targetId || alert.serviceId || ""}:${alert.alertType || "operational"}`;
}

function compareDashboardAlerts(first, second) {
  const levelPriority = {
    critical: 10,
    medium: 20,
    low: 30,
    normal: 40,
  };
  const firstPriority = Number.isFinite(first.sortPriority) ? first.sortPriority : levelPriority[first.level] || 50;
  const secondPriority = Number.isFinite(second.sortPriority) ? second.sortPriority : levelPriority[second.level] || 50;

  if (firstPriority !== secondPriority) {
    return firstPriority - secondPriority;
  }

  const firstTimestamp = Number.isFinite(first.sortTimestamp) ? first.sortTimestamp : Number.MAX_SAFE_INTEGER;
  const secondTimestamp = Number.isFinite(second.sortTimestamp) ? second.sortTimestamp : Number.MAX_SAFE_INTEGER;

  if (firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }

  return String(first.serviceId || first.targetId || "").localeCompare(String(second.serviceId || second.targetId || ""));
}

function getDashboardAdministrativeIncidents() {
  const reportedIncidents = window.ElaraAdminIncidentsMock?.incidents;

  if (!Array.isArray(reportedIncidents)) {
    return getDashboardFallbackIncidents();
  }

  return reportedIncidents
    .filter((incident) => normalizeDashboardText(incident.status) !== "resuelta")
    .filter(deduplicateDashboardIncidentById)
    .map(normalizeDashboardReportedIncident)
    .sort(compareDashboardAdministrativeIncidents)
    .slice(0, 10);
}

function getDashboardResolvedIncidents() {
  const reportedIncidents = window.ElaraAdminIncidentsMock?.incidents;

  if (!Array.isArray(reportedIncidents)) {
    return [];
  }

  const searchQuery = normalizeDashboardText(dashboardIncidentHistoryQuery);

  return reportedIncidents
    .filter((incident) => normalizeDashboardText(incident.status) === "resuelta")
    .filter(deduplicateDashboardIncidentById)
    .map(normalizeDashboardReportedIncident)
    .filter((incident) => !searchQuery || getDashboardIncidentSearchText(incident).includes(searchQuery))
    .sort(compareDashboardResolvedIncidents);
}

function deduplicateDashboardIncidentById(incident, index, incidents) {
  const incidentId = incident?.incidentId || incident?.id || "";

  if (!incidentId) {
    return true;
  }

  return incidents.findIndex((item) => (item?.incidentId || item?.id || "") === incidentId) === index;
}

function getDashboardRecentActivityEvents() {
  const events = window.ElaraActivityLogMock?.events;

  if (!Array.isArray(events)) {
    return (dashboardData.followUps || [])
      .map((event) => ({
        createdAt: "",
        title: event.title || "Actividad",
        description: event.description || "",
        entityId: "",
      }))
      .slice(0, 12);
  }

  return events
    .slice()
    .sort((first, second) => getDashboardActivitySortTime(second.createdAt) - getDashboardActivitySortTime(first.createdAt))
    .slice(0, 12);
}

function normalizeDashboardReportedIncident(incident) {
  const createdAt = parseDashboardDateTime(incident.createdAt);
  const priority = normalizeDashboardIncidentPriority(incident.priority);

  return {
    ...incident,
    priority,
    status: incident.status || "Pendiente",
    time: formatDashboardIncidentTime(createdAt),
    dateValue: createdAt || getDashboardReferenceDate(),
    categoryLabel: incident.categoryLabel || getDashboardIncidentCategoryLabel(incident.category),
    targetType: "incident",
    targetId: incident.incidentId || incident.id,
    action: "Ver incidencia",
  };
}

function compareDashboardAdministrativeIncidents(first, second) {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const severityDiff = (severityOrder[first.priority] ?? 3) - (severityOrder[second.priority] ?? 3);

  if (severityDiff) {
    return severityDiff;
  }

  return getDashboardIncidentSortTime(second.dateValue) - getDashboardIncidentSortTime(first.dateValue);
}

function compareDashboardResolvedIncidents(first, second) {
  const secondResolvedAt = parseDashboardDateTime(second.resolvedAt);
  const firstResolvedAt = parseDashboardDateTime(first.resolvedAt);

  return getDashboardIncidentSortTime(secondResolvedAt || second.dateValue) - getDashboardIncidentSortTime(firstResolvedAt || first.dateValue);
}

function getDashboardIncidentSearchText(incident) {
  return normalizeDashboardText(
    [
      incident.incidentId,
      incident.reportedByName,
      incident.involvedName,
      getDashboardIncidentDisplayCategory(incident),
      incident.category,
      incident.serviceId,
    ].join(" "),
  );
}

function getDashboardFallbackIncidents() {
  return (dashboardData.incidents || []).slice(0, 10).map((incident) => {
    return {
      incidentId: incident.id,
      time: incident.time,
      reportedByType: "Cliente",
      reportedById: incident.customerCode || "",
      reportedByName: incident.title || incident.type || incident.id,
      involvedType: "",
      involvedId: "",
      involvedName: "",
      createdAt: "",
      subject: incident.title || incident.type || "Incidencia administrativa",
      message: incident.description || "",
      category: incident.type || "Revisi\u00f3n",
      categoryLabel: incident.type || "Revisi\u00f3n",
      priority: incident.severity || "medium",
      status: incident.status || "Pendiente",
      serviceId: incident.serviceId || "",
      resolutionNote: incident.notes || "",
      targetType: "incident",
      targetId: incident.id,
      action: "Ver incidencia",
    };
  });
}

function getDashboardUpcomingServices() {
  const referenceDate = getDashboardReferenceDate();

  return getDashboardActiveServices()
    .filter((service) => getDashboardServiceDateTime(service) >= referenceDate)
    .sort((first, second) => getDashboardServiceDateTime(first) - getDashboardServiceDateTime(second))
    .slice(0, 4);
}

function getDashboardServicesForOperationalAlerts() {
  const services = [...getDashboardUpcomingServices()];

  getDashboardActiveServices()
    .filter(isDashboardServiceOverdueToday)
    .forEach((service) => {
      if (!services.some((candidate) => candidate.serviceId === service.serviceId)) {
        services.unshift(service);
      }
    });

  getDashboardServicesWithPortalAccessRisk().forEach((service) => {
    if (!services.some((candidate) => getDashboardServiceIdentifier(candidate) === getDashboardServiceIdentifier(service))) {
      services.push(service);
    }
  });

  getDashboardActiveServices()
    .filter(shouldDashboardServiceRaiseMissingPriceOperationalAlert)
    .forEach((service) => {
      if (!services.some((candidate) => getDashboardServiceIdentifier(candidate) === getDashboardServiceIdentifier(service))) {
        services.push(service);
      }
    });

  return services;
}

function getDashboardServiceAlert(service) {
  if (isDashboardServiceOverdueToday(service)) {
    return {
      level: "critical",
      levelLabel: dashboardAlertLevelLabelByName.critical,
      title: `${service.serviceId} atrasado`,
      description: `${getDashboardServiceClientName(service)} mantiene un servicio ${getDashboardServiceAssignmentLabel(service).toLowerCase()} con hora vencida.`,
      action: getDashboardServiceCollaboratorId(service) ? "Ver servicio" : "Asignar conductor",
      targetType: getDashboardServiceCollaboratorId(service) ? "service" : "service-assignment",
      targetId: service.serviceId,
    };
  }

  if (service.requiresReassignment) {
    return {
      level: "critical",
      levelLabel: dashboardAlertLevelLabelByName.critical,
      title: `${service.serviceId} requiere reasignaci\u00f3n`,
      description: service.unassignedReason || "El servicio necesita un nuevo conductor.",
      action: "Asignar conductor",
      targetType: "service-assignment",
      targetId: service.serviceId,
    };
  }

  if (!getDashboardServiceCollaboratorId(service)) {
    return {
      level: "critical",
      levelLabel: dashboardAlertLevelLabelByName.critical,
      title: `${service.serviceId} por asignar`,
      description: `${getDashboardServiceClientName(service)} necesita asignación para las ${service.time}.`,
      action: "Asignar conductor",
      targetType: "service-assignment",
      targetId: service.serviceId,
    };
  }

  const portalAccessAlert = getDashboardServicePortalAccessAlert(service);

  if (portalAccessAlert) {
    return portalAccessAlert;
  }

  if (getDashboardServiceAssignmentStatus(service) === "Pendiente") {
    return {
      level: "medium",
      levelLabel: dashboardAlertLevelLabelByName.medium,
      title: `${service.serviceId} por aceptar`,
      description: `${getDashboardServiceCollaborator(service)} aún no aceptó el servicio de las ${service.time}.`,
      driverTypeLabel: getDashboardDriverType(getDashboardServiceCollaboratorRecord(service)),
      action: "Revisar asignación",
      targetType: "service-assignment",
      targetId: service.serviceId,
    };
  }

  if (shouldDashboardServiceRaiseMissingPriceOperationalAlert(service)) {
    return {
      level: "medium",
      levelLabel: dashboardAlertLevelLabelByName.medium,
      title: "Servicio pr\u00f3ximo bloqueado",
      description: `${getDashboardServiceIdentifier(service)} no puede iniciarse porque Administraci\u00f3n a\u00fan no complet\u00f3 sus datos obligatorios.`,
      action: "Ver servicio",
      targetType: "service",
      targetId: getDashboardServiceIdentifier(service),
      alertType: "operational-missing-required-data",
      sortPriority: 24,
    };
  }

  if (hasDashboardServiceMissingOperationalData(service)) {
    return {
      level: "medium",
      levelLabel: dashboardAlertLevelLabelByName.medium,
      title: `${service.serviceId} con datos incompletos`,
      description: "Faltan datos operativos imprescindibles para el seguimiento del servicio.",
      action: "Ver servicio",
      targetType: "service",
      targetId: service.serviceId,
    };
  }

  return null;
}

function shouldDashboardServiceRaiseMissingPriceOperationalAlert(service) {
  const summary = getDashboardServiceFinancialSummary(service);
  const displayStatus = getDashboardServiceAssignmentLabel(service);

  if (displayStatus !== "Confirmado" || summary.paymentStatus !== "Sin definir" || isDashboardClosedService(service)) {
    return false;
  }

  return isDashboardServiceWithinMissingPriceOperationalWindow(service);
}

function isDashboardServiceWithinMissingPriceOperationalWindow(service) {
  const serviceDateTime = getDashboardServiceDateTime(service);
  const referenceDate = getDashboardReferenceDate();
  const windowEnd = new Date(referenceDate.getTime());

  windowEnd.setHours(windowEnd.getHours() + 24);

  return serviceDateTime >= referenceDate && serviceDateTime <= windowEnd;
}

function getDashboardServicesWithPortalAccessRisk() {
  return getDashboardActiveServices().filter((service) => Boolean(getDashboardServicePortalAccessRisk(service)));
}

function getDashboardServicePortalAccessAlert(service) {
  const portalRisk = getDashboardServicePortalAccessRisk(service);

  if (!portalRisk) {
    return null;
  }

  const { collaborator, access } = portalRisk;
  const serviceId = getDashboardServiceIdentifier(service);
  const serviceDateTime = getDashboardServiceDateTime(service);
  const isInProgress = getDashboardServiceStatus(service) === "En curso";
  const startsSoon = !isInProgress && serviceDateTime.getTime() - Date.now() <= 2 * 60 * 60 * 1000;
  const isCritical = isInProgress || startsSoon;
  const accessDescription =
    access.status === "inactive"
      ? `El servicio ${serviceId} est\u00e1 asignado a ${collaborator.name}, pero su usuario est\u00e1 inactivo.`
      : `El servicio ${serviceId} est\u00e1 asignado a ${collaborator.name}, pero no tiene un usuario activo vinculado.`;

  return {
    level: isCritical ? "critical" : "medium",
    levelLabel: isCritical ? dashboardAlertLevelLabelByName.critical : dashboardAlertLevelLabelByName.medium,
    title: "Conductor sin acceso al Portal",
    description: `${accessDescription} La asignaci\u00f3n debe comunicarse por otro medio. ${serviceId} · ${getDashboardServiceDetailDateTime(
      service,
    )} · ${collaborator.name} · ${getDashboardDriverType(collaborator)} · ${access.label} · ${getDashboardServiceAssignmentLabel(service)}.`,
    driverTypeLabel: getDashboardDriverType(collaborator),
    action: isInProgress ? "Revisar servicio" : "Revisar asignaci\u00f3n",
    targetType: isInProgress ? "service" : "service-assignment",
    targetId: serviceId,
    serviceId,
    sortPriority: isInProgress ? 0 : isCritical ? 1 : 21,
    sortTimestamp: serviceDateTime.getTime(),
  };
}

function getDashboardServicePortalAccessRisk(service) {
  const collaboratorId = getDashboardServiceCollaboratorId(service);

  if (!collaboratorId || isDashboardClosedService(service) || isDashboardServiceOverdueToday(service)) {
    return null;
  }

  const status = getDashboardServiceStatus(service);
  const serviceDateTime = getDashboardServiceDateTime(service);

  if (status !== "En curso" && serviceDateTime.getTime() < getDashboardReferenceDate().getTime()) {
    return null;
  }

  const collaborator = getDashboardServiceCollaboratorRecord(service);

  if (!collaborator) {
    return null;
  }

  const access = getDashboardCollaboratorPortalAccessStatus(collaboratorId);

  if (!access || access.status === "active") {
    return null;
  }

  return { collaborator, access };
}

function getDashboardCollaboratorPortalAccessStatus(collaboratorId) {
  const collaboratorApi = window.ElaraCollaborators;

  if (!collaboratorApi || typeof collaboratorApi.getCollaboratorPortalAccessStatus !== "function") {
    console.error("[ELARA] No se pudo verificar el acceso al Portal del conductor en Dashboard:", collaboratorId);
    return null;
  }

  const access = collaboratorApi.getCollaboratorPortalAccessStatus(collaboratorId);

  if (!access || !["active", "inactive", "none"].includes(access.status)) {
    console.error("[ELARA] Estado de acceso al Portal no reconocido en Dashboard:", collaboratorId, access);
    return null;
  }

  return access;
}

function isDashboardServiceOverdueToday(service) {
  const status = getDashboardServiceStatus(service);
  const serviceDateTime = getDashboardServiceDateTime(service);
  const now = new Date();

  return (
    ["Pendiente", "Confirmado"].includes(status) &&
    isDashboardSameDate(service.date, now) &&
    serviceDateTime.getTime() < now.getTime()
  );
}

function getDashboardDailySummary() {
  const services = getDashboardActiveServices();
  const referenceDate = getDashboardReferenceDate();
  const servicesToday = services.filter((service) => isDashboardSameDate(service.date, referenceDate));
  const inProgress = servicesToday.filter((service) => getDashboardServiceStatus(service) === "En curso").length;
  const unassigned = servicesToday.filter((service) => getDashboardServiceAssignmentLabel(service) === "Por asignar").length;
  const pendingAcceptance = servicesToday.filter((service) => getDashboardServiceAssignmentLabel(service) === "Por aceptar").length;
  const summarySegments = [
    inProgress ? `${inProgress} en curso` : "",
    unassigned ? `${unassigned} por asignar` : "",
    pendingAcceptance ? `${pendingAcceptance} por aceptar` : "",
  ].filter(Boolean);
  const detail =
    summarySegments.length > 1
      ? `, ${summarySegments.slice(0, -1).join(", ")} y ${summarySegments[summarySegments.length - 1]}`
      : summarySegments.length
        ? `, ${summarySegments[0]}`
        : "";

  return `Hoy tienes ${servicesToday.length} servicios programados${detail}.`;
}

// =========================
// Fuentes canonicas
// =========================

function getDashboardServices() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }

  return window.ElaraServicesMock?.services || [];
}

function getDashboardActiveServices(services = getDashboardServices()) {
  return services.filter((service) => !isDashboardClosedService(service));
}

function getDashboardCollaborators() {
  if (window.ElaraCollaborators && typeof window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses === "function") {
    window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses();
  }

  return window.ElaraCollaboratorsMock?.collaborators || [];
}

function getDashboardVehicles() {
  return window.ElaraVehiclesMock?.vehicles || [];
}

function getDashboardCustomers() {
  return window.ElaraCustomersMock?.customers || [];
}

// =========================
// Utilidades de dominio
// =========================

function renderDashboardIncidentAction(incident) {
  if (!incident.targetType || !incident.targetId || !incident.action) {
    return "";
  }

  return `
    <button
      class="button button--compact button--muted incident-item__action"
      type="button"
      data-dashboard-incident-target="${escapeHtml(incident.targetType)}"
      data-dashboard-incident-id="${escapeHtml(incident.targetId)}"
    >${escapeHtml(incident.action)}</button>
  `;
}

function getDashboardIncidentExcerpt(message) {
  const text = String(message || "El reportante no a\u00f1adi\u00f3 un mensaje.").trim();

  return text.length > 92 ? `${text.slice(0, 89).trim()}...` : text;
}

function getDashboardIncidentPriorityLabel(priority) {
  const labelByPriority = {
    critical: "Crítica",
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };

  return labelByPriority[priority] || "Media";
}

function normalizeDashboardIncidentPriority(priority) {
  const normalizedPriority = normalizeDashboardText(priority);

  if (normalizedPriority === "critica" || normalizedPriority === "critical") {
    return "critical";
  }

  if (normalizedPriority === "alta" || normalizedPriority === "alto" || normalizedPriority === "high") {
    return "high";
  }

  if (normalizedPriority === "baja" || normalizedPriority === "bajo" || normalizedPriority === "low") {
    return "low";
  }

  return "medium";
}

function getDashboardIncidentCategoryLabel(category) {
  const labelByCategory = {
    CONDUCCION_AGRESIVA: "Conducci\u00f3n agresiva",
    CONDUCCION_ERRATICA: "Conducci\u00f3n err\u00e1tica",
    TRATO_INADECUADO: "Trato inadecuado",
    RETRASO_INJUSTIFICADO: "Retraso injustificado",
    CLIENTE_CONDUCTA_INADECUADA: "Conducta inadecuada del cliente",
    CLIENTE_DANOS_VEHICULO: "Da\u00f1os del cliente en el veh\u00edculo",
    CLIENTE_SUCIO_VEHICULO: "Suciedad causada por el cliente",
    INCUMPLIMIENTO_NORMAS: "Incumplimiento de normas",
    OBJETO_OLVIDADO: "Objeto olvidado",
    DISCREPANCIA_SERVICIO: "Discrepancia del servicio",
    INCIDENTE_SEGURIDAD: "Incidente de seguridad",
    FINANCIAL_COLLECTION: "Cobro de servicio",
    OTRO: "Otro",
  };

  return labelByCategory[category] || category || "No indicada";
}

function getDashboardReferenceDate() {
  return getDashboardDateFromDateKey(getDashboardOperationalDateKey());
}

function getDashboardOperationalDateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return getDashboardOperationalDateKey(new Date());
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDashboardDateFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((part) => Number(part));
  const parsedDate = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
}

function isDashboardClosedService(service) {
  return DASHBOARD_CLOSED_SERVICE_STATUSES.includes(getDashboardServiceStatus(service));
}

function getDashboardServiceStatus(service) {
  const normalizedStatus = normalizeDashboardText(service?.status);
  const statusByNormalizedName = {
    cancelado: "Cancelado",
    finalizado: "Finalizado",
    "no show": "No show",
    "no-show": "No show",
    "no realizado": "No realizado",
    "no-realizado": "No realizado",
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    "en curso": "En curso",
  };

  return statusByNormalizedName[normalizedStatus] || service?.status || "";
}

function normalizeDashboardText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getDashboardServiceDateTime(service) {
  const dateParts = getDashboardServiceDateParts(service?.date);
  const [hours, minutes] = String(service?.time || "00:00").split(":").map((part) => Number(part));

  if (!dateParts) {
    return getDashboardReferenceDate();
  }

  const { day, month, year } = dateParts;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));

  return Number.isNaN(parsedDate.getTime()) ? getDashboardReferenceDate() : parsedDate;
}

function formatDashboardServiceSchedule(service) {
  const serviceDateTime = getDashboardServiceDateTime(service);
  const time = String(service?.time || "").trim();

  if (!serviceDateTime || Number.isNaN(serviceDateTime.getTime()) || !service?.date) {
    return time || "Sin hora";
  }

  const dateLabel = formatDashboardServiceDateLabel(serviceDateTime);

  return time ? `${dateLabel} · ${time}` : dateLabel;
}

function formatDashboardServiceDate(service) {
  const serviceDateTime = getDashboardServiceDateTime(service);

  if (!serviceDateTime || Number.isNaN(serviceDateTime.getTime()) || !service?.date) {
    return "Sin fecha";
  }

  return formatDashboardServiceDateLabel(serviceDateTime);
}

function getDashboardServiceTime(service) {
  return String(service?.time || "").trim() || "Sin hora";
}

function formatDashboardServiceDateLabel(serviceDate) {
  const referenceDate = getDashboardReferenceDate();
  const serviceDay = getDashboardStartOfDay(serviceDate).getTime();
  const referenceDay = getDashboardStartOfDay(referenceDate).getTime();
  const dayDiff = Math.round((serviceDay - referenceDay) / 86400000);
  const day = serviceDate.getDate();
  const month = serviceDate.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");

  if (dayDiff === 0) {
    return `Hoy, ${day} ${month}`;
  }

  if (dayDiff === 1) {
    return `Ma\u00f1ana, ${day} ${month}`;
  }

  const weekday = serviceDate.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

  return `${capitalizeDashboardDateLabel(weekday)}, ${day} ${month}`;
}

function getDashboardStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function capitalizeDashboardDateLabel(value) {
  const text = String(value || "");

  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function getDashboardServiceDateTimeValue(service) {
  const serviceDateTime = getDashboardServiceDateTime(service);

  if (!serviceDateTime || Number.isNaN(serviceDateTime.getTime())) {
    return "";
  }

  const year = serviceDateTime.getFullYear();
  const month = String(serviceDateTime.getMonth() + 1).padStart(2, "0");
  const day = String(serviceDateTime.getDate()).padStart(2, "0");
  const hours = String(serviceDateTime.getHours()).padStart(2, "0");
  const minutes = String(serviceDateTime.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isDashboardSameDate(dateValue, referenceDate) {
  const serviceDate = getDashboardServiceDateTime({ date: dateValue, time: "00:00" });

  return (
    serviceDate.getFullYear() === referenceDate.getFullYear() &&
    serviceDate.getMonth() === referenceDate.getMonth() &&
    serviceDate.getDate() === referenceDate.getDate()
  );
}

function getDashboardServiceDateParts(dateValue) {
  const rawDate = String(dateValue || "").trim();
  let match = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

  return null;
}

function getDashboardServiceClientName(service) {
  const customer = getDashboardCustomers().find((item) => item.code === service.customerCode);

  if (!customer) {
    return service.client || "Cliente sin identificar";
  }

  if (customer.type === "Empresa") {
    return customer.tradeName || customer.company || customer.name || service.client;
  }

  return customer.name || service.client;
}

function getDashboardServiceCollaborator(service, resolvedCollaborator = getDashboardServiceCollaboratorRecord(service)) {
  return resolvedCollaborator?.name || service.collaborator || "Sin asignar";
}

function getDashboardServiceIdentifier(service) {
  return service.serviceId || service.id || "Servicio sin ID";
}

function getDashboardServiceDetailDateTime(service) {
  return `${service.date || "Sin fecha"} ${service.time || "Sin hora"}`.trim();
}

function getDashboardServiceCollaboratorRecord(service) {
  const collaboratorId = getDashboardServiceCollaboratorId(service);

  return getDashboardCollaborators().find((item) => item.id === collaboratorId) || null;
}

function getDashboardServiceCollaboratorId(service) {
  return service.collaboratorId || service.assignedCollaboratorId || service.driverId || "";
}

function getDashboardDriverType(collaborator) {
  if (!collaborator) {
    return "";
  }

  return collaborator.driverType === "Chofer" ? "Chofer" : "Colaborador";
}

function getDashboardCollaboratorOperationalStatus(collaborator) {
  if (
    collaborator?.id &&
    window.ElaraCollaborators &&
    typeof window.ElaraCollaborators.hasCollaboratorServiceInProgress === "function" &&
    window.ElaraCollaborators.hasCollaboratorServiceInProgress(collaborator.id)
  ) {
    return "En servicio";
  }

  return collaborator?.operationalStatus || collaborator?.availability || "No disponible";
}

function getDashboardCollaboratorCapacityType(collaborator) {
  return getDashboardDriverType(collaborator);
}

function isDashboardCollaboratorAvailableForCapacity(collaborator) {
  return (
    isDashboardCollaboratorAdministrativelyActive(collaborator) &&
    getDashboardCollaboratorOperationalStatus(collaborator) === "Disponible" &&
    !isDashboardCollaboratorInService(collaborator)
  );
}

function isDashboardCollaboratorInService(collaborator) {
  return Boolean(
    collaborator?.id &&
      window.ElaraCollaborators &&
      typeof window.ElaraCollaborators.hasCollaboratorServiceInProgress === "function" &&
      window.ElaraCollaborators.hasCollaboratorServiceInProgress(collaborator.id),
  );
}

function isDashboardCollaboratorAdministrativelyActive(collaborator) {
  return collaborator?.administrativeStatus === "Activo";
}

function renderDashboardDriverTypeChip(driverType, extraClass = "") {
  if (!driverType) {
    return "";
  }

  return `<span class="dashboard-driver-type ${escapeHtml(extraClass)}">${escapeHtml(driverType)}</span>`;
}

function getDashboardServiceAssignmentLabel(service) {
  const getDisplayStatus = window.ElaraServices?.getServiceDisplayStatus || ((serviceItem) => getDashboardServiceStatus(serviceItem));

  return getDisplayStatus(service);
}

function getDashboardServiceAssignmentStatus(service) {
  return service.assignmentStatus === "Aceptado" ? "Aceptado" : "Pendiente";
}

function getDashboardServiceFinancialSummary(service) {
  if (window.ElaraServices && typeof window.ElaraServices.calculateServiceFinancialSummary === "function") {
    return window.ElaraServices.calculateServiceFinancialSummary(service);
  }

  const financial = service?.financial || {};

  return {
    basePrice: financial.basePrice ?? null,
    totalPrice: financial.totalPrice ?? null,
    paymentStatus: financial.paymentStatus || "Sin definir",
    paidAmount: financial.paidAmount || 0,
    pendingAmount: financial.pendingAmount || 0,
  };
}

function getDashboardServiceVehicle(service) {
  const vehicle = getDashboardVehicles().find((item) => item.id === service.vehicleId);

  return vehicle ? `${vehicle.brand} ${vehicle.model}` : service.vehicle || "Pendiente";
}

function hasDashboardServiceMissingOperationalData(service) {
  return !service.date || !service.time || !service.customerCode || !service.origin || !service.destination;
}

function getDashboardPassengerLabel(service) {
  return service.passengerName && service.passengerName !== getDashboardServiceClientName(service) ? service.passengerName : "1 pasajero";
}

function openDashboardIncidentDetail(incidentId) {
  const incident = getDashboardIncidentById(incidentId);
  const modal = getElement("admin-incident-detail-modal");

  if (!incident || !modal) {
    return;
  }

  dashboardIncidentDetailId = incident.incidentId || incident.id || incidentId;
  setText("admin-incident-detail-title", incident.subject || "Detalle de incidencia");
  setText("admin-incident-id", incident.incidentId || incident.id || "Sin ID");
  setText("admin-incident-reporter", `${incident.reportedByType || "Reportante"} · ${incident.reportedByName || "No indicado"}`);
  setText("admin-incident-involved", getDashboardIncidentInvolvedLabel(incident));
  setText("admin-incident-date", formatDashboardIncidentDateTime(incident.createdAt));
  setText("admin-incident-category", getDashboardIncidentDisplayCategory(incident));
  setText("admin-incident-priority", getDashboardIncidentPriorityLabel(incident.priority));
  setText("admin-incident-status", incident.status || "Pendiente");
  setText("admin-incident-service", incident.serviceId || "No indicado");
  setText("admin-incident-vehicle", getDashboardIncidentVehicleLabel(incident));
  setText("admin-incident-subject", incident.subject || "No indicado");
  setText("admin-incident-message", getDashboardIncidentMessage(incident));
  renderDashboardIncidentFinancialDetail(incident);
  setText("admin-incident-resolution", incident.resolutionNote || "No indicada");
  setText("admin-incident-resolved-at", incident.resolvedAt ? formatDashboardIncidentDateTime(incident.resolvedAt) : "No indicada");
  configureDashboardIncidentRelatedAction(incident);
  configureDashboardIncidentManageAction(incident);
  exitDashboardIncidentManagement();

  modal.hidden = false;
}

function renderDashboardIncidentFinancialDetail(incident) {
  const container = getElement("admin-incident-financial-summary");
  const detail = getElement("admin-incident-financial-detail");

  if (!container || !detail) {
    return;
  }

  const lines = getDashboardIncidentFinancialDetailLines(incident);

  if (!lines.length) {
    container.hidden = true;
    detail.textContent = "";
    return;
  }

  detail.innerHTML = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  container.hidden = false;
}

function getDashboardIncidentFinancialDetailLines(incident) {
  if (incident?.category !== "FINANCIAL_COLLECTION") {
    return [];
  }

  const lines = [
    `Total del servicio: ${formatDashboardIncidentMoney(incident.totalAmount)}`,
    `Pagado previamente: ${formatDashboardIncidentMoney(incident.previouslyPaidAmount)}`,
    `Cobrado al cierre: ${formatDashboardIncidentMoney(incident.collectedAtClosingAmount)}`,
    `Saldo pendiente: ${formatDashboardIncidentMoney(incident.remainingAmount)}`,
  ];

  if (incident.reason) {
    lines.push(`Motivo: ${incident.reason}`);
  }

  if (String(incident.notes || "").trim()) {
    lines.push(`Observaciones: ${String(incident.notes).trim()}`);
  }

  return lines;
}

function formatDashboardIncidentMoney(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return `${safeAmount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function getDashboardIncidentById(incidentId) {
  const incidents = window.ElaraAdminIncidentsMock?.incidents;

  if (Array.isArray(incidents)) {
    return incidents.find((incident) => incident.incidentId === incidentId || incident.id === incidentId) || null;
  }

  return getDashboardFallbackIncidents().find((incident) => incident.incidentId === incidentId) || null;
}

function getDashboardIncidentMessage(incident) {
  const message = String(incident?.message || "").trim();

  return message || "El reportante no a\u00f1adi\u00f3 un mensaje.";
}

function getDashboardIncidentDisplayCategory(incident) {
  return incident?.categoryLabel || getDashboardIncidentCategoryLabel(incident?.category);
}

function getDashboardIncidentInvolvedLabel(incident) {
  if (!incident.involvedName) {
    return "No indicada";
  }

  return incident.involvedName;
}

function getDashboardIncidentVehicleLabel(incident) {
  if (!incident.serviceId) {
    return "No aplica";
  }

  const service = getDashboardServices().find((item) => item.serviceId === incident.serviceId);

  if (!service || (!service.vehicle && !service.plate)) {
    return "No indicado";
  }

  return [service.vehicle, service.plate].filter(Boolean).join(" · ");
}

function configureDashboardIncidentRelatedAction(incident) {
  const action = getElement("admin-incident-related-action");
  const managementAction = getElement("admin-incident-management-related-action");

  if (!action && !managementAction) {
    return;
  }

  const relatedTarget = getDashboardIncidentRelatedTarget(incident);

  if (!relatedTarget) {
    configureDashboardIncidentRelatedButton(action, null);
    configureDashboardIncidentRelatedButton(managementAction, null);
    return;
  }

  configureDashboardIncidentRelatedButton(action, relatedTarget);
  configureDashboardIncidentRelatedButton(managementAction, relatedTarget);
}

function configureDashboardIncidentRelatedButton(action, relatedTarget) {
  if (!action) {
    return;
  }

  if (!relatedTarget) {
    action.hidden = true;
    delete action.dataset.relatedType;
    delete action.dataset.relatedId;
    delete action.dataset.relatedRoute;
    return;
  }

  action.hidden = false;
  action.textContent = relatedTarget.label;
  action.dataset.relatedType = relatedTarget.type;
  action.dataset.relatedId = relatedTarget.id;
  action.dataset.relatedRoute = relatedTarget.route;
}

function configureDashboardIncidentManageAction(incident) {
  const manageAction = getElement("admin-incident-manage-action");

  if (!manageAction) {
    return;
  }

  manageAction.hidden = normalizeDashboardText(incident.status) === "resuelta";
}

function getDashboardIncidentRelatedTarget(incident) {
  const involvedTarget = getDashboardIncidentPersonTarget(incident?.involvedType, incident?.involvedId);

  if (involvedTarget) {
    return involvedTarget;
  }

  return getDashboardIncidentPersonTarget(incident?.reportedByType, incident?.reportedById);
}

function getDashboardIncidentPersonTarget(personType, personId) {
  if (!personType || !personId) {
    return null;
  }

  if (personType === "Cliente") {
    return { type: "customer", id: personId, label: "Ver cliente", route: "clientes" };
  }

  if (["Chofer", "Colaborador"].includes(personType)) {
    return { type: "collaborator", id: personId, label: "Ver conductor", route: "colaboradores" };
  }

  return null;
}

function openDashboardIncidentRelatedTarget(targetType, targetId, routeName) {
  if (!targetType || !targetId) {
    return;
  }

  dashboardReturnToIncidentHistory = false;
  closeDashboardIncidentDetail();

  if (window.ElaraRouter && typeof window.ElaraRouter.navigateTo === "function") {
    window.ElaraRouter.navigateTo(routeName);
  }

  if (window.ElaraRouter && typeof window.ElaraRouter.showCurrentRoute === "function") {
    window.ElaraRouter.showCurrentRoute();
  }

  openDashboardTargetDetail(targetType, targetId);
}

function closeDashboardIncidentDetail() {
  const modal = getElement("admin-incident-detail-modal");
  const shouldReturnToHistory = dashboardReturnToIncidentHistory;

  exitDashboardIncidentManagement();
  dashboardIncidentDetailId = "";
  dashboardReturnToIncidentHistory = false;

  if (modal) {
    modal.hidden = true;
  }

  if (shouldReturnToHistory) {
    openDashboardIncidentHistoryModal();
  }
}

function enterDashboardIncidentManagement() {
  const incident = getDashboardIncidentById(dashboardIncidentDetailId);
  const form = getElement("admin-incident-management-form");
  const statusSelect = getElement("admin-incident-status-select");
  const resolutionNote = getElement("admin-incident-resolution-note");
  const incidentIdInput = getElement("admin-incident-management-id");

  if (!incident || !form || !statusSelect || !resolutionNote || !incidentIdInput) {
    return;
  }

  incidentIdInput.value = incident.incidentId || "Sin ID";
  statusSelect.innerHTML = getDashboardIncidentStatusOptions(incident.status)
    .map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`)
    .join("");
  statusSelect.value = getDashboardIncidentStatus(incident);
  resolutionNote.value = incident.resolutionNote || "";
  updateDashboardIncidentResolutionRequirement();
  clearDashboardIncidentManagementError();
  setDashboardIncidentManagementVisible(true);
}

function exitDashboardIncidentManagement() {
  clearDashboardIncidentManagementError();
  setDashboardIncidentManagementVisible(false);
}

function setDashboardIncidentManagementVisible(isVisible) {
  const form = getElement("admin-incident-management-form");
  const manageAction = getElement("admin-incident-manage-action");
  const relatedAction = getElement("admin-incident-related-action");
  const managementRelatedAction = getElement("admin-incident-management-related-action");
  const incident = getDashboardIncidentById(dashboardIncidentDetailId);
  const canManage = incident && normalizeDashboardText(incident.status) !== "resuelta";

  if (form) {
    form.hidden = !isVisible;
  }

  if (manageAction) {
    manageAction.hidden = isVisible || !canManage;
  }

  if (relatedAction && relatedAction.dataset.relatedType) {
    relatedAction.hidden = isVisible;
  }

  if (managementRelatedAction && managementRelatedAction.dataset.relatedType) {
    managementRelatedAction.hidden = !isVisible;
  }
}

function getDashboardIncidentStatusOptions(status) {
  const normalizedStatus = getDashboardIncidentStatus({ status });

  if (normalizedStatus === "Pendiente") {
    return ["Pendiente", "En revisi\u00f3n", "Resuelta"];
  }

  if (normalizedStatus === "En revisi\u00f3n") {
    return ["En revisi\u00f3n", "Pendiente", "Resuelta"];
  }

  return ["Resuelta", "Pendiente", "En revisi\u00f3n"];
}

function getDashboardIncidentStatus(incident) {
  return DASHBOARD_INCIDENT_STATUSES.includes(incident?.status) ? incident.status : "Pendiente";
}

function saveDashboardIncidentManagement(event) {
  event.preventDefault();

  const incident = getDashboardIncidentById(dashboardIncidentDetailId);
  const statusSelect = getElement("admin-incident-status-select");
  const resolutionNote = getElement("admin-incident-resolution-note");

  if (!incident || !statusSelect || !resolutionNote) {
    return;
  }

  const nextStatus = statusSelect.value;
  const nextResolutionNote = resolutionNote.value.trim();
  const previousStatus = getDashboardIncidentStatus(incident);

  if (!DASHBOARD_INCIDENT_STATUSES.includes(nextStatus)) {
    showDashboardIncidentManagementError("Selecciona un estado v\u00e1lido.");
    return;
  }

  if (nextStatus === "Resuelta" && !nextResolutionNote) {
    showDashboardIncidentManagementError("La nota de resoluci\u00f3n es obligatoria para resolver la incidencia.");
    return;
  }

  const now = new Date().toISOString();

  incident.status = nextStatus;
  incident.updatedAt = now;
  incident.resolutionNote = nextResolutionNote;

  if (nextStatus === "Resuelta") {
    incident.resolvedAt = now;
  } else {
    delete incident.resolvedAt;
  }

  renderDashboard();
  registerDashboardIncidentActivity(incident, previousStatus, nextStatus);
  showDashboardToast("La incidencia se actualiz\u00f3 correctamente.", "success");

  if (nextStatus === "Resuelta") {
    closeDashboardIncidentDetail();
    return;
  }

  openDashboardIncidentDetail(incident.incidentId);
}

function updateDashboardIncidentResolutionRequirement() {
  const statusSelect = getElement("admin-incident-status-select");
  const resolutionNote = getElement("admin-incident-resolution-note");
  const requiredHint = getElement("admin-incident-resolution-required");

  const isResolutionRequired = statusSelect?.value === "Resuelta";

  if (resolutionNote) {
    resolutionNote.required = isResolutionRequired;
  }

  if (requiredHint) {
    requiredHint.hidden = !isResolutionRequired;
  }
}

function openDashboardIncidentHistoryModal() {
  const modal = getElement("admin-incident-history-modal");

  if (!modal) {
    return;
  }

  renderDashboardIncidentHistoryModal();
  modal.hidden = false;
}

function closeDashboardIncidentHistoryModal() {
  const modal = getElement("admin-incident-history-modal");

  if (modal) {
    modal.hidden = true;
  }
}

function resetDashboardIncidentHistorySearch() {
  dashboardIncidentHistoryQuery = "";

  const searchInput = getElement("incidents-history-search");

  if (searchInput) {
    searchInput.value = "";
  }
}

function updateDashboardIncidentHistorySearch(value) {
  dashboardIncidentHistoryQuery = value;
  renderDashboardIncidentHistoryModal();
}

function openDashboardHistoricalIncidentDetail(incidentId) {
  closeDashboardIncidentHistoryModal();
  dashboardReturnToIncidentHistory = true;
  openDashboardIncidentDetail(incidentId);
}

function showDashboardIncidentManagementError(message) {
  const error = getElement("admin-incident-management-error");

  if (!error) {
    return;
  }

  error.textContent = message;
  error.hidden = false;
}

function clearDashboardIncidentManagementError() {
  const error = getElement("admin-incident-management-error");

  if (!error) {
    return;
  }

  error.textContent = "";
  error.hidden = true;
}

function showDashboardToast(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
    return;
  }

  if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function registerDashboardIncidentActivity(incident, previousStatus, nextStatus) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function" || previousStatus === nextStatus) {
    return;
  }

  const isResolved = nextStatus === "Resuelta";

  window.ElaraActivityLog.addEvent({
    eventType: isResolved ? "INCIDENT_RESOLVED" : "INCIDENT_STATUS_CHANGED",
    actorType: "Administraci\u00f3n",
    actorName: "Administraci\u00f3n",
    entityType: "Incidencia",
    entityId: incident.incidentId,
    title: isResolved ? "Incidencia resuelta" : "Estado de incidencia actualizado",
    description: isResolved
      ? `${incident.incidentId} fue marcada como resuelta.`
      : `${incident.incidentId} pas\u00f3 de ${previousStatus} a ${nextStatus}.`,
    metadata: {
      previousStatus,
      nextStatus,
    },
  });
}

function initDashboardActivityLogControls() {
  if (window.ElaraDashboardActivityLogReady) {
    return;
  }

  window.ElaraDashboardActivityLogReady = true;
  window.addEventListener("elara:activity-updated", renderRecentActivity);
}

function initDashboardIncidentControls() {
  const incidentsList = getElement("incidents-list");

  if (incidentsList && !incidentsList.dataset.dashboardIncidentsReady) {
    incidentsList.dataset.dashboardIncidentsReady = "true";
    incidentsList.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-dashboard-incident-target][data-dashboard-incident-id]");

      if (!actionButton) {
        return;
      }

      openDashboardIncidentDetail(actionButton.dataset.dashboardIncidentId);
    });
  }

  const relatedAction = getElement("admin-incident-related-action");
  const managementRelatedAction = getElement("admin-incident-management-related-action");
  const manageAction = getElement("admin-incident-manage-action");
  const managementForm = getElement("admin-incident-management-form");
  const managementCancel = getElement("admin-incident-management-cancel");
  const incidentModal = getElement("admin-incident-detail-modal");
  const statusSelect = getElement("admin-incident-status-select");
  const historyModal = getElement("admin-incident-history-modal");
  const historyList = getElement("incidents-history-list");
  const historyAction = getElement("incidents-history-action");
  const historySearch = getElement("incidents-history-search");

  if (relatedAction && !relatedAction.dataset.dashboardIncidentsReady) {
    relatedAction.dataset.dashboardIncidentsReady = "true";
    relatedAction.addEventListener("click", () => {
      openDashboardIncidentRelatedTarget(
        relatedAction.dataset.relatedType,
        relatedAction.dataset.relatedId,
        relatedAction.dataset.relatedRoute,
      );
    });
  }

  if (managementRelatedAction && !managementRelatedAction.dataset.dashboardIncidentsReady) {
    managementRelatedAction.dataset.dashboardIncidentsReady = "true";
    managementRelatedAction.addEventListener("click", () => {
      openDashboardIncidentRelatedTarget(
        managementRelatedAction.dataset.relatedType,
        managementRelatedAction.dataset.relatedId,
        managementRelatedAction.dataset.relatedRoute,
      );
    });
  }

  if (manageAction && !manageAction.dataset.dashboardIncidentsReady) {
    manageAction.dataset.dashboardIncidentsReady = "true";
    manageAction.addEventListener("click", enterDashboardIncidentManagement);
  }

  if (managementForm && !managementForm.dataset.dashboardIncidentsReady) {
    managementForm.dataset.dashboardIncidentsReady = "true";
    managementForm.addEventListener("submit", saveDashboardIncidentManagement);
  }

  if (managementCancel && !managementCancel.dataset.dashboardIncidentsReady) {
    managementCancel.dataset.dashboardIncidentsReady = "true";
    managementCancel.addEventListener("click", exitDashboardIncidentManagement);
  }

  if (statusSelect && !statusSelect.dataset.dashboardIncidentsReady) {
    statusSelect.dataset.dashboardIncidentsReady = "true";
    statusSelect.addEventListener("change", updateDashboardIncidentResolutionRequirement);
  }

  if (incidentModal && !incidentModal.dataset.dashboardIncidentsReady) {
    incidentModal.dataset.dashboardIncidentsReady = "true";
    incidentModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal-close]")) {
        closeDashboardIncidentDetail();
      }
    });
  }

  if (historyAction && !historyAction.dataset.dashboardIncidentsReady) {
    historyAction.dataset.dashboardIncidentsReady = "true";
    historyAction.addEventListener("click", () => {
      resetDashboardIncidentHistorySearch();
      openDashboardIncidentHistoryModal();
    });
  }

  if (historySearch && !historySearch.dataset.dashboardIncidentsReady) {
    historySearch.dataset.dashboardIncidentsReady = "true";
    historySearch.addEventListener("input", (event) => {
      updateDashboardIncidentHistorySearch(event.target.value);
    });
  }

  if (historyList && !historyList.dataset.dashboardIncidentsReady) {
    historyList.dataset.dashboardIncidentsReady = "true";
    historyList.addEventListener("click", (event) => {
      const detailButton = event.target.closest("[data-dashboard-incident-history-detail]");

      if (!detailButton) {
        return;
      }

      openDashboardHistoricalIncidentDetail(detailButton.dataset.dashboardIncidentHistoryDetail);
    });
  }

  if (historyModal && !historyModal.dataset.dashboardIncidentsReady) {
    historyModal.dataset.dashboardIncidentsReady = "true";
    historyModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal-close]")) {
        closeDashboardIncidentHistoryModal();
      }
    });
  }
}

function initDashboardAlertControls() {
  const alertsList = getElement("alerts-list");

  if (!alertsList || alertsList.dataset.dashboardAlertsReady) {
    return;
  }

  alertsList.dataset.dashboardAlertsReady = "true";
  alertsList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-dashboard-alert-target][data-dashboard-alert-id]");

    if (!actionButton) {
      return;
    }

    openDashboardAlertTarget(actionButton.dataset.dashboardAlertTarget, actionButton.dataset.dashboardAlertId);
  });
}

function openDashboardAlertTarget(targetType, targetId) {
  const routeByTargetType = {
    service: "servicios",
    "service-assignment": "servicios",
    vehicle: "vehiculos",
    collaborator: "colaboradores",
    customer: "clientes",
    cash: "caja",
  };

  const routeName = routeByTargetType[targetType];

  if (!routeName || !targetId) {
    return;
  }

  if (window.ElaraRouter && typeof window.ElaraRouter.navigateTo === "function") {
    window.ElaraRouter.navigateTo(routeName);
  }

  window.setTimeout(() => {
    openDashboardTargetDetail(targetType, targetId);
  }, 80);
}

function openDashboardTargetDetail(targetType, targetId) {
  if (targetType === "service-assignment" && window.ElaraServices?.openServiceAssignment) {
    window.ElaraServices.openServiceAssignment(targetId);
    return;
  }

  if (targetType === "service" && window.ElaraServices?.openServiceDetail) {
    window.ElaraServices.openServiceDetail(targetId);
    return;
  }

  if (targetType === "vehicle" && window.ElaraVehicles?.openVehicleDetailById) {
    window.ElaraVehicles.openVehicleDetailById(targetId);
    return;
  }

  if (targetType === "collaborator" && window.ElaraCollaborators?.openCollaboratorDetail) {
    window.ElaraCollaborators.openCollaboratorDetail(targetId);
    return;
  }

  if (targetType === "customer" && window.ElaraCustomers?.openCustomerDetailByCode) {
    window.ElaraCustomers.openCustomerDetailByCode(targetId);
  }
}

// =========================
// Utilidades internas
// =========================

function parseDashboardDateTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDashboardIncidentDateTime(value) {
  const date = parseDashboardDateTime(value);

  if (!date) {
    return "No indicada";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDashboardIncidentTime(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return "--:--";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month} · ${hours}:${minutes}`;
}

function formatDashboardActivityTime(value) {
  const date = parseDashboardDateTime(value);

  if (!date) {
    return "--:--";
  }

  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDashboardActivityDescription(event) {
  const entityReference = event.entityId ? ` (${event.entityId})` : "";

  return `${event.description || "Actividad registrada."}${entityReference}`;
}

function getDashboardIncidentSortTime(date) {
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : getDashboardReferenceDate().getTime();
}

function getDashboardActivitySortTime(value) {
  const date = parseDashboardDateTime(value);

  return date ? date.getTime() : 0;
}

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function setModalTarget(id, modalId) {
  const element = getElement(id);

  if (!element) {
    return;
  }

  if (modalId) {
    element.dataset.modalOpen = modalId;
  } else {
    delete element.dataset.modalOpen;
  }
}

function escapeHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
}

// =========================
// API publica del modulo
// =========================

window.ElaraDashboard = {
  initDashboard,
  showDashboard,
};

// Dashboard Phase 1A: existing visual nodes, real data, no legacy initialization.
let operationalDashboardNodes = null;
let operationalDashboardCurrent = () => false;
let operationalDashboardBound = false;
const operationalDashboardDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
const operationalDashboardDateFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit'});
const operationalDashboardTimeFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false});
function operationalDashboardDay(value) {
  const date = new Date(value);
  if (value == null || !Number.isFinite(date.getTime())) return null;
  return operationalDashboardDayFormat.format(date);
}
function operationalDashboardModel(rows, now = new Date()) {
  const today = rows.filter(r=>operationalDashboardDay(r.scheduled_start_at)===operationalDashboardDay(now));
  const assignable = r=>['pending','confirmed'].includes(r.operational_status);
  return {
    metrics:[
      ['Servicios hoy',today.length,'Agenda de hoy, incluidos completados y cancelados','neutral'],
      ['Servicios en curso',rows.filter(r=>r.operational_status==='in_progress').length,'En curso ahora, aunque empezaran otro día','info'],
      ['Por asignar hoy',today.filter(r=>assignable(r)&&!r.current_assignment_id).length,'Sin asignación actual','warning'],
      ['Por aceptar hoy',today.filter(r=>assignable(r)&&r.assignment_status==='pending_acceptance').length,'Asignación pendiente de aceptación','warning'],
      ['Cancelados de hoy',today.filter(r=>r.operational_status==='cancelled').length,'Servicios programados para hoy','danger'],
    ],
    upcoming:rows.filter(r=>assignable(r)&&r.scheduled_start_at&&Number.isFinite(Date.parse(r.scheduled_start_at))&&Date.parse(r.scheduled_start_at)>=now.getTime())
      .sort((a,b)=>Date.parse(a.scheduled_start_at)-Date.parse(b.scheduled_start_at)||String(a.service_id).localeCompare(String(b.service_id))).slice(0,4),
  };
}
function mountOperationalDashboard(panel, {controls}) {
  const nodes = operationalDashboardNodes;
  nodes.summary.hidden = false;
  nodes.grid.hidden = false;
  nodes.summary.replaceChildren();
  nodes.grid.querySelector('#upcoming-services').replaceChildren();
  for (const [id,text] of [
    ['alerts-list','Evaluando alertas operativas…'],
    ['incidents-list','Cargando incidencias administrativas…'],
    ['recent-activity-list','Cargando actividad de servicios…'],
  ]) {
    const target = nodes.grid.querySelector('#'+id);
    const message = document.createElement(target.tagName==='OL'?'li':'p');
    message.className = id==='incidents-list'?'incident-empty':id==='recent-activity-list'?'activity-empty':'service-assignment-empty';
    message.textContent = text;
    target.replaceChildren(message);
  }
  const count = nodes.grid.querySelector('#alerts-count');
  count.textContent = '—';
  count.setAttribute('aria-label','Evaluando alertas');
  const history = nodes.grid.querySelector('#incidents-history-action');
  history.hidden = true;
  history.disabled = true;
  nodes.grid.querySelector('#upcoming-services').closest('article').querySelector('button').dataset.dashboardOperationalAction = 'all';
  if (!nodes.secondary) {
    nodes.secondary = document.createElement('details');
    nodes.secondary.className = 'panel';
  }
  nodes.secondary.innerHTML = '<summary>Consulta operativa completa</summary><div>'+controls+'</div>';
  panel.replaceChildren(nodes.summary,nodes.grid,nodes.secondary);
}
function renderOperationalDashboard(rows, {isCurrent}) {
  const esc = window.ElaraOperationalData.display;
  const html = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const model = operationalDashboardModel(rows);
  operationalDashboardNodes.summary.innerHTML = model.metrics.map(([label,value,detail,tone])=>
    `<article class="summary-card summary-card--${tone}"><span>${html(label)}</span><strong>${value}</strong><small>${html(detail)}</small></article>`).join('');
  const states = {pending:['Pendiente','status--warning'],confirmed:['Confirmado','status--success']};
  const assignments = {pending_acceptance:'Pendiente de aceptación',accepted:'Aceptada',reassignment_required:'Reasignación requerida'};
  const types = {transfer:'Traslado',hourly:'Por horas',airport:'Aeropuerto'};
  operationalDashboardNodes.grid.querySelector('#upcoming-services').innerHTML = model.upcoming.length ? model.upcoming.map(row=>{
    const date = new Date(row.scheduled_start_at),state=states[row.operational_status];
    return `<section class="service-item" data-dashboard-service-id="${html(row.service_id)}">
      <div class="service-item__schedule"><span class="service-item__date">${html(operationalDashboardDateFormat.format(date))}</span><time class="service-item__time" datetime="${html(date.toISOString())}">${html(operationalDashboardTimeFormat.format(date))}</time></div>
      <div class="service-item__main"><h3>${html(types[row.service_type]||esc(row.service_type))}</h3><p>${html(esc(row.customer_display_name))} | ${html(esc(row.human_code))}</p>
        <span class="service-item__assignment">${html(row.driver_display_name||'Conductor no disponible')} | ${html(row.plate_normalized||'Vehículo no disponible')}</span>
        <p>Asignación: ${html(assignments[row.assignment_status]||row.assignment_status||'Sin asignación actual')}</p>
        <button type="button" class="button button--compact button--muted" data-dashboard-operational-action="service" data-service-id="${html(row.service_id)}">Ver servicio</button></div>
      <span class="status-pill ${state[1]}">${state[0]}</span></section>`;
  }).join('') : '<p class="service-assignment-empty" role="status">No hay próximos servicios pendientes o confirmados.</p>';
  const user = window.ElaraAuth.getCurrentUser();
  document.getElementById('page-title').textContent = 'Hola, '+(user.name||user.email||'Usuario ELARA');
  document.getElementById('page-eyebrow').textContent = 'Centro de operaciones';
  document.getElementById('page-summary').textContent = `Hoy tienes ${model.metrics[0][1]} servicios programados. ${model.metrics[2][1]} por asignar y ${model.metrics[3][1]} por aceptar. Los indicadores no son sumables entre sí.`;
  const primary = document.getElementById('primary-action');
  primary.textContent = 'Nuevo servicio';
  primary.hidden = false;
  primary.removeAttribute('data-modal-target');
  primary.removeAttribute('data-modal-open');
  operationalDashboardCurrent = isCurrent;
  void loadOperationalDashboardPanels(rows, isCurrent);
}
function bindOperationalDashboard() {
  if (operationalDashboardBound) return;
  const allowed = ()=>operationalDashboardCurrent()&&!document.getElementById('dashboard').hidden&&
    ['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.());
  document.getElementById('primary-action').addEventListener('click',()=>{
    if (allowed()) void window.ElaraServiceAdmin.open('create');
  });
  document.getElementById('dashboard').addEventListener('click',event=>{
    const button = event.target.closest('[data-dashboard-operational-action]');
    if (!button || !allowed()) return;
    if (button.dataset.dashboardOperationalAction==='all') window.ElaraRouter.navigateTo('servicios');
    else window.ElaraServices.navigateOperationalService(button.dataset.serviceId);
  });
  window.addEventListener('elara:service-admin-confirmed',()=>{
    if (allowed()) void showOperationalDashboard();
  });
  operationalDashboardBound = true;
}
function showOperationalDashboard() {
  const op = window.ElaraOperationalData;
  if (!op) throw new Error('Lectura operativa no disponible.');
  operationalDashboardCurrent = () => false;
  if (!operationalDashboardNodes) {
    const view = document.getElementById('dashboard');
    operationalDashboardNodes = {summary:view.querySelector('#summary-cards'),grid:view.querySelector('.dashboard-grid'),secondary:null};
  }
  bindOperationalDashboard();
  closeOperationalDashboardIncidents();
  return op.show('dashboard', {title: 'Dashboard', load: () => op.readAll('v_admin_service_overview','service_id'),
presentation:{panelClassName:'dashboard-operational-panel',mount:mountOperationalDashboard,ready:renderOperationalDashboard},
notice: 'Consulta operativa actual. Fechas en Europe/Madrid. Actividad de servicios: cambios de estado registrados; no incluye creación ni rechazo de asignaciones.',
columns: [['Servicio','human_code'],['Fecha','scheduled_start_at'],['Cliente','customer_display_name'],['Estado','operational_status'],['Conductor',r=>op.display(r.driver_display_name)]],
summary: rows=>'Clientes: '+op.getCollection('customers').length+' · Conductores: '+op.getCollection('drivers').length+' · Vehículos: '+op.getCollection('vehicles').length+' · Servicios en curso: '+rows.filter(r=>r.operational_status==='in_progress').length});
}

// Phase 1B. These handlers own the existing panels/modals; legacy initializers stay inactive.
let operationalIncidentState = null;
let operationalIncidentTicket = 0;
let operationalIncidentBusy = false;
let operationalIncidentBound = false;
const operationalIncidentUncertain = new Set();
const operationalIncidentStatus = {open:'Pendiente',acknowledged:'Reconocida',investigating:'En investigación',resolved:'Resuelta',cancelled:'Cancelada'};
const operationalIncidentSeverity = {low:'Baja',medium:'Media',high:'Alta',critical:'Crítica'};
const operationalIncidentTransitions = {open:['acknowledged','investigating','resolved','cancelled'],acknowledged:['investigating','resolved','cancelled'],investigating:['resolved','cancelled']};
const operationalIncidentRpcs = {acknowledged:'acknowledge_incident',investigating:'investigate_incident',resolved:'resolve_incident',cancelled:'cancel_incident'};
const operationalDashboardFullDate = new Intl.DateTimeFormat('es-ES', {
  timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const operationalDashboardHtml = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function operationalDashboardWhen(value) {
  return value && Number.isFinite(Date.parse(value)) ? operationalDashboardFullDate.format(new Date(value)) : 'Fecha no disponible';
}
function operationalDashboardCompactWhen(value) {
  if(!value||!Number.isFinite(Date.parse(value)))return '<time title="Fecha no disponible">—</time>';
  const date=new Date(value),html=operationalDashboardHtml;
  // Original timeline columns are narrow: retain their date/time stack, with full year on hover/AT.
  return `<time datetime="${html(date.toISOString())}" title="${html(operationalDashboardWhen(value))}" aria-label="${html(operationalDashboardWhen(value))}">${html(operationalDashboardDateFormat.format(date))}<br>${html(operationalDashboardTimeFormat.format(date))}</time>`;
}
function operationalDashboardScope() {
  const user=window.ElaraAuth?.getCurrentUser?.();
  return JSON.stringify([user?.id,user?.appSessionId,window.ElaraAuth?.getActiveContext?.()]);
}
function operationalDashboardGuard(isCurrent) {
  const scope=operationalDashboardScope();
  return ()=>isCurrent() && scope===operationalDashboardScope() && !document.getElementById('dashboard').hidden &&
    ['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.());
}
function operationalDashboardAlerts(rows, now=new Date()) {
  // A rolling 24-hour interval, not "until tomorrow midnight". Instants are zone independent;
  // every displayed date uses Madrid, including across DST changes.
  const start=now.getTime(),end=start+24*60*60*1000,result=[];
  for(const row of rows) {
    if(!['pending','confirmed'].includes(row.operational_status)||!row.scheduled_start_at) continue;
    const time=Date.parse(row.scheduled_start_at);
    if(!Number.isFinite(time)||time>end) continue;
    const add=(kind,title,level)=>result.push({row,kind,title,level,time});
    if(time<start) add('not_started','Hora prevista superada; servicio sin iniciar','critical');
    if(!row.current_assignment_id && time>=start) add('unassigned','Servicio próximo sin asignación actual','medium');
    if(row.current_assignment_id && row.assignment_status==='pending_acceptance') add('acceptance','Asignación pendiente de aceptación','medium');
  }
  return result.sort((a,b)=>a.time-b.time||String(a.row.service_id).localeCompare(String(b.row.service_id))||a.kind.localeCompare(b.kind));
}
function operationalDashboardMessage(id,text,error=false) {
  const target=document.getElementById(id),item=document.createElement(target.tagName==='OL'?'li':'p');
  item.className=id==='incidents-list'?'incident-empty':'activity-empty';
  item.setAttribute('role',error?'alert':'status');item.textContent=text;target.replaceChildren(item);
}
function operationalIncidentEligible(row) {
  const op=window.ElaraOperationalData;
  if(!op.isOperationalRecord(row)) return false;
  for(const [field,table] of [['service_id','services'],['driver_id','drivers'],['reported_by_driver_id','drivers'],['vehicle_id','vehicles'],['customer_id','customers']]) {
    if(row[field]&&!op.getCollection(table).some(r=>r.id===row[field]&&op.isOperationalRecord(r))) return false;
  }
  return true;
}
async function loadOperationalDashboardPanels(rows,isCurrent) {
  const op=window.ElaraOperationalData,valid=operationalDashboardGuard(isCurrent),html=operationalDashboardHtml;
  bindOperationalDashboardIncidents();
  const state={valid,rows:[],categories:[],users:[],selected:null};operationalIncidentState=state;
  const alerts=operationalDashboardAlerts(rows.filter(r=>op.isOperationalRecord(r)));
  const count=document.getElementById('alerts-count');count.textContent=String(alerts.length);count.setAttribute('aria-label',`${alerts.length} alertas operativas`);
  document.getElementById('alerts-list').innerHTML=alerts.map(a=>`<section class="alert-item alert-item--${a.level}"><div class="alert-item__marker" aria-hidden="true"></div><div class="alert-item__content"><span class="alert-item__level">${a.level==='critical'?'Revisar':'Atención'}</span><h3>${html(a.title)}</h3><p>${html(a.row.human_code)} · ${html(operationalDashboardWhen(a.row.scheduled_start_at))}</p></div><button class="button button--compact" type="button" data-dashboard-operational-action="service" data-service-id="${html(a.row.service_id)}">Ver servicio</button></section>`).join('');
  if(!alerts.length)operationalDashboardMessage('alerts-list','Sin alertas operativas en el horizonte de 24 horas.');
  document.getElementById('recent-activity-heading').textContent='Actividad de servicios';
  const incidents=Promise.all([op.readAll('incidents'),op.readAll('incident_categories')]).then(async([records,categories])=>{
    if(!valid())return;
    state.rows=records.filter(operationalIncidentEligible).sort((a,b)=>Date.parse(b.reported_at)-Date.parse(a.reported_at)||String(a.id).localeCompare(String(b.id)));
    state.categories=categories.filter(op.isOperationalRecord);
    const reporterIds=[...new Set(state.rows.map(r=>r.reported_by_user_id).filter(Boolean))];
    // Reporter labels are optional; a failed name lookup must never hide an incident.
    if(reporterIds.length)try{state.users=(await op.readAll('app_users','id',{column:'id',values:reporterIds})).filter(op.isOperationalRecord);}catch{state.users=[];}
    if(!valid())return;
    renderOperationalIncidents(state);
    const history=document.getElementById('incidents-history-action');history.hidden=false;history.disabled=false;
  }).catch(()=>{if(valid())operationalDashboardMessage('incidents-list','No se pudieron cargar las incidencias. Actualiza para reintentar.',true);});
  const ids=rows.filter(r=>op.isOperationalRecord(r)&&op.getCollection('services').some(s=>s.id===r.service_id)).map(r=>r.service_id);
  const activity=(async()=>{
    const events=[];
    for(let offset=0;offset<ids.length;offset+=100)events.push(...await op.readAll('service_status_history','id',{column:'service_id',values:ids.slice(offset,offset+100)}));
    if(!valid())return;
    const labels={pending:'Pendiente',confirmed:'Confirmado',in_progress:'En curso',completed:'Finalizado',cancelled:'Cancelado',no_show:'No presentado',not_performed:'No realizado'};
    const visible=events.filter(e=>ids.includes(e.service_id)&&op.isOperationalRecord(e)&&e.from_status!==e.to_status&&Number.isFinite(Date.parse(e.changed_at)))
      .sort((a,b)=>Date.parse(b.changed_at)-Date.parse(a.changed_at)||String(b.id).localeCompare(String(a.id))).slice(0,10);
    document.getElementById('recent-activity-list').innerHTML=visible.map(e=>`<li class="recent-activity-item">${operationalDashboardCompactWhen(e.changed_at)}<span>${html(rows.find(r=>r.service_id===e.service_id)?.human_code||e.service_id)}: ${html(labels[e.from_status]||e.from_status)} → ${html(labels[e.to_status]||e.to_status)}</span></li>`).join('');
    if(!visible.length)operationalDashboardMessage('recent-activity-list','No hay cambios de estado registrados. Cobertura parcial: no incluye creación ni rechazo de asignaciones.');
  })().catch(()=>{if(valid())operationalDashboardMessage('recent-activity-list','No se pudo cargar la actividad de servicios. Actualiza para reintentar.',true);});
  await Promise.all([incidents,activity]);
}
function operationalIncidentReporter(row) {
  const op=window.ElaraOperationalData;
  if(row.reported_by_driver_id){const driver=op.getCollection('drivers').find(r=>r.id===row.reported_by_driver_id);return `Conductor · ${driver?op.personName(driver.person_id):row.reported_by_driver_id}`;}
  const user=operationalIncidentState?.users.find(u=>u.id===row.reported_by_user_id);
  return row.reported_by_user_id ? `Usuario · ${user?.person_id?op.personName(user.person_id):row.reported_by_user_id}` : 'Reportante no disponible';
}
function operationalIncidentItem(row,state) {
  const html=operationalDashboardHtml,category=state.categories.find(c=>c.id===row.category_id);
  return `<li class="incident-item incident-item--${html(['low','medium','high','critical'].includes(row.severity)?row.severity:'medium')}">${operationalDashboardCompactWhen(row.reported_at)}<span class="incident-item__content"><strong>${html(operationalIncidentReporter(row))}</strong><span class="incident-item__category">${html(category?.name_es||category?.name||row.title)}</span><span class="incident-item__id">${html(row.human_code||row.id)}</span><small>${html(operationalIncidentSeverity[row.severity]||row.severity)} · ${html(operationalIncidentStatus[row.status]||row.status)}</small><span>${html(row.description||row.title)}</span><button class="button button--compact button--muted incident-item__action" type="button" data-operational-incident="${html(row.id)}">Ver detalle</button></span></li>`;
}
function renderOperationalIncidents(state) {
  const active=state.rows.filter(r=>!['resolved','cancelled'].includes(r.status));
  document.getElementById('incidents-list').innerHTML=active.map(r=>operationalIncidentItem(r,state)).join('');
  if(!active.length)operationalDashboardMessage('incidents-list','Sin incidencias administrativas abiertas.');
  renderOperationalIncidentHistory(state);
}
function renderOperationalIncidentHistory(state) {
  const query=document.getElementById('incidents-history-search').value.trim().toLocaleLowerCase();
  const rows=state.rows.filter(r=>['resolved','cancelled'].includes(r.status)&&[r.human_code,r.title,r.description,r.service_id,operationalIncidentReporter(r)].join(' ').toLocaleLowerCase().includes(query));
  const html=operationalDashboardHtml;
  document.getElementById('incidents-history-list').innerHTML=rows.length?rows.map(r=>`<article class="admin-incident-history-row"><time>${html(operationalDashboardWhen(r.reported_at))}</time><strong>${html(operationalIncidentReporter(r))}</strong><span>${html(state.categories.find(c=>c.id===r.category_id)?.name_es||r.title)}</span><span class="incident-item__id">${html(r.human_code||r.id)}</span><small>${html(operationalIncidentSeverity[r.severity])} · ${html(operationalIncidentStatus[r.status])}</small><span>${html(operationalDashboardWhen(r.resolved_at||r.cancelled_at))}</span><button class="button button--compact button--muted" type="button" data-operational-incident="${html(r.id)}">Ver detalle</button></article>`).join(''):'<p class="incident-empty" role="status">No hay incidencias resueltas o canceladas coincidentes.</p>';
}
function closeOperationalDashboardIncidents() {
  ++operationalIncidentTicket;
  for(const id of ['admin-incident-detail-modal','admin-incident-history-modal'])document.getElementById(id).hidden=true;
  operationalIncidentState=null;
}
function operationalIncidentActions(row) {return operationalIncidentTransitions[row.status]||[];}
function operationalIncidentSetText(id,value) {document.getElementById(id).textContent=value||'No indicado';}
async function openOperationalIncident(id) {
  const state=operationalIncidentState;if(!state?.valid()||operationalIncidentBusy)return;
  const row=state.rows.find(r=>r.id===id);if(!row)return;
  const op=window.ElaraOperationalData,ticket=++operationalIncidentTicket,modal=document.getElementById('admin-incident-detail-modal');
  state.selected=null;document.getElementById('admin-incident-history-modal').hidden=true;modal.hidden=false;
  document.getElementById('admin-incident-management-form').hidden=true;
  document.getElementById('admin-incident-manage-action').hidden=true;
  document.getElementById('admin-incident-related-action').hidden=true;
  document.getElementById('admin-incident-management-related-action').hidden=true;
  document.getElementById('admin-incident-financial-summary').hidden=true;
  for(const node of modal.querySelectorAll('dd'))node.textContent='Cargando…';
  operationalIncidentSetText('admin-incident-detail-title','Detalle de incidencia');
  const output=document.getElementById('admin-incident-operational-events');output.textContent='Cargando eventos y comentarios…';output.setAttribute('role','status');
  const current=()=>state===operationalIncidentState&&state.valid()&&ticket===operationalIncidentTicket&&!modal.hidden;
  try {
    const [records,categories,events,comments]=await Promise.all([
      op.readAll('incidents','id',{column:'id',values:[id]}),op.readAll('incident_categories','id',{column:'id',values:[row.category_id]}),
      op.readAll('incident_events','id',{column:'incident_id',values:[id]}),op.readAll('incident_comments','id',{column:'incident_id',values:[id]})]);
    if(!current())return;
    const fresh=records.find(r=>r.id===id&&operationalIncidentEligible(r));if(!fresh)throw Error('Incidencia no disponible.');
    state.selected={row:fresh,category:categories.find(c=>c.id===fresh.category_id)};
    state.rows=state.rows.map(r=>r.id===id?fresh:r);renderOperationalIncidents(state);
    const service=op.getCollection('services').find(r=>r.id===fresh.service_id),driver=op.getCollection('drivers').find(r=>r.id===fresh.driver_id),vehicle=op.getCollection('vehicles').find(r=>r.id===fresh.vehicle_id);
    for(const [key,value] of Object.entries({id:fresh.human_code||fresh.id,reporter:operationalIncidentReporter(fresh),involved:driver?op.personName(driver.person_id):fresh.driver_id,date:operationalDashboardWhen(fresh.reported_at),category:state.selected.category?.name_es||state.selected.category?.name||fresh.category_id,priority:operationalIncidentSeverity[fresh.severity],status:operationalIncidentStatus[fresh.status],service:service?.human_code||fresh.service_id,vehicle:vehicle?.plate_normalized||fresh.vehicle_id,subject:fresh.title,message:fresh.description,resolution:fresh.resolution_summary,'resolved-at':fresh.resolved_at?operationalDashboardWhen(fresh.resolved_at):null})) operationalIncidentSetText('admin-incident-'+key,value);
    const options=operationalIncidentActions(fresh),select=document.getElementById('admin-incident-status-select');
    select.innerHTML='<option value="">Selecciona una acción</option>'+options.map(v=>`<option value="${v}">${operationalDashboardHtml(operationalIncidentStatus[v])}</option>`).join('');
    document.getElementById('admin-incident-management-id').value=fresh.human_code||fresh.id;
    document.getElementById('admin-incident-resolution-note').value='';
    document.getElementById('admin-incident-resolution-note').required=false;
    document.getElementById('admin-incident-resolution-required').hidden=true;
    const form=document.getElementById('admin-incident-management-form');form.querySelector('[type="submit"]').disabled=false;
    const error=document.getElementById('admin-incident-management-error');error.hidden=true;error.textContent='';
    document.getElementById('admin-incident-manage-action').hidden=!options.length||operationalIncidentUncertain.has(id);
    if(operationalIncidentUncertain.has(id)){error.hidden=false;error.textContent='Resultado anterior incierto. No repitas la escritura; revisa el estado y recarga la aplicación.';form.hidden=false;form.querySelector('[type="submit"]').disabled=true;}
    const related=document.getElementById('admin-incident-related-action');related.hidden=!service;related.dataset.serviceId=service?.id||'';
    const html=operationalDashboardHtml;
    const entries=[...events.filter(e=>e.incident_id===id&&op.isOperationalRecord(e)).map(e=>({date:e.occurred_at,text:`${e.event_type}${e.to_status?' · '+(operationalIncidentStatus[e.to_status]||e.to_status):''}${e.description?' · '+e.description:''}`})),...comments.filter(c=>c.incident_id===id&&op.isOperationalRecord(c)).map(c=>({date:c.created_at,text:`Comentario${c.is_private?' interno':''}: ${c.content}`}))].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    output.innerHTML=entries.length?`<h3 class="modal__section-title">Eventos y comentarios</h3><ol class="activity-list">${entries.map(e=>`<li>${operationalDashboardCompactWhen(e.date)} <span>${html(e.text)}</span></li>`).join('')}</ol>`:'Sin eventos ni comentarios registrados.';
  }catch(error){if(current()){state.selected=null;for(const node of modal.querySelectorAll('dd'))node.textContent='No disponible';output.setAttribute('role','alert');output.textContent='No se pudo cargar el detalle. Cierra y vuelve a abrir para reintentar.';}}
}
function operationalIncidentNoteRequired(selected,target) {return target==='cancelled'||target==='resolved'&&selected.category?.requires_resolution===true;}
async function submitOperationalIncident(event) {
  event.preventDefault();const state=operationalIncidentState;
  if(operationalIncidentBusy||!state?.valid()||!state.selected)return;
  const {row}=state.selected,id=row.id,target=document.getElementById('admin-incident-status-select').value;
  const note=document.getElementById('admin-incident-resolution-note').value.trim(),form=document.getElementById('admin-incident-management-form'),error=document.getElementById('admin-incident-management-error');
  if(operationalIncidentUncertain.has(id))return;
  error.hidden=false;
  if(!operationalIncidentActions(row).includes(target)){error.textContent='Selecciona una transición permitida.';return;}
  if(operationalIncidentNoteRequired(state.selected,target)&&!note){error.textContent='Indica el resumen de resolución o el motivo de cancelación obligatorio.';return;}
  operationalIncidentBusy=true;
  const controls=[...form.closest('.modal-backdrop').querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);form.setAttribute('aria-busy','true');error.textContent='Esperando confirmación remota…';
  let confirmed=false,uncertain=false;
  try {
    const op=window.ElaraOperationalData;
    // Fresh identity and record before any write; do not use stale modal permissions/state.
    await op.loadIdentity();if(!state.valid()||state!==operationalIncidentState) return;
    const fresh=(await op.readAll('incidents','id',{column:'id',values:[id]})).find(r=>r.id===id&&operationalIncidentEligible(r));
    if(!state.valid()||state!==operationalIncidentState)return;
    if(!fresh||fresh.status!==row.status||!operationalIncidentActions(fresh).includes(target))throw Error('La incidencia cambió. Cierra y vuelve a consultar el detalle.');
    const category=(await op.readAll('incident_categories','id',{column:'id',values:[fresh.category_id]})).find(c=>c.id===fresh.category_id);
    if(!category)throw Error('No se pudo verificar la categoría de la incidencia.');
    if(operationalIncidentNoteRequired({category},target)&&!note)throw Error('Esta categoría requiere un resumen de resolución.');
    if(!state.valid()||state!==operationalIncidentState)return;
    const args={p_incident_id:id};if(target==='resolved')args.p_resolution_summary=note||null;if(target==='cancelled')args.p_reason=note;
    let response;
    try{response=await window.ElaraSupabase.client.rpc(operationalIncidentRpcs[target],args);}
    catch(transport){uncertain=true;throw transport;}
    if(!response||typeof response!=='object'){uncertain=true;throw Error('Respuesta remota ausente.');}
    if(response.error){uncertain=!response.error.code;throw Error(response.error.message||'La operación no se confirmó.');}
    if(response.data!==id){uncertain=true;throw Error('Respuesta remota no reconocida.');}
    confirmed=true;
    if(!state.valid()||state!==operationalIncidentState)return;
    const records=await op.readAll('incidents');if(!state.valid()||state!==operationalIncidentState)return;
    const updated=records.find(r=>r.id===id);if(!updated||updated.status!==target)throw Error('No se pudo verificar el estado confirmado.');
    state.rows=records.filter(operationalIncidentEligible);renderOperationalIncidents(state);
    error.textContent='Cambio confirmado por el servidor.';document.getElementById('admin-incident-detail-modal').hidden=true;++operationalIncidentTicket;
  }catch(failure){
    uncertain=uncertain||confirmed;
    if(uncertain)operationalIncidentUncertain.add(id);
    if(state.valid()&&state===operationalIncidentState)error.textContent=uncertain?'No reintentes la escritura: el resultado puede estar confirmado. Revisa el estado y recarga la aplicación.':failure.message;
  }finally{
    operationalIncidentBusy=false;form.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>el.disabled=disabled);
    if(operationalIncidentUncertain.has(id)||confirmed)form.querySelector('[type="submit"]').disabled=true;
  }
}
function bindOperationalDashboardIncidents() {
  if(operationalIncidentBound)return;operationalIncidentBound=true;
  const allowed=()=>operationalIncidentState?.valid();
  document.getElementById('dashboard').addEventListener('click',event=>{
    const button=event.target.closest('[data-operational-incident]');if(button&&allowed())void openOperationalIncident(button.dataset.operationalIncident);
  });
  document.getElementById('incidents-history-action').addEventListener('click',()=>{if(allowed()){renderOperationalIncidentHistory(operationalIncidentState);document.getElementById('admin-incident-history-modal').hidden=false;}});
  document.getElementById('incidents-history-search').addEventListener('input',()=>{if(allowed())renderOperationalIncidentHistory(operationalIncidentState);});
  const detail=document.getElementById('admin-incident-detail-modal'),history=document.getElementById('admin-incident-history-modal');
  for(const modal of [detail,history])modal.addEventListener('click',event=>{
    if(event.target===modal||event.target.closest('[data-modal-close]')){if(!operationalIncidentBusy){modal.hidden=true;++operationalIncidentTicket;}return;}
    const button=event.target.closest('[data-operational-incident]');if(button&&allowed())void openOperationalIncident(button.dataset.operationalIncident);
  });
  document.getElementById('admin-incident-manage-action').addEventListener('click',()=>{if(allowed()&&operationalIncidentState.selected&&!operationalIncidentBusy)document.getElementById('admin-incident-management-form').hidden=false;});
  document.getElementById('admin-incident-management-cancel').addEventListener('click',()=>{if(!operationalIncidentBusy)document.getElementById('admin-incident-management-form').hidden=true;});
  document.getElementById('admin-incident-management-form').addEventListener('submit',submitOperationalIncident);
  document.getElementById('admin-incident-status-select').addEventListener('change',()=>{
    const selected=operationalIncidentState?.selected;if(!allowed()||!selected)return;
    const required=operationalIncidentNoteRequired(selected,document.getElementById('admin-incident-status-select').value);
    document.getElementById('admin-incident-resolution-note').required=required;document.getElementById('admin-incident-resolution-required').hidden=!required;
  });
  document.getElementById('admin-incident-related-action').addEventListener('click',event=>{if(allowed()&&!operationalIncidentBusy){const id=event.target.dataset.serviceId;closeOperationalDashboardIncidents();window.ElaraServices.navigateOperationalService(id);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!operationalIncidentBusy)for(const modal of [detail,history])modal.hidden=true;});
  window.addEventListener('hashchange',()=>closeOperationalDashboardIncidents());
  window.addEventListener('elara:auth-session-updated',()=>{if(operationalIncidentState&&!operationalIncidentState.valid())closeOperationalDashboardIncidents();});
  // Router and Auth hide the view on navigation/context changes; close retained global modals.
  if(window.MutationObserver){const observer=new window.MutationObserver(()=>{if(operationalIncidentState&&!operationalIncidentState.valid())closeOperationalDashboardIncidents();});observer.observe(document.getElementById('dashboard'),{attributes:true,attributeFilter:['hidden']});}
}
