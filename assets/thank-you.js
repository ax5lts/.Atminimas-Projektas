(function () {
  var params = new URLSearchParams(window.location.search);
  var type = (params.get("type") || "generic").toLowerCase();
  var orderId = (params.get("order") || "").trim();
  var reference = (params.get("ref") || "").trim();
  var product = params.get("product") === "asa" ? "asa" : "metal";
  var title = document.getElementById("thank-you-title");
  var message = document.getElementById("thank-you-message");
  var note = document.getElementById("thank-you-note");
  var primary = document.getElementById("thank-you-primary");

  if (type === "service") {
    title.textContent = "Užklausą gavome";
    message.textContent = "Ačiū. Peržiūrėsime kapavietės vietą ir pasirinktus darbus, tada el. paštu atsiųsime galutinį pasiūlymą.";
    note.innerHTML = "Įprastai atsakome <strong data-business=\"responseTime\">per 1 darbo dieną</strong>.";
    primary.textContent = "Grįžti į kapavietės priežiūrą";
    primary.href = "kapu-prieziura.html";
  } else if (type === "preorder") {
    title.textContent = "Išankstinį užsakymą gavome";
    message.textContent = "Ačiū. Išankstinis užsakymas priimtas, o mokėtina suma yra 0 EUR. Kortelės duomenų nerinkome.";
    note.textContent = reference
      ? "Rezervacijos numeris: " + reference + ". Iki 2026 m. spalio 31 d. papildomų žinučių nesiųsime; nuo lapkričio 1 d. susisieksime dėl tolimesnių veiksmų."
      : "Iki 2026 m. spalio 31 d. papildomų žinučių nesiųsime; nuo lapkričio 1 d. susisieksime dėl tolimesnių veiksmų.";
    primary.textContent = "Pradėti kurti atminimo puslapį";
    primary.href = "redaktorius.html?product=" + encodeURIComponent(product);
  } else if (type === "payment") {
    title.textContent = "Mokėjimo žingsnis baigtas";
    message.textContent = "Ačiū. Saugus mokėjimo patvirtinimas gali užtrukti kelias akimirkas. Užsakymo būseną ir gamybos patvirtinimą visada rasite kliento zonoje.";
    note.textContent = "Gamyba nepradedama, kol kliento zonoje nepatvirtinsite galutinio maketo.";
    primary.textContent = "Stebėti užsakymo būseną";
    primary.href = "vartotojas.html" + (orderId ? "?order=" + encodeURIComponent(orderId) : "") + "#user-pages";
  }

  if (window.AtminimasBusinessDetails) window.AtminimasBusinessDetails.refresh();
})();
