/*
  Proyecto Atlas / ELARA Transport
  Archivo: expenses.js
  Responsabilidad: interfaz administrativa mock del modulo Gastos.
*/

"use strict";

const EXPENSES_PAGE_SIZE = 20;
const EXPENSES_STATUS_FILTERS = [
  "Pendiente de revisi\u00f3n",
  "Requiere informaci\u00f3n",
  "Pendiente de pago",
  "Pendiente de reembolso",
  "Pagada",
  "Reembolsada",
  "Rechazada",
  "Anulada",
];

let isExpensesInitialized = false;
let expensesPage = 1;
let selectedExpenseId = "";
let pendingExpenseAction = null;
let expensesFilters = getDefaultExpensesFilters();

function initExpenses() {
  if (isExpensesInitialized) {
    return;
  }

  renderExpensesStaticFilters();
  ensureExpensesModals();
  bindExpensesEvents();
  isExpensesInitialized = true;
}

function showExpenses() {
  if (!canExpenseAction("expenses.viewAll")) {
    showExpensesUnavailable("No tienes acceso a Gastos.");
    return;
  }

  setExpensesText("page-eyebrow", "FINANZAS");
  setExpensesText("page-title", "Gastos");
  setExpensesText("page-summary", "Gestiona costes operativos, solicitudes, pagos y reembolsos.");
  configureExpensesPrimaryAction();
  renderExpensesView();
}

function renderExpensesView() {
  updateExpensesFilterSummary();
  renderExpensesSummary();
  renderExpensesList();
}

function renderExpensesSummary() {
  const container = getExpensesElement("expenses-summary");

  if (!container) {
    return;
  }

  const summary = window.ElaraExpensesCore.getExpenseSummary(getExpensesCoreFilters());
  const metrics = [
    ["Solicitado", formatExpenseMoney(summary.totalRequested), "neutral"],
    ["Aprobado", formatExpenseMoney(summary.totalApproved), "info"],
    ["Pagado", formatExpenseMoney(summary.totalPaid), "success"],
    ["Pendientes de revisi\u00f3n", String(summary.pendingReviewCount), "warning"],
    ["Pendiente de pago", formatExpenseMoney(summary.pendingPaymentAmount), "warning"],
    ["Pendiente de reembolso", formatExpenseMoney(summary.pendingReimbursementAmount), "warning"],
  ];

  container.innerHTML = metrics
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${escapeExpenseHtml(tone)}">
          <span>${escapeExpenseHtml(label)}</span>
          <strong>${escapeExpenseHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderExpensesList() {
  const container = getExpensesElement("expenses-list");
  const pagination = getExpensesElement("expenses-pagination");

  if (!container || !pagination) {
    return;
  }

  const expenses = getFilteredExpensesForView();
  const totalPages = Math.max(1, Math.ceil(expenses.length / EXPENSES_PAGE_SIZE));

  if (expensesPage > totalPages) {
    expensesPage = totalPages;
  }

  if (!expenses.length) {
    container.innerHTML = '<p class="expenses-empty">No hay gastos que coincidan con los filtros.</p>';
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  const start = (expensesPage - 1) * EXPENSES_PAGE_SIZE;
  const visibleExpenses = expenses.slice(start, start + EXPENSES_PAGE_SIZE);

  container.innerHTML = visibleExpenses.map(renderExpenseRow).join("");
  renderExpensesPagination(pagination, expenses.length, totalPages);
}

function renderExpenseRow(expense) {
  const badge = getExpenseStatusBadge(expense.status);
  const relation = getExpenseRelationLabel(expense);
  const responsible = getExpenseResponsibleLabel(expense);
  const approved = expense.amountApproved !== null ? `<small>Aprobado: ${escapeExpenseHtml(formatExpenseMoney(expense.amountApproved))}</small>` : "";

  return `
    <article class="expenses-row expenses-list-grid">
      <div class="expenses-row__main">
        <strong>${escapeExpenseHtml(expense.expenseId)}</strong>
        <span>${escapeExpenseHtml(expense.concept || "Sin concepto")}</span>
        <small>${escapeExpenseHtml(expense.category)}${expense.requiresExceptionalApproval ? " \u00B7 Excepcional" : ""}</small>
      </div>
      <time>${escapeExpenseHtml(formatExpenseDate(expense.expenseDate))}</time>
      <div class="expenses-row__stack">
        <strong>${escapeExpenseHtml(responsible.primary)}</strong>
        <small>${escapeExpenseHtml(responsible.secondary)}</small>
      </div>
      <div class="expenses-row__stack expenses-row__amount">
        <strong>${escapeExpenseHtml(formatExpenseMoney(expense.amountRequested))}</strong>
        ${approved}
      </div>
      <span class="expense-status-badge expense-status-badge--${escapeExpenseHtml(badge.tone)}">${escapeExpenseHtml(expense.status)}</span>
      <div class="expenses-row__stack">
        <strong>${escapeExpenseHtml(relation.primary)}</strong>
        <small>${escapeExpenseHtml(relation.secondary)}</small>
      </div>
      <div class="expenses-row__actions">
        <button class="button button--compact button--muted" type="button" data-expense-detail="${escapeExpenseHtml(expense.expenseId)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderExpensesPagination(container, total, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-expenses-page="prev"${expensesPage <= 1 ? " disabled" : ""}>Anterior</button>
    <span>${escapeExpenseHtml(total)} resultados \u00B7 P\u00e1gina ${escapeExpenseHtml(expensesPage)} de ${escapeExpenseHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-expenses-page="next"${expensesPage >= totalPages ? " disabled" : ""}>Siguiente</button>
  `;
}

function renderExpensesStaticFilters() {
  const statusContainer = getExpensesElement("expenses-status-filters");
  const categoryContainer = getExpensesElement("expenses-category-filters");

  if (statusContainer) {
    statusContainer.innerHTML = EXPENSES_STATUS_FILTERS.map(
      (status) => `
        <label class="filter-chip"><input type="checkbox" data-expense-filter="status" value="${escapeExpenseHtml(status)}" /><span>${escapeExpenseHtml(status)}</span></label>
      `,
    ).join("");
  }

  if (categoryContainer && window.ElaraExpensesCore?.getExpenseCategories) {
    categoryContainer.innerHTML = window.ElaraExpensesCore
      .getExpenseCategories()
      .map(
        (category) => `
          <label class="filter-chip"><input type="checkbox" data-expense-filter="category" value="${escapeExpenseHtml(category)}" /><span>${escapeExpenseHtml(category)}</span></label>
        `,
      )
      .join("");
  }
}

function bindExpensesEvents() {
  const search = getExpensesElement("expenses-search");
  const from = getExpensesElement("expenses-filter-from");
  const to = getExpensesElement("expenses-filter-to");

  search?.addEventListener("input", () => {
    expensesFilters.query = search.value.trim();
    expensesPage = 1;
    renderExpensesView();
  });

  [from, to].forEach((input) => {
    input?.addEventListener("change", () => {
      expensesFilters.from = from?.value || "";
      expensesFilters.to = to?.value || "";
      expensesPage = 1;
      renderExpensesView();
    });
  });

  document.addEventListener("change", handleExpensesDocumentChange);
  document.addEventListener("click", handleExpensesDocumentClick);
  document.addEventListener("keydown", handleExpensesDocumentKeydown);
  window.addEventListener("elara:expenses-updated", handleExpensesDataUpdated);
  window.addEventListener("elara:cash-updated", handleExpensesDataUpdated);
}

function handleExpensesDocumentChange(event) {
  const filterInput = event.target.closest("[data-expense-filter]");
  const exceptionalInput = event.target.closest("[data-expense-exceptional]");

  if (filterInput) {
    syncExpensesChipFilters();
    expensesPage = 1;
    renderExpensesView();
    return;
  }

  if (exceptionalInput) {
    expensesFilters.exceptional = exceptionalInput.value || "";
    expensesPage = 1;
    renderExpensesView();
    return;
  }

  if (event.target.id === "expense-new-paid-by") {
    updateNewExpensePaymentState();
  }

  if (event.target.id === "expense-new-receipt-status") {
    updateNewExpenseReceiptState();
  }
}

function handleExpensesDocumentClick(event) {
  const primaryAction = event.target.closest("#primary-action");

  if (primaryAction && isExpensesViewActive() && canExpenseAction("expenses.create")) {
    event.preventDefault();
    openNewExpenseModal();
    return;
  }

  const clearButton = event.target.closest("[data-expenses-clear]");

  if (clearButton) {
    clearExpensesFilters();
    return;
  }

  const pageButton = event.target.closest("[data-expenses-page]");

  if (pageButton) {
    changeExpensesPage(pageButton.dataset.expensesPage);
    return;
  }

  const detailButton = event.target.closest("[data-expense-detail]");

  if (detailButton) {
    openExpenseDetailModal(detailButton.dataset.expenseDetail);
    return;
  }

  const actionButton = event.target.closest("[data-expense-action]");

  if (actionButton) {
    handleExpenseAction(actionButton.dataset.expenseAction);
    return;
  }

  const modalClose = event.target.closest("[data-expense-modal-close]");

  if (modalClose) {
    closeExpenseModal(modalClose.closest(".modal-backdrop"));
    return;
  }

  if (event.target.classList.contains("modal-backdrop") && event.target.dataset.expenseModal === "true") {
    closeExpenseModal(event.target);
  }
}

function handleExpensesDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const openModals = Array.from(document.querySelectorAll('[data-expense-modal="true"]:not([hidden])'));
  const modal = openModals.at(-1);

  if (modal) {
    event.preventDefault();
    event.stopPropagation();
    closeExpenseModal(modal);
  }
}

function handleExpensesDataUpdated() {
  if (!isExpensesViewActive()) {
    return;
  }

  renderExpensesView();

  if (selectedExpenseId && !getExpenseById(selectedExpenseId)) {
    selectedExpenseId = "";
    closeExpenseModal(getExpensesElement("expense-detail-modal"));
  } else if (selectedExpenseId && !getExpensesElement("expense-detail-modal")?.hidden) {
    renderExpenseDetail(selectedExpenseId);
  }
}

function configureExpensesPrimaryAction() {
  const primaryAction = getExpensesElement("primary-action");

  if (!primaryAction) {
    return;
  }

  primaryAction.textContent = "Nuevo gasto";
  primaryAction.hidden = !canExpenseAction("expenses.create");
  primaryAction.removeAttribute("data-modal-open");
  primaryAction.removeAttribute("data-modal-target");
}

function showExpensesUnavailable(message) {
  setExpensesText("page-eyebrow", "FINANZAS");
  setExpensesText("page-title", "Gastos");
  setExpensesText("page-summary", message);
  const primaryAction = getExpensesElement("primary-action");
  const summary = getExpensesElement("expenses-summary");
  const list = getExpensesElement("expenses-list");
  const pagination = getExpensesElement("expenses-pagination");

  if (primaryAction) {
    primaryAction.hidden = true;
  }

  if (summary) {
    summary.innerHTML = "";
  }

  if (list) {
    list.innerHTML = `<p class="expenses-empty">${escapeExpenseHtml(message)}</p>`;
  }

  if (pagination) {
    pagination.hidden = true;
  }
}

function openNewExpenseModal() {
  if (!canExpenseAction("expenses.create")) {
    notifyExpense("No tienes permiso para crear gastos.", "error");
    return;
  }

  const form = getExpensesElement("expense-new-form");

  if (form) {
    form.reset();
  }

  setExpenseInputValue("expense-new-date", getExpenseTodayValue());
  setExpenseInputValue("expense-new-amount", "");
  setExpenseInputValue("expense-new-receipt-file", "");
  populateExpenseSelects();
  updateNewExpensePaymentState();
  updateNewExpenseReceiptState();
  setExpenseFormError("expense-new-error", "");
  openExpenseModal("expense-new-modal");
  getExpensesElement("expense-new-category")?.focus();
}

function submitNewExpense(event) {
  event.preventDefault();

  if (!canExpenseAction("expenses.create")) {
    notifyExpense("No tienes permiso para crear gastos.", "error");
    return;
  }

  const amount = getExpenseNumberInput("expense-new-amount");
  const paidBy = getExpenseInputValue("expense-new-paid-by");
  const status = paidBy === "ELARA" && getExpenseInputValue("expense-new-payment-state") === "Pagada" ? "Pagada" : "Pendiente de pago";
  const method = status === "Pagada" ? getExpenseInputValue("expense-new-method") : getExpenseInputValue("expense-new-method") || "No indicado";
  const currentUser = getExpenseCurrentUser();
  const draft = {
    recordType: "Gasto",
    source: "Administraci\u00f3n",
    category: getExpenseInputValue("expense-new-category"),
    concept: getExpenseInputValue("expense-new-concept"),
    amountRequested: amount,
    amountApproved: amount,
    currency: "EUR",
    paidBy: status === "Pagada" ? "ELARA" : "Pendiente de pago",
    paymentMethod: method,
    status,
    expenseDate: getExpenseInputValue("expense-new-date"),
    claimantType: "ELARA",
    claimantName: "ELARA",
    providerName: getExpenseInputValue("expense-new-provider"),
    vehicleId: getExpenseInputValue("expense-new-vehicle") || null,
    serviceId: getExpenseInputValue("expense-new-service") || null,
    description: getExpenseInputValue("expense-new-description"),
    observations: getExpenseInputValue("expense-new-observations"),
    receipt: {
      status: getExpenseInputValue("expense-new-receipt-status") || "No requerido",
      fileName: getExpenseInputValue("expense-new-receipt-file") || null,
      fileReference: null,
    },
    review: {
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: currentUser?.id || "",
      reviewedByName: currentUser?.name || "Administracion",
      decision: status === "Pagada" ? "Aprobada" : "Aprobada",
      reason: "Gasto administrativo creado desde el modulo Gastos.",
    },
    payment:
      status === "Pendiente de pago"
        ? {
            required: true,
            status: "Pendiente",
            amount,
            paidAt: null,
            paidByUserId: null,
            paidByName: null,
            cashMovementId: null,
          }
        : undefined,
  };

  if (draft.receipt.status === "Adjunto" && !draft.receipt.fileName) {
    setExpenseFormError("expense-new-error", "Indica el nombre mock del comprobante.");
    notifyExpense("Indica el nombre mock del comprobante.", "warning");
    return;
  }

  if (draft.status === "Pagada" && draft.paymentMethod === "No indicado") {
    setExpenseFormError("expense-new-error", "Selecciona el metodo de pago.");
    notifyExpense("Selecciona el metodo de pago.", "warning");
    return;
  }

  const validation = window.ElaraExpensesCore.validateExpenseDraft(draft);

  if (!validation.ok) {
    setExpenseFormError("expense-new-error", validation.error);
    notifyExpense(validation.error, "warning");
    return;
  }

  const result = window.ElaraExpensesCore.createExpenseRecord(draft, currentUser);

  if (!result.ok) {
    setExpenseFormError("expense-new-error", result.error);
    notifyExpense(result.error, "error");
    return;
  }

  if (result.data.status === "Pagada" && result.data.paymentMethod === "Efectivo") {
    const cashResult = registerExpenseCashOutflow(result.data, "payment");

    if (!cashResult.ok) {
      rollbackCreatedExpense(result.data.expenseId);
      setExpenseFormError("expense-new-error", cashResult.error);
      notifyExpense(cashResult.error, "error");
      return;
    }

    result.data.payment.cashMovementId = cashResult.movementId;
  }

  addExpenseActivity("EXPENSE_CREATED", "Gasto creado", `${result.data.expenseId} fue registrado en Gastos.`, result.data);
  closeExpenseModal(getExpensesElement("expense-new-modal"));
  renderExpensesView();
  notifyExpense("Gasto registrado correctamente.", "success");
}

function openExpenseDetailModal(expenseId) {
  const expense = getExpenseById(expenseId);

  if (!expense) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  selectedExpenseId = expense.expenseId;
  renderExpenseDetail(expense.expenseId);
  openExpenseModal("expense-detail-modal");
}

function renderExpenseDetail(expenseId) {
  const expense = getExpenseById(expenseId);
  const container = getExpensesElement("expense-detail-content");
  const actions = getExpensesElement("expense-detail-actions");

  if (!expense || !container || !actions) {
    return;
  }

  setExpensesText("expense-detail-id", expense.expenseId);
  container.innerHTML = `
    ${renderExpenseDetailSection("Informaci\u00f3n general", getExpenseGeneralFields(expense))}
    ${renderExpenseAmountSection(expense)}
    ${renderExpenseDetailSection("Relaciones", getExpenseRelationFields(expense))}
    ${renderExpenseDetailSection("Revisi\u00f3n", getExpenseReviewFields(expense))}
    ${renderExpenseDetailSection(expense.reimbursement.required ? "Reembolso" : "Pago", getExpenseSettlementFields(expense))}
    ${expense.cancellation.cancelledAt ? renderExpenseDetailSection("Anulaci\u00f3n", [
      ["Fecha", formatExpenseDateTime(expense.cancellation.cancelledAt)],
      ["Usuario", expense.cancellation.cancelledByName || "Sistema"],
      ["Motivo", expense.cancellation.reason || "Sin motivo"],
    ]) : ""}
  `;
  actions.innerHTML = renderExpenseDetailActions(expense);
}

function renderExpenseDetailSection(title, fields, options = {}) {
  const normalizedFields = fields
    .map(normalizeExpenseDetailField)
    .filter((field) => field && hasUsefulExpenseDetailValue(field.value));

  if (!normalizedFields.length) {
    return "";
  }

  const classes = ["expense-detail-section", options.compact ? "expense-detail-section--compact" : "", options.className || ""].filter(Boolean).join(" ");

  return `
    <section class="${escapeExpenseHtml(classes)}">
      <h3 class="modal__section-title">${escapeExpenseHtml(title)}</h3>
      <dl class="modal__fields-grid">
        ${normalizedFields
          .map(
            (field) => `
              <div class="modal__field${field.full ? " modal__field--full" : ""}">
                <dt class="modal__field-label">${escapeExpenseHtml(field.label)}</dt>
                <dd class="modal__field-value">${escapeExpenseHtml(field.value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderExpenseAmountSection(expense) {
  const amountItems = [
    ["Solicitado", formatExpenseMoney(expense.amountRequested), "strong"],
    ["Aprobado", expense.amountApproved === null ? "Pendiente de aprobaci\u00f3n" : formatExpenseMoney(expense.amountApproved), "strong"],
    ["Pagado por", expense.paidBy],
    ["M\u00e9todo", expense.paymentMethod || "No indicado"],
  ];

  return `
    <section class="expense-detail-section expense-detail-section--amounts">
      <h3 class="modal__section-title">Importes</h3>
      <div class="expense-detail-amount-grid">
        ${amountItems
          .map(
            ([label, value, tone]) => `
              <div class="expense-detail-amount">
                <span>${escapeExpenseHtml(label)}</span>
                <strong class="${tone === "strong" ? "expense-detail-amount__value" : ""}">${escapeExpenseHtml(value)}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function getExpenseGeneralFields(expense) {
  const receiptFields = [["Estado comprobante", expense.receipt.status || "No adjunto"]];

  if (expense.receipt.fileName) {
    receiptFields.push(["Archivo comprobante", expense.receipt.fileName, true]);
  }

  return [
    ["Tipo", expense.recordType],
    ["Origen", expense.source],
    ["Categor\u00eda", expense.category],
    ["Fecha", formatExpenseDate(expense.expenseDate)],
    ["Concepto", expense.concept, true],
    ["Descripci\u00f3n", expense.description, true],
    ["Proveedor", expense.providerName],
    ...receiptFields,
  ];
}

function getExpenseRelationFields(expense) {
  const responsible = getExpenseResponsibleLabel(expense);
  const creator = getExpenseCreatorLabel(expense);
  const fields = [
    ["Solicitante", responsible.primary],
  ];

  if (shouldShowExpenseCreator(expense)) {
    fields.push(["Registrado por", creator]);
  }

  fields.push(
    ["Veh\u00edculo", getExpenseVehicleLabel(expense.vehicleId)],
    ["Servicio", getExpenseServiceLabel(expense.serviceId)],
  );

  return fields.filter(([, value]) => !isEmptyExpenseRelation(value));
}

function getExpenseReviewFields(expense) {
  const hasReviewInfo = Boolean(expense.review.reviewedAt || expense.review.reviewedByName || expense.review.decision || expense.review.reason);
  const shouldShowReview = hasReviewInfo || expense.status !== "Pendiente de revisi\u00f3n";

  if (!shouldShowReview) {
    return [];
  }

  return [
    ["Decisi\u00f3n", expense.review.decision || expense.status],
    ["Revisor", expense.review.reviewedByName],
    ["Fecha", formatExpenseDateTime(expense.review.reviewedAt)],
    ["Motivo", expense.review.reason, true],
  ];
}

function normalizeExpenseDetailField(field) {
  if (!Array.isArray(field)) {
    return null;
  }

  return {
    label: field[0],
    value: field[1],
    full: Boolean(field[2]),
  };
}

function hasUsefulExpenseDetailValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  const text = String(value).trim();

  return Boolean(text && text !== "-" && text !== "No aplica" && text !== "Sin fecha" && text !== "Sin referencia" && text !== "Sin motivo" && text !== "Sin registro");
}

function isEmptyExpenseRelation(value) {
  const text = String(value || "").trim();

  return !text || text === "Sin vehiculo" || text === "Sin servicio" || text === "Sin relacion" || text === "Sin proveedor";
}

function renderExpenseDetailActions(expense) {
  const leftActions = [];
  const rightActions = [];

  if (window.ElaraExpensesCore.canApproveExpense(expense, getExpenseCurrentUser())) {
    rightActions.push('<button class="button button--compact" type="button" data-expense-action="approve">Aprobar</button>');
    rightActions.push('<button class="button button--compact button--muted" type="button" data-expense-action="partial">Aprobar parcialmente</button>');
  } else if (expense.requiresExceptionalApproval && expense.status === "Pendiente de revisi\u00f3n" && getExpenseActiveContext() === "administrativo") {
    rightActions.push('<span class="modal__hint expense-action-note">Requiere aprobaci&oacute;n excepcional de Superadmin.</span>');
  }

  if (window.ElaraExpensesCore.canRequestExpenseInformation(expense, getExpenseCurrentUser())) {
    rightActions.push('<button class="button button--compact button--muted" type="button" data-expense-action="info">Solicitar informaci&oacute;n</button>');
  }

  if (window.ElaraExpensesCore.canRejectExpense(expense, getExpenseCurrentUser())) {
    rightActions.push('<button class="button button--compact button--danger" type="button" data-expense-action="reject">Rechazar</button>');
  }

  if (window.ElaraExpensesCore.canPayExpense(expense, getExpenseCurrentUser())) {
    rightActions.push('<button class="button button--compact" type="button" data-expense-action="payment">Registrar pago</button>');
  }

  if (window.ElaraExpensesCore.canReimburseExpense(expense, getExpenseCurrentUser())) {
    rightActions.push('<button class="button button--compact" type="button" data-expense-action="reimbursement">Registrar reembolso</button>');
  }

  if (window.ElaraExpensesCore.canCancelExpense(expense, getExpenseCurrentUser())) {
    leftActions.push('<button class="button button--compact button--danger" type="button" data-expense-action="cancel">Anular</button>');
  }

  rightActions.push('<button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>');

  return `
    <div class="expense-detail-actions__group expense-detail-actions__group--left">${leftActions.join("")}</div>
    <div class="expense-detail-actions__group expense-detail-actions__group--right">${rightActions.join("")}</div>
  `;
}

function handleExpenseAction(action) {
  const expense = getExpenseById(selectedExpenseId);

  if (!expense) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (["approve", "partial", "info", "reject"].includes(action)) {
    openExpenseReviewModal(expense, action);
    return;
  }

  if (action === "payment" || action === "reimbursement") {
    openExpenseSettlementModal(expense, action);
    return;
  }

  if (action === "cancel") {
    openExpenseCancelModal(expense);
  }
}

function openExpenseReviewModal(expense, action) {
  pendingExpenseAction = { type: action, expenseId: expense.expenseId };
  const isApproval = action === "approve" || action === "partial";
  const amountField = getExpensesElement("expense-review-amount-field");
  const amountInput = getExpensesElement("expense-review-amount");
  const reason = getExpensesElement("expense-review-reason");

  setExpensesText("expense-review-title", getExpenseReviewTitle(action));
  renderExpenseReviewSummary(expense);
  setExpenseInputValue("expense-review-amount", action === "partial" ? "" : expense.amountRequested);
  setExpenseInputValue("expense-review-reason", "");
  setExpenseFormError("expense-review-error", "");

  if (amountField) {
    amountField.hidden = !isApproval;
  }

  if (amountInput) {
    amountInput.readOnly = action === "approve";
    amountInput.max = expense.amountRequested;
  }

  if (reason) {
    reason.required = action !== "approve";
  }

  openExpenseModal("expense-review-modal");
  (isApproval ? getExpensesElement("expense-review-amount") : reason)?.focus();
}

function submitExpenseReview(event) {
  event.preventDefault();

  const expense = getExpenseById(pendingExpenseAction?.expenseId);

  if (!expense) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  const action = pendingExpenseAction.type;
  const reason = getExpenseInputValue("expense-review-reason");
  let result = null;

  if (action === "approve" || action === "partial") {
    const amount = getExpenseNumberInput("expense-review-amount");

    if (action === "partial" && amount >= window.ElaraExpensesCore.roundExpenseMoney(expense.amountRequested)) {
      setExpenseFormError("expense-review-error", "El importe parcial debe ser menor que el solicitado.");
      notifyExpense("El importe parcial debe ser menor que el solicitado.", "warning");
      return;
    }

    if (action === "partial" && !reason) {
      setExpenseFormError("expense-review-error", "Indica el motivo de la aprobacion parcial.");
      notifyExpense("Indica el motivo de la aprobacion parcial.", "warning");
      return;
    }

    result = window.ElaraExpensesCore.approveExpense(expense.expenseId, amount, { reason }, getExpenseCurrentUser());
  } else if (action === "info") {
    if (!reason) {
      setExpenseFormError("expense-review-error", "Indica la informacion adicional solicitada.");
      notifyExpense("Indica la informacion adicional solicitada.", "warning");
      return;
    }

    result = window.ElaraExpensesCore.requestExpenseInformation(expense.expenseId, reason, getExpenseCurrentUser());
  } else if (action === "reject") {
    if (!reason) {
      setExpenseFormError("expense-review-error", "El motivo de rechazo es obligatorio.");
      notifyExpense("El motivo de rechazo es obligatorio.", "warning");
      return;
    }

    result = window.ElaraExpensesCore.rejectExpense(expense.expenseId, reason, getExpenseCurrentUser());
  }

  if (!result?.ok) {
    setExpenseFormError("expense-review-error", result?.error || "No se pudo completar la revision.");
    notifyExpense(result?.error || "No se pudo completar la revision.", "error");
    return;
  }

  addExpenseActivity(getExpenseActivityType(action), getExpenseActivityTitle(action), getExpenseActivityDescription(action, result.data), result.data);
  renderExpensesView();
  closeExpenseReviewFlowAfterSuccess();
  notifyExpense(getExpenseReviewToast(action), "success");
}

function renderExpenseReviewSummary(expense) {
  setExpensesText("expense-review-summary-id", expense.expenseId);
  setExpensesText("expense-review-summary-concept", expense.concept || "Sin concepto");
  setExpensesText("expense-review-summary-amount", formatExpenseMoney(expense.amountRequested));
}

function closeExpenseReviewFlowAfterSuccess() {
  closeExpenseModal(getExpensesElement("expense-review-modal"));
  closeExpenseModal(getExpensesElement("expense-detail-modal"));
  selectedExpenseId = "";
}

function openExpenseSettlementModal(expense, type) {
  pendingExpenseAction = { type, expenseId: expense.expenseId };
  const isReimbursement = type === "reimbursement";
  const amount = isReimbursement ? expense.reimbursement.amount : expense.payment.amount;
  const partyLabel = isReimbursement ? "Beneficiario" : "Proveedor";
  const partyValue = isReimbursement ? getExpenseResponsibleLabel(expense).primary : expense.providerName || "Proveedor";

  setExpensesText("expense-settlement-title", isReimbursement ? "Registrar reembolso" : "Registrar pago");
  setExpensesText("expense-settlement-summary-id", expense.expenseId);
  setExpensesText("expense-settlement-summary-party-label", partyLabel);
  setExpensesText("expense-settlement-summary-party", partyValue);
  setExpensesText("expense-settlement-summary-amount", formatExpenseMoney(amount));
  setExpensesText("expense-settlement-method", "Efectivo");
  setExpensesText("expense-settlement-submit-label", isReimbursement ? "Confirmar reembolso" : "Confirmar pago");
  setExpenseInputValue("expense-settlement-notes", "");
  setExpenseFormError("expense-settlement-error", "");
  openExpenseModal("expense-settlement-modal");
  getExpensesElement("expense-settlement-notes")?.focus();
}

function submitExpenseSettlement(event) {
  event.preventDefault();

  const expense = getExpenseById(pendingExpenseAction?.expenseId);
  const type = pendingExpenseAction?.type;

  if (!expense || !["payment", "reimbursement"].includes(type)) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!window.ElaraCash || typeof window.ElaraCash.registerExpenseCashOutflow !== "function") {
    setExpenseFormError("expense-settlement-error", "No se pudo conectar con Caja.");
    notifyExpense("No se pudo conectar con Caja.", "error");
    return;
  }

  const canSettle =
    type === "reimbursement"
      ? window.ElaraExpensesCore.canReimburseExpense(expense, getExpenseCurrentUser())
      : window.ElaraExpensesCore.canPayExpense(expense, getExpenseCurrentUser());

  if (!canSettle) {
    setExpenseFormError("expense-settlement-error", "Esta operacion ya no esta disponible.");
    notifyExpense("Esta operacion ya no esta disponible.", "warning");
    return;
  }

  const notes = getExpenseInputValue("expense-settlement-notes");
  const cashResult = registerExpenseCashOutflow(expense, type, notes);

  if (!cashResult.ok) {
    setExpenseFormError("expense-settlement-error", cashResult.error);
    notifyExpense(cashResult.error, "error");
    return;
  }

  const result =
    type === "reimbursement"
      ? window.ElaraExpensesCore.registerExpenseReimbursement(expense.expenseId, { paymentMethod: "Efectivo", cashMovementId: cashResult.movementId }, getExpenseCurrentUser())
      : window.ElaraExpensesCore.registerExpensePayment(expense.expenseId, { paymentMethod: "Efectivo", cashMovementId: cashResult.movementId }, getExpenseCurrentUser());

  if (!result.ok) {
    setExpenseFormError("expense-settlement-error", result.error);
    notifyExpense(result.error, "error");
    return;
  }

  addExpenseActivity(
    type === "reimbursement" ? "EXPENSE_REIMBURSED" : "EXPENSE_PAID",
    type === "reimbursement" ? "Reembolso registrado" : "Pago registrado",
    `${result.data.expenseId} fue ${type === "reimbursement" ? "reembolsado" : "pagado"} en efectivo.`,
    result.data,
  );
  renderExpensesView();
  closeExpenseSettlementFlowAfterSuccess();
  notifyExpense(type === "reimbursement" ? "Reembolso registrado correctamente." : "Pago registrado correctamente.", "success");
}

function closeExpenseSettlementFlowAfterSuccess() {
  closeExpenseModal(getExpensesElement("expense-settlement-modal"));
  closeExpenseModal(getExpensesElement("expense-detail-modal"));
  selectedExpenseId = "";
}

function openExpenseCancelModal(expense) {
  pendingExpenseAction = { type: "cancel", expenseId: expense.expenseId };
  setExpensesText("expense-cancel-summary-id", expense.expenseId);
  setExpensesText("expense-cancel-summary-concept", expense.concept || "Sin concepto");
  setExpensesText("expense-cancel-summary-status", expense.status || "Sin estado");
  setExpenseInputValue("expense-cancel-reason", "");
  setExpenseFormError("expense-cancel-error", "");
  openExpenseModal("expense-cancel-modal");
  getExpensesElement("expense-cancel-reason")?.focus();
}

function submitExpenseCancel(event) {
  event.preventDefault();

  const expense = getExpenseById(pendingExpenseAction?.expenseId);
  const reason = getExpenseInputValue("expense-cancel-reason");

  if (!expense) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!reason) {
    setExpenseFormError("expense-cancel-error", "El motivo de anulacion es obligatorio.");
    notifyExpense("El motivo de anulacion es obligatorio.", "warning");
    return;
  }

  const result = window.ElaraExpensesCore.cancelExpense(expense.expenseId, reason, getExpenseCurrentUser());

  if (!result.ok) {
    setExpenseFormError("expense-cancel-error", result.error);
    notifyExpense(result.error, "error");
    return;
  }

  addExpenseActivity("EXPENSE_CANCELLED", "Gasto anulado", `${result.data.expenseId} fue anulado.`, result.data);
  renderExpensesView();
  closeExpenseCancelFlowAfterSuccess();
  notifyExpense("Gasto anulado.", "success");
}

function closeExpenseCancelFlowAfterSuccess() {
  closeExpenseModal(getExpensesElement("expense-cancel-modal"));
  closeExpenseModal(getExpensesElement("expense-detail-modal"));
  selectedExpenseId = "";
}

function ensureExpensesModals() {
  if (getExpensesElement("expense-detail-modal")) {
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="modal-backdrop" id="expense-detail-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-detail-title" hidden>
        <section class="modal modal--expense-detail">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Gastos</p>
              <h2 id="expense-detail-title">Detalle de gasto <span id="expense-detail-id">-</span></h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <div class="modal__body modal__body--summary service-summary expense-detail-content" id="expense-detail-content"></div>
          <div class="modal__actions expense-detail-actions" id="expense-detail-actions"></div>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-new-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-new-title" hidden>
        <section class="modal modal--summary modal--expense-form">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Gastos</p>
              <h2 id="expense-new-title">Nuevo gasto</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form" id="expense-new-form" novalidate>
            <div class="modal__body modal__body--summary expense-form__body">
              <div class="expense-form-grid">
                <label class="field"><span>Categor&iacute;a *</span><select id="expense-new-category" required></select></label>
                <label class="field"><span>Concepto *</span><input id="expense-new-concept" type="text" required /></label>
                <label class="field"><span>Importe *</span><input id="expense-new-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></label>
                <label class="field"><span>Fecha del gasto *</span><input id="expense-new-date" type="date" required /></label>
                <label class="field"><span>Pagado por *</span><select id="expense-new-paid-by"><option value="ELARA">ELARA</option><option value="Pendiente de pago">Pendiente de pago</option></select></label>
                <label class="field"><span>Estado inicial *</span><select id="expense-new-payment-state"><option value="Pagada">Pagada</option><option value="Pendiente de pago">Pendiente de pago</option></select></label>
                <label class="field"><span>M&eacute;todo *</span><select id="expense-new-method"><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option><option value="No indicado">No indicado</option></select></label>
                <label class="field"><span>Proveedor</span><input id="expense-new-provider" type="text" /></label>
                <label class="field"><span>Veh&iacute;culo</span><select id="expense-new-vehicle"></select></label>
                <label class="field"><span>Servicio</span><select id="expense-new-service"></select></label>
                <label class="field"><span>Comprobante</span><select id="expense-new-receipt-status"><option value="No requerido">No requerido</option><option value="No adjunto">No adjunto</option><option value="Adjunto">Adjunto</option></select></label>
                <label class="field" id="expense-new-receipt-file-field" hidden><span>Nombre archivo mock *</span><input id="expense-new-receipt-file" type="text" /></label>
                <label class="field field--compact-textarea expense-form-grid__full"><span>Descripci&oacute;n</span><textarea id="expense-new-description" rows="2"></textarea></label>
                <label class="field field--compact-textarea expense-form-grid__full"><span>Observaciones</span><textarea id="expense-new-observations" rows="2"></textarea></label>
              </div>
              <p class="form-error" id="expense-new-error" hidden></p>
            </div>
            <div class="modal__actions expense-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Guardar gasto</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-review-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-review-title" hidden>
        <section class="modal modal--summary modal--expense-review">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">REVISI&Oacute;N</p>
              <h2 id="expense-review-title">Revisar solicitud</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-review-form" id="expense-review-form" novalidate>
            <div class="modal__body modal__body--summary expense-review-form__body">
              <div class="expense-review-summary" aria-label="Resumen del gasto">
                <div>
                  <span>ID</span>
                  <strong id="expense-review-summary-id">-</strong>
                </div>
                <div>
                  <span>Concepto</span>
                  <strong id="expense-review-summary-concept">-</strong>
                </div>
                <div>
                  <span>Importe solicitado</span>
                  <strong id="expense-review-summary-amount">-</strong>
                </div>
              </div>
              <label class="field" id="expense-review-amount-field"><span>Importe aprobado *</span><input id="expense-review-amount" type="number" min="0.01" step="0.01" inputmode="decimal" /></label>
              <label class="field field--compact-textarea"><span>Motivo / observaciones</span><textarea id="expense-review-reason" rows="3"></textarea></label>
              <p class="form-error" id="expense-review-error" hidden></p>
            </div>
            <div class="modal__actions expense-review-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Guardar revisi&oacute;n</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-settlement-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-settlement-title" hidden>
        <section class="modal modal--summary modal--expense-settlement">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Caja</p>
              <h2 id="expense-settlement-title">Registrar pago</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-settlement-form" id="expense-settlement-form" novalidate>
            <div class="modal__body modal__body--summary expense-settlement-form__body">
              <div class="expense-settlement-summary" aria-label="Resumen del gasto">
                <div>
                  <span>ID</span>
                  <strong id="expense-settlement-summary-id">-</strong>
                </div>
                <div>
                  <span id="expense-settlement-summary-party-label">Beneficiario</span>
                  <strong id="expense-settlement-summary-party">-</strong>
                </div>
                <div>
                  <span>Importe</span>
                  <strong id="expense-settlement-summary-amount">-</strong>
                </div>
              </div>
              <div class="expense-settlement-method">
                <span>M&eacute;todo</span>
                <strong id="expense-settlement-method">Efectivo</strong>
                <small>Se crear&aacute; una salida de Caja vinculada al gasto.</small>
              </div>
              <label class="field field--compact-textarea"><span>Observaciones</span><textarea id="expense-settlement-notes" rows="3"></textarea></label>
              <p class="form-error" id="expense-settlement-error" hidden></p>
            </div>
            <div class="modal__actions expense-settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit" id="expense-settlement-submit-label">Confirmar pago</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-cancel-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-cancel-title" hidden>
        <section class="modal modal--summary modal--expense-cancel">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">GASTOS</p>
              <h2 id="expense-cancel-title">Anular gasto</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-cancel-form" id="expense-cancel-form" novalidate>
            <div class="modal__body modal__body--summary expense-cancel-form__body">
              <div class="expense-cancel-summary" aria-label="Resumen del gasto">
                <div>
                  <span>ID</span>
                  <strong id="expense-cancel-summary-id">-</strong>
                </div>
                <div>
                  <span>Concepto</span>
                  <strong id="expense-cancel-summary-concept">-</strong>
                </div>
                <div>
                  <span>Estado actual</span>
                  <strong id="expense-cancel-summary-status">-</strong>
                </div>
              </div>
              <p class="modal__hint expense-cancel-note">El registro conservar&aacute; su trazabilidad y no ser&aacute; eliminado.</p>
              <label class="field field--compact-textarea"><span>Motivo de anulaci&oacute;n *</span><textarea id="expense-cancel-reason" rows="3" required></textarea></label>
              <p class="form-error" id="expense-cancel-error" hidden></p>
            </div>
            <div class="modal__actions expense-cancel-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact button--danger" type="submit">Confirmar anulaci&oacute;n</button>
            </div>
          </form>
        </section>
      </div>
    `,
  );

  getExpensesElement("expense-new-form")?.addEventListener("submit", submitNewExpense);
  getExpensesElement("expense-review-form")?.addEventListener("submit", submitExpenseReview);
  getExpensesElement("expense-settlement-form")?.addEventListener("submit", submitExpenseSettlement);
  getExpensesElement("expense-cancel-form")?.addEventListener("submit", submitExpenseCancel);
}

function getFilteredExpensesForView() {
  return getExpensesCollection()
    .map((expense) => window.ElaraExpensesCore.normalizeExpenseRecord(expense))
    .filter((expense) => expenseMatchesFilters(expense))
    .sort((first, second) => getExpenseTimestamp(second.createdAt) - getExpenseTimestamp(first.createdAt) || second.expenseId.localeCompare(first.expenseId));
}

function expenseMatchesFilters(expense) {
  if (expensesFilters.statuses.length && !expensesFilters.statuses.includes(expense.status)) {
    return false;
  }

  if (expensesFilters.recordTypes.length && !expensesFilters.recordTypes.includes(expense.recordType)) {
    return false;
  }

  if (expensesFilters.categories.length && !expensesFilters.categories.includes(expense.category)) {
    return false;
  }

  if (expensesFilters.paidBy.length && !expensesFilters.paidBy.includes(expense.paidBy)) {
    return false;
  }

  if (expensesFilters.from && expense.expenseDate < expensesFilters.from) {
    return false;
  }

  if (expensesFilters.to && expense.expenseDate > expensesFilters.to) {
    return false;
  }

  if (expensesFilters.exceptional === "yes" && !expense.requiresExceptionalApproval) {
    return false;
  }

  if (expensesFilters.exceptional === "no" && expense.requiresExceptionalApproval) {
    return false;
  }

  if (expensesFilters.query && !getExpenseSearchHaystack(expense).includes(normalizeExpenseText(expensesFilters.query))) {
    return false;
  }

  return true;
}

function syncExpensesChipFilters() {
  expensesFilters.statuses = getCheckedExpenseValues("status");
  expensesFilters.recordTypes = getCheckedExpenseValues("recordType");
  expensesFilters.categories = getCheckedExpenseValues("category");
  expensesFilters.paidBy = getCheckedExpenseValues("paidBy");
}

function getCheckedExpenseValues(filterName) {
  return Array.from(document.querySelectorAll(`[data-expense-filter="${filterName}"]:checked`)).map((input) => input.value);
}

function clearExpensesFilters() {
  expensesFilters = getDefaultExpensesFilters();
  expensesPage = 1;

  const search = getExpensesElement("expenses-search");
  const from = getExpensesElement("expenses-filter-from");
  const to = getExpensesElement("expenses-filter-to");

  if (search) search.value = "";
  if (from) from.value = "";
  if (to) to.value = "";

  document.querySelectorAll("[data-expense-filter]").forEach((input) => {
    input.checked = false;
  });

  const allExceptional = document.querySelector('[data-expense-exceptional][value=""]');

  if (allExceptional) {
    allExceptional.checked = true;
  }

  renderExpensesView();
}

function updateExpensesFilterSummary() {
  const label = getExpensesElement("expenses-filter-label");

  if (!label) {
    return;
  }

  const activeFilters = getExpensesActiveFilterCount();
  label.textContent = activeFilters > 0 ? `Filtro \u00B7 ${activeFilters}` : "Filtro";
}

function getExpensesActiveFilterCount() {
  const chipCount =
    expensesFilters.statuses.length +
    expensesFilters.recordTypes.length +
    expensesFilters.categories.length +
    expensesFilters.paidBy.length;
  const dateCount = (expensesFilters.from ? 1 : 0) + (expensesFilters.to ? 1 : 0);
  const exceptionalCount = expensesFilters.exceptional ? 1 : 0;
  const queryCount = expensesFilters.query ? 1 : 0;

  return chipCount + dateCount + exceptionalCount + queryCount;
}

function changeExpensesPage(direction) {
  const total = getFilteredExpensesForView().length;
  const totalPages = Math.max(1, Math.ceil(total / EXPENSES_PAGE_SIZE));

  if (direction === "prev") {
    expensesPage = Math.max(1, expensesPage - 1);
  } else if (direction === "next") {
    expensesPage = Math.min(totalPages, expensesPage + 1);
  }

  renderExpensesList();
}

function getExpensesCoreFilters() {
  return {
    statuses: expensesFilters.statuses,
    recordTypes: expensesFilters.recordTypes,
    categories: expensesFilters.categories,
    paidByValues: expensesFilters.paidBy,
    from: expensesFilters.from,
    to: expensesFilters.to,
    query: expensesFilters.query,
    exceptional: expensesFilters.exceptional,
    includeCancelled: true,
  };
}

function getDefaultExpensesFilters() {
  return {
    query: "",
    statuses: [],
    recordTypes: [],
    categories: [],
    paidBy: [],
    from: "",
    to: "",
    exceptional: "",
  };
}

function populateExpenseSelects() {
  setSelectOptions("expense-new-category", window.ElaraExpensesCore.getExpenseCategories().map((category) => [category, category]), "");
  setSelectOptions(
    "expense-new-vehicle",
    [["", "Sin vehiculo"], ...getExpenseVehicles().map((vehicle) => [vehicle.id, `${vehicle.brand || ""} ${vehicle.model || ""} \u00B7 ${vehicle.plate || vehicle.id}`])],
    "",
  );
  setSelectOptions(
    "expense-new-service",
    [["", "Sin servicio"], ...getExpenseServices().map((service) => [getExpenseServiceId(service), `${getExpenseServiceId(service)} \u00B7 ${service.type || "Servicio"} \u00B7 ${service.client || "Cliente"}`])],
    "",
  );
}

function updateNewExpensePaymentState() {
  const paidBy = getExpenseInputValue("expense-new-paid-by");
  const state = getExpensesElement("expense-new-payment-state");
  const method = getExpensesElement("expense-new-method");

  if (!state || !method) {
    return;
  }

  if (paidBy === "Pendiente de pago") {
    state.value = "Pendiente de pago";
    state.disabled = true;
    method.value = "No indicado";
  } else {
    state.disabled = false;
    if (state.value !== "Pagada") {
      state.value = "Pagada";
    }
    if (method.value === "No indicado") {
      method.value = "Efectivo";
    }
  }
}

function updateNewExpenseReceiptState() {
  const status = getExpenseInputValue("expense-new-receipt-status");
  const field = getExpensesElement("expense-new-receipt-file-field");

  if (field) {
    field.hidden = status !== "Adjunto";
  }

  if (status !== "Adjunto") {
    setExpenseInputValue("expense-new-receipt-file", "");
  }
}

function registerExpenseCashOutflow(expense, type, notes = "") {
  const isReimbursement = type === "reimbursement";
  const amount = isReimbursement ? expense.reimbursement.amount : expense.payment.amount || expense.amountApproved || expense.amountRequested;
  const currentUser = getExpenseCurrentUser();
  const responsible = getExpenseResponsibleLabel(expense);

  return window.ElaraCash.registerExpenseCashOutflow({
    expenseId: expense.expenseId,
    category: isReimbursement ? `Reembolso de gasto ${expense.expenseId}` : `Pago de gasto ${expense.expenseId}`,
    amount,
    actorType: isReimbursement ? expense.claimantType || "Conductor" : "Proveedor",
    actorId: isReimbursement ? expense.claimantId || "" : expense.providerName || "",
    actorName: isReimbursement ? responsible.primary : expense.providerName || "Proveedor",
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    notes: notes || (isReimbursement ? "Reembolso de gasto aprobado." : "Pago de gasto a proveedor."),
  });
}

function rollbackCreatedExpense(expenseId) {
  const expenses = window.ElaraExpensesMock?.expenses || [];
  const index = expenses.findIndex((expense) => expense.expenseId === expenseId);

  if (index >= 0) {
    expenses.splice(index, 1);
  }
}

function addExpenseActivity(eventType, title, description, expense) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function") {
    return;
  }

  const user = getExpenseCurrentUser();

  window.ElaraActivityLog.addEvent({
    eventType,
    actorType: "Administraci\u00f3n",
    actorId: user?.id || "",
    actorName: user?.name || "Administracion",
    entityType: "Gasto",
    entityId: expense.expenseId,
    title,
    description,
    metadata: {
      status: expense.status,
      amountRequested: expense.amountRequested,
      amountApproved: expense.amountApproved,
    },
  });
}

function getExpenseSettlementFields(expense) {
  const settlement = expense.reimbursement.required ? expense.reimbursement : expense.payment;

  if (!settlement.required && settlement.status === "No aplica") {
    return [];
  }

  return [
    ["Tipo de operaci\u00f3n", expense.reimbursement.required ? "Reembolso" : "Pago"],
    ["Estado", settlement.status],
    ["Importe", settlement.amount ? formatExpenseMoney(settlement.amount) : ""],
    ["Fecha", formatExpenseDateTime(settlement.paidAt)],
    ["Registrado por", settlement.paidByName],
    ["Referencia de Caja", settlement.cashMovementId],
  ];
}

function getExpenseResponsibleLabel(expense) {
  if (expense.paidBy === "ELARA" || expense.claimantType === "ELARA" || expense.claimantName === "ELARA") {
    return {
      primary: "ELARA",
      secondary: "Administraci\u00f3n",
    };
  }

  if (expense.claimantName) {
    return {
      primary: expense.claimantName,
      secondary: expense.claimantType || expense.paidBy,
    };
  }

  return {
    primary: expense.createdByName || "Sistema",
    secondary: expense.paidBy || expense.recordType,
  };
}

function getExpenseCreatorLabel(expense) {
  return `${expense.createdByName || "Sistema"}${expense.createdByRole ? ` \u00B7 ${expense.createdByRole}` : ""}`;
}

function shouldShowExpenseCreator(expense) {
  const claimantName = normalizeExpenseText(expense.claimantName);
  const creatorName = normalizeExpenseText(expense.createdByName);

  if (!expense.createdByUserId && !expense.createdByName) {
    return false;
  }

  if (expense.claimantId) {
    const creatorUser = getExpenseUsers().find((user) => String(user.id || "").trim() === String(expense.createdByUserId || "").trim());

    if (creatorUser?.driverId && String(creatorUser.driverId).trim() === String(expense.claimantId).trim()) {
      return false;
    }
  }

  if (claimantName && creatorName && claimantName === creatorName) {
    return false;
  }

  return true;
}

function getExpenseRelationLabel(expense) {
  const vehicle = getExpenseVehicleLabel(expense.vehicleId);
  const service = getExpenseServiceLabel(expense.serviceId);

  if (service !== "Sin servicio") {
    return { primary: service, secondary: vehicle };
  }

  if (vehicle !== "Sin vehiculo") {
    return { primary: vehicle, secondary: expense.providerName || "Sin proveedor" };
  }

  return { primary: expense.providerName || "Sin relacion", secondary: expense.serviceId || expense.vehicleId || "Sin referencia" };
}

function getExpenseStatusBadge(status) {
  const tones = {
    "Pendiente de revisi\u00f3n": "warning",
    "Requiere informaci\u00f3n": "info",
    Aprobada: "info",
    "Aprobada parcialmente": "info",
    "Pendiente de pago": "warning",
    "Pendiente de reembolso": "warning",
    Pagada: "success",
    Reembolsada: "success",
    Rechazada: "danger",
    Anulada: "neutral",
  };

  return { tone: tones[status] || "neutral" };
}

function getExpenseReviewTitle(action) {
  return {
    approve: "Aprobar solicitud",
    partial: "Aprobar parcialmente",
    info: "Solicitar informacion",
    reject: "Rechazar solicitud",
  }[action] || "Revisar solicitud";
}

function getExpenseReviewToast(action) {
  return {
    approve: "Solicitud aprobada.",
    partial: "Solicitud aprobada.",
    info: "Se solicit\u00f3 informaci\u00f3n adicional.",
    reject: "Solicitud rechazada.",
  }[action] || "Revision guardada.";
}

function getExpenseActivityType(action) {
  return {
    approve: "EXPENSE_APPROVED",
    partial: "EXPENSE_PARTIALLY_APPROVED",
    info: "EXPENSE_INFORMATION_REQUIRED",
    reject: "EXPENSE_REJECTED",
  }[action] || "EXPENSE_REVIEWED";
}

function getExpenseActivityTitle(action) {
  return {
    approve: "Solicitud aprobada",
    partial: "Solicitud aprobada parcialmente",
    info: "Informacion solicitada",
    reject: "Solicitud rechazada",
  }[action] || "Solicitud revisada";
}

function getExpenseActivityDescription(action, expense) {
  return {
    approve: `${expense.expenseId} fue aprobada.`,
    partial: `${expense.expenseId} fue aprobada parcialmente.`,
    info: `Se solicito informacion adicional para ${expense.expenseId}.`,
    reject: `${expense.expenseId} fue rechazada.`,
  }[action] || `${expense.expenseId} fue revisada.`;
}

function getExpenseById(expenseId) {
  return window.ElaraExpensesCore.getExpenseById(expenseId);
}

function getExpensesCollection() {
  return window.ElaraExpensesMock?.expenses || [];
}

function getExpenseVehicles() {
  return window.ElaraVehiclesMock?.vehicles || [];
}

function getExpenseServices() {
  return window.ElaraServicesMock?.services || [];
}

function getExpenseUsers() {
  return Array.isArray(window.ElaraUsersMock) ? window.ElaraUsersMock : [];
}

function getExpenseVehicleLabel(vehicleId) {
  const vehicle = getExpenseVehicles().find((item) => item.id === vehicleId);

  return vehicle ? `${vehicle.brand || ""} ${vehicle.model || ""} \u00B7 ${vehicle.plate || vehicle.id}` : "Sin vehiculo";
}

function getExpenseServiceLabel(serviceId) {
  const service = getExpenseServices().find((item) => getExpenseServiceId(item) === serviceId);

  return service ? `${getExpenseServiceId(service)} \u00B7 ${service.type || "Servicio"}` : "Sin servicio";
}

function getExpenseServiceId(service) {
  return String(service?.serviceId || service?.id || "").trim();
}

function getExpenseSearchHaystack(expense) {
  return normalizeExpenseText(
    [
      expense.expenseId,
      expense.concept,
      expense.providerName,
      expense.claimantName,
      expense.createdByName,
      expense.vehicleId,
      getExpenseVehicleLabel(expense.vehicleId),
      expense.serviceId,
      getExpenseServiceLabel(expense.serviceId),
    ].join(" "),
  );
}

function getExpenseTimestamp(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatExpenseMoney(value) {
  if (window.ElaraCash && typeof window.ElaraCash.formatCashMoney === "function") {
    return window.ElaraCash.formatCashMoney(value);
  }

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function formatExpenseDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "Sin fecha";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatExpenseDateTime(value) {
  if (!value) {
    return "Sin fecha";
  }

  if (window.ElaraCash && typeof window.ElaraCash.formatCashDateTime === "function") {
    return window.ElaraCash.formatCashDateTime(value);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-ES");
}

function getExpenseTodayValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
}

function setSelectOptions(id, options, selectedValue = "") {
  const select = getExpensesElement(id);

  if (!select) {
    return;
  }

  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeExpenseHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeExpenseHtml(label)}</option>`)
    .join("");
}

function getExpenseNumberInput(id) {
  const value = Number(String(getExpenseInputValue(id)).replace(",", "."));

  return Number.isFinite(value) ? value : 0;
}

function getExpenseInputValue(id) {
  return getExpensesElement(id)?.value.trim() || "";
}

function setExpenseInputValue(id, value) {
  const element = getExpensesElement(id);

  if (element) {
    element.value = value ?? "";
  }
}

function setExpenseFormError(id, message) {
  const element = getExpensesElement(id);

  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.hidden = !message;
}

function openExpenseModal(id) {
  const modal = getExpensesElement(id);

  if (modal) {
    modal.hidden = false;
  }
}

function closeExpenseModal(modal) {
  if (!modal) {
    return;
  }

  modal.hidden = true;

  if (modal.id !== "expense-detail-modal") {
    pendingExpenseAction = null;
  }
}

function canExpenseAction(action) {
  if (!window.ElaraPermissions || typeof window.ElaraPermissions.canPerformAction !== "function") {
    return false;
  }

  return window.ElaraPermissions.canPerformAction(getExpenseActiveContext(), action);
}

function getExpenseActiveContext() {
  return window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function" ? window.ElaraAuth.getActiveContext() : "";
}

function getExpenseCurrentUser() {
  return window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
}

function isExpensesViewActive() {
  const view = getExpensesElement("gastos");

  return Boolean(view && !view.hidden && window.location.hash.replace(/^#\/?/, "") === "gastos");
}

function setExpensesText(id, value) {
  const element = getExpensesElement(id);

  if (element) {
    element.textContent = value;
  }
}

function getExpensesElement(id) {
  return document.getElementById(id);
}

function notifyExpense(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function normalizeExpenseText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function escapeExpenseHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.ElaraExpenses = {
  initExpenses,
  showExpenses,
};
