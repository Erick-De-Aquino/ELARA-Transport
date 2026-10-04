/*
  Proyecto Atlas / ELARA Transport
  Archivo: expenses.js
  Responsabilidad: interfaz administrativa real read-only del modulo Gastos.
*/

"use strict";

const EXPENSES_PAGE_SIZE = 20;
const EXPENSES_STATUS_FILTERS = [
  ["draft", "Borrador"],
  ["submitted", "Enviado"],
  ["approved", "Aprobado"],
  ["rejected", "Rechazado"],
  ["cancelled", "Cancelado"],
];
const EXPENSES_PAYMENT_RESPONSIBILITY_FILTERS = [
  ["elara", "Pago por ELARA"],
  ["user_advance", "Adelantado por usuario"],
  ["driver_advance", "Adelantado por conductor"],
];
const EXPENSE_REIMBURSEMENT_METHODS = [
  ["cash", "Efectivo"],
  ["bank_transfer", "Transferencia"],
  ["card", "Tarjeta"],
  ["other", "Otro"],
];
const ADMIN_EXPENSE_PAYMENT_METHODS = [["cash", "Efectivo"]];
let isExpensesInitialized = false;
let expensesPage = 1;
let selectedExpenseId = "";
let pendingExpenseAction = null;
let isSubmittingExpenseReview = false;
let isSubmittingExpenseReimbursement = false;
let isSubmittingExpensePayment = false;
let isSubmittingExpenseCancellation = false;
let expensesFilters = getDefaultExpensesFilters();
let adminExpenseRows = [];
let adminExpenseTotal = 0;
let adminExpenseCategoryOptions = new Map();
let adminExpenseDetail = null;
let adminExpenseRequestId = 0;
let isExpensesLoading = false;
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
  setExpensesText("page-summary", "Gastos administrativos reales en modo solo lectura.");
  configureExpensesPrimaryAction();
  configureExpensesRealFilterVisibility();
  renderExpensesView();
  void loadAdminExpenses();
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

  const approvedCount = adminExpenseRows.filter((expense) => expense.status === "approved").length;
  const draftCount = adminExpenseRows.filter((expense) => expense.status === "draft").length;
  const pendingPaymentAmount = adminExpenseRows.reduce((total, expense) => total + expense.pendingPaymentAmount, 0);
  const pendingReimbursementAmount = adminExpenseRows.reduce((total, expense) => total + expense.pendingReimbursementAmount, 0);
  const paidAmount = adminExpenseRows.reduce((total, expense) => total + expense.paidAmount, 0);
  const settlementReferences = adminExpenseRows.filter((expense) => expense.hasSettlementReference).length;
  const metrics = [
    ["Resultados", String(adminExpenseTotal), "neutral"],
    ["Aprobados", String(approvedCount), "info"],
    ["Borradores", String(draftCount), "warning"],
    ["Pagado", formatExpenseMoney(paidAmount), "success"],
    ["Pendiente de pago", formatExpenseMoney(pendingPaymentAmount), "warning"],
    ["Pendiente de reembolso", formatExpenseMoney(pendingReimbursementAmount), "warning"],
  ];

  if (settlementReferences > 0) {
    metrics[2] = ["Con liquidaci\u00f3n", String(settlementReferences), "info"];
  }

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

  if (isExpensesLoading) {
    container.innerHTML = '<p class="expenses-empty">Cargando gastos reales...</p>';
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(adminExpenseTotal / EXPENSES_PAGE_SIZE));

  if (!adminExpenseRows.length) {
    container.innerHTML = '<p class="expenses-empty">No hay gastos que coincidan con los filtros.</p>';
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  container.innerHTML = adminExpenseRows.map(renderExpenseRow).join("");
  renderExpensesPagination(pagination, adminExpenseTotal, totalPages);
}

function renderExpenseRow(expense) {
  const badge = getExpenseStatusBadge(expense.status);
  const relation = getExpenseRelationLabel(expense);
  const responsible = getExpenseResponsibleLabel(expense);
  const supplier = expense.supplierName ? `Proveedor: ${expense.supplierName}` : "Sin proveedor";

  return `
    <article class="expenses-row expenses-list-grid">
      <div class="expenses-row__main">
        <strong>${escapeExpenseHtml(expense.humanCode || "Gasto")}</strong>
        <span>${escapeExpenseHtml(expense.description || "Sin descripci\u00f3n")}</span>
        <small>${escapeExpenseHtml(expense.categoryName || expense.categoryCode || "Sin categor\u00eda")}</small>
      </div>
      <time>${escapeExpenseHtml(formatExpenseDate(expense.expenseDate))}</time>
      <div class="expenses-row__stack">
        <strong>${escapeExpenseHtml(responsible.primary)}</strong>
        <small>${escapeExpenseHtml(responsible.secondary)}</small>
      </div>
      <div class="expenses-row__stack expenses-row__amount">
        <strong>${escapeExpenseHtml(formatExpenseMoney(expense.amount, expense.currencyCode))}</strong>
        <small>${escapeExpenseHtml(getExpensePaymentResponsibilityLabel(expense.paymentResponsibility))}</small>
      </div>
      <span class="expense-status-badge expense-status-badge--${escapeExpenseHtml(badge.tone)}">${escapeExpenseHtml(getExpenseStatusLabel(expense.status))}</span>
      <div class="expenses-row__stack">
        <strong>${escapeExpenseHtml(relation.primary)}</strong>
        <small>${escapeExpenseHtml(relation.secondary || supplier)}</small>
      </div>
      <div class="expenses-row__actions">
        <button class="button button--compact button--muted" type="button" data-expense-detail="${escapeExpenseHtml(expense.expenseId)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderExpensesPagination(container, total, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = total > 0 ? `<span>${escapeExpenseHtml(total)} resultado${total === 1 ? "" : "s"}</span>` : "";
    container.hidden = total === 0;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-expenses-page="prev"${expensesPage <= 1 ? " disabled" : ""}>Anterior</button>
    <span>${escapeExpenseHtml(total)} resultados - P\u00e1gina ${escapeExpenseHtml(expensesPage)} de ${escapeExpenseHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-expenses-page="next"${expensesPage >= totalPages ? " disabled" : ""}>Siguiente</button>
  `;
}

function renderExpensesStaticFilters() {
  const statusContainer = getExpensesElement("expenses-status-filters");
  const categoryContainer = getExpensesElement("expenses-category-filters");

  if (statusContainer) {
    statusContainer.innerHTML = EXPENSES_STATUS_FILTERS.map(
      ([value, label]) => `
        <label class="filter-chip"><input type="radio" name="expenses-status-filter" data-expense-filter="status" value="${escapeExpenseHtml(value)}" /><span>${escapeExpenseHtml(label)}</span></label>
      `,
    ).join("");
  }

  renderExpensesCategoryFilters(categoryContainer);
  renderExpensesPaymentResponsibilityFilters();
}

function renderExpensesCategoryFilters(categoryContainer = getExpensesElement("expenses-category-filters")) {
  if (!categoryContainer) {
    return;
  }

  const categories = Array.from(adminExpenseCategoryOptions.values()).sort((first, second) => first.name.localeCompare(second.name, "es"));

  if (!categories.length) {
    categoryContainer.innerHTML = '<span class="modal__hint">Se cargar\u00e1n con los datos reales.</span>';
    return;
  }

  categoryContainer.innerHTML = categories
    .map(
      (category) => `
        <label class="filter-chip"><input type="radio" name="expenses-category-filter" data-expense-filter="category" value="${escapeExpenseHtml(category.id)}"${expensesFilters.categoryId === category.id ? " checked" : ""} /><span>${escapeExpenseHtml(category.name)}</span></label>
      `,
    )
    .join("");
}

function renderExpensesPaymentResponsibilityFilters() {
  const currentInputs = Array.from(document.querySelectorAll('[data-expense-filter="paidBy"]'));
  const group = currentInputs[0]?.closest(".customer-filter__group");

  if (!group) {
    return;
  }

  const title = group.querySelector("strong");
  if (title) {
    title.textContent = "Responsabilidad";
  }

  currentInputs.forEach((input) => input.closest("label")?.remove());
  group.insertAdjacentHTML(
    "beforeend",
    EXPENSES_PAYMENT_RESPONSIBILITY_FILTERS.map(
      ([value, label]) => `
        <label class="filter-chip"><input type="radio" name="expenses-responsibility-filter" data-expense-filter="paidBy" value="${escapeExpenseHtml(value)}" /><span>${escapeExpenseHtml(label)}</span></label>
      `,
    ).join(""),
  );
}

function configureExpensesRealFilterVisibility() {
  document.querySelectorAll('[data-expense-filter="recordType"]').forEach((input) => {
    const group = input.closest(".customer-filter__group");
    if (group) group.hidden = true;
  });

  const from = getExpensesElement("expenses-filter-from");
  const dateGroup = from?.closest(".customer-filter__group");
  if (dateGroup) dateGroup.hidden = true;

  document.querySelectorAll("[data-expense-exceptional]").forEach((input) => {
    const group = input.closest(".customer-filter__group");
    if (group) group.hidden = true;
  });
}

async function loadAdminExpenses() {
  const container = getExpensesElement("expenses-list");
  const client = getExpensesSupabaseClient();

  if (!client) {
    adminExpenseRows = [];
    adminExpenseTotal = 0;
    isExpensesLoading = false;
    renderExpensesView();
    if (container) {
      container.innerHTML = '<p class="expenses-empty">No se pudo conectar con Supabase para cargar gastos reales.</p>';
    }
    return;
  }

  const requestId = ++adminExpenseRequestId;
  const offset = (Math.max(expensesPage, 1) - 1) * EXPENSES_PAGE_SIZE;
  isExpensesLoading = true;
  renderExpensesView();

  try {
    const { data, error } = await client.rpc("get_admin_expenses", {
      p_status: getSingleExpenseFilterValue(expensesFilters.statuses),
      p_category_id: expensesFilters.categoryId || null,
      p_driver_id: null,
      p_service_id: null,
      p_payment_responsibility: getSingleExpenseFilterValue(expensesFilters.paidBy),
      p_search: expensesFilters.query || null,
      p_limit: EXPENSES_PAGE_SIZE,
      p_offset: offset,
    });

    if (requestId !== adminExpenseRequestId) {
      return;
    }

    if (error) {
      throw error;
    }

    adminExpenseRows = (Array.isArray(data) ? data : []).map(normalizeAdminExpenseListRow);
    adminExpenseTotal = adminExpenseRows.length ? adminExpenseRows[0].totalCount : 0;
    adminExpenseRows.forEach(registerAdminExpenseCategoryOption);

    const totalPages = Math.max(1, Math.ceil(adminExpenseTotal / EXPENSES_PAGE_SIZE));
    if (expensesPage > totalPages) {
      expensesPage = totalPages;
      isExpensesLoading = false;
      void loadAdminExpenses();
      return;
    }

    isExpensesLoading = false;
    renderExpensesCategoryFilters();
    renderExpensesView();
  } catch (error) {
    if (requestId !== adminExpenseRequestId) {
      return;
    }

    console.error("[ELARA Expenses] No se pudo cargar el listado real de gastos.", { error });
    adminExpenseRows = [];
    adminExpenseTotal = 0;
    isExpensesLoading = false;
    renderExpensesView();
    if (container) {
      container.innerHTML = `<p class="expenses-empty">${escapeExpenseHtml(formatExpenseError(error, "No se pudo cargar el listado de gastos."))}</p>`;
    }
  }
}

function bindExpensesEvents() {
  const search = getExpensesElement("expenses-search");

  search?.addEventListener("input", () => {
    expensesFilters.query = search.value.trim();
    expensesPage = 1;
    void loadAdminExpenses();
  });

  document.addEventListener("change", handleExpensesDocumentChange);
  document.addEventListener("click", handleExpensesDocumentClick);
  document.addEventListener("keydown", handleExpensesDocumentKeydown);
  window.addEventListener("elara:expenses-updated", handleExpensesDataUpdated);
  window.addEventListener("elara:cash-updated", handleExpensesDataUpdated);
}

function handleExpensesDocumentChange(event) {
  const filterInput = event.target.closest("[data-expense-filter]");

  if (filterInput) {
    syncExpensesChipFilters();
    expensesPage = 1;
    void loadAdminExpenses();
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

  void loadAdminExpenses();
}

function configureExpensesPrimaryAction() {
  const primaryAction = getExpensesElement("primary-action");

  if (!primaryAction) {
    return;
  }

  primaryAction.textContent = "Nuevo gasto";
  primaryAction.hidden = true;
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

async function openExpenseDetailModal(expenseId) {
  const id = String(expenseId || "").trim();
  const client = getExpensesSupabaseClient();

  if (!id) {
    notifyExpense("Selecciona un gasto v\u00e1lido.", "warning");
    return;
  }

  if (!client) {
    notifyExpense("No se pudo conectar con Supabase para cargar el detalle real.", "error");
    return;
  }

  selectedExpenseId = id;
  adminExpenseDetail = null;

  try {
    const { data, error } = await client.rpc("get_admin_expense_detail", { p_expense_id: id });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Expense was not found.");
    }

    adminExpenseDetail = normalizeAdminExpenseDetail(row);
    selectedExpenseId = adminExpenseDetail.expenseId;
    renderExpenseDetail(adminExpenseDetail);
    openExpenseModal("expense-detail-modal");
  } catch (error) {
    selectedExpenseId = "";
    adminExpenseDetail = null;
    console.error("[ELARA Expenses] No se pudo cargar el detalle real del gasto.", { error });
    notifyExpense(formatExpenseError(error, "No se pudo cargar el detalle del gasto."), "error");
  }
}

function renderExpenseDetail(expense) {
  const detail = typeof expense === "string" ? adminExpenseDetail : expense;
  const container = getExpensesElement("expense-detail-content");
  const actions = getExpensesElement("expense-detail-actions");

  if (!detail || !container || !actions) {
    return;
  }

  setExpensesText("expense-detail-id", detail.humanCode || detail.expenseId);
  container.innerHTML = `
    ${detail.hasSettlementReference ? renderExpenseSettlementReferenceNotice(detail) : ""}
    ${renderExpenseDetailSection("Identificaci\u00f3n", getExpenseRealIdentificationFields(detail))}
    ${renderExpenseAmountSection(detail)}
    ${renderExpenseDetailSection("Responsabilidad", getExpenseRealResponsibilityFields(detail))}
    ${renderExpenseDetailSection("Relaciones", getExpenseRealRelationFields(detail))}
    ${renderExpenseDetailSection("Fechas y actores", getExpenseRealActorFields(detail))}
    ${renderExpenseDocumentsSection(detail.documents)}
    ${renderExpensePaymentsSection(detail.payments)}
    ${renderExpenseReimbursementsSection(detail.reimbursements)}
    ${renderExpenseHistorySection(detail.history)}
    ${renderExpenseAllocationsSection(detail.allocations)}
  `;
  actions.innerHTML = renderExpenseDetailActions(detail);
}

function renderExpenseSettlementReferenceNotice(expense) {
  const countLabel = expense.settlementReferenceCount === 1 ? "1 referencia" : `${expense.settlementReferenceCount} referencias`;

  return `
    <section class="expense-detail-section">
      <p class="expense-confirm-box"><span>Este gasto ya tiene referencia en una liquidaci\u00f3n.</span><small>${escapeExpenseHtml(countLabel)}</small></p>
    </section>
  `;
}

function getExpenseRealIdentificationFields(expense) {
  return [
    ["C\u00f3digo", expense.humanCode],
    ["Estado", getExpenseStatusLabel(expense.status)],
    ["Fecha", formatExpenseDate(expense.expenseDate)],
    ["Categor\u00eda", formatExpenseCategoryLabel(expense)],
    ["Descripci\u00f3n", expense.description, true],
    ["Notas", expense.notes, true],
    ["Notas internas", expense.internalNotes, true],
    ["Motivo rechazo", expense.rejectionReason, true],
    ["Motivo anulaci\u00f3n", expense.cancellationReason, true],
  ];
}

function getExpenseRealResponsibilityFields(expense) {
  return [
    ["Responsabilidad", getExpensePaymentResponsibilityLabel(expense.paymentResponsibility)],
    ["Estado de pago", getExpensePaymentStatusLabel(expense.paymentStatus)],
    ["Estado de reembolso", getExpenseReimbursementStatusLabel(expense.reimbursementStatus)],
    ["Reembolsable", expense.reimbursable ? "S\u00ed" : "No"],
  ];
}

function getExpenseRealRelationFields(expense) {
  return [
    ["Conductor", formatExpenseDriverLabel(expense.driverHumanCode, expense.driverName)],
    ["Adelantado por conductor", formatExpenseDriverLabel(expense.advancedByDriverHumanCode, expense.advancedByDriverName)],
    ["Adelantado por usuario", formatExpenseUserLabel(expense.advancedByUserHumanCode, expense.advancedByUserName)],
    ["Servicio", formatExpenseServiceLabel(expense.serviceHumanCode, expense.serviceType, expense.serviceStatus)],
    ["Veh\u00edculo", formatExpenseVehicleLabel(expense.vehicleHumanCode, expense.vehiclePlate, expense.vehicleLabel)],
    ["Proveedor", expense.supplierName || expense.supplierHumanCode],
  ];
}

function getExpenseRealActorFields(expense) {
  return [
    ["Creado", formatExpenseActorDate(expense.createdAt, expense.createdByHumanCode, expense.createdByName)],
    ["Enviado", formatExpenseActorDate(expense.submittedAt, expense.submittedByHumanCode, expense.submittedByName)],
    ["Aprobado", formatExpenseActorDate(expense.approvedAt, expense.approvedByHumanCode, expense.approvedByName)],
    ["Rechazado", formatExpenseActorDate(expense.rejectedAt, expense.rejectedByHumanCode, expense.rejectedByName)],
    ["Cancelado", formatExpenseActorDate(expense.cancelledAt, expense.cancelledByHumanCode, expense.cancelledByName)],
    ["Actualizado", formatExpenseActorDate(expense.updatedAt, expense.updatedByHumanCode, expense.updatedByName)],
  ];
}

function renderExpenseAmountSection(expense) {
  const amountItems = [
    ["Importe", formatExpenseMoney(expense.amount, expense.currencyCode), "strong"],
    ["Pagado", formatExpenseMoney(expense.paidAmount, expense.currencyCode), "strong"],
    ["Pendiente pago", formatExpenseMoney(expense.pendingPaymentAmount, expense.currencyCode), "strong"],
    ["Reembolsado", formatExpenseMoney(expense.reimbursedAmount, expense.currencyCode), "strong"],
    ["Pendiente reembolso", formatExpenseMoney(expense.pendingReimbursementAmount, expense.currencyCode), "strong"],
    ["Subtotal", formatExpenseMoney(expense.subtotalAmount, expense.currencyCode)],
    ["Impuesto", `${formatExpenseMoney(expense.taxAmount, expense.currencyCode)} (${formatExpenseDecimal(expense.taxRate)}%)`],
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
function normalizeAdminExpenseListRow(row = {}) {
  const expense = {
    expenseId: String(row.expense_id || "").trim(),
    humanCode: String(row.human_code || "").trim(),
    status: String(row.status || "").trim(),
    expenseDate: String(row.expense_date || "").trim(),
    createdAt: row.created_at || "",
    submittedAt: row.submitted_at || "",
    categoryId: String(row.category_id || "").trim(),
    categoryCode: String(row.category_code || "").trim(),
    categoryName: String(row.category_name || "").trim(),
    amount: roundExpenseAmount(row.amount),
    currencyCode: String(row.currency_code || "EUR").trim() || "EUR",
    paymentResponsibility: String(row.payment_responsibility || "").trim(),
    paymentStatus: String(row.payment_status || "").trim(),
    reimbursementStatus: String(row.reimbursement_status || "").trim(),
    reimbursable: Boolean(row.reimbursable),
    driverId: String(row.driver_id || "").trim(),
    driverHumanCode: String(row.driver_human_code || "").trim(),
    driverName: String(row.driver_name || "").trim(),
    serviceId: String(row.service_id || "").trim(),
    serviceHumanCode: String(row.service_human_code || "").trim(),
    vehicleId: String(row.vehicle_id || "").trim(),
    vehicleHumanCode: String(row.vehicle_human_code || "").trim(),
    vehiclePlate: String(row.vehicle_plate || "").trim(),
    vehicleLabel: String(row.vehicle_label || "").trim(),
    supplierId: String(row.supplier_id || "").trim(),
    supplierHumanCode: String(row.supplier_human_code || "").trim(),
    supplierName: String(row.supplier_name || "").trim(),
    description: String(row.description || "").trim(),
    notes: String(row.notes || "").trim(),
    paidAmount: roundExpenseAmount(row.paid_amount),
    reimbursedAmount: roundExpenseAmount(row.reimbursed_amount),
    pendingPaymentAmount: roundExpenseAmount(row.pending_payment_amount),
    pendingReimbursementAmount: roundExpenseAmount(row.pending_reimbursement_amount),
    documentCount: Number(row.document_count) || 0,
    latestStatusAt: row.latest_status_at || "",
    settlementReferenceCount: Number(row.settlement_reference_count) || 0,
    hasSettlementReference: Boolean(row.has_settlement_reference),
    totalCount: Number(row.total_count) || 0,
  };

  return expense;
}

function normalizeAdminExpenseDetail(row = {}) {
  return Object.assign(normalizeAdminExpenseListRow(row), {
    subtotalAmount: roundExpenseAmount(row.subtotal_amount),
    taxRate: roundExpenseAmount(row.tax_rate),
    taxAmount: roundExpenseAmount(row.tax_amount),
    internalNotes: String(row.internal_notes || "").trim(),
    rejectionReason: String(row.rejection_reason || "").trim(),
    cancellationReason: String(row.cancellation_reason || "").trim(),
    createdBy: String(row.created_by || "").trim(),
    createdByHumanCode: String(row.created_by_human_code || "").trim(),
    createdByName: String(row.created_by_name || "").trim(),
    submittedByHumanCode: String(row.submitted_by_human_code || "").trim(),
    submittedByName: String(row.submitted_by_name || "").trim(),
    approvedAt: row.approved_at || "",
    approvedByHumanCode: String(row.approved_by_human_code || "").trim(),
    approvedByName: String(row.approved_by_name || "").trim(),
    rejectedAt: row.rejected_at || "",
    rejectedByHumanCode: String(row.rejected_by_human_code || "").trim(),
    rejectedByName: String(row.rejected_by_name || "").trim(),
    cancelledAt: row.cancelled_at || "",
    cancelledByHumanCode: String(row.cancelled_by_human_code || "").trim(),
    cancelledByName: String(row.cancelled_by_name || "").trim(),
    updatedByHumanCode: String(row.updated_by_human_code || "").trim(),
    updatedByName: String(row.updated_by_name || "").trim(),
    advancedByDriverId: String(row.advanced_by_driver_id || "").trim(),
    advancedByDriverHumanCode: String(row.advanced_by_driver_human_code || "").trim(),
    advancedByDriverName: String(row.advanced_by_driver_name || "").trim(),
    advancedByUserId: String(row.advanced_by_user_id || "").trim(),
    advancedByUserHumanCode: String(row.advanced_by_user_human_code || "").trim(),
    advancedByUserName: String(row.advanced_by_user_name || "").trim(),
    serviceType: String(row.service_type || "").trim(),
    serviceStatus: String(row.service_status || "").trim(),
    documents: normalizeExpenseJsonArray(row.documents),
    payments: normalizeExpenseJsonArray(row.payments),
    reimbursements: normalizeExpenseJsonArray(row.reimbursements),
    history: normalizeExpenseJsonArray(row.history),
    allocations: normalizeExpenseJsonArray(row.allocations),
  });
}

function normalizeExpenseJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function registerAdminExpenseCategoryOption(expense) {
  if (!expense.categoryId) {
    return;
  }

  adminExpenseCategoryOptions.set(expense.categoryId, {
    id: expense.categoryId,
    key: expense.categoryCode,
    name: expense.categoryName || expense.categoryCode || expense.categoryId,
  });
}

function renderExpenseDocumentsSection(documents = []) {
  if (!documents.length) {
    return renderExpenseEmptySection("Documentos", "Sin documentos adjuntos");
  }

  return renderExpenseCollectionSection(
    "Documentos",
    documents.map((document) => [
      ["Archivo", document.file_name || document.document_number || "Documento"],
      ["Tipo", getExpenseDocumentTypeLabel(document.document_type)],
      ["Estado", getExpenseDocumentStatusLabel(document.status)],
      ["Fecha", formatExpenseDate(document.issued_at) || formatExpenseDateTime(document.created_at)],
      ["Subido por", formatExpenseUserLabel(document.created_by_human_code, document.created_by_name)],
    ]),
  );
}

function renderExpensePaymentsSection(payments = []) {
  if (!payments.length) {
    return renderExpenseEmptySection("Pagos", "Sin pagos registrados");
  }

  return renderExpenseCollectionSection(
    "Pagos",
    payments.map((payment) => [
      ["Pago", payment.human_code || "Pago"],
      ["Importe", formatExpenseMoney(payment.amount, payment.currency_code)],
      ["Estado", getExpensePaymentRecordStatusLabel(payment.status)],
      ["M\u00e9todo", getExpensePaymentMethodLabel(payment.payment_method)],
      ["Fecha", formatExpenseDateTime(payment.paid_at || payment.registered_at)],
      ["Cuenta", formatExpenseCashAccountLabel(payment.cash_account_name, payment.cash_account_type)],
      ["Referencia", payment.external_reference],
      ["Actor", formatExpenseUserLabel(payment.created_by_human_code, payment.created_by_name)],
      ["Notas", payment.notes, true],
    ]),
  );
}

function renderExpenseReimbursementsSection(reimbursements = []) {
  if (!reimbursements.length) {
    return renderExpenseEmptySection("Reembolsos", "Sin reembolsos registrados");
  }

  return renderExpenseCollectionSection(
    "Reembolsos",
    reimbursements.map((reimbursement) => [
      ["Reembolso", reimbursement.human_code || "Reembolso"],
      ["Importe", formatExpenseMoney(reimbursement.amount, reimbursement.currency_code)],
      ["Estado", getExpensePaymentRecordStatusLabel(reimbursement.status)],
      ["Beneficiario", formatExpenseReimbursementBeneficiary(reimbursement)],
      ["M\u00e9todo", getExpensePaymentMethodLabel(reimbursement.payment_method)],
      ["Fecha", formatExpenseDateTime(reimbursement.reimbursed_at)],
      ["Cuenta", formatExpenseCashAccountLabel(reimbursement.cash_account_name, reimbursement.cash_account_type)],
      ["Referencia", reimbursement.external_reference],
      ["Actor", formatExpenseUserLabel(reimbursement.created_by_human_code, reimbursement.created_by_name)],
      ["Notas", reimbursement.notes, true],
    ]),
  );
}

function renderExpenseHistorySection(history = []) {
  if (!history.length) {
    return renderExpenseEmptySection("Historial", "Sin historial registrado");
  }

  return renderExpenseCollectionSection(
    "Historial",
    history.map((event) => [
      ["Cambio", `${getExpenseStatusLabel(event.previous_status) || "Inicio"} -> ${getExpenseStatusLabel(event.new_status)}`],
      ["Fecha", formatExpenseDateTime(event.changed_at)],
      ["Actor", formatExpenseUserLabel(event.changed_by_human_code, event.changed_by_name)],
      ["Raz\u00f3n", event.reason, true],
    ]),
  );
}

function renderExpenseAllocationsSection(allocations = []) {
  if (!allocations.length) {
    return "";
  }

  return renderExpenseCollectionSection(
    "Allocations",
    allocations.map((allocation) => [
      ["Tipo", getExpenseAllocationTypeLabel(allocation.allocation_type)],
      ["Servicio", allocation.service_human_code],
      ["Veh\u00edculo", allocation.vehicle_human_code],
      ["Conductor", formatExpenseDriverLabel(allocation.driver_human_code, allocation.driver_name)],
      ["Importe", formatExpenseMoney(allocation.allocated_amount)],
      ["Porcentaje", allocation.percentage ? `${formatExpenseDecimal(allocation.percentage)}%` : ""],
      ["Descripci\u00f3n", allocation.description, true],
    ]),
  );
}

function renderExpenseEmptySection(title, message) {
  return `
    <section class="expense-detail-section">
      ${title ? `<h3 class="modal__section-title">${escapeExpenseHtml(title)}</h3>` : ""}
      <p class="modal__hint">${escapeExpenseHtml(message)}</p>
    </section>
  `;
}

function renderExpenseCollectionSection(title, itemGroups = []) {
  const content = itemGroups
    .map((fields) => renderExpenseDetailSection("", fields, { compact: true }))
    .join("");

  return `
    <section class="expense-detail-section">
      ${title ? `<h3 class="modal__section-title">${escapeExpenseHtml(title)}</h3>` : ""}
      ${content || '<p class="modal__hint">Sin registros.</p>'}
    </section>
  `;
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
      ${title ? `<h3 class="modal__section-title">${escapeExpenseHtml(title)}</h3>` : ""}
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

function renderMockExpenseAmountSection(expense) {
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

  return Boolean(text && text !== "-" && text !== "Sin fecha" && text !== "Sin referencia" && text !== "Sin motivo" && text !== "Sin registro");
}

function isEmptyExpenseRelation(value) {
  const text = String(value || "").trim();

  return !text || text === "Sin vehiculo" || text === "Sin servicio" || text === "Sin relacion" || text === "Sin proveedor";
}

function renderExpenseDetailActions(detail) {
  const canReview = detail?.status === "submitted";
  const canPay = canPayAdminExpense(detail);
  const canReimburse = canReimburseAdminExpense(detail);
  const canCancel = canCancelAdminExpense(detail);

  return `
    <div class="expense-detail-actions__group expense-detail-actions__group--left">
      ${
        canReview
          ? `<button class="button button--compact" type="button" data-expense-action="approve">Aprobar</button><button class="button button--compact button--danger" type="button" data-expense-action="reject">Rechazar</button>`
          : ""
      }
      ${canPay ? `<button class="button button--compact" type="button" data-expense-action="pay">Pagar</button>` : ""}
      ${canReimburse ? `<button class="button button--compact" type="button" data-expense-action="reimburse">Reembolsar</button>` : ""}
      ${canCancel ? `<button class="button button--compact button--danger" type="button" data-expense-action="cancel">Cancelar</button>` : ""}
    </div>
    <div class="expense-detail-actions__group expense-detail-actions__group--right">
      <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
    </div>
  `;
}

function handleExpenseAction(action) {
  const expense = adminExpenseDetail;

  if (!expense) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (action === "pay") {
    if (!canPayAdminExpense(expense)) {
      notifyExpense("Este gasto no esta pendiente de pago.", "warning");
      return;
    }

    void openExpensePaymentModal(expense);
    return;
  }

  if (action === "reimburse") {
    if (!canReimburseAdminExpense(expense)) {
      notifyExpense("Este gasto no esta pendiente de reembolso.", "warning");
      return;
    }

    void openExpenseReimbursementModal(expense);
    return;
  }

  if (action === "cancel") {
    if (!canCancelAdminExpense(expense)) {
      notifyExpense("Este gasto no se puede cancelar desde tu contexto actual.", "warning");
      return;
    }

    openExpenseCancelModal(expense);
    return;
  }
  if (!["approve", "reject"].includes(action)) {
    notifyExpense("Accion de gasto no disponible.", "warning");
    return;
  }

  if (expense.status !== "submitted") {
    notifyExpense("Solo los gastos enviados pueden revisarse.", "warning");
    return;
  }

  openExpenseReviewModal(expense, action);
}

function openExpenseReviewModal(expense, action) {
  pendingExpenseAction = { type: action, expenseId: expense.expenseId };
  const isApproval = action === "approve";
  const amountField = getExpensesElement("expense-review-amount-field");
  const amountInput = getExpensesElement("expense-review-amount");
  const reason = getExpensesElement("expense-review-reason");
  const reasonLabel = reason?.closest("label")?.querySelector("span");
  const submitButton = getExpensesElement("expense-review-form")?.querySelector('button[type="submit"]');

  setExpensesText("expense-review-title", isApproval ? "Aprobar gasto" : "Rechazar gasto");
  renderExpenseReviewSummary(expense);
  setExpenseInputValue("expense-review-amount", expense.amount);
  setExpenseInputValue("expense-review-reason", "");
  setExpenseFormError("expense-review-error", "");

  if (amountField) {
    amountField.hidden = true;
  }

  if (amountInput) {
    amountInput.readOnly = true;
  }

  if (reason) {
    reason.required = !isApproval;
  }

  if (reasonLabel) {
    reasonLabel.textContent = isApproval ? "Notas internas" : "Motivo del rechazo *";
  }

  if (submitButton) {
    submitButton.textContent = isApproval ? "Aprobar gasto" : "Rechazar gasto";
    submitButton.classList.toggle("button--danger", !isApproval);
  }

  openExpenseModal("expense-review-modal");
  reason?.focus();
}

async function submitExpenseReview(event) {
  event.preventDefault();

  if (isSubmittingExpenseReview) {
    return;
  }

  const action = pendingExpenseAction?.type;
  const expenseId = pendingExpenseAction?.expenseId;
  const notes = getExpenseInputValue("expense-review-reason");
  const client = getExpensesSupabaseClient();

  if (!expenseId || !["approve", "reject"].includes(action)) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!client) {
    setExpenseFormError("expense-review-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  if (action === "reject" && !notes) {
    setExpenseFormError("expense-review-error", "El motivo de rechazo es obligatorio.");
    notifyExpense("El motivo de rechazo es obligatorio.", "warning");
    return;
  }

  isSubmittingExpenseReview = true;
  setExpenseReviewSubmitDisabled(true);
  setExpenseFormError("expense-review-error", "");

  try {
    const rpcName = action === "approve" ? "approve_expense" : "reject_expense";
    const rpcPayload = action === "approve" ? { p_expense_id: expenseId, p_notes: notes || null } : { p_expense_id: expenseId, p_reason: notes };
    const { error } = await client.rpc(rpcName, rpcPayload);

    if (error) {
      throw error;
    }

    closeExpenseModal(getExpensesElement("expense-review-modal"));
    notifyExpense(action === "approve" ? "Gasto aprobado correctamente." : "Gasto rechazado correctamente.", "success");
    await refreshAdminExpenseReviewState(expenseId);
  } catch (error) {
    console.error("[ELARA Expenses] No se pudo revisar el gasto real.", { error });
    setExpenseFormError("expense-review-error", formatExpenseError(error, "No se pudo completar la revision del gasto."));
    notifyExpense(formatExpenseError(error, "No se pudo completar la revision del gasto."), "error");
  } finally {
    isSubmittingExpenseReview = false;
    setExpenseReviewSubmitDisabled(false);
  }
}

function renderExpenseReviewSummary(expense) {
  const responsible = getExpenseResponsibleLabel(expense);

  setExpensesText("expense-review-summary-id", expense.humanCode || expense.expenseId);
  setExpensesText("expense-review-summary-concept", formatExpenseCategoryLabel(expense) || expense.description || "Sin categoria");
  setExpensesText("expense-review-summary-responsible", [responsible.primary, responsible.secondary].filter(Boolean).join(" - ") || "Sin responsable");
  setExpensesText("expense-review-summary-amount", formatExpenseMoney(expense.amount, expense.currencyCode));
}

function setExpenseReviewSubmitDisabled(disabled) {
  const button = getExpensesElement("expense-review-form")?.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = disabled;
  }
}

function canPayAdminExpense(expense) {
  return Boolean(
    expense &&
      expense.status === "approved" &&
      expense.paymentResponsibility === "elara" &&
      expense.paymentStatus === "unpaid" &&
      roundExpenseAmount(expense.pendingPaymentAmount) > 0,
  );
}

function canReimburseAdminExpense(expense) {
  return Boolean(
    expense &&
      expense.status === "approved" &&
      expense.paymentResponsibility === "driver_advance" &&
      expense.reimbursementStatus === "pending" &&
      expense.reimbursable === true,
  );
}

function canCancelAdminExpense(expense) {
  return Boolean(expense && getExpenseActiveContext() === "superadmin" && ["draft", "submitted", "approved"].includes(expense.status));
}

async function openExpensePaymentModal(expense) {
  const client = getExpensesSupabaseClient();

  pendingExpenseAction = { type: "pay", expenseId: expense.expenseId };
  renderExpensePaymentSummary(expense);
  setSelectOptions("expense-payment-method", ADMIN_EXPENSE_PAYMENT_METHODS, "cash");
  setExpenseInputValue("expense-payment-paid-at", getExpenseDateTimeLocalValue());
  setExpenseInputValue("expense-payment-notes", "");
  setExpenseFormError("expense-payment-error", "");
  renderExpensePaymentCashAccountOptions([], "");
  setExpensePaymentSubmitDisabled(true);
  openExpenseModal("expense-payment-modal");

  if (!client) {
    setExpenseFormError("expense-payment-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  try {
    const accounts = await loadExpenseReimbursementCashAccounts(expense.currencyCode);
    renderExpensePaymentCashAccountOptions(accounts, accounts[0]?.id || "");
    setExpensePaymentSubmitDisabled(accounts.length === 0);

    if (!accounts.length) {
      setExpenseFormError("expense-payment-error", "No hay cuentas administrativas activas compatibles con la moneda del gasto.");
    }
  } catch (error) {
    console.error("[ELARA Expenses] No se pudieron cargar cuentas reales para pago de gasto.", { error });
    setExpenseFormError("expense-payment-error", formatExpenseError(error, "No se pudieron cargar cuentas de caja."));
    notifyExpense(formatExpenseError(error, "No se pudieron cargar cuentas de caja."), "error");
  }
}

function renderExpensePaymentSummary(expense) {
  const supplier = expense.supplierName || expense.supplierHumanCode || "Sin proveedor";

  setExpensesText("expense-payment-summary-id", expense.humanCode || expense.expenseId);
  setExpensesText("expense-payment-summary-category", formatExpenseCategoryLabel(expense) || "Sin categoria");
  setExpensesText("expense-payment-summary-supplier", supplier);
  setExpensesText("expense-payment-summary-amount", formatExpenseMoney(expense.pendingPaymentAmount, expense.currencyCode));
  setExpensesText("expense-payment-summary-currency", expense.currencyCode || "EUR");
}

function renderExpensePaymentCashAccountOptions(accounts, selectedValue = "") {
  const select = getExpensesElement("expense-payment-cash-account");

  if (!select) {
    return;
  }

  const options = accounts.map((account) => [account.id, formatExpenseCashAccountOptionLabel(account)]);
  setSelectOptions("expense-payment-cash-account", [["", accounts.length ? "Selecciona una cuenta" : "Sin cuentas compatibles"], ...options], selectedValue);
}

async function submitExpensePayment(event) {
  event.preventDefault();

  if (isSubmittingExpensePayment) {
    return;
  }

  const expenseId = pendingExpenseAction?.type === "pay" ? pendingExpenseAction.expenseId : "";
  const cashAccountId = getExpenseInputValue("expense-payment-cash-account");
  const method = getExpenseInputValue("expense-payment-method");
  const paidAt = getExpenseDateTimeInputIso("expense-payment-paid-at");
  const notes = getExpenseInputValue("expense-payment-notes");
  const client = getExpensesSupabaseClient();

  if (!expenseId) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!cashAccountId) {
    setExpenseFormError("expense-payment-error", "Selecciona una cuenta de salida.");
    notifyExpense("Selecciona una cuenta de salida.", "warning");
    return;
  }

  if (!ADMIN_EXPENSE_PAYMENT_METHODS.some(([value]) => value === method)) {
    setExpenseFormError("expense-payment-error", "Selecciona un metodo valido.");
    notifyExpense("Selecciona un metodo valido.", "warning");
    return;
  }

  if (!paidAt) {
    setExpenseFormError("expense-payment-error", "Selecciona una fecha de pago valida.");
    notifyExpense("Selecciona una fecha de pago valida.", "warning");
    return;
  }

  if (!client) {
    setExpenseFormError("expense-payment-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  isSubmittingExpensePayment = true;
  setExpensePaymentSubmitDisabled(true);
  setExpenseFormError("expense-payment-error", "");

  try {
    const { error } = await client.rpc("register_expense_payment", {
      p_expense_id: expenseId,
      p_cash_account_id: cashAccountId,
      p_payment_method: "cash",
      p_paid_at: paidAt,
      p_notes: notes || null,
    });

    if (error) {
      throw error;
    }

    closeExpenseModal(getExpensesElement("expense-payment-modal"));
    notifyExpense("Gasto pagado correctamente.", "success");
    await refreshAdminExpenseReviewState(expenseId);
  } catch (error) {
    console.error("[ELARA Expenses] No se pudo pagar el gasto real.", { error });
    setExpenseFormError("expense-payment-error", formatExpenseError(error, "No se pudo pagar el gasto."));
    notifyExpense(formatExpenseError(error, "No se pudo pagar el gasto."), "error");
  } finally {
    isSubmittingExpensePayment = false;
    setExpensePaymentSubmitDisabled(false);
  }
}

function setExpensePaymentSubmitDisabled(disabled) {
  const button = getExpensesElement("expense-payment-form")?.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = disabled;
  }
}

async function openExpenseReimbursementModal(expense) {
  const client = getExpensesSupabaseClient();

  pendingExpenseAction = { type: "reimburse", expenseId: expense.expenseId };
  renderExpenseReimbursementSummary(expense);
  setSelectOptions("expense-reimbursement-method", EXPENSE_REIMBURSEMENT_METHODS, "cash");
  setExpenseInputValue("expense-reimbursement-reference", "");
  setExpenseInputValue("expense-reimbursement-notes", "");
  setExpenseFormError("expense-reimbursement-error", "");
  renderExpenseReimbursementCashAccountOptions([], "");
  setExpenseReimbursementSubmitDisabled(true);
  openExpenseModal("expense-reimbursement-modal");

  if (!client) {
    setExpenseFormError("expense-reimbursement-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  try {
    const accounts = await loadExpenseReimbursementCashAccounts(expense.currencyCode);
    renderExpenseReimbursementCashAccountOptions(accounts, accounts[0]?.id || "");
    setExpenseReimbursementSubmitDisabled(accounts.length === 0);

    if (!accounts.length) {
      setExpenseFormError("expense-reimbursement-error", "No hay cuentas administrativas activas compatibles con la moneda del gasto.");
    }
  } catch (error) {
    console.error("[ELARA Expenses] No se pudieron cargar cuentas reales para reembolso.", { error });
    setExpenseFormError("expense-reimbursement-error", formatExpenseError(error, "No se pudieron cargar cuentas de caja."));
    notifyExpense(formatExpenseError(error, "No se pudieron cargar cuentas de caja."), "error");
  }
}

function renderExpenseReimbursementSummary(expense) {
  const beneficiary = formatExpenseDriverLabel(expense.advancedByDriverHumanCode, expense.advancedByDriverName) || formatExpenseDriverLabel(expense.driverHumanCode, expense.driverName) || "Conductor sin identificar";

  setExpensesText("expense-reimbursement-summary-id", expense.humanCode || expense.expenseId);
  setExpensesText("expense-reimbursement-summary-category", formatExpenseCategoryLabel(expense) || "Sin categoria");
  setExpensesText("expense-reimbursement-summary-beneficiary", beneficiary);
  setExpensesText("expense-reimbursement-summary-amount", formatExpenseMoney(expense.pendingReimbursementAmount || expense.amount, expense.currencyCode));
  setExpensesText("expense-reimbursement-summary-currency", expense.currencyCode || "EUR");
}

async function loadExpenseReimbursementCashAccounts(currencyCode) {
  const client = getExpensesSupabaseClient();
  const currency = String(currencyCode || "EUR").trim() || "EUR";

  if (!client) {
    throw new Error("Supabase client is not available.");
  }

  const { data, error } = await client
    .from("v_admin_cash_account_overview")
    .select("cash_account_id,name,account_type,currency_code,status,theoretical_balance")
    .eq("status", "active")
    .eq("currency_code", currency)
    .in("account_type", ["central", "administrative"])
    .order("account_type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : []).map(normalizeExpenseCashAccountOption).filter((account) => account.id);
}

function normalizeExpenseCashAccountOption(row = {}) {
  return {
    id: String(row.cash_account_id || "").trim(),
    name: String(row.name || "").trim(),
    accountType: String(row.account_type || "").trim(),
    currencyCode: String(row.currency_code || "EUR").trim() || "EUR",
    status: String(row.status || "").trim(),
    balance: roundExpenseAmount(row.theoretical_balance),
  };
}

function renderExpenseReimbursementCashAccountOptions(accounts, selectedValue = "") {
  const select = getExpensesElement("expense-reimbursement-cash-account");

  if (!select) {
    return;
  }

  const options = accounts.map((account) => [account.id, formatExpenseCashAccountOptionLabel(account)]);
  setSelectOptions("expense-reimbursement-cash-account", [["", accounts.length ? "Selecciona una cuenta" : "Sin cuentas compatibles"], ...options], selectedValue);
}

function formatExpenseCashAccountOptionLabel(account) {
  const type = getExpenseCashAccountTypeLabel(account.accountType);
  const balance = formatExpenseMoney(account.balance, account.currencyCode);
  return [account.name || "Cuenta", type, account.currencyCode, balance].filter(Boolean).join(" - ");
}

function getExpenseCashAccountTypeLabel(type) {
  return {
    central: "Central",
    administrative: "Administrativa",
    driver: "Conductor",
  }[String(type || "").trim()] || String(type || "").trim();
}

async function submitExpenseReimbursement(event) {
  event.preventDefault();

  if (isSubmittingExpenseReimbursement) {
    return;
  }

  const expenseId = pendingExpenseAction?.type === "reimburse" ? pendingExpenseAction.expenseId : "";
  const cashAccountId = getExpenseInputValue("expense-reimbursement-cash-account");
  const method = getExpenseInputValue("expense-reimbursement-method");
  const reference = getExpenseInputValue("expense-reimbursement-reference");
  const notes = getExpenseInputValue("expense-reimbursement-notes");
  const client = getExpensesSupabaseClient();

  if (!expenseId) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!cashAccountId) {
    setExpenseFormError("expense-reimbursement-error", "Selecciona una cuenta de salida.");
    notifyExpense("Selecciona una cuenta de salida.", "warning");
    return;
  }

  if (!EXPENSE_REIMBURSEMENT_METHODS.some(([value]) => value === method)) {
    setExpenseFormError("expense-reimbursement-error", "Selecciona un metodo valido.");
    notifyExpense("Selecciona un metodo valido.", "warning");
    return;
  }

  if (!client) {
    setExpenseFormError("expense-reimbursement-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  isSubmittingExpenseReimbursement = true;
  setExpenseReimbursementSubmitDisabled(true);
  setExpenseFormError("expense-reimbursement-error", "");

  try {
    const { error } = await client.rpc("reimburse_expense", {
      p_expense_id: expenseId,
      p_cash_account_id: cashAccountId,
      p_method: method,
      p_reference: reference || null,
      p_notes: notes || null,
    });

    if (error) {
      throw error;
    }

    closeExpenseModal(getExpensesElement("expense-reimbursement-modal"));
    notifyExpense("Gasto reembolsado correctamente.", "success");
    await refreshAdminExpenseReviewState(expenseId);
  } catch (error) {
    console.error("[ELARA Expenses] No se pudo reembolsar el gasto real.", { error });
    setExpenseFormError("expense-reimbursement-error", formatExpenseError(error, "No se pudo reembolsar el gasto."));
    notifyExpense(formatExpenseError(error, "No se pudo reembolsar el gasto."), "error");
  } finally {
    isSubmittingExpenseReimbursement = false;
    setExpenseReimbursementSubmitDisabled(false);
  }
}

function setExpenseReimbursementSubmitDisabled(disabled) {
  const button = getExpensesElement("expense-reimbursement-form")?.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = disabled;
  }
}

function getExpenseDateTimeLocalValue(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const offsetMs = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getExpenseDateTimeInputIso(id) {
  const value = getExpenseInputValue(id);

  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function refreshAdminExpenseReviewState(expenseId) {
  const client = getExpensesSupabaseClient();

  await loadAdminExpenses().catch((error) => {
    console.error("[ELARA Expenses] No se pudo refrescar el listado tras revisar el gasto.", { error });
  });

  if (!client || getExpensesElement("expense-detail-modal")?.hidden) {
    return;
  }

  try {
    const { data, error } = await client.rpc("get_admin_expense_detail", { p_expense_id: expenseId });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Expense was not found after review.");
    }

    adminExpenseDetail = normalizeAdminExpenseDetail(row);
    selectedExpenseId = adminExpenseDetail.expenseId;
    renderExpenseDetail(adminExpenseDetail);
  } catch (error) {
    console.error("[ELARA Expenses] No se pudo refrescar el detalle tras revisar el gasto.", { error });
    notifyExpense(formatExpenseError(error, "El gasto se reviso, pero no se pudo refrescar el detalle."), "warning");
  }
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
  const responsible = expense.supplierName || expense.supplierHumanCode || formatExpenseDriverLabel(expense.advancedByDriverHumanCode, expense.advancedByDriverName) || formatExpenseUserLabel(expense.advancedByUserHumanCode, expense.advancedByUserName) || getExpensePaymentResponsibilityLabel(expense.paymentResponsibility) || "Sin responsable";

  pendingExpenseAction = { type: "cancel", expenseId: expense.expenseId };
  setExpensesText("expense-cancel-summary-id", expense.humanCode || expense.expenseId);
  setExpensesText("expense-cancel-summary-category", formatExpenseCategoryLabel(expense) || "Sin categoria");
  setExpensesText("expense-cancel-summary-responsible", responsible);
  setExpensesText("expense-cancel-summary-amount", formatExpenseMoney(expense.amount, expense.currencyCode));
  setExpensesText("expense-cancel-summary-status", getExpenseStatusLabel(expense.status) || expense.status || "Sin estado");
  setExpenseInputValue("expense-cancel-reason", "");
  setExpenseFormError("expense-cancel-error", "");
  setExpenseCancellationSubmitDisabled(false);
  openExpenseModal("expense-cancel-modal");
  getExpensesElement("expense-cancel-reason")?.focus();
}

async function submitExpenseCancel(event) {
  event.preventDefault();

  if (isSubmittingExpenseCancellation) {
    return;
  }

  const expenseId = pendingExpenseAction?.type === "cancel" ? pendingExpenseAction.expenseId : "";
  const reason = getExpenseInputValue("expense-cancel-reason").trim();
  const client = getExpensesSupabaseClient();

  if (!expenseId) {
    notifyExpense("No se encontro el gasto seleccionado.", "warning");
    return;
  }

  if (!reason) {
    setExpenseFormError("expense-cancel-error", "El motivo de cancelaci\u00f3n es obligatorio.");
    notifyExpense("El motivo de cancelaci\u00f3n es obligatorio.", "warning");
    return;
  }

  if (!client) {
    setExpenseFormError("expense-cancel-error", "No se pudo conectar con Supabase.");
    notifyExpense("No se pudo conectar con Supabase.", "error");
    return;
  }

  isSubmittingExpenseCancellation = true;
  setExpenseCancellationSubmitDisabled(true);
  setExpenseFormError("expense-cancel-error", "");

  try {
    const { error } = await client.rpc("cancel_expense", {
      p_expense_id: expenseId,
      p_reason: reason,
    });

    if (error) {
      throw error;
    }

    closeExpenseModal(getExpensesElement("expense-cancel-modal"));
    notifyExpense("Gasto cancelado correctamente.", "success");
    await refreshAdminExpenseReviewState(expenseId);
  } catch (error) {
    console.error("[ELARA Expenses] No se pudo cancelar el gasto real.", { error });
    const message = formatExpenseError(error, "No se pudo cancelar el gasto.");
    setExpenseFormError("expense-cancel-error", message);
    notifyExpense(message, "error");
  } finally {
    isSubmittingExpenseCancellation = false;
    setExpenseCancellationSubmitDisabled(false);
  }
}

function setExpenseCancellationSubmitDisabled(disabled) {
  const button = getExpensesElement("expense-cancel-form")?.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = disabled;
  }
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
                  <span>Categoria</span>
                  <strong id="expense-review-summary-concept">-</strong>
                </div>
                <div>
                  <span>Responsable</span>
                  <strong id="expense-review-summary-responsible">-</strong>
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

      <div class="modal-backdrop" id="expense-reimbursement-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-reimbursement-title" hidden>
        <section class="modal modal--summary modal--expense-settlement">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Caja</p>
              <h2 id="expense-reimbursement-title">Reembolsar gasto</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-settlement-form" id="expense-reimbursement-form" novalidate>
            <div class="modal__body modal__body--summary expense-settlement-form__body">
              <div class="expense-settlement-summary" aria-label="Resumen del reembolso">
                <div>
                  <span>C&oacute;digo gasto</span>
                  <strong id="expense-reimbursement-summary-id">-</strong>
                </div>
                <div>
                  <span>Categor&iacute;a</span>
                  <strong id="expense-reimbursement-summary-category">-</strong>
                </div>
                <div>
                  <span>Conductor beneficiario</span>
                  <strong id="expense-reimbursement-summary-beneficiary">-</strong>
                </div>
                <div>
                  <span>Importe a reembolsar</span>
                  <strong id="expense-reimbursement-summary-amount">-</strong>
                </div>
                <div>
                  <span>Moneda</span>
                  <strong id="expense-reimbursement-summary-currency">-</strong>
                </div>
              </div>
              <label class="field"><span>Cuenta de salida *</span><select id="expense-reimbursement-cash-account" required></select></label>
              <label class="field"><span>M&eacute;todo *</span><select id="expense-reimbursement-method" required></select></label>
              <label class="field"><span>Referencia</span><input id="expense-reimbursement-reference" type="text" maxlength="200" /></label>
              <label class="field field--compact-textarea"><span>Notas</span><textarea id="expense-reimbursement-notes" rows="3" maxlength="1000"></textarea></label>
              <p class="form-error" id="expense-reimbursement-error" hidden></p>
            </div>
            <div class="modal__actions expense-settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Confirmar reembolso</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-payment-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-payment-title" hidden>
        <section class="modal modal--summary modal--expense-settlement">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Caja</p>
              <h2 id="expense-payment-title">Pagar gasto</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-settlement-form" id="expense-payment-form" novalidate>
            <div class="modal__body modal__body--summary expense-settlement-form__body">
              <div class="expense-settlement-summary" aria-label="Resumen del pago">
                <div>
                  <span>C&oacute;digo gasto</span>
                  <strong id="expense-payment-summary-id">-</strong>
                </div>
                <div>
                  <span>Categor&iacute;a</span>
                  <strong id="expense-payment-summary-category">-</strong>
                </div>
                <div>
                  <span>Proveedor</span>
                  <strong id="expense-payment-summary-supplier">-</strong>
                </div>
                <div>
                  <span>Importe pendiente</span>
                  <strong id="expense-payment-summary-amount">-</strong>
                </div>
                <div>
                  <span>Moneda</span>
                  <strong id="expense-payment-summary-currency">-</strong>
                </div>
              </div>
              <label class="field"><span>Cuenta de salida *</span><select id="expense-payment-cash-account" required></select></label>
              <label class="field"><span>M&eacute;todo *</span><select id="expense-payment-method" required></select></label>
              <label class="field"><span>Fecha de pago *</span><input id="expense-payment-paid-at" type="datetime-local" required /></label>
              <label class="field field--compact-textarea"><span>Notas</span><textarea id="expense-payment-notes" rows="3" maxlength="1000"></textarea></label>
              <p class="form-error" id="expense-payment-error" hidden></p>
            </div>
            <div class="modal__actions expense-settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Confirmar pago</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="expense-cancel-modal" data-expense-modal="true" role="dialog" aria-modal="true" aria-labelledby="expense-cancel-title" hidden>
        <section class="modal modal--summary modal--expense-cancel">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">GASTOS</p>
              <h2 id="expense-cancel-title">Cancelar gasto</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cerrar</button>
          </header>
          <form class="expense-form expense-cancel-form" id="expense-cancel-form" novalidate>
            <div class="modal__body modal__body--summary expense-cancel-form__body">
              <div class="expense-cancel-summary" aria-label="Resumen del gasto">
                <div>
                  <span>C&oacute;digo gasto</span>
                  <strong id="expense-cancel-summary-id">-</strong>
                </div>
                <div>
                  <span>Categor&iacute;a</span>
                  <strong id="expense-cancel-summary-category">-</strong>
                </div>
                <div>
                  <span>Responsable / proveedor</span>
                  <strong id="expense-cancel-summary-responsible">-</strong>
                </div>
                <div>
                  <span>Importe</span>
                  <strong id="expense-cancel-summary-amount">-</strong>
                </div>
                <div>
                  <span>Estado actual</span>
                  <strong id="expense-cancel-summary-status">-</strong>
                </div>
              </div>
              <p class="modal__hint expense-cancel-note">La cancelaci&oacute;n no revierte pagos, reembolsos ni movimientos de caja.</p>
              <label class="field field--compact-textarea"><span>Motivo de cancelaci&oacute;n *</span><textarea id="expense-cancel-reason" rows="3" required></textarea></label>
              <p class="form-error" id="expense-cancel-error" hidden></p>
            </div>
            <div class="modal__actions expense-cancel-form__actions">
              <button class="button button--compact button--muted" type="button" data-expense-modal-close>Cancelar</button>
              <button class="button button--compact button--danger" type="submit">Confirmar cancelaci&oacute;n</button>
            </div>
          </form>
        </section>
      </div>    `,
  );

  getExpensesElement("expense-new-form")?.addEventListener("submit", submitNewExpense);
  getExpensesElement("expense-review-form")?.addEventListener("submit", submitExpenseReview);
  getExpensesElement("expense-reimbursement-form")?.addEventListener("submit", submitExpenseReimbursement);
  getExpensesElement("expense-payment-form")?.addEventListener("submit", submitExpensePayment);
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
  expensesFilters.categoryId = getSingleExpenseFilterValue(getCheckedExpenseValues("category")) || "";
  expensesFilters.paidBy = getCheckedExpenseValues("paidBy");
}

function getCheckedExpenseValues(filterName) {
  return Array.from(document.querySelectorAll(`[data-expense-filter="${filterName}"]:checked`)).map((input) => input.value);
}

function clearExpensesFilters() {
  expensesFilters = getDefaultExpensesFilters();
  expensesPage = 1;

  const search = getExpensesElement("expenses-search");

  if (search) search.value = "";

  document.querySelectorAll("[data-expense-filter]").forEach((input) => {
    input.checked = false;
  });

  void loadAdminExpenses();
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
  const queryCount = expensesFilters.query ? 1 : 0;
  const statusCount = expensesFilters.statuses.length ? 1 : 0;
  const categoryCount = expensesFilters.categoryId ? 1 : 0;
  const responsibilityCount = expensesFilters.paidBy.length ? 1 : 0;

  return queryCount + statusCount + categoryCount + responsibilityCount;
}

function changeExpensesPage(direction) {
  const totalPages = Math.max(1, Math.ceil(adminExpenseTotal / EXPENSES_PAGE_SIZE));

  if (direction === "prev") {
    expensesPage = Math.max(1, expensesPage - 1);
  } else if (direction === "next") {
    expensesPage = Math.min(totalPages, expensesPage + 1);
  }

  void loadAdminExpenses();
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
    categoryId: "",
    paidBy: [],
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
  const driver = formatExpenseDriverLabel(expense.driverHumanCode, expense.driverName) || formatExpenseDriverLabel(expense.advancedByDriverHumanCode, expense.advancedByDriverName);

  if (driver) {
    return {
      primary: driver,
      secondary: getExpensePaymentResponsibilityLabel(expense.paymentResponsibility),
    };
  }

  return {
    primary: getExpensePaymentResponsibilityLabel(expense.paymentResponsibility),
    secondary: getExpensePaymentStatusLabel(expense.paymentStatus),
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
  const service = formatExpenseServiceLabel(expense.serviceHumanCode, expense.serviceType, expense.serviceStatus);
  const vehicle = formatExpenseVehicleLabel(expense.vehicleHumanCode, expense.vehiclePlate, expense.vehicleLabel);
  const supplier = expense.supplierName || expense.supplierHumanCode || "Sin proveedor";

  if (service) {
    return { primary: service, secondary: vehicle || supplier };
  }

  if (vehicle) {
    return { primary: vehicle, secondary: supplier };
  }

  return { primary: supplier, secondary: "Sin relaci\u00f3n operativa" };
}

function getExpenseStatusBadge(status) {
  const tones = {
    draft: "warning",
    submitted: "info",
    approved: "success",
    rejected: "danger",
    cancelled: "neutral",
  };

  return { tone: tones[status] || "neutral" };
}

function getExpenseStatusLabel(status) {
  return {
    draft: "Borrador",
    submitted: "Enviado",
    approved: "Aprobado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
  }[String(status || "").trim()] || String(status || "").trim();
}

function getExpensePaymentStatusLabel(status) {
  return {
    unpaid: "Pendiente",
    partial: "Parcial",
    paid: "Pagado",
    cancelled: "Cancelado",
  }[String(status || "").trim()] || String(status || "").trim();
}

function getExpenseReimbursementStatusLabel(status) {
  return {
    not_applicable: "No aplica",
    pending: "Pendiente",
    reimbursed: "Reembolsado",
    cancelled: "Cancelado",
  }[String(status || "").trim()] || String(status || "").trim();
}

function getExpensePaymentResponsibilityLabel(value) {
  return {
    elara: "Pago por ELARA",
    user_advance: "Adelantado por usuario",
    driver_advance: "Adelantado por conductor",
  }[String(value || "").trim()] || String(value || "").trim();
}

function getExpensePaymentRecordStatusLabel(status) {
  return {
    pending: "Pendiente",
    completed: "Completado",
    cancelled: "Cancelado",
    failed: "Fallido",
    reversed: "Revertido",
  }[String(status || "").trim()] || String(status || "").trim();
}

function getExpensePaymentMethodLabel(method) {
  return {
    cash: "Efectivo",
    bank_transfer: "Transferencia",
    card: "Tarjeta",
    other: "Otro",
  }[String(method || "").trim()] || String(method || "").trim();
}

function getExpenseDocumentTypeLabel(type) {
  return {
    invoice: "Factura",
    receipt: "Recibo",
    ticket: "Ticket",
    contract: "Contrato",
    other: "Otro",
  }[String(type || "").trim()] || String(type || "").trim();
}

function getExpenseDocumentStatusLabel(status) {
  return {
    pending: "Pendiente",
    valid: "V\u00e1lido",
    rejected: "Rechazado",
    replaced: "Reemplazado",
    annulled: "Anulado",
  }[String(status || "").trim()] || String(status || "").trim();
}

function getExpenseAllocationTypeLabel(type) {
  return {
    service: "Servicio",
    vehicle: "Veh\u00edculo",
    driver: "Conductor",
    general: "General",
  }[String(type || "").trim()] || String(type || "").trim();
}

function formatExpenseCategoryLabel(expense) {
  const key = expense.categoryCode ? ` (${expense.categoryCode})` : "";
  return expense.categoryName ? `${expense.categoryName}${key}` : expense.categoryCode;
}

function formatExpenseDriverLabel(humanCode, name) {
  return [humanCode, name].map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
}

function formatExpenseUserLabel(humanCode, name) {
  return [humanCode, name].map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
}

function formatExpenseServiceLabel(humanCode, type, status) {
  const label = [humanCode, type].map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
  const statusLabel = status ? ` (${status})` : "";
  return label ? `${label}${statusLabel}` : "";
}

function formatExpenseVehicleLabel(humanCode, plate, fallback) {
  return [humanCode, plate].map((value) => String(value || "").trim()).filter(Boolean).join(" - ") || String(fallback || "").trim();
}

function formatExpenseActorDate(date, humanCode, name) {
  if (!date) {
    return "";
  }

  const actor = formatExpenseUserLabel(humanCode, name);
  return actor ? `${formatExpenseDateTime(date)} - ${actor}` : formatExpenseDateTime(date);
}

function formatExpenseCashAccountLabel(name, type) {
  return [name, type].map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
}

function formatExpenseReimbursementBeneficiary(reimbursement) {
  return formatExpenseDriverLabel(reimbursement.reimbursed_driver_human_code, reimbursement.reimbursed_driver_name) || formatExpenseUserLabel(reimbursement.reimbursed_user_human_code, reimbursement.reimbursed_user_name);
}

function formatExpenseDecimal(value) {
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value) || 0);
}

function roundExpenseAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

function getSingleExpenseFilterValue(values) {
  return Array.isArray(values) && values.length ? String(values[0] || "").trim() || null : null;
}

function getExpensesSupabaseClient() {
  return window.ElaraSupabase?.client || null;
}

function formatExpenseError(error, fallback) {
  const message = String(error?.message || error?.details || fallback || "Error inesperado.").trim();
  const translatedMessage = translateKnownExpenseError(error, fallback);
  return translatedMessage || message || fallback;
}

function translateKnownExpenseError(error, fallback) {
  const parts = [error?.message, error?.details, error?.hint, fallback]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const normalized = parts.join(" ").toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("completed payment")) {
    return "El gasto tiene un pago completado y no puede cancelarse sin una reversa expl\u00edcita del pago.";
  }

  if (normalized.includes("completed reimbursement")) {
    return "El gasto tiene un reembolso completado y no puede cancelarse sin una reversa expl\u00edcita.";
  }

  if (normalized.includes("active settlement")) {
    return "El gasto est\u00e1 incluido en una liquidaci\u00f3n activa y no puede cancelarse.";
  }

  if (normalized.includes("cannot be cancelled from status")) {
    return "Este estado no permite cancelar el gasto.";
  }

  const mentionsCancellation = normalized.includes("cancel") || normalized.includes("cancellation");
  const mentionsReason = normalized.includes("reason");
  const reasonIsMissing = normalized.includes("required") || normalized.includes("empty");
  if (mentionsCancellation && mentionsReason && reasonIsMissing) {
    return "Indica un motivo de cancelaci\u00f3n.";
  }

  return "";
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

function formatExpenseMoney(value, currency = "EUR") {
  const currencyCode = String(currency || "EUR").trim() || "EUR";

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currencyCode }).format(Number(value) || 0);
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
