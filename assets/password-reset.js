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
    var response = await fetch(authUrl("/user"), {
      method: "PUT",
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: password })
    });
    var data = await responseData(response);
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Nepavyko pakeisti slaptažodžio.");
  }

  if (accessToken && recoveryType === "recovery") {
    requestForm.hidden = true;
    updateForm.hidden = false;
    intro.textContent = "Įrašykite naują, bent 8 ženklų slaptažodį.";
  } else if (hashError) {
    status.textContent = "Atkūrimo nuoroda nebegalioja. Paprašykite naujos nuorodos.";
    history.replaceState(null, "", window.location.pathname);
  }

  requestForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = requestForm.querySelector("button[type='submit']");
    var email = String(new FormData(requestForm).get("email") || "").trim();
    button.disabled = true;
    status.textContent = "Siunčiamas laiškas...";
    try {
      await sendRecovery(email);
      requestForm.reset();
      status.textContent = "Jei tokia paskyra yra, atkūrimo nuoroda išsiųsta el. paštu.";
    } catch (error) {
      status.textContent = /rate limit/i.test(error.message)
        ? "Per daug bandymų. Palaukite ir pabandykite dar kartą."
        : (error.message || "Nepavyko išsiųsti laiško.");
    } finally {
      button.disabled = false;
    }
  });

  updateForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = updateForm.querySelector("button[type='submit']");
    var data = Object.fromEntries(new FormData(updateForm).entries());
    if (data.password !== data.password_confirm) {
      status.textContent = "Slaptažodžiai nesutampa.";
      return;
    }
    button.disabled = true;
    status.textContent = "Slaptažodis keičiamas...";
    try {
      await updatePassword(data.password);
      accessToken = "";
      history.replaceState(null, "", window.location.pathname);
      updateForm.reset();
      updateForm.hidden = true;
      intro.textContent = "Slaptažodis pakeistas. Dabar galite prisijungti.";
      status.innerHTML = "Slaptažodis pakeistas. <a href='prisijungti.html'>Prisijungti</a>";
    } catch (error) {
      status.textContent = error.message || "Nepavyko pakeisti slaptažodžio. Paprašykite naujos atkūrimo nuorodos.";
      button.disabled = false;
    }
  });
})();
