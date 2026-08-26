(function () {
  var form = document.getElementById("editor-form");
  var statusEl = document.getElementById("editor-status");
  var wordCountEl = document.getElementById("editor-word-count");
  var previewCode = document.getElementById("editor-preview-code");
  var previewName = document.getElementById("editor-preview-name");
  var previewDates = document.getElementById("editor-preview-dates");
  var previewText = document.getElementById("editor-preview-epitaph");
  var previewLongText = document.getElementById("editor-preview-story") || document.getElementById("editor-preview-text");
  var photosInput = document.getElementById("editor-photos");
  var videoInput = document.getElementById("editor-video");
  var captionsInput = document.getElementById("editor-captions");
  var previewVideo = document.getElementById("editor-preview-video");
  var resultBox = document.getElementById("editor-result");
  var openLink = document.getElementById("editor-open-link");
  var preorderLink = document.getElementById("editor-preorder-link");
  var clientLink = document.getElementById("editor-client-link");
  var qrLink = document.getElementById("editor-qr-link");
  var orderCode = document.getElementById("editor-order-code");
  var stage = document.getElementById("editor-preview-stage");
  var clearDraftButton = document.getElementById("editor-clear-draft");
  var submitButton = form.querySelector("button[type='submit']");
  var draftStateEl = document.getElementById("editor-draft-state");
  var accountNoteEl = document.getElementById("editor-account-note");
  var stepProgressEl = document.getElementById("editor-step-progress");
  var stepProgressTrackEl = stepProgressEl ? stepProgressEl.parentElement : null;
  var stepStatusEl = document.getElementById("editor-step-status");
  var saveProgressEl = document.getElementById("editor-save-progress");
  var photoOrderEl = document.getElementById("editor-photo-order");
  var photoDetailsEl = document.getElementById("editor-photo-details");
  var storyBlocksEl = document.getElementById("editor-story-blocks");
  var storyOrderStatusEl = document.getElementById("editor-story-order-status");
  var undoButton = document.getElementById("editor-undo");
  var redoButton = document.getElementById("editor-redo");
  var completionCountEl = document.getElementById("editor-completion-count");
  var addStoryTextButton = document.querySelector("[data-story-add='text']");
  var addStoryPhotoButton = document.querySelector("[data-story-add='photo']");
  var advancedLayoutToggle = document.querySelector("[data-advanced-layout-toggle]");
  var advancedLayoutEl = document.getElementById("editor-advanced-layout");
  var storyPhotoTools = document.getElementById("editor-story-photo-tools");
  var storyPhotoToolsTitle = document.getElementById("editor-story-photo-tools-title");
  var storyPhotoSizeInput = document.getElementById("editor-story-photo-size");
  var storyPhotoSizeValue = document.getElementById("editor-story-photo-size-value");
  var storyPhotoOnlyControls = storyPhotoTools
    ? storyPhotoTools.querySelector("[data-story-photo-only]")
    : null;
  var prototypeNotice = document.getElementById("editor-prototype-notice");
  var editorCanvas = document.querySelector(".editor-canvas");
  var previewSurface = document.getElementById("editor-preview-surface");
  var openPreviewDialog = null;
  var productImage = document.getElementById("editor-product-image");
  var productCard = productImage ? productImage.closest(".editor-product-card") : null;
  var backgroundInput = document.getElementById("editor-background");
  var backgroundValue = document.getElementById("editor-background-value");
  var colorCurrent = document.getElementById("editor-color-current");
  var photoFileList = document.getElementById("editor-photo-file-list");
  var datePickers = Array.from(document.querySelectorAll("[data-date-picker]"));
  var MAX_PHOTOS = 8;
  var MAX_STORY_BLOCKS = 40;
  var MAX_VIDEO_BYTES = 50 * 1024 * 1024;
  var MAX_STORY_WORDS = 1000;
  var MAX_STORY_CHARS = 10000;
  var MIN_STORY_PHOTO_WIDTH = 35;
  var MAX_STORY_PHOTO_WIDTH = 100;
  var MIN_STORY_TEXT_SCALE = 70;
  var MAX_STORY_TEXT_SCALE = 160;
  var DATE_MIN_YEAR = 1800;
  var LEGACY_STAGE_HEIGHT_PCT = 355;
  var MIN_STAGE_HEIGHT_PCT = 160;
  var MIN_STORY_HEADER_HEIGHT_PCT = 42;
  var STAGE_BOTTOM_GAP_PCT = 12;
  var MAX_STAGE_HEIGHT_PCT = 1200;
  var MAX_PIECE_HEIGHT_PCT = 180;
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
  var photoSyncPromise = Promise.resolve();
  var photoProcessingGeneration = 0;
  var photosProcessing = false;
  var photoPreparationFailed = false;
  var photoDraftPersistenceFailed = false;
  var auxiliaryMediaPersistencePromise = Promise.resolve();
  var auxiliaryMediaPersistencePending = 0;
  var auxiliaryMediaPersistenceVersion = { video: 0, captions: 0 };
  var auxiliaryMediaPersistenceFailed = { video: false, captions: false };
  var savedVideoFile = null;
  var savedCaptionsFile = null;
  var editingMedia = [];
  var isRestoringDraft = false;
  var draftSaveTimer = null;
  var stageFitFrame = null;
  var stageFitMayShrink = false;
  var editorParams = new URLSearchParams(window.location.search);
  var editId = (editorParams.get("edit") || "").trim();
  var resumeSave = editorParams.get("resume") === "save";
  var prototypeRequested = editorParams.get("prototype") === "1";
  var isAdminPrototype = false;
  var DRAFT_KEY = editId
    ? "atminimas.editor.edit." + editId + ".v1"
    : "atminimas.editor.draft.v1";
  var DRAFT_FILE_PREFIX = editId
    ? "edit-" + editId + "-"
    : "create-";
  var DRAFT_DB = "atminimas-editor-draft";
  var DRAFT_STORE = "files";
  var DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var draftSavedAtMs = 0;
  var PRODUCT_KEY = "atminimas.selected-product.v1";
  var productSummary = document.getElementById("editor-product-summary");
  var productUnavailable = document.getElementById("editor-product-unavailable");
  var productUnavailableMessage = document.getElementById("editor-product-unavailable-message");
  var editorSteps = ["text", "colors", "preview"];
  var editorStepLabels = {
    text: "Turinys",
    colors: "Dizainas",
    preview: "Peržiūra"
  };
  var currentEditorStep = "text";
  var editorStepHistoryReady = false;
  var EDITOR_STEP_HISTORY_KEY = "atminimasEditorStep";
  var EDITOR_STEP_HISTORY_DEPTH_KEY = "atminimasEditorStepDepth";
  var photoOrderNames = [];
  var photoOrderMode = "files";
  var photoPreviewUrls = new WeakMap();
  var storyBlocks = [];
  var storyBlocksLoaded = false;
  var storyEmptyMode = false;
  var selectedStoryPhotoIndex = -1;
  var undoHistory = [];
  var redoHistory = [];
  var historySaveTimer = null;
  var historyRestoring = false;
  var historyReady = false;
  var lastHistoryJson = "";
  var productOptions = {
    metal: {
      image: "assets/qr-plienas-480.webp",
      alt: "Pasirinkta plieno QR atminimo lentelė",
      name: "graviruota plieno QR atminimo lentelė",
      priceNote: ". Kaina – 59,00 EUR."
    },
    asa: {
      image: "assets/qr-asa-480.webp",
      alt: "Pasirinkta ASA QR atminimo lentelė",
      name: "ASA 3D spausdinta QR atminimo lentelė",
      priceNote: "."
    },
    digital: {
      image: "",
      alt: "",
      name: "skaitmeninis atminimo puslapis be fizinio gaminio",
      priceNote: "."
    }
  };

  function requestedProduct() {
    var requested = (new URLSearchParams(window.location.search).get("product") || "").trim();
    var stored = sessionStorage.getItem(PRODUCT_KEY);
    var value = requested || stored || "metal";
    if (value === "digital") return "digital";
    return window.AtminimasProductCatalog
      ? AtminimasProductCatalog.normalizeType(value)
      : (value === "asa" ? "asa" : "metal");
  }

  var requestedProductType = requestedProduct();
  var productType = "metal";

  function setVideoSlotVisible(visible) {
    var wrap = previewVideo ? previewVideo.closest(".editor-video-slot") : null;
    if (wrap) wrap.hidden = !visible;
  }

  function applySelectedProduct(type) {
    productType = productOptions[type] ? type : "metal";
    var selectedProductOption = productOptions[productType];
    var digitalOnly = productType === "digital";
    sessionStorage.setItem(PRODUCT_KEY, productType);
    if (productImage) {
      productImage.hidden = digitalOnly;
      if (!digitalOnly) {
        productImage.src = selectedProductOption.image;
        productImage.alt = selectedProductOption.alt;
      }
    }
    if (productCard) productCard.classList.toggle("editor-product-card--digital", digitalOnly);
    if (productSummary) {
      productSummary.textContent = editId
          ? "Redaguojamas jūsų atminimo puslapis."
          : (digitalOnly
            ? "Kuriamas tik skaitmeninis atminimo puslapis. Fizinis gaminys, PREORDER ir pristatymas nebus kuriami."
            : "Pasirinktas produktas: " + selectedProductOption.name + selectedProductOption.priceNote);
    }
    if (accountNoteEl && digitalOnly && !editId) {
      accountNoteEl.textContent = "Kurti galite neprisijungę. Juodraštis šiame įrenginyje saugomas 7 dienas; prisijungti reikės tik puslapiui išsaugoti. Paskelbę puslapį kliento zonoje atsisiųsite QR kodą.";
    }
  }

  applySelectedProduct(requestedProductType);
  function setProductUnavailable(message) {
    if (productSummary) productSummary.textContent = "Orientacinės kainos patikrinti nepavyko. Puslapį galite išsaugoti, o išankstinį užsakymą pateikti be mokėjimo.";
    if (productUnavailableMessage) productUnavailableMessage.textContent = message;
    if (productUnavailable) productUnavailable.hidden = false;
  }

  if (!editId && !prototypeRequested && requestedProductType !== "digital" && window.AtminimasProductCatalog) {
    if (productSummary) productSummary.textContent = "Tikrinamas pasirinkto produkto prieinamumas…";
    AtminimasProductCatalog.load().then(function (catalog) {
      var metalAvailable = !!(catalog.remote && catalog.metal && catalog.metal.available && catalog.metal.price_cents != null);
      var asaAvailable = !!(catalog.remote && catalog.asa && catalog.asa.available && catalog.asa.price_cents != null);
      if (metalAvailable) {
        productOptions.metal.priceNote = ". Kaina – " + AtminimasProductCatalog.formatPrice(catalog.metal.price_cents, catalog.metal.currency) + ".";
      }
      if (asaAvailable) {
        productOptions.asa.priceNote = ". Kaina – " + AtminimasProductCatalog.formatPrice(catalog.asa.price_cents, catalog.asa.currency) + ".";
      }
      var selectedType = requestedProductType === "asa" ? "asa" : "metal";
      applySelectedProduct(selectedType);
      if (!catalog.remote) {
        setProductUnavailable(catalog.error || "Kainos patikrinti nepavyko. Išankstinį užsakymą vis tiek galėsite pateikti be mokėjimo.");
      } else if (productUnavailable) productUnavailable.hidden = true;
    }).catch(function () {
      setProductUnavailable("Nepavyko patikrinti produkto kainos ir prieinamumo. Patikrinkite interneto ryšį ir bandykite dar kartą.");
    });
  } else if (!editId && !prototypeRequested && requestedProductType !== "digital") {
    setProductUnavailable("Nepavyko paleisti produkto patikros. Atnaujinkite puslapį arba grįžkite į parduotuvę.");
  }

  function isSignedIn() {
    return !!(window.AtminimasAuth && AtminimasAuth.accessToken());
  }

  function editorSaveReturnUrl() {
    if (prototypeRequested) return "redaktorius.html?prototype=1";
    return "redaktorius.html?product=" + encodeURIComponent(productType) + "&resume=save";
  }

  function editorLoginUrl() {
    return "prisijungti.html?next=" + encodeURIComponent(editorSaveReturnUrl());
  }

  function redirectToLoginForSave() {
    window.location.assign(editorLoginUrl());
  }

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

  function normalizeHex(value) {
    var hex = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split("").map(function (part) { return part + part; }).join("");
    return /^[0-9a-f]{6}$/i.test(hex) ? "#" + hex.toLowerCase() : "#ffffff";
  }

  function syncColorSelection(value) {
    var selected = normalizeHex(value);
    document.querySelectorAll("[data-background-color]").forEach(function (button) {
      var active = normalizeHex(button.dataset.backgroundColor) === selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setBackgroundColor(value, persist) {
    var hex = normalizeHex(value);
    if (backgroundInput) backgroundInput.value = hex;
    if (backgroundValue) backgroundValue.textContent = hex;
    if (colorCurrent) colorCurrent.style.backgroundColor = hex;
    stage.style.backgroundColor = hex;
    if (previewSurface) previewSurface.style.backgroundColor = hex;
    syncColorSelection(hex);
    updateCompletionChecklist();
    if (persist) scheduleDraftSave();
  }

  function setupColorPicker() {
    if (!backgroundInput) return;
    document.querySelectorAll("[data-background-color]").forEach(function (button) {
      button.style.setProperty("--swatch-color", normalizeHex(button.dataset.backgroundColor));
      button.addEventListener("click", function () {
        setBackgroundColor(button.dataset.backgroundColor, true);
      });
    });
    setBackgroundColor(backgroundInput.value, false);
  }

  function words(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function limitWords(value, max) {
    var list = words(value);
    return list.length > max ? list.slice(0, max).join(" ") : value;
  }

  function normalizeStoryPhotoAlign(value) {
    return value === "left" || value === "right" ? value : "full";
  }

  function defaultStoryPhotoWidth(align) {
    return normalizeStoryPhotoAlign(align) === "full" ? 100 : 42;
  }

  function normalizeStoryPhotoWidth(value, align) {
    var number = Number(value);
    if (!Number.isFinite(number)) return defaultStoryPhotoWidth(align);
    return Math.round(Math.max(MIN_STORY_PHOTO_WIDTH, Math.min(MAX_STORY_PHOTO_WIDTH, number)));
  }

  function normalizeStoryPhotoFit(value) {
    return value === "cover" ? "cover" : "contain";
  }

  function normalizeStoryTextScale(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 100;
    return Math.round(Math.max(MIN_STORY_TEXT_SCALE, Math.min(MAX_STORY_TEXT_SCALE, number)));
  }

  function storyPhotoAppearance(block) {
    var align = normalizeStoryPhotoAlign(block && block.align);
    return {
      widthPct: normalizeStoryPhotoWidth(block && block.widthPct, align),
      fit: normalizeStoryPhotoFit(block && block.fit)
    };
  }

  function normalizeStoryOffset(value, minimum, maximum) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(Math.max(minimum, Math.min(maximum, number)) * 1000) / 1000;
  }

  function storyBlockPosition(block) {
    return {
      offsetX: normalizeStoryOffset(block && block.offsetX, -70, 70),
      offsetY: normalizeStoryOffset(block && block.offsetY, -320, 320)
    };
  }

  function normalizeStoryBlocks(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_STORY_BLOCKS).reduce(function (result, item) {
      if (!item || typeof item !== "object") return result;
      if (item.type === "text") {
        var textPosition = storyBlockPosition(item);
        result.push({
          type: "text",
          text: String(item.text || "").slice(0, 10000),
          fontScale: normalizeStoryTextScale(item.fontScale),
          offsetX: textPosition.offsetX,
          offsetY: textPosition.offsetY
        });
        return result;
      }
      if (item.type === "photo") {
        var photoOrder = Number(item.photoOrder);
        var photoPosition = storyBlockPosition(item);
        var photoAppearance = storyPhotoAppearance(item);
        result.push({
          type: "photo",
          photoOrder: Number.isInteger(photoOrder) && photoOrder >= 1 && photoOrder <= MAX_PHOTOS
            ? photoOrder
            : null,
          align: normalizeStoryPhotoAlign(item.align),
          widthPct: photoAppearance.widthPct,
          fit: photoAppearance.fit,
          offsetX: photoPosition.offsetX,
          offsetY: photoPosition.offsetY
        });
      }
      return result;
    }, []);
  }

  function collectStoryBlocks(includeEmpty) {
    return storyBlocks.slice(0, MAX_STORY_BLOCKS).reduce(function (result, block) {
      if (block.type === "text") {
        var text = String(block.text || "").slice(0, 10000);
        var textPosition = storyBlockPosition(block);
        if (includeEmpty || text.trim()) {
          result.push({
            type: "text",
            text: text,
            fontScale: normalizeStoryTextScale(block.fontScale),
            offsetX: textPosition.offsetX,
            offsetY: textPosition.offsetY
          });
        }
      } else if (block.type === "photo") {
        var photoOrder = Number(block.photoOrder);
        var align = normalizeStoryPhotoAlign(block.align);
        var photoPosition = storyBlockPosition(block);
        var photoAppearance = storyPhotoAppearance(block);
        if (Number.isInteger(photoOrder) && photoOrder >= 1 && photoOrder <= MAX_PHOTOS) {
          result.push({
            type: "photo",
            photoOrder: photoOrder,
            align: align,
            widthPct: photoAppearance.widthPct,
            fit: photoAppearance.fit,
            offsetX: photoPosition.offsetX,
            offsetY: photoPosition.offsetY
          });
        } else if (includeEmpty) {
          result.push({
            type: "photo",
            photoOrder: null,
            align: align,
            widthPct: photoAppearance.widthPct,
            fit: photoAppearance.fit,
            offsetX: photoPosition.offsetX,
            offsetY: photoPosition.offsetY
          });
        }
      }
      return result;
    }, []);
  }

  function ensurePersistableStoryMode() {
    var hasPersistableBlock = storyBlocks.some(function (block) {
      if (block.type === "text") return true;
      var photoOrder = Number(block.photoOrder);
      return block.type === "photo" && Number.isInteger(photoOrder) &&
        photoOrder >= 1 && photoOrder <= MAX_PHOTOS;
    });
    if (!hasPersistableBlock) {
      storyBlocks = [{ type: "text", text: "", fontScale: 100, offsetX: 0, offsetY: 0 }];
      storyEmptyMode = true;
    }
  }

  function storyTextValue() {
    return storyBlocks
      .filter(function (block) { return block.type === "text"; })
      .map(function (block) { return String(block.text || "").trim(); })
      .filter(Boolean)
      .join("\n\n");
  }

  function syncLegacyStoryText() {
    var field = form.elements.tekstas_200;
    var value = storyTextValue();
    if (field) field.value = value;
    return value;
  }

  function limitStoryBlocksToWords() {
    var remainingWords = MAX_STORY_WORDS;
    var remainingChars = MAX_STORY_CHARS;
    var hasNonEmptyText = false;
    storyBlocks.forEach(function (block) {
      if (block.type !== "text") return;
      var value = String(block.text || "");
      var blockWords = words(value);
      if (blockWords.length > remainingWords) {
        value = remainingWords > 0 ? blockWords.slice(0, remainingWords).join(" ") : "";
        block.text = value;
      }
      remainingWords = Math.max(0, remainingWords - Math.min(blockWords.length, remainingWords));

      var trimmed = value.trim();
      var separatorLength = trimmed && hasNonEmptyText ? 2 : 0;
      var available = Math.max(0, remainingChars - separatorLength);
      if (trimmed.length > available) {
        block.text = trimmed.slice(0, available).replace(/\s+$/, "");
        trimmed = block.text;
      }
      if (trimmed) {
        remainingChars = Math.max(0, remainingChars - separatorLength - trimmed.length);
        hasNonEmptyText = true;
      }
    });
  }

  function setStoryBlocks(value, acceptEmpty, explicitEmptyMode) {
    var normalized = normalizeStoryBlocks(value);
    if (!normalized.length && !acceptEmpty) return false;
    if (!normalized.length) normalized = [{ type: "text", text: "", fontScale: 100, offsetX: 0, offsetY: 0 }];
    storyBlocks = normalized;
    storyBlocksLoaded = true;
    storyEmptyMode = typeof explicitEmptyMode === "boolean"
      ? explicitEmptyMode
      : normalized.length === 1 &&
        normalized[0].type === "text" &&
        !String(normalized[0].text || "").trim();
    limitStoryBlocksToWords();
    return true;
  }

  function storyPhotoCount() {
    return Math.min(MAX_PHOTOS, photoOrderNames.filter(Boolean).length);
  }

  function storyPhotoName(photoOrder) {
    var index = Number(photoOrder) - 1;
    return index >= 0 && photoOrderNames[index]
      ? photoOrderNames[index]
      : ("Nuotrauka " + photoOrder);
  }

  function storyPhotoCaption(photoOrder) {
    var field = form.elements["photo_caption_" + photoOrder];
    return field ? String(field.value || "").trim() : "";
  }

  function storyPhotoAlt(photoOrder) {
    var field = form.elements["photo_alt_" + photoOrder];
    return field ? String(field.value || "").trim() : "";
  }

  function reconcileStoryPhotoBlocks(count, appendMissing, appendFromOrder) {
    if (!storyBlocksLoaded) return;
    var safeCount = Math.max(0, Math.min(MAX_PHOTOS, Number(count) || 0));
    var used = new Set();
    storyBlocks.forEach(function (block) {
      if (block.type !== "photo") return;
      var photoOrder = Number(block.photoOrder);
      if (!Number.isInteger(photoOrder) || photoOrder < 1 || photoOrder > safeCount || used.has(photoOrder)) {
        block.photoOrder = null;
        return;
      }
      used.add(photoOrder);
    });
    ensurePersistableStoryMode();
    if (!appendMissing) return;
    var firstAppendOrder = Math.max(1, Number(appendFromOrder) || 1);
    if (storyEmptyMode && firstAppendOrder <= safeCount) {
      storyBlocks = [];
      storyEmptyMode = false;
    }
    for (var photoOrder = firstAppendOrder; photoOrder <= safeCount; photoOrder++) {
      if (used.has(photoOrder)) continue;
      var emptyBlock = storyBlocks.find(function (block) {
        return block.type === "photo" && !block.photoOrder;
      });
      if (emptyBlock) {
        emptyBlock.photoOrder = photoOrder;
      } else if (storyBlocks.length < MAX_STORY_BLOCKS) {
        storyBlocks.push({
          type: "photo",
          photoOrder: photoOrder,
          align: "full",
          widthPct: 100,
          fit: "contain",
          offsetX: 0,
          offsetY: 0
        });
      }
      used.add(photoOrder);
    }
  }

  function ensureStoryBlocks(includePhotos) {
    if (!storyBlocksLoaded) {
      storyBlocks = [{
        type: "text",
        text: form.elements.tekstas_200 ? String(form.elements.tekstas_200.value || "") : "",
        fontScale: 100,
        offsetX: 0,
        offsetY: 0
      }];
      storyBlocksLoaded = true;
      storyEmptyMode = false;
      limitStoryBlocksToWords();
      if (includePhotos) reconcileStoryPhotoBlocks(storyPhotoCount(), true);
    }
    syncLegacyStoryText();
  }

  function firstUnusedStoryPhotoOrder() {
    var used = new Set(storyBlocks.filter(function (block) {
      return block.type === "photo" && block.photoOrder;
    }).map(function (block) {
      return Number(block.photoOrder);
    }));
    for (var photoOrder = 1; photoOrder <= storyPhotoCount(); photoOrder++) {
      if (!used.has(photoOrder)) return photoOrder;
    }
    return null;
  }

  function updateStoryWordCount() {
    var value = storyTextValue();
    var count = words(value).length;
    wordCountEl.textContent = count + " / " + MAX_STORY_WORDS + " žodžių · " +
      value.length + " / " + MAX_STORY_CHARS + " ženklų";
    wordCountEl.classList.toggle(
      "is-limit",
      count >= MAX_STORY_WORDS || value.length >= MAX_STORY_CHARS
    );
  }

  function syncStoryTextEditors() {
    if (!storyBlocksEl) return;
    storyBlocksEl.querySelectorAll("[data-story-block-index]").forEach(function (card) {
      var field = card.querySelector("[data-story-text]");
      var block = storyBlocks[Number(card.dataset.storyBlockIndex)];
      if (field && block && block.type === "text" && field.value !== block.text) {
        field.value = block.text;
      }
    });
  }

  function storyPhotoPreviewElement(index) {
    if (!previewLongText || !Number.isInteger(index)) return null;
    return previewLongText.querySelector(
      "[data-story-preview-index='" + index + "']"
    );
  }

  function applyStoryPhotoAppearance(element, block) {
    if (!element || !block) return;
    var appearance = storyPhotoAppearance(block);
    block.widthPct = appearance.widthPct;
    block.fit = appearance.fit;
    element.style.setProperty("--story-photo-width", appearance.widthPct + "%");
    element.classList.toggle(
      "editor-preview-story__photo--fit-cover",
      appearance.fit === "cover"
    );
    element.classList.toggle(
      "memorial-story-block--photo-fit-cover",
      appearance.fit === "cover"
    );
    element.classList.toggle(
      "editor-preview-story__photo--fit-contain",
      appearance.fit === "contain"
    );
    element.classList.toggle(
      "memorial-story-block--photo-fit-contain",
      appearance.fit === "contain"
    );
  }

  function applyStoryTextAppearance(element, block) {
    if (!element || !block || block.type !== "text") return;
    block.fontScale = normalizeStoryTextScale(block.fontScale);
    element.style.setProperty("--story-text-scale", block.fontScale / 100);
  }

  function syncStoryPhotoInteractivity() {
    if (!previewLongText) return;
    var enabled = !stage.classList.contains("is-simple-layout");
    previewLongText.querySelectorAll("[data-story-item-select]").forEach(function (control) {
      if (control.matches("[contenteditable='true']")) {
        control.tabIndex = 0;
        control.removeAttribute("aria-disabled");
        return;
      }
      if ("disabled" in control) {
        control.disabled = !enabled;
      } else {
        control.tabIndex = enabled ? 0 : -1;
        control.setAttribute("aria-disabled", String(!enabled));
      }
    });
    previewLongText.querySelectorAll("[data-story-resize-handle]").forEach(function (handle) {
      handle.disabled = !enabled;
    });
  }

  function selectedStoryPhotoBlock() {
    var block = storyBlocks[selectedStoryPhotoIndex];
    if (!block || (block.type !== "text" && block.type !== "photo")) return null;
    return block.type === "photo" && !block.photoOrder ? null : block;
  }

  function positionStoryPhotoTools(element) {
    if (!storyPhotoTools || storyPhotoTools.hidden || !element || !editorCanvas) return;
    var hostRect = editorCanvas.getBoundingClientRect();
    var elementRect = element.getBoundingClientRect();
    var toolsRect = storyPhotoTools.getBoundingClientRect();
    var maximumLeft = Math.max(8, editorCanvas.scrollWidth - toolsRect.width - 8);
    var left = elementRect.left - hostRect.left + editorCanvas.scrollLeft +
      (elementRect.width - toolsRect.width) / 2;
    left = Math.max(8, Math.min(maximumLeft, left));
    var below = elementRect.bottom - hostRect.top + editorCanvas.scrollTop + 10;
    var above = elementRect.top - hostRect.top + editorCanvas.scrollTop - toolsRect.height - 10;
    var visibleBottom = editorCanvas.scrollTop + editorCanvas.clientHeight;
    var top = below + toolsRect.height <= visibleBottom || above < editorCanvas.scrollTop
      ? below
      : above;
    storyPhotoTools.style.left = Math.round(left) + "px";
    storyPhotoTools.style.top = Math.max(8, Math.round(top)) + "px";
  }

  function syncStoryPhotoTools() {
    if (!storyPhotoTools || !previewLongText) return;
    var block = selectedStoryPhotoBlock();
    var element = storyPhotoPreviewElement(selectedStoryPhotoIndex);
    previewLongText.querySelectorAll("[data-story-preview-index]").forEach(function (previewElement) {
      var selected = previewElement === element && !!block;
      previewElement.classList.toggle("is-selected", selected);
      var button = previewElement.querySelector("[data-story-item-select]");
      if (button && button.getAttribute("role") !== "textbox") {
        button.setAttribute("aria-pressed", String(selected));
      }
    });
    if (!block || !element || stage.classList.contains("is-simple-layout")) {
      storyPhotoTools.hidden = true;
      return;
    }
    var isPhoto = block.type === "photo";
    var size = isPhoto
      ? storyPhotoAppearance(block).widthPct
      : normalizeStoryTextScale(block.fontScale);
    storyPhotoTools.hidden = false;
    if (storyPhotoToolsTitle) {
      storyPhotoToolsTitle.textContent = isPhoto
        ? Number(block.photoOrder) + " nuotraukos dydis"
        : "Teksto dydis";
    }
    if (storyPhotoSizeInput) {
      storyPhotoSizeInput.min = String(isPhoto ? MIN_STORY_PHOTO_WIDTH : MIN_STORY_TEXT_SCALE);
      storyPhotoSizeInput.max = String(isPhoto ? MAX_STORY_PHOTO_WIDTH : MAX_STORY_TEXT_SCALE);
      storyPhotoSizeInput.value = String(size);
    }
    if (storyPhotoSizeValue) {
      storyPhotoSizeValue.value = size + " %";
      storyPhotoSizeValue.textContent = size + " %";
    }
    if (storyPhotoOnlyControls) storyPhotoOnlyControls.hidden = !isPhoto;
    storyPhotoTools.querySelectorAll("[data-story-photo-fit]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        String(isPhoto && button.dataset.storyPhotoFit === storyPhotoAppearance(block).fit)
      );
    });
    positionStoryPhotoTools(element);
  }

  function clearStoryPhotoSelection() {
    selectedStoryPhotoIndex = -1;
    if (previewLongText) {
      previewLongText.querySelectorAll("[data-story-preview-index]").forEach(function (previewElement) {
        previewElement.classList.remove("is-selected");
        var button = previewElement.querySelector("[data-story-item-select]");
        if (button && button.getAttribute("role") !== "textbox") {
          button.setAttribute("aria-pressed", "false");
        }
      });
    }
    if (storyPhotoTools) storyPhotoTools.hidden = true;
  }

  function selectStoryPhoto(index, focusControl) {
    var block = storyBlocks[index];
    if (
      stage.classList.contains("is-simple-layout") ||
      !block ||
      (block.type !== "photo" && block.type !== "text") ||
      (block.type === "photo" && !block.photoOrder)
    ) return;
    selectedStoryPhotoIndex = index;
    syncStoryPhotoTools();
    if (focusControl && storyPhotoSizeInput) storyPhotoSizeInput.focus();
  }

  function updateSelectedStoryPhoto(width, fit) {
    var block = selectedStoryPhotoBlock();
    if (!block) return;
    if (width !== undefined) {
      if (block.type === "photo") {
        block.widthPct = normalizeStoryPhotoWidth(width, block.align);
      } else {
        block.fontScale = normalizeStoryTextScale(width);
      }
    }
    if (fit !== undefined && block.type === "photo") {
      block.fit = normalizeStoryPhotoFit(fit);
    }
    var element = storyPhotoPreviewElement(selectedStoryPhotoIndex);
    if (block.type === "photo") applyStoryPhotoAppearance(element, block);
    else applyStoryTextAppearance(element, block);
    syncStoryPhotoTools();
    scheduleStageFit(true);
    scheduleDraftSave();
  }

  function setupStoryPhotoTools() {
    if (!previewLongText || !storyPhotoTools) return;
    if (storyPhotoSizeInput) {
      storyPhotoSizeInput.addEventListener("input", function () {
        updateSelectedStoryPhoto(storyPhotoSizeInput.value);
      });
    }
    storyPhotoTools.addEventListener("click", function (event) {
      var sizeButton = event.target.closest("[data-story-photo-size]");
      if (sizeButton) {
        var block = selectedStoryPhotoBlock();
        if (!block) return;
        var currentSize = block.type === "photo"
          ? storyPhotoAppearance(block).widthPct
          : normalizeStoryTextScale(block.fontScale);
        updateSelectedStoryPhoto(
          currentSize + Number(sizeButton.dataset.storyPhotoSize || 0)
        );
        return;
      }
      var fitButton = event.target.closest("[data-story-photo-fit]");
      if (fitButton) {
        updateSelectedStoryPhoto(undefined, fitButton.dataset.storyPhotoFit);
        return;
      }
      if (event.target.closest("[data-story-photo-reset]")) {
        var selectedBlock = selectedStoryPhotoBlock();
        if (!selectedBlock) return;
        if (selectedBlock.type === "photo") {
          selectedBlock.widthPct = defaultStoryPhotoWidth(selectedBlock.align);
          selectedBlock.fit = "contain";
          updateSelectedStoryPhoto(selectedBlock.widthPct, selectedBlock.fit);
        } else {
          selectedBlock.fontScale = 100;
          updateSelectedStoryPhoto(100);
        }
        return;
      }
      if (event.target.closest("[data-story-photo-close]")) {
        clearStoryPhotoSelection();
      }
    });
    window.addEventListener("resize", function () {
      positionStoryPhotoTools(storyPhotoPreviewElement(selectedStoryPhotoIndex));
    });
    if (editorCanvas) {
      editorCanvas.addEventListener("scroll", function () {
        positionStoryPhotoTools(storyPhotoPreviewElement(selectedStoryPhotoIndex));
      }, { passive: true });
    }
  }

  function renderStoryPreview() {
    if (!previewLongText) return;
    previewLongText.innerHTML = "";
    stage.classList.add("has-story-blocks");
    var visibleBlocks = 0;
    var maximumPositiveOffsetY = 0;
    storyBlocks.forEach(function (block, index) {
      var position = storyBlockPosition(block);
      if (block.type === "text") {
        var value = String(block.text || "").trim();
        if (!value) return;
        maximumPositiveOffsetY = Math.max(maximumPositiveOffsetY, position.offsetY);
        var text = document.createElement("div");
        text.className = "editor-preview-story__text editor-story-layout-piece " +
          "memorial-story-block memorial-story-block--text memorial-story-block--positioned";
        text.dataset.storyPreviewIndex = String(index);
        text.style.setProperty("--story-offset-x", position.offsetX + "%");
        text.style.setProperty("--story-offset-y", position.offsetY + "px");
        applyStoryTextAppearance(text, block);
        var textSelectButton = document.createElement("span");
        textSelectButton.className = "editor-story-text-select";
        textSelectButton.dataset.storyItemSelect = String(index);
        textSelectButton.tabIndex = 0;
        textSelectButton.contentEditable = "true";
        textSelectButton.spellcheck = true;
        textSelectButton.setAttribute("role", "textbox");
        textSelectButton.setAttribute("aria-multiline", "true");
        textSelectButton.setAttribute("aria-label", "Redaguoti šią gyvenimo istorijos dalį");
        textSelectButton.textContent = value;
        textSelectButton.addEventListener("focus", function () {
          if (!stage.classList.contains("is-simple-layout")) selectStoryPhoto(index, false);
        });
        textSelectButton.addEventListener("paste", function (event) {
          event.preventDefault();
          var plainText = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
          document.execCommand("insertText", false, plainText);
        });
        textSelectButton.addEventListener("input", function () {
          block.text = String(textSelectButton.innerText || textSelectButton.textContent || "");
          limitStoryBlocksToWords();
          if (textSelectButton.innerText !== block.text) {
            textSelectButton.textContent = block.text;
            var range = document.createRange();
            range.selectNodeContents(textSelectButton);
            range.collapse(false);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
          syncLegacyStoryText();
          syncStoryTextEditors();
          updateStoryWordCount();
          updateCompletionChecklist();
          scheduleStageFit(true);
          scheduleDraftSave();
        });
        text.appendChild(textSelectButton);
        text.appendChild(storyLayoutHandle(index, "teksto"));
        text.appendChild(storyResizeHandle(index, "teksto"));
        previewLongText.appendChild(text);
        visibleBlocks += 1;
        return;
      }
      if (block.type !== "photo" || !block.photoOrder) return;
      var url = photoUrlAt(Number(block.photoOrder) - 1);
      if (!url) return;
      maximumPositiveOffsetY = Math.max(maximumPositiveOffsetY, position.offsetY);
      var figure = document.createElement("figure");
      var align = normalizeStoryPhotoAlign(block.align);
      figure.className = "editor-preview-story__photo editor-preview-story__photo--" + align +
        " editor-story-layout-piece memorial-story-block memorial-story-block--photo " +
        "memorial-story-block--photo-" + align + " memorial-story-block--positioned";
      figure.dataset.storyPreviewIndex = String(index);
      figure.dataset.storyPhotoContainer = String(index);
      figure.style.setProperty("--story-offset-x", position.offsetX + "%");
      figure.style.setProperty("--story-offset-y", position.offsetY + "px");
      applyStoryPhotoAppearance(figure, block);
      var selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "editor-story-photo-select";
      selectButton.dataset.storyPhotoSelect = String(index);
      selectButton.dataset.storyItemSelect = String(index);
      selectButton.setAttribute(
        "aria-label",
        "Koreguoti " + Number(block.photoOrder) + " nuotraukos dydį ir rodymą"
      );
      selectButton.setAttribute("aria-pressed", String(index === selectedStoryPhotoIndex));
      selectButton.addEventListener("click", function (event) {
        selectStoryPhoto(index, event.detail === 0);
      });
      var image = document.createElement("img");
      image.alt = storyPhotoAlt(block.photoOrder);
      image.decoding = "async";
      image.addEventListener("load", function () {
        scheduleStageFit(true);
      }, { once: true });
      image.src = url;
      selectButton.appendChild(image);
      figure.appendChild(selectButton);
      var captionValue = storyPhotoCaption(block.photoOrder);
      if (captionValue) {
        var caption = document.createElement("figcaption");
        caption.textContent = captionValue;
        figure.appendChild(caption);
      }
      figure.appendChild(storyLayoutHandle(index, "nuotraukos"));
      figure.appendChild(storyResizeHandle(index, "nuotraukos"));
      previewLongText.appendChild(figure);
      visibleBlocks += 1;
    });
    if (!visibleBlocks) {
      var placeholder = document.createElement("p");
      placeholder.className = "editor-preview-story__placeholder";
      placeholder.textContent = "Gyvenimo istorijos blokai atsiras čia.";
      previewLongText.appendChild(placeholder);
    }
    previewLongText.style.setProperty("--story-offset-padding", maximumPositiveOffsetY + "px");
    syncStoryPhotoInteractivity();
    syncStoryPhotoTools();
    setupStoryPreviewDragging();
    setupStoryPreviewResizing();
    scheduleStageFit(true);
  }

  function storyLayoutHandle(index, label) {
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "editor-story-layout-handle";
    handle.dataset.storyLayoutHandle = String(index);
    handle.setAttribute("aria-label", "Perkelti " + label + " bloką");
    handle.title = "Tempkite, kad perkeltumėte tik šį bloką";
    handle.textContent = "↕";
    return handle;
  }

  function storyResizeHandle(index, label) {
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "editor-story-resize-handle";
    handle.dataset.storyResizeHandle = String(index);
    handle.setAttribute("aria-label", "Keisti " + label + " dydį");
    handle.title = "Tempkite į šoną, kad pakeistumėte dydį";
    handle.textContent = "↘";
    return handle;
  }

  function applyStoryPreviewPosition(element, block) {
    var position = storyBlockPosition(block);
    block.offsetX = position.offsetX;
    block.offsetY = position.offsetY;
    element.style.setProperty("--story-offset-x", position.offsetX + "%");
    element.style.setProperty("--story-offset-y", position.offsetY + "px");
  }

  function setupStoryPreviewDragging() {
    previewLongText.querySelectorAll("[data-story-layout-handle]").forEach(function (handle) {
      var element = handle.closest("[data-story-preview-index]");
      var index = element ? Number(element.dataset.storyPreviewIndex) : -1;
      var block = storyBlocks[index];
      if (!element || !block) return;

      handle.addEventListener("pointerdown", function (event) {
        if (stage.classList.contains("is-simple-layout")) return;
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        var startX = event.clientX;
        var startY = event.clientY;
        var start = storyBlockPosition(block);
        var storyWidth = Math.max(1, previewLongText.getBoundingClientRect().width);
        element.classList.add("is-dragging");

        function move(moveEvent) {
          block.offsetX = normalizeStoryOffset(
            start.offsetX + (moveEvent.clientX - startX) / storyWidth * 100,
            -70,
            70
          );
          block.offsetY = normalizeStoryOffset(
            start.offsetY + moveEvent.clientY - startY,
            -320,
            320
          );
          applyStoryPreviewPosition(element, block);
          fitStageToContent(false, previewLongText);
        }

        function up() {
          element.classList.remove("is-dragging");
          scheduleStageFit(true);
          scheduleDraftSave();
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        }

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });

      handle.addEventListener("keydown", function (event) {
        var horizontal = 0;
        var vertical = 0;
        var step = event.shiftKey ? 12 : 4;
        if (event.key === "ArrowLeft") horizontal = -step;
        else if (event.key === "ArrowRight") horizontal = step;
        else if (event.key === "ArrowUp") vertical = -step;
        else if (event.key === "ArrowDown") vertical = step;
        else if (event.key === "Home") {
          block.offsetX = 0;
          block.offsetY = 0;
        } else return;
        event.preventDefault();
        if (horizontal) {
          block.offsetX = normalizeStoryOffset(
            storyBlockPosition(block).offsetX + horizontal / Math.max(1, previewLongText.clientWidth) * 100,
            -70,
            70
          );
        }
        if (vertical) {
          block.offsetY = normalizeStoryOffset(storyBlockPosition(block).offsetY + vertical, -320, 320);
        }
        applyStoryPreviewPosition(element, block);
        scheduleStageFit(true);
        scheduleDraftSave();
      });
    });
  }

  function setupStoryPreviewResizing() {
    previewLongText.querySelectorAll("[data-story-resize-handle]").forEach(function (handle) {
      var element = handle.closest("[data-story-preview-index]");
      var index = element ? Number(element.dataset.storyPreviewIndex) : -1;
      var block = storyBlocks[index];
      if (!element || !block) return;

      handle.addEventListener("pointerdown", function (event) {
        if (stage.classList.contains("is-simple-layout")) return;
        event.preventDefault();
        event.stopPropagation();
        selectStoryPhoto(index, false);
        handle.setPointerCapture(event.pointerId);
        var startX = event.clientX;
        var startSize = block.type === "photo"
          ? storyPhotoAppearance(block).widthPct
          : normalizeStoryTextScale(block.fontScale);
        var storyWidth = Math.max(1, previewLongText.getBoundingClientRect().width);
        element.classList.add("is-resizing");

        function move(moveEvent) {
          var delta = block.type === "photo"
            ? (moveEvent.clientX - startX) / storyWidth * 100
            : (moveEvent.clientX - startX) * 0.45;
          updateSelectedStoryPhoto(startSize + delta);
        }

        function up() {
          element.classList.remove("is-resizing");
          scheduleStageFit(true);
          scheduleDraftSave();
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        }

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });

      handle.addEventListener("keydown", function (event) {
        var direction = event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : (event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0);
        if (!direction && event.key !== "Home") return;
        event.preventDefault();
        selectStoryPhoto(index, false);
        var size = block.type === "photo"
          ? storyPhotoAppearance(block).widthPct
          : normalizeStoryTextScale(block.fontScale);
        if (event.key === "Home") {
          size = block.type === "photo" ? defaultStoryPhotoWidth(block.align) : 100;
        } else {
          size += direction * (event.shiftKey ? 10 : 5);
        }
        updateSelectedStoryPhoto(size);
      });
    });
  }

  function storyBlockOrderSummary() {
    if (storyEmptyMode || !storyBlocks.length) return "Istorijos blokų dar nėra.";
    return "Dabartinė tvarka: " + storyBlocks.map(function (block, index) {
      var label = block.type === "photo" ? "nuotrauka" : "tekstas";
      return (index + 1) + " – " + label;
    }).join(", ") + ".";
  }

  function updateStoryOrderStatus(message) {
    if (!storyOrderStatusEl) return;
    storyOrderStatusEl.textContent = (message ? message + " " : "") + storyBlockOrderSummary();
  }

  function moveStoryBlock(from, targetIndex) {
    if (from === targetIndex || from < 0 || targetIndex < 0 || from >= storyBlocks.length || targetIndex >= storyBlocks.length) {
      return false;
    }
    clearStoryPhotoSelection();
    var moved = storyBlocks.splice(from, 1)[0];
    storyBlocks.splice(targetIndex, 0, moved);
    renderStoryBlockEditor(targetIndex, moved.type);
    updateStoryOrderStatus((moved.type === "photo" ? "Nuotrauka" : "Tekstas") +
      " perkeltas į " + (targetIndex + 1) + " vietą.");
    scheduleDraftSave();
    return true;
  }

  function storyBlockControls(index) {
    var controls = document.createElement("span");
    controls.className = "editor-story-block__controls";
    var up = document.createElement("button");
    up.type = "button";
    up.dataset.storyMove = "-1";
    up.textContent = "↑ Aukštyn";
    up.setAttribute("aria-label", "Perkelti šį bloką viena vieta aukštyn");
    up.disabled = index === 0;
    var down = document.createElement("button");
    down.type = "button";
    down.dataset.storyMove = "1";
    down.textContent = "↓ Žemyn";
    down.setAttribute("aria-label", "Perkelti šį bloką viena vieta žemyn");
    down.disabled = index === storyBlocks.length - 1;
    var remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.storyDelete = "";
    remove.textContent = "Ištrinti";
    remove.setAttribute("aria-label", "Ištrinti šį turinio bloką");
    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(remove);
    return controls;
  }

  function renderStoryBlockEditor(focusIndex, focusKind) {
    if (!storyBlocksEl) return;
    storyBlocksEl.innerHTML = "";
    var selectedOrders = new Set(storyBlocks.filter(function (block) {
      return block.type === "photo" && block.photoOrder;
    }).map(function (block) {
      return Number(block.photoOrder);
    }));

    storyBlocks.forEach(function (block, index) {
      if (storyEmptyMode) return;
      var card = document.createElement("article");
      card.className = "editor-story-block editor-story-block--" + block.type;
      card.dataset.storyBlockIndex = String(index);
      card.setAttribute("role", "listitem");

      var header = document.createElement("header");
      header.className = "editor-story-block__header";
      var dragHandle = document.createElement("button");
      dragHandle.className = "editor-story-block__drag";
      dragHandle.type = "button";
      dragHandle.dataset.storyDrag = String(index);
      dragHandle.setAttribute("aria-label", "Tempti " + (index + 1) + " turinio bloką; klaviatūra naudokite rodykles aukštyn ir žemyn");
      dragHandle.title = "Tempkite į norimą vietą";
      dragHandle.textContent = "⋮⋮";
      var title = document.createElement("strong");
      title.textContent = block.type === "text"
        ? ((index + 1) + ". Tekstas")
        : ((index + 1) + ". Nuotrauka");
      header.appendChild(dragHandle);
      header.appendChild(title);
      header.appendChild(storyBlockControls(index));
      card.appendChild(header);

      if (block.type === "text") {
        var textLabel = document.createElement("label");
        textLabel.className = "editor-story-block__field";
        var textLabelCopy = document.createElement("span");
        textLabelCopy.textContent = "Istorijos dalis";
        var textarea = document.createElement("textarea");
        textarea.className = "editor-story-block__text";
        textarea.dataset.storyText = "";
        textarea.rows = 5;
        textarea.maxLength = 10000;
        textarea.placeholder = index === 0
          ? "Pavyzdžiui: kuo šis žmogus buvo ypatingas, ką mėgo ir kokį prisiminimą norite išsaugoti…"
          : "Įrašykite kitą gyvenimo istorijos dalį…";
        textarea.value = String(block.text || "");
        textLabel.appendChild(textLabelCopy);
        textLabel.appendChild(textarea);
        card.appendChild(textLabel);
      } else {
        var photoLayout = document.createElement("div");
        photoLayout.className = "editor-story-block__photo";
        var thumbnailButton = document.createElement("button");
        thumbnailButton.className = "editor-story-block__thumbnail-button";
        thumbnailButton.type = "button";
        thumbnailButton.dataset.storyEditPreview = "";
        thumbnailButton.setAttribute("aria-label", "Judinti ir keisti " + (index + 1) + " nuotraukos dydį peržiūroje");
        var thumbnail = document.createElement("img");
        thumbnail.className = "editor-story-block__thumbnail";
        thumbnail.alt = "";
        var previewUrl = block.photoOrder ? photoUrlAt(Number(block.photoOrder) - 1) : "";
        if (previewUrl) thumbnail.src = previewUrl;
        else thumbnailButton.hidden = true;
        var thumbnailAction = document.createElement("span");
        thumbnailAction.textContent = "Judinti ir didinti";
        thumbnailButton.appendChild(thumbnail);
        thumbnailButton.appendChild(thumbnailAction);
        photoLayout.appendChild(thumbnailButton);

        var photoFields = document.createElement("div");
        photoFields.className = "editor-story-block__photo-fields";
        var selectLabel = document.createElement("label");
        selectLabel.className = "editor-story-block__field";
        var selectCopy = document.createElement("span");
        selectCopy.textContent = "Nuotrauka";
        var select = document.createElement("select");
        select.dataset.storyPhotoSelect = "";
        var emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = storyPhotoCount()
          ? "Pasirinkite nuotrauką"
          : "Nuotraukų dar nėra";
        select.appendChild(emptyOption);
        for (var photoOrder = 1; photoOrder <= storyPhotoCount(); photoOrder++) {
          var option = document.createElement("option");
          option.value = String(photoOrder);
          option.textContent = photoOrder + ". " + storyPhotoName(photoOrder);
          option.disabled = selectedOrders.has(photoOrder) && Number(block.photoOrder) !== photoOrder;
          select.appendChild(option);
        }
        select.value = block.photoOrder ? String(block.photoOrder) : "";
        selectLabel.appendChild(selectCopy);
        selectLabel.appendChild(select);
        photoFields.appendChild(selectLabel);

        var alignLabel = document.createElement("div");
        alignLabel.className = "editor-story-block__field";
        var alignCopy = document.createElement("span");
        alignCopy.textContent = "Vieta prie teksto";
        var alignSelect = document.createElement("div");
        alignSelect.className = "editor-photo-position";
        alignSelect.dataset.storyPhotoAlign = "";
        alignSelect.setAttribute("data-story-photo-align", "");
        alignSelect.setAttribute("role", "group");
        alignSelect.setAttribute("aria-label", "Nuotraukos vieta prie teksto");
        [
          { value: "left", label: "Kairėje", icon: "◧", title: "Kairėje – tekstas apteka dešinėje" },
          { value: "full", label: "Per vidurį", icon: "▣", title: "Per visą plotį (atskira eilutė)" },
          { value: "right", label: "Dešinėje", icon: "◨", title: "Dešinėje – tekstas apteka kairėje" }
        ].forEach(function (choice) {
          var alignOption = document.createElement("button");
          alignOption.type = "button";
          alignOption.dataset.storyPhotoAlignValue = choice.value;
          alignOption.setAttribute("aria-pressed", String(normalizeStoryPhotoAlign(block.align) === choice.value));
          alignOption.setAttribute("title", choice.title);
          var alignIcon = document.createElement("span");
          alignIcon.className = "editor-photo-position__icon";
          alignIcon.setAttribute("aria-hidden", "true");
          alignIcon.textContent = choice.icon;
          var alignText = document.createElement("span");
          alignText.textContent = choice.label;
          alignOption.appendChild(alignIcon);
          alignOption.appendChild(alignText);
          alignSelect.appendChild(alignOption);
        });
        alignLabel.appendChild(alignCopy);
        alignLabel.appendChild(alignSelect);
        photoFields.appendChild(alignLabel);

        if (block.photoOrder) {
          var appearance = storyPhotoAppearance(block);
          var directControls = document.createElement("div");
          directControls.className = "editor-story-block__direct-controls";

          var sizeLabel = document.createElement("label");
          sizeLabel.className = "editor-story-block__field editor-story-block__size";
          var sizeCopy = document.createElement("span");
          sizeCopy.textContent = "Nuotraukos dydis";
          var sizeOutput = document.createElement("output");
          sizeOutput.dataset.storyPhotoWidthOutput = "";
          sizeOutput.textContent = appearance.widthPct + " %";
          var sizeInput = document.createElement("input");
          sizeInput.type = "range";
          sizeInput.min = String(MIN_STORY_PHOTO_WIDTH);
          sizeInput.max = String(MAX_STORY_PHOTO_WIDTH);
          sizeInput.step = "1";
          sizeInput.value = String(appearance.widthPct);
          sizeInput.dataset.storyPhotoWidth = "";
          sizeInput.setAttribute("aria-label", "Nuotraukos dydis procentais");
          sizeLabel.appendChild(sizeCopy);
          sizeLabel.appendChild(sizeOutput);
          sizeLabel.appendChild(sizeInput);
          directControls.appendChild(sizeLabel);

          var fitLabel = document.createElement("div");
          fitLabel.className = "editor-story-block__field";
          var fitCopy = document.createElement("span");
          fitCopy.textContent = "Kaip rodyti";
          var fitSelect = document.createElement("div");
          fitSelect.className = "editor-photo-fit-options";
          fitSelect.setAttribute("role", "group");
          fitSelect.setAttribute("aria-label", "Kaip rodyti nuotrauką");
          [
            { value: "contain", label: "Visa nuotrauka", title: "Rodyti visą nuotrauką" },
            { value: "cover", label: "Užpildyti", title: "Užpildyti plotą (apkirpti kraštus)" }
          ].forEach(function (choice) {
            var fitOption = document.createElement("button");
            fitOption.type = "button";
            fitOption.dataset.storyPhotoFitValue = choice.value;
            fitOption.setAttribute("aria-pressed", String(appearance.fit === choice.value));
            fitOption.setAttribute("title", choice.title);
            fitOption.textContent = choice.label;
            fitSelect.appendChild(fitOption);
          });
          fitLabel.appendChild(fitCopy);
          fitLabel.appendChild(fitSelect);
          directControls.appendChild(fitLabel);
          photoFields.appendChild(directControls);

          var editPreview = document.createElement("button");
          editPreview.className = "button button--ghost editor-story-block__edit-preview";
          editPreview.type = "button";
          editPreview.dataset.storyEditPreview = "";
          editPreview.textContent = "Judinti nuotrauką peržiūroje";
          photoFields.appendChild(editPreview);

          var captionLabel = document.createElement("label");
          captionLabel.className = "editor-story-block__field";
          var captionCopy = document.createElement("span");
          captionCopy.textContent = "Trumpas aprašymas";
          var captionInput = document.createElement("textarea");
          captionInput.dataset.storyPhotoCaption = "";
          captionInput.rows = 2;
          captionInput.maxLength = 240;
          captionInput.placeholder = "Pvz., Su šeima prie Baltijos jūros, 1985 m.";
          captionInput.value = storyPhotoCaption(block.photoOrder);
          captionLabel.appendChild(captionCopy);
          captionLabel.appendChild(captionInput);
          photoFields.appendChild(captionLabel);
        } else {
          var emptyHelp = document.createElement("p");
          emptyHelp.className = "editor-story-block__empty";
          emptyHelp.textContent = "Pasirinkite jau pridėtą nuotrauką arba įkelkite ją aukščiau šiame žingsnyje.";
          var openFiles = document.createElement("button");
          openFiles.type = "button";
          openFiles.className = "button button--ghost editor-story-block__open-files";
          openFiles.dataset.storyOpenFiles = "";
          openFiles.textContent = "Pasirinkti nuotraukas";
          emptyHelp.appendChild(openFiles);
          photoFields.appendChild(emptyHelp);
        }
        photoLayout.appendChild(photoFields);
        card.appendChild(photoLayout);
      }
      if (index < storyBlocks.length - 1) {
        var insertText = document.createElement("button");
        insertText.className = "editor-story-block__insert";
        insertText.type = "button";
        insertText.dataset.storyInsertText = "";
        insertText.textContent = "+ Įterpti teksto dalį po šiuo bloku";
        insertText.setAttribute("aria-label", "Įterpti naują teksto dalį po " + (index + 1) + " bloku");
        card.appendChild(insertText);
      }
      storyBlocksEl.appendChild(card);
    });

    syncLegacyStoryText();
    updateStoryWordCount();
    updateCompletionChecklist();
    updateStoryOrderStatus();
    renderStoryPreview();
    if (Number.isInteger(focusIndex)) {
      window.requestAnimationFrame(function () {
        var targetCard = storyBlocksEl.querySelector("[data-story-block-index='" + focusIndex + "']");
        var target = targetCard && targetCard.querySelector(
          focusKind === "photo" ? "[data-story-photo-select]" : "[data-story-text]"
        );
        if (target) target.focus();
      });
    }
  }

  function remapStoryPhotoOrder(from, to) {
    if (from === to) return;
    storyBlocks.forEach(function (block) {
      if (block.type !== "photo" || !block.photoOrder) return;
      var current = Number(block.photoOrder) - 1;
      if (current === from) current = to;
      else if (from < to && current > from && current <= to) current -= 1;
      else if (from > to && current >= to && current < from) current += 1;
      block.photoOrder = current + 1;
    });
  }

  function setupStoryBuilder() {
    if (!storyBlocksEl) return;
    storyBlocksEl.addEventListener("input", function (event) {
      var card = event.target.closest("[data-story-block-index]");
      if (!card) return;
      var index = Number(card.dataset.storyBlockIndex);
      var block = storyBlocks[index];
      if (!block) return;
      if (event.target.matches("[data-story-text]")) {
        block.text = event.target.value;
        limitStoryBlocksToWords();
        syncStoryTextEditors();
      } else if (event.target.matches("[data-story-photo-caption]") && block.photoOrder) {
        var captionField = form.elements["photo_caption_" + block.photoOrder];
        if (captionField) captionField.value = event.target.value;
      } else if (event.target.matches("[data-story-photo-width]") && block.type === "photo") {
        block.widthPct = normalizeStoryPhotoWidth(event.target.value, block.align);
        var sizeOutput = card.querySelector("[data-story-photo-width-output]");
        if (sizeOutput) sizeOutput.textContent = block.widthPct + " %";
      }
      syncLegacyStoryText();
      updateStoryWordCount();
      renderStoryPreview();
      scheduleDraftSave();
    });

    storyBlocksEl.addEventListener("change", function (event) {
      if (!event.target.matches("[data-story-photo-select]")) return;
      var card = event.target.closest("[data-story-block-index]");
      var index = card ? Number(card.dataset.storyBlockIndex) : -1;
      if (!storyBlocks[index] || storyBlocks[index].type !== "photo") return;
      var nextOrder = Number(event.target.value);
      storyBlocks[index].photoOrder = Number.isInteger(nextOrder) && nextOrder >= 1 && nextOrder <= storyPhotoCount()
        ? nextOrder
        : null;
      ensurePersistableStoryMode();
      renderStoryBlockEditor(index, "photo");
      scheduleDraftSave();
    });

    storyBlocksEl.addEventListener("keydown", function (event) {
      var handle = event.target.closest("[data-story-drag]");
      if (!handle) return;
      var from = Number(handle.dataset.storyDrag);
      var to = from;
      if (event.key === "ArrowUp") to = Math.max(0, from - 1);
      else if (event.key === "ArrowDown") to = Math.min(storyBlocks.length - 1, from + 1);
      else if (event.key === "Home") to = 0;
      else if (event.key === "End") to = storyBlocks.length - 1;
      else return;
      event.preventDefault();
      moveStoryBlock(from, to);
    });

    storyBlocksEl.addEventListener("pointerdown", function (event) {
      var handle = event.target.closest("[data-story-drag]");
      if (!handle) return;
      var card = handle.closest("[data-story-block-index]");
      if (!card) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.dataset.storyDragFrom = card.dataset.storyBlockIndex;
      card.classList.add("is-dragging");
    });

    storyBlocksEl.addEventListener("pointermove", function (event) {
      var handle = event.target.closest("[data-story-drag][data-story-drag-from]");
      if (!handle) return;
      var target = document.elementFromPoint(event.clientX, event.clientY);
      var targetCard = target && target.closest ? target.closest("[data-story-block-index]") : null;
      storyBlocksEl.querySelectorAll(".is-drop-target").forEach(function (card) {
        card.classList.remove("is-drop-target");
      });
      if (targetCard && targetCard !== handle.closest("[data-story-block-index]")) {
        targetCard.classList.add("is-drop-target");
      }
    });

    function finishStoryBlockDrag(event, cancelled) {
      var handle = event.target.closest("[data-story-drag][data-story-drag-from]");
      if (!handle) return;
      var sourceCard = handle.closest("[data-story-block-index]");
      var target = cancelled ? null : document.elementFromPoint(event.clientX, event.clientY);
      var targetCard = target && target.closest ? target.closest("[data-story-block-index]") : null;
      var from = Number(handle.dataset.storyDragFrom);
      delete handle.dataset.storyDragFrom;
      if (sourceCard) sourceCard.classList.remove("is-dragging");
      storyBlocksEl.querySelectorAll(".is-drop-target").forEach(function (card) {
        card.classList.remove("is-drop-target");
      });
      if (!targetCard) return;
      moveStoryBlock(from, Number(targetCard.dataset.storyBlockIndex));
    }

    storyBlocksEl.addEventListener("pointerup", function (event) {
      finishStoryBlockDrag(event, false);
    });

    storyBlocksEl.addEventListener("pointercancel", function (event) {
      finishStoryBlockDrag(event, true);
    });

    storyBlocksEl.addEventListener("click", function (event) {
      var openFiles = event.target.closest("[data-story-open-files]");
      if (openFiles) {
        photosInput.click();
        return;
      }
      var card = event.target.closest("[data-story-block-index]");
      if (!card) return;
      var index = Number(card.dataset.storyBlockIndex);
      var alignButton = event.target.closest("[data-story-photo-align-value]");
      if (alignButton) {
        var alignBlock = storyBlocks[index];
        if (!alignBlock || alignBlock.type !== "photo") return;
        var previousAlign = normalizeStoryPhotoAlign(alignBlock.align);
        var nextAlign = normalizeStoryPhotoAlign(alignButton.dataset.storyPhotoAlignValue);
        if (storyPhotoAppearance(alignBlock).widthPct === defaultStoryPhotoWidth(previousAlign)) {
          alignBlock.widthPct = defaultStoryPhotoWidth(nextAlign);
        }
        alignBlock.align = nextAlign;
        card.querySelectorAll("[data-story-photo-align-value]").forEach(function (button) {
          button.setAttribute("aria-pressed", String(button.dataset.storyPhotoAlignValue === nextAlign));
        });
        var nextAppearance = storyPhotoAppearance(alignBlock);
        var widthInput = card.querySelector("[data-story-photo-width]");
        var widthOutput = card.querySelector("[data-story-photo-width-output]");
        if (widthInput) widthInput.value = String(nextAppearance.widthPct);
        if (widthOutput) widthOutput.textContent = nextAppearance.widthPct + " %";
        renderStoryPreview();
        scheduleDraftSave();
        return;
      }
      var fitButton = event.target.closest("[data-story-photo-fit-value]");
      if (fitButton) {
        var fitBlock = storyBlocks[index];
        if (!fitBlock || fitBlock.type !== "photo") return;
        fitBlock.fit = normalizeStoryPhotoFit(fitButton.dataset.storyPhotoFitValue);
        card.querySelectorAll("[data-story-photo-fit-value]").forEach(function (button) {
          button.setAttribute("aria-pressed", String(button.dataset.storyPhotoFitValue === fitBlock.fit));
        });
        renderStoryPreview();
        scheduleDraftSave();
        return;
      }
      var editPreview = event.target.closest("[data-story-edit-preview]");
      if (editPreview) {
        var photoBlock = storyBlocks[index];
        if (!photoBlock || photoBlock.type !== "photo" || !photoBlock.photoOrder) return;
        setAdvancedLayoutOpen(true, false);
        if (openPreviewDialog) openPreviewDialog(editPreview);
        window.requestAnimationFrame(function () {
          selectStoryPhoto(index, true);
        });
        return;
      }
      if (event.target.closest("[data-story-insert-text]")) {
        if (storyBlocks.length >= MAX_STORY_BLOCKS) {
          updateStoryOrderStatus("Pasiektas " + MAX_STORY_BLOCKS + " turinio blokų limitas.");
          return;
        }
        storyBlocks.splice(index + 1, 0, {
          type: "text",
          text: "",
          fontScale: 100,
          offsetX: 0,
          offsetY: 0
        });
        storyEmptyMode = false;
        renderStoryBlockEditor(index + 1, "text");
        updateStoryOrderStatus("Nauja teksto dalis įterpta po " + (index + 1) + " bloku.");
        scheduleDraftSave();
        return;
      }
      var move = event.target.closest("[data-story-move]");
      if (move) {
        var targetIndex = index + Number(move.dataset.storyMove);
        moveStoryBlock(index, targetIndex);
        return;
      }
      if (event.target.closest("[data-story-delete]")) {
        clearStoryPhotoSelection();
        storyBlocks.splice(index, 1);
        ensurePersistableStoryMode();
        renderStoryBlockEditor(Math.min(index, storyBlocks.length - 1));
        updateStoryOrderStatus("Blokas ištrintas.");
        scheduleDraftSave();
      }
    });

    if (addStoryTextButton) {
      addStoryTextButton.addEventListener("click", function () {
        if (storyBlocks.length >= MAX_STORY_BLOCKS) {
          statusEl.textContent = "Galima pridėti iki " + MAX_STORY_BLOCKS + " turinio blokų.";
          return;
        }
        if (storyEmptyMode) storyBlocks = [];
        storyEmptyMode = false;
        storyBlocks.push({ type: "text", text: "", fontScale: 100, offsetX: 0, offsetY: 0 });
        renderStoryBlockEditor(storyBlocks.length - 1, "text");
        scheduleDraftSave();
      });
    }
    if (addStoryPhotoButton) {
      addStoryPhotoButton.addEventListener("click", function () {
        if (storyBlocks.length >= MAX_STORY_BLOCKS) {
          statusEl.textContent = "Galima pridėti iki " + MAX_STORY_BLOCKS + " turinio blokų.";
          return;
        }
        var unusedPhotoOrder = firstUnusedStoryPhotoOrder();
        if (unusedPhotoOrder === null) {
          if (!storyPhotoCount()) {
            updateStoryOrderStatus("Pirmiausia pasirinkite bent vieną nuotrauką.");
            photosInput.click();
          } else {
            updateStoryOrderStatus("Visos įkeltos nuotraukos jau yra istorijoje.");
            photosInput.focus();
          }
          return;
        }
        if (storyEmptyMode) storyBlocks = [];
        storyEmptyMode = false;
        storyBlocks.push({
          type: "photo",
          photoOrder: unusedPhotoOrder,
          align: "full",
          widthPct: 100,
          fit: "contain",
          offsetX: 0,
          offsetY: 0
        });
        renderStoryBlockEditor(storyBlocks.length - 1, "photo");
        scheduleDraftSave();
      });
    }
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
    var personDetails = picker.closest(".editor-person-details");
    if (personDetails) personDetails.open = true;
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

  async function persistDraftFileChanges(changes) {
    var updates = Array.isArray(changes) ? changes : [];
    if (!updates.length) return;
    var db = await openDraftDb();
    if (!db) {
      if (updates.some(function (change) { return !!change.file; })) {
        throw new Error("Naršyklė negali išsaugoti pasirinktų failų.");
      }
      return;
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      var store = tx.objectStore(DRAFT_STORE);
      updates.forEach(function (change) {
        if (change.file) {
          store.put({
            key: draftFileKey(change.key),
            file: change.file,
            name: change.file.name,
            type: change.file.type,
            lastModified: change.file.lastModified || Date.now(),
            savedAt: Date.now()
          });
        } else {
          store.delete(draftFileKey(change.key));
        }
      });
      function finish(error) {
        if (settled) return;
        settled = true;
        db.close();
        if (error) reject(error);
        else resolve();
      }
      tx.oncomplete = function () { finish(); };
      tx.onerror = function () { finish(tx.error || new Error("Failų juodraščio įrašyti nepavyko.")); };
      tx.onabort = function () { finish(tx.error || new Error("Failų juodraščio įrašymas nutrauktas.")); };
    });
  }

  async function putDraftFile(key, file) {
    if (!file) return;
    return persistDraftFileChanges([{ key: key, file: file }]);
  }

  async function deleteDraftFile(key) {
    return persistDraftFileChanges([{ key: key, file: null }]);
  }

  function hasDraftMediaPersistenceFailure() {
    return photoDraftPersistenceFailed ||
      auxiliaryMediaPersistenceFailed.video ||
      auxiliaryMediaPersistenceFailed.captions;
  }

  function queueAuxiliaryMediaPersistence(key, file) {
    var version = ++auxiliaryMediaPersistenceVersion[key];
    auxiliaryMediaPersistenceFailed[key] = false;
    auxiliaryMediaPersistencePending += 1;
    clearTimeout(draftSaveTimer);
    setDraftState("Saugomi pasirinkti failai…", "saving");
    auxiliaryMediaPersistencePromise = auxiliaryMediaPersistencePromise
      .then(function () {
        return file ? putDraftFile(key, file) : deleteDraftFile(key);
      })
      .then(function () {
        if (version === auxiliaryMediaPersistenceVersion[key]) {
          auxiliaryMediaPersistenceFailed[key] = false;
        }
      }, function (err) {
        console.warn("Auxiliary media draft persistence failed", err);
        if (version === auxiliaryMediaPersistenceVersion[key]) {
          auxiliaryMediaPersistenceFailed[key] = true;
        }
      })
      .then(function () {
        auxiliaryMediaPersistencePending = Math.max(0, auxiliaryMediaPersistencePending - 1);
        if (version !== auxiliaryMediaPersistenceVersion[key] || auxiliaryMediaPersistencePending) return;
        if (hasDraftMediaPersistenceFailure()) {
          clearTimeout(draftSaveTimer);
          setDraftState("Pasirinktų failų juodraščio nepavyko išsaugoti", "error");
          return;
        }
        scheduleDraftSave();
      });
    return auxiliaryMediaPersistencePromise;
  }

  async function waitForAuxiliaryMediaPersistence(throwOnFailure) {
    var observed;
    do {
      observed = auxiliaryMediaPersistencePromise;
      await observed;
    } while (observed !== auxiliaryMediaPersistencePromise);
    if (throwOnFailure !== false &&
      (auxiliaryMediaPersistenceFailed.video || auxiliaryMediaPersistenceFailed.captions)) {
      throw new Error("Pasirinktų failų juodraščio nepavyko išsaugoti.");
    }
  }

  async function getDraftFile(key) {
    var db = await openDraftDb();
    if (!db) return null;
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DRAFT_STORE, "readwrite");
      var store = tx.objectStore(DRAFT_STORE);
      var request = store.get(draftFileKey(key));
      request.onsuccess = function () {
        var item = request.result;
        if (!item || !item.file) return resolve(null);
        var retainedAt = Math.max(Number(item.savedAt) || 0, draftSavedAtMs);
        if (!retainedAt || Date.now() - retainedAt > DRAFT_TTL_MS) {
          store.delete(draftFileKey(key));
          return resolve(null);
        }
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
      store.delete(draftFileKey("captions"));
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function clearDraft() {
    await photoSyncPromise;
    await waitForAuxiliaryMediaPersistence(false);
    localStorage.removeItem(DRAFT_KEY);
    draftSavedAtMs = 0;
    await clearDraftFiles();
    window.location.reload();
  }

  async function discardCurrentDraft() {
    localStorage.removeItem(DRAFT_KEY);
    draftSavedAtMs = 0;
    await clearDraftFiles();
  }

  function applyLayout(layout) {
    if (!layout) return;
    if (layout.__stage && layout.__stage.background) {
      setBackgroundColor(layout.__stage.background, false);
    }
    if (layout.__stage && layout.__stage.heightPct) {
      setStageHeightPct(parseFloat(layout.__stage.heightPct));
    }
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      var saved = layout[piece.dataset.piece];
      if (!saved) return;
      if (saved.left) piece.style.left = saved.left;
      var savedTopPct = parseFloat(saved.topPct);
      if (Number.isFinite(savedTopPct)) {
        setPieceTopPct(piece, savedTopPct);
      } else if (saved.top) {
        setPieceTopPct(piece, legacyTopToWidthPct(saved.top));
      }
      if (saved.width) piece.style.width = saved.width;
      if (saved.heightPct) setPieceHeightPct(piece, parseFloat(saved.heightPct));
      if (saved.fit) piece.dataset.fit = saved.fit;
      var img = piece.querySelector && piece.querySelector("img");
      if (img && saved.objectPosition) img.style.objectPosition = saved.objectPosition;
      if (img && saved.fit === "crop") img.style.objectFit = "cover";
    });
    scheduleStageFit(true);
  }

  function draftFormData() {
    syncLegacyStoryText();
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

  function editorHistorySnapshot() {
    return {
      form: draftFormData(),
      storyBlocks: collectStoryBlocks(true),
      storyEmpty: storyEmptyMode,
      layout: collectLayout()
    };
  }

  function syncEditorHistoryButtons() {
    if (undoButton) undoButton.disabled = undoHistory.length <= 1;
    if (redoButton) redoButton.disabled = redoHistory.length === 0;
  }

  function recordEditorHistory(force) {
    if (!historyReady || historyRestoring) return;
    var snapshot = editorHistorySnapshot();
    var json = JSON.stringify(snapshot);
    if (!force && json === lastHistoryJson) return;
    undoHistory.push(snapshot);
    if (undoHistory.length > 50) undoHistory.shift();
    redoHistory = [];
    lastHistoryJson = json;
    syncEditorHistoryButtons();
  }

  function scheduleEditorHistory() {
    if (!historyReady || historyRestoring) return;
    clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(function () {
      recordEditorHistory(false);
    }, 350);
  }

  function restoreEditorHistory(snapshot) {
    if (!snapshot) return;
    historyRestoring = true;
    clearTimeout(historySaveTimer);
    restoreDraftFields(snapshot.form);
    setStoryBlocks(snapshot.storyBlocks, true, snapshot.storyEmpty);
    syncDatePickersFromHidden();
    setBackgroundColor(snapshot.form && snapshot.form.fono_spalva, false);
    renderStoryBlockEditor();
    syncPreview();
    applyLayout(snapshot.layout);
    refreshResponsiveStage(true);
    lastHistoryJson = JSON.stringify(snapshot);
    historyRestoring = false;
    saveDraftNow();
    syncEditorHistoryButtons();
  }

  function undoEditorChange() {
    if (undoHistory.length <= 1) return;
    redoHistory.push(undoHistory.pop());
    restoreEditorHistory(undoHistory[undoHistory.length - 1]);
  }

  function redoEditorChange() {
    if (!redoHistory.length) return;
    var snapshot = redoHistory.pop();
    undoHistory.push(snapshot);
    restoreEditorHistory(snapshot);
  }

  function setupEditorHistory() {
    historyReady = true;
    recordEditorHistory(true);
    if (undoButton) undoButton.addEventListener("click", undoEditorChange);
    if (redoButton) redoButton.addEventListener("click", redoEditorChange);
    document.addEventListener("keydown", function (event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (event.shiftKey) redoEditorChange();
      else undoEditorChange();
    });
  }

  function saveDraftNow() {
    if (isRestoringDraft) return false;
    if (photosProcessing) {
      setDraftState("Nuotraukos ruošiamos…", "saving");
      return false;
    }
    if (auxiliaryMediaPersistencePending) {
      setDraftState("Failai ruošiami…", "saving");
      return false;
    }
    if (hasDraftMediaPersistenceFailure()) {
      setDraftState("Pasirinktų failų juodraščio nepavyko išsaugoti", "error");
      return false;
    }
    try {
      var savedAt = new Date();
      draftSavedAtMs = savedAt.getTime();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: draftFormData(),
        storyBlocks: collectStoryBlocks(true),
        storyEmpty: storyEmptyMode,
        layout: collectLayout(),
        step: currentEditorStep,
        savedAt: savedAt.toISOString()
      }));
      setDraftState("Juodraštis išsaugotas " + new Intl.DateTimeFormat("lt-LT", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(savedAt), "saved");
      return true;
    } catch (err) {
      console.warn("Draft save failed", err);
      setDraftState("Juodraščio nepavyko išsaugoti", "error");
      return false;
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    setDraftState("Saugomi pakeitimai…", "saving");
    draftSaveTimer = setTimeout(saveDraftNow, 150);
    scheduleEditorHistory();
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

  function updatePhotoDescriptionVisibility(names) {
    var selected = (names || []).filter(Boolean).slice(0, MAX_PHOTOS);
    if (photoDetailsEl) photoDetailsEl.hidden = selected.length === 0;
    document.querySelectorAll("[data-photo-description]").forEach(function (card) {
      var index = Number(card.dataset.photoDescription) - 1;
      card.hidden = index < 0 || index >= selected.length;
      var title = card.querySelector(".editor-photo-description__title");
      if (!title || card.hidden) return;
      title.innerHTML = "";
      var label = document.createTextNode((index + 1) + " nuotrauka");
      title.appendChild(label);
      if (index >= 4) {
        var gallery = document.createElement("small");
        gallery.textContent = " galerijoje";
        title.appendChild(gallery);
      }
      if (selected[index]) {
        var name = document.createElement("small");
        name.className = "editor-photo-description__name";
        name.textContent = selected[index];
        title.appendChild(name);
      }
    });
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
      if (photoOrderMode === "files") slot.onload = function () {
        setFrameToImageRatio(this, this);
        scheduleStageFit(true);
      };
      if (empty) empty.hidden = true;
    }
    scheduleStageFit(true);
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
    if (photoOrderMode !== "files") {
      photoDraftPersistenceFailed = false;
      return;
    }
    try {
      var changes = [];
      for (var i = 0; i < MAX_PHOTOS; i++) {
        changes.push({
          key: "photo-" + i,
          file: processedPhotos[i] || null
        });
      }
      await persistDraftFileChanges(changes);
      photoDraftPersistenceFailed = false;
    } catch (err) {
      photoDraftPersistenceFailed = true;
      throw err;
    }
  }

  async function persistDraftBeforeLogin() {
    clearTimeout(draftSaveTimer);
    await photoSyncPromise;
    if (photoPreparationFailed) {
      throw new Error("Nuotraukų paruošti nepavyko. Pasirinkite jas dar kartą.");
    }
    await waitForAuxiliaryMediaPersistence(false);
    var video = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;
    var captions = (captionsInput.files && captionsInput.files[0]) ? captionsInput.files[0] : savedCaptionsFile;
    if (video && video.size > MAX_VIDEO_BYTES) {
      throw new Error("Vaizdo įrašas per didelis. Pasirinkite ne didesnį kaip 50 MB failą.");
    }
    var hasMedia = processedPhotos.some(Boolean) || !!video || !!captions;
    if (hasMedia && !window.indexedDB) {
      throw new Error("Ši naršyklė negali saugiai išlaikyti pasirinktų failų. Prisijunkite prieš pasirinkdami failus.");
    }
    var changes = [];
    if (photoOrderMode === "files") {
      for (var i = 0; i < MAX_PHOTOS; i++) {
        changes.push({ key: "photo-" + i, file: processedPhotos[i] || null });
      }
    }
    changes.push({ key: "video", file: video || null });
    changes.push({ key: "captions", file: captions || null });
    try {
      await persistDraftFileChanges(changes);
      photoDraftPersistenceFailed = false;
      auxiliaryMediaPersistenceFailed.video = false;
      auxiliaryMediaPersistenceFailed.captions = false;
    } catch (err) {
      // Kai failų nėra, užblokuota arba nepasiekiama IndexedDB neturi
      // sustabdyti tekstinio juodraščio ir perėjimo į prisijungimą telefone.
      if (!hasMedia) {
        console.warn("Empty draft media cleanup skipped", err);
        photoDraftPersistenceFailed = false;
        auxiliaryMediaPersistenceFailed.video = false;
        auxiliaryMediaPersistenceFailed.captions = false;
      } else {
        if (photoOrderMode === "files") photoDraftPersistenceFailed = true;
        auxiliaryMediaPersistenceFailed.video = true;
        auxiliaryMediaPersistenceFailed.captions = true;
        throw err;
      }
    }
    if (!saveDraftNow()) throw new Error("Juodraščio nepavyko išsaugoti šiame įrenginyje.");
  }

  function swapPhotoOrder(from, to) {
    if (photosProcessing) {
      statusEl.textContent = "Palaukite, kol nuotraukos bus paruoštos.";
      return;
    }
    if (from === to || from < 0 || to < 0 || from >= photoOrderNames.length || to >= photoOrderNames.length) return;
    remapStoryPhotoOrder(from, to);
    var name = photoOrderNames.splice(from, 1)[0];
    photoOrderNames.splice(to, 0, name);
    var photoPersistence = null;
    if (photoOrderMode === "existing") {
      var images = orderedExistingImages();
      var image = images.splice(from, 1)[0];
      images.splice(to, 0, image);
      images.forEach(function (item, index) { item.order = index + 1; });
      editingMedia = images.concat(editingMedia.filter(function (item) { return item.type !== "image"; }));
    } else {
      var file = processedPhotos.splice(from, 1)[0];
      processedPhotos.splice(to, 0, file);
      photosProcessing = true;
      photosInput.disabled = true;
      photoPersistence = persistProcessedPhotoOrder();
      photoSyncPromise = photoPersistence.catch(function () {});
    }
    movePhotoFields(from, to);
    updatePhotoDescriptionVisibility(photoOrderNames);
    renderPhotoOrder();
    refreshOrderedPhotoPreviews();
    renderStoryBlockEditor();
    syncPreview();
    if (photoPersistence) {
      clearTimeout(draftSaveTimer);
      setDraftState("Saugomi pakeitimai…", "saving");
      photoPersistence.then(function () {
        photosProcessing = false;
        photosInput.disabled = false;
        renderPhotoOrder();
        scheduleDraftSave();
      }).catch(function (err) {
        photosProcessing = false;
        photosInput.disabled = false;
        renderPhotoOrder();
        console.warn("Photo order draft persistence failed", err);
        clearTimeout(draftSaveTimer);
        setDraftState("Nuotraukų juodraščio nepavyko išsaugoti", "error");
      });
    } else {
      scheduleDraftSave();
    }
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
      handle.disabled = photosProcessing;

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
      controls.querySelector("[data-photo-move='-1']").disabled = photosProcessing || index === 0;
      controls.querySelector("[data-photo-move='1']").disabled =
        photosProcessing || index === photoOrderNames.length - 1;

      item.appendChild(handle);
      item.appendChild(preview);
      item.appendChild(copy);
      item.appendChild(controls);
      photoOrderEl.appendChild(item);

      handle.addEventListener("pointerdown", function (event) {
        if (photosProcessing) return;
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
      reconcileStoryPhotoBlocks(photoOrderNames.length, false);
      renderPhotoFileList(restoredNames);
      updatePhotoDescriptionVisibility(photoOrderNames);
      renderPhotoOrder();
    }

    var video = await getDraftFile("video");
    if (video && video.size <= MAX_VIDEO_BYTES) {
      savedVideoFile = video;
      var wrap = previewVideo.closest(".editor-video-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      previewVideo.src = URL.createObjectURL(video);
      previewVideo.hidden = false;
      setVideoSlotVisible(true);
      if (empty) empty.hidden = true;
    } else if (video) {
      await deleteDraftFile("video");
      setVideoSlotVisible(false);
      statusEl.textContent = "Anksčiau pasirinktas vaizdo įrašas viršijo 50 MB ribą, todėl pasirinkite mažesnį failą.";
    }
    var captions = await getDraftFile("captions");
    if (captions) savedCaptionsFile = captions;
    scheduleStageFit(true);
  }

  async function restoreDraft() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      try {
        await clearDraftFiles();
      } catch (err) {
        console.warn("Orphaned draft cleanup failed", err);
      }
      return false;
    }
    isRestoringDraft = true;
    try {
      var draft = JSON.parse(raw);
      var savedAt = Date.parse(draft.savedAt || "");
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY);
        draftSavedAtMs = 0;
        await clearDraftFiles();
        setDraftState("Pasenęs juodraštis pašalintas", "");
        return false;
      }
      draftSavedAtMs = savedAt;
      if (editorSteps.indexOf(draft.step) >= 0) currentEditorStep = draft.step;
      storyBlocks = [];
      storyBlocksLoaded = false;
      restoreDraftFields(draft.form);
      if (Object.prototype.hasOwnProperty.call(draft, "storyBlocks")) {
        setStoryBlocks(draft.storyBlocks, true, draft.storyEmpty === true);
      }
      applyLayout(draft.layout);
      await restoreDraftMedia();
      statusEl.textContent = "Atkurta paskutinė neišsaugota versija.";
      setDraftState("Atkurtas ankstesnis juodraštis", "saved");
      return true;
    } catch (err) {
      console.warn("Draft restore failed", err);
      localStorage.removeItem(DRAFT_KEY);
      draftSavedAtMs = 0;
      try {
        await clearDraftFiles();
      } catch (cleanupError) {
        console.warn("Invalid draft cleanup failed", cleanupError);
      }
      return false;
    } finally {
      isRestoringDraft = false;
    }
  }

  function showExistingMedia(media) {
    editingMedia = Array.isArray(media) ? media.slice() : [];
    var images = editingMedia.filter(function (item) { return item.type === "image"; })
      .sort(function (left, right) { return Number(left.order || 0) - Number(right.order || 0); });
    var unavailableImageCount = 0;
    images.forEach(function (item, index) {
      var captionField = form.elements["photo_caption_" + (index + 1)];
      var altField = form.elements["photo_alt_" + (index + 1)];
      if (captionField) captionField.value = item.caption || "";
      if (altField) altField.value = item.alt || "";
      var slot = photoSlots[index];
      if (!slot) return;
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      if (item.url) {
        slot.src = item.url;
        slot.hidden = false;
        if (empty) empty.hidden = true;
      } else {
        unavailableImageCount += 1;
        slot.hidden = true;
        slot.removeAttribute("src");
        if (empty) empty.hidden = false;
      }
    });
    if (images.length) {
      photoOrderMode = "existing";
      photoOrderNames = images.map(function (item, index) {
        return item.caption || ("Esama nuotrauka " + (index + 1));
      });
      photoFileList.textContent = "Paliekamos " + images.length + " esamos nuotraukos. Pasirinkus naujas, jos bus pakeistos." +
        (unavailableImageCount
          ? " Kai kurių nuotraukų peržiūra laikinai nepasiekiama, tačiau failai bus išsaugoti."
          : "");
      updatePhotoDescriptionVisibility(photoOrderNames);
      renderPhotoOrder();
    }

    var video = editingMedia.find(function (item) { return item.type === "video"; });
    if (video) {
      var videoWrap = previewVideo.closest(".editor-video-slot");
      var videoEmpty = videoWrap ? videoWrap.querySelector(".editor-empty-photo") : null;
      setVideoSlotVisible(true);
      if (video.url) {
        previewVideo.src = video.url;
        previewVideo.hidden = false;
        if (videoEmpty) videoEmpty.hidden = true;
      } else {
        previewVideo.hidden = true;
        previewVideo.removeAttribute("src");
        if (videoEmpty) videoEmpty.hidden = false;
        statusEl.textContent = "Vaizdo įrašo peržiūra laikinai nepasiekiama, tačiau failas bus išsaugotas.";
      }
    } else {
      setVideoSlotVisible(false);
    }
    scheduleStageFit(true);
  }

  async function loadProfileForEditing() {
    if (!editId) return;
    var loaded = await AtminimasApi.loadAtminimasBySlug(editId);
    var profile = loaded.atminimas || {};
    ["vardas", "pavarde", "gimimo_data", "mirties_data", "epitafija", "tekstas_200"].forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = profile[name] || "";
    });
    showExistingMedia(profile.media_json);
    setStoryBlocks(profile.story_blocks_json);
    applyLayout(profile.layout_json || {});
    var heading = document.getElementById("editor-panel-title");
    if (heading) heading.textContent = "Redaguokite puslapį";
    var submit = form.querySelector("button[type='submit']");
    if (submit) submit.textContent = "Išsaugoti pakeitimus";
    if (preorderLink) preorderLink.hidden = true;
    previewCode.textContent = "puslapis: " + editId;
    document.title = "Redaguoti atminimo puslapį - Atminimas";
  }

  function setCompletionItem(key, complete, pendingText) {
    var item = document.querySelector("[data-editor-check='" + key + "']");
    if (!item) return;
    item.classList.toggle("is-complete", complete);
    var marker = item.querySelector(":scope > span");
    var help = item.querySelector("small");
    if (marker) marker.textContent = complete ? "✓" : String(["person", "story", "design"].indexOf(key) + 1);
    if (help) help.textContent = complete ? "Paruošta" : pendingText;
  }

  function updateCompletionChecklist() {
    var hasPerson = !!String(form.elements.vardas.value || "").trim();
    var hasStory = storyBlocks.some(function (block) {
      return block.type === "text"
        ? !!String(block.text || "").trim()
        : block.type === "photo" && !!Number(block.photoOrder);
    });
    var hasDesign = !!(backgroundInput && normalizeHex(backgroundInput.value));
    setCompletionItem("person", hasPerson, "Įrašykite vardą");
    setCompletionItem("story", hasStory, "Pridėkite tekstą arba nuotrauką");
    setCompletionItem("design", hasDesign, "Pasirinkite foną");
    if (completionCountEl) {
      completionCountEl.textContent = [hasPerson, hasStory, hasDesign].filter(Boolean).length + " iš 3";
    }
  }

  function syncPreview() {
    ensureStoryBlocks(false);
    syncLegacyStoryText();
    var data = formData();
    var fullName = [data.vardas, data.pavarde].filter(Boolean).join(" ").trim();
    var dates = [data.gimimo_data, data.mirties_data].filter(Boolean).join(" - ");

    previewName.textContent = fullName || "Vardas Pavardė";
    previewDates.textContent = dates || "Gimimo data - Mirties data";
    previewText.textContent = data.epitafija || "Trumpa epitafija atsiras čia.";
    renderStoryPreview();
    captionSlots.forEach(function (caption, index) {
      var value = (data["photo_caption_" + (index + 1)] || "").trim();
      caption.textContent = value;
      caption.hidden = !value;
    });
    var background = data.fono_spalva || "#ffffff";
    setBackgroundColor(background, false);
    fitName();
    updateStoryWordCount();
    updateCompletionChecklist();
  }

  function fitName() {
    var size = 58;
    previewName.style.fontSize = size + "px";
    while (size > 16 && previewName.scrollWidth > previewName.clientWidth) {
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

  async function autoArrangeNewStoryPhotos(files, firstPhotoOrder) {
    var start = Math.max(1, Number(firstPhotoOrder) || 1);
    await Promise.all((files || []).map(async function (file, index) {
      var photoOrder = index + 1;
      if (!file || photoOrder < start) return;
      var block = storyBlocks.find(function (item) {
        return item.type === "photo" && Number(item.photoOrder) === photoOrder;
      });
      if (!block) return;
      var position = storyBlockPosition(block);
      var appearance = storyPhotoAppearance(block);
      var untouched = normalizeStoryPhotoAlign(block.align) === "full" &&
        appearance.widthPct === 100 && appearance.fit === "contain" &&
        position.offsetX === 0 && position.offsetY === 0;
      if (!untouched) return;
      try {
        var img = await imageFromFile(file);
        var ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
        if (ratio < 0.88) {
          block.align = photoOrder % 2 === 0 ? "right" : "left";
          block.widthPct = 48;
        } else if (ratio > 1.25) {
          block.align = "full";
          block.widthPct = 86;
        } else {
          block.align = "full";
          block.widthPct = 72;
        }
        block.fit = "contain";
      } catch (err) {
        console.warn("Automatic photo layout failed", err);
      }
    }));
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
    scheduleStageFit(true);
  }

  async function syncPhotos() {
    clearTimeout(draftSaveTimer);
    setDraftState("Nuotraukos ruošiamos…", "saving");
    photoPreparationFailed = false;
    photoDraftPersistenceFailed = false;
    var generation = ++photoProcessingGeneration;
    var allFiles = Array.prototype.slice.call(photosInput.files || []);
    var files = allFiles.slice(0, MAX_PHOTOS);
    var previousPhotoCount = storyPhotoCount();
    photoOrderMode = "files";
    photoOrderNames = files.map(function (file) { return file.name; });
    reconcileStoryPhotoBlocks(
      photoOrderNames.length,
      true,
      previousPhotoCount + 1
    );
    photosProcessing = true;
    processedPhotos = [];
    var localProcessedPhotos = new Array(files.length);
    photoSlots.forEach(function (slot) {
      var wrap = slot.closest(".editor-photo-slot");
      var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
      slot.hidden = true;
      slot.removeAttribute("src");
      if (empty) empty.hidden = false;
    });
    var localCropPromises = files.map(function (file, index) {
      return autoCropBlackBorders(file).catch(function (err) {
        console.warn("Photo optimization failed", err);
        return file;
      }).then(function (cropped) {
        localProcessedPhotos[index] = cropped;
        return cropped;
      });
    });
    renderPhotoFileList(files.map(function (file) { return file.name; }));
    updatePhotoDescriptionVisibility(photoOrderNames);
    renderPhotoOrder();
    statusEl.textContent = files.length ? "Nuotraukos optimizuojamos…" : "";
    await Promise.all(localCropPromises);
    if (generation !== photoProcessingGeneration) return;
    processedPhotos = localProcessedPhotos;
    await autoArrangeNewStoryPhotos(processedPhotos, previousPhotoCount + 1);
    if (generation !== photoProcessingGeneration) return;
    try {
      await persistProcessedPhotoOrder();
    } catch (err) {
      console.warn("Processed photo draft persistence failed", err);
      setDraftState("Nuotraukų juodraščio nepavyko išsaugoti", "error");
    }
    if (generation !== photoProcessingGeneration) return;
    photosProcessing = false;
    renderPhotoOrder();
    refreshOrderedPhotoPreviews();
    renderStoryBlockEditor();
    scheduleStageFit(true);
    if (!photoDraftPersistenceFailed) scheduleDraftSave();
    statusEl.textContent = allFiles.length > MAX_PHOTOS
      ? "Bus išsaugotos tik pirmos " + MAX_PHOTOS + " nuotraukos."
      : (files.length ? "Paruošta nuotraukų: " + files.length + ". Pradinis dydis ir vieta parinkti automatiškai – juos galite keisti iškart kortelėje." : "");
  }

  function pct(value, total) {
    return Math.max(0, Math.min(100, (value / total) * 100));
  }

  function layoutNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
  }

  function stageWidth() {
    return stage.getBoundingClientRect().width || 520;
  }

  function legacyTopToWidthPct(value) {
    var legacyTop = parseFloat(value || "0");
    return Number.isFinite(legacyTop) ? legacyTop * LEGACY_STAGE_HEIGHT_PCT / 100 : 0;
  }

  function pieceTopPct(piece) {
    var saved = parseFloat(piece.dataset.topPct || "");
    if (Number.isFinite(saved)) return saved;
    saved = legacyTopToWidthPct(piece.style.top);
    piece.dataset.topPct = String(layoutNumber(saved));
    return saved;
  }

  function topPctFromPx(value, width) {
    var percent = (value / Math.max(1, width || stageWidth())) * 100;
    return Math.max(0, Math.min(MAX_STAGE_HEIGHT_PCT - MAX_PIECE_HEIGHT_PCT - STAGE_BOTTOM_GAP_PCT, percent));
  }

  function setPieceTopPct(piece, topPct, width) {
    var next = Math.max(0, Math.min(MAX_STAGE_HEIGHT_PCT - MAX_PIECE_HEIGHT_PCT - STAGE_BOTTOM_GAP_PCT, Number(topPct) || 0));
    var basis = width || stageWidth();
    piece.dataset.topPct = String(layoutNumber(next));
    piece.style.top = Math.round(basis * next / 100) + "px";
  }

  function heightPxFromPct(heightPct) {
    var value = Number(heightPct);
    if (!Number.isFinite(value)) value = 20;
    return Math.max(24, Math.round(stageWidth() * value / 100));
  }

  function heightPctFromPx(value) {
    return Math.max(4, Math.min(MAX_PIECE_HEIGHT_PCT, (value / stageWidth()) * 100));
  }

  function setPieceHeightPct(piece, heightPct) {
    var value = Number(heightPct);
    if (!Number.isFinite(value)) value = 20;
    var next = Math.max(4, Math.min(MAX_PIECE_HEIGHT_PCT, value));
    piece.dataset.heightPct = String(layoutNumber(next));
    piece.style.height = heightPxFromPct(next) + "px";
  }

  function setStageHeightPct(heightPct, width) {
    var minimumHeightPct = stage.classList.contains("has-story-blocks")
      ? MIN_STORY_HEADER_HEIGHT_PCT
      : MIN_STAGE_HEIGHT_PCT;
    var next = Math.max(
      minimumHeightPct,
      Math.min(MAX_STAGE_HEIGHT_PCT, Number(heightPct) || minimumHeightPct)
    );
    var basis = width || stageWidth();
    stage.dataset.heightPct = String(layoutNumber(next));
    stage.style.height = Math.round(basis * next / 100) + "px";
    return next;
  }

  function pieceAffectsStageHeight(piece) {
    if (piece.classList.contains("editor-photo-slot")) {
      var image = piece.querySelector("img");
      return !!(image && !image.hidden && image.getAttribute("src"));
    }
    if (piece.classList.contains("editor-video-slot")) {
      var video = piece.querySelector("video");
      return !!(video && !video.hidden && video.getAttribute("src"));
    }
    return true;
  }

  function desiredStageHeightPct(forcedPiece) {
    var width = stageWidth();
    var stageRect = stage.getBoundingClientRect();
    var minimumHeightPct = stage.classList.contains("has-story-blocks")
      ? MIN_STORY_HEADER_HEIGHT_PCT
      : MIN_STAGE_HEIGHT_PCT;
    var bottom = 0;
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      if (piece !== forcedPiece && !pieceAffectsStageHeight(piece)) return;
      var pieceRect = piece.getBoundingClientRect();
      bottom = Math.max(
        bottom,
        pieceRect.width || pieceRect.height
          ? pieceRect.bottom - stageRect.top
          : piece.offsetTop + piece.offsetHeight
      );
      if (piece === previewLongText) {
        piece.querySelectorAll("[data-story-preview-index]").forEach(function (storyPiece) {
          bottom = Math.max(bottom, storyPiece.getBoundingClientRect().bottom - stageRect.top);
        });
      }
    });
    var desired = ((bottom + width * STAGE_BOTTOM_GAP_PCT / 100) / width) * 100;
    return Math.max(minimumHeightPct, Math.min(MAX_STAGE_HEIGHT_PCT, desired));
  }

  function fitStageToContent(allowShrink, forcedPiece) {
    if (stage.getBoundingClientRect().width < 1) {
      return parseFloat(stage.dataset.heightPct || "") || LEGACY_STAGE_HEIGHT_PCT;
    }
    var desired = desiredStageHeightPct(forcedPiece);
    var current = parseFloat(stage.dataset.heightPct || "") || LEGACY_STAGE_HEIGHT_PCT;
    if (!allowShrink) desired = Math.max(current, desired);
    return setStageHeightPct(desired);
  }

  function scheduleStageFit(allowShrink) {
    stageFitMayShrink = stageFitMayShrink || !!allowShrink;
    if (stageFitFrame !== null) return;
    stageFitFrame = window.requestAnimationFrame(function () {
      var mayShrink = stageFitMayShrink;
      stageFitFrame = null;
      stageFitMayShrink = false;
      fitStageToContent(mayShrink);
    });
  }

  function initializeResponsiveStage() {
    var width = stageWidth();
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      setPieceTopPct(piece, pieceTopPct(piece), width);
    });
    setStageHeightPct(LEGACY_STAGE_HEIGHT_PCT, width);
  }

  function refreshResponsiveStage(allowShrink) {
    var width = stageWidth();
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      setPieceTopPct(piece, pieceTopPct(piece), width);
      if (piece.dataset.heightPct) setPieceHeightPct(piece, parseFloat(piece.dataset.heightPct || "20"));
    });
    setStageHeightPct(parseFloat(stage.dataset.heightPct || "") || LEGACY_STAGE_HEIGHT_PCT, width);
    fitStageToContent(allowShrink !== false);
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

  function setAdvancedLayoutOpen(open, scrollToControls) {
    if (advancedLayoutEl) advancedLayoutEl.hidden = !open;
    if (advancedLayoutToggle) {
      advancedLayoutToggle.setAttribute("aria-expanded", String(open));
      advancedLayoutToggle.textContent = open ? "Baigti tikslų koregavimą" : "Tiksliai koreguoti išdėstymą";
    }
    stage.classList.toggle("is-simple-layout", !open);
    syncStoryPhotoInteractivity();
    if (!open) clearStoryPhotoSelection();
    if (open && scrollToControls && advancedLayoutEl) {
      advancedLayoutEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function setupAdvancedLayout() {
    stage.classList.add("is-simple-layout");
    setAdvancedLayoutOpen(false, false);
    if (!advancedLayoutToggle || !advancedLayoutEl) return;
    advancedLayoutToggle.addEventListener("click", function () {
      var open = advancedLayoutEl.hidden;
      setAdvancedLayoutOpen(open, open);
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

  function editorStepHistoryState(name, depth) {
    var state = Object.assign({}, window.history.state || {});
    state[EDITOR_STEP_HISTORY_KEY] = name;
    state[EDITOR_STEP_HISTORY_DEPTH_KEY] = Math.max(0, Number(depth) || 0);
    return state;
  }

  function updateEditorStepHistory(name, action) {
    if (!editorStepHistoryReady || !window.history || !window.history.pushState) return;
    var state = window.history.state || {};
    var depth = Math.max(0, Number(state[EDITOR_STEP_HISTORY_DEPTH_KEY]) || 0);
    if (action === "push") {
      window.history.pushState(editorStepHistoryState(name, depth + 1), "", window.location.href);
    } else if (action === "replace") {
      window.history.replaceState(editorStepHistoryState(name, depth), "", window.location.href);
    }
  }

  function initializeEditorStepHistory() {
    if (!window.history || !window.history.replaceState) return;
    window.history.replaceState(editorStepHistoryState(currentEditorStep, 0), "", window.location.href);
    editorStepHistoryReady = true;
    window.addEventListener("popstate", function (event) {
      var name = event.state && event.state[EDITOR_STEP_HISTORY_KEY];
      if (editorSteps.indexOf(name) >= 0) activateEditorStep(name, true);
    });
  }

  function activatePreviousEditorStep(name, scroll) {
    var state = window.history && window.history.state ? window.history.state : {};
    var depth = Math.max(0, Number(state[EDITOR_STEP_HISTORY_DEPTH_KEY]) || 0);
    if (
      editorStepHistoryReady &&
      depth > 0 &&
      state[EDITOR_STEP_HISTORY_KEY] === currentEditorStep
    ) {
      window.history.back();
      return;
    }
    activateEditorStep(name, scroll, "replace");
  }

  function activateEditorStep(name, scroll, historyAction) {
    var index = editorSteps.indexOf(name);
    if (index < 0) return;
    currentEditorStep = name;
    var target = document.querySelector("[data-editor-step='" + name + "']");
    if (name === "text" && storyBlocksLoaded) renderStoryBlockEditor();
    document.querySelectorAll("[data-editor-step]").forEach(function (step) {
      var active = step === target;
      step.classList.toggle("is-active", active);
      step.hidden = !active;
      step.setAttribute("aria-hidden", String(!active));
      if ("inert" in step) step.inert = !active;
    });
    document.querySelectorAll("[data-editor-section]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.editorSection === name);
    });
    document.querySelectorAll("[data-editor-step-button]").forEach(function (button) {
      var active = button.dataset.editorStepButton === name;
      var buttonIndex = editorSteps.indexOf(button.dataset.editorStepButton);
      button.classList.toggle("is-active", active);
      button.classList.toggle("is-complete", buttonIndex >= 0 && buttonIndex < index);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (stepProgressEl) stepProgressEl.style.width = ((index + 1) / editorSteps.length * 100) + "%";
    var stepLabel = editorStepLabels[name] || name;
    var stepStatus = (index + 1) + " žingsnis iš " + editorSteps.length + ": " + stepLabel;
    if (stepStatusEl) stepStatusEl.textContent = stepStatus;
    if (stepProgressTrackEl) {
      stepProgressTrackEl.setAttribute("aria-valuenow", String(index + 1));
      stepProgressTrackEl.setAttribute("aria-valuetext", stepStatus);
    }

    if (scroll && target) {
      var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var behavior = reducedMotion ? "auto" : "smooth";
      if (window.matchMedia("(max-width: 860px)").matches) {
        target.scrollIntoView({ behavior: behavior, block: "start" });
      } else {
        var panel = document.querySelector(".editor-panel");
        if (panel) panel.scrollTo({
          top: 0,
          behavior: behavior
        });
      }
      target.classList.remove("editor-section-flash");
      void target.offsetWidth;
      target.classList.add("editor-section-flash");
      var heading = target.querySelector("h2");
      if (heading) {
        window.requestAnimationFrame(function () {
          heading.focus({ preventScroll: true });
        });
      }
      saveDraftNow();
    }
    updateEditorStepHistory(name, historyAction);
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
        previous.setAttribute("aria-label", "Grįžti į žingsnį „" + editorStepLabels[editorSteps[index - 1]] + "“");
        previous.addEventListener("click", function () {
          activatePreviousEditorStep(editorSteps[index - 1], true);
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
        next.textContent = "Toliau: " + editorStepLabels[editorSteps[index + 1]];
        next.addEventListener("click", function () {
          if (!validateEditorStep(step.dataset.editorStep)) return;
          activateEditorStep(editorSteps[index + 1], true, "push");
        });
        actions.appendChild(next);
      }
      if (actions.childElementCount) step.appendChild(actions);
    });
  }

  function setupPreviewDialog() {
    var close = document.querySelector("[data-editor-preview-close]");
    var canvas = document.querySelector(".editor-canvas");
    var previewOpener = null;
    function openPreview(opener) {
      previewOpener = opener && opener.currentTarget ? opener.currentTarget : opener;
      document.body.classList.add("editor-preview-open");
      if (canvas) {
        canvas.scrollTop = 0;
        canvas.setAttribute("role", "dialog");
        canvas.setAttribute("aria-modal", "true");
      }
      if (close) close.focus();
      window.requestAnimationFrame(function () { refreshResponsiveStage(true); });
    }
    openPreviewDialog = openPreview;
    function closePreview() {
      document.body.classList.remove("editor-preview-open");
      clearStoryPhotoSelection();
      if (canvas) {
        canvas.removeAttribute("role");
        canvas.removeAttribute("aria-modal");
      }
      if (previewOpener && document.contains(previewOpener)) previewOpener.focus();
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
        var target = button.dataset.editorSection;
        var action = editorSteps.indexOf(target) > editorSteps.indexOf(currentEditorStep) ? "push" : "replace";
        activateEditorStep(target, true, action);
      });
    });
    var stepButtons = Array.from(document.querySelectorAll("[data-editor-step-button]"));
    stepButtons.forEach(function (button, buttonIndex) {
      button.addEventListener("click", function () {
        var target = button.dataset.editorStepButton;
        var action = editorSteps.indexOf(target) > editorSteps.indexOf(currentEditorStep) ? "push" : "replace";
        activateEditorStep(target, true, action);
      });
      button.addEventListener("keydown", function (event) {
        var targetIndex = buttonIndex;
        if (event.key === "ArrowRight") targetIndex = Math.min(stepButtons.length - 1, buttonIndex + 1);
        else if (event.key === "ArrowLeft") targetIndex = Math.max(0, buttonIndex - 1);
        else if (event.key === "Home") targetIndex = 0;
        else if (event.key === "End") targetIndex = stepButtons.length - 1;
        else return;
        event.preventDefault();
        stepButtons[targetIndex].focus();
      });
    });
    setupEditorStepActions();
    setupPreviewDialog();
    activateEditorStep(currentEditorStep, false);
    initializeEditorStepHistory();
  }

  function bindDrag() {
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      piece.addEventListener("pointerdown", function (event) {
        if (piece === previewLongText && stage.classList.contains("has-story-blocks")) return;
        if (event.target.closest("input, textarea, button, a")) return;
        if (event.target.closest(".editor-resize-handle, .editor-stretch-handle, .editor-crop-handle")) return;
        if (
          piece === previewLongText &&
          event.pointerType === "touch" &&
          window.matchMedia("(max-width: 860px)").matches
        ) return;
        if (piece.classList.contains("editor-photo-slot")) selectPiece(piece);
        event.preventDefault();
        piece.setPointerCapture(event.pointerId);
        var stageRect = stage.getBoundingClientRect();
        var pieceRect = piece.getBoundingClientRect();
        var offsetX = event.clientX - pieceRect.left;
        var offsetY = event.clientY - pieceRect.top;

        function move(moveEvent) {
          var left = pct(moveEvent.clientX - stageRect.left - offsetX, stageRect.width);
          piece.style.left = left + "%";
          setPieceTopPct(piece, topPctFromPx(moveEvent.clientY - stageRect.top - offsetY, stageRect.width), stageRect.width);
          fitStageToContent(false, piece);
        }

        function up() {
          fitStageToContent(true);
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
          if (fromTop) setPieceTopPct(piece, topPctFromPx(startTop + dy, stageRect.width), stageRect.width);
          fitStageToContent(false, piece);
        }

        function up() {
          fitStageToContent(true);
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
            if (fromTop) setPieceTopPct(piece, topPctFromPx(startTop + moveEvent.clientY - startY, stageRect.width), stageRect.width);
          }
          fitStageToContent(false, piece);
        }

        function up() {
          fitStageToContent(true);
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
    var canMeasureStage = stage.getBoundingClientRect().width >= 1;
    var layout = {
      __stage: {
        background: backgroundInput ? backgroundInput.value : "#ffffff",
        heightPct: canMeasureStage
          ? String(layoutNumber(parseFloat(stage.dataset.heightPct || "") || MIN_STAGE_HEIGHT_PCT))
          : "",
        layoutVersion: 2
      }
    };
    stage.querySelectorAll(".editor-piece").forEach(function (piece) {
      var img = piece.querySelector && piece.querySelector("img");
      var topPct = pieceTopPct(piece);
      layout[piece.dataset.piece] = {
        left: piece.style.left,
        top: String(layoutNumber(topPct / LEGACY_STAGE_HEIGHT_PCT * 100)) + "%",
        topPct: String(layoutNumber(topPct)),
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
    scheduleStageFit(false);
    scheduleDraftSave();
  });
  form.addEventListener("focusout", function () { scheduleStageFit(true); });
  window.addEventListener("resize", function () { refreshResponsiveStage(true); });
  photosInput.addEventListener("change", function () {
    photoSyncPromise = syncPhotos().catch(function (err) {
      photosProcessing = false;
      photoPreparationFailed = true;
      photoDraftPersistenceFailed = true;
      clearTimeout(draftSaveTimer);
      renderPhotoOrder();
      statusEl.textContent = "Nuotraukų paruošti nepavyko. Bandykite pasirinkti failus dar kartą.";
      setDraftState("Nuotraukų juodraščio nepavyko išsaugoti", "error");
      console.warn("Photo preparation failed", err);
    });
  });
  videoInput.addEventListener("change", function () {
    var file = videoInput.files && videoInput.files[0];
    var wrap = previewVideo.closest(".editor-video-slot");
    var empty = wrap ? wrap.querySelector(".editor-empty-photo") : null;
    if (!file) {
      savedVideoFile = null;
      previewVideo.hidden = true;
      previewVideo.removeAttribute("src");
      setVideoSlotVisible(false);
      if (empty) empty.hidden = false;
      statusEl.textContent = "";
      queueAuxiliaryMediaPersistence("video", null);
      scheduleStageFit(true);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      videoInput.value = "";
      savedVideoFile = null;
      previewVideo.hidden = true;
      previewVideo.removeAttribute("src");
      setVideoSlotVisible(false);
      if (empty) empty.hidden = false;
      statusEl.textContent = "Vaizdo įrašas per didelis. Pasirinkite ne didesnį kaip 50 MB failą.";
      queueAuxiliaryMediaPersistence("video", null);
      scheduleStageFit(true);
      return;
    }
    savedVideoFile = file;
    previewVideo.src = URL.createObjectURL(file);
    previewVideo.hidden = false;
    setVideoSlotVisible(true);
    if (empty) empty.hidden = true;
    statusEl.textContent = "Video pasirinktas: " + file.name;
    queueAuxiliaryMediaPersistence("video", file);
    scheduleStageFit(true);
  });
  captionsInput.addEventListener("change", function () {
    var file = captionsInput.files && captionsInput.files[0];
    savedCaptionsFile = file || null;
    if (file) {
      statusEl.textContent = "Subtitrai pasirinkti: " + file.name;
      queueAuxiliaryMediaPersistence("captions", file);
    } else {
      queueAuxiliaryMediaPersistence("captions", null);
    }
  });

  if (clearDraftButton) {
    clearDraftButton.addEventListener("click", function () {
      if (!window.confirm("Pradėti iš naujo? Dabartinis tekstas, nuotraukos ir kiti šio juodraščio pakeitimai bus pašalinti iš šio įrenginio.")) {
        return;
      }
      clearDraft().catch(function (err) {
        console.warn(err);
        statusEl.textContent = "Nepavyko išvalyti juodraščio.";
      });
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!validateDatePickers(false)) {
      activateEditorStep("text", true, "replace");
      window.setTimeout(function () {
        validateDatePickers(true);
      }, 0);
      return;
    }
    var signedIn = isSignedIn();
    var invalid = Array.from(form.querySelectorAll("input, textarea, select")).find(function (field) {
      if (!signedIn && field.type === "checkbox") return false;
      return !field.checkValidity();
    });
    if (invalid) {
      var invalidStep = invalid.closest("[data-editor-step]");
      if (invalidStep) activateEditorStep(invalidStep.dataset.editorStep, true, "replace");
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    if (!signedIn) {
      submitButton.disabled = true;
      statusEl.textContent = "Išsaugome juodraštį prieš prisijungimą…";
      try {
        await persistDraftBeforeLogin();
        setDraftState("Juodraštis paruoštas tęsti po prisijungimo", "saved");
        redirectToLoginForSave();
      } catch (err) {
        console.error(err);
        statusEl.textContent = err.message || "Juodraščio nepavyko paruošti prisijungimui.";
        setDraftState("Juodraščio nepavyko išsaugoti", "error");
      } finally {
        submitButton.disabled = false;
      }
      return;
    }
    var videoForSubmission = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;
    if (videoForSubmission && videoForSubmission.size > MAX_VIDEO_BYTES) {
      activateEditorStep("colors", true, "replace");
      var additionalSettings = document.querySelector(".editor-additional-settings");
      if (additionalSettings) additionalSettings.open = true;
      statusEl.textContent = "Vaizdo įrašas per didelis. Pasirinkite ne didesnį kaip 50 MB failą.";
      videoInput.focus();
      return;
    }
    if (window.AtminimasAuth && AtminimasAuth.ensureFreshSession) {
      submitButton.disabled = true;
      statusEl.textContent = "Tikrinamas prisijungimas…";
      try {
        var freshSession = await AtminimasAuth.ensureFreshSession();
        if (!freshSession) throw new Error("Prisijungimo sesija baigėsi.");
      } catch (sessionError) {
        statusEl.textContent = "Prisijungimo sesija baigėsi. Išsaugome juodraštį ir perkeliame prisijungti…";
        try {
          await persistDraftBeforeLogin();
          setDraftState("Juodraštis paruoštas tęsti po prisijungimo", "saved");
          if (AtminimasAuth.signOut) AtminimasAuth.signOut();
          redirectToLoginForSave();
        } catch (draftError) {
          console.error(draftError);
          statusEl.textContent = draftError.message || "Juodraščio nepavyko paruošti prisijungimui.";
          submitButton.textContent = "Prisijungti ir išsaugoti puslapį";
          submitButton.disabled = false;
        }
        return;
      }
    }
    fitStageToContent(true);
    var submit = submitButton;
    var data = formData();
    showSaveProgress(10, "Ruošiamos nuotraukos…");
    submit.disabled = true;
    resultBox.hidden = true;
    await photoSyncPromise;
    if (photoPreparationFailed) {
      submit.disabled = false;
      statusEl.textContent = "Nuotraukų paruošti nepavyko. Pasirinkite jas dar kartą.";
      return;
    }
    if (prototypeRequested && !isAdminPrototype) {
      statusEl.textContent = "Nemokamą prototipą gali kurti tik prisijungęs administratorius.";
      return;
    }
    await waitForAuxiliaryMediaPersistence(false);
    var photos = processedPhotos.filter(Boolean).slice(0, MAX_PHOTOS);
    var video = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : savedVideoFile;

    limitStoryBlocksToWords();
    data.tekstas_200 = syncLegacyStoryText();
    data.apmoketa = false;
    data.product_type = productType;

    showSaveProgress(28, "Įkeliami failai ir saugomas puslapis…");
    submit.disabled = true;
    resultBox.hidden = true;

    try {
      var captions = (captionsInput.files && captionsInput.files[0]) ? captionsInput.files[0] : savedCaptionsFile;
      function onUploadProgress(done, total) {
        var fraction = total ? done / total : 1;
        showSaveProgress(28 + fraction * 58, total ? "Įkeliami failai: " + done + " iš " + total + "…" : "Saugomas puslapis…");
      }
      var result = editId
        ? await AtminimasApi.updateAtminimas(editId, data, {
            existingMedia: editingMedia,
             files: { photos: photos, video: video, captions: captions },
             layout: collectLayout(),
             storyBlocks: collectStoryBlocks(true),
             onProgress: onUploadProgress
          })
        : await AtminimasApi.createAtminimas(data, {
             files: { photos: photos, video: video, captions: captions },
             layout: collectLayout(),
             storyBlocks: collectStoryBlocks(true),
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
        preorderLink.hidden = true;
        clientLink.href = "vartotojas.html";
        clientLink.textContent = "Grįžti į kliento zoną";
        qrLink.hidden = true;
        orderCode.textContent = "QR kodą atsisiųskite kliento zonoje, kai puslapis rodomas viešai.";
        var resultHeading = resultBox.querySelector("h3");
        if (resultHeading) resultHeading.textContent = "Pakeitimai išsaugoti";
        resultBox.hidden = false;
        showSaveProgress(100, "Pakeitimai išsaugoti.");
        setDraftState("Visi pakeitimai išsaugoti", "saved");
        return;
      }
      if (isAdminPrototype) {
        var prototype = await AtminimasApi.publishAdminPrototype(result.identifier);
        var prototypePageUrl = prototype.page_url ||
          ("sablonas-viskas.html?slug=" + encodeURIComponent(result.identifier));
        await discardCurrentDraft();
        statusEl.textContent = "Viešas administratoriaus prototipas ir QR sukurti be mokėjimo.";
        previewCode.textContent = "Prototipas paskelbtas";
        openLink.href = prototypePageUrl;
        openLink.textContent = "Atidaryti viešą prototipą";
        preorderLink.hidden = true;
        clientLink.href = "admin.html";
        clientLink.textContent = "Grįžti į administravimą";
        qrLink.href = prototype.qr_url || AtminimasApi.qrImageUrl(
          new URL(prototypePageUrl, window.location.href).href
        );
        qrLink.hidden = false;
        orderCode.textContent = "Administratoriaus prototipas – užsakymo ir mokėjimo nereikia.";
        var prototypeHeading = resultBox.querySelector("h3");
        if (prototypeHeading) prototypeHeading.textContent = "Viešas prototipas sukurtas";
        resultBox.hidden = false;
        showSaveProgress(100, "Prototipas ir QR sukurti.");
        setDraftState("Prototipas paskelbtas", "saved");
        return;
      }
      var pageUrl = "sablonas-viskas.html?slug=" + encodeURIComponent(result.identifier);
      var clientUrl = "vartotojas.html";
      await discardCurrentDraft();
      var digitalOnly = productType === "digital";
      statusEl.textContent = digitalOnly
        ? "Puslapis išsaugotas kaip privatus. Kliento zonoje paskelbkite jį ir atsisiųskite QR kodą."
        : "Puslapis išsaugotas kaip privatus. Išankstinį užsakymą galite pateikti atskirai – mokėti nereikės.";
      previewCode.textContent = "Puslapis paruoštas";
      openLink.href = pageUrl;
      preorderLink.hidden = digitalOnly;
      if (!digitalOnly) preorderLink.href = "isankstinis-uzsakymas.html?product=" + encodeURIComponent(productType);
      clientLink.href = clientUrl;
      clientLink.textContent = digitalOnly ? "Paskelbti ir gauti QR" : "Kliento zona";
      qrLink.hidden = true;
      orderCode.textContent = "Pirmiausia kliento zonoje paskelbkite puslapį. Tada galėsite atsisiųsti veikiantį QR kodą.";
      var savedHeading = resultBox.querySelector("h3");
      if (savedHeading && digitalOnly) savedHeading.textContent = "Skaitmeninis puslapis išsaugotas";
      resultBox.hidden = false;
      showSaveProgress(100, "Puslapis išsaugotas.");
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
    if (prototypeRequested && !isSignedIn()) {
      statusEl.textContent = "Prisijunkite administratoriaus paskyra, tada grįšite kurti prototipo.";
      submitButton.disabled = true;
      setTimeout(function () {
        window.location.href = "prisijungti.html?next=" +
          encodeURIComponent("redaktorius.html?prototype=1");
      }, 900);
      return;
    }
    if (prototypeRequested) {
      isAdminPrototype = !!(window.AtminimasAuth && await AtminimasAuth.isAdmin());
      if (!isAdminPrototype) {
        statusEl.textContent = "Ši paskyra neturi administratoriaus teisių kurti nemokamą prototipą.";
        submitButton.disabled = true;
        return;
      }
      if (productUnavailable) productUnavailable.hidden = true;
      if (prototypeNotice) prototypeNotice.hidden = false;
      if (accountNoteEl) accountNoteEl.hidden = true;
      if (productSummary) {
        productSummary.textContent = "Administratoriaus prototipas – produktas, pristatymas ir mokėjimas nekuriami.";
      }
      submitButton.disabled = false;
      document.body.classList.add("editor-prototype-mode");
    }
    if (editId && !isSignedIn()) {
      statusEl.textContent = "Prisijunkite kliento zonoje, tada grįžkite redaguoti puslapio.";
      submitButton.disabled = true;
      setTimeout(function () {
        var next = "redaktorius.html?edit=" + encodeURIComponent(editId);
        window.location.href = "prisijungti.html?next=" + encodeURIComponent(next);
      }, 900);
      return;
    }
    if (isAdminPrototype) {
      submitButton.textContent = "Sukurti nemokamą prototipą ir QR";
    } else if (editId) {
      if (accountNoteEl) accountNoteEl.hidden = true;
      submitButton.textContent = "Išsaugoti pakeitimus";
    } else if (isSignedIn()) {
      if (accountNoteEl) accountNoteEl.hidden = true;
      submitButton.textContent = "Išsaugoti privatų puslapį";
    } else {
      submitButton.textContent = "Prisijungti ir išsaugoti puslapį";
    }
    initializeResponsiveStage();
    setupDatePickers();
    await loadProfileForEditing();
    syncDatePickersFromHidden();
    var restoredDraft = await restoreDraft();
    syncDatePickersFromHidden();
    if (!editId && resumeSave && isSignedIn()) {
      currentEditorStep = "preview";
      statusEl.textContent = restoredDraft
        ? "Prisijungėte. Juodraštis atkurtas – patikrinkite sąlygas ir išsaugokite puslapį."
        : "Prisijungėte, tačiau šiame įrenginyje juodraštis nerastas. Užpildykite ir išsaugokite puslapį.";
      if (accountNoteEl) {
        accountNoteEl.hidden = false;
        accountNoteEl.textContent = "Prisijungimas patvirtintas. Prieš išsaugodami dar kartą patikrinkite puslapį ir pažymėkite privalomus patvirtinimus.";
      }
    }
    ensureStoryBlocks(true);
    setupStoryBuilder();
    setupStoryPhotoTools();
    renderStoryBlockEditor();
    setupColorPicker();
    syncPreview();
    refreshResponsiveStage(true);
    setupTransformModeButtons();
    setupAdvancedLayout();
    setupEditorSectionButtons();
    bindDrag();
    bindResize();
    bindStretch();
    bindCrop();
    setupEditorHistory();
  }

  initEditor();
})();


