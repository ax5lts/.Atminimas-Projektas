(function () {
  var business = window.ATMINIMAS_BUSINESS || {};
  var app = window.ATMINIMAS_CONFIG || {};
  var page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  var baseUrl = String(app.PUBLIC_SITE_URL || new URL("./", window.location.href).href).replace(/\/?$/, "/");

  function addJsonLd(id, payload) {
    var previous = document.getElementById(id);
    if (previous) previous.remove();
    var script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  function compact(value) {
    if (Array.isArray(value)) return value.map(compact).filter(function (item) { return item != null; });
    if (!value || typeof value !== "object") return value == null || value === "" ? null : value;
    var result = {};
    Object.keys(value).forEach(function (key) {
      var item = compact(value[key]);
      if (item != null && (!Array.isArray(item) || item.length)) result[key] = item;
    });
    return Object.keys(result).length ? result : null;
  }

  function addBusinessSchema() {
    if (page !== "index.html" && page !== "rekvizitai.html") return;
    var hasLocalBusinessData = String(business.legalName || "").trim() && String(business.address || "").trim();
    var payload = compact({
      "@context": "https://schema.org",
      "@type": hasLocalBusinessData ? "LocalBusiness" : "Organization",
      name: "Atminimas",
      legalName: business.legalName,
      description: "QR atminimo ženklai, skaitmeniniai atminimo puslapiai ir kapaviečių priežiūros paslaugos.",
      url: baseUrl,
      logo: new URL("assets/atminimas-mark.svg", baseUrl).href,
      image: new URL("assets/qr-plienas.webp", baseUrl).href,
      email: business.email,
      telephone: business.phone,
      address: hasLocalBusinessData ? {
        "@type": "PostalAddress",
        streetAddress: business.address,
        addressCountry: "LT"
      } : null,
      areaServed: { "@type": "Country", name: "Lietuva" },
      priceRange: business.price ? "€€" : null
    });
    addJsonLd("atminimas-business-schema", payload);
  }

  function addBreadcrumbSchema() {
    var breadcrumbs = document.querySelector(".breadcrumbs");
    if (!breadcrumbs) return;
    var items = [];
    breadcrumbs.querySelectorAll("a[href], span").forEach(function (item) {
      var name = String(item.textContent || "").trim();
      if (!name) return;
      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        name: name,
        item: item.matches("a[href]") ? new URL(item.getAttribute("href"), window.location.href).href : window.location.href
      });
    });
    if (items.length < 2) return;
    addJsonLd("atminimas-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items
    });
  }

  addBusinessSchema();
  addBreadcrumbSchema();
})();
