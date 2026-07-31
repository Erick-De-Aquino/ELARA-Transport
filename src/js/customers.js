/*
  Proyecto Atlas / ELARA Transport
  Archivo: customers.js
  Responsabilidad: renderizado y logica de la pantalla Clientes.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const customersData = window.ElaraCustomersMock;
const NEW_CUSTOMER_MODAL_ID = "new-customer-modal";
const CUSTOMER_DETAIL_MODAL_ID = "customer-detail-modal";
const newCustomerTypes = ["Particular", "Empresa"];
const newCustomerStatuses = ["Nuevo", "Activo", "Bloqueado"];
const CUSTOMER_UPCOMING_SERVICE_STATUSES = ["Pendiente", "Confirmado"];
const CUSTOMER_NEXT_SERVICE_CLOSED_STATUSES = ["Finalizado", "Cancelado", "No show", "No realizado"];

const customerStatusClassByName = {
  Activo: "customer-card--success",
  Nuevo: "customer-card--warning",
  Bloqueado: "customer-card--danger",
};
const reportedUnexpectedCustomerStatuses = new Set();

let selectedNewCustomerType = "";
let pendingNewCustomerType = "";
let customerDetailCustomerIndex = null;
let customerHistoryCustomerIndex = null;
let newCustomerDuplicateCustomer = null;
let pendingCustomerStatusAction = "";
let isCustomerServicesUpdatedListenerRegistered = false;
let hasWarnedCustomerNextServiceLegacyFallback = false;

// =========================
// Inicializacion y estado de vista
// =========================

function initCustomers() {
  initCustomerServicesUpdatedListener();
  renderCustomersSummary();
  renderCustomersList();
  initCustomersModalControls();
  initCustomersFilterControls();
  initCustomersSearchControls();
}

function initCustomerServicesUpdatedListener() {
  if (isCustomerServicesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:services-updated", refreshCustomersFromServicesUpdate);
  window.addEventListener("elara:receivables-updated", refreshCustomersFromReceivablesUpdate);
  isCustomerServicesUpdatedListenerRegistered = true;
}

function refreshCustomersFromServicesUpdate() {
  refreshCustomersSummaryData();
  renderCustomersSummary();
  renderCustomersList();
  refreshOpenCustomerDetailFromServicesUpdate();
  refreshOpenCustomerHistoryFromServicesUpdate();
}

function refreshCustomersFromReceivablesUpdate() {
  refreshOpenCustomerDetailFromServicesUpdate();
}

function refreshOpenCustomerDetailFromServicesUpdate() {
  const modal = getElement(CUSTOMER_DETAIL_MODAL_ID);
  const customer = getCustomerDetailCustomer();

  if (!modal || modal.hidden || !customer || isCustomerDetailEditing()) {
    if (modal && !modal.hidden && customer) {
      updateCustomerServiceCountInContainer(modal, customer);
    }
    return;
  }

  renderCustomerDetailByType(customer);
}

function refreshOpenCustomerHistoryFromServicesUpdate() {
  const modal = getElement("customer-history-modal");
  const customer =
    customerHistoryCustomerIndex === null ? null : customersData.customers[customerHistoryCustomerIndex] || null;

  if (!modal || modal.hidden || !customer) {
    return;
  }

  renderCustomerHistoryModalContent(customer);
}

function updateCustomerServiceCountInContainer(container, customer) {
  const totalField = Array.from(container.querySelectorAll(".modal__field")).find((field) => {
    const label = field.querySelector(".modal__field-label");

    return normalizeCustomerSearchText(label?.textContent) === "total de servicios";
  });

  const value = totalField?.querySelector(".modal__field-value");

  if (value) {
    value.textContent = getCustomerDetailTotalServices(customer);
  }
}

function showCustomers() {
  setText("page-eyebrow", "Módulo Clientes");
  setText("page-title", "Clientes");
  setText("page-summary", "Gestiona personas, empresas, datos de contacto y relación operativa con ELARA.");
  setText("primary-action", "Nuevo cliente");
  setModalTarget("primary-action", "new-customer-modal");
}

// =========================
// Render principal
// =========================

function renderCustomersSummary() {
  const container = getElement("customers-summary");

  container.innerHTML = customersData.summary
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

function renderCustomersList() {
  const container = getElement("customers-list");
  const customers = getFilteredCustomers();

  if (!customers.length) {
    container.innerHTML = '<p class="customers-empty">No se encontraron clientes.</p>';
    return;
  }

  container.innerHTML = customers
    .map(({ customer, index }) => {
      const customerStatus = normalizeCustomerStatus(customer.status);
      const statusClass = customerStatusClassByName[customerStatus] || customerStatusClassByName.Bloqueado;
      const visibleName = getCustomerListDisplayName(customer);

      return `
        <article class="customer-card ${statusClass}">
          <div class="customer-card__marker" aria-hidden="true"></div>
          <div class="customer-card__identity">
            <button class="customer-card__code" type="button" data-customer-detail="${index}">${escapeHtml(customer.code)}</button>
            <button class="customer-card__name" type="button" data-customer-detail="${index}">${escapeHtml(visibleName)}</button>
          </div>
          <div class="customer-card__contact">
            <span>${escapeHtml(customer.phone)}</span>
            <span>${escapeHtml(customer.email)}</span>
          </div>
          <span class="customer-type-pill">${escapeHtml(customer.type)}</span>
          <strong class="customer-card__rating">${escapeHtml(getCustomerRatingLabel(customer))}</strong>
          <div class="customer-card__history">
            <button class="button button--compact button--muted" type="button" data-customer-history="${index}">Historial</button>
          </div>
          <strong class="customer-card__total">${escapeHtml(formatCustomerUpcomingServiceCount(customer))}</strong>
          <div class="customer-card__actions">
            <button class="button button--compact button--muted" type="button" data-customer-detail="${index}">Detalle</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getFilteredCustomers() {
  const searchTerm = normalizeCustomerSearchText(getInputValue("customers-search"));
  const activeFilters = getActiveCustomerListFilters();

  return customersData.customers
    .map((customer, index) => ({ customer, index }))
    .filter(({ customer }) => matchesCustomerListFilters(customer, activeFilters))
    .filter(({ customer }) => !searchTerm || getCustomerSearchHaystack(customer, searchTerm).includes(searchTerm));
}

function getActiveCustomerListFilters() {
  const filterMenu = document.querySelector("[data-customers-clear]")?.closest(".customer-filter__menu");
  const filters = {
    type: [],
    status: [],
    services: [],
  };

  if (!filterMenu) {
    return filters;
  }

  filterMenu.querySelectorAll(".customer-filter__group").forEach((group) => {
    const groupName = normalizeCustomerSearchText(group.querySelector("strong")?.textContent);
    const selectedLabels = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map((input) =>
      normalizeCustomerSearchText(input.closest("label")?.textContent),
    );

    if (groupName.includes("tipo")) {
      filters.type = selectedLabels;
    } else if (groupName.includes("estado")) {
      filters.status = selectedLabels;
    } else if (groupName.includes("servicios")) {
      filters.services = selectedLabels;
    }
  });

  return filters;
}

function matchesCustomerListFilters(customer, filters) {
  const customerType = normalizeCustomerSearchText(customer.type);
  const customerStatus = normalizeCustomerSearchText(normalizeCustomerStatus(customer.status));
  const hasServices = getCustomerServiceCount(customer) > 0;

  return (
    (!filters.type.length || filters.type.includes(customerType)) &&
    (!filters.status.length || filters.status.includes(customerStatus)) &&
    (!filters.services.length ||
      filters.services.some((filterValue) => (filterValue === "si" ? hasServices : filterValue === "no" ? !hasServices : true)))
  );
}

function getCustomerSearchHaystack(customer, searchTerm = "") {
  const searchableEmail = getCustomerSearchEmailValue(customer.email, searchTerm);
  const values =
    customer.type === "Empresa"
      ? [
          customer.code,
          customer.company,
          customer.companyName,
          customer.businessName,
          customer.tradeName,
          customer.name,
          customer.taxId,
          customer.mainContact,
          customer.phone,
          searchableEmail,
        ]
      : [
          customer.code,
          customer.firstName,
          customer.lastName,
          customer.name,
          `${customer.firstName || ""} ${customer.lastName || ""}`,
          customer.phone,
          searchableEmail,
        ];

  return normalizeCustomerSearchText(values.filter(Boolean).join(" "));
}

function getCustomerSearchEmailValue(email, searchTerm) {
  const emailValue = String(email || "").trim();

  if (!emailValue) {
    return "";
  }

  return searchTerm.length < 3 ? emailValue.split("@")[0] || emailValue : emailValue;
}

function normalizeCustomerSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCustomerStatus(status) {
  const normalizedStatus = normalizeCustomerSearchText(status);
  const statusByName = {
    nuevo: "Nuevo",
    activo: "Activo",
    bloqueado: "Bloqueado",
    pendiente: "Nuevo",
    suspendido: "Bloqueado",
    inactivo: "Bloqueado",
  };
  const definitiveStatus = statusByName[normalizedStatus];

  if (definitiveStatus) {
    return definitiveStatus;
  }

  reportUnexpectedCustomerStatus(status);
  return "Bloqueado";
}

function reportUnexpectedCustomerStatus(status) {
  const rawStatus = String(status || "").trim();

  if (!rawStatus || reportedUnexpectedCustomerStatuses.has(rawStatus) || window.ElaraDebugCustomers !== true) {
    return;
  }

  reportedUnexpectedCustomerStatuses.add(rawStatus);
  console.warn(`[ELARA Clientes] Estado de cliente no reconocido: ${rawStatus}`);
}

// =========================
// Modales
// =========================

function initCustomersModalControls() {
  const form = getElement("new-customer-form");
  const modal = getElement(NEW_CUSTOMER_MODAL_ID);

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      createNewCustomer();
    });

    form.addEventListener("change", (event) => {
      const typeInput = event.target.closest("[data-new-customer-type]");

      if (typeInput) {
        clearNewCustomerDuplicateNotice();
        selectNewCustomerType(typeInput.value);
      }
    });

    form.addEventListener("input", (event) => {
      if (
        event.target &&
        ["new-customer-email", "new-customer-tax-id", "new-customer-company-email"].includes(event.target.id)
      ) {
        clearNewCustomerDuplicateNotice();
      }
    });
  }

  document.addEventListener("submit", (event) => {
    if (event.target && event.target.id === "customer-detail-edit-form") {
      event.preventDefault();
      saveCustomerDetailEdit();
    }
  });

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest(`[data-modal-open="${NEW_CUSTOMER_MODAL_ID}"]`);
    const closeButton = event.target.closest("[data-modal-close]");
    const cancelTypeButton = event.target.closest("#new-customer-type-cancel");
    const acceptTypeButton = event.target.closest("#new-customer-type-accept");
    const duplicateCancelButton = event.target.closest("#new-customer-duplicate-cancel");
    const duplicateDetailButton = event.target.closest("#new-customer-duplicate-detail");
    const detailEditButton = event.target.closest("#customer-detail-edit-button");
    const detailCancelEditButton = event.target.closest("#customer-detail-cancel-edit");
    const lifecycleButton = event.target.closest("[data-customer-lifecycle-action]");
    const lifecycleCancelButton = event.target.closest("[data-customer-lifecycle-cancel]");
    const lifecycleConfirmButton = event.target.closest("[data-customer-lifecycle-confirm]");

    if (openButton) {
      resetNewCustomerForm();
      return;
    }

    if (detailEditButton) {
      enterCustomerEditMode();
      return;
    }

    if (detailCancelEditButton) {
      exitCustomerEditMode();
      return;
    }

    if (lifecycleButton) {
      openCustomerLifecycleConfirmation(lifecycleButton.dataset.customerLifecycleAction);
      return;
    }

    if (lifecycleCancelButton) {
      closeCustomerLifecycleConfirmation();
      return;
    }

    if (lifecycleConfirmButton) {
      confirmCustomerLifecycleAction();
      return;
    }

    if (cancelTypeButton) {
      cancelNewCustomerTypeChange();
      return;
    }

    if (acceptTypeButton) {
      confirmNewCustomerTypeChange();
      return;
    }

    if (duplicateCancelButton) {
      clearNewCustomerDuplicateNotice();
      return;
    }

    if (duplicateDetailButton) {
      openNewCustomerDuplicateDetail();
      return;
    }

    if ((closeButton && closeButton.closest(`#${NEW_CUSTOMER_MODAL_ID}`)) || event.target === modal) {
      resetNewCustomerForm();
      return;
    }

    if (closeButton && closeButton.closest(`#${CUSTOMER_DETAIL_MODAL_ID}`)) {
      closeCustomerDetailModal();
      return;
    }

    const historyButton = event.target.closest("[data-customer-history]");

    if (historyButton) {
      openCustomerHistoryModal(historyButton.dataset.customerHistory);
      return;
    }

    const receivablesButton = event.target.closest("[data-customer-receivables]");

    if (receivablesButton) {
      window.ElaraReceivables?.applyCustomerFilter?.(receivablesButton.dataset.customerReceivables);
      return;
    }

    const customerButton = event.target.closest("[data-customer-detail]");

    if (customerButton) {
      openCustomerDetailModal(customerButton.dataset.customerDetail);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      resetNewCustomerForm();
    }
  });
}

function selectNewCustomerType(customerType) {
  if (!newCustomerTypes.includes(customerType) || customerType === selectedNewCustomerType) {
    updateNewCustomerTypeControls();
    return;
  }

  if (selectedNewCustomerType && hasNewCustomerFormData()) {
    pendingNewCustomerType = customerType;
    updateNewCustomerTypeControls();
    showNewCustomerTypeConfirmation(true);
    return;
  }

  activateNewCustomerType(customerType);
}

function activateNewCustomerType(customerType) {
  selectedNewCustomerType = customerType;
  pendingNewCustomerType = "";
  clearNewCustomerFields();
  clearNewCustomerValidation();
  clearNewCustomerDuplicateNotice();
  updateNewCustomerTypeControls();
  showNewCustomerTypeConfirmation(false);
}

function cancelNewCustomerTypeChange() {
  pendingNewCustomerType = "";
  updateNewCustomerTypeControls();
  showNewCustomerTypeConfirmation(false);
}

function confirmNewCustomerTypeChange() {
  const nextType = pendingNewCustomerType;

  if (!newCustomerTypes.includes(nextType)) {
    cancelNewCustomerTypeChange();
    return;
  }

  activateNewCustomerType(nextType);
}

function createNewCustomer() {
  const customerData = getNewCustomerFormData();
  const validationMessage = validateNewCustomerForm(customerData);

  if (validationMessage) {
    notifyCustomersAction(validationMessage, "error");
    return;
  }

  const duplicateCustomer = findCustomerCreationDuplicate(customerData);

  if (duplicateCustomer) {
    showNewCustomerDuplicateNotice(duplicateCustomer);
    return;
  }

  addCustomerCreationRecord(buildNewCustomerRecord(customerData));
  closeNewCustomerModal();
  notifyCustomersAction(
    customerData.type === "Particular"
      ? "El cliente particular se creó correctamente."
      : "El cliente empresa se creó correctamente.",
    "success",
  );
}

function getNewCustomerFormData() {
  if (selectedNewCustomerType === "Particular") {
    return {
      type: "Particular",
      firstName: getCustomerInputValue("new-customer-first-name"),
      lastName: getCustomerInputValue("new-customer-last-name"),
      countryCode: getCustomerInputValue("new-customer-country-code"),
      phone: getCustomerInputValue("new-customer-phone"),
      email: getCustomerInputValue("new-customer-email"),
      status: "Nuevo",
      notes: getCustomerInputValue("new-customer-notes"),
      needs: getCustomerInputValue("new-customer-needs"),
    };
  }

  if (selectedNewCustomerType === "Empresa") {
    return {
      type: "Empresa",
      companyName: getCustomerInputValue("new-customer-company-name"),
      tradeName: getCustomerInputValue("new-customer-trade-name"),
      taxId: getCustomerInputValue("new-customer-tax-id"),
      mainContact: getCustomerInputValue("new-customer-main-contact"),
      status: "Nuevo",
      countryCode: getCustomerInputValue("new-customer-company-country-code"),
      phone: getCustomerInputValue("new-customer-company-phone"),
      email: getCustomerInputValue("new-customer-company-email"),
      billing: getCustomerInputValue("new-customer-billing"),
      notes: getCustomerInputValue("new-customer-company-notes"),
      needs: getCustomerInputValue("new-customer-company-needs"),
    };
  }

  return {
    type: "",
  };
}

function validateNewCustomerForm(customerData) {
  clearNewCustomerValidation();

  if (!newCustomerTypes.includes(customerData.type)) {
    return "Selecciona el tipo de cliente.";
  }

  const validationRules =
    customerData.type === "Particular"
      ? [
          {
            invalid: !customerData.firstName,
            fieldId: "new-customer-first-name",
            message: "Introduce el nombre del cliente.",
          },
          {
            invalid: !customerData.lastName,
            fieldId: "new-customer-last-name",
            message: "Introduce el apellido del cliente.",
          },
          {
            invalid: !customerData.countryCode,
            fieldId: "new-customer-country-code",
            message: "Introduce el código de país.",
          },
          {
            invalid: !customerData.phone,
            fieldId: "new-customer-phone",
            message: "Introduce el teléfono del cliente.",
          },
          {
            invalid: !customerData.email,
            fieldId: "new-customer-email",
            message: "Introduce el email del cliente.",
          },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            fieldId: "new-customer-email",
            message: "Introduce un email válido.",
          },
        ]
      : [
          {
            invalid: !customerData.companyName,
            fieldId: "new-customer-company-name",
            message: "Introduce la razón social.",
          },
          {
            invalid: !customerData.taxId,
            fieldId: "new-customer-tax-id",
            message: "Introduce el NIF/CIF.",
          },
          {
            invalid: !customerData.countryCode,
            fieldId: "new-customer-company-country-code",
            message: "Introduce el código de país.",
          },
          {
            invalid: !customerData.phone,
            fieldId: "new-customer-company-phone",
            message: "Introduce el teléfono de la empresa.",
          },
          {
            invalid: !customerData.email,
            fieldId: "new-customer-company-email",
            message: "Introduce el email de la empresa.",
          },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            fieldId: "new-customer-company-email",
            message: "Introduce un email válido.",
          },
        ];
  const failedRule = validationRules.find((rule) => rule.invalid);

  if (!failedRule) {
    return "";
  }

  markNewCustomerFieldInvalid(failedRule.fieldId);
  return failedRule.message;
}

function buildNewCustomerRecord(customerData) {
  const code = getNextCustomerCode(customerData.type);
  const commonRecord = {
    code,
    type: customerData.type,
    status: "Nuevo",
    rating: "Sin valoración",
    phone: `${customerData.countryCode} ${customerData.phone}`.trim(),
    email: customerData.email,
    totalServices: 0,
    lastService: null,
    nextService: null,
    preferences: {
      language: "",
      contact: "",
      notes: customerData.notes || "",
      needs: customerData.needs || "",
    },
    history: [],
    upcoming: [],
  };

  if (customerData.type === "Particular") {
    const firstName = normalizeNewCustomerName(customerData.firstName);
    const lastName = normalizeNewCustomerName(customerData.lastName);

    return {
      ...commonRecord,
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      company: null,
      taxId: null,
      billing: null,
      mainContact: null,
    };
  }

  const companyName = normalizeNewCustomerName(customerData.companyName);
  const tradeName = customerData.tradeName ? normalizeNewCustomerName(customerData.tradeName) : "";

  return {
    ...commonRecord,
    name: tradeName || companyName,
    company: companyName,
    tradeName,
    taxId: customerData.taxId,
    billing: customerData.billing || null,
    mainContact: customerData.mainContact ? normalizeNewCustomerName(customerData.mainContact) : null,
  };
}

function getNextCustomerCode(customerType) {
  const prefix = customerType === "Empresa" ? "EMP" : "CL";
  const nextNumber =
    customersData.customers.reduce((highestNumber, customer) => {
      const match = String(customer.code || "").match(new RegExp(`^${prefix}-(\\d+)$`));
      const number = match ? Number(match[1]) : 0;

      return Math.max(highestNumber, number);
    }, 0) + 1;

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
}

function addCustomerCreationRecord(customer) {
  if (customer) {
    customer.status = normalizeCustomerStatus(customer.status);
  }

  customersData.customers.push(customer);
  refreshCustomersSummaryData();
  renderCustomersSummary();
  renderCustomersList();

  return customer;
}

function getCustomerCreationStatuses() {
  return [...newCustomerStatuses];
}

function getCustomerCreationCustomers() {
  return customersData.customers;
}

function validateCustomerCreationData(customerData) {
  if (!newCustomerTypes.includes(customerData.type)) {
    return {
      field: "type",
      message: "Selecciona el tipo de cliente.",
    };
  }

  const validationRules =
    customerData.type === "Particular"
      ? [
          { invalid: !customerData.firstName, field: "firstName", message: "Introduce el nombre del cliente." },
          { invalid: !customerData.lastName, field: "lastName", message: "Introduce el apellido del cliente." },
          { invalid: !customerData.countryCode, field: "countryCode", message: "Introduce el código de país." },
          { invalid: !customerData.phone, field: "phone", message: "Introduce el teléfono del cliente." },
          { invalid: !customerData.email, field: "email", message: "Introduce el email del cliente." },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            field: "email",
            message: "Introduce un email válido.",
          },
        ]
      : [
          { invalid: !customerData.companyName, field: "companyName", message: "Introduce la razón social." },
          { invalid: !customerData.taxId, field: "taxId", message: "Introduce el NIF/CIF." },
          { invalid: !customerData.countryCode, field: "countryCode", message: "Introduce el código de país." },
          { invalid: !customerData.phone, field: "phone", message: "Introduce el teléfono de la empresa." },
          { invalid: !customerData.email, field: "email", message: "Introduce el email de la empresa." },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            field: "email",
            message: "Introduce un email válido.",
          },
        ];

  return validationRules.find((rule) => rule.invalid) || null;
}

function findCustomerCreationDuplicate(customerData) {
  if (customerData.type === "Particular") {
    const email = normalizeCustomerCreationEmail(customerData.email);

    if (!email) {
      return null;
    }

    return (
      customersData.customers.find(
        (customer) => customer.type === "Particular" && normalizeCustomerCreationEmail(customer.email) === email,
      ) || null
    );
  }

  if (customerData.type === "Empresa") {
    const taxId = normalizeCustomerCreationTaxId(customerData.taxId);

    if (!taxId) {
      return null;
    }

    return (
      customersData.customers.find(
        (customer) => customer.type === "Empresa" && normalizeCustomerCreationTaxId(customer.taxId) === taxId,
      ) || null
    );
  }

  return null;
}

function showNewCustomerDuplicateNotice(customer) {
  newCustomerDuplicateCustomer = customer;
  renderNewCustomerDuplicateNotice(customer);
  notifyCustomersAction("Este cliente ya está registrado.", "warning");
}

function clearNewCustomerDuplicateNotice() {
  newCustomerDuplicateCustomer = null;
  renderNewCustomerDuplicateNotice(null);
}

function renderNewCustomerDuplicateNotice(customer) {
  const container = getElement("new-customer-duplicate");

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
      <strong>Este cliente ya está registrado.</strong>
      <span>${escapeHtml(getCustomerDuplicateDisplayName(customer))}</span>
      <small>${escapeHtml(getCustomerDuplicateSecondaryInfo(customer))}</small>
    </div>
    <div class="new-customer-type-confirm__actions">
      <button class="button button--compact button--muted" id="new-customer-duplicate-cancel" type="button">Cancelar</button>
      <button class="button button--compact" id="new-customer-duplicate-detail" type="button">Ver cliente existente</button>
    </div>
  `;
}

function openNewCustomerDuplicateDetail() {
  if (!newCustomerDuplicateCustomer) {
    return;
  }

  const customerIndex = customersData.customers.indexOf(newCustomerDuplicateCustomer);

  if (customerIndex < 0) {
    clearNewCustomerDuplicateNotice();
    return;
  }

  closeNewCustomerModal();
  openCustomerDetailModal(customerIndex);
}

function getCustomerDuplicateDisplayName(customer) {
  return getCustomerDetailDisplayName(customer);
}

function getCustomerDuplicateSecondaryInfo(customer) {
  if (getCustomerDetailType(customer) === "Empresa") {
    return ["Empresa", customer.taxId ? `NIF/CIF: ${customer.taxId}` : "", customer.code].filter(Boolean).join(" / ");
  }

  return ["Particular", customer.email, customer.code].filter(Boolean).join(" / ");
}

function normalizeCustomerCreationEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCustomerCreationTaxId(taxId) {
  return String(taxId || "").trim().replace(/\s+/g, "").toLowerCase();
}

function refreshCustomersSummaryData() {
  updateCustomersSummaryMetric("Total clientes", customersData.customers.length);
  updateCustomersSummaryMetric(
    "Particulares",
    customersData.customers.filter((customer) => customer.type === "Particular").length,
  );
  updateCustomersSummaryMetric(
    "Empresas",
    customersData.customers.filter((customer) => customer.type === "Empresa").length,
  );
  updateCustomersSummaryMetric(
    "Con servicios este mes",
    customersData.customers.filter((customer) => getCustomerServiceCount(customer) > 0).length,
  );
  updateCustomersSummaryMetric(
    "Nuevos este mes",
    customersData.customers.filter((customer) => normalizeCustomerStatus(customer.status) === "Nuevo").length,
  );
}

function openCustomerDetailModal(customerIndex) {
  const customer = customersData.customers[Number(customerIndex)];

  if (!customer) {
    return;
  }

  customerDetailCustomerIndex = Number(customerIndex);
  setCustomerDetailMode(false);
  renderCustomerDetailByType(customer);

  const modal = getElement("customer-detail-modal");

  if (modal) {
    modal.hidden = false;
  }
}

function openCustomerDetailByCode(customerCode) {
  const customerIndex = customersData.customers.findIndex((customer) => customer.code === customerCode);

  if (customerIndex >= 0) {
    openCustomerDetailModal(customerIndex);
  }
}

function renderCustomerDetailByType(customer) {
  const type = getCustomerDetailType(customer);
  const content = getElement("customer-detail-content");

  setText("customer-detail-modal-title", getCustomerDetailDisplayName(customer));
  setText(
    "customer-detail-description",
    type === "Empresa" ? "Cliente empresa y resumen operativo." : "Cliente particular y resumen operativo.",
  );

  if (!content) {
    return;
  }

  content.innerHTML =
    type === "Empresa" ? renderCompanyCustomerDetail(customer) : renderParticularCustomerDetail(customer);
}

function renderParticularCustomerDetail(customer) {
  const phoneParts = getCustomerDetailPhoneParts(customer);

  return [
    renderCustomerDetailSection("Datos personales", [
      ["Código de cliente", customer.code],
      ["Nombre/s", getCustomerDetailFirstName(customer)],
      ["Apellido/s", getCustomerDetailLastName(customer)],
      ["Código de país", phoneParts.countryCode],
      ["Teléfono", phoneParts.phone],
      ["Email", customer.email],
      ["Tipo de cliente", getCustomerDetailType(customer)],
      ["Estado", normalizeCustomerStatus(customer.status)],
      ["Valoración", getCustomerRatingLabel(customer)],
    ]),
    renderCustomerDetailSection("Observaciones", [
      ["Observaciones internas", getCustomerDetailNotes(customer)],
      ["Necesidades frecuentes", getCustomerDetailNeeds(customer)],
    ]),
    renderCustomerDetailSection("Resumen operativo", getCustomerOperationalSummaryFields(customer)),
    renderCustomerReceivablesSection(customer),
  ].join("");
}

function enterCustomerEditMode() {
  const customer = getCustomerDetailCustomer();

  if (!customer) {
    return;
  }

  clearCustomerEditValidation();
  renderCustomerEditForm(customer);
  setCustomerDetailMode(true, getCustomerDetailType(customer));
}

function exitCustomerEditMode() {
  const customer = getCustomerDetailCustomer();

  clearCustomerEditValidation();
  closeCustomerLifecycleConfirmation();

  if (customer) {
    renderCustomerDetailByType(customer);
  }

  setCustomerDetailMode(false);
}

function saveCustomerDetailEdit() {
  const customer = getCustomerDetailCustomer();

  if (!customer) {
    notifyCustomersAction("No se encontró el cliente seleccionado.", "error");
    return;
  }

  const customerData = getCustomerEditFormData(customer);
  const validationMessage = validateCustomerEditForm(customerData);

  if (validationMessage) {
    notifyCustomersAction(validationMessage, "error");
    return;
  }

  updateCustomerFromEditForm(customer, customerData);
  refreshCustomersSummaryData();
  renderCustomersSummary();
  renderCustomersList();
  renderCustomerDetailByType(customer);
  setCustomerDetailMode(false);
  notifyCustomersAction("Los cambios del cliente se guardaron correctamente.", "success");
}

function renderCustomerEditForm(customer) {
  const type = getCustomerDetailType(customer);
  const content = getElement("customer-detail-content");

  setText("customer-detail-modal-title", type === "Empresa" ? "Editar cliente empresa" : "Editar cliente particular");
  setText(
    "customer-detail-description",
    type === "Empresa"
      ? "Actualiza los datos propios del cliente empresa."
      : "Actualiza los datos propios del cliente particular.",
  );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <form class="customer-detail-edit-form" id="customer-detail-edit-form" novalidate>
      ${renderCustomerDetailSection("Datos no editables", [
        ["Código de cliente", customer.code],
        ["Tipo de cliente", type],
        ["Valoración", getCustomerRatingLabel(customer)],
      ])}
      ${type === "Empresa" ? renderCompanyCustomerEditFields(customer) : renderParticularCustomerEditFields(customer)}
      ${renderCustomerStatusManagement(customer)}
      ${renderCustomerDetailSection("Resumen operativo", getCustomerOperationalSummaryFields(customer))}
    </form>
  `;
}

function renderParticularCustomerEditFields(customer) {
  const phoneParts = getCustomerDetailPhoneParts(customer);

  return `
    <h3 class="modal__section-title">Datos editables</h3>
    <div class="form-grid form-grid--customer-two">
      ${renderCustomerTextInput("customer-edit-first-name", "Nombre/s *", getCustomerDetailFirstName(customer), "given-name")}
      ${renderCustomerTextInput("customer-edit-last-name", "Apellido/s *", getCustomerDetailLastName(customer), "family-name")}
    </div>
    <div class="form-grid form-grid--customer-contact">
      ${renderCustomerTextInput("customer-edit-country-code", "Código de país *", phoneParts.countryCode, "", "tel")}
      ${renderCustomerTextInput("customer-edit-phone", "Teléfono *", phoneParts.phone, "tel", "tel")}
      ${renderCustomerTextInput("customer-edit-email", "Email *", customer.email, "email", "email")}
    </div>
    <div class="form-grid form-grid--customer-two">
      ${renderCustomerTextarea("customer-edit-notes", "Observaciones internas", customer.preferences?.notes || "")}
      ${renderCustomerTextarea("customer-edit-needs", "Necesidades frecuentes", customer.preferences?.needs || "")}
    </div>
  `;
}

function renderCompanyCustomerEditFields(customer) {
  const phoneParts = getCustomerDetailPhoneParts(customer);

  return `
    <h3 class="modal__section-title">Datos editables</h3>
    <div class="form-grid form-grid--customer-two">
      ${renderCustomerTextInput("customer-edit-company-name", "Razón social *", getCustomerDetailCompanyName(customer))}
      ${renderCustomerTextInput("customer-edit-trade-name", "Nombre comercial", getCustomerDetailTradeName(customer), "", "text", true)}
    </div>
    <div class="form-grid form-grid--customer-three">
      ${renderCustomerTextInput("customer-edit-tax-id", "NIF/CIF *", customer.taxId || "")}
      ${renderCustomerTextInput("customer-edit-main-contact", "Contacto principal", customer.mainContact || "", "name", "text", true)}
    </div>
    <div class="form-grid form-grid--customer-contact">
      ${renderCustomerTextInput("customer-edit-country-code", "Código de país *", phoneParts.countryCode, "", "tel")}
      ${renderCustomerTextInput("customer-edit-phone", "Teléfono *", phoneParts.phone, "tel", "tel")}
      ${renderCustomerTextInput("customer-edit-email", "Email *", customer.email, "email", "email")}
    </div>
    ${renderCustomerTextarea("customer-edit-billing", "Datos de facturación", customer.billing || "", true)}
    <div class="form-grid form-grid--customer-two">
      ${renderCustomerTextarea("customer-edit-notes", "Observaciones internas", customer.preferences?.notes || "")}
      ${renderCustomerTextarea("customer-edit-needs", "Necesidades frecuentes", customer.preferences?.needs || "")}
    </div>
  `;
}

function renderCustomerTextInput(id, label, value, autocomplete = "", type = "text", isOptional = false) {
  const optionalClass = isOptional ? " field--optional" : "";
  const autocompleteAttribute = autocomplete ? ` autocomplete="${escapeHtml(autocomplete)}"` : "";

  return `
    <label class="field${optionalClass}">
      <span>${escapeHtml(label)}</span>
      <input id="${escapeHtml(id)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}"${autocompleteAttribute} />
    </label>
  `;
}

function renderCustomerTextarea(id, label, value, isOptional = true) {
  const optionalClass = isOptional ? " field--optional" : "";

  return `
    <label class="field${optionalClass} field--compact-textarea">
      <span>${escapeHtml(label)}</span>
      <textarea id="${escapeHtml(id)}" rows="2">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function renderCustomerStatusManagement(customer) {
  const status = normalizeCustomerStatus(customer.status);
  const isSuperadmin = isCurrentCustomerUserSuperadmin();
  const action = status === "Bloqueado" ? "unblock" : "block";
  const actionLabel = status === "Bloqueado" ? "Desbloquear cliente" : "Bloquear cliente";

  return `
    <h3 class="modal__section-title">Estado del cliente</h3>
    <dl class="modal__grid service-summary__list">
      <div class="modal__field ${getCustomerDetailStatusCardClass("Estado", status)}">
        <dt class="modal__field-label">Estado</dt>
        <dd class="modal__field-value">${escapeHtml(status)}</dd>
      </div>
    </dl>
    ${
      isSuperadmin
        ? `
          <div class="collaborator-form-actions">
            <button class="button button--compact button--muted" type="button" data-customer-lifecycle-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>
          </div>
          <div class="new-customer-type-confirm" id="customer-lifecycle-confirmation" hidden></div>
        `
        : '<p class="modal__section-note">El estado es solo lectura para este rol.</p>'
    }
  `;
}

function getCustomerEditFormData(customer) {
  const type = getCustomerDetailType(customer);

  if (type === "Empresa") {
    return {
      type,
      companyName: getCustomerInputValue("customer-edit-company-name"),
      tradeName: getCustomerInputValue("customer-edit-trade-name"),
      taxId: getCustomerInputValue("customer-edit-tax-id"),
      mainContact: getCustomerInputValue("customer-edit-main-contact"),
      countryCode: getCustomerInputValue("customer-edit-country-code"),
      phone: getCustomerInputValue("customer-edit-phone"),
      email: getCustomerInputValue("customer-edit-email"),
      billing: getCustomerInputValue("customer-edit-billing"),
      notes: getCustomerInputValue("customer-edit-notes"),
      needs: getCustomerInputValue("customer-edit-needs"),
    };
  }

  return {
    type,
    firstName: getCustomerInputValue("customer-edit-first-name"),
    lastName: getCustomerInputValue("customer-edit-last-name"),
    countryCode: getCustomerInputValue("customer-edit-country-code"),
    phone: getCustomerInputValue("customer-edit-phone"),
    email: getCustomerInputValue("customer-edit-email"),
    notes: getCustomerInputValue("customer-edit-notes"),
    needs: getCustomerInputValue("customer-edit-needs"),
  };
}

function validateCustomerEditForm(customerData) {
  clearCustomerEditValidation();

  if (!newCustomerTypes.includes(customerData.type)) {
    return "No se pudo validar el tipo de cliente.";
  }

  const validationRules =
    customerData.type === "Particular"
      ? [
          {
            invalid: !customerData.firstName,
            fieldId: "customer-edit-first-name",
            message: "Introduce el nombre del cliente.",
          },
          {
            invalid: !customerData.lastName,
            fieldId: "customer-edit-last-name",
            message: "Introduce el apellido del cliente.",
          },
          {
            invalid: !customerData.countryCode,
            fieldId: "customer-edit-country-code",
            message: "Introduce el código de país.",
          },
          {
            invalid: !customerData.phone,
            fieldId: "customer-edit-phone",
            message: "Introduce el teléfono del cliente.",
          },
          {
            invalid: !customerData.email,
            fieldId: "customer-edit-email",
            message: "Introduce el email del cliente.",
          },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            fieldId: "customer-edit-email",
            message: "Introduce un email válido.",
          },
        ]
      : [
          {
            invalid: !customerData.companyName,
            fieldId: "customer-edit-company-name",
            message: "Introduce la razón social.",
          },
          {
            invalid: !customerData.taxId,
            fieldId: "customer-edit-tax-id",
            message: "Introduce el NIF/CIF.",
          },
          {
            invalid: !customerData.countryCode,
            fieldId: "customer-edit-country-code",
            message: "Introduce el código de país.",
          },
          {
            invalid: !customerData.phone,
            fieldId: "customer-edit-phone",
            message: "Introduce el teléfono de la empresa.",
          },
          {
            invalid: !customerData.email,
            fieldId: "customer-edit-email",
            message: "Introduce el email de la empresa.",
          },
          {
            invalid: Boolean(customerData.email) && !isNewCustomerEmailValid(customerData.email),
            fieldId: "customer-edit-email",
            message: "Introduce un email válido.",
          },
        ];
  const failedRule = validationRules.find((rule) => rule.invalid);

  if (!failedRule) {
    return "";
  }

  markCustomerEditFieldInvalid(failedRule.fieldId);
  return failedRule.message;
}

function updateCustomerFromEditForm(customer, customerData) {
  const phone = `${customerData.countryCode} ${customerData.phone}`.trim();

  customer.phone = phone;
  customer.email = customerData.email;
  customer.preferences = {
    ...(customer.preferences || {}),
    notes: customerData.notes || "",
    needs: customerData.needs || "",
  };

  if (Object.prototype.hasOwnProperty.call(customer, "countryCode")) {
    customer.countryCode = customerData.countryCode;
  }

  if (customerData.type === "Empresa") {
    const companyName = normalizeNewCustomerName(customerData.companyName);
    const tradeName = customerData.tradeName ? normalizeNewCustomerName(customerData.tradeName) : "";

    customer.company = companyName;
    customer.tradeName = tradeName;
    customer.taxId = customerData.taxId;
    customer.mainContact = customerData.mainContact ? normalizeNewCustomerName(customerData.mainContact) : null;
    customer.billing = customerData.billing || null;
    customer.name = tradeName || companyName || customer.name;
    return;
  }

  const firstName = normalizeNewCustomerName(customerData.firstName);
  const lastName = normalizeNewCustomerName(customerData.lastName);

  customer.firstName = firstName;
  customer.lastName = lastName;
  customer.name = `${firstName} ${lastName}`.trim();
}

function renderCompanyCustomerDetail(customer) {
  const phoneParts = getCustomerDetailPhoneParts(customer);

  return [
    renderCustomerDetailSection("Datos de la empresa", [
      ["Código de cliente", customer.code],
      ["Tipo de cliente", getCustomerDetailType(customer)],
      ["Razón social", getCustomerDetailCompanyName(customer)],
      ["Nombre comercial", getCustomerDetailOptionalValue(getCustomerDetailTradeName(customer), "No indicado")],
      ["NIF/CIF", getCustomerDetailOptionalValue(customer.taxId, "No indicado")],
      ["Estado", normalizeCustomerStatus(customer.status)],
      ["Valoración", getCustomerRatingLabel(customer)],
    ]),
    renderCustomerDetailSection("Contacto", [
      ["Código de país", phoneParts.countryCode],
      ["Teléfono", phoneParts.phone],
      ["Email", customer.email],
      ["Contacto principal", getCustomerDetailOptionalValue(customer.mainContact, "No indicado")],
    ]),
    renderCustomerDetailSection("Información adicional", [
      ["Datos de facturación", getCustomerDetailOptionalValue(customer.billing, "No indicados")],
      ["Observaciones internas", getCustomerDetailNotes(customer)],
      ["Necesidades frecuentes", getCustomerDetailNeeds(customer)],
    ]),
    renderCustomerDetailSection("Resumen operativo", getCustomerOperationalSummaryFields(customer)),
    renderCustomerReceivablesSection(customer),
  ].join("");
}

function renderCustomerDetailSection(title, fields) {
  return `
    <h3 class="modal__section-title">${escapeHtml(title)}</h3>
    <dl class="modal__grid service-summary__list">
      ${fields
        .map(
          ([label, value]) => `
            <div class="modal__field ${getCustomerDetailStatusCardClass(label, value)}">
              <dt class="modal__field-label">${escapeHtml(label)}</dt>
              <dd class="modal__field-value">${escapeHtml(getCustomerDetailOptionalValue(value, "No indicado"))}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderCustomerReceivablesSection(customer) {
  if (!window.ElaraReceivablesCore?.getCustomerReceivableSummary) {
    return "";
  }

  window.ElaraReceivablesCore.reconcileReceivablesFromServices?.(getCurrentCustomerUser());

  const customerId = getCustomerReceivableId(customer);
  const summary = window.ElaraReceivablesCore.getCustomerReceivableSummary(customerId);
  const latestReceivables = window.ElaraReceivablesCore.getReceivablesForCustomer(customerId).slice(0, 5);

  return `
    <h3 class="modal__section-title">Cuentas por cobrar</h3>
    <dl class="modal__grid service-summary__list">
      <div class="modal__field">
        <dt class="modal__field-label">Pendiente</dt>
        <dd class="modal__field-value">${escapeHtml(formatCustomerReceivableMoney(summary.totalPendingAmount))}</dd>
      </div>
      <div class="modal__field">
        <dt class="modal__field-label">Servicios pendientes</dt>
        <dd class="modal__field-value">${escapeHtml(summary.pendingCount)}</dd>
      </div>
      <div class="modal__field">
        <dt class="modal__field-label">Cobrado</dt>
        <dd class="modal__field-value">${escapeHtml(formatCustomerReceivableMoney(summary.collectedAmount))}</dd>
      </div>
      <div class="modal__field">
        <dt class="modal__field-label">\u00daltimo cobro</dt>
        <dd class="modal__field-value">${escapeHtml(formatCustomerReceivableDate(summary.latestPaymentDate))}</dd>
      </div>
    </dl>
    <div class="customer-receivables-preview">
      ${
        latestReceivables.length
          ? latestReceivables
              .map(
                (receivable) => `
                  <article class="customer-receivables-preview__item">
                    <strong>${escapeHtml(receivable.id)} · ${escapeHtml(receivable.serviceId)}</strong>
                    <span>${escapeHtml(receivable.status)} · ${escapeHtml(formatCustomerReceivableMoney(receivable.pendingAmount || receivable.originalAmount))}</span>
                  </article>
                `,
              )
              .join("")
          : '<p class="modal__hint">Sin deuda ni cobros posteriores registrados.</p>'
      }
      <button class="button button--compact button--muted" type="button" data-customer-receivables="${escapeHtml(customerId)}">Ver todas</button>
    </div>
  `;
}

function getCustomerDetailStatusCardClass(label, status) {
  if (normalizeCustomerSearchText(label) !== "estado") {
    return "";
  }

  const statusClassByName = {
    activo: "status-card--success",
    nuevo: "status-card--warning",
    bloqueado: "status-card--danger",
  };

  return statusClassByName[normalizeCustomerSearchText(normalizeCustomerStatus(status))] || "status-card--danger";
}

function openCustomerLifecycleConfirmation(action) {
  const customer = getCustomerDetailCustomer();
  const confirmation = getElement("customer-lifecycle-confirmation");

  if (!customer || !confirmation || !isCurrentCustomerUserSuperadmin()) {
    return;
  }

  const status = normalizeCustomerStatus(customer.status);

  if (action === "block" && status === "Bloqueado") {
    return;
  }

  if (action === "unblock" && status !== "Bloqueado") {
    return;
  }

  pendingCustomerStatusAction = action;
  confirmation.hidden = false;
  confirmation.innerHTML =
    action === "block" ? renderCustomerBlockConfirmation() : renderCustomerUnblockConfirmation(customer);
}

function renderCustomerBlockConfirmation() {
  return `
    <p>Bloquear este cliente impedirá crear nuevos servicios para él. Los servicios existentes se conservarán.</p>
    <label class="field">
      <span>Motivo del bloqueo *</span>
      <input id="customer-block-reason" type="text" maxlength="120" />
    </label>
    <p class="field__error" id="customer-lifecycle-error" hidden></p>
    <div class="new-customer-type-confirm__actions">
      <button class="button button--compact button--muted" type="button" data-customer-lifecycle-cancel>Volver</button>
      <button class="button button--compact" type="button" data-customer-lifecycle-confirm>Confirmar bloqueo</button>
    </div>
  `;
}

function renderCustomerUnblockConfirmation(customer) {
  const finalizedCount = getCustomerFinalizedServicesCount(customer.code);
  const resultingStatus = getCustomerUnblockedStatus(customer.code);

  return `
    <p>Este cliente tiene ${escapeHtml(finalizedCount)} servicios finalizados. Al desbloquearlo quedará como <strong>${escapeHtml(resultingStatus)}</strong>.</p>
    <p class="field__error" id="customer-lifecycle-error" hidden></p>
    <div class="new-customer-type-confirm__actions">
      <button class="button button--compact button--muted" type="button" data-customer-lifecycle-cancel>Volver</button>
      <button class="button button--compact" type="button" data-customer-lifecycle-confirm>Confirmar desbloqueo</button>
    </div>
  `;
}

function closeCustomerLifecycleConfirmation() {
  const confirmation = getElement("customer-lifecycle-confirmation");

  pendingCustomerStatusAction = "";

  if (confirmation) {
    confirmation.hidden = true;
    confirmation.innerHTML = "";
  }
}

function confirmCustomerLifecycleAction() {
  if (pendingCustomerStatusAction === "block") {
    blockCustomerFromDetail();
    return;
  }

  if (pendingCustomerStatusAction === "unblock") {
    unblockCustomerFromDetail();
  }
}

function blockCustomerFromDetail() {
  const customer = getCustomerDetailCustomer();
  const reason = getCustomerInputValue("customer-block-reason");

  if (!customer || !isCurrentCustomerUserSuperadmin()) {
    return;
  }

  if (!reason) {
    showCustomerLifecycleError("Introduce un motivo de bloqueo.");
    return;
  }

  const user = getCurrentCustomerUser();
  const blockedAt = new Date().toISOString();

  customer.status = "Bloqueado";
  customer.blockedAt = blockedAt;
  customer.blockedBy = user ? user.name || user.email || user.id : "Superadmin";
  customer.blockReason = reason;
  customer.blockHistory = Array.isArray(customer.blockHistory) ? customer.blockHistory : [];
  customer.blockHistory.push({
    blockedAt,
    blockedBy: customer.blockedBy,
    blockReason: reason,
  });

  refreshCustomerAfterLifecycleChange(customer);
  notifyCustomersAction("El cliente se bloqueó correctamente.", "success");
}

function unblockCustomerFromDetail() {
  const customer = getCustomerDetailCustomer();

  if (!customer || !isCurrentCustomerUserSuperadmin()) {
    return;
  }

  const user = getCurrentCustomerUser();
  const unblockedAt = new Date().toISOString();

  customer.status = getCustomerUnblockedStatus(customer.code);
  customer.unblockedAt = unblockedAt;
  customer.unblockedBy = user ? user.name || user.email || user.id : "Superadmin";
  customer.blockHistory = Array.isArray(customer.blockHistory) ? customer.blockHistory : [];

  const openBlock = [...customer.blockHistory].reverse().find((entry) => entry && !entry.unblockedAt);

  if (openBlock) {
    openBlock.unblockedAt = unblockedAt;
    openBlock.unblockedBy = customer.unblockedBy;
    openBlock.resultingStatus = customer.status;
  }

  refreshCustomerAfterLifecycleChange(customer);
  notifyCustomersAction("El cliente se desbloqueó correctamente.", "success");
}

function refreshCustomerAfterLifecycleChange(customer) {
  closeCustomerLifecycleConfirmation();
  refreshCustomersSummaryData();
  renderCustomersSummary();
  renderCustomersList();
  renderCustomerEditForm(customer);
  setCustomerDetailMode(true, getCustomerDetailType(customer));
}

function showCustomerLifecycleError(message) {
  const error = getElement("customer-lifecycle-error");

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function getCustomerUnblockedStatus(customerCode) {
  return getCustomerFinalizedServicesCount(customerCode) >= 3 ? "Activo" : "Nuevo";
}

function updateCustomerLifecycleFromServices(customerCode, finalizedService = null) {
  const normalizedCustomerCode = normalizeCustomerIdentifier(customerCode);
  const customer = customersData.customers.find((candidate) =>
    getCustomerStableIdentifiers(candidate).includes(normalizedCustomerCode),
  );

  if (!customer || normalizeCustomerStatus(customer.status) !== "Nuevo") {
    return null;
  }

  if (getCustomerFinalizedServiceCount(customer, finalizedService) < 3) {
    return null;
  }

  customer.status = "Activo";
  customer.activatedAt = new Date().toISOString();
  refreshCustomersSummaryData();
  renderCustomersSummary();
  renderCustomersList();

  return customer;
}

function getCustomerFinalizedServicesCount(customerCode, finalizedService = null) {
  const normalizedCustomerCode = normalizeCustomerIdentifier(customerCode);
  const customer = customersData.customers.find((candidate) =>
    getCustomerStableIdentifiers(candidate).includes(normalizedCustomerCode),
  );
  const customerIdentifiers = customer ? getCustomerStableIdentifiers(customer) : [normalizedCustomerCode].filter(Boolean);

  return getCustomerFinalizedServicesCountByIdentifiers(customerIdentifiers, finalizedService);
}

function getCustomerFinalizedServiceCount(customer, finalizedService = null) {
  return getCustomerFinalizedServicesCountByIdentifiers(getCustomerStableIdentifiers(customer), finalizedService);
}

function getCustomerFinalizedServicesCountByIdentifiers(customerIdentifiers, finalizedService = null) {
  if (!customerIdentifiers.length) {
    return 0;
  }

  const services = getCustomerServicesSource().slice();
  const finalizedServiceId = finalizedService?.serviceId || "";

  if (finalizedService && !services.some((service) => service.serviceId === finalizedServiceId)) {
    services.push(finalizedService);
  }

  return services.filter((service) => isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers) && isCustomerFinalizedService(service)).length;
}

function isCustomerBlockedForNewService(customer) {
  return normalizeCustomerStatus(customer?.status) === "Bloqueado";
}

function getCurrentCustomerUser() {
  return typeof window.ElaraAuth?.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
}

function getCustomerReceivableId(customer) {
  return normalizeCustomerIdentifier(customer?.code || customer?.id);
}

function formatCustomerReceivableMoney(value) {
  if (window.ElaraCash && typeof window.ElaraCash.formatCashMoney === "function") {
    return window.ElaraCash.formatCashMoney(value);
  }

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function formatCustomerReceivableDate(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!isoMatch) {
    return "Sin informaci\u00f3n";
  }

  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

function isCurrentCustomerUserSuperadmin() {
  return getCurrentCustomerUser()?.role === "superadmin";
}

function getCustomerOperationalSummaryFields(customer) {
  return [
    ["Total de servicios", getCustomerDetailTotalServices(customer)],
    ["Último servicio", getCustomerDetailLastService(customer)],
    ["Próximo servicio", getCustomerDetailNextService(customer)],
  ];
}

function getCustomerDetailType(customer) {
  return customer.type === "Empresa" ? "Empresa" : "Particular";
}

function getCustomerDetailDisplayName(customer) {
  if (getCustomerDetailType(customer) === "Empresa") {
    return (
      getCustomerDetailTradeName(customer) ||
      getCustomerDetailCompanyName(customer) ||
      getCustomerDetailOptionalValue(customer.name, "Cliente")
    );
  }

  return `${getCustomerDetailFirstName(customer)} ${getCustomerDetailLastName(customer)}`.trim() || customer.name || "Cliente";
}

function getCustomerDetailFirstName(customer) {
  if (customer.firstName) {
    return customer.firstName;
  }

  const nameParts = getCustomerDetailNameParts(customer);
  return nameParts.firstName;
}

function getCustomerDetailLastName(customer) {
  if (customer.lastName) {
    return customer.lastName;
  }

  const nameParts = getCustomerDetailNameParts(customer);
  return nameParts.lastName;
}

function getCustomerDetailNameParts(customer) {
  const parts = String(customer.name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return {
      firstName: "No indicado",
      lastName: "No indicado",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "No indicado",
  };
}

function getCustomerDetailCompanyName(customer) {
  return customer.company || customer.companyName || customer.businessName || customer.name || "";
}

function getCustomerDetailTradeName(customer) {
  if (customer.tradeName) {
    return customer.tradeName;
  }

  if (customer.company && customer.name && customer.name !== customer.company) {
    return customer.name;
  }

  return "";
}

function getCustomerDetailPhoneParts(customer) {
  const rawPhone = String(customer.phone || "").trim().replace(/\s+/g, " ");

  if (customer.countryCode) {
    return {
      countryCode: customer.countryCode,
      phone: rawPhone.replace(customer.countryCode, "").trim() || rawPhone || "No indicado",
    };
  }

  const parts = rawPhone.split(" ").filter(Boolean);

  if (parts[0] && parts[0].startsWith("+")) {
    return {
      countryCode: parts[0],
      phone: parts.slice(1).join(" ") || "No indicado",
    };
  }

  return {
    countryCode: "No indicado",
    phone: rawPhone || "No indicado",
  };
}

function getCustomerDetailNotes(customer) {
  return getCustomerDetailOptionalValue(customer.preferences?.notes, "Sin observaciones.");
}

function getCustomerDetailNeeds(customer) {
  return getCustomerDetailOptionalValue(customer.preferences?.needs, "No indicadas.");
}

function getCustomerDetailTotalServices(customer) {
  const totalServices = getCustomerHistoricalFinalizedServiceCount(customer);

  return formatCustomerServiceCountValue(totalServices);
}

function getCustomerHistoricalFinalizedServiceCount(customer) {
  const customerIdentifiers = getCustomerStableIdentifiers(customer);
  const countedServiceKeys = new Set();
  let total = 0;

  if (customerIdentifiers.length) {
    getCustomerServicesSource()
      .filter((service) => isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers) && isCustomerFinalizedService(service))
      .forEach((service) => {
        countedServiceKeys.add(getCustomerCentralServiceCountKey(service));
        total += 1;
      });
  }

  (customer.history || []).forEach((item) => {
    if (!isCustomerFinalizedHistoryItem(item)) {
      return;
    }

    const centralService = getCustomerRelatedServiceForHistoryItem(item, customer);

    if (centralService) {
      return;
    }

    const legacyKey = getCustomerLegacyServiceCountKey(item);

    if (countedServiceKeys.has(legacyKey)) {
      return;
    }

    countedServiceKeys.add(legacyKey);
    total += 1;
  });

  return total;
}

function isCustomerFinalizedHistoryItem(item) {
  return getCustomerNormalizedServiceStatus(item?.status) === "Finalizado";
}

function getCustomerCentralServiceCountKey(service) {
  return normalizeCustomerIdentifier(service?.serviceId || service?.id) || getCustomerServiceFallbackCountKey(service);
}

function getCustomerLegacyServiceCountKey(item) {
  return normalizeCustomerIdentifier(item?.serviceId || item?.id || item?.number) || getCustomerLegacyServiceFallbackCountKey(item);
}

function getCustomerServiceFallbackCountKey(service) {
  return normalizeCustomerSearchText(
    [
      service?.date,
      service?.time,
      service?.type,
      service?.origin,
      service?.destination,
      service?.price || service?.amount,
    ].join("|"),
  );
}

function getCustomerLegacyServiceFallbackCountKey(item) {
  return normalizeCustomerSearchText([item?.date || item?.dateTime, item?.type, item?.route, item?.amount].join("|"));
}

function formatCustomerServiceCount(customer) {
  const totalServices = getCustomerServiceCount(customer);

  return formatCustomerServiceCountValue(totalServices);
}

function formatCustomerUpcomingServiceCount(customer) {
  return formatCustomerServiceCountValue(getCustomerUpcomingServiceCount(customer));
}

function formatCustomerServiceCountValue(count) {
  return `${count} ${count === 1 ? "servicio" : "servicios"}`;
}

function getCustomerServiceCount(customer) {
  const customerIdentifiers = getCustomerStableIdentifiers(customer);

  if (!customerIdentifiers.length) {
    return 0;
  }

  return getCustomerServicesSource().filter((service) => isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers)).length;
}

function getCustomerUpcomingServiceCount(customer) {
  const customerIdentifiers = getCustomerStableIdentifiers(customer);

  if (!customerIdentifiers.length) {
    return 0;
  }

  return getCustomerServicesSource().filter((service) => isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers) && isCustomerUpcomingService(service)).length;
}

function isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers) {
  return getCustomerServiceStableIdentifiers(service).some((serviceIdentifier) => customerIdentifiers.includes(serviceIdentifier));
}

function isCustomerUpcomingService(service) {
  return (
    CUSTOMER_UPCOMING_SERVICE_STATUSES.includes(getCustomerNormalizedServiceStatus(service?.status)) &&
    isCustomerServiceScheduledInFuture(service)
  );
}

function isCustomerFinalizedService(service) {
  return getCustomerNormalizedServiceStatus(service?.status) === "Finalizado";
}

function getCustomerNormalizedServiceStatus(status) {
  const normalizedStatus = normalizeCustomerSearchText(status).replace(/-/g, " ");
  const statusesByName = {
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    "en curso": "En curso",
    finalizado: "Finalizado",
    completado: "Finalizado",
    completed: "Finalizado",
    cancelado: "Cancelado",
    "no show": "No show",
    "no realizado": "No realizado",
  };

  return statusesByName[normalizedStatus] || String(status || "").trim();
}

function isCustomerServiceScheduledInFuture(service) {
  const serviceDateTime = getCustomerServiceDateTime(service);
  const referenceDate = getCustomerOperationalReferenceDate();

  return Boolean(serviceDateTime && serviceDateTime.getTime() > referenceDate.getTime());
}

function getCustomerOperationalReferenceDate() {
  return new Date();
}

function getCustomerServiceDateTime(service) {
  const rawDate = String(service?.date || "").trim();
  const rawTime = String(service?.time || "").trim();

  if (!rawDate) {
    return null;
  }

  const dateParts = rawDate.includes("/")
    ? rawDate.split("/").map((part) => Number(part))
    : rawDate.split("-").map((part) => Number(part));
  const [hours = 0, minutes = 0] = rawTime.split(":").map((part) => Number(part));
  const parsedDate = rawDate.includes("/")
    ? new Date(dateParts[2], dateParts[1] - 1, dateParts[0], hours, minutes)
    : new Date(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getCustomerStableIdentifiers(customer) {
  return [customer?.code, customer?.customerCode, customer?.id].map(normalizeCustomerIdentifier).filter(Boolean);
}

function getCustomerServiceStableIdentifiers(service) {
  return [
    service?.customerCode,
    service?.customerId,
    service?.clientCode,
    service?.customer?.code,
    service?.customer?.customerCode,
    service?.customer?.id,
  ]
    .map(normalizeCustomerIdentifier)
    .filter(Boolean);
}

function getCustomerServicesSource() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }

  return window.ElaraServicesMock?.services || [];
}

function normalizeCustomerIdentifier(value) {
  return String(value || "").trim();
}

function getCustomerDetailLastService(customer) {
  return getCustomerDetailOptionalValue(customer.lastService, "Sin servicios realizados");
}

function getCustomerDetailNextService(customer) {
  const nextService = getCustomerNextServiceFromCentralSource(customer);

  if (nextService) {
    return formatCustomerNextServiceDetail(nextService);
  }

  if (!isCustomerCentralServicesSourceAvailable()) {
    warnCustomerNextServiceLegacyFallback();
    return getCustomerDetailOptionalValue(customer.nextService, "Sin servicios próximos");
  }

  return "Sin servicios próximos";
}

function getCustomerNextServiceFromCentralSource(customer) {
  if (!isCustomerCentralServicesSourceAvailable()) {
    return null;
  }

  const relatedServices = window.ElaraServicesMock.services.filter((service) => isCustomerServiceRelatedToCustomer(service, customer));
  const inProgressServices = relatedServices
    .filter((service) => getCustomerNormalizedServiceStatus(service?.status) === "En curso")
    .sort(compareCustomerServicesChronologically);

  if (inProgressServices.length) {
    return inProgressServices[0];
  }

  const referenceDate = getCustomerOperationalReferenceDate();

  return (
    relatedServices
      .filter((service) => isCustomerServiceEligibleAsNext(service, referenceDate))
      .sort(compareCustomerServicesChronologically)[0] || null
  );
}

function isCustomerServiceRelatedToCustomer(service, customer) {
  const customerId = normalizeCustomerIdentifier(customer?.id);
  const serviceCustomerId = normalizeCustomerIdentifier(service?.customerId);

  if (customerId && serviceCustomerId) {
    return customerId === serviceCustomerId;
  }

  return isCustomerServiceRelatedToIdentifiers(service, getCustomerStableIdentifiers(customer));
}

function isCustomerServiceEligibleAsNext(service, referenceDate) {
  const status = getCustomerNormalizedServiceStatus(service?.status);
  const serviceDateTime = getCustomerServiceDateTime(service);

  return (
    !CUSTOMER_NEXT_SERVICE_CLOSED_STATUSES.includes(status) &&
    serviceDateTime &&
    serviceDateTime.getTime() > referenceDate.getTime()
  );
}

function compareCustomerServicesChronologically(a, b) {
  const aTime = getCustomerServiceDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = getCustomerServiceDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;

  if (aTime !== bTime) {
    return aTime - bTime;
  }

  return normalizeCustomerIdentifier(a?.serviceId || a?.id).localeCompare(normalizeCustomerIdentifier(b?.serviceId || b?.id));
}

function formatCustomerNextServiceDetail(service) {
  const serviceId = normalizeCustomerIdentifier(service?.serviceId || service?.id) || "Servicio sin ID";
  const date = getCustomerDetailOptionalValue(service?.date, "Sin fecha");
  const time = getCustomerDetailOptionalValue(service?.time, "Sin hora");
  const type = getCustomerDetailOptionalValue(service?.type, "Sin tipo");
  const route = formatCustomerNextServiceRoute(service);
  const displayStatus = getCustomerCentralServiceDisplayStatus(service);

  return [serviceId, `${date} ${time}`.trim(), type, route, displayStatus].filter(Boolean).join(" - ");
}

function formatCustomerNextServiceRoute(service) {
  const origin = String(service?.origin || "").trim();
  const destination = String(service?.destination || "").trim();

  if (origin && destination) {
    return `${origin} a ${destination}`;
  }

  return origin || destination || "Ruta no indicada";
}

function getCustomerCentralServiceDisplayStatus(service) {
  const getDisplayStatus = window.ElaraServices?.getServiceDisplayStatus;

  return typeof getDisplayStatus === "function" ? getDisplayStatus(service) : service?.status || "";
}

function isCustomerCentralServicesSourceAvailable() {
  return Array.isArray(window.ElaraServicesMock?.services);
}

function warnCustomerNextServiceLegacyFallback() {
  if (hasWarnedCustomerNextServiceLegacyFallback) {
    return;
  }

  console.warn("[ELARA] Clientes usa customer.nextService como fallback temporal porque la fuente central de servicios no esta disponible.");
  hasWarnedCustomerNextServiceLegacyFallback = true;
}

function getCustomerDetailOptionalValue(value, emptyText) {
  return value === null || value === undefined || String(value).trim() === "" ? emptyText : value;
}

function getCustomerListDisplayName(customer) {
  return getCustomerDetailDisplayName(customer);
}

function getCustomerDetailCustomer() {
  if (customerDetailCustomerIndex === null) {
    return null;
  }

  return customersData.customers[customerDetailCustomerIndex] || null;
}

function closeCustomerDetailModal() {
  const modal = getElement(CUSTOMER_DETAIL_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  customerDetailCustomerIndex = null;
  clearCustomerEditValidation();
  closeCustomerLifecycleConfirmation();
  setCustomerDetailMode(false);
}

function setCustomerDetailMode(isEditing, customerType = "") {
  const viewActions = getElement("customer-detail-view-actions");
  const editActions = getElement("customer-detail-edit-actions");

  if (viewActions) {
    viewActions.hidden = isEditing;
  }

  if (editActions) {
    editActions.hidden = !isEditing;
  }

  if (isEditing) {
    setText("customer-detail-modal-title", customerType === "Empresa" ? "Editar cliente empresa" : "Editar cliente particular");
    setText(
      "customer-detail-description",
      customerType === "Empresa"
        ? "Actualiza los datos propios del cliente empresa."
        : "Actualiza los datos propios del cliente particular.",
    );
  }
}

function isCustomerDetailEditing() {
  const editActions = getElement("customer-detail-edit-actions");

  return Boolean(editActions && !editActions.hidden);
}

function openCustomerHistoryModal(customerIndex) {
  const customer = customersData.customers[Number(customerIndex)];

  if (!customer) {
    return;
  }

  customerHistoryCustomerIndex = Number(customerIndex);
  renderCustomerHistoryModalContent(customer);

  const modal = getElement("customer-history-modal");

  if (modal) {
    modal.hidden = false;
  }
}

function renderCustomerHistoryModalContent(customer) {
  setText("history-customer-code", customer.code);
  setText("history-customer-name", customer.name);
  setText("history-customer-rating", getCustomerRatingLabel(customer));
  setText("history-customer-total", getCustomerDetailTotalServices(customer));

  const historyList = getElement("customer-history-list");
  const upcomingList = getElement("customer-upcoming-list");

  historyList.innerHTML = renderHistoryItems(customer.history, customer);
  upcomingList.innerHTML = renderUpcomingItems(customer.upcoming, customer);
}

// =========================
// Render de historial
// =========================

function renderHistoryItems(items, customer) {
  if (!items.length) {
    return '<li class="customer-history-item"><span>Sin servicios anteriores</span></li>';
  }

  return items
    .map(
      (item) => {
        const status = getCustomerServiceDisplayStatus(item, customer);

        return `
        <li class="customer-history-item">
          <time>${escapeHtml(item.date)}</time>
          <strong>${escapeHtml(item.type)}</strong>
          <span>${escapeHtml(item.route)}</span>
          <span>${escapeHtml(item.amount || "Sin importe")}</span>
          <small class="status-pill ${escapeHtml(getCustomerServiceDisplayStatusClass(status))}">${escapeHtml(status)}</small>
        </li>
      `;
      },
    )
    .join("");
}

function renderUpcomingItems(items, customer) {
  if (!items.length) {
    return '<li class="customer-history-item"><span>Sin servicios programados</span></li>';
  }

  return items
    .map(
      (item) => {
        const status = getCustomerServiceDisplayStatus(item, customer);

        return `
        <li class="customer-history-item">
          <time>${escapeHtml(item.dateTime)}</time>
          <strong>${escapeHtml(item.type)}</strong>
          <span>${escapeHtml(item.route)}</span>
          <small class="status-pill ${escapeHtml(getCustomerServiceDisplayStatusClass(status))}">${escapeHtml(status)}</small>
        </li>
      `;
      },
    )
    .join("");
}

function getCustomerServiceDisplayStatus(item, customer) {
  const service = getCustomerRelatedServiceForHistoryItem(item, customer);
  const getDisplayStatus = window.ElaraServices?.getServiceDisplayStatus;

  if (service && typeof getDisplayStatus === "function") {
    return getDisplayStatus(service);
  }

  return service?.status || getCustomerFallbackServiceDisplayStatus(item?.status);
}

function getCustomerFallbackServiceDisplayStatus(status) {
  return normalizeCustomerSearchText(status) === "pendiente" ? "Por asignar" : status || "";
}

function getCustomerServiceDisplayStatusClass(status) {
  const statusClassByName = {
    "Por asignar": "status--warning",
    "Por aceptar": "status--warning",
    Confirmado: "status--success",
    "En curso": "status--info",
    "Reasignaci\u00f3n requerida": "status--warning",
    Finalizado: "status--success",
    Cancelado: "status--danger",
    "No show": "status--warning",
    "No realizado": "status--neutral",
  };

  return statusClassByName[status] || "status--neutral";
}

function getCustomerRelatedServiceForHistoryItem(item, customer) {
  const customerIdentifiers = getCustomerStableIdentifiers(customer);

  if (!item || !customerIdentifiers.length) {
    return null;
  }

  const itemServiceId = normalizeCustomerIdentifier(item.serviceId || item.id || item.number);

  return (
    getCustomerServicesSource().find((service) => {
      if (!isCustomerServiceRelatedToIdentifiers(service, customerIdentifiers)) {
        return false;
      }

      if (itemServiceId) {
        return normalizeCustomerIdentifier(service.serviceId || service.id) === itemServiceId;
      }

      return isCustomerServiceMatchingHistoryItem(service, item);
    }) || null
  );
}

function isCustomerServiceMatchingHistoryItem(service, item) {
  return (
    normalizeCustomerSearchText(service.type) === normalizeCustomerSearchText(item.type) &&
    isCustomerServiceDateMatchingHistoryItem(service, item) &&
    isCustomerServiceRouteMatchingHistoryItem(service, item)
  );
}

function isCustomerServiceDateMatchingHistoryItem(service, item) {
  const serviceDateParts = getCustomerServiceDateParts(service.date);
  const itemDateParts = getCustomerServiceDateParts(item.dateTime || item.date);

  if (!serviceDateParts || !itemDateParts) {
    return false;
  }

  const sameDate =
    serviceDateParts.day === itemDateParts.day &&
    serviceDateParts.month === itemDateParts.month &&
    (!itemDateParts.year || serviceDateParts.year === itemDateParts.year);

  if (!sameDate) {
    return false;
  }

  const itemTime = getCustomerServiceTimeFromText(item.dateTime || item.time);

  return !itemTime || itemTime === String(service.time || "").trim();
}

function getCustomerServiceDateParts(value) {
  const text = String(value || "");
  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  const dashMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (slashMatch) {
    return {
      day: Number(slashMatch[1]),
      month: Number(slashMatch[2]),
      year: slashMatch[3] ? Number(slashMatch[3]) : null,
    };
  }

  if (dashMatch) {
    return {
      day: Number(dashMatch[3]),
      month: Number(dashMatch[2]),
      year: Number(dashMatch[1]),
    };
  }

  return null;
}

function getCustomerServiceTimeFromText(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function isCustomerServiceRouteMatchingHistoryItem(service, item) {
  const routeText = normalizeCustomerSearchText(item.route);

  if (!routeText) {
    return true;
  }

  return (
    routeText.includes(normalizeCustomerSearchText(service.origin)) &&
    routeText.includes(normalizeCustomerSearchText(service.destination))
  );
}

// =========================
// Utilidades internas
// =========================

function getElement(id) {
  return document.getElementById(id);
}

function closeNewCustomerModal() {
  const modal = getElement(NEW_CUSTOMER_MODAL_ID);

  if (modal) {
    modal.hidden = true;
  }

  resetNewCustomerForm();
}

function resetNewCustomerForm() {
  selectedNewCustomerType = "";
  pendingNewCustomerType = "";
  newCustomerDuplicateCustomer = null;
  clearNewCustomerFields();
  clearNewCustomerValidation();
  renderNewCustomerDuplicateNotice(null);
  updateNewCustomerTypeControls();
  showNewCustomerTypeConfirmation(false);
}

function clearNewCustomerFields() {
  const form = getElement("new-customer-form");

  if (!form) {
    return;
  }

  form.querySelectorAll("input[type='text'], input[type='tel'], input[type='email'], textarea").forEach((field) => {
    field.value = "";
  });
  form.querySelectorAll("select").forEach((select) => {
    select.value = "Activo";
  });

  const countryCode = getElement("new-customer-country-code");
  const companyCountryCode = getElement("new-customer-company-country-code");

  if (countryCode) {
    countryCode.value = "+34";
  }

  if (companyCountryCode) {
    companyCountryCode.value = "+34";
  }
}

function updateNewCustomerTypeControls() {
  document.querySelectorAll("[data-new-customer-type]").forEach((input) => {
    input.checked = input.value === selectedNewCustomerType;
  });
  document.querySelectorAll("[data-new-customer-section]").forEach((section) => {
    section.hidden = section.dataset.newCustomerSection !== selectedNewCustomerType;
  });

  const actions = getElement("new-customer-actions");
  const closeButton = getElement("new-customer-close-button");

  if (actions) {
    actions.hidden = !selectedNewCustomerType;
  }

  if (closeButton) {
    closeButton.hidden = Boolean(selectedNewCustomerType);
  }

  updateNewCustomerDescription();
}

function updateNewCustomerDescription() {
  const description = getElement("new-customer-description");

  if (!description) {
    return;
  }

  if (selectedNewCustomerType === "Particular") {
    description.textContent = "Completa los datos del cliente particular.";
    return;
  }

  if (selectedNewCustomerType === "Empresa") {
    description.textContent = "Completa los datos del cliente empresa.";
    return;
  }

  description.textContent = "Selecciona el tipo de cliente para continuar.";
}

function showNewCustomerTypeConfirmation(isVisible) {
  const confirmation = getElement("new-customer-type-confirm");

  if (confirmation) {
    confirmation.hidden = !isVisible;
  }
}

function hasNewCustomerFormData() {
  const section = document.querySelector(`[data-new-customer-section="${selectedNewCustomerType}"]`);

  if (!section) {
    return false;
  }

  return Array.from(section.querySelectorAll("input, textarea")).some((field) => {
    const value = field.value.trim();

    if (!value) {
      return false;
    }

    return !["new-customer-country-code", "new-customer-company-country-code"].includes(field.id) || value !== "+34";
  });
}

function getCustomerInputValue(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}

function clearNewCustomerValidation() {
  const form = getElement("new-customer-form");

  if (!form) {
    return;
  }

  form.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });
}

function markNewCustomerFieldInvalid(fieldId) {
  const field = getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }
}

function clearCustomerEditValidation() {
  const form = getElement("customer-detail-edit-form");

  if (!form) {
    return;
  }

  form.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });
}

function markCustomerEditFieldInvalid(fieldId) {
  const field = getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }
}

function isNewCustomerEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeNewCustomerName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s-])([^\s-])/g, (match, separator, character) => `${separator}${character.toUpperCase()}`);
}

function getCustomerRatingLabel(customer) {
  return typeof customer.rating === "number" ? `${customer.rating} / 100` : customer.rating || "Sin valoración";
}

function updateCustomersSummaryMetric(label, value) {
  const metric = customersData.summary.find((item) => item.label === label);

  if (metric) {
    metric.value = String(value);
  }
}

function notifyCustomersAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function initCustomersFilterControls() {
  const clearButton = document.querySelector("[data-customers-clear]");
  const filterMenu = clearButton?.closest(".customer-filter__menu");

  if (!clearButton || !filterMenu || filterMenu.dataset.customersFiltersReady) {
    return;
  }

  filterMenu.dataset.customersFiltersReady = "true";
  filterMenu.addEventListener("change", renderCustomersList);

  clearButton.addEventListener("click", () => {
    filterMenu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    renderCustomersList();
  });
}

function initCustomersSearchControls() {
  const searchInput = getElement("customers-search");

  if (!searchInput || searchInput.dataset.customersSearchReady) {
    return;
  }

  searchInput.dataset.customersSearchReady = "true";
  searchInput.addEventListener("input", renderCustomersList);
  searchInput.addEventListener("search", renderCustomersList);
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

window.ElaraCustomers = {
  initCustomers,
  showCustomers,
  openCustomerDetailByCode,
  getCustomerCreationStatuses,
  getCustomerCreationCustomers,
  validateCustomerCreationData,
  buildCustomerCreationRecord: buildNewCustomerRecord,
  addCustomerCreationRecord,
  findCustomerCreationDuplicate,
  getCustomerCreationDisplayName: getCustomerListDisplayName,
  normalizeCustomerStatus,
  isCustomerBlockedForNewService,
  updateCustomerLifecycleFromServices,
};
