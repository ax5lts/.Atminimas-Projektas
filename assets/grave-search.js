(function () {
  function config() { return window.ATMINIMAS_CONFIG || {}; }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function dateText(date, year) { return date ? String(date).slice(0, 4) : (year || "?"); }
  function imageUrl(path) {
    if (!path) return "";
    return config().SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/public/kapavietes/" + path.split("/").map(encodeURIComponent).join("/");
  }
  function mapUrl(row) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(row.platuma + "," + row.ilguma);
  }
  function renderCard(row) {
    var name = escapeHtml(row.vardas + " " + row.pavarde);
    var years = escapeHtml(dateText(row.gimimo_data, row.gimimo_metai) + "–" + dateText(row.mirties_data, row.mirties_metai));
    var place = [row.kapiniu_pavadinimas, row.miestas].filter(Boolean).map(escapeHtml).join(", ");
    var grave = [["sektorius", row.sektorius], ["eilė", row.eile], ["kapo nr.", row.kapo_numeris]].filter(function (x) { return x[1]; }).map(function (x) { return x[0] + " " + escapeHtml(x[1]); }).join(" · ");
    var photo = imageUrl(row.nuotraukos_kelias);
    return "<article class='grave-card'>" +
      (photo ? "<img class='grave-card__image' src='" + escapeHtml(photo) + "' alt='" + name + " kapavietė' loading='lazy'>" : "<div class='grave-card__placeholder' aria-hidden='true'>✦</div>") +
      "<div class='grave-card__body'><p class='eyebrow'>" + years + "</p><h3>" + name + "</h3><p><strong>" + place + "</strong></p>" +
      (row.adresas ? "<p>" + escapeHtml(row.adresas) + "</p>" : "") + (grave ? "<p>" + grave + "</p>" : "") +
      (row.vietos_aprasymas ? "<p class='muted'>" + escapeHtml(row.vietos_aprasymas) + "</p>" : "") +
      (row.platuma != null && row.ilguma != null ? "<a class='button button--ghost' target='_blank' rel='noopener' href='" + escapeHtml(mapUrl(row)) + "'>Rodyti Google Maps</a>" : "") +
      "</div></article>";
  }
  async function search(query, limit) {
    var url = config().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/ieskoti_kapavieciu";
    var key = config().SUPABASE_ANON_KEY;
    var response = await fetch(url, { method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ paieska: query, rezultatu_limitas: limit || 20 }) });
    if (!response.ok) throw new Error("Paieška šiuo metu nepasiekiama.");
    return response.json();
  }
  document.querySelectorAll("[data-grave-search-form]").forEach(function (form) {
    var root = form.closest("section") || document;
    var status = root.querySelector("[data-grave-status]") || document.querySelector("[data-grave-status]");
    var results = root.querySelector("[data-grave-results]") || document.querySelector("[data-grave-results]");
    var count = document.querySelector("[data-grave-count]");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var query = new FormData(form).get("q").trim();
      if (query.length < 2) { status.textContent = "Įveskite bent 2 raides."; return; }
      status.textContent = "Ieškoma…";
      try {
        var rows = await search(query, form.dataset.limit ? Number(form.dataset.limit) : 20);
        results.innerHTML = rows.map(renderCard).join("") || "<div class='grave-empty'><h3>Atitikmenų nerasta</h3><p>Patikrinkite rašybą arba pabandykite įvesti tik pavardę.</p></div>";
        status.textContent = rows.length ? "Rasta įrašų: " + rows.length : "Atitikmenų nerasta.";
        if (count) count.textContent = rows.length ? rows.length + " rezultatai" : "";
      } catch (error) { status.textContent = error.message; results.innerHTML = ""; }
    });
  });
})();
