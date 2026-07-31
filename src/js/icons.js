/*
  Proyecto Atlas / ELARA Transport
  Archivo: icons.js
  Responsabilidad: iconos operativos reutilizables de la aplicacion.
*/

(function () {
  "use strict";

  function fontAwesomeIcon(className) {
    return `<i class="${className}" aria-hidden="true"></i>`;
  }

  const icons = {
    origin: fontAwesomeIcon("fa-solid fa-circle-dot"),
    stop: fontAwesomeIcon("fa-solid fa-circle"),
    destination: fontAwesomeIcon("fa-solid fa-location-dot"),
    copy: fontAwesomeIcon("fa-regular fa-copy"),
    phone: fontAwesomeIcon("fa-solid fa-phone"),
    waze: fontAwesomeIcon("fa-brands fa-waze"),
    delete: fontAwesomeIcon("fa-regular fa-trash-can"),
    edit: fontAwesomeIcon("fa-regular fa-pen-to-square"),
    route: fontAwesomeIcon("fa-solid fa-route"),
    ratingGood: `
      <svg class="driver-rating-face driver-rating-face--good" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="28"></circle>
        <circle class="driver-rating-face__eye" cx="23" cy="25" r="3.5"></circle>
        <circle class="driver-rating-face__eye" cx="41" cy="25" r="3.5"></circle>
        <path class="driver-rating-face__mouth" d="M21 38c3.1 5 6.9 7.4 11 7.4S39.9 43 43 38"></path>
      </svg>
    `,
    ratingNeutral: `
      <svg class="driver-rating-face driver-rating-face--neutral" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="28"></circle>
        <circle class="driver-rating-face__eye" cx="23" cy="25" r="3.5"></circle>
        <circle class="driver-rating-face__eye" cx="41" cy="25" r="3.5"></circle>
        <path class="driver-rating-face__mouth" d="M22 40h20"></path>
      </svg>
    `,
    ratingBad: `
      <svg class="driver-rating-face driver-rating-face--bad" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="28"></circle>
        <circle class="driver-rating-face__eye" cx="23" cy="25" r="3.5"></circle>
        <circle class="driver-rating-face__eye" cx="41" cy="25" r="3.5"></circle>
        <path class="driver-rating-face__mouth" d="M21 43c3.1-4.7 6.9-7 11-7s7.9 2.3 11 7"></path>
      </svg>
    `,
    maps: `
      <svg class="driver-active-map__google-pin" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path class="driver-active-map__google-pin-blue" d="M16 2.5c-5.2 0-9.4 4.1-9.4 9.2 0 6.9 9.4 17.8 9.4 17.8s9.4-10.9 9.4-17.8c0-5.1-4.2-9.2-9.4-9.2z" />
        <path class="driver-active-map__google-pin-green" d="M8.8 17.7c2.2 4.7 7.2 11.8 7.2 11.8s3.1-3.6 5.6-7.9L17 17.1z" />
        <path class="driver-active-map__google-pin-yellow" d="M10.1 5.9 16 11.8l5.8-5.8A9.4 9.4 0 0 0 10.1 5.9z" />
        <path class="driver-active-map__google-pin-red" d="M21.8 5.9 16 11.8l5.7 5.7c2.2-4.8 1.5-8.8.1-11.6z" />
        <circle class="driver-active-map__google-pin-center" cx="16" cy="11.8" r="3.4" />
      </svg>
    `,
    gpsArrow: `
      <svg class="driver-active-navigation-arrow" viewBox="0 0 96 96" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="driverNavigationArrowFill" x1="48" x2="48" y1="8" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#9fd0ff"></stop>
            <stop offset="0.48" stop-color="#5daeff"></stop>
            <stop offset="1" stop-color="#2f86dc"></stop>
          </linearGradient>
        </defs>
        <path class="driver-active-navigation-arrow__shadow" d="M48 8 78 84 48 69 18 84Z"></path>
        <path class="driver-active-navigation-arrow__body" d="M48 8 78 84 48 69 18 84Z"></path>
        <path class="driver-active-navigation-arrow__highlight" d="M48 18 64 66 48 58Z"></path>
      </svg>
    `,
  };

  function getIcon(name) {
    return icons[name] || "";
  }

  window.ELARA_ICONS = icons;
  window.ElaraIcons = {
    ...icons,
    get: getIcon,
  };
  window.getElaraIcon = getIcon;
})();
