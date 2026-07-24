(function () {
  var form = document.getElementById("register-form");
  var status = document.getElementById("register-status");
  var confirmation = document.getElementById("register-confirmation");
  var confirmationEmail = document.getElementById("register-confirmation-email");
  var resendButton = document.getElementById("register-resend");
  var resendStatus = document.getElementById("register-resend-status");
  var loginLink = document.getElementById("register-login-link");
  var pendingEmail = "";

  function nextPage() {
    var value = (new URLSearchParams(window.location.search).get("next") || "").trim();
    if (/^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(value)) return value;
    return sessionStorage.getItem("atminimas.service-request.draft.v1") ? "index.html#kitos-paslaugos" : "vartotojas.html";
  }

  var next = nextPage();
  document.querySelectorAll("a[href='prisijungti.html']").forEach(function (link) {
    if (next !== "vartotojas.html") link.href = "prisijungti.html?next=" + encodeURIComponent(next);
  });
  if (loginLink && next !== "vartotojas.html") {
    loginLink.href = "prisijungti.html?next=" + encodeURIComponent(next);
  }

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
      pendingEmail = (data.user && data.user.email) || email;
      confirmationEmail.textContent = pendingEmail;
      confirmation.hidden = false;
      form.hidden = true;
      status.textContent = "";
      form.reset();
      window.requestAnimationFrame(function () {
        confirmation.focus({ preventScroll: true });
        confirmation.scrollIntoView({ block: "center" });
      });
    } catch (error) {
      status.textContent = error.message || "Nepavyko sukurti paskyros.";
    } finally {
      button.disabled = false;
    }
  });

  resendButton.addEventListener("click", async function () {
    if (!pendingEmail) return;
    resendButton.disabled = true;
    resendStatus.textContent = "Siunčiame naują patvirtinimo laišką…";
    try {
      await AtminimasAuth.resendSignupConfirmation(pendingEmail);
      resendStatus.textContent = "Laiškas išsiųstas. Patikrinkite gautuosius ir šlamšto aplanką.";
    } catch (error) {
      resendStatus.textContent = error.message || "Laiško išsiųsti nepavyko. Palaukite ir bandykite dar kartą.";
    } finally {
      resendButton.disabled = false;
    }
  });
})();
