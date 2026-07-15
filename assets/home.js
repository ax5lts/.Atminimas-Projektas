(function () {
  function renderAuthNavigation() {
    var authenticated = Boolean(window.AtminimasAuth && AtminimasAuth.accessToken());
    document.querySelectorAll("[data-auth-guest]").forEach(function (element) {
      element.hidden = authenticated;
    });
    document.querySelectorAll("[data-auth-user]").forEach(function (element) {
      element.hidden = !authenticated;
    });
  }

  function initAuthNavigation() {
    var navigation = document.querySelector("[data-auth-navigation]");
    if (!navigation || !window.AtminimasAuth) return;

    var signOutButton = navigation.querySelector("[data-auth-signout]");
    if (signOutButton) {
      signOutButton.addEventListener("click", function () {
        AtminimasAuth.signOut();
        renderAuthNavigation();
      });
    }

    window.addEventListener("storage", renderAuthNavigation);
    renderAuthNavigation();
  }

  initAuthNavigation();

  var form = document.getElementById("service-request-form");
  if (!form) return;

  var details = document.getElementById("service-details");
  var statusEl = document.getElementById("service-request-status");
  var estimateEl = document.getElementById("service-estimate-price");
  var submitButton = form.querySelector("button[type='submit']");
  var serviceInputs = Array.from(form.querySelectorAll("input[name='services']"));
  var cleaningInputs = Array.from(form.querySelectorAll("input[name='cleaning_tasks']"));
  var draftKey = "atminimas.service-request.draft.v1";
  var allowedServices = ["zvakes", "geles", "kapu_tvarkymas"];
  var prices = window.ATMINIMAS_SERVICE_PRICES || {};
  var optionLabels = {
    candle_1: "1 žvakė",
    candle_2: "2 žvakės",
    candle_5: "5 žvakės",
    candle_other: "Kitas žvakių kiekis",
    flower_1: "1 gėlė",
    flower_3: "3 gėlės",
    flower_5: "5 gėlės",
    flower_bouquet: "Puokštė",
    flower_other: "Kitas gėlių kiekis",
    cleaning_full: "Pilnas sutvarkymas",
    cleaning_grooves: "Griovelių išvalymas",
    cleaning_surface: "Kapavietės viršaus nušlavimas",
    cleaning_monument: "Paminklo nuvalymas",
    cleaning_leaves: "Lapų ir šiukšlių surinkimas"
  };

  function config() {
    return window.ATMINIMAS_CONFIG;
  }

  function selectedServices() {
    return serviceInputs.filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
  }

  function selectedNamedValues(name) {
    return Array.from(form.querySelectorAll("[name='" + name + "']:checked")).map(function (input) { return input.value; });
  }

  function priceValue(key) {
    var value = prices[key];
    if (value === null || value === undefined || value === "") return null;
    value = Number(value);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(value);
  }

  function priceTextForKeys(keys) {
    if (!keys.length) return "derinama";
    var values = keys.map(priceValue);
    if (values.some(function (value) { return value === null; })) return "derinama";
    return formatPrice(values.reduce(function (sum, value) { return sum + value; }, 0));
  }

  function selectedPriceKeys() {
    var services = selectedServices();
    var keys = [];
    if (services.indexOf("zvakes") !== -1) keys = keys.concat(selectedNamedValues("candle_package"));
    if (services.indexOf("geles") !== -1) keys = keys.concat(selectedNamedValues("flower_package"));
    if (services.indexOf("kapu_tvarkymas") !== -1) keys = keys.concat(selectedNamedValues("cleaning_tasks"));
    return keys;
  }

  function updateEstimate() {
    estimateEl.textContent = priceTextForKeys(selectedPriceKeys()) === "derinama"
      ? "–"
      : priceTextForKeys(selectedPriceKeys());
  }

  function renderPrices() {
    form.querySelectorAll("[data-service-price]").forEach(function (element) {
      var value = priceValue(element.dataset.servicePrice);
      element.textContent = value === null ? "Kaina –" : formatPrice(value);
    });
  }

  function updateServiceFields() {
    var selected = selectedServices();
    details.hidden = selected.length === 0;
    form.querySelectorAll("[data-service-details]").forEach(function (section) {
      var enabled = selected.indexOf(section.dataset.serviceDetails) !== -1;
      section.hidden = !enabled;
      section.querySelectorAll("input, textarea, select").forEach(function (field) {
        field.disabled = !enabled;
        if (field.hasAttribute("data-service-required")) field.required = enabled;
      });
    });
    updateEstimate();
  }

  function saveDraft() {
    var fields = {};
    Array.from(form.elements).forEach(function (field) {
      if (!field.name || field.name === "services") return;
      if (field.type === "checkbox" || field.type === "radio") {
        if (!field.checked) return;
        if (!Array.isArray(fields[field.name])) fields[field.name] = [];
        fields[field.name].push(field.value);
      } else {
        fields[field.name] = field.value;
      }
    });
    sessionStorage.setItem(draftKey, JSON.stringify({ services: selectedServices(), fields: fields }));
  }

  function restoreDraft() {
    var raw = sessionStorage.getItem(draftKey);
    if (!raw) return;
    try {
      var draft = JSON.parse(raw);
      var fields = draft.fields || draft;
      Array.from(form.elements).forEach(function (field) {
        if (!field.name || field.name === "services" || fields[field.name] === undefined) return;
        var saved = fields[field.name];
        if (field.type === "checkbox" || field.type === "radio") {
          var savedValues = Array.isArray(saved) ? saved : [saved];
          field.checked = savedValues.indexOf(field.value) !== -1;
        } else {
          field.value = saved;
        }
      });
      serviceInputs.forEach(function (input) {
        input.checked = Array.isArray(draft.services) && draft.services.indexOf(input.value) !== -1;
      });
      updateServiceFields();
    } catch (_error) {
      sessionStorage.removeItem(draftKey);
    }
  }

  function restUrl(table) {
    return config().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table);
  }

  function optionDetails(keys, freeText, noun) {
    var lines = [];
    if (keys.length) lines.push(noun + ": " + keys.map(function (key) { return optionLabels[key] || key; }).join(", "));
    lines.push("Preliminari kaina: " + priceTextForKeys(keys));
    if (freeText) lines.push("Pageidavimai: " + freeText);
    return lines.join("\n");
  }

  serviceInputs.forEach(function (input) {
    input.addEventListener("change", updateServiceFields);
  });

  form.querySelectorAll("input[name='candle_package'], input[name='flower_package']").forEach(function (input) {
    input.addEventListener("change", updateEstimate);
  });

  cleaningInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      var full = form.querySelector("[data-cleaning-full]");
      if (input === full && input.checked) {
        cleaningInputs.forEach(function (other) { if (other !== full) other.checked = false; });
      } else if (input.checked && full) {
        full.checked = false;
      }
      updateEstimate();
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var services = selectedServices().filter(function (service) { return allowedServices.indexOf(service) !== -1; });
    if (!services.length) {
      statusEl.textContent = "Pasirinkite bent vieną paslaugą.";
      return;
    }
    if (services.indexOf("kapu_tvarkymas") !== -1 && !selectedNamedValues("cleaning_tasks").length) {
      statusEl.textContent = "Pasirinkite bent vieną tvarkymo darbą.";
      return;
    }

    if (!AtminimasAuth.accessToken()) {
      saveDraft();
      window.location.href = "prisijungti.html?next=" + encodeURIComponent("index.html#kitos-paslaugos");
      return;
    }

    var values = Object.fromEntries(new FormData(form).entries());
    var candleKeys = selectedNamedValues("candle_package");
    var flowerKeys = selectedNamedValues("flower_package");
    var cleaningKeys = selectedNamedValues("cleaning_tasks");
    var payload = {
      owner_id: AtminimasAuth.userId(),
      paslaugos: services,
      mirusiojo_vardas: values.deceased_name.trim(),
      kapiniu_pavadinimas: values.cemetery_name.trim(),
      kapo_vieta: values.grave_location.trim(),
      geliu_pageidavimai: services.indexOf("geles") !== -1 ? optionDetails(flowerKeys, (values.flowers_details || "").trim(), "Pasirinkimas") : null,
      zvakiu_pageidavimai: services.indexOf("zvakes") !== -1 ? optionDetails(candleKeys, (values.candles_details || "").trim(), "Pasirinkimas") : null,
      tvarkymo_pageidavimai: services.indexOf("kapu_tvarkymas") !== -1 ? optionDetails(cleaningKeys, (values.cleaning_details || "").trim(), "Darbai") : null,
      papildoma_informacija: (values.extra_information || "").trim() || null
    };

    submitButton.disabled = true;
    statusEl.textContent = "Užklausa siunčiama...";
    try {
      var response = await fetch(restUrl("paslaugu_uzklausos"), {
        method: "POST",
        headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Prisijungimo sesija baigėsi. Prisijunkite iš naujo.");
        throw new Error("Nepavyko pateikti užklausos.");
      }
      sessionStorage.removeItem(draftKey);
      form.reset();
      updateServiceFields();
      statusEl.textContent = "Užklausa gauta. Susisieksime dėl kainos ir atlikimo laiko.";
    } catch (error) {
      statusEl.textContent = error.message || "Nepavyko pateikti užklausos.";
    } finally {
      submitButton.disabled = false;
    }
  });

  renderPrices();
  restoreDraft();
  updateServiceFields();
})();
