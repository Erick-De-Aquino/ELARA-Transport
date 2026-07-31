/*
  Proyecto Atlas / ELARA Transport
  Archivo: receivables.js
  Responsabilidad: interfaz administrativa mock de Cuentas por cobrar.
*/

"use strict";

const RECEIVABLES_PAGE_SIZE = 10;
const RECEIVABLE_STATUSES_UI = ["Pendiente", "Cobrada", "Anulada"];
const RECEIVABLE_PAYMENT_METHODS_UI = ["Efectivo", "Transferencia"];

let isReceivablesInitialized = false;
let receivablesPage = 1;
let selectedReceivableId = "";
let selectedReceivablePaymentId = "";
let pendingReceivablesCustomerFilter = "";
let receivablesFilters = getDefaultReceivablesFilters();

function initReceivables() {
  if (isReceivablesInitialized) {
    return;
  }

  populateReceivablesCustomerFilter();
  bindReceivablesEvents();
  isReceivablesInitialized = true;
}

function showReceivables() {
  initReceivables();

  const session = getReceivablesCurrentUser();

  if (!window.ElaraReceivablesCore?.canViewReceivables?.(session)) {
    showReceivablesUnavailable("No tienes acceso a Cuentas por cobrar.");
    return;
  }

  setReceivablesText("page-eyebrow", "GESTI\u00d3N FINANCIERA");
  setReceivablesText("page-title", "Cuentas por cobrar");
  setReceivablesText("page-summary", "Consulta servicios pendientes de cobro, registra pagos posteriores y revisa el historial por cliente.");
  configureReceivablesPrimaryAction();
  applyPendingReceivablesCustomerFilter();
  reconcileReceivablesQuietly();
  renderReceivablesView();
}

function renderReceivablesView() {
  populateReceivablesCustomerFilter();
  syncReceivablesFilterControls();
  updateReceivablesFilterSummary();
  renderReceivablesSummary();
  renderReceivablesList();
}

function renderReceivablesSummary() {
  const container = getReceivablesElement("receivables-summary");

  if (!container) {
    return;
  }

  const summary = window.ElaraReceivablesCore.getGlobalReceivableSummary();
  const metrics = [
    ["Importe pendiente", formatReceivableMoney(summary.totalPendingAmount), "warning"],
    ["Servicios pendientes", String(summary.pendingCount), "warning"],
    ["Clientes con deuda", String(summary.customersWithDebt), "info"],
    ["Total cobrado", formatReceivableMoney(summary.collectedAmount), "success"],
    ["Cobros registrados", String(summary.collectedCount), "success"],
  ];

  container.innerHTML = metrics
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${escapeReceivableHtml(tone)}">
          <span>${escapeReceivableHtml(label)}</span>
          <strong>${escapeReceivableHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderReceivablesList() {
  const container = getReceivablesElement("receivables-list");
  const pagination = getReceivablesElement("receivables-pagination");
  const meta = getReceivablesElement("receivables-results-meta");

  if (!container || !pagination) {
    return;
  }

  const receivables = getFilteredReceivablesForView();
  const totalPages = Math.max(1, Math.ceil(receivables.length / RECEIVABLES_PAGE_SIZE));

  if (receivablesPage > totalPages) {
    receivablesPage = totalPages;
  }

  if (false && meta) {
    meta.textContent = `${receivables.length} resultados · P\u00e1gina ${receivablesPage} de ${totalPages}`;
  }

  if (meta) {
    meta.textContent = `${receivables.length} resultados \u00B7 P\u00e1gina ${receivablesPage} de ${totalPages}`;
  }

  if (!receivables.length) {
    const totalReceivables = window.ElaraReceivablesCore.getAllReceivables({}).length;
    const emptyMessage =
      totalReceivables > 0 && hasReceivablesFiltersActive()
        ? "No hay cuentas que coincidan con los filtros."
        : "No hay cuentas por cobrar registradas.";
    container.innerHTML = `<p class="receivables-empty">${escapeReceivableHtml(emptyMessage)}</p>`;
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  const start = (receivablesPage - 1) * RECEIVABLES_PAGE_SIZE;
  const visibleReceivables = receivables.slice(start, start + RECEIVABLES_PAGE_SIZE);

  container.innerHTML = visibleReceivables.map(renderReceivableRow).join("");
  renderReceivablesPagination(pagination, receivables.length, totalPages);
}

function renderReceivableRow(receivable) {
  const payment = getReceivableLatestPayment(receivable.id);
  const statusTone = getReceivableStatusTone(receivable.status);

  return `
    <article class="receivables-row receivables-list-grid">
      <div class="receivables-row__main">
        <strong>${escapeReceivableHtml(receivable.id)}</strong>
        <small>${escapeReceivableHtml(payment ? `Cobro ${payment.id}` : "Sin cobro posterior")}</small>
      </div>
      <div class="receivables-row__stack">
        <strong>${escapeReceivableHtml(receivable.serviceId)}</strong>
        <small>${escapeReceivableHtml(getReceivableServiceType(receivable.serviceId))}</small>
      </div>
      <div class="receivables-row__stack">
        <strong>${escapeReceivableHtml(receivable.customerName || receivable.customerId)}</strong>
        <small>${escapeReceivableHtml(receivable.customerId)}</small>
      </div>
      <time>${escapeReceivableHtml(formatReceivableDate(receivable.serviceDate))}</time>
      <div class="receivables-row__stack receivables-row__amount">
        <strong>${escapeReceivableHtml(formatReceivableMoney(receivable.pendingAmount || receivable.originalAmount))}</strong>
        <small>Original: ${escapeReceivableHtml(formatReceivableMoney(receivable.originalAmount))}</small>
      </div>
      <span class="receivable-status-badge receivable-status-badge--${escapeReceivableHtml(statusTone)}">${escapeReceivableHtml(receivable.status)}</span>
      <div class="receivables-row__actions">
        <button class="button button--compact button--muted" type="button" data-receivable-detail="${escapeReceivableHtml(receivable.id)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderReceivablesPagination(container, total, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-receivables-page="prev"${receivablesPage <= 1 ? " disabled" : ""}>Anterior</button>
    <span>${escapeReceivableHtml(total)} resultados · P\u00e1gina ${escapeReceivableHtml(receivablesPage)} de ${escapeReceivableHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-receivables-page="next"${receivablesPage >= totalPages ? " disabled" : ""}>Siguiente</button>
  `;
}

function openReceivableDetail(receivableId) {
  initReceivables();
  reconcileReceivablesQuietly();

  const receivable = window.ElaraReceivablesCore?.getReceivableById?.(receivableId);

  if (!receivable) {
    notifyReceivables("No se encontr\u00f3 la cuenta por cobrar.", "warning");
    return;
  }

  selectedReceivableId = receivable.id;
  renderReceivableDetail(receivable);
  openReceivableModal("receivable-detail-modal");
}

function renderReceivableDetail(receivable) {
  const content = getReceivablesElement("receivable-detail-content");
  const actions = getReceivablesElement("receivable-detail-actions");
  const service = getServiceById(receivable.serviceId);
  const customer = getCustomerById(receivable.customerId);
  const activePayment = window.ElaraReceivablesCore?.getActiveReceivablePayment?.(receivable.id);
  const latestPayment = activePayment || getReceivableLatestPayment(receivable.id);
  const session = getReceivablesCurrentUser();

  setReceivablesText("receivable-detail-title", `Detalle ${receivable.id}`);
  setReceivablesText("receivable-detail-description", `${receivable.serviceId} · ${receivable.customerName || receivable.customerId}`);

  if (content) {
    content.innerHTML = [
      renderReceivableDetailSection("Resumen", [
        ["Cuenta", receivable.id],
        ["Estado", receivable.status],
        ["Importe original", formatReceivableMoney(receivable.originalAmount)],
        ["Pendiente", formatReceivableMoney(receivable.pendingAmount)],
        ["Fecha servicio", formatReceivableDate(receivable.serviceDate)],
        ["Creada por", receivable.createdByUserName || "Sistema"],
      ]),
      renderReceivableDetailSection("Servicio", [
        ["Servicio", receivable.serviceId],
        ["Tipo", service?.type || "Sin informaci\u00f3n"],
        ["Origen", service?.origin || "Sin informaci\u00f3n"],
        ["Destino", service?.destination || "Sin informaci\u00f3n"],
        ["Estado operativo", service?.status || "Sin informaci\u00f3n"],
        ["Estado de cobro", getReceivableCollectionDisplayStatus(receivable, service, activePayment)],
      ]),
      renderReceivableDetailSection("Cliente", [
        ["Cliente", customer?.name || receivable.customerName || "Sin informaci\u00f3n"],
        ["C\u00f3digo", receivable.customerId],
        ["Email", customer?.email || "Sin informaci\u00f3n"],
    ["Tel\u00e9fono", getCustomerPhone(customer)],
      ]),
      latestPayment ? renderReceivablePaymentSection(latestPayment) : "",
    ].join("");
  }

  if (actions) {
    const canCollect = window.ElaraReceivablesCore?.canCollectReceivable?.(receivable, session);
    const canAnnul = activePayment && window.ElaraReceivablesCore?.canAnnulReceivablePayment?.(activePayment, session);
    actions.innerHTML = `
      <div class="receivable-detail-actions__group"></div>
      <div class="receivable-detail-actions__group receivable-detail-actions__group--right">
        ${canCollect ? `<button class="button button--compact" type="button" data-receivable-collect="${escapeReceivableHtml(receivable.id)}">Registrar cobro</button>` : ""}
        ${canAnnul ? `<button class="button button--compact button--danger" type="button" data-receivable-annul="${escapeReceivableHtml(activePayment.id)}">Anular cobro</button>` : ""}
        <button class="button button--compact button--muted" type="button" data-receivable-modal-close>Cerrar</button>
      </div>
    `;
  }
}

function renderReceivableDetailSection(title, fields) {
  return `
    <h3 class="modal__section-title">${escapeReceivableHtml(title)}</h3>
    <dl class="modal__grid service-summary__list">
      ${fields
        .map(
          ([label, value]) => `
            <div class="modal__field">
              <dt class="modal__field-label">${escapeReceivableHtml(label)}</dt>
              <dd class="modal__field-value">${escapeReceivableHtml(value || "Sin informaci\u00f3n")}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderReceivablePaymentSection(payment) {
  return renderReceivableDetailSection("Cobro posterior", [
    ["Pago", payment.id],
    ["Estado", payment.status],
    ["M\u00e9todo", payment.method],
    ["Importe", formatReceivableMoney(payment.amount)],
    ["Fecha de cobro", formatReceivableDateTime(payment.paidAt)],
    ["Registrado por", payment.registeredByUserName || "Sin informaci\u00f3n"],
    ["Caja", payment.cashMovementId || "Sin movimiento"],
    ["Observaciones", payment.observations || "Sin observaciones"],
    ["Motivo anulaci\u00f3n", payment.annulmentReason || "No aplica"],
  ]);
}

function getReceivableCollectionDisplayStatus(receivable = {}, service = null, activePayment = null) {
  if (activePayment?.status === "Registrado") {
    return "Cobrado";
  }

  if (receivable.status === "Cobrada" && Number(receivable.pendingAmount) === 0) {
    return "Cobrado";
  }

  return service?.financial?.collectionStatus || service?.financial?.paymentStatus || "Pendiente";
}

function openReceivablePaymentModal(receivableId) {
  const receivable = window.ElaraReceivablesCore?.getReceivableById?.(receivableId);

  if (!receivable || !window.ElaraReceivablesCore?.canCollectReceivable?.(receivable, getReceivablesCurrentUser())) {
    notifyReceivables("No tienes permiso para registrar este cobro.", "error");
    return;
  }

  selectedReceivableId = receivable.id;
  setReceivableInputValue("receivable-payment-id", receivable.id);
  setReceivableInputValue("receivable-payment-amount", formatReceivableMoney(receivable.pendingAmount));
  setReceivableInputValue("receivable-payment-method", "");
  setReceivableInputValue("receivable-payment-date", getReceivableTodayValue());
  setReceivableInputValue("receivable-payment-user", getReceivablesCurrentUser()?.name || "Usuario actual");
  setReceivableInputValue("receivable-payment-observations", "");
  setReceivableFormError("receivable-payment-error", "");
  setReceivableHtml(
    "receivable-payment-summary",
    `<span>${escapeReceivableHtml(receivable.id)} · ${escapeReceivableHtml(receivable.serviceId)}</span><small>${escapeReceivableHtml(receivable.customerName)} · Pendiente ${escapeReceivableHtml(formatReceivableMoney(receivable.pendingAmount))}</small>`,
  );
  openReceivableModal("receivable-payment-modal");
}

function openReceivableAnnulModal(paymentId) {
  const payment = window.ElaraReceivablesCore?.getReceivablePayment?.(paymentId);

  if (!payment || !window.ElaraReceivablesCore?.canAnnulReceivablePayment?.(payment, getReceivablesCurrentUser())) {
    notifyReceivables("Solo Superadmin puede anular cobros posteriores.", "error");
    return;
  }

  selectedReceivablePaymentId = payment.id;
  setReceivableInputValue("receivable-annul-payment-id", payment.id);
  setReceivableInputValue("receivable-annul-reason", "");
  setReceivableFormError("receivable-annul-error", "");
  setReceivableHtml(
    "receivable-annul-summary",
    `<span>${escapeReceivableHtml(payment.id)} · ${escapeReceivableHtml(payment.serviceId)}</span><small>${escapeReceivableHtml(payment.customerName)} · ${escapeReceivableHtml(formatReceivableMoney(payment.amount))}</small>`,
  );
  openReceivableModal("receivable-annul-modal");
}

function submitReceivablePayment(event) {
  event.preventDefault();

  const receivable = window.ElaraReceivablesCore?.getReceivableById?.(getReceivableInputValue("receivable-payment-id"));

  if (!receivable) {
    setReceivableFormError("receivable-payment-error", "Cuenta por cobrar no encontrada.");
    return;
  }

  const result = window.ElaraReceivablesCore.registerReceivablePayment(
    receivable.id,
    {
      amount: receivable.pendingAmount,
      method: getReceivableInputValue("receivable-payment-method"),
      paidAt: getReceivableInputValue("receivable-payment-date"),
      observations: getReceivableInputValue("receivable-payment-observations"),
    },
    getReceivablesCurrentUser(),
  );

  if (!result.ok) {
    setReceivableFormError("receivable-payment-error", result.error || "No se pudo registrar el cobro.");
    return;
  }

  closeReceivableModal(getReceivablesElement("receivable-payment-modal"));
  closeReceivableModal(getReceivablesElement("receivable-detail-modal"));
  selectedReceivableId = "";
  selectedReceivablePaymentId = "";
  renderReceivablesView();
  notifyReceivables("Cobro registrado correctamente.", "success");
}

function submitReceivableAnnulment(event) {
  event.preventDefault();

  const paymentId = getReceivableInputValue("receivable-annul-payment-id");
  const reason = getReceivableInputValue("receivable-annul-reason");
  const result = window.ElaraReceivablesCore.annulReceivablePayment(paymentId, reason, getReceivablesCurrentUser());

  if (!result.ok) {
    setReceivableFormError("receivable-annul-error", result.error || "No se pudo anular el cobro.");
    return;
  }

  closeReceivableModal(getReceivablesElement("receivable-annul-modal"));
  closeReceivableModal(getReceivablesElement("receivable-detail-modal"));
  selectedReceivableId = "";
  selectedReceivablePaymentId = "";
  renderReceivablesView();
  notifyReceivables("Cobro anulado correctamente.", "success");
}

function getFilteredReceivablesForView() {
  const coreFilters = getReceivablesCoreFilters();
  const method = receivablesFilters.method;

  return window.ElaraReceivablesCore
    .getAllReceivables(coreFilters)
    .filter((receivable) => {
      if (!method) {
        return true;
      }

      return getReceivablePaymentHistory(receivable.id).some((payment) => payment.method === method);
    })
    .sort(compareReceivablesForAdminView);
}

function getReceivablesCoreFilters() {
  return {
    status: receivablesFilters.status,
    customerId: receivablesFilters.customerId,
    method: receivablesFilters.method,
    dateFrom: receivablesFilters.dateFrom,
    dateTo: receivablesFilters.dateTo,
    search: receivablesFilters.search,
  };
}

function compareReceivablesForAdminView(first, second) {
  if (first.status === "Pendiente" && second.status !== "Pendiente") return -1;
  if (first.status !== "Pendiente" && second.status === "Pendiente") return 1;

  if (first.status === "Pendiente" && second.status === "Pendiente") {
    return first.serviceDate.localeCompare(second.serviceDate) || first.serviceId.localeCompare(second.serviceId);
  }

  return getReceivableLastActivityTime(second) - getReceivableLastActivityTime(first) || first.id.localeCompare(second.id);
}

function getReceivablesSummaryFromCollection(receivables) {
  const payments = window.ElaraReceivablesCore?.getReceivablePaymentHistory?.() || [];
  const filteredIds = new Set(receivables.map((receivable) => receivable.id));
  const visiblePayments = payments.filter(
    (payment) => filteredIds.has(payment.receivableId) && (!receivablesFilters.method || payment.method === receivablesFilters.method),
  );
  const pendingReceivables = receivables.filter((receivable) => receivable.status === "Pendiente");
  const collectedPayments = visiblePayments.filter((payment) => payment.status === "Registrado");

  return {
    totalPendingAmount: roundReceivableMoney(pendingReceivables.reduce((total, receivable) => total + receivable.pendingAmount, 0)),
    pendingCount: pendingReceivables.length,
    collectedAmount: roundReceivableMoney(collectedPayments.reduce((total, payment) => total + payment.amount, 0)),
    collectedCount: collectedPayments.length,
    customersWithDebt: new Set(pendingReceivables.map((receivable) => receivable.customerId)).size,
  };
}

function updateReceivablesFilterSummary() {
  const label = getReceivablesElement("receivables-filter-label");

  if (!label) {
    return;
  }

  const activeCount = Object.values(receivablesFilters).filter(Boolean).length;
  label.textContent = activeCount ? `Filtro · ${activeCount}` : "Filtro";
}

function populateReceivablesCustomerFilter() {
  const select = getReceivablesElement("receivables-filter-customer");

  if (!select) {
    return;
  }

  const selectedValue = receivablesFilters.customerId;
  const customers = getCustomersCollection()
    .map((customer) => ({
      id: getCustomerId(customer),
      name: customer.name || customer.company || customer.tradeName || customer.id || customer.code,
    }))
    .filter((customer) => customer.id)
    .sort((first, second) => first.name.localeCompare(second.name));

  select.innerHTML = [
    '<option value="">Todos</option>',
    ...customers.map((customer) => `<option value="${escapeReceivableHtml(customer.id)}">${escapeReceivableHtml(customer.name)}</option>`),
  ].join("");
  select.value = selectedValue;
}

function syncReceivablesFilterControls() {
  setReceivableInputValue("receivables-filter-status", receivablesFilters.status);
  setReceivableInputValue("receivables-filter-customer", receivablesFilters.customerId);
  setReceivableInputValue("receivables-filter-method", receivablesFilters.method);
  setReceivableInputValue("receivables-filter-from", receivablesFilters.dateFrom);
  setReceivableInputValue("receivables-filter-to", receivablesFilters.dateTo);
  setReceivableInputValue("receivables-filter-search", receivablesFilters.search);
}

function clearReceivablesFilters() {
  receivablesFilters = getDefaultReceivablesFilters();
  receivablesPage = 1;
  renderReceivablesView();
}

function applyPendingReceivablesCustomerFilter() {
  if (!pendingReceivablesCustomerFilter) {
    return;
  }

  receivablesFilters.customerId = pendingReceivablesCustomerFilter;
  receivablesPage = 1;
  pendingReceivablesCustomerFilter = "";
}

function applyCustomerReceivablesFilter(customerId) {
  pendingReceivablesCustomerFilter = normalizeReceivableId(customerId);

  if (window.ElaraRouter?.navigateTo) {
    window.ElaraRouter.navigateTo("cuentas-por-cobrar");
  } else {
    window.location.hash = "#cuentas-por-cobrar";
  }
}

function handleReceivablesDocumentChange(event) {
  const filter = event.target.closest("#receivables-filter-status, #receivables-filter-customer, #receivables-filter-method, #receivables-filter-from, #receivables-filter-to");

  if (!filter) {
    return;
  }

  receivablesFilters.status = getReceivableInputValue("receivables-filter-status");
  receivablesFilters.customerId = getReceivableInputValue("receivables-filter-customer");
  receivablesFilters.method = getReceivableInputValue("receivables-filter-method");
  receivablesFilters.dateFrom = getReceivableInputValue("receivables-filter-from");
  receivablesFilters.dateTo = getReceivableInputValue("receivables-filter-to");
  receivablesPage = 1;
  renderReceivablesView();
}

function handleReceivablesDocumentInput(event) {
  if (!event.target.closest("#receivables-filter-search")) {
    return;
  }

  receivablesFilters.search = getReceivableInputValue("receivables-filter-search");
  receivablesPage = 1;
  renderReceivablesView();
}

function handleReceivablesDocumentClick(event) {
  const detailButton = event.target.closest("[data-receivable-detail]");
  const collectButton = event.target.closest("[data-receivable-collect]");
  const annulButton = event.target.closest("[data-receivable-annul]");
  const pageButton = event.target.closest("[data-receivables-page]");
  const clearButton = event.target.closest("[data-receivables-clear]");
  const modalClose = event.target.closest("[data-receivable-modal-close]");

  if (detailButton) {
    openReceivableDetail(detailButton.dataset.receivableDetail);
    return;
  }

  if (collectButton) {
    openReceivablePaymentModal(collectButton.dataset.receivableCollect);
    return;
  }

  if (annulButton) {
    openReceivableAnnulModal(annulButton.dataset.receivableAnnul);
    return;
  }

  if (pageButton) {
    receivablesPage += pageButton.dataset.receivablesPage === "next" ? 1 : -1;
    renderReceivablesList();
    return;
  }

  if (clearButton) {
    clearReceivablesFilters();
    return;
  }

  if (event.target.closest("#primary-action")?.dataset.receivablesAction === "reconcile" && isReceivablesViewActive()) {
    const summary = reconcileReceivablesQuietly();
    renderReceivablesView();
    if ((summary.created || 0) || (summary.updated || 0)) {
      notifyReceivables(`Cuentas actualizadas: ${summary.created || 0} creadas, ${summary.updated || 0} actualizadas.`, "success");
    } else {
      notifyReceivables("No hay cambios pendientes en Cuentas por cobrar.", "info");
    }
    return;
  }

  if (modalClose) {
    closeReceivableModal(modalClose.closest(".modal-backdrop"));
    return;
  }

  if (event.target.classList.contains("modal-backdrop") && event.target.dataset.receivableModal === "true") {
    closeReceivableModal(event.target);
  }
}

function handleReceivablesDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const openModals = Array.from(document.querySelectorAll('[data-receivable-modal="true"]:not([hidden])'));
  const modal = openModals.at(-1);

  if (modal) {
    event.preventDefault();
    closeReceivableModal(modal);
  }
}

function handleReceivablesDataUpdated() {
  if (!isReceivablesViewActive()) {
    return;
  }

  renderReceivablesView();
}

function handleReceivablesServicesUpdated() {
  const summary = reconcileReceivablesQuietly();

  if (isReceivablesViewActive() && !(summary.created || summary.updated)) {
    renderReceivablesView();
  }
}

function bindReceivablesEvents() {
  document.addEventListener("change", handleReceivablesDocumentChange);
  document.addEventListener("input", handleReceivablesDocumentInput);
  document.addEventListener("click", handleReceivablesDocumentClick);
  document.addEventListener("keydown", handleReceivablesDocumentKeydown);
  getReceivablesElement("receivable-payment-form")?.addEventListener("submit", submitReceivablePayment);
  getReceivablesElement("receivable-annul-form")?.addEventListener("submit", submitReceivableAnnulment);
  window.addEventListener("elara:receivables-updated", handleReceivablesDataUpdated);
  window.addEventListener("elara:services-updated", handleReceivablesServicesUpdated);
}

function reconcileReceivablesQuietly() {
  if (!window.ElaraReceivablesCore?.reconcileReceivablesFromServices) {
    return { created: 0, updated: 0, omitted: 0, warnings: [] };
  }

  try {
    return window.ElaraReceivablesCore.reconcileReceivablesFromServices(getReceivablesCurrentUser());
  } catch (error) {
    console.error("[ELARA] No se pudo reconciliar Cuentas por cobrar:", error);
    return { created: 0, updated: 0, omitted: 0, warnings: [error.message || "Error de reconciliacion"] };
  }
}

function configureReceivablesPrimaryAction() {
  const primaryAction = getReceivablesElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = false;
    primaryAction.textContent = "Actualizar cuentas";
    primaryAction.dataset.receivablesAction = "reconcile";
    primaryAction.removeAttribute("data-modal-open");
    primaryAction.removeAttribute("data-modal-target");
  }
}

function showReceivablesUnavailable(message) {
  setReceivablesText("page-eyebrow", "GESTI\u00d3N FINANCIERA");
  setReceivablesText("page-title", "Cuentas por cobrar");
  setReceivablesText("page-summary", message);
  configureReceivablesPrimaryAction();

  const summary = getReceivablesElement("receivables-summary");
  const list = getReceivablesElement("receivables-list");
  const pagination = getReceivablesElement("receivables-pagination");

  if (summary) summary.innerHTML = "";
  if (list) list.innerHTML = `<p class="receivables-empty">${escapeReceivableHtml(message)}</p>`;
  if (pagination) pagination.hidden = true;
}

function getReceivableLatestPayment(receivableId) {
  return getReceivablePaymentHistory(receivableId)[0] || null;
}

function getReceivablePaymentHistory(receivableId) {
  const payments = window.ElaraReceivablesCore?.getReceivablePaymentHistory?.() || [];
  const normalizedId = normalizeReceivableId(receivableId);

  return payments.filter((payment) => payment.receivableId === normalizedId);
}

function getReceivableLastActivityTime(receivable) {
  const payment = getReceivableLatestPayment(receivable.id);
  const value = payment?.registeredAt || payment?.paidAt || receivable.settledAt || receivable.createdAt || receivable.serviceDate;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getServiceById(serviceId) {
  const normalizedId = normalizeReceivableId(serviceId);

  return getServicesCollection().find((service) => normalizeReceivableId(service.serviceId || service.id) === normalizedId) || null;
}

function getReceivableServiceType(serviceId) {
  return getServiceById(serviceId)?.type || "Servicio";
}

function getCustomerById(customerId) {
  const normalizedId = normalizeReceivableId(customerId);

  return getCustomersCollection().find((customer) => getCustomerId(customer) === normalizedId) || null;
}

function getCustomerId(customer = {}) {
  return normalizeReceivableId(customer.code || customer.id);
}

function getCustomerPhone(customer) {
  if (!customer) {
    return "Sin informaci\u00f3n";
  }

  return customer.phone || customer.phoneNumber || customer.contact?.phone || "Sin informaci\u00f3n";
}

function getServicesCollection() {
  return Array.isArray(window.ElaraServicesMock?.services) ? window.ElaraServicesMock.services : [];
}

function getCustomersCollection() {
  return Array.isArray(window.ElaraCustomersMock?.customers) ? window.ElaraCustomersMock.customers : [];
}

function getDefaultReceivablesFilters() {
  return {
    status: "",
    customerId: "",
    method: "",
    dateFrom: "",
    dateTo: "",
    search: "",
  };
}

function getReceivablesCurrentUser() {
  return window.ElaraAuth?.getCurrentUser?.() || null;
}

function getReceivableTodayValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
}

function formatReceivableMoney(value) {
  if (window.ElaraCash?.formatCashMoney) {
    return window.ElaraCash.formatCashMoney(value);
  }

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function formatReceivableDate(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const localMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  if (localMatch) {
    return `${localMatch[1]}/${localMatch[2]}/${localMatch[3]}`;
  }

  return "Sin fecha";
}

function formatReceivableDateTime(value) {
  if (!value) {
    return "Sin fecha";
  }

  if (window.ElaraCash?.formatCashDateTime) {
    return window.ElaraCash.formatCashDateTime(value);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-ES");
}

function getReceivableStatusTone(status) {
  return {
    Pendiente: "warning",
    Cobrada: "success",
    Anulada: "neutral",
  }[status] || "neutral";
}

function roundReceivableMoney(value) {
  if (window.ElaraReceivablesCore?.roundReceivableMoney) {
    return window.ElaraReceivablesCore.roundReceivableMoney(value);
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function openReceivableModal(id) {
  const modal = getReceivablesElement(id);

  if (modal) {
    modal.hidden = false;
  }
}

function closeReceivableModal(modal) {
  if (!modal) {
    return;
  }

  modal.hidden = true;
}

function setReceivableFormError(id, message) {
  const element = getReceivablesElement(id);

  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.hidden = !message;
}

function getReceivableInputValue(id) {
  return getReceivablesElement(id)?.value.trim() || "";
}

function setReceivableInputValue(id, value) {
  const element = getReceivablesElement(id);

  if (element) {
    element.value = value ?? "";
  }
}

function setReceivableHtml(id, value) {
  const element = getReceivablesElement(id);

  if (element) {
    element.innerHTML = value;
  }
}

function setReceivablesText(id, value) {
  const element = getReceivablesElement(id);

  if (element) {
    element.textContent = value;
  }
}

function getReceivablesElement(id) {
  return document.getElementById(id);
}

function isReceivablesViewActive() {
  const view = getReceivablesElement("cuentas-por-cobrar");

  return Boolean(view && !view.hidden && window.location.hash.replace(/^#\/?/, "") === "cuentas-por-cobrar");
}

function hasReceivablesFiltersActive() {
  return Object.values(receivablesFilters).some(Boolean);
}

function notifyReceivables(message, type = "info") {
  if (window.ElaraNotifications?.showToast) {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function normalizeReceivableId(value) {
  return String(value || "").trim();
}

function escapeReceivableHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.ElaraReceivables = {
  applyCustomerFilter: applyCustomerReceivablesFilter,
  initReceivables,
  openReceivableDetail,
  openReceivablePaymentModal,
  showReceivables,
};
