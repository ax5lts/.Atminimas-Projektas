(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var products = {
    metal: {
      kind: "Patvari metalo lentelė",
      title: "Graviruota QR atminimo lentelė",
      image: "assets/qr-atminimo-lentele-480.webp",
      imageSet: "assets/qr-atminimo-lentele-480.webp 480w, assets/qr-atminimo-lentele.webp 1086w",
      alt: "Graviruota metalo QR atminimo lentelė",
      price: business.price || "–",
      vat: business.priceVat || "–",
      copy: "Patvari graviruota lentelė su QR kodu nukreipia į asmeninį atminimo puslapį su nuotraukomis, vaizdo įrašu, gyvenimo datomis ir epitafija.",
      type: "Graviruota metalo QR atminimo lentelė",
      material: business.material || "–",
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
      vat: "–",
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
  if (metalPrice) metalPrice.textContent = products.metal.price;

  function selectProduct(type) {
    var safeType = products[type] ? type : "metal";
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

  selector.addEventListener("change", function (event) {
    if (event.target.name === "product_type") selectProduct(event.target.value);
  });

  var requested = new URLSearchParams(window.location.search).get("product");
  var initial = products[requested] ? requested : (products[sessionStorage.getItem(selectedKey)] ? sessionStorage.getItem(selectedKey) : "metal");
  var initialInput = selector.querySelector("input[value='" + initial + "']");
  if (initialInput) initialInput.checked = true;
  selectProduct(initial);
})();
