/*
  Proyecto Atlas / ELARA Transport
  Archivo: auth.js
  Responsabilidad: control visual de sesion mock.
*/

"use strict";

const ELARA_SESSION_STORAGE_KEY = "elara.mock.activeUser";
const VALID_AUTH_ROLES = ["superadmin", "administrativo", "conductor"];
const AUTH_CONTEXT_PRIORITY = ["superadmin", "administrativo", "conductor"];
const VALID_AUTH_STATUSES = ["activo", "inactivo"];
const INACTIVE_ACCOUNT_MESSAGE = "Tu cuenta est\u00e1 inactiva. Contacta con administraci\u00f3n.";
const AUTH_CONTEXT_LABELS = {
  superadmin: "Superadmin",
  administrativo: "Administrativo",
  conductor: "Conductor",
};

let activeUser = loadStoredUser();
let authCallbacks = {
  onLogin: null,
  onLogout: null,
};

function initAuth(callbacks = {}) {
  authCallbacks = callbacks;
  bindLoginForm();
  bindLogoutButton();
  bindContextSwitcher();
  renderAuthState();
}

function bindLoginForm() {
  const form = document.getElementById("login-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const user = findMockUser(email, password);

    if (!user) {
      showLoginError("Credenciales mock no v\u00e1lidas. Revisa email y contrase\u00f1a.");
      return;
    }

    if (!isMockUserActive(user)) {
      showLoginError(INACTIVE_ACCOUNT_MESSAGE);
      return;
    }

    activeUser = toSessionUser(user);
    localStorage.setItem(ELARA_SESSION_STORAGE_KEY, JSON.stringify(activeUser));
    form.reset();
    showLoginError("");
    renderAuthState();

    if (typeof authCallbacks.onLogin === "function") {
      authCallbacks.onLogin(activeUser);
    }
  });
}

function bindLogoutButton() {
  const logoutButton = document.getElementById("logout-button");

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", logout);
}

function logout() {
  activeUser = null;
  localStorage.removeItem(ELARA_SESSION_STORAGE_KEY);
  renderAuthState();

  if (typeof authCallbacks.onLogout === "function") {
    authCallbacks.onLogout();
  }
}

function renderAuthState() {
  const loginScreen = document.getElementById("login-screen");
  const appShell = document.querySelector(".app-shell");
  const userName = document.getElementById("session-user-name");
  const userRole = document.getElementById("session-user-role");

  if (loginScreen) {
    loginScreen.hidden = Boolean(activeUser);
  }

  if (appShell) {
    appShell.hidden = !activeUser;
  }

  if (userName) {
    userName.textContent = activeUser ? activeUser.name : "Sesion no iniciada";
  }

  if (userRole) {
    userRole.textContent = activeUser ? getAuthContextLabel(activeUser.activeContext || activeUser.role) : "Datos simulados";
  }

  renderContextSwitcher();
}

function findMockUser(email, password) {
  return (window.ElaraUsersMock || []).find(
    (user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password,
  );
}

function toSessionUser(user, requestedActiveContext = "") {
  const roles = normalizeAuthRoles(user);
  const defaultContext = normalizeAuthDefaultContext(user, roles);
  const normalizedRequestedContext = normalizeAuthRole(requestedActiveContext);
  const activeContext = roles.includes(normalizedRequestedContext) ? normalizedRequestedContext : defaultContext;

  return {
    id: user.id,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    name: user.name,
    email: user.email,
    roles,
    defaultContext,
    activeContext,
    role: activeContext,
    status: normalizeAuthStatus(user.status),
    driverId: user.driverId || "",
  };
}

function loadStoredUser() {
  try {
    const storedValue = localStorage.getItem(ELARA_SESSION_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const storedUser = JSON.parse(storedValue);
    const centralUser = findMockUserByStoredSession(storedUser);

    if (!centralUser || !isMockUserActive(centralUser)) {
      localStorage.removeItem(ELARA_SESSION_STORAGE_KEY);
      return null;
    }

    return toSessionUser(centralUser, storedUser.activeContext);
  } catch (error) {
    localStorage.removeItem(ELARA_SESSION_STORAGE_KEY);
    return null;
  }
}

function bindContextSwitcher() {
  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-auth-context-toggle]");
    const contextButton = event.target.closest("[data-auth-context-option]");
    const switcher = document.getElementById("session-context-switcher");

    if (toggleButton) {
      toggleContextSwitcher();
      return;
    }

    if (contextButton) {
      const nextContext = contextButton.dataset.authContextOption;
      const currentContext = getActiveContext();

      closeContextSwitcher();

      if (nextContext === currentContext) {
        return;
      }

      if (setActiveContext(nextContext)) {
        if (window.ElaraRouter && typeof window.ElaraRouter.refreshNavigationForActiveContext === "function") {
          window.ElaraRouter.refreshNavigationForActiveContext();
        }

        notifyAuthAction(`Ahora usas ELARA como ${getAuthContextLabel(nextContext)}.`, "success");
      }

      return;
    }

    if (switcher && !switcher.hidden && !switcher.contains(event.target)) {
      closeContextSwitcher();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextSwitcher();
    }
  });
}

function renderContextSwitcher() {
  const switcher = document.getElementById("session-context-switcher");

  if (!switcher) {
    return;
  }

  if (!activeUser || !Array.isArray(activeUser.roles) || activeUser.roles.length <= 1) {
    switcher.hidden = true;
    switcher.innerHTML = "";
    return;
  }

  switcher.hidden = false;
  switcher.innerHTML = `
    <button class="sidebar-context__toggle" type="button" data-auth-context-toggle aria-expanded="false" aria-haspopup="true">
      <span>Usar ELARA como...</span>
      <strong>${escapeAuthHtml(getAuthContextLabel(activeUser.activeContext))}</strong>
    </button>
    <div class="sidebar-context__menu" role="menu" hidden>
      ${activeUser.roles
        .map((role) => {
          const isActive = role === activeUser.activeContext;

          return `
            <button class="sidebar-context__option${isActive ? " sidebar-context__option--active" : ""}" type="button" role="menuitemradio" aria-checked="${isActive}" data-auth-context-option="${escapeAuthHtml(role)}">
              ${escapeAuthHtml(getAuthContextLabel(role))}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function toggleContextSwitcher() {
  const switcher = document.getElementById("session-context-switcher");
  const menu = switcher?.querySelector(".sidebar-context__menu");
  const button = switcher?.querySelector("[data-auth-context-toggle]");

  if (!switcher || !menu || !button) {
    return;
  }

  const shouldOpen = menu.hidden;
  menu.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function closeContextSwitcher() {
  const switcher = document.getElementById("session-context-switcher");
  const menu = switcher?.querySelector(".sidebar-context__menu");
  const button = switcher?.querySelector("[data-auth-context-toggle]");

  if (menu) {
    menu.hidden = true;
  }

  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
}

function findMockUserByStoredSession(sessionUser) {
  const users = Array.isArray(window.ElaraUsersMock) ? window.ElaraUsersMock : [];
  const sessionId = String(sessionUser?.id || "").trim();
  const sessionEmail = String(sessionUser?.email || "").trim().toLowerCase();

  return (
    users.find((user) => String(user.id || "").trim() === sessionId) ||
    users.find((user) => String(user.email || "").trim().toLowerCase() === sessionEmail) ||
    null
  );
}

function normalizeAuthRoles(user) {
  const roles = getValidAuthRoles(user);

  return roles.length ? roles : ["conductor"];
}

function getValidAuthRoles(user) {
  const sourceRoles = Array.isArray(user?.roles) ? user.roles : [user?.role];

  return sourceRoles
    .map(normalizeAuthRole)
    .filter(Boolean)
    .filter((role, index, self) => self.indexOf(role) === index);
}

function normalizeAuthRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  return VALID_AUTH_ROLES.includes(normalizedRole) ? normalizedRole : "";
}

function normalizeAuthDefaultContext(user, roles) {
  const defaultContext = normalizeAuthRole(user?.defaultContext);

  if (roles.includes(defaultContext)) {
    return defaultContext;
  }

  return AUTH_CONTEXT_PRIORITY.find((context) => roles.includes(context)) || roles[0];
}

function normalizeAuthStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  return VALID_AUTH_STATUSES.includes(normalizedStatus) ? normalizedStatus : "inactivo";
}

function isMockUserActive(user) {
  return normalizeAuthStatus(user?.status) === "activo";
}

function showLoginError(message) {
  const errorMessage = document.getElementById("login-error");

  if (!errorMessage) {
    return;
  }

  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function getCurrentUser() {
  return activeUser;
}

function getAvailableRoles() {
  return activeUser?.roles ? activeUser.roles.slice() : [];
}

function getDefaultContext() {
  return activeUser?.defaultContext || "";
}

function getActiveContext() {
  return activeUser?.activeContext || "";
}

function hasRole(role) {
  const normalizedRole = normalizeAuthRole(role);

  return Boolean(normalizedRole && activeUser?.roles?.includes(normalizedRole));
}

function isUserActive() {
  return activeUser?.status === "activo";
}

function setActiveContext(context) {
  const normalizedContext = normalizeAuthRole(context);

  if (!activeUser || !isUserActive() || !normalizedContext || !activeUser.roles?.includes(normalizedContext)) {
    return false;
  }

  activeUser.activeContext = normalizedContext;
  activeUser.role = normalizedContext;
  localStorage.setItem(ELARA_SESSION_STORAGE_KEY, JSON.stringify(activeUser));
  renderAuthState();
  return true;
}

function reconcileCurrentSessionWithUser(updatedUser) {
  if (!activeUser || !updatedUser || String(activeUser.id || "") !== String(updatedUser.id || "")) {
    return {
      applied: false,
      signedOut: false,
      activeUser,
    };
  }

  const roles = getValidAuthRoles(updatedUser);

  if (!roles.length) {
    closeCurrentSession("Tu usuario no tiene un contexto de acceso válido.", "error");
    return {
      applied: true,
      signedOut: true,
      reason: "no-valid-context",
    };
  }

  if (normalizeAuthStatus(updatedUser.status) !== "activo") {
    closeCurrentSession("Tu usuario fue desactivado. La sesión se ha cerrado.", "warning");
    return {
      applied: true,
      signedOut: true,
      reason: "inactive",
    };
  }

  const previousActiveContext = activeUser.activeContext;
  const defaultContext = normalizeAuthDefaultContext({ defaultContext: updatedUser.defaultContext }, roles);
  const nextActiveContext = roles.includes(previousActiveContext) ? previousActiveContext : defaultContext;
  activeUser = toSessionUser({ ...updatedUser, roles, defaultContext }, nextActiveContext);
  localStorage.setItem(ELARA_SESSION_STORAGE_KEY, JSON.stringify(activeUser));
  renderAuthState();
  emitAuthSessionUpdatedEvent("user-record-reconciled");

  return {
    applied: true,
    signedOut: false,
    activeUser,
    activeContextChanged: previousActiveContext !== activeUser.activeContext,
  };
}

function closeCurrentSession(message, type = "info") {
  activeUser = null;
  localStorage.removeItem(ELARA_SESSION_STORAGE_KEY);
  renderAuthState();

  if (typeof authCallbacks.onLogout === "function") {
    authCallbacks.onLogout();
  }

  notifyAuthAction(message, type);
  emitAuthSessionUpdatedEvent("session-closed");
}

function emitAuthSessionUpdatedEvent(reason) {
  window.dispatchEvent(
    new CustomEvent("elara:auth-session-updated", {
      detail: {
        reason,
        user: activeUser,
      },
    }),
  );
}

function getAuthContextLabel(context) {
  return AUTH_CONTEXT_LABELS[normalizeAuthRole(context)] || context || "Contexto no disponible";
}

function notifyAuthAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function escapeAuthHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
}

window.ElaraAuth = {
  getActiveContext,
  getAvailableRoles,
  getCurrentUser,
  getDefaultContext,
  hasRole,
  initAuth,
  isUserActive,
  logout,
  reconcileCurrentSessionWithUser,
  setActiveContext,
};
