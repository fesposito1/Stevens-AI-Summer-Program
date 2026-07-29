const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const detailEl = document.getElementById("detail");
const messageEl = document.getElementById("message");

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.toggle("hidden", !text);
}

function clear(el) {
  el.innerHTML = "";
  el.classList.add("hidden");
}

function placeholderImg(src) {
  return src || "";
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  clear(detailEl);
  clear(resultsEl);
  showMessage("Searching...");

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (response.status === 429) {
      showMessage(data.error || "Rate limit reached, please wait a moment and try again.");
      return;
    }

    if (!data.results || data.results.length === 0) {
      showMessage(`No teams or players found for "${query}".`);
      return;
    }

    showMessage("");
    renderResults(data.results);
  } catch (err) {
    showMessage("Something went wrong reaching the server.");
  }
});

function renderResults(results) {
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
    li.addEventListener("click", () => openDetail(item));
    resultsEl.appendChild(li);
  }
}

async function openDetail(item) {
  clear(resultsEl);
  showMessage("Loading details...");

  try {
    const response = await fetch(`/api/${item.type}/${item.id}`);
    const data = await response.json();

    if (response.status === 429) {
      showMessage(data.error || "Rate limit reached, please wait a moment and try again.");
      return;
    }
    if (response.status === 404) {
      showMessage(data.error || "Not found.");
      return;
    }

    showMessage("");
    if (item.type === "team") {
      renderTeamDetail(data);
    } else {
      renderPlayerDetail(data);
    }
  } catch (err) {
    showMessage("Something went wrong reaching the server.");
  }
}

function backLink() {
  return `<div class="back-link" id="back-link">&larr; Back to results</div>`;
}

function attachBack() {
  document.getElementById("back-link").addEventListener("click", () => {
    clear(detailEl);
    resultsEl.classList.remove("hidden");
  });
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

function renderTeamDetail(data) {
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

  detailEl.innerHTML = `
    ${backLink()}
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
  detailEl.classList.remove("hidden");
  attachBack();
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

function renderPlayerDetail(data) {
  const { info, last_events, next_events } = data;

  detailEl.innerHTML = `
    ${backLink()}
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
      <h3>Compare Your Stats</h3>
      <div class="compare-form">
        <label>Height (cm)<input type="number" id="cmp-height" placeholder="e.g. 180" /></label>
        <label>Weight (kg)<input type="number" id="cmp-weight" placeholder="e.g. 75" /></label>
        <label>Age (years)<input type="number" id="cmp-age" placeholder="e.g. 25" /></label>
        <button type="button" id="cmp-btn">Compare</button>
      </div>
      <div id="cmp-result"></div>
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
  detailEl.classList.remove("hidden");
  attachBack();

  document.getElementById("cmp-btn").addEventListener("click", () => {
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
  });
}
