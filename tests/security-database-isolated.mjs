// Isolated PostgreSQL regression suite; never connects to production.
// Install @electric-sql/pglite@0.5.15 in a temporary directory, then run:
// node tests/security-database-isolated.mjs <temporary-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(join(resolve(process.argv[2] || '.'), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const project = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const db = new PGlite({extensions:{pgcrypto}});
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema private;
  create schema storage;
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
  insert into storage.objects(bucket_id,name,metadata) values
    ('atminimas','11111111-1111-4111-8111-111111111111/existing/photo-1.jpg','{"size":1024}'),
    ('atminimas','11111111-1111-4111-8111-111111111111/existing/video.mp4','{"size":2048}'),
    ('atminimas','legacy/photo-1.jpg','{"size":4096}');
`);
await db.exec('begin;'+await fs.readFile(`${project}/supabase/migrations/20261109100241_storage_owner_quotas.sql`, 'utf8')+'commit;');
const baseline = await db.query('select object_count::int,byte_count::int,profile_count::int from private.storage_owner_usage');
assert.deepEqual(baseline.rows,[{object_count:2,byte_count:3072,profile_count:1}]);
await db.exec(await fs.readFile(`${project}/tests/storage_quotas_database.sql`, 'utf8'));
const after = await db.query('select object_count::int,byte_count::int,profile_count::int from private.storage_owner_usage');
assert.deepEqual(after.rows,baseline.rows);
assert.equal((await db.query('select count(*)::int as count from storage.objects')).rows[0].count,3);
console.log('PASS: bootstrap, transactions, counts, bytes, scopes, versions, upserts, moves, savepoint probes, invalid metadata, rollback and permissions');
await db.exec(`
  create schema auth;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
  create table auth.users(id uuid primary key);
  insert into auth.users values ('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
  create table auth.mfa_factors(id uuid,user_id uuid,friendly_name text,factor_type text,status text,created_at timestamptz,updated_at timestamptz);
  create table public.user_roles(user_id uuid,role text);
  insert into public.user_roles values ('33333333-3333-4333-8333-333333333333','admin');
  create function private.session_mfa_satisfied() returns boolean language sql stable security definer as $$
    select coalesce(auth.jwt()->>'aal'='aal2',false) or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
  $$;
  alter table public.user_roles enable row level security;
  alter table storage.objects enable row level security;
  create policy enrolled_mfa_required on public.user_roles as restrictive for all to authenticated
    using(private.session_mfa_satisfied()) with check(private.session_mfa_satisfied());
  create policy enrolled_mfa_required on storage.objects as restrictive for all to authenticated
    using(private.session_mfa_satisfied()) with check(private.session_mfa_satisfied());
  create table public.profiliai(id text primary key, owner_id uuid, vardas text, aktyvus boolean, apmoketa boolean,
    statusas text, deleted_at timestamptz, access_code_hash text,
    access_code_protected boolean generated always as (access_code_hash is not null) stored);
`);
await db.exec(await fs.readFile(`${project}/supabase/migrations/20261109121128_require_admin_mfa.sql`,'utf8'));
await db.exec(await fs.readFile(`${project}/tests/mfa_database.sql`,'utf8'));
console.log('PASS: admin MFA required even before enrollment; normal user enrollment, verified factors, aal1/aal2, and self-role discovery');
await db.exec(await fs.readFile(`${project}/supabase/migrations/20261109100240_memorial_engagement_atomic_limits.sql`,'utf8'));
await db.exec(await fs.readFile(`${project}/tests/memorial_engagement_database.sql`,'utf8'));
console.log('PASS: rate-limit budgets, all-or-nothing reservations, expiry, cleanup, protected profiles and service-role guard');
await db.close();
