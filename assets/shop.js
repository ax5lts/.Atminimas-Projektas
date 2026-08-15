(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var products = {
    metal: {
      kind: "Patvari plieno lentelė",
      title: "Graviruota plieno QR atminimo lentelė",
      image: "assets/qr-plienas-480.webp",
      imageSet: "assets/qr-plienas-480.webp 480w, assets/qr-plienas.webp 1086w",
      alt: "Graviruota plieno QR atminimo lentelė",
      price: business.price || "Kaina tikslinama",
      vat: business.priceVat || "Bus patvirtinta pasiūlyme",
      copy: "Patvari graviruota plieno lentelė su QR kodu nukreipia į asmeninį atminimo puslapį su nuotraukomis, vaizdo įrašu, gyvenimo datomis ir epitafija.",
      type: "Graviruota plieno QR atminimo lentelė",
      material: business.material || "Plienas",
      dimensions: business.dimensions || "Bus patvirtinta pasiūlyme",
      mounting: business.mounting || "Bus patvirtinta pasiūlyme",
      safety: business.safetyWarnings || "Bus patvirtinta pasiūlyme"
    },
    asa: {
      kind: "3D spausdintas variantas",
      title: "ASA 3D spausdinta QR atminimo lentelė",
      image: "assets/qr-asa-480.webp",
      imageSet: "assets/qr-asa-480.webp 480w, assets/qr-asa.webp 1086w",
      alt: "ASA 3D spausdinta QR atminimo lentelė",
      price: "Kaina tikslinama",
      vat: business.priceVat || "Bus patvirtinta pasiūlyme",
      copy: "Dvispalvė 3D spausdinta QR atminimo lentelė iš lauko sąlygoms tinkamo ASA plastiko nukreipia į asmeninį atminimo puslapį.",
      type: "ASA 3D spausdinta QR atminimo lentelė",
      material: "Dviejų spalvų ASA plastikas",
      dimensions: "Bus patvirtinta pasiūlyme",
      mounting: "Bus patvirtinta pasiūlyme",
      safety: "Bus patvirtinta pasiūlyme"
    }
  };

  var fields = {
    kind: document.getElementById("product-kind"),
    title: document.getElementById("product-title"),
    image: document.getElementById("product-image"),
    price: document.getElementById("product-price"),
    vat: document.getElementById("product-vat"),
    copy: document.getElementById("product-copy"),
    type: document.getElementById("product-type-detail"),
    material: document.getElementById("product-material"),
    dimensions: document.getElementById("product-dimensions"),
    mounting: document.getElementById("product-mounting"),
    safety: document.getElementById("product-safety")
  };
  var createLink = document.getElementById("product-create-link");
  var summaryPrice = document.getElementById("product-summary-price");
  var metalPrice = document.querySelector("[data-metal-price]");
  var asaPrice = document.querySelector("[data-asa-price]");
  var catalogStatus = document.getElementById("shop-catalog-status");
  var catalogMessage = document.getElementById("shop-catalog-message");
  var catalogRetry = document.getElementById("shop-catalog-retry");

  function normalizeType(type) {
    return window.AtminimasProductCatalog
      ? AtminimasProductCatalog.normalizeType(type)
      : (type === "asa" ? "asa" : "metal");
  }

  function selectProduct(type) {
    var safeType = normalizeType(type);
    var product = products[safeType];
    fields.kind.textContent = product.kind;
    fields.title.textContent = product.title;
    fields.image.src = product.image;
    fields.image.srcset = product.imageSet;
    fields.image.alt = product.alt;
    fields.price.textContent = product.price;
    fields.vat.textContent = product.vat;
    fields.copy.textContent = product.copy;
    fields.type.textContent = product.type;
    fields.material.textContent = product.material;
    fields.dimensions.textContent = product.dimensions;
    fields.mounting.textContent = product.mounting;
    fields.safety.textContent = product.safety;
    createLink.href = "isankstinis-uzsakymas.html?product=" + encodeURIComponent(safeType);
    createLink.textContent = "Išankstinis užsakymas";
    summaryPrice.textContent = product.price;
    sessionStorage.setItem(selectedKey, safeType);
  }

  function setCatalogStatus(message, canRetry) {
    catalogMessage.textContent = message || "";
    catalogStatus.hidden = !message;
    catalogRetry.hidden = !message || !canRetry;
  }

  function updateCatalogPrices(catalog) {
    ["metal", "asa"].forEach(function (type) {
      var item = catalog[type];
      if (item && item.price_cents != null) {
        products[type].price = AtminimasProductCatalog.formatPrice(item.price_cents, item.currency);
      }
    });
    metalPrice.textContent = products.metal.price;
    asaPrice.textContent = products.asa.price;
    asaPrice.classList.toggle("product-choice__price--status", products.asa.price === "Kaina tikslinama");
  }

  function applyInitialSelection() {
    var requested = new URLSearchParams(window.location.search).get("product");
    var stored = sessionStorage.getItem(selectedKey);
    var initial = normalizeType(requested || stored || "metal");
    var input = selector.querySelector("input[value='" + initial + "']");
    if (input) input.checked = true;
    selectProduct(initial);
  }

  async function loadCatalog() {
    catalogRetry.disabled = true;
    selector.setAttribute("aria-busy", "true");
    setCatalogStatus("Tikrinamos orientacinės kainos…", false);
    try {
      var catalog = await AtminimasProductCatalog.load();
      updateCatalogPrices(catalog);
      if (!catalog.remote) {
        setCatalogStatus("Kainų patikrinti nepavyko. Išankstinį užsakymą vis tiek galite pateikti be mokėjimo.", true);
      } else {
        setCatalogStatus("", false);
      }
      applyInitialSelection();
    } finally {
      selector.removeAttribute("aria-busy");
      catalogRetry.disabled = false;
    }
  }

  selector.addEventListener("change", function (event) {
    if (event.target.name === "product_type") selectProduct(event.target.value);
  });
  catalogRetry.addEventListener("click", function () {
    if (window.AtminimasProductCatalog) loadCatalog();
    else window.location.reload();
  });

  metalPrice.textContent = products.metal.price;
  asaPrice.textContent = products.asa.price;
  selectProduct("metal");
  if (!window.AtminimasProductCatalog) {
    setCatalogStatus("Kainų patikra nepasiekiama. Išankstinį užsakymą vis tiek galite pateikti be mokėjimo.", true);
    applyInitialSelection();
    return;
  }
  loadCatalog();
})();
