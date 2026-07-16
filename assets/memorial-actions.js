(function (global) {
  var savedKey = "atminimas.saved-memorials.v1";
  var initialized = false;
  var profile = null;

  function config() {
    return global.ATMINIMAS_CONFIG || {};
  }

  function functionUrl() {
    return config().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/memorial-engagement";
  }

  function requestHeaders(jsonBody) {
    var headers = { apikey: config().SUPABASE_ANON_KEY, Accept: "application/json" };
    if (jsonBody) headers["Content-Type"] = "application/json";
    if (config().SUPABASE_ANON_KEY && config().SUPABASE_ANON_KEY.indexOf("sb_publishable_") !== 0) {
      headers.Authorization = "Bearer " + config().SUPABASE_ANON_KEY;
    }
    return headers;
  }

  function profileName() {
    return [profile && profile.vardas, profile && profile.pavarde].filter(Boolean).join(" ") || "Atminimas";
  }

  function pageUrl() {
    return new URL(global.location.href).href;
  }

  function toast(message) {
    if (global.AtminimasUi) AtminimasUi.toast(message);
  }

  function copyText(value) {
    if (global.AtminimasUi) return AtminimasUi.copyText(value);
    return navigator.clipboard.writeText(value);
  }

  function savedItems() {
    try {
      var saved = JSON.parse(localStorage.getItem(savedKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (_error) {
      return [];
    }
  }

  function savedIndex() {
    return savedItems().findIndex(function (item) { return item.id === profile.id; });
  }

  function updateSaveButton() {
    var button = document.querySelector("[data-memorial-action='save']");
    if (!button) return;
    var saved = savedIndex() >= 0;
    button.classList.toggle("is-active", saved);
    button.innerHTML = '<span aria-hidden="true">' + (saved ? "♥" : "♡") + "</span>" + (saved ? "Išsaugota" : "Išsaugoti");
  }

  function toggleSaved() {
    var saved = savedItems();
    var index = saved.findIndex(function (item) { return item.id === profile.id; });
    if (index >= 0) {
      saved.splice(index, 1);
      toast("Atminimas pašalintas iš išsaugotų.");
    } else {
      saved.unshift({
        id: profile.id,
        name: profileName(),
        url: pageUrl(),
        death_date: profile.mirties_data || null
      });
      toast("Atminimas išsaugotas šiame telefone.");
    }
    localStorage.setItem(savedKey, JSON.stringify(saved.slice(0, 100)));
    updateSaveButton();
  }

  async function sharePage() {
    var data = {
      title: profileName() + " – Atminimas",
      text: "Aplankykite " + profileName() + " atminimo puslapį.",
      url: pageUrl()
    };
    if (navigator.share) {
      try { await navigator.share(data); } catch (_error) {}
      return;
    }
    await copyText(pageUrl());
    toast("Atminimo puslapio nuoroda nukopijuota.");
  }

  async function downloadQr() {
    var url = global.AtminimasApi.qrImageUrl(pageUrl());
    var response = await fetch(url);
    if (!response.ok) throw new Error("QR kodo atsisiųsti nepavyko.");
    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = "atminimas-" + profile.id + "-qr.svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    toast("QR kodas paruoštas.");
  }

  function escapeIcs(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function reminderDate() {
    var match = String(profile.mirties_data || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { month: match[2], day: match[3] };
  }

  function downloadReminder() {
    var date = reminderDate();
    if (!date) {
      toast("Sukakties priminimui reikia pilnos mirties datos.");
      return;
    }
    var now = new Date();
    var stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    var year = now.getFullYear();
    var start = String(year) + date.month + date.day;
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Atminimas//Sukakties priminimas//LT",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + escapeIcs(profile.id) + "@atminimas",
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + start,
      "DURATION:P1D",
      "RRULE:FREQ=YEARLY",
      "SUMMARY:" + escapeIcs(profileName() + " atminimo diena"),
      "DESCRIPTION:" + escapeIcs("Aplankyti atminimo puslapį: " + pageUrl()),
      "URL:" + pageUrl(),
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = "atminimo-priminimas-" + profile.id + ".ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    toast("Sukakties priminimas paruoštas kalendoriui.");
  }

  function openPhotos() {
    var first = document.querySelector(".builder-photo, .nuotrauka-kortele, .memorial-story-gallery button");
    if (first) first.click();
    else toast("Šiame puslapyje nuotraukų nėra.");
  }

  function candleLabel(count) {
    var value = Number(count) || 0;
    var ending = value % 10 === 1 && value % 100 !== 11 ? "žvakė"
      : ([2, 3, 4].indexOf(value % 10) !== -1 && (value % 100 < 10 || value % 100 >= 20) ? "žvakės" : "žvakių");
    return value + " " + ending;
  }

  function renderEngagement(data) {
    document.getElementById("memorial-candle-count").textContent = candleLabel(data.candle_count);
    var list = document.getElementById("memorial-memory-list");
    var memories = Array.isArray(data.memories) ? data.memories : [];
    list.innerHTML = "";
    if (!memories.length) {
      var empty = document.createElement("p");
      empty.className = "memorial-memory-empty";
      empty.textContent = "Paskelbtų prisiminimų dar nėra.";
      list.appendChild(empty);
      return;
    }
    memories.forEach(function (memory) {
      var article = document.createElement("article");
      var message = document.createElement("blockquote");
      message.textContent = memory.message;
      var footer = document.createElement("footer");
      var date = new Date(memory.created_at);
      footer.textContent = memory.author_name + " · " + new Intl.DateTimeFormat("lt-LT", { dateStyle: "medium" }).format(date);
      article.appendChild(message);
      article.appendChild(footer);
      list.appendChild(article);
    });
  }

  async function loadEngagement() {
    var response = await fetch(functionUrl() + "?profile_id=" + encodeURIComponent(profile.id), {
      headers: requestHeaders(false)
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Prisiminimų įkelti nepavyko.");
    renderEngagement(data);
  }

  async function postEngagement(payload) {
    var response = await fetch(functionUrl(), {
      method: "POST",
      headers: requestHeaders(true),
      body: JSON.stringify(Object.assign({ profile_id: profile.id }, payload))
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Veiksmo atlikti nepavyko.");
    return data;
  }

  function setupActions() {
    document.getElementById("memorial-action-bar").addEventListener("click", function (event) {
      var button = event.target.closest("[data-memorial-action]");
      if (!button) return;
      var action = button.dataset.memorialAction;
      if (action === "share") sharePage();
      if (action === "copy") copyText(pageUrl()).then(function () { toast("Nuoroda nukopijuota."); });
      if (action === "qr") downloadQr().catch(function (error) { toast(error.message); });
      if (action === "save") toggleSaved();
      if (action === "reminder") downloadReminder();
      if (action === "photos") openPhotos();
    });

    var candleButton = document.getElementById("memorial-light-candle");
    var status = document.getElementById("memorial-engagement-status");
    candleButton.addEventListener("click", function () {
      candleButton.disabled = true;
      status.textContent = "Uždegama žvakė…";
      postEngagement({ action: "candle" }).then(function (data) {
        renderEngagement(data);
        document.querySelector(".memorial-candle-flame").classList.add("is-lit");
        status.textContent = "Virtuali žvakė uždegta.";
      }).catch(function (error) {
        status.textContent = error.message;
      }).finally(function () { candleButton.disabled = false; });
    });

    document.getElementById("memorial-memory-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      if (!form.reportValidity()) return;
      var values = Object.fromEntries(new FormData(form).entries());
      var submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      status.textContent = "Prisiminimas pateikiamas…";
      postEngagement({
        action: "memory",
        author_name: values.author_name,
        message: values.message,
        website: values.website,
        consent: values.consent === "on"
      }).then(function (data) {
        form.reset();
        status.textContent = data.message || "Prisiminimas gautas ir laukia peržiūros.";
      }).catch(function (error) {
        status.textContent = error.message;
      }).finally(function () { submit.disabled = false; });
    });
  }

  function init(nextProfile) {
    profile = nextProfile;
    document.getElementById("memorial-action-bar").hidden = false;
    document.getElementById("memorial-community").hidden = false;
    updateSaveButton();
    if (!initialized) {
      initialized = true;
      setupActions();
    }
    loadEngagement().catch(function () {
      document.getElementById("memorial-engagement-status").textContent = "Virtualios žvakės ir prisiminimai laikinai nepasiekiami.";
    });
  }

  global.AtminimasMemorialActions = { init: init };
})(window);
