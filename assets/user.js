(function () {
  var form = document.getElementById("user-auth-form");
  var statusEl = document.getElementById("user-status");
  var listEl = document.getElementById("user-pages");
  var serviceSectionEl = document.getElementById("paslaugos");
  var serviceListEl = document.getElementById("user-services");
  var logoutButton = document.getElementById("user-logout");
  var createButton = document.getElementById("user-create");
  var preorderButton = document.getElementById("user-preorder");
  var guestActions = document.getElementById("user-guest-actions");
  var pageParams = new URLSearchParams(window.location.search);
  var requestedServiceId = (pageParams.get("service") || "").trim();
  var claimRequested = pageParams.get("claim") === "1";
  var claimAttempted = false;
  var productKey = "atminimas.selected-product.v1";
  var productNames = {
    metal: "Graviruota plieno QR atminimo lentelė",
    steel: "Graviruota plieno QR atminimo lentelė",
    asa: "ASA 3D spausdinta QR atminimo lentelė"
  };

  function setStatus(message, state) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    if (state) statusEl.dataset.state = state;
    else delete statusEl.dataset.state;
  }

  function showPageSkeleton() {
    if (window.AtminimasLoading) AtminimasLoading.show(listEl, 2);
  }

  function finishPageSkeleton() {
    if (window.AtminimasLoading) AtminimasLoading.finish(listEl);
  }

  function selectedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(productKey);
    var value = productNames[requested] ? requested : stored;
    value = productNames[value] ? value : "metal";
    sessionStorage.setItem(productKey, value);
    return value;
  }

  function productName(value) {
    return productNames[value] || productNames.metal;
  }

  var chosenProduct = selectedProduct();
  if (createButton) createButton.href = "redaktorius.html?product=digital";
  if (preorderButton) preorderButton.href = "isankstinis-uzsakymas.html?product=" + encodeURIComponent(chosenProduct);
  if (guestActions) {
    var next = requestedServiceId
      ? "vartotojas.html?service=" + encodeURIComponent(requestedServiceId) + (claimRequested ? "&claim=1" : "") + "#paslaugos"
      : "vartotojas.html?product=" + encodeURIComponent(chosenProduct);
    var loginLink = guestActions.querySelector("a[href='prisijungti.html']");
    var registerLink = guestActions.querySelector("a[href='registruotis.html']");
    if (loginLink) loginLink.href = "prisijungti.html?next=" + encodeURIComponent(next);
    if (registerLink) registerLink.href = "registruotis.html?next=" + encodeURIComponent(next);
  }

  function cfg() {
    return window.ATMINIMAS_CONFIG;
  }

  function restUrl(table, query) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table) + "?" + query;
  }

  function rpcUrl(name) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + encodeURIComponent(name);
  }

  function functionUrl(name) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + encodeURIComponent(name);
  }

  function apiFetch(url, options) {
    return AtminimasAuth.authorizedFetch
      ? AtminimasAuth.authorizedFetch(url, options)
      : fetch(url, options);
  }

  async function serviceFlow(action, payload) {
    var response = await apiFetch(functionUrl("service-flow"), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "Paslaugos veiksmo atlikti nepavyko.");
    return result;
  }

  async function claimServiceRequest() {
    if (!claimRequested || !requestedServiceId || claimAttempted) return false;
    claimAttempted = true;
    await serviceFlow("claim", { request_id: requestedServiceId });
    return true;
  }

  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function qrUrl(publicUrl, format) {
    var absolute = new URL(publicUrl, cfg().PUBLIC_SITE_URL || window.location.href).href;
    var outputFormat = format === "jpg" ? "jpg" : "png";
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/qr-code?data=" + encodeURIComponent(absolute) + "&format=" + outputFormat;
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "#";
    } catch (_error) { return "#"; }
  }

  function fulfillmentName(value) {
    return {
      awaiting_payment: "laukiama mokėjimo",
      awaiting_customer_approval: "laukiama jūsų patvirtinimo",
      ready_for_production: "paruošta gamybai",
      in_production: "gaminama",
      ready_to_ship: "paruošta siųsti",
      shipped: "išsiųsta",
      delivered: "pristatyta",
      cancelled: "atšaukta"
    }[value] || value || "laukiama";
  }

  function shippingName(value) {
    return {
      laukiam_duomenu: "reikia pristatymo duomenų",
      laukiama_duomenu: "reikia pristatymo duomenų",
      paruošti: "paruošta apmokėti",
      "išsiųsta": "išsiųsta",
      pristatyta: "pristatyta",
      "atšaukta": "atšaukta"
    }[value] || value || "ruošiama";
  }

  function serviceName(value) {
    return { zvakes: "Žvakių uždegimas", geles: "Gėlių padėjimas", kapu_tvarkymas: "Kapavietės sutvarkymas" }[value] || value;
  }

  function serviceQuoteStatus(value) {
    return {
      awaiting_admin: "rengiama galutinė kaina",
      sent: "laukia jūsų sprendimo",
      accepted: "pasiūlymas priimtas",
      declined: "pasiūlymas atmestas",
      expired: "pasiūlymas nebegalioja"
    }[value] || value || "vertinama";
  }

  function servicePaymentStatus(value) {
    return {
      not_ready: "mokėjimas dar nepradėtas",
      pending: "galima apmokėti",
      processing: "mokėjimas pradėtas",
      paid: "apmokėta",
      failed: "mokėjimas nepavyko",
      refunded: "mokėjimas grąžintas",
      cancelled: "mokėjimas atšauktas"
    }[value] || value || "";
  }

  function formatCents(value, currency) {
    return Number.isInteger(value)
      ? new Intl.NumberFormat("lt-LT", { style: "currency", currency: currency || "EUR" }).format(value / 100)
      : "–";
  }

  function estimateRange(row) {
    if (!Number.isInteger(row.estimated_total_min_cents) || !Number.isInteger(row.estimated_total_max_cents)) return "Vertinama individualiai";
    return row.estimated_total_min_cents === row.estimated_total_max_cents
      ? formatCents(row.estimated_total_min_cents, row.currency)
      : formatCents(row.estimated_total_min_cents, row.currency) + "–" + formatCents(row.estimated_total_max_cents, row.currency);
  }

  async function serviceDecision(name, requestId, revision) {
    var response = await apiFetch(rpcUrl(name), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify({ p_request_id: requestId, p_quote_revision: Number(revision) })
    });
    var raw = await response.text();
    var result = raw ? JSON.parse(raw) : null;
    if (!response.ok) throw new Error(typeof result === "string" ? result : "Pasiūlymo būsenos pakeisti nepavyko.");
    return result;
  }

  async function startServicePayment(requestId) {
    var response = await apiFetch(functionUrl("service-flow"), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify({ action: "start_payment", request_id: requestId })
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "Mokėjimo pradėti nepavyko.");
    if (!/^https:\/\//i.test(result.checkout_url || "")) throw new Error("Mokėjimo nuoroda negauta.");
    window.location.href = result.checkout_url;
  }

  function renderServiceRequests(rows) {
    if (!serviceSectionEl || !serviceListEl) return;
    serviceSectionEl.hidden = !rows.length;
    if (!rows.length) {
      serviceListEl.innerHTML = "";
      return;
    }
    var requestedId = requestedServiceId;
    serviceListEl.innerHTML = rows.map(function (row) {
      var expired = row.quote_status === "expired" || (row.quote_expires_at && new Date(row.quote_expires_at) <= new Date());
      var services = (row.paslaugos || []).map(serviceName).join(" · ");
      var hasDistance = row.estimated_round_trip_min_km !== null && row.estimated_round_trip_min_km !== "" &&
        row.estimated_round_trip_max_km !== null && row.estimated_round_trip_max_km !== "";
      var distance = hasDistance && Number.isFinite(Number(row.estimated_round_trip_min_km)) && Number.isFinite(Number(row.estimated_round_trip_max_km))
        ? Number(row.estimated_round_trip_min_km) + "–" + Number(row.estimated_round_trip_max_km) + " km pirmyn ir atgal"
        : "Kelionės atstumas bus patikrintas rankiniu būdu";
      var quote = Number.isInteger(row.quote_amount_cents)
        ? "<div class='service-quote-box'><span>Galutinė pasiūlymo kaina</span><strong>" + html(formatCents(row.quote_amount_cents, row.currency)) + "</strong>" +
          (row.quote_message ? "<p>" + html(row.quote_message) + "</p>" : "") +
          (row.quote_expires_at ? "<small>Galioja iki " + html(new Intl.DateTimeFormat("lt-LT", { dateStyle: "long", timeStyle: "short" }).format(new Date(row.quote_expires_at))) + "</small>" : "") + "</div>"
        : "";
      var actions = "";
      if (row.quote_status === "sent" && !expired) {
        actions = "<div class='actions'><button class='button' type='button' data-service-accept='" + html(row.id) + "' data-quote-revision='" + html(row.quote_revision) + "'>Priimti pasiūlymą</button><button class='button button--ghost' type='button' data-service-decline='" + html(row.id) + "' data-quote-revision='" + html(row.quote_revision) + "'>Atmesti</button></div>";
      } else if (row.quote_status === "accepted" && !expired && ["pending", "processing", "failed", "cancelled"].indexOf(row.payment_status) !== -1) {
        actions = "<button class='button user-card-primary' type='button' data-service-payment='" + html(row.id) + "'>" + (row.payment_status === "processing" ? "Tęsti apmokėjimą" : "Apmokėti pasiūlymą") + "</button>";
      } else if (expired && row.payment_status !== "paid") {
        actions = "<p class='editor-note'>Pasiūlymo galiojimas baigėsi. Susisiekite su mumis arba palaukite naujo pasiūlymo.</p>";
      }
      var badgeClass = row.payment_status === "paid"
        ? " is-success"
        : (expired || ["failed", "cancelled"].indexOf(row.payment_status) !== -1
          ? " is-danger"
          : (["sent", "accepted"].indexOf(row.quote_status) !== -1 ? " is-warning" : " is-info"));
      return "<article class='info-box user-page-card" + (requestedId === row.id ? " is-highlighted" : "") + "' id='service-" + html(row.id) + "'>" +
        "<div class='user-card-heading'><p class='eyebrow'>Paslaugos užklausa #" + html(String(row.id).slice(0, 8).toUpperCase()) + "</p><span class='user-card-visibility" + badgeClass + "'>" + html(row.payment_status === "paid" ? "Apmokėta" : serviceQuoteStatus(expired ? "expired" : row.quote_status)) + "</span></div>" +
        "<h2>" + html(row.mirusiojo_vardas) + "</h2><p>" + html([row.kapiniu_pavadinimas, row.savivaldybe].filter(Boolean).join(", ")) + "</p>" +
        "<p class='user-card-product'>" + html(services) + "</p>" +
        "<div class='user-card-status'><span>Preliminarus įvertis</span><strong>" + html(estimateRange(row)) + "</strong><span>Kelionė</span><strong>" + html(distance) + "</strong><span>Mokėjimas</span><strong>" + html(expired && row.payment_status !== "paid" ? "pasiūlymas nebegalioja" : servicePaymentStatus(row.payment_status)) + "</strong></div>" +
        quote + actions + "</article>";
    }).join("");
  }

  function renderServiceLoadError() {
    if (!serviceSectionEl || !serviceListEl) return;
    serviceSectionEl.hidden = false;
    serviceListEl.innerHTML = "<article class='info-box user-page-card' role='alert'><h2>Paslaugų užklausų įkelti nepavyko</h2><p>Patikrinkite interneto ryšį ir pabandykite dar kartą. Jei problema kartojasi, susisiekite su mumis.</p><button class='button button--ghost' type='button' data-service-retry>Bandykite dar kartą</button></article>";
  }

  function scrollToRequestedService() {
    if (!requestedServiceId) return;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        var target = document.getElementById("service-" + requestedServiceId) || serviceSectionEl;
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  async function loadMyServiceRequests(ownerId) {
    try {
      var response = await apiFetch(restUrl(
        "paslaugu_uzklausos",
        "owner_id=eq." + encodeURIComponent(ownerId) + "&select=id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,savivaldybe,kapo_vieta,estimate_status,estimated_round_trip_min_km,estimated_round_trip_max_km,estimated_total_min_cents,estimated_total_max_cents,currency,quote_status,quote_amount_cents,quote_message,quote_revision,quote_sent_at,quote_expires_at,quote_accepted_at,quote_declined_at,payment_status,paid_at,statusas,scheduled_for,completed_at,created_at&order=created_at.desc"
      ), { headers: AtminimasAuth.headers(false) });
      if (!response.ok) throw new Error("Paslaugų užklausų užklausa nepavyko.");
      renderServiceRequests(await response.json());
      return true;
    } catch (_error) {
      renderServiceLoadError();
      return false;
    }
  }

  function primaryAction(row, order) {
    if (!order) {
      if (!row.aktyvus) {
        return "<button class='button user-card-primary' type='button' data-profile-id='" + html(row.id) + "' data-next-active='true'>Paskelbti ir gauti QR</button>";
      }
      return "<button class='button user-card-primary' type='button' data-qr-profile='" + html(row.id) + "' data-qr-format='png'>Atsisiųsti QR kodą</button>";
    }
    if (!order.apmoketa) {
      return "<a class='button user-card-primary' href='isankstinis-uzsakymas.html?product=" + encodeURIComponent(order.product_type || "metal") + "'>Išankstinis užsakymas</a>";
    }
    if (!order.customer_approved_at) {
      return "<button class='button user-card-primary' type='button' data-approve-order='" + html(order.id) + "'>Patvirtinti gamybai</button>";
    }
    if (order.tracking_url && (order.shipping_status === "išsiųsta" || order.shipping_status === "pristatyta")) {
      return "<a class='button user-card-primary' href='" + html(safeUrl(order.tracking_url)) + "' target='_blank' rel='noopener'>Stebėti siuntą</a>";
    }
    return "<a class='button user-card-primary' href='sablonas-viskas.html?slug=" + encodeURIComponent(row.id) + "'>Peržiūrėti puslapį</a>";
  }

  async function approveProduction(orderId) {
    var res = await apiFetch(rpcUrl("approve_order_for_production"), {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ p_order_id: orderId })
    });
    if (!res.ok) {
      var message = await res.text();
      throw new Error(message || "Nepavyko patvirtinti gamybos.");
    }
  }

  async function downloadDocument(orderId, type) {
    var url = cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/document-download?order=" + encodeURIComponent(orderId) + "&type=" + encodeURIComponent(type);
    var response = await apiFetch(url, { headers: AtminimasAuth.headers(false) });
    if (!response.ok) throw new Error(await response.text());
    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = type + "-" + orderId.slice(0, 8) + (blob.type === "application/pdf" ? ".pdf" : ".svg");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadQr(profileId, format) {
    var publicUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(profileId);
    var outputFormat = format === "jpg" ? "jpg" : "png";
    var response = await apiFetch(qrUrl(publicUrl, outputFormat));
    if (!response.ok) throw new Error("QR kodo atsisiųsti nepavyko.");
    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = "atminimas-" + profileId + "-qr." + outputFormat;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function setVisibility(profileId, active) {
    var res = await apiFetch(rpcUrl("set_my_profile_visibility"), {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ profile_id: profileId, is_active: active })
    });
    if (!res.ok) throw new Error("Nepavyko pakeisti puslapio viešumo.");
  }

  async function deleteProfile(profileId) {
    var url = cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/profile-manage";
    var res = await apiFetch(url, {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "delete", profile_id: profileId })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Nepavyko ištrinti puslapio.");
    return data;
  }

  async function fetchMyPages(successMessage) {
    showPageSkeleton();
    setStatus("Kraunama jūsų kliento zona…", "loading");
    var me = await AtminimasAuth.user();
    if (!me) {
      finishPageSkeleton();
      listEl.innerHTML = "";
      if (serviceListEl) serviceListEl.innerHTML = "";
      if (serviceSectionEl) serviceSectionEl.hidden = true;
      logoutButton.hidden = true;
      if (createButton) createButton.hidden = true;
      if (preorderButton) preorderButton.hidden = true;
      if (guestActions) guestActions.hidden = false;
      setStatus(requestedServiceId && claimRequested
        ? "Galutinį pasiūlymą gavote el. paštu. Prisijunkite tuo pačiu el. paštu tik tada, kai norėsite jį priimti ir apmokėti."
        : "Prisijunkite, kad atidarytumėte savo kliento zoną.", "info");
      return;
    }

    logoutButton.hidden = false;
    if (createButton) createButton.hidden = false;
    if (preorderButton) preorderButton.hidden = false;
    if (guestActions) guestActions.hidden = true;
    var claimedNow = false;
    var claimErrorMessage = "";
    try {
      claimedNow = await claimServiceRequest();
    } catch (claimError) {
      claimErrorMessage = claimError.message || "Pasiūlymo nepavyko priskirti šiai paskyrai.";
    }
    setStatus(successMessage || claimErrorMessage || (claimedNow
      ? "Pasiūlymas priskirtas jūsų paskyrai. Dabar galite jį priimti ir apmokėti."
      : "Prisijungta: " + me.email), claimErrorMessage ? "error" : (successMessage || claimedNow ? "success" : "info"));

    await loadMyServiceRequests(me.id);
    if (new URLSearchParams(window.location.search).get("payment") === "success") {
      setStatus("Mokėjimas priimtas. Laukiame saugaus patvirtinimo iš mokėjimų teikėjo – būsena netrukus atsinaujins.", "success");
    } else if (new URLSearchParams(window.location.search).get("payment") === "cancelled") {
      setStatus("Mokėjimas atšauktas. Pasiūlymas išsaugotas, galėsite bandyti dar kartą.", "warning");
    }

    var res = await apiFetch(restUrl(
      "profiliai",
      "owner_id=eq." + encodeURIComponent(me.id) + "&deleted_at=is.null&select=id,vardas,pavarde,gimimo_data,mirties_data,epitafija,aktyvus,apmoketa,statusas,created_at&order=created_at.desc"
    ), {
      headers: AtminimasAuth.headers(false)
    });

    if (!res.ok) {
      finishPageSkeleton();
      setStatus("Puslapių įkelti nepavyko.", "error");
      listEl.innerHTML = "<div class='info-box'><h2>Nepavyko įkelti puslapių</h2><p>Pabandykite atnaujinti puslapį. Jei problema kartojasi, susisiekite su mumis.</p></div>";
      scrollToRequestedService();
      return;
    }

    var rows = await res.json();
    if (!rows.length) {
      finishPageSkeleton();
      listEl.innerHTML = "<div class='info-box'><h2>Puslapių dar nėra</h2><p>Sukurkite skaitmeninį atminimo puslapį. Fizinę QR lentelę, jei jos reikės, galėsite rezervuoti atskirai.</p><div class='actions'><a class='button' href='redaktorius.html?product=digital'>Kurti puslapį</a><a class='button button--ghost' href='isankstinis-uzsakymas.html'>QR lentelės PREORDER</a></div></div>";
      scrollToRequestedService();
      return;
    }

    var orderResponse = await apiFetch(restUrl(
      "uzsakymai",
      "select=id,profilis_id,product_type,carrier,city,parcel_terminal,shipping_status,tracking_number,tracking_url,apmoketa,payment_status,fulfillment_status,customer_approved_at,total_cents,currency,created_at&order=created_at.desc"
    ), { headers: AtminimasAuth.headers(false) });
    var orders = orderResponse.ok ? await orderResponse.json() : [];
    var invoiceResponse = await apiFetch(restUrl("invoice_documents", "select=order_id,invoice_number,storage_path,emailed_at&order=created_at.desc"), { headers: AtminimasAuth.headers(false) });
    var invoices = invoiceResponse.ok ? await invoiceResponse.json() : [];
    var invoiceByOrder = Object.fromEntries(invoices.map(function (item) { return [item.order_id, item]; }));
    var orderByProfile = {};
    orders.forEach(function (order) {
      if (!orderByProfile[order.profilis_id]) orderByProfile[order.profilis_id] = order;
    });

    finishPageSkeleton();
    listEl.innerHTML = rows.map(function (row) {
      var name = [row.vardas, row.pavarde].filter(Boolean).join(" ") || row.id;
      var publicUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(row.id);
      var order = orderByProfile[row.id];
      var invoice = order ? invoiceByOrder[order.id] : null;
      var shipment = order
        ? "<div class='user-card-status'><span>Užsakymas</span><strong>" + html(fulfillmentName(order.fulfillment_status)) + "</strong><span>Pristatymas</span><strong>" + html(shippingName(order.shipping_status)) + "</strong></div>"
        : "";
      var qrActions = row.aktyvus
        ? "<button class='button button--ghost' type='button' data-qr-profile='" + html(row.id) + "' data-qr-format='png'>QR PNG</button>" +
          "<button class='button button--ghost' type='button' data-qr-profile='" + html(row.id) + "' data-qr-format='jpg'>QR JPG</button>"
        : "<p class='user-card-qr-note'>Paskelbkite puslapį, tada čia galėsite atsisiųsti veikiantį QR kodą.</p>";
      var moreActions =
        "<a class='button button--ghost' href='" + publicUrl + "'>Peržiūrėti puslapį</a>" +
        "<a class='button button--ghost' href='redaktorius.html?edit=" + encodeURIComponent(row.id) + "'>Redaguoti</a>" +
        qrActions +
        (invoice && invoice.storage_path ? "<button class='button button--ghost' type='button' data-document-order='" + html(order.id) + "' data-document-type='invoice'>Sąskaita PDF</button>" : "") +
        "<button class='button button--ghost' type='button' data-profile-id='" + html(row.id) + "' data-next-active='" + (!row.aktyvus) + "'>" + (row.aktyvus ? "Paslėpti nuo lankytojų" : "Rodyti viešai") + "</button>" +
        "<button class='button button--danger' type='button' data-delete-profile='" + html(row.id) + "' data-profile-name='" + html(name) + "'>Ištrinti puslapį</button>";
      return (
        "<article class='info-box user-page-card' data-profile-card>" +
          "<div class='user-card-heading'><p class='eyebrow'>" + (row.aktyvus ? "Viešas puslapis" : "Privatus puslapis") + "</p><span class='user-card-visibility " + (row.aktyvus ? "is-public" : "") + "'>" + (row.aktyvus ? "Viešas" : "Privatus") + "</span></div>" +
          "<h2>" + html(name) + "</h2>" +
          "<p>" + html([row.gimimo_data, row.mirties_data].filter(Boolean).join(" - ") || "Datos nepateiktos") + "</p>" +
          "<p class='user-card-product'>" + (order ? html(productName(order.product_type)) : "Skaitmeninis atminimo puslapis · be fizinio gaminio") + "</p>" +
          shipment +
          primaryAction(row, order) +
          "<details class='user-card-more'><summary>Daugiau veiksmų</summary><div class='actions'>" + moreActions + "</div></details>" +
        "</article>"
      );
    }).join("");
    scrollToRequestedService();
  }

  listEl.addEventListener("click", async function (event) {
    var qrButton = event.target.closest("button[data-qr-profile]");
    if (qrButton) {
      qrButton.disabled = true;
      statusEl.textContent = "QR kodas ruošiamas...";
      try {
        await downloadQr(qrButton.dataset.qrProfile, qrButton.dataset.qrFormat);
        statusEl.textContent = "QR kodas atsisiųstas.";
      } catch (error) {
        statusEl.textContent = error.message || "QR kodo atsisiųsti nepavyko.";
      } finally {
        qrButton.disabled = false;
      }
      return;
    }
    var deleteButton = event.target.closest("button[data-delete-profile]");
    if (deleteButton) {
      var profileName = deleteButton.dataset.profileName || "šį puslapį";
      if (!window.confirm("Ar tikrai norite ištrinti „" + profileName + "“? Atminimo puslapis ir jo nuotraukos bus pašalinti. Šio veiksmo atšaukti negalima.")) return;
      deleteButton.disabled = true;
      setStatus("Puslapis trinamas…", "loading");
      try {
        await deleteProfile(deleteButton.dataset.deleteProfile);
        await fetchMyPages();
        setStatus("Puslapis ištrintas.", "success");
      } catch (error) {
        setStatus(error.message || "Nepavyko ištrinti puslapio.", "error");
        deleteButton.disabled = false;
      }
      return;
    }
    var approvalButton = event.target.closest("button[data-approve-order]");
    if (approvalButton) {
      if (!window.confirm("Patvirtinate, kad atminimo puslapio informacija ir QR nuoroda teisingi ir lentelę galima gaminti?")) return;
      approvalButton.disabled = true;
      setStatus("Patvirtinimas saugomas…", "loading");
      try {
        await approveProduction(approvalButton.dataset.approveOrder);
        await fetchMyPages();
        setStatus("Patvirtinta. Užsakymas perduotas į gamybos eilę.", "success");
      } catch (error) {
        setStatus(error.message || "Nepavyko patvirtinti gamybos.", "error");
        approvalButton.disabled = false;
      }
      return;
    }
    var documentButton = event.target.closest("button[data-document-order]");
    if (documentButton) {
      documentButton.disabled = true;
      try {
        await downloadDocument(documentButton.dataset.documentOrder, documentButton.dataset.documentType);
      } catch (error) {
        setStatus(error.message || "Nepavyko atsisiųsti dokumento.", "error");
      } finally {
        documentButton.disabled = false;
      }
      return;
    }
    var button = event.target.closest("button[data-profile-id]");
    if (!button) return;
    var nextActive = button.dataset.nextActive === "true";
    if (nextActive && !window.confirm("Paskelbus puslapį, jo turinį galės matyti visi, turintys nuorodą arba QR kodą. Paskelbti?")) return;
    button.disabled = true;
    setStatus(nextActive ? "Puslapis skelbiamas…" : "Puslapis slepiamas…", "loading");
    try {
      await setVisibility(button.dataset.profileId, nextActive);
      await fetchMyPages();
      setStatus(nextActive ? "Puslapis paskelbtas viešai. QR kodą jau galite atsisiųsti." : "Puslapis nebėra viešas.", "success");
    } catch (error) {
      setStatus(error.message || "Nepavyko pakeisti puslapio viešumo.", "error");
      button.disabled = false;
    }
  });

  if (serviceListEl) serviceListEl.addEventListener("click", async function (event) {
    var retry = event.target.closest("button[data-service-retry]");
    if (retry) {
      retry.disabled = true;
      setStatus("Paslaugų užklausos įkeliamos iš naujo…", "loading");
      try {
        var me = await AtminimasAuth.user();
        if (!me) throw new Error("Prisijungimo sesija baigėsi. Prisijunkite iš naujo.");
        var loaded = await loadMyServiceRequests(me.id);
        setStatus(loaded
          ? "Paslaugų užklausos atnaujintos."
          : "Paslaugų užklausų vis dar nepavyko įkelti. Pabandykite vėliau.", loaded ? "success" : "warning");
        scrollToRequestedService();
      } catch (error) {
        setStatus(error.message || "Paslaugų užklausų įkelti nepavyko.", "error");
        retry.disabled = false;
      }
      return;
    }
    var accept = event.target.closest("button[data-service-accept]");
    var decline = event.target.closest("button[data-service-decline]");
    var payment = event.target.closest("button[data-service-payment]");
    var button = accept || decline || payment;
    if (!button) return;
    if (decline && !window.confirm("Ar tikrai norite atmesti šį pasiūlymą?")) return;
    button.disabled = true;
    try {
      if (accept) {
        var accepted = await serviceDecision("accept_my_service_quote", accept.dataset.serviceAccept, accept.dataset.quoteRevision);
        if (accepted !== "accepted") throw new Error(accepted === "expired" ? "Pasiūlymo galiojimas baigėsi." : "Pasiūlymas pasikeitė. Atnaujinkite puslapį.");
        await fetchMyPages("Pasiūlymas priimtas. Dabar galite saugiai jį apmokėti.");
      } else if (decline) {
        var declined = await serviceDecision("decline_my_service_quote", decline.dataset.serviceDecline, decline.dataset.quoteRevision);
        if (declined !== "declined") throw new Error("Pasiūlymas pasikeitė. Atnaujinkite puslapį.");
        await fetchMyPages("Pasiūlymas atmestas.");
      } else {
        setStatus("Ruošiamas saugus apmokėjimas…", "loading");
        await startServicePayment(payment.dataset.servicePayment);
      }
    } catch (error) {
      setStatus(error.message || "Veiksmo atlikti nepavyko.", "error");
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", function () {
    AtminimasAuth.signOut();
    setStatus("Atsijungta.", "info");
    listEl.innerHTML = "";
    if (serviceListEl) serviceListEl.innerHTML = "";
    if (serviceSectionEl) serviceSectionEl.hidden = true;
    logoutButton.hidden = true;
    if (createButton) createButton.hidden = true;
    if (preorderButton) preorderButton.hidden = true;
    if (guestActions) guestActions.hidden = false;
  });

  fetchMyPages().catch(function (err) {
    finishPageSkeleton();
    setStatus(err.message || "Nepavyko patikrinti sesijos.", "error");
  });
})();


