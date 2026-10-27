/* Operational reads only. No SQL, write RPCs, or demo fallback. */
"use strict";

window.ElaraOperationalData = (() => {
  const unavailable = "Función no disponible todavía en operación real.";
  // Source: qa-4546-20261012-r01.sql, frozen legacy baseline (not rule IDs).
  const legacyIds = new Set([
    "90000000-0000-4000-8000-000000000101", "77000000-0000-4000-8000-000000000001",
    "98026310-1aae-4318-9a26-4921729c4005", "b0c6127a-7a4a-492a-9445-ac187fe25526",
    "60000000-0000-4000-8000-000000000001", "60000000-0000-4000-8000-000000000002",
    "60000000-0000-4000-8000-000000000100", "afaa227c-b9a7-4b64-9bfb-7d0267f0b790",
    "70000000-0000-4000-8000-000000000001", "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
    "30000000-0000-4000-8000-000000000001", "4aff1a5a-1db5-4965-a13d-42c058c847f6",
    "71000000-0000-4000-8000-000000000001", "483b3bf5-b344-4843-bd00-4d89723d1bd6",
    "0e2bb293-a45a-4ed0-ba0d-e4a9ee9b4c3a", "3ee48ab5-bde1-41ac-bb02-c63c8266f34c",
    // Explicit baseline relations: QA driver/person, customer, vehicle and second QA cash driver.
    "11000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002",
  ]);
  const relationKeys = ["person_id", "company_id", "customer_id", "driver_id", "vehicle_id",
    "service_id", "service_financial_id", "service_payment_id", "payment_id", "receivable_id",
    "settlement_id", "expense_id", "cash_account_id", "actor_driver_id", "remittance_id",
    "source_cash_account_id", "destination_cash_account_id", "original_movement_id", "cash_count_id"];
  const idKeys = ["id", "receivable_id", "settlement_id", "expense_id", "discrepancy_id", "cash_movement_id", "remittance_id", "service_id"];
  let qaIds = new Set();
  let excludedIds = new Set(legacyIds);
  let collections = {};
  let generation = 0;
  let request = 0;
  let identityPromise = null;
  const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const identity = (r) => idKeys.map((k) => r?.[k]).find(Boolean);
  const has = (value) => value !== undefined && value !== null && value !== "" && value !== false;

  function isQaRecord(row = {}) {
    const marked = (o) => o && (has(o.qa_run) || has(o.qa_case) || has(o.entity_alias) || o.qa_fixture === true || o.qa_fixture === "true");
    return Boolean(marked(row) || marked(row.metadata) || qaIds.has(identity(row)) ||
      [row.notes, row.internal_notes, row.observations].some((s) =>
        typeof s === "string" && /(?:^|;)\s*(?:qa_run|qa_case|entity_alias)\s*=\s*[^;\s]+|(?:^|;)\s*qa_fixture\s*=\s*true(?:;|$)/i.test(s)));
  }
  function isLegacyQaRecord(row = {}) {
    return legacyIds.has(identity(row)) || relationKeys.some((k) => legacyIds.has(row[k]));
  }
  function isOperationalRecord(row = {}) {
    return !isQaRecord(row) && !excludedIds.has(identity(row)) &&
      !relationKeys.some((k) => excludedIds.has(row[k])) &&
      !(row.source_type && excludedIds.has(row.source_id));
  }
  function indexRecords(groups) {
    const rows = Object.values(groups).flat();
    for (const row of rows) if (isQaRecord(row) && identity(row)) qaIds.add(identity(row));
    for (const id of qaIds) excludedIds.add(id);
    // Follow child -> parent foreign keys only. Never propagate through created_by,
    // shared settlement rules, or from an assignment back to a reusable vehicle.
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        const id = identity(row);
        if (id && !excludedIds.has(id) && !isOperationalRecord(row)) {
          excludedIds.add(id);
          changed = true;
        }
      }
    }
    return groups;
  }
  function client() {
    if (!window.ElaraAuth?.getCurrentUser?.() || !window.ElaraSupabase?.client) {
      throw new Error("Sesión o cliente Supabase no disponible.");
    }
    return window.ElaraSupabase.client;
  }
  function reset() {
    generation++;
    request++;
    collections = {};
    qaIds = new Set();
    excludedIds = new Set(legacyIds);
    identityPromise = null;
    document.querySelectorAll("[data-operational-panel]").forEach((panel) => panel.replaceChildren());
  }
  async function readAll(table, key = "id") {
    const rows = [], seen = new Set();
    let expected;
    for (let offset = 0; offset <= 10000;) {
      const {data, error, count} = await client().from(table).select("*", {count: "exact"})
        .order(key).range(offset, offset + 499);
      if (error) throw new Error(`No se pudo leer ${table}.`);
      if (!Array.isArray(data) || count === null || count === undefined) throw new Error(`Lectura incompleta: ${table}.`);
      if (expected !== undefined && expected !== count) throw new Error("Los datos cambiaron durante la lectura. Reintenta.");
      expected = count;
      for (const row of data) {
        if (!row[key] || seen.has(row[key])) throw new Error(`Paginación inconsistente: ${table}.`);
        seen.add(row[key]);
      }
      rows.push(...data);
      if (rows.length === expected) return rows;
      if (!data.length || rows.length > expected) throw new Error(`Lectura incompleta: ${table}.`);
      offset += data.length;
    }
    throw new Error("No disponible: volumen superior al límite de lectura segura.");
  }
  const readRpcs = new Set(["get_admin_expenses", "get_admin_settlements", "get_admin_cash_movements",
    "get_admin_cash_remittances", "get_admin_cash_discrepancies"]);
  async function readRpc(name, args = {}) {
    if (!readRpcs.has(name)) throw new Error("Contrato de lectura no autorizado.");
    const rows = [], seen = new Set();
    let expected;
    for (let offset = 0; offset <= 10000;) {
      const {data, error} = await client().rpc(name, {...args, p_limit: 100, p_offset: offset});
      if (error || !Array.isArray(data)) throw new Error(`No se pudo leer ${name}.`);
      const total = data.length ? Number(data[0].total_count) : (expected ?? 0);
      if (!Number.isSafeInteger(total) || total < 0 || (expected !== undefined && total !== expected)) {
        throw new Error("Los datos cambiaron durante la lectura. Reintenta.");
      }
      expected = total;
      for (const row of data) {
        const id = identity(row);
        if (!id || seen.has(id)) throw new Error(`Paginación inconsistente: ${name}.`);
        seen.add(id);
      }
      rows.push(...data);
      if (rows.length === expected) return rows;
      if (!data.length || rows.length > expected) throw new Error(`Lectura incompleta: ${name}.`);
      offset += data.length;
    }
    throw new Error("No disponible: volumen superior al límite de lectura segura.");
  }
  async function loadIdentity() {
    if (identityPromise) return identityPromise;
    const pending = fetchIdentity();
    identityPromise = pending;
    try { return await pending; }
    finally { if (identityPromise === pending) identityPromise = null; }
  }
  async function fetchIdentity() {
    const token = generation;
    const tables = ["persons", "companies", "customers", "drivers", "vehicles", "cash_accounts",
      "services", "service_assignments", "cash_counts", "cash_discrepancies"];
    const values = await Promise.all(tables.map((t) => readAll(t)));
    if (token !== generation) throw new Error("La sesión cambió durante la lectura.");
    qaIds = new Set();
    excludedIds = new Set(legacyIds);
    collections = indexRecords(Object.fromEntries(tables.map((t, i) => [t, values[i]])));
    return collections;
  }
  const getCollection = (name) => (collections[name] || []).filter(isOperationalRecord);
  function blocked() {
    window.ElaraNotifications?.showToast(unavailable, "info");
    return false;
  }
  function header(title) {
    for (const [id, text] of [["page-title", title], ["page-eyebrow", "Operación"], ["page-summary", "Lectura real · QA/legacy excluido · Sin escrituras habilitadas"]]) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }
    const action = document.getElementById("primary-action");
    if (action) { action.hidden = true; action.removeAttribute("data-modal-target"); }
  }
  function panelFor(viewId) {
    const view = document.getElementById(viewId);
    if (!view) throw new Error("Vista no disponible.");
    for (const child of view.children) child.hidden = true;
    let panel = view.querySelector("[data-operational-panel]");
    if (!panel) {
      panel = document.createElement("div");
      panel.setAttribute("data-operational-panel", "");
      panel.className = "panel";
      view.appendChild(panel);
    }
    panel.hidden = false;
    return panel;
  }
  function unavailableView(viewId, title, message = unavailable) {
    header(title);
    const panel = panelFor(viewId);
    panel.textContent = message;
  }
  function tableHtml(rows, columns, details, rowActions) {
    return `<div style="overflow-x:auto"><table class="data-table"><thead><tr>${columns.map(([label]) => `<th scope="col">${escape(label)}</th>`).join("")}${details ? "<th>Detalle</th>" : ""}${rowActions ? '<th>Acciones</th>' : ''}</tr></thead><tbody>${rows.map((row, i) =>
      `<tr>${columns.map(([, get]) => `<td>${escape(display(typeof get === "function" ? get(row) : row[get]))}</td>`).join("")}${details ? `<td><button type="button" class="button button--secondary" data-operational-detail="${i}">Ver</button></td>` : ""}${rowActions ? `<td>${rowActions(row)}</td>` : ''}</tr>`).join("")}</tbody></table></div>`;
  }
  const display = (v) => v === null || v === undefined || v === "" ? "No disponible" : v;
  function money(rows, field) {
    const currencies = new Set(rows.map((r) => r.currency_code));
    if (rows.some((r) => r[field] === null || r[field] === undefined || !Number.isFinite(Number(r[field])))) return "No disponible";
    if (currencies.size > 1 || (rows.length && ![...currencies][0])) return "No disponible (monedas distintas o sin definir)";
    return new Intl.NumberFormat("es-ES", {style: "currency", currency: [...currencies][0] || "EUR"})
      .format(rows.reduce((sum, r) => sum + Number(r[field]), 0));
  }
  async function show(viewId, spec) {
    header(spec.title);
    if(spec.pageSummary){const summary=document.getElementById('page-summary');if(summary)summary.textContent=spec.pageSummary;}
    const panel = panelFor(viewId);
    const ticket = ++request, token = generation;
    panel.innerHTML = '<p role="status">Cargando datos reales…</p>';
    try {
      if (!["superadmin", "administrativo"].includes(window.ElaraAuth?.getActiveContext?.())) {
        throw new Error("Se requiere un contexto administrativo válido.");
      }
      await loadIdentity();
      const loaded = await spec.load();
      if (ticket !== request || token !== generation) return;
      indexRecords({loaded});
      const rows = loaded.filter(isOperationalRecord);
      collections[spec.collection || viewId] = rows;
      let query = "", page = 1;
      const filters = [...(spec.filters || []),
        {label: "Estado", value: (r) => r.status || r.operational_status || r.administrative_status || ""},
        {label: "Conductor", value: (r) => r.driver_id || "", text: (r) => r.driver_name || r.driver_display_name ||
          personName(getCollection("drivers").find((d) => d.id === r.driver_id)?.person_id)},
        {label: "Cliente", value: (r) => r.customer_id || "", text: (r) => r.customer_display_name || r.customer_human_code || r.customer_id},
      ].filter((f) => rows.some((r) => f.value(r)));
      const selected = new Map();
      panel.innerHTML = `<p>${escape(spec.notice || unavailable)}</p><p data-operational-summary></p>
        <label>Buscar <input type="search" data-operational-search></label>
        ${filters.map((f, i) => {
          const options = new Map(rows.filter((r) => f.value(r)).map((r) => [f.value(r), f.text ? f.text(r) : f.value(r)]));
          return `<label>${escape(f.label)} <select data-operational-filter="${i}"><option value="">Todos</option>${[...options].map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`).join("")}</select></label>`;
        }).join("")}
        <button type="button" class="button button--secondary" data-operational-retry>Actualizar</button>
        <div data-operational-results></div><p data-operational-page></p>
        <button type="button" data-operational-prev>Anterior</button> <button type="button" data-operational-next>Siguiente</button>
        <div data-operational-detail-content></div>`;
      const draw = () => {
        const filtered = rows.filter((r) => filters.every((f, i) => !selected.get(i) || f.value(r) === selected.get(i)) &&
          spec.columns.some(([, key]) => String(typeof key === "function" ? key(r) : r[key] ?? "").toLocaleLowerCase("es").includes(query)));
        page = Math.max(1, Math.min(page, Math.ceil(filtered.length / 25) || 1));
        const visible = filtered.slice((page - 1) * 25, page * 25);
        panel.querySelector("[data-operational-summary]").textContent = `Resultados operativos del filtro: ${filtered.length}. ${spec.summary ? spec.summary(filtered) : ""}`;
        const results = panel.querySelector("[data-operational-results]");
        results.innerHTML = visible.length ? tableHtml(visible, spec.columns, Boolean(spec.detail), spec.rowActions) : '<p role="status">No hay registros operativos para este filtro.</p>';
        panel.querySelector("[data-operational-page]").textContent = `Página ${page} de ${Math.ceil(filtered.length / 25) || 1}`;
        panel.querySelector("[data-operational-prev]").disabled = page === 1;
        panel.querySelector("[data-operational-next]").disabled = page * 25 >= filtered.length;
        const detail = panel.querySelector("[data-operational-detail-content]");
        detail.dataset.request = String(Number(detail.dataset.request || 0) + 1);
        detail.replaceChildren();
        results.onclick = async (event) => {
          const button = event.target.closest("[data-operational-detail]");
          if (!button || !spec.detail) return;
          const detailTicket = (detail.dataset.request = String(Number(detail.dataset.request || 0) + 1));
          detail.textContent = "Cargando detalle real…";
          try {
            const html = await spec.detail(visible[Number(button.dataset.operationalDetail)]);
            if (ticket === request && token === generation && detail.dataset.request === detailTicket) detail.innerHTML = html;
          } catch (_) { if (ticket === request) detail.textContent = "No se pudo cargar el detalle. Reintenta."; }
        };
      };
      panel.querySelector("[data-operational-search]").oninput = (event) => { query = event.target.value.trim().toLocaleLowerCase("es"); page = 1; draw(); };
      panel.querySelectorAll("[data-operational-filter]").forEach((select) => {
        select.onchange = () => { selected.set(Number(select.dataset.operationalFilter), select.value); page = 1; draw(); };
      });
      panel.querySelector("[data-operational-prev]").onclick = () => { page--; draw(); };
      panel.querySelector("[data-operational-next]").onclick = () => { page++; draw(); };
      panel.querySelector("[data-operational-retry]").onclick = () => show(viewId, spec);
      draw();
    } catch (error) {
      if (ticket !== request || token !== generation) return;
      panel.innerHTML = `<p role="alert">${escape(error.message)} No se muestran datos de demostración.</p><button type="button">Reintentar</button>`;
      panel.querySelector("button").onclick = () => show(viewId, spec);
    }
  }
  function fields(row, labels) {
    return `<dl>${labels.map(([label, key]) => `<dt>${escape(label)}</dt><dd>${escape(display(row[key]))}</dd>`).join("")}</dl>`;
  }
  async function related(table, foreignKey, id) {
    // Full ordered scan, subject to RLS; no partial details silently presented as complete.
    return (await readAll(table)).filter((r) => r[foreignKey] === id && isOperationalRecord(r));
  }
  async function serviceDetail(row) {
    const id = row.service_id;
    if (!isOperationalRecord(row)) throw new Error("Registro excluido.");
    const groups = [
      ["Ubicaciones", "service_locations", [["Tipo", "location_type"], ["Lugar", "label"], ["Dirección", "address"]]],
      ["Asignaciones", "service_assignments", [["Conductor UUID", "driver_id"], ["Vehículo UUID", "vehicle_id"], ["Estado", "assignment_status"]]],
      ["Progreso", "service_driver_progress", [["Estado", "stage"], ["Actualización", "last_update_at"]]],
      ["Cierres", "service_closures", [["UUID", "id"], ["Fecha", "created_at"]]],
      ["Historial", "service_status_history", [["Estado anterior", "from_status"], ["Estado", "to_status"], ["Fecha", "changed_at"]]],
      ["Finanzas", "service_financials", [["Precio", "pricing_status"], ["Total", "total_amount"], ["Pagado", "paid_amount"], ["Pendiente", "pending_amount"], ["Moneda", "currency_code"]]],
    ];
    const values = await Promise.all(groups.map(([, table]) => related(table, "service_id", id)));
    return fields(row, [["UUID", "service_id"], ["Servicio", "human_code"], ["Cliente", "customer_display_name"], ["Estado", "operational_status"], ["Fecha", "scheduled_start_at"]]) + groups.map(([title, , cols], i) => `<h3>${title}</h3>${values[i].length ? tableHtml(values[i], cols) : "<p>Sin registros.</p>"}`).join("");
  }
  async function readDetail(name, arg, id) {
    if (!["get_admin_settlement_detail", "get_admin_expense_detail", "get_admin_cash_remittance_detail", "get_admin_cash_discrepancy_detail"].includes(name)) throw new Error("Detalle no autorizado.");
    const {data, error} = await client().rpc(name, {[arg]: id});
    if (error || !data) throw new Error("Detalle no disponible.");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || identity(row) !== id || !isOperationalRecord(row)) throw new Error("Detalle no disponible.");
    return row;
  }
  async function checkDriverScope(viewId) {
    const user = window.ElaraAuth?.getCurrentUser?.();
    if (!user?.supabaseUserId || user.driverIdentityStatus !== "resolved" || !user.driverId) {
      unavailableView(viewId, "Portal conductor", "Identidad real del conductor no disponible.");
      return false;
    }
    const token = generation;
    try {
      const tables = ["drivers", "services", "cash_accounts", "cash_movements"];
      const values = await Promise.all(tables.map((table) => readAll(table)));
      if (token !== generation) return false;
      indexRecords(Object.fromEntries(tables.map((table, i) => [table, values[i]])));
      const driver = values[0].find((r) => r.id === user.driverId);
      const contaminatedCash = values[2].some((r) => !isOperationalRecord(r)) || values[3].some((r) => !isOperationalRecord(r));
      if (!driver || !isOperationalRecord(driver) || (viewId === "mis-finanzas" && contaminatedCash)) {
        unavailableView(viewId, "Portal conductor", "No disponible: datos QA/legacy excluidos de operación.");
        return false;
      }
      // Restore existing stable portal markup if this view was previously unavailable.
      const view = document.getElementById(viewId);
      const panel = view?.querySelector("[data-operational-panel]");
      if (panel) { for (const child of view.children) child.hidden = child === panel; }
      return true;
    } catch (_) {
      if (token === generation) unavailableView(viewId, "Portal conductor", "No se pudo comprobar el aislamiento operativo. Reintenta desde la navegación.");
      return false;
    }
  }
  function personName(id) {
    const p = getCollection("persons").find((r) => r.id === id);
    return p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "No disponible";
  }
  function customerName(row) {
    if (row.customer_type !== "company") return personName(row.person_id);
    const c = getCollection("companies").find((r) => r.id === row.company_id);
    return c?.trade_name || c?.legal_name || "No disponible";
  }
  // Auth remains owned by auth.js; discard data when its caller ends a session.
  return Object.freeze({isQaRecord, isLegacyQaRecord, isOperationalRecord, indexRecords, reset,
    readAll, readRpc, loadIdentity, getCollection, blocked, unavailableView, show, fields,
    related, serviceDetail, readDetail, checkDriverScope, personName, customerName, money, display, tableHtml});
})();
