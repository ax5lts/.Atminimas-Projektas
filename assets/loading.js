(function () {
  var body = document.body;

  function skeletonCards(count) {
    var total = Math.max(1, Math.min(Number(count) || 1, 6));
    var cards = [];
    for (var index = 0; index < total; index += 1) {
      cards.push(
        "<article class='skeleton-card'>" +
          "<span class='skeleton-line skeleton-line--eyebrow'></span>" +
          "<span class='skeleton-line skeleton-line--title'></span>" +
          "<span class='skeleton-line'></span>" +
          "<span class='skeleton-line skeleton-line--short'></span>" +
        "</article>"
      );
    }
    return "<div class='skeleton-list' aria-hidden='true'>" + cards.join("") + "</div>";
  }

  function show(container, count) {
    if (!container) return;
    container.setAttribute("aria-busy", "true");
    container.innerHTML = skeletonCards(count);
  }

  function finish(container) {
    if (container) container.setAttribute("aria-busy", "false");
  }

  window.AtminimasLoading = Object.freeze({
    cards: skeletonCards,
    show: show,
    finish: finish
  });

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
