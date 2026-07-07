(function () {
  var form = document.getElementById("delivery-form");
  var statusEl = document.getElementById("delivery-status");
  var orderEl = document.getElementById("checkout-order");
  var lockerStatus = document.getElementById("locker-status");
  var carrierSelect = form.elements.carrier;
  var citySelect = form.elements.city;
  var terminalSelect = form.elements.parcel_terminal;
  var lockers = [];
  var params = new URLSearchParams(window.location.search);
  var orderId = (params.get("order") || "").trim();

  function cfg() { return window.ATMINIMAS_CONFIG; }
  function rest(path) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path; }

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
    var city = citySelect.value;
    terminalSelect.innerHTML = "";
    terminalSelect.appendChild(option("", city ? "Pasirinkite paštomatą" : "Pirmiausia pasirinkite miestą"));
    lockers.filter(function (locker) { return locker.city === city; }).forEach(function (locker) {
      var value = lockerValue(locker);
      var item = option(value, lockerOptionText(locker));
      if (locker.title && item.textContent !== locker.title) item.title = locker.title;
      terminalSelect.appendChild(item);
    });
    terminalSelect.disabled = !city;
    if (selectedValue) terminalSelect.value = selectedValue;
  }

  async function loadLockers(carrier, selectedCity, selectedTerminal) {
    var slug = carrierSlug(carrier);
    lockers = [];
    citySelect.disabled = true;
    terminalSelect.disabled = true;
    citySelect.innerHTML = "";
    citySelect.appendChild(option("", "Kraunamas sąrašas..."));
    terminalSelect.innerHTML = "";
    terminalSelect.appendChild(option("", "Pirmiausia pasirinkite miestą"));
    if (!slug) {
      citySelect.innerHTML = "";
      citySelect.appendChild(option("", "Pirmiausia pasirinkite vežėją"));
      lockerStatus.textContent = "";
      return;
    }
    lockerStatus.textContent = "Kraunamas paštomatų sąrašas...";
    var response = await fetch(cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/parcel-lockers?carrier=" + encodeURIComponent(slug));
    if (!response.ok) throw new Error("Nepavyko įkelti paštomatų sąrašo.");
    var data = await response.json();
    lockers = data.lockers || [];
    var cities = Array.from(new Set(lockers.map(function (locker) { return locker.city; }))).sort(function (a, b) { return a.localeCompare(b, "lt"); });
    citySelect.innerHTML = "";
    citySelect.appendChild(option("", "Pasirinkite miestą / savivaldybę"));
    cities.forEach(function (city) { citySelect.appendChild(option(city, city)); });
    citySelect.disabled = false;
    if (selectedCity) citySelect.value = selectedCity;
    updateTerminals(selectedTerminal);
    lockerStatus.textContent = "Rasta paštomatų: " + lockers.length + ". Sąrašas atnaujinamas kas valandą.";
  }

  async function loadOrder() {
    if (!AtminimasAuth.accessToken()) {
      window.location.replace("prisijungti.html");
      return;
    }
    if (!orderId) throw new Error("Trūksta užsakymo numerio.");
    var response = await fetch(rest("uzsakymai?id=eq." + encodeURIComponent(orderId) + "&select=id,profilis_id,carrier,city,parcel_terminal,recipient_name,recipient_phone,recipient_email,shipping_status,apmoketa&limit=1"), { headers: AtminimasAuth.headers(false) });
    if (!response.ok) throw new Error("Užsakymas nerastas arba nepriklauso šiai paskyrai.");
    var rows = await response.json();
    if (!rows.length) throw new Error("Užsakymas nerastas arba nepriklauso šiai paskyrai.");
    var order = rows[0];
    orderEl.textContent = "Užsakymo numeris: " + order.id + ". Puslapis: " + order.profilis_id + ".";
    ["recipient_name", "recipient_phone", "recipient_email"].forEach(function (name) {
      if (order[name] && form.elements[name]) form.elements[name].value = order[name];
    });
    if (order.carrier) {
      carrierSelect.value = order.carrier;
      await loadLockers(order.carrier, order.city, order.parcel_terminal);
    }
    if (order.shipping_status && order.shipping_status !== "laukiama_duomenu") statusEl.textContent = "Pristatymo duomenys jau išsaugoti. Galite juos atnaujinti.";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector("button[type='submit']");
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
    button.disabled = true;
    statusEl.textContent = "Pristatymo duomenys saugomi...";
    try {
      var response = await fetch(rest("rpc/set_my_order_delivery"), {
        method: "POST",
        headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Nepavyko išsaugoti pristatymo duomenų.");
      statusEl.textContent = "Pristatymo duomenys išsaugoti. Užsakymas pateko į administratoriaus siuntimų sąrašą.";
    } catch (error) {
      statusEl.textContent = error.message || "Nepavyko išsaugoti pristatymo duomenų.";
    } finally {
      button.disabled = false;
    }
  });

  carrierSelect.addEventListener("change", function () {
    loadLockers(carrierSelect.value, "", "").catch(function (error) {
      lockerStatus.textContent = error.message || "Nepavyko įkelti paštomatų sąrašo.";
    });
  });
  citySelect.addEventListener("change", function () { updateTerminals(""); });

  loadOrder().catch(function (error) {
    statusEl.textContent = error.message || "Nepavyko įkelti užsakymo.";
    form.querySelector("button[type='submit']").disabled = true;
  });
})();
