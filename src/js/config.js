/*
  Proyecto Atlas / ELARA Transport
  Archivo: config.js
  Responsabilidad: configuracion publica del frontend.
*/

"use strict";

window.ElaraConfig = Object.freeze({
  supabase: Object.freeze({
    url: "http://127.0.0.1:54421",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
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
