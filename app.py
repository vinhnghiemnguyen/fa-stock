from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from vnstock import Company, Finance, Listing
from concurrent.futures import ThreadPoolExecutor, as_completed
import traceback
import math
import time

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────────────────────
# Banking comparison page + API
# ─────────────────────────────────────────────────────────────────

# 23 niêm yết ngân hàng theo Listing.symbols_by_industries()
BANK_SYMBOLS = [
    'ACB','BAB','BID','CTG','EIB','EVF',
    'HDB','KLB','LPB','MBB','MSB','NAB',
    'NVB','OCB','SHB','SSB','STB','TCB',
    'TPB','VAB','VCB','VIB','VPB',
]

# Metrics to extract: (flat_col_name, display_label, unit)
BANK_METRICS = [
    ('Market Capital (Bn. VND)', 'Vốn hóa (tỷ)', 'bil'),
    ('P/E',                      'P/E',           'x'),
    ('P/B',                      'P/B',           'x'),
    ('P/S',                      'P/S',           'x'),
    ('ROE (%)',                   'ROE',           'pct_dec'),
    ('ROA (%)',                   'ROA',           'pct_dec'),
    ('Net Profit Margin (%)',     'Lợi nhuận biên','pct_dec'),
    ('Dividend yield (%)',        'Cổ tức yield',  'pct_dec'),
    ('Financial Leverage',        'Đòn bẩy',       'x'),
    ('EPS (VND)',                 'EPS (đ)',        'vnd'),
    ('BVPS (VND)',                'BVPS (đ)',       'vnd'),
    ('Outstanding Share (Mil. Shares)', 'Số CP (tr)', 'mil'),
]

def fetch_bank_ratio(symbol):
    """Fetch latest-year ratio row for one bank. Returns dict or None."""
    try:
        f  = Finance(source='VCI', symbol=symbol)
        df = f.ratio(period='year')
        if df is None or df.empty:
            return None

        # Flatten MultiIndex columns
        if hasattr(df.columns, 'levels'):
            names = [b for _, b in df.columns]
            df.columns = names

        # Build year label & sort newest first
        if 'Năm' in df.columns:
            df['__year__'] = df['Năm'].astype(int)
            df = df.sort_values('__year__', ascending=False)

        latest = df.iloc[0]
        row = {'symbol': symbol, 'year': int(latest.get('__year__', 0))}
        for col, _, _ in BANK_METRICS:
            row[col] = clean_value(latest.get(col))
        return row
    except Exception:
        return {'symbol': symbol, 'year': 0, 'error': True}

@app.route('/compare/banking')
def compare_banking_page():
    return render_template('compare.html')

# Simple in-memory cache (5 minutes)
_compare_cache = {'data': None, 'ts': 0}
CACHE_TTL = 300   # seconds

@app.route('/api/banking-compare')
def api_banking_compare():
    # Serve from cache if fresh
    if _compare_cache['data'] and (time.time() - _compare_cache['ts']) < CACHE_TTL:
        return jsonify(_compare_cache['data'])

    results = []
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(fetch_bank_ratio, s): s for s in BANK_SYMBOLS}
        for fut in as_completed(futures):
            row = fut.result()
            if row:
                results.append(row)

    results.sort(key=lambda r: r.get('Vốn hóa (tỷ)', 0) or 0, reverse=True)
    # Sort to keep symbol order stable for display
    results.sort(key=lambda r: r['symbol'])

    metrics_meta = [
        {'key': col, 'label': label, 'unit': unit}
        for col, label, unit in BANK_METRICS
    ]
    payload = {'banks': results, 'metrics': metrics_meta}
    _compare_cache['data'] = payload
    _compare_cache['ts']   = time.time()
    return jsonify(payload)



def clean_value(v):
    """Convert numpy/nan values to JSON-serialisable Python types."""
    if v is None:
        return None
    if hasattr(v, 'item'):
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    return v

def df_to_records(df):
    """Convert a DataFrame to a list of {column: value} dicts, all values cleaned."""
    if df is None or df.empty:
        return []
    records = []
    for _, row in df.iterrows():
        records.append({k: clean_value(v) for k, v in row.items()})
    return records

@app.route('/')
def index():
    return render_template('index.html')

# ─────────────────────────────────────────────────────────────────
# Company overview
# ─────────────────────────────────────────────────────────────────
@app.route('/api/company')
def get_company():
    symbol = request.args.get('symbol', '').upper().strip()
    if not symbol:
        return jsonify({'error': 'Vui lòng nhập mã cổ phiếu'}), 400
    try:
        company = Company(symbol=symbol, source='KBS')
        df = company.overview()
        if df is None or df.empty:
            return jsonify({'error': f'Không tìm thấy thông tin cho mã {symbol}'}), 404
        data = {k: clean_value(v) for k, v in df.iloc[0].to_dict().items()}
        return jsonify({'symbol': symbol, 'data': data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Lỗi khi lấy dữ liệu: {str(e)}'}), 500

# ─────────────────────────────────────────────────────────────────
# Company detail tabs: officers | shareholders | subsidiaries |
#                      affiliate | news | events
# ─────────────────────────────────────────────────────────────────
@app.route('/api/company-detail')
def get_company_detail():
    symbol = request.args.get('symbol', '').upper().strip()
    tab    = request.args.get('tab', 'officers').lower()

    VALID_TABS = ('officers', 'shareholders', 'subsidiaries', 'affiliate', 'news', 'events')
    if not symbol:
        return jsonify({'error': 'Vui lòng nhập mã cổ phiếu'}), 400
    if tab not in VALID_TABS:
        return jsonify({'error': f'tab không hợp lệ: {tab}'}), 400

    try:
        company = Company(symbol=symbol, source='KBS')
        if   tab == 'officers':     df = company.officers()
        elif tab == 'shareholders': df = company.shareholders()
        elif tab == 'subsidiaries': df = company.subsidiaries()
        elif tab == 'affiliate':    df = company.affiliate()
        elif tab == 'news':         df = company.news()
        else:                       df = company.events()

        if df is None or df.empty:
            return jsonify({'records': [], 'columns': [], 'tab': tab}), 200

        records = df_to_records(df)
        return jsonify({
            'symbol': symbol,
            'tab': tab,
            'columns': list(df.columns),
            'records': records,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Lỗi khi lấy dữ liệu: {str(e)}'}), 500

# ─────────────────────────────────────────────────────────────────
# Financial reports  – bs | is | cf   (source: KBS)
# ─────────────────────────────────────────────────────────────────
@app.route('/api/finance')
def get_finance():
    symbol = request.args.get('symbol', '').upper().strip()
    period = request.args.get('period', 'year').lower()
    report = request.args.get('report', 'bs').lower()

    if not symbol:
        return jsonify({'error': 'Vui lòng nhập mã cổ phiếu'}), 400
    if period not in ('year', 'quarter'):
        return jsonify({'error': 'period phải là year hoặc quarter'}), 400
    if report not in ('bs', 'is', 'cf'):
        return jsonify({'error': 'report phải là bs, is, hoặc cf'}), 400

    try:
        finance = Finance(symbol=symbol, source='KBS')
        if report == 'bs':
            df = finance.balance_sheet(period=period)
        elif report == 'is':
            df = finance.income_statement(period=period)
        else:
            df = finance.cash_flow(period=period)

        records = df_to_records(df)
        if not records:
            return jsonify({'error': f'Không có dữ liệu cho {symbol} ({period})'}), 404

        return jsonify({
            'symbol': symbol, 'period': period, 'report': report,
            'columns': list(df.columns), 'records': records,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Lỗi khi lấy dữ liệu tài chính: {str(e)}'}), 500

# ─────────────────────────────────────────────────────────────────
# Financial ratios  (source: VCI – only source that supports ratio)
# Pivots data: one record per metric, period keys as columns
# ─────────────────────────────────────────────────────────────────
@app.route('/api/ratio')
def get_ratio():
    symbol = request.args.get('symbol', '').upper().strip()
    period = request.args.get('period', 'year').lower()

    if not symbol:
        return jsonify({'error': 'Vui lòng nhập mã cổ phiếu'}), 400
    if period not in ('year', 'quarter'):
        return jsonify({'error': 'period phải là year hoặc quarter'}), 400

    try:
        finance = Finance(source='VCI', symbol=symbol)
        df = finance.ratio(period=period, lang='vi', dropna=True)

        if df is None or df.empty:
            return jsonify({'error': f'Không có dữ liệu chỉ số cho {symbol}'}), 404

        # Flatten MultiIndex columns: (group, metric) → keep group for grouping
        if hasattr(df.columns, 'levels'):
            groups = [a if a not in ('Meta', '') else '' for a, b in df.columns]
            names  = [b for a, b in df.columns]
            df.columns = names
            group_map = dict(zip(names, groups))
        else:
            group_map = {}

        # Build period label column
        if 'Năm' in df.columns and 'Kỳ' in df.columns and period == 'quarter':
            df['__period__'] = df['Năm'].astype(str) + '-Q' + df['Kỳ'].astype(str)
        elif 'Năm' in df.columns:
            df['__period__'] = df['Năm'].astype(str)
        else:
            df['__period__'] = df[df.columns[0]].astype(str)

        # Sort rows newest-first
        df = df.sort_values('__period__', ascending=False)
        periods = df['__period__'].tolist()

        # Metric columns (skip meta)
        meta_skip = {'CP', 'Năm', 'Kỳ', '__period__'}
        metric_cols = [c for c in df.columns if c not in meta_skip]

        # Build pivoted records: one row per metric
        records = []
        for col in metric_cols:
            row = {
                'item': col,
                'group': group_map.get(col, ''),
            }
            for i, p in enumerate(periods):
                row[p] = clean_value(df.iloc[i][col])
            records.append(row)

        return jsonify({
            'symbol': symbol, 'period': period, 'report': 'ratio',
            'periods': periods,
            'records': records,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Lỗi khi lấy chỉ số tài chính: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
