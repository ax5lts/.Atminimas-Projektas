(function () {
  var form = document.getElementById("login-form");
  var status = document.getElementById("login-status");

  function nextPage() {
    var value = (new URLSearchParams(window.location.search).get("next") || "").trim();
    if (/^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(value)) return value;
    return sessionStorage.getItem("atminimas.service-request.draft.v1") ? "index.html#kitos-paslaugos" : "vartotojas.html";
  }

  var next = nextPage();

  async function destination() {
    return await AtminimasAuth.isAdmin() ? "admin.html" : next;
  }
  document.querySelectorAll("a[href='registruotis.html']").forEach(function (link) {
    if (next !== "vartotojas.html") link.href = "registruotis.html?next=" + encodeURIComponent(next);
  });

  if (AtminimasAuth.accessToken()) {
    destination().then(function (page) {
      window.location.replace(page);
    }).catch(function () {
      AtminimasAuth.signOut();
      status.textContent = "Sesija nebegalioja. Prisijunkite dar kartą.";
    });
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
      window.location.href = await destination();
    } catch (error) {
      status.textContent = error.message || "Nepavyko prisijungti.";
      button.disabled = false;
    }
  });
})();
