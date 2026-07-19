(function () {
  var form = document.getElementById("delivery-form");
  var statusEl = document.getElementById("delivery-status");
  var orderEl = document.getElementById("checkout-order");
  var lockerStatus = document.getElementById("locker-status");
  var submitButton = document.getElementById("checkout-submit");
  var paymentHelp = document.getElementById("payment-help");
  var subtotalEl = document.getElementById("checkout-subtotal");
  var shippingEl = document.getElementById("checkout-shipping");
  var totalEl = document.getElementById("checkout-total");
  var carrierSelect = form.elements.carrier;
  var cityInput = form.elements.city;
  var cityList = document.getElementById("checkout-city-list");
  var terminalSelect = form.elements.parcel_terminal;
  var lockers = [];
  var cities = [];
  var params = new URLSearchParams(window.location.search);
  var orderId = (params.get("order") || "").trim();
  var currentOrder = null;

  function cfg() { return window.ATMINIMAS_CONFIG; }
  function rest(path) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path; }
  function functionUrl(name) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + name; }

  function checkoutReturnUrl() {
    return "apmokejimas.html?order=" + encodeURIComponent(orderId);
  }

  function redirectToLogin() {
    window.location.replace("prisijungti.html?next=" + encodeURIComponent(checkoutReturnUrl()));
  }

  function money(cents, currency) {
    if (!Number.isInteger(cents)) return "–";
    return new Intl.NumberFormat("lt-LT", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
  }

  function updatePayment(order) {
    currentOrder = order;
    subtotalEl.textContent = money(order.subtotal_cents, order.currency);
    shippingEl.textContent = money(order.shipping_cents, order.currency);
    totalEl.textContent = money(order.total_cents, order.currency);
    var ready = order.shipping_status === "paruošti" && Number.isInteger(order.total_cents) && order.total_cents > 0 && !order.apmoketa;
    submitButton.disabled = false;
    if (order.apmoketa || order.payment_status === "paid") {
      submitButton.textContent = "Išsaugoti pristatymo duomenis";
      paymentHelp.textContent = "Mokėjimas gautas. Toliau užsakymą valdysite kliento zonoje.";
    } else if (!Number.isInteger(order.total_cents)) {
      submitButton.textContent = "Išsaugoti pristatymą";
      paymentHelp.textContent = "Kai bus patvirtinta kaina, galėsite apmokėti kliento zonoje.";
    } else if (!ready) {
      submitButton.textContent = "Išsaugoti ir apmokėti";
      paymentHelp.textContent = "Paspaudus pirmiausia išsaugosime duomenis, tada atidarysime saugų mokėjimą.";
    } else {
      submitButton.textContent = "Apmokėti " + money(order.total_cents, order.currency);
      paymentHelp.textContent = "Pristatymas išsaugotas. Būsite nukreipti į saugų mokėjimo puslapį.";
    }
  }

  function carrierSlug(value) {
    return { "Omniva": "omniva", "LP Express": "lp-express", "DPD": "dpd" }[value] || "";
  }

  function option(value, text) {
    var item = document.createElement("option");
    item.value = value;
    item.textContent = text;
    return item;
  }

  function lockerValue(locker) {
    return locker.title + (locker.address ? " — " + locker.address : "");
  }

  function lockerOptionText(locker) {
    var title = (locker.title || "").trim();
    var address = (locker.address || "").trim();
    var postCode = (locker.postCode || "").trim();
    var isLocationInstruction = /^(paštomatas|pakomāts)\b/i.test(title) || title.length > 90;

    if (address && isLocationInstruction) {
      return address + (postCode ? ", LT-" + postCode : "");
    }
    return title + (address ? " — " + address : "");
  }

  function updateTerminals(selectedValue) {
    var city = cityInput.value.trim();
    terminalSelect.innerHTML = "";
    var exactCity = cities.indexOf(city) !== -1;
    terminalSelect.appendChild(option("", exactCity ? "Pasirinkite paštomatą" : "Pasirinkite miestą iš pasiūlymų"));
    lockers.filter(function (locker) { return locker.city === city; }).forEach(function (locker) {
      var value = lockerValue(locker);
      var item = option(value, lockerOptionText(locker));
      if (locker.title && item.textContent !== locker.title) item.title = locker.title;
      terminalSelect.appendChild(item);
    });
    terminalSelect.disabled = !exactCity;
    if (selectedValue) terminalSelect.value = selectedValue;
  }

  async function loadLockers(carrier, selectedCity, selectedTerminal) {
    var slug = carrierSlug(carrier);
    lockers = [];
    cities = [];
    cityInput.disabled = true;
    terminalSelect.disabled = true;
    cityInput.value = "";
    cityInput.placeholder = "Kraunamas miestų sąrašas…";
    cityList.innerHTML = "";
    terminalSelect.innerHTML = "";
    terminalSelect.appendChild(option("", "Pirmiausia pasirinkite miestą"));
    if (!slug) {
      cityInput.placeholder = "Pirmiausia pasirinkite vežėją";
      lockerStatus.textContent = "";
      return;
    }
    lockerStatus.textContent = "Kraunamas paštomatų sąrašas...";
    var response = await fetch(cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/parcel-lockers?carrier=" + encodeURIComponent(slug));
    if (!response.ok) throw new Error("Nepavyko įkelti paštomatų sąrašo.");
    var data = await response.json();
    lockers = data.lockers || [];
    cities = Array.from(new Set(lockers.map(function (locker) { return locker.city; }))).sort(function (a, b) { return a.localeCompare(b, "lt"); });
    cities.forEach(function (city) { cityList.appendChild(option(city, city)); });
    cityInput.disabled = false;
    cityInput.placeholder = "Pradėkite rašyti miestą";
    if (selectedCity) cityInput.value = selectedCity;
    updateTerminals(selectedTerminal);
    lockerStatus.textContent = "Įveskite miestą ir pasirinkite jį iš pasiūlymų.";
  }

  async function prefillAccount(me) {
    if (!me) return;
    if (!form.elements.recipient_email.value) form.elements.recipient_email.value = me.email || "";
    if (!form.elements.recipient_name.value) {
      form.elements.recipient_name.value = (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) || "";
    }
  }

  async function loadOrder() {
    if (!orderId) throw new Error("Trūksta užsakymo numerio.");
    if (!AtminimasAuth.accessToken()) {
      redirectToLogin();
      return;
    }
    var me = await AtminimasAuth.user();
    if (!me) {
      redirectToLogin();
      return;
    }
    var response = await fetch(rest("uzsakymai?id=eq." + encodeURIComponent(orderId) + "&select=id,profilis_id,product_type,carrier,city,parcel_terminal,recipient_name,recipient_phone,recipient_email,shipping_status,apmoketa,payment_status,subtotal_cents,shipping_cents,total_cents,currency&limit=1"), { headers: AtminimasAuth.headers(false) });
    if (response.status === 401) {
      AtminimasAuth.signOut();
      redirectToLogin();
      return;
    }
    if (!response.ok) throw new Error("Užsakymas nerastas arba nepriklauso šiai paskyrai.");
    var rows = await response.json();
    if (!rows.length) throw new Error("Užsakymas nerastas arba nepriklauso šiai paskyrai.");
    var order = rows[0];
    updatePayment(order);
    orderEl.textContent = order.product_type === "asa"
      ? "ASA QR atminimo lentelė"
      : (order.product_type === "steel" ? "Graviruota plieno QR atminimo lentelė" : "Graviruota QR atminimo lentelė");
    ["recipient_name", "recipient_phone", "recipient_email"].forEach(function (name) {
      if (order[name] && form.elements[name]) form.elements[name].value = order[name];
    });
    if (order.carrier) {
      carrierSelect.value = order.carrier;
      await loadLockers(order.carrier, order.city, order.parcel_terminal);
    }
    await prefillAccount(me);
    if (order.shipping_status && order.shipping_status !== "laukiama_duomenu") statusEl.textContent = "Pristatymo duomenys jau išsaugoti. Galite juos atnaujinti.";
    if (params.get("payment") === "success" && !order.apmoketa) statusEl.textContent = "Mokėjimas priimtas. Laukiama saugaus patvirtinimo iš mokėjimų teikėjo – būsena netrukus atsinaujins.";
    if (params.get("payment") === "cancelled") statusEl.textContent = "Mokėjimas atšauktas. Užsakymas išsaugotas, galite bandyti dar kartą.";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var values = Object.fromEntries(new FormData(form).entries());
    var data = {
      order_id: orderId,
      p_carrier: values.carrier,
      p_city: values.city,
      p_parcel_terminal: values.parcel_terminal,
      p_recipient_name: values.recipient_name,
      p_recipient_phone: values.recipient_phone,
      p_recipient_email: values.recipient_email
    };
    submitButton.disabled = true;
    statusEl.textContent = "Išsaugome pristatymo duomenis…";
    try {
      var response = await fetch(rest("rpc/set_my_order_delivery"), {
        method: "POST",
        headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Nepavyko išsaugoti pristatymo duomenų.");
      statusEl.textContent = "Pristatymo duomenys išsaugoti.";
      await loadOrder();
      if (currentOrder && currentOrder.shipping_status === "paruošti" &&
          Number.isInteger(currentOrder.total_cents) && currentOrder.total_cents > 0 &&
          !currentOrder.apmoketa) {
        await startPayment();
      }
    } catch (error) {
      statusEl.textContent = error.message || "Nepavyko išsaugoti pristatymo duomenų.";
    } finally {
      submitButton.disabled = false;
    }
  });

  carrierSelect.addEventListener("change", function () {
    loadLockers(carrierSelect.value, "", "").catch(function (error) {
      lockerStatus.textContent = error.message || "Nepavyko įkelti paštomatų sąrašo.";
    });
  });
  cityInput.addEventListener("input", function () { updateTerminals(""); });
  cityInput.addEventListener("change", function () { updateTerminals(""); });

  async function startPayment() {
    if (!currentOrder) return;
    submitButton.disabled = true;
    paymentHelp.textContent = "Kuriamas saugus mokėjimas...";
    try {
      var response = await fetch(functionUrl("payment-create"), {
        method: "POST",
        headers: AtminimasAuth.headers(true),
        body: JSON.stringify({ order_id: orderId })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.checkout_url) throw new Error(data.error || "Nepavyko pradėti mokėjimo.");
      window.location.assign(data.checkout_url);
    } catch (error) {
      updatePayment(currentOrder);
      paymentHelp.textContent = error.message || "Nepavyko pradėti mokėjimo.";
    }
  }

  loadOrder().catch(function (error) {
    statusEl.textContent = error.message || "Nepavyko įkelti užsakymo.";
    submitButton.disabled = true;
  });
})();
