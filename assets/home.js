(function () {
  var form = document.getElementById("service-request-form");
  if (!form) return;

  var details = document.getElementById("service-details");
  var statusEl = document.getElementById("service-request-status");
  var submitButton = form.querySelector("button[type='submit']");
  var serviceInputs = Array.from(form.querySelectorAll("input[name='services']"));
  var draftKey = "atminimas.service-request.draft.v1";
  var allowedServices = ["zvakes", "geles", "kapu_tvarkymas"];

  function config() {
    return window.ATMINIMAS_CONFIG;
  }

  function selectedServices() {
    return serviceInputs.filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
  }

  function updateServiceFields() {
    var selected = selectedServices();
    details.hidden = selected.length === 0;
    form.querySelectorAll("[data-service-details]").forEach(function (section) {
      section.hidden = selected.indexOf(section.dataset.serviceDetails) === -1;
    });
  }

  function saveDraft() {
    var draft = Object.fromEntries(new FormData(form).entries());
    draft.services = selectedServices();
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }

  function restoreDraft() {
    var raw = sessionStorage.getItem(draftKey);
    if (!raw) return;
    try {
      var draft = JSON.parse(raw);
      Object.keys(draft).forEach(function (name) {
        if (name === "services") return;
        if (form.elements[name]) form.elements[name].value = draft[name];
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

  serviceInputs.forEach(function (input) {
    input.addEventListener("change", updateServiceFields);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var services = selectedServices().filter(function (service) { return allowedServices.indexOf(service) !== -1; });
    if (!services.length) {
      statusEl.textContent = "Pasirinkite bent vieną paslaugą.";
      return;
    }

    if (!AtminimasAuth.accessToken()) {
      saveDraft();
      window.location.href = "prisijungti.html?next=" + encodeURIComponent("index.html#kitos-paslaugos");
      return;
    }

    var values = Object.fromEntries(new FormData(form).entries());
    var payload = {
      owner_id: AtminimasAuth.userId(),
      paslaugos: services,
      mirusiojo_vardas: values.deceased_name.trim(),
      kapiniu_pavadinimas: values.cemetery_name.trim(),
      kapo_vieta: values.grave_location.trim(),
      geliu_pageidavimai: services.indexOf("geles") !== -1 ? (values.flowers_details || "").trim() || null : null,
      zvakiu_pageidavimai: services.indexOf("zvakes") !== -1 ? (values.candles_details || "").trim() || null : null,
      tvarkymo_pageidavimai: services.indexOf("kapu_tvarkymas") !== -1 ? (values.cleaning_details || "").trim() || null : null,
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

  restoreDraft();
  updateServiceFields();
})();
