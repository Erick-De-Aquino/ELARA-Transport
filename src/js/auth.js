/*
  Proyecto Atlas / ELARA Transport
  Archivo: auth.js
  Responsabilidad: Auth real con Supabase y sesion de aplicacion.
*/

"use strict";

const ELARA_LEGACY_MOCK_SESSION_STORAGE_KEY = "elara.mock.activeUser";
const VALID_AUTH_CONTEXTS = ["superadmin", "administrativo", "conductor"];
const AUTH_CONTEXT_LABELS = {
  superadmin: "Superadministrador",
  administrativo: "Administrador",
  conductor: "Conductor",
};
const INACTIVE_ACCOUNT_MESSAGE = "Tu cuenta esta inactiva. Contacta con administracion.";
const AUTH_INITIALIZATION_ERROR_MESSAGE = "No se pudo iniciar tu sesion de ELARA. Contacta con administracion.";

const appSessionInitializations = new Map();
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
let authRevision = 0;
let contextSuspended = false;
let contextTask = null;
let contextChannel = null;
const CONTEXT_SIGNAL_KEY = "elara.auth.context-signal";

function authSessionKey(session) {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const id = JSON.parse(window.atob(payload)).session_id;
    return id && session.user?.id ? `${session.user.id}/${id}` : "";
  } catch (_) { return ""; }
}

function withContextLock(session, task) {
  const locks = window.navigator?.locks;
  return locks ? locks.request(`elara-context/${authSessionKey(session)}`, task) : task();
}

function invalidateContextViews() {
  window.ElaraAdminControls?.reset();
  window.ElaraFinancialClose?.reset();
  window.ElaraOperationalData?.reset();
  document.querySelectorAll('.modal-backdrop').forEach(modal => { modal.hidden = true; });
  document.querySelectorAll('[data-view]').forEach(view => { view.hidden = true; });
  document.getElementById('sidebar-nav')?.replaceChildren();
  document.body.classList.remove('modal-open');
  emitAuthSessionUpdatedEvent('context-invalidated');
}

function suspendContext() {
  contextSuspended = true;
  authRevision++;
  currentDriverIdentity = null;
  driverIdentityPromise = null;
  invalidateContextViews();
  renderAuthState();
}

function signalContextChange(session) {
  // Notification only. Neither storage nor messages contain roles, tokens or authority.
  const signal = {session: authSessionKey(session), nonce: `${Date.now()}/${Math.random()}`};
  if (contextChannel) contextChannel.postMessage(signal);
  else { try { localStorage.setItem(CONTEXT_SIGNAL_KEY, JSON.stringify(signal)); } catch (_) { /* Focus revalidation remains active. */ } }
}

function bindContextSynchronization() {
  if (bindContextSynchronization.isBound) return;
  bindContextSynchronization.isBound = true;
  const receive = signal => {
    if (activeAuthSession && signal?.session === authSessionKey(activeAuthSession) && !contextTask) {
      suspendContext();
      void synchronizeContext();
    }
  };
  if (window.BroadcastChannel) {
    contextChannel = new window.BroadcastChannel('elara-auth-context');
    contextChannel.onmessage = event => receive(event.data);
  } else window.addEventListener('storage', event => {
    if (event.key === CONTEXT_SIGNAL_KEY) { try { receive(JSON.parse(event.newValue)); } catch (_) { /* Ignore malformed notifications. */ } }
  });
  window.addEventListener('focus', () => { if (activeUser) void synchronizeContext(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeUser) void synchronizeContext();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && activeUser) void synchronizeContext();
  }, 30000);
}

function initAuth(callbacks = {}) {
  authCallbacks = callbacks;
  clearLegacyMockSession();
  bindLoginForm();
  bindLogoutButton();
  bindContextSwitcher();
  bindContextSynchronization();
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
  const revision = authRevision;
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
    if (revision !== authRevision || error?.code === 'STALE_AUTH') throw error;
    await handleAppSessionFailure(error);
    clearAuthenticatedState();
    throw markAuthStage(error, "app-session");
  }
}

async function restoreExistingSession() {
  const revision = authRevision;
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
    if (revision !== authRevision || error?.code === 'STALE_AUTH') return null;
    logAuthError("restore", error);
    await handleAppSessionFailure(error);
    clearAuthenticatedState();
    showLoginError(getLoginErrorMessage(error));
    renderAuthState();
    return null;
  } finally {
    isRestoringSession = false;
    renderAuthState();
  }
}

function initializeAuthenticatedAppSession(authSession, authUser) {
  const key = authSessionKey(authSession);
  if (!key || !authUser?.id || authSession.user?.id !== authUser.id) {
    return Promise.reject(markAuthStage(Object.assign(new Error("Invalid Auth session identity."), {code:"28000"}), "app-session"));
  }
  if (appSessionInitializations.has(key)) return appSessionInitializations.get(key);
  const revision = authRevision;
  const pending = withContextLock(authSession, () => performAuthenticatedAppSessionInitialization(authSession, authUser, revision))
    .finally(() => { if (appSessionInitializations.get(key) === pending) appSessionInitializations.delete(key); });
  appSessionInitializations.set(key, pending);
  return pending;
}

async function handleAppSessionFailure(error) {
  // Keep application access closed without revoking valid Auth on transient failures.
  if (["28000", "42501"].includes(error?.code)) {
    try { await getOptionalSupabaseClient()?.auth.signOut({scope:"local"}); }
    catch (signOutError) { logAuthError("local-sign-out", signOutError); }
  }
}

async function readAuthorizedRoles(appUserId) {
  const client = getSupabaseClient();
  const [assignments, catalog] = await Promise.all([
    client.from('user_roles').select('user_id, role_key, status, starts_at, ends_at, revoked_at')
      .eq('user_id', appUserId).eq('status', 'active').limit(100),
    client.from('roles').select('key, is_active').eq('is_active', true).limit(100),
  ]);
  if (assignments.error || catalog.error) throw markAuthStage(assignments.error || catalog.error, 'authorized-roles');
  if (!Array.isArray(assignments.data) || !Array.isArray(catalog.data) || assignments.data.length >= 100 || catalog.data.length >= 100) {
    throw markAuthStage(new Error('Cannot confirm own role assignments.'), 'authorized-roles');
  }
  const enabled = new Set(catalog.data.filter(row => row.is_active === true).map(row => row.key));
  const now = Date.now();
  return VALID_AUTH_CONTEXTS.filter(role => enabled.has(role) && assignments.data.some(row =>
    row.user_id === appUserId && row.role_key === role && row.status === 'active' && !row.revoked_at &&
    Number.isFinite(Date.parse(row.starts_at)) && Date.parse(row.starts_at) <= now &&
    (row.ends_at == null || Date.parse(row.ends_at) > now)));
}

async function confirmAppContext(authSession, requestedContext) {
  const result = await getSupabaseClient().rpc('initialize_app_session', requestedContext ? {p_requested_context: requestedContext} : undefined);
  if (result.error) throw markAuthStage(result.error, 'app-session');
  const appSession = normalizeAppSessionPayload(result.data);
  if (!appSession || (requestedContext && appSession.activeContext !== requestedContext) ||
      (activeAuthSession && authSessionKey(activeAuthSession) === authSessionKey(authSession) &&
       activeAppSession && (appSession.appUserId !== activeAppSession.appUserId || appSession.appSessionId !== activeAppSession.appSessionId))) {
    throw markAuthStage(new Error('Unconfirmed application session identity or context.'), 'app-session');
  }
  return appSession;
}

async function performAuthenticatedAppSessionInitialization(authSession, authUser, revision = authRevision) {
  const supabaseClient = getSupabaseClient();
  let { data, error } = await supabaseClient.rpc("initialize_app_session");
  // Recover the old deployment's missing-row race only, never an ownership collision.
  if (error?.code === "23505" && /app_sessions_supabase_session_id_unique/.test(error.message || "")) {
    ({ data, error } = await supabaseClient.rpc("initialize_app_session"));
  }

  if (error) {
    throw markAuthStage(error, "app-session");
  }

  const appSession = normalizeAppSessionPayload(data);

  if (!appSession) {
    throw markAuthStage(new Error("initialize_app_session did not return an app session."), "app-session");
  }

  const roles = await readAuthorizedRoles(appSession.appUserId);
  if (!roles.includes(appSession.activeContext)) throw markAuthStage(new Error('The confirmed context has no active role.'), 'authorized-roles');
  if (revision !== authRevision) throw Object.assign(new Error('Obsolete application session response.'), {code: 'STALE_AUTH'});

  activeAuthSession = authSession;
  activeAppSession = appSession;
  activeUser = toSessionUser(authUser, appSession, roles);
  await getCurrentDriverIdentity({ force: true });
  if (revision !== authRevision) throw Object.assign(new Error('Obsolete driver identity response.'), {code: 'STALE_AUTH'});
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

function toSessionUser(authUser, appSession, roles) {
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
    roles: roles.slice(),
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
  if (!activeUser || activeUser.status !== 'activo' || activeUser.activeContext !== "conductor") {
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
  const pending = fetchCurrentDriverIdentity().finally(() => {
    if (driverIdentityPromise === pending) driverIdentityPromise = null;
  });
  driverIdentityPromise = pending;

  return driverIdentityPromise;
}

async function fetchCurrentDriverIdentity() {
  const supabaseClient = getSupabaseClient();
  const owner = activeUser, revision = authRevision;
  const valid = () => owner === activeUser && revision === authRevision && activeUser?.activeContext === 'conductor';
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

  if (!valid()) return null;
  const link = Array.isArray(links) ? links[0] : links;

  if (!link?.driver_id || Date.parse(link.started_at) > Date.now() || !Number.isFinite(Date.parse(link.started_at)) ||
      (link.ended_at != null && !(Date.parse(link.ended_at) > Date.now()))) {
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

  if (!valid()) return null;
  if (!driver?.id || driver.administrative_status !== 'active') {
    return markMissingCurrentDriverIdentity("driver-not-visible");
  }

  const person = await fetchCurrentDriverPerson(driver.person_id);
  if (!valid()) return null;
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
  const session = activeAuthSession;
  suspendContext();
  signalContextChange(session);
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
    clearAuthenticatedState();
    renderAuthState();
    authCallbacks.onLogout?.();
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
      if (activeAuthSession && authSessionKey(session) !== authSessionKey(activeAuthSession)) {
        clearAuthenticatedState();
        renderAuthState();
      }
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
  if (contextTask && authSessionKey(session) === authSessionKey(activeAuthSession)) return contextTask;
  if (activeUser) return synchronizeContext();
  const revision = authRevision;
  try {
    await initializeAuthenticatedAppSession(session, session.user);
    renderAuthState();
    emitAuthSessionUpdatedEvent(reason || "auth-session-refreshed");
  } catch (error) {
    if (revision !== authRevision || error?.code === 'STALE_AUTH') return;
    logAuthError(reason || "auth-session-refresh", error);
    await handleAppSessionFailure(error);
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

  if (contextSuspended) return null;
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
  const isRestoring = Boolean(options.isRestoring || isRestoringSession || contextSuspended);

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
  if (bindContextSwitcher.isBound) return;
  bindContextSwitcher.isBound = true;
  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-auth-context-toggle]");
    const switcher = document.getElementById("session-context-switcher");

    if (toggleButton) {
      toggleContextSwitcher();
      return;
    }

    const option = event.target.closest("[data-auth-context-option]");
    if (option && switcher?.contains(option)) {
      closeContextSwitcher();
      void setActiveContext(option.dataset.authContextOption);
      return;
    }

    if (switcher && !switcher.hidden && !switcher.contains(event.target)) {
      closeContextSwitcher();
    }
  });

  document.addEventListener("keydown", (event) => {
    const switcher = document.getElementById('session-context-switcher');
    if (!switcher?.contains(event.target)) return;
    if (event.key === "Escape") {
      closeContextSwitcher();
      switcher.querySelector('[data-auth-context-toggle]')?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const menu = switcher.querySelector('.sidebar-context__menu');
      if (menu.hidden) toggleContextSwitcher();
      const options = [...switcher.querySelectorAll('[data-auth-context-option]')];
      const index = options.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
        event.key === 'ArrowDown' ? (index + 1) % options.length : index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Tab') {
      closeContextSwitcher();
      switcher.querySelector('[data-auth-context-toggle]')?.focus();
    }
  });
}

function renderContextSwitcher() {
  const switcher = document.getElementById("session-context-switcher");

  if (!switcher) {
    return;
  }

  const roles = getAvailableRoles();
  switcher.hidden = roles.length <= 1;
  if (switcher.hidden) { switcher.replaceChildren(); return; }
  switcher.innerHTML = `<button class="sidebar-context__toggle" type="button" data-auth-context-toggle aria-expanded="false" aria-haspopup="menu" aria-controls="session-context-menu">
    <span>Usar ELARA como…</span><strong>${getAuthContextLabel(activeUser.activeContext)}</strong></button>
    <div class="sidebar-context__menu" id="session-context-menu" role="menu" aria-label="Contexto de trabajo" hidden>${roles.map(role => {
      const selected = role === activeUser.activeContext;
      return `<button class="sidebar-context__option${selected ? ' sidebar-context__option--active' : ''}" type="button" role="menuitemradio" aria-checked="${selected}" data-auth-context-option="${role}">${getAuthContextLabel(role)}</button>`;
    }).join('')}</div>`;
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
  if (shouldOpen) menu.querySelector('[aria-checked="true"]')?.focus();
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
  contextSuspended = true;
  authRevision++;
  invalidateContextViews();
  activeUser = null;
  activeAuthSession = null;
  activeAppSession = null;
  currentDriverIdentity = null;
  driverIdentityPromise = null;
  contextTask = null;
  appSessionInitializations.clear();
  contextSuspended = false;
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
  return contextSuspended || isSigningOut ? null : activeUser;
}

function getAvailableRoles() {
  return !contextSuspended && activeUser?.roles ? activeUser.roles.slice() : [];
}

function getDefaultContext() {
  return activeUser?.defaultContext || "";
}

function getActiveContext() {
  return !contextSuspended && !isSigningOut ? activeUser?.activeContext || "" : "";
}

function hasRole(role) {
  const normalizedRole = normalizeAuthContext(role);

  return Boolean(!contextSuspended && normalizedRole && activeUser?.roles?.includes(normalizedRole));
}

function isUserActive() {
  return !contextSuspended && !isSigningOut && activeUser?.status === "activo";
}

function setActiveContext(context) {
  const normalizedContext = normalizeAuthContext(context);
  if (contextTask && !contextSuspended && !isSigningOut) {
    const sessionKey = authSessionKey(activeAuthSession), revision = authRevision;
    return contextTask.then(() => revision === authRevision && sessionKey === authSessionKey(activeAuthSession) ? setActiveContext(context) : false);
  }
  if (contextTask || !isUserActive() || !normalizedContext || !activeUser.roles.includes(normalizedContext)) return Promise.resolve(false);
  if (normalizedContext === activeUser.activeContext) return Promise.resolve(true);
  if (!window.navigator?.locks) {
    notifyAuthAction('Este navegador no permite sincronizar el cambio de vista de forma segura. Utiliza un navegador actualizado.', 'error');
    return Promise.resolve(false);
  }
  return runContextTask(normalizedContext);
}

function synchronizeContext() {
  if (contextTask) return contextTask;
  if (!activeAuthSession || isSigningOut) return Promise.resolve(false);
  return runContextTask(null);
}

function runContextTask(requested) {
  const session = activeAuthSession, previous = activeUser;
  if (requested) suspendContext();
  let revision = authRevision;
  const suspend = () => { if (!contextSuspended) { suspendContext(); revision = authRevision; } };
  const valid = () => revision === authRevision && authSessionKey(activeAuthSession) === authSessionKey(session) && !isSigningOut;
  const work = withContextLock(session, async () => {
    if (!valid()) return false;
    if (requested) signalContextChange(session);
    let rejected = false, confirmed;
    try {
      const auth = await getSupabaseClient().auth.getSession();
      if (!valid()) return false;
      if (auth.error || authSessionKey(auth.data?.session) !== authSessionKey(session)) throw new Error('Authentication session changed.');
      try {
        if (requested) {
          const roles = await readAuthorizedRoles(previous.id);
          if (!valid()) return false;
          if (!roles.includes(requested)) throw Object.assign(new Error('Requested role is no longer available.'), {code: '42501'});
        }
        confirmed = await confirmAppContext(session, requested);
      } catch (error) {
        if (!valid()) return false;
        rejected = true;
        // A transport error may follow a committed change. Reconcile, never repeat that change.
        try { confirmed = await confirmAppContext(session, null); }
        catch (readError) {
          if (readError?.code !== '42501' || error?.elaraStage === 'authorized-roles') throw readError;
          // A revoked current context can prevent own-role reads under RLS. Only the server
          // can authorize an alternative from assignments previously read for this account.
          suspend();
          signalContextChange(session);
          for (const candidate of previous.roles.filter(role => role !== previous.activeContext)) {
            if (!valid()) return false;
            try { confirmed = await confirmAppContext(session, candidate); break; }
            catch (fallbackError) { if (fallbackError?.code !== '42501') throw fallbackError; }
          }
          if (!confirmed) throw readError;
        }
      }
      if (!valid()) return false;
      const roles = await readAuthorizedRoles(confirmed.appUserId);
      if (!valid()) return false;
      if (!roles.includes(confirmed.activeContext)) throw new Error('Confirmed role assignments are unavailable.');
      if (!contextSuspended && confirmed.activeContext === previous.activeContext && confirmed.appUserId === previous.id) {
        activeAppSession = confirmed;
        activeUser.roles = roles;
        renderContextSwitcher();
        return !rejected;
      }
      suspend();
      activeAppSession = confirmed;
      activeUser = toSessionUser(session.user, confirmed, roles);
      // Keep the UI closed until driver identity has also been refreshed.
      await getCurrentDriverIdentity({force: true});
      if (!valid()) return false;
      contextSuspended = false;
      renderAuthState();
      emitAuthSessionUpdatedEvent('context-confirmed');
      window.ElaraRouter?.refreshNavigationForActiveContext?.();
      if (requested) notifyAuthAction(rejected ?
        `No se pudo confirmar el cambio solicitado. La vista verificada es ${getAuthContextLabel(confirmed.activeContext)}.` :
        `Ahora usas ELARA como ${getAuthContextLabel(confirmed.activeContext)}.`, rejected ? 'info' : 'success');
      return !rejected && (!requested || confirmed.activeContext === requested);
    } catch (error) {
      if (!valid()) return false;
      logAuthError('context-verification', error);
      clearAuthenticatedState();
      renderAuthState();
      authCallbacks.onLogout?.();
      showLoginError('No se pudo verificar una vista autorizada. Vuelve a iniciar sesión.');
      notifyAuthAction('El acceso se ha bloqueado hasta verificar la sesión y sus roles.', 'error');
      return false;
    } finally {
      if (requested || rejected) signalContextChange(session);
    }
  });
  const pending = work.finally(() => { if (contextTask === pending) contextTask = null; });
  contextTask = pending;
  return pending;
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
