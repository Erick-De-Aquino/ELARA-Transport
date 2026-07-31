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
