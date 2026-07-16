(function () {
  var page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  var header = document.querySelector(".site-header");
  var nav = header && header.querySelector(".site-nav");

  function icon(path) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  function normalizePage(value) {
    var parsed = new URL(value, window.location.href);
    return (parsed.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function setCurrentLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(?:mailto:|tel:|javascript:)/i.test(href)) return;
      if (normalizePage(link.href) === page) link.setAttribute("aria-current", "page");
    });
  }

  function closeMenu(returnFocus) {
    if (!header || !header.classList.contains("site-menu-open")) return;
    header.classList.remove("site-menu-open");
    document.body.classList.remove("site-menu-open");
    var toggle = header.querySelector("[data-site-menu-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      if (returnFocus) toggle.focus();
    }
  }

  function setupHeaderMenu() {
    if (!header || !nav || header.querySelector("[data-site-menu-toggle]")) return;
    var button = document.createElement("button");
    button.className = "site-menu-toggle";
    button.type = "button";
    button.dataset.siteMenuToggle = "";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Atidaryti meniu");
    button.innerHTML = "<span></span><span></span><span></span>";
    nav.id = nav.id || "site-navigation";
    button.setAttribute("aria-controls", nav.id);
    nav.before(button);
    header.classList.add("site-menu-ready");

    button.addEventListener("click", function () {
      var open = !header.classList.contains("site-menu-open");
      header.classList.toggle("site-menu-open", open);
      document.body.classList.toggle("site-menu-open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Uždaryti meniu" : "Atidaryti meniu");
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a, button")) closeMenu(false);
    });
    document.addEventListener("click", function (event) {
      if (header.classList.contains("site-menu-open") && !header.contains(event.target)) closeMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu(true);
    });
  }

  function setupSkipLink() {
    if (!document.querySelector("main") || document.querySelector(".skip-link")) return;
    var main = document.querySelector("main");
    if (!main.id) main.id = "main-content";
    var link = document.createElement("a");
    link.className = "skip-link";
    link.href = "#" + main.id;
    link.textContent = "Pereiti prie turinio";
    document.body.prepend(link);
  }

  function setupBackLinks() {
    document.querySelectorAll(".breadcrumbs").forEach(function (breadcrumbs) {
      if (breadcrumbs.querySelector("[data-context-back]")) return;
      var button = document.createElement("button");
      button.className = "context-back";
      button.type = "button";
      button.dataset.contextBack = "";
      button.textContent = "← Atgal";
      button.addEventListener("click", function () {
        if (window.history.length > 1) window.history.back();
        else window.location.href = "index.html";
      });
      breadcrumbs.prepend(button);
    });
  }

  function setupMobileDock() {
    if (!document.querySelector(".site-shell") || document.body.classList.contains("editor-page") || document.body.classList.contains("memorial-page") || page === "admin.html") return;
    if (document.querySelector(".mobile-dock")) return;
    var items = [
      { href: "index.html", label: "Pradžia", pages: ["index.html"], icon: "M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z" },
      { href: "kapu-ieskojimas.html", label: "Kapų paieška", pages: ["kapu-ieskojimas.html"], icon: "M10.8 3a7.8 7.8 0 1 0 4.9 13.9L21 22l1-1-5.1-5.2A7.8 7.8 0 0 0 10.8 3m0 2a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6" },
      { href: "redaktorius.html", label: "Kurti", pages: ["redaktorius.html", "parduotuve.html", "apmokejimas.html"], icon: "M12 3a1 1 0 0 1 1 1v7h7a1 1 0 1 1 0 2h-7v7a1 1 0 1 1-2 0v-7H4a1 1 0 1 1 0-2h7V4a1 1 0 0 1 1-1" },
      { href: "vartotojas.html", label: "Paskyra", pages: ["vartotojas.html", "prisijungti.html", "registruotis.html", "slaptazodis.html", "klientai.html"], icon: "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9m0 11c5 0 8 2.5 8 5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5C4 16.5 7 14 12 14" }
    ];
    var dock = document.createElement("nav");
    dock.className = "mobile-dock";
    dock.setAttribute("aria-label", "Greitoji navigacija");
    dock.innerHTML = items.map(function (item) {
      var current = item.pages.indexOf(page) !== -1;
      return '<a href="' + item.href + '"' + (current ? ' aria-current="page"' : "") + ">" +
        icon(item.icon) + "<span>" + item.label + "</span></a>";
    }).join("");
    document.body.appendChild(dock);
    document.body.classList.add("has-mobile-dock");
  }

  function setupRevealAnimations() {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var selector = [
      ".home-section",
      ".shop-heading",
      ".shop-layout",
      ".product-choice",
      ".how-step",
      ".info-box",
      ".client-access",
      ".grave-search-hero",
      ".grave-list-item",
      ".legal-content section",
      ".admin-panel"
    ].join(",");
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -36px" });

    function observe(root) {
      if (root.matches && root.matches(selector)) {
        root.classList.add("reveal-item");
        observer.observe(root);
      }
      if (!root.querySelectorAll) return;
      root.querySelectorAll(selector).forEach(function (element) {
        if (element.classList.contains("reveal-item")) return;
        element.classList.add("reveal-item");
        observer.observe(element);
      });
    }

    observe(document);
    if ("MutationObserver" in window) {
      new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) observe(node);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
    return Promise.resolve();
  }

  function toast(message) {
    var existing = document.querySelector(".site-toast");
    if (existing) existing.remove();
    var element = document.createElement("div");
    element.className = "site-toast";
    element.setAttribute("role", "status");
    element.textContent = message;
    document.body.appendChild(element);
    requestAnimationFrame(function () { element.classList.add("is-visible"); });
    window.setTimeout(function () {
      element.classList.remove("is-visible");
      window.setTimeout(function () { element.remove(); }, 220);
    }, 2600);
  }

  setCurrentLinks(document);
  setupHeaderMenu();
  setupSkipLink();
  setupBackLinks();
  setupMobileDock();
  setupRevealAnimations();

  window.AtminimasUi = {
    copyText: copyText,
    toast: toast
  };
})();
