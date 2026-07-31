/*
  Proyecto Atlas / ELARA Transport
  Archivo: services.js
  Responsabilidad: renderizado y logica de la pantalla Servicios.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const servicesData = window.ElaraServicesMock;

const serviceStatusClassByName = {
  Pendiente: "operation-card--warning",
  "Por asignar": "operation-card--warning",
  "Por aceptar": "operation-card--warning",
  Confirmado: "operation-card--success",
  "En curso": "operation-card--info",
  Cancelado: "operation-card--danger",
  Finalizado: "operation-card--success",
  "No show": "operation-card--warning",
  "No realizado": "operation-card--neutral",
};

const serviceDetailStatusCardClassByName = {
  Pendiente: "status-card--warning",
  "Por asignar": "status-card--warning",
  "Por aceptar": "status-card--warning",
  "Reasignaci\u00f3n requerida": "status-card--warning",
  Confirmado: "status-card--success",
  "En curso": "status-card--info",
  Cancelado: "status-card--danger",
  Finalizado: "status-card--success",
  "No show": "status-card--warning",
  "No realizado": "status-card--neutral",
};

const serviceSummaryDisplayStatuses = ["Por asignar", "Por aceptar", "Confirmado", "En curso"];
const SERVICE_FINANCIAL_PAYMENT_STATUSES = ["Sin definir", "Pendiente", "Parcial", "Pagado", "Reembolsado", "Incobrable"];
const SERVICE_FINANCIAL_PAYMENT_METHODS = ["Efectivo", "Transferencia"];
const SERVICE_FINANCIAL_DEFAULT_SETTINGS = {
  vatRate: 0,
  collaboratorElaraPercentage: 10,
  internalDriverPercentage: 35,
};
const SERVICE_FINANCIAL_STATUS_TONES = {
  "Sin definir": "neutral",
  Pendiente: "warning",
  Parcial: "info",
  Cobrado: "success",
  Pagado: "success",
  Reembolsado: "neutral",
  Incobrable: "danger",
};

const serviceTypeIconByName = {
  Aeropuerto: "fa-plane",
  "Punto a punto": "fa-location-dot",
  "Full Day": "fa-clock",
  Mascotas: "fa-dog",
  "Larga distancia": "fa-road",
};

const paymentIconByName = {
  Efectivo: "fa-money-bill-wave",
  Pendiente: "fa-clock",
};

const newServiceDraft = {
  stops: [],
  selectedCustomer: null,
  assignmentDecision: "",
  assignment: null,
  assignmentSearchTerm: "",
  showAssignmentCollaborators: false,
  pendingAssignmentAction: null,
  assignmentNotice: "",
};

const NEW_SERVICE_DEFAULT_TYPE = "Aeropuerto";

const SERVICE_TYPE_SPECIFIC_FIELDS = {
  Aeropuerto: [
    { key: "flightNumber", label: "Número de vuelo", type: "text", sourceId: "new-service-flight-number", required: true },
    { key: "flightTerminal", label: "Terminal", type: "text", sourceId: "new-service-flight-terminal", required: true },
    { key: "luggage", label: "Equipaje", type: "text", sourceId: "new-service-luggage", required: false },
  ],
  Mascotas: [
    {
      key: "petType",
      label: "Tipo de mascota",
      type: "select",
      sourceId: "new-service-pet-type",
      required: true,
      options: ["Perro", "Gato", "Ave", "Otro"],
    },
    {
      key: "petSize",
      label: "Tamaño",
      type: "select",
      sourceId: "new-service-pet-size",
      required: true,
      options: ["Pequeño", "Mediano", "Grande"],
    },
  ],
  "Full Day": [
    { key: "fullDayHours", label: "Horas contratadas", type: "number", sourceId: "new-service-full-day-hours", required: true, min: "1" },
    { key: "fullDayZone", label: "Ciudad o zona principal", type: "text", sourceId: "new-service-full-day-zone", required: true },
    {
      key: "fullDayNotes",
      label: "Requerimientos especiales",
      type: "textarea",
      sourceId: "new-service-full-day-notes",
      required: false,
    },
  ],
  "Punto a punto": [],
  "Larga distancia": [],
  Personalizado: [],
};

const serviceCustomerCreationState = {
  selectedType: "",
  duplicateCustomer: null,
};

const serviceAssignmentState = {
  serviceId: "",
  searchTerm: "",
  pendingAction: null,
  showCollaborators: false,
};

const servicesViewState = {
  mode: "active",
  historySearchTerm: "",
};

const servicesFilterState = {
  search: "",
  dates: [],
  statuses: [],
  types: [],
};

const serviceDetailState = {
  serviceId: "",
  editMode: false,
  cancelMode: false,
  originalType: "",
  activeType: "",
  pendingType: "",
  originalSpecificValues: {},
  typeChangeConfirmed: false,
};

const serviceFinancialState = {
  returnToDetail: false,
};

const CLOSED_SERVICE_STATUSES = ["Cancelado", "Finalizado", "No show", "No realizado"];
const SERVICE_CANCELLATION_REASONS = [
  { code: "CLIENT_REQUEST", label: "Cancelación solicitada por el cliente" },
  { code: "BOOKING_ERROR", label: "Error en la reserva" },
  { code: "SCHEDULE_CHANGE", label: "Cambio de fecha u horario" },
  { code: "DUPLICATE_SERVICE", label: "Servicio duplicado" },
  { code: "NO_OPERATIONAL_AVAILABILITY", label: "Falta de disponibilidad operativa" },
  { code: "COLLABORATOR_ISSUE", label: "Incidencia con el colaborador" },
  { code: "VEHICLE_ISSUE", label: "Incidencia con el vehículo" },
  { code: "CONDITIONS_NOT_ACCEPTED", label: "Condiciones del servicio no aceptadas" },
  { code: "PAYMENT_ISSUE", label: "Falta de pago o garantía" },
  { code: "OTHER", label: "Otro motivo" },
];
const SERVICE_ASSIGNMENT_CONFLICT_THRESHOLD_MINUTES = 60;
let isServicesUpdatedListenerRegistered = false;

// =========================
// Inicializacion y estado de vista
// =========================

function initServices() {
  initServicesUpdatedListener();
  ensureServiceFinancialSettings();
  reconcileAllServiceFinancials();
  ensureServiceFinancialModals();
  reconcileInProgressServicesWithoutPortalAccess();
  reconcileExpiredServices();
  renderServicesSummary();
  renderServicesList();
  initServicesListControls();
  initServiceAssignmentControls();
  initServiceDetailControls();
  initServiceFinancialControls();
  initServicesHistoryControls();
  initNewServiceModal();
  initServicesFilterControls();
  initServicesSearchControls();
}

function initServicesUpdatedListener() {
  if (isServicesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:services-updated", refreshServicesFromServicesUpdate);
  window.addEventListener("elara:receivables-updated", refreshServicesFromReceivablesUpdate);
  isServicesUpdatedListenerRegistered = true;
}

function ensureServiceFinancialSettings() {
  if (!servicesData.financialSettings) {
    servicesData.financialSettings = { ...SERVICE_FINANCIAL_DEFAULT_SETTINGS };
    return;
  }

  servicesData.financialSettings = {
    ...SERVICE_FINANCIAL_DEFAULT_SETTINGS,
    ...servicesData.financialSettings,
    vatRate: normalizeServiceVatRate(servicesData.financialSettings.vatRate),
  };
}

function reconcileAllServiceFinancials() {
  (servicesData.services || []).forEach(reconcileServicePaymentStatus);
}

function roundMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function calculateServiceFinancialSummary(service) {
  const financial = getNormalizedServiceFinancial(service);
  const payments = getValidServicePaymentMovements(financial.payments);
  const paidAmount = roundMoney(payments.reduce((total, payment) => total + payment.amount, 0));
  const basePrice = getNullableMoneyValue(financial.basePrice);
  const vatRateApplied = basePrice === null ? normalizeServiceVatRate(financial.vatRateApplied) : normalizeServiceVatRate(financial.vatRateApplied);
  const vatAmount = basePrice === null ? 0 : roundMoney((basePrice * vatRateApplied) / 100);
  const totalPrice = basePrice === null ? null : roundMoney(basePrice + vatAmount);
  const pendingAmount = totalPrice === null ? 0 : roundMoney(Math.max(totalPrice - paidAmount, 0));
  const storedStatus = normalizeServicePaymentStatus(financial.paymentStatus);
  const paymentStatus = getDerivedServicePaymentStatus({
    storedStatus,
    totalPrice,
    paidAmount,
    pendingAmount,
    writeOff: financial.writeOff,
  });

  return {
    currency: "EUR",
    basePrice,
    vatRateApplied,
    vatAmount,
    totalPrice,
    paymentStatus,
    payments,
    paidAmount,
    pendingAmount,
    writeOff: financial.writeOff || null,
  };
}

function reconcileServicePaymentStatus(service) {
  if (!service) {
    return null;
  }

  const previousFinancial = service.financial || {};
  const summary = calculateServiceFinancialSummary(service);

  service.financial = {
    currency: "EUR",
    basePrice: summary.basePrice,
    vatRateApplied: summary.vatRateApplied,
    vatAmount: summary.vatAmount,
    totalPrice: summary.totalPrice,
    paymentStatus: summary.paymentStatus,
    payments: summary.payments,
    paidAmount: summary.paidAmount,
    pendingAmount: summary.pendingAmount,
    ...(previousFinancial.collectionStatus ? { collectionStatus: previousFinancial.collectionStatus } : {}),
    ...(previousFinancial.collectionMethod ? { collectionMethod: previousFinancial.collectionMethod } : {}),
    ...(previousFinancial.collectionDate ? { collectionDate: previousFinancial.collectionDate } : {}),
    ...(previousFinancial.collectionReference ? { collectionReference: previousFinancial.collectionReference } : {}),
    ...(summary.writeOff ? { writeOff: summary.writeOff } : {}),
  };

  if (!service.billing) {
    service.billing = {
      invoiceStatus: "No emitida",
      invoiceId: null,
    };
  }

  return service.financial;
}

function getNormalizedServiceFinancial(service) {
  const financial = service?.financial || {};
  const basePrice = getNullableMoneyValue(financial.basePrice);
  const legacyPrice = getNullableMoneyValue(getServiceLegacyPriceNumber(service));
  const resolvedBasePrice = basePrice !== null ? basePrice : legacyPrice;
  const hasAppliedVat = financial.vatRateApplied !== undefined && financial.vatRateApplied !== null && financial.vatRateApplied !== "";
  const vatRateApplied = hasAppliedVat ? normalizeServiceVatRate(financial.vatRateApplied) : resolvedBasePrice === null ? 0 : getServiceGlobalVatRate();

  return {
    currency: "EUR",
    basePrice: resolvedBasePrice,
    vatRateApplied,
    vatAmount: getMoneyValue(financial.vatAmount),
    totalPrice: getNullableMoneyValue(financial.totalPrice),
    paymentStatus: normalizeServicePaymentStatus(financial.paymentStatus),
    payments: Array.isArray(financial.payments) ? financial.payments : [],
    paidAmount: getMoneyValue(financial.paidAmount),
    pendingAmount: getMoneyValue(financial.pendingAmount),
    writeOff: normalizeServiceWriteOff(financial.writeOff),
  };
}

function getDerivedServicePaymentStatus({ storedStatus, totalPrice, paidAmount, writeOff }) {
  if (storedStatus === "Reembolsado") {
    return "Reembolsado";
  }

  if (writeOff) {
    return "Incobrable";
  }

  if (totalPrice === null) {
    return "Sin definir";
  }

  if (paidAmount === 0) {
    return "Pendiente";
  }

  if (paidAmount < totalPrice) {
    return "Parcial";
  }

  return "Pagado";
}

function getValidServicePaymentMovements(payments) {
  return (Array.isArray(payments) ? payments : [])
    .filter((payment) => payment && payment.type === "payment" && payment.status !== "Anulado")
    .map((payment) => ({
      ...payment,
      amount: roundMoney(payment.amount),
      method: SERVICE_FINANCIAL_PAYMENT_METHODS.includes(payment.method) ? payment.method : "Efectivo",
      status: payment.status || "Registrado",
    }))
    .filter((payment) => payment.amount > 0);
}

function normalizeServiceWriteOff(writeOff) {
  if (!writeOff || typeof writeOff !== "object") {
    return null;
  }

  const amount = roundMoney(writeOff.amount);

  if (amount <= 0) {
    return null;
  }

  return {
    amount,
    reason: String(writeOff.reason || "").trim(),
    authorizedByUserId: String(writeOff.authorizedByUserId || "").trim(),
    authorizedByName: String(writeOff.authorizedByName || "").trim(),
    authorizedAt: String(writeOff.authorizedAt || "").trim(),
  };
}

function normalizeServicePaymentStatus(status) {
  const normalizedStatus = String(status || "").trim();

  return SERVICE_FINANCIAL_PAYMENT_STATUSES.includes(normalizedStatus) ? normalizedStatus : "Sin definir";
}

function getNullableMoneyValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalizedValue = String(value).replace(",", ".").replace(/[^\d.-]/g, "");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? roundMoney(parsedValue) : null;
}

function getMoneyValue(value) {
  const moneyValue = getNullableMoneyValue(value);

  return moneyValue === null ? 0 : moneyValue;
}

function normalizeServiceVatRate(value) {
  const vatRate = Number(String(value ?? 0).replace(",", "."));

  return Number.isFinite(vatRate) && vatRate >= 0 ? roundMoney(vatRate) : 0;
}

function getServiceGlobalVatRate() {
  ensureServiceFinancialSettings();

  return normalizeServiceVatRate(servicesData.financialSettings?.vatRate);
}

function canServiceStartWithFinancialData(service) {
  const summary = calculateServiceFinancialSummary(service);

  return Boolean(
    summary.basePrice !== null &&
      summary.totalPrice !== null &&
      summary.totalPrice > 0 &&
      ["Pendiente", "Parcial", "Pagado"].includes(summary.paymentStatus),
  );
}

function refreshServicesFromServicesUpdate(event) {
  const serviceIds = Array.isArray(event?.detail?.serviceIds) ? event.detail.serviceIds : [];
  const serviceId = event?.detail?.serviceId || serviceIds[0] || "";
  const openService = getCurrentServiceDetailService();
  const service = openService || (serviceId ? findServiceById(serviceId) : null);

  renderServicesSummary();
  renderServicesList();

  if (service) {
    refreshCurrentServiceDetailIfOpen(service);
  }
}

function refreshServicesFromReceivablesUpdate() {
  const servicesView = getElement("servicios");
  const openService = getCurrentServiceDetailService();

  if (servicesView && !servicesView.hidden) {
    renderServicesSummary();
    renderServicesList();
  }

  if (openService) {
    refreshCurrentServiceDetailIfOpen(openService);
  }
}

function showServices() {
  showActiveServicesView();
  return;
  setText("page-eyebrow", "Módulo Servicios");
  setText("page-title", "Servicios");
  setText("page-summary", "Gestiona reservas, asignaciones, estados, pagos y riesgos operativos desde una única lista.");
  setText("primary-action", "Nuevo servicio");
  setModalTarget("primary-action", "new-service-modal");
}

function showActiveServicesView() {
  reconcileInProgressServicesWithoutPortalAccess();
  reconcileExpiredServices();
  servicesViewState.mode = "active";
  servicesViewState.historySearchTerm = "";
  setText("page-eyebrow", "Módulo Servicios");
  setText("page-title", "Servicios");
  setText("page-summary", "Gestiona reservas, asignaciones, estados, pagos y riesgos operativos desde una única lista.");
  setText("primary-action", "Nuevo servicio");
  setModalTarget("primary-action", "new-service-modal");
  const primaryAction = getElement("primary-action");
  const historySearch = getElement("services-history-search");

  if (primaryAction) {
    primaryAction.hidden = false;
  }

  if (historySearch) {
    historySearch.value = "";
  }

  syncServicesFilterStateFromControls();
  renderServicesViewState();
  renderServicesList();
}

function showServicesHistoryView() {
  reconcileExpiredServices();
  servicesViewState.mode = "history";
  setText("page-eyebrow", "Servicios");
  setText("page-title", "Historial de servicios");
  setText("page-summary", "Consulta los servicios cerrados y su información histórica.");
  setModalTarget("primary-action", "");

  const primaryAction = getElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = true;
  }

  renderServicesViewState();
  renderServicesHistoryList();
}

// =========================
// Render principal
// =========================

function renderServicesSummary() {
  const container = getElement("services-summary");

  container.innerHTML = getServicesSummary(getActiveServices())
    .map(
      (metric) => `
        <article class="summary-card summary-card--${metric.tone}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </article>
      `,
    )
    .join("");
}

function getServicesSummary(services) {
  const sourceServices = Array.isArray(services) ? services : [];
  const metrics = sourceServices.reduce(
    (acc, service) => {
      const displayStatus = getServiceDisplayStatus(service);

      if (!serviceSummaryDisplayStatuses.includes(displayStatus)) {
        return acc;
      }

      acc.total += 1;

      if (displayStatus === "Por asignar") {
        acc.unassigned += 1;
      } else if (displayStatus === "Por aceptar") {
        acc.awaitingAcceptance += 1;
      } else if (displayStatus === "Confirmado") {
        acc.confirmed += 1;
      } else if (displayStatus === "En curso") {
        acc.inProgress += 1;
      }

      return acc;
    },
    {
      total: 0,
      unassigned: 0,
      awaitingAcceptance: 0,
      confirmed: 0,
      inProgress: 0,
    },
  );

  return [
    {
      label: "Total",
      value: String(metrics.total),
      tone: "neutral",
    },
    {
      label: "Por asignar",
      value: String(metrics.unassigned),
      tone: "warning",
    },
    {
      label: "Por aceptar",
      value: String(metrics.awaitingAcceptance),
      tone: "warning",
    },
    {
      label: "Confirmados",
      value: String(metrics.confirmed),
      tone: "success",
    },
    {
      label: "En curso",
      value: String(metrics.inProgress),
      tone: "info",
    },
  ];
}

function renderServicesList() {
  const container = getElement("services-list");
  const services = getFilteredServices();

  if (!services.length) {
    container.innerHTML = '<p class="service-assignment-empty">No se encontraron servicios.</p>';
    return;
  }

  container.innerHTML = services
    .map(({ service, index }) => {
      const serviceId = ensureServiceId(service, index);
      const statusClass = getServiceStatusClass(service);
      const route = getServiceRoute(service);
      const serviceTypeIcon = serviceTypeIconByName[service.type] || "fa-car";
      const visibleClient = getServiceListClientName(service);
      const assignmentNotApplicable = !canServiceAssignmentBeChanged(service);
      const serviceInProgress = isServiceInProgress(service);
      const operationLabel = getServiceDisplayStatus(service);
      const assignmentButton = serviceInProgress
        ? `<button class="button button--compact service-assignment-button" type="button" disabled aria-disabled="true" title="No se puede reasignar un servicio en curso.">Reasignar</button>`
        : assignmentNotApplicable
          ? ""
        : `<button class="button button--compact service-assignment-button" type="button" data-service-id="${escapeHtml(serviceId)}">${escapeHtml(getServiceAssignmentActionLabel(service))}</button>`;

      return `
        <article class="operation-card services-list-grid ${statusClass}">
          <div class="operation-card__marker" aria-hidden="true"></div>
          <time class="operation-card__time">${escapeHtml(formatServiceDateTime(service))}</time>
          <div class="operation-card__type" title="${escapeHtml(service.type)}" aria-label="${escapeHtml(service.type)}">
            <i class="fa-solid ${serviceTypeIcon} service-type-icon" aria-hidden="true"></i>
          </div>
          <strong class="operation-card__client">${escapeHtml(visibleClient)}</strong>
          <p class="operation-card__route">${route}</p>
          <span class="operation-card__collaborator">${escapeHtml(operationLabel)}</span>
          ${getServiceFinancialListHtml(service)}
          <div class="operation-card__actions">
            ${assignmentButton}
            <button class="button button--compact button--muted service-detail-button" type="button" data-service-id="${escapeHtml(serviceId)}">Detalle</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderServicesViewState() {
  const activePanel = getElement("services-active-panel");
  const historyPanel = getElement("services-history-panel");
  const summary = getElement("services-summary");
  const historyAction = getElement("services-history-action");
  const isHistory = servicesViewState.mode === "history";

  if (activePanel) {
    activePanel.hidden = isHistory;
  }

  if (historyPanel) {
    historyPanel.hidden = !isHistory;
  }

  if (summary) {
    summary.hidden = isHistory;
  }

  if (historyAction) {
    historyAction.hidden = false;
    historyAction.textContent = isHistory ? "Volver a servicios" : "Historial";
  }
}

function renderServicesHistoryList() {
  const container = getElement("services-history-list");
  const services = getFilteredClosedServices();

  if (!container) {
    return;
  }

  if (!services.length) {
    container.innerHTML = '<p class="service-assignment-empty">No hay servicios en el historial.</p>';
    return;
  }

  container.innerHTML = services
    .map(({ service, index }) => {
      const serviceId = ensureServiceId(service, index);
      const statusClass = getServiceStatusClass(service);
      const route = getServiceRoute(service);
      const serviceTypeIcon = serviceTypeIconByName[service.type] || "fa-car";
      const visibleClient = getServiceListClientName(service);
      const collaborator = getServiceAssignedCollaboratorName(service) || "Sin asignar";

      return `
        <article class="operation-card services-list-grid ${statusClass}">
          <div class="operation-card__marker" aria-hidden="true"></div>
          <time class="operation-card__time">${escapeHtml(formatServiceDateTime(service))}</time>
          <div class="operation-card__type" title="${escapeHtml(service.type)}" aria-label="${escapeHtml(service.type)}">
            <i class="fa-solid ${serviceTypeIcon} service-type-icon" aria-hidden="true"></i>
          </div>
          <strong class="operation-card__client">${escapeHtml(visibleClient)}</strong>
          <p class="operation-card__route">${route}</p>
          <span class="operation-card__collaborator">${escapeHtml(collaborator)}</span>
          <span class="operation-card__payment">${escapeHtml(getServiceHistoryStatusLabel(service))}</span>
          <div class="operation-card__actions">
            <button class="button button--compact button--muted service-history-detail-button" type="button" data-service-id="${escapeHtml(serviceId)}">Detalle</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getFilteredClosedServices() {
  const searchTerm = servicesViewState.historySearchTerm;

  return getClosedServices()
    .map((service, index) => ({ service, index }))
    .filter(({ service }) => !searchTerm || getServiceHistorySearchHaystack(service).includes(searchTerm));
}

function getClosedServices() {
  return servicesData.services.filter((service) => isClosedService(service));
}

function reconcileExpiredServices({ emitEvent = true } = {}) {
  const todayStart = getServiceLocalDayStart(new Date());
  const expiredServices = servicesData.services.filter((service) => isServiceExpiredWithoutCompletion(service, todayStart));

  if (!expiredServices.length) {
    return [];
  }

  const closedAt = new Date().toISOString();

  expiredServices.forEach((service) => {
    markServiceAsExpiredNotCompleted(service, closedAt);
    registerServiceExpiredNotCompletedActivity(service);
  });

  if (emitEvent) {
    window.dispatchEvent(
      new CustomEvent("elara:services-updated", {
        detail: {
          reason: "expired-services-reconciled",
          serviceIds: expiredServices.map(getServiceIdentifier),
        },
      }),
    );
  }

  return expiredServices;
}

function reconcileInProgressServicesWithoutPortalAccess() {
  const affectedServices = servicesData.services.filter(isInProgressServiceWithoutActivePortalAccess);

  if (!affectedServices.length) {
    return [];
  }

  affectedServices.forEach((service) => {
    const serviceId = getServiceIdentifier(service);
    const collaboratorId = getServiceAssignedCollaboratorId(service);

    console.warn("[ELARA] Servicio En curso sin acceso activo al Portal reconciliado:", serviceId, collaboratorId);
    moveInvalidInProgressServiceToPreviousState(service);
  });

  if (window.ElaraCollaborators && typeof window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses === "function") {
    window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses();
  }

  window.dispatchEvent(
    new CustomEvent("elara:services-updated", {
      detail: {
        reason: "in-progress-portal-access-reconciled",
        serviceIds: affectedServices.map(getServiceIdentifier),
      },
    }),
  );

  return affectedServices;
}

function isInProgressServiceWithoutActivePortalAccess(service) {
  if (!isServiceInProgress(service)) {
    return false;
  }

  const collaboratorId = getServiceAssignedCollaboratorId(service);

  if (!collaboratorId) {
    return false;
  }

  const access = getServiceAssignmentPortalAccessStatus(collaboratorId);

  return Boolean(access && access.status !== "active");
}

function moveInvalidInProgressServiceToPreviousState(service) {
  const assignmentStatus = normalizeServiceDetailText(service?.assignmentStatus || "");

  service.previousServiceStatus = service.previousServiceStatus || service.status;
  service.status = assignmentStatus === "aceptado" ? "Confirmado" : "Pendiente";

  if (!service.assignmentStatus) {
    service.assignmentStatus = "Pendiente";
  }

  if (service.startedAt) {
    service.previousStartedAt = service.previousStartedAt || service.startedAt;
    service.startedAt = "";
  }

  if (service.driverStage) {
    service.previousDriverStage = service.previousDriverStage || service.driverStage;
    service.driverStage = "";
  }

  if (service.stageUpdatedAt) {
    service.previousStageUpdatedAt = service.previousStageUpdatedAt || service.stageUpdatedAt;
    service.stageUpdatedAt = "";
  }
}

function isServiceExpiredWithoutCompletion(service, todayStart) {
  const status = normalizeServiceStatus(getServiceDetailStatus(service));

  return (
    ["Pendiente", "Confirmado"].includes(status) &&
    !service.startedAt &&
    !service.driverStage &&
    isServiceScheduledBeforeLocalDay(service, todayStart)
  );
}

function isServiceScheduledBeforeLocalDay(service, todayStart) {
  const serviceDate = getServiceLocalDateOnly(service);

  return Boolean(serviceDate && serviceDate.getTime() < todayStart.getTime());
}

function getServiceLocalDateOnly(service) {
  const rawDate = getServiceDetailDate(service);

  if (!rawDate || rawDate === "Sin definir") {
    return null;
  }

  const dateParts = getServiceDateParts(rawDate);

  if (!dateParts) {
    return null;
  }

  return getServiceLocalDayStart(new Date(dateParts.year, dateParts.month - 1, dateParts.day));
}

function getServiceLocalDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getServiceDateParts(rawDate) {
  const normalizedDate = String(rawDate || "").trim().split("T")[0];
  const slashMatch = normalizedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const dashMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (slashMatch) {
    return {
      day: Number(slashMatch[1]),
      month: Number(slashMatch[2]),
      year: Number(slashMatch[3]),
    };
  }

  if (dashMatch) {
    return {
      year: Number(dashMatch[1]),
      month: Number(dashMatch[2]),
      day: Number(dashMatch[3]),
    };
  }

  return null;
}

function markServiceAsExpiredNotCompleted(service, closedAt) {
  service.previousServiceStatus = service.status || "";
  service.previousAssignmentStatus = service.assignmentStatus || "";
  service.status = "No realizado";
  service.closedAt = closedAt;
  service.closedReasonCode = "SERVICE_EXPIRED";
  service.closedReason = "Servicio vencido sin realizar";
  service.requiresReassignment = false;
}

function isClosedService(service) {
  return CLOSED_SERVICE_STATUSES.includes(normalizeServiceStatus(getServiceDetailStatus(service)));
}

function getServiceHistorySearchHaystack(service) {
  const values = [
    getServiceIdentifier(service),
    getServiceListClientName(service),
    service.type,
    service.origin,
    service.destination,
    getServiceAssignedCollaboratorName(service),
    getServiceDetailStatus(service),
    getServiceCancellationReasonText(service),
    getServiceFinalizedClosureDetailText(service),
    getServiceNoShowClosureDetailText(service),
  ];

  return normalizeServiceListSearchText(values.filter(Boolean).join(" "));
}

function getServiceHistoryStatusLabel(service) {
  return normalizeServiceStatus(getServiceDetailStatus(service)) || getServiceDetailStatus(service);
}

function getServiceHistoryClosureReasonLabel(service) {
  const reason = service.closureReason || "";
  const details = service.closureReasonDetails || "";

  if (!reason) {
    return "";
  }

  if (service.closureReasonCode === "OTHER" && details) {
    return `Otro motivo: ${details}`;
  }

  return reason;
}

function getFilteredServices() {
  const searchTerm = servicesFilterState.search;

  return getActiveServices()
    .map((service, index) => ({ service, index }))
    .filter(({ service }) => matchesServiceListFilters(service, servicesFilterState))
    .filter(({ service }) => !searchTerm || getServiceListSearchHaystack(service).includes(searchTerm))
    .slice()
    .sort((first, second) => compareServicesChronologically(first.service, second.service));
}

function getActiveServices() {
  return servicesData.services.filter((service) => !isClosedService(service));
}

function syncServicesFilterStateFromControls() {
  servicesFilterState.search = normalizeServiceListSearchText(getInputValue("services-search"));
  syncServicesFilterChipsFromControls();
}

function syncServicesFilterSearchFromControls() {
  servicesFilterState.search = normalizeServiceListSearchText(getInputValue("services-search"));
}

function syncServicesFilterChipsFromControls() {
  const filterMenu = document.querySelector("[data-services-clear]")?.closest(".customer-filter__menu");

  servicesFilterState.dates = [];
  servicesFilterState.statuses = [];
  servicesFilterState.types = [];

  if (!filterMenu) {
    return;
  }

  filterMenu.querySelectorAll(".customer-filter__group").forEach((group) => {
    const groupName = normalizeServiceListSearchText(group.querySelector("strong")?.textContent);
    const selectedLabels = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map((input) =>
      normalizeServiceListSearchText(input.closest("label")?.textContent),
    );

    if (groupName.includes("fecha")) {
      servicesFilterState.dates = selectedLabels;
    } else if (groupName.includes("estado")) {
      servicesFilterState.statuses = selectedLabels;
    } else if (groupName.includes("tipo")) {
      servicesFilterState.types = selectedLabels;
    }
  });
}

function resetServicesFilterState() {
  servicesFilterState.search = "";
  servicesFilterState.dates = [];
  servicesFilterState.statuses = [];
  servicesFilterState.types = [];
}

function clearServicesFilters() {
  const searchInput = getElement("services-search");
  const filterMenu = document.querySelector("[data-services-clear]")?.closest(".customer-filter__menu");

  if (searchInput) {
    searchInput.value = "";
  }

  if (filterMenu) {
    filterMenu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
  }

  resetServicesFilterState();
  renderServicesList();
}

function matchesServiceListFilters(service, filters) {
  const serviceType = normalizeServiceListSearchText(service.type);

  return (
    (!filters.dates.length || filters.dates.some((filterValue) => matchesServiceDateFilter(service, filterValue))) &&
    (!filters.statuses.length || filters.statuses.some((filterValue) => matchesServiceStatusFilter(service, filterValue))) &&
    (!filters.types.length || filters.types.includes(serviceType))
  );
}

function matchesServiceDateFilter(service, filterValue) {
  const serviceDate = getServiceListDateValue(service);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  if (!serviceDate) {
    return false;
  }

  const diffDays = Math.round((serviceDate.getTime() - today.getTime()) / 86400000);

  if (filterValue === "hoy") {
    return diffDays === 0;
  }

  if (filterValue === "manana") {
    return diffDays === 1;
  }

  if (filterValue === "esta semana") {
    return diffDays >= 0 && diffDays <= 6;
  }

  return true;
}

function matchesServiceStatusFilter(service, filterValue) {
  const displayStatus = normalizeServiceListSearchText(getServiceDisplayStatus(service));

  return getServiceListStatusAliases(displayStatus).includes(filterValue);
}

function compareServicesChronologically(firstService, secondService) {
  const firstTimestamp = getServiceChronologicalTimestamp(firstService);
  const secondTimestamp = getServiceChronologicalTimestamp(secondService);

  if (firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }

  return getServiceIdentifier(firstService).localeCompare(getServiceIdentifier(secondService), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function getServiceChronologicalTimestamp(service) {
  const dateParts = getServiceDateParts(getServiceDetailDate(service));
  const timeParts = getServiceTimeParts(getServiceDetailTime(service));

  if (!dateParts) {
    return Number.POSITIVE_INFINITY;
  }

  const dateTime = new Date(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes,
    0,
    0,
  );

  return Number.isNaN(dateTime.getTime()) ? Number.POSITIVE_INFINITY : dateTime.getTime();
}

function getServiceTimeParts(rawTime) {
  const timeMatch = String(rawTime || "").trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!timeMatch) {
    return { hours: 0, minutes: 0 };
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function getServiceListDateValue(service) {
  const dateValue = getServiceDetailDate(service);
  const dateMatch = String(dateValue || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!dateMatch) {
    return null;
  }

  const [, day, month, year] = dateMatch;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  parsedDate.setHours(0, 0, 0, 0);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getServiceListStatusAliases(status) {
  const aliasesByStatus = {
    "por asignar": ["por asignar"],
    "por aceptar": ["por aceptar"],
    confirmado: ["confirmado", "confirmados"],
    "en curso": ["en curso"],
  };

  return aliasesByStatus[status] || [status];
}

function getServiceListSearchHaystack(service) {
  const values = [
    getServiceIdentifier(service),
    getServiceListClientName(service),
    service.customerCode,
    service.type,
    service.origin,
    service.destination,
    getServiceAssignedCollaboratorName(service),
    getServiceAssignedCollaborator(service)?.name,
    getServiceDetailStatus(service),
    getServiceAssignmentStatusText(service),
    isServiceRejectedWithoutAssignment(service) ? getServiceRejectedAssignmentText(service) : "",
    getServiceOperationLabel(service),
    getServiceDetailDate(service),
  ];

  return normalizeServiceListSearchText(values.filter(Boolean).join(" "));
}

function normalizeServiceListSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =========================
// Formateadores de servicios
// =========================

function getServiceStatusClass(service) {
  return (
    serviceStatusClassByName[getServiceDisplayStatus(service)] ||
    serviceStatusClassByName[normalizeServiceStatus(service.status)] ||
    "operation-card--neutral"
  );
}

function getServiceDisplayStatus(service) {
  if (isServiceReassignmentRequired(service)) {
    return "Reasignaci\u00f3n requerida";
  }

  const status = normalizeServiceStatus(getServiceDetailStatus(service));
  const collaboratorId = String(service?.collaboratorId || "").trim();
  const assignmentStatus = normalizeServiceDetailText(service?.assignmentStatus || "");
  const isWaitingForAcceptance = ["pendiente", "pendiente de aceptacion"].includes(assignmentStatus);
  const isAcceptedAssignment = ["aceptado", "aceptada"].includes(assignmentStatus);
  const canUseAssignmentDisplayStatus = ["Pendiente", "Confirmado"].includes(status);

  if (canUseAssignmentDisplayStatus && !collaboratorId) {
    return "Por asignar";
  }

  if (canUseAssignmentDisplayStatus && collaboratorId && isWaitingForAcceptance) {
    return "Por aceptar";
  }

  if (canUseAssignmentDisplayStatus && (isAcceptedAssignment || status === "Confirmado")) {
    return "Confirmado";
  }

  return getServiceDetailStatus(service);
}

function setServiceDetailStatusCardClass(service, isViewMode) {
  const statusValue = getElement("summary-service-status");
  const statusField = statusValue?.closest(".modal__field");
  const statusClasses = [
    "status-card--warning",
    "status-card--success",
    "status-card--info",
    "status-card--danger",
    "status-card--neutral",
  ];

  if (!statusField) {
    return;
  }

  statusField.classList.remove(...statusClasses);

  if (!isViewMode) {
    return;
  }

  statusField.classList.add(
    serviceDetailStatusCardClassByName[getServiceDisplayStatus(service)] ||
      serviceDetailStatusCardClassByName[normalizeServiceStatus(getServiceDetailStatus(service))] ||
      "status-card--neutral",
  );
}

function normalizeServiceStatus(status) {
  const normalizedStatus = normalizeServiceListSearchText(status);
  const statusByNormalizedName = {
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    "en curso": "En curso",
    cancelado: "Cancelado",
    finalizado: "Finalizado",
    "no show": "No show",
    "no-show": "No show",
    "no realizado": "No realizado",
    "no-realizado": "No realizado",
  };

  return statusByNormalizedName[normalizedStatus] || status;
}

function initServicesListControls() {
  const list = getElement("services-list");

  if (!list || list.dataset.servicesListReady) {
    return;
  }

  list.dataset.servicesListReady = "true";
  list.addEventListener("click", (event) => {
    const assignmentButton = event.target.closest(".service-assignment-button[data-service-id]");
    const detailButton = event.target.closest(".service-detail-button[data-service-id]");

    if (assignmentButton) {
      openServiceAssignmentModal(assignmentButton.dataset.serviceId);
      return;
    }

    if (!detailButton) {
      return;
    }

    openServiceDetailModal(detailButton.dataset.serviceId);
  });
}

function initServiceAssignmentControls() {
  const searchInput = getElement("service-assignment-search");
  const removeButton = getElement("service-assignment-remove");
  const candidateList = getElement("service-assignment-list");
  const confirmCancelButton = getElement("service-assignment-confirm-cancel");
  const confirmActionButton = getElement("service-assignment-confirm-action");

  if (searchInput && !searchInput.dataset.serviceAssignmentReady) {
    searchInput.dataset.serviceAssignmentReady = "true";
    searchInput.addEventListener("input", () => {
      serviceAssignmentState.searchTerm = normalizeServiceDetailText(searchInput.value);
      renderServiceAssignmentCandidates();
    });
  }

  if (removeButton && !removeButton.dataset.serviceAssignmentReady) {
    removeButton.dataset.serviceAssignmentReady = "true";
    removeButton.addEventListener("click", confirmRemoveServiceAssignment);
  }

  if (candidateList && !candidateList.dataset.serviceAssignmentReady) {
    candidateList.dataset.serviceAssignmentReady = "true";
    candidateList.addEventListener("click", (event) => {
      const collaboratorsToggle = event.target.closest("[data-service-assignment-toggle-collaborators]");
      const candidateButton = event.target.closest("[data-service-assignment-candidate]");

      if (collaboratorsToggle) {
        serviceAssignmentState.showCollaborators = !serviceAssignmentState.showCollaborators;
        renderServiceAssignmentCandidates();
        return;
      }

      if (candidateButton) {
        confirmServiceAssignmentCandidate(candidateButton.dataset.serviceAssignmentCandidate);
      }
    });
  }

  if (confirmCancelButton && !confirmCancelButton.dataset.serviceAssignmentReady) {
    confirmCancelButton.dataset.serviceAssignmentReady = "true";
    confirmCancelButton.addEventListener("click", cancelServiceAssignmentConfirmation);
  }

  if (confirmActionButton && !confirmActionButton.dataset.serviceAssignmentReady) {
    confirmActionButton.dataset.serviceAssignmentReady = "true";
    confirmActionButton.addEventListener("click", confirmServiceAssignmentAction);
  }
}

function openServiceAssignmentModal(serviceId) {
  reconcileExpiredServices();
  const service = findServiceAssignmentServiceById(serviceId);

  if (!service) {
    notifyNewService("No se encontro el servicio seleccionado.", "error");
    return;
  }

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    return;
  }

  serviceAssignmentState.serviceId = service.serviceId;
  serviceAssignmentState.searchTerm = "";
  serviceAssignmentState.pendingAction = null;
  serviceAssignmentState.showCollaborators = false;

  const searchInput = getElement("service-assignment-search");

  if (searchInput) {
    searchInput.value = "";
  }

  renderServiceAssignmentModal();
  openServiceModal("service-assignment-modal");
}

function renderServiceAssignmentModal() {
  const service = getCurrentServiceAssignmentService();

  if (!service) {
    return;
  }

  const assignedCollaborator = getServiceAssignedCollaborator(service);
  const assignedVehicle = getServiceAssignmentVehicleForService(service);
  const isAssigned = Boolean(assignedCollaborator);
  const isRejectedWithoutAssignment = isServiceRejectedWithoutAssignment(service);

  setText(
    "service-assignment-title",
    isRejectedWithoutAssignment ? "Reasignar conductor" : isAssigned ? "Reasignar colaborador" : "Asignar colaborador",
  );
  setText(
    "service-assignment-description",
    isRejectedWithoutAssignment
      ? "El conductor anterior rechaz\u00f3 la asignaci\u00f3n. Selecciona un nuevo conductor apto."
      : isAssigned
      ? "Revisa la asignación actual y selecciona un nuevo colaborador."
      : "Selecciona un colaborador con vehículo apto para este servicio.",
  );
  setText("service-assignment-number", getServiceIdentifier(service));
  setText("service-assignment-type", service.type || "Sin tipo");
  setText("service-assignment-date", getServiceDetailDate(service));
  setText("service-assignment-time", getServiceDetailTime(service));
  setText("service-assignment-origin", service.origin || "Sin origen");
  setText("service-assignment-destination", service.destination || "Sin destino");
  setText(
    "service-assignment-current",
    isRejectedWithoutAssignment ? getServiceRejectedAssignmentText(service) : getServiceAssignmentCurrentText(assignedCollaborator, assignedVehicle),
  );

  const removeButton = getElement("service-assignment-remove");

  if (removeButton) {
    removeButton.hidden = !isAssigned;
  }

  renderServiceAssignmentViewMode();
  renderServiceAssignmentCandidates();
}

function renderServiceAssignmentViewMode() {
  const hasConfirmation = Boolean(serviceAssignmentState.pendingAction);
  const currentService = getCurrentServiceAssignmentService();
  const assignedCollaborator = currentService ? getServiceAssignedCollaborator(currentService) : null;
  const listView = getElement("service-assignment-list-view");
  const confirmation = getElement("service-assignment-confirm");
  const closeButton = getElement("service-assignment-close");
  const removeButton = getElement("service-assignment-remove");
  const canChangeAssignment = currentService ? canServiceAssignmentBeChanged(currentService) : false;

  if (listView) {
    listView.hidden = hasConfirmation;
  }

  if (confirmation) {
    confirmation.hidden = !hasConfirmation;
  }

  if (closeButton) {
    closeButton.hidden = hasConfirmation;
  }

  if (removeButton) {
    removeButton.hidden = hasConfirmation || !assignedCollaborator || !canChangeAssignment;
  }
}

function renderServiceAssignmentCandidates() {
  const list = getElement("service-assignment-list");

  if (!list) {
    return;
  }

  const service = getCurrentServiceAssignmentService();
  const assignableCandidates = getServiceAssignableCollaboratorsForService(service);
  const choferCandidates = getSortedServiceAssignmentCandidates(assignableCandidates, service)
    .filter((candidate) => getServiceAssignmentDriverType(candidate.collaborator) === "Chofer")
    .filter(matchesServiceAssignmentSearch);
  const collaboratorCandidates = serviceAssignmentState.showCollaborators
    ? getSortedServiceAssignmentCandidates(assignableCandidates, service)
        .filter((candidate) => getServiceAssignmentDriverType(candidate.collaborator) === "Colaborador")
        .filter(matchesServiceAssignmentSearch)
    : [];
  const collaboratorsToggleLabel = serviceAssignmentState.showCollaborators ? "Ocultar colaboradores" : "Ver colaboradores";

  if (!service) {
    list.innerHTML = '<p class="service-assignment-empty">No hay candidatos asignables con este criterio.</p>';
    return;
  }

  list.innerHTML = `
    <div class="service-assignment-group">
      ${
        choferCandidates.length
          ? choferCandidates.map((candidate) => renderServiceAssignmentCandidate(candidate, service)).join("")
          : '<p class="service-assignment-empty">No hay choferes disponibles para este servicio.</p>'
      }
    </div>
    <button class="button button--compact button--muted service-assignment-toggle" type="button" data-service-assignment-toggle-collaborators>${collaboratorsToggleLabel}</button>
    ${
      serviceAssignmentState.showCollaborators
        ? `<div class="service-assignment-group">
            ${
              collaboratorCandidates.length
                ? collaboratorCandidates.map((candidate) => renderServiceAssignmentCandidate(candidate, service)).join("")
                : '<p class="service-assignment-empty">No hay colaboradores disponibles para este servicio.</p>'
            }
          </div>`
        : ""
    }
  `;
}

function renderServiceAssignmentCandidate(candidate, service) {
  const vehicleText = getServiceAssignmentVehicleText(candidate.vehicle);
  const plate = getServiceAssignmentVehiclePlate(candidate.vehicle);
  const operationalStatus = getServiceAssignmentOperationalStatus(candidate.collaborator);
  const isCurrent = isServiceAssignedToCollaborator(service, candidate.collaborator);
  const isPreviousRejector = isServicePreviousRejectorCandidate(service, candidate.collaborator);
  const actionLabel = isCurrent ? "Actual" : isServiceAssigned(service) || isServiceRejectedWithoutAssignment(service) ? "Reasignar" : "Asignar";

  return `
    <article class="service-assignment-item">
      <div class="service-assignment-item__content">
        <div class="service-assignment-item__name-row">
          <strong>${escapeHtml(candidate.collaborator.name)}</strong>
          <span class="service-assignment-item__driver-type">${escapeHtml(getServiceAssignmentDriverType(candidate.collaborator))}</span>
          ${isPreviousRejector ? '<span class="service-assignment-item__rejector">Rechazó este servicio</span>' : ""}
        </div>
        <span>${escapeHtml(vehicleText)} · ${escapeHtml(plate)}</span>
        <small>Estado operativo: ${escapeHtml(operationalStatus)}</small>
      </div>
      <button class="button button--compact${isCurrent ? " button--muted" : ""}" type="button" data-service-assignment-candidate="${escapeHtml(candidate.collaborator.id)}">${actionLabel}</button>
    </article>
  `;
}

function confirmServiceAssignmentCandidate(collaboratorId) {
  const service = getCurrentServiceAssignmentService();
  const collaborator = getServiceCollaboratorById(collaboratorId);
  const vehicle = collaborator ? getServiceAssignmentVehicle(collaborator) : null;

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    serviceAssignmentState.pendingAction = null;
    renderServiceAssignmentModal();
    return;
  }

  if (!service || !collaborator || !vehicle || !isServiceCollaboratorAdministrativelyAssignable(collaborator) || !isServiceAssignmentVehicleAssignable(vehicle)) {
    notifyNewService("No se pudo completar la asignación del servicio.", "error");
    renderServiceAssignmentModal();
    return;
  }

  if (isServiceAssignedToCollaborator(service, collaborator)) {
    notifyNewService("Este colaborador ya está asignado al servicio.", "info");
    return;
  }

  if (isServicePreviousRejectorCandidate(service, collaborator)) {
    openServiceAssignmentConfirmation({
      type: "assign",
      collaboratorId,
      title: "Confirmar reasignaci\u00f3n",
      message: "Este conductor ya rechaz\u00f3 este servicio. \u00bfQuieres volver a asign\u00e1rselo?",
      confirmLabel: "Reasignar de todos modos",
      isReassignment: true,
      isPreviousRejector: true,
    });
    return;
  }

  const conflict = getServiceAssignmentTimeConflict(service, collaborator);
  const isReassignment = isServiceAssigned(service) || isServiceRejectedWithoutAssignment(service);
  const currentCollaborator = getServiceAssignedCollaborator(service);
  const vehicleSummary = `${getServiceAssignmentVehicleText(vehicle)} · ${getServiceAssignmentVehiclePlate(vehicle)}`;
  const message = conflict
    ? getServiceAssignmentConflictMessage(collaborator, conflict, vehicleSummary, isReassignment)
    : getServiceAssignmentConfirmationMessage(service, collaborator, currentCollaborator, vehicleSummary);
  const confirmLabel = conflict
    ? isReassignment
      ? "Reasignar de todos modos"
      : "Asignar de todos modos"
    : isReassignment
      ? "Reasignar"
      : "Asignar";

  openServiceAssignmentConfirmation({
    type: "assign",
    collaboratorId,
    title: conflict ? "Advertencia de horario" : isReassignment ? "Confirmar reasignación" : "Confirmar asignación",
    message,
    confirmLabel,
    isReassignment,
  });
}

function confirmRemoveServiceAssignment() {
  const service = getCurrentServiceAssignmentService();
  const collaborator = service ? getServiceAssignedCollaborator(service) : null;
  const vehicle = service ? getServiceAssignmentVehicleForService(service) : null;

  if (!service || !collaborator) {
    return;
  }

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    renderServiceAssignmentModal();
    return;
  }

  openServiceAssignmentConfirmation({
    type: "remove",
    title: "Quitar asignación",
    message: `Vas a quitar la asignación actual de este servicio. Colaborador: ${collaborator.name}. Vehículo: ${getServiceAssignmentVehicleText(vehicle)} · ${getServiceAssignmentVehiclePlate(vehicle)}.`,
    confirmLabel: "Quitar asignación",
  });
}

function openServiceAssignmentConfirmation(action) {
  serviceAssignmentState.pendingAction = action;
  setText("service-assignment-title", action.title);
  setText("service-assignment-confirm-message", action.message);
  setText("service-assignment-confirm-action", action.confirmLabel);
  renderServiceAssignmentViewMode();
  getElement("service-assignment-confirm-action")?.focus();
}

function cancelServiceAssignmentConfirmation() {
  serviceAssignmentState.pendingAction = null;
  renderServiceAssignmentModal();
}

function confirmServiceAssignmentAction() {
  const action = serviceAssignmentState.pendingAction;

  if (!action) {
    return;
  }

  if (action.type === "remove") {
    const service = getCurrentServiceAssignmentService();

    if (!canServiceAssignmentBeChanged(service)) {
      notifyServiceAssignmentChangeBlocked(service);
      serviceAssignmentState.pendingAction = null;
      renderServiceAssignmentModal();
      return;
    }

    removeServiceAssignment();
    return;
  }

  if (shouldPauseServiceAssignmentForPortalAccess(action)) {
    return;
  }

  assignServiceCollaborator(action.collaboratorId);
}

function shouldPauseServiceAssignmentForPortalAccess(action) {
  const service = getCurrentServiceAssignmentService();
  const collaborator = getServiceCollaboratorById(action.collaboratorId);

  if (!service || !collaborator) {
    notifyNewService("No se pudo completar la asignaci\u00f3n del servicio.", "error");
    return true;
  }

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    serviceAssignmentState.pendingAction = null;
    renderServiceAssignmentModal();
    return true;
  }

  const access = getServiceAssignmentPortalAccessStatus(action.collaboratorId);

  if (!access) {
    notifyNewService("No se pudo verificar el acceso del conductor. Int\u00e9ntalo nuevamente.", "error");
    return true;
  }

  if (access.status === "active") {
    return false;
  }

  if (action.portalAccessWarningAccepted && action.portalAccessStatus === access.status) {
    return false;
  }

  openServiceAssignmentConfirmation({
    ...action,
    title: getServicePortalAccessWarningTitle(access.status),
    message: getServicePortalAccessWarningMessage({
      collaborator,
      service,
      access,
      serviceLabel: getServiceIdentifier(service),
    }),
    confirmLabel: action.isReassignment ? "Reasignar de todos modos" : "Asignar de todos modos",
    portalAccessWarningAccepted: true,
    portalAccessStatus: access.status,
  });

  return true;
}

function assignServiceCollaborator(collaboratorId) {
  const service = getCurrentServiceAssignmentService();
  const collaborator = getServiceCollaboratorById(collaboratorId);
  const vehicle = collaborator ? getServiceAssignmentVehicle(collaborator) : null;

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    serviceAssignmentState.pendingAction = null;
    renderServiceAssignmentModal();
    return;
  }

  if (!service || !collaborator || !vehicle || !isServiceCollaboratorAdministrativelyAssignable(collaborator) || !isServiceAssignmentVehicleAssignable(vehicle)) {
    notifyNewService("No se pudo completar la asignación del servicio.", "error");
    serviceAssignmentState.pendingAction = null;
    renderServiceAssignmentModal();
    return;
  }

  const wasAssigned = isServiceAssigned(service);
  const wasRejectedWithoutAssignment = isServiceRejectedWithoutAssignment(service);
  const isPreviousRejector = isServicePreviousRejectorCandidate(service, collaborator);

  service.collaboratorId = collaborator.id;
  service.vehicleId = vehicle.id;
  service.collaborator = collaborator.name;
  service.vehicle = getServiceAssignmentVehicleText(vehicle);
  service.plate = getServiceAssignmentVehiclePlate(vehicle);
  service.assignmentStatus = "Pendiente";
  service.action = "Ver";
  service.requiresReassignment = false;

  if (wasRejectedWithoutAssignment) {
    service.reassignedAt = new Date().toISOString();

    if (isPreviousRejector) {
      service.reassignedToPreviousRejector = true;
    }
  }

  serviceAssignmentState.pendingAction = null;
  renderServicesList();
  refreshCurrentServiceDetailIfOpen(service);
  closeServiceModal(getElement("service-assignment-modal"));
  registerServiceAssignmentActivity(service, collaborator, wasAssigned || wasRejectedWithoutAssignment);
  emitServiceUpdatedEvent(wasAssigned || wasRejectedWithoutAssignment ? "reassigned" : "assigned", service);
  notifyNewService(wasAssigned ? "El servicio se reasignó correctamente." : "El servicio se asignó correctamente.", "success");
}

function removeServiceAssignment() {
  const service = getCurrentServiceAssignmentService();

  if (!service) {
    return;
  }

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    serviceAssignmentState.pendingAction = null;
    renderServiceAssignmentModal();
    return;
  }

  service.collaboratorId = "";
  service.assignedCollaboratorId = "";
  service.driverId = "";
  service.vehicleId = "";
  service.assignedVehicleId = "";
  service.vehicleCode = "";
  service.collaborator = "Sin asignar";
  service.driver = "";
  service.chofer = "";
  service.vehicle = "Pendiente";
  service.vehicleName = "";
  service.plate = "";
  service.vehiclePlate = "";
  service.registration = "";
  service.matricula = "";
  service.assignmentStatus = "";
  service.action = "Asignar";

  serviceAssignmentState.pendingAction = null;
  renderServicesList();
  renderServiceAssignmentModal();
  emitServiceUpdatedEvent("unassigned", service);
  notifyNewService("La asignación del servicio se quitó correctamente.", "success");
}


function getCurrentServiceAssignmentService() {
  return serviceAssignmentState.serviceId ? findServiceById(serviceAssignmentState.serviceId) : null;
}

function resetServiceAssignmentModal() {
  serviceAssignmentState.serviceId = "";
  serviceAssignmentState.searchTerm = "";
  serviceAssignmentState.pendingAction = null;
  serviceAssignmentState.showCollaborators = false;

  const searchInput = getElement("service-assignment-search");

  if (searchInput) {
    searchInput.value = "";
  }

  renderServiceAssignmentViewMode();
}

function getServiceOperationLabel(service) {
  if (isServiceAssignmentNotApplicable(service)) {
    return "No aplica";
  }

  if (isServiceReassignmentRequired(service)) {
    return "Reasignaci\u00f3n requerida";
  }

  if (isServiceRejectedWithoutAssignment(service)) {
    return getServiceRejectedAssignmentText(service);
  }

  const assignedCollaborator = getServiceAssignedCollaborator(service);

  if (assignedCollaborator) {
    const assignmentStatusText = getServiceAssignmentStatusText(service);

    return assignmentStatusText ? `${assignedCollaborator.name} - ${assignmentStatusText}` : assignedCollaborator.name;
  }

  return isServiceAssigned(service) ? getServiceAssignedCollaboratorName(service) : "Sin asignar";
}

function getServiceAssignmentActionLabel(service) {
  if (isServiceReassignmentRequired(service)) {
    return "Reasignar conductor";
  }

  if (isServiceRejectedWithoutAssignment(service)) {
    return "Reasignar conductor";
  }

  return isServiceAssigned(service) ? "Reasignar" : "Asignar";
}

function isServiceReassignmentRequired(service) {
  return Boolean(service?.requiresReassignment && !isClosedService(service) && !isServiceAssigned(service));
}

function isServiceRejectedWithoutAssignment(service) {
  if (!service || isClosedService(service) || normalizeServiceStatus(getServiceDetailStatus(service)) !== "Confirmado") {
    return false;
  }

  const assignmentStatus = normalizeServiceDetailText(service.assignmentStatus || "");
  const vehicleId = service.vehicleId || service.assignedVehicleId || service.vehicleCode || "";

  return Boolean(service.rejectedByDriverId) && !assignmentStatus && !vehicleId && !isServiceAssigned(service);
}

function getServiceRejectedAssignmentText(service) {
  const rejectedCollaborator = getServiceRejectedCollaborator(service);
  const rejectedName = rejectedCollaborator?.name || "Conductor no disponible";
  const rejectedDate = formatServiceClosedAt(service.rejectedAt);

  return `Rechazado por el conductor - ${rejectedName} - ${rejectedDate}`;
}

function getServiceRejectedCollaborator(service) {
  return service?.rejectedByDriverId ? getServiceCollaboratorById(service.rejectedByDriverId) : null;
}

function isServicePreviousRejectorCandidate(service, collaborator) {
  return Boolean(service?.rejectedByDriverId && collaborator?.id && service.rejectedByDriverId === collaborator.id);
}

function getServiceAssignmentStatusText(service) {
  const assignmentStatus = normalizeServiceDetailText(service?.assignmentStatus || "");

  if (assignmentStatus === "pendiente") {
    return "Pendiente de aceptaci\u00f3n";
  }

  if (assignmentStatus === "aceptado") {
    return "Aceptado";
  }

  return "";
}

function isServiceAssignmentNotApplicable(service) {
  return [service.collaborator, service.vehicle].some((value) => normalizeServiceDetailText(value) === "no aplica");
}

function canServiceAssignmentBeChanged(service) {
  if (!service) {
    return false;
  }

  return !isServiceInProgress(service) && !isClosedService(service) && !isServiceAssignmentNotApplicable(service);
}

function notifyServiceAssignmentChangeBlocked(service) {
  if (!service) {
    notifyNewService("No se pudo completar la asignaci\u00f3n del servicio.", "error");
    return;
  }

  if (isServiceInProgress(service)) {
    notifyNewService("No se puede cambiar el conductor de un servicio en curso.", "warning");
    return;
  }

  if (isClosedService(service)) {
    notifyNewService("Este servicio cerrado no admite reasignaci\u00f3n.", "warning");
    return;
  }

  notifyNewService("Este servicio no admite asignaci\u00f3n.", "warning");
}

function isServiceAssigned(service) {
  const collaboratorName = normalizeServiceDetailText(getServiceAssignedCollaboratorName(service));

  return (
    !isServiceAssignmentNotApplicable(service) &&
    (Boolean(getServiceAssignedCollaborator(service)) || (Boolean(collaboratorName) && collaboratorName !== "sin asignar"))
  );
}

function getServiceAssignedCollaboratorName(service) {
  return service.collaborator || service.driver || service.chofer || "";
}

function getServiceAssignedCollaboratorId(service) {
  return service?.collaboratorId || service?.assignedCollaboratorId || service?.driverId || "";
}

function getServiceAssignedCollaborator(service) {
  const collaborators = getServiceCollaborators();
  const collaboratorId = getServiceAssignedCollaboratorId(service);

  if (collaboratorId) {
    const collaboratorById = collaborators.find((collaborator) => collaborator.id === collaboratorId);

    if (collaboratorById) {
      return collaboratorById;
    }
  }

  const collaboratorName = normalizeServiceDetailText(getServiceAssignedCollaboratorName(service));

  if (!collaboratorName || ["sin asignar", "no aplica"].includes(collaboratorName)) {
    return null;
  }

  return collaborators.find((collaborator) => normalizeServiceDetailText(collaborator.name) === collaboratorName) || null;
}

function getServiceCollaboratorById(collaboratorId) {
  return getServiceCollaborators().find((collaborator) => collaborator.id === collaboratorId) || null;
}

function getServiceCollaborators() {
  return window.ElaraCollaboratorsMock?.collaborators || [];
}

function getServiceAssignableCollaborators() {
  return getServiceAssignableCollaboratorsForService(getCurrentServiceAssignmentService());
}

function getServiceAssignableCollaboratorsForService(service) {
  return getServiceCollaborators()
    .map((collaborator) => ({
      collaborator,
      vehicle: getServiceAssignmentVehicle(collaborator),
    }))
    .filter(({ collaborator, vehicle }) =>
      isServiceCollaboratorAdministrativelyAssignable(collaborator) &&
      Boolean(getServiceAssignmentVehicleId(collaborator)) &&
      Boolean(vehicle) &&
      isServiceAssignmentVehicleAssignable(vehicle),
    );
}

function isServiceCollaboratorAdministrativelyAssignable(collaborator) {
  return normalizeServiceDetailText(collaborator?.administrativeStatus) === "activo";
}

function sortRejectedServiceAssignmentCandidateLast(candidates) {
  return getSortedServiceAssignmentCandidates(candidates, getCurrentServiceAssignmentService());
}

function getSortedServiceAssignmentCandidates(candidates, service) {
  return [...candidates].sort((first, second) => {
    const firstIsRejector = isServicePreviousRejectorCandidate(service, first.collaborator);
    const secondIsRejector = isServicePreviousRejectorCandidate(service, second.collaborator);

    if (firstIsRejector === secondIsRejector) {
      return 0;
    }

    return firstIsRejector ? 1 : -1;
  });
}

function matchesServiceAssignmentSearch(candidate) {
  return matchesServiceAssignmentSearchTerm(candidate, serviceAssignmentState.searchTerm);
}

function matchesServiceAssignmentSearchTerm(candidate, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const values = [
    candidate.collaborator.name,
    candidate.vehicle.brand,
    candidate.vehicle.model,
    candidate.vehicle.plate,
    candidate.vehicle.registration,
    candidate.vehicle.matricula,
    getServiceAssignmentOperationalStatus(candidate.collaborator),
    getServiceAssignmentDriverType(candidate.collaborator),
  ];

  return normalizeServiceDetailText(values.filter(Boolean).join(" ")).includes(searchTerm);
}

function getServiceAssignmentVehicleId(collaborator) {
  return collaborator?.vehicleId || (collaborator?.vehicle && collaborator.vehicle.id) || "";
}

function getServiceAssignmentVehicle(collaborator) {
  const vehicleId = getServiceAssignmentVehicleId(collaborator);

  return vehicleId ? getServiceVehicles().find((vehicle) => vehicle.id === vehicleId) || null : null;
}

function getServiceAssignmentVehicleForService(service) {
  const assignedCollaborator = getServiceAssignedCollaborator(service);

  if (assignedCollaborator) {
    const collaboratorVehicle = getServiceAssignmentVehicle(assignedCollaborator);

    if (collaboratorVehicle) {
      return collaboratorVehicle;
    }
  }

  return getServiceDetailVehicle(service);
}

function isServiceAssignmentVehicleAssignable(vehicle) {
  const validDocumentationStatuses = ["al dia", "proxima a vencer"];

  return (
    vehicle &&
    normalizeServiceDetailText(vehicle.availability) === "operativo" &&
    validDocumentationStatuses.includes(normalizeServiceDetailText(vehicle.documentationStatus))
  );
}

function getServiceAssignmentCurrentText(collaborator, vehicle) {
  if (!collaborator) {
    return "Sin asignación actual";
  }

  return `${collaborator.name} · ${getServiceAssignmentVehicleText(vehicle)} · ${getServiceAssignmentVehiclePlate(vehicle)}`;
}

function getServiceAssignmentVehicleText(vehicle) {
  if (!vehicle) {
    return "Sin vehículo";
  }

  return joinFilledValues([vehicle.brand, vehicle.model]).replace(" / ", " ") || "Vehículo sin identificar";
}

function getServiceAssignmentVehiclePlate(vehicle) {
  if (!vehicle) {
    return "Matrícula no indicada";
  }

  return getServiceDetailPlate(vehicle);
}

function getServiceAssignmentOperationalStatus(collaborator) {
  return collaborator.operationalStatus || collaborator.availability || "No disponible";
}

function getServiceAssignmentDriverType(collaborator) {
  return collaborator?.driverType === "Chofer" ? "Chofer" : "Colaborador";
}

function isServiceAssignedToCollaborator(service, collaborator) {
  const assignedCollaborator = getServiceAssignedCollaborator(service);

  return Boolean(assignedCollaborator && collaborator && assignedCollaborator.id === collaborator.id);
}

function getServiceAssignmentConfirmationMessage(service, collaborator, currentCollaborator, vehicleSummary) {
  if (currentCollaborator) {
    return `Vas a reasignar este servicio de ${currentCollaborator.name} a ${collaborator.name}. Nuevo vehículo: ${vehicleSummary}.`;
  }

  return `Vas a asignar este servicio a ${collaborator.name} con el vehículo ${vehicleSummary}.`;
}

function getServiceAssignmentPortalAccessStatus(collaboratorId) {
  const collaboratorApi = window.ElaraCollaborators;

  if (!collaboratorApi || typeof collaboratorApi.getCollaboratorPortalAccessStatus !== "function") {
    console.error("[ELARA] No se pudo verificar el acceso al Portal del conductor:", collaboratorId);
    return null;
  }

  const access = collaboratorApi.getCollaboratorPortalAccessStatus(collaboratorId);

  if (!access || !["active", "inactive", "none"].includes(access.status)) {
    console.error("[ELARA] Estado de acceso al Portal no reconocido:", collaboratorId, access);
    return null;
  }

  return access;
}

function getServicePortalAccessWarningTitle(accessStatus) {
  return accessStatus === "inactive" ? "Conductor sin acceso activo" : "Conductor sin acceso al Portal";
}

function getServicePortalAccessRiskText(accessStatus) {
  if (accessStatus === "inactive") {
    return "Este conductor tiene un usuario vinculado, pero la cuenta est\u00e1 inactiva. No podr\u00e1 ver ni gestionar el servicio desde el Portal.";
  }

  return "Este conductor no tiene un usuario activo vinculado y no podr\u00e1 ver ni gestionar el servicio desde el Portal.";
}

function getServicePortalAccessWarningMessage({ collaborator, service, access, serviceLabel }) {
  return [
    `Conductor seleccionado: ${collaborator.name}.`,
    `Tipo: ${getServiceAssignmentDriverType(collaborator)}.`,
    `Servicio afectado: ${serviceLabel || getServiceIdentifier(service)}.`,
    `Estado de acceso: ${access.label}.`,
    getServicePortalAccessRiskText(access.status),
    "Deber\u00e1s comunicarle la asignaci\u00f3n por otro medio.",
  ].join(" ");
}

function getServiceAssignmentConflictMessage(collaborator, conflict, vehicleSummary, isReassignment) {
  const actionText = isReassignment ? "reasignar" : "asignar";

  return `${collaborator.name} tiene otro servicio programado a las ${conflict.time}. La diferencia entre ambos servicios es de ${conflict.minutes} minutos. Puedes ${actionText} de todos modos con el vehículo ${vehicleSummary}.`;
}

function getServiceAssignmentTimeConflict(service, collaborator) {
  return getServiceAssignmentTimeConflictForService(service, collaborator);
}

function getServiceAssignmentTimeConflictForService(service, collaborator) {
  const targetDateTime = getServiceAssignmentDateTime(service);

  if (!targetDateTime) {
    return null;
  }

  return servicesData.services
    .filter((candidateService, index) => ensureServiceId(candidateService, index) !== getServiceIdentifier(service))
    .filter((candidateService) => !isServiceClosedForAssignment(candidateService))
    .filter((candidateService) => isServiceAssignedToCollaborator(candidateService, collaborator))
    .map((candidateService) => {
      const candidateDateTime = getServiceAssignmentDateTime(candidateService);

      if (!candidateDateTime) {
        return null;
      }

      const minutes = Math.abs(Math.round((candidateDateTime.getTime() - targetDateTime.getTime()) / 60000));

      return {
        service: candidateService,
        minutes,
        time: getServiceDetailTime(candidateService),
      };
    })
    .filter((conflict) => conflict && conflict.minutes < SERVICE_ASSIGNMENT_CONFLICT_THRESHOLD_MINUTES)
    .sort((firstConflict, secondConflict) => firstConflict.minutes - secondConflict.minutes)[0] || null;
}

function getServiceAssignmentDateTime(service) {
  const date = getServiceDetailDate(service);
  const time = getServiceDetailTime(service);

  if (!date || !time || date === "Sin definir" || time === "Sin definir") {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const dateParts = date.includes("-") ? date.split("-") : date.split("/");
  let year;
  let month;
  let day;

  if (date.includes("-")) {
    [year, month, day] = dateParts.map(Number);
  } else {
    [day, month, year] = dateParts.map(Number);
  }

  if (!Number.isFinite(day) || !Number.isFinite(month)) {
    return null;
  }

  const resolvedYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const dateTime = new Date(resolvedYear, month - 1, day, hours, minutes, 0, 0);

  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
}

function isServiceClosedForAssignment(service) {
  return getServiceAssignmentClosedStatuses().includes(normalizeServiceDetailText(getServiceDetailStatus(service)));
}

function getServiceAssignmentClosedStatuses() {
  const actualStatuses = new Set(servicesData.services.map((service) => normalizeServiceDetailText(getServiceDetailStatus(service))));
  const closedStatusCandidates = ["cancelado", "finalizado", "no show", "no-show", "no realizado", "no-realizado", "completado"];

  return closedStatusCandidates.filter((status) => actualStatuses.has(status));
}

function openServiceDetailModal(serviceId) {
  const service = findServiceById(serviceId);

  if (!service) {
    notifyNewService("No se encontró el servicio seleccionado.", "warning");
    return;
  }

  serviceDetailState.serviceId = getServiceIdentifier(service);
  serviceDetailState.editMode = false;
  serviceDetailState.cancelMode = false;
  renderServiceDetailModal(service);
  openServiceModal("service-summary-modal");
}

function renderServiceDetailModal(service) {
  const passenger = getServiceDetailPassenger(service);
  const vehicle = getServiceDetailVehicle(service);
  const isEditing = serviceDetailState.editMode;
  const isCanceling = serviceDetailState.cancelMode;
  const isCanceled = isServiceCanceled(service);
  const isFinalized = isServiceFinalized(service);
  const isNoShow = isServiceNoShow(service);
  const isClosed = isClosedService(service);
  const canCancel = isServiceEligibleForAdministrativeCancellation(service);
  const isRejectedWithoutAssignment = isServiceRejectedWithoutAssignment(service);
  const requiresReassignment = isServiceReassignmentRequired(service);
  const canChangeAssignment = canServiceAssignmentBeChanged(service);
  const reassignButton = getElement("service-detail-reassign");
  const editButton = getElement("service-detail-edit");
  const cancelButton = getElement("service-detail-cancel-service");
  const viewActions = getElement("service-detail-view-actions");
  const editActions = getElement("service-detail-edit-actions");
  const view = getElement("service-detail-view");
  const cancelForm = getElement("service-detail-cancel-form");
  const editForm = getElement("service-detail-edit-form");

  setText("summary-service-number", getServiceIdentifier(service));
  setText("summary-service-status", getServiceDisplayStatus(service));
  setServiceDetailStatusCardClass(service, !isEditing && !isCanceling);
  setText("summary-service-date", getServiceDetailDate(service));
  setText("summary-service-time", getServiceDetailTime(service));
  setText("summary-service-type", service.type || "Sin tipo");
  setText("summary-service-client", getServiceListClientName(service) || "Sin cliente");
  setText("summary-service-collaborator", service.collaborator || "Sin asignar");
  setServiceDetailAssignmentSummary(service, isRejectedWithoutAssignment, requiresReassignment);
  setText("summary-service-origin", service.origin || "Sin origen");
  setText("summary-service-destination", service.destination || "Sin destino");
  setServiceDetailVehicleSummary(service, vehicle);
  setText("summary-service-notes", getServiceDetailNotes(service));
  setServiceDetailPortalAccessWarning(service);
  setServicePassengerVisibility(passenger);
  renderServiceFinancialSection(service);

  const cancellationReasonField = getElement("summary-service-cancellation-reason-field");
  const finishClosureField = getElement("summary-service-finish-closure-field");
  const noShowField = getElement("summary-service-no-show-field");

  if (cancellationReasonField) {
    cancellationReasonField.hidden = !isCanceled;
  }

  if (finishClosureField) {
    finishClosureField.hidden = !isFinalized;
  }

  if (noShowField) {
    noShowField.hidden = !isNoShow;
  }

  setText("summary-service-cancellation-reason", isCanceled ? getServiceCancellationReasonDetailText(service) : "-");
  setText("summary-service-finish-closure", isFinalized ? getServiceFinalizedClosureDetailText(service) : "-");
  setText("summary-service-no-show", isNoShow ? getServiceNoShowClosureDetailText(service) : "-");

  if (reassignButton) {
    reassignButton.hidden = !canChangeAssignment || (!isRejectedWithoutAssignment && !requiresReassignment);
  }

  if (editButton) {
    editButton.hidden = isClosed;
  }

  if (cancelButton) {
    cancelButton.hidden = !canCancel;
  }

  if (viewActions) {
    viewActions.hidden = isEditing || isCanceling;
  }

  if (editActions) {
    editActions.hidden = !isEditing;
  }

  if (view) {
    view.hidden = isEditing || isCanceling;
  }

  if (cancelForm) {
    cancelForm.hidden = !isCanceling;
  }

  if (editForm) {
    editForm.hidden = !isEditing || isCanceling;
  }

  if (isEditing) {
    populateServiceDetailEditForm(service);
  } else if (isCanceling) {
    clearServiceDetailCancelValidation();
    updateServiceCancellationReasonDetailsVisibility();
  } else {
    clearServiceDetailEditValidation();
    clearServiceDetailCancelValidation();
  }
}

function renderServiceFinancialSection(service) {
  const summary = reconcileServicePaymentStatus(service);
  const canManage = canManageServiceFinancials();
  const canRegisterPayment = canManage && summary.totalPrice !== null && summary.pendingAmount > 0 && !["Pagado", "Reembolsado", "Incobrable"].includes(summary.paymentStatus);
  const canWriteOff = canMarkServiceFinancialAsWriteOff(service, summary);
  const editButton = getElement("service-detail-financial-edit");
  const paymentButton = getElement("service-detail-payment-register");
  const writeOffButton = getElement("service-detail-writeoff");
  const writeOffField = getElement("summary-service-financial-writeoff-field");

  setText("summary-service-financial-base", formatServiceMoney(summary.basePrice));
  setText("summary-service-financial-vat", `${formatServiceMoney(summary.vatAmount)} (${formatServicePercent(summary.vatRateApplied)})`);
  setText("summary-service-financial-total", formatServiceMoney(summary.totalPrice));
  const collectionDisplayStatus = service.financial?.collectionStatus || summary.paymentStatus;
  setText("summary-service-financial-status", collectionDisplayStatus);
  setServiceFinancialStatusTone("summary-service-financial-status", collectionDisplayStatus);
  setText("summary-service-financial-paid", formatServiceMoney(summary.paidAmount));
  setText("summary-service-financial-pending", formatServiceMoney(summary.pendingAmount));
  renderServicePaymentHistory(summary.payments);
  renderServiceReceivableSection(service);

  if (writeOffField) {
    writeOffField.hidden = summary.paymentStatus !== "Incobrable";
  }

  if (summary.writeOff) {
    setText(
      "summary-service-financial-writeoff",
      `${formatServiceMoney(summary.writeOff.amount)} · ${summary.writeOff.reason || "Sin motivo"} · ${summary.writeOff.authorizedByName || "Usuario no registrado"}`,
    );
  }

  if (editButton) {
    editButton.hidden = !canManage || serviceDetailState.editMode || serviceDetailState.cancelMode;
  }

  if (paymentButton) {
    paymentButton.hidden = !canManage || serviceDetailState.editMode || serviceDetailState.cancelMode;
    paymentButton.disabled = !canRegisterPayment;
    paymentButton.title = canRegisterPayment
      ? ""
      : summary.paymentStatus === "Pagado"
        ? "El servicio est\u00e1 completamente pagado."
        : "No hay saldo pendiente disponible para registrar pago.";
  }

  if (writeOffButton) {
    writeOffButton.hidden = !isCurrentContextSuperadmin() || serviceDetailState.editMode || serviceDetailState.cancelMode;
    writeOffButton.disabled = !canWriteOff;
    writeOffButton.title = canWriteOff ? "" : "Solo se puede marcar incobrable un saldo pendiente.";
  }
}

function renderServiceReceivableSection(service) {
  const section = getElement("summary-service-receivable-section");

  if (!section || !window.ElaraReceivablesCore?.getReceivableByServiceId) {
    return;
  }

  window.ElaraReceivablesCore.reconcileReceivablesFromServices?.(getServiceCurrentUser());

  const receivable = window.ElaraReceivablesCore.getReceivableByServiceId(getServiceIdentifier(service), { includeAnulada: true });

  section.hidden = !receivable;

  if (!receivable) {
    return;
  }

  const collectButton = getElement("service-detail-receivable-collect");

  setText("summary-service-receivable-id", receivable.id);
  setText("summary-service-receivable-status", receivable.status);
  setText("summary-service-receivable-original", formatServiceMoney(receivable.originalAmount));
  setText("summary-service-receivable-pending", formatServiceMoney(receivable.pendingAmount));
  section.dataset.receivableId = receivable.id;

  if (collectButton) {
    const canCollect = window.ElaraReceivablesCore.canCollectReceivable?.(receivable, getServiceCurrentUser());
    collectButton.hidden = !canCollect;
  }
}

function renderServicePaymentHistory(payments) {
  const container = getElement("summary-service-payment-history");

  if (!container) {
    return;
  }

  if (!payments.length) {
    container.innerHTML = "Sin pagos registrados";
    return;
  }

  container.innerHTML = payments
    .slice()
    .sort((first, second) => getServicePaymentSortTime(second.registeredAt) - getServicePaymentSortTime(first.registeredAt))
    .map(
      (payment) => `
        <article class="service-financial-payment">
          <time>${escapeHtml(formatServicePaymentDateTime(payment.registeredAt))}</time>
          <strong>${escapeHtml(formatServiceMoney(payment.amount))}</strong>
          <span>${escapeHtml(payment.method)}</span>
          ${
            payment.method === "Efectivo" && (payment.receiverName || payment.cashCollectorName)
              ? `<small>Cobrado por ${escapeHtml(payment.receiverName || payment.cashCollectorName)}</small>`
              : ""
          }
          ${payment.reference ? `<small>Ref. ${escapeHtml(payment.reference)}</small>` : ""}
          <small>${escapeHtml(payment.registeredByName || "Usuario no registrado")}</small>
        </article>
      `,
    )
    .join("");
}

function setServiceFinancialStatusTone(elementId, status) {
  const element = getElement(elementId);

  if (!element) {
    return;
  }

  Object.values(SERVICE_FINANCIAL_STATUS_TONES).forEach((tone) => {
    element.classList.remove(`financial-status--${tone}`);
  });
  element.classList.add("financial-status");
  element.classList.add(`financial-status--${SERVICE_FINANCIAL_STATUS_TONES[status] || "neutral"}`);
}

function initServiceFinancialControls() {
  const editPriceButton = getElement("service-detail-financial-edit");
  const paymentButton = getElement("service-detail-payment-register");
  const writeOffButton = getElement("service-detail-writeoff");
  const receivableOpenButton = getElement("service-detail-receivable-open");
  const receivableCollectButton = getElement("service-detail-receivable-collect");
  const paymentForm = getElement("service-payment-form");
  const paymentCancel = getElement("service-payment-cancel");
  const writeOffForm = getElement("service-writeoff-form");
  const writeOffCancel = getElement("service-writeoff-cancel");

  if (editPriceButton && !editPriceButton.dataset.serviceFinancialReady) {
    editPriceButton.dataset.serviceFinancialReady = "true";
    editPriceButton.addEventListener("click", enterServiceDetailEditMode);
  }

  if (paymentButton && !paymentButton.dataset.serviceFinancialReady) {
    paymentButton.dataset.serviceFinancialReady = "true";
    paymentButton.addEventListener("click", openServicePaymentModal);
  }

  if (writeOffButton && !writeOffButton.dataset.serviceFinancialReady) {
    writeOffButton.dataset.serviceFinancialReady = "true";
    writeOffButton.addEventListener("click", openServiceWriteOffModal);
  }

  if (receivableOpenButton && !receivableOpenButton.dataset.serviceFinancialReady) {
    receivableOpenButton.dataset.serviceFinancialReady = "true";
    receivableOpenButton.addEventListener("click", openServiceReceivableDetail);
  }

  if (receivableCollectButton && !receivableCollectButton.dataset.serviceFinancialReady) {
    receivableCollectButton.dataset.serviceFinancialReady = "true";
    receivableCollectButton.addEventListener("click", openServiceReceivablePayment);
  }

  if (paymentForm && !paymentForm.dataset.serviceFinancialReady) {
    paymentForm.dataset.serviceFinancialReady = "true";
    paymentForm.addEventListener("submit", registerServicePayment);
  }

  if (paymentCancel && !paymentCancel.dataset.serviceFinancialReady) {
    paymentCancel.dataset.serviceFinancialReady = "true";
    paymentCancel.addEventListener("click", () => closeServiceModal(getElement("service-payment-modal")));
  }

  if (writeOffForm && !writeOffForm.dataset.serviceFinancialReady) {
    writeOffForm.dataset.serviceFinancialReady = "true";
    writeOffForm.addEventListener("submit", markServiceAsWriteOff);
  }

  if (writeOffCancel && !writeOffCancel.dataset.serviceFinancialReady) {
    writeOffCancel.dataset.serviceFinancialReady = "true";
    writeOffCancel.addEventListener("click", () => closeServiceModal(getElement("service-writeoff-modal")));
  }
}

function ensureServiceFinancialModals() {
  return Boolean(getElement("service-payment-modal") && getElement("service-writeoff-modal"));
}

function getServiceDetailReceivableId() {
  return getElement("summary-service-receivable-section")?.dataset.receivableId || "";
}

function openServiceReceivableDetail() {
  const receivableId = getServiceDetailReceivableId();

  if (!receivableId || !window.ElaraReceivables?.openReceivableDetail) {
    notifyNewService("No se encontr\u00f3 la cuenta por cobrar asociada.", "warning");
    return;
  }

  window.ElaraReceivables.openReceivableDetail(receivableId);
}

function openServiceReceivablePayment() {
  const receivableId = getServiceDetailReceivableId();

  if (!receivableId || !window.ElaraReceivables?.openReceivablePaymentModal) {
    notifyNewService("No se encontr\u00f3 la cuenta por cobrar asociada.", "warning");
    return;
  }

  window.ElaraReceivables.openReceivablePaymentModal(receivableId);
}

function openServicePaymentModal() {
  const service = getCurrentServiceDetailService();

  if (!service || !canManageServiceFinancials()) {
    notifyNewService("No tienes permiso para registrar pagos.", "error");
    return;
  }

  const summary = reconcileServicePaymentStatus(service);

  if (summary.totalPrice === null) {
    notifyNewService("Define el precio del servicio antes de registrar pagos.", "warning");
    return;
  }

  if (summary.pendingAmount <= 0) {
    notifyNewService(summary.paymentStatus === "Pagado" ? "El servicio est\u00e1 completamente pagado." : "Este servicio no tiene saldo pendiente.", "info");
    return;
  }

  clearServicePaymentValidation();
  setInputValue("service-payment-amount", "");
  setInputValue("service-payment-reference", "");
  setInputValue("service-payment-notes", "");
  renderServicePaymentSummary(summary);
  openServiceFinancialModal("service-payment-modal");
}

function openServiceFinancialModal(modalId) {
  const detailModal = getElement("service-summary-modal");

  if (detailModal && !detailModal.hidden) {
    detailModal.hidden = true;
    serviceFinancialState.returnToDetail = true;
  }

  openServiceModal(modalId);
}

function registerServicePayment(event) {
  event.preventDefault();

  const service = getCurrentServiceDetailService();
  const summary = service ? reconcileServicePaymentStatus(service) : null;
  const currentUser = getServiceCurrentUser();
  const amount = getNullableMoneyValue(getInputValue("service-payment-amount"));
  const method = "Efectivo";

  clearServicePaymentValidation();

  if (!service || !summary || !canManageServiceFinancials()) {
    showServicePaymentError("No tienes permiso para registrar pagos.");
    return;
  }

  if (!currentUser) {
    showServicePaymentError("La sesion no es valida. Vuelve a iniciar sesion.");
    return;
  }

  if (summary.totalPrice === null) {
    showServicePaymentError("Define el precio del servicio antes de registrar pagos.", ["service-payment-amount"]);
    return;
  }

  if (amount === null || amount <= 0) {
    showServicePaymentError("Introduce un importe mayor que 0.", ["service-payment-amount"]);
    return;
  }

  if (amount > summary.pendingAmount) {
    showServicePaymentError("El importe no puede superar el saldo pendiente.", ["service-payment-amount"]);
    return;
  }

  const payment = {
    id: getNextServicePaymentId(),
    type: "payment",
    amount,
    method,
    reference: getInputValue("service-payment-reference"),
    notes: getInputValue("service-payment-notes"),
    serviceId: getServiceIdentifier(service),
    customerId: service.customerCode || service.customerId || null,
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    registeredAt: new Date().toISOString(),
    status: "Registrado",
  };

  if (!window.ElaraCash || typeof window.ElaraCash.registerServiceCashPayment !== "function") {
    showServicePaymentError("No se pudo registrar el movimiento de caja. Intentalo nuevamente.");
    return;
  }

  try {
    window.ElaraCash.registerServiceCashPayment({
      service,
      payment,
      collector: {
        type: "Elara",
        id: currentUser.id,
        name: currentUser.name || "Administracion",
      },
    });
  } catch (error) {
    console.error("[ELARA] No se pudo registrar el cobro en efectivo:", error);
    showServicePaymentError("No se pudo registrar el movimiento de caja. Intentalo nuevamente.");
    return;
  }

  service.financial.payments.push(payment);
  reconcileServicePaymentStatus(service);
  refreshServiceFinancialViews("payment-registered", service);
  closeServiceModal(getElement("service-payment-modal"));
  notifyNewService("Pago registrado correctamente.", "success");
}

function openServiceWriteOffModal() {
  const service = getCurrentServiceDetailService();
  const summary = service ? reconcileServicePaymentStatus(service) : null;

  if (!service || !summary || !isCurrentContextSuperadmin()) {
    notifyNewService("Solo Superadmin puede marcar un saldo como incobrable.", "error");
    return;
  }

  if (!canMarkServiceFinancialAsWriteOff(service, summary)) {
    notifyNewService("Solo se puede marcar incobrable un servicio con saldo pendiente.", "warning");
    return;
  }

  clearServiceWriteOffValidation();
  setInputValue("service-writeoff-reason", "");
  setText("service-writeoff-summary", `Saldo pendiente: ${formatServiceMoney(summary.pendingAmount)} · Servicio ${getServiceIdentifier(service)}`);
  openServiceFinancialModal("service-writeoff-modal");
}

function markServiceAsWriteOff(event) {
  event.preventDefault();

  const service = getCurrentServiceDetailService();
  const summary = service ? reconcileServicePaymentStatus(service) : null;
  const currentUser = getServiceCurrentUser();
  const reason = getInputValue("service-writeoff-reason");

  clearServiceWriteOffValidation();

  if (!service || !summary || !isCurrentContextSuperadmin()) {
    showServiceWriteOffError("Solo Superadmin puede marcar un saldo como incobrable.");
    return;
  }

  if (!currentUser) {
    showServiceWriteOffError("La sesion no es valida. Vuelve a iniciar sesion.");
    return;
  }

  if (!canMarkServiceFinancialAsWriteOff(service, summary)) {
    showServiceWriteOffError("Solo se puede marcar incobrable un servicio con saldo pendiente.");
    return;
  }

  if (!reason) {
    showServiceWriteOffError("Introduce el motivo obligatorio.", ["service-writeoff-reason"]);
    return;
  }

  service.financial.writeOff = {
    amount: summary.pendingAmount,
    reason,
    authorizedByUserId: currentUser?.id || "",
    authorizedByName: currentUser?.name || "Superadmin",
    authorizedAt: new Date().toISOString(),
  };
  reconcileServicePaymentStatus(service);
  refreshServiceFinancialViews("writeoff", service);
  closeServiceModal(getElement("service-writeoff-modal"));
  notifyNewService("Saldo marcado como incobrable.", "success");
}

function refreshServiceFinancialViews(reason, service) {
  renderServicesSummary();
  renderServicesList();
  renderServiceDetailModal(service);
  emitServiceUpdatedEvent(reason, service);
}

function getNextServicePaymentId() {
  const maxPaymentNumber = (servicesData.services || []).reduce((maxValue, service) => {
    const serviceMaxPaymentNumber = (service.financial?.payments || []).reduce((paymentMaxValue, payment) => {
      const match = String(payment.id || "").match(/PAY-(\d+)/);

      return Math.max(paymentMaxValue, match ? Number(match[1]) : 0);
    }, 0);

    return Math.max(maxValue, serviceMaxPaymentNumber);
  }, 0);

  return `PAY-${String(maxPaymentNumber + 1).padStart(4, "0")}`;
}

function getServiceCurrentUser() {
  return window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
}

function getServiceActiveContext() {
  return window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function" ? window.ElaraAuth.getActiveContext() : "";
}

function canManageServiceFinancials() {
  return ["superadmin", "administrativo"].includes(getServiceActiveContext());
}

function isCurrentContextSuperadmin() {
  return getServiceActiveContext() === "superadmin";
}

function canMarkServiceFinancialAsWriteOff(service, summary = calculateServiceFinancialSummary(service)) {
  return Boolean(
    isCurrentContextSuperadmin() &&
      summary.totalPrice !== null &&
      summary.pendingAmount > 0 &&
      !["Pagado", "Incobrable", "Reembolsado"].includes(summary.paymentStatus),
  );
}

function renderServicePaymentSummary(summary) {
  const container = getElement("service-payment-summary");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <span>Total: <strong>${escapeHtml(formatServiceMoney(summary.totalPrice))}</strong></span>
    <span>Pagado: <strong>${escapeHtml(formatServiceMoney(summary.paidAmount))}</strong></span>
    <span>Pendiente: <strong>${escapeHtml(formatServiceMoney(summary.pendingAmount))}</strong></span>
  `;
}

function clearServicePaymentValidation() {
  clearServiceFinancialFormValidation("service-payment-form", "service-payment-error");
}

function showServicePaymentError(message, fieldIds = []) {
  showServiceFinancialFormError("service-payment-form", "service-payment-error", message, fieldIds);
}

function clearServiceWriteOffValidation() {
  clearServiceFinancialFormValidation("service-writeoff-form", "service-writeoff-error");
}

function showServiceWriteOffError(message, fieldIds = []) {
  showServiceFinancialFormError("service-writeoff-form", "service-writeoff-error", message, fieldIds);
}

function clearServiceFinancialFormValidation(formId, errorId) {
  const form = getElement(formId);
  const error = getElement(errorId);

  form?.querySelectorAll(".field--invalid").forEach((field) => field.classList.remove("field--invalid"));

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function showServiceFinancialFormError(formId, errorId, message, fieldIds = []) {
  const error = getElement(errorId);

  fieldIds.forEach((fieldId) => getElement(fieldId)?.closest(".field")?.classList.add("field--invalid"));

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }

  if (fieldIds[0]) {
    getElement(fieldIds[0])?.focus();
  }
}

function initServiceDetailControls() {
  const reassignButton = getElement("service-detail-reassign");
  const editButton = getElement("service-detail-edit");
  const administrativeCancelButton = getElement("service-detail-cancel-service");
  const cancelButton = getElement("service-detail-cancel");
  const cancelForm = getElement("service-detail-cancel-form");
  const cancelBackButton = getElement("service-detail-cancel-back");
  const cancelReasonCode = getElement("service-detail-cancel-reason-code");
  const editForm = getElement("service-detail-edit-form");
  const typeSelect = getElement("service-detail-edit-type");
  const typeChangeCancel = getElement("service-detail-type-change-cancel");
  const typeChangeConfirm = getElement("service-detail-type-change-confirm-action");

  if (reassignButton && !reassignButton.dataset.serviceDetailReady) {
    reassignButton.dataset.serviceDetailReady = "true";
    reassignButton.addEventListener("click", openRejectedServiceReassignmentFromDetail);
  }

  if (editButton && !editButton.dataset.serviceDetailReady) {
    editButton.dataset.serviceDetailReady = "true";
    editButton.addEventListener("click", enterServiceDetailEditMode);
  }

  if (administrativeCancelButton && !administrativeCancelButton.dataset.serviceDetailReady) {
    administrativeCancelButton.dataset.serviceDetailReady = "true";
    administrativeCancelButton.addEventListener("click", enterServiceDetailCancelMode);
  }

  if (cancelButton && !cancelButton.dataset.serviceDetailReady) {
    cancelButton.dataset.serviceDetailReady = "true";
    cancelButton.addEventListener("click", exitServiceDetailEditMode);
  }

  if (cancelBackButton && !cancelBackButton.dataset.serviceDetailReady) {
    cancelBackButton.dataset.serviceDetailReady = "true";
    cancelBackButton.addEventListener("click", exitServiceDetailCancelMode);
  }

  if (editForm && !editForm.dataset.serviceDetailReady) {
    editForm.dataset.serviceDetailReady = "true";
    editForm.addEventListener("submit", saveServiceDetailEdit);
  }

  if (cancelForm && !cancelForm.dataset.serviceDetailReady) {
    cancelForm.dataset.serviceDetailReady = "true";
    cancelForm.addEventListener("submit", confirmServiceAdministrativeCancellation);
  }

  if (cancelReasonCode && !cancelReasonCode.dataset.serviceDetailReady) {
    cancelReasonCode.dataset.serviceDetailReady = "true";
    cancelReasonCode.addEventListener("change", handleServiceCancellationReasonChange);
  }

  if (typeSelect && !typeSelect.dataset.serviceDetailReady) {
    typeSelect.dataset.serviceDetailReady = "true";
    typeSelect.addEventListener("change", handleServiceDetailTypeChange);
  }

  if (typeChangeCancel && !typeChangeCancel.dataset.serviceDetailReady) {
    typeChangeCancel.dataset.serviceDetailReady = "true";
    typeChangeCancel.addEventListener("click", cancelServiceDetailTypeChange);
  }

  if (typeChangeConfirm && !typeChangeConfirm.dataset.serviceDetailReady) {
    typeChangeConfirm.dataset.serviceDetailReady = "true";
    typeChangeConfirm.addEventListener("click", confirmServiceDetailTypeChange);
  }
}

function enterServiceDetailEditMode() {
  const service = getCurrentServiceDetailService();

  if (!service || isServiceCanceled(service)) {
    return;
  }

  serviceDetailState.editMode = true;
  serviceDetailState.originalType = service.type || NEW_SERVICE_DEFAULT_TYPE;
  serviceDetailState.activeType = service.type || NEW_SERVICE_DEFAULT_TYPE;
  serviceDetailState.pendingType = "";
  serviceDetailState.originalSpecificValues = getServiceTypeSpecificValues(service);
  serviceDetailState.typeChangeConfirmed = false;
  renderServiceDetailModal(service);
}

function enterServiceDetailCancelMode() {
  const service = getCurrentServiceDetailService();

  if (!service || !isServiceEligibleForAdministrativeCancellation(service)) {
    return;
  }

  serviceDetailState.editMode = false;
  serviceDetailState.cancelMode = true;
  setInputValue("service-detail-cancel-reason-code", "");
  setInputValue("service-detail-cancel-reason-details", "");
  updateServiceCancellationReasonDetailsVisibility();
  renderServiceDetailModal(service);
}

function exitServiceDetailCancelMode() {
  const service = getCurrentServiceDetailService();

  serviceDetailState.cancelMode = false;
  clearServiceDetailCancelValidation();

  if (service) {
    renderServiceDetailModal(service);
  }
}

function confirmServiceAdministrativeCancellation(event) {
  event.preventDefault();

  const service = getCurrentServiceDetailService();
  const reasonCode = getInputValue("service-detail-cancel-reason-code");
  const reason = getServiceCancellationReasonLabel(reasonCode);
  const reasonDetails = getInputValue("service-detail-cancel-reason-details");

  clearServiceDetailCancelValidation();

  if (!service || !isServiceEligibleForAdministrativeCancellation(service)) {
    return;
  }

  if (!reasonCode || !reason) {
    markServiceDetailCancelInvalid(["service-detail-cancel-reason-code"], "Selecciona un motivo de cancelación.");
    notifyNewService("Selecciona un motivo de cancelación.", "error");
    return;
  }

  if (reasonCode === "OTHER" && !reasonDetails) {
    markServiceDetailCancelInvalid(["service-detail-cancel-reason-details"], "Introduce el detalle breve.");
    notifyNewService("Introduce el detalle breve.", "error");
    return;
  }

  if (reasonCode === "OTHER" && reasonDetails.length > 100) {
    markServiceDetailCancelInvalid(["service-detail-cancel-reason-details"], "El detalle breve no puede superar 100 caracteres.");
    notifyNewService("El detalle breve no puede superar 100 caracteres.", "error");
    return;
  }

  if (reasonCode !== "OTHER") {
    setInputValue("service-detail-cancel-reason-details", "");
  }

  cancelServiceFromAdministration(service, {
    reasonCode,
    reason,
    reasonDetails: reasonCode === "OTHER" ? reasonDetails : "",
  });
  serviceDetailState.cancelMode = false;
  serviceDetailState.editMode = false;
  renderServicesList();
  renderServicesHistoryList();
  renderServiceDetailModal(service);
  emitServiceUpdatedEvent("cancelled", service);
  registerServiceCancellationActivity(service);
  notifyNewService("El servicio se canceló correctamente.", "success");
}

function exitServiceDetailEditMode() {
  const service = getCurrentServiceDetailService();

  serviceDetailState.editMode = false;
  serviceDetailState.pendingType = "";
  restoreServiceDetailSpecificSnapshot(service);
  clearServiceDetailEditValidation();

  if (service) {
    renderServiceDetailModal(service);
  }
}

function saveServiceDetailEdit(event) {
  event.preventDefault();

  const service = getCurrentServiceDetailService();

  if (!service || isServiceCanceled(service)) {
    return;
  }

  const formData = getServiceDetailEditFormData();
  const validation = validateServiceDetailEditForm(formData, service);
  const previousCollaboratorId = service.collaboratorId || "";

  clearServiceDetailEditValidation();

  if (!validation.valid) {
    markServiceDetailEditInvalid(validation.fields, validation.message);
    notifyNewService(validation.message, "error");
    return;
  }

  updateServiceFromDetailEdit(service, formData);
  serviceDetailState.editMode = false;
  serviceDetailState.typeChangeConfirmed = false;
  serviceDetailState.originalSpecificValues = getServiceTypeSpecificValues(service);
  emitServiceUpdatedEvent("edited", service, {
    collaboratorId: service.collaboratorId || "",
    previousCollaboratorId,
  });
  renderServicesList();
  renderServiceDetailModal(service);
  notifyNewService("Los cambios del servicio se guardaron correctamente.", "success");
}

function populateServiceDetailEditForm(service) {
  const isInProgress = isServiceInProgress(service);
  const notice = getElement("service-detail-edit-notice");
  const passengerName = getServiceDetailPassengerNameValue(service);
  const activeType = serviceDetailState.activeType || service.type || NEW_SERVICE_DEFAULT_TYPE;

  setInputValue("service-detail-edit-type", activeType);
  setInputValue("service-detail-edit-date", formatServiceDateForInput(getServiceDetailDate(service)));
  setInputValue("service-detail-edit-time", getServiceDetailTime(service) === "Sin definir" ? "" : getServiceDetailTime(service));
  setInputValue("service-detail-edit-origin", service.origin || "");
  setInputValue("service-detail-edit-destination", service.destination || "");
  setInputValue("service-detail-edit-price", getServiceDetailPriceNumber(service));
  setInputValue("service-detail-edit-notes", getServiceDetailRawNotes(service));
  setInputValue("service-detail-edit-passenger-name", passengerName);
  setInputValue("service-detail-edit-passenger-phone", service.passengerPhone || "");
  setInputValue("service-detail-edit-passenger-email", service.passengerEmail || "");

  setServiceDetailEditOperationalFieldsDisabled(isInProgress);
  renderServiceDetailSpecificFields(activeType, getServiceTypeSpecificValues(service));
  renderServiceDetailTypeChangeConfirmation();

  if (notice) {
    notice.hidden = !isInProgress;
  }
}

function getServiceDetailEditFormData() {
  const type = serviceDetailState.activeType || getInputValue("service-detail-edit-type");

  return {
    type,
    date: getInputValue("service-detail-edit-date"),
    time: getInputValue("service-detail-edit-time"),
    origin: getInputValue("service-detail-edit-origin"),
    destination: getInputValue("service-detail-edit-destination"),
    price: getInputValue("service-detail-edit-price"),
    notes: getInputValue("service-detail-edit-notes"),
    passengerName: getInputValue("service-detail-edit-passenger-name"),
    passengerPhone: getInputValue("service-detail-edit-passenger-phone"),
    passengerEmail: getInputValue("service-detail-edit-passenger-email"),
    specifics: getServiceDetailSpecificFormData(type),
  };
}

function handleServiceDetailTypeChange() {
  const typeSelect = getElement("service-detail-edit-type");
  const selectedType = typeSelect ? typeSelect.value : "";
  const currentType = serviceDetailState.activeType || serviceDetailState.originalType;

  if (!selectedType || selectedType === currentType) {
    serviceDetailState.pendingType = "";
    renderServiceDetailTypeChangeConfirmation();
    return;
  }

  serviceDetailState.pendingType = selectedType;
  renderServiceDetailTypeChangeConfirmation();
}

function cancelServiceDetailTypeChange() {
  serviceDetailState.pendingType = "";
  setInputValue("service-detail-edit-type", serviceDetailState.activeType || serviceDetailState.originalType || NEW_SERVICE_DEFAULT_TYPE);
  renderServiceDetailTypeChangeConfirmation();
}

function confirmServiceDetailTypeChange() {
  const pendingType = serviceDetailState.pendingType;
  const service = getCurrentServiceDetailService();

  if (!pendingType) {
    return;
  }

  if (service) {
    clearServiceTypeSpecificProperties(service);
    serviceDetailState.typeChangeConfirmed = true;
  }

  serviceDetailState.activeType = pendingType;
  serviceDetailState.pendingType = "";
  setInputValue("service-detail-edit-type", pendingType);
  clearServiceDetailSpecificFormFields();
  renderServiceDetailSpecificFields(pendingType, {});
  renderServiceDetailTypeChangeConfirmation();
  clearServiceDetailEditValidation();
}

function renderServiceDetailTypeChangeConfirmation() {
  const confirmation = getElement("service-detail-type-change-confirm");

  if (confirmation) {
    confirmation.hidden = !serviceDetailState.pendingType;
  }
}

function renderServiceDetailSpecificFields(type, values = {}) {
  const container = getElement("service-detail-specific-fields");
  const fields = getServiceTypeSpecificFields(type);

  if (!container) {
    return;
  }

  if (!fields.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="form-grid">
      ${fields.map((field) => renderServiceDetailSpecificField(field, values[field.key] || "")).join("")}
    </div>
  `;
}

function renderServiceDetailSpecificField(field, value) {
  const fieldId = getServiceDetailSpecificFieldId(field.key);
  const optionalClass = field.required ? "" : " field--optional";

  if (field.type === "select") {
    return `
      <label class="field${optionalClass}">
        <span>${escapeHtml(field.label)}</span>
        <select id="${escapeHtml(fieldId)}" data-service-detail-specific="${escapeHtml(field.key)}"${field.required ? " required" : ""}>
          ${(field.options || [])
            .map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`)
            .join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "textarea") {
    return `
      <label class="field${optionalClass} field--compact-textarea">
        <span>${escapeHtml(field.label)}</span>
        <textarea id="${escapeHtml(fieldId)}" data-service-detail-specific="${escapeHtml(field.key)}" rows="2">${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  return `
    <label class="field${optionalClass}">
      <span>${escapeHtml(field.label)}</span>
      <input id="${escapeHtml(fieldId)}" data-service-detail-specific="${escapeHtml(field.key)}" type="${escapeHtml(field.type)}" value="${escapeHtml(value)}"${field.min ? ` min="${escapeHtml(field.min)}"` : ""}${field.required ? " required" : ""} />
    </label>
  `;
}

function getServiceDetailSpecificFormData(type) {
  return getServiceTypeSpecificFields(type).reduce((data, field) => {
    data[field.key] = getInputValue(getServiceDetailSpecificFieldId(field.key));
    return data;
  }, {});
}

function clearServiceDetailSpecificFormFields() {
  const container = getElement("service-detail-specific-fields");

  if (!container) {
    return;
  }

  container.querySelectorAll("input, textarea").forEach((input) => {
    input.value = "";
  });

  container.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = 0;
  });
}

function getServiceDetailSpecificFieldId(key) {
  return `service-detail-specific-${key}`;
}

function validateServiceDetailEditForm(formData, service) {
  const invalidFields = [];

  if (serviceDetailState.pendingType) {
    return {
      valid: false,
      fields: ["service-detail-edit-type"],
      message: "Confirma o cancela el cambio de tipo antes de guardar.",
    };
  }

  if (!isServiceInProgress(service)) {
    if (!formData.type) {
      invalidFields.push("service-detail-edit-type");
    }

    if (!formData.date) {
      invalidFields.push("service-detail-edit-date");
    }

    if (!formData.time) {
      invalidFields.push("service-detail-edit-time");
    }

    if (!formData.origin) {
      invalidFields.push("service-detail-edit-origin");
    }

    if (!formData.destination) {
      invalidFields.push("service-detail-edit-destination");
    }

    if (formData.origin && formData.destination && normalizeServiceDetailText(formData.origin) === normalizeServiceDetailText(formData.destination)) {
      invalidFields.push("service-detail-edit-origin", "service-detail-edit-destination");
    }

    if (formData.price && !isValidServiceDetailPrice(formData.price)) {
      invalidFields.push("service-detail-edit-price");
    }

    const priceValidationMessage = getServiceDetailPriceValidationMessage(formData.price, service);

    if (priceValidationMessage) {
      invalidFields.push("service-detail-edit-price");
      return {
        valid: false,
        fields: [...new Set(invalidFields)],
        message: priceValidationMessage,
      };
    }

    getServiceTypeSpecificFields(formData.type)
      .filter((field) => field.required && !formData.specifics[field.key])
      .forEach((field) => invalidFields.push(getServiceDetailSpecificFieldId(field.key)));
  }

  if (invalidFields.length) {
    return {
      valid: false,
      fields: [...new Set(invalidFields)],
      message: "Revisa los campos obligatorios del servicio.",
    };
  }

  return { valid: true, fields: [], message: "" };
}

function updateServiceFromDetailEdit(service, formData) {
  if (!isServiceInProgress(service)) {
    clearServiceTypeSpecificProperties(service);
    service.type = formData.type;
    service.date = formatDateForMock(formData.date);
    service.time = formData.time;
    service.origin = formData.origin;
    service.destination = formData.destination;
    service.price = formatServiceDetailPriceForMock(formData.price);
    updateServiceFinancialBasePrice(service, formData.price);
    applyServiceTypeSpecificProperties(service, formData.type, formData.specifics);
  }

  service.notes = formData.notes || "Sin observaciones.";
  setServiceDetailPassengerData(service, formData);
}

function getServiceDetailPriceValidationMessage(price, service) {
  const summary = calculateServiceFinancialSummary(service);

  if (!price) {
    return summary.paidAmount > 0 ? "El nuevo total no puede ser inferior al importe ya pagado." : "";
  }

  const basePrice = getNullableMoneyValue(price);

  if (basePrice === null || basePrice <= 0) {
    return "Revisa los campos obligatorios del servicio.";
  }

  const vatRateApplied = summary.basePrice === null ? getServiceGlobalVatRate() : summary.vatRateApplied;
  const totalPrice = roundMoney(basePrice + (basePrice * vatRateApplied) / 100);

  return totalPrice < summary.paidAmount ? "El nuevo total no puede ser inferior al importe ya pagado." : "";
}

function updateServiceFinancialBasePrice(service, price) {
  const summary = reconcileServicePaymentStatus(service);
  const basePrice = getNullableMoneyValue(price);

  if (basePrice === null) {
    service.financial = {
      ...service.financial,
      basePrice: null,
      vatRateApplied: 0,
      vatAmount: 0,
      totalPrice: null,
    };
    reconcileServicePaymentStatus(service);
    return;
  }

  const vatRateApplied = summary.basePrice === null ? getServiceGlobalVatRate() : summary.vatRateApplied;

  service.financial = {
    ...service.financial,
    basePrice,
    vatRateApplied,
    vatAmount: roundMoney((basePrice * vatRateApplied) / 100),
    totalPrice: roundMoney(basePrice + (basePrice * vatRateApplied) / 100),
  };
  reconcileServicePaymentStatus(service);
}

function setServiceDetailPassengerData(service, formData) {
  const nameKey = ["passengerName", "passenger", "passengerFullName", "pasajero", "travelerName"].find((key) =>
    Object.prototype.hasOwnProperty.call(service, key),
  );
  const resolvedNameKey = nameKey || "passengerName";

  service[resolvedNameKey] = formData.passengerName;

  if (Object.prototype.hasOwnProperty.call(service, "passengerPhone") || formData.passengerPhone) {
    service.passengerPhone = formData.passengerPhone;
  }

  if (Object.prototype.hasOwnProperty.call(service, "passengerEmail") || formData.passengerEmail) {
    service.passengerEmail = formData.passengerEmail;
  }
}

function getServiceTypeSpecificFields(type) {
  return SERVICE_TYPE_SPECIFIC_FIELDS[type] || [];
}

function getServiceTypeSpecificValues(service) {
  return getAllServiceTypeSpecificFields().reduce((values, field) => {
    values[field.key] = service[field.key] || "";
    return values;
  }, {});
}

function getAllServiceTypeSpecificFields() {
  return Object.values(SERVICE_TYPE_SPECIFIC_FIELDS).flat();
}

function clearServiceTypeSpecificProperties(service) {
  getAllServiceTypeSpecificFields().forEach((field) => {
    delete service[field.key];
  });
}

function applyServiceTypeSpecificProperties(service, type, specifics) {
  getServiceTypeSpecificFields(type).forEach((field) => {
    const value = specifics[field.key];

    if (value) {
      service[field.key] = value;
    }
  });
}

function restoreServiceDetailSpecificSnapshot(service) {
  if (!service || !serviceDetailState.typeChangeConfirmed) {
    return;
  }

  clearServiceTypeSpecificProperties(service);
  Object.entries(serviceDetailState.originalSpecificValues || {}).forEach(([key, value]) => {
    if (value) {
      service[key] = value;
    }
  });
  serviceDetailState.typeChangeConfirmed = false;
}

function getServiceSpecificsSummary(type, specifics) {
  if (type === "Mascotas") {
    return `Mascota: ${specifics.petType || "Sin tipo"}, tamaño ${specifics.petSize || "sin definir"}`;
  }

  if (type === "Full Day") {
    return joinFilledValues([
      formatFullDayHours(specifics.fullDayHours),
      specifics.fullDayZone ? `Zona: ${specifics.fullDayZone}` : "",
      specifics.fullDayNotes ? `Requerimientos: ${specifics.fullDayNotes}` : "",
    ]) || "Full Day sin detalles adicionales";
  }

  if (type === "Aeropuerto") {
    return joinFilledValues([
      specifics.flightNumber ? `Vuelo: ${specifics.flightNumber}` : "",
      specifics.flightTerminal ? `Terminal: ${specifics.flightTerminal}` : "",
      specifics.luggage ? `Equipaje: ${specifics.luggage}` : "",
    ]) || "Sin detalles adicionales";
  }

  return "Sin detalles adicionales";
}

function getCurrentServiceDetailService() {
  return serviceDetailState.serviceId ? findServiceById(serviceDetailState.serviceId) : null;
}

function openRejectedServiceReassignmentFromDetail() {
  const service = getCurrentServiceDetailService();

  if (!service || (!isServiceRejectedWithoutAssignment(service) && !isServiceReassignmentRequired(service))) {
    return;
  }

  if (!canServiceAssignmentBeChanged(service)) {
    notifyServiceAssignmentChangeBlocked(service);
    return;
  }

  openServiceAssignmentModal(getServiceIdentifier(service));
}

function refreshCurrentServiceDetailIfOpen(service) {
  if (!serviceDetailState.serviceId || serviceDetailState.serviceId !== getServiceIdentifier(service)) {
    return;
  }

  serviceDetailState.editMode = false;
  serviceDetailState.cancelMode = false;
  renderServiceDetailModal(service);
}

function setServiceDetailAssignmentSummary(service, isRejectedWithoutAssignment, requiresReassignment = isServiceReassignmentRequired(service)) {
  const field = getElement("summary-service-assignment-status-field");
  const assignmentStatusText = requiresReassignment
    ? "Reasignaci\u00f3n requerida"
    : isRejectedWithoutAssignment
      ? getServiceRejectedAssignmentText(service)
      : getServiceAssignmentStatusText(service);

  if (!field) {
    return;
  }

  field.hidden = !assignmentStatusText;
  setText("summary-service-assignment-status", assignmentStatusText || "-");
}

function isServiceCanceled(service) {
  return normalizeServiceStatus(getServiceDetailStatus(service)) === "Cancelado";
}

function isServiceFinalized(service) {
  return normalizeServiceStatus(getServiceDetailStatus(service)) === "Finalizado";
}

function isServiceNoShow(service) {
  return normalizeServiceStatus(getServiceDetailStatus(service)) === "No show";
}

function isServiceEligibleForAdministrativeCancellation(service) {
  return ["Pendiente", "Confirmado"].includes(normalizeServiceStatus(getServiceDetailStatus(service)));
}

function isServiceInProgress(service) {
  return normalizeServiceDetailText(getServiceDetailStatus(service)) === "en curso";
}

function cancelServiceFromAdministration(service, cancellation) {
  service.status = "Cancelado";
  service.closureType = "Cancelación";
  service.closureSource = "Administración";
  service.closureReasonCode = cancellation.reasonCode;
  service.closureReason = cancellation.reason;
  service.closureReasonDetails = cancellation.reasonDetails || "";
  service.closedAt = new Date().toISOString();
  service.action = "Revisar";
}

function getServiceCancellationReasonLabel(reasonCode) {
  return SERVICE_CANCELLATION_REASONS.find((reason) => reason.code === reasonCode)?.label || "";
}

function getServiceCancellationReasonText(service) {
  const reason = getServiceCancellationReasonLabel(service.closureReasonCode) || service.closureReason || "";
  const details = service.closureReasonDetails || "";

  return joinFilledValues([reason, details]);
}

function getServiceCancellationReasonDetailText(service) {
  if (service.closureReasonCode === "OTHER" && service.closureReasonDetails) {
    return `Otro motivo: ${service.closureReasonDetails}`;
  }

  return service.closureReason || "No indicado";
}

function getServiceFinalizedClosureDetailText(service) {
  if (!isServiceFinalized(service)) {
    return "";
  }

  const closing = service.closing || {};
  const values = [
    `Finalizado por: ${service.closureSource || "No indicado"}`,
    `Fecha de cierre: ${formatServiceClosedAt(service.closedAt)}`,
    closing.ratingLabel || closing.rating ? `Valoraci\u00f3n: ${closing.ratingLabel || closing.rating}` : "",
    Array.isArray(closing.reasons) && closing.reasons.length ? `Motivos: ${closing.reasons.join(", ")}` : "",
    closing.finalNotes || closing.notes ? `Observaciones: ${closing.finalNotes || closing.notes}` : "",
  ];

  return values.filter(Boolean).join(" · ") || "No indicado";
}

function getServiceNoShowClosureDetailText(service) {
  if (!isServiceNoShow(service)) {
    return "";
  }

  const values = [
    service.closureReason || "No indicado",
    service.closureReasonDetails ? `Detalle: ${service.closureReasonDetails}` : "",
    `Registrado por: ${service.closureSource || "No indicado"}`,
    `Fecha de cierre: ${formatServiceClosedAt(service.closedAt)}`,
  ];

  return values.filter(Boolean).join(" · ");
}

function formatServiceClosedAt(closedAt) {
  if (!closedAt) {
    return "No indicado";
  }

  const date = new Date(closedAt);

  if (Number.isNaN(date.getTime())) {
    return closedAt;
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function handleServiceCancellationReasonChange() {
  clearServiceDetailCancelValidation();
  updateServiceCancellationReasonDetailsVisibility();
}

function updateServiceCancellationReasonDetailsVisibility() {
  const reasonCode = getInputValue("service-detail-cancel-reason-code");
  const detailsField = getElement("service-detail-cancel-reason-details-field");

  if (!detailsField) {
    return;
  }

  detailsField.hidden = reasonCode !== "OTHER";

  if (reasonCode !== "OTHER") {
    setInputValue("service-detail-cancel-reason-details", "");
  }
}

function setServiceDetailEditOperationalFieldsDisabled(disabled) {
  [
    "service-detail-edit-type",
    "service-detail-edit-date",
    "service-detail-edit-time",
    "service-detail-edit-origin",
    "service-detail-edit-destination",
    "service-detail-edit-price",
  ].forEach((fieldId) => {
    const field = getElement(fieldId);

    if (field) {
      field.disabled = disabled;
    }
  });
}

function clearServiceDetailEditValidation() {
  const form = getElement("service-detail-edit-form");
  const error = getElement("service-detail-edit-error");

  if (form) {
    form.querySelectorAll(".field--invalid").forEach((field) => field.classList.remove("field--invalid"));
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}

function markServiceDetailEditInvalid(fieldIds, message) {
  const error = getElement("service-detail-edit-error");

  fieldIds.forEach((fieldId) => {
    getElement(fieldId)?.closest(".field")?.classList.add("field--invalid");
  });

  if (error) {
    error.hidden = false;
    error.textContent = message;
  }
}

function clearServiceDetailCancelValidation() {
  const form = getElement("service-detail-cancel-form");
  const error = getElement("service-detail-cancel-error");

  if (form) {
    form.querySelectorAll(".field--invalid").forEach((field) => field.classList.remove("field--invalid"));
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}

function markServiceDetailCancelInvalid(fieldIds, message) {
  const error = getElement("service-detail-cancel-error");

  fieldIds.forEach((fieldId) => {
    getElement(fieldId)?.closest(".field")?.classList.add("field--invalid");
  });

  if (error) {
    error.hidden = false;
    error.textContent = message;
  }
}

function setInputValue(id, value) {
  const input = getElement(id);

  if (input) {
    input.value = value || "";
  }
}

function formatServiceDateForInput(dateValue) {
  const value = String(dateValue || "").trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function getServiceDetailPriceNumber(service) {
  const financial = calculateServiceFinancialSummary(service);

  if (financial.basePrice !== null) {
    return String(financial.basePrice);
  }

  return getServiceLegacyPriceNumber(service);
}

function getServiceLegacyPriceNumber(service) {
  const value = service.price || service.amount || service.importe || "";
  const match = String(value).replace(",", ".").match(/(\d+(?:\.\d+)?)/);

  return match ? match[1] : "";
}

function isValidServiceDetailPrice(price) {
  const value = Number(String(price).replace(",", "."));

  return Number.isFinite(value) && value > 0;
}

function formatServiceDetailPriceForMock(price) {
  if (!price) {
    return "Sin definir";
  }

  const value = Number(String(price).replace(",", "."));

  return `${formatServiceMoneyValue(value)} EUR`;
}

function formatServiceMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "Sin definir";
  }

  return `${formatServiceMoneyValue(value)} EUR`;
}

function formatServiceMoneyValue(value) {
  const amount = roundMoney(value);

  return amount.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatServicePercent(value) {
  return `${formatServiceMoneyValue(value)} %`;
}

function getServiceFinancialListHtml(service) {
  const summary = reconcileServicePaymentStatus(service);

  if (summary.totalPrice === null) {
    return `
      <span class="operation-card__payment operation-card__payment--financial">
        <strong>Sin definir</strong>
      </span>
    `;
  }

  return `
    <span class="operation-card__payment operation-card__payment--financial">
      <strong>${escapeHtml(formatServiceMoney(summary.totalPrice))}</strong>
      <span class="financial-status financial-status--${escapeHtml(SERVICE_FINANCIAL_STATUS_TONES[summary.paymentStatus] || "neutral")}">${escapeHtml(summary.paymentStatus)}</span>
    </span>
  `;
}

function getServicePaymentSortTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatServicePaymentDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getServiceDetailRawNotes(service) {
  const notes = service.notes || service.observations || service.serviceNotes || service.observaciones || service.comments || service.comentarios || "";

  return normalizeServiceDetailText(notes) === "sin observaciones" ? "" : notes;
}

function getServiceDetailPassengerNameValue(service) {
  return (
    service.passengerName ||
    service.passenger ||
    service.passengerFullName ||
    service.pasajero ||
    service.travelerName ||
    ""
  );
}

function findServiceById(serviceId) {
  return servicesData.services.find((service, index) => ensureServiceId(service, index) === serviceId) || null;
}

function findServiceAssignmentServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();

  if (!normalizedServiceId) {
    return null;
  }

  return (
    (window.ElaraServicesMock?.services || []).find(
      (service) => String(service.serviceId || "").trim() === normalizedServiceId,
    ) || null
  );
}

function ensureServiceId(service, index) {
  if (service.serviceId || service.id) {
    return service.serviceId || service.id;
  }

  service.serviceId = `SRV-${String(index + 1).padStart(4, "0")}`;
  return service.serviceId;
}

function getNextServiceId() {
  const nextNumber =
    servicesData.services.reduce((highestNumber, service, index) => {
      const serviceId = ensureServiceId(service, index);
      const match = String(serviceId || "").match(/^SRV-(\d+)$/);
      const number = match ? Number(match[1]) : 0;

      return Math.max(highestNumber, number);
    }, 0) + 1;

  return `SRV-${String(nextNumber).padStart(4, "0")}`;
}

function getServiceIdentifier(service) {
  return service.serviceId || service.id || "Servicio mock";
}

function getServiceDetailDate(service) {
  return service.date || service.serviceDate || service.fecha || getDatePartFromServiceDateTime(service.dateTime) || "Sin definir";
}

function getServiceDetailTime(service) {
  return service.time || service.serviceTime || service.hora || getTimePartFromServiceDateTime(service.dateTime) || "Sin definir";
}

function getServiceDetailStatus(service) {
  return service.status || service.serviceStatus || service.estado || "Sin definir";
}

function getServiceDetailPassenger(service) {
  const passenger =
    service.passengerName ||
    service.passenger ||
    service.passengerFullName ||
    service.pasajero ||
    service.travelerName ||
    "";
  const normalizedPassenger = normalizeServiceDetailText(passenger);
  const normalizedClient = normalizeServiceDetailText(getServiceListClientName(service));

  if (!normalizedPassenger || normalizedPassenger === normalizedClient || normalizedPassenger === "cliente") {
    return "";
  }

  return passenger;
}

function setServicePassengerVisibility(passenger) {
  const passengerField = getElement("summary-service-passenger-field");

  if (!passengerField) {
    return;
  }

  passengerField.hidden = !passenger;
  setText("summary-service-passenger", passenger || "-");
}

function setServiceDetailVehicleSummary(service, vehicle) {
  const vehicleField = getElement("summary-service-vehicle");

  if (!vehicleField) {
    return;
  }

  const vehicleName = getServiceDetailVehicleName(service, vehicle);

  if (vehicleName === "Sin asignar") {
    vehicleField.textContent = vehicleName;
    return;
  }

  const plate = getServiceDetailPlate(vehicle);
  vehicleField.innerHTML = [
    `<span class="service-summary__vehicle-name">${escapeServiceDetailHtml(vehicleName)}</span>`,
    `<span class="service-summary__vehicle-plate">${escapeServiceDetailHtml(plate)}</span>`,
  ].join("");
}

function setServiceDetailPortalAccessWarning(service) {
  const field = getElement("summary-service-portal-access-warning-field");

  if (!field) {
    return;
  }

  const collaboratorId = service?.collaboratorId || service?.assignedCollaboratorId || service?.driverId || "";
  const access = collaboratorId ? getServiceAssignmentPortalAccessStatus(collaboratorId) : null;
  const shouldShowWarning = isServiceInProgress(service) && access && access.status !== "active";

  field.hidden = !shouldShowWarning;
  setText(
    "summary-service-portal-access-warning",
    shouldShowWarning
      ? "Este servicio est\u00e1 en curso y su conductor no tiene acceso activo al Portal. La coordinaci\u00f3n debe realizarse por otro medio."
      : "-",
  );
}

function getServiceDetailVehicle(service) {
  const vehicles = getServiceVehicles();
  const vehicleId = service.vehicleId || service.assignedVehicleId || service.vehicleCode;

  if (vehicleId) {
    const vehicleById = vehicles.find((vehicle) => vehicle.id === vehicleId || vehicle.code === vehicleId);

    if (vehicleById) {
      return vehicleById;
    }
  }

  const collaboratorName = normalizeServiceDetailText(service.collaborator || service.driver || service.chofer || "");

  if (collaboratorName && !["sin asignar", "no aplica"].includes(collaboratorName)) {
    const vehicleByCollaborator = vehicles.find((vehicle) =>
      [vehicle.assignedCollaboratorName, vehicle.driver].some((name) => normalizeServiceDetailText(name) === collaboratorName),
    );

    if (vehicleByCollaborator) {
      return vehicleByCollaborator;
    }
  }

  const vehicleName = normalizeServiceDetailText(service.vehicle || service.vehicleName || "");

  if (!vehicleName || ["pendiente", "sin asignar", "no aplica"].includes(vehicleName)) {
    return null;
  }

  return (
    vehicles.find((vehicle) => {
      const fullName = normalizeServiceDetailText(`${vehicle.brand || ""} ${vehicle.model || ""}`);
      const compactModel = normalizeServiceDetailText(vehicle.model || "");

      return fullName.includes(vehicleName) || vehicleName.includes(fullName) || compactModel.includes(vehicleName);
    }) || null
  );
}

function getServiceDetailVehicleName(service, vehicle) {
  const vehicleText = service.vehicle || service.vehicleName;
  const normalizedVehicleText = normalizeServiceDetailText(vehicleText);

  if (vehicleText && !["pendiente", "sin asignar", "no aplica"].includes(normalizedVehicleText)) {
    return vehicleText;
  }

  if (vehicle) {
    return joinFilledValues([vehicle.brand, vehicle.model]).replace(" / ", " ");
  }

  return "Sin asignar";
}

function getServiceDetailPlate(vehicle) {
  const plate = vehicle?.plate || vehicle?.registration || vehicle?.matricula || "";
  const formattedPlate = formatServiceDetailPlate(plate);

  return formattedPlate || "Matrícula no indicada";
}

function formatServiceDetailPlate(plate) {
  const plateValue = String(plate || "").trim();

  if (!plateValue) {
    return "";
  }

  if (typeof formatSpanishPlate === "function") {
    return formatSpanishPlate(plateValue);
  }

  return plateValue.toUpperCase();
}

function getServiceDetailNotes(service) {
  return (
    service.notes ||
    service.observations ||
    service.serviceNotes ||
    service.observaciones ||
    service.comments ||
    service.comentarios ||
    "Sin observaciones."
  );
}

function getDatePartFromServiceDateTime(dateTime) {
  const [date] = String(dateTime || "").split(" ");

  return date || "";
}

function getTimePartFromServiceDateTime(dateTime) {
  const [, time] = String(dateTime || "").split(" ");

  return time || "";
}

function getServiceVehicles() {
  return window.ElaraVehiclesMock?.vehicles || [];
}

function normalizeServiceDetailText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeServiceDetailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getServiceListClientName(service) {
  if (service.customerCode) {
    const customer = getServiceCustomers().find((item) => item.code === service.customerCode);

    if (customer) {
      return getServiceCustomerDisplayName(customer);
    }
  }

  return stripServiceCustomerCode(service.client);
}

function stripServiceCustomerCode(clientName) {
  return String(clientName || "").replace(/\s+\((?:CL|EMP)-\d+\)$/i, "");
}

function getServiceRoute(service) {
  const stops = Array.isArray(service.stops) ? service.stops.length : 0;
  const stopsLabel = stops > 0 ? ` <span class="operation-card__stops">(+${stops})</span>` : "";

  return `${escapeHtml(service.origin)} -&gt; ${escapeHtml(service.destination)}${stopsLabel}`;
}

function formatServiceDateTime(service) {
  const shortDate = service.date.split("/").slice(0, 2).join("/");

  return `${shortDate} ${service.time}`;
}

function getElement(id) {
  return document.getElementById(id);
}

// =========================
// Modal nuevo servicio
// =========================

function initNewServiceModal() {
  initModalControls();
  initWizardControls();
  initServiceTypeFields();
  initNewServiceDraftControls();
  initNewServiceAssignmentControls();
  initClientControls();
  initPassengerControls();
}

function initModalControls() {
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-modal-open]");
    const closeButton = event.target.closest("[data-modal-close]");

    if (openButton) {
      openServiceModal(openButton.dataset.modalOpen);
      return;
    }

    if (closeButton) {
      closeServiceModal(closeButton.closest(".modal-backdrop"));
      return;
    }

    if (event.target.classList.contains("modal-backdrop")) {
      closeServiceModal(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((modal) => {
      closeServiceModal(modal);
    });
  });
}

function initWizardControls() {
  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-step-toggle]");

    if (toggleButton) {
      const step = toggleButton.closest("[data-step]");
      showWizardStep(Number(step.dataset.step));
    }
  });
}

function initServiceTypeFields() {
  const serviceTypeSelect = getElement("service-type-select");

  if (!serviceTypeSelect) {
    return;
  }

  serviceTypeSelect.addEventListener("change", () => {
    updateServiceExtraFields(serviceTypeSelect.value);
    updateNewServiceSummary();
  });
  updateServiceExtraFields(serviceTypeSelect.value);
}

function initNewServiceDraftControls() {
  const modal = getElement("new-service-modal");
  const addStopButton = getElement("new-service-add-stop");
  const stopsList = getElement("new-service-stops-list");
  const createServiceButton = getElement("new-service-create");

  if (!modal) {
    return;
  }

  modal.addEventListener("input", handleNewServiceDraftChange);
  modal.addEventListener("change", handleNewServiceDraftChange);

  if (addStopButton) {
    addStopButton.addEventListener("click", addNewServiceStop);
  }

  if (stopsList) {
    stopsList.addEventListener("input", (event) => {
      const stopInput = event.target.closest("[data-new-service-stop-input]");

      if (stopInput) {
        updateNewServiceStop(Number(stopInput.dataset.newServiceStopInput), stopInput.value);
      }
    });

    stopsList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-new-service-remove-stop]");

      if (removeButton) {
        removeNewServiceStop(Number(removeButton.dataset.newServiceRemoveStop));
      }
    });
  }

  if (createServiceButton) {
    createServiceButton.addEventListener("click", createNewServiceFromModal);
  }

  renderNewServiceStops();
  updateNewServiceSummary();
}

function handleNewServiceDraftChange(event) {
  const target = event.target;

  if (target?.closest("#new-service-assignment-search")) {
    return;
  }

  reconcileNewServiceAssignmentSelection();
  updateNewServiceSummary();
}

function initNewServiceAssignmentControls() {
  const searchInput = getElement("new-service-assignment-search");
  const list = getElement("new-service-assignment-list");
  const skipButton = getElement("new-service-assignment-skip");
  const clearButton = getElement("new-service-assignment-clear");
  const confirmCancelButton = getElement("new-service-assignment-confirm-cancel");
  const confirmActionButton = getElement("new-service-assignment-confirm-action");

  if (searchInput && !searchInput.dataset.newServiceAssignmentReady) {
    searchInput.dataset.newServiceAssignmentReady = "true";
    searchInput.addEventListener("input", () => {
      newServiceDraft.assignmentSearchTerm = normalizeServiceDetailText(searchInput.value);
      renderNewServiceAssignmentStep();
    });
  }

  if (list && !list.dataset.newServiceAssignmentReady) {
    list.dataset.newServiceAssignmentReady = "true";
    list.addEventListener("click", (event) => {
      const collaboratorsToggle = event.target.closest("[data-new-service-assignment-toggle-collaborators]");
      const candidateButton = event.target.closest("[data-new-service-assignment-candidate]");

      if (collaboratorsToggle) {
        newServiceDraft.showAssignmentCollaborators = !newServiceDraft.showAssignmentCollaborators;
        renderNewServiceAssignmentStep();
        return;
      }

      if (candidateButton) {
        selectNewServiceAssignmentCandidate(candidateButton.dataset.newServiceAssignmentCandidate);
      }
    });
  }

  if (skipButton && !skipButton.dataset.newServiceAssignmentReady) {
    skipButton.dataset.newServiceAssignmentReady = "true";
    skipButton.addEventListener("click", skipNewServiceAssignment);
  }

  if (clearButton && !clearButton.dataset.newServiceAssignmentReady) {
    clearButton.dataset.newServiceAssignmentReady = "true";
    clearButton.addEventListener("click", clearNewServiceAssignmentSelection);
  }

  if (confirmCancelButton && !confirmCancelButton.dataset.newServiceAssignmentReady) {
    confirmCancelButton.dataset.newServiceAssignmentReady = "true";
    confirmCancelButton.addEventListener("click", cancelNewServiceAssignmentConfirmation);
  }

  if (confirmActionButton && !confirmActionButton.dataset.newServiceAssignmentReady) {
    confirmActionButton.dataset.newServiceAssignmentReady = "true";
    confirmActionButton.addEventListener("click", confirmNewServiceAssignmentAction);
  }
}

function initClientControls() {
  const createClientToggle = getElement("create-client-toggle");
  const clientSearch = getElement("new-service-client-search");
  const customerCreationBlock = getElement("new-client-fields");

  if (createClientToggle) {
    createClientToggle.addEventListener("click", openServiceCustomerCreation);
  }

  if (clientSearch) {
    clientSearch.addEventListener("input", () => {
      if (newServiceDraft.selectedCustomer) {
        newServiceDraft.selectedCustomer = null;
        renderServiceSelectedCustomer();
      }

      renderServiceCustomerSearchResults(clientSearch.value);
      updateNewServiceSummary();
    });
  }

  if (customerCreationBlock) {
    customerCreationBlock.addEventListener("input", () => {
      serviceCustomerCreationState.duplicateCustomer = null;
      renderServiceCustomerDuplicate(null);
      clearServiceCustomerValidation();
      updateNewServiceSummary();
    });
  }

  document.addEventListener("change", (event) => {
    const typeInput = event.target.closest("[data-service-customer-type]");

    if (typeInput) {
      selectServiceNewCustomerType(typeInput.value);
    }
  });

  document.addEventListener("click", (event) => {
    const cancelCreationButton = event.target.closest("#service-customer-cancel-create");
    const saveCustomerButton = event.target.closest("#service-customer-save");
    const useDuplicateButton = event.target.closest("[data-service-customer-use-duplicate]");
    const changeCustomerButton = event.target.closest("#service-customer-change");
    const customerResultButton = event.target.closest("[data-service-customer-result]");

    if (cancelCreationButton) {
      closeServiceCustomerCreation();
      return;
    }

    if (saveCustomerButton) {
      createAndSelectServiceCustomer();
      return;
    }

    if (customerResultButton) {
      const customer = findServiceCustomerByCode(customerResultButton.dataset.serviceCustomerResult);

      selectServiceCustomer(customer);
      return;
    }

    if (useDuplicateButton) {
      if (selectServiceCustomer(serviceCustomerCreationState.duplicateCustomer)) {
        closeServiceCustomerCreation();
      }
      return;
    }

    if (changeCustomerButton) {
      newServiceDraft.selectedCustomer = null;
      const searchInput = getElement("new-service-client-search");

      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }

      renderServiceSelectedCustomer();
      renderServiceCustomerSearchResults("");
      updateNewServiceSummary();
    }
  });
}

function initPassengerControls() {
  const passengerToggle = getElement("alternate-passenger-toggle");
  const passengerFields = getElement("alternate-passenger-fields");

  if (!passengerToggle || !passengerFields) {
    return;
  }

  passengerToggle.addEventListener("change", () => {
    if (isNewServiceCompanyClient()) {
      passengerToggle.checked = true;
      passengerFields.hidden = false;
      return;
    }

    passengerFields.hidden = !passengerToggle.checked;

    if (passengerFields.hidden) {
      clearFields(passengerFields);
      updateNewServiceSummary();
    }
  });
}

function openServiceModal(modalId) {
  const modal = getElement(modalId);

  if (modal) {
    if (modalId === "new-service-modal") {
      resetNewServiceModal();
    }

    if (modalId === "new-service-modal") {
      showWizardStep(1);
      renderNewServiceStops();
      updateNewServiceSummary();
    }

    modal.hidden = false;
  }
}

function closeServiceModal(modal) {
  if (modal) {
    if (modal.id === "new-service-modal") {
      resetNewServiceModal();
    }

    if (modal.id === "service-assignment-modal") {
      resetServiceAssignmentModal();
    }

    if (modal.id === "service-summary-modal") {
      restoreServiceDetailSpecificSnapshot(getCurrentServiceDetailService());
      serviceDetailState.serviceId = "";
      serviceDetailState.editMode = false;
      serviceDetailState.cancelMode = false;
      clearServiceDetailEditValidation();
      clearServiceDetailCancelValidation();
    }

    if (modal.id === "service-payment-modal") {
      clearServicePaymentValidation();
    }

    if (modal.id === "service-writeoff-modal") {
      clearServiceWriteOffValidation();
    }

    modal.hidden = true;

    if ((modal.id === "service-payment-modal" || modal.id === "service-writeoff-modal") && serviceFinancialState.returnToDetail) {
      serviceFinancialState.returnToDetail = false;
      const detailService = getCurrentServiceDetailService();

      if (detailService) {
        renderServiceDetailModal(detailService);
        const detailModal = getElement("service-summary-modal");

        if (detailModal) {
          detailModal.hidden = false;
        }
      }
    }
  }
}

function showWizardStep(stepNumber) {
  if (stepNumber >= 4 && !newServiceDraft.assignmentDecision) {
    notifyNewService("Selecciona un conductor o elige Continuar sin asignar antes de avanzar a Pago.", "warning");
    stepNumber = 3;
  }

  if (stepNumber === 3) {
    reconcileNewServiceAssignmentSelection();
    renderNewServiceAssignmentStep();
  }

  if (stepNumber === 5) {
    updateNewServiceSummary();
  }

  document.querySelectorAll(".wizard-step").forEach((step) => {
    const currentStepNumber = Number(step.dataset.step);
    const body = step.querySelector(".wizard-step__body");
    const isActive = currentStepNumber === stepNumber;

    step.classList.toggle("wizard-step--active", isActive);
    step.classList.toggle("wizard-step--complete", currentStepNumber < stepNumber);
    step.classList.toggle("wizard-step--pending", currentStepNumber > stepNumber);

    if (body) {
      body.hidden = !isActive;
    }

    const toggleButton = step.querySelector("[data-step-toggle]");

    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", String(isActive));
    }
  });
}

function updateServiceExtraFields(selectedType) {
  document.querySelectorAll("[data-service-extra]").forEach((group) => {
    const isActive = group.dataset.serviceExtra === selectedType;

    group.hidden = !isActive;

    if (!isActive) {
      clearFields(group);
    }
  });
}

function addNewServiceStop() {
  const lastStop = newServiceDraft.stops[newServiceDraft.stops.length - 1];

  if (newServiceDraft.stops.length && !lastStop.trim()) {
    notifyNewService("Completa la parada actual antes de a\u00f1adir otra.", "warning");
    return;
  }

  newServiceDraft.stops.push("");
  renderNewServiceStops();
  updateNewServiceSummary();
}

function updateNewServiceStop(stopIndex, value) {
  if (Number.isNaN(stopIndex) || !newServiceDraft.stops[stopIndex] && newServiceDraft.stops[stopIndex] !== "") {
    return;
  }

  newServiceDraft.stops[stopIndex] = value;
  updateNewServiceSummary();
}

function removeNewServiceStop(stopIndex) {
  if (Number.isNaN(stopIndex)) {
    return;
  }

  newServiceDraft.stops = newServiceDraft.stops.filter((_, index) => index !== stopIndex);
  renderNewServiceStops();
  updateNewServiceSummary();
}

function renderNewServiceStops() {
  const stopsList = getElement("new-service-stops-list");

  if (!stopsList) {
    return;
  }

  if (!newServiceDraft.stops.length) {
    stopsList.innerHTML = "";
    return;
  }

  stopsList.innerHTML = newServiceDraft.stops
    .map(
      (stop, index) => `
        <div class="new-service-stop-item">
          <label class="field">
            <span>Parada ${escapeHtml(index + 1)}</span>
            <input type="text" value="${escapeHtml(stop)}" data-new-service-stop-input="${escapeHtml(index)}" placeholder="Direcci&oacute;n o punto de paso" />
          </label>
          <button class="button button--compact button--muted" type="button" data-new-service-remove-stop="${escapeHtml(index)}">Eliminar</button>
        </div>
      `,
    )
    .join("");
}

function renderNewServiceAssignmentStep() {
  const serviceDraft = getNewServiceAssignmentDraftService();
  const assignment = newServiceDraft.assignment;
  const clearButton = getElement("new-service-assignment-clear");
  const listView = getElement("new-service-assignment-list-view");
  const confirmation = getElement("new-service-assignment-confirm");

  setText("new-service-assignment-date-time", formatNewServiceDateTime(getInputValue("new-service-date"), getInputValue("new-service-time")));
  setText("new-service-assignment-type", serviceDraft.type || "Sin tipo");
  setText("new-service-assignment-route", `${serviceDraft.origin || "Sin origen"} - ${serviceDraft.destination || "Sin destino"}`);
  setText("new-service-assignment-passengers", getNewServicePassengerSummary());
  setText("new-service-assignment-needs", getNewServiceAssignmentNeedsSummary(serviceDraft));
  setText("new-service-assignment-current", getNewServiceAssignmentCurrentText());

  if (clearButton) {
    clearButton.hidden = !assignment;
  }

  if (listView) {
    listView.hidden = Boolean(newServiceDraft.pendingAssignmentAction);
  }

  if (confirmation) {
    confirmation.hidden = !newServiceDraft.pendingAssignmentAction;
  }

  if (newServiceDraft.pendingAssignmentAction) {
    setText("new-service-assignment-confirm-title", newServiceDraft.pendingAssignmentAction.title || "Confirmar asignaci\u00f3n");
    setText("new-service-assignment-confirm-message", newServiceDraft.pendingAssignmentAction.message);
    setText("new-service-assignment-confirm-action", newServiceDraft.pendingAssignmentAction.confirmLabel);
    getElement("new-service-assignment-confirm-action")?.focus();
  }

  renderNewServiceAssignmentCandidates(serviceDraft);
}

function renderNewServiceAssignmentCandidates(serviceDraft = getNewServiceAssignmentDraftService()) {
  const list = getElement("new-service-assignment-list");

  if (!list) {
    return;
  }

  const assignableCandidates = getServiceAssignableCollaboratorsForService(serviceDraft);
  const choferCandidates = getSortedServiceAssignmentCandidates(assignableCandidates, serviceDraft)
    .filter((candidate) => getServiceAssignmentDriverType(candidate.collaborator) === "Chofer")
    .filter(matchesNewServiceAssignmentSearch);
  const collaboratorCandidates = newServiceDraft.showAssignmentCollaborators
    ? getSortedServiceAssignmentCandidates(assignableCandidates, serviceDraft)
        .filter((candidate) => getServiceAssignmentDriverType(candidate.collaborator) === "Colaborador")
        .filter(matchesNewServiceAssignmentSearch)
    : [];
  const collaboratorsToggleLabel = newServiceDraft.showAssignmentCollaborators ? "Ocultar colaboradores" : "Ver colaboradores";
  const notice = newServiceDraft.assignmentNotice
    ? `<p class="service-assignment-empty">${escapeHtml(newServiceDraft.assignmentNotice)}</p>`
    : "";

  list.innerHTML = `
    ${notice}
    <div class="service-assignment-group">
      ${
        choferCandidates.length
          ? choferCandidates.map((candidate) => renderNewServiceAssignmentCandidate(candidate, serviceDraft)).join("")
          : '<p class="service-assignment-empty">No hay choferes disponibles para este servicio.</p>'
      }
    </div>
    <button class="button button--compact button--muted service-assignment-toggle" type="button" data-new-service-assignment-toggle-collaborators>${collaboratorsToggleLabel}</button>
    ${
      newServiceDraft.showAssignmentCollaborators
        ? `<div class="service-assignment-group">
            ${
              collaboratorCandidates.length
                ? collaboratorCandidates.map((candidate) => renderNewServiceAssignmentCandidate(candidate, serviceDraft)).join("")
                : '<p class="service-assignment-empty">No hay colaboradores disponibles para este servicio.</p>'
            }
          </div>`
        : ""
    }
  `;
}

function renderNewServiceAssignmentCandidate(candidate, serviceDraft) {
  const vehicleText = getServiceAssignmentVehicleText(candidate.vehicle);
  const plate = getServiceAssignmentVehiclePlate(candidate.vehicle);
  const operationalStatus = getServiceAssignmentOperationalStatus(candidate.collaborator);
  const driverType = getServiceAssignmentDriverType(candidate.collaborator);
  const isSelected = newServiceDraft.assignment?.collaboratorId === candidate.collaborator.id;
  const conflict = getServiceAssignmentTimeConflictForService(serviceDraft, candidate.collaborator);

  return `
    <article class="service-assignment-item${isSelected ? " service-assignment-item--selected" : ""}">
      <div class="service-assignment-item__content">
        <div class="service-assignment-item__name-row">
          <strong>${escapeHtml(candidate.collaborator.name)}</strong>
          <span class="service-assignment-item__driver-type">${escapeHtml(driverType)}</span>
        </div>
        <span>${escapeHtml(vehicleText)} \u00b7 ${escapeHtml(plate)}</span>
        <small>Estado operativo: ${escapeHtml(operationalStatus)}</small>
        ${conflict ? `<small class="service-assignment-item__warning">Conflicto: otro servicio a ${escapeHtml(conflict.time)} (${escapeHtml(conflict.minutes)} min).</small>` : ""}
      </div>
      <button class="button button--compact${isSelected ? " button--muted" : ""}" type="button" data-new-service-assignment-candidate="${escapeHtml(candidate.collaborator.id)}">${isSelected ? "Seleccionado" : "Seleccionar"}</button>
    </article>
  `;
}

function selectNewServiceAssignmentCandidate(collaboratorId) {
  const serviceDraft = getNewServiceAssignmentDraftService();
  const collaborator = getServiceCollaboratorById(collaboratorId);
  const vehicle = collaborator ? getServiceAssignmentVehicle(collaborator) : null;

  if (!collaborator || !vehicle || !isServiceAssignmentVehicleAssignable(vehicle)) {
    notifyNewService("No se pudo seleccionar este conductor.", "error");
    clearNewServiceAssignmentSelection();
    return;
  }

  const conflict = getServiceAssignmentTimeConflictForService(serviceDraft, collaborator);

  if (conflict) {
    const vehicleSummary = `${getServiceAssignmentVehicleText(vehicle)} \u00b7 ${getServiceAssignmentVehiclePlate(vehicle)}`;

    newServiceDraft.pendingAssignmentAction = {
      collaboratorId,
      title: "Advertencia de horario",
      message: getServiceAssignmentConflictMessage(collaborator, conflict, vehicleSummary, false),
      confirmLabel: "Asignar de todos modos",
    };
    renderNewServiceAssignmentStep();
    return;
  }

  if (shouldPauseNewServiceAssignmentForPortalAccess({ collaboratorId }, collaborator, serviceDraft)) {
    return;
  }

  applyNewServiceAssignmentSelection(collaborator, vehicle);
}

function confirmNewServiceAssignmentAction() {
  const action = newServiceDraft.pendingAssignmentAction;
  const collaborator = action ? getServiceCollaboratorById(action.collaboratorId) : null;
  const vehicle = collaborator ? getServiceAssignmentVehicle(collaborator) : null;

  if (!action || !collaborator || !vehicle || !isServiceAssignmentVehicleAssignable(vehicle)) {
    notifyNewService("No se pudo completar la selecci\u00f3n.", "error");
    cancelNewServiceAssignmentConfirmation();
    return;
  }

  if (shouldPauseNewServiceAssignmentForPortalAccess(action, collaborator, getNewServiceAssignmentDraftService())) {
    return;
  }

  applyNewServiceAssignmentSelection(collaborator, vehicle, action);
}

function cancelNewServiceAssignmentConfirmation() {
  newServiceDraft.pendingAssignmentAction = null;
  renderNewServiceAssignmentStep();
}

function shouldPauseNewServiceAssignmentForPortalAccess(action, collaborator, serviceDraft) {
  const access = getServiceAssignmentPortalAccessStatus(action.collaboratorId);

  if (!access) {
    notifyNewService("No se pudo verificar el acceso del conductor. Int\u00e9ntalo nuevamente.", "error");
    return true;
  }

  if (access.status === "active") {
    return false;
  }

  if (action.portalAccessWarningAccepted && action.portalAccessStatus === access.status) {
    return false;
  }

  newServiceDraft.pendingAssignmentAction = {
    ...action,
    title: getServicePortalAccessWarningTitle(access.status),
    message: getServicePortalAccessWarningMessage({
      collaborator,
      service: serviceDraft,
      access,
      serviceLabel: "Nuevo servicio",
    }),
    confirmLabel: "Asignar de todos modos",
    portalAccessWarningAccepted: true,
    portalAccessStatus: access.status,
  };
  renderNewServiceAssignmentStep();

  return true;
}

function applyNewServiceAssignmentSelection(collaborator, vehicle, action = {}) {
  newServiceDraft.assignmentDecision = "assigned";
  newServiceDraft.assignment = {
    collaboratorId: collaborator.id,
    vehicleId: vehicle.id,
    collaborator: collaborator.name,
    driverType: getServiceAssignmentDriverType(collaborator),
    vehicle: getServiceAssignmentVehicleText(vehicle),
    plate: getServiceAssignmentVehiclePlate(vehicle),
    assignmentStatus: "Pendiente",
    portalAccessWarningAccepted: Boolean(action.portalAccessWarningAccepted),
    portalAccessStatus: action.portalAccessStatus || "",
  };
  newServiceDraft.pendingAssignmentAction = null;
  newServiceDraft.assignmentNotice = "";
  renderNewServiceAssignmentStep();
  updateNewServiceSummary();
}

function skipNewServiceAssignment() {
  newServiceDraft.assignmentDecision = "skipped";
  newServiceDraft.assignment = null;
  newServiceDraft.pendingAssignmentAction = null;
  newServiceDraft.assignmentNotice = "";
  updateNewServiceSummary();
  showWizardStep(4);
}

function clearNewServiceAssignmentSelection() {
  newServiceDraft.assignmentDecision = "";
  newServiceDraft.assignment = null;
  newServiceDraft.pendingAssignmentAction = null;
  renderNewServiceAssignmentStep();
  updateNewServiceSummary();
}

function reconcileNewServiceAssignmentSelection() {
  if (!newServiceDraft.assignment) {
    return;
  }

  const collaborator = getServiceCollaboratorById(newServiceDraft.assignment.collaboratorId);
  const vehicle = collaborator ? getServiceAssignmentVehicle(collaborator) : null;
  const isStillAssignable =
    collaborator &&
    vehicle &&
    getServiceAssignableCollaboratorsForService(getNewServiceAssignmentDraftService()).some(
      (candidate) => candidate.collaborator.id === collaborator.id,
    );

  if (isStillAssignable) {
    const conflict = getServiceAssignmentTimeConflictForService(getNewServiceAssignmentDraftService(), collaborator);

    if (conflict) {
      newServiceDraft.assignmentDecision = "";
      newServiceDraft.assignment = null;
      newServiceDraft.pendingAssignmentAction = null;
      newServiceDraft.assignmentNotice = "La selecci\u00f3n anterior presenta un conflicto horario con los datos actuales. Vuelve a seleccionarla para confirmar.";
      return;
    }

    return;
  }

  newServiceDraft.assignmentDecision = "";
  newServiceDraft.assignment = null;
  newServiceDraft.pendingAssignmentAction = null;
  newServiceDraft.assignmentNotice = "La selecci\u00f3n anterior ya no es apta con los datos actuales del servicio.";
}

function getNewServiceAssignmentCurrentText() {
  const assignment = newServiceDraft.assignment;

  if (assignment) {
    return `${assignment.collaborator} \u00b7 ${assignment.driverType} \u00b7 ${assignment.vehicle} \u00b7 ${assignment.plate} \u00b7 Pendiente de aceptaci\u00f3n`;
  }

  if (newServiceDraft.assignmentDecision === "skipped") {
    return "Sin conductor asignado. El servicio quedar\u00e1 disponible para asignaci\u00f3n posterior.";
  }

  return "Selecciona un conductor o contin\u00faa sin asignar.";
}

function getNewServiceAssignmentSummary() {
  const assignment = newServiceDraft.assignment;

  if (!assignment) {
    return "Sin conductor asignado";
  }

  return `${assignment.collaborator} (${assignment.driverType}) \u00b7 ${assignment.vehicle} \u00b7 ${assignment.plate} \u00b7 Pendiente de aceptaci\u00f3n`;
}

function getNewServiceAssignmentNeedsSummary(serviceDraft) {
  return (
    joinFilledValues([
      serviceDraft.luggage ? `Equipaje: ${serviceDraft.luggage}` : "",
      serviceDraft.petType ? `Mascota: ${serviceDraft.petType} ${serviceDraft.petSize || ""}`.trim() : "",
      serviceDraft.fullDayNotes ? `Requerimientos: ${serviceDraft.fullDayNotes}` : "",
    ]) || "Sin necesidades indicadas"
  );
}

function getNewServiceAssignmentDraftService() {
  const serviceData = getNewServiceDraftData();
  const typeSpecificValues = getServiceTypeSpecificFields(serviceData.type).reduce((values, field) => {
    values[field.key] = getInputValue(field.sourceId);
    return values;
  }, {});

  return {
    serviceId: "__NEW_SERVICE_DRAFT__",
    status: "Pendiente",
    date: formatDateForMock(getInputValue("new-service-date")),
    time: getInputValue("new-service-time"),
    type: serviceData.type,
    origin: serviceData.origin,
    destination: serviceData.destination,
    stops: getFilledNewServiceStops(),
    ...typeSpecificValues,
  };
}

function matchesNewServiceAssignmentSearch(candidate) {
  return matchesServiceAssignmentSearchTerm(candidate, newServiceDraft.assignmentSearchTerm);
}

function updateNewServiceSummary() {
  const serviceData = getNewServiceDraftData();

  setText("new-service-summary-type", serviceData.type);
  setText("new-service-summary-date-time", serviceData.dateTime);
  setText("new-service-summary-client", serviceData.client);
  setText("new-service-summary-passenger", serviceData.passenger);
  renderNewServiceRouteSummary(serviceData.route);
  setText("new-service-summary-specifics", serviceData.specifics);
  setText("new-service-summary-notes", serviceData.notes);
  setText("new-service-summary-assignment", getNewServiceAssignmentSummary());
  setText("new-service-summary-payment", serviceData.payment);
  setText("new-service-summary-price", serviceData.price);
}

function getNewServiceDraftData() {
  const type = getInputValue("service-type-select") || "Aeropuerto";
  const date = getInputValue("new-service-date");
  const time = getInputValue("new-service-time");
  const origin = getInputValue("new-service-origin") || "Sin origen";
  const destination = getInputValue("new-service-destination") || "Sin destino";
  const currentCustomer = getCurrentServiceCustomer();

  return {
    type,
    dateTime: formatNewServiceDateTime(date, time),
    client: getNewServiceClientSummary(currentCustomer),
    customerCode: currentCustomer?.code || "",
    customerType: currentCustomer?.type || "",
    passenger: getNewServicePassengerSummary(),
    origin,
    destination,
    route: getNewServiceRouteItems(origin, destination),
    specifics: getNewServiceSpecifics(type),
    notes: getNewServiceNotes(),
    payment: getSelectedPaymentMethod(),
    price: getInputValue("new-service-estimated-price") || "Sin definir",
  };
}

function formatNewServiceDateTime(date, time) {
  if (date && time) {
    return `${date} ${time}`;
  }

  if (date) {
    return `${date} sin hora`;
  }

  if (time) {
    return `Sin fecha ${time}`;
  }

  return "Sin fecha ni hora";
}

function getNewServiceClientSummary(currentCustomer = getCurrentServiceCustomer()) {
  if (currentCustomer) {
    return getServiceCustomerDisplayLabel(currentCustomer);
  }

  const searchedClient = getInputValue("new-service-client-search");
  const newClientFields = getElement("new-client-fields");
  const isCreatingClient = newClientFields && !newClientFields.hidden;

  if (isCreatingClient) {
    return "Cliente pendiente de guardar";
  }

  return searchedClient || "Pendiente de seleccionar";
}

function getNewServicePassengerSummary() {
  const alternatePassengerToggle = getElement("alternate-passenger-toggle");
  const alternatePassengerName = getInputValue("alternate-passenger-name");
  const alternatePassengerContact = joinFilledValues([
    getInputValue("alternate-passenger-phone") ? `Tel: ${getInputValue("alternate-passenger-phone")}` : "",
    getInputValue("alternate-passenger-email") ? `Email: ${getInputValue("alternate-passenger-email")}` : "",
  ]);

  if (isNewServiceCompanyClient()) {
    return joinFilledValues([alternatePassengerName || "Pasajero/contacto pendiente", alternatePassengerContact]);
  }

  if (alternatePassengerToggle && alternatePassengerToggle.checked) {
    return joinFilledValues([alternatePassengerName || "Pasajero alternativo pendiente", alternatePassengerContact]);
  }

  return "Cliente";
}

function getNewServiceRouteItems(origin, destination) {
  return [
    { label: "Origen", value: origin },
    ...getFilledNewServiceStops().map((stop, index) => ({ label: `Parada ${index + 1}`, value: stop })),
    { label: "Destino", value: destination },
  ];
}

function renderNewServiceRouteSummary(routeItems) {
  const routeSummary = getElement("new-service-summary-route");

  if (!routeSummary) {
    return;
  }

  routeSummary.innerHTML = `
    <div class="new-service-route-summary">
      ${routeItems
        .map(
          (item) => `
            <div class="new-service-route-summary__item">
              <span class="new-service-route-summary__label">${escapeHtml(item.label)}:</span>
              <span class="new-service-route-summary__value">${escapeHtml(item.value)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function getNewServiceSpecifics(type) {
  return getServiceSpecificsSummary(
    type,
    getServiceTypeSpecificFields(type).reduce((values, field) => {
      values[field.key] = getInputValue(field.sourceId);
      return values;
    }, {}),
  );
}

function getNewServiceNotes() {
  return (
    joinFilledValues([
      getInputValue("new-service-route-notes") ? `Trayecto: ${getInputValue("new-service-route-notes")}` : "",
      getInputValue("new-service-internal-notes") ? `Internas: ${getInputValue("new-service-internal-notes")}` : "",
    ]) || "Sin observaciones"
  );
}

function getSelectedPaymentMethod() {
  return "Efectivo";
}

function createNewServiceFromModal() {
  const serviceData = getNewServiceDraftData();
  const validationMessage = getNewServiceValidationMessage(serviceData);

  if (validationMessage) {
    notifyNewService(validationMessage, "warning");
    return;
  }

  if (shouldPauseNewServiceCreationForPortalAccess()) {
    return;
  }

  const service = buildNewMockService(serviceData);

  servicesData.services.unshift(service);
  renderServicesSummary();
  renderServicesList();
  if (newServiceDraft.assignment) {
    const collaborator = getServiceCollaboratorById(newServiceDraft.assignment.collaboratorId);

    if (collaborator) {
      registerServiceAssignmentActivity(service, collaborator, false);
    }
  }
  emitServiceUpdatedEvent("created", service);
  notifyNewService("Servicio creado en mock.", "success");
  closeServiceModal(getElement("new-service-modal"));
}

function getNewServiceValidationMessage(serviceData) {
  if (!getInputValue("new-service-date") || !getInputValue("new-service-time")) {
    return "Completa fecha y hora para crear el servicio.";
  }

  if (serviceData.origin === "Sin origen" || serviceData.destination === "Sin destino") {
    return "Completa origen y destino para crear el servicio.";
  }

  if (["Pendiente de seleccionar", "Cliente pendiente de guardar"].includes(serviceData.client)) {
    return "Selecciona o crea un cliente para el servicio.";
  }

  if (!newServiceDraft.assignmentDecision) {
    return "Selecciona un conductor o elige Continuar sin asignar antes de crear el servicio.";
  }

  if (serviceData.price !== "Sin definir" && !isValidServiceDetailPrice(serviceData.price)) {
    return "El precio base debe ser mayor que 0.";
  }

  const currentCustomer = getCurrentServiceCustomer();
  const customerApi = getServiceCustomerApi();

  if (
    currentCustomer &&
    customerApi &&
    typeof customerApi.isCustomerBlockedForNewService === "function" &&
    customerApi.isCustomerBlockedForNewService(currentCustomer)
  ) {
    return "Este cliente está bloqueado y no puede recibir nuevos servicios.";
  }

  return "";
}

function shouldPauseNewServiceCreationForPortalAccess() {
  const assignment = newServiceDraft.assignment;

  if (!assignment) {
    return false;
  }

  const collaborator = getServiceCollaboratorById(assignment.collaboratorId);

  if (!collaborator) {
    notifyNewService("No se pudo verificar el acceso del conductor. Int\u00e9ntalo nuevamente.", "error");
    showWizardStep(3);
    return true;
  }

  const shouldPause = shouldPauseNewServiceAssignmentForPortalAccess(
    {
      collaboratorId: assignment.collaboratorId,
      portalAccessWarningAccepted: Boolean(assignment.portalAccessWarningAccepted),
      portalAccessStatus: assignment.portalAccessStatus || "",
    },
    collaborator,
    getNewServiceAssignmentDraftService(),
  );

  if (shouldPause) {
    showWizardStep(3);
  }

  return shouldPause;
}

function buildNewMockService(serviceData) {
  const date = getInputValue("new-service-date");
  const assignment = newServiceDraft.assignment;
  const service = {
    serviceId: getNextServiceId(),
    status: "Pendiente",
    date: formatDateForMock(date),
    time: getInputValue("new-service-time"),
    type: serviceData.type,
    client: serviceData.client,
    customerCode: serviceData.customerCode,
    customerType: serviceData.customerType,
    origin: serviceData.origin,
    destination: serviceData.destination,
    stops: getFilledNewServiceStops(),
    collaboratorId: assignment?.collaboratorId || "",
    vehicleId: assignment?.vehicleId || "",
    collaborator: assignment?.collaborator || "",
    vehicle: assignment?.vehicle || "",
    plate: assignment?.plate || "",
    assignmentStatus: assignment ? "Pendiente" : "",
    payment: serviceData.payment,
    price: serviceData.price,
    risk: "none",
    action: assignment ? "Ver" : "Asignar",
  };

  updateServiceFinancialBasePrice(service, serviceData.price === "Sin definir" ? "" : serviceData.price);

  return service;
}

function resetNewServiceModal() {
  const modal = getElement("new-service-modal");

  if (!modal) {
    return;
  }

  modal.querySelectorAll("input, textarea").forEach((field) => {
    if (field.type === "checkbox" || field.type === "radio") {
      field.checked = false;
    } else {
      field.value = "";
    }
  });

  modal.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = 0;
  });

  const serviceTypeSelect = getElement("service-type-select");

  if (serviceTypeSelect) {
    serviceTypeSelect.value = NEW_SERVICE_DEFAULT_TYPE;
  }

  const pendingPayment = modal.querySelector('input[name="payment-method"][value="Efectivo"]');

  if (pendingPayment) {
    pendingPayment.checked = true;
  }

  newServiceDraft.stops = [];
  newServiceDraft.selectedCustomer = null;
  newServiceDraft.assignmentDecision = "";
  newServiceDraft.assignment = null;
  newServiceDraft.assignmentSearchTerm = "";
  newServiceDraft.showAssignmentCollaborators = false;
  newServiceDraft.pendingAssignmentAction = null;
  newServiceDraft.assignmentNotice = "";
  resetNewServiceDependentBlocks();
  renderNewServiceStops();
  updateServiceExtraFields(NEW_SERVICE_DEFAULT_TYPE);
  renderNewServiceAssignmentStep();
  updateNewServiceSummary();
  showWizardStep(1);
}

function resetNewServiceDependentBlocks() {
  const alternatePassengerToggle = getElement("alternate-passenger-toggle");
  const alternatePassengerToggleField = getElement("alternate-passenger-toggle-field");
  const alternatePassengerFields = getElement("alternate-passenger-fields");

  closeServiceCustomerCreation();
  renderServiceSelectedCustomer();
  renderServiceCustomerSearchResults("");

  if (alternatePassengerToggle) {
    alternatePassengerToggle.checked = false;
    delete alternatePassengerToggle.dataset.companyPassenger;
  }

  if (alternatePassengerToggleField) {
    alternatePassengerToggleField.hidden = false;
  }

  if (alternatePassengerFields) {
    alternatePassengerFields.hidden = true;
  }
}

function openServiceCustomerCreation() {
  const creationBlock = getElement("new-client-fields");

  if (!creationBlock) {
    return;
  }

  resetServiceCustomerCreation();
  creationBlock.hidden = false;
  renderServiceCustomerSearchResults("");
  updateNewServiceSummary();
}

function closeServiceCustomerCreation() {
  const creationBlock = getElement("new-client-fields");

  if (creationBlock) {
    creationBlock.hidden = true;
  }

  resetServiceCustomerCreation();
  updateNewServiceSummary();
}

function selectServiceNewCustomerType(customerType) {
  if (!["Particular", "Empresa"].includes(customerType) || customerType === serviceCustomerCreationState.selectedType) {
    updateServiceCustomerTypeControls();
    return;
  }

  activateServiceCustomerType(customerType);
}

function activateServiceCustomerType(customerType) {
  serviceCustomerCreationState.selectedType = customerType;
  serviceCustomerCreationState.duplicateCustomer = null;
  clearServiceCustomerCreationFields();
  clearServiceCustomerValidation();
  renderServiceCustomerDuplicate(null);
  updateServiceCustomerTypeControls();
  updateNewServiceSummary();
}

function resetServiceCustomerCreation() {
  serviceCustomerCreationState.selectedType = "";
  serviceCustomerCreationState.duplicateCustomer = null;
  clearServiceCustomerCreationFields();
  clearServiceCustomerValidation();
  renderServiceCustomerDuplicate(null);
  updateServiceCustomerTypeControls();
}

function updateServiceCustomerTypeControls() {
  document.querySelectorAll("[data-service-customer-type]").forEach((input) => {
    input.checked = input.value === serviceCustomerCreationState.selectedType;
  });

  document.querySelectorAll("[data-service-customer-section]").forEach((section) => {
    section.hidden = section.dataset.serviceCustomerSection !== serviceCustomerCreationState.selectedType;
  });
}

function getServiceCustomerCreationData() {
  if (serviceCustomerCreationState.selectedType === "Particular") {
    return {
      type: "Particular",
      firstName: getInputValue("service-customer-first-name"),
      lastName: getInputValue("service-customer-last-name"),
      countryCode: getInputValue("service-customer-country-code"),
      phone: getInputValue("service-customer-phone"),
      email: getInputValue("service-customer-email"),
      status: "Nuevo",
      notes: getInputValue("service-customer-notes"),
      needs: getInputValue("service-customer-needs"),
    };
  }

  if (serviceCustomerCreationState.selectedType === "Empresa") {
    return {
      type: "Empresa",
      companyName: getInputValue("service-customer-company-name"),
      tradeName: getInputValue("service-customer-trade-name"),
      taxId: getInputValue("service-customer-tax-id"),
      mainContact: getInputValue("service-customer-main-contact"),
      status: "Nuevo",
      countryCode: getInputValue("service-customer-company-country-code"),
      phone: getInputValue("service-customer-company-phone"),
      email: getInputValue("service-customer-company-email"),
      billing: getInputValue("service-customer-billing"),
      notes: getInputValue("service-customer-company-notes"),
      needs: getInputValue("service-customer-company-needs"),
    };
  }

  return {
    type: "",
  };
}

function validateServiceCustomerCreation(customerData) {
  clearServiceCustomerValidation();
  const customerApi = getServiceCustomerApi();
  const validationError =
    customerApi && typeof customerApi.validateCustomerCreationData === "function"
      ? customerApi.validateCustomerCreationData(customerData)
      : null;

  if (!validationError) {
    return "";
  }

  markServiceCustomerFieldInvalid(getServiceCustomerValidationFieldId(customerData.type, validationError.field));
  return validationError.message;
}

function createAndSelectServiceCustomer() {
  const customerApi = getServiceCustomerApi();

  if (!customerApi) {
    notifyNewService("No se pudo acceder al módulo Clientes.", "error");
    return;
  }

  const customerData = getServiceCustomerCreationData();
  const validationMessage = validateServiceCustomerCreation(customerData);

  if (validationMessage) {
    notifyNewService(validationMessage, "error");
    return;
  }

  const duplicateCustomer =
    typeof customerApi.findCustomerCreationDuplicate === "function"
      ? customerApi.findCustomerCreationDuplicate(customerData)
      : findExistingServiceCustomerDuplicate(customerData);

  if (duplicateCustomer) {
    serviceCustomerCreationState.duplicateCustomer = duplicateCustomer;
    renderServiceCustomerDuplicate(duplicateCustomer);
    return;
  }

  const customer =
    typeof customerApi.addCustomerCreationRecord === "function" &&
    typeof customerApi.buildCustomerCreationRecord === "function"
      ? customerApi.addCustomerCreationRecord(customerApi.buildCustomerCreationRecord(customerData))
      : null;

  if (!customer) {
    notifyNewService("No se pudo crear el cliente.", "error");
    return;
  }

  if (!selectServiceCustomer(customer)) {
    return;
  }

  closeServiceCustomerCreation();
  notifyNewService(
    customerData.type === "Particular"
      ? "El cliente particular se creó y seleccionó correctamente."
      : "El cliente empresa se creó y seleccionó correctamente.",
    "success",
  );
}

function findExistingServiceCustomerDuplicate(customerData) {
  const customers = getServiceCustomers();

  if (customerData.type === "Particular") {
    const email = normalizeServiceCustomerEmail(customerData.email);

    return (
      customers.find((customer) => customer.type === "Particular" && normalizeServiceCustomerEmail(customer.email) === email) ||
      null
    );
  }

  if (customerData.type === "Empresa") {
    const taxId = normalizeServiceCustomerTaxId(customerData.taxId);

    return (
      customers.find((customer) => customer.type === "Empresa" && normalizeServiceCustomerTaxId(customer.taxId) === taxId) ||
      null
    );
  }

  return null;
}

function renderServiceCustomerDuplicate(customer) {
  const container = getElement("service-customer-duplicate");

  if (!container) {
    return;
  }

  if (!customer) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div>
      <strong>Ya existe un cliente con esos datos.</strong>
      <span>${escapeHtml(getServiceCustomerDisplayLabel(customer))}</span>
      <small>${escapeHtml(getServiceCustomerSecondaryInfo(customer))}</small>
    </div>
    <button class="button button--compact" type="button" data-service-customer-use-duplicate>Usar cliente existente</button>
  `;
}

function selectServiceCustomer(customer) {
  if (!customer) {
    return false;
  }

  const customerApi = getServiceCustomerApi();

  if (customerApi && typeof customerApi.isCustomerBlockedForNewService === "function" && customerApi.isCustomerBlockedForNewService(customer)) {
    notifyNewService("Este cliente está bloqueado y no puede recibir nuevos servicios.", "error");
    return false;
  }

  newServiceDraft.selectedCustomer = customer;

  const searchInput = getElement("new-service-client-search");

  if (searchInput) {
    searchInput.value = getServiceCustomerDisplayName(customer);
  }

  renderServiceSelectedCustomer();
  renderServiceCustomerSearchResults("");
  updateNewServiceSummary();
  return true;
}

function renderServiceSelectedCustomer() {
  const container = getElement("service-customer-selected");

  if (!container) {
    return;
  }

  const customer = newServiceDraft.selectedCustomer;

  if (!customer) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div>
      <strong>${escapeHtml(getServiceCustomerDisplayName(customer))}</strong>
      <span>${escapeHtml(getServiceCustomerSecondaryInfo(customer))}</span>
    </div>
    <button class="button button--compact button--muted" id="service-customer-change" type="button">Cambiar cliente</button>
  `;
}

function renderServiceCustomerSearchResults(searchTerm = getInputValue("new-service-client-search")) {
  const container = getElement("service-customer-results");
  const term = normalizeServiceCustomerSearchTerm(searchTerm);

  if (!container) {
    return;
  }

  if (!term || newServiceDraft.selectedCustomer) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const results = getMatchingServiceCustomers(term);

  if (!results.length) {
    container.hidden = false;
    container.innerHTML = '<p class="service-customer-results__empty">No se encontraron clientes.</p>';
    return;
  }

  container.hidden = false;
  container.innerHTML = results.map((customer) => renderServiceCustomerSearchResult(customer)).join("");
}

function renderServiceCustomerSearchResult(customer) {
  const status = getServiceCustomerStatusLabel(customer);
  const isBlocked = status === "Bloqueado";

  return `
    <button class="service-customer-result${isBlocked ? " service-customer-result--blocked" : ""}" type="button" data-service-customer-result="${escapeHtml(customer.code || "")}">
      <span class="service-customer-result__code">${escapeHtml(customer.code || "Sin código")}</span>
      <strong>${escapeHtml(getServiceCustomerDisplayName(customer))}</strong>
      <span>${escapeHtml(getServiceCustomerSecondaryInfo(customer))}</span>
    </button>
  `;
}

function getMatchingServiceCustomers(term) {
  return getServiceCustomers()
    .filter((customer) => getServiceCustomerSearchTokens(customer).some((token) => token && token.includes(term)))
    .slice(0, 8);
}

function getCurrentServiceCustomer() {
  if (newServiceDraft.selectedCustomer) {
    return newServiceDraft.selectedCustomer;
  }

  return findServiceCustomerBySearchTerm(getInputValue("new-service-client-search"));
}

function findServiceCustomerBySearchTerm(searchTerm) {
  const term = normalizeServiceCustomerSearchTerm(searchTerm);

  if (!term) {
    return null;
  }

  return (
    getServiceCustomers().find((customer) =>
      getServiceCustomerSearchTokens(customer).some((token) => token && token.includes(term)),
    ) || null
  );
}

function findServiceCustomerByCode(customerCode) {
  return getServiceCustomers().find((customer) => customer.code === customerCode) || null;
}

function getServiceCustomerSearchTokens(customer) {
  const tokens = [
    customer.code,
    customer.customerCode,
    customer.name,
    customer.firstName,
    customer.lastName,
    `${customer.firstName || ""} ${customer.lastName || ""}`,
    customer.company,
    customer.companyName,
    customer.businessName,
    customer.tradeName,
    customer.email,
    customer.phone,
    customer.taxId,
  ].map(normalizeServiceCustomerSearchTerm);

  return [
    ...tokens,
    ...tokens.map((token) => token.replace(/\s+/g, "")),
  ];
}

function getServiceCustomerDisplayLabel(customer) {
  const name = getServiceCustomerDisplayName(customer);

  return customer.code ? `${name} (${customer.code})` : name;
}

function getServiceCustomerDisplayName(customer) {
  const customerApi = getServiceCustomerApi();

  if (customerApi && typeof customerApi.getCustomerCreationDisplayName === "function") {
    return customerApi.getCustomerCreationDisplayName(customer);
  }

  if (customer.type === "Empresa") {
    return customer.tradeName || customer.company || customer.companyName || customer.businessName || customer.name || "Cliente empresa";
  }

  return customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Cliente particular";
}

function getServiceCustomerSecondaryInfo(customer) {
  const status = getServiceCustomerStatusLabel(customer);

  if (customer.type === "Empresa") {
    return joinFilledValues([
      "Empresa",
      status,
      customer.taxId ? `NIF/CIF: ${customer.taxId}` : "",
      customer.email,
      customer.phone,
    ]);
  }

  return joinFilledValues(["Particular", status, customer.email, customer.phone]);
}

function getServiceCustomerStatusLabel(customer) {
  const customerApi = getServiceCustomerApi();

  return customerApi && typeof customerApi.normalizeCustomerStatus === "function"
    ? customerApi.normalizeCustomerStatus(customer.status)
    : customer.status || "";
}

function clearServiceCustomerCreationFields() {
  const creationBlock = getElement("new-client-fields");

  if (!creationBlock) {
    return;
  }

  clearFields(creationBlock);

  const countryCode = getElement("service-customer-country-code");
  const companyCountryCode = getElement("service-customer-company-country-code");

  if (countryCode) {
    countryCode.value = "+34";
  }

  if (companyCountryCode) {
    companyCountryCode.value = "+34";
  }
}

function clearServiceCustomerValidation() {
  const creationBlock = getElement("new-client-fields");

  if (!creationBlock) {
    return;
  }

  creationBlock.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });
}

function markServiceCustomerFieldInvalid(fieldId) {
  const field = getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }
}

function getServiceCustomerValidationFieldId(customerType, fieldName) {
  const fieldIdsByType = {
    Particular: {
      firstName: "service-customer-first-name",
      lastName: "service-customer-last-name",
      countryCode: "service-customer-country-code",
      phone: "service-customer-phone",
      email: "service-customer-email",
    },
    Empresa: {
      companyName: "service-customer-company-name",
      taxId: "service-customer-tax-id",
      countryCode: "service-customer-company-country-code",
      phone: "service-customer-company-phone",
      email: "service-customer-company-email",
    },
  };

  return fieldIdsByType[customerType]?.[fieldName] || "";
}

function getServiceCustomerApi() {
  return window.ElaraCustomers || null;
}

function getServiceCustomers() {
  const customerApi = getServiceCustomerApi();

  if (customerApi && typeof customerApi.getCustomerCreationCustomers === "function") {
    return customerApi.getCustomerCreationCustomers();
  }

  return window.ElaraCustomersMock?.customers || [];
}

function normalizeServiceCustomerEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeServiceCustomerTaxId(taxId) {
  return String(taxId || "").trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeServiceCustomerSearchTerm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNewServiceCompanyClient() {
  return false;
}

function clearFields(container) {
  container.querySelectorAll("input, textarea").forEach((field) => {
    if (field.type === "checkbox" || field.type === "radio") {
      field.checked = false;
    } else {
      field.value = "";
    }
  });

  container.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = 0;
  });
}

function getFilledNewServiceStops() {
  return newServiceDraft.stops.map((stop) => stop.trim()).filter(Boolean);
}

function formatDateForMock(dateValue) {
  const [year, month, day] = dateValue.split("-");

  return day && month && year ? `${day}/${month}/${year}` : dateValue;
}

function notifyNewService(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function emitServiceUpdatedEvent(reason, service, extraDetail = {}) {
  window.dispatchEvent(
    new CustomEvent("elara:services-updated", {
      detail: {
        reason,
        serviceId: getServiceIdentifier(service),
        customerCode: service?.customerCode || "",
        ...extraDetail,
      },
    }),
  );
}

function registerServiceAssignmentActivity(service, collaborator, isReassignment) {
  registerServiceActivity({
    eventType: "SERVICE_ASSIGNED",
    actorType: "Administraci\u00f3n",
    actorName: "Administraci\u00f3n",
    entityId: getServiceIdentifier(service),
    title: isReassignment ? "Servicio reasignado" : "Servicio asignado",
    description: `${getServiceIdentifier(service)} fue ${isReassignment ? "reasignado" : "asignado"} a ${collaborator.name}.`,
    metadata: {
      collaboratorId: collaborator.id,
      assignmentStatus: service.assignmentStatus,
    },
  });
}

function registerServiceCancellationActivity(service) {
  registerServiceActivity({
    eventType: "SERVICE_CANCELLED",
    actorType: "Administraci\u00f3n",
    actorName: "Administraci\u00f3n",
    entityId: getServiceIdentifier(service),
    title: "Servicio cancelado",
    description: `${getServiceIdentifier(service)} fue cancelado por administraci\u00f3n.`,
    metadata: {
      closureReasonCode: service.closureReasonCode || "",
    },
  });
}

function registerServiceExpiredNotCompletedActivity(service) {
  registerServiceActivity({
    eventType: "SERVICE_EXPIRED_NOT_COMPLETED",
    actorType: "Sistema",
    actorName: "Sistema",
    entityId: getServiceIdentifier(service),
    title: "Servicio no realizado",
    description: `${getServiceIdentifier(service)} pas\u00f3 a No realizado porque venci\u00f3 sin iniciarse.`,
    metadata: {
      closedReasonCode: service.closedReasonCode,
    },
  });
}

function registerServiceActivity(eventData) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function") {
    return;
  }

  window.ElaraActivityLog.addEvent({
    entityType: "Servicio",
    ...eventData,
  });
}

function formatFullDayHours(hours) {
  if (!hours) {
    return "";
  }

  return `${hours} ${hours === "1" ? "hora contratada" : "horas contratadas"}`;
}

function joinFilledValues(values) {
  return values.filter(Boolean).join(" / ");
}

function getInputValue(id) {
  const input = getElement(id);

  return input ? input.value.trim() : "";
}

function initServicesFilterControls() {
  const clearButton = document.querySelector("[data-services-clear]");
  const filterMenu = clearButton?.closest(".customer-filter__menu");

  if (!clearButton || !filterMenu || filterMenu.dataset.servicesFiltersReady) {
    return;
  }

  filterMenu.dataset.servicesFiltersReady = "true";
  filterMenu.addEventListener("change", () => {
    syncServicesFilterChipsFromControls();
    renderServicesList();
  });

  clearButton.addEventListener("click", clearServicesFilters);
}

function initServicesSearchControls() {
  const searchInput = getElement("services-search");

  if (!searchInput || searchInput.dataset.servicesSearchReady) {
    return;
  }

  searchInput.dataset.servicesSearchReady = "true";
  searchInput.addEventListener("input", () => {
    syncServicesFilterSearchFromControls();
    renderServicesList();
  });
  searchInput.addEventListener("search", () => {
    syncServicesFilterSearchFromControls();
    renderServicesList();
  });
}

function initServicesHistoryControls() {
  const historyAction = getElement("services-history-action");
  const historySearch = getElement("services-history-search");
  const historyList = getElement("services-history-list");

  if (historyAction && !historyAction.dataset.servicesHistoryReady) {
    historyAction.dataset.servicesHistoryReady = "true";
    historyAction.addEventListener("click", () => {
      if (servicesViewState.mode === "history") {
        showActiveServicesView();
      } else {
        showServicesHistoryView();
      }
    });
  }

  if (historySearch && !historySearch.dataset.servicesHistoryReady) {
    historySearch.dataset.servicesHistoryReady = "true";
    historySearch.addEventListener("input", () => {
      servicesViewState.historySearchTerm = normalizeServiceListSearchText(historySearch.value);
      renderServicesHistoryList();
    });
    historySearch.addEventListener("search", () => {
      servicesViewState.historySearchTerm = normalizeServiceListSearchText(historySearch.value);
      renderServicesHistoryList();
    });
  }

  if (historyList && !historyList.dataset.servicesHistoryReady) {
    historyList.dataset.servicesHistoryReady = "true";
    historyList.addEventListener("click", (event) => {
      const detailButton = event.target.closest(".service-history-detail-button[data-service-id]");

      if (detailButton) {
        openServiceDetailModal(detailButton.dataset.serviceId);
      }
    });
  }
}

// =========================
// Utilidades internas
// =========================

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

window.ElaraServices = {
  calculateServiceFinancialSummary,
  canServiceStartWithFinancialData,
  getNextServicePaymentId,
  getServiceDisplayStatus,
  initServices,
  openServiceAssignment: openServiceAssignmentModal,
  openServiceDetail: openServiceDetailModal,
  reconcileExpiredServices,
  reconcileServicePaymentStatus,
  showServices,
};
