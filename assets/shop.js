(function () {
  var selector = document.getElementById("product-selector");
  if (!selector) return;

  var selectedKey = "atminimas.selected-product.v1";
  var business = window.ATMINIMAS_BUSINESS || {};
  var products = {
    metal: {
      kind: "Metalo variantas",
      title: "QR atminimo ženkliukas",
      image: "assets/qr-lipdukas.png",
      alt: "Metalo QR atminimo ženkliukas",
      price: business.price || "–",
      vat: business.priceVat || "–",
      copy: "Klasikinis ženkliukas su QR kodu nukreipia į asmeninį atminimo puslapį su nuotraukomis, vaizdo įrašu, gyvenimo datomis ir epitafija.",
      type: "Metalo QR ženkliukas",
      material: business.material || "–",
      dimensions: business.dimensions || "–",
      mounting: business.mounting || "–",
      safety: business.safetyWarnings || "–"
    },
    asa: {
      kind: "3D spausdintas variantas",
      title: "ASA QR atminimo ženkliukas",
      image: "assets/qr-asa.png",
      alt: "ASA plastiko 3D spausdintas QR atminimo ženkliukas",
      price: "–",
      vat: "–",
      copy: "Dvispalvis 3D spausdintas QR ženkliukas iš lauko sąlygoms tinkamo ASA plastiko. Galutiniai matmenys, tvirtinimas ir kaina bus patvirtinti po prototipo bandymų.",
      type: "ASA 3D spausdintas QR ženkliukas",
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
    fields.image.alt = product.alt;
    fields.price.textContent = product.price;
    fields.vat.textContent = product.vat;
    fields.copy.textContent = product.copy;
    fields.type.textContent = product.type;
    fields.material.textContent = product.material;
    fields.dimensions.textContent = product.dimensions;
    fields.mounting.textContent = product.mounting;
    fields.safety.textContent = product.safety;
    createLink.href = "vartotojas.html?product=" + encodeURIComponent(safeType);
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
