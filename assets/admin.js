(function () {
  var form = document.getElementById("admin-auth-form");
  var loginStatusEl = document.getElementById("admin-status");
  var sessionStatusEl = document.getElementById("admin-session-status");
  var adminSession = document.getElementById("admin-session");
  var adminEmail = document.getElementById("admin-email");
  var overview = document.getElementById("admin-overview");
  var totalOrdersEl = document.getElementById("admin-total-orders");
  var unpaidOrdersEl = document.getElementById("admin-unpaid-orders");
  var totalProfilesEl = document.getElementById("admin-total-profiles");
  var activeShipmentsEl = document.getElementById("admin-active-shipments");
  var serviceCountEl = document.getElementById("admin-service-count");
  var openServicesEl = document.getElementById("admin-open-services");
  var productionCountEl = document.getElementById("admin-production-count");
  var productionReadyEl = document.getElementById("admin-production-ready");
  var memoryCountEl = document.getElementById("admin-memory-count");
  var pendingMemoriesEl = document.getElementById("admin-pending-memories");
  var businessSettingsPanel = document.getElementById("admin-business-settings");
  var businessSettingsForm = document.getElementById("business-settings-form");
  var businessSettingsStatus = document.getElementById("business-settings-status");
  var productionPanel = document.getElementById("admin-production");
  var productionRows = document.getElementById("production-rows");
  var productionRefresh = document.getElementById("production-refresh");
  var automationPanel = document.getElementById("admin-automation");
  var automationRows = document.getElementById("automation-rows");
  var automationRefresh = document.getElementById("automation-refresh");
  var ordersPanel = document.getElementById("admin-orders");
  var orderRows = document.getElementById("order-rows");
  var orderSearch = document.getElementById("admin-order-search");
  var ordersRefresh = document.getElementById("orders-refresh");
  var panel = document.getElementById("admin-panel");
  var rowsEl = document.getElementById("admin-rows");
  var searchInput = document.getElementById("admin-search");
  var refreshButton = document.getElementById("admin-refresh");
  var logoutButton = document.getElementById("admin-logout");
  var shipmentsPanel = document.getElementById("admin-shipments");
  var shipmentRows = document.getElementById("shipment-rows");
  var shipmentsRefresh = document.getElementById("shipments-refresh");
  var legalRequestsPanel = document.getElementById("admin-legal-requests");
  var legalRequestsRefresh = document.getElementById("legal-requests-refresh");
  var withdrawalRows = document.getElementById("withdrawal-rows");
  var contentReportRows = document.getElementById("content-report-rows");
  var memoriesPanel = document.getElementById("admin-memories");
  var memoryRows = document.getElementById("memory-rows");
  var memoriesRefresh = document.getElementById("memories-refresh");
  var serviceRequestsPanel = document.getElementById("admin-service-requests");
  var serviceRequestsRefresh = document.getElementById("service-requests-refresh");
  var serviceRequestRows = document.getElementById("service-request-rows");
  var cache = [];
  var orderCache = [];
  var shipmentCache = [];
  var withdrawalCache = [];
  var contentReportCache = [];
  var serviceRequestCache = [];
  var productionCache = [];
  var automationCache = [];
  var memoryCache = [];

  function setStatus(message) {
    loginStatusEl.textContent = message || "";
    sessionStatusEl.textContent = message || "";
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

  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "#";
    } catch (_err) {
      return "#";
    }
  }

  function pageUrl(id) {
    return new URL("sablonas-viskas.html?slug=" + encodeURIComponent(id), cfg().PUBLIC_SITE_URL || window.location.href).href;
  }

  function qrUrl(id) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/qr-code?data=" + encodeURIComponent(pageUrl(id));
  }

  function shortId(value) {
    return String(value || "").slice(0, 8).toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "–";
    try {
      return new Intl.DateTimeFormat("lt-LT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch (_err) {
      return String(value);
    }
  }

  function dateTimeLocal(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function profileFor(id) {
    return cache.find(function (row) { return row.id === id; }) || null;
  }

  function productName(value) {
    if (value === "asa") return "ASA 3D spausdinta QR atminimo lentelė";
    if (value === "steel") return "Graviruota plieno QR atminimo lentelė";
    return "Graviruota QR atminimo lentelė";
  }

  function orderCanBeDeleted(order) {
    return Boolean(order) &&
      !order.apmoketa &&
      order.payment_status !== "paid" &&
      order.payment_status !== "processing" &&
      !order.customer_approved_at;
  }

  function profileCanBeDeletedCompletely(profileId) {
    return orderCache
      .filter(function (order) { return order.profilis_id === profileId; })
      .every(orderCanBeDeleted);
  }

  function updateOverview() {
    var activeShipments = orderCache.filter(function (row) {
      return row.delivery_method === "pastomatas" && ["pristatyta", "atšaukta"].indexOf(row.shipping_status) === -1;
    }).length;
    var openServices = serviceRequestCache.filter(function (row) {
      return ["atlikta", "atsaukta"].indexOf(row.statusas) === -1;
    }).length;
    totalOrdersEl.textContent = orderCache.length;
    unpaidOrdersEl.textContent = orderCache.filter(function (row) { return !row.apmoketa; }).length + " neapmokėta";
    totalProfilesEl.textContent = cache.length;
    activeShipmentsEl.textContent = activeShipments;
    serviceCountEl.textContent = serviceRequestCache.length;
    openServicesEl.textContent = openServices + " neužbaigta";
    productionCountEl.textContent = productionCache.filter(function (row) { return row.status !== "completed" && row.status !== "cancelled"; }).length;
    productionReadyEl.textContent = productionCache.filter(function (row) { return row.status === "ready_to_ship"; }).length + " paruošta siųsti";
    memoryCountEl.textContent = memoryCache.length;
    pendingMemoriesEl.textContent = memoryCache.filter(function (row) { return row.status === "pending"; }).length + " laukia peržiūros";
  }

  async function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  async function supabaseJson(url, options) {
    var res = await fetch(url, Object.assign({
      headers: AtminimasAuth.headers(false)
    }, options || {}));
    if (!res.ok) {
      var text = await res.text();
      throw new Error("Supabase: " + res.status + " " + text);
    }
    if (res.status === 204) return null;
    var raw = await res.text();
    return raw ? JSON.parse(raw) : null;
  }

  async function deleteAdminProfile(profileId) {
    var response = await fetch(functionUrl("profile-manage"), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify({ action: "delete", profile_id: profileId })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Nepavyko ištrinti įrašo.");
    return data;
  }

  async function deleteAdminOrder(orderId) {
    var response = await fetch(functionUrl("profile-manage"), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify({ action: "delete_order", order_id: orderId })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Nepavyko ištrinti užsakymo.");
    return data;
  }

  async function handleAdminDelete(event) {
    var button = event.target.closest("[data-delete-admin-profile]");
    if (!button) return false;
    var profileId = button.dataset.deleteAdminProfile;
    var label = button.dataset.deleteLabel || profileId;
    var fullDelete = button.dataset.deleteMode === "full";
    var question = fullDelete
      ? "Ar tikrai ištrinti „" + label + "“? Bus pašalintas atminimo puslapis, neapmokėtas užsakymas, siuntimo įrašas ir įkelti failai. Šio veiksmo atšaukti negalima."
      : "Ar tikrai pašalinti „" + label + "“ puslapį? Apmokėto užsakymo apskaitos duomenys bus išsaugoti, tačiau pats atminimo puslapis ir jo failai bus pašalinti.";
    if (!window.confirm(question)) return true;

    button.disabled = true;
    setStatus("Įrašas trinamas...");
    try {
      var result = await deleteAdminProfile(profileId);
      await loadAdmin();
      setStatus(result.retained_order
        ? "Atminimo puslapis pašalintas. Apmokėto užsakymo apskaitos duomenys palikti."
        : "Atminimo puslapis, užsakymas ir siuntimo įrašas ištrinti.");
    } catch (error) {
      setStatus(error.message || "Nepavyko ištrinti įrašo.");
      button.disabled = false;
    }
    return true;
  }

  async function handleAdminOrderDelete(event) {
    var button = event.target.closest("[data-delete-admin-order]");
    if (!button) return false;
    var orderId = button.dataset.deleteAdminOrder;
    var label = button.dataset.deleteLabel || ("#" + shortId(orderId));
    if (!window.confirm("Ar tikrai ištrinti " + label + "? Atminimo puslapis liks, tačiau užsakymo ir jo siuntimo įrašų atkurti nebebus galima.")) return true;

    button.disabled = true;
    setStatus("Užsakymas trinamas...");
    try {
      await deleteAdminOrder(orderId);
      await loadOrders();
      await loadProduction();
      await loadAutomation();
      await loadShipments();
      render();
      setStatus("Užsakymas ir jo siuntimo įrašas ištrinti. Atminimo puslapis paliktas.");
    } catch (error) {
      setStatus(error.message || "Nepavyko ištrinti užsakymo.");
      button.disabled = false;
    }
    return true;
  }

  function render() {
    var q = (searchInput.value || "").toLowerCase().trim();
    var rows = cache.filter(function (row) {
      if (row.statusas === "atsaukta") return false;
      var text = [row.id, row.vardas, row.pavarde, row.statusas, row.epitafija].join(" ").toLowerCase();
      return !q || text.indexOf(q) !== -1;
    });

    rowsEl.innerHTML = rows.map(function (row) {
      var name = [row.vardas, row.pavarde].filter(Boolean).join(" ") || row.id;
      var publicPath = "sablonas-viskas.html?slug=" + encodeURIComponent(row.id);
      var fullUrl = pageUrl(row.id);
      var qrImage = qrUrl(row.id);
      var fullDelete = profileCanBeDeletedCompletely(row.id);
      return (
        "<tr data-id='" + html(row.id) + "'>" +
          "<td><strong>" + html(name) + "</strong><br><span class='muted'>" + html(row.id) + "</span></td>" +
          "<td>" + html([row.gimimo_data, row.mirties_data].filter(Boolean).join(" - ") || "--") + "</td>" +
          "<td><select data-field='statusas'>" +
            ["laukiama", "patvirtinta", "apmoketa", "atlikta", "atsaukta"].map(function (s) {
              return "<option value='" + s + "' " + ((row.statusas || "laukiama") === s ? "selected" : "") + ">" + s + "</option>";
            }).join("") +
          "</select></td>" +
          "<td><div class='actions admin-actions'>" +
            "<a class='button button--ghost' href='" + publicPath + "'>Atidaryti</a>" +
            "<a class='button button--ghost' href='" + qrImage + "' download='qr-" + html(row.id) + ".png'>QR kodas</a>" +
            "<button class='button button--ghost' type='button' data-copy-url='" + html(fullUrl) + "'>Kopijuoti URL</button>" +
            "<button class='button' type='button' data-save='" + html(row.id) + "'>Išsaugoti</button>" +
            "<button class='button button--danger' type='button' data-delete-admin-profile='" + html(row.id) + "' data-delete-label='" + html(name) + "' data-delete-mode='" + (fullDelete ? "full" : "retain") + "'>Ištrinti puslapį</button>" +
          "</div></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='5'>Įrašų nėra.</td></tr>";
  }

  function renderOrders() {
    var q = (orderSearch.value || "").toLowerCase().trim();
    var rows = orderCache.filter(function (order) {
      var profile = profileFor(order.profilis_id);
      var customer = profile ? [profile.vardas, profile.pavarde].filter(Boolean).join(" ") : "";
      var text = [order.id, order.profilis_id, customer, order.product_type, order.busena, order.recipient_name, order.recipient_email].join(" ").toLowerCase();
      return !q || text.indexOf(q) !== -1;
    });

    orderRows.innerHTML = rows.map(function (order) {
      var profile = profileFor(order.profilis_id);
      var customer = profile ? [profile.vardas, profile.pavarde].filter(Boolean).join(" ") : "Nežinomas klientas";
      var paymentClass = order.apmoketa ? "admin-badge--success" : "admin-badge--warning";
      var paymentText = order.apmoketa ? "Apmokėta" : "Neapmokėta";
      var delivery = order.delivery_method === "pastomatas"
        ? [order.carrier, order.city, order.parcel_terminal].filter(Boolean).join(" · ") || "Paštomatas dar nepasirinktas"
        : "Be pristatymo";
      var publicPath = "sablonas-viskas.html?slug=" + encodeURIComponent(order.profilis_id);
      var deleteAction = orderCanBeDeleted(order)
        ? "<button class='button button--danger' type='button' data-delete-admin-order='" + html(order.id) + "' data-delete-label='užsakymą #" + html(shortId(order.id)) + "'>Ištrinti užsakymą</button>"
        : "";
      return (
        "<tr>" +
          "<td><strong>#" + html(shortId(order.id)) + "</strong><br>" + html(customer) + "<br><span class='muted'>" + html(order.profilis_id) + "</span></td>" +
          "<td>" + html(productName(order.product_type)) + "<br><span class='admin-badge'>" + html(order.busena || "sukurtas") + "</span></td>" +
          "<td>" + html(formatDate(order.created_at)) + "</td>" +
          "<td><span class='admin-badge " + paymentClass + "'>" + paymentText + "</span>" + (order.payment_provider ? "<br><span class='muted'>" + html(order.payment_provider) + "</span>" : "") + "</td>" +
          "<td>" + html(delivery) + "<br><span class='muted'>" + html(order.shipping_status || "–") + "</span></td>" +
          "<td><div class='actions admin-actions'><a class='button button--ghost' href='" + publicPath + "'>Atidaryti puslapį</a>" + deleteAction + "</div></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='6'>Užsakymų nėra.</td></tr>";
  }

  async function loadOrders() {
    orderCache = await supabaseJson(restUrl(
      "uzsakymai",
      "select=id,profilis_id,puslapio_url,product_type,busena,apmoketa,payment_status,customer_approved_at,delivery_method,carrier,city,parcel_terminal,recipient_name,recipient_phone,recipient_email,shipping_status,tracking_number,payment_provider,payment_reference,created_at&order=created_at.desc"
    ));
    ordersPanel.hidden = false;
    renderOrders();
    updateOverview();
  }

  function centsToInput(value) {
    return value == null ? "" : (Number(value) / 100).toFixed(2);
  }

  function inputToCents(value) {
    var text = String(value || "").trim().replace(",", ".");
    if (!text) return null;
    var number = Number(text);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  }

  async function loadBusinessSettings() {
    var results = await Promise.all([
      supabaseJson(restUrl("business_profile", "select=*&singleton=eq.true&limit=1")),
      supabaseJson(restUrl("product_catalog", "select=id,price_cents,enabled&order=id")),
      supabaseJson(restUrl("shipping_catalog", "select=carrier,price_cents,enabled&order=carrier"))
    ]);
    var business = results[0][0] || {};
    ["legal_name", "activity_form", "registration_code", "vat_code", "address", "email", "phone", "invoice_document_type"].forEach(function (name) {
      if (businessSettingsForm.elements[name]) businessSettingsForm.elements[name].value = business[name] || (name === "invoice_document_type" ? "payment_confirmation" : "");
    });
    businessSettingsForm.elements.ready_for_invoicing.checked = !!business.ready_for_invoicing;
    var products = Object.fromEntries(results[1].map(function (row) { return [row.id, row]; }));
    var shipping = Object.fromEntries(results[2].map(function (row) { return [row.carrier, row]; }));
    businessSettingsForm.elements.metal_price.value = centsToInput(products.metal && products.metal.price_cents);
    businessSettingsForm.elements.steel_price.value = centsToInput(products.steel && products.steel.price_cents);
    businessSettingsForm.elements.asa_price.value = centsToInput(products.asa && products.asa.price_cents);
    businessSettingsForm.elements.omniva_price.value = centsToInput(shipping.Omniva && shipping.Omniva.price_cents);
    businessSettingsForm.elements.lp_express_price.value = centsToInput(shipping["LP Express"] && shipping["LP Express"].price_cents);
    businessSettingsForm.elements.dpd_price.value = centsToInput(shipping.DPD && shipping.DPD.price_cents);
    businessSettingsPanel.hidden = false;
  }

  async function saveBusinessSettings() {
    var values = Object.fromEntries(new FormData(businessSettingsForm).entries());
    var businessPayload = {
      legal_name: values.legal_name || null,
      activity_form: values.activity_form || null,
      registration_code: values.registration_code || null,
      vat_code: values.vat_code || null,
      address: values.address || null,
      email: values.email || null,
      phone: values.phone || null,
      invoice_document_type: values.invoice_document_type || "payment_confirmation",
      ready_for_invoicing: values.ready_for_invoicing === "on",
      updated_at: new Date().toISOString()
    };
    await supabaseJson(restUrl("business_profile", "singleton=eq.true"), {
      method: "PATCH", headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }), body: JSON.stringify(businessPayload)
    });
    var prices = [
      ["product_catalog", "id", "metal", inputToCents(values.metal_price)],
      ["product_catalog", "id", "steel", inputToCents(values.steel_price)],
      ["product_catalog", "id", "asa", inputToCents(values.asa_price)],
      ["shipping_catalog", "carrier", "Omniva", inputToCents(values.omniva_price)],
      ["shipping_catalog", "carrier", "LP Express", inputToCents(values.lp_express_price)],
      ["shipping_catalog", "carrier", "DPD", inputToCents(values.dpd_price)]
    ];
    await Promise.all(prices.map(function (item) {
      return supabaseJson(restUrl(item[0], item[1] + "=eq." + encodeURIComponent(item[2])), {
        method: "PATCH",
        headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
        body: JSON.stringify({ price_cents: item[3], enabled: item[3] != null, updated_at: new Date().toISOString() })
      });
    }));
    businessSettingsStatus.textContent = "Rekvizitai ir kainos išsaugoti.";
    await loadBusinessSettings();
  }

  function renderProduction() {
    productionRows.innerHTML = productionCache.map(function (job) {
      var order = orderCache.find(function (item) { return item.id === job.order_id; });
      var profile = order && profileFor(order.profilis_id);
      var name = profile ? [profile.vardas, profile.pavarde].filter(Boolean).join(" ") : (order ? order.profilis_id : job.order_id);
      var statuses = ["queued", "qr_ready", "in_production", "quality_check", "ready_to_ship", "completed", "cancelled"];
      return "<tr data-production-id='" + html(job.id) + "' data-order-id='" + html(job.order_id) + "'>" +
        "<td><strong>" + html(name) + "</strong><br><span class='muted'>#" + html(shortId(job.order_id)) + "</span></td>" +
        "<td><select data-production-status>" + statuses.map(function (status) { return "<option value='" + status + "' " + (job.status === status ? "selected" : "") + ">" + status + "</option>"; }).join("") + "</select></td>" +
        "<td><input type='date' data-production-date value='" + html(job.scheduled_for || "") + "'></td>" +
        "<td>" + (job.qr_svg_path ? "<button class='button button--ghost' type='button' data-download-document='qr'>Atsisiųsti QR</button>" : "<span class='muted'>Ruošiamas</span>") + "</td>" +
        "<td><textarea data-production-note rows='2' maxlength='3000'>" + html(job.admin_note || "") + "</textarea></td>" +
        "<td><button class='button' type='button' data-save-production>Išsaugoti</button></td></tr>";
    }).join("") || "<tr><td colspan='6'>Gamybos darbų nėra.</td></tr>";
  }

  async function loadProduction() {
    productionCache = await supabaseJson(restUrl("production_jobs", "select=id,order_id,status,qr_svg_path,qr_pdf_path,scheduled_for,admin_note,customer_approved_at,created_at,updated_at&order=created_at.asc"));
    productionPanel.hidden = false;
    renderProduction();
    updateOverview();
  }

  async function saveProduction(tr) {
    var id = tr.dataset.productionId;
    await supabaseJson(restUrl("production_jobs", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({
        status: tr.querySelector("[data-production-status]").value,
        scheduled_for: tr.querySelector("[data-production-date]").value || null,
        admin_note: tr.querySelector("[data-production-note]").value.trim() || null,
        updated_at: new Date().toISOString()
      })
    });
    setStatus("Gamybos darbas atnaujintas.");
    await loadProduction();
  }

  function renderAutomation() {
    automationRows.innerHTML = automationCache.map(function (event) {
      return "<tr data-automation-id='" + html(event.id) + "'><td><strong>" + html(event.event_type) + "</strong><br><span class='muted'>" + html(event.event_key) + "</span></td>" +
        "<td><span class='admin-badge admin-badge--warning'>" + html(event.status) + "</span></td>" +
        "<td>" + html(event.attempts + " / " + event.max_attempts) + "</td>" +
        "<td>" + html(event.last_error || "–") + "</td>" +
        "<td><button class='button button--ghost' type='button' data-retry-automation>Bandyti dar kartą</button></td></tr>";
    }).join("") || "<tr><td colspan='5'>Automatikos klaidų nėra.</td></tr>";
  }

  async function loadAutomation() {
    automationCache = await supabaseJson(restUrl("automation_events", "select=id,event_key,event_type,status,attempts,max_attempts,last_error,created_at&status=in.(failed,blocked)&order=created_at.desc&limit=100"));
    automationPanel.hidden = false;
    renderAutomation();
  }

  async function retryAutomation(id) {
    await supabaseJson(restUrl("automation_events", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ status: "pending", available_at: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString() })
    });
    setStatus("Automatikos užduotis grąžinta į eilę.");
    await loadAutomation();
  }

  async function downloadDocument(orderId, type) {
    var url = cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/document-download?order=" + encodeURIComponent(orderId) + "&type=" + encodeURIComponent(type);
    var response = await fetch(url, { headers: AtminimasAuth.headers(false) });
    if (!response.ok) throw new Error(await response.text());
    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = type + "-" + shortId(orderId) + (type === "qr" ? ".svg" : ".pdf");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function renderShipments() {
    var visibleShipments = shipmentCache.filter(function (order) {
      return order.shipping_status !== "atšaukta";
    });
    shipmentRows.innerHTML = visibleShipments.map(function (order) {
      var recipient = order.recipient_name || "Pristatymo duomenų nėra";
      var destination = [order.carrier, order.city, order.parcel_terminal].filter(Boolean).join(" · ") || "--";
      var deleteAction = orderCanBeDeleted(order)
        ? "<button class='button button--danger' type='button' data-delete-admin-order='" + html(order.id) + "' data-delete-label='užsakymą #" + html(shortId(order.id)) + "'>Ištrinti užsakymą</button>"
        : "";
      return (
        "<tr data-shipment-id='" + html(order.id) + "'>" +
          "<td><strong>" + html(recipient) + "</strong><br><span class='muted'>" + html(order.id) + "</span><br>Produktas: " + html(productName(order.product_type)) + "<br>" + html(order.recipient_phone || "") + "<br>" + html(order.recipient_email || "") + "</td>" +
          "<td>" + html(destination) + "</td>" +
          "<td><select data-shipping-status>" + ["laukiama_duomenu", "paruošti", "išsiųsta", "pristatyta", "atšaukta"].map(function (value) {
            return "<option value='" + value + "' " + ((order.shipping_status || "laukiama_duomenu") === value ? "selected" : "") + ">" + value + "</option>";
          }).join("") + "</select></td>" +
          "<td><input type='text' data-tracking-number value='" + html(order.tracking_number || "") + "' maxlength='160' placeholder='Sekimo numeris'></td>" +
          "<td><div class='actions admin-actions'><button class='button' type='button' data-save-shipment='" + html(order.id) + "'>Išsaugoti</button>" + deleteAction + "</div></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='5'>Siuntimų nėra.</td></tr>";
  }

  async function loadShipments() {
    shipmentCache = (await supabaseJson(restUrl(
      "uzsakymai",
      "select=id,profilis_id,product_type,delivery_method,recipient_name,recipient_phone,recipient_email,carrier,city,parcel_terminal,shipping_status,tracking_number,apmoketa,payment_status,customer_approved_at,created_at&order=created_at.desc"
    ))).filter(function (order) { return order.delivery_method === "pastomatas"; });
    shipmentsPanel.hidden = false;
    renderShipments();
  }

  function serviceName(value) {
    return { zvakes: "Žvakių uždegimas", geles: "Gėlių padėjimas", kapu_tvarkymas: "Kapo sutvarkymas" }[value] || value;
  }

  function renderServiceRequests() {
    serviceRequestRows.innerHTML = serviceRequestCache.map(function (row) {
      var services = (row.paslaugos || []).map(serviceName).join(" · ");
      var details = [
        row.geliu_pageidavimai ? "Gėlės: " + row.geliu_pageidavimai : "",
        row.zvakiu_pageidavimai ? "Žvakės: " + row.zvakiu_pageidavimai : "",
        row.tvarkymo_pageidavimai ? "Tvarkymas: " + row.tvarkymo_pageidavimai : "",
        row.papildoma_informacija ? "Papildomai: " + row.papildoma_informacija : ""
      ].filter(Boolean).join("\n");
      return (
        "<tr data-service-request-id='" + html(row.id) + "'>" +
          "<td><strong>" + html(row.mirusiojo_vardas) + "</strong><br>" + html(row.kapiniu_pavadinimas) + "<br><span class='muted'>" + html(row.kapo_vieta) + "</span></td>" +
          "<td><strong>" + html(services) + "</strong><br><span class='admin-preserve-lines'>" + html(details || "Papildomų pageidavimų nėra") + "</span></td>" +
          "<td><input type='datetime-local' data-service-scheduled value='" + html(dateTimeLocal(row.scheduled_for)) + "'></td>" +
          "<td><select data-service-status>" + ["gauta", "susisiekta", "vykdoma", "atlikta", "atsaukta"].map(function (value) {
            return "<option value='" + value + "' " + ((row.statusas || "gauta") === value ? "selected" : "") + ">" + value + "</option>";
          }).join("") + "</select><textarea data-service-note rows='3' maxlength='3000' placeholder='Administratoriaus pastaba'>" + html(row.admin_pastaba || "") + "</textarea></td>" +
          "<td><button class='button' type='button' data-save-service-request='" + html(row.id) + "'>Išsaugoti</button></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='5'>Paslaugų užklausų nėra.</td></tr>";
  }

  async function loadServiceRequests() {
    serviceRequestCache = await supabaseJson(restUrl(
      "paslaugu_uzklausos",
      "select=id,owner_id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,kapo_vieta,geliu_pageidavimai,zvakiu_pageidavimai,tvarkymo_pageidavimai,papildoma_informacija,statusas,admin_pastaba,scheduled_for,completed_at,created_at&order=created_at.desc"
    ));
    serviceRequestsPanel.hidden = false;
    renderServiceRequests();
    updateOverview();
  }

  function legalStatusControl(row) {
    return "<select data-legal-status>" + ["gauta", "nagrinejama", "uzbaigta", "atmesta"].map(function (value) {
      return "<option value='" + value + "' " + ((row.status || "gauta") === value ? "selected" : "") + ">" + value + "</option>";
    }).join("") + "</select><textarea data-decision-note rows='3' maxlength='3000' placeholder='Sprendimo motyvai'>" + html(row.decision_note || "") + "</textarea>";
  }

  function renderLegalRequests() {
    withdrawalRows.innerHTML = withdrawalCache.map(function (row) {
      return "<tr data-legal-table='atsisakymai' data-reference='" + html(row.reference_code) + "'><td><strong>" + html(row.reference_code) + "</strong><br>" + html(row.customer_name) + "<br>" + html(row.customer_email) + "</td><td>" + html(row.order_reference) + "<br>" + html(row.statement) + "</td><td>" + legalStatusControl(row) + "</td><td><button class='button' type='button' data-save-legal>Išsaugoti</button></td></tr>";
    }).join("") || "<tr><td colspan='4'>Prašymų nėra.</td></tr>";
    contentReportRows.innerHTML = contentReportCache.map(function (row) {
      return "<tr data-legal-table='turinio_pranesimai' data-reference='" + html(row.reference_code) + "'><td><strong>" + html(row.reference_code) + "</strong><br>" + html(row.reporter_email) + "</td><td><a href='" + html(safeUrl(row.content_url)) + "' target='_blank' rel='noopener'>Atidaryti turinį</a><br>" + html(row.reason) + "<br>" + html(row.explanation) + "</td><td>" + legalStatusControl(row) + "</td><td><button class='button' type='button' data-save-legal>Išsaugoti</button></td></tr>";
    }).join("") || "<tr><td colspan='4'>Pranešimų nėra.</td></tr>";
  }

  async function loadLegalRequests() {
    withdrawalCache = await supabaseJson(restUrl("atsisakymai", "select=reference_code,customer_name,customer_email,order_reference,statement,status,decision_note,created_at&order=created_at.desc"));
    contentReportCache = await supabaseJson(restUrl("turinio_pranesimai", "select=reference_code,reporter_email,content_url,reason,explanation,status,decision_note,created_at&order=created_at.desc"));
    legalRequestsPanel.hidden = false;
    renderLegalRequests();
  }

  function renderMemories() {
    memoryRows.innerHTML = memoryCache.map(function (row) {
      var profile = profileFor(row.profile_id);
      var profileName = profile ? [profile.vardas, profile.pavarde].filter(Boolean).join(" ") : row.profile_id;
      return "<tr data-memory-id='" + html(row.id) + "'>" +
        "<td><strong>" + html(profileName || row.profile_id) + "</strong><br><a href='sablonas-viskas.html?slug=" + encodeURIComponent(row.profile_id) + "' target='_blank' rel='noopener'>Atidaryti puslapį</a></td>" +
        "<td><strong>" + html(row.author_name) + "</strong><br><span class='admin-preserve-lines'>" + html(row.message) + "</span></td>" +
        "<td>" + html(formatDate(row.created_at)) + "</td>" +
        "<td><select data-memory-status>" + ["pending", "approved", "rejected"].map(function (status) {
          return "<option value='" + status + "' " + (row.status === status ? "selected" : "") + ">" + status + "</option>";
        }).join("") + "</select></td>" +
        "<td><button class='button' type='button' data-save-memory>Išsaugoti</button></td></tr>";
    }).join("") || "<tr><td colspan='5'>Prisiminimų nėra.</td></tr>";
  }

  async function loadMemories() {
    try {
      memoryCache = await supabaseJson(restUrl(
        "memorial_memories",
        "select=id,profile_id,author_name,message,status,moderated_at,created_at&order=created_at.desc&limit=300"
      ));
    } catch (error) {
      if (/404|PGRST205|schema cache/i.test(String(error && error.message))) {
        memoryCache = [];
        memoriesPanel.hidden = true;
        updateOverview();
        return;
      }
      throw error;
    }
    memoriesPanel.hidden = false;
    renderMemories();
    updateOverview();
  }

  async function loadAdmin() {
    setStatus("Tikrinamos administratoriaus teisės...");
    var me = await AtminimasAuth.user();
    var ok = me && await AtminimasAuth.isAdmin();
    if (!ok) {
      form.hidden = false;
      adminSession.hidden = true;
      overview.hidden = true;
      ordersPanel.hidden = true;
      panel.hidden = true;
      shipmentsPanel.hidden = true;
      serviceRequestsPanel.hidden = true;
      legalRequestsPanel.hidden = true;
      memoriesPanel.hidden = true;
      businessSettingsPanel.hidden = true;
      productionPanel.hidden = true;
      automationPanel.hidden = true;
      setStatus(me ? "Ši paskyra neturi administratoriaus teisių." : "Prisijunkite administratoriaus paskyra.");
      return;
    }

    form.hidden = true;
    adminSession.hidden = false;
    adminEmail.textContent = me.email || "";
    overview.hidden = false;
    panel.hidden = false;
    window.dispatchEvent(new CustomEvent("atminimas:admin-ready"));
    setStatus("Įkeliami administravimo duomenys...");
    cache = await supabaseJson(restUrl(
      "profiliai",
      "deleted_at=is.null&select=id,vardas,pavarde,gimimo_data,mirties_data,epitafija,aktyvus,apmoketa,statusas,created_at&order=created_at.desc"
    ));
    await loadOrders();
    await loadBusinessSettings();
    await loadProduction();
    await loadAutomation();
    await loadShipments();
    await loadServiceRequests();
    await loadLegalRequests();
    await loadMemories();
    updateOverview();
    setStatus("Administravimo duomenys atnaujinti.");
    render();
  }

  async function saveRow(id, tr) {
    var statusas = tr.querySelector("[data-field='statusas']").value;
    var saved = await supabaseJson(restUrl("profiliai", "id=eq." + encodeURIComponent(id) + "&select=id,statusas"), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=representation" }),
      body: JSON.stringify({ statusas: statusas })
    });
    if (!saved || !saved.length || saved[0].statusas !== statusas) {
      throw new Error("Būsena duomenų bazėje nebuvo pakeista. Atnaujinkite puslapį ir bandykite dar kartą.");
    }
    cache = cache.map(function (row) {
      if (row.id === id) row.statusas = saved[0].statusas;
      return row;
    });
    render();
    setStatus(statusas === "atsaukta" ? "Įrašas atšauktas ir paslėptas." : "Išsaugota: " + id);
  }

  async function saveShipment(id, tr) {
    var shippingStatus = tr.querySelector("[data-shipping-status]").value;
    var trackingNumber = tr.querySelector("[data-tracking-number]").value.trim();
    await supabaseJson(rpcUrl("admin_update_shipment"), {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ order_id: id, new_tracking_number: trackingNumber, new_shipping_status: shippingStatus })
    });
    await loadShipments();
    setStatus(shippingStatus === "atšaukta" ? "Siunta atšaukta ir paslėpta." : "Siunta išsaugota: " + id);
  }

  async function saveServiceRequest(id, tr) {
    var serviceStatus = tr.querySelector("[data-service-status]").value;
    var adminNote = tr.querySelector("[data-service-note]").value.trim();
    var scheduledValue = tr.querySelector("[data-service-scheduled]").value;
    var scheduledFor = scheduledValue ? new Date(scheduledValue).toISOString() : null;
    await supabaseJson(restUrl("paslaugu_uzklausos", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ statusas: serviceStatus, admin_pastaba: adminNote || null, scheduled_for: scheduledFor, updated_at: new Date().toISOString() })
    });
    setStatus("Paslaugos užklausa atnaujinta: " + id);
    await loadServiceRequests();
  }

  async function saveLegalRequest(tr) {
    var table = tr.dataset.legalTable;
    var reference = tr.dataset.reference;
    var status = tr.querySelector("[data-legal-status]").value;
    var decisionNote = tr.querySelector("[data-decision-note]").value.trim();
    await supabaseJson(restUrl(table, "reference_code=eq." + encodeURIComponent(reference)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ status: status, decision_note: decisionNote || null, decided_at: new Date().toISOString() })
    });
    setStatus("Prašymas atnaujintas: " + reference);
    await loadLegalRequests();
  }

  async function saveMemory(tr) {
    var id = tr.dataset.memoryId;
    var status = tr.querySelector("[data-memory-status]").value;
    await supabaseJson(restUrl("memorial_memories", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({
        status: status,
        moderated_at: new Date().toISOString(),
        moderated_by: AtminimasAuth.userId()
      })
    });
    setStatus("Prisiminimo būsena atnaujinta.");
    await loadMemories();
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    setStatus("Jungiamasi...");
    try {
      await AtminimasAuth.signIn(data.email, data.password);
      await loadAdmin();
    } catch (err) {
      setStatus(err.message || "Nepavyko prisijungti.");
    }
  });

  rowsEl.addEventListener("click", function (event) {
    if (event.target.closest("[data-delete-admin-profile]")) {
      handleAdminDelete(event);
      return;
    }
    var copyUrlButton = event.target.closest("[data-copy-url]");
    if (copyUrlButton) {
      copyText(copyUrlButton.dataset.copyUrl).then(function () {
        setStatus("Puslapio URL nukopijuotas.");
      }).catch(function () {
        setStatus("Nepavyko nukopijuoti URL.");
      });
      return;
    }

    var button = event.target.closest("[data-save]");
    if (!button) return;
    var tr = button.closest("tr");
    button.disabled = true;
    saveRow(button.dataset.save, tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti.");
      button.disabled = false;
    });
  });

  orderRows.addEventListener("click", function (event) {
    if (event.target.closest("[data-delete-admin-order]")) handleAdminOrderDelete(event);
  });

  shipmentRows.addEventListener("click", function (event) {
    if (event.target.closest("[data-delete-admin-order]")) {
      handleAdminOrderDelete(event);
      return;
    }
    var button = event.target.closest("[data-save-shipment]");
    if (!button) return;
    var tr = button.closest("tr");
    button.disabled = true;
    saveShipment(button.dataset.saveShipment, tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti siuntos.");
      button.disabled = false;
    });
  });

  serviceRequestRows.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-service-request]");
    if (!button) return;
    var tr = button.closest("tr");
    button.disabled = true;
    saveServiceRequest(button.dataset.saveServiceRequest, tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti paslaugos užklausos.");
      button.disabled = false;
    });
  });

  legalRequestsPanel.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-legal]");
    if (!button) return;
    var tr = button.closest("tr[data-legal-table]");
    button.disabled = true;
    saveLegalRequest(tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti sprendimo.");
      button.disabled = false;
    });
  });

  memoryRows.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-memory]");
    if (!button) return;
    var tr = button.closest("tr[data-memory-id]");
    button.disabled = true;
    saveMemory(tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti prisiminimo būsenos.");
    }).finally(function () { button.disabled = false; });
  });

  businessSettingsForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var button = businessSettingsForm.querySelector("button[type='submit']");
    button.disabled = true;
    businessSettingsStatus.textContent = "Nustatymai saugomi...";
    saveBusinessSettings().catch(function (err) {
      businessSettingsStatus.textContent = err.message || "Nepavyko išsaugoti nustatymų.";
    }).finally(function () { button.disabled = false; });
  });

  productionRows.addEventListener("click", function (event) {
    var tr = event.target.closest("tr[data-production-id]");
    if (!tr) return;
    var download = event.target.closest("[data-download-document]");
    if (download) {
      download.disabled = true;
      downloadDocument(tr.dataset.orderId, download.dataset.downloadDocument).catch(function (err) {
        setStatus(err.message || "Nepavyko atsisiųsti failo.");
      }).finally(function () { download.disabled = false; });
      return;
    }
    var save = event.target.closest("[data-save-production]");
    if (!save) return;
    save.disabled = true;
    saveProduction(tr).catch(function (err) {
      setStatus(err.message || "Nepavyko išsaugoti gamybos darbo.");
    }).finally(function () { save.disabled = false; });
  });

  automationRows.addEventListener("click", function (event) {
    var button = event.target.closest("[data-retry-automation]");
    if (!button) return;
    var tr = button.closest("tr[data-automation-id]");
    button.disabled = true;
    retryAutomation(tr.dataset.automationId).catch(function (err) {
      setStatus(err.message || "Nepavyko pakartoti užduoties.");
    }).finally(function () { button.disabled = false; });
  });

  orderSearch.addEventListener("input", renderOrders);
  ordersRefresh.addEventListener("click", function () {
    loadOrders().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti užsakymų."); });
  });
  productionRefresh.addEventListener("click", function () {
    loadProduction().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti gamybos eilės."); });
  });
  automationRefresh.addEventListener("click", function () {
    loadAutomation().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti automatikos klaidų."); });
  });
  searchInput.addEventListener("input", render);
  refreshButton.addEventListener("click", function () {
    loadAdmin().catch(function (err) {
      setStatus(err.message || "Nepavyko atnaujinti.");
    });
  });
  shipmentsRefresh.addEventListener("click", function () {
    loadShipments().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti siuntimų."); });
  });
  serviceRequestsRefresh.addEventListener("click", function () {
    loadServiceRequests().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti paslaugų užklausų."); });
  });
  legalRequestsRefresh.addEventListener("click", function () {
    loadLegalRequests().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti prašymų."); });
  });
  memoriesRefresh.addEventListener("click", function () {
    loadMemories().catch(function (err) { setStatus(err.message || "Nepavyko atnaujinti prisiminimų."); });
  });
  logoutButton.addEventListener("click", function () {
    AtminimasAuth.signOut();
    form.hidden = false;
    adminSession.hidden = true;
    overview.hidden = true;
    ordersPanel.hidden = true;
    panel.hidden = true;
    shipmentsPanel.hidden = true;
    serviceRequestsPanel.hidden = true;
    legalRequestsPanel.hidden = true;
    memoriesPanel.hidden = true;
    businessSettingsPanel.hidden = true;
    productionPanel.hidden = true;
    automationPanel.hidden = true;
    setStatus("Atsijungta.");
  });

  if (AtminimasAuth.accessToken()) {
    loadAdmin().catch(function (err) {
      setStatus(err.message || "Nepavyko patikrinti administratoriaus teisių.");
    });
  }
})();


