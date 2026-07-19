(function () {
  var rowsEl = document.getElementById("grave-photo-review-rows");
  var statusEl = document.getElementById("grave-photo-review-status");
  var refresh = document.getElementById("grave-photo-review-refresh");
  var cache = [];
  var previewed = new Set();
  var objectUrls = [];
  if (!rowsEl || !statusEl || !refresh) return;

  function cfg() { return window.ATMINIMAS_CONFIG || {}; }
  function baseUrl() { return cfg().SUPABASE_URL.replace(/\/$/, ""); }
  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function shownDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("lt-LT", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
  function statusLabel(status) {
    return { pending: "Laukia peržiūros", approved: "Patvirtinta", rejected: "Atmesta" }[status] || status;
  }
  function statusClass(status) {
    return status === "approved" ? " admin-badge--success" : status === "rejected" ? " admin-badge--danger" : "";
  }
  function restUrl(query) { return baseUrl() + "/rest/v1/grave_photo_submissions?" + query; }

  async function request(url, options) {
    var response = await fetch(url, Object.assign({ headers: AtminimasAuth.headers(false) }, options || {}));
    var raw = await response.text();
    if (!response.ok) throw new Error("Veiksmo atlikti nepavyko (" + response.status + ").");
    return raw ? JSON.parse(raw) : null;
  }

  function render() {
    var priority = { pending: 0, approved: 1, rejected: 2 };
    var rows = cache.slice().sort(function (a, b) {
      return (priority[a.status] - priority[b.status]) || String(b.created_at).localeCompare(String(a.created_at));
    });
    rowsEl.innerHTML = rows.map(function (row) {
      var actions = row.status === "pending"
        ? "<button class='button' type='button' data-approve-photo='" + html(row.id) + "'>Patvirtinti</button><button class='button button--danger' type='button' data-reject-photo='" + html(row.id) + "'>Atmesti</button>"
        : row.status === "approved"
          ? "<button class='button button--danger' type='button' data-reject-photo='" + html(row.id) + "'>Paslėpti</button>"
          : "<span class='muted'>Veiksmų nėra</span>";
      return "<tr data-photo-submission='" + html(row.id) + "'><td><img class='grave-photo-review__preview' data-review-image hidden alt='Kapavietės nuotraukos peržiūra'><br>" +
        "<button class='button button--ghost' type='button' data-preview-photo='" + html(row.id) + "'>Peržiūrėti</button></td>" +
        "<td><strong>" + html(row.deceased_name) + "</strong><br>" + html([row.cemetery_name, row.municipality].filter(Boolean).join(", ")) +
        "<br><small>" + html(shownDate(row.created_at)) + "</small></td>" +
        "<td class='grave-photo-review__description'>" + html(row.description || "Aprašymas nepateiktas") + "</td>" +
        "<td><span class='admin-badge" + statusClass(row.status) + "'>" + html(statusLabel(row.status)) + "</span>" +
        (row.admin_note ? "<br><small>" + html(row.admin_note) + "</small>" : "") + "</td>" +
        "<td><div class='actions admin-actions'>" + actions + "</div></td></tr>";
    }).join("") || "<tr><td colspan='5'>Kapaviečių nuotraukų pateikimų nėra.</td></tr>";
  }

  async function load() {
    statusEl.textContent = "Įkeliami nuotraukų pateikimai…";
    objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    objectUrls = [];
    cache = await request(restUrl("select=id,owner_id,source_model,grave_source_id,deceased_record_id,deceased_name,cemetery_name,municipality,storage_path,description,mime_type,size_bytes,status,admin_note,reviewed_at,created_at&order=created_at.desc&limit=200"));
    render();
    var waiting = cache.filter(function (row) { return row.status === "pending"; }).length;
    statusEl.textContent = waiting ? "Peržiūros laukia: " + waiting + "." : "Naujų nuotraukų peržiūrai nėra.";
  }

  async function preview(id, button) {
    button.disabled = true;
    statusEl.textContent = "Nuotrauka įkeliama peržiūrai…";
    try {
      var url = baseUrl() + "/functions/v1/grave-photo?review_id=" + encodeURIComponent(id);
      var response = await fetch(url, { headers: AtminimasAuth.headers(false), cache: "no-store" });
      if (!response.ok) throw new Error("Nuotraukos failas nepasiekiamas.");
      var blob = await response.blob();
      if (blob.type.indexOf("image/") !== 0) throw new Error("Gautas failas nėra nuotrauka.");
      var objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      var row = button.closest("tr");
      var image = row.querySelector("[data-review-image]");
      image.src = objectUrl;
      image.hidden = false;
      previewed.add(id);
      button.textContent = "Peržiūrėta";
      statusEl.textContent = "Peržiūrėkite vaizdą ir tik tada pasirinkite sprendimą.";
    } finally {
      button.disabled = false;
    }
  }

  async function setDecision(row, status, note) {
    var now = new Date().toISOString();
    await request(restUrl("id=eq." + encodeURIComponent(row.id)), {
      method: "PATCH",
      headers: Object.assign({}, AtminimasAuth.headers(true), { Prefer: "return=minimal" }),
      body: JSON.stringify({
        status: status,
        admin_note: note || null,
        reviewed_by: AtminimasAuth.userId(),
        reviewed_at: now,
        updated_at: now
      })
    });
  }

  async function removeStoredPhoto(path) {
    var response = await fetch(baseUrl() + "/storage/v1/object/grave-photo-submissions", {
      method: "DELETE",
      headers: AtminimasAuth.headers(true),
      body: JSON.stringify({ prefixes: [path] })
    });
    return response.ok;
  }

  rowsEl.addEventListener("click", function (event) {
    var previewButton = event.target.closest("[data-preview-photo]");
    if (previewButton) {
      preview(previewButton.dataset.previewPhoto, previewButton).catch(function (error) { statusEl.textContent = error.message; });
      return;
    }
    var approveButton = event.target.closest("[data-approve-photo]");
    var rejectButton = event.target.closest("[data-reject-photo]");
    var id = approveButton ? approveButton.dataset.approvePhoto : rejectButton ? rejectButton.dataset.rejectPhoto : "";
    if (!id) return;
    var row = cache.find(function (item) { return item.id === id; });
    if (!row) return;
    if (!previewed.has(id)) {
      statusEl.textContent = "Pirmiausia paspauskite „Peržiūrėti“ ir patikrinkite nuotrauką.";
      return;
    }
    if (approveButton) {
      approveButton.disabled = true;
      setDecision(row, "approved", "").then(function () {
        statusEl.textContent = "Nuotrauka patvirtinta ir dabar gali būti rodoma viešai.";
        return load();
      }).catch(function (error) { statusEl.textContent = error.message; }).finally(function () { approveButton.disabled = false; });
      return;
    }
    var note = window.prompt("Atmetimo arba paslėpimo priežastis (nebūtina):", row.admin_note || "");
    if (note === null) return;
    rejectButton.disabled = true;
    setDecision(row, "rejected", note.trim()).then(async function () {
      var removed = await removeStoredPhoto(row.storage_path);
      statusEl.textContent = removed ? "Nuotrauka atmesta ir failas pašalintas." : "Nuotrauka paslėpta; failą vėliau reikės pašalinti rankiniu būdu.";
      await load();
    }).catch(function (error) { statusEl.textContent = error.message; }).finally(function () { rejectButton.disabled = false; });
  });

  refresh.addEventListener("click", function () { load().catch(function (error) { statusEl.textContent = error.message; }); });
  window.addEventListener("atminimas:admin-ready", function () { load().catch(function (error) { statusEl.textContent = error.message; }); });
})();
