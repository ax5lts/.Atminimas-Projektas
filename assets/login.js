(function () {
  var form = document.getElementById("login-form");
  var status = document.getElementById("login-status");
  var requestedNext = (new URLSearchParams(window.location.search).get("next") || "").trim();
  var hasExplicitNext = /^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(requestedNext);
  var confirmationNoticeKey = "atminimas.auth.confirmation-notice.v1";
  var confirmationNotice = "";
  try { confirmationNotice = sessionStorage.getItem(confirmationNoticeKey); } catch (_error) {}

  function setStatus(message, state) {
    if (window.AtminimasForms) AtminimasForms.setStatus(status, message, state);
    else status.textContent = message || "";
  }

  function setBusy(busy) {
    if (window.AtminimasForms) AtminimasForms.setBusy(form, busy, "Jungiamasi…");
    else form.querySelector("button[type='submit']").disabled = busy;
  }

  if (confirmationNotice) {
    try { sessionStorage.removeItem(confirmationNoticeKey); } catch (_error) {}
    setStatus(confirmationNotice, "success");
  }

  function nextPage() {
    if (hasExplicitNext) return requestedNext;
    try {
      if (sessionStorage.getItem("atminimas.service-request.draft.v1")) return "kapu-prieziura.html#uzklausa";
    } catch (_error) {}
    return "vartotojas.html";
  }

  var next = nextPage();

  async function destination() {
    var me = await AtminimasAuth.user();
    if (!me) throw new Error("Sesija nebegalioja. Prisijunkite dar kartą.");
    var admin = await AtminimasAuth.isAdmin(me);
    if (AtminimasAuth.needsMfa(me, admin)) return "saugumas.html" + (hasExplicitNext ? "?next=" + encodeURIComponent(next) : "");
    return !hasExplicitNext && admin ? "admin.html" : next;
  }
  document.querySelectorAll("a[href='registruotis.html']").forEach(function (link) {
    if (next !== "vartotojas.html") link.href = "registruotis.html?next=" + encodeURIComponent(next);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (form.querySelector("button[type='submit']").disabled) return;
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

  if (AtminimasAuth.accessToken()) {
    setBusy(true);
    destination().then(function (page) {
      window.location.replace(page);
    }).catch(function () {
      AtminimasAuth.signOut();
      setStatus("Sesija nebegalioja. Prisijunkite dar kartą.", "error");
      setBusy(false);
    });
  }
})();
