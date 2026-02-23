// ─────────────────────────────────────────────────────────────────
// Banking sector comparison logic
// ─────────────────────────────────────────────────────────────────

let bankData = [];   // raw API response
let metaMeta = [];   // [{key, label, unit}]
let sortCol = null;
let sortAsc = true;

// Which metrics are "higher = better" vs "lower = better"
const HIGHER_BETTER = new Set([
    'ROE (%)', 'ROA (%)', 'Net Profit Margin (%)',
    'Dividend yield (%)', 'EPS (VND)', 'BVPS (VND)',
    'Market Capital (Bn. VND)', 'Outstanding Share (Mil. Shares)',
]);
const LOWER_BETTER = new Set(['P/E', 'P/B', 'P/S', 'Financial Leverage']);
// P/Cash Flow — neutral, no highlight

// ─── Formatters ───────────────────────────────────────────────────
function fmtCell(val, unit) {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    if (isNaN(n)) return '—';

    switch (unit) {
        case 'bil':  // market cap — raw value is already in Bn VND from VCI
            return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
        case 'pct_dec': {
            // VCI returns ROE/ROA as decimals (0.153 = 15.3%)
            const pct = Math.abs(n) < 2 ? n * 100 : n;
            return pct.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        }
        case 'vnd':
            return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
        case 'mil':
            return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
        case 'x':
        default:
            return n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

// ─── Compute best/worst per column ───────────────────────────────
function computeExtremes(banks, metrics) {
    const best = {};
    const worst = {};
    metrics.forEach(({ key }) => {
        const vals = banks.map(b => b[key]).filter(v => v !== null && v !== undefined && !isNaN(Number(v)));
        if (!vals.length) return;
        const nums = vals.map(Number);
        const max = Math.max(...nums);
        const min = Math.min(...nums);
        if (HIGHER_BETTER.has(key)) { best[key] = max; worst[key] = min; }
        else if (LOWER_BETTER.has(key)) { best[key] = min; worst[key] = max; }
    });
    return { best, worst };
}

// ─── Render table ────────────────────────────────────────────────
function renderTable() {
    const thead = document.getElementById('cmp-thead');
    const tbody = document.getElementById('cmp-tbody');

    // Sort
    const sorted = [...bankData];
    if (sortCol) {
        sorted.sort((a, b) => {
            const va = a[sortCol] ?? (sortAsc ? Infinity : -Infinity);
            const vb = b[sortCol] ?? (sortAsc ? Infinity : -Infinity);
            return sortAsc ? va - vb : vb - va;
        });
    }

    const { best, worst } = computeExtremes(bankData, metaMeta);

    // Header
    let hHtml = '<tr>';
    hHtml += '<th class="cmp-th cmp-th-fixed" data-col="symbol">Ngân hàng';
    if (sortCol === 'symbol') hHtml += sortAsc ? ' ↑' : ' ↓';
    hHtml += '</th>';
    metaMeta.forEach(({ key, label, unit }) => {
        const active = sortCol === key;
        const arrow = active ? (sortAsc ? ' ↑' : ' ↓') : '';
        const unitTag = unit === 'pct_dec' ? '' : unit === 'bil' ? '<span class="cmp-unit">tỷ</span>' :
            unit === 'vnd' ? '<span class="cmp-unit">đ</span>' :
                unit === 'mil' ? '<span class="cmp-unit">tr CP</span>' :
                    unit === 'x' ? '<span class="cmp-unit">×</span>' : '';
        hHtml += `<th class="cmp-th${active ? ' cmp-th-active' : ''}" data-col="${key}">${label}${unitTag}${arrow}</th>`;
    });
    hHtml += '</tr>';
    thead.innerHTML = hHtml;

    // Body
    let bHtml = '';
    sorted.forEach(bank => {
        const hasError = bank.error;
        bHtml += `<tr class="${hasError ? 'cmp-row-error' : ''}">`;
        bHtml += `<td class="cmp-td cmp-td-fixed cmp-symbol">
            <span class="cmp-ticker">${bank.symbol}</span>
            <span class="cmp-year">${bank.year || '—'}</span>
        </td>`;

        metaMeta.forEach(({ key, unit }) => {
            const raw = bank[key];
            const n = Number(raw);
            let cls = 'cmp-td';
            if (raw !== null && raw !== undefined && !isNaN(n)) {
                if (best[key] !== undefined && Math.abs(n - best[key]) < 1e-9) cls += ' cmp-best';
                if (worst[key] !== undefined && Math.abs(n - worst[key]) < 1e-9) cls += ' cmp-worst';
            }
            bHtml += `<td class="${cls}">${fmtCell(raw, unit)}</td>`;
        });
        bHtml += '</tr>';
    });
    tbody.innerHTML = bHtml;
}

// ─── Load data ────────────────────────────────────────────────────
async function loadData() {
    document.getElementById('cmp-loading').style.display = 'block';
    document.getElementById('cmp-table-wrap').style.display = 'none';
    document.getElementById('cmp-error').style.display = 'none';

    try {
        const res = await fetch('/api/banking-compare');
        const json = await res.json();
        document.getElementById('cmp-loading').style.display = 'none';

        if (!res.ok || json.error) {
            showError(json.error || 'Không thể tải dữ liệu');
            return;
        }

        bankData = json.banks || [];
        metaMeta = json.metrics || [];
        sortCol = 'Market Capital (Bn. VND)';  // default sort
        sortAsc = false;

        renderTable();
        document.getElementById('cmp-table-wrap').style.display = 'block';
    } catch (e) {
        document.getElementById('cmp-loading').style.display = 'none';
        showError('Lỗi kết nối: ' + e.message);
    }
}

function showError(msg) {
    const el = document.getElementById('cmp-error');
    el.textContent = '⚠️  ' + msg;
    el.style.display = 'block';
}

// ─── Sort on header click ─────────────────────────────────────────
document.getElementById('cmp-table').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    const col = th.dataset.col;
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'symbol'; }
    renderTable();
});

document.getElementById('cmp-refresh').addEventListener('click', loadData);

// Auto-load on page open
loadData();
