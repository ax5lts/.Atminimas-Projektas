(function () {
  var form = document.getElementById("editor-form");
  var statusEl = document.getElementById("editor-status");
  var wordCountEl = document.getElementById("editor-word-count");
  var previewCode = document.getElementById("editor-preview-code");
  var previewName = document.getElementById("editor-preview-name");
  var previewDates = document.getElementById("editor-preview-dates");
  var previewText = document.getElementById("editor-preview-epitaph");
  var previewLongText = document.getElementById("editor-preview-text");
  var photosInput = document.getElementById("editor-photos");
  var videoInput = document.getElementById("editor-video");
  var captionsInput = document.getElementById("editor-captions");
  var previewVideo = document.getElementById("editor-preview-video");
  var resultBox = document.getElementById("editor-result");
  var openLink = document.getElementById("editor-open-link");
  var checkoutLink = document.getElementById("editor-checkout-link");
  var clientLink = document.getElementById("editor-client-link");
  var qrLink = document.getElementById("editor-qr-link");
  var orderCode = document.getElementById("editor-order-code");
  var stage = document.getElementById("editor-preview-stage");
  var clearDraftButton = document.getElementById("editor-clear-draft");
  var backgroundInput = document.getElementById("editor-background");
  var backgroundValue = document.getElementById("editor-background-value");
  var colorWheel = document.getElementById("editor-color-wheel");
  var colorWheelThumb = document.getElementById("editor-color-wheel-thumb");
  var colorBrightness = document.getElementById("editor-color-brightness");
  var colorCurrent = document.getElementById("editor-color-current");
  var fontFamilyInput = document.getElementById("editor-font-family");
  var fontSizeInput = document.getElementById("editor-font-size");
  var fontSizeValue = document.getElementById("editor-font-size-value");
  var photoFileList = document.getElementById("editor-photo-file-list");
  var MAX_PHOTOS = 8;
  var MAX_STORY_WORDS = 1000;
  var PREVIEW_STORY_WORDS = 80;
  var photoSlots = [
    document.getElementById("editor-preview-photo-1"),
    document.getElementById("editor-preview-photo-2"),
    document.getElementById("editor-preview-photo-3"),
    document.getElementById("editor-preview-photo-4")
  ];
  var captionSlots = [
    document.getElementById("editor-preview-caption-1"),
    document.getElementById("editor-preview-caption-2"),
    document.getElementById("editor-preview-caption-3"),
    document.getElementById("editor-preview-caption-4")
  ];
  var transformMode = "resize";
  var selectedPiece = null;
  var processedPhotos = [];
  var cropPromises = [];
  var savedVideoFile = null;
  var editingMedia = [];
  var isRestoringDraft = false;
  var draftSaveTimer = null;
  var editId = (new URLSearchParams(window.location.search).get("edit") || "").trim();
  var DRAFT_KEY = editId ? "atminimas.editor.edit." + editId + ".v1" : "atminimas.editor.draft.v1";
  var DRAFT_FILE_PREFIX = editId ? "edit-" + editId + "-" : "create-";
  var DRAFT_DB = "atminimas-editor-draft";
  var DRAFT_STORE = "files";
  var PRODUCT_KEY = "atminimas.selected-product.v1";
  var productSummary = document.getElementById("editor-product-summary");
  var selectedHue = 0;
  var selectedSaturation = 0;
  var selectedBrightness = 100;
  var FONT_STACKS = {
    georgia: 'Georgia, "Times New Roman", serif',
    arial: 'Arial, Helvetica, sans-serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    times: '"Times New Roman", Times, serif',
    courier: '"Courier New", Courier, monospace'
  };

  function selectedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(PRODUCT_KEY);
    var value = requested === "asa" || requested === "metal" ? requested : stored;
    value = value === "asa" ? "asa" : "metal";
    sessionStorage.setItem(PRODUCT_KEY, value);
    return value;
  }

  var productType = selectedProduct();
  if (productSummary) productSummary.textContent = editId
    ? "Redaguojamas jūsų atminimo puslapis."
    : "Pasirinktas produktas: " + (productType === "asa" ? "ASA 3D ženkliukas" : "metalo ženkliukas") + ". Kaina kol kas –.";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHex(value) {
    var hex = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split("").map(function (part) { return part + part; }).join("");
    return /^[0-9a-f]{6}$/i.test(hex) ? "#" + hex.toLowerCase() : "#ffffff";
  }

  function hsvToHex(hue, saturation, brightness) {
    var h = ((hue % 360) + 360) % 360;
    var s = clamp(saturation, 0, 100) / 100;
    var v = clamp(brightness, 0, 100) / 100;
    var chroma = v * s;
    var section = h / 60;
    var x = chroma * (1 - Math.abs((section % 2) - 1));
    var rgb = section < 1 ? [chroma, x, 0]
      : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
      : section < 4 ? [0, x, chroma]
      : section < 5 ? [x, 0, chroma]
      : [chroma, 0, x];
    var match = v - chroma;
    return "#" + rgb.map(function (part) {
      return Math.round((part + match) * 255).toString(16).padStart(2, "0");
    }).join("");
  }

  function hexToHsv(value) {
    var hex = normalizeHex(value).slice(1);
    var red = parseInt(hex.slice(0, 2), 16) / 255;
    var green = parseInt(hex.slice(2, 4), 16) / 255;
    var blue = parseInt(hex.slice(4, 6), 16) / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var delta = max - min;
    var hue = 0;
    if (delta) {
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
      else hue = 60 * (((red - green) / delta) + 4);
    }
    return {
      h: (hue + 360) % 360,
      s: max ? (delta / max) * 100 : 0,
      v: max * 100
    };
  }

  function positionColorThumb() {
    if (!colorWheelThumb || !colorWheel) return;
    var angle = selectedHue * Math.PI / 180;
    var distance = selectedSaturation * 0.47;
    colorWheelThumb.style.left = (50 + Math.cos(angle) * distance) + "%";
    colorWheelThumb.style.top = (50 + Math.sin(angle) * distance) + "%";
    colorWheel.setAttribute("aria-valuenow", String(Math.round(selectedHue)));
    colorWheel.setAttribute("aria-valuetext", "Atspalvis " + Math.round(selectedHue) + "°, sodrumas " + Math.round(selectedSaturation) + "%");
  }

  function updateColorState(value) {
    var hsv = hexToHsv(value);
    selectedHue = hsv.h;
    selectedSaturation = hsv.s;
    selectedBrightness = Math.max(20, hsv.v);
    if (colorBrightness) colorBrightness.value = String(Math.round(selectedBrightness));
    positionColorThumb();
  }

  function setBackgroundColor(value, updatePicker, persist) {
    var hex = normalizeHex(value);
    if (backgroundInput) backgroundInput.value = hex;
    if (backgroundValue) backgroundValue.textContent = hex;
    if (colorCurrent) colorCurrent.style.backgroundColor = hex;
    stage.style.backgroundColor = hex;
    if (updatePicker) updateColorState(hex);
    if (persist) scheduleDraftSave();
  }

  function colorFromWheelPoint(clientX, clientY) {
    if (!colorWheel) return;
    var rect = colorWheel.getBoundingClientRect();
    var radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    var x = clientX - rect.left - rect.width / 2;
    var y = clientY - rect.top - rect.height / 2;
    selectedHue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    selectedSaturation = clamp(Math.sqrt(x * x + y * y) / radius * 100, 0, 100);
    positionColorThumb();
    setBackgroundColor(hsvToHex(selectedHue, selectedSaturation, selectedBrightness), false, true);
  }

  function setupColorPicker() {
    if (!colorWheel || !backgroundInput) return;
    updateColorState(backgroundInput.value);
    colorWheel.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      colorWheel.setPointerCapture(event.pointerId);
      colorFromWheelPoint(event.clientX, event.clientY);
    });
    colorWheel.addEventListener("pointermove", function (event) {
      if (!colorWheel.hasPointerCapture(event.pointerId)) return;
      colorFromWheelPoint(event.clientX, event.clientY);
    });
    colorWheel.addEventListener("keydown", function (event) {
      var handled = true;
      if (event.key === "ArrowLeft") selectedHue -= 3;
      else if (event.key === "ArrowRight") selectedHue += 3;
      else if (event.key === "ArrowUp") selectedSaturation += 3;
      else if (event.key === "ArrowDown") selectedSaturation -= 3;
      else handled = false;
      if (!handled) return;
      event.preventDefault();
      selectedHue = (selectedHue + 360) % 360;
      selectedSaturation = clamp(selectedSaturation, 0, 100);
      positionColorThumb();
      setBackgroundColor(hsvToHex(selectedHue, selectedSaturation, selectedBrightness), false, true);
    });
    backgroundInput.addEventListener("input", function () {
      setBackgroundColor(backgroundInput.value, true, true);
    });
    if (colorBrightness) {
      colorBrightness.addEventListener("input", function () {
        selectedBrightness = Number(colorBrightness.value) || 100;
        setBackgroundColor(hsvToHex(selectedHue, selectedSaturation, selectedBrightness), false, true);
      });
    }
    document.querySelectorAll("[data-background-color]").forEach(function (button) {
      button.style.backgroundColor = button.dataset.backgroundColor;
      button.addEventListener("click", function () {
        setBackgroundColor(button.dataset.backgroundColor, true, true);
      });
    });
  }

  function words(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function limitWords(value, max) {
    var list = words(value);
    return list.length > max ? list.slice(0, max).join(" ") : value;
  }

  function storyPreview(value) {
    var list = words(value);
    if (list.length <= PREVIEW_STORY_WORDS) return value;
    return list.slice(0, PREVIEW_STORY_WORDS).join(" ") + "…";
  }

  function formData() {
    return Object.fromEntries(new FormData(form).entries());
  }

  function typographyState() {
    var family = fontFamilyInput && FONT_STACKS[fontFamilyInput.value] ? fontFamilyInput.value : "georgia";
    var size = clamp(Number(fontSizeInput && fontSizeInput.value) || 18, 14, 28);
    return { family: family, size: size };
  }

  function applyTypography() {
    var typography = typographyState();
    stage.style.setProperty("--memorial-font-family", FONT_STACKS[typography.family]);
    stage.style.setProperty("--memorial-font-size", typography.size + "px");
    if (fontSizeValue) fontSizeValue.textContent = typography.size + " px";
  }

  function openDraftDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return resolve(null);
      var request = indexedDB.open(DRAFT_DB, 1);
      request.onupgradeneeded = function () {
        request.result.createObjectStore(DRAFT_STORE, { keyPath: "key" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function draftFileKey(key) {
    return DRAFT_FILE_PREFIX + key;
  }

  async function putDraftFile(key, file) {
    if (!file) return;
    var db = await openDraftDb();
    if (!db) return;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      tx.objectStore(DRAFT_STORE).put({
        key: draftFileKey(key),
        file: file,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified || Date.now()
      });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function deleteDraftFile(key) {
    var db = await openDraftDb();
    if (!db) return;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      tx.objectStore(DRAFT_STORE).delete(draftFileKey(key));
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function getDraftFile(key) {
    var db = await openDraftDb();
    if (!db) return null;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readonly");
      var request = tx.objectStore(DRAFT_STORE).get(draftFileKey(key));
      request.onsuccess = function () {
        var item = request.result;
        if (!item || !item.file) return resolve(null);
        if (item.file instanceof File) return resolve(item.file);
        resolve(new File([item.file], item.name || key, {
          type: item.type || item.file.type || "",
          lastModified: item.lastModified || Date.now()
        }));
      };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function clearDraftFiles() {
    var db = await openDraftDb();
    if (!db) return;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      var store = tx.objectStore(DRAFT_STORE);
      for (var i = 0; i < MAX_PHOTOS; i++) store.delete(draftFileKey("photo-" + i));
      store.delete(draftFileKey("video"));
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    await clearDraftFiles();
    window.location.reload();
  }

  async function discardCurrentDraft() {
    localStorage.removeItem(DRAFT_KEY);
    await clearDraftFiles();
  }

  function applyLayout(layout) {
    if (!layout) return;
    if (layout.__stage && layout.__stage.background) {
      stage.style.backgroundColor = layout.__stage.background;
      if (backgroundInput) backgroundInput.value = layout.__stage.background;
      if (backgroundValue) backgroundValue.textContent = layout.__stage.background;
    }
    if (layout.__stage) {
      if (fontFamilyInput && FONT_STACKS[layout.__stage.fontFamily]) {
        fontFamilyInput.value = layout.__stage.fontFamily;
      }
      if (fontSizeInput) {
        fontSizeInput.value = String(clamp(Number(layout.__stage.fontSize) || 18, 14, 28));
      }
      applyTypography();
    }
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      var saved = layout[piece.dataset.piece];
      if (!saved) return;
      if (saved.left) piece.style.left = saved.left;
      if (saved.top) piece.style.top = saved.top;
      if (saved.width) piece.style.width = saved.width;
      if (saved.heightPct) setPieceHeightPct(piece, parseFloat(saved.heightPct));
      if (saved.fit) piece.dataset.fit = saved.fit;
      var img = piece.querySelector && piece.querySelector("img");
      if (img && saved.objectPosition) img.style.objectPosition = saved.objectPosition;
      if (img && saved.fit === "crop") img.style.objectFit = "cover";
    });
  }

  function draftFormData() {
    var state = {
      vardas: form.elements.vardas.value || "",
      pavarde: form.elements.pavarde.value || "",
      gimimo_data: form.elements.gimimo_data.value || "",
      mirties_data: form.elements.mirties_data.value || "",
      epitafija: form.elements.epitafija.value || "",
      tekstas_200: form.elements.tekstas_200.value || "",
      fono_spalva: form.elements.fono_spalva.value || "#ffffff",
      font_family: form.elements.font_family.value || "georgia",
      font_size: form.elements.font_size.value || "18"
    };
    for (var i = 1; i <= MAX_PHOTOS; i++) {
      state["photo_caption_" + i] = form.elements["photo_caption_" + i].value || "";
      state["photo_alt_" + i] = form.elements["photo_alt_" + i].value || "";
    }
    return state;
  }

  function saveDraftNow() {
    if (isRestoringDraft) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: draftFormData(),
        layout: collectLayout(),
        savedAt: new Date().toISOString()
      }));
    } catch (err) {
      console.warn("Draft save failed", err);
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraftNow, 150);
  }

  function restoreDraftFields(formState) {
    if (!formState) return;
    Object.keys(formState).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = formState[name] || "";
    });
  }

  function renderPhotoFileList(names) {
    if (!photoFileList) return;
    var selected = (names || []).filter(Boolean);
    photoFileList.textContent = selected.length
      ? selected.map(function (name, index) { return (index + 1) + ". " + name; }).join(" · ")
      : "Nuotraukos dar nepasirinktos.";
  }

  async function restoreDraftMedia() {
    var restoredNames = [];
    for (var i = 0; i < MAX_PHOTOS; i++) {
      var photo = await getDraftFile("photo-" + i);
      if (!photo) continue;
      processedPhotos[i] = photo;
      restoredNames[i] = photo.name || ("Nuotrauka " + (i + 1));
      var slot = photoSlots[i];
      if (!slot) continue;
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      slot.src = URL.createObjectURL(photo);
      slot.hidden = false;
      if (empty) empty.hidden = true;
    }
    if (restoredNames.some(Boolean) || !editId) renderPhotoFileList(restoredNames);

    var video = await getDraftFile("video");
    if (video) {
      savedVideoFile = video;
      var wrap = previewVideo.closest(".editor-video-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      previewVideo.src = URL.createObjectURL(video);
      previewVideo.hidden = false;
      if (empty) empty.hidden = true;
    }
  }

  async function restoreDraft() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    isRestoringDraft = true;
    try {
      var draft = JSON.parse(raw);
      restoreDraftFields(draft.form);
      applyLayout(draft.layout);
      await restoreDraftMedia();
      statusEl.textContent = "Atkurta paskutine neissaugota versija.";
    } catch (err) {
      console.warn("Draft restore failed", err);
    } finally {
      isRestoringDraft = false;
    }
  }

  function showExistingMedia(media) {
    editingMedia = Array.isArray(media) ? media.slice() : [];
    var images = editingMedia.filter(function (item) { return item.type === "image"; })
      .sort(function (left, right) { return Number(left.order || 0) - Number(right.order || 0); });
    images.forEach(function (item, index) {
      var captionField = form.elements["photo_caption_" + (index + 1)];
      var altField = form.elements["photo_alt_" + (index + 1)];
      if (captionField) captionField.value = item.caption || "";
      if (altField) altField.value = item.alt || "";
      var slot = photoSlots[index];
      if (!slot) return;
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      slot.src = item.url;
      slot.hidden = false;
      if (empty) empty.hidden = true;
    });
    if (images.length) photoFileList.textContent = "Paliekamos " + images.length + " esamos nuotraukos. Pasirinkus naujas, jos bus pakeistos.";

    var video = editingMedia.find(function (item) { return item.type === "video"; });
    if (video) {
      var videoWrap = previewVideo.closest(".editor-video-slot");
      var videoEmpty = videoWrap ? videoWrap.querySelector(".editor-empty-photo") : null;
      previewVideo.src = video.url;
      previewVideo.hidden = false;
      if (videoEmpty) videoEmpty.hidden = true;
    }
  }

  async function loadProfileForEditing() {
    if (!editId) return;
    var loaded = await AtminimasApi.loadAtminimasBySlug(editId);
    var profile = loaded.atminimas || {};
    ["vardas", "pavarde", "gimimo_data", "mirties_data", "epitafija", "tekstas_200"].forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = profile[name] || "";
    });
    showExistingMedia(profile.media_json);
    applyLayout(profile.layout_json || {});
    var heading = document.getElementById("editor-panel-title");
    if (heading) heading.textContent = "Redaguokite puslapį";
    var submit = form.querySelector("button[type='submit']");
    if (submit) submit.textContent = "Išsaugoti pakeitimus";
    if (checkoutLink) checkoutLink.hidden = true;
    previewCode.textContent = "puslapis: " + editId;
    document.title = "Redaguoti atminimo puslapį - Atminimas";
  }

  function syncPreview() {
    var data = formData();
    var text = limitWords(data.tekstas_200 || "", MAX_STORY_WORDS);
    if (text !== data.tekstas_200) form.elements.tekstas_200.value = text;
    var count = words(text).length;
    var fullName = [data.vardas, data.pavarde].filter(Boolean).join(" ").trim();
    var dates = [data.gimimo_data, data.mirties_data].filter(Boolean).join(" - ");

    previewName.textContent = fullName || "Vardas Pavardė";
    previewDates.textContent = dates || "Gimimo data - Mirties data";
    previewText.textContent = data.epitafija || "Trumpa epitafija atsiras čia.";
    previewLongText.textContent = storyPreview(text) || "Gyvenimo istorijos pradžia atsiras čia. Visas tekstas bus rodomas žemiau pagrindinio vaizdo.";
    captionSlots.forEach(function (caption, index) {
      var value = (data["photo_caption_" + (index + 1)] || "").trim();
      caption.textContent = value;
      caption.hidden = !value;
    });
    var background = data.fono_spalva || "#ffffff";
    setBackgroundColor(background, true, false);
    applyTypography();
    fitName();
    wordCountEl.textContent = count + " / " + MAX_STORY_WORDS + " žodžių";
    wordCountEl.classList.toggle("is-limit", count >= MAX_STORY_WORDS);
  }

  function fitName() {
    var size = clamp(typographyState().size * 3, 36, 72);
    previewName.style.fontSize = size + "px";
    while (size > 20 && previewName.scrollWidth > previewName.clientWidth) {
      size -= 2;
      previewName.style.fontSize = size + "px";
    }
  }

  function imageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objectUrl = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      };
      img.src = objectUrl;
    });
  }

  function isNearBlack(data, index) {
    return data[index] < 26 && data[index + 1] < 26 && data[index + 2] < 26;
  }

  async function autoCropBlackBorders(file) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) return file;
    var img = await imageFromFile(file);
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var analysisScale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * analysisScale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * analysisScale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var minX = canvas.width;
    var minY = canvas.height;
    var maxX = 0;
    var maxY = 0;

    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var i = (y * canvas.width + x) * 4;
        if (!isNearBlack(data, i)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      minX = 0;
      minY = 0;
      maxX = canvas.width - 1;
      maxY = canvas.height - 1;
    }
    var cropW = maxX - minX + 1;
    var cropH = maxY - minY + 1;
    var removed = 1 - (cropW * cropH) / (canvas.width * canvas.height);
    if (removed < 0.03) {
      minX = 0;
      minY = 0;
      cropW = canvas.width;
      cropH = canvas.height;
    }

    var sourceX = Math.round(minX / analysisScale);
    var sourceY = Math.round(minY / analysisScale);
    var sourceW = Math.min(img.naturalWidth - sourceX, Math.round(cropW / analysisScale));
    var sourceH = Math.min(img.naturalHeight - sourceY, Math.round(cropH / analysisScale));
    var outputScale = Math.min(1, 1600 / Math.max(sourceW, sourceH));

    var out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(sourceW * outputScale));
    out.height = Math.max(1, Math.round(sourceH * outputScale));
    out.getContext("2d").drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, out.width, out.height);

    return new Promise(function (resolve) {
      out.toBlob(function (blob) {
        if (!blob) return resolve(file);
        var name = file.name.replace(/\.[^.]+$/, "") + "-optimized.webp";
        resolve(new File([blob], name, { type: "image/webp" }));
      }, "image/webp", 0.82);
    });
  }

  function setFrameToImageRatio(slot, img) {
    var wrap = slot.closest(".editor-photo-slot");
    if (!wrap || !img.naturalWidth || !img.naturalHeight) return;
    var width = wrap.getBoundingClientRect().width || 120;
    var height = Math.max(54, Math.round(width * img.naturalHeight / img.naturalWidth));
    setPieceHeightPct(wrap, heightPctFromPx(height));
  }

  async function syncPhotos() {
    var allFiles = Array.prototype.slice.call(photosInput.files || []);
    var files = allFiles.slice(0, MAX_PHOTOS);
    processedPhotos = [];
    cropPromises = [];
    photoSlots.forEach(function (slot) {
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      slot.hidden = true;
      slot.removeAttribute("src");
      if (empty) empty.hidden = false;
    });
    files.forEach(function (file, index) {
      var promise = autoCropBlackBorders(file).then(function (cropped) {
        processedPhotos[index] = cropped;
        var slot = photoSlots[index];
        if (slot) {
          var wrap = slot.closest(".editor-photo-slot");
          var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
          slot.src = URL.createObjectURL(cropped);
          slot.hidden = false;
          slot.onload = function () { setFrameToImageRatio(slot, slot); };
          if (empty) empty.hidden = true;
        }
        putDraftFile("photo-" + index, cropped).catch(function (err) { console.warn(err); });
        scheduleDraftSave();
      });
      cropPromises.push(promise);
    });
    for (var i = files.length; i < MAX_PHOTOS; i++) {
      deleteDraftFile("photo-" + i).catch(function (err) { console.warn(err); });
    }
    renderPhotoFileList(files.map(function (file) { return file.name; }));
    statusEl.textContent = allFiles.length > MAX_PHOTOS
      ? "Bus išsaugotos tik pirmos " + MAX_PHOTOS + " nuotraukos."
      : (files.length ? "Pasirinkta nuotraukų: " + files.length + "." : "");
  }

  function pct(value, total) {
    return Math.max(0, Math.min(100, (value / total) * 100));
  }

  function stageWidth() {
    return stage.getBoundingClientRect().width || 520;
  }

  function heightPxFromPct(heightPct) {
    return Math.max(24, Math.round(stageWidth() * heightPct / 100));
  }

  function heightPctFromPx(value) {
    return Math.max(4, Math.min(180, (value / stageWidth()) * 100));
  }

  function setPieceHeightPct(piece, heightPct) {
    var next = Math.max(4, Math.min(180, heightPct));
    piece.dataset.heightPct = String(next);
    piece.style.height = heightPxFromPct(next) + "px";
  }

  function refreshProportionalHeights() {
    stage.querySelectorAll(".editor-piece[data-height-pct]").forEach(function (piece) {
      setPieceHeightPct(piece, parseFloat(piece.dataset.heightPct || "20"));
    });
  }

  function selectPiece(piece) {
    if (selectedPiece) selectedPiece.classList.remove("is-selected");
    selectedPiece = piece;
    if (selectedPiece) selectedPiece.classList.add("is-selected");
  }

  function setupTransformModeButtons() {
    document.querySelectorAll("[data-transform-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        transformMode = button.dataset.transformMode || "resize";
        document.querySelectorAll("[data-transform-mode]").forEach(function (b) {
          b.classList.toggle("is-active", b === button);
        });
        if (transformMode === "crop" && selectedPiece && selectedPiece.classList.contains("editor-photo-slot")) {
          setCropMode(selectedPiece);
        }
      });
    });
  }

  function setupEditorSectionButtons() {
    var panel = document.querySelector(".editor-panel");
    document.querySelectorAll("[data-editor-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.getElementById("editor-section-" + button.dataset.editorSection);
        if (!target) return;
        document.querySelectorAll("[data-editor-section]").forEach(function (item) {
          item.classList.toggle("is-active", item === button);
        });
        if (window.matchMedia("(max-width: 860px)").matches) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (panel) {
          panel.scrollTo({
            top: Math.max(0, target.offsetTop - panel.offsetTop - 18),
            behavior: "smooth"
          });
        }
        target.classList.remove("editor-section-flash");
        void target.offsetWidth;
        target.classList.add("editor-section-flash");
      });
    });
  }

  function bindDrag() {
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      piece.addEventListener("pointerdown", function (event) {
        if (event.target.closest("input, textarea, button, a")) return;
        if (event.target.closest(".editor-resize-handle, .editor-stretch-handle, .editor-crop-handle")) return;
        if (piece.classList.contains("editor-photo-slot")) selectPiece(piece);
        event.preventDefault();
        piece.setPointerCapture(event.pointerId);
        var stageRect = stage.getBoundingClientRect();
        var pieceRect = piece.getBoundingClientRect();
        var offsetX = event.clientX - pieceRect.left;
        var offsetY = event.clientY - pieceRect.top;

        function move(moveEvent) {
          var left = pct(moveEvent.clientX - stageRect.left - offsetX, stageRect.width);
          var top = pct(moveEvent.clientY - stageRect.top - offsetY, stageRect.height);
          piece.style.left = left + "%";
          piece.style.top = top + "%";
        }

        function up() {
          scheduleDraftSave();
          piece.removeEventListener("pointermove", move);
          piece.removeEventListener("pointerup", up);
          piece.removeEventListener("pointercancel", up);
        }

        piece.addEventListener("pointermove", move);
        piece.addEventListener("pointerup", up);
        piece.addEventListener("pointercancel", up);
      });
    });
  }

  function bindResize() {
    stage.querySelectorAll(".editor-resize-handle").forEach(function (handle) {
      handle.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var piece = handle.closest(".editor-piece");
        handle.setPointerCapture(event.pointerId);
        var stageRect = stage.getBoundingClientRect();
        var pieceRect = piece.getBoundingClientRect();
        var startX = event.clientX;
        var startY = event.clientY;
        var startWidth = pieceRect.width;
        var startHeight = pieceRect.height;
        var startLeft = pieceRect.left - stageRect.left;
        var startTop = pieceRect.top - stageRect.top;
        selectPiece(piece);

        function move(moveEvent) {
          var dx = moveEvent.clientX - startX;
          var dy = moveEvent.clientY - startY;
          var fromLeft = handle.classList.contains("editor-resize-sw") || handle.classList.contains("editor-resize-nw");
          var fromTop = handle.classList.contains("editor-resize-ne") || handle.classList.contains("editor-resize-nw");
          var nextWidth = Math.max(48, startWidth + (fromLeft ? -dx : dx));
          var nextHeight = Math.max(48, startHeight + (fromTop ? -dy : dy));

          if (transformMode === "scale") {
            var ratio = startHeight / startWidth;
            nextHeight = nextWidth * ratio;
          }

          piece.style.width = Math.max(14, Math.min(94, pct(nextWidth, stageRect.width))) + "%";
          setPieceHeightPct(piece, heightPctFromPx(nextHeight));
          if (fromLeft) piece.style.left = pct(startLeft + dx, stageRect.width) + "%";
          if (fromTop) piece.style.top = pct(startTop + dy, stageRect.height) + "%";
        }

        function up() {
          scheduleDraftSave();
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        }

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
    });
  }

  function bindStretch() {
    stage.querySelectorAll(".editor-stretch-handle").forEach(function (handle) {
      handle.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var piece = handle.closest(".editor-piece");
        if (transformMode !== "stretch") {
          transformMode = "stretch";
          document.querySelectorAll("[data-transform-mode]").forEach(function (b) {
            b.classList.toggle("is-active", b.dataset.transformMode === "stretch");
          });
        }
        selectPiece(piece);
        handle.setPointerCapture(event.pointerId);
        var stageRect = stage.getBoundingClientRect();
        var pieceRect = piece.getBoundingClientRect();
        var startX = event.clientX;
        var startY = event.clientY;
        var startWidth = pieceRect.width;
        var startHeight = pieceRect.height;
        var startLeft = pieceRect.left - stageRect.left;
        var startTop = pieceRect.top - stageRect.top;

        function move(moveEvent) {
          if (handle.classList.contains("editor-stretch-x") || handle.classList.contains("editor-stretch-left")) {
            var fromLeft = handle.classList.contains("editor-stretch-left");
            var nextWidth = Math.max(48, startWidth + (fromLeft ? startX - moveEvent.clientX : moveEvent.clientX - startX));
            piece.style.width = Math.max(14, Math.min(94, pct(startWidth + moveEvent.clientX - startX, stageRect.width))) + "%";
            if (fromLeft) {
              piece.style.width = Math.max(14, Math.min(94, pct(nextWidth, stageRect.width))) + "%";
              piece.style.left = pct(startLeft + moveEvent.clientX - startX, stageRect.width) + "%";
            }
          } else if (handle.classList.contains("editor-stretch-y") || handle.classList.contains("editor-stretch-top")) {
            var fromTop = handle.classList.contains("editor-stretch-top");
            var nextHeight = Math.max(48, startHeight + (fromTop ? startY - moveEvent.clientY : moveEvent.clientY - startY));
            setPieceHeightPct(piece, heightPctFromPx(nextHeight));
            if (fromTop) piece.style.top = pct(startTop + moveEvent.clientY - startY, stageRect.height) + "%";
          }
        }

        function up() {
          scheduleDraftSave();
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        }

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
    });
  }

  function setCropMode(piece) {
    var img = piece.querySelector("img");
    if (!img) return;
    piece.dataset.fit = "crop";
    img.style.objectFit = "cover";
    if (!img.style.objectPosition) img.style.objectPosition = "50% 50%";
  }

  function cropPosition(img) {
    var parts = (img.style.objectPosition || "50% 50%").split(" ");
    return {
      x: parseFloat(parts[0]) || 50,
      y: parseFloat(parts[1]) || 50
    };
  }

  function bindCrop() {
    stage.querySelectorAll(".editor-crop-handle").forEach(function (handle) {
      handle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var piece = handle.closest(".editor-photo-slot");
        var img = piece.querySelector("img");
        if (!img || img.hidden) return;
        transformMode = "crop";
        document.querySelectorAll("[data-transform-mode]").forEach(function (b) {
          b.classList.toggle("is-active", b.dataset.transformMode === "crop");
        });
        selectPiece(piece);
        setCropMode(piece);
        var pos = cropPosition(img);
        if (handle.classList.contains("editor-crop-up")) pos.y -= 8;
        if (handle.classList.contains("editor-crop-down")) pos.y += 8;
        if (handle.classList.contains("editor-crop-left")) pos.x -= 8;
        if (handle.classList.contains("editor-crop-right")) pos.x += 8;
        pos.x = Math.max(0, Math.min(100, pos.x));
        pos.y = Math.max(0, Math.min(100, pos.y));
        img.style.objectPosition = pos.x + "% " + pos.y + "%";
        scheduleDraftSave();
      });
    });
  }

  function collectLayout() {
    var typography = typographyState();
    var layout = {
      __stage: {
        background: backgroundInput ? backgroundInput.value : "#ffffff",
        fontFamily: typography.family,
        fontSize: typography.size
      }
    };
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      var img = piece.querySelector && piece.querySelector("img");
      layout[piece.dataset.piece] = {
        left: piece.style.left,
        top: piece.style.top,
        width: piece.style.width,
        heightPct: piece.dataset.heightPct || "",
        fit: piece.dataset.fit || "",
        objectPosition: img ? img.style.objectPosition : ""
      };
    });
    return layout;
  }

  form.addEventListener("input", function () {
    syncPreview();
    scheduleDraftSave();
  });
  window.addEventListener("resize", refreshProportionalHeights);
  photosInput.addEventListener("change", syncPhotos);
  videoInput.addEventListener("change", function () {
    var file = videoInput.files && videoInput.files[0];
    var wrap = previewVideo.closest(".editor-video-slot");
    var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
    if (!file) {
      savedVideoFile = null;
      previewVideo.hidden = true;
      previewVideo.removeAttribute("src");
      if (empty) empty.hidden = false;
      statusEl.textContent = "";
      deleteDraftFile("video").catch(function (err) { console.warn(err); });
      scheduleDraftSave();
      return;
    }
    savedVideoFile = file;
    previewVideo.src = URL.createObjectURL(file);
    previewVideo.hidden = false;
    if (empty) empty.hidden = true;
    statusEl.textContent = "Video pasirinktas: " + file.name;
    putDraftFile("video", file).catch(function (err) { console.warn(err); });
    scheduleDraftSave();
  });

  if (clearDraftButton) {
    clearDraftButton.addEventListener("click", function () {
      clearDraft().catch(function (err) {
        console.warn(err);
        statusEl.textContent = "Nepavyko isvalyti juodrascio.";
      });
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var submit = form.querySelector("button[type='submit']");
    var data = formData();
    statusEl.textContent = "Ruošiamos nuotraukos...";
    submit.disabled = true;
    resultBox.hidden = true;
    await Promise.all(cropPromises);
    var photos = processedPhotos.filter(Boolean).slice(0, MAX_PHOTOS);
    var video = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;

    data.tekstas_200 = limitWords(data.tekstas_200 || "", MAX_STORY_WORDS);
    data.apmoketa = false;
    data.product_type = productType;

    statusEl.textContent = "Įkeliami failai ir saugoma į DB...";
    submit.disabled = true;
    resultBox.hidden = true;

    try {
      var captions = captionsInput && captionsInput.files ? captionsInput.files[0] : null;
      var result = editId
        ? await AtminimasApi.updateAtminimas(editId, data, {
            existingMedia: editingMedia,
            files: { photos: photos, video: video, captions: captions },
            layout: collectLayout()
          })
        : await AtminimasApi.createAtminimas(data, {
            files: { photos: photos, video: video, captions: captions },
            layout: collectLayout()
          });
      if (editId) {
        editingMedia = result.media || editingMedia;
        await discardCurrentDraft();
        var editPageUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(editId);
        statusEl.textContent = "Pakeitimai išsaugoti.";
        previewCode.textContent = "puslapis: " + editId;
        openLink.href = editPageUrl;
        checkoutLink.hidden = true;
        clientLink.href = "vartotojas.html";
        clientLink.textContent = "Grįžti į kliento zoną";
        qrLink.href = AtminimasApi.qrImageUrl(new URL(editPageUrl, window.location.href).href);
        orderCode.textContent = "";
        var resultHeading = resultBox.querySelector("h3");
        if (resultHeading) resultHeading.textContent = "Pakeitimai išsaugoti";
        resultBox.hidden = false;
        return;
      }
      var order = await AtminimasApi.createUzsakymas(result.identifier, data);
      var pageUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(result.identifier);
      var clientUrl = "klientai.html?slug=" + encodeURIComponent(result.identifier);
      statusEl.textContent = "Sukurta kaip privatus puslapis. Paskelbti galėsite kliento zonoje. Slug: " + result.identifier;
      previewCode.textContent = "slug: " + result.identifier;
      openLink.href = pageUrl;
      checkoutLink.href = "apmokejimas.html?order=" + encodeURIComponent(order.id || "");
      clientLink.href = clientUrl;
      qrLink.href = order.qr_kodas_url;
      orderCode.textContent = "Užsakymas DB: " + (order.id || "sukurtas");
      resultBox.hidden = false;
    } catch (err) {
      console.error(err);
      statusEl.textContent = err.message || "Nepavyko išsaugoti. Patikrink failų dydį, tipą arba DB teises.";
    } finally {
      submit.disabled = false;
    }
  });

  async function initEditor() {
    if (window.AtminimasAuth && !AtminimasAuth.accessToken()) {
      statusEl.textContent = "Prisijunkite kliento zonoje, tada grįžkite " + (editId ? "redaguoti" : "kurti") + " puslapio.";
      form.querySelector("button[type='submit']").disabled = true;
      setTimeout(function () {
        var next = editId ? "redaktorius.html?edit=" + encodeURIComponent(editId) : "redaktorius.html?product=" + productType;
        window.location.href = "prisijungti.html?next=" + encodeURIComponent(next);
      }, 900);
      return;
    }
    await loadProfileForEditing();
    await restoreDraft();
    setupColorPicker();
    syncPreview();
    refreshProportionalHeights();
    setupTransformModeButtons();
    setupEditorSectionButtons();
    bindDrag();
    bindResize();
    bindStretch();
    bindCrop();
  }

  initEditor();
})();


