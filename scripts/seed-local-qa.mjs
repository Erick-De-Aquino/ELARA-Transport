#!/usr/bin/env node

/*
 * ELARA Transport V4.0 local / QA bootstrap.
 * LOCAL ONLY. Never run this against a remote or production Supabase project.
 *
 * Expected manual workflow:
 *   1. npx.cmd supabase db reset   # db.seed remains false
 *   2. node scripts/seed-local-qa.mjs
 *
 * This script creates login-capable local Auth users via the Auth Admin API, then
 * loads supabase/seed.sql into the local Postgres container. It intentionally
 * does not create public.app_sessions; those must correspond to real runtime
 * Supabase Auth sessions after signInWithPassword().
 */

import { spawn } from 'node:child_process';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QA_PASSWORD = 'ElaraLocalQA2026!';
const QA_USERS = [
  {
    email: 'qa-superadmin@example.invalid',
    name: 'QA Superadmin',
    role: 'superadmin',
  },
  {
    email: 'qa-admin@example.invalid',
    name: 'QA Administrativo',
    role: 'administrativo',
  },
  {
    email: 'qa-driver-a@example.invalid',
    name: 'QA Driver A',
    role: 'conductor',
  },
  {
    email: 'qa-driver-b@example.invalid',
    name: 'QA Driver B',
    role: 'conductor',
  },
];

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SUPABASE_DIR = resolve(REPO_ROOT, 'supabase');
const CONFIG_PATH = resolve(SUPABASE_DIR, 'config.toml');
const SEED_PATH = resolve(SUPABASE_DIR, 'seed.sql');

main().catch((error) => {
  console.error(`\n[ELARA local QA bootstrap] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  console.log('ELARA local QA bootstrap - LOCAL ONLY');

  const config = readSupabaseConfig(CONFIG_PATH);
  console.log('[1/4] Reading local Supabase status...');
  const status = await getSupabaseStatusEnv();
  const apiUrl = getRequiredStatusValue(status, ['API_URL', 'SUPABASE_URL']);
  const serviceRoleKey = getRequiredStatusValue(status, [
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SECRET_KEY',
    'SUPABASE_SECRET_KEY',
  ]);

  console.log('[2/4] Validating local endpoint...');
  assertLocalApiUrl(apiUrl, config.apiPort);
  await assertSupabaseApiReachable(apiUrl, serviceRoleKey);

  console.log('[3/4] Creating/reusing QA Auth users...');
  const existingUsers = await listAuthUsers(apiUrl, serviceRoleKey);
  await upsertQaAuthUsers(apiUrl, serviceRoleKey, existingUsers);

  console.log('[4/4] Loading business seed...');
  const dbContainer = await resolveLocalDbContainer(config.projectId);
  await runSeedSql(dbContainer);

  console.log('\nDone. QA users are ready for signInWithPassword().');
  console.log('QA users use the local-only password configured in this script.');
  console.log('Reminder: public.app_sessions are still runtime state and are not created by this seed.');
}

function readSupabaseConfig(configPath) {
  const text = readFileSync(configPath, 'utf8');
  const projectId = matchTomlString(text, /^project_id\s*=\s*"([^"]+)"/m, 'project_id');
  const apiPort = matchTomlNumberInSection(text, 'api', 'port');
  return { projectId, apiPort };
}

function matchTomlString(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Cannot read ${label} from supabase/config.toml.`);
  }
  return match[1];
}

function matchTomlNumberInSection(text, sectionName, keyName) {
  const sectionMatch = text.match(new RegExp(`\\[${escapeRegExp(sectionName)}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
  if (!sectionMatch) {
    return null;
  }

  const keyMatch = sectionMatch[1].match(new RegExp(`^\\s*${escapeRegExp(keyName)}\\s*=\\s*(\\d+)\\s*$`, 'm'));
  return keyMatch ? Number(keyMatch[1]) : null;
}

async function getSupabaseStatusEnv() {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = await runCommand(npxBin, ['supabase', 'status', '-o', 'env'], {
    cwd: REPO_ROOT,
    capture: true,
    stage: '[1/4] Reading local Supabase status',
  });

  return parseEnvOutput(result.stdout);
}

function parseEnvOutput(output) {
  const env = new Map();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const exportPrefix = 'export ';
    const normalized = line.startsWith(exportPrefix) ? line.slice(exportPrefix.length).trim() : line;
    const match = normalized.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    env.set(match[1], stripShellQuotes(match[2].trim()));
  }

  if (!env.size) {
    throw new Error('supabase status -o env did not return parseable KEY=value output.');
  }

  return env;
}

function stripShellQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function getRequiredStatusValue(env, acceptedNames) {
  for (const name of acceptedNames) {
    const value = env.get(name);
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing ${acceptedNames.join(' or ')} in supabase status -o env output. Observed keys: ${Array.from(env.keys()).sort().join(', ')}`,
  );
}

function assertLocalApiUrl(rawUrl, expectedPort) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid Supabase API URL from local status output: ${rawUrl}`);
  }

  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  if (url.protocol !== 'http:' || !localHosts.has(url.hostname)) {
    throw new Error(`Refusing to run against non-local Supabase API URL: ${rawUrl}`);
  }

  if (expectedPort && url.port !== String(expectedPort)) {
    throw new Error(`Refusing to run: API URL port ${url.port || '(none)'} does not match supabase/config.toml api.port ${expectedPort}.`);
  }
}

async function assertSupabaseApiReachable(apiUrl, serviceRoleKey) {
  const response = await authFetch(apiUrl, serviceRoleKey, '/settings', { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Local Supabase Auth is not reachable. /auth/v1/settings returned HTTP ${response.status}.`);
  }
}

async function listAuthUsers(apiUrl, serviceRoleKey) {
  const response = await authFetch(apiUrl, serviceRoleKey, '/admin/users?page=1&per_page=1000', { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw new Error(`Cannot list local Auth users. HTTP ${response.status}: ${formatApiError(body)}`);
  }

  if (Array.isArray(body.users)) {
    return body.users;
  }
  if (Array.isArray(body)) {
    return body;
  }

  throw new Error('Unexpected Auth Admin list users response shape. Expected a users array.');
}

async function upsertQaAuthUsers(apiUrl, serviceRoleKey, existingUsers) {
  const byEmail = new Map();
  for (const user of existingUsers) {
    const email = String(user.email || '').toLowerCase();
    if (!email) {
      continue;
    }
    if (byEmail.has(email)) {
      throw new Error(`Duplicate Auth users already exist for ${email}. Fresh reset is required before QA bootstrap.`);
    }
    byEmail.set(email, user);
  }

  for (const qaUser of QA_USERS) {
    const existingUser = byEmail.get(qaUser.email);
    if (existingUser) {
      await updateQaAuthUser(apiUrl, serviceRoleKey, existingUser.id, qaUser);
      console.log(`Reused and normalized Auth user: ${qaUser.email}`);
    } else {
      await createQaAuthUser(apiUrl, serviceRoleKey, qaUser);
      console.log(`Created Auth user: ${qaUser.email}`);
    }
  }
}

async function createQaAuthUser(apiUrl, serviceRoleKey, qaUser) {
  const response = await authFetch(apiUrl, serviceRoleKey, '/admin/users', {
    method: 'POST',
    body: JSON.stringify(authUserPayload(qaUser)),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw new Error(`Cannot create Auth user ${qaUser.email}. HTTP ${response.status}: ${formatApiError(body)}`);
  }
}

async function updateQaAuthUser(apiUrl, serviceRoleKey, userId, qaUser) {
  if (!userId) {
    throw new Error(`Existing Auth user for ${qaUser.email} has no id.`);
  }

  const response = await authFetch(apiUrl, serviceRoleKey, `/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(authUserPayload(qaUser)),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw new Error(`Cannot update Auth user ${qaUser.email}. HTTP ${response.status}: ${formatApiError(body)}`);
  }
}

function authUserPayload(qaUser) {
  return {
    email: qaUser.email,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: qaUser.name,
      local_qa: true,
    },
    app_metadata: {
      elara_local_qa: true,
      qa_role_hint: qaUser.role,
    },
  };
}

async function authFetch(apiUrl, serviceRoleKey, path, init) {
  return fetch(`${apiUrl.replace(/\/$/, '')}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function readJsonBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatApiError(body) {
  if (!body) {
    return 'empty response';
  }
  if (body.msg || body.message || body.error_description || body.error) {
    return body.msg || body.message || body.error_description || body.error;
  }
  if (body.raw) {
    return body.raw;
  }
  return JSON.stringify(body);
}

async function resolveLocalDbContainer(projectId) {
  const format = '{{.Names}}\t{{.Label "com.supabase.cli.project-ref"}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}';
  const result = await runCommand('docker', ['ps', '--format', format], {
    cwd: REPO_ROOT,
    capture: true,
    stage: '[4/4] Resolving local Supabase DB container',
  });

  const rows = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, projectRef, composeService, composeProject] = line.split('\t');
      return { name, projectRef, composeService, composeProject };
    });

  const expectedNames = new Set([
    `supabase_db_${projectId}`,
    `supabase_db_${normalizeDockerName(projectId)}`,
  ]);

  const labelMatch = rows.find(
    (row) => row.composeService === 'db' && (row.projectRef === projectId || row.composeProject === projectId),
  );
  if (labelMatch) {
    return labelMatch.name;
  }

  const nameMatch = rows.find((row) => expectedNames.has(row.name));
  if (nameMatch) {
    return nameMatch.name;
  }

  const observedDbContainers = rows
    .filter((row) => row.name?.startsWith('supabase_db_'))
    .map((row) => row.name)
    .sort();

  throw new Error(
    `Cannot resolve local Supabase DB container for project_id "${projectId}". Observed Supabase DB containers: ${observedDbContainers.join(', ') || '(none)'}`,
  );
}

async function runSeedSql(dbContainer) {
  console.log(`Loading ${SEED_PATH} into local container ${dbContainer}...`);

  await runCommand('docker', ['exec', '-i', dbContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
    cwd: REPO_ROOT,
    stdinFile: SEED_PATH,
    stage: '[4/4] Loading business seed',
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const spawnTarget = resolveSpawnTarget(command, args);
    const child = spawn(spawnTarget.command, spawnTarget.args, {
      cwd: options.cwd || REPO_ROOT,
      stdio: [options.stdinFile ? 'pipe' : 'ignore', options.capture ? 'pipe' : 'inherit', options.capture ? 'pipe' : 'inherit'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      rejectPromise(new Error(`${formatCommandFailure(options.stage, command, args)} failed to start: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim() ? `\n${stderr.trim()}` : '';
        rejectPromise(new Error(`${formatCommandFailure(options.stage, command, args)} failed with exit code ${code}.${detail}`));
        return;
      }

      resolvePromise({ stdout, stderr });
    });

    if (options.stdinFile) {
      const input = createReadStream(options.stdinFile);
      input.on('error', (error) => {
        child.kill();
        rejectPromise(new Error(`Cannot read stdin file ${options.stdinFile}: ${error.message}`));
      });
      input.pipe(child.stdin);
    }
  });
}

function resolveSpawnTarget(command, args) {
  if (process.platform === 'win32' && isWindowsCommandShim(command)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCmdLine(command, args)],
    };
  }

  return { command, args };
}

function isWindowsCommandShim(command) {
  return /\.(?:cmd|bat)$/i.test(String(command || ''));
}

function buildWindowsCmdLine(command, args) {
  return [command, ...args].map(quoteWindowsCmdArg).join(' ');
}

function quoteWindowsCmdArg(value) {
  const text = String(value);

  if (/^[A-Za-z0-9_.:/\\-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatCommandFailure(stage, command, args) {
  const logicalCommand = [command, ...args].join(' ');
  return `${stage || 'Child process'} (${logicalCommand})`;
}

function normalizeDockerName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}