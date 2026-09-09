(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var products = {
    metal: {
      kind: "Plieninis variantas",
      title: "Plieninė QR lentelė",
      price: business.price || "Kaina tikslinama", available: false,
      copy: "QR kodas atidaro asmeninį atminimo puslapį.",
      material: "Plienas",
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
  var designApi = window.AtminimasPlaqueDesign;
  var selectedDesign = designApi.read();
  var catalogItem = { price_cents: 6000, plain_price_cents: 5000, currency: "EUR" };
  var catalogStatus = document.getElementById("shop-catalog-status");
  var catalogMessage = document.getElementById("shop-catalog-message");
  var catalogRetry = document.getElementById("shop-catalog-retry");
  var selectedType = "metal";
  var catalogLoading = false;

  function normalizeType() { return "metal"; }

  function selectProduct(type) {
    var safeType = normalizeType(type);
    selectedType = safeType;
    var product = products[safeType];
    var priceCents = selectedDesign.pattern === "plain" ? catalogItem.plain_price_cents : catalogItem.price_cents;
    var priceFormat = new Intl.NumberFormat("lt-LT", { style: "currency", currency: catalogItem.currency });
    product.price = priceFormat.format(priceCents / 100);
    document.getElementById("product-total").textContent = priceFormat.format((priceCents + 300) / 100);
    document.getElementById("shop-payment-price").textContent = product.price + " + 3 € pristatymas";
    fields.kind.textContent = product.kind;
    fields.title.textContent = product.title;
    renderDesign();
    fields.price.textContent = product.price;
    fields.copy.textContent = product.copy;
    fields.material.textContent = product.material;
    fields.dimensions.textContent = product.dimensions;
    fields.mounting.textContent = product.mounting;
    createLink.href = "redaktorius.html?product=" + encodeURIComponent(safeType) + "&" + designApi.query(selectedDesign);
    createLink.textContent = product.available ? "Kurti puslapį ir užsakyti · " + product.price : "Kaina tikrinama";
    createLink.setAttribute("aria-disabled", product.available ? "false" : "true");
    try { sessionStorage.setItem(selectedKey, safeType); } catch (_error) {}
  }

  function renderDesign() {
    designApi.save(selectedDesign);
    designApi.render(fields.image, selectedDesign);
    document.getElementById("product-selection").textContent = designApi.label(selectedDesign);
    document.getElementById("product-preview-caption").textContent = designApi.label(selectedDesign);
    selector.querySelectorAll("[data-pattern-preview]").forEach(function (preview) {
      designApi.render(preview, { color: selectedDesign.color, pattern: preview.dataset.patternPreview });
    });
    selector.querySelectorAll("input[name='plaque_color']").forEach(function (input) { input.checked = input.value === selectedDesign.color; });
    selector.querySelectorAll("input[name='plaque_pattern']").forEach(function (input) { input.checked = input.value === selectedDesign.pattern; });
  }

  function setCatalogStatus(message, canRetry) {
    catalogMessage.textContent = message || "";
    catalogStatus.hidden = !message;
    catalogRetry.hidden = !message || !canRetry;
  }

  function updateCatalogPrices(catalog) {
    ["metal"].forEach(function (type) {
      var item = catalog[type];
      products[type].available = !!(catalog.remote && item && item.available && Number.isInteger(item.price_cents) && item.price_cents > 0);
      if (item && item.price_cents != null) {
        catalogItem = item;
        products[type].price = AtminimasProductCatalog.formatPrice(item.price_cents, item.currency);
      }
    });
    if (metalPrice) metalPrice.textContent = products.metal.price;
  }

  function applyInitialSelection() {
    var requested = new URLSearchParams(window.location.search).get("product");
    var stored = "";
    try { stored = sessionStorage.getItem(selectedKey) || ""; } catch (_error) {}
    var initial = normalizeType(requested || stored || "metal");
    var input = selector.querySelector("input[value='" + initial + "']");
    if (input) input.checked = true;
    selectProduct(initial);
  }

  async function loadCatalog() {
    if (catalogLoading) return;
    catalogLoading = true;
    catalogRetry.disabled = true;
    selector.setAttribute("aria-busy", "true");
    setCatalogStatus("Tikrinamos kainos ir prieinamumas…", false);
    try {
      var catalog = await AtminimasProductCatalog.load();
      updateCatalogPrices(catalog);
      if (!catalog.remote) {
        setCatalogStatus(catalog.error || "Kainų patikrinti nepavyko. Atnaujinkite kainas prieš tęsdami užsakymą.", true);
      } else {
        setCatalogStatus("", false);
      }
      selectProduct(selectedType);
    } catch (_error) {
      setCatalogStatus("Kainų patikrinti nepavyko. Atnaujinkite kainas prieš tęsdami užsakymą.", true);
    } finally {
      catalogLoading = false;
      selector.removeAttribute("aria-busy");
      catalogRetry.disabled = false;
    }
  }

  createLink.addEventListener("click", function (event) { if (!products[selectedType].available) event.preventDefault(); });

  selector.addEventListener("change", function (event) {
    if (event.target.name === "plaque_color" || event.target.name === "plaque_pattern") {
      selectedDesign[event.target.name === "plaque_color" ? "color" : "pattern"] = event.target.value;
      selectedDesign = designApi.normalize(selectedDesign);
      selectProduct("metal");
      if (window.history && window.history.replaceState) {
        var params = new URLSearchParams(window.location.search);
        params.set("product", "metal");
        params.set("color", selectedDesign.color);
        params.set("pattern", selectedDesign.pattern);
        window.history.replaceState(window.history.state, "", window.location.pathname + "?" + params.toString());
      }
    }
  });
  catalogRetry.addEventListener("click", function () {
    if (window.AtminimasProductCatalog) loadCatalog();
    else window.location.reload();
  });

  if (metalPrice) metalPrice.textContent = products.metal.price;
  applyInitialSelection();
  if (!window.AtminimasProductCatalog) {
    setCatalogStatus("Kainų patikra nepasiekiama. Pabandykite atnaujinti puslapį.", true);
    return;
  }
  loadCatalog();
})();
