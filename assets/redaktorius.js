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
  var photoSlots = [
    document.getElementById("editor-preview-photo-1"),
    document.getElementById("editor-preview-photo-2"),
    document.getElementById("editor-preview-photo-3"),
    document.getElementById("editor-preview-photo-4")
  ];
  var transformMode = "resize";
  var selectedPiece = null;
  var processedPhotos = [];
  var cropPromises = [];
  var savedVideoFile = null;
  var isRestoringDraft = false;
  var draftSaveTimer = null;
  var DRAFT_KEY = "atminimas.editor.draft.v1";
  var DRAFT_DB = "atminimas-editor-draft";
  var DRAFT_STORE = "files";
  var PRODUCT_KEY = "atminimas.selected-product.v1";
  var productSummary = document.getElementById("editor-product-summary");

  function selectedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(PRODUCT_KEY);
    var value = requested === "asa" || requested === "metal" ? requested : stored;
    value = value === "asa" ? "asa" : "metal";
    sessionStorage.setItem(PRODUCT_KEY, value);
    return value;
  }

  var productType = selectedProduct();
  if (productSummary) productSummary.textContent = "Pasirinktas produktas: " + (productType === "asa" ? "ASA 3D ženkliukas" : "metalo ženkliukas") + ". Kaina kol kas –.";

  function words(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function limitWords(value, max) {
    var list = words(value);
    return list.length > max ? list.slice(0, max).join(" ") : value;
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

  async function putDraftFile(key, file) {
    if (!file) return;
    var db = await openDraftDb();
    if (!db) return;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      tx.objectStore(DRAFT_STORE).put({
        key: key,
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
      tx.objectStore(DRAFT_STORE).delete(key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function getDraftFile(key) {
    var db = await openDraftDb();
    if (!db) return null;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readonly");
      var request = tx.objectStore(DRAFT_STORE).get(key);
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
      tx.objectStore(DRAFT_STORE).clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    await clearDraftFiles();
    window.location.reload();
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
    return {
      vardas: form.elements.vardas.value || "",
      pavarde: form.elements.pavarde.value || "",
      gimimo_data: form.elements.gimimo_data.value || "",
      mirties_data: form.elements.mirties_data.value || "",
      epitafija: form.elements.epitafija.value || "",
      tekstas_200: form.elements.tekstas_200.value || "",
      fono_spalva: form.elements.fono_spalva.value || "#ffffff"
    };
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

  async function restoreDraftMedia() {
    for (var i = 0; i < 4; i++) {
      var photo = await getDraftFile("photo-" + i);
      if (!photo) continue;
      processedPhotos[i] = photo;
      var slot = photoSlots[i];
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      slot.src = URL.createObjectURL(photo);
      slot.hidden = false;
      if (empty) empty.hidden = true;
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
      statusEl.textContent = "Atkurta paskutine neissaugota versija.";
    } catch (err) {
      console.warn("Draft restore failed", err);
    } finally {
      isRestoringDraft = false;
    }
  }

  function syncPreview() {
    var data = formData();
    var text = limitWords(data.tekstas_200 || "", 200);
    if (text !== data.tekstas_200) form.elements.tekstas_200.value = text;
    var count = words(text).length;
    var fullName = [data.vardas, data.pavarde].filter(Boolean).join(" ").trim();
    var dates = [data.gimimo_data, data.mirties_data].filter(Boolean).join(" - ");

    previewName.textContent = fullName || "Vardas Pavardė";
    previewDates.textContent = dates || "Gimimo data - Mirties data";
    previewText.textContent = data.epitafija || "Trumpa epitafija atsiras čia.";
    previewLongText.textContent = text || "Ilgesnis tekstas atsiras čia.";
    var background = data.fono_spalva || "#ffffff";
    stage.style.backgroundColor = background;
    if (backgroundValue) backgroundValue.textContent = background;
    fitName();
    wordCountEl.textContent = count + " / 200 žodžių";
    wordCountEl.classList.toggle("is-limit", count >= 200);
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
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
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
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

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

    if (maxX <= minX || maxY <= minY) return file;
    var cropW = maxX - minX + 1;
    var cropH = maxY - minY + 1;
    var removed = 1 - (cropW * cropH) / (canvas.width * canvas.height);
    if (removed < 0.03) return file;

    var out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    out.getContext("2d").drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    return new Promise(function (resolve) {
      out.toBlob(function (blob) {
        if (!blob) return resolve(file);
        var name = file.name.replace(/\.[^.]+$/, "") + "-autocrop.jpg";
        resolve(new File([blob], name, { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
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
    var files = Array.prototype.slice.call(photosInput.files || []).slice(0, 4);
    processedPhotos = [];
    cropPromises = [];
    photoSlots.forEach(function (slot, index) {
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      var file = files[index];
      if (!file) {
        slot.hidden = true;
        slot.removeAttribute("src");
        if (empty) empty.hidden = false;
        deleteDraftFile("photo-" + index).catch(function (err) { console.warn(err); });
        return;
      }
      var promise = autoCropBlackBorders(file).then(function (cropped) {
        processedPhotos[index] = cropped;
        slot.src = URL.createObjectURL(cropped);
        slot.hidden = false;
        slot.onload = function () { setFrameToImageRatio(slot, slot); };
        if (empty) empty.hidden = true;
        putDraftFile("photo-" + index, cropped).catch(function (err) { console.warn(err); });
        scheduleDraftSave();
      });
      cropPromises.push(promise);
    });
    for (var i = files.length; i < 4; i++) {
      deleteDraftFile("photo-" + i).catch(function (err) { console.warn(err); });
    }
    if ((photosInput.files || []).length > 4) {
      statusEl.textContent = "Bus išsaugotos tik pirmos 4 nuotraukos.";
    }
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
        if (panel) {
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
  if (backgroundInput) {
    backgroundInput.addEventListener("input", function () {
      stage.style.backgroundColor = backgroundInput.value;
      if (backgroundValue) backgroundValue.textContent = backgroundInput.value;
    });
  }
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
    var photos = processedPhotos.filter(Boolean).slice(0, 4);
    var video = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;

    data.tekstas_200 = limitWords(data.tekstas_200 || "", 200);
    data.apmoketa = false;
    data.product_type = productType;

    statusEl.textContent = "Įkeliami failai ir saugoma į DB...";
    submit.disabled = true;
    resultBox.hidden = true;

    try {
      var captions = captionsInput && captionsInput.files ? captionsInput.files[0] : null;
      var result = await AtminimasApi.createAtminimas(data, {
        files: { photos: photos, video: video, captions: captions },
        layout: collectLayout()
      });
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
      statusEl.textContent = "Nepavyko išsaugoti. Patikrink failų dydį, tipą arba DB teises.";
    } finally {
      submit.disabled = false;
    }
  });

  async function initEditor() {
    if (window.AtminimasAuth && !AtminimasAuth.accessToken()) {
      statusEl.textContent = "Prisijunkite kliento zonoje, tada grįžkite kurti puslapio.";
      form.querySelector("button[type='submit']").disabled = true;
      setTimeout(function () {
        window.location.href = "prisijungti.html?next=" + encodeURIComponent("redaktorius.html?product=" + productType);
      }, 900);
      return;
    }
    await restoreDraft();
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


