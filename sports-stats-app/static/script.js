let metricsCatalog = {};
let gameMetricKeysBySport = {};
let currentUsername = null;

window.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadMetricsCatalog();
  setupAuthUI();
  setupTabUI();
  await checkAuth();
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
    showApp(data.username);
  } else {
    showAuthScreen();
  }
}

// ---------- Auth screen ----------

function setupAuthUI() {
  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.authTab;
      document.getElementById("login-form").classList.toggle("hidden", target !== "login");
      document.getElementById("signup-form").classList.toggle("hidden", target !== "signup");
      showAuthMessage("");
    });
  });

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
    showApp(data.username);
  });

  document.getElementById("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("signup-username").value.trim();
    const password = document.getElementById("signup-password").value;
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthMessage(data.error || "Sign up failed.");
      return;
    }
    showApp(data.username);
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    currentUsername = null;
    ["tab-home", "tab-your-stats", "tab-calendar", "tab-player-stats", "tab-compare", "tab-leaderboard", "tab-projections"].forEach((id) => {
      const el = document.getElementById(id);
      el.innerHTML = "";
      delete el.dataset.initialized;
    });
    showAuthScreen();
  });
}

function showAuthMessage(text) {
  const el = document.getElementById("auth-message");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

function showApp(username) {
  currentUsername = username;
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("current-username").textContent = username;
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
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));

  if (tab === "home") renderHomePanel();
  if (tab === "your-stats") renderYourStats();
  if (tab === "calendar") renderCalendarPanel();
  if (tab === "player-stats") renderPlayerStatsPanel();
  if (tab === "compare") renderComparePanel();
  if (tab === "leaderboard") renderLeaderboardPanel();
  if (tab === "projections") renderProjectionsPanel();
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
      <p class="description">${info.description ? info.description.slice(0, 600) + (info.description.length > 600 ? "..." : "") : ""}</p>
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

function renderPlayerDetailInto(container, data) {
  const { info, last_events, next_events } = data;

  container.innerHTML = `
    ${backLinkHtml()}
    <div class="detail-header">
      ${info.thumb ? `<img src="${info.thumb}" alt="${info.name}" />` : ""}
      <div>
        <h2>${info.name}</h2>
        <div class="result-meta">${info.sport || ""}${info.team ? " · " + info.team : ""}${info.position ? " · " + info.position : ""}</div>
      </div>
    </div>

    <div class="category">
      <h3>Overview</h3>
      <p>
        <strong>Nationality:</strong> ${info.nationality || "-"} &nbsp;
        <strong>Born:</strong> ${info.born || "-"} &nbsp;
        <strong>Status:</strong> ${info.status || "-"}
      </p>
      ${info.height || info.weight ? `<p><strong>Height:</strong> ${info.height || "-"} &nbsp; <strong>Weight:</strong> ${info.weight || "-"}</p>` : ""}
      <p class="description">${info.description ? info.description.slice(0, 600) + (info.description.length > 600 ? "..." : "") : ""}</p>
    </div>

    <div class="category">
      <h3>Team's Recent Results</h3>
      ${eventsTable(last_events, true)}
    </div>

    <div class="category">
      <h3>Team's Upcoming Fixtures</h3>
      ${eventsTable(next_events, false)}
    </div>
  `;
}

function renderFullDetail(container, item, data, onBack) {
  if (item.type === "team") {
    renderTeamDetailInto(container, data);
  } else {
    renderPlayerDetailInto(container, data);
  }
  container.classList.remove("hidden");
  document.getElementById("back-link").addEventListener("click", onBack);
}

async function renderCompareDetail(container, item, data, onBack) {
  const info = data.info;

  const statsRes = await fetch("/api/stats/me");
  const statsData = await statsRes.json();
  const bio = {};
  (statsData.stats || []).forEach((s) => {
    if (s.sport === "Bio" && !(s.metric_key in bio)) {
      bio[s.metric_key] = s.value;
    }
  });

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
      <h3>Compare Your Bio Stats</h3>
      <div class="compare-form">
        <label>Height (cm)<input type="number" id="cmp-height" value="${bio.height_cm ?? ""}" placeholder="e.g. 180" /></label>
        <label>Weight (kg)<input type="number" id="cmp-weight" value="${bio.weight_kg ?? ""}" placeholder="e.g. 75" /></label>
        <label>Age (years)<input type="number" id="cmp-age" value="${bio.age ?? ""}" placeholder="e.g. 25" /></label>
      </div>
      <div class="compare-form">
        <button type="button" id="cmp-btn">Compare</button>
        <button type="button" id="cmp-save-btn">Save as My Bio Stats</button>
      </div>
      <p class="empty-note">${
        Object.keys(bio).length
          ? "Prefilled from your last saved Your Stats entries."
          : "No saved Bio stats yet — log some in Your Stats, or just type values below."
      }</p>
      <div id="cmp-save-msg" class="empty-note hidden"></div>
      <div id="cmp-result"></div>
    </div>
  `;
  container.classList.remove("hidden");
  document.getElementById("back-link").addEventListener("click", onBack);

  function runCompare() {
    const you = {
      height: parseFloat(document.getElementById("cmp-height").value),
      weight: parseFloat(document.getElementById("cmp-weight").value),
      age: parseFloat(document.getElementById("cmp-age").value),
    };
    const rows = [
      compareRow("Height", you.height, info.height_cm, " cm", info.name),
      compareRow("Weight", you.weight, info.weight_kg, " kg", info.name),
      compareRow("Age", you.age, info.age, " yrs", info.name),
    ].join("");
    document.getElementById("cmp-result").innerHTML = rows;
  }

  document.getElementById("cmp-btn").addEventListener("click", runCompare);

  document.getElementById("cmp-save-btn").addEventListener("click", async () => {
    const entries = [
      { sport: "Bio", metric_key: "height_cm", value: document.getElementById("cmp-height").value },
      { sport: "Bio", metric_key: "weight_kg", value: document.getElementById("cmp-weight").value },
      { sport: "Bio", metric_key: "age", value: document.getElementById("cmp-age").value },
    ].filter((e) => e.value !== "");

    for (const entry of entries) {
      await fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    }

    const msg = document.getElementById("cmp-save-msg");
    msg.textContent = "Saved to Your Stats!";
    msg.classList.remove("hidden");
    setTimeout(() => msg.classList.add("hidden"), 2500);
  });

  if (bio.height_cm !== undefined || bio.weight_kg !== undefined || bio.age !== undefined) {
    runCompare();
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

    clearEl(detailEl);
    clearEl(resultsEl);
    showMsg("Searching...");

    try {
      const url = `/api/search?q=${encodeURIComponent(query)}` + (typeFilter ? `&type=${typeFilter}` : "");
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 429) {
        showMsg(data.error || "Rate limit reached, please wait a moment and try again.");
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
        showMsg(data.error || "Rate limit reached, please wait a moment and try again.");
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
  const panel = document.getElementById("tab-player-stats");
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
  const panel = document.getElementById("tab-compare");
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

const PIE_COLORS = ["#14458f", "#2f7dc4", "#5aa9e6", "#8fd0f7", "#0a2f6b", "#3a5a8a", "#7ec8e3", "#1e6fb8"];

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

async function renderHomePanel() {
  const panel = document.getElementById("tab-home");
  const [res, todayRes] = await Promise.all([fetch("/api/stats/me"), fetch("/api/events/today")]);
  const data = await res.json();
  const todayData = await todayRes.json();
  const stats = data.stats || [];
  const dueEvents = (todayData.events || []).filter((e) => !e.logged);

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

  let growthHtml = `<p class="empty-note">Log at least 2 entries for the same metric in Your Stats to see a growth trend here.</p>`;
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

  const reminderHtml = dueEvents
    .map(
      (e) => `
      <div class="reminder-banner">
        <div class="reminder-text">
          ${e.event_type === "match" ? "⚽" : "🏋️"} You have a
          ${e.sport} <strong>${e.event_type === "match" ? "Match" : "Practice"}</strong> today${e.event_time ? ` at ${formatEventTime(e.event_time)}` : ""}${e.opponent ? ` vs ${e.opponent}` : ""} — log your stats.
        </div>
        <button type="button" class="reminder-log-btn" id="reminder-log-btn-${e.id}">Log Stats</button>
      </div>
      <div class="reminder-form hidden" id="reminder-form-${e.id}"></div>`
    )
    .join("");

  panel.innerHTML = `
    <div class="category home-greeting">
      <h2>Welcome back, ${currentUsername}!</h2>
      <p class="subtitle">Here's a snapshot of what you've logged so far.</p>
      ${reminderHtml}
    </div>
    <div class="category">
      <h3>Your Stats Breakdown</h3>
      ${slices.length ? renderPieChart(slices) : `<p class="empty-note">No stats logged yet — head to Your Stats to log your first entry.</p>`}
    </div>
    <div class="category">
      <h3>Growth</h3>
      ${growthHtml}
    </div>
  `;

  dueEvents.forEach((e) => {
    const logBtn = document.getElementById(`reminder-log-btn-${e.id}`);
    const formContainer = document.getElementById(`reminder-form-${e.id}`);
    wireGameLogToggle(logBtn, formContainer, e.id, `reminder-${e.id}`, e.sport, renderHomePanel);
  });
}

// ---------- Your Stats tab ----------

function renderYourStats() {
  const panel = document.getElementById("tab-your-stats");
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
  const panel = document.getElementById("tab-calendar");
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
  const panel = document.getElementById("tab-leaderboard");
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
              <td>${e.rank}</td><td>${e.username}</td><td>${e.value}${e.unit ? " " + e.unit : ""}</td>
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
  const panel = document.getElementById("tab-projections");
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
            .map(
              (p) => `<tr><td>${p.days_from_now} days</td><td>${p.value}${metric.unit ? " " + metric.unit : ""}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="empty-note">${model_note}</p>
    `;
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
      <polyline points="${points}" fill="none" stroke="#4f8cff" stroke-width="2" />
    </svg>
  `;
}
