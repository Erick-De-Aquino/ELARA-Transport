/*
  Proyecto Atlas / ELARA Transport
  Archivo: notifications.js
  Responsabilidad: notificaciones visuales globales de la aplicacion.
*/

"use strict";

const ELARA_TOAST_VISIBLE_TIME = 3200;
const ELARA_TOAST_TYPES = ["success", "info", "warning", "error"];

function showToast(message, type = "info") {
  const toast = document.getElementById("app-toast");

  if (!toast) {
    return;
  }

  const toastType = ELARA_TOAST_TYPES.includes(type) ? type : "info";

  toast.textContent = message;
  toast.className = `app-toast app-toast--${toastType} app-toast--visible`;
  toast.hidden = false;

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("app-toast--visible");
    toast.hidden = true;
  }, ELARA_TOAST_VISIBLE_TIME);
}

window.ElaraNotifications = {
  showToast,
};

window.showToast = showToast;
