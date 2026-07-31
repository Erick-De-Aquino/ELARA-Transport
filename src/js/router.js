/*
  Proyecto Atlas / ELARA Transport
  Archivo: router.js
  Responsabilidad: navegacion interna entre pantallas.
*/

"use strict";

// =========================
// Configuracion de rutas
// =========================

const routes = {
  dashboard: {
    viewId: "dashboard",
    headerVariant: "admin",
    onShow: () => window.ElaraDashboard.showDashboard(),
  },
  servicios: {
    viewId: "servicios",
    headerVariant: "admin",
    onShow: () => window.ElaraServices.showServices(),
  },
  caja: {
    viewId: "caja",
    headerVariant: "admin",
    onShow: () => window.ElaraCash.showCash(),
  },
  "cuentas-por-cobrar": {
    viewId: "cuentas-por-cobrar",
    headerVariant: "admin",
    onShow: () => window.ElaraReceivables.showReceivables(),
  },
  gastos: {
    viewId: "gastos",
    headerVariant: "admin",
    onShow: () => window.ElaraExpenses.showExpenses(),
  },
  liquidaciones: {
    viewId: "liquidaciones",
    headerVariant: "admin",
    onShow: () => window.ElaraSettlements.showSettlements(),
  },
  colaboradores: {
    viewId: "colaboradores",
    headerVariant: "admin",
    onShow: () => window.ElaraCollaborators.showCollaborators(),
  },
  clientes: {
    viewId: "clientes",
    headerVariant: "admin",
    onShow: () => window.ElaraCustomers.showCustomers(),
  },
  vehiculos: {
    viewId: "vehiculos",
    headerVariant: "admin",
    onShow: () => window.ElaraVehicles.showVehicles(),
  },
  reportes: {
    viewId: "reportes",
    headerVariant: "admin",
    onShow: () => window.ElaraReports.showReports(),
  },
  usuarios: {
    viewId: "usuarios",
    headerVariant: "admin",
    onShow: () => window.ElaraUsers.showUsers(),
  },
  configuracion: {
    viewId: "configuracion",
    headerVariant: "admin",
    onShow: () => window.ElaraSettings.showSettings(),
  },
  "mis-servicios": {
    viewId: "mis-servicios",
    headerVariant: "driver",
    onShow: () => window.ElaraDriver.showDriverServices(),
  },
  historial: {
    viewId: "historial",
    headerVariant: "driver",
    onShow: () => window.ElaraDriver.showDriverHistory(),
  },
  "mis-finanzas": {
    viewId: "mis-finanzas",
    headerVariant: "driver",
    onShow: () => window.ElaraDriver.showDriverFinances(),
  },
  "mis-gastos": {
    viewId: "mis-gastos",
    headerVariant: "driver",
    onShow: () => window.ElaraDriver.showDriverExpenses(),
  },
  "mis-liquidaciones": {
    viewId: "mis-liquidaciones",
    headerVariant: "driver",
    onShow: () => window.ElaraDriver.showDriverSettlements(),
  },
  "mis-reservas": {
    viewId: "mis-reservas",
    headerVariant: "driver",
    onShow: () =>
      showPlaceholder("Portal cliente", "Mis reservas", "Este m\u00f3dulo estar\u00e1 disponible para clientes en una fase posterior."),
  },
  "mi-perfil": {
    viewId: "mi-perfil",
    headerVariant: "driver",
    onShow: showProfileRoute,
  },
};

const ROUTER_ROUTE_ALIASES = {
  conductores: "colaboradores",
  "historial-conductor": "historial",
  "perfil-conductor": "mi-perfil",
};

let isRouterInitialized = false;
let shouldSuppressAccessDeniedToast = false;
const HEADER_VARIANT_CLASSES = ["header--admin"];

// =========================
// Eventos del router
// =========================

function initRouter(options = {}) {
  if (!isRouterInitialized) {
    window.addEventListener("hashchange", showCurrentRoute);
    document.addEventListener("click", (event) => {
      const routeButton = event.target.closest("[data-route-target]");

      if (routeButton) {
        navigateTo(routeButton.dataset.routeTarget);
      }
    });
    isRouterInitialized = true;
  }

  showCurrentRoute({ silent: Boolean(options.silent) });
}

// =========================
// Cambio de vista
// =========================

function showCurrentRoute(options = {}) {
  const previousSuppressAccessDeniedToast = shouldSuppressAccessDeniedToast;

  if (options.silent) {
    shouldSuppressAccessDeniedToast = true;
  }

  try {
    const requestedRouteName = getRouteFromHash();
    const routeName = resolveRouteName(requestedRouteName);

    if (!routeName || !routes[routeName]) {
      hideInactiveViews("");
      updateActiveLink("");
      setHeaderVariant("");
      resetPrimaryAction();
      return;
    }

    const route = routes[routeName];

    if (routeName !== requestedRouteName) {
      replaceHash(routeName);
    }

    hideInactiveViews(route.viewId);
    updateActiveLink(routeName);
    applyHeaderVariant(route);
    resetPrimaryAction();
    route.onShow();
    focusView(route.viewId);
  } finally {
    shouldSuppressAccessDeniedToast = previousSuppressAccessDeniedToast;
  }
}

// =========================
// Utilidades internas
// =========================

function getRouteFromHash() {
  return window.location.hash.replace(/^#\/?/, "") || "dashboard";
}

function resolveRouteName(requestedRouteName) {
  const currentUser = window.ElaraAuth.getCurrentUser();

  if (!currentUser || !isCurrentUserActive()) {
    return "";
  }

  const context = getRouterActiveContext(currentUser);
  const fallbackRoute = getInternalRouteName(window.ElaraPermissions.getInitialRoute(context));
  const internalRequestedRoute = getInternalRouteName(requestedRouteName);

  if (!context || !fallbackRoute || !routes[fallbackRoute]) {
    return "";
  }

  if (!routes[internalRequestedRoute]) {
    return fallbackRoute;
  }

  if (!window.ElaraPermissions.canAccessRoute(context, internalRequestedRoute)) {
    notifyRouteAccessDenied(internalRequestedRoute, fallbackRoute);
    return fallbackRoute;
  }

  return internalRequestedRoute;
}

function hideInactiveViews(activeViewId) {
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.id !== activeViewId;
  });
}

function updateActiveLink(activeRoute) {
  document.querySelectorAll("[data-route]").forEach((link) => {
    const isActive = link.dataset.route === activeRoute;

    link.classList.toggle("sidebar__link--active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function renderNavigationForCurrentContext() {
  const context = getRouterActiveContext(window.ElaraAuth.getCurrentUser());

  renderSidebarForContext(context);
}

function refreshNavigationForActiveContext() {
  renderNavigationForCurrentContext();
  closeRouterModals();

  const context = getRouterActiveContext(window.ElaraAuth.getCurrentUser());
  const initialRoute = getInternalRouteName(window.ElaraPermissions.getInitialRoute(context));

  if (!context || !initialRoute || !routes[initialRoute]) {
    hideInactiveViews("");
    updateActiveLink("");
    setHeaderVariant("");
    resetPrimaryAction();
    return;
  }

  replaceHash(initialRoute);
  showCurrentRoute({ silent: true });
}

function renderSidebarForContext(context) {
  const nav = document.getElementById("sidebar-nav");

  if (!nav) {
    return;
  }

  nav.innerHTML = window.ElaraPermissions
    .getNavigationForContext(context)
    .map(
      (item) => `
        <a class="sidebar__link" href="#${item.route}" data-route="${item.route}">${item.label}</a>
      `,
    )
    .join("");
}

function renderSidebarForRole(role) {
  renderSidebarForContext(role);
}

function navigateTo(routeName) {
  if (routeName) {
    window.location.hash = getInternalRouteName(routeName);
  }
}

function navigateToInitialRoute() {
  const currentUser = window.ElaraAuth.getCurrentUser();

  if (!currentUser || !isCurrentUserActive()) {
    return;
  }

  const context = getRouterActiveContext(currentUser);

  if (!context) {
    return;
  }

  navigateTo(window.ElaraPermissions.getInitialRoute(context));
}

function replaceHash(routeName) {
  const nextUrl = `${window.location.pathname}${window.location.search}#${routeName}`;
  window.history.replaceState(null, "", nextUrl);
}

function focusView(viewId) {
  const view = document.getElementById(viewId);

  if (view) {
    view.focus({ preventScroll: true });
  }
}

function resetPrimaryAction() {
  const primaryAction = document.getElementById("primary-action");
  const servicesHistoryAction = document.getElementById("services-history-action");
  const reportsHistoryAction = document.getElementById("reports-history-action");

  if (primaryAction) {
    primaryAction.textContent = "";
    primaryAction.hidden = false;
    primaryAction.disabled = false;
    primaryAction.className = "button button--primary";
    primaryAction.removeAttribute("aria-disabled");
    primaryAction.removeAttribute("aria-expanded");
    primaryAction.removeAttribute("data-modal-open");
    primaryAction.removeAttribute("data-modal-target");
    primaryAction.removeAttribute("data-receivables-action");
  }

  if (servicesHistoryAction) {
    servicesHistoryAction.hidden = true;
  }

  if (reportsHistoryAction) {
    reportsHistoryAction.hidden = true;
  }
}

function applyHeaderVariant(route = {}) {
  setHeaderVariant(route.headerVariant || "");
}

function setHeaderVariant(variant = "") {
  const header = document.querySelector(".header");

  if (!header) {
    return;
  }

  header.classList.remove(...HEADER_VARIANT_CLASSES);

  if (variant === "admin") {
    header.classList.add("header--admin");
  }
}

function showPlaceholder(eyebrow, title, summary) {
  const primaryAction = document.getElementById("primary-action");
  const eyebrowElement = document.getElementById("page-eyebrow");

  if (eyebrowElement) {
    eyebrowElement.textContent = eyebrow;
    eyebrowElement.hidden = !eyebrow;
  }

  setText("page-title", title);
  setText("page-summary", summary);

  if (primaryAction) {
    primaryAction.hidden = true;
    primaryAction.removeAttribute("data-modal-open");
  }
}

function showProfileRoute() {
  const currentUser = window.ElaraAuth.getCurrentUser();
  const context = getRouterActiveContext(currentUser);
  const driverProfilePanel = document.getElementById("driver-profile-panel");
  const genericProfilePlaceholder = document.getElementById("generic-profile-placeholder");

  if (context === "conductor") {
    window.ElaraDriver.showDriverProfile();
    return;
  }

  if (driverProfilePanel) {
    driverProfilePanel.hidden = true;
  }

  if (genericProfilePlaceholder) {
    genericProfilePlaceholder.hidden = false;
  }

  showPlaceholder("Cuenta", "Mi perfil", "Vista temporal para datos b\u00e1sicos de la cuenta mock activa.");
}

function getRouterActiveContext(currentUser) {
  const authContext =
    window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function"
      ? window.ElaraAuth.getActiveContext()
      : "";
  const context = authContext || currentUser?.activeContext || currentUser?.role || "";

  return window.ElaraPermissions.getContextFromSubject(context);
}

function getInternalRouteName(routeName) {
  const normalizedRoute = String(routeName || "").trim();

  return ROUTER_ROUTE_ALIASES[normalizedRoute] || normalizedRoute;
}

function isCurrentUserActive() {
  if (window.ElaraAuth && typeof window.ElaraAuth.isUserActive === "function") {
    return window.ElaraAuth.isUserActive();
  }

  return Boolean(window.ElaraAuth.getCurrentUser());
}

function notifyRouteAccessDenied(requestedRouteName, fallbackRouteName) {
  if (!requestedRouteName || requestedRouteName === fallbackRouteName) {
    return;
  }

  if (shouldSuppressAccessDeniedToast) {
    return;
  }

  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast("No tienes acceso a esta secci\u00f3n.", "warning");
  } else if (typeof window.showToast === "function") {
    window.showToast("No tienes acceso a esta secci\u00f3n.", "warning");
  }
}

function closeRouterModals() {
  document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((modal) => {
    modal.hidden = true;
  });
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

// =========================
// API publica del modulo
// =========================

window.ElaraRouter = {
  initRouter,
  navigateTo,
  navigateToInitialRoute,
  refreshNavigationForActiveContext,
  renderNavigationForCurrentContext,
  renderSidebarForRole,
  renderSidebarForContext,
  setHeaderVariant,
  showCurrentRoute,
};
