/*
  Proyecto Atlas / ELARA Transport
  Archivo: vehicles.js
  Responsabilidad: renderizado y logica de la pantalla Vehiculos.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const vehiclesData = window.ElaraVehiclesMock;
const NEW_VEHICLE_MODAL_ID = "new-vehicle-modal";
const VEHICLE_DETAIL_MODAL_ID = "vehicle-detail-modal";
const VEHICLE_PERSON_ASSIGNMENT_MODAL_ID = "vehicle-person-assignment-modal";
const VEHICLE_PERSON_ASSIGNMENT_CONFIRM_MODAL_ID = "vehicle-person-assignment-confirm-modal";
const NEW_VEHICLE_UPCOMING_DOCUMENT_DAYS = 60;
const VEHICLE_OWNERSHIP_OPTIONS = ["Propio", "Externo"];
const VEHICLE_CIRCULATION_PERMIT_OPTIONS = ["Disponible", "Pendiente", "Incidencia"];
const VEHICLE_VISUAL_CHECK_OPTIONS = ["Aprobado", "Pendiente", "Rechazado"];
const VEHICLE_ELARA_APPROVAL_OPTIONS = ["Apto", "Pendiente de revisión", "No apto"];

const vehicleStatusClassByName = {
  Operativo: "vehicle-card--success",
  Inoperativo: "vehicle-card--danger",
};

const documentToneByStatus = {
  Vigente: "status--success",
  "Próximo a vencer": "status--warning",
  Pendiente: "status--warning",
  Incidencia: "status--danger",
  Vencido: "status--danger",
};

let vehiclePersonAssignmentVehicleId = "";
let vehiclePersonAssignmentSearchTerm = "";
let vehiclePersonAssignmentPendingAction = null;
let vehicleDetailVehicleId = "";

// =========================
// Inicializacion y estado de vista
// =========================

function initVehicles() {
  renderVehiclesSummary();
  renderVehiclesList();
  initVehiclesFilters();
  initVehiclesModalControls();
  initVehiclePersonAssignmentControls();
  initVehiclePersonAssignmentConfirmationControls();
  initNewVehicleForm();
}

function refreshVehicles() {
  renderVehiclesSummary();
  renderVehiclesList();
}

function showVehicles() {
  setText("page-eyebrow", "Módulo Vehículos");
  setText("page-title", "Veh\u00edculos");
  setText("page-summary", "Gestiona flota, documentaci\u00f3n, kilometraje, estado operativo y asignaciones.");
  setText("primary-action", "Nuevo veh\u00edculo");
  setModalTarget("primary-action", "new-vehicle-modal");
}

// =========================
// Render principal
// =========================

function renderVehiclesSummary() {
  const container = getElement("vehicles-summary");

  container.innerHTML = vehiclesData.summary
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

function renderVehiclesList() {
  const container = getElement("vehicles-list");

  const visibleVehicles = getFilteredVehicles();

  if (!visibleVehicles.length) {
    container.innerHTML = `<p class="empty-state">No hay vehículos que coincidan con los filtros seleccionados.</p>`;
    return;
  }

  container.innerHTML = visibleVehicles
    .map(({ vehicle, index }) => {
      const statusClass = vehicleStatusClassByName[vehicle.availability] || "vehicle-card--neutral";
      const assignmentAction = vehicle.driver === "Sin asignar" ? "Asignar" : "Cambiar";
      const driverAlertClass = vehicle.driver === "Sin asignar" ? " vehicle-card__driver--alert" : "";
      const isAssignable = isVehicleAssignableFromVehicles(vehicle);
      const assignedPerson = getVehicleAssignedPerson(vehicle);
      const canOpenAssignmentFlow = isAssignable || Boolean(assignedPerson);
      const assignmentDisabled = canOpenAssignmentFlow ? "" : " disabled aria-disabled=\"true\"";
      const assignmentTitle = canOpenAssignmentFlow
        ? ""
        : " title=\"Vehículo no apto para asignación\"";

      return `
        <article class="vehicle-card vehicles-list-grid ${statusClass}">
          <div class="vehicle-card__marker" aria-hidden="true"></div>
          <div class="vehicle-card__identity">
            <strong>${escapeHtml(vehicle.brand)}</strong>
            <span>${escapeHtml(vehicle.model)}</span>
          </div>
          <strong class="vehicle-card__plate">${escapeHtml(vehicle.plate)}</strong>
          <div class="vehicle-card__documentation">
            <span>${escapeHtml(vehicle.documentationStatus)}</span>
            <button class="button button--compact button--muted" type="button" data-vehicle-docs="${index}">Detalle</button>
          </div>
          <strong class="vehicle-card__service-km">${escapeHtml(vehicle.nextServiceKm)}</strong>
          <span class="vehicle-card__driver${driverAlertClass}">${escapeHtml(vehicle.driver)}</span>
          <div class="vehicle-card__actions">
            <button class="button button--compact button--muted" type="button" data-vehicle-detail="${index}">Detalle</button>
            <button class="button button--compact" type="button" data-vehicle-person-assign="${escapeHtml(vehicle.id)}"${assignmentDisabled}${assignmentTitle}>${assignmentAction}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function initVehiclesFilters() {
  const searchInput = getElement("vehicles-search");
  const clearButton = document.querySelector("[data-vehicles-clear]");

  if (searchInput) {
    searchInput.addEventListener("input", renderVehiclesList);
  }

  document.querySelectorAll("[data-vehicle-filter]").forEach((filter) => {
    filter.addEventListener("change", renderVehiclesList);
  });

  if (clearButton) {
    clearButton.addEventListener("click", clearVehicleFilters);
  }
}

function clearVehicleFilters() {
  document.querySelectorAll("[data-vehicle-filter]").forEach((filter) => {
    filter.checked = false;
  });

  renderVehiclesList();
}

function getFilteredVehicles() {
  const activeFilters = getActiveVehicleFilters();
  const searchTerm = normalizeForSearch(getInputValue("vehicles-search"));

  return vehiclesData.vehicles
    .map((vehicle, index) => ({ vehicle, index }))
    .filter(({ vehicle }) => {
      return matchesVehicleSearch(vehicle, searchTerm) && matchesVehicleFilters(vehicle, activeFilters);
    });
}

function getActiveVehicleFilters() {
  return Array.from(document.querySelectorAll("[data-vehicle-filter]:checked")).reduce(
    (filters, input) => {
      const type = input.dataset.vehicleFilter;

      if (filters[type]) {
        filters[type].push(input.value);
      }

      return filters;
    },
    {
      availability: [],
      documentation: [],
      assignment: [],
    },
  );
}

function matchesVehicleSearch(vehicle, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const searchableText = [
    vehicle.brand,
    vehicle.model,
    vehicle.plate,
    vehicle.driver,
    vehicle.assignedCollaboratorName,
  ].join(" ");

  return normalizeForSearch(searchableText).includes(searchTerm);
}

function matchesVehicleFilters(vehicle, filters) {
  return (
    matchesVehicleAvailabilityFilter(vehicle, filters.availability) &&
    matchesVehicleDocumentationFilter(vehicle, filters.documentation) &&
    matchesVehicleAssignmentFilter(vehicle, filters.assignment)
  );
}

function matchesVehicleAvailabilityFilter(vehicle, selectedValues) {
  if (!selectedValues.length) {
    return true;
  }

  return selectedValues.includes(vehicle.availability);
}

function matchesVehicleDocumentationFilter(vehicle, selectedValues) {
  if (!selectedValues.length) {
    return true;
  }

  const normalizedStatus = normalizeForSearch(vehicle.documentationStatus);

  return selectedValues.some((value) => {
    const normalizedValue = normalizeForSearch(value);

    if (normalizedValue === "pendiente") {
      return normalizedStatus === "pendiente" || normalizedStatus === "documentacion pendiente";
    }

    return normalizedStatus === normalizedValue;
  });
}

function matchesVehicleAssignmentFilter(vehicle, selectedValues) {
  if (!selectedValues.length) {
    return true;
  }

  const assignmentValues = getVehicleAssignmentFilterValues(vehicle);

  return selectedValues.some((value) => assignmentValues.includes(value));
}

function getVehicleAssignmentFilterValues(vehicle) {
  const hasCollaborator = Boolean(vehicle.assignedCollaboratorId);
  const hasLegacyDriver = Boolean(vehicle.driver && vehicle.driver !== "Sin asignar" && !hasCollaborator);

  return [
    hasLegacyDriver ? "with-driver" : "without-driver",
    hasCollaborator ? "with-collaborator" : "without-collaborator",
  ];
}

// =========================
// Modales
// =========================

function initVehiclesModalControls() {
  const detailModal = getElement(VEHICLE_DETAIL_MODAL_ID);
  const detailForm = getElement("vehicle-detail-edit-form");

  document.addEventListener("click", (event) => {
    const docsButton = event.target.closest("[data-vehicle-docs]");

    if (docsButton) {
      openVehicleDocsModal(docsButton.dataset.vehicleDocs);
      return;
    }

    const detailButton = event.target.closest("[data-vehicle-detail]");

    if (detailButton) {
      openVehicleDetailModal(detailButton.dataset.vehicleDetail);
      return;
    }

    const editButton = event.target.closest("#vehicle-detail-edit-button");

    if (editButton) {
      enterVehicleEditMode();
      return;
    }

    const cancelEditButton = event.target.closest("#vehicle-detail-cancel-edit");

    if (cancelEditButton) {
      exitVehicleEditMode();
      return;
    }

    const closeButton = event.target.closest("[data-modal-close]");

    if (
      (closeButton && closeButton.closest(`#${VEHICLE_DETAIL_MODAL_ID}`)) ||
      (event.target === detailModal && getElement("vehicle-detail-edit-form")?.hidden)
    ) {
      closeVehicleDetailModal();
    }
  });

  if (detailForm) {
    detailForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveVehicleDetailEdit();
    });

    detailForm.addEventListener("change", (event) => {
      if (event.target.id === "vehicle-edit-ownership") {
        syncVehicleEditOwnershipFields();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !detailModal || detailModal.hidden) {
      return;
    }

    if (!getElement("vehicle-detail-edit-form")?.hidden) {
      exitVehicleEditMode();
      return;
    }

    closeVehicleDetailModal();
  });
}

function initVehiclePersonAssignmentControls() {
  const searchInput = getElement("vehicle-person-assignment-search");
  const modal = getElement(VEHICLE_PERSON_ASSIGNMENT_MODAL_ID);

  document.addEventListener("click", (event) => {
    const assignmentButton = event.target.closest("[data-vehicle-person-assign]");
    const personButton = event.target.closest("[data-assign-vehicle-person]");
    const removeButton = event.target.closest("[data-remove-vehicle-person]");
    const closeButton = event.target.closest("[data-modal-close]");

    if (assignmentButton) {
      openVehiclePersonAssignmentModal(assignmentButton.dataset.vehiclePersonAssign);
      return;
    }

    if (personButton) {
      confirmVehiclePersonAssignment(personButton.dataset.assignVehiclePerson);
      return;
    }

    if (removeButton) {
      confirmRemoveVehiclePersonAssignment();
      return;
    }

    if ((closeButton && closeButton.closest(`#${VEHICLE_PERSON_ASSIGNMENT_MODAL_ID}`)) || event.target === modal) {
      closeVehiclePersonAssignmentModal();
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      vehiclePersonAssignmentSearchTerm = normalizeForSearch(searchInput.value);
      renderVehiclePersonAssignmentModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal) {
      closeVehiclePersonAssignmentModal();
    }
  });
}

function initVehiclePersonAssignmentConfirmationControls() {
  const modal = getElement(VEHICLE_PERSON_ASSIGNMENT_CONFIRM_MODAL_ID);
  const cancelButton = getElement("vehicle-person-assignment-confirm-cancel");
  const confirmButton = getElement("vehicle-person-assignment-confirm-action");

  if (!modal || !cancelButton || !confirmButton) {
    return;
  }

  cancelButton.addEventListener("click", closeVehiclePersonAssignmentConfirmationModal);

  confirmButton.addEventListener("click", () => {
    const pendingAction = vehiclePersonAssignmentPendingAction;

    closeVehiclePersonAssignmentConfirmationModal();

    if (typeof pendingAction === "function") {
      pendingAction();
    }
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeVehiclePersonAssignmentConfirmationModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVehiclePersonAssignmentConfirmationModal();
    }
  });
}

function initNewVehicleForm() {
  const form = getElement("new-vehicle-form");
  const modal = getElement(NEW_VEHICLE_MODAL_ID);

  if (!form || !modal) {
    return;
  }

  syncNewVehicleOwnershipFields();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    createNewVehicleFromForm();
  });

  form.addEventListener("change", (event) => {
    if (event.target.id === "new-vehicle-ownership") {
      syncNewVehicleOwnershipFields();
    }
  });

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest(`[data-modal-open="${NEW_VEHICLE_MODAL_ID}"]`);
    const closeButton = event.target.closest("[data-modal-close]");

    if (openButton) {
      resetNewVehicleForm();
      return;
    }

    if ((closeButton && closeButton.closest(`#${NEW_VEHICLE_MODAL_ID}`)) || event.target === modal) {
      resetNewVehicleForm();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      resetNewVehicleForm();
    }
  });
}

function openVehiclePersonAssignmentModal(vehicleId) {
  const vehicle = getVehicleById(vehicleId);

  if (!vehicle) {
    notifyVehiclesAction("No se pudo completar el cambio de asignación.", "error");
    return;
  }

  if (!isVehicleAssignableFromVehicles(vehicle) && !getVehicleAssignedPerson(vehicle)) {
    notifyVehiclesAction("Este vehículo no está apto para asignación.", "error");
    return;
  }

  vehiclePersonAssignmentVehicleId = vehicleId;
  vehiclePersonAssignmentSearchTerm = "";

  const searchInput = getElement("vehicle-person-assignment-search");

  if (searchInput) {
    searchInput.value = "";
  }

  renderVehiclePersonAssignmentModal();
  openModal(VEHICLE_PERSON_ASSIGNMENT_MODAL_ID);
}

function renderVehiclePersonAssignmentModal() {
  const vehicle = getVehicleById(vehiclePersonAssignmentVehicleId);
  const list = getElement("vehicle-person-assignment-list");
  const removeButton = getElement("vehicle-person-assignment-remove");
  const searchInput = getElement("vehicle-person-assignment-search");
  const searchField = searchInput ? searchInput.closest(".field") : null;

  if (!vehicle || !list) {
    return;
  }

  const assignedPerson = getVehicleAssignedPerson(vehicle);
  const isAssignable = isVehicleAssignableFromVehicles(vehicle);
  const assignablePeople = isAssignable ? getAssignablePeople().filter(matchesVehiclePersonAssignmentSearch) : [];

  setText(
    "vehicle-person-assignment-vehicle",
    `Vehículo seleccionado: ${vehicle.brand} ${vehicle.model} · ${vehicle.plate}`,
  );
  setText(
    "vehicle-person-assignment-current",
    `Asignado actualmente a: ${assignedPerson ? assignedPerson.name : "Sin asignar"}`,
  );

  if (removeButton) {
    removeButton.hidden = !assignedPerson;
  }

  if (searchField) {
    searchField.hidden = !isAssignable;
  }

  if (!isAssignable && assignedPerson) {
    list.innerHTML =
      '<p class="vehicle-person-assignment-empty">Este vehículo no está apto para nuevas asignaciones. Solo puedes quitar la asignación actual.</p>';
    return;
  }

  list.innerHTML = assignablePeople.length
    ? assignablePeople.map((person) => renderVehiclePersonAssignmentItem(person, vehicle)).join("")
    : '<p class="vehicle-person-assignment-empty">No hay personas asignables con este criterio.</p>';
}

function renderVehiclePersonAssignmentItem(person, vehicle) {
  const isCurrent = getPersonVehicleId(person) === vehicle.id;
  const typeLabel = getPersonTypeLabel(person);
  const actionLabel = isCurrent ? "Actual" : "Asignar";
  const disabled = isCurrent ? " disabled aria-disabled=\"true\"" : "";

  return `
    <article class="vehicle-person-assignment-item">
      <div class="vehicle-person-assignment-item__content">
        <strong>${escapeHtml(person.name)} - ${escapeHtml(typeLabel)}</strong>
        <span>${escapeHtml(getPersonVehicleAssignmentText(person, vehicle))}</span>
      </div>
      <button class="button button--compact${isCurrent ? " button--muted" : ""}" type="button" data-assign-vehicle-person="${escapeHtml(person.id)}"${disabled}>${actionLabel}</button>
    </article>
  `;
}

function confirmVehiclePersonAssignment(personId) {
  const vehicle = getVehicleById(vehiclePersonAssignmentVehicleId);
  const person = getPersonById(personId);

  if (!vehicle || !person || !isVehicleAssignableFromVehicles(vehicle)) {
    notifyVehiclesAction("No se pudo completar el cambio de asignación.", "error");
    return;
  }

  if (getPersonVehicleId(person) === vehicle.id) {
    return;
  }

  const currentPerson = getVehicleAssignedPerson(vehicle);
  const confirmationContent = getVehiclePersonAssignmentConfirmationContent(vehicle, person, currentPerson);

  openVehiclePersonAssignmentConfirmationModal({
    ...confirmationContent,
    onConfirm: () => assignVehicleToPerson(vehicle, person, currentPerson),
  });
}

function confirmRemoveVehiclePersonAssignment() {
  const vehicle = getVehicleById(vehiclePersonAssignmentVehicleId);
  const currentPerson = vehicle ? getVehicleAssignedPerson(vehicle) : null;

  if (!vehicle || !currentPerson) {
    notifyVehiclesAction("No se pudo completar el cambio de asignación.", "error");
    return;
  }

  openVehiclePersonAssignmentConfirmationModal({
    title: "Quitar asignación",
    message: `Vas a quitar la asignación de este vehículo a ${currentPerson.name}.`,
    confirmLabel: "Quitar asignación",
    onConfirm: () => removeVehiclePersonAssignment(vehicle, currentPerson),
  });
}

function openVehicleDocsModal(vehicleIndex) {
  const vehicle = vehiclesData.vehicles[Number(vehicleIndex)];

  if (!vehicle) {
    return;
  }

  const maintenance = vehicle.maintenance || {};

  setText("vehicle-docs-title", `${vehicle.brand} ${vehicle.model}`);
  setText("vehicle-docs-plate", vehicle.plate);
  setText("vehicle-docs-brand", vehicle.brand);
  setText("vehicle-docs-model", vehicle.model);
  setText("vehicle-docs-current-km", vehicle.currentKm);
  setText("vehicle-docs-next-km", vehicle.nextServiceKm);
  setText("vehicle-docs-last-maintenance", maintenance.last || "No indicado");
  setText("vehicle-docs-observations", maintenance.observations || "Sin observaciones.");

  const documentsList = getElement("vehicle-documents-list");
  documentsList.innerHTML = vehicle.documents
    .map((document) => {
      const tone = documentToneByStatus[document.status] || "status--neutral";
      const documentDetail = getVehicleDocumentDetail(document);

      return `
        <li class="vehicle-document-item">
          <strong>${escapeHtml(document.name)}</strong>
          <span>${escapeHtml(documentDetail)}</span>
          <small class="status-pill ${tone}">${escapeHtml(document.status)}</small>
        </li>
      `;
    })
    .join("");

  openModal("vehicle-docs-modal");
}

function openVehicleDetailModal(vehicleIndex) {
  const vehicle = vehiclesData.vehicles[Number(vehicleIndex)];

  if (!vehicle) {
    return;
  }

  vehicleDetailVehicleId = vehicle.id;
  renderVehicleDetailView(vehicle);
  setVehicleDetailMode(false);
  openModal(VEHICLE_DETAIL_MODAL_ID);
}

function openVehicleDetailById(vehicleId) {
  const vehicleIndex = vehiclesData.vehicles.findIndex((vehicle) => vehicle.id === vehicleId);

  if (vehicleIndex >= 0) {
    openVehicleDetailModal(vehicleIndex);
  }
}

function renderVehicleDetailView(vehicle) {
  const maintenance = vehicle.maintenance || {};

  setText("vehicle-detail-title", `${vehicle.brand} ${vehicle.model}`);
  setText("vehicle-detail-description", "Datos de flota, asignación, documentación y estado operativo.");
  setText("vehicle-detail-brand", vehicle.brand);
  setText("vehicle-detail-model", vehicle.model);
  setText("vehicle-detail-plate", vehicle.plate);
  setText("vehicle-detail-color", vehicle.color);
  setText("vehicle-detail-year", vehicle.year);
  setText("vehicle-detail-seats", vehicle.seats);
  setText("vehicle-detail-current-km", vehicle.currentKm);
  setText("vehicle-detail-ownership", vehicle.ownership || "Propio");
  setText("vehicle-detail-status", vehicle.availability);
  setVehicleDetailOperationalStatusCardClass(vehicle, true);
  setText("vehicle-detail-driver", vehicle.driver);
  setText("vehicle-detail-assignment-date", vehicle.assignmentDate);
  setText("vehicle-detail-assignment-notes", vehicle.notes);
  setText("vehicle-detail-documentation", vehicle.documentationStatus);
  setText("vehicle-detail-next-expiration", getNextImportantExpiration(vehicle));
  setText("vehicle-detail-next-km", vehicle.nextServiceKm);
  setText("vehicle-detail-last-maintenance", maintenance.last || "No indicado");
  setText("vehicle-detail-maintenance-notes", maintenance.observations || "Sin observaciones.");
  setText("vehicle-detail-inactive-cause", vehicle.inactiveCause || "No aplica");
}

function enterVehicleEditMode() {
  const vehicle = getVehicleDetailVehicle();

  if (!vehicle) {
    return;
  }

  clearVehicleEditValidation();
  populateVehicleEditForm(vehicle);
  syncVehicleEditOwnershipFields();
  setVehicleDetailMode(true);
}

function exitVehicleEditMode() {
  const vehicle = getVehicleDetailVehicle();

  clearVehicleEditValidation();

  if (vehicle) {
    renderVehicleDetailView(vehicle);
  }

  setVehicleDetailMode(false);
}

function closeVehicleDetailModal() {
  const modal = getElement(VEHICLE_DETAIL_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  vehicleDetailVehicleId = "";
  clearVehicleEditValidation();
  setVehicleDetailMode(false);
}

function setVehicleDetailMode(isEditing) {
  const view = getElement("vehicle-detail-view");
  const form = getElement("vehicle-detail-edit-form");
  const viewActions = getElement("vehicle-detail-view-actions");
  const editActions = getElement("vehicle-detail-edit-actions");

  if (isEditing) {
    clearVehicleDetailOperationalStatusCardClass();
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

  if (isEditing) {
    setText("vehicle-detail-title", "Editar vehículo");
    setText("vehicle-detail-description", "Actualiza los datos editables del vehículo.");
  }
}

function setVehicleDetailOperationalStatusCardClass(vehicle, isViewMode) {
  const statusValue = getElement("vehicle-detail-status");
  const statusField = statusValue?.closest(".modal__field");
  const statusClassByName = {
    operativo: "status-card--success",
    inoperativo: "status-card--danger",
  };

  clearVehicleDetailOperationalStatusCardClass();

  if (isViewMode && statusField) {
    statusField.classList.add(statusClassByName[normalizeForSearch(vehicle.availability)] || "status-card--neutral");
  }
}

function clearVehicleDetailOperationalStatusCardClass() {
  const statusValue = getElement("vehicle-detail-status");
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

function populateVehicleEditForm(vehicle) {
  const vehicleData = getVehicleEditInitialData(vehicle);

  Object.entries({
    "vehicle-edit-brand": vehicleData.brand,
    "vehicle-edit-model": vehicleData.model,
    "vehicle-edit-plate": vehicleData.plate,
    "vehicle-edit-color": vehicleData.color,
    "vehicle-edit-year": vehicleData.year,
    "vehicle-edit-seats": vehicleData.seats,
    "vehicle-edit-current-km": vehicleData.currentKm,
    "vehicle-edit-ownership": vehicleData.ownership,
    "vehicle-edit-insurer": vehicleData.insurer,
    "vehicle-edit-policy": vehicleData.policy,
    "vehicle-edit-insurance-expiration": vehicleData.insuranceExpiration,
    "vehicle-edit-itv-expiration": vehicleData.itvExpiration,
    "vehicle-edit-circulation-permit": vehicleData.circulationPermit,
    "vehicle-edit-vtc-reference": vehicleData.vtcReference,
    "vehicle-edit-vtc-expiration": vehicleData.vtcExpiration,
    "vehicle-edit-next-service-km": vehicleData.nextServiceKm,
    "vehicle-edit-last-maintenance": vehicleData.lastMaintenance,
    "vehicle-edit-maintenance-observations": vehicleData.maintenanceObservations,
    "vehicle-edit-visual-check": vehicleData.visualCheck,
    "vehicle-edit-elara-approval": vehicleData.elaraApproval,
    "vehicle-edit-review-observations": vehicleData.reviewObservations,
  }).forEach(([fieldId, value]) => {
    setVehicleEditFieldValue(fieldId, value);
  });
}

function getVehicleEditInitialData(vehicle) {
  const insuranceDocument = getVehicleDocumentByName(vehicle, "Seguro");
  const itvDocument = getVehicleDocumentByName(vehicle, "ITV");
  const circulationDocument = getVehicleDocumentByName(vehicle, "Permiso de circulación");
  const vtcDocument = getVehicleDocumentByName(vehicle, "Licencia VTC");
  const externalReview = vehicle.externalReview || {};
  const maintenance = vehicle.maintenance || {};

  return {
    brand: vehicle.brand || "",
    model: vehicle.model || "",
    plate: vehicle.plate || "",
    color: vehicle.color || "",
    year: vehicle.year || "",
    seats: vehicle.seats || "",
    currentKm: getVehicleEditableKmValue(vehicle.currentKm),
    ownership: VEHICLE_OWNERSHIP_OPTIONS.includes(vehicle.ownership) ? vehicle.ownership : "Propio",
    insurer: getVehicleEditableInsuranceCompany(insuranceDocument, vehicle),
    policy: getVehicleEditableOptionalValue(insuranceDocument && insuranceDocument.policy),
    insuranceExpiration: getVehicleEditableDateValue(insuranceDocument && insuranceDocument.expires),
    itvExpiration: getVehicleEditableDateValue(itvDocument && itvDocument.expires),
    circulationPermit: getVehicleEditableCirculationPermit(circulationDocument),
    vtcReference: getVehicleEditableOptionalValue(vtcDocument && vtcDocument.reference),
    vtcExpiration: getVehicleEditableDateValue(vtcDocument && vtcDocument.expires),
    nextServiceKm: getVehicleEditableKmValue(vehicle.nextServiceKm),
    lastMaintenance: maintenance.last === "No aplica" ? "" : maintenance.last || "",
    maintenanceObservations: maintenance.observations || "",
    visualCheck: VEHICLE_VISUAL_CHECK_OPTIONS.includes(externalReview.visualCheck) ? externalReview.visualCheck : "Pendiente",
    elaraApproval: VEHICLE_ELARA_APPROVAL_OPTIONS.includes(externalReview.approvalStatus)
      ? externalReview.approvalStatus
      : "Pendiente de revisión",
    reviewObservations: externalReview.observations || "",
  };
}

function saveVehicleDetailEdit() {
  const vehicle = getVehicleDetailVehicle();

  if (!vehicle) {
    return;
  }

  const vehicleData = getVehicleEditFormData();
  const validationError = getVehicleEditValidationError(vehicleData);

  clearVehicleEditValidation();

  if (validationError) {
    markVehicleEditInvalidField(validationError.fieldId);
    notifyVehiclesAction(validationError.message, "error");
    return;
  }

  try {
    updateVehicleFromEditForm(vehicle, vehicleData);
    syncVehiclesSummaryMetrics();
    renderVehiclesSummary();
    renderVehiclesList();
    renderVehicleDetailView(vehicle);
    setVehicleDetailMode(false);
    notifyVehiclesAction("Los cambios del vehículo se guardaron correctamente.", "success");
  } catch (error) {
    notifyVehiclesAction("No se pudieron guardar los cambios del vehículo.", "error");
  }
}

function getVehicleEditFormData() {
  const currentVehicle = getVehicleDetailVehicle();
  const currentVtcDocument = currentVehicle ? getVehicleDocumentByName(currentVehicle, "Licencia VTC") : null;
  const vtcExpiration = getInputValue("vehicle-edit-vtc-expiration");

  return {
    brand: normalizeNominativeText(getInputValue("vehicle-edit-brand")),
    model: normalizeNominativeText(getInputValue("vehicle-edit-model")),
    plate: getInputValue("vehicle-edit-plate"),
    color: normalizeNominativeText(getInputValue("vehicle-edit-color")),
    year: getInputValue("vehicle-edit-year"),
    seats: getInputValue("vehicle-edit-seats"),
    currentKm: getInputValue("vehicle-edit-current-km"),
    ownership: getInputValue("vehicle-edit-ownership") || "Propio",
    insurer: normalizeNominativeText(getInputValue("vehicle-edit-insurer")),
    policy: getInputValue("vehicle-edit-policy"),
    insuranceExpiration: getInputValue("vehicle-edit-insurance-expiration"),
    itvExpiration: getInputValue("vehicle-edit-itv-expiration"),
    circulationPermit: getInputValue("vehicle-edit-circulation-permit"),
    vtcReference: getInputValue("vehicle-edit-vtc-reference"),
    vtcExpiration,
    vtcExpirationNotApplicable: !vtcExpiration && isVehicleDocumentNotApplicable(currentVtcDocument),
    nextServiceKm: getInputValue("vehicle-edit-next-service-km"),
    lastMaintenance: getInputValue("vehicle-edit-last-maintenance"),
    maintenanceObservations: getInputValue("vehicle-edit-maintenance-observations"),
    visualCheck: getInputValue("vehicle-edit-visual-check"),
    elaraApproval: getInputValue("vehicle-edit-elara-approval"),
    reviewObservations: getInputValue("vehicle-edit-review-observations"),
  };
}

function getVehicleEditValidationError(vehicleData) {
  if (!vehicleData.brand) {
    return { fieldId: "vehicle-edit-brand", message: "Introduce la marca del vehículo." };
  }

  if (!vehicleData.model) {
    return { fieldId: "vehicle-edit-model", message: "Introduce el modelo del vehículo." };
  }

  if (!vehicleData.plate || !formatSpanishPlate(vehicleData.plate)) {
    return {
      fieldId: "vehicle-edit-plate",
      message: "La matrícula debe tener el formato 0000-MMM y usar solo consonantes válidas.",
    };
  }

  if (!vehicleData.color) {
    return { fieldId: "vehicle-edit-color", message: "Introduce el color del vehículo." };
  }

  if (!isVehicleEditYearValid(vehicleData.year)) {
    return { fieldId: "vehicle-edit-year", message: "Introduce un año válido para el vehículo." };
  }

  if (!isVehicleEditPositiveInteger(vehicleData.seats)) {
    return { fieldId: "vehicle-edit-seats", message: "Introduce un número de plazas válido." };
  }

  if (!VEHICLE_OWNERSHIP_OPTIONS.includes(vehicleData.ownership)) {
    return { fieldId: "vehicle-edit-ownership", message: "Selecciona una titularidad válida." };
  }

  if (vehicleData.currentKm && !isVehicleEditKmValueValid(vehicleData.currentKm)) {
    return { fieldId: "vehicle-edit-current-km", message: "Introduce un kilometraje actual válido." };
  }

  if (vehicleData.nextServiceKm && !isVehicleEditKmValueValid(vehicleData.nextServiceKm)) {
    return {
      fieldId: "vehicle-edit-next-service-km",
      message: "Introduce un próximo mantenimiento por kilometraje válido.",
    };
  }

  if (vehicleData.insuranceExpiration && !isVehicleEditDateValid(vehicleData.insuranceExpiration)) {
    return { fieldId: "vehicle-edit-insurance-expiration", message: "Introduce un vencimiento de seguro válido." };
  }

  if (vehicleData.itvExpiration && !isVehicleEditDateValid(vehicleData.itvExpiration)) {
    return { fieldId: "vehicle-edit-itv-expiration", message: "Introduce un vencimiento ITV válido." };
  }

  if (vehicleData.vtcExpiration && !isVehicleEditDateValid(vehicleData.vtcExpiration)) {
    return { fieldId: "vehicle-edit-vtc-expiration", message: "Introduce un vencimiento de Licencia VTC válido." };
  }

  if (!VEHICLE_CIRCULATION_PERMIT_OPTIONS.includes(vehicleData.circulationPermit)) {
    return { fieldId: "vehicle-edit-circulation-permit", message: "Selecciona un permiso de circulación válido." };
  }

  if (vehicleData.ownership === "Externo" && !VEHICLE_VISUAL_CHECK_OPTIONS.includes(vehicleData.visualCheck)) {
    return { fieldId: "vehicle-edit-visual-check", message: "Selecciona un chequeo visual ELARA válido." };
  }

  if (vehicleData.ownership === "Externo" && !VEHICLE_ELARA_APPROVAL_OPTIONS.includes(vehicleData.elaraApproval)) {
    return { fieldId: "vehicle-edit-elara-approval", message: "Selecciona un estado de aprobación ELARA válido." };
  }

  return null;
}

function updateVehicleFromEditForm(vehicle, vehicleData) {
  const documentationStatus = getNewVehicleDocumentationStatus(vehicleData);
  const availability = getNewVehicleAvailability(documentationStatus);

  vehicle.brand = vehicleData.brand;
  vehicle.model = vehicleData.model;
  vehicle.plate = formatSpanishPlate(vehicleData.plate);
  vehicle.color = vehicleData.color;
  vehicle.year = vehicleData.year;
  vehicle.seats = vehicleData.seats;
  vehicle.currentKm = normalizeKmText(vehicleData.currentKm) || "Sin indicar";
  vehicle.nextServiceKm = getNewVehicleNextServiceKm(vehicleData);
  vehicle.ownership = vehicleData.ownership;
  vehicle.documentationStatus = documentationStatus;
  vehicle.availability = availability;
  vehicle.inactiveCause = availability === "Inoperativo" ? getNewVehicleInactiveCause(documentationStatus) : "";
  vehicle.documents = buildNewVehicleDocuments(vehicleData);

  if (vehicleData.ownership === "Propio") {
    vehicle.maintenance = buildNewVehicleMaintenance(vehicleData);
  } else {
    vehicle.externalReview = buildNewVehicleExternalReview(vehicleData);
  }
}

function syncVehicleEditOwnershipFields() {
  const ownership = getInputValue("vehicle-edit-ownership") || "Propio";
  const ownedFields = getElement("vehicle-edit-owned-fields");
  const externalFields = getElement("vehicle-edit-external-fields");

  if (ownedFields) {
    ownedFields.hidden = ownership !== "Propio";
  }

  if (externalFields) {
    externalFields.hidden = ownership !== "Externo";
  }
}

function getVehicleDetailVehicle() {
  return vehicleDetailVehicleId ? getVehicleById(vehicleDetailVehicleId) : null;
}

function getVehicleDocumentByName(vehicle, documentName) {
  const normalizedDocumentName = normalizeForSearch(documentName);

  return vehicle && Array.isArray(vehicle.documents)
    ? vehicle.documents.find((document) => normalizeForSearch(document.name) === normalizedDocumentName) || null
    : null;
}

function setVehicleEditFieldValue(fieldId, value) {
  const field = getElement(fieldId);

  if (field) {
    field.value = value || "";
  }
}

function getVehicleEditableDateValue(value) {
  if (!value || value === "-" || normalizeForSearch(value) === "no aplica") {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function getVehicleEditableKmValue(value) {
  const normalizedValue = normalizeForSearch(value);

  if (!value || normalizedValue === "sin indicar" || normalizedValue === "sin programar" || normalizedValue === "no aplica") {
    return "";
  }

  return value;
}

function getVehicleEditableOptionalValue(value) {
  const normalizedValue = normalizeForSearch(value);

  return !value || normalizedValue === "no indicada" || normalizedValue === "pendiente" ? "" : value;
}

function getVehicleEditableInsuranceCompany(document, vehicle) {
  const company = document && document.company;
  const normalizedCompany = normalizeForSearch(company);

  if (company && normalizedCompany !== "pendiente") {
    return company;
  }

  if (
    document &&
    normalizeForSearch(document.status) !== "pendiente" &&
    normalizeForSearch(vehicle.documentationStatus) !== "pendiente"
  ) {
    return "No indicada";
  }

  return "";
}

function getVehicleEditableCirculationPermit(document) {
  if (!document) {
    return "Pendiente";
  }

  if (normalizeForSearch(document.status) === "vigente") {
    return "Disponible";
  }

  return VEHICLE_CIRCULATION_PERMIT_OPTIONS.includes(document.status) ? document.status : "Pendiente";
}

function isVehicleDocumentNotApplicable(document) {
  return Boolean(
    document &&
      normalizeForSearch(document.expires) === "no aplica" &&
      normalizeForSearch(document.status) === "vigente",
  );
}

function isVehicleEditYearValid(value) {
  const year = Number(value);

  return Number.isInteger(year) && year >= 1990 && year <= 2035;
}

function isVehicleEditPositiveInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0;
}

function isVehicleEditKmValueValid(value) {
  const normalizedValue = String(value).replace(/\bkm\b/gi, "").trim();

  return /^\d+(?:[.,]\d+)*$/.test(normalizedValue);
}

function isVehicleEditDateValid(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = parseDateInput(value);

  if (!match || !parsedDate) {
    return false;
  }

  return (
    parsedDate.getFullYear() === Number(match[1]) &&
    parsedDate.getMonth() + 1 === Number(match[2]) &&
    parsedDate.getDate() === Number(match[3])
  );
}

function clearVehicleEditValidation() {
  document.querySelectorAll("#vehicle-detail-edit-form .field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });

  document.querySelectorAll("#vehicle-detail-edit-form [aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
}

function markVehicleEditInvalidField(fieldId) {
  const field = getElement(fieldId);

  if (!field) {
    return;
  }

  field.setAttribute("aria-invalid", "true");
  field.closest(".field")?.classList.add("field--invalid");
  field.focus();
}

function openModal(modalId) {
  const modal = getElement(modalId);

  if (modal) {
    modal.hidden = false;
  }
}

function createNewVehicleFromForm() {
  const vehicleData = getNewVehicleFormData();
  const validationMessage = getNewVehicleValidationMessage(vehicleData);

  if (validationMessage) {
    notifyVehiclesAction(validationMessage, "error");
    return;
  }

  try {
    vehiclesData.vehicles.push(buildNewMockVehicle(vehicleData));
    syncVehiclesSummaryMetrics();
    renderVehiclesSummary();
    renderVehiclesList();
    closeNewVehicleModal();
    notifyVehiclesAction("Vehículo creado correctamente.", "success");
  } catch (error) {
    notifyVehiclesAction("No se pudo crear el vehículo.", "error");
  }
}

function getNewVehicleFormData() {
  return {
    brand: normalizeNominativeText(getInputValue("new-vehicle-brand")),
    model: normalizeNominativeText(getInputValue("new-vehicle-model")),
    plate: getInputValue("new-vehicle-plate"),
    color: normalizeNominativeText(getInputValue("new-vehicle-color")),
    year: getInputValue("new-vehicle-year"),
    seats: getInputValue("new-vehicle-seats"),
    currentKm: getInputValue("new-vehicle-current-km"),
    ownership: getInputValue("new-vehicle-ownership") || "Propio",
    insurer: normalizeNominativeText(getInputValue("new-vehicle-insurer")),
    policy: getInputValue("new-vehicle-policy"),
    insuranceExpiration: getInputValue("new-vehicle-insurance-expiration"),
    itvExpiration: getInputValue("new-vehicle-itv-expiration"),
    circulationPermit: getInputValue("new-vehicle-circulation-permit"),
    vtcReference: getInputValue("new-vehicle-vtc-reference"),
    vtcExpiration: getInputValue("new-vehicle-vtc-expiration"),
    nextServiceKm: getInputValue("new-vehicle-next-service-km"),
    lastMaintenance: getInputValue("new-vehicle-last-maintenance"),
    maintenanceObservations: getInputValue("new-vehicle-maintenance-observations"),
    visualCheck: getInputValue("new-vehicle-visual-check"),
    elaraApproval: getInputValue("new-vehicle-elara-approval"),
    reviewObservations: getInputValue("new-vehicle-review-observations"),
    notes: getInputValue("new-vehicle-notes"),
  };
}

function getNewVehicleValidationMessage(vehicleData) {
  if (!vehicleData.brand) {
    return "Introduce la marca del vehículo.";
  }

  if (!vehicleData.model) {
    return "Introduce el modelo del vehículo.";
  }

  if (!vehicleData.plate) {
    return "Introduce la matrícula del vehículo.";
  }

  if (!formatSpanishPlate(vehicleData.plate)) {
    return "La matrícula debe tener el formato 0000-MMM y usar solo consonantes válidas.";
  }

  if (!vehicleData.color) {
    return "Introduce el color del vehículo.";
  }

  if (!vehicleData.year) {
    return "Introduce el año del vehículo.";
  }

  if (!vehicleData.seats) {
    return "Introduce el número de plazas.";
  }

  if (!vehicleData.ownership) {
    return "Selecciona la titularidad del vehículo.";
  }

  return "";
}

function buildNewMockVehicle(vehicleData) {
  const documentationStatus = getNewVehicleDocumentationStatus(vehicleData);
  const availability = getNewVehicleAvailability(documentationStatus);
  const notes = vehicleData.notes || "Vehículo creado en mock, pendiente de revisión operativa.";

  return {
    id: getNextVehicleId(),
    brand: vehicleData.brand,
    model: vehicleData.model,
    plate: formatSpanishPlate(vehicleData.plate),
    color: vehicleData.color,
    year: vehicleData.year,
    seats: vehicleData.seats,
    currentKm: normalizeKmText(vehicleData.currentKm) || "Sin indicar",
    nextServiceKm: getNewVehicleNextServiceKm(vehicleData),
    ownership: vehicleData.ownership,
    availability,
    inactiveCause: availability === "Inoperativo" ? getNewVehicleInactiveCause(documentationStatus) : "",
    documentationStatus,
    assignedCollaboratorId: "",
    assignedCollaboratorName: "",
    driver: "Sin asignar",
    assignmentDate: "-",
    documents: buildNewVehicleDocuments(vehicleData),
    maintenance: buildNewVehicleMaintenance(vehicleData),
    externalReview: buildNewVehicleExternalReview(vehicleData),
    notes,
  };
}

function buildNewVehicleDocuments(vehicleData) {
  return [
    {
      name: "Seguro",
      expires: formatDateForDisplay(vehicleData.insuranceExpiration),
      status: getInsuranceDocumentStatus(vehicleData),
      company: vehicleData.insurer || "Pendiente",
      policy: vehicleData.policy || "No indicada",
    },
    {
      name: "ITV",
      expires: formatDateForDisplay(vehicleData.itvExpiration),
      status: getExpirationDocumentStatus(vehicleData.itvExpiration),
    },
    {
      name: "Permiso de circulación",
      expires: "Sin vencimiento",
      status: getCirculationPermitDocumentStatus(vehicleData.circulationPermit),
    },
    {
      name: "Licencia VTC",
      expires: vehicleData.vtcExpirationNotApplicable ? "No aplica" : formatDateForDisplay(vehicleData.vtcExpiration),
      status: vehicleData.vtcExpirationNotApplicable ? "Vigente" : getExpirationDocumentStatus(vehicleData.vtcExpiration),
      reference: vehicleData.vtcReference || "No indicada",
    },
  ];
}

function assignVehicleToPerson(vehicle, person, currentPerson) {
  try {
    const previousVehicleId = getPersonVehicleId(person);
    const hadCurrentPerson = Boolean(currentPerson && currentPerson.id !== person.id);
    const personHadOtherVehicle = Boolean(previousVehicleId && previousVehicleId !== vehicle.id);

    if (hadCurrentPerson) {
      currentPerson.vehicleId = null;
    }

    if (personHadOtherVehicle) {
      unassignVehicleById(previousVehicleId);
    }

    person.vehicleId = vehicle.id;
    setVehiclePersonAssignment(vehicle, person);
    renderAfterVehiclePersonAssignment();
    closeVehiclePersonAssignmentModal();
    notifyVehiclesAction(
      hadCurrentPerson || personHadOtherVehicle ? "Vehículo reasignado correctamente." : "Vehículo asignado correctamente.",
      "success",
    );
  } catch (error) {
    notifyVehiclesAction("No se pudo completar el cambio de asignación.", "error");
  }
}

function removeVehiclePersonAssignment(vehicle, person) {
  try {
    if (person && getPersonVehicleId(person) === vehicle.id) {
      person.vehicleId = null;
    }

    unassignVehicleById(vehicle.id);
    renderAfterVehiclePersonAssignment();
    closeVehiclePersonAssignmentModal();
    notifyVehiclesAction("Asignación quitada correctamente.", "success");
  } catch (error) {
    notifyVehiclesAction("No se pudo completar el cambio de asignación.", "error");
  }
}

function renderAfterVehiclePersonAssignment() {
  syncVehiclesSummaryMetrics();
  renderVehiclesSummary();
  renderVehiclesList();
  renderVehiclePersonAssignmentModal();

  if (window.ElaraCollaborators && typeof window.ElaraCollaborators.refreshCollaborators === "function") {
    window.ElaraCollaborators.refreshCollaborators();
  }
}

function openVehiclePersonAssignmentConfirmationModal({ title, message, confirmLabel, onConfirm }) {
  const modal = getElement(VEHICLE_PERSON_ASSIGNMENT_CONFIRM_MODAL_ID);
  const confirmButton = getElement("vehicle-person-assignment-confirm-action");

  if (!modal || !confirmButton || typeof onConfirm !== "function") {
    return;
  }

  setText("vehicle-person-assignment-confirm-title", title);
  setText("vehicle-person-assignment-confirm-message", message);
  confirmButton.textContent = confirmLabel;
  vehiclePersonAssignmentPendingAction = onConfirm;
  modal.hidden = false;
}

function closeVehiclePersonAssignmentConfirmationModal() {
  const modal = getElement(VEHICLE_PERSON_ASSIGNMENT_CONFIRM_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  vehiclePersonAssignmentPendingAction = null;
}

function closeVehiclePersonAssignmentModal() {
  const modal = getElement(VEHICLE_PERSON_ASSIGNMENT_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  vehiclePersonAssignmentVehicleId = "";
  vehiclePersonAssignmentSearchTerm = "";
}

function buildNewVehicleMaintenance(vehicleData) {
  if (vehicleData.ownership === "Externo") {
    return {
      last: "No aplica",
      observations: vehicleData.reviewObservations || "Revisión ELARA registrada.",
    };
  }

  return {
    last: vehicleData.lastMaintenance || "Sin mantenimiento registrado",
    observations: vehicleData.maintenanceObservations || "Sin observaciones internas.",
  };
}

function buildNewVehicleExternalReview(vehicleData) {
  if (vehicleData.ownership !== "Externo") {
    return null;
  }

  return {
    visualCheck: vehicleData.visualCheck || "Pendiente",
    approvalStatus: vehicleData.elaraApproval || "Pendiente de revisión",
    observations: vehicleData.reviewObservations || "Sin observaciones de revisión.",
  };
}

function getNewVehicleDocumentationStatus(vehicleData) {
  if (
    isExpirationDateExpired(vehicleData.insuranceExpiration) ||
    isExpirationDateExpired(vehicleData.itvExpiration) ||
    isExpirationDateExpired(vehicleData.vtcExpiration)
  ) {
    return "Vencida";
  }

  if (hasNewVehiclePendingDocumentation(vehicleData)) {
    return "Pendiente";
  }

  if (
    isExpirationDateUpcoming(vehicleData.insuranceExpiration) ||
    isExpirationDateUpcoming(vehicleData.itvExpiration) ||
    isExpirationDateUpcoming(vehicleData.vtcExpiration)
  ) {
    return "Próxima a vencer";
  }

  return "Al día";
}

function hasNewVehiclePendingDocumentation(vehicleData) {
  return (
    !vehicleData.insurer ||
    !vehicleData.insuranceExpiration ||
    !vehicleData.itvExpiration ||
    (!vehicleData.vtcExpiration && !vehicleData.vtcExpirationNotApplicable) ||
    vehicleData.circulationPermit !== "Disponible" ||
    (vehicleData.ownership === "Externo" && vehicleData.elaraApproval !== "Apto")
  );
}

function getNewVehicleAvailability(documentationStatus) {
  const normalizedDocumentationStatus = normalizeForSearch(documentationStatus);

  if (
    normalizedDocumentationStatus === "vencida" ||
    normalizedDocumentationStatus === "pendiente" ||
    normalizedDocumentationStatus === "documentacion pendiente"
  ) {
    return "Inoperativo";
  }

  return "Operativo";
}

function getNewVehicleInactiveCause(documentationStatus) {
  const normalizedDocumentationStatus = normalizeForSearch(documentationStatus);

  return normalizedDocumentationStatus === "vencida" ||
    normalizedDocumentationStatus === "pendiente" ||
    normalizedDocumentationStatus === "documentacion pendiente"
    ? "Documentación"
    : "Revisión";
}

function getInsuranceDocumentStatus(vehicleData) {
  if (isExpirationDateExpired(vehicleData.insuranceExpiration)) {
    return "Vencido";
  }

  if (!vehicleData.insurer || !vehicleData.insuranceExpiration) {
    return "Pendiente";
  }

  if (isExpirationDateUpcoming(vehicleData.insuranceExpiration)) {
    return "Próximo a vencer";
  }

  return "Vigente";
}

function getCirculationPermitDocumentStatus(value) {
  if (!value) {
    return "Pendiente";
  }

  return value === "Disponible" ? "Vigente" : value;
}

function getExpirationDocumentStatus(value) {
  if (isExpirationDateExpired(value)) {
    return "Vencido";
  }

  if (!value) {
    return "Pendiente";
  }

  if (isExpirationDateUpcoming(value)) {
    return "Próximo a vencer";
  }

  return "Vigente";
}

function isExpirationDateExpired(value) {
  const expirationDate = parseDateInput(value);

  if (!expirationDate) {
    return false;
  }

  return expirationDate < getTodayDateOnly();
}

function isExpirationDateUpcoming(value) {
  const expirationDate = parseDateInput(value);

  if (!expirationDate || isExpirationDateExpired(value)) {
    return false;
  }

  const millisecondsUntilExpiration = expirationDate.getTime() - getTodayDateOnly().getTime();
  const daysUntilExpiration = Math.ceil(millisecondsUntilExpiration / (1000 * 60 * 60 * 24));

  return daysUntilExpiration <= NEW_VEHICLE_UPCOMING_DOCUMENT_DAYS;
}

function getNewVehicleNextServiceKm(vehicleData) {
  if (vehicleData.ownership === "Externo") {
    return "No aplica";
  }

  return normalizeKmText(vehicleData.nextServiceKm) || "Sin programar";
}

function getCollaboratorsData() {
  return window.ElaraCollaboratorsMock && Array.isArray(window.ElaraCollaboratorsMock.collaborators)
    ? window.ElaraCollaboratorsMock
    : null;
}

function getAssignablePeople() {
  const collaboratorsData = getCollaboratorsData();

  if (!collaboratorsData) {
    return [];
  }

  return collaboratorsData.collaborators.filter((person) => {
    return person.administrativeStatus === "Activo" && getPersonOperationalStatus(person) !== "En servicio";
  });
}

function matchesVehiclePersonAssignmentSearch(person) {
  if (!vehiclePersonAssignmentSearchTerm) {
    return true;
  }

  const values = [person.name, getPersonTypeLabel(person), person.email, person.phone, person.baseCity];

  return normalizeForSearch(values.filter(Boolean).join(" ")).includes(vehiclePersonAssignmentSearchTerm);
}

function getVehicleById(vehicleId) {
  return vehiclesData.vehicles.find((vehicle) => vehicle.id === vehicleId) || null;
}

function getPersonById(personId) {
  const collaboratorsData = getCollaboratorsData();

  return collaboratorsData
    ? collaboratorsData.collaborators.find((person) => person.id === personId) || null
    : null;
}

function getVehicleAssignedPerson(vehicle) {
  const collaboratorsData = getCollaboratorsData();

  if (!collaboratorsData) {
    return null;
  }

  if (vehicle.assignedCollaboratorId) {
    return getPersonById(vehicle.assignedCollaboratorId);
  }

  const personByVehicle = collaboratorsData.collaborators.find(
    (person) => getPersonVehicleId(person) === vehicle.id,
  );

  if (personByVehicle) {
    return personByVehicle;
  }

  if (vehicle.driver && vehicle.driver !== "Sin asignar") {
    return collaboratorsData.collaborators.find(
      (person) => normalizeForSearch(person.name) === normalizeForSearch(vehicle.driver),
    );
  }

  return null;
}

function getVehiclePersonAssignmentConfirmationContent(vehicle, person, currentPerson) {
  const personVehicleId = getPersonVehicleId(person);

  if (personVehicleId && personVehicleId !== vehicle.id) {
    return {
      title: "Sustituir vehículo",
      message: `${person.name} ya tiene un vehículo asignado. Si continúas, su vehículo actual quedará sin asignar.`,
      confirmLabel: "Sustituir vehículo",
    };
  }

  if (currentPerson && currentPerson.id !== person.id) {
    return {
      title: "Confirmar reasignación",
      message: `Vas a reasignar este vehículo de ${currentPerson.name} a ${person.name}.`,
      confirmLabel: "Reasignar vehículo",
    };
  }

  return {
    title: "Confirmar asignación",
    message: `Vas a asignar este vehículo a ${person.name}.`,
    confirmLabel: "Asignar vehículo",
  };
}

function getPersonVehicleAssignmentText(person, vehicle) {
  const personVehicle = getPersonVehicle(person);

  if (personVehicle && personVehicle.id === vehicle.id) {
    return "Asignado actualmente a este vehículo";
  }

  if (personVehicle) {
    return `Vehículo actual: ${personVehicle.brand} ${personVehicle.model} · ${personVehicle.plate}`;
  }

  return "Sin vehículo asignado";
}

function getPersonTypeLabel(person) {
  return person.type || person.role || "Colaborador";
}

function getPersonOperationalStatus(person) {
  return person.operationalStatus || person.availability || "No disponible";
}

function getPersonVehicleId(person) {
  if (!person) {
    return null;
  }

  return person.vehicleId || (person.vehicle && person.vehicle.id) || null;
}

function getPersonVehicle(person) {
  const vehicleId = getPersonVehicleId(person);

  return vehicleId ? getVehicleById(vehicleId) : null;
}

function isVehicleAssignableFromVehicles(vehicle) {
  const validDocumentationStatuses = ["al dia", "proxima a vencer"];

  return (
    vehicle.availability === "Operativo" &&
    validDocumentationStatuses.includes(normalizeForSearch(vehicle.documentationStatus))
  );
}

function setVehiclePersonAssignment(vehicle, person) {
  vehicle.assignedCollaboratorId = person.id;
  vehicle.assignedCollaboratorName = person.name;
  vehicle.driver = person.name;
  vehicle.assignmentDate = getTodayDisplayDate();
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

function getNextVehicleId() {
  const nextNumber =
    vehiclesData.vehicles.reduce((highestNumber, vehicle) => {
      const match = String(vehicle.id || "").match(/^VH-(\d+)$/);
      const number = match ? Number(match[1]) : 0;

      return Math.max(highestNumber, number);
    }, 0) + 1;

  return `VH-${String(nextNumber).padStart(3, "0")}`;
}

function syncVehiclesSummaryMetrics() {
  const total = vehiclesData.vehicles.length;
  const operational = vehiclesData.vehicles.filter((vehicle) => vehicle.availability === "Operativo").length;
  const assigned = vehiclesData.vehicles.filter((vehicle) => vehicle.assignedCollaboratorId).length;
  const inoperative = vehiclesData.vehicles.filter((vehicle) => vehicle.availability === "Inoperativo").length;
  const metricValues = [total, operational, assigned, inoperative];

  vehiclesData.summary.forEach((metric, index) => {
    metric.value = String(metricValues[index]);
  });
}

function syncNewVehicleOwnershipFields() {
  const ownership = getInputValue("new-vehicle-ownership") || "Propio";
  const ownedFields = getElement("new-vehicle-owned-fields");
  const externalFields = getElement("new-vehicle-external-fields");

  if (ownedFields) {
    ownedFields.hidden = ownership !== "Propio";
  }

  if (externalFields) {
    externalFields.hidden = ownership !== "Externo";
  }
}

function closeNewVehicleModal() {
  const modal = getElement(NEW_VEHICLE_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  resetNewVehicleForm();
}

function resetNewVehicleForm() {
  const form = getElement("new-vehicle-form");

  if (form) {
    form.reset();
  }

  syncNewVehicleOwnershipFields();
}

function notifyVehiclesAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

// =========================
// Utilidades internas
// =========================

function getNextImportantExpiration(vehicle) {
  const relevantDocument = vehicle.documents.find((document) => document.status !== "Vigente");

  if (!relevantDocument) {
    return "Sin vencimientos críticos";
  }

  return `${relevantDocument.name}: ${relevantDocument.expires}`;
}

function getVehicleDocumentDetail(document) {
  const metadata = [document.company, document.policy, document.reference].filter(Boolean);

  if (!metadata.length) {
    return document.expires;
  }

  return `${document.expires} · ${metadata.join(" · ")}`;
}

function getElement(id) {
  return document.getElementById(id);
}

function getInputValue(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}

function normalizeNominativeText(value) {
  return value.replace(/(^|[\s-])([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, (match, prefix, letter) => {
    return `${prefix}${letter.toLocaleUpperCase("es-ES")}`;
  });
}

function formatSpanishPlate(value) {
  const match = value.trim().toUpperCase().match(/^(\d{4})[\s-]?([BCDFGHJKLMNPRSTVWXYZ]{3})$/);

  if (!match) {
    return "";
  }

  return `${match[1]}-${match[2]}`;
}

function normalizeForSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getTodayDisplayDate() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();

  return `${day}/${month}/${year}`;
}

function normalizeKmText(value) {
  if (!value) {
    return "";
  }

  return /\bkm\b/i.test(value) ? value : `${value} km`;
}

function formatDateForDisplay(value) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function getTodayDateOnly() {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

window.ElaraVehicles = {
  initVehicles,
  openVehicleDetailById,
  refreshVehicles,
  showVehicles,
};
