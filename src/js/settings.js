/*
  Proyecto Atlas / ELARA Transport
  Archivo: settings.js
  Responsabilidad: renderizado y acciones demo de la pantalla Configuracion.
*/

"use strict";

// =========================
// Estado en memoria
// =========================

const settingsManagedCards = {
  company: {
    eyebrow: "Empresa",
    title: "Datos generales",
    note: "Estos datos se usar\u00e1n en comunicaciones, reservas y comprobantes.",
    toast: "Datos de empresa actualizados.",
    fields: [
      { key: "commercialName", label: "Nombre comercial", type: "text" },
      { key: "operationalEmail", label: "Email operativo", type: "email" },
      { key: "operationalPhone", label: "Tel\u00e9fono operativo", type: "tel" },
      { key: "baseCity", label: "Ciudad base", type: "text" },
      { key: "country", label: "Pa\u00eds", type: "text" },
    ],
  },
  operation: {
    eyebrow: "Operaci\u00f3n",
    title: "Preferencias generales",
    note: "Estos par\u00e1metros orientan reservas, dashboard, alertas y reglas operativas.",
    toast: "Preferencias operativas actualizadas.",
    fields: [
      { key: "currency", label: "Moneda", type: "select", options: [{ value: "EUR", label: "EUR" }] },
      { key: "timezone", label: "Zona horaria", type: "select", options: [{ value: "Europe/Madrid", label: "Europe/Madrid" }] },
      { key: "language", label: "Idioma principal", type: "select", options: [{ value: "Espa\u00f1ol", label: "Espa\u00f1ol" }] },
      { key: "minLeadTime", label: "Tiempo m\u00ednimo antes de servicio", type: "number", suffix: " horas", min: "0" },
      { key: "alertMargin", label: "Margen de alerta de servicio pr\u00f3ximo", type: "number", suffix: " minutos", min: "0" },
    ],
  },
  notifications: {
    eyebrow: "Notificaciones",
    title: "Comunicaciones",
    note: "Las integraciones de comunicaci\u00f3n a\u00fan no ejecutan env\u00edos reales.",
    toast: "Preferencias de notificaci\u00f3n actualizadas.",
    fields: [
      {
        key: "clientEmail",
        label: "Notificar al cliente por email",
        type: "select",
        options: [
          { value: "activo", label: "Activo" },
          { value: "inactivo", label: "Inactivo" },
        ],
      },
      {
        key: "driverEmail",
        label: "Notificar al colaborador por email",
        type: "select",
        options: [
          { value: "activo", label: "Activo" },
          { value: "inactivo", label: "Inactivo" },
        ],
      },
      {
        key: "adminInternal",
        label: "Notificaciones internas admin",
        type: "select",
        options: [
          { value: "activo", label: "Activo" },
          { value: "inactivo", label: "Inactivo" },
        ],
      },
    ],
  },
};

const settingsReadonlyCards = [
  {
    eyebrow: "Seguridad y acceso",
    title: "Reglas generales",
    badge: { label: "Solo lectura", tone: "success" },
    type: "check",
    items: [
      "Solo superadmin puede cambiar roles.",
      "Administrativo no accede a Usuarios ni Configuraci\u00f3n.",
      "Superadmin principal protegido.",
      "Los cambios de configuraci\u00f3n requieren perfil superadmin.",
    ],
  },
  {
    eyebrow: "Integraciones futuras",
    title: "Estado informativo",
    badge: { label: "No conectado", tone: "neutral" },
    type: "integrations",
    wide: true,
    items: [
      { name: "Supabase", status: "Pr\u00f3xima fase", tone: "warning" },
      { name: "Pasarela de pago", status: "No conectado", tone: "neutral" },
      { name: "WhatsApp API", status: "Preparado", tone: "info" },
      { name: "Seguimiento de vuelos", status: "No conectado", tone: "neutral" },
      { name: "Historial general", status: "Pr\u00f3xima fase", tone: "warning" },
    ],
  },
];

let settingsState = {
  company: {
    commercialName: "ELARA Transport",
    operationalEmail: "operaciones@elara.test",
    operationalPhone: "+34 600 000 000",
    baseCity: "Valencia",
    country: "Espa\u00f1a",
  },
  operation: {
    currency: "EUR",
    timezone: "Europe/Madrid",
    language: "Espa\u00f1ol",
    minLeadTime: "2",
    alertMargin: "60",
  },
  notifications: {
    clientEmail: "activo",
    driverEmail: "activo",
    adminInternal: "activo",
    whatsapp: "Futura integraci\u00f3n",
  },
};

let activeSettingsCard = "";
let settingsEventsInitialized = false;

// =========================
// Inicializacion
// =========================

function initSettings() {
  initSettingsEvents();
  renderSettingsCards();
}

function showSettings() {
  settingsSetText("page-eyebrow", "Administraci\u00f3n");
  settingsSetText("page-title", "Configuraci\u00f3n");
  settingsSetText("page-summary", "Par\u00e1metros generales del sistema ELARA.");
  hideSettingsPrimaryAction();
  renderSettingsCards();
}

function initSettingsEvents() {
  if (settingsEventsInitialized) {
    return;
  }

  const grid = getSettingsElement("settings-grid");

  if (!grid) {
    return;
  }

  grid.addEventListener("click", handleSettingsClick);
  grid.addEventListener("submit", handleSettingsSubmit);
  settingsEventsInitialized = true;
}

// =========================
// Render
// =========================

function renderSettingsCards() {
  const grid = getSettingsElement("settings-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = `
    ${Object.keys(settingsManagedCards).map(renderManagedSettingsCard).join("")}
    ${settingsReadonlyCards.map(renderReadonlySettingsCard).join("")}
  `;
}

function renderManagedSettingsCard(cardKey) {
  const card = settingsManagedCards[cardKey];
  const isEditing = activeSettingsCard === cardKey;
  const body = isEditing ? renderSettingsForm(cardKey, card) : renderSettingsValues(cardKey, card);

  return `
    <article class="panel settings-card" data-settings-card="${escapeHtml(cardKey)}">
      <div class="panel__header settings-card__header">
        <div>
          <p class="panel__eyebrow">${escapeHtml(card.eyebrow)}</p>
          <h2>${escapeHtml(card.title)}</h2>
        </div>
        ${renderSettingsActions(cardKey, isEditing)}
      </div>
      ${body}
      <p class="settings-note">${escapeHtml(card.note)}</p>
    </article>
  `;
}

function renderSettingsActions(cardKey, isEditing) {
  if (isEditing) {
    return `
      <div class="settings-card__actions">
        <button class="button button--primary button--compact" type="submit" form="settings-form-${escapeHtml(cardKey)}">Guardar</button>
        <button class="button button--compact button--muted" type="button" data-settings-cancel="${escapeHtml(cardKey)}">Cancelar</button>
      </div>
    `;
  }

  return `
    <div class="settings-card__actions">
      <button class="button button--compact button--muted" type="button" data-settings-edit="${escapeHtml(cardKey)}">Editar</button>
    </div>
  `;
}

function renderSettingsValues(cardKey, card) {
  const items = card.fields
    .map((field) => renderSettingsValueItem(cardKey, field))
    .join("");
  const whatsappItem =
    cardKey === "notifications"
      ? `<div><dt>WhatsApp:</dt><dd>${renderSettingsStatus(settingsState.notifications.whatsapp, "neutral")}</dd></div>`
      : "";

  return `<dl class="settings-read-list">${items}${whatsappItem}</dl>`;
}

function renderSettingsValueItem(cardKey, field) {
  const value = getSettingsDisplayValue(cardKey, field);

  if (cardKey === "notifications") {
    const tone = settingsState[cardKey][field.key] === "activo" ? "success" : "neutral";

    return `<div><dt>${escapeHtml(field.label)}:</dt><dd>${renderSettingsStatus(value, tone)}</dd></div>`;
  }

  return `<div><dt>${escapeHtml(field.label)}:</dt><dd>${renderSettingsReadValue(cardKey, field, value)}</dd></div>`;
}

function renderSettingsReadValue(cardKey, field, value) {
  if (cardKey === "company" && field.key === "operationalEmail") {
    return `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }

  return escapeHtml(value);
}

function renderSettingsForm(cardKey, card) {
  const whatsappControl =
    cardKey === "notifications"
      ? `
        <div class="settings-form-static">
          <span>WhatsApp</span>
          <strong>Futura integraci&oacute;n</strong>
        </div>
      `
      : "";

  return `
    <form class="settings-form" id="settings-form-${escapeHtml(cardKey)}" data-settings-form="${escapeHtml(cardKey)}">
      ${card.fields.map((field) => renderSettingsControl(cardKey, field)).join("")}
      ${whatsappControl}
    </form>
  `;
}

function renderSettingsControl(cardKey, field) {
  const value = settingsState[cardKey][field.key];

  if (field.type === "select") {
    return `
      <label class="field settings-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${escapeHtml(field.key)}">
          ${field.options
            .map(
              (option) => `
                <option value="${escapeHtml(option.value)}"${option.value === value ? " selected" : ""}>${escapeHtml(option.label)}</option>
              `,
            )
            .join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="field settings-field">
      <span>${escapeHtml(field.label)}</span>
      <input name="${escapeHtml(field.key)}" type="${escapeHtml(field.type)}" value="${escapeHtml(value)}"${field.min ? ` min="${escapeHtml(field.min)}"` : ""} />
    </label>
  `;
}

function renderReadonlySettingsCard(card) {
  const modifier = card.wide ? " settings-card--wide" : "";
  const body = card.type === "integrations" ? renderSettingsIntegrations(card.items) : renderSettingsCheckList(card.items);

  return `
    <article class="panel settings-card${modifier}">
      <div class="panel__header settings-card__header">
        <div>
          <p class="panel__eyebrow">${escapeHtml(card.eyebrow)}</p>
          <h2>${escapeHtml(card.title)}</h2>
        </div>
        <span class="status-pill status--${escapeHtml(card.badge.tone)}">${escapeHtml(card.badge.label)}</span>
      </div>
      ${body}
    </article>
  `;
}

function renderSettingsCheckList(items) {
  return `
    <ul class="settings-check-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderSettingsIntegrations(items) {
  return `
    <div class="settings-integration-grid">
      ${items
        .map(
          (item) => `
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              ${renderSettingsStatus(item.status, item.tone)}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSettingsStatus(label, tone) {
  return `<strong class="status-pill status--${escapeHtml(tone)}">${escapeHtml(label)}</strong>`;
}

// =========================
// Eventos y acciones
// =========================

function handleSettingsClick(event) {
  const editButton = event.target.closest("[data-settings-edit]");

  if (editButton) {
    editSettingsCard(editButton.dataset.settingsEdit);
    return;
  }

  const cancelButton = event.target.closest("[data-settings-cancel]");

  if (cancelButton) {
    cancelSettingsEdit(cancelButton.dataset.settingsCancel);
  }
}

function handleSettingsSubmit(event) {
  const form = event.target.closest("[data-settings-form]");

  if (!form) {
    return;
  }

  event.preventDefault();
  saveSettingsCard(form.dataset.settingsForm, form);
}

function editSettingsCard(cardKey) {
  if (!settingsManagedCards[cardKey]) {
    return;
  }

  if (activeSettingsCard && activeSettingsCard !== cardKey) {
    notifySettings("Termina o cancela la edici\u00f3n actual antes de continuar.", "warning");
    return;
  }

  activeSettingsCard = cardKey;
  renderSettingsCards();
}

function cancelSettingsEdit(cardKey) {
  if (activeSettingsCard === cardKey) {
    activeSettingsCard = "";
    renderSettingsCards();
  }
}

function saveSettingsCard(cardKey, form) {
  const card = settingsManagedCards[cardKey];

  if (!card) {
    return;
  }

  const formData = new FormData(form);
  const nextValues = {};

  card.fields.forEach((field) => {
    nextValues[field.key] = String(formData.get(field.key) || "").trim();
  });

  settingsState = {
    ...settingsState,
    [cardKey]: {
      ...settingsState[cardKey],
      ...nextValues,
    },
  };
  activeSettingsCard = "";
  renderSettingsCards();
  notifySettings(card.toast, "success");
}

// =========================
// Utilidades internas
// =========================

function getSettingsDisplayValue(cardKey, field) {
  const value = settingsState[cardKey][field.key];

  if (field.options) {
    const option = field.options.find((item) => item.value === value);
    return option ? option.label : value;
  }

  return `${value}${field.suffix || ""}`;
}

function notifySettings(message, type = "info") {
  if (window.ElaraNotifications && typeof window.ElaraNotifications.showToast === "function") {
    window.ElaraNotifications.showToast(message, type);
  } else if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
}

function getSettingsElement(id) {
  return document.getElementById(id);
}

function settingsSetText(id, value) {
  const element = getSettingsElement(id);

  if (element) {
    element.textContent = value;
  }
}

function hideSettingsPrimaryAction() {
  const primaryAction = getSettingsElement("primary-action");

  if (!primaryAction) {
    return;
  }

  primaryAction.hidden = true;
  primaryAction.removeAttribute("data-modal-open");
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

window.ElaraSettings = {
  initSettings,
  showSettings,
};
