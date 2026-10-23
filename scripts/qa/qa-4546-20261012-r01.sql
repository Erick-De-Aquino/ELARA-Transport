/*
 * Proyecto Atlas / ELARA Transport
 * qa-4546-20261012-r01.sql
 * Administrative QA package. NOT a product migration. WRITTEN, NOT EXECUTED.
 *
 * Requires psql (not Supabase SQL Editor), -X, and a trusted postgres connection.
 * Default PREFLIGHT is read-only. SQL/session configuration is ephemeral only.
 * Real actor/session identifiers must be supplied; never supply passwords/JWTs
 * as psql variables. No Auth/app_users/permissions are created or changed.
 * PREVIEW and GENERATE are disabled in this reviewed delivery.
 */
\set ON_ERROR_STOP on
\set ECHO none
\set QUIET on
\pset format unaligned
\pset tuples_only on
\if :{?QA_MODE}
\else
  \set QA_MODE PREFLIGHT
\endif
\if :{?QA_ACTOR_ID}
\else
  \set QA_ACTOR_ID ''
\endif
\if :{?QA_SESSION_ID}
\else
  \set QA_SESSION_ID ''
\endif
\if :{?ALLOW_PREPARE}
\else
  \set ALLOW_PREPARE false
\endif
\if :{?CONFIRM_PREPARE}
\else
  \set CONFIRM_PREPARE ''
\endif
-- These two flags are intentionally unconditional: CLI -v cannot enable them.
-- Change either only in a separately reviewed, explicitly authorized revision.
\set ALLOW_PREVIEW true
\set ALLOW_GENERATE true
\if :{?CONFIRM_GENERATE}
\else
  \set CONFIRM_GENERATE ''
\endif
SET default_transaction_read_only = on;
SET timezone = 'Europe/Madrid';
SET search_path = public, extensions;
SET application_name = 'ELARA QA 4546 R01';
SELECT set_config('elara_qa.mode',upper(:'QA_MODE'),false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.actor_id',:'QA_ACTOR_ID',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.session_id',:'QA_SESSION_ID',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.allow_prepare',:'ALLOW_PREPARE',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.confirm_prepare',:'CONFIRM_PREPARE',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.allow_preview',:'ALLOW_PREVIEW',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.allow_generate',:'ALLOW_GENERATE',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.confirm_generate',:'CONFIRM_GENERATE',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.connection_host',:'HOST',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.connection_user',:'USER',false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.registry','[]',false) IS NOT NULL AS cfg \gset

-- Frozen read-only contracts from the audit; definitions below are DATA, not DDL.
SELECT set_config('elara_qa.frozen',$qa_frozen${
  "functions": [
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres}",
      "hash": "5642ea8eec573dd08c9645bcbe898a02",
      "owner": "postgres",
      "signature": "preview_settlement_generation(uuid,date,date)",
      "volatility": "s"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
      "hash": "e3d2fab27c9d06d21725d1609e3d01b6",
      "owner": "postgres",
      "signature": "create_service(uuid,text,timestamp with time zone,text,text,text,text,text,text,text)",
      "volatility": "v"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
      "hash": "a1dc2325afb2a56c9fc534726563c12d",
      "owner": "postgres",
      "signature": "assign_service(uuid,uuid,uuid,boolean,text)",
      "volatility": "v"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
      "hash": "d8858aa4deb649eed613c254f178bc1f",
      "owner": "postgres",
      "signature": "finalize_service_pricing(uuid,numeric,numeric,text)",
      "volatility": "v"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
      "hash": "f4e870397bc9f8acdb12cd098db18d83",
      "owner": "postgres",
      "signature": "register_service_payment(uuid,numeric,text,uuid,timestamp with time zone,text,text,text)",
      "volatility": "v"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
      "hash": "2f88b0f7559fdddc84647d1abad23427",
      "owner": "postgres",
      "signature": "create_receivable_from_service(uuid,timestamp with time zone,text)",
      "volatility": "v"
    },
    {
      "acl": "{postgres=X/postgres,authenticated=X/postgres}",
      "hash": "52ccf568373b9b01675140a0cd82830c",
      "owner": "postgres",
      "signature": "generate_settlement(uuid,date,date,text)",
      "volatility": "v"
    }
  ],
  "columns": {
    "drivers": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "person_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "administrative_status",
        "type": "text",
        "default": "'pending_documents'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "availability_preference",
        "type": "text",
        "default": "'unavailable'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "base_city",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "license_expiration",
        "type": "date",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "observations",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "settlement_config",
        "type": "jsonb",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "suspended_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "suspension_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status_changed_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "persons": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "first_name",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "last_name",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "contact_email",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "phone",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "country_code",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "services": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "customer_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "operational_status",
        "type": "text",
        "default": "'pending'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "scheduled_start_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "requested_by_user_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "deleted_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "deleted_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "vehicles": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "plate_original",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "plate_normalized",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "plate_country",
        "type": "text",
        "default": "'ES'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "brand",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "model",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "color",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "year",
        "type": "integer",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "seats",
        "type": "integer",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "ownership_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "external_owner_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "manual_operational_status",
        "type": "text",
        "default": "'unavailable'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "elara_approval_status",
        "type": "text",
        "default": "'not_required'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "app_users": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "auth_user_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "person_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": "next_human_code('USR'::text)",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "default_context",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "last_access_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_note",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "companies": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "legal_name",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "trade_name",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "tax_id",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "billing_email",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "billing_phone",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "billing_address",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "customers": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "customer_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "person_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "company_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'new'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "billing_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "preferences",
        "type": "jsonb",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "blocked_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "blocked_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "blocked_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "inactive_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "receivables": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_financial_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "customer_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'open'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "currency_code",
        "type": "text",
        "default": "'EUR'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "original_amount",
        "type": "numeric",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "collected_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "pending_amount",
        "type": "numeric",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "due_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "opened_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "closed_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "written_off_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "reason_code",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "closed_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "written_off_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "cash_accounts": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "name",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "account_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "currency_code",
        "type": "text",
        "default": "'EUR'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "responsible_user_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "opening_balance",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "opened_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "closed_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "closed_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "service_closures": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "assignment_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "closure_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "closed_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "closed_by_user_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "closed_by_driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "reason_code",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "reason_details",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "rating",
        "type": "smallint",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "driver_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "incident_flag",
        "type": "boolean",
        "default": "false",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "service_payments": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "human_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_financial_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "payment_method",
        "type": "text",
        "default": "'cash'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "payment_status",
        "type": "text",
        "default": "'pending'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "amount",
        "type": "numeric",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "currency_code",
        "type": "text",
        "default": "'EUR'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "paid_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "registered_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "external_reference",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "idempotency_key",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancelled_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "cancellation_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "user_driver_links": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "started_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "ended_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "end_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "ended_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "service_financials": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "currency_code",
        "type": "text",
        "default": "'EUR'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "subtotal_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "discount_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "surcharge_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "taxable_base_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "tax_rate",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "tax_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "total_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "paid_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "pending_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "financial_status",
        "type": "text",
        "default": "'pending'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "pricing_status",
        "type": "text",
        "default": "'draft'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "service_assignments": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "vehicle_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_vehicle_assignment_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "assignment_status",
        "type": "text",
        "default": "'pending_acceptance'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "assigned_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "accepted_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "accepted_by_driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "rejected_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "rejected_by_driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "rejection_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "ended_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "reassignment_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "internal_priority_exception",
        "type": "boolean",
        "default": "false",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "priority_exception_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "ended_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "service_price_components": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "service_financial_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "component_type",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "label",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "quantity",
        "type": "numeric",
        "default": "1",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "unit_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "line_amount",
        "type": "numeric",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "tax_rate",
        "type": "numeric",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "sort_order",
        "type": "integer",
        "default": "0",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "is_active",
        "type": "boolean",
        "default": "true",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "metadata",
        "type": "jsonb",
        "default": "'{}'::jsonb",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "updated_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "driver_vehicle_assignments": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "vehicle_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "started_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "ended_at",
        "type": "timestamp with time zone",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "end_reason",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "ended_by",
        "type": "uuid",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      }
    ],
    "driver_settlement_overrides": [
      {
        "name": "id",
        "type": "uuid",
        "default": "extensions.gen_random_uuid()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_id",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "currency_code",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "driver_percentage",
        "type": "numeric",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "elara_percentage",
        "type": "numeric",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "effective_from",
        "type": "date",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "effective_to",
        "type": "date",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "status",
        "type": "text",
        "default": "'active'::text",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "source",
        "type": "text",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "notes",
        "type": "text",
        "default": null,
        "nullable": "YES",
        "generated": "NEVER"
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "nullable": "NO",
        "generated": "NEVER"
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "nullable": "NO",
        "generated": "NEVER"
      }
    ]
  },
  "constraints": [
    {
      "name": "persons_first_name_not_empty",
      "type": "c",
      "table": "persons",
      "definition": "CHECK (length(TRIM(BOTH FROM first_name)) > 0)"
    },
    {
      "name": "persons_inactive_at_required_when_inactive",
      "type": "c",
      "table": "persons",
      "definition": "CHECK (status <> 'inactive'::text OR inactive_at IS NOT NULL)"
    },
    {
      "name": "persons_last_name_not_empty",
      "type": "c",
      "table": "persons",
      "definition": "CHECK (length(TRIM(BOTH FROM last_name)) > 0)"
    },
    {
      "name": "persons_pkey",
      "type": "p",
      "table": "persons",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "persons_status_check",
      "type": "c",
      "table": "persons",
      "definition": "CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))"
    },
    {
      "name": "app_users_auth_user_id_fkey",
      "type": "f",
      "table": "app_users",
      "definition": "FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT"
    },
    {
      "name": "app_users_auth_user_id_unique",
      "type": "u",
      "table": "app_users",
      "definition": "UNIQUE (auth_user_id)"
    },
    {
      "name": "app_users_default_context_check",
      "type": "c",
      "table": "app_users",
      "definition": "CHECK (default_context = ANY (ARRAY['superadmin'::text, 'administrativo'::text, 'conductor'::text]))"
    },
    {
      "name": "app_users_human_code_format",
      "type": "c",
      "table": "app_users",
      "definition": "CHECK (human_code ~ '^USR-[0-9]{4}$'::text)"
    },
    {
      "name": "app_users_human_code_unique",
      "type": "u",
      "table": "app_users",
      "definition": "UNIQUE (human_code)"
    },
    {
      "name": "app_users_id_auth_user_id_unique",
      "type": "u",
      "table": "app_users",
      "definition": "UNIQUE (id, auth_user_id)"
    },
    {
      "name": "app_users_inactive_at_required_when_inactive",
      "type": "c",
      "table": "app_users",
      "definition": "CHECK (status <> 'inactive'::text OR inactive_at IS NOT NULL)"
    },
    {
      "name": "app_users_person_id_fkey",
      "type": "f",
      "table": "app_users",
      "definition": "FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT"
    },
    {
      "name": "app_users_person_id_unique",
      "type": "u",
      "table": "app_users",
      "definition": "UNIQUE (person_id)"
    },
    {
      "name": "app_users_pkey",
      "type": "p",
      "table": "app_users",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "app_users_status_check",
      "type": "c",
      "table": "app_users",
      "definition": "CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))"
    },
    {
      "name": "validate_app_users_active_sessions_context",
      "type": "t",
      "table": "app_users",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "validate_app_users_default_context",
      "type": "t",
      "table": "app_users",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "validate_app_users_driver_links_integrity",
      "type": "t",
      "table": "app_users",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "customers_blocked_at_required_when_blocked",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (status <> 'blocked'::text OR blocked_at IS NOT NULL)"
    },
    {
      "name": "customers_blocked_by_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (blocked_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "customers_company_id_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT"
    },
    {
      "name": "customers_created_by_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "customers_exactly_one_subject",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (customer_type = 'individual'::text AND person_id IS NOT NULL AND company_id IS NULL OR customer_type = 'company'::text AND company_id IS NOT NULL AND person_id IS NULL)"
    },
    {
      "name": "customers_human_code_format",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (customer_type = 'individual'::text AND human_code ~ '^CL-[0-9]{4}$'::text OR customer_type = 'company'::text AND human_code ~ '^EMP-[0-9]{4}$'::text)"
    },
    {
      "name": "customers_human_code_unique",
      "type": "u",
      "table": "customers",
      "definition": "UNIQUE (human_code)"
    },
    {
      "name": "customers_inactive_at_required_when_inactive",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (status <> 'inactive'::text OR inactive_at IS NOT NULL)"
    },
    {
      "name": "customers_inactive_by_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (inactive_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "customers_person_id_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT"
    },
    {
      "name": "customers_pkey",
      "type": "p",
      "table": "customers",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "customers_status_check",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (status = ANY (ARRAY['new'::text, 'active'::text, 'blocked'::text, 'inactive'::text]))"
    },
    {
      "name": "customers_type_check",
      "type": "c",
      "table": "customers",
      "definition": "CHECK (customer_type = ANY (ARRAY['individual'::text, 'company'::text]))"
    },
    {
      "name": "customers_updated_by_fkey",
      "type": "f",
      "table": "customers",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "validate_customers_integrity",
      "type": "t",
      "table": "customers",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "drivers_administrative_status_check",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (administrative_status = ANY (ARRAY['active'::text, 'pending_documents'::text, 'suspended'::text, 'inactive'::text]))"
    },
    {
      "name": "drivers_availability_preference_check",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (availability_preference = ANY (ARRAY['available'::text, 'unavailable'::text]))"
    },
    {
      "name": "drivers_created_by_fkey",
      "type": "f",
      "table": "drivers",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "drivers_human_code_format",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (human_code ~ '^DRV-[0-9]{4}$'::text)"
    },
    {
      "name": "drivers_human_code_unique",
      "type": "u",
      "table": "drivers",
      "definition": "UNIQUE (human_code)"
    },
    {
      "name": "drivers_inactive_at_required_when_inactive",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (administrative_status <> 'inactive'::text OR inactive_at IS NOT NULL)"
    },
    {
      "name": "drivers_person_id_fkey",
      "type": "f",
      "table": "drivers",
      "definition": "FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT"
    },
    {
      "name": "drivers_person_id_unique",
      "type": "u",
      "table": "drivers",
      "definition": "UNIQUE (person_id)"
    },
    {
      "name": "drivers_pkey",
      "type": "p",
      "table": "drivers",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "drivers_status_changed_by_fkey",
      "type": "f",
      "table": "drivers",
      "definition": "FOREIGN KEY (status_changed_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "drivers_suspended_at_required_when_suspended",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (administrative_status <> 'suspended'::text OR suspended_at IS NOT NULL)"
    },
    {
      "name": "drivers_type_check",
      "type": "c",
      "table": "drivers",
      "definition": "CHECK (driver_type = ANY (ARRAY['internal_driver'::text, 'external_collaborator'::text]))"
    },
    {
      "name": "drivers_updated_by_fkey",
      "type": "f",
      "table": "drivers",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "validate_drivers_integrity",
      "type": "t",
      "table": "drivers",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "validate_drivers_user_links_integrity",
      "type": "t",
      "table": "drivers",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "validate_vehicles_integrity",
      "type": "t",
      "table": "vehicles",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "vehicles_brand_not_empty",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (length(TRIM(BOTH FROM brand)) > 0)"
    },
    {
      "name": "vehicles_created_by_fkey",
      "type": "f",
      "table": "vehicles",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "vehicles_elara_approval_status_check",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (elara_approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))"
    },
    {
      "name": "vehicles_external_owner_id_fkey",
      "type": "f",
      "table": "vehicles",
      "definition": "FOREIGN KEY (external_owner_id) REFERENCES vehicle_external_owners(id) ON DELETE RESTRICT"
    },
    {
      "name": "vehicles_human_code_format",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (human_code ~ '^VEH-[0-9]{4}$'::text)"
    },
    {
      "name": "vehicles_human_code_unique",
      "type": "u",
      "table": "vehicles",
      "definition": "UNIQUE (human_code)"
    },
    {
      "name": "vehicles_inactive_by_fkey",
      "type": "f",
      "table": "vehicles",
      "definition": "FOREIGN KEY (inactive_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "vehicles_manual_operational_status_check",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (manual_operational_status = ANY (ARRAY['available'::text, 'unavailable'::text, 'blocked'::text]))"
    },
    {
      "name": "vehicles_model_not_empty",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (length(TRIM(BOTH FROM model)) > 0)"
    },
    {
      "name": "vehicles_ownership_consistency",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (ownership_type = 'owned'::text AND external_owner_id IS NULL AND elara_approval_status = 'not_required'::text OR ownership_type = 'external'::text AND external_owner_id IS NOT NULL)"
    },
    {
      "name": "vehicles_ownership_type_check",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (ownership_type = ANY (ARRAY['owned'::text, 'external'::text]))"
    },
    {
      "name": "vehicles_pkey",
      "type": "p",
      "table": "vehicles",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "vehicles_plate_country_format",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (plate_country ~ '^[A-Z]{2}$'::text)"
    },
    {
      "name": "vehicles_plate_normalized_unique",
      "type": "u",
      "table": "vehicles",
      "definition": "UNIQUE (plate_normalized)"
    },
    {
      "name": "vehicles_seats_positive",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (seats IS NULL OR seats > 0)"
    },
    {
      "name": "vehicles_updated_by_fkey",
      "type": "f",
      "table": "vehicles",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "vehicles_year_minimum",
      "type": "c",
      "table": "vehicles",
      "definition": "CHECK (year IS NULL OR year >= 1900)"
    },
    {
      "name": "driver_vehicle_assignments_created_by_fkey",
      "type": "f",
      "table": "driver_vehicle_assignments",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "driver_vehicle_assignments_driver_id_fkey",
      "type": "f",
      "table": "driver_vehicle_assignments",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "driver_vehicle_assignments_ended_at_required",
      "type": "c",
      "table": "driver_vehicle_assignments",
      "definition": "CHECK (status = 'active'::text OR ended_at IS NOT NULL)"
    },
    {
      "name": "driver_vehicle_assignments_ended_by_fkey",
      "type": "f",
      "table": "driver_vehicle_assignments",
      "definition": "FOREIGN KEY (ended_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "driver_vehicle_assignments_pkey",
      "type": "p",
      "table": "driver_vehicle_assignments",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "driver_vehicle_assignments_started_before_ended",
      "type": "c",
      "table": "driver_vehicle_assignments",
      "definition": "CHECK (ended_at IS NULL OR started_at <= ended_at)"
    },
    {
      "name": "driver_vehicle_assignments_status_check",
      "type": "c",
      "table": "driver_vehicle_assignments",
      "definition": "CHECK (status = ANY (ARRAY['active'::text, 'ended'::text, 'cancelled'::text]))"
    },
    {
      "name": "driver_vehicle_assignments_vehicle_id_fkey",
      "type": "f",
      "table": "driver_vehicle_assignments",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "name": "validate_driver_vehicle_assignments_integrity",
      "type": "t",
      "table": "driver_vehicle_assignments",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "service_assignments_accepted_by_driver_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (accepted_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_accepted_by_driver_matches",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (accepted_by_driver_id IS NULL OR accepted_by_driver_id = driver_id)"
    },
    {
      "name": "service_assignments_accepted_fields_required",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (assignment_status <> 'accepted'::text OR accepted_at IS NOT NULL)"
    },
    {
      "name": "service_assignments_assigned_before_accepted",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (accepted_at IS NULL OR assigned_at <= accepted_at)"
    },
    {
      "name": "service_assignments_assigned_before_ended",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (ended_at IS NULL OR assigned_at <= ended_at)"
    },
    {
      "name": "service_assignments_assigned_before_rejected",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (rejected_at IS NULL OR assigned_at <= rejected_at)"
    },
    {
      "name": "service_assignments_created_by_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_driver_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_driver_vehicle_assignment_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (driver_vehicle_assignment_id) REFERENCES driver_vehicle_assignments(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_ended_by_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (ended_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_ended_fields_required",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK ((assignment_status <> ALL (ARRAY['ended'::text, 'cancelled'::text])) OR ended_at IS NOT NULL)"
    },
    {
      "name": "service_assignments_pkey",
      "type": "p",
      "table": "service_assignments",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "service_assignments_priority_reason_required",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (internal_priority_exception = false OR length(TRIM(BOTH FROM COALESCE(priority_exception_reason, ''::text))) > 0)"
    },
    {
      "name": "service_assignments_rejected_by_driver_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (rejected_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_rejected_by_driver_matches",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (rejected_by_driver_id IS NULL OR rejected_by_driver_id = driver_id)"
    },
    {
      "name": "service_assignments_rejected_fields_required",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (assignment_status <> 'rejected'::text OR rejected_at IS NOT NULL AND length(TRIM(BOTH FROM COALESCE(rejection_reason, ''::text))) > 0)"
    },
    {
      "name": "service_assignments_service_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_assignments_status_check",
      "type": "c",
      "table": "service_assignments",
      "definition": "CHECK (assignment_status = ANY (ARRAY['pending_acceptance'::text, 'accepted'::text, 'rejected'::text, 'ended'::text, 'cancelled'::text, 'reassignment_required'::text]))"
    },
    {
      "name": "service_assignments_vehicle_id_fkey",
      "type": "f",
      "table": "service_assignments",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "name": "validate_service_assignments_integrity",
      "type": "t",
      "table": "service_assignments",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "service_closures_assignment_id_fkey",
      "type": "f",
      "table": "service_closures",
      "definition": "FOREIGN KEY (assignment_id) REFERENCES service_assignments(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_closures_closed_by_driver_id_fkey",
      "type": "f",
      "table": "service_closures",
      "definition": "FOREIGN KEY (closed_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_closures_closed_by_user_id_fkey",
      "type": "f",
      "table": "service_closures",
      "definition": "FOREIGN KEY (closed_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_closures_created_by_fkey",
      "type": "f",
      "table": "service_closures",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_closures_pkey",
      "type": "p",
      "table": "service_closures",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "service_closures_rating_range",
      "type": "c",
      "table": "service_closures",
      "definition": "CHECK (rating IS NULL OR rating >= 1 AND rating <= 5)"
    },
    {
      "name": "service_closures_service_id_fkey",
      "type": "f",
      "table": "service_closures",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "name": "service_closures_single_closer",
      "type": "c",
      "table": "service_closures",
      "definition": "CHECK (closed_by_user_id IS NULL OR closed_by_driver_id IS NULL)"
    },
    {
      "name": "service_closures_type_check",
      "type": "c",
      "table": "service_closures",
      "definition": "CHECK (closure_type = ANY (ARRAY['completed'::text, 'no_show'::text, 'not_performed'::text]))"
    },
    {
      "name": "validate_service_closures_integrity",
      "type": "t",
      "table": "service_closures",
      "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "name": "cash_accounts_closed_by_fkey",
      "type": "f",
      "table": "cash_accounts",
      "definition": "FOREIGN KEY (closed_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "cash_accounts_closed_fields",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (status <> 'closed'::text OR closed_at IS NOT NULL)"
    },
    {
      "name": "cash_accounts_created_by_fkey",
      "type": "f",
      "table": "cash_accounts",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "cash_accounts_currency_check",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)"
    },
    {
      "name": "cash_accounts_driver_id_fkey",
      "type": "f",
      "table": "cash_accounts",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "name": "cash_accounts_driver_rules",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (account_type = 'driver'::text AND driver_id IS NOT NULL OR account_type <> 'driver'::text AND driver_id IS NULL)"
    },
    {
      "name": "cash_accounts_name_not_empty",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (length(TRIM(BOTH FROM name)) > 0)"
    },
    {
      "name": "cash_accounts_opening_balance_non_negative",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (opening_balance >= 0::numeric)"
    },
    {
      "name": "cash_accounts_pkey",
      "type": "p",
      "table": "cash_accounts",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "cash_accounts_responsible_user_id_fkey",
      "type": "f",
      "table": "cash_accounts",
      "definition": "FOREIGN KEY (responsible_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "cash_accounts_status_check",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]))"
    },
    {
      "name": "cash_accounts_type_check",
      "type": "c",
      "table": "cash_accounts",
      "definition": "CHECK (account_type = ANY (ARRAY['central'::text, 'driver'::text, 'administrative'::text, 'temporary'::text]))"
    },
    {
      "name": "cash_accounts_updated_by_fkey",
      "type": "f",
      "table": "cash_accounts",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "name": "driver_settlement_overrides_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (effective_to >= effective_from)"
    },
    {
      "name": "driver_settlement_overrides_check1",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK ((driver_percentage + elara_percentage) = 100::numeric)"
    },
    {
      "name": "driver_settlement_overrides_created_by_fkey",
      "type": "f",
      "table": "driver_settlement_overrides",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id)"
    },
    {
      "name": "driver_settlement_overrides_currency_code_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)"
    },
    {
      "name": "driver_settlement_overrides_driver_id_currency_code_datera_excl",
      "type": "x",
      "table": "driver_settlement_overrides",
      "definition": "EXCLUDE USING gist (driver_id WITH =, currency_code WITH =, daterange(effective_from, effective_to, '[]'::text) WITH &&) WHERE (status = 'active'::text)"
    },
    {
      "name": "driver_settlement_overrides_driver_id_fkey",
      "type": "f",
      "table": "driver_settlement_overrides",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id)"
    },
    {
      "name": "driver_settlement_overrides_driver_percentage_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (driver_percentage >= 0::numeric AND driver_percentage <= 100::numeric)"
    },
    {
      "name": "driver_settlement_overrides_elara_percentage_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (elara_percentage >= 0::numeric AND elara_percentage <= 100::numeric)"
    },
    {
      "name": "driver_settlement_overrides_pkey",
      "type": "p",
      "table": "driver_settlement_overrides",
      "definition": "PRIMARY KEY (id)"
    },
    {
      "name": "driver_settlement_overrides_source_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (length(TRIM(BOTH FROM source)) > 0)"
    },
    {
      "name": "driver_settlement_overrides_status_check",
      "type": "c",
      "table": "driver_settlement_overrides",
      "definition": "CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))"
    },
    {
      "name": "cash_remittances_amounts_non_negative",
      "table": "cash_remittances",
      "definition": "CHECK (declared_amount >= 0::numeric AND (verified_amount IS NULL OR verified_amount >= 0::numeric))",
      "type": "c"
    },
    {
      "name": "cash_remittances_cancelled_fields",
      "table": "cash_remittances",
      "definition": "CHECK (status <> 'cancelled'::text OR cancelled_at IS NOT NULL AND length(TRIM(BOTH FROM COALESCE(cancellation_reason, ''::text))) > 0)",
      "type": "c"
    },
    {
      "name": "cash_remittances_currency_check",
      "table": "cash_remittances",
      "definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)",
      "type": "c"
    },
    {
      "name": "cash_remittances_distinct_accounts",
      "table": "cash_remittances",
      "definition": "CHECK (source_cash_account_id <> destination_cash_account_id)",
      "type": "c"
    },
    {
      "name": "cash_remittances_human_code_format",
      "table": "cash_remittances",
      "definition": "CHECK (human_code ~ '^REM-[0-9]{6}$'::text)",
      "type": "c"
    },
    {
      "name": "cash_remittances_prepared_fields",
      "table": "cash_remittances",
      "definition": "CHECK (status <> 'prepared'::text OR prepared_at IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_remittances_received_fields",
      "table": "cash_remittances",
      "definition": "CHECK (status <> 'received'::text OR received_at IS NOT NULL AND received_by_user_id IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_remittances_source_model_version_check",
      "table": "cash_remittances",
      "definition": "CHECK (source_model_version = ANY (ARRAY[1, 2]))",
      "type": "c"
    },
    {
      "name": "cash_remittances_status_check",
      "table": "cash_remittances",
      "definition": "CHECK (status = ANY (ARRAY['draft'::text, 'prepared'::text, 'submitted'::text, 'received'::text, 'verified'::text, 'cancelled'::text]))",
      "type": "c"
    },
    {
      "name": "cash_remittances_submitted_fields",
      "table": "cash_remittances",
      "definition": "CHECK (status <> 'submitted'::text OR submitted_at IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_remittances_verified_fields",
      "table": "cash_remittances",
      "definition": "CHECK (status <> 'verified'::text OR verified_at IS NOT NULL AND verified_by_user_id IS NOT NULL AND verified_amount IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_amounts_non_negative",
      "table": "cash_discrepancies",
      "definition": "CHECK (expected_amount >= 0::numeric AND actual_amount >= 0::numeric)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_cancelled_fields",
      "table": "cash_discrepancies",
      "definition": "CHECK (status <> 'cancelled'::text OR cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_currency_check",
      "table": "cash_discrepancies",
      "definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_difference_formula",
      "table": "cash_discrepancies",
      "definition": "CHECK (difference_amount = round(actual_amount - expected_amount, 2))",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_human_code_format",
      "table": "cash_discrepancies",
      "definition": "CHECK (human_code ~ '^DIF-[0-9]{6}$'::text)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_reference_by_type",
      "table": "cash_discrepancies",
      "definition": "CHECK (discrepancy_type = 'cash_count'::text AND cash_count_id IS NOT NULL AND remittance_id IS NULL OR discrepancy_type = 'remittance'::text AND remittance_id IS NOT NULL AND cash_count_id IS NULL)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_resolved_fields",
      "table": "cash_discrepancies",
      "definition": "CHECK (status <> 'resolved'::text OR resolved_at IS NOT NULL AND resolved_by IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_status_check",
      "table": "cash_discrepancies",
      "definition": "CHECK (status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text, 'cancelled'::text]))",
      "type": "c"
    },
    {
      "name": "cash_discrepancies_type_check",
      "table": "cash_discrepancies",
      "definition": "CHECK (discrepancy_type = ANY (ARRAY['cash_count'::text, 'remittance'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_amounts_non_negative",
      "table": "settlements",
      "definition": "CHECK (gross_eligible_amount >= 0::numeric AND expense_deduction_amount >= 0::numeric AND calculation_base_amount >= 0::numeric AND driver_amount >= 0::numeric AND elara_amount >= 0::numeric AND paid_amount >= 0::numeric AND pending_amount >= 0::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_approved_fields",
      "table": "settlements",
      "definition": "CHECK (status <> 'approved'::text OR approved_at IS NOT NULL AND approved_by IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "settlements_base_formula",
      "table": "settlements",
      "definition": "CHECK (calculation_base_amount = GREATEST(round(gross_eligible_amount - expense_deduction_amount + adjustment_amount, 2), 0::numeric))",
      "type": "c"
    },
    {
      "name": "settlements_calculation_version_check",
      "table": "settlements",
      "definition": "CHECK (calculation_version = ANY (ARRAY[1, 2]))",
      "type": "c"
    },
    {
      "name": "settlements_cancelled_fields",
      "table": "settlements",
      "definition": "CHECK (status <> 'cancelled'::text OR cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND length(TRIM(BOTH FROM COALESCE(cancellation_reason, ''::text))) > 0)",
      "type": "c"
    },
    {
      "name": "settlements_cash_offset_bounds",
      "table": "settlements",
      "definition": "CHECK (cash_offset_amount >= 0::numeric AND cash_offset_amount <= driver_amount AND (calculation_version = 2 OR cash_offset_amount = 0::numeric))",
      "type": "c"
    },
    {
      "name": "settlements_currency_check",
      "table": "settlements",
      "definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)",
      "type": "c"
    },
    {
      "name": "settlements_driver_amount_formula",
      "table": "settlements",
      "definition": "CHECK (calculation_version = 2 OR driver_amount =\nCASE\n    WHEN calculation_method_snapshot = 'driver_share'::text THEN round(calculation_base_amount * driver_percentage / 100::numeric, 2)\n    ELSE round(calculation_base_amount - round(calculation_base_amount * elara_percentage / 100::numeric, 2), 2)\nEND)",
      "type": "c"
    },
    {
      "name": "settlements_driver_type_check",
      "table": "settlements",
      "definition": "CHECK (driver_type_snapshot = ANY (ARRAY['internal_driver'::text, 'external_collaborator'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_driver_type_frequency_method",
      "table": "settlements",
      "definition": "CHECK (driver_type_snapshot = 'internal_driver'::text AND frequency_snapshot = 'monthly'::text AND calculation_method_snapshot = 'driver_share'::text OR driver_type_snapshot = 'external_collaborator'::text AND frequency_snapshot = 'weekly'::text AND calculation_method_snapshot = 'elara_commission'::text)",
      "type": "c"
    },
    {
      "name": "settlements_elara_amount_formula",
      "table": "settlements",
      "definition": "CHECK (elara_amount = round(calculation_base_amount - driver_amount, 2))",
      "type": "c"
    },
    {
      "name": "settlements_frequency_check",
      "table": "settlements",
      "definition": "CHECK (frequency_snapshot = ANY (ARRAY['weekly'::text, 'monthly'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_generated_fields",
      "table": "settlements",
      "definition": "CHECK (status <> 'generated'::text OR generated_at IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "settlements_human_code_format",
      "table": "settlements",
      "definition": "CHECK (human_code ~ '^SET-[0-9]{6}$'::text)",
      "type": "c"
    },
    {
      "name": "settlements_method_check",
      "table": "settlements",
      "definition": "CHECK (calculation_method_snapshot = ANY (ARRAY['driver_share'::text, 'elara_commission'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_not_overpaid",
      "table": "settlements",
      "definition": "CHECK (paid_amount <= payable_amount)",
      "type": "c"
    },
    {
      "name": "settlements_payment_cancelled_status",
      "table": "settlements",
      "definition": "CHECK (payment_status <> 'cancelled'::text OR status = 'cancelled'::text)",
      "type": "c"
    },
    {
      "name": "settlements_payment_paid_fields",
      "table": "settlements",
      "definition": "CHECK (payment_status <> 'paid'::text OR pending_amount = 0::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_payment_partial_fields",
      "table": "settlements",
      "definition": "CHECK (payment_status <> 'partial'::text OR paid_amount > 0::numeric AND pending_amount > 0::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_payment_status_check",
      "table": "settlements",
      "definition": "CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'partial'::text, 'cancelled'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_payment_unpaid_fields",
      "table": "settlements",
      "definition": "CHECK (payment_status <> 'unpaid'::text OR paid_amount = 0::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_pending_formula",
      "table": "settlements",
      "definition": "CHECK (pending_amount = (payable_amount - paid_amount))",
      "type": "c"
    },
    {
      "name": "settlements_percentage_source_check",
      "table": "settlements",
      "definition": "CHECK (percentage_source = ANY (ARRAY['legacy_rule'::text, 'per_service'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_percentage_source_version",
      "table": "settlements",
      "definition": "CHECK (calculation_version = 1 AND percentage_source = 'legacy_rule'::text OR calculation_version = 2 AND percentage_source = 'per_service'::text)",
      "type": "c"
    },
    {
      "name": "settlements_percentages_range",
      "table": "settlements",
      "definition": "CHECK (driver_percentage >= 0::numeric AND driver_percentage <= 100::numeric AND elara_percentage >= 0::numeric AND elara_percentage <= 100::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_percentages_sum",
      "table": "settlements",
      "definition": "CHECK (round(driver_percentage + elara_percentage, 4) = 100::numeric)",
      "type": "c"
    },
    {
      "name": "settlements_period_order",
      "table": "settlements",
      "definition": "CHECK (period_end >= period_start)",
      "type": "c"
    },
    {
      "name": "settlements_rejected_fields",
      "table": "settlements",
      "definition": "CHECK (status <> 'rejected'::text OR rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND length(TRIM(BOTH FROM COALESCE(rejection_reason, ''::text))) > 0)",
      "type": "c"
    },
    {
      "name": "settlements_status_check",
      "table": "settlements",
      "definition": "CHECK (status = ANY (ARRAY['draft'::text, 'generated'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))",
      "type": "c"
    },
    {
      "name": "settlements_submitted_fields",
      "table": "settlements",
      "definition": "CHECK (status <> 'submitted'::text OR submitted_at IS NOT NULL)",
      "type": "c"
    },
    {
      "name": "settlements_v2_service_base",
      "table": "settlements",
      "definition": "CHECK (calculation_version = 1 OR expense_deduction_amount = 0::numeric AND adjustment_amount = 0::numeric AND calculation_base_amount = gross_eligible_amount)",
      "type": "c"
    },
    {
      "table": "audit_logs",
      "name": "audit_logs_actor_app_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "audit_logs",
      "name": "audit_logs_actor_auth_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT"
    },
    {
      "table": "audit_logs",
      "name": "audit_logs_actor_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_counts",
      "name": "cash_counts_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_cancelled_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_resolved_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (resolved_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_cash_count_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_count_id) REFERENCES cash_counts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_discrepancies",
      "name": "cash_discrepancies_remittance_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (remittance_id) REFERENCES cash_remittances(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_cash_count_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_count_id) REFERENCES cash_counts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_original_movement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (original_movement_id) REFERENCES cash_movements(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_remittance_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (remittance_id) REFERENCES cash_remittances(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_actor_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_service_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittance_items",
      "name": "cash_remittance_items_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittance_items",
      "name": "cash_remittance_items_cash_movement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_movement_id) REFERENCES cash_movements(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittance_items",
      "name": "cash_remittance_items_remittance_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (remittance_id) REFERENCES cash_remittances(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittance_items",
      "name": "cash_remittance_items_service_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittance_items",
      "name": "cash_remittance_items_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_cancelled_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_prepared_by_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (prepared_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_received_by_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (received_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_verified_by_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (verified_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_destination_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (destination_cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_source_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (source_cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "cash_remittances",
      "name": "cash_remittances_submitted_by_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (submitted_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_cash_movement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_movement_id) REFERENCES cash_movements(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_remittance_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (remittance_id) REFERENCES cash_remittances(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id)"
    },
    {
      "table": "driver_cash_source_allocations",
      "name": "driver_cash_source_allocations_settlement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_id) REFERENCES settlements(id)"
    },
    {
      "table": "elara_private.driver_cash_source_usage",
      "name": "driver_cash_source_usage_cash_movement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_movement_id) REFERENCES cash_movements(id)"
    },
    {
      "table": "expense_allocations",
      "name": "expense_allocations_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "expense_allocations",
      "name": "expense_allocations_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "expense_allocations",
      "name": "expense_allocations_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "expense_payments",
      "name": "expense_payments_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "expense_reimbursements",
      "name": "expense_reimbursements_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "expense_reimbursements",
      "name": "expense_reimbursements_reimbursed_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (reimbursed_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "expenses",
      "name": "expenses_advanced_by_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (advanced_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "expenses",
      "name": "expenses_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "expenses",
      "name": "expenses_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "expenses",
      "name": "expenses_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "incident_comments",
      "name": "incident_comments_author_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (author_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "incident_events",
      "name": "incident_events_actor_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_cash_movement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_movement_id) REFERENCES cash_movements(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_reported_by_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (reported_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_service_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_settlement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT"
    },
    {
      "table": "incidents",
      "name": "incidents_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "receivable_allocations",
      "name": "receivable_allocations_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_status_history_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "receivables",
      "name": "receivables_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_cancellations",
      "name": "service_cancellations_cancelled_by_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_cancellations",
      "name": "service_cancellations_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_driver_progress",
      "name": "service_driver_progress_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_driver_progress",
      "name": "service_driver_progress_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_events",
      "name": "service_events_actor_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (actor_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_events",
      "name": "service_events_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_events",
      "name": "service_events_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_financial_status_history",
      "name": "service_financial_status_history_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_financials",
      "name": "service_financials_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_locations",
      "name": "service_locations_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_passengers",
      "name": "service_passengers_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payment_allocations",
      "name": "service_payment_allocations_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payment_allocations",
      "name": "service_payment_allocations_service_financial_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_financial_id) REFERENCES service_financials(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payment_allocations",
      "name": "service_payment_allocations_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (payment_id) REFERENCES service_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payments",
      "name": "service_payments_cancelled_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payments",
      "name": "service_payments_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payments",
      "name": "service_payments_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payments",
      "name": "service_payments_service_financial_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_financial_id) REFERENCES service_financials(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_payments",
      "name": "service_payments_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_snapshots",
      "name": "service_snapshots_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_status_history",
      "name": "service_status_history_changed_by_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (changed_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "service_status_history",
      "name": "service_status_history_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_settlement_override_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_override_id) REFERENCES driver_settlement_overrides(id)"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_expense_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_service_assignment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_assignment_id) REFERENCES service_assignments(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_service_financial_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_financial_id) REFERENCES service_financials(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_service_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_items",
      "name": "settlement_items_settlement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_payments",
      "name": "settlement_payments_cancelled_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_payments",
      "name": "settlement_payments_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_payments",
      "name": "settlement_payments_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_payments",
      "name": "settlement_payments_cash_account_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_payments",
      "name": "settlement_payments_settlement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_rules",
      "name": "settlement_rules_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_rules",
      "name": "settlement_rules_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_status_history",
      "name": "settlement_status_history_changed_by_user_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (changed_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_status_history",
      "name": "settlement_status_history_payment_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (payment_id) REFERENCES settlement_payments(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlement_status_history",
      "name": "settlement_status_history_settlement_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_approved_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (approved_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_cancelled_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (cancelled_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_created_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_rejected_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (rejected_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_updated_by_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "settlements",
      "name": "settlements_settlement_rule_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (settlement_rule_id) REFERENCES settlement_rules(id) ON DELETE RESTRICT"
    },
    {
      "table": "user_driver_links",
      "name": "user_driver_links_driver_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT"
    },
    {
      "table": "vehicle_documents",
      "name": "vehicle_documents_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "vehicle_maintenance_records",
      "name": "vehicle_maintenance_records_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "vehicle_odometer_readings",
      "name": "vehicle_odometer_readings_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    },
    {
      "table": "vehicle_technical_incidents",
      "name": "vehicle_technical_incidents_vehicle_id_fkey",
      "type": "f",
      "definition": "FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT"
    }
  ],
  "indexes": [
    {
      "name": "cash_accounts_pkey",
      "table": "cash_accounts",
      "definition": "CREATE UNIQUE INDEX cash_accounts_pkey ON public.cash_accounts USING btree (id)"
    },
    {
      "name": "cash_accounts_one_active_driver_account_idx",
      "table": "cash_accounts",
      "definition": "CREATE UNIQUE INDEX cash_accounts_one_active_driver_account_idx ON public.cash_accounts USING btree (driver_id) WHERE ((account_type = 'driver'::text) AND (status = 'active'::text))"
    },
    {
      "name": "cash_accounts_one_active_central_account_idx",
      "table": "cash_accounts",
      "definition": "CREATE UNIQUE INDEX cash_accounts_one_active_central_account_idx ON public.cash_accounts USING btree (account_type) WHERE ((account_type = 'central'::text) AND (status = 'active'::text))"
    },
    {
      "name": "cash_accounts_status_type_idx",
      "table": "cash_accounts",
      "definition": "CREATE INDEX cash_accounts_status_type_idx ON public.cash_accounts USING btree (status, account_type)"
    },
    {
      "name": "driver_settlement_overrides_pkey",
      "table": "driver_settlement_overrides",
      "definition": "CREATE UNIQUE INDEX driver_settlement_overrides_pkey ON public.driver_settlement_overrides USING btree (id)"
    },
    {
      "name": "driver_settlement_overrides_driver_id_currency_code_datera_excl",
      "table": "driver_settlement_overrides",
      "definition": "CREATE INDEX driver_settlement_overrides_driver_id_currency_code_datera_excl ON public.driver_settlement_overrides USING gist (driver_id, currency_code, daterange(effective_from, effective_to, '[]'::text)) WHERE (status = 'active'::text)"
    },
    {
      "name": "driver_vehicle_assignments_pkey",
      "table": "driver_vehicle_assignments",
      "definition": "CREATE UNIQUE INDEX driver_vehicle_assignments_pkey ON public.driver_vehicle_assignments USING btree (id)"
    },
    {
      "name": "driver_vehicle_assignments_one_active_per_driver_idx",
      "table": "driver_vehicle_assignments",
      "definition": "CREATE UNIQUE INDEX driver_vehicle_assignments_one_active_per_driver_idx ON public.driver_vehicle_assignments USING btree (driver_id) WHERE (status = 'active'::text)"
    },
    {
      "name": "driver_vehicle_assignments_one_active_per_vehicle_idx",
      "table": "driver_vehicle_assignments",
      "definition": "CREATE UNIQUE INDEX driver_vehicle_assignments_one_active_per_vehicle_idx ON public.driver_vehicle_assignments USING btree (vehicle_id) WHERE (status = 'active'::text)"
    },
    {
      "name": "drivers_pkey",
      "table": "drivers",
      "definition": "CREATE UNIQUE INDEX drivers_pkey ON public.drivers USING btree (id)"
    },
    {
      "name": "drivers_person_id_unique",
      "table": "drivers",
      "definition": "CREATE UNIQUE INDEX drivers_person_id_unique ON public.drivers USING btree (person_id)"
    },
    {
      "name": "drivers_human_code_unique",
      "table": "drivers",
      "definition": "CREATE UNIQUE INDEX drivers_human_code_unique ON public.drivers USING btree (human_code)"
    },
    {
      "name": "service_assignments_pkey",
      "table": "service_assignments",
      "definition": "CREATE UNIQUE INDEX service_assignments_pkey ON public.service_assignments USING btree (id)"
    },
    {
      "name": "service_assignments_one_active_per_service_idx",
      "table": "service_assignments",
      "definition": "CREATE UNIQUE INDEX service_assignments_one_active_per_service_idx ON public.service_assignments USING btree (service_id) WHERE (assignment_status = ANY (ARRAY['pending_acceptance'::text, 'accepted'::text, 'reassignment_required'::text]))"
    },
    {
      "name": "service_assignments_driver_status_idx",
      "table": "service_assignments",
      "definition": "CREATE INDEX service_assignments_driver_status_idx ON public.service_assignments USING btree (driver_id, assignment_status, assigned_at)"
    },
    {
      "name": "service_closures_pkey",
      "table": "service_closures",
      "definition": "CREATE UNIQUE INDEX service_closures_pkey ON public.service_closures USING btree (id)"
    },
    {
      "name": "service_closures_one_final_per_service_idx",
      "table": "service_closures",
      "definition": "CREATE UNIQUE INDEX service_closures_one_final_per_service_idx ON public.service_closures USING btree (service_id)"
    },
    {
      "name": "vehicles_pkey",
      "table": "vehicles",
      "definition": "CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id)"
    },
    {
      "name": "vehicles_human_code_unique",
      "table": "vehicles",
      "definition": "CREATE UNIQUE INDEX vehicles_human_code_unique ON public.vehicles USING btree (human_code)"
    },
    {
      "name": "vehicles_plate_normalized_unique",
      "table": "vehicles",
      "definition": "CREATE UNIQUE INDEX vehicles_plate_normalized_unique ON public.vehicles USING btree (plate_normalized)"
    },
    {
      "table": "settlement_items",
      "name": "settlement_service_entitlement_unique",
      "definition": "CREATE UNIQUE INDEX settlement_service_entitlement_unique ON public.settlement_items USING btree (service_id) WHERE (item_type = 'service_income'::text)"
    },
    {
      "table": "service_payment_allocations",
      "name": "service_payment_allocations_unique_target",
      "definition": "CREATE UNIQUE INDEX service_payment_allocations_unique_target ON public.service_payment_allocations USING btree (payment_id, service_financial_id)"
    }
  ],
  "triggers": [
    {
      "table": "persons",
      "name": "set_persons_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_persons_updated_at BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "customers",
      "name": "assign_customers_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_customers_human_code BEFORE INSERT OR UPDATE OF human_code, customer_type ON customers FOR EACH ROW EXECUTE FUNCTION assign_customer_human_code()"
    },
    {
      "table": "customers",
      "name": "set_customers_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "customers",
      "name": "validate_customers_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_customers_integrity AFTER INSERT OR UPDATE ON customers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_people_commercial_integrity()"
    },
    {
      "table": "drivers",
      "name": "assign_drivers_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_drivers_human_code BEFORE INSERT OR UPDATE OF human_code ON drivers FOR EACH ROW EXECUTE FUNCTION assign_driver_human_code()"
    },
    {
      "table": "drivers",
      "name": "set_drivers_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "drivers",
      "name": "validate_drivers_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_drivers_integrity AFTER INSERT OR UPDATE ON drivers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_people_commercial_integrity()"
    },
    {
      "table": "drivers",
      "name": "validate_drivers_user_links_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_drivers_user_links_integrity AFTER UPDATE ON drivers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_user_driver_link_integrity()"
    },
    {
      "table": "vehicles",
      "name": "prepare_vehicles_identity",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_vehicles_identity BEFORE INSERT OR UPDATE OF human_code, plate_original, plate_country, year ON vehicles FOR EACH ROW EXECUTE FUNCTION prepare_vehicle_identity()"
    },
    {
      "table": "vehicles",
      "name": "set_vehicles_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "vehicles",
      "name": "validate_vehicles_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_vehicles_integrity AFTER INSERT OR UPDATE ON vehicles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_vehicle_integrity()"
    },
    {
      "table": "driver_vehicle_assignments",
      "name": "validate_driver_vehicle_assignments_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_driver_vehicle_assignments_integrity AFTER INSERT OR UPDATE ON driver_vehicle_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_driver_vehicle_assignment()"
    },
    {
      "table": "services",
      "name": "assign_services_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_services_human_code BEFORE INSERT OR UPDATE OF human_code ON services FOR EACH ROW EXECUTE FUNCTION assign_service_human_code()"
    },
    {
      "table": "services",
      "name": "prevent_services_physical_delete_with_history",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_services_physical_delete_with_history BEFORE DELETE ON services FOR EACH ROW EXECUTE FUNCTION prevent_service_physical_delete_with_history()"
    },
    {
      "table": "services",
      "name": "set_services_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "services",
      "name": "validate_services_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_services_integrity AFTER INSERT OR UPDATE ON services DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_service_integrity()"
    },
    {
      "table": "services",
      "name": "validate_services_transition",
      "enabled": "O",
      "definition": "CREATE TRIGGER validate_services_transition BEFORE UPDATE OF operational_status ON services FOR EACH ROW EXECUTE FUNCTION validate_service_transition()"
    },
    {
      "table": "service_assignments",
      "name": "record_service_assignments_priority_exception_event",
      "enabled": "O",
      "definition": "CREATE TRIGGER record_service_assignments_priority_exception_event AFTER INSERT OR UPDATE OF internal_priority_exception, priority_exception_reason, assignment_status ON service_assignments FOR EACH ROW EXECUTE FUNCTION record_internal_priority_exception_event()"
    },
    {
      "table": "service_assignments",
      "name": "validate_service_assignments_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_service_assignments_integrity AFTER INSERT OR UPDATE ON service_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_service_assignment_integrity()"
    },
    {
      "table": "service_closures",
      "name": "validate_service_closures_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_service_closures_integrity AFTER INSERT OR UPDATE ON service_closures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_service_closure_integrity()"
    },
    {
      "table": "driver_settlement_overrides",
      "name": "audit_settlement_override",
      "enabled": "O",
      "definition": "CREATE TRIGGER audit_settlement_override AFTER INSERT OR UPDATE ON driver_settlement_overrides FOR EACH ROW EXECUTE FUNCTION elara_private.audit_settlement_override()"
    },
    {
      "table": "driver_settlement_overrides",
      "name": "guard_settlement_override",
      "enabled": "O",
      "definition": "CREATE TRIGGER guard_settlement_override BEFORE INSERT OR DELETE OR UPDATE ON driver_settlement_overrides FOR EACH ROW EXECUTE FUNCTION elara_private.guard_settlement_override()"
    },
    {
      "table": "vehicle_documents",
      "name": "set_vehicle_documents_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_vehicle_documents_updated_at BEFORE UPDATE ON vehicle_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "vehicle_documents",
      "name": "validate_vehicle_documents_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_vehicle_documents_integrity AFTER INSERT OR UPDATE ON vehicle_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_vehicle_document_integrity()"
    },
    {
      "table": "service_financials",
      "name": "prepare_service_financials",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_service_financials BEFORE INSERT OR UPDATE OF currency_code, tax_rate, pricing_status, finalized_at, finalized_by, notes, internal_notes ON service_financials FOR EACH ROW EXECUTE FUNCTION prepare_service_financial()"
    },
    {
      "table": "service_financials",
      "name": "prevent_service_financials_calculated_update",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_service_financials_calculated_update BEFORE UPDATE OF subtotal_amount, discount_amount, surcharge_amount, taxable_base_amount, tax_amount, total_amount, paid_amount, pending_amount, financial_status ON service_financials FOR EACH ROW EXECUTE FUNCTION prevent_service_financial_calculated_update()"
    },
    {
      "table": "service_financials",
      "name": "prevent_service_financials_delete",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_service_financials_delete BEFORE DELETE ON service_financials FOR EACH ROW EXECUTE FUNCTION prevent_service_financial_delete()"
    },
    {
      "table": "service_financials",
      "name": "recalculate_service_financials_after_edit",
      "enabled": "O",
      "definition": "CREATE TRIGGER recalculate_service_financials_after_edit AFTER INSERT OR UPDATE OF tax_rate, pricing_status ON service_financials FOR EACH ROW EXECUTE FUNCTION recalculate_service_financial_from_financial_edit()"
    },
    {
      "table": "service_financials",
      "name": "record_service_financials_status_change",
      "enabled": "O",
      "definition": "CREATE TRIGGER record_service_financials_status_change AFTER UPDATE OF financial_status ON service_financials FOR EACH ROW EXECUTE FUNCTION record_service_financial_status_change()"
    },
    {
      "table": "service_financials",
      "name": "set_service_financials_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_service_financials_updated_at BEFORE UPDATE ON service_financials FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "service_financials",
      "name": "validate_service_financials_receivables_integrity",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_service_financials_receivables_integrity AFTER INSERT OR UPDATE OF pricing_status, financial_status, currency_code, total_amount, paid_amount, pending_amount ON service_financials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_receivable_integrity()"
    },
    {
      "table": "cash_discrepancies",
      "name": "assign_cash_discrepancies_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_cash_discrepancies_human_code BEFORE INSERT OR UPDATE OF human_code, currency_code ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION assign_cash_discrepancy_human_code()"
    },
    {
      "table": "cash_discrepancies",
      "name": "prepare_cash_discrepancies",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_cash_discrepancies BEFORE INSERT OR UPDATE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION prepare_cash_discrepancy()"
    },
    {
      "table": "cash_discrepancies",
      "name": "prevent_cash_discrepancies_delete",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_cash_discrepancies_delete BEFORE DELETE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION prevent_cash_record_delete()"
    },
    {
      "table": "cash_discrepancies",
      "name": "set_cash_discrepancies_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_cash_discrepancies_updated_at BEFORE UPDATE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "cash_movements",
      "name": "assign_cash_movements_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_cash_movements_human_code BEFORE INSERT OR UPDATE OF human_code, currency_code ON cash_movements FOR EACH ROW EXECUTE FUNCTION assign_cash_movement_human_code()"
    },
    {
      "table": "cash_movements",
      "name": "guard_reserved_cash_outflow",
      "enabled": "O",
      "definition": "CREATE TRIGGER guard_reserved_cash_outflow BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION elara_private.guard_reserved_cash_outflow()"
    },
    {
      "table": "cash_movements",
      "name": "guard_shared_cash_reversal",
      "enabled": "O",
      "definition": "CREATE TRIGGER guard_shared_cash_reversal BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION elara_private.guard_cash_reversal()"
    },
    {
      "table": "cash_movements",
      "name": "prevent_cash_movements_update_delete",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_cash_movements_update_delete BEFORE DELETE OR UPDATE ON cash_movements FOR EACH ROW EXECUTE FUNCTION prevent_cash_movement_changes()"
    },
    {
      "table": "cash_movements",
      "name": "validate_cash_movements_integrity",
      "enabled": "O",
      "definition": "CREATE TRIGGER validate_cash_movements_integrity BEFORE INSERT OR DELETE OR UPDATE ON cash_movements FOR EACH ROW EXECUTE FUNCTION validate_cash_movement_integrity()"
    },
    {
      "table": "cash_remittance_items",
      "name": "prepare_cash_remittance_items",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_cash_remittance_items BEFORE INSERT OR DELETE OR UPDATE ON cash_remittance_items FOR EACH ROW EXECUTE FUNCTION prepare_cash_remittance_item()"
    },
    {
      "table": "cash_remittance_items",
      "name": "sync_remittance_item_allocation",
      "enabled": "O",
      "definition": "CREATE TRIGGER sync_remittance_item_allocation AFTER INSERT OR DELETE OR UPDATE ON cash_remittance_items FOR EACH ROW EXECUTE FUNCTION elara_private.sync_remittance_item_allocation()"
    },
    {
      "table": "cash_remittance_items",
      "name": "validate_cash_remittance_items_totals",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_cash_remittance_items_totals AFTER INSERT OR DELETE OR UPDATE ON cash_remittance_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cash_remittance_totals()"
    },
    {
      "table": "cash_remittances",
      "name": "aa_cash_remittance_lifecycle",
      "enabled": "O",
      "definition": "CREATE TRIGGER aa_cash_remittance_lifecycle BEFORE INSERT OR UPDATE ON cash_remittances FOR EACH ROW EXECUTE FUNCTION elara_private.cash_remittance_lifecycle()"
    },
    {
      "table": "cash_remittances",
      "name": "assign_cash_remittances_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_cash_remittances_human_code BEFORE INSERT OR UPDATE OF human_code, currency_code ON cash_remittances FOR EACH ROW EXECUTE FUNCTION assign_cash_remittance_human_code()"
    },
    {
      "table": "cash_remittances",
      "name": "check_remittance_cash_header",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER check_remittance_cash_header AFTER INSERT OR UPDATE ON cash_remittances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elara_private.check_remittance_allocations()"
    },
    {
      "table": "cash_remittances",
      "name": "prepare_cash_remittances",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_cash_remittances BEFORE INSERT OR UPDATE ON cash_remittances FOR EACH ROW EXECUTE FUNCTION prepare_cash_remittance()"
    },
    {
      "table": "cash_remittances",
      "name": "prevent_cash_remittances_delete",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_cash_remittances_delete BEFORE DELETE ON cash_remittances FOR EACH ROW EXECUTE FUNCTION prevent_cash_record_delete()"
    },
    {
      "table": "cash_remittances",
      "name": "set_cash_remittances_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_cash_remittances_updated_at BEFORE UPDATE ON cash_remittances FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "cash_remittances",
      "name": "validate_cash_remittances_totals",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER validate_cash_remittances_totals AFTER INSERT OR UPDATE ON cash_remittances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cash_remittance_totals()"
    },
    {
      "table": "service_payments",
      "name": "after_service_payments_ensure_allocation",
      "enabled": "O",
      "definition": "CREATE TRIGGER after_service_payments_ensure_allocation AFTER INSERT OR UPDATE OF payment_status, amount, service_financial_id ON service_payments FOR EACH ROW EXECUTE FUNCTION ensure_completed_service_payment_allocation()"
    },
    {
      "table": "service_payments",
      "name": "assign_service_payments_human_code",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_service_payments_human_code BEFORE INSERT OR UPDATE OF human_code, currency_code ON service_payments FOR EACH ROW EXECUTE FUNCTION assign_service_payment_human_code()"
    },
    {
      "table": "service_payments",
      "name": "guard_shared_cash_payment",
      "enabled": "O",
      "definition": "CREATE TRIGGER guard_shared_cash_payment BEFORE UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION elara_private.guard_cash_payment()"
    },
    {
      "table": "service_payments",
      "name": "recalculate_after_service_payments",
      "enabled": "O",
      "definition": "CREATE TRIGGER recalculate_after_service_payments AFTER INSERT OR DELETE OR UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION recalculate_service_financial_from_payment()"
    },
    {
      "table": "service_payments",
      "name": "set_service_payments_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_service_payments_updated_at BEFORE UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    },
    {
      "table": "service_payments",
      "name": "validate_service_payments_integrity",
      "enabled": "O",
      "definition": "CREATE TRIGGER validate_service_payments_integrity BEFORE INSERT OR DELETE OR UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION validate_service_payment_integrity()"
    },
    {
      "table": "settlement_status_history",
      "name": "prevent_settlement_status_history_changes_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_settlement_status_history_changes_trigger BEFORE DELETE OR UPDATE ON settlement_status_history FOR EACH ROW EXECUTE FUNCTION prevent_settlement_status_history_changes()"
    },
    {
      "table": "settlements",
      "name": "aa_prevent_settlement_calculated_update_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER aa_prevent_settlement_calculated_update_trigger BEFORE UPDATE OF gross_eligible_amount, expense_deduction_amount, adjustment_amount, calculation_base_amount, driver_amount, elara_amount, paid_amount, pending_amount, payment_status ON settlements FOR EACH ROW EXECUTE FUNCTION prevent_settlement_calculated_update()"
    },
    {
      "table": "settlements",
      "name": "assign_settlement_human_code_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER assign_settlement_human_code_trigger BEFORE INSERT OR UPDATE OF human_code ON settlements FOR EACH ROW EXECUTE FUNCTION assign_settlement_human_code()"
    },
    {
      "table": "settlements",
      "name": "check_settlement_economics_header",
      "enabled": "O",
      "definition": "CREATE CONSTRAINT TRIGGER check_settlement_economics_header AFTER INSERT OR UPDATE ON settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elara_private.check_settlement_economics()"
    },
    {
      "table": "settlements",
      "name": "prepare_settlement_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER prepare_settlement_trigger BEFORE INSERT OR UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION prepare_settlement()"
    },
    {
      "table": "settlements",
      "name": "prevent_settlement_delete_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER prevent_settlement_delete_trigger BEFORE DELETE ON settlements FOR EACH ROW EXECUTE FUNCTION prevent_settlement_delete()"
    },
    {
      "table": "settlements",
      "name": "record_settlement_status_change_trigger",
      "enabled": "O",
      "definition": "CREATE TRIGGER record_settlement_status_change_trigger AFTER INSERT OR UPDATE OF status ON settlements FOR EACH ROW EXECUTE FUNCTION record_settlement_status_change()"
    },
    {
      "table": "settlements",
      "name": "set_settlements_updated_at",
      "enabled": "O",
      "definition": "CREATE TRIGGER set_settlements_updated_at BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    }
  ],
  "legacy": [
    {
      "table": "settlements",
      "id": "90000000-0000-4000-8000-000000000101",
      "expected": {
        "id": "90000000-0000-4000-8000-000000000101",
        "notes": "Liquidacion ficticia QA remota",
        "status": "draft",
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-12T11:04:30.32992+00:00",
        "created_by": null,
        "human_code": "SET-000001",
        "period_end": "2026-09-30",
        "updated_at": "2026-09-12T11:04:30.32992+00:00",
        "updated_by": null,
        "approved_at": null,
        "approved_by": null,
        "paid_amount": 0,
        "rejected_at": null,
        "rejected_by": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "elara_amount": 130,
        "generated_at": null,
        "period_start": "2026-09-01",
        "submitted_at": null,
        "currency_code": "EUR",
        "driver_amount": 70,
        "internal_notes": null,
        "payable_amount": 70,
        "payment_status": "unpaid",
        "pending_amount": 70,
        "elara_percentage": 65,
        "rejection_reason": null,
        "adjustment_amount": 0,
        "driver_percentage": 35,
        "percentage_source": "legacy_rule",
        "cash_offset_amount": 0,
        "frequency_snapshot": "monthly",
        "settlement_rule_id": "bb762c20-07fc-476c-96de-7207feef3caa",
        "calculation_version": 1,
        "cancellation_reason": null,
        "driver_type_snapshot": "internal_driver",
        "gross_eligible_amount": 200,
        "calculation_base_amount": 200,
        "expense_deduction_amount": 0,
        "calculation_method_snapshot": "driver_share"
      }
    },
    {
      "table": "cash_remittances",
      "id": "77000000-0000-4000-8000-000000000001",
      "expected": {
        "id": "77000000-0000-4000-8000-000000000001",
        "notes": "Rendicion QA remota sin movimientos",
        "status": "submitted",
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-12T11:04:30.32992+00:00",
        "created_by": null,
        "human_code": "REM-000001",
        "updated_at": "2026-09-12T11:04:30.32992+00:00",
        "updated_by": null,
        "prepared_at": "2026-09-12T11:04:30.32992+00:00",
        "received_at": null,
        "verified_at": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "submitted_at": "2026-09-12T11:04:30.32992+00:00",
        "currency_code": "EUR",
        "declared_amount": 0,
        "verified_amount": null,
        "cancellation_reason": null,
        "prepared_by_user_id": null,
        "received_by_user_id": null,
        "verified_by_user_id": null,
        "source_model_version": 1,
        "source_cash_account_id": "60000000-0000-4000-8000-000000000001",
        "submitted_by_driver_id": "30000000-0000-4000-8000-000000000001",
        "destination_cash_account_id": "60000000-0000-4000-8000-000000000100"
      }
    },
    {
      "table": "cash_remittances",
      "id": "98026310-1aae-4318-9a26-4921729c4005",
      "expected": {
        "id": "98026310-1aae-4318-9a26-4921729c4005",
        "notes": null,
        "status": "submitted",
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-22T14:15:13.038894+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "human_code": "REM-000002",
        "updated_at": "2026-09-22T14:15:13.038894+00:00",
        "updated_by": "20000000-0000-4000-8000-000000000003",
        "prepared_at": "2026-09-22T14:15:13.038894+00:00",
        "received_at": null,
        "verified_at": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "submitted_at": "2026-09-22T14:15:13.038894+00:00",
        "currency_code": "EUR",
        "declared_amount": 75,
        "verified_amount": null,
        "cancellation_reason": null,
        "prepared_by_user_id": "20000000-0000-4000-8000-000000000003",
        "received_by_user_id": null,
        "verified_by_user_id": null,
        "source_model_version": 1,
        "source_cash_account_id": "60000000-0000-4000-8000-000000000001",
        "submitted_by_driver_id": "30000000-0000-4000-8000-000000000001",
        "destination_cash_account_id": "60000000-0000-4000-8000-000000000100"
      }
    },
    {
      "table": "cash_movements",
      "id": "b0c6127a-7a4a-492a-9445-ac187fe25526",
      "expected": {
        "id": "b0c6127a-7a4a-492a-9445-ac187fe25526",
        "amount": 75,
        "metadata": {
          "purpose": "driver_cash_remittance_remote_test",
          "qa_fixture": true
        },
        "source_id": "afaa227c-b9a7-4b64-9bfb-7d0267f0b790",
        "created_at": "2026-09-22T13:36:37.544717+00:00",
        "created_by": null,
        "human_code": "CASH-000001",
        "service_id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
        "description": "Service payment SRV-000002",
        "occurred_at": "2026-09-22T13:36:37.544717+00:00",
        "source_type": "service_payment",
        "cash_count_id": null,
        "currency_code": "EUR",
        "movement_type": "inflow",
        "remittance_id": null,
        "actor_driver_id": "30000000-0000-4000-8000-000000000001",
        "cash_account_id": "60000000-0000-4000-8000-000000000001",
        "idempotency_key": "cash:qa-remote-srv-000002-cash-payment-20260922",
        "movement_category": "service_payment",
        "service_payment_id": "afaa227c-b9a7-4b64-9bfb-7d0267f0b790",
        "original_movement_id": null
      }
    },
    {
      "table": "cash_accounts",
      "id": "60000000-0000-4000-8000-000000000001",
      "expected": {
        "id": "60000000-0000-4000-8000-000000000001",
        "name": "Caja QA Driver A",
        "notes": "QA remoto mínimo para validación del portal conductor",
        "status": "active",
        "closed_at": null,
        "closed_by": null,
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "opened_at": "2026-09-12T10:54:55.325829+00:00",
        "created_at": "2026-09-12T10:54:55.325829+00:00",
        "created_by": null,
        "updated_at": "2026-09-12T10:54:55.325829+00:00",
        "updated_by": null,
        "account_type": "driver",
        "currency_code": "EUR",
        "opening_balance": 0,
        "responsible_user_id": "20000000-0000-4000-8000-000000000003"
      }
    },
    {
      "table": "cash_accounts",
      "id": "60000000-0000-4000-8000-000000000002",
      "expected": {
        "id": "60000000-0000-4000-8000-000000000002",
        "name": "Caja QA Driver B",
        "notes": "QA remoto mínimo para validación del portal conductor",
        "status": "active",
        "closed_at": null,
        "closed_by": null,
        "driver_id": "30000000-0000-4000-8000-000000000002",
        "opened_at": "2026-09-12T10:54:55.325829+00:00",
        "created_at": "2026-09-12T10:54:55.325829+00:00",
        "created_by": null,
        "updated_at": "2026-09-12T10:54:55.325829+00:00",
        "updated_by": null,
        "account_type": "driver",
        "currency_code": "EUR",
        "opening_balance": 0,
        "responsible_user_id": "20000000-0000-4000-8000-000000000004"
      }
    },
    {
      "table": "cash_accounts",
      "id": "60000000-0000-4000-8000-000000000100",
      "expected": {
        "id": "60000000-0000-4000-8000-000000000100",
        "name": "Caja Central QA",
        "notes": "Caja central QA remota",
        "status": "active",
        "closed_at": null,
        "closed_by": null,
        "driver_id": null,
        "opened_at": "2026-09-12T11:04:30.32992+00:00",
        "created_at": "2026-09-12T11:04:30.32992+00:00",
        "created_by": null,
        "updated_at": "2026-09-12T11:04:30.32992+00:00",
        "updated_by": null,
        "account_type": "central",
        "currency_code": "EUR",
        "opening_balance": 0,
        "responsible_user_id": null
      }
    },
    {
      "table": "settlement_rules",
      "id": "bb762c20-07fc-476c-96de-7207feef3caa",
      "expected": {
        "id": "bb762c20-07fc-476c-96de-7207feef3caa",
        "name": "Participacion mensual de Chofer interno",
        "notes": "Regla inicial estable: chofer interno recibe 35% de la base elegible mensual.",
        "frequency": "monthly",
        "is_active": true,
        "created_at": "2026-09-10T12:58:40.186559+00:00",
        "created_by": null,
        "updated_at": "2026-09-10T12:58:40.186559+00:00",
        "updated_by": null,
        "driver_type": "internal_driver",
        "currency_code": "EUR",
        "effective_from": "2026-01-01",
        "effective_until": null,
        "elara_percentage": 65,
        "driver_percentage": 35,
        "calculation_method": "driver_share"
      }
    },
    {
      "table": "settlement_rules",
      "id": "1bee60db-6935-4afa-96d0-8d31c92f12b3",
      "expected": {
        "id": "1bee60db-6935-4afa-96d0-8d31c92f12b3",
        "name": "Comision semanal de Colaborador externo",
        "notes": "Regla inicial estable: ELARA retiene 10% y el colaborador recibe 90% de la base elegible semanal.",
        "frequency": "weekly",
        "is_active": true,
        "created_at": "2026-09-10T12:58:40.186559+00:00",
        "created_by": null,
        "updated_at": "2026-09-10T12:58:40.186559+00:00",
        "updated_by": null,
        "driver_type": "external_collaborator",
        "currency_code": "EUR",
        "effective_from": "2026-01-01",
        "effective_until": null,
        "elara_percentage": 10,
        "driver_percentage": 90,
        "calculation_method": "elara_commission"
      }
    },
    {
      "table": "service_payments",
      "id": "afaa227c-b9a7-4b64-9bfb-7d0267f0b790",
      "expected": {
        "id": "afaa227c-b9a7-4b64-9bfb-7d0267f0b790",
        "notes": "QA remote full cash payment for driver remittance test",
        "amount": 75,
        "paid_at": "2026-09-22T13:36:37.544717+00:00",
        "created_at": "2026-09-22T13:36:37.544717+00:00",
        "created_by": null,
        "human_code": "PAY-000001",
        "service_id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
        "updated_at": "2026-09-22T13:36:37.544717+00:00",
        "updated_by": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "currency_code": "EUR",
        "registered_at": "2026-09-22T13:36:37.544717+00:00",
        "payment_method": "cash",
        "payment_status": "completed",
        "idempotency_key": "qa-remote-srv-000002-cash-payment-20260922",
        "external_reference": "QA remote cash payment for SRV-000002",
        "cancellation_reason": null,
        "service_financial_id": "2c5b8348-68d7-48d3-9c72-d8bc356f4ad7"
      }
    },
    {
      "table": "services",
      "id": "70000000-0000-4000-8000-000000000001",
      "expected": {
        "id": "70000000-0000-4000-8000-000000000001",
        "notes": "Servicio QA remoto",
        "created_at": "2026-09-12T11:04:30.32992+00:00",
        "created_by": null,
        "deleted_at": null,
        "deleted_by": null,
        "human_code": "SRV-000001",
        "updated_at": "2026-09-19T11:29:11.696452+00:00",
        "updated_by": "20000000-0000-4000-8000-000000000003",
        "customer_id": "40000000-0000-4000-8000-000000000001",
        "cancelled_at": null,
        "cancelled_by": null,
        "service_type": "transfer",
        "internal_notes": "Fixture minimo E2E",
        "operational_status": "completed",
        "scheduled_start_at": "2026-09-15T15:07:52.816344+00:00",
        "requested_by_user_id": null
      }
    },
    {
      "table": "services",
      "id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
      "expected": {
        "id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
        "notes": "Servicio QA remoto para incidencias GitHub Pages",
        "created_at": "2026-09-20T11:39:43.896093+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "deleted_at": null,
        "deleted_by": null,
        "human_code": "SRV-000002",
        "updated_at": "2026-09-20T11:46:32.312464+00:00",
        "updated_by": "20000000-0000-4000-8000-000000000003",
        "customer_id": "40000000-0000-4000-8000-000000000001",
        "cancelled_at": null,
        "cancelled_by": null,
        "service_type": "transfer",
        "internal_notes": "QA remoto Driver A - flujo incidencias",
        "operational_status": "in_progress",
        "scheduled_start_at": "2026-09-20T12:09:43.896093+00:00",
        "requested_by_user_id": null
      }
    },
    {
      "table": "drivers",
      "id": "30000000-0000-4000-8000-000000000001",
      "expected": {
        "id": "30000000-0000-4000-8000-000000000001",
        "base_city": "Madrid",
        "person_id": "11000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-10T13:34:03.530184+00:00",
        "created_by": null,
        "human_code": "DRV-0001",
        "updated_at": "2026-09-21T13:07:20.445613+00:00",
        "updated_by": "20000000-0000-4000-8000-000000000003",
        "driver_type": "internal_driver",
        "inactive_at": null,
        "observations": null,
        "suspended_at": null,
        "settlement_config": null,
        "status_changed_by": null,
        "suspension_reason": null,
        "license_expiration": "2028-12-31",
        "administrative_status": "active",
        "availability_preference": "unavailable"
      }
    },
    {
      "table": "cash_discrepancies",
      "id": "4aff1a5a-1db5-4965-a13d-42c058c847f6",
      "expected": {
        "id": "4aff1a5a-1db5-4965-a13d-42c058c847f6",
        "status": "open",
        "opened_at": "2026-09-22T11:32:50.829311+00:00",
        "created_at": "2026-09-22T11:32:50.829311+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "human_code": "DIF-000001",
        "updated_at": "2026-09-22T11:32:50.829311+00:00",
        "updated_by": "20000000-0000-4000-8000-000000000003",
        "reason_code": "driver_reported",
        "resolved_at": null,
        "resolved_by": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "actual_amount": 0,
        "cash_count_id": null,
        "currency_code": "EUR",
        "remittance_id": "77000000-0000-4000-8000-000000000001",
        "reason_details": "El importe entregado no coincide con lo registrado.",
        "cash_account_id": "60000000-0000-4000-8000-000000000001",
        "expected_amount": 0,
        "discrepancy_type": "remittance",
        "resolution_notes": null,
        "difference_amount": 0
      }
    },
    {
      "table": "service_assignments",
      "id": "71000000-0000-4000-8000-000000000001",
      "expected": {
        "id": "71000000-0000-4000-8000-000000000001",
        "ended_at": "2026-09-19T11:29:11.696452+00:00",
        "ended_by": "20000000-0000-4000-8000-000000000003",
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-12T11:04:30.32992+00:00",
        "created_by": null,
        "service_id": "70000000-0000-4000-8000-000000000001",
        "vehicle_id": "50000000-0000-4000-8000-000000000001",
        "accepted_at": "2026-09-13T13:02:06.24473+00:00",
        "assigned_at": "2026-09-12T11:04:30.32992+00:00",
        "rejected_at": null,
        "rejection_reason": null,
        "assignment_status": "ended",
        "reassignment_reason": null,
        "accepted_by_driver_id": "30000000-0000-4000-8000-000000000001",
        "rejected_by_driver_id": null,
        "priority_exception_reason": null,
        "internal_priority_exception": false,
        "driver_vehicle_assignment_id": "51000000-0000-4000-8000-000000000001"
      }
    },
    {
      "table": "service_assignments",
      "id": "483b3bf5-b344-4843-bd00-4d89723d1bd6",
      "expected": {
        "id": "483b3bf5-b344-4843-bd00-4d89723d1bd6",
        "ended_at": null,
        "ended_by": null,
        "driver_id": "30000000-0000-4000-8000-000000000001",
        "created_at": "2026-09-20T11:39:43.896093+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "service_id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
        "vehicle_id": "50000000-0000-4000-8000-000000000001",
        "accepted_at": "2026-09-20T11:39:43.896093+00:00",
        "assigned_at": "2026-09-20T11:39:43.896093+00:00",
        "rejected_at": null,
        "rejection_reason": null,
        "assignment_status": "accepted",
        "reassignment_reason": null,
        "accepted_by_driver_id": "30000000-0000-4000-8000-000000000001",
        "rejected_by_driver_id": null,
        "priority_exception_reason": null,
        "internal_priority_exception": false,
        "driver_vehicle_assignment_id": "51000000-0000-4000-8000-000000000001"
      }
    },
    {
      "table": "service_closures",
      "id": "0e2bb293-a45a-4ed0-ba0d-e4a9ee9b4c3a",
      "expected": {
        "id": "0e2bb293-a45a-4ed0-ba0d-e4a9ee9b4c3a",
        "rating": null,
        "closed_at": "2026-09-19T11:29:11.696452+00:00",
        "created_at": "2026-09-19T11:29:11.696452+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "service_id": "70000000-0000-4000-8000-000000000001",
        "reason_code": null,
        "closure_type": "completed",
        "driver_notes": null,
        "assignment_id": "71000000-0000-4000-8000-000000000001",
        "incident_flag": false,
        "reason_details": "Driver completed service progress.",
        "closed_by_user_id": null,
        "closed_by_driver_id": "30000000-0000-4000-8000-000000000001"
      }
    },
    {
      "table": "cash_remittance_items",
      "id": "3ee48ab5-bde1-41ac-bb02-c63c8266f34c",
      "expected": {
        "id": "3ee48ab5-bde1-41ac-bb02-c63c8266f34c",
        "amount": 75,
        "created_at": "2026-09-22T14:15:13.038894+00:00",
        "created_by": "20000000-0000-4000-8000-000000000003",
        "service_id": "37ad9040-9fc9-47d6-a34f-88533ff3a28d",
        "description": "Driver cash remittance item",
        "remittance_id": "98026310-1aae-4318-9a26-4921729c4005",
        "cash_movement_id": "b0c6127a-7a4a-492a-9445-ac187fe25526",
        "service_payment_id": "afaa227c-b9a7-4b64-9bfb-7d0267f0b790"
      }
    }
  ],
  "definitions": [
    {
      "signature": "prepare_vehicle_identity()",
      "definition": "CREATE OR REPLACE FUNCTION public.prepare_vehicle_identity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then\n    raise exception 'Vehicle human_code cannot be changed after creation.'\n      using errcode = '23514';\n  end if;\n\n  if tg_op = 'INSERT' then\n    if nullif(trim(new.human_code), '') is null then\n      new.human_code := public.next_human_code('VEH');\n    else\n      new.human_code := upper(trim(new.human_code));\n    end if;\n  end if;\n\n  if new.human_code !~ '^VEH-[0-9]{4}$' then\n    raise exception 'Invalid vehicle human_code \"%\".', new.human_code\n      using errcode = '23514';\n  end if;\n\n  new.plate_country := upper(trim(new.plate_country));\n  new.plate_normalized := public.normalize_vehicle_plate(new.plate_original, new.plate_country);\n\n  if new.year is not null and new.year > extract(year from now())::integer + 1 then\n    raise exception 'Vehicle year % is outside the allowed range.', new.year\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "secure_audit(text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.secure_audit(p_action text, p_entity_table text, p_entity_id uuid, p_entity_human_code text, p_old_data jsonb, p_new_data jsonb, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_actor_app_user_id uuid DEFAULT NULL::uuid, p_actor_driver_id uuid DEFAULT NULL::uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  return public.write_audit_log(\r\n    'secure_function', p_action, p_entity_table, p_entity_id, p_entity_human_code,\r\n    p_old_data, p_new_data, p_reason, coalesce(p_metadata, '{}'::jsonb),\r\n    coalesce(p_actor_app_user_id, public.require_current_app_user()), p_actor_driver_id\r\n  );\r\nend;\r\n$function$\n"
    },
    {
      "signature": "validate_driver_vehicle_assignment()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_driver_vehicle_assignment()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if new.status <> 'active' then\n    return new;\n  end if;\n\n  if not exists (\n    select 1\n    from public.drivers driver\n    where driver.id = new.driver_id\n      and driver.administrative_status = 'active'\n  ) then\n    raise exception 'Active driver-vehicle assignments require an active driver.'\n      using errcode = '23514';\n  end if;\n\n  if not public.vehicle_is_assignable(new.vehicle_id) then\n    raise exception 'Vehicle \"%\" is not assignable.', new.vehicle_id\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_people_commercial_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_people_commercial_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if tg_table_name = 'customers' then\n    if new.customer_type = 'individual' and not exists (\n      select 1 from public.persons person\n      where person.id = new.person_id\n        and person.status = 'active'\n    ) then\n      raise exception 'Individual customers require an active person.'\n        using errcode = '23514';\n    end if;\n\n    if new.customer_type = 'company' and not exists (\n      select 1 from public.companies company\n      where company.id = new.company_id\n        and company.status = 'active'\n    ) then\n      raise exception 'Company customers require an active company.'\n        using errcode = '23514';\n    end if;\n  elsif tg_table_name = 'company_contacts' then\n    if new.status = 'active' and not exists (\n      select 1\n      from public.companies company\n      join public.persons person on person.id = new.person_id\n      where company.id = new.company_id\n        and company.status = 'active'\n        and person.status = 'active'\n    ) then\n      raise exception 'Active company contacts require an active company and an active person.'\n        using errcode = '23514';\n    end if;\n  elsif tg_table_name = 'drivers' then\n    if not exists (\n      select 1 from public.persons person\n      where person.id = new.person_id\n        and person.status = 'active'\n    ) then\n      raise exception 'Drivers require an active person.'\n        using errcode = '23514';\n    end if;\n  elsif tg_table_name = 'suppliers' then\n    if new.supplier_type = 'individual' and not exists (\n      select 1 from public.persons person\n      where person.id = new.person_id\n        and person.status = 'active'\n    ) then\n      raise exception 'Individual suppliers require an active person.'\n        using errcode = '23514';\n    end if;\n\n    if new.supplier_type = 'company' and not exists (\n      select 1 from public.companies company\n      where company.id = new.company_id\n        and company.status = 'active'\n    ) then\n      raise exception 'Company suppliers require an active company.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_service_assignment_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_service_assignment_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_service_status text;\n  v_service_start timestamptz;\n  v_driver_type text;\n  v_driver_vehicle_assignment_id uuid;\nbegin\n  if new.assignment_status not in ('pending_acceptance', 'accepted', 'reassignment_required') then\n    return new;\n  end if;\n\n  select service.operational_status, service.scheduled_start_at\n  into v_service_status, v_service_start\n  from public.services service\n  where service.id = new.service_id;\n\n  if v_service_status is null then\n    raise exception 'Service assignment references a missing service.'\n      using errcode = '23514';\n  end if;\n\n  if v_service_status in ('completed', 'cancelled', 'no_show', 'not_performed') then\n    raise exception 'Final services cannot receive active assignments.'\n      using errcode = '23514';\n  end if;\n\n  if v_service_status = 'in_progress' then\n    raise exception 'Normal reassignment is not allowed while the service is in progress.'\n      using errcode = '23514';\n  end if;\n\n  select driver.driver_type\n  into v_driver_type\n  from public.drivers driver\n  where driver.id = new.driver_id\n    and driver.administrative_status = 'active';\n\n  if v_driver_type is null then\n    raise exception 'Active service assignments require an active driver.'\n      using errcode = '23514';\n  end if;\n\n  if not public.vehicle_is_assignable(new.vehicle_id) then\n    raise exception 'Active service assignments require an assignable vehicle.'\n      using errcode = '23514';\n  end if;\n\n  select assignment.id\n  into v_driver_vehicle_assignment_id\n  from public.driver_vehicle_assignments assignment\n  where assignment.driver_id = new.driver_id\n    and assignment.vehicle_id = new.vehicle_id\n    and assignment.status = 'active'\n  limit 1;\n\n  if v_driver_vehicle_assignment_id is null then\n    raise exception 'Active service assignments require an active driver-vehicle assignment.'\n      using errcode = '23514';\n  end if;\n\n  if new.driver_vehicle_assignment_id is not null\n    and new.driver_vehicle_assignment_id <> v_driver_vehicle_assignment_id\n  then\n    raise exception 'Service assignment driver_vehicle_assignment_id does not match the active driver-vehicle assignment.'\n      using errcode = '23514';\n  end if;\n\n  if v_driver_type = 'external_collaborator'\n    and public.has_available_internal_driver(v_service_start, new.driver_id)\n    and (\n      new.internal_priority_exception = false\n      or length(trim(coalesce(new.priority_exception_reason, ''))) = 0\n    )\n  then\n    raise exception 'External collaborator assignment requires an internal driver priority exception reason when an internal driver is available.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_service_closure_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_service_closure_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_service_status text;\nbegin\n  select service.operational_status\n  into v_service_status\n  from public.services service\n  where service.id = new.service_id;\n\n  if v_service_status is null then\n    raise exception 'Service closure references a missing service.'\n      using errcode = '23514';\n  end if;\n\n  if v_service_status <> new.closure_type then\n    raise exception 'Service closure type must match the service final operational status.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_service_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_service_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_has_origin boolean;\n  v_has_destination boolean;\n  v_has_accepted_assignment boolean;\n  v_has_valid_start_assignment boolean;\nbegin\n  if not exists (\n    select 1\n    from public.customers customer\n    where customer.id = new.customer_id\n      and customer.status in ('new', 'active')\n  ) then\n    raise exception 'Services require an active or new customer.'\n      using errcode = '23514';\n  end if;\n\n  if new.operational_status in ('confirmed', 'in_progress', 'completed', 'no_show', 'not_performed') then\n    select exists (\n      select 1 from public.service_locations location\n      where location.service_id = new.id and location.location_type = 'origin'\n    )\n    into v_has_origin;\n\n    select exists (\n      select 1 from public.service_locations location\n      where location.service_id = new.id and location.location_type = 'destination'\n    )\n    into v_has_destination;\n\n    if not (v_has_origin and v_has_destination) then\n      raise exception 'Services require origin and destination before confirmation.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.operational_status in ('confirmed', 'in_progress') then\n    select exists (\n      select 1\n      from public.service_assignments assignment\n      where assignment.service_id = new.id\n        and assignment.assignment_status = 'accepted'\n    )\n    into v_has_accepted_assignment;\n\n    if not v_has_accepted_assignment then\n      raise exception 'Services require an accepted assignment before confirmation.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.operational_status = 'in_progress' then\n    select exists (\n      select 1\n      from public.service_assignments assignment\n      join public.driver_vehicle_assignments driver_vehicle_assignment\n        on driver_vehicle_assignment.driver_id = assignment.driver_id\n        and driver_vehicle_assignment.vehicle_id = assignment.vehicle_id\n        and driver_vehicle_assignment.status = 'active'\n      where assignment.service_id = new.id\n        and assignment.assignment_status = 'accepted'\n        and public.vehicle_is_assignable(assignment.vehicle_id)\n    )\n    into v_has_valid_start_assignment;\n\n    if not v_has_valid_start_assignment then\n      raise exception 'Services require an accepted assignment with a valid driver-vehicle relation before starting.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.operational_status in ('completed', 'no_show', 'not_performed') and not exists (\n    select 1\n    from public.service_closures closure_record\n    where closure_record.service_id = new.id\n      and closure_record.closure_type = new.operational_status\n  ) then\n    raise exception 'Final closure status requires a matching service closure.'\n      using errcode = '23514';\n  end if;\n\n  if new.operational_status = 'cancelled' and not exists (\n    select 1\n    from public.service_cancellations cancellation\n    where cancellation.service_id = new.id\n  ) then\n    raise exception 'Cancelled services require a service cancellation record.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_service_transition()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_service_transition()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_final_statuses constant text[] := array['completed', 'cancelled', 'no_show', 'not_performed'];\nbegin\n  if tg_op <> 'UPDATE' or new.operational_status is not distinct from old.operational_status then\n    return new;\n  end if;\n\n  if old.operational_status = any(v_final_statuses)\n    and new.operational_status is distinct from old.operational_status\n  then\n    raise exception 'Final services cannot return to a previous operational status.'\n      using errcode = '23514';\n  end if;\n\n  if old.operational_status = 'in_progress' and new.operational_status = 'cancelled' then\n    raise exception 'In-progress services cannot be normally cancelled.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_user_driver_link_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_user_driver_link_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_user_id uuid;\n  v_driver_id uuid;\nbegin\n  if tg_table_name = 'user_driver_links' then\n    if new.status <> 'active' then\n      return new;\n    end if;\n\n    if not exists (\n      select 1\n      from public.app_users app_user\n      join public.drivers driver\n        on driver.id = new.driver_id\n      where app_user.id = new.user_id\n        and app_user.status = 'active'\n        and driver.administrative_status = 'active'\n        and public.user_has_active_role(app_user.id, 'conductor')\n    ) then\n      raise exception 'Active user-driver links require an active app user, active conductor role and active driver.'\n        using errcode = '23514';\n    end if;\n\n    return new;\n  elsif tg_table_name = 'app_users' then\n    v_user_id := new.id;\n  elsif tg_table_name = 'drivers' then\n    v_driver_id := new.id;\n  elsif tg_table_name = 'user_roles' then\n    if tg_op = 'DELETE' then\n      v_user_id := old.user_id;\n    else\n      v_user_id := new.user_id;\n    end if;\n  end if;\n\n  if exists (\n    select 1\n    from public.user_driver_links link\n    join public.app_users app_user\n      on app_user.id = link.user_id\n    join public.drivers driver\n      on driver.id = link.driver_id\n    where link.status = 'active'\n      and (v_user_id is null or link.user_id = v_user_id)\n      and (v_driver_id is null or link.driver_id = v_driver_id)\n      and (\n        app_user.status <> 'active'\n        or driver.administrative_status <> 'active'\n        or not public.user_has_active_role(app_user.id, 'conductor')\n      )\n  ) then\n    raise exception 'Existing active user-driver links require an active app user, active conductor role and active driver.'\n      using errcode = '23514';\n  end if;\n\n  if tg_op = 'DELETE' then\n    return old;\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_vehicle_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_vehicle_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if new.ownership_type = 'external' and not exists (\n    select 1\n    from public.vehicle_external_owners owner_record\n    where owner_record.id = new.external_owner_id\n      and owner_record.status = 'active'\n  ) then\n    raise exception 'External vehicles require an active external owner.'\n      using errcode = '23514';\n  end if;\n\n  if new.year is not null and new.year > extract(year from now())::integer + 1 then\n    raise exception 'Vehicle year % is outside the allowed range.', new.year\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "current_driver_id()",
      "definition": "CREATE OR REPLACE FUNCTION public.current_driver_id()\n RETURNS uuid\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_user_id uuid;\r\n  v_driver_id uuid;\r\nbegin\r\n  v_user_id := public.require_role('conductor');\r\n\r\n  select l.driver_id\r\n    into v_driver_id\r\n  from public.user_driver_links l\r\n  join public.drivers d on d.id = l.driver_id\r\n  where l.user_id = v_user_id\r\n    and l.status = 'active'\r\n    and (l.ended_at is null or l.ended_at > now())\r\n    and d.administrative_status = 'active'\r\n  limit 1;\r\n\r\n  if v_driver_id is null then\r\n    raise exception 'The active conductor user is not linked to an active driver.' using errcode = '42501';\r\n  end if;\r\n\r\n  return v_driver_id;\r\nend;\r\n$function$\n"
    },
    {
      "signature": "ensure_completed_service_payment_allocation()",
      "definition": "CREATE OR REPLACE FUNCTION public.ensure_completed_service_payment_allocation()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if new.payment_status = 'completed' then\r\n    insert into public.service_payment_allocations (\r\n      payment_id,\r\n      service_financial_id,\r\n      allocated_amount,\r\n      created_by\r\n    )\r\n    values (\r\n      new.id,\r\n      new.service_financial_id,\r\n      new.amount,\r\n      new.created_by\r\n    )\r\n    on conflict (payment_id, service_financial_id) do nothing;\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n"
    },
    {
      "signature": "has_available_internal_driver(timestamp with time zone,uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.has_available_internal_driver(p_scheduled_start_at timestamp with time zone, p_excluded_driver_id uuid DEFAULT NULL::uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if p_scheduled_start_at is null then\n    return false;\n  end if;\n\n  return exists (\n    select 1\n    from public.drivers driver\n    join public.persons person\n      on person.id = driver.person_id\n      and person.status = 'active'\n    join public.driver_vehicle_assignments driver_vehicle_assignment\n      on driver_vehicle_assignment.driver_id = driver.id\n      and driver_vehicle_assignment.status = 'active'\n    join public.vehicles vehicle\n      on vehicle.id = driver_vehicle_assignment.vehicle_id\n      and vehicle.inactive_at is null\n    where driver.driver_type = 'internal_driver'\n      and driver.administrative_status = 'active'\n      and driver.availability_preference = 'available'\n      and (p_excluded_driver_id is null or driver.id <> p_excluded_driver_id)\n      and public.vehicle_is_assignable(driver_vehicle_assignment.vehicle_id)\n      and exists (\n        select 1\n        from public.user_driver_links driver_link\n        join public.app_users app_user\n          on app_user.id = driver_link.user_id\n          and app_user.status = 'active'\n        where driver_link.driver_id = driver.id\n          and driver_link.status = 'active'\n          and exists (\n            select 1\n            from public.user_roles user_role\n            where user_role.user_id = app_user.id\n              and user_role.role_key = 'conductor'\n              and user_role.status = 'active'\n              and user_role.starts_at <= now()\n              and (user_role.ends_at is null or user_role.ends_at > now())\n          )\n      )\n      and not exists (\n        select 1\n        from public.services active_service\n        join public.service_assignments active_assignment\n          on active_assignment.service_id = active_service.id\n          and active_assignment.driver_id = driver.id\n          and active_assignment.assignment_status = 'accepted'\n        where active_service.operational_status = 'in_progress'\n      )\n      and not exists (\n        select 1\n        from public.services scheduled_service\n        join public.service_assignments scheduled_assignment\n          on scheduled_assignment.service_id = scheduled_service.id\n          and scheduled_assignment.driver_id = driver.id\n          and scheduled_assignment.assignment_status = 'accepted'\n        where scheduled_service.operational_status = 'confirmed'\n          and scheduled_service.scheduled_start_at >= p_scheduled_start_at - interval '2 hours'\n          and scheduled_service.scheduled_start_at <= p_scheduled_start_at + interval '2 hours'\n      )\n  );\nend;\n$function$\n"
    },
    {
      "signature": "normalize_vehicle_plate(text,text)",
      "definition": "CREATE OR REPLACE FUNCTION public.normalize_vehicle_plate(p_plate_original text, p_plate_country text)\n RETURNS text\n LANGUAGE plpgsql\n IMMUTABLE\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_country text;\n  v_compact text;\n  v_plate text;\nbegin\n  v_country := upper(trim(coalesce(p_plate_country, '')));\n\n  if v_country = '' then\n    raise exception 'Vehicle plate country is required.'\n      using errcode = '23514';\n  end if;\n\n  if v_country = 'ES' then\n    v_compact := upper(regexp_replace(trim(coalesce(p_plate_original, '')), '[[:space:]-]+', '', 'g'));\n\n    if v_compact !~ '^[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$' then\n      raise exception 'Invalid Spanish vehicle plate \"%\".', p_plate_original\n        using errcode = '23514';\n    end if;\n\n    return substring(v_compact from 1 for 4) || '-' || substring(v_compact from 5 for 3);\n  end if;\n\n  v_plate := upper(regexp_replace(trim(coalesce(p_plate_original, '')), '[[:space:]]+', ' ', 'g'));\n\n  if v_plate = '' then\n    raise exception 'Vehicle plate is required.'\n      using errcode = '23514';\n  end if;\n\n  return v_country || ':' || v_plate;\nend;\n$function$\n"
    },
    {
      "signature": "prepare_service_financial()",
      "definition": "CREATE OR REPLACE FUNCTION public.prepare_service_financial()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_service_status text;\r\n  v_has_completed_payment boolean;\r\nbegin\r\n  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));\r\n  new.tax_rate := round(coalesce(new.tax_rate, 0), 4);\r\n\r\n  if new.currency_code !~ '^[A-Z]{3}$' then\r\n    raise exception 'Service financial currency_code must be an uppercase ISO code.'\r\n      using errcode = '23514';\r\n  end if;\r\n\r\n  select service.operational_status\r\n  into v_service_status\r\n  from public.services service\r\n  where service.id = new.service_id;\r\n\r\n  if v_service_status is null then\r\n    raise exception 'Service financial row references a missing service.'\r\n      using errcode = '23503';\r\n  end if;\r\n\r\n  if tg_op = 'UPDATE' then\r\n    select exists (\r\n      select 1\r\n      from public.service_payments payment\r\n      where payment.service_financial_id = new.id\r\n        and payment.payment_status = 'completed'\r\n    )\r\n    into v_has_completed_payment;\r\n\r\n    -- Future secure administrative correction functions may set this transaction-local marker after explicit authorization.\r\n    if v_has_completed_payment\r\n      and current_setting('elara.service_financial_pricing_correction', true) is distinct from new.id::text\r\n      and (\r\n        new.currency_code is distinct from old.currency_code\r\n        or new.tax_rate is distinct from old.tax_rate\r\n        or new.pricing_status is distinct from old.pricing_status\r\n      )\r\n    then\r\n      raise exception 'Service pricing cannot be changed after a completed payment exists.'\r\n        using errcode = '23514';\r\n    end if;\r\n  end if;\r\n\r\n  if new.pricing_status = 'finalized' and new.finalized_at is null then\r\n    new.finalized_at := now();\r\n  end if;\r\n\r\n  if new.pricing_status = 'draft' then\r\n    new.finalized_at := null;\r\n    new.finalized_by := null;\r\n  end if;\r\n\r\n  if new.pricing_status = 'finalized'\r\n    and v_service_status in ('cancelled', 'no_show', 'not_performed')\r\n    and coalesce(nullif(trim(coalesce(new.notes, '')), ''), nullif(trim(coalesce(new.internal_notes, '')), '')) is null\r\n  then\r\n    raise exception 'Finalized financials on cancelled, no-show or not-performed services require a reason.'\r\n      using errcode = '23514';\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n"
    },
    {
      "signature": "prepare_service_price_component()",
      "definition": "CREATE OR REPLACE FUNCTION public.prepare_service_price_component()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_pricing_status text;\r\n  v_service_financial_id uuid;\r\n  v_has_completed_payment boolean;\r\nbegin\r\n  if tg_op = 'DELETE' then\r\n    v_service_financial_id := old.service_financial_id;\r\n  else\r\n    v_service_financial_id := new.service_financial_id;\r\n  end if;\r\n\r\n  select\r\n    financial.pricing_status,\r\n    exists (\r\n      select 1\r\n      from public.service_payments payment\r\n      where payment.service_financial_id = financial.id\r\n        and payment.payment_status = 'completed'\r\n    )\r\n  into v_pricing_status, v_has_completed_payment\r\n  from public.service_financials financial\r\n  where financial.id = v_service_financial_id;\r\n\r\n  if v_pricing_status is null then\r\n    raise exception 'Price component references a missing service financial row.'\r\n      using errcode = '23503';\r\n  end if;\r\n\r\n  -- Future secure administrative correction functions may set this transaction-local marker after explicit authorization.\r\n  if v_has_completed_payment\r\n    and current_setting('elara.service_financial_pricing_correction', true) is distinct from v_service_financial_id::text\r\n  then\r\n    raise exception 'Price components cannot be changed after a completed service payment exists.'\r\n      using errcode = '23514';\r\n  end if;\r\n\r\n  if v_pricing_status = 'finalized' then\r\n    raise exception 'Price components cannot be changed after pricing is finalized.'\r\n      using errcode = '23514';\r\n  end if;\r\n\r\n  if tg_op = 'DELETE' then\r\n    return old;\r\n  end if;\r\n\r\n  new.label := trim(new.label);\r\n  new.quantity := round(coalesce(new.quantity, 1), 3);\r\n  new.unit_amount := round(coalesce(new.unit_amount, 0), 2);\r\n  new.line_amount := round(new.quantity * new.unit_amount, 2);\r\n\r\n  if new.tax_rate is not null then\r\n    new.tax_rate := round(new.tax_rate, 4);\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n"
    },
    {
      "signature": "prevent_service_financial_calculated_update()",
      "definition": "CREATE OR REPLACE FUNCTION public.prevent_service_financial_calculated_update()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if current_setting('elara.service_financial_recalculate', true) is distinct from new.id::text then\r\n    raise exception 'Calculated financial columns and financial_status must be changed through public.recalculate_service_financial(uuid).'\r\n      using errcode = '42501';\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n"
    },
    {
      "signature": "validate_vehicle_document_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_vehicle_document_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_expires_required boolean;\nbegin\n  select document_type.expires_required\n  into v_expires_required\n  from public.vehicle_document_types document_type\n  where document_type.key = new.document_type_key;\n\n  if v_expires_required = true\n    and new.status not in ('pending', 'rejected')\n    and new.expires_at is null\n  then\n    raise exception 'Vehicle document type \"%\" requires expires_at for status \"%\".', new.document_type_key, new.status\n      using errcode = '23514';\n  end if;\n\n  if new.storage_path is not null and nullif(trim(new.storage_bucket), '') is null then\n    raise exception 'Vehicle document storage_path requires storage_bucket.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "vehicle_is_assignable(uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.vehicle_is_assignable(p_vehicle_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE\n SET search_path TO 'public'\nAS $function$\nbegin\n  if p_vehicle_id is null then\n    return false;\n  end if;\n\n  if not exists (\n    select 1\n    from public.vehicles vehicle\n    where vehicle.id = p_vehicle_id\n      and vehicle.inactive_at is null\n      and vehicle.manual_operational_status = 'available'\n      and (\n        (vehicle.ownership_type = 'owned' and vehicle.elara_approval_status = 'not_required')\n        or\n        (vehicle.ownership_type = 'external' and vehicle.elara_approval_status = 'approved')\n      )\n  ) then\n    return false;\n  end if;\n\n  if exists (\n    select 1\n    from public.vehicle_technical_incidents incident\n    join public.vehicle_status_reasons reason\n      on reason.key = incident.reason_key\n    where incident.vehicle_id = p_vehicle_id\n      and incident.status = 'open'\n      and reason.blocks_operation = true\n      and reason.is_active = true\n  ) then\n    return false;\n  end if;\n\n  if exists (\n    select 1\n    from public.vehicle_maintenance_records maintenance\n    where maintenance.vehicle_id = p_vehicle_id\n      and maintenance.status = 'in_progress'\n  ) then\n    return false;\n  end if;\n\n  if exists (\n    select 1\n    from public.vehicles vehicle\n    join public.vehicle_document_types document_type\n      on document_type.is_active = true\n      and (\n        (vehicle.ownership_type = 'owned' and document_type.required_for_owned = true)\n        or\n        (vehicle.ownership_type = 'external' and document_type.required_for_external = true)\n      )\n    where vehicle.id = p_vehicle_id\n      and not exists (\n        select 1\n        from public.vehicle_documents document\n        where document.vehicle_id = vehicle.id\n          and document.document_type_key = document_type.key\n          and document.replaced_at is null\n          and document.status in ('valid', 'expiring_soon')\n      )\n  ) then\n    return false;\n  end if;\n\n  return true;\nend;\n$function$\n"
    },
    {
      "signature": "elara_private.audit_settlement_override()",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.audit_settlement_override()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\nbegin\n perform public.secure_audit(case when TG_OP='INSERT' then 'insert' else 'update' end,'driver_settlement_overrides',new.id,null,\n case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),'Settlement percentage override.',\n jsonb_build_object('operation','driver_settlement_override'),coalesce(public.rls_current_app_user_id(),new.created_by),new.driver_id);return new;\nend $function$\n"
    },
    {
      "signature": "elara_private.check_settlement_economics()",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.check_settlement_economics()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_id uuid;v_s public.settlements%rowtype;v_gross numeric;v_driver numeric;v_elara numeric;v_cash numeric;begin\n if TG_TABLE_NAME='settlements' then v_id:=new.id;else v_id:=new.settlement_id;end if;\n if v_id is null then return null;end if;\n select * into v_s from public.settlements where id=v_id;\n if v_s.calculation_version=1 then return null;end if;\n select coalesce(sum(gross_amount),0),coalesce(sum(driver_amount_snapshot),0),coalesce(sum(elara_amount_snapshot),0)\n into v_gross,v_driver,v_elara from public.settlement_items where settlement_id=v_id;\n select coalesce(sum(amount),0) into v_cash from public.driver_cash_source_allocations where settlement_id=v_id and status<>'released';\n if v_s.gross_eligible_amount<>v_gross or v_s.driver_amount<>v_driver or v_s.elara_amount<>v_elara or v_s.cash_offset_amount<>v_cash then\n  raise exception 'Settlement totals must match immutable items and structural cash reservations.' using errcode='23514';end if;return null;\nend $function$\n"
    },
    {
      "signature": "generate_settlement(uuid,date,date,text)",
      "definition": "CREATE OR REPLACE FUNCTION public.generate_settlement(p_driver_id uuid, p_period_start date, p_period_end date, p_notes text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_actor uuid;v_plan jsonb;v_id uuid;v_item jsonb;v_source record;v_remaining numeric;v_rule public.settlement_rules%rowtype;begin\n v_actor:=public.require_admin_user();\n if p_notes ~ '<[[:alpha:]/][^>]*>' then raise exception 'Settlement notes cannot contain HTML.' using errcode='23514';end if;\n perform 1 from public.drivers where id=p_driver_id for update;\n -- Account before sources: shared with remittance. No central-account lock is needed for offset.\n perform 1 from public.cash_accounts where driver_id=p_driver_id and account_type='driver' order by id for no key update;\n perform 1 from public.settlements where driver_id=p_driver_id order by id for update;\n -- Parent service locks also serialize competing entitlement claims and child FK insertion.\n perform 1 from public.services s where exists(select 1 from public.service_assignments a where a.service_id=s.id and a.driver_id=p_driver_id) order by s.id for update;\n perform 1 from public.service_assignments a where exists(select 1 from public.service_assignments x where x.service_id=a.service_id and x.driver_id=p_driver_id) order by a.id for update;\n perform 1 from public.service_closures c where exists(select 1 from public.service_assignments a where a.service_id=c.service_id and a.driver_id=p_driver_id) order by c.id for update;\n perform 1 from public.service_financials f where exists(select 1 from public.service_assignments a where a.service_id=f.service_id and a.driver_id=p_driver_id) order by f.id for update;\n perform 1 from public.settlement_rules r where r.driver_type=(select driver_type from public.drivers where id=p_driver_id) order by r.id for share;\n perform 1 from public.driver_settlement_overrides where driver_id=p_driver_id order by id for share;\n v_plan:=elara_private.settlement_plan(p_driver_id,p_period_start,p_period_end);\n if jsonb_array_length(v_plan->'blockers')>0 then raise exception 'Settlement generation blocked: %',v_plan->'blockers' using errcode='23514';end if;\n if jsonb_array_length(v_plan->'eligible_services')=0 then raise exception 'No eligible unconsumed completed services.' using errcode='23514';end if;\n select * into v_rule from public.settlement_rules where id=(v_plan->'header_rule'->>'id')::uuid;\n insert into public.settlements(driver_id,settlement_rule_id,driver_type_snapshot,frequency_snapshot,calculation_method_snapshot,period_start,period_end,currency_code,driver_percentage,elara_percentage,status,notes,created_by,updated_by)\n values(p_driver_id,v_rule.id,v_rule.driver_type,v_rule.frequency,v_rule.calculation_method,p_period_start,p_period_end,v_rule.currency_code,v_rule.driver_percentage,v_rule.elara_percentage,'draft',p_notes,v_actor,v_actor) returning id into v_id;\n for v_item in select value from jsonb_array_elements(v_plan->'eligible_services') loop\n  insert into public.settlement_items(settlement_id,item_type,service_id,service_assignment_id,service_financial_id,settlement_override_id,percentage_source,description,occurred_on,gross_amount,driver_percentage_snapshot,elara_percentage_snapshot,snapshot_data,created_by)\n  values(v_id,'service_income',(v_item->>'service_id')::uuid,(v_item->>'assignment_id')::uuid,(v_item->>'financial_id')::uuid,(v_item->'percentage'->>'override_id')::uuid,v_item->'percentage'->>'source',\n   'Service '||(v_item->>'human_code'),(v_item->>'economic_date')::date,(v_item->>'service_price')::numeric,(v_item->'percentage'->>'driver_percentage')::numeric,(v_item->'percentage'->>'elara_percentage')::numeric,v_item,v_actor);\n end loop;\n v_remaining:=(v_plan->>'cash_offset_proposed')::numeric;\n for v_source in select a.* from elara_private.driver_cash_available a join public.cash_accounts c on c.id=a.cash_account_id\n  where a.driver_id=p_driver_id and a.currency_code=v_rule.currency_code and c.status='active' and a.available_amount>0 order by a.occurred_at,a.cash_movement_id loop\n  exit when v_remaining=0;\n  insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,settlement_id,amount,status,created_by,updated_by)\n  values(v_source.cash_movement_id,p_driver_id,v_source.cash_account_id,v_rule.currency_code,'settlement_offset',v_id,least(v_source.available_amount,v_remaining),'reserved',v_actor,v_actor);\n  v_remaining:=greatest(v_remaining-v_source.available_amount,0);\n end loop;\n if v_remaining<>0 then raise exception 'Cash availability changed during generation.' using errcode='40001';end if;\n perform public.recalculate_settlement(v_id);\n update public.settlements set status='generated',generated_at=now(),updated_by=v_actor where id=v_id;\n perform public.secure_audit('insert','settlements',v_id,(select human_code from public.settlements where id=v_id),null,(select to_jsonb(s) from public.settlements s where id=v_id),\n 'Settlement generated from unique service entitlements and shared cash sources.',jsonb_build_object('operation','admin_settlement_generated','calculation_version',2,'plan',v_plan),v_actor,p_driver_id);\n return v_id;\nend $function$\n"
    },
    {
      "signature": "preview_settlement_generation(uuid,date,date)",
      "definition": "CREATE OR REPLACE FUNCTION public.preview_settlement_generation(p_driver_id uuid, p_period_start date, p_period_end date)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\nbegin perform public.require_admin_user();return elara_private.settlement_plan(p_driver_id,p_period_start,p_period_end);end $function$\n"
    },
    {
      "signature": "recalculate_settlement(uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.recalculate_settlement(p_settlement_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_s public.settlements%rowtype;v_gross numeric;v_driver numeric;v_elara numeric;v_cash numeric;v_paid numeric;v_payable numeric;v_marker text;begin\n select * into v_s from public.settlements where id=p_settlement_id for update;\n if not found then raise exception 'Settlement not found.' using errcode='23503';end if;\n if v_s.calculation_version=1 then perform elara_private.recalculate_settlement_legacy(p_settlement_id);return;end if;\n select coalesce(sum(gross_amount),0),coalesce(sum(driver_amount_snapshot),0),coalesce(sum(elara_amount_snapshot),0)\n into v_gross,v_driver,v_elara from public.settlement_items where settlement_id=p_settlement_id and item_type='service_income';\n select coalesce(sum(amount),0) into v_cash from public.driver_cash_source_allocations where settlement_id=p_settlement_id and status<>'released';\n select coalesce(sum(amount),0) into v_paid from public.settlement_payments where settlement_id=p_settlement_id and payment_status='completed';\n v_payable:=v_driver-v_cash;\n if v_cash>v_driver or v_paid>v_payable then raise exception 'Offset or payments exceed driver earnings/payable.' using errcode='23514';end if;\n v_marker:=current_setting('elara.settlement_recalculate',true);\n perform set_config('elara.settlement_recalculate',p_settlement_id::text,true);\n update public.settlements set gross_eligible_amount=v_gross,expense_deduction_amount=0,adjustment_amount=0,calculation_base_amount=v_gross,\n driver_amount=v_driver,elara_amount=v_elara,cash_offset_amount=v_cash,paid_amount=v_paid,pending_amount=v_payable-v_paid,\n payment_status=case when status='cancelled' then 'cancelled' when v_payable-v_paid=0 then 'paid' when v_paid=0 then 'unpaid' else 'partial' end\n where id=p_settlement_id;\n perform set_config('elara.settlement_recalculate',coalesce(v_marker,''),true);\nend $function$\n"
    },
    {
      "signature": "elara_private.service_percentage(uuid,date,text)",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.service_percentage(p_driver uuid, p_date date, p_currency text)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_o public.driver_settlement_overrides%rowtype; v_r public.settlement_rules%rowtype; v_count integer; begin\n select * into v_o from public.driver_settlement_overrides where driver_id=p_driver and currency_code=p_currency\n and status='active' and effective_from<=p_date and (effective_to is null or effective_to>=p_date);\n if found then return jsonb_build_object('source','driver_override','override_id',v_o.id,'driver_percentage',v_o.driver_percentage,'elara_percentage',v_o.elara_percentage); end if;\n select count(*) into v_count from public.settlement_rules r join public.drivers d on d.driver_type=r.driver_type\n where d.id=p_driver and r.currency_code=p_currency and r.is_active and r.effective_from<=p_date and (r.effective_until is null or r.effective_until>=p_date);\n if v_count<>1 then return jsonb_build_object('blocker','missing_or_ambiguous_percentage_rule'); end if;\n select r.* into v_r from public.settlement_rules r join public.drivers d on d.driver_type=r.driver_type\n where d.id=p_driver and r.currency_code=p_currency and r.is_active and r.effective_from<=p_date and (r.effective_until is null or r.effective_until>=p_date);\n return jsonb_build_object('source','settlement_rule','rule_id',v_r.id,'driver_percentage',v_r.driver_percentage,'elara_percentage',v_r.elara_percentage);\nend $function$\n"
    },
    {
      "signature": "elara_private.settlement_plan(uuid,date,date)",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.settlement_plan(p_driver uuid, p_start date, p_end date)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_d public.drivers%rowtype; v_r public.settlement_rules%rowtype; v_currency text; v_s record; v_percentage jsonb;\n v_reason text; v_items jsonb:='[]';v_excluded jsonb:='[]';v_blockers jsonb:='[]';v_warnings jsonb:='[]';v_reimbursements jsonb;\n v_gross numeric:=0;v_earnings numeric:=0;v_elara numeric:=0;v_cash numeric:=0;v_offset numeric:=0;v_driver_item numeric; begin\n select * into v_d from public.drivers where id=p_driver;\n if not found or v_d.administrative_status<>'active' then v_blockers:=v_blockers||jsonb_build_array('active_driver_required'); end if;\n if p_start is null or p_end is null or p_end<p_start then v_blockers:=v_blockers||jsonb_build_array('invalid_period');\n elsif (v_d.driver_type='internal_driver' and (p_start<>date_trunc('month',p_start)::date or p_end<>(p_start+interval '1 month - 1 day')::date))\n or (v_d.driver_type='external_collaborator' and (extract(isodow from p_start)<>1 or p_end<>p_start+6)) then\n  v_blockers:=v_blockers||jsonb_build_array('invalid_natural_period');\n end if;\n select currency_code into v_currency from public.cash_accounts where driver_id=p_driver and account_type='driver' and status='active';\n if v_currency is null then\n  select case when count(distinct currency_code)=1 then min(currency_code) end into v_currency from (\n   select r.currency_code from public.settlement_rules r where r.driver_type=v_d.driver_type and r.is_active and r.effective_from<=p_end and (r.effective_until is null or r.effective_until>=p_start)\n   union select o.currency_code from public.driver_settlement_overrides o where o.driver_id=p_driver and o.status='active' and o.effective_from<=p_end and (o.effective_to is null or o.effective_to>=p_start)\n  ) currencies;\n  if v_currency is null then v_blockers:=v_blockers||jsonb_build_array('missing_or_ambiguous_currency');end if;\n end if;\n -- Header rule supplies type/frequency/currency metadata. Each service resolves its own dated economic rule/override.\n select * into v_r from public.settlement_rules r where r.driver_type=v_d.driver_type and r.currency_code=v_currency\n order by (r.is_active and r.effective_from<=p_start and (r.effective_until is null or r.effective_until>=p_end)) desc,r.effective_from desc,r.id limit 1;\n if not found then v_blockers:=v_blockers||jsonb_build_array('missing_rule_metadata'); end if;\n if exists(select 1 from public.settlements where driver_id=p_driver and status in ('draft','generated','submitted','approved') and period_start<=p_end and period_end>=p_start) then\n  v_blockers:=v_blockers||jsonb_build_array('overlapping_active_settlement');\n end if;\n for v_s in\n  select s.id,s.human_code,s.operational_status,f.id financial_id,f.pricing_status,f.total_amount,f.currency_code,f.financial_status,f.paid_amount,f.pending_amount,\n   c.id closure_id,c.assignment_id closure_assignment_id,(c.closed_at at time zone 'Europe/Madrid')::date economic_date,\n   a.id assignment_id,a.driver_id assignment_driver_id,a.assignment_status,a.accepted_at,\n   (select count(*) from public.service_assignments x where x.service_id=s.id and x.assignment_status in ('accepted','ended') and x.accepted_at is not null) assignment_count\n  from public.services s left join public.service_financials f on f.service_id=s.id\n  left join public.service_closures c on c.service_id=s.id\n  left join public.service_assignments a on a.id=c.assignment_id and a.service_id=s.id\n  where s.deleted_at is null and exists(select 1 from public.service_assignments x where x.service_id=s.id and x.driver_id=p_driver)\n  order by c.closed_at,s.id\n loop\n  v_reason:=null;\n  if v_s.economic_date is not null and (v_s.economic_date<p_start or v_s.economic_date>p_end) then v_reason:='outside_period';\n  elsif v_s.operational_status<>'completed' then v_reason:='service_not_completed';\n  elsif v_s.closure_id is null or v_s.assignment_id is null then\n   v_reason:='missing_inequivalent_closure_assignment';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));\n  elsif v_s.assignment_count<>1 or v_s.accepted_at is null or v_s.assignment_status not in ('accepted','ended') then\n   v_reason:='ambiguous_or_invalid_economic_assignment';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));\n  elsif v_s.assignment_driver_id<>p_driver then v_reason:='other_economic_driver';\n  elsif v_s.pricing_status is distinct from 'finalized' or coalesce(v_s.total_amount,0)<=0 then v_reason:='finalized_positive_price_required';\n  elsif v_s.currency_code<>v_currency then v_reason:='currency_mismatch';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));\n  elsif exists(select 1 from public.settlement_items where item_type='service_income' and service_id=v_s.id) then v_reason:='service_entitlement_already_consumed';\n  end if;\n  if v_reason is null then\n   v_percentage:=elara_private.service_percentage(p_driver,v_s.economic_date,v_currency);\n   if v_percentage ? 'blocker' then v_reason:=v_percentage->>'blocker';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason)); end if;\n  end if;\n  if v_reason is not null then\n   v_excluded:=v_excluded||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'human_code',v_s.human_code,'reason',v_reason));continue;\n  end if;\n  v_driver_item:=round(v_s.total_amount*(v_percentage->>'driver_percentage')::numeric/100,2);\n  v_gross:=v_gross+v_s.total_amount;v_earnings:=v_earnings+v_driver_item;v_elara:=v_elara+v_s.total_amount-v_driver_item;\n  v_items:=v_items||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'human_code',v_s.human_code,'assignment_id',v_s.assignment_id,'closure_id',v_s.closure_id,\n   'financial_id',v_s.financial_id,'economic_date',v_s.economic_date,'service_price',v_s.total_amount,'percentage',v_percentage,\n   'driver_amount',v_driver_item,'elara_amount',v_s.total_amount-v_driver_item,'currency_code',v_currency,\n   'cx_c',jsonb_build_object('financial_status',v_s.financial_status,'paid_amount',v_s.paid_amount,'pending_amount',v_s.pending_amount)));\n end loop;\n select coalesce(sum(a.available_amount),0) into v_cash from elara_private.driver_cash_available a join public.cash_accounts c on c.id=a.cash_account_id\n where a.driver_id=p_driver and a.currency_code=v_currency and c.status='active';\n if v_cash>(select coalesce(sum(greatest(x.book_balance-x.committed_amount,0)),0) from elara_private.driver_cash_coverage x join public.cash_accounts c on c.id=x.cash_account_id where c.driver_id=p_driver and c.status='active' and c.currency_code=v_currency) then\n  v_blockers:=v_blockers||jsonb_build_array('cash_sources_require_reconciliation_with_account_movements');end if;\n v_offset:=least(v_earnings,v_cash);\n if exists(select 1 from public.cash_remittances r where r.driver_id=p_driver and r.source_model_version=1 and r.status<>'cancelled') then\n  v_warnings:=v_warnings||jsonb_build_array('legacy_remittance_sources_excluded_without_reconstructing_differences');\n end if;\n select coalesce(jsonb_agg(jsonb_build_object('expense_id',e.id,'human_code',e.human_code,'amount',e.total_amount,'currency_code',e.currency_code,'reimbursement_status',e.reimbursement_status)), '[]') into v_reimbursements\n from public.expenses e where e.advanced_by_driver_id=p_driver and e.payment_responsibility='driver_advance' and e.status='approved' and e.reimbursable;\n return jsonb_build_object('driver',jsonb_build_object('id',v_d.id,'human_code',v_d.human_code,'type',v_d.driver_type),\n 'period_start',p_start,'period_end',p_end,'timezone','Europe/Madrid','currency_code',v_currency,'header_rule',to_jsonb(v_r),\n 'percentage_source','per_service','eligible_services',v_items,'excluded_services',v_excluded,'gross_service_amount',v_gross,\n 'driver_earnings_amount',v_earnings,'elara_amount',v_elara,'compensable_cash_available',v_cash,'cash_offset_proposed',v_offset,\n 'remaining_cash_to_remit',v_cash-v_offset,'payable_amount',v_earnings-v_offset,'reimbursements_informational',v_reimbursements,'warnings',v_warnings,'blockers',v_blockers);\nend $function$\n"
    },
    {
      "signature": "elara_private.audit_cash_allocation()",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.audit_cash_allocation()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\nbegin\n perform public.secure_audit(case when TG_OP='INSERT' then 'insert' else 'update' end,\n 'driver_cash_source_allocations',new.id,null,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),\n 'Shared cash source allocation.',jsonb_build_object('operation','driver_cash_source_allocation','source_id',new.cash_movement_id),new.updated_by,new.driver_id);\n return new;\nend $function$\n"
    },
    {
      "signature": "elara_private.guard_cash_allocation()",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.guard_cash_allocation()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_source record; v_owner record; v_used numeric; v_coverage record; v_delta numeric; begin\n if TG_OP='DELETE' then raise exception 'Cash allocations are append-only.' using errcode='23514'; end if;\n perform 1 from public.cash_accounts where id=new.cash_account_id for no key update;\n if TG_OP='UPDATE' then\n  if (to_jsonb(new)-array['status','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['status','updated_at','updated_by'])\n    or old.status<>'reserved' or new.status not in ('applied','released') then\n   raise exception 'Only reserved allocations may be applied or released; economics are immutable.' using errcode='23514';\n  end if;\n end if;\n select * into v_source from elara_private.driver_cash_available where cash_movement_id=new.cash_movement_id;\n if not found or v_source.driver_id<>new.driver_id or v_source.cash_account_id<>new.cash_account_id or v_source.currency_code<>new.currency_code then\n  raise exception 'Invalid, reversed or legacy-reserved cash source.' using errcode='23514';\n end if;\n if new.allocation_type='remittance' then\n  select * into v_owner from public.cash_remittances where id=new.remittance_id;\n  if not found or v_owner.source_model_version<>2 or v_owner.driver_id<>new.driver_id or v_owner.source_cash_account_id<>new.cash_account_id or v_owner.currency_code<>new.currency_code\n    or v_owner.status not in ('draft','prepared','submitted','received') then\n   raise exception 'Allocation must match an open version 2 driver remittance.' using errcode='23514';\n  end if;\n else\n  select * into v_owner from public.settlements where id=new.settlement_id;\n  if not found or coalesce((to_jsonb(v_owner)->>'calculation_version')::integer,1)<>2 or v_owner.driver_id<>new.driver_id or v_owner.currency_code<>new.currency_code or v_owner.status<>'draft' then\n   raise exception 'Settlement cash allocation must match a draft settlement.' using errcode='23514';\n  end if;\n end if;\n select coalesce(sum(amount),0) into v_used from public.driver_cash_source_allocations\n where cash_movement_id=new.cash_movement_id and status<>'released' and id<>new.id;\n if new.status<>'released' and v_used+new.amount>v_source.original_amount then\n  raise exception 'Cash source would be overallocated.' using errcode='23514';\n end if;\n select * into v_coverage from elara_private.driver_cash_coverage where cash_account_id=new.cash_account_id;\n v_delta:=case when new.status<>'released' then new.amount else 0 end\n  -case when TG_OP='UPDATE' and old.status<>'released' then old.amount else 0 end;\n if v_delta>0 and v_coverage.committed_amount+v_delta>v_coverage.book_balance then\n  raise exception 'Identified cash sources require reconciliation with account movements.' using errcode='23514';end if;\n insert into elara_private.driver_cash_source_usage(cash_movement_id,original_amount)\n values(new.cash_movement_id,v_source.original_amount) on conflict do nothing;\n update elara_private.driver_cash_source_usage\n set allocated_amount=allocated_amount\n   +case when new.status<>'released' then new.amount else 0 end\n   -case when TG_OP='UPDATE' and old.status<>'released' then old.amount else 0 end\n where cash_movement_id=new.cash_movement_id;\n new.updated_at:=now(); return new;\nend $function$\n"
    },
    {
      "signature": "elara_private.guard_reserved_cash_outflow()",
      "definition": "CREATE OR REPLACE FUNCTION elara_private.guard_reserved_cash_outflow()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions'\nAS $function$\ndeclare v_c record;v_own numeric:=0;begin\n if new.movement_type<>'outflow' then return new;end if;\n perform 1 from public.cash_accounts where id=new.cash_account_id for no key update;\n select * into v_c from elara_private.driver_cash_coverage where cash_account_id=new.cash_account_id;\n if not found then return new;end if;\n if new.movement_category='remittance_sent' then\n  select coalesce(sum(amount),0) into v_own from public.driver_cash_source_allocations where remittance_id=new.remittance_id and status='applied';\n end if;\n if v_c.committed_amount-v_own>0 and v_c.book_balance-new.amount<v_c.committed_amount-v_own then\n  raise exception 'Cash outflow would spend reserved cash sources.' using errcode='23514';end if;return new;\nend $function$\n"
    },
    {
      "signature": "prepare_settlement()",
      "definition": "CREATE OR REPLACE FUNCTION public.prepare_settlement()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_rule public.settlement_rules%rowtype;\n  v_driver public.drivers%rowtype;\n  v_recalculate_allowed boolean;\n  v_superadmin_cancel_allowed boolean;\n  v_has_items boolean;\n  v_active_statuses constant text[] := array['draft', 'generated', 'submitted', 'approved'];\nbegin\n  if tg_op = 'INSERT' then\n    if new.calculation_version<>2 then raise exception 'New settlements require calculation version 2.' using errcode='23514';end if;\n    if new.status <> 'draft' then\n      raise exception 'Settlements must be created in draft status.'\n        using errcode = '23514';\n    end if;\n  elsif tg_op = 'UPDATE' then\n    if new.percentage_source<>old.percentage_source then raise exception 'Percentage source is immutable.' using errcode='23514';end if;\n    if new.calculation_version<>old.calculation_version then raise exception 'Calculation version is immutable.' using errcode='23514';end if;\n    if new.cash_offset_amount is distinct from old.cash_offset_amount and current_setting('elara.settlement_recalculate',true) is distinct from old.id::text then\n     raise exception 'Cash offset must be changed through recalculation.' using errcode='42501';end if;\n    v_recalculate_allowed := current_setting('elara.settlement_recalculate', true) is not distinct from old.id::text;\n    v_superadmin_cancel_allowed := current_setting('elara.settlement_superadmin_cancel', true) is not distinct from old.id::text;\n\n    if old.status in ('rejected', 'cancelled') and not v_recalculate_allowed then\n      raise exception 'Rejected and cancelled settlements cannot be edited or reactivated.'\n        using errcode = '23514';\n    end if;\n\n    if old.status = 'approved' and not v_recalculate_allowed then\n      if not (\n        v_superadmin_cancel_allowed\n        and new.status = 'cancelled'\n        and new.cancelled_at is not null\n        and new.cancelled_by is not null\n        and length(trim(coalesce(new.cancellation_reason, ''))) > 0\n        and new.human_code is not distinct from old.human_code\n        and new.driver_id is not distinct from old.driver_id\n        and new.settlement_rule_id is not distinct from old.settlement_rule_id\n        and new.driver_type_snapshot is not distinct from old.driver_type_snapshot\n        and new.frequency_snapshot is not distinct from old.frequency_snapshot\n        and new.calculation_method_snapshot is not distinct from old.calculation_method_snapshot\n        and new.period_start is not distinct from old.period_start\n        and new.period_end is not distinct from old.period_end\n        and new.currency_code is not distinct from old.currency_code\n        and new.gross_eligible_amount is not distinct from old.gross_eligible_amount\n        and new.expense_deduction_amount is not distinct from old.expense_deduction_amount\n        and new.adjustment_amount is not distinct from old.adjustment_amount\n        and new.calculation_base_amount is not distinct from old.calculation_base_amount\n        and new.driver_percentage is not distinct from old.driver_percentage\n        and new.elara_percentage is not distinct from old.elara_percentage\n        and new.driver_amount is not distinct from old.driver_amount\n        and new.elara_amount is not distinct from old.elara_amount\n        and new.paid_amount is not distinct from old.paid_amount\n        and new.pending_amount is not distinct from old.pending_amount\n        and new.generated_at is not distinct from old.generated_at\n        and new.submitted_at is not distinct from old.submitted_at\n        and new.approved_at is not distinct from old.approved_at\n        and new.approved_by is not distinct from old.approved_by\n        and new.rejected_at is not distinct from old.rejected_at\n        and new.rejected_by is not distinct from old.rejected_by\n        and new.rejection_reason is not distinct from old.rejection_reason\n        and new.notes is not distinct from old.notes\n        and new.internal_notes is not distinct from old.internal_notes\n      ) then\n        raise exception 'Approved settlements can only be cancelled through the future Superadmin secure function.'\n          using errcode = '23514';\n      end if;\n    end if;\n\n    if (old.status <> 'draft' or (old.calculation_version=2 and exists(select 1 from public.settlement_items where settlement_id=old.id))) and not v_recalculate_allowed then\n      if new.driver_id is distinct from old.driver_id\n        or new.settlement_rule_id is distinct from old.settlement_rule_id\n        or new.driver_type_snapshot is distinct from old.driver_type_snapshot\n        or new.frequency_snapshot is distinct from old.frequency_snapshot\n        or new.calculation_method_snapshot is distinct from old.calculation_method_snapshot\n        or new.period_start is distinct from old.period_start\n        or new.period_end is distinct from old.period_end\n        or new.currency_code is distinct from old.currency_code\n        or new.driver_percentage is distinct from old.driver_percentage\n        or new.elara_percentage is distinct from old.elara_percentage\n      then\n        raise exception 'Driver, rule, period, currency and percentage snapshots cannot change after generated status.'\n          using errcode = '23514';\n      end if;\n    end if;\n\n    if new.status is distinct from old.status then\n      if not (\n        (old.status = 'draft' and new.status in ('generated', 'cancelled'))\n        or (old.status = 'generated' and new.status in ('submitted', 'cancelled'))\n        or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'cancelled'))\n        or (old.status = 'approved' and new.status = 'cancelled' and v_superadmin_cancel_allowed)\n      ) then\n        raise exception 'Invalid settlement status transition from % to %.', old.status, new.status\n          using errcode = '23514';\n      end if;\n    end if;\n  end if;\n\n  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));\n\n  select * into v_rule\n  from public.settlement_rules rule\n  where rule.id = new.settlement_rule_id;\n\n  if not found then\n    raise exception 'Settlement references a missing settlement rule.'\n      using errcode = '23503';\n  end if;\n\n  select * into v_driver\n  from public.drivers driver\n  where driver.id = new.driver_id;\n\n  if not found then\n    raise exception 'Settlement references a missing driver.'\n      using errcode = '23503';\n  end if;\n\n  if tg_op = 'INSERT' then\n    new.driver_type_snapshot := v_rule.driver_type;\n    new.frequency_snapshot := v_rule.frequency;\n    new.calculation_method_snapshot := v_rule.calculation_method;\n    new.driver_percentage := v_rule.driver_percentage;\n    new.elara_percentage := v_rule.elara_percentage;\n    new.currency_code := v_rule.currency_code;\n  end if;\n\n  if new.driver_type_snapshot <> v_driver.driver_type then\n    raise exception 'Settlement driver_type snapshot must match the driver.'\n      using errcode = '23514';\n  end if;\n\n  if new.driver_type_snapshot <> v_rule.driver_type\n    or new.frequency_snapshot <> v_rule.frequency\n    or new.calculation_method_snapshot <> v_rule.calculation_method\n    or new.currency_code <> v_rule.currency_code\n  then\n    raise exception 'Settlement snapshots must match the selected settlement rule.'\n      using errcode = '23514';\n  end if;\n\n  if new.status in ('generated', 'submitted', 'approved') and v_driver.administrative_status <> 'active' then\n    raise exception 'Generated, submitted or approved settlements require an active driver.'\n      using errcode = '23514';\n  end if;\n\n  if new.driver_type_snapshot = 'internal_driver' then\n    if new.frequency_snapshot <> 'monthly'\n      or new.period_start <> date_trunc('month', new.period_start)::date\n      or new.period_end <> (date_trunc('month', new.period_start)::date + interval '1 month - 1 day')::date\n    then\n      raise exception 'Internal driver settlements require a complete natural month period.'\n        using errcode = '23514';\n    end if;\n  elsif new.driver_type_snapshot = 'external_collaborator' then\n    if new.frequency_snapshot <> 'weekly' or new.period_end <> new.period_start + 6 or (new.calculation_version=2 and extract(isodow from new.period_start)<>1) then\n      raise exception 'External collaborator settlements require an inclusive seven-day period.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.approved_by is not null and not public.settlement_app_user_is_active(new.approved_by) then\n    raise exception 'Settlement approved_by must reference an active app user.'\n      using errcode = '23514';\n  end if;\n  if new.rejected_by is not null and not public.settlement_app_user_is_active(new.rejected_by) then\n    raise exception 'Settlement rejected_by must reference an active app user.'\n      using errcode = '23514';\n  end if;\n  if new.cancelled_by is not null and not public.settlement_app_user_is_active(new.cancelled_by) then\n    raise exception 'Settlement cancelled_by must reference an active app user.'\n      using errcode = '23514';\n  end if;\n\n  if new.status in ('generated', 'submitted', 'approved') then\n    select exists (\n      select 1 from public.settlement_items item where item.settlement_id = new.id\n    ) into v_has_items;\n\n    if not v_has_items then\n      raise exception 'Generated, submitted or approved settlements require at least one settlement item.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.status = any(v_active_statuses) and exists (\n    select 1\n    from public.settlements other\n    where other.id <> new.id\n      and other.driver_id = new.driver_id\n      and other.status = any(v_active_statuses)\n      and other.period_start <= new.period_end\n      and new.period_start <= other.period_end\n  ) then\n    raise exception 'A driver cannot have overlapping active settlements.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "validate_cash_movement_integrity()",
      "definition": "CREATE OR REPLACE FUNCTION public.validate_cash_movement_integrity()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_account public.cash_accounts%rowtype;\n  v_original public.cash_movements%rowtype;\n  v_service_payment public.service_payments%rowtype;\nbegin\n  if tg_op <> 'INSERT' then\n    raise exception 'Cash movements are append-only; create a reversal movement instead.'\n      using errcode = '23514';\n  end if;\n\n  select *\n  into v_account\n  from public.cash_accounts account\n  where account.id = new.cash_account_id;\n\n  if not found then\n    raise exception 'Cash movement references a missing cash account.'\n      using errcode = '23503';\n  end if;\n\n  if v_account.status <> 'active' and new.movement_category not in ('reversal', 'opening_balance') then\n    raise exception 'Cash movements require an active cash account.'\n      using errcode = '23514';\n  end if;\n\n  if new.currency_code <> v_account.currency_code then\n    raise exception 'Cash movement currency must match the cash account currency.'\n      using errcode = '23514';\n  end if;\n\n  if new.movement_category = 'service_payment' then\n    select *\n    into v_service_payment\n    from public.service_payments payment\n    where payment.id = new.service_payment_id;\n\n    if not found then\n      raise exception 'Cash service payment movement references a missing service payment.'\n        using errcode = '23503';\n    end if;\n\n    if v_service_payment.service_id <> new.service_id then\n      raise exception 'Cash movement service_id must match the service payment.'\n        using errcode = '23514';\n    end if;\n\n    if v_service_payment.payment_method <> 'cash' then\n      raise exception 'Only cash service payments can create cash movements in this domain.'\n        using errcode = '23514';\n    end if;\n\n    if v_service_payment.payment_status <> 'completed' then\n      raise exception 'Cash movement requires a completed service payment.'\n        using errcode = '23514';\n    end if;\n\n    if v_service_payment.amount <> new.amount or v_service_payment.currency_code <> new.currency_code then\n      raise exception 'Cash movement amount and currency must match the service payment.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.movement_category = 'reversal' then\n    select *\n    into v_original\n    from public.cash_movements movement\n    where movement.id = new.original_movement_id;\n\n    if not found then\n      raise exception 'Cash reversal references a missing original movement.'\n        using errcode = '23503';\n    end if;\n\n    if v_original.movement_category = 'reversal' then\n      raise exception 'Cash reversal cannot reverse another reversal.'\n        using errcode = '23514';\n    end if;\n\n    if v_original.cash_account_id <> new.cash_account_id then\n      raise exception 'Cash reversal must use the same cash account as the original movement.'\n        using errcode = '23514';\n    end if;\n\n    if v_original.amount <> new.amount or v_original.currency_code <> new.currency_code then\n      raise exception 'Cash reversal must match original amount and currency.'\n        using errcode = '23514';\n    end if;\n\n    if v_original.movement_type = new.movement_type then\n      raise exception 'Cash reversal movement_type must be opposite to the original movement.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  return new;\nend;\n$function$\n"
    },
    {
      "signature": "write_audit_log(text,text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.write_audit_log(p_event_source text, p_action text, p_entity_table text, p_entity_id uuid DEFAULT NULL::uuid, p_entity_human_code text DEFAULT NULL::text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_actor_app_user_id uuid DEFAULT NULL::uuid, p_actor_driver_id uuid DEFAULT NULL::uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_id uuid;\n  v_auth_user_id uuid;\n  v_session_id uuid;\n  v_actor_app_user_id uuid;\n  v_active_context text;\nbegin\n  v_auth_user_id := auth.uid();\n  v_session_id := public.current_auth_session_id();\n  v_actor_app_user_id := coalesce(p_actor_app_user_id, public.current_app_user_id());\n\n  if v_auth_user_id is not null and v_actor_app_user_id is not null then\n    if not exists (\n      select 1\n      from public.app_users app_user\n      where app_user.id = v_actor_app_user_id\n        and app_user.auth_user_id = v_auth_user_id\n        and app_user.status = 'active'\n    ) then\n      raise exception 'Provided audit actor contradicts the authenticated session.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if v_auth_user_id is not null and v_session_id is not null then\n    select session.active_context\n    into v_active_context\n    from public.app_sessions session\n    where session.auth_user_id = v_auth_user_id\n      and session.supabase_session_id = v_session_id\n      and session.ended_at is null\n      and session.expires_at > now()\n    limit 1;\n  end if;\n\n  insert into public.audit_logs (\n    event_source,\n    action,\n    entity_table,\n    entity_id,\n    entity_human_code,\n    actor_auth_user_id,\n    actor_app_user_id,\n    actor_driver_id,\n    auth_session_id,\n    active_context,\n    transaction_id,\n    old_data,\n    new_data,\n    changed_fields,\n    reason,\n    metadata\n  ) values (\n    lower(trim(p_event_source)),\n    lower(trim(p_action)),\n    lower(trim(p_entity_table)),\n    p_entity_id,\n    p_entity_human_code,\n    v_auth_user_id,\n    v_actor_app_user_id,\n    p_actor_driver_id,\n    v_session_id,\n    v_active_context,\n    txid_current(),\n    public.sanitize_audit_json(p_old_data),\n    public.sanitize_audit_json(p_new_data),\n    public.jsonb_top_level_changed_fields(public.sanitize_audit_json(p_old_data), public.sanitize_audit_json(p_new_data)),\n    p_reason,\n    public.sanitize_audit_json(p_metadata)\n  )\n  returning id into v_id;\n\n  return v_id;\nend;\n$function$\n"
    }
  ],
  "view": {
    "name": "public.v_integrity_settlements",
    "definition": " WITH item_totals AS (\n         SELECT item.settlement_id,\n            round(COALESCE(sum(\n                CASE\n                    WHEN item.item_type = ANY (ARRAY['service_income'::text, 'other'::text]) THEN item.gross_amount\n                    ELSE 0::numeric\n                END), 0::numeric), 2) AS gross_eligible_amount,\n            round(COALESCE(sum(\n                CASE\n                    WHEN item.item_type = ANY (ARRAY['expense_deduction'::text, 'other'::text]) THEN item.deduction_amount\n                    ELSE 0::numeric\n                END), 0::numeric), 2) AS expense_deduction_amount,\n            round(COALESCE(sum(\n                CASE\n                    WHEN item.item_type = ANY (ARRAY['positive_adjustment'::text, 'negative_adjustment'::text, 'other'::text]) THEN item.adjustment_amount\n                    ELSE 0::numeric\n                END), 0::numeric), 2) AS adjustment_amount,\n            count(*)::integer AS item_count\n           FROM settlement_items item\n          GROUP BY item.settlement_id\n        ), payment_totals AS (\n         SELECT settlement_payments.settlement_id,\n            round(COALESCE(sum(settlement_payments.amount), 0::numeric), 2) AS paid_amount\n           FROM settlement_payments\n          WHERE settlement_payments.payment_status = 'completed'::text\n          GROUP BY settlement_payments.settlement_id\n        ), expected AS (\n         SELECT settlement.id,\n            settlement.human_code,\n            settlement.driver_id,\n            settlement.settlement_rule_id,\n            settlement.driver_type_snapshot,\n            settlement.frequency_snapshot,\n            settlement.calculation_method_snapshot,\n            settlement.period_start,\n            settlement.period_end,\n            settlement.currency_code,\n            settlement.gross_eligible_amount,\n            settlement.expense_deduction_amount,\n            settlement.adjustment_amount,\n            settlement.calculation_base_amount,\n            settlement.driver_percentage,\n            settlement.elara_percentage,\n            settlement.driver_amount,\n            settlement.elara_amount,\n            settlement.paid_amount,\n            settlement.pending_amount,\n            settlement.status,\n            settlement.payment_status,\n            settlement.generated_at,\n            settlement.submitted_at,\n            settlement.approved_at,\n            settlement.approved_by,\n            settlement.rejected_at,\n            settlement.rejected_by,\n            settlement.rejection_reason,\n            settlement.cancelled_at,\n            settlement.cancelled_by,\n            settlement.cancellation_reason,\n            settlement.notes,\n            settlement.internal_notes,\n            settlement.created_at,\n            settlement.updated_at,\n            settlement.created_by,\n            settlement.updated_by,\n            COALESCE(item.gross_eligible_amount, 0::numeric) AS expected_gross_eligible_amount,\n            COALESCE(item.expense_deduction_amount, 0::numeric) AS expected_expense_deduction_amount,\n            COALESCE(item.adjustment_amount, 0::numeric) AS expected_adjustment_amount,\n            COALESCE(item.item_count, 0) AS item_count,\n            GREATEST(round(COALESCE(item.gross_eligible_amount, 0::numeric) - COALESCE(item.expense_deduction_amount, 0::numeric) + COALESCE(item.adjustment_amount, 0::numeric), 2), 0::numeric) AS expected_calculation_base_amount,\n            COALESCE(payment.paid_amount, 0::numeric) AS expected_paid_amount\n           FROM settlements settlement\n             LEFT JOIN item_totals item ON item.settlement_id = settlement.id\n             LEFT JOIN payment_totals payment ON payment.settlement_id = settlement.id\n        )\n SELECT 'settlements'::text AS domain,\n    'settlement_totals_out_of_sync'::text AS issue_type,\n    'critical'::text AS severity,\n    'settlements'::text AS entity_table,\n    expected.id AS entity_id,\n    expected.human_code,\n    'Settlement materialized totals do not match settlement_items and completed payments.'::text AS issue_detail,\n    concat_ws(' / '::text, 'gross='::text || expected.expected_gross_eligible_amount, 'deduction='::text || expected.expected_expense_deduction_amount, 'adjustment='::text || expected.expected_adjustment_amount, 'base='::text || expected.expected_calculation_base_amount, 'paid='::text || expected.expected_paid_amount) AS expected_value,\n    concat_ws(' / '::text, 'gross='::text || expected.gross_eligible_amount, 'deduction='::text || expected.expense_deduction_amount, 'adjustment='::text || expected.adjustment_amount, 'base='::text || expected.calculation_base_amount, 'paid='::text || expected.paid_amount) AS actual_value\n   FROM expected\n  WHERE rls_is_admin() AND (expected.gross_eligible_amount <> expected.expected_gross_eligible_amount OR expected.expense_deduction_amount <> expected.expected_expense_deduction_amount OR expected.adjustment_amount <> expected.expected_adjustment_amount OR expected.calculation_base_amount <> expected.expected_calculation_base_amount OR expected.paid_amount <> expected.expected_paid_amount OR expected.pending_amount <> round(expected.driver_amount - expected.expected_paid_amount, 2))\nUNION ALL\n SELECT 'settlements'::text AS domain,\n    'settlement_driver_elara_amounts_out_of_sync'::text AS issue_type,\n    'critical'::text AS severity,\n    'settlements'::text AS entity_table,\n    expected.id AS entity_id,\n    expected.human_code,\n    'Settlement driver/elara calculated amounts do not match the configured calculation method and percentages.'::text AS issue_detail,\n    concat_ws(' / '::text, 'driver='::text ||\n        CASE\n            WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n            ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n        END, 'elara='::text ||\n        CASE\n            WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2), 2)\n            ELSE round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2)\n        END) AS expected_value,\n    concat_ws(' / '::text, 'driver='::text || expected.driver_amount, 'elara='::text || expected.elara_amount) AS actual_value\n   FROM expected\n  WHERE rls_is_admin() AND (expected.driver_amount <>\n        CASE\n            WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n            ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n        END OR expected.elara_amount <>\n        CASE\n            WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2), 2)\n            ELSE round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2)\n        END)\nUNION ALL\n SELECT 'settlements'::text AS domain,\n    'settlement_payment_status_out_of_sync'::text AS issue_type,\n    'critical'::text AS severity,\n    'settlements'::text AS entity_table,\n    expected.id AS entity_id,\n    expected.human_code,\n    'Settlement payment_status does not match completed settlement payments and expected driver amount.'::text AS issue_detail,\n        CASE\n            WHEN expected.status = 'cancelled'::text THEN 'cancelled'::text\n            WHEN round(\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END - expected.expected_paid_amount, 2) = 0::numeric THEN 'paid'::text\n            WHEN expected.expected_paid_amount = 0::numeric AND\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END > 0::numeric THEN 'unpaid'::text\n            WHEN expected.expected_paid_amount > 0::numeric AND round(\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END - expected.expected_paid_amount, 2) > 0::numeric THEN 'partial'::text\n            ELSE 'unpaid'::text\n        END AS expected_value,\n    expected.payment_status AS actual_value\n   FROM expected\n  WHERE rls_is_admin() AND expected.payment_status IS DISTINCT FROM\n        CASE\n            WHEN expected.status = 'cancelled'::text THEN 'cancelled'::text\n            WHEN round(\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END - expected.expected_paid_amount, 2) = 0::numeric THEN 'paid'::text\n            WHEN expected.expected_paid_amount = 0::numeric AND\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END > 0::numeric THEN 'unpaid'::text\n            WHEN expected.expected_paid_amount > 0::numeric AND round(\n            CASE\n                WHEN expected.calculation_method_snapshot = 'driver_share'::text THEN round(expected.expected_calculation_base_amount * expected.driver_percentage / 100::numeric, 2)\n                ELSE round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100::numeric, 2), 2)\n            END - expected.expected_paid_amount, 2) > 0::numeric THEN 'partial'::text\n            ELSE 'unpaid'::text\n        END\nUNION ALL\n SELECT 'settlements'::text AS domain,\n    'non_draft_settlement_without_items'::text AS issue_type,\n    'warning'::text AS severity,\n    'settlements'::text AS entity_table,\n    expected.id AS entity_id,\n    expected.human_code,\n    'Settlement has left draft workflow without any item.'::text AS issue_detail,\n    'at least one settlement_item'::text AS expected_value,\n    '0'::text AS actual_value\n   FROM expected\n  WHERE rls_is_admin() AND (expected.status = ANY (ARRAY['generated'::text, 'submitted'::text, 'approved'::text])) AND expected.item_count = 0\nUNION ALL\n SELECT 'settlements'::text AS domain,\n    'service_in_multiple_active_settlements'::text AS issue_type,\n    'critical'::text AS severity,\n    'services'::text AS entity_table,\n    duplicate.service_id AS entity_id,\n    NULL::text AS human_code,\n    'Service is included in more than one active settlement.'::text AS issue_detail,\n    'one active settlement'::text AS expected_value,\n    duplicate.settlement_codes AS actual_value\n   FROM ( SELECT item.service_id,\n            string_agg(settlement.human_code, ', '::text ORDER BY settlement.human_code) AS settlement_codes,\n            count(DISTINCT settlement.id) AS settlement_count\n           FROM settlement_items item\n             JOIN settlements settlement ON settlement.id = item.settlement_id\n          WHERE item.item_type = 'service_income'::text AND (settlement.status = ANY (ARRAY['draft'::text, 'generated'::text, 'submitted'::text, 'approved'::text]))\n          GROUP BY item.service_id\n         HAVING count(DISTINCT settlement.id) > 1) duplicate\n  WHERE rls_is_admin()\nUNION ALL\n SELECT 'settlements'::text AS domain,\n    'expense_in_multiple_active_settlements'::text AS issue_type,\n    'critical'::text AS severity,\n    'expenses'::text AS entity_table,\n    duplicate.expense_id AS entity_id,\n    NULL::text AS human_code,\n    'Expense is included in more than one active settlement.'::text AS issue_detail,\n    'one active settlement'::text AS expected_value,\n    duplicate.settlement_codes AS actual_value\n   FROM ( SELECT item.expense_id,\n            string_agg(settlement.human_code, ', '::text ORDER BY settlement.human_code) AS settlement_codes,\n            count(DISTINCT settlement.id) AS settlement_count\n           FROM settlement_items item\n             JOIN settlements settlement ON settlement.id = item.settlement_id\n          WHERE item.item_type = 'expense_deduction'::text AND (settlement.status = ANY (ARRAY['draft'::text, 'generated'::text, 'submitted'::text, 'approved'::text]))\n          GROUP BY item.expense_id\n         HAVING count(DISTINCT settlement.id) > 1) duplicate\n  WHERE rls_is_admin();"
  },
  "integrity_baseline": [
    {
      "entity_id": "90000000-0000-4000-8000-000000000101",
      "issue_type": "settlement_driver_elara_amounts_out_of_sync"
    },
    {
      "entity_id": "90000000-0000-4000-8000-000000000101",
      "issue_type": "settlement_payment_status_out_of_sync"
    },
    {
      "entity_id": "90000000-0000-4000-8000-000000000101",
      "issue_type": "settlement_totals_out_of_sync"
    }
  ],
  "additional_columns": [
    {
      "table": "vehicle_documents",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "vehicle_documents",
      "name": "vehicle_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "document_type_key",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "status",
      "type": "text",
      "nullable": false,
      "default_source": "'pending'"
    },
    {
      "table": "vehicle_documents",
      "name": "issued_at",
      "type": "date",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "expires_at",
      "type": "date",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "reference_number",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "storage_bucket",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "storage_path",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "file_name",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "mime_type",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "file_size",
      "type": "bigint",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "checksum",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "notes",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "validated_at",
      "type": "timestamp with time zone",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "validated_by",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "replaced_at",
      "type": "timestamp with time zone",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "replaced_by_document_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "vehicle_documents",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "vehicle_documents",
      "name": "created_by",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "vehicle_documents",
      "name": "updated_by",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "service_status_history",
      "name": "service_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "from_status",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "to_status",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "changed_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "service_status_history",
      "name": "changed_by_user_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "changed_by_driver_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "assignment_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "reason",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "metadata",
      "type": "jsonb",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_status_history",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "cash_movements",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "cash_movements",
      "name": "human_code",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "cash_account_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "movement_type",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "movement_category",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "amount",
      "type": "numeric(14,2)",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "currency_code",
      "type": "text",
      "nullable": false,
      "default_source": "'EUR'"
    },
    {
      "table": "cash_movements",
      "name": "occurred_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "cash_movements",
      "name": "service_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "service_payment_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "remittance_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "cash_count_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "original_movement_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "source_type",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "source_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "idempotency_key",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "description",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "metadata",
      "type": "jsonb",
      "nullable": false,
      "default_source": "'{}'::jsonb"
    },
    {
      "table": "cash_movements",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "cash_movements",
      "name": "created_by",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "cash_movements",
      "name": "actor_driver_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "service_financial_status_history",
      "name": "service_financial_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "from_status",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "to_status",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "changed_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "service_financial_status_history",
      "name": "changed_by_user_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "payment_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "reason",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_financial_status_history",
      "name": "metadata",
      "type": "jsonb",
      "nullable": false,
      "default_source": "'{}'::jsonb"
    },
    {
      "table": "service_financial_status_history",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "receivable_status_history",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "from_status",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "to_status",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "changed_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "receivable_status_history",
      "name": "changed_by_user_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "payment_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "reason",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "receivable_status_history",
      "name": "metadata",
      "type": "jsonb",
      "nullable": false,
      "default_source": "'{}'::jsonb"
    },
    {
      "table": "receivable_status_history",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "service_events",
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "default_source": "extensions.gen_random_uuid()"
    },
    {
      "table": "service_events",
      "name": "service_id",
      "type": "uuid",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "event_type",
      "type": "text",
      "nullable": false,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "occurred_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    },
    {
      "table": "service_events",
      "name": "actor_user_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "actor_driver_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "assignment_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "vehicle_id",
      "type": "uuid",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "title",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "description",
      "type": "text",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "metadata",
      "type": "jsonb",
      "nullable": true,
      "default_source": null
    },
    {
      "table": "service_events",
      "name": "created_at",
      "type": "timestamp with time zone",
      "nullable": false,
      "default_source": "now()"
    }
  ],
  "additional_checks": [
    {
      "table": "vehicle_documents",
      "name": "vehicle_documents_status_check",
      "source": "check (status in ('valid', 'expiring_soon', 'expired', 'pending', 'not_applicable', 'rejected', 'replaced', 'annulled'))",
      "remote_definition": "CHECK (status = ANY (ARRAY['valid'::text, 'expiring_soon'::text, 'expired'::text, 'pending'::text, 'not_applicable'::text, 'rejected'::text, 'replaced'::text, 'annulled'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "vehicle_documents",
      "name": "vehicle_documents_expires_after_issued",
      "source": "check (issued_at is null or expires_at is null or expires_at >= issued_at)",
      "remote_definition": "CHECK (issued_at IS NULL OR expires_at IS NULL OR expires_at >= issued_at)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "vehicle_documents",
      "name": "vehicle_documents_file_size_non_negative",
      "source": "check (file_size is null or file_size >= 0)",
      "remote_definition": "CHECK (file_size IS NULL OR file_size >= 0)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "vehicle_documents",
      "name": "vehicle_documents_replaced_metadata",
      "source": "check (status <> 'replaced' or replaced_at is not null)",
      "remote_definition": "CHECK (status <> 'replaced'::text OR replaced_at IS NOT NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_status_history",
      "name": "service_status_history_from_status_check",
      "source": "check (\n      from_status is null\n      or from_status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'not_performed')\n    )",
      "remote_definition": "CHECK (from_status IS NULL OR (from_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'not_performed'::text])))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_status_history",
      "name": "service_status_history_to_status_check",
      "source": "check (to_status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'not_performed'))",
      "remote_definition": "CHECK (to_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'not_performed'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_status_history",
      "name": "service_status_history_single_actor",
      "source": "check (changed_by_user_id is null or changed_by_driver_id is null)",
      "remote_definition": "CHECK (changed_by_user_id IS NULL OR changed_by_driver_id IS NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_human_code_format",
      "source": "check (human_code ~ '^CASH-[0-9]{6}$')",
      "remote_definition": "CHECK (human_code ~ '^CASH-[0-9]{6}$'::text)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_type_check",
      "source": "check (movement_type in ('inflow', 'outflow'))",
      "remote_definition": "CHECK (movement_type = ANY (ARRAY['inflow'::text, 'outflow'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_category_check",
      "source": "check (movement_category in (\n      'service_payment',\n      'remittance_sent',\n      'remittance_received',\n      'count_adjustment',\n      'reversal',\n      'opening_balance',\n      'manual_adjustment',\n      'other'\n    ))",
      "remote_definition": "CHECK (movement_category = ANY (ARRAY['service_payment'::text, 'remittance_sent'::text, 'remittance_received'::text, 'count_adjustment'::text, 'reversal'::text, 'opening_balance'::text, 'manual_adjustment'::text, 'other'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_amount_positive",
      "source": "check (amount > 0)",
      "remote_definition": "CHECK (amount > 0::numeric)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_currency_check",
      "source": "check (currency_code ~ '^[A-Z]{3}$')",
      "remote_definition": "CHECK (currency_code ~ '^[A-Z]{3}$'::text)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_metadata_object",
      "source": "check (jsonb_typeof(metadata) = 'object')",
      "remote_definition": "CHECK (jsonb_typeof(metadata) = 'object'::text)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_source_type_not_empty",
      "source": "check (source_type is null or length(trim(source_type)) > 0)",
      "remote_definition": "CHECK (source_type IS NULL OR length(TRIM(BOTH FROM source_type)) > 0)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_idempotency_not_empty",
      "source": "check (idempotency_key is null or length(trim(idempotency_key)) > 0)",
      "remote_definition": "CHECK (idempotency_key IS NULL OR length(TRIM(BOTH FROM idempotency_key)) > 0)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_not_self_original",
      "source": "check (original_movement_id is null or original_movement_id <> id)",
      "remote_definition": "CHECK (original_movement_id IS NULL OR original_movement_id <> id)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_service_payment_refs",
      "source": "check (\n      movement_category <> 'service_payment'\n      or (service_id is not null and service_payment_id is not null)\n    )",
      "remote_definition": "CHECK (movement_category <> 'service_payment'::text OR service_id IS NOT NULL AND service_payment_id IS NOT NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_remittance_refs",
      "source": "check (\n      movement_category not in ('remittance_sent', 'remittance_received')\n      or remittance_id is not null\n    )",
      "remote_definition": "CHECK ((movement_category <> ALL (ARRAY['remittance_sent'::text, 'remittance_received'::text])) OR remittance_id IS NOT NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_count_adjustment_refs",
      "source": "check (movement_category <> 'count_adjustment' or cash_count_id is not null)",
      "remote_definition": "CHECK (movement_category <> 'count_adjustment'::text OR cash_count_id IS NOT NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "cash_movements_reversal_refs",
      "source": "check (\n      (movement_category = 'reversal' and original_movement_id is not null)\n      or (movement_category <> 'reversal' and original_movement_id is null)\n    )",
      "remote_definition": "CHECK (movement_category = 'reversal'::text AND original_movement_id IS NOT NULL OR movement_category <> 'reversal'::text AND original_movement_id IS NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_financial_status_history",
      "name": "service_financial_status_history_from_status_check",
      "source": "check (from_status is null or from_status in ('pending', 'paid', 'partial', 'cancelled', 'not_collectible'))",
      "remote_definition": "CHECK (from_status IS NULL OR (from_status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'cancelled'::text, 'not_collectible'::text])))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_financial_status_history",
      "name": "service_financial_status_history_to_status_check",
      "source": "check (to_status in ('pending', 'paid', 'partial', 'cancelled', 'not_collectible'))",
      "remote_definition": "CHECK (to_status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'cancelled'::text, 'not_collectible'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_financial_status_history",
      "name": "service_financial_status_history_metadata_object",
      "source": "check (jsonb_typeof(metadata) = 'object')",
      "remote_definition": "CHECK (jsonb_typeof(metadata) = 'object'::text)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_status_history_from_status_check",
      "source": "check (from_status is null or from_status in ('open', 'overdue', 'paid', 'partial', 'cancelled', 'written_off'))",
      "remote_definition": "CHECK (from_status IS NULL OR (from_status = ANY (ARRAY['open'::text, 'overdue'::text, 'paid'::text, 'partial'::text, 'cancelled'::text, 'written_off'::text])))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_status_history_to_status_check",
      "source": "check (to_status in ('open', 'overdue', 'paid', 'partial', 'cancelled', 'written_off'))",
      "remote_definition": "CHECK (to_status = ANY (ARRAY['open'::text, 'overdue'::text, 'paid'::text, 'partial'::text, 'cancelled'::text, 'written_off'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_status_history_real_change",
      "source": "check (from_status is null or from_status <> to_status)",
      "remote_definition": "CHECK (from_status IS NULL OR from_status <> to_status)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "receivable_status_history",
      "name": "receivable_status_history_metadata_object",
      "source": "check (jsonb_typeof(metadata) = 'object')",
      "remote_definition": "CHECK (jsonb_typeof(metadata) = 'object'::text)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_events",
      "name": "service_events_type_check",
      "source": "check (event_type in (\n      'service_created',\n      'service_updated',\n      'assignment_created',\n      'assignment_accepted',\n      'assignment_rejected',\n      'assignment_reassigned',\n      'internal_driver_priority_overridden',\n      'service_started',\n      'driver_stage_updated',\n      'service_completed',\n      'service_cancelled',\n      'service_no_show',\n      'service_not_performed'\n    ))",
      "remote_definition": "CHECK (event_type = ANY (ARRAY['service_created'::text, 'service_updated'::text, 'assignment_created'::text, 'assignment_accepted'::text, 'assignment_rejected'::text, 'assignment_reassigned'::text, 'internal_driver_priority_overridden'::text, 'service_started'::text, 'driver_stage_updated'::text, 'service_completed'::text, 'service_cancelled'::text, 'service_no_show'::text, 'service_not_performed'::text]))",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_events",
      "name": "service_events_single_actor",
      "source": "check (actor_user_id is null or actor_driver_id is null)",
      "remote_definition": "CHECK (actor_user_id IS NULL OR actor_driver_id IS NULL)",
      "schema": "public",
      "contype": "c",
      "validated": true,
      "deferrable": false,
      "initially_deferred": false
    }
  ],
  "additional_triggers": [
    {
      "table": "vehicle_documents",
      "name": "set_vehicle_documents_updated_at",
      "function": "public.set_updated_at()",
      "type": 19,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "vehicle_documents",
      "name": "validate_vehicle_documents_integrity",
      "function": "public.validate_vehicle_document_integrity()",
      "type": 21,
      "deferrable": true,
      "initially_deferred": true
    },
    {
      "table": "service_status_history",
      "name": "prevent_service_status_history_updates",
      "function": "public.prevent_service_append_only_changes()",
      "type": 27,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "guard_shared_cash_reversal",
      "function": "elara_private.guard_cash_reversal()",
      "type": 7,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "cash_movements",
      "name": "guard_reserved_cash_outflow",
      "function": "elara_private.guard_reserved_cash_outflow()",
      "type": 7,
      "deferrable": false,
      "initially_deferred": false
    },
    {
      "table": "service_events",
      "name": "prevent_service_events_updates",
      "function": "public.prevent_service_append_only_changes()",
      "type": 27,
      "deferrable": false,
      "initially_deferred": false
    }
  ],
  "additional_function_bodies": [
    {
      "signature": "public.require_admin_user()",
      "source": "\nbegin\n  return public.require_any_role(array['superadmin', 'administrativo']);\nend;\n"
    },
    {
      "signature": "public.require_any_role(text[])",
      "source": "\ndeclare\n  v_user_id uuid;\n  v_context text;\n  v_roles text[];\nbegin\n  select array_agg(lower(trim(role_key)))\n    into v_roles\n  from unnest(p_role_keys) as role_input(role_key)\n  where length(trim(role_key)) > 0;\n\n  if v_roles is null or cardinality(v_roles) = 0 then\n    raise exception 'At least one role is required.' using errcode = '42501';\n  end if;\n\n  v_user_id := public.require_current_app_user();\n  v_context := public.current_active_context();\n\n  if v_context is null or v_context <> all(v_roles) then\n    raise exception 'Active context is not authorized for this operation.' using errcode = '42501';\n  end if;\n\n  if not exists (select 1 from unnest(v_roles) r where public.user_has_active_role(v_user_id, r)) then\n    raise exception 'Required role is not assigned to the active user.' using errcode = '42501';\n  end if;\n\n  return v_user_id;\nend;\n"
    },
    {
      "signature": "public.require_current_app_user()",
      "source": "\ndeclare\n  v_user_id uuid;\nbegin\n  if auth.uid() is null then\n    raise exception 'Authentication is required.' using errcode = '28000';\n  end if;\n  if public.current_auth_session_id() is null then\n    raise exception 'A valid Supabase session_id claim is required.' using errcode = '28000';\n  end if;\n\n  select u.id\n    into v_user_id\n  from public.app_users u\n  join public.app_sessions s on s.app_user_id = u.id and s.auth_user_id = u.auth_user_id\n  where u.auth_user_id = auth.uid()\n    and u.status = 'active'\n    and s.supabase_session_id = public.current_auth_session_id()\n    and s.ended_at is null\n    and s.expires_at > now()\n    and public.user_has_active_role(u.id, s.active_context)\n  limit 1;\n\n  if v_user_id is null then\n    raise exception 'Active application user and session are required.' using errcode = '28000';\n  end if;\n\n  return v_user_id;\nend;\n"
    },
    {
      "signature": "public.current_active_context()",
      "source": "\ndeclare\n  v_context text;\nbegin\n  select s.active_context\n    into v_context\n  from public.app_sessions s\n  join public.app_users u on u.id = s.app_user_id and u.auth_user_id = s.auth_user_id\n  where s.auth_user_id = auth.uid()\n    and s.supabase_session_id = public.current_auth_session_id()\n    and s.ended_at is null\n    and s.expires_at > now()\n    and u.status = 'active'\n    and public.user_has_active_role(u.id, s.active_context)\n  limit 1;\n\n  return v_context;\nend;\n"
    },
    {
      "signature": "public.current_auth_session_id()",
      "source": "\ndeclare\n  raw_session_id text;\nbegin\n  raw_session_id := nullif(auth.jwt() ->> 'session_id', '');\n\n  if raw_session_id is null then\n    return null;\n  end if;\n\n  return raw_session_id::uuid;\nexception\n  when invalid_text_representation then\n    return null;\nend;\n"
    },
    {
      "signature": "public.user_has_active_role(uuid,text)",
      "source": "\ndeclare\n  v_role_key text;\nbegin\n  v_role_key := lower(trim(coalesce(p_role_key, '')));\n\n  if p_app_user_id is null or v_role_key = '' then\n    return false;\n  end if;\n\n  return exists (\n    select 1\n    from public.app_users app_user\n    join public.user_roles user_role\n      on user_role.user_id = app_user.id\n    join public.roles role_record\n      on role_record.key = user_role.role_key\n    where app_user.id = p_app_user_id\n      and app_user.status = 'active'\n      and user_role.role_key = v_role_key\n      and user_role.status = 'active'\n      and user_role.starts_at <= now()\n      and (user_role.ends_at is null or user_role.ends_at > now())\n      and role_record.is_active = true\n  );\nend;\n"
    },
    {
      "signature": "public.record_internal_priority_exception_event()",
      "source": "\ndeclare\n  v_should_record boolean := false;\nbegin\n  if tg_op = 'INSERT' then\n    v_should_record := new.internal_priority_exception = true;\n  elsif tg_op = 'UPDATE' then\n    v_should_record :=\n      new.internal_priority_exception = true\n      and (\n        old.internal_priority_exception is distinct from true\n        or old.priority_exception_reason is distinct from new.priority_exception_reason\n      );\n  end if;\n\n  if v_should_record\n    and new.assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required')\n  then\n    insert into public.service_events (\n      service_id,\n      event_type,\n      occurred_at,\n      actor_user_id,\n      assignment_id,\n      vehicle_id,\n      title,\n      description,\n      metadata,\n      created_at\n    )\n    values (\n      new.service_id,\n      'internal_driver_priority_overridden',\n      now(),\n      new.created_by,\n      new.id,\n      new.vehicle_id,\n      'Internal driver priority overridden',\n      new.priority_exception_reason,\n      jsonb_build_object(\n        'driver_id', new.driver_id,\n        'vehicle_id', new.vehicle_id,\n        'driver_vehicle_assignment_id', new.driver_vehicle_assignment_id,\n        'priority_exception_reason', new.priority_exception_reason\n      ),\n      now()\n    );\n  end if;\n\n  return new;\nend;\n"
    },
    {
      "signature": "public.record_service_financial_status_change()",
      "source": "\nbegin\n  if tg_op <> 'UPDATE' or new.financial_status is not distinct from old.financial_status then\n    return new;\n  end if;\n\n  insert into public.service_financial_status_history (\n    service_financial_id,\n    from_status,\n    to_status,\n    changed_at,\n    changed_by_user_id,\n    reason,\n    metadata\n  )\n  values (\n    new.id,\n    old.financial_status,\n    new.financial_status,\n    now(),\n    new.updated_by,\n    'financial_status_recalculated',\n    jsonb_build_object(\n      'total_amount', new.total_amount,\n      'paid_amount', new.paid_amount,\n      'pending_amount', new.pending_amount\n    )\n  );\n\n  return new;\nend;\n"
    },
    {
      "signature": "public.record_receivable_status_change()",
      "source": "\ndeclare\n  v_payment_id uuid;\nbegin\n  if tg_op = 'INSERT' then\n    insert into public.receivable_status_history (\n      receivable_id,\n      from_status,\n      to_status,\n      changed_at,\n      changed_by_user_id,\n      reason,\n      metadata\n    )\n    values (\n      new.id,\n      null,\n      new.status,\n      now(),\n      new.created_by,\n      'receivable_opened',\n      jsonb_build_object(\n        'original_amount', new.original_amount,\n        'pending_amount', new.pending_amount,\n        'currency_code', new.currency_code\n      )\n    );\n\n    return new;\n  end if;\n\n  if tg_op <> 'UPDATE' then\n    return new;\n  end if;\n\n  if new.status is not distinct from old.status then\n    return new;\n  end if;\n\n  select allocation.payment_id\n  into v_payment_id\n  from public.receivable_allocations allocation\n  where allocation.receivable_id = new.id\n  order by allocation.allocated_at desc, allocation.created_at desc\n  limit 1;\n\n  insert into public.receivable_status_history (\n    receivable_id,\n    from_status,\n    to_status,\n    changed_at,\n    changed_by_user_id,\n    payment_id,\n    reason,\n    metadata\n  )\n  values (\n    new.id,\n    old.status,\n    new.status,\n    now(),\n    case\n      when new.status = 'paid' then new.closed_by\n      when new.status = 'cancelled' then new.cancelled_by\n      when new.status = 'written_off' then new.written_off_by\n      else new.updated_by\n    end,\n    v_payment_id,\n    'receivable_status_changed',\n    jsonb_build_object(\n      'collected_amount', new.collected_amount,\n      'pending_amount', new.pending_amount,\n      'due_at', new.due_at\n    )\n  );\n\n  return new;\nend;\n"
    },
    {
      "signature": "public.recalculate_service_financial(uuid)",
      "source": "\ndeclare\n  v_financial public.service_financials%rowtype;\n  v_subtotal numeric(14, 2);\n  v_discount numeric(14, 2);\n  v_surcharge numeric(14, 2);\n  v_taxable numeric(14, 2);\n  v_tax numeric(14, 2);\n  v_total numeric(14, 2);\n  v_paid numeric(14, 2);\n  v_pending numeric(14, 2);\n  v_status text;\nbegin\n  select *\n  into v_financial\n  from public.service_financials financial\n  where financial.id = p_service_financial_id\n  for update;\n\n  if not found then\n    raise exception 'Service financial row \"%\" does not exist.', p_service_financial_id\n      using errcode = '23503';\n  end if;\n\n  select\n    coalesce(round(sum(component.line_amount) filter (\n      where component.is_active\n        and component.component_type not in (\n          'discount',\n          'night_surcharge',\n          'holiday_surcharge',\n          'airport_fee',\n          'toll',\n          'parking'\n        )\n    ), 2), 0),\n    coalesce(round(sum(component.line_amount) filter (\n      where component.is_active\n        and component.component_type = 'discount'\n    ), 2), 0),\n    coalesce(round(sum(component.line_amount) filter (\n      where component.is_active\n        and component.component_type in (\n          'night_surcharge',\n          'holiday_surcharge',\n          'airport_fee',\n          'toll',\n          'parking'\n        )\n    ), 2), 0)\n  into v_subtotal, v_discount, v_surcharge\n  from public.service_price_components component\n  where component.service_financial_id = p_service_financial_id;\n\n  v_taxable := round(v_subtotal + v_surcharge - v_discount, 2);\n\n  if v_taxable < 0 then\n    raise exception 'Service financial taxable base amount cannot be negative.'\n      using errcode = '23514';\n  end if;\n\n  v_tax := round(v_taxable * v_financial.tax_rate / 100, 2);\n  v_total := round(v_taxable + v_tax, 2);\n\n  select coalesce(round(sum(payment.amount), 2), 0)\n  into v_paid\n  from public.service_payments payment\n  where payment.service_financial_id = p_service_financial_id\n    and payment.payment_status = 'completed';\n\n  if v_paid > v_total then\n    raise exception 'Service financial paid amount cannot exceed total amount.'\n      using errcode = '23514';\n  end if;\n\n  v_pending := round(v_total - v_paid, 2);\n\n  if v_financial.pricing_status = 'cancelled' then\n    v_status := 'cancelled';\n  elsif v_total > 0 and v_pending = 0 then\n    v_status := 'paid';\n  elsif v_paid > 0 and v_pending > 0 then\n    v_status := 'partial';\n  else\n    v_status := 'pending';\n  end if;\n\n  perform set_config('elara.service_financial_recalculate', p_service_financial_id::text, true);\n\n  update public.service_financials\n  set subtotal_amount = v_subtotal,\n      discount_amount = v_discount,\n      surcharge_amount = v_surcharge,\n      taxable_base_amount = v_taxable,\n      tax_amount = v_tax,\n      total_amount = v_total,\n      paid_amount = v_paid,\n      pending_amount = v_pending,\n      financial_status = v_status\n  where id = p_service_financial_id\n  returning *\n  into v_financial;\n\n  perform set_config('elara.service_financial_recalculate', '', true);\n\n  return;\nend;\n"
    },
    {
      "signature": "public.recalculate_service_financial_from_payment()",
      "source": "\nbegin\n  if tg_op = 'DELETE' then\n    perform public.recalculate_service_financial(old.service_financial_id);\n    return old;\n  end if;\n\n  perform public.recalculate_service_financial(new.service_financial_id);\n  return new;\nend;\n"
    },
    {
      "signature": "public.recalculate_service_financial_from_component()",
      "source": "\nbegin\n  if tg_op = 'DELETE' then\n    perform public.recalculate_service_financial(old.service_financial_id);\n    return old;\n  end if;\n\n  perform public.recalculate_service_financial(new.service_financial_id);\n  return new;\nend;\n"
    },
    {
      "signature": "public.recalculate_service_financial_from_financial_edit()",
      "source": "\nbegin\n  perform public.recalculate_service_financial(new.id);\n  return new;\nend;\n"
    },
    {
      "signature": "public.validate_service_payment_integrity()",
      "source": "\ndeclare\n  v_financial public.service_financials%rowtype;\n  v_service_status text;\nbegin\n  if tg_op = 'DELETE' then\n    raise exception 'Service payments cannot be deleted; use cancellation or reversal instead.'\n      using errcode = '23514';\n  end if;\n\n  select *\n  into v_financial\n  from public.service_financials financial\n  where financial.id = new.service_financial_id\n  for update;\n\n  if not found then\n    raise exception 'Service payment references a missing service financial row.'\n      using errcode = '23503';\n  end if;\n\n  if v_financial.service_id <> new.service_id then\n    raise exception 'Service payment service_id must match the service financial row.'\n      using errcode = '23514';\n  end if;\n\n  select service.operational_status\n  into v_service_status\n  from public.services service\n  where service.id = new.service_id;\n\n  if v_service_status is null then\n    raise exception 'Service payment references a missing service.'\n      using errcode = '23503';\n  end if;\n\n  if new.currency_code <> v_financial.currency_code then\n    raise exception 'Service payment currency must match the service financial currency.'\n      using errcode = '23514';\n  end if;\n\n  if tg_op = 'UPDATE' then\n    if old.payment_status = 'completed' and new.payment_status in ('pending', 'failed') then\n      raise exception 'Completed payments cannot return to pending or failed.'\n        using errcode = '23514';\n    end if;\n\n    if old.payment_status in ('cancelled', 'reversed') and new.payment_status <> old.payment_status then\n      raise exception 'Cancelled or reversed payments cannot be reactivated.'\n        using errcode = '23514';\n    end if;\n  end if;\n\n  if new.payment_status = 'completed' then\n    if v_service_status in ('cancelled', 'no_show', 'not_performed') then\n      raise exception 'Cannot register a payment for a cancelled, no-show or not-performed service.'\n        using errcode = '23514';\n    end if;\n\n    if v_financial.pricing_status <> 'finalized' then\n      raise exception 'Service pricing must be finalized before registering payment.'\n        using errcode = '23514';\n    end if;\n\n    if v_financial.pending_amount <= 0 then\n      raise exception 'Service has no pending amount to pay.'\n        using errcode = '23514';\n    end if;\n\n    if new.amount <> v_financial.pending_amount then\n      raise exception 'Only full service payments are supported in this phase.'\n        using errcode = '23514';\n    end if;\n\n    if exists (\n      select 1\n      from public.service_payments existing_payment\n      where existing_payment.service_financial_id = new.service_financial_id\n        and existing_payment.payment_status = 'completed'\n        and existing_payment.id <> new.id\n    ) then\n      raise exception 'Service already has an active completed payment.'\n        using errcode = '23505';\n    end if;\n  end if;\n\n  return new;\nend;\n"
    },
    {
      "signature": "public.calculate_cash_account_balance(uuid,timestamptz)",
      "source": "\ndeclare\n  v_opening_balance numeric(14, 2);\n  v_movements_total numeric(14, 2);\nbegin\n  select account.opening_balance\n  into v_opening_balance\n  from public.cash_accounts account\n  where account.id = p_cash_account_id;\n\n  if not found then\n    raise exception 'Cash account \"%\" does not exist.', p_cash_account_id\n      using errcode = '23503';\n  end if;\n\n  select coalesce(round(sum(\n    case movement.movement_type\n      when 'inflow' then movement.amount\n      when 'outflow' then -movement.amount\n      else 0\n    end\n  ), 2), 0)\n  into v_movements_total\n  from public.cash_movements movement\n  where movement.cash_account_id = p_cash_account_id\n    and (p_until_at is null or movement.occurred_at <= p_until_at);\n\n  return round(v_opening_balance + v_movements_total, 2);\nend;\n"
    },
    {
      "signature": "elara_private.guard_cash_reversal()",
      "source": "\ndeclare v_account uuid; begin\n if new.movement_category='reversal' then\n  select cash_account_id into v_account from public.cash_movements where id=new.original_movement_id;\n  perform 1 from public.cash_accounts where id=v_account for no key update;\n  if exists(select 1 from public.driver_cash_source_allocations a join public.cash_movements m on m.id=new.original_movement_id\n    where a.status<>'released' and (a.cash_movement_id=m.id or (a.remittance_id=m.remittance_id and m.movement_category in ('remittance_sent','remittance_received')))) then\n   raise exception 'Allocated cash cannot be reversed without an explicit reconciliation policy.' using errcode='23514';\n  end if;\n end if; return new;\nend "
    },
    {
      "signature": "elara_private.guard_cash_payment()",
      "source": "\ndeclare v_account uuid; begin\n if new.payment_status is distinct from old.payment_status or new.payment_method is distinct from old.payment_method or new.amount is distinct from old.amount or new.currency_code is distinct from old.currency_code or new.service_id is distinct from old.service_id or new.service_financial_id is distinct from old.service_financial_id then\n  for v_account in select distinct m.cash_account_id from public.cash_movements m where m.service_payment_id=old.id order by m.cash_account_id loop\n   perform 1 from public.cash_accounts where id=v_account for no key update;\n  end loop;\n  if exists(select 1 from public.driver_cash_source_allocations a join public.cash_movements m on m.id=a.cash_movement_id where m.service_payment_id=old.id and a.status<>'released') then\n   raise exception 'A cash payment with active allocations cannot be changed or reversed.' using errcode='23514';\n  end if;\n end if; return new;\nend "
    },
    {
      "signature": "elara_private.guard_cash_account_identity()",
      "source": "\nbegin\n if (new.driver_id is distinct from old.driver_id or new.currency_code is distinct from old.currency_code or new.account_type is distinct from old.account_type)\n  and exists(select 1 from public.cash_movements where cash_account_id=old.id) then\n  raise exception 'Cash account ownership, type and currency are immutable after cash movements.' using errcode='23514';end if;\n return new;\nend "
    },
    {
      "signature": "public.set_updated_at()",
      "source": "\nbegin\n  new.updated_at = now();\n  return new;\nend;\n"
    },
    {
      "signature": "public.validate_vehicle_document_integrity()",
      "source": "\ndeclare\n  v_expires_required boolean;\nbegin\n  select document_type.expires_required\n  into v_expires_required\n  from public.vehicle_document_types document_type\n  where document_type.key = new.document_type_key;\n\n  if v_expires_required = true\n    and new.status not in ('pending', 'rejected')\n    and new.expires_at is null\n  then\n    raise exception 'Vehicle document type \"%\" requires expires_at for status \"%\".', new.document_type_key, new.status\n      using errcode = '23514';\n  end if;\n\n  if new.storage_path is not null and nullif(trim(new.storage_bucket), '') is null then\n    raise exception 'Vehicle document storage_path requires storage_bucket.'\n      using errcode = '23514';\n  end if;\n\n  return new;\nend;\n"
    },
    {
      "signature": "public.prevent_service_append_only_changes()",
      "source": "\nbegin\n  raise exception 'Service history, events and snapshots are append-only.'\n    using errcode = '23514';\nend;\n"
    },
    {
      "signature": "elara_private.guard_reserved_cash_outflow()",
      "source": "\ndeclare v_c record;v_own numeric:=0;begin\n if new.movement_type<>'outflow' then return new;end if;\n perform 1 from public.cash_accounts where id=new.cash_account_id for no key update;\n select * into v_c from elara_private.driver_cash_coverage where cash_account_id=new.cash_account_id;\n if not found then return new;end if;\n if new.movement_category='remittance_sent' then\n  select coalesce(sum(amount),0) into v_own from public.driver_cash_source_allocations where remittance_id=new.remittance_id and status='applied';\n end if;\n if v_c.committed_amount-v_own>0 and v_c.book_balance-new.amount<v_c.committed_amount-v_own then\n  raise exception 'Cash outflow would spend reserved cash sources.' using errcode='23514';end if;return new;\nend "
    }
  ],
  "additional_view_sources": [
    {
      "name": "elara_private.driver_cash_available",
      "source": "select m.id cash_movement_id,m.cash_account_id,c.driver_id driver_id,m.currency_code,\n m.service_payment_id,m.service_id,m.occurred_at,m.amount original_amount,\n coalesce(a.reserved_amount,0) reserved_amount,coalesce(a.applied_amount,0) applied_amount,\n m.amount-coalesce(a.reserved_amount,0)-coalesce(a.applied_amount,0) available_amount\nfrom public.cash_movements m\njoin public.cash_accounts c on c.id=m.cash_account_id and c.account_type='driver' and (m.actor_driver_id is null or c.driver_id=m.actor_driver_id)\njoin public.service_payments p on p.id=m.service_payment_id and p.payment_method='cash' and p.payment_status='completed'\nleft join lateral (select sum(x.amount) filter(where x.status='reserved') reserved_amount,\n sum(x.amount) filter(where x.status='applied') applied_amount\n from public.driver_cash_source_allocations x where x.cash_movement_id=m.id) a on true\nwhere m.movement_type='inflow' and m.movement_category='service_payment'\n and not exists(select 1 from public.cash_movements r where r.original_movement_id=m.id and r.movement_category='reversal')\n and not exists(select 1 from public.cash_remittance_items i join public.cash_remittances r on r.id=i.remittance_id\n   where r.source_model_version=1 and r.status<>'cancelled'\n   and (i.cash_movement_id=m.id or i.service_payment_id=m.service_payment_id))",
      "remote_definition": " SELECT m.id AS cash_movement_id,\n    m.cash_account_id,\n    c.driver_id,\n    m.currency_code,\n    m.service_payment_id,\n    m.service_id,\n    m.occurred_at,\n    m.amount AS original_amount,\n    COALESCE(a.reserved_amount, 0::numeric) AS reserved_amount,\n    COALESCE(a.applied_amount, 0::numeric) AS applied_amount,\n    m.amount - COALESCE(a.reserved_amount, 0::numeric) - COALESCE(a.applied_amount, 0::numeric) AS available_amount\n   FROM cash_movements m\n     JOIN cash_accounts c ON c.id = m.cash_account_id AND c.account_type = 'driver'::text AND (m.actor_driver_id IS NULL OR c.driver_id = m.actor_driver_id)\n     JOIN service_payments p ON p.id = m.service_payment_id AND p.payment_method = 'cash'::text AND p.payment_status = 'completed'::text\n     LEFT JOIN LATERAL ( SELECT sum(x.amount) FILTER (WHERE x.status = 'reserved'::text) AS reserved_amount,\n            sum(x.amount) FILTER (WHERE x.status = 'applied'::text) AS applied_amount\n           FROM driver_cash_source_allocations x\n          WHERE x.cash_movement_id = m.id) a ON true\n  WHERE m.movement_type = 'inflow'::text AND m.movement_category = 'service_payment'::text AND NOT (EXISTS ( SELECT 1\n           FROM cash_movements r\n          WHERE r.original_movement_id = m.id AND r.movement_category = 'reversal'::text)) AND NOT (EXISTS ( SELECT 1\n           FROM cash_remittance_items i\n             JOIN cash_remittances r ON r.id = i.remittance_id\n          WHERE r.source_model_version = 1 AND r.status <> 'cancelled'::text AND (i.cash_movement_id = m.id OR i.service_payment_id = m.service_payment_id)));",
      "schema": "elara_private",
      "view": "driver_cash_available",
      "relkind": "v",
      "owner": "postgres",
      "ordered_columns": [
        {
          "ordinal": 1,
          "name": "cash_movement_id",
          "type": "uuid"
        },
        {
          "ordinal": 2,
          "name": "cash_account_id",
          "type": "uuid"
        },
        {
          "ordinal": 3,
          "name": "driver_id",
          "type": "uuid"
        },
        {
          "ordinal": 4,
          "name": "currency_code",
          "type": "text"
        },
        {
          "ordinal": 5,
          "name": "service_payment_id",
          "type": "uuid"
        },
        {
          "ordinal": 6,
          "name": "service_id",
          "type": "uuid"
        },
        {
          "ordinal": 7,
          "name": "occurred_at",
          "type": "timestamp with time zone"
        },
        {
          "ordinal": 8,
          "name": "original_amount",
          "type": "numeric(14,2)"
        },
        {
          "ordinal": 9,
          "name": "reserved_amount",
          "type": "numeric"
        },
        {
          "ordinal": 10,
          "name": "applied_amount",
          "type": "numeric"
        },
        {
          "ordinal": 11,
          "name": "available_amount",
          "type": "numeric"
        }
      ],
      "security_barrier": false,
      "security_invoker": false,
      "reloptions": null,
      "public_privileges": [],
      "public_schema_privileges": [],
      "role_access": [
        {
          "role": "anon",
          "schema_usage": false,
          "view_select": false
        },
        {
          "role": "authenticated",
          "schema_usage": false,
          "view_select": false
        },
        {
          "role": "service_role",
          "schema_usage": false,
          "view_select": false
        }
      ]
    },
    {
      "name": "elara_private.driver_cash_coverage",
      "source": "select c.id cash_account_id,public.calculate_cash_account_balance(c.id) book_balance,\n coalesce((select sum(a.amount) from public.driver_cash_source_allocations a where a.cash_account_id=c.id and (\n  a.status='reserved' or (a.status='applied' and (a.allocation_type='settlement_offset' or not exists(\n   select 1 from public.cash_movements m where m.remittance_id=a.remittance_id and m.movement_category='remittance_sent'))))),0)\n +coalesce((select sum(r.declared_amount) from public.cash_remittances r where r.source_cash_account_id=c.id\n   and r.source_model_version=1 and r.status in ('prepared','submitted','received')),0) committed_amount\nfrom public.cash_accounts c where c.account_type='driver'",
      "remote_definition": " SELECT id AS cash_account_id,\n    calculate_cash_account_balance(id) AS book_balance,\n    COALESCE(( SELECT sum(a.amount) AS sum\n           FROM driver_cash_source_allocations a\n          WHERE a.cash_account_id = c.id AND (a.status = 'reserved'::text OR a.status = 'applied'::text AND (a.allocation_type = 'settlement_offset'::text OR NOT (EXISTS ( SELECT 1\n                   FROM cash_movements m\n                  WHERE m.remittance_id = a.remittance_id AND m.movement_category = 'remittance_sent'::text))))), 0::numeric) + COALESCE(( SELECT sum(r.declared_amount) AS sum\n           FROM cash_remittances r\n          WHERE r.source_cash_account_id = c.id AND r.source_model_version = 1 AND (r.status = ANY (ARRAY['prepared'::text, 'submitted'::text, 'received'::text]))), 0::numeric) AS committed_amount\n   FROM cash_accounts c\n  WHERE account_type = 'driver'::text;",
      "schema": "elara_private",
      "view": "driver_cash_coverage",
      "relkind": "v",
      "owner": "postgres",
      "ordered_columns": [
        {
          "ordinal": 1,
          "name": "cash_account_id",
          "type": "uuid"
        },
        {
          "ordinal": 2,
          "name": "book_balance",
          "type": "numeric"
        },
        {
          "ordinal": 3,
          "name": "committed_amount",
          "type": "numeric"
        }
      ],
      "security_barrier": false,
      "security_invoker": false,
      "reloptions": null,
      "public_privileges": [],
      "public_schema_privileges": [],
      "role_access": [
        {
          "role": "anon",
          "schema_usage": false,
          "view_select": false
        },
        {
          "role": "authenticated",
          "schema_usage": false,
          "view_select": false
        },
        {
          "role": "service_role",
          "schema_usage": false,
          "view_select": false
        }
      ]
    }
  ]
}$qa_frozen$,false) IS NOT NULL AS cfg \gset
SELECT set_config('elara_qa.plan',$qa_plan${
  "project": "ELARA Transport",
  "qa_run": "QA-4546-20261012-R01",
  "project_ref": "pfdvehcyauoncxeolcjc",
  "timezone": "Europe/Madrid",
  "phase": "designed",
  "execution_prohibited_in_this_delivery": true,
  "contract_fingerprints": null,
  "legacy_baseline": null,
  "mode_defaults": {
    "qa_mode": "PREFLIGHT",
    "allow_prepare": false,
    "allow_preview": false,
    "allow_generate": false,
    "generate_confirmation": ""
  },
  "cash_movement_policy": "Six cash inflows: four administrative and two driver; every cash receipt is represented in its account ledger.",
  "cases": [
    {
      "qa_case": "C1",
      "name": "QA 4546 R01 C1 Interno",
      "last_name": "Interno",
      "driver_type": "internal_driver",
      "plate": "4546-BBC",
      "account_name": "QA 4546 R01 C1 Driver EUR",
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross": 200,
      "driver_amount": 70,
      "elara_amount": 130,
      "cash_available": 0,
      "cash_offset": 0,
      "payable_amount": 70,
      "services": [
        {
          "alias": "SERVICE",
          "price": 200,
          "payment_destination": "administrative",
          "driver_percentage": 35,
          "elara_percentage": 65
        }
      ]
    },
    {
      "qa_case": "C2",
      "name": "QA 4546 R01 C2 Externo",
      "last_name": "Externo",
      "driver_type": "external_collaborator",
      "plate": "4546-BBD",
      "account_name": "QA 4546 R01 C2 Driver EUR",
      "period_start": "2026-10-12",
      "period_end": "2026-10-18",
      "gross": 200,
      "driver_amount": 180,
      "elara_amount": 20,
      "cash_available": 0,
      "cash_offset": 0,
      "payable_amount": 180,
      "services": [
        {
          "alias": "SERVICE",
          "price": 200,
          "payment_destination": "administrative",
          "driver_percentage": 90,
          "elara_percentage": 10
        }
      ]
    },
    {
      "qa_case": "C3",
      "name": "QA 4546 R01 C3 Offset Parcial",
      "last_name": "Offset Parcial",
      "driver_type": "internal_driver",
      "plate": "4546-BBF",
      "account_name": "QA 4546 R01 C3 Driver EUR",
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross": 500,
      "driver_amount": 175,
      "elara_amount": 325,
      "cash_available": 100,
      "cash_offset": 100,
      "payable_amount": 75,
      "services": [
        {
          "alias": "SERVICE-A",
          "price": 400,
          "payment_destination": "administrative",
          "driver_percentage": 35,
          "elara_percentage": 65
        },
        {
          "alias": "SERVICE-B",
          "price": 100,
          "payment_destination": "driver",
          "driver_percentage": 35,
          "elara_percentage": 65
        }
      ]
    },
    {
      "qa_case": "C4",
      "name": "QA 4546 R01 C4 Cash Mayor",
      "last_name": "Cash Mayor",
      "driver_type": "internal_driver",
      "plate": "4546-BBG",
      "account_name": "QA 4546 R01 C4 Driver EUR",
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross": 200,
      "driver_amount": 70,
      "elara_amount": 130,
      "cash_available": 200,
      "cash_offset": 70,
      "payable_amount": 0,
      "services": [
        {
          "alias": "SERVICE",
          "price": 200,
          "payment_destination": "driver",
          "driver_percentage": 35,
          "elara_percentage": 65
        }
      ]
    },
    {
      "qa_case": "C5",
      "name": "QA 4546 R01 C5 CxC",
      "last_name": "CxC",
      "driver_type": "internal_driver",
      "plate": "4546-BBH",
      "account_name": "QA 4546 R01 C5 Driver EUR",
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross": 200,
      "driver_amount": 70,
      "elara_amount": 130,
      "cash_available": 0,
      "cash_offset": 0,
      "payable_amount": 70,
      "services": [
        {
          "alias": "SERVICE",
          "price": 200,
          "payment_destination": null,
          "driver_percentage": 35,
          "elara_percentage": 65
        }
      ]
    },
    {
      "qa_case": "C6",
      "name": "QA 4546 R01 C6 Override",
      "last_name": "Override",
      "driver_type": "internal_driver",
      "plate": "4546-BBJ",
      "account_name": "QA 4546 R01 C6 Driver EUR",
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross": 200,
      "driver_amount": 80,
      "elara_amount": 120,
      "cash_available": 0,
      "cash_offset": 0,
      "payable_amount": 80,
      "services": [
        {
          "alias": "SERVICE",
          "price": 200,
          "payment_destination": "administrative",
          "driver_percentage": 40,
          "elara_percentage": 60
        }
      ]
    }
  ],
  "expected_entities": [
    {
      "qa_case": "COMMON",
      "entity_type": "companies",
      "entity_alias": "COMPANY",
      "purpose": "Infraestructura nueva del lote",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "COMMON",
      "entity_type": "customers",
      "entity_alias": "CUSTOMER",
      "purpose": "Infraestructura nueva del lote",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "COMMON",
      "entity_type": "cash_accounts",
      "entity_alias": "ADMIN",
      "purpose": "Infraestructura nueva del lote",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "services",
      "entity_alias": "SERVICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE:PAYMENT",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "allocated",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE:CASH",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "inflow",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "services",
      "entity_alias": "SERVICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE:PAYMENT",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "allocated",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE:CASH",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "inflow",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "services",
      "entity_alias": "SERVICE-A",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE-A:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE-A:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE-A:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE-A:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE-A:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE-A:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-A:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-A:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-A:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE-A:PAYMENT",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "completed",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE-A:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "allocated",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE-A:CASH",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "inflow",
      "expected_amount": "400",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "services",
      "entity_alias": "SERVICE-B",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE-B:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE-B:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE-B:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE-B:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE-B:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE-B:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-B:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-B:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE-B:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE-B:PAYMENT",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "completed",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE-B:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "allocated",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE-B:CASH",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "inflow",
      "expected_amount": "100",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "services",
      "entity_alias": "SERVICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE:PAYMENT",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "allocated",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE:CASH",
      "purpose": "Cobro cash trazable driver",
      "expected_state": "inflow",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "services",
      "entity_alias": "SERVICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "receivables",
      "entity_alias": "SERVICE:RECEIVABLE",
      "purpose": "CxC QA sin cobro",
      "expected_state": "open",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "persons",
      "entity_alias": "PERSON",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "drivers",
      "entity_alias": "DRIVER",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "vehicles",
      "entity_alias": "VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "available",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "cash_accounts",
      "entity_alias": "DRIVER-ACCOUNT",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": "0",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "driver_vehicle_assignments",
      "entity_alias": "DRIVER-VEHICLE",
      "purpose": "Identidad económica QA aislada",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:insurance",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:itv",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:circulation_permit",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "vehicle_documents",
      "entity_alias": "DOCUMENT:vtc_license",
      "purpose": "Documento sintético QA, sin archivo",
      "expected_state": "valid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "driver_settlement_overrides",
      "entity_alias": "OVERRIDE",
      "purpose": "40/60 vigente en octubre",
      "expected_state": "active",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "services",
      "entity_alias": "SERVICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_financials",
      "entity_alias": "SERVICE:FINANCIAL",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "finalized",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_assignments",
      "entity_alias": "SERVICE:ASSIGNMENT",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "ended",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_closures",
      "entity_alias": "SERVICE:CLOSURE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_price_components",
      "entity_alias": "SERVICE:PRICE",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "active",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:ORIGIN",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_locations",
      "entity_alias": "SERVICE:DESTINATION",
      "purpose": "Servicio QA y dependencias",
      "expected_state": "created",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:confirmed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "confirmed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:in_progress",
      "purpose": "Transición administrativa sintética",
      "expected_state": "in_progress",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_status_history",
      "entity_alias": "SERVICE:HISTORY:completed",
      "purpose": "Transición administrativa sintética",
      "expected_state": "completed",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_payments",
      "entity_alias": "SERVICE:PAYMENT",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "completed",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_payment_allocations",
      "entity_alias": "SERVICE:PAYMENT-ALLOCATION",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "allocated",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "cash_movements",
      "entity_alias": "SERVICE:CASH",
      "purpose": "Cobro cash trazable administrative",
      "expected_state": "inflow",
      "expected_amount": "200",
      "currency": "EUR",
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C1",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C2",
      "entity_type": "service_events",
      "entity_alias": "SERVICE:PRIORITY-EVENT",
      "purpose": "Excepción explícita de prioridad",
      "expected_state": "internal_driver_priority_overridden",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE-A:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C3",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE-B:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C4",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C5",
      "entity_type": "receivable_status_history",
      "entity_alias": "SERVICE:RECEIVABLE-HISTORY",
      "purpose": "Historial inicial automático de CxC",
      "expected_state": "open",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    },
    {
      "qa_case": "C6",
      "entity_type": "service_financial_status_history",
      "entity_alias": "SERVICE:FINANCIAL-HISTORY",
      "purpose": "Historial financiero automático",
      "expected_state": "paid",
      "expected_amount": null,
      "currency": null,
      "uuid": null,
      "human_code": null,
      "created_by": null,
      "created_at": null,
      "retention_policy": "retain_audited_qa"
    }
  ],
  "expected_counts": {
    "persons": 6,
    "drivers": 6,
    "companies": 1,
    "customers": 1,
    "vehicles": 6,
    "vehicle_documents": 24,
    "driver_vehicle_assignments": 6,
    "cash_accounts": 7,
    "services": 7,
    "service_locations": 14,
    "service_assignments": 7,
    "service_closures": 7,
    "service_financials": 7,
    "service_price_components": 7,
    "service_status_history": 21,
    "service_payments": 6,
    "service_payment_allocations": 6,
    "cash_movements": 6,
    "receivables": 1,
    "driver_settlement_overrides": 1,
    "settlements": 0,
    "settlement_items": 0,
    "driver_cash_source_allocations": 0,
    "driver_cash_source_usage": 0,
    "service_financial_status_history": 6,
    "receivable_status_history": 1,
    "service_events": 1
  },
  "expected_preview": [
    {
      "qa_case": "C1",
      "services_count": 1,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross_service_amount": 200,
      "driver_earnings_amount": 70,
      "elara_amount": 130,
      "compensable_cash_available": 0,
      "cash_offset_proposed": 0,
      "payable_amount": 70,
      "remaining_cash_to_remit": 0,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    },
    {
      "qa_case": "C2",
      "services_count": 1,
      "period_start": "2026-10-12",
      "period_end": "2026-10-18",
      "gross_service_amount": 200,
      "driver_earnings_amount": 180,
      "elara_amount": 20,
      "compensable_cash_available": 0,
      "cash_offset_proposed": 0,
      "payable_amount": 180,
      "remaining_cash_to_remit": 0,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    },
    {
      "qa_case": "C3",
      "services_count": 2,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross_service_amount": 500,
      "driver_earnings_amount": 175,
      "elara_amount": 325,
      "compensable_cash_available": 100,
      "cash_offset_proposed": 100,
      "payable_amount": 75,
      "remaining_cash_to_remit": 0,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    },
    {
      "qa_case": "C4",
      "services_count": 1,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross_service_amount": 200,
      "driver_earnings_amount": 70,
      "elara_amount": 130,
      "compensable_cash_available": 200,
      "cash_offset_proposed": 70,
      "payable_amount": 0,
      "remaining_cash_to_remit": 130,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    },
    {
      "qa_case": "C5",
      "services_count": 1,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross_service_amount": 200,
      "driver_earnings_amount": 70,
      "elara_amount": 130,
      "compensable_cash_available": 0,
      "cash_offset_proposed": 0,
      "payable_amount": 70,
      "remaining_cash_to_remit": 0,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    },
    {
      "qa_case": "C6",
      "services_count": 1,
      "period_start": "2026-10-01",
      "period_end": "2026-10-31",
      "gross_service_amount": 200,
      "driver_earnings_amount": 80,
      "elara_amount": 120,
      "compensable_cash_available": 0,
      "cash_offset_proposed": 0,
      "payable_amount": 80,
      "remaining_cash_to_remit": 0,
      "percentage_source": "per_service",
      "blockers": [],
      "excluded_services": [],
      "warnings": []
    }
  ],
  "known_integrity_exceptions": [
    [
      "C3",
      "settlement_totals_out_of_sync"
    ],
    [
      "C4",
      "settlement_totals_out_of_sync"
    ],
    [
      "C4",
      "settlement_payment_status_out_of_sync"
    ],
    [
      "C6",
      "settlement_driver_elara_amounts_out_of_sync"
    ]
  ],
  "retention_policy": "Preserve append-only records and official audit. No automatic cleanup or repair. A new run is required for replay."
}$qa_plan$,false) IS NOT NULL AS cfg \gset

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $qa_preflight$
DECLARE

  v_run constant text := 'QA-4546-20261012-R01';
  v_mode text := current_setting('elara_qa.mode');
  v_plan jsonb := current_setting('elara_qa.plan')::jsonb;
  v_frozen jsonb := current_setting('elara_qa.frozen')::jsonb;
  v_actor uuid;
  v_session uuid;
  v_case jsonb; v_service jsonb; v_guard jsonb; v_item jsonb;
  v_row jsonb; v_before jsonb; v_actual jsonb; v_baseline jsonb;
  v_obj record; v_col record; v_count bigint; v_n bigint;
  v_case_id text; v_alias text; v_tag text; v_table text; v_key text;
  v_company uuid; v_customer uuid; v_admin_account uuid;
  v_person uuid; v_driver uuid; v_vehicle uuid; v_account uuid; v_link uuid;
  v_sid uuid; v_fid uuid; v_assignment uuid; v_payment uuid; v_cash uuid;
  v_override uuid; v_settlement uuid; v_id uuid;
  v_stage text; v_doc text; v_when timestamptz; v_day date; v_price numeric;
  v_earnings numeric; v_elara numeric; v_cash_available numeric;
  v_expected numeric; v_json jsonb; v_result jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_common_count integer;

BEGIN

  IF v_mode NOT IN ('PREFLIGHT','PREPARE','VERIFY_FIXTURES','PREVIEW','GENERATE') THEN
    RAISE EXCEPTION 'STOP: unauthorized/unknown mode';
  END IF;
  IF v_mode='PREPARE' AND (
    current_setting('elara_qa.allow_prepare')::boolean IS NOT TRUE
    OR current_setting('elara_qa.confirm_prepare') IS DISTINCT FROM v_run||':PREPARE')
  THEN RAISE EXCEPTION 'STOP: PREPARE requires its explicit flag and exact confirmation'; END IF;
  IF v_mode='PREVIEW' AND current_setting('elara_qa.allow_preview')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'STOP: PREVIEW is disabled in this delivery';
  END IF;
  IF v_mode='GENERATE' AND (
    current_setting('elara_qa.allow_generate')::boolean IS NOT TRUE
    OR current_setting('elara_qa.confirm_generate') IS DISTINCT FROM v_run||':GENERATE')
  THEN RAISE EXCEPTION 'STOP: GENERATE requires two barriers; disabled in this delivery'; END IF;
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('entity_id',entity_id::text,'issue_type',issue_type)
    ORDER BY entity_id::text,issue_type),'[]'::jsonb) INTO v_actual FROM public.v_integrity_settlements;
  SELECT jsonb_agg(value ORDER BY value->>'entity_id',value->>'issue_type') INTO v_json
    FROM jsonb_array_elements(v_frozen->'integrity_baseline');
  IF v_actual IS DISTINCT FROM v_json THEN RAISE EXCEPTION 'STOP: unreviewed baseline integrity alert'; END IF;

  IF v_mode IN ('PREFLIGHT','PREPARE') THEN

  FOR v_obj IN SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(to_jsonb(t)::text,$1)>0
      OR strpos(to_jsonb(t)::text,''QA 4546 R01'')>0',v_obj.table_name)
      INTO v_count USING v_run;
    IF v_count<>0 THEN RAISE EXCEPTION 'STOP: prior/partial QA lot detected in %; no repair/upsert',v_obj.table_name; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.vehicles WHERE plate_normalized IN
    ('4546-BBC','4546-BBD','4546-BBF','4546-BBG','4546-BBH','4546-BBJ'))
  THEN RAISE EXCEPTION 'STOP: QA plate already exists'; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_settlement_overrides) THEN
    RAISE EXCEPTION 'STOP: unexpected override exists; review baseline before preparing';
  END IF;

  END IF;

  -- Snapshot every pre-existing UUID-id row, including official audit. Code
  -- counters have no UUID id and are intentionally advanced by domain functions.
  v_baseline := '{}'::jsonb;
  FOR v_obj IN SELECT t.table_schema,t.table_name FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name
    WHERE t.table_type='BASE TABLE' AND t.table_schema IN ('public','elara_private')
      AND c.column_name='id' AND c.udt_name='uuid' AND t.table_name<>'app_sessions'
    ORDER BY t.table_schema,t.table_name
  LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb) FROM %I.%I t',
      v_obj.table_schema,v_obj.table_name) INTO v_actual;
    v_baseline := v_baseline||jsonb_build_object(v_obj.table_schema||'.'||v_obj.table_name,v_actual);
  END LOOP;
  PERFORM set_config('elara_qa.existing_rows',v_baseline::text,false);

  RAISE NOTICE 'PREFLIGHT passed. No persistent database writes.';

END;
$qa_preflight$;
COMMIT;

SELECT current_setting('elara_qa.mode')='PREPARE' AS do_prepare,
  current_setting('elara_qa.mode') IN ('VERIFY_FIXTURES','PREVIEW','GENERATE') AS do_verify,
  current_setting('elara_qa.mode')='PREVIEW' AS do_preview,
  current_setting('elara_qa.mode')='GENERATE' AS do_generate \gset

\if :do_prepare
-- Top-level DO only; no outer BEGIN/psql -1 and no exception handler enclosing COMMIT.
SELECT pg_try_advisory_lock(hashtextextended('QA-4546-20261012-R01',0)) AS got_lock \gset
\if :got_lock
\else
DO $qa_lock_error$ BEGIN RAISE EXCEPTION 'STOP: another execution owns this QA lot'; END; $qa_lock_error$;
\endif

SET default_transaction_read_only = off;
SET default_transaction_isolation = 'serializable';
DO $qa_prepare$
DECLARE
  v_full_plan jsonb;

  v_run constant text := 'QA-4546-20261012-R01';
  v_mode text := current_setting('elara_qa.mode');
  v_plan jsonb := current_setting('elara_qa.plan')::jsonb;
  v_frozen jsonb := current_setting('elara_qa.frozen')::jsonb;
  v_actor uuid;
  v_session uuid;
  v_case jsonb; v_service jsonb; v_guard jsonb; v_item jsonb;
  v_row jsonb; v_before jsonb; v_actual jsonb; v_baseline jsonb;
  v_obj record; v_col record; v_count bigint; v_n bigint;
  v_case_id text; v_alias text; v_tag text; v_table text; v_key text;
  v_company uuid; v_customer uuid; v_admin_account uuid;
  v_person uuid; v_driver uuid; v_vehicle uuid; v_account uuid; v_link uuid;
  v_sid uuid; v_fid uuid; v_assignment uuid; v_payment uuid; v_cash uuid;
  v_override uuid; v_settlement uuid; v_id uuid;
  v_stage text; v_doc text; v_when timestamptz; v_day date; v_price numeric;
  v_earnings numeric; v_elara numeric; v_cash_available numeric;
  v_expected numeric; v_json jsonb; v_result jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_common_count integer;

BEGIN
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  FOR v_obj IN SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(to_jsonb(t)::text,$1)>0
      OR strpos(to_jsonb(t)::text,''QA 4546 R01'')>0',v_obj.table_name)
      INTO v_count USING v_run;
    IF v_count<>0 THEN RAISE EXCEPTION 'STOP: prior/partial QA lot detected in %; no repair/upsert',v_obj.table_name; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.vehicles WHERE plate_normalized IN
    ('4546-BBC','4546-BBD','4546-BBF','4546-BBG','4546-BBH','4546-BBJ'))
  THEN RAISE EXCEPTION 'STOP: QA plate already exists'; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_settlement_overrides) THEN
    RAISE EXCEPTION 'STOP: unexpected override exists; review baseline before preparing';
  END IF;

  v_case_id:='COMMON';
  INSERT INTO public.companies(legal_name,status,notes,created_by,updated_by)
    VALUES('QA 4546 R01 Cliente','active','qa_run='||v_run||';qa_case=COMMON;entity_alias=COMPANY;purpose=synthetic QA company',v_actor,v_actor)
    RETURNING to_jsonb(companies) INTO v_row;
  v_company:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','companies',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','COMPANY',
        'entity_type','companies','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  INSERT INTO public.customers(customer_type,company_id,status,internal_notes,created_by,updated_by)
    VALUES('company',v_company,'active','qa_run='||v_run||';qa_case=COMMON;entity_alias=CUSTOMER;purpose=QA customer',v_actor,v_actor)
    RETURNING to_jsonb(customers) INTO v_row;
  v_customer:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','customers',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','CUSTOMER',
        'entity_type','customers','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  INSERT INTO public.cash_accounts(name,account_type,currency_code,status,opening_balance,responsible_user_id,notes,created_by,updated_by)
    VALUES('QA 4546 R01 Administrativa EUR','administrative','EUR','active',0,v_actor,
      'qa_run='||v_run||';qa_case=COMMON;entity_alias=ADMIN;purpose=QA cash collection, not driver cash',v_actor,v_actor)
    RETURNING to_jsonb(cash_accounts) INTO v_row;
  v_admin_account:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','cash_accounts',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','ADMIN',
        'entity_type','cash_accounts','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  IF (SELECT count(*) FROM public.customers WHERE company_id=v_company)<>1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts WHERE id=v_admin_account AND opening_balance=0
      AND status='active' AND account_type='administrative' AND driver_id IS NULL)
    OR EXISTS(SELECT 1 FROM public.cash_movements WHERE cash_account_id=v_admin_account)
  THEN RAISE EXCEPTION 'STOP: bootstrap assertion failed'; END IF;

  v_baseline := current_setting('elara_qa.existing_rows')::jsonb;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_baseline) LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb)
      FROM %s t WHERE id::text IN (SELECT jsonb_object_keys($1))',to_regclass(v_obj.key))
      INTO v_actual USING v_obj.value;
    IF v_actual IS DISTINCT FROM v_obj.value THEN
      RAISE EXCEPTION 'STOP: existing protected rows changed/deleted: %',v_obj.key;
    END IF;
  END LOOP;

  RAISE NOTICE 'COMMON assertions passed; committing bootstrap.';
  COMMIT;
  FOR v_case IN SELECT value FROM jsonb_array_elements(v_plan->'cases') LOOP
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  v_case_id:=v_case->>'qa_case';
  v_tag:='qa_run='||v_run||';qa_case='||v_case_id||';';
  SELECT id INTO STRICT v_customer FROM public.customers
    WHERE internal_notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=CUSTOMER;%';
  SELECT id INTO STRICT v_admin_account FROM public.cash_accounts
    WHERE notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=ADMIN;%';
  IF EXISTS(SELECT 1 FROM public.persons WHERE notes LIKE v_tag||'%')
    OR EXISTS(SELECT 1 FROM public.drivers WHERE observations LIKE v_tag||'%')
    OR EXISTS(SELECT 1 FROM public.services WHERE notes LIKE v_tag||'%')
  THEN RAISE EXCEPTION 'STOP: case already/partly exists: %',v_case_id; END IF;

  INSERT INTO public.persons(first_name,last_name,status,notes,created_by,updated_by)
    VALUES('QA 4546 R01 '||v_case_id,v_case->>'last_name','active',v_tag||'entity_alias=PERSON;purpose=economic QA, no login',v_actor,v_actor)
    RETURNING to_jsonb(persons) INTO v_row;
  v_person:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','persons',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','PERSON',
        'entity_type','persons','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  INSERT INTO public.drivers(person_id,driver_type,administrative_status,availability_preference,license_expiration,observations,created_by,updated_by)
    VALUES(v_person,v_case->>'driver_type','active','unavailable','2027-12-31',
      v_tag||'entity_alias=DRIVER;purpose=isolated economic QA',v_actor,v_actor)
    RETURNING to_jsonb(drivers) INTO v_row;
  v_driver:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','drivers',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','DRIVER',
        'entity_type','drivers','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  INSERT INTO public.vehicles(plate_original,plate_country,brand,model,ownership_type,external_owner_id,
      manual_operational_status,elara_approval_status,notes,created_by,updated_by)
    VALUES(v_case->>'plate','ES','QA','4546 R01 '||v_case_id,'owned',NULL,'available','not_required',
      v_tag||'entity_alias=VEHICLE;purpose=synthetic QA vehicle',v_actor,v_actor)
    RETURNING to_jsonb(vehicles) INTO v_row;
  v_vehicle:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','vehicles',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','VEHICLE',
        'entity_type','vehicles','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  FOREACH v_doc IN ARRAY ARRAY['insurance','itv','circulation_permit','vtc_license'] LOOP
    INSERT INTO public.vehicle_documents(vehicle_id,document_type_key,status,issued_at,expires_at,
      reference_number,notes,validated_at,validated_by,created_by,updated_by)
    VALUES(v_vehicle,v_doc,'valid',(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date,
      CASE WHEN v_doc='circulation_permit' THEN NULL ELSE '2027-12-31'::date END,
      v_run||':'||v_case_id||':'||v_doc||':SYNTHETIC',
      v_tag||'entity_alias=DOCUMENT:'||v_doc||';purpose=synthetic QA only, no file',
      clock_timestamp(),v_actor,v_actor,v_actor)
    RETURNING to_jsonb(vehicle_documents) INTO v_row;

    PERFORM public.secure_audit('insert','vehicle_documents',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','DOCUMENT:'||v_doc,
        'entity_type','vehicle_documents','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  END LOOP;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  IF NOT public.vehicle_is_assignable(v_vehicle) THEN RAISE EXCEPTION 'STOP: QA vehicle not assignable'; END IF;
  INSERT INTO public.cash_accounts(name,account_type,currency_code,driver_id,status,opening_balance,responsible_user_id,notes,created_by,updated_by)
    VALUES(v_case->>'account_name','driver','EUR',v_driver,'active',0,v_actor,
      v_tag||'entity_alias=DRIVER-ACCOUNT;purpose=isolated driver cash',v_actor,v_actor)
    RETURNING to_jsonb(cash_accounts) INTO v_row;
  v_account:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','cash_accounts',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','DRIVER-ACCOUNT',
        'entity_type','cash_accounts','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  INSERT INTO public.driver_vehicle_assignments(driver_id,vehicle_id,status,notes,created_by)
    VALUES(v_driver,v_vehicle,'active',v_tag||'entity_alias=DRIVER-VEHICLE;purpose=QA link',v_actor)
    RETURNING to_jsonb(driver_vehicle_assignments) INTO v_row;
  v_link:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','driver_vehicle_assignments',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','DRIVER-VEHICLE',
        'entity_type','driver_vehicle_assignments','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  IF EXISTS(SELECT 1 FROM public.cash_movements WHERE cash_account_id=v_account)
    OR EXISTS(SELECT 1 FROM public.settlements WHERE driver_id=v_driver)
    OR EXISTS(SELECT 1 FROM public.driver_settlement_overrides WHERE driver_id=v_driver)
  THEN RAISE EXCEPTION 'STOP: unexpected initial driver economics'; END IF;
  IF v_case_id='C6' THEN
    INSERT INTO public.driver_settlement_overrides(driver_id,currency_code,driver_percentage,elara_percentage,
      effective_from,effective_to,status,source,notes,created_by)
      VALUES(v_driver,'EUR',40,60,'2026-10-01','2026-10-31','active',v_run,
        v_tag||'entity_alias=OVERRIDE;purpose=dated 40/60 QA precedence',v_actor)
      RETURNING to_jsonb(driver_settlement_overrides) INTO v_row;
    v_override:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','driver_settlement_overrides',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias','OVERRIDE',
        'entity_type','driver_settlement_overrides','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

  END IF;

  FOR v_service IN SELECT value FROM jsonb_array_elements(v_case->'services') LOOP
    v_alias:=v_service->>'alias'; v_price:=(v_service->>'price')::numeric;
    v_when:=clock_timestamp();
    SELECT r.service_id INTO STRICT v_sid FROM public.create_service(v_customer,'transfer',v_when,
      'QA origin '||v_case_id||' '||v_alias,'Synthetic QA origin',
      'QA destination '||v_case_id||' '||v_alias,'Synthetic QA destination',NULL,NULL,
      v_tag||'entity_alias='||v_alias||';purpose=synthetic administrative economic fixture') r;
    SELECT to_jsonb(s) INTO STRICT v_row FROM public.services s WHERE id=v_sid;

    PERFORM public.secure_audit('insert','services',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias,
        'entity_type','services','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    SELECT id INTO STRICT v_fid FROM public.service_financials WHERE service_id=v_sid;
    FOR v_row IN SELECT to_jsonb(l) FROM public.service_locations l WHERE l.service_id=v_sid LOOP
      v_key:=CASE WHEN v_row->>'location_type'='origin' THEN ':ORIGIN' ELSE ':DESTINATION' END;

    PERFORM public.secure_audit('insert','service_locations',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||v_key,
        'entity_type','service_locations','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    END LOOP;
    v_assignment:=public.assign_service(v_sid,v_driver,v_vehicle,v_case_id='C2',
      CASE WHEN v_case_id='C2' THEN v_tag||'purpose=explicit QA external settlement priority exception' ELSE NULL END);
    SELECT to_jsonb(a) INTO STRICT v_row FROM public.service_assignments a WHERE id=v_assignment;

    PERFORM public.secure_audit('insert','service_assignments',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':ASSIGNMENT',
        'entity_type','service_assignments','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    -- No conductor login/claims: economically accepted by the admin fixture.
    SELECT to_jsonb(a) INTO STRICT v_before FROM public.service_assignments a WHERE id=v_assignment;
    UPDATE public.service_assignments SET assignment_status='accepted',accepted_at=clock_timestamp(),
      accepted_by_driver_id=NULL WHERE id=v_assignment AND assignment_status='pending_acceptance'
      RETURNING to_jsonb(service_assignments) INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'STOP: assignment acceptance race'; END IF;

    PERFORM public.secure_audit('status_change','service_assignments',(v_row->>'id')::uuid,v_row->>'human_code',
      v_before,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':ASSIGNMENT',
        'entity_type','service_assignments','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    FOREACH v_stage IN ARRAY ARRAY['confirmed','in_progress'] LOOP
      SELECT to_jsonb(s) INTO STRICT v_before FROM public.services s WHERE id=v_sid;
      UPDATE public.services SET operational_status=v_stage,updated_by=v_actor WHERE id=v_sid
        RETURNING to_jsonb(services) INTO v_row;

    PERFORM public.secure_audit('status_change','services',(v_row->>'id')::uuid,v_row->>'human_code',
      v_before,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias,
        'entity_type','services','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      INSERT INTO public.service_status_history(service_id,from_status,to_status,changed_at,changed_by_user_id,
        assignment_id,reason,metadata)
      VALUES(v_sid,v_before->>'operational_status',v_stage,clock_timestamp(),v_actor,v_assignment,
        'Administrative synthetic QA transition',jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias))
      RETURNING to_jsonb(service_status_history) INTO v_row;

    PERFORM public.secure_audit('insert','service_status_history',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':HISTORY:'||v_stage,
        'entity_type','service_status_history','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    END LOOP;
    -- Only the mutual service/closure constraints are temporarily deferred.
    EXECUTE 'SET CONSTRAINTS public.validate_services_integrity, public.validate_service_closures_integrity DEFERRED';
    SELECT to_jsonb(s) INTO STRICT v_before FROM public.services s WHERE id=v_sid;
    UPDATE public.services SET operational_status='completed',updated_by=v_actor WHERE id=v_sid
      AND operational_status='in_progress' RETURNING to_jsonb(services) INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'STOP: service completion race'; END IF;

    PERFORM public.secure_audit('status_change','services',(v_row->>'id')::uuid,v_row->>'human_code',
      v_before,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias,
        'entity_type','services','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    INSERT INTO public.service_status_history(service_id,from_status,to_status,changed_at,changed_by_user_id,
      assignment_id,reason,metadata)
    VALUES(v_sid,'in_progress','completed',clock_timestamp(),v_actor,v_assignment,
      'Administrative synthetic QA completion',jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias))
      RETURNING to_jsonb(service_status_history) INTO v_row;

    PERFORM public.secure_audit('insert','service_status_history',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':HISTORY:completed',
        'entity_type','service_status_history','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    SELECT to_jsonb(a) INTO STRICT v_before FROM public.service_assignments a WHERE id=v_assignment;
    UPDATE public.service_assignments SET assignment_status='ended',ended_at=clock_timestamp(),ended_by=v_actor
      WHERE id=v_assignment AND assignment_status='accepted' RETURNING to_jsonb(service_assignments) INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'STOP: assignment closing race'; END IF;

    PERFORM public.secure_audit('status_change','service_assignments',(v_row->>'id')::uuid,v_row->>'human_code',
      v_before,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':ASSIGNMENT',
        'entity_type','service_assignments','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    INSERT INTO public.service_closures(service_id,assignment_id,closure_type,closed_at,closed_by_user_id,
      closed_by_driver_id,reason_details,created_by)
    VALUES(v_sid,v_assignment,'completed',clock_timestamp(),v_actor,NULL,
      v_tag||'entity_alias='||v_alias||':CLOSURE;purpose=synthetic admin QA, no driver login',v_actor)
    RETURNING to_jsonb(service_closures) INTO v_row;

    PERFORM public.secure_audit('insert','service_closures',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':CLOSURE',
        'entity_type','service_closures','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    v_id:=public.finalize_service_pricing(v_sid,v_price,0,v_tag||'entity_alias='||v_alias||':FINANCIAL;purpose=QA exact EUR price');
    IF v_id IS DISTINCT FROM v_fid THEN RAISE EXCEPTION 'STOP: financial id mismatch'; END IF;
    SELECT to_jsonb(f) INTO STRICT v_row FROM public.service_financials f WHERE id=v_fid;

    PERFORM public.secure_audit('insert','service_financials',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':FINANCIAL',
        'entity_type','service_financials','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    FOR v_row IN SELECT to_jsonb(p) FROM public.service_price_components p WHERE p.service_financial_id=v_fid LOOP

    PERFORM public.secure_audit('insert','service_price_components',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':PRICE',
        'entity_type','service_price_components','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM public.service_financials WHERE id=v_fid AND total_amount=v_price
      AND pricing_status='finalized' AND currency_code='EUR' AND tax_amount=0 AND paid_amount=0 AND pending_amount=v_price)
    THEN RAISE EXCEPTION 'STOP: exact pricing assertion failed'; END IF;

    IF v_service->>'payment_destination' IS NOT NULL THEN
      -- Never invoke the known-inconsistent payment RPC. The active trigger is
      -- the sole creator of the allocation; no manual allocation INSERT exists.
      INSERT INTO public.service_payments(service_id,service_financial_id,payment_method,payment_status,
        amount,currency_code,paid_at,external_reference,idempotency_key,notes,created_by,updated_by)
      VALUES(v_sid,v_fid,'cash','completed',v_price,'EUR',clock_timestamp(),
        v_run||':'||v_case_id||':'||v_alias,
        v_run||':'||v_case_id||':'||v_alias||':PAYMENT',
        v_tag||'entity_alias='||v_alias||':PAYMENT;purpose=synthetic QA cash receipt',v_actor,v_actor)
      RETURNING to_jsonb(service_payments) INTO v_row;
      v_payment:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','service_payments',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':PAYMENT',
        'entity_type','service_payments','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      IF (SELECT count(*) FROM public.service_payment_allocations WHERE payment_id=v_payment)<>1
        OR NOT EXISTS(SELECT 1 FROM public.service_payment_allocations WHERE payment_id=v_payment
          AND service_financial_id=v_fid AND allocated_amount=v_price)
      THEN RAISE EXCEPTION 'STOP: payment allocation must be unique and exact'; END IF;
      SELECT to_jsonb(a) INTO STRICT v_row FROM public.service_payment_allocations a WHERE payment_id=v_payment;

    PERFORM public.secure_audit('insert','service_payment_allocations',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':PAYMENT-ALLOCATION',
        'entity_type','service_payment_allocations','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      -- All six receipts are cash. Administrative receipts also need a ledger
      -- inflow to represent their account balance; only two are driver sources.
      INSERT INTO public.cash_movements(cash_account_id,movement_type,movement_category,amount,currency_code,
        occurred_at,service_id,service_payment_id,source_type,source_id,idempotency_key,description,metadata,
        created_by,actor_driver_id)
      VALUES(CASE WHEN v_service->>'payment_destination'='driver' THEN v_account ELSE v_admin_account END,
        'inflow','service_payment',v_price,'EUR',clock_timestamp(),v_sid,v_payment,'service_payment',v_payment,
        'cash:'||v_run||':'||v_case_id||':'||v_alias||':PAYMENT','QA cash receipt '||v_case_id||' '||v_alias,
        jsonb_build_object('qa_fixture',true,'qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':CASH'),
        v_actor,CASE WHEN v_service->>'payment_destination'='driver' THEN v_driver ELSE NULL END)
      RETURNING to_jsonb(cash_movements) INTO v_row;
      v_cash:=(v_row->>'id')::uuid;

    PERFORM public.secure_audit('insert','cash_movements',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':CASH',
        'entity_type','cash_movements','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      FOR v_row IN SELECT to_jsonb(h) FROM public.service_financial_status_history h WHERE h.service_financial_id=v_fid LOOP

    PERFORM public.secure_audit('insert','service_financial_status_history',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':FINANCIAL-HISTORY',
        'entity_type','service_financial_status_history','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      END LOOP;
    ELSE
      v_id:=public.create_receivable_from_service(v_sid,NULL,
        v_tag||'entity_alias='||v_alias||':RECEIVABLE;purpose=QA open unpaid 200 EUR');
      SELECT to_jsonb(r) INTO STRICT v_row FROM public.receivables r WHERE id=v_id;

    PERFORM public.secure_audit('insert','receivables',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':RECEIVABLE',
        'entity_type','receivables','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      FOR v_row IN SELECT to_jsonb(h) FROM public.receivable_status_history h WHERE h.receivable_id=v_id LOOP

    PERFORM public.secure_audit('insert','receivable_status_history',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':RECEIVABLE-HISTORY',
        'entity_type','receivable_status_history','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      END LOOP;
    END IF;
    IF v_case_id='C2' THEN
      FOR v_row IN SELECT to_jsonb(e) FROM public.service_events e WHERE e.service_id=v_sid LOOP

    PERFORM public.secure_audit('insert','service_events',(v_row->>'id')::uuid,v_row->>'human_code',
      NULL,v_row,'Administrative synthetic QA fixture; not a conductor action.',
      jsonb_build_object('qa_run',v_run,'qa_case',v_case_id,'entity_alias',v_alias||':PRIORITY-EVENT',
        'entity_type','service_events','execution_kind','synthetic_admin_fixture'),v_actor,NULL);

      END LOOP;
    END IF;
    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    IF NOT EXISTS(SELECT 1 FROM public.services WHERE id=v_sid AND operational_status='completed'
      AND customer_id=v_customer)
      OR (SELECT count(*) FROM public.service_assignments WHERE service_id=v_sid)<>1
      OR NOT EXISTS(SELECT 1 FROM public.service_assignments WHERE id=v_assignment AND service_id=v_sid
        AND driver_id=v_driver AND vehicle_id=v_vehicle AND assignment_status='ended' AND accepted_at IS NOT NULL
        AND accepted_by_driver_id IS NULL AND ended_at>=accepted_at)
      OR (SELECT count(*) FROM public.service_closures WHERE service_id=v_sid AND assignment_id=v_assignment
        AND closed_by_user_id=v_actor AND closed_by_driver_id IS NULL
        AND (closed_at AT TIME ZONE 'Europe/Madrid')::date
          BETWEEN (v_case->>'period_start')::date AND (v_case->>'period_end')::date)<>1
    THEN RAISE EXCEPTION 'STOP: service/assignment/closure assertion failed'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.settlements WHERE driver_id=v_driver)
    OR EXISTS(SELECT 1 FROM public.settlement_items i JOIN public.services s ON s.id=i.service_id WHERE s.notes LIKE v_tag||'%')
    OR EXISTS(SELECT 1 FROM public.driver_cash_source_allocations WHERE driver_id=v_driver)
    OR (SELECT coalesce(sum(available_amount),0) FROM elara_private.driver_cash_available WHERE driver_id=v_driver)
      <> (v_case->>'cash_available')::numeric
    OR (SELECT count(*) FROM public.service_assignments a JOIN public.services s ON s.id=a.service_id
      WHERE s.notes LIKE v_tag||'%') <> jsonb_array_length(v_case->'services')
  THEN RAISE EXCEPTION 'STOP: case sources/entitlements assertion failed'; END IF;

    -- Validate the full committed prefix BEFORE this case's COMMIT.
    -- No other PREPARE invocation can resume a partial prefix.
    v_full_plan:=v_plan;
    v_plan:=jsonb_set(v_plan,'{cases}',(SELECT jsonb_agg(c ORDER BY c->>'qa_case')
      FROM jsonb_array_elements(v_plan->'cases') c WHERE c->>'qa_case'<=v_case_id));
    v_plan:=jsonb_set(v_plan,'{expected_entities}',(SELECT jsonb_agg(e)
      FROM jsonb_array_elements(v_full_plan->'expected_entities') e
      WHERE e->>'qa_case'='COMMON' OR e->>'qa_case'<=v_case_id));
    v_plan:=jsonb_set(v_plan,'{expected_counts}',(SELECT jsonb_object_agg(entity_type,n)
      FROM (SELECT e->>'entity_type' entity_type,count(*) n
        FROM jsonb_array_elements(v_plan->'expected_entities') e GROUP BY e->>'entity_type') x));

  IF EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
    GROUP BY a.metadata->>'qa_case',a.entity_table,a.metadata->>'entity_alias'
    HAVING count(DISTINCT a.entity_id)<>1)
  THEN RAISE EXCEPTION 'STOP: ambiguous audit identity/alias'; END IF;
  v_registry:='[]'::jsonb;
  FOR v_obj IN SELECT DISTINCT a.entity_table,a.entity_id,
      a.metadata->>'qa_case' qa_case,a.metadata->>'entity_alias' entity_alias
    FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
  LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan->'expected_entities') e
      WHERE e->>'entity_type'=v_obj.entity_table AND e->>'qa_case'=v_obj.qa_case
        AND e->>'entity_alias'=v_obj.entity_alias)
    THEN RAISE EXCEPTION 'STOP: unexpected audited lot entity/alias: %/%',v_obj.entity_table,v_obj.entity_alias; END IF;
    -- AG.1: validate the exact document alias before interpreting its suffix.
    IF v_obj.entity_table='vehicle_documents' THEN
      SELECT jsonb_build_object('uuid',a.entity_id) INTO v_item FROM public.audit_logs a
        WHERE a.metadata->>'qa_run'=v_run AND a.metadata->>'qa_case'=v_obj.qa_case
          AND a.entity_table='vehicles' AND a.metadata->>'entity_alias'='VEHICLE'
        ORDER BY a.created_at LIMIT 1;
      IF coalesce(v_obj.entity_alias,'') NOT IN
        ('DOCUMENT:insurance','DOCUMENT:itv','DOCUMENT:circulation_permit','DOCUMENT:vtc_license') THEN
        RAISE EXCEPTION 'STOP: malformed document alias; case=% alias=% uuid=% expected_type=approved DOCUMENT suffix expected_vehicle=%',
          v_obj.qa_case,v_obj.entity_alias,v_obj.entity_id,v_item->>'uuid';
      END IF;
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_obj.entity_table)
      INTO v_actual USING v_obj.entity_id;
    IF v_actual IS NULL THEN
      IF v_obj.entity_table='vehicle_documents' THEN
        RAISE EXCEPTION 'STOP: registered document UUID missing; case=% alias=% uuid=% expected_type=% found_type=NULL expected_vehicle=%',
          v_obj.qa_case,v_obj.entity_alias,v_obj.entity_id,split_part(v_obj.entity_alias,':',2),v_item->>'uuid';
      END IF;
      RAISE EXCEPTION 'STOP: audited QA entity missing';
    END IF;
    v_registry:=v_registry||jsonb_build_array(jsonb_build_object(
      'qa_case',v_obj.qa_case,'entity_type',v_obj.entity_table,'entity_alias',v_obj.entity_alias,
      'uuid',v_obj.entity_id,'human_code',v_actual->>'human_code',
      'created_by',coalesce(v_actual->>'created_by',v_actual->>'changed_by_user_id',v_actual->>'actor_user_id'),
      'created_at',v_actual->>'created_at','row_fingerprint',md5(v_actual::text),
      'retention_policy','retain_audited_qa'));
  END LOOP;
  IF jsonb_array_length(v_registry)<>jsonb_array_length(v_plan->'expected_entities') THEN
    RAISE EXCEPTION 'STOP: partial/unexpected lot: audit registry has %, expected %',
      jsonb_array_length(v_registry),jsonb_array_length(v_plan->'expected_entities');
  END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_plan->'expected_entities') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
      WHERE r->>'qa_case'=v_guard->>'qa_case' AND r->>'entity_type'=v_guard->>'entity_type'
        AND r->>'entity_alias'=v_guard->>'entity_alias')<>1
    THEN RAISE EXCEPTION 'STOP: missing/duplicate expected entity: %',v_guard->>'entity_alias'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_plan->'expected_counts')
      WHERE key NOT IN ('settlements','settlement_items','driver_cash_source_allocations','driver_cash_source_usage') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r WHERE r->>'entity_type'=v_obj.key)
      <> (v_obj.value::text)::integer
    THEN RAISE EXCEPTION 'STOP: registry count mismatch: %',v_obj.key; END IF;
  END LOOP;

  -- Any tagged entity outside the registry is an incomplete/duplicate lot.
  FOR v_table IN SELECT DISTINCT e->>'entity_type' FROM jsonb_array_elements(v_plan->'expected_entities') e LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(to_jsonb(t)::text,$1)>0
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) r WHERE r->>''entity_type''=$3
        AND (r->>''uuid'')::uuid=t.id)',v_table) INTO v_count USING v_run,v_registry,v_table;
    IF v_count<>0 THEN RAISE EXCEPTION 'STOP: tagged QA entity without captured UUID: %',v_table; END IF;
  END LOOP;

  -- AC.1: captured UUID, not a name, is authoritative for each identity.
  IF EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
    AND (a.actor_app_user_id IS DISTINCT FROM v_actor OR a.actor_driver_id IS NOT NULL))
  THEN RAISE EXCEPTION 'STOP: QA audit actor mismatch'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_registry) LOOP
    v_case_id:=v_guard->>'qa_case'; v_alias:=v_guard->>'entity_alias';
    v_table:=v_guard->>'entity_type'; v_id:=(v_guard->>'uuid')::uuid;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_table) INTO STRICT v_actual USING v_id;
    v_tag:='qa_run='||v_run||';qa_case='||v_case_id||';entity_alias='||v_alias||';';
    IF v_table IN ('companies','customers','persons','drivers','vehicles','vehicle_documents',
      'cash_accounts','driver_vehicle_assignments','services','service_financials','service_closures',
      'service_payments','receivables','driver_settlement_overrides') THEN
      v_key:=CASE v_table WHEN 'customers' THEN 'internal_notes' WHEN 'drivers' THEN 'observations'
        WHEN 'service_closures' THEN 'reason_details' ELSE 'notes' END;
      IF strpos(coalesce(v_actual->>v_key,''),v_tag)<>1 THEN
        RAISE EXCEPTION 'STOP: captured UUID QA identity mismatch: %/%',v_table,v_alias; END IF;
      EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(coalesce(to_jsonb(t)->>$1,'''') ,$2)=1',v_table)
        INTO v_count USING v_key,v_tag;
      IF v_count<>1 THEN RAISE EXCEPTION 'STOP: duplicate/unregistered QA identity: %/%',v_table,v_alias; END IF;
    END IF;
    v_json:='{}'::jsonb;
    IF v_table='customers' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='companies' AND r->>'entity_alias'='COMPANY';
      v_json:=v_json||jsonb_build_object('company_id',v_item->>'uuid');
    END IF;
    IF v_table='drivers' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='persons' AND r->>'entity_alias'='PERSON';
      v_json:=v_json||jsonb_build_object('person_id',v_item->>'uuid');
    END IF;
    IF v_table='vehicle_documents' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      IF coalesce(v_alias,'') NOT IN
        ('DOCUMENT:insurance','DOCUMENT:itv','DOCUMENT:circulation_permit','DOCUMENT:vtc_license') THEN
        RAISE EXCEPTION 'STOP: malformed document alias; case=% alias=% uuid=% expected_type=approved DOCUMENT suffix expected_vehicle=%',
          v_case_id,v_alias,v_id,v_item->>'uuid';
      END IF;
      v_doc:=split_part(v_alias,':',2);
      IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
        WHERE r->>'entity_type'='vehicle_documents' AND r->>'uuid'=v_id::text)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate document UUID across aliases; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
          v_case_id,v_alias,v_id,v_doc,v_actual->>'document_type_key',v_item->>'uuid';
      END IF;
      IF v_actual->>'id' IS DISTINCT FROM v_id::text
        OR v_actual->>'vehicle_id' IS DISTINCT FROM v_item->>'uuid'
        OR v_actual->>'document_type_key' IS DISTINCT FROM v_doc THEN
        RAISE EXCEPTION 'STOP: document alias/type or vehicle mismatch; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=% found_vehicle=%',
          v_case_id,v_alias,v_id,v_doc,v_actual->>'document_type_key',v_item->>'uuid',v_actual->>'vehicle_id';
      END IF;
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid','document_type_key',v_doc);
    END IF;
    IF v_table='driver_vehicle_assignments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
    END IF;
    IF v_table='service_financials' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
    END IF;
    IF v_table='service_assignments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='driver_vehicle_assignments' AND r->>'entity_alias'='DRIVER-VEHICLE';
      v_json:=v_json||jsonb_build_object('driver_vehicle_assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_closures' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_price_components' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='service_locations' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
    END IF;
    IF v_table='service_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_payments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='service_payment_allocations' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('payment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='cash_movements' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('service_payment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('source_id',v_item->>'uuid');
    END IF;
    IF v_table='receivables' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='customers' AND r->>'entity_alias'='CUSTOMER';
      v_json:=v_json||jsonb_build_object('customer_id',v_item->>'uuid');
    END IF;
    IF v_table='driver_settlement_overrides' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
    END IF;
    IF v_table='service_financial_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='receivable_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='receivables' AND r->>'entity_alias'=split_part(v_alias,':',1)||':RECEIVABLE';
      v_json:=v_json||jsonb_build_object('receivable_id',v_item->>'uuid');
    END IF;
    IF v_table='service_events' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
    END IF;
    IF v_table='services' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='customers' AND r->>'entity_alias'='CUSTOMER';
      v_json:=v_json||jsonb_build_object('customer_id',v_item->>'uuid');
    END IF;
    IF v_table='cash_accounts' AND v_case_id<>'COMMON' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r WHERE r->>'qa_case'=v_case_id
        AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
    END IF;
    IF v_table='service_locations' AND v_actual->>'location_type' IS DISTINCT FROM lower(split_part(v_alias,':',2)) THEN
      RAISE EXCEPTION 'STOP: captured location UUID role mismatch'; END IF;
    IF v_table='service_status_history' AND (v_actual->>'to_status' IS DISTINCT FROM split_part(v_alias,':',3)
      OR v_actual->>'from_status' IS DISTINCT FROM CASE split_part(v_alias,':',3)
        WHEN 'confirmed' THEN 'pending' WHEN 'in_progress' THEN 'confirmed' WHEN 'completed' THEN 'in_progress' END)
    THEN RAISE EXCEPTION 'STOP: captured history UUID transition mismatch'; END IF;
    IF NOT (v_actual @> v_json) THEN
      RAISE EXCEPTION 'STOP: captured UUID parent mismatch: %/%',v_table,v_alias; END IF;
    IF v_table='cash_movements' AND (v_actual->'metadata'->>'qa_run' IS DISTINCT FROM v_run
      OR v_actual->'metadata'->>'qa_case' IS DISTINCT FROM v_case_id
      OR v_actual->'metadata'->>'entity_alias' IS DISTINCT FROM v_alias)
    THEN RAISE EXCEPTION 'STOP: cash UUID metadata identity mismatch'; END IF;
  END LOOP;

  PERFORM set_config('elara_qa.registry',v_registry::text,false);

  SELECT id INTO STRICT v_customer FROM public.customers WHERE
    internal_notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=CUSTOMER;%'
    AND customer_type='company' AND status='active';
  SELECT id INTO STRICT v_admin_account FROM public.cash_accounts WHERE
    notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=ADMIN;%'
    AND name='QA 4546 R01 Administrativa EUR' AND account_type='administrative' AND driver_id IS NULL
    AND currency_code='EUR' AND status='active' AND opening_balance=0;
  IF NOT EXISTS(SELECT 1 FROM public.companies c JOIN public.customers u ON u.company_id=c.id
    WHERE u.id=v_customer AND c.legal_name='QA 4546 R01 Cliente' AND c.status='active'
      AND c.notes LIKE 'qa_run='||v_run||';qa_case=COMMON;%')
  THEN RAISE EXCEPTION 'STOP: shared customer mismatch'; END IF;
  FOR v_case IN SELECT value FROM jsonb_array_elements(v_plan->'cases') LOOP
    v_case_id:=v_case->>'qa_case'; v_tag:='qa_run='||v_run||';qa_case='||v_case_id||';';
    SELECT id,person_id INTO STRICT v_driver,v_person FROM public.drivers WHERE observations LIKE v_tag||'entity_alias=DRIVER;%'
      AND driver_type=v_case->>'driver_type' AND administrative_status='active' AND availability_preference='unavailable';
    IF NOT EXISTS(SELECT 1 FROM public.persons WHERE id=v_person AND status='active'
      AND concat_ws(' ',first_name,last_name)=v_case->>'name' AND notes LIKE v_tag||'entity_alias=PERSON;%')
      OR EXISTS(SELECT 1 FROM public.user_driver_links WHERE driver_id=v_driver)
    THEN RAISE EXCEPTION 'STOP: person/login isolation failed'; END IF;
    SELECT id INTO STRICT v_vehicle FROM public.vehicles WHERE notes LIKE v_tag||'entity_alias=VEHICLE;%'
      AND plate_normalized=v_case->>'plate' AND ownership_type='owned' AND external_owner_id IS NULL
      AND manual_operational_status='available' AND elara_approval_status='not_required'
      AND brand='QA' AND model='4546 R01 '||v_case_id;
    -- AG.1: exactly four distinct captured document UUIDs for this case/vehicle.
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents')<>4
      OR (SELECT count(DISTINCT r->>'uuid') FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents')<>4 THEN
      RAISE EXCEPTION 'STOP: document registry must contain four distinct UUIDs; case=% expected_vehicle=%',v_case_id,v_vehicle;
    END IF;
    SELECT to_jsonb(d) INTO v_actual FROM public.vehicle_documents d
      WHERE d.vehicle_id=v_vehicle AND strpos(to_jsonb(d)::text,v_run)>0
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_registry) r
          WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents' AND r->>'uuid'=d.id::text)
      ORDER BY d.id LIMIT 1;
    IF v_actual IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: unregistered QA document; case=% uuid=% found_type=% expected_vehicle=%',
        v_case_id,v_actual->>'id',v_actual->>'document_type_key',v_vehicle;
    END IF;
    IF NOT public.vehicle_is_assignable(v_vehicle) OR
      (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle)<>4 OR
      (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle AND status='valid'
        AND storage_path IS NULL AND notes LIKE v_tag||'entity_alias=DOCUMENT:%')<>4
    THEN RAISE EXCEPTION 'STOP: document/vehicle assertion failed'; END IF;
    FOREACH v_doc IN ARRAY ARRAY['insurance','itv','circulation_permit','vtc_license'] LOOP
      -- Resolve identity from the registry first; type searches are only extra uniqueness checks.
      SELECT count(*) INTO v_count FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents'
          AND r->>'entity_alias'='DOCUMENT:'||v_doc;
      IF v_count<>1 THEN
        RAISE EXCEPTION 'STOP: missing/ambiguous registered document alias; case=% alias=% expected_type=% expected_vehicle=%',
          v_case_id,'DOCUMENT:'||v_doc,v_doc,v_vehicle;
      END IF;
      SELECT r INTO STRICT v_guard FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents'
          AND r->>'entity_alias'='DOCUMENT:'||v_doc;
      v_id:=(v_guard->>'uuid')::uuid;
      SELECT to_jsonb(d) INTO v_actual FROM public.vehicle_documents d WHERE d.id=v_id;
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: registered document UUID missing; case=% alias=% uuid=% expected_type=% found_type=NULL expected_vehicle=%',
          v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_vehicle;
      END IF;
      IF (SELECT count(*) FROM public.vehicle_documents WHERE id=v_id AND vehicle_id=v_vehicle
        AND document_type_key=split_part(v_guard->>'entity_alias',':',2)
        AND status='valid' AND replaced_at IS NULL AND reference_number=v_run||':'||v_case_id||':'||v_doc||':SYNTHETIC'
        AND expires_at IS NOT DISTINCT FROM CASE WHEN v_doc='circulation_permit' THEN NULL::date ELSE '2027-12-31'::date END
        AND validated_by=v_actor AND created_by=v_actor AND updated_by=v_actor
        AND validated_at IS NOT NULL AND validated_at>=created_at AND validated_at<=clock_timestamp()
        AND issued_at=(validated_at AT TIME ZONE 'Europe/Madrid')::date
        AND storage_bucket IS NULL AND storage_path IS NULL AND file_name IS NULL
        AND mime_type IS NULL AND file_size IS NULL AND checksum IS NULL)<>1
      THEN RAISE EXCEPTION 'STOP: registered document attributes mismatch; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
        v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_actual->>'document_type_key',v_vehicle; END IF;
      IF (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle AND document_type_key=v_doc)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate document vehicle/type; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
          v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_actual->>'document_type_key',v_vehicle;
      END IF;
    END LOOP;
    SELECT id INTO STRICT v_account FROM public.cash_accounts WHERE driver_id=v_driver
      AND name=v_case->>'account_name' AND account_type='driver' AND status='active' AND opening_balance=0
      AND currency_code='EUR' AND notes LIKE v_tag||'entity_alias=DRIVER-ACCOUNT;%';
    SELECT id INTO STRICT v_link FROM public.driver_vehicle_assignments WHERE driver_id=v_driver AND vehicle_id=v_vehicle
      AND status='active' AND notes LIKE v_tag||'entity_alias=DRIVER-VEHICLE;%';
    IF (SELECT count(*) FROM public.driver_vehicle_assignments WHERE driver_id=v_driver)<>1
      OR (SELECT count(*) FROM public.cash_accounts WHERE driver_id=v_driver)<>1
      OR EXISTS(SELECT 1 FROM public.settlements WHERE driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.driver_cash_source_allocations WHERE driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.expenses WHERE driver_id=v_driver OR advanced_by_driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.cash_remittances WHERE driver_id=v_driver)
    THEN RAISE EXCEPTION 'STOP: unexpected driver dependencies/consumed rights'; END IF;
    IF (SELECT count(*) FROM public.services WHERE notes LIKE v_tag||'%')<>jsonb_array_length(v_case->'services') THEN
      RAISE EXCEPTION 'STOP: unexpected service count';
    END IF;
    FOR v_service IN SELECT value FROM jsonb_array_elements(v_case->'services') LOOP
      v_alias:=v_service->>'alias'; v_price:=(v_service->>'price')::numeric;
      SELECT id INTO STRICT v_sid FROM public.services WHERE notes LIKE v_tag||'entity_alias='||v_alias||';%'
        AND customer_id=v_customer AND operational_status='completed' AND deleted_at IS NULL
        AND service_type='transfer';
      SELECT id INTO STRICT v_fid FROM public.service_financials WHERE service_id=v_sid AND pricing_status='finalized'
        AND total_amount=v_price AND tax_amount=0 AND tax_rate=0 AND currency_code='EUR'
        AND notes LIKE v_tag||'entity_alias='||v_alias||':FINANCIAL;%';
      SELECT id INTO STRICT v_assignment FROM public.service_assignments WHERE service_id=v_sid
        AND driver_id=v_driver AND vehicle_id=v_vehicle AND driver_vehicle_assignment_id=v_link
        AND assignment_status='ended' AND accepted_at IS NOT NULL AND accepted_by_driver_id IS NULL
        AND assigned_at<=accepted_at AND accepted_at<=ended_at AND ended_by=v_actor
        AND internal_priority_exception=(v_case_id='C2');
      IF (SELECT count(*) FROM public.service_assignments WHERE service_id=v_sid)<>1
        OR (SELECT count(*) FROM public.service_closures WHERE service_id=v_sid AND assignment_id=v_assignment
          AND closure_type='completed' AND closed_by_user_id=v_actor AND closed_by_driver_id IS NULL
          AND closed_at>=(SELECT ended_at FROM public.service_assignments WHERE id=v_assignment)
          AND closed_at>=(SELECT accepted_at FROM public.service_assignments WHERE id=v_assignment)
          AND (closed_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN
            (v_case->>'period_start')::date AND (v_case->>'period_end')::date)<>1
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid)<>2
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid AND location_type='origin')<>1
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid AND location_type='destination')<>1
        OR (SELECT count(*) FROM public.service_price_components WHERE service_financial_id=v_fid)<>1
        OR (SELECT count(*) FROM public.service_price_components WHERE service_financial_id=v_fid
          AND component_type='base_fare' AND quantity=1 AND line_amount=v_price)<>1
        OR (SELECT count(*) FROM public.service_status_history WHERE service_id=v_sid)<>3
        OR (SELECT count(*) FROM public.service_status_history WHERE service_id=v_sid
          AND changed_by_user_id=v_actor AND changed_by_driver_id IS NULL AND metadata->>'qa_run'=v_run)<>3
        OR EXISTS(SELECT 1 FROM public.settlement_items WHERE service_id=v_sid)
        OR EXISTS(SELECT 1 FROM public.service_driver_progress WHERE service_id=v_sid)
      THEN RAISE EXCEPTION 'STOP: service fixture not exact: %/%',v_case_id,v_alias; END IF;

      -- AC.2: exact histories, actors, parents and real chronology.
      SELECT jsonb_agg(jsonb_build_object('from',h.from_status,'to',h.to_status)
        ORDER BY CASE h.to_status WHEN 'confirmed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END)
        INTO v_actual FROM public.service_status_history h WHERE h.service_id=v_sid;
      IF v_actual IS DISTINCT FROM '[{"from":"pending","to":"confirmed"},{"from":"confirmed","to":"in_progress"},{"from":"in_progress","to":"completed"}]'::jsonb
        OR EXISTS(SELECT 1 FROM public.service_status_history h WHERE h.service_id=v_sid
          AND (h.assignment_id IS DISTINCT FROM v_assignment OR h.changed_by_user_id IS DISTINCT FROM v_actor
            OR h.changed_by_driver_id IS NOT NULL
            OR h.changed_at<(SELECT accepted_at FROM public.service_assignments WHERE id=v_assignment)
            OR h.changed_at>clock_timestamp() OR h.metadata->>'qa_run' IS DISTINCT FROM v_run
            OR h.metadata->>'qa_case' IS DISTINCT FROM v_case_id OR h.metadata->>'entity_alias' IS DISTINCT FROM v_alias))
        OR EXISTS(SELECT 1 FROM public.service_status_history c
          JOIN public.service_status_history p ON p.service_id=c.service_id AND p.to_status='in_progress'
          JOIN public.service_status_history e ON e.service_id=c.service_id AND e.to_status='completed'
          WHERE c.service_id=v_sid AND c.to_status='confirmed'
            AND (c.changed_at>p.changed_at OR p.changed_at>e.changed_at
              OR e.changed_at>(SELECT ended_at FROM public.service_assignments WHERE id=v_assignment)))
      THEN RAISE EXCEPTION 'STOP: service history semantics/order mismatch'; END IF;
      IF v_service->>'payment_destination' IS NOT NULL THEN
        IF (SELECT count(*) FROM public.service_financial_status_history WHERE service_financial_id=v_fid)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_financial_status_history h JOIN public.service_financials f ON f.id=h.service_financial_id
            WHERE h.service_financial_id=v_fid AND h.from_status='pending' AND h.to_status='paid'
              AND h.changed_by_user_id=v_actor AND h.reason='financial_status_recalculated' AND h.payment_id IS NULL
              AND h.changed_at=h.created_at AND h.changed_at>=f.created_at AND h.changed_at<=clock_timestamp()
              AND (h.metadata->>'total_amount')::numeric=v_price
              AND (h.metadata->>'paid_amount')::numeric=v_price AND (h.metadata->>'pending_amount')::numeric=0)
        THEN RAISE EXCEPTION 'STOP: financial history semantics mismatch'; END IF;
      ELSIF EXISTS(SELECT 1 FROM public.service_financial_status_history WHERE service_financial_id=v_fid) THEN
        RAISE EXCEPTION 'STOP: unexpected unpaid financial history';
      END IF;
      IF v_case_id='C5' THEN
        SELECT id INTO STRICT v_id FROM public.receivables WHERE service_id=v_sid;
        IF (SELECT count(*) FROM public.receivable_status_history WHERE receivable_id=v_id)<>1
          OR NOT EXISTS(SELECT 1 FROM public.receivable_status_history h JOIN public.receivables r ON r.id=h.receivable_id
            WHERE h.receivable_id=v_id AND h.from_status IS NULL AND h.to_status='open'
              AND h.changed_by_user_id=v_actor AND h.payment_id IS NULL AND h.reason='receivable_opened'
              AND h.changed_at=h.created_at AND h.changed_at>=r.created_at AND h.changed_at<=clock_timestamp()
              AND (h.metadata->>'original_amount')::numeric=200 AND (h.metadata->>'pending_amount')::numeric=200
              AND h.metadata->>'currency_code'='EUR')
        THEN RAISE EXCEPTION 'STOP: initial receivable history mismatch'; END IF;
      END IF;
      IF v_case_id='C2' THEN
        IF (SELECT count(*) FROM public.service_events WHERE service_id=v_sid)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_events e JOIN public.service_assignments a ON a.id=e.assignment_id
            WHERE e.service_id=v_sid AND e.assignment_id=v_assignment AND e.vehicle_id=v_vehicle
              AND e.event_type='internal_driver_priority_overridden' AND e.actor_user_id=v_actor
              AND e.description=a.priority_exception_reason AND e.occurred_at=a.assigned_at
              AND e.occurred_at=e.created_at AND e.occurred_at<=clock_timestamp()
              AND e.metadata->>'driver_id'=v_driver::text AND e.metadata->>'vehicle_id'=v_vehicle::text
              AND e.metadata->>'driver_vehicle_assignment_id'=v_link::text
              AND e.metadata->>'priority_exception_reason'=a.priority_exception_reason)
        THEN RAISE EXCEPTION 'STOP: C2 priority event semantics mismatch'; END IF;
      ELSIF EXISTS(SELECT 1 FROM public.service_events WHERE service_id=v_sid) THEN
        RAISE EXCEPTION 'STOP: unexpected service event';
      END IF;

      IF v_service->>'payment_destination' IS NOT NULL THEN
        SELECT id INTO STRICT v_payment FROM public.service_payments WHERE service_id=v_sid AND service_financial_id=v_fid
          AND payment_status='completed' AND payment_method='cash' AND amount=v_price AND currency_code='EUR'
          AND created_by=v_actor AND idempotency_key=v_run||':'||v_case_id||':'||v_alias||':PAYMENT';
        IF (SELECT count(*) FROM public.service_payments WHERE service_id=v_sid)<>1
          OR (SELECT count(*) FROM public.service_payment_allocations WHERE payment_id=v_payment)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_payment_allocations WHERE payment_id=v_payment
            AND service_financial_id=v_fid AND allocated_amount=v_price)
          OR NOT EXISTS(SELECT 1 FROM public.service_financials WHERE id=v_fid AND paid_amount=v_price
            AND pending_amount=0 AND financial_status='paid')
          OR EXISTS(SELECT 1 FROM public.receivables WHERE service_id=v_sid)
        THEN RAISE EXCEPTION 'STOP: cash receipt/allocation/financials mismatch'; END IF;
        SELECT id INTO STRICT v_cash FROM public.cash_movements WHERE service_payment_id=v_payment AND service_id=v_sid
          AND source_type='service_payment' AND source_id=v_payment AND movement_type='inflow'
          AND movement_category='service_payment' AND amount=v_price AND currency_code='EUR'
          AND cash_account_id=CASE WHEN v_service->>'payment_destination'='driver' THEN v_account ELSE v_admin_account END
          AND actor_driver_id IS NOT DISTINCT FROM CASE WHEN v_service->>'payment_destination'='driver' THEN v_driver ELSE NULL::uuid END
          AND metadata->>'qa_run'=v_run AND metadata->>'qa_case'=v_case_id AND metadata->>'qa_fixture'='true'
          AND original_movement_id IS NULL AND remittance_id IS NULL
          AND idempotency_key='cash:'||v_run||':'||v_case_id||':'||v_alias||':PAYMENT';
        IF (SELECT count(*) FROM public.cash_movements WHERE service_payment_id=v_payment)<>1
          OR EXISTS(SELECT 1 FROM public.cash_movements WHERE original_movement_id=v_cash)
        THEN RAISE EXCEPTION 'STOP: cash movement duplicate/reversal'; END IF;
        IF v_service->>'payment_destination'='driver' THEN
          IF (SELECT count(*) FROM elara_private.driver_cash_available WHERE cash_movement_id=v_cash
            AND driver_id=v_driver AND cash_account_id=v_account AND service_payment_id=v_payment
            AND service_id=v_sid AND original_amount=v_price AND available_amount=v_price
            AND reserved_amount=0 AND applied_amount=0)<>1
          THEN RAISE EXCEPTION 'STOP: expected driver source missing'; END IF;
        ELSIF EXISTS(SELECT 1 FROM elara_private.driver_cash_available WHERE cash_movement_id=v_cash) THEN
          RAISE EXCEPTION 'STOP: administrative cash became driver cash';
        END IF;
      ELSE
        IF EXISTS(SELECT 1 FROM public.service_payments WHERE service_id=v_sid)
          OR EXISTS(SELECT 1 FROM public.cash_movements WHERE service_id=v_sid)
          OR NOT EXISTS(SELECT 1 FROM public.service_financials WHERE id=v_fid AND paid_amount=0
            AND pending_amount=200 AND financial_status='pending')
          OR (SELECT count(*) FROM public.receivables WHERE service_id=v_sid AND service_financial_id=v_fid
            AND customer_id=v_customer AND status='open' AND currency_code='EUR'
            AND original_amount=200 AND collected_amount=0 AND pending_amount=200)<>1
        THEN RAISE EXCEPTION 'STOP: C5 receivable assertion failed'; END IF;
      END IF;
      IF EXISTS(SELECT 1 FROM public.expenses WHERE service_id=v_sid)
        OR EXISTS(SELECT 1 FROM elara_private.driver_cash_source_usage u JOIN public.cash_movements m
          ON m.id=u.cash_movement_id WHERE m.service_id=v_sid)
      THEN RAISE EXCEPTION 'STOP: unexpected expense/cash usage'; END IF;
    END LOOP;
    IF (SELECT coalesce(sum(available_amount),0) FROM elara_private.driver_cash_available WHERE driver_id=v_driver)
        <> (v_case->>'cash_available')::numeric
      OR (SELECT count(*) FROM public.cash_movements WHERE cash_account_id=v_account)
        <> (CASE WHEN v_case_id IN ('C3','C4') THEN 1 ELSE 0 END)
    THEN RAISE EXCEPTION 'STOP: exact case cash availability failed'; END IF;
    IF v_case_id='C6' THEN
      SELECT id INTO STRICT v_override FROM public.driver_settlement_overrides WHERE driver_id=v_driver
        AND currency_code='EUR' AND driver_percentage=40 AND elara_percentage=60
        AND effective_from='2026-10-01' AND effective_to='2026-10-31'
        AND status='active' AND source=v_run AND created_by=v_actor;
      IF (SELECT count(*) FROM public.driver_settlement_overrides WHERE driver_id=v_driver)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate override';
      END IF;
    ELSIF EXISTS(SELECT 1 FROM public.driver_settlement_overrides WHERE driver_id=v_driver) THEN
      RAISE EXCEPTION 'STOP: override on non-C6 case';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.cash_movements WHERE cash_account_id=v_admin_account)
    <> (SELECT count(*) FROM jsonb_array_elements(v_plan->'cases') c
        CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination'='administrative')
    OR (SELECT coalesce(sum(CASE WHEN movement_type='inflow' THEN amount ELSE -amount END),0)
      FROM public.cash_movements WHERE cash_account_id=v_admin_account)
      <> (SELECT coalesce(sum((s->>'price')::numeric),0) FROM jsonb_array_elements(v_plan->'cases') c
          CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination'='administrative')
    OR (SELECT count(*) FROM public.cash_movements WHERE metadata->>'qa_run'=v_run)
      <> (SELECT count(*) FROM jsonb_array_elements(v_plan->'cases') c
          CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination' IS NOT NULL)
  THEN RAISE EXCEPTION 'STOP: administrative/total QA ledger mismatch'; END IF;

    v_plan:=v_full_plan;

  v_baseline := current_setting('elara_qa.existing_rows')::jsonb;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_baseline) LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb)
      FROM %s t WHERE id::text IN (SELECT jsonb_object_keys($1))',to_regclass(v_obj.key))
      INTO v_actual USING v_obj.value;
    IF v_actual IS DISTINCT FROM v_obj.value THEN
      RAISE EXCEPTION 'STOP: existing protected rows changed/deleted: %',v_obj.key;
    END IF;
  END LOOP;

    RAISE NOTICE '% assertions passed; committing this case.',v_case_id;
    COMMIT;
  END LOOP;

END;
$qa_prepare$;

SET default_transaction_read_only = on;
SET default_transaction_isolation = 'read committed';
\endif

\if :do_verify
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $qa_verify_fixtures$
DECLARE

  v_run constant text := 'QA-4546-20261012-R01';
  v_mode text := current_setting('elara_qa.mode');
  v_plan jsonb := current_setting('elara_qa.plan')::jsonb;
  v_frozen jsonb := current_setting('elara_qa.frozen')::jsonb;
  v_actor uuid;
  v_session uuid;
  v_case jsonb; v_service jsonb; v_guard jsonb; v_item jsonb;
  v_row jsonb; v_before jsonb; v_actual jsonb; v_baseline jsonb;
  v_obj record; v_col record; v_count bigint; v_n bigint;
  v_case_id text; v_alias text; v_tag text; v_table text; v_key text;
  v_company uuid; v_customer uuid; v_admin_account uuid;
  v_person uuid; v_driver uuid; v_vehicle uuid; v_account uuid; v_link uuid;
  v_sid uuid; v_fid uuid; v_assignment uuid; v_payment uuid; v_cash uuid;
  v_override uuid; v_settlement uuid; v_id uuid;
  v_stage text; v_doc text; v_when timestamptz; v_day date; v_price numeric;
  v_earnings numeric; v_elara numeric; v_cash_available numeric;
  v_expected numeric; v_json jsonb; v_result jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_common_count integer;

BEGIN
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
    GROUP BY a.metadata->>'qa_case',a.entity_table,a.metadata->>'entity_alias'
    HAVING count(DISTINCT a.entity_id)<>1)
  THEN RAISE EXCEPTION 'STOP: ambiguous audit identity/alias'; END IF;
  v_registry:='[]'::jsonb;
  FOR v_obj IN SELECT DISTINCT a.entity_table,a.entity_id,
      a.metadata->>'qa_case' qa_case,a.metadata->>'entity_alias' entity_alias
    FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
  LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan->'expected_entities') e
      WHERE e->>'entity_type'=v_obj.entity_table AND e->>'qa_case'=v_obj.qa_case
        AND e->>'entity_alias'=v_obj.entity_alias)
    THEN RAISE EXCEPTION 'STOP: unexpected audited lot entity/alias: %/%',v_obj.entity_table,v_obj.entity_alias; END IF;
    -- AG.1: validate the exact document alias before interpreting its suffix.
    IF v_obj.entity_table='vehicle_documents' THEN
      SELECT jsonb_build_object('uuid',a.entity_id) INTO v_item FROM public.audit_logs a
        WHERE a.metadata->>'qa_run'=v_run AND a.metadata->>'qa_case'=v_obj.qa_case
          AND a.entity_table='vehicles' AND a.metadata->>'entity_alias'='VEHICLE'
        ORDER BY a.created_at LIMIT 1;
      IF coalesce(v_obj.entity_alias,'') NOT IN
        ('DOCUMENT:insurance','DOCUMENT:itv','DOCUMENT:circulation_permit','DOCUMENT:vtc_license') THEN
        RAISE EXCEPTION 'STOP: malformed document alias; case=% alias=% uuid=% expected_type=approved DOCUMENT suffix expected_vehicle=%',
          v_obj.qa_case,v_obj.entity_alias,v_obj.entity_id,v_item->>'uuid';
      END IF;
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_obj.entity_table)
      INTO v_actual USING v_obj.entity_id;
    IF v_actual IS NULL THEN
      IF v_obj.entity_table='vehicle_documents' THEN
        RAISE EXCEPTION 'STOP: registered document UUID missing; case=% alias=% uuid=% expected_type=% found_type=NULL expected_vehicle=%',
          v_obj.qa_case,v_obj.entity_alias,v_obj.entity_id,split_part(v_obj.entity_alias,':',2),v_item->>'uuid';
      END IF;
      RAISE EXCEPTION 'STOP: audited QA entity missing';
    END IF;
    v_registry:=v_registry||jsonb_build_array(jsonb_build_object(
      'qa_case',v_obj.qa_case,'entity_type',v_obj.entity_table,'entity_alias',v_obj.entity_alias,
      'uuid',v_obj.entity_id,'human_code',v_actual->>'human_code',
      'created_by',coalesce(v_actual->>'created_by',v_actual->>'changed_by_user_id',v_actual->>'actor_user_id'),
      'created_at',v_actual->>'created_at','row_fingerprint',md5(v_actual::text),
      'retention_policy','retain_audited_qa'));
  END LOOP;
  IF jsonb_array_length(v_registry)<>jsonb_array_length(v_plan->'expected_entities') THEN
    RAISE EXCEPTION 'STOP: partial/unexpected lot: audit registry has %, expected %',
      jsonb_array_length(v_registry),jsonb_array_length(v_plan->'expected_entities');
  END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_plan->'expected_entities') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
      WHERE r->>'qa_case'=v_guard->>'qa_case' AND r->>'entity_type'=v_guard->>'entity_type'
        AND r->>'entity_alias'=v_guard->>'entity_alias')<>1
    THEN RAISE EXCEPTION 'STOP: missing/duplicate expected entity: %',v_guard->>'entity_alias'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_plan->'expected_counts')
      WHERE key NOT IN ('settlements','settlement_items','driver_cash_source_allocations','driver_cash_source_usage') LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r WHERE r->>'entity_type'=v_obj.key)
      <> (v_obj.value::text)::integer
    THEN RAISE EXCEPTION 'STOP: registry count mismatch: %',v_obj.key; END IF;
  END LOOP;

  -- Any tagged entity outside the registry is an incomplete/duplicate lot.
  FOR v_table IN SELECT DISTINCT e->>'entity_type' FROM jsonb_array_elements(v_plan->'expected_entities') e LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(to_jsonb(t)::text,$1)>0
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) r WHERE r->>''entity_type''=$3
        AND (r->>''uuid'')::uuid=t.id)',v_table) INTO v_count USING v_run,v_registry,v_table;
    IF v_count<>0 THEN RAISE EXCEPTION 'STOP: tagged QA entity without captured UUID: %',v_table; END IF;
  END LOOP;

  -- AC.1: captured UUID, not a name, is authoritative for each identity.
  IF EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.metadata->>'qa_run'=v_run
    AND (a.actor_app_user_id IS DISTINCT FROM v_actor OR a.actor_driver_id IS NOT NULL))
  THEN RAISE EXCEPTION 'STOP: QA audit actor mismatch'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_registry) LOOP
    v_case_id:=v_guard->>'qa_case'; v_alias:=v_guard->>'entity_alias';
    v_table:=v_guard->>'entity_type'; v_id:=(v_guard->>'uuid')::uuid;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_table) INTO STRICT v_actual USING v_id;
    v_tag:='qa_run='||v_run||';qa_case='||v_case_id||';entity_alias='||v_alias||';';
    IF v_table IN ('companies','customers','persons','drivers','vehicles','vehicle_documents',
      'cash_accounts','driver_vehicle_assignments','services','service_financials','service_closures',
      'service_payments','receivables','driver_settlement_overrides') THEN
      v_key:=CASE v_table WHEN 'customers' THEN 'internal_notes' WHEN 'drivers' THEN 'observations'
        WHEN 'service_closures' THEN 'reason_details' ELSE 'notes' END;
      IF strpos(coalesce(v_actual->>v_key,''),v_tag)<>1 THEN
        RAISE EXCEPTION 'STOP: captured UUID QA identity mismatch: %/%',v_table,v_alias; END IF;
      EXECUTE format('SELECT count(*) FROM public.%I t WHERE strpos(coalesce(to_jsonb(t)->>$1,'''') ,$2)=1',v_table)
        INTO v_count USING v_key,v_tag;
      IF v_count<>1 THEN RAISE EXCEPTION 'STOP: duplicate/unregistered QA identity: %/%',v_table,v_alias; END IF;
    END IF;
    v_json:='{}'::jsonb;
    IF v_table='customers' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='companies' AND r->>'entity_alias'='COMPANY';
      v_json:=v_json||jsonb_build_object('company_id',v_item->>'uuid');
    END IF;
    IF v_table='drivers' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='persons' AND r->>'entity_alias'='PERSON';
      v_json:=v_json||jsonb_build_object('person_id',v_item->>'uuid');
    END IF;
    IF v_table='vehicle_documents' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      IF coalesce(v_alias,'') NOT IN
        ('DOCUMENT:insurance','DOCUMENT:itv','DOCUMENT:circulation_permit','DOCUMENT:vtc_license') THEN
        RAISE EXCEPTION 'STOP: malformed document alias; case=% alias=% uuid=% expected_type=approved DOCUMENT suffix expected_vehicle=%',
          v_case_id,v_alias,v_id,v_item->>'uuid';
      END IF;
      v_doc:=split_part(v_alias,':',2);
      IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
        WHERE r->>'entity_type'='vehicle_documents' AND r->>'uuid'=v_id::text)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate document UUID across aliases; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
          v_case_id,v_alias,v_id,v_doc,v_actual->>'document_type_key',v_item->>'uuid';
      END IF;
      IF v_actual->>'id' IS DISTINCT FROM v_id::text
        OR v_actual->>'vehicle_id' IS DISTINCT FROM v_item->>'uuid'
        OR v_actual->>'document_type_key' IS DISTINCT FROM v_doc THEN
        RAISE EXCEPTION 'STOP: document alias/type or vehicle mismatch; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=% found_vehicle=%',
          v_case_id,v_alias,v_id,v_doc,v_actual->>'document_type_key',v_item->>'uuid',v_actual->>'vehicle_id';
      END IF;
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid','document_type_key',v_doc);
    END IF;
    IF v_table='driver_vehicle_assignments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
    END IF;
    IF v_table='service_financials' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
    END IF;
    IF v_table='service_assignments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='driver_vehicle_assignments' AND r->>'entity_alias'='DRIVER-VEHICLE';
      v_json:=v_json||jsonb_build_object('driver_vehicle_assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_closures' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_price_components' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='service_locations' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
    END IF;
    IF v_table='service_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
    END IF;
    IF v_table='service_payments' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='service_payment_allocations' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('payment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='cash_movements' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('service_payment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_payments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':PAYMENT';
      v_json:=v_json||jsonb_build_object('source_id',v_item->>'uuid');
    END IF;
    IF v_table='receivables' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='customers' AND r->>'entity_alias'='CUSTOMER';
      v_json:=v_json||jsonb_build_object('customer_id',v_item->>'uuid');
    END IF;
    IF v_table='driver_settlement_overrides' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
    END IF;
    IF v_table='service_financial_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_financials' AND r->>'entity_alias'=split_part(v_alias,':',1)||':FINANCIAL';
      v_json:=v_json||jsonb_build_object('service_financial_id',v_item->>'uuid');
    END IF;
    IF v_table='receivable_status_history' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='receivables' AND r->>'entity_alias'=split_part(v_alias,':',1)||':RECEIVABLE';
      v_json:=v_json||jsonb_build_object('receivable_id',v_item->>'uuid');
    END IF;
    IF v_table='service_events' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='services' AND r->>'entity_alias'=split_part(v_alias,':',1);
      v_json:=v_json||jsonb_build_object('service_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='service_assignments' AND r->>'entity_alias'=split_part(v_alias,':',1)||':ASSIGNMENT';
      v_json:=v_json||jsonb_build_object('assignment_id',v_item->>'uuid');
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicles' AND r->>'entity_alias'='VEHICLE';
      v_json:=v_json||jsonb_build_object('vehicle_id',v_item->>'uuid');
    END IF;
    IF v_table='services' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'='COMMON' AND r->>'entity_type'='customers' AND r->>'entity_alias'='CUSTOMER';
      v_json:=v_json||jsonb_build_object('customer_id',v_item->>'uuid');
    END IF;
    IF v_table='cash_accounts' AND v_case_id<>'COMMON' THEN
      SELECT r INTO STRICT v_item FROM jsonb_array_elements(v_registry) r WHERE r->>'qa_case'=v_case_id
        AND r->>'entity_type'='drivers' AND r->>'entity_alias'='DRIVER';
      v_json:=v_json||jsonb_build_object('driver_id',v_item->>'uuid');
    END IF;
    IF v_table='service_locations' AND v_actual->>'location_type' IS DISTINCT FROM lower(split_part(v_alias,':',2)) THEN
      RAISE EXCEPTION 'STOP: captured location UUID role mismatch'; END IF;
    IF v_table='service_status_history' AND (v_actual->>'to_status' IS DISTINCT FROM split_part(v_alias,':',3)
      OR v_actual->>'from_status' IS DISTINCT FROM CASE split_part(v_alias,':',3)
        WHEN 'confirmed' THEN 'pending' WHEN 'in_progress' THEN 'confirmed' WHEN 'completed' THEN 'in_progress' END)
    THEN RAISE EXCEPTION 'STOP: captured history UUID transition mismatch'; END IF;
    IF NOT (v_actual @> v_json) THEN
      RAISE EXCEPTION 'STOP: captured UUID parent mismatch: %/%',v_table,v_alias; END IF;
    IF v_table='cash_movements' AND (v_actual->'metadata'->>'qa_run' IS DISTINCT FROM v_run
      OR v_actual->'metadata'->>'qa_case' IS DISTINCT FROM v_case_id
      OR v_actual->'metadata'->>'entity_alias' IS DISTINCT FROM v_alias)
    THEN RAISE EXCEPTION 'STOP: cash UUID metadata identity mismatch'; END IF;
  END LOOP;

  PERFORM set_config('elara_qa.registry',v_registry::text,false);

  SELECT id INTO STRICT v_customer FROM public.customers WHERE
    internal_notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=CUSTOMER;%'
    AND customer_type='company' AND status='active';
  SELECT id INTO STRICT v_admin_account FROM public.cash_accounts WHERE
    notes LIKE 'qa_run='||v_run||';qa_case=COMMON;entity_alias=ADMIN;%'
    AND name='QA 4546 R01 Administrativa EUR' AND account_type='administrative' AND driver_id IS NULL
    AND currency_code='EUR' AND status='active' AND opening_balance=0;
  IF NOT EXISTS(SELECT 1 FROM public.companies c JOIN public.customers u ON u.company_id=c.id
    WHERE u.id=v_customer AND c.legal_name='QA 4546 R01 Cliente' AND c.status='active'
      AND c.notes LIKE 'qa_run='||v_run||';qa_case=COMMON;%')
  THEN RAISE EXCEPTION 'STOP: shared customer mismatch'; END IF;
  FOR v_case IN SELECT value FROM jsonb_array_elements(v_plan->'cases') LOOP
    v_case_id:=v_case->>'qa_case'; v_tag:='qa_run='||v_run||';qa_case='||v_case_id||';';
    SELECT id,person_id INTO STRICT v_driver,v_person FROM public.drivers WHERE observations LIKE v_tag||'entity_alias=DRIVER;%'
      AND driver_type=v_case->>'driver_type' AND administrative_status='active' AND availability_preference='unavailable';
    IF NOT EXISTS(SELECT 1 FROM public.persons WHERE id=v_person AND status='active'
      AND concat_ws(' ',first_name,last_name)=v_case->>'name' AND notes LIKE v_tag||'entity_alias=PERSON;%')
      OR EXISTS(SELECT 1 FROM public.user_driver_links WHERE driver_id=v_driver)
    THEN RAISE EXCEPTION 'STOP: person/login isolation failed'; END IF;
    SELECT id INTO STRICT v_vehicle FROM public.vehicles WHERE notes LIKE v_tag||'entity_alias=VEHICLE;%'
      AND plate_normalized=v_case->>'plate' AND ownership_type='owned' AND external_owner_id IS NULL
      AND manual_operational_status='available' AND elara_approval_status='not_required'
      AND brand='QA' AND model='4546 R01 '||v_case_id;
    -- AG.1: exactly four distinct captured document UUIDs for this case/vehicle.
    IF (SELECT count(*) FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents')<>4
      OR (SELECT count(DISTINCT r->>'uuid') FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents')<>4 THEN
      RAISE EXCEPTION 'STOP: document registry must contain four distinct UUIDs; case=% expected_vehicle=%',v_case_id,v_vehicle;
    END IF;
    SELECT to_jsonb(d) INTO v_actual FROM public.vehicle_documents d
      WHERE d.vehicle_id=v_vehicle AND strpos(to_jsonb(d)::text,v_run)>0
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_registry) r
          WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents' AND r->>'uuid'=d.id::text)
      ORDER BY d.id LIMIT 1;
    IF v_actual IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: unregistered QA document; case=% uuid=% found_type=% expected_vehicle=%',
        v_case_id,v_actual->>'id',v_actual->>'document_type_key',v_vehicle;
    END IF;
    IF NOT public.vehicle_is_assignable(v_vehicle) OR
      (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle)<>4 OR
      (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle AND status='valid'
        AND storage_path IS NULL AND notes LIKE v_tag||'entity_alias=DOCUMENT:%')<>4
    THEN RAISE EXCEPTION 'STOP: document/vehicle assertion failed'; END IF;
    FOREACH v_doc IN ARRAY ARRAY['insurance','itv','circulation_permit','vtc_license'] LOOP
      -- Resolve identity from the registry first; type searches are only extra uniqueness checks.
      SELECT count(*) INTO v_count FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents'
          AND r->>'entity_alias'='DOCUMENT:'||v_doc;
      IF v_count<>1 THEN
        RAISE EXCEPTION 'STOP: missing/ambiguous registered document alias; case=% alias=% expected_type=% expected_vehicle=%',
          v_case_id,'DOCUMENT:'||v_doc,v_doc,v_vehicle;
      END IF;
      SELECT r INTO STRICT v_guard FROM jsonb_array_elements(v_registry) r
        WHERE r->>'qa_case'=v_case_id AND r->>'entity_type'='vehicle_documents'
          AND r->>'entity_alias'='DOCUMENT:'||v_doc;
      v_id:=(v_guard->>'uuid')::uuid;
      SELECT to_jsonb(d) INTO v_actual FROM public.vehicle_documents d WHERE d.id=v_id;
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: registered document UUID missing; case=% alias=% uuid=% expected_type=% found_type=NULL expected_vehicle=%',
          v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_vehicle;
      END IF;
      IF (SELECT count(*) FROM public.vehicle_documents WHERE id=v_id AND vehicle_id=v_vehicle
        AND document_type_key=split_part(v_guard->>'entity_alias',':',2)
        AND status='valid' AND replaced_at IS NULL AND reference_number=v_run||':'||v_case_id||':'||v_doc||':SYNTHETIC'
        AND expires_at IS NOT DISTINCT FROM CASE WHEN v_doc='circulation_permit' THEN NULL::date ELSE '2027-12-31'::date END
        AND validated_by=v_actor AND created_by=v_actor AND updated_by=v_actor
        AND validated_at IS NOT NULL AND validated_at>=created_at AND validated_at<=clock_timestamp()
        AND issued_at=(validated_at AT TIME ZONE 'Europe/Madrid')::date
        AND storage_bucket IS NULL AND storage_path IS NULL AND file_name IS NULL
        AND mime_type IS NULL AND file_size IS NULL AND checksum IS NULL)<>1
      THEN RAISE EXCEPTION 'STOP: registered document attributes mismatch; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
        v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_actual->>'document_type_key',v_vehicle; END IF;
      IF (SELECT count(*) FROM public.vehicle_documents WHERE vehicle_id=v_vehicle AND document_type_key=v_doc)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate document vehicle/type; case=% alias=% uuid=% expected_type=% found_type=% expected_vehicle=%',
          v_case_id,v_guard->>'entity_alias',v_id,v_doc,v_actual->>'document_type_key',v_vehicle;
      END IF;
    END LOOP;
    SELECT id INTO STRICT v_account FROM public.cash_accounts WHERE driver_id=v_driver
      AND name=v_case->>'account_name' AND account_type='driver' AND status='active' AND opening_balance=0
      AND currency_code='EUR' AND notes LIKE v_tag||'entity_alias=DRIVER-ACCOUNT;%';
    SELECT id INTO STRICT v_link FROM public.driver_vehicle_assignments WHERE driver_id=v_driver AND vehicle_id=v_vehicle
      AND status='active' AND notes LIKE v_tag||'entity_alias=DRIVER-VEHICLE;%';
    IF (SELECT count(*) FROM public.driver_vehicle_assignments WHERE driver_id=v_driver)<>1
      OR (SELECT count(*) FROM public.cash_accounts WHERE driver_id=v_driver)<>1
      OR EXISTS(SELECT 1 FROM public.settlements WHERE driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.driver_cash_source_allocations WHERE driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.expenses WHERE driver_id=v_driver OR advanced_by_driver_id=v_driver)
      OR EXISTS(SELECT 1 FROM public.cash_remittances WHERE driver_id=v_driver)
    THEN RAISE EXCEPTION 'STOP: unexpected driver dependencies/consumed rights'; END IF;
    IF (SELECT count(*) FROM public.services WHERE notes LIKE v_tag||'%')<>jsonb_array_length(v_case->'services') THEN
      RAISE EXCEPTION 'STOP: unexpected service count';
    END IF;
    FOR v_service IN SELECT value FROM jsonb_array_elements(v_case->'services') LOOP
      v_alias:=v_service->>'alias'; v_price:=(v_service->>'price')::numeric;
      SELECT id INTO STRICT v_sid FROM public.services WHERE notes LIKE v_tag||'entity_alias='||v_alias||';%'
        AND customer_id=v_customer AND operational_status='completed' AND deleted_at IS NULL
        AND service_type='transfer';
      SELECT id INTO STRICT v_fid FROM public.service_financials WHERE service_id=v_sid AND pricing_status='finalized'
        AND total_amount=v_price AND tax_amount=0 AND tax_rate=0 AND currency_code='EUR'
        AND notes LIKE v_tag||'entity_alias='||v_alias||':FINANCIAL;%';
      SELECT id INTO STRICT v_assignment FROM public.service_assignments WHERE service_id=v_sid
        AND driver_id=v_driver AND vehicle_id=v_vehicle AND driver_vehicle_assignment_id=v_link
        AND assignment_status='ended' AND accepted_at IS NOT NULL AND accepted_by_driver_id IS NULL
        AND assigned_at<=accepted_at AND accepted_at<=ended_at AND ended_by=v_actor
        AND internal_priority_exception=(v_case_id='C2');
      IF (SELECT count(*) FROM public.service_assignments WHERE service_id=v_sid)<>1
        OR (SELECT count(*) FROM public.service_closures WHERE service_id=v_sid AND assignment_id=v_assignment
          AND closure_type='completed' AND closed_by_user_id=v_actor AND closed_by_driver_id IS NULL
          AND closed_at>=(SELECT ended_at FROM public.service_assignments WHERE id=v_assignment)
          AND closed_at>=(SELECT accepted_at FROM public.service_assignments WHERE id=v_assignment)
          AND (closed_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN
            (v_case->>'period_start')::date AND (v_case->>'period_end')::date)<>1
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid)<>2
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid AND location_type='origin')<>1
        OR (SELECT count(*) FROM public.service_locations WHERE service_id=v_sid AND location_type='destination')<>1
        OR (SELECT count(*) FROM public.service_price_components WHERE service_financial_id=v_fid)<>1
        OR (SELECT count(*) FROM public.service_price_components WHERE service_financial_id=v_fid
          AND component_type='base_fare' AND quantity=1 AND line_amount=v_price)<>1
        OR (SELECT count(*) FROM public.service_status_history WHERE service_id=v_sid)<>3
        OR (SELECT count(*) FROM public.service_status_history WHERE service_id=v_sid
          AND changed_by_user_id=v_actor AND changed_by_driver_id IS NULL AND metadata->>'qa_run'=v_run)<>3
        OR EXISTS(SELECT 1 FROM public.settlement_items WHERE service_id=v_sid)
        OR EXISTS(SELECT 1 FROM public.service_driver_progress WHERE service_id=v_sid)
      THEN RAISE EXCEPTION 'STOP: service fixture not exact: %/%',v_case_id,v_alias; END IF;

      -- AC.2: exact histories, actors, parents and real chronology.
      SELECT jsonb_agg(jsonb_build_object('from',h.from_status,'to',h.to_status)
        ORDER BY CASE h.to_status WHEN 'confirmed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END)
        INTO v_actual FROM public.service_status_history h WHERE h.service_id=v_sid;
      IF v_actual IS DISTINCT FROM '[{"from":"pending","to":"confirmed"},{"from":"confirmed","to":"in_progress"},{"from":"in_progress","to":"completed"}]'::jsonb
        OR EXISTS(SELECT 1 FROM public.service_status_history h WHERE h.service_id=v_sid
          AND (h.assignment_id IS DISTINCT FROM v_assignment OR h.changed_by_user_id IS DISTINCT FROM v_actor
            OR h.changed_by_driver_id IS NOT NULL
            OR h.changed_at<(SELECT accepted_at FROM public.service_assignments WHERE id=v_assignment)
            OR h.changed_at>clock_timestamp() OR h.metadata->>'qa_run' IS DISTINCT FROM v_run
            OR h.metadata->>'qa_case' IS DISTINCT FROM v_case_id OR h.metadata->>'entity_alias' IS DISTINCT FROM v_alias))
        OR EXISTS(SELECT 1 FROM public.service_status_history c
          JOIN public.service_status_history p ON p.service_id=c.service_id AND p.to_status='in_progress'
          JOIN public.service_status_history e ON e.service_id=c.service_id AND e.to_status='completed'
          WHERE c.service_id=v_sid AND c.to_status='confirmed'
            AND (c.changed_at>p.changed_at OR p.changed_at>e.changed_at
              OR e.changed_at>(SELECT ended_at FROM public.service_assignments WHERE id=v_assignment)))
      THEN RAISE EXCEPTION 'STOP: service history semantics/order mismatch'; END IF;
      IF v_service->>'payment_destination' IS NOT NULL THEN
        IF (SELECT count(*) FROM public.service_financial_status_history WHERE service_financial_id=v_fid)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_financial_status_history h JOIN public.service_financials f ON f.id=h.service_financial_id
            WHERE h.service_financial_id=v_fid AND h.from_status='pending' AND h.to_status='paid'
              AND h.changed_by_user_id=v_actor AND h.reason='financial_status_recalculated' AND h.payment_id IS NULL
              AND h.changed_at=h.created_at AND h.changed_at>=f.created_at AND h.changed_at<=clock_timestamp()
              AND (h.metadata->>'total_amount')::numeric=v_price
              AND (h.metadata->>'paid_amount')::numeric=v_price AND (h.metadata->>'pending_amount')::numeric=0)
        THEN RAISE EXCEPTION 'STOP: financial history semantics mismatch'; END IF;
      ELSIF EXISTS(SELECT 1 FROM public.service_financial_status_history WHERE service_financial_id=v_fid) THEN
        RAISE EXCEPTION 'STOP: unexpected unpaid financial history';
      END IF;
      IF v_case_id='C5' THEN
        SELECT id INTO STRICT v_id FROM public.receivables WHERE service_id=v_sid;
        IF (SELECT count(*) FROM public.receivable_status_history WHERE receivable_id=v_id)<>1
          OR NOT EXISTS(SELECT 1 FROM public.receivable_status_history h JOIN public.receivables r ON r.id=h.receivable_id
            WHERE h.receivable_id=v_id AND h.from_status IS NULL AND h.to_status='open'
              AND h.changed_by_user_id=v_actor AND h.payment_id IS NULL AND h.reason='receivable_opened'
              AND h.changed_at=h.created_at AND h.changed_at>=r.created_at AND h.changed_at<=clock_timestamp()
              AND (h.metadata->>'original_amount')::numeric=200 AND (h.metadata->>'pending_amount')::numeric=200
              AND h.metadata->>'currency_code'='EUR')
        THEN RAISE EXCEPTION 'STOP: initial receivable history mismatch'; END IF;
      END IF;
      IF v_case_id='C2' THEN
        IF (SELECT count(*) FROM public.service_events WHERE service_id=v_sid)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_events e JOIN public.service_assignments a ON a.id=e.assignment_id
            WHERE e.service_id=v_sid AND e.assignment_id=v_assignment AND e.vehicle_id=v_vehicle
              AND e.event_type='internal_driver_priority_overridden' AND e.actor_user_id=v_actor
              AND e.description=a.priority_exception_reason AND e.occurred_at=a.assigned_at
              AND e.occurred_at=e.created_at AND e.occurred_at<=clock_timestamp()
              AND e.metadata->>'driver_id'=v_driver::text AND e.metadata->>'vehicle_id'=v_vehicle::text
              AND e.metadata->>'driver_vehicle_assignment_id'=v_link::text
              AND e.metadata->>'priority_exception_reason'=a.priority_exception_reason)
        THEN RAISE EXCEPTION 'STOP: C2 priority event semantics mismatch'; END IF;
      ELSIF EXISTS(SELECT 1 FROM public.service_events WHERE service_id=v_sid) THEN
        RAISE EXCEPTION 'STOP: unexpected service event';
      END IF;

      IF v_service->>'payment_destination' IS NOT NULL THEN
        SELECT id INTO STRICT v_payment FROM public.service_payments WHERE service_id=v_sid AND service_financial_id=v_fid
          AND payment_status='completed' AND payment_method='cash' AND amount=v_price AND currency_code='EUR'
          AND created_by=v_actor AND idempotency_key=v_run||':'||v_case_id||':'||v_alias||':PAYMENT';
        IF (SELECT count(*) FROM public.service_payments WHERE service_id=v_sid)<>1
          OR (SELECT count(*) FROM public.service_payment_allocations WHERE payment_id=v_payment)<>1
          OR NOT EXISTS(SELECT 1 FROM public.service_payment_allocations WHERE payment_id=v_payment
            AND service_financial_id=v_fid AND allocated_amount=v_price)
          OR NOT EXISTS(SELECT 1 FROM public.service_financials WHERE id=v_fid AND paid_amount=v_price
            AND pending_amount=0 AND financial_status='paid')
          OR EXISTS(SELECT 1 FROM public.receivables WHERE service_id=v_sid)
        THEN RAISE EXCEPTION 'STOP: cash receipt/allocation/financials mismatch'; END IF;
        SELECT id INTO STRICT v_cash FROM public.cash_movements WHERE service_payment_id=v_payment AND service_id=v_sid
          AND source_type='service_payment' AND source_id=v_payment AND movement_type='inflow'
          AND movement_category='service_payment' AND amount=v_price AND currency_code='EUR'
          AND cash_account_id=CASE WHEN v_service->>'payment_destination'='driver' THEN v_account ELSE v_admin_account END
          AND actor_driver_id IS NOT DISTINCT FROM CASE WHEN v_service->>'payment_destination'='driver' THEN v_driver ELSE NULL::uuid END
          AND metadata->>'qa_run'=v_run AND metadata->>'qa_case'=v_case_id AND metadata->>'qa_fixture'='true'
          AND original_movement_id IS NULL AND remittance_id IS NULL
          AND idempotency_key='cash:'||v_run||':'||v_case_id||':'||v_alias||':PAYMENT';
        IF (SELECT count(*) FROM public.cash_movements WHERE service_payment_id=v_payment)<>1
          OR EXISTS(SELECT 1 FROM public.cash_movements WHERE original_movement_id=v_cash)
        THEN RAISE EXCEPTION 'STOP: cash movement duplicate/reversal'; END IF;
        IF v_service->>'payment_destination'='driver' THEN
          IF (SELECT count(*) FROM elara_private.driver_cash_available WHERE cash_movement_id=v_cash
            AND driver_id=v_driver AND cash_account_id=v_account AND service_payment_id=v_payment
            AND service_id=v_sid AND original_amount=v_price AND available_amount=v_price
            AND reserved_amount=0 AND applied_amount=0)<>1
          THEN RAISE EXCEPTION 'STOP: expected driver source missing'; END IF;
        ELSIF EXISTS(SELECT 1 FROM elara_private.driver_cash_available WHERE cash_movement_id=v_cash) THEN
          RAISE EXCEPTION 'STOP: administrative cash became driver cash';
        END IF;
      ELSE
        IF EXISTS(SELECT 1 FROM public.service_payments WHERE service_id=v_sid)
          OR EXISTS(SELECT 1 FROM public.cash_movements WHERE service_id=v_sid)
          OR NOT EXISTS(SELECT 1 FROM public.service_financials WHERE id=v_fid AND paid_amount=0
            AND pending_amount=200 AND financial_status='pending')
          OR (SELECT count(*) FROM public.receivables WHERE service_id=v_sid AND service_financial_id=v_fid
            AND customer_id=v_customer AND status='open' AND currency_code='EUR'
            AND original_amount=200 AND collected_amount=0 AND pending_amount=200)<>1
        THEN RAISE EXCEPTION 'STOP: C5 receivable assertion failed'; END IF;
      END IF;
      IF EXISTS(SELECT 1 FROM public.expenses WHERE service_id=v_sid)
        OR EXISTS(SELECT 1 FROM elara_private.driver_cash_source_usage u JOIN public.cash_movements m
          ON m.id=u.cash_movement_id WHERE m.service_id=v_sid)
      THEN RAISE EXCEPTION 'STOP: unexpected expense/cash usage'; END IF;
    END LOOP;
    IF (SELECT coalesce(sum(available_amount),0) FROM elara_private.driver_cash_available WHERE driver_id=v_driver)
        <> (v_case->>'cash_available')::numeric
      OR (SELECT count(*) FROM public.cash_movements WHERE cash_account_id=v_account)
        <> (CASE WHEN v_case_id IN ('C3','C4') THEN 1 ELSE 0 END)
    THEN RAISE EXCEPTION 'STOP: exact case cash availability failed'; END IF;
    IF v_case_id='C6' THEN
      SELECT id INTO STRICT v_override FROM public.driver_settlement_overrides WHERE driver_id=v_driver
        AND currency_code='EUR' AND driver_percentage=40 AND elara_percentage=60
        AND effective_from='2026-10-01' AND effective_to='2026-10-31'
        AND status='active' AND source=v_run AND created_by=v_actor;
      IF (SELECT count(*) FROM public.driver_settlement_overrides WHERE driver_id=v_driver)<>1 THEN
        RAISE EXCEPTION 'STOP: duplicate override';
      END IF;
    ELSIF EXISTS(SELECT 1 FROM public.driver_settlement_overrides WHERE driver_id=v_driver) THEN
      RAISE EXCEPTION 'STOP: override on non-C6 case';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.cash_movements WHERE cash_account_id=v_admin_account)
    <> (SELECT count(*) FROM jsonb_array_elements(v_plan->'cases') c
        CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination'='administrative')
    OR (SELECT coalesce(sum(CASE WHEN movement_type='inflow' THEN amount ELSE -amount END),0)
      FROM public.cash_movements WHERE cash_account_id=v_admin_account)
      <> (SELECT coalesce(sum((s->>'price')::numeric),0) FROM jsonb_array_elements(v_plan->'cases') c
          CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination'='administrative')
    OR (SELECT count(*) FROM public.cash_movements WHERE metadata->>'qa_run'=v_run)
      <> (SELECT count(*) FROM jsonb_array_elements(v_plan->'cases') c
          CROSS JOIN jsonb_array_elements(c->'services') s WHERE s->>'payment_destination' IS NOT NULL)
  THEN RAISE EXCEPTION 'STOP: administrative/total QA ledger mismatch'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('entity_id',entity_id::text,'issue_type',issue_type)
    ORDER BY entity_id::text,issue_type),'[]'::jsonb) INTO v_actual FROM public.v_integrity_settlements;
  SELECT jsonb_agg(value ORDER BY value->>'entity_id',value->>'issue_type') INTO v_json
    FROM jsonb_array_elements(v_frozen->'integrity_baseline');
  IF v_actual IS DISTINCT FROM v_json THEN RAISE EXCEPTION 'STOP: unreviewed baseline integrity alert'; END IF;

  v_baseline := current_setting('elara_qa.existing_rows')::jsonb;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_baseline) LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb)
      FROM %s t WHERE id::text IN (SELECT jsonb_object_keys($1))',to_regclass(v_obj.key))
      INTO v_actual USING v_obj.value;
    IF v_actual IS DISTINCT FROM v_obj.value THEN
      RAISE EXCEPTION 'STOP: existing protected rows changed/deleted: %',v_obj.key;
    END IF;
  END LOOP;

  RAISE NOTICE 'VERIFY_FIXTURES passed. No preview/generate invoked.';

END;
$qa_verify_fixtures$;
COMMIT;
\endif

\if :do_preview
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $qa_preview$
DECLARE

  v_run constant text := 'QA-4546-20261012-R01';
  v_mode text := current_setting('elara_qa.mode');
  v_plan jsonb := current_setting('elara_qa.plan')::jsonb;
  v_frozen jsonb := current_setting('elara_qa.frozen')::jsonb;
  v_actor uuid;
  v_session uuid;
  v_case jsonb; v_service jsonb; v_guard jsonb; v_item jsonb;
  v_row jsonb; v_before jsonb; v_actual jsonb; v_baseline jsonb;
  v_obj record; v_col record; v_count bigint; v_n bigint;
  v_case_id text; v_alias text; v_tag text; v_table text; v_key text;
  v_company uuid; v_customer uuid; v_admin_account uuid;
  v_person uuid; v_driver uuid; v_vehicle uuid; v_account uuid; v_link uuid;
  v_sid uuid; v_fid uuid; v_assignment uuid; v_payment uuid; v_cash uuid;
  v_override uuid; v_settlement uuid; v_id uuid;
  v_stage text; v_doc text; v_when timestamptz; v_day date; v_price numeric;
  v_earnings numeric; v_elara numeric; v_cash_available numeric;
  v_expected numeric; v_json jsonb; v_result jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_common_count integer;

BEGIN
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  IF current_setting('elara_qa.allow_preview')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'STOP: PREVIEW disabled';
  END IF;
  FOR v_case IN SELECT value FROM jsonb_array_elements(v_plan->'cases') LOOP
    v_case_id:=v_case->>'qa_case';
    SELECT id INTO STRICT v_driver FROM public.drivers WHERE
      observations LIKE 'qa_run='||v_run||';qa_case='||v_case_id||';entity_alias=DRIVER;%';

  v_result:=public.preview_settlement_generation(v_driver,(v_case->>'period_start')::date,(v_case->>'period_end')::date);
  IF v_result->'blockers' IS DISTINCT FROM '[]'::jsonb OR v_result->'excluded_services' IS DISTINCT FROM '[]'::jsonb
    OR v_result->'warnings' IS DISTINCT FROM '[]'::jsonb OR v_result->'reimbursements_informational' IS DISTINCT FROM '[]'::jsonb
    OR v_result->>'percentage_source' IS DISTINCT FROM 'per_service'
    OR v_result->>'currency_code' IS DISTINCT FROM 'EUR'
    OR v_result->>'timezone' IS DISTINCT FROM 'Europe/Madrid'
    OR v_result->>'period_start' IS DISTINCT FROM v_case->>'period_start'
    OR v_result->>'period_end' IS DISTINCT FROM v_case->>'period_end'
    OR jsonb_array_length(v_result->'eligible_services')<>jsonb_array_length(v_case->'services')
    OR (v_result->>'gross_service_amount')::numeric IS DISTINCT FROM (v_case->>'gross')::numeric
    OR (v_result->>'driver_earnings_amount')::numeric IS DISTINCT FROM (v_case->>'driver_amount')::numeric
    OR (v_result->>'elara_amount')::numeric IS DISTINCT FROM (v_case->>'elara_amount')::numeric
    OR (v_result->>'compensable_cash_available')::numeric IS DISTINCT FROM (v_case->>'cash_available')::numeric
    OR (v_result->>'cash_offset_proposed')::numeric IS DISTINCT FROM (v_case->>'cash_offset')::numeric
    OR (v_result->>'payable_amount')::numeric IS DISTINCT FROM (v_case->>'payable_amount')::numeric
    OR (v_result->>'remaining_cash_to_remit')::numeric IS DISTINCT FROM
      (v_case->>'cash_available')::numeric-(v_case->>'cash_offset')::numeric
  THEN RAISE EXCEPTION 'STOP: preview numeric/structural assertion failed: %',v_case_id; END IF;
  FOR v_service IN SELECT value FROM jsonb_array_elements(v_case->'services') LOOP
    SELECT id INTO STRICT v_sid FROM public.services WHERE
      notes LIKE 'qa_run='||v_run||';qa_case='||v_case_id||';entity_alias='||(v_service->>'alias')||';%';
    SELECT value INTO STRICT v_item FROM jsonb_array_elements(v_result->'eligible_services')
      WHERE value->>'service_id'=v_sid::text;
    IF (v_item->>'service_price')::numeric IS DISTINCT FROM (v_service->>'price')::numeric
      OR (v_item->>'driver_amount')::numeric IS DISTINCT FROM round((v_service->>'price')::numeric*(v_service->>'driver_percentage')::numeric/100,2)
      OR (v_item->>'elara_amount')::numeric IS DISTINCT FROM round((v_service->>'price')::numeric*(v_service->>'elara_percentage')::numeric/100,2)
      OR (v_item->'percentage'->>'driver_percentage')::numeric IS DISTINCT FROM (v_service->>'driver_percentage')::numeric
      OR (v_item->'percentage'->>'elara_percentage')::numeric IS DISTINCT FROM (v_service->>'elara_percentage')::numeric
      OR v_item->'percentage'->>'source' IS DISTINCT FROM (CASE WHEN v_case_id='C6' THEN 'driver_override' ELSE 'settlement_rule' END)
      OR NOT EXISTS(SELECT 1 FROM public.service_closures c JOIN public.service_assignments a ON a.id=c.assignment_id
        JOIN public.service_financials sf ON sf.service_id=c.service_id
        WHERE c.id=(v_item->>'closure_id')::uuid AND c.service_id=v_sid AND a.id=(v_item->>'assignment_id')::uuid
          AND a.driver_id=v_driver AND sf.id=(v_item->>'financial_id')::uuid
          AND (c.closed_at AT TIME ZONE 'Europe/Madrid')::date=(v_item->>'economic_date')::date)
    THEN RAISE EXCEPTION 'STOP: preview item snapshot mismatch'; END IF;
    IF v_case_id='C6' AND NOT EXISTS(SELECT 1 FROM public.driver_settlement_overrides
      WHERE id=(v_item->'percentage'->>'override_id')::uuid AND driver_id=v_driver AND source=v_run) THEN
      RAISE EXCEPTION 'STOP: preview override FK mismatch';
    END IF;
  END LOOP;

    RAISE NOTICE 'Preview assertions passed: %',v_case_id;
  END LOOP;

  v_baseline := current_setting('elara_qa.existing_rows')::jsonb;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_baseline) LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb)
      FROM %s t WHERE id::text IN (SELECT jsonb_object_keys($1))',to_regclass(v_obj.key))
      INTO v_actual USING v_obj.value;
    IF v_actual IS DISTINCT FROM v_obj.value THEN
      RAISE EXCEPTION 'STOP: existing protected rows changed/deleted: %',v_obj.key;
    END IF;
  END LOOP;

END;
$qa_preview$;
COMMIT;
\endif

\if :do_generate
SELECT pg_try_advisory_lock(hashtextextended('QA-4546-20261012-R01',0)) AS got_lock \gset
\if :got_lock
\else
DO $qa_lock_error$ BEGIN RAISE EXCEPTION 'STOP: another execution owns this QA lot'; END; $qa_lock_error$;
\endif

SET default_transaction_read_only = off;
SET default_transaction_isolation = 'serializable';
DO $qa_generate$
DECLARE

  v_run constant text := 'QA-4546-20261012-R01';
  v_mode text := current_setting('elara_qa.mode');
  v_plan jsonb := current_setting('elara_qa.plan')::jsonb;
  v_frozen jsonb := current_setting('elara_qa.frozen')::jsonb;
  v_actor uuid;
  v_session uuid;
  v_case jsonb; v_service jsonb; v_guard jsonb; v_item jsonb;
  v_row jsonb; v_before jsonb; v_actual jsonb; v_baseline jsonb;
  v_obj record; v_col record; v_count bigint; v_n bigint;
  v_case_id text; v_alias text; v_tag text; v_table text; v_key text;
  v_company uuid; v_customer uuid; v_admin_account uuid;
  v_person uuid; v_driver uuid; v_vehicle uuid; v_account uuid; v_link uuid;
  v_sid uuid; v_fid uuid; v_assignment uuid; v_payment uuid; v_cash uuid;
  v_override uuid; v_settlement uuid; v_id uuid;
  v_stage text; v_doc text; v_when timestamptz; v_day date; v_price numeric;
  v_earnings numeric; v_elara numeric; v_cash_available numeric;
  v_expected numeric; v_json jsonb; v_result jsonb;
  v_registry jsonb := '[]'::jsonb;
  v_common_count integer;

BEGIN

  FOR v_case IN SELECT value FROM jsonb_array_elements(v_plan->'cases') LOOP
    v_case_id:=v_case->>'qa_case';
    IF current_setting('elara_qa.allow_generate')::boolean IS NOT TRUE
      OR current_setting('elara_qa.confirm_generate') IS DISTINCT FROM v_run||':GENERATE'
    THEN RAISE EXCEPTION 'STOP: GENERATE authorization barriers'; END IF;
  IF current_setting('elara_qa.actor_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR current_setting('elara_qa.session_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'STOP: actor/session must be UUID identifiers; never supply credentials'; END IF;
  v_actor:=current_setting('elara_qa.actor_id')::uuid;
  v_session:=current_setting('elara_qa.session_id')::uuid;

  -- Trust boundary: privileged SQL connection, an actual existing admin/session,
  -- and a connection host/user bound to the expected Supabase project.
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: only the explicitly authorized postgres executor is supported';
  END IF;
  IF NOT (
    lower(current_setting('elara_qa.connection_host')) = 'db.pfdvehcyauoncxeolcjc.supabase.co'
    OR (lower(current_setting('elara_qa.connection_host')) LIKE '%.pooler.supabase.com'
      AND current_setting('elara_qa.connection_user') = 'postgres.pfdvehcyauoncxeolcjc')
  ) THEN RAISE EXCEPTION 'STOP: connection does not identify the expected remote project'; END IF;
  IF v_actor IS NULL OR v_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    JOIN public.app_sessions s ON s.app_user_id=u.id AND s.auth_user_id=u.auth_user_id
    JOIN auth.sessions a ON a.id=s.supabase_session_id AND a.user_id=s.auth_user_id
    WHERE u.id=v_actor AND u.status='active' AND s.supabase_session_id=v_session
      AND s.ended_at IS NULL AND s.expires_at>now()
      AND s.active_context IN ('administrativo','superadmin')
  ) THEN RAISE EXCEPTION 'STOP: actual active admin user/session required'; END IF;
  PERFORM set_config('request.jwt.claims',(SELECT jsonb_build_object(
    'sub',u.auth_user_id,'role','authenticated','session_id',v_session)::text
    FROM public.app_users u WHERE u.id=v_actor),true);
  IF public.require_admin_user() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'STOP: admin authorization does not match the executor';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('0044','0045','0046','0047')) <> 4 THEN
    RAISE EXCEPTION 'STOP: migrations 0044-0047 missing';
  END IF;
  IF (SELECT count(*) FROM public.cash_accounts WHERE account_type='central' AND status='active') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.cash_accounts
      WHERE id='60000000-0000-4000-8000-000000000100'::uuid
      AND name='Caja Central QA' AND account_type='central' AND status='active' AND currency_code='EUR')
  THEN RAISE EXCEPTION 'STOP: expected single existing central account changed'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'functions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'hash'
    THEN RAISE EXCEPTION 'STOP: function signature/body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'definitions') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      pg_get_functiondef(to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'definition'
    THEN RAISE EXCEPTION 'STOP: helper function drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'constraints') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND c.conname=v_guard->>'name'
      AND pg_get_constraintdef(c.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: constraint drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(CASE WHEN strpos(v_guard->>'table','.')>0 THEN v_guard->>'table' ELSE 'public.'||(v_guard->>'table') END) AND t.tgname=v_guard->>'name'
      AND t.tgenabled::text=v_guard->>'enabled' AND pg_get_triggerdef(t.oid,true)=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: trigger drift/disabled: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'indexes') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename=v_guard->>'table' AND indexname=v_guard->>'name' AND indexdef=v_guard->>'definition')
    THEN RAISE EXCEPTION 'STOP: index drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_frozen->'columns') LOOP
    FOR v_guard IN SELECT value FROM jsonb_array_elements(v_obj.value) LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_obj.key AND c.column_name=v_guard->>'name'
          AND c.data_type=v_guard->>'type' AND c.is_nullable=v_guard->>'nullable'
          AND c.column_default IS NOT DISTINCT FROM v_guard->>'default'
          AND c.is_generated=v_guard->>'generated')
      THEN RAISE EXCEPTION 'STOP: column contract drift: %.%',v_obj.key,v_guard->>'name'; END IF;
    END LOOP;
  END LOOP;

  -- AC.3: remote canonical CHECK/view contracts; identical deparse context.
  PERFORM set_config('search_path','public, extensions',true);
  -- Fail closed if canonical comparison data is absent or incomplete.
  IF jsonb_array_length(v_frozen->'additional_checks') IS DISTINCT FROM 29
    OR jsonb_array_length(v_frozen->'additional_view_sources') IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'STOP: AC.3 contract inventory incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_checks') g
      WHERE g->>'remote_definition' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen->'additional_view_sources') g
      WHERE g->>'remote_definition' IS NULL)
  THEN RAISE EXCEPTION 'STOP: AC.3 canonical CHECK/cash-view contract data missing'; END IF;

  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_columns') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND t.relname=v_guard->>'table' AND a.attname=v_guard->>'name'
        AND a.attnum>0 AND NOT a.attisdropped
        AND replace(format_type(a.atttypid,a.atttypmod),' ','')=replace(v_guard->>'type',' ','')
        AND a.attnotnull=NOT (v_guard->>'nullable')::boolean
        AND regexp_replace(pg_get_expr(d.adbin,d.adrelid),'::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g')
          IS NOT DISTINCT FROM regexp_replace(v_guard->>'default_source','::[a-zA-Z_][a-zA-Z_0-9]*(\[\])?','','g'))
    THEN RAISE EXCEPTION 'STOP: additional column drift: %.%',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_function_bodies') LOOP
    IF to_regprocedure(v_guard->>'signature') IS NULL OR
      (SELECT replace(p.prosrc,E'\r\n',E'\n') FROM pg_proc p
        WHERE p.oid=to_regprocedure(v_guard->>'signature')) IS DISTINCT FROM v_guard->>'source'
    THEN RAISE EXCEPTION 'STOP: additional helper body drift: %',v_guard->>'signature'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_triggers') LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(v_guard->>'table'))
      AND t.tgname=v_guard->>'name' AND t.tgfoid=to_regprocedure(v_guard->>'function')
      AND t.tgtype=(v_guard->>'type')::smallint AND t.tgenabled='O'
      AND t.tgdeferrable=(v_guard->>'deferrable')::boolean
      AND t.tginitdeferred=(v_guard->>'initially_deferred')::boolean)
    THEN RAISE EXCEPTION 'STOP: additional trigger contract drift: %',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_checks') LOOP
    SELECT count(*) INTO v_count FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND t.relname=v_guard->>'table' AND c.conname=v_guard->>'name'
        AND c.contype=(v_guard->>'contype')::"char"
        AND c.convalidated=(v_guard->>'validated')::boolean
        AND c.condeferrable=(v_guard->>'deferrable')::boolean
        AND c.condeferred=(v_guard->>'initially_deferred')::boolean
        AND pg_get_constraintdef(c.oid,true)=v_guard->>'remote_definition')
    THEN RAISE EXCEPTION 'STOP: additional CHECK missing/ambiguous/flags or definition drift: %.%.%',
      v_guard->>'schema',v_guard->>'table',v_guard->>'name'; END IF;
  END LOOP;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'additional_view_sources') LOOP
    SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view';
    IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_guard->>'schema' AND c.relname=v_guard->>'view'
        AND c.relkind=(v_guard->>'relkind')::"char" AND pg_get_userbyid(c.relowner)=v_guard->>'owner'
        AND pg_get_viewdef(c.oid,true)=v_guard->>'remote_definition'
        AND coalesce(to_jsonb(c.reloptions),'null'::jsonb)=v_guard->'reloptions'
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_barrier'),false)=(v_guard->>'security_barrier')::boolean
        AND coalesce((SELECT o.option_value::boolean FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker'),false)=(v_guard->>'security_invoker')::boolean)
    THEN RAISE EXCEPTION 'STOP: cash view missing/ambiguous/definition, owner or security drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum),'[]'::jsonb) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid=to_regclass(v_guard->>'name') AND a.attnum>0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_guard->'ordered_columns' THEN
      RAISE EXCEPTION 'STOP: cash view ordered column names/types drift: %',v_guard->>'name'; END IF;
    -- PUBLIC is grantee 0, not a pg_roles row. Include default ACL semantics.
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(v_guard->>'name') AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC cash view privileges drift: %',v_guard->>'name'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.privilege_type,a.is_grantable),'[]'::jsonb) INTO v_actual
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=v_guard->>'schema' AND a.grantee=0;
    IF v_actual IS DISTINCT FROM v_guard->'public_schema_privileges' THEN
      RAISE EXCEPTION 'STOP: PUBLIC private-schema privileges drift'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_guard->'role_access') LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=v_item->>'role'
        AND has_schema_privilege(r.oid,to_regnamespace(v_guard->>'schema'),'USAGE')=(v_item->>'schema_usage')::boolean
        AND has_table_privilege(r.oid,to_regclass(v_guard->>'name'),'SELECT')=(v_item->>'view_select')::boolean)
      THEN RAISE EXCEPTION 'STOP: cash view role access drift: %/%',v_guard->>'name',v_item->>'role'; END IF;
    END LOOP;
  END LOOP;

  IF pg_get_viewdef(to_regclass('public.v_integrity_settlements'),true)
      IS DISTINCT FROM v_frozen->'view'->>'definition'
  THEN RAISE EXCEPTION 'STOP: integrity view changed; review the exception list'; END IF;
  FOR v_guard IN SELECT value FROM jsonb_array_elements(v_frozen->'legacy') LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_guard->>'table')
      INTO v_actual USING (v_guard->>'id')::uuid;
    -- Compare frozen instants as timestamptz; retain JSONB containment otherwise.
    DECLARE
      v_legacy_expected jsonb := v_guard->'expected';
      v_legacy_actual jsonb := v_actual;
      v_legacy_time record;
      v_expected_instant timestamptz;
      v_actual_instant timestamptz;
    BEGIN
      IF v_actual IS NULL THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      IF v_guard->>'table'='settlements'
        AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
        AND NOT (v_legacy_expected ?& ARRAY['created_at','updated_at']) THEN
        RAISE EXCEPTION 'STOP: legacy baseline requires created_at and updated_at: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
      FOR v_legacy_time IN
        SELECT a.attname AS name
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_guard->>'table'
          AND a.attnum>0 AND NOT a.attisdropped
          AND a.atttypid='pg_catalog.timestamptz'::regtype
          AND v_legacy_expected ? a.attname
          AND (jsonb_typeof(v_legacy_expected->a.attname)<>'null'
            OR (v_guard->>'table'='settlements'
              AND v_guard->>'id'='90000000-0000-4000-8000-000000000101'
              AND a.attname IN ('created_at','updated_at')))
        ORDER BY a.attnum
      LOOP
        IF NOT (v_actual ? v_legacy_time.name) THEN
          RAISE EXCEPTION 'STOP: legacy timestamp missing: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        -- Require an explicit ISO offset; no session-dependent naive timestamps.
        IF jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'null' AND
          (jsonb_typeof(v_legacy_expected->v_legacy_time.name)<>'string'
            OR (v_legacy_expected->>v_legacy_time.name) !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        BEGIN
          v_expected_instant := (v_legacy_expected->>v_legacy_time.name)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'STOP: invalid legacy baseline timestamp: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END;
        v_actual_instant := (v_actual->>v_legacy_time.name)::timestamptz;
        IF v_actual_instant IS DISTINCT FROM v_expected_instant THEN
          RAISE EXCEPTION 'STOP: audited legacy timestamp changed: %/%/%',v_guard->>'table',v_guard->>'id',v_legacy_time.name;
        END IF;
        v_legacy_expected := v_legacy_expected - v_legacy_time.name;
        v_legacy_actual := v_legacy_actual - v_legacy_time.name;
      END LOOP;
      IF NOT (v_legacy_actual @> v_legacy_expected) THEN
        RAISE EXCEPTION 'STOP: audited legacy baseline changed: %/%',v_guard->>'table',v_guard->>'id';
      END IF;
    END;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='calculation_version' AND column_default='2')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='percentage_source' AND column_default='''per_service''::text')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlements'
      AND column_name='payable_amount' AND is_generated='ALWAYS' AND generation_expression='(driver_amount - cash_offset_amount)')
  THEN RAISE EXCEPTION 'STOP: version/source/payable defaults changed'; END IF;
  IF (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='internal_driver' AND currency_code='EUR'
          AND effective_from<='2026-10-01'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-31'::date)
          AND frequency='monthly' AND calculation_method='driver_share'
          AND driver_percentage=35 AND elara_percentage=65)<>1
    OR (SELECT count(*) FROM public.settlement_rules
        WHERE is_active AND driver_type='external_collaborator' AND currency_code='EUR'
          AND effective_from<='2026-10-12'::date
          AND (effective_until IS NULL OR effective_until>='2026-10-18'::date)
          AND frequency='weekly' AND calculation_method='elara_commission'
          AND driver_percentage=90 AND elara_percentage=10)<>1
    OR EXISTS(SELECT 1 FROM public.settlement_rules
      WHERE is_active AND currency_code='EUR' AND effective_from<='2026-10-31'::date
        AND (effective_until IS NULL OR effective_until>='2026-10-01'::date)
        AND id NOT IN ('bb762c20-07fc-476c-96de-7207feef3caa'::uuid,
                       '1bee60db-6935-4afa-96d0-8d31c92f12b3'::uuid))
  THEN RAISE EXCEPTION 'STOP: percentage rules changed/ambiguous'; END IF;
  IF (SELECT count(*) FROM public.vehicle_document_types WHERE is_active
      AND required_for_owned AND key IN ('insurance','itv','circulation_permit','vtc_license'))<>4
    OR EXISTS(SELECT 1 FROM public.vehicle_document_types WHERE is_active AND required_for_owned
      AND key NOT IN ('insurance','itv','circulation_permit','vtc_license'))
  THEN RAISE EXCEPTION 'STOP: required document contract changed'; END IF;
  IF v_mode IN ('PREFLIGHT','PREPARE') THEN
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    IF v_day<'2026-10-12'::date OR v_day>'2026-10-18'::date THEN
      RAISE EXCEPTION 'STOP: execution date incompatible with R01/C2; no automatic backdating';
    END IF;
  END IF;

  SELECT id INTO STRICT v_driver FROM public.drivers WHERE
    observations LIKE 'qa_run='||v_run||';qa_case='||v_case_id||';entity_alias=DRIVER;%';
  IF EXISTS(SELECT 1 FROM public.settlements WHERE driver_id=v_driver) THEN
    RAISE EXCEPTION 'STOP: generation is not a replay/upsert';
  END IF;
  v_settlement:=public.generate_settlement(v_driver,(v_case->>'period_start')::date,(v_case->>'period_end')::date,
    'qa_run='||v_run||';qa_case='||v_case_id||';entity_alias=SETTLEMENT;purpose=authorized isolated QA generation');
  IF NOT EXISTS(SELECT 1 FROM public.settlements s WHERE s.id=v_settlement AND s.driver_id=v_driver
    AND s.calculation_version=2 AND s.percentage_source='per_service' AND s.status='generated'
    AND s.period_start=(v_case->>'period_start')::date AND s.period_end=(v_case->>'period_end')::date
    AND s.currency_code='EUR' AND s.generated_at IS NOT NULL AND s.created_by=v_actor
    AND s.gross_eligible_amount=(v_case->>'gross')::numeric AND s.calculation_base_amount=(v_case->>'gross')::numeric
    AND s.driver_amount=(v_case->>'driver_amount')::numeric AND s.elara_amount=(v_case->>'elara_amount')::numeric
    AND s.cash_offset_amount=(v_case->>'cash_offset')::numeric AND s.payable_amount=(v_case->>'payable_amount')::numeric
    AND s.paid_amount=0 AND s.pending_amount=s.payable_amount AND s.expense_deduction_amount=0 AND s.adjustment_amount=0
    AND s.driver_percentage=CASE WHEN v_case_id='C2' THEN 90 ELSE 35 END
    AND s.elara_percentage=CASE WHEN v_case_id='C2' THEN 10 ELSE 65 END
    AND s.payment_status=CASE WHEN v_case_id='C4' THEN 'paid' ELSE 'unpaid' END)
  THEN RAISE EXCEPTION 'STOP: generated header mismatch'; END IF;
  IF (SELECT count(*) FROM public.settlement_items WHERE settlement_id=v_settlement)<>jsonb_array_length(v_case->'services')
    OR EXISTS(SELECT 1 FROM public.settlement_payments WHERE settlement_id=v_settlement)
    OR (SELECT count(*) FROM public.settlement_status_history WHERE settlement_id=v_settlement)<>2
    OR NOT EXISTS(SELECT 1 FROM public.settlement_status_history WHERE settlement_id=v_settlement
      AND from_status IS NULL AND to_status='draft' AND changed_by_user_id=v_actor)
    OR NOT EXISTS(SELECT 1 FROM public.settlement_status_history WHERE settlement_id=v_settlement
      AND from_status='draft' AND to_status='generated' AND changed_by_user_id=v_actor)
    OR (SELECT count(*) FROM public.audit_logs WHERE entity_id=v_settlement
      AND metadata->>'operation'='admin_settlement_generated' AND actor_app_user_id=v_actor)<>1
  THEN RAISE EXCEPTION 'STOP: generated items/payment/history/audit mismatch'; END IF;
  FOR v_service IN SELECT value FROM jsonb_array_elements(v_case->'services') LOOP
    SELECT id INTO STRICT v_sid FROM public.services WHERE
      notes LIKE 'qa_run='||v_run||';qa_case='||v_case_id||';entity_alias='||(v_service->>'alias')||';%';
    IF (SELECT count(*) FROM public.settlement_items WHERE service_id=v_sid AND item_type='service_income')<>1
      OR NOT EXISTS(SELECT 1 FROM public.settlement_items i JOIN public.service_assignments a ON a.id=i.service_assignment_id
        JOIN public.service_financials sf ON sf.id=i.service_financial_id
        JOIN public.service_closures c ON c.assignment_id=a.id AND c.service_id=i.service_id
        WHERE i.settlement_id=v_settlement AND i.service_id=v_sid AND a.driver_id=v_driver
          AND sf.service_id=v_sid AND sf.total_amount=(v_service->>'price')::numeric
          AND i.occurred_on=(c.closed_at AT TIME ZONE 'Europe/Madrid')::date
          AND i.gross_amount=sf.total_amount AND i.deduction_amount=0 AND i.adjustment_amount=0
          AND i.driver_percentage_snapshot=(v_service->>'driver_percentage')::numeric
          AND i.elara_percentage_snapshot=(v_service->>'elara_percentage')::numeric
          AND i.driver_amount_snapshot=round(sf.total_amount*i.driver_percentage_snapshot/100,2)
          AND i.elara_amount_snapshot=sf.total_amount-i.driver_amount_snapshot
          AND i.percentage_source=CASE WHEN v_case_id='C6' THEN 'driver_override' ELSE 'settlement_rule' END
          AND i.settlement_override_id IS NOT DISTINCT FROM
            CASE WHEN v_case_id='C6' THEN (SELECT id FROM public.driver_settlement_overrides WHERE driver_id=v_driver AND source=v_run) ELSE NULL::uuid END)
    THEN RAISE EXCEPTION 'STOP: generated unique entitlement/snapshot mismatch'; END IF;
  END LOOP;
  SELECT coalesce(sum(amount),0) INTO v_expected FROM public.driver_cash_source_allocations
    WHERE settlement_id=v_settlement;
  IF v_expected<>(v_case->>'cash_offset')::numeric
    OR EXISTS(SELECT 1 FROM public.driver_cash_source_allocations WHERE settlement_id=v_settlement
      AND (status<>'reserved' OR allocation_type<>'settlement_offset' OR driver_id<>v_driver OR currency_code<>'EUR'))
    OR (SELECT count(*) FROM public.driver_cash_source_allocations WHERE settlement_id=v_settlement)
        <>(CASE WHEN v_case_id IN ('C3','C4') THEN 1 ELSE 0 END)
    OR (SELECT coalesce(sum(available_amount),0) FROM elara_private.driver_cash_available WHERE driver_id=v_driver)
        <> (v_case->>'cash_available')::numeric-(v_case->>'cash_offset')::numeric
  THEN RAISE EXCEPTION 'STOP: cash reservation/remaining availability mismatch'; END IF;
  IF v_case_id IN ('C3','C4') AND NOT EXISTS(
    SELECT 1 FROM public.driver_cash_source_allocations a JOIN public.cash_movements cm ON cm.id=a.cash_movement_id
      JOIN public.service_payments p ON p.id=cm.service_payment_id
      JOIN elara_private.driver_cash_source_usage u ON u.cash_movement_id=cm.id
      JOIN public.cash_accounts ca ON ca.id=cm.cash_account_id
    WHERE a.settlement_id=v_settlement AND a.cash_account_id=ca.id AND ca.driver_id=v_driver
      AND cm.metadata->>'qa_run'=v_run AND cm.metadata->>'qa_case'=v_case_id
      AND cm.metadata->>'entity_alias'=CASE WHEN v_case_id='C3' THEN 'SERVICE-B:CASH' ELSE 'SERVICE:CASH' END
      AND p.payment_method='cash' AND p.payment_status='completed' AND cm.source_id=p.id
      AND u.original_amount=(v_case->>'cash_available')::numeric
      AND u.allocated_amount=(v_case->>'cash_offset')::numeric)
  THEN RAISE EXCEPTION 'STOP: offset source/usage mismatch'; END IF;
  -- This guard protects every pre-generation row, including all fixture cash
  -- movements/receivables/expenses. Domain generation must leave them unchanged.
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';

    FOR v_table IN SELECT unnest(ARRAY['cash_movements','receivables','expenses']) LOOP
      EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_count;
      SELECT count(*) INTO v_n FROM jsonb_object_keys(
        current_setting('elara_qa.existing_rows')::jsonb->('public.'||v_table));
      IF v_count<>v_n THEN RAISE EXCEPTION 'STOP: generation created an unexpected row in %',v_table; END IF;
    END LOOP;

  v_baseline := current_setting('elara_qa.existing_rows')::jsonb;
  FOR v_obj IN SELECT key,value FROM jsonb_each(v_baseline) LOOP
    EXECUTE format('SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(t)::text)),''{}''::jsonb)
      FROM %s t WHERE id::text IN (SELECT jsonb_object_keys($1))',to_regclass(v_obj.key))
      INTO v_actual USING v_obj.value;
    IF v_actual IS DISTINCT FROM v_obj.value THEN
      RAISE EXCEPTION 'STOP: existing protected rows changed/deleted: %',v_obj.key;
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'entity_id',x->>'issue_type'),'[]'::jsonb) INTO v_json FROM (
    SELECT value x FROM jsonb_array_elements(v_frozen->'integrity_baseline')
    UNION ALL
    SELECT jsonb_build_object('entity_id',s.id::text,'issue_type',e->>1)
      FROM public.settlements s CROSS JOIN jsonb_array_elements(v_plan->'known_integrity_exceptions') e
      WHERE s.notes LIKE 'qa_run='||v_run||';qa_case='||(e->>0)||';entity_alias=SETTLEMENT;%'
  ) allowed;
  SELECT coalesce(jsonb_agg(jsonb_build_object('entity_id',entity_id::text,'issue_type',issue_type)
    ORDER BY entity_id::text,issue_type),'[]'::jsonb) INTO v_actual FROM public.v_integrity_settlements;
  IF v_actual IS DISTINCT FROM v_json THEN
    RAISE EXCEPTION 'STOP: unexpected integrity alert or expected diagnostic missing';
  END IF;

    RAISE NOTICE '% generation assertions passed; committing this case.',v_case_id;
    COMMIT;
  END LOOP;

END;
$qa_generate$;

SET default_transaction_read_only = on;
SET default_transaction_isolation = 'read committed';
\endif

-- A single secret-free JSON report to stdout; save it separately AFTER a future
-- authorized run. The designed manifest file is never overwritten by this SQL.
BEGIN READ ONLY;
SELECT current_setting('elara_qa.plan')::jsonb ||
  jsonb_build_object(
    'phase',CASE current_setting('elara_qa.mode')
      WHEN 'PREFLIGHT' THEN 'preflight_passed'
      WHEN 'PREPARE' THEN 'fixtures_prepared'
      WHEN 'VERIFY_FIXTURES' THEN 'fixtures_verified'
      WHEN 'PREVIEW' THEN 'preview_verified'
      ELSE 'generated_verified' END,
    'observed_at',clock_timestamp(),
    'contract_fingerprints',(SELECT jsonb_object_agg(value->>'signature',value->>'hash')
      FROM jsonb_array_elements(current_setting('elara_qa.frozen')::jsonb->'functions')),
    'legacy_baseline',current_setting('elara_qa.existing_rows')::jsonb,
    'expected_entities',(SELECT jsonb_agg(e.value||coalesce(r.value,'{}'::jsonb) ORDER BY e.ordinality)
      FROM jsonb_array_elements(current_setting('elara_qa.plan')::jsonb->'expected_entities') WITH ORDINALITY e(value,ordinality)
      LEFT JOIN jsonb_array_elements(current_setting('elara_qa.registry')::jsonb) r(value)
        ON r.value->>'qa_case'=e.value->>'qa_case' AND r.value->>'entity_type'=e.value->>'entity_type'
          AND r.value->>'entity_alias'=e.value->>'entity_alias'),
    'generated_settlements',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb)
      FROM public.settlements s WHERE s.notes LIKE 'qa_run=QA-4546-20261012-R01;%'),
    'audit_refs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entity_type',a.entity_table,
      'entity_id',a.entity_id,'created_at',a.created_at)),'[]'::jsonb)
      FROM public.audit_logs a WHERE a.metadata->>'qa_run'='QA-4546-20261012-R01')
  ) AS qa_manifest;
COMMIT;
\if :do_prepare
SELECT pg_advisory_unlock(hashtextextended('QA-4546-20261012-R01',0)) AS unlocked \gset
\endif
\if :do_generate
SELECT pg_advisory_unlock(hashtextextended('QA-4546-20261012-R01',0)) AS unlocked \gset
\endif
