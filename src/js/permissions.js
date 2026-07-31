/*
  Proyecto Atlas / ELARA Transport
  Archivo: permissions.js
  Responsabilidad: permisos mock centralizados por contexto activo.
*/

"use strict";

const ELARA_CONTEXTS = ["superadmin", "administrativo", "conductor"];

const ELARA_MODULES = {
  dashboard: { label: "Dashboard" },
  servicios: { label: "Servicios" },
  caja: { label: "Caja" },
  "cuentas-por-cobrar": { label: "Cuentas por cobrar" },
  gastos: { label: "Gastos" },
  liquidaciones: { label: "Liquidaciones" },
  clientes: { label: "Clientes" },
  conductores: { label: "Conductores" },
  vehiculos: { label: "Veh\u00edculos" },
  reportes: { label: "Reportes" },
  usuarios: { label: "Usuarios" },
  configuracion: { label: "Configuraci\u00f3n" },
  "mis-servicios": { label: "Mis servicios" },
  "historial-conductor": { label: "Historial" },
  "mis-finanzas": { label: "Mis finanzas" },
  "mis-gastos": { label: "Mis gastos" },
  "mis-liquidaciones": { label: "Mis liquidaciones" },
  "perfil-conductor": { label: "Mi perfil" },
};

const ELARA_ROUTE_ALIASES = {
  colaboradores: "conductores",
  historial: "historial-conductor",
  "mi-perfil": "perfil-conductor",
};

const ELARA_ROUTER_ROUTE_BY_CONTEXT_ROUTE = {
  conductores: "colaboradores",
  "historial-conductor": "historial",
  "perfil-conductor": "mi-perfil",
};

const ELARA_CONTEXT_PERMISSIONS = {
  superadmin: {
    routes: [
      "dashboard",
      "servicios",
      "clientes",
      "conductores",
      "vehiculos",
      "caja",
      "cuentas-por-cobrar",
      "gastos",
      "liquidaciones",
      "reportes",
      "usuarios",
      "configuracion",
    ],
    actions: [
      "services.create",
      "services.edit",
      "services.assign",
      "services.reassign",
      "services.cancel",
      "customers.create",
      "customers.edit",
      "customers.block",
      "customers.unblock",
      "drivers.create",
      "drivers.edit",
      "vehicles.create",
      "vehicles.edit",
      "users.manage",
      "settings.manage",
      "reports.view",
      "cash.view",
      "cash.remittances.register",
      "cash.counts.create",
      "cash.adjustments.create",
      "cash.movements.void",
      "cash.differences.close",
      "expenses.viewAll",
      "expenses.create",
      "expenses.review",
      "expenses.approve",
      "expenses.approveExceptional",
      "expenses.reject",
      "expenses.requestInfo",
      "expenses.pay",
      "expenses.reimburse",
      "expenses.cancel",
      "expenses.manageCategories",
      "settlements:view",
      "settlements:create",
      "settlements:review",
      "settlements:approve",
      "settlements:pay",
      "settlements:annulPayment",
      "settlements:cancel",
      "settlements:configureGlobalPercentage",
      "settlements:configureCollaboratorPercentage",
      "receivables:view",
      "receivables:collect",
      "receivables:annulPayment",
    ],
  },
  administrativo: {
    routes: ["dashboard", "servicios", "clientes", "conductores", "vehiculos", "caja", "cuentas-por-cobrar", "gastos", "liquidaciones"],
    actions: [
      "services.create",
      "services.edit",
      "services.assign",
      "services.reassign",
      "services.cancel",
      "customers.create",
      "customers.edit",
      "drivers.create",
      "drivers.edit",
      "vehicles.create",
      "vehicles.edit",
      "cash.view",
      "cash.remittances.register",
      "cash.counts.create",
      "expenses.viewAll",
      "expenses.create",
      "expenses.review",
      "expenses.approve",
      "expenses.reject",
      "expenses.requestInfo",
      "expenses.pay",
      "expenses.reimburse",
      "settlements:view",
      "settlements:create",
      "settlements:review",
      "settlements:approve",
      "settlements:pay",
      "receivables:view",
      "receivables:collect",
    ],
  },
  conductor: {
    routes: ["mis-servicios", "historial-conductor", "mis-finanzas", "mis-gastos", "mis-liquidaciones", "perfil-conductor"],
    actions: [
      "driver.services.viewOwn",
      "driver.services.operateOwn",
      "driver.history.viewOwn",
      "driver.finances.viewOwn",
      "expenses:viewOwn",
      "expenses:createOwn",
      "expenses:respondOwn",
      "driver.expenses.requestOwn",
      "driver.expenses.viewOwn",
      "settlements:viewOwn",
      "driver.profile.viewOwn",
    ],
  },
};

const ELARA_INITIAL_ROUTE_BY_CONTEXT = {
  superadmin: "dashboard",
  administrativo: "dashboard",
  conductor: "mis-servicios",
};

function getContextFromSubject(subject) {
  if (typeof subject === "string") {
    return normalizePermissionContext(subject);
  }

  const authContext =
    window.ElaraAuth && typeof window.ElaraAuth.getActiveContext === "function"
      ? normalizePermissionContext(window.ElaraAuth.getActiveContext())
      : "";

  if (authContext) {
    return authContext;
  }

  return normalizePermissionContext(subject?.activeContext) || normalizePermissionContext(subject?.role);
}

function getAllowedRoutes(subjectOrContext) {
  const context = getContextFromSubject(subjectOrContext);
  const permissions = getContextPermissions(context);

  return permissions ? permissions.routes.slice() : [];
}

function canAccessRoute(subjectOrContext, routeName) {
  const context = getContextFromSubject(subjectOrContext);
  const permissions = getContextPermissions(context);
  const normalizedRoute = normalizePermissionRoute(routeName);

  return Boolean(permissions && normalizedRoute && permissions.routes.includes(normalizedRoute));
}

function getInitialRoute(subjectOrContext) {
  const context = getContextFromSubject(subjectOrContext);
  const initialRoute = ELARA_INITIAL_ROUTE_BY_CONTEXT[context] || "";

  return getRouterRouteName(initialRoute);
}

function getNavigationForContext(subjectOrContext) {
  return getAllowedRoutes(subjectOrContext).map((routeName) => ({
    route: getRouterRouteName(routeName),
    label: getModuleLabel(routeName),
  }));
}

function canPerformAction(subjectOrContext, action) {
  const context = getContextFromSubject(subjectOrContext);
  const permissions = getContextPermissions(context);

  return Boolean(permissions && permissions.actions.includes(action));
}

function getNavigationForRole(role) {
  return getNavigationForContext(role);
}

function getModuleLabel(routeName) {
  const normalizedRoute = normalizePermissionRoute(routeName);

  return ELARA_MODULES[normalizedRoute] ? ELARA_MODULES[normalizedRoute].label : routeName;
}

function getContextPermissions(context) {
  return ELARA_CONTEXT_PERMISSIONS[context] || null;
}

function getRouterRouteName(routeName) {
  return ELARA_ROUTER_ROUTE_BY_CONTEXT_ROUTE[routeName] || routeName;
}

function normalizePermissionContext(context) {
  const normalizedContext = String(context || "").trim().toLowerCase();

  return ELARA_CONTEXTS.includes(normalizedContext) ? normalizedContext : "";
}

function normalizePermissionRoute(routeName) {
  const normalizedRoute = String(routeName || "").trim();

  return ELARA_ROUTE_ALIASES[normalizedRoute] || normalizedRoute;
}

window.ElaraPermissions = {
  canAccessRoute,
  canPerformAction,
  getAllowedRoutes,
  getContextFromSubject,
  getInitialRoute,
  getModuleLabel,
  getNavigationForContext,
  getNavigationForRole,
};
