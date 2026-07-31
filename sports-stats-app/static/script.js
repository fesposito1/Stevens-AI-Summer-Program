let metricsCatalog = {};
let gameMetricKeysBySport = {};
let currentUsername = null;
let currentIsAdmin = false;
let currentIsPremium = false;

const ALL_TAB_IDS = [
  "tab-home", "tab-my-stats", "tab-explore", "tab-coach", "tab-premium", "tab-account", "tab-admin",
];

window.addEventListener("DOMContentLoaded", init);

async function init() {
  document.querySelectorAll(".footer-year").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
  await loadMetricsCatalog();
  setupAuthUI();
  setupTabUI();
  setupAvatarMenu();
  await checkAuth();
}

// ---------- Avatar dropdown ----------

function setupAvatarMenu() {
  const btn = document.getElementById("avatar-btn");
  const dropdown = document.getElementById("avatar-dropdown");

  function closeMenu() {
    dropdown.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", !willOpen);
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.classList.contains("hidden") && !event.target.closest(".avatar-menu")) {
      closeMenu();
    }
  });
}

async function loadMetricsCatalog() {
  const res = await fetch("/api/metrics/catalog");
  const data = await res.json();
  metricsCatalog = data.sports || {};
  gameMetricKeysBySport = data.game_metric_keys || {};
}

async function checkAuth() {
  const res = await fetch("/api/auth/me");
  const data = await res.json();
  if (data.username) {
    showApp(data.username, data.is_admin, data.is_premium);
  } else {
    showAuthScreen();
  }
}

// ---------- Auth screen ----------

function showAuthPanel(name) {
  document.getElementById("login-form").classList.toggle("hidden", name !== "login");
  document.getElementById("signup-form").classList.toggle("hidden", name !== "signup");
  document.getElementById("forgot-username-form").classList.toggle("hidden", name !== "forgot-username");
  document.getElementById("forgot-reset-form").classList.toggle("hidden", name !== "forgot-reset");
  showAuthMessage("");
}

function setupAuthUI() {
  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showAuthPanel(btn.dataset.authTab);
    });
  });

  document.getElementById("forgot-link").addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
    showAuthPanel("forgot-username");
  });

  function backToLogin(event) {
    event.preventDefault();
    document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.authTab === "login"));
    showAuthPanel("login");
  }
  document.getElementById("back-to-login-link").addEventListener("click", backToLogin);
  document.getElementById("back-to-login-link-2").addEventListener("click", backToLogin);

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthMessage(data.error || "Login failed.");
      return;
    }
    showApp(data.username, data.is_admin, data.is_premium);
  });

  document.getElementById("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("signup-username").value.trim();
    const password = document.getElementById("signup-password").value;
    const security_answer = document.getElementById("signup-security-answer").value.trim();
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, security_answer }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthMessage(data.error || "Sign up failed.");
      return;
    }
    showApp(data.username, data.is_admin, data.is_premium);
  });

  document.getElementById("forgot-username-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("forgot-username").value.trim();
    const res = await fetch("/api/auth/forgot/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthMessage(data.error || "Couldn't find that account.");
      return;
    }
    document.getElementById("forgot-reset-form").dataset.username = username;
    document.getElementById("forgot-question-text").textContent = data.question;
    showAuthPanel("forgot-reset");
  });

  document.getElementById("forgot-reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = event.target.dataset.username;
    const answer = document.getElementById("forgot-answer").value.trim();
    const new_password = document.getElementById("forgot-new-password").value;
    const res = await fetch("/api/auth/forgot/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, answer, new_password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthMessage(data.error || "Reset failed.");
      return;
    }
    document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.authTab === "login"));
    showAuthPanel("login");
    showAuthMessage("Password reset — log in with your new password.");
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    currentUsername = null;
    currentIsAdmin = false;
    currentIsPremium = false;
    ALL_TAB_IDS.forEach((id) => {
      const el = document.getElementById(id);
      el.innerHTML = "";
      delete el.dataset.initialized;
      delete el.dataset.shellReady;
    });
    showAuthScreen();
  });
}

function showAuthMessage(text) {
  const el = document.getElementById("auth-message");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

function showApp(username, isAdmin, isPremium) {
  currentUsername = username;
  currentIsAdmin = !!isAdmin;
  currentIsPremium = !!isPremium;
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("current-username").textContent = username;
  document.getElementById("avatar-btn").textContent = username.charAt(0).toUpperCase();
  document.getElementById("admin-tab-btn").classList.toggle("hidden", !currentIsAdmin);
  activateTab("home");
}

function showAuthScreen() {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
}

// ---------- Tab navigation ----------

function setupTabUI() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tab) {
  if (tab === "admin" && !currentIsAdmin) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));

  if (tab === "home") renderHomePanel();
  if (tab === "my-stats") renderMyStatsPage();
  if (tab === "explore") renderExplorePage();
  if (tab === "coach") renderCoachPanel();
  if (tab === "premium") renderPremiumPanel();
  if (tab === "account") renderAccountPanel();
  if (tab === "admin") renderAdminPanel();
}

// ---------- Consolidated pages ----------

function renderMyStatsPage() {
  const panel = document.getElementById("tab-my-stats");
  if (!panel.dataset.shellReady) {
    panel.innerHTML = `
      <section class="page-section">
        <h2 class="page-section-title">Your Stats</h2>
        <div id="section-your-stats"></div>
      </section>
      <section class="page-section">
        <h2 class="page-section-title">Calendar</h2>
        <div id="section-calendar"></div>
      </section>
      <section class="page-section">
        <h2 class="page-section-title">Projections</h2>
        <div id="section-projections"></div>
      </section>
    `;
    panel.dataset.shellReady = "true";
  }
  renderYourStats();
  renderCalendarPanel();
  renderProjectionsPanel();
}

function renderExplorePage() {
  const panel = document.getElementById("tab-explore");
  if (!panel.dataset.shellReady) {
    panel.innerHTML = `
      <section class="page-section">
        <h2 class="page-section-title">Player &amp; Team Search</h2>
        <div id="section-player-stats"></div>
      </section>
      <section class="page-section">
        <h2 class="page-section-title">Compare Yourself</h2>
        <div id="section-compare"></div>
      </section>
      <section class="page-section">
        <h2 class="page-section-title">Leaderboard</h2>
        <div id="section-leaderboard"></div>
      </section>
    `;
    panel.dataset.shellReady = "true";
  }
  renderPlayerStatsPanel();
  renderComparePanel();
  renderLeaderboardPanel();
}

// ---------- Shared detail-rendering helpers ----------

function backLinkHtml() {
  return `<div class="back-link" id="back-link">&larr; Back to results</div>`;
}

function eventsTable(events, showScore) {
  if (!events || events.length === 0) {
    return `<p class="empty-note">No data available.</p>`;
  }
  const rows = events
    .map(
      (e) => `
      <tr>
        <td>${e.date || ""}${e.time ? " " + e.time : ""}</td>
        <td>${e.home_team || ""} vs ${e.away_team || ""}</td>
        ${showScore ? `<td>${e.home_score ?? "-"} : ${e.away_score ?? "-"}</td>` : ""}
        <td>${e.league || ""}</td>
      </tr>`
    )
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Matchup</th>
          ${showScore ? "<th>Score</th>" : ""}
          <th>League</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function compareRow(label, youVal, athleteVal, unit, athleteName) {
  if (youVal === null || youVal === undefined || isNaN(youVal)) {
    return `<div class="compare-row"><div class="compare-label">${label}</div><p class="empty-note">Enter a value above and click Compare.</p></div>`;
  }
  if (athleteVal === null || athleteVal === undefined || isNaN(athleteVal)) {
    return `<div class="compare-row"><div class="compare-label">${label}</div><p class="empty-note">You: ${youVal}${unit} · ${athleteName}'s ${label.toLowerCase()} isn't available from the API.</p></div>`;
  }

  const max = Math.max(youVal, athleteVal, 1);
  const diff = youVal - athleteVal;
  const diffText = diff === 0 ? "tied" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}${unit} vs ${athleteName}`;

  return `
    <div class="compare-row">
      <div class="compare-label">${label} <span class="compare-diff">${diffText}</span></div>
      <div class="compare-bar-track"><div class="compare-bar-fill you" style="width:${(youVal / max * 100).toFixed(1)}%"></div></div>
      <div class="compare-bar-caption">You: ${youVal}${unit}</div>
      <div class="compare-bar-track"><div class="compare-bar-fill athlete" style="width:${(athleteVal / max * 100).toFixed(1)}%"></div></div>
      <div class="compare-bar-caption">${athleteName}: ${athleteVal}${unit}</div>
    </div>
  `;
}

function renderTeamDetailInto(container, data) {
  const { info, roster, last_events, next_events, table } = data;

  const rosterHtml =
    roster && roster.length
      ? `<div class="roster-grid">${roster
          .map(
            (p) => `
          <div class="roster-item">
            ${p.thumb ? `<img src="${p.thumb}" alt="${p.name}" />` : ""}
            <div>
              <div>${p.name}</div>
              <div class="result-meta">${p.position || ""}</div>
            </div>
          </div>`
          )
          .join("")}</div>`
      : `<p class="empty-note">No roster data available.</p>`;

  const tableHtml =
    table && table.length
      ? `<table>
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
          <tbody>
            ${table
              .map(
                (row) => `<tr>
                  <td>${row.rank}</td><td>${row.team}</td><td>${row.played}</td>
                  <td>${row.win}</td><td>${row.draw}</td><td>${row.loss}</td><td>${row.points}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : `<p class="empty-note">No standings available for this team/league.</p>`;

  container.innerHTML = `
    ${backLinkHtml()}
    <div class="detail-header">
      ${info.badge ? `<img src="${info.badge}" alt="${info.name}" />` : ""}
      <div>
        <h2>${info.name}</h2>
        <div class="result-meta">${info.sport || ""}${info.league ? " · " + info.league : ""}${info.country ? " · " + info.country : ""}</div>
      </div>
    </div>

    <div class="category">
      <h3>Overview</h3>
      <p><strong>Stadium:</strong> ${info.stadium || "-"} &nbsp; <strong>Formed:</strong> ${info.formed || "-"}</p>
      ${info.website ? `<p><strong>Website:</strong> ${info.website}</p>` : ""}
      <div class="description-scroll"><p class="description">${info.description || ""}</p></div>
    </div>

    <div class="category">
      <h3>Roster</h3>
      ${rosterHtml}
    </div>

    <div class="category">
      <h3>Recent Results</h3>
      ${eventsTable(last_events, true)}
    </div>

    <div class="category">
      <h3>Upcoming Fixtures</h3>
      ${eventsTable(next_events, false)}
    </div>

    <div class="category">
      <h3>League Table</h3>
      ${tableHtml}
    </div>
  `;
}

async function renderPlayerDetailInto(container, data, item) {
  const { info, next_events } = data;
  const playerId = item?.id;

  let isFollowing = false;
  if (playerId) {
    const followRes = await fetch("/api/follows");
    const followData = await followRes.json();
    isFollowing = (followData.players || []).some((p) => String(p.player_id) === String(playerId));
  }

  container.innerHTML = `
    ${backLinkHtml()}
    <div class="detail-header">
      ${info.thumb ? `<img src="${info.thumb}" alt="${info.name}" />` : ""}
      <div>
        <h2>${info.name}</h2>
        <div class="result-meta">${info.sport || ""}${info.team ? " · " + info.team : ""}${info.position ? " · " + info.position : ""}</div>
      </div>
      ${playerId ? `<button type="button" id="follow-btn" class="follow-btn ${isFollowing ? "following" : ""}">${isFollowing ? "★ Following" : "☆ Follow"}</button>` : ""}
    </div>

    <div class="category">
      <h3>Overview</h3>
      <p>
        <strong>Nationality:</strong> ${info.nationality || "-"} &nbsp;
        <strong>Born:</strong> ${info.born || "-"} &nbsp;
        <strong>Status:</strong> ${info.status || "-"}
      </p>
      ${info.height || info.weight ? `<p><strong>Height:</strong> ${info.height || "-"} &nbsp; <strong>Weight:</strong> ${info.weight || "-"}</p>` : ""}
      <div class="description-scroll"><p class="description">${info.description || ""}</p></div>
    </div>

    <div class="category">
      <h3>Team's Upcoming Fixtures</h3>
      ${eventsTable(next_events, false)}
    </div>
  `;

  if (playerId) {
    document.getElementById("follow-btn").addEventListener("click", async () => {
      const btn = document.getElementById("follow-btn");
      if (isFollowing) {
        await fetch(`/api/follows/${playerId}`, { method: "DELETE" });
        isFollowing = false;
      } else {
        await fetch("/api/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_id: playerId,
            name: info.name,
            sport: info.sport,
            team: info.team,
            thumb: info.thumb,
          }),
        });
        isFollowing = true;
      }
      btn.textContent = isFollowing ? "★ Following" : "☆ Follow";
      btn.classList.toggle("following", isFollowing);
    });
  }
}

async function renderFullDetail(container, item, data, onBack) {
  if (item.type === "team") {
    renderTeamDetailInto(container, data);
  } else {
    await renderPlayerDetailInto(container, data, item);
  }
  container.classList.remove("hidden");
  document.getElementById("back-link").addEventListener("click", onBack);
}

const API_SPORT_TO_METRICS_SPORT = {
  Soccer: "Soccer",
  Basketball: "Basketball",
  "American Football": "Football",
  "Ice Hockey": "Hockey",
  Baseball: "Baseball",
  Golf: "Golf",
  Tennis: "Tennis",
  Fighting: "MMA/Boxing",
  Athletics: "Running",
  "Track and Field": "Running",
};

function mapApiSportToMetricsSport(apiSport) {
  if (!apiSport) return null;
  if (API_SPORT_TO_METRICS_SPORT[apiSport]) return API_SPORT_TO_METRICS_SPORT[apiSport];
  if (gameMetricKeysBySport[apiSport]) return apiSport;
  return null;
}

async function renderCompareDetail(container, item, data, onBack) {
  const info = data.info;

  const statsRes = await fetch("/api/stats/me");
  const statsData = await statsRes.json();
  const latest = {};
  (statsData.stats || []).forEach((s) => {
    const key = `${s.sport}|${s.metric_key}`;
    if (!(key in latest)) latest[key] = s.value;
  });

  const bio = {
    height_in: latest["Bio|height_in"],
    weight_lbs: latest["Bio|weight_lbs"],
    age: latest["Bio|age"],
  };
  const hasBio = info.height_in != null || info.weight_lbs != null || info.age != null;

  container.innerHTML = `
    ${backLinkHtml()}
    <div class="detail-header">
      ${info.thumb ? `<img src="${info.thumb}" alt="${info.name}" />` : ""}
      <div>
        <h2>${info.name}</h2>
        <div class="result-meta">${info.sport || ""}${info.team ? " · " + info.team : ""}</div>
      </div>
    </div>

    <div class="category">
      <h3>Compare Your Bio</h3>
      ${
        hasBio
          ? `
        <p class="empty-note">Real data from TheSportsDB — ${info.name}'s actual height/weight/age.</p>
        <div class="compare-form">
          <label>Height (in)<input type="number" step="any" id="cmp-bio-height" value="${bio.height_in ?? ""}" placeholder="e.g. 70" /></label>
          <label>Weight (lbs)<input type="number" step="any" id="cmp-bio-weight" value="${bio.weight_lbs ?? ""}" placeholder="e.g. 170" /></label>
          <label>Age (yrs)<input type="number" step="any" id="cmp-bio-age" value="${bio.age ?? ""}" placeholder="e.g. 25" /></label>
        </div>
        <div class="compare-form">
          <button type="button" id="cmp-bio-btn">Compare</button>
          <button type="button" id="cmp-bio-save-btn">Save as My Bio</button>
        </div>
        <div id="cmp-bio-save-msg" class="empty-note hidden"></div>
        <div id="cmp-bio-result"></div>
      `
          : `<p class="empty-note">TheSportsDB doesn't have bio data (height/weight/age) for ${info.name}.</p>`
      }
    </div>
  `;
  container.classList.remove("hidden");
  document.getElementById("back-link").addEventListener("click", onBack);

  if (!hasBio) return;

  const runBioCompare = () => {
    const you = {
      height: parseFloat(document.getElementById("cmp-bio-height").value),
      weight: parseFloat(document.getElementById("cmp-bio-weight").value),
      age: parseFloat(document.getElementById("cmp-bio-age").value),
    };
    const rows = [
      compareRow("Height", you.height, info.height_in, " in", info.name),
      compareRow("Weight", you.weight, info.weight_lbs, " lbs", info.name),
      compareRow("Age", you.age, info.age, " yrs", info.name),
    ].join("");
    document.getElementById("cmp-bio-result").innerHTML = rows;
  };

  document.getElementById("cmp-bio-btn").addEventListener("click", runBioCompare);

  document.getElementById("cmp-bio-save-btn").addEventListener("click", async () => {
    const entries = [
      { sport: "Bio", metric_key: "height_in", value: document.getElementById("cmp-bio-height").value },
      { sport: "Bio", metric_key: "weight_lbs", value: document.getElementById("cmp-bio-weight").value },
      { sport: "Bio", metric_key: "age", value: document.getElementById("cmp-bio-age").value },
    ].filter((e) => e.value !== "");

    for (const entry of entries) {
      await fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    }

    const msg = document.getElementById("cmp-bio-save-msg");
    msg.textContent = "Saved to Your Stats!";
    msg.classList.remove("hidden");
    setTimeout(() => msg.classList.add("hidden"), 2500);
  });

  if (bio.height_in !== undefined || bio.weight_lbs !== undefined || bio.age !== undefined) {
    runBioCompare();
  }
}

// ---------- Reusable search widget ----------

function setupSearchWidget({ formId, inputId, resultsId, detailId, messageId, typeFilter, renderDetail }) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const resultsEl = document.getElementById(resultsId);
  const detailEl = document.getElementById(detailId);
  const messageEl = document.getElementById(messageId);

  function showMsg(text) {
    messageEl.textContent = text;
    messageEl.classList.toggle("hidden", !text);
  }

  function clearEl(el) {
    el.innerHTML = "";
    el.classList.add("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    input.value = "";

    clearEl(detailEl);
    clearEl(resultsEl);
    showMsg("Searching...");

    try {
      const url = `/api/search?q=${encodeURIComponent(query)}` + (typeFilter ? `&type=${typeFilter}` : "");
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 429) {
        showMsg(data.error || "The sports data API is shared by everyone using this app and just hit its per-minute limit — wait a few seconds and try again.");
        return;
      }
      if (!data.results || data.results.length === 0) {
        showMsg(`No results for "${query}".`);
        return;
      }
      showMsg("");
      renderResultsList(data.results);
    } catch (err) {
      showMsg("Something went wrong reaching the server.");
    }
  });

  function renderResultsList(results) {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("hidden");

    for (const item of results) {
      const li = document.createElement("li");
      li.className = "result-card";
      li.innerHTML = `
        ${item.thumb ? `<img src="${item.thumb}" alt="${item.name}" />` : ""}
        <div>
          <div class="result-name">
            <span class="badge">${item.type}</span>${item.name}
          </div>
          <div class="result-meta">${item.sport || ""}${item.league ? " · " + item.league : ""}${item.team ? " · " + item.team : ""}</div>
        </div>
      `;
      li.addEventListener("click", () => selectItem(item));
      resultsEl.appendChild(li);
    }
  }

  async function selectItem(item) {
    clearEl(resultsEl);
    showMsg("Loading details...");

    try {
      const res = await fetch(`/api/${item.type}/${item.id}`);
      const data = await res.json();

      if (res.status === 429) {
        showMsg(data.error || "The sports data API is shared by everyone using this app and just hit its per-minute limit — wait a few seconds and try again.");
        return;
      }
      if (res.status === 404) {
        showMsg(data.error || "Not found.");
        return;
      }
      showMsg("");
      await renderDetail(detailEl, item, data, () => {
        clearEl(detailEl);
        resultsEl.classList.remove("hidden");
      });
    } catch (err) {
      showMsg("Something went wrong reaching the server.");
    }
  }
}

// ---------- Player Stats tab ----------

function renderPlayerStatsPanel() {
  const panel = document.getElementById("section-player-stats");
  if (panel.dataset.initialized) return;
  panel.dataset.initialized = "true";

  panel.innerHTML = `
    <form id="ps-search-form" class="search-form">
      <input type="text" id="ps-search-input" placeholder="e.g. Arsenal, Lakers, Messi, Tiger Woods" autocomplete="off" />
      <button type="submit">Search</button>
    </form>
    <div id="ps-message" class="message hidden"></div>
    <ul id="ps-results" class="results hidden"></ul>
    <section id="ps-detail" class="detail hidden"></section>
  `;

  setupSearchWidget({
    formId: "ps-search-form",
    inputId: "ps-search-input",
    resultsId: "ps-results",
    detailId: "ps-detail",
    messageId: "ps-message",
    typeFilter: null,
    renderDetail: renderFullDetail,
  });
}

// ---------- Compare tab ----------

function renderComparePanel() {
  const panel = document.getElementById("section-compare");
  if (panel.dataset.initialized) return;
  panel.dataset.initialized = "true";

  panel.innerHTML = `
    <form id="cp-search-form" class="search-form">
      <input type="text" id="cp-search-input" placeholder="Search an athlete, e.g. Messi, Tiger Woods" autocomplete="off" />
      <button type="submit">Search</button>
    </form>
    <div id="cp-message" class="message hidden"></div>
    <ul id="cp-results" class="results hidden"></ul>
    <section id="cp-detail" class="detail hidden"></section>
  `;

  setupSearchWidget({
    formId: "cp-search-form",
    inputId: "cp-search-input",
    resultsId: "cp-results",
    detailId: "cp-detail",
    messageId: "cp-message",
    typeFilter: "player",
    renderDetail: renderCompareDetail,
  });
}

// ---------- Match/practice stat logging (shared by Home banner + Calendar) ----------

function gameSports() {
  return Object.keys(gameMetricKeysBySport);
}

function gameLogFormHtml(prefix, sport) {
  const keys = gameMetricKeysBySport[sport] || [];
  const metrics = (metricsCatalog[sport] || []).filter((m) => keys.includes(m.key));
  return `
    <div class="game-log-grid">
      ${metrics
        .map(
          (m) => `
        <label>${m.label}${m.unit ? ` (${m.unit})` : ""}
          <input type="number" step="any" min="0" data-metric-key="${m.key}" id="${prefix}-${m.key}" />
        </label>`
        )
        .join("")}
    </div>
  `;
}

async function saveGameLog(eventId, formEl) {
  const values = {};
  formEl.querySelectorAll("[data-metric-key]").forEach((input) => {
    if (input.value !== "") values[input.dataset.metricKey] = input.value;
  });
  const res = await fetch(`/api/events/${eventId}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const data = await res.json();
  return res.ok ? { ok: true } : { ok: false, error: data.error };
}

function wireGameLogToggle(logBtn, formContainer, eventId, prefix, sport, onSaved) {
  logBtn.addEventListener("click", () => {
    if (formContainer.dataset.built !== "true") {
      formContainer.dataset.built = "true";
      formContainer.innerHTML = `
        ${gameLogFormHtml(prefix, sport)}
        <button type="button" class="save-log-btn">Save Stats</button>
        <div class="log-msg empty-note hidden"></div>
      `;
      formContainer.querySelector(".save-log-btn").addEventListener("click", async () => {
        const result = await saveGameLog(eventId, formContainer);
        if (!result.ok) {
          const msgEl = formContainer.querySelector(".log-msg");
          msgEl.textContent = result.error || "Could not save.";
          msgEl.classList.remove("hidden");
          return;
        }
        onSaved();
      });
    }
    formContainer.classList.toggle("hidden");
  });
}

// ---------- Home tab ----------

const PIE_COLORS = ["#2563EB", "#22C55E", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#64748B", "#0F172A"];

function renderPieChart(slices) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return "";

  let cumulative = 0;
  const stops = slices
    .map((s) => {
      const start = (cumulative / total) * 360;
      cumulative += s.value;
      const end = (cumulative / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  const legend = slices
    .map(
      (s) => `
      <div><span class="pie-swatch" style="background:${s.color}"></span>${s.label} (${s.value})</div>
    `
    )
    .join("");

  return `
    <div class="pie-wrap">
      <div class="pie-chart" style="background: conic-gradient(${stops});"></div>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}

async function viewPlayerById(playerId) {
  activateTab("explore");
  const resultsEl = document.getElementById("ps-results");
  const detailEl = document.getElementById("ps-detail");
  const messageEl = document.getElementById("ps-message");
  resultsEl.innerHTML = "";
  resultsEl.classList.add("hidden");
  detailEl.innerHTML = "";
  detailEl.classList.add("hidden");
  messageEl.textContent = "Loading details...";
  messageEl.classList.remove("hidden");

  try {
    const res = await fetch(`/api/player/${playerId}`);
    const data = await res.json();
    if (!res.ok) {
      messageEl.textContent = data.error || "Not found.";
      return;
    }
    messageEl.classList.add("hidden");
    await renderFullDetail(detailEl, { id: playerId, type: "player" }, data, () => {
      detailEl.innerHTML = "";
      detailEl.classList.add("hidden");
    });
  } catch (err) {
    messageEl.textContent = "Something went wrong reaching the server.";
  }
}

async function renderHomePanel() {
  const panel = document.getElementById("tab-home");
  const [res, todayRes, followRes] = await Promise.all([
    fetch("/api/stats/me"),
    fetch("/api/events/today"),
    fetch("/api/follows"),
  ]);
  const data = await res.json();
  const todayData = await todayRes.json();
  const followData = await followRes.json();
  const stats = data.stats || [];
  const dueEvents = (todayData.events || []).filter((e) => !e.logged);
  const followed = followData.players || [];

  const bySport = {};
  stats.forEach((s) => {
    bySport[s.sport] = (bySport[s.sport] || 0) + 1;
  });
  const slices = Object.entries(bySport).map(([label, value], i) => ({
    label,
    value,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const byMetric = {};
  stats.forEach((s) => {
    byMetric[s.metric_key] = byMetric[s.metric_key] || { count: 0, label: s.label, sport: s.sport };
    byMetric[s.metric_key].count += 1;
  });
  const eligible = Object.entries(byMetric)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count);

  let growthHtml = `
    <div class="analytics-grid">
      <div class="analytics-card"><div class="analytics-label">Weekly Progress</div><div class="skeleton skeleton-text"></div></div>
      <div class="analytics-card"><div class="analytics-label">Consistency</div><div class="skeleton skeleton-text"></div></div>
      <div class="analytics-card"><div class="analytics-label">Average Rating</div><div class="skeleton skeleton-text"></div></div>
    </div>
    <p class="empty-note" style="margin-top: 0.9rem;">Log at least 2 entries for the same metric in Your Stats to see a growth trend here.</p>
  `;
  if (eligible.length > 0) {
    const [topKey, topMeta] = eligible[0];
    const projRes = await fetch(`/api/projections/me?metric_key=${encodeURIComponent(topKey)}`);
    const proj = await projRes.json();
    if (projRes.ok) {
      const dir = proj.trend_per_day === 0 ? "flat" : proj.trend_per_day > 0 ? "trending up" : "trending down";
      growthHtml = `
        <p><strong>${topMeta.sport} — ${topMeta.label}</strong> is ${dir} (${Math.abs(proj.trend_per_day)}${proj.metric.unit}/day).</p>
        ${sparkline(proj.history)}
      `;
    }
  }

  const eventsHtml = dueEvents.length
    ? `<div class="event-card-grid">${dueEvents
        .map(
          (e) => `
      <div>
        <div class="event-card">
          <div class="event-card-icon">${e.event_type === "match" ? "⚽" : "🏋️"}</div>
          <div class="event-card-body">
            <div class="event-card-title">${e.sport} ${e.event_type === "match" ? "Match" : "Practice"}</div>
            <div class="event-card-meta">Today${e.event_time ? ` • ${formatEventTime(e.event_time)}` : ""}${e.opponent ? ` • vs ${e.opponent}` : ""}</div>
          </div>
          <button type="button" class="event-card-action" id="reminder-log-btn-${e.id}">Log Stats &rarr;</button>
        </div>
        <div class="reminder-form hidden" id="reminder-form-${e.id}"></div>
      </div>`
        )
        .join("")}</div>`
    : `<p class="empty-note">Nothing scheduled for today — enjoy the rest day.</p>`;

  const followedHtml = followed.length
    ? `<div class="followed-grid">${followed
        .map(
          (p) => `
        <div class="followed-card" data-player-id="${p.player_id}">
          ${p.thumb ? `<img src="${p.thumb}" alt="${p.name}" />` : ""}
          <div class="followed-info">
            <div class="followed-name">${p.name}</div>
            <div class="result-meta">${p.sport || ""}${p.team ? " · " + p.team : ""}</div>
          </div>
          <button type="button" class="followed-unfollow-btn" data-player-id="${p.player_id}" title="Unfollow">&times;</button>
        </div>`
        )
        .join("")}</div>`
    : `<p class="empty-note">You're not following anyone yet — find a player in Player Stats and hit Follow.</p>`;

  const statsHtml = slices.length
    ? renderPieChart(slices)
    : `
      <div class="empty-state">
        <svg class="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" />
        </svg>
        <div class="empty-state-title">No stats yet</div>
        <p class="empty-state-subtitle">Log your first session to start tracking your progress.</p>
        <button type="button" id="home-add-first-stat-btn">Add First Stat</button>
      </div>
    `;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  panel.innerHTML = `
    <div class="category home-greeting">
      <h2>${greeting}, ${currentUsername} &#128075;</h2>
      <p class="subtitle">Here's today's activity.</p>
    </div>
    <div class="category">
      <h3>Today's Events</h3>
      ${eventsHtml}
    </div>
    <div class="category">
      <h3>Players You Follow</h3>
      ${followedHtml}
    </div>
    <div class="category">
      <h3>Your Stats Breakdown</h3>
      ${statsHtml}
    </div>
    <div class="category">
      <h3>Growth</h3>
      ${growthHtml}
    </div>
  `;

  const addFirstStatBtn = document.getElementById("home-add-first-stat-btn");
  if (addFirstStatBtn) {
    addFirstStatBtn.addEventListener("click", () => activateTab("my-stats"));
  }

  panel.querySelectorAll(".followed-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".followed-unfollow-btn")) return;
      viewPlayerById(card.dataset.playerId);
    });
  });
  panel.querySelectorAll(".followed-unfollow-btn").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await fetch(`/api/follows/${btn.dataset.playerId}`, { method: "DELETE" });
      renderHomePanel();
    });
  });

  dueEvents.forEach((e) => {
    const logBtn = document.getElementById(`reminder-log-btn-${e.id}`);
    const formContainer = document.getElementById(`reminder-form-${e.id}`);
    wireGameLogToggle(logBtn, formContainer, e.id, `reminder-${e.id}`, e.sport, renderHomePanel);
  });
}

// ---------- Your Stats tab ----------

function renderYourStats() {
  const panel = document.getElementById("section-your-stats");
  const sports = Object.keys(metricsCatalog);

  panel.innerHTML = `
    <div class="category">
      <h3>Log a New Stat</h3>
      <div class="stat-form">
        <label>Sport
          <select id="stat-sport">
            ${sports.map((s) => `<option value="${s}">${s}</option>`).join("")}
          </select>
        </label>
        <label>Metric
          <select id="stat-metric"></select>
        </label>
        <label>Value
          <input type="number" step="any" id="stat-value" placeholder="e.g. 420" />
        </label>
        <label>Rest days since last session
          <input type="number" step="any" min="0" id="stat-rest-days" placeholder="0" />
        </label>
        <button type="button" id="stat-save-btn">Log Entry</button>
      </div>
      <p class="empty-note">Rest days help Projections tell a well-rested measurement from a fatigued one.</p>
      <div id="stat-message" class="message hidden"></div>
    </div>
    <div class="category">
      <h3>Your History</h3>
      <div id="stat-history"></div>
    </div>
  `;

  const sportSelect = document.getElementById("stat-sport");
  const metricSelect = document.getElementById("stat-metric");

  function populateMetrics() {
    const metrics = metricsCatalog[sportSelect.value] || [];
    metricSelect.innerHTML = metrics
      .map((m) => `<option value="${m.key}">${m.label}${m.unit ? " (" + m.unit + ")" : ""}</option>`)
      .join("");
  }
  sportSelect.addEventListener("change", populateMetrics);
  populateMetrics();

  document.getElementById("stat-save-btn").addEventListener("click", async () => {
    const sport = sportSelect.value;
    const metric_key = metricSelect.value;
    const value = document.getElementById("stat-value").value;
    const rest_days = document.getElementById("stat-rest-days").value;

    if (value === "") {
      showStatMessage("Enter a value first.");
      return;
    }

    const res = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport, metric_key, value, rest_days }),
    });
    const data = await res.json();

    if (!res.ok) {
      showStatMessage(data.error || "Could not save.");
      return;
    }

    document.getElementById("stat-value").value = "";
    document.getElementById("stat-rest-days").value = "";
    showStatMessage("Saved!");
    loadStatHistory();
  });

  loadStatHistory();
}

function showStatMessage(text) {
  const el = document.getElementById("stat-message");
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}

async function loadStatHistory() {
  const res = await fetch("/api/stats/me");
  const data = await res.json();
  const container = document.getElementById("stat-history");

  if (!data.stats || data.stats.length === 0) {
    container.innerHTML = `<p class="empty-note">No stats logged yet.</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Sport</th><th>Metric</th><th>Value</th><th>Rest Days</th></tr></thead>
      <tbody>
        ${data.stats
          .map(
            (s) => `
          <tr>
            <td>${new Date(s.recorded_at).toLocaleString()}</td>
            <td>${s.sport}</td>
            <td>${s.label}</td>
            <td>${s.value}${s.unit ? " " + s.unit : ""}</td>
            <td>${s.rest_days ?? 0}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ---------- Calendar tab ----------

let calendarViewDate = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function formatEventTime(event_time) {
  if (!event_time) return "";
  const [h, m] = event_time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad2(m)} ${period}`;
}

async function renderCalendarPanel() {
  const panel = document.getElementById("section-calendar");
  const now = new Date();
  if (!calendarViewDate) calendarViewDate = { year: now.getFullYear(), month: now.getMonth() };
  const todayYmd = ymd(now.getFullYear(), now.getMonth(), now.getDate());

  panel.innerHTML = `
    <div class="category">
      <div class="calendar-header">
        <button type="button" id="cal-prev">&larr;</button>
        <h3 id="cal-month-label"></h3>
        <button type="button" id="cal-next">&rarr;</button>
      </div>
      <div class="calendar-grid" id="cal-grid"></div>
    </div>
    <div class="category" id="cal-day-panel"></div>
  `;

  document.getElementById("cal-prev").addEventListener("click", () => {
    calendarViewDate.month -= 1;
    if (calendarViewDate.month < 0) {
      calendarViewDate.month = 11;
      calendarViewDate.year -= 1;
    }
    renderCalendarPanel();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    calendarViewDate.month += 1;
    if (calendarViewDate.month > 11) {
      calendarViewDate.month = 0;
      calendarViewDate.year += 1;
    }
    renderCalendarPanel();
  });

  const res = await fetch("/api/events/me");
  const data = await res.json();
  const eventsByDate = {};
  (data.events || []).forEach((e) => {
    (eventsByDate[e.event_date] = eventsByDate[e.event_date] || []).push(e);
  });

  const { year, month } = calendarViewDate;
  document.getElementById("cal-month-label").textContent = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = `
    ${["S", "M", "T", "W", "T", "F", "S"].map((n) => `<div class="cal-dow">${n}</div>`).join("")}
    ${cells
      .map((d) => {
        if (!d) return `<div class="cal-cell empty"></div>`;
        const ds = ymd(year, month, d);
        const dots = (eventsByDate[ds] || [])
          .map((e) => `<span class="cal-dot ${e.event_type}"></span>`)
          .join("");
        return `<div class="cal-cell${ds === todayYmd ? " today" : ""}" data-date="${ds}">
          <span class="cal-day-num">${d}</span><span class="cal-dots">${dots}</span>
        </div>`;
      })
      .join("")}
  `;

  grid.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => renderCalendarDayPanel(cell.dataset.date, eventsByDate[cell.dataset.date] || []));
  });

  renderCalendarDayPanel(todayYmd, eventsByDate[todayYmd] || []);
}

function renderCalendarDayPanel(dateStr, dayEvents) {
  const panel = document.getElementById("cal-day-panel");
  panel.innerHTML = `
    <h3>${new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })}</h3>
    <div id="cal-day-events"></div>
    <div class="stat-form">
      <label>Sport
        <select id="cal-new-sport">
          ${gameSports()
            .map((s) => `<option value="${s}">${s}</option>`)
            .join("")}
        </select>
      </label>
      <label>Type
        <select id="cal-new-type">
          <option value="match">Match</option>
          <option value="practice">Practice</option>
        </select>
      </label>
      <label>Time (optional)
        <input type="time" id="cal-new-time" />
      </label>
      <label>Opponent (optional)
        <input type="text" id="cal-new-opponent" placeholder="e.g. Riverdale HS" />
      </label>
      <button type="button" id="cal-new-save">Add to Calendar</button>
    </div>
    <div id="cal-new-msg" class="message hidden"></div>
  `;

  renderCalendarDayEvents(dayEvents);

  document.getElementById("cal-new-save").addEventListener("click", async () => {
    const sport = document.getElementById("cal-new-sport").value;
    const event_type = document.getElementById("cal-new-type").value;
    const event_time = document.getElementById("cal-new-time").value;
    const opponent = document.getElementById("cal-new-opponent").value.trim();
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_date: dateStr, event_time, event_type, sport, opponent }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msgEl = document.getElementById("cal-new-msg");
      msgEl.textContent = data.error || "Could not add.";
      msgEl.classList.remove("hidden");
      return;
    }
    renderCalendarPanel();
  });
}

function renderCalendarDayEvents(dayEvents) {
  const container = document.getElementById("cal-day-events");
  if (!dayEvents.length) {
    container.innerHTML = `<p class="empty-note">Nothing scheduled for this day yet.</p>`;
    return;
  }

  container.innerHTML = dayEvents
    .map(
      (e) => `
    <div class="cal-event-row">
      <div>
        <span class="badge ${e.event_type}">${e.event_type}</span>
        <strong>${e.sport}</strong>
        ${e.event_time ? `· ${formatEventTime(e.event_time)} ` : ""}${e.opponent ? `vs ${e.opponent}` : ""}
        ${e.logged ? `<span class="cal-logged">&#10003; logged</span>` : ""}
      </div>
      <div class="cal-event-actions">
        ${e.logged ? "" : `<button type="button" id="cal-log-btn-${e.id}">Log Stats</button>`}
        <button type="button" id="cal-del-btn-${e.id}">Delete</button>
      </div>
      <div class="reminder-form hidden" id="cal-log-form-${e.id}"></div>
    </div>`
    )
    .join("");

  dayEvents.forEach((e) => {
    document.getElementById(`cal-del-btn-${e.id}`).addEventListener("click", async () => {
      await fetch(`/api/events/${e.id}`, { method: "DELETE" });
      renderCalendarPanel();
    });
    if (!e.logged) {
      const logBtn = document.getElementById(`cal-log-btn-${e.id}`);
      const formContainer = document.getElementById(`cal-log-form-${e.id}`);
      wireGameLogToggle(logBtn, formContainer, e.id, `cal-${e.id}`, e.sport, renderCalendarPanel);
    }
  });
}

// ---------- Leaderboard tab ----------

async function renderLeaderboardPanel() {
  const panel = document.getElementById("section-leaderboard");
  const res = await fetch("/api/leaderboard/options");
  const data = await res.json();
  const options = data.options || [];

  if (options.length === 0) {
    panel.innerHTML = `<p class="empty-note">No leaderboard data yet — log some sport metrics in Your Stats first (yours and other users' entries will show up here).</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="category">
      <h3>Leaderboard</h3>
      <div class="compare-form">
        <label>Board
          <select id="lb-select">
            ${options.map((o, i) => `<option value="${i}">${o.sport} — ${o.label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div id="lb-result"></div>
    </div>
  `;

  const select = document.getElementById("lb-select");

  async function loadBoard() {
    const opt = options[select.value];
    const res = await fetch(
      `/api/leaderboard?sport=${encodeURIComponent(opt.sport)}&metric_key=${encodeURIComponent(opt.metric_key)}`
    );
    const data = await res.json();
    const container = document.getElementById("lb-result");

    if (!data.entries || data.entries.length === 0) {
      container.innerHTML = `<p class="empty-note">No entries yet.</p>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>User</th><th>Value</th><th>Logged</th></tr></thead>
        <tbody>
          ${data.entries
            .map(
              (e) => `
            <tr class="${e.username === currentUsername ? "highlight-row" : ""}">
              <td>${e.rank}</td>
              <td>${e.username}${e.is_premium ? ` <span class="premium-tag" title="Premium member">&#11088;</span>` : ""}</td>
              <td>${e.value}${e.unit ? " " + e.unit : ""}</td>
              <td>${new Date(e.recorded_at).toLocaleDateString()}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  select.addEventListener("change", loadBoard);
  loadBoard();
}

// ---------- Projections tab ----------

async function renderProjectionsPanel() {
  const panel = document.getElementById("section-projections");
  const res = await fetch("/api/stats/me");
  const data = await res.json();

  const counts = {};
  (data.stats || []).forEach((s) => {
    counts[s.metric_key] = counts[s.metric_key] || { count: 0, label: s.label, sport: s.sport };
    counts[s.metric_key].count += 1;
  });
  const eligible = Object.entries(counts).filter(([, v]) => v.count >= 2);

  if (eligible.length === 0) {
    panel.innerHTML = `<p class="empty-note">Log at least 2 entries for the same metric (in Your Stats) to see a projection.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="category">
      <h3>Projections</h3>
      <div class="compare-form">
        <label>Metric
          <select id="proj-select">
            ${eligible.map(([k, v]) => `<option value="${k}">${v.sport} — ${v.label} (${v.count} entries)</option>`).join("")}
          </select>
        </label>
      </div>
      <div id="proj-result"></div>
    </div>
  `;

  const select = document.getElementById("proj-select");

  async function loadProjection() {
    const res = await fetch(`/api/projections/me?metric_key=${encodeURIComponent(select.value)}`);
    const data = await res.json();
    const container = document.getElementById("proj-result");

    if (!res.ok) {
      container.innerHTML = `<p class="empty-note">${data.error}</p>`;
      return;
    }

    const { metric, history, trend_per_day, adjusted_trend_per_day, age_used, age_factor, model_note, projections } = data;
    const trendDir = trend_per_day === 0 ? "flat" : trend_per_day > 0 ? "increasing" : "decreasing";

    container.innerHTML = `
      <p><strong>Raw trend:</strong> ${trendDir} by ${Math.abs(trend_per_day)}${metric.unit}/day (rest-day weighted)</p>
      <p><strong>Age-adjusted trend:</strong> ${Math.abs(adjusted_trend_per_day)}${metric.unit}/day
        ${age_used !== null && age_used !== undefined ? `(using your logged age of ${age_used}, factor ${age_factor}x)` : `(no logged age found — factor ${age_factor}x)`}
      </p>
      ${sparkline(history)}
      <table>
        <thead><tr><th>In</th><th>Projected ${metric.label}</th></tr></thead>
        <tbody>
          ${projections
            .map((p) =>
              p.locked
                ? `<tr class="locked-row"><td>${p.days_from_now} days</td><td><span class="locked-value">&#128274; Premium</span></td></tr>`
                : `<tr><td>${p.days_from_now} days</td><td>${p.value}${metric.unit ? " " + metric.unit : ""}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      ${
        projections.some((p) => p.locked)
          ? `<p class="empty-note">90 &amp; 365-day projections are a <a href="#" id="proj-upgrade-link" class="auth-link">Premium</a> feature.</p>`
          : ""
      }
      <p class="empty-note">${model_note}</p>
    `;

    const upgradeLink = document.getElementById("proj-upgrade-link");
    if (upgradeLink) {
      upgradeLink.addEventListener("click", (e) => {
        e.preventDefault();
        activateTab("premium");
      });
    }
  }

  select.addEventListener("change", loadProjection);
  loadProjection();
}

function sparkline(history) {
  if (history.length < 2) return "";
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320;
  const height = 80;
  const pad = 8;

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `
    <svg width="${width}" height="${height}" class="sparkline" viewBox="0 0 ${width} ${height}">
      <polyline points="${points}" fill="none" stroke="#2563EB" stroke-width="2" />
    </svg>
  `;
}

// ---------- Coach tab ----------

function renderCoachPanel() {
  const panel = document.getElementById("tab-coach");
  if (panel.dataset.initialized) return;
  panel.dataset.initialized = "true";

  panel.innerHTML = `
    <div class="category coach-panel">
      <h3>AI Coach</h3>
      <p class="empty-note">Ask for advice based on your logged stats — e.g. "How can I improve my mile time?"</p>
      <div id="coach-thread" class="coach-thread"></div>
      <form id="coach-form" class="coach-input-row">
        <input type="text" id="coach-input" placeholder="Ask your coach..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
      <div id="coach-message" class="message hidden"></div>
    </div>
  `;

  const thread = document.getElementById("coach-thread");
  const form = document.getElementById("coach-form");
  const input = document.getElementById("coach-input");
  const messageEl = document.getElementById("coach-message");
  const history = [];

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `coach-bubble ${role}`;
    bubble.textContent = text;
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
  }

  function showCoachMessage(text) {
    messageEl.textContent = text;
    messageEl.classList.toggle("hidden", !text);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    addBubble("user", text);
    input.value = "";
    showCoachMessage("Coach is thinking...");

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.premium_required) {
          messageEl.innerHTML = `${data.error} <a href="#" id="coach-upgrade-link" class="auth-link">Upgrade now</a>`;
          messageEl.classList.remove("hidden");
          document.getElementById("coach-upgrade-link").addEventListener("click", (e) => {
            e.preventDefault();
            activateTab("premium");
          });
          return;
        }
        showCoachMessage(data.error || "Coach request failed.");
        return;
      }

      showCoachMessage("");
      history.push({ role: "user", content: text });
      addBubble("assistant", data.reply);
      history.push({ role: "assistant", content: data.reply });
    } catch (err) {
      showCoachMessage("Something went wrong reaching the coach.");
    }
  });
}

// ---------- Premium ----------

function renderPremiumPanel() {
  const panel = document.getElementById("tab-premium");

  if (currentIsPremium) {
    panel.innerHTML = `
      <div class="category premium-status-card premium-active">
        <div class="premium-badge">&#11088; Premium</div>
        <h3>You're a Premium member</h3>
        <p class="empty-note">Unlimited AI Coach messages and full 30/90/365-day Projections are unlocked.</p>
        <button type="button" id="cancel-premium-btn" class="danger-btn">Cancel Premium</button>
      </div>
      <div id="premium-message" class="message hidden"></div>
    `;
    document.getElementById("cancel-premium-btn").addEventListener("click", async () => {
      if (!confirm("Cancel your Premium subscription? You'll lose unlimited Coach messages and full Projections.")) return;
      const res = await fetch("/api/account/cancel-premium", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        currentIsPremium = false;
        renderPremiumPanel();
      }
    });
    return;
  }

  panel.innerHTML = `
    <div class="premium-pricing">
      <div class="category pricing-card">
        <h3>Free</h3>
        <div class="pricing-price">$0<span>/mo</span></div>
        <ul class="pricing-features">
          <li>Full team &amp; player search</li>
          <li>Your Stats, Calendar, Compare, Leaderboard</li>
          <li>Projections — 30-day estimate</li>
          <li>AI Coach — 5 messages/day</li>
        </ul>
      </div>
      <div class="category pricing-card pricing-card-premium">
        <div class="pricing-ribbon">Most Popular</div>
        <h3>&#11088; Premium</h3>
        <div class="pricing-price">$4.99<span>/mo</span></div>
        <ul class="pricing-features">
          <li>Everything in Free</li>
          <li>Projections — full 30/90/365-day estimates</li>
          <li>AI Coach — unlimited messages</li>
          <li>Premium badge on Leaderboard</li>
        </ul>
        <div class="pricing-coming-soon">
          <div class="pricing-coming-soon-label">Coming Soon to Premium</div>
          <ul class="pricing-features pricing-features-soon">
            <li>Form &amp; positioning analysis from photos of you in action</li>
            <li>Deeper comparisons — against pro athletes and D1 college athletes</li>
            <li>Team Connect — group up with your team for shared stats and a strategist-mode AI Coach</li>
          </ul>
        </div>
        <button type="button" id="open-checkout-btn">Upgrade to Premium</button>
      </div>
    </div>
    <div id="premium-message" class="message hidden"></div>

    <div id="checkout-modal-backdrop" class="modal-backdrop hidden">
      <div class="modal-card">
        <h3>Upgrade to Premium</h3>
        <p class="empty-note">This is a demo checkout — no real payment is processed or stored anywhere.</p>
        <form id="checkout-form">
          <label>Cardholder Name
            <input type="text" id="checkout-name" placeholder="Jane Doe" required />
          </label>
          <label>Card Number
            <input type="text" id="checkout-card" placeholder="4242 4242 4242 4242" maxlength="19" required />
          </label>
          <div class="checkout-row">
            <label>Expiry
              <input type="text" id="checkout-expiry" placeholder="MM/YY" maxlength="5" required />
            </label>
            <label>CVC
              <input type="text" id="checkout-cvc" placeholder="123" maxlength="4" required />
            </label>
          </div>
          <div class="checkout-actions">
            <button type="button" id="checkout-cancel-btn" class="checkout-cancel-btn">Cancel</button>
            <button type="submit" id="checkout-submit-btn">Subscribe Now — $4.99/mo</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function showPremiumMessage(text) {
    const el = document.getElementById("premium-message");
    el.textContent = text;
    el.classList.toggle("hidden", !text);
  }

  const backdrop = document.getElementById("checkout-modal-backdrop");

  document.getElementById("open-checkout-btn").addEventListener("click", () => {
    backdrop.classList.remove("hidden");
  });
  document.getElementById("checkout-cancel-btn").addEventListener("click", () => {
    backdrop.classList.add("hidden");
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.classList.add("hidden");
  });

  const cardInput = document.getElementById("checkout-card");
  cardInput.addEventListener("input", () => {
    const digits = cardInput.value.replace(/\D/g, "").slice(0, 16);
    cardInput.value = digits.replace(/(.{4})/g, "$1 ").trim();
  });
  const expiryInput = document.getElementById("checkout-expiry");
  expiryInput.addEventListener("input", () => {
    const digits = expiryInput.value.replace(/\D/g, "").slice(0, 4);
    expiryInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });

  document.getElementById("checkout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById("checkout-submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing payment...";

    // Card fields above are decorative only — nothing entered in this form is ever sent
    // anywhere. This is a demo checkout with no real payment processor involved.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const res = await fetch("/api/account/upgrade-premium", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Subscribe Now — $4.99/mo";
      showPremiumMessage(data.error || "Something went wrong.");
      return;
    }

    currentIsPremium = true;
    backdrop.classList.add("hidden");
    renderPremiumPanel();
    showPremiumMessage("🎉 Welcome to Premium!");
  });
}

// ---------- Admin panel ----------

async function renderAdminPanel() {
  const panel = document.getElementById("tab-admin");

  panel.innerHTML = `
    <div class="category">
      <h3>Users</h3>
      <div id="admin-message" class="message hidden"></div>
      <div id="admin-users"></div>
    </div>
    <div class="category">
      <h3>Banned IPs &amp; Devices</h3>
      <p class="empty-note">Banning a user's IP or device blocks them from using the app entirely (login, signup, everything) until unbanned. Admin sessions are never blocked by their own bans.</p>
      <div class="compare-form">
        <label>Ban an IP manually
          <input type="text" id="admin-manual-ip" placeholder="e.g. 203.0.113.5" />
        </label>
        <button type="button" id="admin-ban-ip-btn">Ban IP</button>
      </div>
      <div id="admin-bans"></div>
    </div>
    <div class="category">
      <h3>AI Coach Prompt</h3>
      <p class="empty-note">Edit the system instructions given to the Coach for every conversation.</p>
      <textarea id="admin-coach-prompt" class="admin-prompt-textarea" rows="6"></textarea>
      <button type="button" id="admin-save-prompt-btn">Save Prompt</button>
    </div>
  `;

  function showAdminMessage(text) {
    const el = document.getElementById("admin-message");
    el.textContent = text;
    el.classList.toggle("hidden", !text);
    if (text) setTimeout(() => el.classList.add("hidden"), 3000);
  }

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    const container = document.getElementById("admin-users");
    if (!res.ok) {
      container.innerHTML = `<p class="empty-note">${data.error || "Couldn't load users."}</p>`;
      return;
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>Username</th><th>Admin</th><th>Created</th><th>Last Login</th><th>Last IP</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.users.map((u) => `
            <tr>
              <td>${u.username}</td>
              <td>${u.is_admin ? "Yes" : "-"}</td>
              <td>${new Date(u.created_at).toLocaleString()}</td>
              <td>${u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}</td>
              <td>${u.last_ip || "-"}</td>
              <td class="admin-actions">
                <button type="button" class="admin-reset-btn" data-id="${u.id}" data-username="${u.username}">Reset Password</button>
                <button type="button" class="admin-rename-btn" data-id="${u.id}" data-username="${u.username}">Rename</button>
                ${!u.is_admin ? `<button type="button" class="admin-delete-btn" data-id="${u.id}" data-username="${u.username}">Delete</button>` : ""}
                ${u.last_ip ? `<button type="button" class="admin-ban-user-ip-btn" data-ip="${u.last_ip}" data-username="${u.username}">Ban IP</button>` : ""}
                ${u.last_device_id ? `<button type="button" class="admin-ban-user-device-btn" data-device="${u.last_device_id}" data-username="${u.username}">Ban Device</button>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll(".admin-reset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newPassword = prompt(`New password for ${btn.dataset.username} (min 6 chars):`);
        if (!newPassword) return;
        const res = await fetch(`/api/admin/users/${btn.dataset.id}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_password: newPassword }),
        });
        const data = await res.json();
        showAdminMessage(res.ok ? "Password reset." : data.error || "Failed.");
      });
    });

    container.querySelectorAll(".admin-rename-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newUsername = prompt(`New username for ${btn.dataset.username}:`, btn.dataset.username);
        if (!newUsername || newUsername === btn.dataset.username) return;
        const res = await fetch(`/api/admin/users/${btn.dataset.id}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_username: newUsername }),
        });
        const data = await res.json();
        if (!res.ok) {
          showAdminMessage(data.error || "Failed.");
          return;
        }
        showAdminMessage("Renamed.");
        if (btn.dataset.username === currentUsername) {
          currentUsername = newUsername;
          document.getElementById("current-username").textContent = newUsername;
        }
        loadUsers();
      });
    });

    container.querySelectorAll(".admin-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Delete ${btn.dataset.username}? This removes their account and all their stats/events permanently.`)) return;
        const res = await fetch(`/api/admin/users/${btn.dataset.id}/delete`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          showAdminMessage(data.error || "Failed.");
          return;
        }
        showAdminMessage("Deleted.");
        loadUsers();
      });
    });

    container.querySelectorAll(".admin-ban-user-ip-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Ban IP ${btn.dataset.ip} (${btn.dataset.username}'s last known IP)?`)) return;
        await fetch("/api/admin/bans/ip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip_address: btn.dataset.ip }),
        });
        showAdminMessage("IP banned.");
        loadBans();
      });
    });

    container.querySelectorAll(".admin-ban-user-device-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Ban ${btn.dataset.username}'s device?`)) return;
        await fetch("/api/admin/bans/device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: btn.dataset.device }),
        });
        showAdminMessage("Device banned.");
        loadBans();
      });
    });
  }

  async function loadBans() {
    const res = await fetch("/api/admin/bans");
    const data = await res.json();
    const container = document.getElementById("admin-bans");
    if (!res.ok) {
      container.innerHTML = `<p class="empty-note">${data.error || "Couldn't load bans."}</p>`;
      return;
    }
    if (data.ips.length === 0 && data.devices.length === 0) {
      container.innerHTML = `<p class="empty-note">No bans in place.</p>`;
      return;
    }
    container.innerHTML = `
      ${data.ips.length ? `
        <table>
          <thead><tr><th>Banned IP</th><th>Since</th><th></th></tr></thead>
          <tbody>
            ${data.ips.map((b) => `
              <tr>
                <td>${b.ip_address}</td>
                <td>${new Date(b.banned_at).toLocaleString()}</td>
                <td><button type="button" class="admin-unban-ip-btn" data-ip="${b.ip_address}">Unban</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
      ${data.devices.length ? `
        <table>
          <thead><tr><th>Banned Device</th><th>Since</th><th></th></tr></thead>
          <tbody>
            ${data.devices.map((b) => `
              <tr>
                <td>${b.device_id}</td>
                <td>${new Date(b.banned_at).toLocaleString()}</td>
                <td><button type="button" class="admin-unban-device-btn" data-device="${b.device_id}">Unban</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
    `;

    container.querySelectorAll(".admin-unban-ip-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fetch(`/api/admin/bans/ip/${encodeURIComponent(btn.dataset.ip)}`, { method: "DELETE" });
        showAdminMessage("IP unbanned.");
        loadBans();
      });
    });
    container.querySelectorAll(".admin-unban-device-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fetch(`/api/admin/bans/device/${encodeURIComponent(btn.dataset.device)}`, { method: "DELETE" });
        showAdminMessage("Device unbanned.");
        loadBans();
      });
    });
  }

  document.getElementById("admin-ban-ip-btn").addEventListener("click", async () => {
    const ip = document.getElementById("admin-manual-ip").value.trim();
    if (!ip) return;
    await fetch("/api/admin/bans/ip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip_address: ip }),
    });
    document.getElementById("admin-manual-ip").value = "";
    showAdminMessage("IP banned.");
    loadBans();
  });

  const settingsRes = await fetch("/api/admin/settings");
  const settingsData = await settingsRes.json();
  document.getElementById("admin-coach-prompt").value = settingsData.coach_system_prompt || "";

  document.getElementById("admin-save-prompt-btn").addEventListener("click", async () => {
    const coach_system_prompt = document.getElementById("admin-coach-prompt").value;
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_system_prompt }),
    });
    const data = await res.json();
    showAdminMessage(res.ok ? "Prompt saved." : data.error || "Failed.");
  });

  loadUsers();
  loadBans();
}

// ---------- Account panel (self-service) ----------

function renderAccountPanel() {
  const panel = document.getElementById("tab-account");

  panel.innerHTML = `
    <div class="category">
      <h3>Change Password</h3>
      <form id="account-password-form" class="stat-form">
        <label>Current password
          <input type="password" id="account-current-password" required />
        </label>
        <label>New password
          <input type="password" id="account-new-password" required />
        </label>
        <button type="submit">Change Password</button>
      </form>
    </div>
    <div class="category">
      <h3>Security Question</h3>
      <p class="empty-note">Used to reset your password if you forget it.</p>
      <form id="account-security-form" class="stat-form">
        <label>Current password
          <input type="password" id="account-security-current-password" required />
        </label>
        <label>New question
          <input type="text" id="account-new-question" placeholder="e.g. What's your favorite team?" required />
        </label>
        <label>New answer
          <input type="text" id="account-new-answer" required />
        </label>
        <button type="submit">Save</button>
      </form>
    </div>
    <div class="category danger-zone">
      <h3>Delete My Account</h3>
      <p class="empty-note">This permanently deletes your account and all your logged stats/events. This cannot be undone.</p>
      <form id="account-delete-form" class="stat-form">
        <label>Confirm your password
          <input type="password" id="account-delete-password" required />
        </label>
        <button type="submit" class="danger-btn">Delete My Account</button>
      </form>
    </div>
    <div id="account-message" class="message hidden"></div>
  `;

  function showAccountMessage(text) {
    const el = document.getElementById("account-message");
    el.textContent = text;
    el.classList.toggle("hidden", !text);
  }

  document.getElementById("account-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const current_password = document.getElementById("account-current-password").value;
    const new_password = document.getElementById("account-new-password").value;
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password, new_password }),
    });
    const data = await res.json();
    showAccountMessage(res.ok ? "Password changed." : data.error || "Failed.");
    if (res.ok) event.target.reset();
  });

  document.getElementById("account-security-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const current_password = document.getElementById("account-security-current-password").value;
    const new_question = document.getElementById("account-new-question").value.trim();
    const new_answer = document.getElementById("account-new-answer").value.trim();
    const res = await fetch("/api/account/security-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password, new_question, new_answer }),
    });
    const data = await res.json();
    showAccountMessage(res.ok ? "Security question updated." : data.error || "Failed.");
    if (res.ok) event.target.reset();
  });

  document.getElementById("account-delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) return;
    const password = document.getElementById("account-delete-password").value;
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAccountMessage(data.error || "Failed.");
      return;
    }
    currentUsername = null;
    currentIsAdmin = false;
    currentIsPremium = false;
    ALL_TAB_IDS.forEach((id) => {
      const el = document.getElementById(id);
      el.innerHTML = "";
      delete el.dataset.initialized;
      delete el.dataset.shellReady;
    });
    showAuthScreen();
  });
}
