/*
  Proyecto Atlas / ELARA Transport
  Archivo: reports.js
  Responsabilidad: renderizado y logica de la pantalla Reportes.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const reportsData = window.ElaraReportsMock;
const reportChartInstances = new Map();
let expandedReportChart = null;

const reportChartPalette = ["#2563eb", "#16a34a", "#f59e0b", "#64748b", "#dc2626"];
const REPORT_CLOSED_SERVICE_STATUSES = ["Cancelado", "Finalizado", "No show", "No realizado"];
const reportStatusColorByName = {
  Pendiente: "#f59e0b",
  Confirmado: "#16a34a",
  "En curso": "#2563eb",
  Finalizado: "#16a34a",
  Cancelado: "#dc2626",
  "No show": "#f59e0b",
  "No realizado": "#64748b",
};

const reportsViewState = {
  mode: "current",
  searchTerm: "",
  selectedHistoryMonthKey: "",
};

// =========================
// Inicializacion y estado de vista
// =========================

function initReports() {
  renderReportsSummary();
  renderReportBlocks();
  renderReportCharts();
  initReportsModalControls();
  initReportsFilterControls();
  initReportsHistoryControls();
}

function showReports() {
  reportsViewState.mode = "current";
  reportsViewState.selectedHistoryMonthKey = "";
  setText("page-eyebrow", "Módulo Reportes");
  setText("page-title", "Reportes");
  setText("page-summary", "Analiza operaci\u00f3n, ingresos, servicios, clientes, colaboradores y veh\u00edculos.");
  setText("primary-action", "Exportar reporte");
  setModalTarget("primary-action", "export-report-modal");
  const primaryAction = getElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = false;
  }

  renderReportsViewState();
  renderReportsSummary();
  renderReportBlocks();
  renderReportCharts();
}

function showReportsHistory() {
  reportsViewState.mode = "history";
  reportsViewState.selectedHistoryMonthKey = "";
  setText("page-eyebrow", "Reportes");
  setText("page-title", "Historial de reportes");
  setText("page-summary", "Consulta los cierres mensuales consolidados de la operaci\u00f3n.");
  setModalTarget("primary-action", "");

  const primaryAction = getElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = true;
  }

  renderReportsViewState();
  renderReportsHistoryList();
}

function showReportsHistoryDetail(monthKey) {
  const snapshot = getReportMonthlySnapshotByKey(monthKey);

  if (!snapshot) {
    showReportsHistory();
    return;
  }

  reportsViewState.mode = "history-detail";
  reportsViewState.selectedHistoryMonthKey = snapshot.monthKey;
  setText("page-eyebrow", "Reportes");
  setText("page-title", snapshot.monthName || "Reporte mensual");
  setText("page-summary", "Reporte mensual consolidado");
  setModalTarget("primary-action", "");

  const primaryAction = getElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = true;
  }

  renderReportsViewState();
  renderReportsHistoryDetail(snapshot);
}

// =========================
// Render principal
// =========================

function renderReportsSummary() {
  const container = getElement("reports-summary");

  container.innerHTML = getReportSummaryData()
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

function renderReportBlocks() {
  const container = getElement("report-blocks");

  container.innerHTML = getReportBlockData()
    .map(
      (block) => `
        <article class="report-block">
          <h3>${escapeHtml(block.title)}</h3>
          <ul>
            ${block.metrics.map((metric) => `<li>${escapeHtml(metric)}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");
}

function renderReportCharts() {
  const container = getElement("report-charts");

  container.innerHTML = getReportChartData()
    .map(
      (chart) => `
        <article class="report-chart-card">
          <header class="report-chart-card__header">
            <div>
              <h3>${escapeHtml(chart.title)}</h3>
              <p>${escapeHtml(chart.metric)}</p>
            </div>
            <button class="button button--compact button--muted report-chart-card__expand" type="button" aria-label="Ampliar grafico" data-report-chart="${escapeHtml(chart.id)}">
              <i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
            </button>
          </header>
          <div class="report-chart-card__canvas">
            <canvas id="report-chart-${escapeHtml(chart.id)}"></canvas>
          </div>
        </article>
      `,
    )
    .join("");

  refreshReportCharts();
}

function renderReportsViewState() {
  const summary = getElement("reports-summary");
  const currentPanel = getElement("reports-current-panel");
  const historyPanel = getElement("reports-history-panel");
  const historyDetailPanel = getElement("reports-history-detail-panel");
  const historyAction = getElement("reports-history-action");
  const isCurrent = reportsViewState.mode === "current";
  const isHistory = reportsViewState.mode === "history";
  const isHistoryDetail = reportsViewState.mode === "history-detail";

  if (summary) {
    summary.hidden = !isCurrent;
  }

  if (currentPanel) {
    currentPanel.hidden = !isCurrent;
  }

  if (historyPanel) {
    historyPanel.hidden = !isHistory;
  }

  if (historyDetailPanel) {
    historyDetailPanel.hidden = !isHistoryDetail;
  }

  if (historyAction) {
    historyAction.hidden = !isCurrent;
  }
}

function renderReportsHistoryList() {
  const container = getElement("reports-history-list");

  if (!container) {
    return;
  }

  const snapshots = getReportMonthlySnapshots();

  if (!snapshots.length) {
    container.innerHTML = `<p class="service-assignment-empty">No hay reportes mensuales cerrados.</p>`;
    return;
  }

  container.innerHTML = snapshots.map(renderReportMonthlySnapshotCard).join("");
}

function renderReportMonthlySnapshotCard(snapshot) {
  return `
    <article class="report-history-card">
      <div class="report-history-card__main">
        <div>
          <p class="panel__eyebrow">${escapeHtml(formatReportGeneratedAt(snapshot.generatedAt))}</p>
          <h3>${escapeHtml(snapshot.monthName)}</h3>
        </div>
        <strong>${escapeHtml(formatReportCurrency(snapshot.revenue?.registered || 0))}</strong>
      </div>
      <dl class="report-history-card__metrics">
        <div><dt>Servicios</dt><dd>${escapeHtml(snapshot.serviceCount)}</dd></div>
        <div><dt>Finalizados</dt><dd>${escapeHtml(snapshot.totals?.finalized || 0)}</dd></div>
        <div><dt>Cancelados</dt><dd>${escapeHtml(snapshot.totals?.cancelled || 0)}</dd></div>
        <div><dt>No show</dt><dd>${escapeHtml(snapshot.totals?.noShow || 0)}</dd></div>
      </dl>
      <button class="button button--compact button--muted" type="button" data-report-history-detail="${escapeHtml(snapshot.monthKey)}">Ver detalle</button>
    </article>
  `;
}

function renderReportsHistoryDetail(snapshot) {
  const title = getElement("reports-history-detail-title");
  const container = getElement("reports-history-detail");

  if (title) {
    title.textContent = snapshot.monthName || "Reporte mensual";
  }

  if (!container) {
    return;
  }

  container.innerHTML = `
    <section class="report-history-detail-section">
      <h3>Resumen</h3>
      <dl class="report-history-detail-metrics">
        ${renderReportHistoryMetric("Servicios incluidos", snapshot.serviceCount)}
        ${renderReportHistoryMetric("Activos al cierre", snapshot.totals?.activeAtClose)}
        ${renderReportHistoryMetric("Finalizados", snapshot.totals?.finalized)}
        ${renderReportHistoryMetric("Cancelados", snapshot.totals?.cancelled)}
        ${renderReportHistoryMetric("No show", snapshot.totals?.noShow)}
        ${renderReportHistoryMetric("Tasa de finalizaci\u00f3n", formatReportHistoryRate(snapshot.rates?.finalizedRate))}
        ${renderReportHistoryMetric("Tasa de cancelaci\u00f3n", formatReportHistoryRate(snapshot.rates?.cancellationRate))}
        ${renderReportHistoryMetric("Tasa de no show", formatReportHistoryRate(snapshot.rates?.noShowRate))}
      </dl>
    </section>

    <section class="report-history-detail-section">
      <h3>Ingresos</h3>
      <dl class="report-history-detail-metrics report-history-detail-metrics--compact">
        ${renderReportHistoryMetric("Ingresos registrados", formatReportCurrency(getReportHistoryNumber(snapshot.revenue?.registered)))}
        ${renderReportHistoryMetric("Ingresos finalizados", formatReportCurrency(getReportHistoryNumber(snapshot.revenue?.finalized)))}
      </dl>
    </section>

    <section class="report-history-detail-section">
      <h3>Conductores</h3>
      <dl class="report-history-detail-metrics">
        ${renderReportHistoryMetric("Choferes internos", snapshot.drivers?.internalDriversCount)}
        ${renderReportHistoryMetric("Colaboradores externos", snapshot.drivers?.externalCollaboratorsCount)}
        ${renderReportHistoryMetric("Choferes activos", snapshot.drivers?.activeInternalDrivers)}
        ${renderReportHistoryMetric("Colaboradores activos", snapshot.drivers?.activeExternalCollaborators)}
        ${renderReportHistoryMetric("Servicios con choferes", snapshot.drivers?.servicesByInternalDrivers)}
        ${renderReportHistoryMetric("Servicios con colaboradores", snapshot.drivers?.servicesByExternalCollaborators)}
        ${renderReportHistoryMetric("Servicios sin asignar", snapshot.drivers?.unassignedServices)}
        ${renderReportHistoryMetric("Cobertura interna", formatReportHistoryRate(snapshot.drivers?.internalCoverageRate))}
        ${renderReportHistoryMetric("Cobertura externa", formatReportHistoryRate(snapshot.drivers?.externalCoverageRate))}
      </dl>
    </section>

    <section class="report-history-detail-section">
      <h3>Rendimiento por conductor</h3>
      ${renderReportHistoryDriversTable(snapshot.drivers?.topDrivers || [])}
    </section>

    <section class="report-history-detail-section">
      <h3>Desgloses</h3>
      <div class="report-history-breakdowns">
        ${renderReportHistoryBreakdownList("Tipos de servicio", snapshot.breakdowns?.byServiceType || [])}
        ${renderReportHistoryBreakdownList("Servicios por conductor", snapshot.breakdowns?.byDriver || [])}
        ${renderReportHistoryBreakdownList("Ingresos por veh\u00edculo", snapshot.breakdowns?.revenueByVehicle || [], true)}
      </div>
    </section>

    <section class="report-history-detail-section">
      <h3>Informaci\u00f3n del cierre</h3>
      <dl class="report-history-detail-metrics report-history-detail-metrics--compact">
        ${renderReportHistoryMetric("Fecha de generaci\u00f3n", formatReportHistoryDate(snapshot.generatedAt))}
        ${renderReportHistoryMetric("Servicios incluidos", snapshot.serviceCount)}
      </dl>
    </section>
  `;
}

function renderReportHistoryMetric(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(formatReportHistoryValue(value))}</dd>
    </div>
  `;
}

function renderReportHistoryDriversTable(drivers) {
  if (!drivers.length) {
    return `<p class="service-assignment-empty">No hay rendimiento por conductor registrado.</p>`;
  }

  return `
    <div class="report-history-table-wrapper">
      <table class="report-history-table">
        <thead>
          <tr>
            <th>Conductor</th>
            <th>Tipo</th>
            <th>Servicios</th>
            <th>Finalizados</th>
            <th>Cancelados</th>
            <th>No show</th>
            <th>Ingresos</th>
          </tr>
        </thead>
        <tbody>
          ${drivers
            .map(
              (driver) => `
                <tr>
                  <td>${escapeHtml(formatReportHistoryValue(driver.driverName))}</td>
                  <td>${escapeHtml(formatReportHistoryValue(driver.driverType))}</td>
                  <td>${escapeHtml(formatReportHistoryValue(driver.serviceCount))}</td>
                  <td>${escapeHtml(formatReportHistoryValue(driver.finalizedCount))}</td>
                  <td>${escapeHtml(formatReportHistoryValue(driver.cancelledCount))}</td>
                  <td>${escapeHtml(formatReportHistoryValue(driver.noShowCount))}</td>
                  <td>${escapeHtml(formatReportCurrency(getReportHistoryNumber(driver.revenue)))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReportHistoryBreakdownList(title, items, isCurrency = false) {
  return `
    <article class="report-history-breakdown">
      <h4>${escapeHtml(title)}</h4>
      ${
        items.length
          ? `<ul>${items
              .map(
                (item) => `
                  <li>
                    <span>${escapeHtml(formatReportHistoryValue(item.label))}</span>
                    <strong>${escapeHtml(isCurrency ? formatReportCurrency(getReportHistoryNumber(item.value)) : formatReportHistoryValue(item.value))}</strong>
                  </li>
                `,
              )
              .join("")}</ul>`
          : `<p class="service-assignment-empty">No indicado</p>`
      }
    </article>
  `;
}

function refreshReportCharts() {
  if (!window.Chart) {
    return;
  }

  getReportChartData().forEach((chart) => {
    const canvas = getElement(`report-chart-${chart.id}`);

    if (canvas) {
      createReportChart(canvas, chart, "compact");
    }
  });
}

// =========================
// Datos derivados
// =========================

function getReportSummaryData() {
  const metrics = getReportServiceMetrics();

  return [
    { label: "Servicios periodo", value: String(metrics.total), tone: "neutral" },
    { label: "Activos", value: String(metrics.active), tone: "info" },
    { label: "Finalizados", value: String(metrics.finalized), tone: "success" },
    { label: "Cancelados", value: String(metrics.cancelled), tone: "danger" },
    { label: "No show", value: String(metrics.noShow), tone: "warning" },
    { label: "Tasa finalizaci\u00f3n", value: formatReportPercentage(metrics.finalizedRate), tone: "success" },
  ];
}

function getReportBlockData() {
  const metrics = getReportServiceMetrics();

  return [
    {
      title: "Operaci\u00f3n",
      metrics: [
        `${metrics.active} servicios activos`,
        `${metrics.finalized} finalizados`,
        `${metrics.cancelled} cancelados`,
        `${metrics.noShow} no show`,
      ],
    },
    {
      title: "Tasas de cierre",
      metrics: [
        `Tasa de finalizaci\u00f3n: ${formatReportPercentage(metrics.finalizedRate)}`,
        `Tasa de cancelaci\u00f3n: ${formatReportPercentage(metrics.cancelledRate)}`,
        `Tasa de no show: ${formatReportPercentage(metrics.noShowRate)}`,
        `Base del periodo: ${metrics.total} servicios`,
      ],
    },
    {
      title: "Estados activos",
      metrics: [
        `${metrics.pending} pendientes`,
        `${metrics.confirmed} confirmados`,
        `${metrics.inProgress} en curso`,
        `${metrics.unassigned} sin asignar`,
      ],
    },
    {
      title: "Ingresos",
      metrics: [
        `${formatReportCurrency(metrics.totalRevenue)} registrados en el periodo`,
        `${formatReportCurrency(metrics.finalizedRevenue)} finalizados`,
        `${formatReportCurrency(metrics.averageTicket)} ticket promedio`,
        `${metrics.total} servicios incluidos`,
      ],
    },
  ];
}

function getReportChartData() {
  const services = getFilteredReportServices();
  const metrics = getReportServiceMetrics(services);

  return [
    {
      id: "services-status",
      title: "Servicios por estado",
      description: "Distribuci\u00f3n de servicios activos y cerrados en el periodo.",
      metric: `${metrics.total} servicios del periodo`,
      unit: "servicios",
      chartType: "bar",
      items: getReportStatusChartItems(services),
    },
    {
      id: "service-types",
      title: "Tipos de servicio",
      description: "Distribuci\u00f3n de servicios por categor\u00eda operativa.",
      metric: `${metrics.total} servicios analizados`,
      unit: "servicios",
      chartType: "bar",
      items: getReportGroupedChartItems(services, (service) => service.type || "Sin tipo"),
    },
    {
      id: "services-driver",
      title: "Servicios por conductor",
      description: "Carga operativa e hist\u00f3rica por conductor durante el periodo activo.",
      metric: `${metrics.total} servicios asignados o registrados`,
      unit: "servicios",
      chartType: "bar",
      items: getReportGroupedChartItems(services, (service) => getReportServiceCollaboratorLabel(service)),
    },
    {
      id: "vehicle-revenue",
      title: "Ingresos por veh\u00edculo",
      description: "Importe registrado por veh\u00edculo incluyendo servicios cerrados del periodo.",
      metric: `${formatReportCurrency(metrics.totalRevenue)} registrados`,
      unit: "EUR",
      chartType: "bar",
      items: getReportVehicleRevenueItems(services),
    },
  ];
}

function getReportServiceMetrics(services = getFilteredReportServices()) {
  const total = services.length;
  const finalized = services.filter((service) => getReportServiceStatus(service) === "Finalizado").length;
  const cancelled = services.filter((service) => getReportServiceStatus(service) === "Cancelado").length;
  const noShow = services.filter((service) => getReportServiceStatus(service) === "No show").length;
  const activeServices = services.filter((service) => !isReportClosedService(service));
  const totalRevenue = services.reduce((sum, service) => sum + getReportServicePrice(service), 0);
  const finalizedRevenue = services
    .filter((service) => getReportServiceStatus(service) === "Finalizado")
    .reduce((sum, service) => sum + getReportServicePrice(service), 0);

  return {
    total,
    active: activeServices.length,
    finalized,
    cancelled,
    noShow,
    pending: activeServices.filter((service) => getReportServiceStatus(service) === "Pendiente").length,
    confirmed: activeServices.filter((service) => getReportServiceStatus(service) === "Confirmado").length,
    inProgress: activeServices.filter((service) => getReportServiceStatus(service) === "En curso").length,
    unassigned: activeServices.filter((service) => !getReportServiceCollaboratorId(service)).length,
    totalRevenue,
    finalizedRevenue,
    averageTicket: total ? totalRevenue / total : 0,
    finalizedRate: getReportRate(finalized, total),
    cancelledRate: getReportRate(cancelled, total),
    noShowRate: getReportRate(noShow, total),
  };
}

function getFilteredReportServices() {
  const filters = getActiveReportFilters();

  return getReportServices()
    .filter((service) => matchesReportSearch(service, filters.searchTerm))
    .filter((service) => matchesReportStatusFilter(service, filters.status))
    .filter((service) => matchesReportPeriodFilter(service, filters.period));
}

function getReportServices() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }

  return window.ElaraServicesMock?.services || [];
}

function getReportMonthlySnapshots() {
  return [...(window.ElaraReportsHistoryMock?.monthlySnapshots || [])].sort((first, second) =>
    String(second.monthKey || "").localeCompare(String(first.monthKey || "")),
  );
}

function getReportMonthlySnapshotByKey(monthKey) {
  return getReportMonthlySnapshots().find((snapshot) => snapshot.monthKey === monthKey) || null;
}

function getActiveReportFilters() {
  const filterMenu = document.querySelector("[data-reports-clear]")?.closest(".customer-filter__menu");
  const filters = {
    searchTerm: reportsViewState.searchTerm,
    period: [],
    status: [],
  };

  if (!filterMenu) {
    return filters;
  }

  filterMenu.querySelectorAll(".customer-filter__group").forEach((group) => {
    const groupName = normalizeReportText(group.querySelector("strong")?.textContent);
    const selectedLabels = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map((input) =>
      normalizeReportText(input.closest("label")?.textContent),
    );

    if (groupName.includes("periodo")) {
      filters.period = selectedLabels;
    } else if (groupName.includes("estado")) {
      filters.status = selectedLabels;
    }
  });

  return filters;
}

function matchesReportSearch(service, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  return getReportServiceSearchHaystack(service).includes(searchTerm);
}

function matchesReportStatusFilter(service, selectedStatuses) {
  if (!selectedStatuses.length) {
    return true;
  }

  const aliases = getReportStatusAliases(getReportServiceStatus(service));

  return selectedStatuses.some((status) => aliases.includes(status));
}

function matchesReportPeriodFilter(service, selectedPeriods) {
  if (!selectedPeriods.length) {
    return true;
  }

  return selectedPeriods.some((period) => matchesSingleReportPeriod(service, period));
}

function matchesSingleReportPeriod(service, period) {
  const serviceDate = getReportServiceDate(service);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  if (!serviceDate) {
    return false;
  }

  const diffDays = Math.round((serviceDate.getTime() - today.getTime()) / 86400000);

  if (period === "hoy") {
    return diffDays === 0;
  }

  if (period === "esta semana") {
    return diffDays >= 0 && diffDays <= 6;
  }

  if (period === "este mes") {
    return serviceDate.getFullYear() === today.getFullYear() && serviceDate.getMonth() === today.getMonth();
  }

  if (period === "mes anterior") {
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    return serviceDate.getFullYear() === previousMonth.getFullYear() && serviceDate.getMonth() === previousMonth.getMonth();
  }

  return true;
}

function getReportStatusChartItems(services) {
  const statusOrder = ["Pendiente", "Confirmado", "En curso", "Finalizado", "Cancelado", "No show", "No realizado"];
  const counts = new Map(statusOrder.map((status) => [status, 0]));

  services.forEach((service) => {
    const status = getReportServiceStatus(service);
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  return statusOrder
    .map((status) => ({ label: status, value: counts.get(status) || 0, color: reportStatusColorByName[status] }))
    .filter((item) => item.value > 0);
}

function getReportGroupedChartItems(services, getLabel) {
  const counts = new Map();

  services.forEach((service) => {
    const label = getLabel(service) || "Sin datos";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts, ([label, value]) => ({ label, value }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 6);
}

function getReportVehicleRevenueItems(services) {
  const values = new Map();

  services.forEach((service) => {
    const label = service.vehicle || service.vehicleName || "Veh\u00edculo pendiente";
    values.set(label, (values.get(label) || 0) + getReportServicePrice(service));
  });

  return Array.from(values, ([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value)
    .slice(0, 6);
}

function isReportClosedService(service) {
  return REPORT_CLOSED_SERVICE_STATUSES.includes(getReportServiceStatus(service));
}

function getReportServiceStatus(service) {
  const normalizedStatus = normalizeReportText(service?.status);
  const statusByNormalizedName = {
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    "en curso": "En curso",
    finalizado: "Finalizado",
    completado: "Finalizado",
    cancelado: "Cancelado",
    "no show": "No show",
    "no-show": "No show",
    "no realizado": "No realizado",
    "no-realizado": "No realizado",
  };

  return statusByNormalizedName[normalizedStatus] || service?.status || "Sin estado";
}

function getReportStatusAliases(status) {
  const aliasesByStatus = {
    Pendiente: ["pendiente"],
    Confirmado: ["confirmado", "confirmados"],
    "En curso": ["en curso"],
    Finalizado: ["finalizado", "finalizados", "completado", "completados"],
    Cancelado: ["cancelado", "cancelados"],
    "No show": ["no show", "no-show"],
    "No realizado": ["no realizado", "no-realizado"],
  };

  return aliasesByStatus[status] || [normalizeReportText(status)];
}

function getReportServiceDate(service) {
  const match = String(service.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function getReportServicePrice(service) {
  const match = String(service.price || service.amount || "")
    .replace(",", ".")
    .match(/(\d+(?:\.\d+)?)/);

  return match ? Number(match[1]) : 0;
}

function getReportServiceCollaboratorId(service) {
  return service.collaboratorId || service.assignedCollaboratorId || "";
}

function getReportServiceCollaboratorLabel(service) {
  return service.collaborator || service.driver || "Sin conductor";
}

function getReportServiceSearchHaystack(service) {
  const values = [
    service.serviceId,
    service.client,
    service.customerCode,
    service.type,
    service.origin,
    service.destination,
    getReportServiceCollaboratorLabel(service),
    service.vehicle,
    service.plate,
    getReportServiceStatus(service),
    service.closureReason,
    service.closureReasonDetails,
  ];

  return normalizeReportText(values.filter(Boolean).join(" "));
}

function getReportRate(value, total) {
  return total ? (value / total) * 100 : 0;
}

function formatReportPercentage(value) {
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
}

function formatReportCurrency(value) {
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })} EUR`;
}

function formatReportGeneratedAt(generatedAt) {
  if (!generatedAt) {
    return "Generado: no indicado";
  }

  const date = new Date(generatedAt);

  if (Number.isNaN(date.getTime())) {
    return `Generado: ${generatedAt}`;
  }

  return `Generado: ${date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`;
}

function formatReportHistoryDate(value) {
  if (!value) {
    return "No indicado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatReportHistoryRate(value) {
  if (value === undefined || value === null || value === "") {
    return "0%";
  }

  return formatReportPercentage(getReportHistoryNumber(value));
}

function formatReportHistoryValue(value) {
  if (value === undefined || value === null || value === "") {
    return "No indicado";
  }

  return value;
}

function getReportHistoryNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function normalizeReportText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =========================
// Graficos
// =========================

function createReportChart(canvas, chart, size) {
  const existingChart = reportChartInstances.get(canvas.id);

  if (existingChart) {
    existingChart.destroy();
  }

  const chartInstance = new window.Chart(canvas, {
    type: chart.chartType,
    data: {
      labels: chart.items.map((item) => item.label),
      datasets: [
        {
          data: chart.items.map((item) => item.value),
          backgroundColor: chart.items.map((item, index) => item.color || reportChartPalette[index % reportChartPalette.length]),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: size === "modal" ? 24 : 16,
        },
      ],
    },
    options: getReportChartOptions(chart, size),
  });

  reportChartInstances.set(canvas.id, chartInstance);
}

function getReportChartOptions(chart, size) {
  return {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `${formatChartValue(context.raw, chart.unit)}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: "rgba(100, 116, 139, 0.18)",
        },
        ticks: {
          color: "#64748b",
          font: {
            size: size === "modal" ? 12 : 10,
          },
          callback: (value) => formatChartValue(value, chart.unit),
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#25364d",
          font: {
            size: size === "modal" ? 12 : 10,
            weight: "600",
          },
        },
      },
    },
  };
}

// =========================
// Modales
// =========================

function initReportsModalControls() {
  document.addEventListener("click", (event) => {
    const chartButton = event.target.closest("[data-report-chart]");

    if (chartButton) {
      openReportChartModal(chartButton.dataset.reportChart);
    }
  });
}

function openReportChartModal(chartId) {
  const chart = getReportChartData().find((item) => item.id === chartId);
  const modalCanvas = getElement("report-chart-modal-canvas");

  if (!chart || !modalCanvas || !window.Chart) {
    return;
  }

  setText("report-chart-modal-title", chart.title);
  setText("report-chart-modal-description", chart.description);
  setText("report-chart-modal-metric", chart.metric);
  openModal("report-chart-modal");

  if (expandedReportChart) {
    expandedReportChart.destroy();
  }

  expandedReportChart = new window.Chart(modalCanvas, {
    type: chart.chartType,
    data: {
      labels: chart.items.map((item) => item.label),
      datasets: [
        {
          data: chart.items.map((item) => item.value),
          backgroundColor: chart.items.map((item, index) => item.color || reportChartPalette[index % reportChartPalette.length]),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 24,
        },
      ],
    },
    options: getReportChartOptions(chart, "modal"),
  });
}

function openModal(modalId) {
  const modal = getElement(modalId);

  if (modal) {
    modal.hidden = false;
  }
}

// =========================
// Utilidades internas
// =========================

function formatChartValue(value, unit) {
  const numberValue = Number(value);
  const formattedValue = Number.isInteger(numberValue)
    ? numberValue.toLocaleString("es-ES")
    : numberValue.toLocaleString("es-ES", { maximumFractionDigits: 2 });

  if (unit === "EUR") {
    return `${formattedValue} EUR`;
  }

  if (unit === "EUR/km") {
    return `${formattedValue} EUR/km`;
  }

  return `${formattedValue} ${unit}`;
}

function getElement(id) {
  return document.getElementById(id);
}

function initReportsFilterControls() {
  const clearButton = document.querySelector("[data-reports-clear]");
  const searchInput = getElement("reports-search");
  const filterMenu = clearButton?.closest(".customer-filter__menu");

  if (searchInput && !searchInput.dataset.reportsSearchReady) {
    searchInput.dataset.reportsSearchReady = "true";
    searchInput.addEventListener("input", () => {
      reportsViewState.searchTerm = normalizeReportText(searchInput.value);
      renderReportsData();
    });
    searchInput.addEventListener("search", () => {
      reportsViewState.searchTerm = normalizeReportText(searchInput.value);
      renderReportsData();
    });
  }

  if (filterMenu && !filterMenu.dataset.reportsFiltersReady) {
    filterMenu.dataset.reportsFiltersReady = "true";
    filterMenu.addEventListener("change", (event) => {
      if (event.target.matches('input[type="checkbox"]')) {
        renderReportsData();
      }
    });
  }

  if (clearButton && !clearButton.dataset.reportsClearReady) {
    clearButton.dataset.reportsClearReady = "true";
    clearButton.addEventListener("click", () => {
      filterMenu?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = false;
      });
      reportsViewState.searchTerm = "";
      if (searchInput) {
        searchInput.value = "";
      }
      renderReportsData();
    });
  }
}

function initReportsHistoryControls() {
  const historyButton = getElement("reports-history-action");
  const backButton = getElement("reports-history-back");
  const historyList = getElement("reports-history-list");
  const detailBackButton = getElement("reports-history-detail-back");

  if (historyButton && !historyButton.dataset.reportsHistoryReady) {
    historyButton.dataset.reportsHistoryReady = "true";
    historyButton.addEventListener("click", showReportsHistory);
  }

  if (backButton && !backButton.dataset.reportsHistoryReady) {
    backButton.dataset.reportsHistoryReady = "true";
    backButton.addEventListener("click", showReports);
  }

  if (historyList && !historyList.dataset.reportsHistoryReady) {
    historyList.dataset.reportsHistoryReady = "true";
    historyList.addEventListener("click", (event) => {
      const detailButton = event.target.closest("[data-report-history-detail]");

      if (detailButton) {
        showReportsHistoryDetail(detailButton.dataset.reportHistoryDetail);
      }
    });
  }

  if (detailBackButton && !detailBackButton.dataset.reportsHistoryReady) {
    detailBackButton.dataset.reportsHistoryReady = "true";
    detailBackButton.addEventListener("click", showReportsHistory);
  }
}

function renderReportsData() {
  renderReportsSummary();
  renderReportBlocks();
  renderReportCharts();
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

window.ElaraReports = {
  initReports,
  showReports,
};
