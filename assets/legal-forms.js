(function () {
  var config = window.ATMINIMAS_CONFIG;

  function apiHeaders() {
    return {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + config.SUPABASE_ANON_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    };
  }

  function reference(prefix) {
    var random = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID().split("-")[0]
      : Math.random().toString(36).slice(2, 10);
    return prefix + "-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + random.toUpperCase();
  }

  function receiptText(title, ref, values) {
    var lines = [title, "Registracijos numeris: " + ref, "Pateikta: " + new Date().toISOString(), ""];
    Object.keys(values).forEach(function (key) {
      if (key === "reference_code") return;
      lines.push(key + ": " + String(values[key]));
    });
    return lines.join("\n");
  }

  function showDownload(container, text, filename) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.className = "button button--ghost";
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.textContent = "Atsisiųsti pateikimo patvirtinimą";
    container.appendChild(link);
  }

  document.querySelectorAll("form[data-legal-form]").forEach(function (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return;
      var status = form.querySelector("[role='status']");
      var button = form.querySelector("button[type='submit']");
      var table = form.dataset.legalForm;
      var prefix = table === "atsisakymai" ? "ATS" : "PRN";
      var ref = reference(prefix);
      var data = Object.fromEntries(new FormData(form).entries());
      data.reference_code = ref;
      delete data.confirmation;
      button.disabled = true;
      status.textContent = "Pateikiama...";
      try {
        var response = await fetch(config.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table, {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error("Serveris grąžino " + response.status);
        status.textContent = "Gauta. Registracijos numeris: " + ref + ".";
        showDownload(status.parentElement, receiptText(form.dataset.receiptTitle, ref, data), ref + ".txt");
        form.reset();
      } catch (error) {
        status.textContent = "Nepavyko pateikti. Bandykite vėliau arba kreipkitės rekvizituose nurodytu el. paštu.";
      } finally {
        button.disabled = false;
      }
    });
  });
})();
