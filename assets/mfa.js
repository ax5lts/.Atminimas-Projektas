(function () {
  var auth = window.AtminimasAuth;
  var status = document.getElementById("mfa-status");
  var enroll = document.getElementById("mfa-enroll");
  var form = document.getElementById("mfa-form");
  var factors = document.getElementById("mfa-factors");
  var qr = document.getElementById("mfa-qr");
  var setup = document.getElementById("mfa-setup");
  var secret = document.getElementById("mfa-secret");
  var continueLink = document.getElementById("mfa-continue");
  var busy = false;
  var pending = "";
  var requested = new URLSearchParams(location.search).get("next") || "";
  var next = /^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(requested) && !/^saugumas\.html/i.test(requested) ? requested : "";
  function clearSetup() { qr.removeAttribute("src"); secret.textContent = ""; setup.hidden = true; }
  async function run(action) {
    if (busy) return;
    busy = true; form.inert = true; enroll.disabled = true;
    try { await action(); } catch (error) { status.textContent = error.message || "Nepavyko atlikti veiksmo. Bandykite dar kartą."; }
    finally { busy = false; form.inert = false; enroll.disabled = false; }
  }
  async function load() {
    var me = await auth.user();
    if (!me) { location.replace("prisijungti.html?next=" + encodeURIComponent("saugumas.html" + (next ? "?next=" + encodeURIComponent(next) : ""))); return; }
    var all = me.factors || [];
    var verified = all.filter(function (f) { return f.status === "verified"; });
    var totp = verified.filter(function (f) { return f.factor_type === "totp"; });
    factors.replaceChildren();
    totp.forEach(function (f) {
      var option = document.createElement("option"); option.value = f.id; option.textContent = f.friendly_name || "Autentifikavimo programėlė"; factors.appendChild(option);
    });
    form.hidden = !totp.length;
    document.getElementById("mfa-code-entry").hidden = auth.assuranceLevel() === "aal2";
    document.getElementById("mfa-remove").hidden = !totp.length || auth.assuranceLevel() !== "aal2";
    continueLink.hidden = auth.needsMfa(me);
    continueLink.href = next || (await auth.isAdmin(me) ? "admin.html" : "vartotojas.html");
    enroll.hidden = verified.length > 0 && auth.assuranceLevel() !== "aal2";
    status.textContent = verified.length ? (auth.needsMfa(me) ? "Įrašykite kodą iš autentifikavimo programėlės." : "Dviejų žingsnių patvirtinimas įjungtas. Ši sesija patvirtinta.") : "Dviejų žingsnių patvirtinimas dar neįjungtas. Prijunkite autentifikavimo programėlę telefone.";
    if (verified.length && !totp.length) status.textContent = "Paskyra naudoja kitą patvirtinimo būdą. Dėl prieigos kreipkitės į administratorių.";
  }
  enroll.addEventListener("click", function () { run(async function () {
    if (pending) { await auth.removeMfa(pending); pending = ""; }
    clearSetup();
    var data = await auth.enrollMfa(); pending = data.id;
    if (!data.totp || !data.totp.qr_code || !data.totp.secret) throw new Error("Nepavyko paruošti QR kodo.");
    var option = document.createElement("option"); option.value = data.id; option.textContent = "Nauja autentifikavimo programėlė"; factors.replaceChildren(option);
    // Render SVG as an image, never as executable HTML. Do not persist the secret.
    qr.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data.totp.qr_code);
    secret.textContent = data.totp.secret;
    setup.hidden = false; form.hidden = false; continueLink.hidden = true;
    document.getElementById("mfa-code-entry").hidden = false;
    document.getElementById("mfa-remove").hidden = true;
    status.textContent = "Nuskenuokite QR kodą savo programėle ir įrašykite jos rodomą kodą. QR kodu ir slaptu raktu nesidalykite.";
    form.elements.code.focus();
  }); });
  form.addEventListener("submit", function (event) { event.preventDefault(); run(async function () {
    await auth.verifyMfa(factors.value, form.elements.code.value.trim());
    form.elements.code.value = ""; pending = ""; clearSetup(); await load();
    continueLink.focus();
  }); });
  document.getElementById("mfa-remove").addEventListener("click", function () {
    if (!confirm("Pašalinti pasirinktą autentifikavimo programėlę? Paskyros apsauga susilpnės, jei tai paskutinė programėlė.")) return;
    run(async function () { await auth.removeMfa(factors.value); clearSetup(); await load(); });
  });
  window.addEventListener("pagehide", clearSetup);
  run(load);
})();
