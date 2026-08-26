(function () {
  var PUBLIC_KEYS = [
    "legalName",
    "activityForm",
    "registrationCode",
    "registry",
    "address",
    "email",
    "phone",
    "vatStatus"
  ];

  function refresh() {
    var details = window.ATMINIMAS_BUSINESS || {};
    document.querySelectorAll("[data-business]").forEach(function (element) {
      var key = element.dataset.business;
      var value = String(details[key] || "").trim();
      element.textContent = value || "NEPATEIKTA";
      element.classList.toggle("is-missing", !value);
      if (element.tagName === "A" && key === "email") {
        element.href = value ? "mailto:" + value : "#";
      }
      if (element.tagName === "A" && key === "phone") {
        element.href = value ? "tel:" + value.replace(/\s+/g, "") : "#";
      }
    });

    var required = ["legalName", "activityForm", "registrationCode", "registry", "address", "email"];
    var complete = required.every(function (key) { return String(details[key] || "").trim(); });
    document.querySelectorAll("[data-business-warning]").forEach(function (element) {
      element.hidden = complete;
    });
  }

  async function loadRemote() {
    var app = window.ATMINIMAS_CONFIG || {};
    var baseUrl = String(app.SUPABASE_URL || "").replace(/\/$/, "");
    var publishableKey = String(app.SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !publishableKey) return;

    try {
      var response = await fetch(baseUrl + "/functions/v1/business-profile", {
        method: "GET",
        headers: { apikey: publishableKey, Accept: "application/json" }
      });
      if (!response.ok) return;
      var payload = await response.json();
      var remote = payload && payload.business;
      if (!remote || typeof remote !== "object" || Array.isArray(remote)) return;

      var merged = Object.assign({}, window.ATMINIMAS_BUSINESS || {});
      PUBLIC_KEYS.forEach(function (key) {
        var value = String(remote[key] || "").trim();
        if (value) merged[key] = value;
      });
      window.ATMINIMAS_BUSINESS = Object.freeze(merged);
      refresh();
    } catch (_error) {
      // Statinė konfigūracija lieka patikimas atsarginis variantas.
    }
  }

  window.AtminimasBusinessDetails = { refresh: refresh, loadRemote: loadRemote };
  refresh();
  loadRemote();
})();
