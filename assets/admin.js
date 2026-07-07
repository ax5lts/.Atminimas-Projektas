(function () {
  var form = document.getElementById("admin-auth-form");
  var statusEl = document.getElementById("admin-status");
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
  var serviceRequestsPanel = document.getElementById("admin-service-requests");
  var serviceRequestsRefresh = document.getElementById("service-requests-refresh");
  var serviceRequestRows = document.getElementById("service-request-rows");
  var cache = [];
  var shipmentCache = [];
  var withdrawalCache = [];
  var contentReportCache = [];
  var serviceRequestCache = [];

  function cfg() {
    return window.ATMINIMAS_CONFIG;
  }

  function restUrl(table, query) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table) + "?" + query;
  }

  function rpcUrl(name) {
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + encodeURIComponent(name);
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

  function render() {
    var q = (searchInput.value || "").toLowerCase().trim();
    var rows = cache.filter(function (row) {
      var text = [row.id, row.vardas, row.pavarde, row.statusas, row.epitafija].join(" ").toLowerCase();
      return !q || text.indexOf(q) !== -1;
    });

    rowsEl.innerHTML = rows.map(function (row) {
      var name = [row.vardas, row.pavarde].filter(Boolean).join(" ") || row.id;
      var publicPath = "sablonas-viskas.html?slug=" + encodeURIComponent(row.id);
      var fullUrl = pageUrl(row.id);
      var qrImage = qrUrl(row.id);
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
          "</div></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='5'>Įrašų nėra.</td></tr>";
  }

  function renderShipments() {
    shipmentRows.innerHTML = shipmentCache.map(function (order) {
      var recipient = order.recipient_name || "Pristatymo duomenų nėra";
      var destination = [order.carrier, order.city, order.parcel_terminal].filter(Boolean).join(" · ") || "--";
      return (
        "<tr data-shipment-id='" + html(order.id) + "'>" +
          "<td><strong>" + html(recipient) + "</strong><br><span class='muted'>" + html(order.id) + "</span><br>" + html(order.recipient_phone || "") + "<br>" + html(order.recipient_email || "") + "</td>" +
          "<td>" + html(destination) + "</td>" +
          "<td><select data-shipping-status>" + ["laukiama_duomenu", "paruošti", "išsiųsta", "pristatyta", "atšaukta"].map(function (value) {
            return "<option value='" + value + "' " + ((order.shipping_status || "laukiama_duomenu") === value ? "selected" : "") + ">" + value + "</option>";
          }).join("") + "</select></td>" +
          "<td><input type='text' data-tracking-number value='" + html(order.tracking_number || "") + "' maxlength='160' placeholder='Sekimo numeris'></td>" +
          "<td><button class='button' type='button' data-save-shipment='" + html(order.id) + "'>Išsaugoti</button></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='5'>Siuntimų nėra.</td></tr>";
  }

  async function loadShipments() {
    shipmentCache = await supabaseJson(restUrl(
      "uzsakymai",
      "select=id,profilis_id,recipient_name,recipient_phone,recipient_email,carrier,city,parcel_terminal,shipping_status,tracking_number,apmoketa,created_at&order=created_at.desc"
    ));
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
          "<td><select data-service-status>" + ["gauta", "susisiekta", "vykdoma", "atlikta", "atsaukta"].map(function (value) {
            return "<option value='" + value + "' " + ((row.statusas || "gauta") === value ? "selected" : "") + ">" + value + "</option>";
          }).join("") + "</select><textarea data-service-note rows='3' maxlength='3000' placeholder='Administratoriaus pastaba'>" + html(row.admin_pastaba || "") + "</textarea></td>" +
          "<td><button class='button' type='button' data-save-service-request='" + html(row.id) + "'>Išsaugoti</button></td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='4'>Paslaugų užklausų nėra.</td></tr>";
  }

  async function loadServiceRequests() {
    serviceRequestCache = await supabaseJson(restUrl(
      "paslaugu_uzklausos",
      "select=id,owner_id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,kapo_vieta,geliu_pageidavimai,zvakiu_pageidavimai,tvarkymo_pageidavimai,papildoma_informacija,statusas,admin_pastaba,created_at&order=created_at.desc"
    ));
    serviceRequestsPanel.hidden = false;
    renderServiceRequests();
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

  async function loadAdmin() {
    statusEl.textContent = "Tikrinamos admin teisės...";
    var ok = await AtminimasAuth.isAdmin();
    if (!ok) {
      panel.hidden = true;
      shipmentsPanel.hidden = true;
      serviceRequestsPanel.hidden = true;
      legalRequestsPanel.hidden = true;
      logoutButton.hidden = !AtminimasAuth.accessToken();
      statusEl.textContent = "Prisijungta paskyra neturi admin rolės.";
      return;
    }

    logoutButton.hidden = false;
    panel.hidden = false;
    statusEl.textContent = "Įkeliami puslapiai...";
    cache = await supabaseJson(restUrl(
      "profiliai",
      "select=id,vardas,pavarde,gimimo_data,mirties_data,epitafija,aktyvus,apmoketa,statusas,created_at&order=created_at.desc"
    ));
    await loadShipments();
    await loadServiceRequests();
    await loadLegalRequests();
    statusEl.textContent = "Įkelta: " + cache.length;
    render();
  }

  async function saveRow(id, tr) {
    var statusas = tr.querySelector("[data-field='statusas']").value;
    await supabaseJson(restUrl("profiliai", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ statusas: statusas })
    });
    statusEl.textContent = "Išsaugota: " + id;
    await loadAdmin();
  }

  async function saveShipment(id, tr) {
    var shippingStatus = tr.querySelector("[data-shipping-status]").value;
    var trackingNumber = tr.querySelector("[data-tracking-number]").value.trim();
    await supabaseJson(rpcUrl("admin_update_shipment"), {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ order_id: id, new_tracking_number: trackingNumber, new_shipping_status: shippingStatus })
    });
    statusEl.textContent = "Siunta atnaujinta: " + id;
    await loadShipments();
  }

  async function saveServiceRequest(id, tr) {
    var serviceStatus = tr.querySelector("[data-service-status]").value;
    var adminNote = tr.querySelector("[data-service-note]").value.trim();
    await supabaseJson(restUrl("paslaugu_uzklausos", "id=eq." + encodeURIComponent(id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ statusas: serviceStatus, admin_pastaba: adminNote || null, updated_at: new Date().toISOString() })
    });
    statusEl.textContent = "Paslaugos užklausa atnaujinta: " + id;
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
    statusEl.textContent = "Prašymas atnaujintas: " + reference;
    await loadLegalRequests();
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    statusEl.textContent = "Jungiamasi...";
    try {
      await AtminimasAuth.signIn(data.email, data.password);
      await loadAdmin();
    } catch (err) {
      statusEl.textContent = err.message || "Nepavyko prisijungti.";
    }
  });

  rowsEl.addEventListener("click", function (event) {
    var copyUrlButton = event.target.closest("[data-copy-url]");
    if (copyUrlButton) {
      copyText(copyUrlButton.dataset.copyUrl).then(function () {
        statusEl.textContent = "Puslapio URL nukopijuotas.";
      }).catch(function () {
        statusEl.textContent = "Nepavyko nukopijuoti URL.";
      });
      return;
    }

    var button = event.target.closest("[data-save]");
    if (!button) return;
    var tr = button.closest("tr");
    saveRow(button.dataset.save, tr).catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko išsaugoti.";
    });
  });

  shipmentRows.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-shipment]");
    if (!button) return;
    var tr = button.closest("tr");
    button.disabled = true;
    saveShipment(button.dataset.saveShipment, tr).catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko išsaugoti siuntos.";
      button.disabled = false;
    });
  });

  serviceRequestRows.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-service-request]");
    if (!button) return;
    var tr = button.closest("tr");
    button.disabled = true;
    saveServiceRequest(button.dataset.saveServiceRequest, tr).catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko išsaugoti paslaugos užklausos.";
      button.disabled = false;
    });
  });

  legalRequestsPanel.addEventListener("click", function (event) {
    var button = event.target.closest("[data-save-legal]");
    if (!button) return;
    var tr = button.closest("tr[data-legal-table]");
    button.disabled = true;
    saveLegalRequest(tr).catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko išsaugoti sprendimo.";
      button.disabled = false;
    });
  });

  searchInput.addEventListener("input", render);
  refreshButton.addEventListener("click", function () {
    loadAdmin().catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko atnaujinti.";
    });
  });
  shipmentsRefresh.addEventListener("click", function () {
    loadShipments().catch(function (err) { statusEl.textContent = err.message || "Nepavyko atnaujinti siuntimų."; });
  });
  serviceRequestsRefresh.addEventListener("click", function () {
    loadServiceRequests().catch(function (err) { statusEl.textContent = err.message || "Nepavyko atnaujinti paslaugų užklausų."; });
  });
  legalRequestsRefresh.addEventListener("click", function () {
    loadLegalRequests().catch(function (err) { statusEl.textContent = err.message || "Nepavyko atnaujinti prašymų."; });
  });
  logoutButton.addEventListener("click", function () {
    AtminimasAuth.signOut();
    panel.hidden = true;
    shipmentsPanel.hidden = true;
    serviceRequestsPanel.hidden = true;
    legalRequestsPanel.hidden = true;
    logoutButton.hidden = true;
    statusEl.textContent = "Atsijungta.";
  });

  if (AtminimasAuth.accessToken()) {
    loadAdmin().catch(function (err) {
      statusEl.textContent = err.message || "Nepavyko patikrinti admin teisių.";
    });
  }
})();


