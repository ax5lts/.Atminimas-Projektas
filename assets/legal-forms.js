(function () {
  var config = window.ATMINIMAS_CONFIG;

  function apiHeaders() {
    return {
      apikey: config.SUPABASE_ANON_KEY,
      Accept: "application/json",
      "Content-Type": "application/json"
    };
  }

  function receiptText(title, ref, values) {
    var lines = [title, "Registracijos numeris: " + ref, "Pateikta: " + new Date().toISOString(), ""];
    Object.keys(values).forEach(function (key) {
      if (key === "reference_code" || key === "form_type" || key === "website") return;
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
      var data = Object.fromEntries(new FormData(form).entries());
      data.form_type = form.dataset.legalForm;
      delete data.confirmation;
      button.disabled = true;
      status.textContent = "Pateikiama…";
      try {
        var response = await fetch(
          config.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/legal-submission",
          {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify(data)
          }
        );
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.reference_code) {
          throw new Error(result.error || "Pateikti nepavyko");
        }
        var ref = result.reference_code;
        data.reference_code = ref;
        status.textContent = "Gauta. Registracijos numeris: " + ref + ".";
        showDownload(
          status.parentElement,
          receiptText(form.dataset.receiptTitle, ref, data),
          ref + ".txt"
        );
        form.reset();
      } catch (_error) {
        status.textContent = "Nepavyko pateikti. Bandykite vėliau arba kreipkitės rekvizituose nurodytu el. paštu.";
      } finally {
        button.disabled = false;
      }
    });
  });
})();
