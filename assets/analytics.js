(function () {
  var config = window.ATMINIMAS_ANALYTICS || {};
  var measurementId = String(config.GA_MEASUREMENT_ID || "").trim().toUpperCase();
  var consentKey = "atminimas.analytics.consent.v1";
  var tagLoaded = false;

  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied"
  });
  window.gtag("set", "ads_data_redaction", true);

  function readChoice() {
    try { return localStorage.getItem(consentKey) || ""; } catch (_error) { return ""; }
  }

  function saveChoice(value) {
    try { localStorage.setItem(consentKey, value); } catch (_error) {}
  }

  function updateConsent(granted) {
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: granted ? "granted" : "denied"
    });
  }

  function clearAnalyticsCookies() {
    document.cookie.split(";").forEach(function (item) {
      var name = item.split("=")[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) return;
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
    });
  }

  function trackThankYou() {
    if ((window.location.pathname.split("/").pop() || "").toLowerCase() !== "aciu.html") return;
    var type = new URLSearchParams(window.location.search).get("type") || "generic";
    window.gtag("event", "thank_you_view", { conversion_type: type });
  }

  function loadGoogleTag() {
    if (tagLoaded) return;
    tagLoaded = true;
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    script.addEventListener("load", function () {
      window.gtag("js", new Date());
      window.gtag("config", measurementId, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      trackThankYou();
    });
    document.head.appendChild(script);
  }

  function removeBanner() {
    var existing = document.querySelector("[data-analytics-consent]");
    if (existing) existing.remove();
  }

  function showBanner() {
    removeBanner();
    var banner = document.createElement("section");
    banner.className = "analytics-consent";
    banner.dataset.analyticsConsent = "";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-labelledby", "analytics-consent-title");
    banner.innerHTML =
      '<div><strong id="analytics-consent-title">Analitiniai slapukai</strong>' +
      '<p>Su jūsų sutikimu naudosime „Google Analytics“, kad suprastume, kurie svetainės puslapiai naudingi. Reklaminių slapukų nenaudojame.</p></div>' +
      '<div class="analytics-consent__actions"><button class="button" type="button" data-analytics-accept>Sutinku</button>' +
      '<button class="button button--ghost" type="button" data-analytics-reject>Tik būtini</button>' +
      '<a href="privatumas.html#analitika">Plačiau</a></div>';
    document.body.appendChild(banner);

    banner.querySelector("[data-analytics-accept]").addEventListener("click", function () {
      saveChoice("granted");
      updateConsent(true);
      loadGoogleTag();
      removeBanner();
    });
    banner.querySelector("[data-analytics-reject]").addEventListener("click", function () {
      var wasGranted = readChoice() === "granted";
      saveChoice("denied");
      updateConsent(false);
      clearAnalyticsCookies();
      removeBanner();
      if (wasGranted && tagLoaded) window.location.reload();
    });
  }

  function addSettingsButton() {
    var footer = document.querySelector(".site-footer__inner");
    if (!footer || footer.querySelector("[data-analytics-settings]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "analytics-settings";
    button.dataset.analyticsSettings = "";
    button.textContent = "Slapukų nustatymai";
    button.addEventListener("click", showBanner);
    footer.appendChild(button);
  }

  addSettingsButton();
  var choice = readChoice();
  if (choice === "granted") {
    updateConsent(true);
    loadGoogleTag();
  } else if (choice !== "denied") {
    showBanner();
  }
})();
