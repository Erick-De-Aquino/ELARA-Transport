/*
  Proyecto Atlas / ELARA Transport
  Archivo: settlements-core.js
  Responsabilidad: nucleo mock de calculo e integridad de liquidaciones.
*/

"use strict";

const settlementsData = window.ElaraFinanceMock || {};
const SETTLEMENT_STATUSES = ["Borrador", "Para revisión", "Pendiente de aprobación", "Aprobada", "Pagada", "Anulada"];
const SETTLEMENT_ACTIVE_STATUSES = ["Borrador", "Para revisión", "Pendiente de aprobación", "Aprobada", "Pagada"];
const SETTLEMENT_PAYMENT_METHODS = ["Transferencia", "Efectivo"];
const SETTLEMENT_DRIVER_VISIBLE_STATUSES = ["Para revisión", "Pendiente de aprobación", "Aprobada", "Pagada", "Anulada"];
const SETTLEMENT_INTERNAL_DRIVER_TYPE = "Chofer";
const SETTLEMENT_COLLABORATOR_DRIVER_TYPE = "Colaborador";
const SETTLEMENT_EXTERNAL_ENERGY_CATEGORIES = ["Combustible", "Electricidad"];

function roundSettlementMoney(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return Math.round((safeAmount + Number.EPSILON) * 100) / 100;
}

function getSettlementSettings() {
  const settings = settlementsData.settlementSettings || {};

  return {
    currency: "EUR",
    internalDriverPercentage: normalizeSettlementPercentage(settings.internalDriverPercentage, 35),
    collaboratorGlobalElaraPercentage: normalizeSettlementPercentage(settings.collaboratorGlobalElaraPercentage, 10),
    internalDriverFrequency: settings.internalDriverFrequency === "Mensual" ? "Mensual" : "Mensual",
    collaboratorFrequency: settings.collaboratorFrequency === "Semanal" ? "Semanal" : "Semanal",
  };
}

function getCollaboratorAppliedElaraPercentage(collaboratorId) {
  const collaborator = getSettlementCollaboratorById(collaboratorId);
  const settings = getSettlementSettings();

  if (!collaborator || collaborator.driverType !== SETTLEMENT_COLLABORATOR_DRIVER_TYPE) {
    return null;
  }

  const config = getNormalizedCollaboratorSettlementConfig(collaborator);

  if (config.percentageMode === "custom") {
    return isValidSettlementPercentage(config.customElaraPercentage) ? roundSettlementMoney(config.customElaraPercentage) : null;
  }

  return settings.collaboratorGlobalElaraPercentage;
}

function getSettlementPeriodForDate(driverType, date) {
  const normalizedDate = normalizeSettlementDate(date);
  const parsedDate = parseSettlementDate(normalizedDate);
  const type = normalizeSettlementDriverType(driverType);

  if (!parsedDate) {
    return {
      periodType: type === SETTLEMENT_INTERNAL_DRIVER_TYPE ? "Mensual" : "Semanal",
      periodStart: "",
      periodEnd: "",
    };
  }

  if (type === SETTLEMENT_INTERNAL_DRIVER_TYPE) {
    const periodStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
    const periodEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0);

    return {
      periodType: "Mensual",
      periodStart: formatSettlementDate(periodStart),
      periodEnd: formatSettlementDate(periodEnd),
    };
  }

  const day = parsedDate.getDay();
  const daysFromMonday = (day + 6) % 7;
  const periodStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() - daysFromMonday);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 6);

  return {
    periodType: "Semanal",
    periodStart: formatSettlementDate(periodStart),
    periodEnd: formatSettlementDate(periodEnd),
  };
}

function getApprovedComputableExpensesForService(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();
  const service = getSettlementServiceById(normalizedServiceId);
  const collaborator = getSettlementCollaboratorById(getSettlementServiceDriverId(service));
  const expenses = getSettlementExpensesCollection();
  const items = expenses
    .map(normalizeSettlementExpense)
    .filter((expense) => expense.serviceId === normalizedServiceId)
    .filter(isApprovedSettlementExpense)
    .filter(isExpenseMarkedComputableForSettlement)
    .filter((expense) => !isExcludedExternalEnergyExpense(expense, collaborator))
    .map((expense) => ({
      expenseId: expense.expenseId,
      amount: getSettlementExpenseApprovedAmount(expense),
      category: expense.category,
      paidBy: expense.paidBy,
      claimantType: expense.claimantType,
    }));

  return {
    serviceId: normalizedServiceId,
    items,
    totalAmount: roundSettlementMoney(items.reduce((total, expense) => total + expense.amount, 0)),
  };
}

function calculateServiceSettlementItem(serviceId, options = {}) {
  const service = getSettlementServiceById(serviceId);
  const errors = [];
  const warnings = [];

  if (!service) {
    return {
      ok: false,
      item: null,
      warnings,
      errors: ["No se encontró el servicio indicado."],
    };
  }

  const collaborator = getSettlementCollaboratorById(getSettlementServiceDriverId(service));
  const driverType = normalizeSettlementDriverType(collaborator?.driverType || service.driverType);
  const financial = getSettlementServiceFinancialSummary(service);
  const discountsAmount = roundSettlementMoney(financial.discountsAmount);
  const nonComputableTaxesAmount = roundSettlementMoney(financial.nonComputableTaxesAmount);
  const basePrice = financial.totalPrice === null ? 0 : roundSettlementMoney(financial.totalPrice);
  const netIncome = roundSettlementMoney(basePrice - discountsAmount - nonComputableTaxesAmount);
  const computableExpenses = getApprovedComputableExpensesForService(service.serviceId).totalAmount;
  const liquidableMargin = roundSettlementMoney(netIncome - computableExpenses);
  const appliedPercentageData = getSettlementAppliedPercentageData(collaborator, driverType);
  const appliedPercentage = appliedPercentageData.appliedPercentage;
  const reviewReasons = [];

  if (!isFinalizedSettlementService(service)) {
    errors.push("El servicio no está finalizado.");
    reviewReasons.push("Servicio no finalizado.");
  }

  if (!collaborator) {
    errors.push("El servicio no tiene conductor o colaborador válido.");
    reviewReasons.push("Conductor inexistente.");
  }

  if (financial.totalPrice === null || financial.totalPrice <= 0) {
    errors.push("El servicio no tiene importe financiero válido.");
    reviewReasons.push("Importe financiero inválido.");
  }

  if (!isValidSettlementPercentage(appliedPercentage)) {
    errors.push("No existe un porcentaje válido para calcular la liquidación.");
    reviewReasons.push("Porcentaje de liquidación inválido.");
  }

  if (liquidableMargin < 0) {
    warnings.push("El margen liquidable es negativo.");
    reviewReasons.push("Margen liquidable negativo.");
  }

  const amounts = calculateSettlementSplitAmounts(driverType, liquidableMargin, appliedPercentage);
  const item = {
    serviceId: service.serviceId,
    serviceDate: normalizeSettlementDate(service.date),
    driverId: collaborator?.id || getSettlementServiceDriverId(service),
    driverType,
    basePrice,
    discountsAmount,
    nonComputableTaxesAmount,
    netIncome,
    approvedComputableExpenses: computableExpenses,
    liquidableMargin,
    appliedPercentage: isValidSettlementPercentage(appliedPercentage) ? roundSettlementMoney(appliedPercentage) : 0,
    elaraAmount: amounts.elaraAmount,
    driverAmount: amounts.driverAmount,
    paymentStatusSnapshot: financial.paymentStatus,
    hasPendingCollection: financial.hasPendingCollection,
    pendingCollectionAmountSnapshot: financial.hasPendingCollection ? financial.pendingAmount : 0,
    calculationStatus: errors.length || warnings.length ? "Para revisión" : "Calculable",
    reviewReasons,
  };

  return {
    ok: errors.length === 0,
    item,
    warnings,
    errors,
  };
}

function calculateSettlementTotals(serviceItems = []) {
  return serviceItems.reduce(
    (totals, item) => {
      totals.grossIncome = roundSettlementMoney(totals.grossIncome + roundSettlementMoney(item.basePrice));
      totals.discounts = roundSettlementMoney(totals.discounts + roundSettlementMoney(item.discountsAmount));
      totals.nonComputableTaxes = roundSettlementMoney(totals.nonComputableTaxes + roundSettlementMoney(item.nonComputableTaxesAmount));
      totals.netIncome = roundSettlementMoney(totals.netIncome + roundSettlementMoney(item.netIncome));
      totals.computableExpenses = roundSettlementMoney(totals.computableExpenses + roundSettlementMoney(item.approvedComputableExpenses));
      totals.liquidableMargin = roundSettlementMoney(totals.liquidableMargin + roundSettlementMoney(item.liquidableMargin));
      totals.elaraAmount = roundSettlementMoney(totals.elaraAmount + roundSettlementMoney(item.elaraAmount));
      totals.driverAmount = roundSettlementMoney(totals.driverAmount + roundSettlementMoney(item.driverAmount));
      totals.servicesCount += 1;

      if (item.hasPendingCollection) {
        totals.pendingCollectionAmount = roundSettlementMoney(totals.pendingCollectionAmount + roundSettlementMoney(item.pendingCollectionAmountSnapshot));
      }

      if (item.calculationStatus === "Para revisión") {
        totals.reviewItemsCount += 1;
      }

      return totals;
    },
    {
      grossIncome: 0,
      discounts: 0,
      nonComputableTaxes: 0,
      netIncome: 0,
      computableExpenses: 0,
      liquidableMargin: 0,
      elaraAmount: 0,
      driverAmount: 0,
      servicesCount: 0,
      pendingCollectionAmount: 0,
      reviewItemsCount: 0,
    },
  );
}

function getEligibleServicesForSettlement(driverId, periodStart, periodEnd, options = {}) {
  const normalizedDriverId = String(driverId || "").trim();
  const start = normalizeSettlementDate(periodStart);
  const end = normalizeSettlementDate(periodEnd);
  const ignoredSettlementId = String(options.ignoreSettlementId || "").trim();

  if (!normalizedDriverId || !start || !end) {
    return [];
  }

  return getSettlementServicesCollection()
    .filter((service) => getSettlementServiceDriverId(service) === normalizedDriverId)
    .filter(isFinalizedSettlementService)
    .filter((service) => {
      const serviceDate = normalizeSettlementDate(service.date);

      return serviceDate >= start && serviceDate <= end;
    })
    .filter((service) =>
      ignoredSettlementId
        ? !isSettlementServiceAlreadyIncludedOutsideSettlement(service.serviceId, ignoredSettlementId)
        : !isSettlementServiceAlreadyIncluded(service.serviceId),
    )
    .filter((service) => {
      const calculation = calculateServiceSettlementItem(service.serviceId);

      return calculation.ok && calculation.item?.calculationStatus === "Calculable";
    });
}

function buildSettlementDraft(driverId, periodStart, periodEnd, createdByUserId = "", options = {}) {
  const collaborator = getSettlementCollaboratorById(driverId);
  const driverType = normalizeSettlementDriverType(collaborator?.driverType);
  const period = getSettlementPeriodForDate(driverType, periodStart);
  const services = getEligibleServicesForSettlement(driverId, periodStart, periodEnd, options);
  const serviceItems = services
    .map((service) => calculateServiceSettlementItem(service.serviceId))
    .filter((result) => result.item)
    .map((result) => result.item);
  const totals = calculateSettlementTotals(serviceItems);

  return {
    settlementId: getNextSettlementId(),
    driverId: String(driverId || "").trim(),
    driverType,
    periodType: period.periodType,
    periodStart: normalizeSettlementDate(periodStart),
    periodEnd: normalizeSettlementDate(periodEnd),
    status: totals.reviewItemsCount > 0 ? "Para revisión" : "Borrador",
    currency: getSettlementSettings().currency,
    serviceItems,
    totals,
    percentageSnapshot: getSettlementPercentageSnapshot(collaborator, driverType),
    payment: createEmptySettlementPayment(totals.driverAmount),
    reviewFlags: getSettlementReviewFlags(serviceItems),
    createdAt: new Date().toISOString(),
    createdByUserId: String(createdByUserId || "").trim(),
    approvedAt: null,
    approvedByUserId: null,
    paidAt: null,
    paidByUserId: null,
    annulment: createEmptySettlementAnnulment(),
  };
}

function checkSettlementIntegrity() {
  const warnings = [];
  const seenSettlementIds = new Set();
  const activeServiceUsage = new Map();
  const settings = getSettlementSettings();

  validateSettlementPercentage("Configuración: porcentaje chofer interno", settings.internalDriverPercentage, warnings);
  validateSettlementPercentage("Configuración: porcentaje ELARA colaborador", settings.collaboratorGlobalElaraPercentage, warnings);
  validateCollaboratorSettlementConfigs(warnings);

  getSettlementsCollection().forEach((settlement) => {
    const normalizedSettlement = normalizeSettlementRecord(settlement);
    const settlementLabel = normalizedSettlement.settlementId || "Liquidación sin ID";
    const serviceIdsInSettlement = new Set();

    if (seenSettlementIds.has(normalizedSettlement.settlementId)) {
      warnings.push(`${settlementLabel}: settlementId duplicado.`);
    }
    seenSettlementIds.add(normalizedSettlement.settlementId);

    if (!getSettlementCollaboratorById(normalizedSettlement.driverId)) {
      warnings.push(`${settlementLabel}: conductor o colaborador inexistente.`);
    }

    if (normalizedSettlement.currency !== settings.currency) {
      warnings.push(`${settlementLabel}: moneda distinta a la configuración central.`);
    }

    validateSettlementPercentage(`${settlementLabel}: porcentaje snapshot aplicado`, normalizedSettlement.percentageSnapshot.appliedPercentage, warnings);

    normalizedSettlement.serviceItems.forEach((item) => {
      validateSettlementItemSnapshot(settlementLabel, item, warnings);

      if (serviceIdsInSettlement.has(item.serviceId)) {
        warnings.push(`${settlementLabel}: servicio repetido dentro de la liquidación (${item.serviceId}).`);
      }
      serviceIdsInSettlement.add(item.serviceId);

      if (!getSettlementServiceById(item.serviceId)) {
        warnings.push(`${settlementLabel}: referencia a servicio inexistente (${item.serviceId}).`);
      }

      if (!getSettlementCollaboratorById(item.driverId)) {
        warnings.push(`${settlementLabel}: referencia a conductor inexistente en item (${item.driverId}).`);
      }

      if (item.driverId && item.driverId !== normalizedSettlement.driverId) {
        warnings.push(`${settlementLabel}: servicio incluido con driverId distinto (${item.serviceId}).`);
      }

      if (item.liquidableMargin < 0 && item.calculationStatus !== "Para revisión" && !item.reviewReasons.length) {
        warnings.push(`${settlementLabel}: servicio con margen negativo sin bandera de revisión (${item.serviceId}).`);
      }

      if (SETTLEMENT_ACTIVE_STATUSES.includes(normalizedSettlement.status)) {
        const usage = activeServiceUsage.get(item.serviceId) || [];
        usage.push(settlementLabel);
        activeServiceUsage.set(item.serviceId, usage);
      }
    });

    validateSettlementTotals(normalizedSettlement, warnings);

    if (normalizedSettlement.status === "Aprobada" && (!normalizedSettlement.approvedAt || !normalizedSettlement.approvedByUserId)) {
      warnings.push(`${settlementLabel}: liquidación aprobada sin aprobador.`);
    }

    if (normalizedSettlement.status === "Aprobada" && getSettlementBlockingIssues(normalizedSettlement).length) {
      warnings.push(`${settlementLabel}: liquidación aprobada con incidencias bloqueantes.`);
    }

    if (normalizedSettlement.status === "Pagada" && (!normalizedSettlement.payment.paidAt || !normalizedSettlement.payment.paidByUserId)) {
      warnings.push(`${settlementLabel}: liquidación pagada sin datos de pago.`);
    }
  });

  activeServiceUsage.forEach((settlementIds, serviceId) => {
    if (settlementIds.length > 1) {
      warnings.push(`${serviceId}: servicio presente en más de una liquidación activa, aprobada o pagada.`);
    }
  });

  warnings.push(...getSettlementPaymentIntegrityWarnings());

  warnings.forEach((warning) => console.warn("[ELARA] Liquidaciones:", warning));

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

function getSettlementById(settlementId) {
  const normalizedSettlementId = String(settlementId || "").trim();

  return getSettlementsCollection().find((settlement) => normalizeSettlementRecord(settlement).settlementId === normalizedSettlementId) || null;
}

function getSettlementPayment(settlementId) {
  const settlement = getSettlementById(settlementId);

  return settlement ? normalizeSettlementRecord(settlement).payment : null;
}

function reconcileSettlementPaymentStatus(settlement = {}) {
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (normalizedSettlement.payment.status === "Pagado" && normalizedSettlement.status !== "Pagada") {
    return {
      ...normalizedSettlement,
      status: "Pagada",
    };
  }

  if (normalizedSettlement.payment.status === "Anulado" && normalizedSettlement.status === "Pagada") {
    return {
      ...normalizedSettlement,
      status: "Aprobada",
    };
  }

  return normalizedSettlement;
}

function checkSettlementPaymentIntegrity() {
  const warnings = getSettlementPaymentIntegrityWarnings();

  warnings.forEach((warning) => console.warn("[ELARA] Liquidaciones / Pagos:", warning));

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

function getSettlementPaymentIntegrityWarnings() {
  const warnings = [];
  const settlements = getSettlementsCollection().map(normalizeSettlementRecord);
  const settlementIds = new Set(settlements.map((settlement) => settlement.settlementId));
  const paymentMovements = getSettlementCashMovements().filter(isSettlementPaymentCashMovement);
  const reversalMovements = getSettlementCashMovements().filter(isSettlementPaymentReversalCashMovement);
  const cashMovementUsage = new Map();

  settlements.forEach((settlement) => {
    const payment = settlement.payment;
    const activePaymentMovements = paymentMovements.filter((movement) => getCashMovementSettlementId(movement) === settlement.settlementId && !movement.reversedByCashMovementId);

    if (payment.cashMovementId) {
      const refs = cashMovementUsage.get(payment.cashMovementId) || [];
      refs.push(settlement.settlementId);
      cashMovementUsage.set(payment.cashMovementId, refs);
    }

    if (settlement.status === "Pagada" && payment.status !== "Pagado") {
      warnings.push(`${settlement.settlementId}: estado Pagada sin payment.status Pagado.`);
    }

    if (payment.status === "Pagado") {
      if (settlement.status !== "Pagada") {
        warnings.push(`${settlement.settlementId}: pago marcado Pagado con liquidacion en estado ${settlement.status}.`);
      }

      if (!payment.cashMovementId) {
        warnings.push(`${settlement.settlementId}: pago sin movimiento de Caja.`);
      }

      if (!payment.paidAt || !payment.paidByUserId || !payment.paidByUserName || !payment.paidByUserRole) {
        warnings.push(`${settlement.settlementId}: pago sin trazabilidad completa de registrador.`);
      }

      if (!SETTLEMENT_PAYMENT_METHODS.includes(payment.method)) {
        warnings.push(`${settlement.settlementId}: pago sin metodo valido.`);
      }

      const movement = paymentMovements.find((item) => item.id === payment.cashMovementId);

      if (!movement) {
        warnings.push(`${settlement.settlementId}: movimiento de Caja de pago inexistente (${payment.cashMovementId}).`);
      } else {
        if (getCashMovementSettlementId(movement) !== settlement.settlementId) {
          warnings.push(`${settlement.settlementId}: movimiento de Caja asociado a otra liquidacion.`);
        }

        if (roundSettlementMoney(movement.amount) !== payment.amount || payment.amount !== settlement.totals.driverAmount) {
          warnings.push(`${settlement.settlementId}: importe de pago no coincide con Caja o con el importe persona.`);
        }

        if (movement.type !== "Salida") {
          warnings.push(`${settlement.settlementId}: movimiento de pago no es Salida.`);
        }
      }

      if (activePaymentMovements.length > 1) {
        warnings.push(`${settlement.settlementId}: mas de una salida activa de Caja para el pago.`);
      }
    }

    if (payment.status === "Anulado") {
      if (!payment.cashMovementId || !payment.reversalCashMovementId || !payment.annulledAt || !payment.annulmentReason) {
        warnings.push(`${settlement.settlementId}: pago anulado sin trazabilidad completa.`);
      }

      const originalMovement = paymentMovements.find((item) => item.id === payment.cashMovementId);
      const reversalMovement = reversalMovements.find((item) => item.id === payment.reversalCashMovementId);

      if (!originalMovement) {
        warnings.push(`${settlement.settlementId}: pago anulado sin salida original de Caja.`);
      }

      if (!reversalMovement) {
        warnings.push(`${settlement.settlementId}: pago anulado sin entrada de reversión en Caja.`);
      }

      if (originalMovement && originalMovement.reversedByCashMovementId !== payment.reversalCashMovementId) {
        warnings.push(`${settlement.settlementId}: salida original no referencia la reversión registrada.`);
      }
    }
  });

  paymentMovements.forEach((movement) => {
    const settlementId = getCashMovementSettlementId(movement);

    if (!settlementIds.has(settlementId)) {
      warnings.push(`${movement.id}: movimiento de pago de Caja sin liquidacion central.`);
    }
  });

  cashMovementUsage.forEach((settlementRefs, cashMovementId) => {
    if (settlementRefs.length > 1) {
      warnings.push(`${cashMovementId}: movimiento de Caja referenciado por varias liquidaciones (${settlementRefs.join(", ")}).`);
    }
  });

  return warnings;
}

function getSettlementSummary(filters = {}) {
  const settlements = getFilteredSettlements(filters);
  const includedServiceIds = new Set();

  const summary = {
    drafts: 0,
    review: 0,
    pendingApproval: 0,
    approved: 0,
    paid: 0,
    pendingSettlementAmount: 0,
    includedServices: 0,
  };

  settlements.forEach((settlement) => {
    const normalizedSettlement = normalizeSettlementRecord(settlement);
    const totals = normalizedSettlement.totals;

    if (normalizedSettlement.status === "Borrador") summary.drafts += 1;
    if (normalizedSettlement.status === "Para revisión") summary.review += 1;
    if (normalizedSettlement.status === "Pendiente de aprobación") summary.pendingApproval += 1;
    if (normalizedSettlement.status === "Aprobada") summary.approved += 1;
    if (normalizedSettlement.status === "Pagada") summary.paid += 1;

    if (["Pendiente de aprobación", "Aprobada"].includes(normalizedSettlement.status) && normalizedSettlement.payment.status !== "Pagado") {
      summary.pendingSettlementAmount = roundSettlementMoney(summary.pendingSettlementAmount + totals.driverAmount);
    }

    if (normalizedSettlement.status !== "Anulada") {
      normalizedSettlement.serviceItems.forEach((item) => {
        if (item.serviceId) {
          includedServiceIds.add(item.serviceId);
        }
      });
    }
  });

  summary.includedServices = includedServiceIds.size;

  return summary;
}

function getSettlementsForDriver(driverId, filters = {}) {
  const normalizedDriverId = String(driverId || "").trim();

  if (!normalizedDriverId) {
    return [];
  }

  const requestedStatuses = normalizeSettlementFilterValues(filters.statuses || filters.status);
  const statuses = requestedStatuses.length ? requestedStatuses : SETTLEMENT_DRIVER_VISIBLE_STATUSES;

  return getFilteredSettlements({
    ...filters,
    driverId: normalizedDriverId,
    statuses,
  })
    .filter((settlement) => settlement.driverId === normalizedDriverId)
    .filter((settlement) => SETTLEMENT_DRIVER_VISIBLE_STATUSES.includes(settlement.status))
    .sort((first, second) => second.periodEnd.localeCompare(first.periodEnd) || getSettlementTimestamp(second.createdAt) - getSettlementTimestamp(first.createdAt))
    .map(cloneSettlementRecord);
}

function getDriverSettlementById(driverId, settlementId) {
  const normalizedDriverId = String(driverId || "").trim();
  const normalizedSettlementId = String(settlementId || "").trim();

  if (!normalizedDriverId || !normalizedSettlementId) {
    return null;
  }

  const settlement = getSettlementById(normalizedSettlementId);
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!settlement || normalizedSettlement.driverId !== normalizedDriverId || !SETTLEMENT_DRIVER_VISIBLE_STATUSES.includes(normalizedSettlement.status)) {
    return null;
  }

  return cloneSettlementRecord(normalizedSettlement);
}

function getDriverSettlementSummary(driverId, filters = {}) {
  const settlements = getSettlementsForDriver(driverId, filters);
  const serviceIds = new Set();
  const summary = {
    pendingApprovalAmount: 0,
    approvedPendingPaymentAmount: 0,
    paidAmount: 0,
    paidCount: 0,
    settledServices: 0,
    nextSettlement: "Sin calcular",
  };

  settlements.forEach((settlement) => {
    if (settlement.status === "Pendiente de aprobación") {
      summary.pendingApprovalAmount = roundSettlementMoney(summary.pendingApprovalAmount + settlement.totals.driverAmount);
    }

    if (settlement.status === "Aprobada") {
      summary.approvedPendingPaymentAmount = roundSettlementMoney(summary.approvedPendingPaymentAmount + settlement.totals.driverAmount);
    }

    if (settlement.status === "Pagada" && isActiveSettlementPayment(settlement.payment)) {
      summary.paidAmount = roundSettlementMoney(summary.paidAmount + settlement.payment.amount);
      summary.paidCount += 1;
    }

    if (settlement.status !== "Anulada") {
      settlement.serviceItems.forEach((item) => {
        if (item.serviceId) {
          serviceIds.add(item.serviceId);
        }
      });
    }
  });

  summary.settledServices = serviceIds.size;

  return summary;
}

function canViewOwnSettlement(settlement = {}, session = {}) {
  const user = getSettlementSessionUser(session);
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  return (
    canSettlementPerformAction(user, "settlements:viewOwn") &&
    Boolean(user?.driverId) &&
    normalizedSettlement.driverId === String(user.driverId || "").trim() &&
    SETTLEMENT_DRIVER_VISIBLE_STATUSES.includes(normalizedSettlement.status)
  );
}

function generateSettlementDraft(data = {}, currentUser = {}) {
  if (!canCreateSettlement(currentUser)) {
    return createSettlementResult(false, null, "No tienes permiso para generar liquidaciones.");
  }

  const validation = validateSettlementDraftInput(data);

  if (!validation.ok) {
    return validation;
  }

  const draft = buildSettlementDraft(data.driverId, data.periodStart, data.periodEnd, getSettlementSessionUser(currentUser)?.id || "");
  const collaborator = getSettlementCollaboratorById(data.driverId);
  const generationFlags = getSettlementGenerationReviewFlags(data.driverId, data.periodStart, data.periodEnd);

  if (!draft.serviceItems.length && !generationFlags.length) {
    return createSettlementResult(false, null, "No hay servicios para liquidar en el periodo seleccionado.");
  }

  draft.createdByName = getSettlementSessionUser(currentUser)?.name || "Administracion";
  draft.observations = String(data.observations || "").trim();
  draft.driverNameSnapshot = collaborator?.name || "Conductor";
  draft.reviewFlags = Array.from(new Set([...(draft.reviewFlags || []), ...generationFlags]));
  draft.status = draft.reviewFlags.length ? "Para revisión" : "Borrador";

  getSettlementsCollection().push(draft);
  addSettlementActivity("SETTLEMENT_CREATED", "Liquidacion generada", `${draft.settlementId} fue generada.`, draft, currentUser);
  emitSettlementsUpdatedEvent("created", draft.settlementId);

  return createSettlementResult(true, draft);
}

function recalculateSettlementDraft(settlementId, currentUser = {}) {
  const settlement = getSettlementById(settlementId);

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!["Borrador", "Para revisión"].includes(normalizedSettlement.status)) {
    return createSettlementResult(false, null, "Solo se pueden recalcular liquidaciones antes de aprobar.");
  }

  if (!canReviewSettlement(currentUser)) {
    return createSettlementResult(false, null, "No tienes permiso para recalcular liquidaciones.");
  }

  const recalculated = buildSettlementDraft(normalizedSettlement.driverId, normalizedSettlement.periodStart, normalizedSettlement.periodEnd, normalizedSettlement.createdByUserId, {
    ignoreSettlementId: normalizedSettlement.settlementId,
  });
  const generationFlags = getSettlementGenerationReviewFlags(normalizedSettlement.driverId, normalizedSettlement.periodStart, normalizedSettlement.periodEnd, {
    ignoreSettlementId: normalizedSettlement.settlementId,
  });
  const now = new Date().toISOString();
  const user = getSettlementSessionUser(currentUser);

  settlement.serviceItems = recalculated.serviceItems;
  settlement.totals = recalculated.totals;
  settlement.percentageSnapshot = recalculated.percentageSnapshot;
  settlement.reviewFlags = Array.from(new Set([...(recalculated.reviewFlags || []), ...generationFlags]));
  settlement.status = settlement.reviewFlags.length ? "Para revisión" : "Borrador";
  settlement.recalculatedAt = now;
  settlement.recalculatedByUserId = user?.id || "";
  settlement.recalculatedByName = user?.name || "Administracion";

  addSettlementActivity("SETTLEMENT_RECALCULATED", "Liquidacion recalculada", `${settlement.settlementId} fue recalculada.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("recalculated", settlement.settlementId);

  return createSettlementResult(true, settlement);
}

function submitSettlementForApproval(settlementId, currentUser = {}) {
  const settlement = getSettlementById(settlementId);

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!["Borrador", "Para revisión"].includes(normalizedSettlement.status)) {
    return createSettlementResult(false, null, "Solo los borradores o liquidaciones en revision pueden enviarse a aprobacion.");
  }

  if (!canReviewSettlement(currentUser)) {
    return createSettlementResult(false, null, "No tienes permiso para revisar liquidaciones.");
  }

  const blockers = getSettlementBlockingIssues(normalizedSettlement);

  if (blockers.length) {
    return createSettlementResult(false, normalizedSettlement, "La liquidacion tiene incidencias bloqueantes.", blockers);
  }

  const user = getSettlementSessionUser(currentUser);
  settlement.status = "Pendiente de aprobación";
  settlement.submittedAt = new Date().toISOString();
  settlement.submittedByUserId = user?.id || "";
  settlement.submittedByName = user?.name || "Administracion";

  addSettlementActivity("SETTLEMENT_SUBMITTED", "Liquidacion enviada a aprobacion", `${settlement.settlementId} fue enviada a aprobacion.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("submitted", settlement.settlementId);

  return createSettlementResult(true, settlement);
}

function approveSettlement(settlementId, data = {}, currentUser = {}) {
  const settlement = getSettlementById(settlementId);

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (normalizedSettlement.status !== "Pendiente de aprobación") {
    return createSettlementResult(false, normalizedSettlement, "Solo las liquidaciones pendientes de aprobacion pueden aprobarse.");
  }

  if (!canApproveSettlement(currentUser)) {
    return createSettlementResult(false, normalizedSettlement, "No tienes permiso para aprobar liquidaciones.");
  }

  const blockers = getSettlementBlockingIssues(normalizedSettlement);

  if (blockers.length) {
    return createSettlementResult(false, normalizedSettlement, "La liquidacion tiene incidencias bloqueantes.", blockers);
  }

  const user = getSettlementSessionUser(currentUser);
  settlement.status = "Aprobada";
  settlement.approvedAt = new Date().toISOString();
  settlement.approvedByUserId = user?.id || "";
  settlement.approvedByName = user?.name || "Administracion";
  settlement.approvalNotes = String(data.notes || "").trim();
  settlement.snapshotLocked = true;

  addSettlementActivity("SETTLEMENT_APPROVED", "Liquidacion aprobada", `${settlement.settlementId} fue aprobada.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("approved", settlement.settlementId);

  return createSettlementResult(true, settlement);
}

function returnSettlementToReview(settlementId, reason = "", currentUser = {}) {
  const settlement = getSettlementById(settlementId);
  const normalizedReason = String(reason || "").trim();

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  if (!normalizedReason) {
    return createSettlementResult(false, settlement, "El motivo es obligatorio.");
  }

  if (normalizeSettlementRecord(settlement).status !== "Pendiente de aprobación") {
    return createSettlementResult(false, settlement, "Solo una liquidacion pendiente de aprobacion puede devolverse a revision.");
  }

  if (!canReviewSettlement(currentUser)) {
    return createSettlementResult(false, settlement, "No tienes permiso para devolver liquidaciones a revision.");
  }

  const user = getSettlementSessionUser(currentUser);
  const entry = {
    returnedAt: new Date().toISOString(),
    returnedByUserId: user?.id || "",
    returnedByName: user?.name || "Administracion",
    reason: normalizedReason,
  };

  settlement.status = "Para revisión";
  settlement.returnHistory = Array.isArray(settlement.returnHistory) ? settlement.returnHistory : [];
  settlement.returnHistory.push(entry);

  addSettlementActivity("SETTLEMENT_RETURNED", "Liquidacion devuelta a revision", `${settlement.settlementId} fue devuelta a revision.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("returned", settlement.settlementId);

  return createSettlementResult(true, settlement);
}

function cancelSettlement(settlementId, reason = "", currentUser = {}) {
  const settlement = getSettlementById(settlementId);
  const normalizedReason = String(reason || "").trim();

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!canCancelSettlement(currentUser, normalizedSettlement)) {
    return createSettlementResult(false, normalizedSettlement, "No tienes permiso para anular esta liquidacion.");
  }

  if (!normalizedReason) {
    return createSettlementResult(false, normalizedSettlement, "El motivo de anulacion es obligatorio.");
  }

  if (normalizedSettlement.status === "Pagada" || normalizedSettlement.payment.status === "Pagado") {
    return createSettlementResult(false, normalizedSettlement, "No se puede anular una liquidacion pagada.");
  }

  const user = getSettlementSessionUser(currentUser);
  settlement.status = "Anulada";
  settlement.annulment = {
    annulledAt: new Date().toISOString(),
    annulledByUserId: user?.id || "",
    annulledByName: user?.name || "Administracion",
    reason: normalizedReason,
  };

  addSettlementActivity("SETTLEMENT_CANCELLED", "Liquidacion anulada", `${settlement.settlementId} fue anulada.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("cancelled", settlement.settlementId);

  return createSettlementResult(true, settlement);
}

function registerSettlementPayment(settlementId, data = {}, currentUser = {}) {
  const settlement = getSettlementById(settlementId);
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  if (!canPaySettlement(currentUser, normalizedSettlement)) {
    return createSettlementResult(false, normalizedSettlement, "No tienes permiso para registrar el pago de esta liquidacion.");
  }

  const method = String(data.method || "").trim();

  if (!SETTLEMENT_PAYMENT_METHODS.includes(method)) {
    return createSettlementResult(false, normalizedSettlement, "Selecciona un metodo de pago valido.");
  }

  const paidAt = normalizeSettlementPaymentDateTime(data.paidAt);

  if (!paidAt) {
    return createSettlementResult(false, normalizedSettlement, "Indica una fecha de pago valida.");
  }

  if (!window.ElaraCash || typeof window.ElaraCash.registerSettlementCashOutflow !== "function" || typeof window.ElaraCash.rollbackCashMovement !== "function") {
    console.error("[ELARA] Liquidaciones: Caja no esta disponible para registrar el pago.");
    return createSettlementResult(false, normalizedSettlement, "No se pudo registrar el movimiento de Caja.");
  }

  const user = getSettlementUserSnapshot(currentUser);
  const collaborator = getSettlementCollaboratorById(normalizedSettlement.driverId);
  const amount = roundSettlementMoney(normalizedSettlement.totals.driverAmount);
  let cashMovementId = null;

  try {
    const cashResult = window.ElaraCash.registerSettlementCashOutflow({
      settlementId: normalizedSettlement.settlementId,
      amount,
      beneficiaryId: normalizedSettlement.driverId,
      beneficiaryName: collaborator?.name || normalizedSettlement.driverNameSnapshot || normalizedSettlement.driverId,
      paymentMethod: method,
      paidAt,
      recordedByUserId: user.id,
      recordedByUserName: user.name,
      recordedByUserRole: user.role,
      observations: data.observations,
    });

    const cashMovement = cashResult?.movement || cashResult?.data;

    if (!cashResult?.ok || !cashMovement?.id) {
      return createSettlementResult(false, normalizedSettlement, cashResult?.error || "No se pudo registrar el movimiento de Caja.");
    }

    cashMovementId = cashMovement.id;

    settlement.status = "Pagada";
    settlement.payment = {
      ...createEmptySettlementPayment(amount),
      status: "Pagado",
      amount,
      method,
      paidAt,
      paidByUserId: user.id,
      paidByUserName: user.name,
      paidByName: user.name,
      paidByUserRole: user.role,
      cashMovementId,
      observations: String(data.observations || "").trim(),
    };
    settlement.paidAt = paidAt;
    settlement.paidByUserId = user.id;
    settlement.updatedAt = new Date().toISOString();

    addSettlementActivity("SETTLEMENT_PAID", "Liquidacion pagada", `${normalizedSettlement.settlementId} fue pagada.`, settlement, currentUser);
    emitSettlementsUpdatedEvent("paid", normalizedSettlement.settlementId);

    return createSettlementResult(true, normalizeSettlementRecord(settlement));
  } catch (error) {
    if (cashMovementId) {
      window.ElaraCash.rollbackCashMovement(cashMovementId);
    }

    console.error("[ELARA] Liquidaciones: error al registrar pago.", error);
    return createSettlementResult(false, normalizedSettlement, "No se pudo completar el pago de la liquidacion.");
  }
}

function annulSettlementPayment(settlementId, reason = "", currentUser = {}) {
  const settlement = getSettlementById(settlementId);
  const normalizedReason = String(reason || "").trim();
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  if (!settlement) {
    return createSettlementResult(false, null, "No se encontro la liquidacion seleccionada.");
  }

  if (!normalizedReason) {
    return createSettlementResult(false, normalizedSettlement, "El motivo de anulacion es obligatorio.");
  }

  if (!canAnnulSettlementPayment(currentUser, normalizedSettlement)) {
    return createSettlementResult(false, normalizedSettlement, "No tienes permiso para anular este pago.");
  }

  if (!window.ElaraCash || typeof window.ElaraCash.registerSettlementPaymentReversal !== "function") {
    console.error("[ELARA] Liquidaciones: Caja no esta disponible para revertir el pago.");
    return createSettlementResult(false, normalizedSettlement, "No se pudo registrar la reversión en Caja.");
  }

  const user = getSettlementUserSnapshot(currentUser);
  const payment = normalizedSettlement.payment;
  const reversalResult = window.ElaraCash.registerSettlementPaymentReversal({
    settlementId: normalizedSettlement.settlementId,
    originalCashMovementId: payment.cashMovementId,
    amount: payment.amount,
    beneficiaryId: normalizedSettlement.driverId,
    beneficiaryName: getSettlementCollaboratorById(normalizedSettlement.driverId)?.name || normalizedSettlement.driverNameSnapshot || normalizedSettlement.driverId,
    paymentMethod: payment.method,
    reversedAt: new Date().toISOString(),
    recordedByUserId: user.id,
    recordedByUserName: user.name,
    recordedByUserRole: user.role,
    reason: normalizedReason,
  });

  const reversalMovement = reversalResult?.movement || reversalResult?.data;

  if (!reversalResult?.ok || !reversalMovement?.id) {
    return createSettlementResult(false, normalizedSettlement, reversalResult?.error || "No se pudo registrar la reversión en Caja.");
  }

  settlement.status = "Aprobada";
  settlement.payment = {
    ...payment,
    status: "Anulado",
    annulledAt: new Date().toISOString(),
    annulledByUserId: user.id,
    annulledByUserName: user.name,
    annulledByUserRole: user.role,
    annulmentReason: normalizedReason,
    reversalCashMovementId: reversalMovement.id,
  };
  settlement.paidAt = null;
  settlement.paidByUserId = null;
  settlement.updatedAt = new Date().toISOString();

  addSettlementActivity("SETTLEMENT_PAYMENT_ANNULLED", "Pago de liquidacion anulado", `${normalizedSettlement.settlementId} volvio a aprobada tras anular el pago.`, settlement, currentUser);
  emitSettlementsUpdatedEvent("payment-annulled", normalizedSettlement.settlementId);

  return createSettlementResult(true, normalizeSettlementRecord(settlement));
}

function updateSettlementSettings(settings = {}, currentUser = {}) {
  if (!canConfigureSettlementPercentages(currentUser)) {
    return createSettlementResult(false, null, "No tienes permiso para configurar porcentajes.");
  }

  const internalDriverPercentage = Number(settings.internalDriverPercentage);
  const collaboratorGlobalElaraPercentage = Number(settings.collaboratorGlobalElaraPercentage);

  if (!isValidSettlementPercentage(internalDriverPercentage) || !isValidSettlementPercentage(collaboratorGlobalElaraPercentage)) {
    return createSettlementResult(false, null, "Los porcentajes deben estar entre 0 y 100.");
  }

  settlementsData.settlementSettings = {
    ...(settlementsData.settlementSettings || {}),
    currency: "EUR",
    internalDriverPercentage: roundSettlementMoney(internalDriverPercentage),
    collaboratorGlobalElaraPercentage: roundSettlementMoney(collaboratorGlobalElaraPercentage),
    internalDriverFrequency: "Mensual",
    collaboratorFrequency: "Semanal",
    updatedAt: new Date().toISOString(),
    updatedByUserId: getSettlementSessionUser(currentUser)?.id || "",
  };

  addSettlementActivity("SETTLEMENT_SETTINGS_UPDATED", "Configuracion de liquidaciones actualizada", "Se actualizaron los porcentajes globales de liquidaciones.", settlementsData.settlementSettings, currentUser);
  emitSettlementsUpdatedEvent("settings-updated", "");

  return createSettlementResult(true, getSettlementSettings());
}

function updateCollaboratorSettlementConfig(collaboratorId, config = {}, currentUser = {}) {
  if (!canConfigureSettlementPercentages(currentUser)) {
    return createSettlementResult(false, null, "No tienes permiso para configurar porcentajes.");
  }

  const collaborator = getSettlementCollaboratorById(collaboratorId);

  if (!collaborator || collaborator.driverType !== SETTLEMENT_COLLABORATOR_DRIVER_TYPE) {
    return createSettlementResult(false, null, "No se encontro el colaborador indicado.");
  }

  const percentageMode = config.percentageMode === "custom" ? "custom" : "global";
  const customElaraPercentage = percentageMode === "custom" ? Number(config.customElaraPercentage) : null;

  if (percentageMode === "custom" && !isValidSettlementPercentage(customElaraPercentage)) {
    return createSettlementResult(false, null, "El porcentaje personalizado debe estar entre 0 y 100.");
  }

  collaborator.settlementConfig = {
    percentageMode,
    customElaraPercentage: percentageMode === "custom" ? roundSettlementMoney(customElaraPercentage) : null,
    updatedAt: new Date().toISOString(),
    updatedByUserId: getSettlementSessionUser(currentUser)?.id || "",
  };

  addSettlementActivity("SETTLEMENT_COLLABORATOR_CONFIG_UPDATED", "Porcentaje individual actualizado", `Se actualizo la configuracion de ${collaborator.name || collaborator.id}.`, collaborator, currentUser);
  emitSettlementsUpdatedEvent("collaborator-config-updated", collaborator.id);

  return createSettlementResult(true, collaborator.settlementConfig);
}

function canCreateSettlement(subject = {}) {
  return canSettlementPerformAction(subject, "settlements:create");
}

function canReviewSettlement(subject = {}) {
  return canSettlementPerformAction(subject, "settlements:review");
}

function canApproveSettlement(subject = {}) {
  return canSettlementPerformAction(subject, "settlements:approve");
}

function canCancelSettlement(subject = {}, settlement = {}) {
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  return canSettlementPerformAction(subject, "settlements:cancel") && normalizedSettlement.status !== "Pagada" && normalizedSettlement.payment.status !== "Pagado";
}

function canPaySettlement(subject = {}, settlement = {}) {
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  return (
    canSettlementPerformAction(subject, "settlements:pay") &&
    normalizedSettlement.status === "Aprobada" &&
    normalizedSettlement.payment.status !== "Pagado" &&
    normalizedSettlement.totals.driverAmount > 0
  );
}

function canAnnulSettlementPayment(subject = {}, settlement = {}) {
  const normalizedSettlement = normalizeSettlementRecord(settlement);

  return (
    canSettlementPerformAction(subject, "settlements:annulPayment") &&
    normalizedSettlement.status === "Pagada" &&
    normalizedSettlement.payment.status === "Pagado" &&
    Boolean(normalizedSettlement.payment.cashMovementId) &&
    !normalizedSettlement.payment.annulledAt &&
    !normalizedSettlement.payment.reversalCashMovementId
  );
}

function canConfigureSettlementPercentages(subject = {}) {
  return canSettlementPerformAction(subject, "settlements:configureGlobalPercentage") && canSettlementPerformAction(subject, "settlements:configureCollaboratorPercentage");
}

function calculateSettlementSplitAmounts(driverType, margin, percentage) {
  if (!isValidSettlementPercentage(percentage)) {
    return {
      elaraAmount: 0,
      driverAmount: 0,
    };
  }

  if (driverType === SETTLEMENT_INTERNAL_DRIVER_TYPE) {
    const driverAmount = roundSettlementMoney(margin * (percentage / 100));

    return {
      elaraAmount: roundSettlementMoney(margin - driverAmount),
      driverAmount,
    };
  }

  const elaraAmount = roundSettlementMoney(margin * (percentage / 100));

  return {
    elaraAmount,
    driverAmount: roundSettlementMoney(margin - elaraAmount),
  };
}

function getSettlementAppliedPercentageData(collaborator, driverType) {
  const settings = getSettlementSettings();

  if (driverType === SETTLEMENT_INTERNAL_DRIVER_TYPE) {
    return {
      mode: "internal",
      appliedPercentage: settings.internalDriverPercentage,
    };
  }

  const config = getNormalizedCollaboratorSettlementConfig(collaborator);

  if (config.percentageMode === "custom") {
    return {
      mode: "custom",
      appliedPercentage: isValidSettlementPercentage(config.customElaraPercentage) ? config.customElaraPercentage : null,
    };
  }

  return {
    mode: "global",
    appliedPercentage: settings.collaboratorGlobalElaraPercentage,
  };
}

function getSettlementPercentageSnapshot(collaborator, driverType) {
  const settings = getSettlementSettings();
  const percentage = getSettlementAppliedPercentageData(collaborator, driverType);

  return {
    mode: percentage.mode,
    internalDriverPercentage: settings.internalDriverPercentage,
    collaboratorGlobalElaraPercentage: settings.collaboratorGlobalElaraPercentage,
    customElaraPercentage: percentage.mode === "custom" ? percentage.appliedPercentage : null,
    appliedPercentage: isValidSettlementPercentage(percentage.appliedPercentage) ? roundSettlementMoney(percentage.appliedPercentage) : 0,
  };
}

function getFilteredSettlements(filters = {}) {
  const statuses = normalizeSettlementFilterValues(filters.statuses || filters.status);
  const driverTypes = normalizeSettlementFilterValues(filters.driverTypes || filters.driverType || filters.types || filters.type);
  const driverId = String(filters.driverId || "").trim();
  const from = normalizeSettlementDate(filters.from || filters.periodFrom);
  const to = normalizeSettlementDate(filters.to || filters.periodTo);
  const collection = String(filters.collection || "").trim();
  const query = normalizeSettlementText(filters.query || filters.search);

  return getSettlementsCollection()
    .map(normalizeSettlementRecord)
    .filter((settlement) => {
      const collaborator = getSettlementCollaboratorById(settlement.driverId);
      const haystack = normalizeSettlementText([settlement.settlementId, settlement.driverId, collaborator?.name, settlement.driverNameSnapshot].join(" "));

      if (statuses.length && !statuses.includes(settlement.status)) return false;
      if (driverTypes.length && !driverTypes.includes(settlement.driverType)) return false;
      if (driverId && settlement.driverId !== driverId) return false;
      if (from && settlement.periodEnd < from) return false;
      if (to && settlement.periodStart > to) return false;
      if (collection === "pending" && !settlement.totals.pendingCollectionAmount) return false;
      if (collection === "settled" && settlement.totals.pendingCollectionAmount) return false;
      if (query && !haystack.includes(query)) return false;

      return true;
    });
}

function validateSettlementDraftInput(data = {}) {
  const driverId = String(data.driverId || "").trim();
  const periodStart = normalizeSettlementDate(data.periodStart);
  const periodEnd = normalizeSettlementDate(data.periodEnd);

  if (!driverId || !getSettlementCollaboratorById(driverId)) {
    return createSettlementResult(false, null, "Selecciona una persona valida.");
  }

  if (!periodStart || !periodEnd) {
    return createSettlementResult(false, null, "Indica un periodo valido.");
  }

  if (periodStart > periodEnd) {
    return createSettlementResult(false, null, "La fecha desde no puede ser posterior a la fecha hasta.");
  }

  return createSettlementResult(true, { driverId, periodStart, periodEnd });
}

function getSettlementBlockingIssues(settlement = {}) {
  const normalizedSettlement = normalizeSettlementRecord(settlement);
  const issues = [];
  const seenServices = new Set();

  if (!getSettlementCollaboratorById(normalizedSettlement.driverId)) {
    issues.push("Referencia de conductor o colaborador inexistente.");
  }

  if (!normalizedSettlement.serviceItems.length) {
    issues.push("No hay servicios calculables incluidos.");
  }

  if (!isValidSettlementPercentage(normalizedSettlement.percentageSnapshot.appliedPercentage)) {
    issues.push("Porcentaje aplicado invalido.");
  }

  normalizedSettlement.reviewFlags
    .filter((flag) => !normalizeSettlementText(flag).includes("pendiente de cobro"))
    .forEach((flag) => issues.push(flag));

  normalizedSettlement.serviceItems.forEach((item) => {
    const service = getSettlementServiceById(item.serviceId);

    if (seenServices.has(item.serviceId)) {
      issues.push(`${item.serviceId}: servicio duplicado en la liquidacion.`);
    }
    seenServices.add(item.serviceId);

    if (!service) {
      issues.push(`${item.serviceId}: referencia inexistente.`);
    }

    if (!item.basePrice || item.basePrice <= 0) {
      issues.push(`${item.serviceId}: precio financiero sin definir.`);
    }

    if (item.liquidableMargin < 0) {
      issues.push(`${item.serviceId}: margen liquidable negativo.`);
    }

    if (item.calculationStatus === "Para revisión") {
      issues.push(`${item.serviceId}: calculo en revision.`);
    }

    if (isSettlementServiceAlreadyIncludedOutsideSettlement(item.serviceId, normalizedSettlement.settlementId)) {
      issues.push(`${item.serviceId}: incluido en otra liquidacion activa, aprobada o pagada.`);
    }
  });

  return Array.from(new Set(issues));
}

function getSettlementGenerationReviewFlags(driverId, periodStart, periodEnd, options = {}) {
  const normalizedDriverId = String(driverId || "").trim();
  const start = normalizeSettlementDate(periodStart);
  const end = normalizeSettlementDate(periodEnd);
  const ignoredSettlementId = String(options.ignoreSettlementId || "").trim();
  const flags = [];

  if (!normalizedDriverId || !start || !end) {
    return flags;
  }

  getSettlementServicesCollection()
    .filter((service) => getSettlementServiceDriverId(service) === normalizedDriverId)
    .filter((service) => {
      const date = normalizeSettlementDate(service.date);

      return date >= start && date <= end;
    })
    .filter(isFinalizedSettlementService)
    .forEach((service) => {
      const serviceId = service.serviceId || service.id || "Servicio sin ID";
      const calculation = calculateServiceSettlementItem(serviceId);

      const isIncluded = ignoredSettlementId
        ? isSettlementServiceAlreadyIncludedOutsideSettlement(serviceId, ignoredSettlementId)
        : isSettlementServiceAlreadyIncluded(serviceId);

      if (isIncluded) {
        flags.push(`${serviceId}: incluido en otra liquidacion activa, aprobada o pagada.`);
      }

      if (calculation.errors.length) {
        calculation.errors.forEach((error) => flags.push(`${serviceId}: ${error}`));
      }

      if (calculation.warnings.length) {
        calculation.warnings.forEach((warning) => flags.push(`${serviceId}: ${warning}`));
      }
    });

  return Array.from(new Set(flags));
}

function isSettlementServiceAlreadyIncludedOutsideSettlement(serviceId, settlementId) {
  const normalizedServiceId = String(serviceId || "").trim();
  const normalizedSettlementId = String(settlementId || "").trim();

  return getSettlementsCollection().some((settlement) => {
    const normalizedSettlement = normalizeSettlementRecord(settlement);

    if (normalizedSettlement.settlementId === normalizedSettlementId || !SETTLEMENT_ACTIVE_STATUSES.includes(normalizedSettlement.status)) {
      return false;
    }

    return normalizedSettlement.serviceItems.some((item) => item.serviceId === normalizedServiceId);
  });
}

function createSettlementResult(ok, data = null, error = "", warnings = []) {
  return {
    ok: Boolean(ok),
    data,
    error: error || "",
    warnings: Array.isArray(warnings) ? warnings : [],
  };
}

function canSettlementPerformAction(subject = {}, action) {
  if (!window.ElaraPermissions || typeof window.ElaraPermissions.canPerformAction !== "function") {
    return false;
  }

  return window.ElaraPermissions.canPerformAction(getSettlementContextFromSubject(subject), action);
}

function getSettlementContextFromSubject(subject = {}) {
  if (typeof subject === "string") {
    return subject;
  }

  if (window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function") {
    return window.ElaraAuth.getActiveContext();
  }

  return subject?.activeContext || subject?.role || "";
}

function getSettlementSessionUser(currentUser = {}) {
  return currentUser?.user || currentUser || {};
}

function getSettlementUserSnapshot(currentUser = {}) {
  const user = getSettlementSessionUser(currentUser);
  const role = getSettlementContextFromSubject(currentUser) || user?.activeContext || user?.role || "";

  return {
    id: String(user?.id || "").trim(),
    name: String(user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Administracion").trim(),
    role: String(role || "").trim(),
  };
}

function normalizeSettlementPaymentDateTime(value) {
  const text = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    const now = new Date();
    const localDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

    return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString();
  }

  const date = text ? new Date(text) : new Date();

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function addSettlementActivity(eventType, title, description, entity, currentUser = {}) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function") {
    return;
  }

  const user = getSettlementSessionUser(currentUser);

  window.ElaraActivityLog.addEvent({
    eventType,
    actorType: "Administracion",
    actorId: user?.id || "",
    actorName: user?.name || "Administracion",
    entityType: "Liquidacion",
    entityId: entity?.settlementId || "",
    title,
    description,
    metadata: {
      status: entity?.status,
      driverId: entity?.driverId,
      driverAmount: entity?.totals?.driverAmount,
    },
  });
}

function emitSettlementsUpdatedEvent(reason, settlementId) {
  window.dispatchEvent(
    new CustomEvent("elara:settlements-updated", {
      detail: {
        reason,
        settlementId,
      },
    }),
  );
}

function normalizeSettlementFilterValues(values) {
  return (Array.isArray(values) ? values : values ? [values] : []).map((value) => String(value || "").trim()).filter(Boolean);
}

function getSettlementReviewFlags(serviceItems) {
  return serviceItems
    .filter((item) => item.calculationStatus === "Para revisión")
    .flatMap((item) => item.reviewReasons.map((reason) => `${item.serviceId}: ${reason}`));
}

function getSettlementServiceFinancialSummary(service) {
  const financial = service?.financial || {};
  const legacyPrice = parseSettlementMoney(service?.price);
  const basePrice = getNullableSettlementMoney(financial.totalPrice ?? financial.basePrice ?? legacyPrice);
  const paidAmount = roundSettlementMoney(financial.paidAmount);
  const pendingAmount = basePrice === null ? 0 : roundSettlementMoney(financial.pendingAmount ?? Math.max(basePrice - paidAmount, 0));
  const paymentStatus = String(financial.paymentStatus || (basePrice === null ? "Sin definir" : paidAmount >= basePrice ? "Pagado" : paidAmount > 0 ? "Parcial" : "Pendiente")).trim();

  return {
    totalPrice: basePrice,
    discountsAmount: roundSettlementMoney(financial.discountsAmount || financial.discountsApplied || 0),
    nonComputableTaxesAmount: roundSettlementMoney(financial.nonComputableTaxesAmount || 0),
    paidAmount,
    pendingAmount,
    paymentStatus,
    hasPendingCollection: basePrice !== null && (pendingAmount > 0 || paymentStatus === "Pendiente" || paymentStatus === "Parcial"),
  };
}

function normalizeSettlementRecord(settlement = {}) {
  const totals = normalizeSettlementTotals(settlement.totals);

  return {
    settlementId: String(settlement.settlementId || settlement.id || "").trim(),
    driverId: String(settlement.driverId || "").trim(),
    driverType: normalizeSettlementDriverType(settlement.driverType),
    periodType: settlement.periodType === "Mensual" ? "Mensual" : "Semanal",
    periodStart: normalizeSettlementDate(settlement.periodStart),
    periodEnd: normalizeSettlementDate(settlement.periodEnd),
    status: SETTLEMENT_STATUSES.includes(settlement.status) ? settlement.status : "Borrador",
    currency: String(settlement.currency || getSettlementSettings().currency).trim() || "EUR",
    serviceItems: Array.isArray(settlement.serviceItems) ? settlement.serviceItems.map(normalizeSettlementItem) : [],
    totals,
    percentageSnapshot: {
      mode: String(settlement.percentageSnapshot?.mode || "").trim(),
      internalDriverPercentage: roundSettlementMoney(settlement.percentageSnapshot?.internalDriverPercentage),
      collaboratorGlobalElaraPercentage: roundSettlementMoney(settlement.percentageSnapshot?.collaboratorGlobalElaraPercentage),
      customElaraPercentage: settlement.percentageSnapshot?.customElaraPercentage === null ? null : roundSettlementMoney(settlement.percentageSnapshot?.customElaraPercentage),
      appliedPercentage: roundSettlementMoney(settlement.percentageSnapshot?.appliedPercentage),
    },
    payment: normalizeSettlementPayment(settlement.payment, totals.driverAmount),
    reviewFlags: Array.isArray(settlement.reviewFlags) ? settlement.reviewFlags.map((flag) => String(flag || "").trim()).filter(Boolean) : [],
    createdAt: String(settlement.createdAt || "").trim(),
    createdByUserId: String(settlement.createdByUserId || "").trim(),
    createdByName: String(settlement.createdByName || "").trim(),
    submittedAt: String(settlement.submittedAt || "").trim() || null,
    submittedByUserId: String(settlement.submittedByUserId || "").trim() || null,
    submittedByName: String(settlement.submittedByName || "").trim() || null,
    recalculatedAt: String(settlement.recalculatedAt || "").trim() || null,
    recalculatedByUserId: String(settlement.recalculatedByUserId || "").trim() || null,
    recalculatedByName: String(settlement.recalculatedByName || "").trim() || null,
    approvedAt: String(settlement.approvedAt || "").trim() || null,
    approvedByUserId: String(settlement.approvedByUserId || "").trim() || null,
    approvedByName: String(settlement.approvedByName || "").trim() || null,
    paidAt: String(settlement.paidAt || "").trim() || null,
    paidByUserId: String(settlement.paidByUserId || "").trim() || null,
    driverNameSnapshot: String(settlement.driverNameSnapshot || "").trim(),
    observations: String(settlement.observations || "").trim(),
    approvalNotes: String(settlement.approvalNotes || "").trim(),
    snapshotLocked: Boolean(settlement.snapshotLocked),
    returnHistory: Array.isArray(settlement.returnHistory) ? settlement.returnHistory : [],
    annulment: settlement.annulment || createEmptySettlementAnnulment(),
  };
}

function normalizeSettlementItem(item = {}) {
  return {
    serviceId: String(item.serviceId || "").trim(),
    serviceDate: normalizeSettlementDate(item.serviceDate),
    driverId: String(item.driverId || "").trim(),
    driverType: normalizeSettlementDriverType(item.driverType),
    basePrice: roundSettlementMoney(item.basePrice),
    discountsAmount: roundSettlementMoney(item.discountsAmount),
    nonComputableTaxesAmount: roundSettlementMoney(item.nonComputableTaxesAmount),
    netIncome: roundSettlementMoney(item.netIncome),
    approvedComputableExpenses: roundSettlementMoney(item.approvedComputableExpenses),
    liquidableMargin: roundSettlementMoney(item.liquidableMargin),
    appliedPercentage: roundSettlementMoney(item.appliedPercentage),
    elaraAmount: roundSettlementMoney(item.elaraAmount),
    driverAmount: roundSettlementMoney(item.driverAmount),
    paymentStatusSnapshot: String(item.paymentStatusSnapshot || "").trim(),
    hasPendingCollection: Boolean(item.hasPendingCollection),
    pendingCollectionAmountSnapshot: roundSettlementMoney(item.pendingCollectionAmountSnapshot),
    calculationStatus: item.calculationStatus === "Para revisión" ? "Para revisión" : "Calculable",
    reviewReasons: Array.isArray(item.reviewReasons) ? item.reviewReasons.map((reason) => String(reason || "").trim()).filter(Boolean) : [],
  };
}

function normalizeSettlementTotals(totals = {}) {
  return {
    grossIncome: roundSettlementMoney(totals.grossIncome),
    discounts: roundSettlementMoney(totals.discounts),
    nonComputableTaxes: roundSettlementMoney(totals.nonComputableTaxes),
    netIncome: roundSettlementMoney(totals.netIncome),
    computableExpenses: roundSettlementMoney(totals.computableExpenses),
    liquidableMargin: roundSettlementMoney(totals.liquidableMargin),
    elaraAmount: roundSettlementMoney(totals.elaraAmount),
    driverAmount: roundSettlementMoney(totals.driverAmount),
    servicesCount: Number(totals.servicesCount) || 0,
    pendingCollectionAmount: roundSettlementMoney(totals.pendingCollectionAmount),
    reviewItemsCount: Number(totals.reviewItemsCount) || 0,
  };
}

function normalizeSettlementPayment(payment = {}, fallbackAmount = 0) {
  const status = ["Pendiente", "Pagado", "Anulado"].includes(payment.status) ? payment.status : "Pendiente";
  const amount = payment.amount === null || payment.amount === undefined || payment.amount === "" ? fallbackAmount : payment.amount;
  const paidByUserName = String(payment.paidByUserName || payment.paidByName || "").trim() || null;

  return {
    status,
    amount: roundSettlementMoney(amount),
    method: SETTLEMENT_PAYMENT_METHODS.includes(payment.method) ? payment.method : null,
    paidAt: String(payment.paidAt || "").trim() || null,
    paidByUserId: String(payment.paidByUserId || "").trim() || null,
    paidByUserName,
    paidByName: paidByUserName,
    paidByUserRole: String(payment.paidByUserRole || "").trim() || null,
    cashMovementId: String(payment.cashMovementId || "").trim() || null,
    observations: String(payment.observations || "").trim(),
    annulledAt: String(payment.annulledAt || "").trim() || null,
    annulledByUserId: String(payment.annulledByUserId || "").trim() || null,
    annulledByUserName: String(payment.annulledByUserName || "").trim() || null,
    annulledByUserRole: String(payment.annulledByUserRole || "").trim() || null,
    annulmentReason: String(payment.annulmentReason || "").trim() || null,
    reversalCashMovementId: String(payment.reversalCashMovementId || "").trim() || null,
  };
}

function validateSettlementItemSnapshot(settlementLabel, item, warnings) {
  const requiredFields = [
    "serviceId",
    "serviceDate",
    "driverId",
    "driverType",
    "basePrice",
    "discountsAmount",
    "nonComputableTaxesAmount",
    "netIncome",
    "approvedComputableExpenses",
    "liquidableMargin",
    "appliedPercentage",
    "elaraAmount",
    "driverAmount",
    "paymentStatusSnapshot",
    "hasPendingCollection",
    "pendingCollectionAmountSnapshot",
    "calculationStatus",
    "reviewReasons",
  ];

  requiredFields.forEach((field) => {
    if (!(field in item)) {
      warnings.push(`${settlementLabel}: snapshot incompleto en ${item.serviceId || "servicio sin ID"} (${field}).`);
    }
  });

  validateSettlementPercentage(`${settlementLabel}: porcentaje item ${item.serviceId}`, item.appliedPercentage, warnings);
}

function validateSettlementTotals(settlement, warnings) {
  const calculatedTotals = calculateSettlementTotals(settlement.serviceItems);
  const comparedFields = Object.keys(calculatedTotals);

  comparedFields.forEach((field) => {
    if (roundSettlementMoney(calculatedTotals[field]) !== roundSettlementMoney(settlement.totals[field])) {
      warnings.push(`${settlement.settlementId}: total inconsistente en ${field}.`);
    }
  });
}

function validateCollaboratorSettlementConfigs(warnings) {
  getSettlementCollaboratorsCollection()
    .filter((collaborator) => collaborator.driverType === SETTLEMENT_COLLABORATOR_DRIVER_TYPE)
    .forEach((collaborator) => {
      const config = getNormalizedCollaboratorSettlementConfig(collaborator);

      if (!["global", "custom"].includes(config.percentageMode)) {
        warnings.push(`${collaborator.id}: modo de liquidación inválido.`);
      }

      if (config.percentageMode === "custom" && !isValidSettlementPercentage(config.customElaraPercentage)) {
        warnings.push(`${collaborator.id}: porcentaje personalizado fuera de 0-100.`);
      }
    });
}

function validateSettlementPercentage(label, percentage, warnings) {
  if (!isValidSettlementPercentage(percentage)) {
    warnings.push(`${label}: porcentaje fuera de 0-100.`);
  }
}

function getNormalizedCollaboratorSettlementConfig(collaborator = {}) {
  const config = collaborator.settlementConfig || {};
  const percentageMode = config.percentageMode === "custom" ? "custom" : "global";

  return {
    percentageMode,
    customElaraPercentage: config.customElaraPercentage === null || config.customElaraPercentage === undefined ? null : Number(config.customElaraPercentage),
  };
}

function isValidSettlementPercentage(value) {
  const percentage = Number(value);

  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
}

function normalizeSettlementPercentage(value, fallback) {
  return isValidSettlementPercentage(value) ? roundSettlementMoney(value) : fallback;
}

function getSettlementsCollection() {
  settlementsData.settlements = Array.isArray(settlementsData.settlements) ? settlementsData.settlements : [];

  return settlementsData.settlements;
}

function getSettlementServicesCollection() {
  return Array.isArray(window.ElaraServicesMock?.services) ? window.ElaraServicesMock.services : [];
}

function getSettlementCollaboratorsCollection() {
  return Array.isArray(window.ElaraCollaboratorsMock?.collaborators) ? window.ElaraCollaboratorsMock.collaborators : [];
}

function getSettlementExpensesCollection() {
  return Array.isArray(window.ElaraExpensesMock?.expenses) ? window.ElaraExpensesMock.expenses : [];
}

function getSettlementCashMovements() {
  return Array.isArray(window.ElaraFinanceMock?.cashMovements) ? window.ElaraFinanceMock.cashMovements : [];
}

function isSettlementPaymentCashMovement(movement = {}) {
  return movement?.sourceType === "settlement" || String(movement?.category || "").startsWith("Pago de liquidación");
}

function isSettlementPaymentReversalCashMovement(movement = {}) {
  return movement?.sourceType === "settlement-payment-reversal" || String(movement?.category || "").startsWith("Reversión de pago de liquidación");
}

function getCashMovementSettlementId(movement = {}) {
  const sourceId = String(movement.sourceId || movement.settlementId || "").trim();

  if (sourceId) {
    return sourceId;
  }

  const match = String(movement.category || "").match(/LIQ-\d+/);

  return match ? match[0] : "";
}

function isActiveSettlementPayment(payment = {}) {
  const normalizedPayment = normalizeSettlementPayment(payment);

  return normalizedPayment.status === "Pagado" && Boolean(normalizedPayment.cashMovementId) && !normalizedPayment.annulledAt && !normalizedPayment.reversalCashMovementId;
}

function cloneSettlementRecord(settlement = {}) {
  return JSON.parse(JSON.stringify(normalizeSettlementRecord(settlement)));
}

function getSettlementTimestamp(value) {
  const date = new Date(value || "");

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getSettlementServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();

  return getSettlementServicesCollection().find((service) => service.serviceId === normalizedServiceId || service.id === normalizedServiceId) || null;
}

function getSettlementCollaboratorById(collaboratorId) {
  const normalizedCollaboratorId = String(collaboratorId || "").trim();

  return getSettlementCollaboratorsCollection().find((collaborator) => collaborator.id === normalizedCollaboratorId) || null;
}

function getSettlementServiceDriverId(service) {
  return String(service?.collaboratorId || service?.driverId || service?.assignedCollaboratorId || "").trim();
}

function normalizeSettlementDriverType(driverType) {
  return driverType === SETTLEMENT_INTERNAL_DRIVER_TYPE ? SETTLEMENT_INTERNAL_DRIVER_TYPE : SETTLEMENT_COLLABORATOR_DRIVER_TYPE;
}

function isFinalizedSettlementService(service) {
  return normalizeSettlementText(service?.status) === "finalizado";
}

function isSettlementServiceAlreadyIncluded(serviceId) {
  const normalizedServiceId = String(serviceId || "").trim();

  return getSettlementsCollection().some((settlement) => {
    const normalizedSettlement = normalizeSettlementRecord(settlement);

    return SETTLEMENT_ACTIVE_STATUSES.includes(normalizedSettlement.status) && normalizedSettlement.serviceItems.some((item) => item.serviceId === normalizedServiceId);
  });
}

function normalizeSettlementExpense(expense = {}) {
  if (window.ElaraExpensesCore && typeof window.ElaraExpensesCore.normalizeExpenseRecord === "function") {
    return {
      ...expense,
      ...window.ElaraExpensesCore.normalizeExpenseRecord(expense),
      settlementComputable: expense.settlementComputable,
      computableForSettlement: expense.computableForSettlement,
      settlement: expense.settlement,
      liquidation: expense.liquidation,
    };
  }

  return expense;
}

function isApprovedSettlementExpense(expense) {
  return ["Aprobada", "Aprobada parcialmente", "Pendiente de pago", "Pendiente de reembolso", "Pagada", "Reembolsada"].includes(expense.status);
}

function isExpenseMarkedComputableForSettlement(expense) {
  return Boolean(expense.settlementComputable || expense.computableForSettlement || expense.settlement?.computable || expense.liquidation?.computable);
}

function isExcludedExternalEnergyExpense(expense, collaborator) {
  return Boolean(
    collaborator?.driverType === SETTLEMENT_COLLABORATOR_DRIVER_TYPE &&
      SETTLEMENT_EXTERNAL_ENERGY_CATEGORIES.includes(expense.category) &&
      (expense.claimantType === SETTLEMENT_COLLABORATOR_DRIVER_TYPE || expense.paidBy === SETTLEMENT_COLLABORATOR_DRIVER_TYPE) &&
      !expense.settlement?.includeExternalEnergy,
  );
}

function getSettlementExpenseApprovedAmount(expense) {
  const approvedAmount = expense.amountApproved === null || expense.amountApproved === undefined ? expense.amountRequested : expense.amountApproved;

  return roundSettlementMoney(approvedAmount);
}

function getNullableSettlementMoney(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? roundSettlementMoney(amount) : null;
}

function parseSettlementMoney(value) {
  if (typeof value === "number") {
    return value;
  }

  const normalizedValue = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const amount = Number(normalizedValue);

  return Number.isFinite(amount) ? amount : null;
}

function getSettlementServicePaidAmount(serviceId) {
  const service = getSettlementServiceById(serviceId);
  const financial = service?.financial || {};

  return roundSettlementMoney(financial.paidAmount);
}

function getNextSettlementId() {
  const nextNumber =
    getSettlementsCollection().reduce((maxNumber, settlement) => {
      const match = String(settlement.settlementId || settlement.id || "").match(/^LIQ-(\d+)$/);
      const currentNumber = match ? Number(match[1]) : 0;

      return Math.max(maxNumber, currentNumber);
    }, 0) + 1;

  return `LIQ-${String(nextNumber).padStart(4, "0")}`;
}

function createEmptySettlementAnnulment() {
  return {
    annulledAt: null,
    annulledByUserId: null,
    annulledByName: null,
    reason: null,
  };
}

function createEmptySettlementPayment(amount = 0) {
  return {
    status: "Pendiente",
    amount: roundSettlementMoney(amount),
    method: null,
    paidAt: null,
    paidByUserId: null,
    paidByUserName: null,
    paidByName: null,
    paidByUserRole: null,
    cashMovementId: null,
    observations: "",
    annulledAt: null,
    annulledByUserId: null,
    annulledByUserName: null,
    annulledByUserRole: null,
    annulmentReason: null,
    reversalCashMovementId: null,
  };
}

function normalizeSettlementDate(value) {
  const text = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return "";
  }

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseSettlementDate(value) {
  const normalizedDate = normalizeSettlementDate(value);

  if (!normalizedDate) {
    return null;
  }

  const [year, month, day] = normalizedDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSettlementDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeSettlementText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

window.ElaraSettlementsCore = {
  approveSettlement,
  buildSettlementDraft,
  calculateServiceSettlementItem,
  calculateSettlementTotals,
  canApproveSettlement,
  canAnnulSettlementPayment,
  canCancelSettlement,
  canConfigureSettlementPercentages,
  canCreateSettlement,
  canPaySettlement,
  canReviewSettlement,
  canViewOwnSettlement,
  cancelSettlement,
  checkSettlementIntegrity,
  checkSettlementPaymentIntegrity,
  generateSettlementDraft,
  getApprovedComputableExpensesForService,
  getCollaboratorAppliedElaraPercentage,
  getEligibleServicesForSettlement,
  getSettlementById,
  getDriverSettlementById,
  getDriverSettlementSummary,
  getSettlementsForDriver,
  getSettlementPayment,
  getSettlementPeriodForDate,
  getSettlementSettings,
  getSettlementSummary,
  registerSettlementPayment,
  recalculateSettlementDraft,
  reconcileSettlementPaymentStatus,
  annulSettlementPayment,
  roundSettlementMoney,
  returnSettlementToReview,
  submitSettlementForApproval,
  updateCollaboratorSettlementConfig,
  updateSettlementSettings,
};
