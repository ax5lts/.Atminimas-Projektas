(function () {
  var form = document.getElementById("register-form");
  var status = document.getElementById("register-status");

  function nextPage() {
    var value = (new URLSearchParams(window.location.search).get("next") || "").trim();
    if (/^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(value)) return value;
    return sessionStorage.getItem("atminimas.service-request.draft.v1") ? "index.html#kitos-paslaugos" : "vartotojas.html";
  }

  var next = nextPage();
  document.querySelectorAll("a[href='prisijungti.html']").forEach(function (link) {
    if (next !== "vartotojas.html") link.href = "prisijungti.html?next=" + encodeURIComponent(next);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector("button[type='submit']");
    var data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    status.textContent = "Kuriama paskyra...";
    try {
      var result = await AtminimasAuth.signUp(data.email, data.password, data.name);
      if (result.access_token) {
        window.location.href = next;
        return;
      }
      status.textContent = "Paskyra sukurta. Patvirtinkite el. paštą ir tada prisijunkite.";
      form.reset();
    } catch (error) {
      status.textContent = error.message || "Nepavyko sukurti paskyros.";
    } finally {
      button.disabled = false;
    }
  });
})();
