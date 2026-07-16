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
  var draftStateEl = document.getElementById("editor-draft-state");
  var stepProgressEl = document.getElementById("editor-step-progress");
  var saveProgressEl = document.getElementById("editor-save-progress");
  var photoOrderEl = document.getElementById("editor-photo-order");
  var productImage = document.getElementById("editor-product-image");
  var backgroundInput = document.getElementById("editor-background");
  var backgroundValue = document.getElementById("editor-background-value");
  var colorWheel = document.getElementById("editor-color-wheel");
  var colorWheelThumb = document.getElementById("editor-color-wheel-thumb");
  var colorBrightness = document.getElementById("editor-color-brightness");
  var colorCurrent = document.getElementById("editor-color-current");
  var photoFileList = document.getElementById("editor-photo-file-list");
  var datePickers = Array.from(document.querySelectorAll("[data-date-picker]"));
  var MAX_PHOTOS = 8;
  var MAX_STORY_WORDS = 1000;
  var PREVIEW_STORY_WORDS = 80;
  var DATE_MIN_YEAR = 1800;
  var DATE_MONTHS = [
    "Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
    "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"
  ];
  var DATE_MONTHS_GENITIVE = [
    "sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio",
    "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"
  ];
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
  var editorSteps = ["text", "colors", "files", "positions", "preview"];
  var currentEditorStep = "text";
  var photoOrderNames = [];
  var photoOrderMode = "files";
  var photoPreviewUrls = new WeakMap();

  function selectedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(PRODUCT_KEY);
    var value = requested === "asa" || requested === "metal" ? requested : stored;
    value = value === "asa" ? "asa" : "metal";
    sessionStorage.setItem(PRODUCT_KEY, value);
    return value;
  }

  var productType = selectedProduct();
  if (productImage) {
    productImage.src = productType === "asa" ? "assets/qr-asa-480.webp" : "assets/qr-atminimo-lentele-480.webp";
    productImage.alt = productType === "asa" ? "Pasirinkta ASA QR atminimo lentelė" : "Pasirinkta metalo QR atminimo lentelė";
  }
  if (productSummary) productSummary.textContent = editId
    ? "Redaguojamas jūsų atminimo puslapis."
    : "Pasirinktas produktas: " + (productType === "asa" ? "ASA 3D spausdinta QR atminimo lentelė" : "graviruota metalo QR atminimo lentelė") + (productType === "asa" ? ". Kaina bus patvirtinta." : ". Kaina – 59,00 EUR.");

  function setDraftState(message, state) {
    if (!draftStateEl) return;
    draftStateEl.textContent = message;
    draftStateEl.dataset.state = state || "";
  }

  function showSaveProgress(value, message) {
    if (!saveProgressEl) return;
    saveProgressEl.hidden = false;
    saveProgressEl.value = Math.max(0, Math.min(100, Number(value) || 0));
    if (message) statusEl.textContent = message;
  }

  function hideSaveProgress() {
    if (!saveProgressEl) return;
    saveProgressEl.value = 0;
    saveProgressEl.hidden = true;
  }

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

  function padDatePart(value) {
    return String(value || "").padStart(2, "0");
  }

  function datePickerElements(picker) {
    return {
      hidden: form.elements[picker.dataset.dateName],
      year: picker.querySelector("[data-date-year]"),
      month: picker.querySelector("[data-date-month]"),
      day: picker.querySelector("[data-date-day]"),
      status: picker.querySelector("[data-date-status]")
    };
  }

  function daysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate();
  }

  function datePickerValue(picker) {
    var fields = datePickerElements(picker);
    if (!fields.year.value || !fields.month.value || !fields.day.value) return "";
    return fields.year.value + "-" + padDatePart(fields.month.value) + "-" + padDatePart(fields.day.value);
  }

  function clearDatePickerError(picker) {
    var fields = datePickerElements(picker);
    picker.classList.remove("has-error");
    fields.year.removeAttribute("aria-invalid");
    fields.month.removeAttribute("aria-invalid");
    fields.day.removeAttribute("aria-invalid");
  }

  function datePickerSummary(picker) {
    var fields = datePickerElements(picker);
    if (!fields.year.value) return "Pirmiausia pasirinkite metus.";
    if (!fields.month.value) return "Dabar pasirinkite mėnesį.";
    if (!fields.day.value) return "Liko pasirinkti dieną.";
    return "Pasirinkta: " + fields.year.value + " m. " +
      DATE_MONTHS_GENITIVE[Number(fields.month.value) - 1] + " " + Number(fields.day.value) + " d.";
  }

  function refreshDatePickerMonths(picker) {
    var fields = datePickerElements(picker);
    var now = new Date();
    Array.from(fields.month.options).forEach(function (option) {
      option.disabled = !!option.value &&
        Number(fields.year.value) === now.getFullYear() &&
        Number(option.value) > now.getMonth() + 1;
    });
    if (fields.month.selectedOptions[0] && fields.month.selectedOptions[0].disabled) {
      fields.month.value = "";
      fields.day.value = "";
    }
  }

  function refreshDatePickerDays(picker, preferredDay) {
    var fields = datePickerElements(picker);
    var selectedDay = preferredDay || fields.day.value;
    var enabled = !!(fields.year.value && fields.month.value);
    var count = enabled ? daysInMonth(fields.year.value, fields.month.value) : 0;
    var now = new Date();
    if (enabled &&
        Number(fields.year.value) === now.getFullYear() &&
        Number(fields.month.value) === now.getMonth() + 1) {
      count = Math.min(count, now.getDate());
    }
    fields.day.innerHTML = "<option value=''>Diena</option>";
    for (var day = 1; day <= count; day++) {
      var option = document.createElement("option");
      option.value = padDatePart(day);
      option.textContent = day;
      fields.day.appendChild(option);
    }
    fields.day.disabled = !enabled;
    if (enabled && Number(selectedDay) <= count) fields.day.value = padDatePart(selectedDay);
  }

  function syncDatePicker(picker) {
    var fields = datePickerElements(picker);
    fields.month.disabled = !fields.year.value;
    refreshDatePickerMonths(picker);
    if (!fields.year.value) {
      fields.month.value = "";
      fields.day.value = "";
    } else if (!fields.month.value) {
      fields.day.value = "";
    }
    refreshDatePickerDays(picker);
    fields.hidden.value = datePickerValue(picker);
    fields.status.textContent = datePickerSummary(picker);
    clearDatePickerError(picker);
  }

  function setDatePickerValue(picker, value) {
    var fields = datePickerElements(picker);
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    fields.year.value = match ? match[1] : "";
    fields.month.disabled = !fields.year.value;
    fields.month.value = match ? match[2] : "";
    refreshDatePickerMonths(picker);
    refreshDatePickerDays(picker, match ? match[3] : "");
    fields.day.value = match ? match[3] : "";
    fields.hidden.value = datePickerValue(picker);
    fields.status.textContent = datePickerSummary(picker);
    clearDatePickerError(picker);
  }

  function syncDatePickersFromHidden() {
    datePickers.forEach(function (picker) {
      var fields = datePickerElements(picker);
      setDatePickerValue(picker, fields.hidden.value);
    });
  }

  function showDatePickerError(picker, message, focus) {
    var fields = datePickerElements(picker);
    picker.classList.add("has-error");
    fields.status.textContent = message;
    [fields.year, fields.month, fields.day].forEach(function (field) {
      field.setAttribute("aria-invalid", "true");
    });
    if (focus) {
      var target = !fields.year.value ? fields.year : (!fields.month.value ? fields.month : fields.day);
      target.focus();
    }
  }

  function validateDatePickers(focus) {
    var today = new Date();
    var todayIso = today.getFullYear() + "-" + padDatePart(today.getMonth() + 1) + "-" + padDatePart(today.getDate());
    var firstInvalid = null;
    datePickers.forEach(function (picker) {
      clearDatePickerError(picker);
      var fields = datePickerElements(picker);
      var chosenParts = [fields.year.value, fields.month.value, fields.day.value].filter(Boolean).length;
      if (chosenParts > 0 && chosenParts < 3 && !firstInvalid) {
        firstInvalid = { picker: picker, message: "Pasirinkite visus tris laukus arba išvalykite datą." };
      } else if (fields.hidden.value && fields.hidden.value > todayIso && !firstInvalid) {
        firstInvalid = { picker: picker, message: "Data negali būti vėlesnė nei šiandien." };
      }
    });

    var birth = form.elements.gimimo_data.value;
    var death = form.elements.mirties_data.value;
    if (!firstInvalid && birth && death && death < birth) {
      firstInvalid = {
        picker: datePickers.find(function (picker) { return picker.dataset.dateName === "mirties_data"; }),
        message: "Mirties data negali būti ankstesnė už gimimo datą."
      };
    }
    if (!firstInvalid) return true;
    showDatePickerError(firstInvalid.picker, firstInvalid.message, focus);
    return false;
  }

  function setupDatePickers() {
    var currentYear = new Date().getFullYear();
    datePickers.forEach(function (picker) {
      var fields = datePickerElements(picker);
      for (var year = currentYear; year >= DATE_MIN_YEAR; year--) {
        var yearOption = document.createElement("option");
        yearOption.value = String(year);
        yearOption.textContent = String(year);
        fields.year.appendChild(yearOption);
      }
      DATE_MONTHS.forEach(function (month, index) {
        var monthOption = document.createElement("option");
        monthOption.value = padDatePart(index + 1);
        monthOption.textContent = month;
        fields.month.appendChild(monthOption);
      });
      if (!fields.status.id) fields.status.id = picker.dataset.dateName + "-status";
      [fields.year, fields.month, fields.day].forEach(function (field) {
        field.setAttribute("aria-describedby", fields.status.id);
        field.addEventListener("change", function () {
          syncDatePicker(picker);
        });
      });
      picker.querySelector("[data-date-clear]").addEventListener("click", function () {
        setDatePickerValue(picker, "");
        syncPreview();
        scheduleDraftSave();
        fields.year.focus();
      });
      setDatePickerValue(picker, fields.hidden.value);
    });
  }

  function formData() {
    return Object.fromEntries(new FormData(form).entries());
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
      fono_spalva: form.elements.fono_spalva.value || "#ffffff"
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
      setDraftState("Juodraštis išsaugotas " + new Intl.DateTimeFormat("lt-LT", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date()), "saved");
    } catch (err) {
      console.warn("Draft save failed", err);
      setDraftState("Juodraščio nepavyko išsaugoti", "error");
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    setDraftState("Saugomi pakeitimai…", "saving");
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

  function orderedExistingImages() {
    return editingMedia.filter(function (item) { return item.type === "image"; })
      .sort(function (left, right) { return Number(left.order || 0) - Number(right.order || 0); });
  }

  function photoUrlAt(index) {
    if (photoOrderMode === "existing") {
      var existing = orderedExistingImages()[index];
      return existing && existing.url ? existing.url : "";
    }
    var file = processedPhotos[index];
    if (!file) return "";
    if (!photoPreviewUrls.has(file)) photoPreviewUrls.set(file, URL.createObjectURL(file));
    return photoPreviewUrls.get(file);
  }

  function refreshOrderedPhotoPreviews() {
    for (var i = 0; i < photoSlots.length; i++) {
      var slot = photoSlots[i];
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      var url = photoUrlAt(i);
      if (!url) {
        slot.hidden = true;
        slot.removeAttribute("src");
        if (empty) empty.hidden = false;
        continue;
      }
      slot.src = url;
      slot.hidden = false;
      if (photoOrderMode === "files") slot.onload = function () { setFrameToImageRatio(this, this); };
      if (empty) empty.hidden = true;
    }
  }

  function movePhotoFields(from, to) {
    ["photo_caption_", "photo_alt_"].forEach(function (prefix) {
      var values = [];
      for (var i = 0; i < MAX_PHOTOS; i++) {
        values.push(form.elements[prefix + (i + 1)].value);
      }
      var value = values.splice(from, 1)[0];
      values.splice(to, 0, value);
      for (var j = 0; j < MAX_PHOTOS; j++) {
        form.elements[prefix + (j + 1)].value = values[j];
      }
    });
  }

  async function persistProcessedPhotoOrder() {
    if (photoOrderMode !== "files") return;
    for (var i = 0; i < MAX_PHOTOS; i++) {
      if (processedPhotos[i]) await putDraftFile("photo-" + i, processedPhotos[i]);
      else await deleteDraftFile("photo-" + i);
    }
  }

  function swapPhotoOrder(from, to) {
    if (from === to || from < 0 || to < 0 || from >= photoOrderNames.length || to >= photoOrderNames.length) return;
    var name = photoOrderNames.splice(from, 1)[0];
    photoOrderNames.splice(to, 0, name);
    if (photoOrderMode === "existing") {
      var images = orderedExistingImages();
      var image = images.splice(from, 1)[0];
      images.splice(to, 0, image);
      images.forEach(function (item, index) { item.order = index + 1; });
      editingMedia = images.concat(editingMedia.filter(function (item) { return item.type !== "image"; }));
    } else {
      var file = processedPhotos.splice(from, 1)[0];
      processedPhotos.splice(to, 0, file);
      persistProcessedPhotoOrder().catch(function (err) { console.warn(err); });
    }
    movePhotoFields(from, to);
    renderPhotoOrder();
    refreshOrderedPhotoPreviews();
    syncPreview();
    scheduleDraftSave();
  }

  function renderPhotoOrder() {
    if (!photoOrderEl) return;
    photoOrderEl.innerHTML = "";
    photoOrderEl.hidden = photoOrderNames.length === 0;
    photoOrderNames.forEach(function (name, index) {
      var item = document.createElement("article");
      item.className = "editor-photo-order__item";
      item.dataset.photoOrderIndex = String(index);

      var handle = document.createElement("button");
      handle.className = "editor-photo-order__handle";
      handle.type = "button";
      handle.setAttribute("aria-label", "Tempti " + (index + 1) + " nuotrauką");
      handle.textContent = "⋮⋮";

      var preview = document.createElement("img");
      var previewUrl = photoUrlAt(index);
      if (previewUrl) preview.src = previewUrl;
      else preview.hidden = true;
      preview.alt = "";

      var copy = document.createElement("span");
      copy.innerHTML = "<strong>" + (index + 1) + " nuotrauka</strong><small></small>";
      copy.querySelector("small").textContent = name || ("Nuotrauka " + (index + 1));

      var controls = document.createElement("span");
      controls.className = "editor-photo-order__controls";
      controls.innerHTML =
        '<button type="button" data-photo-move="-1" aria-label="Perkelti aukštyn">↑</button>' +
        '<button type="button" data-photo-move="1" aria-label="Perkelti žemyn">↓</button>';
      controls.querySelector("[data-photo-move='-1']").disabled = index === 0;
      controls.querySelector("[data-photo-move='1']").disabled = index === photoOrderNames.length - 1;

      item.appendChild(handle);
      item.appendChild(preview);
      item.appendChild(copy);
      item.appendChild(controls);
      photoOrderEl.appendChild(item);

      handle.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        item.classList.add("is-dragging");
      });
      handle.addEventListener("pointerup", function (event) {
        var target = document.elementFromPoint(event.clientX, event.clientY);
        var targetItem = target && target.closest ? target.closest("[data-photo-order-index]") : null;
        item.classList.remove("is-dragging");
        if (!targetItem) return;
        swapPhotoOrder(index, Number(targetItem.dataset.photoOrderIndex));
      });
      handle.addEventListener("pointercancel", function () {
        item.classList.remove("is-dragging");
      });
    });
  }

  if (photoOrderEl) {
    photoOrderEl.addEventListener("click", function (event) {
      var button = event.target.closest("[data-photo-move]");
      if (!button) return;
      var item = button.closest("[data-photo-order-index]");
      var from = Number(item.dataset.photoOrderIndex);
      swapPhotoOrder(from, from + Number(button.dataset.photoMove));
    });
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
    if (restoredNames.some(Boolean) || !editId) {
      photoOrderMode = "files";
      photoOrderNames = restoredNames.filter(Boolean);
      renderPhotoFileList(restoredNames);
      renderPhotoOrder();
    }

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
      statusEl.textContent = "Atkurta paskutinė neišsaugota versija.";
      setDraftState("Atkurtas ankstesnis juodraštis", "saved");
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
    if (images.length) {
      photoOrderMode = "existing";
      photoOrderNames = images.map(function (item, index) {
        return item.caption || ("Esama nuotrauka " + (index + 1));
      });
      photoFileList.textContent = "Paliekamos " + images.length + " esamos nuotraukos. Pasirinkus naujas, jos bus pakeistos.";
      renderPhotoOrder();
    }

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
    fitName();
    wordCountEl.textContent = count + " / " + MAX_STORY_WORDS + " žodžių";
    wordCountEl.classList.toggle("is-limit", count >= MAX_STORY_WORDS);
  }

  function fitName() {
    var size = 52;
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
    photoOrderMode = "files";
    photoOrderNames = files.map(function (file) { return file.name; });
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
        putDraftFile("photo-" + index, cropped).catch(function (err) { console.warn(err); });
        scheduleDraftSave();
      });
      cropPromises.push(promise);
    });
    for (var i = files.length; i < MAX_PHOTOS; i++) {
      deleteDraftFile("photo-" + i).catch(function (err) { console.warn(err); });
    }
    renderPhotoFileList(files.map(function (file) { return file.name; }));
    renderPhotoOrder();
    statusEl.textContent = files.length ? "Nuotraukos optimizuojamos…" : "";
    await Promise.all(cropPromises);
    renderPhotoOrder();
    refreshOrderedPhotoPreviews();
    statusEl.textContent = allFiles.length > MAX_PHOTOS
      ? "Bus išsaugotos tik pirmos " + MAX_PHOTOS + " nuotraukos."
      : (files.length ? "Paruošta nuotraukų: " + files.length + ". Eiliškumą galite keisti tempdami." : "");
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

  function validateEditorStep(name) {
    var step = document.querySelector("[data-editor-step='" + name + "']");
    if (!step) return true;
    if (name === "text" && !validateDatePickers(true)) return false;
    var invalid = Array.from(step.querySelectorAll("input, textarea, select")).find(function (field) {
      return !field.checkValidity();
    });
    if (!invalid) return true;
    invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function activateEditorStep(name, scroll) {
    var index = editorSteps.indexOf(name);
    if (index < 0) return;
    currentEditorStep = name;
    var target = document.querySelector("[data-editor-step='" + name + "']");
    document.querySelectorAll("[data-editor-step]").forEach(function (step) {
      step.classList.toggle("is-active", step === target);
    });
    document.querySelectorAll("[data-editor-section]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.editorSection === name);
    });
    document.querySelectorAll("[data-editor-step-button]").forEach(function (button) {
      var active = button.dataset.editorStepButton === name;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (stepProgressEl) stepProgressEl.style.width = ((index + 1) / editorSteps.length * 100) + "%";

    if (scroll && target) {
      if (window.matchMedia("(max-width: 860px)").matches) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        var panel = document.querySelector(".editor-panel");
        if (panel) panel.scrollTo({
          top: Math.max(0, target.offsetTop - panel.offsetTop - 18),
          behavior: "smooth"
        });
      }
      target.classList.remove("editor-section-flash");
      void target.offsetWidth;
      target.classList.add("editor-section-flash");
    }
  }

  function setupEditorStepActions() {
    document.querySelectorAll("[data-editor-step]").forEach(function (step) {
      if (step.dataset.editorActionsReady === "true") return;
      step.dataset.editorActionsReady = "true";
      var index = editorSteps.indexOf(step.dataset.editorStep);
      var actions = document.createElement("div");
      actions.className = "editor-step-actions";
      if (index > 0) {
        var previous = document.createElement("button");
        previous.className = "button button--ghost";
        previous.type = "button";
        previous.textContent = "Atgal";
        previous.addEventListener("click", function () {
          activateEditorStep(editorSteps[index - 1], true);
        });
        var finalActions = step.querySelector(".editor-final-actions");
        if (index === editorSteps.length - 1 && finalActions) {
          previous.classList.add("editor-final-back");
          finalActions.insertBefore(previous, finalActions.firstChild);
        } else {
          actions.appendChild(previous);
        }
      }
      if (index < editorSteps.length - 1) {
        var next = document.createElement("button");
        next.className = "button";
        next.type = "button";
        next.textContent = "Išsaugoti ir tęsti";
        next.addEventListener("click", function () {
          if (!validateEditorStep(step.dataset.editorStep)) return;
          saveDraftNow();
          activateEditorStep(editorSteps[index + 1], true);
        });
        actions.appendChild(next);
      }
      if (actions.childElementCount) step.appendChild(actions);
    });
  }

  function setupPreviewDialog() {
    var close = document.querySelector("[data-editor-preview-close]");
    function openPreview() {
      document.body.classList.add("editor-preview-open");
      if (close) close.focus();
      refreshProportionalHeights();
    }
    function closePreview() {
      document.body.classList.remove("editor-preview-open");
    }
    document.querySelectorAll("[data-editor-preview-open]").forEach(function (button) {
      button.addEventListener("click", openPreview);
    });
    if (close) close.addEventListener("click", closePreview);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("editor-preview-open")) closePreview();
    });
  }

  function setupEditorSectionButtons() {
    document.querySelectorAll("[data-editor-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        activateEditorStep(button.dataset.editorSection, true);
      });
    });
    document.querySelectorAll("[data-editor-step-button]").forEach(function (button) {
      button.addEventListener("click", function () {
        activateEditorStep(button.dataset.editorStepButton, true);
      });
    });
    setupEditorStepActions();
    setupPreviewDialog();
    activateEditorStep(currentEditorStep, false);
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
    var layout = {
      __stage: { background: backgroundInput ? backgroundInput.value : "#ffffff" }
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
        statusEl.textContent = "Nepavyko išvalyti juodraščio.";
      });
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!validateDatePickers(false)) {
      activateEditorStep("text", true);
      window.setTimeout(function () {
        validateDatePickers(true);
      }, 0);
      return;
    }
    var invalid = Array.from(form.querySelectorAll("input, textarea, select")).find(function (field) {
      return !field.checkValidity();
    });
    if (invalid) {
      var invalidStep = invalid.closest("[data-editor-step]");
      if (invalidStep) activateEditorStep(invalidStep.dataset.editorStep, true);
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    var submit = form.querySelector("button[type='submit']");
    var data = formData();
    showSaveProgress(10, "Ruošiamos nuotraukos…");
    submit.disabled = true;
    resultBox.hidden = true;
    await Promise.all(cropPromises);
    var photos = processedPhotos.filter(Boolean).slice(0, MAX_PHOTOS);
    var video = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;

    data.tekstas_200 = limitWords(data.tekstas_200 || "", MAX_STORY_WORDS);
    data.apmoketa = false;
    data.product_type = productType;

    showSaveProgress(28, "Įkeliami failai ir saugomas puslapis…");
    submit.disabled = true;
    resultBox.hidden = true;

    try {
      var captions = captionsInput && captionsInput.files ? captionsInput.files[0] : null;
      function onUploadProgress(done, total) {
        var fraction = total ? done / total : 1;
        showSaveProgress(28 + fraction * 58, total ? "Įkeliami failai: " + done + " iš " + total + "…" : "Saugomas puslapis…");
      }
      var result = editId
        ? await AtminimasApi.updateAtminimas(editId, data, {
            existingMedia: editingMedia,
            files: { photos: photos, video: video, captions: captions },
            layout: collectLayout(),
            onProgress: onUploadProgress
          })
        : await AtminimasApi.createAtminimas(data, {
            files: { photos: photos, video: video, captions: captions },
            layout: collectLayout(),
            onProgress: onUploadProgress
          });
      showSaveProgress(94, "Baigiamas išsaugojimas…");
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
        showSaveProgress(100, "Pakeitimai išsaugoti.");
        setDraftState("Visi pakeitimai išsaugoti", "saved");
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
      showSaveProgress(100, "Puslapis ir užsakymas sukurti.");
      setDraftState("Puslapis išsaugotas", "saved");
    } catch (err) {
      console.error(err);
      statusEl.textContent = err.message || "Nepavyko išsaugoti. Patikrink failų dydį, tipą arba DB teises.";
      if (saveProgressEl) saveProgressEl.value = 0;
      setDraftState("Išsaugoti nepavyko", "error");
    } finally {
      submit.disabled = false;
      window.setTimeout(hideSaveProgress, 1800);
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
    setupDatePickers();
    await loadProfileForEditing();
    syncDatePickersFromHidden();
    await restoreDraft();
    syncDatePickersFromHidden();
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


