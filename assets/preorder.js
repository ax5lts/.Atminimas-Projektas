(function () {
  var form = document.getElementById("preorder-form");
  if (!form) return;

  var config = window.ATMINIMAS_CONFIG || {};
  var business = window.ATMINIMAS_BUSINESS || {};
  var status = document.getElementById("preorder-status");
  var summaryTitle = document.getElementById("preorder-summary-title");
  var summaryPrice = document.getElementById("preorder-summary-price");
  var summaryDetails = document.getElementById("preorder-summary-details");
  var summaryImage = document.getElementById("preorder-product-image");
  var products = {
    metal: {
      title: "Plieninė QR lentelė",
      image: "assets/qr-plienas-480.webp",
      alt: "Graviruota plieno QR atminimo lentelė",
      details: "5 × 5 cm · plienas · klijuojama · siunčiame",
      price: business.price && business.price !== "–" ? business.price : ""
    },
    asa: {
      title: "3D spausdinta QR lentelė",
      image: "assets/qr-asa-480.webp",
      alt: "ASA 3D spausdinta QR atminimo lentelė",
      details: "5 × 5 cm · ASA plastikas · klijuojama · siunčiame",
      price: ""
    }
  };

  function safeProduct(value) {
    return value === "asa" ? "asa" : "metal";
  }

  function setStatus(message, state) {
    if (window.AtminimasForms) {
      AtminimasForms.setStatus(status, message, state);
      return;
    }
    status.textContent = message || "";
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function setBusy(busy) {
    if (window.AtminimasForms) {
      AtminimasForms.setBusy(form, busy, "Pateikiama…");
      return;
    }
    form.querySelector("button[type='submit']").disabled = busy;
  }

  function renderProduct(value) {
    var type = safeProduct(value);
    var product = products[type];
    summaryTitle.textContent = product.title;
    summaryImage.src = product.image;
    summaryImage.alt = product.alt;
    summaryDetails.textContent = product.details;
    summaryPrice.textContent = product.price
      ? "Orientacinė kaina: " + product.price
      : "Orientacinę kainą patvirtinsime susisiekę · dabar 0 EUR";
  }

  function applyRequestedProduct() {
    var requested = safeProduct(new URLSearchParams(window.location.search).get("product"));
    var input = form.querySelector("input[name='product_type'][value='" + requested + "']");
    if (input) input.checked = true;
    renderProduct(requested);
  }

  async function loadPrices() {
    if (!window.AtminimasProductCatalog) return;
    var catalog = await AtminimasProductCatalog.load();
    ["metal", "asa"].forEach(function (type) {
      var item = catalog[type];
      if (item && item.price_cents != null) {
        products[type].price = AtminimasProductCatalog.formatPrice(item.price_cents, item.currency);
      }
    });
    var checked = form.querySelector("input[name='product_type']:checked");
    renderProduct(checked ? checked.value : "metal");
  }

  form.addEventListener("change", function (event) {
    if (event.target.name === "product_type") renderProduct(event.target.value);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      setStatus("Išankstinių užsakymų forma dar nesukonfigūruota. Susisiekite rekvizituose nurodytu el. paštu.", "error");
      return;
    }

    var values = Object.fromEntries(new FormData(form).entries());
    var payload = {
      product_type: safeProduct(values.product_type),
      quantity: Number(values.quantity),
      customer_name: String(values.customer_name || "").trim(),
      customer_email: String(values.customer_email || "").trim(),
      customer_phone: String(values.customer_phone || "").trim() || null,
      notes: String(values.notes || "").trim() || null,
      website: String(values.website || ""),
      consent: values.consent === "yes" ? "yes" : "no",
      source_path: window.location.pathname + window.location.search
    };

    setBusy(true);
    setStatus("PREORDER pateikiamas…", "info");
    try {
      var response = await fetch(
        config.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/preorder",
        {
          method: "POST",
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok || !result.reference_code) {
        throw new Error(result.error || "Išankstinio užsakymo pateikti nepavyko.");
      }
      var params = new URLSearchParams({
        type: "preorder",
        ref: result.reference_code,
        product: payload.product_type
      });
      window.location.assign("aciu.html?" + params.toString());
    } catch (error) {
      var message = error && error.message ? error.message : "";
      if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
        message = "Nepavyko susisiekti su PREORDER serveriu. Užsakymas neišsaugotas – patikrinkite interneto ryšį ir bandykite dar kartą.";
      }
      setStatus(message, "error");
    } finally {
      setBusy(false);
    }
  });

  applyRequestedProduct();
  loadPrices().catch(function () {
    var checked = form.querySelector("input[name='product_type']:checked");
    renderProduct(checked ? checked.value : "metal");
  });
})();
