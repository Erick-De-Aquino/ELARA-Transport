/*
  Proyecto Atlas / ELARA Transport
  Archivo: settlements.js
  Responsabilidad: lectura administrativa real de Liquidaciones y UI legacy fuera del modo real.
*/

"use strict";

const SETTLEMENTS_PAGE_SIZE = 20;
const SETTLEMENTS_STATUSES = ["Borrador", "Para revisión", "Pendiente de aprobación", "Aprobada", "Pagada", "Anulada"];

let isSettlementsInitialized = false;
let settlementsPage = 1;
let settlementsFilters = getDefaultSettlementsFilters();
let selectedSettlementId = "";
let pendingSettlementAction = null;
let currentSettlementPreview = null;

function initSettlements() {
  if (isSettlementsInitialized) {
    return;
  }

  renderSettlementsStaticFilters();
  ensureSettlementsModals();
  bindSettlementsEvents();
  isSettlementsInitialized = true;
}

function showSettlements() {
  if (isRealSettlementMode()) {
    configureRealSettlementFilters();
    setSettlementsText("page-summary", "Consulta de liquidaciones en modo solo lectura.");
  }
  if (!canSettlementAction("settlements:view")) {
    showSettlementsUnavailable("No tienes acceso a Liquidaciones.");
    return;
  }

  setSettlementsText("page-eyebrow", "FINANZAS");
  setSettlementsText("page-title", "Liquidaciones");
  setSettlementsText("page-summary", isRealSettlementMode() ? "Consulta de liquidaciones en modo solo lectura." : "Calcula, revisa y aprueba los importes correspondientes a choferes y colaboradores.");
  configureSettlementsPrimaryAction();
  renderSettlementsView();
}

function renderSettlementsView() {
  if (isRealSettlementMode()) { void loadRealSettlements(); return; }
  populateSettlementDriverFilters();
  updateSettlementsFilterSummary();
  renderSettlementsSummary();
  renderSettlementsList();
}

function renderSettlementsSummary() {
  const container = getSettlementsElement("settlements-summary");

  if (!container) {
    return;
  }

  const summary = window.ElaraSettlementsCore.getSettlementSummary(getSettlementCoreFilters());
  const metrics = [
    ["Borradores", String(summary.drafts), "neutral"],
    ["Para revisión", String(summary.review), "warning"],
    ["Pendientes de aprobación", String(summary.pendingApproval), "warning"],
    ["Aprobadas", String(summary.approved), "success"],
    ["Pagadas", String(summary.paid), "success"],
    ["Importe pendiente", formatSettlementUiMoney(summary.pendingSettlementAmount), "info"],
    ["Servicios incluidos", String(summary.includedServices), "neutral"],
  ];

  container.innerHTML = metrics
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${escapeSettlementHtml(tone)}">
          <span>${escapeSettlementHtml(label)}</span>
          <strong>${escapeSettlementHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderSettlementsList() {
  const container = getSettlementsElement("settlements-list");
  const pagination = getSettlementsElement("settlements-pagination");

  if (!container || !pagination) {
    return;
  }

  const settlements = getFilteredSettlementsForView();
  const totalPages = Math.max(1, Math.ceil(settlements.length / SETTLEMENTS_PAGE_SIZE));

  if (settlementsPage > totalPages) {
    settlementsPage = totalPages;
  }

  if (!settlements.length) {
    container.innerHTML = '<p class="settlements-empty">No hay liquidaciones que coincidan con los filtros.</p>';
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  const start = (settlementsPage - 1) * SETTLEMENTS_PAGE_SIZE;
  const visibleSettlements = settlements.slice(start, start + SETTLEMENTS_PAGE_SIZE);

  container.innerHTML = visibleSettlements.map(renderSettlementRow).join("");
  renderSettlementsPagination(pagination, settlements.length, totalPages);
}

function renderSettlementRow(settlement) {
  const collaborator = getSettlementUiCollaboratorById(settlement.driverId);
  const badge = getSettlementStatusBadge(settlement.status);
  const pendingText = settlement.totals.pendingCollectionAmount
    ? `<small>Pendiente de cobro: ${escapeSettlementHtml(formatSettlementUiMoney(settlement.totals.pendingCollectionAmount))}</small>`
    : "<small>Sin cobros pendientes</small>";
  const paymentDate = settlement.payment?.status === "Pagado" && settlement.payment.paidAt ? `<small>Pagada ${escapeSettlementHtml(formatSettlementUiDate(settlement.payment.paidAt))}</small>` : "";

  return `
    <article class="settlements-row settlements-list-grid">
      <div class="settlements-row__main">
        <strong>${escapeSettlementHtml(settlement.settlementId)}</strong>
        <small>${escapeSettlementHtml(formatSettlementUiDate(settlement.periodStart))} - ${escapeSettlementHtml(formatSettlementUiDate(settlement.periodEnd))}</small>
      </div>
      <div class="settlements-row__stack">
        <strong>${escapeSettlementHtml(collaborator?.name || settlement.driverNameSnapshot || "Conductor")}</strong>
        <small>${escapeSettlementHtml(settlement.driverType)}</small>
      </div>
      <div class="settlements-row__stack">
        <strong>${escapeSettlementHtml(settlement.totals.servicesCount)} servicios</strong>
        ${pendingText}
      </div>
      <strong>${escapeSettlementHtml(formatSettlementUiMoney(settlement.totals.liquidableMargin))}</strong>
      <span>${escapeSettlementHtml(getSettlementPercentageLabel(settlement))}</span>
      <div class="settlements-row__stack">
        <strong>${escapeSettlementHtml(formatSettlementUiMoney(settlement.totals.driverAmount))}</strong>
        ${paymentDate}
      </div>
      <span class="expense-status-badge expense-status-badge--${escapeSettlementHtml(badge)}">${escapeSettlementHtml(settlement.status)}</span>
      <div class="settlements-row__actions">
        <button class="button button--compact button--muted" type="button" data-settlement-detail="${escapeSettlementHtml(settlement.settlementId)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderSettlementsPagination(container, total, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-settlements-page="prev"${settlementsPage <= 1 ? " disabled" : ""}>Anterior</button>
    <span>${escapeSettlementHtml(total)} resultados &middot; Página ${escapeSettlementHtml(settlementsPage)} de ${escapeSettlementHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-settlements-page="next"${settlementsPage >= totalPages ? " disabled" : ""}>Siguiente</button>
  `;
}

function renderSettlementsStaticFilters() {
  const statusContainer = getSettlementsElement("settlements-status-filters");

  if (statusContainer) {
    statusContainer.innerHTML = SETTLEMENTS_STATUSES.map(
      (status) => `
        <label class="filter-chip"><input type="checkbox" data-settlement-filter="status" value="${escapeSettlementHtml(status)}" /><span>${escapeSettlementHtml(status)}</span></label>
      `,
    ).join("");
  }
}

function bindSettlementsEvents() {
  getSettlementsElement("settlements-search")?.addEventListener("input", (event) => {
    settlementsFilters.query = event.target.value.trim();
    settlementsPage = 1;
    if (isRealSettlementMode()) {
      clearTimeout(realSettlementSearchTimer);
      realSettlementsState.listRequest += 1;
      realSettlementSearchTimer = setTimeout(() => void loadRealSettlements(), 250);
      return;
    }
    renderSettlementsView();
  });

  ["settlements-filter-from", "settlements-filter-to", "settlements-filter-driver"].forEach((id) => {
    getSettlementsElement(id)?.addEventListener("change", () => {
      settlementsFilters.from = getSettlementInputValue("settlements-filter-from");
      settlementsFilters.to = getSettlementInputValue("settlements-filter-to");
      settlementsFilters.driverId = getSettlementInputValue("settlements-filter-driver");
      settlementsPage = 1;
      renderSettlementsView();
    });
  });

  document.addEventListener("change", handleSettlementsDocumentChange);
  document.addEventListener("click", handleSettlementsDocumentClick);
  document.addEventListener("keydown", handleSettlementsDocumentKeydown);
  window.addEventListener("elara:settlements-updated", handleSettlementsDataUpdated);
  window.addEventListener("elara:auth-session-updated", () => {
    if (realSettlementsState.scope !== realSettlementScope()) {
      invalidateRealSettlements();
      realSettlementsState.scope = "";
      if (isRealSettlementMode() && isSettlementsViewActive()) showSettlements();
    }
  });
}

function handleSettlementsDocumentChange(event) {
  const filterInput = event.target.closest("[data-settlement-filter]");
  const collectionInput = event.target.closest("[data-settlement-collection]");

  if (filterInput) {
    syncSettlementChipFilters();
    settlementsPage = 1;
    renderSettlementsView();
    return;
  }

  if (collectionInput) {
    settlementsFilters.collection = collectionInput.value || "";
    settlementsPage = 1;
    renderSettlementsView();
    return;
  }

  if (event.target.id === "settlement-new-type") {
    populateSettlementPersonSelect();
    updateSettlementSuggestedPeriod();
    renderSettlementPreview();
    return;
  }

  if (["settlement-new-driver", "settlement-new-from", "settlement-new-to"].includes(event.target.id)) {
    if (event.target.id === "settlement-new-driver") {
      updateSettlementSuggestedPeriod();
    }

    renderSettlementPreview();
    return;
  }

  if (event.target.matches("[data-settlement-config-mode]")) {
    updateSettlementConfigRows();
  }
}

function handleSettlementsDocumentClick(event) {
  if (isRealSettlementMode()) {
    const retry = event.target.closest("[data-settlements-retry]");
    if (retry) { void loadRealSettlements(); return; }
    const retryDetail = event.target.closest("[data-settlement-detail-retry]");
    if (retryDetail) { void openRealSettlementDetail(retryDetail.dataset.settlementDetailRetry); return; }
    if (event.target.closest("#primary-action, [data-settlement-config-open], [data-settlement-action]")) {
      event.preventDefault(); return;
    }
  }
  const primaryAction = event.target.closest("#primary-action");

  if (primaryAction && isSettlementsViewActive() && canSettlementAction("settlements:create")) {
    event.preventDefault();
    openSettlementNewModal();
    return;
  }

  const configButton = event.target.closest("[data-settlement-config-open]");

  if (configButton) {
    openSettlementConfigModal();
    return;
  }

  const clearButton = event.target.closest("[data-settlements-clear]");

  if (clearButton) {
    clearSettlementsFilters();
    return;
  }

  const pageButton = event.target.closest("[data-settlements-page]");

  if (pageButton) {
    changeSettlementsPage(pageButton.dataset.settlementsPage);
    return;
  }

  const detailButton = event.target.closest("[data-settlement-detail]");

  if (detailButton) {
    openSettlementDetailModal(detailButton.dataset.settlementDetail);
    return;
  }

  const actionButton = event.target.closest("[data-settlement-action]");

  if (actionButton) {
    handleSettlementAction(actionButton.dataset.settlementAction);
    return;
  }

  const modalClose = event.target.closest("[data-settlement-modal-close]");

  if (modalClose) {
    closeSettlementModal(modalClose.closest(".modal-backdrop"));
    return;
  }

  if (event.target.classList.contains("modal-backdrop") && event.target.dataset.settlementModal === "true") {
    closeSettlementModal(event.target);
  }
}

function handleSettlementsDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const openModals = Array.from(document.querySelectorAll('[data-settlement-modal="true"]:not([hidden])'));
  const modal = openModals.at(-1);

  if (modal) {
    event.preventDefault();
    event.stopPropagation();
    closeSettlementModal(modal);
  }
}

function handleSettlementsDataUpdated() {
  if (isRealSettlementMode()) { if (isSettlementsViewActive()) void loadRealSettlements(); return; }
  if (!isSettlementsViewActive()) {
    return;
  }

  renderSettlementsView();

  if (selectedSettlementId && !getSettlementUiById(selectedSettlementId)) {
    selectedSettlementId = "";
    closeSettlementModal(getSettlementsElement("settlement-detail-modal"));
  } else if (selectedSettlementId && !getSettlementsElement("settlement-detail-modal")?.hidden) {
    renderSettlementDetail(selectedSettlementId);
  }
}

function configureSettlementsPrimaryAction() {
  if (isRealSettlementMode()) {
    const primary = getSettlementsElement("primary-action");
    if (primary) primary.hidden = true;
    document.querySelectorAll("[data-settlement-config-open]").forEach((button) => { button.hidden = true; });
    return;
  }
  const primaryAction = getSettlementsElement("primary-action");
  const configAction = document.querySelector("[data-settlement-config-open]");

  if (!primaryAction) {
    return;
  }

  primaryAction.textContent = "Generar liquidación";
  primaryAction.hidden = !canSettlementAction("settlements:create");
  primaryAction.removeAttribute("data-modal-open");
  primaryAction.removeAttribute("data-modal-target");

  if (configAction) {
    configAction.hidden = !canSettlementAction("settlements:configureGlobalPercentage");
  }
}

function showSettlementsUnavailable(message) {
  invalidateRealSettlements();
  setSettlementsText("page-eyebrow", "FINANZAS");
  setSettlementsText("page-title", "Liquidaciones");
  setSettlementsText("page-summary", message);

  const primaryAction = getSettlementsElement("primary-action");
  const summary = getSettlementsElement("settlements-summary");
  const list = getSettlementsElement("settlements-list");
  const pagination = getSettlementsElement("settlements-pagination");

  if (primaryAction) primaryAction.hidden = true;
  if (summary) summary.innerHTML = "";
  if (list) list.innerHTML = `<p class="settlements-empty">${escapeSettlementHtml(message)}</p>`;
  if (pagination) pagination.hidden = true;
}

function openSettlementNewModal() {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  if (!canSettlementAction("settlements:create")) {
    notifySettlement("No tienes permiso para generar liquidaciones.", "error");
    return;
  }

  getSettlementsElement("settlement-new-form")?.reset();
  setSettlementInputValue("settlement-new-notes", "");
  setSettlementFormError("settlement-new-error", "");
  populateSettlementPersonSelect();
  updateSettlementSuggestedPeriod();
  renderSettlementPreview();
  openSettlementModal("settlement-new-modal");
  getSettlementsElement("settlement-new-type")?.focus();
}

function submitSettlementNew(event) {
  if (getSettlementCurrentUser()?.supabaseUserId) { event.preventDefault(); return; }
  event.preventDefault();

  if (!currentSettlementPreview?.driverId) {
    setSettlementFormError("settlement-new-error", "Selecciona una persona válida.");
    notifySettlement("Selecciona una persona válida.", "warning");
    return;
  }

  const result = window.ElaraSettlementsCore.generateSettlementDraft(
    {
      driverId: currentSettlementPreview.driverId,
      periodStart: currentSettlementPreview.periodStart,
      periodEnd: currentSettlementPreview.periodEnd,
      observations: getSettlementInputValue("settlement-new-notes"),
    },
    getSettlementCurrentUser(),
  );

  if (!result.ok) {
    setSettlementFormError("settlement-new-error", result.error || "No se pudo generar la liquidación.");
    notifySettlement(result.error || "No se pudo generar la liquidación.", "error");
    return;
  }

  closeSettlementModal(getSettlementsElement("settlement-new-modal"));
  currentSettlementPreview = null;
  renderSettlementsView();
  notifySettlement("Liquidación generada correctamente.", "success");
}

function renderSettlementPreview() {
  const container = getSettlementsElement("settlement-new-preview");

  if (!container) {
    return;
  }

  const driverId = getSettlementInputValue("settlement-new-driver");
  const periodStart = getSettlementInputValue("settlement-new-from");
  const periodEnd = getSettlementInputValue("settlement-new-to");
  const collaborator = getSettlementUiCollaboratorById(driverId);

  if (!driverId || !periodStart || !periodEnd || !collaborator) {
    currentSettlementPreview = null;
    container.innerHTML = '<p class="modal__hint">Selecciona persona y periodo para calcular la vista previa.</p>';
    return;
  }

  if (periodStart > periodEnd) {
    currentSettlementPreview = null;
    container.innerHTML = '<p class="form-error">La fecha desde no puede ser posterior a la fecha hasta.</p>';
    return;
  }

  const included = getSettlementPreviewItems(driverId, periodStart, periodEnd, true);
  const excluded = getSettlementPreviewExcluded(driverId, periodStart, periodEnd);
  const totals = window.ElaraSettlementsCore.calculateSettlementTotals(included.map((entry) => entry.item));
  const period = window.ElaraSettlementsCore.getSettlementPeriodForDate(collaborator.driverType, periodStart);
  const percentage = getSettlementPreviewPercentage(collaborator, included[0]?.item);
  const pendingCount = included.filter((entry) => entry.item.hasPendingCollection).length;

  currentSettlementPreview = {
    driverId,
    periodStart,
    periodEnd,
    serviceItems: included.map((entry) => entry.item),
  };

  container.innerHTML = `
    <section class="settlement-preview-summary">
      <div><span>Persona</span><strong>${escapeSettlementHtml(collaborator.name)}</strong></div>
      <div><span>Tipo</span><strong>${escapeSettlementHtml(collaborator.driverType)}</strong></div>
      <div><span>Frecuencia</span><strong>${escapeSettlementHtml(period.periodType)}</strong></div>
      <div><span>Servicios elegibles</span><strong>${escapeSettlementHtml(included.length)}</strong></div>
      <div><span>Margen liquidable</span><strong>${escapeSettlementHtml(formatSettlementUiMoney(totals.liquidableMargin))}</strong></div>
      <div><span>Importe persona</span><strong>${escapeSettlementHtml(formatSettlementUiMoney(totals.driverAmount))}</strong></div>
      <div><span>Porcentaje</span><strong>${escapeSettlementHtml(percentage)}</strong></div>
      <div><span>Cobros pendientes</span><strong>${escapeSettlementHtml(pendingCount ? `${pendingCount} servicios` : "Sin pendientes")}</strong></div>
    </section>
    ${renderSettlementPendingNotice(totals)}
    <section class="settlement-preview-section">
      <h3 class="modal__section-title">Servicios elegibles</h3>
      ${included.length ? included.map((entry) => renderSettlementServiceItem(entry.item)).join("") : '<p class="modal__hint">No hay servicios elegibles en este periodo.</p>'}
    </section>
    <section class="settlement-preview-section">
      <h3 class="modal__section-title">Servicios excluidos o en revisión</h3>
      ${excluded.length ? excluded.map(renderSettlementExcludedItem).join("") : '<p class="modal__hint">No hay servicios excluidos detectados.</p>'}
    </section>
  `;
}

function openSettlementDetailModal(settlementId) {
  if (isRealSettlementMode()) { void openRealSettlementDetail(settlementId); return; }
  const settlement = getSettlementUiById(settlementId);

  if (!settlement) {
    notifySettlement("No se encontró la liquidación seleccionada.", "warning");
    return;
  }

  selectedSettlementId = settlement.settlementId;
  renderSettlementDetail(settlement.settlementId);
  openSettlementModal("settlement-detail-modal");
}

function renderSettlementDetail(settlementId) {
  if (isRealSettlementMode()) return;
  const settlement = getSettlementUiById(settlementId);
  const container = getSettlementsElement("settlement-detail-content");
  const actions = getSettlementsElement("settlement-detail-actions");

  if (!settlement || !container || !actions) {
    return;
  }

  const collaborator = getSettlementUiCollaboratorById(settlement.driverId);
  setSettlementsText("settlement-detail-id", settlement.settlementId);
  setSettlementsText("settlement-detail-status", settlement.status);
  container.innerHTML = `
    ${renderSettlementDetailSection("Resumen", [
      ["Persona", collaborator?.name || settlement.driverNameSnapshot || "Conductor"],
      ["Tipo", settlement.driverType],
      ["Periodo", `${formatSettlementUiDate(settlement.periodStart)} - ${formatSettlementUiDate(settlement.periodEnd)}`],
      ["Frecuencia", settlement.periodType],
      ["Creada", formatSettlementUiDateTime(settlement.createdAt)],
      ["Creador", settlement.createdByName || settlement.createdByUserId || "Sistema"],
    ])}
    ${renderSettlementTotalsSection(settlement)}
    ${renderSettlementPaymentSection(settlement)}
    ${renderSettlementPercentageSection(settlement)}
    ${renderSettlementPendingNotice(settlement.totals)}
    ${renderSettlementServicesSection(settlement)}
    ${renderSettlementIncidentsSection(settlement)}
  `;
  actions.innerHTML = renderSettlementDetailActions(settlement);
}

function renderSettlementDetailSection(title, fields) {
  return `
    <section class="settlement-detail-section">
      <h3 class="modal__section-title">${escapeSettlementHtml(title)}</h3>
      <dl class="modal__fields-grid">
        ${fields
          .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
          .map(
            ([label, value]) => `
              <div class="modal__field">
                <dt class="modal__field-label">${escapeSettlementHtml(label)}</dt>
                <dd class="modal__field-value">${escapeSettlementHtml(value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderSettlementTotalsSection(settlement) {
  const totals = settlement.totals;
  const items = [
    ["Ingreso bruto", totals.grossIncome],
    ["Descuentos", totals.discounts],
    ["Ingreso neto", totals.netIncome],
    ["Gastos computables", totals.computableExpenses],
    ["Margen liquidable", totals.liquidableMargin],
    ["Importe ELARA", totals.elaraAmount],
    ["Importe persona", totals.driverAmount],
  ];

  return `
    <section class="settlement-detail-section">
      <h3 class="modal__section-title">Totales</h3>
      <div class="settlement-detail-amount-grid">
        ${items.map(([label, value]) => `<div><span>${escapeSettlementHtml(label)}</span><strong>${escapeSettlementHtml(formatSettlementUiMoney(value))}</strong></div>`).join("")}
      </div>
    </section>
  `;
}

function renderSettlementPaymentSection(settlement) {
  const payment = settlement.payment || {};

  if (payment.status === "Pendiente" && settlement.status !== "Pagada") {
    return "";
  }

  const fields = [
    ["Estado", payment.status || "Pendiente"],
    ["Importe", formatSettlementUiMoney(payment.amount || settlement.totals.driverAmount)],
    ["Método", payment.method],
    ["Fecha de pago", formatSettlementUiDateTime(payment.paidAt)],
    ["Registrado por", payment.paidByUserName || payment.paidByName],
    ["Rol", payment.paidByUserRole],
    ["Movimiento Caja", payment.cashMovementId],
    ["Observaciones", payment.observations],
  ];

  if (payment.status === "Anulado") {
    fields.push(
      ["Anulado", formatSettlementUiDateTime(payment.annulledAt)],
      ["Anulado por", payment.annulledByUserName],
      ["Motivo", payment.annulmentReason],
      ["Reversión Caja", payment.reversalCashMovementId],
    );
  }

  return renderSettlementDetailSection("Pago", fields);
}

function renderSettlementPercentageSection(settlement) {
  const snapshot = settlement.percentageSnapshot;
  const label = getSettlementPercentageLabel(settlement);
  const mode = snapshot.mode === "custom" ? "% personalizado" : snapshot.mode === "global" ? "% global" : "configuración global";

  return renderSettlementDetailSection("Porcentaje aplicado", [
    ["Aplicado", label],
    ["Modo", mode],
    ["Snapshot", settlement.snapshotLocked ? "Histórico congelado" : "Borrador recalculable"],
  ]);
}

function renderSettlementServicesSection(settlement) {
  return `
    <section class="settlement-detail-section">
      <h3 class="modal__section-title">Servicios incluidos</h3>
      <div class="settlement-service-list">
        ${settlement.serviceItems.length ? settlement.serviceItems.map(renderSettlementServiceItem).join("") : '<p class="modal__hint">Sin servicios incluidos.</p>'}
      </div>
    </section>
  `;
}

function renderSettlementIncidentsSection(settlement) {
  const blockers = getSettlementApprovalBlockers(settlement);
  const flags = [...settlement.reviewFlags, ...blockers].filter(Boolean);

  if (!flags.length) {
    return "";
  }

  return `
    <section class="settlement-detail-section">
      <h3 class="modal__section-title">Incidencias</h3>
      <div class="settlement-incident-list">
        ${Array.from(new Set(flags))
          .map((flag) => `<article class="settlement-incident"><strong>Revisión</strong><span>${escapeSettlementHtml(flag)}</span><small>${flag.includes("pendiente de cobro") ? "Informativa" : "Bloqueante"}</small></article>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderSettlementDetailActions(settlement) {
  const leftActions = [];
  const rightActions = [];

  if (window.ElaraSettlementsCore.canCancelSettlement(getSettlementCurrentUser(), settlement)) {
    leftActions.push('<button class="button button--compact button--danger" type="button" data-settlement-action="cancel">Anular</button>');
  }

  if (settlement.status === "Borrador") {
    rightActions.push('<button class="button button--compact button--muted" type="button" data-settlement-action="recalculate">Recalcular</button>');
    rightActions.push('<button class="button button--compact" type="button" data-settlement-action="submit">Enviar a aprobación</button>');
  } else if (settlement.status === "Para revisión") {
    rightActions.push('<button class="button button--compact button--muted" type="button" data-settlement-action="recalculate">Recalcular</button>');
    rightActions.push('<button class="button button--compact" type="button" data-settlement-action="resolve">Resolver revisión</button>');
  } else if (settlement.status === "Pendiente de aprobación") {
    rightActions.push('<button class="button button--compact" type="button" data-settlement-action="approve">Aprobar</button>');
    rightActions.push('<button class="button button--compact button--muted" type="button" data-settlement-action="return">Devolver a revisión</button>');
  } else if (settlement.status === "Aprobada") {
    if (window.ElaraSettlementsCore.canPaySettlement(getSettlementCurrentUser(), settlement)) {
      rightActions.push('<button class="button button--compact" type="button" data-settlement-action="pay">Registrar pago</button>');
    }
  } else if (settlement.status === "Pagada") {
    if (window.ElaraSettlementsCore.canAnnulSettlementPayment(getSettlementCurrentUser(), settlement)) {
      leftActions.push('<button class="button button--compact button--danger" type="button" data-settlement-action="annul-payment">Anular pago</button>');
    }
  }

  rightActions.push('<button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>');

  return `
    <div class="expense-detail-actions__group expense-detail-actions__group--left">${leftActions.join("")}</div>
    <div class="expense-detail-actions__group expense-detail-actions__group--right">${rightActions.join("")}</div>
  `;
}

function handleSettlementAction(action) {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  const settlement = getSettlementUiById(selectedSettlementId);

  if (!settlement) {
    notifySettlement("No se encontró la liquidación seleccionada.", "warning");
    return;
  }

  if (action === "recalculate") {
    const result = window.ElaraSettlementsCore.recalculateSettlementDraft(settlement.settlementId, getSettlementCurrentUser());
    handleSettlementMutationResult(result, "Liquidación recalculada.");
    return;
  }

  if (action === "submit") {
    const result = window.ElaraSettlementsCore.submitSettlementForApproval(settlement.settlementId, getSettlementCurrentUser());
    handleSettlementMutationResult(result, "Liquidación enviada a aprobación.");
    return;
  }

  if (action === "resolve") {
    const result = window.ElaraSettlementsCore.submitSettlementForApproval(settlement.settlementId, getSettlementCurrentUser());
    handleSettlementMutationResult(result, "Liquidación enviada a aprobación.");
    return;
  }

  if (action === "approve") {
    openSettlementActionModal("approve", settlement);
    return;
  }

  if (action === "return") {
    openSettlementActionModal("return", settlement);
    return;
  }

  if (action === "cancel") {
    openSettlementActionModal("cancel", settlement);
    return;
  }

  if (action === "pay") {
    openSettlementPaymentModal(settlement);
    return;
  }

  if (action === "annul-payment") {
    openSettlementPaymentAnnulModal(settlement);
  }
}

function openSettlementActionModal(action, settlement) {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  pendingSettlementAction = { type: action, settlementId: settlement.settlementId };
  const isApproval = action === "approve";
  const title = { approve: "Aprobar liquidación", return: "Devolver a revisión", cancel: "Anular liquidación" }[action];
  const submitLabel = { approve: "Confirmar aprobación", return: "Devolver a revisión", cancel: "Confirmar anulación" }[action];
  const reasonLabel = action === "approve" ? "Observaciones" : "Motivo *";

  setSettlementsText("settlement-action-title", title);
  setSettlementsText("settlement-action-submit", submitLabel);
  setSettlementsText("settlement-action-reason-label", reasonLabel);
  setSettlementsText("settlement-action-summary-id", settlement.settlementId);
  setSettlementsText("settlement-action-summary-person", getSettlementUiCollaboratorById(settlement.driverId)?.name || settlement.driverNameSnapshot || "Conductor");
  setSettlementsText("settlement-action-summary-amount", formatSettlementUiMoney(settlement.totals.driverAmount));
  setSettlementInputValue("settlement-action-reason", "");
  setSettlementFormError("settlement-action-error", "");
  getSettlementsElement("settlement-action-submit")?.classList.toggle("button--danger", action === "cancel");
  getSettlementsElement("settlement-action-pending")?.toggleAttribute("hidden", !isApproval || !settlement.totals.pendingCollectionAmount);
  setSettlementsText(
    "settlement-action-pending",
    settlement.totals.pendingCollectionAmount
      ? `Incluye ${settlement.serviceItems.filter((item) => item.hasPendingCollection).length} servicios pendientes de cobro por un total de ${formatSettlementUiMoney(settlement.totals.pendingCollectionAmount)}.`
      : "",
  );
  openSettlementModal("settlement-action-modal");
  getSettlementsElement("settlement-action-reason")?.focus();
}

function submitSettlementAction(event) {
  if (getSettlementCurrentUser()?.supabaseUserId) { event.preventDefault(); return; }
  event.preventDefault();

  const settlement = getSettlementUiById(pendingSettlementAction?.settlementId);
  const action = pendingSettlementAction?.type;
  const reason = getSettlementInputValue("settlement-action-reason");
  let result = null;
  let toast = "";

  if (!settlement || !["approve", "return", "cancel"].includes(action)) {
    notifySettlement("No se encontró la liquidación seleccionada.", "warning");
    return;
  }

  if (["return", "cancel"].includes(action) && !reason) {
    setSettlementFormError("settlement-action-error", "El motivo es obligatorio.");
    notifySettlement("El motivo es obligatorio.", "warning");
    return;
  }

  if (action === "approve") {
    result = window.ElaraSettlementsCore.approveSettlement(settlement.settlementId, { notes: reason }, getSettlementCurrentUser());
    toast = "Liquidación aprobada.";
  } else if (action === "return") {
    result = window.ElaraSettlementsCore.returnSettlementToReview(settlement.settlementId, reason, getSettlementCurrentUser());
    toast = "Liquidación devuelta a revisión.";
  } else {
    result = window.ElaraSettlementsCore.cancelSettlement(settlement.settlementId, reason, getSettlementCurrentUser());
    toast = "Liquidación anulada.";
  }

  handleSettlementMutationResult(result, toast);
}

function openSettlementPaymentModal(settlement) {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  pendingSettlementAction = { type: "pay", settlementId: settlement.settlementId };
  const user = getSettlementCurrentUser() || {};
  const collaborator = getSettlementUiCollaboratorById(settlement.driverId);

  setSettlementsText("settlement-payment-summary-id", settlement.settlementId);
  setSettlementsText("settlement-payment-summary-person", collaborator?.name || settlement.driverNameSnapshot || "Conductor");
  setSettlementsText("settlement-payment-summary-amount", formatSettlementUiMoney(settlement.totals.driverAmount));
  setSettlementsText("settlement-payment-registered-by", `${user.name || "Usuario"} · ${getSettlementActiveContext() || user.role || "-"}`);
  setSettlementInputValue("settlement-payment-method", "");
  setSettlementInputValue("settlement-payment-date", getSettlementTodayValue());
  setSettlementInputValue("settlement-payment-observations", "");
  setSettlementFormError("settlement-payment-error", "");
  openSettlementModal("settlement-payment-modal");
  getSettlementsElement("settlement-payment-method")?.focus();
}

function submitSettlementPayment(event) {
  if (getSettlementCurrentUser()?.supabaseUserId) { event.preventDefault(); return; }
  event.preventDefault();

  const settlement = getSettlementUiById(pendingSettlementAction?.settlementId);
  const method = getSettlementInputValue("settlement-payment-method");
  const paidAt = getSettlementInputValue("settlement-payment-date");

  if (!settlement || pendingSettlementAction?.type !== "pay") {
    notifySettlement("No se encontró la liquidación seleccionada.", "warning");
    return;
  }

  if (!method) {
    setSettlementFormError("settlement-payment-error", "Selecciona un método de pago.");
    notifySettlement("Selecciona un método de pago.", "warning");
    return;
  }

  if (!paidAt) {
    setSettlementFormError("settlement-payment-error", "Indica la fecha de pago.");
    notifySettlement("Indica la fecha de pago.", "warning");
    return;
  }

  const result = window.ElaraSettlementsCore.registerSettlementPayment(
    settlement.settlementId,
    {
      method,
      paidAt,
      observations: getSettlementInputValue("settlement-payment-observations"),
    },
    getSettlementCurrentUser(),
  );

  handleSettlementMutationResult(result, "Pago registrado correctamente.", {
    actionModalId: "settlement-payment-modal",
  });
}

function openSettlementPaymentAnnulModal(settlement) {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  pendingSettlementAction = { type: "annul-payment", settlementId: settlement.settlementId };
  const collaborator = getSettlementUiCollaboratorById(settlement.driverId);

  setSettlementsText("settlement-payment-annul-summary-id", settlement.settlementId);
  setSettlementsText("settlement-payment-annul-summary-person", collaborator?.name || settlement.driverNameSnapshot || "Conductor");
  setSettlementsText("settlement-payment-annul-summary-amount", formatSettlementUiMoney(settlement.payment?.amount || settlement.totals.driverAmount));
  setSettlementInputValue("settlement-payment-annul-reason", "");
  setSettlementFormError("settlement-payment-annul-error", "");
  openSettlementModal("settlement-payment-annul-modal");
  getSettlementsElement("settlement-payment-annul-reason")?.focus();
}

function submitSettlementPaymentAnnul(event) {
  if (getSettlementCurrentUser()?.supabaseUserId) { event.preventDefault(); return; }
  event.preventDefault();

  const settlement = getSettlementUiById(pendingSettlementAction?.settlementId);
  const reason = getSettlementInputValue("settlement-payment-annul-reason");

  if (!settlement || pendingSettlementAction?.type !== "annul-payment") {
    notifySettlement("No se encontró la liquidación seleccionada.", "warning");
    return;
  }

  if (!reason) {
    setSettlementFormError("settlement-payment-annul-error", "El motivo de anulación es obligatorio.");
    notifySettlement("El motivo de anulación es obligatorio.", "warning");
    return;
  }

  const result = window.ElaraSettlementsCore.annulSettlementPayment(settlement.settlementId, reason, getSettlementCurrentUser());

  handleSettlementMutationResult(result, "Pago anulado correctamente.", {
    actionModalId: "settlement-payment-annul-modal",
  });
}

function handleSettlementMutationResult(result, successToast, options = {}) {
  if (!result?.ok) {
    const errorTarget = options.errorTarget || getSettlementPendingActionErrorTarget();
    setSettlementFormError(errorTarget, [result?.error, ...(result?.warnings || [])].filter(Boolean).join(" "));
    notifySettlement(result?.error || "No se pudo completar la operación.", "error");
    return;
  }

  renderSettlementsView();
  closeSettlementModal(getSettlementsElement(options.actionModalId || "settlement-action-modal"));
  closeSettlementModal(getSettlementsElement("settlement-detail-modal"));
  selectedSettlementId = "";
  pendingSettlementAction = null;
  notifySettlement(successToast, "success");
}

function getSettlementPendingActionErrorTarget() {
  if (pendingSettlementAction?.type === "pay") return "settlement-payment-error";
  if (pendingSettlementAction?.type === "annul-payment") return "settlement-payment-annul-error";
  if (pendingSettlementAction) return "settlement-action-error";
  return "settlement-new-error";
}

function openSettlementConfigModal() {
  if (getSettlementCurrentUser()?.supabaseUserId) return;
  if (!canSettlementAction("settlements:configureGlobalPercentage")) {
    notifySettlement("No tienes permiso para configurar liquidaciones.", "error");
    return;
  }

  const settings = window.ElaraSettlementsCore.getSettlementSettings();
  setSettlementInputValue("settlement-config-internal", settings.internalDriverPercentage);
  setSettlementInputValue("settlement-config-collaborator", settings.collaboratorGlobalElaraPercentage);
  setSettlementsText("settlement-config-internal-frequency", settings.internalDriverFrequency);
  setSettlementsText("settlement-config-collaborator-frequency", settings.collaboratorFrequency);
  renderSettlementConfigCollaborators();
  setSettlementFormError("settlement-config-error", "");
  openSettlementModal("settlement-config-modal");
}

function renderSettlementConfigCollaborators() {
  const container = getSettlementsElement("settlement-config-collaborators");

  if (!container) {
    return;
  }

  container.innerHTML = getSettlementCollaborators()
    .filter((collaborator) => collaborator.driverType === "Colaborador")
    .map((collaborator) => {
      const config = collaborator.settlementConfig || {};
      const mode = config.percentageMode === "custom" ? "custom" : "global";
      const effective = window.ElaraSettlementsCore.getCollaboratorAppliedElaraPercentage(collaborator.id);

      return `
        <article class="settlement-config-row" data-settlement-config-driver="${escapeSettlementHtml(collaborator.id)}">
          <div>
            <strong>${escapeSettlementHtml(collaborator.name)}</strong>
            <small>${escapeSettlementHtml(collaborator.id)}</small>
          </div>
          <label class="field">
            <span>Modo</span>
            <select data-settlement-config-mode>
              <option value="global"${mode === "global" ? " selected" : ""}>% global</option>
              <option value="custom"${mode === "custom" ? " selected" : ""}>% personalizado</option>
            </select>
          </label>
          <label class="field">
            <span>% personalizado ELARA</span>
            <input type="number" min="0" max="100" step="0.01" data-settlement-config-custom value="${escapeSettlementHtml(config.customElaraPercentage ?? "")}"${mode === "global" ? " disabled" : ""} />
          </label>
          <span>${escapeSettlementHtml(effective)} % efectivo</span>
        </article>
      `;
    })
    .join("");
}

function updateSettlementConfigRows() {
  document.querySelectorAll("[data-settlement-config-driver]").forEach((row) => {
    const mode = row.querySelector("[data-settlement-config-mode]")?.value || "global";
    const input = row.querySelector("[data-settlement-config-custom]");

    if (input) {
      input.disabled = mode === "global";
      if (mode === "global") {
        input.value = "";
      }
    }
  });
}

function submitSettlementConfig(event) {
  if (getSettlementCurrentUser()?.supabaseUserId) { event.preventDefault(); return; }
  event.preventDefault();

  const currentUser = getSettlementCurrentUser();
  const collaboratorDrafts = [];

  for (const row of document.querySelectorAll("[data-settlement-config-driver]")) {
    const driverId = row.dataset.settlementConfigDriver;
    const mode = row.querySelector("[data-settlement-config-mode]")?.value || "global";
    const custom = row.querySelector("[data-settlement-config-custom]")?.value || "";

    if (mode === "custom") {
      const percentage = Number(custom);

      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        setSettlementFormError("settlement-config-error", "Los porcentajes personalizados deben estar entre 0 y 100.");
        notifySettlement("Los porcentajes personalizados deben estar entre 0 y 100.", "warning");
        return;
      }
    }

    collaboratorDrafts.push({ driverId, mode, custom });
  }

  const settingsResult = window.ElaraSettlementsCore.updateSettlementSettings(
    {
      internalDriverPercentage: getSettlementInputValue("settlement-config-internal"),
      collaboratorGlobalElaraPercentage: getSettlementInputValue("settlement-config-collaborator"),
    },
    currentUser,
  );

  if (!settingsResult.ok) {
    setSettlementFormError("settlement-config-error", settingsResult.error);
    notifySettlement(settingsResult.error, "error");
    return;
  }

  for (const draft of collaboratorDrafts) {
    const result = window.ElaraSettlementsCore.updateCollaboratorSettlementConfig(draft.driverId, { percentageMode: draft.mode, customElaraPercentage: draft.custom }, currentUser);

    if (!result.ok) {
      setSettlementFormError("settlement-config-error", result.error);
      notifySettlement(result.error, "error");
      return;
    }
  }

  closeSettlementModal(getSettlementsElement("settlement-config-modal"));
  renderSettlementsView();
  notifySettlement("Configuración de liquidaciones actualizada.", "success");
}

function getSettlementPreviewItems(driverId, periodStart, periodEnd) {
  return getSettlementServices()
    .filter((service) => getSettlementUiServiceDriverId(service) === driverId)
    .filter((service) => {
      const date = normalizeSettlementUiDate(service.date);

      return date >= periodStart && date <= periodEnd;
    })
    .filter((service) => !isServiceAlreadyInSettlement(getSettlementServiceId(service)))
    .map((service) => window.ElaraSettlementsCore.calculateServiceSettlementItem(getSettlementServiceId(service)))
    .filter((result) => result.item && result.ok && result.item.calculationStatus === "Calculable");
}

function getSettlementPreviewExcluded(driverId, periodStart, periodEnd) {
  return getSettlementServices()
    .filter((service) => getSettlementUiServiceDriverId(service) === driverId)
    .map((service) => {
      const serviceId = getSettlementServiceId(service);
      const date = normalizeSettlementUiDate(service.date);
      const reasons = [];

      if (date < periodStart || date > periodEnd) reasons.push("Fuera del periodo");
      if (normalizeSettlementUiText(service.status) !== "finalizado") reasons.push("No Finalizado");
      if (isServiceAlreadyInSettlement(serviceId)) reasons.push("Incluido en otra liquidación");

      const calculation = window.ElaraSettlementsCore.calculateServiceSettlementItem(serviceId);

      if (calculation.errors.length) reasons.push(...calculation.errors);
      if (calculation.warnings.length) reasons.push(...calculation.warnings);

      return {
        serviceId,
        date,
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((item) => item.reasons.length);
}

function renderSettlementServiceItem(item) {
  return `
    <article class="settlement-service-item">
      <div>
        <strong>${escapeSettlementHtml(item.serviceId)}</strong>
        <small>${escapeSettlementHtml(formatSettlementUiDate(item.serviceDate))} &middot; Cobro: ${escapeSettlementHtml(item.paymentStatusSnapshot)}</small>
      </div>
      <span>${escapeSettlementHtml(formatSettlementUiMoney(item.basePrice))}</span>
      <span>Gastos ${escapeSettlementHtml(formatSettlementUiMoney(item.approvedComputableExpenses))}</span>
      <span>Margen ${escapeSettlementHtml(formatSettlementUiMoney(item.liquidableMargin))}</span>
      <span>${escapeSettlementHtml(item.appliedPercentage)} %</span>
      <strong>${escapeSettlementHtml(formatSettlementUiMoney(item.driverAmount))}</strong>
      <span class="expense-status-badge expense-status-badge--${item.calculationStatus === "Para revisión" ? "warning" : "success"}">${escapeSettlementHtml(item.calculationStatus)}</span>
    </article>
  `;
}

function renderSettlementExcludedItem(item) {
  return `
    <article class="settlement-excluded-item">
      <strong>${escapeSettlementHtml(item.serviceId)}</strong>
      <span>${escapeSettlementHtml(item.reasons.join(" · "))}</span>
    </article>
  `;
}

function renderSettlementPendingNotice(totals) {
  if (!totals.pendingCollectionAmount) {
    return "";
  }

  return `<p class="settlement-pending-note">Incluye servicios pendientes de cobro por un total de ${escapeSettlementHtml(formatSettlementUiMoney(totals.pendingCollectionAmount))}. Es información, no bloqueo.</p>`;
}

function getSettlementApprovalBlockers(settlement) {
  const blockers = [];

  if (!settlement.serviceItems.length) blockers.push("No hay servicios incluidos.");
  settlement.serviceItems.forEach((item) => {
    if (item.liquidableMargin < 0) blockers.push(`${item.serviceId}: margen liquidable negativo.`);
    if (item.calculationStatus === "Para revisión") blockers.push(`${item.serviceId}: cálculo en revisión.`);
    if (isServiceAlreadyInSettlement(item.serviceId, settlement.settlementId)) blockers.push(`${item.serviceId}: incluido en otra liquidación activa.`);
  });

  return blockers;
}

function getFilteredSettlementsForView() {
  if (!window.ElaraSettlementsCore?.getSettlementById) {
    return [];
  }

  return getSettlementsUiCollection()
    .map((settlement) => window.ElaraSettlementsCore.getSettlementById(settlement.settlementId || settlement.id))
    .filter(Boolean)
    .filter(settlementMatchesFilters)
    .sort((first, second) => second.periodEnd.localeCompare(first.periodEnd) || getSettlementUiTimestamp(second.createdAt) - getSettlementUiTimestamp(first.createdAt));
}

function settlementMatchesFilters(settlement) {
  const collaborator = getSettlementUiCollaboratorById(settlement.driverId);
  const haystack = normalizeSettlementUiText([settlement.settlementId, settlement.driverId, collaborator?.name, settlement.driverNameSnapshot].join(" "));

  if (settlementsFilters.statuses.length && !settlementsFilters.statuses.includes(settlement.status)) return false;
  if (settlementsFilters.driverTypes.length && !settlementsFilters.driverTypes.includes(settlement.driverType)) return false;
  if (settlementsFilters.driverId && settlement.driverId !== settlementsFilters.driverId) return false;
  if (settlementsFilters.from && settlement.periodEnd < settlementsFilters.from) return false;
  if (settlementsFilters.to && settlement.periodStart > settlementsFilters.to) return false;
  if (settlementsFilters.collection === "pending" && !settlement.totals.pendingCollectionAmount) return false;
  if (settlementsFilters.collection === "settled" && settlement.totals.pendingCollectionAmount) return false;
  if (settlementsFilters.query && !haystack.includes(normalizeSettlementUiText(settlementsFilters.query))) return false;

  return true;
}

function syncSettlementChipFilters() {
  settlementsFilters.statuses = getCheckedSettlementValues("status");
  settlementsFilters.driverTypes = getCheckedSettlementValues("driverType");
}

function getCheckedSettlementValues(filterName) {
  return Array.from(document.querySelectorAll(`[data-settlement-filter="${filterName}"]:checked`)).map((input) => input.value).filter(Boolean);
}

function clearSettlementsFilters() {
  settlementsFilters = getDefaultSettlementsFilters();
  settlementsPage = 1;
  setSettlementInputValue("settlements-search", "");
  setSettlementInputValue("settlements-filter-from", "");
  setSettlementInputValue("settlements-filter-to", "");
  setSettlementInputValue("settlements-filter-driver", "");
  document.querySelectorAll("[data-settlement-filter]").forEach((input) => {
    input.checked = false;
  });
  if (isRealSettlementMode()) document.querySelectorAll('[data-settlement-filter][value=""]').forEach((input) => { input.checked = true; });
  const allCollection = document.querySelector('[data-settlement-collection][value=""]');
  if (allCollection) allCollection.checked = true;
  renderSettlementsView();
}

function updateSettlementsFilterSummary() {
  const label = getSettlementsElement("settlements-filter-label");

  if (!label) {
    return;
  }

  const count = settlementsFilters.statuses.length + settlementsFilters.driverTypes.length + (settlementsFilters.from ? 1 : 0) + (settlementsFilters.to ? 1 : 0) + (settlementsFilters.driverId ? 1 : 0) + (settlementsFilters.collection ? 1 : 0) + (settlementsFilters.query ? 1 : 0);
  label.textContent = count ? `Filtro · ${count}` : "Filtro";
}

function changeSettlementsPage(direction) {
  if (isRealSettlementMode()) {
    if (realSettlementsState.loading) return;
    const pages = Math.max(1, Math.ceil(realSettlementsState.total / SETTLEMENTS_PAGE_SIZE));
    settlementsPage = direction === "prev" ? Math.max(1, settlementsPage - 1) : Math.min(pages, settlementsPage + 1);
    void loadRealSettlements(); return;
  }
  const total = getFilteredSettlementsForView().length;
  const totalPages = Math.max(1, Math.ceil(total / SETTLEMENTS_PAGE_SIZE));

  if (direction === "prev") settlementsPage = Math.max(1, settlementsPage - 1);
  if (direction === "next") settlementsPage = Math.min(totalPages, settlementsPage + 1);
  renderSettlementsList();
}

function getSettlementCoreFilters() {
  return {
    statuses: settlementsFilters.statuses,
    driverTypes: settlementsFilters.driverTypes,
    driverId: settlementsFilters.driverId,
    from: settlementsFilters.from,
    to: settlementsFilters.to,
    collection: settlementsFilters.collection,
    query: settlementsFilters.query,
  };
}

function getDefaultSettlementsFilters() {
  return {
    query: "",
    statuses: [],
    driverTypes: [],
    driverId: "",
    from: "",
    to: "",
    collection: "",
  };
}

function populateSettlementDriverFilters() {
  const select = getSettlementsElement("settlements-filter-driver");
  if (!select) return;
  const currentValue = select.value || settlementsFilters.driverId;
  setSettlementSelectOptions("settlements-filter-driver", [["", "Todas las personas"], ...getSettlementCollaborators().map((item) => [item.id, `${item.name} · ${item.driverType}`])], currentValue);
}

function populateSettlementPersonSelect() {
  const type = getSettlementInputValue("settlement-new-type") || "Chofer";
  setSettlementSelectOptions(
    "settlement-new-driver",
    [["", "Seleccionar"], ...getSettlementCollaborators().filter((item) => item.driverType === type).map((item) => [item.id, `${item.name} · ${item.driverType}`])],
    "",
  );
}

function updateSettlementSuggestedPeriod() {
  const driverId = getSettlementInputValue("settlement-new-driver");
  const type = getSettlementInputValue("settlement-new-type") || "Chofer";
  const today = getSettlementTodayValue();
  const period = window.ElaraSettlementsCore.getSettlementPeriodForDate(type, today);

  if (!driverId) {
    setSettlementInputValue("settlement-new-from", period.periodStart);
    setSettlementInputValue("settlement-new-to", period.periodEnd);
    return;
  }

  const collaborator = getSettlementUiCollaboratorById(driverId);
  const suggested = window.ElaraSettlementsCore.getSettlementPeriodForDate(collaborator?.driverType || type, today);
  setSettlementInputValue("settlement-new-from", suggested.periodStart);
  setSettlementInputValue("settlement-new-to", suggested.periodEnd);
}

function getSettlementPreviewPercentage(collaborator, firstItem) {
  if (collaborator.driverType === "Chofer") {
    return `${firstItem?.appliedPercentage ?? window.ElaraSettlementsCore.getSettlementSettings().internalDriverPercentage} % para el chofer`;
  }

  return `${window.ElaraSettlementsCore.getCollaboratorAppliedElaraPercentage(collaborator.id)} % para ELARA`;
}

function getSettlementPercentageLabel(settlement) {
  if (settlement.driverType === "Chofer") {
    return `${settlement.percentageSnapshot.appliedPercentage} % conductor`;
  }

  return `${settlement.percentageSnapshot.appliedPercentage} % ELARA`;
}

function getSettlementStatusBadge(status) {
  return {
    Borrador: "neutral",
    "Para revisión": "warning",
    "Pendiente de aprobación": "warning",
    Aprobada: "success",
    Pagada: "success",
    Anulada: "danger",
  }[status] || "neutral";
}

function getSettlementUiById(settlementId) {
  return window.ElaraSettlementsCore.getSettlementById(settlementId);
}

function getSettlementsUiCollection() {
  return window.ElaraFinanceMock?.settlements || [];
}

function getSettlementCollaborators() {
  return window.ElaraCollaboratorsMock?.collaborators || [];
}

function getSettlementServices() {
  return window.ElaraServicesMock?.services || [];
}

function getSettlementUiCollaboratorById(driverId) {
  return getSettlementCollaborators().find((item) => item.id === driverId) || null;
}

function getSettlementUiServiceDriverId(service) {
  return String(service?.collaboratorId || service?.driverId || service?.assignedCollaboratorId || "").trim();
}

function getSettlementServiceId(service) {
  return String(service?.serviceId || service?.id || "").trim();
}

function isServiceAlreadyInSettlement(serviceId, currentSettlementId = "") {
  return getSettlementsUiCollection().some((settlement) => {
    const normalized = window.ElaraSettlementsCore.getSettlementById(settlement.settlementId || settlement.id);
    if (!normalized || normalized.settlementId === currentSettlementId || normalized.status === "Anulada") return false;
    return ["Borrador", "Para revisión", "Pendiente de aprobación", "Aprobada", "Pagada"].includes(normalized.status) && normalized.serviceItems.some((item) => item.serviceId === serviceId);
  });
}

function setSettlementSelectOptions(id, options, selectedValue = "") {
  const select = getSettlementsElement(id);
  if (!select) return;
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeSettlementHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeSettlementHtml(label)}</option>`).join("");
}

function ensureSettlementsModals() {
  if (getSettlementsElement("settlement-detail-modal")) {
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="modal-backdrop" id="settlement-detail-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title" hidden>
        <section class="modal modal--settlement-detail">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIÓN</p>
              <h2 id="settlement-detail-title"><span id="settlement-detail-id">-</span></h2>
              <span class="expense-status-badge expense-status-badge--info" id="settlement-detail-status">-</span>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <div class="modal__body modal__body--summary settlement-detail-content settlement-detail-modal__body" id="settlement-detail-content"></div>
          <footer class="modal__actions expense-detail-actions settlement-detail-modal__footer" id="settlement-detail-actions"></footer>
        </section>
      </div>

      <div class="modal-backdrop" id="settlement-new-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-new-title" hidden>
        <section class="modal modal--settlement-form">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIONES</p>
              <h2 id="settlement-new-title">Generar liquidación</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <form class="settlement-form" id="settlement-new-form" novalidate>
            <div class="modal__body modal__body--summary settlement-form__body">
              <div class="settlement-form-grid">
                <label class="field"><span>Tipo de persona *</span><select id="settlement-new-type"><option value="Chofer">Chofer</option><option value="Colaborador">Colaborador</option></select></label>
                <label class="field"><span>Persona *</span><select id="settlement-new-driver" required></select></label>
                <label class="field"><span>Fecha desde *</span><input id="settlement-new-from" type="date" required /></label>
                <label class="field"><span>Fecha hasta *</span><input id="settlement-new-to" type="date" required /></label>
                <label class="field field--compact-textarea settlement-form-grid__full"><span>Observaciones</span><textarea id="settlement-new-notes" rows="2"></textarea></label>
              </div>
              <div class="settlement-preview" id="settlement-new-preview"></div>
              <p class="form-error" id="settlement-new-error" hidden></p>
            </div>
            <div class="modal__actions settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Crear borrador</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="settlement-action-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-action-title" hidden>
        <section class="modal modal--settlement-action">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIONES</p>
              <h2 id="settlement-action-title">Acción de liquidación</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <form class="settlement-form" id="settlement-action-form" novalidate>
            <div class="modal__body modal__body--summary settlement-form__body">
              <div class="expense-review-summary" aria-label="Resumen de liquidación">
                <div><span>ID</span><strong id="settlement-action-summary-id">-</strong></div>
                <div><span>Persona</span><strong id="settlement-action-summary-person">-</strong></div>
                <div><span>Importe persona</span><strong id="settlement-action-summary-amount">-</strong></div>
              </div>
              <p class="settlement-pending-note" id="settlement-action-pending" hidden></p>
              <label class="field field--compact-textarea"><span id="settlement-action-reason-label">Motivo</span><textarea id="settlement-action-reason" rows="3"></textarea></label>
              <p class="form-error" id="settlement-action-error" hidden></p>
            </div>
            <div class="modal__actions settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit" id="settlement-action-submit">Confirmar</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="settlement-payment-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-payment-title" hidden>
        <section class="modal modal--settlement-action">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIONES</p>
              <h2 id="settlement-payment-title">Registrar pago</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <form class="settlement-form" id="settlement-payment-form" novalidate>
            <div class="modal__body modal__body--summary settlement-form__body">
              <div class="expense-review-summary" aria-label="Resumen de liquidación">
                <div><span>ID</span><strong id="settlement-payment-summary-id">-</strong></div>
                <div><span>Persona</span><strong id="settlement-payment-summary-person">-</strong></div>
                <div><span>Importe a pagar</span><strong id="settlement-payment-summary-amount">-</strong></div>
              </div>
              <label class="field">
                <span>Método de pago *</span>
                <select id="settlement-payment-method" required>
                  <option value="">Seleccionar</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </label>
              <label class="field">
                <span>Fecha de pago *</span>
                <input id="settlement-payment-date" type="date" required />
              </label>
              <label class="field field--compact-textarea">
                <span>Observaciones</span>
                <textarea id="settlement-payment-observations" rows="3"></textarea>
              </label>
              <p class="settlement-pending-note">Registrado por: <strong id="settlement-payment-registered-by">-</strong></p>
              <p class="form-error" id="settlement-payment-error" hidden></p>
            </div>
            <div class="modal__actions settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Registrar pago</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="settlement-payment-annul-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-payment-annul-title" hidden>
        <section class="modal modal--settlement-action">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIONES</p>
              <h2 id="settlement-payment-annul-title">Anular pago</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <form class="settlement-form" id="settlement-payment-annul-form" novalidate>
            <div class="modal__body modal__body--summary settlement-form__body">
              <div class="expense-review-summary" aria-label="Resumen de liquidación">
                <div><span>ID</span><strong id="settlement-payment-annul-summary-id">-</strong></div>
                <div><span>Persona</span><strong id="settlement-payment-annul-summary-person">-</strong></div>
                <div><span>Importe pagado</span><strong id="settlement-payment-annul-summary-amount">-</strong></div>
              </div>
              <p class="modal__hint">Se registrará una entrada de reversión en Caja y la liquidación volverá a Aprobada.</p>
              <label class="field field--compact-textarea">
                <span>Motivo de anulación *</span>
                <textarea id="settlement-payment-annul-reason" rows="3" required></textarea>
              </label>
              <p class="form-error" id="settlement-payment-annul-error" hidden></p>
            </div>
            <div class="modal__actions settlement-form__actions">
              <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cancelar</button>
              <button class="button button--compact button--danger" type="submit">Confirmar anulación</button>
            </div>
          </form>
        </section>
      </div>

      <div class="modal-backdrop" id="settlement-config-modal" data-settlement-modal="true" role="dialog" aria-modal="true" aria-labelledby="settlement-config-title" hidden>
        <section class="modal modal--settlement-config">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">LIQUIDACIONES</p>
              <h2 id="settlement-config-title">Configuración de liquidaciones</h2>
            </div>
            <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cerrar</button>
          </header>
          <form class="settlement-form" id="settlement-config-form" novalidate>
            <div class="modal__body modal__body--summary settlement-form__body settlement-settings-modal__body">
              <section class="settlement-detail-section">
                <h3 class="modal__section-title">Configuración global</h3>
                <div class="settlement-form-grid">
                  <label class="field"><span>% para chofer interno *</span><input id="settlement-config-internal" type="number" min="0" max="100" step="0.01" required /></label>
                  <label class="field"><span>% ELARA global colaboradores *</span><input id="settlement-config-collaborator" type="number" min="0" max="100" step="0.01" required /></label>
                  <div class="settlement-readonly-box"><span>Frecuencia chofer</span><strong id="settlement-config-internal-frequency">Mensual</strong></div>
                  <div class="settlement-readonly-box"><span>Frecuencia colaborador</span><strong id="settlement-config-collaborator-frequency">Semanal</strong></div>
                </div>
              </section>
              <section class="settlement-detail-section">
                <h3 class="modal__section-title">Configuración individual de colaboradores</h3>
                <div class="settlement-config-list" id="settlement-config-collaborators"></div>
              </section>
              <p class="modal__hint">Los cambios solo afectan liquidaciones futuras. Los snapshots aprobados no se recalculan.</p>
              <p class="form-error" id="settlement-config-error" hidden></p>
            </div>
            <footer class="modal__actions settlement-form__actions settlement-settings-modal__footer">
              <button class="button button--compact button--muted" type="button" data-settlement-modal-close>Cancelar</button>
              <button class="button button--compact" type="submit">Guardar configuración</button>
            </footer>
          </form>
        </section>
      </div>
    `,
  );

  getSettlementsElement("settlement-new-form")?.addEventListener("submit", submitSettlementNew);
  getSettlementsElement("settlement-action-form")?.addEventListener("submit", submitSettlementAction);
  getSettlementsElement("settlement-payment-form")?.addEventListener("submit", submitSettlementPayment);
  getSettlementsElement("settlement-payment-annul-form")?.addEventListener("submit", submitSettlementPaymentAnnul);
  getSettlementsElement("settlement-config-form")?.addEventListener("submit", submitSettlementConfig);
}

function openSettlementModal(id) {
  const modal = getSettlementsElement(id);
  if (modal) modal.hidden = false;
}

function closeSettlementModal(modal) {
  if (modal?.id === "settlement-detail-modal" && isRealSettlementMode()) {
    realSettlementsState.detailRequest += 1;
    selectedSettlementId = "";
  }
  if (!modal) return;
  modal.hidden = true;
  if (modal.id !== "settlement-detail-modal") {
    pendingSettlementAction = null;
  }
}

function canSettlementAction(action) {
  return Boolean(window.ElaraPermissions?.canPerformAction?.(getSettlementActiveContext(), action));
}

function getSettlementActiveContext() {
  return window.ElaraAuth?.getActiveContext?.() || "";
}

function getSettlementCurrentUser() {
  return window.ElaraAuth?.getCurrentUser?.() || null;
}

function isSettlementsViewActive() {
  const view = getSettlementsElement("liquidaciones");

  return Boolean(view && !view.hidden && window.location.hash.replace(/^#\/?/, "") === "liquidaciones");
}

function getSettlementInputValue(id) {
  return getSettlementsElement(id)?.value.trim() || "";
}

function setSettlementInputValue(id, value) {
  const element = getSettlementsElement(id);
  if (element) element.value = value ?? "";
}

function setSettlementFormError(id, message) {
  const element = getSettlementsElement(id);
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}

function setSettlementsText(id, value) {
  const element = getSettlementsElement(id);
  if (element) element.textContent = value ?? "";
}

function getSettlementsElement(id) {
  return document.getElementById(id);
}

function notifySettlement(message, type = "info") {
  if (window.ElaraNotifications?.showToast) {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function formatSettlementUiMoney(value, currencyCode = "EUR") {
  if (currencyCode === "EUR" && window.ElaraCash?.formatCashMoney) {
    return window.ElaraCash.formatCashMoney(value);
  }

  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currencyCode }).format(Number(value) || 0);
}

function formatSettlementUiDate(value) {
  const normalized = normalizeSettlementUiDate(value);
  if (!normalized) return "Sin fecha";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function formatSettlementUiDateTime(value) {
  if (!value) return "Sin fecha";
  if (window.ElaraCash?.formatCashDateTime) return window.ElaraCash.formatCashDateTime(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-ES");
}

function getSettlementUiTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getSettlementTodayValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function normalizeSettlementUiDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function normalizeSettlementUiText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function escapeSettlementHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.ElaraSettlements = {
  initSettlements,
  showSettlements,
};


// Administrative read-only branch. No legacy dataset or mutation is used here.
const REAL_SETTLEMENT_STATUS = { draft: "Borrador", generated: "Generada", submitted: "Pendiente de aprobaci\u00f3n", approved: "Aprobada", rejected: "Rechazada", cancelled: "Anulada" };
const REAL_SETTLEMENT_PAYMENT = { unpaid: "Pendiente de pago", partial: "Pago parcial", paid: "Pagada", cancelled: "Pago cancelado" };
const REAL_SETTLEMENT_TYPE = { internal_driver: "Conductor interno", external_collaborator: "Colaborador externo" };
const REAL_SETTLEMENT_FREQUENCY = { monthly: "Mensual", weekly: "Semanal" };
let realSettlementSearchTimer;
const realSettlementsState = { scope: "", listRequest: 0, detailRequest: 0, rows: [], total: 0, loading: false, drivers: [], driverScope: "" };

function isRealSettlementMode() {
  return Boolean(getSettlementCurrentUser()?.supabaseUserId && ["administrativo", "superadmin"].includes(getSettlementActiveContext()));
}
function realSettlementScope() {
  return isRealSettlementMode() ? getSettlementCurrentUser().supabaseUserId + ":" + getSettlementActiveContext() : "";
}
function invalidateRealSettlements() {
  clearTimeout(realSettlementSearchTimer);
  realSettlementsState.listRequest += 1;
  realSettlementsState.detailRequest += 1;
  realSettlementsState.rows = [];
  realSettlementsState.drivers = [];
  realSettlementsState.driverScope = "";
  setSettlementSelectOptions("settlements-filter-driver", [["", "Todos los conductores"]], "");
  realSettlementsState.total = 0;
  realSettlementsState.loading = false;
  selectedSettlementId = "";
  ["settlements-list", "settlements-summary", "settlement-detail-content", "settlement-detail-actions"].forEach((id) => {
    const element = getSettlementsElement(id);
    if (element) element.innerHTML = "";
  });
  const pagination = getSettlementsElement("settlements-pagination");
  if (pagination) { pagination.innerHTML = ""; pagination.hidden = true; }
  document.querySelectorAll('[data-settlement-config-open]').forEach((button) => { button.hidden = true; });
  document.querySelectorAll('[data-settlement-modal="true"]').forEach((modal) => { modal.hidden = true; });
}
function configureRealSettlementFilters() {
  const scope = realSettlementScope();
  if (realSettlementsState.scope === scope) return;
  invalidateRealSettlements();
  realSettlementsState.scope = scope;
  settlementsFilters = getDefaultSettlementsFilters();
  settlementsPage = 1;
  ["settlements-search", "settlements-filter-from", "settlements-filter-to"].forEach((id) => setSettlementInputValue(id, ""));
  const chips = (entries, attribute, name) => entries.map(([value, label]) => '<label class="filter-chip"><input type="radio" name="' + name + '" ' + attribute + ' value="' + escapeSettlementHtml(value) + '"' + (!value ? ' checked' : '') + ' /><span>' + escapeSettlementHtml(label) + '</span></label>').join("");
  const status = getSettlementsElement("settlements-status-filters");
  if (status) status.innerHTML = chips([["", "Todos"], ...Object.entries(REAL_SETTLEMENT_STATUS)], 'data-settlement-filter="status"', "settlements-real-status");
  const typeGroup = document.querySelector('[data-settlement-filter="driverType"]')?.closest(".customer-filter__group");
  if (typeGroup) typeGroup.innerHTML = '<strong>Tipo</strong>' + chips([["", "Todos"], ...Object.entries(REAL_SETTLEMENT_TYPE)], 'data-settlement-filter="driverType"', "settlements-real-type");
  const paymentGroup = document.querySelector("[data-settlement-collection]")?.closest(".customer-filter__group");
  if (paymentGroup) paymentGroup.innerHTML = '<strong>Estado de pago</strong>' + chips([["", "Todos"], ...Object.entries(REAL_SETTLEMENT_PAYMENT)], "data-settlement-collection", "settlements-real-payment");
  const header = document.querySelector("#liquidaciones .settlements-list-header");
  if (header) header.innerHTML = ["Liquidaci\u00f3n", "Persona", "Bruto y deducciones", "Base de c\u00e1lculo", "Porcentaje", "Importes", "Estado / Pago", "Detalle"].map((label) => "<span>" + label + "</span>").join("");
}
async function loadRealSettlementDrivers(client, scope) {
  if (realSettlementsState.driverScope === scope) return;
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await client.from("drivers").select("id,human_code,driver_type,person:persons!drivers_person_id_fkey(first_name,last_name)").order("human_code").range(offset, offset + 199);
    if (error) throw error;
    if (realSettlementScope() !== scope) return;
    rows.push(...(Array.isArray(data) ? data : []));
    if (!data || data.length < 200) break;
  }
  realSettlementsState.drivers = rows;
  realSettlementsState.driverScope = scope;
  setSettlementSelectOptions("settlements-filter-driver", [["", "Todos los conductores"], ...rows.map((row) => [row.id, [row.human_code, [row.person?.first_name, row.person?.last_name].filter(Boolean).join(" ")].filter(Boolean).join(" - ")])], settlementsFilters.driverId);
}
function realSettlementMessage(message, retry = false) {
  const list = getSettlementsElement("settlements-list");
  if (list) list.innerHTML = '<p class="settlements-empty" role="status">' + escapeSettlementHtml(message) + '</p>' + (retry ? '<button class="button button--compact button--muted" type="button" data-settlements-retry>Reintentar</button>' : "");
  const pagination = getSettlementsElement("settlements-pagination");
  if (pagination) { pagination.hidden = true; pagination.innerHTML = ""; }
}
async function loadRealSettlements() {
  if (!isRealSettlementMode()) return;
  clearTimeout(realSettlementSearchTimer);
  configureRealSettlementFilters();
  configureSettlementsPrimaryAction();
  updateSettlementsFilterSummary();
  const scope = realSettlementScope();
  const request = ++realSettlementsState.listRequest;
  const client = window.ElaraSupabase?.client;
  realSettlementsState.loading = true;
  realSettlementsState.rows = [];
  realSettlementsState.total = 0;
  const summary = getSettlementsElement("settlements-summary");
  if (summary) summary.innerHTML = "";
  realSettlementMessage("Cargando liquidaciones...");
  try {
    if (!client) throw new Error("El cliente Supabase no est\u00e1 disponible.");
    await loadRealSettlementDrivers(client, scope);
    if (request !== realSettlementsState.listRequest || scope !== realSettlementScope()) return;
    const { data, error } = await client.rpc("get_admin_settlements", {
      p_status: settlementsFilters.statuses[0] || null,
      p_payment_status: settlementsFilters.collection || null,
      p_driver_id: settlementsFilters.driverId || null,
      p_driver_type: settlementsFilters.driverTypes[0] || null,
      p_period_from: settlementsFilters.from || null,
      p_period_to: settlementsFilters.to || null,
      p_search: settlementsFilters.query || null,
      p_limit: SETTLEMENTS_PAGE_SIZE,
      p_offset: (settlementsPage - 1) * SETTLEMENTS_PAGE_SIZE,
    });
    if (request !== realSettlementsState.listRequest || scope !== realSettlementScope()) return;
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    // An empty page has no window count; retry page one after concurrent removals.
    if (!rows.length && settlementsPage > 1) { settlementsPage = 1; void loadRealSettlements(); return; }
    realSettlementsState.rows = rows;
    realSettlementsState.total = Number(rows[0]?.total_count) || 0;
    realSettlementsState.loading = false;
    renderRealSettlementSummary();
    if (!rows.length) { realSettlementMessage("No hay liquidaciones que coincidan con los filtros."); return; }
    const list = getSettlementsElement("settlements-list");
    if (list) list.innerHTML = rows.map(renderRealSettlementRow).join("");
    const pagination = getSettlementsElement("settlements-pagination");
    if (pagination) renderSettlementsPagination(pagination, realSettlementsState.total, Math.ceil(realSettlementsState.total / SETTLEMENTS_PAGE_SIZE));
  } catch (error) {
    if (request !== realSettlementsState.listRequest || scope !== realSettlementScope()) return;
    realSettlementsState.loading = false;
    console.error("[ELARA Settlements] No se pudo cargar el listado real.", { error });
    realSettlementMessage("No se pudieron cargar las liquidaciones.", true);
    notifySettlement("No se pudieron cargar las liquidaciones.", "error");
  }
}
function realSettlementMoney(value, row) { return formatSettlementUiMoney(value, row.currency_code || "EUR"); }
function realSettlementBadge(raw, payment = false) {
  const label = (payment ? REAL_SETTLEMENT_PAYMENT : REAL_SETTLEMENT_STATUS)[raw] || raw || "-";
  const tone = ["paid", "approved"].includes(raw) ? "success" : ["cancelled", "rejected"].includes(raw) ? "danger" : "info";
  return '<span class="expense-status-badge expense-status-badge--' + tone + '">' + escapeSettlementHtml(label) + '</span>';
}
function renderRealSettlementSummary() {
  const container = getSettlementsElement("settlements-summary");
  if (!container) return;
  const rows = realSettlementsState.rows;
  const metrics = [["Resultados del filtro", realSettlementsState.total], ["En esta p\u00e1gina", rows.length], ["Generadas - p\u00e1gina", rows.filter((r) => r.status === "generated").length], ["Aprobadas - p\u00e1gina", rows.filter((r) => r.status === "approved").length], ["Pagadas - p\u00e1gina", rows.filter((r) => r.payment_status === "paid").length], ["Servicios - p\u00e1gina", rows.reduce((n, r) => n + (Number(r.service_item_count) || 0), 0)]];
  const currencies = [...new Set(rows.map((r) => r.currency_code))];
  metrics.push(["Pendiente - p\u00e1gina", currencies.map((currency) => formatSettlementUiMoney(rows.filter((r) => r.currency_code === currency).reduce((n, r) => n + (Number(r.pending_amount) || 0), 0), currency)).join(" - ") || "-"]);
  container.innerHTML = metrics.map(([label, value]) => '<article class="summary-card summary-card--neutral"><span>' + escapeSettlementHtml(label) + '</span><strong>' + escapeSettlementHtml(value) + '</strong></article>').join("");
}
function renderRealSettlementRow(row) {
  const text = escapeSettlementHtml;
  const money = (value) => text(realSettlementMoney(value, row));
  return '<article class="settlements-row settlements-list-grid">' +
    '<div class="settlements-row__main"><strong>' + text(row.human_code) + '</strong><small>' + text(formatSettlementUiDate(row.period_start)) + ' - ' + text(formatSettlementUiDate(row.period_end)) + '</small><small>' + text(REAL_SETTLEMENT_FREQUENCY[row.frequency_snapshot] || row.frequency_snapshot) + ' - ' + text(row.currency_code) + '</small></div>' +
    '<div class="settlements-row__stack"><strong>' + text(row.driver_name) + '</strong><small>' + text(row.driver_human_code) + '</small><small>' + text(REAL_SETTLEMENT_TYPE[row.driver_type_snapshot] || row.driver_type_snapshot) + '</small></div>' +
    '<div class="settlements-row__stack"><strong>Bruto ' + money(row.gross_eligible_amount) + '</strong><small>Deducciones ' + money(row.expense_deduction_amount) + '</small><small>Ajustes ' + money(row.adjustment_amount) + '</small></div>' +
    '<strong>' + money(row.calculation_base_amount) + '</strong><span>' + text(row.driver_percentage) + ' % conductor</span>' +
    '<div class="settlements-row__stack"><strong>Conductor ' + money(row.driver_amount) + '</strong><small>Pagado ' + money(row.paid_amount) + '</small><small>Pendiente ' + money(row.pending_amount) + '</small></div>' +
    '<div class="settlements-row__stack"><small>Estado</small>' + realSettlementBadge(row.status) + '<small>Pago</small>' + realSettlementBadge(row.payment_status, true) + '</div>' +
    '<div class="settlements-row__actions"><button class="button button--compact button--muted" type="button" data-settlement-detail="' + text(row.settlement_id) + '">Detalle</button></div></article>';
}
async function openRealSettlementDetail(id) {
  if (!isRealSettlementMode()) return;
  const scope = realSettlementScope();
  const request = ++realSettlementsState.detailRequest;
  selectedSettlementId = id;
  setSettlementsText("settlement-detail-id", "Liquidaci\u00f3n");
  setSettlementsText("settlement-detail-status", "Cargando...");
  const content = getSettlementsElement("settlement-detail-content");
  const actions = getSettlementsElement("settlement-detail-actions");
  if (actions) { actions.innerHTML = ""; actions.hidden = true; }
  if (content) content.innerHTML = '<p role="status">Cargando detalle...</p>';
  openSettlementModal("settlement-detail-modal");
  try {
    const client = window.ElaraSupabase?.client;
    if (!client) throw new Error("El cliente Supabase no est\u00e1 disponible.");
    const { data, error } = await client.rpc("get_admin_settlement_detail", { p_settlement_id: id });
    if (request !== realSettlementsState.detailRequest || scope !== realSettlementScope() || selectedSettlementId !== id) return;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) throw new Error("No se encontr\u00f3 la liquidaci\u00f3n.");
    setSettlementsText("settlement-detail-id", row.human_code);
    setSettlementsText("settlement-detail-status", REAL_SETTLEMENT_STATUS[row.status] || row.status);
    if (content) content.innerHTML = renderRealSettlementDetail(row);
  } catch (error) {
    if (request !== realSettlementsState.detailRequest || scope !== realSettlementScope() || selectedSettlementId !== id) return;
    console.error("[ELARA Settlements] No se pudo cargar el detalle real.", { error });
    setSettlementsText("settlement-detail-status", "Error de carga");
    if (content) content.innerHTML = '<p role="status">No se pudo cargar el detalle.</p><button class="button button--compact button--muted" type="button" data-settlement-detail-retry="' + escapeSettlementHtml(id) + '">Reintentar</button>';
    notifySettlement("No se pudo cargar el detalle.", "error");
  }
}
function renderRealSettlementDetail(row) {
  const money = (value) => realSettlementMoney(value, row);
  const section = renderSettlementDetailSection;
  const actor = (value) => value?.name || value?.human_code || value?.id || "-";
  const itemTypes = { service_income: "Ingreso de servicio", expense_deduction: "Deducci\u00f3n de gasto", positive_adjustment: "Ajuste positivo", negative_adjustment: "Ajuste negativo", other: "Otro" };
  const items = (Array.isArray(row.items) ? row.items : []).map((item) => section(itemTypes[item.item_type] || item.item_type, [
    ["Referencia", item.service_human_code || item.expense_human_code || item.source_reference], ["Descripci\u00f3n", item.description],
    ["Bruto", money(item.gross_amount)], ["Elegible", money(item.eligible_amount)], ["Deducci\u00f3n", money(item.deduction_amount)], ["Ajuste", money(item.adjustment_amount)],
    ["Porcentaje conductor", item.driver_percentage_snapshot + " %"], ["Porcentaje ELARA", item.elara_percentage_snapshot + " %"],
    ["Importe conductor", money(item.driver_amount_snapshot)], ["Importe ELARA", money(item.elara_amount_snapshot)],
  ])).join("");
  const methods = { cash: "Efectivo", bank_transfer: "Transferencia", card: "Tarjeta", other: "Otro" };
  const paymentStatuses = { pending: "Pendiente", completed: "Completado", failed: "Fallido", cancelled: "Cancelado", reversed: "Revertido" };
  const payments = (Array.isArray(row.payments) ? row.payments : []).map((payment) => section(payment.human_code || "Pago", [
    ["Importe", formatSettlementUiMoney(payment.amount, payment.currency_code || row.currency_code)], ["Estado", paymentStatuses[payment.payment_status] || payment.payment_status],
    ["M\u00e9todo", methods[payment.payment_method] || payment.payment_method], ["Cuenta", payment.cash_account_name || payment.cash_account_id],
    ["Fecha", payment.paid_at ? formatSettlementUiDateTime(payment.paid_at) : "-"], ["Notas", payment.notes], ["Actor", actor(payment.created_by_actor)],
  ])).join("");
  const history = (Array.isArray(row.history) ? row.history : []).map((entry) => section("Transici\u00f3n", [
    ["Desde", REAL_SETTLEMENT_STATUS[entry.from_status] || entry.from_status || "Inicio"], ["Hasta", REAL_SETTLEMENT_STATUS[entry.to_status] || entry.to_status],
    ["Fecha", formatSettlementUiDateTime(entry.changed_at)], ["Actor", actor(entry.changed_by_actor)], ["Motivo", entry.reason],
  ])).join("");
  return section("Resumen", [["C\u00f3digo", row.human_code], ["Conductor", [row.driver_human_code, row.driver_name].filter(Boolean).join(" - ")],
    ["Tipo", REAL_SETTLEMENT_TYPE[row.driver_type_snapshot] || row.driver_type_snapshot], ["Periodo", formatSettlementUiDate(row.period_start) + " - " + formatSettlementUiDate(row.period_end)],
    ["Frecuencia", REAL_SETTLEMENT_FREQUENCY[row.frequency_snapshot] || row.frequency_snapshot], ["M\u00e9todo de c\u00e1lculo", row.calculation_method_snapshot === "driver_share" ? "Participaci\u00f3n del conductor" : row.calculation_method_snapshot === "elara_commission" ? "Comisi\u00f3n ELARA" : row.calculation_method_snapshot],
    ["Estado", REAL_SETTLEMENT_STATUS[row.status] || row.status], ["Pago", REAL_SETTLEMENT_PAYMENT[row.payment_status] || row.payment_status], ["Moneda", row.currency_code]]) +
    section("C\u00e1lculo", [["Bruto elegible", money(row.gross_eligible_amount)], ["Deducciones", money(row.expense_deduction_amount)], ["Ajustes", money(row.adjustment_amount)], ["Base de c\u00e1lculo", money(row.calculation_base_amount)],
      ["Porcentaje conductor", row.driver_percentage + " %"], ["Porcentaje ELARA", row.elara_percentage + " %"], ["Importe conductor", money(row.driver_amount)], ["Importe ELARA", money(row.elara_amount)], ["Pagado", money(row.paid_amount)], ["Pendiente", money(row.pending_amount)]]) +
    '<section class="settlement-detail-section"><h3 class="modal__section-title">Items</h3>' + (items || '<p>No hay items registrados.</p>') + '</section>' +
    '<section class="settlement-detail-section"><h3 class="modal__section-title">Pagos</h3>' + (payments || '<p>No hay pagos registrados.</p>') + '</section>' +
    '<section class="settlement-detail-section"><h3 class="modal__section-title">Historial</h3>' + (history || '<p>No hay historial registrado.</p>') + '</section>' +
    section("Notas", [["Notas", row.notes], ["Notas internas", row.internal_notes]]);
}
