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
  var stepStatusEl = document.getElementById("service-step-status");
  var estimateEl = document.getElementById("service-estimate-price");
  var estimateServicesEl = document.getElementById("service-estimate-services");
  var estimateTravelEl = document.getElementById("service-estimate-travel");
  var estimateNoteEl = document.getElementById("service-estimate-note");
  var locationStatusEl = document.getElementById("service-location-status");
  var submitButton = form.querySelector("button[type='submit']");
  var serviceInputs = Array.from(form.querySelectorAll("input[name='services']"));
  var cleaningInputs = Array.from(form.querySelectorAll("input[name='cleaning_tasks']"));
  var serviceSteps = Array.from(form.querySelectorAll("[data-service-step]"));
  var serviceStepButtons = Array.from(form.querySelectorAll("[data-service-step-button]"));
  var serviceStepProgress = document.getElementById("service-step-progress");
  var savedGraveWrap = document.getElementById("service-saved-grave-wrap");
  var savedGraveSelect = document.getElementById("service-saved-grave");
  var productCatalogVisual = form.querySelector("[data-service-product-catalog]");
  var selectionSummary = form.querySelector(".service-selection-summary");
  var selectionItemsEl = document.getElementById("service-selection-items");
  var selectionStatusEl = document.getElementById("service-selection-status");
  var travelPolicyEl = document.getElementById("service-travel-policy");
  var currentServiceStep = 1;
  var draftKey = "atminimas.service-request.draft.v1";
  var savedGravesKey = "atminimas.saved-graves.v1";
  var allowedServices = ["zvakes", "geles", "kapu_tvarkymas"];
  // Matomos iškart, o skaitinis serverio katalogas jas pakeičia, kai tik yra pasiekiamas.
  var defaultServicePrices = {
    candle_1: 300,
    candle_2: 500,
    candle_5: 2000,
    candle_other: null,
    flower_1: 500,
    flower_3: 1500,
    flower_5: 2500,
    flower_bouquet: null,
    flower_other: null,
    cleaning_full: 12000,
    cleaning_grooves: 2000,
    cleaning_surface: 1500,
    cleaning_monument: 3000,
    cleaning_leaves: 5000
  };
  var prices = Object.assign({}, defaultServicePrices);
  var travelSettings = {
    base_label: "Panevėžys",
    included_round_trip_km: 20,
    travel_rate_cents_per_km: 35,
    manual_review_over_one_way_km: 200
  };
  var estimateSnapshot = null;
  var estimateTimer = null;
  var estimateRequestNumber = 0;
  var priceCatalogLoaded = true;
  var isFillingLocation = false;
  var optionLabels = {
    candle_style_clear: "Skaidraus stiklo",
    candle_style_amber: "Gintarinio stiklo",
    candle_style_long_burn: "Ilgai deganti",
    candle_1: "1 žvakė",
    candle_2: "2 žvakės",
    candle_5: "5 žvakės",
    candle_other: "Kitas žvakių kiekis",
    flower_1: "1 gėlė",
    flower_3: "3 gėlės",
    flower_5: "5 gėlės",
    flower_bouquet: "Puokštė",
    flower_other: "Kitas gėlių kiekis",
    flower_style_white: "Baltos chrizantemos",
    flower_style_burgundy: "Bordo rožės",
    flower_style_seasonal: "Sezoninės gėlės",
    cleaning_full: "Pilnas kapavietės sutvarkymas",
    cleaning_grooves: "Griovelių išvalymas",
    cleaning_surface: "Kapavietės viršaus nušlavimas",
    cleaning_monument: "Paminklo nuvalymas",
    cleaning_leaves: "Lapų ir šiukšlių surinkimas"
  };
  var priceGroups = {
    zvakes: ["candle_1", "candle_2", "candle_5"],
    geles: ["flower_1", "flower_3", "flower_5", "flower_bouquet"],
    kapu_tvarkymas: ["cleaning_full", "cleaning_grooves", "cleaning_surface", "cleaning_monument", "cleaning_leaves"]
  };
  var manualPriceKeys = ["candle_other", "flower_bouquet", "flower_other"];

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
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function formatCents(value) {
    return new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(value / 100);
  }

  function priceTextForKeys(keys) {
    if (!keys.length) return "derinama";
    var values = keys.map(priceValue);
    if (values.some(function (value) { return value === null; })) return "derinama";
    return formatCents(values.reduce(function (sum, value) { return sum + value; }, 0));
  }

  function selectedValue(name) {
    var values = selectedNamedValues(name);
    return values.length ? values[0] : "";
  }

  function optionPriceText(key) {
    if (!key) return "Pasirinkite";
    var value = priceValue(key);
    if (value !== null) return formatCents(value);
    if (!priceCatalogLoaded) return "Skaičiuojama…";
    return manualPriceKeys.indexOf(key) !== -1 ? "Derinama individualiai" : "Kaina derinama";
  }

  function selectionItem(group, description, priceKey, incomplete) {
    var item = document.createElement("li");
    item.className = "service-selection-list__item" + (incomplete ? " is-incomplete" : "");
    var copy = document.createElement("span");
    var label = document.createElement("small");
    var value = document.createElement("strong");
    var price = document.createElement("b");
    label.textContent = group;
    value.textContent = description;
    price.textContent = optionPriceText(priceKey);
    copy.appendChild(label);
    copy.appendChild(value);
    item.appendChild(copy);
    item.appendChild(price);
    return item;
  }

  function renderSelectionSummary(announce) {
    if (!selectionItemsEl) return;
    var services = selectedServices();
    var items = [];
    var statusParts = [];
    var flowerStyle = selectedValue("flower_style");
    var flowerPackage = selectedValue("flower_package");
    var candleStyle = selectedValue("candle_style");
    var candlePackage = selectedValue("candle_package");
    var cleaningTasks = selectedNamedValues("cleaning_tasks");

    if (services.indexOf("geles") !== -1) {
      var flowerReady = Boolean(flowerStyle && flowerPackage);
      var flowerDescription = flowerReady
        ? optionLabels[flowerStyle] + " · " + optionLabels[flowerPackage]
        : flowerStyle
        ? optionLabels[flowerStyle] + " · pasirinkite kiekį"
        : flowerPackage
        ? "Pasirinkite rūšį · " + optionLabels[flowerPackage]
        : "Pasirinkite rūšį ir kiekį";
      items.push(selectionItem("Gėlės", flowerDescription, flowerPackage, !flowerReady));
      if (flowerReady) statusParts.push(flowerDescription + " – " + optionPriceText(flowerPackage));
    }

    if (services.indexOf("zvakes") !== -1) {
      var candleReady = Boolean(candleStyle && candlePackage);
      var candleDescription = candleReady
        ? optionLabels[candleStyle] + " · " + optionLabels[candlePackage]
        : candleStyle
        ? optionLabels[candleStyle] + " · pasirinkite kiekį"
        : candlePackage
        ? "Pasirinkite tipą · " + optionLabels[candlePackage]
        : "Pasirinkite tipą ir kiekį";
      items.push(selectionItem("Žvakės", candleDescription, candlePackage, !candleReady));
      if (candleReady) statusParts.push(candleDescription + " – " + optionPriceText(candlePackage));
    }

    if (services.indexOf("kapu_tvarkymas") !== -1) {
      if (cleaningTasks.length) {
        cleaningTasks.forEach(function (key) {
          items.push(selectionItem("Tvarkymas", optionLabels[key], key, false));
          statusParts.push(optionLabels[key] + " – " + optionPriceText(key));
        });
      } else {
        items.push(selectionItem("Tvarkymas", "Pasirinkite bent vieną darbą", "", true));
      }
    }

    selectionItemsEl.replaceChildren();
    if (items.length) {
      items.forEach(function (item) { selectionItemsEl.appendChild(item); });
    } else {
      var empty = document.createElement("li");
      empty.className = "service-selection-list__empty";
      empty.dataset.serviceSelectionEmpty = "";
      empty.textContent = "Pasirinkite variantus kairėje — čia iškart matysite jų kainą.";
      selectionItemsEl.appendChild(empty);
    }

    if (selectionSummary) {
      var accent = flowerStyle || candleStyle || (cleaningTasks.length ? "cleaning" : "neutral");
      selectionSummary.dataset.selectionAccent = accent;
    }
    if (announce && selectionStatusEl) {
      selectionStatusEl.textContent = statusParts.length
        ? "Pasirinkimas atnaujintas: " + statusParts.join("; ") + "."
        : "Pasirinkimas atnaujintas. Dar pasirinkite konkrečius variantus.";
    }
  }

  function renderTravelPolicy(result) {
    if (result && Number.isInteger(result.travel_rate_cents_per_km) && result.travel_rate_cents_per_km >= 0) {
      if (result.base_label) travelSettings.base_label = result.base_label;
      if (Number.isFinite(Number(result.included_round_trip_km))) {
        travelSettings.included_round_trip_km = Number(result.included_round_trip_km);
      }
      travelSettings.travel_rate_cents_per_km = result.travel_rate_cents_per_km;
      if (Number.isFinite(Number(result.manual_review_over_one_way_km))) {
        travelSettings.manual_review_over_one_way_km = Number(result.manual_review_over_one_way_km);
      }
    }
    if (!travelPolicyEl) return;
    var heading = document.createElement("strong");
    heading.textContent = "Išvykimo vieta – " + travelSettings.base_label + ". ";
    var rule = "pirmi " + travelSettings.included_round_trip_km + " km pirmyn ir atgal įskaičiuoti, toliau – " + formatCents(travelSettings.travel_rate_cents_per_km) + "/km. Virš " + travelSettings.manual_review_over_one_way_km + " km viena kryptimi kainą patvirtinsime individualiai.";
    travelPolicyEl.replaceChildren(heading, document.createTextNode(rule));
  }

  function selectedPriceKeys() {
    var services = selectedServices();
    var keys = [];
    if (services.indexOf("zvakes") !== -1) keys = keys.concat(selectedNamedValues("candle_package"));
    if (services.indexOf("geles") !== -1) keys = keys.concat(selectedNamedValues("flower_package"));
    if (services.indexOf("kapu_tvarkymas") !== -1) keys = keys.concat(selectedNamedValues("cleaning_tasks"));
    return keys;
  }

  function functionUrl(name) {
    return config().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + encodeURIComponent(name);
  }

  async function serviceFlow(payload) {
    var response = await fetch(functionUrl("service-flow"), {
      method: "POST",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify(payload)
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(result.error || "Paslaugos įvertinti nepavyko.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function priceRange(minimum, maximum) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) return "–";
    return minimum === maximum ? formatCents(minimum) : formatCents(minimum) + "–" + formatCents(maximum);
  }

  function updateLocationStatus() {
    var latitude = Number(form.elements.destination_latitude.value);
    var longitude = Number(form.elements.destination_longitude.value);
    var hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && form.elements.destination_latitude.value !== "" && form.elements.destination_longitude.value !== "";
    if (hasCoordinates) {
      locationStatusEl.textContent = "Tiksli kapavietės vieta gauta iš kapų paieškos. Kelionės intervalą apskaičiuosime automatiškai.";
      locationStatusEl.dataset.state = "saved";
    } else {
      locationStatusEl.innerHTML = "Tikslias koordinates galite pasirinkti <a href=\"kapu-ieskojimas.html\">kapų paieškoje</a>. Jei įrašysite tik miestą ar rajoną, kelionės kainą įvertinsime rankiniu būdu.";
      locationStatusEl.dataset.state = "manual";
    }
  }

  function renderEstimate(result) {
    estimateSnapshot = result || null;
    if (result && result.price_catalog_cents) {
      Object.keys(defaultServicePrices).forEach(function (key) {
        var value = result.price_catalog_cents[key];
        if (Number.isInteger(value) && value >= 0) prices[key] = value;
      });
      priceCatalogLoaded = true;
      renderPrices();
    }
    renderTravelPolicy(result);
    var reasons = result && Array.isArray(result.reasons) ? result.reasons : [];
    var servicesMissing = reasons.indexOf("services_missing") !== -1;
    var selectedKeys = selectedPriceKeys();
    var hasCurrentTravelContract = Boolean(result && Number.isInteger(result.travel_rate_cents_per_km));
    var customOption = reasons.indexOf("custom_option") !== -1 || selectedKeys.some(function (key) {
      return key.endsWith("_other") || (manualPriceKeys.indexOf(key) !== -1 && priceValue(key) === null);
    });
    var distanceLimit = hasCurrentTravelContract
      ? reasons.indexOf("distance_limit") !== -1
      : Boolean(result && Number(result.estimated_one_way_max_km) > travelSettings.manual_review_over_one_way_km);
    var localServiceValues = selectedKeys.map(priceValue);
    var localServiceCents = selectedKeys.length && localServiceValues.every(function (value) { return value !== null; })
      ? localServiceValues.reduce(function (sum, value) { return sum + value; }, 0)
      : null;
    var serviceCents = result && !servicesMissing && Number.isInteger(result.estimated_service_cents)
      ? result.estimated_service_cents
      : localServiceCents;
    estimateServicesEl.textContent = result && !servicesMissing && Number.isInteger(result.estimated_service_cents)
      ? formatCents(serviceCents)
      : customOption
      ? "Derinama"
      : Number.isInteger(serviceCents)
      ? formatCents(serviceCents)
      : "–";
    var distance = result && Number.isFinite(result.estimated_round_trip_min_km) && Number.isFinite(result.estimated_round_trip_max_km)
      ? (result.estimated_round_trip_min_km === result.estimated_round_trip_max_km
        ? result.estimated_round_trip_min_km + " km"
        : result.estimated_round_trip_min_km + "–" + result.estimated_round_trip_max_km + " km")
      : "";
    var travelMinCents = result && Number.isInteger(result.estimated_travel_min_cents)
      ? result.estimated_travel_min_cents
      : !hasCurrentTravelContract && result && Number.isFinite(result.estimated_round_trip_min_km)
      ? Math.round(Math.max(0, result.estimated_round_trip_min_km - travelSettings.included_round_trip_km) * travelSettings.travel_rate_cents_per_km)
      : null;
    var travelMaxCents = result && Number.isInteger(result.estimated_travel_max_cents)
      ? result.estimated_travel_max_cents
      : !hasCurrentTravelContract && result && Number.isFinite(result.estimated_round_trip_max_km)
      ? Math.round(Math.max(0, result.estimated_round_trip_max_km - travelSettings.included_round_trip_km) * travelSettings.travel_rate_cents_per_km)
      : null;
    estimateTravelEl.textContent = result
      ? priceRange(travelMinCents, travelMaxCents) + (distance ? " · " + distance : "")
      : "–";
    var totalMinCents = result && Number.isInteger(result.estimated_total_min_cents)
      ? result.estimated_total_min_cents
      : !distanceLimit && !customOption && Number.isInteger(serviceCents) && Number.isInteger(travelMinCents)
      ? serviceCents + travelMinCents
      : null;
    var totalMaxCents = result && Number.isInteger(result.estimated_total_max_cents)
      ? result.estimated_total_max_cents
      : !distanceLimit && !customOption && Number.isInteger(serviceCents) && Number.isInteger(travelMaxCents)
      ? serviceCents + travelMaxCents
      : null;
    estimateEl.textContent = result ? priceRange(totalMinCents, totalMaxCents) : "–";
    var locallyCalculated = !servicesMissing && !customOption && !distanceLimit && Number.isInteger(totalMinCents) && Number.isInteger(totalMaxCents);
    if (selectionSummary) selectionSummary.dataset.estimateState = locallyCalculated ? "calculated" : result ? result.estimate_status : "loading";
    if (distanceLimit) {
      estimateNoteEl.textContent = "Tai tolima išvyka. Kelionės intervalas orientacinis; prieš priimdami užklausą individualiai patvirtinsime atvykimo ir bendrą kainą.";
    } else if (reasons.indexOf("coordinates_missing") !== -1) {
      estimateNoteEl.textContent = "Vietos automatiškai įvertinti nepavyko. Pateikite užklausą – kelionę ir galutinę kainą nustatysime rankiniu būdu.";
    } else if (customOption) {
      estimateNoteEl.textContent = "Pasirinkto individualaus kiekio ar puokštės kainą patvirtinsime pagal jūsų pageidavimus. Kelionė skaičiuojama atskirai pirmyn ir atgal.";
    } else if (locallyCalculated || result && result.estimate_status === "calculated") {
      estimateNoteEl.textContent = "Rodoma preliminari kaina pagal pasirinktus darbus ir apytikslį kelionės atstumą nuo išvykimo vietos (" + (result.base_label || travelSettings.base_label) + "). Kelionė skaičiuojama pirmyn ir atgal. Galutinę kainą patvirtinsime atskiru pasiūlymu.";
    } else if (result && result.estimate_status === "unconfigured") {
      estimateNoteEl.textContent = "Dalis kainodaros dar nenustatyta. Pateikite užklausą – galutinį pasiūlymą paruošime rankiniu būdu.";
    } else {
      estimateNoteEl.textContent = "Galutinę kainą patvirtinsime atskiru pasiūlymu. Be jūsų patvirtinimo mokėjimas nebus pradėtas.";
    }
  }

  async function refreshEstimate() {
    var requestNumber = ++estimateRequestNumber;
    try {
      var result = await serviceFlow({
        action: "estimate",
        price_keys: selectedPriceKeys(),
        destination_latitude: form.elements.destination_latitude.value || null,
        destination_longitude: form.elements.destination_longitude.value || null
      });
      if (requestNumber === estimateRequestNumber) renderEstimate(result);
    } catch (error) {
      if (requestNumber !== estimateRequestNumber) return;
      estimateServicesEl.textContent = priceTextForKeys(selectedPriceKeys()) === "derinama" ? "–" : priceTextForKeys(selectedPriceKeys());
      estimateTravelEl.textContent = "–";
      estimateEl.textContent = "–";
      estimateNoteEl.textContent = "Preliminaraus įverčio šiuo metu parodyti nepavyko. Galutinę kainą patvirtinsime gavę užklausą.";
    }
  }

  function updateEstimate() {
    clearTimeout(estimateTimer);
    estimateTimer = setTimeout(refreshEstimate, 180);
  }

  function renderPrices() {
    form.querySelectorAll("[data-service-price]").forEach(function (element) {
      var value = priceValue(element.dataset.servicePrice);
      element.textContent = value === null
        ? priceCatalogLoaded && manualPriceKeys.indexOf(element.dataset.servicePrice) !== -1
          ? "Derinama individualiai"
          : priceCatalogLoaded
          ? "Kaina derinama"
          : "Skaičiuojama…"
        : formatCents(value);
    });
    form.querySelectorAll("[data-service-price-group]").forEach(function (element) {
      var values = (priceGroups[element.dataset.servicePriceGroup] || [])
        .map(priceValue)
        .filter(function (value) { return value !== null; });
      element.textContent = values.length ? formatCents(Math.min.apply(Math, values)) : "–";
    });
    renderSelectionSummary(false);
  }

  function updateServiceFields() {
    var selected = selectedServices();
    details.hidden = selected.length === 0 || currentServiceStep === 1;
    if (productCatalogVisual) {
      productCatalogVisual.hidden = selected.indexOf("geles") === -1 && selected.indexOf("zvakes") === -1;
    }
    if (!selected.length && currentServiceStep > 1) activateServiceStep(1, false);
    form.querySelectorAll("[data-service-details]").forEach(function (section) {
      var enabled = selected.indexOf(section.dataset.serviceDetails) !== -1;
      section.hidden = !enabled;
      section.querySelectorAll("input, textarea, select").forEach(function (field) {
        field.disabled = !enabled;
        if (field.hasAttribute("data-service-required")) field.required = enabled;
      });
    });
    renderSelectionSummary(false);
    updateEstimate();
  }

  function activateServiceStep(number, scroll) {
    number = Math.max(1, Math.min(4, Number(number) || 1));
    currentServiceStep = number;
    details.hidden = number === 1 || !selectedServices().length;
    serviceSteps.forEach(function (step) {
      var active = Number(step.dataset.serviceStep) === number;
      step.hidden = !active;
      step.classList.toggle("is-active", active);
    });
    serviceStepButtons.forEach(function (button) {
      var active = Number(button.dataset.serviceStepButton) === number;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (serviceStepProgress) serviceStepProgress.style.width = (number * 25) + "%";
    var activeStep = serviceSteps.find(function (step) { return Number(step.dataset.serviceStep) === number; });
    if (scroll && activeStep) activeStep.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validateServiceStep(number) {
    stepStatusEl.textContent = "";
    if (number === 1 && !selectedServices().length) {
      stepStatusEl.textContent = "Pasirinkite bent vieną paslaugą.";
      return false;
    }
    if (number === 3 && selectedServices().indexOf("kapu_tvarkymas") !== -1 && !selectedNamedValues("cleaning_tasks").length) {
      stepStatusEl.textContent = "Pasirinkite bent vieną kapavietės priežiūros darbą.";
      return false;
    }
    var step = serviceSteps.find(function (item) { return Number(item.dataset.serviceStep) === number; });
    var invalid = step && Array.from(step.querySelectorAll("input, textarea, select")).find(function (field) {
      return !field.disabled && !field.checkValidity();
    });
    if (!invalid) return true;
    invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function savedGraves() {
    try {
      var saved = JSON.parse(localStorage.getItem(savedGravesKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (_error) {
      return [];
    }
  }

  function fillGrave(grave) {
    if (!grave) return;
    var placeParts = String(grave.place || "").split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    var cemetery = grave.cemetery || placeParts.shift() || "";
    var municipality = grave.municipality || placeParts.join(", ") || "";
    isFillingLocation = true;
    form.elements.deceased_name.value = grave.name || "";
    form.elements.cemetery_name.value = cemetery;
    form.elements.municipality.value = municipality;
    form.elements.grave_location.value = grave.place || [cemetery, municipality].filter(Boolean).join(", ");
    form.elements.destination_latitude.value = grave.latitude || "";
    form.elements.destination_longitude.value = grave.longitude || "";
    form.elements.location_source.value = grave.latitude && grave.longitude ? (grave.source || "saved") : "manual";
    isFillingLocation = false;
    updateLocationStatus();
    updateEstimate();
  }

  function setupSavedGraves() {
    var saved = savedGraves();
    if (savedGraveWrap) savedGraveWrap.hidden = saved.length === 0;
    if (savedGraveSelect) {
      saved.forEach(function (grave, index) {
        var option = document.createElement("option");
        option.value = String(index);
        option.textContent = [grave.name, grave.place].filter(Boolean).join(" – ");
        savedGraveSelect.appendChild(option);
      });
      savedGraveSelect.addEventListener("change", function () {
        var grave = saved[Number(savedGraveSelect.value)];
        if (grave) fillGrave(grave);
      });
    }

    var params = new URLSearchParams(window.location.search);
    var name = (params.get("graveName") || "").trim();
    var place = (params.get("gravePlace") || "").trim();
    if (name || place) {
      fillGrave({
        name: name,
        place: place,
        cemetery: (params.get("graveCemetery") || "").trim(),
        municipality: (params.get("graveMunicipality") || "").trim(),
        latitude: (params.get("graveLat") || "").trim(),
        longitude: (params.get("graveLng") || "").trim(),
        source: "registry"
      });
      var hasRequestedService = params.has("service");
      var requestedService = (params.get("service") || "").trim();
      var selectedService = allowedServices.indexOf(requestedService) !== -1
        ? requestedService
        : (hasRequestedService ? "" : "kapu_tvarkymas");
      var chosenService = selectedService
        ? form.querySelector("input[name='services'][value='" + selectedService + "']")
        : null;
      serviceInputs.forEach(function (input) {
        input.checked = Boolean(chosenService && input === chosenService);
      });
      updateServiceFields();
      var locationReady = ["deceased_name", "cemetery_name", "municipality", "grave_location"].every(function (fieldName) {
        return String(form.elements[fieldName].value || "").trim().length > 1;
      });
      activateServiceStep(chosenService ? (locationReady ? 3 : 2) : 1, false);
      window.setTimeout(function () {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
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

  function normalizeCleaningSelection() {
    var full = form.querySelector("[data-cleaning-full]");
    if (!full || !full.checked) return;
    cleaningInputs.forEach(function (input) {
      if (input !== full) input.checked = false;
    });
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
      normalizeCleaningSelection();
      updateServiceFields();
      updateLocationStatus();
    } catch (_error) {
      sessionStorage.removeItem(draftKey);
    }
  }

  function optionDetails(keys, freeText, noun) {
    var lines = [];
    if (keys.length) lines.push(noun + ": " + keys.map(function (key) { return optionLabels[key] || key; }).join(", "));
    if (freeText) lines.push("Pageidavimai: " + freeText);
    return lines.join("\n");
  }

  function productDetails(styleKeys, packageKeys, freeText) {
    var lines = [];
    if (styleKeys.length) lines.push("Rūšis: " + styleKeys.map(function (key) { return optionLabels[key] || key; }).join(", "));
    if (packageKeys.length) lines.push("Kiekis: " + packageKeys.map(function (key) { return optionLabels[key] || key; }).join(", "));
    if (freeText) lines.push("Pageidavimai: " + freeText);
    return lines.join("\n");
  }

  ["cemetery_name", "municipality", "grave_location"].forEach(function (name) {
    form.elements[name].addEventListener("input", function () {
      if (isFillingLocation || form.elements.location_source.value === "manual") {
        updateEstimate();
        return;
      }
      form.elements.destination_latitude.value = "";
      form.elements.destination_longitude.value = "";
      form.elements.location_source.value = "manual";
      updateLocationStatus();
      updateEstimate();
    });
  });

  serviceInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      updateServiceFields();
      renderSelectionSummary(true);
    });
  });

  form.querySelectorAll("[data-service-next]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!validateServiceStep(currentServiceStep)) return;
      activateServiceStep(currentServiceStep + 1, true);
    });
  });

  form.querySelectorAll("[data-service-back]").forEach(function (button) {
    button.addEventListener("click", function () {
      activateServiceStep(currentServiceStep - 1, true);
    });
  });

  serviceStepButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var requested = Number(button.dataset.serviceStepButton);
      if (requested < currentServiceStep) activateServiceStep(requested, true);
      else if (requested === currentServiceStep + 1 && validateServiceStep(currentServiceStep)) activateServiceStep(requested, true);
    });
  });

  form.querySelectorAll("input[name='candle_style'], input[name='candle_package'], input[name='flower_style'], input[name='flower_package']").forEach(function (input) {
    input.addEventListener("change", function () {
      renderSelectionSummary(true);
      updateEstimate();
    });
  });

  cleaningInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      var full = form.querySelector("[data-cleaning-full]");
      if (input === full && input.checked) {
        cleaningInputs.forEach(function (other) { if (other !== full) other.checked = false; });
      } else if (input.checked && full) {
        full.checked = false;
      }
      renderSelectionSummary(true);
      updateEstimate();
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var services = selectedServices().filter(function (service) { return allowedServices.indexOf(service) !== -1; });
    if (!services.length) {
      activateServiceStep(1, true);
      stepStatusEl.textContent = "Pasirinkite bent vieną paslaugą.";
      return;
    }
    if (services.indexOf("kapu_tvarkymas") !== -1 && !selectedNamedValues("cleaning_tasks").length) {
      activateServiceStep(3, true);
      stepStatusEl.textContent = "Pasirinkite bent vieną kapavietės priežiūros darbą.";
      return;
    }

    var values = Object.fromEntries(new FormData(form).entries());
    var candleKeys = selectedNamedValues("candle_package");
    var flowerKeys = selectedNamedValues("flower_package");
    var candleStyleKeys = selectedNamedValues("candle_style");
    var flowerStyleKeys = selectedNamedValues("flower_style");
    var cleaningKeys = selectedNamedValues("cleaning_tasks");
    var payload = {
      action: "create",
      services: services,
      deceased_name: values.deceased_name.trim(),
      cemetery_name: values.cemetery_name.trim(),
      municipality: values.municipality.trim(),
      grave_location: values.grave_location.trim(),
      destination_latitude: values.destination_latitude || null,
      destination_longitude: values.destination_longitude || null,
      location_source: values.location_source || "manual",
      contact_email: (values.contact_email || "").trim(),
      contact_phone: (values.contact_phone || "").trim() || null,
      website: (values.website || "").trim(),
      candle_keys: candleKeys,
      flower_keys: flowerKeys,
      cleaning_keys: cleaningKeys,
      flower_details: services.indexOf("geles") !== -1 ? productDetails(flowerStyleKeys, flowerKeys, (values.flowers_details || "").trim()) : null,
      candle_details: services.indexOf("zvakes") !== -1 ? productDetails(candleStyleKeys, candleKeys, (values.candles_details || "").trim()) : null,
      cleaning_details: services.indexOf("kapu_tvarkymas") !== -1 ? optionDetails(cleaningKeys, (values.cleaning_details || "").trim(), "Priežiūros darbai") : null,
      extra_information: (values.extra_information || "").trim() || null
    };

    submitButton.disabled = true;
    statusEl.textContent = "Užklausa siunčiama...";
    try {
      await serviceFlow(payload);
      sessionStorage.removeItem(draftKey);
      window.location.assign("aciu.html?type=service");
      return;
    } catch (error) {
      if (error.status === 401) {
        saveDraft();
        AtminimasAuth.signOut();
        window.location.href = "prisijungti.html?next=" + encodeURIComponent("kapu-prieziura.html#uzklausa");
        return;
      }
      statusEl.textContent = error.message || "Nepavyko pateikti užklausos.";
    } finally {
      submitButton.disabled = false;
    }
  });

  renderPrices();
  renderTravelPolicy(null);
  restoreDraft();
  updateServiceFields();
  setupSavedGraves();
  updateLocationStatus();
  refreshEstimate();
  AtminimasAuth.user().then(function (me) {
    if (me && me.email && !form.elements.contact_email.value) form.elements.contact_email.value = me.email;
  }).catch(function () {});
  if (currentServiceStep === 1) activateServiceStep(1, false);
})();
