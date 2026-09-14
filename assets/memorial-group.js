(function (root) {
  "use strict";
  function name(person, index) {
    var data = person.form || person;
    return [data.vardas, data.pavarde].filter(Boolean).join(" ") || "Žmogus " + (index + 1);
  }
  function render(container, people, selected, choose, options) {
    people.forEach(function (person, index) {
      var button = container.children[index];
      if (!button) {
        button = document.createElement("button");
        button.appendChild(document.createElement("span"));
        button.appendChild(document.createElement("span"));
        container.appendChild(button);
      }
      button.type = "button";
      button.className = "memorial-person";
      button.setAttribute("aria-pressed", String(index === selected));
      var media = person.media || person.media_json || [];
      if (Array.isArray(person.library)) media = person.library.map(function (item) { return item.media; }).filter(Boolean);
      var photo = media.find(function (item) { return item.type === "image" && item.url; });
      var url = person.thumbnail || (photo && photo.url);
      if (url && /^(https?:|blob:)/i.test(url)) {
        var img = button.firstElementChild;
        if (img.tagName !== "IMG") {
          img = document.createElement("img");
          button.firstElementChild.replaceWith(img);
        }
        if (img.getAttribute("src") !== url) img.src = url;
        img.alt = "";
      } else {
        var placeholder = button.firstElementChild;
        if (placeholder.tagName !== "SPAN") {
          placeholder = document.createElement("span");
          button.firstElementChild.replaceWith(placeholder);
        }
        placeholder.className = "memorial-person-placeholder";
        var initial = name(person, index).charAt(0).toUpperCase();
        if (placeholder.textContent !== initial) placeholder.textContent = initial;
      }
      var label = button.children[1];
      var fullName = name(person, index);
      if (label.textContent !== fullName) label.textContent = fullName;
      if (options && options.readiness) {
        var badge = button.children[2];
        if (!badge) { badge = document.createElement("small"); button.appendChild(badge); }
        badge.className = "memorial-person-readiness";
        var data = person.form || person;
        var hasName = !!String(data.vardas || "").trim();
        var hasPhoto = !!url || (Array.isArray(person.library) && person.library.length > 0);
        badge.textContent = !hasName ? (hasPhoto ? "Įrašykite vardą" : "Vardas ir nuotrauka") : (hasPhoto ? "Paruošta" : "Pridėkite nuotrauką");
        badge.dataset.ready = String(hasName && hasPhoto);
      } else if (button.children[2]) button.children[2].remove();
      button.onclick = function () { choose(index); };
    });
    while (container.children.length > people.length) container.lastElementChild.remove();
  }
  root.AtminimasGroup = { name: name, render: render, maxPeople: 8 };
})(window);
