(function () {
  var form = document.getElementById("login-form");
  var status = document.getElementById("login-status");

  if (AtminimasAuth.accessToken()) {
    window.location.replace("vartotojas.html");
    return;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector("button[type='submit']");
    var data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    status.textContent = "Jungiamasi...";
    try {
      await AtminimasAuth.signIn(data.email, data.password);
      window.location.href = "vartotojas.html";
    } catch (error) {
      status.textContent = error.message || "Nepavyko prisijungti.";
      button.disabled = false;
    }
  });
})();
