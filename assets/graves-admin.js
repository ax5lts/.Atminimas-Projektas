(function () {
  var panel = document.getElementById("grave-admin-panel");
  var form = document.getElementById("grave-admin-form");
  var statusEl = document.getElementById("grave-admin-status");
  var rowsEl = document.getElementById("grave-admin-rows");
  var searchEl = document.getElementById("grave-admin-search");
  var cache = [];
  if (!panel || !form) return;

  function cfg() { return window.ATMINIMAS_CONFIG; }
  function restUrl(query) { return cfg().SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/kapavietes?" + query; }
  function html(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  async function request(url, options) {
    var response = await fetch(url, Object.assign({ headers: AtminimasAuth.headers(false) }, options || {}));
    var raw = await response.text();
    if (!response.ok) throw new Error("Supabase: " + response.status + " " + raw);
    return raw ? JSON.parse(raw) : null;
  }
  function render() {
    var q = searchEl.value.toLowerCase().trim();
    var rows = cache.filter(function (row) { return !q || [row.vardas, row.pavarde, row.kapiniu_pavadinimas, row.miestas].join(" ").toLowerCase().indexOf(q) !== -1; });
    rowsEl.innerHTML = rows.map(function (row) {
      return "<tr><td><strong>" + html(row.vardas + " " + row.pavarde) + "</strong><br>" + html([row.gimimo_data || row.gimimo_metai, row.mirties_data || row.mirties_metai].filter(Boolean).join("–")) + "</td>" +
        "<td>" + html([row.kapiniu_pavadinimas, row.miestas].filter(Boolean).join(", ")) + "<br><span class='muted'>" + html([row.sektorius, row.eile, row.kapo_numeris].filter(Boolean).join(" · ")) + "</span></td>" +
        "<td>" + html(row.statusas) + "</td><td><div class='actions admin-actions'><button class='button button--ghost' type='button' data-edit-grave='" + html(row.id) + "'>Redaguoti</button><button class='button button--danger' type='button' data-delete-grave='" + html(row.id) + "'>Trinti</button></div></td></tr>";
    }).join("") || "<tr><td colspan='4'>Kapaviečių įrašų nėra.</td></tr>";
  }
  async function load() {
    cache = await request(restUrl("select=*&order=updated_at.desc"));
    panel.hidden = false; render();
  }
  function setField(name, value) { var field = form.elements[name]; if (field) field.value = value == null ? "" : value; }
  function edit(id) {
    var row = cache.find(function (item) { return item.id === id; });
    if (!row) return;
    ["id", "vardas", "pavarde", "gimimo_data", "mirties_data", "gimimo_metai", "mirties_metai", "kapiniu_pavadinimas", "miestas", "adresas", "sektorius", "eile", "kapo_numeris", "platuma", "ilguma", "vietos_aprasymas", "statusas", "duomenu_saltinis", "admin_pastabos"].forEach(function (name) { setField(name, row[name]); });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function reset() { form.reset(); setField("id", ""); statusEl.textContent = "Ruošiamas naujas įrašas."; }
  async function upload(file, id) {
    var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    var path = id + "/pagrindine-" + Date.now() + "." + ext;
    var url = cfg().SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/kapavietes/" + path;
    var headers = AtminimasAuth.headers(false); headers["Content-Type"] = file.type; headers["x-upsert"] = "false";
    var response = await fetch(url, { method: "POST", headers: headers, body: file });
    if (!response.ok) throw new Error("Nepavyko įkelti nuotraukos: " + await response.text());
    return path;
  }
  form.addEventListener("submit", async function (event) {
    event.preventDefault(); statusEl.textContent = "Saugoma…";
    try {
      var data = new FormData(form); var id = data.get("id"); var photo = data.get("nuotrauka");
      var payload = {};
      ["vardas", "pavarde", "gimimo_data", "mirties_data", "gimimo_metai", "mirties_metai", "kapiniu_pavadinimas", "miestas", "adresas", "sektorius", "eile", "kapo_numeris", "platuma", "ilguma", "vietos_aprasymas", "statusas", "duomenu_saltinis", "admin_pastabos"].forEach(function (name) { var value = String(data.get(name) || "").trim(); payload[name] = value || null; });
      payload.statusas = payload.statusas || "juodrastis";
      ["gimimo_metai", "mirties_metai"].forEach(function (name) { if (payload[name]) payload[name] = Number(payload[name]); });
      ["platuma", "ilguma"].forEach(function (name) { if (payload[name]) payload[name] = Number(payload[name]); });
      if (!id) {
        var created = await request(restUrl("select=*"), { method: "POST", headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=representation" }), body: JSON.stringify(payload) });
        id = created[0].id;
      } else {
        payload.updated_at = new Date().toISOString();
        await request(restUrl("id=eq." + encodeURIComponent(id)), { method: "PATCH", headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }), body: JSON.stringify(payload) });
      }
      if (photo && photo.size) {
        var path = await upload(photo, id);
        await request(restUrl("id=eq." + encodeURIComponent(id)), { method: "PATCH", headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }), body: JSON.stringify({ nuotraukos_kelias: path, updated_at: new Date().toISOString() }) });
      }
      statusEl.textContent = "Kapavietė išsaugota."; reset(); await load();
    } catch (error) { statusEl.textContent = error.message || "Nepavyko išsaugoti."; }
  });
  rowsEl.addEventListener("click", async function (event) {
    var editButton = event.target.closest("[data-edit-grave]"); if (editButton) { edit(editButton.dataset.editGrave); return; }
    var deleteButton = event.target.closest("[data-delete-grave]"); if (!deleteButton) return;
    if (!window.confirm("Ar tikrai ištrinti šią kapavietę?")) return;
    try { await request(restUrl("id=eq." + encodeURIComponent(deleteButton.dataset.deleteGrave)), { method: "DELETE", headers: Object.assign({}, AtminimasAuth.headers(false), { Prefer: "return=minimal" }) }); await load(); } catch (error) { statusEl.textContent = error.message; }
  });
  searchEl.addEventListener("input", render);
  document.getElementById("grave-admin-refresh").addEventListener("click", function () { load().catch(function (error) { statusEl.textContent = error.message; }); });
  document.getElementById("grave-form-reset").addEventListener("click", reset);
  document.getElementById("admin-logout").addEventListener("click", function () { panel.hidden = true; });
  window.addEventListener("atminimas:admin-ready", function () { load().catch(function (error) { statusEl.textContent = error.message; }); });
})();
