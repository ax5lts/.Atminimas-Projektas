// Uses a temporary local PostgreSQL cluster; never connects to production.
// Install embedded-postgres@17.11.0-beta.19 and pg in a temporary directory:
// node tests/security-database-concurrency.mjs <temporary-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import net from 'node:net';

const require=createRequire(join(resolve(process.argv[2]||'.'),'package.json'));
const embeddedModule=require.resolve('embedded-postgres');
const {default:EmbeddedPostgres}=await import(pathToFileURL(embeddedModule).href);
const binaryRequire=createRequire(embeddedModule);
const binaries=await import(pathToFileURL(binaryRequire.resolve(`@embedded-postgres/${process.platform==='win32'?'windows':process.platform}-${process.arch}`)).href);
const project=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
const databaseDir=await fs.mkdtemp(join(tmpdir(),'atminimas-security-postgres-'));
const ctl=join(dirname(binaries.postgres),process.platform==='win32'?'pg_ctl.exe':'pg_ctl');
const port=await new Promise((resolvePort,reject)=>{
  const server=net.createServer();server.on('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const chosen=server.address().port;server.close(()=>resolvePort(chosen));
  });
});
const exec=(exe,args)=>new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:'ignore'});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error(`pg_ctl exited ${code}`)));
});
const postgres=new EmbeddedPostgres({
  databaseDir,
  user:'postgres',password:randomBytes(24).toString('hex'),port,persistent:true,
  autoRehydrateSymlinks:true,postgresFlags:['-c','listen_addresses=127.0.0.1'],
  initdbFlags:['--encoding=UTF8','--locale=C'],
  onLog:()=>{},onError:message=>process.stderr.write(String(message)),
});
let db;let started=false;
try {
  console.log('Starting isolated PostgreSQL 17');
  await postgres.initialise();
  console.log('Initialized cluster');
  // pg_ctl creates a restricted child token on Windows, allowing tests when
  // the host shell has administrator privileges without creating an OS user.
  await exec(ctl,['-D',databaseDir,'-l',join(databaseDir,'server.log'),'-o',`-p ${port} -c listen_addresses=127.0.0.1`,'-w','start']);
  started=true;
  console.log('Started cluster');
  db=postgres.getPgClient();await db.connect();
  await db.query(`
    create role anon;create role authenticated;create role service_role;
    create schema private;create schema storage;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
  `);
  await db.query('begin;'+await fs.readFile(`${project}/supabase/migrations/20261109100241_storage_owner_quotas.sql`,'utf8')+'commit;');
  await db.query(await fs.readFile(`${project}/tests/storage_quotas_database.sql`,'utf8'));
  console.log('PASS real PostgreSQL: quota transaction regression suite');
  async function simultaneous(inputs,fn){
    const clients=inputs.map(()=>postgres.getPgClient());
    await Promise.all(clients.map(c=>c.connect()));
    const results=await Promise.allSettled(clients.map((c,i)=>fn(c,inputs[i],i)));
    await Promise.all(clients.map(c=>c.end()));
    return results;
  }
  const actor=randomUUID();
  await db.query(`insert into storage.objects(bucket_id,name,metadata)
    select 'atminimas',$1||'/profile/photo-'||i||'.jpg','{"size":1}' from generate_series(1,31) i`,[actor]);
  let results=await simultaneous(Array.from({length:12},(_,i)=>i),(c,i)=>c.query(
    `insert into storage.objects(bucket_id,name,metadata) values('atminimas',$1,'{"size":1}')`,[`${actor}/profile/parallel-${i}.jpg`]));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='23514'));
  assert.equal((await db.query('select object_count::int from private.storage_owner_usage where owner_id=$1',[actor])).rows[0].object_count,32);
  await db.query('delete from storage.objects');
  console.log('PASS real concurrency: 12 uploads at 31/32 profile-file boundary admit exactly one');
  await db.query(`insert into storage.objects(bucket_id,name,metadata)
    select 'atminimas',$1||'/profile-'||i||'/photo.jpg','{"size":1}' from generate_series(1,31) i`,[actor]);
  results=await simultaneous(Array.from({length:12},(_,i)=>i),(c,i)=>c.query(
    `insert into storage.objects(bucket_id,name,metadata) values('atminimas',$1,'{"size":1}')`,[`${actor}/parallel-profile-${i}/photo.jpg`]));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.query('select profile_count::int from private.storage_owner_usage where owner_id=$1',[actor])).rows[0].profile_count,32);
  await db.query('delete from storage.objects');
  console.log('PASS real concurrency: arbitrary-slug flood admits exactly one at 31/32 scopes');
  await db.query(`insert into storage.objects(bucket_id,name,metadata)
    select 'atminimas',$1||'/profile-'||((i-1)/32)||'/photo-'||i||'.jpg','{"size":1}' from generate_series(1,255) i`,[actor]);
  results=await simultaneous(Array.from({length:12},(_,i)=>i),(c,i)=>c.query(
    `insert into storage.objects(bucket_id,name,metadata) values('atminimas',$1,'{"size":1}')`,[`${actor}/new-profile/parallel-${i}.jpg`]));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.query('select object_count::int from private.storage_owner_usage where owner_id=$1',[actor])).rows[0].object_count,256);
  await db.query('delete from storage.objects');
  console.log('PASS real concurrency: owner object quota admits exactly one at 255/256');
  await db.query(`insert into storage.objects(bucket_id,name,metadata)
    select 'atminimas',$1||'/profile-'||((i-1)/5)||'/photo-'||i||'.jpg','{"size":52428800}' from generate_series(1,19) i`,[actor]);
  results=await simultaneous(Array.from({length:12},(_,i)=>i),(c,i)=>c.query(
    `insert into storage.objects(bucket_id,name,metadata) values('atminimas',$1,'{"size":52428800}')`,[`${actor}/parallel-profile-${i}/photo.jpg`]));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.query('select byte_count from private.storage_owner_usage where owner_id=$1',[actor])).rows[0].byte_count,'1048576000');
  console.log('PASS real concurrency: owner byte quota admits one 50MiB upload with 950MiB already stored');
  await db.query(`create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
    create table public.profiliai(id text primary key,aktyvus boolean,deleted_at timestamptz,access_code_protected boolean);
    insert into public.profiliai values('parallel-profile',true,null,false);`);
  await db.query(await fs.readFile(`${project}/supabase/migrations/20261109100240_memorial_engagement_atomic_limits.sql`,'utf8'));
  results=await simultaneous(Array.from({length:20},(_,i)=>i),async c=>{
    await c.query(`set request.jwt.claims='{"role":"service_role"}'`);
    return c.query(`select public.consume_memorial_engagement_rate_limit('parallel-profile','candle',$1) as allowed`,['a'.repeat(64)]);
  });
  assert(results.every(r=>r.status==='fulfilled'));
  assert.equal(results.filter(r=>r.value.rows[0].allowed).length,1);
  const counters=await db.query('select requests from private.memorial_engagement_limits');
  assert.equal(counters.rows.length,4);
  assert(counters.rows.every(r=>r.requests===1));
  console.log('PASS real concurrency: 20 simultaneous same-visitor candles admit exactly one, with no leaked denied reservations');
} finally {
  if(db)await db.end();
  if(started)await exec(ctl,['-D',databaseDir,'-m','fast','-w','stop']);
}
