const API_BASE = `${window.location.origin}/api`;

const state = {
  activeTab: "dashboard",
  eventsPage: 1,
  filters: {
    q: "",
    jurisdictions: [],
    stages: [],
    ageBracket: "",
    fromDate: "",
    toDate: "",
    minRisk: 1,
    maxRisk: 5,
    sortBy: "recently_updated",
    sortDir: "desc",
  },
  savedSearches: [],
  selectedSavedSearchId: "",
};

const stageLabelMap = {
  proposed: "Proposed",
  introduced: "Introduced",
  committee_review: "Committee Review",
  passed: "Passed",
  enacted: "Enacted",
  effective: "Effective",
  amended: "Amended",
  withdrawn: "Withdrawn",
  rejected: "Rejected",
};

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3200);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chili(score) {
  return "🌶️".repeat(score) + "○".repeat(Math.max(0, 5 - score));
}

function setLoading(containerId, rows = 4) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (let i = 0; i < rows; i += 1) {
    const div = document.createElement("div");
    div.className = "skeleton";
    div.style.height = "54px";
    div.style.marginBottom = "8px";
    container.appendChild(div);
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body.slice(0, 180)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response.text();
  }
  return response.json();
}

function activateTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });

  if (tab === "competitors") {
    loadCompetitors();
  } else if (tab === "reports") {
    loadJurisdictionOptions();
  } else if (tab === "alerts") {
    loadAlertSubscriptions();
  }
}

function currentFiltersToQuery(page = state.eventsPage) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "10");
  if (state.filters.q.trim()) params.set("q", state.filters.q.trim());
  if (state.filters.jurisdictions.length) params.set("jurisdictions", state.filters.jurisdictions.join(","));
  if (state.filters.stages.length) params.set("stages", state.filters.stages.join(","));
  if (state.filters.ageBracket) params.set("ageBracket", state.filters.ageBracket);
  if (state.filters.fromDate) params.set("fromDate", state.filters.fromDate);
  if (state.filters.toDate) params.set("toDate", state.filters.toDate);
  params.set("minRisk", String(state.filters.minRisk));
  params.set("maxRisk", String(state.filters.maxRisk));
  params.set("sortBy", state.filters.sortBy);
  params.set("sortDir", state.filters.sortDir);
  return params.toString();
}

function saveFilterState() {
  localStorage.setItem("reg-dashboard-filters", JSON.stringify(state.filters));
}

function loadFilterState() {
  const raw = localStorage.getItem("reg-dashboard-filters");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.filters = { ...state.filters, ...parsed };
  } catch {
    // ignore
  }
}

function applyFiltersToUI() {
  document.getElementById("search-input").value = state.filters.q;
  document.getElementById("age-bracket-filter").value = state.filters.ageBracket;
  document.getElementById("from-date").value = state.filters.fromDate;
  document.getElementById("to-date").value = state.filters.toDate;
  document.getElementById("min-risk").value = String(state.filters.minRisk);
  document.getElementById("max-risk").value = String(state.filters.maxRisk);
  document.getElementById("min-risk-value").textContent = String(state.filters.minRisk);
  document.getElementById("max-risk-value").textContent = String(state.filters.maxRisk);
  document.getElementById("sort-by").value = state.filters.sortBy;
  document.getElementById("sort-dir").value = state.filters.sortDir;

  const jurisdictionSelect = document.getElementById("jurisdiction-filter");
  Array.from(jurisdictionSelect.options).forEach((option) => {
    option.selected = state.filters.jurisdictions.includes(option.value);
  });

  const stageSelect = document.getElementById("stage-filter");
  Array.from(stageSelect.options).forEach((option) => {
    option.selected = state.filters.stages.includes(option.value);
  });
}

function getMultiSelectValues(selectId) {
  const select = document.getElementById(selectId);
  return Array.from(select.selectedOptions).map((option) => option.value);
}

function updateFiltersFromUI() {
  state.filters.q = document.getElementById("search-input").value;
  state.filters.jurisdictions = getMultiSelectValues("jurisdiction-filter");
  state.filters.stages = getMultiSelectValues("stage-filter");
  state.filters.ageBracket = document.getElementById("age-bracket-filter").value;
  state.filters.fromDate = document.getElementById("from-date").value;
  state.filters.toDate = document.getElementById("to-date").value;
  state.filters.minRisk = Number(document.getElementById("min-risk").value);
  state.filters.maxRisk = Number(document.getElementById("max-risk").value);
  if (state.filters.minRisk > state.filters.maxRisk) {
    const temp = state.filters.minRisk;
    state.filters.minRisk = state.filters.maxRisk;
    state.filters.maxRisk = temp;
  }
  state.filters.sortBy = document.getElementById("sort-by").value;
  state.filters.sortDir = document.getElementById("sort-dir").value;
}

async function loadDashboard() {
  try {
    setLoading("brief-container", 3);
    setLoading("notification-list", 2);

    const [summary, heatmap, pipeline, trends, worldMap, brief, notifications] = await Promise.all([
      fetchJson(`${API_BASE}/analytics/summary`),
      fetchJson(`${API_BASE}/analytics/heatmap`),
      fetchJson(`${API_BASE}/analytics/pipeline`),
      fetchJson(`${API_BASE}/analytics/trends?months=12`),
      fetchJson(`${API_BASE}/analytics/world-map`),
      fetchJson(`${API_BASE}/brief?limit=6`),
      fetchJson(`${API_BASE}/notifications?unreadOnly=true`),
    ]);

    renderSummary(summary);
    renderHeatmap(heatmap.items || []);
    renderPipeline(pipeline.items || []);
    renderTrendChart(trends.items || [], "trend-chart");
    renderWorldMap(worldMap.points || []);
    renderBrief(brief.items || []);
    renderNotifications(notifications.items || []);

    document.getElementById("last-updated").textContent = formatDate(brief.generatedAt || new Date().toISOString());
    document.getElementById("last-crawled").textContent = brief.lastCrawledAt ? formatDate(brief.lastCrawledAt) : "Never";
  } catch (error) {
    showToast(`Dashboard load failed: ${error.message}`);
  }
}

function renderSummary(summary) {
  document.getElementById("stat-total").textContent = String(summary.totalEvents || 0);
  document.getElementById("stat-risk").textContent = `${summary.averageRisk || 0} ${chili(Math.round(summary.averageRisk || 0))}`;
  document.getElementById("stat-jurisdiction").textContent = summary.topJurisdiction
    ? `${summary.topJurisdiction.flag} ${summary.topJurisdiction.name}`
    : "-";
  document.getElementById("stat-newest").textContent = summary.newestEvent ? summary.newestEvent.title : "-";
}

function riskColor(risk) {
  if (risk >= 4.5) return "#b91c1c";
  if (risk >= 3.5) return "#dc2626";
  if (risk >= 2.5) return "#ea580c";
  if (risk >= 1.5) return "#ca8a04";
  return "#15803d";
}

function renderHeatmap(items) {
  const container = document.getElementById("heatmap-grid");
  container.innerHTML = "";
  if (!items.length) {
    container.textContent = "No heatmap data.";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("button");
    card.className = "heat-cell";
    card.style.background = riskColor(item.averageRisk);
    card.innerHTML = `
      <strong>${item.flag || "🌐"} ${item.jurisdiction}</strong>
      <span>${item.eventCount} events</span>
      <span>avg ${item.averageRisk} ${chili(Math.round(item.averageRisk))}</span>
    `;
    card.addEventListener("click", () => {
      activateTab("events");
      state.filters.jurisdictions = [item.jurisdiction];
      applyFiltersToUI();
      saveFilterState();
      loadEvents(1);
    });
    container.appendChild(card);
  });
}

function renderPipeline(items) {
  const container = document.getElementById("pipeline-chart");
  container.innerHTML = "";
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "pipeline-row";
    const width = Math.round((item.count / maxCount) * 100);
    row.innerHTML = `
      <span>${stageLabelMap[item.stage] || item.stage}</span>
      <div class="pipeline-bar" style="width:${width}%; background:${item.color || '#64748b'}"></div>
      <strong>${item.count}</strong>
    `;
    container.appendChild(row);
  });
}

function renderTrendChart(items, elementId) {
  const svg = document.getElementById(elementId);
  svg.innerHTML = "";

  if (!items.length) {
    return;
  }

  const width = 520;
  const height = 240;
  const padX = 36;
  const padY = 24;
  const maxY = Math.max(1, ...items.map((point) => point.count));

  const points = items.map((point, index) => {
    const x = padX + (index / Math.max(1, items.length - 1)) * (width - padX * 2);
    const y = height - padY - (point.count / maxY) * (height - padY * 2);
    return { x, y, point };
  });

  const pathD = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", pathD);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#2563eb");
  line.setAttribute("stroke-width", "3");
  svg.appendChild(line);

  points.forEach(({ x, y, point }) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 4);
    circle.setAttribute("fill", "#0ea5e9");
    circle.innerHTML = `<title>${point.month || ""}: ${point.count}</title>`;
    svg.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x - 12);
    label.setAttribute("y", height - 8);
    label.setAttribute("fill", "currentColor");
    label.setAttribute("font-size", "10");
    label.textContent = (point.month || "").slice(5);
    svg.appendChild(label);
  });
}

function renderWorldMap(points) {
  const container = document.getElementById("world-map");
  container.innerHTML = "";

  if (!points.length) {
    container.textContent = "No map data.";
    return;
  }

  const width = container.clientWidth || 520;
  const height = container.clientHeight || 240;

  points.forEach((point) => {
    const x = ((point.lon + 180) / 360) * width;
    const y = ((90 - point.lat) / 180) * height;
    const size = 14 + Math.min(24, point.eventCount * 2);

    const dot = document.createElement("button");
    dot.className = "map-point";
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.background = riskColor(point.averageRisk);
    dot.title = `${point.jurisdiction}: ${point.eventCount} events, avg ${point.averageRisk}`;
    dot.textContent = point.flag || "🌐";
    dot.addEventListener("click", () => {
      activateTab("events");
      state.filters.jurisdictions = [point.jurisdiction];
      applyFiltersToUI();
      saveFilterState();
      loadEvents(1);
    });

    container.appendChild(dot);
  });
}

function renderBrief(items) {
  const container = document.getElementById("brief-container");
  container.innerHTML = "";

  if (!items.length) {
    container.textContent = "No briefing items.";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "brief-card";
    card.innerHTML = `
      <div class="brief-title">${item.lawName || item.title}</div>
      <div class="badges">
        <span class="badge">${item.jurisdiction.flag || "🌐"} ${item.jurisdiction.country}</span>
        <span class="badge stage-badge" style="background:${item.stageColor}">${stageLabelMap[item.stage] || item.stage}</span>
        <span class="badge" style="background:#7c3aed">${item.ageBracket}</span>
      </div>
      <div>${chili(item.scores.chili)} · ${item.updateCount || 0} updates</div>
      <p>${item.summary || "No summary"}</p>
      <small>Law key: ${item.lawKey || "n/a"}</small><br />
      <small>Updated ${formatDate(item.updatedAt)}</small>
    `;
    card.addEventListener("click", () => showLawDetail(item.lawKey || item.id));
    container.appendChild(card);
  });
}

function renderNotifications(items) {
  const container = document.getElementById("notification-list");
  container.innerHTML = "";

  if (!items.length) {
    container.textContent = "No unread notifications.";
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "notification-item";
    row.innerHTML = `
      <div>
        <strong>${item.severity.toUpperCase()}</strong> ${item.message}
        <div class="meta">${item.title} · ${formatDate(item.createdAt)}</div>
      </div>
      <button class="btn btn-secondary" data-id="${item.id}">Mark Read</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      await fetchJson(`${API_BASE}/notifications/${item.id}/read`, { method: "POST" });
      loadDashboard();
    });
    container.appendChild(row);
  });
}

function renderEventsTable(data) {
  const container = document.getElementById("events-container");
  container.innerHTML = "";

  if (!data.items || !data.items.length) {
    container.textContent = "No events match your filters.";
    renderPagination({ page: 1, totalPages: 1 });
    return;
  }

  const table = document.createElement("table");
  table.className = "events-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Title</th>
        <th>Jurisdiction</th>
        <th>Stage</th>
        <th>Risk</th>
        <th>Updated</th>
        <th>Source</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  data.items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><button class="link-btn" data-event-id="${item.id}">${item.title}</button></td>
      <td>${item.jurisdiction.flag || "🌐"} ${item.jurisdiction.country}${item.jurisdiction.state ? ` / ${item.jurisdiction.state}` : ""}</td>
      <td><span class="badge stage-badge" style="background:${item.stageColor}">${stageLabelMap[item.stage] || item.stage}</span></td>
      <td>${chili(item.scores.chili)}</td>
      <td>${formatDate(item.updatedAt)}</td>
      <td><a href="${item.source.url}" target="_blank" rel="noopener noreferrer">${item.source.name} ↗</a></td>
      <td>
        <button class="btn btn-secondary" data-edit-id="${item.id}">Edit</button>
      </td>
    `;

    row.querySelector("[data-event-id]").addEventListener("click", () => showEventDetail(item.id));
    row.querySelector("[data-edit-id]").addEventListener("click", () => showEventDetail(item.id, true));
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  renderPagination(data);
}

function renderPagination(data) {
  const container = document.getElementById("pagination");
  container.innerHTML = "";

  if ((data.totalPages || 1) <= 1) return;

  const addButton = (label, page, active = false) => {
    const button = document.createElement("button");
    button.textContent = label;
    if (active) button.classList.add("active");
    button.addEventListener("click", () => loadEvents(page));
    container.appendChild(button);
  };

  if (data.page > 1) addButton("← Prev", data.page - 1);

  const start = Math.max(1, data.page - 2);
  const end = Math.min(data.totalPages, start + 4);
  for (let page = start; page <= end; page += 1) {
    addButton(String(page), page, page === data.page);
  }

  if (data.page < data.totalPages) addButton("Next →", data.page + 1);
}

async function loadJurisdictions() {
  const heatmap = await fetchJson(`${API_BASE}/analytics/heatmap`);
  const jurisdictions = (heatmap.items || []).map((item) => item.jurisdiction).sort();

  const jurisdictionSelect = document.getElementById("jurisdiction-filter");
  const reportSelect = document.getElementById("jurisdiction-report-select");
  jurisdictionSelect.innerHTML = "";
  reportSelect.innerHTML = "";

  jurisdictions.forEach((jurisdiction) => {
    const option = document.createElement("option");
    option.value = jurisdiction;
    option.textContent = jurisdiction;
    jurisdictionSelect.appendChild(option);

    const option2 = document.createElement("option");
    option2.value = jurisdiction;
    option2.textContent = jurisdiction;
    reportSelect.appendChild(option2);
  });
}

async function loadEvents(page = 1) {
  state.eventsPage = page;
  updateFiltersFromUI();
  saveFilterState();

  setLoading("events-container", 5);

  try {
    const data = await fetchJson(`${API_BASE}/events?${currentFiltersToQuery(page)}`);
    renderEventsTable(data);
    document.getElementById("last-updated").textContent = formatDate(new Date().toISOString());
  } catch (error) {
    document.getElementById("events-container").textContent = `Failed to load events: ${error.message}`;
  }
}

async function loadSavedSearches() {
  const data = await fetchJson(`${API_BASE}/saved-searches`);
  state.savedSearches = data.items || [];

  const select = document.getElementById("saved-searches-select");
  select.innerHTML = `<option value="">Select saved search</option>`;

  state.savedSearches.forEach((saved) => {
    const option = document.createElement("option");
    option.value = String(saved.id);
    option.textContent = saved.name;
    select.appendChild(option);
  });
}

async function saveCurrentSearch() {
  updateFiltersFromUI();
  const name = window.prompt("Saved search name?");
  if (!name) return;

  await fetchJson(`${API_BASE}/saved-searches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filters: state.filters }),
  });

  showToast("Saved search created");
  loadSavedSearches();
}

function applySavedSearch(id) {
  const found = state.savedSearches.find((item) => String(item.id) === id);
  if (!found) return;
  state.selectedSavedSearchId = id;
  state.filters = { ...state.filters, ...found.filters };
  applyFiltersToUI();
  saveFilterState();
  loadEvents(1);
}

async function deleteSavedSearch() {
  const id = document.getElementById("saved-searches-select").value;
  if (!id) {
    showToast("Select a saved search first");
    return;
  }
  await fetchJson(`${API_BASE}/saved-searches/${id}`, { method: "DELETE" });
  showToast("Saved search deleted");
  loadSavedSearches();
}

async function showLawDetail(lawKey) {
  const encoded = encodeURIComponent(lawKey);
  const detail = await fetchJson(`${API_BASE}/laws/${encoded}`);
  const dialog = document.getElementById("event-dialog");
  const title = document.getElementById("event-dialog-title");
  const content = document.getElementById("event-dialog-content");

  title.textContent = detail.lawName;

  const timelineHtml = (detail.timeline || [])
    .slice(0, 30)
    .map((entry) => `
      <div class="timeline-item">
        <div><strong>${entry.label}</strong>${entry.value ? `: ${entry.value}` : ""}</div>
        <div class="time">${formatDate(entry.changedAt)} · ${entry.sourceName || ""}</div>
      </div>
    `)
    .join("");

  const updatesHtml = (detail.updates || [])
    .slice(0, 20)
    .map((update) => `
      <li>
        <strong>${update.title}</strong> (${stageLabelMap[update.stage] || update.stage})
        · ${update.source.name || "Unknown"}
        · ${formatDate(update.publishedDate || update.createdAt)}
      </li>
    `)
    .join("") || "<li>No updates</li>";

  content.innerHTML = `
    <p><strong>Law:</strong> ${detail.lawName}</p>
    <p><strong>Jurisdiction:</strong> ${detail.jurisdiction.flag || "🌐"} ${detail.jurisdiction.country}${detail.jurisdiction.state ? ` / ${detail.jurisdiction.state}` : ""}</p>
    <p><strong>Status:</strong> ${stageLabelMap[detail.stage] || detail.stage} · <strong>Updates:</strong> ${detail.updateCount}</p>
    <p><strong>Risk:</strong> ${chili(detail.scores.chili)} (max ${detail.risk.max}, recent ${detail.risk.recentWeighted})</p>
    <p><strong>Latest summary:</strong> ${detail.summary || "No summary"}</p>

    <h4>Law Update Timeline</h4>
    <div class="timeline">${timelineHtml || "<div class='timeline-item'>No timeline entries</div>"}</div>

    <h4>Recent Updates</h4>
    <ul>${updatesHtml}</ul>
  `;

  dialog.showModal();
}

async function showEventDetail(eventId, editMode = false) {
  const detail = await fetchJson(`${API_BASE}/events/${eventId}`);
  const dialog = document.getElementById("event-dialog");
  const title = document.getElementById("event-dialog-title");
  const content = document.getElementById("event-dialog-content");

  title.textContent = detail.title;

  const timelineHtml = (detail.timeline || [])
    .slice(0, 20)
    .map((entry) => `
      <div class="timeline-item">
        <div><strong>${entry.label}</strong>${entry.value ? `: ${entry.value}` : ""}</div>
        <div class="time">${formatDate(entry.changedAt)}</div>
      </div>
    `)
    .join("");

  const relatedHtml = (detail.relatedEvents || [])
    .map((item) => `<li>${item.jurisdiction.flag || "🌐"} ${item.title} (${item.stage})</li>`)
    .join("") || "<li>No related events</li>";

  content.innerHTML = `
    <p><strong>Jurisdiction:</strong> ${detail.jurisdiction.flag || "🌐"} ${detail.jurisdiction.country}${detail.jurisdiction.state ? ` / ${detail.jurisdiction.state}` : ""}</p>
    <p><strong>Stage:</strong> ${stageLabelMap[detail.stage] || detail.stage} · <strong>Risk:</strong> ${chili(detail.scores.chili)}</p>
    <p><strong>Summary:</strong> ${detail.summary || "No summary"}</p>
    <p><strong>Business impact:</strong> ${detail.businessImpact || "Not provided"}</p>
    <p><strong>Source:</strong> <a href="${detail.source.url}" target="_blank" rel="noopener">${detail.source.name} ↗</a></p>

    <h4>Regulatory Timeline</h4>
    <div class="timeline">${timelineHtml}</div>

    <h4>Related Events</h4>
    <ul>${relatedHtml}</ul>

    <h4>Feedback History</h4>
    <ul>${(detail.feedback || []).map((fb) => `<li>${fb.rating.toUpperCase()} · ${fb.note || "(no note)"} · ${formatDate(fb.createdAt)}</li>`).join("") || "<li>No feedback</li>"}</ul>

    <h4>Edit Event</h4>
    <form id="event-edit-form">
      <label>Stage
        <select name="stage">
          ${Object.keys(stageLabelMap).map((stage) => `<option value="${stage}" ${stage === detail.stage ? "selected" : ""}>${stageLabelMap[stage]}</option>`).join("")}
        </select>
      </label>
      <label>Summary
        <textarea name="summary" rows="3">${detail.summary || ""}</textarea>
      </label>
      <label>Business Impact
        <textarea name="businessImpact" rows="2">${detail.businessImpact || ""}</textarea>
      </label>
      <label>Chili Score
        <input type="number" name="chiliScore" min="1" max="5" value="${detail.scores.chili}" />
      </label>
      <button type="submit" class="btn btn-primary">Save Changes</button>
    </form>
  `;

  const form = content.querySelector("#event-edit-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      stage: formData.get("stage"),
      summary: formData.get("summary"),
      businessImpact: formData.get("businessImpact"),
      chiliScore: Number(formData.get("chiliScore")),
    };
    await fetchJson(`${API_BASE}/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    showToast("Event updated");
    loadEvents(state.eventsPage);
    loadDashboard();
    if (!editMode) {
      dialog.close();
    }
  });

  dialog.showModal();
}

async function loadCompetitors() {
  try {
    const [overview, timeline] = await Promise.all([
      fetchJson(`${API_BASE}/competitors/overview`),
      fetchJson(`${API_BASE}/competitors/timeline`),
    ]);

    const container = document.getElementById("competitor-table");
    if (!overview.items.length) {
      container.textContent = "No competitor response data yet.";
    } else {
      const table = document.createElement("table");
      table.className = "events-table";
      table.innerHTML = `
        <thead><tr><th>Competitor</th><th>Response Count</th><th>Latest Activity</th><th>Examples</th></tr></thead>
        <tbody>
          ${overview.items.map((item) => `
            <tr>
              <td>${item.competitor}</td>
              <td>${item.responseCount}</td>
              <td>${formatDate(item.latestActivityAt)}</td>
              <td>${(item.samples || []).join("; ")}</td>
            </tr>
          `).join("")}
        </tbody>
      `;
      container.innerHTML = "";
      container.appendChild(table);
    }

    const trendPoints = (timeline.items || []).map((item) => ({
      month: item.month,
      count: (item.competitors || []).reduce((sum, row) => sum + row.count, 0),
    }));
    renderTrendChart(trendPoints, "competitor-timeline");
  } catch (error) {
    showToast(`Competitor view failed: ${error.message}`);
  }
}

async function loadTrendReport() {
  const report = await fetchJson(`${API_BASE}/reports/trend-analysis`);
  document.getElementById("report-output").textContent = JSON.stringify(report, null, 2);
}

async function loadJurisdictionOptions() {
  if (document.getElementById("jurisdiction-report-select").options.length === 0) {
    await loadJurisdictions();
  }
}

async function loadJurisdictionReport() {
  const country = document.getElementById("jurisdiction-report-select").value;
  if (!country) {
    showToast("Choose a jurisdiction first");
    return;
  }
  const report = await fetchJson(`${API_BASE}/reports/jurisdiction/${encodeURIComponent(country)}`);
  document.getElementById("report-output").textContent = JSON.stringify(report, null, 2);
}

function downloadFile(url) {
  window.open(url, "_blank", "noopener");
}

async function loadAlertSubscriptions() {
  const data = await fetchJson(`${API_BASE}/alerts/subscriptions`);
  const container = document.getElementById("alert-subscriptions-list");
  if (!data.items.length) {
    container.textContent = "No subscriptions yet.";
    return;
  }

  const list = document.createElement("ul");
  list.innerHTML = data.items
    .map((item) => `<li>${item.frequency.toUpperCase()} · chili >= ${item.minChili} · ${item.email || "(no email)"} ${item.webhookUrl ? `· ${item.webhookUrl}` : ""}</li>`)
    .join("");
  container.innerHTML = "";
  container.appendChild(list);
}

async function createAlertSubscription() {
  const payload = {
    email: document.getElementById("alert-email").value,
    webhookUrl: document.getElementById("alert-webhook").value,
    frequency: document.getElementById("alert-frequency").value,
    minChili: Number(document.getElementById("alert-min-chili").value),
  };

  await fetchJson(`${API_BASE}/alerts/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  showToast("Subscription created");
  loadAlertSubscriptions();
}

async function previewDigest() {
  const payload = {
    frequency: document.getElementById("alert-frequency").value,
    minChili: Number(document.getElementById("alert-min-chili").value),
  };

  const preview = await fetchJson(`${API_BASE}/alerts/digest/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  document.getElementById("digest-preview").textContent = JSON.stringify(preview, null, 2);
}

async function dispatchWebhook() {
  const payload = {
    webhookUrl: document.getElementById("alert-webhook").value,
    frequency: document.getElementById("alert-frequency").value,
    minChili: Number(document.getElementById("alert-min-chili").value),
  };

  const result = await fetchJson(`${API_BASE}/alerts/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  showToast(`Webhook dispatch: ${result.status}`);
}

async function triggerCrawl() {
  const button = document.getElementById("crawl-btn");
  button.disabled = true;
  button.textContent = "Crawling…";

  try {
    await fetchJson(`${API_BASE}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    showToast("Crawl started");
    pollCrawlStatus();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Run Crawl";
    showToast(`Crawl failed to start: ${error.message}`);
  }
}

function pollCrawlStatus() {
  const button = document.getElementById("crawl-btn");
  const interval = setInterval(async () => {
    try {
      const status = await fetchJson(`${API_BASE}/crawl/status`);
      if (status.status === "completed" || status.status === "failed") {
        clearInterval(interval);
        button.disabled = false;
        button.textContent = "Run Crawl";

        if (status.status === "completed") {
          showToast(`Crawl complete (${status.itemsNew} new, ${status.itemsUpdated} updated)`);
          loadDashboard();
          loadEvents(state.eventsPage);
        } else {
          showToast(`Crawl failed: ${status.errorMessage || "unknown"}`);
        }
      }
    } catch {
      // ignore poll error
    }
  }, 5000);
}

function clearFilters() {
  state.filters = {
    q: "",
    jurisdictions: [],
    stages: [],
    ageBracket: "",
    fromDate: "",
    toDate: "",
    minRisk: 1,
    maxRisk: 5,
    sortBy: "recently_updated",
    sortDir: "desc",
  };
  applyFiltersToUI();
  saveFilterState();
  loadEvents(1);
}

function setupDarkMode() {
  const saved = localStorage.getItem("reg-dashboard-dark") === "1";
  document.body.classList.toggle("dark", saved);

  document.getElementById("dark-mode-toggle").addEventListener("click", () => {
    const enabled = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", enabled);
    localStorage.setItem("reg-dashboard-dark", enabled ? "1" : "0");
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      activateTab("events");
      document.getElementById("search-input").focus();
    } else if (event.key.toLowerCase() === "d") {
      document.getElementById("dark-mode-toggle").click();
    } else if (event.key.toLowerCase() === "g") {
      activateTab("dashboard");
    }
  });
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  document.getElementById("apply-filters-btn").addEventListener("click", () => loadEvents(1));
  document.getElementById("clear-filters-btn").addEventListener("click", clearFilters);
  document.getElementById("save-search-btn").addEventListener("click", saveCurrentSearch);
  document.getElementById("delete-saved-search-btn").addEventListener("click", deleteSavedSearch);
  document.getElementById("saved-searches-select").addEventListener("change", (event) => applySavedSearch(event.target.value));

  document.getElementById("export-csv-btn").addEventListener("click", () => downloadFile(`${API_BASE}/export/csv?${currentFiltersToQuery(1)}`));
  document.getElementById("export-pdf-btn").addEventListener("click", () => downloadFile(`${API_BASE}/export/pdf?${currentFiltersToQuery(1)}`));

  document.getElementById("download-exec-brief").addEventListener("click", () => downloadFile(`${API_BASE}/export/pdf?${currentFiltersToQuery(1)}`));
  document.getElementById("load-trend-report").addEventListener("click", loadTrendReport);
  document.getElementById("load-jurisdiction-report").addEventListener("click", loadJurisdictionReport);

  document.getElementById("create-alert-btn").addEventListener("click", createAlertSubscription);
  document.getElementById("preview-digest-btn").addEventListener("click", previewDigest);
  document.getElementById("dispatch-webhook-btn").addEventListener("click", dispatchWebhook);

  document.getElementById("crawl-btn").addEventListener("click", triggerCrawl);
  document.getElementById("refresh-brief").addEventListener("click", loadDashboard);

  document.getElementById("min-risk").addEventListener("input", (event) => {
    document.getElementById("min-risk-value").textContent = event.target.value;
  });
  document.getElementById("max-risk").addEventListener("input", (event) => {
    document.getElementById("max-risk-value").textContent = event.target.value;
  });
}

async function boot() {
  setupDarkMode();
  setupKeyboardShortcuts();
  bindEvents();

  loadFilterState();

  try {
    await loadJurisdictions();
  } catch (error) {
    showToast(`Could not load jurisdictions: ${error.message}`);
  }

  applyFiltersToUI();

  await Promise.all([
    loadSavedSearches(),
    loadDashboard(),
    loadEvents(1),
  ]);

  setInterval(() => {
    loadDashboard();
    if (state.activeTab === "events") {
      loadEvents(state.eventsPage);
    }
  }, 60000);
}

document.addEventListener("DOMContentLoaded", boot);
