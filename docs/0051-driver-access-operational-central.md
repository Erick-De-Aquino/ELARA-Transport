# 0051 — driver access and operational central (LOCAL ONLY)

0050 remains unchanged. 0051 adds control-plane capabilities for two pre-existing
gaps: driver catalog creation does not create a portal identity, and the sole
active central is an excluded historical QA account. This migration does not
create Auth users, send mail, seed rows, suspend accounts, move money or run QA.
No new table, business DML grant or RLS policy is introduced.

## Contracts

All public functions return JSONB, require a current application session with
active **superadmin context and role**, owner postgres, search_path pg_catalog.
PUBLIC/anon/service_role have no EXECUTE; authenticated has EXECUTE with internal
authorization. Private helpers revoke all API roles. No reliance on automatic
Data API grants (including the 2026-10-30 change).

| Function | Arguments in order |
|---|---|
| admin_begin_driver_portal_access | p_request_id uuid, p_driver_id uuid, p_email text, p_reason text, p_confirm_existing boolean=false |
| admin_link_driver_portal_access | p_request_id uuid, p_auth_user_id uuid, p_confirm_existing_identity boolean=false |
| admin_revoke_driver_portal_access | p_request_id uuid, p_driver_id uuid, p_reason text |
| get_admin_driver_portal_access_context | p_driver_id uuid |
| get_admin_control_receipt | p_request_id uuid, p_scope text, p_phase text |
| get_admin_operational_central_context | none |
| admin_initialize_operational_central | p_request_id uuid, p_expected_old_id uuid, p_expected_snapshot jsonb, p_new_name text, p_reason text, p_acknowledge_frozen_qa boolean, p_currency_code text='EUR' |

Receipts are append-only audit_logs with control_contract=0051, scope, phase,
request key, actor, normalized arguments/fingerprint and result. Key+phase is
unique; a key cannot cross actors or operations. The begin/link phases share an
access key. Authorization precedes replay. Same payload replays; changed payload
fails. A compatible pending attempt returns its canonical request id. Nothing
automatically reactivates inactive users, revoked roles or historical links.

## Driver identity / Auth boundary

The transaction creates/reuses the driver person's app_user, active conductor
role and unique active user_driver_link. Other valid roles/default context are
preserved. Another person, another Auth identity, incompatible link or inactive
state is rejected. SQL never creates auth.users.

The Edge Function uses only built-in fetch and runtime secrets; no package/CDN
dependency. It verifies the operator with Auth, then calls begin using that same
operator JWT; the database checks current app_session/context/role before Auth
Admin is invoked. All DB calls use the operator JWT, not a service-role identity.
Existing Auth identities require explicit approval of the exact presented UUID.

Auth and PostgreSQL are **not a distributed transaction**. If invitation delivery
or link confirmation is lost, keep the attempt. Reconcile current Auth candidate
and DB receipt; an existing candidate requires explicit identity review before
retrying the same access attempt. Never delete Auth users as compensation. A
linked receipt is recognized without issuing another invitation.

UI busy guards and in-flight deduplication avoid double-click sends within an
Edge instance. Auth email uniqueness and DB constraints prevent duplicate
identities/links across instances. Exactly-once email delivery across independent
instances/network loss is not promised; no business state is inferred from mail
delivery. Recoverable/ambiguous responses never announce success.

Begin/link/revoke use a common transaction advisory lock `0051/control` before
resource row locks: driver -> person -> Auth identity/app_user -> role -> link.
This deliberately serializes rare administrative control operations. It does not
serialize 0050 financial traffic. READ COMMITTED is required. Revocation closes
links first, revokes conductor roles, ends conductor sessions and inactivates an
exclusive conductor app_user; other roles/sessions survive, with a valid default.
Existing driver-inactivation guards remain unchanged. A pending invitation can
also be revoked; old link attempts cannot resurrect it.

## Acceptance page

`accept-invite.html` accepts the Auth callback, validates its session and user,
removes callback material from the URL and allows the invitee to establish a
password. A pre-existing admin session alone never enables password setup. It
does not log credentials or store business data. After password setup it calls
the existing initialize_app_session with conductor context and opens mis-servicios.
If functional linking is pending, the user can review again without changing the
password twice. Existing administrative login/role flows are unchanged.

## Central transition

The read RPC returns an authoritative snapshot of the old account and **all rows**
in relevant FK relations: movements, remittances, counts, discrepancies, expense
payments/reimbursements, settlement payments and cash source reservations. It
also includes remittance items, their source reservations and transfer movements.

The mutation is deliberately restricted to the approved old central UUID
60000000-0000-4000-8000-000000000100, active EUR, opening zero, zero movements and
zero other references, except the two exact submitted QA remittances:

* 77000000-0000-4000-8000-000000000001: declared 0 EUR.
* 98026310-1aae-4318-9a26-4921729c4005: declared 75 EUR.

Both must retain their original QA driver source and old central destination;
no verified amount is allowed. Snapshot equality detects any intervening change.
Reviewed items/reservations may only belong to the 75-EUR remittance (maximum 75
EUR); reservations must remain reserved in the QA source account. Any transfer
movement is rejected, including an outflow posted only to the source account.
Even a freshly reviewed snapshot cannot authorize activity outside that baseline.
Explicit acknowledgement/name/reason are mandatory.

The transaction locks the old account NOWAIT, then referenced tables in SHARE ROW
EXCLUSIVE mode NOWAIT. Busy concurrent financial activity fails safely (55P03),
instead of waiting while holding table locks and forming a lock cycle. After
locking it rechecks the complete snapshot. It suspends the old central and inserts
one active operational EUR central with opening zero, preserving the existing
unique active-central index. Audit failure rolls back both writes. Replay returns
the original new ID before rechecking old account state.

Old remittances/items/reservations/histories are not updated or reassigned. The
existing verify RPC rejects their suspended destination. No historical account is
renamed or reclassified, and no opening balance/payment/transfer is fabricated.

## Deployment prerequisites / later manual actions (NOT executed locally)

1. Separate predeploy review and explicit deployment authorization for 0051,
   frontend and Edge Function. Never reapply or edit 0050.
2. Edge runtime secrets: built-in SUPABASE_URL, SUPABASE_ANON_KEY and
   SUPABASE_SERVICE_ROLE_KEY. These names refer to backend configuration only;
   no real values belong in source, frontend, logs or responses.
3. Set ELARA_ALLOWED_ORIGINS to an exact comma-separated origin allowlist. Set
   ELARA_PORTAL_INVITE_REDIRECT_URL to the fixed HTTPS Pages accept-invite.html
   URL; no query/hash. Loopback HTTP is permitted only for local development.
   Add that exact callback to Supabase Auth redirect URLs and verify SMTP/mail
   delivery configuration. Do not relax JWT checking; verify_jwt stays true.
4. Superadmin reviews and explicitly confirms central transition in Caja. If busy,
   retry the same request; if snapshot drift occurs, confirm absence of receipt
   before starting a newly reviewed attempt. No bypass or automatic transition.
5. Create clearly separate smoke driver/customer/eligible vehicle and documents;
   create portal access, accept invitation, prepare driver cash via 0050, set
   availability and link vehicle. Do not use structured frozen-QA exclusion marks.
6. Prepare distinct services and execute the separately authorized financial smoke.

## Tests / limits

Runtime-only dependencies live outside the repository. Set ELARA_PGLITE_ROOT to
that node_modules directory (PGlite, pg, linkedom); no product dependency is added.

```
node --test tests/*.test.cjs
node tests/control-0051.local.cjs
```

The native runner connects only to 127.0.0.1:54422 and drops only its generated
elara_0051_<uuid> database. Its historical QA fixture is seeded with triggers
disabled solely during fixture construction, then restored before tests. No
frozen QA script runs. Edge tests intercept all Auth Admin calls. DOM tests use
the actual modal code with a local DOM implementation. Real email delivery,
hosted callback settings and production throughput remain predeploy/postdeploy
checks, not certified by local mocks.

Operational recovery is review/retry/revocation, not destructive rollback. Never
delete Auth users/audit or reactivate/reassign QA automatically. After a central
transition, do not automatically switch back or transfer balances; new activity
requires separate review and authorization.

## Final local verification

* Complete suite: 182 PASS / 0 FAIL / 0 SKIP (145 existing + 37 new).
* Native clean load 0001 through 0051: PASS; 14 semantic scenarios and six
  contention scenarios with independent backends and observed lock waits: PASS.
* Driver app-session bootstrap/RLS, revocation, snapshot drift, preserved QA
  remittances/items/reservations, forced intermediate/deferred failures: PASS.
* Auth Admin calls were intercepted; actual Edge HTTP adapter and invitation
  page/form handlers were exercised without sending invitations.
* No remote deployment, account transition, real Auth user, commit or push.
  Prior migrations remain byte-for-byte unchanged. Disposable native databases
  are removed by the runner; the original local Supabase database is untouched.
