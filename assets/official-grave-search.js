(function () {
  var userLocation = null;
  var savedKey = "atminimas.saved-graves.v1";
  var officialSearchTimeoutMs = 22000;
  var mapTileSize = 256;
  var mapDefaultZoom = 16;
  var photoDialog = document.getElementById("grave-photo-dialog");
  var photoForm = document.getElementById("grave-photo-form");
  var photoContext = null;

  function config() { return window.ATMINIMAS_CONFIG || {}; }
  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function shownDate(date, year, text) { return date || year || text || "?"; }
  function number(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function mapCoordinates(row) {
    var latitude = number(row.latitude);
    var longitude = number(row.longitude);
    if (latitude === null || longitude === null || (latitude === 0 && longitude === 0) || latitude < -85.05112878 || latitude > 85.05112878 || longitude < -180 || longitude > 180) return null;
    return { latitude: latitude, longitude: longitude };
  }
  function mapLocation(row) {
    var point = mapCoordinates(row);
    if (point) return point.latitude + "," + point.longitude;
    return [row.cemetery, row.municipality].filter(Boolean).join(", ");
  }
  function mapUrl(row) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapLocation(row)); }
  function directionsUrl(row) {
    var destination = mapLocation(row);
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination);
    if (userLocation) url += "&origin=" + encodeURIComponent(userLocation.latitude + "," + userLocation.longitude);
    return url;
  }
  function distanceKm(row) {
    var point = mapCoordinates(row);
    if (!userLocation || !point) return null;
    var latitude = point.latitude;
    var longitude = point.longitude;
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
  function apiBase() { return config().SUPABASE_URL.replace(/\/$/, ""); }
  function encodedPath(path) { return String(path || "").split("/").map(encodeURIComponent).join("/"); }
  function gravePhotoUrl(sourceModel, graveSourceId) {
    var params = new URLSearchParams({ source_model: sourceModel, grave_source_id: graveSourceId });
    return apiBase() + "/functions/v1/grave-photo?" + params.toString();
  }
  function manualGravePhotoUrl(id) {
    return apiBase() + "/functions/v1/grave-photo?manual_id=" + encodeURIComponent(id);
  }
  function storageObjectUrl(bucket, path) {
    return apiBase() + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + encodedPath(path);
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, function (byte, index) {
      return ([4, 6, 8, 10].indexOf(index) >= 0 ? "-" : "") + byte.toString(16).padStart(2, "0");
    }).join("");
  }
  async function decodedPhoto(file) {
    if (window.createImageBitmap) {
      try {
        var bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: function () { bitmap.close(); } };
      } catch (_error) {}
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        resolve({ image: image, width: image.naturalWidth, height: image.naturalHeight, close: function () { URL.revokeObjectURL(url); } });
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Nuotraukos perskaityti nepavyko.")); };
      image.src = url;
    });
  }
  async function preparePhoto(file) {
    var allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!file || allowed.indexOf(file.type) === -1) throw new Error("Pasirinkite JPG, PNG arba WEBP nuotrauką.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Pradinė nuotrauka negali būti didesnė nei 20 MB.");
    var decoded = await decodedPhoto(file);
    try {
      if (!decoded.width || !decoded.height) throw new Error("Nuotraukos matmenys netinkami.");
      var scale = Math.min(1, 2400 / Math.max(decoded.width, decoded.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      var context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Naršyklė negali paruošti nuotraukos.");
      context.fillStyle = "#f7f5ef";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      function jpeg(quality) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", quality); });
      }
      var blob = await jpeg(0.88);
      if (blob && blob.size > 8 * 1024 * 1024) blob = await jpeg(0.72);
      if (!blob || !blob.size) throw new Error("Nuotraukos paruošti nepavyko.");
      if (blob.size > 8 * 1024 * 1024) throw new Error("Paruošta nuotrauka vis dar didesnė nei 8 MB.");
      return blob;
    } finally {
      decoded.close();
    }
  }
  function careUrl(name, place, latitude, longitude, cemetery, municipality, service) {
    var params = new URLSearchParams();
    if (name) params.set("graveName", name);
    if (place) params.set("gravePlace", place);
    if (cemetery) params.set("graveCemetery", cemetery);
    if (municipality) params.set("graveMunicipality", municipality);
    if (latitude != null && latitude !== "") params.set("graveLat", latitude);
    if (longitude != null && longitude !== "") params.set("graveLng", longitude);
    if (["zvakes", "geles", "kapu_tvarkymas"].indexOf(service) !== -1) params.set("service", service);
    return "kapu-prieziura.html?" + params.toString() + "#uzklausa";
  }
  function careShortcuts(name, place, latitude, longitude, cemetery, municipality) {
    var choices = [
      ["geles", "Padėti gėlių"],
      ["zvakes", "Uždegti žvakę"],
      ["kapu_tvarkymas", "Sutvarkyti"]
    ];
    return "<div class='grave-care-shortcuts' role='group' aria-label='Kapavietės priežiūros pasirinkimai'>" +
      "<span>Pasirūpinti šia kapaviete</span>" + choices.map(function (choice) {
        var accessibleName = name ? "<span class='visually-hidden'> – " + html(name) + "</span>" : "";
        return "<a class='button button--ghost' href='" + html(careUrl(name, place, latitude, longitude, cemetery, municipality, choice[0])) + "'>" + choice[1] + accessibleName + "</a>";
      }).join("") + "</div>";
  }
  function mapOpenStreetMapUrl(row, zoom) {
    var point = mapCoordinates(row);
    if (!point) return "";
    var latitude = point.latitude;
    var longitude = point.longitude;
    var level = Math.min(19, Math.max(3, Math.round(Number(zoom) || mapDefaultZoom)));
    return "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(latitude) +
      "&mlon=" + encodeURIComponent(longitude) + "#map=" + level + "/" + latitude + "/" + longitude;
  }
  function mapPreview(row, rawName) {
    var point = mapCoordinates(row);
    if (!point) {
      return "<div class='grave-map-unavailable' role='note'><span class='grave-map-unavailable__mark' aria-hidden='true'>i</span><span><strong>Tiksli kapavietės vieta žemėlapyje nenurodyta</strong>" +
        "<span>Maršrutas gali nuvesti iki kapinių. Kapavietę jose padės rasti sektoriaus, eilės ar vietos numeris, jei jis pateiktas.</span></span></div>";
    }
    var latitude = point.latitude;
    var longitude = point.longitude;
    var externalUrl = mapOpenStreetMapUrl(row, mapDefaultZoom);
    return "<div class='grave-map-preview' data-grave-map data-map-lat='" + html(latitude) + "' data-map-lng='" + html(longitude) + "' data-map-zoom='" + mapDefaultZoom + "'>" +
      "<div class='grave-map-viewport' data-map-viewport role='img' aria-label='Žemėlapis: " + html(rawName || "kapavietė") + "'><div class='grave-map-tiles' data-map-tiles aria-hidden='true'></div><span class='grave-map-marker' data-map-marker aria-hidden='true'></span><span class='grave-map-marker-label' data-map-marker-label aria-hidden='true'>Kapavietė</span></div>" +
      "<div class='grave-map-controls' aria-label='Žemėlapio mastelis'><button class='grave-map-control' type='button' data-map-zoom-in aria-label='Priartinti žemėlapį'>+</button><button class='grave-map-control' type='button' data-map-zoom-out aria-label='Atitolinti žemėlapį'>−</button></div>" +
      "<p class='grave-map-status' data-map-status hidden role='status'>Nepavyko įkelti žemėlapio plytelių. <a target='_blank' rel='noopener' href='" + html(externalUrl) + "'>Atidaryti OpenStreetMap</a></p>" +
      "<small>Žemėlapis: © <a target='_blank' rel='noopener' href='https://www.openstreetmap.org/copyright'>OpenStreetMap bendruomenė</a></small></div>";
  }
  function mapPixelPoint(latitude, longitude, zoom) {
    var world = Math.pow(2, zoom);
    var safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    var radians = safeLatitude * Math.PI / 180;
    return {
      x: (longitude + 180) / 360 * world * mapTileSize,
      y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * world * mapTileSize
    };
  }
  function wrappedTileX(value, world) {
    return ((value % world) + world) % world;
  }
  function renderMap(block) {
    var viewport = block.querySelector("[data-map-viewport]");
    var tiles = block.querySelector("[data-map-tiles]");
    var marker = block.querySelector("[data-map-marker]");
    var markerLabel = block.querySelector("[data-map-marker-label]");
    if (!viewport || !tiles || !marker) return;
    var point = mapCoordinates({ latitude: block.dataset.mapLat, longitude: block.dataset.mapLng });
    if (!point) return;
    var latitude = point.latitude;
    var longitude = point.longitude;
    var zoom = Math.min(19, Math.max(3, Math.round(Number(block.dataset.mapZoom) || mapDefaultZoom)));
    block.dataset.mapZoom = zoom;
    var width = viewport.clientWidth || 320;
    var height = viewport.clientHeight || 220;
    var center = mapPixelPoint(latitude, longitude, zoom);
    var left = center.x - width / 2;
    var top = center.y - height / 2;
    var worldTiles = Math.pow(2, zoom);
    var firstX = Math.floor(left / mapTileSize) - 1;
    var lastX = Math.floor((left + width) / mapTileSize) + 1;
    var firstY = Math.floor(top / mapTileSize) - 1;
    var lastY = Math.floor((top + height) / mapTileSize) + 1;
    var tileCount = 0;
    var loaded = 0;
    var failed = 0;
    var status = block.querySelector("[data-map-status]");
    var statusLink = status && status.querySelector("a");
    var renderId = String(Number(block.dataset.mapRenderId || 0) + 1);
    block.dataset.mapRenderId = renderId;
    if (status) status.hidden = true;
    if (statusLink) statusLink.href = mapOpenStreetMapUrl({ latitude: latitude, longitude: longitude }, zoom);
    tiles.innerHTML = "";
    tiles.style.width = width + "px";
    tiles.style.height = height + "px";
    function finishTile(success) {
      if (block.dataset.mapRenderId !== renderId) return;
      if (success) loaded += 1;
      else failed += 1;
      if (status && tileCount && loaded + failed >= tileCount && !loaded) status.hidden = false;
    }
    for (var x = firstX; x <= lastX; x += 1) {
      for (var y = firstY; y <= lastY; y += 1) {
        if (y < 0 || y >= worldTiles) continue;
        tileCount += 1;
        var image = document.createElement("img");
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.width = mapTileSize;
        image.height = mapTileSize;
        image.loading = "eager";
        image.decoding = "async";
        image.style.left = Math.round(x * mapTileSize - left) + "px";
        image.style.top = Math.round(y * mapTileSize - top) + "px";
        image.addEventListener("load", function () { finishTile(true); }, { once: true });
        image.addEventListener("error", function () { finishTile(false); }, { once: true });
        image.src = "https://tile.openstreetmap.org/" + zoom + "/" + wrappedTileX(x, worldTiles) + "/" + y + ".png";
        tiles.appendChild(image);
      }
    }
    marker.style.left = Math.round(center.x - left) + "px";
    marker.style.top = Math.round(center.y - top) + "px";
    if (markerLabel) {
      markerLabel.style.left = Math.round(center.x - left) + "px";
      markerLabel.style.top = Math.round(center.y - top) + "px";
    }
    if (status && !tileCount) status.hidden = false;
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
    if (row.source_model && row.grave_source_id) return row.source_model + "|" + row.grave_source_id;
    return [row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "), row.cemetery, row.latitude, row.longitude].join("|");
  }
  function isSaved(row) {
    var key = graveKey(row);
    return savedGraves().some(function (item) { return item.key === key; });
  }
  function loader() {
    if (window.AtminimasLoading) return AtminimasLoading.cards(3);
    return "<div class='skeleton-list' aria-hidden='true'><article class='skeleton-card'><span class='skeleton-line skeleton-line--eyebrow'></span><span class='skeleton-line skeleton-line--title'></span><span class='skeleton-line'></span><span class='skeleton-line skeleton-line--short'></span></article></div>";
  }
  function photoBlock(row, rawName, rich) {
    if (!rich) return "";
    var sourceModel = row.source_model || "";
    var graveSourceId = row.grave_source_id || row.id || "";
    if (!sourceModel || !graveSourceId) return "";
    var source = row.photo_proxy_url || row.photo_url || gravePhotoUrl(sourceModel, graveSourceId);
    var known = Boolean(row.photo_url);
    var alt = "Kapavietė, kurioje palaidotas " + rawName + (row.cemetery ? ", " + row.cemetery : "");
    var data = " data-photo-source-model='" + html(sourceModel) + "' data-photo-grave-id='" + html(graveSourceId) +
      "' data-photo-record-id='" + html(row.id || graveSourceId) + "' data-photo-deceased-name='" + html(rawName) +
      "' data-photo-cemetery='" + html(row.cemetery || "") + "' data-photo-municipality='" + html(row.municipality || "") +
      "' data-photo-lat='" + html(row.latitude == null ? "" : row.latitude) + "' data-photo-lng='" + html(row.longitude == null ? "" : row.longitude) +
      "' data-photo-src='" + html(source) + "' data-photo-known='" + (known ? "true" : "false") + "'";
    return "<figure class='grave-photo' data-grave-photo" + data + ">" +
      "<div class='grave-photo__loading' data-photo-loading role='status' aria-live='polite'><span class='skeleton-media' aria-hidden='true'></span><span class='visually-hidden'>Tikrinama kapavietės nuotrauka…</span></div>" +
      "<img data-photo-image hidden alt='" + html(alt) + "'>" +
      "<figcaption data-photo-caption hidden><span>" + (known ? "Patikrinta kapavietės nuotrauka." : "Naudotojo pateikta ir administratoriaus patvirtinta nuotrauka.") + "</span>" +
      "<button class='button button--ghost' type='button' data-add-grave-photo>Pateikti naujesnę nuotrauką</button></figcaption>" +
      "<div class='grave-photo__empty' data-photo-empty hidden><strong>Kapavietės nuotraukos dar neturime</strong>" +
      "<span>Galite pateikti tikrą kapavietės nuotrauką. Viešai ją parodysime tik patikrinę.</span>" +
      "<button class='button button--ghost' type='button' data-add-grave-photo>Pridėti kapavietės nuotrauką</button></div>" +
      "</figure>";
  }
  function render(row, rich) {
    var rawName = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ");
    var name = html(rawName);
    var dates = html(shownDate(row.birth_date, row.birth_year, row.birth_date_text) + "–" + shownDate(row.death_date, row.death_year, row.death_date_text));
    var rawPlace = [row.cemetery, row.municipality].filter(Boolean).join(", ");
    var carePlace = [rawPlace, row.section ? "sektorius " + row.section : "", row.row_name ? "eilė " + row.row_name : "", row.place_number ? "vieta " + row.place_number : ""].filter(Boolean).join(" · ");
    var place = html(rawPlace);
    var grave = [["sektorius", row.section], ["eilė", row.row_name], ["vieta", row.place_number]].filter(function (x) { return x[1]; }).map(function (x) { return x[0] + " " + html(x[1]); }).join(" · ");
    var burial = row.burial_date || row.burial_year ? html(shownDate(row.burial_date, row.burial_year, row.burial_date_text)) : "";
    var point = mapCoordinates(row);
    var coordinates = point ? point.latitude.toFixed(6) + ", " + point.longitude.toFixed(6) : "";
    var map = mapLocation(row);
    var sourceUrl = row.source_url || "";
    var distance = distanceText(row);
    var mapPreviewHtml = rich ? mapPreview(row, rawName) : "";
    var saved = isSaved(row);
    var actionData = " data-grave-name='" + html(rawName) + "' data-grave-place='" + html(rawPlace) +
      "' data-grave-cemetery='" + html(row.cemetery || "") + "' data-grave-municipality='" + html(row.municipality || "") +
      "' data-grave-key='" + html(graveKey(row)) + "' data-grave-lat='" + html(point ? point.latitude : "") +
      "' data-grave-lng='" + html(point ? point.longitude : "") + "'";
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
      photoBlock(row, rawName, rich) +
      mapPreviewHtml +
      (map || sourceUrl ? "<div class='grave-result-actions'" + actionData + ">" +
        (map ? "<a class='button' target='_blank' rel='noopener' href='" + html(directionsUrl(row)) + "'>" + (point ? "Rodyti maršrutą" : "Rodyti maršrutą į kapines") + "<span class='visually-hidden'> naujame skirtuke</span></a>" :
          "<a class='button' target='_blank' rel='noopener' href='" + html(sourceUrl) + "'>Atidaryti kapavietės įrašą<span class='visually-hidden'> naujame skirtuke</span></a>") +
        "<details class='grave-result-more'><summary class='button button--ghost'>Kiti veiksmai</summary><div class='actions'>" +
        (map ? "<a class='button button--ghost' target='_blank' rel='noopener' href='" + html(mapUrl(row)) + "'>" + (point ? "Atidaryti „Google Maps“" : "Rasti kapines „Google Maps“") + "<span class='visually-hidden'> naujame skirtuke</span></a>" : "") +
        (map && sourceUrl ? "<a class='button button--ghost' target='_blank' rel='noopener' href='" + html(sourceUrl) + "'>Patikrinti šaltinio įrašą<span class='visually-hidden'> naujame skirtuke</span></a>" : "") +
        (rich ? "<button class='button button--ghost' type='button' data-share-grave>Pasidalinti</button>" +
        "<button class='button button--ghost" + (saved ? " is-saved" : "") + "' type='button' data-save-grave>" + (saved ? "Išsaugota" : "Išsaugoti") + "</button>" +
        careShortcuts(rawName, carePlace, point ? point.latitude : null, point ? point.longitude : null, row.cemetery, row.municipality) : "") +
        "</div></details>" +
        "</div>" : "") +
      "</div></details>";
  }
  function manual(row) {
    return { id: row.id, source_model: "manual", grave_source_id: row.id,
      full_name: [row.vardas, row.pavarde].filter(Boolean).join(" "), birth_date: row.gimimo_data,
      death_date: row.mirties_data, birth_year: row.gimimo_metai, death_year: row.mirties_metai,
      cemetery: row.kapiniu_pavadinimas, municipality: row.miestas, section: row.sektorius,
      row_name: row.eile, place_number: row.kapo_numeris, latitude: row.platuma, longitude: row.ilguma,
      photo_proxy_url: manualGravePhotoUrl(row.id) };
  }
  function edgeUrl() {
    if (config().CEMETERY_SEARCH_API_URL) return config().CEMETERY_SEARCH_API_URL;
    return config().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/cemetery-search";
  }
  async function officialSearch(payload) {
    var key = config().SUPABASE_ANON_KEY;
    var headers = { apikey: key, "Content-Type": "application/json" };
    if (key && !key.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + key;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, officialSearchTimeoutMs);
    try {
      var response = await fetch(edgeUrl(), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || "Oficiali paieška šiuo metu neatsakė.");
      return result;
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("Oficiali paieška užtruko per ilgai.");
      throw new Error(error && error.message && error.message !== "Failed to fetch"
        ? error.message
        : "Oficiali paieška šiuo metu neatsakė.");
    } finally {
      window.clearTimeout(timeout);
    }
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

  function openPhotoDialog(block) {
    if (!photoDialog || !photoForm) return;
    if (!window.AtminimasAuth || !AtminimasAuth.accessToken()) {
      window.location.href = "prisijungti.html?next=" + encodeURIComponent("kapu-ieskojimas.html");
      return;
    }
    photoContext = block;
    photoForm.reset();
    var label = photoDialog.querySelector("[data-photo-grave-label]");
    var status = photoDialog.querySelector("[data-photo-upload-status]");
    if (label) label.textContent = [block.dataset.photoDeceasedName, block.dataset.photoCemetery].filter(Boolean).join(" – ");
    if (status) status.textContent = "";
    photoDialog.showModal();
  }

  async function deletePendingSubmission(id) {
    try {
      await fetch(apiBase() + "/rest/v1/grave_photo_submissions?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
        headers: Object.assign({}, AtminimasAuth.headers(false), { Prefer: "return=minimal" })
      });
    } catch (_error) {}
  }

  if (photoDialog && photoForm) {
    photoDialog.querySelectorAll("[data-photo-dialog-close]").forEach(function (button) {
      button.addEventListener("click", function () { photoDialog.close(); });
    });
    photoForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!photoContext) return;
      var status = photoDialog.querySelector("[data-photo-upload-status]");
      var submit = photoForm.querySelector("button[type='submit']");
      var data = new FormData(photoForm);
      var file = data.get("photo");
      submit.disabled = true;
      status.textContent = "Nuotrauka saugiai paruošiama…";
      var submissionId = "";
      try {
        var user = await AtminimasAuth.user();
        if (!user || !user.id) throw new Error("Sesija nebegalioja. Prisijunkite dar kartą.");
        if (data.get("rights") !== "confirmed") throw new Error("Patvirtinkite, kad turite teisę pateikti nuotrauką.");
        var prepared = await preparePhoto(file);
        submissionId = uuid();
        var path = user.id + "/" + submissionId + ".jpg";
        var lat = photoContext.dataset.photoLat;
        var lng = photoContext.dataset.photoLng;
        var payload = {
          id: submissionId,
          owner_id: user.id,
          source_model: photoContext.dataset.photoSourceModel,
          grave_source_id: photoContext.dataset.photoGraveId,
          deceased_record_id: photoContext.dataset.photoRecordId,
          deceased_name: photoContext.dataset.photoDeceasedName,
          cemetery_name: photoContext.dataset.photoCemetery || null,
          municipality: photoContext.dataset.photoMunicipality || null,
          latitude: lat === "" ? null : Number(lat),
          longitude: lng === "" ? null : Number(lng),
          storage_path: path,
          description: String(data.get("description") || "").trim() || null,
          mime_type: "image/jpeg",
          size_bytes: prepared.size,
          rights_confirmed: true
        };
        var insert = await fetch(apiBase() + "/rest/v1/grave_photo_submissions", {
          method: "POST",
          headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
          body: JSON.stringify(payload)
        });
        if (!insert.ok) throw new Error("Nuotraukos pateikimo užregistruoti nepavyko.");

        status.textContent = "Nuotrauka įkeliama…";
        var upload = await fetch(storageObjectUrl("grave-photo-submissions", path), {
          method: "POST",
          headers: Object.assign({}, AtminimasAuth.headers(false), { "Content-Type": "image/jpeg", "x-upsert": "false" }),
          body: prepared
        });
        if (!upload.ok) {
          await deletePendingSubmission(submissionId);
          throw new Error("Nuotraukos įkelti nepavyko. Bandykite dar kartą.");
        }

        status.textContent = "Nuotrauka pateikta. Ji bus rodoma viešai tik administratoriui patvirtinus.";
        photoContext.querySelectorAll("[data-add-grave-photo]").forEach(function (button) {
          button.disabled = true;
          button.textContent = "Pateikta peržiūrai";
        });
        setTimeout(function () { if (photoDialog.open) photoDialog.close(); }, 1800);
      } catch (error) {
        status.textContent = error.message || "Nuotraukos pateikti nepavyko.";
      } finally {
        submit.disabled = false;
      }
    });
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
          html(url) + "'>Atidaryti</a>" + careShortcuts(item.name, item.place, item.latitude, item.longitude, item.cemetery, item.municipality) +
          "<button class='button button--ghost' type='button' data-remove-saved-grave>Pašalinti</button></div></article>";
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

    function loadPhoto(block) {
      if (block.dataset.photoStarted === "true") return;
      block.dataset.photoStarted = "true";
      var image = block.querySelector("[data-photo-image]");
      var loading = block.querySelector("[data-photo-loading]");
      var empty = block.querySelector("[data-photo-empty]");
      var caption = block.querySelector("[data-photo-caption]");
      image.addEventListener("load", function () {
        loading.hidden = true;
        empty.hidden = true;
        image.hidden = false;
        caption.hidden = false;
      }, { once: true });
      image.addEventListener("error", function () {
        loading.hidden = true;
        image.hidden = true;
        caption.hidden = true;
        empty.hidden = false;
      }, { once: true });
      image.src = block.dataset.photoSrc;
    }

    function wirePhotoBlocks() {
      results.querySelectorAll("[data-grave-photo]").forEach(function (block) {
        var details = block.closest("details");
        if (!details) return;
        details.addEventListener("toggle", function () { if (details.open) loadPhoto(block); });
        if (details.open) loadPhoto(block);
      });
    }

    function wireMapBlocks() {
      results.querySelectorAll("[data-grave-map]").forEach(function (block) {
        var details = block.closest("details");
        var zoomIn = block.querySelector("[data-map-zoom-in]");
        var zoomOut = block.querySelector("[data-map-zoom-out]");
        function changeZoom(delta) {
          var current = Number(block.dataset.mapZoom) || mapDefaultZoom;
          block.dataset.mapZoom = Math.min(19, Math.max(3, current + delta));
          renderMap(block);
        }
        if (details) {
          details.addEventListener("toggle", function () { if (details.open) renderMap(block); });
        }
        if (zoomIn) zoomIn.addEventListener("click", function () { changeZoom(1); });
        if (zoomOut) zoomOut.addEventListener("click", function () { changeZoom(-1); });
        if (!details || details.open) renderMap(block);
      });
    }

    function renderRows(rows) {
      lastRows = rows;
      results.innerHTML = rows.map(function (row) { return render(row, rich); }).join("") ||
        "<div class='grave-empty'><h3>Atitikmenų nerasta</h3><p>Patikrinkite rašybą arba įveskite tik dalį pavardės.</p></div>";
      wirePhotoBlocks();
      wireMapBlocks();
    }

    function renderSearchHelp() {
      lastRows = [];
      results.innerHTML = "<div class='grave-empty grave-empty--search-help'>" +
        "<h3>Patikslinkite paiešką</h3>" +
        "<p>Valstybės duomenų šaltinis šiuo metu atsako per lėtai. Įrašius savivaldybę bus tikrinama mažiau oficialių šaltinių.</p>" +
        "<div class='actions'><button class='button' type='button' data-refine-grave-search>Įrašyti savivaldybę</button>" +
        "<button class='button button--ghost' type='button' data-retry-grave-search>Bandyti dar kartą</button></div></div>";
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
      var refineButton = event.target.closest("[data-refine-grave-search]");
      if (refineButton) {
        var advanced = form.querySelector(".grave-search-advanced");
        var municipalityInput = form.elements.municipality;
        if (advanced) advanced.open = true;
        if (municipalityInput) {
          municipalityInput.focus();
          municipalityInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      if (event.target.closest("[data-retry-grave-search]")) {
        run();
        return;
      }
      var photoButton = event.target.closest("[data-add-grave-photo]");
      if (photoButton) {
        openPhotoDialog(photoButton.closest("[data-grave-photo]"));
        return;
      }
      var action = event.target.closest("[data-share-grave], [data-save-grave]");
      if (!action) return;
      var box = action.closest(".grave-result-actions");
      var data = {
        key: box.dataset.graveKey,
        name: box.dataset.graveName,
        place: box.dataset.gravePlace,
        cemetery: box.dataset.graveCemetery || null,
        municipality: box.dataset.graveMunicipality || null,
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
        status.dataset.state = "warning";
        status.textContent = "Įveskite bent 2 raides arba pasirinkite kitą kriterijų."; return;
      }
      var pageSize = form.dataset.limit ? Number(form.dataset.limit) : 20;
      query.p_page = page; query.p_page_size = pageSize;
      var submit = form.querySelector("button[type='submit']");
      status.dataset.state = "loading";
      status.textContent = "Ieškoma…";
      var slowNotice = window.setTimeout(function () {
        if (status.dataset.state === "loading") status.textContent = "Paieška dar tikrinama…";
      }, 4000);
      results.setAttribute("aria-busy", "true");
      if (submit) {
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
      }
      results.innerHTML = loader();
      try {
        var manualCall = page === 1 && query.p_query ? rpc("ieskoti_kapavieciu", { paieska: query.p_query, rezultatu_limitas: pageSize }) : Promise.resolve([]);
        var responses = await Promise.allSettled([officialSearch(query), manualCall]);
        var officialFailed = responses[0].status === "rejected";
        var officialResult = officialFailed ? {} : (responses[0].value || {});
        var official = officialResult.items || [];
        var manualRows = responses[1].status === "fulfilled" ? (responses[1].value || []).map(manual) : [];
        var rows = official.concat(manualRows);
        var officialIncomplete = officialFailed || Boolean(officialResult.failedModels);
        if (!rows.length && officialIncomplete) renderSearchHelp();
        else renderRows(rows);
        status.dataset.state = officialIncomplete ? "warning" : (rows.length ? "success" : "info");
        status.textContent = rows.length ? "Rodoma įrašų: " + rows.length : (officialIncomplete
          ? "Dalis oficialių šaltinių šiuo metu neatsakė. Patikslinkite savivaldybę arba bandykite dar kartą."
          : "Atitikmenų nerasta.");
        if (rows.length && officialIncomplete) status.textContent += " Dalis savivaldybių laikinai neatsakė.";
        if (count) count.textContent = officialResult.hasMore ? "Rasta daugiau rezultatų" : (officialResult.matched ? "Rasta: " + officialResult.matched : "");
        if (pager) {
          pager.hidden = officialFailed || (page <= 1 && !officialResult.hasMore);
          pager.querySelector("[data-page-label]").textContent = "Puslapis " + page;
          pager.querySelector("[data-page-prev]").disabled = page <= 1;
          pager.querySelector("[data-page-next]").disabled = !officialResult.hasMore;
        }
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = error.message;
        results.innerHTML = "";
      } finally {
        window.clearTimeout(slowNotice);
        results.setAttribute("aria-busy", "false");
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
        }
      }
    }
    form.addEventListener("submit", function (event) { event.preventDefault(); page = 1; run(); });
    if (pager) {
      pager.querySelector("[data-page-prev]").addEventListener("click", function () { if (page > 1) { page -= 1; run(); } });
      pager.querySelector("[data-page-next]").addEventListener("click", function () { page += 1; run(); });
    }
  });
})();
