(function () {
  var form = document.getElementById("delivery-form");
  var statusEl = document.getElementById("delivery-status");
  var orderEl = document.getElementById("checkout-order");
  var submitButton = document.getElementById("checkout-submit");
  var paymentHelp = document.getElementById("payment-help");
  var subtotalEl = document.getElementById("checkout-subtotal");
  var shippingEl = document.getElementById("checkout-shipping");
  var totalEl = document.getElementById("checkout-total");
  var carrierSelect = form.elements.carrier;
  var cityInput = form.elements.city;
  var cityList = document.getElementById("checkout-city-list");
  var lockerSearch = document.getElementById("checkout-locker-search");
  var terminalSelect = form.elements.parcel_terminal;
  var shippingState = document.getElementById("shipping-options-state");
  var shippingStatus = document.getElementById("shipping-options-status");
  var shippingRetry = document.getElementById("shipping-options-retry");
  var lockerState = document.getElementById("locker-state");
  var lockerStatus = document.getElementById("locker-status");
  var lockerRetry = document.getElementById("locker-retry");
  var paymentSuccess = document.getElementById("payment-success");
  var paymentSuccessTitle = document.getElementById("payment-success-title");
  var paymentSuccessMessage = document.getElementById("payment-success-message");
  var paymentSuccessAction = document.getElementById("payment-success-action");
  var shippingMethods = [];
  var lockers = [];
  var cities = [];
  var shippingCatalogReady = false;
  var shippingCatalogChecked = false;
  var lockersReady = false;
  var lockerRequestId = 0;
  var lockerRetryContext = null;
  var isWorking = false;
  var successWasAnnounced = false;
  var params = new URLSearchParams(window.location.search);
  var orderId = (params.get("order") || "").trim();
  var currentOrder = null;

  function cfg() { return window.ATMINIMAS_CONFIG; }
  function rest(path) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path; }
  function functionUrl(name) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + name; }
  function apiFetch(url, options) {
    return AtminimasAuth.authorizedFetch
      ? AtminimasAuth.authorizedFetch(url, options)
      : fetch(url, options);
  }

  function checkoutReturnUrl() {
    var returnParams = new URLSearchParams({ order: orderId });
    if (params.get("payment")) returnParams.set("payment", params.get("payment"));
    return "apmokejimas.html?" + returnParams.toString();
  }

  function redirectToLogin() {
    window.location.replace("prisijungti.html?next=" + encodeURIComponent(checkoutReturnUrl()));
  }

  function money(cents, currency) {
    if (!Number.isInteger(cents)) return "–";
    return new Intl.NumberFormat("lt-LT", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
  }

  function option(value, text) {
    var item = document.createElement("option");
    item.value = value;
    item.textContent = text;
    return item;
  }

  function setInlineState(container, textElement, retryButton, message, state, canRetry) {
    textElement.textContent = message || "";
    container.dataset.state = state || "";
    retryButton.hidden = !canRetry;
  }

  function setShippingState(message, state, canRetry) {
    setInlineState(shippingState, shippingStatus, shippingRetry, message, state, canRetry);
  }

  function setLockerState(message, state, canRetry) {
    setInlineState(lockerState, lockerStatus, lockerRetry, message, state, canRetry);
  }

  function selectedShippingMethod(carrier) {
    var value = carrier == null ? carrierSelect.value : carrier;
    return shippingMethods.find(function (method) { return method.carrier === value; }) || null;
  }

  function previewTotal() {
    var method = selectedShippingMethod();
    if (!currentOrder || !method || !Number.isInteger(currentOrder.subtotal_cents)) return null;
    if ((method.currency || "EUR") !== (currentOrder.currency || "EUR")) return null;
    return currentOrder.subtotal_cents + method.price_cents;
  }

  function updatePriceSummary() {
    if (!currentOrder) return;
    subtotalEl.textContent = money(currentOrder.subtotal_cents, currentOrder.currency);
    var method = selectedShippingMethod();
    if (method) {
      shippingEl.textContent = money(method.price_cents, method.currency);
      totalEl.textContent = money(previewTotal(), currentOrder.currency);
    } else if (!shippingCatalogChecked) {
      shippingEl.textContent = "Tikrinama…";
      totalEl.textContent = "–";
    } else {
      shippingEl.textContent = shippingCatalogReady ? "Pasirinkite" : "Nepasiekiama";
      totalEl.textContent = "–";
    }
  }

  function updateActionText() {
    if (!currentOrder) return;
    if (currentOrder.apmoketa || currentOrder.payment_status === "paid") {
      submitButton.textContent = "Išsaugoti pristatymo duomenis";
      paymentHelp.textContent = "Mokėjimas gautas. Gamybą patvirtinsite kliento zonoje.";
      return;
    }
    if (!shippingCatalogReady || !shippingMethods.length) {
      submitButton.textContent = "Pristatymas laikinai negalimas";
      paymentHelp.textContent = "Kai bus pasiekiamas bent vienas pristatymo būdas, galėsite tęsti užsakymą.";
      return;
    }
    var total = previewTotal();
    if (!selectedShippingMethod()) {
      submitButton.textContent = "Pasirinkite pristatymą";
      paymentHelp.textContent = "Pasirinkus vežėją čia matysite visą galutinę sumą.";
      return;
    }
    submitButton.textContent = Number.isInteger(total)
      ? "Išsaugoti ir apmokėti " + money(total, currentOrder.currency)
      : "Išsaugoti pristatymą";
    paymentHelp.textContent = Number.isInteger(total)
      ? "Pirmiausia išsaugosime duomenis, tada atidarysime saugų mokėjimo puslapį."
      : "Kai bus patvirtinta produkto kaina, galėsite apmokėti kliento zonoje.";
  }

  function syncSubmitState() {
    var lockerUnavailable = !!carrierSelect.value && !lockersReady;
    submitButton.disabled = isWorking || !currentOrder || !shippingCatalogReady ||
      !shippingMethods.length || lockerUnavailable;
  }

  function updateCheckout() {
    updatePriceSummary();
    updateActionText();
    syncSubmitState();
  }

  function updatePayment(order) {
    currentOrder = order;
    updateCheckout();
  }

  function renderPaymentSuccess(order) {
    if (params.get("payment") !== "success") return;
    var confirmed = order.apmoketa || order.payment_status === "paid";
    paymentSuccess.hidden = false;
    paymentSuccessTitle.textContent = confirmed
      ? "Apmokėjimas patvirtintas"
      : "Mokėjimas gautas – laukiame patvirtinimo";
    paymentSuccessMessage.textContent = confirmed
      ? "Kad pradėtume gamybą, kliento zonoje peržiūrėkite galutinį maketą ir paspauskite „Patvirtinti gamybai“."
      : "Mokėjimo puslapis uždarytas sėkmingai. Saugus patvirtinimas gali užtrukti kelias akimirkas. Kai būsena pasikeis į „Apmokėta“, kliento zonoje peržiūrėkite maketą ir patvirtinkite gamybą.";
    paymentSuccessAction.textContent = confirmed
      ? "Peržiūrėti ir patvirtinti gamybą"
      : "Stebėti užsakymo būseną";
    paymentSuccessAction.href = "vartotojas.html?order=" + encodeURIComponent(order.id) + "#user-pages";
    if (!successWasAnnounced) {
      successWasAnnounced = true;
      window.requestAnimationFrame(function () {
        paymentSuccess.focus({ preventScroll: true });
      });
    }
  }

  function carrierSlug(value) {
    return { "Omniva": "omniva", "LP Express": "lp-express", "DPD": "dpd" }[value] || "";
  }

  function normalizeShippingMethod(row, orderCurrency) {
    var price = Number(row && row.price_cents);
    var currency = String(row && row.currency || "EUR").toUpperCase();
    var carrier = String(row && row.carrier || "").trim();
    if (!row || row.enabled !== true || !carrier || !Number.isInteger(price) || price < 0) return null;
    if (orderCurrency && currency !== String(orderCurrency).toUpperCase()) return null;
    if (!carrierSlug(carrier)) return null;
    return { carrier: carrier, price_cents: price, currency: currency };
  }

  function resetLockerControls(message) {
    lockerRequestId += 1;
    lockers = [];
    cities = [];
    lockersReady = false;
    cityInput.disabled = true;
    cityInput.value = "";
    cityInput.placeholder = message || "Pirmiausia pasirinkite vežėją";
    cityList.innerHTML = "";
    lockerSearch.disabled = true;
    lockerSearch.value = "";
    terminalSelect.disabled = true;
    terminalSelect.innerHTML = "";
    terminalSelect.appendChild(option("", message || "Pirmiausia pasirinkite vežėją"));
    syncSubmitState();
  }

  function renderShippingMethods(selectedCarrier) {
    carrierSelect.innerHTML = "";
    if (!shippingMethods.length) {
      carrierSelect.appendChild(option("", "Šiuo metu pristatymo būdų nėra"));
      carrierSelect.disabled = true;
      return;
    }
    carrierSelect.appendChild(option("", "Pasirinkite vežėją"));
    shippingMethods.forEach(function (method) {
      carrierSelect.appendChild(option(
        method.carrier,
        method.carrier + " — " + money(method.price_cents, method.currency)
      ));
    });
    carrierSelect.disabled = false;
    carrierSelect.value = selectedShippingMethod(selectedCarrier) ? selectedCarrier : "";
  }

  async function loadShippingCatalog(selectedCarrier, orderCurrency) {
    shippingCatalogReady = false;
    shippingCatalogChecked = false;
    shippingMethods = [];
    carrierSelect.disabled = true;
    carrierSelect.innerHTML = "";
    carrierSelect.appendChild(option("", "Kraunami pristatymo būdai…"));
    resetLockerControls("Pirmiausia pasirinkite vežėją");
    setShippingState("Tikriname galimus pristatymo būdus ir galutines kainas…", "loading", false);
    updateCheckout();
    try {
      var response = await apiFetch(rest(
        "shipping_catalog?select=carrier,price_cents,currency,enabled&enabled=eq.true&order=carrier.asc"
      ), { headers: AtminimasAuth.headers(false) });
      if (!response.ok) throw new Error("shipping-catalog-unavailable");
      var rows = await response.json();
      shippingMethods = (Array.isArray(rows) ? rows : []).map(function (row) {
        return normalizeShippingMethod(row, orderCurrency);
      }).filter(Boolean);
      shippingCatalogChecked = true;
      shippingCatalogReady = shippingMethods.length > 0;
      renderShippingMethods(selectedCarrier);
      if (!shippingMethods.length) {
        setShippingState(
          "Šiuo metu nėra aktyvaus pristatymo būdo. Užsakymo apmokėti negalima – pabandykite vėliau.",
          "error",
          true
        );
      } else {
        setShippingState(
          "Rodomi tik šiuo metu galimi pristatymo būdai. Kaina prie vežėjo yra galutinė.",
          "ready",
          false
        );
      }
      updateCheckout();
      return shippingCatalogReady;
    } catch (_error) {
      shippingMethods = [];
      shippingCatalogChecked = true;
      shippingCatalogReady = false;
      renderShippingMethods("");
      setShippingState(
        "Pristatymo būdų įkelti nepavyko. Patikrinkite interneto ryšį ir bandykite dar kartą.",
        "error",
        true
      );
      updateCheckout();
      return false;
    }
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

  function searchable(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("lt");
  }

  function exactCityName(value) {
    var wanted = searchable(String(value || "").trim());
    return cities.find(function (city) { return searchable(city) === wanted; }) || "";
  }

  function updateTerminals(selectedValue) {
    var exactCity = exactCityName(cityInput.value);
    var query = searchable(lockerSearch.value.trim());
    terminalSelect.innerHTML = "";
    if (!exactCity) {
      terminalSelect.appendChild(option("", cityInput.value.trim()
        ? "Pasirinkite miestą iš pasiūlymų"
        : "Pirmiausia pasirinkite miestą"));
      terminalSelect.disabled = true;
      lockerSearch.disabled = true;
      lockerSearch.value = "";
      setLockerState(
        cityInput.value.trim()
          ? "Pasirinkite miestą iš rodomų pasiūlymų."
          : "Įrašykite miestą ir pasirinkite jį iš pasiūlymų.",
        "",
        false
      );
      return;
    }

    lockerSearch.disabled = false;
    var matches = lockers.filter(function (locker) {
      if (locker.city !== exactCity) return false;
      if (!query) return true;
      return searchable([locker.title, locker.address, locker.postCode].join(" ")).indexOf(query) !== -1;
    });
    terminalSelect.appendChild(option("", matches.length ? "Pasirinkite paštomatą" : "Paštomatų nerasta"));
    matches.forEach(function (locker) {
      var value = lockerValue(locker);
      var item = option(value, lockerOptionText(locker));
      if (locker.title && item.textContent !== locker.title) item.title = locker.title;
      terminalSelect.appendChild(item);
    });
    terminalSelect.disabled = matches.length === 0;
    if (selectedValue && matches.some(function (locker) { return lockerValue(locker) === selectedValue; })) {
      terminalSelect.value = selectedValue;
    }
    setLockerState(
      matches.length
        ? "Rasta " + matches.length + " paštomatų. Galite ieškoti pagal pavadinimą arba adresą."
        : "Pagal paiešką šiame mieste paštomatų nerasta. Pakeiskite paieškos žodį.",
      matches.length ? "ready" : "",
      false
    );
  }

  function failLockerLoad() {
    resetLockerControls("Paštomatų sąrašas nepasiekiamas");
    setLockerState(
      "Paštomatų sąrašo įkelti nepavyko. Patikrinkite interneto ryšį ir bandykite dar kartą.",
      "error",
      true
    );
  }

  async function loadLockers(carrier, selectedCity, selectedTerminal) {
    var slug = carrierSlug(carrier);
    lockerRetryContext = {
      carrier: carrier,
      city: selectedCity || "",
      terminal: selectedTerminal || ""
    };
    resetLockerControls(slug ? "Kraunamas paštomatų sąrašas…" : "Pirmiausia pasirinkite vežėją");
    if (!slug) {
      setLockerState("", "", false);
      return false;
    }
    var requestId = ++lockerRequestId;
    setLockerState("Kraunamas paštomatų sąrašas…", "loading", false);
    try {
      var response = await apiFetch(
        functionUrl("parcel-lockers") + "?carrier=" + encodeURIComponent(slug)
      );
      if (!response.ok) throw new Error("parcel-lockers-unavailable");
      var data = await response.json();
      if (requestId !== lockerRequestId) return false;
      lockers = (Array.isArray(data.lockers) ? data.lockers : []).map(function (locker) {
        return {
          title: String(locker && locker.title || "").trim(),
          address: String(locker && locker.address || "").trim(),
          postCode: String(locker && locker.postCode || "").trim(),
          city: String(locker && locker.city || "").trim()
        };
      }).filter(function (locker) { return locker.title && locker.city; });
      cities = Array.from(new Set(lockers.map(function (locker) { return locker.city; })))
        .sort(function (a, b) { return a.localeCompare(b, "lt"); });
      if (!lockers.length || !cities.length) throw new Error("parcel-lockers-empty");
      cities.forEach(function (city) { cityList.appendChild(option(city, city)); });
      cityInput.disabled = false;
      cityInput.placeholder = "Pradėkite rašyti miestą";
      lockersReady = true;
      if (selectedCity) cityInput.value = selectedCity;
      updateTerminals(selectedTerminal);
      syncSubmitState();
      return true;
    } catch (_error) {
      if (requestId === lockerRequestId) failLockerLoad();
      return false;
    }
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
    var response = await apiFetch(rest(
      "uzsakymai?id=eq." + encodeURIComponent(orderId) +
      "&select=id,profilis_id,product_type,carrier,city,parcel_terminal,recipient_name,recipient_phone,recipient_email,shipping_status,apmoketa,payment_status,subtotal_cents,shipping_cents,total_cents,currency&limit=1"
    ), { headers: AtminimasAuth.headers(false) });
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
    renderPaymentSuccess(order);
    orderEl.textContent = order.product_type === "asa"
      ? "ASA QR atminimo lentelė"
      : "Graviruota plieno QR atminimo lentelė";
    ["recipient_name", "recipient_phone", "recipient_email"].forEach(function (name) {
      if (order[name] && form.elements[name]) form.elements[name].value = order[name];
    });

    var shippingLoaded = await loadShippingCatalog(order.carrier, order.currency);
    var savedCarrierIsActive = shippingLoaded && !!selectedShippingMethod(order.carrier);
    if (savedCarrierIsActive) {
      carrierSelect.value = order.carrier;
      updateCheckout();
      await loadLockers(order.carrier, order.city, order.parcel_terminal);
    }

    await prefillAccount(me);
    if (order.shipping_status && order.shipping_status !== "laukiama_duomenu") {
      statusEl.textContent = "Pristatymo duomenys jau išsaugoti. Galite juos atnaujinti.";
    }
    if (order.carrier && shippingLoaded && !savedCarrierIsActive) {
      statusEl.textContent = "Anksčiau pasirinktas pristatymo būdas šiuo metu neaktyvus. Pasirinkite kitą būdą.";
    }
    if (params.get("payment") === "success" && !order.apmoketa) {
      statusEl.textContent = "Mokėjimas priimtas. Laukiama saugaus patvirtinimo iš mokėjimų teikėjo – būsena netrukus atsinaujins.";
    }
    if (params.get("payment") === "cancelled") {
      statusEl.textContent = "Mokėjimas atšauktas. Užsakymas išsaugotas, galite bandyti dar kartą.";
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var values = Object.fromEntries(new FormData(form).entries());
    var method = selectedShippingMethod(values.carrier);
    var selectedLockerExists = lockers.some(function (locker) {
      return locker.city === exactCityName(values.city) && lockerValue(locker) === values.parcel_terminal;
    });
    if (!shippingCatalogReady || !method) {
      statusEl.textContent = "Pasirinktas pristatymo būdas nebepasiekiamas. Atnaujinkite pristatymo būdus.";
      return;
    }
    if (!lockersReady || !selectedLockerExists) {
      statusEl.textContent = "Pasirinkite paštomatą iš pateikto sąrašo.";
      return;
    }
    var data = {
      order_id: orderId,
      p_carrier: method.carrier,
      p_city: exactCityName(values.city),
      p_parcel_terminal: values.parcel_terminal,
      p_recipient_name: values.recipient_name,
      p_recipient_phone: values.recipient_phone,
      p_recipient_email: values.recipient_email
    };
    isWorking = true;
    syncSubmitState();
    statusEl.textContent = "Tikrinamas prisijungimas…";
    try {
      if (AtminimasAuth.ensureFreshSession) {
        var freshSession = await AtminimasAuth.ensureFreshSession();
        if (!freshSession) throw new Error("Prisijungimo sesija baigėsi. Prisijunkite dar kartą.");
      }
      statusEl.textContent = "Išsaugome pristatymo duomenis…";
      var response = await apiFetch(rest("rpc/set_my_order_delivery"), {
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
      if (!AtminimasAuth.accessToken()) {
        statusEl.textContent += " Nukreipiame prisijungti iš naujo…";
        window.setTimeout(redirectToLogin, 900);
      }
    } finally {
      isWorking = false;
      syncSubmitState();
    }
  });

  carrierSelect.addEventListener("change", function () {
    updateCheckout();
    if (!carrierSelect.value) {
      lockerRetryContext = null;
      resetLockerControls("Pirmiausia pasirinkite vežėją");
      setLockerState("", "", false);
      return;
    }
    loadLockers(carrierSelect.value, "", "");
  });
  cityInput.addEventListener("input", function () { updateTerminals(""); });
  cityInput.addEventListener("change", function () {
    var exact = exactCityName(cityInput.value);
    if (exact) cityInput.value = exact;
    updateTerminals("");
  });
  lockerSearch.addEventListener("input", function () { updateTerminals(""); });

  shippingRetry.addEventListener("click", async function () {
    shippingRetry.disabled = true;
    var selected = currentOrder && currentOrder.carrier;
    var loaded = await loadShippingCatalog(selected, currentOrder && currentOrder.currency);
    shippingRetry.disabled = false;
    if (loaded && selectedShippingMethod(selected)) {
      carrierSelect.value = selected;
      updateCheckout();
      await loadLockers(selected, currentOrder.city, currentOrder.parcel_terminal);
    }
  });

  lockerRetry.addEventListener("click", async function () {
    if (!lockerRetryContext || !selectedShippingMethod(lockerRetryContext.carrier)) return;
    lockerRetry.disabled = true;
    var context = lockerRetryContext;
    await loadLockers(context.carrier, context.city, context.terminal);
    lockerRetry.disabled = false;
  });

  async function startPayment() {
    if (!currentOrder) return;
    isWorking = true;
    syncSubmitState();
    paymentHelp.textContent = "Kuriamas saugus mokėjimas…";
    try {
      var response = await apiFetch(functionUrl("payment-create"), {
        method: "POST",
        headers: AtminimasAuth.headers(true),
        body: JSON.stringify({ order_id: orderId })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.checkout_url) throw new Error(data.error || "Nepavyko pradėti mokėjimo.");
      window.location.assign(data.checkout_url);
    } catch (error) {
      isWorking = false;
      updateCheckout();
      paymentHelp.textContent = error.message || "Nepavyko pradėti mokėjimo.";
      if (!AtminimasAuth.accessToken()) {
        paymentHelp.textContent += " Nukreipiame prisijungti iš naujo…";
        window.setTimeout(redirectToLogin, 900);
      }
    }
  }

  loadOrder().catch(function (error) {
    statusEl.textContent = error.message || "Nepavyko įkelti užsakymo.";
    submitButton.disabled = true;
  });
})();
