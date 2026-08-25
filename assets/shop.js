(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var products = {
    metal: {
      kind: "Plieninis variantas",
      title: "Plieninė QR lentelė",
      image: "assets/qr-plienas-480.webp",
      imageSet: "assets/qr-plienas-480.webp 480w, assets/qr-plienas.webp 1086w",
      alt: "Graviruota plieno QR atminimo lentelė",
      price: business.price || "Kaina tikslinama",
      copy: "QR kodas atidaro asmeninį atminimo puslapį.",
      material: "Plienas",
      dimensions: "5 × 5 cm",
      mounting: "Klijais"
    },
    asa: {
      kind: "3D spausdintas variantas",
      title: "3D spausdinta QR lentelė",
      image: "assets/qr-asa-480.webp",
      imageSet: "assets/qr-asa-480.webp 480w, assets/qr-asa.webp 1086w",
      alt: "ASA 3D spausdinta QR atminimo lentelė",
      price: "Kaina tikslinama",
      copy: "QR kodas atidaro asmeninį atminimo puslapį.",
      material: "ASA plastikas",
      dimensions: "5 × 5 cm",
      mounting: "Klijais"
    }
  };

  var fields = {
    kind: document.getElementById("product-kind"),
    title: document.getElementById("product-title"),
    image: document.getElementById("product-image"),
    price: document.getElementById("product-price"),
    copy: document.getElementById("product-copy"),
    material: document.getElementById("product-material"),
    dimensions: document.getElementById("product-dimensions"),
    mounting: document.getElementById("product-mounting")
  };
  var createLink = document.getElementById("product-create-link");
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
    fields.copy.textContent = product.copy;
    fields.material.textContent = product.material;
    fields.dimensions.textContent = product.dimensions;
    fields.mounting.textContent = product.mounting;
    createLink.href = "isankstinis-uzsakymas.html?product=" + encodeURIComponent(safeType);
    createLink.textContent = "PREORDER";
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
