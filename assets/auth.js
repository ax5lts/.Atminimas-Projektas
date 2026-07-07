(function (global) {
  var SESSION_KEY = "atminimas.auth.session.v1";

  function cfg() {
    var config = global.ATMINIMAS_CONFIG;
    if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      throw new Error("Trūksta Supabase konfigūracijos.");
    }
    return config;
  }

  function baseUrl() {
    return cfg().SUPABASE_URL.replace(/\/$/, "");
  }

  function anonKey() {
    return cfg().SUPABASE_ANON_KEY;
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (_err) {
      return null;
    }
  }

  function saveSession(value) {
    if (!value || !value.access_token) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function accessToken() {
    var current = session();
    return current && current.access_token ? current.access_token : "";
  }

  function userId() {
    var token = accessToken();
    if (!token) return "";
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      return JSON.parse(atob(part)).sub || "";
    } catch (_err) {
      return "";
    }
  }

  function translatedAuthMessage(message) {
    if (/invalid login credentials/i.test(message)) {
      return "Neteisingas el. paštas arba slaptažodis.";
    }
    if (/email not confirmed/i.test(message)) {
      return "El. paštas dar nepatvirtintas. Atidarykite Supabase atsiųstą laišką ir paspauskite patvirtinimo nuorodą.";
    }
    if (/user already registered/i.test(message)) {
      return "Paskyra su šiuo el. paštu jau užregistruota.";
    }
    if (/password should be at least/i.test(message)) {
      return "Slaptažodis per trumpas.";
    }
    if (/rate limit/i.test(message)) {
      return "Per daug bandymų. Palaukite ir pabandykite dar kartą.";
    }
    return message;
  }

  function headers(json) {
    var token = accessToken();
    var h = {
      apikey: anonKey(),
      Accept: "application/json"
    };
    h.Authorization = "Bearer " + (token || anonKey());
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async function authFetch(path, options) {
    var res = await fetch(baseUrl() + path, Object.assign({
      headers: headers(true)
    }, options || {}));
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      var message = data.msg || data.error_description || data.message || "Supabase Auth klaida";
      throw new Error(translatedAuthMessage(message));
    }
    return data;
  }

  async function signIn(email, password) {
    var data = await authFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    });
    saveSession(data);
    return data;
  }

  async function signUp(email, password, name) {
    var data = await authFetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email: email,
        password: password,
        data: { name: name || "" }
      })
    });
    if (data.access_token) saveSession(data);
    return data;
  }

  async function user() {
    if (!accessToken()) return null;
    try {
      return await authFetch("/auth/v1/user", { method: "GET" });
    } catch (_err) {
      clearSession();
      return null;
    }
  }

  async function isAdmin() {
    var me = await user();
    if (!me) return false;
    var res = await fetch(baseUrl() + "/rest/v1/user_roles?user_id=eq." + encodeURIComponent(me.id) + "&role=eq.admin&select=role&limit=1", {
      headers: headers(false)
    });
    if (!res.ok) return false;
    var rows = await res.json();
    return rows && rows.length > 0;
  }

  function signOut() {
    var token = accessToken();
    clearSession();
    if (token) {
      fetch(baseUrl() + "/auth/v1/logout", {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: anonKey(),
          Authorization: "Bearer " + token
        }
      }).catch(function () {});
    }
  }

  global.AtminimasAuth = {
    session: session,
    accessToken: accessToken,
    userId: userId,
    headers: headers,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    user: user,
    isAdmin: isAdmin
  };
})(window);


