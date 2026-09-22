/*
  Proyecto Atlas / ELARA Transport
  Archivo: auth.js
  Responsabilidad: Auth real con Supabase y sesion de aplicacion.
*/

"use strict";

const ELARA_LEGACY_MOCK_SESSION_STORAGE_KEY = "elara.mock.activeUser";
const VALID_AUTH_CONTEXTS = ["superadmin", "administrativo", "conductor"];
const AUTH_CONTEXT_LABELS = {
  superadmin: "Superadmin",
  administrativo: "Administrativo",
  conductor: "Conductor",
};
const INACTIVE_ACCOUNT_MESSAGE = "Tu cuenta esta inactiva. Contacta con administracion.";
const AUTH_INITIALIZATION_ERROR_MESSAGE = "No se pudo iniciar tu sesion de ELARA. Contacta con administracion.";

let activeUser = null;
let activeAuthSession = null;
let activeAppSession = null;
let currentDriverIdentity = null;
let driverIdentityPromise = null;
let authCallbacks = {
  onLogin: null,
  onLogout: null,
};
let authReadyPromise = null;
let isLoginSubmitting = false;
let isRestoringSession = false;
let isSigningOut = false;
let tokenRefreshSyncTimeoutId = 0;

function initAuth(callbacks = {}) {
  authCallbacks = callbacks;
  clearLegacyMockSession();
  bindLoginForm();
  bindLogoutButton();
  bindContextSwitcher();
  bindSupabaseAuthState();
  authReadyPromise = restoreExistingSession();

  return authReadyPromise;
}

function bindLoginForm() {
  const form = document.getElementById("login-form");

  if (!form || form.dataset.authBound === "true") {
    return;
  }

  form.dataset.authBound = "true";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLoginSubmit(form);
  });
}

async function handleLoginSubmit(form) {
  if (isLoginSubmitting) {
    return;
  }

  const email = String(form.elements.email?.value || "").trim();
  const password = String(form.elements.password?.value || "");

  if (!email) {
    showLoginError("Introduce tu email.");
    form.elements.email?.focus();
    return;
  }

  if (!password) {
    showLoginError("Introduce tu contrasena.");
    form.elements.password?.focus();
    return;
  }

  isLoginSubmitting = true;
  setLoginLoading(true);
  showLoginError("");

  try {
    await signInAndInitializeAppSession(email, password);
    form.reset();
    renderAuthState();
    redirectToActiveContext({ replace: true, render: false });
    notifyLogin();
  } catch (error) {
    logAuthError("login", error);
    showLoginError(getLoginErrorMessage(error));
  } finally {
    isLoginSubmitting = false;
    setLoginLoading(false);
  }
}

async function signInAndInitializeAppSession(email, password) {
  const supabaseClient = getSupabaseClient();
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    throw markAuthStage(error, "sign-in");
  }

  if (!data?.session || !data?.user) {
    throw markAuthStage(new Error("Supabase did not return an authenticated session."), "sign-in");
  }

  try {
    return await initializeAuthenticatedAppSession(data.session, data.user);
  } catch (error) {
    await signOutSilently();
    clearAuthenticatedState();
    throw markAuthStage(error, "app-session");
  }
}

async function restoreExistingSession() {
  isRestoringSession = true;
  renderAuthState({ isRestoring: true });

  try {
    const supabaseClient = getSupabaseClient();
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      throw markAuthStage(error, "restore");
    }

    if (!data?.session) {
      clearAuthenticatedState();
      renderAuthState();
      return null;
    }

    const restoredUser = await initializeAuthenticatedAppSession(data.session, data.session.user);
    renderAuthState();
    redirectToActiveContext({ replace: !window.location.hash, render: false });
    notifyLogin();
    return restoredUser;
  } catch (error) {
    logAuthError("restore", error);
    await signOutSilently();
    clearAuthenticatedState();
    showLoginError(getLoginErrorMessage(error));
    renderAuthState();
    return null;
  } finally {
    isRestoringSession = false;
    renderAuthState();
  }
}

async function initializeAuthenticatedAppSession(authSession, authUser) {
  const supabaseClient = getSupabaseClient();
  const { data, error } = await supabaseClient.rpc("initialize_app_session");

  if (error) {
    throw markAuthStage(error, "app-session");
  }

  const appSession = normalizeAppSessionPayload(data);

  if (!appSession) {
    throw markAuthStage(new Error("initialize_app_session did not return an app session."), "app-session");
  }

  activeAuthSession = authSession;
  activeAppSession = appSession;
  activeUser = toSessionUser(authUser, appSession);
  await getCurrentDriverIdentity({ force: true });
  emitAuthSessionUpdatedEvent("app-session-initialized");

  return activeUser;
}

function normalizeAppSessionPayload(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const activeContext = normalizeAuthContext(row?.active_context);

  if (!row?.app_session_id || !row?.app_user_id || !activeContext) {
    return null;
  }

  return {
    appSessionId: row.app_session_id,
    appUserId: row.app_user_id,
    activeContext,
  };
}

function toSessionUser(authUser, appSession) {
  const email = String(authUser?.email || "").trim();
  const activeContext = appSession.activeContext;

  return {
    id: appSession.appUserId,
    appSessionId: appSession.appSessionId,
    supabaseUserId: authUser?.id || "",
    firstName: "",
    lastName: "",
    name: email || "Usuario ELARA",
    email,
    roles: [activeContext],
    defaultContext: activeContext,
    activeContext,
    role: activeContext,
    status: "activo",
    driverId: "",
    driverIdentity: null,
    driverIdentityStatus: activeContext === "conductor" ? "pending" : "not-required",
  };
}

async function getCurrentDriverIdentity(options = {}) {
  if (!activeUser || !isUserActive() || getActiveContext() !== "conductor") {
    currentDriverIdentity = null;
    return null;
  }

  if (currentDriverIdentity && activeUser.driverId && !options.force) {
    return currentDriverIdentity;
  }

  if (driverIdentityPromise && !options.force) {
    return driverIdentityPromise;
  }

  activeUser.driverIdentityStatus = "pending";
  driverIdentityPromise = fetchCurrentDriverIdentity().finally(() => {
    driverIdentityPromise = null;
  });

  return driverIdentityPromise;
}

async function fetchCurrentDriverIdentity() {
  const supabaseClient = getSupabaseClient();
  const appUserId = activeUser?.id || "";

  if (!appUserId) {
    return markMissingCurrentDriverIdentity("missing-app-user");
  }

  const { data: links, error: linkError } = await supabaseClient
    .from("user_driver_links")
    .select("driver_id, status, started_at, ended_at")
    .eq("user_id", appUserId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (linkError) {
    throw markAuthStage(linkError, "driver-identity");
  }

  const link = Array.isArray(links) ? links[0] : links;

  if (!link?.driver_id) {
    return markMissingCurrentDriverIdentity("missing-link");
  }

  const { data: driver, error: driverError } = await supabaseClient
    .from("drivers")
    .select("id, person_id, human_code, driver_type, administrative_status, availability_preference")
    .eq("id", link.driver_id)
    .maybeSingle();

  if (driverError) {
    throw markAuthStage(driverError, "driver-identity");
  }

  if (!driver?.id) {
    return markMissingCurrentDriverIdentity("driver-not-visible");
  }

  const person = await fetchCurrentDriverPerson(driver.person_id);
  currentDriverIdentity = {
    appUserId,
    driverId: driver.id,
    personId: driver.person_id || "",
    humanCode: driver.human_code || "",
    driverType: driver.driver_type || "",
    administrativeStatus: driver.administrative_status || "",
    availabilityPreference: driver.availability_preference || "",
    name: getDriverPersonDisplayName(person),
    email: person?.contact_email || activeUser.email || "",
    phone: person?.phone || "",
  };
  activeUser.driverId = currentDriverIdentity.driverId;
  activeUser.driverIdentity = currentDriverIdentity;
  activeUser.driverIdentityStatus = "resolved";
  emitAuthSessionUpdatedEvent("driver-identity-resolved");

  return currentDriverIdentity;
}

function markMissingCurrentDriverIdentity(status) {
  currentDriverIdentity = null;

  if (activeUser) {
    activeUser.driverId = "";
    activeUser.driverIdentity = null;
    activeUser.driverIdentityStatus = status;
  }

  emitAuthSessionUpdatedEvent("driver-identity-missing");
  return null;
}

async function fetchCurrentDriverPerson(personId) {
  if (!personId) {
    return null;
  }

  const { data, error } = await getSupabaseClient()
    .from("persons")
    .select("first_name, last_name, contact_email, phone")
    .eq("id", personId)
    .maybeSingle();

  if (error) {
    throw markAuthStage(error, "driver-identity");
  }

  return data || null;
}

function getDriverPersonDisplayName(person) {
  const name = [person?.first_name, person?.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return name || activeUser?.email || "Conductor ELARA";
}

function bindLogoutButton() {
  const logoutButton = document.getElementById("logout-button");

  if (!logoutButton || logoutButton.dataset.authBound === "true") {
    return;
  }

  logoutButton.dataset.authBound = "true";
  logoutButton.addEventListener("click", () => {
    void logout();
  });
}

async function logout() {
  if (isSigningOut) {
    return;
  }

  const hadUser = Boolean(activeUser);

  isSigningOut = true;
  setLogoutLoading(true);

  try {
    const supabaseClient = getSupabaseClient();
    await endCurrentAppSessionForLogout(supabaseClient);

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      throw markAuthStage(error, "sign-out");
    }

    clearAuthenticatedState();
    renderAuthState();

    if (hadUser && typeof authCallbacks.onLogout === "function") {
      authCallbacks.onLogout();
    }

    showLoginError("");
    notifyAuthAction("Sesion cerrada.", "info");
  } catch (error) {
    logAuthError("logout", error);
    notifyAuthAction("No se pudo cerrar la sesion. Intentalo de nuevo.", "error");
  } finally {
    isSigningOut = false;
    setLogoutLoading(false);
  }
}

async function endCurrentAppSessionForLogout(supabaseClient) {
  try {
    const { error } = await supabaseClient.rpc("end_current_app_session");

    if (error) {
      throw markAuthStage(error, "app-session-end");
    }
  } catch (error) {
    logAuthError("end-current-app-session", error);
  }
}

function bindSupabaseAuthState() {
  const supabaseClient = getOptionalSupabaseClient();

  if (!supabaseClient || bindSupabaseAuthState.isBound) {
    return;
  }

  bindSupabaseAuthState.isBound = true;
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      handleSignedOutEvent();
      return;
    }

    if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session && !isLoginSubmitting && !isRestoringSession) {
      scheduleAppSessionRefresh(session, event.toLowerCase());
    }
  });
}

function handleSignedOutEvent() {
  const hadUser = Boolean(activeUser);

  clearAuthenticatedState();
  renderAuthState();

  if (hadUser && !isSigningOut && typeof authCallbacks.onLogout === "function") {
    authCallbacks.onLogout();
  }
}

function scheduleAppSessionRefresh(session, reason) {
  window.clearTimeout(tokenRefreshSyncTimeoutId);
  tokenRefreshSyncTimeoutId = window.setTimeout(() => {
    void refreshAuthenticatedAppSession(session, reason);
  }, 0);
}

async function refreshAuthenticatedAppSession(session, reason) {
  try {
    await initializeAuthenticatedAppSession(session, session.user);
    renderAuthState();
    emitAuthSessionUpdatedEvent(reason || "auth-session-refreshed");
  } catch (error) {
    logAuthError(reason || "auth-session-refresh", error);
    await signOutSilently();
    clearAuthenticatedState();
    renderAuthState();
    showLoginError(getLoginErrorMessage(error));

    if (typeof authCallbacks.onLogout === "function") {
      authCallbacks.onLogout();
    }
  }
}

async function requireAuth(options = {}) {
  if (authReadyPromise) {
    await authReadyPromise;
  }

  const allowedContexts = Array.isArray(options.allowedContexts) ? options.allowedContexts.map(normalizeAuthContext).filter(Boolean) : [];
  const activeContext = getActiveContext();
  const isAllowed = Boolean(activeUser && isUserActive() && (!allowedContexts.length || allowedContexts.includes(activeContext)));

  if (!isAllowed && options.redirect !== false) {
    clearAuthenticatedState();
    renderAuthState();
  }

  return isAllowed ? activeUser : null;
}

function renderAuthState(options = {}) {
  const loginScreen = document.getElementById("login-screen");
  const appShell = document.querySelector(".app-shell");
  const userName = document.getElementById("session-user-name");
  const userRole = document.getElementById("session-user-role");
  const isRestoring = Boolean(options.isRestoring || isRestoringSession);

  document.body.classList.toggle("auth-pending", isRestoring);

  if (loginScreen) {
    loginScreen.hidden = isRestoring || Boolean(activeUser);
  }

  if (appShell) {
    appShell.hidden = isRestoring || !activeUser;
  }

  if (userName) {
    userName.textContent = activeUser ? activeUser.name : "Sesion no iniciada";
  }

  if (userRole) {
    userRole.textContent = activeUser ? getAuthContextLabel(activeUser.activeContext) : "Datos simulados";
  }

  renderContextSwitcher();
}

function bindContextSwitcher() {
  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-auth-context-toggle]");
    const switcher = document.getElementById("session-context-switcher");

    if (toggleButton) {
      toggleContextSwitcher();
      return;
    }

    if (event.target.closest("[data-auth-context-option]")) {
      closeContextSwitcher();
      notifyAuthAction("El cambio de contexto real se integrara en una fase posterior.", "info");
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

  switcher.hidden = true;
  switcher.innerHTML = "";
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

function redirectToActiveContext(options = {}) {
  const context = getActiveContext();
  const initialRoute =
    window.ElaraPermissions && typeof window.ElaraPermissions.getInitialRoute === "function"
      ? window.ElaraPermissions.getInitialRoute(context)
      : "";

  if (!initialRoute) {
    return;
  }

  if (options.replace) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${initialRoute}`);

    if (options.render !== false) {
      window.ElaraRouter?.showCurrentRoute?.({ silent: true });
    }

    return;
  }

  window.ElaraRouter?.navigateTo?.(initialRoute);
}

function clearAuthenticatedState() {
  activeUser = null;
  activeAuthSession = null;
  activeAppSession = null;
  currentDriverIdentity = null;
  driverIdentityPromise = null;
  clearLegacyMockSession();
}

function clearLegacyMockSession() {
  localStorage.removeItem(ELARA_LEGACY_MOCK_SESSION_STORAGE_KEY);
}

async function signOutSilently() {
  const supabaseClient = getOptionalSupabaseClient();

  if (!supabaseClient) {
    return;
  }

  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    logAuthError("silent-sign-out", error);
  }
}

function setLoginLoading(isLoading) {
  const form = document.getElementById("login-form");
  const button = form?.querySelector('button[type="submit"]');

  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? "Iniciando sesion..." : button.dataset.defaultLabel;
}

function setLogoutLoading(isLoading) {
  const logoutButton = document.getElementById("logout-button");

  if (!logoutButton) {
    return;
  }

  if (!logoutButton.dataset.defaultLabel) {
    logoutButton.dataset.defaultLabel = logoutButton.textContent;
  }

  logoutButton.disabled = isLoading;
  logoutButton.textContent = isLoading ? "Cerrando..." : logoutButton.dataset.defaultLabel;
}

function showLoginError(message) {
  const errorMessage = document.getElementById("login-error");

  if (!errorMessage) {
    return;
  }

  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function getLoginErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  const stage = error?.elaraStage || "";

  if (message.includes("invalid login credentials") || message.includes("email not confirmed")) {
    return "Email o contrasena incorrectos.";
  }

  if (message.includes("failed to fetch") || message.includes("network") || message.includes("fetch")) {
    return "No se pudo conectar con Supabase. Revisa tu conexion.";
  }

  if (message.includes("inactive") || message.includes("inactiva")) {
    return INACTIVE_ACCOUNT_MESSAGE;
  }

  if (message.includes("no active application user") || message.includes("application user") || message.includes("app user")) {
    return "Tu cuenta no tiene un usuario ELARA activo.";
  }

  if (message.includes("no active role") || message.includes("default_context") || message.includes("active role")) {
    return "Tu cuenta no tiene un contexto de acceso valido.";
  }

  if (stage === "app-session" || stage === "restore") {
    return AUTH_INITIALIZATION_ERROR_MESSAGE;
  }

  return "No se pudo iniciar sesion. Revisa tus credenciales e intentalo de nuevo.";
}

function getSupabaseClient() {
  const supabaseClient = getOptionalSupabaseClient();

  if (!supabaseClient) {
    throw markAuthStage(new Error("Supabase client is not configured."), "config");
  }

  return supabaseClient;
}

function getOptionalSupabaseClient() {
  return window.ElaraSupabase?.client || null;
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
  const normalizedRole = normalizeAuthContext(role);

  return Boolean(normalizedRole && activeUser?.roles?.includes(normalizedRole));
}

function isUserActive() {
  return activeUser?.status === "activo";
}

function setActiveContext(context) {
  const normalizedContext = normalizeAuthContext(context);

  if (!activeUser || !isUserActive() || !normalizedContext || normalizedContext !== activeUser.activeContext) {
    return false;
  }

  return true;
}

function reconcileCurrentSessionWithUser() {
  return {
    applied: false,
    signedOut: false,
    activeUser,
  };
}

function closeCurrentSession(message, type = "info") {
  const hadUser = Boolean(activeUser);

  void signOutSilently();
  clearAuthenticatedState();
  renderAuthState();

  if (hadUser && typeof authCallbacks.onLogout === "function") {
    authCallbacks.onLogout();
  }

  notifyAuthAction(message, type);
  emitAuthSessionUpdatedEvent("session-closed");
}

function notifyLogin() {
  if (typeof authCallbacks.onLogin === "function") {
    authCallbacks.onLogin(activeUser);
  }
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
  return AUTH_CONTEXT_LABELS[normalizeAuthContext(context)] || context || "Contexto no disponible";
}

function normalizeAuthContext(context) {
  const normalizedContext = String(context || "").trim().toLowerCase();

  return VALID_AUTH_CONTEXTS.includes(normalizedContext) ? normalizedContext : "";
}

function notifyAuthAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function markAuthStage(error, stage) {
  if (error && typeof error === "object") {
    error.elaraStage = error.elaraStage || stage;
    return error;
  }

  const wrappedError = new Error(String(error || "Unknown auth error."));
  wrappedError.elaraStage = stage;
  return wrappedError;
}

function logAuthError(scope, error) {
  console.error(`[ELARA Auth] ${scope}`, {
    code: error?.code || "",
    message: error?.message || "",
    name: error?.name || "",
    stage: error?.elaraStage || "",
    status: error?.status || "",
  });
}

window.ElaraAuth = {
  closeCurrentSession,
  getActiveContext,
  getAvailableRoles,
  getCurrentUser,
  getCurrentDriverIdentity,
  getDefaultContext,
  hasRole,
  initAuth,
  isUserActive,
  logout,
  reconcileCurrentSessionWithUser,
  requireAuth,
  setActiveContext,
};
