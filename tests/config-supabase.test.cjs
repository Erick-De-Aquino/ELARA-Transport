const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const source = fs.readFileSync('src/js/config.js', 'utf8');
const clientSource = fs.readFileSync('src/js/supabase.js', 'utf8');
// Fingerprints of the existing public credentials, before this change.
const keyHash = key => createHash('sha256').update(key).digest('hex');
function config(hostname, search='', text=source) {
  const context = {window:{location:{hostname,search}}, URLSearchParams};
  vm.runInNewContext(text, context);
  return context.window.ElaraConfig;
}
for (const hostname of ['localhost','127.0.0.1']) {
  test(`${hostname} defaults to remote and preserves its public key`, () => {
    const c = config(hostname);
    assert.equal(c.environment, 'remote');
    assert.equal(c.supabase.url, 'https://pfdvehcyauoncxeolcjc.supabase.co');
    assert.equal(keyHash(c.supabase.anonKey), '5096a018024d9223d94ba9bc7991ee8673429c5b64fd90ef5eca8c8998845252');
  });
  test(`${hostname} requires explicit local flag and preserves local anon key`, () => {
    const c = config(hostname, '?other=1&supabase=local');
    assert.equal(c.environment, 'local');
    assert.equal(c.supabase.url, 'http://127.0.0.1:54421');
    assert.equal(keyHash(c.supabase.anonKey), 'bf1725a8f98bea37e88618702e725ba84bd8acdb2647c5e0ed638bfd685791cf');
    const claims = JSON.parse(Buffer.from(c.supabase.anonKey.split('.')[1],'base64url'));
    assert.equal(claims.role, 'anon');
  });
  test(`${hostname} separates both backends and skips the old ambiguous session key`, () => {
    const remote = config(hostname).supabase.options.auth.storageKey;
    const local = config(hostname,'?supabase=local').supabase.options.auth.storageKey;
    assert.equal(remote, 'elara.transport.auth.remote');
    assert.equal(local, 'elara.transport.auth.local');
    assert.notEqual(remote, local);
    assert.notEqual(remote, 'elara.transport.auth');
  });
}
test('Pages stays remote even with local flag; production Auth options and key stay unchanged', () => {
  const expectedAuth = {autoRefreshToken:true,detectSessionInUrl:true,persistSession:true,storageKey:'elara.transport.auth'};
  for (const search of ['', '?supabase=local']) {
    const c = config('erick-de-aquino.github.io',search);
    assert.equal(c.environment, 'remote');
    assert.equal(c.supabase.url, 'https://pfdvehcyauoncxeolcjc.supabase.co');
    assert.equal(keyHash(c.supabase.anonKey), '5096a018024d9223d94ba9bc7991ee8673429c5b64fd90ef5eca8c8998845252');
    assert.equal(JSON.stringify(c.supabase.options.auth), JSON.stringify(expectedAuth));
    assert.equal(c.supabase.options.auth.storageKey, 'elara.transport.auth');
  }
});
test('missing, unrelated, empty or differently cased flags never enable local', () => {
  for (const search of ['','?supabase=','?supabase=remote','?supabase=LOCAL','?local=true'])
    assert.equal(config('localhost',search).environment, 'remote');
  assert.equal(config('example.com','?supabase=local').environment,'remote');
});
test('client receives the selected URL, matching public key and session namespace without auth calls', () => {
  for (const search of ['', '?supabase=local']) {
    const c = config('localhost',search), calls=[];
    const client = {};
    const context = {window:{ElaraConfig:c,supabase:{createClient:(...args)=>{calls.push(args);return client;}}},console};
    vm.runInNewContext(clientSource,context);
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0],[c.supabase.url,c.supabase.anonKey,c.supabase.options]);
    assert.equal(context.window.ElaraSupabase.client,client);
  }
});
test('configuration exposes no service-role/secret key or session mutation', () => {
  assert.doesNotMatch(source,/service_role|sb_secret_|localStorage|removeItem|signOut/);
  assert.match(config('localhost').supabase.anonKey,/^sb_publishable_/);
  assert.ok(Object.isFrozen(config('localhost').supabase));
});
