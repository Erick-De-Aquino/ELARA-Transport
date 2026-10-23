const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/js/operational-data.js"), "utf8");

function setup(client = {}) {
  const context = {window: {
    ElaraSupabase: {client},
    ElaraAuth: {getCurrentUser: () => ({id: "actor"}), getActiveContext: () => "administrativo"},
  }, document: {querySelectorAll: () => []}, Intl, Set, Map, console};
  vm.createContext(context);
  vm.runInContext(source, context);
  return {op: context.window.ElaraOperationalData, context};
}

test("structured QA marks, not names, codes, creator or calculation version", () => {
  const {op} = setup();
  for (const row of [
    {metadata: {qa_run: "QA-4546-20261012-R01"}}, {qa_case: "C1"},
    {metadata: {qa_fixture: true}}, {notes: "qa_run=QA-4546-20261012-R01;entity_alias=DRIVER;"},
    {internal_notes: "qa_case=C3;"}, {observations: "qa_run=another-isolated-batch;"},
  ]) assert.equal(op.isQaRecord(row), true);
  for (const row of [{name: "QA customer"}, {human_code: "SET-000001"},
    {created_by: "actor", calculation_version: 1}, {metadata: {qa_fixture: false}},
    {notes: "Please discuss qa_run later"}]) assert.equal(op.isOperationalRecord(row), true);
});

test("legacy identities are sourced from the unchanged frozen baseline", () => {
  const sql = fs.readFileSync(path.join(root, "scripts/qa/qa-4546-20261012-r01.sql"), "utf8");
  const start = sql.indexOf('"legacy": [');
  const baseline = JSON.parse(sql.slice(sql.indexOf("[", start), sql.indexOf("\n  ]", start) + 4));
  const {op} = setup();
  for (const row of baseline) {
    assert.equal(op.isLegacyQaRecord({id: row.id}), row.table !== "settlement_rules", row.table);
  }
  // Shared business rules must not exclude legitimate future settlements.
  const rule = baseline.find((r) => r.table === "settlement_rules");
  assert.equal(op.isOperationalRecord({id: "real", settlement_rule_id: rule.id}), true);
});

test("foreign-key exclusion reaches children without poisoning shared parents or creators", () => {
  const {op} = setup();
  op.indexRecords({drivers: [{id: "qa-driver", observations: "qa_run=batch;"}],
    assignments: [{id: "qa-assignment", driver_id: "qa-driver", vehicle_id: "shared-vehicle"}],
    services: [{id: "qa-service", notes: "qa_case=C1;"}],
    financials: [{id: "qa-fin", service_id: "qa-service"}],
    receivables: [{id: "qa-rec", service_financial_id: "qa-fin"}]});
  assert.equal(op.isOperationalRecord({settlement_id: "new", driver_id: "qa-driver"}), false);
  assert.equal(op.isOperationalRecord({id: "qa-rec"}), false);
  assert.equal(op.isOperationalRecord({id: "shared-vehicle"}), true);
  assert.equal(op.isOperationalRecord({id: "real", created_by: "qa-driver"}), true);
  op.reset();
  assert.equal(op.isOperationalRecord({id: "qa-driver"}), true);
});

test("complete table pagination handles server page caps before filtering", async () => {
  const calls = [];
  const rows = Array.from({length: 130}, (_, i) => ({id: String(i).padStart(3, "0"),
    ...(i === 125 ? {metadata: {qa_fixture: true}} : {})}));
  const {op} = setup({from(table) {
    return {select() {return this;}, order() {return this;}, range(start) {
      calls.push(start); return Promise.resolve({data: rows.slice(start, start + 60), count: rows.length});
    }};
  }});
  const all = await op.readAll("test");
  op.indexRecords({all});
  assert.deepEqual(calls, [0, 60, 120]);
  assert.equal(all.filter(op.isOperationalRecord).length, 129);
});

test("RPC totals are fetched completely and never reused after QA filtering", async () => {
  const calls = [];
  const rows = Array.from({length: 213}, (_, i) => ({expense_id: String(i), total_count: 213,
    amount: 1, currency_code: "EUR", ...(i < 190 ? {notes: "qa_run=batch;"} : {})}));
  const {op} = setup({rpc: async (name, {p_offset, p_limit}) => {
    calls.push(p_offset); return {data: rows.slice(p_offset, p_offset + p_limit)};
  }});
  const all = await op.readRpc("get_admin_expenses");
  op.indexRecords({all});
  const clean = all.filter(op.isOperationalRecord);
  assert.equal(clean.length, 23);
  assert.deepEqual(calls, [0, 100, 200]);
  assert.match(op.money(clean, "amount"), /23/);
  await assert.rejects(op.readRpc("collect_receivable"));
  assert.equal(calls.length, 3);
});

test("incomplete, duplicate and changing result sets fail closed", async () => {
  for (const responses of [
    [{data: [{id: "a"}], count: null}],
    [{data: [{id: "a"}], count: 2}, {data: [], count: 2}],
    [{data: [{id: "a"}], count: 2}, {data: [{id: "a"}], count: 2}],
    [{data: [{id: "a"}], count: 2}, {data: [{id: "b"}], count: 3}],
    [{error: {message: "denied"}}],
  ]) {
    const {op} = setup({from() {return {select() {return this;}, order() {return this;},
      range() {return Promise.resolve(responses.shift());}};}});
    await assert.rejects(op.readAll("test"));
  }
});

test("amounts are not silently converted across currencies or missing values", () => {
  const {op} = setup();
  assert.match(op.money([{amount: 10, currency_code: "EUR"}, {amount: 20, currency_code: "USD"}], "amount"), /No disponible/);
  assert.equal(op.money([{currency_code: "EUR"}], "amount"), "No disponible");
  assert.match(op.money([], "amount"), /0/);
});

test("remote text is escaped in table and detail output", () => {
  const {op} = setup();
  const payload = '<img src=x onerror="bad()">';
  for (const html of [op.fields({notes: payload}, [["Notas", "notes"]]),
    op.tableHtml([{notes: payload}], [["Notas", "notes"]])]) {
    assert.equal(html.includes("<img"), false);
    assert.match(html, /&lt;img/);
  }
});

test("receivables never reconcile demos or enable collection/reversal", () => {
  const {context} = setup();
  vm.runInContext(fs.readFileSync(path.join(root, "src/js/receivables-core.js"), "utf8"), context);
  const core = context.window.ElaraReceivablesCore;
  assert.equal(core.canCollectReceivable({}), false);
  assert.equal(core.canAnnulReceivablePayment({}), false);
  assert.equal(core.registerReceivablePayment("id").ok, false);
  assert.equal(core.annulReceivablePayment("id").ok, false);
  assert.equal(core.reconcileReceivablesFromServices().skippedOperationalReadOnly, true);
  assert.equal(context.window.ElaraReceivablesMock, undefined);
});

test("helper precedes consumers and frozen report/QA files are not needed at runtime", () => {
  const html = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
  const helper = html.indexOf('src="js/operational-data.js"');
  assert.ok(helper > 0);
  for (const name of ["dashboard", "services", "customers", "collaborators", "vehicles", "receivables-core", "cash", "expenses", "settlements"]) {
    assert.ok(html.indexOf(`src="js/${name}.js"`) > helper, name);
  }
  assert.equal(/fetch\([^)]*scripts\/qa/.test(source), false);
});
