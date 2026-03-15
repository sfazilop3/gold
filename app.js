// ═══════════════════════════════════════════════════════════
//  Gold Jewellery Calculator — PWA Application Logic
// ═══════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const STATE = {
  liveRate: { r18: null, r22: null, r24: null, silver: null, fetchedAt: null },
  shops: [],
  activeShopId: null,
  activeView: 'shop',
  maxShops: 5,
  shopIdCounter: 0
};

// ─────────────────────────────────────────
//  PERSISTENCE — localStorage
// ─────────────────────────────────────────
const STORAGE_KEY = 'gc-state-v1';

function saveState() {
  try {
    // Strip runtime-only fields before saving
    const shops = STATE.shops.map(s => ({
      id:           s.id,
      name:         s.name,
      rate:         s.rate,
      gst:          s.gst,
      jewIdCounter: s.jewIdCounter,
      jewItems:     s.jewItems.map(({ _calc, ...item }) => item),
      ogIdCounter:  s.ogIdCounter,
      ogEntries:    s.ogEntries
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      shops,
      activeShopId:  STATE.activeShopId,
      shopIdCounter: STATE.shopIdCounter
    }));
  } catch (e) { /* storage full or unavailable — fail silently */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.shops?.length) return false;

    STATE.shops         = saved.shops;
    STATE.activeShopId  = saved.activeShopId;
    STATE.shopIdCounter = saved.shopIdCounter || saved.shops.length;
    return true;
  } catch (e) { return false; }
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}


function createShop(name = '') {
  STATE.shopIdCounter++;
  const id = STATE.shopIdCounter;
  return {
    id,
    name: name || `Shop ${id}`,
    rate: STATE.liveRate.r22 || 0,
    gst: 3,
    jewItems: [],
    jewIdCounter: 0,
    ogEntries: [],
    ogIdCounter: 0
  };
}

function createJewItem() {
  return {
    id: 0,
    name: '',
    wt: '',
    makingPct: 12,
    other: '',
    applyGst: true
  };
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Try to restore saved state — fall back to fresh shop if nothing saved
  const restored = loadState();
  if (!restored) {
    const shop1 = createShop('Shop 1');
    shop1.jewIdCounter = 1;
    shop1.jewItems.push({ ...createJewItem(), id: 1, name: 'Item 1' });
    STATE.shops.push(shop1);
    STATE.activeShopId = shop1.id;
  }

  renderTabBar();
  renderActiveShop();
  fetchLiveRates();

  // Load saved theme
  if (localStorage.getItem('gc-theme') === 'light') {
    document.body.classList.add('theme-light');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = '🌙';
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._installPrompt = e;
    document.getElementById('installBanner').style.display = 'flex';
  });
});

// ─────────────────────────────────────────
//  LIVE RATE FETCH
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
  const simple = {
    r18:    html.match(/18k[^\d]{0,30}([\d]{4,6})/i),
    r22:    html.match(/22k[^\d]{0,30}([\d]{4,6})/i),
    r24:    html.match(/24k[^\d]{0,30}([\d]{4,6})/i),
    silver: html.match(/Silver[^\d]{0,30}([\d]{2,4}(?:\.\d+)?)/i)
  };
  patterns.forEach(({ key, regex }) => {
    const m = html.match(regex);
    if (m) rates[key] = parseFloat(m[1].replace(/,/g, ''));
    else if (simple[key]) rates[key] = parseFloat(simple[key][1]);
  });
  return rates;
}

function applyLiveRatesToUI() {
  const r = STATE.liveRate;
  setEl('chip18',    r.r18    ? '₹' + fmt(r.r18)    : '—');
  setEl('chip22',    r.r22    ? '₹' + fmt(r.r22)    : '—');
  setEl('chip22b',   r.r22    ? '₹' + fmt(r.r22)    : '—');
  setEl('chip24',    r.r24    ? '₹' + fmt(r.r24)    : '—');
  setEl('chipSilver',r.silver ? '₹' + fmt(r.silver) : '—');
  setEl('rateTime',  r.fetchedAt ? 'Fetched ' + r.fetchedAt : '');
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
  if (STATE.liveRate.r22) shop.rate = STATE.liveRate.r22;
  shop.jewIdCounter = 1;
  shop.jewItems.push({ ...createJewItem(), id: 1, name: 'Item 1' });
  STATE.shops.push(shop);
  switchToShop(shop.id);
  saveState();
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
  saveState();
}

// ─────────────────────────────────────────
//  RENDER ACTIVE SHOP
// ─────────────────────────────────────────
function renderActiveShop() {
  const container = document.getElementById('mainContent');
  if (STATE.activeView === 'summary') { renderSummary(); return; }
  const shop = STATE.shops.find(s => s.id === STATE.activeShopId);
  if (!shop) return;
  container.innerHTML = buildShopHTML(shop);
  bindShopEvents(shop);
  recalcShop(shop);
}

// ─────────────────────────────────────────
//  BUILD SHOP HTML
// ─────────────────────────────────────────
function buildShopHTML(shop) {
  const diff = STATE.liveRate.r22 && shop.rate
    ? shop.rate - STATE.liveRate.r22 : 0;
  const diffHtml = STATE.liveRate.r22
    ? `<span class="srb-diff ${diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'same'}">
        ${diff > 0 ? '▲ ₹' + fmt(diff) + ' above live' : diff < 0 ? '▼ ₹' + fmt(Math.abs(diff)) + ' below live' : '= Same as live'}
       </span>` : '';

  const jewHTML = shop.jewItems.map(item => buildJewItemHTML(shop.id, item, shop.gst)).join('');
  const ogHTML  = shop.ogEntries.map(e => buildOGEntryHTML(shop.id, e)).join('');

  return `
  <div class="card anim-up">
    <div class="card-header">
      <span>🏪</span><h2>Shop Details</h2>
      <span class="card-badge">${escHtml(shop.name)}</span>
    </div>
    <div class="card-body">
      <div class="shop-name-row">
        <span class="sn-label">Shop</span>
        <input id="shopName_${shop.id}" type="text" value="${escHtml(shop.name)}"
          oninput="updateShopName(${shop.id}, this.value)" placeholder="Shop name"
          style="background:transparent;border:none;outline:none;font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--gold-l);flex:1"/>
      </div>
      <div class="shop-rate-block">
        <div class="srb-label">Gold Rate · This Shop (22K)</div>
        <div class="srb-input-row">
          <span class="srb-sym">₹</span>
          <input id="shopRate_${shop.id}" type="number" class="srb-input"
            value="${shop.rate || ''}" min="0" step="1"
            oninput="updateShopRate(${shop.id}, this.value)" placeholder="0"/>
          <span class="srb-per">/g</span>
        </div>
        <div class="srb-hint">
          <span class="srb-hint-txt" id="liveRefText_${shop.id}">
            ${STATE.liveRate.r22 ? 'Live ref: ₹' + fmt(STATE.liveRate.r22) : 'Live rate not loaded'}
          </span>
          ${diffHtml}
          ${STATE.liveRate.r22 ? `<button class="srb-sync" onclick="syncShopRate(${shop.id})">↻ Sync live</button>` : ''}
        </div>
      </div>
      <div class="row-2">
        <div class="field">
          <label>GST % (Shared)</label>
          <input id="shopGst_${shop.id}" type="number" value="${shop.gst}" step="0.01" min="0"
            oninput="updateShopGst(${shop.id}, this.value)"/>
        </div>
        <div style="display:flex;align-items:flex-end;padding-bottom:10px">
          <span style="font-size:11px;color:var(--muted);line-height:1.5">Each item has<br>its own GST toggle</span>
        </div>
      </div>
    </div>
  </div>

  <div class="card anim-up" style="animation-delay:.05s">
    <div class="card-header">
      <span>💎</span><h2>Jewellery Items</h2>
      <span class="card-badge" id="jewBadge_${shop.id}">${shop.jewItems.length} item${shop.jewItems.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="card-body">
      <div id="jewContainer_${shop.id}">${jewHTML}</div>
      <button class="add-og-btn" onclick="addJewItem(${shop.id})">＋ Add Jewellery Item</button>
      <div class="jew-totals" id="jewTotals_${shop.id}">
        <div><div class="tl">Total Gold Wt.</div><div class="tv" id="jewTotalWt_${shop.id}" style="color:var(--gold-l)">—</div></div>
        <div><div class="tl">Total Gold Value</div><div class="tv" id="jewTotalVal_${shop.id}" style="color:var(--gold-l)">—</div></div>
      </div>
    </div>
  </div>

  <div class="card anim-up" style="animation-delay:.08s">
    <div class="card-header">
      <span>🔄</span><h2>Old Gold Exchange</h2>
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

  <div class="card anim-up" style="animation-delay:.12s">
    <div class="card-header">
      <span>📋</span><h2>Price Summary · ${escHtml(shop.name)}</h2>
    </div>
    <div class="card-body" id="breakupBody_${shop.id}">
      <div id="itemBreakupList_${shop.id}"></div>
      <table class="b-table" style="margin-top:8px">
        <tbody>
          <tr class="row-sub"><td class="td-c" colspan="3">Combined Subtotal</td><td class="td-v" id="b_sub_${shop.id}">—</td></tr>
          <tr class="row-sub"><td class="td-c" colspan="3">Total GST</td><td class="td-v" id="b_gst_${shop.id}">—</td></tr>
          <tr class="row-og"><td class="td-c" colspan="3">
            Old Gold Exchange
            <button class="expand-og-btn" id="ogExpandBtn_${shop.id}" onclick="toggleOGBreakdown(${shop.id})">Show ▾</button>
          </td></tr>
          <tr class="row-og"><td class="td-r">Exchange</td><td class="td-r">—</td>
            <td class="td-w" id="b_ogWt_${shop.id}">—</td>
            <td class="td-v" id="b_ogVal_${shop.id}" style="color:var(--green)">—</td></tr>
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

  <div style="margin:10px 12px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <button class="action-btn reset" onclick="resetShop(${shop.id})">↺ Reset</button>
    <button class="action-btn copy" onclick="copyToAllShops(${shop.id})">⇉ Copy to All</button>
  </div>`;
}

// ─────────────────────────────────────────
//  JEWELLERY ITEM HTML
// ─────────────────────────────────────────
function buildJewItemHTML(shopId, item, gstPct) {
  return `
  <div class="og-entry" id="jewItem_${shopId}_${item.id}">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
      <input type="text" id="jewName_${shopId}_${item.id}"
        value="${escHtml(item.name)}" placeholder="Item name (e.g. Necklace)"
        oninput="updateJewField(${shopId},${item.id},'name',this.value)"
        style="background:transparent;border:none;border-bottom:1px solid var(--border);outline:none;
               font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:600;
               color:var(--gold-l);flex:1;padding-bottom:3px;min-width:0"/>
      <button class="og-del" onclick="removeJewItem(${shopId},${item.id})">✕</button>
    </div>
    <div class="row-3">
      <div class="field">
        <label>Weight (g)</label>
        <input type="number" id="jewWt_${shopId}_${item.id}" value="${item.wt}"
          step="0.001" min="0" placeholder="0.000"
          oninput="updateJewField(${shopId},${item.id},'wt',this.value)"/>
      </div>
      <div class="field">
        <label>Making %</label>
        <input type="number" id="jewMaking_${shopId}_${item.id}" value="${item.makingPct}"
          step="0.01" min="0"
          oninput="updateJewField(${shopId},${item.id},'makingPct',this.value)"/>
      </div>
      <div class="field">
        <label>Other Charges ₹</label>
        <input type="number" id="jewOther_${shopId}_${item.id}" value="${item.other}"
          step="1" min="0" placeholder="0"
          oninput="updateJewField(${shopId},${item.id},'other',this.value)"/>
      </div>
    </div>
    <label class="gst-toggle-row" onclick="toggleJewGst(${shopId},${item.id})">
      <span class="gst-check ${item.applyGst ? 'on' : ''}" id="jewGstCheck_${shopId}_${item.id}">${item.applyGst ? '☑' : '☐'}</span>
      <span class="gst-toggle-label">Apply GST (${gstPct}%)</span>
      <span class="gst-toggle-tag ${item.applyGst ? '' : 'no-bill'}" id="jewGstTag_${shopId}_${item.id}">${item.applyGst ? 'With Bill' : 'Without Bill'}</span>
    </label>
    <div class="og-chips" style="margin-top:8px">
      <div class="og-chip"><div class="cl">Making Wt.</div><div class="cv" id="jewMakingWt_${shopId}_${item.id}">—</div></div>
      <div class="og-chip"><div class="cl">Total Wt.</div><div class="cv" id="jewTotalWt_${shopId}_${item.id}">—</div></div>
      <div class="og-chip"><div class="cl">Gold Value</div><div class="cv" id="jewGoldVal_${shopId}_${item.id}">—</div></div>
      <div class="og-chip"><div class="cl">GST Amt.</div><div class="cv" id="jewGstAmt_${shopId}_${item.id}">—</div></div>
      <div class="og-chip span2 green"><div class="cl">Item Total</div><div class="cv" id="jewItemTotal_${shopId}_${item.id}">—</div></div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────
//  JEWELLERY ITEM MANAGEMENT
// ─────────────────────────────────────────
function addJewItem(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.jewIdCounter++;
  const item = { ...createJewItem(), id: shop.jewIdCounter, name: `Item ${shop.jewIdCounter}` };
  shop.jewItems.push(item);
  const container = document.getElementById(`jewContainer_${shopId}`);
  const div = document.createElement('div');
  div.innerHTML = buildJewItemHTML(shopId, item, shop.gst);
  container.appendChild(div.firstElementChild);
  updateJewBadge(shop);
  recalcShop(shop);
}

function removeJewItem(shopId, itemId) {
  const shop = getShop(shopId);
  if (!shop) return;
  if (shop.jewItems.length <= 1) { showToast('At least one item required', true); return; }
  shop.jewItems = shop.jewItems.filter(i => i.id !== itemId);
  document.getElementById(`jewItem_${shopId}_${itemId}`)?.remove();
  updateJewBadge(shop);
  recalcShop(shop);
}

function updateJewField(shopId, itemId, field, val) {
  const shop = getShop(shopId);
  if (!shop) return;
  const item = shop.jewItems.find(i => i.id === itemId);
  if (!item) return;
  if (field === 'name') { item.name = val; return; }
  item[field] = parseFloat(val) || (val === '' ? '' : 0);
  recalcJewItem(shop.id, item, shop.rate, shop.gst);
  recalcShopTotals(shop);
}

function toggleJewGst(shopId, itemId) {
  const shop = getShop(shopId);
  if (!shop) return;
  const item = shop.jewItems.find(i => i.id === itemId);
  if (!item) return;
  item.applyGst = !item.applyGst;
  const chk = document.getElementById(`jewGstCheck_${shopId}_${itemId}`);
  const tag = document.getElementById(`jewGstTag_${shopId}_${itemId}`);
  if (chk) { chk.textContent = item.applyGst ? '☑' : '☐'; chk.className = `gst-check ${item.applyGst ? 'on' : ''}`; }
  if (tag) { tag.textContent = item.applyGst ? 'With Bill' : 'Without Bill'; tag.className = `gst-toggle-tag ${item.applyGst ? '' : 'no-bill'}`; }
  recalcJewItem(shopId, item, shop.rate, shop.gst);
  recalcShopTotals(shop);
}

function updateJewBadge(shop) {
  setEl(`jewBadge_${shop.id}`, `${shop.jewItems.length} item${shop.jewItems.length !== 1 ? 's' : ''}`);
}

function updateShopGst(shopId, val) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.gst = parseFloat(val) || 0;
  shop.jewItems.forEach(item => {
    const lbl = document.querySelector(`#jewItem_${shopId}_${item.id} .gst-toggle-label`);
    if (lbl) lbl.textContent = `Apply GST (${shop.gst}%)`;
    recalcJewItem(shopId, item, shop.rate, shop.gst);
  });
  recalcShopTotals(shop);
}

// ─────────────────────────────────────────
//  PER-ITEM CALCULATION
// ─────────────────────────────────────────
function recalcJewItem(shopId, item, rate, gstPct) {
  const wt        = parseFloat(item.wt)        || 0;
  const makingPct = parseFloat(item.makingPct) || 0;
  const other     = parseFloat(item.other)     || 0;

  const makingWt  = wt * makingPct / 100;
  const totalWt   = wt + makingWt;
  const goldVal   = totalWt * rate;
  const subtotal  = goldVal + other;
  const gstAmt    = item.applyGst ? subtotal * gstPct / 100 : 0;
  const itemTotal = subtotal + gstAmt;

  item._calc = { wt, makingWt, totalWt, goldVal, other, subtotal, gstAmt, itemTotal };

  setEl(`jewMakingWt_${shopId}_${item.id}`,  fmt3(makingWt) + ' g');
  setEl(`jewTotalWt_${shopId}_${item.id}`,   fmt3(totalWt) + ' g');
  setEl(`jewGoldVal_${shopId}_${item.id}`,   '₹ ' + fmtCur(goldVal));
  setEl(`jewGstAmt_${shopId}_${item.id}`,    item.applyGst ? '₹ ' + fmtCur(gstAmt) : 'No GST');
  setEl(`jewItemTotal_${shopId}_${item.id}`, '₹ ' + fmtCur(itemTotal));
}

// ─────────────────────────────────────────
//  SHOP ROLLUP
// ─────────────────────────────────────────
function recalcShopTotals(shop) {
  const rate = shop.rate || 0;
  shop.jewItems.forEach(item => recalcJewItem(shop.id, item, rate, shop.gst));

  let combinedGoldVal = 0, combinedTotalWt = 0, combinedSubtotal = 0, combinedGst = 0;
  shop.jewItems.forEach(item => {
    const c = item._calc || {};
    combinedGoldVal  += c.goldVal  || 0;
    combinedTotalWt  += c.totalWt  || 0;
    combinedSubtotal += c.subtotal || 0;
    combinedGst      += c.gstAmt   || 0;
  });
  const combinedTotal = combinedSubtotal + combinedGst;

  shop.ogEntries.forEach(e => recalcOGEntry(shop.id, e));
  const { totalNetWt, totalVal: ogTotalVal } = recalcOG(shop);
  const grand = combinedTotal - ogTotalVal;

  shop._result = { rate, combinedGoldVal, combinedTotalWt, combinedSubtotal, combinedGst, combinedTotal, ogTotalVal, grand, gstPct: shop.gst };

  setEl(`jewTotalWt_${shop.id}`,  combinedTotalWt > 0 ? fmt3(combinedTotalWt) + ' g' : '—');
  setEl(`jewTotalVal_${shop.id}`, combinedGoldVal  > 0 ? '₹ ' + fmtCur(combinedGoldVal) : '—');
  setEl(`b_sub_${shop.id}`,   '₹' + fmtCur(combinedSubtotal));
  setEl(`b_gst_${shop.id}`,   combinedGst > 0 ? '₹' + fmtCur(combinedGst) : '—');
  setEl(`b_ogWt_${shop.id}`,  totalNetWt > 0 ? fmt3(totalNetWt) + 'g' : '—');
  setEl(`b_ogVal_${shop.id}`, ogTotalVal > 0 ? '- ₹' + fmtCur(ogTotalVal) : '—');
  setEl(`b_grand_${shop.id}`, '₹' + fmtCur(Math.max(0, grand)));

  buildItemBreakupList(shop);
  buildOGBreakdownTable(shop);
}

function recalcShop(shop) {
  if (!shop) return;
  recalcShopTotals(shop);
  saveState();
}

// ─────────────────────────────────────────
//  PER-ITEM BREAKUP CARDS
// ─────────────────────────────────────────
function buildItemBreakupList(shop) {
  const container = document.getElementById(`itemBreakupList_${shop.id}`);
  if (!container) return;
  container.innerHTML = shop.jewItems.map((item, idx) => {
    const c = item._calc || {};
    const label = item.name || `Item ${idx + 1}`;
    const gstBadge = item.applyGst
      ? `<span style="font-size:8px;padding:1px 7px;border-radius:20px;background:rgba(91,191,142,.1);color:var(--green);border:1px solid rgba(91,191,142,.2)">With GST</span>`
      : `<span style="font-size:8px;padding:1px 7px;border-radius:20px;background:rgba(212,75,63,.1);color:var(--red);border:1px solid rgba(212,75,63,.2)">No GST</span>`;
    const meta = `${fmt3(c.totalWt||0)}g · Making ${item.makingPct}% · ${item.applyGst ? 'GST '+shop.gst+'%' : 'No GST'}`;
    return `
    <div style="background:var(--inp);border:1px solid var(--border);border-radius:8px;margin-bottom:7px;overflow:hidden">
      <!-- Summary line -->
      <div style="display:flex;align-items:center;gap:8px;padding:8px 11px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600;color:var(--gold-l);flex:1">💎 ${escHtml(label)}</span>
        <span style="font-size:10px;color:var(--muted);white-space:nowrap">${meta}</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:700;color:var(--gold-l);white-space:nowrap">₹${fmtCur(c.itemTotal||0)}</span>
      </div>
      <!-- Expand strip -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid var(--border)">
        <div style="padding:6px 10px;text-align:center;border-right:1px solid var(--border)">
          <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em">Gold Value</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--gold-l);margin-top:1px">₹${fmtCur(c.goldVal||0)}</div>
        </div>
        <div style="padding:6px 10px;text-align:center;border-right:1px solid var(--border)">
          <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em">Making (₹)</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--muted);margin-top:1px">₹${fmtCur((c.goldVal||0)*item.makingPct/100)}</div>
        </div>
        <div style="padding:6px 10px;text-align:center">
          <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em">GST</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;margin-top:1px;color:${item.applyGst ? 'var(--muted)' : 'var(--red)'}">
            ${item.applyGst ? '₹'+fmtCur(c.gstAmt||0) : '—'}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  SHOP RATE UPDATERS
// ─────────────────────────────────────────
function updateShopName(shopId, val) {
  const shop = getShop(shopId);
  if (shop) {
    shop.name = val;
    const tab = document.querySelector(`.shop-tab[data-shop-id="${shopId}"] .tab-name`);
    if (tab) tab.textContent = val || 'Shop';
    saveState();
  }
}

function updateShopRate(shopId, val) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.rate = parseFloat(val) || 0;
  const diff = STATE.liveRate.r22 ? shop.rate - STATE.liveRate.r22 : 0;
  const diffEl = document.querySelector(`#shopRate_${shopId}`)?.closest('.shop-rate-block')?.querySelector('.srb-diff');
  if (diffEl && STATE.liveRate.r22) {
    diffEl.className = `srb-diff ${diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'same'}`;
    diffEl.textContent = diff > 0 ? `▲ ₹${fmt(diff)} above live`
      : diff < 0 ? `▼ ₹${fmt(Math.abs(diff))} below live` : '= Same as live';
  }
  recalcShop(shop);
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

function bindShopEvents(shop) {
  document.querySelectorAll(`[id$="_${shop.id}"]`).forEach(el => {
    if (el.tagName === 'INPUT') el.addEventListener('change', () => recalcShop(shop));
  });
}

// ─────────────────────────────────────────
//  OLD GOLD
// ─────────────────────────────────────────
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
}

function removeOGEntry(shopId, entryId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.ogEntries = shop.ogEntries.filter(e => e.id !== entryId);
  document.getElementById(`ogEntry_${shopId}_${entryId}`)?.remove();
  updateOGBadge(shop);
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
  let count = 0;
  STATE.shops.forEach(shop => {
    if (shop.id === sourceShopId) return;
    shop.gst = src.gst;
    shop.jewIdCounter = src.jewItems.length;
    shop.jewItems = src.jewItems.map((item, i) => ({ ...item, id: i + 1, _calc: null }));
    shop.ogEntries = src.ogEntries.map(e => ({ ...e, id: ++shop.ogIdCounter, rate: shop.rate }));
    count++;
  });
  showToast(`⇉ Details copied to ${count} shop(s)`);
}

// ─────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────
function resetShop(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  shop.gst = 3;
  shop.jewIdCounter = 1;
  shop.jewItems = [{ ...createJewItem(), id: 1, name: 'Item 1' }];
  shop.ogEntries = [];
  shop.ogIdCounter = 0;
  shop._result = null;
  renderActiveShop();
  showToast('↺ Shop reset');
  saveState();
}

// ─────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────
function renderSummary() {
  STATE.shops.forEach(s => recalcShop(s));
  const container = document.getElementById('mainContent');
  const results = STATE.shops.map(s => ({ shop: s, grand: s._result?.grand ?? Infinity })).sort((a, b) => a.grand - b.grand);
  const best  = results[0];
  const worst = results[results.length - 1];
  const maxSaving = worst.grand - best.grand;
  const colors = ['#5BBF8E','#E8C97A','#C9A84C','#5B9BBF','#BF8E5B'];

  const rowsHTML = results.map((r, i) => {
    const isBest = i === 0;
    const diff = r.grand - best.grand;
    return `<tr class="${isBest ? 'best-row' : ''}">
      <td>
        <span class="shop-dot" style="background:${colors[i % colors.length]}"></span>
        ${escHtml(r.shop.name)}${isBest ? '<span class="best-badge">✦ Best</span>' : ''}
        <div style="font-size:10px;color:var(--dim)">${r.shop.jewItems.length} item(s)</div>
      </td>
      <td><span class="rate-cell-sm">₹${fmtCur(r.shop.rate)}</span></td>
      <td><span class="price-cell ${isBest ? 'best' : ''}">₹${fmtCur(r.grand)}</span></td>
      <td><span class="diff-cell ${isBest ? 'best' : ''}">${isBest ? '—' : '+₹' + fmtCur(diff)}</span></td>
    </tr>`;
  }).join('');

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

  container.innerHTML = `
  <div class="summary-wrap anim-up">
    <div class="summary-header"><h2>Shop Comparison</h2><p>Each shop at its own gold rate</p></div>
    <div class="summary-meta">
      <div class="sum-chip"><div class="sc-l">Items</div><div class="sc-v">${STATE.shops[0]?.jewItems?.length || 0}</div></div>
      <div class="sum-chip"><div class="sc-l">Shops</div><div class="sc-v">${STATE.shops.length}</div></div>
      <div class="sum-chip"><div class="sc-l" style="color:var(--green)">Best Save</div><div class="sc-v" style="color:var(--green)">₹${fmtCur(maxSaving)}</div></div>
    </div>
    <div class="best-card">
      <div class="bc-icon">🏆</div>
      <div>
        <div class="bc-label">Best Price</div>
        <div class="bc-name">${escHtml(best.shop.name)}</div>
        <div class="bc-rate">Rate: ₹${fmtCur(best.shop.rate)}/g · ${best.shop.jewItems.length} item(s)</div>
      </div>
      ${maxSaving > 0 ? `<div class="bc-save"><div class="bc-save-label">You save</div><div class="bc-save-val">₹${fmtCur(maxSaving)}</div></div>` : ''}
    </div>
    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr><th>Shop</th><th>Rate/g</th><th>Final</th><th>Diff</th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="bar-section"><div class="bar-title">Price Comparison</div>${barsHTML}</div>
    <button class="sum-snapshot-btn" onclick="openSummarySnapshot()">📸 &nbsp;Generate Comparison Snapshot</button>
  </div>`;
}

// ─────────────────────────────────────────
//  SNAPSHOT
// ─────────────────────────────────────────
function openSnapshotModal(shopId) {
  const shop = getShop(shopId);
  if (!shop) return;
  const r = shop._result || {};
  const now = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Subtotal footer values
  const totalMakingVal = shop.jewItems.reduce((s, item) => s + (item._calc?.goldVal||0) * item.makingPct / 100, 0);
  const totalGstVal    = shop.jewItems.reduce((s, i)    => s + (i._calc?.gstAmt   || 0), 0);
  const totalItemsVal  = shop.jewItems.reduce((s, i)    => s + (i._calc?.itemTotal || 0), 0);

  // One data row + one formula sub-row per item
  const itemRows = shop.jewItems.map((item, i) => {
    const c        = item._calc || {};
    const label    = item.name || `Item ${i + 1}`;
    const makingRs = (c.goldVal || 0) * item.makingPct / 100;
    const noGstBadge = !item.applyGst
      ? `<span style="display:inline-block;font-size:8px;padding:1px 6px;border-radius:10px;background:rgba(212,75,63,.1);color:var(--red);border:1px solid rgba(212,75,63,.2);margin-top:3px">Without Bill</span>`
      : '';
    const formula = `${fmt3(c.totalWt||0)}g × ₹${fmtCur(r.rate)} = ₹${fmtCur(c.goldVal||0)}  ·  Making ${item.makingPct}%${item.applyGst ? ' + GST '+shop.gst+'%' : ' · No GST'}`;

    return `
      <tr>
        <td style="padding:9px 0 2px;vertical-align:top;text-align:left">
          <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--gold-l)">💎 ${escHtml(label)}</div>
          ${noGstBadge}
        </td>
        <td style="padding:9px 0 2px;vertical-align:top;text-align:right">
          <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--muted)">₹${fmtCur(makingRs)}</div>
          <div style="font-size:9px;color:var(--dim)">(${item.makingPct}%)</div>
        </td>
        <td style="padding:9px 0 2px;vertical-align:top;text-align:right">
          ${item.applyGst
            ? `<div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--muted)">₹${fmtCur(c.gstAmt||0)}</div>
               <div style="font-size:9px;color:var(--dim)">(${shop.gst}%)</div>`
            : `<div style="font-family:'Cormorant Garamond',serif;font-size:13px;color:var(--dim)">—</div>`}
        </td>
        <td style="padding:9px 0 2px;vertical-align:top;text-align:right;font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:700;color:var(--gold-l)">₹${fmtCur(c.itemTotal||0)}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
        <td colspan="4" style="padding:1px 0 8px;font-size:9px;color:var(--dim);letter-spacing:.02em">${formula}</td>
      </tr>`;
  }).join('');

  const ogRows = shop.ogEntries.map((e, i) => {
    const nw = e.wt - (e.wt * e.ded / 100);
    return `<div class="snap-row"><span class="sl">OG ${i+1} (${fmt3(e.wt)}g, ded ${e.ded}%)</span><span class="sv" style="color:var(--green)">₹${fmtCur(nw * e.rate)}</span></div>`;
  }).join('');

  document.getElementById('snapContent').innerHTML = `
    <div class="snap-shop-name">${escHtml(shop.name)}</div>
    <div class="snap-date">${now}</div>
    <div class="snap-divider"></div>

    <div class="snap-rate-line">Gold Rate (22K) &nbsp;·&nbsp; <strong>₹${fmtCur(r.rate)} / g</strong></div>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;padding:0 0 7px;text-align:left;font-weight:400">Item</th>
          <th style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;padding:0 0 7px;text-align:right;font-weight:400">Making</th>
          <th style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;padding:0 0 7px;text-align:right;font-weight:400">GST</th>
          <th style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;padding:0 0 7px;text-align:right;font-weight:400">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr style="border-top:1px solid rgba(201,168,76,.2)">
          <td style="padding:7px 0 2px;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Subtotal</td>
          <td style="padding:7px 0 2px;text-align:right;font-family:'Cormorant Garamond',serif;font-size:12px;font-weight:600;color:var(--muted)">₹${fmtCur(totalMakingVal)}</td>
          <td style="padding:7px 0 2px;text-align:right;font-family:'Cormorant Garamond',serif;font-size:12px;font-weight:600;color:var(--muted)">₹${fmtCur(totalGstVal)}</td>
          <td style="padding:7px 0 2px;text-align:right;font-family:'Cormorant Garamond',serif;font-size:12px;font-weight:600;color:var(--gold-l)">₹${fmtCur(totalItemsVal)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="snap-divider"></div>
    ${shop.ogEntries.length > 0 ? ogRows + `<div class="snap-row og"><span class="sl">🔄 Old Gold Exchange</span><span class="sv">− ₹${fmtCur(r.ogTotalVal||0)}</span></div>` : ''}
    <div class="snap-grand"><div><div class="gl">Final Payable Amount</div></div><div class="gv">₹${fmtCur(Math.max(0,r.grand||0))}</div></div>
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
      <span class="sv" style="${isBest?'color:var(--green)':''}">₹${fmtCur(r.grand)}${diff > 0 ? ' <small style="color:var(--dim)">+₹'+fmtCur(diff)+'</small>' : ''}</span>
    </div>`;
  }).join('');

  document.getElementById('snapContent').innerHTML = `
    <div class="snap-shop-name">Shop Price Comparison</div>
    <div class="snap-date">${now}</div>
    <div class="snap-divider"></div>
    <div class="snap-row"><span class="sl">Items</span><span class="sv">${STATE.shops[0]?.jewItems?.length || 0}</span></div>
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
    const canvas = await html2canvas(card, { backgroundColor: '#141209', scale: 2, useCORS: true, logging: false });
    const link = document.createElement('a');
    link.download = `gold-calc-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('✦ Image downloaded');
  } catch (e) { showToast('Could not generate image', true); }
}

async function shareWhatsApp() {
  const card = document.getElementById('snapCard');
  try {
    const canvas = await html2canvas(card, { backgroundColor: '#141209', scale: 2, useCORS: true });
    canvas.toBlob(async blob => {
      if (navigator.share && navigator.canShare({ files: [new File([blob], 'gold-calc.png', { type: 'image/png' })] })) {
        await navigator.share({ title: 'Gold Jewellery Calculation', files: [new File([blob], 'gold-calc.png', { type: 'image/png' })] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'gold-calc.png'; a.click();
        setTimeout(() => window.open('https://wa.me/', '_blank'), 500);
        showToast('Image saved — attach it in WhatsApp');
      }
    }, 'image/png');
  } catch (e) { showToast('Could not share image', true); }
}

// ─────────────────────────────────────────
//  TOGGLES
// ─────────────────────────────────────────

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
