(function () {
  function config() { return window.ATMINIMAS_CONFIG || {}; }
  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function shownDate(date, year, text) { return date || year || text || "?"; }
  function mapLocation(row) {
    if (row.latitude != null && row.longitude != null) return row.latitude + "," + row.longitude;
    return [row.cemetery, row.municipality].filter(Boolean).join(", ");
  }
  function mapUrl(row) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapLocation(row)); }
  function loader() {
    return "<div class='grave-loader' role='status' aria-live='polite'><span class='grave-loader__spinner' aria-hidden='true'></span><span>Ieškoma kapų duomenyse…</span></div>";
  }
  function render(row) {
    var name = html(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "));
    var dates = html(shownDate(row.birth_date, row.birth_year, row.birth_date_text) + "–" + shownDate(row.death_date, row.death_year, row.death_date_text));
    var place = [row.cemetery, row.municipality].filter(Boolean).map(html).join(", ");
    var grave = [["sektorius", row.section], ["eilė", row.row_name], ["vieta", row.place_number]].filter(function (x) { return x[1]; }).map(function (x) { return x[0] + " " + html(x[1]); }).join(" · ");
    var burial = row.burial_date || row.burial_year ? html(shownDate(row.burial_date, row.burial_year, row.burial_date_text)) : "";
    var coordinates = row.latitude != null && row.longitude != null ? Number(row.latitude).toFixed(6) + ", " + Number(row.longitude).toFixed(6) : "";
    var map = mapLocation(row);
    return "<details class='grave-list-item'><summary class='grave-list-item__summary'>" +
      "<span class='grave-list-item__person'><span class='eyebrow'>" + dates + "</span><strong>" + name + "</strong>" +
      (place ? "<span>" + place + "</span>" : "") + "</span><span class='grave-list-item__action'>Rodyti informaciją</span></summary>" +
      "<div class='grave-list-item__details'>" +
      (burial ? "<p><span>Palaidojimo data</span><strong>" + burial + "</strong></p>" : "") +
      (row.cemetery ? "<p><span>Kapinės</span><strong>" + html(row.cemetery) + "</strong></p>" : "") +
      (row.municipality ? "<p><span>Savivaldybė</span><strong>" + html(row.municipality) + "</strong></p>" : "") +
      (row.section ? "<p><span>Sektorius</span><strong>" + html(row.section) + "</strong></p>" : "") +
      (row.row_name ? "<p><span>Eilė</span><strong>" + html(row.row_name) + "</strong></p>" : "") +
      (row.place_number ? "<p><span>Kapavietė</span><strong>" + html(row.place_number) + "</strong></p>" : "") +
      (coordinates ? "<p><span>Koordinatės</span><strong>" + html(coordinates) + "</strong></p>" : "") +
      (grave ? "<p class='grave-list-item__location'>" + grave + "</p>" : "") +
      (map ? "<a class='button button--ghost' target='_blank' rel='noopener' href='" + html(mapUrl(row)) + "'>Atidaryti „Google Maps“</a>" : "") +
      "</div></details>";
  }
  function manual(row) {
    return { full_name: [row.vardas, row.pavarde].filter(Boolean).join(" "), birth_date: row.gimimo_data,
      death_date: row.mirties_data, birth_year: row.gimimo_metai, death_year: row.mirties_metai,
      cemetery: row.kapiniu_pavadinimas, municipality: row.miestas, section: row.sektorius,
      row_name: row.eile, place_number: row.kapo_numeris, latitude: row.platuma, longitude: row.ilguma };
  }
  function edgeUrl() {
    if (config().CEMETERY_SEARCH_API_URL) return config().CEMETERY_SEARCH_API_URL;
    return config().SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/cemetery-search";
  }
  async function officialSearch(payload) {
    var key = config().SUPABASE_ANON_KEY;
    var headers = { apikey: key, "Content-Type": "application/json" };
    if (key && !key.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + key;
    var response = await fetch(edgeUrl(), { method: "POST", headers: headers, body: JSON.stringify(payload) });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "Paieška šiuo metu nepasiekiama.");
    return result;
  }
  async function rpc(name, payload) {
    var key = config().SUPABASE_ANON_KEY;
    var headers = { apikey: key, "Content-Type": "application/json" };
    if (key && !key.startsWith("sb_publishable_")) headers.Authorization = "Bearer " + key;
    var response = await fetch(config().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST", headers: headers, body: JSON.stringify(payload)
    });
    if (!response.ok) return [];
    return response.json();
  }
  function values(form) {
    var data = new FormData(form);
    function value(name) { return String(data.get(name) || "").trim(); }
    return { p_query: value("q") || null, p_first_name: value("firstName") || null, p_last_name: value("lastName") || null,
      p_birth_year: value("birthYear") ? Number(value("birthYear")) : null, p_death_year: value("deathYear") ? Number(value("deathYear")) : null,
      p_municipality: value("municipality") || null, p_cemetery: value("cemetery") || null };
  }
  document.querySelectorAll("[data-grave-search-form]").forEach(function (form) {
    var root = form.closest("section") || document;
    var status = root.querySelector("[data-grave-status]") || document.querySelector("[data-grave-status]");
    var results = root.querySelector("[data-grave-results]") || document.querySelector("[data-grave-results]");
    var count = document.querySelector("[data-grave-count]");
    var pager = document.querySelector("[data-grave-pagination]");
    var page = 1;
    async function run() {
      var query = values(form);
      if (!Object.keys(query).some(function (key) { return query[key] !== null; }) || (query.p_query && query.p_query.length < 2)) {
        status.textContent = "Įveskite bent 2 raides arba pasirinkite kitą kriterijų."; return;
      }
      var pageSize = form.dataset.limit ? Number(form.dataset.limit) : 20;
      query.p_page = page; query.p_page_size = pageSize;
      status.textContent = "Ieškoma…";
      results.setAttribute("aria-busy", "true");
      results.innerHTML = loader();
      try {
        var manualCall = page === 1 && query.p_query ? rpc("ieskoti_kapavieciu", { paieska: query.p_query, rezultatu_limitas: pageSize }) : Promise.resolve([]);
        var responses = await Promise.all([officialSearch(query), manualCall]);
        var officialResult = responses[0] || {}; var official = officialResult.items || [];
        var manualRows = (responses[1] || []).map(manual);
        results.innerHTML = official.concat(manualRows).map(render).join("") || "<div class='grave-empty'><h3>Atitikmenų nerasta</h3><p>Patikrinkite rašybą arba įveskite tik dalį pavardės.</p></div>";
        status.textContent = official.length + manualRows.length ? "Rodoma įrašų: " + (official.length + manualRows.length) : "Atitikmenų nerasta.";
        if (officialResult.failedModels) status.textContent += " Dalis savivaldybių laikinai neatsakė.";
        if (count) count.textContent = officialResult.hasMore ? "Rasta daugiau rezultatų" : (officialResult.matched ? "Rasta: " + officialResult.matched : "");
        if (pager) {
          pager.hidden = page <= 1 && !officialResult.hasMore;
          pager.querySelector("[data-page-label]").textContent = "Puslapis " + page;
          pager.querySelector("[data-page-prev]").disabled = page <= 1;
          pager.querySelector("[data-page-next]").disabled = !officialResult.hasMore;
        }
      } catch (error) {
        status.textContent = error.message;
        results.innerHTML = "";
      } finally {
        results.setAttribute("aria-busy", "false");
      }
    }
    form.addEventListener("submit", function (event) { event.preventDefault(); page = 1; run(); });
    if (pager) {
      pager.querySelector("[data-page-prev]").addEventListener("click", function () { if (page > 1) { page -= 1; run(); } });
      pager.querySelector("[data-page-next]").addEventListener("click", function () { page += 1; run(); });
    }
  });
})();
