// ═══════════════════════════════════════════════════════════
//  Gold Jewellery Calculator — PWA Application Logic
//  app.js
// ═══════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const STATE = {
  liveRate: { r18: null, r22: null, r24: null, silver: null, fetchedAt: null },
  shops: [],          // Array of shop objects
  activeShopId: null,
  activeView: 'shop', // 'shop' | 'summary'
  maxShops: 5,
  shopIdCounter: 0
};

// ─────────────────────────────────────────
//  SHOP FACTORY
// ─────────────────────────────────────────
function createShop(name = '') {
  STATE.shopIdCounter++;
  const id = STATE.shopIdCounter;
  return {
    id,
    name: name || `Shop ${id}`,
    rate: STATE.liveRate.r22 || 0,
    goldWeight: '',
    wastage: 12,
    making: '',
    gst: 3,
    ogEntries: [],
    ogIdCounter: 0
  };
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Add first shop
  const shop1 = createShop('Shop 1');
  STATE.shops.push(shop1);
  STATE.activeShopId = shop1.id;

  renderTabBar();
  renderActiveShop();
  fetchLiveRates();

  // Install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._installPrompt = e;
    document.getElementById('installBanner').style.display = 'flex';
  });
});

// ─────────────────────────────────────────
//  LIVE RATE FETCH
//  Uses allorigins.win as CORS proxy to scrape LKS site
// ─────────────────────────────────────────
async function fetchLiveRates() {
  setRateFetchState('loading');
  try {
    const proxyUrl = 'https://api.allorigins.win/get?url=' +
      encodeURIComponent('https://www.tnagarlks.com/');

    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const data = await resp.json();
    const html = data.contents || '';

    const rates = parseRatesFromHTML(html);
    if (!rates.r22) throw new Error('Parse failed');

    STATE.liveRate = {
      ...rates,
      fetchedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    applyLiveRatesToUI();
    setRateFetchState('success');
    showToast('✦ Live rate updated from LKS T.Nagar');

    // Re-render active shop so "↻ Sync live" button + live ref text appear
    if (STATE.activeView === 'shop') renderActiveShop();
  } catch (err) {
    setRateFetchState('error');
    showToast('⚠ Could not fetch live rate. Enter manually.', true);
  }
}

function parseRatesFromHTML(html) {
  const rates = {};

  const patterns = [
    { key: 'r18', regex: /18k[\s\S]{0,300}?<td[^>]*>\s*([\d,\.]+)\s*<\/td>/i },
    { key: 'r22', regex: /22k[\s\S]{0,300}?<td[^>]*>\s*([\d,\.]+)\s*<\/td>/i },
    { key: 'r24', regex: /24k[\s\S]{0,300}?<td[^>]*>\s*([\d,\.]+)\s*<\/td>/i },
    { key: 'silver', regex: /Silver[\s\S]{0,200}?<td[^>]*>\s*([\d,\.]+)\s*<\/td>/i }
  ];

  // Also try simple number-after-karat approach
  const simple = {
    r18:    html.match(/18k[^\d]{0,30}([\d]{4,6})/i),
    r22:    html.match(/22k[^\d]{0,30}([\d]{4,6})/i),
    r24:    html.match(/24k[^\d]{0,30}([\d]{4,6})/i),
    silver: html.match(/Silver[^\d]{0,30}([\d]{2,4}(?:\.\d+)?)/i)
  };

  patterns.forEach(({ key, regex }) => {
    const m = html.match(regex);
    if (m) {
      rates[key] = parseFloat(m[1].replace(/,/g, ''));
    } else if (simple[key]) {
      rates[key] = parseFloat(simple[key][1]);
    }
  });

  return rates;
}

function applyLiveRatesToUI() {
  const r = STATE.liveRate;
  setEl('chip18', r.r18 ? '₹' + fmt(r.r18) : '—');
  setEl('chip22', r.r22 ? '₹' + fmt(r.r22) : '—');
  setEl('chip24', r.r24 ? '₹' + fmt(r.r24) : '—');
  setEl('chipSilver', r.silver ? '₹' + fmt(r.silver) : '—');
  setEl('rateTime', r.fetchedAt ? 'Fetched ' + r.fetchedAt : '');
}

function setRateFetchState(state) {
  const btn   = document.getElementById('updateRateBtn');
  const tag   = document.getElementById('sourceTag');
  const dot   = document.getElementById('sourceDot');
  const label = document.getElementById('sourceLabel');

  if (state === 'loading') {
    btn.classList.add('loading');
    btn.querySelector('.btn-txt').textContent = 'Fetching…';
    tag.className = 'source-tag loading';
    label.textContent = 'Fetching · tnagarlks.com';
  } else if (state === 'success') {
    btn.classList.remove('loading');
    btn.querySelector('.btn-txt').textContent = 'Updated ✓';
    tag.className = 'source-tag';
    dot.style.background = 'var(--green)';
    label.textContent = 'Live · tnagarlks.com';
    setTimeout(() => btn.querySelector('.btn-txt').textContent = 'Update Rate', 2500);
  } else {
    btn.classList.remove('loading');
    btn.querySelector('.btn-txt').textContent = 'Retry';
    tag.className = 'source-tag error';
    dot.style.background = 'var(--red)';
    label.textContent = 'Fetch failed';
  }
}

// ─────────────────────────────────────────
//  TAB BAR
// ─────────────────────────────────────────
function renderTabBar() {
  const bar = document.getElementById('tabBar');
  const summaryTab = document.getElementById('summaryTab');
  const addBtn = document.getElementById('addShopBtn');

  // Remove old shop tabs (keep summary + add)
  bar.querySelectorAll('.shop-tab').forEach(t => t.remove());

  STATE.shops.forEach(shop => {
    const tab = document.createElement('div');
    tab.className = 'tab shop-tab' + (shop.id === STATE.activeShopId && STATE.activeView === 'shop' ? ' active' : '');
    tab.dataset.shopId = shop.id;
    tab.innerHTML = `
      <span class="tab-icon">🏪</span>
      <span class="tab-name">${escHtml(shop.name)}</span>
      ${STATE.shops.length > 1 ? `<button class="tab-del" data-shop-id="${shop.id}" onclick="deleteShop(${shop.id}, event)">✕</button>` : ''}
    `;
    tab.addEventListener('click', () => switchToShop(shop.id));
    bar.insertBefore(tab, summaryTab);
  });

  summaryTab.className = 'tab summary-tab' + (STATE.activeView === 'summary' ? ' active' : '');
  addBtn.style.display = STATE.shops.length >= STATE.maxShops ? 'none' : 'flex';
}

function switchToShop(shopId) {
  STATE.activeShopId = shopId;
  STATE.activeView = 'shop';
  renderTabBar();
  renderActiveShop();
}

function switchToSummary() {
  STATE.activeView = 'summary';
  renderTabBar();
  renderSummary();
}

// ─────────────────────────────────────────
//  SHOP MANAGEMENT
// ─────────────────────────────────────────
function addShop() {
  if (STATE.shops.length >= STATE.maxShops) {
    showToast('Maximum 5 shops allowed', true); return;
  }
  const shop = createShop();
  STATE.shops.push(shop);
  switchToShop(shop.id);
}

function deleteShop(shopId, event) {
  event.stopPropagation();
  if (STATE.shops.length <= 1) return;
  STATE.shops = STATE.shops.filter(s => s.id !== shopId);
  if (STATE.activeShopId === shopId) {
    STATE.activeShopId = STATE.shops[0].id;
    STATE.activeView = 'shop';
  }
  renderTabBar();
  renderActiveShop();
}

// ─────────────────────────────────────────
//  RENDER ACTIVE SHOP
// ─────────────────────────────────────────
function renderActiveShop() {
  const container = document.getElementById('mainContent');

  if (STATE.activeView === 'summary') {
    renderSummary(); return;
  }

  const shop = STATE.shops.find(s => s.id === STATE.activeShopId);
  if (!shop) return;

  container.innerHTML = buildShopHTML(shop);
  bindShopEvents(shop);
  recalcShop(shop);
}

function buildShopHTML(shop) {
  const diff = STATE.liveRate.r22 && shop.rate
    ? shop.rate - STATE.liveRate.r22 : 0;
  const diffHtml = STATE.liveRate.r22
    ? `<span class="srb-diff ${diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'same'}">
        ${diff > 0 ? '▲ ₹' + fmt(diff) + ' above live' : diff < 0 ? '▼ ₹' + fmt(Math.abs(diff)) + ' below live' : '= Same as live'}
       </span>`
    : '';

  const ogHTML = shop.ogEntries.map(e => buildOGEntryHTML(shop.id, e)).join('');

  return `
  <!-- Shop Details Card -->
  <div class="card anim-up">
    <div class="card-header">
      <span>⚖</span>
      <h2>Gold Details</h2>
      <span class="card-badge">${escHtml(shop.name)}</span>
    </div>
    <div class="card-body">

      <!-- Shop name -->
      <div class="shop-name-row">
        <span class="sn-label">Shop</span>
        <input id="shopName_${shop.id}" type="text" value="${escHtml(shop.name)}"
          oninput="updateShopName(${shop.id}, this.value)"
          placeholder="Shop name" style="background:transparent;border:none;outline:none;font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--gold-l);flex:1"/>
      </div>

      <!-- Per-shop rate block -->
      <div class="shop-rate-block">
        <div class="srb-top">
          <div>
            <div class="srb-label">Gold Rate · This Shop (22K)</div>
            <div class="srb-input-row">
              <span class="srb-sym">₹</span>
              <input id="shopRate_${shop.id}" type="number" class="srb-input"
                value="${shop.rate || ''}" min="0" step="1"
                oninput="updateShopRate(${shop.id}, this.value)"
                placeholder="0"/>
              <span class="srb-per">/g</span>
            </div>
          </div>
        </div>
        <div class="srb-hint">
          <span class="srb-hint-txt" id="liveRefText_${shop.id}">
            ${STATE.liveRate.r22 ? 'Live ref: ₹' + fmt(STATE.liveRate.r22) : 'Live rate not loaded'}
          </span>
          ${diffHtml}
          ${STATE.liveRate.r22 ? `<button class="srb-sync" onclick="syncShopRate(${shop.id})">↻ Sync live</button>` : ''}
        </div>
      </div>

      <!-- Weight + Wastage -->
      <div class="row-2">
        <div class="field">
          <label>Gold Weight (g)</label>
          <input id="goldWt_${shop.id}" type="number" value="${shop.goldWeight}"
            step="0.001" min="0" placeholder="e.g. 10.500"
            oninput="updateShopField(${shop.id},'goldWeight',this.value)"/>
        </div>
        <div class="field">
          <label>Wastage %</label>
          <input id="wastage_${shop.id}" type="number" value="${shop.wastage}"
            step="0.01" min="0"
            oninput="updateShopField(${shop.id},'wastage',this.value)"/>
        </div>
      </div>

      <!-- Making + GST -->
      <div class="row-2">
        <div class="field">
          <label>Making Charges (₹)</label>
          <input id="making_${shop.id}" type="number" value="${shop.making}"
            step="1" min="0" placeholder="e.g. 800"
            oninput="updateShopField(${shop.id},'making',this.value)"/>
        </div>
        <div class="field">
          <label>GST %</label>
          <input id="gst_${shop.id}" type="number" value="${shop.gst}"
            step="0.01" min="0"
            oninput="updateShopField(${shop.id},'gst',this.value)"/>
        </div>
      </div>

      <!-- Result chips -->
      <div class="results-grid">
        <div class="result-chip">
          <div class="r-label">Wastage Weight</div>
          <div class="r-value" id="res_wasWt_${shop.id}">—</div>
        </div>
        <div class="result-chip">
          <div class="r-label">Total Gold Wt.</div>
          <div class="r-value" id="res_totalWt_${shop.id}">—</div>
        </div>
        <div class="result-chip span2 gold-hi">
          <div class="r-label" id="res_goldValLabel_${shop.id}">Gold Value</div>
          <div class="r-value" id="res_goldVal_${shop.id}">—</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Old Gold Card -->
  <div class="card anim-up" style="animation-delay:.06s">
    <div class="card-header">
      <span>🔄</span>
      <h2>Old Gold Exchange</h2>
      <span class="card-badge" id="ogBadge_${shop.id}">${shop.ogEntries.length} entries</span>
    </div>
    <div class="card-body">
      <div id="ogContainer_${shop.id}">${ogHTML}</div>
      <button class="add-og-btn" onclick="addOGEntry(${shop.id})">＋ Add Old Gold Entry</button>
      <div class="og-totals">
        <div><div class="tl">Total Net Wt.</div><div class="tv" id="ogTotalWt_${shop.id}">—</div></div>
        <div><div class="tl">Total Old Gold Value</div><div class="tv" id="ogTotalVal_${shop.id}">—</div></div>
      </div>
    </div>
  </div>

  <!-- Calculate -->
  <div class="calc-btn-wrap">
    <button class="calc-btn" onclick="recalcShop(STATE.shops.find(s=>s.id===${shop.id}))">
      ✦ &nbsp; Calculate Price &nbsp; ✦
    </button>
  </div>

  <!-- Price Breakup Card -->
  <div class="card anim-up" style="animation-delay:.12s">
    <div class="card-header">
      <span>📋</span>
      <h2>Price Breakup · ${escHtml(shop.name)}</h2>
      <button class="toggle-btn" id="toggleBreakup_${shop.id}" onclick="toggleBreakup(${shop.id})">Hide ▾</button>
    </div>
    <div class="card-body" id="breakupBody_${shop.id}">
      <table class="b-table">
        <thead><tr><th>Component</th><th>Rate</th><th>Weight</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td class="td-c">Gold (22K)</td><td class="td-r" id="b_rate_${shop.id}">—</td><td class="td-w" id="b_wt_${shop.id}">—</td><td class="td-v" id="b_goldVal_${shop.id}">—</td></tr>
          <tr><td class="td-c">Making Charges</td><td class="td-r">—</td><td class="td-w">—</td><td class="td-v" id="b_making_${shop.id}">—</td></tr>
          <tr class="row-sub"><td class="td-c" colspan="3">Subtotal</td><td class="td-v" id="b_sub_${shop.id}">—</td></tr>
          <tr><td class="td-c">GST (<span id="b_gstPct_${shop.id}">3</span>%)</td><td class="td-r" id="b_gstPctR_${shop.id}">3%</td><td class="td-w">—</td><td class="td-v" id="b_gst_${shop.id}">—</td></tr>
          <tr class="row-sub"><td class="td-c" colspan="3">Total (incl. GST)</td><td class="td-v" id="b_totalGst_${shop.id}">—</td></tr>
          <tr class="row-og"><td class="td-c" colspan="3">
            Old Gold Exchange
            <button class="expand-og-btn" id="ogExpandBtn_${shop.id}" onclick="toggleOGBreakdown(${shop.id})">Show ▾</button>
          </td></tr>
          <tr class="row-og"><td class="td-r">Exchange</td><td class="td-r">—</td><td class="td-w" id="b_ogWt_${shop.id}">—</td><td class="td-v" id="b_ogVal_${shop.id}" style="color:var(--green)">—</td></tr>
          <tr class="row-og" id="ogBdRow_${shop.id}" style="display:none">
            <td colspan="4" style="padding:0 0 6px">
              <div class="og-bd-wrap">
                <table><thead><tr><th>#</th><th>Wt.</th><th>Ded%</th><th>Net</th><th>Rate</th><th>Value</th></tr></thead>
                <tbody id="ogBdBody_${shop.id}"></tbody></table>
              </div>
            </td>
          </tr>
          <tr class="row-grand"><td class="td-c" colspan="3">Grand Total</td><td class="td-v" id="b_grand_${shop.id}">—</td></tr>
        </tbody>
      </table>
      <button class="snapshot-btn" onclick="openSnapshotModal(${shop.id})">📸 &nbsp;Generate Snapshot</button>
    </div>
  </div>

  <!-- Reset + Copy -->
  <div style="margin:10px 12px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <button class="action-btn reset" onclick="resetShop(${shop.id})">↺ Reset</button>
    <button class="action-btn copy" onclick="copyToAllShops(${shop.id})">⇉ Copy to All</button>
  </div>
  `;
}

function buildOGEntryHTML(shopId, entry) {
  return `
  <div class="og-entry" id="ogEntry_${shopId}_${entry.id}">
    <div class="og-num">Entry #${entry.id}</div>
    <button class="og-del" onclick="removeOGEntry(${shopId}, ${entry.id})">✕</button>
    <div class="row-3">
      <div class="field"><label>Weight (g)</label>
        <input type="number" id="ogWt_${shopId}_${entry.id}" value="${entry.wt}" step="0.001" min="0"
          oninput="updateOGEntry(${shopId},${entry.id},'wt',this.value)"/></div>
      <div class="field"><label>Deduct %</label>
        <input type="number" id="ogDed_${shopId}_${entry.id}" value="${entry.ded}" step="0.01" min="0"
          oninput="updateOGEntry(${shopId},${entry.id},'ded',this.value)"/></div>
      <div class="field"><label>Buy Rate ₹</label>
        <input type="number" id="ogRate_${shopId}_${entry.id}" value="${entry.rate}" step="1" min="0"
          oninput="updateOGEntry(${shopId},${entry.id},'rate',this.value)"/></div>
    </div>
    <div class="og-chips">
      <div class="og-chip"><div class="cl">Ded. Wt.</div><div class="cv" id="ogDedWt_${shopId}_${entry.id}">—</div></div>
      <div class="og-chip"><div class="cl">Net Wt.</div><div class="cv" id="ogNetWt_${shopId}_${entry.id}">—</div></div>
      <div class="og-chip span2 green"><div class="cl">Old Gold Value</div><div class="cv" id="ogVal_${shopId}_${entry.id}">—</div></div>
    </div>
  </div>`;
}

function bindShopEvents(shop) {
  // Recalculate whenever any input changes
  document.querySelectorAll(`[id$="_${shop.id}"]`).forEach(el => {
    if (el.tagName === 'INPUT') {
      el.addEventListener('change', () => recalcShop(shop));
    }
  });
}

// ─────────────────────────────────────────
//  FIELD UPDATERS
// ─────────────────────────────────────────
function updateShopName(shopId, val) {
  const shop = getShop(shopId);
  if (shop) {
    shop.name = val;
    // Update tab label
    const tab = document.querySelector(`.shop-tab[data-shop-id="${shopId}"] .tab-name`);
    if (tab) tab.textContent = val || 'Shop';
  }
}

function updateShopRate(shopId, val) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.rate = parseFloat(val) || 0;

  // Update diff indicator
  const diff = STATE.liveRate.r22 ? shop.rate - STATE.liveRate.r22 : 0;
  const diffEl = document.querySelector(`#shopRate_${shopId}`)?.closest('.shop-rate-block')?.querySelector('.srb-diff');
  if (diffEl && STATE.liveRate.r22) {
    diffEl.className = `srb-diff ${diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'same'}`;
    diffEl.textContent = diff > 0
      ? `▲ ₹${fmt(diff)} above live`
      : diff < 0
      ? `▼ ₹${fmt(Math.abs(diff))} below live`
      : '= Same as live';
  }

  recalcShop(shop);
}

function updateShopField(shopId, field, val) {
  const shop = getShop(shopId);
  if (shop) {
    shop[field] = parseFloat(val) || (val === '' ? '' : 0);
    recalcShop(shop);
  }
}

function syncShopRate(shopId) {
  if (!STATE.liveRate.r22) return;
  const shop = getShop(shopId);
  if (!shop) return;
  shop.rate = STATE.liveRate.r22;
  const input = document.getElementById(`shopRate_${shopId}`);
  if (input) input.value = STATE.liveRate.r22;
  updateShopRate(shopId, STATE.liveRate.r22);
  showToast('↻ Rate synced to live');
}

// ─────────────────────────────────────────
//  OLD GOLD
// ─────────────────────────────────────────
function addOGEntry(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.ogIdCounter++;
  const entry = { id: shop.ogIdCounter, wt: '', ded: 0, rate: shop.rate || 0 };
  shop.ogEntries.push(entry);

  const container = document.getElementById(`ogContainer_${shopId}`);
  const div = document.createElement('div');
  div.innerHTML = buildOGEntryHTML(shopId, entry);
  container.appendChild(div.firstElementChild);

  updateOGBadge(shop);
  recalcOG(shop);
}

function removeOGEntry(shopId, entryId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.ogEntries = shop.ogEntries.filter(e => e.id !== entryId);
  document.getElementById(`ogEntry_${shopId}_${entryId}`)?.remove();
  updateOGBadge(shop);
  recalcOG(shop);
  recalcShop(shop);
}

function updateOGEntry(shopId, entryId, field, val) {
  const shop = getShop(shopId);
  if (!shop) return;
  const entry = shop.ogEntries.find(e => e.id === entryId);
  if (entry) {
    entry[field] = parseFloat(val) || 0;
    recalcOGEntry(shopId, entry);
    recalcOG(shop);
    recalcShop(shop);
  }
}

function recalcOGEntry(shopId, entry) {
  const dedWt = entry.wt * entry.ded / 100;
  const netWt = entry.wt - dedWt;
  const val   = netWt * entry.rate;
  setEl(`ogDedWt_${shopId}_${entry.id}`, fmt3(dedWt) + ' g');
  setEl(`ogNetWt_${shopId}_${entry.id}`, fmt3(netWt) + ' g');
  setEl(`ogVal_${shopId}_${entry.id}`,   '₹ ' + fmtCur(val));
}

function recalcOG(shop) {
  let totalNetWt = 0, totalVal = 0;
  shop.ogEntries.forEach(e => {
    const netWt = e.wt - (e.wt * e.ded / 100);
    totalNetWt += netWt;
    totalVal   += netWt * e.rate;
  });
  setEl(`ogTotalWt_${shop.id}`,  totalNetWt > 0 ? fmt3(totalNetWt) + ' g' : '—');
  setEl(`ogTotalVal_${shop.id}`, totalVal   > 0 ? '₹ ' + fmtCur(totalVal) : '—');
  return { totalNetWt, totalVal };
}

function updateOGBadge(shop) {
  setEl(`ogBadge_${shop.id}`, shop.ogEntries.length + (shop.ogEntries.length === 1 ? ' entry' : ' entries'));
}

// ─────────────────────────────────────────
//  MAIN CALCULATION
// ─────────────────────────────────────────
function recalcShop(shop) {
  if (!shop) return;
  const rate    = shop.rate || 0;
  const goldWt  = parseFloat(shop.goldWeight) || 0;
  const wasPct  = parseFloat(shop.wastage)    || 0;
  const making  = parseFloat(shop.making)     || 0;
  const gstPct  = parseFloat(shop.gst)        || 3;

  const wasWt   = goldWt * wasPct / 100;
  const totalWt = goldWt + wasWt;
  const goldVal = totalWt * rate;
  const subtotal= goldVal + making;
  const gstAmt  = subtotal * gstPct / 100;
  const totalGst= subtotal + gstAmt;

  // Recalc all OG entries
  shop.ogEntries.forEach(e => recalcOGEntry(shop.id, e));
  const { totalNetWt, totalVal: ogTotalVal } = recalcOG(shop);

  const grand = totalGst - ogTotalVal;

  // Store result on shop for summary
  shop._result = { rate, totalWt, goldVal, making, gstAmt, subtotal, totalGst, ogTotalVal, grand, gstPct };

  // Result chips
  setEl(`res_wasWt_${shop.id}`,   fmt3(wasWt) + ' g');
  setEl(`res_totalWt_${shop.id}`, fmt3(totalWt) + ' g');
  setEl(`res_goldValLabel_${shop.id}`, `Gold Value (at ₹${fmtCur(rate)})`);
  setEl(`res_goldVal_${shop.id}`, '₹ ' + fmtCur(goldVal));

  // Breakup table
  setEl(`b_rate_${shop.id}`,     '₹' + fmtCur(rate));
  setEl(`b_wt_${shop.id}`,       fmt3(totalWt) + 'g');
  setEl(`b_goldVal_${shop.id}`,  '₹' + fmtCur(goldVal));
  setEl(`b_making_${shop.id}`,   '₹' + fmtCur(making));
  setEl(`b_sub_${shop.id}`,      '₹' + fmtCur(subtotal));
  setEl(`b_gstPct_${shop.id}`,   gstPct + '');
  setEl(`b_gstPctR_${shop.id}`,  gstPct + '%');
  setEl(`b_gst_${shop.id}`,      '₹' + fmtCur(gstAmt));
  setEl(`b_totalGst_${shop.id}`, '₹' + fmtCur(totalGst));
  setEl(`b_ogWt_${shop.id}`,     totalNetWt > 0 ? fmt3(totalNetWt) + 'g' : '—');
  setEl(`b_ogVal_${shop.id}`,    ogTotalVal > 0 ? '- ₹' + fmtCur(ogTotalVal) : '—');
  setEl(`b_grand_${shop.id}`,    '₹' + fmtCur(Math.max(0, grand)));

  // OG breakdown table
  buildOGBreakdownTable(shop);
}

function buildOGBreakdownTable(shop) {
  const tbody = document.getElementById(`ogBdBody_${shop.id}`);
  if (!tbody) return;
  tbody.innerHTML = '';
  let tnw = 0, tv = 0, idx = 1;
  shop.ogEntries.forEach(e => {
    const nw = e.wt - (e.wt * e.ded / 100);
    const v  = nw * e.rate;
    tnw += nw; tv += v;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx++}</td><td>${fmt3(e.wt)}g</td><td>${e.ded}%</td><td>${fmt3(nw)}g</td><td>₹${fmtCur(e.rate)}</td><td style="color:var(--green)">₹${fmtCur(v)}</td>`;
    tbody.appendChild(tr);
  });
  if (shop.ogEntries.length > 0) {
    const tr = document.createElement('tr');
    tr.className = 'bd-total';
    tr.innerHTML = `<td colspan="3"><strong>Total</strong></td><td>${fmt3(tnw)}g</td><td>—</td><td>₹${fmtCur(tv)}</td>`;
    tbody.appendChild(tr);
  }
}

// ─────────────────────────────────────────
//  COPY TO ALL SHOPS
// ─────────────────────────────────────────
function copyToAllShops(sourceShopId) {
  const src = getShop(sourceShopId);
  if (!src) return;

  STATE.shops.forEach(shop => {
    if (shop.id === sourceShopId) return;
    shop.goldWeight = src.goldWeight;
    shop.wastage    = src.wastage;
    shop.making     = src.making;
    shop.gst        = src.gst;
    // Deep copy OG entries (new ids)
    shop.ogEntries = src.ogEntries.map(e => ({
      ...e,
      id: ++shop.ogIdCounter,
      rate: shop.rate // Use destination shop's rate for OG buy rate
    }));
  });

  showToast(`⇉ Details copied to ${STATE.shops.length - 1} other shop(s)`);
}

// ─────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────
function renderSummary() {
  // Ensure all shops have latest calculations
  STATE.shops.forEach(s => recalcShop(s));

  const container = document.getElementById('mainContent');
  const results = STATE.shops.map(s => ({
    shop: s,
    grand: s._result?.grand ?? Infinity
  })).sort((a, b) => a.grand - b.grand);

  const best = results[0];
  const worst = results[results.length - 1];
  const maxSaving = worst.grand - best.grand;

  const colors = ['#5BBF8E','#E8C97A','#C9A84C','#5B9BBF','#BF8E5B'];

  const rowsHTML = results.map((r, i) => {
    const isBest = i === 0;
    const diff = r.grand - best.grand;
    return `<tr class="${isBest ? 'best-row' : ''}">
      <td>
        <span class="shop-dot" style="background:${colors[i % colors.length]}"></span>
        ${escHtml(r.shop.name)}
        ${isBest ? '<span class="best-badge">✦ Best</span>' : ''}
      </td>
      <td><span class="rate-cell-sm">₹${fmtCur(r.shop.rate)}</span></td>
      <td><span class="price-cell ${isBest ? 'best' : ''}">₹${fmtCur(r.grand)}</span></td>
      <td><span class="diff-cell ${isBest ? 'best' : ''}">
        ${isBest ? '—' : '+₹' + fmtCur(diff)}
      </span></td>
    </tr>`;
  }).join('');

  // Bar chart
  const minVal = best.grand || 1;
  const barsHTML = results.map((r, i) => {
    const pct = Math.round((r.grand / (worst.grand || 1)) * 92) + 8;
    return `<div class="bar-row">
      <div class="bar-name">${escHtml(r.shop.name)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${i === 0 ? 'linear-gradient(90deg,#5BBF8E,#3DA870)' : 'linear-gradient(90deg,#C9A84C,#8C6A20)'}">
          <span>₹${fmtCur(r.grand)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  const goldWt = STATE.shops[0]?.goldWeight || '—';
  const wastage = STATE.shops[0]?.wastage || '—';

  container.innerHTML = `
  <div class="summary-wrap anim-up">
    <div class="summary-header">
      <h2>Shop Comparison</h2>
      <p>Each shop at its own gold rate</p>
    </div>

    <div class="summary-meta">
      <div class="sum-chip"><div class="sc-l">Gold Weight</div><div class="sc-v">${goldWt ? fmt3(parseFloat(goldWt)) + ' g' : '—'}</div></div>
      <div class="sum-chip"><div class="sc-l">Wastage</div><div class="sc-v">${wastage}%</div></div>
      <div class="sum-chip"><div class="sc-l">Shops</div><div class="sc-v">${STATE.shops.length}</div></div>
    </div>

    <div class="best-card">
      <div class="bc-icon">🏆</div>
      <div>
        <div class="bc-label">Best Price</div>
        <div class="bc-name">${escHtml(best.shop.name)}</div>
        <div class="bc-rate">Rate: ₹${fmtCur(best.shop.rate)}/g · Making: ₹${fmtCur(best.shop.making)}</div>
      </div>
      ${maxSaving > 0 ? `<div class="bc-save"><div class="bc-save-label">You save</div><div class="bc-save-val">₹${fmtCur(maxSaving)}</div></div>` : ''}
    </div>

    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr><th>Shop</th><th>Rate/g</th><th>Final</th><th>Diff</th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>

    <div class="bar-section">
      <div class="bar-title">Price Comparison</div>
      ${barsHTML}
    </div>

    <button class="sum-snapshot-btn" onclick="openSummarySnapshot()">
      📸 &nbsp;Generate Comparison Snapshot
    </button>
  </div>`;
}

// ─────────────────────────────────────────
//  SNAPSHOT / html2canvas
// ─────────────────────────────────────────
function openSnapshotModal(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  const r = shop._result || {};

  const ogRows = shop.ogEntries.map((e, i) => {
    const nw = e.wt - (e.wt * e.ded / 100);
    return `<div class="snap-row"><span class="sl">OG Entry ${i+1} (${fmt3(e.wt)}g, ded ${e.ded}%)</span><span class="sv" style="color:var(--green)">₹${fmtCur(nw * e.rate)}</span></div>`;
  }).join('');

  const now = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  document.getElementById('snapContent').innerHTML = `
    <div class="snap-shop-name">${escHtml(shop.name)}</div>
    <div class="snap-date">${now}</div>
    <div class="snap-divider"></div>
    <div class="snap-row"><span class="sl">Gold Rate (22K)</span><span class="sv">₹${fmtCur(r.rate)}/g</span></div>
    <div class="snap-row"><span class="sl">Gold Weight</span><span class="sv">${fmt3(parseFloat(shop.goldWeight)||0)} g</span></div>
    <div class="snap-row"><span class="sl">Wastage (${shop.wastage}%)</span><span class="sv">${fmt3((parseFloat(shop.goldWeight)||0)*shop.wastage/100)} g → ${fmt3(r.totalWt||0)} g</span></div>
    <div class="snap-row"><span class="sl">Gold Value</span><span class="sv">₹${fmtCur(r.goldVal)}</span></div>
    <div class="snap-row"><span class="sl">Making Charges</span><span class="sv">₹${fmtCur(r.making)}</span></div>
    <div class="snap-row"><span class="sl">GST (${r.gstPct}%)</span><span class="sv">₹${fmtCur(r.gstAmt)}</span></div>
    <div class="snap-divider"></div>
    ${ogRows}
    ${shop.ogEntries.length > 0 ? `<div class="snap-row og"><span class="sl">Total Old Gold Exchange</span><span class="sv">- ₹${fmtCur(r.ogTotalVal)}</span></div>` : ''}
    <div class="snap-grand"><div><div class="gl">Final Payable Amount</div></div><div class="gv">₹${fmtCur(Math.max(0,r.grand))}</div></div>
    <div class="snap-wm">Gold Jewellery Calculator · LKS Live Rates · ${STATE.liveRate.fetchedAt || ''}</div>
  `;

  document.getElementById('snapshotModal').style.display = 'flex';
  document.getElementById('snapShopId').value = shopId;
}

function openSummarySnapshot() {
  STATE.shops.forEach(s => recalcShop(s));
  const results = STATE.shops.map(s => ({ shop: s, grand: s._result?.grand ?? 0 })).sort((a,b) => a.grand - b.grand);
  const best = results[0];
  const maxSaving = (results[results.length-1]?.grand || 0) - best.grand;
  const now = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const rowsHTML = results.map((r, i) => {
    const isBest = i === 0;
    const diff = r.grand - best.grand;
    return `<div class="snap-row ${isBest?'og':''}">
      <span class="sl">${isBest?'🏆 ':''}${escHtml(r.shop.name)} (₹${fmtCur(r.shop.rate)}/g)</span>
      <span class="sv" style="${isBest?'color:var(--green)':''}">
        ₹${fmtCur(r.grand)}${diff > 0 ? ' <small style="color:var(--dim)">+₹'+fmtCur(diff)+'</small>' : ''}
      </span>
    </div>`;
  }).join('');

  const goldWt = STATE.shops[0]?.goldWeight || 0;
  const wastage = STATE.shops[0]?.wastage || 0;

  document.getElementById('snapContent').innerHTML = `
    <div class="snap-shop-name">Shop Price Comparison</div>
    <div class="snap-date">${now}</div>
    <div class="snap-divider"></div>
    <div class="snap-row"><span class="sl">Gold Weight</span><span class="sv">${fmt3(parseFloat(goldWt)||0)} g · Wastage ${wastage}%</span></div>
    <div class="snap-divider"></div>
    ${rowsHTML}
    <div class="snap-grand"><div><div class="gl">Max Saving</div></div><div class="gv" style="color:var(--green)">₹${fmtCur(maxSaving)}</div></div>
    <div class="snap-wm">Gold Jewellery Calculator · LKS Live Rates · ${STATE.liveRate.fetchedAt || ''}</div>
  `;

  document.getElementById('snapshotModal').style.display = 'flex';
  document.getElementById('snapShopId').value = 'summary';
}

async function downloadSnapshot() {
  const card = document.getElementById('snapCard');
  try {
    const canvas = await html2canvas(card, {
      backgroundColor: '#141209',
      scale: 2,
      useCORS: true,
      logging: false
    });
    const link = document.createElement('a');
    link.download = `gold-calc-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('✦ Image downloaded');
  } catch (e) {
    showToast('Could not generate image', true);
  }
}

async function shareWhatsApp() {
  const card = document.getElementById('snapCard');
  try {
    const canvas = await html2canvas(card, { backgroundColor: '#141209', scale: 2, useCORS: true });
    canvas.toBlob(async blob => {
      if (navigator.share && navigator.canShare({ files: [new File([blob], 'gold-calc.png', { type: 'image/png' })] })) {
        await navigator.share({
          title: 'Gold Jewellery Calculation',
          files: [new File([blob], 'gold-calc.png', { type: 'image/png' })]
        });
      } else {
        // Fallback: download + open WhatsApp
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'gold-calc.png'; a.click();
        setTimeout(() => window.open('https://wa.me/', '_blank'), 500);
        showToast('Image saved — attach it in WhatsApp');
      }
    }, 'image/png');
  } catch (e) {
    showToast('Could not share image', true);
  }
}

// ─────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────
function resetShop(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.goldWeight = '';
  shop.wastage    = 12;
  shop.making     = '';
  shop.gst        = 3;
  shop.ogEntries  = [];
  shop.ogIdCounter= 0;
  shop._result    = null;
  renderActiveShop();
  showToast('↺ Shop reset');
}

// ─────────────────────────────────────────
//  TOGGLES
// ─────────────────────────────────────────
const _breakupVisible = {};
function toggleBreakup(shopId) {
  _breakupVisible[shopId] = !(_breakupVisible[shopId] !== false ? _breakupVisible[shopId] : true);
  const visible = _breakupVisible[shopId] !== false;
  const body = document.getElementById(`breakupBody_${shopId}`);
  const btn  = document.getElementById(`toggleBreakup_${shopId}`);
  if (body) body.style.display = visible ? '' : 'none';
  if (btn)  btn.textContent    = visible ? 'Hide ▾' : 'Show ▸';
}

const _ogBdVisible = {};
function toggleOGBreakdown(shopId) {
  _ogBdVisible[shopId] = !_ogBdVisible[shopId];
  const row = document.getElementById(`ogBdRow_${shopId}`);
  const btn = document.getElementById(`ogExpandBtn_${shopId}`);
  if (row) row.style.display = _ogBdVisible[shopId] ? '' : 'none';
  if (btn) btn.textContent   = _ogBdVisible[shopId] ? 'Hide ▴' : 'Show ▾';
}

// ─────────────────────────────────────────
//  INSTALL BANNER
// ─────────────────────────────────────────
function installApp() {
  if (window._installPrompt) {
    window._installPrompt.prompt();
    window._installPrompt.userChoice.then(() => {
      document.getElementById('installBanner').style.display = 'none';
    });
  }
}

// ─────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────
function getShop(id) { return STATE.shops.find(s => s.id === id); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function fmt(n)    { return Math.round(n).toLocaleString('en-IN'); }
function fmt3(n)   { return (Math.round(n * 1000) / 1000).toFixed(3); }
function fmtCur(n) { return Math.round(n).toLocaleString('en-IN'); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let _toastTimer;
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast' + (isError ? ' error' : '');
  t.style.display = 'block';
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = 'toastIn .3s ease, toastOut .3s ease 2.5s both';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.style.display = 'none', 2900);
}
