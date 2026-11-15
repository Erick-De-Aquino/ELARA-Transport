/*
  Proyecto Atlas / ELARA Transport
  Archivo: config.js
  Responsabilidad: configuracion publica del frontend.
*/

"use strict";

(function initElaraConfig() {
  const localHostnames = ["127.0.0.1", "localhost"];
  const isLocalFrontend = localHostnames.includes(window.location.hostname);
  const useLocalSupabase = isLocalFrontend &&
    new URLSearchParams(window.location.search).get("supabase") === "local";
  const supabaseEnvironment = useLocalSupabase ? "local" : "remote";
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
          // Loopback skips the old shared key; production keeps its sessions.
          storageKey: isLocalFrontend ? `elara.transport.auth.${supabaseEnvironment}` : "elara.transport.auth",
        }),
      }),
    }),
  });
})();
