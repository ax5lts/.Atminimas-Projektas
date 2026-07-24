(function () {
  var requestForm = document.getElementById("password-request-form");
  var updateForm = document.getElementById("password-update-form");
  var status = document.getElementById("password-status");
  var intro = document.getElementById("password-intro");
  var config = window.ATMINIMAS_CONFIG;
  var hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  var accessToken = hash.get("access_token") || "";
  var recoveryType = hash.get("type") || "";
  var hashError = hash.get("error_description") || "";
  if (window.location.hash && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function setStatus(message, state) {
    if (window.AtminimasForms) AtminimasForms.setStatus(status, message, state);
    else status.textContent = message || "";
  }

  function setBusy(form, busy, label) {
    if (window.AtminimasForms) AtminimasForms.setBusy(form, busy, label);
    else form.querySelector("button[type='submit']").disabled = busy;
  }

  function authUrl(path) {
    return config.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1" + path;
  }

  function resetPageUrl() {
    return new URL("slaptazodis.html", config.PUBLIC_SITE_URL || window.location.href).href;
  }

  async function responseData(response) {
    var text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch (_error) { return {}; }
  }

  async function sendRecovery(email) {
    var response = await fetch(authUrl("/recover?redirect_to=" + encodeURIComponent(resetPageUrl())), {
      method: "POST",
      headers: { apikey: config.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    });
    var data = await responseData(response);
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Nepavyko išsiųsti laiško.");
  }

  async function updatePassword(password) {
    var recoveryToken = accessToken;
    var response = await fetch(authUrl("/user"), {
      method: "PUT",
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + recoveryToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: password })
    });
    var data = await responseData(response);
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Nepavyko pakeisti slaptažodžio.");
    await fetch(authUrl("/logout"), {
      method: "POST",
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + recoveryToken
      }
    }).catch(function () {
      // Slaptažodis jau pakeistas; senų sesijų atšaukimo klaida neturi jo atkurti.
    });
  }

  if (accessToken && recoveryType === "recovery") {
    requestForm.hidden = true;
    updateForm.hidden = false;
    intro.textContent = "Įrašykite naują, bent 12 ženklų slaptažodį.";
  } else if (hashError) {
    setStatus("Atkūrimo nuoroda nebegalioja. Paprašykite naujos nuorodos.", "error");
  }

  requestForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var email = String(new FormData(requestForm).get("email") || "").trim();
    setBusy(requestForm, true, "Siunčiamas laiškas…");
    setStatus("Ruošiame saugią atkūrimo nuorodą…", "loading");
    try {
      await sendRecovery(email);
      requestForm.reset();
      setStatus("Jei tokia paskyra yra, atkūrimo nuoroda išsiųsta el. paštu.", "success");
    } catch (error) {
      setStatus(/rate limit/i.test(error.message)
        ? "Per daug bandymų. Palaukite ir pabandykite dar kartą."
        : (error.message || "Nepavyko išsiųsti laiško."), "error");
    } finally {
      setBusy(requestForm, false);
    }
  });

  updateForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(updateForm).entries());
    if (data.password !== data.password_confirm) {
      setStatus("Slaptažodžiai nesutampa.", "error");
      return;
    }
    setBusy(updateForm, true, "Išsaugoma…");
    setStatus("Saugiai keičiame slaptažodį…", "loading");
    try {
      await updatePassword(data.password);
      accessToken = "";
      updateForm.reset();
      updateForm.hidden = true;
      intro.textContent = "Slaptažodis pakeistas. Dabar galite prisijungti.";
      status.innerHTML = "Slaptažodis pakeistas. <a href='prisijungti.html'>Prisijungti</a>";
      status.dataset.state = "success";
    } catch (error) {
      setStatus(error.message || "Nepavyko pakeisti slaptažodžio. Paprašykite naujos atkūrimo nuorodos.", "error");
      setBusy(updateForm, false);
    }
  });
})();
