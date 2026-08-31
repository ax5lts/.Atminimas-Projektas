(function () {
  var savedKey = "atminimas.saved-memorials.v1";
  var list = document.querySelector("[data-saved-memorials-list]");
  var status = document.querySelector("[data-saved-memorials-status]");
  if (!list) return;

  function announce(message) {
    if (status) status.textContent = message || "";
    if (message && window.AtminimasUi) AtminimasUi.toast(message);
  }

  function safeMemorialUrl(value, id) {
    try {
      var parsed = new URL(String(value || ""), window.location.href);
      var page = (parsed.pathname.split("/").pop() || "").toLowerCase();
      if (parsed.origin !== window.location.origin || page !== "sablonas-viskas.html") return "";
      if ((parsed.searchParams.get("slug") || "") !== String(id || "")) return "";
      parsed.hash = "";
      return parsed.href;
    } catch (_error) {
      return "";
    }
  }

  function savedItems() {
    try {
      var stored = JSON.parse(localStorage.getItem(savedKey) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.map(function (item) {
        var id = String(item && item.id || "").trim();
        var url = safeMemorialUrl(item && item.url, id);
        if (!id || !url) return null;
        return {
          id: id,
          name: String(item.name || "Atminimo puslapis").trim().slice(0, 180) || "Atminimo puslapis",
          url: url,
          deathDate: String(item.death_date || "").trim()
        };
      }).filter(Boolean).slice(0, 100);
    } catch (_error) {
      return [];
    }
  }

  function formattedDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("lt-LT", { dateStyle: "long", timeZone: "UTC" }).format(date);
  }

  function button(label, action, id) {
    var element = document.createElement("button");
    element.className = "button button--ghost";
    element.type = "button";
    element.textContent = label;
    element.dataset.savedMemorialAction = action;
    element.dataset.savedMemorialId = id;
    return element;
  }

  function render() {
    var items = savedItems();
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "saved-memorials__empty";
      empty.textContent = "Išsaugotų atminimo puslapių dar nėra. Atidarę atminimo puslapį pasirinkite „Išsaugoti“ — jis atsiras čia.";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var article = document.createElement("article");
      article.className = "saved-memorial-card";
      var heading = document.createElement("h3");
      heading.textContent = item.name;
      article.appendChild(heading);
      var date = formattedDate(item.deathDate);
      if (date) {
        var meta = document.createElement("p");
        meta.textContent = "Atminimo diena: " + date;
        article.appendChild(meta);
      }
      var actions = document.createElement("div");
      actions.className = "actions";
      var open = document.createElement("a");
      open.className = "button";
      open.href = item.url;
      open.textContent = "Atidaryti";
      actions.appendChild(open);
      actions.appendChild(button("Dalintis", "share", item.id));
      if (date) actions.appendChild(button("Pridėti priminimą", "reminder", item.id));
      actions.appendChild(button("Pašalinti", "remove", item.id));
      article.appendChild(actions);
      list.appendChild(article);
    });
  }

  function itemById(id) {
    return savedItems().find(function (item) { return item.id === id; }) || null;
  }

  function copyLink(item) {
    if (window.AtminimasUi) return AtminimasUi.copyText(item.url);
    return navigator.clipboard.writeText(item.url);
  }

  async function share(item) {
    if (navigator.share) {
      try {
        await navigator.share({ title: item.name + " – Atminimas", text: "Aplankykite " + item.name + " atminimo puslapį.", url: item.url });
      } catch (error) {
        if (error && error.name !== "AbortError") announce("Pasidalyti nepavyko.");
      }
      return;
    }
    try {
      await copyLink(item);
      announce("Atminimo puslapio nuoroda nukopijuota.");
    } catch (_error) {
      announce("Nuorodos nukopijuoti nepavyko.");
    }
  }

  function escapeIcs(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function downloadReminder(item) {
    var match = item.deathDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return announce("Priminimui reikia pilnos mirties datos.");
    var now = new Date();
    var year = now.getFullYear();
    var occurrence = new Date(year, Number(match[2]) - 1, Number(match[3]));
    if (occurrence < new Date(year, now.getMonth(), now.getDate())) year += 1;
    var stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    var start = String(year) + match[2] + match[3];
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atminimas//Sukakties priminimas//LT", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT", "UID:" + escapeIcs(item.id) + "@atminimas", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + start, "DURATION:P1D", "RRULE:FREQ=YEARLY",
      "SUMMARY:" + escapeIcs(item.name + " atminimo diena"),
      "DESCRIPTION:" + escapeIcs("Aplankyti atminimo puslapį: " + item.url), "URL:" + item.url,
      "END:VEVENT", "END:VCALENDAR"
    ];
    var objectUrl = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = "atminimo-priminimas-" + item.id + ".ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    announce("Kasmetinis priminimas paruoštas kalendoriui.");
  }

  function remove(item) {
    var next = savedItems().filter(function (saved) { return saved.id !== item.id; });
    localStorage.setItem(savedKey, JSON.stringify(next.map(function (saved) {
      return { id: saved.id, name: saved.name, url: saved.url, death_date: saved.deathDate || null };
    })));
    render();
    announce("Atminimas pašalintas iš išsaugotų.");
  }

  list.addEventListener("click", function (event) {
    var control = event.target.closest("[data-saved-memorial-action]");
    if (!control) return;
    var item = itemById(control.dataset.savedMemorialId);
    if (!item) return render();
    var action = control.dataset.savedMemorialAction;
    if (action === "share") share(item);
    if (action === "reminder") downloadReminder(item);
    if (action === "remove") remove(item);
  });

  window.addEventListener("storage", function (event) {
    if (event.key === savedKey) render();
  });
  render();
})();
