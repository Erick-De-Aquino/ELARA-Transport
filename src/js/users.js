/*
  Proyecto Atlas / ELARA Transport
  Archivo: users.js
  Responsabilidad: renderizado y logica mock de la pantalla Usuarios.
*/

"use strict";

// =========================
// Estado local del modulo
// =========================

const USERS_STORAGE_KEY = "elara_admin_users_mock";

const userRoleLabels = {
  superadmin: "Superadmin",
  administrativo: "Administrativo",
  conductor: "Conductor",
};

const userStatusLabels = {
  activo: "Activo",
  inactivo: "Inactivo",
};

const userStatusTones = {
  activo: "success",
  inactivo: "danger",
};

const userRoleOptions = ["superadmin", "administrativo", "conductor"];
const userContextPriority = ["superadmin", "administrativo", "conductor"];
const userStatusOptions = Object.keys(userStatusLabels);

let usersState = [];
let usersActiveFilter = "todos";
let usersSearchTerm = "";
let selectedUserId = "";
let isNewUserPasswordVisible = false;

// =========================
// Inicializacion y estado de vista
// =========================

function initUsers() {
  usersState = loadUsersState();
  ensureNewUserModal();
  renderUsersPage();
  initUsersEvents();
}

function showUsers() {
  setText("page-eyebrow", "Administraci\u00f3n");
  setText("page-title", "Usuarios");
  setText("page-summary", "Gesti\u00f3n de accesos, roles y estado de cuenta.");
  setText("primary-action", "Nuevo usuario");
  configureUsersPrimaryAction();
  renderUsersPage();
}

// =========================
// Render principal
// =========================

function renderUsersPage() {
  renderUsersSummary();
  renderUsersList();
  updateUsersFilterButtons();
}

function renderUsersSummary() {
  const container = getElement("users-summary");

  if (!container) {
    return;
  }

  const summary = [
    { label: "Total usuarios", value: usersState.length, tone: "neutral" },
    { label: "Activos", value: countUsersByStatus("activo"), tone: "success" },
    { label: "Inactivos", value: countUsersByStatus("inactivo"), tone: "danger" },
    { label: "Conductores", value: countUsersByRole("conductor"), tone: "info" },
  ];

  container.innerHTML = summary
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

function renderUsersList() {
  const container = getElement("users-list");

  if (!container) {
    return;
  }

  const users = getFilteredUsers();

  if (!users.length) {
    container.innerHTML = `<p class="users-empty">No hay usuarios que coincidan con el filtro actual.</p>`;
    return;
  }

  container.innerHTML = users.map(renderUserCard).join("");
}

function renderUserCard(user) {
  const statusTone = userStatusTones[user.status] || "neutral";

  return `
    <article class="user-card user-card--${statusTone}">
      <div class="user-card__identity">
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.email)}</span>
      </div>
      <div class="user-role-pill-list" aria-label="Roles de ${escapeHtml(user.name)}">
        ${renderUserRoleChips(user.roles)}
      </div>
      <span class="user-status-pill user-status-pill--${statusTone}">${escapeHtml(getStatusLabel(user.status))}</span>
      <time>${escapeHtml(user.lastAccess || "Sin acceso registrado")}</time>
      <div class="user-card__actions">
        <button class="button button--compact button--muted" type="button" data-user-detail="${escapeHtml(user.id)}">Detalle</button>
      </div>
    </article>
  `;
}

function renderUserRoleChips(roles) {
  return normalizeUserRoles({ roles }).map((role) => `<span class="user-role-pill">${escapeHtml(getRoleLabel(role))}</span>`).join("");
}

function configureUsersPrimaryAction() {
  const primaryAction = getElement("primary-action");

  if (!primaryAction) {
    return;
  }

  if (!canCreateUsers()) {
    hidePrimaryAction();
    return;
  }

  primaryAction.hidden = false;
  primaryAction.textContent = "Nuevo usuario";
  primaryAction.dataset.usersAction = "new-user";
  primaryAction.removeAttribute("data-modal-open");
}

function canCreateUsers() {
  const currentUser =
    window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;
  const activeContext =
    window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function" ? window.ElaraAuth.getActiveContext() : currentUser?.activeContext;
  const isActive =
    window.ElaraAuth && typeof window.ElaraAuth.isUserActive === "function"
      ? window.ElaraAuth.isUserActive()
      : currentUser?.status === "activo";
  const canManage =
    window.ElaraPermissions && typeof window.ElaraPermissions.canPerformAction === "function"
      ? window.ElaraPermissions.canPerformAction(activeContext, "users.manage")
      : activeContext === "superadmin";

  return Boolean(currentUser && isActive && activeContext === "superadmin" && canManage);
}

function ensureNewUserModal() {
  if (getElement("new-user-modal")) {
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="modal-backdrop" id="new-user-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-modal-title" hidden>
        <section class="modal modal--summary modal--user-detail">
          <header class="modal__header">
            <div>
              <p class="panel__eyebrow">Usuarios</p>
              <h2 id="new-user-modal-title">Nuevo usuario</h2>
              <p>Alta mock de acceso con roles y contexto predeterminado.</p>
            </div>
            <button class="button button--compact button--muted" type="button" data-modal-close>Cerrar</button>
          </header>
          <form class="modal__body modal__body--summary user-detail-edit-form" id="new-user-form" novalidate></form>
        </section>
      </div>
    `,
  );
}

function openNewUserModal() {
  if (!canCreateUsers()) {
    notifyUsersAction("No tienes permiso para crear usuarios.", "error");
    return;
  }

  ensureNewUserModal();
  isNewUserPasswordVisible = false;
  renderNewUserForm();

  const modal = getElement("new-user-modal");

  if (modal) {
    modal.hidden = false;
  }
}

function closeNewUserModal() {
  const modal = getElement("new-user-modal");

  if (modal) {
    modal.hidden = true;
  }

  clearNewUserValidation();
}

function renderNewUserForm() {
  const form = getElement("new-user-form");
  const initialRoles = [];

  if (!form) {
    return;
  }

  form.innerHTML = `
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Nombre *</span>
        <input id="new-user-first-name" type="text" autocomplete="given-name" />
      </label>
      <label class="field">
        <span>Apellidos *</span>
        <input id="new-user-last-name" type="text" autocomplete="family-name" />
      </label>
    </div>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Email *</span>
        <input id="new-user-email" type="email" autocomplete="email" />
      </label>
      <label class="field">
        <span>Estado *</span>
        <select id="new-user-status">
          ${renderUserEditStatusOptions("activo")}
        </select>
      </label>
    </div>
    <label class="field user-password-field">
      <span>Contrase\u00f1a temporal *</span>
      <span class="user-password-field__control">
        <input id="new-user-password" type="password" autocomplete="new-password" />
        <button class="button button--compact button--muted" type="button" data-new-user-password-toggle>Mostrar</button>
      </span>
    </label>
    <div class="field user-roles-field">
      <span>Roles *</span>
      <div class="user-role-checkboxes">
        ${renderNewUserRoleCheckboxes(initialRoles)}
      </div>
    </div>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Contexto predeterminado *</span>
        <select id="new-user-default-context" disabled>
          ${renderNewUserDefaultContextOptions(initialRoles, "")}
        </select>
      </label>
      <div id="new-user-driver-field"></div>
    </div>
    <label class="field field--optional field--compact-textarea">
      <span>Nota interna</span>
      <textarea id="new-user-note" rows="3"></textarea>
    </label>
    <p class="form-error" id="new-user-form-error" hidden></p>
    <div class="service-customer-create-actions">
      <button class="button button--compact button--muted" type="button" data-modal-close>Cancelar</button>
      <button class="button button--compact" type="submit">Crear usuario</button>
    </div>
  `;
}

function renderNewUserRoleCheckboxes(roles) {
  const normalizedRoles = normalizeUserRoles({ roles }, false);

  return userRoleOptions
    .map((role) => {
      const checked = normalizedRoles.includes(role) ? " checked" : "";

      return `
        <label class="check-field user-role-checkbox">
          <input type="checkbox" value="${escapeHtml(role)}" data-new-user-role${checked} />
          <span>${escapeHtml(getRoleLabel(role))}</span>
        </label>
      `;
    })
    .join("");
}

// =========================
// Eventos
// =========================

function initUsersEvents() {
  const searchInput = getElement("users-search");
  const detailForm = getElement("user-detail-edit-form");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      usersSearchTerm = searchInput.value.trim().toLowerCase();
      renderUsersPage();
    });
  }

  if (detailForm) {
    detailForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveUserDetailEdit();
    });
  }

  document.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-users-filter]");
    const editButton = event.target.closest("#user-detail-edit-button");
    const cancelEditButton = event.target.closest("#user-detail-cancel-edit");
    const closeButton = event.target.closest("[data-modal-close]");
    const primaryAction = event.target.closest("#primary-action");
    const passwordToggle = event.target.closest("[data-new-user-password-toggle]");

    if (primaryAction && isUsersViewActive() && primaryAction.dataset.usersAction === "new-user") {
      openNewUserModal();
      return;
    }

    if (passwordToggle) {
      toggleNewUserPasswordVisibility();
      return;
    }

    if (filterButton) {
      usersActiveFilter = filterButton.dataset.usersFilter;
      renderUsersPage();
      return;
    }

    if (editButton) {
      enterUserEditMode();
      return;
    }

    if (cancelEditButton) {
      exitUserEditMode();
      return;
    }

    if (closeButton && closeButton.closest("#user-detail-modal")) {
      closeUserDetailModal();
      return;
    }

    if (closeButton && closeButton.closest("#new-user-modal")) {
      closeNewUserModal();
      return;
    }

    const detailButton = event.target.closest("[data-user-detail]");

    if (detailButton) {
      selectedUserId = detailButton.dataset.userDetail;
      openUserDetailModal(selectedUserId);
      return;
    }

  });

  document.addEventListener("change", (event) => {
    const roleCheckbox = event.target.closest("[data-user-edit-role]");
    const newUserRoleCheckbox = event.target.closest("[data-new-user-role]");
    const defaultContextSelect = event.target.closest("#user-edit-default-context");
    const newUserDefaultContextSelect = event.target.closest("#new-user-default-context");

    if (roleCheckbox) {
      handleUserEditRolesChange();
      return;
    }

    if (defaultContextSelect) {
      renderUserDriverLinkField();
      return;
    }

    if (newUserRoleCheckbox) {
      handleNewUserRolesChange();
      return;
    }

    if (newUserDefaultContextSelect) {
      renderNewUserDriverLinkField();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id === "new-user-form") {
      event.preventDefault();
      saveNewUser();
    }
  });
}

function openUserDetailModal(userId) {
  const user = usersState.find((item) => item.id === userId);

  if (!user) {
    return;
  }

  selectedUserId = userId;
  renderUserDetailView(user);
  setUserDetailMode(false);

  const modal = getElement("user-detail-modal");

  if (modal) {
    modal.hidden = false;
  }
}

function renderUserDetailView(user) {
  setText("user-detail-modal-title", user.name);
  setText("user-detail-modal-description", "Informacion de acceso, roles y contexto predeterminado.");

  const view = getElement("user-detail-view");

  if (!view) {
    return;
  }

  view.innerHTML = `
    <div class="modal__field"><dt class="modal__field-label">ID</dt><dd class="modal__field-value">${escapeHtml(user.id)}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Nombre</dt><dd class="modal__field-value">${escapeHtml(user.firstName || "-")}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Apellidos</dt><dd class="modal__field-value">${escapeHtml(user.lastName || "-")}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Email</dt><dd class="modal__field-value">${escapeHtml(user.email)}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Estado</dt><dd class="modal__field-value">${escapeHtml(getStatusLabel(user.status))}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Roles</dt><dd class="modal__field-value user-detail-role-list">${renderUserRoleChips(user.roles)}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Contexto predeterminado</dt><dd class="modal__field-value">${escapeHtml(getRoleLabel(user.defaultContext))}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Conductor vinculado</dt><dd class="modal__field-value">${escapeHtml(getUserDriverLinkLabel(user))}</dd></div>
    <div class="modal__field"><dt class="modal__field-label">Ultimo acceso / alta</dt><dd class="modal__field-value">${escapeHtml(getUserAccessLabel(user))}</dd></div>
    <div class="modal__field user-detail-modal__note"><dt class="modal__field-label">Nota interna</dt><dd class="modal__field-value">${escapeHtml(user.note || "Sin nota interna.")}</dd></div>
  `;
  return;
  setText("user-detail-modal-title", user.name);
  setText("user-detail-modal-description", "Información de acceso y estado de cuenta.");
  setText("detail-user-name", user.name);
  setText("detail-user-email", user.email);
  setText("detail-user-role", getRoleLabel(user.role));
  setText("detail-user-status", getStatusLabel(user.status));
  setText("detail-user-access", getUserAccessLabel(user));
  setText("detail-user-note", user.note || "Sin nota interna.");
}

function enterUserEditMode() {
  const user = getSelectedUser();

  if (!user) {
    return;
  }

  populateUserEditForm(user);
  clearUserEditValidation();
  setUserDetailMode(true);
}

function exitUserEditMode() {
  const user = getSelectedUser();

  clearUserEditValidation();

  if (user) {
    renderUserDetailView(user);
  }

  setUserDetailMode(false);
}

function closeUserDetailModal() {
  const modal = getElement("user-detail-modal");

  if (modal) {
    modal.hidden = true;
  }

  selectedUserId = "";
  clearUserEditValidation();
  setUserDetailMode(false);
}

function saveUserDetailEdit() {
  const user = getSelectedUser();

  if (!user) {
    notifyUsersAction("No se encontró el usuario seleccionado.", "error");
    return;
  }

  const userData = getUserEditFormData();
  const validationMessage = validateUserEditForm(userData);

  if (validationMessage) {
    notifyUsersAction(validationMessage, "error");
    return;
  }

  updateUserFromEditForm(user, userData);
  persistUsersState();
  const shouldCloseBeforeSessionReconciliation = shouldCloseUserModalBeforeOwnSessionReconciliation(user);

  if (shouldCloseBeforeSessionReconciliation) {
    closeUserDetailModal();
    closeNewUserModal();
  }

  const sessionReconciliation = reconcileCurrentUserSessionAfterEdit(user);

  if (sessionReconciliation?.signedOut) {
    return;
  }

  const canRemainInUsers = canCurrentSessionAccessUsersRoute();

  renderUsersPage();
  if (canRemainInUsers) {
    renderUserDetailView(user);
    setUserDetailMode(false);
  } else {
    closeUserDetailModal();
  }

  refreshUsersNavigationAfterSessionReconciliation(sessionReconciliation, canRemainInUsers);
  notifyUsersAction("Los cambios del usuario se guardaron correctamente.", "success");
}

function populateUserEditForm(user) {
  const editForm = getElement("user-detail-edit-form");

  if (!editForm) {
    return;
  }

  editForm.innerHTML = `
    <h3 class="modal__section-title">Datos no editables</h3>
    <dl class="modal__grid user-detail-modal__grid">
      <div class="modal__field"><dt class="modal__field-label">ID</dt><dd class="modal__field-value">${escapeHtml(user.id)}</dd></div>
      <div class="modal__field"><dt class="modal__field-label">Ultimo acceso</dt><dd class="modal__field-value">${escapeHtml(user.lastAccess || "Sin acceso registrado")}</dd></div>
      ${getUserCreatedAtLabel(user) ? `<div class="modal__field"><dt class="modal__field-label">Fecha de alta</dt><dd class="modal__field-value">${escapeHtml(getUserCreatedAtLabel(user))}</dd></div>` : ""}
    </dl>

    <h3 class="modal__section-title">Datos editables</h3>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Nombre *</span>
        <input id="user-edit-first-name" type="text" autocomplete="given-name" value="${escapeHtml(user.firstName || "")}" />
      </label>
      <label class="field">
        <span>Apellidos *</span>
        <input id="user-edit-last-name" type="text" autocomplete="family-name" value="${escapeHtml(user.lastName || "")}" />
      </label>
    </div>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Email *</span>
        <input id="user-edit-email" type="email" autocomplete="email" value="${escapeHtml(user.email)}" />
      </label>
      <label class="field">
        <span>Estado *</span>
        <select id="user-edit-status">
          ${renderUserEditStatusOptions(user.status)}
        </select>
      </label>
    </div>
    <div class="field user-roles-field">
      <span>Roles *</span>
      <div class="user-role-checkboxes">
        ${renderUserRoleCheckboxes(user.roles)}
      </div>
    </div>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Contexto predeterminado *</span>
        <select id="user-edit-default-context">
          ${renderUserDefaultContextOptions(user.roles, user.defaultContext)}
        </select>
      </label>
      <div id="user-edit-driver-field">
        ${renderUserDriverSelector(user)}
      </div>
    </div>
    <label class="field field--optional field--compact-textarea">
      <span>Nota interna</span>
      <textarea id="user-edit-note" rows="3">${escapeHtml(user.note || "")}</textarea>
    </label>
  `;
  return;
  const form = getElement("user-detail-edit-form");

  if (!form) {
    return;
  }

  form.innerHTML = `
    <h3 class="modal__section-title">Datos no editables</h3>
    <dl class="modal__grid user-detail-modal__grid">
      <div class="modal__field"><dt class="modal__field-label">Último acceso</dt><dd class="modal__field-value">${escapeHtml(user.lastAccess || "Sin acceso registrado")}</dd></div>
      ${getUserCreatedAtLabel(user) ? `<div class="modal__field"><dt class="modal__field-label">Fecha de alta</dt><dd class="modal__field-value">${escapeHtml(getUserCreatedAtLabel(user))}</dd></div>` : ""}
    </dl>

    <h3 class="modal__section-title">Datos editables</h3>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Nombre *</span>
        <input id="user-edit-name" type="text" autocomplete="name" value="${escapeHtml(user.name)}" />
      </label>
      <label class="field">
        <span>Email *</span>
        <input id="user-edit-email" type="email" autocomplete="email" value="${escapeHtml(user.email)}" />
      </label>
    </div>
    <div class="form-grid form-grid--inline-pair">
      <label class="field">
        <span>Rol *</span>
        <select id="user-edit-role">
          ${renderUserEditRoleOptions(user.role)}
        </select>
      </label>
      <label class="field">
        <span>Estado *</span>
        <select id="user-edit-status">
          ${renderUserEditStatusOptions(user.status)}
        </select>
      </label>
    </div>
    <label class="field field--optional field--compact-textarea">
      <span>Nota interna</span>
      <textarea id="user-edit-note" rows="3">${escapeHtml(user.note || "")}</textarea>
    </label>
  `;
}

function getUserEditFormData() {
  const roles = getSelectedUserEditRoles();
  const firstName = getUserInputValue("user-edit-first-name");
  const lastName = getUserInputValue("user-edit-last-name");

  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: getUserInputValue("user-edit-email").toLowerCase(),
    status: getUserInputValue("user-edit-status"),
    roles,
    defaultContext: getUserInputValue("user-edit-default-context"),
    driverId: roles.includes("conductor") ? getUserInputValue("user-edit-driver-id") : "",
    note: getUserInputValue("user-edit-note"),
  };

  return {
    name: getUserInputValue("user-edit-name"),
    email: getUserInputValue("user-edit-email"),
    role: getUserInputValue("user-edit-role"),
    status: getUserInputValue("user-edit-status"),
    note: getUserInputValue("user-edit-note"),
  };
}

function getSelectedUserEditRoles() {
  return Array.from(document.querySelectorAll("[data-user-edit-role]:checked"))
    .map((input) => normalizeUserRole(input.value))
    .filter(Boolean);
}

function getSelectedNewUserRoles() {
  return Array.from(document.querySelectorAll("[data-new-user-role]:checked"))
    .map((input) => normalizeUserRole(input.value))
    .filter(Boolean);
}

function handleNewUserRolesChange() {
  const defaultContextSelect = getElement("new-user-default-context");
  const selectedRoles = getSelectedNewUserRoles();
  const nextDefaultContext = getNewUserDefaultContextForRoles(selectedRoles, defaultContextSelect?.value);

  if (selectedRoles.length) {
    clearNewUserRolesValidationState();
  }

  if (defaultContextSelect) {
    defaultContextSelect.disabled = !selectedRoles.length;
    defaultContextSelect.innerHTML = renderNewUserDefaultContextOptions(selectedRoles, nextDefaultContext);
  }

  renderNewUserDriverLinkField();
}

function getNewUserDefaultContextForRoles(roles, currentContext) {
  const normalizedRoles = normalizeUserRoles({ roles }, false);
  const normalizedCurrentContext = normalizeUserRole(currentContext);

  if (!normalizedRoles.length) {
    return "";
  }

  if (normalizedRoles.length === 1) {
    return normalizedRoles[0];
  }

  return normalizedRoles.includes(normalizedCurrentContext) ? normalizedCurrentContext : "";
}

function renderNewUserDriverLinkField() {
  const container = getElement("new-user-driver-field");

  if (!container) {
    return;
  }

  const draftUser = {
    id: "",
    roles: getSelectedNewUserRoles(),
    driverId: getUserInputValue("new-user-driver-id"),
  };

  container.innerHTML = renderNewUserDriverSelector(draftUser);
}

function renderNewUserDriverSelector(user) {
  const roles = normalizeUserRoles(user, false);

  if (!roles.includes("conductor")) {
    return "";
  }

  const options = getAvailableDriverOptions(user);

  return `
    <label class="field">
      <span>Conductor vinculado *</span>
      <select id="new-user-driver-id">
        <option value="">Selecciona conductor</option>
        ${options
          .map((driver) => {
            const selected = driver.id === user.driverId ? " selected" : "";

            return `<option value="${escapeHtml(driver.id)}"${selected}>${escapeHtml(driver.name)} - ${escapeHtml(driver.driverType || "Colaborador")}</option>`;
          })
          .join("")}
      </select>
    </label>
  `;
}

function toggleNewUserPasswordVisibility() {
  const input = getElement("new-user-password");
  const button = document.querySelector("[data-new-user-password-toggle]");

  if (!input || !button) {
    return;
  }

  isNewUserPasswordVisible = !isNewUserPasswordVisible;
  input.type = isNewUserPasswordVisible ? "text" : "password";
  button.textContent = isNewUserPasswordVisible ? "Ocultar" : "Mostrar";
}

function getNewUserFormData() {
  const roles = getSelectedNewUserRoles();
  const firstName = getUserInputValue("new-user-first-name");
  const lastName = getUserInputValue("new-user-last-name");

  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: getUserInputValue("new-user-email").toLowerCase(),
    password: getUserInputValue("new-user-password"),
    status: getUserInputValue("new-user-status"),
    roles,
    defaultContext: getUserInputValue("new-user-default-context"),
    driverId: roles.includes("conductor") ? getUserInputValue("new-user-driver-id") : "",
    note: getUserInputValue("new-user-note"),
  };
}

function saveNewUser() {
  if (!canCreateUsers()) {
    notifyUsersAction("No tienes permiso para crear usuarios.", "error");
    return;
  }

  const userData = getNewUserFormData();
  const validationMessage = validateNewUserForm(userData);

  if (validationMessage) {
    notifyUsersAction(validationMessage, "error");
    return;
  }

  const newUser = buildNewUser(userData);

  if (!Array.isArray(window.ElaraUsersMock)) {
    window.ElaraUsersMock = [];
  }

  window.ElaraUsersMock.push(newUser);
  usersState = getCentralUsersMock().map(normalizeUser);
  renderUsersPage();
  closeNewUserModal();
  notifyUsersAction("Usuario creado correctamente.", "success");
}

function validateNewUserForm(userData) {
  clearNewUserValidation();
  const normalizedRolesForValidation = normalizeUserRoles({ roles: userData.roles }, false);
  const normalizedStatusForValidation = normalizeUserStatus(userData.status);
  const normalizedDefaultForValidation = normalizeUserRole(userData.defaultContext);

  const validationRules = [
    {
      invalid: !userData.firstName,
      fieldId: "new-user-first-name",
      message: "Introduce el nombre del usuario.",
    },
    {
      invalid: !userData.lastName,
      fieldId: "new-user-last-name",
      message: "Introduce los apellidos del usuario.",
    },
    {
      invalid: !userData.email,
      fieldId: "new-user-email",
      message: "Introduce el email del usuario.",
    },
    {
      invalid: Boolean(userData.email) && !isUserEmailValid(userData.email),
      fieldId: "new-user-email",
      message: "Introduce un email valido.",
    },
    {
      invalid: isUserEmailDuplicated(userData.email, ""),
      fieldId: "new-user-email",
      message: "Ya existe otro usuario con ese email.",
    },
    {
      invalid: !userData.password || userData.password.length < 6,
      fieldId: "new-user-password",
      message: "La contrasena temporal debe tener al menos 6 caracteres.",
    },
    {
      invalid: !normalizedRolesForValidation.length,
      fieldId: "new-user-roles",
      message: "Selecciona al menos un rol para el usuario.",
    },
    {
      invalid: !normalizedDefaultForValidation || !normalizedRolesForValidation.includes(normalizedDefaultForValidation),
      fieldId: "new-user-default-context",
      message: "Selecciona el contexto predeterminado del usuario.",
    },
    {
      invalid: !userStatusOptions.includes(normalizedStatusForValidation),
      fieldId: "new-user-status",
      message: "Selecciona un estado valido.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && !userData.driverId,
      fieldId: "new-user-driver-id",
      message: "Selecciona el conductor vinculado.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && Boolean(userData.driverId) && !getCollaboratorById(userData.driverId),
      fieldId: "new-user-driver-id",
      message: "Selecciona un conductor valido.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && isDriverIdLinkedToAnotherUser(userData.driverId, ""),
      fieldId: "new-user-driver-id",
      message: "Ese conductor ya esta vinculado a otro usuario.",
    },
  ];
  const failedRule = validationRules.find((rule) => rule.invalid);

  if (!failedRule) {
    return "";
  }

  markNewUserFieldInvalid(failedRule.fieldId);
  return failedRule.message;
}

function buildNewUser(userData) {
  const roles = normalizeUserRoles({ roles: userData.roles }, false);
  const defaultContext = normalizeUserDefaultContext({ defaultContext: userData.defaultContext }, roles);
  const createdAt = new Date().toISOString();

  return {
    id: getNextMockUserId(),
    firstName: userData.firstName,
    lastName: userData.lastName,
    name: `${userData.firstName} ${userData.lastName}`.trim(),
    email: userData.email.toLowerCase(),
    password: userData.password,
    roles,
    defaultContext,
    activeContext: defaultContext,
    role: defaultContext,
    status: normalizeUserStatus(userData.status),
    driverId: roles.includes("conductor") ? userData.driverId : null,
    protected: false,
    note: userData.note || "",
    createdAt,
    updatedAt: createdAt,
    lastAccess: "Nunca",
  };
}

function getNextMockUserId() {
  const maxSuffix = getCentralUsersMock().reduce((maxValue, user) => {
    const match = String(user.id || "").match(/^USR-(\d+)$/i);
    const numericId = match ? Number(match[1]) : 0;

    return Math.max(maxValue, numericId);
  }, 0);

  return `USR-${String(maxSuffix + 1).padStart(3, "0")}`;
}

function handleUserEditRolesChange() {
  const defaultContextSelect = getElement("user-edit-default-context");
  const selectedRoles = getSelectedUserEditRoles();
  const nextDefaultContext = normalizeUserDefaultContext({ defaultContext: defaultContextSelect?.value }, selectedRoles);

  if (defaultContextSelect) {
    defaultContextSelect.innerHTML = renderUserDefaultContextOptions(selectedRoles, nextDefaultContext);
  }

  renderUserDriverLinkField();
}

function renderUserDriverLinkField() {
  const user = getSelectedUser();
  const container = getElement("user-edit-driver-field");

  if (!user || !container) {
    return;
  }

  const currentSelectValue = getUserInputValue("user-edit-driver-id");
  const draftUser = {
    ...user,
    roles: getSelectedUserEditRoles(),
    driverId: currentSelectValue || user.driverId || "",
  };

  container.innerHTML = renderUserDriverSelector(draftUser);
}

function renderUserRoleCheckboxes(roles) {
  const normalizedRoles = normalizeUserRoles({ roles }, false);

  return userRoleOptions
    .map((role) => {
      const checked = normalizedRoles.includes(role) ? " checked" : "";

      return `
        <label class="check-field user-role-checkbox">
          <input type="checkbox" value="${escapeHtml(role)}" data-user-edit-role${checked} />
          <span>${escapeHtml(getRoleLabel(role))}</span>
        </label>
      `;
    })
    .join("");
}

function renderUserDefaultContextOptions(roles, currentContext) {
  const normalizedRoles = normalizeUserRoles({ roles }, false);
  const defaultContext = normalizeUserDefaultContext({ defaultContext: currentContext }, normalizedRoles);

  return normalizedRoles
    .map((role) => {
      const selected = role === defaultContext ? " selected" : "";

      return `<option value="${escapeHtml(role)}"${selected}>${escapeHtml(getRoleLabel(role))}</option>`;
    })
    .join("");
}

function renderNewUserDefaultContextOptions(roles, currentContext) {
  const normalizedRoles = normalizeUserRoles({ roles }, false);
  const selectedContext = getNewUserDefaultContextForRoles(normalizedRoles, currentContext);

  if (!normalizedRoles.length) {
    return `<option value="">Selecciona roles primero</option>`;
  }

  return [
    `<option value="">Selecciona contexto</option>`,
    ...normalizedRoles.map((role) => {
      const selected = role === selectedContext ? " selected" : "";

      return `<option value="${escapeHtml(role)}"${selected}>${escapeHtml(getRoleLabel(role))}</option>`;
    }),
  ].join("");
}

function renderUserDriverSelector(user) {
  const roles = normalizeUserRoles(user, false);

  if (!roles.includes("conductor")) {
    return "";
  }

  const options = getAvailableDriverOptions(user);

  return `
    <label class="field">
      <span>Conductor vinculado *</span>
      <select id="user-edit-driver-id">
        <option value="">Selecciona conductor</option>
        ${options
          .map((driver) => {
            const selected = driver.id === user.driverId ? " selected" : "";

            return `<option value="${escapeHtml(driver.id)}"${selected}>${escapeHtml(driver.name)} - ${escapeHtml(driver.driverType || "Colaborador")}</option>`;
          })
          .join("")}
      </select>
    </label>
  `;
}

function getAvailableDriverOptions(user) {
  const linkedDriverIds = new Set(
    usersState
      .filter((item) => item.id !== user.id && normalizeUserRoles(item).includes("conductor") && item.driverId)
      .map((item) => item.driverId),
  );

  return (window.ElaraCollaboratorsMock?.collaborators || []).filter(
    (collaborator) => collaborator.id === user.driverId || !linkedDriverIds.has(collaborator.id),
  );
}

function getUserDriverLinkLabel(user) {
  if (!normalizeUserRoles(user).includes("conductor")) {
    return "No aplica";
  }

  const collaborator = getCollaboratorById(user.driverId);

  if (!collaborator) {
    return "No indicado";
  }

  return `${collaborator.name} (${collaborator.driverType || "Colaborador"})`;
}

function getCollaboratorById(driverId) {
  if (!driverId) {
    return null;
  }

  return (window.ElaraCollaboratorsMock?.collaborators || []).find((collaborator) => collaborator.id === driverId) || null;
}

function validateUserEditForm(userData) {
  clearUserEditValidation();
  const selectedUser = getSelectedUser();
  const normalizedRolesForValidation = normalizeUserRoles({ roles: userData.roles }, false);
  const normalizedStatusForValidation = normalizeUserStatus(userData.status);
  const normalizedDefaultForValidation = normalizeUserRole(userData.defaultContext);

  const multiRoleValidationRules = [
    {
      invalid: !userData.firstName,
      fieldId: "user-edit-first-name",
      message: "Introduce el nombre del usuario.",
    },
    {
      invalid: !userData.lastName,
      fieldId: "user-edit-last-name",
      message: "Introduce los apellidos del usuario.",
    },
    {
      invalid: !userData.email,
      fieldId: "user-edit-email",
      message: "Introduce el email del usuario.",
    },
    {
      invalid: Boolean(userData.email) && !isUserEmailValid(userData.email),
      fieldId: "user-edit-email",
      message: "Introduce un email valido.",
    },
    {
      invalid: isUserEmailDuplicated(userData.email, selectedUser?.id),
      fieldId: "user-edit-email",
      message: "Ya existe otro usuario con ese email.",
    },
    {
      invalid: !normalizedRolesForValidation.length,
      fieldId: "user-edit-roles",
      message: "Selecciona al menos un rol.",
    },
    {
      invalid: !normalizedDefaultForValidation || !normalizedRolesForValidation.includes(normalizedDefaultForValidation),
      fieldId: "user-edit-default-context",
      message: "El contexto predeterminado debe pertenecer a los roles seleccionados.",
    },
    {
      invalid: !userStatusOptions.includes(normalizedStatusForValidation),
      fieldId: "user-edit-status",
      message: "Selecciona un estado valido.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && !userData.driverId,
      fieldId: "user-edit-driver-id",
      message: "Selecciona el conductor vinculado.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && Boolean(userData.driverId) && !getCollaboratorById(userData.driverId),
      fieldId: "user-edit-driver-id",
      message: "Selecciona un conductor valido.",
    },
    {
      invalid: normalizedRolesForValidation.includes("conductor") && isDriverIdLinkedToAnotherUser(userData.driverId, selectedUser?.id),
      fieldId: "user-edit-driver-id",
      message: "Ese conductor ya esta vinculado a otro usuario.",
    },
    {
      invalid: wouldLeaveNoActiveSuperadmin(selectedUser, {
        ...userData,
        roles: normalizedRolesForValidation,
        status: normalizedStatusForValidation,
      }),
      fieldId: normalizedRolesForValidation.includes("superadmin") ? "user-edit-status" : "user-edit-roles",
      message: "Debe existir al menos un Superadmin activo.",
    },
  ];

  const failedMultiRoleRule = multiRoleValidationRules.find((rule) => rule.invalid);

  if (!failedMultiRoleRule) {
    return "";
  }

  markUserEditFieldInvalid(failedMultiRoleRule.fieldId);
  return failedMultiRoleRule.message;

  const validationRules = [
    {
      invalid: !userData.name,
      fieldId: "user-edit-name",
      message: "Introduce el nombre del usuario.",
    },
    {
      invalid: !userData.email,
      fieldId: "user-edit-email",
      message: "Introduce el email del usuario.",
    },
    {
      invalid: Boolean(userData.email) && !isUserEmailValid(userData.email),
      fieldId: "user-edit-email",
      message: "Introduce un email válido.",
    },
    {
      invalid: !userRoleOptions.includes(userData.role),
      fieldId: "user-edit-role",
      message: "Selecciona un rol válido.",
    },
    {
      invalid: !userStatusOptions.includes(userData.status),
      fieldId: "user-edit-status",
      message: "Selecciona un estado válido.",
    },
  ];
  const failedRule = validationRules.find((rule) => rule.invalid);

  if (!failedRule) {
    return "";
  }

  markUserEditFieldInvalid(failedRule.fieldId);
  return failedRule.message;
}

function updateUserFromEditForm(user, userData) {
  const roles = normalizeUserRoles({ roles: userData.roles }, false);
  const defaultContext = normalizeUserDefaultContext({ defaultContext: userData.defaultContext }, roles);
  const nextStatus = normalizeUserStatus(userData.status);

  user.firstName = userData.firstName;
  user.lastName = userData.lastName;
  user.name = `${userData.firstName} ${userData.lastName}`.trim();
  user.email = userData.email.toLowerCase();
  user.roles = roles;
  user.defaultContext = defaultContext;
  user.role = defaultContext;
  user.status = nextStatus;
  user.driverId = roles.includes("conductor") ? userData.driverId : null;
  user.note = userData.note;
  user.updatedAt = new Date().toISOString();
  syncCurrentSessionVisibleUser(user);
  return;

  user.name = userData.name;
  user.email = userData.email;
  user.role = userData.role;
  user.status = userData.status;
  user.note = userData.note;
}

function setUserDetailMode(isEditing) {
  const view = getElement("user-detail-view");
  const form = getElement("user-detail-edit-form");
  const viewActions = getElement("user-detail-view-actions");
  const editActions = getElement("user-detail-edit-actions");

  if (view) {
    view.hidden = isEditing;
  }

  if (form) {
    form.hidden = !isEditing;
  }

  if (viewActions) {
    viewActions.hidden = isEditing;
  }

  if (editActions) {
    editActions.hidden = !isEditing;
  }

  if (isEditing) {
    setText("user-detail-modal-title", "Editar usuario");
    setText("user-detail-modal-description", "Actualiza los datos propios del usuario.");
  }
}

function toggleUserStatus(userId) {
  const user = usersState.find((item) => item.id === userId);

  if (!user) {
    return;
  }

  if (user.status === "inactivo") {
    user.status = "activo";
    notifyUsersAction("Usuario activado.", "success");
  } else {
    if (wouldLeaveNoActiveSuperadmin(user, { roles: normalizeUserRoles(user), status: "inactivo" })) {
      notifyUsersAction("Debe existir al menos un Superadmin activo.", "error");
      return;
    }

    user.status = "inactivo";
    notifyUsersAction("Usuario inactivado.", "warning");
  }

  user.updatedAt = new Date().toISOString();
  persistUsersState();
  renderUsersPage();
}

function notifyUsersAction(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

// =========================
// Datos y filtros
// =========================

function loadUsersState() {
  try {
    localStorage.removeItem(USERS_STORAGE_KEY);
  } catch (error) {
    // La clave legacy no debe bloquear la carga desde el mock central.
  }

  return getCentralUsersMock().map(normalizeUser);
}

function persistUsersState() {
  syncUsersStateToCentralMock();
}

function getCentralUsersMock() {
  return Array.isArray(window.ElaraUsersMock) ? window.ElaraUsersMock : [];
}

function syncUsersStateToCentralMock() {
  const centralUsers = getCentralUsersMock();
  const centralUsersById = new Map(centralUsers.map((user) => [user.id, user]));

  window.ElaraUsersMock = usersState.map((user) => ({
    ...(centralUsersById.get(user.id) || {}),
    ...user,
  }));
}

function normalizeUser(user) {
  const roles = normalizeUserRoles(user);
  const defaultContext = normalizeUserDefaultContext(user, roles);
  const firstName = String(user.firstName || "").trim() || getNamePart(user.name, 0);
  const lastName = String(user.lastName || "").trim() || getNamePart(user.name, 1);
  const name = `${firstName} ${lastName}`.trim() || String(user.name || "").trim();

  return {
    ...user,
    id: user.id,
    firstName,
    lastName,
    name,
    email: String(user.email || "").trim().toLowerCase(),
    roles,
    defaultContext,
    activeContext: normalizeUserDefaultContext({ defaultContext: user.activeContext || defaultContext }, roles),
    role: defaultContext,
    status: normalizeUserStatus(user.status),
    lastAccess: user.lastAccess || "Sin acceso registrado",
    createdAt: user.createdAt || user.created || user.registrationDate || "",
    updatedAt: user.updatedAt || "",
    protected: Boolean(user.protected || user.id === "USR-001" || user.id === "usr_001"),
    driverId: roles.includes("conductor") ? String(user.driverId || "").trim() : null,
    note: user.note || "",
  };

  return {
    ...user,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status || "activo",
    lastAccess: user.lastAccess || "Sin acceso registrado",
    createdAt: user.createdAt || user.created || user.registrationDate || "",
    protected: Boolean(user.protected || user.id === "usr_001"),
    note: user.note || "",
  };
}

function normalizeUserRoles(user, useFallback = true) {
  const sourceRoles = Array.isArray(user?.roles) ? user.roles : [user?.role];
  const roles = sourceRoles
    .map(normalizeUserRole)
    .filter(Boolean)
    .filter((role, index, self) => self.indexOf(role) === index);

  return roles.length || !useFallback ? roles : ["conductor"];
}

function normalizeUserRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  return userRoleOptions.includes(normalizedRole) ? normalizedRole : "";
}

function normalizeUserDefaultContext(user, roles) {
  const normalizedRoles = Array.isArray(roles) ? roles : normalizeUserRoles(user);
  const defaultContext = normalizeUserRole(user?.defaultContext);

  if (!normalizedRoles.length) {
    return "";
  }

  if (normalizedRoles.includes(defaultContext)) {
    return defaultContext;
  }

  return userContextPriority.find((context) => normalizedRoles.includes(context)) || normalizedRoles[0] || "";
}

function normalizeUserStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  return userStatusOptions.includes(normalizedStatus) ? normalizedStatus : "inactivo";
}

function getNamePart(name, index) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "";
  }

  return index === 0 ? parts[0] : parts.slice(1).join(" ");
}

function normalizeUserSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isUserEmailDuplicated(email, currentUserId) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  return usersState.some((user) => user.id !== currentUserId && user.email === normalizedEmail);
}

function isDriverIdLinkedToAnotherUser(driverId, currentUserId) {
  if (!driverId) {
    return false;
  }

  return usersState.some(
    (user) => user.id !== currentUserId && normalizeUserRoles(user).includes("conductor") && user.driverId === driverId,
  );
}

function wouldLeaveNoActiveSuperadmin(currentUser, draftData) {
  return !usersState.some((user) => {
    const isCurrentUser = user.id === currentUser?.id;
    const roles = isCurrentUser ? draftData.roles : normalizeUserRoles(user);
    const status = isCurrentUser ? draftData.status : user.status;

    return status === "activo" && roles.includes("superadmin");
  });
}

function getFilteredUsers() {
  const normalizedSearchTerm = normalizeUserSearchText(usersSearchTerm);

  return usersState.filter((user) => {
    const matchesFilter = matchesUsersFilter(user);
    const searchableText = normalizeUserSearchText(
      `${user.name} ${user.firstName} ${user.lastName} ${user.email} ${user.roles.join(" ")} ${getUserDriverLinkLabel(user)}`,
    );
    const matchesSearch = !normalizedSearchTerm || searchableText.includes(normalizedSearchTerm);

    return matchesFilter && matchesSearch;
  });
}

function matchesUsersFilter(user) {
  if (usersActiveFilter === "todos") {
    return true;
  }

  if (userRoleOptions.includes(usersActiveFilter)) {
    return normalizeUserRoles(user).includes(usersActiveFilter);
  }

  if (userStatusOptions.includes(usersActiveFilter)) {
    return user.status === usersActiveFilter;
  }

  return false;
}

function countUsersByStatus(status) {
  return usersState.filter((user) => user.status === status).length;
}

function countUsersByRole(role) {
  return usersState.filter((user) => normalizeUserRoles(user).includes(role)).length;
}

function updateUsersFilterButtons() {
  document.querySelectorAll("[data-users-filter]").forEach((button) => {
    button.classList.toggle("users-filter-button--active", button.dataset.usersFilter === usersActiveFilter);
  });
}

function getRoleLabel(role) {
  return userRoleLabels[normalizeUserRole(role)] || role;
}

function getStatusLabel(status) {
  return userStatusLabels[normalizeUserStatus(status)] || status;
}

function getSelectedUser() {
  return usersState.find((item) => item.id === selectedUserId) || null;
}

function getUserAccessLabel(user) {
  const lastAccess = user.lastAccess || "Sin acceso registrado";
  const createdAt = getUserCreatedAtLabel(user);

  return createdAt ? `${lastAccess} · Alta ${createdAt}` : lastAccess;
}

function getUserCreatedAtLabel(user) {
  return formatUserDate(user.createdAt);
}

function formatUserDate(value) {
  if (!value) {
    return "Sin informaci\u00f3n";
  }

  const isoDateMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = isoDateMatch
    ? new Date(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin informaci\u00f3n";
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function renderUserEditRoleOptions(currentRole) {
  return userRoleOptions
    .map((role) => {
      const selected = role === currentRole ? " selected" : "";

      return `<option value="${escapeHtml(role)}"${selected}>${escapeHtml(getRoleLabel(role))}</option>`;
    })
    .join("");
}

function renderUserEditStatusOptions(currentStatus) {
  return userStatusOptions
    .map((status) => {
      const selected = status === currentStatus ? " selected" : "";

      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(getStatusLabel(status))}</option>`;
    })
    .join("");
}

function getUserInputValue(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}

function clearUserEditValidation() {
  const form = getElement("user-detail-edit-form");

  if (!form) {
    return;
  }

  form.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });
}

function clearNewUserValidation() {
  const form = getElement("new-user-form");
  const error = getElement("new-user-form-error");

  if (!form) {
    return;
  }

  form.querySelectorAll(".field--invalid").forEach((field) => {
    field.classList.remove("field--invalid");
  });

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function clearNewUserRolesValidationState() {
  const rolesField = document.querySelector("#new-user-form .user-roles-field");

  if (rolesField) {
    rolesField.classList.remove("field--invalid");
  }

  updateNewUserGeneralValidationMessage();
}

function updateNewUserGeneralValidationMessage() {
  const form = getElement("new-user-form");
  const error = getElement("new-user-form-error");

  if (!form || !error) {
    return;
  }

  const hasInvalidFields = Boolean(form.querySelector(".field--invalid"));

  if (!hasInvalidFields) {
    error.textContent = "";
    error.hidden = true;
  }
}

function markUserEditFieldInvalid(fieldId) {
  if (fieldId === "user-edit-roles") {
    const rolesField = document.querySelector(".user-roles-field");

    if (rolesField) {
      rolesField.classList.add("field--invalid");
    }

    return;
  }

  const field = getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }
}

function markNewUserFieldInvalid(fieldId) {
  const error = getElement("new-user-form-error");
  const field =
    fieldId === "new-user-roles" ? document.querySelector("#new-user-form .user-roles-field") : getElement(fieldId)?.closest(".field");

  if (field) {
    field.classList.add("field--invalid");
  }

  if (error) {
    error.textContent = "Revisa los campos marcados antes de continuar.";
    error.hidden = false;
  }

  if (fieldId === "new-user-roles") {
    document.querySelector("[data-new-user-role]")?.focus();
    return;
  }

  getElement(fieldId)?.focus();
}

function isUserEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function syncCurrentSessionVisibleUser(user) {
  const currentUser =
    window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;

  if (!currentUser || currentUser.id !== user.id) {
    return;
  }

  setText("session-user-name", user.name);
}

function reconcileCurrentUserSessionAfterEdit(user) {
  if (!window.ElaraAuth || typeof window.ElaraAuth.reconcileCurrentSessionWithUser !== "function") {
    syncCurrentSessionVisibleUser(user);
    return {
      applied: false,
      signedOut: false,
    };
  }

  return window.ElaraAuth.reconcileCurrentSessionWithUser(user);
}

function shouldCloseUserModalBeforeOwnSessionReconciliation(user) {
  const currentUser =
    window.ElaraAuth && typeof window.ElaraAuth.getCurrentUser === "function" ? window.ElaraAuth.getCurrentUser() : null;

  if (!currentUser || String(currentUser.id || "") !== String(user?.id || "")) {
    return false;
  }

  return normalizeUserStatus(user.status) !== "activo" || !normalizeUserRoles(user, false).length;
}

function refreshUsersNavigationAfterSessionReconciliation(reconciliation, canRemainInUsers = true) {
  if (!reconciliation?.applied || !window.ElaraRouter) {
    return;
  }

  if (!canRemainInUsers && typeof window.ElaraRouter.refreshNavigationForActiveContext === "function") {
    window.ElaraRouter.refreshNavigationForActiveContext();
    return;
  }

  if (typeof window.ElaraRouter.renderNavigationForCurrentContext === "function") {
    window.ElaraRouter.renderNavigationForCurrentContext();
  }

  if (typeof window.ElaraRouter.showCurrentRoute === "function") {
    window.ElaraRouter.showCurrentRoute();
  }
}

function canCurrentSessionAccessUsersRoute() {
  if (!window.ElaraAuth || !window.ElaraPermissions) {
    return true;
  }

  const context =
    typeof window.ElaraAuth.getActiveContext === "function"
      ? window.ElaraAuth.getActiveContext()
      : window.ElaraAuth.getCurrentUser()?.activeContext;

  return typeof window.ElaraPermissions.canAccessRoute === "function"
    ? window.ElaraPermissions.canAccessRoute(context, "usuarios")
    : true;
}

// =========================
// Utilidades internas
// =========================

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function hidePrimaryAction() {
  const primaryAction = getElement("primary-action");

  if (!primaryAction) {
    return;
  }

  primaryAction.hidden = true;
  primaryAction.removeAttribute("data-modal-open");
  primaryAction.removeAttribute("data-users-action");
}

function isUsersViewActive() {
  const usersView = getElement("usuarios");

  return Boolean(usersView && !usersView.hidden);
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

window.ElaraUsers = {
  initUsers,
  showUsers,
};
