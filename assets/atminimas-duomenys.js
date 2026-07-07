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

  function restUrl(table, query) {
    var cfg = getConfig();
    return cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table) + "?" + query;
  }

  function storageObjectUrl(bucket, path) {
    var cfg = getConfig();
    return cfg.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + path.split("/").map(encodeURIComponent).join("/");
  }

  function publicStorageUrl(bucket, path) {
    var cfg = getConfig();
    return cfg.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/public/" + encodeURIComponent(bucket) + "/" + path.split("/").map(encodeURIComponent).join("/");
  }

  async function fetchJson(url) {
    var res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      var text = await res.text();
      throw new Error("Supabase: " + res.status + " – " + text);
    }
    return res.json();
  }

  async function postJson(table, payload) {
    var res = await fetch(restUrl(table, "select=*"), {
      method: "POST",
      headers: Object.assign({}, headers(), {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      var text = await res.text();
      throw new Error("Supabase: " + res.status + " – " + text);
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
    return base + "-" + Date.now().toString(36);
  }

  function fileExt(file) {
    var name = file && file.name ? file.name : "";
    var ext = name.split(".").pop().toLowerCase();
    return ext && ext !== name ? ext.replace(/[^a-z0-9]/g, "") : "bin";
  }

  async function uploadOneFile(bucket, path, file) {
    var res = await fetch(storageObjectUrl(bucket, path), {
      method: "POST",
      headers: Object.assign({}, headers(), {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      }),
      body: file
    });
    if (!res.ok) {
      var text = await res.text();
      throw new Error("Supabase Storage: " + res.status + " – " + text);
    }
    return publicStorageUrl(bucket, path);
  }

  async function uploadBuilderMedia(identifier, files) {
    var media = [];
    var photos = Array.prototype.slice.call((files && files.photos) || []).filter(Boolean).slice(0, 4);
    var video = files && files.video ? files.video : null;
    var captions = files && files.captions ? files.captions : null;
    var ownerId = global.AtminimasAuth && global.AtminimasAuth.userId ? global.AtminimasAuth.userId() : "";
    if (!ownerId) throw new Error("Failams įkelti būtina prisijungti.");
    var ownerPath = ownerId + "/" + identifier;

    for (var i = 0; i < photos.length; i++) {
      var photoPath = ownerPath + "/photo-" + (i + 1) + "." + fileExt(photos[i]);
      media.push({
        type: "image",
        url: await uploadOneFile("atminimas", photoPath, photos[i]),
        path: photoPath,
        order: i + 1
      });
    }

    if (video) {
      var videoPath = ownerPath + "/video." + fileExt(video);
      media.push({
        type: "video",
        url: await uploadOneFile("atminimas", videoPath, video),
        path: videoPath,
        order: 1
      });
    }

    if (captions) {
      var captionsPath = ownerPath + "/captions." + fileExt(captions);
      media.push({
        type: "captions",
        url: await uploadOneFile("atminimas", captionsPath, captions),
        path: captionsPath,
        language: "lt",
        order: 1
      });
    }

    return media;
  }

  function getPageSlug() {
    var params = new URLSearchParams(global.location.search);
    return (params.get("id") || params.get("slug") || params.get("s") || "demo").trim();
  }

  async function findAtminimasInTable(table, identifier) {
    var safeIdentifier = encodeURIComponent(identifier);
    var queries = [];

    if (table === "profiliai" || table === "sablonas-viskas") {
      queries.push("id=eq." + safeIdentifier + "&select=*&limit=1");
    } else if (/^\d+$/.test(identifier) || /^[0-9a-f-]{32,36}$/i.test(identifier)) {
      queries.push("id=eq." + safeIdentifier + "&select=*&limit=1");
      queries.push("slug=eq." + safeIdentifier + "&select=*&limit=1");
    } else {
      queries.push("slug=eq." + safeIdentifier + "&select=*&limit=1");
    }

    for (var i = 0; i < queries.length; i++) {
      try {
        var rows = await fetchJson(restUrl(table, queries[i]));
        if (rows && rows.length) return rows[0];
      } catch (err) {
        if (i === queries.length - 1) throw err;
      }
    }

    return null;
  }

  async function loadAtminimasBySlug(identifier) {
    var atminimas = null;
    var table = "atminimai";
    var tables = ["profiliai", "sablonas-viskas", "atminimai"];
    var lastError = null;

    for (var i = 0; i < tables.length; i++) {
      try {
        var found = await findAtminimasInTable(tables[i], identifier);
        if (found) {
          atminimas = found;
          table = tables[i];
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!atminimas) {
      if (lastError) console.warn(lastError);
      throw new Error('Atminimas nerastas duomenų bazėje (ID/slug: "' + identifier + '")');
    }

    var nuotraukos = [];
    if (table === "atminimai") {
    try {
      var foreignKey = table === "profiliai" ? "profilis_id" : "atminimas_id";
      nuotraukos = await fetchJson(
        restUrl(
          "nuotraukos",
          foreignKey + "=eq." + encodeURIComponent(atminimas.id) + "&select=*&order=eile_nr.asc"
        )
      );
    } catch (e) {
      console.warn("Nuotraukų lentelė nerasta arba neprieinama. Naudojamas tuščias sąrašas.");
    }
    }

    return { atminimas: atminimas, nuotraukos: nuotraukos };
  }

  async function createAtminimas(input, options) {
    var vardas = (input.vardas || "").trim();
    var pavarde = (input.pavarde || "").trim();
    var customId = (input.id || input.slug || "").trim();
    var identifier = customId ? slugify(customId) : uniqueIdentifier(vardas, pavarde);
    var fullName = [vardas, pavarde].filter(Boolean).join(" ");
    var media = options && options.media ? options.media : [];
    var layout = options && options.layout ? options.layout : {};

    if (options && options.files) {
      media = await uploadBuilderMedia(identifier, options.files);
    }

    var imageIndex = 0;
    media.forEach(function (item) {
      if (item.type !== "image") return;
      imageIndex += 1;
      item.alt = (input["photo_alt_" + imageIndex] || "").trim() || ("Atminimo nuotrauka " + imageIndex);
    });

    await postJson("profiliai", {
      id: identifier,
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
    var pageUrl = absoluteUrl("sablonas-viskas.html?slug=" + encodeURIComponent(identifier));
    var qrUrl = qrImageUrl(pageUrl);
    var row = await postJson("uzsakymai", {
      profilis_id: identifier,
      puslapio_url: pageUrl,
      qr_kodas_url: qrUrl,
      busena: "sukurtas",
      apmoketa: !!(input && input.apmoketa)
    });
    return {
      id: row.id,
      profilis_id: identifier,
      puslapio_url: row.puslapio_url || pageUrl,
      qr_kodas_url: row.qr_kodas_url || qrUrl,
      busena: row.busena || "sukurtas"
    };
  }

  global.AtminimasApi = {
    getPageSlug: getPageSlug,
    loadAtminimasBySlug: loadAtminimasBySlug,
    createAtminimas: createAtminimas,
    createUzsakymas: createUzsakymas,
    uploadBuilderMedia: uploadBuilderMedia,
    qrImageUrl: qrImageUrl
  };
})(window);


