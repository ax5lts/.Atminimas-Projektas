(function () {
  var userLocation = null;
  var savedKey = "atminimas.saved-graves.v1";

  function config() { return window.ATMINIMAS_CONFIG || {}; }
  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function shownDate(date, year, text) { return date || year || text || "?"; }
  function mapLocation(row) {
    if (row.latitude != null && row.longitude != null) return row.latitude + "," + row.longitude;
    return [row.cemetery, row.municipality].filter(Boolean).join(", ");
  }
  function mapUrl(row) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapLocation(row)); }
  function directionsUrl(row) {
    var destination = mapLocation(row);
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination);
    if (userLocation) url += "&origin=" + encodeURIComponent(userLocation.latitude + "," + userLocation.longitude);
    return url;
  }
  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function distanceKm(row) {
    var latitude = number(row.latitude);
    var longitude = number(row.longitude);
    if (!userLocation || latitude === null || longitude === null) return null;
    var radius = 6371;
    var toRadians = function (value) { return value * Math.PI / 180; };
    var dLat = toRadians(latitude - userLocation.latitude);
    var dLng = toRadians(longitude - userLocation.longitude);
    var start = toRadians(userLocation.latitude);
    var end = toRadians(latitude);
    var a = Math.sin(dLat / 2) ** 2 + Math.cos(start) * Math.cos(end) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function distanceText(row) {
    var distance = distanceKm(row);
    if (distance === null) return "";
    return distance < 1 ? Math.round(distance * 1000) + " m nuo jūsų" : distance.toFixed(distance < 10 ? 1 : 0) + " km nuo jūsų";
  }
  function mapEmbed(row) {
    var latitude = number(row.latitude);
    var longitude = number(row.longitude);
    if (latitude === null || longitude === null) return "";
    var delta = 0.0032;
    var bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
    return "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) +
      "&layer=mapnik&marker=" + encodeURIComponent(latitude + "," + longitude);
  }
  function savedGraves() {
    try {
      var saved = JSON.parse(localStorage.getItem(savedKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (_error) {
      return [];
    }
  }
  function graveKey(row) {
    return [row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "), row.cemetery, row.latitude, row.longitude].join("|");
  }
  function isSaved(row) {
    var key = graveKey(row);
    return savedGraves().some(function (item) { return item.key === key; });
  }
  function loader() {
    return "<div class='grave-loader' role='status' aria-live='polite'><span class='grave-loader__spinner' aria-hidden='true'></span><span>Ieškoma kapų duomenyse…</span></div>";
  }
  function render(row, rich) {
    var rawName = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ");
    var name = html(rawName);
    var dates = html(shownDate(row.birth_date, row.birth_year, row.birth_date_text) + "–" + shownDate(row.death_date, row.death_year, row.death_date_text));
    var rawPlace = [row.cemetery, row.municipality].filter(Boolean).join(", ");
    var place = html(rawPlace);
    var grave = [["sektorius", row.section], ["eilė", row.row_name], ["vieta", row.place_number]].filter(function (x) { return x[1]; }).map(function (x) { return x[0] + " " + html(x[1]); }).join(" · ");
    var burial = row.burial_date || row.burial_year ? html(shownDate(row.burial_date, row.burial_year, row.burial_date_text)) : "";
    var coordinates = row.latitude != null && row.longitude != null ? Number(row.latitude).toFixed(6) + ", " + Number(row.longitude).toFixed(6) : "";
    var map = mapLocation(row);
    var distance = distanceText(row);
    var embeddedMap = rich ? mapEmbed(row) : "";
    var saved = isSaved(row);
    var actionData = " data-grave-name='" + html(rawName) + "' data-grave-place='" + html(rawPlace) +
      "' data-grave-key='" + html(graveKey(row)) + "' data-grave-lat='" + html(row.latitude == null ? "" : row.latitude) +
      "' data-grave-lng='" + html(row.longitude == null ? "" : row.longitude) + "'";
    return "<details class='grave-list-item'><summary class='grave-list-item__summary'>" +
      "<span class='grave-list-item__person'><span class='eyebrow'>" + dates + "</span><strong>" + name + "</strong>" +
      (place ? "<span>" + place + "</span>" : "") + (distance ? "<span class='grave-list-item__distance'>" + html(distance) + "</span>" : "") +
      "</span><span class='grave-list-item__action'>Rodyti informaciją</span></summary>" +
      "<div class='grave-list-item__details'>" +
      (burial ? "<p><span>Palaidojimo data</span><strong>" + burial + "</strong></p>" : "") +
      (row.cemetery ? "<p><span>Kapinės</span><strong>" + html(row.cemetery) + "</strong></p>" : "") +
      (row.municipality ? "<p><span>Savivaldybė</span><strong>" + html(row.municipality) + "</strong></p>" : "") +
      (row.section ? "<p><span>Sektorius</span><strong>" + html(row.section) + "</strong></p>" : "") +
      (row.row_name ? "<p><span>Eilė</span><strong>" + html(row.row_name) + "</strong></p>" : "") +
      (row.place_number ? "<p><span>Kapavietė</span><strong>" + html(row.place_number) + "</strong></p>" : "") +
      (coordinates ? "<p><span>Koordinatės</span><strong>" + html(coordinates) + "</strong></p>" : "") +
      (grave ? "<p class='grave-list-item__location'>" + grave + "</p>" : "") +
      (rich && embeddedMap ? "<div class='grave-map-preview'><iframe title='Kapavietės vieta žemėlapyje' loading='lazy' referrerpolicy='no-referrer' src='" + html(embeddedMap) + "'></iframe><small>Žemėlapis: © OpenStreetMap bendruomenė</small></div>" : "") +
      (map ? "<div class='grave-result-actions'" + actionData + ">" +
        "<a class='button' target='_blank' rel='noopener' href='" + html(directionsUrl(row)) + "'>Rodyti maršrutą</a>" +
        "<a class='button button--ghost' target='_blank' rel='noopener' href='" + html(mapUrl(row)) + "'>Atidaryti žemėlapį</a>" +
        (rich ? "<button class='button button--ghost' type='button' data-share-grave>Pasidalinti</button>" +
        "<button class='button button--ghost" + (saved ? " is-saved" : "") + "' type='button' data-save-grave>" + (saved ? "Išsaugota" : "Išsaugoti") + "</button>" : "") +
        "</div>" : "") +
      "</div></details>";
  }
  function manual(row) {
    return { full_name: [row.vardas, row.pavarde].filter(Boolean).join(" "), birth_date: row.gimimo_data,
      death_date: row.mirties_data, birth_year: row.gimimo_metai, death_year: row.mirties_metai,
      cemetery: row.kapiniu_pavadinimas, municipality: row.miestas, section: row.sektorius,
      row_name: row.eile, place_number: row.kapo_numeris, latitude: row.platuma, longitude: row.ilguma };
  }
  function edgeUrl() {
    if (config().CEMETERY_SEARCH_API_URL) return config().CEMETERY_SEARCH_API_URL;
    return config().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/cemetery-search";
  }
  async function officialSearch(payload) {
    var key = config().SUPABASE_ANON_KEY;
    var headers = { apikey: key, "Content-Type": "application/json" };
    if (key && !key.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + key;
    var response = await fetch(edgeUrl(), { method: "POST", headers: headers, body: JSON.stringify(payload) });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "Paieška šiuo metu nepasiekiama.");
    return result;
  }
  async function rpc(name, payload) {
    var key = config().SUPABASE_ANON_KEY;
    var headers = { apikey: key, "Content-Type": "application/json" };
    if (key && !key.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + key;
    var response = await fetch(config().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST", headers: headers, body: JSON.stringify(payload)
    });
    if (!response.ok) return [];
    return response.json();
  }
  function values(form) {
    var data = new FormData(form);
    function value(name) { return String(data.get(name) || "").trim(); }
    return { p_query: value("q") || null, p_first_name: value("firstName") || null, p_last_name: value("lastName") || null,
      p_birth_year: value("birthYear") ? Number(value("birthYear")) : null, p_death_year: value("deathYear") ? Number(value("deathYear")) : null,
      p_municipality: value("municipality") || null, p_cemetery: value("cemetery") || null };
  }
  document.querySelectorAll("[data-grave-search-form]").forEach(function (form) {
    var root = form.closest("section") || document;
    var status = root.querySelector("[data-grave-status]") || document.querySelector("[data-grave-status]");
    var results = root.querySelector("[data-grave-results]") || document.querySelector("[data-grave-results]");
    var count = document.querySelector("[data-grave-count]");
    var pager = document.querySelector("[data-grave-pagination]");
    var page = 1;
    var lastRows = [];
    var rich = form.hasAttribute("data-map-preview");
    var locationButton = form.querySelector("[data-use-location]");
    var locationStatus = form.querySelector("[data-location-status]");
    var savedPanel = rich ? document.querySelector("[data-saved-graves]") : null;
    var savedList = savedPanel && savedPanel.querySelector("[data-saved-graves-list]");

    function renderSavedPanel() {
      if (!savedPanel || !savedList) return;
      var saved = savedGraves();
      savedPanel.hidden = saved.length === 0;
      savedList.innerHTML = saved.map(function (item) {
        var location = item.latitude && item.longitude ? item.latitude + "," + item.longitude : item.place;
        var url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location || item.name);
        return "<article data-saved-grave-key='" + html(item.key) + "'><div><strong>" + html(item.name) + "</strong><span>" +
          html(item.place || "Vieta nenurodyta") + "</span></div><div class='actions'><a class='button button--ghost' target='_blank' rel='noopener' href='" +
          html(url) + "'>Atidaryti</a><button class='button button--ghost' type='button' data-remove-saved-grave>Pašalinti</button></div></article>";
      }).join("");
    }

    if (savedList) {
      savedList.addEventListener("click", function (event) {
        var button = event.target.closest("[data-remove-saved-grave]");
        if (!button) return;
        var item = button.closest("[data-saved-grave-key]");
        var next = savedGraves().filter(function (saved) { return saved.key !== item.dataset.savedGraveKey; });
        localStorage.setItem(savedKey, JSON.stringify(next));
        renderSavedPanel();
        if (lastRows.length) renderRows(lastRows);
      });
      renderSavedPanel();
    }

    function renderRows(rows) {
      lastRows = rows;
      results.innerHTML = rows.map(function (row) { return render(row, rich); }).join("") ||
        "<div class='grave-empty'><h3>Atitikmenų nerasta</h3><p>Patikrinkite rašybą arba įveskite tik dalį pavardės.</p></div>";
    }

    if (locationButton) {
      locationButton.addEventListener("click", function () {
        if (!navigator.geolocation) {
          locationStatus.textContent = "Šis įrenginys vietos nustatymo nepalaiko.";
          return;
        }
        locationButton.disabled = true;
        locationStatus.textContent = "Nustatoma jūsų vieta…";
        navigator.geolocation.getCurrentPosition(function (position) {
          userLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          locationButton.disabled = false;
          locationButton.textContent = "Vieta nustatyta";
          locationStatus.textContent = "Atstumai ir maršrutai atnaujinti. Tiksli jūsų vieta neišsaugoma.";
          if (lastRows.length) renderRows(lastRows);
        }, function () {
          locationButton.disabled = false;
          locationStatus.textContent = "Vietos nustatyti nepavyko. Patikrinkite naršyklės leidimą.";
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
      });
    }

    results.addEventListener("click", function (event) {
      var action = event.target.closest("[data-share-grave], [data-save-grave]");
      if (!action) return;
      var box = action.closest(".grave-result-actions");
      var data = {
        key: box.dataset.graveKey,
        name: box.dataset.graveName,
        place: box.dataset.gravePlace,
        latitude: box.dataset.graveLat || null,
        longitude: box.dataset.graveLng || null
      };
      var shareUrl = data.latitude && data.longitude
        ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(data.latitude + "," + data.longitude)
        : window.location.href;
      if (action.hasAttribute("data-share-grave")) {
        var shareData = { title: data.name, text: [data.name, data.place].filter(Boolean).join(" – "), url: shareUrl };
        if (navigator.share) navigator.share(shareData).catch(function () {});
        else if (window.AtminimasUi) AtminimasUi.copyText(shareUrl).then(function () { AtminimasUi.toast("Kapavietės nuoroda nukopijuota."); });
        return;
      }
      var saved = savedGraves();
      var index = saved.findIndex(function (item) { return item.key === data.key; });
      if (index >= 0) saved.splice(index, 1);
      else saved.unshift(data);
      localStorage.setItem(savedKey, JSON.stringify(saved.slice(0, 50)));
      action.classList.toggle("is-saved", index < 0);
      action.textContent = index < 0 ? "Išsaugota" : "Išsaugoti";
      renderSavedPanel();
      if (window.AtminimasUi) AtminimasUi.toast(index < 0 ? "Kapavietė išsaugota šiame telefone." : "Kapavietė pašalinta iš išsaugotų.");
    });

    async function run() {
      var query = values(form);
      if (!Object.keys(query).some(function (key) { return query[key] !== null; }) || (query.p_query && query.p_query.length < 2)) {
        status.textContent = "Įveskite bent 2 raides arba pasirinkite kitą kriterijų."; return;
      }
      var pageSize = form.dataset.limit ? Number(form.dataset.limit) : 20;
      query.p_page = page; query.p_page_size = pageSize;
      status.textContent = "Ieškoma…";
      results.setAttribute("aria-busy", "true");
      results.innerHTML = loader();
      try {
        var manualCall = page === 1 && query.p_query ? rpc("ieskoti_kapavieciu", { paieska: query.p_query, rezultatu_limitas: pageSize }) : Promise.resolve([]);
        var responses = await Promise.all([officialSearch(query), manualCall]);
        var officialResult = responses[0] || {}; var official = officialResult.items || [];
        var manualRows = (responses[1] || []).map(manual);
        renderRows(official.concat(manualRows));
        status.textContent = official.length + manualRows.length ? "Rodoma įrašų: " + (official.length + manualRows.length) : "Atitikmenų nerasta.";
        if (officialResult.failedModels) status.textContent += " Dalis savivaldybių laikinai neatsakė.";
        if (count) count.textContent = officialResult.hasMore ? "Rasta daugiau rezultatų" : (officialResult.matched ? "Rasta: " + officialResult.matched : "");
        if (pager) {
          pager.hidden = page <= 1 && !officialResult.hasMore;
          pager.querySelector("[data-page-label]").textContent = "Puslapis " + page;
          pager.querySelector("[data-page-prev]").disabled = page <= 1;
          pager.querySelector("[data-page-next]").disabled = !officialResult.hasMore;
        }
      } catch (error) {
        status.textContent = error.message;
        results.innerHTML = "";
      } finally {
        results.setAttribute("aria-busy", "false");
      }
    }
    form.addEventListener("submit", function (event) { event.preventDefault(); page = 1; run(); });
    if (pager) {
      pager.querySelector("[data-page-prev]").addEventListener("click", function () { if (page > 1) { page -= 1; run(); } });
      pager.querySelector("[data-page-next]").addEventListener("click", function () { page += 1; run(); });
    }
  });
})();
