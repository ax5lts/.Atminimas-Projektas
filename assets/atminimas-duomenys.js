(function (global) {
  function getConfig() {
    var cfg = global.ATMINIMAS_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error("Trūksta SUPABASE_URL arba SUPABASE_ANON_KEY (assets/supabase-config.js)");
    }
    return cfg;
  }

  function headers() {
    var cfg = getConfig();
    var token = global.AtminimasAuth && global.AtminimasAuth.accessToken
      ? global.AtminimasAuth.accessToken()
      : "";
    var h = {
      apikey: cfg.SUPABASE_ANON_KEY,
      Accept: "application/json"
    };
    if (token) {
      h.Authorization = "Bearer " + token;
    } else if (cfg.SUPABASE_ANON_KEY.indexOf("sb_publishable_") !== 0) {
      h.Authorization = "Bearer " + cfg.SUPABASE_ANON_KEY;
    }
    return h;
  }

  async function apiFetch(url, options) {
    if (global.AtminimasAuth && global.AtminimasAuth.authorizedFetch && global.AtminimasAuth.accessToken()) {
      return global.AtminimasAuth.authorizedFetch(url, options);
    }
    return fetch(url, options);
  }

  function restUrl(table, query) {
    var cfg = getConfig();
    return cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table) + "?" + query;
  }

  function storageObjectUrl(bucket, path) {
    var cfg = getConfig();
    return cfg.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + path.split("/").map(encodeURIComponent).join("/");
  }

  async function fetchJson(url) {
    var res = await apiFetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error("Duomenų išsaugoti nepavyko (" + res.status + ").");
    }
    return res.json();
  }

  async function postJson(table, payload) {
    var res = await apiFetch(restUrl(table, "select=*"), {
      method: "POST",
      headers: Object.assign({}, headers(), {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error("Duomenų įkelti nepavyko (" + res.status + ").");
    }
    var rows = await res.json();
    return rows && rows[0] ? rows[0] : payload;
  }

  function absoluteUrl(path) {
    return new URL(path, getConfig().PUBLIC_SITE_URL || global.location.href).href;
  }

  function qrImageUrl(pageUrl) {
    return getConfig().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/qr-code?data=" + encodeURIComponent(pageUrl);
  }

  function slugify(value) {
    return (value || "atminimas")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 44) || "atminimas";
  }

  function uniqueIdentifier(vardas, pavarde) {
    var base = slugify([vardas, pavarde].filter(Boolean).join(" "));
    var bytes = new Uint8Array(12);
    if (!global.crypto || !global.crypto.getRandomValues) {
      throw new Error("Ši naršyklė nepalaiko saugaus puslapio kodo kūrimo.");
    }
    global.crypto.getRandomValues(bytes);
    var suffix = Array.from(bytes).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    return base + "-" + suffix;
  }

  function fileExt(file) {
    var name = file && file.name ? file.name : "";
    var ext = name.split(".").pop().toLowerCase();
    return ext && ext !== name ? ext.replace(/[^a-z0-9]/g, "") : "bin";
  }

  async function uploadOneFile(bucket, path, file, upsert) {
    var res = await apiFetch(storageObjectUrl(bucket, path), {
      method: "POST",
      headers: Object.assign({}, headers(), {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": upsert ? "true" : "false"
      }),
      body: file
    });
    if (!res.ok) {
      throw new Error("Failo įkelti nepavyko (" + res.status + ").");
    }
    return storageObjectUrl(bucket, path);
  }

  async function uploadBuilderMedia(identifier, files, upsert, onProgress) {
    var media = [];
    var photos = Array.prototype.slice.call((files && files.photos) || []).filter(Boolean).slice(0, 8);
    var video = files && files.video ? files.video : null;
    var captions = files && files.captions ? files.captions : null;
    var totalUploads = photos.length + (video ? 1 : 0) + (captions ? 1 : 0);
    var completedUploads = 0;
    var ownerId = global.AtminimasAuth && global.AtminimasAuth.userId ? global.AtminimasAuth.userId() : "";
    if (!ownerId) throw new Error("Failams įkelti būtina prisijungti.");
    var ownerPath = ownerId + "/" + identifier;

    function reportProgress() {
      if (typeof onProgress === "function") onProgress(completedUploads, totalUploads);
    }

    for (var i = 0; i < photos.length; i++) {
      var photoPath = ownerPath + "/photo-" + (i + 1) + "." + fileExt(photos[i]);
      media.push({
        type: "image",
        url: await uploadOneFile("atminimas", photoPath, photos[i], upsert),
        path: photoPath,
        order: i + 1
      });
      completedUploads += 1;
      reportProgress();
    }

    if (video) {
      var videoPath = ownerPath + "/video." + fileExt(video);
      media.push({
        type: "video",
        url: await uploadOneFile("atminimas", videoPath, video, upsert),
        path: videoPath,
        order: 1
      });
      completedUploads += 1;
      reportProgress();
    }

    if (captions) {
      var captionsPath = ownerPath + "/captions." + fileExt(captions);
      media.push({
        type: "captions",
        url: await uploadOneFile("atminimas", captionsPath, captions, upsert),
        path: captionsPath,
        language: "lt",
        order: 1
      });
      completedUploads += 1;
      reportProgress();
    }

    if (!totalUploads) reportProgress();
    return media;
  }

  function getPageSlug() {
    var params = new URLSearchParams(global.location.search);
    return (params.get("id") || params.get("slug") || params.get("s") || "demo").trim();
  }

  async function loadAtminimasBySlug(identifier) {
    var res = await apiFetch(
      functionUrl("profile-content") + "?profile_id=" + encodeURIComponent(identifier),
      { headers: headers(), cache: "no-store" }
    );
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 404) {
      throw new Error("Atminimo puslapis nerastas.");
    }
    if (!res.ok || !data.atminimas) {
      throw new Error("Atminimo puslapio įkelti nepavyko.");
    }
    return { atminimas: data.atminimas, can_manage: !!data.can_manage };
  }

  async function createAtminimas(input, options) {
    var vardas = (input.vardas || "").trim();
    var pavarde = (input.pavarde || "").trim();
    var ownerId = global.AtminimasAuth && global.AtminimasAuth.userId
      ? global.AtminimasAuth.userId()
      : "";
    if (!ownerId) throw new Error("Puslapiui išsaugoti būtina prisijungti.");
    var customId = (input.id || input.slug || "").trim();
    var identifier = customId ? slugify(customId) : uniqueIdentifier(vardas, pavarde);
    var fullName = [vardas, pavarde].filter(Boolean).join(" ");
    var media = options && options.media ? options.media : [];
    var layout = options && options.layout ? options.layout : {};

    if (options && options.files) {
      media = await uploadBuilderMedia(identifier, options.files, false, options.onProgress);
    }

    var imageIndex = 0;
    media.forEach(function (item) {
      if (item.type !== "image") return;
      imageIndex += 1;
      item.alt = (input["photo_alt_" + imageIndex] || "").trim() || ("Atminimo nuotrauka " + imageIndex);
      item.caption = (input["photo_caption_" + imageIndex] || "").trim() || null;
    });

    await postJson("profiliai", {
      id: identifier,
      owner_id: ownerId,
      vardas: vardas,
      pavarde: pavarde,
      gimimo_data: input.gimimo_data || null,
      mirties_data: input.mirties_data || null,
      epitafija: input.epitafija || null,
      tekstas_200: input.tekstas_200 || null,
      layout_json: layout,
      media_json: media,
      apmoketa: !!input.apmoketa,
      aktyvus: false
    });
    return { identifier: identifier, table: "profiliai" };
  }

  async function createUzsakymas(identifier, input) {
    var row = await manageProfile({
      action: "create_order",
      profile_id: identifier,
      product_type: input && input.product_type === "asa" ? "asa" : "metal"
    });
    return {
      id: row.id,
      profilis_id: identifier,
      puslapio_url: row.puslapio_url,
      qr_kodas_url: row.qr_kodas_url,
      busena: row.busena || "sukurtas"
    };
  }

  function functionUrl(name) {
    return getConfig().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + encodeURIComponent(name);
  }

  async function manageProfile(payload) {
    var res = await apiFetch(functionUrl("profile-manage"), {
      method: "POST",
      headers: Object.assign({}, headers(), { "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Nepavyko pakeisti puslapio.");
    return data;
  }

  async function updateAtminimas(identifier, input, options) {
    var existing = Array.isArray(options && options.existingMedia) ? options.existingMedia.slice() : [];
    var files = options && options.files ? options.files : {};
    var hasPhotos = !!(files.photos && files.photos.length);
    var hasVideo = !!files.video;
    var hasCaptions = !!files.captions;
    var uploaded = (hasPhotos || hasVideo || hasCaptions)
      ? await uploadBuilderMedia(identifier, files, true, options && options.onProgress)
      : [];
    var media = existing.filter(function (item) {
      if (item.type === "image" && hasPhotos) return false;
      if (item.type === "video" && hasVideo) return false;
      if (item.type === "captions" && hasCaptions) return false;
      return true;
    }).concat(uploaded);

    var imageIndex = 0;
    media.forEach(function (item) {
      if (item.type !== "image") return;
      imageIndex += 1;
      item.order = imageIndex;
      item.alt = (input["photo_alt_" + imageIndex] || "").trim() || (item.alt || "Atminimo nuotrauka " + imageIndex);
      item.caption = (input["photo_caption_" + imageIndex] || "").trim() || null;
    });

    await manageProfile({
      action: "update",
      profile_id: identifier,
      profile: {
        vardas: input.vardas,
        pavarde: input.pavarde,
        gimimo_data: input.gimimo_data,
        mirties_data: input.mirties_data,
        epitafija: input.epitafija,
        tekstas_200: input.tekstas_200
      },
      layout: options && options.layout ? options.layout : {},
      media: media
    });
    return { identifier: identifier, table: "profiliai", media: media };
  }

  async function deleteAtminimas(identifier) {
    return manageProfile({ action: "delete", profile_id: identifier });
  }

  global.AtminimasApi = {
    getPageSlug: getPageSlug,
    loadAtminimasBySlug: loadAtminimasBySlug,
    createAtminimas: createAtminimas,
    updateAtminimas: updateAtminimas,
    deleteAtminimas: deleteAtminimas,
    createUzsakymas: createUzsakymas,
    uploadBuilderMedia: uploadBuilderMedia,
    qrImageUrl: qrImageUrl
  };
})(window);


