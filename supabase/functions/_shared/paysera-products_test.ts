import { startProductPayment, productOrderBody } from "./paysera-products.ts";
import { handleModernWebhook } from "./paysera-modern.ts";
import { createHmac } from "node:crypto";

const id = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const project = "01a07175-b221-7358-8db0-c832cedafd3c";
const provider = "33333333-3333-4333-8333-333333333333";
const secret = "product-unit-test-secret";
const checkout = "https://api.paysera.com/checkout-payment-link/payment-collection/v1/payment-links/unit-test";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

async function mocked(scenario: Record<string, any>, action: (calls: {path:string;body:any}[]) => Promise<void>) {
  const settings: Record<string,string> = { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "unit-test", SUPABASE_ANON_KEY: "unit-test", PUBLIC_SITE_URL: "https://example.test/", PAYSERA_CLIENT_ID:"", PAYSERA_CLIENT_SECRET:"", PAYSERA_MODERN_PROJECT_ID:"" };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k,Deno.env.get(k)]));
  Object.entries(settings).forEach(([k,v]) => Deno.env.set(k,v));
  const oldFetch = globalThis.fetch;
  const calls: {path:string;body:any}[] = [];
  globalThis.fetch = async (input,init) => {
    const url = new URL(String(input)), path = url.pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({path,body});
    const json=(value:unknown,status=200) => new Response(JSON.stringify(value), {status,headers:{"content-type":"application/json"}});
    if(path === "/auth/v1/user") return json({id,is_anonymous: !!scenario.anonymous});
    if(path.endsWith("/get_paysera_checkout_credentials")) return json({client_id:"unit-test",client_secret:secret,project_id:project});
    if(path.includes("/openid-connect/token")) return json({access_token:"unit-test"});
    if(path.endsWith("/begin_product_paysera_payment")) return json({attempt:{id,order_id:orderId,project_id:project,amount_cents:5300,currency:"EUR",provider_order_id:scenario.hasOrder ? provider : null,checkout_url:scenario.reuse ? checkout : null,expires_at:new Date(Date.now()+3600000).toISOString()},claim_token:scenario.noClaim ? null : id});
    if(path === "/merchant-order/integration/v1/orders") {
      if(scenario.timeout) throw new TypeError("timeout");
      if(scenario.providerError) return json({error:"provider-details"},scenario.providerError);
      return json({order_id:provider,project_id:project,purchase:{reference:id,amount:scenario.wrongAmount ? 1 : 5300,currency:"EUR"}},201);
    }
    if(path.endsWith("/payment-links")) return json({order_id:provider,link_id:id,payment_URL:scenario.badUrl ? "https://evil.test" : checkout,purchase:{amount:5300},expired_at:Math.floor(Date.now()/1000)+3500},201);
    if(/\/(attach_product_paysera_order|attach_product_paysera_link|fail_product_paysera_creation)$/.test(path)) return json(null);
    if(path === "/merchant-order/integration/v1/orders/"+provider) return json({id:provider,reference:id,project_id:project,amount:5300,amount_paid:scenario.partial ? 100 : 5300,currency:"EUR",status:scenario.partial ? "pending_payment" : "paid",is_test:!!scenario.test});
    if(path.endsWith("/process_paysera_modern_payment")) return json("not_found");
    if(path.endsWith("/process_product_paysera_payment")) return json(scenario.partial || scenario.test ? "recorded" : "accepted");
    throw new Error("Unexpected request "+path);
  };
  try {await action(calls);} finally {
    globalThis.fetch=oldFetch;
    Object.entries(previous).forEach(([k,v]) => v === undefined ? Deno.env.delete(k) : Deno.env.set(k,v));
  }
}
const request=() => new Request("https://supabase.test/payment-create",{method:"POST",headers:{authorization:"Bearer user-token"}});

Deno.test("Product checkout uses the server's 53 EUR snapshot, stores the order before its link and keeps identifiers in return URLs",async()=>{
  await mocked({},async calls=>{
    const result=await startProductPayment(request(),{order_id:orderId,amount:1,currency:"USD"});
    assert(result.checkout_url===checkout);
    const body=calls.find(c=>c.path==="/merchant-order/integration/v1/orders")!.body;
    assert(body.purchase.amount===5300 && body.purchase.currency==="EUR" && body.purchase.reference===id);
    assert(new URL(body.redirect_urls.success_url).searchParams.get("order")===orderId);
    assert(calls.findIndex(c=>c.path.endsWith("/attach_product_paysera_order"))<calls.findIndex(c=>c.path.endsWith("/payment-links")));
  });
});
Deno.test("Reusing a link or retrying its creation never posts a second provider order",async()=>{
  for(const scenario of [{reuse:true},{hasOrder:true}]) await mocked(scenario,async calls=>{
    assert((await startProductPayment(request(),{order_id:orderId})).checkout_url===checkout);
    assert(!calls.some(c=>c.path==="/merchant-order/integration/v1/orders"));
  });
});
Deno.test("Anonymous users and competing requests cannot create payment orders",async()=>{
  for(const scenario of [{anonymous:true},{noClaim:true}]) await mocked(scenario,async calls=>{
    let failed=false;
    try {await startProductPayment(request(),{order_id:orderId});} catch {failed=true;}
    assert(failed && !calls.some(c=>c.path==="/merchant-order/integration/v1/orders"));
  });
});
Deno.test("Product checkout rejects changed prices and unsafe links; ambiguous provider failures retain the claim",async()=>{
  for(const scenario of [{wrongAmount:true},{badUrl:true},{timeout:true},{providerError:500},{providerError:400}]) await mocked(scenario,async calls=>{
    let error="";
    try {await startProductPayment(request(),{order_id:orderId});} catch(e) {error=String(e);}
    assert(error && !error.includes(secret) && !error.includes("provider-details"));
    assert(calls.some(c=>c.path.endsWith("/fail_product_paysera_creation")) === ("providerError" in scenario && scenario.providerError===400));
    assert(!calls.some(c=>c.path.endsWith("/attach_product_paysera_link")));
  });
});
Deno.test("Signed product callbacks fall through the service handler and use authoritative full, partial and test totals",async()=>{
  for(const scenario of [{},{partial:true},{test:true}]) await mocked(scenario,async calls=>{
    const raw=JSON.stringify({event:{type:"payment",name:"status_updated"},order:{paysera_order_id:provider,merchant_order_id:id},payment:{status:"settled",amount:100,currency:"EUR"}});
    const response=await handleModernWebhook(new Request("https://supabase.test/webhook",{method:"POST",headers:{"x-paysera-signature":createHmac("sha256",secret).update(raw).digest("hex")},body:raw}));
    assert(response.status===200);
    const event=calls.find(c=>c.path.endsWith("/process_product_paysera_payment"))!.body;
    assert(event.p_amount===5300 && event.p_amount_paid===("partial" in scenario ? 100 : 5300));
    assert(event.p_test===("test" in scenario));
  });
});
Deno.test("Product redirects reject insecure deployment origins",()=>{
  let failed=false;
  try {productOrderBody({order_id:orderId},project,"http://example.test/","https://supabase.test/webhook");} catch {failed=true;}
  assert(failed);
});
