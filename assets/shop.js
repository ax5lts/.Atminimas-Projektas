(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var availability = { metal: true, asa: false };
  var products = {
    metal: {
      kind: "Patvari plieno lentelė",
      title: "Graviruota plieno QR atminimo lentelė",
      image: "assets/qr-plienas-480.webp",
      imageSet: "assets/qr-plienas-480.webp 480w, assets/qr-plienas.webp 1086w",
      alt: "Graviruota plieno QR atminimo lentelė",
      price: business.price || "–",
      vat: business.priceVat || "–",
      copy: "Patvari graviruota plieno lentelė su QR kodu nukreipia į asmeninį atminimo puslapį su nuotraukomis, vaizdo įrašu, gyvenimo datomis ir epitafija.",
      type: "Graviruota plieno QR atminimo lentelė",
      material: business.material || "Plienas",
      dimensions: business.dimensions || "–",
      mounting: business.mounting || "–",
      safety: business.safetyWarnings || "–"
    },
    asa: {
      kind: "3D spausdintas variantas",
      title: "ASA 3D spausdinta QR atminimo lentelė",
      image: "assets/qr-asa-480.webp",
      imageSet: "assets/qr-asa-480.webp 480w, assets/qr-asa.webp 1086w",
      alt: "ASA 3D spausdinta QR atminimo lentelė",
      price: "–",
      vat: business.priceVat || "–",
      copy: "Dvispalvė 3D spausdinta QR atminimo lentelė iš lauko sąlygoms tinkamo ASA plastiko nukreipia į asmeninį atminimo puslapį.",
      type: "ASA 3D spausdinta QR atminimo lentelė",
      material: "Dviejų spalvų ASA plastikas",
      dimensions: "–",
      mounting: "–",
      safety: "–"
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
  var metalPrice = document.querySelector("[data-metal-price]");
  var asaPrice = document.querySelector("[data-asa-price]");
  var asaChoice = document.querySelector("[data-product-choice='asa']");
  var asaInput = selector.querySelector("input[value='asa']");
  var asaAvailability = document.querySelector("[data-product-availability='asa']");
  var asaDescription = document.querySelector("[data-asa-description]");
  var headingCopy = document.getElementById("shop-heading-copy");
  if (metalPrice) metalPrice.textContent = products.metal.price;

  function normalizeType(type) {
    return window.AtminimasProductCatalog
      ? AtminimasProductCatalog.normalizeType(type)
      : (type === "asa" ? "asa" : "metal");
  }

  function selectProduct(type) {
    var safeType = normalizeType(type);
    if (!availability[safeType]) safeType = "metal";
    if (!availability[safeType]) return;

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
    createLink.href = "redaktorius.html?product=" + encodeURIComponent(safeType);
    sessionStorage.setItem(selectedKey, safeType);
  }

  function setAsaAvailability(catalogItem) {
    var isAvailable = !!(catalogItem && catalogItem.available);
    availability.asa = isAvailable;
    asaInput.disabled = !isAvailable;
    asaChoice.classList.toggle("product-choice--unavailable", !isAvailable);
    if (isAvailable) {
      asaChoice.removeAttribute("aria-disabled");
      asaAvailability.textContent = "Galima užsakyti";
      asaAvailability.classList.remove("product-availability--unavailable");
      asaAvailability.classList.add("product-availability--available");
      products.asa.price = AtminimasProductCatalog.formatPrice(catalogItem.price_cents, catalogItem.currency);
      asaPrice.textContent = products.asa.price;
      asaPrice.classList.remove("product-choice__price--status");
      asaDescription.textContent = "Dvispalvis, lauko sąlygoms pritaikytas variantas, kurį jau galima užsakyti.";
      headingCopy.textContent = "Graviruota plieno ir ASA 3D spausdinta lentelė nukreipia į individualų atminimo puslapį.";
    } else {
      asaChoice.setAttribute("aria-disabled", "true");
      asaAvailability.textContent = "Šiuo metu neturime";
      asaAvailability.classList.add("product-availability--unavailable");
      asaAvailability.classList.remove("product-availability--available");
      asaPrice.textContent = "Kol kas neparduodama";
      asaPrice.classList.add("product-choice__price--status");
      asaDescription.textContent = "Dvispalvis, lauko sąlygoms pritaikytas variantas. Užsakyti bus galima, kai patvirtinsime, kad jį turime.";
      headingCopy.textContent = "Graviruota plieno lentelė nukreipia į individualų atminimo puslapį. ASA 3D variantą taip pat rodome, tačiau kol kas jo neturime.";
    }
  }

  function applyInitialSelection() {
    var requested = new URLSearchParams(window.location.search).get("product");
    var stored = sessionStorage.getItem(selectedKey);
    var initial = normalizeType(requested || stored || "metal");
    if (!availability[initial]) initial = "metal";
    var initialInput = selector.querySelector("input[value='" + initial + "']:not(:disabled)");
    if (initialInput) initialInput.checked = true;
    selectProduct(initial);
  }

  selector.addEventListener("change", function (event) {
    if (event.target.name === "product_type" && !event.target.disabled) selectProduct(event.target.value);
  });

  selectProduct("metal");
  if (!window.AtminimasProductCatalog) {
    applyInitialSelection();
    return;
  }

  AtminimasProductCatalog.load().then(function (catalog) {
    if (catalog.metal && catalog.metal.available && catalog.metal.price_cents != null) {
      products.metal.price = AtminimasProductCatalog.formatPrice(catalog.metal.price_cents, catalog.metal.currency);
      if (metalPrice) metalPrice.textContent = products.metal.price;
    }
    setAsaAvailability(catalog.asa);
    applyInitialSelection();
  });
})();
