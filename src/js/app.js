/*
  Proyecto Atlas / ELARA Transport
  Archivo: app.js
  Responsabilidad: punto de entrada de la aplicacion.
*/

// =========================
// Arranque de la aplicacion
// =========================

document.addEventListener("DOMContentLoaded", async () => {
  window.ElaraDashboard.initDashboard();
  window.ElaraServices.initServices();
  window.ElaraCollaborators.initCollaborators();
  window.ElaraCustomers.initCustomers();
  window.ElaraVehicles.initVehicles();
  window.ElaraReports.initReports();
  window.ElaraUsers.initUsers();
  window.ElaraSettings.initSettings();
  window.ElaraExpenses.initExpenses();
  window.ElaraSettlements.initSettlements();
  window.ElaraDriver.initDriver();
  initMobileNavigation();
  initCompactFilters();
  await window.ElaraAuth.initAuth({
    onLogin: startAuthenticatedApp,
    onLogout: stopAuthenticatedApp,
  });
});

// =========================
// Sesion de aplicacion
// =========================

function startAuthenticatedApp() {
  window.ElaraRouter.renderNavigationForCurrentContext();
  window.ElaraRouter.initRouter({ silent: true });
}

function stopAuthenticatedApp() {
  const nav = document.getElementById("sidebar-nav");

  if (nav) {
    nav.innerHTML = "";
  }

  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = true;
  });

  window.ElaraRouter?.setHeaderVariant?.("");
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

// =========================
// Navegacion movil
// =========================

function initMobileNavigation() {
  const menuButton = document.querySelector(".mobile-menu-toggle");
  const sidebar = document.getElementById("main-sidebar");
  const overlay = document.querySelector("[data-mobile-menu-overlay]");
  const closeButton = document.querySelector(".mobile-menu-close");

  if (!menuButton || !sidebar || !overlay) {
    return;
  }

  const openMenu = () => {
    sidebar.classList.add("sidebar--open");
    overlay.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-nav-open");
  };

  const closeMenu = () => {
    sidebar.classList.remove("sidebar--open");
    overlay.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-nav-open");
  };

  menuButton.addEventListener("click", () => {
    if (sidebar.classList.contains("sidebar--open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  overlay.addEventListener("click", closeMenu);

  if (closeButton) {
    closeButton.addEventListener("click", closeMenu);
  }

  sidebar.addEventListener("click", (event) => {
    if (event.target.closest(".sidebar__link")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

// =========================
// Filtros compactos
// =========================

function initCompactFilters() {
  const filters = document.querySelectorAll(".customer-filter");

  if (!filters.length) {
    return;
  }

  const closeOtherFilters = (activeFilter) => {
    filters.forEach((filter) => {
      if (filter !== activeFilter) {
        filter.open = false;
      }
    });
  };

  filters.forEach((filter) => {
    filter.addEventListener("toggle", () => {
      if (filter.open) {
        closeOtherFilters(filter);
      }
    });
  });

  document.addEventListener("click", (event) => {
    filters.forEach((filter) => {
      if (filter.open && !filter.contains(event.target)) {
        filter.open = false;
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOtherFilters(null);
    }
  });
}
