/*
  Proyecto Atlas / ELARA Transport
  Archivo: supabase.js
  Responsabilidad: cliente unico Supabase para el frontend.
*/

"use strict";

(function initElaraSupabaseClient() {
  const config = window.ElaraConfig?.supabase || {};
  const supabaseGlobal = window.supabase;
  const hasCreateClient = typeof supabaseGlobal?.createClient === "function";
  const isConfigured = Boolean(config.url && config.anonKey && hasCreateClient);
  const client = isConfigured ? supabaseGlobal.createClient(config.url, config.anonKey, config.options || {}) : null;

  if (!isConfigured) {
    console.error("[ELARA Supabase] Cliente no configurado. Revisa config.js y la carga del CDN.");
  }

  window.ElaraSupabase = Object.freeze({
    client,
    getPublicConfig() {
      return {
        url: config.url || "",
        hasAnonKey: Boolean(config.anonKey),
        isConfigured,
      };
    },
    isConfigured() {
      return isConfigured;
    },
  });
})();
