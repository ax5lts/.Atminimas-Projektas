(function () {
  var form = document.getElementById("register-form");
  var status = document.getElementById("register-status");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector("button[type='submit']");
    var data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    status.textContent = "Kuriama paskyra...";
    try {
      var result = await AtminimasAuth.signUp(data.email, data.password, data.name);
      if (result.access_token) {
        window.location.href = "vartotojas.html";
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
