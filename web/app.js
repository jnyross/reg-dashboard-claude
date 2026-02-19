const API_BASE = window.location.origin + '/api';

let currentPage = 1;
let currentJurisdiction = '';
let currentMinRisk = '';
let currentAgeBracket = '';
let lastUpdated = null;

function showError(message) {
  const banner = document.getElementById('error-banner');
  const msg = document.getElementById('error-message');
  msg.textContent = message;
  banner.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-banner').classList.add('hidden');
}

function getChiliHTML(score) {
  const filled = '\u{1F336}\uFE0F'.repeat(score);
  const empty = '\u25CB'.repeat(5 - score);
  return `<span class="chili">${filled}${empty}</span>`;
}

function getReliabilityHTML(tier) {
  const labels = { 5: 'Official', 4: 'Legal/Industry', 3: 'News', 2: 'Social', 1: 'Unverified' };
  const colors = { 5: '#198754', 4: '#0d6efd', 3: '#ffc107', 2: '#fd7e14', 1: '#dc3545' };
  const label = labels[tier] || 'Unknown';
  const color = colors[tier] || '#6c757d';
  return `<span class="reliability-badge" style="background:${escapeHTML(color)}">${escapeHTML(label)}</span>`;
}

function getAgeBracketHTML(bracket) {
  const labels = { '13-15': '13-15', '16-18': '16-18', 'both': '13-18' };
  const label = labels[bracket] || '13-18';
  return `<span class="age-badge">${escapeHTML(label)}</span>`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatJurisdiction(item) {
  if (item.jurisdiction.state) {
    return `${item.jurisdiction.state}, ${item.jurisdiction.country}`;
  }
  return item.jurisdiction.country;
}

function renderBriefItems(items) {
  const container = document.getElementById('brief-container');

  if (!items || items.length === 0) {
    container.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.textContent = 'No priority items at this time.';
    container.appendChild(emptyDiv);
    return;
  }

  container.textContent = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'brief-card';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'brief-card-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = item.title;
    headerDiv.appendChild(titleDiv);

    if (item.source && item.source.reliabilityTier) {
      const reliabilitySpan = document.createElement('span');
      reliabilitySpan.className = 'reliability-badge';
      const tier = item.source.reliabilityTier;
      const labels = { 5: 'Official', 4: 'Legal/Industry', 3: 'News', 2: 'Social', 1: 'Unverified' };
      const colors = { 5: '#198754', 4: '#0d6efd', 3: '#ffc107', 2: '#fd7e14', 1: '#dc3545' };
      reliabilitySpan.textContent = labels[tier] || 'Unknown';
      reliabilitySpan.style.background = colors[tier] || '#6c757d';
      headerDiv.appendChild(reliabilitySpan);
    }
    card.appendChild(headerDiv);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'meta';

    const jurisdictionSpan = document.createElement('span');
    jurisdictionSpan.className = 'jurisdiction';
    jurisdictionSpan.textContent = formatJurisdiction(item);
    metaDiv.appendChild(jurisdictionSpan);

    const stageSpan = document.createElement('span');
    stageSpan.className = `stage stage-${item.stage}`;
    stageSpan.textContent = item.stage.replace('_', ' ');
    metaDiv.appendChild(stageSpan);

    const ageSpan = document.createElement('span');
    ageSpan.className = 'age-badge';
    const ageLabels = { '13-15': '13-15', '16-18': '16-18', 'both': '13-18' };
    ageSpan.textContent = ageLabels[item.ageBracket] || '13-18';
    metaDiv.appendChild(ageSpan);

    const chiliSpan = document.createElement('span');
    chiliSpan.className = 'chili';
    const chiliScore = item.chiliScore || (item.scores && item.scores.chili) || 1;
    chiliSpan.textContent = '\u{1F336}\uFE0F'.repeat(chiliScore) + '\u25CB'.repeat(5 - chiliScore);
    metaDiv.appendChild(chiliSpan);

    card.appendChild(metaDiv);

    const reasonDiv = document.createElement('div');
    reasonDiv.className = 'reason';
    reasonDiv.textContent = item.summary || 'No summary available';
    card.appendChild(reasonDiv);

    if (item.affectedProducts && item.affectedProducts.length > 0) {
      const productsDiv = document.createElement('div');
      productsDiv.className = 'products';
      item.affectedProducts.forEach(p => {
        const tag = document.createElement('span');
        tag.className = 'product-tag';
        tag.textContent = p;
        productsDiv.appendChild(tag);
      });
      card.appendChild(productsDiv);
    }

    if (item.source && item.source.url) {
      const link = document.createElement('a');
      link.href = item.source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'source-link';
      link.textContent = 'View Source \u2192';
      card.appendChild(link);
    }

    container.appendChild(card);
  });
}

function renderEventsTable(data) {
  const container = document.getElementById('events-container');

  if (!data.items || data.items.length === 0) {
    container.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.textContent = 'No events match your filters.';
    container.appendChild(emptyDiv);
    return;
  }

  const table = document.createElement('table');
  table.className = 'events-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Title', 'Jurisdiction', 'Age', 'Stage', 'Risk', 'Source', 'Feedback'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  data.items.forEach(item => {
    const tr = document.createElement('tr');

    // Title
    const tdTitle = document.createElement('td');
    tdTitle.className = 'title-cell';
    const titleLink = document.createElement('a');
    titleLink.href = '#';
    titleLink.title = item.summary || '';
    titleLink.textContent = item.title;
    titleLink.addEventListener('click', (e) => { e.preventDefault(); showEventDetail(item.id); });
    tdTitle.appendChild(titleLink);
    tr.appendChild(tdTitle);

    // Jurisdiction
    const tdJuris = document.createElement('td');
    tdJuris.textContent = formatJurisdiction(item);
    tr.appendChild(tdJuris);

    // Age bracket
    const tdAge = document.createElement('td');
    const ageBadge = document.createElement('span');
    ageBadge.className = 'age-badge';
    const al = { '13-15': '13-15', '16-18': '16-18', 'both': '13-18' };
    ageBadge.textContent = al[item.ageBracket] || '13-18';
    tdAge.appendChild(ageBadge);
    tr.appendChild(tdAge);

    // Stage
    const tdStage = document.createElement('td');
    const stageBadge = document.createElement('span');
    stageBadge.className = `stage stage-${item.stage}`;
    stageBadge.textContent = item.stage.replace('_', ' ');
    tdStage.appendChild(stageBadge);
    tr.appendChild(tdStage);

    // Risk
    const tdRisk = document.createElement('td');
    tdRisk.className = 'chili-cell';
    const riskScore = (item.scores && item.scores.chili) || 1;
    tdRisk.textContent = '\u{1F336}\uFE0F'.repeat(riskScore) + '\u25CB'.repeat(5 - riskScore);
    tr.appendChild(tdRisk);

    // Source with reliability
    const tdSource = document.createElement('td');
    tdSource.className = 'source-cell';
    const relBadge = document.createElement('span');
    relBadge.className = 'reliability-badge';
    const tier = (item.source && item.source.reliabilityTier) || 3;
    const relLabels = { 5: 'Official', 4: 'Legal', 3: 'News', 2: 'Social', 1: 'Unverified' };
    const relColors = { 5: '#198754', 4: '#0d6efd', 3: '#ffc107', 2: '#fd7e14', 1: '#dc3545' };
    relBadge.textContent = relLabels[tier] || 'Unknown';
    relBadge.style.background = relColors[tier] || '#6c757d';
    tdSource.appendChild(relBadge);
    tdSource.appendChild(document.createTextNode(' '));
    if (item.source && item.source.url) {
      const srcLink = document.createElement('a');
      srcLink.href = item.source.url;
      srcLink.target = '_blank';
      srcLink.rel = 'noopener';
      srcLink.textContent = item.source.name;
      tdSource.appendChild(srcLink);
    } else {
      tdSource.appendChild(document.createTextNode((item.source && item.source.name) || ''));
    }
    tr.appendChild(tdSource);

    // Feedback
    const tdFeedback = document.createElement('td');
    tdFeedback.className = 'feedback-cell';
    const goodBtn = document.createElement('button');
    goodBtn.className = 'feedback-btn good';
    goodBtn.textContent = '\uD83D\uDC4D';
    goodBtn.title = 'Mark as good';
    goodBtn.addEventListener('click', () => submitFeedback(item.id, 'good'));
    const badBtn = document.createElement('button');
    badBtn.className = 'feedback-btn bad';
    badBtn.textContent = '\uD83D\uDC4E';
    badBtn.title = 'Mark as bad';
    badBtn.addEventListener('click', () => submitFeedback(item.id, 'bad'));
    tdFeedback.appendChild(goodBtn);
    tdFeedback.appendChild(badBtn);
    tr.appendChild(tdFeedback);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.textContent = '';
  container.appendChild(table);
}

function renderPagination(data) {
  const container = document.getElementById('pagination');
  container.textContent = '';

  if (data.totalPages <= 1) return;

  if (data.page > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '\u2190 Prev';
    prevBtn.addEventListener('click', () => goToPage(data.page - 1));
    container.appendChild(prevBtn);
  }

  const maxPages = 5;
  let startPage = Math.max(1, data.page - Math.floor(maxPages / 2));
  let endPage = Math.min(data.totalPages, startPage + maxPages - 1);
  if (endPage - startPage < maxPages - 1) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = String(i);
    if (i === data.page) pageBtn.className = 'active';
    pageBtn.addEventListener('click', () => goToPage(i));
    container.appendChild(pageBtn);
  }

  if (data.page < data.totalPages) {
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next \u2192';
    nextBtn.addEventListener('click', () => goToPage(data.page + 1));
    container.appendChild(nextBtn);
  }
}

function populateJurisdictionFilter(items) {
  const select = document.getElementById('jurisdiction-filter');
  const jurisdictions = new Set();

  items.forEach(item => {
    if (item.jurisdiction && item.jurisdiction.country) {
      jurisdictions.add(item.jurisdiction.country);
    }
    if (item.jurisdiction && item.jurisdiction.state) {
      jurisdictions.add(item.jurisdiction.state);
    }
  });

  const sorted = Array.from(jurisdictions).sort();
  const currentValue = select.value;

  // Clear existing options except first
  while (select.options.length > 1) {
    select.remove(1);
  }

  sorted.forEach(j => {
    const option = document.createElement('option');
    option.value = j;
    option.textContent = j;
    select.appendChild(option);
  });

  if (currentValue) {
    select.value = currentValue;
  }
}

async function fetchBrief() {
  try {
    const response = await fetch(`${API_BASE}/brief?limit=5`);
    if (!response.ok) {
      throw new Error(`Brief API error: ${response.status}`);
    }
    const data = await response.json();
    renderBriefItems(data.items);
    lastUpdated = data.generatedAt;
    document.getElementById('last-updated').textContent = formatDate(data.generatedAt);

    if (data.lastCrawledAt) {
      document.getElementById('last-crawled').textContent = formatDate(data.lastCrawledAt);
    }
  } catch (error) {
    console.error('Error fetching brief:', error);
    showError(`Failed to load brief: ${error.message}`);
    const container = document.getElementById('brief-container');
    container.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'error-state';
    errDiv.textContent = 'Failed to load brief.';
    container.appendChild(errDiv);
  }
}

async function fetchEvents(page) {
  if (page === undefined) page = 1;
  try {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '10');

    if (currentJurisdiction) params.set('jurisdiction', currentJurisdiction);
    if (currentMinRisk) params.set('minRisk', currentMinRisk);
    if (currentAgeBracket) params.set('ageBracket', currentAgeBracket);

    const response = await fetch(`${API_BASE}/events?${params}`);
    if (!response.ok) {
      throw new Error(`Events API error: ${response.status}`);
    }
    const data = await response.json();

    renderEventsTable(data);
    renderPagination(data);

    if (page === 1 && !currentJurisdiction && !currentMinRisk && !currentAgeBracket) {
      populateJurisdictionFilter(data.items);
    }
  } catch (error) {
    console.error('Error fetching events:', error);
    showError(`Failed to load events: ${error.message}`);
    const container = document.getElementById('events-container');
    container.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'error-state';
    errDiv.textContent = 'Failed to load events.';
    container.appendChild(errDiv);
  }
}

async function submitFeedback(eventId, rating) {
  try {
    const response = await fetch(`${API_BASE}/events/${eventId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating })
    });

    if (!response.ok) {
      throw new Error(`Feedback API error: ${response.status}`);
    }

    showError('Feedback submitted successfully!');
    setTimeout(hideError, 3000);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    showError(`Failed to submit feedback: ${error.message}`);
  }
}

async function triggerCrawl() {
  const btn = document.getElementById('crawl-btn');
  btn.disabled = true;
  btn.textContent = 'Crawling...';

  try {
    const response = await fetch(`${API_BASE}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `Crawl error: ${response.status}`);
    }

    showError('Crawl started! Data will refresh when complete.');
    setTimeout(hideError, 5000);
    pollCrawlStatus();
  } catch (error) {
    console.error('Error triggering crawl:', error);
    showError(`Failed to start crawl: ${error.message}`);
    btn.disabled = false;
    btn.textContent = 'Run Crawl';
  }
}

function pollCrawlStatus() {
  const btn = document.getElementById('crawl-btn');
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/crawl/status`);
      const data = await response.json();

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = 'Run Crawl';

        if (data.status === 'completed') {
          showError(`Crawl complete: ${data.itemsNew} new, ${data.itemsUpdated} updated items.`);
          fetchBrief();
          fetchEvents(currentPage);
        } else {
          showError(`Crawl failed: ${data.errorMessage || 'Unknown error'}`);
        }
        setTimeout(hideError, 8000);
      }
    } catch (e) {
      // Ignore polling errors
    }
  }, 5000);
}

function showEventDetail(eventId) {
  console.log('Show detail for event:', eventId);
}

function goToPage(page) {
  currentPage = page;
  fetchEvents(page);
}

function applyFilters() {
  currentPage = 1;
  currentJurisdiction = document.getElementById('jurisdiction-filter').value;
  currentMinRisk = document.getElementById('min-risk-filter').value;
  currentAgeBracket = document.getElementById('age-bracket-filter').value;
  fetchEvents(currentPage);
}

function clearFilters() {
  currentPage = 1;
  currentJurisdiction = '';
  currentMinRisk = '';
  currentAgeBracket = '';
  document.getElementById('jurisdiction-filter').value = '';
  document.getElementById('min-risk-filter').value = '';
  document.getElementById('age-bracket-filter').value = '';
  fetchEvents(currentPage);
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchBrief();
  fetchEvents();

  setInterval(() => {
    fetchBrief();
    fetchEvents(currentPage);
  }, 60000);
});
