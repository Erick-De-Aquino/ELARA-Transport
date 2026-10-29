import { createDriverPortalHandler } from './core.mjs';

// Native HTTP avoids extra dependencies. Keys are supplied by the Edge runtime.
const project = Deno.env.get('SUPABASE_URL');
const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
const backendKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const redirect = Deno.env.get('ELARA_PORTAL_INVITE_REDIRECT_URL');
const allowedOrigins = (Deno.env.get('ELARA_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
if (!project || !publicKey || !backendKey || !redirect || !allowedOrigins.length) throw new Error('Driver access configuration missing.');
const callback = new URL(redirect);
if (!allowedOrigins.includes(callback.origin) || !callback.pathname.endsWith('/accept-invite.html') || callback.search || callback.hash) throw new Error('Invalid fixed invitation callback.');
if (callback.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(callback.hostname)) throw new Error('HTTPS callback required.');

async function call(path: string, bearer: string, key: string, method = 'GET', body?: unknown) {
 const response = await fetch(project + path, { method, headers: { Authorization: 'Bearer ' + bearer, apikey: key, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
 const data = await response.json();
 if (!response.ok) throw Object.assign(new Error('Upstream operation rejected.'), { code: typeof data?.code === 'string' ? data.code : String(response.status) });
 return data;
}
Deno.serve(createDriverPortalHandler({
 allowedOrigins,
 getUser: (jwt: string) => call('/auth/v1/user', jwt, publicKey),
 rpc: (jwt: string, name: string, args: unknown) => call('/rest/v1/rpc/' + name, jwt, publicKey, 'POST', args),
 getAuthUser: async (id: string) => { const data = await call('/auth/v1/admin/users/' + encodeURIComponent(id), backendKey, backendKey); return data.user || data; },
 invite: async (email: string) => {
  const data = await call('/auth/v1/invite?redirect_to=' + encodeURIComponent(redirect), backendKey, backendKey, 'POST', { email });
  return data.user || data;
 },
}));
