/*
  Proyecto Atlas / ELARA Transport
  Archivo: expenses-core.js
  Responsabilidad: nucleo mock de reglas y helpers del futuro modulo Gastos.
*/

"use strict";

const expensesData = window.ElaraExpensesMock || {
  settings: { currency: "EUR" },
  expenses: [],
};

const EXPENSES_EVENT = "elara:expenses-updated";

const EXPENSE_RECORD_TYPES = ["Gasto", "Solicitud"];
const EXPENSE_SOURCES = ["Administraci\u00f3n", "Portal conductor", "Portal colaborador"];
const EXPENSE_CATEGORIES = [
  "Combustible",
  "Electricidad",
  "Mantenimiento",
  "Reparaci\u00f3n",
  "Neum\u00e1ticos",
  "Limpieza",
  "Peaje",
  "Aparcamiento",
  "Asistencia y gr\u00faa",
  "Seguro",
  "ITV",
  "Licencias y permisos",
  "Alquiler o leasing",
  "Software y suscripciones",
  "Telefon\u00eda",
  "Publicidad",
  "Gestor\u00eda y asesor\u00eda",
  "Formaci\u00f3n",
  "Material de oficina",
  "Comisiones bancarias",
  "Gasto administrativo",
  "Otro",
];
const EXPENSE_PAID_BY = ["ELARA", "Chofer", "Colaborador", "Pendiente de pago"];
const EXPENSE_PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro", "No indicado"];
const EXPENSE_STATUSES = [
  "Borrador",
  "Pendiente de revisi\u00f3n",
  "Requiere informaci\u00f3n",
  "Aprobada",
  "Aprobada parcialmente",
  "Rechazada",
  "Pendiente de pago",
  "Pendiente de reembolso",
  "Pagada",
  "Reembolsada",
  "Anulada",
];
const EXPENSE_CLAIMANT_TYPES = ["Chofer", "Colaborador", "ELARA"];
const EXPENSE_RECEIPT_STATUSES = ["No adjunto", "Adjunto", "Pendiente de adjuntar", "No disponible", "No requerido"];
const EXPENSE_SETTLEMENT_STATUSES = ["No aplica", "Pendiente", "Pagado"];
const EXPENSE_EXCEPTIONAL_COLLABORATOR_CATEGORIES = ["Combustible", "Electricidad", "Mantenimiento", "Seguro", "Reparaci\u00f3n", "Neum\u00e1ticos"];
const EXPENSE_APPROVED_STATUSES = ["Aprobada", "Aprobada parcialmente", "Pendiente de pago", "Pendiente de reembolso", "Pagada", "Reembolsada"];

function roundExpenseMoney(value) {
  const amount = parseExpenseAmount(value);

  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

function normalizeExpenseRecord(record = {}) {
  const normalizedRecord = {
    expenseId: String(record.expenseId || record.id || getNextExpenseId()).trim(),
    recordType: normalizeExpenseChoice(record.recordType, EXPENSE_RECORD_TYPES, "Gasto"),
    source: normalizeExpenseChoice(record.source, EXPENSE_SOURCES, "Administraci\u00f3n"),
    category: normalizeExpenseChoice(record.category, EXPENSE_CATEGORIES, "Otro"),
    concept: String(record.concept || "").trim(),
    amountRequested: roundExpenseMoney(record.amountRequested),
    amountApproved: record.amountApproved === null || record.amountApproved === undefined || record.amountApproved === "" ? null : roundExpenseMoney(record.amountApproved),
    currency: "EUR",
    paidBy: normalizeExpenseChoice(record.paidBy, EXPENSE_PAID_BY, "Pendiente de pago"),
    paymentMethod: normalizeExpenseChoice(record.paymentMethod, EXPENSE_PAYMENT_METHODS, "No indicado"),
    status: normalizeExpenseChoice(record.status, EXPENSE_STATUSES, "Borrador"),
    expenseDate: normalizeExpenseDate(record.expenseDate),
    createdAt: normalizeExpenseIsoDate(record.createdAt, new Date().toISOString()),
    updatedAt: normalizeExpenseIsoDate(record.updatedAt, record.createdAt || new Date().toISOString()),
    createdByUserId: String(record.createdByUserId || "").trim(),
    createdByName: String(record.createdByName || "").trim(),
    createdByRole: getExpenseContextFromSubject({ activeContext: record.createdByRole }) || String(record.createdByRole || "").trim(),
    claimantType: normalizeNullableExpenseChoice(record.claimantType, EXPENSE_CLAIMANT_TYPES),
    claimantId: normalizeExpenseNullableString(record.claimantId),
    claimantName: normalizeExpenseNullableString(record.claimantName),
    vehicleId: normalizeExpenseNullableString(record.vehicleId),
    serviceId: normalizeExpenseNullableString(record.serviceId),
    providerName: normalizeExpenseNullableString(record.providerName),
    description: String(record.description || "").trim(),
    observations: String(record.observations || "").trim(),
    requiresExceptionalApproval: Boolean(record.requiresExceptionalApproval),
    receipt: normalizeExpenseReceipt(record.receipt),
    review: normalizeExpenseReview(record.review),
    reimbursement: normalizeExpenseSettlement(record.reimbursement),
    payment: normalizeExpenseSettlement(record.payment),
    cancellation: normalizeExpenseCancellation(record.cancellation),
  };

  normalizedRecord.requiresExceptionalApproval = shouldRequireExceptionalExpenseApproval(normalizedRecord);

  return normalizedRecord;
}

function validateExpenseDraft(record = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const errors = [];

  if (!normalizedRecord.expenseId) {
    errors.push("El gasto necesita un identificador.");
  }

  if (!normalizedRecord.concept) {
    errors.push("El concepto del gasto es obligatorio.");
  }

  if (!isValidExpenseAmount(record.amountRequested) || normalizedRecord.amountRequested <= 0) {
    errors.push("El importe solicitado debe ser mayor que 0.");
  }

  if (!normalizedRecord.expenseDate) {
    errors.push("La fecha del gasto es obligatoria.");
  }

  if (normalizedRecord.amountApproved !== null && (!isValidExpenseAmount(record.amountApproved) || normalizedRecord.amountApproved <= 0)) {
    errors.push("El importe aprobado debe ser mayor que 0.");
  }

  if (normalizedRecord.amountApproved !== null && normalizedRecord.amountApproved > normalizedRecord.amountRequested) {
    errors.push("El importe aprobado no puede superar el solicitado.");
  }

  if (normalizedRecord.recordType === "Solicitud" && ["Aprobada", "Aprobada parcialmente", "Pagada", "Reembolsada"].includes(normalizedRecord.status) && !normalizedRecord.review.reviewedAt) {
    errors.push("Una solicitud no puede nacer como aprobada, pagada o reembolsada.");
  }

  validateExpenseReferences(normalizedRecord).forEach((error) => errors.push(error));

  return {
    ok: errors.length === 0,
    data: normalizedRecord,
    error: errors[0] || "",
    errors,
  };
}

function createExpenseRecord(payload = {}, currentSession = {}) {
  const sessionUser = getExpenseSessionUser(currentSession);
  const context = getExpenseContextFromSubject(sessionUser);
  const createdAt = new Date().toISOString();
  const draft = Object.assign({}, payload);

  if (context === "conductor") {
    if (!canCreateOwnExpenseRequest(sessionUser)) {
      return createExpenseResult(false, null, "No tienes permiso para crear solicitudes de gastos.");
    }

    const claimant = getExpenseCollaboratorById(sessionUser.driverId);
    const claimantType = claimant?.driverType === "Colaborador" ? "Colaborador" : "Chofer";
    draft.recordType = "Solicitud";
    draft.source = claimantType === "Colaborador" ? "Portal colaborador" : "Portal conductor";
    draft.status = "Pendiente de revisi\u00f3n";
    draft.claimantType = claimantType;
    draft.claimantId = sessionUser.driverId || null;
    draft.claimantName = claimant?.name || getExpenseCollaboratorName(draft.claimantId);
    draft.paidBy = claimantType;
    draft.amountApproved = null;
  } else if (!canCreateAdministrativeExpense(sessionUser)) {
    return createExpenseResult(false, null, "No tienes permiso para crear gastos.");
  }

  draft.expenseId = draft.expenseId || getNextExpenseId();
  draft.currency = "EUR";
  draft.createdAt = createdAt;
  draft.updatedAt = createdAt;
  draft.createdByUserId = sessionUser?.id || "";
  draft.createdByName = sessionUser?.name || "Sistema";
  draft.createdByRole = context || "";
  draft.receipt = Object.assign({ status: context === "conductor" ? "No adjunto" : "No requerido" }, draft.receipt || {});

  if (draft.recordType === "Gasto" && draft.paidBy === "ELARA" && draft.status === "Pagada") {
    draft.amountApproved = draft.amountApproved || draft.amountRequested;
    draft.payment = Object.assign({}, draft.payment || {}, {
      required: true,
      status: "Pagado",
      amount: roundExpenseMoney(draft.amountApproved || draft.amountRequested),
      paidAt: draft.payment?.paidAt || createdAt,
      paidByUserId: draft.payment?.paidByUserId || sessionUser?.id || "",
      paidByName: draft.payment?.paidByName || sessionUser?.name || "Sistema",
    });
  }

  const validation = validateExpenseDraft(draft);

  if (!validation.ok) {
    return createExpenseResult(false, validation.data, validation.error, validation.errors);
  }

  if (getExpenseById(validation.data.expenseId)) {
    return createExpenseResult(false, null, "Ya existe un gasto con ese identificador.");
  }

  expensesData.expenses.push(validation.data);
  emitExpensesUpdatedEvent("created", validation.data.expenseId);

  return createExpenseResult(true, validation.data);
}

function calculateApprovedExpenseAmount(record) {
  const normalizedRecord = normalizeExpenseRecord(record);

  return normalizedRecord.amountApproved === null ? 0 : roundExpenseMoney(normalizedRecord.amountApproved);
}

function canReviewExpense(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const context = getExpenseContextFromSubject(getExpenseSessionUser(currentSession));

  return ["superadmin", "administrativo"].includes(context) && ["Pendiente de revisi\u00f3n", "Requiere informaci\u00f3n"].includes(normalizedRecord.status);
}

function canApproveExpense(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const context = getExpenseContextFromSubject(getExpenseSessionUser(currentSession));

  if (!canReviewExpense(normalizedRecord, currentSession)) {
    return false;
  }

  return !normalizedRecord.requiresExceptionalApproval || context === "superadmin";
}

function canRejectExpense(record, currentSession = {}) {
  return canReviewExpense(record, currentSession);
}

function canRequestExpenseInformation(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);

  return canReviewExpense(normalizedRecord, currentSession) && normalizedRecord.status === "Pendiente de revisi\u00f3n";
}

function canReimburseExpense(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const context = getExpenseContextFromSubject(getExpenseSessionUser(currentSession));

  return (
    ["superadmin", "administrativo"].includes(context) &&
    normalizedRecord.status === "Pendiente de reembolso" &&
    normalizedRecord.reimbursement.required === true &&
    normalizedRecord.reimbursement.status === "Pendiente"
  );
}

function canPayExpense(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const context = getExpenseContextFromSubject(getExpenseSessionUser(currentSession));

  return (
    ["superadmin", "administrativo"].includes(context) &&
    normalizedRecord.status === "Pendiente de pago" &&
    normalizedRecord.payment.required === true &&
    normalizedRecord.payment.status === "Pendiente"
  );
}

function canCancelExpense(record, currentSession = {}) {
  const normalizedRecord = normalizeExpenseRecord(record);
  const context = getExpenseContextFromSubject(getExpenseSessionUser(currentSession));

  if (context !== "superadmin" || normalizedRecord.status === "Anulada") {
    return false;
  }

  return normalizedRecord.payment.status !== "Pagado" && normalizedRecord.reimbursement.status !== "Pagado" && !["Pagada", "Reembolsada"].includes(normalizedRecord.status);
}

function approveExpense(expenseId, approvedAmount, reviewData = {}, currentSession = {}) {
  const expense = getExpenseById(expenseId);

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (!canApproveExpense(expense, currentSession)) {
    return createExpenseResult(false, expense, "No tienes permiso para aprobar este gasto.");
  }

  const amount = roundExpenseMoney(approvedAmount);

  if (!isValidExpenseAmount(approvedAmount) || amount <= 0) {
    return createExpenseResult(false, expense, "El importe aprobado debe ser mayor que 0.");
  }

  if (amount > roundExpenseMoney(expense.amountRequested)) {
    return createExpenseResult(false, expense, "El importe aprobado no puede superar el solicitado.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  expense.amountApproved = amount;
  expense.review = {
    reviewedAt: now,
    reviewedByUserId: sessionUser?.id || "",
    reviewedByName: sessionUser?.name || "Sistema",
    decision: amount === roundExpenseMoney(expense.amountRequested) ? "Aprobada" : "Aprobada parcialmente",
    reason: String(reviewData.reason || reviewData.observations || "").trim() || null,
  };

  if (["Chofer", "Colaborador"].includes(expense.paidBy)) {
    expense.reimbursement = Object.assign({}, expense.reimbursement, {
      required: true,
      status: "Pendiente",
      amount,
      paidAt: null,
      paidByUserId: null,
      paidByName: null,
      cashMovementId: null,
    });
    expense.payment = createExpenseSettlement(false);
    expense.status = "Pendiente de reembolso";
  } else {
    expense.payment = Object.assign({}, expense.payment, {
      required: true,
      status: "Pendiente",
      amount,
      paidAt: null,
      paidByUserId: null,
      paidByName: null,
      cashMovementId: null,
    });
    expense.reimbursement = createExpenseSettlement(false);
    expense.status = "Pendiente de pago";
  }

  expense.updatedAt = now;
  emitExpensesUpdatedEvent("approved", expense.expenseId);

  return createExpenseResult(true, expense);
}

function rejectExpense(expenseId, reason, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const normalizedReason = String(reason || "").trim();

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (!normalizedReason) {
    return createExpenseResult(false, expense, "El motivo de rechazo es obligatorio.");
  }

  if (!canRejectExpense(expense, currentSession)) {
    return createExpenseResult(false, expense, "No tienes permiso para rechazar este gasto.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  expense.status = "Rechazada";
  expense.amountApproved = null;
  expense.review = {
    reviewedAt: now,
    reviewedByUserId: sessionUser?.id || "",
    reviewedByName: sessionUser?.name || "Sistema",
    decision: "Rechazada",
    reason: normalizedReason,
  };
  expense.payment = createExpenseSettlement(false);
  expense.reimbursement = createExpenseSettlement(false);
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("rejected", expense.expenseId);

  return createExpenseResult(true, expense);
}

function requestExpenseInformation(expenseId, reason, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const normalizedReason = String(reason || "").trim();

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (!normalizedReason) {
    return createExpenseResult(false, expense, "El motivo de solicitud de informacion es obligatorio.");
  }

  if (!canRequestExpenseInformation(expense, currentSession)) {
    return createExpenseResult(false, expense, "No tienes permiso para solicitar informacion de este gasto.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  expense.status = "Requiere informaci\u00f3n";
  expense.review = {
    reviewedAt: now,
    reviewedByUserId: sessionUser?.id || "",
    reviewedByName: sessionUser?.name || "Sistema",
    decision: "Requiere informaci\u00f3n",
    reason: normalizedReason,
  };
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("information-required", expense.expenseId);

  return createExpenseResult(true, expense);
}

function respondExpenseInformation(expenseId, responseData = {}, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const sessionUser = getExpenseSessionUser(currentSession);
  const driverId = String(sessionUser?.driverId || "").trim();
  const response = String(responseData.response || "").trim();

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (getExpenseContextFromSubject(sessionUser) !== "conductor" || !driverId || expense.claimantId !== driverId) {
    return createExpenseResult(false, expense, "No tienes permiso para responder esta solicitud.");
  }

  if (expense.status !== "Requiere informaci\u00f3n") {
    return createExpenseResult(false, expense, "Esta solicitud no requiere informacion adicional.");
  }

  if (!response) {
    return createExpenseResult(false, expense, "La respuesta es obligatoria.");
  }

  const receiptStatus = normalizeDriverExpenseReceiptStatus(responseData.receiptStatus);
  const now = new Date().toISOString();
  const previousInformationRequest = {
    requestedAt: expense.review.reviewedAt,
    requestedByUserId: expense.review.reviewedByUserId,
    requestedByName: expense.review.reviewedByName,
    reason: expense.review.reason,
  };
  const responseEntry = {
    respondedAt: now,
    respondedByUserId: sessionUser?.id || "",
    respondedByName: sessionUser?.name || expense.claimantName || "Conductor",
    response,
    previousInformationRequest,
  };

  expense.informationResponses = Array.isArray(expense.informationResponses) ? expense.informationResponses : [];
  expense.informationResponses.push(responseEntry);
  expense.driverResponse = responseEntry;
  expense.description = String(responseData.description ?? expense.description ?? "").trim();
  expense.providerName = String(responseData.providerName ?? expense.providerName ?? "").trim();
  expense.observations = String(responseData.observations ?? expense.observations ?? "").trim();

  if (receiptStatus) {
    expense.receipt = Object.assign({}, expense.receipt, {
      status: receiptStatus,
    });
  }

  expense.status = "Pendiente de revisi\u00f3n";
  expense.review = Object.assign({}, expense.review, {
    decision: null,
    reason: null,
  });
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("information-answered", expense.expenseId);

  return createExpenseResult(true, expense);
}

function registerExpenseReimbursement(expenseId, paymentData = {}, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const paymentMethod = normalizeExpenseChoice(paymentData.paymentMethod, EXPENSE_PAYMENT_METHODS, "Efectivo");

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (paymentMethod !== "Efectivo") {
    return createExpenseResult(false, expense, "En esta fase el reembolso solo puede prepararse en efectivo.");
  }

  if (!canReimburseExpense(expense, currentSession)) {
    return createExpenseResult(false, expense, "No se puede registrar el reembolso de este gasto.");
  }

  if (expense.reimbursement.status === "Pagado") {
    return createExpenseResult(false, expense, "Este gasto ya fue reembolsado.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  const amount = roundExpenseMoney(expense.amountApproved);
  expense.reimbursement = Object.assign({}, expense.reimbursement, {
    required: true,
    status: "Pagado",
    amount,
    paidAt: now,
    paidByUserId: sessionUser?.id || "",
    paidByName: sessionUser?.name || "Sistema",
    cashMovementId: normalizeExpenseNullableString(paymentData.cashMovementId),
  });
  expense.status = "Reembolsada";
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("reimbursed", expense.expenseId);

  return createExpenseResult(true, expense);
}

function registerExpensePayment(expenseId, paymentData = {}, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const paymentMethod = normalizeExpenseChoice(paymentData.paymentMethod, EXPENSE_PAYMENT_METHODS, "Efectivo");

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (!canPayExpense(expense, currentSession)) {
    return createExpenseResult(false, expense, "No se puede registrar el pago de este gasto.");
  }

  if (expense.payment.status === "Pagado") {
    return createExpenseResult(false, expense, "Este gasto ya fue pagado.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  const amount = roundExpenseMoney(expense.amountApproved);
  expense.paymentMethod = paymentMethod;
  expense.payment = Object.assign({}, expense.payment, {
    required: true,
    status: "Pagado",
    amount,
    paidAt: now,
    paidByUserId: sessionUser?.id || "",
    paidByName: sessionUser?.name || "Sistema",
    cashMovementId: normalizeExpenseNullableString(paymentData.cashMovementId),
  });
  expense.status = "Pagada";
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("paid", expense.expenseId);

  return createExpenseResult(true, expense);
}

function cancelExpense(expenseId, reason, currentSession = {}) {
  const expense = getExpenseById(expenseId);
  const normalizedReason = String(reason || "").trim();

  if (!expense) {
    return createExpenseResult(false, null, "No se encontro el gasto indicado.");
  }

  if (!normalizedReason) {
    return createExpenseResult(false, expense, "El motivo de anulacion es obligatorio.");
  }

  if (["Pagada", "Reembolsada"].includes(expense.status) || expense.payment.status === "Pagado" || expense.reimbursement.status === "Pagado") {
    return createExpenseResult(false, expense, "La anulacion de gastos pagados o reembolsados requerira una reversion futura.");
  }

  if (!canCancelExpense(expense, currentSession)) {
    return createExpenseResult(false, expense, "No tienes permiso para anular este gasto.");
  }

  const sessionUser = getExpenseSessionUser(currentSession);
  const now = new Date().toISOString();
  expense.status = "Anulada";
  expense.cancellation = {
    cancelledAt: now,
    cancelledByUserId: sessionUser?.id || "",
    cancelledByName: sessionUser?.name || "Sistema",
    reason: normalizedReason,
  };
  expense.updatedAt = now;
  emitExpensesUpdatedEvent("cancelled", expense.expenseId);

  return createExpenseResult(true, expense);
}

function getExpenseById(expenseId) {
  const normalizedExpenseId = String(expenseId || "").trim();

  return getExpensesCollection().find((expense) => expense.expenseId === normalizedExpenseId) || null;
}

function getExpensesForDriver(driverId) {
  const normalizedDriverId = String(driverId || "").trim();

  if (!normalizedDriverId) {
    return [];
  }

  return getExpensesCollection().filter((expense) => expense.claimantId === normalizedDriverId).map(normalizeExpenseRecord);
}

function getExpenseSummary(filters = {}) {
  const filteredExpenses = getFilteredExpenses(filters);

  return filteredExpenses.reduce(
    (summary, expense) => {
      if (expense.status === "Anulada") {
        return summary;
      }

      summary.totalRequested = roundExpenseMoney(summary.totalRequested + expense.amountRequested);

      if (!["Rechazada", "Pendiente de revisi\u00f3n", "Requiere informaci\u00f3n", "Borrador"].includes(expense.status)) {
        summary.totalApproved = roundExpenseMoney(summary.totalApproved + roundExpenseMoney(expense.amountApproved));
      }

      if (expense.payment.status === "Pagado") {
        summary.totalPaid = roundExpenseMoney(summary.totalPaid + expense.payment.amount);
      }

      if (expense.reimbursement.status === "Pagado") {
        summary.totalPaid = roundExpenseMoney(summary.totalPaid + expense.reimbursement.amount);
      }

      if (expense.status === "Pendiente de revisi\u00f3n") {
        summary.pendingReviewCount += 1;
      }

      if (expense.payment.required && expense.payment.status === "Pendiente") {
        summary.pendingPaymentAmount = roundExpenseMoney(summary.pendingPaymentAmount + expense.payment.amount);
      }

      if (expense.reimbursement.required && expense.reimbursement.status === "Pendiente") {
        summary.pendingReimbursementAmount = roundExpenseMoney(summary.pendingReimbursementAmount + expense.reimbursement.amount);
      }

      if (expense.status === "Rechazada") {
        summary.rejectedCount += 1;
      }

      if (expense.requiresExceptionalApproval && expense.status === "Pendiente de revisi\u00f3n") {
        summary.exceptionalPendingCount += 1;
      }

      return summary;
    },
    {
      totalRequested: 0,
      totalApproved: 0,
      totalPaid: 0,
      pendingReviewCount: 0,
      pendingPaymentAmount: 0,
      pendingReimbursementAmount: 0,
      rejectedCount: 0,
      exceptionalPendingCount: 0,
    },
  );
}

function checkExpenseIntegrity() {
  const warnings = [];
  const seenIds = new Set();

  getExpensesCollection().forEach((expense) => {
    const normalizedExpense = normalizeExpenseRecord(expense);
    const expenseLabel = normalizedExpense.expenseId || "Sin ID";

    if (seenIds.has(normalizedExpense.expenseId)) {
      warnings.push(`${expenseLabel}: expenseId duplicado.`);
    }
    seenIds.add(normalizedExpense.expenseId);

    if (!isValidExpenseAmount(expense.amountRequested) || normalizedExpense.amountRequested < 0) {
      warnings.push(`${expenseLabel}: importe solicitado invalido.`);
    }

    if (normalizedExpense.amountApproved !== null && normalizedExpense.amountApproved > normalizedExpense.amountRequested) {
      warnings.push(`${expenseLabel}: amountApproved supera amountRequested.`);
    }

    if (normalizedExpense.reimbursement.required && !EXPENSE_APPROVED_STATUSES.includes(normalizedExpense.status)) {
      warnings.push(`${expenseLabel}: reembolso en registro no aprobado.`);
    }

    if (normalizedExpense.payment.status === "Pagado" && normalizedExpense.status !== "Pagada") {
      warnings.push(`${expenseLabel}: pago incompatible con estado.`);
    }

    if (normalizedExpense.reimbursement.status === "Pagado" && normalizedExpense.status !== "Reembolsada") {
      warnings.push(`${expenseLabel}: reembolso incompatible con estado.`);
    }

    if (normalizedExpense.payment.status === "Pagado" && normalizedExpense.reimbursement.status === "Pagado") {
      warnings.push(`${expenseLabel}: pago y reembolso duplicados.`);
    }

    if (normalizedExpense.payment.required && normalizedExpense.payment.status === "Pagado" && normalizedExpense.payment.amount <= 0) {
      warnings.push(`${expenseLabel}: pago duplicado o importe de pago invalido.`);
    }

    if (normalizedExpense.reimbursement.required && normalizedExpense.reimbursement.status === "Pagado" && normalizedExpense.reimbursement.amount <= 0) {
      warnings.push(`${expenseLabel}: reembolso duplicado o importe de reembolso invalido.`);
    }

    validateExpenseCashMovements(normalizedExpense).forEach((error) => warnings.push(`${expenseLabel}: ${error}`));
    validateExpenseReferences(normalizedExpense).forEach((error) => warnings.push(`${expenseLabel}: ${error}`));

    if (normalizedExpense.status === "Anulada" && (normalizedExpense.payment.status === "Pagado" || normalizedExpense.reimbursement.status === "Pagado")) {
      warnings.push(`${expenseLabel}: gasto anulado computado como activo o ya liquidado.`);
    }

    if (normalizedExpense.requiresExceptionalApproval && normalizedExpense.review.decision && normalizedExpense.review.reviewedByUserId) {
      const reviewer = getExpenseUserById(normalizedExpense.review.reviewedByUserId);
      const reviewerContext = getExpenseContextFromSubject(reviewer);

      if (reviewerContext !== "superadmin") {
        warnings.push(`${expenseLabel}: colaborador excepcional aprobado por rol no autorizado.`);
      }
    }
  });

  validateExpenseCashMovementOrphans().forEach((error) => warnings.push(error));

  warnings.forEach((warning) => console.warn("[ELARA] Integridad de gastos:", warning));

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

function validateExpenseCashMovements(expense) {
  const warnings = [];

  if (expense.payment.status === "Pagado") {
    warnings.push(...validateExpenseSettlementCashMovement(expense, "payment"));
  }

  if (expense.reimbursement.status === "Pagado") {
    warnings.push(...validateExpenseSettlementCashMovement(expense, "reimbursement"));
  }

  return warnings;
}

function validateExpenseSettlementCashMovement(expense, settlementType) {
  const warnings = [];
  const financeMovements = getExpenseFinanceMovements();

  if (!financeMovements) {
    return warnings;
  }

  const settlement = settlementType === "reimbursement" ? expense.reimbursement : expense.payment;
  const expectedCategory = getExpenseCashMovementCategory(expense.expenseId, settlementType);
  const validMovements = financeMovements.filter(
    (movement) =>
      movement.status !== "Anulado" &&
      isExpenseCashMovement(movement) &&
      getExpenseCashMovementExpenseId(movement) === expense.expenseId &&
      movement.category === expectedCategory,
  );

  if (!validMovements.length) {
    warnings.push(`${settlementType === "reimbursement" ? "reembolso" : "pago"} sin movimiento de Caja.`);
    return warnings;
  }

  if (validMovements.length > 1) {
    warnings.push(`${settlementType === "reimbursement" ? "reembolso" : "pago"} con movimientos de Caja duplicados.`);
  }

  const referencedMovement = settlement.cashMovementId
    ? financeMovements.find((movement) => movement.id === settlement.cashMovementId)
    : null;

  if (settlement.cashMovementId && !referencedMovement) {
    warnings.push(`referencia de Caja inexistente: ${settlement.cashMovementId}.`);
  }

  const movement = referencedMovement || validMovements[0];

  if (movement.status === "Anulado") {
    warnings.push(`referencia de Caja anulada: ${movement.id}.`);
  }

  if (roundExpenseMoney(movement.amount) !== roundExpenseMoney(settlement.amount)) {
    warnings.push(`importe de Caja inconsistente en ${movement.id}.`);
  }

  if (movement.type !== "Salida") {
    warnings.push(`movimiento de Caja no es salida en ${movement.id}.`);
  }

  return warnings;
}

function validateExpenseCashMovementOrphans() {
  const financeMovements = getExpenseFinanceMovements();

  if (!financeMovements) {
    return [];
  }

  const expenseIds = new Set(getExpensesCollection().map((expense) => normalizeExpenseRecord(expense).expenseId));

  return financeMovements
    .filter((movement) => movement.status !== "Anulado" && isExpenseCashMovement(movement))
    .reduce((warnings, movement) => {
      const expenseId = getExpenseCashMovementExpenseId(movement);

      if (!expenseId || !expenseIds.has(expenseId)) {
        warnings.push(`${movement.id || "Movimiento sin ID"}: movimiento de gasto sin expenseId valido.`);
      }

      return warnings;
    }, []);
}

function getExpenseCategories() {
  return EXPENSE_CATEGORIES.slice();
}

function getExpenseStatuses() {
  return EXPENSE_STATUSES.slice();
}

function getExpenseSources() {
  return EXPENSE_SOURCES.slice();
}

function getFilteredExpenses(filters = {}) {
  const driverId = String(filters.driverId || "").trim();
  const statuses = normalizeExpenseFilterValues(filters.statuses || filters.status);
  const categories = normalizeExpenseFilterValues(filters.categories || filters.category);
  const recordTypes = normalizeExpenseFilterValues(filters.recordTypes || filters.recordType);
  const paidByValues = normalizeExpenseFilterValues(filters.paidByValues || filters.paidBy);
  const query = normalizeExpenseSearchText(filters.query || filters.search);
  const from = normalizeExpenseDate(filters.from || filters.dateFrom);
  const to = normalizeExpenseDate(filters.to || filters.dateTo);
  const exceptional = String(filters.exceptional || "").trim();
  const includeCancelled = Boolean(filters.includeCancelled);

  return getExpensesCollection()
    .map(normalizeExpenseRecord)
    .filter((expense) => {
      if (!includeCancelled && expense.status === "Anulada") {
        return false;
      }

      if (driverId && expense.claimantId !== driverId) {
        return false;
      }

      if (statuses.length && !statuses.includes(expense.status)) {
        return false;
      }

      if (categories.length && !categories.includes(expense.category)) {
        return false;
      }

      if (recordTypes.length && !recordTypes.includes(expense.recordType)) {
        return false;
      }

      if (paidByValues.length && !paidByValues.includes(expense.paidBy)) {
        return false;
      }

      if (from && expense.expenseDate < from) {
        return false;
      }

      if (to && expense.expenseDate > to) {
        return false;
      }

      if (exceptional === "yes" && !expense.requiresExceptionalApproval) {
        return false;
      }

      if (exceptional === "no" && expense.requiresExceptionalApproval) {
        return false;
      }

      if (query && !getExpenseSearchHaystack(expense).includes(query)) {
        return false;
      }

      return true;
    });
}

function normalizeExpenseFilterValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const text = String(value || "").trim();

  return text ? [text] : [];
}

function normalizeExpenseSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getExpenseSearchHaystack(expense) {
  return normalizeExpenseSearchText(
    [
      expense.expenseId,
      expense.concept,
      expense.providerName,
      expense.claimantName,
      expense.createdByName,
      expense.vehicleId,
      getExpenseVehicleById(expense.vehicleId)?.plate,
      getExpenseVehicleLabel(expense.vehicleId),
      expense.serviceId,
    ].join(" "),
  );
}

function validateExpenseReferences(expense) {
  const errors = [];

  if (expense.createdByUserId && !getExpenseUserById(expense.createdByUserId)) {
    errors.push("Referencia a usuario inexistente.");
  }

  if (expense.claimantId && !getExpenseCollaboratorById(expense.claimantId)) {
    errors.push("Referencia a conductor o colaborador inexistente.");
  }

  if (expense.vehicleId && !getExpenseVehicleById(expense.vehicleId)) {
    errors.push("Referencia a vehiculo inexistente.");
  }

  if (expense.serviceId && !getExpenseServiceById(expense.serviceId)) {
    errors.push("Referencia a servicio inexistente.");
  }

  return errors;
}

function shouldRequireExceptionalExpenseApproval(record) {
  return record.claimantType === "Colaborador" && EXPENSE_EXCEPTIONAL_COLLABORATOR_CATEGORIES.includes(record.category);
}

function canCreateOwnExpenseRequest(sessionUser) {
  return getExpenseContextFromSubject(sessionUser) === "conductor" && Boolean(sessionUser?.driverId);
}

function canCreateAdministrativeExpense(sessionUser) {
  const context = getExpenseContextFromSubject(sessionUser);

  return ["superadmin", "administrativo"].includes(context);
}

function getExpensesCollection() {
  expensesData.expenses = Array.isArray(expensesData.expenses) ? expensesData.expenses : [];

  return expensesData.expenses;
}

function getExpenseSessionUser(currentSession = {}) {
  return currentSession?.user || currentSession || {};
}

function getExpenseContextFromSubject(subject = {}) {
  const directContext = normalizeExpenseContext(subject?.activeContext) || normalizeExpenseContext(subject?.role);

  if (directContext) {
    return directContext;
  }

  if (window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function") {
    return normalizeExpenseContext(window.ElaraAuth.getActiveContext());
  }

  return "";
}

function createExpenseSettlement(required) {
  return {
    required: Boolean(required),
    status: required ? "Pendiente" : "No aplica",
    amount: 0,
    paidAt: null,
    paidByUserId: null,
    paidByName: null,
    cashMovementId: null,
  };
}

function normalizeExpenseReceipt(receipt = {}) {
  return {
    status: normalizeExpenseReceiptStatus(receipt.status),
    fileName: normalizeExpenseNullableString(receipt.fileName),
    fileReference: normalizeExpenseNullableString(receipt.fileReference),
  };
}

function normalizeExpenseReceiptStatus(status) {
  const normalizedStatus = String(status || "").trim();
  const receiptStatusMap = {
    Adjunto: "Adjunto",
    "Pendiente de adjuntar": "Pendiente de adjuntar",
    "No disponible": "No disponible",
    "No requerido": "No requerido",
    "No adjunto": "No adjunto",
  };

  return receiptStatusMap[normalizedStatus] || normalizeExpenseChoice(normalizedStatus, EXPENSE_RECEIPT_STATUSES, "No adjunto");
}

function normalizeDriverExpenseReceiptStatus(status) {
  const normalizedStatus = String(status || "").trim();
  const receiptStatusMap = {
    Adjunto: "Adjunto",
    "Pendiente de adjuntar": "Pendiente de adjuntar",
    "No disponible": "No disponible",
    "No requerido": "No requerido",
    "No adjunto": "No adjunto",
  };

  return receiptStatusMap[normalizedStatus] || "";
}

function normalizeExpenseReview(review = {}) {
  return {
    reviewedAt: normalizeExpenseNullableString(review.reviewedAt),
    reviewedByUserId: normalizeExpenseNullableString(review.reviewedByUserId),
    reviewedByName: normalizeExpenseNullableString(review.reviewedByName),
    decision: normalizeExpenseNullableString(review.decision),
    reason: normalizeExpenseNullableString(review.reason),
  };
}

function normalizeExpenseSettlement(settlement = {}) {
  const required = Boolean(settlement.required);

  return {
    required,
    status: normalizeExpenseChoice(settlement.status, EXPENSE_SETTLEMENT_STATUSES, required ? "Pendiente" : "No aplica"),
    amount: roundExpenseMoney(settlement.amount),
    paidAt: normalizeExpenseNullableString(settlement.paidAt),
    paidByUserId: normalizeExpenseNullableString(settlement.paidByUserId),
    paidByName: normalizeExpenseNullableString(settlement.paidByName),
    cashMovementId: normalizeExpenseNullableString(settlement.cashMovementId),
  };
}

function normalizeExpenseCancellation(cancellation = {}) {
  return {
    cancelledAt: normalizeExpenseNullableString(cancellation.cancelledAt),
    cancelledByUserId: normalizeExpenseNullableString(cancellation.cancelledByUserId),
    cancelledByName: normalizeExpenseNullableString(cancellation.cancelledByName),
    reason: normalizeExpenseNullableString(cancellation.reason),
  };
}

function normalizeExpenseChoice(value, validValues, fallback) {
  const normalizedValue = String(value || "").trim();

  return validValues.includes(normalizedValue) ? normalizedValue : fallback;
}

function normalizeNullableExpenseChoice(value, validValues) {
  const normalizedValue = String(value || "").trim();

  return validValues.includes(normalizedValue) ? normalizedValue : null;
}

function normalizeExpenseDate(value) {
  const normalizedValue = String(value || "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function normalizeExpenseIsoDate(value, fallback) {
  const normalizedValue = String(value || "").trim();
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeExpenseNullableString(value) {
  const normalizedValue = String(value || "").trim();

  return normalizedValue || null;
}

function parseExpenseAmount(value) {
  return Number(String(value ?? "").replace(",", "."));
}

function isValidExpenseAmount(value) {
  const amount = parseExpenseAmount(value);

  return Number.isFinite(amount);
}

function normalizeExpenseContext(context) {
  const normalizedContext = String(context || "").trim().toLowerCase();

  return ["superadmin", "administrativo", "conductor"].includes(normalizedContext) ? normalizedContext : "";
}

function getNextExpenseId() {
  const nextNumber =
    getExpensesCollection().reduce((maxNumber, expense) => {
      const match = String(expense.expenseId || expense.id || "").match(/^EXP-(\d+)$/);
      const currentNumber = match ? Number(match[1]) : 0;

      return Math.max(maxNumber, currentNumber);
    }, 0) + 1;

  return `EXP-${String(nextNumber).padStart(4, "0")}`;
}

function getExpenseUserById(userId) {
  const normalizedUserId = String(userId || "").trim();
  const users = Array.isArray(window.ElaraUsersMock)
    ? window.ElaraUsersMock
    : Array.isArray(window.ElaraUsersMock?.users)
      ? window.ElaraUsersMock.users
      : [];

  return users.find((user) => user.id === normalizedUserId) || null;
}

function getExpenseCollaboratorById(collaboratorId) {
  const normalizedCollaboratorId = String(collaboratorId || "").trim();

  return (window.ElaraCollaboratorsMock?.collaborators || []).find((collaborator) => collaborator.id === normalizedCollaboratorId) || null;
}

function getExpenseCollaboratorName(collaboratorId) {
  return getExpenseCollaboratorById(collaboratorId)?.name || null;
}

function getExpenseFinanceMovements() {
  return Array.isArray(window.ElaraFinanceMock?.cashMovements) ? window.ElaraFinanceMock.cashMovements : null;
}

function getExpenseCashMovementExpenseId(movement) {
  return String(movement?.expenseId || (movement?.sourceType === "expense" ? movement?.sourceId : "") || "").trim();
}

function isExpenseCashMovement(movement) {
  const category = String(movement?.category || "").trim();

  return movement?.sourceType === "expense" || Boolean(movement?.expenseId) || category.startsWith("Pago de gasto") || category.startsWith("Reembolso de gasto");
}

function getExpenseCashMovementCategory(expenseId, settlementType) {
  return `${settlementType === "reimbursement" ? "Reembolso de gasto" : "Pago de gasto"} ${expenseId}`;
}

function getExpenseVehicleById(vehicleId) {
  const normalizedVehicleId = String(vehicleId || "").trim();

  return (window.ElaraVehiclesMock?.vehicles || []).find((vehicle) => vehicle.id === normalizedVehicleId) || null;
}

function getExpenseVehicleLabel(vehicleId) {
  const vehicle = getExpenseVehicleById(vehicleId);

  return vehicle ? `${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.plate || ""}` : "";
}

function getExpenseServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();

  return (window.ElaraServicesMock?.services || []).find((service) => service.serviceId === normalizedServiceId || service.id === normalizedServiceId) || null;
}

function createExpenseResult(ok, data = null, error = "", errors = []) {
  return {
    ok: Boolean(ok),
    data,
    error,
    errors,
  };
}

function emitExpensesUpdatedEvent(reason, expenseId) {
  window.dispatchEvent(
    new CustomEvent(EXPENSES_EVENT, {
      detail: {
        reason,
        expenseId,
      },
    }),
  );
}

function prepareExpenseCashMovementDraft(expense, operationType) {
  return {
    type: "Salida",
    category: operationType === "reimbursement" ? "Reembolso de gasto" : "Pago de gasto",
    amount: roundExpenseMoney(operationType === "reimbursement" ? expense.reimbursement.amount : expense.payment.amount),
    expenseId: expense.expenseId,
    cashMovementId: operationType === "reimbursement" ? expense.reimbursement.cashMovementId : expense.payment.cashMovementId,
    integrationStatus: "Pendiente de integraci\u00f3n con Caja",
  };
}

window.ElaraExpensesCore = {
  approveExpense,
  calculateApprovedExpenseAmount,
  canApproveExpense,
  canCancelExpense,
  canPayExpense,
  canRejectExpense,
  canReimburseExpense,
  canRequestExpenseInformation,
  canReviewExpense,
  cancelExpense,
  checkExpenseIntegrity,
  createExpenseRecord,
  getExpenseById,
  getExpenseCategories,
  getExpensesForDriver,
  getExpenseSources,
  getExpenseStatuses,
  getExpenseSummary,
  normalizeExpenseRecord,
  prepareExpenseCashMovementDraft,
  registerExpensePayment,
  registerExpenseReimbursement,
  rejectExpense,
  respondExpenseInformation,
  requestExpenseInformation,
  roundExpenseMoney,
  validateExpenseDraft,
};
