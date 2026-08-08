(function () {
  if (document.querySelector("[data-help-chatbot-root]")) return;

  var GREETING = "Sveiki! Esu „Atminimas“ virtualus pagalbininkas. Galiu padėti su QR kodu, atminimo puslapio kūrimu, redagavimu, privatumu ir kitais svetainės naudojimo klausimais. Kuo galiu padėti?";
  var quickQuestions = [
    "Kaip veikia QR kodas?",
    "Kaip sukurti atminimo puslapį?",
    "Pamiršau prieigos kodą",
    "Kaip redaguoti puslapį?",
    "Susisiekti su pagalba"
  ];
  var conversation = [];
  var sending = false;
  var closeTimer = null;

  var root = document.createElement("div");
  root.className = "help-chatbot-root";
  root.dataset.helpChatbotRoot = "";
  root.innerHTML =
    '<button class="help-chatbot-launcher" type="button" aria-expanded="false" aria-controls="help-chatbot-panel">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.75A2.75 2.75 0 0 1 6.75 2h10.5A2.75 2.75 0 0 1 20 4.75v8.5A2.75 2.75 0 0 1 17.25 16H10l-4.65 4.07A.8.8 0 0 1 4 19.47V16.1a2.75 2.75 0 0 1-2-2.65v-8.7A2.75 2.75 0 0 1 4.75 2H5A3.73 3.73 0 0 0 4 4.75Zm3.25 3.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.75 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.75 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"/></svg>' +
      '<span>Reikia pagalbos?</span>' +
    '</button>' +
    '<section class="help-chatbot-panel" id="help-chatbot-panel" role="dialog" aria-modal="false" aria-labelledby="help-chatbot-title" hidden>' +
      '<header class="help-chatbot-header">' +
        '<span class="help-chatbot-avatar" aria-hidden="true">A</span>' +
        '<div><strong id="help-chatbot-title">„Atminimas“ pagalba</strong><small>Virtualus pagalbininkas</small></div>' +
        '<button class="help-chatbot-close" type="button" aria-label="Uždaryti pagalbos pokalbį">×</button>' +
      '</header>' +
      '<div class="help-chatbot-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>' +
      '<div class="help-chatbot-typing" role="status" aria-live="polite" hidden>' +
        '<span class="visually-hidden">Virtualus pagalbininkas rašo</span>' +
        '<i></i><i></i><i></i>' +
      '</div>' +
      '<a class="help-chatbot-support" href="rekvizitai.html" hidden>Susisiekti su pagalba</a>' +
      '<form class="help-chatbot-form">' +
        '<label class="visually-hidden" for="help-chatbot-input">Jūsų klausimas</label>' +
        '<textarea id="help-chatbot-input" name="message" rows="1" maxlength="700" placeholder="Parašykite klausimą…" required></textarea>' +
        '<button type="submit">Siųsti</button>' +
      '</form>' +
      '<p class="help-chatbot-safety">Nerašykite prieigos kodo, slaptažodžio ar kortelės duomenų.</p>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = root.querySelector(".help-chatbot-launcher");
  var panel = root.querySelector(".help-chatbot-panel");
  var closeButton = root.querySelector(".help-chatbot-close");
  var messages = root.querySelector(".help-chatbot-messages");
  var typing = root.querySelector(".help-chatbot-typing");
  var supportLink = root.querySelector(".help-chatbot-support");
  var form = root.querySelector(".help-chatbot-form");
  var input = root.querySelector(".help-chatbot-form textarea");
  var submit = root.querySelector(".help-chatbot-form button");

  function addMessage(role, text, remember) {
    var row = document.createElement("div");
    row.className = "help-chatbot-message help-chatbot-message--" + role;
    var bubble = document.createElement("p");
    bubble.textContent = text;
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    if (remember) {
      conversation.push({ role: role === "user" ? "user" : "assistant", content: text });
      conversation = conversation.slice(-12);
    }
  }

  function addQuickQuestions() {
    var choices = document.createElement("div");
    choices.className = "help-chatbot-quick";
    choices.setAttribute("aria-label", "Greiti klausimai");
    quickQuestions.forEach(function (question) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = question;
      button.dataset.helpQuestion = question;
      choices.appendChild(button);
    });
    messages.appendChild(choices);
  }

  function endpoint() {
    var config = window.ATMINIMAS_CONFIG || {};
    return config.SUPABASE_URL
      ? config.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/help-chatbot"
      : "";
  }

  function requestHeaders() {
    var config = window.ATMINIMAS_CONFIG || {};
    var headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (config.SUPABASE_ANON_KEY) {
      headers.apikey = config.SUPABASE_ANON_KEY;
      if (config.SUPABASE_ANON_KEY.indexOf("sb_publishable_") !== 0) {
        headers.Authorization = "Bearer " + config.SUPABASE_ANON_KEY;
      }
    }
    return headers;
  }

  function setSending(active) {
    sending = active;
    typing.hidden = !active;
    input.disabled = active;
    submit.disabled = active;
    submit.textContent = active ? "Siunčiama…" : "Siųsti";
    if (active) messages.scrollTop = messages.scrollHeight;
  }

  function showSupport(show) {
    supportLink.hidden = !show;
  }

  async function ask(question) {
    question = String(question || "").replace(/\s+/g, " ").trim().slice(0, 700);
    if (sending || question.length < 2) return;
    var previous = conversation.slice(-6);
    addMessage("user", question, true);
    input.value = "";
    input.style.height = "";
    showSupport(false);
    setSending(true);

    var url = endpoint();
    if (!url) {
      addMessage("assistant", "Pagalbos pokalbis dar nesukonfigūruotas. Atidarykite kontaktų puslapį.", true);
      showSupport(true);
      setSending(false);
      return;
    }

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 25000);
    try {
      var response = await fetch(url, {
        method: "POST",
        headers: requestHeaders(),
        signal: controller.signal,
        body: JSON.stringify({ message: question, history: previous })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw Object.assign(
        new Error(data.error || "Atsakymo gauti nepavyko."),
        { needsSupport: !!data.needs_support, fromServer: true }
      );
      addMessage("assistant", data.answer || "Atsakymo gauti nepavyko.", true);
      showSupport(!!data.needs_support);
    } catch (error) {
      var timeout = error && error.name === "AbortError";
      var fromServer = !!(error && error.fromServer);
      addMessage(
        "assistant",
        timeout
          ? "Atsakymas užtruko per ilgai. Pabandykite dar kartą arba susisiekite su „Atminimas“ pagalba."
          : (fromServer
            ? error.message
            : "Pagalbos pokalbis laikinai nepasiekiamas. Pabandykite dar kartą arba susisiekite su „Atminimas“ pagalba."),
        true
      );
      showSupport(timeout || !fromServer || !!(error && error.needsSupport));
    } finally {
      window.clearTimeout(timer);
      setSending(false);
      input.focus();
    }
  }

  function openChat() {
    window.clearTimeout(closeTimer);
    panel.hidden = false;
    window.requestAnimationFrame(function () {
      panel.classList.add("is-open");
      launcher.setAttribute("aria-expanded", "true");
    });
    window.setTimeout(function () { input.focus(); }, 180);
  }

  function closeChat(returnFocus) {
    panel.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    closeTimer = window.setTimeout(function () { panel.hidden = true; }, 190);
    if (returnFocus) launcher.focus();
  }

  addMessage("assistant", GREETING, false);
  addQuickQuestions();

  launcher.addEventListener("click", function () {
    if (panel.hidden) openChat();
    else closeChat(false);
  });
  closeButton.addEventListener("click", function () { closeChat(true); });
  messages.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-help-question]");
    if (button) ask(button.dataset.helpQuestion);
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) closeChat(true);
  });
})();
