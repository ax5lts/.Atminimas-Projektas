(function () {
  var DEFAULT_CATALOG = {
    metal: { id: "metal", available: false, price_cents: null, currency: "EUR" },
    asa: { id: "asa", available: false, price_cents: null, currency: "EUR" }
  };

  function normalizeType(value) {
    return value === "asa" ? "asa" : "metal";
  }

  function formatPrice(priceCents, currency) {
    if (priceCents == null || !Number.isFinite(Number(priceCents))) return "–";
    return new Intl.NumberFormat("lt-LT", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2
    }).format(Number(priceCents) / 100);
  }

  function fallbackCatalog(message) {
    return {
      metal: Object.assign({}, DEFAULT_CATALOG.metal),
      asa: Object.assign({}, DEFAULT_CATALOG.asa),
      remote: false,
      error: message || "Nepavyko patikrinti produktų prieinamumo."
    };
  }

  async function load() {
    var config = window.ATMINIMAS_CONFIG || {};
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return fallbackCatalog();

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 6000) : null;
    try {
      var query = "select=id,name,price_cents,currency,enabled&id=in.(metal,asa)&enabled=eq.true";
      var response = await fetch(config.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/product_catalog?" + query, {
        headers: {
          apikey: config.SUPABASE_ANON_KEY,
          Accept: "application/json"
        },
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("Produkto katalogas nepasiekiamas.");

      var rows = await response.json();
      var catalog = {
        metal: { id: "metal", available: false, price_cents: null, currency: "EUR" },
        asa: { id: "asa", available: false, price_cents: null, currency: "EUR" },
        remote: true
      };
      rows.forEach(function (row) {
        if (!catalog[row.id]) return;
        catalog[row.id] = {
          id: row.id,
          name: row.name || "",
          available: row.enabled === true && row.price_cents != null,
          price_cents: row.price_cents,
          currency: row.currency || "EUR"
        };
      });
      return catalog;
    } catch (_error) {
      return fallbackCatalog("Nepavyko susisiekti su parduotuve. Patikrinkite interneto ryšį ir bandykite dar kartą.");
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  window.AtminimasProductCatalog = {
    formatPrice: formatPrice,
    load: load,
    normalizeType: normalizeType
  };
})();
