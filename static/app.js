const input = document.getElementById('symbol-input');
const btn = document.getElementById('search-btn');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const errorMsg = document.getElementById('error-msg');

// ─────────────────────────────────────────────────────────────────
// Company field display mapping  [key, label, formatter?]
// ─────────────────────────────────────────────────────────────────
const FIELDS = [
    ['company_name', 'Tên công ty'],
    ['exchange', 'Sàn giao dịch'],
    ['industry', 'Ngành'],
    ['industry_en', 'Industry (EN)'],
    ['established_year', 'Năm thành lập'],
    ['number_of_employees', 'Số nhân viên', v => Number(v).toLocaleString('vi-VN')],
    ['no_shareholders', 'Số cổ đông', v => Number(v).toLocaleString('vi-VN')],
    ['company_type', 'Loại hình doanh nghiệp'],
    ['address', 'Địa chỉ'],
    ['phone', 'Điện thoại'],
    ['website', 'Website', v => v ? `<a href="${v.startsWith('http') ? v : 'http://' + v}" target="_blank">${v}</a>` : '—'],
    ['charter_capital', 'Vốn điều lệ', v => v ? (Number(v) / 1e9).toFixed(2) + ' tỷ VNĐ' : '—'],
    ['issue_share', 'Số cổ phiếu lưu hành', v => v ? Number(v).toLocaleString('vi-VN') : '—'],
    ['outstanding_shares', 'CP lưu hành', v => v ? Number(v).toLocaleString('vi-VN') : '—'],
    ['short_name', 'Tên viết tắt'],
    ['tax_id', 'Mã số thuế'],
    ['listing_date', 'Ngày niêm yết'],
    ['auditor', 'Đơn vị kiểm toán'],
];

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────
// Company search
// ─────────────────────────────────────────────────────────────────
async function search() {
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) { showError('Vui lòng nhập mã cổ phiếu'); return; }

    result.style.display = 'none';
    document.getElementById('finance-section').style.display = 'none';
    errorMsg.style.display = 'none';
    loading.style.display = 'block';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`);
        const json = await res.json();
        loading.style.display = 'none';
        btn.disabled = false;

        if (!res.ok || json.error) { showError(json.error || 'Đã có lỗi xảy ra'); return; }

        renderResult(symbol, json.data);
        currentSymbol = symbol;
        activateOverviewTab();
        loadFinance();
    } catch (err) {
        loading.style.display = 'none';
        btn.disabled = false;
        showError('Không thể kết nối đến server. Vui lòng thử lại.');
    }
}

function showError(msg) {
    errorMsg.textContent = '⚠️  ' + msg;
    errorMsg.style.display = 'block';
}

function renderResult(symbol, data) {
    const companyName = data.company_name || data.short_name || symbol;
    const exchange = data.exchange || '';
    document.getElementById('company-initials').textContent = getInitials(companyName);
    document.getElementById('company-full-name').textContent = companyName;
    document.getElementById('badge-ticker').textContent = symbol;
    document.getElementById('badge-exchange').textContent = exchange;
    document.getElementById('badge-exchange').style.display = exchange ? 'inline-block' : 'none';

    const grid = document.getElementById('info-grid');
    grid.innerHTML = '';
    FIELDS.forEach(([key, label, fmt]) => {
        let val = data[key];
        if (val === null || val === undefined || val === '') return;
        const display = fmt ? fmt(val) : escapeHtml(String(val));
        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `<div class="label">${label}</div><div class="value">${display}</div>`;
        grid.appendChild(card);
    });

    result.style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────
// Company Detail Tabs
// ─────────────────────────────────────────────────────────────────
let currentDetailTab = 'overview';

// Show the overview tab (info-grid), hide detail-content
function activateOverviewTab() {
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.detail-tab-btn[data-tab="overview"]').classList.add('active');
    currentDetailTab = 'overview';
    document.getElementById('info-grid').style.display = '';
    document.getElementById('detail-content').style.display = 'none';
    document.getElementById('detail-loading').style.display = 'none';
    document.getElementById('detail-error').style.display = 'none';
}

async function loadDetail() {
    if (!currentSymbol) return;
    const loading = document.getElementById('detail-loading');
    const error = document.getElementById('detail-error');
    const content = document.getElementById('detail-content');

    loading.style.display = 'block';
    error.style.display = 'none';
    content.innerHTML = '';

    try {
        const res = await fetch(`/api/company-detail?symbol=${encodeURIComponent(currentSymbol)}&tab=${currentDetailTab}`);
        const json = await res.json();
        loading.style.display = 'none';

        if (!res.ok || json.error) {
            error.textContent = '\u26a0\ufe0f  ' + (json.error || 'L\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh');
            error.style.display = 'block';
            return;
        }

        if (!json.records || json.records.length === 0) {
            content.innerHTML = '<div class="detail-empty">Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u</div>';
            return;
        }

        if (currentDetailTab === 'news') {
            content.innerHTML = renderNewsCards(json.records);
        } else {
            content.innerHTML = renderDetailTable(json.records, json.columns, currentDetailTab);
        }
    } catch (err) {
        document.getElementById('detail-loading').style.display = 'none';
        document.getElementById('detail-error').textContent = '\u26a0\ufe0f  Kh\u00f4ng th\u1ec3 t\u1ea3i d\u1eef li\u1ec7u.';
        document.getElementById('detail-error').style.display = 'block';
    }
}

// Column display config per tab
const DETAIL_COLS = {
    officers: [['name', 'Họ tên'], ['position', 'Chức vụ'], ['from_date', 'Ngày bổ nhiệm']],
    shareholders: [['name', 'Cổ đông'], ['shares_owned', 'Số CP', 'num'], ['ownership_percentage', '% Sở hữu', 'pct'], ['update_date', 'Cập nhật', 'date']],
    subsidiaries: [['name', 'Công ty con'], ['charter_capital', 'Vốn điều lệ (triệu)', 'num'], ['ownership_percent', '% Sở hữu', 'pct'], ['type', 'Loại'], ['update_date', 'Cập nhật', 'date']],
    affiliate: [['name', 'Công ty liên kết'], ['charter_capital', 'Vốn điều lệ (triệu)', 'num'], ['ownership_percent', '% Sở hữu', 'pct'], ['type', 'Loại'], ['update_date', 'Cập nhật', 'date']],
    events: [['event_name', 'Sự kiện'], ['event_code', 'Mã'], ['record_date', 'Ngày chốt', 'date'], ['ex_date', 'Ngày GD không hưởng', 'date'], ['value', 'Giá trị'], ['event_desc', 'Mô tả']],
};

function renderDetailTable(records, rawCols, tab) {
    const colDefs = DETAIL_COLS[tab];
    // Fall back to raw columns if no config
    const cols = colDefs ||
        rawCols.map(c => [c, c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase())]);

    let html = '<table class="detail-table"><thead><tr>';
    cols.forEach(([, label]) => { html += `<th>${escapeHtml(label)}</th>`; });
    html += '</tr></thead><tbody>';

    records.forEach(rec => {
        html += '<tr>';
        cols.forEach(([key, , type]) => {
            let val = rec[key];
            if (val === null || val === undefined) val = '';
            let display = escapeHtml(String(val));
            let cls = '';

            if (type === 'num' && val !== '') {
                const n = Number(val);
                display = isNaN(n) ? display : n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
                cls = 'num';
            } else if (type === 'pct' && val !== '') {
                // Values already in % (e.g. 74.8), just format with 2 decimals
                const n = Number(val);
                display = isNaN(n) ? display : n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
                cls = 'pct';
            } else if (type === 'date' && val !== '') {
                // Strip time part from ISO datetime (2025-01-01T00:00:00 → 2025-01-01)
                display = String(val).split('T')[0];
            }
            html += `<td${cls ? ` class="${cls}"` : ''}>${display}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}

function renderNewsCards(records) {
    let html = '<div class="news-list">';
    records.forEach(r => {
        const title = escapeHtml(r.title || r.head || '(Kh\u00f4ng c\u00f3 ti\u00eau \u0111\u1ec1)');
        const url = r.url || '#';
        const time = r.publish_time ? new Date(r.publish_time).toLocaleString('vi-VN') : '';
        html += `<div class="news-card">`;
        html += `  <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${title}</a>`;
        if (time) html += `  <div class="news-meta">${time}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

// Tab click handler
document.getElementById('detail-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.detail-tab-btn');
    if (!btn) return;
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDetailTab = btn.dataset.tab;
    if (currentDetailTab === 'overview') {
        // Show info-grid, hide detail panel
        document.getElementById('info-grid').style.display = '';
        document.getElementById('detail-content').style.display = 'none';
        document.getElementById('detail-loading').style.display = 'none';
        document.getElementById('detail-error').style.display = 'none';
    } else {
        // Hide info-grid, show detail panel
        document.getElementById('info-grid').style.display = 'none';
        document.getElementById('detail-content').style.display = 'block';
        loadDetail();
    }
});


// ─────────────────────────────────────────────────────────────────
// Financial reports
// ─────────────────────────────────────────────────────────────────
let currentSymbol = '';
let currentPeriod = 'year';
let currentReport = 'bs';

// vnstock KBS financial data unit = nghìn VNĐ.
// To display in tỷ VNĐ: divide by 1,000,000  (1 tỷ = 10^9 / 1000 = 10^6 nghìn)
function fmtFinance(val, isEps) {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (isEps) {
        // EPS / per-share values are already in VNĐ
        return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' đ';
    }
    // Convert nghìn VNĐ → tỷ VNĐ
    return (n / 1e6).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function numClass(v) {
    if (v === null || v === undefined || isNaN(Number(v))) return 'num-neutral';
    return Number(v) >= 0 ? 'num-positive' : 'num-negative';
}

async function loadFinance() {
    if (!currentSymbol) return;

    const financeSection = document.getElementById('finance-section');
    const financeLoading = document.getElementById('finance-loading');
    const financeError = document.getElementById('finance-error');
    const tableWrap = document.getElementById('finance-table-wrap');
    const table = document.getElementById('finance-table');

    financeSection.style.display = 'block';
    financeError.style.display = 'none';
    tableWrap.style.display = 'none';
    financeLoading.style.display = 'block';

    financeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        // Ratio uses a different endpoint
        const isRatio = (currentReport === 'ratio');
        const url = isRatio
            ? `/api/ratio?symbol=${encodeURIComponent(currentSymbol)}&period=${currentPeriod}`
            : `/api/finance?symbol=${encodeURIComponent(currentSymbol)}&period=${currentPeriod}&report=${currentReport}`;

        const res = await fetch(url);
        const json = await res.json();

        financeLoading.style.display = 'none';

        if (!res.ok || json.error) {
            financeError.textContent = '\u26a0\ufe0f  ' + (json.error || 'L\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh');
            financeError.style.display = 'block';
            return;
        }

        if (isRatio) {
            renderRatioTable(json, table);
        } else {
            renderFinanceTable(json, table);
        }
        tableWrap.style.display = 'block';

    } catch (err) {
        financeLoading.style.display = 'none';
        financeError.textContent = '\u26a0\ufe0f  Kh\u00f4ng th\u1ec3 t\u1ea3i d\u1eef li\u1ec7u t\u00e0i ch\u00ednh.';
        financeError.style.display = 'block';
    }
}

function renderFinanceTable(json, table) {
    const { records, columns } = json;
    if (!records || records.length === 0) {
        table.innerHTML = '<tr><td style="padding:20px;color:var(--text-secondary)">Không có dữ liệu</td></tr>';
        return;
    }

    const LABEL_COLS = new Set(['item', 'item_id', 'symbol', 'source', 'unit', 'ticker', 'request_id']);
    const periodCols = columns.filter(c => !LABEL_COLS.has(c));

    const sortedPeriods = [...periodCols].sort((a, b) => {
        const parseVal = s => {
            if (/^\d{4}$/.test(s)) return parseInt(s) * 100;
            const m = String(s).match(/Q(\d)\/(\d{4})/);
            if (m) return parseInt(m[2]) * 100 + parseInt(m[1]);
            // Handle "2025-Q1" format from vnstock quarterly
            const m2 = String(s).match(/(\d{4})-Q(\d)/);
            if (m2) return parseInt(m2[1]) * 100 + parseInt(m2[2]);
            return 0;
        };
        return parseVal(b) - parseVal(a);
    });

    // THEAD
    let html = '<thead><tr>';
    html += '<th>Chỉ tiêu (tỷ VNĐ)</th>';
    sortedPeriods.forEach(p => { html += `<th>${escapeHtml(String(p))}</th>`; });
    html += '</tr></thead><tbody>';

    const MAX_LABEL = 55;  // truncate labels longer than this

    records.forEach(rec => {
        const fullLabel = rec['item'] || rec['item_id'] || '—';
        const isSection = /^[IVXLC]+\./.test(fullLabel);
        // Detect EPS / per-share rows (show raw VNĐ, not divided)
        const isEps = /per.share|earning_per_share|lãi.*cơ bản/i.test(rec['item_id'] || '') ||
            /\(VNÐ\)/.test(fullLabel);

        // Shorten long labels: keep text up to MAX_LABEL chars
        const shortLabel = fullLabel.length > MAX_LABEL
            ? fullLabel.slice(0, MAX_LABEL).trimEnd() + '…'
            : fullLabel;

        const titleAttr = fullLabel.length > MAX_LABEL
            ? ` title="${fullLabel.replace(/"/g, '&quot;')}"`
            : '';

        html += `<tr${isSection ? ' class="section-row"' : ''}>`;
        html += `<td${titleAttr} style="${fullLabel.length > MAX_LABEL ? 'cursor:help' : ''}">${escapeHtml(shortLabel)}</td>`;
        sortedPeriods.forEach(p => {
            const v = rec[p];
            const cls = isSection ? '' : numClass(v);
            html += `<td class="${cls}">${fmtFinance(v, isEps)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody>';
    table.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────
// Ratio table renderer
// Records: { item, group, period1, period2, ... }
// ─────────────────────────────────────────────────────────────────
function renderRatioTable(json, table) {
    const { records, periods } = json;
    if (!records || records.length === 0) {
        table.innerHTML = '<tr><td style="padding:20px;color:var(--text-secondary)">Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u</td></tr>';
        return;
    }

    const MAX_LABEL = 55;

    // THEAD
    let html = '<thead><tr>';
    html += '<th>Ch\u1ec9 s\u1ed1</th>';
    periods.forEach(p => { html += `<th>${escapeHtml(String(p))}</th>`; });
    html += '</tr></thead><tbody>';

    // Group metrics under section headers
    let lastGroup = null;
    records.forEach(rec => {
        const group = rec['group'] || '';
        const fullLabel = rec['item'] || '\u2014';

        // Insert group header row when group changes
        if (group && group !== lastGroup) {
            html += `<tr class="section-row"><td colspan="${periods.length + 1}">${escapeHtml(group)}</td></tr>`;
            lastGroup = group;
        }

        const shortLabel = fullLabel.length > MAX_LABEL
            ? fullLabel.slice(0, MAX_LABEL).trimEnd() + '\u2026'
            : fullLabel;
        const titleAttr = fullLabel.length > MAX_LABEL
            ? ` title="${fullLabel.replace(/"/g, '&quot;')}"`
            : '';

        html += '<tr>';
        html += `<td${titleAttr} style="padding-left:24px;${fullLabel.length > MAX_LABEL ? 'cursor:help' : ''}">${escapeHtml(shortLabel)}</td>`;
        periods.forEach(p => {
            const v = rec[p];
            const display = fmtRatio(fullLabel, v);
            const cls = numClass(v);
            html += `<td class="${cls}">${display}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody>';
    table.innerHTML = html;
}

// Format ratio values: detect unit from label
function fmtRatio(label, val) {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    if (isNaN(n)) return String(val);

    // Per-share: EPS, BVPS → raw in VNĐ/CP
    if (/\(vnd\)|\(vnđ\)/i.test(label) || /\beps\b|\bbvps\b/i.test(label)) {
        return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' đ';
    }
    // Share count → Triệu CP
    if (/triệu cp|số cp lưu hành/i.test(label)) {
        return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr';
    }
    // Labels that say "(Tỷ đồng)": raw unit is nghìn VNĐ → divide by 1e9 to get tỷ
    // e.g. EBIT (Tỷ đồng), EBITDA (Tỷ đồng), Vốn hóa (Tỷ đồng)
    if (/\(tỷ đồng\)|\(tỷ vnd\)/i.test(label)) {
        return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
    }
    // Percentage: ROE, ROA, margins, yields
    // VCI returns these as decimals (0.153 = 15.3%)
    if (/%/.test(label) || /\broe\b|\broa\b|\bros\b|tỷ suất|tỷ lệ|cổ tức/i.test(label)) {
        const pct = Math.abs(n) < 2 ? n * 100 : n;
        return pct.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }
    // Generic multiples (P/E, P/B, leverage ratios)
    return n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}



// Period toggle buttons
document.getElementById('period-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#period-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    loadFinance();
});

// Report tab buttons
document.getElementById('report-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#report-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentReport = btn.dataset.report;
    loadFinance();
});

// Search events
btn.addEventListener('click', search);
input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
        input.value = pill.dataset.symbol;
        search();
    });
});
input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
