(function () {
  var body = document.body;
  if (!body || !body.hasAttribute("data-loading")) return;

  var finished = false;

  function hideLoader() {
    if (finished) return;
    finished = true;
    body.classList.add("page-loaded");
    body.setAttribute("aria-busy", "false");
    window.setTimeout(function () { body.removeAttribute("data-loading"); }, 260);
  }

  body.setAttribute("aria-busy", "true");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideLoader, { once: true });
  } else {
    hideLoader();
  }
  window.setTimeout(hideLoader, 4000);
})();
