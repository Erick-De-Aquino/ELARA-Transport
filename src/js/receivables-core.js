/*
  Proyecto Atlas / ELARA Transport
  Archivo: receivables-core.js
  Responsabilidad: nucleo mock de Cuentas por cobrar.
*/

"use strict";

const receivablesData = window.ElaraReceivablesMock || {
  settings: { currency: "EUR" },
  receivables: [],
  payments: [],
};

const RECEIVABLES_EVENT = "elara:receivables-updated";
const RECEIVABLE_STATUSES = ["Pendiente", "Cobrada", "Anulada"];
const RECEIVABLE_PAYMENT_STATUSES = ["Registrado", "Anulado"];
const RECEIVABLE_PAYMENT_METHODS = ["Efectivo", "Transferencia"];
const RECEIVABLE_SERVICE_EXCLUDED_STATUSES = ["Cancelado", "No show", "No realizado"];
const RECEIVABLE_PENDING_COLLECTION_STATUSES = ["Pendiente", "Parcial"];
const RECEIVABLE_PAID_COLLECTION_STATUSES = ["Cobrado", "Pagado"];

let isReconcilingReceivables = false;

function ensureReceivablesData() {
  window.ElaraReceivablesMock = receivablesData;
  receivablesData.settings = {
    currency: "EUR",
    ...(receivablesData.settings || {}),
  };
  receivablesData.receivables = Array.isArray(receivablesData.receivables) ? receivablesData.receivables : [];
  receivablesData.payments = Array.isArray(receivablesData.payments) ? receivablesData.payments : [];
  receivablesData.receivables.forEach((receivable, index) => {
    receivablesData.receivables[index] = Object.assign(receivable, normalizeReceivableRecord(receivable));
  });
  receivablesData.payments.forEach((payment, index) => {
    receivablesData.payments[index] = Object.assign(payment, normalizeReceivablePayment(payment));
  });
}

function reconcileReceivablesFromServices(session = {}) {
  if (isReconcilingReceivables) {
    return {
      created: 0,
      updated: 0,
      omitted: 0,
      warnings: [],
      skippedBecauseReentrant: true,
    };
  }

  isReconcilingReceivables = true;

  try {
    ensureReceivablesData();

    const user = getReceivableSessionUser(session);
    const summary = {
      created: 0,
      updated: 0,
      omitted: 0,
      warnings: [],
    };

    getServicesCollection().forEach((service) => {
      const serviceId = getReceivableServiceId(service);

      if (!serviceId) {
        summary.omitted += 1;
        return;
      }

      const existing = getReceivableByServiceId(serviceId, { includeAnulada: true });
      const eligibility = getServiceReceivableEligibility(service);

      if (!eligibility.ok) {
        summary.omitted += 1;
        if (existing?.status === "Pendiente" && RECEIVABLE_SERVICE_EXCLUDED_STATUSES.includes(String(service.status || "").trim())) {
          summary.warnings.push(`${serviceId}: cuenta pendiente asociada a servicio no cobrable.`);
        }
        return;
      }

      if (existing?.status === "Anulada") {
        summary.omitted += 1;
        return;
      }

      if (existing?.status === "Cobrada") {
        summary.omitted += 1;
        return;
      }

      if (existing) {
        if (updatePendingReceivableFromService(existing, service, eligibility.financial)) {
          summary.updated += 1;
        } else {
          summary.omitted += 1;
        }
        return;
      }

      receivablesData.receivables.push(createReceivableFromService(service, eligibility.financial, user));
      summary.created += 1;
    });

    if (summary.created || summary.updated) {
      emitReceivablesEvents({ reason: "receivables-reconciled", ...summary });
    }

    summary.warnings.forEach((warning) => console.warn("[ELARA] Cuentas por cobrar:", warning));

    return summary;
  } finally {
    isReconcilingReceivables = false;
  }
}

function getAllReceivables(filters = {}) {
  ensureReceivablesData();

  return receivablesData.receivables
    .filter((receivable) => filterReceivable(receivable, filters))
    .sort(compareReceivablesChronologically)
    .map(cloneReceivableRecord);
}

function getReceivableById(receivableId) {
  ensureReceivablesData();

  const normalizedReceivableId = normalizeReceivableId(receivableId);

  return receivablesData.receivables.find((receivable) => receivable.id === normalizedReceivableId) || null;
}

function getReceivableByServiceId(serviceId, options = {}) {
  ensureReceivablesData();

  const normalizedServiceId = normalizeReceivableId(serviceId);

  return (
    receivablesData.receivables.find(
      (receivable) => receivable.serviceId === normalizedServiceId && (options.includeAnulada || receivable.status !== "Anulada"),
    ) || null
  );
}

function getReceivablesForCustomer(customerId, filters = {}) {
  const normalizedCustomerId = normalizeReceivableId(customerId);

  if (!normalizedCustomerId) {
    return [];
  }

  return getAllReceivables({ ...filters, customerId: normalizedCustomerId });
}

function getCustomerReceivableSummary(customerId) {
  const receivables = getReceivablesForCustomer(customerId);
  const payments = getReceivablePaymentHistory({ customerId });

  return {
    customerId: normalizeReceivableId(customerId),
    totalPendingAmount: roundReceivableMoney(receivables.filter((item) => item.status === "Pendiente").reduce((total, item) => total + item.pendingAmount, 0)),
    pendingCount: receivables.filter((item) => item.status === "Pendiente").length,
    collectedAmount: roundReceivableMoney(payments.filter((payment) => payment.status === "Registrado").reduce((total, payment) => total + payment.amount, 0)),
    collectedCount: payments.filter((payment) => payment.status === "Registrado").length,
    oldestPendingDate: getOldestDate(receivables.filter((item) => item.status === "Pendiente").map((item) => item.serviceDate)),
    latestPaymentDate: getLatestDate(payments.filter((payment) => payment.status === "Registrado").map((payment) => payment.paidAt || payment.registeredAt)),
    currency: getReceivablesCurrency(),
  };
}

function getGlobalReceivableSummary(filters = {}) {
  const receivables = getAllReceivables(filters);
  const payments = getActiveReceivablePayments();
  const pendingReceivables = receivables.filter((item) => item.status === "Pendiente");

  return {
    totalPendingAmount: roundReceivableMoney(pendingReceivables.reduce((total, item) => total + item.pendingAmount, 0)),
    pendingCount: pendingReceivables.length,
    collectedAmount: roundReceivableMoney(payments.reduce((total, payment) => total + payment.amount, 0)),
    collectedCount: payments.length,
    customersWithDebt: new Set(pendingReceivables.filter((item) => item.pendingAmount > 0).map((item) => item.customerId)).size,
    servicesWithDebt: new Set(pendingReceivables.map((item) => item.serviceId)).size,
    currency: getReceivablesCurrency(),
  };
}

function getReceivablePayment(paymentId) {
  ensureReceivablesData();

  const normalizedPaymentId = normalizeReceivableId(paymentId);

  return receivablesData.payments.find((payment) => payment.id === normalizedPaymentId) || null;
}

function getReceivablePaymentHistory(filters = {}) {
  ensureReceivablesData();

  return receivablesData.payments
    .filter((payment) => filterReceivablePayment(payment, filters))
    .sort((first, second) => getReceivableTimestamp(second.registeredAt) - getReceivableTimestamp(first.registeredAt) || first.id.localeCompare(second.id))
    .map(cloneReceivableRecord);
}

function getReceivablePaymentSummaryFilters(filters = {}) {
  return {
    customerId: filters.customerId,
    serviceId: filters.serviceId,
    method: filters.method,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}

function getActiveReceivablePayments() {
  ensureReceivablesData();

  return receivablesData.payments
    .filter(
      (payment) =>
        payment &&
        payment.status === "Registrado" &&
        !payment.annulledAt &&
        roundReceivableMoney(payment.amount) > 0,
    )
    .map(cloneReceivableRecord);
}

function getActiveReceivablePayment(receivableId) {
  ensureReceivablesData();

  const normalizedReceivableId = normalizeReceivableId(receivableId);

  return receivablesData.payments.find((payment) => payment.receivableId === normalizedReceivableId && payment.status === "Registrado") || null;
}

function canViewReceivables(session = {}) {
  return canReceivablePerform(getReceivableSessionUser(session), "receivables:view");
}

function canCollectReceivable(receivable = {}, session = {}) {
  const user = getReceivableSessionUser(session);

  return Boolean(canReceivablePerform(user, "receivables:collect") && isUserSessionActive(user) && receivable?.status === "Pendiente");
}

function canAnnulReceivablePayment(payment = {}, session = {}) {
  const user = getReceivableSessionUser(session);

  return Boolean(
    canReceivablePerform(user, "receivables:annulPayment") &&
      getReceivableContextFromSubject(user) === "superadmin" &&
      isUserSessionActive(user) &&
      payment?.status === "Registrado",
  );
}

function registerReceivablePayment(receivableId, payload = {}, session = {}) {
  ensureReceivablesData();

  const receivable = getReceivableById(receivableId);
  const user = getReceivableSessionUser(session);
  const validation = validateReceivablePaymentInput(receivable, payload, user);

  if (!validation.ok) {
    return validation;
  }

  const service = getServiceById(receivable.serviceId);
  const paymentId = getNextReceivablePaymentId();
  const servicePaymentId = getNextServicePaymentId();
  const paidAt = payload.paidAt || payload.date || new Date().toISOString();
  const registeredAt = payload.registeredAt || new Date().toISOString();
  const observations = normalizeReceivableText(payload.observations || payload.notes, true);
  const payment = normalizeReceivablePayment({
    id: paymentId,
    receivableId: receivable.id,
    serviceId: receivable.serviceId,
    customerId: receivable.customerId,
    customerName: receivable.customerName,
    amount: receivable.pendingAmount,
    method: payload.method,
    paidAt,
    registeredAt,
    registeredByUserId: user.id || "",
    registeredByUserName: user.name || "Administracion",
    registeredByUserRole: getReceivableContextFromSubject(user),
    observations,
    status: "Registrado",
  });
  const servicePayment = {
    id: servicePaymentId,
    type: "payment",
    amount: payment.amount,
    method: payment.method,
    reference: normalizeReceivableText(payload.reference, true) || payment.id,
    notes: observations,
    serviceId: receivable.serviceId,
    customerId: receivable.customerId,
    registeredByUserId: payment.registeredByUserId,
    registeredByName: payment.registeredByUserName,
    registeredByUserRole: payment.registeredByUserRole,
    registeredAt: payment.paidAt,
    status: "Registrado",
    receivableId: receivable.id,
    receivablePaymentId: payment.id,
    sourceType: "receivable",
  };
  let cashResult = null;
  const receivableSnapshot = cloneReceivableRecord(receivable);
  const serviceFinancialSnapshot = cloneReceivableRecord(service.financial || {});

  try {
    cashResult = window.ElaraCash.registerReceivableCashEntry({
      receivableId: receivable.id,
      receivablePaymentId: payment.id,
      serviceId: receivable.serviceId,
      customerId: receivable.customerId,
      customerName: receivable.customerName,
      amount: payment.amount,
      paymentMethod: payment.method,
      recordedByUserId: payment.registeredByUserId,
      recordedByUserName: payment.registeredByUserName,
      recordedByUserRole: payment.registeredByUserRole,
      registeredAt: payment.paidAt,
      notes: observations,
      suppressEvents: true,
    });

    if (!cashResult?.ok || !cashResult?.movementId) {
      return createReceivableResult(false, null, cashResult?.error || "No se pudo registrar el movimiento de Caja.");
    }

    payment.cashMovementId = cashResult.movementId;
    payment.servicePaymentId = servicePaymentId;
    servicePayment.cashMovementId = cashResult.movementId;

    receivablesData.payments.push(payment);
    service.financial = service.financial || {};
    service.financial.payments = Array.isArray(service.financial.payments) ? service.financial.payments : [];
    service.financial.payments.push(servicePayment);
    updateReceivableAsCollected(receivable, payment);
    reconcileReceivableServiceFinancial(service);
    updateServiceReceivableState(service, "Cobrado", payment);
  } catch (error) {
    console.error("[ELARA] No se pudo completar el cobro posterior:", error);
    rollbackReceivablePaymentMutation(payment.id, cashResult?.movementId, receivable, receivableSnapshot, service, serviceFinancialSnapshot);
    return createReceivableResult(false, null, "No se pudo completar el cobro posterior.");
  }

  emitReceivablesEvents({
    reason: "receivable-payment-registered",
    receivableId: receivable.id,
    paymentId: payment.id,
    serviceId: receivable.serviceId,
    customerId: receivable.customerId,
    cashMovementId: payment.cashMovementId,
  });

  return createReceivableResult(true, cloneReceivableRecord(payment));
}

function annulReceivablePayment(paymentId, reason = "", session = {}) {
  ensureReceivablesData();

  const payment = getReceivablePayment(paymentId);
  const user = getReceivableSessionUser(session);
  const normalizedReason = normalizeReceivableText(reason, true);

  if (!payment) {
    return createReceivableResult(false, null, "Cobro no encontrado.");
  }

  if (payment.status !== "Registrado") {
    return createReceivableResult(false, null, "El cobro ya fue anulado.");
  }

  if (!canAnnulReceivablePayment(payment, user)) {
    return createReceivableResult(false, null, "Solo Superadmin puede anular cobros posteriores.");
  }

  if (!normalizedReason) {
    return createReceivableResult(false, null, "Introduce el motivo obligatorio.");
  }

  const receivable = getReceivableById(payment.receivableId);
  const service = getServiceById(payment.serviceId);

  if (!receivable || !service) {
    return createReceivableResult(false, null, "Cuenta o servicio asociado no encontrado.");
  }

  if (!window.ElaraCash || typeof window.ElaraCash.registerReceivablePaymentReversal !== "function") {
    return createReceivableResult(false, null, "No se pudo registrar la reversión en Caja.");
  }

  const annulledAt = new Date().toISOString();
  const reversalResult = window.ElaraCash.registerReceivablePaymentReversal({
    receivableId: receivable.id,
    receivablePaymentId: payment.id,
    serviceId: payment.serviceId,
    customerId: payment.customerId,
    customerName: payment.customerName,
    amount: payment.amount,
    originalCashMovementId: payment.cashMovementId,
    reversedAt: annulledAt,
    registeredByUserId: user.id || "",
    registeredByName: user.name || "Superadmin",
    registeredByUserRole: getReceivableContextFromSubject(user),
    reason: normalizedReason,
    suppressEvents: true,
  });

  if (!reversalResult?.ok || !reversalResult?.movementId) {
    return createReceivableResult(false, null, reversalResult?.error || "No se pudo registrar la reversión en Caja.");
  }

  payment.status = "Anulado";
  payment.annulledAt = annulledAt;
  payment.annulledByUserId = user.id || "";
  payment.annulledByUserName = user.name || "Superadmin";
  payment.annulledByUserRole = getReceivableContextFromSubject(user);
  payment.annulmentReason = normalizedReason;
  payment.reversalCashMovementId = reversalResult.movementId;

  const servicePayment = findServicePaymentForReceivable(service, payment);

  if (servicePayment) {
    servicePayment.status = "Anulado";
    servicePayment.annulledAt = annulledAt;
    servicePayment.annulledByUserId = payment.annulledByUserId;
    servicePayment.annulledByName = payment.annulledByUserName;
    servicePayment.annulmentReason = normalizedReason;
  }

  updateReceivableAsPending(receivable);
  reconcileReceivableServiceFinancial(service);
  updateServiceReceivableState(service, "Pendiente", null);

  emitReceivablesEvents({
    reason: "receivable-payment-annulled",
    receivableId: receivable.id,
    paymentId: payment.id,
    serviceId: payment.serviceId,
    customerId: payment.customerId,
    cashMovementId: reversalResult.movementId,
    originalCashMovementId: payment.cashMovementId,
  });

  return createReceivableResult(true, cloneReceivableRecord(payment));
}

function checkReceivablesIntegrity() {
  ensureReceivablesData();

  const warnings = [];
  const receivablesByService = new Map();
  const seenPayments = new Set();
  const cashMovements = getCashMovements();
  const activeCashRefs = new Set();
  const reversalRefs = new Set();

  receivablesData.receivables.forEach((receivable) => {
    const service = getServiceById(receivable.serviceId);
    const customer = getCustomerById(receivable.customerId);
    const activePayment = getActiveReceivablePayment(receivable.id);

    if (!service) warnings.push(`${receivable.id}: cuenta sin servicio.`);
    if (!customer) warnings.push(`${receivable.id}: cuenta sin cliente.`);
    if (receivable.originalAmount <= 0) warnings.push(`${receivable.id}: importe original inválido.`);
    if (receivable.pendingAmount < 0) warnings.push(`${receivable.id}: pendingAmount negativo.`);
    if (receivable.status === "Pendiente" && receivable.pendingAmount <= 0) warnings.push(`${receivable.id}: Pendiente con pendingAmount 0.`);
    if (receivable.status === "Cobrada" && receivable.pendingAmount !== 0) warnings.push(`${receivable.id}: Cobrada con pendingAmount distinto de 0.`);
    if (receivable.status === "Cobrada" && !activePayment) warnings.push(`${receivable.id}: Cobrada sin pago activo.`);

    if (service) {
      const serviceState = getServiceCollectionState(service, { receivable });
      if (serviceState.isCancelled) warnings.push(`${receivable.id}: cuenta de servicio cancelado/no cobrable.`);
      if (serviceState.reason === "customer_mismatch") warnings.push(`${receivable.id}: cuenta asociada a otro cliente distinto al servicio.`);
      if (serviceState.reason === "amount_mismatch") warnings.push(`${receivable.id}: importe de servicio distinto al importe de la cuenta.`);
      if (receivable.status === "Pendiente" && serviceState.collectionStatus === "Sin definir") warnings.push(`${receivable.id}: cuenta pendiente con resumen financiero Sin definir.`);
      if (receivable.status === "Pendiente" && !serviceState.isReceivableEligible) {
        warnings.push(`${receivable.id}: cuenta pendiente no cobrable desde el servicio central (${serviceState.reason || "sin motivo"}).`);
      }
      if (serviceState.financial.externalSummaryAmountInvalid) {
        warnings.push(`${receivable.id}: resumen de Servicios sin importe pese a precio central valido.`);
      }
      if (!serviceState.financial.hasValidAmount && hasResolvableCentralReceivableAmount(service)) {
        warnings.push(`${receivable.id}: servicio central con precio valido no resuelto por Cuentas por cobrar.`);
      }
      if (serviceState.collectionStatus === "Cobrado" && receivable.status === "Pendiente") warnings.push(`${receivable.id}: servicio Cobrado con cuenta Pendiente.`);
      if (serviceState.collectionStatus === "Pendiente" && receivable.status === "Cobrada") warnings.push(`${receivable.id}: servicio Pendiente con cuenta Cobrada.`);
    }

    const serviceReceivables = receivablesByService.get(receivable.serviceId) || [];
    serviceReceivables.push(receivable);
    receivablesByService.set(receivable.serviceId, serviceReceivables);
  });

  receivablesByService.forEach((items, serviceId) => {
    if (items.filter((item) => item.status !== "Anulada").length > 1) {
      warnings.push(`${serviceId}: duplicado activo por serviceId.`);
    }
  });

  receivablesData.payments.forEach((payment) => {
    const paymentLabel = payment.id || "Pago sin ID";
    const receivable = getReceivableById(payment.receivableId);
    const service = getServiceById(payment.serviceId);
    const cashMovement = cashMovements.find((movement) => movement.id === payment.cashMovementId && movement.status !== "Anulado");
    const reversalMovement = cashMovements.find((movement) => movement.id === payment.reversalCashMovementId && movement.status !== "Anulado");

    if (seenPayments.has(payment.id)) warnings.push(`${paymentLabel}: pago duplicado.`);
    seenPayments.add(payment.id);
    if (!payment.registeredByUserId || !payment.registeredByUserName || !payment.registeredByUserRole) warnings.push(`${paymentLabel}: usuario registrador ausente.`);

    if (payment.status === "Registrado") {
      if (!cashMovement) warnings.push(`${paymentLabel}: pago activo sin movimiento de Caja.`);
      if (receivable && payment.amount !== receivable.originalAmount) warnings.push(`${paymentLabel}: importe de pago diferente al original.`);
      if (cashMovement && roundReceivableMoney(cashMovement.amount) !== payment.amount) warnings.push(`${paymentLabel}: movimiento de Caja con importe incorrecto.`);
      const servicePayment = service ? findServicePaymentForReceivable(service, payment) : null;
      const methods = [payment.method, cashMovement?.paymentMethod, servicePayment?.method].map((method) => normalizeReceivableText(method, true)).filter(Boolean);
      if (new Set(methods).size > 1) warnings.push(`${paymentLabel}: diferencia entre método de RCP, Caja y servicio.`);
      if (cashMovement?.id) {
        if (activeCashRefs.has(cashMovement.id)) warnings.push(`${paymentLabel}: referencia de Caja duplicada.`);
        activeCashRefs.add(cashMovement.id);
      }
    }

    if (payment.status === "Anulado") {
      if (!reversalMovement) warnings.push(`${paymentLabel}: pago anulado sin movimiento inverso.`);
      if (payment.reversalCashMovementId) {
        if (reversalRefs.has(payment.reversalCashMovementId)) warnings.push(`${paymentLabel}: doble reversión.`);
        reversalRefs.add(payment.reversalCashMovementId);
      }
    }

    if (!receivable) warnings.push(`${paymentLabel}: pago sin cuenta por cobrar.`);
    if (!service) warnings.push(`${paymentLabel}: pago sin servicio.`);
  });

  warnings.forEach((warning) => console.warn("[ELARA] Integridad Cuentas por cobrar:", warning));

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

function validateReceivablePaymentInput(receivable, payload = {}, user = {}) {
  if (!isUserSessionActive(user)) return createReceivableResult(false, null, "La sesi\u00f3n no es v\u00e1lida.");
  if (!isUserSessionActive(user)) return createReceivableResult(false, null, "La sesión no es válida.");
  if (!receivable) return createReceivableResult(false, null, "Cuenta por cobrar no encontrada.");
  if (!canReceivablePerform(user, "receivables:collect")) return createReceivableResult(false, null, "No tienes permiso para registrar este cobro.");
  if (receivable.status !== "Pendiente") return createReceivableResult(false, null, "La cuenta por cobrar no está pendiente.");
  if (receivable.pendingAmount <= 0) return createReceivableResult(false, null, "La cuenta por cobrar no tiene saldo pendiente.");
  if (!RECEIVABLE_PAYMENT_METHODS.includes(payload.method)) return createReceivableResult(false, null, "Selecciona un método de cobro válido.");
  if (!payload.paidAt && !payload.date) return createReceivableResult(false, null, "Selecciona la fecha del cobro.");
  if (!isUserSessionActive(user)) return createReceivableResult(false, null, "La sesión no es válida.");
  if (getActiveReceivablePayment(receivable.id)) return createReceivableResult(false, null, "Esta cuenta ya tiene un pago activo.");

  const serviceState = getServiceCollectionState(getServiceById(receivable.serviceId), { receivable });
  if (!serviceState.isReceivableEligible) {
    return createReceivableResult(false, null, getReceivableCollectionErrorMessageSafe(serviceState));
  }

  const amount = roundReceivableMoney(payload.amount);
  if (amount !== receivable.pendingAmount) return createReceivableResult(false, null, "El cobro debe saldar el total pendiente.");

  if (!window.ElaraCash || typeof window.ElaraCash.registerReceivableCashEntry !== "function") return createReceivableResult(false, null, "No se pudo preparar Caja.");

  return createReceivableResult(true);
}

function createReceivableFromService(service, financial, user = {}) {
  const centralService = getCentralReceivableServiceFromInput(service) || service;
  const serviceId = getReceivableServiceId(centralService);
  const customerResolution = resolveServiceCustomer(centralService);
  const customerId = customerResolution.customerId;
  const now = new Date().toISOString();

  return normalizeReceivableRecord({
    id: getNextReceivableId(),
    serviceId,
    customerId,
    customerName: customerResolution.customerName || customerId,
    status: "Pendiente",
    originalAmount: financial.pendingAmount,
    pendingAmount: financial.pendingAmount,
    currency: financial.currency || getReceivablesCurrency(),
    serviceDate: normalizeReceivableServiceDate(centralService.date),
    dueDate: null,
    createdAt: now,
    createdByUserId: user.id || "",
    createdByUserName: user.name || "Sistema",
    createdByUserRole: getReceivableContextFromSubject(user) || "system",
    metadata: {
      origin: "service",
      serviceSnapshot: buildReceivableServiceSnapshot(centralService, financial),
    },
  });
}

function updatePendingReceivableFromService(receivable, service, financial) {
  const centralService = getCentralReceivableServiceFromInput(service, { receivable }) || service;
  const customerResolution = resolveServiceCustomer(centralService, { receivable });
  const customerId = customerResolution.customerId;
  const previousSnapshot = JSON.stringify({
    customerId: receivable.customerId,
    customerName: receivable.customerName,
    currency: receivable.currency,
    serviceDate: receivable.serviceDate,
    originalAmount: receivable.originalAmount,
    pendingAmount: receivable.pendingAmount,
    metadata: receivable.metadata,
  });

  receivable.customerId = customerId;
  receivable.customerName = customerResolution.customerName || customerId;
  receivable.currency = financial.currency || getReceivablesCurrency();
  receivable.serviceDate = normalizeReceivableServiceDate(centralService.date);
  receivable.originalAmount = financial.pendingAmount;
  receivable.pendingAmount = financial.pendingAmount;
  receivable.metadata = {
    ...(receivable.metadata || {}),
    origin: "service",
    serviceSnapshot: buildReceivableServiceSnapshot(centralService, financial),
  };

  return (
    previousSnapshot !==
    JSON.stringify({
      customerId: receivable.customerId,
      customerName: receivable.customerName,
      currency: receivable.currency,
      serviceDate: receivable.serviceDate,
      originalAmount: receivable.originalAmount,
      pendingAmount: receivable.pendingAmount,
      metadata: receivable.metadata,
    })
  );
}

function buildReceivableServiceSnapshot(service, financial) {
  const centralService = getCentralReceivableServiceFromInput(service) || service;
  const customerResolution = resolveServiceCustomer(centralService);
  const customerId = customerResolution.customerId;

  return {
    serviceId: getReceivableServiceId(centralService),
    customerId,
    customerName: customerResolution.customerName || customerId,
    finalPrice: financial.totalPrice,
  };
}

function getServiceCollectionState(service, options = {}) {
  const requestedServiceId = getReceivableServiceId(service) || normalizeReceivableId(options.receivable?.serviceId);
  const centralService = getCentralReceivableServiceFromInput(service || requestedServiceId, options);
  const serviceId = getReceivableServiceId(centralService) || requestedServiceId;
  const financial = calculateReceivableServiceFinancialSummary(centralService);
  const rawStatus = getReceivableServiceStatusValue(centralService);
  const status = getCanonicalServiceStatus(centralService);
  const customerResolution = resolveServiceCustomer(centralService, { receivable: options.receivable });
  const customerId = customerResolution.customerId;
  const collectionStatus = getNormalizedServiceCollectionStatus(centralService, financial);
  const activeReceivablePayment = options.receivable ? getActiveReceivablePayment(options.receivable.id) : null;
  const activeReceivablePaymentForService = getActiveReceivablePaymentByServiceId(serviceId, options.receivable?.id);
  const activeReceivableCashMovement = options.receivable ? getActiveReceivableCashMovement(options.receivable.id) : null;
  const activeReceivableServicePayment = getActiveReceivableServicePayment(centralService);
  const hasActiveReceivablePayment = Boolean(activeReceivablePayment || activeReceivablePaymentForService || activeReceivableCashMovement || activeReceivableServicePayment);
  const isCancelled = RECEIVABLE_SERVICE_EXCLUDED_STATUSES.includes(status);
  const isFinalized = status === "Finalizado";
  const hasValidCustomer = customerResolution.hasValidCustomer;
  const hasValidAmount = financial.hasValidAmount && !hasReceivableAmountMismatch(options.receivable, financial);
  const hasCollectedStatus = RECEIVABLE_PAID_COLLECTION_STATUSES.includes(collectionStatus);
  const isPendingCollection = RECEIVABLE_PENDING_COLLECTION_STATUSES.includes(collectionStatus) && financial.pendingAmount > 0;

  let reason = "";
  if (!centralService) reason = "service_missing";
  else if (isCancelled) reason = "cancelled";
  else if (!isFinalized) reason = "not_finalized";
  else if (customerResolution.reason) reason = customerResolution.reason;
  else if (!financial.hasValidAmount) reason = financial.amountReason || "price";
  else if (hasReceivableAmountMismatch(options.receivable, financial)) reason = "amount_mismatch";
  else if (financial.pendingAmount <= 0 || hasCollectedStatus) reason = "already_collected";
  else if (hasActiveReceivablePayment) reason = "receivable_payment_active";
  else if (!isPendingCollection) reason = "not_pending";

  return {
    service: centralService,
    serviceId,
    rawStatus,
    status,
    financial,
    customerId,
    customerName: customerResolution.customerName,
    customerRecord: customerResolution.customerRecord,
    customerSourceField: customerResolution.sourceField,
    collectionStatus,
    isFinalized,
    isCancelled,
    hasValidCustomer,
    hasValidAmount,
    hasActiveReceivablePayment,
    hasActiveDirectPayment: hasCollectedStatus && !hasActiveReceivablePayment,
    isPendingCollection,
    isReceivableEligible: !reason,
    reason,
  };
}

function resolveServiceCustomer(service = {}, options = {}) {
  const centralService = getCentralReceivableServiceFromInput(service, options) || service || {};
  const receivable = options.receivable || null;
  const idCandidate = getServiceCustomerIdentifierCandidates(centralService).find((candidate) => candidate.value);

  if (idCandidate) {
    const customerRecord = findCustomerByIdentifier(idCandidate.value);
    return buildResolvedServiceCustomer({
      customerRecord,
      customerId: idCandidate.value,
      customerName: getServiceCustomerNameFallback(centralService, receivable),
      sourceField: idCandidate.field,
      reason: customerRecord ? "" : "customer_not_found",
      receivable,
    });
  }

  const nameCandidate = getServiceCustomerNameCandidates(centralService).find((candidate) => candidate.value);
  if (nameCandidate) {
    const customerRecord = findCustomerByExactName(nameCandidate.value);
    return buildResolvedServiceCustomer({
      customerRecord,
      customerId: customerRecord ? getCustomerRecordId(customerRecord) : "",
      customerName: nameCandidate.value,
      sourceField: nameCandidate.field,
      reason: customerRecord ? "" : "customer_not_found",
      receivable,
    });
  }

  if (receivable?.customerId) {
    const customerRecord = findCustomerByIdentifier(receivable.customerId);
    return buildResolvedServiceCustomer({
      customerRecord,
      customerId: receivable.customerId,
      customerName: receivable.customerName || "",
      sourceField: "receivable.customerId",
      reason: customerRecord ? "" : "customer_not_found",
      receivable,
    });
  }

  return buildResolvedServiceCustomer({
    customerRecord: null,
    customerId: "",
    customerName: "",
    sourceField: "",
    reason: "customer_missing",
    receivable,
  });
}

function buildResolvedServiceCustomer({ customerRecord, customerId, customerName, sourceField, reason, receivable }) {
  const canonicalCustomerId = customerRecord ? getCustomerRecordId(customerRecord) : normalizeReceivableId(customerId);
  const canonicalCustomerName = customerRecord ? getCustomerRecordName(customerRecord) : normalizeReceivableText(customerName, true);
  const receivableCustomerId = normalizeReceivableId(receivable?.customerId);
  const mismatch =
    Boolean(receivableCustomerId && canonicalCustomerId && receivableCustomerId !== canonicalCustomerId) &&
    !(customerRecord && getCustomerStableIdentifiers(customerRecord).includes(receivableCustomerId));

  return {
    customerId: canonicalCustomerId,
    customerName: canonicalCustomerName,
    customerRecord: customerRecord || null,
    hasValidCustomer: Boolean(customerRecord && canonicalCustomerId && !mismatch),
    sourceField,
    reason: mismatch ? "customer_mismatch" : reason,
  };
}

function getServiceCustomerIdentifierCandidates(service = {}) {
  return [
    { field: "customerCode", value: service?.customerCode },
    { field: "customerId", value: service?.customerId },
    { field: "clientCode", value: service?.clientCode },
    { field: "customer.code", value: service?.customer?.code },
    { field: "customer.customerCode", value: service?.customer?.customerCode },
    { field: "customer.id", value: service?.customer?.id },
    { field: "financial.customerId", value: service?.financial?.customerId },
  ].map((candidate) => ({ ...candidate, value: normalizeReceivableId(candidate.value) }));
}

function getServiceCustomerNameCandidates(service = {}) {
  return [
    { field: "client", value: service?.client },
    { field: "customerName", value: service?.customerName },
    { field: "clientName", value: service?.clientName },
    { field: "customer.name", value: service?.customer?.name },
    { field: "customer.tradeName", value: service?.customer?.tradeName },
    { field: "customer.company", value: service?.customer?.company },
  ]
    .map((candidate) => ({ ...candidate, value: normalizeReceivableText(candidate.value, true) }))
    .filter((candidate) => candidate.value);
}

function getServiceCustomerNameFallback(service = {}, receivable = null) {
  return getServiceCustomerNameCandidates(service)[0]?.value || receivable?.customerName || "";
}

function getNormalizedServiceCollectionStatus(service, financial = {}) {
  const centralService = getCentralReceivableServiceFromInput(service) || service || {};
  const explicitStatus = normalizeServiceCollectionStatusValue(
    centralService?.financial?.collectionStatus || centralService?.collectionStatus,
  );
  const paymentStatus = normalizeServiceCollectionStatusValue(
    financial.paymentStatus || centralService?.financial?.paymentStatus || centralService?.paymentStatus,
  );

  if (RECEIVABLE_PAID_COLLECTION_STATUSES.includes(explicitStatus)) return "Cobrado";
  if (RECEIVABLE_PAID_COLLECTION_STATUSES.includes(paymentStatus) && roundReceivableMoney(financial.pendingAmount) <= 0) return "Cobrado";
  if (RECEIVABLE_PENDING_COLLECTION_STATUSES.includes(explicitStatus)) return explicitStatus;
  if (RECEIVABLE_PENDING_COLLECTION_STATUSES.includes(paymentStatus)) return paymentStatus;
  return paymentStatus || explicitStatus || "Pendiente";
}

function getCanonicalServiceStatus(service = {}) {
  const centralService = getCentralReceivableServiceFromInput(service) || service || {};
  return normalizeReceivableServiceOperationalStatus(getReceivableServiceStatusValue(centralService));
}

function getReceivableServiceStatusValue(service = {}) {
  const centralService = getCentralReceivableServiceFromInput(service) || service || {};
  return String(centralService?.status || centralService?.serviceStatus || centralService?.estado || "").trim();
}

function normalizeReceivableServiceOperationalStatus(value) {
  const normalizedStatus = normalizeReceivableText(value);
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

  return statusByNormalizedName[normalizedStatus] || String(value || "").trim();
}

function normalizeServiceCollectionStatusValue(value) {
  const status = String(value || "").trim();
  if (status === "Cobrado" || status === "Pagado") return "Cobrado";
  if (status === "Parcial") return "Parcial";
  if (status === "Pendiente") return "Pendiente";
  if (status === "Sin definir") return "Sin definir";
  if (status === "Reembolsado" || status === "Incobrable") return status;
  return "";
}

function getActiveReceivablePaymentByServiceId(serviceId, ignoredReceivableId = "") {
  const normalizedServiceId = normalizeReceivableId(serviceId);
  const normalizedIgnoredReceivableId = normalizeReceivableId(ignoredReceivableId);
  if (!normalizedServiceId) return null;
  return receivablesData.payments.find(
    (payment) =>
      payment.status === "Registrado" &&
      payment.serviceId === normalizedServiceId &&
      (!normalizedIgnoredReceivableId || payment.receivableId !== normalizedIgnoredReceivableId),
  ) || null;
}

function getActiveReceivableCashMovement(receivableId) {
  const normalizedReceivableId = normalizeReceivableId(receivableId);
  if (!normalizedReceivableId) return null;
  return getCashMovements().find(
    (movement) =>
      movement.status !== "Anulado" &&
      movement.sourceType === "receivable" &&
      movement.sourceId === normalizedReceivableId &&
      !movement.reversedByCashMovementId,
  ) || null;
}

function getActiveReceivableServicePayment(service) {
  const centralService = getCentralReceivableServiceFromInput(service) || service || {};
  return (centralService?.financial?.payments || []).find(
    (payment) =>
      payment &&
      payment.status !== "Anulado" &&
      payment.type === "payment" &&
      (payment.sourceType === "receivable" || payment.receivableId || payment.receivablePaymentId),
  ) || null;
}

function getReceivableCollectionErrorMessage(state = {}) {
  switch (state.reason) {
    case "service_missing":
      return "Servicio asociado no encontrado.";
    case "cancelled":
      return "El servicio asociado no es cobrable por su estado operativo.";
    case "not_finalized":
      return "El servicio asociado no está finalizado.";
    case "customer":
      return "El servicio no tiene un cliente válido.";
    case "price":
      return "El servicio no tiene un importe válido para cobrar.";
    case "already_collected":
      return "El servicio ya figura como cobrado.";
    case "receivable_payment_active":
      return "Esta cuenta ya tiene un pago activo.";
    case "not_pending":
      return "El servicio no figura pendiente de cobro.";
    default:
      return "El servicio ya no es cobrable.";
  }
}

function getReceivableCollectionErrorMessageSafe(state = {}) {
  switch (state.reason) {
    case "service_missing":
      return "Servicio asociado no encontrado.";
    case "cancelled":
      return "El servicio asociado no es cobrable por su estado operativo.";
    case "not_finalized":
      return "El servicio asociado no est\u00e1 finalizado.";
    case "customer_missing":
      return "El servicio no tiene un cliente asociado.";
    case "customer_not_found":
      return "El cliente asociado al servicio no existe.";
    case "customer_mismatch":
      return "La cuenta y el servicio est\u00e1n asociados a clientes diferentes.";
    case "price":
      return "El servicio no tiene un precio financiero v\u00e1lido.";
    case "amount_mismatch":
      return "El importe del servicio y el de la cuenta no coinciden.";
    case "already_collected":
      return "El servicio ya figura como cobrado.";
    case "receivable_payment_active":
      return "Esta cuenta ya tiene un pago activo.";
    case "not_pending":
      return "El servicio no figura pendiente de cobro.";
    default:
      return "El servicio ya no es cobrable.";
  }
}

function getServiceReceivableEligibility(service) {
  const state = getServiceCollectionState(service);
  return { ok: state.isReceivableEligible, reason: state.reason, financial: state.financial, state };
}

function isServiceReceivableEligible(service) {
  return getServiceReceivableEligibility(service).ok;
}

function isServiceStillReceivable(serviceId, receivable = null) {
  const service = getServiceById(serviceId);
  return getServiceCollectionState(service, { receivable }).isReceivableEligible;
}

function updateReceivableAsCollected(receivable, payment) {
  receivable.status = "Cobrada";
  receivable.pendingAmount = 0;
  receivable.settledAt = payment.paidAt;
  receivable.paymentId = payment.id;
}

function updateReceivableAsPending(receivable) {
  receivable.status = "Pendiente";
  receivable.pendingAmount = receivable.originalAmount;
  receivable.settledAt = null;
  receivable.paymentId = null;
}

function updateServiceReceivableState(service, collectionStatus, payment) {
  const centralService = getCentralReceivableServiceFromInput(service);
  if (!centralService) return;
  centralService.financial = centralService.financial || {};
  centralService.financial.collectionStatus = collectionStatus;
  centralService.financial.paymentStatus = collectionStatus === "Cobrado" ? "Pagado" : "Pendiente";

  if (collectionStatus === "Cobrado" && payment) {
    centralService.financial.collectionMethod = payment.method;
    centralService.financial.collectionDate = payment.paidAt;
    centralService.financial.collectionReference = payment.id;
  } else {
    centralService.financial.collectionMethod = "";
    centralService.financial.collectionDate = "";
    centralService.financial.collectionReference = "";
  }
}

function calculateReceivableServiceFinancialSummary(service) {
  return calculateCanonicalReceivableServiceFinancialSummary(service);
}

function calculateCanonicalReceivableServiceFinancialSummary(service) {
  const centralService = getCentralReceivableServiceFromInput(service);
  const financial = centralService?.financial || {};
  const hasCentralService = Boolean(getReceivableServiceId(centralService));
  const serviceSummary =
    hasCentralService &&
    window.ElaraServices &&
    typeof window.ElaraServices.calculateServiceFinancialSummary === "function"
      ? window.ElaraServices.calculateServiceFinancialSummary(centralService)
      : {};

  if (hasCentralService && window.ElaraServices && typeof window.ElaraServices.calculateServiceFinancialSummary === "function") {
    const summary = augmentReceivableFinancialSummaryWithCanonicalAmount(centralService, {
      ...serviceSummary,
      payments: Array.isArray(serviceSummary.payments) ? serviceSummary.payments : getValidReceivableServicePayments(financial.payments),
      currency: serviceSummary.currency || financial.currency || getReceivablesCurrency(),
    });
    summary.externalSummaryAmountInvalid = !hasValidReceivableSummaryAmount(serviceSummary) && hasResolvableCentralReceivableAmount(centralService);
    return summary;
  }

  const payments = getValidReceivableServicePayments(financial.payments);
  const paidAmount = roundReceivableMoney(payments.reduce((total, payment) => total + payment.amount, 0));
  const amountState = resolveServiceReceivableAmount(centralService, { paidAmount });
  const paymentStatus =
    amountState.amount === null ? "Sin definir" : paidAmount === 0 ? "Pendiente" : paidAmount < amountState.amount ? "Parcial" : "Pagado";

  const summary = {
    currency: financial.currency || getReceivablesCurrency(),
    basePrice: financial.basePrice,
    totalPrice: amountState.amount,
    payments,
    paidAmount,
    pendingAmount: amountState.pendingAmount,
    paymentStatus,
  };

  return augmentReceivableFinancialSummaryWithCanonicalAmount(centralService, summary);
}

function augmentReceivableFinancialSummaryWithCanonicalAmount(service, summary = {}) {
  const amountState = resolveServiceReceivableAmount(service, summary);
  const paymentStatus = getReceivableDerivedCollectionPaymentStatus(summary.paymentStatus, amountState);

  return {
    ...summary,
    totalPrice: amountState.amount,
    paidAmount: amountState.paidAmount,
    pendingAmount: amountState.pendingAmount,
    paymentStatus,
    hasValidAmount: amountState.hasValidAmount,
    amountSourceField: amountState.sourceField,
    amountReason: amountState.reason,
  };
}

function resolveServiceReceivableAmount(service = {}, summary = {}) {
  const centralService = getCentralReceivableServiceFromInput(service);
  const paidAmount = roundReceivableMoney(summary.paidAmount);
  const candidate = getServiceReceivableAmountCandidates(centralService, summary).find((item) => item.present);

  if (!candidate) {
    return {
      amount: null,
      pendingAmount: 0,
      paidAmount,
      hasValidAmount: false,
      sourceField: "",
      reason: "price",
    };
  }

  const amount = parseReceivableMoneyValueSafe(candidate.value);

  if (amount === null || amount <= 0) {
    return {
      amount: amount === null ? null : amount,
      pendingAmount: 0,
      paidAmount,
      hasValidAmount: false,
      sourceField: candidate.field,
      reason: "price",
    };
  }

  return {
    amount,
    pendingAmount: roundReceivableMoney(Math.max(amount - paidAmount, 0)),
    paidAmount,
    hasValidAmount: true,
    sourceField: candidate.field,
    reason: "",
  };
}

function getServiceReceivableAmountCandidates(service = {}, summary = {}) {
  const centralService = getCentralReceivableServiceFromInput(service);
  const source = centralService || {};
  const financial = centralService?.financial || {};

  return [
    { field: "financial.totalPrice", value: financial.totalPrice },
    { field: "financial.finalPrice", value: financial.finalPrice },
    { field: "financial.basePrice", value: financial.basePrice },
    { field: "totalPrice", value: source.totalPrice },
    { field: "estimatedPrice", value: source.estimatedPrice },
    { field: "price", value: source.price },
    { field: "amount", value: source.amount },
    { field: "importe", value: source.importe },
    { field: "serviceSummary.totalPrice", value: summary.totalPrice },
  ].map((candidate) => ({
    ...candidate,
    present: candidate.value !== undefined && candidate.value !== null && candidate.value !== "",
  }));
}

function hasResolvableCentralReceivableAmount(service = {}) {
  return getServiceReceivableAmountCandidates(service, {})
    .some((candidate) => candidate.present && parseReceivableMoneyValueSafe(candidate.value) > 0);
}

function hasValidReceivableSummaryAmount(summary = {}) {
  return parseReceivableMoneyValueSafe(summary.totalPrice) > 0;
}

function parseReceivableMoneyValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? roundReceivableMoney(value) : null;

  const text = String(value).trim();
  if (!text || normalizeReceivableText(text) === "sin definir") return null;

  const normalizedCurrencyText = text.replace(/\s/g, "").replace(/eur|â‚¬/gi, "");
  const decimalText = normalizedCurrencyText.includes(",") && !normalizedCurrencyText.includes(".")
    ? normalizedCurrencyText.replace(",", ".")
    : normalizedCurrencyText.replace(/[^\d.-]/g, "");

  if (!/^-?\d+(?:\.\d+)?$/.test(decimalText)) return null;

  const parsedValue = Number(decimalText);
  return Number.isFinite(parsedValue) ? roundReceivableMoney(parsedValue) : null;
}

function parseReceivableMoneyValueSafe(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? roundReceivableMoney(value) : null;

  const text = String(value).trim();
  if (!text || normalizeReceivableText(text) === "sin definir") return null;

  const currencyStrippedText = text.replace(/\s/g, "").replace(/eur|\u20ac/gi, "");
  const decimalText = currencyStrippedText.includes(",") && !currencyStrippedText.includes(".")
    ? currencyStrippedText.replace(",", ".")
    : currencyStrippedText.replace(/[^\d.-]/g, "");

  if (!/^-?\d+(?:\.\d+)?$/.test(decimalText)) return null;

  const parsedValue = Number(decimalText);
  return Number.isFinite(parsedValue) ? roundReceivableMoney(parsedValue) : null;
}

function getReceivableDerivedCollectionPaymentStatus(storedStatus, amountState = {}) {
  if (storedStatus === "Reembolsado" || storedStatus === "Incobrable") return storedStatus;
  if (!amountState.hasValidAmount) return "Sin definir";
  if (amountState.paidAmount <= 0) return "Pendiente";
  if (amountState.pendingAmount > 0) return "Parcial";
  return "Pagado";
}

function hasReceivableAmountMismatch(receivable, financial = {}) {
  if (!receivable || !financial.hasValidAmount) return false;

  const receivableAmount = roundReceivableMoney(receivable.originalAmount);
  if (receivableAmount <= 0) return false;

  return receivableAmount !== roundReceivableMoney(financial.totalPrice);
}

function reconcileReceivableServiceFinancial(service) {
  const centralService = getCentralReceivableServiceFromInput(service);
  if (!centralService) return null;

  if (window.ElaraServices && typeof window.ElaraServices.reconcileServicePaymentStatus === "function") {
    return window.ElaraServices.reconcileServicePaymentStatus(centralService);
  }

  const summary = calculateReceivableServiceFinancialSummary(centralService);

  centralService.financial = {
    ...(centralService.financial || {}),
    currency: summary.currency,
    totalPrice: summary.totalPrice,
    payments: summary.payments,
    paidAmount: summary.paidAmount,
    pendingAmount: summary.pendingAmount,
    paymentStatus: summary.paymentStatus,
  };

  return centralService.financial;
}

function getValidReceivableServicePayments(payments = []) {
  return (Array.isArray(payments) ? payments : [])
    .filter((payment) => payment && payment.type === "payment" && payment.status !== "Anulado")
    .map((payment) => ({
      ...payment,
      amount: roundReceivableMoney(payment.amount),
      method: payment.method || "Efectivo",
      status: payment.status || "Registrado",
    }))
    .filter((payment) => payment.amount > 0);
}

function rollbackReceivablePaymentMutation(paymentId, movementId, receivable, receivableSnapshot, service, serviceFinancialSnapshot) {
  const paymentIndex = receivablesData.payments.findIndex((payment) => payment.id === paymentId);

  if (paymentIndex >= 0) receivablesData.payments.splice(paymentIndex, 1);
  if (movementId) window.ElaraCash?.rollbackCashMovement?.(movementId);
  Object.assign(receivable, receivableSnapshot);
  service.financial = serviceFinancialSnapshot;
}

function filterReceivable(receivable, filters = {}) {
  const status = normalizeReceivableText(filters.status);
  const customerId = normalizeReceivableId(filters.customerId);
  const serviceId = normalizeReceivableId(filters.serviceId);
  const search = normalizeReceivableText(filters.search || filters.query);

  if (status && normalizeReceivableText(receivable.status) !== status) return false;
  if (customerId && receivable.customerId !== customerId) return false;
  if (serviceId && receivable.serviceId !== serviceId) return false;
  if (filters.dateFrom && receivable.serviceDate < normalizeReceivableServiceDate(filters.dateFrom)) return false;
  if (filters.dateTo && receivable.serviceDate > normalizeReceivableServiceDate(filters.dateTo)) return false;

  if (search) {
    const haystack = normalizeReceivableText([receivable.id, receivable.serviceId, receivable.customerId, receivable.customerName].join(" "));
    if (!haystack.includes(search)) return false;
  }

  return true;
}

function filterReceivablePayment(payment, filters = {}) {
  const status = normalizeReceivableText(filters.status);
  const customerId = normalizeReceivableId(filters.customerId);
  const serviceId = normalizeReceivableId(filters.serviceId);
  const method = normalizeReceivableText(filters.method, true);

  if (status && normalizeReceivableText(payment.status) !== status) return false;
  if (customerId && payment.customerId !== customerId) return false;
  if (serviceId && payment.serviceId !== serviceId) return false;
  if (method && payment.method !== method) return false;
  if (filters.dateFrom && normalizeReceivableServiceDate(payment.paidAt) < normalizeReceivableServiceDate(filters.dateFrom)) return false;
  if (filters.dateTo && normalizeReceivableServiceDate(payment.paidAt) > normalizeReceivableServiceDate(filters.dateTo)) return false;

  return true;
}

function canReceivablePerform(subject = {}, action) {
  if (!window.ElaraPermissions || typeof window.ElaraPermissions.canPerformAction !== "function") {
    return false;
  }

  return window.ElaraPermissions.canPerformAction(getReceivableContextFromSubject(subject), action);
}

function getReceivableContextFromSubject(subject = {}) {
  if (typeof subject === "string") return subject;
  if (subject?.activeContext || subject?.role) return subject.activeContext || subject.role || "";
  if (window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function") return window.ElaraAuth.getActiveContext();
  return "";
}

function getReceivableSessionUser(currentUser = {}) {
  return currentUser?.user || currentUser || {};
}

function isUserSessionActive(user = {}) {
  return !user.status || user.status === "activo" || user.status === "Activo";
}

function getServicesCollection() {
  return Array.isArray(window.ElaraServicesMock?.services) ? window.ElaraServicesMock.services : [];
}

function getCentralReceivableServiceById(serviceId) {
  const normalizedServiceId = normalizeReceivableId(serviceId);
  if (!normalizedServiceId) return null;

  return (
    getServicesCollection().find((service) =>
      [service?.serviceId, service?.id, service?.centralServiceId].map(normalizeReceivableId).includes(normalizedServiceId),
    ) || null
  );
}

function getCentralReceivableServiceFromInput(serviceOrId, options = {}) {
  if (serviceOrId && typeof serviceOrId === "object" && getServicesCollection().includes(serviceOrId)) {
    return serviceOrId;
  }

  const serviceId =
    typeof serviceOrId === "string"
      ? normalizeReceivableId(serviceOrId)
      : getReceivableServiceId(serviceOrId) || normalizeReceivableId(options.receivable?.serviceId);

  return getCentralReceivableServiceById(serviceId);
}

function getCustomersCollection() {
  return Array.isArray(window.ElaraCustomersMock?.customers) ? window.ElaraCustomersMock.customers : [];
}

function getCashMovements() {
  return Array.isArray(window.ElaraFinanceMock?.cashMovements) ? window.ElaraFinanceMock.cashMovements : [];
}

function getServiceById(serviceId) {
  return getCentralReceivableServiceById(serviceId);
}

function getCustomerById(customerId) {
  return findCustomerByIdentifier(customerId);
}

function getServiceCustomerId(service = {}) {
  return resolveServiceCustomer(service).customerId;
}

function findCustomerByIdentifier(customerId) {
  const normalizedCustomerId = normalizeReceivableId(customerId);
  if (!normalizedCustomerId) return null;
  return getCustomersCollection().find((customer) => getCustomerStableIdentifiers(customer).includes(normalizedCustomerId)) || null;
}

function findCustomerByExactName(customerName) {
  const normalizedName = normalizeReceivableText(stripReceivableCustomerCode(customerName));
  if (!normalizedName) return null;
  return (
    getCustomersCollection().find((customer) =>
      getCustomerNameSearchValues(customer).some((value) => normalizeReceivableText(stripReceivableCustomerCode(value)) === normalizedName),
    ) || null
  );
}

function getCustomerStableIdentifiers(customer = {}) {
  return [customer.code, customer.customerCode, customer.id].map(normalizeReceivableId).filter(Boolean);
}

function getCustomerRecordId(customer = {}) {
  return normalizeReceivableId(customer.code || customer.customerCode || customer.id);
}

function getCustomerRecordName(customer = {}) {
  return normalizeReceivableText(customer.name || customer.tradeName || customer.company || getCustomerRecordId(customer), true);
}

function getCustomerNameSearchValues(customer = {}) {
  return [customer.name, customer.tradeName, customer.company].map((value) => normalizeReceivableText(value, true)).filter(Boolean);
}

function stripReceivableCustomerCode(value) {
  return String(value || "").replace(/\s+\((?:CL|EMP)-\d+\)$/i, "").trim();
}

function getReceivableServiceId(service = {}) {
  const source = service || {};
  return normalizeReceivableId(source.serviceId || source.id || source.centralServiceId);
}

function findServicePaymentForReceivable(service, payment) {
  const centralService = getCentralReceivableServiceFromInput(service) || service || {};
  return (centralService?.financial?.payments || []).find((item) => item.receivablePaymentId === payment.id || item.id === payment.servicePaymentId) || null;
}

function getNextReceivableId() {
  const maxNumber = receivablesData.receivables.reduce((max, receivable) => {
    const match = String(receivable.id || "").match(/^REC-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `REC-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getNextReceivablePaymentId() {
  const maxNumber = receivablesData.payments.reduce((max, payment) => {
    const match = String(payment.id || "").match(/^RCP-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `RCP-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getNextServicePaymentId() {
  if (window.ElaraServices && typeof window.ElaraServices.getNextServicePaymentId === "function") {
    return window.ElaraServices.getNextServicePaymentId();
  }

  const maxNumber = getServicesCollection().reduce((max, service) => {
    const serviceMax = (service.financial?.payments || []).reduce((paymentMax, payment) => {
      const match = String(payment.id || "").match(/^PAY-(\d+)$/);
      return match ? Math.max(paymentMax, Number(match[1])) : paymentMax;
    }, 0);
    return Math.max(max, serviceMax);
  }, 0);
  return `PAY-${String(maxNumber + 1).padStart(4, "0")}`;
}

function normalizeReceivableRecord(receivable = {}) {
  return {
    id: normalizeReceivableId(receivable.id || receivable.receivableId),
    serviceId: normalizeReceivableId(receivable.serviceId),
    customerId: normalizeReceivableId(receivable.customerId),
    customerName: normalizeReceivableText(receivable.customerName, true),
    status: RECEIVABLE_STATUSES.includes(receivable.status) ? receivable.status : "Pendiente",
    originalAmount: roundReceivableMoney(receivable.originalAmount),
    pendingAmount: roundReceivableMoney(receivable.pendingAmount),
    currency: receivable.currency || getReceivablesCurrency(),
    serviceDate: normalizeReceivableServiceDate(receivable.serviceDate),
    dueDate: receivable.dueDate || null,
    createdAt: receivable.createdAt || "",
    createdByUserId: normalizeReceivableId(receivable.createdByUserId),
    createdByUserName: normalizeReceivableText(receivable.createdByUserName, true),
    createdByUserRole: normalizeReceivableText(receivable.createdByUserRole, true),
    settledAt: receivable.settledAt || null,
    paymentId: normalizeReceivableId(receivable.paymentId) || null,
    cancelledAt: receivable.cancelledAt || null,
    cancellationReason: receivable.cancellationReason || null,
    metadata: receivable.metadata && typeof receivable.metadata === "object" ? cloneReceivableRecord(receivable.metadata) : { origin: "service", serviceSnapshot: {} },
  };
}

function normalizeReceivablePayment(payment = {}) {
  return {
    id: normalizeReceivableId(payment.id || payment.receivablePaymentId),
    receivableId: normalizeReceivableId(payment.receivableId),
    serviceId: normalizeReceivableId(payment.serviceId),
    customerId: normalizeReceivableId(payment.customerId),
    customerName: normalizeReceivableText(payment.customerName, true),
    amount: roundReceivableMoney(payment.amount),
    method: RECEIVABLE_PAYMENT_METHODS.includes(payment.method) ? payment.method : "Efectivo",
    paidAt: payment.paidAt || payment.createdAt || "",
    registeredAt: payment.registeredAt || payment.createdAt || "",
    registeredByUserId: normalizeReceivableId(payment.registeredByUserId),
    registeredByUserName: normalizeReceivableText(payment.registeredByUserName || payment.registeredByName, true),
    registeredByUserRole: normalizeReceivableText(payment.registeredByUserRole, true),
    cashMovementId: normalizeReceivableId(payment.cashMovementId),
    servicePaymentId: normalizeReceivableId(payment.servicePaymentId),
    observations: normalizeReceivableText(payment.observations || payment.notes, true),
    status: RECEIVABLE_PAYMENT_STATUSES.includes(payment.status) ? payment.status : "Registrado",
    annulledAt: payment.annulledAt || null,
    annulledByUserId: normalizeReceivableId(payment.annulledByUserId),
    annulledByUserName: normalizeReceivableText(payment.annulledByUserName || payment.annulledByName, true),
    annulledByUserRole: normalizeReceivableText(payment.annulledByUserRole, true),
    annulmentReason: payment.annulmentReason || null,
    reversalCashMovementId: normalizeReceivableId(payment.reversalCashMovementId),
  };
}

function createReceivableResult(ok, data = null, error = "", warnings = []) {
  return { ok: Boolean(ok), data, error: error || "", warnings: Array.isArray(warnings) ? warnings : [] };
}

function emitReceivablesEvents(detail = {}) {
  window.dispatchEvent(new CustomEvent(RECEIVABLES_EVENT, { detail }));
}

function compareReceivablesChronologically(first, second) {
  return first.serviceDate.localeCompare(second.serviceDate) || first.serviceId.localeCompare(second.serviceId);
}

function getOldestDate(values) {
  return values.filter(Boolean).sort()[0] || "";
}

function getLatestDate(values) {
  return values.filter(Boolean).sort().reverse()[0] || "";
}

function cloneReceivableRecord(record) {
  return JSON.parse(JSON.stringify(record || {}));
}

function roundReceivableMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function getNullableReceivableMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? roundReceivableMoney(number) : null;
}

function normalizeReceivableId(value) {
  return String(value || "").trim();
}

function normalizeReceivableText(value, preserveCase = false) {
  const text = String(value || "").trim();
  if (preserveCase) return text;
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeReceivableServiceDate(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const localMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  if (localMatch) return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
  return "";
}

function getReceivableTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getReceivablesCurrency() {
  return receivablesData.settings?.currency || "EUR";
}

window.ElaraReceivablesCore = {
  annulReceivablePayment,
  calculateReceivableServiceFinancialSummary,
  canAnnulReceivablePayment,
  canCollectReceivable,
  canViewReceivables,
  checkReceivablesIntegrity,
  getActiveReceivablePayment,
  getAllReceivables,
  getCustomerReceivableSummary,
  getGlobalReceivableSummary,
  getReceivableById,
  getReceivableByServiceId,
  getReceivablePayment,
  getReceivablePaymentHistory,
  getReceivablesForCustomer,
  isServiceReceivableEligible,
  reconcileReceivableServiceFinancial,
  reconcileReceivablesFromServices,
  registerReceivablePayment,
  roundReceivableMoney,
};

ensureReceivablesData();
