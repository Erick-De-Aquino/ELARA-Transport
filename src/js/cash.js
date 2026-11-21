/*
  Proyecto Atlas / ELARA Transport
  Archivo: cash.js
  Responsabilidad: Caja, cobros en efectivo y rendiciones mock.
*/

"use strict";

const financeData = window.ElaraFinanceMock || {
  cashSettings: { currency: "EUR", singleCashBox: true },
  cashMovements: [],
  remittances: [],
  cashCounts: [],
};

const CASH_EVENT = "elara:cash-updated";
const REMITTANCES_EVENT = "elara:remittances-updated";
const ADMIN_INCIDENTS_EVENT = "elara:admin-incidents-updated";
const CASH_VALID_COLLECTOR_TYPES = ["Elara", "Administracion", "Chofer", "Colaborador"];
const CASH_REMITTANCE_HISTORY_PAGE_SIZE = 20;
const CASH_DEFAULT_HISTORY_DAYS = 30;
const CASH_DISCREPANCY_PAGE_SIZE = 20;

let isCashControlsInitialized = false;
let selectedCashRemittanceId = "";
let pendingCashRemittanceOverrunDraft = null;
let cashRemittanceHistoryPage = 1;
let cashRemittanceHistoryFilters = getDefaultCashRemittanceHistoryFilters();
let cashDiscrepancyPage = 1;
let cashDiscrepancyFilters = getDefaultCashDiscrepancyFilters();

function showCash() {
  return showOperationalCash();

  if (!canViewCash()) {
    showCashUnavailable("No tienes acceso a Caja.");
    return;
  }

  cashSetText("page-eyebrow", "Econom\u00eda");
  cashSetText("page-title", "Caja");
  cashSetText("page-summary", "Control de efectivo, rendiciones y movimientos de caja.");
  cashSetText("primary-action", "");
  cashSetModalTarget("primary-action", "");
  setElementVisibility("primary-action", false);

  initCashControls();
  renderCashView();
}

function renderCashView() {
  renderCashSummary();
  renderCashRemittances();
  renderCashMovements();
  renderCashForms();
  renderCashRemittanceHistory();
  renderAdminCashDiscrepancies();
  renderCashCounts();
}

function registerServiceCashPayment({ service, payment, collector, suppressEvents = false }) {
  ensureFinanceData();

  if (!service || !payment) {
    throw new Error("Datos de pago en efectivo incompletos.");
  }

  const normalizedCollector = normalizeCashCollector(collector);

  if (!normalizedCollector) {
    throw new Error("Colector de efectivo no valido.");
  }

  const serviceId = getCashServiceId(service);
  const amount = roundCashAmount(payment.amount);

  if (!serviceId || !payment.id || amount <= 0) {
    throw new Error("Datos de pago en efectivo no validos.");
  }

  payment.receiverType = normalizedCollector.type === "Administracion" ? "Elara" : normalizedCollector.type;
  payment.receiverId = normalizedCollector.id;
  payment.receiverName = normalizedCollector.name;
  payment.cashCollectorType = payment.receiverType;
  payment.cashCollectorId = payment.receiverId;
  payment.cashCollectorName = payment.receiverName;

  if (payment.receiverType === "Elara") {
    const movementId = getNextCashMovementId();

    financeData.cashMovements.push({
      id: movementId,
      type: "Entrada",
      category: "Cobro de servicio",
      amount,
      serviceId,
      paymentId: payment.id,
      actorType: payment.receiverType,
      actorId: normalizedCollector.id,
      actorName: normalizedCollector.name,
      registeredByUserId: payment.registeredByUserId || "",
      registeredByName: payment.registeredByName || "Administracion",
      registeredAt: payment.registeredAt || new Date().toISOString(),
      status: "Registrado",
      notes: payment.notes || "",
    });

    if (!suppressEvents) {
      emitCashEvents({
        reason: "service-cash-payment",
        serviceId,
        paymentId: payment.id,
        movementId,
      });
    }

    return { payment, movementId, remittanceId: null };
  }

  if (!suppressEvents) {
    emitCashEvents({
      reason: "service-driver-cash-payment-recorded",
      serviceId,
      paymentId: payment.id,
      collectorId: normalizedCollector.id,
    });
  }

  return { payment, movementId: null, remittanceId: null };
}

function registerExpenseCashOutflow({
  expenseId,
  category,
  amount,
  actorType = "Administracion",
  actorId = "",
  actorName = "Administracion",
  registeredByUserId = "",
  registeredByName = "Administracion",
  registeredAt = new Date().toISOString(),
  notes = "",
  suppressEvents = false,
} = {}) {
  ensureFinanceData();

  const normalizedExpenseId = String(expenseId || "").trim();
  const normalizedCategory = String(category || "Gasto operativo").trim();
  const normalizedAmount = roundCashAmount(amount);

  if (!normalizedExpenseId || normalizedAmount <= 0) {
    return { ok: false, movement: null, movementId: null, error: "Datos de salida de Caja incompletos." };
  }

  const existingMovement = financeData.cashMovements.find(
    (movement) =>
      movement.status !== "Anulado" &&
      movement.sourceType === "expense" &&
      movement.sourceId === normalizedExpenseId &&
      movement.category === normalizedCategory,
  );

  if (existingMovement) {
    return { ok: true, movement: existingMovement, movementId: existingMovement.id, duplicate: true, error: "" };
  }

  const movement = {
    id: getNextCashMovementId(),
    type: "Salida",
    category: normalizedCategory,
    amount: normalizedAmount,
    expenseId: normalizedExpenseId,
    sourceType: "expense",
    sourceId: normalizedExpenseId,
    actorType,
    actorId,
    actorName,
    registeredByUserId,
    registeredByName,
    registeredAt,
    status: "Registrado",
    notes,
  };

  financeData.cashMovements.push(movement);

  if (!suppressEvents) {
    emitCashEvents({
      reason: "expense-cash-outflow",
      expenseId: normalizedExpenseId,
      movementId: movement.id,
    });
  }

  return { ok: true, movement, movementId: movement.id, duplicate: false, error: "" };
}

function registerSettlementCashOutflow({
  settlementId,
  amount,
  beneficiaryId = "",
  beneficiaryName = "",
  paymentMethod = "",
  paidAt = new Date().toISOString(),
  recordedByUserId = "",
  recordedByUserName = "Administracion",
  recordedByUserRole = "",
  observations = "",
  suppressEvents = false,
} = {}) {
  ensureFinanceData();

  const normalizedSettlementId = String(settlementId || "").trim();
  const normalizedAmount = roundCashAmount(amount);
  const normalizedCategory = `Pago de liquidaci\u00f3n ${normalizedSettlementId}`;

  if (!normalizedSettlementId || normalizedAmount <= 0 || !paymentMethod) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de pago de liquidaci\u00f3n incompletos." };
  }

  const existingMovement = financeData.cashMovements.find(
    (movement) =>
      movement.status !== "Anulado" &&
      !movement.reversedByCashMovementId &&
      movement.sourceType === "settlement" &&
      movement.sourceId === normalizedSettlementId &&
      movement.category === normalizedCategory,
  );

  if (existingMovement) {
    return { ok: true, movement: existingMovement, movementId: existingMovement.id, duplicate: true, error: "" };
  }

  const movement = {
    id: getNextCashMovementId(),
    type: "Salida",
    category: normalizedCategory,
    amount: normalizedAmount,
    settlementId: normalizedSettlementId,
    sourceType: "settlement",
    sourceId: normalizedSettlementId,
    beneficiaryId: String(beneficiaryId || "").trim(),
    beneficiaryName: String(beneficiaryName || "").trim(),
    paymentMethod: String(paymentMethod || "").trim(),
    actorType: "Beneficiario",
    actorId: String(beneficiaryId || "").trim(),
    actorName: String(beneficiaryName || "Beneficiario").trim(),
    recordedByUserId,
    recordedByUserName,
    recordedByUserRole,
    registeredByUserId: recordedByUserId,
    registeredByName: recordedByUserName,
    registeredByUserRole: recordedByUserRole,
    registeredAt: paidAt,
    status: "Registrado",
    notes: observations,
    reversedByCashMovementId: null,
  };

  financeData.cashMovements.push(movement);

  if (!suppressEvents) {
    emitCashEvents({
      reason: "settlement-payment",
      settlementId: normalizedSettlementId,
      movementId: movement.id,
    });
  }

  return { ok: true, movement, movementId: movement.id, duplicate: false, error: "" };
}

function registerSettlementPaymentReversal({
  settlementId,
  amount,
  originalCashMovementId,
  beneficiaryId = "",
  beneficiaryName = "",
  reversedAt = new Date().toISOString(),
  recordedByUserId = "",
  recordedByUserName = "Administracion",
  recordedByUserRole = "",
  reason = "",
  suppressEvents = false,
} = {}) {
  ensureFinanceData();

  const normalizedSettlementId = String(settlementId || "").trim();
  const normalizedOriginalMovementId = String(originalCashMovementId || "").trim();
  const normalizedAmount = roundCashAmount(amount);
  const normalizedCategory = `Reversi\u00f3n de pago de liquidaci\u00f3n ${normalizedSettlementId}`;

  if (!normalizedSettlementId || !normalizedOriginalMovementId || normalizedAmount <= 0 || !reason) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de reversi\u00f3n de liquidaci\u00f3n incompletos." };
  }

  const originalMovement = financeData.cashMovements.find((movement) => movement.id === normalizedOriginalMovementId && movement.sourceType === "settlement");

  if (!originalMovement) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "No se encontr\u00f3 el movimiento original de Caja." };
  }

  const existingReversal = financeData.cashMovements.find(
    (movement) =>
      movement.status !== "Anulado" &&
      movement.sourceType === "settlement-payment-reversal" &&
      movement.sourceId === normalizedSettlementId &&
      movement.originalCashMovementId === normalizedOriginalMovementId &&
      movement.category === normalizedCategory,
  );

  if (existingReversal) {
    return { ok: true, movement: existingReversal, movementId: existingReversal.id, duplicate: true, error: "" };
  }

  const movement = {
    id: getNextCashMovementId(),
    type: "Entrada",
    category: normalizedCategory,
    amount: normalizedAmount,
    settlementId: normalizedSettlementId,
    sourceType: "settlement-payment-reversal",
    sourceId: normalizedSettlementId,
    originalCashMovementId: normalizedOriginalMovementId,
    beneficiaryId: String(beneficiaryId || "").trim(),
    beneficiaryName: String(beneficiaryName || "").trim(),
    actorType: "Beneficiario",
    actorId: String(beneficiaryId || "").trim(),
    actorName: String(beneficiaryName || "Beneficiario").trim(),
    recordedByUserId,
    recordedByUserName,
    recordedByUserRole,
    registeredByUserId: recordedByUserId,
    registeredByName: recordedByUserName,
    registeredByUserRole: recordedByUserRole,
    registeredAt: reversedAt,
    status: "Registrado",
    notes: reason,
  };

  originalMovement.reversedByCashMovementId = movement.id;
  financeData.cashMovements.push(movement);

  if (!suppressEvents) {
    emitCashEvents({
      reason: "settlement-payment-reversal",
      settlementId: normalizedSettlementId,
      movementId: movement.id,
      originalCashMovementId: normalizedOriginalMovementId,
    });
  }

  return { ok: true, movement, movementId: movement.id, duplicate: false, error: "" };
}

function registerReceivableCashEntry({
  receivableId,
  receivablePaymentId,
  serviceId,
  customerId = "",
  customerName = "Cliente",
  paymentMethod = "Efectivo",
  amount,
  recordedByUserId = "",
  recordedByUserName = "Administracion",
  recordedByUserRole = "",
  registeredByUserId = recordedByUserId,
  registeredByName = recordedByUserName,
  registeredAt = new Date().toISOString(),
  notes = "",
  suppressEvents = false,
} = {}) {
  ensureFinanceData();

  const normalizedReceivableId = String(receivableId || "").trim();
  const normalizedPaymentId = String(receivablePaymentId || "").trim();
  const normalizedServiceId = String(serviceId || "").trim();
  const normalizedAmount = roundCashAmount(amount);
  const normalizedCategory = `Cobro de cuenta por cobrar ${normalizedReceivableId}`;

  if (!normalizedReceivableId || !normalizedPaymentId || !normalizedServiceId || normalizedAmount <= 0) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de cuenta por cobrar incompletos." };
  }

  const existingMovement = financeData.cashMovements.find(
    (movement) =>
      movement.status !== "Anulado" &&
      movement.sourceType === "receivable" &&
      movement.sourceId === normalizedReceivableId &&
      movement.receivablePaymentId === normalizedPaymentId &&
      movement.serviceId === normalizedServiceId,
  );

  if (existingMovement) {
    return { ok: true, movement: existingMovement, movementId: existingMovement.id, duplicate: true, error: "" };
  }

  const movement = {
    id: getNextCashMovementId(),
    type: "Entrada",
    category: normalizedCategory,
    description: `Servicio ${normalizedServiceId} \u00B7 ${String(customerName || "Cliente").trim()}`,
    amount: normalizedAmount,
    receivableId: normalizedReceivableId,
    receivablePaymentId: normalizedPaymentId,
    serviceId: normalizedServiceId,
    customerId: String(customerId || "").trim(),
    sourceType: "receivable",
    sourceId: normalizedReceivableId,
    actorType: "Cliente",
    actorId: String(customerId || "").trim(),
    actorName: String(customerName || "Cliente").trim(),
    paymentMethod: String(paymentMethod || "").trim(),
    recordedByUserId,
    recordedByUserName,
    recordedByUserRole,
    registeredByUserId,
    registeredByName,
    registeredByUserRole: recordedByUserRole,
    registeredAt,
    status: "Registrado",
    notes,
    reversedByCashMovementId: null,
  };

  financeData.cashMovements.push(movement);

  if (!suppressEvents) {
    emitCashEvents({
      reason: "receivable-cash-entry",
      serviceId: normalizedServiceId,
      receivableId: normalizedReceivableId,
      receivablePaymentId: normalizedPaymentId,
      movementId: movement.id,
    });
  }

  return { ok: true, movement, movementId: movement.id, duplicate: false, error: "" };
}

function registerReceivablePaymentReversal({
  receivableId,
  receivablePaymentId,
  serviceId,
  customerId = "",
  customerName = "Cliente",
  amount,
  originalCashMovementId,
  reversedAt = new Date().toISOString(),
  registeredByUserId = "",
  registeredByName = "Superadmin",
  registeredByUserRole = "superadmin",
  reason = "",
  suppressEvents = false,
} = {}) {
  ensureFinanceData();

  const normalizedReceivableId = String(receivableId || "").trim();
  const normalizedPaymentId = String(receivablePaymentId || "").trim();
  const normalizedServiceId = String(serviceId || "").trim();
  const normalizedOriginalMovementId = String(originalCashMovementId || "").trim();
  const normalizedAmount = roundCashAmount(amount);
  const normalizedCategory = `Reversi\u00f3n de cobro de cuenta por cobrar ${normalizedReceivableId}`;

  if (!normalizedReceivableId || !normalizedPaymentId || !normalizedServiceId || !normalizedOriginalMovementId || normalizedAmount <= 0 || !reason) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de reversi\u00f3n de cuenta por cobrar incompletos." };
  }

  const originalMovement = financeData.cashMovements.find((movement) => movement.id === normalizedOriginalMovementId && movement.sourceType === "receivable" && movement.sourceId === normalizedReceivableId && movement.receivablePaymentId === normalizedPaymentId);

  if (!originalMovement) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "No se encontr\u00f3 el movimiento original de Caja." };
  }

  const existingReversal = financeData.cashMovements.find(
    (movement) =>
      movement.status !== "Anulado" &&
      movement.sourceType === "receivable-payment-reversal" &&
      movement.sourceId === normalizedPaymentId &&
      movement.originalCashMovementId === normalizedOriginalMovementId,
  );

  if (existingReversal) {
    return { ok: true, movement: existingReversal, movementId: existingReversal.id, duplicate: true, error: "" };
  }

  const movement = {
    id: getNextCashMovementId(),
    type: "Salida",
    category: normalizedCategory,
    description: `Servicio ${normalizedServiceId} \u00B7 ${String(customerName || "Cliente").trim()}`,
    amount: normalizedAmount,
    receivableId: normalizedReceivableId,
    receivablePaymentId: normalizedPaymentId,
    serviceId: normalizedServiceId,
    customerId: String(customerId || "").trim(),
    sourceType: "receivable-payment-reversal",
    sourceId: normalizedPaymentId,
    originalCashMovementId: normalizedOriginalMovementId,
    actorType: "Cliente",
    actorId: String(customerId || "").trim(),
    actorName: String(customerName || "Cliente").trim(),
    registeredByUserId,
    registeredByName,
    registeredByUserRole,
    recordedByUserId: registeredByUserId,
    recordedByUserName: registeredByName,
    recordedByUserRole: registeredByUserRole,
    registeredAt: reversedAt,
    status: "Registrado",
    notes: reason,
  };

  originalMovement.reversedByCashMovementId = movement.id;
  financeData.cashMovements.push(movement);

  if (!suppressEvents) {
    emitCashEvents({
      reason: "receivable-payment-reversal",
      serviceId: normalizedServiceId,
      receivableId: normalizedReceivableId,
      receivablePaymentId: normalizedPaymentId,
      movementId: movement.id,
      originalCashMovementId: normalizedOriginalMovementId,
    });
  }

  return { ok: true, movement, movementId: movement.id, duplicate: false, error: "" };
}

function rollbackCashMovement(movementId) {
  ensureFinanceData();

  const normalizedMovementId = String(movementId || "").trim();
  const index = financeData.cashMovements.findIndex((movement) => movement.id === normalizedMovementId);

  if (index < 0) {
    return false;
  }

  financeData.cashMovements.splice(index, 1);
  emitCashEvents({ reason: "cash-movement-rollback", movementId: normalizedMovementId });

  return true;
}

function getCashSummary() {
  ensureFinanceData();

  const movements = getActiveCashMovements();
  const cashCounts = financeData.cashCounts || [];
  const positions = getCashDriverRemittancePositions();
  const now = new Date();
  const balance = movements.reduce((total, movement) => {
    const amount = roundCashAmount(movement.amount);

    return movement.type === "Salida" ? roundCashAmount(total - amount) : roundCashAmount(total + amount);
  }, 0);
  const periodEntries = movements
    .filter((movement) => movement.type === "Entrada" && isSameCashMonth(movement.registeredAt, now))
    .reduce((total, movement) => roundCashAmount(total + roundCashAmount(movement.amount)), 0);
  const periodExits = movements
    .filter((movement) => movement.type === "Salida" && isSameCashMonth(movement.registeredAt, now))
    .reduce((total, movement) => roundCashAmount(total + roundCashAmount(movement.amount)), 0);
  const pendingPositions = positions.filter((position) => position.pendingAmount > 0);
  const pendingToRender = pendingPositions.reduce((total, position) => roundCashAmount(total + position.pendingAmount), 0);
  const openDifferences = positions.filter((position) => position.status === "Con diferencia").length + cashCounts.filter(isCashDifferenceOpen).length;

  return {
    balance,
    periodEntries,
    periodExits,
    pendingToRender,
    pendingRemittances: pendingPositions.length,
    openDifferences,
  };
}

function getDriverCashPayments(services = window.ElaraServicesMock?.services || []) {
  return services
    .flatMap((service) =>
      (service.financial?.payments || []).map((payment) => ({
        ...payment,
        serviceId: getCashServiceId(service),
      })),
    )
    .filter(
      (payment) =>
        payment.method === "Efectivo" &&
        ["Chofer", "Colaborador"].includes(payment.receiverType || payment.cashCollectorType) &&
        payment.status !== "Anulado" &&
        String(payment.receiverId || payment.cashCollectorId || "").trim(),
    );
}

function findCashServiceById(serviceId) {
  return (window.ElaraServicesMock?.services || []).find((service) => service.serviceId === serviceId) || null;
}

function renderCashSummary() {
  const container = cashGetElement("cash-summary");

  if (!container) {
    return;
  }

  const summary = getCashSummary();
  const metrics = [
    [["Saldo", "actual"], formatCashMoney(summary.balance), "neutral"],
    [["Entradas", "periodo"], formatCashMoney(summary.periodEntries), "success"],
    [["Salidas", "periodo"], formatCashMoney(summary.periodExits), "danger"],
    [["Efectivo", "pendiente"], formatCashMoney(summary.pendingToRender), "warning"],
    [["Rendiciones", "pendientes"], String(summary.pendingRemittances), "warning"],
    [["Diferencias", "abiertas"], String(summary.openDifferences), summary.openDifferences ? "danger" : "neutral"],
  ];

  container.innerHTML = metrics
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${tone}">
          <span class="summary-card__stacked-title">${label.map((line) => `<span>${escapeCashHtml(line)}</span>`).join("")}</span>
          <strong>${escapeCashHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderCashMovements() {
  if (getCashCurrentUser()?.supabaseUserId) {
    void renderAdminCashMovementsReal();
    return;
  }

  ++adminCashMovementRequestIdReal;
  const container = cashGetElement("cash-movements-list");

  if (!container) {
    return;
  }

  const movements = getActiveCashMovements().slice().sort((first, second) => getCashDateTime(second.registeredAt) - getCashDateTime(first.registeredAt));

  if (!movements.length) {
    container.innerHTML = '<p class="service-assignment-empty">Sin movimientos de caja.</p>';
    return;
  }

  container.innerHTML = movements
    .map(
      (movement) => `
        <article class="cash-row">
          <div>
            <strong>${escapeCashHtml(movement.category || movement.type)}</strong>
            <span>${escapeCashHtml(formatCashDateTime(movement.registeredAt))} \u00B7 ${escapeCashHtml(movement.actorName || "Administracion")}</span>
            <small>${escapeCashHtml(movement.serviceId || movement.notes || "Movimiento manual")}</small>
          </div>
          <strong class="cash-row__amount cash-row__amount--${movement.type === "Salida" ? "out" : "in"}">${movement.type === "Salida" ? "-" : "+"}${escapeCashHtml(
            formatCashMoney(movement.amount),
          )}</strong>
          ${renderCashVoidAction(movement)}
        </article>
      `,
    )
    .join("");
}

function renderCashRemittances() {
  const container = cashGetElement("cash-remittances-list");

  if (!container) {
    return;
  }

  const positions = getCashDriverRemittancePositions();

  if (!positions.length) {
    container.innerHTML = '<p class="service-assignment-empty">Sin efectivo pendiente de rendir.</p>';
    return;
  }

  container.innerHTML = positions
    .map(
      (position) => `
        <article class="cash-row cash-row--obligation">
          <div>
            <strong>${escapeCashHtml(position.driverName)}</strong>
            <span>${escapeCashHtml(position.driverType)}</span>
            <small>Total cobrado: ${escapeCashHtml(formatCashMoney(position.totalCollected))}</small>
            <small>Total rendido: ${escapeCashHtml(formatCashMoney(position.totalRendered))}</small>
            ${position.pendingAmount > 0 ? `<small>Pendiente de rendir: ${escapeCashHtml(formatCashMoney(position.pendingAmount))}</small>` : ""}
            ${position.excessAmount > 0 ? `<small>Excedente: ${escapeCashHtml(formatCashMoney(position.excessAmount))}</small>` : ""}
          </div>
          <strong class="cash-row__status">${escapeCashHtml(position.status)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderCashRemittanceHistory() {
  const container = cashGetElement("cash-remittance-history-list");
  const meta = cashGetElement("cash-remittance-history-meta");
  const pagination = cashGetElement("cash-remittance-history-pagination");

  if (!container) {
    return;
  }

  syncCashRemittanceHistoryFiltersToDom();
  const remittances = getFilteredCashRemittanceHistory(cashRemittanceHistoryFilters);
  const totalPages = Math.max(1, Math.ceil(remittances.length / CASH_REMITTANCE_HISTORY_PAGE_SIZE));
  cashRemittanceHistoryPage = Math.min(Math.max(cashRemittanceHistoryPage, 1), totalPages);
  const pageStart = (cashRemittanceHistoryPage - 1) * CASH_REMITTANCE_HISTORY_PAGE_SIZE;
  const pageItems = remittances.slice(pageStart, pageStart + CASH_REMITTANCE_HISTORY_PAGE_SIZE);

  if (meta) {
    meta.textContent = `${remittances.length} resultado${remittances.length === 1 ? "" : "s"} \u00b7 Pagina ${cashRemittanceHistoryPage} de ${totalPages}`;
  }

  if (!pageItems.length) {
    container.innerHTML = '<p class="service-assignment-empty">No hay rendiciones para los filtros seleccionados.</p>';
    renderCashPagination(pagination, cashRemittanceHistoryPage, totalPages, "admin-remittances");
    return;
  }

  container.innerHTML = pageItems
    .map(
      (remittance) => {
        const driver = getCashCollaboratorById(remittance.driverId);
        const observations = remittance.observations || remittance.notes || "";

        return `
        <article class="cash-row cash-row--history">
          <div>
            <strong>${escapeCashHtml(driver?.name || "Conductor")}</strong>
            <span>${escapeCashHtml(formatCashDateTime(remittance.createdAt))} \u00b7 ${escapeCashHtml(driver?.driverType || "Conductor")}</span>
            <small>Registrado por ${escapeCashHtml(remittance.registeredByName || "Administracion")}</small>
            ${observations ? `<small>${escapeCashHtml(observations)}</small>` : ""}
          </div>
          <strong class="cash-row__amount cash-row__amount--in">${escapeCashHtml(formatCashMoney(remittance.amount))}</strong>
          <span class="cash-row__status">${escapeCashHtml(getCashRemittanceStatus(remittance))}</span>
          <button class="button button--compact button--muted" type="button" data-cash-remittance-detail="${escapeCashHtml(getCashRemittanceId(remittance))}">Detalle</button>
        </article>
      `;
      },
    )
    .join("");

  renderCashPagination(pagination, cashRemittanceHistoryPage, totalPages, "admin-remittances");
}

function renderCashCounts() {
  const container = cashGetElement("cash-counts-list");

  if (!container) {
    return;
  }

  const counts = (financeData.cashCounts || []).slice().sort((first, second) => getCashDateTime(second.countedAt) - getCashDateTime(first.countedAt));

  if (!counts.length) {
    container.innerHTML = '<p class="service-assignment-empty">Sin arqueos registrados.</p>';
    return;
  }

  container.innerHTML = counts
    .map(
      (count) => `
        <article class="cash-row cash-row--count">
          <div>
            <strong>${escapeCashHtml(count.id)}</strong>
            <span>${escapeCashHtml(formatCashDateTime(count.countedAt))} \u00B7 ${escapeCashHtml(count.status)}</span>
            <small>Teorico ${escapeCashHtml(formatCashMoney(count.theoreticalAmount))} \u00B7 contado ${escapeCashHtml(formatCashMoney(count.countedAmount))}</small>
          </div>
          <strong>${escapeCashHtml(formatCashMoney(count.differenceAmount))}</strong>
          <button class="button button--compact button--muted" type="button" data-cash-count-detail="${escapeCashHtml(count.id)}">Detalle</button>
        </article>
      `,
    )
    .join("");
}

function renderCashForms() {
  populateCashCollectorSelect("cash-remittance-collector");
  populateCashCollectorSelect("cash-remittance-history-driver", "Todos");
  updateCashRemittanceFormSummary();
  setElementVisibility("cash-adjustment-open-action", isCurrentCashSuperadmin());
  setElementVisibility("cash-adjustment-form", isCurrentCashSuperadmin());
  setElementVisibility("cash-void-form", isCurrentCashSuperadmin());
  setElementVisibility("cash-difference-close-form", isCurrentCashSuperadmin());
}

function initCashControls() {
  if (isCashControlsInitialized) {
    return;
  }

  const remittanceForm = cashGetElement("cash-remittance-form");
  const countForm = cashGetElement("cash-count-form");
  const adjustmentForm = cashGetElement("cash-adjustment-form");
  const voidForm = cashGetElement("cash-void-form");
  const differenceCloseForm = cashGetElement("cash-difference-close-form");
  const remittanceVoidForm = cashGetElement("cash-remittance-void-form");
  const remittanceCollector = cashGetElement("cash-remittance-collector");
  const remittanceAmount = cashGetElement("cash-remittance-amount");
  const historyDriver = cashGetElement("cash-remittance-history-driver");
  const historyStatus = cashGetElement("cash-remittance-history-status");
  const historyFrom = cashGetElement("cash-remittance-history-from");
  const historyTo = cashGetElement("cash-remittance-history-to");
  const historyId = cashGetElement("cash-remittance-history-id");
  const historyClear = cashGetElement("cash-remittance-history-clear");
  const discrepancyStatus = cashGetElement("cash-discrepancy-status");
  const discrepancyType = cashGetElement("cash-discrepancy-type");
  const discrepancySearch = cashGetElement("cash-discrepancy-search");
  const discrepancyClear = cashGetElement("cash-discrepancy-clear");

  remittanceForm?.addEventListener("submit", registerCashRemittanceSettlement);
  countForm?.addEventListener("submit", registerCashCount);
  adjustmentForm?.addEventListener("submit", registerCashAdjustment);
  voidForm?.addEventListener("submit", voidCashMovement);
  differenceCloseForm?.addEventListener("submit", closeCashDifference);
  remittanceVoidForm?.addEventListener("submit", submitCashRemittanceVoid);
  remittanceCollector?.addEventListener("change", updateCashRemittanceFormSummary);
  remittanceAmount?.addEventListener("input", updateCashRemittanceFormSummary);
  [historyDriver, historyStatus, historyFrom, historyTo].forEach((element) => element?.addEventListener("change", handleCashRemittanceHistoryFilterChange));
  historyId?.addEventListener("input", handleCashRemittanceHistoryFilterChange);
  historyClear?.addEventListener("click", clearCashRemittanceHistoryFilters);
  [discrepancyStatus, discrepancyType].forEach((element) => element?.addEventListener("change", handleCashDiscrepancyFilterChange));
  discrepancySearch?.addEventListener("input", handleCashDiscrepancyFilterChange);
  discrepancyClear?.addEventListener("click", clearCashDiscrepancyFilters);
  document.addEventListener("click", handleCashDocumentClick);
  document.addEventListener("keydown", handleCashKeydown);
  isCashControlsInitialized = true;
}

function handleCashDocumentClick(event) {
  const cashModal = event.target.closest("#cash-remittance-form-modal, #cash-count-form-modal, #cash-adjustment-form-modal, #cash-void-form-modal, #cash-difference-close-modal, #cash-remittance-detail-modal, #cash-remittance-void-modal, #cash-remittance-overrun-modal, #cash-count-detail-modal, #cash-discrepancy-detail-modal, #cash-discrepancy-action-modal");
  const closeButton = event.target.closest("[data-modal-close]");

  if (cashModal && (closeButton || event.target === cashModal)) {
    closeCashModal(cashModal);
    return;
  }

  const openCashModalButton = event.target.closest("[data-cash-open-modal]");

  if (openCashModalButton && !cashGetElement("caja")?.hidden) {
    const modalId = openCashModalButton.dataset.cashOpenModal || "";

    if (modalId === "cash-adjustment-form-modal" && !isCurrentCashSuperadmin()) {
      notifyCash("Solo Superadmin puede registrar ajustes de caja.", "error");
      return;
    }

    openCashModal(modalId);
    return;
  }

  const paginationButton = event.target.closest("[data-cash-pagination]");

  if (paginationButton && !cashGetElement("caja")?.hidden) {
    const paginationScope = paginationButton.dataset.cashPagination || "";

    if (paginationScope === "admin-discrepancies") {
      cashDiscrepancyPage = Number(paginationButton.dataset.cashPage) || 1;
      void renderAdminCashDiscrepancies();
      return;
    }

    cashRemittanceHistoryPage = Number(paginationButton.dataset.cashPage) || 1;
    renderCashRemittanceHistory();
    return;
  }

  const overrunConfirmButton = event.target.closest("#cash-remittance-overrun-confirm");
  const overrunCancelButton = event.target.closest("#cash-remittance-overrun-cancel");

  if (overrunConfirmButton && !cashGetElement("caja")?.hidden) {
    confirmCashRemittanceOverrun();
    return;
  }

  if (overrunCancelButton && !cashGetElement("caja")?.hidden) {
    cancelCashRemittanceOverrun();
    return;
  }

  const remittanceDetailButton = event.target.closest("[data-cash-remittance-detail]");

  if (remittanceDetailButton && !cashGetElement("caja")?.hidden) {
    openCashRemittanceDetail(remittanceDetailButton.dataset.cashRemittanceDetail);
    return;
  }

  const discrepancyDetailButton = event.target.closest("[data-cash-discrepancy-detail]");

  if (discrepancyDetailButton && !cashGetElement("caja")?.hidden) {
    void openAdminCashDiscrepancyDetail(discrepancyDetailButton.dataset.cashDiscrepancyDetail);
    return;
  }

  if (event.target.closest("#cash-discrepancy-action-cancel") && !cashGetElement("caja")?.hidden) {
    closeAdminCashDiscrepancyActionModal();
    return;
  }

  if (event.target.closest("#cash-discrepancy-action-confirm") && !cashGetElement("caja")?.hidden) {
    void executePendingAdminCashDiscrepancyAction();
    return;
  }

  const discrepancyActionButton = event.target.closest("[data-cash-admin-discrepancy-action]");

  if (discrepancyActionButton && !cashGetElement("caja")?.hidden) {
    openAdminCashDiscrepancyActionModal(discrepancyActionButton.dataset.cashAdminDiscrepancyAction || "");
    return;
  }
  const remittanceVoidButton = event.target.closest("#cash-remittance-void-action");

  if (remittanceVoidButton && !cashGetElement("caja")?.hidden) {
    openCashRemittanceVoidModal(remittanceVoidButton.dataset.cashRemittanceVoid || selectedCashRemittanceId);
    return;
  }

  const countDetailButton = event.target.closest("[data-cash-count-detail]");

  if (countDetailButton && !cashGetElement("caja")?.hidden) {
    openCashCountDetail(countDetailButton.dataset.cashCountDetail);
    return;
  }

  const closeDifferenceButton = event.target.closest("#cash-count-difference-close-action");

  if (closeDifferenceButton && !cashGetElement("caja")?.hidden) {
    openCashDifferenceCloseModal(closeDifferenceButton.dataset.cashDifferenceClose || "");
    return;
  }

  const fillVoidButton = event.target.closest("[data-cash-fill-void]");

  if (!fillVoidButton || cashGetElement("caja")?.hidden) {
    return;
  }

  openCashVoidMovementModal(fillVoidButton.dataset.cashFillVoid || "");
}

function handleCashKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const openModal = document.querySelector("#cash-remittance-form-modal:not([hidden]), #cash-count-form-modal:not([hidden]), #cash-adjustment-form-modal:not([hidden]), #cash-void-form-modal:not([hidden]), #cash-difference-close-modal:not([hidden]), #cash-remittance-detail-modal:not([hidden]), #cash-remittance-void-modal:not([hidden]), #cash-remittance-overrun-modal:not([hidden]), #cash-count-detail-modal:not([hidden]), #cash-discrepancy-detail-modal:not([hidden]), #cash-discrepancy-action-modal:not([hidden])");

  if (openModal) {
    closeCashModal(openModal);
  }
}

function openCashRemittanceDetail(remittanceId) {
  const remittance = findCashRemittance(remittanceId);

  if (!remittance) {
    notifyCash("No se encontro la rendicion seleccionada.", "warning");
    return;
  }

  const driver = getCashCollaboratorById(remittance.driverId);
  selectedCashRemittanceId = getCashRemittanceId(remittance);

  cashSetText("cash-remittance-detail-id", selectedCashRemittanceId);
  cashSetText("cash-remittance-detail-date", formatCashDateTime(remittance.createdAt));
  cashSetText("cash-remittance-detail-collector", `${driver?.name || "Conductor"} (${driver?.driverType || "Conductor"})`);
  cashSetText("cash-remittance-detail-amount", formatCashMoney(remittance.amount));
  cashSetText("cash-remittance-detail-registered-by", remittance.registeredByName || "Administracion");
  cashSetText("cash-remittance-detail-status", getCashRemittanceStatus(remittance));
  cashSetText("cash-remittance-detail-difference", getCashRemittanceDifferenceLabel(remittance));
  cashSetText("cash-remittance-detail-notes", remittance.observations || remittance.notes || "Sin observaciones");
  cashSetText("cash-remittance-detail-voided-at", remittance.annulledAt ? formatCashDateTime(remittance.annulledAt) : "-");
  cashSetText("cash-remittance-detail-voided-by", remittance.annulledByName || "-");
  cashSetText("cash-remittance-detail-void-reason", remittance.annulmentReason || "-");

  const voidButton = cashGetElement("cash-remittance-void-action");

  if (voidButton) {
    voidButton.dataset.cashRemittanceVoid = selectedCashRemittanceId;
    voidButton.hidden = !isCurrentCashSuperadmin() || getCashRemittanceStatus(remittance) === "Anulada";
  }

  openCashModal("cash-remittance-detail-modal");
}

function openCashRemittanceVoidModal(remittanceId) {
  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede anular rendiciones.", "error");
    return;
  }

  const remittance = findCashRemittance(remittanceId);

  if (!remittance || getCashRemittanceStatus(remittance) === "Anulada") {
    notifyCash("Selecciona una rendicion vigente.", "warning");
    return;
  }

  const driver = getCashCollaboratorById(remittance.driverId);
  selectedCashRemittanceId = getCashRemittanceId(remittance);
  cashSetText(
    "cash-remittance-void-summary",
    `${driver?.name || "Conductor"} \u00b7 ${formatCashMoney(remittance.amount)} \u00b7 ${selectedCashRemittanceId}`,
  );

  const idInput = cashGetElement("cash-remittance-void-id");
  const reasonInput = cashGetElement("cash-remittance-void-reason");
  const error = cashGetElement("cash-remittance-void-error");

  if (idInput) {
    idInput.value = selectedCashRemittanceId;
  }

  if (reasonInput) {
    reasonInput.value = "";
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  openCashModal("cash-remittance-void-modal");
  reasonInput?.focus();
}

function submitCashRemittanceVoid(event) {
  event.preventDefault();

  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede anular rendiciones.", "error");
    return;
  }

  const remittanceId = cashGetInputValue("cash-remittance-void-id") || selectedCashRemittanceId;
  const reason = cashGetInputValue("cash-remittance-void-reason");
  const error = cashGetElement("cash-remittance-void-error");
  const remittance = findCashRemittance(remittanceId);

  if (!reason) {
    if (error) {
      error.textContent = "Indica el motivo de anulacion.";
      error.hidden = false;
    }

    notifyCash("Indica el motivo de anulacion.", "warning");
    return;
  }

  if (!remittance || getCashRemittanceStatus(remittance) === "Anulada") {
    notifyCash("Selecciona una rendicion vigente.", "warning");
    return;
  }

  const currentUser = getCashCurrentUser();
  const annulledAt = new Date().toISOString();
  const movement = findCashMovementForRemittance(remittance);
  const amount = roundCashAmount(remittance.amount);

  remittance.status = "Anulada";
  remittance.annulledAt = annulledAt;
  remittance.annulledByUserId = currentUser?.id || "";
  remittance.annulledByName = currentUser?.name || "Administracion";
  remittance.annulmentReason = reason;

  if (movement) {
    movement.status = "Anulado";
    movement.voidedAt = annulledAt;
    movement.voidedByUserId = currentUser?.id || "";
    movement.voidedByName = currentUser?.name || "Administracion";
    movement.voidReason = reason;
  }

  const driver = getCashCollaboratorById(remittance.driverId);
  financeData.cashMovements.push({
    id: getNextCashMovementId(),
    type: "Salida",
    category: "Reversion de rendicion",
    amount,
    remittanceId: getCashRemittanceId(remittance),
    reversalOfMovementId: movement?.id || "",
    actorType: driver?.driverType || "Conductor",
    actorId: remittance.driverId || "",
    actorName: driver?.name || "Conductor",
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    registeredAt: annulledAt,
    status: "Anulado",
    notes: `Registro trazable de anulacion: ${reason}`,
  });

  closeCashModal(cashGetElement("cash-remittance-void-modal"));
  closeCashModal(cashGetElement("cash-remittance-detail-modal"));
  emitCashEvents({ reason: "remittance-voided", remittanceId: getCashRemittanceId(remittance), movementId: movement?.id || "" });
  renderCashView();
  notifyCash("Rendicion anulada correctamente.", "success");
}

function openCashCountDetail(countId) {
  const count = (financeData.cashCounts || []).find((item) => item.id === countId);

  if (!count) {
    notifyCash("No se encontro el arqueo seleccionado.", "warning");
    return;
  }

  cashSetText("cash-count-detail-id", count.id);
  cashSetText("cash-count-detail-date", formatCashDateTime(count.countedAt));
  cashSetText("cash-count-detail-status", count.status || "Sin estado");
  cashSetText("cash-count-detail-theoretical", formatCashMoney(count.theoreticalAmount));
  cashSetText("cash-count-detail-counted", formatCashMoney(count.countedAmount));
  cashSetText("cash-count-detail-difference", formatCashMoney(count.differenceAmount));
  cashSetText("cash-count-detail-user", count.countedByName || "Administracion");
  cashSetText("cash-count-detail-notes", count.notes || "Sin observaciones");
  cashSetText("cash-count-detail-resolution", getCashDifferenceResolutionText(count));

  const closeAction = cashGetElement("cash-count-difference-close-action");

  if (closeAction) {
    closeAction.dataset.cashDifferenceClose = count.id;
    closeAction.hidden = !isCurrentCashSuperadmin() || !isCashDifferenceOpen(count);
  }

  openCashModal("cash-count-detail-modal");
}

function openCashVoidMovementModal(movementId) {
  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede anular movimientos de caja.", "error");
    return;
  }

  const movement = financeData.cashMovements.find((item) => item.id === movementId);

  if (!movement || movement.status === "Anulado") {
    notifyCash("Selecciona un movimiento vigente.", "warning");
    return;
  }

  if (movement.remittanceId && movement.category === "Rendicion de efectivo") {
    notifyCash("Anula la rendicion desde su detalle para recalcular la obligacion.", "warning");
    return;
  }

  const input = cashGetElement("cash-void-movement");
  const reason = cashGetElement("cash-void-reason");

  if (input) {
    input.value = movement.id;
  }

  if (reason) {
    reason.value = "";
  }

  cashSetText("cash-void-summary", `${movement.id} \u00b7 ${movement.category || movement.type} \u00b7 ${formatCashMoney(movement.amount)}`);
  openCashModal("cash-void-form-modal");
  reason?.focus();
}

function openCashDifferenceCloseModal(countId) {
  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede cerrar diferencias de caja.", "error");
    return;
  }

  const count = (financeData.cashCounts || []).find((item) => item.id === countId && isCashDifferenceOpen(item));

  if (!count) {
    notifyCash("Selecciona una diferencia abierta.", "warning");
    return;
  }

  const input = cashGetElement("cash-difference-close-id");
  const note = cashGetElement("cash-difference-close-note");

  if (input) {
    input.value = count.id;
  }

  if (note) {
    note.value = "";
  }

  cashSetText("cash-difference-close-summary", `${count.id} \u00b7 Diferencia ${formatCashMoney(count.differenceAmount)}`);
  openCashModal("cash-difference-close-modal");
  note?.focus();
}

function getCashRemittanceHistory() {
  return (financeData.remittances || [])
    .slice()
    .sort((first, second) => getCashDateTime(second.createdAt) - getCashDateTime(first.createdAt));
}

function getFilteredCashRemittanceHistory(filters = {}) {
  const fromTimestamp = getCashDateBoundaryTimestamp(filters.from, "start");
  const toTimestamp = getCashDateBoundaryTimestamp(filters.to, "end");
  const status = String(filters.status || "").trim();
  const driverId = String(filters.driverId || "").trim();
  const queryId = normalizeCashText(filters.remittanceId);

  return getCashRemittanceHistory().filter((remittance) => {
    const remittanceTimestamp = getCashDateTime(remittance.createdAt);
    const remittanceId = getCashRemittanceId(remittance);

    if (driverId && remittance.driverId !== driverId) {
      return false;
    }

    if (status && getCashRemittanceStatus(remittance) !== status) {
      return false;
    }

    if (fromTimestamp && remittanceTimestamp < fromTimestamp) {
      return false;
    }

    if (toTimestamp && remittanceTimestamp > toTimestamp) {
      return false;
    }

    return !queryId || normalizeCashText(remittanceId).includes(queryId);
  });
}

function getDefaultCashRemittanceHistoryFilters() {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CASH_DEFAULT_HISTORY_DAYS - 1));

  return {
    driverId: "",
    status: "",
    from: formatCashDateInputValue(fromDate),
    to: formatCashDateInputValue(now),
    remittanceId: "",
  };
}

function syncCashRemittanceHistoryFiltersToDom() {
  const fields = [
    ["cash-remittance-history-driver", "driverId"],
    ["cash-remittance-history-status", "status"],
    ["cash-remittance-history-from", "from"],
    ["cash-remittance-history-to", "to"],
    ["cash-remittance-history-id", "remittanceId"],
  ];

  fields.forEach(([id, key]) => {
    const element = cashGetElement(id);

    if (element && element.value !== cashRemittanceHistoryFilters[key]) {
      element.value = cashRemittanceHistoryFilters[key] || "";
    }
  });
}

function handleCashRemittanceHistoryFilterChange() {
  cashRemittanceHistoryFilters = {
    driverId: cashGetInputValue("cash-remittance-history-driver"),
    status: cashGetInputValue("cash-remittance-history-status"),
    from: cashGetInputValue("cash-remittance-history-from"),
    to: cashGetInputValue("cash-remittance-history-to"),
    remittanceId: cashGetInputValue("cash-remittance-history-id"),
  };
  cashRemittanceHistoryPage = 1;
  renderCashRemittanceHistory();
}

function clearCashRemittanceHistoryFilters() {
  cashRemittanceHistoryFilters = {
    driverId: "",
    status: "",
    from: "",
    to: "",
    remittanceId: "",
  };
  cashRemittanceHistoryPage = 1;
  renderCashRemittanceHistory();
}

function renderCashPagination(container, currentPage, totalPages, scope) {
  if (!container) {
    return;
  }

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-cash-pagination="${escapeCashHtml(scope)}" data-cash-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Pagina ${escapeCashHtml(currentPage)} de ${escapeCashHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-cash-pagination="${escapeCashHtml(scope)}" data-cash-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Siguiente</button>
  `;
}

function findCashRemittance(remittanceId) {
  const id = String(remittanceId || "").trim();

  if (!id) {
    return null;
  }

  return (financeData.remittances || []).find((remittance) => getCashRemittanceId(remittance) === id) || null;
}

function findCashMovementForRemittance(remittance) {
  const remittanceId = getCashRemittanceId(remittance);

  return (financeData.cashMovements || []).find((movement) => movement.remittanceId === remittanceId && movement.category === "Rendicion de efectivo") || null;
}

function getCashRemittanceId(remittance) {
  return String(remittance?.remittanceId || remittance?.id || "").trim();
}

function getCashRemittanceStatus(remittance) {
  return remittance?.status === "Anulada" || remittance?.annulledAt ? "Anulada" : "V\u00e1lida";
}

function getCashOverrunIncidentForRemittance(remittanceId) {
  const id = String(remittanceId || "").trim();

  if (!id) {
    return null;
  }

  return (
    (window.ElaraAdminIncidentsMock?.incidents || []).find(
      (incident) =>
        normalizeCashText(incident.type) === "excedente en rendicion" &&
        incident.remittanceId === id &&
        normalizeCashText(incident.status) !== "resuelta",
    ) || null
  );
}

function getCashDriverRemittancePositions() {
  const positionsByDriver = new Map();

  getDriverCashPayments().forEach((payment) => {
    const driverId = String(payment.receiverId || payment.cashCollectorId || "").trim();

    if (!driverId) {
      return;
    }

    const position = getOrCreateCashDriverPosition(positionsByDriver, driverId, payment.receiverName || payment.cashCollectorName, payment.receiverType || payment.cashCollectorType);
    position.totalCollected = roundCashAmount(position.totalCollected + roundCashAmount(payment.amount));
  });

  (financeData.remittances || []).forEach((remittance) => {
    const driverId = String(remittance.driverId || remittance.collectorId || "").trim();

    if (!driverId) {
      return;
    }

    const position = getOrCreateCashDriverPosition(positionsByDriver, driverId);

    if (getCashRemittanceStatus(remittance) !== "Anulada") {
      position.totalRendered = roundCashAmount(position.totalRendered + roundCashAmount(remittance.amount));
    }
  });

  return Array.from(positionsByDriver.values())
    .map((position) => finalizeCashDriverPosition(position))
    .filter((position) => position.totalCollected > 0 || position.totalRendered > 0)
    .sort((first, second) => first.driverName.localeCompare(second.driverName, "es"));
}

function getOrCreateCashDriverPosition(map, driverId, fallbackName = "", fallbackType = "") {
  const collaborator = getCashCollaboratorById(driverId);

  if (!map.has(driverId)) {
    map.set(driverId, {
      driverId,
      driverName: collaborator?.name || fallbackName || "Conductor",
      driverType: collaborator?.driverType || fallbackType || "Conductor",
      totalCollected: 0,
      totalRendered: 0,
      balanceAmount: 0,
      pendingAmount: 0,
      excessAmount: 0,
      status: "Pendiente",
    });
  }

  return map.get(driverId);
}

function finalizeCashDriverPosition(position) {
  const totalCollected = roundCashAmount(position.totalCollected);
  const totalRendered = roundCashAmount(position.totalRendered);
  const balanceAmount = roundCashAmount(totalCollected - totalRendered);
  const pendingAmount = roundCashAmount(Math.max(balanceAmount, 0));
  const excessAmount = roundCashAmount(Math.max(-balanceAmount, 0));
  const hasOpenOverrunIncident = hasOpenCashOverrunIncidentForDriver(position.driverId);
  let status = "Pendiente";

  if (excessAmount > 0 || hasOpenOverrunIncident) {
    status = "Con diferencia";
  } else if (totalCollected > 0 && totalRendered === totalCollected) {
    status = "Completada";
  } else if (totalRendered > 0 && totalRendered < totalCollected) {
    status = "Parcial";
  }

  return {
    ...position,
    totalCollected,
    totalRendered,
    balanceAmount,
    pendingAmount,
    excessAmount,
    status,
  };
}

function getCashDriverPosition(driverId) {
  return getCashDriverRemittancePositions().find((position) => position.driverId === driverId) || null;
}

function getCashRemittancesForDriver(driverId, filters = {}) {
  const id = String(driverId || "").trim();

  if (!id) {
    return [];
  }

  return getFilteredCashRemittanceHistory({ ...filters, driverId: id });
}

function getCashOpenFinancialIncidentsForDriver(driverId) {
  const id = String(driverId || "").trim();

  if (!id) {
    return [];
  }

  return (window.ElaraAdminIncidentsMock?.incidents || []).filter(
    (incident) =>
      String(incident.driverId || "").trim() === id &&
      ["excedente en rendicion", "discrepancia de rendicion"].includes(normalizeCashText(incident.type)) &&
      normalizeCashText(incident.status) !== "resuelta",
  );
}

function hasOpenCashOverrunIncidentForDriver(driverId) {
  return getOpenCashOverrunIncidents().some((incident) => String(incident.driverId || "").trim() === driverId);
}

function getOpenCashOverrunIncidents() {
  return (window.ElaraAdminIncidentsMock?.incidents || []).filter(
    (incident) => normalizeCashText(incident.type) === "excedente en rendicion" && normalizeCashText(incident.status) !== "resuelta",
  );
}

function getCashRemittanceDifferenceLabel(remittance) {
  if (!remittance) {
    return "-";
  }

  const incident = getCashOverrunIncidentForRemittance(getCashRemittanceId(remittance));

  if (incident) {
    return `Excedente en revision: ${formatCashMoney(incident.differenceAmount)}`;
  }

  return "Sin diferencia";
}
function getCashDifferenceResolutionText(item) {
  if (item?.differenceStatus === "Cerrada") {
    return `${formatCashDateTime(item.differenceResolvedAt)} \u00B7 ${item.differenceResolvedByName || "Administracion"} \u00B7 ${item.differenceResolutionNote || "Sin nota"}`;
  }

  if (item?.differenceStatus === "Abierta") {
    return "Diferencia abierta";
  }

  return "Sin diferencia";
}

function openCashModal(modalId) {
  const modal = cashGetElement(modalId);

  if (modal) {
    modal.hidden = false;
  }
}

function closeCashModal(modal) {
  if (modal) {
    if (modal.id === "cash-remittance-overrun-modal") {
      pendingCashRemittanceOverrunDraft = null;
    }

    modal.hidden = true;
  }
}

function updateCashRemittanceFormSummary() {
  const container = cashGetElement("cash-remittance-position-summary");

  if (!container) {
    return;
  }

  const driverId = cashGetInputValue("cash-remittance-collector");

  if (!driverId) {
    container.textContent = "Selecciona un conductor para ver el total cobrado, rendido y pendiente.";
    return;
  }

  const position = getCashDriverPosition(driverId) || finalizeCashDriverPosition(getOrCreateCashDriverPosition(new Map(), driverId));
  const amount = getMoneyInput("cash-remittance-amount");
  const exceedsPending = amount > position.pendingAmount;
  const warning = exceedsPending ? ` \u00b7 Excedente estimado: ${formatCashMoney(amount - position.pendingAmount)}.` : "";

  container.textContent = `Total cobrado: ${formatCashMoney(position.totalCollected)} \u00b7 Total rendido: ${formatCashMoney(position.totalRendered)} \u00b7 Pendiente: ${formatCashMoney(position.pendingAmount)}${position.excessAmount > 0 ? ` \u00b7 Excedente: ${formatCashMoney(position.excessAmount)}` : ""}${warning}`;
}

function openCashRemittanceOverrunModal(draft, pendingAmount) {
  const driver = getCashCollaboratorById(draft.driverId);
  const excessAmount = roundCashAmount(draft.amount - pendingAmount);

  cashSetText(
    "cash-remittance-overrun-summary",
    `El importe entregado supera en ${formatCashMoney(excessAmount)} el saldo registrado. Se recibiran ${formatCashMoney(draft.amount)} y se abrira una incidencia para revisi\u00f3n. Conductor: ${driver?.name || "Conductor"}. Saldo registrado: ${formatCashMoney(pendingAmount)}.`,
  );
  openCashModal("cash-remittance-overrun-modal");
}

function registerCashRemittanceSettlement(event) {
  event.preventDefault();

  if (!canRegisterCashRemittances()) {
    notifyCash("No tienes permiso para registrar rendiciones.", "error");
    return;
  }

  const driverId = cashGetInputValue("cash-remittance-collector");
  const amount = getMoneyInput("cash-remittance-amount");
  const observations = cashGetInputValue("cash-remittance-notes");
  const position = getCashDriverPosition(driverId);
  const pendingAmount = roundCashAmount(position?.pendingAmount || 0);

  if (!driverId || amount <= 0) {
    notifyCash("Selecciona conductor e importe de la rendicion.", "warning");
    return;
  }

  if (amount > pendingAmount) {
    pendingCashRemittanceOverrunDraft = {
      driverId,
      amount,
      observations,
      expectedPendingAmount: pendingAmount,
      differenceAmount: roundCashAmount(amount - pendingAmount),
      form: event.currentTarget,
    };
    openCashRemittanceOverrunModal(pendingCashRemittanceOverrunDraft, pendingAmount);
    return;
  }

  createCashRemittance({ driverId, amount, observations });
  clearCashForm(event.currentTarget);
  updateCashRemittanceFormSummary();
}

function confirmCashRemittanceOverrun() {
  if (!pendingCashRemittanceOverrunDraft) {
    notifyCash("No se pudo confirmar la rendicion.", "error");
    return;
  }

  createCashRemittance(pendingCashRemittanceOverrunDraft);
  clearCashForm(pendingCashRemittanceOverrunDraft.form);
  pendingCashRemittanceOverrunDraft = null;
  closeCashModal(cashGetElement("cash-remittance-overrun-modal"));
  updateCashRemittanceFormSummary();
}

function cancelCashRemittanceOverrun() {
  pendingCashRemittanceOverrunDraft = null;
  closeCashModal(cashGetElement("cash-remittance-overrun-modal"));
}

function createCashRemittance({ driverId, amount, observations, expectedPendingAmount = null, differenceAmount = 0 }) {
  const currentUser = getCashCurrentUser();
  const registeredAt = new Date().toISOString();
  const driver = getCashCollaboratorById(driverId);
  const remittanceId = getNextRemittanceId();
  const movementId = getNextCashMovementId();

  const remittance = {
    id: remittanceId,
    remittanceId,
    driverId,
    amount,
    createdAt: registeredAt,
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    observations: observations || "",
    status: "V\u00e1lida",
  };

  financeData.remittances.push(remittance);

  financeData.cashMovements.push({
    id: movementId,
    type: "Entrada",
    category: "Rendicion de efectivo",
    amount,
    remittanceId,
    actorType: driver?.driverType || "Conductor",
    actorId: driverId,
    actorName: driver?.name || "Conductor",
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    registeredAt,
    status: "Registrado",
    notes: observations || "",
  });

  if (roundCashAmount(differenceAmount) > 0) {
    createCashOverrunIncident({
      driver,
      driverId,
      remittanceId,
      expectedPendingAmount,
      receivedAmount: amount,
      differenceAmount,
      currentUser,
      createdAt: registeredAt,
    });
  }

  closeCashModal(cashGetElement("cash-remittance-form-modal"));
  emitCashEvents({ reason: "remittance-created", driverId, remittanceId, movementId, hasDifference: roundCashAmount(differenceAmount) > 0 });
  renderCashView();
  notifyCash("Rendicion registrada correctamente.", "success");
}

function createCashOverrunIncident({ driver, driverId, remittanceId, expectedPendingAmount, receivedAmount, differenceAmount, currentUser, createdAt }) {
  if (!window.ElaraAdminIncidentsMock || !Array.isArray(window.ElaraAdminIncidentsMock.incidents)) {
    console.warn("[ELARA] No existe la coleccion central de incidencias para registrar sobrerendicion.");
    return null;
  }

  const incidentId = getNextCashFinancialIncidentId();
  const driverName = driver?.name || "Conductor";
  const incident = {
    id: incidentId,
    incidentId,
    type: "Excedente en rendici\u00f3n",
    category: "Financiera",
    categoryLabel: "Excedente en rendici\u00f3n",
    priority: "Alta",
    status: "Pendiente",
    driverId,
    driverName,
    remittanceId,
    expectedPendingAmount: roundCashAmount(expectedPendingAmount),
    receivedAmount: roundCashAmount(receivedAmount),
    differenceAmount: roundCashAmount(differenceAmount),
    reportedByType: "Administracion",
    reportedById: currentUser?.id || "",
    reportedByName: currentUser?.name || "Administracion",
    involvedType: driver?.driverType || "Conductor",
    involvedId: driverId,
    involvedName: driverName,
    createdByUserId: currentUser?.id || "",
    createdByName: currentUser?.name || "Administracion",
    createdAt,
    subject: "Excedente en rendici\u00f3n",
    message: `Se recibieron ${formatCashMoney(receivedAmount)} frente a un saldo registrado de ${formatCashMoney(expectedPendingAmount)}. Excedente a revisar: ${formatCashMoney(differenceAmount)}.`,
    assignedTo: "Administracion",
    resolutionNote: "",
  };

  window.ElaraAdminIncidentsMock.incidents.push(incident);
  emitCashAdminIncidentsEvent({ reason: "cash-remittance-overrun", incidentId, remittanceId, driverId });
  return incident;
}

function registerCashCount(event) {
  event.preventDefault();

  if (!canRegisterCashCounts()) {
    notifyCash("No tienes permiso para registrar arqueos.", "error");
    return;
  }

  const countedAmount = getMoneyInput("cash-count-amount");

  if (countedAmount < 0) {
    notifyCash("Introduce el importe contado.", "warning");
    return;
  }

  const currentUser = getCashCurrentUser();
  const theoreticalAmount = getCashSummary().balance;
  const differenceAmount = roundCashAmount(countedAmount - theoreticalAmount);

  financeData.cashCounts.push({
    id: getNextCashCountId(),
    theoreticalAmount,
    countedAmount,
    differenceAmount,
    status: differenceAmount === 0 ? "Cuadrado" : "Con diferencia",
    differenceStatus: differenceAmount === 0 ? "Cerrada" : "Abierta",
    countedByUserId: currentUser?.id || "",
    countedByName: currentUser?.name || "Administracion",
    countedAt: new Date().toISOString(),
    notes: cashGetInputValue("cash-count-notes"),
  });

  clearCashForm(event.currentTarget);
  closeCashModal(cashGetElement("cash-count-form-modal"));
  emitCashEvents({ reason: "cash-count-created" });
  renderCashView();
  notifyCash("Arqueo registrado correctamente.", "success");
}

function registerCashAdjustment(event) {
  event.preventDefault();

  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede registrar ajustes de caja.", "error");
    return;
  }

  const type = cashGetInputValue("cash-adjustment-type");
  const amount = getMoneyInput("cash-adjustment-amount");
  const reason = cashGetInputValue("cash-adjustment-reason");
  const currentUser = getCashCurrentUser();

  if (!["Entrada", "Salida"].includes(type) || amount <= 0 || !reason) {
    notifyCash("Completa tipo, importe y motivo del ajuste.", "warning");
    return;
  }

  financeData.cashMovements.push({
    id: getNextCashMovementId(),
    type,
    category: "Ajuste de caja",
    amount,
    actorType: "Administracion",
    actorId: currentUser?.id || "",
    actorName: currentUser?.name || "Administracion",
    registeredByUserId: currentUser?.id || "",
    registeredByName: currentUser?.name || "Administracion",
    registeredAt: new Date().toISOString(),
    status: "Registrado",
    notes: reason,
  });

  clearCashForm(event.currentTarget);
  closeCashModal(cashGetElement("cash-adjustment-form-modal"));
  emitCashEvents({ reason: "cash-adjustment-created" });
  renderCashView();
  notifyCash("Ajuste registrado correctamente.", "success");
}

function voidCashMovement(event) {
  event.preventDefault();

  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede anular movimientos de caja.", "error");
    return;
  }

  const movementId = cashGetInputValue("cash-void-movement");
  const reason = cashGetInputValue("cash-void-reason");
  const movement = financeData.cashMovements.find((item) => item.id === movementId);
  const currentUser = getCashCurrentUser();

  if (!movement || movement.status === "Anulado" || !reason) {
    notifyCash("Selecciona un movimiento vigente y motivo de anulacion.", "warning");
    return;
  }

  if (movement.remittanceId && movement.category === "Rendicion de efectivo") {
    notifyCash("Anula la rendicion desde su detalle para recalcular la obligacion.", "warning");
    return;
  }

  movement.status = "Anulado";
  movement.voidedAt = new Date().toISOString();
  movement.voidedByUserId = currentUser?.id || "";
  movement.voidedByName = currentUser?.name || "Administracion";
  movement.voidReason = reason;

  clearCashForm(event.currentTarget);
  closeCashModal(cashGetElement("cash-void-form-modal"));
  emitCashEvents({ reason: "cash-movement-voided", movementId });
  renderCashView();
  notifyCash("Movimiento anulado correctamente.", "success");
}

function closeCashDifference(event) {
  event.preventDefault();

  if (!isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede cerrar diferencias de caja.", "error");
    return;
  }

  const differenceId = cashGetInputValue("cash-difference-close-id");
  const resolutionNote = cashGetInputValue("cash-difference-close-note");
  const currentUser = getCashCurrentUser();
  const target = (financeData.cashCounts || []).find((count) => count.id === differenceId && isCashDifferenceOpen(count));

  if (!target || !resolutionNote) {
    notifyCash("Selecciona una diferencia abierta e indica la resolucion.", "warning");
    return;
  }

  target.differenceStatus = "Cerrada";
  target.differenceResolvedAt = new Date().toISOString();
  target.differenceResolvedByUserId = currentUser?.id || "";
  target.differenceResolvedByName = currentUser?.name || "Administracion";
  target.differenceResolutionNote = resolutionNote;

  clearCashForm(event.currentTarget);
  closeCashModal(cashGetElement("cash-difference-close-modal"));
  closeCashModal(cashGetElement("cash-count-detail-modal"));
  emitCashEvents({ reason: "cash-difference-closed", differenceId });
  renderCashView();
  notifyCash("Diferencia cerrada correctamente.", "success");
}

function isCashDifferenceOpen(item) {
  if (!item) {
    return false;
  }

  if (item.differenceStatus) {
    return item.differenceStatus === "Abierta";
  }

  return item.status === "Con diferencia";
}

function getActiveCashMovements() {
  return (financeData.cashMovements || []).filter((movement) => movement.status !== "Anulado");
}

function normalizeCashCollector(collector) {
  const type = String(collector?.type || "").trim();
  const id = String(collector?.id || "").trim();
  const name = String(collector?.name || "").trim();

  if (!CASH_VALID_COLLECTOR_TYPES.includes(type) || !name) {
    return null;
  }

  if (type !== "Administracion" && !id) {
    return null;
  }

  return { type, id, name };
}

function populateCashCollectorSelect(selectId, emptyLabel = "Selecciona conductor") {
  const select = cashGetElement(selectId);

  if (!select) {
    return;
  }

  const previousValue = select.value;
  const collectors = getCashCollaborators();

  select.innerHTML = `<option value="">${escapeCashHtml(emptyLabel)}</option>`;
  collectors.forEach((collaborator) => {
    const option = document.createElement("option");
    option.value = collaborator.id;
    option.textContent = `${collaborator.name} \u00B7 ${collaborator.driverType || "Conductor"}`;
    select.appendChild(option);
  });

  if (previousValue && collectors.some((collaborator) => collaborator.id === previousValue)) {
    select.value = previousValue;
  }
}

function renderCashVoidAction(movement) {
  if (!isCurrentCashSuperadmin() || movement.status === "Anulado" || (movement.remittanceId && movement.category === "Rendicion de efectivo")) {
    return "";
  }

  return `<button class="button button--compact button--muted" type="button" data-cash-fill-void="${escapeCashHtml(movement.id)}">Anular</button>`;
}

function canViewCash() {
  return canCashPerform("cash.view");
}

function canRegisterCashRemittances() {
  return canCashPerform("cash.remittances.register");
}

function canRegisterCashCounts() {
  return canCashPerform("cash.counts.create");
}

function isCurrentCashSuperadmin() {
  return getCashActiveContext() === "superadmin";
}

function canCashPerform(action) {
  if (!window.ElaraPermissions || typeof window.ElaraPermissions.canPerformAction !== "function") {
    return false;
  }

  return window.ElaraPermissions.canPerformAction(getCashActiveContext(), action);
}

function getCashActiveContext() {
  return window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function" ? window.ElaraAuth.getActiveContext() : "";
}

function getCashCurrentUser() {
  return window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
}

function getCashCollaborators() {
  return window.ElaraCollaboratorsMock?.collaborators || [];
}

function getCashCollaboratorById(collaboratorId) {
  return getCashCollaborators().find((collaborator) => collaborator.id === collaboratorId) || null;
}

function getCashServiceId(service) {
  return String(service?.serviceId || service?.id || "").trim();
}

function getNextCashMovementId() {
  return getNextCashId("CASH", financeData.cashMovements);
}

function getNextRemittanceId() {
  return getNextCashId("REM", financeData.remittances);
}

function getNextCashCountId() {
  return getNextCashId("COUNT", financeData.cashCounts);
}

function getNextCashFinancialIncidentId() {
  const incidents = window.ElaraAdminIncidentsMock?.incidents || [];
  const maxNumber = incidents.reduce((max, incident) => {
    const match = String(incident?.incidentId || incident?.id || "").match(/^INC-FIN-(\d+)$/);

    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `INC-FIN-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getNextCashId(prefix, collection) {
  const maxNumber = (collection || []).reduce((max, item) => {
    const id = String(item?.id || "");
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));

    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getCashDateTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getCashDateBoundaryTimestamp(value, boundary) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return 0;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = boundary === "end" ? new Date(year, month, day, 23, 59, 59, 999) : new Date(year, month, day, 0, 0, 0, 0);

  return date.getTime();
}

function formatCashDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSameCashMonth(dateValue, referenceDate) {
  const date = new Date(dateValue);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth()
  );
}

function formatCashMoney(value) {
  const amount = roundCashAmount(value);

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: financeData.cashSettings?.currency || "EUR" }).format(amount);
}

function formatCashDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roundCashAmount(value) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function normalizeCashText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMoneyInput(id) {
  const value = Number(cashGetInputValue(id).replace(",", "."));

  return Number.isFinite(value) ? roundCashAmount(value) : -1;
}

function clearCashForm(form) {
  if (form && typeof form.reset === "function") {
    form.reset();
  }
}

function setElementVisibility(id, isVisible) {
  const element = cashGetElement(id);

  if (element) {
    element.hidden = !isVisible;
  }
}

function showCashUnavailable(message) {
  const view = cashGetElement("caja");

  if (view) {
    view.innerHTML = `<section class="panel"><p class="service-assignment-empty">${escapeCashHtml(message)}</p></section>`;
  }
}

function normalizeCashRemittances(remittances) {
  const normalized = [];

  remittances.forEach((remittance) => {
    if (Array.isArray(remittance.settlements)) {
      remittance.settlements.forEach((settlement) => {
        normalized.push(normalizeCashRemittance({
          id: settlement.id && String(settlement.id).startsWith("REM-") ? settlement.id : getNextNormalizedRemittanceId(normalized, remittances),
          driverId: remittance.collectorId || remittance.driverId || "",
          amount: settlement.amount,
          createdAt: settlement.registeredAt,
          registeredByUserId: settlement.registeredByUserId,
          registeredByName: settlement.registeredByName,
          observations: settlement.notes || settlement.observations || "",
          status: settlement.status === "Anulada" || settlement.voidedAt ? "Anulada" : "V\u00e1lida",
          annulledAt: settlement.voidedAt,
          annulledByUserId: settlement.voidedByUserId,
          annulledByName: settlement.voidedByName,
          annulmentReason: settlement.voidReason,
        }));
      });
      return;
    }

    normalized.push(normalizeCashRemittance(remittance));
  });

  return normalized.filter((remittance) => remittance.driverId && remittance.amount > 0);
}

function normalizeCashRemittance(remittance) {
  const id = getCashRemittanceId(remittance) || getNextNormalizedRemittanceId([], []);

  return {
    id,
    remittanceId: id,
    driverId: String(remittance.driverId || remittance.collectorId || "").trim(),
    amount: roundCashAmount(remittance.amount),
    createdAt: remittance.createdAt || remittance.registeredAt || new Date().toISOString(),
    registeredByUserId: remittance.registeredByUserId || remittance.createdByUserId || "",
    registeredByName: remittance.registeredByName || remittance.createdByName || "Administracion",
    observations: remittance.observations || remittance.notes || "",
    status: remittance.status === "Anulada" || remittance.annulledAt || remittance.voidedAt ? "Anulada" : "V\u00e1lida",
    annulledAt: remittance.annulledAt || remittance.voidedAt || "",
    annulledByUserId: remittance.annulledByUserId || remittance.voidedByUserId || "",
    annulledByName: remittance.annulledByName || remittance.voidedByName || "",
    annulmentReason: remittance.annulmentReason || remittance.voidReason || "",
  };
}

function getNextNormalizedRemittanceId(normalized, source) {
  const ids = [...(normalized || []), ...(source || [])].map((item) => ({ id: getCashRemittanceId(item) }));

  return getNextCashId("REM", ids);
}

function ensureFinanceData() {
  window.ElaraFinanceMock = financeData;
  financeData.cashSettings = financeData.cashSettings || { currency: "EUR", singleCashBox: true };
  financeData.cashMovements = Array.isArray(financeData.cashMovements) ? financeData.cashMovements : [];
  financeData.remittances = Array.isArray(financeData.remittances) ? financeData.remittances : [];
  financeData.remittances = normalizeCashRemittances(financeData.remittances);
  financeData.cashCounts = Array.isArray(financeData.cashCounts) ? financeData.cashCounts : [];
  validateCashFinancialIntegrity("finance-data-ready");
}

function validateCashFinancialIntegrity(reason = "manual") {
  if (validateCashFinancialIntegrity.isRunning) {
    return { ok: true, warnings: [] };
  }

  validateCashFinancialIntegrity.isRunning = true;

  try {
    const services = window.ElaraServicesMock?.services || [];
    const incidents = window.ElaraAdminIncidentsMock?.incidents || [];
    const paymentAttempts = new Map();
    const incidentAttempts = new Map();
    const warnings = [];

    services.forEach((service) => {
      (service.financial?.payments || []).forEach((payment) => {
        if (payment.collectionAttemptId) {
          addCashIntegrityOccurrence(paymentAttempts, payment.collectionAttemptId, payment.id || service.serviceId);
        }
      });
    });

    incidents
      .filter((incident) => incident.category === "FINANCIAL_COLLECTION")
      .forEach((incident) => {
        if (incident.collectionAttemptId && incident.type) {
          addCashIntegrityOccurrence(incidentAttempts, `${incident.collectionAttemptId}:${incident.type}`, incident.incidentId || incident.id);
        }

        if (incident.serviceId && !findCashServiceById(incident.serviceId)) {
          console.warn("[ELARA] Incidencia financiera con serviceId inexistente:", incident.incidentId || incident.id, incident.serviceId, reason);
        }
      });

    warnCashIntegrityDuplicates(paymentAttempts, "Mas de un payment por collectionAttemptId", reason);
    warnCashIntegrityDuplicates(incidentAttempts, "Mas de una incidencia por collectionAttemptId y tipo", reason);
    warnings.push(...getCashExpenseIntegrityWarnings());
    warnings.push(...getCashSettlementIntegrityWarnings());
    warnings.push(...getCashReceivableIntegrityWarnings());
    warnings.forEach((warning) => console.warn("[ELARA] Integridad financiera Caja/Gastos:", warning, reason));

    return {
      ok: warnings.length === 0,
      warnings,
    };
  } finally {
    validateCashFinancialIntegrity.isRunning = false;
  }
}

function getCashExpenseIntegrityWarnings() {
  const expenses = Array.isArray(window.ElaraExpensesMock?.expenses) ? window.ElaraExpensesMock.expenses : [];
  const expenseIds = new Set(expenses.map((expense) => String(expense.expenseId || expense.id || "").trim()).filter(Boolean));
  const activeExpenseMovements = getActiveCashMovements().filter(isCashExpenseMovement);
  const warnings = [];
  const movementsByExpenseAndCategory = new Map();

  activeExpenseMovements.forEach((movement) => {
    const expenseId = getCashExpenseMovementExpenseId(movement);
    const key = `${expenseId}:${movement.category || ""}`;
    const occurrences = movementsByExpenseAndCategory.get(key) || [];

    occurrences.push(movement);
    movementsByExpenseAndCategory.set(key, occurrences);

    if (!expenseId || !expenseIds.has(expenseId)) {
      warnings.push(`${movement.id || "Movimiento sin ID"}: movimiento de gasto sin expenseId valido.`);
    }
  });

  movementsByExpenseAndCategory.forEach((movements, key) => {
    if (movements.length > 1) {
      warnings.push(`${key}: movimientos de gasto duplicados.`);
    }
  });

  expenses.forEach((expense) => {
    warnings.push(...getCashExpenseSettlementWarnings(expense, "payment"));
    warnings.push(...getCashExpenseSettlementWarnings(expense, "reimbursement"));
  });

  return warnings;
}

function getCashSettlementIntegrityWarnings() {
  const settlements = Array.isArray(window.ElaraFinanceMock?.settlements) ? window.ElaraFinanceMock.settlements : [];
  const settlementIds = new Set(settlements.map((settlement) => String(settlement.settlementId || settlement.id || "").trim()).filter(Boolean));
  const warnings = [];
  const paymentMovementsBySettlement = new Map();
  const reversalMovementsByOriginal = new Map();

  getActiveCashMovements()
    .filter(isCashSettlementPaymentMovement)
    .forEach((movement) => {
      const settlementId = getCashSettlementMovementSettlementId(movement);
      const key = `${settlementId}:${movement.category || ""}`;
      const occurrences = paymentMovementsBySettlement.get(key) || [];

      occurrences.push(movement);
      paymentMovementsBySettlement.set(key, occurrences);

      if (!settlementId || !settlementIds.has(settlementId)) {
        warnings.push(`${movement.id || "Movimiento sin ID"}: movimiento de liquidaci\u00f3n sin settlementId v\u00e1lido.`);
      }
    });

  getActiveCashMovements()
    .filter(isCashSettlementReversalMovement)
    .forEach((movement) => {
      const originalCashMovementId = String(movement.originalCashMovementId || "").trim();
      const occurrences = reversalMovementsByOriginal.get(originalCashMovementId) || [];

      occurrences.push(movement);
      reversalMovementsByOriginal.set(originalCashMovementId, occurrences);

      if (!getCashSettlementMovementSettlementId(movement) || !settlementIds.has(getCashSettlementMovementSettlementId(movement))) {
        warnings.push(`${movement.id || "Movimiento sin ID"}: reversi\u00f3n de liquidaci\u00f3n sin settlementId v\u00e1lido.`);
      }
    });

  paymentMovementsBySettlement.forEach((movements, key) => {
    const unreversedMovements = movements.filter((movement) => !movement.reversedByCashMovementId);

    if (unreversedMovements.length > 1) {
      warnings.push(`${key}: pagos de liquidaci\u00f3n duplicados.`);
    }
  });

  reversalMovementsByOriginal.forEach((movements, originalCashMovementId) => {
    if (!originalCashMovementId) {
      warnings.push("Reversi\u00f3n de pago de liquidaci\u00f3n sin movimiento original.");
    }

    if (movements.length > 1) {
      warnings.push(`${originalCashMovementId}: reversi\u00f3n de pago de liquidaci\u00f3n duplicada.`);
    }
  });

  return warnings;
}

function getCashReceivableIntegrityWarnings() {
  const payments = Array.isArray(window.ElaraReceivablesMock?.payments) ? window.ElaraReceivablesMock.payments : [];
  const paymentIds = new Set(payments.map((payment) => String(payment.receivablePaymentId || payment.id || "").trim()).filter(Boolean));
  const warnings = [];
  const movementsByPayment = new Map();
  const reversalsByOriginal = new Map();

  getActiveCashMovements()
    .filter(isCashReceivableMovement)
    .forEach((movement) => {
      const paymentId = getCashReceivableMovementPaymentId(movement);
      const occurrences = movementsByPayment.get(paymentId) || [];

      occurrences.push(movement);
      movementsByPayment.set(paymentId, occurrences);

      if (!paymentId || !paymentIds.has(paymentId)) {
        warnings.push(`${movement.id || "Movimiento sin ID"}: movimiento de cuenta por cobrar sin cobro central valido.`);
      }
    });

  getActiveCashMovements()
    .filter(isCashReceivableReversalMovement)
    .forEach((movement) => {
      const paymentId = getCashReceivableMovementPaymentId(movement);
      const originalCashMovementId = String(movement.originalCashMovementId || "").trim();
      const occurrences = reversalsByOriginal.get(originalCashMovementId) || [];

      occurrences.push(movement);
      reversalsByOriginal.set(originalCashMovementId, occurrences);

      if (!paymentId || !paymentIds.has(paymentId)) {
        warnings.push(`${movement.id || "Movimiento sin ID"}: reversion de cuenta por cobrar sin cobro central valido.`);
      }
    });

  movementsByPayment.forEach((movements, paymentId) => {
    const unreversedMovements = movements.filter((movement) => !movement.reversedByCashMovementId);

    if (unreversedMovements.length > 1) {
      warnings.push(`${paymentId}: movimientos de cuenta por cobrar duplicados.`);
    }
  });

  reversalsByOriginal.forEach((movements, originalCashMovementId) => {
    if (!originalCashMovementId) {
      warnings.push("Reversion de cuenta por cobrar sin movimiento original.");
    }

    if (movements.length > 1) {
      warnings.push(`${originalCashMovementId}: reversion de cuenta por cobrar duplicada.`);
    }
  });

  payments.forEach((payment) => {
    const paymentId = String(payment.receivablePaymentId || payment.id || "").trim();

    if (!paymentId || payment.status === "Anulado") {
      return;
    }

    const cashMovementId = String(payment.cashMovementId || "").trim();

    if (!cashMovementId || !getActiveCashMovements().some((movement) => movement.id === cashMovementId && isCashReceivableMovement(movement))) {
      warnings.push(`${paymentId}: cobro posterior sin movimiento de Caja activo.`);
    }
  });

  return warnings;
}

function getCashExpenseSettlementWarnings(expense, settlementType) {
  const status = String(expense?.status || "").trim();
  const expenseId = String(expense?.expenseId || expense?.id || "").trim();
  const settlement = settlementType === "reimbursement" ? expense?.reimbursement : expense?.payment;
  const isSettled = settlement?.status === "Pagado" && (settlementType === "reimbursement" ? status === "Reembolsada" : status === "Pagada");
  const expectedCategory = getCashExpenseMovementCategory(expenseId, settlementType);
  const movements = getActiveCashMovements().filter(
    (movement) => isCashExpenseMovement(movement) && getCashExpenseMovementExpenseId(movement) === expenseId && movement.category === expectedCategory,
  );
  const warnings = [];

  if (isSettled) {
    if (!movements.length) {
      warnings.push(`${expenseId}: ${settlementType === "reimbursement" ? "reembolso" : "pago"} sin salida de Caja.`);
      return warnings;
    }

    if (movements.length > 1) {
      warnings.push(`${expenseId}: ${settlementType === "reimbursement" ? "reembolso" : "pago"} con salidas de Caja duplicadas.`);
    }

    if (settlement.cashMovementId && !movements.some((movement) => movement.id === settlement.cashMovementId)) {
      warnings.push(`${expenseId}: referencia de Caja inexistente o incompatible (${settlement.cashMovementId}).`);
    }

    const movement = settlement.cashMovementId ? movements.find((item) => item.id === settlement.cashMovementId) || movements[0] : movements[0];

    if (roundCashAmount(movement.amount) !== roundCashAmount(settlement.amount)) {
      warnings.push(`${expenseId}: importe de Caja inconsistente en ${movement.id}.`);
    }

    if (movement.type !== "Salida") {
      warnings.push(`${expenseId}: movimiento de gasto no es salida en ${movement.id}.`);
    }
  } else if (movements.length && !["Pagada", "Reembolsada"].includes(status)) {
    warnings.push(`${expenseId}: salida de Caja anticipada para gasto no liquidado.`);
  }

  return warnings;
}

function isCashExpenseMovement(movement) {
  const category = String(movement?.category || "").trim();

  return movement?.sourceType === "expense" || Boolean(movement?.expenseId) || category.startsWith("Pago de gasto") || category.startsWith("Reembolso de gasto");
}

function getCashExpenseMovementExpenseId(movement) {
  return String(movement?.expenseId || (movement?.sourceType === "expense" ? movement?.sourceId : "") || "").trim();
}

function getCashExpenseMovementCategory(expenseId, settlementType) {
  return `${settlementType === "reimbursement" ? "Reembolso de gasto" : "Pago de gasto"} ${expenseId}`;
}

function isCashSettlementPaymentMovement(movement) {
  return movement?.sourceType === "settlement" || String(movement?.category || "").startsWith("Pago de liquidaci\u00f3n");
}

function isCashSettlementReversalMovement(movement) {
  return movement?.sourceType === "settlement-payment-reversal" || String(movement?.category || "").startsWith("Reversi\u00f3n de pago de liquidaci\u00f3n");
}

function getCashSettlementMovementSettlementId(movement) {
  return String(movement?.settlementId || (String(movement?.sourceType || "").startsWith("settlement") ? movement?.sourceId : "") || "").trim();
}

function isCashReceivableMovement(movement) {
  return movement?.sourceType === "receivable" || String(movement?.category || "").startsWith("Cobro de cuenta por cobrar");
}

function isCashReceivableReversalMovement(movement) {
  return movement?.sourceType === "receivable-payment-reversal" || String(movement?.category || "").startsWith("Reversi\u00f3n de cobro pendiente") || String(movement?.category || "").startsWith("Reversion de cobro pendiente");
}

function getCashReceivableMovementPaymentId(movement) {
  return String(movement?.receivablePaymentId || (String(movement?.sourceType || "").startsWith("receivable") ? movement?.sourceId : "") || "").trim();
}

function addCashIntegrityOccurrence(map, key, value) {
  const occurrences = map.get(key) || [];

  occurrences.push(value);
  map.set(key, occurrences);
}

function warnCashIntegrityDuplicates(map, message, reason) {
  map.forEach((values, key) => {
    if (values.length > 1) {
      console.warn(`[ELARA] ${message}:`, key, values, reason);
    }
  });
}

function emitCashEvents(detail = {}) {
  window.dispatchEvent(new CustomEvent(CASH_EVENT, { detail }));
  window.dispatchEvent(new CustomEvent(REMITTANCES_EVENT, { detail }));
}

function emitCashAdminIncidentsEvent(detail = {}) {
  window.dispatchEvent(new CustomEvent(ADMIN_INCIDENTS_EVENT, { detail }));
}

function notifyCash(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function cashGetInputValue(id) {
  const element = cashGetElement(id);

  return element ? element.value.trim() : "";
}

function cashGetElement(id) {
  return document.getElementById(id);
}

function cashSetText(id, value) {
  const element = cashGetElement(id);

  if (element) {
    element.textContent = value;
  }
}

function cashSetModalTarget(id, target) {
  const element = cashGetElement(id);

  if (element) {
    element.dataset.modalTarget = target;
  }
}

function escapeCashHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ADMIN_CASH_REMITTANCE_STATUS_LABELS_REAL = {
  draft: "Borrador",
  prepared: "Preparada",
  submitted: "Enviada",
  received: "Recibida",
  verified: "Verificada",
  cancelled: "Anulada",
};

const ADMIN_CASH_DISCREPANCY_STATUS_LABELS_REAL = {
  open: "Abierta",
  under_review: "En revisi\u00f3n",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

const ADMIN_CASH_DISCREPANCY_TYPE_LABELS_REAL = {
  remittance: "Rendici\u00f3n",
  cash_count: "Arqueo",
};

const ADMIN_CASH_DISCREPANCY_REASON_LABELS_REAL = {
  admin_verification_difference: "Diferencia por verificaci\u00f3n administrativa",
  driver_reported: "Reportada por conductor",
};

let adminCashRemittanceHistoryRowsReal = [];
let adminCashRemittanceHistoryTotalReal = 0;
let adminCashRemittanceDetailReal = null;
let adminCashRemittanceHistoryRequestIdReal = 0;
let pendingAdminCashRemittanceActionReal = null;
let isAdminCashRemittanceActionRunningReal = false;
let isAdminCashRemittanceClickBridgeReady = false;
let adminCashMovementRequestIdReal = 0;
let adminCashMovementAccountIdReal = "";
let adminCashDiscrepancyRowsReal = [];
let adminCashDiscrepancyTotalReal = 0;
let adminCashDiscrepancyDetailReal = null;
let selectedAdminCashDiscrepancyIdReal = "";
let adminCashDiscrepancyRequestIdReal = 0;
let pendingAdminCashDiscrepancyActionReal = null;
let isAdminCashDiscrepancyActionRunningReal = false;

function getAdminCashSupabaseClient() {
  return window.ElaraSupabase?.client || null;
}

async function renderAdminCashMovementsReal() {
  const container = cashGetElement("cash-movements-list");
  if (!container) {
    return;
  }

  const requestId = ++adminCashMovementRequestIdReal;
  const userId = getCashCurrentUser()?.supabaseUserId;
  const context = getCashActiveContext();
  const isCurrent = () => requestId === adminCashMovementRequestIdReal && getCashCurrentUser()?.supabaseUserId === userId && getCashActiveContext() === context;
  const client = getAdminCashSupabaseClient();
  container.innerHTML = '<p class="service-assignment-empty">Cargando movimientos reales...</p>';

  try {
    if (!client || !["superadmin", "administrativo"].includes(getCashActiveContext())) {
      throw new Error("An authenticated administrative session is required to read cash movements.");
    }

    const { data: accounts, error: accountError } = await client
      .from("v_admin_cash_account_overview")
      .select("cash_account_id,name,currency_code")
      .eq("account_type", "central")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (!isCurrent()) {
      return;
    }
    if (accountError) {
      throw accountError;
    }
    if (!Array.isArray(accounts) || !accounts.length) {
      container.innerHTML = '<p class="service-assignment-empty">No hay una cuenta central activa.</p>';
      return;
    }

    const account = accounts.length === 1
      ? accounts[0]
      : accounts.find((item) => item.cash_account_id === adminCashMovementAccountIdReal);
    const selector = accounts.length > 1
      ? `<label class="field"><span>Cuenta central</span><select data-cash-central-account>
          <option value="">Selecciona una cuenta central</option>
          ${accounts.map((item) => `<option value="${escapeCashHtml(item.cash_account_id)}" ${item.cash_account_id === account?.cash_account_id ? "selected" : ""}>${escapeCashHtml(item.name)} (${escapeCashHtml(item.currency_code)})</option>`).join("")}
        </select></label>`
      : "";
    container.innerHTML = `${selector}<div class="cash-list" data-cash-real-movement-rows><p class="service-assignment-empty">${account ? "Cargando movimientos..." : "Selecciona la cuenta cuyos movimientos quieres consultar."}</p></div>`;
    container.querySelector("[data-cash-central-account]")?.addEventListener("change", (event) => {
      adminCashMovementAccountIdReal = event.target.value;
      void renderAdminCashMovementsReal();
    });
    if (!account) {
      return;
    }

    const { data, error } = await client.rpc("get_admin_cash_movements", {
      p_cash_account_id: account.cash_account_id,
      p_limit: 50,
      p_offset: 0,
    });
    if (!isCurrent()) {
      return;
    }
    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const list = container.querySelector("[data-cash-real-movement-rows]");
    if (!list) {
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="service-assignment-empty">Sin movimientos reales en esta cuenta central.</p>';
      return;
    }

    const total = Number(rows[0].total_count) || rows.length;
    list.innerHTML = `<p class="service-assignment-empty">${escapeCashHtml(account.name)}: mostrando ${rows.length} de ${total} movimientos reales${total > rows.length ? " (los 50 m\u00e1s recientes)" : ""}.</p>`
      + rows.map(renderAdminCashMovementRowReal).join("");
  } catch (error) {
    if (!isCurrent()) {
      return;
    }
    console.error("[ELARA Cash] No se pudieron cargar los movimientos reales.", { error });
    container.innerHTML = '<p class="service-assignment-empty">No se pudieron cargar los movimientos reales de Caja Central.</p>';
  }
}

function renderAdminCashMovementRowReal(row) {
  const categories = {
    reversal: "Reversa de movimiento",
    manual_adjustment: "Ajuste de caja",
    count_adjustment: "Ajuste por arqueo",
    opening_balance: "Saldo inicial",
    remittance_received: "Rendici\u00f3n de efectivo",
    remittance_sent: "Rendici\u00f3n enviada",
  };
  const sources = {
    expense_payment: "Pago de gasto",
    expense_reimbursement: "Reembolso de gasto",
    service_payment: "Cobro de servicio",
    settlement_payment: "Pago de liquidaci\u00f3n",
  };
  const rawTitle = row.movement_category === "other" ? row.source_type : row.movement_category;
  const title = categories[row.movement_category] || sources[row.source_type]
    || String(rawTitle || row.source_type || "Movimiento de caja").replace(/_/g, " ");
  const isOutflow = row.movement_type === "outflow";
  const reference = [row.human_code, row.remittance_human_code,
    row.original_movement_human_code ? `Reversa de ${row.original_movement_human_code}` : ""].filter(Boolean).join(" - ");

  return `<article class="cash-row">
    <div>
      <strong>${escapeCashHtml(title)}</strong>
      <span>${escapeCashHtml(formatCashDateTime(row.occurred_at))} \u00B7 ${escapeCashHtml(row.actor_name || row.created_by_human_code || "Sin actor registrado")}</span>
      <small>${escapeCashHtml(reference)}</small>
      ${row.description ? `<small>${escapeCashHtml(row.description)}</small>` : ""}
    </div>
    <strong class="cash-row__amount cash-row__amount--${isOutflow ? "out" : "in"}">${isOutflow ? "-" : "+"}${escapeCashHtml(formatAdminCashMoney(row.amount, row.currency_code))}</strong>
  </article>`;
}

function isCashUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function ensureAdminCashRemittanceRealUi() {
  const statusFilter = cashGetElement("cash-remittance-history-status");

  if (statusFilter && statusFilter.dataset.realRemittanceStatuses !== "true") {
    statusFilter.innerHTML = `
      <option value="">Todos</option>
      <option value="draft">Borrador</option>
      <option value="prepared">Preparada</option>
      <option value="submitted">Enviada</option>
      <option value="received">Recibida</option>
      <option value="verified">Verificada</option>
      <option value="cancelled">Anulada</option>
    `;
    statusFilter.dataset.realRemittanceStatuses = "true";
  }

  ["cash-remittance-history-driver", "cash-remittance-history-from", "cash-remittance-history-to"].forEach((id) => {
    const field = cashGetElement(id);

    if (field) {
      field.disabled = true;
      field.title = "El listado real filtra por estado, b\u00fasqueda y paginaci\u00f3n.";
    }
  });

  const detailModal = cashGetElement("cash-remittance-detail-modal");
  const detailBody = detailModal?.querySelector(".modal__body");
  const detailActions = detailModal?.querySelector(".modal__actions");

  if (detailBody && !cashGetElement("cash-remittance-detail-real-content")) {
    detailBody.insertAdjacentHTML("beforeend", '<div id="cash-remittance-detail-real-content"></div>');
  }

  let receiveButton = cashGetElement("cash-remittance-receive-action");
  let receiveSection = cashGetElement("cash-remittance-receive-section");

  if (receiveButton && detailBody && !detailBody.contains(receiveButton)) {
    receiveButton.remove();
    receiveButton = null;
    receiveSection = null;
  }

  if (detailBody && !receiveButton) {
    const detailRealContent = cashGetElement("cash-remittance-detail-real-content");
    const markup = `
      <section class="service-summary__section cash-remittance-receive-section" id="cash-remittance-receive-section" hidden>
        <div class="form-actions-inline form-actions-inline--end cash-remittance-receive-section__actions">
          <button class="button button--compact" type="button" id="cash-remittance-receive-action" data-cash-admin-remittance-action="receive">Marcar recibida</button>
        </div>
      </section>
    `;

    if (detailRealContent) {
      const receiveAnchor = cashGetElement("cash-remittance-receive-section") || detailRealContent;
      receiveAnchor.insertAdjacentHTML("afterend", markup);
    } else {
      detailBody.insertAdjacentHTML("beforeend", markup);
    }

    receiveButton = cashGetElement("cash-remittance-receive-action");
    receiveSection = cashGetElement("cash-remittance-receive-section");
  }

  let verifyAction = cashGetElement("cash-remittance-verify-action");

  if (verifyAction && detailBody && !detailBody.contains(verifyAction)) {
    verifyAction.remove();
    verifyAction = null;
  }

  if (detailBody && !verifyAction) {
    const detailRealContent = cashGetElement("cash-remittance-detail-real-content");
    const markup = `
      <section class="service-summary__section cash-remittance-verification-section" id="cash-remittance-verify-action" hidden>
        <h3>Verificaci&oacute;n</h3>
        <label class="field">
          <span>Importe verificado</span>
          <input id="cash-remittance-verify-amount" type="number" min="0.01" step="0.01" inputmode="decimal" />
        </label>
        <div class="form-actions-inline form-actions-inline--end cash-remittance-verification-section__actions">
          <button class="button button--compact" type="button" data-cash-admin-remittance-action="verify">Verificar rendici&oacute;n</button>
        </div>
      </section>
    `;

    if (detailRealContent) {
      const receiveAnchor = cashGetElement("cash-remittance-receive-section") || detailRealContent;
      receiveAnchor.insertAdjacentHTML("afterend", markup);
    } else {
      detailBody.insertAdjacentHTML("beforeend", markup);
    }

    verifyAction = cashGetElement("cash-remittance-verify-action");
  }

  if (verifyAction && !verifyAction.querySelector('[data-cash-admin-remittance-action="verify"]')) {
    verifyAction.insertAdjacentHTML(
      "beforeend",
      '<button class="button button--compact" type="button" data-cash-admin-remittance-action="verify">Verificar rendici&oacute;n</button>',
    );
  }
  if (!cashGetElement("cash-remittance-admin-confirm-modal")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="modal-backdrop" id="cash-remittance-admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cash-remittance-admin-confirm-title" hidden>
          <section class="modal modal--summary">
            <header class="modal__header">
              <div>
                <p class="panel__eyebrow">Caja</p>
                <h2 id="cash-remittance-admin-confirm-title">Confirmar acci&oacute;n</h2>
              </div>
              <button class="button button--compact button--muted" type="button" data-modal-close>Cerrar</button>
            </header>
            <div class="modal__body modal__body--summary service-summary">
              <p class="modal__hint" id="cash-remittance-admin-confirm-summary">-</p>
              <p class="form-error" id="cash-remittance-admin-confirm-error" hidden></p>
              <div class="form-actions-inline form-actions-inline--end">
                <button class="button button--compact button--muted" type="button" id="cash-remittance-admin-confirm-cancel">Cancelar</button>
                <button class="button button--compact" type="button" id="cash-remittance-admin-confirm-action">Confirmar</button>
              </div>
            </div>
          </section>
        </div>
      `,
    );
  }

  if (!isAdminCashRemittanceClickBridgeReady) {
    document.addEventListener("click", handleAdminCashRemittanceRealDocumentClick);
    document.addEventListener("keydown", handleAdminCashRemittanceRealKeydown);
    isAdminCashRemittanceClickBridgeReady = true;
  }
}

function getCashRemittanceStatus(remittance) {
  const status = String(remittance?.status || "").trim();

  if (Object.prototype.hasOwnProperty.call(ADMIN_CASH_REMITTANCE_STATUS_LABELS_REAL, status)) {
    return ADMIN_CASH_REMITTANCE_STATUS_LABELS_REAL[status];
  }

  return remittance?.status === "Anulada" || remittance?.annulledAt ? "Anulada" : "V\u00e1lida";
}

function getAdminCashDiscrepancyStatusLabel(status) {
  const normalizedStatus = String(status || "").trim();

  if (Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_STATUS_LABELS_REAL, normalizedStatus)) {
    return ADMIN_CASH_DISCREPANCY_STATUS_LABELS_REAL[normalizedStatus];
  }

  return normalizedStatus || "Sin estado";
}

function getDefaultCashDiscrepancyFilters() {
  return {
    status: "",
    type: "",
    search: "",
  };
}

function handleCashDiscrepancyFilterChange() {
  cashDiscrepancyFilters = {
    status: cashGetInputValue("cash-discrepancy-status"),
    type: cashGetInputValue("cash-discrepancy-type"),
    search: cashGetInputValue("cash-discrepancy-search"),
  };
  cashDiscrepancyPage = 1;
  void renderAdminCashDiscrepancies();
}

function clearCashDiscrepancyFilters() {
  cashDiscrepancyFilters = getDefaultCashDiscrepancyFilters();
  cashDiscrepancyPage = 1;
  syncCashDiscrepancyFiltersToDom();
  void renderAdminCashDiscrepancies();
}

function syncCashDiscrepancyFiltersToDom() {
  [
    ["cash-discrepancy-status", "status"],
    ["cash-discrepancy-type", "type"],
    ["cash-discrepancy-search", "search"],
  ].forEach(([id, key]) => {
    const element = cashGetElement(id);

    if (element && element.value !== cashDiscrepancyFilters[key]) {
      element.value = cashDiscrepancyFilters[key] || "";
    }
  });
}

function getAdminCashDiscrepancyStatusFilterValue(value) {
  const status = String(value || "").trim();

  return Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_STATUS_LABELS_REAL, status) ? status : null;
}

function getAdminCashDiscrepancyTypeFilterValue(value) {
  const type = String(value || "").trim();

  return Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_TYPE_LABELS_REAL, type) ? type : null;
}

async function renderAdminCashDiscrepancies() {
  const container = cashGetElement("cash-discrepancy-list");
  const meta = cashGetElement("cash-discrepancy-meta");
  const pagination = cashGetElement("cash-discrepancy-pagination");

  if (!container) {
    return;
  }

  syncCashDiscrepancyFiltersToDom();

  const client = getAdminCashSupabaseClient();

  if (!client) {
    container.innerHTML = '<p class="service-assignment-empty">No se pudo conectar con Supabase para cargar discrepancias reales.</p>';
    if (meta) {
      meta.textContent = "Sin conexi\u00f3n a datos reales";
    }
    renderCashPagination(pagination, 1, 1, "admin-discrepancies");
    return;
  }

  const requestId = ++adminCashDiscrepancyRequestIdReal;
  const offset = (Math.max(cashDiscrepancyPage, 1) - 1) * CASH_DISCREPANCY_PAGE_SIZE;

  container.innerHTML = '<p class="service-assignment-empty">Cargando discrepancias...</p>';
  if (meta) {
    meta.textContent = "Cargando...";
  }
  renderCashPagination(pagination, 1, 1, "admin-discrepancies");

  try {
    const { data, error } = await client.rpc("get_admin_cash_discrepancies", {
      p_status: getAdminCashDiscrepancyStatusFilterValue(cashDiscrepancyFilters.status),
      p_type: getAdminCashDiscrepancyTypeFilterValue(cashDiscrepancyFilters.type),
      p_driver_id: null,
      p_search: cashDiscrepancyFilters.search || null,
      p_limit: CASH_DISCREPANCY_PAGE_SIZE,
      p_offset: offset,
    });

    if (requestId !== adminCashDiscrepancyRequestIdReal) {
      return;
    }

    if (error) {
      throw error;
    }

    adminCashDiscrepancyRowsReal = (Array.isArray(data) ? data : []).map(normalizeAdminCashDiscrepancyListRow);
    adminCashDiscrepancyTotalReal = adminCashDiscrepancyRowsReal.length ? adminCashDiscrepancyRowsReal[0].totalCount : 0;

    const totalPages = Math.max(1, Math.ceil(adminCashDiscrepancyTotalReal / CASH_DISCREPANCY_PAGE_SIZE));

    if (cashDiscrepancyPage > totalPages) {
      cashDiscrepancyPage = totalPages;
      void renderAdminCashDiscrepancies();
      return;
    }

    if (meta) {
      meta.textContent = `${adminCashDiscrepancyTotalReal} resultado${adminCashDiscrepancyTotalReal === 1 ? "" : "s"} - P\u00e1gina ${cashDiscrepancyPage} de ${totalPages}`;
    }

    if (!adminCashDiscrepancyRowsReal.length) {
      container.innerHTML = '<p class="service-assignment-empty">No hay discrepancias para los filtros seleccionados.</p>';
      renderCashPagination(pagination, cashDiscrepancyPage, totalPages, "admin-discrepancies");
      return;
    }

    container.innerHTML = adminCashDiscrepancyRowsReal.map(renderAdminCashDiscrepancyCard).join("");
    renderCashPagination(pagination, cashDiscrepancyPage, totalPages, "admin-discrepancies");
  } catch (error) {
    console.error("[ELARA Cash] No se pudo cargar el listado real de discrepancias.", { error });
    container.innerHTML = `<p class="service-assignment-empty">${escapeCashHtml(formatAdminCashDiscrepancyError(error, "No se pudo cargar el listado de discrepancias."))}</p>`;
    if (meta) {
      meta.textContent = "Error al cargar discrepancias";
    }
    renderCashPagination(pagination, 1, 1, "admin-discrepancies");
  }
}

function normalizeAdminCashDiscrepancyListRow(row) {
  return {
    discrepancyId: String(row?.discrepancy_id || "").trim(),
    humanCode: String(row?.human_code || "").trim(),
    discrepancyType: String(row?.discrepancy_type || "").trim(),
    status: String(row?.status || "").trim(),
    expectedAmount: roundCashAmount(row?.expected_amount),
    actualAmount: roundCashAmount(row?.actual_amount),
    differenceAmount: roundCashAmount(row?.difference_amount),
    currencyCode: String(row?.currency_code || financeData.cashSettings?.currency || "EUR").trim() || "EUR",
    reasonCode: String(row?.reason_code || "").trim(),
    reasonDetails: String(row?.reason_details || "").trim(),
    openedAt: row?.opened_at || "",
    createdAt: row?.created_at || "",
    remittanceId: String(row?.remittance_id || "").trim(),
    remittanceHumanCode: String(row?.remittance_human_code || "").trim(),
    cashCountId: String(row?.cash_count_id || "").trim(),
    cashCountHumanCode: String(row?.cash_count_human_code || "").trim(),
    driverId: String(row?.driver_id || "").trim(),
    driverHumanCode: String(row?.driver_human_code || "").trim(),
    driverName: String(row?.driver_name || "").trim(),
    totalCount: Number(row?.total_count) || 0,
  };
}

function renderAdminCashDiscrepancyCard(discrepancy) {
  const origin = formatAdminCashDiscrepancyOrigin(discrepancy);
  const driver = formatAdminCashDriverLabel(discrepancy);
  const reason = formatAdminCashDiscrepancyReason(discrepancy);

  return `
    <article class="cash-row cash-row--history">
      <div>
        <strong>${escapeCashHtml(discrepancy.humanCode || discrepancy.discrepancyId)}</strong>
        <span>${escapeCashHtml(getAdminCashDiscrepancyStatusLabel(discrepancy.status))} - ${escapeCashHtml(getAdminCashDiscrepancyTypeLabel(discrepancy.discrepancyType))} - ${escapeCashHtml(origin)}</span>
        <small>${escapeCashHtml(driver)}</small>
        <small>${escapeCashHtml(reason)}</small>
        <small>${escapeCashHtml(formatCashDateTime(discrepancy.createdAt || discrepancy.openedAt))}</small>
      </div>
      <div class="cash-discrepancy-amounts">
        <span>Esperado: ${escapeCashHtml(formatAdminCashMoney(discrepancy.expectedAmount, discrepancy.currencyCode))}</span>
        <span>Real: ${escapeCashHtml(formatAdminCashMoney(discrepancy.actualAmount, discrepancy.currencyCode))}</span>
        <strong>${escapeCashHtml(formatAdminCashDiscrepancyDifference(discrepancy.differenceAmount, discrepancy.currencyCode))}</strong>
      </div>
      <span class="cash-row__status">${escapeCashHtml(getAdminCashDiscrepancyStatusLabel(discrepancy.status))}</span>
      <button class="button button--compact button--muted" type="button" data-cash-discrepancy-detail="${escapeCashHtml(discrepancy.discrepancyId)}">Detalle</button>
    </article>
  `;
}

async function openAdminCashDiscrepancyDetail(discrepancyId, options = {}) {
  const id = String(discrepancyId || "").trim();
  const client = getAdminCashSupabaseClient();

  if (!id) {
    notifyCash("Selecciona una discrepancia v\u00e1lida.", "warning");
    return;
  }

  if (!client) {
    notifyCash("No se pudo conectar con Supabase para cargar el detalle real.", "error");
    return;
  }

  selectedAdminCashDiscrepancyIdReal = id;
  adminCashDiscrepancyDetailReal = null;

  try {
    const { data, error } = await client.rpc("get_admin_cash_discrepancy_detail", { p_discrepancy_id: id });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Cash discrepancy was not found.");
    }

    adminCashDiscrepancyDetailReal = normalizeAdminCashDiscrepancyDetail(row);
    selectedAdminCashDiscrepancyIdReal = adminCashDiscrepancyDetailReal.discrepancyId;
    renderAdminCashDiscrepancyDetail(adminCashDiscrepancyDetailReal);

    if (!options.keepOpen) {
      openCashModal("cash-discrepancy-detail-modal");
    }
  } catch (error) {
    selectedAdminCashDiscrepancyIdReal = "";
    adminCashDiscrepancyDetailReal = null;
    console.error("[ELARA Cash] No se pudo cargar el detalle real de la discrepancia.", { error });
    notifyCash(formatAdminCashDiscrepancyError(error, "No se pudo cargar el detalle de la discrepancia."), "error");
  }
}

function normalizeAdminCashDiscrepancyDetail(row) {
  return {
    ...normalizeAdminCashDiscrepancyListRow(row),
    updatedAt: row?.updated_at || "",
    resolvedAt: row?.resolved_at || "",
    cancelledAt: row?.cancelled_at || "",
    resolutionNotes: String(row?.resolution_notes || "").trim(),
    resolvedBy: String(row?.resolved_by || "").trim(),
    resolvedByHumanCode: String(row?.resolved_by_human_code || "").trim(),
    resolvedByName: String(row?.resolved_by_name || "").trim(),
    cancelledBy: String(row?.cancelled_by || "").trim(),
    cancelledByHumanCode: String(row?.cancelled_by_human_code || "").trim(),
    cancelledByName: String(row?.cancelled_by_name || "").trim(),
    remittanceStatus: String(row?.remittance_status || "").trim(),
    remittanceDeclaredAmount: row?.remittance_declared_amount == null ? null : roundCashAmount(row.remittance_declared_amount),
    remittanceVerifiedAmount: row?.remittance_verified_amount == null ? null : roundCashAmount(row.remittance_verified_amount),
    cashAccountId: String(row?.cash_account_id || "").trim(),
    cashAccountHumanCode: String(row?.cash_account_human_code || "").trim(),
    cashAccountName: String(row?.cash_account_name || "").trim(),
    cashAccountType: String(row?.cash_account_type || "").trim(),
  };
}

function renderAdminCashDiscrepancyDetailLoading(discrepancyId) {
  const body = cashGetElement("cash-discrepancy-detail-body");
  const actions = cashGetElement("cash-discrepancy-detail-actions");

  if (body) {
    body.innerHTML = `<p class="service-assignment-empty">Cargando ${escapeCashHtml(discrepancyId)}...</p>`;
  }

  if (actions) {
    actions.innerHTML = "";
  }
}

function renderAdminCashDiscrepancyDetailError(message) {
  const body = cashGetElement("cash-discrepancy-detail-body");
  const actions = cashGetElement("cash-discrepancy-detail-actions");

  if (body) {
    body.innerHTML = `<p class="service-assignment-empty">${escapeCashHtml(message)}</p>`;
  }

  if (actions) {
    actions.innerHTML = "";
  }
}

function renderAdminCashDiscrepancyDetail(detail) {
  const body = cashGetElement("cash-discrepancy-detail-body");

  if (!body) {
    return;
  }

  const relationFields = detail.discrepancyType === "remittance"
    ? [
        renderAdminCashDiscrepancyField("Rendici\u00f3n", detail.remittanceHumanCode),
        renderAdminCashDiscrepancyField("Estado rendici\u00f3n", getCashRemittanceStatus({ status: detail.remittanceStatus })),
        renderAdminCashDiscrepancyField("Declarado", detail.remittanceDeclaredAmount == null ? "" : formatAdminCashMoney(detail.remittanceDeclaredAmount, detail.currencyCode)),
        renderAdminCashDiscrepancyField("Verificado", detail.remittanceVerifiedAmount == null ? "" : formatAdminCashMoney(detail.remittanceVerifiedAmount, detail.currencyCode)),
      ].join("")
    : [renderAdminCashDiscrepancyField("Arqueo", detail.cashCountHumanCode)].join("");
  const resolutionFields = [
    renderAdminCashDiscrepancyField("Notas", detail.resolutionNotes, { wide: true }),
    renderAdminCashDiscrepancyField("Resuelta el", detail.resolvedAt ? formatCashDateTime(detail.resolvedAt) : ""),
    renderAdminCashDiscrepancyField("Resuelta por", formatAdminCashActorLabel(detail.resolvedByName, detail.resolvedByHumanCode)),
    renderAdminCashDiscrepancyField("Cancelada el", detail.cancelledAt ? formatCashDateTime(detail.cancelledAt) : ""),
    renderAdminCashDiscrepancyField("Cancelada por", formatAdminCashActorLabel(detail.cancelledByName, detail.cancelledByHumanCode)),
  ].join("");

  body.innerHTML = `
    <section class="service-summary__section">
      <h3>Identificaci\u00f3n</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Codigo", detail.humanCode || detail.discrepancyId)}
        ${renderAdminCashDiscrepancyField("Estado", getAdminCashDiscrepancyStatusLabel(detail.status))}
        ${renderAdminCashDiscrepancyField("Tipo", getAdminCashDiscrepancyTypeLabel(detail.discrepancyType))}
      </dl>
    </section>
    <section class="service-summary__section">
      <h3>Importes</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Esperado", formatAdminCashMoney(detail.expectedAmount, detail.currencyCode))}
        ${renderAdminCashDiscrepancyField("Real", formatAdminCashMoney(detail.actualAmount, detail.currencyCode))}
        ${renderAdminCashDiscrepancyField("Diferencia", formatAdminCashDiscrepancyDifference(detail.differenceAmount, detail.currencyCode))}
        ${renderAdminCashDiscrepancyField("Moneda", detail.currencyCode)}
      </dl>
    </section>
    <section class="service-summary__section">
      <h3>Motivo</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Origen", getAdminCashDiscrepancyReasonLabel(detail.reasonCode))}
        ${renderAdminCashDiscrepancyField("Descripci\u00f3n", detail.reasonDetails, { wide: true })}
      </dl>
    </section>
    <section class="service-summary__section">
      <h3>Relacion</h3>
      <dl class="modal__fields-grid">${relationFields || renderAdminCashDiscrepancyField("Relacion", "-")}</dl>
    </section>
    <section class="service-summary__section">
      <h3>Conductor</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Conductor", formatAdminCashDriverLabel(detail))}
      </dl>
    </section>
    <section class="service-summary__section">
      <h3>Cuenta</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Cuenta", formatAdminCashAccountLabel(detail.cashAccountName, detail.cashAccountType))}
      </dl>
    </section>
    <section class="service-summary__section">
      <h3>Fechas</h3>
      <dl class="modal__fields-grid">
        ${renderAdminCashDiscrepancyField("Apertura", detail.openedAt ? formatCashDateTime(detail.openedAt) : "")}
        ${renderAdminCashDiscrepancyField("Creaci\u00f3n", detail.createdAt ? formatCashDateTime(detail.createdAt) : "")}
        ${renderAdminCashDiscrepancyField("Actualizaci\u00f3n", detail.updatedAt ? formatCashDateTime(detail.updatedAt) : "")}
      </dl>
    </section>
    ${resolutionFields ? `<section class="service-summary__section"><h3>Resoluci\u00f3n</h3><dl class="modal__fields-grid">${resolutionFields}</dl></section>` : ""}
  `;

  renderAdminCashDiscrepancyDetailActions(detail);
}

function renderAdminCashDiscrepancyField(label, value, options = {}) {
  const text = String(value ?? "").trim();

  if (!text || text === "-") {
    return "";
  }

  return `<div class="modal__field${options.wide ? " modal__field--wide" : ""}"><dt class="modal__field-label">${escapeCashHtml(label)}</dt><dd class="modal__field-value">${escapeCashHtml(text)}</dd></div>`;
}

function renderAdminCashDiscrepancyDetailActions(detail) {
  const actions = cashGetElement("cash-discrepancy-detail-actions");

  if (!actions) {
    return;
  }

  const canMutate = ["open", "under_review"].includes(detail.status);
  const buttons = [];

  if (detail.status === "open") {
    buttons.push('<button class="button button--compact button--muted" type="button" data-cash-admin-discrepancy-action="review">Pasar a revisi\u00f3n</button>');
  }

  if (canMutate) {
    buttons.push('<button class="button button--compact" type="button" data-cash-admin-discrepancy-action="resolve">Resolver</button>');
  }

  if (canMutate && isCurrentCashSuperadmin()) {
    buttons.push('<button class="button button--compact button--danger" type="button" data-cash-admin-discrepancy-action="cancel">Cancelar</button>');
  }

  actions.innerHTML = buttons.join("");
}

function openAdminCashDiscrepancyActionModal(action) {
  const detail = adminCashDiscrepancyDetailReal;
  const normalizedAction = String(action || "").trim();

  if (!detail) {
    notifyCash("Carga primero el detalle de la discrepancia.", "warning");
    return;
  }

  if (!["open", "under_review"].includes(detail.status)) {
    notifyCash("Esta discrepancia ya esta cerrada.", "warning");
    return;
  }

  if (normalizedAction === "review" && detail.status !== "open") {
    notifyCash("Solo las discrepancias abiertas pueden pasar a revisi\u00f3n.", "warning");
    return;
  }

  if (normalizedAction === "cancel" && !isCurrentCashSuperadmin()) {
    notifyCash("Solo Superadmin puede cancelar discrepancias.", "error");
    return;
  }

  const titleByAction = {
    review: "Pasar a revisi\u00f3n",
    resolve: "Resolver discrepancia",
    cancel: "Cancelar discrepancia",
  };
  const summaryByAction = {
    review: `Se pasar\u00e1 ${detail.humanCode || "la discrepancia"} a revisi\u00f3n.`,
    resolve: `Se resolver\u00e1 ${detail.humanCode || "la discrepancia"}.`,
    cancel: `Se cancelar\u00e1 ${detail.humanCode || "la discrepancia"}.`,
  };

  if (!titleByAction[normalizedAction]) {
    return;
  }

  pendingAdminCashDiscrepancyActionReal = { type: normalizedAction, discrepancyId: detail.discrepancyId };
  cashSetText("cash-discrepancy-action-title", titleByAction[normalizedAction]);
  cashSetText("cash-discrepancy-action-summary", summaryByAction[normalizedAction]);
  cashSetText("cash-discrepancy-action-error", "");
  setElementVisibility("cash-discrepancy-action-error", false);

  const notesField = cashGetElement("cash-discrepancy-action-notes-field");
  const notesLabel = cashGetElement("cash-discrepancy-action-notes-label");
  const notesInput = cashGetElement("cash-discrepancy-action-notes");
  const confirmButton = cashGetElement("cash-discrepancy-action-confirm");

  if (notesField) {
    notesField.hidden = normalizedAction === "review";
  }

  if (notesLabel) {
    notesLabel.textContent = normalizedAction === "cancel" ? "Motivo de cancelaci\u00f3n" : "Notas de resoluci\u00f3n";
  }

  if (notesInput) {
    notesInput.value = "";
    notesInput.required = normalizedAction !== "review";
    notesInput.maxLength = 1000;
  }

  if (confirmButton) {
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirmar";
  }

  openCashModal("cash-discrepancy-action-modal");
}

function closeAdminCashDiscrepancyActionModal() {
  pendingAdminCashDiscrepancyActionReal = null;
  isAdminCashDiscrepancyActionRunningReal = false;
  closeCashModal(cashGetElement("cash-discrepancy-action-modal"));
}

async function executePendingAdminCashDiscrepancyAction() {
  const client = getAdminCashSupabaseClient();
  const action = pendingAdminCashDiscrepancyActionReal;
  const actionButton = cashGetElement("cash-discrepancy-action-confirm");
  const errorElement = cashGetElement("cash-discrepancy-action-error");

  if (!client || !action || isAdminCashDiscrepancyActionRunningReal) {
    return;
  }

  const notes = cashGetInputValue("cash-discrepancy-action-notes");

  if (["resolve", "cancel"].includes(action.type) && !notes) {
    const message = action.type === "cancel" ? "El motivo de cancelacion es obligatorio." : "Las notas de resolucion son obligatorias.";
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
    notifyCash(message, "warning");
    return;
  }

  if (notes.length > 1000) {
    const message = "El texto no puede superar 1000 caracteres.";
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
    notifyCash(message, "warning");
    return;
  }

  isAdminCashDiscrepancyActionRunningReal = true;

  if (actionButton) {
    actionButton.disabled = true;
    actionButton.textContent = "Procesando...";
  }

  try {
    const rpcByAction = {
      review: "review_cash_discrepancy",
      resolve: "resolve_cash_discrepancy",
      cancel: "cancel_cash_discrepancy",
    };
    const argsByAction = {
      review: { p_discrepancy_id: action.discrepancyId },
      resolve: { p_discrepancy_id: action.discrepancyId, p_resolution_notes: notes },
      cancel: { p_discrepancy_id: action.discrepancyId, p_reason: notes },
    };
    const { error } = await client.rpc(rpcByAction[action.type], argsByAction[action.type]);

    if (error) {
      throw error;
    }

    const toastByAction = {
      review: "Discrepancia pasada a revisi\u00f3n.",
      resolve: "Discrepancia resuelta correctamente.",
      cancel: "Discrepancia cancelada.",
    };

    closeAdminCashDiscrepancyActionModal();
    notifyCash(toastByAction[action.type], "success");
    void renderAdminCashDiscrepancies();
    await openAdminCashDiscrepancyDetail(action.discrepancyId, { keepOpen: true });
  } catch (error) {
    const message = formatAdminCashDiscrepancyError(error, "No se pudo completar la acci\u00f3n sobre la discrepancia.");
    console.error("[ELARA Cash] Error en acci\u00f3n real de discrepancia.", { error, action });
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
    notifyCash(message, "error");
  } finally {
    isAdminCashDiscrepancyActionRunningReal = false;
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.textContent = "Confirmar";
    }
  }
}

function getAdminCashDiscrepancyTypeLabel(type) {
  const normalizedType = String(type || "").trim();

  if (Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_TYPE_LABELS_REAL, normalizedType)) {
    return ADMIN_CASH_DISCREPANCY_TYPE_LABELS_REAL[normalizedType];
  }

  return normalizedType || "Sin tipo";
}

function getAdminCashDiscrepancyReasonLabel(reasonCode) {
  const normalizedReason = String(reasonCode || "").trim();

  if (Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_REASON_LABELS_REAL, normalizedReason)) {
    return ADMIN_CASH_DISCREPANCY_REASON_LABELS_REAL[normalizedReason];
  }

  return normalizedReason ? normalizedReason.replace(/_/g, " ") : "Sin motivo";
}

function formatAdminCashDiscrepancyReason(discrepancy) {
  return discrepancy.reasonDetails || getAdminCashDiscrepancyReasonLabel(discrepancy.reasonCode);
}

function formatAdminCashDiscrepancyOrigin(discrepancy) {
  if (discrepancy.discrepancyType === "remittance") {
    return discrepancy.remittanceHumanCode ? `Rendici\u00f3n ${discrepancy.remittanceHumanCode}` : "Rendici\u00f3n";
  }

  if (discrepancy.discrepancyType === "cash_count") {
    return discrepancy.cashCountHumanCode ? `Arqueo ${discrepancy.cashCountHumanCode}` : "Arqueo";
  }

  return "Sin relacion";
}

function formatAdminCashDiscrepancyDifference(value, currencyCode) {
  const amount = roundCashAmount(value);

  if (amount < 0) {
    return `Faltante: ${formatAdminCashMoney(Math.abs(amount), currencyCode)}`;
  }

  if (amount > 0) {
    return `Excedente: ${formatAdminCashMoney(amount, currencyCode)}`;
  }

  return "Sin diferencia cuantificada";
}

function formatAdminCashDiscrepancyError(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "").trim();

  if (code === "42501" || /permission|not authorized|require_admin_user|require_superadmin_user|No tienes permiso/i.test(message)) {
    return "No tienes permiso para operar discrepancias de caja.";
  }

  if (["23502", "23503", "23514", "40001", "P0002"].includes(code) && message) {
    return message;
  }

  return message || fallbackMessage;
}
async function renderCashRemittanceHistory() {
  const container = cashGetElement("cash-remittance-history-list");
  const meta = cashGetElement("cash-remittance-history-meta");
  const pagination = cashGetElement("cash-remittance-history-pagination");

  if (!container) {
    return;
  }

  ensureAdminCashRemittanceRealUi();
  syncCashRemittanceHistoryFiltersToDom();

  const client = getAdminCashSupabaseClient();

  if (!client) {
    container.innerHTML = '<p class="service-assignment-empty">No se pudo conectar con Supabase para cargar rendiciones reales.</p>';
    if (meta) {
      meta.textContent = "Sin conexi\u00f3n a datos reales";
    }
    renderCashPagination(pagination, 1, 1, "admin-remittances");
    return;
  }

  const requestId = ++adminCashRemittanceHistoryRequestIdReal;
  const offset = (Math.max(cashRemittanceHistoryPage, 1) - 1) * CASH_REMITTANCE_HISTORY_PAGE_SIZE;

  container.innerHTML = '<p class="service-assignment-empty">Cargando rendiciones...</p>';
  if (meta) {
    meta.textContent = "Cargando...";
  }
  renderCashPagination(pagination, 1, 1, "admin-remittances");

  try {
    const { data, error } = await client.rpc("get_admin_cash_remittances", {
      p_status: getAdminCashRemittanceStatusFilterValue(cashRemittanceHistoryFilters.status),
      p_driver_id: isCashUuid(cashRemittanceHistoryFilters.driverId) ? cashRemittanceHistoryFilters.driverId : null,
      p_search: cashRemittanceHistoryFilters.remittanceId || null,
      p_limit: CASH_REMITTANCE_HISTORY_PAGE_SIZE,
      p_offset: offset,
    });

    if (requestId !== adminCashRemittanceHistoryRequestIdReal) {
      return;
    }

    if (error) {
      throw error;
    }

    adminCashRemittanceHistoryRowsReal = (Array.isArray(data) ? data : []).map(normalizeAdminCashRemittanceListRow);
    adminCashRemittanceHistoryTotalReal = adminCashRemittanceHistoryRowsReal.length ? adminCashRemittanceHistoryRowsReal[0].totalCount : 0;

    const totalPages = Math.max(1, Math.ceil(adminCashRemittanceHistoryTotalReal / CASH_REMITTANCE_HISTORY_PAGE_SIZE));

    if (cashRemittanceHistoryPage > totalPages) {
      cashRemittanceHistoryPage = totalPages;
      void renderCashRemittanceHistory();
      return;
    }

    if (meta) {
      meta.textContent = `${adminCashRemittanceHistoryTotalReal} resultado${adminCashRemittanceHistoryTotalReal === 1 ? "" : "s"} - P\u00e1gina ${cashRemittanceHistoryPage} de ${totalPages}`;
    }

    if (!adminCashRemittanceHistoryRowsReal.length) {
      container.innerHTML = '<p class="service-assignment-empty">No hay rendiciones para los filtros seleccionados.</p>';
      renderCashPagination(pagination, cashRemittanceHistoryPage, totalPages, "admin-remittances");
      return;
    }

    container.innerHTML = adminCashRemittanceHistoryRowsReal.map(renderAdminCashRemittanceHistoryCard).join("");
    renderCashPagination(pagination, cashRemittanceHistoryPage, totalPages, "admin-remittances");
  } catch (error) {
    console.error("[ELARA Cash] No se pudo cargar el historial real de rendiciones.", { error });
    container.innerHTML = `<p class="service-assignment-empty">${escapeCashHtml(formatAdminCashRemittanceError(error, "No se pudo cargar el historial de rendiciones."))}</p>`;
    if (meta) {
      meta.textContent = "Error al cargar rendiciones";
    }
    renderCashPagination(pagination, 1, 1, "admin-remittances");
  }
}

function getAdminCashRemittanceStatusFilterValue(value) {
  const status = String(value || "").trim();

  return Object.prototype.hasOwnProperty.call(ADMIN_CASH_REMITTANCE_STATUS_LABELS_REAL, status) ? status : null;
}

function normalizeAdminCashRemittanceListRow(row) {
  return {
    remittanceId: String(row?.remittance_id || "").trim(),
    humanCode: String(row?.human_code || "").trim(),
    status: String(row?.status || "").trim(),
    driverId: String(row?.driver_id || "").trim(),
    driverHumanCode: String(row?.driver_human_code || "").trim(),
    driverName: String(row?.driver_name || "").trim(),
    sourceCashAccountName: String(row?.source_cash_account_name || "").trim(),
    sourceCashAccountType: String(row?.source_cash_account_type || "").trim(),
    destinationCashAccountName: String(row?.destination_cash_account_name || "").trim(),
    destinationCashAccountType: String(row?.destination_cash_account_type || "").trim(),
    currencyCode: String(row?.currency_code || financeData.cashSettings?.currency || "EUR").trim() || "EUR",
    declaredAmount: roundCashAmount(row?.declared_amount),
    verifiedAmount: row?.verified_amount == null ? null : roundCashAmount(row.verified_amount),
    submittedAt: row?.submitted_at || "",
    receivedAt: row?.received_at || "",
    verifiedAt: row?.verified_at || "",
    cancelledAt: row?.cancelled_at || "",
    createdAt: row?.created_at || "",
    openDiscrepancyCount: Number(row?.open_discrepancy_count) || 0,
    openDifferenceAmount: roundCashAmount(row?.open_difference_amount),
    totalCount: Number(row?.total_count) || 0,
  };
}

function renderAdminCashRemittanceHistoryCard(remittance) {
  const date = remittance.submittedAt || remittance.createdAt;
  const accountText = `${formatAdminCashAccountLabel(remittance.sourceCashAccountName, remittance.sourceCashAccountType)} -> ${formatAdminCashAccountLabel(remittance.destinationCashAccountName, remittance.destinationCashAccountType)}`;
  const discrepancyText = remittance.openDiscrepancyCount > 0
    ? `<small>Discrepancias abiertas: ${escapeCashHtml(remittance.openDiscrepancyCount)} - ${escapeCashHtml(formatAdminCashMoney(remittance.openDifferenceAmount, remittance.currencyCode))}</small>`
    : "";

  return `
    <article class="cash-row cash-row--history">
      <div>
        <strong>${escapeCashHtml(remittance.humanCode || remittance.remittanceId)}</strong>
        <span>${escapeCashHtml(formatCashDateTime(date))} - ${escapeCashHtml(formatAdminCashDriverLabel(remittance))}</span>
        <small>${escapeCashHtml(accountText)}</small>
        ${discrepancyText}
      </div>
      <strong class="cash-row__amount cash-row__amount--in">${escapeCashHtml(formatAdminCashMoney(remittance.declaredAmount, remittance.currencyCode))}</strong>
      <span class="cash-row__status">${escapeCashHtml(getCashRemittanceStatus(remittance))}</span>
      <button class="button button--compact button--muted" type="button" data-cash-remittance-detail="${escapeCashHtml(remittance.remittanceId)}">Detalle</button>
    </article>
  `;
}

async function openCashRemittanceDetail(remittanceId, options = {}) {
  const id = String(remittanceId || "").trim();
  const client = getAdminCashSupabaseClient();

  ensureAdminCashRemittanceRealUi();

  if (!id) {
    notifyCash("Selecciona una rendici\u00f3n v\u00e1lida.", "warning");
    return;
  }

  if (!client) {
    notifyCash("No se pudo conectar con Supabase para cargar el detalle real.", "error");
    return;
  }

  selectedCashRemittanceId = id;
  adminCashRemittanceDetailReal = null;
  renderAdminCashRemittanceDetailLoading(id);

  if (!options.keepOpen) {
    openCashModal("cash-remittance-detail-modal");
  }

  try {
    const { data, error } = await client.rpc("get_admin_cash_remittance_detail", { p_remittance_id: id });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Cash remittance was not found.");
    }

    adminCashRemittanceDetailReal = normalizeAdminCashRemittanceDetail(row);
    selectedCashRemittanceId = adminCashRemittanceDetailReal.remittanceId;
    renderAdminCashRemittanceDetail(adminCashRemittanceDetailReal);
  } catch (error) {
    console.error("[ELARA Cash] No se pudo cargar el detalle real de la rendici\u00f3n.", { error });
    renderAdminCashRemittanceDetailError(formatAdminCashRemittanceError(error, "No se pudo cargar el detalle de la rendici\u00f3n."));
  }
}

function normalizeAdminCashRemittanceDetail(row) {
  return {
    ...normalizeAdminCashRemittanceListRow(row),
    notes: String(row?.notes || "").trim(),
    cancellationReason: String(row?.cancellation_reason || "").trim(),
    submittedByDriverHumanCode: String(row?.submitted_by_driver_human_code || "").trim(),
    submittedByDriverName: String(row?.submitted_by_driver_name || "").trim(),
    preparedByUserHumanCode: String(row?.prepared_by_user_human_code || "").trim(),
    preparedByUserName: String(row?.prepared_by_user_name || "").trim(),
    cancelledByUserHumanCode: String(row?.cancelled_by_user_human_code || "").trim(),
    cancelledByUserName: String(row?.cancelled_by_user_name || "").trim(),
    items: parseAdminCashJsonArray(row?.items).map(normalizeAdminCashRemittanceItem),
    discrepancies: parseAdminCashJsonArray(row?.discrepancies).map(normalizeAdminCashDiscrepancy),
  };
}

function normalizeAdminCashRemittanceItem(item) {
  return {
    cashMovementHumanCode: String(item?.cash_movement_human_code || "").trim(),
    servicePaymentHumanCode: String(item?.service_payment_human_code || "").trim(),
    serviceHumanCode: String(item?.service_human_code || "").trim(),
    amount: roundCashAmount(item?.amount),
    description: String(item?.description || "").trim(),
  };
}

function normalizeAdminCashDiscrepancy(discrepancy) {
  return {
    humanCode: String(discrepancy?.human_code || "").trim(),
    status: String(discrepancy?.status || "").trim(),
    reasonCode: String(discrepancy?.reason_code || "").trim(),
    reasonDetails: String(discrepancy?.reason_details || "").trim(),
    differenceAmount: roundCashAmount(discrepancy?.difference_amount),
  };
}

function parseAdminCashJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[ELARA Cash] JSON de detalle de rendici\u00f3n inv\u00e1lido.", { error });
    }
  }

  return [];
}

function renderAdminCashRemittanceDetailLoading(remittanceId) {
  cashSetText("cash-remittance-detail-id", remittanceId);
  cashSetText("cash-remittance-detail-date", "Cargando...");
  cashSetText("cash-remittance-detail-collector", "Cargando...");
  cashSetText("cash-remittance-detail-amount", "Cargando...");
  cashSetText("cash-remittance-detail-registered-by", "Cargando...");
  cashSetText("cash-remittance-detail-status", "Cargando...");
  cashSetText("cash-remittance-detail-difference", "Cargando...");
  cashSetText("cash-remittance-detail-notes", "Cargando...");
  cashSetText("cash-remittance-detail-voided-at", "-");
  cashSetText("cash-remittance-detail-voided-by", "-");
  cashSetText("cash-remittance-detail-void-reason", "-");
  renderAdminCashRemittanceDetailExtra({ loading: true });
  setElementVisibility("cash-remittance-void-action", false);
  setElementVisibility("cash-remittance-receive-section", false);
  setElementVisibility("cash-remittance-receive-action", false);
  setElementVisibility("cash-remittance-verify-action", false);
}

function renderAdminCashRemittanceDetailError(message) {
  renderAdminCashRemittanceDetailExtra({ error: message });
  setElementVisibility("cash-remittance-void-action", false);
  setElementVisibility("cash-remittance-receive-section", false);
  setElementVisibility("cash-remittance-receive-action", false);
  setElementVisibility("cash-remittance-verify-action", false);
}

function renderAdminCashRemittanceDetail(detail) {
  const actorLabel = formatAdminCashActorLabel(detail.submittedByDriverName, detail.submittedByDriverHumanCode) || formatAdminCashActorLabel(detail.preparedByUserName, detail.preparedByUserHumanCode) || "-";

  cashSetText("cash-remittance-detail-id", detail.humanCode || detail.remittanceId);
  cashSetText("cash-remittance-detail-date", formatCashDateTime(detail.submittedAt || detail.createdAt));
  cashSetText("cash-remittance-detail-collector", formatAdminCashDriverLabel(detail));
  cashSetText("cash-remittance-detail-amount", formatAdminCashMoney(detail.declaredAmount, detail.currencyCode));
  cashSetText("cash-remittance-detail-registered-by", actorLabel);
  cashSetText("cash-remittance-detail-status", getCashRemittanceStatus(detail));
  cashSetText("cash-remittance-detail-difference", formatAdminCashRemittanceDifference(detail));
  cashSetText("cash-remittance-detail-notes", detail.notes || "Sin observaciones");
  cashSetText("cash-remittance-detail-voided-at", detail.cancelledAt ? formatCashDateTime(detail.cancelledAt) : "-");
  cashSetText("cash-remittance-detail-voided-by", formatAdminCashActorLabel(detail.cancelledByUserName, detail.cancelledByUserHumanCode) || "-");
  cashSetText("cash-remittance-detail-void-reason", detail.cancellationReason || "-");
  setElementVisibility("cash-remittance-void-action", false);
  renderAdminCashRemittanceDetailExtra(detail);
  renderAdminCashRemittanceDetailActions(detail);
}

function renderAdminCashRemittanceDetailExtra(detail) {
  const container = cashGetElement("cash-remittance-detail-real-content");

  if (!container) {
    return;
  }

  if (detail?.loading) {
    container.innerHTML = '<p class="service-assignment-empty">Cargando detalle real...</p>';
    return;
  }

  if (detail?.error) {
    container.innerHTML = `<p class="service-assignment-empty">${escapeCashHtml(detail.error)}</p>`;
    return;
  }

  const itemRows = detail.items.length
    ? detail.items.map((item) => `
        <article class="cash-row cash-row--history">
          <div>
            <strong>${escapeCashHtml(item.cashMovementHumanCode || item.servicePaymentHumanCode || item.serviceHumanCode || "Movimiento")}</strong>
            <span>${escapeCashHtml([item.serviceHumanCode ? `Servicio ${item.serviceHumanCode}` : "", item.description || ""].filter(Boolean).join(" - ") || "Efectivo rendido")}</span>
          </div>
          <strong class="cash-row__amount cash-row__amount--in">${escapeCashHtml(formatAdminCashMoney(item.amount, detail.currencyCode))}</strong>
        </article>
      `).join("")
    : '<p class="service-assignment-empty">Sin movimientos asociados.</p>';
  const discrepancyRows = detail.discrepancies.length
    ? detail.discrepancies.map((discrepancy) => `
        <article class="cash-row cash-row--history">
          <div>
            <strong>${escapeCashHtml(discrepancy.humanCode || "Discrepancia")}</strong>
            <span>${escapeCashHtml(getAdminCashDiscrepancyStatusLabel(discrepancy.status))} - ${escapeCashHtml(discrepancy.reasonDetails || discrepancy.reasonCode || "Sin detalle")}</span>
          </div>
          <strong>${escapeCashHtml(formatAdminCashMoney(discrepancy.differenceAmount, detail.currencyCode))}</strong>
        </article>
      `).join("")
    : '<p class="service-assignment-empty">Sin discrepancias registradas.</p>';

  container.innerHTML = `
    <section class="service-summary__section">
      <h3>Cuentas</h3>
      <p class="modal__hint">Origen: ${escapeCashHtml(formatAdminCashAccountLabel(detail.sourceCashAccountName, detail.sourceCashAccountType))} - Destino: ${escapeCashHtml(formatAdminCashAccountLabel(detail.destinationCashAccountName, detail.destinationCashAccountType))}</p>
    </section>
    <section class="service-summary__section">
      <h3>Movimientos rendidos</h3>
      <div class="cash-list">${itemRows}</div>
    </section>
    <section class="service-summary__section">
      <h3>Discrepancias</h3>
      <div class="cash-list">${discrepancyRows}</div>
    </section>
  `;
}

function renderAdminCashRemittanceDetailActions(detail) {
  ensureAdminCashRemittanceRealUi();

  const receiveSection = cashGetElement("cash-remittance-receive-section");
  const receiveButton = cashGetElement("cash-remittance-receive-action");
  const verifyAction = cashGetElement("cash-remittance-verify-action");
  const verifyInput = cashGetElement("cash-remittance-verify-amount");
  const verifyButton = verifyAction?.querySelector('[data-cash-admin-remittance-action="verify"]');
  const isSubmitted = detail.status === "submitted";
  const isReceived = detail.status === "received";

  if (receiveSection) {
    receiveSection.hidden = !isSubmitted;
  }

  if (receiveButton) {
    receiveButton.hidden = !isSubmitted;
    receiveButton.disabled = false;
  }

  if (verifyAction) {
    verifyAction.hidden = !isReceived;
  }

  if (verifyButton) {
    verifyButton.hidden = !isReceived;
    verifyButton.disabled = false;
  }

  if (verifyInput) {
    verifyInput.value = isReceived ? String(roundCashAmount(detail.declaredAmount).toFixed(2)) : "";
  }
}
function handleAdminCashRemittanceRealDocumentClick(event) {
  const confirmModal = event.target.closest("#cash-remittance-admin-confirm-modal");

  if (confirmModal && (event.target.closest("[data-modal-close]") || event.target === confirmModal || event.target.closest("#cash-remittance-admin-confirm-cancel"))) {
    closeAdminCashRemittanceConfirmModal();
    return;
  }

  if (event.target.closest("#cash-remittance-admin-confirm-action")) {
    void executePendingAdminCashRemittanceAction();
    return;
  }

  const actionButton = event.target.closest("[data-cash-admin-remittance-action]");

  if (actionButton && !cashGetElement("caja")?.hidden) {
    openAdminCashRemittanceActionConfirmation(actionButton.dataset.cashAdminRemittanceAction || "");
  }
}

function handleAdminCashRemittanceRealKeydown(event) {
  if (event.key === "Escape" && !cashGetElement("cash-remittance-admin-confirm-modal")?.hidden) {
    closeAdminCashRemittanceConfirmModal();
  }
}

function openAdminCashRemittanceActionConfirmation(action) {
  const detail = adminCashRemittanceDetailReal;

  if (!detail) {
    notifyCash("Carga primero el detalle de la rendici\u00f3n.", "warning");
    return;
  }

  if (action === "receive") {
    if (detail.status !== "submitted") {
      notifyCash("Solo se pueden recibir rendiciones enviadas.", "warning");
      return;
    }

    pendingAdminCashRemittanceActionReal = { type: "receive", remittanceId: detail.remittanceId };
    openAdminCashRemittanceConfirmModal("Recibir rendici\u00f3n", `Se marcar\u00e1 ${detail.humanCode || "la rendici\u00f3n"} como recibida por ${formatAdminCashMoney(detail.declaredAmount, detail.currencyCode)}.`);
    return;
  }

  if (action === "verify") {
    if (detail.status !== "received") {
      notifyCash("Solo se pueden verificar rendiciones recibidas.", "warning");
      return;
    }

    const verifiedAmount = getMoneyInput("cash-remittance-verify-amount");

    if (verifiedAmount <= 0) {
      notifyCash("Introduce un importe verificado v\u00e1lido.", "warning");
      return;
    }

    const difference = roundCashAmount(verifiedAmount - detail.declaredAmount);
    let differenceText = "No se registrar\u00e1 diferencia.";

    if (difference < 0) {
      differenceText = `Se registrar\u00e1 un faltante de ${formatAdminCashMoney(Math.abs(difference), detail.currencyCode)} y la discrepancia quedar\u00e1 en revisi\u00f3n.`;
    } else if (difference > 0) {
      differenceText = `Se registrar\u00e1 un excedente de ${formatAdminCashMoney(difference, detail.currencyCode)} y la discrepancia quedar\u00e1 en revisi\u00f3n.`;
    }

    pendingAdminCashRemittanceActionReal = { type: "verify", remittanceId: detail.remittanceId, verifiedAmount };
    openAdminCashRemittanceConfirmModal("Verificar rendici\u00f3n", `Se solicitar\u00e1 verificar ${detail.humanCode || "la rendici\u00f3n"} por ${formatAdminCashMoney(verifiedAmount, detail.currencyCode)}. ${differenceText}`);
  }
}

function openAdminCashRemittanceConfirmModal(title, summary) {
  cashSetText("cash-remittance-admin-confirm-title", title);
  cashSetText("cash-remittance-admin-confirm-summary", summary);
  cashSetText("cash-remittance-admin-confirm-error", "");
  setElementVisibility("cash-remittance-admin-confirm-error", false);

  const actionButton = cashGetElement("cash-remittance-admin-confirm-action");

  if (actionButton) {
    actionButton.disabled = false;
    actionButton.textContent = "Confirmar";
  }

  openCashModal("cash-remittance-admin-confirm-modal");
}

function closeAdminCashRemittanceConfirmModal() {
  pendingAdminCashRemittanceActionReal = null;
  isAdminCashRemittanceActionRunningReal = false;
  closeCashModal(cashGetElement("cash-remittance-admin-confirm-modal"));
}

async function executePendingAdminCashRemittanceAction() {
  const client = getAdminCashSupabaseClient();
  const action = pendingAdminCashRemittanceActionReal;
  const actionButton = cashGetElement("cash-remittance-admin-confirm-action");
  const errorElement = cashGetElement("cash-remittance-admin-confirm-error");

  if (!client || !action || isAdminCashRemittanceActionRunningReal) {
    return;
  }

  isAdminCashRemittanceActionRunningReal = true;

  if (actionButton) {
    actionButton.disabled = true;
    actionButton.textContent = "Procesando...";
  }

  try {
    const rpcName = action.type === "receive" ? "receive_cash_remittance" : "verify_cash_remittance";
    const rpcArgs = action.type === "receive"
      ? { p_remittance_id: action.remittanceId }
      : { p_remittance_id: action.remittanceId, p_verified_amount: action.verifiedAmount };
    const { data, error } = await client.rpc(rpcName, rpcArgs);

    if (error) {
      throw error;
    }

    let notificationMessage = "Rendici\u00f3n recibida correctamente.";
    let notificationType = "success";

    if (action.type === "verify") {
      const row = Array.isArray(data) ? data[0] : data;

      if (!row || row.remittance_id !== action.remittanceId || !["verified", "received"].includes(row.status)) {
        throw Object.assign(new Error("No se pudo confirmar el estado de la rendici\u00f3n devuelto por el servidor."), { response: data });
      }

      const pendingReview = ["open", "under_review"].includes(row.discrepancy_status);
      notificationMessage = row.status === "verified"
        ? "Rendici\u00f3n verificada correctamente."
        : pendingReview
          ? "La rendici\u00f3n qued\u00f3 pendiente de revisi\u00f3n por una diferencia en el importe."
          : "La rendici\u00f3n permanece recibida; no se complet\u00f3 la verificaci\u00f3n.";
      notificationType = row.status === "verified" ? "success" : "warning";

      const difference = Number(row.difference_amount);
      if (row.difference_amount != null && Number.isFinite(difference) && difference !== 0 && row.currency_code) {
        notificationMessage += ` ${formatAdminCashDiscrepancyDifference(difference, row.currency_code)}.`;
      }
      if (Object.prototype.hasOwnProperty.call(ADMIN_CASH_DISCREPANCY_STATUS_LABELS_REAL, row.discrepancy_status)) {
        notificationMessage += ` Discrepancia: ${getAdminCashDiscrepancyStatusLabel(row.discrepancy_status)}.`;
      }
    }

    closeAdminCashRemittanceConfirmModal();
    notifyCash(notificationMessage, notificationType);
    renderCashMovements();
    void renderCashRemittanceHistory();
    await openCashRemittanceDetail(action.remittanceId, { keepOpen: true });
  } catch (error) {
    const message = formatAdminCashRemittanceError(error, "No se pudo completar la acci\u00f3n sobre la rendici\u00f3n.");
    console.error("[ELARA Cash] Error en acci\u00f3n real de rendici\u00f3n.", { error, action });
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
    notifyCash(message, "error");
  } finally {
    isAdminCashRemittanceActionRunningReal = false;
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.textContent = "Confirmar";
    }
  }
}

function formatAdminCashDriverLabel(remittance) {
  const name = String(remittance?.driverName || remittance?.submittedByDriverName || "").trim();
  const code = String(remittance?.driverHumanCode || remittance?.submittedByDriverHumanCode || "").trim();

  return [name || "Conductor", code].filter(Boolean).join(" - ");
}

function formatAdminCashActorLabel(name, humanCode) {
  return [String(name || "").trim(), String(humanCode || "").trim()].filter(Boolean).join(" - ");
}

function formatAdminCashAccountLabel(name, type) {
  return [String(name || "Cuenta").trim(), String(type || "").trim()].filter(Boolean).join(" - ");
}

function formatAdminCashMoney(value, currencyCode) {
  const amount = roundCashAmount(value);
  const currency = String(currencyCode || financeData.cashSettings?.currency || "EUR").trim() || "EUR";

  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
}

function formatAdminCashRemittanceDifference(detail) {
  const verifiedAmount = detail?.verifiedAmount;

  if (verifiedAmount == null) {
    return detail?.openDiscrepancyCount > 0 ? `${detail.openDiscrepancyCount} abierta(s)` : "Sin diferencia";
  }

  const difference = roundCashAmount(verifiedAmount - detail.declaredAmount);

  return difference === 0 ? "Sin diferencia" : formatAdminCashMoney(difference, detail.currencyCode);
}

function formatAdminCashRemittanceError(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "").trim();

  if (code === "42501" || /permission|not authorized|require_admin_user|No tienes permiso/i.test(message)) {
    return "No tienes permiso para operar rendiciones de caja.";
  }

  if (["23502", "23503", "23514", "40001", "P0002"].includes(code) && message) {
    return message;
  }

  return message || fallbackMessage;
}

window.ElaraCash = {
  findCashRemittance,
  formatCashDateTime,
  formatCashMoney,
  getCashDriverPosition,
  getCashOpenFinancialIncidentsForDriver,
  getCashSummary,
  getCashRemittanceStatus,
  getCashRemittancesForDriver,
  getCashRemittanceDifferenceLabel,
  registerExpenseCashOutflow,
  registerReceivableCashEntry,
  registerReceivablePaymentReversal,
  registerSettlementCashOutflow,
  registerSettlementPaymentReversal,
  registerServiceCashPayment,
  rollbackCashMovement,
  validateCashFinancialIntegrity,
  showCash,
};

// Authenticated presentation. No legacy initializer or financial write is enabled here.
let operationalCashElements, operationalCashDialog, operationalCashBound=false;
let operationalCashCurrent=()=>false,operationalCashRefresh;
const operationalCashLabels={inflow:'Ingreso',outflow:'Egreso',driver:'Conductor',central:'Central',administrative:'Administración',temporary:'Temporal',draft:'Borrador',prepared:'Preparada',submitted:'Presentada',received:'Recibida',verified:'Verificada',cancelled:'Anulada',open:'Abierta',under_review:'En revisión',resolved:'Resuelta',counted:'Contado',service_payment:'Cobro de servicio',receivable_payment:'Cobro de cuenta pendiente',cash_remittance:'Rendición',remittance_sent:'Salida por rendición',remittance_received:'Entrada por rendición',expense:'Gasto',expense_payment:'Pago de gasto',settlement:'Liquidación',settlement_payment:'Pago de liquidación',cash_movement_reversal:'Contramovimiento',reversal:'Contramovimiento',opening_balance:'Apertura',manual_adjustment:'Ajuste manual',count_adjustment:'Ajuste por arqueo',other:'Otro',registered:'Registrado'};
const operationalCashLabel=value=>operationalCashLabels[value]||value||'Sin información disponible';
function operationalCashMinor(value) {
  if(value==null||!/^[-]?\d+(?:\.\d{1,2})?$/.test(String(value)))return null;
  const raw=String(value),negative=raw.startsWith('-'),[whole,fraction='']=raw.replace(/^-/,'').split('.');
  return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
}
function operationalCashMoney(value,currency) {
  const amount=typeof value==='bigint'?value:operationalCashMinor(value);
  if(amount===null||!/^[A-Z]{3}$/.test(currency||''))return 'Importe no disponible';
  const absolute=amount<0n?-amount:amount;
  return `${amount<0n?'-':''}${String(absolute/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${String(absolute%100n).padStart(2,'0')} ${currency}`;
}
function operationalCashDate(value,key=false) {
  const date=new Date(value||'');if(!Number.isFinite(date.getTime()))return key?'':'Sin fecha';
  if(key){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}
  return new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(date);
}
function operationalCashScope(){const u=window.ElaraAuth?.getCurrentUser?.();return JSON.stringify([u?.id,u?.supabaseUserId,u?.appSessionId,window.ElaraAuth?.getActiveContext?.(),window.ElaraSupabase?.client?.supabaseUrl]);}
function operationalCashBalance(account,movements) {
  const op=window.ElaraOperationalData;
  if(!op.getCollection('cash_accounts').some(a=>a.id===account.cash_account_id&&a.currency_code===account.currency_code)||!op.isOperationalRecord(account))return null;
  let sum=operationalCashMinor(account.opening_balance);if(sum===null)return null;
  for(const movement of movements.filter(m=>m.cash_account_id===account.cash_account_id)){
    const amount=operationalCashMinor(movement.amount);
    if(!op.isOperationalRecord(movement)||movement.currency_code!==account.currency_code||amount===null||amount<=0n||!['inflow','outflow'].includes(movement.movement_type))return null;
    sum+=movement.movement_type==='inflow'?amount:-amount;
  }
  // Compare a complete ordered ledger with the backend view. A changing or
  // QA-contaminated snapshot never becomes an apparently confirmed balance.
  return operationalCashMinor(account.theoretical_balance)===sum?sum:null;
}
function mountOperationalCash(panel,{controls}) {
  if(!operationalCashElements){const view=document.getElementById('caja');operationalCashElements={summary:view.querySelector('#cash-summary'),layout:view.querySelector('.cash-layout'),create:view.querySelector('#cash-adjustment-open-action')};}
  const {summary,layout}=operationalCashElements;panel.replaceChildren(summary,layout);summary.hidden=layout.hidden=false;summary.setAttribute('data-operational-summary','');
  const movements=layout.querySelector('#cash-movements-list'),section=movements.closest('.cash-panel');movements.setAttribute('data-operational-results','');
  section.querySelector('.panel__eyebrow').textContent='Todas las cuentas';
  section.querySelector('[data-cash-operational-controls]')?.remove();
  const source=document.createElement('div');source.dataset.cashOperationalControls='';source.className='cash-history-controls';source.innerHTML=controls;
  source.querySelector('p').remove();
  source.querySelector('[data-operational-summary]').remove();source.querySelector('[data-operational-results]').remove();
  source.querySelector('[data-operational-search]').closest('label').className='field';
  for(const id of ['data-operational-prev','data-operational-next','data-operational-page','data-operational-detail-content'])source.querySelector(`[${id}]`).remove();
  section.insertBefore(source,movements);
  section.querySelector('[data-cash-operational-footer]')?.remove();section.insertAdjacentHTML('beforeend','<div data-cash-operational-footer><div class="cash-pagination"><p data-operational-page aria-live="polite"></p><button type="button" class="button button--secondary" data-operational-prev>Anterior</button><button type="button" class="button button--secondary" data-operational-next>Siguiente</button></div><div data-operational-detail-content></div></div>');
  section.querySelector('[data-cash-account-balances]')?.remove();section.insertAdjacentHTML('afterbegin','<div class="cash-list" data-cash-account-balances></div>');
  layout.querySelector('#cash-remittance-history-status').innerHTML='<option value="">Todos</option>'+['draft','prepared','submitted','received','verified','cancelled'].map(s=>`<option value="${s}">${operationalCashLabel(s)}</option>`).join('');
  const actions=layout.querySelector('.cash-action-grid');actions.innerHTML='<button type="button" class="button button--muted" disabled>Registrar arqueo</button><div data-cash-operational-admin></div>';
  actions.closest('.cash-panel').querySelector('.modal__hint').textContent='Los cobros, gastos y liquidaciones se registran desde sus módulos. Los movimientos manuales se registran en cuentas centrales o administrativas. Las rendiciones presentadas se reciben y verifican desde su detalle.';
}
function renderOperationalCashMovements(rows) {
  const e=escapeCashHtml;
  return rows.map((r,index)=>`<article class="cash-row" data-operational-cash-id="${e(r.cash_movement_id)}"><div><strong>${e(r.human_code||r.cash_movement_id)} · ${e(r.description||operationalCashLabel(r.movement_category))}</strong><span>${e(operationalCashDate(r.occurred_at))} · ${e(r.cash_account_name||'Cuenta sin nombre')}</span><small>${e(operationalCashLabel(r.movement_type))} registrado · ${e(operationalCashLabel(r.source_type))}${r.original_movement_id?' · Contramovimiento':''}</small></div><strong class="cash-row__amount cash-row__amount--${r.movement_type==='outflow'?'out':'in'}">${r.movement_type==='inflow'?'+':r.movement_type==='outflow'?'−':''}${e(operationalCashMoney(r.amount,r.currency_code))}</strong><button class="button button--compact button--muted" type="button" data-operational-detail="${index}">Detalle</button></article>`).join('');
}
function operationalCashSection(title,fields) {
  return `<h3 class="modal__section-title">${escapeCashHtml(title)}</h3><dl class="modal__grid service-summary__list">${fields.map(([label,value])=>`<div class="modal__field"><dt class="modal__field-label">${escapeCashHtml(label)}</dt><dd class="modal__field-value">${escapeCashHtml(value??'Sin información disponible')}</dd></div>`).join('')}</dl>`;
}
function closeOperationalCashDetail(focus=true){const state=operationalCashDialog;if(!state)return;operationalCashDialog=null;state.observer?.disconnect();state.modal.hidden=true;state.body.replaceChildren();if(focus&&state.previous?.isConnected)state.previous.focus?.();}
async function openOperationalCashDetail(kind,row,isCurrent) {
  if(!isCurrent())return;closeOperationalCashDetail(false);
  const op=window.ElaraOperationalData,modal=document.getElementById(kind==='count'?'cash-count-detail-modal':kind==='discrepancy'?'cash-discrepancy-detail-modal':'cash-remittance-detail-modal');
  const body=modal.querySelector('.modal__body'),state={modal,body,previous:document.activeElement,scope:operationalCashScope()};operationalCashDialog=state;
  const current=()=>operationalCashDialog===state&&isCurrent()&&state.scope===operationalCashScope()&&!document.getElementById('caja').hidden&&!modal.hidden;
  modal.hidden=false;modal.querySelector('h2').textContent=({movement:'Movimiento de efectivo',remittance:'Rendición',discrepancy:'Discrepancia',count:'Arqueo'})[kind];body.innerHTML='<p role="status">Cargando detalle…</p>';
  const oldActions=modal.querySelector('.modal__actions');if(oldActions)oldActions.hidden=true;
  modal.onclick=event=>{const action=event.target.closest('[data-cash-discrepancy-action]');if(action&&current()){event.stopPropagation();closeOperationalCashDetail(false);void openOperationalCashDiscrepancyAction(action.dataset.cashDiscrepancyAction,row.discrepancy_id,isCurrent);}else if(event.target===modal||event.target.closest('[data-modal-close]')){event.stopPropagation();closeOperationalCashDetail();}else if(event.target.closest('[data-cash-remittance-review]'))closeOperationalCashDetail(false);};
  modal.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();closeOperationalCashDetail();}else if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button')].filter(b=>!b.disabled&&!b.closest('[hidden]'));const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
  if(window.MutationObserver){state.observer=new window.MutationObserver(()=>{if(operationalCashDialog===state&&!current())closeOperationalCashDetail(false);});state.observer.observe(document.getElementById('caja'),{attributes:true,childList:true,subtree:true});}
  modal.querySelector('[data-modal-close]')?.focus?.();
  try{
    let d=row;
    if(kind==='movement')d=(await op.readRpc('get_admin_cash_movements')).find(m=>m.cash_movement_id===row.cash_movement_id);
    if(kind==='remittance')d=await op.readDetail('get_admin_cash_remittance_detail','p_remittance_id',row.remittance_id);
    if(kind==='discrepancy')d=await op.readDetail('get_admin_cash_discrepancy_detail','p_discrepancy_id',row.discrepancy_id);
    if(kind==='count')d=(await op.related('cash_counts','id',row.id))[0];
    if(!current())return;if(!d||!op.isOperationalRecord(d))throw Error('Registro no disponible');
    const money=value=>operationalCashMoney(value,d.currency_code);
    const fields=kind==='movement'?[['UUID',d.cash_movement_id],['Cuenta',d.cash_account_name],['Cuenta UUID',d.cash_account_id],['Fecha (Madrid)',operationalCashDate(d.occurred_at)],['Naturaleza',operationalCashLabel(d.movement_type)],['Importe registrado',money(d.amount)],['Concepto',d.description],['Origen',operationalCashLabel(d.source_type)],['Origen UUID',d.source_id],['Rendición',d.remittance_human_code||d.remittance_id],['Movimiento original',d.original_movement_human_code||d.original_movement_id],['Registrado por',d.actor_name||d.created_by_human_code]]:
      kind==='remittance'?[['UUID',d.remittance_id],['Estado',operationalCashLabel(d.status)],['Conductor',d.driver_name],['Declarado (no implica traslado)',money(d.declared_amount)],['Verificado',money(d.verified_amount)],['Cuenta de origen',d.source_cash_account_name],['Destino',d.destination_cash_account_name],['Presentada',operationalCashDate(d.submitted_at)],['Verificada',operationalCashDate(d.verified_at)]]:
      kind==='discrepancy'?[['UUID',d.discrepancy_id],['Estado',operationalCashLabel(d.status)],['Esperado',money(d.expected_amount)],['Real registrado',money(d.actual_amount)],['Diferencia (no es un movimiento)',money(d.difference_amount)],['Rendición',d.remittance_human_code||d.remittance_id],['Arqueo',d.cash_count_human_code||d.cash_count_id],['Motivo',d.reason_details],['Resolución',d.resolution_notes]]:
      [['UUID',d.id],['Estado',operationalCashLabel(d.status)],['Cuenta UUID',d.cash_account_id],['Fecha (Madrid)',operationalCashDate(d.counted_at)],['Esperado en ese arqueo',money(d.expected_amount)],['Contado en ese arqueo',money(d.counted_amount)],['Diferencia (no es un movimiento)',money(d.difference_amount)],['Verificación',operationalCashDate(d.verified_at)],['Notas',d.notes]];
    body.innerHTML=operationalCashSection(d.human_code||'Detalle',fields);
    if(kind==='remittance'&&['submitted','received'].includes(d.status))body.insertAdjacentHTML('beforeend',`<button type="button" class="button button--primary" data-cash-remittance-review="${escapeCashHtml(d.remittance_id)}">${d.status==='submitted'?'Recibir rendición':'Verificar rendición'}</button>`);
    if(kind==='discrepancy'&&['open','under_review'].includes(d.status))body.insertAdjacentHTML('beforeend',`<p>La gestión de esta discrepancia no crea movimientos ni modifica el saldo.</p><div class="modal__header-actions">${d.status==='open'?'<button type="button" class="button button--secondary" data-cash-discrepancy-action="review">Pasar a revisión</button>':''}<button type="button" class="button button--secondary" data-cash-discrepancy-action="resolve">Resolver</button>${window.ElaraAuth?.getActiveContext?.()==='superadmin'?'<button type="button" class="button button--secondary" data-cash-discrepancy-action="cancel">Cancelar discrepancia</button>':''}</div>`);
  }catch(_){if(current())body.innerHTML='<p role="alert">No se pudo cargar el detalle. Cierra y vuelve a abrir para intentarlo de nuevo.</p>';}
  finally{if(operationalCashDialog===state&&!current())closeOperationalCashDetail(false);}
}
function renderOperationalCashSidePanels(panel,snapshot,isCurrent) {
  const op=window.ElaraOperationalData,e=escapeCashHtml;
  const renderPage=(rows,list,meta,pagination,kind)=>{
    let page=1;
    const draw=()=>{if(!isCurrent())return;const filtered=rows();page=Math.max(1,Math.min(page,Math.ceil(filtered.length/20)||1));
      list.innerHTML=filtered.slice((page-1)*20,page*20).map((r,index)=>`<article class="cash-row cash-row--history"><div><strong>${e(r.human_code||r.id)}</strong><span>${e(operationalCashLabel(r.status))} · ${e(r.driver_name||operationalCashDate(r.counted_at||r.submitted_at||r.created_at))}</span><small>${kind==='remittance'?'Declarado (no es un ingreso)':kind==='discrepancy'?'Diferencia (no es un movimiento)':'Contado en el arqueo'}</small></div><strong class="cash-row__amount">${e(operationalCashMoney(kind==='remittance'?r.declared_amount:kind==='discrepancy'?r.difference_amount:r.counted_amount,r.currency_code))}</strong><button class="button button--compact button--muted" type="button" data-cash-side-detail="${index}">Detalle</button></article>`).join('')||'<p role="status">No hay registros para este filtro.</p>';
      if(meta)meta.textContent=`${filtered.length} registros · Página ${page} de ${Math.ceil(filtered.length/20)||1}`;
      pagination.innerHTML='<button type="button" class="button button--secondary" data-cash-prev>Anterior</button><button type="button" class="button button--secondary" data-cash-next>Siguiente</button>';
      pagination.querySelector('[data-cash-prev]').disabled=page===1;pagination.querySelector('[data-cash-next]').disabled=page*20>=filtered.length;
      pagination.querySelector('[data-cash-prev]').onclick=()=>{page--;draw();};pagination.querySelector('[data-cash-next]').onclick=()=>{page++;draw();};
      list.onclick=event=>{const b=event.target.closest('[data-cash-side-detail]');if(b&&isCurrent())return openOperationalCashDetail(kind,filtered[(page-1)*20+Number(b.dataset.cashSideDetail)],isCurrent);};
    };draw();return ()=>{page=1;draw();};
  };
  const history=panel.querySelector('#cash-remittance-history-list'),driver=panel.querySelector('#cash-remittance-history-driver'),status=panel.querySelector('#cash-remittance-history-status'),search=panel.querySelector('#cash-remittance-history-id'),from=panel.querySelector('#cash-remittance-history-from'),to=panel.querySelector('#cash-remittance-history-to');
  driver.innerHTML='<option value="">Todos</option>'+[...new Map(snapshot.remittances.filter(r=>r.driver_id).map(r=>[r.driver_id,r.driver_name||r.driver_human_code||'Conductor sin nombre'])).entries()].map(([id,name])=>`<option value="${e(id)}">${e(name)}</option>`).join('');for(const input of [driver,status,search,from,to])input.value='';
  const refreshHistory=renderPage(()=>snapshot.remittances.filter(r=>(!driver.value||r.driver_id===driver.value)&&(!status.value||r.status===status.value)&&(!search.value||`${r.human_code} ${r.remittance_id}`.toLowerCase().includes(search.value.toLowerCase()))&&(!from.value||operationalCashDate(r.submitted_at||r.created_at,true)>=from.value)&&(!to.value||operationalCashDate(r.submitted_at||r.created_at,true)<=to.value)),history,panel.querySelector('#cash-remittance-history-meta'),panel.querySelector('#cash-remittance-history-pagination'),'remittance');
  for(const input of [driver,status,from,to])input.onchange=refreshHistory;search.oninput=refreshHistory;panel.querySelector('#cash-remittance-history-clear').onclick=()=>{for(const input of [driver,status,search,from,to])input.value='';refreshHistory();};
  const pending=panel.querySelector('#cash-remittances-list');pending.innerHTML=snapshot.remittances.filter(r=>['submitted','received'].includes(r.status)).map(r=>`<article class="cash-row"><div><strong>${e(r.human_code)}</strong><span>${e(operationalCashLabel(r.status))} · ${e(r.driver_name||'Conductor sin nombre')}</span><small>Declarado: ${e(operationalCashMoney(r.declared_amount,r.currency_code))} · No confirma efectivo trasladado</small></div><button class="button button--compact" type="button" data-cash-remittance-review="${e(r.remittance_id)}">${r.status==='submitted'?'Recibir':'Verificar'}</button></article>`).join('')||'<p>No hay rendiciones presentadas o recibidas pendientes de revisión.</p>';
  const diffStatus=panel.querySelector('#cash-discrepancy-status'),diffType=panel.querySelector('#cash-discrepancy-type'),diffSearch=panel.querySelector('#cash-discrepancy-search');for(const input of [diffStatus,diffType,diffSearch])input.value='';
  const refreshDiff=renderPage(()=>snapshot.discrepancies.filter(r=>(!diffStatus.value||r.status===diffStatus.value)&&(!diffType.value||r.discrepancy_type===diffType.value)&&(!diffSearch.value||`${r.human_code} ${r.remittance_human_code||''}`.toLowerCase().includes(diffSearch.value.toLowerCase()))),panel.querySelector('#cash-discrepancy-list'),panel.querySelector('#cash-discrepancy-meta'),panel.querySelector('#cash-discrepancy-pagination'),'discrepancy');
  diffStatus.onchange=diffType.onchange=refreshDiff;diffSearch.oninput=refreshDiff;panel.querySelector('#cash-discrepancy-clear').onclick=()=>{for(const input of [diffStatus,diffType,diffSearch])input.value='';refreshDiff();};
  const counts=panel.querySelector('#cash-counts-list');counts.querySelector('[data-cash-count-pages]')?.remove();let countPages=panel.querySelector('[data-cash-count-pages]');if(!countPages){countPages=document.createElement('div');countPages.className='cash-pagination';countPages.dataset.cashCountPages='';counts.after(countPages);}
  renderPage(()=>snapshot.counts,counts,null,countPages,'count');
  panel.querySelector('[data-cash-account-balances]').innerHTML=snapshot.accounts.map(a=>`<article class="cash-row"><div><strong>${e(a.name)} · ${e(operationalCashLabel(a.account_type))}</strong><small>Saldo calculado por el sistema · Sin conciliar${snapshot.balances.get(a.cash_account_id)===null?' · Lecturas incompletas o no coincidentes':''}</small></div><strong>${e(operationalCashMoney(snapshot.balances.get(a.cash_account_id),a.currency_code))}</strong></article>`).join('')||'<p>No hay saldos de cuenta disponibles.</p>';
  window.ElaraAdminControls?.attachCash();const admin=panel.querySelector('[data-admin-control="central"]');if(admin){admin.classList.add('button','button--secondary');panel.querySelector('[data-cash-operational-admin]').appendChild(admin);}
}
async function showOperationalCash() {
  closeOperationalCashDetail(false);
  if(!operationalCashBound){operationalCashBound=true;window.addEventListener('elara:auth-session-updated',()=>{if(operationalCashDialog?.scope!==operationalCashScope())closeOperationalCashDetail(false);if(operationalCashManualDialog?.attempt.scope!==operationalCashScope())closeOperationalCashManual();if(operationalCashDiscrepancyDialog?.attempt.scope!==operationalCashScope())closeOperationalCashDiscrepancyAction();if(operationalCashElements?.create&&!operationalCashCurrent())operationalCashElements.create.hidden=true;});}
  const op=window.ElaraOperationalData;let snapshot;
  const result=await op.show('caja',{title:'Caja',defaultFilters:false,pageSummary:'Control de efectivo, rendiciones y movimientos registrados.',
    load:async({isCurrent})=>{
      const [movements,remittances,discrepancies,accounts,ledger]=await Promise.all([op.readRpc('get_admin_cash_movements'),op.readRpc('get_admin_cash_remittances'),op.readRpc('get_admin_cash_discrepancies'),op.readAll('v_admin_cash_account_overview','cash_account_id'),op.readAll('cash_movements')]);if(!isCurrent())return [];
      op.indexRecords({movements,remittances,discrepancies,ledger});
      snapshot={movements,remittances:remittances.filter(op.isOperationalRecord),discrepancies:discrepancies.filter(op.isOperationalRecord),counts:op.getCollection('cash_counts'),accounts:accounts.filter(a=>op.isOperationalRecord(a)&&op.getCollection('cash_accounts').some(c=>c.id===a.cash_account_id)),balances:new Map()};
      for(const account of snapshot.accounts)snapshot.balances.set(account.cash_account_id,operationalCashBalance(account,movements));
      return movements;
    },
    presentation:{panelClassName:'cash-operational-panel',mount:mountOperationalCash,rows:renderOperationalCashMovements,
      summary:rows=>{const central=snapshot.accounts.filter(a=>a.account_type==='central'&&a.status==='active'),a=central.length===1?central[0]:null;
        return [['Saldo central calculado',a?operationalCashMoney(snapshot.balances.get(a.cash_account_id),a.currency_code):'No disponible','neutral'],['Saldo conciliado','No determinado','neutral'],['Ingresos del filtro (registros)',rows.filter(r=>r.movement_type==='inflow').length,'success'],['Egresos del filtro (registros)',rows.filter(r=>r.movement_type==='outflow').length,'danger'],['Rendiciones por revisar',snapshot.remittances.filter(r=>['submitted','received'].includes(r.status)).length,'warning'],['Discrepancias abiertas',snapshot.discrepancies.filter(r=>['open','under_review'].includes(r.status)).length,'warning']].map(([label,value,tone])=>`<article class="summary-card summary-card--${tone}"><span>${escapeCashHtml(label)}</span><strong>${escapeCashHtml(value)}</strong></article>`).join('');},
      ready:(_,{panel,isCurrent,refreshRows})=>{operationalCashCurrent=isCurrent;operationalCashRefresh=async current=>{await refreshRows(current);renderOperationalCashSidePanels(panel,snapshot,isCurrent);};renderOperationalCashSidePanels(panel,snapshot,isCurrent);placeOperationalCashCreate(isCurrent);document.getElementById('page-eyebrow').textContent='Economía';}},
    filters:[{label:'Naturaleza',value:r=>r.movement_type,text:r=>operationalCashLabel(r.movement_type)},{label:'Cuenta',value:r=>r.cash_account_id,text:r=>r.cash_account_name},{label:'Origen',value:r=>r.source_type,text:r=>operationalCashLabel(r.source_type)},{label:'Registro',value:r=>r.original_movement_id?'reversal':'registered',text:r=>r.original_movement_id?'Contramovimiento':'Registrado'},{label:'Fecha (Madrid)',value:r=>operationalCashDate(r.occurred_at,true)}],
    searchText:r=>[r.human_code,r.description,r.cash_account_name,r.source_type,r.source_id,r.original_movement_human_code,r.remittance_human_code,r.amount,r.currency_code].join(' '),columns:[],openDetail:(r,{isCurrent})=>openOperationalCashDetail('movement',r,isCurrent)});
  return result;
}


const operationalCashManualAttempts=new Map();
let operationalCashManualWriting=false,operationalCashManualDialog,operationalCashCreateObserver;
function placeOperationalCashCreate(isCurrent) {
  const button=operationalCashElements.create,view=document.getElementById('caja');
  button.removeAttribute('data-cash-open-modal');button.classList.remove('button--compact','button--muted');button.classList.add('button--primary');button.textContent='Registrar movimiento';
  const allowed=()=>operationalCashCurrent()&&!view.hidden&&Boolean(window.ElaraAuth?.getCurrentUser?.())&&['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.());
  document.querySelector('.header__actions').appendChild(button);button.hidden=!allowed();button.onclick=()=>{if(allowed())return openOperationalCashManual(isCurrent);};
  if(!operationalCashCreateObserver&&window.MutationObserver){operationalCashCreateObserver=new window.MutationObserver(()=>{button.hidden=!allowed();});operationalCashCreateObserver.observe(view,{attributes:true,childList:true,subtree:true});}
}
async function executeOperationalCashManual(attempt,values,isCurrent=()=>true) {
  if(operationalCashManualWriting||attempt.busy)throw Error('Hay una operación en curso.');
  operationalCashManualWriting=attempt.busy=true;
  const check=()=>{if(!isCurrent()||attempt.scope!==operationalCashScope()||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.()))throw Error('La sesión o la vista cambió. Revisa el intento antes de continuar.');};
  try{
    check();const op=window.ElaraOperationalData;
    if(!attempt.args){
      const amount=String(values.amount||'').replace(',','.'),minor=operationalCashMinor(amount),description=String(values.description||'').trim();
      if(minor===null||minor<=0n||minor>99999999999999n)throw Error('Introduce un importe positivo con un máximo de dos decimales.');
      if(!description||op.isQaRecord({description}))throw Error('Introduce un concepto válido para este movimiento manual.');
      if(!['inflow','outflow'].includes(values.type))throw Error('Selecciona ingreso o egreso.');
      const accounts=await op.readAll('cash_accounts');check();const account=accounts.find(a=>a.id===values.account&&a.status==='active'&&['central','administrative'].includes(a.account_type)&&op.isOperationalRecord(a));
      if(!account)throw Error('Selecciona una cuenta central o administrativa activa.');
      attempt.currency=account.currency_code;attempt.args={p_cash_account_id:account.id,p_movement_type:values.type,p_amount:`${minor/100n}.${String(minor%100n).padStart(2,'0')}`,p_description:description,p_idempotency_key:attempt.key,p_metadata:{ui_request_key:attempt.key}};
    }
    const recover=async()=>{const rows=await op.readRpc('get_admin_cash_movements',{p_cash_account_id:attempt.args.p_cash_account_id});check();const matches=rows.filter(r=>r.metadata?.ui_request_key===attempt.key&&op.isOperationalRecord(r));if(matches.length>1)throw Error('El intento requiere revisión: hay más de un movimiento asociado.');const row=matches[0];if(row&&(row.cash_account_id!==attempt.args.p_cash_account_id||row.movement_type!==attempt.args.p_movement_type||row.currency_code!==attempt.currency||row.description!==attempt.args.p_description||operationalCashMinor(row.amount)!==operationalCashMinor(attempt.args.p_amount)))throw Error('El movimiento encontrado no coincide con este intento.');return row;};
    if(attempt.sent||attempt.result){const found=await recover();if(found){attempt.result=found;return found;}if(attempt.result)throw Error('Movimiento confirmado; la lectura de comprobación está pendiente.');}
    check();attempt.sent=true;
    let response;try{response=await window.ElaraSupabase.client.rpc('create_cash_movement',attempt.args);}catch(_){response=null;}
    check();const found=await recover();if(found){attempt.result=found;return found;}
    if(response?.error&&['22023','23503','23514','42501','28000'].includes(response.error.code)){attempt.rejected=true;throw Error('El movimiento fue rechazado. Revisa los datos y el estado de la cuenta; no se ha confirmado un registro.');}
    if(typeof response?.data==='string'&&/^[0-9a-f-]{36}$/i.test(response.data))attempt.result={cash_movement_id:response.data};
    throw Error('No se pudo confirmar la lectura del movimiento. Conserva este intento y comprueba su estado antes de registrar otro.');
  }finally{attempt.busy=operationalCashManualWriting=false;}
}
function closeOperationalCashManual(){const state=operationalCashManualDialog;if(!state)return;state.observer?.disconnect();state.modal.hidden=true;operationalCashManualDialog=null;}
async function openOperationalCashManual(isCurrent) {
  if(operationalCashManualWriting)return;closeOperationalCashDetail(false);closeOperationalCashManual();
  const scope=operationalCashScope(),modal=document.getElementById('cash-adjustment-form-modal'),form=modal.querySelector('form');
  let attempt=operationalCashManualAttempts.get(scope);
  if(!attempt||attempt.result||attempt.rejected){attempt={scope,key:`cash-ui:${window.crypto.randomUUID()}`,sent:false,result:null};operationalCashManualAttempts.set(scope,attempt);}
  const state={modal,attempt};operationalCashManualDialog=state;form.classList.add('service-summary');
  const current=()=>operationalCashManualDialog===state&&isCurrent()&&scope===operationalCashScope()&&!document.getElementById('caja').hidden&&!modal.hidden;
  modal.hidden=false;modal.querySelector('h2').textContent='Registrar movimiento manual';form.innerHTML='<p role="status">Cargando cuentas…</p>';
  modal.onclick=e=>{if((e.target===modal||e.target.closest('[data-modal-close]'))&&!attempt.busy){e.stopPropagation();closeOperationalCashManual();}};
  modal.onkeydown=e=>{if(e.key==='Escape'&&!attempt.busy){e.stopPropagation();closeOperationalCashManual();}else if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,textarea,select')].filter(el=>!el.disabled&&!el.closest('[hidden]'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  if(window.MutationObserver){state.observer=new window.MutationObserver(()=>{if(operationalCashManualDialog===state&&!current())closeOperationalCashManual();});state.observer.observe(document.getElementById('caja'),{attributes:true,childList:true,subtree:true});}
  try{
    const accounts=(await window.ElaraOperationalData.readAll('cash_accounts')).filter(a=>a.status==='active'&&['central','administrative'].includes(a.account_type)&&window.ElaraOperationalData.isOperationalRecord(a));if(!current())return;
    form.innerHTML='<p>Solo efectivo manual. Los cobros de servicios, pagos de gastos y liquidaciones se gestionan desde sus módulos.</p>'+`<label class="field"><span>Cuenta</span><select name="account" required><option value="">Selecciona…</option>${accounts.map(a=>`<option value="${escapeCashHtml(a.id)}">${escapeCashHtml(a.name)} · ${escapeCashHtml(a.currency_code)}</option>`).join('')}</select></label><label class="field"><span>Naturaleza</span><select name="type"><option value="inflow">Ingreso</option><option value="outflow">Egreso</option></select></label><label class="field"><span>Importe</span><input name="amount" type="text" inputmode="decimal" required></label><label class="field"><span>Concepto obligatorio</span><textarea name="description" required></textarea></label><p role="status" data-cash-manual-status></p><button class="button button--primary" type="submit">${attempt.sent?'Comprobar / reintentar mismo movimiento':'Registrar movimiento'}</button><button class="button button--secondary" type="button" data-modal-close>Cerrar</button>`;
    if(attempt.args){for(const [name,value]of Object.entries({account:attempt.args.p_cash_account_id,type:attempt.args.p_movement_type,amount:attempt.args.p_amount,description:attempt.args.p_description})){form.querySelector(`[name="${name}"]`).value=value;form.querySelector(`[name="${name}"]`).disabled=true;}}
    if(!accounts.length&&!attempt.sent){form.querySelector('[type="submit"]').disabled=true;form.querySelector('[data-cash-manual-status]').textContent='No hay cuentas centrales o administrativas activas disponibles.';}
    form.onsubmit=async event=>{event.preventDefault();if(attempt.busy||!current())return;const controls=[...form.querySelectorAll('input,select,textarea,button')],status=form.querySelector('[data-cash-manual-status]');controls.forEach(c=>c.disabled=true);
      try{const value=name=>form.querySelector(`[name="${name}"]`).value;await executeOperationalCashManual(attempt,{account:value('account'),type:value('type'),amount:value('amount'),description:value('description')},current);if(!current())return;status.textContent='Movimiento confirmado. Actualizando la lectura…';try{await operationalCashRefresh(current);if(current())status.textContent='Movimiento confirmado. Listado y saldos actualizados.';}catch(_){if(current())status.textContent='Movimiento confirmado. La actualización está pendiente; no repitas el registro.';}}
      catch(error){if(current())status.textContent=error.message;}
      finally{controls.forEach(c=>c.disabled=false);if(attempt.sent)controls.filter(c=>c.tagName!=='BUTTON').forEach(c=>c.disabled=true);if(attempt.result){form.querySelector('[type="submit"]').disabled=true;form.querySelector('[type="submit"]').textContent='Movimiento confirmado';}}
    };
  }catch(_){if(current())form.innerHTML='<p role="alert">No se pudieron consultar las cuentas.</p><button type="button" data-modal-close>Cerrar</button>';}
  finally{if(operationalCashManualDialog===state&&!current())closeOperationalCashManual();}
}

let operationalCashDiscrepancyDialog;
function closeOperationalCashDiscrepancyAction(){const state=operationalCashDiscrepancyDialog;if(!state)return;state.observer?.disconnect();state.modal.hidden=true;operationalCashDiscrepancyDialog=null;}
async function executeOperationalCashDiscrepancy(attempt,notes,isCurrent=()=>true) {
  if(operationalCashManualWriting||attempt.busy)throw Error('Hay una operación en curso.');operationalCashManualWriting=attempt.busy=true;
  const check=()=>{if(!isCurrent()||attempt.scope!==operationalCashScope()||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.()))throw Error('La sesión o la vista cambió.');if(attempt.action==='cancel'&&window.ElaraAuth.getActiveContext()!=='superadmin')throw Error('Solo Superadmin puede cancelar discrepancias.');};
  try{
    check();const names={review:'review_cash_discrepancy',resolve:'resolve_cash_discrepancy',cancel:'cancel_cash_discrepancy'},targets={review:'under_review',resolve:'resolved',cancel:'cancelled'};
    if(!names[attempt.action])throw Error('Acción no permitida.');
    const read=async()=>{const row=await window.ElaraOperationalData.readDetail('get_admin_cash_discrepancy_detail','p_discrepancy_id',attempt.id);check();return row;};
    if(!attempt.args){notes=String(notes||'').trim();if(attempt.action!=='review'&&(!notes||notes.length>1000))throw Error('Introduce un motivo de hasta 1000 caracteres.');attempt.notes=notes;attempt.args={p_discrepancy_id:attempt.id,...(attempt.action==='resolve'?{p_resolution_notes:notes}:attempt.action==='cancel'?{p_reason:notes}:{})};}
    const matching=row=>row.status===targets[attempt.action]&&(attempt.action==='review'||row.resolution_notes===attempt.notes);
    const before=await read();if(matching(before)){attempt.result=before;return before;}
    if(attempt.result||!['open','under_review'].includes(before.status)||(attempt.action==='review'&&before.status!=='open'))throw Error('El estado cambió. Actualiza la lectura antes de iniciar otro cambio.');
    check();attempt.sent=true;let response;try{response=await window.ElaraSupabase.client.rpc(names[attempt.action],attempt.args);}catch(_){response=null;}
    const after=await read();if(matching(after)){attempt.result=after;return after;}
    if(response?.error)throw Error('La operación fue rechazada. Revisa el estado actual de la discrepancia.');throw Error('El resultado no está confirmado. Comprueba la discrepancia por lectura antes de continuar.');
  }finally{attempt.busy=operationalCashManualWriting=false;}
}
async function openOperationalCashDiscrepancyAction(action,id,isCurrent) {
  if(operationalCashManualWriting)return;closeOperationalCashDiscrepancyAction();
  const modal=document.getElementById('cash-discrepancy-action-modal'),body=modal.querySelector('.modal__body'),attempt={scope:operationalCashScope(),action,id};
  const state={modal,attempt};operationalCashDiscrepancyDialog=state;modal.hidden=false;
  const current=()=>operationalCashDiscrepancyDialog===state&&isCurrent()&&attempt.scope===operationalCashScope()&&!document.getElementById('caja').hidden&&!modal.hidden;
  modal.querySelector('h2').textContent=({review:'Pasar a revisión',resolve:'Resolver discrepancia',cancel:'Cancelar discrepancia'})[action]||'Discrepancia';
  body.innerHTML=`<p>Esta operación cambia el estado de la discrepancia. No crea movimientos ni modifica importes o saldos.</p><form class="cash-form">${action==='review'?'':'<label class="field"><span>Motivo obligatorio</span><textarea name="notes" maxlength="1000" required></textarea></label>'}<p role="status"></p><button type="submit" class="button button--primary">Confirmar</button><button type="button" class="button button--secondary" data-modal-close>Cerrar</button></form>`;
  const close=()=>{if(!attempt.busy)closeOperationalCashDiscrepancyAction();};modal.onclick=e=>{if(e.target===modal||e.target.closest('[data-modal-close]')){e.stopPropagation();close();}};
  modal.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}};
  if(window.MutationObserver){state.observer=new window.MutationObserver(()=>{if(operationalCashDiscrepancyDialog===state&&!current())closeOperationalCashDiscrepancyAction();});state.observer.observe(document.getElementById('caja'),{attributes:true,childList:true,subtree:true});}
  const form=body.querySelector('form');form.onsubmit=async event=>{event.preventDefault();if(attempt.busy||!current())return;const controls=[...form.querySelectorAll('button,textarea')],status=form.querySelector('[role="status"]');controls.forEach(c=>c.disabled=true);
    try{await executeOperationalCashDiscrepancy(attempt,form.querySelector('[name="notes"]')?.value,current);if(current()){status.textContent='Cambio confirmado. Actualizando la lectura…';try{await operationalCashRefresh(current);if(current())status.textContent='Estado actualizado. Los importes y saldos no se han modificado.';}catch(_){if(current())status.textContent='Cambio confirmado; actualización de lectura pendiente.';}}}
    catch(error){if(current())status.textContent=error.message;}
    finally{controls.forEach(c=>c.disabled=false);if(attempt.sent)form.querySelector('[name="notes"]')?.setAttribute('disabled','');if(attempt.result)form.querySelector('[type="submit"]').disabled=true;}
  };
}

// Administrative remittances: real read/write contracts only; legacy/demo controls stay inactive.
window.ElaraCashRemittance = (() => {
  let busy=false,modal=null,disposeModal=()=>{};
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const op=()=>window.ElaraOperationalData;
  const actor=()=>window.ElaraAuth?.getCurrentUser?.()?.supabaseUserId||window.ElaraAuth?.getCurrentUser?.()?.id;
  function authorize(expected=actor()){
    if(!expected||actor()!==expected||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.()))throw Error('Se requiere una sesión administrativa vigente.');
  }
  const read=id=>op().readDetail('get_admin_cash_remittance_detail','p_remittance_id',id);
  function balances(rows){
    const movements=rows.filter(r=>r.kind==='Movimiento');
    return ['driver','central','administrative'].map(type=>{
      const accounts=op().getCollection('cash_accounts').filter(a=>a.account_type===type);
      const currencies=new Set(accounts.map(a=>a.currency_code));
      if(currencies.size!==1)return `${type}: saldo no disponible (cuentas/monedas)`;
      const ids=new Set(accounts.map(a=>a.id)),selected=movements.filter(m=>ids.has(m.cash_account_id));
      if(accounts.some(a=>!Number.isFinite(Number(a.opening_balance)))||selected.some(m=>!Number.isFinite(Number(m.amount))))return `${type}: saldo no disponible`;
      const amount=accounts.reduce((n,a)=>n+Number(a.opening_balance),0)+selected.reduce((n,m)=>n+(m.movement_type==='inflow'?1:-1)*Number(m.amount),0);
      return `${type}: saldo operativo ${new Intl.NumberFormat('es-ES',{style:'currency',currency:[...currencies][0]}).format(amount)}`;
    }).join(' · ');
  }
  async function refresh(){
    // The operational route reloads identity/accounts and all three cash RPCs itself.
    await showOperationalCash();
    if(document.getElementById('caja')?.querySelector('[data-operational-panel] [role="alert"]'))throw Error('Lectura de Caja pendiente de actualizar.');
  }
  async function execute(action,id,amount,isCurrent=()=>true){
    if(busy)throw Error('Hay una rendición en curso.');busy=true;const expected=actor();
    try{
      authorize(expected);if(!isCurrent())throw Error('Contexto invalidado.');if(!['receive','verify'].includes(action))throw Error('Acción no disponible.');
      const before=await read(id);authorize(expected);if(!isCurrent())throw Error('La vista o la sesi\u00f3n cambi\u00f3.');
      const target=action==='receive'?'received':'verified';
      if(before.status===target||(action==='receive'&&before.status==='verified')){
        if(action==='verify'&&Number(before.verified_amount)!==Number(amount))throw Error('La rendición ya fue verificada con otro importe. Revisa el resultado remoto.');
        return {detail:before,replayed:true};
      }
      if(before.status!==(action==='receive'?'submitted':'received'))throw Error('El estado remoto no permite esta acción.');
      if(action==='verify'&&(!Number.isFinite(Number(amount))||Number(amount)<=0||Math.abs(Number(amount)*100-Math.round(Number(amount)*100))>1e-7))throw Error('Importe verificado positivo con máximo dos decimales.');
      const args=action==='receive'?{p_remittance_id:id}:{p_remittance_id:id,p_verified_amount:Number(amount)};
      let response;
      try{response=await window.ElaraSupabase.client.rpc(action==='receive'?'receive_cash_remittance':'verify_cash_remittance',args);if(response?.error)throw response.error;}
      catch(error){const current=await read(id);authorize(expected);if(current.status===target&&(action==='receive'||Number(current.verified_amount)===Number(amount)))return {detail:current,replayed:true};throw Error(error.message||'Resultado incierto. Revisar estado de la rendición antes de continuar.');}
      authorize(expected);const current=await read(id);authorize(expected);
      if(current.status!==target)throw Error('Verificación pendiente de revisión: consulta discrepancias y fuentes. No se confirma traslado a central.');
      return {detail:current,replayed:false};
    }finally{busy=false;}
  }
  async function open(id){
    if(busy)return;authorize();const expected=actor();
    disposeModal();if(modal)modal.remove();const scope=operationalCashScope(),client=window.ElaraSupabase.client;const element=document.createElement('div');element.className='modal-backdrop';modal=element;
    element.innerHTML='<section class="modal financial-close-modal" role="dialog" aria-modal="true" aria-labelledby="cash-remittance-title"><header class="modal__header"><h2 id="cash-remittance-title">Rendición de efectivo</h2><button type="button" data-remittance-close>Cerrar</button></header><div class="modal__body" role="status">Consultando rendición remota…</div></section>';
    document.body.append(element);
    const current=()=>modal===element&&element.isConnected&&scope===operationalCashScope()&&client===window.ElaraSupabase.client&&!document.getElementById('caja').hidden&&operationalCashCurrent();
    const invalidate=()=>{if(!current()){element.remove();if(modal===element)modal=null;window.removeEventListener?.('elara:auth-session-updated',invalidate);observer?.disconnect();}};
    const observer=window.MutationObserver?new window.MutationObserver(invalidate):null;observer?.observe(document.getElementById('caja'),{attributes:true,attributeFilter:['hidden']});window.addEventListener?.('elara:auth-session-updated',invalidate);disposeModal=()=>{observer?.disconnect();window.removeEventListener?.('elara:auth-session-updated',invalidate);};
    element.onkeydown=e=>{if(e.key==='Escape'&&!busy)element.querySelector('[data-remittance-close]').click();};
    element.querySelector('[data-remittance-close]').onclick=()=>{if(!busy){disposeModal();element.remove();if(modal===element)modal=null;}};
    try{
      const d=await read(id);authorize(expected);if(!current()){invalidate();return;}
      const body=element.querySelector('.modal__body');
      body.innerHTML=op().fields(d,[['Código','human_code'],['Estado','status'],['Conductor','driver_name'],['Declarado','declared_amount'],['Verificado','verified_amount'],['Moneda','currency_code'],['Custodia origen','source_cash_account_name'],['Destino central','destination_cash_account_name']])+(['submitted','received'].includes(d.status)?`<form data-remittance-form>${d.status==='received'?'<label>Importe contado y verificado<input name="amount" type="number" min="0.01" step="0.01" required></label>':'<p>Confirmar recepción física de esta rendición. La recepción todavía no mueve efectivo a central.</p>'}<p role="status" aria-live="polite"></p><button type="submit">${d.status==='submitted'?'Recibir rendición':'Verificar y trasladar efectivo a central'}</button></form>`:'<p>Sin acciones disponibles para este estado.</p>');
      const form=body.querySelector('form');if(!form)return;
      form.onsubmit=async event=>{event.preventDefault();if(busy||!current())return;const status=form.querySelector('[role="status"]'),buttons=[...element.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
        try{authorize(expected);const result=await execute(d.status==='submitted'?'receive':'verify',id,form.elements.amount?.value,current);if(!current())return;status.textContent=`Confirmado desde backend: ${result.detail.status}.`;
          // Confirmed mutations are never retried to repair a failed refresh.
          try{await refresh();if(current())await open(id);}catch(_){status.textContent+=' Actualización pendiente: cierra y vuelve a revisar la rendición; no repitas a ciegas.';}
        }catch(error){status.textContent=error.message;}
        finally{buttons.forEach(b=>b.disabled=false);}
      };
    }catch(error){if(current())element.querySelector('.modal__body').textContent=error.message;else invalidate();}
  }
  document.addEventListener('click',event=>{const b=event.target.closest?.('[data-cash-remittance-review]');if(b)void open(b.dataset.cashRemittanceReview).catch(e=>window.ElaraNotifications?.showToast(e.message,'error'));});
  return Object.freeze({execute,open,refresh,balances,escape});
})();
