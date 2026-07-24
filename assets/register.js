(function () {
  var form = document.getElementById("register-form");
  var status = document.getElementById("register-status");
  var confirmation = document.getElementById("register-confirmation");
  var confirmationEmail = document.getElementById("register-confirmation-email");
  var resendButton = document.getElementById("register-resend");
  var resendStatus = document.getElementById("register-resend-status");
  var loginLink = document.getElementById("register-login-link");
  var pendingEmail = "";

  function setStatus(element, message, state) {
    if (window.AtminimasForms) AtminimasForms.setStatus(element, message, state);
    else element.textContent = message || "";
  }

  function setBusy(busy, label) {
    if (window.AtminimasForms) AtminimasForms.setBusy(form, busy, label || "Kuriama paskyra…");
    else form.querySelector("button[type='submit']").disabled = busy;
  }

  function setResendBusy(busy) {
    if (!resendButton.dataset.idleText) resendButton.dataset.idleText = resendButton.textContent.trim();
    resendButton.disabled = busy;
    if (busy) {
      resendButton.setAttribute("aria-busy", "true");
      resendButton.textContent = "Siunčiama…";
    } else {
      resendButton.removeAttribute("aria-busy");
      resendButton.textContent = resendButton.dataset.idleText;
    }
  }

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
    var data = Object.fromEntries(new FormData(form).entries());
    data.email = String(data.email || "").trim();
    setBusy(true, "Kuriama paskyra…");
    setStatus(status, "Saugiai kuriame jūsų paskyrą…", "loading");
    try {
      var result = await AtminimasAuth.signUp(data.email, data.password, data.name);
      if (result.access_token) {
        window.location.href = next;
        return;
      }
      pendingEmail = (result.user && result.user.email) || data.email;
      confirmationEmail.textContent = pendingEmail;
      confirmation.hidden = false;
      form.hidden = true;
      setStatus(status, "", "");
      form.reset();
      window.requestAnimationFrame(function () {
        confirmation.focus({ preventScroll: true });
        confirmation.scrollIntoView({ block: "center" });
      });
      setBusy(false);
    } catch (error) {
      setStatus(status, error.message || "Nepavyko sukurti paskyros.", "error");
      setBusy(false);
    }
  });

  resendButton.addEventListener("click", async function () {
    if (!pendingEmail) return;
    setResendBusy(true);
    setStatus(resendStatus, "Siunčiame naują patvirtinimo laišką…", "loading");
    try {
      await AtminimasAuth.resendSignupConfirmation(pendingEmail);
      setStatus(resendStatus, "Laiškas išsiųstas. Patikrinkite gautuosius ir šlamšto aplanką.", "success");
    } catch (error) {
      setStatus(resendStatus, error.message || "Laiško išsiųsti nepavyko. Palaukite ir bandykite dar kartą.", "error");
    } finally {
      setResendBusy(false);
    }
  });
})();
