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

let isCashControlsInitialized = false;
let selectedCashRemittanceId = "";
let pendingCashRemittanceOverrunDraft = null;
let cashRemittanceHistoryPage = 1;
let cashRemittanceHistoryFilters = getDefaultCashRemittanceHistoryFilters();

function showCash() {
  if (!canViewCash()) {
    showCashUnavailable("No tienes acceso a Caja.");
    return;
  }

  cashSetText("page-eyebrow", "Econom\u00eda");
  cashSetText("page-title", "Caja");
  cashSetText("page-summary", "Controla efectivo recibido, rendiciones y arqueos desde una \u00fanica fuente mock.");
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
  const normalizedCategory = `Pago de liquidación ${normalizedSettlementId}`;

  if (!normalizedSettlementId || normalizedAmount <= 0 || !paymentMethod) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de pago de liquidación incompletos." };
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
  const normalizedCategory = `Reversión de pago de liquidación ${normalizedSettlementId}`;

  if (!normalizedSettlementId || !normalizedOriginalMovementId || normalizedAmount <= 0 || !reason) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de reversión de liquidación incompletos." };
  }

  const originalMovement = financeData.cashMovements.find((movement) => movement.id === normalizedOriginalMovementId && movement.sourceType === "settlement");

  if (!originalMovement) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "No se encontró el movimiento original de Caja." };
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
  const normalizedCategory = `Reversión de cobro de cuenta por cobrar ${normalizedReceivableId}`;

  if (!normalizedReceivableId || !normalizedPaymentId || !normalizedServiceId || !normalizedOriginalMovementId || normalizedAmount <= 0 || !reason) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "Datos de reversión de cuenta por cobrar incompletos." };
  }

  const originalMovement = financeData.cashMovements.find((movement) => movement.id === normalizedOriginalMovementId && movement.sourceType === "receivable" && movement.sourceId === normalizedReceivableId && movement.receivablePaymentId === normalizedPaymentId);

  if (!originalMovement) {
    return { ok: false, movement: null, movementId: null, duplicate: false, error: "No se encontró el movimiento original de Caja." };
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
    meta.textContent = `${remittances.length} resultado${remittances.length === 1 ? "" : "s"} · Pagina ${cashRemittanceHistoryPage} de ${totalPages}`;
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
            <span>${escapeCashHtml(formatCashDateTime(remittance.createdAt))} · ${escapeCashHtml(driver?.driverType || "Conductor")}</span>
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
  document.addEventListener("click", handleCashDocumentClick);
  document.addEventListener("keydown", handleCashKeydown);
  isCashControlsInitialized = true;
}

function handleCashDocumentClick(event) {
  const cashModal = event.target.closest("#cash-remittance-form-modal, #cash-count-form-modal, #cash-adjustment-form-modal, #cash-void-form-modal, #cash-difference-close-modal, #cash-remittance-detail-modal, #cash-remittance-void-modal, #cash-remittance-overrun-modal, #cash-count-detail-modal");
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

  const openModal = document.querySelector("#cash-remittance-form-modal:not([hidden]), #cash-count-form-modal:not([hidden]), #cash-adjustment-form-modal:not([hidden]), #cash-void-form-modal:not([hidden]), #cash-difference-close-modal:not([hidden]), #cash-remittance-detail-modal:not([hidden]), #cash-remittance-void-modal:not([hidden]), #cash-remittance-overrun-modal:not([hidden]), #cash-count-detail-modal:not([hidden])");

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
    `${driver?.name || "Conductor"} · ${formatCashMoney(remittance.amount)} · ${selectedCashRemittanceId}`,
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

  cashSetText("cash-void-summary", `${movement.id} · ${movement.category || movement.type} · ${formatCashMoney(movement.amount)}`);
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

  cashSetText("cash-difference-close-summary", `${count.id} · Diferencia ${formatCashMoney(count.differenceAmount)}`);
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
  return remittance?.status === "Anulada" || remittance?.annulledAt ? "Anulada" : "Válida";
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
  const warning = exceedsPending ? ` · Excedente estimado: ${formatCashMoney(amount - position.pendingAmount)}.` : "";

  container.textContent = `Total cobrado: ${formatCashMoney(position.totalCollected)} · Total rendido: ${formatCashMoney(position.totalRendered)} · Pendiente: ${formatCashMoney(position.pendingAmount)}${position.excessAmount > 0 ? ` · Excedente: ${formatCashMoney(position.excessAmount)}` : ""}${warning}`;
}

function openCashRemittanceOverrunModal(draft, pendingAmount) {
  const driver = getCashCollaboratorById(draft.driverId);
  const excessAmount = roundCashAmount(draft.amount - pendingAmount);

  cashSetText(
    "cash-remittance-overrun-summary",
    `El importe entregado supera en ${formatCashMoney(excessAmount)} el saldo registrado. Se recibiran ${formatCashMoney(draft.amount)} y se abrira una incidencia para revision. Conductor: ${driver?.name || "Conductor"}. Saldo registrado: ${formatCashMoney(pendingAmount)}.`,
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
    status: "Válida",
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
          status: settlement.status === "Anulada" || settlement.voidedAt ? "Anulada" : "Válida",
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
    status: remittance.status === "Anulada" || remittance.annulledAt || remittance.voidedAt ? "Anulada" : "Válida",
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
        warnings.push(`${movement.id || "Movimiento sin ID"}: movimiento de liquidación sin settlementId válido.`);
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
        warnings.push(`${movement.id || "Movimiento sin ID"}: reversión de liquidación sin settlementId válido.`);
      }
    });

  paymentMovementsBySettlement.forEach((movements, key) => {
    const unreversedMovements = movements.filter((movement) => !movement.reversedByCashMovementId);

    if (unreversedMovements.length > 1) {
      warnings.push(`${key}: pagos de liquidación duplicados.`);
    }
  });

  reversalMovementsByOriginal.forEach((movements, originalCashMovementId) => {
    if (!originalCashMovementId) {
      warnings.push("Reversión de pago de liquidación sin movimiento original.");
    }

    if (movements.length > 1) {
      warnings.push(`${originalCashMovementId}: reversión de pago de liquidación duplicada.`);
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
  return movement?.sourceType === "settlement" || String(movement?.category || "").startsWith("Pago de liquidación");
}

function isCashSettlementReversalMovement(movement) {
  return movement?.sourceType === "settlement-payment-reversal" || String(movement?.category || "").startsWith("Reversión de pago de liquidación");
}

function getCashSettlementMovementSettlementId(movement) {
  return String(movement?.settlementId || (String(movement?.sourceType || "").startsWith("settlement") ? movement?.sourceId : "") || "").trim();
}

function isCashReceivableMovement(movement) {
  return movement?.sourceType === "receivable" || String(movement?.category || "").startsWith("Cobro de cuenta por cobrar");
}

function isCashReceivableReversalMovement(movement) {
  return movement?.sourceType === "receivable-payment-reversal" || String(movement?.category || "").startsWith("Reversión de cobro pendiente") || String(movement?.category || "").startsWith("Reversion de cobro pendiente");
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

ensureFinanceData();





