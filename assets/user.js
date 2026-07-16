(function () {
  var form = document.getElementById("user-auth-form");
  var statusEl = document.getElementById("user-status");
  var listEl = document.getElementById("user-pages");
  var logoutButton = document.getElementById("user-logout");
  var createButton = document.getElementById("user-create");
  var guestActions = document.getElementById("user-guest-actions");
  var productKey = "atminimas.selected-product.v1";

  function selectedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(productKey);
    var value = requested === "asa" || requested === "metal" ? requested : stored;
    value = value === "asa" ? "asa" : "metal";
    sessionStorage.setItem(productKey, value);
    return value;
  }

  function productName(value) {
    return value === "asa" ? "ASA 3D spausdinta QR atminimo lentelė" : "Graviruota QR atminimo lentelė";
  }

  var chosenProduct = selectedProduct();
  if (createButton) createButton.href = "redaktorius.html?product=" + encodeURIComponent(chosenProduct);
  if (guestActions) {
    var next = "vartotojas.html?product=" + encodeURIComponent(chosenProduct);
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

  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function qrUrl(publicUrl) {
    var absolute = new URL(publicUrl, cfg().PUBLIC_SITE_URL || window.location.href).href;
    return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/qr-code?data=" + encodeURIComponent(absolute);
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

  function primaryAction(row, order) {
    if (!order) {
      return "<a class='button user-card-primary' href='redaktorius.html?edit=" + encodeURIComponent(row.id) + "'>Baigti kurti</a>";
    }
    if (!order.apmoketa) {
      return "<a class='button user-card-primary' href='apmokejimas.html?order=" + encodeURIComponent(order.id) + "'>" +
        (order.shipping_status === "paruošti" && Number.isInteger(order.total_cents) ? "Apmokėti užsakymą" : "Tęsti užsakymą") + "</a>";
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
    var res = await fetch(rpcUrl("approve_order_for_production"), {
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
    var response = await fetch(url, { headers: AtminimasAuth.headers(false) });
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

  async function setVisibility(profileId, active) {
    var res = await fetch(rpcUrl("set_my_profile_visibility"), {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({ profile_id: profileId, is_active: active })
    });
    if (!res.ok) throw new Error("Nepavyko pakeisti puslapio viešumo.");
  }

  async function deleteProfile(profileId) {
    var url = cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/profile-manage";
    var res = await fetch(url, {
      method: "POST",
      headers: Object.assign({}, AtminimasAuth.headers(true), { "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "delete", profile_id: profileId })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Nepavyko ištrinti puslapio.");
    return data;
  }

  async function fetchMyPages() {
    var me = await AtminimasAuth.user();
    if (!me) {
      listEl.innerHTML = "";
      logoutButton.hidden = true;
      if (createButton) createButton.hidden = true;
      if (guestActions) guestActions.hidden = false;
      statusEl.textContent = "Prisijunkite, kad atidarytumėte savo kliento zoną.";
      return;
    }

    logoutButton.hidden = false;
    if (createButton) createButton.hidden = false;
    if (guestActions) guestActions.hidden = true;
    statusEl.textContent = "Prisijungta: " + me.email;

    var res = await fetch(restUrl(
      "profiliai",
      "owner_id=eq." + encodeURIComponent(me.id) + "&deleted_at=is.null&select=id,vardas,pavarde,gimimo_data,mirties_data,epitafija,aktyvus,apmoketa,statusas,created_at&order=created_at.desc"
    ), {
      headers: AtminimasAuth.headers(false)
    });

    if (!res.ok) {
      listEl.innerHTML = "<div class='info-box'><h2>Nepavyko įkelti puslapių</h2><p>Pabandykite atnaujinti puslapį. Jei problema kartojasi, susisiekite su mumis.</p></div>";
      return;
    }

    var rows = await res.json();
    if (!rows.length) {
      listEl.innerHTML = "<div class='info-box'><h2>Puslapių dar nėra</h2><p>Pradėkite nuo graviruotos QR atminimo lentelės užsakymo.</p><a class='button' href='redaktorius.html?product=metal'>Užsakyti</a></div>";
      return;
    }

    var orderResponse = await fetch(restUrl(
      "uzsakymai",
      "select=id,profilis_id,product_type,carrier,city,parcel_terminal,shipping_status,tracking_number,tracking_url,apmoketa,payment_status,fulfillment_status,customer_approved_at,total_cents,currency,created_at&order=created_at.desc"
    ), { headers: AtminimasAuth.headers(false) });
    var orders = orderResponse.ok ? await orderResponse.json() : [];
    var relatedResponses = await Promise.all([
      fetch(restUrl("production_jobs", "select=order_id,status,qr_svg_path,qr_pdf_path&order=created_at.desc"), { headers: AtminimasAuth.headers(false) }),
      fetch(restUrl("invoice_documents", "select=order_id,invoice_number,storage_path,emailed_at&order=created_at.desc"), { headers: AtminimasAuth.headers(false) })
    ]);
    var productionJobs = relatedResponses[0].ok ? await relatedResponses[0].json() : [];
    var invoices = relatedResponses[1].ok ? await relatedResponses[1].json() : [];
    var productionByOrder = Object.fromEntries(productionJobs.map(function (item) { return [item.order_id, item]; }));
    var invoiceByOrder = Object.fromEntries(invoices.map(function (item) { return [item.order_id, item]; }));
    var orderByProfile = {};
    orders.forEach(function (order) {
      if (!orderByProfile[order.profilis_id]) orderByProfile[order.profilis_id] = order;
    });

    listEl.innerHTML = rows.map(function (row) {
      var name = [row.vardas, row.pavarde].filter(Boolean).join(" ") || row.id;
      var publicUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(row.id);
      var profileQrUrl = qrUrl(publicUrl);
      var order = orderByProfile[row.id];
      var production = order ? productionByOrder[order.id] : null;
      var invoice = order ? invoiceByOrder[order.id] : null;
      var shipment = order
        ? "<div class='user-card-status'><span>Užsakymas</span><strong>" + html(fulfillmentName(order.fulfillment_status)) + "</strong><span>Pristatymas</span><strong>" + html(shippingName(order.shipping_status)) + "</strong></div>"
        : "";
      var moreActions =
        "<a class='button button--ghost' href='" + publicUrl + "'>Peržiūrėti puslapį</a>" +
        "<a class='button button--ghost' href='redaktorius.html?edit=" + encodeURIComponent(row.id) + "'>Redaguoti</a>" +
        "<a class='button button--ghost' href='" + profileQrUrl + "' download='qr.svg'>Atsisiųsti QR</a>" +
        (invoice && invoice.storage_path ? "<button class='button button--ghost' type='button' data-document-order='" + html(order.id) + "' data-document-type='invoice'>Sąskaita PDF</button>" : "") +
        (production && (production.qr_svg_path || production.qr_pdf_path) ? "<button class='button button--ghost' type='button' data-document-order='" + html(order.id) + "' data-document-type='qr'>Gamybos QR</button>" : "") +
        "<button class='button button--ghost' type='button' data-profile-id='" + html(row.id) + "' data-next-active='" + (!row.aktyvus) + "'>" + (row.aktyvus ? "Paslėpti nuo lankytojų" : "Rodyti viešai") + "</button>" +
        "<button class='button button--danger' type='button' data-delete-profile='" + html(row.id) + "' data-profile-name='" + html(name) + "'>Ištrinti puslapį</button>";
      return (
        "<article class='info-box user-page-card' data-profile-card>" +
          "<div class='user-card-heading'><p class='eyebrow'>" + (row.aktyvus ? "Viešas puslapis" : "Privatus puslapis") + "</p><span class='user-card-visibility " + (row.aktyvus ? "is-public" : "") + "'>" + (row.aktyvus ? "Viešas" : "Privatus") + "</span></div>" +
          "<h2>" + html(name) + "</h2>" +
          "<p>" + html([row.gimimo_data, row.mirties_data].filter(Boolean).join(" - ") || "Datos nepateiktos") + "</p>" +
          "<p class='user-card-product'>" + (order ? html(productName(order.product_type)) : "Atminimo puslapio juodraštis") + "</p>" +
          shipment +
          primaryAction(row, order) +
          "<details class='user-card-more'><summary>Daugiau veiksmų</summary><div class='actions'>" + moreActions + "</div></details>" +
        "</article>"
      );
    }).join("");
  }

  listEl.addEventListener("click", async function (event) {
    var deleteButton = event.target.closest("button[data-delete-profile]");
    if (deleteButton) {
      var profileName = deleteButton.dataset.profileName || "šį puslapį";
      if (!window.confirm("Ar tikrai norite ištrinti „" + profileName + "“? Atminimo puslapis ir jo nuotraukos bus pašalinti. Šio veiksmo atšaukti negalima.")) return;
      deleteButton.disabled = true;
      statusEl.textContent = "Puslapis trinamas...";
      try {
        await deleteProfile(deleteButton.dataset.deleteProfile);
        await fetchMyPages();
        statusEl.textContent = "Puslapis ištrintas.";
      } catch (error) {
        statusEl.textContent = error.message || "Nepavyko ištrinti puslapio.";
        deleteButton.disabled = false;
      }
      return;
    }
    var approvalButton = event.target.closest("button[data-approve-order]");
    if (approvalButton) {
      if (!window.confirm("Patvirtinate, kad atminimo puslapio informacija ir QR nuoroda teisingi ir lentelę galima gaminti?")) return;
      approvalButton.disabled = true;
      statusEl.textContent = "Patvirtinimas saugomas...";
      try {
        await approveProduction(approvalButton.dataset.approveOrder);
        await fetchMyPages();
        statusEl.textContent = "Patvirtinta. Užsakymas perduotas į gamybos eilę.";
      } catch (error) {
        statusEl.textContent = error.message || "Nepavyko patvirtinti gamybos.";
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
        statusEl.textContent = error.message || "Nepavyko atsisiųsti dokumento.";
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
    statusEl.textContent = nextActive ? "Puslapis skelbiamas..." : "Puslapis slepiamas...";
    try {
      await setVisibility(button.dataset.profileId, nextActive);
      await fetchMyPages();
      statusEl.textContent = nextActive ? "Puslapis paskelbtas viešai." : "Puslapis nebėra viešas.";
    } catch (error) {
      statusEl.textContent = error.message || "Nepavyko pakeisti puslapio viešumo.";
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", function () {
    AtminimasAuth.signOut();
    statusEl.textContent = "Atsijungta.";
    listEl.innerHTML = "";
    logoutButton.hidden = true;
    if (createButton) createButton.hidden = true;
    if (guestActions) guestActions.hidden = false;
  });

  fetchMyPages().catch(function (err) {
    statusEl.textContent = err.message || "Nepavyko patikrinti sesijos.";
  });
})();


