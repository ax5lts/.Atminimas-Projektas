const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function catalog(price) {
  const scope = { ATMINIMAS_CONFIG: { SUPABASE_URL:'https://example.test', SUPABASE_ANON_KEY:'test' }, fetch:async()=>({ok:true,json:async()=>[{id:'metal',enabled:true,price_cents:price,currency:'EUR'}]}) };
  scope.window=scope;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/product-catalog.js'),'utf8'),scope);
  return scope.AtminimasProductCatalog.load();
}
test('60 EUR enables new orders; stale 50 EUR cannot override the advertised price',async()=>{
  const current=await catalog(6000);
  assert.equal(current.remote,true);
  assert.equal(current.metal.available,true);
  assert.equal(current.metal.price_cents,6000);
  const stale=await catalog(5000);
  assert.equal(stale.remote,false);
  assert.equal(stale.metal.available,false);
  assert.equal(stale.metal.price_cents,null);
});
