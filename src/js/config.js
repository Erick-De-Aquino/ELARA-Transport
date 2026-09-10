/*
  Proyecto Atlas / ELARA Transport
  Archivo: config.js
  Responsabilidad: configuracion publica del frontend.
*/

"use strict";

(function initElaraConfig() {
  const localHostnames = ["127.0.0.1", "localhost"];
  const isLocalEnvironment = localHostnames.includes(window.location.hostname);
  const supabaseEnvironment = isLocalEnvironment ? "local" : "remote";
  const supabaseConfigs = Object.freeze({
    local: Object.freeze({
      url: "http://127.0.0.1:54421",
      anonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    }),
    remote: Object.freeze({
      url: "https://pfdvehcyauoncxeolcjc.supabase.co",
      anonKey: "sb_publishable_Q_iBgAubM8X7IysRP2--7Q_BzXz4EZe",
    }),
  });
  const selectedSupabaseConfig = supabaseConfigs[supabaseEnvironment];

  window.ElaraConfig = Object.freeze({
    environment: supabaseEnvironment,
    supabase: Object.freeze({
      environment: supabaseEnvironment,
      url: selectedSupabaseConfig.url,
      anonKey: selectedSupabaseConfig.anonKey,
      options: Object.freeze({
        auth: Object.freeze({
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: "elara.transport.auth",
        }),
      }),
    }),
  });
})();
