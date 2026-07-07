(function () {
  var body = document.body;
  if (!body || !body.hasAttribute("data-loading")) return;

  var startedAt = performance.now();
  var finished = false;

  function hideLoader() {
    if (finished) return;
    finished = true;
    var remaining = Math.max(0, 240 - (performance.now() - startedAt));
    window.setTimeout(function () {
      body.classList.add("page-loaded");
      body.setAttribute("aria-busy", "false");
      window.setTimeout(function () { body.removeAttribute("data-loading"); }, 260);
    }, remaining);
  }

  body.setAttribute("aria-busy", "true");
  if (document.readyState === "complete") hideLoader();
  else window.addEventListener("load", hideLoader, { once: true });
  window.setTimeout(hideLoader, 4000);
})();
