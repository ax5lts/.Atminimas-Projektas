(function () {
  var form = document.getElementById("login-form");
  var status = document.getElementById("login-status");
  var requestedNext = (new URLSearchParams(window.location.search).get("next") || "").trim();
  var hasExplicitNext = /^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(requestedNext);
  var confirmationNoticeKey = "atminimas.auth.confirmation-notice.v1";
  var confirmationNotice = sessionStorage.getItem(confirmationNoticeKey);

  function setStatus(message, state) {
    if (window.AtminimasForms) AtminimasForms.setStatus(status, message, state);
    else status.textContent = message || "";
  }

  function setBusy(busy) {
    if (window.AtminimasForms) AtminimasForms.setBusy(form, busy, "Jungiamasi…");
    else form.querySelector("button[type='submit']").disabled = busy;
  }

  if (confirmationNotice) {
    sessionStorage.removeItem(confirmationNoticeKey);
    setStatus(confirmationNotice, "success");
  }

  function nextPage() {
    if (hasExplicitNext) return requestedNext;
    return sessionStorage.getItem("atminimas.service-request.draft.v1") ? "index.html#kitos-paslaugos" : "vartotojas.html";
  }

  var next = nextPage();

  async function destination() {
    return !hasExplicitNext && await AtminimasAuth.isAdmin() ? "admin.html" : next;
  }
  document.querySelectorAll("a[href='registruotis.html']").forEach(function (link) {
    if (next !== "vartotojas.html") link.href = "registruotis.html?next=" + encodeURIComponent(next);
  });

  if (AtminimasAuth.accessToken()) {
    destination().then(function (page) {
      window.location.replace(page);
    }).catch(function () {
      AtminimasAuth.signOut();
      setStatus("Sesija nebegalioja. Prisijunkite dar kartą.", "error");
    });
    return;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    data.email = String(data.email || "").trim();
    setBusy(true);
    setStatus("Tikriname prisijungimo duomenis…", "loading");
    try {
      await AtminimasAuth.signIn(data.email, data.password);
      window.location.href = await destination();
    } catch (error) {
      setStatus(error.message || "Nepavyko prisijungti.", "error");
      setBusy(false);
    }
  });
})();
