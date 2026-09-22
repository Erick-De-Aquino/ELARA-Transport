/*
  Proyecto Atlas / ELARA Transport
  Archivo: driver.js
  Responsabilidad: portal mock mobile-first del colaborador/chofer.
*/

"use strict";

const DRIVER_UNASSOCIATED_MESSAGE = "No existe un conductor asociado a este usuario.";
const DRIVER_NO_PORTAL_ACCESS_MESSAGE = "No tienes acceso al Portal conductor.";
const DRIVER_INACTIVE_USER_MESSAGE = "Tu cuenta est\u00e1 inactiva. Contacta con administraci\u00f3n.";
const DRIVER_MISSING_LINK_MESSAGE = "Tu usuario no tiene un conductor vinculado. Contacta con administraci\u00f3n.";
const DRIVER_LINK_NOT_FOUND_MESSAGE = "No se encontr\u00f3 el perfil de conductor vinculado a tu usuario.";
const DRIVER_IDENTITY_LOADING_MESSAGE = "Resolviendo conductor vinculado...";
const DRIVER_INACTIVE_PROFILE_MESSAGE = "Tu perfil no est\u00e1 activo para operar. Contacta con administraci\u00f3n.";
const DRIVER_PROFILE_LOADING_MESSAGE = "Cargando perfil...";
const DRIVER_PROFILE_ERROR_MESSAGE = "No se pudo cargar tu perfil.";
const DRIVER_PROFILE_DRIVER_TYPE_LABELS = {
  internal_driver: "Conductor interno",
  external_collaborator: "Colaborador externo",
};
const DRIVER_PROFILE_ADMINISTRATIVE_STATUS_LABELS = {
  active: "Activo",
  inactive: "Inactivo",
  suspended: "Suspendido",
  pending_documents: "Pendiente documentacion",
};
const DRIVER_PROFILE_AVAILABILITY_LABELS = {
  available: "Disponible",
  unavailable: "No disponible",
};
const DRIVER_CLOSED_CENTRAL_SERVICE_STATUSES = ["Cancelado", "Finalizado", "No show", "No-show", "No realizado"];
const DRIVER_CENTRAL_STAGE_SEQUENCE = ["en_camino", "esperando_pasajero", "pasajero_a_bordo"];
const DRIVER_REAL_PROGRESS_STAGE_FLOW = {
  on_way: { status: "en_camino", nextStage: "waiting_passenger", successLabel: "Llegada al origen registrada." },
  waiting_passenger: { status: "esperando_pasajero", nextStage: "passenger_on_board", successLabel: "Pasajero a bordo registrado." },
  passenger_on_board: { status: "pasajero_a_bordo", nextStage: "finishing", successLabel: "Llegada al destino registrada." },
  finishing: { status: "en_servicio", nextStage: "finished", successLabel: "Servicio finalizado correctamente." },
  finished: { status: "finalizado", nextStage: "", successLabel: "" },
};
const DRIVER_FINANCE_HISTORY_PAGE_SIZE = 10;
const DRIVER_FINANCE_DEFAULT_HISTORY_DAYS = 30;
const DRIVER_FINANCE_REMITTANCE_SELECT = [
  "id",
  "human_code",
  "status",
  "declared_amount",
  "verified_amount",
  "currency_code",
  "submitted_at",
  "received_at",
  "verified_at",
  "cancelled_at",
  "cancellation_reason",
  "notes",
  "created_at",
].join(",");
const DRIVER_FINANCE_REMITTANCE_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "preparation", label: "En preparacion" },
  { value: "submitted", label: "Enviada" },
  { value: "received", label: "Recibida" },
  { value: "verified", label: "Verificada" },
  { value: "cancelled", label: "Anulada" },
];
const DRIVER_FINANCE_REMITTANCE_STATUS_FILTERS = {
  preparation: ["draft", "prepared"],
  submitted: ["submitted"],
  received: ["received"],
  verified: ["verified"],
  cancelled: ["cancelled"],
};
const DRIVER_FINANCE_REMITTANCE_STATUS_LABELS = {
  draft: "En preparacion",
  prepared: "En preparacion",
  submitted: "Enviada",
  received: "Recibida",
  verified: "Verificada",
  cancelled: "Anulada",
};
const DRIVER_FINANCE_MOCK_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "V\u00e1lida", label: "V\u00e1lida" },
  { value: "Anulada", label: "Anulada" },
];
const DRIVER_EXPENSE_PAGE_SIZE = 10;
const DRIVER_SETTLEMENT_PAGE_SIZE = 10;
const DRIVER_SETTLEMENT_STATUSES = ["Pendiente de aprobaci\u00f3n", "Aprobada", "Pagada", "Para revisi\u00f3n", "Anulada"];
const DRIVER_SETTLEMENT_SUMMARY_SELECT = [
  "settlement_id",
  "human_code",
  "driver_id",
  "period_start",
  "period_end",
  "status",
  "payment_status",
  "currency_code",
  "driver_type_snapshot",
  "frequency_snapshot",
  "gross_eligible_amount",
  "expense_deduction_amount",
  "adjustment_amount",
  "calculation_base_amount",
  "driver_percentage",
  "elara_percentage",
  "driver_amount",
  "paid_amount",
  "pending_amount",
  "completed_payment_count",
  "last_payment_at",
].join(",");
const DRIVER_SETTLEMENT_REAL_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Borrador" },
  { value: "generated", label: "Generada" },
  { value: "submitted", label: "Enviada" },
  { value: "approved", label: "Aprobada" },
  { value: "rejected", label: "Rechazada" },
  { value: "cancelled", label: "Cancelada" },
];
const DRIVER_SETTLEMENT_PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "unpaid", label: "Pendiente de pago" },
  { value: "partial", label: "Pago parcial" },
  { value: "paid", label: "Pagada" },
  { value: "cancelled", label: "Pago cancelado" },
];
const DRIVER_SETTLEMENT_MOCK_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "Pendiente de aprobaci\u00f3n", label: "Pendiente de aprobaci\u00f3n" },
  { value: "Aprobada", label: "Aprobada" },
  { value: "Pagada", label: "Pagada" },
  { value: "Para revisi\u00f3n", label: "Para revisi\u00f3n" },
  { value: "Anulada", label: "Anulada" },
];
const DRIVER_SETTLEMENT_MOCK_COLLECTION_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "pending", label: "Con servicios pendientes de cobro" },
  { value: "settled", label: "Sin servicios pendientes de cobro" },
];
const DRIVER_SETTLEMENT_STATUS_LABELS = {
  draft: "Borrador",
  generated: "Generada",
  submitted: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
const DRIVER_SETTLEMENT_PAYMENT_STATUS_LABELS = {
  unpaid: "Pendiente de pago",
  partial: "Pago parcial",
  paid: "Pagada",
  cancelled: "Pago cancelado",
};
const DRIVER_SETTLEMENT_DRIVER_TYPE_LABELS = {
  internal_driver: "Conductor interno",
  external_collaborator: "Colaborador externo",
};
const DRIVER_SETTLEMENT_FREQUENCY_LABELS = {
  monthly: "Mensual",
  weekly: "Semanal",
};
const DRIVER_SERVICE_OVERVIEW_SELECT = [
  "service_id",
  "human_code",
  "service_type",
  "operational_status",
  "scheduled_start_at",
  "assignment_id",
  "assignment_status",
  "assigned_at",
  "accepted_at",
  "rejected_at",
  "ended_at",
  "vehicle_id",
  "vehicle_human_code",
  "plate_normalized",
  "brand",
  "model",
  "customer_display_name",
  "origin_label",
  "origin_address",
  "origin_city",
  "destination_label",
  "destination_address",
  "destination_city",
  "primary_passenger_name",
  "primary_passenger_phone",
  "driver_stage",
  "driver_stage_updated_at",
  "closure_type",
  "closed_at",
].join(",");
const DRIVER_REAL_SERVICE_ACTION_PENDING_LABEL = "Accion real pendiente";
const DRIVER_EXPENSE_STATUSES = [
  "Pendiente de revisi\u00f3n",
  "Requiere informaci\u00f3n",
  "Aprobada",
  "Aprobada parcialmente",
  "Pendiente de reembolso",
  "Reembolsada",
  "Rechazada",
  "Anulada",
];
const DRIVER_EXPENSE_REAL_REIMBURSEMENT_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "not_applicable", label: "No aplica" },
  { value: "pending", label: "Pendiente de reembolso" },
  { value: "reimbursed", label: "Reembolsado" },
  { value: "cancelled", label: "Reembolso cancelado" },
];
const DRIVER_EXPENSE_REAL_EXPENSE_STATUS_LABELS = {
  draft: "Borrador",
  submitted: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
const DRIVER_EXPENSE_REAL_PAYMENT_STATUS_LABELS = {
  unpaid: "Pendiente",
  partial: "Parcial",
  paid: "Pagado",
  cancelled: "Cancelado",
};
const DRIVER_EXPENSE_REAL_REIMBURSEMENT_STATUS_LABELS = {
  not_applicable: "No aplica",
  pending: "Pendiente de reembolso",
  reimbursed: "Reembolsado",
  cancelled: "Reembolso cancelado",
};

const driverStatusLabels = {
  asignado: "Por aceptar",
  aceptado: "Confirmado",
  en_camino: "En camino",
  esperando_pasajero: "Esperando pasajero",
  pasajero_a_bordo: "Pasajero a bordo",
  en_servicio: "Pasajero a bordo",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  no_show: "No-show",
  no_realizado: "No realizado",
};

const driverStatusClasses = {
  asignado: "status--warning",
  aceptado: "status--success",
  en_camino: "status--warning",
  esperando_pasajero: "status--success",
  pasajero_a_bordo: "status--success",
  en_servicio: "status--success",
  finalizado: "status--neutral",
  cancelado: "status--danger",
  no_show: "status--danger",
  no_realizado: "status--neutral",
};

const finishRatingReasons = [
  { label: "Mala actitud", value: "Mala actitud" },
  { label: "Demor&oacute; mucho", value: "Demor&oacute; mucho" },
  { label: "No pag&oacute; el importe completo", value: "No pag&oacute; el importe completo" },
  { label: "Punto de recogida incorrecto", value: "Punto de recogida incorrecto" },
  { label: "Cambi&oacute; demasiado la ruta", value: "Cambi&oacute; demasiado la ruta" },
];

const noShowRatingReasons = [
  { label: "Emergencia del pasajero", value: "Emergencia del pasajero" },
  { label: "Avis&oacute; tarde", value: "Avis&oacute; tarde" },
  { label: "No respondi&oacute;", value: "No respondi&oacute;" },
  { label: "No se present&oacute;", value: "No se present&oacute;" },
  { label: "Direcci&oacute;n incorrecta", value: "Direcci&oacute;n incorrecta" },
  { label: "Cancel&oacute; en el punto", value: "Cancel&oacute; en el punto" },
];

const driverNoShowReasonOptions = [
  { code: "PASSENGER_NOT_PRESENT", label: "Pasajero no se present\u00f3" },
  { code: "PASSENGER_UNREACHABLE", label: "No fue posible contactar al pasajero" },
  { code: "WRONG_PICKUP_INFORMATION", label: "Informaci\u00f3n incorrecta del punto de recogida" },
  { code: "WAITING_TIME_EXCEEDED", label: "Tiempo de espera excedido" },
  { code: "OTHER", label: "Otro motivo" },
];

let driverServices = [];
let driverProfile = null;
let driverServicesLoadState = {
  driverId: "",
  status: "idle",
  promise: null,
  services: [],
  error: "",
};
let driverProfileLoadState = {
  userKey: "",
  status: "idle",
  promise: null,
  profile: null,
  error: "",
};
let driverFinanceLoadState = {
  driverId: "",
  status: "idle",
  promise: null,
  summary: null,
  remittances: [],
  summaryError: "",
  remittancesError: "",
};
let driverSettlementsLoadState = {
  driverId: "",
  status: "idle",
  promise: null,
  settlements: [],
  error: "",
};
let driverExpensesLoadState = {
  driverId: "",
  status: "idle",
  promise: null,
  expenses: [],
  detailCache: new Map(),
  detailPromises: new Map(),
  error: "",
};
let driverServicesRenderRequestId = 0;
let driverHistoryRenderRequestId = 0;
let driverFinanceRenderRequestId = 0;
let driverSettlementsRenderRequestId = 0;
let driverExpensesRenderRequestId = 0;
let activeServiceId = null;
let isDriverActiveServiceVisible = false;
let selectedServiceId = null;
let editingPickupServiceId = null;
let selectedFinishRating = null;
let finishSlideState = null;
let routeChangeDraft = null;
let selectedFinishMode = "finish";
let driverHistoryFilter = "all";
let expandedHistoryServiceId = null;
let reportingHistoryServiceId = null;
let isDriverProfilePhoneEditing = false;
let pendingDriverAvailabilityPreference = "";
let isDriverProfilePhoneSaving = false;
let isDriverAvailabilityPreferenceSaving = false;
let isDriverUsingCentralServices = false;
let pendingDriverRejectionServiceId = null;
let acceptingRealDriverServiceIds = new Set();
let startingRealDriverServiceIds = new Set();
let advancingRealDriverServiceIds = new Set();
let isDriverServicesUpdatedListenerRegistered = false;
let isDriverFinanceUpdatedListenerRegistered = false;
let isDriverExpensesUpdatedListenerRegistered = false;
let isDriverSettlementsUpdatedListenerRegistered = false;
let isDriverProfileUpdatedListenerRegistered = false;
let driverProfileRenderRequestId = 0;
let driverAccessMessage = DRIVER_UNASSOCIATED_MESSAGE;
let selectedDriverFinanceRemittanceId = "";
let returnToFinanceDetailAfterDiscrepancy = false;
let isSubmittingDriverFinanceDiscrepancy = false;
let isSubmittingDriverFinanceRemittance = false;
let driverFinanceHistoryPage = 1;
let driverFinanceFilters = getDefaultDriverFinanceFilters();
let selectedDriverExpenseId = "";
let driverExpensePage = 1;
let driverExpenseFilters = getDefaultDriverExpenseFilters();
let areDriverExpenseFiltersVisible = false;
let selectedDriverSettlementId = "";
let driverSettlementPage = 1;
let driverSettlementFilters = getDefaultDriverSettlementFilters();
let areDriverSettlementFiltersVisible = false;
let isSubmittingDriverExpense = false;
let isSubmittingDriverExpenseResponse = false;
let driverCashCollectionState = {
  serviceId: "",
  attemptId: "",
  processing: false,
};
let selectedDriverServiceIncidentServiceId = "";
let isSubmittingDriverServiceIncident = false;
let driverExpenseCategoriesLoadState = {
  status: "idle",
  promise: null,
  categories: [],
  error: "",
};
let driverServiceIncidentCategoriesLoadState = {
  status: "idle",
  promise: null,
  categories: [],
  error: "",
};

function renderDriverIcon(name) {
  return window.ElaraIcons && typeof window.ElaraIcons.get === "function" ? window.ElaraIcons.get(name) : "";
}

function initDriver() {
  clearDriverLegacyStorage();
  driverProfile = loadProfile();
  driverServices = driverProfile ? loadServices() : [];
  activeServiceId = getActiveService() ? getActiveService().id : null;
  isDriverActiveServiceVisible = false;
  initDriverServicesUpdatedListener();
  initDriverFinanceUpdatedListener();
  initDriverExpensesUpdatedListener();
  initDriverSettlementsUpdatedListener();
  initDriverProfileUpdatedListener();
  bindDriverEvents();
}

function initDriverServicesUpdatedListener() {
  if (isDriverServicesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:services-updated", refreshDriverVisibleViewFromServicesUpdate);
  isDriverServicesUpdatedListenerRegistered = true;
}

function initDriverFinanceUpdatedListener() {
  if (isDriverFinanceUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:cash-updated", refreshDriverVisibleFinanceView);
  window.addEventListener("elara:remittances-updated", refreshDriverVisibleFinanceView);
  window.addEventListener("elara:admin-incidents-updated", refreshDriverVisibleFinanceView);
  window.addEventListener("elara:auth-session-updated", handleDriverFinanceAuthSessionUpdated);
  isDriverFinanceUpdatedListenerRegistered = true;
}

function initDriverExpensesUpdatedListener() {
  if (isDriverExpensesUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:expenses-updated", refreshDriverVisibleExpensesView);
  window.addEventListener("elara:auth-session-updated", handleDriverExpenseAuthSessionUpdated);
  isDriverExpensesUpdatedListenerRegistered = true;
}

function initDriverSettlementsUpdatedListener() {
  if (isDriverSettlementsUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:settlements-updated", refreshDriverVisibleSettlementsView);
  window.addEventListener("elara:auth-session-updated", handleDriverSettlementAuthSessionUpdated);
  isDriverSettlementsUpdatedListenerRegistered = true;
}

function initDriverProfileUpdatedListener() {
  if (isDriverProfileUpdatedListenerRegistered) {
    return;
  }

  window.addEventListener("elara:auth-session-updated", handleDriverProfileAuthSessionUpdated);
  isDriverProfileUpdatedListenerRegistered = true;
}

function handleDriverProfileAuthSessionUpdated(event) {
  if (event?.detail?.reason === "token_refreshed" && ["loading", "loaded"].includes(driverProfileLoadState.status)) {
    return;
  }

  resetDriverProfileLoadState();
  driverProfile = null;
  isDriverProfilePhoneEditing = false;
  pendingDriverAvailabilityPreference = "";

  if (isDriverProfileViewVisible()) {
    void showDriverProfile();
  }
}

function refreshDriverVisibleViewFromServicesUpdate() {
  const servicesPanel = getElement("mis-servicios");
  const profilePanel = getElement("mi-perfil");
  const historyPanel = getElement("historial");
  const expensesPanel = getElement("mis-gastos");

  if (servicesPanel && !servicesPanel.hidden) {
    showDriverServices();
    return;
  }

  if (profilePanel && !profilePanel.hidden) {
    void showDriverProfile();
    return;
  }

  if (historyPanel && !historyPanel.hidden) {
    showDriverHistory();
    return;
  }

  if (expensesPanel && !expensesPanel.hidden) {
    void showDriverExpenses();
  }
}

function refreshDriverVisibleFinanceView() {
  const financesPanel = getElement("mis-finanzas");

  resetDriverFinanceLoadState();

  if (financesPanel && !financesPanel.hidden) {
    void showDriverFinances();
  }
}

function handleDriverFinanceAuthSessionUpdated() {
  resetDriverFinanceLoadState();
  selectedDriverFinanceRemittanceId = "";
  returnToFinanceDetailAfterDiscrepancy = false;
}

function refreshDriverVisibleExpensesView() {
  const expensesPanel = getElement("mis-gastos");
  const hasOpenDetail = !getElement("driver-expense-detail-modal")?.hidden && selectedDriverExpenseId;

  resetDriverExpensesLoadState();

  const refreshOpenDetail = () => {
    if (!hasOpenDetail || !selectedDriverExpenseId) {
      return;
    }

    if (shouldUseRealDriverExpenses()) {
      void openDriverExpenseDetail(selectedDriverExpenseId);
      return;
    }

    const expense = getDriverExpenseById(selectedDriverExpenseId);

    if (expense) {
      renderDriverExpenseDetail(expense);
    } else {
      closeDriverExpenseModals();
    }
  };

  if (expensesPanel && !expensesPanel.hidden) {
    void showDriverExpenses().then(refreshOpenDetail);
    return;
  }

  refreshOpenDetail();
}

function handleDriverExpenseAuthSessionUpdated() {
  resetDriverExpensesLoadState();
  selectedDriverExpenseId = "";
}

function refreshDriverVisibleSettlementsView() {
  const settlementsPanel = getElement("mis-liquidaciones");
  const refreshOpenDetail = () => {
    if (!getElement("driver-settlement-detail-modal")?.hidden && selectedDriverSettlementId) {
      const settlement = getDriverSettlementById(selectedDriverSettlementId);

      if (settlement) {
        renderDriverSettlementDetail(settlement);
      } else {
        selectedDriverSettlementId = "";
        closeModal("driver-settlement-detail-modal");
      }
    }
  };

  resetDriverSettlementsLoadState();

  if (settlementsPanel && !settlementsPanel.hidden) {
    void showDriverSettlements().then(refreshOpenDetail);
    return;
  }

  refreshOpenDetail();
}
function handleDriverSettlementAuthSessionUpdated() {
  resetDriverSettlementsLoadState();
  selectedDriverSettlementId = "";
}
async function showDriverServices() {
  setDriverActiveMode(false);
  isDriverActiveServiceVisible = false;

  if (!refreshDriverProfile()) {
    renderDriverAccessState("mis-servicios");
    return;
  }

  if (shouldUseRealDriverServices()) {
    await showDriverRealServices();
    return;
  }

  setDriverHeader(
    "Portal colaborador",
    `Hola, ${driverProfile.name}`,
    `${getDriverOperationalStatus()} - Servicios asignados para hoy`,
  );
  renderDriverServices();
}

async function showDriverProfile() {
  setDriverActiveMode(false);
  const profilePanel = getElement("driver-profile-panel");
  const placeholderPanel = getElement("generic-profile-placeholder");
  const currentUser = getDriverAuthenticatedUser();

  if (profilePanel) {
    profilePanel.hidden = false;
  }

  if (placeholderPanel) {
    placeholderPanel.hidden = true;
  }

  if (shouldUseRealDriverProfile(currentUser)) {
    setDriverHeader("Cuenta", "Mi perfil", "Datos reales del conductor autenticado.");
    await showDriverRealProfile();
    return;
  }

  if (!refreshDriverProfile()) {
    renderDriverAccessState("mi-perfil");
    return;
  }

  setDriverHeader("Cuenta", "Mi perfil", "Datos operativos del colaborador. Solo el tel\u00e9fono es editable en este MVP.");
  renderDriverProfile();
}

async function showDriverRealProfile() {
  const requestId = ++driverProfileRenderRequestId;
  renderDriverProfileLoadingState();

  try {
    const profile = await loadDriverRealProfile();

    if (requestId !== driverProfileRenderRequestId || !isDriverProfileViewVisible()) {
      return;
    }

    driverProfile = profile;
    isDriverProfilePhoneEditing = false;
    pendingDriverAvailabilityPreference = "";
    renderDriverProfile();
  } catch (error) {
    if (requestId !== driverProfileRenderRequestId || !isDriverProfileViewVisible()) {
      return;
    }

    driverProfile = null;
    driverProfileLoadState.status = "error";
    driverProfileLoadState.error = DRIVER_PROFILE_ERROR_MESSAGE;
    console.error("[ELARA Driver] No se pudo cargar el perfil real del conductor.", getDriverProfileErrorDetails(error));
    renderDriverProfileErrorState();
  }
}

function renderDriverProfileLoadingState() {
  const container = getElement("driver-profile-card-content");

  if (container) {
    container.innerHTML = `<p class="driver-empty" role="status" aria-live="polite">${escapeHtml(DRIVER_PROFILE_LOADING_MESSAGE)}</p>`;
  }
}

function renderDriverProfileErrorState() {
  const container = getElement("driver-profile-card-content");

  if (container) {
    container.innerHTML = `<p class="driver-empty" role="alert">${escapeHtml(DRIVER_PROFILE_ERROR_MESSAGE)}</p>`;
  }
}

function isDriverProfileViewVisible() {
  const profileView = getElement("mi-perfil");

  return Boolean(profileView && !profileView.hidden);
}

async function showDriverHistory() {
  setDriverActiveMode(false);

  if (!refreshDriverProfile()) {
    renderDriverAccessState("historial");
    return;
  }

  if (shouldUseRealDriverServices()) {
    await showDriverRealHistory();
    return;
  }

  setDriverHeader("", "Historial", "Servicios realizados por el chofer.");
  renderDriverHistory();
}

async function showDriverFinances() {
  setDriverActiveMode(false);

  if (!refreshDriverProfile()) {
    renderDriverAccessState("mis-finanzas");
    return;
  }

  setDriverHeader("Portal conductor", "Mis finanzas", "Consulta tus rendiciones y diferencias financieras.");

  if (shouldUseRealDriverFinances()) {
    await showDriverRealFinances();
    return;
  }

  renderDriverFinances();
}

async function showDriverExpenses() {
  setDriverActiveMode(false);

  if (!refreshDriverProfile()) {
    setDriverExpenseCreateButtonVisibility(false);
    renderDriverAccessState("mis-gastos");
    return;
  }

  setDriverExpenseCreateButtonVisibility(canDriverExpenseAction("expenses:createOwn"));
  setDriverHeader("Portal conductor", "Mis gastos", "Gastos adelantados por ti y estado de reembolso.");

  if (shouldUseRealDriverExpenses()) {
    await showDriverRealExpenses();
    return;
  }

  renderDriverExpenses();
}

async function showDriverSettlements() {
  setDriverActiveMode(false);

  if (!refreshDriverProfile()) {
    renderDriverAccessState("mis-liquidaciones");
    return;
  }

  if (!canDriverSettlementAction("settlements:viewOwn")) {
    driverAccessMessage = DRIVER_NO_PORTAL_ACCESS_MESSAGE;
    renderDriverAccessState("mis-liquidaciones");
    return;
  }

  setDriverHeader("Portal conductor", "Mis liquidaciones", "Consulta tus periodos, servicios incluidos e importes aprobados o pagados.");

  if (shouldUseRealDriverSettlements()) {
    await showDriverRealSettlements();
    return;
  }

  renderDriverSettlements();
}
function renderDriverAccessState(viewName) {
  setDriverActiveMode(false);
  const message = driverAccessMessage || DRIVER_UNASSOCIATED_MESSAGE;
  const title = message === DRIVER_IDENTITY_LOADING_MESSAGE ? "Cargando portal conductor" : "Acceso no disponible";
  setDriverHeader("Portal conductor", title, message);

  const dashboard = getElement("driver-dashboard");
  const activePanel = getElement("driver-active-service");
  const servicesList = getElement("driver-services-list");
  const historyFilters = getElement("driver-history-filters");
  const historyList = getElement("driver-history-list");
  const financesSummary = getElement("driver-finance-summary");
  const financesList = getElement("driver-finance-list");
  const financesMeta = getElement("driver-finance-meta");
  const financesPagination = getElement("driver-finance-pagination");
  const expensesSummary = getElement("driver-expense-summary");
  const expensesList = getElement("driver-expense-list");
  const expensesMeta = getElement("driver-expense-meta");
  const expensesPagination = getElement("driver-expense-pagination");
  const settlementsSummary = getElement("driver-settlement-summary");
  const settlementsList = getElement("driver-settlement-list");
  const settlementsMeta = getElement("driver-settlement-meta");
  const settlementsPagination = getElement("driver-settlement-pagination");
  const profileContent = getElement("driver-profile-card-content");

  if (activePanel) {
    activePanel.hidden = true;
  }

  if (viewName === "mis-servicios") {
    if (dashboard) {
      dashboard.hidden = false;
    }

    if (servicesList) {
      servicesList.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
    }
  }

  if (viewName === "historial") {
    if (historyFilters) {
      historyFilters.innerHTML = "";
    }

    if (historyList) {
      historyList.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
    }
  }

  if (viewName === "mis-finanzas") {
    if (financesSummary) {
      financesSummary.innerHTML = "";
    }

    if (financesMeta) {
      financesMeta.textContent = "";
    }

    if (financesPagination) {
      financesPagination.innerHTML = "";
    }

    if (financesList) {
      financesList.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
    }
  }

  if (viewName === "mis-gastos") {
    setDriverExpenseCreateButtonVisibility(false);

    if (expensesSummary) {
      expensesSummary.innerHTML = "";
    }

    if (expensesMeta) {
      expensesMeta.textContent = "";
    }

    if (expensesPagination) {
      expensesPagination.innerHTML = "";
    }

    if (expensesList) {
      expensesList.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
    }
  }

  if (viewName === "mis-liquidaciones") {
    if (settlementsSummary) {
      settlementsSummary.innerHTML = "";
    }

    if (settlementsMeta) {
      settlementsMeta.textContent = "";
    }

    if (settlementsPagination) {
      settlementsPagination.innerHTML = "";
    }

    if (settlementsList) {
      settlementsList.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
    }
  }

  if (viewName === "mi-perfil" && profileContent) {
    profileContent.innerHTML = `<p class="driver-empty">${escapeHtml(message)}</p>`;
  }
}

function bindDriverEvents() {
  document.addEventListener("click", (event) => {
    const modalClose = event.target.closest("[data-modal-close]");

    if (modalClose && modalClose.closest("#driver-route-change-modal")) {
      discardRouteChangeDraft();
    }

    const driverFinanceModal = event.target.closest("#driver-finance-remittance-modal, #driver-finance-detail-modal, #driver-finance-discrepancy-modal");

    if (driverFinanceModal && (modalClose || event.target === driverFinanceModal)) {
      if (driverFinanceModal.id === "driver-finance-discrepancy-modal") {
        closeDriverFinanceDiscrepancyModal({ returnToDetail: true });
      } else if (driverFinanceModal.id === "driver-finance-remittance-modal") {
        closeDriverFinanceRemittanceModal();
      } else {
        closeModal(driverFinanceModal);
      }
      return;
    }

    const driverExpenseModal = event.target.closest("#driver-expense-detail-modal, #driver-expense-new-modal, #driver-expense-response-modal");

    if (driverExpenseModal && (modalClose || event.target === driverExpenseModal)) {
      closeModal(driverExpenseModal);
      return;
    }

    const driverSettlementModal = event.target.closest("#driver-settlement-detail-modal");

    if (driverSettlementModal && (modalClose || event.target === driverSettlementModal)) {
      closeModal(driverSettlementModal);
      selectedDriverSettlementId = "";
      return;
    }

    const driverServiceIncidentModal = event.target.closest("#driver-service-incident-modal");

    if (driverServiceIncidentModal && (modalClose || event.target === driverServiceIncidentModal)) {
      closeDriverServiceIncidentModal();
      return;
    }

    const serviceRouteLink = event.target.closest('[data-route="mis-servicios"]');

    if (serviceRouteLink && isDriverServicesViewVisible() && isDriverActiveServiceVisible) {
      isDriverActiveServiceVisible = false;
      renderDriverServices();
      return;
    }

    const action = event.target.closest("[data-driver-action], [data-driver-availability-preference]");
    const historyCard = event.target.closest("[data-driver-history-card]");

    if (!action) {
      if (historyCard && !event.target.closest("button, a, input, textarea, select, label")) {
        toggleHistoryCard(historyCard.dataset.serviceId);
      }

      return;
    }

    const serviceId = action.dataset.serviceId;

    if (action.dataset.driverAction === "accept") {
      void acceptDriverAssignment(serviceId);
      return;
    }

    if (action.dataset.driverAction === "reject") {
      requestDriverAssignmentRejection(serviceId);
      return;
    }

    if (action.dataset.driverAction === "cancel-reject-assignment") {
      pendingDriverRejectionServiceId = null;
      renderDriverServices();
      return;
    }

    if (action.dataset.driverAction === "confirm-reject-assignment") {
      confirmDriverAssignmentRejection(serviceId);
      return;
    }

    if (action.dataset.driverAction === "start") {
      void startService(serviceId);
      return;
    }

    if (action.dataset.driverAction === "active") {
      showActiveService(serviceId);
      return;
    }

    if (action.dataset.driverAction === "detail") {
      openServiceDetail(serviceId);
      return;
    }

    if (action.dataset.driverAction === "history-detail") {
      openHistoryDetail(serviceId);
      return;
    }

    if (action.dataset.driverAction === "history-close") {
      collapseHistoryCard(serviceId);
      return;
    }

    if (action.dataset.driverAction === "history-report") {
      showHistoryIncidentForm(serviceId);
      return;
    }

    if (action.dataset.driverAction === "history-send-incident") {
      sendHistoryIncident(serviceId);
      return;
    }

    if (action.dataset.driverAction === "history-filter") {
      driverHistoryFilter = action.dataset.historyFilter || "all";
      expandedHistoryServiceId = null;
      reportingHistoryServiceId = null;
      renderDriverHistory();
      return;
    }

    if (action.dataset.driverAction === "finance-clear-filters") {
      clearDriverFinanceFilters();
      return;
    }

    if (action.dataset.driverAction === "finance-page") {
      driverFinanceHistoryPage = Number(action.dataset.financePage) || 1;
      renderDriverFinances();
      return;
    }

    if (action.dataset.driverAction === "finance-detail") {
      openDriverFinanceRemittanceDetail(action.dataset.remittanceId || "");
      return;
    }

    if (action.dataset.driverAction === "finance-new-remittance") {
      openDriverFinanceRemittanceSubmitModal();
      return;
    }

    if (action.dataset.driverAction === "finance-report-discrepancy") {
      openDriverFinanceDiscrepancyModal(selectedDriverFinanceRemittanceId);
      return;
    }

    if (action.dataset.driverAction === "expense-toggle-filters") {
      toggleDriverExpenseFilters();
      return;
    }

    if (action.dataset.driverAction === "expense-clear-filters") {
      clearDriverExpenseFilters();
      return;
    }

    if (action.dataset.driverAction === "expense-page") {
      driverExpensePage = Number(action.dataset.expensePage) || 1;
      renderDriverExpenses();
      return;
    }

    if (action.dataset.driverAction === "expense-detail") {
      openDriverExpenseDetail(action.dataset.expenseId || "");
      return;
    }

    if (action.dataset.driverAction === "expense-new") {
      openDriverExpenseNewModal();
      return;
    }

    if (action.dataset.driverAction === "settlement-toggle-filters") {
      toggleDriverSettlementFilters();
      return;
    }

    if (action.dataset.driverAction === "settlement-clear-filters") {
      clearDriverSettlementFilters();
      return;
    }

    if (action.dataset.driverAction === "settlement-page") {
      driverSettlementPage = Number(action.dataset.settlementPage) || 1;
      renderDriverSettlements();
      return;
    }

    if (action.dataset.driverAction === "settlement-detail") {
      openDriverSettlementDetail(action.dataset.settlementId || "");
      return;
    }

    if (action.dataset.driverAction === "expense-respond") {
      openDriverExpenseResponseModal(selectedDriverExpenseId);
      return;
    }

    if (action.dataset.driverAction === "route-change") {
      openRouteChange(serviceId || activeServiceId);
      return;
    }

    if (action.dataset.driverAction === "edit-pickup") {
      editingPickupServiceId = serviceId || activeServiceId;
      renderDriverServices();
      return;
    }

    if (action.dataset.driverAction === "save-pickup") {
      savePickupEdit(serviceId || activeServiceId);
      return;
    }

    if (action.dataset.driverAction === "cancel-pickup") {
      editingPickupServiceId = null;
      renderDriverServices();
      return;
    }

    if (action.dataset.driverAction === "no-show") {
      openNoShowModal(serviceId || activeServiceId);
      return;
    }

    if (action.dataset.driverAction === "service-incident") {
      void openDriverServiceIncidentModal(serviceId || activeServiceId);
      return;
    }

    if (action.dataset.driverAction === "cancel-finish-rating") {
      resetFinishRatingFlow();
      return;
    }

    if (action.dataset.driverAction === "finish") {
      openFinishService(serviceId || activeServiceId);
      return;
    }

    if (action.dataset.driverAction === "cancel-cash-collection") {
      cancelDriverCashCollection();
      return;
    }

    if (action.dataset.driverAction === "cash-collected") {
      confirmDriverCashCollection();
      return;
    }

    if (action.dataset.driverAction === "cash-not-collected") {
      openDriverCashIncidentModal();
      return;
    }

    if (action.dataset.driverAction === "back-to-cash-collection") {
      closeModal("driver-cash-incident-modal");
      openModal("driver-cash-collection-modal");
      return;
    }

    if (action.dataset.driverAction === "back-to-list") {
      isDriverActiveServiceVisible = false;
      renderDriverServices();
      return;
    }

    if (action.dataset.driverAction === "copy-phone") {
      copyPassengerPhone(action.dataset.phone || "");
      return;
    }

    if (action.dataset.driverAction === "profile-phone-edit") {
      editDriverProfilePhone();
      return;
    }

    if (action.dataset.driverAction === "profile-phone-save") {
      saveDriverProfilePhone();
      return;
    }

    if (action.dataset.driverAction === "profile-phone-cancel") {
      cancelDriverProfilePhoneEdit();
      return;
    }

    if (action.dataset.driverAvailabilityPreference) {
      requestDriverAvailabilityPreferenceChange(action.dataset.driverAvailabilityPreference);
      return;
    }

    if (action.dataset.driverAction === "confirm-availability-change") {
      confirmDriverAvailabilityPreferenceChange();
      return;
    }

    if (action.dataset.driverAction === "cancel-availability-change") {
      cancelDriverAvailabilityPreferenceChange();
      return;
    }

    if (action.dataset.driverAction === "pending") {
      window.ElaraNotifications.showToast("Pendiente de desarrollo.", "info");
    }
  });

  document.addEventListener("pointerdown", startFinishSlide);
  document.addEventListener("pointermove", moveFinishSlide);
  document.addEventListener("pointerup", endFinishSlide);
  document.addEventListener("pointercancel", cancelFinishSlide);
  document.addEventListener("keydown", handleFinishSlideKeydown);
  document.addEventListener("keydown", handleHistoryCardKeydown);
  document.addEventListener("keydown", handleDriverFinanceKeydown);
  document.addEventListener("keydown", handleDriverExpenseKeydown);
  document.addEventListener("keydown", handleDriverSettlementKeydown);

  const routeForm = document.getElementById("driver-route-change-form");
  const routeDestinationInput = document.getElementById("driver-new-destination");
  const finishForm = document.getElementById("driver-finish-form");
  const cashIncidentForm = document.getElementById("driver-cash-incident-form");
  const serviceIncidentForm = document.getElementById("driver-service-incident-form");
  const serviceIncidentDescription = document.getElementById("driver-service-incident-description");
  const profileForm = document.getElementById("driver-profile-form");
  const financeDiscrepancyForm = document.getElementById("driver-finance-discrepancy-form");
  const financeRemittanceForm = document.getElementById("driver-finance-remittance-form");
  const expenseNewForm = document.getElementById("driver-expense-new-form");
  const expenseResponseForm = document.getElementById("driver-expense-response-form");
  const financeFilterFields = [
    document.getElementById("driver-finance-filter-status"),
    document.getElementById("driver-finance-filter-from"),
    document.getElementById("driver-finance-filter-to"),
    document.getElementById("driver-finance-filter-id"),
  ];
  const expenseFilterFields = [
    document.getElementById("driver-expense-filter-status"),
    document.getElementById("driver-expense-filter-category"),
    document.getElementById("driver-expense-filter-from"),
    document.getElementById("driver-expense-filter-to"),
    document.getElementById("driver-expense-filter-query"),
  ];
  const settlementFilterFields = [
    document.getElementById("driver-settlement-filter-status"),
    document.getElementById("driver-settlement-filter-from"),
    document.getElementById("driver-settlement-filter-to"),
    document.getElementById("driver-settlement-filter-query"),
    document.getElementById("driver-settlement-filter-collection"),
  ];

  if (routeForm) {
    routeForm.addEventListener("submit", saveRouteChange);
    routeForm.addEventListener("click", handleRouteChangeClick);
  }

  if (routeDestinationInput) {
    routeDestinationInput.addEventListener("input", clearRouteChangeError);
  }

  if (finishForm) {
    finishForm.addEventListener("submit", finishActiveService);
    finishForm.addEventListener("click", handleFinishRatingClick);
  }

  if (cashIncidentForm) {
    cashIncidentForm.addEventListener("submit", submitDriverCashIncident);
    cashIncidentForm.addEventListener("change", handleDriverCashIncidentChange);
  }

  if (serviceIncidentForm) {
    serviceIncidentForm.addEventListener("submit", submitDriverServiceIncident);
  }

  if (serviceIncidentDescription) {
    serviceIncidentDescription.addEventListener("input", clearDriverServiceIncidentError);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", saveDriverProfile);
  }

  if (financeDiscrepancyForm) {
    financeDiscrepancyForm.addEventListener("submit", submitDriverFinanceDiscrepancy);
  }

  if (financeRemittanceForm) {
    financeRemittanceForm.addEventListener("submit", submitDriverFinanceRemittance);
  }

  if (expenseNewForm) {
    expenseNewForm.addEventListener("submit", submitDriverExpenseRequest);
  }

  if (expenseResponseForm) {
    expenseResponseForm.addEventListener("submit", submitDriverExpenseResponse);
  }

  financeFilterFields.forEach((field) => {
    field?.addEventListener(field.type === "search" ? "input" : "change", handleDriverFinanceFilterChange);
  });

  expenseFilterFields.forEach((field) => {
    field?.addEventListener(field.type === "search" ? "input" : "change", handleDriverExpenseFilterChange);
  });

  settlementFilterFields.forEach((field) => {
    field?.addEventListener(field.type === "search" ? "input" : "change", handleDriverSettlementFilterChange);
  });

  document.getElementById("driver-expense-new-service")?.addEventListener("change", syncDriverExpenseVehicleFromService);
}

function handleDriverFinanceKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const modal = document.querySelector("#driver-finance-remittance-modal:not([hidden]), #driver-finance-discrepancy-modal:not([hidden]), #driver-finance-detail-modal:not([hidden])");

  if (modal) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (modal.id === "driver-finance-discrepancy-modal") {
      closeDriverFinanceDiscrepancyModal({ returnToDetail: true });
    } else if (modal.id === "driver-finance-remittance-modal") {
      closeDriverFinanceRemittanceModal();
    } else {
      closeModal(modal);
    }
  }
}

function handleDriverExpenseKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const modal = document.querySelector("#driver-expense-response-modal:not([hidden]), #driver-expense-new-modal:not([hidden]), #driver-expense-detail-modal:not([hidden])");

  if (modal) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal(modal);
  }
}

function handleDriverSettlementKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  const modal = document.querySelector("#driver-settlement-detail-modal:not([hidden])");

  if (modal) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal(modal);
    selectedDriverSettlementId = "";
  }
}

function shouldUseRealDriverProfile(user = getDriverAuthenticatedUser()) {
  return Boolean(
    window.ElaraSupabase?.client &&
      window.ElaraAuth &&
      typeof window.ElaraAuth.getCurrentDriverIdentity === "function" &&
      isRealDriverAuthUser(user) &&
      !getDriverUserAccessMessage(user)
  );
}

function shouldUseRealDriverServices() {
  const user = getDriverAuthenticatedUser();

  return Boolean(
    window.ElaraSupabase?.client &&
      driverProfile?.id &&
      getDriverAuthUserActiveContext(user) === "conductor" &&
      user?.driverIdentityStatus === "resolved" &&
      String(user?.driverId || "").trim() === driverProfile.id
  );
}

function shouldUseRealDriverFinances() {
  const user = getDriverAuthenticatedUser();

  return Boolean(
    window.ElaraSupabase?.client &&
      driverProfile?.id &&
      getDriverAuthUserActiveContext(user) === "conductor" &&
      user?.driverIdentityStatus === "resolved" &&
      String(user?.driverId || "").trim() === driverProfile.id
  );
}
function shouldUseRealDriverSettlements() {
  const user = getDriverAuthenticatedUser();

  return Boolean(
    window.ElaraSupabase?.client &&
      driverProfile?.id &&
      getDriverAuthUserActiveContext(user) === "conductor" &&
      user?.driverIdentityStatus === "resolved" &&
      String(user?.driverId || "").trim() === driverProfile.id
  );
}

function shouldUseRealDriverExpenses() {
  const user = getDriverAuthenticatedUser();

  return Boolean(
    window.ElaraSupabase?.client &&
      driverProfile?.id &&
      getDriverAuthUserActiveContext(user) === "conductor" &&
      user?.driverIdentityStatus === "resolved" &&
      String(user?.driverId || "").trim() === driverProfile.id
  );
}

function shouldUseRealDriverServiceIncidents() {
  return shouldUseRealDriverServices();
}

async function showDriverRealExpenses() {
  const requestId = ++driverExpensesRenderRequestId;

  renderDriverExpenseLoadingState();
  await loadDriverExpenses().catch((error) => {
    console.error("[ELARA Driver] No se pudieron cargar los gastos reales del conductor.", { error: error?.message || error });
  });

  if (requestId !== driverExpensesRenderRequestId || !isDriverExpensesViewVisible()) {
    return;
  }

  renderDriverExpenses();
}

function isDriverExpensesViewVisible() {
  const expensesPanel = getElement("mis-gastos");
  return Boolean(expensesPanel && !expensesPanel.hidden);
}

function resetDriverExpensesLoadState() {
  driverExpensesLoadState = {
    driverId: "",
    status: "idle",
    promise: null,
    expenses: [],
    detailCache: new Map(),
    detailPromises: new Map(),
    error: "",
  };
}

function isDriverExpensesLoading() {
  return shouldUseRealDriverExpenses() && driverExpensesLoadState.status === "loading";
}

async function loadDriverExpenses(options = {}) {
  const driverId = driverProfile?.id || "";

  if (!driverId || !shouldUseRealDriverExpenses()) {
    return [];
  }

  if (!options.force && driverExpensesLoadState.status === "loaded" && driverExpensesLoadState.driverId === driverId) {
    return driverExpensesLoadState.expenses.slice();
  }

  if (!options.force && driverExpensesLoadState.status === "loading" && driverExpensesLoadState.driverId === driverId && driverExpensesLoadState.promise) {
    return driverExpensesLoadState.promise;
  }

  driverExpensesLoadState = {
    driverId,
    status: "loading",
    promise: fetchDriverExpenseRows().then((rows) => rows.map(adaptDriverExpenseRow)),
    expenses: [],
    detailCache: new Map(),
    detailPromises: new Map(),
    error: "",
  };

  try {
    const expenses = await driverExpensesLoadState.promise;
    driverExpensesLoadState = {
      driverId,
      status: "loaded",
      promise: null,
      expenses: expenses.slice(),
      detailCache: new Map(),
      detailPromises: new Map(),
      error: "",
    };
    return expenses;
  } catch (error) {
    driverExpensesLoadState = {
      driverId,
      status: "error",
      promise: null,
      expenses: [],
      detailCache: new Map(),
      detailPromises: new Map(),
      error: error?.message || "driver-expenses-error",
    };
    throw error;
  }
}

async function fetchDriverExpenseRows() {
  const { data, error } = await window.ElaraSupabase.client.rpc("get_driver_expenses");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function loadDriverExpenseCategories(options = {}) {
  if (!shouldUseRealDriverExpenses()) {
    return [];
  }

  if (!options.force && driverExpenseCategoriesLoadState.status === "loaded") {
    return driverExpenseCategoriesLoadState.categories.slice();
  }

  if (!options.force && driverExpenseCategoriesLoadState.status === "loading" && driverExpenseCategoriesLoadState.promise) {
    return driverExpenseCategoriesLoadState.promise;
  }

  driverExpenseCategoriesLoadState = {
    status: "loading",
    promise: fetchDriverExpenseCategoryRows().then((rows) => rows.map(adaptDriverExpenseCategoryRow)),
    categories: [],
    error: "",
  };

  try {
    const categories = await driverExpenseCategoriesLoadState.promise;
    driverExpenseCategoriesLoadState = {
      status: "loaded",
      promise: null,
      categories: categories.slice(),
      error: "",
    };
    return categories;
  } catch (error) {
    driverExpenseCategoriesLoadState = {
      status: "error",
      promise: null,
      categories: [],
      error: error?.message || "driver-expense-categories-error",
    };
    throw error;
  }
}

async function fetchDriverExpenseCategoryRows() {
  const { data, error } = await window.ElaraSupabase.client
    .from("expense_categories")
    .select("key,name_es,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_es", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function adaptDriverExpenseCategoryRow(row) {
  return {
    value: String(row?.key || "").trim(),
    label: String(row?.name_es || row?.key || "").trim(),
  };
}
async function loadDriverExpenseDetail(expenseId) {
  const id = String(expenseId || "").trim();

  if (!id || !shouldUseRealDriverExpenses()) {
    return null;
  }

  const cached = driverExpensesLoadState.detailCache.get(id);
  if (cached) {
    return { ...cached };
  }

  const existingPromise = driverExpensesLoadState.detailPromises.get(id);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = fetchDriverExpenseDetailRow(id).then((row) => {
    const detail = row ? adaptDriverExpenseRow(row, { detail: true }) : null;

    if (detail) {
      driverExpensesLoadState.detailCache.set(id, detail);
      driverExpensesLoadState.detailCache.set(detail.expenseId, detail);
      if (detail.expenseUuid) {
        driverExpensesLoadState.detailCache.set(detail.expenseUuid, detail);
      }
    }

    return detail;
  });

  driverExpensesLoadState.detailPromises.set(id, promise);

  try {
    return await promise;
  } finally {
    driverExpensesLoadState.detailPromises.delete(id);
  }
}

async function fetchDriverExpenseDetailRow(expenseId) {
  const { data, error } = await window.ElaraSupabase.client.rpc("get_driver_expense_detail", {
    p_expense_id: expenseId,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data[0] || null : data || null;
}
function adaptDriverExpenseRow(row, options = {}) {
  const rawStatus = String(row?.status || "").trim();
  const rawPaymentStatus = String(row?.payment_status || "").trim();
  const rawReimbursementStatus = String(row?.reimbursement_status || "").trim();
  const amount = getDriverExpenseAmount(row?.amount);
  const reimbursedAmount = row?.reimbursed_amount === null || row?.reimbursed_amount === undefined ? null : getDriverExpenseAmount(row.reimbursed_amount);
  const expenseId = row?.human_code || row?.expense_id || "";

  return {
    isRealDriverExpense: true,
    expenseId,
    expenseUuid: row?.expense_id || "",
    humanCode: row?.human_code || "",
    expenseDate: row?.expense_date || "",
    categoryId: row?.category_id || "",
    categoryKey: row?.category_key || "",
    category: row?.category_name || row?.category_key || "-",
    concept: row?.description || expenseId,
    description: row?.description || "",
    amount,
    amountRequested: amount,
    amountApproved: rawStatus === "approved" ? amount : null,
    currencyCode: String(row?.currency_code || "").trim().toUpperCase(),
    rawStatus,
    status: DRIVER_EXPENSE_REAL_EXPENSE_STATUS_LABELS[rawStatus] || rawStatus || "-",
    rawPaymentStatus,
    paymentStatus: DRIVER_EXPENSE_REAL_PAYMENT_STATUS_LABELS[rawPaymentStatus] || rawPaymentStatus || "-",
    rawReimbursementStatus,
    reimbursementStatus: DRIVER_EXPENSE_REAL_REIMBURSEMENT_STATUS_LABELS[rawReimbursementStatus] || rawReimbursementStatus || "-",
    approvedAt: row?.approved_at || "",
    rejectedAt: row?.rejected_at || "",
    rejectionReason: options.detail ? row?.rejection_reason || "" : "",
    cancelledAt: row?.cancelled_at || "",
    createdAt: row?.created_at || "",
    updatedAt: row?.updated_at || "",
    serviceHumanCode: row?.service_human_code || "",
    vehicleHumanCode: row?.vehicle_human_code || "",
    serviceId: row?.service_human_code || "",
    vehicleId: row?.vehicle_human_code || "",
    reimbursedAmount,
    lastReimbursedAt: row?.last_reimbursed_at || "",
    completedReimbursementCount: Number(row?.completed_reimbursement_count) || 0,
    reimbursement: {
      required: Boolean(row?.reimbursable),
      rawStatus: rawReimbursementStatus,
      status: DRIVER_EXPENSE_REAL_REIMBURSEMENT_STATUS_LABELS[rawReimbursementStatus] || rawReimbursementStatus || "-",
      amount: reimbursedAmount,
      paidAt: row?.last_reimbursed_at || "",
      completedCount: Number(row?.completed_reimbursement_count) || 0,
    },
  };
}
async function showDriverRealSettlements() {
  const requestId = ++driverSettlementsRenderRequestId;

  renderDriverSettlementLoadingState();
  await loadDriverSettlements().catch((error) => {
    console.error("[ELARA Driver] No se pudieron cargar las liquidaciones reales del conductor.", { error: error?.message || error });
  });

  if (requestId !== driverSettlementsRenderRequestId || !isDriverSettlementsViewVisible()) {
    return;
  }

  renderDriverSettlements();
}

function isDriverSettlementsViewVisible() {
  const settlementsPanel = getElement("mis-liquidaciones");
  return Boolean(settlementsPanel && !settlementsPanel.hidden);
}

function resetDriverSettlementsLoadState() {
  driverSettlementsLoadState = {
    driverId: "",
    status: "idle",
    promise: null,
    settlements: [],
    error: "",
  };
}

function isDriverSettlementsLoading() {
  return shouldUseRealDriverSettlements() && driverSettlementsLoadState.status === "loading";
}

async function loadDriverSettlements(options = {}) {
  const driverId = driverProfile?.id || "";

  if (!driverId || !shouldUseRealDriverSettlements()) {
    return [];
  }

  if (!options.force && driverSettlementsLoadState.status === "loaded" && driverSettlementsLoadState.driverId === driverId) {
    return driverSettlementsLoadState.settlements.slice();
  }

  if (!options.force && driverSettlementsLoadState.status === "loading" && driverSettlementsLoadState.driverId === driverId && driverSettlementsLoadState.promise) {
    return driverSettlementsLoadState.promise;
  }

  driverSettlementsLoadState = {
    driverId,
    status: "loading",
    promise: fetchDriverSettlementSummaryRows().then((rows) => rows.map(adaptDriverSettlementSummaryRow)),
    settlements: [],
    error: "",
  };

  try {
    const settlements = await driverSettlementsLoadState.promise;
    driverSettlementsLoadState = {
      driverId,
      status: "loaded",
      promise: null,
      settlements: settlements.slice(),
      error: "",
    };
    return settlements;
  } catch (error) {
    driverSettlementsLoadState = {
      driverId,
      status: "error",
      promise: null,
      settlements: [],
      error: error?.message || "driver-settlements-error",
    };
    throw error;
  }
}

async function fetchDriverSettlementSummaryRows() {
  const { data, error } = await window.ElaraSupabase.client
    .from("v_driver_settlement_summary")
    .select(DRIVER_SETTLEMENT_SUMMARY_SELECT)
    .order("period_end", { ascending: false, nullsFirst: false })
    .order("period_start", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function adaptDriverSettlementSummaryRow(row) {
  const rawStatus = String(row?.status || "").trim();
  const rawPaymentStatus = String(row?.payment_status || "").trim();
  const currencyCode = String(row?.currency_code || "").trim().toUpperCase();

  return {
    settlementId: row?.human_code || row?.settlement_id || "",
    settlementUuid: row?.settlement_id || "",
    humanCode: row?.human_code || "",
    driverId: row?.driver_id || "",
    periodStart: row?.period_start || "",
    periodEnd: row?.period_end || "",
    rawStatus,
    status: DRIVER_SETTLEMENT_STATUS_LABELS[rawStatus] || rawStatus || "-",
    rawPaymentStatus,
    paymentStatus: DRIVER_SETTLEMENT_PAYMENT_STATUS_LABELS[rawPaymentStatus] || rawPaymentStatus || "-",
    currencyCode,
    driverTypeSnapshot: row?.driver_type_snapshot || "",
    frequencySnapshot: row?.frequency_snapshot || "",
    driverType: DRIVER_SETTLEMENT_DRIVER_TYPE_LABELS[row?.driver_type_snapshot] || row?.driver_type_snapshot || "-",
    periodType: DRIVER_SETTLEMENT_FREQUENCY_LABELS[row?.frequency_snapshot] || row?.frequency_snapshot || "-",
    grossEligibleAmount: Number(row?.gross_eligible_amount) || 0,
    expenseDeductionAmount: Number(row?.expense_deduction_amount) || 0,
    adjustmentAmount: Number(row?.adjustment_amount) || 0,
    calculationBaseAmount: Number(row?.calculation_base_amount) || 0,
    driverPercentage: Number(row?.driver_percentage) || 0,
    elaraPercentage: Number(row?.elara_percentage) || 0,
    driverAmount: Number(row?.driver_amount) || 0,
    paidAmount: Number(row?.paid_amount) || 0,
    pendingAmount: Number(row?.pending_amount) || 0,
    completedPaymentCount: Number(row?.completed_payment_count) || 0,
    lastPaymentAt: row?.last_payment_at || "",
    createdAt: row?.period_end || row?.period_start || "",
    payment: {
      status: DRIVER_SETTLEMENT_PAYMENT_STATUS_LABELS[rawPaymentStatus] || rawPaymentStatus || "-",
      amount: Number(row?.paid_amount) || 0,
      paidAt: row?.last_payment_at || "",
      completedPaymentCount: Number(row?.completed_payment_count) || 0,
    },
    percentageSnapshot: {
      appliedPercentage: Number(row?.driver_percentage) || 0,
      mode: "snapshot",
    },
    totals: {
      grossEligibleAmount: Number(row?.gross_eligible_amount) || 0,
      expenseDeductionAmount: Number(row?.expense_deduction_amount) || 0,
      adjustmentAmount: Number(row?.adjustment_amount) || 0,
      calculationBaseAmount: Number(row?.calculation_base_amount) || 0,
      driverAmount: Number(row?.driver_amount) || 0,
      paidAmount: Number(row?.paid_amount) || 0,
      pendingAmount: Number(row?.pending_amount) || 0,
      servicesCount: 0,
      pendingCollectionAmount: 0,
      liquidableMargin: Number(row?.calculation_base_amount) || 0,
    },
    serviceItems: [],
    returnHistory: [],
  };
}

async function showDriverRealFinances() {
  const requestId = ++driverFinanceRenderRequestId;

  renderDriverFinanceLoadingState();
  await loadDriverCashFinances();

  if (requestId !== driverFinanceRenderRequestId || !isDriverFinancesViewVisible()) {
    return;
  }

  renderDriverFinances();
}

function isDriverFinancesViewVisible() {
  const financesPanel = getElement("mis-finanzas");
  return Boolean(financesPanel && !financesPanel.hidden);
}

function resetDriverFinanceLoadState() {
  driverFinanceLoadState = {
    driverId: "",
    status: "idle",
    promise: null,
    summary: null,
    remittances: [],
    summaryError: "",
    remittancesError: "",
  };
}

function isDriverFinanceLoading() {
  return shouldUseRealDriverFinances() && driverFinanceLoadState.status === "loading";
}

async function loadDriverCashFinances(options = {}) {
  const driverId = driverProfile?.id || "";

  if (!driverId || !shouldUseRealDriverFinances()) {
    return { summary: null, remittances: [], summaryError: "", remittancesError: "" };
  }

  if (!options.force && driverFinanceLoadState.status === "loaded" && driverFinanceLoadState.driverId === driverId) {
    return {
      summary: driverFinanceLoadState.summary,
      remittances: driverFinanceLoadState.remittances.slice(),
      summaryError: driverFinanceLoadState.summaryError,
      remittancesError: driverFinanceLoadState.remittancesError,
    };
  }

  if (!options.force && driverFinanceLoadState.status === "loading" && driverFinanceLoadState.driverId === driverId && driverFinanceLoadState.promise) {
    return driverFinanceLoadState.promise;
  }

  const promise = Promise.allSettled([loadDriverCashFinanceSummary(), loadDriverCashFinanceRemittances()]).then(([summaryResult, remittancesResult]) => {
    const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
    const remittances = remittancesResult.status === "fulfilled" ? remittancesResult.value : [];
    let summaryError = summaryResult.status === "rejected" ? summaryResult.reason?.message || "driver-cash-summary-error" : "";
    let remittancesError = remittancesResult.status === "rejected" ? remittancesResult.reason?.message || "driver-cash-remittances-error" : "";

    if (summary?.currencyCode) {
      const mismatch = remittances.some((remittance) => remittance.currencyCode && remittance.currencyCode !== summary.currencyCode);

      if (mismatch) {
        remittancesError = remittancesError || "driver-cash-currency-mismatch";
      }
    }

    return { summary, remittances, summaryError, remittancesError };
  });

  driverFinanceLoadState = {
    driverId,
    status: "loading",
    promise,
    summary: null,
    remittances: [],
    summaryError: "",
    remittancesError: "",
  };

  const result = await promise;
  driverFinanceLoadState = {
    driverId,
    status: "loaded",
    promise: null,
    summary: result.summary,
    remittances: result.remittances.slice(),
    summaryError: result.summaryError,
    remittancesError: result.remittancesError,
  };

  if (result.summaryError) {
    console.error("[ELARA Driver] No se pudo cargar el resumen real de caja del conductor.", { error: result.summaryError });
  }

  if (result.remittancesError) {
    console.error("[ELARA Driver] No se pudo cargar el historial real de rendiciones del conductor.", { error: result.remittancesError });
  }

  return result;
}

async function loadDriverCashFinanceSummary() {
  const { data, error } = await window.ElaraSupabase.client.rpc("get_driver_cash_finance_summary");

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return adaptDriverCashFinanceSummary(row || {});
}

async function loadDriverCashFinanceRemittances() {
  const { data, error } = await window.ElaraSupabase.client
    .from("cash_remittances")
    .select(DRIVER_FINANCE_REMITTANCE_SELECT)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(adaptDriverCashRemittanceRow) : [];
}

function adaptDriverCashFinanceSummary(row) {
  return {
    driverId: row?.driver_id || "",
    currencyCode: row?.currency_code || "",
    cashCollectedAmount: Number(row?.cash_collected_amount) || 0,
    remittedAmount: Number(row?.remitted_amount) || 0,
    pendingRemittanceAmount: Number(row?.pending_remittance_amount) || 0,
    openDiscrepancyCount: Number(row?.open_discrepancy_count) || 0,
    openDiscrepancyAmount: Number(row?.open_discrepancy_amount) || 0,
    excessUnderReviewAmount: Number(row?.excess_under_review_amount) || 0,
  };
}

function adaptDriverCashRemittanceRow(row) {
  const rawStatus = String(row?.status || "").trim();
  const amount = rawStatus === "verified" && row?.verified_amount !== null && row?.verified_amount !== undefined ? row.verified_amount : row?.declared_amount;

  return {
    id: row?.human_code || row?.id || "",
    remittanceId: row?.human_code || row?.id || "",
    remittanceUuid: row?.id || "",
    rawStatus,
    status: rawStatus,
    amount: Number(amount) || 0,
    declaredAmount: Number(row?.declared_amount) || 0,
    verifiedAmount: row?.verified_amount === null || row?.verified_amount === undefined ? null : Number(row.verified_amount) || 0,
    currencyCode: row?.currency_code || driverFinanceLoadState.summary?.currencyCode || "",
    submittedAt: row?.submitted_at || "",
    receivedAt: row?.received_at || "",
    verifiedAt: row?.verified_at || "",
    createdAt: getDriverFinanceRemittanceDateValue(row),
    cancelledAt: row?.cancelled_at || "",
    annulledAt: row?.cancelled_at || "",
    annulledByName: "",
    annulmentReason: row?.cancellation_reason || "",
    registeredByName: "Administración",
    observations: row?.notes || "",
    notes: row?.notes || "",
  };
}

function getDriverFinanceRemittanceDateValue(remittance) {
  return remittance?.submittedAt || remittance?.submitted_at || remittance?.createdAt || remittance?.created_at || "";
}

async function showDriverRealServices() {
  const requestId = ++driverServicesRenderRequestId;
  const driverId = driverProfile?.id || "";

  isDriverUsingCentralServices = false;
  isDriverActiveServiceVisible = false;
  pendingDriverRejectionServiceId = null;

  if (driverServicesLoadState.status === "loaded" && driverServicesLoadState.driverId === driverId) {
    driverServices = driverServicesLoadState.services.slice();
    renderDriverServices();
    return;
  }

  renderDriverServicesLoadingState();

  try {
    const services = await loadDriverServices();

    if (requestId !== driverServicesRenderRequestId || !isDriverServicesViewVisible()) {
      return;
    }

    driverServices = services;
    renderDriverServices();
  } catch (error) {
    if (requestId !== driverServicesRenderRequestId || !isDriverServicesViewVisible()) {
      return;
    }

    console.error("[ELARA Driver] No se pudieron cargar los servicios reales del conductor.", {
      message: error?.message || "",
      code: error?.code || "",
      stage: "driver-services",
    });
    renderDriverServicesErrorState();
  }
}

function isDriverServicesViewVisible() {
  const servicesPanel = getElement("mis-servicios");

  return Boolean(servicesPanel && !servicesPanel.hidden);
}

function renderDriverServicesLoadingState() {
  const dashboard = getElement("driver-dashboard");
  const activePanel = getElement("driver-active-service");
  const container = getElement("driver-services-list");

  setDriverActiveMode(false);
  setDriverHeader("", `Hola, ${driverProfile.name}`, "Cargando servicios asignados...");

  if (dashboard) {
    dashboard.hidden = false;
  }

  if (activePanel) {
    activePanel.hidden = true;
  }

  if (container) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando servicios...</p>';
  }
}

function renderDriverServicesErrorState() {
  const dashboard = getElement("driver-dashboard");
  const activePanel = getElement("driver-active-service");
  const container = getElement("driver-services-list");

  setDriverActiveMode(false);
  setDriverHeader("", `Hola, ${driverProfile.name}`, "No se pudieron cargar tus servicios.");

  if (dashboard) {
    dashboard.hidden = false;
  }

  if (activePanel) {
    activePanel.hidden = true;
  }

  if (container) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudieron cargar tus servicios. Intentalo de nuevo mas tarde.</p>';
  }
}
function renderDriverServices() {
  const dashboard = getElement("driver-dashboard");
  const activePanel = getElement("driver-active-service");

  if (!dashboard || !activePanel) {
    return;
  }

  if (!isDriverProfileAdministrativelyActive()) {
    activeServiceId = null;
    isDriverActiveServiceVisible = false;
    pendingDriverRejectionServiceId = null;
    setDriverActiveMode(false);
  }

  const activeService = activeServiceId ? getServiceById(activeServiceId) : null;

  if (isDriverActiveServiceVisible && activeService && isActiveServiceStatus(activeService.status)) {
    setDriverActiveMode(true);
    dashboard.hidden = true;
    activePanel.hidden = false;
    renderActiveService(activeService);
    return;
  }

  if (activeService && !isActiveServiceStatus(activeService.status)) {
    activeServiceId = null;
    isDriverActiveServiceVisible = false;
  }

  if (!activeService) {
    isDriverActiveServiceVisible = false;
  }

  setDriverActiveMode(false);
  dashboard.hidden = false;
  activePanel.hidden = true;
  renderDriverOverview();
  renderServiceList();
}

function renderDriverInactiveServicesState() {
  const container = getElement("driver-services-list");
  const driverName = driverProfile?.name || "Conductor";

  setDriverHeader("", `Hola, ${driverName}`, `No disponible - Perfil no habilitado`);

  if (container) {
    container.innerHTML = `<p class="driver-empty">${DRIVER_INACTIVE_PROFILE_MESSAGE}</p>`;
  }
}

function renderDriverOverview() {
  const pendingServices = getDriverVisibleServices();
  const pendingAcceptanceCount = pendingServices.filter((service) => getDriverServiceDisplayStatus(service) === "Por aceptar").length;

  setDriverHeader(
    "",
    `Hola, ${driverProfile.name}`,
    `${getDriverOperationalStatus()} - ${pendingServices.length} servicios asignados - ${pendingAcceptanceCount} por aceptar`,
  );
}

function getDriverServiceDisplayStatus(service) {
  return service?.displayStatus || driverStatusLabels[service?.status] || service?.status || "";
}

function renderServiceList() {
  const container = getElement("driver-services-list");

  if (!container) {
    return;
  }

  const services = getDriverVisibleServices();

  if (!services.length) {
    container.innerHTML = `<p class="driver-empty">No tienes servicios pendientes o en curso.</p>`;
    return;
  }

  container.innerHTML = services.map((service) => renderServiceCard(service, "compact")).join("");
}

async function showDriverRealHistory() {
  const requestId = ++driverHistoryRenderRequestId;
  const driverId = driverProfile?.id || "";

  if (driverServicesLoadState.status === "loaded" && driverServicesLoadState.driverId === driverId) {
    driverServices = driverServicesLoadState.services.slice();
    setDriverHeader("", "Historial", "Servicios cerrados visibles para tu conductor.");
    renderDriverHistory();
    return;
  }

  renderDriverHistoryLoadingState();

  try {
    const services = await loadDriverServices();

    if (requestId !== driverHistoryRenderRequestId || !isDriverHistoryViewVisible()) {
      return;
    }

    driverServices = services;
    setDriverHeader("", "Historial", "Servicios cerrados visibles para tu conductor.");
    renderDriverHistory();
  } catch (error) {
    if (requestId !== driverHistoryRenderRequestId || !isDriverHistoryViewVisible()) {
      return;
    }

    console.error("[ELARA Driver] No se pudo cargar el historial real del conductor.", {
      message: error?.message || "",
      code: error?.code || "",
      stage: "driver-history",
    });
    renderDriverHistoryErrorState();
  }
}

function isDriverHistoryViewVisible() {
  const historyPanel = getElement("historial");

  return Boolean(historyPanel && !historyPanel.hidden);
}

function renderDriverHistoryLoadingState() {
  const filters = getElement("driver-history-filters");
  const container = getElement("driver-history-list");

  setDriverActiveMode(false);
  setDriverHeader("", "Historial", "Cargando historial...");

  if (filters) {
    filters.innerHTML = "";
  }

  if (container) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando historial...</p>';
  }
}

function renderDriverHistoryErrorState() {
  const filters = getElement("driver-history-filters");
  const container = getElement("driver-history-list");

  setDriverActiveMode(false);
  setDriverHeader("", "Historial", "No se pudo cargar tu historial.");

  if (filters) {
    filters.innerHTML = "";
  }

  if (container) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudo cargar tu historial. Intentalo de nuevo mas tarde.</p>';
  }
}
function renderDriverHistory() {
  renderDriverHistoryFilters();
  renderDriverHistoryList();
}

function renderDriverHistoryFilters() {
  const container = getElement("driver-history-filters");
  const filters = [
    { value: "all", label: "Todos" },
    { value: "finalizado", label: "Finalizados" },
    { value: "no_show", label: "No-show" },
    { value: "no_realizado", label: "No realizados" },
    { value: "cancelado", label: "Cancelados" },
  ];

  if (!container) {
    return;
  }

  container.innerHTML = filters
    .map(
      (filter) => `
        <button class="driver-history-filter${driverHistoryFilter === filter.value ? " is-active" : ""}" type="button" data-driver-action="history-filter" data-history-filter="${filter.value}" aria-pressed="${driverHistoryFilter === filter.value}">
          ${escapeHtml(filter.label)}
        </button>
      `,
    )
    .join("");
}

function renderDriverHistoryList() {
  const container = getElement("driver-history-list");

  if (!container) {
    return;
  }

  const services = getDriverHistoryServices();

  if (!services.length) {
    container.innerHTML = `<p class="driver-empty">No tienes servicios en el historial.</p>`;
    return;
  }

  container.innerHTML = services.map(renderHistoryServiceCard).join("");
}

function renderDriverFinances() {
  renderDriverFinanceFilters();
  renderDriverFinanceSummary();
  renderDriverFinanceHistory();
  setDriverFinanceFiltersDisabled(isDriverFinanceLoading());
  setDriverFinanceRemittanceActionVisibility();
}

function renderDriverFinanceFilters() {
  const statusFilter = getElement("driver-finance-filter-status");

  if (statusFilter) {
    const options = shouldUseRealDriverFinances() ? DRIVER_FINANCE_REMITTANCE_STATUS_OPTIONS : DRIVER_FINANCE_MOCK_STATUS_OPTIONS;
    statusFilter.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
  }

  const fields = [
    ["driver-finance-filter-status", "status"],
    ["driver-finance-filter-from", "from"],
    ["driver-finance-filter-to", "to"],
    ["driver-finance-filter-id", "remittanceId"],
  ];

  fields.forEach(([id, key]) => {
    const element = getElement(id);

    if (element && element.value !== driverFinanceFilters[key]) {
      element.value = driverFinanceFilters[key] || "";
    }
  });
}

function setDriverFinanceFiltersDisabled(disabled) {
  [
    "driver-finance-filter-status",
    "driver-finance-filter-from",
    "driver-finance-filter-to",
    "driver-finance-filter-id",
  ].forEach((id) => {
    const element = getElement(id);

    if (element) {
      element.disabled = Boolean(disabled);
    }
  });
}

function renderDriverFinanceLoadingState() {
  renderDriverFinanceFilters();
  setDriverFinanceFiltersDisabled(true);
  setDriverFinanceRemittanceActionVisibility(false);

  const summary = getElement("driver-finance-summary");
  const list = getElement("driver-finance-list");
  const meta = getElement("driver-finance-meta");
  const pagination = getElement("driver-finance-pagination");

  if (summary) {
    summary.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando finanzas...</p>';
  }

  if (list) {
    list.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando finanzas...</p>';
  }

  if (meta) {
    meta.textContent = "Cargando finanzas...";
  }

  if (pagination) {
    pagination.innerHTML = "";
  }
}

function renderDriverFinanceSummary() {
  const container = getElement("driver-finance-summary");

  if (!container) {
    return;
  }

  if (isDriverFinanceLoading()) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando finanzas...</p>';
    return;
  }

  if (shouldUseRealDriverFinances() && driverFinanceLoadState.summaryError) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudo cargar el resumen financiero. Intentalo de nuevo mas tarde.</p>';
    return;
  }

  const position = getDriverFinancePosition();
  const periodRemittances = getDriverFinanceRemittances();
  const openDifferenceCount = getDriverFinanceOpenDifferenceCount();
  const openDifferenceAmount = Number(position.openDiscrepancyAmount) || 0;
  const showRealFinance = shouldUseRealDriverFinances();
  const cards = [
    ["Efectivo cobrado", formatDriverFinanceMoney(position.totalCollected, position.currencyCode), "neutral"],
    ["Total rendido", formatDriverFinanceMoney(position.totalRendered, position.currencyCode), "success"],
    ["Pendiente de rendir", formatDriverFinanceMoney(position.pendingAmount, position.currencyCode), "warning"],
    ["Rendiciones del periodo", String(periodRemittances.length), "neutral"],
    ["Diferencias abiertas", `${openDifferenceCount} - ${formatDriverFinanceMoney(openDifferenceAmount, position.currencyCode)}`, openDifferenceCount ? "danger" : "neutral"],
  ];

  if (showRealFinance || position.excessAmount > 0 || getDriverFinanceOpenDifferences().some((incident) => normalizeDriverText(incident.type) === "excedente en rendicion")) {
    cards.push(["Excedente en revision", formatDriverFinanceMoney(position.excessAmount, position.currencyCode), position.excessAmount > 0 ? "danger" : "neutral"]);
  }

  container.innerHTML = cards
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderDriverFinanceHistory() {
  const container = getElement("driver-finance-list");
  const meta = getElement("driver-finance-meta");
  const pagination = getElement("driver-finance-pagination");

  if (!container) {
    return;
  }

  if (isDriverFinanceLoading()) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando finanzas...</p>';
    if (meta) meta.textContent = "Cargando finanzas...";
    if (pagination) pagination.innerHTML = "";
    return;
  }

  if (shouldUseRealDriverFinances() && driverFinanceLoadState.remittancesError) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudo cargar el historial de rendiciones. Intentalo de nuevo mas tarde.</p>';
    if (meta) meta.textContent = "-";
    if (pagination) pagination.innerHTML = "";
    return;
  }

  const remittances = getDriverFinanceRemittances();
  const totalPages = Math.max(1, Math.ceil(remittances.length / DRIVER_FINANCE_HISTORY_PAGE_SIZE));
  driverFinanceHistoryPage = Math.min(Math.max(driverFinanceHistoryPage, 1), totalPages);
  const pageStart = (driverFinanceHistoryPage - 1) * DRIVER_FINANCE_HISTORY_PAGE_SIZE;
  const pageItems = remittances.slice(pageStart, pageStart + DRIVER_FINANCE_HISTORY_PAGE_SIZE);

  if (meta) {
    meta.textContent = `${remittances.length} resultado${remittances.length === 1 ? "" : "s"} - Página ${driverFinanceHistoryPage} de ${totalPages}`;
  }

  if (!pageItems.length) {
    const hasAnyRemittances = getDriverFinanceAllRemittances().length > 0;
    container.innerHTML = `<p class="driver-empty">${hasAnyRemittances ? "No hay rendiciones para los filtros seleccionados." : "No tienes rendiciones registradas."}</p>`;
    renderDriverFinancePagination(pagination, driverFinanceHistoryPage, totalPages);
    return;
  }

  container.innerHTML = pageItems
    .map(
      (remittance) => `
        <article class="driver-finance-row">
          <div>
            <strong>${escapeHtml(getDriverFinanceRemittanceId(remittance))}</strong>
            <span>${escapeHtml(formatDriverFinanceDateTime(getDriverFinanceRemittanceDateValue(remittance)))} - ${escapeHtml(remittance.registeredByName || "Administración")}</span>
            ${remittance.observations ? `<small>${escapeHtml(remittance.observations)}</small>` : ""}
          </div>
          <strong>${escapeHtml(formatDriverFinanceMoney(remittance.amount, remittance.currencyCode))}</strong>
          <span class="cash-row__status">${escapeHtml(getDriverFinanceRemittanceStatus(remittance))}</span>
          <button class="button button--compact button--muted" type="button" data-driver-action="finance-detail" data-remittance-id="${escapeHtml(getDriverFinanceRemittanceId(remittance))}">Detalle</button>
        </article>
      `,
    )
    .join("");

  renderDriverFinancePagination(pagination, driverFinanceHistoryPage, totalPages);
}

function renderDriverFinancePagination(container, currentPage, totalPages) {
  if (!container) {
    return;
  }

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-driver-action="finance-page" data-finance-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Página ${escapeHtml(currentPage)} de ${escapeHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-driver-action="finance-page" data-finance-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Siguiente</button>
  `;
}

function handleDriverFinanceFilterChange() {
  driverFinanceFilters = {
    status: getInputValue("driver-finance-filter-status"),
    from: getInputValue("driver-finance-filter-from"),
    to: getInputValue("driver-finance-filter-to"),
    remittanceId: getInputValue("driver-finance-filter-id"),
  };
  driverFinanceHistoryPage = 1;
  renderDriverFinances();
}

function clearDriverFinanceFilters() {
  driverFinanceFilters = {
    status: "",
    from: "",
    to: "",
    remittanceId: "",
  };
  driverFinanceHistoryPage = 1;
  renderDriverFinances();
}

function getDriverFinancePosition() {
  if (shouldUseRealDriverFinances()) {
    const summary = driverFinanceLoadState.summary || {};

    return {
      driverId: summary.driverId || driverProfile?.id || "",
      driverName: driverProfile?.name || "Conductor",
      driverType: driverProfile?.driverType || "Conductor",
      currencyCode: summary.currencyCode || "",
      totalCollected: Number(summary.cashCollectedAmount) || 0,
      totalRendered: Number(summary.remittedAmount) || 0,
      balanceAmount: Number(summary.cashCollectedAmount || 0) - Number(summary.remittedAmount || 0),
      pendingAmount: Number(summary.pendingRemittanceAmount) || 0,
      excessAmount: Number(summary.excessUnderReviewAmount) || 0,
      openDiscrepancyCount: Number(summary.openDiscrepancyCount) || 0,
      openDiscrepancyAmount: Number(summary.openDiscrepancyAmount) || 0,
      status: "Real",
    };
  }

  if (!driverProfile || !window.ElaraCash || typeof window.ElaraCash.getCashDriverPosition !== "function") {
    return { totalCollected: 0, totalRendered: 0, pendingAmount: 0, excessAmount: 0, status: "Pendiente" };
  }

  return window.ElaraCash.getCashDriverPosition(driverProfile.id) || {
    driverId: driverProfile.id,
    driverName: driverProfile.name,
    driverType: driverProfile.driverType,
    totalCollected: 0,
    totalRendered: 0,
    balanceAmount: 0,
    pendingAmount: 0,
    excessAmount: 0,
    status: "Pendiente",
  };
}

function getDriverFinanceRemittances() {
  if (shouldUseRealDriverFinances()) {
    return getFilteredDriverFinanceRealRemittances();
  }

  if (!driverProfile || !window.ElaraCash || typeof window.ElaraCash.getCashRemittancesForDriver !== "function") {
    return [];
  }

  return window.ElaraCash.getCashRemittancesForDriver(driverProfile.id, driverFinanceFilters);
}

function getDriverFinanceAllRemittances() {
  if (shouldUseRealDriverFinances()) {
    return driverFinanceLoadState.driverId === driverProfile?.id ? driverFinanceLoadState.remittances.slice() : [];
  }

  if (!driverProfile || !window.ElaraCash || typeof window.ElaraCash.getCashRemittancesForDriver !== "function") {
    return [];
  }

  return window.ElaraCash.getCashRemittancesForDriver(driverProfile.id);
}

function getFilteredDriverFinanceRealRemittances() {
  const remittances = getDriverFinanceAllRemittances();
  const status = String(driverFinanceFilters.status || "").trim();
  const acceptedStatuses = DRIVER_FINANCE_REMITTANCE_STATUS_FILTERS[status] || (status ? [status] : []);
  const queryId = normalizeDriverText(driverFinanceFilters.remittanceId);
  const fromTimestamp = getDriverFinanceDateBoundaryTimestamp(driverFinanceFilters.from, "start");
  const toTimestamp = getDriverFinanceDateBoundaryTimestamp(driverFinanceFilters.to, "end");

  return remittances.filter((remittance) => {
    const remittanceTimestamp = getDriverFinanceRemittanceTimestamp(remittance);
    const remittanceId = normalizeDriverText(getDriverFinanceRemittanceId(remittance));

    if (acceptedStatuses.length && !acceptedStatuses.includes(remittance.rawStatus)) {
      return false;
    }

    if (fromTimestamp && remittanceTimestamp < fromTimestamp) {
      return false;
    }

    if (toTimestamp && remittanceTimestamp > toTimestamp) {
      return false;
    }

    return !queryId || remittanceId.includes(queryId);
  });
}

function getDriverFinanceDateBoundaryTimestamp(value, boundary) {
  const dateValue = String(value || "").trim();

  if (!dateValue) {
    return null;
  }

  const timestamp = boundary === "end" ? new Date(`${dateValue}T23:59:59.999`).getTime() : new Date(`${dateValue}T00:00:00.000`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDriverFinanceRemittanceTimestamp(remittance) {
  const timestamp = new Date(getDriverFinanceRemittanceDateValue(remittance)).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDriverFinanceOpenDifferences() {
  if (shouldUseRealDriverFinances()) {
    return [];
  }

  if (!driverProfile || !window.ElaraCash || typeof window.ElaraCash.getCashOpenFinancialIncidentsForDriver !== "function") {
    return [];
  }

  return window.ElaraCash.getCashOpenFinancialIncidentsForDriver(driverProfile.id);
}

function getDriverFinanceOpenDifferenceCount() {
  if (shouldUseRealDriverFinances()) {
    return Number(driverFinanceLoadState.summary?.openDiscrepancyCount) || 0;
  }

  return getDriverFinanceOpenDifferences().length;
}

function renderDriverSettlements() {
  renderDriverSettlementFilters();
  renderDriverSettlementSummary();
  renderDriverSettlementList();
}

function renderDriverSettlementFilters() {
  const statusFilter = getElement("driver-settlement-filter-status");
  const paymentFilter = getElement("driver-settlement-filter-collection");
  const paymentLabel = paymentFilter?.closest("label")?.querySelector("span");
  const isReal = shouldUseRealDriverSettlements();

  if (statusFilter) {
    const options = isReal ? DRIVER_SETTLEMENT_REAL_STATUS_OPTIONS : DRIVER_SETTLEMENT_MOCK_STATUS_OPTIONS;
    statusFilter.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
  }

  if (paymentFilter) {
    const options = isReal ? DRIVER_SETTLEMENT_PAYMENT_STATUS_OPTIONS : DRIVER_SETTLEMENT_MOCK_COLLECTION_OPTIONS;
    paymentFilter.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
  }

  if (paymentLabel) {
    paymentLabel.textContent = isReal ? "Estado pago" : "Cobro de servicios";
  }

  [
    ["driver-settlement-filter-status", "status"],
    ["driver-settlement-filter-from", "from"],
    ["driver-settlement-filter-to", "to"],
    ["driver-settlement-filter-query", "query"],
    ["driver-settlement-filter-collection", "collection"],
  ].forEach(([id, key]) => {
    const element = getElement(id);

    if (element && element.value !== driverSettlementFilters[key]) {
      element.value = driverSettlementFilters[key] || "";
    }
  });

  setDriverSettlementFiltersDisabled(isDriverSettlementsLoading());

  const filtersContainer = getElement("driver-settlement-filters");
  const filterButton = getElement("driver-settlement-filter-toggle");

  if (filtersContainer) {
    filtersContainer.hidden = !areDriverSettlementFiltersVisible;
  }

  if (filterButton) {
    const count = getDriverSettlementFilterCount();
    filterButton.textContent = count ? `Filtro - ${count}` : "Filtro";
    filterButton.setAttribute("aria-expanded", areDriverSettlementFiltersVisible ? "true" : "false");
  }
}

function setDriverSettlementFiltersDisabled(disabled) {
  [
    "driver-settlement-filter-status",
    "driver-settlement-filter-from",
    "driver-settlement-filter-to",
    "driver-settlement-filter-query",
    "driver-settlement-filter-collection",
  ].forEach((id) => {
    const element = getElement(id);

    if (element) {
      element.disabled = Boolean(disabled);
    }
  });
}

function renderDriverSettlementLoadingState() {
  renderDriverSettlementFilters();
  setDriverSettlementFiltersDisabled(true);

  const summary = getElement("driver-settlement-summary");
  const list = getElement("driver-settlement-list");
  const meta = getElement("driver-settlement-meta");
  const pagination = getElement("driver-settlement-pagination");

  if (summary) {
    summary.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando liquidaciones...</p>';
  }

  if (list) {
    list.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando liquidaciones...</p>';
  }

  if (meta) {
    meta.textContent = "Cargando liquidaciones...";
  }

  if (pagination) {
    pagination.innerHTML = "";
  }
}
function renderDriverSettlementSummary() {
  const container = getElement("driver-settlement-summary");

  if (!container) {
    return;
  }

  if (isDriverSettlementsLoading()) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando liquidaciones...</p>';
    return;
  }

  if (shouldUseRealDriverSettlements() && driverSettlementsLoadState.error) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudo cargar el resumen de liquidaciones. Intentalo de nuevo mas tarde.</p>';
    return;
  }

  const summary = getDriverSettlementSummary();
  const cards = shouldUseRealDriverSettlements()
    ? [
        ["Importe conductor", formatDriverSettlementMoney(summary.driverAmount, summary.currencyCode), "neutral"],
        ["Total pagado", formatDriverSettlementMoney(summary.paidAmount, summary.currencyCode), "success"],
        ["Pendiente", formatDriverSettlementMoney(summary.pendingAmount, summary.currencyCode), "warning"],
        ["Liquidaciones", String(summary.settlementCount), "neutral"],
      ]
    : [
        ["Pendiente aprobacion", formatDriverSettlementMoney(summary.pendingApprovalAmount), "warning"],
        ["Aprobado pendiente pago", formatDriverSettlementMoney(summary.approvedPendingPaymentAmount), "info"],
        ["Total pagado", formatDriverSettlementMoney(summary.paidAmount), "success"],
        ["Liquidaciones pagadas", String(summary.paidCount), "success"],
        ["Servicios liquidados", String(summary.settledServices), "neutral"],
        ["Proxima liquidacion", summary.nextSettlement || "Sin calcular", "neutral"],
      ];

  container.innerHTML = cards
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}
function renderDriverSettlementList() {
  const container = getElement("driver-settlement-list");
  const meta = getElement("driver-settlement-meta");
  const pagination = getElement("driver-settlement-pagination");

  if (!container) {
    return;
  }

  if (isDriverSettlementsLoading()) {
    container.innerHTML = '<p class="driver-empty" role="status" aria-live="polite">Cargando liquidaciones...</p>';
    if (meta) meta.textContent = "Cargando liquidaciones...";
    if (pagination) pagination.innerHTML = "";
    return;
  }

  if (shouldUseRealDriverSettlements() && driverSettlementsLoadState.error) {
    container.innerHTML = '<p class="driver-empty" role="alert">No se pudieron cargar tus liquidaciones. Intentalo de nuevo mas tarde.</p>';
    if (meta) meta.textContent = "-";
    if (pagination) pagination.innerHTML = "";
    return;
  }

  const settlements = getFilteredDriverSettlements();
  const totalPages = Math.max(1, Math.ceil(settlements.length / DRIVER_SETTLEMENT_PAGE_SIZE));
  driverSettlementPage = Math.min(Math.max(driverSettlementPage, 1), totalPages);
  const pageStart = (driverSettlementPage - 1) * DRIVER_SETTLEMENT_PAGE_SIZE;
  const pageItems = settlements.slice(pageStart, pageStart + DRIVER_SETTLEMENT_PAGE_SIZE);
  const hasOwnSettlements = getDriverOwnSettlements().length > 0;

  if (meta) {
    meta.textContent = `${settlements.length} resultado${settlements.length === 1 ? "" : "s"} - Página ${driverSettlementPage} de ${totalPages}`;
  }

  if (!pageItems.length) {
    container.innerHTML = `<p class="driver-empty">${hasOwnSettlements ? "No hay liquidaciones que coincidan con los filtros." : "No tienes liquidaciones registradas."}</p>`;
    renderDriverSettlementPagination(pagination, driverSettlementPage, totalPages);
    return;
  }

  container.innerHTML = pageItems.map(renderDriverSettlementRow).join("");
  renderDriverSettlementPagination(pagination, driverSettlementPage, totalPages);
}
function renderDriverSettlementRow(settlement) {
  if (shouldUseRealDriverSettlements()) {
    return renderDriverRealSettlementRow(settlement);
  }

  const paidDate = isDriverSettlementPaymentActive(settlement.payment) ? `<small>Pagada: ${escapeHtml(formatDriverSettlementDate(settlement.payment.paidAt))}</small>` : "";
  const pendingCollection = settlement.totals.pendingCollectionAmount
    ? `<small>Incluye servicios pendientes de cobro</small>`
    : `<small>Sin servicios pendientes de cobro</small>`;

  return `
    <article class="driver-settlement-row">
      <div class="driver-settlement-row__main">
        <div>
          <strong>${escapeHtml(settlement.settlementId)}</strong>
          <span>${escapeHtml(formatDriverSettlementDate(settlement.periodStart))} - ${escapeHtml(formatDriverSettlementDate(settlement.periodEnd))} - ${escapeHtml(settlement.periodType)}</span>
        </div>
        <p>${escapeHtml(settlement.totals.servicesCount)} servicios - Margen ${escapeHtml(formatDriverSettlementMoney(settlement.totals.liquidableMargin))}</p>
        <p>${escapeHtml(getDriverSettlementPercentageLabel(settlement))}</p>
        ${pendingCollection}
      </div>
      <div class="driver-settlement-row__side">
        <strong>${escapeHtml(formatDriverSettlementMoney(settlement.totals.driverAmount))}</strong>
        ${paidDate}
        ${renderDriverSettlementStatusBadge(settlement.status)}
        <button class="button button--compact button--muted" type="button" data-driver-action="settlement-detail" data-settlement-id="${escapeHtml(settlement.settlementId)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderDriverRealSettlementRow(settlement) {
  return `
    <article class="driver-settlement-row">
      <div class="driver-settlement-row__main">
        <div>
          <strong>${escapeHtml(settlement.settlementId)}</strong>
          <span>${escapeHtml(formatDriverSettlementDate(settlement.periodStart))} - ${escapeHtml(formatDriverSettlementDate(settlement.periodEnd))} - ${escapeHtml(settlement.periodType)}</span>
        </div>
        <p>${escapeHtml(settlement.driverType)} - Bruto ${escapeHtml(formatDriverSettlementMoney(settlement.grossEligibleAmount, settlement.currencyCode))}</p>
        <p>Porcentaje conductor ${escapeHtml(formatDriverSettlementPercentage(settlement.driverPercentage))}</p>
        <small>Pagado ${escapeHtml(formatDriverSettlementMoney(settlement.paidAmount, settlement.currencyCode))} - Pendiente ${escapeHtml(formatDriverSettlementMoney(settlement.pendingAmount, settlement.currencyCode))}</small>
      </div>
      <div class="driver-settlement-row__side">
        <strong>${escapeHtml(formatDriverSettlementMoney(settlement.driverAmount, settlement.currencyCode))}</strong>
        ${renderDriverSettlementStatusBadge(settlement.status)}
        ${renderDriverSettlementPaymentStatusBadge(settlement.paymentStatus)}
        <button class="button button--compact button--muted" type="button" data-driver-action="settlement-detail" data-settlement-id="${escapeHtml(settlement.settlementId)}">Detalle</button>
      </div>
    </article>
  `;
}
function renderDriverSettlementPagination(container, currentPage, totalPages) {
  if (!container) {
    return;
  }

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-driver-action="settlement-page" data-settlement-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Página ${escapeHtml(currentPage)} de ${escapeHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-driver-action="settlement-page" data-settlement-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Siguiente</button>
  `;
}

function handleDriverSettlementFilterChange() {
  driverSettlementFilters = {
    status: getInputValue("driver-settlement-filter-status"),
    from: getInputValue("driver-settlement-filter-from"),
    to: getInputValue("driver-settlement-filter-to"),
    query: getInputValue("driver-settlement-filter-query"),
    collection: getInputValue("driver-settlement-filter-collection"),
  };
  driverSettlementPage = 1;
  renderDriverSettlements();
}

function toggleDriverSettlementFilters() {
  areDriverSettlementFiltersVisible = !areDriverSettlementFiltersVisible;
  renderDriverSettlementFilters();
}

function clearDriverSettlementFilters() {
  driverSettlementFilters = getDefaultDriverSettlementFilters();
  driverSettlementPage = 1;
  renderDriverSettlements();
}

function openDriverSettlementDetail(settlementId) {
  const settlement = getDriverSettlementById(settlementId);

  if (!settlement) {
    selectedDriverSettlementId = "";
    closeModal("driver-settlement-detail-modal");
    window.ElaraNotifications.showToast("No se encontro la liquidacion seleccionada.", "warning");
    return;
  }

  selectedDriverSettlementId = settlement.settlementId;
  renderDriverSettlementDetail(settlement);
  openModal("driver-settlement-detail-modal");
}

function renderDriverSettlementDetail(settlement) {
  const container = getElement("driver-settlement-detail-content");

  if (!container) {
    return;
  }

  if (shouldUseRealDriverSettlements()) {
    renderDriverRealSettlementDetail(settlement, container);
    return;
  }

  setText("driver-settlement-detail-title", settlement.settlementId);
  setText("driver-settlement-detail-status", settlement.status);
  const statusBadge = getElement("driver-settlement-detail-status");

  if (statusBadge) {
    statusBadge.className = `expense-status-badge expense-status-badge--${getDriverSettlementStatusTone(settlement.status)}`;
  }

  container.innerHTML = `
    ${renderDriverSettlementDetailSection("Resumen", [
      ["Periodo", `${formatDriverSettlementDate(settlement.periodStart)} - ${formatDriverSettlementDate(settlement.periodEnd)}`],
      ["Frecuencia", settlement.periodType],
      ["Tipo", settlement.driverType],
      ["Creada", formatDriverSettlementDateTime(settlement.createdAt)],
      ["Aprobada", settlement.approvedAt ? formatDriverSettlementDateTime(settlement.approvedAt) : ""],
    ])}
    ${renderDriverSettlementAmountSummary(settlement)}
    ${renderDriverSettlementPendingCollectionNotice(settlement)}
    ${renderDriverSettlementServicesSection(settlement)}
    ${renderDriverSettlementIncidentsSection(settlement)}
    ${renderDriverSettlementPaymentSection(settlement)}
  `;
}

function renderDriverRealSettlementDetail(settlement, container) {
  setText("driver-settlement-detail-title", settlement.settlementId);
  setText("driver-settlement-detail-status", settlement.status);
  const statusBadge = getElement("driver-settlement-detail-status");

  if (statusBadge) {
    statusBadge.className = `expense-status-badge expense-status-badge--${getDriverSettlementStatusTone(settlement.status)}`;
  }

  container.innerHTML = `
    ${renderDriverSettlementDetailSection("Resumen", [
      ["Periodo", `${formatDriverSettlementDate(settlement.periodStart)} - ${formatDriverSettlementDate(settlement.periodEnd)}`],
      ["Frecuencia", settlement.periodType],
      ["Tipo", settlement.driverType],
      ["Estado pago", settlement.paymentStatus],
      ["Pagos completados", String(settlement.completedPaymentCount)],
      ["Ultimo pago", settlement.lastPaymentAt ? formatDriverSettlementDateTime(settlement.lastPaymentAt) : "-"],
    ])}
    ${renderDriverSettlementAmountSummary(settlement)}
  `;
}
function renderDriverSettlementDetailSection(title, fields) {
  return `
    <section class="expense-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <dl class="modal__fields-grid">
        ${fields
          .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
          .map(([label, value]) => renderModalField(label, value))
          .join("")}
      </dl>
    </section>
  `;
}

function renderDriverSettlementAmountSummary(settlement) {
  if (shouldUseRealDriverSettlements()) {
    return `
      <section class="expense-detail-amount-grid">
        <article class="expense-detail-amount"><span>Bruto elegible</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.grossEligibleAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Gastos deducidos</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.expenseDeductionAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Ajustes</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.adjustmentAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Base calculo</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.calculationBaseAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Porcentaje conductor</span><strong>${escapeHtml(formatDriverSettlementPercentage(settlement.driverPercentage))}</strong></article>
        <article class="expense-detail-amount"><span>Importe conductor</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.driverAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Pagado</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.paidAmount, settlement.currencyCode))}</strong></article>
        <article class="expense-detail-amount"><span>Pendiente</span><strong>${escapeHtml(formatDriverSettlementMoney(settlement.pendingAmount, settlement.currencyCode))}</strong></article>
      </section>
    `;
  }

  const totals = settlement.totals;

  return `
    <section class="expense-detail-amount-grid">
      <article class="expense-detail-amount"><span>Ingreso neto</span><strong>${escapeHtml(formatDriverSettlementMoney(totals.netIncome))}</strong></article>
      <article class="expense-detail-amount"><span>Gastos computables</span><strong>${escapeHtml(formatDriverSettlementMoney(totals.computableExpenses))}</strong></article>
      <article class="expense-detail-amount"><span>Margen liquidable</span><strong>${escapeHtml(formatDriverSettlementMoney(totals.liquidableMargin))}</strong></article>
      <article class="expense-detail-amount"><span>Importe ELARA</span><strong>${escapeHtml(formatDriverSettlementMoney(totals.elaraAmount))}</strong></article>
      <article class="expense-detail-amount"><span>Importe para ti</span><strong>${escapeHtml(formatDriverSettlementMoney(totals.driverAmount))}</strong></article>
      <article class="expense-detail-amount"><span>PORCENTAJE APLICADO</span><strong>${escapeHtml(getDriverSettlementPercentageLabel(settlement))}</strong></article>
    </section>
  `;
}
function renderDriverSettlementPendingCollectionNotice(settlement) {
  const pendingItems = settlement.serviceItems.filter((item) => item.hasPendingCollection);

  if (!pendingItems.length || !settlement.totals.pendingCollectionAmount) {
    return "";
  }

  return `<p class="settlement-pending-note">Esta liquidacion incluye ${escapeHtml(pendingItems.length)} servicios pendientes de cobro por un total de ${escapeHtml(formatDriverSettlementMoney(settlement.totals.pendingCollectionAmount))}. Esto no afecta el importe de tu liquidacion.</p>`;
}

function renderDriverSettlementServicesSection(settlement) {
  return `
    <section class="expense-detail-section">
      <h3>Servicios incluidos</h3>
      <div class="driver-settlement-service-list">
        ${settlement.serviceItems.length ? settlement.serviceItems.map(renderDriverSettlementServiceItem).join("") : '<p class="driver-empty">Sin servicios incluidos.</p>'}
      </div>
    </section>
  `;
}

function renderDriverSettlementServiceItem(item) {
  return `
    <article class="driver-settlement-service-item">
      <div>
        <strong>${escapeHtml(item.serviceId)}</strong>
        <small>${escapeHtml(formatDriverSettlementDate(item.serviceDate))} - Cobro: ${escapeHtml(item.paymentStatusSnapshot || "-")}</small>
      </div>
      <span>Precio ${escapeHtml(formatDriverSettlementMoney(item.basePrice))}</span>
      <span>Gastos ${escapeHtml(formatDriverSettlementMoney(item.approvedComputableExpenses))}</span>
      <span>Margen ${escapeHtml(formatDriverSettlementMoney(item.liquidableMargin))}</span>
      <span>${escapeHtml(item.appliedPercentage)} %</span>
      <strong>${escapeHtml(formatDriverSettlementMoney(item.driverAmount))}</strong>
    </article>
  `;
}

function renderDriverSettlementIncidentsSection(settlement) {
  const incidents = [];

  settlement.serviceItems.forEach((item) => {
    if (item.liquidableMargin < 0) incidents.push(`${item.serviceId}: margen negativo.`);
    if (item.calculationStatus === "Para revision") incidents.push(`${item.serviceId}: calculo en revision.`);
    item.reviewReasons.forEach((reason) => incidents.push(`${item.serviceId}: ${reason}`));
  });

  (settlement.returnHistory || []).forEach((entry) => {
    if (entry.reason) incidents.push(`Devolucion administrativa: ${entry.reason}`);
  });

  if (!incidents.length) {
    return "";
  }

  return `
    <section class="expense-detail-section">
      <h3>Incidencias</h3>
      <div class="settlement-incident-list">
        ${Array.from(new Set(incidents)).map((incident) => `<article class="settlement-incident"><span>${escapeHtml(incident)}</span></article>`).join("")}
      </div>
    </section>
  `;
}

function renderDriverSettlementPaymentSection(settlement) {
  const payment = settlement.payment || {};

  if (settlement.status === "Pagada" && isDriverSettlementPaymentActive(payment)) {
    return renderDriverSettlementDetailSection("Pago", [
      ["Estado", payment.status],
      ["Importe", formatDriverSettlementMoney(payment.amount)],
      ["Metodo", payment.method],
      ["Fecha", formatDriverSettlementDateTime(payment.paidAt)],
      ["Registrado por", payment.paidByUserName || payment.paidByName],
      ["Referencia Caja", payment.cashMovementId],
    ]);
  }

  if (payment.status === "Anulado") {
    return `<p class="settlement-pending-note">Un pago anterior fue anulado y la liquidacion volvio a quedar pendiente de pago.</p>`;
  }

  return "";
}

function getFilteredDriverSettlements() {
  if (shouldUseRealDriverSettlements()) {
    return getFilteredDriverRealSettlements();
  }

  if (!driverProfile || !window.ElaraSettlementsCore || typeof window.ElaraSettlementsCore.getSettlementsForDriver !== "function") {
    return [];
  }

  return window.ElaraSettlementsCore.getSettlementsForDriver(driverProfile.id, {
    status: driverSettlementFilters.status,
    from: driverSettlementFilters.from,
    to: driverSettlementFilters.to,
    query: driverSettlementFilters.query,
    collection: driverSettlementFilters.collection,
  });
}

function getFilteredDriverRealSettlements() {
  const settlements = getDriverOwnSettlements();
  const status = String(driverSettlementFilters.status || "").trim();
  const paymentStatus = String(driverSettlementFilters.collection || "").trim();
  const query = normalizeDriverText(driverSettlementFilters.query);
  const fromTimestamp = getDriverSettlementDateBoundaryTimestamp(driverSettlementFilters.from, "start");
  const toTimestamp = getDriverSettlementDateBoundaryTimestamp(driverSettlementFilters.to, "end");

  return settlements.filter((settlement) => {
    const settlementTimestamp = getDriverSettlementPeriodTimestamp(settlement);
    const settlementId = normalizeDriverText(settlement.humanCode || settlement.settlementId || settlement.settlementUuid);

    if (status && settlement.rawStatus !== status) {
      return false;
    }

    if (paymentStatus && settlement.rawPaymentStatus !== paymentStatus) {
      return false;
    }

    if (fromTimestamp && settlementTimestamp < fromTimestamp) {
      return false;
    }

    if (toTimestamp && settlementTimestamp > toTimestamp) {
      return false;
    }

    return !query || settlementId.includes(query);
  });
}
function getDriverOwnSettlements() {
  if (shouldUseRealDriverSettlements()) {
    return driverSettlementsLoadState.driverId === driverProfile?.id ? driverSettlementsLoadState.settlements.slice() : [];
  }

  if (!driverProfile || !window.ElaraSettlementsCore || typeof window.ElaraSettlementsCore.getSettlementsForDriver !== "function") {
    return [];
  }

  return window.ElaraSettlementsCore.getSettlementsForDriver(driverProfile.id);
}
function getDriverSettlementById(settlementId) {
  const id = String(settlementId || "").trim();

  if (shouldUseRealDriverSettlements()) {
    return getDriverOwnSettlements().find((settlement) => settlement.settlementId === id || settlement.humanCode === id || settlement.settlementUuid === id) || null;
  }

  if (!driverProfile || !window.ElaraSettlementsCore || typeof window.ElaraSettlementsCore.getDriverSettlementById !== "function") {
    return null;
  }

  return window.ElaraSettlementsCore.getDriverSettlementById(driverProfile.id, id);
}
function getDriverSettlementSummary() {
  if (shouldUseRealDriverSettlements()) {
    const settlements = getFilteredDriverSettlements();
    const currencyCodes = Array.from(new Set(settlements.map((settlement) => settlement.currencyCode).filter(Boolean)));
    const currencyCode = currencyCodes.length === 1 ? currencyCodes[0] : "";

    return settlements.reduce(
      (summary, settlement) => {
        summary.driverAmount += Number(settlement.driverAmount) || 0;
        summary.paidAmount += Number(settlement.paidAmount) || 0;
        summary.pendingAmount += Number(settlement.pendingAmount) || 0;
        summary.settlementCount += 1;
        return summary;
      },
      {
        driverAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        settlementCount: 0,
        currencyCode,
      },
    );
  }

  if (!driverProfile || !window.ElaraSettlementsCore || typeof window.ElaraSettlementsCore.getDriverSettlementSummary !== "function") {
    return {
      pendingApprovalAmount: 0,
      approvedPendingPaymentAmount: 0,
      paidAmount: 0,
      paidCount: 0,
      settledServices: 0,
      nextSettlement: "Sin calcular",
    };
  }

  return window.ElaraSettlementsCore.getDriverSettlementSummary(driverProfile.id, {
    status: driverSettlementFilters.status,
    from: driverSettlementFilters.from,
    to: driverSettlementFilters.to,
    query: driverSettlementFilters.query,
    collection: driverSettlementFilters.collection,
  });
}
function getDefaultDriverSettlementFilters() {
  return {
    status: "",
    from: "",
    to: "",
    query: "",
    collection: "",
  };
}

function getDriverSettlementFilterCount() {
  return Object.values(driverSettlementFilters).filter(Boolean).length;
}

function canDriverSettlementAction(action) {
  if (window.ElaraPermissions && typeof window.ElaraPermissions.canPerformAction === "function") {
    return window.ElaraPermissions.canPerformAction(getDriverAuthenticatedUser(), action);
  }

  const user = getDriverAuthenticatedUser();
  return getDriverAuthUserActiveContext(user) === "conductor" && driverAuthUserHasRole(user, "conductor");
}

function getDriverSettlementPercentageLabel(settlement) {
  if (shouldUseRealDriverSettlements()) {
    return `${formatDriverSettlementPercentage(settlement.driverPercentage)} para ti`;
  }

  const percentage = settlement.percentageSnapshot?.appliedPercentage ?? 0;

  if (settlement.driverType === "Chofer") {
    return `${percentage} % para ti`;
  }

  return settlement.percentageSnapshot?.mode === "custom" ? `${percentage} % personalizado para ELARA` : `${percentage} % para ELARA`;
}
function isDriverSettlementPaymentActive(payment = {}) {
  return payment.status === "Pagado" && Boolean(payment.cashMovementId) && !payment.annulledAt && !payment.reversalCashMovementId;
}

function renderDriverSettlementStatusBadge(status) {
  const tone = getDriverSettlementStatusTone(status);

  return `<span class="expense-status-badge expense-status-badge--${tone}">${escapeHtml(status)}</span>`;
}

function renderDriverSettlementPaymentStatusBadge(status) {
  const tone = getDriverSettlementPaymentStatusTone(status);

  return `<span class="expense-status-badge expense-status-badge--${tone}">${escapeHtml(status)}</span>`;
}
function getDriverSettlementStatusTone(status) {
  return {
    Borrador: "neutral",
    Generada: "info",
    Enviada: "info",
    Rechazada: "danger",
    Cancelada: "danger",
    "Para revision": "warning",
    "Pendiente de aprobacion": "warning",
    Aprobada: "success",
    Pagada: "success",
    Anulada: "danger",
  }[status] || "neutral";
}

function getDriverSettlementPaymentStatusTone(status) {
  return {
    "Pendiente de pago": "warning",
    "Pago parcial": "info",
    Pagada: "success",
    "Pago cancelado": "danger",
  }[status] || "neutral";
}

function getDriverSettlementDateBoundaryTimestamp(value, boundary) {
  const dateValue = String(value || "").trim();

  if (!dateValue) {
    return null;
  }

  const timestamp = boundary === "end" ? new Date(`${dateValue}T23:59:59.999`).getTime() : new Date(`${dateValue}T00:00:00.000`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDriverSettlementPeriodTimestamp(settlement) {
  const timestamp = new Date(settlement?.periodEnd || settlement?.periodStart || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDriverSettlementPercentage(value) {
  const percentage = Number(value);
  const safePercentage = Number.isFinite(percentage) ? percentage : 0;
  return `${safePercentage.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}
function formatDriverSettlementMoney(value, currencyCode = "") {
  if (!shouldUseRealDriverSettlements() && window.ElaraCash && typeof window.ElaraCash.formatCashMoney === "function") {
    return window.ElaraCash.formatCashMoney(value);
  }

  const currency = String(currencyCode || "").trim().toUpperCase();
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;

  if (!currency) {
    return formatDriverMoney(safeAmount);
  }

  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(safeAmount);
  } catch (error) {
    return `${safeAmount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}
function formatDriverSettlementDate(value) {
  const normalizedDate = String(value || "").trim().slice(0, 10);

  if (!normalizedDate) {
    return "-";
  }

  return formatDate(normalizedDate);
}

function formatDriverSettlementDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setDriverFinanceRemittanceActionVisibility(forceVisible) {
  const action = getElement("driver-finance-remittance-action");

  if (!action) {
    return;
  }

  const position = getDriverFinancePosition();
  const canCreate = forceVisible === undefined
    ? shouldUseRealDriverFinances() && !isDriverFinanceLoading() && !driverFinanceLoadState.summaryError && Number(position.pendingAmount) > 0
    : Boolean(forceVisible);

  action.hidden = !canCreate;
  action.disabled = !canCreate || isSubmittingDriverFinanceRemittance;
}

function openDriverFinanceRemittanceSubmitModal() {
  if (!shouldUseRealDriverFinances()) {
    window.ElaraNotifications.showToast("Accion real no disponible en modo demo.", "warning");
    return;
  }

  const position = getDriverFinancePosition();

  if (!Number(position.pendingAmount)) {
    window.ElaraNotifications.showToast("No hay efectivo pendiente de rendir.", "info");
    return;
  }

  setText("driver-finance-remittance-pending", formatDriverFinanceMoney(position.pendingAmount, position.currencyCode));
  setText("driver-finance-remittance-amount", formatDriverFinanceMoney(position.pendingAmount, position.currencyCode));
  setInputValue("driver-finance-remittance-notes", "");
  clearDriverFinanceRemittanceError();
  setDriverFinanceRemittanceSubmitDisabled(false);
  openModal("driver-finance-remittance-modal");
}

async function submitDriverFinanceRemittance(event) {
  event.preventDefault();

  if (isSubmittingDriverFinanceRemittance) {
    return;
  }

  if (!refreshDriverProfile()) {
    window.ElaraNotifications.showToast(driverAccessMessage || DRIVER_NO_PORTAL_ACCESS_MESSAGE, "error");
    return;
  }

  if (!shouldUseRealDriverFinances() || !window.ElaraSupabase?.client) {
    showDriverFinanceRemittanceError("No hay conexion disponible para registrar la rendicion.");
    return;
  }

  const position = getDriverFinancePosition();

  if (!Number(position.pendingAmount)) {
    showDriverFinanceRemittanceError("No hay efectivo pendiente de rendir.");
    return;
  }

  isSubmittingDriverFinanceRemittance = true;
  setDriverFinanceRemittanceSubmitDisabled(true, "Registrando...");
  setDriverFinanceRemittanceActionVisibility();
  clearDriverFinanceRemittanceError();

  try {
    const notes = getInputValue("driver-finance-remittance-notes").trim();
    const { error } = await window.ElaraSupabase.client.rpc("create_driver_cash_remittance", {
      p_notes: notes || null,
    });

    if (error) {
      throw error;
    }

    closeDriverFinanceRemittanceModal();
    window.ElaraNotifications.showToast("Rendicion registrada correctamente.", "success");
    driverFinanceHistoryPage = 1;
    await loadDriverCashFinances({ force: true });
    renderDriverFinances();
  } catch (error) {
    console.error("[ELARA Driver] No se pudo registrar la rendicion real del conductor.", {
      message: error?.message || "",
      code: error?.code || "",
      details: error?.details || "",
    });
    showDriverFinanceRemittanceError(getDriverFinanceRemittanceSubmitErrorMessage(error));
  } finally {
    isSubmittingDriverFinanceRemittance = false;
    setDriverFinanceRemittanceSubmitDisabled(false);
    setDriverFinanceRemittanceActionVisibility();
  }
}

function closeDriverFinanceRemittanceModal() {
  closeModal("driver-finance-remittance-modal");
  clearDriverFinanceRemittanceError();
  setDriverFinanceRemittanceSubmitDisabled(false);
}

function showDriverFinanceRemittanceError(message) {
  const error = getElement("driver-finance-remittance-error");

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearDriverFinanceRemittanceError() {
  const error = getElement("driver-finance-remittance-error");

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function setDriverFinanceRemittanceSubmitDisabled(disabled, label = "") {
  const submitButton = document.querySelector('#driver-finance-remittance-form button[type="submit"]');

  if (!submitButton) {
    return;
  }

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent || "Registrar rendicion";
  }

  submitButton.disabled = Boolean(disabled);
  submitButton.textContent = disabled ? label || "Registrando..." : submitButton.dataset.defaultLabel;
}

function getDriverFinanceRemittanceSubmitErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (code === "42501" || message.includes("valid conductor active context")) {
    return "No tienes permiso para registrar esta rendicion.";
  }

  if (message.includes("no cash is pending")) {
    return "No hay efectivo pendiente de rendir.";
  }

  if (message.includes("active driver cash account")) {
    return "No hay una cuenta de caja activa para tu conductor.";
  }

  if (message.includes("active central cash account")) {
    return "No hay una cuenta central activa para recibir la rendicion.";
  }

  if (code === "40001" || message.includes("changed during submission")) {
    return "El efectivo pendiente cambio durante el registro. Intentalo nuevamente.";
  }

  if (message.includes("already belongs")) {
    return "Ese efectivo ya esta asociado a otra rendicion.";
  }

  return "No se pudo registrar la rendicion. Intentalo nuevamente.";
}
function openDriverFinanceRemittanceDetail(remittanceId) {
  const remittance = getDriverFinanceRemittanceById(remittanceId);

  if (!remittance) {
    window.ElaraNotifications.showToast("No se encontro la rendicion seleccionada.", "warning");
    return;
  }

  selectedDriverFinanceRemittanceId = getDriverFinanceRemittanceId(remittance);
  setText("driver-finance-detail-id", selectedDriverFinanceRemittanceId);
  setText("driver-finance-detail-date", formatDriverFinanceDateTime(getDriverFinanceRemittanceDateValue(remittance)));
  setText("driver-finance-detail-amount", formatDriverFinanceMoney(remittance.amount, remittance.currencyCode));
  setText("driver-finance-detail-status", getDriverFinanceRemittanceStatus(remittance));
  setText("driver-finance-detail-registered-by", remittance.registeredByName || "Administración");
  setText("driver-finance-detail-difference", getDriverFinanceRemittanceDifferenceLabel(remittance));
  setText("driver-finance-detail-notes", remittance.observations || remittance.notes || "Sin observaciones");
  setText("driver-finance-detail-annulled-at", remittance.annulledAt ? formatDriverFinanceDateTime(remittance.annulledAt) : "-");
  setText("driver-finance-detail-annulled-by", remittance.annulledByName || "-");
  setText("driver-finance-detail-annulment-reason", remittance.annulmentReason || "-");

  const discrepancyButton = getElement("driver-finance-discrepancy-action");

  if (discrepancyButton) {
    const isRealFinance = shouldUseRealDriverFinances();
    const canReportRealDiscrepancy = !isRealFinance || canDriverReportRealFinanceDiscrepancy(remittance);
    discrepancyButton.hidden = !canReportRealDiscrepancy;
    discrepancyButton.disabled = !canReportRealDiscrepancy;
  }

  openModal("driver-finance-detail-modal");
}

function openDriverFinanceDiscrepancyModal(remittanceId) {
  const remittance = getDriverFinanceRemittanceById(remittanceId);

  if (!remittance) {
    window.ElaraNotifications.showToast("No se encontro la rendicion seleccionada.", "warning");
    return;
  }

  const isRealFinance = shouldUseRealDriverFinances();

  if (isRealFinance && !canDriverReportRealFinanceDiscrepancy(remittance)) {
    window.ElaraNotifications.showToast("Esta rendicion no permite reportar discrepancias.", "warning");
    return;
  }

  selectedDriverFinanceRemittanceId = getDriverFinanceRemittanceId(remittance);
  setInputValue("driver-finance-discrepancy-remittance-id", getDriverFinanceDiscrepancyRemittanceRpcId(remittance));
  setInputValue("driver-finance-discrepancy-reason", "");
  setInputValue("driver-finance-discrepancy-notes", "");
  setDriverFinanceDiscrepancyMode(isRealFinance);
  renderDriverFinanceDiscrepancySummary(remittance);
  clearDriverFinanceDiscrepancyError();
  setDriverFinanceDiscrepancySubmitDisabled(false);

  if (!isRealFinance && hasOpenDriverFinanceDiscrepancy(selectedDriverFinanceRemittanceId)) {
    showDriverFinanceDiscrepancyError("Ya existe una discrepancia abierta para esta rendicion.");
    setDriverFinanceDiscrepancySubmitDisabled(true);
  }

  closeModal("driver-finance-detail-modal");
  returnToFinanceDetailAfterDiscrepancy = true;
  openModal("driver-finance-discrepancy-modal");
}

function submitDriverFinanceDiscrepancy(event) {
  event.preventDefault();

  if (shouldUseRealDriverFinances()) {
    void submitRealDriverFinanceDiscrepancy();
    return;
  }

  if (!refreshDriverProfile()) {
    window.ElaraNotifications.showToast(driverAccessMessage || DRIVER_NO_PORTAL_ACCESS_MESSAGE, "error");
    return;
  }

  const remittanceId = getInputValue("driver-finance-discrepancy-remittance-id") || selectedDriverFinanceRemittanceId;
  const reason = getInputValue("driver-finance-discrepancy-reason");
  const notes = getInputValue("driver-finance-discrepancy-notes");
  const remittance = getDriverFinanceRemittanceById(remittanceId);

  if (!remittance || !reason) {
    showDriverFinanceDiscrepancyError("Selecciona el motivo de la discrepancia.");
    return;
  }

  if (hasOpenDriverFinanceDiscrepancy(remittanceId)) {
    showDriverFinanceDiscrepancyError("Ya existe una discrepancia abierta para esta rendicion.");
    return;
  }

  if (!window.ElaraAdminIncidentsMock || !Array.isArray(window.ElaraAdminIncidentsMock.incidents)) {
    showDriverFinanceDiscrepancyError("No se pudo registrar la discrepancia. Intentalo nuevamente.");
    return;
  }

  const currentUser = getDriverAuthenticatedUser();
  const incidentId = getNextDriverFinancialIncidentId();
  const incident = {
    incidentId,
    id: incidentId,
    type: "Discrepancia de rendici\u00f3n",
    category: "Financiera",
    categoryLabel: "Discrepancia de rendici\u00f3n",
    priority: "Alta",
    status: "Pendiente",
    driverId: driverProfile.id,
    driverName: driverProfile.name,
    remittanceId,
    reason,
    notes,
    reportedByType: driverProfile.driverType || "Conductor",
    reportedById: driverProfile.id,
    reportedByName: driverProfile.name,
    involvedType: "Administración",
    involvedId: remittance.registeredByUserId || "",
    involvedName: remittance.registeredByName || "Administración",
    createdByUserId: currentUser?.id || "",
    createdByName: currentUser?.name || driverProfile.name,
    createdAt: new Date().toISOString(),
    subject: "Discrepancia de rendici\u00f3n",
    message: notes || reason,
    assignedTo: "Administración",
    resolutionNote: "",
  };

  window.ElaraAdminIncidentsMock.incidents.push(incident);
  window.dispatchEvent(new CustomEvent("elara:admin-incidents-updated", { detail: { reason: "driver-remittance-discrepancy", incidentId, remittanceId, driverId: driverProfile.id } }));
  returnToFinanceDetailAfterDiscrepancy = false;
  closeModal("driver-finance-discrepancy-modal");
  closeModal("driver-finance-detail-modal");
  window.ElaraNotifications.showToast("Discrepancia enviada para revision.", "success");
  renderDriverFinances();
}

async function submitRealDriverFinanceDiscrepancy() {
  if (isSubmittingDriverFinanceDiscrepancy) {
    return;
  }

  if (!refreshDriverProfile()) {
    window.ElaraNotifications.showToast(driverAccessMessage || DRIVER_NO_PORTAL_ACCESS_MESSAGE, "error");
    return;
  }

  if (!window.ElaraSupabase?.client) {
    showDriverFinanceDiscrepancyError("No hay conexion disponible para reportar la discrepancia.");
    return;
  }

  const remittanceId = getInputValue("driver-finance-discrepancy-remittance-id");
  const description = getDriverFinanceDiscrepancyDescription();
  const remittance = getDriverFinanceRemittanceById(remittanceId);

  if (!remittance || !remittanceId) {
    showDriverFinanceDiscrepancyError("No se pudo identificar la rendicion real.");
    return;
  }

  if (!canDriverReportRealFinanceDiscrepancy(remittance)) {
    showDriverFinanceDiscrepancyError("Esta rendicion no permite reportar discrepancias.");
    return;
  }

  if (!description) {
    showDriverFinanceDiscrepancyError("Describe la discrepancia.");
    return;
  }

  isSubmittingDriverFinanceDiscrepancy = true;
  setDriverFinanceDiscrepancySubmitDisabled(true, "Registrando...");
  clearDriverFinanceDiscrepancyError();

  try {
    const { data, error } = await window.ElaraSupabase.client.rpc("create_driver_cash_discrepancy", {
      p_remittance_id: remittanceId,
      p_description: description,
    });

    if (error) {
      throw error;
    }

    const discrepancy = Array.isArray(data) ? data[0] : data;
    returnToFinanceDetailAfterDiscrepancy = false;
    closeModal("driver-finance-discrepancy-modal");
    closeModal("driver-finance-detail-modal");
    window.ElaraNotifications.showToast("Discrepancia reportada correctamente.", "success");

    try {
      await loadDriverCashFinances({ force: true });
    } catch (refreshError) {
      console.error("[ELARA Driver] Discrepancia creada, pero no se pudo refrescar Mis finanzas.", {
        message: refreshError?.message || "",
        code: refreshError?.code || "",
        discrepancyId: discrepancy?.discrepancy_id || "",
      });
    }

    renderDriverFinances();
  } catch (error) {
    console.error("[ELARA Driver] No se pudo reportar la discrepancia real de rendicion.", {
      message: error?.message || "",
      code: error?.code || "",
      details: error?.details || "",
      remittanceId,
    });
    showDriverFinanceDiscrepancyError(getDriverFinanceDiscrepancyErrorMessage(error));
  } finally {
    isSubmittingDriverFinanceDiscrepancy = false;
    setDriverFinanceDiscrepancySubmitDisabled(false);
  }
}

function canDriverReportRealFinanceDiscrepancy(remittance) {
  if (!shouldUseRealDriverFinances()) {
    return true;
  }

  return ["submitted", "received", "verified"].includes(String(remittance?.rawStatus || "").trim());
}

function getDriverFinanceDiscrepancyRemittanceRpcId(remittance) {
  return shouldUseRealDriverFinances() ? remittance?.remittanceUuid || "" : getDriverFinanceRemittanceId(remittance);
}

function getDriverFinanceDiscrepancyDescription() {
  return getInputValue("driver-finance-discrepancy-notes").trim();
}

function setDriverFinanceDiscrepancyMode(isRealFinance) {
  const summary = getElement("driver-finance-discrepancy-summary");
  const reasonField = getElement("driver-finance-discrepancy-reason-field");
  const reasonInput = getElement("driver-finance-discrepancy-reason");
  const descriptionField = getElement("driver-finance-discrepancy-description-field");
  const descriptionLabel = descriptionField?.querySelector("span");
  const descriptionInput = getElement("driver-finance-discrepancy-notes");

  if (summary) {
    summary.hidden = !isRealFinance;
  }

  if (reasonField) {
    reasonField.hidden = isRealFinance;
  }

  if (reasonInput) {
    reasonInput.required = !isRealFinance;
    reasonInput.disabled = isRealFinance;
  }

  if (descriptionField) {
    descriptionField.classList.toggle("field--optional", !isRealFinance);
  }

  if (descriptionLabel) {
    descriptionLabel.textContent = isRealFinance ? "Descripcion de la discrepancia *" : "Observaciones";
  }

  if (descriptionInput) {
    descriptionInput.required = isRealFinance;
    descriptionInput.disabled = false;
  }
}

function renderDriverFinanceDiscrepancySummary(remittance) {
  setText("driver-finance-discrepancy-summary-id", getDriverFinanceRemittanceId(remittance) || "-");
  setText("driver-finance-discrepancy-summary-declared", formatDriverFinanceMoney(remittance?.declaredAmount ?? remittance?.amount, remittance?.currencyCode));
  setText(
    "driver-finance-discrepancy-summary-verified",
    remittance?.verifiedAmount === null || remittance?.verifiedAmount === undefined ? "-" : formatDriverFinanceMoney(remittance.verifiedAmount, remittance.currencyCode),
  );
  setText("driver-finance-discrepancy-summary-status", getDriverFinanceRemittanceStatus(remittance));
}

function getDriverFinanceDiscrepancyErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (code === "42501" || message.includes("valid conductor active context")) {
    return "No tienes permiso para reportar esta discrepancia.";
  }

  if (message.includes("open discrepancy already exists") || code === "23505") {
    return "Ya existe una discrepancia abierta para esta rendicion.";
  }

  if (message.includes("status does not allow")) {
    return "Esta rendicion no permite reportar discrepancias.";
  }

  if (message.includes("description")) {
    return "Describe la discrepancia sin HTML.";
  }

  return "No se pudo reportar la discrepancia. Intentalo nuevamente.";
}
function closeDriverFinanceDiscrepancyModal({ returnToDetail = false } = {}) {
  closeModal("driver-finance-discrepancy-modal");
  setDriverFinanceDiscrepancySubmitDisabled(false);

  const remittanceId = getInputValue("driver-finance-discrepancy-remittance-id") || selectedDriverFinanceRemittanceId;
  const shouldReturnToDetail = returnToDetail && returnToFinanceDetailAfterDiscrepancy && remittanceId;
  returnToFinanceDetailAfterDiscrepancy = false;

  if (shouldReturnToDetail) {
    openDriverFinanceRemittanceDetail(remittanceId);
  }
}

function getDriverFinanceRemittanceById(remittanceId) {
  const id = String(remittanceId || "").trim();

  if (!id || !driverProfile) {
    return null;
  }

  if (shouldUseRealDriverFinances()) {
    return getDriverFinanceAllRemittances().find((remittance) => getDriverFinanceRemittanceId(remittance) === id || remittance.remittanceUuid === id) || null;
  }

  if (!window.ElaraCash || typeof window.ElaraCash.findCashRemittance !== "function") {
    return null;
  }

  const remittance = window.ElaraCash.findCashRemittance(id);

  return remittance && remittance.driverId === driverProfile.id ? remittance : null;
}

function hasOpenDriverFinanceDiscrepancy(remittanceId) {
  return (window.ElaraAdminIncidentsMock?.incidents || []).some(
    (incident) =>
      normalizeDriverText(incident.type) === "discrepancia de rendicion" &&
      normalizeDriverText(incident.status) !== "resuelta" &&
      incident.driverId === driverProfile?.id &&
      incident.remittanceId === remittanceId,
  );
}

function getDriverFinanceRemittanceId(remittance) {
  return String(remittance?.remittanceId || remittance?.id || "").trim();
}

function getDriverFinanceRemittanceStatus(remittance) {
  if (shouldUseRealDriverFinances()) {
    return DRIVER_FINANCE_REMITTANCE_STATUS_LABELS[remittance?.rawStatus] || remittance?.rawStatus || "-";
  }

  if (window.ElaraCash && typeof window.ElaraCash.getCashRemittanceStatus === "function") {
    return window.ElaraCash.getCashRemittanceStatus(remittance);
  }

  return remittance?.status === "Anulada" || remittance?.annulledAt ? "Anulada" : "Valida";
}
function getDriverFinanceRemittanceDifferenceLabel(remittance) {
  if (shouldUseRealDriverFinances()) {
    return "No disponible en esta fase";
  }

  if (window.ElaraCash && typeof window.ElaraCash.getCashRemittanceDifferenceLabel === "function") {
    return window.ElaraCash.getCashRemittanceDifferenceLabel(remittance);
  }

  return "Sin diferencia";
}

function getDefaultDriverFinanceFilters() {
  return {
    status: "",
    from: "",
    to: "",
    remittanceId: "",
  };
}
function formatDriverDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDriverFinanceMoney(value, currencyCode = "") {
  if (!shouldUseRealDriverFinances() && window.ElaraCash && typeof window.ElaraCash.formatCashMoney === "function") {
    return window.ElaraCash.formatCashMoney(value);
  }

  const currency = String(currencyCode || driverFinanceLoadState.summary?.currencyCode || "").trim().toUpperCase();
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;

  if (!currency) {
    return formatDriverMoney(safeAmount);
  }

  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(safeAmount);
  } catch (error) {
    return `${safeAmount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

function formatDriverFinanceDateTime(value) {
  if (!value) {
    return "-";
  }

  if (!shouldUseRealDriverFinances() && window.ElaraCash && typeof window.ElaraCash.formatCashDateTime === "function") {
    return window.ElaraCash.formatCashDateTime(value);
  }

  return new Date(value).toLocaleString("es-ES");
}

function showDriverFinanceDiscrepancyError(message) {
  const error = getElement("driver-finance-discrepancy-error");

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearDriverFinanceDiscrepancyError() {
  const error = getElement("driver-finance-discrepancy-error");

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function setDriverFinanceDiscrepancySubmitDisabled(disabled, label = "") {
  const submitButton = document.querySelector('#driver-finance-discrepancy-form button[type="submit"]');

  if (!submitButton) {
    return;
  }

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent || "Enviar discrepancia";
  }

  submitButton.disabled = Boolean(disabled);
  submitButton.textContent = disabled ? label || "Registrando..." : submitButton.dataset.defaultLabel;
}

function renderDriverExpenseLoadingState() {
  const summary = getElement("driver-expense-summary");
  const list = getElement("driver-expense-list");
  const meta = getElement("driver-expense-meta");
  const pagination = getElement("driver-expense-pagination");

  if (summary) {
    summary.innerHTML = "";
  }

  if (meta) {
    meta.textContent = "Cargando gastos...";
  }

  if (pagination) {
    pagination.innerHTML = "";
  }

  if (list) {
    list.innerHTML = `<p class="driver-empty" role="status" aria-live="polite">Cargando gastos...</p>`;
  }
}

function getDriverExpenseSummaryCurrency(expenses) {
  const currencyCodes = Array.from(new Set(expenses.map((expense) => expense.currencyCode).filter(Boolean)));
  return currencyCodes.length === 1 ? currencyCodes[0] : "";
}
function renderDriverExpenses() {
  renderDriverExpenseFilters();
  renderDriverExpenseSummary();
  renderDriverExpenseList();
}

function setDriverExpenseCreateButtonVisibility(isVisible) {
  document.querySelectorAll('[data-driver-action="expense-new"]').forEach((button) => {
    button.hidden = !isVisible;
    button.disabled = false;
    button.textContent = "Nueva solicitud";
    button.title = "";
  });
}

function renderDriverExpenseFilters() {
  const statusSelect = getElement("driver-expense-filter-status");
  const categorySelect = getElement("driver-expense-filter-category");
  const filtersContainer = getElement("driver-expense-filters");
  const filterButton = getElement("driver-expense-filter-toggle");
  const statusOptions = getDriverExpenseStatusFilterOptions();
  const categoryOptions = getDriverExpenseFilterCategories();
  const mode = shouldUseRealDriverExpenses() ? "real" : "mock";
  const categorySignature = categoryOptions.map((category) => `${category.value}:${category.label}`).join("|");

  if (driverExpenseFilters.status && !statusOptions.some((option) => option.value === driverExpenseFilters.status)) {
    driverExpenseFilters.status = "";
  }

  if (driverExpenseFilters.category && !categoryOptions.some((category) => category.value === driverExpenseFilters.category)) {
    driverExpenseFilters.category = "";
  }

  if (statusSelect && statusSelect.dataset.mode !== mode) {
    statusSelect.innerHTML = statusOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
    statusSelect.dataset.mode = mode;
  }

  if (categorySelect && (categorySelect.dataset.mode !== mode || categorySelect.dataset.signature !== categorySignature)) {
    categorySelect.innerHTML = `<option value="">Todas</option>${categoryOptions
      .map((category) => `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label)}</option>`)
      .join("")}`;
    categorySelect.dataset.mode = mode;
    categorySelect.dataset.signature = categorySignature;
  }

  [
    ["driver-expense-filter-status", "status"],
    ["driver-expense-filter-category", "category"],
    ["driver-expense-filter-from", "from"],
    ["driver-expense-filter-to", "to"],
    ["driver-expense-filter-query", "query"],
  ].forEach(([id, key]) => {
    const element = getElement(id);

    if (element && element.value !== driverExpenseFilters[key]) {
      element.value = driverExpenseFilters[key] || "";
    }
  });

  if (filtersContainer) {
    filtersContainer.hidden = !areDriverExpenseFiltersVisible;
  }

  if (filterButton) {
    const count = getDriverExpenseFilterCount();
    filterButton.textContent = count ? `Filtro - ${count}` : "Filtro";
    filterButton.setAttribute("aria-expanded", areDriverExpenseFiltersVisible ? "true" : "false");
  }
}
function renderDriverExpenseSummary() {
  const container = getElement("driver-expense-summary");

  if (!container) {
    return;
  }

  if (isDriverExpensesLoading() || (shouldUseRealDriverExpenses() && driverExpensesLoadState.status === "error")) {
    container.innerHTML = "";
    return;
  }

  const expenses = getFilteredDriverExpenses();
  let cards;

  if (shouldUseRealDriverExpenses()) {
    const summary = expenses.reduce(
      (acc, expense) => {
        acc.totalAmount += getDriverExpenseAmount(expense.amount);
        acc.requestCount += 1;

        if (expense.rawReimbursementStatus === "pending") {
          acc.pendingReimbursement += getDriverExpenseAmount(expense.amount);
        }

        if (expense.rawReimbursementStatus === "reimbursed") {
          acc.reimbursed += expense.reimbursedAmount === null || expense.reimbursedAmount === undefined ? 0 : getDriverExpenseAmount(expense.reimbursedAmount);
        }

        return acc;
      },
      {
        totalAmount: 0,
        pendingReimbursement: 0,
        reimbursed: 0,
        requestCount: 0,
      },
    );
    const currencyCode = getDriverExpenseSummaryCurrency(expenses);

    cards = [
      ["Total gastos", formatDriverExpenseMoney(summary.totalAmount, currencyCode), "neutral"],
      ["Pendiente reembolso", formatDriverExpenseMoney(summary.pendingReimbursement, currencyCode), "warning"],
      ["Reembolsado", formatDriverExpenseMoney(summary.reimbursed, currencyCode), "success"],
      ["Solicitudes", String(summary.requestCount), "neutral"],
    ];
  } else {
    const summary = expenses.reduce(
      (acc, expense) => {
        if (expense.status !== "Anulada") {
          acc.totalRequested += getDriverExpenseAmount(expense.amountRequested);
        }

        if (expense.status === "Pendiente de revisi\u00f3n") {
          acc.pendingReview += 1;
        }

        if (expense.status === "Requiere informaci\u00f3n") {
          acc.requiresInfo += 1;
        }

        if (expense.reimbursement?.required && expense.reimbursement.status === "Pendiente") {
          acc.pendingReimbursement += getDriverExpenseAmount(expense.reimbursement.amount || expense.amountApproved);
        }

        if (expense.reimbursement?.status === "Pagado" || expense.status === "Reembolsada") {
          acc.reimbursed += getDriverExpenseAmount(expense.reimbursement?.amount || expense.amountApproved);
        }

        if (expense.status === "Rechazada") {
          acc.rejected += 1;
        }

        return acc;
      },
      {
        totalRequested: 0,
        pendingReview: 0,
        requiresInfo: 0,
        pendingReimbursement: 0,
        reimbursed: 0,
        rejected: 0,
      },
    );

    cards = [
      ["Total solicitado", formatDriverExpenseMoney(summary.totalRequested), "neutral"],
      ["Pendientes revision", String(summary.pendingReview), "warning"],
      ["Requiere info", String(summary.requiresInfo), summary.requiresInfo ? "danger" : "neutral"],
      ["Pendiente reembolso", formatDriverExpenseMoney(summary.pendingReimbursement), "warning"],
      ["Reembolsado", formatDriverExpenseMoney(summary.reimbursed), "success"],
      ["Rechazadas", String(summary.rejected), summary.rejected ? "danger" : "neutral"],
    ];
  }

  container.innerHTML = cards
    .map(
      ([label, value, tone]) => `
        <article class="summary-card summary-card--${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}
function renderDriverExpenseList() {
  const container = getElement("driver-expense-list");
  const meta = getElement("driver-expense-meta");
  const pagination = getElement("driver-expense-pagination");

  if (!container) {
    return;
  }

  if (isDriverExpensesLoading()) {
    renderDriverExpenseLoadingState();
    return;
  }

  if (shouldUseRealDriverExpenses() && driverExpensesLoadState.status === "error") {
    if (meta) {
      meta.textContent = "";
    }
    if (pagination) {
      pagination.innerHTML = "";
    }
    container.innerHTML = `<p class="driver-empty" role="alert">No se pudieron cargar los gastos. Intentalo nuevamente.</p>`;
    return;
  }

  const expenses = getFilteredDriverExpenses();
  const totalPages = Math.max(1, Math.ceil(expenses.length / DRIVER_EXPENSE_PAGE_SIZE));
  driverExpensePage = Math.min(Math.max(driverExpensePage, 1), totalPages);
  const pageStart = (driverExpensePage - 1) * DRIVER_EXPENSE_PAGE_SIZE;
  const pageItems = expenses.slice(pageStart, pageStart + DRIVER_EXPENSE_PAGE_SIZE);

  if (meta) {
    meta.textContent = `${expenses.length} resultado${expenses.length === 1 ? "" : "s"} - Página ${driverExpensePage} de ${totalPages}`;
  }

  if (!pageItems.length) {
    const hasAnyRealExpenses = shouldUseRealDriverExpenses() && getDriverOwnExpenses().length > 0;
    const emptyMessage = shouldUseRealDriverExpenses() && !hasAnyRealExpenses ? "No tienes gastos registrados." : "No hay gastos para los filtros seleccionados.";
    container.innerHTML = `<p class="driver-empty">${escapeHtml(emptyMessage)}</p>`;
    renderDriverExpensePagination(pagination, driverExpensePage, totalPages);
    return;
  }

  container.innerHTML = pageItems.map(renderDriverExpenseRow).join("");
  renderDriverExpensePagination(pagination, driverExpensePage, totalPages);
}
function renderDriverExpenseRow(expense) {
  if (expense?.isRealDriverExpense) {
    const relation = [expense.serviceHumanCode ? `Servicio ${expense.serviceHumanCode}` : "", expense.vehicleHumanCode ? `Vehiculo ${expense.vehicleHumanCode}` : ""]
      .filter(Boolean)
      .join(" - ") || "Sin relacion operativa";
    const reimbursedAmount = expense.reimbursedAmount === null || expense.reimbursedAmount === undefined ? "-" : formatDriverExpenseMoney(expense.reimbursedAmount, expense.currencyCode);
    const detailId = expense.expenseUuid || expense.expenseId;

    return `
      <article class="driver-expense-row">
        <div class="driver-expense-row__main">
          <div>
            <strong>${escapeHtml(expense.expenseId)}</strong>
            <span>${escapeHtml(formatDriverExpenseDate(expense.expenseDate))} - ${escapeHtml(expense.category)}</span>
          </div>
          <h3>${escapeHtml(expense.description || expense.expenseId)}</h3>
          <p>${escapeHtml(relation)} - Estado gasto: ${escapeHtml(expense.status)}</p>
        </div>
        <div class="driver-expense-row__side">
          <strong>${escapeHtml(formatDriverExpenseMoney(expense.amount, expense.currencyCode))}</strong>
          <small>Reembolsado: ${escapeHtml(reimbursedAmount)}</small>
          ${renderDriverExpenseStatusBadge(expense.reimbursementStatus)}
          <button class="button button--compact button--muted" type="button" data-driver-action="expense-detail" data-expense-id="${escapeHtml(detailId)}">Detalle</button>
        </div>
      </article>
    `;
  }

  const approvedAmount = expense.amountApproved === null || expense.amountApproved === undefined ? "-" : formatDriverExpenseMoney(expense.amountApproved);
  const relation = [getDriverExpenseServiceLabel(expense.serviceId), getDriverExpenseVehicleLabel(expense.vehicleId)].filter(Boolean).join(" - ") || "Sin relacion";

  return `
    <article class="driver-expense-row">
      <div class="driver-expense-row__main">
        <div>
          <strong>${escapeHtml(expense.expenseId)}</strong>
          <span>${escapeHtml(formatDriverExpenseDate(expense.expenseDate))} - ${escapeHtml(expense.category)}</span>
        </div>
        <h3>${escapeHtml(expense.concept)}</h3>
        <p>${escapeHtml(relation)}</p>
      </div>
      <div class="driver-expense-row__side">
        <strong>${escapeHtml(formatDriverExpenseMoney(expense.amountRequested))}</strong>
        <small>Aprobado: ${escapeHtml(approvedAmount)}</small>
        ${renderDriverExpenseStatusBadge(expense.status)}
        <button class="button button--compact button--muted" type="button" data-driver-action="expense-detail" data-expense-id="${escapeHtml(expense.expenseId)}">Detalle</button>
      </div>
    </article>
  `;
}
function renderDriverExpensePagination(container, currentPage, totalPages) {
  if (!container) {
    return;
  }

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="button button--compact button--muted" type="button" data-driver-action="expense-page" data-expense-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Página ${escapeHtml(currentPage)} de ${escapeHtml(totalPages)}</span>
    <button class="button button--compact button--muted" type="button" data-driver-action="expense-page" data-expense-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Siguiente</button>
  `;
}

function handleDriverExpenseFilterChange() {
  driverExpenseFilters = {
    status: getInputValue("driver-expense-filter-status"),
    category: getInputValue("driver-expense-filter-category"),
    from: getInputValue("driver-expense-filter-from"),
    to: getInputValue("driver-expense-filter-to"),
    query: getInputValue("driver-expense-filter-query"),
  };
  driverExpensePage = 1;
  renderDriverExpenses();
}

function toggleDriverExpenseFilters() {
  areDriverExpenseFiltersVisible = !areDriverExpenseFiltersVisible;
  renderDriverExpenseFilters();
}

function clearDriverExpenseFilters() {
  driverExpenseFilters = getDefaultDriverExpenseFilters();
  driverExpensePage = 1;
  renderDriverExpenses();
}

async function openDriverExpenseDetail(expenseId) {
  const normalizedExpenseId = String(expenseId || "").trim();

  if (shouldUseRealDriverExpenses()) {
    if (!normalizedExpenseId) {
      window.ElaraNotifications.showToast("No se encontro el gasto seleccionado.", "warning");
      return;
    }

    selectedDriverExpenseId = normalizedExpenseId;
    renderDriverExpenseDetailLoadingState(normalizedExpenseId);
    openModal("driver-expense-detail-modal");

    try {
      const expense = await loadDriverExpenseDetail(normalizedExpenseId);

      if (!expense) {
        window.ElaraNotifications.showToast("No se encontro el gasto seleccionado.", "warning");
        closeDriverExpenseModals();
        return;
      }

      selectedDriverExpenseId = expense.expenseUuid || expense.expenseId;
      renderDriverExpenseDetail(expense);
    } catch (error) {
      console.error("[ELARA Driver] No se pudo cargar el detalle real del gasto.", { error: error?.message || error });
      renderDriverExpenseDetailErrorState();
    }
    return;
  }

  const expense = getDriverExpenseById(expenseId);

  if (!expense) {
    window.ElaraNotifications.showToast("No se encontro la solicitud seleccionada.", "warning");
    return;
  }

  selectedDriverExpenseId = expense.expenseId;
  renderDriverExpenseDetail(expense);
  openModal("driver-expense-detail-modal");
}
function renderDriverExpenseDetail(expense) {
  const container = getElement("driver-expense-detail-content");
  const actions = getElement("driver-expense-detail-actions");

  if (!container || !actions) {
    return;
  }

  setText("driver-expense-detail-title", `Detalle ${expense.expenseId}`);

  if (expense?.isRealDriverExpense) {
    container.innerHTML = `
      ${renderDriverExpenseDetailSection("Gasto", [
        ["Codigo", expense.expenseId],
        ["Estado", expense.status],
        ["Estado de reembolso", expense.reimbursementStatus],
        ["Estado pago operativo", expense.paymentStatus],
        ["Categoria", expense.category],
        ["Fecha del gasto", formatDriverExpenseDate(expense.expenseDate)],
      ])}
      ${renderDriverExpenseAmountSummary(expense)}
      ${renderDriverExpenseDetailSection("Relacion operativa", [
        ["Servicio", expense.serviceHumanCode || "Sin servicio vinculado"],
        ["Vehiculo", expense.vehicleHumanCode || "Sin vehiculo vinculado"],
      ])}
      ${renderDriverExpenseDetailSection("Descripcion", [
        ["Detalle", expense.description || "Sin descripcion"],
      ])}
      ${renderDriverExpenseReviewSection(expense)}
      ${renderDriverExpenseReimbursementSection(expense)}
    `;
    actions.innerHTML = `<button class="button button--secondary" type="button" data-modal-close>Cerrar</button>`;
    return;
  }

  container.innerHTML = `
    ${renderDriverExpenseDetailSection("Solicitud", [
      ["Estado", expense.status],
      ["Categoria", expense.category],
      ["Concepto", expense.concept],
      ["Fecha del gasto", formatDriverExpenseDate(expense.expenseDate)],
      ["Metodo declarado", expense.paymentMethod],
      ["Proveedor", expense.providerName || "Sin proveedor"],
      ["Comprobante", getDriverExpenseReceiptLabel(expense.receipt)],
    ])}
    ${renderDriverExpenseAmountSummary(expense)}
    ${renderDriverExpenseDetailSection("Relacion operativa", [
      ["Servicio", getDriverExpenseServiceLabel(expense.serviceId) || "Sin servicio vinculado"],
      ["Vehiculo", getDriverExpenseVehicleLabel(expense.vehicleId) || "Sin vehiculo vinculado"],
      ["Registrado por", expense.createdByName || "Sistema"],
    ])}
    ${renderDriverExpenseDetailSection("Descripcion", [
      ["Detalle", expense.description || "Sin descripcion"],
      ["Observaciones", expense.observations || "Sin observaciones"],
    ])}
    ${renderDriverExpenseReviewSection(expense)}
    ${renderDriverExpenseReimbursementSection(expense)}
  `;

  actions.innerHTML = `
    ${
      canDriverRespondExpense(expense)
        ? `<button class="button button--primary" type="button" data-driver-action="expense-respond">Responder solicitud</button>`
        : ""
    }
    <button class="button button--secondary" type="button" data-modal-close>Cerrar</button>
  `;
}

function renderDriverExpenseDetailLoadingState(expenseId) {
  setText("driver-expense-detail-title", `Detalle ${expenseId || "gasto"}`);
  const container = getElement("driver-expense-detail-content");
  const actions = getElement("driver-expense-detail-actions");

  if (container) {
    container.innerHTML = `<p class="driver-empty" role="status" aria-live="polite">Cargando gastos...</p>`;
  }

  if (actions) {
    actions.innerHTML = `<button class="button button--secondary" type="button" data-modal-close>Cerrar</button>`;
  }
}

function renderDriverExpenseDetailErrorState() {
  const container = getElement("driver-expense-detail-content");
  const actions = getElement("driver-expense-detail-actions");

  if (container) {
    container.innerHTML = `<p class="driver-empty" role="alert">No se pudo cargar el detalle del gasto.</p>`;
  }

  if (actions) {
    actions.innerHTML = `<button class="button button--secondary" type="button" data-modal-close>Cerrar</button>`;
  }
}
function renderDriverExpenseDetailSection(title, fields) {
  return `
    <section class="expense-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <dl class="modal__fields-grid">
        ${fields.map(([label, value]) => renderModalField(label, value)).join("")}
      </dl>
    </section>
  `;
}

function renderDriverExpenseAmountSummary(expense) {
  if (expense?.isRealDriverExpense) {
    return renderDriverExpenseDetailSection("Importes", [
      ["Importe", formatDriverExpenseMoney(expense.amount, expense.currencyCode)],
      ["Reembolsado", formatDriverExpenseMoney(expense.reimbursedAmount, expense.currencyCode)],
      ["Reembolsos", formatDriverExpenseCount(expense.completedReimbursementCount)],
    ]);
  }

  return renderDriverExpenseDetailSection("Importes", [
    ["Solicitado", formatDriverExpenseMoney(expense.amountRequested)],
    ["Aprobado", formatDriverExpenseMoney(expense.amountApproved)],
    ["Pagado", formatDriverExpenseMoney(expense.amountPaid)],
  ]);
}
function renderDriverExpenseReviewSection(expense) {
  if (expense?.isRealDriverExpense) {
    const rows = [];

    if (expense.rejectionReason) {
      rows.push(["Motivo rechazo", expense.rejectionReason]);
    }

    return rows.length ? renderDriverExpenseDetailSection("Revision", rows) : "";
  }

  if (!expense.review) {
    return "";
  }

  return renderDriverExpenseDetailSection("Revision", [
    ["Responsable", expense.review.responsible || "Pendiente"],
    ["Fecha", formatDriverExpenseDate(expense.review.reviewedAt)],
    ["Comentario", expense.review.comment || "Sin comentarios"],
  ]);
}
function renderDriverExpenseReimbursementSection(expense) {
  if (expense?.isRealDriverExpense) {
    return renderDriverExpenseDetailSection("Reembolso", [
      ["Estado", expense.reimbursementStatus],
      ["Importe", formatDriverExpenseMoney(expense.reimbursedAmount, expense.currencyCode)],
      ["Ultimo reembolso", formatDriverExpenseDate(expense.lastReimbursedAt)],
      ["Reembolsos completados", formatDriverExpenseCount(expense.completedReimbursementCount)],
    ]);
  }

  if (!expense.reimbursement?.required && expense.reimbursement?.status !== "Pagado") {
    return "";
  }

  return renderDriverExpenseDetailSection("Reembolso", [
    ["Estado", expense.reimbursement.status],
    ["Importe", formatDriverExpenseMoney(expense.reimbursement.amount)],
    ["Fecha", expense.reimbursement.paidAt ? formatDriverExpenseDateTime(expense.reimbursement.paidAt) : "-"],
    ["Referencia Caja", expense.reimbursement.cashMovementId || "-"],
  ]);
}
function openDriverExpenseNewModal() {
  if (!refreshDriverProfile() || !canDriverExpenseAction("expenses:createOwn")) {
    window.ElaraNotifications.showToast("No tienes permiso para crear solicitudes de gastos.", "error");
    return;
  }

  getElement("driver-expense-new-form")?.reset();
  populateDriverExpenseNewFormOptions();
  setInputValue("driver-expense-new-date", formatDriverDateInputValue(new Date()));
  setInputValue("driver-expense-new-method", "Efectivo");
  setInputValue("driver-expense-new-receipt-status", "Adjunto");
  showDriverExpenseFormError("driver-expense-new-error", "");
  openModal("driver-expense-new-modal");
  getElement("driver-expense-new-category")?.focus();
}
function populateDriverExpenseNewFormOptions() {
  const categorySelect = getElement("driver-expense-new-category");
  const vehicleSelect = getElement("driver-expense-new-vehicle");
  const serviceSelect = getElement("driver-expense-new-service");
  const realMode = shouldUseRealDriverExpenses();

  if (categorySelect) {
    if (realMode) {
      const selectedCategory = categorySelect.value;
      categorySelect.innerHTML = '<option value="">Cargando categorias...</option>';
      categorySelect.disabled = true;
      loadDriverExpenseCategories()
        .then((categories) => {
          renderDriverExpenseNewCategoryOptions(categories, selectedCategory);
        })
        .catch((error) => {
          console.error("[ELARA Driver] No se pudieron cargar las categorias reales de gastos.", { error: error?.message || error });
          categorySelect.innerHTML = '<option value="">No se pudieron cargar categorias</option>';
          showDriverExpenseFormError("driver-expense-new-error", "No se pudieron cargar las categorias de gastos.");
        });
    } else {
      categorySelect.disabled = false;
      categorySelect.innerHTML = `<option value="">Selecciona categoria</option>${getDriverExpenseCategories()
        .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join("")}`;
    }
  }

  if (vehicleSelect) {
    if (realMode) {
      vehicleSelect.disabled = true;
      vehicleSelect.innerHTML = '<option value="">Se deriva automaticamente</option>';
    } else {
      vehicleSelect.disabled = false;
      const assignedVehicle = driverProfile?.vehicleId ? getDriverVehicleById(driverProfile.vehicleId) : null;
      vehicleSelect.innerHTML = `<option value="">Sin vehiculo</option>${
        assignedVehicle
          ? `<option value="${escapeHtml(assignedVehicle.id)}">${escapeHtml(getDriverExpenseVehicleLabel(assignedVehicle.id))}</option>`
          : ""
      }`;
    }
  }

  if (serviceSelect) {
    if (realMode) {
      const selectedService = serviceSelect.value;
      renderDriverExpenseNewServiceLoadingOptions();
      loadDriverServices()
        .then((services) => {
          driverServices = services;
          renderDriverExpenseNewServiceOptions(selectedService);
          syncDriverExpenseVehicleFromService();
        })
        .catch((error) => {
          console.error("[ELARA Driver] No se pudieron cargar servicios reales para la solicitud de gasto.", { error: error?.message || error });
          renderDriverExpenseNewServiceOptions(selectedService);
          showDriverExpenseFormError("driver-expense-new-error", "No se pudieron cargar los servicios asociables.");
        });
    } else {
      renderDriverExpenseNewServiceOptions(serviceSelect.value);
    }
  }
}

function renderDriverExpenseNewServiceLoadingOptions() {
  const serviceSelect = getElement("driver-expense-new-service");

  if (!serviceSelect) {
    return;
  }

  serviceSelect.innerHTML = '<option value="">Cargando servicios...</option>';
}

function renderDriverExpenseNewCategoryOptions(categories, selectedValue = "") {
  const categorySelect = getElement("driver-expense-new-category");

  if (!categorySelect) {
    return;
  }

  categorySelect.disabled = false;
  categorySelect.innerHTML = `<option value="">Selecciona categoria</option>${categories
    .filter((category) => category.value)
    .map((category) => `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label || category.value)}</option>`)
    .join("")}`;

  if (selectedValue) {
    categorySelect.value = selectedValue;
  }
}

function renderDriverExpenseNewServiceOptions(selectedValue = "") {
  const serviceSelect = getElement("driver-expense-new-service");

  if (!serviceSelect) {
    return;
  }

  serviceSelect.innerHTML = `<option value="">Sin servicio</option>${getDriverExpenseOwnServices()
    .map((service) => {
      const serviceValue = shouldUseRealDriverExpenses() ? service.centralServiceId || service.id : service.serviceId;
      return `<option value="${escapeHtml(serviceValue)}">${escapeHtml(getDriverExpenseServiceLabel(serviceValue))}</option>`;
    })
    .join("")}`;

  if (selectedValue) {
    serviceSelect.value = selectedValue;
  }
}

async function submitDriverExpenseRequest(event) {
  event.preventDefault();

  if (shouldUseRealDriverExpenses()) {
    await submitRealDriverExpenseRequest();
    return;
  }
  if (isSubmittingDriverExpense) {
    return;
  }

  if (!refreshDriverProfile() || !canDriverExpenseAction("expenses:createOwn")) {
    showDriverExpenseFormError("driver-expense-new-error", "No tienes permiso para crear solicitudes de gastos.");
    return;
  }

  const payload = getDriverExpenseNewPayload();
  const localError = validateDriverExpenseOwnReferences(payload);

  if (localError) {
    showDriverExpenseFormError("driver-expense-new-error", localError);
    return;
  }

  if (!window.ElaraExpensesCore || typeof window.ElaraExpensesCore.createExpenseRecord !== "function") {
    showDriverExpenseFormError("driver-expense-new-error", "No se pudo registrar la solicitud. Intentalo nuevamente.");
    return;
  }

  isSubmittingDriverExpense = true;
  const result = window.ElaraExpensesCore.createExpenseRecord(payload, getDriverAuthenticatedUser());
  isSubmittingDriverExpense = false;

  if (!result.ok) {
    showDriverExpenseFormError("driver-expense-new-error", result.error || "Revisa los campos marcados antes de continuar.");
    return;
  }

  closeModal("driver-expense-new-modal");
  window.ElaraNotifications.showToast("Solicitud de gasto enviada para revision.", "success");
  renderDriverExpenses();
}

function getDriverExpenseNewPayload() {
  const receiptStatus = getInputValue("driver-expense-new-receipt-status");
  const receiptFileName = getInputValue("driver-expense-new-receipt-file");

  return {
    recordType: "Solicitud",
    category: getInputValue("driver-expense-new-category"),
    concept: getInputValue("driver-expense-new-concept"),
    amountRequested: getInputValue("driver-expense-new-amount"),
    expenseDate: getInputValue("driver-expense-new-date"),
    paymentMethod: getInputValue("driver-expense-new-method"),
    providerName: getInputValue("driver-expense-new-provider"),
    vehicleId: getInputValue("driver-expense-new-vehicle") || null,
    serviceId: getInputValue("driver-expense-new-service") || null,
    description: getInputValue("driver-expense-new-description"),
    observations: getInputValue("driver-expense-new-observations"),
    receipt: {
      status: mapDriverExpenseReceiptStatusToCore(receiptStatus),
      fileName: receiptStatus === "Adjunto" && receiptFileName ? receiptFileName : null,
      fileReference: null,
    },
  };
}


async function submitRealDriverExpenseRequest() {
  if (isSubmittingDriverExpense) {
    return;
  }

  if (!window.ElaraSupabase?.client) {
    showDriverExpenseFormError("driver-expense-new-error", "No hay conexion disponible para registrar la solicitud.");
    return;
  }

  const payload = getDriverExpenseNewPayload();
  const rpcPayload = getDriverExpenseRealRpcPayload(payload);
  const validationError = validateDriverRealExpensePayload(rpcPayload);

  if (validationError) {
    showDriverExpenseFormError("driver-expense-new-error", validationError);
    return;
  }

  isSubmittingDriverExpense = true;
  setDriverExpenseSubmitDisabled(true, "Registrando...");
  showDriverExpenseFormError("driver-expense-new-error", "");

  try {
    const { data, error } = await window.ElaraSupabase.client.rpc("create_driver_expense", rpcPayload);

    if (error) {
      throw error;
    }

    const expense = Array.isArray(data) ? data[0] : data;
    closeModal("driver-expense-new-modal");
    window.ElaraNotifications.showToast(`Solicitud de gasto registrada correctamente.${expense?.human_code ? ` ${expense.human_code}` : ""}`, "success");
    resetDriverExpensesLoadState();
    await loadDriverExpenses({ force: true }).catch((error) => {
      console.error("[ELARA Driver] No se pudo refrescar Mis gastos tras crear la solicitud.", { error: error?.message || error });
    });
    renderDriverExpenses();
  } catch (error) {
    console.error("[ELARA Driver] No se pudo registrar la solicitud real de gasto.", { error: error?.message || error });
    showDriverExpenseFormError("driver-expense-new-error", getDriverExpenseCreateErrorMessage(error));
  } finally {
    isSubmittingDriverExpense = false;
    setDriverExpenseSubmitDisabled(false);
  }
}

function getDriverExpenseRealRpcPayload(payload) {
  return {
    p_category_key: String(payload.category || "").trim(),
    p_amount: parseDriverExpenseAmountInput(payload.amountRequested),
    p_expense_date: String(payload.expenseDate || "").trim() || null,
    p_description: getDriverExpenseRealDescription(payload),
    p_service_id: String(payload.serviceId || "").trim() || null,
  };
}

function getDriverExpenseRealDescription(payload) {
  return [payload.concept, payload.description, payload.observations]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function validateDriverRealExpensePayload(payload) {
  if (!payload.p_category_key) {
    return "Selecciona una categoria.";
  }

  if (!Number.isFinite(payload.p_amount) || payload.p_amount <= 0) {
    return "Indica un importe mayor que cero.";
  }

  if (!payload.p_expense_date) {
    return "Selecciona la fecha del gasto.";
  }

  if (!payload.p_description) {
    return "Describe el gasto.";
  }

  if (payload.p_description.length > 2000) {
    return "La descripcion no puede superar 2000 caracteres.";
  }

  return "";
}

function getDriverExpenseCreateErrorMessage(error) {
  const message = String(error?.message || "").trim();
  const normalizedMessage = message.toLowerCase();

  if (!message) {
    return "No se pudo registrar la solicitud de gasto.";
  }

  if (normalizedMessage.includes("valid conductor active context")) {
    return "Tu sesion de conductor no esta disponible. Vuelve a iniciar sesion.";
  }

  if (normalizedMessage.includes("category")) {
    return "Selecciona una categoria de gasto valida.";
  }

  if (normalizedMessage.includes("service")) {
    return "El servicio seleccionado no esta disponible para este conductor.";
  }

  if (normalizedMessage.includes("amount")) {
    return "Indica un importe valido mayor que cero.";
  }

  if (normalizedMessage.includes("description")) {
    return "Describe el gasto antes de registrarlo.";
  }

  return message;
}

function setDriverExpenseSubmitDisabled(disabled, label = "Enviar solicitud") {
  const submit = document.querySelector('#driver-expense-new-form button[type="submit"]');

  if (!submit) {
    return;
  }

  submit.disabled = Boolean(disabled);
  submit.textContent = label;
}
function openDriverExpenseResponseModal(expenseId) {
  if (shouldUseRealDriverExpenses()) {
    window.ElaraNotifications.showToast("Respuesta pendiente de RPC.", "info");
    return;
  }

  const expense = getDriverExpenseById(expenseId);

  if (!expense || !canDriverRespondExpense(expense)) {
    window.ElaraNotifications.showToast("Esta solicitud no requiere informacion adicional.", "warning");
    return;
  }

  setInputValue("driver-expense-response-id", expense.expenseId);
  setText("driver-expense-response-summary-id", expense.expenseId);
  setText("driver-expense-response-summary-concept", expense.concept);
  setText("driver-expense-response-summary-amount", formatDriverExpenseMoney(expense.amountRequested));
  setText("driver-expense-response-admin-message", expense.review?.reason || "Administración solicita informacion adicional.");
  setInputValue("driver-expense-response-text", "");
  setInputValue("driver-expense-response-description", expense.description || "");
  setInputValue("driver-expense-response-provider", expense.providerName || "");
  setInputValue("driver-expense-response-receipt-status", mapDriverExpenseReceiptStatusToDriver(expense.receipt?.status));
  setInputValue("driver-expense-response-observations", expense.observations || "");
  showDriverExpenseFormError("driver-expense-response-error", "");
  openModal("driver-expense-response-modal");
  getElement("driver-expense-response-text")?.focus();
}

function submitDriverExpenseResponse(event) {
  event.preventDefault();

  if (shouldUseRealDriverExpenses()) {
    showDriverExpenseFormError("driver-expense-response-error", "Respuesta pendiente de RPC.");
    return;
  }

  if (isSubmittingDriverExpenseResponse) {
    return;
  }

  if (!refreshDriverProfile() || !canDriverExpenseAction("expenses:respondOwn")) {
    showDriverExpenseFormError("driver-expense-response-error", "No tienes permiso para responder esta solicitud.");
    return;
  }

  const expenseId = getInputValue("driver-expense-response-id") || selectedDriverExpenseId;
  const responseData = {
    response: getInputValue("driver-expense-response-text"),
    description: getInputValue("driver-expense-response-description"),
    providerName: getInputValue("driver-expense-response-provider"),
    receiptStatus: getInputValue("driver-expense-response-receipt-status"),
    observations: getInputValue("driver-expense-response-observations"),
  };

  if (!window.ElaraExpensesCore || typeof window.ElaraExpensesCore.respondExpenseInformation !== "function") {
    showDriverExpenseFormError("driver-expense-response-error", "No se pudo responder la solicitud. Intentalo nuevamente.");
    return;
  }

  isSubmittingDriverExpenseResponse = true;
  const result = window.ElaraExpensesCore.respondExpenseInformation(expenseId, responseData, getDriverAuthenticatedUser());
  isSubmittingDriverExpenseResponse = false;

  if (!result.ok) {
    showDriverExpenseFormError("driver-expense-response-error", result.error || "La respuesta es obligatoria.");
    return;
  }

  closeDriverExpenseModals();
  window.ElaraNotifications.showToast("Informacion enviada para revision.", "success");
  renderDriverExpenses();
}

function getFilteredDriverExpenses() {
  const filters = {
    status: driverExpenseFilters.status,
    category: driverExpenseFilters.category,
    from: driverExpenseFilters.from,
    to: driverExpenseFilters.to,
    query: normalizeDriverText(driverExpenseFilters.query),
  };

  return getDriverOwnExpenses()
    .filter((expense) => {
      if (shouldUseRealDriverExpenses()) {
        if (filters.status && expense.rawReimbursementStatus !== filters.status) {
          return false;
        }

        if (filters.category && getDriverExpenseCategoryFilterValue(expense) !== filters.category) {
          return false;
        }

        if (filters.from && expense.expenseDate < filters.from) {
          return false;
        }

        if (filters.to && expense.expenseDate > filters.to) {
          return false;
        }

        if (filters.query) {
          const haystack = [
            expense.expenseId,
            expense.humanCode,
            expense.description,
            expense.category,
            expense.categoryKey,
            expense.serviceHumanCode,
            expense.vehicleHumanCode,
          ].join(" ");

          if (!normalizeDriverText(haystack).includes(filters.query)) {
            return false;
          }
        }

        return true;
      }

      if (filters.status && expense.status !== filters.status) {
        return false;
      }

      if (filters.category && expense.category !== filters.category) {
        return false;
      }

      if (filters.from && expense.expenseDate < filters.from) {
        return false;
      }

      if (filters.to && expense.expenseDate > filters.to) {
        return false;
      }

      if (filters.query && !normalizeDriverText([expense.expenseId, expense.concept, expense.category, expense.providerName, expense.serviceId, expense.vehicleId].join(" ")).includes(filters.query)) {
        return false;
      }

      return true;
    })
    .sort(compareDriverExpensesByDateDesc);
}

function getDriverExpenseById(expenseId) {
  const normalizedExpenseId = String(expenseId || "").trim();

  return getFilteredDriverExpenses().find((expense) => isDriverExpenseMatchingId(expense, normalizedExpenseId)) || getDriverOwnExpenses().find((expense) => isDriverExpenseMatchingId(expense, normalizedExpenseId)) || null;
}

function isDriverExpenseMatchingId(expense, expenseId) {
  const normalizedExpenseId = String(expenseId || "").trim();

  return Boolean(
    normalizedExpenseId &&
      [expense?.expenseUuid, expense?.expenseId, expense?.humanCode]
        .filter(Boolean)
        .some((candidate) => String(candidate).trim() === normalizedExpenseId)
  );
}

function getDriverOwnExpenses() {
  if (shouldUseRealDriverExpenses()) {
    return [...driverExpensesLoadState.expenses].sort(compareDriverExpensesByDateDesc);
  }

  if (!driverProfile || !window.ElaraExpensesCore || typeof window.ElaraExpensesCore.getExpensesForDriver !== "function") {
    return [];
  }

  return window.ElaraExpensesCore
    .getExpensesForDriver(driverProfile.id)
    .filter((expense) => expense.recordType === "Solicitud" && expense.claimantId === driverProfile.id)
    .sort(compareDriverExpensesByDateDesc);
}
function compareDriverExpensesByDateDesc(first, second) {
  const firstTime = getDriverExpenseTimestamp(first);
  const secondTime = getDriverExpenseTimestamp(second);

  if (firstTime !== secondTime) {
    return secondTime - firstTime;
  }

  return String(second.expenseId || "").localeCompare(String(first.expenseId || ""));
}

function getDriverExpenseTimestamp(expense) {
  const dateValue = expense?.expenseDate ? `${expense.expenseDate}T00:00:00` : expense?.createdAt;
  const date = new Date(dateValue || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getDriverExpenseOwnServices() {
  if (shouldUseRealDriverExpenses()) {
    return driverServices
      .filter((service) => isDriverExpenseAssociableRealService(service))
      .sort((first, second) => {
        const firstDate = getServiceDateTime(first).getTime();
        const secondDate = getServiceDateTime(second).getTime();
        return secondDate - firstDate || String(second.id || "").localeCompare(String(first.id || ""));
      });
  }

  return (window.ElaraServicesMock?.services || [])
    .filter((service) => getCentralServiceDriverId(service) === driverProfile?.id)
    .sort((first, second) => {
      const firstDate = getServiceDateTime(adaptCentralServiceForDriver(first)).getTime();
      const secondDate = getServiceDateTime(adaptCentralServiceForDriver(second)).getTime();
      return secondDate - firstDate || String(second.serviceId || "").localeCompare(String(first.serviceId || ""));
    });
}

function isDriverExpenseAssociableRealService(service) {
  if (!service?.isRealDriverService || !service.centralServiceId) {
    return false;
  }

  return service.assignmentStatus === "accepted" || service.assignmentStatus === "ended";
}
function validateDriverExpenseOwnReferences(payload) {
  if (!payload.category) {
    return "Selecciona una categoria.";
  }

  if (!payload.paymentMethod) {
    return "Selecciona el metodo con el que fue pagado.";
  }

  if (payload.vehicleId && payload.vehicleId !== driverProfile?.vehicleId) {
    return "Solo puedes vincular tu vehiculo asignado.";
  }

  if (payload.serviceId) {
    const service = getCentralDriverServiceById(payload.serviceId);

    if (!service || getCentralServiceDriverId(service) !== driverProfile?.id) {
      return "Solo puedes vincular servicios propios.";
    }

    if (payload.vehicleId && service.vehicleId && payload.vehicleId !== service.vehicleId) {
      return "El vehiculo seleccionado no coincide con el servicio.";
    }
  }

  return "";
}

function canDriverRespondExpense(expense) {
  return Boolean(!expense?.isRealDriverExpense && expense && expense.status === "Requiere informaci\u00f3n" && canDriverExpenseAction("expenses:respondOwn"));
}

function canDriverExpenseAction(action) {
  if (window.ElaraPermissions && typeof window.ElaraPermissions.canPerformAction === "function") {
    return window.ElaraPermissions.canPerformAction(getDriverAuthenticatedUser(), action);
  }

  const user = getDriverAuthenticatedUser();
  return getDriverAuthUserActiveContext(user) === "conductor" && driverAuthUserHasRole(user, "conductor");
}

function getDriverExpenseStatusFilterOptions() {
  if (shouldUseRealDriverExpenses()) {
    return DRIVER_EXPENSE_REAL_REIMBURSEMENT_STATUS_OPTIONS;
  }

  return [{ value: "", label: "Todos" }, ...DRIVER_EXPENSE_STATUSES.map((status) => ({ value: status, label: status }))];
}

function getDriverExpenseFilterCategories() {
  if (shouldUseRealDriverExpenses()) {
    const categories = new Map();

    driverExpensesLoadState.expenses.forEach((expense) => {
      const value = getDriverExpenseCategoryFilterValue(expense);

      if (value && !categories.has(value)) {
        categories.set(value, expense.category || value);
      }
    });

    return [...categories.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label, "es"));
  }

  return getDriverExpenseCategories().map((category) => ({ value: category, label: category }));
}

function getDriverExpenseCategoryFilterValue(expense) {
  return String(expense?.categoryKey || expense?.categoryId || expense?.category || "");
}

function getDriverExpenseCategories() {
  return window.ElaraExpensesCore && typeof window.ElaraExpensesCore.getExpenseCategories === "function" ? window.ElaraExpensesCore.getExpenseCategories() : [];
}
function getDriverExpenseFilterCount() {
  return Object.values(driverExpenseFilters).filter(Boolean).length;
}

function getDefaultDriverExpenseFilters() {
  return {
    status: "",
    category: "",
    from: "",
    to: "",
    query: "",
  };
}

function syncDriverExpenseVehicleFromService() {
  const serviceId = getInputValue("driver-expense-new-service");

  if (shouldUseRealDriverExpenses()) {
    const vehicleSelect = getElement("driver-expense-new-vehicle");
    const service = getDriverRealServiceById(serviceId);

    if (vehicleSelect) {
      const label = service ? [service.assignedVehicle, service.plate].filter(Boolean).join(" · ") : "Se deriva automaticamente";
      vehicleSelect.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
    }

    return;
  }

  const service = getCentralDriverServiceById(serviceId);

  if (service?.vehicleId && service.vehicleId === driverProfile?.vehicleId) {
    setInputValue("driver-expense-new-vehicle", service.vehicleId);
  }
}
function closeDriverExpenseModals() {
  closeModal("driver-expense-response-modal");
  closeModal("driver-expense-new-modal");
  closeModal("driver-expense-detail-modal");
  selectedDriverExpenseId = "";
}

function showDriverExpenseFormError(errorId, message) {
  const error = getElement(errorId);

  if (!error) {
    return;
  }

  error.textContent = message || "";
  error.hidden = !message;
}

function renderDriverExpenseStatusBadge(status) {
  const statusClasses = {
    Borrador: "expense-status-badge--neutral",
    Enviada: "expense-status-badge--info",
    Aprobada: "expense-status-badge--success",
    Rechazada: "expense-status-badge--danger",
    Cancelada: "expense-status-badge--neutral",
    Pendiente: "expense-status-badge--warning",
    Parcial: "expense-status-badge--info",
    Pagado: "expense-status-badge--success",
    Cancelado: "expense-status-badge--neutral",
    "No aplica": "expense-status-badge--neutral",
    "Pendiente de reembolso": "expense-status-badge--warning",
    Reembolsado: "expense-status-badge--success",
    "Reembolso cancelado": "expense-status-badge--neutral",
    "Pendiente de revisi\u00f3n": "expense-status-badge--warning",
    "Requiere informaci\u00f3n": "expense-status-badge--danger",
    "Aprobada parcialmente": "expense-status-badge--info",
    Reembolsada: "expense-status-badge--success",
    Anulada: "expense-status-badge--neutral",
  };

  return `<span class="expense-status-badge ${statusClasses[status] || "expense-status-badge--neutral"}">${escapeHtml(status || "-")}</span>`;
}
function getDriverExpenseServiceLabel(serviceId) {
  if (shouldUseRealDriverExpenses()) {
    const service = getDriverRealServiceById(serviceId);

    if (!service) {
      return "";
    }

    return [service.id, formatDriverExpenseDate(service.date), service.customerName].filter(Boolean).join(" · ");
  }

  const service = getCentralDriverServiceById(serviceId);

  if (!service) {
    return "";
  }

  return `${service.serviceId} · ${service.type || "Servicio"} · ${formatDriverExpenseDate(service.date)}`;
}

function getDriverRealServiceById(serviceId) {
  return driverServices.find((service) => service?.centralServiceId === serviceId || service?.id === serviceId) || null;
}
function getDriverExpenseVehicleLabel(vehicleId) {
  const vehicle = getDriverVehicleById(vehicleId);

  if (!vehicle) {
    return "";
  }

  return `${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.plate || ""}`.trim();
}

function getDriverExpenseReceiptLabel(receipt) {
  if (!receipt) {
    return "Sin comprobante";
  }

  return [receipt.status || "Sin comprobante", receipt.fileName || ""].filter(Boolean).join(" - ");
}

function mapDriverExpenseReceiptStatusToCore(status) {
  const statusMap = {
    Adjunto: "Adjunto",
    "Pendiente de adjuntar": "Pendiente de adjuntar",
    "No disponible": "No disponible",
    "No requerido": "No requerido",
    "No adjunto": "No adjunto",
  };

  return statusMap[status] || "No adjunto";
}

function mapDriverExpenseReceiptStatusToDriver(status) {
  if (status === "No requerido") {
    return "No requerido";
  }

  if (status === "Adjunto") {
    return "Adjunto";
  }

  return "Pendiente de adjuntar";
}

function getDriverExpenseAmount(value) {
  if (window.ElaraExpensesCore && typeof window.ElaraExpensesCore.roundExpenseMoney === "function") {
    return window.ElaraExpensesCore.roundExpenseMoney(value);
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

function parseDriverExpenseAmountInput(value) {
  const normalizedValue = String(value || "").trim().replace(",", ".");
  const amount = Number(normalizedValue);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : NaN;
}
function formatDriverExpenseCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? String(count) : "0";
}

function formatDriverExpenseMoney(value, currencyCode = "") {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = getDriverExpenseAmount(value);
  const currency = String(currencyCode || "").trim().toUpperCase();

  if (currency) {
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
      }).format(amount);
    } catch (error) {
      return `${formatDriverNumber(amount)} ${currency}`;
    }
  }

  return formatDriverMoney(amount);
}
function formatDriverExpenseDate(value) {
  const normalizedDate = formatCentralServiceDateForDriver(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return value || "-";
  }

  return formatDate(normalizedDate);
}

function formatDriverExpenseDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderHistoryServiceCard(service) {
  const routeSummary = getHistoryRouteSummary(service);
  const isExpanded = expandedHistoryServiceId === service.id;

  return `
    <article class="driver-history-card${isExpanded ? " is-expanded" : ""}" data-driver-history-card data-service-id="${service.id}" tabindex="0" aria-expanded="${isExpanded}">
      <div class="driver-history-card__main">
        <div class="driver-history-card__top">
          <div>
            <p class="panel__eyebrow">${escapeHtml(service.type)}</p>
            <h3>${escapeHtml(routeSummary)}</h3>
          </div>
          ${renderStatusPill(service.status, service.displayStatus)}
        </div>

        <div class="driver-history-card__meta" aria-label="Resumen del servicio cerrado">
          <span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${escapeHtml(formatShortDate(service.date))}</span>
          <span><i class="fa-regular fa-clock" aria-hidden="true"></i>${escapeHtml(service.time)}</span>
          <span><i class="fa-solid fa-euro-sign" aria-hidden="true"></i>${escapeHtml(service.estimatedPrice || "Sin importe")}</span>
        </div>
      </div>
      ${isExpanded ? renderHistoryExpandedDetail(service) : ""}
    </article>
  `;
}

function renderHistoryExpandedDetail(service) {
  const isReporting = reportingHistoryServiceId === service.id;
  const reasonsLabel = getClosingReasonsLabel(service);
  const cashIncidentFields = getDriverHistoryCashIncidentFields(service);

  return `
    <div class="driver-history-card__detail" aria-label="Detalle del servicio cerrado">
      <dl class="driver-history-detail-grid">
        ${renderHistoryDetailField("Pasajero / cliente", getPassengerCustomerLabel(service))}
        ${renderHistoryDetailField("Pasajeros", `${service.passengers || "-"} - Maletas: ${service.luggage || "0"}`)}
        ${reasonsLabel !== "-" && !cashIncidentFields.length ? renderHistoryDetailField("Motivos", reasonsLabel) : ""}
        ${cashIncidentFields.map((field) => renderHistoryDetailField(field.label, field.value)).join("")}
      </dl>

      ${isReporting ? renderHistoryIncidentForm(service) : ""}

      <div class="driver-history-card__actions">
        ${renderDriverHistoryReportAction(service, isReporting)}
        <button class="button button--secondary driver-button" type="button" data-driver-action="history-close" data-service-id="${service.id}">Cerrar</button>
      </div>
    </div>
  `;
}

function renderDriverHistoryReportAction(service, isReporting) {
  if (isReporting) {
    return "";
  }

  if (service?.isRealDriverService) {
    return '<button class="button button--secondary driver-button" type="button" disabled aria-disabled="true">Incidencia pendiente de RPC</button>';
  }

  return `<button class="button button--secondary driver-button" type="button" data-driver-action="history-report" data-service-id="${service.id}">Reportar incidencia</button>`;
}
function getDriverHistoryCashIncidentFields(service) {
  const incident = getDriverCashCollectionIncidentForService(service);

  if (!incident) {
    return [];
  }

  const collectedAmount = Number(incident.collectedAtClosingAmount) || 0;
  const fields =
    collectedAmount > 0
      ? [
          { label: "Cobrado", value: formatDriverMoney(collectedAmount) },
          { label: "Pendiente", value: formatDriverMoney(incident.remainingAmount) },
        ]
      : [
          { label: "Cobro", value: "No completado" },
          { label: "Pendiente", value: formatDriverMoney(incident.remainingAmount) },
        ];

  if (incident.reason) {
    fields.push({ label: "Motivo", value: incident.reason });
  }

  if (String(incident.notes || "").trim()) {
    fields.push({ label: "Observaciones", value: String(incident.notes).trim() });
  }

  return fields;
}

function getDriverCashCollectionIncidentForService(service) {
  const incidents = window.ElaraAdminIncidentsMock?.incidents;
  const serviceId = service?.centralServiceId || service?.id || "";

  if (!Array.isArray(incidents) || !serviceId) {
    return null;
  }

  return (
    incidents
      .filter((incident) => incident.serviceId === serviceId && incident.category === "FINANCIAL_COLLECTION")
      .sort((first, second) => getDriverIncidentTimestamp(second.createdAt) - getDriverIncidentTimestamp(first.createdAt))[0] || null
  );
}

function getDriverIncidentTimestamp(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function renderHistoryDetailField(label, value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return `
    <div class="driver-history-detail-field">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderHistoryIncidentForm(service) {
  return `
    <div class="driver-history-incident">
      <label for="driver-history-incident-${service.id}">Incidencia</label>
      <textarea id="driver-history-incident-${service.id}" rows="3" placeholder="Describe la incidencia relacionada con este servicio..."></textarea>
      <p class="driver-history-incident__error" id="driver-history-incident-error-${service.id}" hidden></p>
      <button class="button button--primary driver-button" type="button" data-driver-action="history-send-incident" data-service-id="${service.id}">Enviar incidencia</button>
    </div>
  `;
}

function toggleHistoryCard(serviceId) {
  expandedHistoryServiceId = expandedHistoryServiceId === serviceId ? null : serviceId;

  if (expandedHistoryServiceId !== serviceId) {
    reportingHistoryServiceId = null;
  }

  renderDriverHistoryList();
}

function collapseHistoryCard(serviceId) {
  if (expandedHistoryServiceId === serviceId) {
    expandedHistoryServiceId = null;
  }

  if (reportingHistoryServiceId === serviceId) {
    reportingHistoryServiceId = null;
  }

  renderDriverHistoryList();
}

function showHistoryIncidentForm(serviceId) {
  expandedHistoryServiceId = serviceId;
  reportingHistoryServiceId = serviceId;
  renderDriverHistoryList();

  const input = getElement(`driver-history-incident-${serviceId}`);

  if (input) {
    input.focus();
  }
}

function sendHistoryIncident(serviceId) {
  const service = getServiceById(serviceId);
  const input = getElement(`driver-history-incident-${serviceId}`);
  const error = getElement(`driver-history-incident-error-${serviceId}`);
  const text = input ? input.value.trim() : "";

  if (!service || !isClosedServiceStatus(service.status)) {
    return;
  }

  if (!text) {
    if (error) {
      error.textContent = "Describe la incidencia antes de enviarla.";
      error.hidden = false;
    }

    if (input) {
      input.focus();
    }

    return;
  }

  service.historyIncident = {
    text,
    createdAt: new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
  reportingHistoryServiceId = null;
  saveServices();
  window.ElaraNotifications.showToast("Incidencia guardada en mock.", "success");
  renderDriverHistoryList();
}

function handleHistoryCardKeydown(event) {
  const historyCard = event.target.closest("[data-driver-history-card]");

  if (!historyCard || event.target.closest("button, a, input, textarea, select, label")) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  toggleHistoryCard(historyCard.dataset.serviceId);
}

function getHistoryRouteSummary(service) {
  const routePoints = [
    getRoutePointLabel(service.origin),
    ...(Array.isArray(service.stops) ? service.stops.map(getRoutePointLabel) : []),
    getRoutePointLabel(service.destination),
  ].filter(Boolean);

  return routePoints.join(" \u2192 ") || "-";
}

function getPassengerCustomerLabel(service) {
  const labels = [service.passengerName, service.customerName].filter(Boolean);

  return labels.length ? labels.join(" / ") : "-";
}

function getRoutePointLabel(point) {
  if (typeof point === "string") {
    return point.trim();
  }

  if (point && typeof point === "object") {
    return String(point.address || point.name || point.label || point.description || "").trim();
  }

  return String(point || "").trim();
}

function renderServiceCard(service, variant) {
  const primaryAction = getPrimaryAction(service);
  const cardClass = variant === "featured" ? "driver-service-card--featured" : "";
  const reserveLabel = `Reserva ${service.id.toUpperCase()}`;
  const stopsLabel = getStopsLabel(service);

  return `
    <article class="driver-service-card ${cardClass}">
      <div class="driver-service-card__body">
        <div class="driver-service-card__top">
          <div>
            <p class="panel__eyebrow">${escapeHtml(service.type)}</p>
            <h3>${escapeHtml(getRouteTitle(service))}</h3>
          </div>
          ${renderStatusPill(service.status, service.displayStatus)}
        </div>

        <div class="driver-card-schedule" aria-label="Fecha y hora del servicio">
          <span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${escapeHtml(formatShortDate(service.date))}</span>
          <span><i class="fa-regular fa-clock" aria-hidden="true"></i>${escapeHtml(service.time)}</span>
        </div>

        <div class="driver-route-lines">
          <p class="driver-route-point driver-route-point--origin">${renderDriverIcon("origin")}<span><strong>Origen</strong>${escapeHtml(service.origin)}</span></p>
          ${stopsLabel ? `<p class="driver-route-point driver-route-point--stop">${renderDriverIcon("stop")}<span><strong>Parada intermedia</strong>${escapeHtml(stopsLabel)}</span></p>` : ""}
          <p class="driver-route-point driver-route-point--destination">${renderDriverIcon("destination")}<span><strong>Destino</strong>${escapeHtml(service.destination)}</span></p>
        </div>

        <div class="driver-card-facts" aria-label="Resumen del servicio">
          <span><i class="fa-regular fa-user" aria-hidden="true"></i>${escapeHtml(service.passengerName)}</span>
          <span><i class="fa-solid fa-users" aria-hidden="true"></i>${escapeHtml(service.passengers || "-")} pax</span>
          <span><i class="fa-solid fa-suitcase-rolling" aria-hidden="true"></i>${escapeHtml(service.luggage || "0")} maletas</span>
          <span><i class="fa-solid fa-hashtag" aria-hidden="true"></i>${escapeHtml(reserveLabel)}</span>
        </div>

        ${renderDriverCollectionBlock(service)}

        <div class="driver-service-card__actions">
          ${renderDriverServiceActionButtons(service, primaryAction)}
          ${renderDriverAssignmentRejectionConfirmation(service)}
        </div>
      </div>
    </article>
  `;
}

function renderDriverCollectionBlock(service) {
  const collectionInfo = getDriverServiceCollectionInfo(service);

  if (!collectionInfo.visible) {
    return "";
  }

  return `
    <section class="driver-collection-card" aria-label="Cobro del servicio">
      <h4>Cobro del servicio</h4>
      ${collectionInfo.lines.map((line) => `<p><span>${escapeHtml(line.label)}</span><strong>${escapeHtml(line.value)}</strong></p>`).join("")}
    </section>
  `;
}

function getDriverServiceCollectionInfo(service) {
  const summary = getDriverServiceFinancialSummary(service);
  const visible = isDriverCollectionInfoVisible(service);

  if (!summary || summary.totalPrice === null) {
    return {
      visible,
      statAmount: "Sin precio",
      statLabel: "Administraci\u00f3n",
      lines: [{ label: "Estado", value: "Informaci\u00f3n de cobro pendiente de Administraci\u00f3n." }],
    };
  }

  if (summary.paymentStatus === "Pagado") {
    return {
      visible,
      statAmount: formatDriverMoney(0),
      statLabel: "Servicio pagado",
      lines: [
        { label: "Estado", value: "Servicio pagado" },
        { label: "Pendiente de cobro", value: formatDriverMoney(0) },
      ],
    };
  }

  if (summary.paymentStatus === "Parcial") {
    return {
      visible,
      statAmount: formatDriverMoney(summary.pendingAmount),
      statLabel: "Pendiente de cobro",
      lines: [
        { label: "Total del servicio", value: formatDriverMoney(summary.totalPrice) },
        { label: "Pagado previamente", value: formatDriverMoney(summary.paidAmount) },
        { label: "Pendiente de cobro", value: formatDriverMoney(summary.pendingAmount) },
      ],
    };
  }

  if (summary.paymentStatus === "Pendiente") {
    return {
      visible,
      statAmount: formatDriverMoney(summary.pendingAmount),
      statLabel: "Pendiente de cobro",
      lines: [{ label: "Pendiente de cobro", value: formatDriverMoney(summary.pendingAmount) }],
    };
  }

  return {
    visible,
    statAmount: "Sin precio",
    statLabel: "Administraci\u00f3n",
    lines: [{ label: "Estado", value: "Informaci\u00f3n de cobro pendiente de Administraci\u00f3n." }],
  };
}

function isDriverCollectionInfoVisible(service) {
  if (service?.isRealDriverService) {
    return false;
  }

  const displayStatus = service?.displayStatus || "";

  return displayStatus === "Confirmado" || displayStatus === "En curso" || service?.status === "aceptado" || service?.status === "en_camino";
}

function getDriverServiceFinancialSummary(service) {
  const centralService = getCentralDriverServiceById(service?.centralServiceId || service?.id);

  if (centralService && window.ElaraServices && typeof window.ElaraServices.calculateServiceFinancialSummary === "function") {
    return window.ElaraServices.calculateServiceFinancialSummary(centralService);
  }

  const financial = centralService?.financial || service?.financial || {};

  return {
    totalPrice: financial.totalPrice ?? null,
    paymentStatus: financial.paymentStatus || "Sin definir",
    paidAmount: Number(financial.paidAmount) || 0,
    pendingAmount: Number(financial.pendingAmount) || 0,
  };
}

function formatDriverMoney(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;

  return `${safeAmount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function renderDriverServiceActionButtons(service, primaryAction) {
  if (pendingDriverRejectionServiceId === service.id) {
    return "";
  }

  if (service?.isRealDriverService) {
    return `
      <button class="button button--secondary driver-button" type="button" data-driver-action="detail" data-service-id="${service.id}">Detalle</button>
      ${primaryAction}
    `;
  }

  const canOperate = isDriverProfileAdministrativelyActive();

  return `
    <button class="button button--secondary driver-button" type="button" data-driver-action="detail" data-service-id="${service.id}">Detalle</button>
    ${primaryAction}
    ${canOperate && service.status === "asignado" ? `<button class="button button--secondary driver-button" type="button" data-driver-action="reject" data-service-id="${service.id}">Rechazar</button>` : ""}
  `;
}

function renderDriverAssignmentRejectionConfirmation(service) {
  if (pendingDriverRejectionServiceId !== service.id) {
    return "";
  }

  return `
    <p class="driver-policy-note">Quieres rechazar esta asignacion? El servicio quedara sin conductor asignado.</p>
    <button class="button button--secondary driver-button" type="button" data-driver-action="cancel-reject-assignment" data-service-id="${service.id}">Volver</button>
    <button class="button button--primary driver-button" type="button" data-driver-action="confirm-reject-assignment" data-service-id="${service.id}">Confirmar rechazo</button>
  `;
}

function getPrimaryAction(service) {
  if (service?.isRealDriverService) {
    return getRealDriverServicePrimaryAction(service);
  }

  if (!isDriverProfileAdministrativelyActive()) {
    return `<button class="button button--secondary driver-button" type="button" disabled>Perfil no habilitado</button>`;
  }

  if (service.status === "asignado") {
    return `<button class="button button--primary driver-button" type="button" data-driver-action="accept" data-service-id="${service.id}">Aceptar servicio</button>`;
  }

  if (service.status === "aceptado") {
    if (!canDriverServiceStartWithFinancialData(service)) {
      return `<button class="button button--secondary driver-button" type="button" disabled title="Administraci\u00f3n debe definir el precio antes de iniciar.">Precio pendiente</button>`;
    }

    if (!canStartService(service)) {
      return `<button class="button button--secondary driver-button" type="button" disabled>Iniciar disponible ${window.ElaraDriverMock.startWindowMinutes} min antes</button>`;
    }

    return `<button class="button button--primary driver-button" type="button" data-driver-action="start" data-service-id="${service.id}">Iniciar servicio</button>`;
  }

  if (isActiveServiceStatus(service.status)) {
    return `<button class="button button--primary driver-button" type="button" data-driver-action="active" data-service-id="${service.id}">Ver servicio activo</button>`;
  }

  if (service.status === "finalizado" || service.status === "no_show") {
    return `<button class="button button--secondary driver-button" type="button" data-driver-action="detail" data-service-id="${service.id}">Ver cierre</button>`;
  }

  return `<button class="button button--secondary driver-button" type="button" disabled>Sin accion disponible</button>`;
}

function getRealDriverServicePrimaryAction(service) {
  if (service?.status === "asignado") {
    if (!isDriverProfileAdministrativelyActive()) {
      return `<button class="button button--secondary driver-button" type="button" disabled>Perfil no habilitado</button>`;
    }

    const isAccepting = acceptingRealDriverServiceIds.has(service.id);
    const label = isAccepting ? "Aceptando..." : "Aceptar servicio";

    return `<button class="button button--primary driver-button" type="button" data-driver-action="accept" data-service-id="${escapeHtml(service.id)}" ${isAccepting ? 'disabled aria-disabled="true" aria-busy="true"' : ""}>${escapeHtml(label)}</button>`;
  }

  if (canRealDriverServiceStart(service)) {
    const isStarting = startingRealDriverServiceIds.has(service.id);
    const label = isStarting ? "Iniciando..." : "Iniciar servicio";

    return `<button class="button button--primary driver-button" type="button" data-driver-action="start" data-service-id="${escapeHtml(service.id)}" ${isStarting ? 'disabled aria-disabled="true" aria-busy="true"' : ""}>${escapeHtml(label)}</button>`;
  }

  if (isActiveServiceStatus(service?.status)) {
    return `<button class="button button--primary driver-button" type="button" data-driver-action="active" data-service-id="${escapeHtml(service.id)}">Ver servicio activo</button>`;
  }

  const labelByStatus = {
    aceptado: "Inicio no disponible",
    finalizado: "Servicio finalizado",
  };
  const label = labelByStatus[service?.status] || DRIVER_REAL_SERVICE_ACTION_PENDING_LABEL;

  return `<button class="button button--secondary driver-button" type="button" disabled aria-disabled="true">${escapeHtml(label)}</button>`;
}


function getNextRealDriverServiceStage(service) {
  if (!canRealDriverServiceProgressBeAdvanced(service)) {
    return "";
  }

  const currentStage = getRealDriverProgressStage(service);
  return DRIVER_REAL_PROGRESS_STAGE_FLOW[currentStage]?.nextStage || "";
}

function canRealDriverServiceProgressBeAdvanced(service) {
  return Boolean(
    service?.isRealDriverService &&
      isDriverProfileAdministrativelyActive() &&
      normalizeDriverCode(service.assignmentStatus) === "accepted" &&
      normalizeDriverCode(service.operationalStatus) === "in_progress" &&
      DRIVER_REAL_PROGRESS_STAGE_FLOW[getRealDriverProgressStage(service)]?.nextStage
  );
}

function getRealDriverProgressStage(service) {
  return normalizeDriverCode(service?.driverStage);
}

function canRealDriverServiceStart(service) {
  return Boolean(
    service?.isRealDriverService &&
      service.status === "aceptado" &&
      normalizeDriverCode(service.assignmentStatus) === "accepted" &&
      normalizeDriverCode(service.operationalStatus) === "confirmed" &&
      canStartService(service)
  );
}
async function startService(serviceId) {
  const driverService = getServiceById(serviceId);

  if (driverService?.isRealDriverService) {
    await startRealDriverService(driverService);
    return;
  }

  if (isDriverUsingCentralServices) {
    startCentralDriverService(serviceId);
    return;
  }

  updateServiceStatus(serviceId, "en_camino");
  activeServiceId = serviceId;
  isDriverActiveServiceVisible = true;
  // TODO: conectar aqui una notificacion real al cliente cuando exista infraestructura de notificaciones.
  window.ElaraNotifications.showToast("Servicio iniciado. Notificaci\u00f3n al cliente pendiente de integraci\u00f3n real.", "info");
  renderDriverServices();
}

async function startRealDriverService(service) {
  if (!ensureDriverCanOperate() || !service) {
    return;
  }

  if (!canRealDriverServiceStart(service)) {
    window.ElaraNotifications.showToast("Este servicio no esta listo para iniciarse.", "warning");
    return;
  }

  const serviceUuid = service.centralServiceId || "";

  if (!serviceUuid) {
    window.ElaraNotifications.showToast("No se pudo identificar el servicio real.", "error");
    return;
  }

  if (startingRealDriverServiceIds.has(service.id)) {
    return;
  }

  startingRealDriverServiceIds.add(service.id);
  renderDriverServices();

  try {
    let startResult = null;

    try {
      const { data, error } = await window.ElaraSupabase.client.rpc("start_driver_service", {
        p_service_id: serviceUuid,
      });

      if (error) {
        throw error;
      }

      startResult = Array.isArray(data) ? data[0] : data;
    } catch (error) {
      console.error("[ELARA Driver] No se pudo iniciar el servicio real.", {
        message: error?.message || "",
        code: error?.code || "",
        details: error?.details || "",
        serviceId: service.id,
        serviceUuid,
      });
      window.ElaraNotifications.showToast(getStartDriverServiceErrorMessage(error), "error");
      return;
    }

    applyStartedDriverServiceResult(service, startResult);
    activeServiceId = resolveStartedRealDriverServiceId(service, serviceUuid);
    isDriverActiveServiceVisible = true;

    try {
      driverServices = await loadDriverServices({ force: true });
      activeServiceId = resolveStartedRealDriverServiceId(service, serviceUuid);
      isDriverActiveServiceVisible = true;
      window.ElaraNotifications.showToast("Servicio iniciado correctamente.", "success");
    } catch (refreshError) {
      console.error("[ELARA Driver] Servicio iniciado, pero no se pudo refrescar la vista.", {
        message: refreshError?.message || "",
        code: refreshError?.code || "",
        details: refreshError?.details || "",
        serviceId: service.id,
        serviceUuid,
      });
      window.ElaraNotifications.showToast("Servicio iniciado. No se pudo actualizar la vista automaticamente.", "warning");
    }
  } finally {
    startingRealDriverServiceIds.delete(service.id);
    renderDriverServices();
  }
}

function resolveStartedRealDriverServiceId(service, serviceUuid) {
  const startedService = driverServices.find((candidate) =>
    candidate?.id === service?.id ||
      (serviceUuid && candidate?.centralServiceId === serviceUuid)
  );

  return startedService?.id || service?.id || "";
}

function applyStartedDriverServiceResult(service, result) {
  const target = getServiceById(service?.id) || service;

  if (!target) {
    return;
  }

  target.operationalStatus = result?.operational_status || "in_progress";
  target.assignmentStatus = target.assignmentStatus || "accepted";
  target.driverStage = result?.driver_stage || "on_way";
  target.status = "en_camino";
  target.displayStatus = driverStatusLabels.en_camino;
  target.isNewAssignment = false;

  if (result?.started_at) {
    target.startedAt = result.started_at;
    target.driverStageUpdatedAt = result.started_at;
  }
}

async function advanceRealDriverServiceProgress(serviceId, targetStage) {
  const service = getServiceById(serviceId);

  if (!ensureDriverCanOperate() || !service) {
    return;
  }

  const expectedStage = getNextRealDriverServiceStage(service);

  if (!expectedStage || normalizeDriverCode(targetStage) !== expectedStage) {
    window.ElaraNotifications.showToast("Esta accion no esta disponible para el estado actual.", "warning");
    return;
  }

  const serviceUuid = service.centralServiceId || "";

  if (!serviceUuid) {
    window.ElaraNotifications.showToast("No se pudo identificar el servicio real.", "error");
    return;
  }

  if (advancingRealDriverServiceIds.has(service.id)) {
    return;
  }

  advancingRealDriverServiceIds.add(service.id);
  renderDriverServices();

  try {
    let progressResult = null;

    try {
      const { data, error } = await window.ElaraSupabase.client.rpc("advance_driver_service_progress", {
        p_service_id: serviceUuid,
        p_target_stage: expectedStage,
      });

      if (error) {
        throw error;
      }

      progressResult = Array.isArray(data) ? data[0] : data;
    } catch (error) {
      console.error("[ELARA Driver] No se pudo actualizar el progreso real del servicio.", {
        message: error?.message || "",
        code: error?.code || "",
        details: error?.details || "",
        serviceId: service.id,
        serviceUuid,
        targetStage: expectedStage,
      });
      window.ElaraNotifications.showToast(getAdvanceDriverServiceProgressErrorMessage(error), "error");
      return;
    }

    applyAdvancedDriverServiceProgressResult(service, progressResult);

    try {
      driverServices = await loadDriverServices({ force: true });
      window.ElaraNotifications.showToast(getAdvanceDriverServiceProgressSuccessMessage(progressResult?.driver_stage || expectedStage), "success");
    } catch (refreshError) {
      console.error("[ELARA Driver] Progreso actualizado, pero no se pudo refrescar la vista.", {
        message: refreshError?.message || "",
        code: refreshError?.code || "",
        details: refreshError?.details || "",
        serviceId: service.id,
        serviceUuid,
        targetStage: expectedStage,
      });
      window.ElaraNotifications.showToast("Progreso actualizado. No se pudo actualizar la vista automaticamente.", "warning");
    }
  } finally {
    advancingRealDriverServiceIds.delete(service.id);
    renderDriverServices();
  }
}

function applyAdvancedDriverServiceProgressResult(service, result) {
  const target = getServiceById(service?.id) || service;

  if (!target) {
    return;
  }

  const driverStage = result?.driver_stage || "";
  const operationalStatus = result?.operational_status || "in_progress";
  const completedAt = result?.completed_at || "";

  target.operationalStatus = operationalStatus;
  target.driverStage = driverStage;
  target.driverStageUpdatedAt = result?.driver_stage_updated_at || completedAt || target.driverStageUpdatedAt || "";
  target.isNewAssignment = false;

  if (operationalStatus === "completed" || driverStage === "finished") {
    target.status = "finalizado";
    target.displayStatus = driverStatusLabels.finalizado;
    target.closedAt = completedAt || target.closedAt || "";

    if (activeServiceId === target.id) {
      activeServiceId = null;
      isDriverActiveServiceVisible = false;
    }

    return;
  }

  target.status = getDriverStatusFromRealProgressStage(driverStage) || target.status;
  target.displayStatus = driverStatusLabels[target.status] || target.displayStatus || "";
}

function getAdvanceDriverServiceProgressSuccessMessage(stage) {
  return DRIVER_REAL_PROGRESS_STAGE_FLOW[normalizeDriverCode(stage)]?.successLabel || "Progreso actualizado correctamente.";
}

function getAdvanceDriverServiceProgressErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("active context")) {
    return "Tu sesion de conductor no esta activa. Vuelve a iniciar sesion.";
  }

  if (message.includes("not assigned")) {
    return "Este servicio no esta asignado a tu conductor.";
  }

  if (message.includes("must be started") || message.includes("has not been started")) {
    return "Debes iniciar el servicio antes de actualizar el progreso.";
  }

  if (message.includes("final service status") || message.includes("already been finished")) {
    return "Este servicio ya esta finalizado.";
  }

  if (message.includes("already at target")) {
    return "El servicio ya esta en ese estado.";
  }

  if (message.includes("invalid progress transition") || message.includes("invalid service progress target") || message.includes("cannot be advanced")) {
    return "La transicion de progreso no es valida.";
  }

  if (message.includes("assignment is not valid")) {
    return "La asignacion no permite actualizar este servicio.";
  }

  if (code === "42501") {
    return "No tienes permiso para actualizar este servicio.";
  }

  if (message.includes("not found")) {
    return "No se encontro el servicio seleccionado.";
  }

  return "No se pudo actualizar el progreso. Intentalo de nuevo.";
}

function getStartDriverServiceErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("active context")) {
    return "Tu sesion de conductor no esta activa. Vuelve a iniciar sesion.";
  }

  if (message.includes("not assigned")) {
    return "Este servicio no esta asignado a tu conductor.";
  }

  if (message.includes("must be accepted") || message.includes("not valid for starting")) {
    return "Debes aceptar el servicio antes de iniciarlo.";
  }

  if (message.includes("already been started") || message.includes("progress has already started")) {
    return "Este servicio ya fue iniciado.";
  }

  if (message.includes("final service status")) {
    return "El servicio esta en un estado final y no puede iniciarse.";
  }

  if (message.includes("must be confirmed") || message.includes("does not allow") || message.includes("invalid")) {
    return "El estado actual del servicio no permite iniciarlo.";
  }

  if (code === "42501") {
    return "No tienes permiso para iniciar este servicio.";
  }

  if (message.includes("not found")) {
    return "No se encontro el servicio seleccionado.";
  }

  return "No se pudo iniciar el servicio. Intentalo de nuevo.";
}

function startCentralDriverService(serviceId) {
  const centralService = getCentralDriverServiceById(serviceId);
  const driverService = getServiceById(serviceId);

  if (!ensureDriverCanOperate() || !centralService || !driverService || !canStartCentralDriverService(centralService, driverService)) {
    return;
  }

  if (!ensureCentralDriverPortalAccessForStart(centralService)) {
    return;
  }

  if (!ensureCentralDriverFinancialDataForStart(centralService)) {
    return;
  }

  centralService.status = "En curso";
  centralService.startedAt = new Date().toISOString();
  centralService.driverStage = "en_camino";

  const collaborator = getDriverCollaboratorById(driverProfile.id);

  if (collaborator) {
    collaborator.operationalStatus = "En servicio";
    collaborator.availability = "En servicio";
  }

  driverProfile = loadProfile();
  driverServices = loadServices();
  activeServiceId = serviceId;
  isDriverActiveServiceVisible = true;
  registerDriverServiceActivity("SERVICE_STARTED", centralService, {
    title: "Servicio iniciado",
    description: `${driverProfile.name} inici\u00f3 ${centralService.serviceId}.`,
    metadata: {
      driverStage: centralService.driverStage,
    },
  });
  emitDriverServicesUpdatedEvent("started", centralService);
  window.ElaraNotifications.showToast("Servicio iniciado correctamente.", "success");
  renderDriverServices();
}

function canStartCentralDriverService(centralService, driverService) {
  return Boolean(
    driverProfile &&
      isCentralServiceAssignedToCurrentDriver(centralService) &&
      centralService.assignmentStatus === "Aceptado" &&
      !isDriverClosedCentralServiceStatus(centralService.status) &&
      canStartService(driverService),
  );
}

function ensureCentralDriverPortalAccessForStart(centralService) {
  const collaboratorId = getCentralServiceDriverId(centralService);
  const access = getDriverPortalAccessStatus(collaboratorId);

  if (access && access.status === "active") {
    return true;
  }

  window.ElaraNotifications.showToast(
    "No puedes iniciar el servicio porque tu usuario no tiene acceso activo al Portal. Contacta con administraci\u00f3n.",
    "error",
  );
  return false;
}

function ensureCentralDriverFinancialDataForStart(centralService) {
  if (!window.ElaraServices || typeof window.ElaraServices.canServiceStartWithFinancialData !== "function") {
    console.error("[ELARA] No se pudo verificar la informacion economica del servicio antes de iniciar:", centralService?.serviceId);
    window.ElaraNotifications.showToast(
      "No puedes iniciar el servicio hasta que Administraci\u00f3n defina el precio.",
      "error",
    );
    return false;
  }

  if (window.ElaraServices.canServiceStartWithFinancialData(centralService)) {
    return true;
  }

  window.ElaraNotifications.showToast(
    "No puedes iniciar el servicio hasta que Administraci\u00f3n defina el precio.",
    "error",
  );
  return false;
}

function canDriverServiceStartWithFinancialData(service) {
  const centralService = getCentralDriverServiceById(service?.centralServiceId || service?.id);

  if (!centralService || !window.ElaraServices || typeof window.ElaraServices.canServiceStartWithFinancialData !== "function") {
    return false;
  }

  return window.ElaraServices.canServiceStartWithFinancialData(centralService);
}

function getDriverPortalAccessStatus(collaboratorId) {
  const collaboratorApi = window.ElaraCollaborators;

  if (!collaboratorApi || typeof collaboratorApi.getCollaboratorPortalAccessStatus !== "function") {
    console.error("[ELARA] No se pudo verificar el acceso al Portal del conductor:", collaboratorId);
    return null;
  }

  const access = collaboratorApi.getCollaboratorPortalAccessStatus(collaboratorId);

  if (!access || !["active", "inactive", "none"].includes(access.status)) {
    console.error("[ELARA] Estado de acceso al Portal no reconocido:", collaboratorId, access);
    return null;
  }

  return access;
}

function showActiveService(serviceId) {
  activeServiceId = serviceId;
  isDriverActiveServiceVisible = true;
  renderDriverServices();
}

function getOperationalStatus(service) {
  return service && service.status === "en_servicio" ? "pasajero_a_bordo" : service ? service.status : "";
}

function isActiveServiceStatus(status) {
  return ["en_camino", "esperando_pasajero", "pasajero_a_bordo", "en_servicio"].includes(status);
}

function getActiveServiceState(service) {
  if (service?.isRealDriverService) {
    return getRealActiveServiceState(service);
  }

  const status = getOperationalStatus(service);

  if (status === "pasajero_a_bordo") {
    return getPassengerOnboardState(service);
  }

  const states = {
    en_camino: {
      stage: "EN RUTA A RECOGIDA",
      nextPoint: service.origin,
      canEditPickup: true,
      action: "disabled-route",
      showCardStage: true,
      sliderText: "Deslizar al llegar",
      sliderTone: "arrive",
      sliderLabel: "Deslizar al llegar al punto de recogida",
    },
    esperando_pasajero: {
      stage: "ESPERANDO PASAJERO",
      nextPoint: service.origin,
      canEditPickup: true,
      action: "no-show",
      showCardStage: false,
      sliderText: "Deslizar para iniciar",
      sliderTone: "start",
      sliderLabel: "Deslizar para iniciar trayecto con pasajero",
    },
  };

  return states[status] || states.en_camino;
}

function getRealActiveServiceState(service) {
  const stage = getRealDriverProgressStage(service) || "on_way";
  const states = {
    on_way: {
      stage: "EN RUTA A RECOGIDA",
      nextPoint: service.origin,
      canEditPickup: false,
      action: "",
      showCardStage: true,
      sliderText: "Deslizar al llegar",
      sliderTone: "arrive",
      sliderLabel: "Deslizar al llegar al punto de recogida",
    },
    waiting_passenger: {
      stage: "ESPERANDO PASAJERO",
      nextPoint: service.origin,
      canEditPickup: false,
      action: "",
      showCardStage: false,
      sliderText: "Deslizar para iniciar",
      sliderTone: "start",
      sliderLabel: "Deslizar para confirmar pasajero a bordo",
    },
    passenger_on_board: {
      stage: "EN RUTA A DESTINO",
      nextPoint: service.destination,
      canEditPickup: false,
      action: "",
      showCardStage: true,
      sliderText: "Deslizar al llegar",
      sliderTone: "arrive",
      sliderLabel: "Deslizar al llegar al destino",
    },
    finishing: {
      stage: "EN DESTINO",
      nextPoint: service.destination,
      canEditPickup: false,
      action: "",
      showCardStage: true,
      sliderText: "Desliza para finalizar",
      sliderTone: "finish",
      sliderLabel: "Deslizar para finalizar servicio",
    },
  };

  return states[stage] || states.on_way;
}

function getPassengerOnboardState(service) {
  const segment = getPassengerOnboardSegment(service);

  if (segment === "esperando_en_parada_intermedia") {
    return {
      stage: "PARADA INTERMEDIA",
      nextPoint: service.currentStop || getIntermediateStops(service)[0] || service.destination,
      canEditPickup: false,
      action: "route-change",
      showCardStage: true,
      sliderText: "Deslizar para continuar",
      sliderTone: "continue",
      sliderLabel: "Deslizar para continuar el itinerario",
      routeSegment: segment,
    };
  }

  if (segment === "yendo_a_parada_intermedia") {
    return {
      stage: "EN RUTA A PARADA",
      nextPoint: getIntermediateStops(service)[0],
      canEditPickup: false,
      action: "route-change",
      showCardStage: true,
      sliderText: "Deslizar en parada intermedia",
      sliderTone: "stop",
      sliderLabel: "Deslizar al llegar a parada intermedia",
      routeSegment: segment,
    };
  }

  return {
    stage: "EN RUTA A DESTINO",
    nextPoint: service.destination,
    canEditPickup: false,
    action: "route-change",
    showCardStage: true,
    sliderText: "Desliza para finalizar",
    sliderTone: "finish",
    sliderLabel: "Deslizar para finalizar servicio",
    routeSegment: segment,
  };
}

function renderActiveService(service) {
  const container = getElement("driver-active-service");

  if (!container) {
    return;
  }

  const activeState = getActiveServiceState(service);
  const pendingItinerary = getActiveItineraryItems(service, activeState);
  const passengerPhone = service.passengerPhone || "";
  const passengerPhoneLabel = passengerPhone || "Telefono no informado";
  const passengerPhoneHref = formatPhoneHref(passengerPhone);
  const collectionInfo = getDriverServiceCollectionInfo(service);
  const isRealProgressUpdating = Boolean(service.isRealDriverService && advancingRealDriverServiceIds.has(service.id));
  const sliderText = isRealProgressUpdating ? "Actualizando..." : activeState.sliderText;

  setDriverHeader("Servicio activo", "En operacion", `${service.time} - ${service.passengerName}`);

  container.innerHTML = `
    <section class="driver-active-experience">
      <section class="driver-active-hero driver-active-top">
        <div class="driver-active-hero__status">
          <h2>SERVICIO ACTIVO</h2>
          <p>Iniciado a las ${escapeHtml(service.time)} &middot; ${escapeHtml(driverStatusLabels[getOperationalStatus(service)])}</p>
        </div>
      </section>

      <section class="driver-active-main">
        <div class="driver-active-radar" aria-hidden="true">
          <span class="driver-active-radar__ring driver-active-radar__ring--outer"></span>
          <span class="driver-active-radar__ring driver-active-radar__ring--inner"></span>
          ${renderDriverIcon("gpsArrow")}
        </div>

        <section class="driver-active-card" aria-label="Operacion del servicio activo">
          <div class="driver-active-focus">
            ${activeState.showCardStage ? `<span>${activeState.stage}</span>` : ""}
            ${renderActiveFocusPoint(service, activeState)}
          </div>

          ${renderActivePendingItinerary(pendingItinerary, activeState)}

          <div class="driver-active-passenger">
            <div class="driver-active-passenger__name">
              <span class="driver-active-label">PASAJERO</span>
              <strong>${escapeHtml(service.passengerName)}</strong>
            </div>

            <div class="driver-active-passenger__phone">
              <span class="driver-active-passenger__phone-number">${escapeHtml(passengerPhoneLabel)}</span>
              <button class="driver-active-phone-action" type="button" data-driver-action="copy-phone" data-phone="${escapeHtml(passengerPhone)}" aria-label="Copiar telefono" ${passengerPhone ? "" : "disabled"}>
                ${renderDriverIcon("copy")}
              </button>
              <a class="driver-active-phone-action" href="${escapeHtml(passengerPhoneHref)}" aria-label="Llamar pasajero" ${passengerPhone ? "" : 'aria-disabled="true" tabindex="-1"'}>
                ${renderDriverIcon("phone")}
              </a>
            </div>
          </div>

          <div class="driver-active-info driver-notes">
            <div>
              <span>Observaciones importantes</span>
              <p>${escapeHtml(service.notes || "Sin observaciones.")}</p>
            </div>
          </div>

          <div class="driver-active-stats" aria-label="Metricas del servicio">
            <span><strong>${escapeHtml(service.passengers || "-")}</strong>Pasajeros</span>
            <span><strong>${escapeHtml(service.luggage || "0")}</strong>Maletas</span>
            <span><strong>${escapeHtml(collectionInfo.statAmount)}</strong>${escapeHtml(collectionInfo.statLabel)}</span>
          </div>

          ${renderDriverCollectionBlock(service)}

          ${renderActiveContextAction(service, activeState)}

          ${renderActiveIncidentAction(service)}

          <div class="driver-active-map-actions">
            <a class="driver-active-map driver-active-map--waze" href="https://waze.com/ul" target="_blank" rel="noopener" aria-label="Abrir en Waze">
              ${renderDriverIcon("waze")}
              <span>Waze</span>
            </a>
            <a class="driver-active-map driver-active-map--google" href="https://maps.google.com" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">
              ${renderDriverIcon("maps")}
              <span>Maps</span>
            </a>
          </div>
        </section>
      </section>

      <section class="driver-active-finish driver-active-footer">
        <div class="driver-active-finish-slider driver-active-finish-slider--${activeState.sliderTone}" data-driver-slide-finish data-service-id="${service.id}" role="button" tabindex="0" aria-label="${activeState.sliderLabel}" ${isRealProgressUpdating ? 'aria-disabled="true" aria-busy="true"' : ""}>
          <span class="driver-active-finish-slider__text">${escapeHtml(sliderText)}</span>
          <span class="driver-active-finish-slider__thumb" aria-hidden="true">
            <span class="driver-active-finish-slider__arrow">
              <span class="driver-active-finish-slider__arrow-bars"></span>
            </span>
          </span>
        </div>
      </section>
    </section>
  `;
}

function renderActiveFocusPoint(service, activeState) {
  if (editingPickupServiceId === service.id && activeState.canEditPickup) {
    return `
      <div class="driver-pickup-edit">
        <input id="driver-pickup-edit-input" type="text" value="${escapeHtml(service.origin)}" aria-label="Editar punto de recogida" />
        <div class="driver-pickup-edit__actions">
          <button class="button button--secondary driver-button" type="button" data-driver-action="cancel-pickup" data-service-id="${service.id}">Cancelar</button>
          <button class="button button--primary driver-button" type="button" data-driver-action="save-pickup" data-service-id="${service.id}">Guardar</button>
        </div>
      </div>
    `;
  }

  if (activeState.action === "route-change") {
    const primaryType = activeState.routeSegment === "yendo_a_destino_final" ? "destination" : "stop";

    return `
      <div class="driver-active-focus__point driver-active-focus__point--visual driver-active-focus__point--${primaryType}">
        ${renderDriverIcon(primaryType)}
        <strong>${escapeHtml(activeState.nextPoint)}</strong>
      </div>
    `;
  }

  return `
    <div class="driver-active-focus__point">
      <strong>${escapeHtml(activeState.nextPoint)}</strong>
      ${
        activeState.canEditPickup
          ? `<button class="driver-pickup-edit-trigger" type="button" data-driver-action="edit-pickup" data-service-id="${service.id}" aria-label="Editar punto de recogida" title="Editar punto de recogida">${renderDriverIcon("edit")}</button>`
          : ""
      }
    </div>
  `;
}

function renderActiveContextAction(service, activeState) {
  if (activeState.action === "route-change") {
    return `<button class="button button--secondary driver-button driver-active-route-change" type="button" data-driver-action="route-change" data-service-id="${service.id}">Cambiar ruta</button>`;
  }

  if (activeState.action === "no-show") {
    return `<button class="button button--secondary driver-button driver-active-route-change" type="button" data-driver-action="no-show" data-service-id="${service.id}">Pasajero no presentado</button>`;
  }

  return "";
}

function renderActiveIncidentAction(service) {
  if (!canReportDriverServiceIncident(service)) {
    return "";
  }

  return `<button class="button button--secondary driver-button driver-active-route-change" type="button" data-driver-action="service-incident" data-service-id="${escapeHtml(service.id)}">Reportar incidencia</button>`;
}

function canReportDriverServiceIncident(service) {
  const operationalStatus = normalizeDriverCode(service?.operationalStatus);

  return Boolean(
    service?.isRealDriverService &&
      shouldUseRealDriverServiceIncidents() &&
      service?.centralServiceId &&
      ["confirmed", "in_progress", "completed"].includes(operationalStatus)
  );
}

function renderDriverProfile() {
  const container = getElement("driver-profile-card-content");

  if (!container) {
    return;
  }

  if (!driverProfile) {
    container.innerHTML = `<p class="driver-empty">${escapeHtml(driverAccessMessage || DRIVER_UNASSOCIATED_MESSAGE)}</p>`;
    return;
  }

  const details = isDriverRealProfileMode() ? renderDriverRealProfileLines() : renderDriverMockProfileLines();

  container.innerHTML = `
    <article class="driver-profile-card">
      <header class="driver-profile-card__header">
        ${renderDriverProfileAvatar()}
        <div class="driver-profile-card__identity">
          <h2>${escapeHtml(driverProfile.name)}</h2>
          <p>${escapeHtml(driverProfile.role)} <span aria-hidden="true">\u00b7</span> ${escapeHtml(driverProfile.collaboratorStatus)}</p>
        </div>
      </header>

      <dl class="driver-profile-lines">
        ${details}
      </dl>
      <p class="driver-profile-message" id="driver-profile-phone-message" hidden></p>
    </article>
  `;
}

function renderDriverRealProfileLines() {
  return `
    ${renderDriverAvailabilityControl()}
    ${renderDriverProfileLine("Email de cuenta", driverProfile.email)}
    ${renderDriverProfilePhoneLine()}
    ${renderDriverProfileLine("Codigo conductor", driverProfile.humanCode)}
    ${renderDriverProfileLine("Tipo", driverProfile.driverType)}
    ${renderDriverProfileLine("Estado", driverProfile.administrativeStatus)}
    ${renderDriverProfileLine("Vehiculo", driverProfile.assignedVehicle)}
  `;
}

function renderDriverMockProfileLines() {
  return `
    ${renderDriverAvailabilityControl()}
    ${renderDriverProfileLine("Email", driverProfile.email)}
    ${renderDriverProfilePhoneLine()}
    ${renderDriverProfileLine("Vehiculo", driverProfile.assignedVehicle)}
    ${renderDriverProfileLine("Color", driverProfile.vehicleColor)}
    ${renderDriverProfileLine("Matricula", driverProfile.plate)}
  `;
}

function renderDriverAvailabilityControl() {
  const preference = getDriverAvailabilityPreference();
  const isSaving = isDriverAvailabilityPreferenceSaving;
  const descriptionByPreference = {
    Disponible: "Puedes recibir nuevas asignaciones.",
    "No disponible": "No est\u00e1s disponible ahora, pero puedes recibir servicios futuros.",
  };
  const description = isSaving ? "Guardando..." : descriptionByPreference[preference] || descriptionByPreference["No disponible"];
  const options = ["Disponible", "No disponible"]
    .map((option) => {
      const actionAttributes = isSaving
        ? 'disabled aria-disabled="true" title="Guardando..."'
        : `data-driver-availability-preference="${escapeHtml(option)}"`;

      return `
        <button class="driver-availability-option${preference === option ? " is-active" : ""}" type="button" ${actionAttributes} aria-pressed="${preference === option ? "true" : "false"}">
          ${escapeHtml(option)}
        </button>
      `;
    })
    .join("");

  return `
    <div class="driver-profile-line driver-profile-line--availability">
      <dt>Disponibilidad</dt>
      <dd>
        <div class="driver-availability-control" role="group" aria-label="Disponibilidad">
          ${options}
        </div>
        <span class="driver-availability-help">${escapeHtml(description)}</span>
        ${isDriverRealProfileMode() ? "" : renderDriverAvailabilityConfirmation()}
      </dd>
    </div>
  `;
}
function renderDriverAvailabilityConfirmation() {
  if (!pendingDriverAvailabilityPreference) {
    return "";
  }

  const nextPreference = pendingDriverAvailabilityPreference;

  return `
    <div class="driver-availability-confirmation" role="status">
      <p>Confirmar cambio a <strong>${escapeHtml(nextPreference)}</strong>.</p>
      <div class="driver-availability-confirmation__actions">
        <button class="button button--secondary driver-button" type="button" data-driver-action="cancel-availability-change">Cancelar</button>
        <button class="button button--primary driver-button" type="button" data-driver-action="confirm-availability-change">Confirmar</button>
      </div>
    </div>
  `;
}

function requestDriverAvailabilityPreferenceChange(nextPreference) {
  const preference = normalizeDriverAvailabilityPreference(nextPreference);

  if (!preference) {
    return;
  }

  if (preference === getDriverAvailabilityPreference()) {
    pendingDriverAvailabilityPreference = "";
    renderDriverProfile();
    return;
  }

  if (!canDriverChangeAvailabilityPreference(true)) {
    return;
  }

  if (isDriverRealProfileMode()) {
    updateCurrentDriverAvailabilityPreference(preference);
    return;
  }

  pendingDriverAvailabilityPreference = preference;
  renderDriverProfile();
}
function confirmDriverAvailabilityPreferenceChange() {
  const preference = normalizeDriverAvailabilityPreference(pendingDriverAvailabilityPreference);

  if (isDriverRealProfileMode()) {
    if (preference) {
      updateCurrentDriverAvailabilityPreference(preference);
    } else {
      pendingDriverAvailabilityPreference = "";
      renderDriverProfile();
    }
    return;
  }

  if (!preference || !canDriverChangeAvailabilityPreference(true)) {
    pendingDriverAvailabilityPreference = "";
    renderDriverProfile();
    return;
  }

  const collaborator = getDriverCollaboratorById(driverProfile.id);

  if (!collaborator) {
    window.ElaraNotifications.showToast("No se encontr\u00f3 tu perfil de conductor.", "error");
    return;
  }

  collaborator.availabilityPreference = preference;
  reconcileDriverCollaboratorOperationalStatuses();
  driverProfile = loadProfile();
  driverServices = driverProfile ? loadServices() : [];
  pendingDriverAvailabilityPreference = "";
  emitDriverCollaboratorsUpdatedEvent("availability-preference-changed", collaborator);
  window.ElaraNotifications.showToast(preference === "Disponible" ? "Ahora est\u00e1s disponible." : "Ahora est\u00e1s no disponible.", "success");
  renderDriverProfile();
  renderDriverServices();
}

async function updateCurrentDriverAvailabilityPreference(preference) {
  if (isDriverAvailabilityPreferenceSaving) {
    return;
  }

  if (!window.ElaraSupabase?.client) {
    window.ElaraNotifications.showToast("No hay conexion disponible para actualizar la disponibilidad.", "error");
    return;
  }

  const availability = getDriverAvailabilityRpcValue(preference);

  if (!availability) {
    window.ElaraNotifications.showToast("Disponibilidad invalida.", "error");
    return;
  }

  isDriverAvailabilityPreferenceSaving = true;
  pendingDriverAvailabilityPreference = "";
  renderDriverProfile();

  try {
    const { data, error } = await window.ElaraSupabase.client.rpc("update_current_driver_availability", {
      p_availability: availability,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const nextAvailability = result?.availability_preference || availability;
    applyDriverProfilePatch({
      rawAvailabilityPreference: nextAvailability,
      availability: getDriverIdentityAvailabilityLabel(nextAvailability),
      availabilityPreference: getDriverIdentityAvailabilityLabel(nextAvailability),
    });
    window.ElaraNotifications.showToast("Disponibilidad actualizada.", "success");
  } catch (error) {
    console.error("[ELARA Driver] No se pudo actualizar la disponibilidad real del conductor.", {
      message: error?.message || "",
      code: error?.code || "",
      details: error?.details || "",
    });
    window.ElaraNotifications.showToast(getDriverProfileUpdateErrorMessage(error), "error");
  } finally {
    isDriverAvailabilityPreferenceSaving = false;
    renderDriverProfile();
  }
}
function cancelDriverAvailabilityPreferenceChange() {
  pendingDriverAvailabilityPreference = "";
  renderDriverProfile();
}

function canDriverChangeAvailabilityPreference(showMessage = false) {
  if (!driverProfile) {
    if (showMessage) {
      window.ElaraNotifications.showToast(DRIVER_UNASSOCIATED_MESSAGE, "error");
    }

    return false;
  }

  if (!isDriverProfileAdministrativelyActive()) {
    if (showMessage) {
      window.ElaraNotifications.showToast(DRIVER_INACTIVE_PROFILE_MESSAGE, "error");
    }

    return false;
  }

  if (!isDriverCurrentUserAllowedForAvailabilityChange()) {
    if (showMessage) {
      window.ElaraNotifications.showToast(driverAccessMessage || DRIVER_NO_PORTAL_ACCESS_MESSAGE, "error");
    }

    return false;
  }

  if (hasDriverCentralServiceInProgress()) {
    if (showMessage) {
      window.ElaraNotifications.showToast("No puedes cambiar tu disponibilidad mientras tienes un servicio en curso.", "warning");
    }

    return false;
  }

  return true;
}

function isDriverCurrentUserAllowedForAvailabilityChange() {
  const currentUser = getDriverAuthenticatedUser();

  if (getDriverUserAccessMessage(currentUser)) {
    return false;
  }

  return String(currentUser?.driverId || "").trim() === driverProfile.id;
}

function hasDriverCentralServiceInProgress() {
  return (window.ElaraServicesMock?.services || []).some(
    (service) => isCentralServiceAssignedToCurrentDriver(service) && service.status === "En curso",
  );
}

function isDriverRealProfileMode() {
  return Boolean(driverProfile?.isRealDriverProfile);
}

function getDriverAvailabilityPreference() {
  if (isDriverRealProfileMode()) {
    return normalizeDriverAvailabilityPreference(driverProfile?.availabilityPreference) || getDriverIdentityAvailabilityLabel(driverProfile?.rawAvailabilityPreference);
  }

  const collaborator = driverProfile ? getDriverCollaboratorById(driverProfile.id) : null;

  return normalizeDriverAvailabilityPreference(collaborator?.availabilityPreference) || normalizeDriverAvailabilityPreference(driverProfile?.availabilityPreference) || "Disponible";
}

function normalizeDriverAvailabilityPreference(value) {
  return ["Disponible", "No disponible"].includes(String(value || "").trim()) ? String(value || "").trim() : "";
}

function getDriverAvailabilityRpcValue(preference) {
  const normalizedPreference = normalizeDriverAvailabilityPreference(preference);

  if (normalizedPreference === "Disponible") {
    return "available";
  }

  if (normalizedPreference === "No disponible") {
    return "unavailable";
  }

  const rawPreference = String(preference || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DRIVER_PROFILE_AVAILABILITY_LABELS, rawPreference) ? rawPreference : "";
}

function applyDriverProfilePatch(patch) {
  if (!driverProfile || !patch) {
    return;
  }

  driverProfile = { ...driverProfile, ...patch };

  if (driverProfileLoadState.profile && driverProfileLoadState.profile.id === driverProfile.id) {
    driverProfileLoadState.profile = { ...driverProfileLoadState.profile, ...patch };
  }
}

function getDriverProfileUpdateErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (code === "42501" || message.includes("valid conductor active context")) {
    return DRIVER_NO_PORTAL_ACCESS_MESSAGE;
  }

  if (code === "23514" || message.includes("invalid") || message.includes("cannot exceed")) {
    return "Revisa el dato introducido.";
  }

  return "No se pudo actualizar el perfil.";
}
function saveDriverProfile(event) {
  event.preventDefault();
  saveDriverProfilePhone();
}

function renderDriverProfileAvatar() {
  const photoUrl = driverProfile.profilePhoto || driverProfile.avatar || driverProfile.photoUrl || "";

  if (photoUrl) {
    return `<img class="driver-profile-avatar" src="${escapeHtml(photoUrl)}" alt="Foto de ${escapeHtml(driverProfile.name)}" />`;
  }

  return `<span class="driver-profile-avatar driver-profile-avatar--initials" aria-hidden="true">${escapeHtml(getDriverProfileInitials(driverProfile.name))}</span>`;
}

function renderDriverProfileLine(label, value) {
  return `
    <div class="driver-profile-line">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "-")}</dd>
    </div>
  `;
}

function renderDriverProfilePhoneLine() {
  if (isDriverProfilePhoneEditing) {
    const disabledAttribute = isDriverProfilePhoneSaving ? 'disabled aria-disabled="true"' : "";

    return `
      <div class="driver-profile-line driver-profile-line--phone">
        <dt>Telefono</dt>
        <dd>
          <input id="driver-profile-phone" type="tel" autocomplete="tel" value="${escapeHtml(driverProfile.phone || "")}" aria-label="Telefono del chofer" ${disabledAttribute} />
          <button class="driver-profile-phone-action" type="button" data-driver-action="profile-phone-save" aria-label="Guardar telefono" ${disabledAttribute}>
            ${isDriverProfilePhoneSaving ? "Guardando..." : renderDriverProfileActionIcon("save")}
          </button>
          <button class="driver-profile-phone-action" type="button" data-driver-action="profile-phone-cancel" aria-label="Cancelar edicion de telefono" ${disabledAttribute}>
            ${renderDriverProfileActionIcon("cancel")}
          </button>
        </dd>
      </div>
    `;
  }

  const phoneDisplay = formatDriverPhoneForDisplay(driverProfile.phone) || "-";

  return `
    <div class="driver-profile-line driver-profile-line--phone">
      <dt>Telefono</dt>
      <dd>
        <span>${escapeHtml(phoneDisplay)}</span>
        <button class="driver-profile-phone-action" type="button" data-driver-action="profile-phone-edit" aria-label="Editar telefono">
          ${renderDriverProfileActionIcon("edit")}
        </button>
      </dd>
    </div>
  `;
}
function renderDriverProfileActionIcon(name) {
  const fallbackIcons = {
    edit: '<i class="fa-regular fa-pen-to-square" aria-hidden="true"></i>',
    save: '<i class="fa-regular fa-floppy-disk" aria-hidden="true"></i>',
    cancel: '<i class="fa-solid fa-xmark" aria-hidden="true"></i>',
  };

  return renderDriverIcon(name) || fallbackIcons[name] || "";
}

function getDriverProfileInitials(name) {
  const initials = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "CH";
}

function editDriverProfilePhone() {
  if (!driverProfile || isDriverProfilePhoneSaving) {
    return;
  }

  isDriverProfilePhoneEditing = true;
  renderDriverProfile();

  const phoneInput = getElement("driver-profile-phone");

  if (phoneInput) {
    phoneInput.focus();
    phoneInput.select();
  }
}

function cancelDriverProfilePhoneEdit() {
  if (isDriverProfilePhoneSaving) {
    return;
  }

  isDriverProfilePhoneEditing = false;
  renderDriverProfile();
}

function saveDriverProfilePhone() {
  if (!driverProfile || isDriverProfilePhoneSaving) {
    return;
  }

  const phoneInput = getElement("driver-profile-phone");
  const phone = phoneInput ? phoneInput.value.trim() : "";

  if (isDriverRealProfileMode()) {
    updateCurrentDriverPhone(phone);
    return;
  }

  if (!phone) {
    showDriverProfileMessage("Introduce un tel\u00e9fono.");

    if (phoneInput) {
      phoneInput.focus();
    }

    return;
  }

  driverProfile = { ...driverProfile, phone };
  isDriverProfilePhoneEditing = false;
  renderDriverProfile();
  window.ElaraNotifications.showToast("Tel\u00e9fono guardado correctamente.", "success");
}

async function updateCurrentDriverPhone(phone) {
  if (!window.ElaraSupabase?.client) {
    showDriverProfileMessage("No hay conexion disponible para actualizar el telefono.");
    return;
  }

  isDriverProfilePhoneSaving = true;
  renderDriverProfile();

  try {
    const { data, error } = await window.ElaraSupabase.client.rpc("update_current_driver_phone", {
      p_phone: phone,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    applyDriverProfilePatch({ phone: result?.phone || "" });
    isDriverProfilePhoneEditing = false;
    window.ElaraNotifications.showToast("Tel\u00e9fono actualizado.", "success");
  } catch (error) {
    console.error("[ELARA Driver] No se pudo actualizar el telefono real del conductor.", {
      message: error?.message || "",
      code: error?.code || "",
      details: error?.details || "",
    });
    showDriverProfileMessage(getDriverProfileUpdateErrorMessage(error));
  } finally {
    isDriverProfilePhoneSaving = false;
    renderDriverProfile();
  }
}
function showDriverProfileMessage(message) {
  const messageElement = getElement("driver-profile-phone-message");

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.hidden = false;
}

function openServiceDetail(serviceId) {
  const service = getServiceById(serviceId);
  const content = getElement("driver-service-detail-content");
  const actions = getElement("driver-service-detail-actions");

  if (!service || !content) {
    return;
  }

  if (actions) {
    actions.hidden = Boolean(service.isRealDriverService);
  }

  selectedServiceId = serviceId;
  content.innerHTML = `
    <article class="driver-detail-card">
      <header class="driver-detail-card__header">
        <div>
          <p class="panel__eyebrow">${escapeHtml(service.type)}</p>
          <h3>${escapeHtml(service.customerName)}</h3>
        </div>
        ${renderStatusPill(service.status, service.displayStatus)}
      </header>

      <section class="driver-detail-when" aria-label="Fecha y hora">
        <span><strong>Fecha:</strong> ${escapeHtml(formatDate(service.date))}</span>
        <span><strong>Hora:</strong> ${escapeHtml(service.time)}</span>
      </section>

      <section class="driver-detail-section">
        <h4>Itinerario</h4>
        ${renderDetailItinerary(service)}
      </section>

      <section class="driver-detail-section">
        <h4>Datos del pasajero</h4>
        <p class="driver-detail-passenger">${escapeHtml(service.customerName)} - ${escapeHtml(service.passengerName)}</p>
        <div class="driver-detail-quick">
          <span><strong>Tel:</strong> ${escapeHtml(service.passengerPhone || "-")}</span>
          <span>${escapeHtml(service.passengers || "-")} pasajeros</span>
          <span>${escapeHtml(service.luggage || "0")} maletas</span>
        </div>
      </section>

      ${renderDriverCollectionBlock(service)}

      <section class="driver-detail-section">
        <h4>Datos operativos</h4>
        <div class="driver-detail-ops">
          <p><span>Vehiculo asignado</span>${escapeHtml(service.assignedVehicle)} - ${escapeHtml(service.plate)}</p>
          <p><span>Reserva</span>${escapeHtml(service.id.toUpperCase())}</p>
          <p><span>Observaciones</span>${escapeHtml(service.notes || "Sin observaciones")}</p>
        </div>
      </section>
    </article>
    ${renderChangeLog(service)}
  `;
  openModal("driver-service-detail-modal");
}

function openHistoryDetail(serviceId) {
  const service = getServiceById(serviceId);
  const content = getElement("driver-service-detail-content");
  const actions = getElement("driver-service-detail-actions");

  if (!service || !content || !isClosedServiceStatus(service.status)) {
    return;
  }

  if (actions) {
    actions.hidden = true;
  }

  selectedServiceId = serviceId;
  content.innerHTML = `
    <article class="driver-detail-card">
      <header class="driver-detail-card__header">
        <div>
          <p class="panel__eyebrow">${escapeHtml(service.type)}</p>
          <h3>${escapeHtml(service.customerName || service.passengerName || "Servicio cerrado")}</h3>
        </div>
        ${renderStatusPill(service.status)}
      </header>

      <section class="driver-detail-when" aria-label="Fecha y hora">
        <span><strong>Fecha:</strong> ${escapeHtml(formatDate(service.date))}</span>
        <span><strong>Hora:</strong> ${escapeHtml(service.time)}</span>
      </section>

      <section class="driver-detail-section">
        <h4>Itinerario</h4>
        ${renderDetailItinerary(service)}
      </section>

      <section class="driver-detail-section">
        <h4>Cierre</h4>
        <dl class="driver-history-detail-grid">
          ${renderModalField("Pasajero / cliente", `${service.passengerName || "-"} / ${service.customerName || "-"}`)}
          ${renderModalField("Pasajeros", service.passengers || "-")}
          ${renderModalField("Maletas", service.luggage || "0")}
          ${renderModalField("Importe", service.estimatedPrice || "Sin importe")}
          ${renderModalField("Estado final", driverStatusLabels[service.status] || service.status)}
          ${renderModalField("Valoracion", getClosingRatingLabel(service))}
          ${renderModalField("Motivos", getClosingReasonsLabel(service))}
          ${renderModalField("Observacion", getClosingNotesLabel(service))}
        </dl>
      </section>
    </article>
  `;
  openModal("driver-service-detail-modal");
}

function openDriverServiceIncidentModal(serviceId) {
  const service = getServiceById(serviceId);
  const form = document.getElementById("driver-service-incident-form");
  const serviceInput = document.getElementById("driver-service-incident-service-id");
  const summary = document.getElementById("driver-service-incident-summary");
  const description = document.getElementById("driver-service-incident-description");

  if (!service || !form || !serviceInput) {
    return;
  }

  if (!canReportDriverServiceIncident(service)) {
    window.ElaraNotifications.showToast("No se puede reportar una incidencia para este servicio.", "info");
    return;
  }

  selectedDriverServiceIncidentServiceId = service.id;
  form.reset();
  serviceInput.value = service.id;
  if (summary) {
    summary.textContent = service.code || service.humanCode || service.id || "Servicio";
  }
  if (description) {
    description.value = "";
  }
  clearDriverServiceIncidentError();
  setDriverServiceIncidentSubmitDisabled(false);
  renderDriverServiceIncidentCategoryOptions([], { loading: true });
  openModal("driver-service-incident-modal");

  void loadDriverServiceIncidentCategories()
    .then((categories) => {
      if (selectedDriverServiceIncidentServiceId !== service.id) {
        return;
      }
      renderDriverServiceIncidentCategoryOptions(categories);
    })
    .catch((error) => {
      console.error("[ELARA Driver] No se pudieron cargar las categorias de incidencia del servicio.", { error: error?.message || error });
      renderDriverServiceIncidentCategoryOptions([]);
      showDriverServiceIncidentError("No se pudieron cargar las categorias de incidencia.");
    });
}

function closeDriverServiceIncidentModal() {
  closeModal("driver-service-incident-modal");
  selectedDriverServiceIncidentServiceId = "";
  isSubmittingDriverServiceIncident = false;
  setDriverServiceIncidentSubmitDisabled(false);
  clearDriverServiceIncidentError();
}

async function loadDriverServiceIncidentCategories(options = {}) {
  if (!shouldUseRealDriverServiceIncidents()) {
    return [];
  }

  if (!options.force && driverServiceIncidentCategoriesLoadState.status === "loaded") {
    return driverServiceIncidentCategoriesLoadState.categories;
  }

  if (!options.force && driverServiceIncidentCategoriesLoadState.status === "loading" && driverServiceIncidentCategoriesLoadState.promise) {
    return driverServiceIncidentCategoriesLoadState.promise;
  }

  const promise = fetchDriverServiceIncidentCategories();
  driverServiceIncidentCategoriesLoadState = {
    ...driverServiceIncidentCategoriesLoadState,
    status: "loading",
    promise,
    error: "",
  };

  try {
    const categories = await promise;
    driverServiceIncidentCategoriesLoadState = {
      status: "loaded",
      promise: null,
      categories,
      error: "",
    };
    return categories;
  } catch (error) {
    driverServiceIncidentCategoriesLoadState = {
      status: "error",
      promise: null,
      categories: [],
      error: error?.message || "No se pudieron cargar las categorias de incidencia.",
    };
    throw error;
  }
}

async function fetchDriverServiceIncidentCategories() {
  if (!window.ElaraSupabase?.client) {
    return [];
  }

  const { data, error } = await window.ElaraSupabase.client
    .from("incident_categories")
    .select("key,name_es,default_severity,applies_to,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .filter((category) => Array.isArray(category.applies_to) && category.applies_to.includes("service"))
    .map((category) => ({
      key: String(category.key || "").trim(),
      label: String(category.name_es || category.key || "").trim(),
      severity: String(category.default_severity || "").trim(),
    }))
    .filter((category) => category.key && category.label);
}

function renderDriverServiceIncidentCategoryOptions(categories, options = {}) {
  const select = document.getElementById("driver-service-incident-type");

  if (!select) {
    return;
  }

  if (options.loading) {
    select.innerHTML = '<option value="">Cargando categorias...</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;

  if (!categories.length) {
    select.innerHTML = '<option value="">Sin categorias disponibles</option>';
    return;
  }

  select.innerHTML = [
    '<option value="">Selecciona una categoria</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category.key)}">${escapeHtml(category.label)}</option>`),
  ].join("");
}

async function submitDriverServiceIncident(event) {
  event.preventDefault();

  if (isSubmittingDriverServiceIncident) {
    return;
  }

  const service = getServiceById(selectedDriverServiceIncidentServiceId);
  const typeInput = document.getElementById("driver-service-incident-type");
  const descriptionInput = document.getElementById("driver-service-incident-description");
  const categoryKey = String(typeInput?.value || "").trim();
  const description = String(descriptionInput?.value || "").trim();

  if (!service || !canReportDriverServiceIncident(service)) {
    showDriverServiceIncidentError("No se puede reportar una incidencia para este servicio.");
    return;
  }

  if (!categoryKey) {
    showDriverServiceIncidentError("Selecciona una categoria de incidencia.");
    return;
  }

  if (!description) {
    showDriverServiceIncidentError("Describe brevemente la incidencia.");
    return;
  }

  if (description.length > 2000) {
    showDriverServiceIncidentError("La descripcion no puede superar 2000 caracteres.");
    return;
  }

  if (!window.ElaraSupabase?.client) {
    showDriverServiceIncidentError("No hay conexion disponible para registrar la incidencia.");
    return;
  }

  isSubmittingDriverServiceIncident = true;
  setDriverServiceIncidentSubmitDisabled(true, "Registrando...");
  clearDriverServiceIncidentError();

  try {
    const { data, error } = await window.ElaraSupabase.client.rpc("create_driver_service_incident", {
      p_service_id: service.centralServiceId,
      p_incident_type: categoryKey,
      p_description: description,
    });

    if (error) {
      throw error;
    }

    const incident = Array.isArray(data) ? data[0] : data;
    closeDriverServiceIncidentModal();
    window.ElaraNotifications.showToast(`Incidencia registrada correctamente.${incident?.human_code ? ` ${incident.human_code}` : ""}`, "success");
  } catch (error) {
    console.error("[ELARA Driver] No se pudo registrar la incidencia real del servicio.", { error: error?.message || error });
    showDriverServiceIncidentError(getDriverServiceIncidentErrorMessage(error));
  } finally {
    isSubmittingDriverServiceIncident = false;
    setDriverServiceIncidentSubmitDisabled(false);
  }
}

function getDriverServiceIncidentErrorMessage(error) {
  const message = String(error?.message || "").trim();
  const normalizedMessage = message.toLowerCase();

  if (!message) {
    return "No se pudo registrar la incidencia.";
  }

  if (normalizedMessage.includes("valid conductor active context")) {
    return "Tu sesion de conductor no esta disponible. Vuelve a iniciar sesion.";
  }

  if (normalizedMessage.includes("category") && normalizedMessage.includes("not valid")) {
    return "Selecciona una categoria valida para el servicio.";
  }

  if (normalizedMessage.includes("description cannot be empty")) {
    return "Describe brevemente la incidencia.";
  }

  if (normalizedMessage.includes("description cannot exceed")) {
    return "La descripcion no puede superar 2000 caracteres.";
  }

  if (normalizedMessage.includes("selected service cannot receive")) {
    return "Este servicio no admite reporte de incidencias desde el portal.";
  }

  return message;
}

function showDriverServiceIncidentError(message) {
  const error = document.getElementById("driver-service-incident-error");

  if (!error) {
    return;
  }

  error.textContent = message || "No se pudo registrar la incidencia.";
  error.hidden = false;
}

function clearDriverServiceIncidentError() {
  const error = document.getElementById("driver-service-incident-error");

  if (!error) {
    return;
  }

  error.textContent = "";
  error.hidden = true;
}

function setDriverServiceIncidentSubmitDisabled(disabled, label = "Registrar incidencia") {
  const submit = document.querySelector('#driver-service-incident-form button[type="submit"]');

  if (!submit) {
    return;
  }

  submit.disabled = Boolean(disabled);
  submit.textContent = label;
}

function openRouteChange(serviceId) {
  const service = getServiceById(serviceId);
  const form = getElement("driver-route-change-form");

  if (!service || !form) {
    return;
  }

  if (getOperationalStatus(service) !== "pasajero_a_bordo") {
    window.ElaraNotifications.showToast("Cambio de ruta disponible cuando el pasajero est\u00e9 a bordo.", "info");
    return;
  }

  selectedServiceId = serviceId;
  routeChangeDraft = createRouteChangeDraft(service);

  form.reset();
  clearRouteChangeError();
  renderRouteChangeItinerary(getRouteChangeDraftService(service));
  openModal("driver-route-change-modal");
}

function handleRouteChangeClick(event) {
  const removeButton = event.target.closest("[data-driver-remove-stop]");

  if (!removeButton) {
    return;
  }

  const service = getServiceById(selectedServiceId);
  const stopIndex = Number.parseInt(removeButton.dataset.driverRemoveStop, 10);
  const draft = service ? ensureRouteChangeDraft(service) : null;
  const intermediateStops = draft ? draft.stops : [];

  if (!service || !draft || Number.isNaN(stopIndex) || !intermediateStops[stopIndex]) {
    return;
  }

  draft.stops = intermediateStops.filter((_, index) => index !== stopIndex);
  draft.dirty = true;
  updateRouteDraftSegment(draft, service);
  clearRouteChangeError();
  renderRouteChangeItinerary(getRouteChangeDraftService(service));
}

function saveRouteChange(event) {
  event.preventDefault();

  const service = getServiceById(selectedServiceId);
  const draft = service ? ensureRouteChangeDraft(service) : null;
  const destinationInput = getElement("driver-new-destination");
  const routeTypeInput = document.querySelector("input[name='driver-route-change-type']:checked");

  if (!service || !draft || !destinationInput) {
    return;
  }

  const destination = destinationInput.value.trim();
  const routeChangeType = routeTypeInput ? routeTypeInput.value : "stop";
  let shouldLogRouteChange = false;

  if (!destination && !draft.dirty) {
    showRouteChangeError(destinationInput);
    return;
  }

  if (destination) {
    if (routeChangeType === "destination") {
      if (!canUseRouteChangeDestination(service, destination)) {
        showRouteChangeError(destinationInput, "El destino final no puede coincidir con el origen.");
        return;
      }

      if (isSameRoutePoint(destination, draft.destination) && !draft.dirty) {
        showRouteChangeError(destinationInput, "Introduce un destino final diferente.");
        return;
      }

      if (!isSameRoutePoint(destination, draft.destination)) {
        draft.destination = destination;
        draft.stops = removeRoutePointFromList(draft.stops, destination);
        draft.dirty = true;
        shouldLogRouteChange = true;
      }
      updateRouteDraftSegment(draft, service);
    } else {
      const stopValidationMessage = getRouteStopValidationMessage(service, draft, destination);

      if (stopValidationMessage) {
        showRouteChangeError(destinationInput, stopValidationMessage);
        return;
      }

      draft.stops = draft.stops.concat(destination);
      if (getOperationalStatus(service) === "pasajero_a_bordo" && draft.routeSegment !== "esperando_en_parada_intermedia") {
        draft.routeSegment = "yendo_a_parada_intermedia";
      }
      draft.dirty = true;
      shouldLogRouteChange = true;
    }

    if (shouldLogRouteChange && !Array.isArray(service.changeLog)) {
      service.changeLog = [];
    }

    if (shouldLogRouteChange) {
      service.changeLog.push({
        destination,
        reason: routeChangeType === "destination" ? "Destino final actualizado" : "Parada intermedia agregada",
        status: "Pendiente de revision administrativa",
        createdAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  }

  applyRouteChangeDraft(service, draft);
  routeChangeDraft = null;
  saveServices();
  closeModal("driver-route-change-modal");
  window.ElaraNotifications.showToast("Cambio de ruta guardado.", "success");
  renderDriverServices();
}

function createRouteChangeDraft(service) {
  return {
    serviceId: service.id,
    destination: service.destination,
    stops: getIntermediateStops(service),
    routeSegment: service.routeSegment || "",
    currentStop: service.currentStop || "",
    dirty: false,
  };
}

function ensureRouteChangeDraft(service) {
  if (!routeChangeDraft || routeChangeDraft.serviceId !== service.id) {
    routeChangeDraft = createRouteChangeDraft(service);
  }

  return routeChangeDraft;
}

function getRouteChangeDraftService(service) {
  const draft = ensureRouteChangeDraft(service);

  return {
    ...service,
    destination: draft.destination,
    stops: draft.stops,
    routeSegment: draft.routeSegment,
    currentStop: draft.currentStop,
  };
}

function updateRouteDraftSegment(draft, service) {
  if (getOperationalStatus(service) !== "pasajero_a_bordo") {
    return;
  }

  if (draft.routeSegment === "esperando_en_parada_intermedia" && draft.currentStop) {
    return;
  }

  draft.routeSegment = draft.stops.length ? "yendo_a_parada_intermedia" : "yendo_a_destino_final";
}

function applyRouteChangeDraft(service, draft) {
  service.destination = draft.destination;
  service.stops = draft.stops.slice();
  service.routeSegment = draft.routeSegment;
  service.currentStop = draft.currentStop;
  setPassengerOnboardSegmentFromStops(service);
}

function discardRouteChangeDraft() {
  routeChangeDraft = null;
}

function getRouteStopValidationMessage(service, draft, stop) {
  if (isSameRoutePoint(stop, service.origin)) {
    return "La parada no puede coincidir con el origen.";
  }

  if (isSameRoutePoint(stop, draft.destination)) {
    return "La parada no puede coincidir con el destino final.";
  }

  if (routePointExists(draft.stops, stop)) {
    return "Esa parada ya esta en la ruta.";
  }

  return "";
}

function canUseRouteChangeDestination(service, destination) {
  return !isSameRoutePoint(destination, service.origin);
}

function removeRoutePointFromList(points, pointToRemove) {
  return points.filter((point) => !isSameRoutePoint(point, pointToRemove));
}

function routePointExists(points, point) {
  return points.some((existingPoint) => isSameRoutePoint(existingPoint, point));
}

function isSameRoutePoint(firstPoint, secondPoint) {
  return normalizeRouteText(firstPoint) === normalizeRouteText(secondPoint);
}

function renderRouteChangeItinerary(service) {
  const container = getElement("driver-route-change-itinerary");

  if (!container) {
    return;
  }

  const isHeadingToDropoff = getOperationalStatus(service) === "pasajero_a_bordo";
  const activeState = isHeadingToDropoff ? getActiveServiceState(service) : null;
  const intermediateStops = getIntermediateStops(service);
  const firstPendingStop = intermediateStops[0] || "";
  const nextPoint =
    activeState && activeState.routeSegment === "esperando_en_parada_intermedia"
      ? firstPendingStop || service.destination
      : isHeadingToDropoff
        ? activeState.nextPoint
        : service.origin;
  const nextPointType = normalizeRouteText(nextPoint) === normalizeRouteText(service.destination)
    ? "destination"
    : intermediateStops.some((stop) => normalizeRouteText(stop) === normalizeRouteText(nextPoint))
      ? "stop"
      : "origin";
  const itineraryItems = [];
  const seenPoints = new Set();
  const addItineraryItem = (type, label, stopIndex = null) => {
    const normalizedLabel = normalizeRouteText(label);

    if (!normalizedLabel || seenPoints.has(normalizedLabel)) {
      return;
    }

    seenPoints.add(normalizedLabel);
    itineraryItems.push({ type, label, stopIndex });
  };

  addItineraryItem(nextPointType, nextPoint, nextPointType === "stop" ? intermediateStops.findIndex((stop) => normalizeRouteText(stop) === normalizeRouteText(nextPoint)) : null);
  intermediateStops.forEach((stop, index) => {
    addItineraryItem("stop", stop, index);
  });
  addItineraryItem("destination", service.destination);

  container.innerHTML = `
    <ol>
      ${itineraryItems
        .map(
          (item) => `
            <li class="driver-route-change-step driver-route-change-step--${item.type}">
              ${renderDriverIcon(item.type === "destination" ? "destination" : item.type === "stop" ? "stop" : "origin")}
              <span>${escapeHtml(item.label)}</span>
              ${
                item.type === "stop"
                  ? `<button class="driver-route-change-remove" type="button" data-driver-remove-stop="${item.stopIndex}" aria-label="Eliminar parada" title="Eliminar parada">${renderDriverIcon("delete")}</button>`
                  : ""
              }
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function showRouteChangeError(input, message = "Introduce una direccion.") {
  const error = getElement("driver-route-change-error");

  input.classList.add("is-invalid");
  input.setAttribute("aria-invalid", "true");
  input.focus();

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearRouteChangeError() {
  const input = getElement("driver-new-destination");
  const error = getElement("driver-route-change-error");

  if (input) {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
  }

  if (error) {
    error.hidden = true;
  }
}

function savePickupEdit(serviceId) {
  const service = getServiceById(serviceId);
  const input = getElement("driver-pickup-edit-input");

  if (!service || !input) {
    return;
  }

  if (!getActiveServiceState(service).canEditPickup) {
    editingPickupServiceId = null;
    renderDriverServices();
    return;
  }

  const newOrigin = input.value.trim();

  if (!newOrigin) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    input.focus();
    window.ElaraNotifications.showToast("Introduce un punto de recogida.", "warning");
    return;
  }

  service.origin = newOrigin;
  editingPickupServiceId = null;
  saveServices();
  window.ElaraNotifications.showToast("Punto de recogida actualizado.", "success");
  renderDriverServices();
}

function openNoShowModal(serviceId) {
  const service = getServiceById(serviceId);
  const form = getElement("driver-finish-form");

  if (!service || !form || !canOpenNoShowFlow(service)) {
    window.ElaraNotifications.showToast("Solo puedes marcar no show durante la espera del pasajero.", "warning");
    return;
  }

  selectedServiceId = service.id;
  selectedFinishMode = "no_show";
  resetFinishRatingFlow();
  setFinishModalTitle("Registrar no show");
  renderFinishRatingReasons(selectedFinishMode);
  prepareNoShowFinishFlow();
  openModal("driver-finish-modal");
}

function canOpenNoShowFlow(service) {
  if (!service || getOperationalStatus(service) !== "esperando_pasajero") {
    return false;
  }

  if (!isDriverUsingCentralServices) {
    return true;
  }

  return canCloseCentralDriverNoShow(getCentralDriverServiceById(service.id));
}

function startFinishSlide(event) {
  const slider = event.target.closest("[data-driver-slide-finish]");

  if (!slider || slider.getAttribute("aria-disabled") === "true" || (event.button !== undefined && event.button !== 0)) {
    return;
  }

  const thumb = slider.querySelector(".driver-active-finish-slider__thumb");

  if (!thumb) {
    return;
  }

  const sliderRect = slider.getBoundingClientRect();
  const thumbRect = thumb.getBoundingClientRect();
  const maxOffset = Math.max(0, sliderRect.width - thumbRect.width - 8);

  finishSlideState = {
    slider,
    serviceId: slider.dataset.serviceId || activeServiceId,
    pointerId: event.pointerId,
    startX: event.clientX,
    offset: 0,
    maxOffset,
  };

  slider.classList.add("is-dragging");

  if (slider.setPointerCapture) {
    slider.setPointerCapture(event.pointerId);
  }

  event.preventDefault();
}

function moveFinishSlide(event) {
  if (!finishSlideState || event.pointerId !== finishSlideState.pointerId) {
    return;
  }

  const offset = Math.min(Math.max(event.clientX - finishSlideState.startX, 0), finishSlideState.maxOffset);
  finishSlideState.offset = offset;
  updateFinishSlide(finishSlideState.slider, offset);
  event.preventDefault();
}

function endFinishSlide(event) {
  if (!finishSlideState || event.pointerId !== finishSlideState.pointerId) {
    return;
  }

  const { slider, serviceId, offset, maxOffset } = finishSlideState;
  const completed = maxOffset > 0 && offset / maxOffset >= 0.78;

  finishSlideState = null;
  slider.classList.remove("is-dragging");

  if (completed) {
    slider.classList.add("is-complete");
    updateFinishSlide(slider, maxOffset);
    window.setTimeout(() => {
      resetFinishSlide(slider);
      void completeActiveSlide(serviceId);
    }, 140);
    return;
  }

  resetFinishSlide(slider);
}

function cancelFinishSlide(event) {
  if (!finishSlideState || event.pointerId !== finishSlideState.pointerId) {
    return;
  }

  resetFinishSlide(finishSlideState.slider);
  finishSlideState = null;
}

function handleFinishSlideKeydown(event) {
  const slider = event.target.closest("[data-driver-slide-finish]");

  if (!slider || slider.getAttribute("aria-disabled") === "true" || !["Enter", " "].includes(event.key)) {
    return;
  }

  event.preventDefault();
  void completeActiveSlide(slider.dataset.serviceId || activeServiceId);
}

function updateFinishSlide(slider, offset) {
  slider.style.setProperty("--finish-slide-progress", `${offset}px`);
}

function resetFinishSlide(slider) {
  slider.classList.remove("is-dragging", "is-complete");
  updateFinishSlide(slider, 0);
}

async function completeActiveSlide(serviceId) {
  const service = getServiceById(serviceId);

  if (!service) {
    return;
  }

  if (service.isRealDriverService) {
    await advanceRealDriverServiceProgress(service.id, getNextRealDriverServiceStage(service));
    return;
  }

  const status = getOperationalStatus(service);

  if (status === "en_camino") {
    updateServiceStatus(service.id, "esperando_pasajero");
    editingPickupServiceId = null;
    window.ElaraNotifications.showToast("Estado actualizado: esperando pasajero.", "success");
    renderDriverServices();
    return;
  }

  if (status === "esperando_pasajero") {
    updateServiceStatus(service.id, "pasajero_a_bordo");
    if (!isDriverUsingCentralServices) {
      service.currentStop = "";
      service.routeSegment = getIntermediateStops(service).length ? "yendo_a_parada_intermedia" : "yendo_a_destino_final";
      saveServices();
    }
    editingPickupServiceId = null;
    window.ElaraNotifications.showToast("Estado actualizado: pasajero a bordo.", "success");
    renderDriverServices();
    return;
  }

  if (status === "pasajero_a_bordo") {
    const segment = getPassengerOnboardSegment(service);

    if (segment === "yendo_a_parada_intermedia") {
      const intermediateStops = getIntermediateStops(service);
      const currentStop = intermediateStops[0];

      if (currentStop) {
        service.currentStop = currentStop;
        service.stops = intermediateStops.slice(1);
        service.routeSegment = "esperando_en_parada_intermedia";
        saveServices();
        window.ElaraNotifications.showToast("Llegada a parada intermedia registrada.", "success");
        renderDriverServices();
      }
      return;
    }

    if (segment === "esperando_en_parada_intermedia") {
      service.currentStop = "";
      service.routeSegment = getIntermediateStops(service).length ? "yendo_a_parada_intermedia" : "yendo_a_destino_final";
      saveServices();
      window.ElaraNotifications.showToast("Continuando itinerario.", "info");
      renderDriverServices();
      return;
    }
  }

  openFinishService(service.id);
}

function openFinishService(serviceId) {
  const service = getServiceById(serviceId);
  const form = getElement("driver-finish-form");

  if (!service || !form) {
    return;
  }

  if (getOperationalStatus(service) !== "pasajero_a_bordo") {
    window.ElaraNotifications.showToast("Solo puedes finalizar cuando el pasajero est\u00e9 a bordo.", "warning");
    return;
  }

  if (getPassengerOnboardSegment(service) !== "yendo_a_destino_final") {
    window.ElaraNotifications.showToast("Completa las paradas intermedias antes de finalizar.", "warning");
    return;
  }

  if (isDriverUsingCentralServices) {
    const centralService = getCentralDriverServiceById(service.id);
    const summary = getDriverServiceFinancialSummary(service);

    if (!ensureDriverCanOperate() || !canCloseCentralDriverService(centralService)) {
      window.ElaraNotifications.showToast("Solo puedes finalizar cuando el pasajero est\u00e9 a bordo.", "warning");
      return;
    }

    if (!summary || summary.totalPrice === null) {
      window.ElaraNotifications.showToast("No puedes finalizar un servicio sin precio definido.", "warning");
      return;
    }
  }

  if (shouldOpenDriverCashCollectionBeforeFinish(service)) {
    openDriverCashCollectionModal(service);
    return;
  }

  openDriverFinishRatingModal(serviceId);
}

function openDriverFinishRatingModal(serviceId) {
  const form = getElement("driver-finish-form");

  if (!form) {
    return;
  }

  selectedServiceId = serviceId;
  selectedFinishMode = "finish";
  selectedFinishRating = null;
  form.reset();
  resetFinishRatingFlow();
  setFinishModalTitle("Finalizar servicio");
  renderFinishRatingReasons(selectedFinishMode);
  renderFinishRatingFaces();
  openModal("driver-finish-modal");
}

function shouldOpenDriverCashCollectionBeforeFinish(service) {
  if (!isDriverUsingCentralServices) {
    return false;
  }

  const summary = getDriverServiceFinancialSummary(service);

  return Boolean(summary && summary.totalPrice !== null && Number(summary.pendingAmount) > 0);
}

function openDriverCashCollectionModal(service) {
  const summary = getDriverServiceFinancialSummary(service);
  const pendingAmount = Number(summary?.pendingAmount) || 0;

  if (!summary || summary.totalPrice === null || pendingAmount <= 0) {
    openDriverFinishRatingModal(service.id);
    return;
  }

  driverCashCollectionState = {
    serviceId: service.id,
    attemptId: `CASH-CLOSE-${service.id}-${Date.now()}`,
    processing: false,
  };

  setText("driver-cash-collection-title", `COBRAR AL PASAJERO ${formatDriverMoney(pendingAmount)}`);
  setText("driver-cash-total", formatDriverMoney(summary.totalPrice));
  setText("driver-cash-paid", formatDriverMoney(summary.paidAmount));
  setText("driver-cash-pending", formatDriverMoney(pendingAmount));
  clearDriverCashError("driver-cash-error");
  setDriverCashActionButtonsDisabled(false);
  openModal("driver-cash-collection-modal");
}

function cancelDriverCashCollection() {
  driverCashCollectionState = {
    serviceId: "",
    attemptId: "",
    processing: false,
  };
  closeModal("driver-cash-collection-modal");
  closeModal("driver-cash-incident-modal");
  clearDriverCashIncidentForm();
  renderDriverServices();
}

function confirmDriverCashCollection() {
  if (driverCashCollectionState.processing) {
    return;
  }

  const service = getCentralDriverServiceById(driverCashCollectionState.serviceId);
  const summary = getDriverValidatedCashCollectionSummary(service);

  if (!summary) {
    return;
  }

  const amount = Number(summary.pendingAmount) || 0;
  const snapshot = getDriverFinancialMutationSnapshot(service);

  driverCashCollectionState.processing = true;
  setDriverCashActionButtonsDisabled(true);

  try {
    const payment = createDriverCashPayment(service, amount, driverCashCollectionState.attemptId);
    const cashResult = window.ElaraCash.registerServiceCashPayment({
      service,
      payment,
      collector: getDriverCashReceiver(),
      suppressEvents: true,
    });

    payment.remittanceId = cashResult?.remittanceId || "";
    service.financial.payments.push(payment);
    window.ElaraServices.reconcileServicePaymentStatus(service);
    window.ElaraCash.validateCashFinancialIntegrity?.("driver-cash-collected");
    emitDriverServicesUpdatedEvent("driver-cash-collected", service);
    emitDriverCashUpdatedEvent("driver-cash-collected", service, payment, cashResult?.remittanceId || "");
    closeModal("driver-cash-collection-modal");
    openDriverFinishRatingModal(service.serviceId);
  } catch (error) {
    restoreDriverFinancialMutationSnapshot(service, snapshot);
    console.error("[ELARA] No se pudo registrar el cobro del conductor:", error);
    showDriverCashError("driver-cash-error", "No se pudo registrar el cobro. Intentalo nuevamente.");
  } finally {
    driverCashCollectionState.processing = false;
    setDriverCashActionButtonsDisabled(false);
  }
}

function openDriverCashIncidentModal() {
  const service = getCentralDriverServiceById(driverCashCollectionState.serviceId);
  const summary = getDriverValidatedCashCollectionSummary(service);

  if (!summary) {
    return;
  }

  closeModal("driver-cash-collection-modal");
  setText("driver-cash-incident-total", formatDriverMoney(summary.totalPrice));
  setText("driver-cash-incident-paid", formatDriverMoney(summary.paidAmount));
  setText("driver-cash-incident-pending", formatDriverMoney(summary.pendingAmount));
  clearDriverCashIncidentForm();
  openModal("driver-cash-incident-modal");
}

function submitDriverCashIncident(event) {
  event.preventDefault();

  if (driverCashCollectionState.processing) {
    return;
  }

  const service = getCentralDriverServiceById(driverCashCollectionState.serviceId);
  const summary = getDriverValidatedCashCollectionSummary(service);

  if (!summary) {
    return;
  }

  const validation = getDriverCashIncidentValidation(summary);

  if (!validation.valid) {
    showDriverCashError("driver-cash-incident-error", validation.message);
    validation.element?.focus();
    return;
  }

  const snapshot = getDriverFinancialMutationSnapshot(service);

  driverCashCollectionState.processing = true;
  setDriverCashIncidentSubmitDisabled(true);

  try {
    let payment = null;
    let remittanceId = null;

    if (validation.partialAmount > 0) {
      payment = createDriverCashPayment(service, validation.partialAmount, driverCashCollectionState.attemptId);
      const cashResult = window.ElaraCash.registerServiceCashPayment({
        service,
        payment,
        collector: getDriverCashReceiver(),
        suppressEvents: true,
      });

      remittanceId = cashResult?.remittanceId || "";
      payment.remittanceId = remittanceId;
      service.financial.payments.push(payment);
      window.ElaraServices.reconcileServicePaymentStatus(service);
    }

    const refreshedSummary = window.ElaraServices.calculateServiceFinancialSummary(service);
    const incident = createDriverCashCollectionIncident({
      service,
      summary,
      payment,
      remittanceId,
      reason: validation.reason,
      notes: validation.notes,
      partialAmount: validation.partialAmount,
      remainingAmount: refreshedSummary.pendingAmount,
    });

    window.ElaraAdminIncidentsMock.incidents.push(incident);
    window.ElaraCash.validateCashFinancialIntegrity?.("driver-cash-incident");
    emitDriverServicesUpdatedEvent("driver-cash-incident", service);
    emitDriverCashUpdatedEvent("driver-cash-incident", service, payment, remittanceId);
    closeModal("driver-cash-incident-modal");
    openDriverFinishRatingModal(service.serviceId);
  } catch (error) {
    restoreDriverFinancialMutationSnapshot(service, snapshot);
    console.error("[ELARA] No se pudo registrar la incidencia de cobro:", error);
    showDriverCashError("driver-cash-incident-error", "No se pudo registrar la incidencia. Intentalo nuevamente.");
  } finally {
    driverCashCollectionState.processing = false;
    setDriverCashIncidentSubmitDisabled(false);
  }
}

function getDriverValidatedCashCollectionSummary(service) {
  if (!window.ElaraServices || typeof window.ElaraServices.calculateServiceFinancialSummary !== "function") {
    showDriverCashError("driver-cash-error", "No se pudo validar la informacion financiera.");
    return null;
  }

  if (!window.ElaraCash || typeof window.ElaraCash.registerServiceCashPayment !== "function") {
    showDriverCashError("driver-cash-error", "No se pudo preparar la rendicion de efectivo.");
    return null;
  }

  if (!service || !ensureDriverCanOperate() || !canCloseCentralDriverService(service)) {
    showDriverCashError("driver-cash-error", "No puedes gestionar el cobro de este servicio.");
    return null;
  }

  const summary = window.ElaraServices.calculateServiceFinancialSummary(service);

  if (!summary || summary.totalPrice === null) {
    showDriverCashError("driver-cash-error", "No puedes finalizar un servicio sin precio definido.");
    return null;
  }

  if (Number(summary.pendingAmount) <= 0) {
    return summary;
  }

  return summary;
}

function createDriverCashPayment(service, amount, attemptId) {
  const currentUser = getDriverAuthenticatedUser();
  const receiver = getDriverCashReceiver();
  const paymentId =
    window.ElaraServices && typeof window.ElaraServices.getNextServicePaymentId === "function"
      ? window.ElaraServices.getNextServicePaymentId()
      : getFallbackDriverPaymentId();

  if (!currentUser || !receiver) {
    throw new Error("No se pudo resolver usuario o receptor del efectivo.");
  }

  if ((service.financial?.payments || []).some((payment) => payment.collectionAttemptId === attemptId)) {
    throw new Error("Este cobro ya fue registrado.");
  }

  return {
    id: paymentId,
    type: "payment",
    amount,
    method: "Efectivo",
    collectionMethod: "Efectivo",
    receiverType: receiver.type,
    receiverId: receiver.id,
    receiverName: receiver.name,
    reference: "",
    notes: "Cobro declarado desde Portal conductor.",
    serviceId: service.serviceId,
    customerId: service.customerCode || service.customerId || null,
    registeredByUserId: currentUser.id || "",
    registeredByName: currentUser.name || "Conductor",
    registeredAt: new Date().toISOString(),
    status: "Registrado",
    collectionAttemptId: attemptId,
  };
}

function getDriverCashReceiver() {
  const collaborator = driverProfile ? getDriverCollaboratorById(driverProfile.id) : null;

  if (!collaborator) {
    return null;
  }

  return {
    type: collaborator.driverType === "Colaborador" ? "Colaborador" : "Chofer",
    id: collaborator.id,
    name: collaborator.name,
  };
}

function getDriverCashIncidentValidation(summary) {
  const reasonElement = getElement("driver-cash-incident-reason");
  const notesElement = getElement("driver-cash-incident-notes");
  const partialElement = document.querySelector('input[name="driver-cash-partial"]:checked');
  const amountElement = getElement("driver-cash-partial-amount");
  const reason = reasonElement?.value || "";
  const notes = notesElement?.value.trim() || "";
  const hasPartialPayment = partialElement?.value === "yes";
  const pendingAmount = Number(summary.pendingAmount) || 0;
  const partialAmount = hasPartialPayment ? Number(String(amountElement?.value || "").replace(",", ".")) : 0;

  if (!reason) {
    return { valid: false, message: "Selecciona el motivo de la incidencia.", element: reasonElement };
  }

  if (hasPartialPayment) {
    if (!Number.isFinite(partialAmount) || partialAmount <= 0) {
      return { valid: false, message: "Introduce un importe parcial mayor que 0.", element: amountElement };
    }

    if (partialAmount === pendingAmount) {
      return { valid: false, message: "Si se cobro todo el pendiente, usa el boton Cobrado.", element: amountElement };
    }

    if (partialAmount > pendingAmount) {
      return { valid: false, message: "El importe parcial no puede superar el saldo pendiente.", element: amountElement };
    }
  }

  return {
    valid: true,
    reason,
    notes,
    partialAmount: hasPartialPayment ? Math.round((partialAmount + Number.EPSILON) * 100) / 100 : 0,
  };
}

function createDriverCashCollectionIncident({ service, summary, payment, remittanceId, reason, notes, partialAmount, remainingAmount }) {
  const currentUser = getDriverAuthenticatedUser();
  const now = new Date().toISOString();
  const incidentId = getNextDriverFinancialIncidentId();
  const incidentType = partialAmount > 0 ? "Pago parcial declarado por conductor" : "Cobro no completado";

  if (!window.ElaraAdminIncidentsMock || !Array.isArray(window.ElaraAdminIncidentsMock.incidents)) {
    throw new Error("No existe el sistema central de incidencias.");
  }

  if (
    window.ElaraAdminIncidentsMock.incidents.some(
      (incident) => incident.collectionAttemptId === driverCashCollectionState.attemptId && incident.type === incidentType,
    )
  ) {
    throw new Error("Esta incidencia de cobro ya fue registrada.");
  }

  return {
    incidentId,
    id: incidentId,
    type: incidentType,
    category: "FINANCIAL_COLLECTION",
    categoryLabel: incidentType,
    priority: "high",
    status: "Pendiente",
    serviceId: service.serviceId,
    customerId: service.customerCode || service.customerId || null,
    driverId: driverProfile?.id || "",
    driverName: driverProfile?.name || "Conductor",
    reportedByType: "Conductor",
    reportedById: driverProfile?.id || "",
    reportedByName: driverProfile?.name || "Conductor",
    involvedType: "Cliente",
    involvedId: service.customerCode || service.customerId || "",
    involvedName: service.client || service.customer || "Cliente",
    subject: incidentType,
    message: notes,
    reason,
    notes,
    totalAmount: Number(summary.totalPrice) || 0,
    previouslyPaidAmount: Number(summary.paidAmount) || 0,
    collectedAtClosingAmount: Number(partialAmount) || 0,
    remainingAmount: Number(remainingAmount) || Number(summary.pendingAmount) || 0,
    paymentId: payment?.id || null,
    remittanceId: remittanceId || null,
    collectionAttemptId: driverCashCollectionState.attemptId,
    assignedTo: "Administración",
    createdByUserId: currentUser?.id || "",
    createdByName: currentUser?.name || "Conductor",
    createdAt: now,
  };
}

function getNextDriverFinancialIncidentId() {
  const maxNumber = (window.ElaraAdminIncidentsMock?.incidents || []).reduce((max, incident) => {
    const match = String(incident.incidentId || incident.id || "").match(/^INC-FIN-(\d+)$/);

    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `INC-FIN-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getFallbackDriverPaymentId() {
  const maxNumber = (window.ElaraServicesMock?.services || []).reduce((max, service) => {
    const serviceMax = (service.financial?.payments || []).reduce((paymentMax, payment) => {
      const match = String(payment.id || "").match(/PAY-(\d+)/);

      return match ? Math.max(paymentMax, Number(match[1])) : paymentMax;
    }, 0);

    return Math.max(max, serviceMax);
  }, 0);

  return `PAY-${String(maxNumber + 1).padStart(4, "0")}`;
}

function getDriverFinancialMutationSnapshot(service) {
  return {
    paymentsLength: service.financial?.payments?.length || 0,
    remittancesLength: window.ElaraFinanceMock?.remittances?.length || 0,
    cashMovementsLength: window.ElaraFinanceMock?.cashMovements?.length || 0,
    incidentsLength: window.ElaraAdminIncidentsMock?.incidents?.length || 0,
    financial: service.financial ? { ...service.financial, payments: [...(service.financial.payments || [])] } : null,
  };
}

function restoreDriverFinancialMutationSnapshot(service, snapshot) {
  if (service && snapshot.financial) {
    service.financial = {
      ...snapshot.financial,
      payments: snapshot.financial.payments,
    };
  }

  if (window.ElaraFinanceMock?.remittances) {
    window.ElaraFinanceMock.remittances.length = snapshot.remittancesLength;
  }

  if (window.ElaraFinanceMock?.cashMovements) {
    window.ElaraFinanceMock.cashMovements.length = snapshot.cashMovementsLength;
  }

  if (window.ElaraAdminIncidentsMock?.incidents) {
    window.ElaraAdminIncidentsMock.incidents.length = snapshot.incidentsLength;
  }
}

function handleDriverCashIncidentChange(event) {
  if (!event.target.matches('input[name="driver-cash-partial"]')) {
    return;
  }

  const field = getElement("driver-cash-partial-amount-field");
  const amount = getElement("driver-cash-partial-amount");
  const hasPartialPayment = event.target.value === "yes";

  if (field) {
    field.hidden = !hasPartialPayment;
  }

  if (amount && !hasPartialPayment) {
    amount.value = "";
  }
}

function clearDriverCashIncidentForm() {
  const form = getElement("driver-cash-incident-form");
  const partialNo = document.querySelector('input[name="driver-cash-partial"][value="no"]');
  const partialField = getElement("driver-cash-partial-amount-field");

  form?.reset();

  if (partialNo) {
    partialNo.checked = true;
  }

  if (partialField) {
    partialField.hidden = true;
  }

  clearDriverCashError("driver-cash-incident-error");
}

function showDriverCashError(elementId, message) {
  const error = getElement(elementId);

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearDriverCashError(elementId) {
  const error = getElement(elementId);

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function setDriverCashActionButtonsDisabled(disabled) {
  document.querySelectorAll('#driver-cash-collection-modal [data-driver-action="cash-collected"], #driver-cash-collection-modal [data-driver-action="cash-not-collected"], #driver-cash-collection-modal [data-driver-action="cancel-cash-collection"]').forEach((button) => {
    button.disabled = disabled;
  });
}

function setDriverCashIncidentSubmitDisabled(disabled) {
  const submitButton = getElement("driver-cash-incident-form")?.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = disabled;
  }
}

function renderFinishRatingFaces() {
  const faceIcons = {
    good: "ratingGood",
    neutral: "ratingNeutral",
    bad: "ratingBad",
  };

  document.querySelectorAll("[data-driver-rating-face]").forEach((button) => {
    button.innerHTML = renderDriverIcon(faceIcons[button.dataset.driverRatingFace]);
  });
}

function prepareNoShowFinishFlow() {
  const form = getElement("driver-finish-form");
  const details = getElement("driver-finish-details");
  const incidentField = getElement("driver-finish-incident-field");
  const notes = getElement("driver-final-notes");
  const faces = document.querySelector(".driver-finish-faces");
  const submitButton = form ? form.querySelector("button[type='submit']") : null;

  selectedFinishRating = null;

  if (form) {
    form.dataset.finishRating = "bad";
  }

  if (faces) {
    faces.hidden = true;
  }

  if (details) {
    details.hidden = false;
  }

  if (incidentField) {
    incidentField.hidden = false;
    const label = incidentField.querySelector("span");

    if (label) {
      label.textContent = "Observaci\u00f3n breve";
    }
  }

  if (notes) {
    notes.value = "";
    notes.maxLength = 150;
    notes.placeholder = "Observaci\u00f3n breve opcional. Obligatoria si eliges Otro motivo.";
  }

  if (submitButton) {
    submitButton.textContent = "Confirmar no show";
  }
}

function handleFinishRatingClick(event) {
  const faceButton = event.target.closest("[data-driver-rating-face]");

  if (!faceButton) {
    return;
  }

  const rating = faceButton.dataset.driverRatingFace;

  if (rating === "good") {
    closeActiveServiceWithRating({
      rating: "good",
      ratingLabel: "Buena",
      reasons: [],
      hadIncident: "No",
      finalNotes: "",
    });
    return;
  }

  showFinishRatingDetails(rating);
}

function showFinishRatingDetails(rating) {
  const form = getElement("driver-finish-form");
  const details = getElement("driver-finish-details");
  const incidentField = getElement("driver-finish-incident-field");
  const error = getElement("driver-finish-error");

  selectedFinishRating = rating;

  if (form) {
    form.dataset.finishRating = rating;
  }

  document.querySelectorAll("[data-driver-rating-face]").forEach((button) => {
    const isSelected = button.dataset.driverRatingFace === rating;
    button.hidden = !isSelected;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (details) {
    details.hidden = false;
  }

  if (incidentField) {
    incidentField.hidden = rating !== "bad";
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}

function setFinishModalTitle(title) {
  setText("driver-finish-title", title);
}

function renderFinishRatingReasons(mode = selectedFinishMode) {
  const reasonsFieldset = document.querySelector(".driver-finish-reasons");
  const reasons = mode === "no_show" ? noShowRatingReasons : finishRatingReasons;

  if (!reasonsFieldset) {
    return;
  }

  if (mode === "no_show") {
    reasonsFieldset.innerHTML = `
      <label class="field">
        <span>Motivo</span>
        <select id="driver-no-show-reason-code" required>
          <option value="">Selecciona un motivo</option>
          ${driverNoShowReasonOptions.map((reason) => `<option value="${reason.code}">${reason.label}</option>`).join("")}
        </select>
      </label>
    `;
    return;
  }

  reasonsFieldset.innerHTML = reasons
    .map((reason) => `<label><input type="checkbox" name="driver-finish-reason" value="${reason.value}" /> ${reason.label}</label>`)
    .join("");
}

function resetFinishRatingFlow() {
  const form = getElement("driver-finish-form");
  const details = getElement("driver-finish-details");
  const incidentField = getElement("driver-finish-incident-field");
  const error = getElement("driver-finish-error");
  const notes = getElement("driver-final-notes");
  const faces = document.querySelector(".driver-finish-faces");
  const submitButton = form ? form.querySelector("button[type='submit']") : null;

  selectedFinishRating = null;

  if (form) {
    form.dataset.finishRating = "";
    form.reset();
  }

  document.querySelectorAll("[data-driver-rating-face]").forEach((button) => {
    button.hidden = false;
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });

  if (details) {
    details.hidden = true;
  }

  if (incidentField) {
    incidentField.hidden = true;
    const label = incidentField.querySelector("span");

    if (label) {
      label.textContent = "Describe la incidencia";
    }
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  if (notes) {
    notes.removeAttribute("maxlength");
    notes.placeholder = "Escribe un breve resumen opcional...";
  }

  if (faces) {
    faces.hidden = false;
  }

  if (submitButton) {
    submitButton.textContent = "Enviar valoraci\u00f3n";
  }
}

function finishActiveService(event) {
  event.preventDefault();

  if (selectedFinishMode === "no_show") {
    finishNoShowService();
    return;
  }

  const form = getElement("driver-finish-form");
  const rating = selectedFinishRating || (form ? form.dataset.finishRating : "");
  const reasonInputs = Array.from(document.querySelectorAll("input[name='driver-finish-reason']:checked"));
  const notes = getElement("driver-final-notes");
  const error = getElement("driver-finish-error");
  const reasons = reasonInputs.map((input) => input.value);

  if (!rating || rating === "good") {
    return;
  }

  if (!reasons.length) {
    showFinishRatingError("Selecciona al menos una opcion.");
    return;
  }

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  closeActiveServiceWithRating({
    rating,
    ratingLabel: rating === "bad" ? "Mala" : "Regular",
    reasons,
    hadIncident: rating === "bad" ? "Si" : "No",
    finalNotes: notes ? notes.value.trim() : "",
  });
}

function finishNoShowService() {
  const reasonCode = getElement("driver-no-show-reason-code");
  const notes = getElement("driver-final-notes");
  const selectedReason = driverNoShowReasonOptions.find((reason) => reason.code === reasonCode?.value);
  const details = notes ? notes.value.trim() : "";

  if (!selectedReason) {
    showFinishRatingError("Selecciona un motivo de no show.");
    return;
  }

  if (details.length > 150) {
    showFinishRatingError("La observaci\u00f3n breve no puede superar 150 caracteres.");
    return;
  }

  if (selectedReason.code === "OTHER" && !details) {
    showFinishRatingError("Introduce un detalle breve para Otro motivo.");
    return;
  }

  closeActiveServiceWithRating({
    closureReasonCode: selectedReason.code,
    closureReason: selectedReason.label,
    closureReasonDetails: details,
    rating: "no_show",
    ratingLabel: "No show",
    reasons: [selectedReason.label],
    hadIncident: "Si",
    finalNotes: details,
  });
}

function showFinishRatingError(message) {
  const error = getElement("driver-finish-error");

  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function closeActiveServiceWithRating(closing) {
  if (selectedFinishMode === "no_show") {
    closeNoShowWithRating(closing);
    return;
  }

  closeServiceWithRating(closing);
}

function closeNoShowWithRating(closing) {
  const service = getServiceById(selectedServiceId);

  if (!service || getOperationalStatus(service) !== "esperando_pasajero") {
    return;
  }

  if (isDriverUsingCentralServices) {
    closeCentralDriverNoShow(service.id, closing);
    return;
  }

  service.status = "no_show";
  service.routeSegment = "";
  service.currentStop = "";
  service.closing = {
    type: "no_show",
    ...closing,
    notes: closing.finalNotes || "",
    closedAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
  activeServiceId = null;
  isDriverActiveServiceVisible = false;
  editingPickupServiceId = null;
  selectedFinishRating = null;
  selectedFinishMode = "finish";
  saveServices();
  closeModal("driver-finish-modal");
  resetFinishRatingFlow();
  setFinishModalTitle("Finalizar servicio");
  renderFinishRatingReasons(selectedFinishMode);
  window.ElaraNotifications.showToast("Servicio marcado como no-show.", "warning");
  renderDriverServices();
}

function closeCentralDriverNoShow(serviceId, closing) {
  const service = getCentralDriverServiceById(serviceId);

  if (!ensureDriverCanOperate() || !canCloseCentralDriverNoShow(service)) {
    window.ElaraNotifications.showToast("Solo puedes marcar no show durante la espera del pasajero.", "warning");
    return;
  }

  service.status = "No show";
  service.closureType = "No show";
  service.closureSource = "Conductor";
  service.closureReasonCode = closing.closureReasonCode;
  service.closureReason = closing.closureReason;
  service.closureReasonDetails = closing.closureReasonDetails || "";
  service.closedAt = new Date().toISOString();
  service.driverStage = "";
  service.stageUpdatedAt = service.closedAt;
  service.closing = {
    rating: closing.rating,
    ratingLabel: closing.ratingLabel,
    reasons: Array.isArray(closing.reasons) ? [...closing.reasons] : [],
    hadIncident: closing.hadIncident,
    finalNotes: closing.finalNotes || "",
    closedAt: service.closedAt,
  };

  releaseDriverIfNoOtherCentralServiceInProgress(service.serviceId);

  activeServiceId = null;

  isDriverActiveServiceVisible = false;
  editingPickupServiceId = null;
  selectedFinishRating = null;
  selectedFinishMode = "finish";
  driverProfile = loadProfile();
  driverServices = loadServices();
  closeModal("driver-finish-modal");
  resetFinishRatingFlow();
  setFinishModalTitle("Finalizar servicio");
  renderFinishRatingReasons(selectedFinishMode);
  registerDriverServiceActivity("SERVICE_NO_SHOW", service, {
    title: "Servicio marcado como No show",
    description: `${driverProfile.name} cerr\u00f3 ${service.serviceId} como No show.`,
    metadata: {
      closureReasonCode: service.closureReasonCode,
    },
  });
  emitDriverServicesUpdatedEvent("no-show", service);
  window.ElaraNotifications.showToast("Servicio marcado como no show correctamente.", "success");
  renderDriverServices();
}

function canCloseCentralDriverNoShow(service) {
  return Boolean(
    service &&
      driverProfile &&
      isCentralServiceAssignedToCurrentDriver(service) &&
      service.status === "En curso" &&
      service.driverStage === "esperando_pasajero" &&
      !isDriverClosedCentralServiceStatus(service.status),
  );
}

function closeServiceWithRating(closing) {
  const service = getServiceById(selectedServiceId);

  if (!service) {
    return;
  }

  if (isDriverUsingCentralServices) {
    closeCentralServiceWithRating(service.id, closing);
    return;
  }

  service.status = "finalizado";
  service.routeSegment = "";
  service.currentStop = "";
  service.closing = {
    ...closing,
  };
  activeServiceId = null;
  isDriverActiveServiceVisible = false;
  selectedFinishRating = null;
  selectedFinishMode = "finish";
  saveServices();
  closeModal("driver-finish-modal");
  resetFinishRatingFlow();
  setFinishModalTitle("Finalizar servicio");
  renderFinishRatingReasons(selectedFinishMode);
  window.ElaraNotifications.showToast("Servicio finalizado en mock.", "success");
  renderDriverServices();
}

function closeCentralServiceWithRating(serviceId, closing) {
  const service = getCentralDriverServiceById(serviceId);

  if (!ensureDriverCanOperate() || !canCloseCentralDriverService(service)) {
    window.ElaraNotifications.showToast("Solo puedes finalizar cuando el pasajero est\u00e9 a bordo.", "warning");
    return;
  }

  service.status = "Finalizado";
  service.closureType = "Finalizaci\u00f3n";
  service.closureSource = "Conductor";
  service.closedAt = new Date().toISOString();
  service.driverStage = "";
  service.stageUpdatedAt = service.closedAt;
  service.closing = {
    ...closing,
    closedAt: service.closedAt,
  };

  if (typeof window.ElaraCustomers?.updateCustomerLifecycleFromServices === "function") {
    window.ElaraCustomers.updateCustomerLifecycleFromServices(service.customerCode, service);
  }

  releaseDriverIfNoOtherCentralServiceInProgress(service.serviceId);

  activeServiceId = null;

  isDriverActiveServiceVisible = false;
  selectedFinishRating = null;
  selectedFinishMode = "finish";
  driverProfile = loadProfile();
  driverServices = loadServices();
  closeModal("driver-finish-modal");
  resetFinishRatingFlow();
  setFinishModalTitle("Finalizar servicio");
  renderFinishRatingReasons(selectedFinishMode);
  registerDriverServiceActivity("SERVICE_FINALIZED", service, {
    title: "Servicio finalizado",
    description: `${driverProfile.name} finaliz\u00f3 ${service.serviceId}.`,
    metadata: {
      closing: service.closing || {},
    },
  });
  emitDriverServicesUpdatedEvent("finalized", service);
  window.ElaraNotifications.showToast("Servicio finalizado correctamente.", "success");
  renderDriverServices();
}

function canCloseCentralDriverService(service) {
  return Boolean(
    service &&
      driverProfile &&
      isCentralServiceAssignedToCurrentDriver(service) &&
      service.status === "En curso" &&
      service.driverStage === "pasajero_a_bordo",
  );
}

function releaseDriverIfNoOtherCentralServiceInProgress(closedServiceId) {
  if (!driverProfile) {
    return;
  }

  const hasOtherServiceInProgress = (window.ElaraServicesMock?.services || []).some(
    (service) =>
      service.serviceId !== closedServiceId &&
      isCentralServiceAssignedToCurrentDriver(service) &&
      service.status === "En curso",
  );

  if (hasOtherServiceInProgress) {
    return;
  }

  const collaborator = getDriverCollaboratorById(driverProfile.id);

  if (collaborator) {
    reconcileDriverCollaboratorOperationalStatuses();
  }
}

function reconcileDriverCollaboratorOperationalStatuses() {
  if (window.ElaraCollaborators && typeof window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses === "function") {
    window.ElaraCollaborators.reconcileCollaboratorOperationalStatuses();
  }
}

function emitDriverCollaboratorsUpdatedEvent(reason, collaborator) {
  window.dispatchEvent(
    new CustomEvent("elara:collaborators-updated", {
      detail: {
        reason,
        collaboratorId: collaborator?.id || driverProfile?.id || "",
      },
    }),
  );
}

function getNextOperationalService() {
  return driverServices
    .filter((service) => !isClosedServiceStatus(service.status))
    .sort((a, b) => getServiceDateTime(a) - getServiceDateTime(b))[0];
}

function getDriverVisibleServices() {
  return driverServices
    .filter((service) => !isClosedServiceStatus(service.status))
    .sort((a, b) => getServiceDateTime(a) - getServiceDateTime(b));
}

function getDriverHistoryServices() {
  return driverServices
    .filter((service) => isClosedServiceStatus(service.status))
    .filter((service) => driverHistoryFilter === "all" || service.status === driverHistoryFilter)
    .sort((a, b) => getDriverHistorySortTime(b) - getDriverHistorySortTime(a));
}

function getDriverHistorySortTime(service) {
  const closedAt = Date.parse(service?.closedAt || service?.closing?.closedAt || "");

  if (Number.isFinite(closedAt)) {
    return closedAt;
  }

  const scheduledAt = Date.parse(service?.scheduledStartAt || "");

  if (Number.isFinite(scheduledAt)) {
    return scheduledAt;
  }

  const fallbackTime = getServiceDateTime(service).getTime();

  return Number.isFinite(fallbackTime) ? fallbackTime : 0;
}

function isClosedServiceStatus(status) {
  return ["finalizado", "no_show", "no_realizado", "cancelado"].includes(status);
}

function getClosingRatingLabel(service) {
  const rating = service.closing ? service.closing.ratingLabel || service.closing.rating : "";
  const ratingMap = {
    good: "Buena",
    neutral: "Regular",
    bad: "Mala",
    "5": "Buena",
    "4": "Buena",
    "3": "Regular",
    "2": "Mala",
    "1": "Mala",
  };

  return ratingMap[rating] || rating || "-";
}

function getClosingReasonsLabel(service) {
  const reasons = service.closing && Array.isArray(service.closing.reasons) ? service.closing.reasons : [];

  return reasons.length ? reasons.join(", ") : "-";
}

function getClosingNotesLabel(service) {
  if (!service.closing) {
    return "-";
  }

  return service.closing.finalNotes || service.closing.notes || "-";
}

function getDriverOperationalStatus() {
  if (!isDriverProfileAdministrativelyActive()) {
    return "No disponible";
  }

  const activeService = getActiveService();

  if (activeService) {
    return "En servicio";
  }

  return driverProfile.collaboratorStatus;
}

function isDriverProfileAdministrativelyActive() {
  const collaborator = driverProfile ? getDriverCollaboratorById(driverProfile.id) : null;
  const administrativeStatus = collaborator?.administrativeStatus || driverProfile?.administrativeStatus || "";

  return normalizeDriverText(administrativeStatus) === "activo";
}

function ensureDriverCanOperate() {
  if (isDriverProfileAdministrativelyActive()) {
    return true;
  }

  driverProfile = loadProfile();
  driverServices = driverProfile ? loadServices() : [];
  activeServiceId = null;
  isDriverActiveServiceVisible = false;
  window.ElaraNotifications.showToast(DRIVER_INACTIVE_PROFILE_MESSAGE, "error");
  renderDriverServices();
  return false;
}

function getRouteTitle(service) {
  if (service.customerName && service.customerName !== "Cliente particular") {
    return service.customerName;
  }

  return `${service.origin} -> ${service.destination}`;
}

function getStopsLabel(service) {
  const intermediateStops = getIntermediateStops(service);

  if (!intermediateStops.length) {
    return "";
  }

  return intermediateStops.length === 1 ? "1 parada" : `${intermediateStops.length} paradas`;
}

function getStopsDetailLabel(service) {
  return getIntermediateStops(service).length === 1 ? "Parada" : "Paradas";
}

function getStopsDetailValue(service) {
  const intermediateStops = getIntermediateStops(service);

  if (!intermediateStops.length) {
    return "Sin paradas";
  }

  return intermediateStops.map((stop, index) => `${index + 1}. ${stop}`).join(" / ");
}

function getPassengerOnboardSegment(service) {
  if (getOperationalStatus(service) !== "pasajero_a_bordo") {
    return "";
  }

  if (service.routeSegment === "esperando_en_parada_intermedia" && service.currentStop) {
    return "esperando_en_parada_intermedia";
  }

  return getIntermediateStops(service).length ? "yendo_a_parada_intermedia" : "yendo_a_destino_final";
}

function setPassengerOnboardSegmentFromStops(service) {
  if (getOperationalStatus(service) !== "pasajero_a_bordo") {
    return;
  }

  if (service.routeSegment === "esperando_en_parada_intermedia" && service.currentStop) {
    return;
  }

  service.routeSegment = getIntermediateStops(service).length ? "yendo_a_parada_intermedia" : "yendo_a_destino_final";
}

function getActiveItineraryItems(service, activeState) {
  if (getOperationalStatus(service) === "pasajero_a_bordo") {
    const segment = activeState.routeSegment || getPassengerOnboardSegment(service);
    const intermediateStops = getIntermediateStops(service);
    const points = segment === "esperando_en_parada_intermedia" ? intermediateStops.concat(service.destination) : intermediateStops.concat(service.destination).slice(1);

    return points.map((point, index) => ({
      type: index < points.length - 1 ? "stop" : "destination",
      label: point,
    }));
  }

  return getActivePendingItinerary(service, activeState.nextPoint).map((point) => ({
    type: "stop",
    label: point,
  }));
}

function getActivePendingItinerary(service, nextPoint) {
  const points = getIntermediateStops(service).concat(service.destination);
  const nextPointNormalized = normalizeRouteText(nextPoint);
  const uniquePoints = [];

  points.forEach((point) => {
    const normalizedPoint = normalizeRouteText(point);

    if (!normalizedPoint || normalizedPoint === nextPointNormalized || uniquePoints.some((item) => normalizeRouteText(item) === normalizedPoint)) {
      return;
    }

    uniquePoints.push(point);
  });

  return uniquePoints;
}

function renderActivePendingItinerary(points, activeState) {
  if (!points.length) {
    return "";
  }

  if (activeState && activeState.action === "route-change") {
    return `
      <div class="driver-active-itinerary driver-active-itinerary--visual" aria-label="Itinerario pendiente">
        <ol>
          ${points
            .map(
              (point) => `
                <li class="driver-active-itinerary__item driver-active-itinerary__item--${point.type}">
                  ${renderDriverIcon(point.type === "destination" ? "destination" : "stop")}
                  <span>${escapeHtml(point.label)}</span>
                </li>
              `,
            )
            .join("")}
        </ol>
      </div>
    `;
  }

  return `
    <div class="driver-active-itinerary" aria-label="Siguientes destinos">
      <span>Siguientes destinos</span>
      <ol>
        ${points.map((point) => `<li>${escapeHtml(point.label)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function getIntermediateStops(service) {
  if (!Array.isArray(service.stops)) {
    return [];
  }

  const finalDestination = normalizeRouteText(service.destination);

  return service.stops.filter((stop) => normalizeRouteText(stop) !== finalDestination);
}

function normalizeRouteText(value) {
  return String(value || "").trim().toLowerCase();
}

function getActiveService() {
  return driverServices.find((service) => isActiveServiceStatus(service.status));
}

function getServiceById(serviceId) {
  return driverServices.find((service) => service.id === serviceId);
}

function updateServiceStatus(serviceId, status) {
  if (isDriverUsingCentralServices) {
    updateCentralDriverStage(serviceId, status);
    return;
  }

  const service = getServiceById(serviceId);

  if (!service) {
    return;
  }

  service.status = status;
  service.isNewAssignment = false;
  saveServices();
}

function updateCentralDriverStage(serviceId, stage) {
  const service = getCentralDriverServiceById(serviceId);

  if (
    !ensureDriverCanOperate() ||
    !service ||
    !driverProfile ||
    !isCentralServiceAssignedToCurrentDriver(service) ||
    service.status !== "En curso" ||
    isDriverClosedCentralServiceStatus(service.status) ||
    !canAdvanceCentralDriverStage(service.driverStage, stage)
  ) {
    return;
  }

  service.driverStage = stage;
  service.stageUpdatedAt = new Date().toISOString();
  registerDriverServiceActivity("SERVICE_STAGE_CHANGED", service, {
    title: "Etapa del servicio actualizada",
    description: `${driverProfile.name} actualiz\u00f3 ${service.serviceId} a ${getDriverStageActivityLabel(stage)}.`,
    metadata: {
      driverStage: stage,
    },
  });
  driverServices = loadServices();
}

function canAdvanceCentralDriverStage(currentStage, nextStage) {
  const currentIndex = DRIVER_CENTRAL_STAGE_SEQUENCE.indexOf(currentStage || "en_camino");
  const nextIndex = DRIVER_CENTRAL_STAGE_SEQUENCE.indexOf(nextStage);

  return currentIndex >= 0 && nextIndex === currentIndex + 1;
}

async function acceptDriverAssignment(serviceId) {
  const driverService = getServiceById(serviceId);

  if (driverService?.isRealDriverService) {
    await acceptRealDriverService(driverService);
    return;
  }

  if (!isDriverUsingCentralServices) {
    updateServiceStatus(serviceId, "aceptado");
    window.ElaraNotifications.showToast("Servicio aceptado en mock.", "success");
    renderDriverServices();
    return;
  }

  const service = getCentralDriverServiceById(serviceId);

  if (!ensureDriverCanOperate() || !isDriverPendingCentralAssignment(service)) {
    return;
  }

  service.assignmentStatus = "Aceptado";
  if (service.status === "Pendiente") {
    service.status = "Confirmado";
  }
  pendingDriverRejectionServiceId = null;
  driverServices = loadServices();
  registerDriverServiceActivity("ASSIGNMENT_ACCEPTED", service, {
    title: "Asignaci\u00f3n aceptada",
    description: `${driverProfile.name} acept\u00f3 el servicio ${service.serviceId}.`,
  });
  emitDriverServicesUpdatedEvent("accepted", service);
  window.ElaraNotifications.showToast("Asignaci\u00f3n aceptada correctamente.", "success");
  renderDriverServices();
}

async function acceptRealDriverService(service) {
  if (!ensureDriverCanOperate() || !service) {
    return;
  }

  if (service.status !== "asignado" || normalizeDriverCode(service.assignmentStatus) !== "pending_acceptance") {
    window.ElaraNotifications.showToast("Este servicio ya no esta pendiente de aceptacion.", "warning");
    return;
  }

  const serviceUuid = service.centralServiceId || "";

  if (!serviceUuid) {
    window.ElaraNotifications.showToast("No se pudo identificar el servicio real.", "error");
    return;
  }

  if (acceptingRealDriverServiceIds.has(service.id)) {
    return;
  }

  acceptingRealDriverServiceIds.add(service.id);
  renderDriverServices();

  try {
    const { error } = await window.ElaraSupabase.client.rpc("accept_driver_service", {
      p_service_id: serviceUuid,
    });

    if (error) {
      throw error;
    }

    pendingDriverRejectionServiceId = null;
    driverServices = await loadDriverServices({ force: true });
    window.ElaraNotifications.showToast("Servicio aceptado correctamente.", "success");
    renderDriverServices();
  } catch (error) {
    console.error("[ELARA Driver] No se pudo aceptar el servicio real.", {
      message: error?.message || "",
      code: error?.code || "",
      details: error?.details || "",
      serviceId: service.id,
      serviceUuid,
    });
    window.ElaraNotifications.showToast(getAcceptDriverServiceErrorMessage(error), "error");
    renderDriverServices();
  } finally {
    acceptingRealDriverServiceIds.delete(service.id);
    renderDriverServices();
  }
}

function getAcceptDriverServiceErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("active context")) {
    return "Tu sesion de conductor no esta activa. Vuelve a iniciar sesion.";
  }

  if (message.includes("already been accepted")) {
    return "Este servicio ya fue aceptado.";
  }

  if (message.includes("not assigned")) {
    return "Este servicio no esta asignado a tu conductor.";
  }

  if (code === "42501") {
    return "No tienes permiso para aceptar este servicio.";
  }

  if (message.includes("not pending") || message.includes("does not allow acceptance")) {
    return "El estado actual del servicio no permite aceptarlo.";
  }

  if (message.includes("not found")) {
    return "No se encontro el servicio seleccionado.";
  }

  return "No se pudo aceptar el servicio. Intentalo de nuevo.";
}
function requestDriverAssignmentRejection(serviceId) {
  if (!isDriverUsingCentralServices) {
    pendingDriverRejectionServiceId = serviceId;
    renderDriverServices();
    return;
  }

  const service = getCentralDriverServiceById(serviceId);

  if (!ensureDriverCanOperate() || !isDriverPendingCentralAssignment(service)) {
    return;
  }

  pendingDriverRejectionServiceId = serviceId;
  renderDriverServices();
}

function confirmDriverAssignmentRejection(serviceId) {
  if (!isDriverUsingCentralServices) {
    updateServiceStatus(serviceId, "cancelado");
    pendingDriverRejectionServiceId = null;
    window.ElaraNotifications.showToast("Asignacion rechazada en mock.", "warning");
    renderDriverServices();
    return;
  }

  const service = getCentralDriverServiceById(serviceId);

  if (!ensureDriverCanOperate() || !isDriverPendingCentralAssignment(service)) {
    return;
  }

  service.rejectedByDriverId = driverProfile.id;
  service.rejectedAt = new Date().toISOString();
  service.collaboratorId = "";
  service.vehicleId = "";
  service.collaborator = "";
  service.vehicle = "";
  service.plate = "";
  service.assignmentStatus = "";
  pendingDriverRejectionServiceId = null;
  driverServices = loadServices();
  registerDriverServiceActivity("ASSIGNMENT_REJECTED", service, {
    title: "Asignaci\u00f3n rechazada",
    description: `${driverProfile.name} rechaz\u00f3 el servicio ${service.serviceId}.`,
    metadata: {
      rejectedAt: service.rejectedAt,
    },
  });
  emitDriverServicesUpdatedEvent("rejected", service);
  window.ElaraNotifications.showToast("Asignacion rechazada correctamente.", "success");
  renderDriverServices();
}

function getCentralDriverServiceById(serviceId) {
  return (window.ElaraServicesMock?.services || []).find((service) => service.serviceId === serviceId) || null;
}

function emitDriverServicesUpdatedEvent(reason, service) {
  window.dispatchEvent(
    new CustomEvent("elara:services-updated", {
      detail: {
        reason,
        serviceId: service?.serviceId || "",
        customerCode: service?.customerCode || "",
      },
    }),
  );
}

function emitDriverCashUpdatedEvent(reason, service, payment, remittanceId) {
  const detail = {
    reason,
    serviceId: service?.serviceId || "",
    paymentId: payment?.id || "",
    remittanceId: remittanceId || "",
    driverId: driverProfile?.id || "",
  };

  window.dispatchEvent(new CustomEvent("elara:cash-updated", { detail }));
  window.dispatchEvent(new CustomEvent("elara:remittances-updated", { detail }));
}

function registerDriverServiceActivity(eventType, service, eventData = {}) {
  if (!window.ElaraActivityLog || typeof window.ElaraActivityLog.addEvent !== "function" || !driverProfile || !service) {
    return;
  }

  window.ElaraActivityLog.addEvent({
    eventType,
    actorType: "Conductor",
    actorId: driverProfile.id,
    actorName: driverProfile.name,
    entityType: "Servicio",
    entityId: service.serviceId,
    title: eventData.title || "Actividad de servicio",
    description: eventData.description || `${driverProfile.name} actualiz\u00f3 ${service.serviceId}.`,
    metadata: eventData.metadata || {},
  });
}

function getDriverStageActivityLabel(stage) {
  const labelByStage = {
    esperando_pasajero: "esperando pasajero",
    pasajero_a_bordo: "pasajero a bordo",
  };

  return labelByStage[stage] || stage || "nueva etapa";
}

function isDriverPendingCentralAssignment(service) {
  return Boolean(service && driverProfile && isCentralServiceAssignedToCurrentDriver(service) && service.assignmentStatus === "Pendiente");
}

function canStartService(service) {
  const serviceTime = getServiceDateTime(service).getTime();
  const now = Date.now();
  const startWindow = window.ElaraDriverMock.startWindowMinutes * 60 * 1000;

  return serviceTime - now <= startWindow;
}

function getServiceDateTime(service) {
  return new Date(`${service.date}T${service.time}:00`);
}

function getCentralServiceDriverId(service) {
  return service?.collaboratorId || service?.driverId || "";
}

function isCentralServiceAssignedToCurrentDriver(service) {
  return Boolean(driverProfile?.id && getCentralServiceDriverId(service) === driverProfile.id);
}

async function loadDriverServices(options = {}) {
  const driverId = driverProfile?.id || "";

  if (!driverId || !shouldUseRealDriverServices()) {
    return [];
  }

  if (!options.force && driverServicesLoadState.status === "loaded" && driverServicesLoadState.driverId === driverId) {
    return driverServicesLoadState.services.slice();
  }

  if (!options.force && driverServicesLoadState.status === "loading" && driverServicesLoadState.driverId === driverId && driverServicesLoadState.promise) {
    return driverServicesLoadState.promise;
  }

  driverServicesLoadState = {
    driverId,
    status: "loading",
    promise: fetchDriverServiceOverview().then((rows) => rows.map(adaptDriverServiceOverviewRow)),
    services: [],
    error: "",
  };

  try {
    const services = await driverServicesLoadState.promise;
    driverServicesLoadState = {
      driverId,
      status: "loaded",
      promise: null,
      services: services.slice(),
      error: "",
    };
    return services;
  } catch (error) {
    driverServicesLoadState = {
      driverId,
      status: "error",
      promise: null,
      services: [],
      error: error?.message || "driver-services-error",
    };
    throw error;
  }
}

async function fetchDriverServiceOverview() {
  const { data, error } = await window.ElaraSupabase.client
    .rpc("get_driver_service_overview");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function adaptDriverServiceOverviewRow(row) {
  const schedule = getDriverServiceScheduleParts(row?.scheduled_start_at);
  const status = getDriverStatusFromServiceOverview(row);
  const displayStatus = getDriverDisplayStatusFromServiceOverview(row, status);
  const vehicleLabel = [row?.brand, row?.model].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  const customerName = getDriverServiceCustomerName(row);
  const passengerName = getDriverServicePassengerName(row, customerName);

  return {
    id: row?.human_code || row?.service_id || "",
    humanCode: row?.human_code || "",
    centralServiceId: row?.service_id || "",
    assignmentId: row?.assignment_id || "",
    date: schedule.date,
    time: schedule.time,
    type: getDriverServiceTypeLabel(row?.service_type),
    origin: getDriverLocationLabel(row, "origin"),
    destination: getDriverLocationLabel(row, "destination"),
    stops: [],
    passengerName,
    passengerPhone: row?.primary_passenger_phone || "",
    passengerEmail: "",
    customerName,
    passengers: "-",
    luggage: "-",
    notes: "",
    assignedVehicle: vehicleLabel || row?.vehicle_human_code || "Vehiculo pendiente",
    plate: row?.plate_normalized || "",
    status,
    displayStatus,
    estimatedPrice: "Sin importe",
    isNewAssignment: status === "asignado",
    changeLog: [],
    closedAt: row?.closed_at || row?.ended_at || "",
    closing: getDriverOverviewClosing(row),
    isRealDriverService: true,
    operationalStatus: row?.operational_status || "",
    assignmentStatus: row?.assignment_status || "",
    acceptedAt: row?.accepted_at || "",
    endedAt: row?.ended_at || "",
    scheduledAt: row?.scheduled_start_at || "",
    scheduledStartAt: row?.scheduled_start_at || "",
    driverStage: row?.driver_stage || "",
    driverStageUpdatedAt: row?.driver_stage_updated_at || "",
  };
}

function getDriverServiceCustomerName(row) {
  const customerName = [
    row?.customer_display_name,
    row?.customerDisplayName,
    row?.customer_name,
    row?.customerName,
    row?.client_name,
    row?.clientName,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  return customerName || "Cliente sin identificar";
}

function getDriverServicePassengerName(row, customerName) {
  const passengerName = String(row?.primary_passenger_name || row?.primaryPassengerName || "").trim();

  if (passengerName && passengerName !== "Cliente sin identificar") {
    return passengerName;
  }

  return customerName;
}

function getDriverStatusFromServiceOverview(row) {
  const operationalStatus = normalizeDriverCode(row?.operational_status);
  const assignmentStatus = normalizeDriverCode(row?.assignment_status);
  const closureType = normalizeDriverCode(row?.closure_type);
  const driverStage = normalizeDriverCode(row?.driver_stage);

  if (operationalStatus === "in_progress") {
    return getDriverStatusFromRealProgressStage(driverStage) || "en_camino";
  }

  if (assignmentStatus === "pending_acceptance" || assignmentStatus === "reassignment_required") {
    return "asignado";
  }

  if (operationalStatus === "completed" || assignmentStatus === "ended" || closureType === "completed") {
    return "finalizado";
  }

  if (operationalStatus === "no_show" || closureType === "no_show") {
    return "no_show";
  }

  if (operationalStatus === "not_performed" || closureType === "not_performed") {
    return "no_realizado";
  }

  if (operationalStatus === "cancelled" || assignmentStatus === "cancelled" || assignmentStatus === "rejected") {
    return "cancelado";
  }

  if (assignmentStatus === "accepted" || operationalStatus === "confirmed") {
    return "aceptado";
  }

  return "asignado";
}

function getDriverStatusFromRealProgressStage(stage) {
  return DRIVER_REAL_PROGRESS_STAGE_FLOW[normalizeDriverCode(stage)]?.status || "";
}

function getDriverDisplayStatusFromServiceOverview(row, status) {
  const operationalStatus = normalizeDriverCode(row?.operational_status);
  const assignmentStatus = normalizeDriverCode(row?.assignment_status);

  if (operationalStatus === "in_progress") {
    return "En curso";
  }

  if (assignmentStatus === "rejected") {
    return "Rechazado";
  }

  return driverStatusLabels[status] || status || "";
}

function getDriverOverviewClosing(row) {
  const status = getDriverStatusFromServiceOverview(row);

  if (!isClosedServiceStatus(status)) {
    return null;
  }

  return {
    type: row?.closure_type || "",
    rating: "",
    ratingLabel: "",
    reasons: [],
    hadIncident: "",
    finalNotes: "",
    closedAt: row?.closed_at || "",
  };
}

function getDriverServiceScheduleParts(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "--:--" };
  }

  return {
    date: getDriverLocalDateValue(date),
    time: date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
}

function getDriverLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDriverLocationLabel(row, prefix) {
  const label = String(row?.[`${prefix}_label`] || "").trim();
  const address = String(row?.[`${prefix}_address`] || "").trim();
  const city = String(row?.[`${prefix}_city`] || "").trim();

  return [label, address, city].filter(Boolean).join(" - ") || "-";
}

function getDriverServiceTypeLabel(serviceType) {
  const normalizedType = normalizeDriverCode(serviceType);
  const labelByType = {
    airport: "Aeropuerto",
    point_to_point: "Punto a punto",
    full_day: "Full Day",
    pet: "Mascotas",
    long_distance: "Larga distancia",
  };

  return labelByType[normalizedType] || serviceType || "Servicio";
}

function normalizeDriverCode(value) {
  return String(value || "").trim().toLowerCase();
}
function loadServices() {
  if (window.ElaraServices && typeof window.ElaraServices.reconcileExpiredServices === "function") {
    window.ElaraServices.reconcileExpiredServices();
  }

  const centralServices = window.ElaraServicesMock?.services;

  if (Array.isArray(centralServices) && driverProfile?.id) {
    isDriverUsingCentralServices = true;
    return centralServices
      .filter(isCentralServiceAssignedToCurrentDriver)
      .map(adaptCentralServiceForDriver);
  }

  isDriverUsingCentralServices = false;
  return [];
}

function adaptCentralServiceForDriver(service) {
  const customer = getDriverCustomerByCode(service.customerCode);
  const vehicle = getDriverVehicleById(service.vehicleId);
  const customerName = getDriverCentralCustomerName(customer, service);
  const passengerName = service.passengerName || service.passenger || customerName;
  const status = getDriverStatusFromCentralService(service);
  const displayStatus = getDriverDisplayStatusFromCentralService(service);

  return {
    id: service.serviceId,
    centralServiceId: service.serviceId,
    date: formatCentralServiceDateForDriver(service.date),
    time: service.time || "00:00",
    type: service.type || "Servicio",
    origin: service.origin || "-",
    destination: service.destination || "-",
    stops: Array.isArray(service.stops) ? service.stops.slice() : [],
    passengerName,
    passengerPhone: service.passengerPhone || customer?.phone || "",
    passengerEmail: service.passengerEmail || customer?.email || "",
    customerName,
    passengers: service.passengers || service.passengerCount || "1",
    luggage: service.luggage || service.baggage || "0",
    notes: service.notes || service.observations || "",
    assignedVehicle: vehicle ? `${vehicle.brand} ${vehicle.model}` : service.vehicle || "Vehiculo pendiente",
    plate: vehicle?.plate || service.plate || "",
    status,
    displayStatus,
    estimatedPrice: service.price || service.estimatedPrice || "Sin importe",
    isNewAssignment: status === "asignado",
    changeLog: Array.isArray(service.changeLog) ? service.changeLog.slice() : [],
    closing: getDriverCentralClosing(service),
  };
}

function getDriverStatusFromCentralService(service) {
  if (isDriverClosedCentralServiceStatus(service.status)) {
    return getDriverClosedStatusFromCentralService(service.status);
  }

  if (service.status === "En curso") {
    return DRIVER_CENTRAL_STAGE_SEQUENCE.includes(service.driverStage) ? service.driverStage : "en_camino";
  }

  return service.assignmentStatus === "Aceptado" ? "aceptado" : "asignado";
}

function getDriverDisplayStatusFromCentralService(service) {
  const getDisplayStatus = window.ElaraServices?.getServiceDisplayStatus;

  return typeof getDisplayStatus === "function" ? getDisplayStatus(service) : service?.status || "";
}

function isDriverClosedCentralServiceStatus(status) {
  return DRIVER_CLOSED_CENTRAL_SERVICE_STATUSES.some((closedStatus) => normalizeDriverText(closedStatus) === normalizeDriverText(status));
}

function getDriverClosedStatusFromCentralService(status) {
  const normalizedStatus = normalizeDriverText(status);

  if (normalizedStatus === "finalizado") {
    return "finalizado";
  }

  if (normalizedStatus === "no show" || normalizedStatus === "no-show") {
    return "no_show";
  }

  if (normalizedStatus === "no realizado" || normalizedStatus === "no-realizado") {
    return "no_realizado";
  }

  return "cancelado";
}

function getDriverCentralClosing(service) {
  if (!isDriverClosedCentralServiceStatus(service.status)) {
    return null;
  }

  if (service.closing) {
    return {
      ...service.closing,
      reasons: Array.isArray(service.closing.reasons) ? [...service.closing.reasons] : [],
      closedAt: service.closedAt || service.closing.closedAt || "",
    };
  }

  const reasons = [service.closureReasonCode === "OTHER" && service.closureReasonDetails ? `Otro motivo: ${service.closureReasonDetails}` : service.closureReason]
    .filter(Boolean);

  return {
    rating: "",
    ratingLabel: "",
    reasons,
    hadIncident: service.closureReason ? "Si" : "No",
    finalNotes: service.closureReasonDetails || service.closureReason || "",
    closedAt: service.closedAt || "",
  };
}

function getDriverCustomerByCode(customerCode) {
  if (!customerCode) {
    return null;
  }

  return (window.ElaraCustomersMock?.customers || []).find((customer) => customer.code === customerCode) || null;
}

function getDriverCentralCustomerName(customer, service) {
  if (!customer) {
    return service.client || "Cliente sin identificar";
  }

  if (customer.type === "Empresa") {
    return customer.tradeName || customer.company || customer.name || service.client || customer.code;
  }

  return customer.name || service.client || customer.code;
}

function formatCentralServiceDateForDriver(dateValue) {
  const value = String(dateValue || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [day, month, year] = value.split("/");

  if (!day || !month || !year) {
    return value;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function loadProfile() {
  const currentUser = getDriverAuthenticatedUser();

  const collaborator = getDriverCollaboratorForUser(currentUser);

  return collaborator ? buildDriverProfileFromCollaborator(collaborator) : null;
}

function refreshDriverProfile() {
  driverProfile = loadProfile();
  isDriverProfilePhoneEditing = false;
  driverServices = driverProfile ? loadServices() : [];

  if (!driverServices.some((service) => service.id === activeServiceId)) {
    const activeService = getActiveService();
    activeServiceId = activeService ? activeService.id : null;
  }

  return Boolean(driverProfile);
}

function getDriverAuthenticatedUser() {
  return window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
}

function resetDriverProfileLoadState() {
  driverProfileLoadState = {
    userKey: "",
    status: "idle",
    promise: null,
    profile: null,
    error: "",
  };
  driverProfileRenderRequestId += 1;
}

function getDriverProfileCacheKey(user) {
  return [user?.supabaseUserId, user?.appSessionId, user?.id, user?.driverId].map((value) => String(value || "").trim()).filter(Boolean).join("|");
}

async function loadDriverRealProfile() {
  const user = getDriverAuthenticatedUser();
  const userKey = getDriverProfileCacheKey(user);

  if (!userKey) {
    throw new Error("Missing authenticated user for driver profile.");
  }

  if (driverProfileLoadState.userKey && driverProfileLoadState.userKey !== userKey) {
    resetDriverProfileLoadState();
  }

  if (driverProfileLoadState.userKey === userKey && driverProfileLoadState.status === "loaded" && driverProfileLoadState.profile) {
    return driverProfileLoadState.profile;
  }

  if (driverProfileLoadState.userKey === userKey && driverProfileLoadState.promise) {
    return driverProfileLoadState.promise;
  }

  driverProfileLoadState.userKey = userKey;
  driverProfileLoadState.status = "loading";
  driverProfileLoadState.error = "";
  driverProfileLoadState.promise = fetchDriverRealProfile(user)
    .then((profile) => {
      if (driverProfileLoadState.userKey === userKey) {
        driverProfileLoadState.status = "loaded";
        driverProfileLoadState.profile = profile;
        driverProfileLoadState.error = "";
      }

      return profile;
    })
    .catch((error) => {
      if (driverProfileLoadState.userKey === userKey) {
        driverProfileLoadState.status = "error";
        driverProfileLoadState.profile = null;
        driverProfileLoadState.error = DRIVER_PROFILE_ERROR_MESSAGE;
      }

      throw error;
    })
    .finally(() => {
      if (driverProfileLoadState.userKey === userKey) {
        driverProfileLoadState.promise = null;
      }
    });

  return driverProfileLoadState.promise;
}

async function fetchDriverRealProfile(user) {
  const identity = await resolveDriverProfileIdentity(user);

  if (!identity?.driverId) {
    throw new Error("Missing driver identity.");
  }

  const accountEmail = await fetchDriverProfileAccountEmail();
  const activeVehicle = await fetchDriverActiveVehicle(identity.driverId);

  return buildDriverProfileFromIdentity(identity, accountEmail, user, activeVehicle);
}

async function resolveDriverProfileIdentity(user) {
  if (user?.driverIdentityStatus === "resolved" && user?.driverIdentity?.driverId) {
    return user.driverIdentity;
  }

  return window.ElaraAuth.getCurrentDriverIdentity();
}

async function fetchDriverProfileAccountEmail() {
  const client = window.ElaraSupabase?.client;

  if (!client?.auth || typeof client.auth.getUser !== "function") {
    throw new Error("Supabase Auth client is not available.");
  }

  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  const email = String(data?.user?.email || "").trim();

  if (!email) {
    throw new Error("Authenticated user email is not available.");
  }

  return email;
}

async function fetchDriverActiveVehicle(driverId) {
  const client = window.ElaraSupabase?.client;

  if (!client) {
    throw new Error("Supabase client is not available.");
  }

  // Active assignments are unique by constraint; the order keeps inconsistent data deterministic.
  const { data: assignments, error } = await client
    .from("driver_vehicle_assignments")
    .select("vehicle_id, started_at")
    .eq("driver_id", driverId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const assignment = Array.isArray(assignments) ? assignments[0] : assignments;

  if (!assignment?.vehicle_id) {
    return null;
  }

  const { data: vehicle, error: vehicleError } = await client
    .from("vehicles")
    .select("id, human_code, plate_normalized, brand, model")
    .eq("id", assignment.vehicle_id)
    .maybeSingle();

  if (vehicleError) {
    throw vehicleError;
  }

  return vehicle?.id ? normalizeDriverActiveVehicle(vehicle) : null;
}

function normalizeDriverActiveVehicle(vehicle) {
  return {
    vehicleId: vehicle?.id || "",
    vehicleHumanCode: vehicle?.human_code || "",
    plateNormalized: vehicle?.plate_normalized || "",
    brand: vehicle?.brand || "",
    model: vehicle?.model || "",
  };
}

function getDriverProfileVehicleLabel(vehicle) {
  if (!vehicle) {
    return "";
  }

  const vehicleModel = [vehicle.brand, vehicle.model].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  return [vehicle.vehicleHumanCode, vehicleModel, vehicle.plateNormalized].filter(Boolean).join(" - ");
}

function buildDriverProfileFromIdentity(identity, accountEmail, user, activeVehicle) {
  const administrativeStatus = getDriverIdentityAdministrativeStatusLabel(identity?.administrativeStatus);
  const availabilityPreference = getDriverIdentityAvailabilityLabel(identity?.availabilityPreference);
  const driverType = getDriverIdentityTypeLabel(identity?.driverType);
  const assignedVehicle = getDriverProfileVehicleLabel(activeVehicle);

  return {
    isRealDriverProfile: true,
    id: identity?.driverId || user?.driverId || "",
    driverId: identity?.driverId || user?.driverId || "",
    humanCode: identity?.humanCode || "",
    name: identity?.name || user?.name || "Conductor ELARA",
    email: accountEmail,
    phone: identity?.phone || "",
    rawDriverType: identity?.driverType || "",
    driverType,
    role: driverType,
    rawAdministrativeStatus: identity?.administrativeStatus || "",
    administrativeStatus,
    rawAvailabilityPreference: identity?.availabilityPreference || "",
    availability: availabilityPreference,
    availabilityPreference,
    collaboratorStatus: administrativeStatus,
    vehicleId: activeVehicle?.vehicleId || "",
    vehicleHumanCode: activeVehicle?.vehicleHumanCode || "",
    plateNormalized: activeVehicle?.plateNormalized || "",
    vehicleBrand: activeVehicle?.brand || "",
    vehicleModel: activeVehicle?.model || "",
    assignedVehicle: assignedVehicle || "-",
    vehicleColor: "-",
    plate: activeVehicle?.plateNormalized || "-",
  };
}

function getDriverProfileErrorDetails(error) {
  return {
    message: error?.message || String(error || DRIVER_PROFILE_ERROR_MESSAGE),
    name: error?.name || "Error",
  };
}

function getDriverCollaboratorForUser(user) {
  const accessMessage = getDriverUserAccessMessage(user);

  if (accessMessage) {
    driverAccessMessage = accessMessage;
    return null;
  }

  const driverId = String(user?.driverId || "").trim();

  if (driverId) {
    const collaborator = getDriverCollaboratorById(driverId);

    if (!collaborator && isRealDriverAuthUser(user) && user.driverIdentityStatus === "resolved") {
      driverAccessMessage = "";
      return buildDriverCollaboratorFromIdentity(user.driverIdentity, user);
    }

    if (!collaborator) {
      driverAccessMessage = DRIVER_LINK_NOT_FOUND_MESSAGE;
      console.warn(`[ELARA] No se encontr\u00f3 el conductor vinculado por driverId real: ${driverId}`);
      return null;
    }

    driverAccessMessage = "";
    return collaborator;
  }

  if (isRealDriverAuthUser(user)) {
    driverAccessMessage = getRealDriverIdentityAccessMessage(user);
    return null;
  }

  driverAccessMessage = DRIVER_MISSING_LINK_MESSAGE;
  return null;
}

function getDriverUserAccessMessage(user) {
  if (!user) {
    return DRIVER_NO_PORTAL_ACCESS_MESSAGE;
  }

  if (!isDriverAuthUserActive(user)) {
    return DRIVER_INACTIVE_USER_MESSAGE;
  }

  if (getDriverAuthUserActiveContext(user) !== "conductor" || !driverAuthUserHasRole(user, "conductor")) {
    return DRIVER_NO_PORTAL_ACCESS_MESSAGE;
  }

  return "";
}

function isDriverAuthUserActive(user) {
  return String(user?.status || "").trim().toLowerCase() === "activo";
}

function getDriverAuthUserActiveContext(user) {
  if (window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function") {
    return String(window.ElaraAuth.getActiveContext() || "").trim().toLowerCase();
  }

  return String(user?.activeContext || user?.role || "").trim().toLowerCase();
}

function driverAuthUserHasRole(user, role) {
  if (window.ElaraAuth && typeof window.ElaraAuth.hasRole === "function") {
    return window.ElaraAuth.hasRole(role);
  }

  const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
  return roles.map((value) => String(value || "").trim().toLowerCase()).includes(role);
}

function isRealDriverAuthUser(user) {
  return Boolean(user?.supabaseUserId || user?.appSessionId || user?.driverIdentityStatus);
}

function getRealDriverIdentityAccessMessage(user) {
  if (user?.driverIdentityStatus === "pending") {
    return DRIVER_IDENTITY_LOADING_MESSAGE;
  }

  if (user?.driverIdentityStatus === "driver-not-visible") {
    return DRIVER_LINK_NOT_FOUND_MESSAGE;
  }

  return DRIVER_MISSING_LINK_MESSAGE;
}

function buildDriverCollaboratorFromIdentity(identity, user) {
  return {
    id: identity?.driverId || user?.driverId || "",
    name: identity?.name || user?.name || "Conductor ELARA",
    driverType: getDriverIdentityTypeLabel(identity?.driverType),
    countryCode: "",
    phone: identity?.phone || "",
    email: identity?.email || user?.email || "",
    baseCity: "",
    licenseExpiration: "",
    administrativeStatus: getDriverIdentityAdministrativeStatusLabel(identity?.administrativeStatus),
    operationalStatus: getDriverIdentityAvailabilityLabel(identity?.availabilityPreference),
    availability: getDriverIdentityAvailabilityLabel(identity?.availabilityPreference),
    availabilityPreference: getDriverIdentityAvailabilityLabel(identity?.availabilityPreference),
    vehicleId: "",
    nextService: null,
    observations: identity?.humanCode ? `Perfil real ${identity.humanCode}. Datos operativos temporales en mock.` : "Perfil real. Datos operativos temporales en mock.",
  };
}

function getDriverIdentityTypeLabel(driverType) {
  return DRIVER_PROFILE_DRIVER_TYPE_LABELS[driverType] || "Conductor";
}

function getDriverIdentityAdministrativeStatusLabel(status) {
  return DRIVER_PROFILE_ADMINISTRATIVE_STATUS_LABELS[status] || status || "No disponible";
}

function getDriverIdentityAvailabilityLabel(availabilityPreference) {
  return DRIVER_PROFILE_AVAILABILITY_LABELS[availabilityPreference] || "No disponible";
}

function getDriverCollaboratorById(collaboratorId) {
  if (!collaboratorId) {
    return null;
  }

  return (window.ElaraCollaboratorsMock?.collaborators || []).find((collaborator) => collaborator.id === collaboratorId) || null;
}

function buildDriverProfileFromCollaborator(collaborator) {
  const vehicle = getDriverVehicleById(collaborator.vehicleId);

  return {
    id: collaborator.id,
    driverId: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    phone: collaborator.phone,
    driverType: collaborator.driverType || "Colaborador",
    role: collaborator.driverType || "Colaborador",
    administrativeStatus: collaborator.administrativeStatus,
    operationalStatus: collaborator.operationalStatus,
    availability: collaborator.availability,
    availabilityPreference: collaborator.availabilityPreference,
    collaboratorStatus: collaborator.operationalStatus || collaborator.availability || "No disponible",
    vehicleId: collaborator.vehicleId || "",
    assignedVehicle: vehicle ? `${vehicle.brand} ${vehicle.model}` : "Sin vehiculo asignado",
    vehicleColor: vehicle ? vehicle.color : "-",
    plate: vehicle ? vehicle.plate : "-",
  };
}

function getDriverVehicleById(vehicleId) {
  if (!vehicleId) {
    return null;
  }

  return (window.ElaraVehiclesMock?.vehicles || []).find((vehicle) => vehicle.id === vehicleId) || null;
}


function normalizeDriverText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function saveServices() {
  return;
}

// Utilidad de demo para QA: ejecutar window.resetDriverDemo() en consola.
function resetDriverDemo() {
  clearDriverLegacyStorage();
  driverProfile = loadProfile();
  driverServices = driverProfile ? loadServices() : [];
  activeServiceId = getActiveService() ? getActiveService().id : null;
  isDriverActiveServiceVisible = false;
  selectedServiceId = null;
  window.ElaraNotifications.showToast("Demo del chofer reiniciado.", "info");

  if (getElement("mis-servicios") && !getElement("mis-servicios").hidden) {
    showDriverServices();
  }

  if (getElement("mi-perfil") && !getElement("mi-perfil").hidden) {
    void showDriverProfile();
  }

  if (getElement("historial") && !getElement("historial").hidden) {
    showDriverHistory();
  }
}

function clearDriverLegacyStorage() {
  try {
    localStorage.removeItem("elara.mock.driverState");
    localStorage.removeItem("elara.mock.driverProfile");
  } catch (error) {
    console.warn("[ELARA] No se pudieron limpiar las claves legacy del Portal conductor.", error);
  }
}

function setDriverHeader(eyebrow, title, summary) {
  const eyebrowElement = getElement("page-eyebrow");

  if (eyebrowElement) {
    eyebrowElement.textContent = eyebrow;
    eyebrowElement.hidden = !eyebrow;
  }

  setText("page-title", title);
  setText("page-summary", summary);

  const primaryAction = getElement("primary-action");

  if (primaryAction) {
    primaryAction.hidden = true;
    primaryAction.removeAttribute("data-modal-open");
  }
}

function setDriverActiveMode(isActive) {
  document.body.classList.toggle("driver-active-mode", Boolean(isActive));
}

function formatDriverPhoneForDisplay(phone) {
  const value = String(phone || "").trim().replace(/\s+/g, " ");

  if (!value) {
    return "";
  }

  const digits = value.replace(/\D/g, "");
  const hasLeadingPlus = value.startsWith("+");

  if (digits.length === 11 && digits.startsWith("34")) {
    return `+34 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
  }

  if (!hasLeadingPlus && digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }

  return value;
}

function formatPhoneHref(phone) {
  const compactPhone = String(phone || "").replace(/[^\d+]/g, "");
  return compactPhone ? `tel:${compactPhone}` : "#";
}

function copyPassengerPhone(phone) {
  if (!phone) {
    window.ElaraNotifications.showToast("Tel\u00e9fono no informado.", "warning");
    return;
  }

  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    window.ElaraNotifications.showToast("Copia manual no disponible en este navegador.", "warning");
    return;
  }

  navigator.clipboard
    .writeText(phone)
    .then(() => window.ElaraNotifications.showToast("Tel\u00e9fono copiado.", "success"))
    .catch(() => window.ElaraNotifications.showToast("No se pudo copiar el tel\u00e9fono.", "error"));
}

function renderStatusPill(status, displayStatus = "") {
  const visibleStatus = displayStatus || driverStatusLabels[status] || status;

  return `<span class="status-pill ${getDriverStatusClass(status, visibleStatus)}">${escapeHtml(visibleStatus)}</span>`;
}

function getDriverStatusClass(status, visibleStatus) {
  const displayStatusClasses = {
    "Por asignar": "status--warning",
    "Por aceptar": "status--warning",
    Confirmado: "status--success",
    "En curso": "status--info",
    Cancelado: "status--danger",
    "No realizado": "status--neutral",
    Finalizado: "status--neutral",
    "No show": "status--danger",
  };

  return displayStatusClasses[visibleStatus] || driverStatusClasses[status] || "status--neutral";
}

function renderMeta(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderModalField(label, value) {
  return `
    <div class="modal__field">
      <dt class="modal__field-label">${escapeHtml(label)}</dt>
      <dd class="modal__field-value">${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderDetailItinerary(service) {
  const intermediateStops = getIntermediateStops(service);
  const stopsMarkup = intermediateStops.length
    ? `
      <div class="driver-detail-route__point driver-detail-route__point--stop">
        ${renderDriverIcon("stop")}
        <span>${escapeHtml(intermediateStops.length === 1 ? "Parada" : "Paradas")}</span>
        <ol>
          ${intermediateStops.map((stop) => `<li>${escapeHtml(stop)}</li>`).join("")}
        </ol>
      </div>
    `
    : "";

  return `
    <div class="driver-detail-route">
      <div class="driver-detail-route__point driver-detail-route__point--origin">
        ${renderDriverIcon("origin")}
        <span>Origen</span>
        <strong>${escapeHtml(service.origin)}</strong>
      </div>
      ${stopsMarkup}
      <div class="driver-detail-route__point driver-detail-route__point--destination">
        ${renderDriverIcon("destination")}
        <span>Destino</span>
        <strong>${escapeHtml(service.destination)}</strong>
      </div>
    </div>
  `;
}

function renderChangeLog(service) {
  if (!service.changeLog.length) {
    return "";
  }

  return `
    <section class="driver-change-log" aria-label="Cambios operativos pendientes">
      <strong>Cambios pendientes de revision</strong>
      ${service.changeLog
        .map(
          (change) => `
            <article>
              <span>${escapeHtml(change.createdAt)} - ${escapeHtml(change.status)}</span>
              <p>${escapeHtml(change.destination)} - ${escapeHtml(change.reason)}</p>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function openModal(modalId) {
  const modal = getElement(modalId);

  if (modal) {
    modal.hidden = false;
  }
}

function closeModal(modalId) {
  const modal = typeof modalId === "string" ? getElement(modalId) : modalId;

  if (modal) {
    modal.hidden = true;
  }
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatShortDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getElement(id) {
  return document.getElementById(id);
}

function getInputValue(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}

function setInputValue(id, value) {
  const element = getElement(id);

  if (element) {
    element.value = value || "";
  }
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
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

window.ElaraDriver = {
  initDriver,
  showDriverFinances,
  showDriverExpenses,
  showDriverHistory,
  showDriverProfile,
  showDriverSettlements,
  showDriverServices,
};

window.resetDriverDemo = resetDriverDemo;
