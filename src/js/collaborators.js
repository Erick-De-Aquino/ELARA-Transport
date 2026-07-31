/*
  Proyecto Atlas / ELARA Transport
  Archivo: collaborators.js
  Responsabilidad: renderizado y logica de la pantalla Colaboradores.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const collaboratorsData = window.ElaraCollaboratorsMock;

const administrativeStatuses = ["Activo", "Pendiente documentacion", "Suspendido", "Inactivo"];
const operationalStatuses = ["Disponible", "No disponible", "En servicio"];
const driverTypes = ["Chofer", "Colaborador"];
const NEW_COLLABORATOR_MODAL_ID = "new-collaborator-modal";
const COLLABORATOR_DETAIL_MODAL_ID = "collaborator-detail-modal";
const NEW_COLLABORATOR_DEFAULT_OPERATIONAL_STATUS = "No disponible";
const VEHICLE_ASSIGNMENT_MODAL_ID = "vehicle-assignment-modal";
const VEHICLE_ASSIGNMENT_CONFIRM_MODAL_ID = "vehicle-assignment-confirm-modal";
const COLLABORATOR_CENTRAL_SERVICE_IN_PROGRESS_MESSAGE =
  "Este conductor tiene un servicio en curso. Debes finalizar o resolver la operaci\u00f3n antes de cambiar su estado administrativo.";
const collaboratorBaseCities = [
  "Valencia",
  "Madrid",
  "Barcelona",
  "Sevilla",
  "Zaragoza",
  "M\u00e1laga",
  "Murcia",
  "Palma de Mallorca",
  "Las Palmas de Gran Canaria",
  "Bilbao",
  "Alicante",
  "C\u00f3rdoba",
  "Valladolid",
  "Vigo",
  "Gij\u00f3n",
  "Hospitalet de Llobregat",
  "A Coru\u00f1a",
  "Granada",
  "Vitoria-Gasteiz",
  "Elche",
];

const administrativeStatusLabels = {
  Activo: "Activo",
  "Pendiente documentacion": "Pendiente documentaci\u00f3n",
  Suspendido: "Suspendido",
  Inactivo: "Inactivo",
};

const administrativeStatusCompactLabels = {
  Activo: "Activo",
  "Pendiente documentacion": "Pendiente doc.",
  Suspendido: "Suspendido",
  Inactivo: "Inactivo",
};

const operationalStatusLabels = {
  Disponible: "Disponible",
  "No disponible": "No disponible",
  "En servicio": "En servicio",
};

const administrativeBarClassByName = {
  "Pendiente documentacion": "collaborator-card__bar--warning",
  Activo: "collaborator-card__bar--success",
  Inactivo: "collaborator-card__bar--dark",
  Suspendido: "collaborator-card__bar--danger",
};

const operationalBarClassByName = {
  Disponible: "collaborator-card__bar--success",
  "No disponible": "collaborator-card__bar--dark",
  "En servicio": "collaborator-card__bar--info",
};

const collaboratorOperationalStatusCardClassByName = {
  Disponible: "status-card--success",
  "No disponible": "status-card--neutral",
  "En servicio": "status-card--info",
};

const collaboratorPortalAccessLabels = {
  active: "Con acceso",
  inactive: "Usuario inactivo",
  none: "Sin acceso al Portal",
};

let collaboratorsSearchTerm = "";
let isCollaboratorsInitialized = false;
let collaboratorDetailCollaboratorId = "";
let vehicleAssignmentCollaboratorId = "";
let vehicleAssignmentSearchTerm = "";
let vehicleAssignmentPendingAction = null;
let isCollaboratorServicesUpdatedListenerRegistered = false;

// =========================
// Inicializacion y estado de vista
// =========================

function initCollaborators() {
  normalizeCollaboratorsData();
  reconcileCollaboratorOperationalStatuses();
  normalizeVehicleAssignments();
  initCollaboratorServicesUpdatedListener();
  renderCollaboratorsSummary();
  renderCollaboratorsList();
  initCollaboratorsControls();
}

function initCollaboratorServicesUpdatedListener() {
  if (isCollaboratorServicesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:services-updated", refreshOpenCollaboratorNextServiceFromServicesUpdate);
  window.addEventListener("elara:collaborators-updated", refreshOpenCollaboratorNextServiceFromServicesUpdate);
  isCollaboratorServicesUpdatedListenerRegistered = true;
}

function refreshOpenCollaboratorNextServiceFromServicesUpdate() {
  const modal = getElement(COLLABORATOR_DETAIL_MODAL_ID);
  const collaborator = getCollaboratorById(collaboratorDetailCollaboratorId);

  reconcileCollaboratorOperationalStatuses();
  renderCollaboratorsSummary();
  renderCollaboratorsList();

  if (!modal || modal.hidden || !collaborator) {
    return;
  }

  renderCollaboratorNextServiceFields(collaborator, isCollaboratorDetailEditing() ? "collaborator-edit" : "detail");
  renderCollaboratorDetailView(collaborator);
}

function showCollaborators() {
  reconcileCollaboratorOperationalStatuses();
  setText("page-eyebrow", "M\u00f3dulo Conductores");
  setText("page-title", "Conductores");
  setText("page-summary", "Gestiona estado administrativo, estado operativo y veh\u00edculos asignados del equipo conductor.");
  setText("primary-action", "Nuevo conductor");
  setModalTarget("primary-action", NEW_COLLABORATOR_MODAL_ID);
  renderCollaboratorsSummary();
  renderCollaboratorsList();
}

// =========================
// Render principal
// =========================

function renderCollaboratorsSummary() {
  const container = getElement("collaborators-summary");

  if (!container) {
    return;
  }

  reconcileCollaboratorOperationalStatuses();
  const collaborators = collaboratorsData.collaborators;
  const summary = [
    { label: "Total", value: collaborators.length, tone: "neutral" },
    { label: "Disponibles", value: countCollaboratorsByOperationalStatus("Disponible"), tone: "success" },
    { label: "En servicio", value: countCollaboratorsByOperationalStatus("En servicio"), tone: "success" },
    { label: "Pendientes doc.", value: countCollaboratorsByAdministrativeStatus("Pendiente documentacion"), tone: "warning" },
    { label: "Suspendidos", value: countCollaboratorsByAdministrativeStatus("Suspendido"), tone: "danger" },
    { label: "Veh\u00edculos asignados", value: collaborators.filter((collaborator) => getCollaboratorVehicleId(collaborator)).length, tone: "neutral" },
  ];

  container.innerHTML = summary
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

function renderCollaboratorsList() {
  const container = getElement("collaborators-list");

  if (!container) {
    return;
  }

  reconcileCollaboratorOperationalStatuses();
  const collaborators = getFilteredCollaborators();

  if (!collaborators.length) {
    container.innerHTML = '<p class="collaborators-empty">No hay conductores que coincidan con la b\u00fasqueda o filtros actuales.</p>';
    return;
  }

  container.innerHTML = collaborators.map(renderCollaboratorCard).join("");
}

function renderCollaboratorCard(collaborator) {
  const cardClass = getCollaboratorCardClass(collaborator);
  const operationalStatus = getCollaboratorOperationalStatus(collaborator);
  const operationalBarClass = getCollaboratorOperationalBarClass(operationalStatus);
  const portalAccess = getCollaboratorPortalAccessStatus(collaborator.id);
  const adminBarClass =
    administrativeBarClassByName[collaborator.administrativeStatus] || "collaborator-card__bar--dark";

  return `
    <article class="collaborator-card ${cardClass}">
      <div class="collaborator-card__bars" aria-label="Estado administrativo: ${escapeHtml(
        getAdministrativeStatusLabel(collaborator.administrativeStatus),
      )}. Estado operativo: ${escapeHtml(getOperationalStatusLabel(operationalStatus))}.">
        <span class="collaborator-card__bar collaborator-card__bar--administrative ${adminBarClass}" aria-hidden="true"></span>
        <span class="collaborator-card__bar collaborator-card__bar--operational ${operationalBarClass}" data-operational-status="${escapeHtml(operationalStatus)}" data-operational-class="${escapeHtml(operationalBarClass)}" aria-hidden="true"></span>
      </div>

      <div class="collaborator-card__identity">
        <div class="collaborator-card__name-row">
          <button class="collaborator-card__name" type="button" data-collaborator-detail="${escapeHtml(
            collaborator.id,
          )}">${escapeHtml(collaborator.name)}</button>
        </div>
        <span class="collaborator-card__vehicle">${getVehicleSummary(getCollaboratorVehicle(collaborator))}</span>
      </div>

      <div class="collaborator-card__type">
        <span class="collaborator-card__driver-type">${escapeHtml(getCollaboratorDriverType(collaborator))}</span>
      </div>

      <div class="collaborator-card__access">
        <span class="collaborator-portal-access collaborator-portal-access--${escapeHtml(portalAccess.status)}">${escapeHtml(
          portalAccess.label,
        )}</span>
      </div>

      <div class="collaborator-card__service">
        ${getNextServiceSummary(collaborator)}
      </div>

      <div class="collaborator-card__actions">
        <button class="button button--compact button--muted" type="button" data-collaborator-detail="${escapeHtml(
          collaborator.id,
        )}">Detalle</button>
        <button class="button button--compact" type="button" data-collaborator-assign="${escapeHtml(
          collaborator.id,
        )}">Asignar veh\u00edculo</button>
        <label class="collaborator-status-control">
          <select data-collaborator-status="${escapeHtml(collaborator.id)}" aria-label="Cambiar estado administrativo de ${escapeHtml(
            collaborator.name,
          )}">
            ${renderAdministrativeStatusOptions(collaborator.administrativeStatus)}
          </select>
        </label>
      </div>
    </article>
  `;
}

function renderAdministrativeStatusOptions(currentStatus) {
  return administrativeStatuses
    .map((status) => {
      const selected = status === currentStatus ? " selected" : "";

      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(
        getAdministrativeStatusCompactLabel(status),
      )}</option>`;
    })
    .join("");
}

// =========================
// Eventos
// =========================

function initCollaboratorsControls() {
  if (isCollaboratorsInitialized) {
    return;
  }

  initCollaboratorsSearch();
  initCollaboratorsFilterControls();
  initCollaboratorsModalControls();
  initVehicleAssignmentControls();
  initVehicleAssignmentConfirmationControls();
  initNewCollaboratorForm();
  initCollaboratorsStatusControls();
  isCollaboratorsInitialized = true;
}

function initCollaboratorsSearch() {
  const searchInput = getElement("collaborators-search");

  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", () => {
    collaboratorsSearchTerm = normalizeForSearch(searchInput.value.trim());
    renderCollaboratorsList();
  });
}

function initCollaboratorsFilterControls() {
  const filtersContainer = getElement("collaborators-filters");

  if (!filtersContainer) {
    return;
  }

  filtersContainer.addEventListener("change", (event) => {
    if (event.target.matches("[data-collaborator-filter]")) {
      updateCollaboratorsFilterState();
      renderCollaboratorsList();
    }
  });

  filtersContainer.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-collaborators-clear]");

    if (clearButton) {
      clearCollaboratorsFilters();
    }
  });
}

function initCollaboratorsModalControls() {
  const detailModal = getElement(COLLABORATOR_DETAIL_MODAL_ID);
  const editForm = getElement("collaborator-detail-edit-form");
  const editStatusSelect = getElement("collaborator-edit-administrative-status");

  renderCollaboratorBaseCityOptions("collaborator-edit-base-city");

  if (editForm) {
    editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCollaboratorDetailEdit();
    });
  }

  if (editStatusSelect) {
    editStatusSelect.addEventListener("change", syncCollaboratorEditLicenseRequirement);
  }

  document.addEventListener("click", (event) => {
    const serviceButton = event.target.closest("[data-service-summary]");

    if (serviceButton) {
      openServiceSummaryModal(serviceButton.dataset.serviceSummary);
      return;
    }

    const assignButton = event.target.closest("[data-collaborator-assign]");

    if (assignButton) {
      openVehicleAssignmentModal(assignButton.dataset.collaboratorAssign);
      return;
    }

    const collaboratorButton = event.target.closest("[data-collaborator-detail]");

    if (collaboratorButton) {
      openCollaboratorDetailModal(collaboratorButton.dataset.collaboratorDetail);
      return;
    }

    const detailEditButton = event.target.closest("#collaborator-detail-edit-button");

    if (detailEditButton) {
      enterCollaboratorEditMode();
      return;
    }

    const detailCancelButton = event.target.closest("#collaborator-detail-cancel-edit");

    if (detailCancelButton) {
      exitCollaboratorEditMode();
      return;
    }

    const closeButton = event.target.closest("[data-modal-close]");

    if ((closeButton && closeButton.closest(`#${COLLABORATOR_DETAIL_MODAL_ID}`)) || event.target === detailModal) {
      closeCollaboratorDetailModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailModal && !detailModal.hidden) {
      closeCollaboratorDetailModal();
    }
  });
}

function initCollaboratorsStatusControls() {
  document.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-collaborator-status]");

    if (statusSelect) {
      updateCollaboratorAdministrativeStatus(statusSelect.dataset.collaboratorStatus, statusSelect.value);
    }
  });
}

function initVehicleAssignmentControls() {
  const modal = getElement(VEHICLE_ASSIGNMENT_MODAL_ID);
  const searchInput = getElement("vehicle-assignment-search");

  if (!modal) {
    return;
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      vehicleAssignmentSearchTerm = normalizeForSearch(searchInput.value.trim());
      renderVehicleAssignmentModal();
    });
  }

  modal.addEventListener("click", (event) => {
    const vehicleButton = event.target.closest("[data-assign-vehicle-id]");
    const removeButton = event.target.closest("[data-remove-collaborator-vehicle]");

    if (vehicleButton) {
      confirmVehicleAssignment(vehicleButton.dataset.assignVehicleId);
      return;
    }

    if (removeButton) {
      confirmRemoveCollaboratorVehicle();
    }
  });
}

function initVehicleAssignmentConfirmationControls() {
  const modal = getElement(VEHICLE_ASSIGNMENT_CONFIRM_MODAL_ID);
  const confirmButton = getElement("vehicle-assignment-confirm-action");
  const cancelButton = getElement("vehicle-assignment-confirm-cancel");

  if (!modal) {
    return;
  }

  if (confirmButton) {
    confirmButton.addEventListener("click", () => {
      const action = vehicleAssignmentPendingAction;

      closeVehicleAssignmentConfirmationModal();

      if (typeof action === "function") {
        action();
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", closeVehicleAssignmentConfirmationModal);
  }

  document.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-modal-close]");

    if ((closeButton && closeButton.closest(`#${VEHICLE_ASSIGNMENT_CONFIRM_MODAL_ID}`)) || event.target === modal) {
      closeVehicleAssignmentConfirmationModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVehicleAssignmentConfirmationModal();
    }
  });
}

// =========================
// Acciones mock
// =========================

function updateCollaboratorAdministrativeStatus(collaboratorId, nextStatus) {
  const collaborator = getCollaboratorById(collaboratorId);

  if (!collaborator || !administrativeStatuses.includes(nextStatus)) {
    return;
  }

  reconcileCollaboratorExpiredServices();
  const originalAdministrativeStatus = collaborator.administrativeStatus;

  if (isCollaboratorInServiceAdministrativeChangeBlocked(collaborator, nextStatus)) {
    renderCollaboratorsList();
    notifyCollaboratorsAction(COLLABORATOR_CENTRAL_SERVICE_IN_PROGRESS_MESSAGE, "error");
    return;
  }

  collaborator.administrativeStatus = nextStatus;
  applyCollaboratorAdministrativeOperationalCoherence(collaborator, originalAdministrativeStatus);
  applyCollaboratorAdministrativeServiceReassignment(collaborator, originalAdministrativeStatus);
  renderCollaboratorsSummary();
  renderCollaboratorsList();
  notifyCollaboratorsAction("Estado administrativo actualizado.", "success");
}

function enterCollaboratorEditMode() {
  const collaborator = getCollaboratorById(collaboratorDetailCollaboratorId);

  if (!collaborator) {
    return;
  }

  populateCollaboratorEditForm(collaborator);
  setCollaboratorDetailMode(true);
}

function exitCollaboratorEditMode() {
  const collaborator = getCollaboratorById(collaboratorDetailCollaboratorId);

  clearCollaboratorEditValidation();

  if (collaborator) {
    populateCollaboratorEditForm(collaborator);
    renderCollaboratorDetailView(collaborator);
  }

  setCollaboratorDetailMode(false);
}

function saveCollaboratorDetailEdit() {
  const collaborator = getCollaboratorById(collaboratorDetailCollaboratorId);

  if (!collaborator) {
    notifyCollaboratorsAction("No se encontr\u00f3 el conductor seleccionado.", "error");
    return;
  }

  const collaboratorData = getCollaboratorEditFormData();
  const validationMessage = validateCollaboratorEditForm(collaboratorData);

  if (validationMessage) {
    notifyCollaboratorsAction(validationMessage, "error");
    return;
  }

  reconcileCollaboratorExpiredServices();

  if (isCollaboratorInServiceAdministrativeChangeBlocked(collaborator, collaboratorData.administrativeStatus)) {
    markCollaboratorEditFieldInvalid("collaborator-edit-administrative-status");
    notifyCollaboratorsAction(COLLABORATOR_CENTRAL_SERVICE_IN_PROGRESS_MESSAGE, "error");
    return;
  }

  const originalAdministrativeStatus = collaborator.administrativeStatus;
  updateCollaboratorFromEditForm(collaborator, collaboratorData);
  applyCollaboratorAdministrativeServiceReassignment(collaborator, originalAdministrativeStatus);
  renderCollaboratorsSummary();
  renderCollaboratorsList();
  renderCollaboratorDetailView(collaborator);
  setCollaboratorDetailMode(false);
  notifyCollaboratorsAction("Los cambios del conductor se guardaron correctamente.", "success");
}

function getCollaboratorEditFormData() {
  return {
    firstName: getInputValue("collaborator-edit-first-name"),
    lastName: getInputValue("collaborator-edit-last-name"),
    email: getInputValue("collaborator-edit-email"),
    countryCode: getInputValue("collaborator-edit-country-code") || "+34",
    phone: getInputValue("collaborator-edit-phone"),
    baseCity: getInputValue("collaborator-edit-base-city"),
    driverType: getInputValue("collaborator-edit-driver-type"),
    licenseExpiration: getInputValue("collaborator-edit-license-expiration"),
    administrativeStatus: getInputValue("collaborator-edit-administrative-status"),
    observations: getInputValue("collaborator-edit-observations"),
  };
}

function validateCollaboratorEditForm(collaboratorData) {
  clearCollaboratorEditValidation();

  const validationRules = [
    {
      invalid: !collaboratorData.firstName,
      fieldId: "collaborator-edit-first-name",
      message: "Introduce el nombre del conductor.",
    },
    {
      invalid: !collaboratorData.lastName,
      fieldId: "collaborator-edit-last-name",
      message: "Introduce el apellido del conductor.",
    },
    {
      invalid: !collaboratorData.email,
      fieldId: "collaborator-edit-email",
      message: "Introduce el email del conductor.",
    },
    {
      invalid: Boolean(collaboratorData.email) && !isCollaboratorEditEmailValid(collaboratorData.email),
      fieldId: "collaborator-edit-email",
      message: "Introduce un email v\u00e1lido.",
    },
    {
      invalid: !collaboratorData.phone,
      fieldId: "collaborator-edit-phone",
      message: "Introduce el tel\u00e9fono del conductor.",
    },
    {
      invalid: !collaboratorBaseCities.includes(collaboratorData.baseCity),
      fieldId: "collaborator-edit-base-city",
      message: "Selecciona una ciudad/base v\u00e1lida.",
    },
    {
      invalid: !driverTypes.includes(collaboratorData.driverType),
      fieldId: "collaborator-edit-driver-type",
      message: "Selecciona un tipo de conductor v\u00e1lido.",
    },
    {
      invalid: !administrativeStatuses.includes(collaboratorData.administrativeStatus),
      fieldId: "collaborator-edit-administrative-status",
      message: "Selecciona un estado administrativo v\u00e1lido.",
    },
    {
      invalid: collaboratorData.administrativeStatus === "Activo" && !collaboratorData.licenseExpiration,
      fieldId: "collaborator-edit-license-expiration",
      message: "Introduce el vencimiento del carnet de conducir.",
    },
    {
      invalid: Boolean(collaboratorData.licenseExpiration) && !isCollaboratorEditDateValid(collaboratorData.licenseExpiration),
      fieldId: "collaborator-edit-license-expiration",
      message: "Introduce una fecha de vencimiento v\u00e1lida.",
    },
    {
      invalid: isDateBeforeToday(collaboratorData.licenseExpiration),
      fieldId: "collaborator-edit-license-expiration",
      message: "El vencimiento del carnet no puede ser anterior a la fecha actual.",
    },
  ];
  const failedRule = validationRules.find((rule) => rule.invalid);

  if (!failedRule) {
    return "";
  }

  markCollaboratorEditFieldInvalid(failedRule.fieldId);
  return failedRule.message;
}

function updateCollaboratorFromEditForm(collaborator, collaboratorData) {
  const originalAdministrativeStatus = collaborator.administrativeStatus;

  collaborator.name = `${collaboratorData.firstName} ${collaboratorData.lastName}`.trim();
  collaborator.phone = `${collaboratorData.countryCode} ${collaboratorData.phone}`.trim();
  collaborator.email = collaboratorData.email;
  collaborator.baseCity = collaboratorData.baseCity;
  collaborator.driverType = collaboratorData.driverType;
  collaborator.licenseExpiration = collaboratorData.licenseExpiration || "No indicada";
  collaborator.administrativeStatus = collaboratorData.administrativeStatus;
  collaborator.observations = collaboratorData.observations || "Sin observaciones.";
  applyCollaboratorAdministrativeOperationalCoherence(collaborator, originalAdministrativeStatus);
}

function isCollaboratorInServiceAdministrativeChangeBlocked(collaborator, nextAdministrativeStatus) {
  return (
    collaborator.administrativeStatus === "Activo" &&
    nextAdministrativeStatus !== "Activo" &&
    hasCollaboratorServiceInProgress(collaborator.id)
  );
}

function applyCollaboratorAdministrativeOperationalCoherence(collaborator, originalAdministrativeStatus) {
  if (collaborator.administrativeStatus !== "Activo" || originalAdministrativeStatus !== "Activo") {
    collaborator.operationalStatus = "No disponible";
    collaborator.availability = "No disponible";
  }
}

function applyCollaboratorAdministrativeServiceReassignment(collaborator, originalAdministrativeStatus) {
  if (originalAdministrativeStatus !== "Activo" || !isCollaboratorAdministrativeReassignmentStatus(collaborator.administrativeStatus)) {
    return;
  }

  const affectedServices = getCollaboratorServicesRequiringAdministrativeReassignment(collaborator);

  if (!affectedServices.length) {
    return;
  }

  const unassignedAt = new Date().toISOString();
  const unassignedReason = collaborator.administrativeStatus === "Suspendido" ? "Conductor suspendido" : "Conductor inactivo";

  affectedServices.forEach((service) => {
    markServiceForCollaboratorAdministrativeReassignment(service, collaborator, unassignedReason, unassignedAt);
    registerCollaboratorServiceReassignmentRequiredActivity(service, collaborator, unassignedReason);
  });

  emitCollaboratorServicesUpdatedEvent("driver-admin-status-reassignment-required", collaborator, affectedServices);
}

function reconcileCollaboratorExpiredServices() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }
}

function getCollaboratorServicesRequiringAdministrativeReassignment(collaborator) {
  const services = getCollaboratorServicesSource() || [];
  const referenceDate = getCollaboratorOperationalReferenceDate();

  return services.filter(
    (service) =>
      isCollaboratorRelatedService(service, collaborator) &&
      ["pendiente", "confirmado"].includes(getCollaboratorServiceStatus(service)) &&
      !isCollaboratorClosedService(service) &&
      isCollaboratorServiceTodayOrAfter(service, referenceDate),
  );
}

function isCollaboratorServiceTodayOrAfter(service, referenceDate) {
  const dateParts = getCollaboratorServiceDateParts(getCollaboratorServiceDate(service));

  if (!dateParts) {
    return false;
  }

  const serviceDay = new Date(dateParts.year, dateParts.month - 1, dateParts.day).getTime();
  const referenceDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime();

  return serviceDay >= referenceDay;
}

function markServiceForCollaboratorAdministrativeReassignment(service, collaborator, unassignedReason, unassignedAt) {
  const previousServiceStatus = service.status || "";
  const previousAssignmentStatus = service.assignmentStatus || "";
  const previousCollaboratorId = service.collaboratorId || service.assignedCollaboratorId || service.driverId || collaborator.id || "";
  const previousVehicleId = service.vehicleId || service.assignedVehicleId || service.vehicleCode || "";

  service.status = "Pendiente";
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
  service.action = "Reasignar conductor";
  service.requiresReassignment = true;
  service.unassignedReasonCode = "DRIVER_ADMIN_STATUS";
  service.unassignedReason = unassignedReason;
  service.unassignedAt = unassignedAt;
  service.previousCollaboratorId = previousCollaboratorId;
  service.previousVehicleId = previousVehicleId;
  service.previousAssignmentStatus = previousAssignmentStatus;
  service.previousServiceStatus = previousServiceStatus;
}

function isCollaboratorAdministrativeReassignmentStatus(status) {
  return ["Suspendido", "Inactivo"].includes(status);
}

function hasCollaboratorServiceInProgress(collaboratorId) {
  const services = getCollaboratorServicesSource() || [];
  const normalizedCollaboratorId = String(collaboratorId || "").trim();

  if (!normalizedCollaboratorId) {
    return false;
  }

  return services.some(
    (service) =>
      getCollaboratorServiceAssignedCollaboratorId(service) === normalizedCollaboratorId &&
      getCollaboratorServiceStatus(service) === "en curso",
  );
}

function hasCollaboratorCentralServiceInProgress(collaborator) {
  return hasCollaboratorServiceInProgress(collaborator?.id);
}

function reconcileCollaboratorOperationalStatuses() {
  collaboratorsData.collaborators.forEach((collaborator) => {
    collaborator.availabilityPreference = getCollaboratorAvailabilityPreference(collaborator);
    const hasServiceInProgress = hasCollaboratorServiceInProgress(collaborator.id);

    if (hasServiceInProgress) {
      collaborator.operationalStatus = "En servicio";
      collaborator.availability = "En servicio";
      return;
    }

    const portalAccessStatus = getCollaboratorPortalAccessStatus(collaborator.id);

    if (portalAccessStatus.status !== "active") {
      collaborator.operationalStatus = "No disponible";
      collaborator.availability = "No disponible";
      return;
    }

    const nextOperationalStatus =
      collaborator.administrativeStatus === "Activo" ? collaborator.availabilityPreference : "No disponible";
    collaborator.operationalStatus = nextOperationalStatus;
    collaborator.availability = nextOperationalStatus;
  });
}

function getCollaboratorAvailabilityPreference(collaborator) {
  const explicitPreference = normalizeCollaboratorAvailabilityPreference(collaborator?.availabilityPreference);

  if (explicitPreference) {
    return explicitPreference;
  }

  const compatibleStatus = normalizeCollaboratorOperationalStatus(collaborator?.operationalStatus || collaborator?.availability);

  return compatibleStatus === "No disponible" ? "No disponible" : "Disponible";
}

function normalizeCollaboratorAvailabilityPreference(value) {
  const normalizedValue = normalizeCollaboratorOperationalStatus(value);

  return ["Disponible", "No disponible"].includes(normalizedValue) ? normalizedValue : "";
}

function getCollaboratorServiceAssignedCollaboratorId(service) {
  return String(service?.collaboratorId || service?.driverId || "").trim();
}

function emitCollaboratorServicesUpdatedEvent(reason, collaborator, affectedServices) {
  window.dispatchEvent(
    new CustomEvent("elara:services-updated", {
      detail: {
        reason,
        conductorId: collaborator.id,
        collaboratorId: collaborator.id,
        serviceIds: affectedServices.map(getCollaboratorServiceNumber),
      },
    }),
  );
}

function registerCollaboratorServiceReassignmentRequiredActivity(service, collaborator, unassignedReason) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function") {
    return;
  }

  const serviceId = getCollaboratorServiceNumber(service);

  window.ElaraActivityLog.addEvent({
    eventType: "SERVICE_REASSIGNMENT_REQUIRED",
    actorType: "Administraci\u00f3n",
    actorName: "Administraci\u00f3n",
    entityType: "Servicio",
    entityId: serviceId,
    title: "Reasignaci\u00f3n requerida",
    description: `${serviceId} requiere reasignaci\u00f3n porque ${collaborator.name} fue ${
      unassignedReason === "Conductor suspendido" ? "suspendido" : "inactivado"
    }.`,
    metadata: {
      collaboratorId: collaborator.id,
      administrativeStatus: collaborator.administrativeStatus,
      unassignedReason,
    },
  });
}

function isCollaboratorEditEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isCollaboratorEditDateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function openVehicleAssignmentModal(collaboratorId) {
  const collaborator = getCollaboratorById(collaboratorId);
  const modal = getElement(VEHICLE_ASSIGNMENT_MODAL_ID);
  const searchInput = getElement("vehicle-assignment-search");

  if (!collaborator) {
    notifyCollaboratorsAction("No se encontr\u00f3 el colaborador seleccionado.", "error");
    return;
  }

  if (!modal) {
    notifyCollaboratorsAction("No se pudo completar la asignaci\u00f3n del veh\u00edculo.", "error");
    return;
  }

  vehicleAssignmentCollaboratorId = collaboratorId;
  vehicleAssignmentSearchTerm = "";

  if (searchInput) {
    searchInput.value = "";
  }

  renderVehicleAssignmentModal();
  modal.hidden = false;
}

function renderVehicleAssignmentModal() {
  const collaborator = getCollaboratorById(vehicleAssignmentCollaboratorId);
  const list = getElement("vehicle-assignment-list");
  const removeButton = getElement("vehicle-assignment-remove");

  if (!collaborator || !list) {
    return;
  }

  setText("vehicle-assignment-collaborator", collaborator.name);
  setText("vehicle-assignment-current", `Veh\u00edculo actual: ${getVehicleTextSummary(getCollaboratorVehicle(collaborator))}`);

  if (removeButton) {
    removeButton.hidden = !getCollaboratorVehicleId(collaborator);
  }

  const vehicles = getAssignableVehicles().filter((vehicle) => matchesVehicleAssignmentSearch(vehicle));

  if (!vehicles.length) {
    list.innerHTML = '<p class="vehicle-assignment-empty">No hay veh\u00edculos aptos que coincidan con la b\u00fasqueda.</p>';
    return;
  }

  list.innerHTML = vehicles.map((vehicle) => renderVehicleAssignmentItem(vehicle, collaborator)).join("");
}

function renderVehicleAssignmentItem(vehicle, collaborator) {
  const assignedCollaborator = getVehicleAssignedCollaborator(vehicle);
  const isCurrentVehicle = getCollaboratorVehicleId(collaborator) === vehicle.id;
  const assignedText = getVehicleAssignmentText(assignedCollaborator, isCurrentVehicle);
  const buttonLabel = isCurrentVehicle ? "Actual" : "Asignar";
  const disabled = isCurrentVehicle ? " disabled" : "";
  const buttonClass = isCurrentVehicle ? "button button--compact button--muted" : "button button--compact";

  return `
    <article class="vehicle-assignment-item">
      <div class="vehicle-assignment-item__content">
        <strong>${escapeHtml(getVehicleAssignmentTitle(vehicle))}</strong>
        <span>${escapeHtml(vehicle.availability)} / ${escapeHtml(assignedText)}</span>
      </div>
      <button class="${buttonClass}" type="button" data-assign-vehicle-id="${escapeHtml(vehicle.id)}"${disabled}>${buttonLabel}</button>
    </article>
  `;
}

function confirmVehicleAssignment(vehicleId) {
  const collaborator = getCollaboratorById(vehicleAssignmentCollaboratorId);
  const vehicle = getVehicleById(vehicleId);

  if (!collaborator) {
    notifyCollaboratorsAction("No se encontr\u00f3 el colaborador seleccionado.", "error");
    return;
  }

  if (!vehicle || !isVehicleAssignable(vehicle)) {
    notifyCollaboratorsAction("No se encontr\u00f3 el veh\u00edculo seleccionado.", "error");
    return;
  }

  if (getCollaboratorVehicleId(collaborator) === vehicle.id) {
    return;
  }

  const assignedCollaborator = getVehicleAssignedCollaborator(vehicle);
  const confirmation = getVehicleAssignmentConfirmationContent(collaborator, assignedCollaborator);

  openVehicleAssignmentConfirmationModal({
    title: confirmation.title,
    message: confirmation.message,
    confirmLabel: confirmation.confirmLabel,
    onConfirm: () => assignVehicleToCollaborator(collaborator, vehicle, assignedCollaborator),
  });
}

function confirmRemoveCollaboratorVehicle() {
  const collaborator = getCollaboratorById(vehicleAssignmentCollaboratorId);

  if (!collaborator) {
    notifyCollaboratorsAction("No se encontr\u00f3 el colaborador seleccionado.", "error");
    return;
  }

  const currentVehicleId = getCollaboratorVehicleId(collaborator);

  if (!currentVehicleId) {
    return;
  }

  openVehicleAssignmentConfirmationModal({
    title: "Quitar veh\u00edculo asignado",
    message: "\u00bfQuieres quitar el veh\u00edculo asignado a este colaborador?",
    confirmLabel: "Quitar veh\u00edculo",
    onConfirm: () => {
      unassignVehicleById(currentVehicleId);
      collaborator.vehicleId = null;
      renderCollaboratorsAfterVehicleAssignment();
      closeVehicleAssignmentModal();
      notifyCollaboratorsAction("Veh\u00edculo quitado correctamente.", "success");
    },
  });
}

function assignVehicleToCollaborator(collaborator, vehicle, assignedCollaborator) {
  const previousVehicleId = getCollaboratorVehicleId(collaborator);
  const hadPreviousVehicle = Boolean(previousVehicleId);
  const wasAssignedToOther = Boolean(assignedCollaborator && assignedCollaborator.id !== collaborator.id);

  if (hadPreviousVehicle) {
    unassignVehicleById(previousVehicleId);
  }

  if (wasAssignedToOther) {
    assignedCollaborator.vehicleId = null;
  }

  collaborator.vehicleId = vehicle.id;
  setVehicleAssignment(vehicle, collaborator);
  renderCollaboratorsAfterVehicleAssignment();
  closeVehicleAssignmentModal();
  notifyCollaboratorsAction(
    wasAssignedToOther || hadPreviousVehicle ? "Veh\u00edculo reasignado correctamente." : "Veh\u00edculo asignado correctamente.",
    "success",
  );
}

function renderCollaboratorsAfterVehicleAssignment() {
  renderCollaboratorsSummary();
  renderCollaboratorsList();
  syncVehiclesSummaryMetrics();

  if (window.ElaraVehicles && typeof window.ElaraVehicles.refreshVehicles === "function") {
    window.ElaraVehicles.refreshVehicles();
  }
}

function refreshCollaborators() {
  renderCollaboratorsSummary();
  renderCollaboratorsList();
}

function closeVehicleAssignmentModal() {
  const modal = getElement(VEHICLE_ASSIGNMENT_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  vehicleAssignmentCollaboratorId = "";
  vehicleAssignmentSearchTerm = "";
}

function openVehicleAssignmentConfirmationModal({ title, message, confirmLabel, onConfirm }) {
  const modal = getElement(VEHICLE_ASSIGNMENT_CONFIRM_MODAL_ID);
  const confirmButton = getElement("vehicle-assignment-confirm-action");

  if (!modal || typeof onConfirm !== "function") {
    notifyCollaboratorsAction("No se pudo completar la asignaci\u00f3n del veh\u00edculo.", "error");
    return;
  }

  setText("vehicle-assignment-confirm-title", title);
  setText("vehicle-assignment-confirm-message", message);

  if (confirmButton) {
    confirmButton.textContent = confirmLabel;
  }

  vehicleAssignmentPendingAction = onConfirm;
  modal.hidden = false;
}

function closeVehicleAssignmentConfirmationModal() {
  const modal = getElement(VEHICLE_ASSIGNMENT_CONFIRM_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  vehicleAssignmentPendingAction = null;
}

function clearCollaboratorsFilters() {
  document.querySelectorAll("[data-collaborator-filter]").forEach((filter) => {
    filter.checked = false;
  });

  const searchInput = getElement("collaborators-search");

  if (searchInput) {
    searchInput.value = "";
  }

  collaboratorsSearchTerm = "";
  updateCollaboratorsFilterState();
  renderCollaboratorsList();
}

function updateCollaboratorsFilterState() {
  document.querySelectorAll(".collaborator-filter-chip").forEach((chip) => {
    const input = chip.querySelector("[data-collaborator-filter]");

    chip.classList.toggle("collaborator-filter-chip--active", Boolean(input && input.checked));
  });
}

function notifyCollaboratorsAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  }
}

function initNewCollaboratorForm() {
  const form = getElement("new-collaborator-form");
  const modal = getElement(NEW_COLLABORATOR_MODAL_ID);

  if (!form || !modal) {
    return;
  }

  renderNewCollaboratorBaseCityOptions();
  syncNewCollaboratorLicenseRequirement();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    createNewCollaboratorFromForm();
  });

  form.addEventListener("change", (event) => {
    if (event.target.id === "new-collaborator-administrative-status") {
      syncNewCollaboratorLicenseRequirement();
    }
  });

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest(`[data-modal-open="${NEW_COLLABORATOR_MODAL_ID}"]`);
    const closeButton = event.target.closest("[data-modal-close]");

    if (openButton) {
      resetNewCollaboratorForm();
      return;
    }

    if ((closeButton && closeButton.closest(`#${NEW_COLLABORATOR_MODAL_ID}`)) || event.target === modal) {
      resetNewCollaboratorForm();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      resetNewCollaboratorForm();
    }
  });
}

function createNewCollaboratorFromForm() {
  const collaboratorData = getNewCollaboratorFormData();
  const validationMessage = getNewCollaboratorValidationMessage(collaboratorData);

  if (validationMessage) {
    notifyCollaboratorsAction(validationMessage, "error");
    return;
  }

  collaboratorsData.collaborators.push(buildNewMockCollaborator(collaboratorData));
  renderCollaboratorsSummary();
  renderCollaboratorsList();
  closeNewCollaboratorModal();
  notifyCollaboratorsAction("Conductor creado en mock.", "success");
}

function getNewCollaboratorFormData() {
  return {
    firstName: getInputValue("new-collaborator-first-name"),
    lastName: getInputValue("new-collaborator-last-name"),
    email: getInputValue("new-collaborator-email"),
    countryCode: getInputValue("new-collaborator-country-code") || "+34",
    phone: getInputValue("new-collaborator-phone"),
    baseCity: getInputValue("new-collaborator-base-city"),
    driverType: getInputValue("new-collaborator-driver-type"),
    licenseExpiration: getInputValue("new-collaborator-license-expiration"),
    administrativeStatus: getInputValue("new-collaborator-administrative-status"),
    observations: getInputValue("new-collaborator-observations"),
  };
}

function getNewCollaboratorValidationMessage(collaboratorData) {
  if (!collaboratorData.firstName) {
    return "Introduce el nombre del conductor.";
  }

  if (!collaboratorData.lastName) {
    return "Introduce el apellido del conductor.";
  }

  if (!collaboratorData.email) {
    return "Introduce el email del conductor.";
  }

  if (!collaboratorData.phone) {
    return "Introduce el tel\u00e9fono del conductor.";
  }

  if (!collaboratorBaseCities.includes(collaboratorData.baseCity)) {
    return "Selecciona una ciudad/base v\u00e1lida.";
  }

  if (!driverTypes.includes(collaboratorData.driverType)) {
    return "Selecciona un tipo de conductor v\u00e1lido.";
  }

  if (!administrativeStatuses.includes(collaboratorData.administrativeStatus)) {
    return "Selecciona un estado administrativo v\u00e1lido.";
  }

  if (collaboratorData.administrativeStatus === "Activo" && !collaboratorData.licenseExpiration) {
    return "Introduce el vencimiento del carnet de conducir.";
  }

  if (isDateBeforeToday(collaboratorData.licenseExpiration)) {
    return "El vencimiento del carnet no puede ser anterior a la fecha actual.";
  }

  return "";
}

function buildNewMockCollaborator(collaboratorData) {
  const fullName = `${collaboratorData.firstName} ${collaboratorData.lastName}`.trim();

  return {
    id: getNextCollaboratorId(),
    name: fullName,
    driverType: collaboratorData.driverType,
    phone: `${collaboratorData.countryCode} ${collaboratorData.phone}`.trim(),
    email: collaboratorData.email,
    baseCity: collaboratorData.baseCity,
    licenseExpiration: collaboratorData.licenseExpiration || "No indicada",
    administrativeStatus: collaboratorData.administrativeStatus,
    operationalStatus: NEW_COLLABORATOR_DEFAULT_OPERATIONAL_STATUS,
    availability: NEW_COLLABORATOR_DEFAULT_OPERATIONAL_STATUS,
    observations: collaboratorData.observations || "Sin observaciones.",
    vehicleId: null,
    nextService: null,
  };
}

function getNextCollaboratorId() {
  const nextNumber =
    collaboratorsData.collaborators.reduce((highestNumber, collaborator) => {
      const match = String(collaborator.id || "").match(/^col-(\d+)$/);
      const number = match ? Number(match[1]) : 0;

      return Math.max(highestNumber, number);
    }, 0) + 1;

  return `col-${String(nextNumber).padStart(3, "0")}`;
}

function renderNewCollaboratorBaseCityOptions() {
  renderCollaboratorBaseCityOptions("new-collaborator-base-city");
}

function renderCollaboratorBaseCityOptions(selectId, selectedCity = collaboratorBaseCities[0]) {
  const select = getElement(selectId);

  if (!select) {
    return;
  }

  select.innerHTML = collaboratorBaseCities
    .map((city) => {
      const selected = city === selectedCity ? " selected" : "";

      return `<option value="${escapeHtml(city)}"${selected}>${escapeHtml(city)}</option>`;
    })
    .join("");
}

function syncNewCollaboratorLicenseRequirement() {
  const statusSelect = getElement("new-collaborator-administrative-status");
  const licenseInput = getElement("new-collaborator-license-expiration");

  if (!statusSelect || !licenseInput) {
    return;
  }

  licenseInput.required = statusSelect.value === "Activo";
}

function syncCollaboratorEditLicenseRequirement() {
  const statusSelect = getElement("collaborator-edit-administrative-status");
  const licenseInput = getElement("collaborator-edit-license-expiration");

  if (!statusSelect || !licenseInput) {
    return;
  }

  licenseInput.required = statusSelect.value === "Activo";
}

function isDateBeforeToday(value) {
  return Boolean(value) && value < getTodayDateValue();
}

function getTodayDateValue() {
  const today = new Date();

  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());

  return today.toISOString().slice(0, 10);
}

function closeNewCollaboratorModal() {
  const modal = getElement(NEW_COLLABORATOR_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  resetNewCollaboratorForm();
}

function resetNewCollaboratorForm() {
  const form = getElement("new-collaborator-form");

  if (form) {
    form.reset();
  }

  const countryCodeInput = getElement("new-collaborator-country-code");
  const baseCitySelect = getElement("new-collaborator-base-city");
  const driverTypeSelect = getElement("new-collaborator-driver-type");
  const statusSelect = getElement("new-collaborator-administrative-status");

  if (countryCodeInput) {
    countryCodeInput.value = "+34";
  }

  if (baseCitySelect) {
    baseCitySelect.value = collaboratorBaseCities[0];
  }

  if (driverTypeSelect) {
    driverTypeSelect.value = "Colaborador";
  }

  if (statusSelect) {
    statusSelect.value = "Pendiente documentacion";
  }

  syncNewCollaboratorLicenseRequirement();
}

// =========================
// Datos y filtros
// =========================

function normalizeCollaboratorsData() {
  collaboratorsData.collaborators.forEach((collaborator, index) => {
    collaborator.id = collaborator.id || `collaborator-${String(index + 1).padStart(3, "0")}`;
    collaborator.driverType = getCollaboratorDriverType(collaborator);
    collaborator.availabilityPreference = getCollaboratorAvailabilityPreference(collaborator);
    collaborator.operationalStatus = normalizeCollaboratorOperationalStatus(
      collaborator.operationalStatus || collaborator.availability,
    );
    collaborator.availability = collaborator.operationalStatus;

    if (collaborator.administrativeStatus === "Pendiente aprobacion") {
      collaborator.administrativeStatus = "Pendiente documentacion";
    }

    if (collaborator.administrativeStatus === "Desincorporado") {
      collaborator.administrativeStatus = "Inactivo";
    }

    if (!collaborator.vehicleId && collaborator.vehicle && collaborator.vehicle.id) {
      collaborator.vehicleId = collaborator.vehicle.id;
    }

    delete collaborator.vehicle;
  });
}

function normalizeVehicleAssignments() {
  const vehiclesData = getVehiclesData();

  if (!vehiclesData) {
    return;
  }

  const assignmentDatesByVehicleId = new Map(
    vehiclesData.vehicles.map((vehicle) => [vehicle.id, vehicle.assignmentDate || "-"]),
  );

  vehiclesData.vehicles.forEach((vehicle) => {
    vehicle.assignedCollaboratorId = "";
    vehicle.assignedCollaboratorName = "";
    vehicle.driver = "Sin asignar";
    vehicle.assignmentDate = "-";
  });

  const assignedVehicleIds = new Set();

  collaboratorsData.collaborators.forEach((collaborator) => {
    const vehicleId = getCollaboratorVehicleId(collaborator);

    if (!vehicleId || assignedVehicleIds.has(vehicleId)) {
      collaborator.vehicleId = null;
      return;
    }

    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      collaborator.vehicleId = null;
      return;
    }

    assignedVehicleIds.add(vehicleId);
    setVehicleAssignment(vehicle, collaborator, false);
    vehicle.assignmentDate = assignmentDatesByVehicleId.get(vehicleId) || "-";
  });

  syncVehiclesSummaryMetrics();
}

function getVehiclesData() {
  return window.ElaraVehiclesMock && Array.isArray(window.ElaraVehiclesMock.vehicles)
    ? window.ElaraVehiclesMock
    : null;
}

function getAssignableVehicles() {
  const vehiclesData = getVehiclesData();

  return vehiclesData ? vehiclesData.vehicles.filter(isVehicleAssignable) : [];
}

function isVehicleAssignable(vehicle) {
  const validDocumentationStatuses = ["al dia", "proxima a vencer"];

  return (
    vehicle.availability === "Operativo" &&
    validDocumentationStatuses.includes(normalizeForSearch(vehicle.documentationStatus))
  );
}

function matchesVehicleAssignmentSearch(vehicle) {
  if (!vehicleAssignmentSearchTerm) {
    return true;
  }

  const assignedCollaborator = getVehicleAssignedCollaborator(vehicle);
  const values = [
    vehicle.brand,
    vehicle.model,
    vehicle.plate,
    getVehicleTypeLabel(vehicle),
    vehicle.availability,
    assignedCollaborator ? assignedCollaborator.name : vehicle.driver,
  ];

  return normalizeForSearch(values.filter(Boolean).join(" ")).includes(vehicleAssignmentSearchTerm);
}

function getVehicleById(vehicleId) {
  const vehiclesData = getVehiclesData();

  return vehiclesData ? vehiclesData.vehicles.find((vehicle) => vehicle.id === vehicleId) : null;
}

function getVehicleAssignedCollaborator(vehicle) {
  if (vehicle.assignedCollaboratorId) {
    return getCollaboratorById(vehicle.assignedCollaboratorId);
  }

  const collaboratorByVehicle = collaboratorsData.collaborators.find(
    (collaborator) => getCollaboratorVehicleId(collaborator) === vehicle.id,
  );

  if (collaboratorByVehicle) {
    return collaboratorByVehicle;
  }

  if (vehicle.driver && vehicle.driver !== "Sin asignar") {
    return collaboratorsData.collaborators.find(
      (collaborator) => normalizeForSearch(collaborator.name) === normalizeForSearch(vehicle.driver),
    );
  }

  return null;
}

function setVehicleAssignment(vehicle, collaborator, updateAssignmentDate = true) {
  vehicle.assignedCollaboratorId = collaborator.id;
  vehicle.assignedCollaboratorName = collaborator.name;
  vehicle.driver = collaborator.name;

  if (updateAssignmentDate) {
    vehicle.assignmentDate = getTodayDisplayDate();
  }
}

function unassignVehicleById(vehicleId) {
  const vehicle = getVehicleById(vehicleId);

  if (!vehicle) {
    return;
  }

  vehicle.assignedCollaboratorId = "";
  vehicle.assignedCollaboratorName = "";
  vehicle.driver = "Sin asignar";
  vehicle.assignmentDate = "-";
}

function getVehicleAssignmentTitle(vehicle) {
  return `${vehicle.brand} / ${vehicle.model} / ${vehicle.plate} / ${getVehicleTypeLabel(vehicle)}`;
}

function getVehicleTypeLabel(vehicle) {
  if (vehicle.type) {
    return vehicle.type;
  }

  return vehicle.seats ? `${vehicle.seats} plazas` : "Tipo no indicado";
}

function getVehicleAssignmentText(assignedCollaborator, isCurrentVehicle) {
  if (isCurrentVehicle) {
    return "Asignado actualmente a este colaborador";
  }

  return assignedCollaborator ? `Asignado a ${assignedCollaborator.name}` : "Sin asignar";
}

function getVehicleAssignmentConfirmationContent(collaborator, assignedCollaborator) {
  if (assignedCollaborator && assignedCollaborator.id !== collaborator.id) {
    return {
      title: "Confirmar reasignaci\u00f3n",
      message: `Vas a reasignar este veh\u00edculo de ${assignedCollaborator.name} a ${collaborator.name}.`,
      confirmLabel: "Reasignar veh\u00edculo",
    };
  }

  if (getCollaboratorVehicleId(collaborator)) {
    return {
      title: "Sustituir veh\u00edculo",
      message: "Este colaborador ya tiene un veh\u00edculo asignado. Si contin\u00faas, el veh\u00edculo actual quedar\u00e1 sin asignar.",
      confirmLabel: "Sustituir veh\u00edculo",
    };
  }

  return {
    title: "Confirmar asignaci\u00f3n",
    message: `\u00bfQuieres asignar este veh\u00edculo a ${collaborator.name}?`,
    confirmLabel: "Asignar veh\u00edculo",
  };
}

function syncVehiclesSummaryMetrics() {
  const vehiclesData = getVehiclesData();

  if (!vehiclesData || !Array.isArray(vehiclesData.summary)) {
    return;
  }

  const assignedMetric = vehiclesData.summary.find((metric) => metric.label === "Asignados");

  if (assignedMetric) {
    assignedMetric.value = String(vehiclesData.vehicles.filter((vehicle) => vehicle.assignedCollaboratorId).length);
  }
}

function getTodayDisplayDate() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();

  return `${day}/${month}/${year}`;
}

function getFilteredCollaborators() {
  const filters = getActiveCollaboratorFilters();

  return collaboratorsData.collaborators.filter((collaborator) => {
    const matchesSearch = matchesCollaboratorsSearch(collaborator);
    const matchesAdministrative = matchesCollaboratorFilter(
      collaborator.administrativeStatus,
      filters.administrative,
    );
    const matchesOperational = matchesCollaboratorFilter(
      getCollaboratorOperationalStatus(collaborator),
      filters.operational,
    );
    const matchesVehicle =
      !filters.vehicle.length ||
      (filters.vehicle.includes("assigned") && Boolean(getCollaboratorVehicleId(collaborator))) ||
      (filters.vehicle.includes("unassigned") && !getCollaboratorVehicleId(collaborator));

    return matchesSearch && matchesAdministrative && matchesOperational && matchesVehicle;
  });
}

function getActiveCollaboratorFilters() {
  const filters = {
    administrative: [],
    operational: [],
    vehicle: [],
  };

  document.querySelectorAll("[data-collaborator-filter]:checked").forEach((filter) => {
    const type = filter.dataset.collaboratorFilter;
    const value = filter.dataset.collaboratorValue;

    if (filters[type]) {
      filters[type].push(value);
    }
  });

  return filters;
}

function getInputValue(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}

function matchesCollaboratorsSearch(collaborator) {
  if (!collaboratorsSearchTerm) {
    return true;
  }

  return getCollaboratorSearchText(collaborator).includes(collaboratorsSearchTerm);
}

function getCollaboratorSearchText(collaborator) {
  const vehicle = getCollaboratorVehicle(collaborator);
  const values = [
    collaborator.name,
    collaborator.email,
    collaborator.phone,
    collaborator.baseCity,
    getCollaboratorDriverType(collaborator),
    getAdministrativeStatusLabel(collaborator.administrativeStatus),
    getOperationalStatusLabel(getCollaboratorOperationalStatus(collaborator)),
    vehicle ? vehicle.brand : "",
    vehicle ? vehicle.model : "",
    vehicle ? vehicle.plate : "",
  ];

  return normalizeForSearch(values.filter(Boolean).join(" "));
}

function matchesCollaboratorFilter(value, activeFilters) {
  return !activeFilters.length || activeFilters.includes(value);
}

function countCollaboratorsByAdministrativeStatus(status) {
  return collaboratorsData.collaborators.filter((collaborator) => collaborator.administrativeStatus === status).length;
}

function countCollaboratorsByOperationalStatus(status) {
  return collaboratorsData.collaborators.filter(
    (collaborator) => getCollaboratorOperationalStatus(collaborator) === status,
  ).length;
}

// =========================
// Formateadores de colaboradores
// =========================

function getCollaboratorCardClass(collaborator) {
  if (collaborator.administrativeStatus === "Suspendido") {
    return "collaborator-card--danger";
  }

  if (collaborator.administrativeStatus === "Pendiente documentacion") {
    return "collaborator-card--warning";
  }

  if (
    collaborator.administrativeStatus === "Activo" &&
    getCollaboratorOperationalStatus(collaborator) === "Disponible"
  ) {
    return "collaborator-card--success";
  }

  return "collaborator-card--neutral";
}

function getVehicleSummary(vehicle) {
  if (!vehicle) {
    return "Sin veh\u00edculo asignado";
  }

  return `${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)} &middot; ${escapeHtml(vehicle.plate)}`;
}

function getNextServiceSummary(collaborator) {
  const service = getCollaboratorNextService(collaborator);

  if (!service) {
    return "<span>Sin servicios programados</span>";
  }

  const serviceNumber = getCollaboratorServiceNumber(service);

  return `
    <span class="collaborator-card__service-time">${escapeHtml(getCollaboratorServiceDate(service))} &middot; ${escapeHtml(
      getCollaboratorServiceTime(service),
    )} &middot;</span>
    <button class="collaborator-card__service-link" type="button" data-service-summary="${escapeHtml(
      serviceNumber,
    )}">${escapeHtml(serviceNumber)}</button>
  `;
}

function renderCollaboratorNextServiceFields(collaborator, fieldPrefix) {
  const service = getCollaboratorNextService(collaborator);

  setText(`${fieldPrefix}-service-date`, service ? getCollaboratorServiceDate(service) : "Sin servicios programados");
  setText(`${fieldPrefix}-service-time`, service ? getCollaboratorServiceTime(service) : "-");
  setText(`${fieldPrefix}-service-number`, service ? getCollaboratorServiceNumber(service) : "-");
  setText(`${fieldPrefix}-service-type`, service ? service.type || "-" : "-");
  setText(`${fieldPrefix}-service-origin`, service ? service.origin || "-" : "-");
  setText(`${fieldPrefix}-service-destination`, service ? service.destination || "-" : "-");
}

function getCollaboratorNextService(collaborator) {
  const centralServices = getCollaboratorServicesSource();

  if (!centralServices) {
    return collaborator.nextService || null;
  }

  const referenceDate = getCollaboratorOperationalReferenceDate();
  const referenceTimestamp = referenceDate.getTime();
  const activeCandidates = centralServices
    .filter((service) => isCollaboratorRelatedService(service, collaborator) && !isCollaboratorClosedService(service))
    .map((service) => ({
      service,
      serviceId: getCollaboratorServiceNumber(service),
      status: getCollaboratorServiceStatus(service),
      date: getCollaboratorServiceDate(service),
      time: getCollaboratorServiceTime(service),
      timestamp: getCollaboratorServiceTimestamp(service),
    }))
    .filter((candidate) => Number.isFinite(candidate.timestamp));
  const selectedService =
    activeCandidates
      .filter((candidate) => candidate.status === "en curso")
      .sort((first, second) => compareCollaboratorServiceCandidatesByDistance(first, second, referenceTimestamp))[0]?.service ||
    activeCandidates
      .filter((candidate) => ["pendiente", "confirmado"].includes(candidate.status))
      .filter((candidate) => candidate.timestamp >= referenceTimestamp)
      .sort(compareCollaboratorServiceCandidatesByTimestamp)[0]?.service ||
    null;

  logCollaboratorNextServiceCandidates(collaborator, activeCandidates, referenceTimestamp, selectedService);

  return selectedService;
}

function getCollaboratorServicesSource() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }

  return Array.isArray(window.ElaraServicesMock?.services) ? window.ElaraServicesMock.services : null;
}

function isCollaboratorRelatedService(service, collaborator) {
  return Boolean(collaborator?.id && getCollaboratorServiceAssignedCollaboratorId(service) === collaborator.id);
}

function isCollaboratorClosedService(service) {
  return ["cancelado", "finalizado", "no show", "no-show", "no realizado", "no-realizado"].includes(normalizeForSearch(service?.status));
}

function getCollaboratorOperationalReferenceDate() {
  const appReference = window.ElaraAppConfig?.operationalReferenceDateTime || window.ElaraAppConfig?.operationalReferenceDate;
  const mockReference = window.ElaraMockConfig?.operationalReferenceDateTime || window.ElaraMockConfig?.operationalReferenceDate;
  const configuredReference = appReference || mockReference;
  const parsedReference =
    configuredReference && getCollaboratorServiceDateTime({ date: configuredReference, time: getCollaboratorReferenceTime(configuredReference) });

  return parsedReference || new Date();
}

function getCollaboratorServiceDateTime(service) {
  const timestamp = getCollaboratorServiceTimestamp(service);

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function getCollaboratorServiceTimestamp(service) {
  const rawDate = getCollaboratorServiceDate(service);
  const rawTime = getCollaboratorServiceTime(service);

  if (!rawDate || rawDate === "-") {
    return null;
  }

  const timeParts = getCollaboratorServiceTimeParts(rawTime);
  const dateParts = getCollaboratorServiceDateParts(rawDate);

  if (!dateParts) {
    return null;
  }

  const parsedDate = new Date(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hours, timeParts.minutes, 0, 0);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== dateParts.year ||
    parsedDate.getMonth() !== dateParts.month - 1 ||
    parsedDate.getDate() !== dateParts.day
  ) {
    return null;
  }

  return parsedDate.getTime();
}

function getCollaboratorServiceTimeParts(rawTime) {
  const timeValue = String(rawTime || "").trim();
  const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})$/);

  if (!timeMatch) {
    return { hours: 0, minutes: 0 };
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return { hours: 0, minutes: 0 };
  }

  return { hours, minutes };
}

function getCollaboratorServiceDateParts(rawDate) {
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

function getCollaboratorReferenceTime(referenceValue) {
  const timeMatch = String(referenceValue || "").match(/T(\d{2}:\d{2})/);

  return timeMatch ? timeMatch[1] : "00:00";
}

function compareCollaboratorServiceCandidatesByTimestamp(first, second) {
  return first.timestamp - second.timestamp || first.serviceId.localeCompare(second.serviceId);
}

function compareCollaboratorServiceCandidatesByDistance(first, second, referenceTimestamp) {
  return (
    Math.abs(first.timestamp - referenceTimestamp) - Math.abs(second.timestamp - referenceTimestamp) ||
    compareCollaboratorServiceCandidatesByTimestamp(first, second)
  );
}

function logCollaboratorNextServiceCandidates(collaborator, candidates, referenceTimestamp, selectedService) {
  if (!window.ElaraDebugCollaboratorNextService) {
    return;
  }

  console.table(
    candidates.map((candidate) => ({
      collaboratorId: collaborator?.id || "",
      serviceId: candidate.serviceId,
      status: candidate.status,
      date: candidate.date,
      time: candidate.time,
      timestamp: candidate.timestamp,
      selected: selectedService === candidate.service,
      referenceTimestamp,
    })),
  );
}

function getCollaboratorServiceDate(service) {
  return service?.date || service?.serviceDate || "-";
}

function getCollaboratorServiceTime(service) {
  return service?.time || service?.serviceTime || "-";
}

function getCollaboratorServiceNumber(service) {
  return service?.serviceId || service?.number || service?.id || "-";
}

function getCollaboratorServiceStatus(service) {
  return normalizeForSearch(service?.status);
}

function getCollaboratorOperationalStatus(collaborator) {
  if (normalizeForSearch(getCollaboratorNextService(collaborator)?.status) === "en curso") {
    return "En servicio";
  }

  return normalizeCollaboratorOperationalStatus(collaborator.operationalStatus || collaborator.availability);
}

function getAdministrativeStatusLabel(status) {
  return administrativeStatusLabels[status] || status;
}

function getAdministrativeStatusCompactLabel(status) {
  return administrativeStatusCompactLabels[status] || getAdministrativeStatusLabel(status);
}

function getOperationalStatusLabel(status) {
  return operationalStatusLabels[normalizeCollaboratorOperationalStatus(status)];
}

function getCollaboratorOperationalBarClass(status) {
  return operationalBarClassByName[normalizeCollaboratorOperationalStatus(status)] || "collaborator-card__bar--dark";
}

function getCollaboratorDriverType(collaborator) {
  return driverTypes.includes(collaborator.driverType) ? collaborator.driverType : "Colaborador";
}

function getCollaboratorPortalAccessStatus(collaboratorId) {
  const normalizedCollaboratorId = String(collaboratorId || "").trim();
  const linkedUsers = getCollaboratorPortalAccessUsers(normalizedCollaboratorId);

  if (linkedUsers.length > 1) {
    console.warn("[ELARA] M\u00e1s de un usuario vinculado al mismo conductor:", collaboratorId);
  }

  const activeUser = linkedUsers.find((user) => normalizePortalUserStatus(user.status) === "activo");
  const selectedUser = activeUser || linkedUsers[0] || null;
  const status = activeUser ? "active" : selectedUser ? "inactive" : "none";

  return {
    status,
    label: collaboratorPortalAccessLabels[status],
    userId: selectedUser?.id || null,
    user: selectedUser,
  };
}

function getCollaboratorPortalAccessUsers(collaboratorId) {
  if (!collaboratorId) {
    return [];
  }

  return getPortalUsersMock().filter(
    (user) => hasPortalUserRole(user, "conductor") && String(user.driverId || "").trim() === collaboratorId,
  );
}

function getPortalUsersMock() {
  if (Array.isArray(window.ElaraUsersMock)) {
    return window.ElaraUsersMock;
  }

  if (Array.isArray(window.ElaraUsersMock?.users)) {
    return window.ElaraUsersMock.users;
  }

  return [];
}

function hasPortalUserRole(user, role) {
  return getPortalUserRoles(user).includes(role);
}

function getPortalUserRoles(user) {
  const rawRoles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];

  return Array.from(
    new Set(
      rawRoles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter((role) => ["superadmin", "administrativo", "conductor"].includes(role)),
    ),
  );
}

function normalizePortalUserStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (["activo", "active"].includes(normalizedStatus)) {
    return "activo";
  }

  return "inactivo";
}

function getPortalUserAccountStatusLabel(status) {
  return normalizePortalUserStatus(status) === "activo" ? "Activo" : "Inactivo";
}

function renderCollaboratorPortalAccessDetail(collaborator) {
  const access = getCollaboratorPortalAccessStatus(collaborator.id);
  const accessValue = getElement("detail-collaborator-portal-access");
  const userValue = getElement("detail-collaborator-portal-user");
  const statusValue = getElement("detail-collaborator-portal-user-status");
  const linkedUser = access.user;

  if (accessValue) {
    accessValue.innerHTML = `<span class="collaborator-portal-access collaborator-portal-access--${escapeHtml(
      access.status,
    )}">${escapeHtml(access.label)}</span>`;
  }

  if (userValue) {
    userValue.textContent = linkedUser
      ? `${linkedUser.name || "Usuario sin nombre"} - ${linkedUser.email || "Email no indicado"}`
      : "Sin acceso al Portal";
  }

  if (statusValue) {
    statusValue.textContent = linkedUser ? getPortalUserAccountStatusLabel(linkedUser.status) : "-";
  }
}

function setCollaboratorDetailOperationalStatusCardClass(collaborator, isViewMode) {
  const status = getCollaboratorOperationalStatus(collaborator);
  const statusClass =
    collaboratorOperationalStatusCardClassByName[normalizeCollaboratorOperationalStatus(status)] || "status-card--neutral";
  const statusValue = getElement("detail-collaborator-availability");
  const statusField = statusValue?.closest(".modal__field");

  clearCollaboratorDetailOperationalStatusCardClass();

  if (isViewMode && statusField) {
    statusField.classList.add(statusClass);
  }
}

function clearCollaboratorDetailOperationalStatusCardClass() {
  const statusValue = getElement("detail-collaborator-availability");
  const statusField = statusValue?.closest(".modal__field");

  if (statusField) {
    statusField.classList.remove(
      "status-card--warning",
      "status-card--success",
      "status-card--info",
      "status-card--danger",
      "status-card--neutral",
    );
  }
}

function normalizeCollaboratorOperationalStatus(status) {
  const normalizedStatus = normalizeForSearch(status);

  return operationalStatuses.find((candidate) => normalizeForSearch(candidate) === normalizedStatus) || "No disponible";
}

// =========================
// Modales
// =========================

function openServiceSummaryModal(serviceNumber) {
  const service = getCollaboratorServiceById(serviceNumber);

  if (!service) {
    notifyCollaboratorsAction("No se encontr\u00f3 el servicio seleccionado.", "error");
    return;
  }

  if (!window.ElaraServices || typeof window.ElaraServices.openServiceDetail !== "function") {
    notifyCollaboratorsAction("No se pudo abrir el detalle del servicio.", "error");
    return;
  }

  closeCollaboratorDetailModal();
  window.ElaraServices.openServiceDetail(getCollaboratorServiceNumber(service));
}

function getCollaboratorServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();
  const centralServices = getCollaboratorServicesSource();

  if (!normalizedServiceId || !centralServices) {
    return null;
  }

  return (
    centralServices.find((service) => String(getCollaboratorServiceNumber(service) || "").trim() === normalizedServiceId) || null
  );
}

function openCollaboratorDetailModal(collaboratorId) {
  const collaborator = getCollaboratorById(collaboratorId);

  if (!collaborator) {
    return;
  }

  collaboratorDetailCollaboratorId = collaborator.id;
  renderCollaboratorDetailView(collaborator);
  setCollaboratorDetailMode(false);

  const modal = getElement(COLLABORATOR_DETAIL_MODAL_ID);

  if (modal) {
    modal.hidden = false;
  }
}

function closeCollaboratorDetailModal() {
  const modal = getElement(COLLABORATOR_DETAIL_MODAL_ID);

  clearCollaboratorEditValidation();
  collaboratorDetailCollaboratorId = "";
  setCollaboratorDetailMode(false);

  if (modal) {
    modal.hidden = true;
  }
}

function renderCollaboratorDetailView(collaborator) {
  const vehicle = getCollaboratorVehicle(collaborator);

  setText("collaborator-detail-modal-title", collaborator.name || "Conductor");
  setText("collaborator-detail-description", "Informaci\u00f3n personal, tipo, estado, veh\u00edculo y pr\u00f3ximo servicio.");
  setText("detail-collaborator-name", collaborator.name);
  setText("detail-collaborator-driver-type", getCollaboratorDriverType(collaborator));
  setText("detail-collaborator-phone", collaborator.phone);
  setText("detail-collaborator-email", collaborator.email);
  setText("detail-collaborator-base", collaborator.baseCity || "Base no definida");
  setText("detail-collaborator-status", getAdministrativeStatusLabel(collaborator.administrativeStatus));
  setText(
    "detail-collaborator-availability",
    getOperationalStatusLabel(getCollaboratorOperationalStatus(collaborator)),
  );
  setText("detail-collaborator-availability-preference", getCollaboratorAvailabilityPreference(collaborator));
  setCollaboratorDetailOperationalStatusCardClass(collaborator, true);
  renderCollaboratorPortalAccessDetail(collaborator);
  setText("detail-collaborator-license", collaborator.licenseExpiration || "No indicada");
  setText("detail-collaborator-observations", collaborator.observations || "Sin observaciones.");
  setText("detail-vehicle-brand", vehicle ? vehicle.brand : "Sin veh\u00edculo asignado");
  setText("detail-vehicle-model", vehicle ? vehicle.model : "-");
  setText("detail-vehicle-color", vehicle ? vehicle.color : "-");
  setText("detail-vehicle-plate", vehicle ? vehicle.plate : "-");
  renderCollaboratorNextServiceFields(collaborator, "detail");
}

function populateCollaboratorEditForm(collaborator) {
  const nameParts = getCollaboratorNameParts(collaborator.name);
  const phoneParts = getCollaboratorPhoneParts(collaborator.phone);
  const vehicle = getCollaboratorVehicle(collaborator);

  setCollaboratorEditInputValue("collaborator-edit-first-name", nameParts.firstName);
  setCollaboratorEditInputValue("collaborator-edit-last-name", nameParts.lastName);
  setCollaboratorEditInputValue("collaborator-edit-country-code", phoneParts.countryCode);
  setCollaboratorEditInputValue("collaborator-edit-phone", phoneParts.phone);
  setCollaboratorEditInputValue("collaborator-edit-email", collaborator.email || "");
  renderCollaboratorBaseCityOptions("collaborator-edit-base-city", collaborator.baseCity);
  setCollaboratorEditInputValue("collaborator-edit-driver-type", getCollaboratorDriverType(collaborator));
  setCollaboratorEditInputValue(
    "collaborator-edit-license-expiration",
    getCollaboratorDateInputValue(collaborator.licenseExpiration),
  );
  setCollaboratorEditInputValue("collaborator-edit-administrative-status", collaborator.administrativeStatus);
  setCollaboratorEditInputValue(
    "collaborator-edit-observations",
    collaborator.observations === "Sin observaciones." ? "" : collaborator.observations || "",
  );
  syncCollaboratorEditLicenseRequirement();

  setText("collaborator-edit-operational-status", getOperationalStatusLabel(getCollaboratorOperationalStatus(collaborator)));
  setText("collaborator-edit-vehicle-brand", vehicle ? vehicle.brand : "Sin veh\u00edculo asignado");
  setText("collaborator-edit-vehicle-model", vehicle ? vehicle.model : "-");
  setText("collaborator-edit-vehicle-color", vehicle ? vehicle.color : "-");
  setText("collaborator-edit-vehicle-plate", vehicle ? vehicle.plate : "-");
  renderCollaboratorNextServiceFields(collaborator, "collaborator-edit");
}

function setCollaboratorDetailMode(isEditing) {
  const view = getElement("collaborator-detail-view");
  const form = getElement("collaborator-detail-edit-form");
  const viewActions = getElement("collaborator-detail-view-actions");
  const editActions = getElement("collaborator-detail-edit-actions");

  if (isEditing) {
    clearCollaboratorDetailOperationalStatusCardClass();
  }

  if (view) {
    view.hidden = isEditing;
  }

  if (form) {
    form.hidden = !isEditing;
  }

  if (viewActions) {
    viewActions.hidden = isEditing;
  }

  if (editActions) {
    editActions.hidden = !isEditing;
  }

  setText("collaborator-detail-modal-title", isEditing ? "Editar conductor" : getCollaboratorDetailTitle());
  setText(
    "collaborator-detail-description",
    isEditing
      ? "Actualiza solo los datos propios del conductor."
      : "Informaci\u00f3n personal, tipo, estado, veh\u00edculo y pr\u00f3ximo servicio.",
  );
}

function isCollaboratorDetailEditing() {
  const form = getElement("collaborator-detail-edit-form");

  return Boolean(form && !form.hidden);
}

// =========================
// Utilidades internas
// =========================

function getElement(id) {
  return document.getElementById(id);
}

function getCollaboratorById(collaboratorId) {
  return collaboratorsData.collaborators.find((collaborator) => collaborator.id === collaboratorId);
}

function getCollaboratorVehicleId(collaborator) {
  if (!collaborator) {
    return null;
  }

  return collaborator.vehicleId || (collaborator.vehicle && collaborator.vehicle.id) || null;
}

function getCollaboratorVehicle(collaborator) {
  const vehicleId = getCollaboratorVehicleId(collaborator);

  return vehicleId ? getVehicleById(vehicleId) : null;
}

function getCollaboratorDetailTitle() {
  const collaborator = getCollaboratorById(collaboratorDetailCollaboratorId);

  return collaborator ? collaborator.name : "Conductor";
}

function getCollaboratorNameParts(name) {
  const parts = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function getCollaboratorPhoneParts(phone) {
  const parts = String(phone || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts[0] && parts[0].startsWith("+")) {
    return {
      countryCode: parts[0],
      phone: parts.slice(1).join(" "),
    };
  }

  return {
    countryCode: "+34",
    phone: parts.join(" "),
  };
}

function getCollaboratorDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
}

function setCollaboratorEditInputValue(id, value) {
  const element = getElement(id);

  if (element) {
    element.value = value || "";
  }
}

function markCollaboratorEditFieldInvalid(fieldId) {
  const field = getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }
}

function clearCollaboratorEditValidation() {
  const form = getElement("collaborator-detail-edit-form");

  if (!form) {
    return;
  }

  form.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });
}

function getVehicleTextSummary(vehicle) {
  if (!vehicle) {
    return "Sin veh\u00edculo asignado";
  }

  return `${vehicle.brand} ${vehicle.model} \u00b7 ${vehicle.plate}`;
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

function normalizeForSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

window.ElaraCollaborators = {
  initCollaborators,
  hasCollaboratorServiceInProgress,
  reconcileCollaboratorOperationalStatuses,
  getCollaboratorPortalAccessStatus,
  openCollaboratorDetail: openCollaboratorDetailModal,
  refreshCollaborators,
  showCollaborators,
};
