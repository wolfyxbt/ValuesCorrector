		        let usdPrices = {}; // 各资产相对 USD 的单价表（换算单一数据源；1 单位资产 = ? USD）
		        let updating = false;
		        let lastInputField = 1; // 记录最后一次输入数字的栏位
		        let localStorageAvailable = false;
		        let loadRatesInFlight = null;

        // ===== 资产配置（集中定义所有可换算的币种 / 法币 / 实物）=====
        // 新增一项只需在此数组加一行，下面的 currencyLogos、分类列表、汇率换算都会自动派生。
        // 新增 crypto 时同时在 COINGECKO_COIN_IDS 填入 CoinGecko ID。
        // category: 'crypto'（实时价来自 CoinGecko）| 'fiat'（以 USD 为基准）| 'product'（按 priceAmount + priceCurrency 计价）
        // logoType: 'image' | 'emoji'
        const ASSET_CONFIG = [
            // 加密货币
            // logo 使用仓库内本地文件（同源）：UI 与分享图 canvas 都可直接使用，无跨域污染问题
            { symbol: 'BTC', category: 'crypto', text: 'BTC', logoType: 'image', logo: 'assets/logos/btc.png', emoji: '🟠' },
            { symbol: 'ETH', category: 'crypto', text: 'ETH', logoType: 'image', logo: 'assets/logos/eth.png', emoji: '♦️' },
            { symbol: 'SOL', category: 'crypto', text: 'SOL', logoType: 'image', logo: 'assets/logos/sol.png', emoji: '🟣' },
            { symbol: 'BNB', category: 'crypto', text: 'BNB', logoType: 'image', logo: 'assets/logos/bnb.png', emoji: '🟡' },
            { symbol: 'OKB', category: 'crypto', text: 'OKB', logoType: 'image', logo: 'assets/logos/okb.png', emoji: '⚫' },
            // 法币（USD 为基准货币）
            { symbol: 'USD', category: 'fiat', text: 'USD', logoType: 'image', logo: 'assets/logos/fiat/us.svg', emoji: '🇺🇸' },
            { symbol: 'CNY', category: 'fiat', text: 'CNY', logoType: 'image', logo: 'assets/logos/fiat/cn.svg', emoji: '🇨🇳' },
            { symbol: 'TWD', category: 'fiat', text: 'TWD', logoType: 'image', logo: 'assets/logos/fiat/tw.svg', emoji: '🇹🇼' },
            { symbol: 'JPY', category: 'fiat', text: 'JPY', logoType: 'image', logo: 'assets/logos/fiat/jp.svg', emoji: '🇯🇵' },
            { symbol: 'KRW', category: 'fiat', text: 'KRW', logoType: 'image', logo: 'assets/logos/fiat/kr.svg', emoji: '🇰🇷' },
            { symbol: 'SGD', category: 'fiat', text: 'SGD', logoType: 'image', logo: 'assets/logos/fiat/sg.svg', emoji: '🇸🇬' },
            { symbol: 'AED', category: 'fiat', text: 'AED', logoType: 'image', logo: 'assets/logos/fiat/ae.svg', emoji: '🇦🇪' },
            { symbol: 'HKD', category: 'fiat', text: 'HKD', logoType: 'image', logo: 'assets/logos/fiat/hk.svg', emoji: '🇭🇰' },
            { symbol: 'MYR', category: 'fiat', text: 'MYR', logoType: 'image', logo: 'assets/logos/fiat/my.svg', emoji: '🇲🇾' },
            // 实物（priceAmount 为以 priceCurrency 计价的单价）
            { symbol: 'IPHONE_DUO', category: 'product', text: 'iPhone Duo', logoType: 'image', logo: 'assets/logos/apple.png', emoji: '📱', priceAmount: 2000, priceCurrency: 'USD' },
            { symbol: 'IPHONE18_PRO', category: 'product', text: 'iPhone 18 Pro', logoType: 'image', logo: 'assets/logos/apple.png', emoji: '📱', priceAmount: 1199, priceCurrency: 'USD' },
            { symbol: 'IPHONE18_PRO_MAX', category: 'product', text: 'iPhone 18 Pro Max', logoType: 'image', logo: 'assets/logos/apple.png', emoji: '📱', priceAmount: 1299, priceCurrency: 'USD' },
            { symbol: 'PATEK', category: 'product', text: '嗯哼的百达斐丽', logoType: 'image', logo: 'assets/logos/enheng-patek.png', emoji: '⌚', priceAmount: 1200000, priceCurrency: 'CNY' },
            { symbol: 'XIAOXIAO_HOME', category: 'product', text: '小侠的新房', logoType: 'image', logo: 'assets/logos/xiaoxia-home.png', emoji: '🏠', priceAmount: 74540000, priceCurrency: 'CNY' },
            { symbol: 'FERRARI_SF90', category: 'product', text: '0xSun 的法拉利', logoType: 'image', logo: 'assets/logos/0xsun-ferrari.png', emoji: '🏎️', priceAmount: 8500000, priceCurrency: 'CNY' },
            { symbol: 'ZHUJIAO', category: 'product', text: '猪脚饭', logoType: 'emoji', logo: '🍚', priceAmount: 20, priceCurrency: 'CNY' },
            { symbol: 'KFC', category: 'product', text: 'KFC', logoType: 'image', logo: 'assets/logos/kfc.png', emoji: '🍗', priceAmount: 50, priceCurrency: 'CNY' },
            { symbol: 'IN11', category: 'product', text: 'in11 嫩模', logoType: 'emoji', logo: '💃', priceAmount: 3000, priceCurrency: 'CNY' },
        ];

        // 由 ASSET_CONFIG 派生的查询结构（避免在多处重复维护清单）
        const PRESET_CRYPTO_SYMBOLS = ASSET_CONFIG.filter((a) => a.category === 'crypto').map((a) => a.symbol);
        const FIAT_SYMBOLS = ASSET_CONFIG.filter((a) => a.category === 'fiat' && a.symbol !== 'USD').map((a) => a.symbol);
        const PRODUCT_ASSETS = ASSET_CONFIG.filter((a) => a.category === 'product');

        // 所有货币的 logo 和显示文本映射（供下拉菜单 / 分享图使用）
        const currencyLogos = Object.fromEntries(
            ASSET_CONFIG.map((a) => [a.symbol, { logo: a.logo, text: a.text, type: a.logoType }])
        );

        // 换算汇率：from→to = usdPrices[from] / usdPrices[to]
        function getConversionRate(from, to) {
            if (from === to) return 1;
            const a = usdPrices[from];
            const b = usdPrices[to];
            if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
            return a / b;
        }

        // ===== 换算栏位生成（6 个栏位由配置动态生成，HTML 只保留容器）=====
        const FIELD_COUNT = 6;
        // 每个栏位的默认币种（按顺序对应 currency1~currency6）
        const DEFAULT_CURRENCIES = ['BTC', 'ETH', 'SOL', 'USD', 'CNY', 'HKD'];
        // 下拉分组（顺序与原 HTML 一致）；加密货币组末尾追加“自定义代币”入口
        const SELECT_GROUPS = [
            { label: '加密货币', category: 'crypto', appendCustom: true },
            { label: '法币', category: 'fiat', appendCustomFiat: true },
            { label: '实物', category: 'product', appendCustomProduct: true },
        ];

        // 原生 <option> 文本：emoji 型用其 emoji（即 logo），图片型用单独的 emoji 字段
        function optionLabelFor(asset) {
            const emoji = asset.logoType === 'emoji' ? asset.logo : asset.emoji;
            return emoji ? `${emoji} ${asset.text}` : asset.text;
        }

        // 用 ASSET_CONFIG 填充单个 <select> 的 optgroup/option
        function populateCurrencySelect(select, defaultValue) {
            for (const group of SELECT_GROUPS) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;
                optgroup.setAttribute('data-category', group.category);

                for (const asset of ASSET_CONFIG) {
                    if (asset.category !== group.category) continue;
                    const opt = document.createElement('option');
                    opt.value = asset.symbol;
                    opt.textContent = optionLabelFor(asset);
                    if (asset.symbol === defaultValue) opt.selected = true;
                    optgroup.appendChild(opt);
                }

                if (group.appendCustom) {
                    const custom = document.createElement('option');
                    custom.value = 'CUSTOM';
                    custom.textContent = '🔍 自定义代币';
                    optgroup.appendChild(custom);
                    // 隐藏占位项：用于手机端重复选择“自定义代币”时仍能触发 change
                    const placeholder = document.createElement('option');
                    placeholder.value = 'TEMP_CUSTOM_PLACEHOLDER';
                    placeholder.style.display = 'none';
                    optgroup.appendChild(placeholder);
                }

                if (group.appendCustomFiat) {
                    const customFiat = document.createElement('option');
                    customFiat.value = 'CUSTOM_FIAT';
                    customFiat.textContent = '🔍 自定义法币';
                    optgroup.appendChild(customFiat);
                }
                if (group.appendCustomProduct) {
                    const option = document.createElement('option');
                    option.value = 'CUSTOM_PRODUCT'; option.textContent = '＋ 自定义实物';
                    optgroup.appendChild(option);
                }
                select.appendChild(optgroup);
            }
        }

        // 生成 6 个换算栏位（.field > .select-wrapper > select 与同级 input），插入容器
        function buildCurrencyFields() {
            const host = document.getElementById('currencyFields');
            if (!host || host.childElementCount > 0) return;

            for (let i = 1; i <= FIELD_COUNT; i++) {
                const field = document.createElement('div');
                field.className = 'field';

                const wrapper = document.createElement('div');
                wrapper.className = 'select-wrapper';

                const select = document.createElement('select');
                select.id = `currency${i}`;
                select.setAttribute('aria-label', `第 ${i} 栏单位`);
                populateCurrencySelect(select, DEFAULT_CURRENCIES[i - 1]);
                wrapper.appendChild(select);

                const input = document.createElement('input');
                input.type = 'text';
                input.id = `amount${i}`;
                input.placeholder = '输入金额';
                input.setAttribute('aria-label', `第 ${i} 栏金额`);
                input.setAttribute('autocomplete', 'off');
                input.setAttribute('spellcheck', 'false');

                field.appendChild(wrapper);
                field.appendChild(input);
                host.appendChild(field);
            }
        }

		        // ===== 数字显示格式化（用于结果展示）=====
		        function toPlainDecimalString(num) {
		            const s = String(num);
		            if (!/[eE]/.test(s)) return s;

		            const [coeffRaw, expRaw] = s.toLowerCase().split('e');
		            const exp = parseInt(expRaw, 10);

		            let coeff = coeffRaw;
		            let sign = '';
		            if (coeff.startsWith('-')) {
		                sign = '-';
		                coeff = coeff.slice(1);
		            }

		            const parts = coeff.split('.');
		            const intPart = parts[0] || '0';
		            const fracPart = parts[1] || '';
		            const digits = (intPart + fracPart).replace(/^0+(?=\d)/, '') || '0';

		            if (exp >= 0) {
		                const zeros = exp - fracPart.length;
		                if (zeros >= 0) return sign + digits + '0'.repeat(zeros);
		                const idx = intPart.length + exp;
		                return sign + digits.slice(0, idx) + '.' + digits.slice(idx);
		            }

		            const zeros = (-exp) - intPart.length;
		            if (zeros >= 0) return sign + '0.' + '0'.repeat(zeros) + digits;
		            const idx = intPart.length + exp; // exp 为负
		            return sign + digits.slice(0, idx) + '.' + digits.slice(idx);
		        }

			        function formatNumberForDisplay(input) {
			            const n = typeof input === 'number' ? input : Number(input);
			            if (!Number.isFinite(n) || n === 0) return '0';

		            const sign = n < 0 ? '-' : '';
		            const abs = Math.abs(n);

		            const groupThousands = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

		            // 规则 1：>= 1，最多 2 位小数（四舍五入），不固定小数位
		            if (abs >= 1) {
		                const rounded = Math.round((abs + Number.EPSILON) * 100) / 100;
		                let s = rounded.toFixed(2).replace(/\.?0+$/, '');
		                const [i, f] = s.split('.');
		                return sign + groupThousands(i) + (f ? `.${f}` : '');
		            }

		            // 规则 2：0 < n < 1，显示到 2 个有效数字（按示例：截断到第 2 个有效数字，不使用科学计数法）
		            const plain = toPlainDecimalString(abs);
		            const frac = (plain.split('.')[1] || '').replace(/[^\d]/g, '');
		            const firstNonZero = frac.search(/[1-9]/);
		            if (firstNonZero === -1) return '0';

		            const cut = Math.min(frac.length, firstNonZero + 2);
		            const shown = frac.slice(0, cut);
			            return sign + '0.' + shown;
			        }

			        // ===== 输入框表达式解析（用于 amount 输入框）=====
			        // 允许：数字、小数点、千分位逗号、空格、括号，以及 + - * /
			        // 目标：让用户可以输入如 "1+2*3" 并用于换算；不使用 eval，避免安全风险。
			        function normalizeMathInput(raw) {
			            if (raw == null) return '';
			            let s = String(raw);
			            // 常见全角/替代符号归一
			            s = s
			                .replace(/＋/g, '+')
			                .replace(/－/g, '-')
			                .replace(/—/g, '-') // 长横
			                .replace(/×/g, '*')
			                .replace(/✕/g, '*')
			                .replace(/÷/g, '/')
			                .replace(/（/g, '(')
			                .replace(/）/g, ')');
			            return s;
			        }

			        function isLikelyPlainNumberInput(raw) {
			            const s = normalizeMathInput(raw).trim();
			            // 允许：可选负号 + 数字/逗号 + 可选小数（不允许其他运算符）
			            return /^-?[\d,]*\.?\d*$/.test(s) && !/[+*/()]/.test(s);
			        }

			        function evaluateMathExpression(raw) {
			            const s0 = normalizeMathInput(raw);
			            const s = s0.replace(/,/g, '');
			            if (!s.trim()) return NaN;

			            // 只允许白名单字符：数字/小数点/运算符/括号/空格
			            if (/[^0-9+\-*/().\s]/.test(s)) return NaN;

			            // Tokenize
			            /** @type {{type:'num',value:number}|{type:'op',value:string}|{type:'paren',value:'(' | ')'}[]} */
			            const tokens = [];
			            let i = 0;
			            while (i < s.length) {
			                const ch = s[i];
			                if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			                    i++;
			                    continue;
			                }
			                if (ch === '(' || ch === ')') {
			                    tokens.push({ type: 'paren', value: ch });
			                    i++;
			                    continue;
			                }
			                if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
			                    tokens.push({ type: 'op', value: ch });
			                    i++;
			                    continue;
			                }
			                if ((ch >= '0' && ch <= '9') || ch === '.') {
			                    let j = i;
			                    let dotCount = 0;
			                    while (j < s.length) {
			                        const c = s[j];
			                        if (c === '.') {
			                            dotCount++;
			                            if (dotCount > 1) break;
			                            j++;
			                            continue;
			                        }
			                        if (c >= '0' && c <= '9') {
			                            j++;
			                            continue;
			                        }
			                        break;
			                    }
			                    const numStr = s.slice(i, j);
			                    if (numStr === '.' || numStr === '') return NaN;
			                    const num = Number(numStr);
			                    if (!Number.isFinite(num)) return NaN;
			                    tokens.push({ type: 'num', value: num });
			                    i = j;
			                    continue;
			                }
			                return NaN;
			            }

			            // Shunting-yard -> RPN
			            const out = [];
			            const ops = [];
			            const precedence = (op) => (op === 'u+' || op === 'u-' ? 3 : op === '*' || op === '/' ? 2 : 1);
			            const isRightAssoc = (op) => op === 'u+' || op === 'u-';

			            let prevType = 'start'; // start | num | op | '(' | ')'
			            for (const t of tokens) {
			                if (t.type === 'num') {
			                    out.push(t);
			                    prevType = 'num';
			                    continue;
			                }
			                if (t.type === 'paren') {
			                    if (t.value === '(') {
			                        ops.push({ type: 'paren', value: '(' });
			                        prevType = '(';
			                    } else {
			                        // pop until '('
			                        while (ops.length) {
			                            const top = ops.pop();
			                            if (top.type === 'paren' && top.value === '(') break;
			                            out.push(top);
			                        }
			                        prevType = ')';
			                    }
			                    continue;
			                }
			                if (t.type === 'op') {
			                    let op = t.value;
			                    // unary +/-
			                    if ((op === '+' || op === '-') && (prevType === 'start' || prevType === 'op' || prevType === '(')) {
			                        op = op === '+' ? 'u+' : 'u-';
			                    }
			                    while (ops.length) {
			                        const top = ops[ops.length - 1];
			                        if (top.type === 'paren') break;
			                        const topOp = top.value;
			                        const p1 = precedence(op);
			                        const p2 = precedence(topOp);
			                        if (p2 > p1 || (p2 === p1 && !isRightAssoc(op))) {
			                            out.push(ops.pop());
			                            continue;
			                        }
			                        break;
			                    }
			                    ops.push({ type: 'op', value: op });
			                    prevType = 'op';
			                    continue;
			                }
			            }
			            while (ops.length) out.push(ops.pop());

			            // Eval RPN
			            const stack = [];
			            for (const t of out) {
			                if (t.type === 'num') {
			                    stack.push(t.value);
			                    continue;
			                }
			                if (t.type === 'op') {
			                    if (t.value === 'u+' || t.value === 'u-') {
			                        if (stack.length < 1) return NaN;
			                        const a = stack.pop();
			                        stack.push(t.value === 'u-' ? -a : +a);
			                        continue;
			                    }
			                    if (stack.length < 2) return NaN;
			                    const b = stack.pop();
			                    const a = stack.pop();
			                    let r;
			                    switch (t.value) {
			                        case '+':
			                            r = a + b;
			                            break;
			                        case '-':
			                            r = a - b;
			                            break;
			                        case '*':
			                            r = a * b;
			                            break;
			                        case '/':
			                            r = a / b;
			                            break;
			                        default:
			                            return NaN;
			                    }
			                    if (!Number.isFinite(r)) return NaN;
			                    stack.push(r);
			                    continue;
			                }
			                return NaN;
			            }
			            if (stack.length !== 1) return NaN;
			            return stack[0];
			        }

			        function parseAmountInputToNumber(raw) {
			            const s = normalizeMathInput(raw);
			            if (!s.trim()) return NaN;
			            if (isLikelyPlainNumberInput(s)) {
			                const n = Number(s.replace(/,/g, ''));
			                return Number.isFinite(n) ? n : NaN;
			            }
			            return evaluateMathExpression(s);
			        }
		        
		        // ===== API / 缓存工具 =====
		        const CACHE_VERSION = 2;
		        const CACHE_KEYS = {
            fiatRates: `valueConverter:caches:v${CACHE_VERSION}:fiatRates`,
            coingeckoTokenPrice: `valueConverter:caches:v${CACHE_VERSION}:coingeckoTokenPrice`
        };
        const memoryCache = new Map();
        function nowMs() { return Date.now(); }
        function readCache(key, maxAgeMs) {
            let raw = memoryCache.get(key);
            if (!raw && localStorageAvailable) {
                try { raw = localStorage.getItem(key); } catch { /* 内存缓存仍可用 */ }
            }
            try {
                const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (!payload || !Number.isFinite(payload.ts)) return null;
                if (maxAgeMs >= 0 && nowMs() - payload.ts > maxAgeMs) return null;
                return payload;
            } catch { return null; }
        }
        function writeCache(key, data) {
            const payload = { ts: nowMs(), data };
            memoryCache.set(key, payload);
            if (localStorageAvailable) {
                try { localStorage.setItem(key, JSON.stringify(payload)); } catch { /* 满额时使用内存 */ }
            }
        }

        function formatAge(ts) {
	            const diffSec = Math.max(0, Math.floor((nowMs() - ts) / 1000));
	            if (diffSec < 60) return `${diffSec}秒前`;
	            const diffMin = Math.floor(diffSec / 60);
	            if (diffMin < 60) return `${diffMin}分钟前`;
	            const diffHr = Math.floor(diffMin / 60);
	            return `${diffHr}小时前`;
	        }
	        
	        async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
	            const controller = new AbortController();
	            const timeout = setTimeout(() => controller.abort(), timeoutMs);
	            try {
	                const res = await fetch(url, { ...options, signal: controller.signal });
	                return res;
	            } finally {
	                clearTimeout(timeout);
	            }
	        }
	        
		        // ===== CoinGecko：统一币价、请求去重与限流退避 =====
        const COINGECKO_COIN_IDS = {
            BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', OKB: 'okb'
        };
        const coinGeckoInFlight = new Map();
        let coinGeckoBackoffUntil = 0;
        const PRICE_TTL_MS = 60 * 1000;
        const PRICE_MAX_AGE_MS = 15 * 60 * 1000;

        function normalizeTokenLogo(raw) {
            if (typeof raw !== 'string' || !raw.trim()) return '';
            try {
                const url = new URL(raw);
                if (url.protocol !== 'https:' || url.username || url.password) return '';
                // 仅迁移已知 CoinGecko 币种图片路径，保留路径及版本参数。
                if (url.hostname === 'assets.coingecko.com' && url.pathname.startsWith('/coins/images/')) {
                    url.hostname = 'coin-images.coingecko.com';
                }
                return url.href;
            } catch { return ''; }
        }

        function fetchCoinGeckoJson(path, params) {
            const url = `https://api.coingecko.com/api/v3/${path}?${new URLSearchParams(params)}`;
            if (coinGeckoInFlight.has(url)) return coinGeckoInFlight.get(url);
            if (nowMs() < coinGeckoBackoffUntil) {
                return Promise.reject(Object.assign(new Error('CoinGecko 请求过于频繁，请稍后重试'), { status: 429 }));
            }
            const request = (async () => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                try {
                    const response = await fetch(url, { signal: controller.signal, mode: 'cors', credentials: 'omit' });
                    if (!response.ok) {
                        if (response.status === 429) {
                            const header = response.headers.get('Retry-After');
                            const seconds = Number(header);
                            const delay = header && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - nowMs();
                            coinGeckoBackoffUntil = nowMs() + Math.max(60000, Number.isFinite(delay) ? delay : 0);
                        }
                        throw Object.assign(new Error(`CoinGecko 请求失败 (${response.status})`), { status: response.status });
                    }
                    const data = await response.json(); // 超时覆盖响应体解析
                    apiStatus.coingecko = true;
                    return data;
                } catch (error) {
                    apiStatus.coingecko = false;
                    throw error;
                } finally { clearTimeout(timeout); }
            })().finally(() => coinGeckoInFlight.delete(url));
            coinGeckoInFlight.set(url, request);
            return request;
        }

        async function getCoinGeckoPrices(ids, { forceRefresh = false } = {}) {
            const uniqueIds = [...new Set(ids.filter(id => typeof id === 'string' && id))].sort();
            const keyFor = id => `${CACHE_KEYS.coingeckoTokenPrice}:${id}`;
            const valid = entry => Number.isFinite(entry?.data?.price) && entry.data.price > 0 && !entry.data.isEstimated;
            const missing = uniqueIds.filter(id => forceRefresh || !valid(readCache(keyFor(id), PRICE_TTL_MS)));
            let error = null;
            const refreshed = new Set();
            if (missing.length) {
                try {
                    const data = await fetchCoinGeckoJson('simple/price', {
                        ids: missing.join(','), vs_currencies: 'usd', include_last_updated_at: 'true'
                    });
                    for (const id of missing) {
                        const price = data?.[id]?.usd;
                        const updatedAt = data?.[id]?.last_updated_at;
                        if (!Number.isFinite(price) || price <= 0) continue;
                        // 拒绝明确过期的上游报价；未返回时间时以本次获取时间计。
                        if (updatedAt && nowMs() - updatedAt * 1000 > PRICE_MAX_AGE_MS) continue;
                        writeCache(keyFor(id), { price, updatedAt });
                        refreshed.add(id);
                    }
                } catch (e) { error = e; }
            }
            const prices = {}, staleIds = [], missingIds = [];
            for (const id of uniqueIds) {
                const cached = readCache(keyFor(id), PRICE_MAX_AGE_MS);
                if (!valid(cached) || (cached.data.updatedAt && nowMs() - cached.data.updatedAt * 1000 > PRICE_MAX_AGE_MS)) {
                    missingIds.push(id);
                    continue;
                }
                prices[id] = cached.data.price;
                if ((missing.includes(id) && !refreshed.has(id)) || nowMs() - cached.ts >= PRICE_TTL_MS) staleIds.push(id);
            }
            return { prices, staleIds, missingIds, error };
        }

        async function getFiatRates({ forceRefresh = false } = {}) {
	            const TTL_MS = 6 * 60 * 60 * 1000; // 6小时：法币汇率更新没那么频繁
	            if (!forceRefresh) {
	                const cached = readCache(CACHE_KEYS.fiatRates, TTL_MS);
	                if (cached?.data) {
	                    return { fiatData: cached.data, source: 'cache', ts: cached.ts };
	                }
	            }
	            
	            const url = 'https://api.exchangerate-api.com/v4/latest/USD';
	            const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 8000);
	            if (!res.ok) {
	                const error = new Error(`ExchangeRate 请求失败: ${res.status}`);
	                error.status = res.status;
	                throw error;
	            }
	            
	            const fiatData = await res.json();
	            if (!fiatData?.rates) throw new Error('ExchangeRate 返回数据异常');
	            
	            writeCache(CACHE_KEYS.fiatRates, fiatData);
	            return { fiatData, source: 'realtime', ts: nowMs() };
	        }
	        
	        // PWA 添加到主屏幕功能
	        let deferredPrompt;
	        const addToHomeBtn = document.getElementById('addToHomeBtn');
	        const shareBtn = document.getElementById('shareBtn');

        // 显示 Toast 提示
        function showToast(message) {
            const toast = document.getElementById('shareToast');
            if (toast) {
	                if (message) {
	                    const textEl = toast.querySelector('.toast-text');
	                    if (textEl) textEl.textContent = message;
	                }

                // 显示 toast
                toast.classList.add('show');

                // 3秒后自动隐藏
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000);
            }
        }
        
	        function getShareRows() {
	            const rows = [];

	            for (let i = 1; i <= 6; i++) {
	                const amountEl = document.getElementById(`amount${i}`);
	                const selectEl = document.getElementById(`currency${i}`);
	                if (!amountEl || !selectEl) continue;
                
                const rawAmount = (amountEl.value || '').trim();
                if (!rawAmount) continue;
                
                let label = '';
	                let logoType = 'none';
	                let logo = '';
	                let value = selectEl.value;

	                
	                if (value === 'CUSTOM') {
	                    const customOption = selectEl.querySelector('option[value="CUSTOM"]');
	                    const displayText = customOption?.getAttribute('data-display-text');
	                    label = displayText ? `${displayText}` : '自定义代币';
	                    // 新版 CoinGecko 图片支持 CORS；加载失败时只省略 Logo。
                        logo = normalizeTokenLogo(customOption?.getAttribute('data-token-logo'));
                        logoType = logo ? 'image' : 'none';
	                } else {
	                    // 优先使用与界面一致的映射（emoji/logo + 显示文本）
	                    const mapped = (typeof currencyLogos !== 'undefined') ? currencyLogos[value] : null;
	                    if (mapped) {
	                        label = mapped.text || value;
	                        // 预设加密货币 logo 已本地化（同源），可与实物/法币一样绘入分享图
	                        if (mapped.type === 'image' && mapped.logo) {
	                            logoType = 'image';
	                            logo = mapped.logo;
	                        } else if (mapped.type === 'emoji' && mapped.logo) {
	                            logoType = 'emoji';
	                            logo = mapped.logo;
	                        } else {
	                            logoType = 'none';
	                            logo = '';
	                        }
	                    } else {
	                        const opt = selectEl.querySelector(`option[value="${CSS.escape(value)}"]`);
	                        label = (opt?.textContent || value).trim();
	                    }
	                }
	                
	                rows.push({
	                    index: i,
	                    label,
	                    amount: rawAmount,
	                    value,

	                    logoType,
	                    logo
	                });
	            }
	            return rows;
	        }
        
	        function formatShareTimestamp() {
	            const d = new Date();
	            const pad = (n) => String(n).padStart(2, '0');
	            return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ･ ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	        }
        
        function roundRect(ctx, x, y, w, h, r) {
            const radius = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + w, y, x + w, y + h, radius);
            ctx.arcTo(x + w, y + h, x, y + h, radius);
            ctx.arcTo(x, y + h, x, y, radius);
            ctx.arcTo(x, y, x + w, y, radius);
            ctx.closePath();
        }

	        function drawCircleLogo(ctx, { x, y, size, logoType, logo, bitmap, isDark }) {
	            const r = size / 2;
	            ctx.save();
            
            // 背景圆
            roundRect(ctx, x - r, y - r, size, size, r);
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.18)' : '#ffffff';
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.28)' : '#d2d2d7';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // 内容
            if (logoType === 'image' && bitmap) {
                ctx.beginPath();
                ctx.arc(x, y, r - 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(bitmap, x - (r - 2), y - (r - 2), (r - 2) * 2, (r - 2) * 2);
            } else if (logoType === 'emoji' && logo) {
                ctx.fillStyle = isDark ? '#ffffff' : '#1d1d1f';
                ctx.font = `400 ${Math.floor(size * 0.52)}px "PingFang SC"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(logo, x, y + 1);
            } else {
                ctx.fillStyle = isDark ? '#ffffff' : '#1d1d1f';
                ctx.font = `400 ${Math.floor(size * 0.34)}px "PingFang SC"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('•', x, y);
            }
            
	            ctx.restore();
	        }

	        // 分享图专用：绘制无圆框的 Logo（仅绘制内容本身）
	        function drawInlineLogo(ctx, { x, y, size, logoType, logo, bitmap }) {
	            ctx.save();
	            if (logoType === 'image' && bitmap) {
	                const r = size / 2;
	                ctx.beginPath();
	                ctx.arc(x, y, r, 0, Math.PI * 2);
	                ctx.closePath();
	                ctx.clip();
	                ctx.drawImage(bitmap, x - r, y - r, size, size);
	            } else if (logoType === 'emoji' && logo) {
	                ctx.font = `400 ${Math.floor(size * 0.9)}px "PingFang SC"`;
	                ctx.textAlign = 'center';
	                ctx.textBaseline = 'alphabetic';
                    const metrics = ctx.measureText(logo);
                    const ascent = metrics.actualBoundingBoxAscent ?? size * 0.72;
                    const descent = metrics.actualBoundingBoxDescent ?? size * 0.18;
                    ctx.fillText(logo, x, y + (ascent - descent) / 2);
	            }
	            ctx.restore();
	        }

	        const shareLogoCache = new Map();
        async function preloadShareLogoBitmaps(rows) {
            const sources = [...new Set(rows.filter(row => row.logoType === 'image' && row.logo).map(row => row.logo))];
            const bitmaps = new Map();
            await Promise.all(sources.map(async src => {
                if (!shareLogoCache.has(src)) {
                    const pending = (async () => {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 5000);
                        let objectUrl;
                        try {
                            // 避免复用界面 <img> 以 no-cors 加载留下的浏览器缓存。
                            const response = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
                            if (!response.ok) throw new Error('Logo unavailable');
                            const blob = await response.blob();
                            if (!blob.type.startsWith('image/') || blob.size > 5 * 1024 * 1024) throw new Error('Invalid logo');
                            objectUrl = URL.createObjectURL(blob);
                            const img = new Image();
                            await new Promise((resolve, reject) => {
                                const onAbort = () => { img.src = ''; reject(new Error('Logo timeout')); };
                                controller.signal.addEventListener('abort', onAbort, { once: true });
                                img.onload = () => { controller.signal.removeEventListener('abort', onAbort); resolve(); };
                                img.onerror = () => { controller.signal.removeEventListener('abort', onAbort); reject(new Error('Logo decode failed')); };
                                if (controller.signal.aborted) return onAbort();
                                img.src = objectUrl;
                            });
                            return img;
                        } finally {
                            clearTimeout(timeout);
                            if (objectUrl) URL.revokeObjectURL(objectUrl);
                        }
                    })();
                    shareLogoCache.set(src, pending);
                    if (shareLogoCache.size > 32) shareLogoCache.delete(shareLogoCache.keys().next().value);
                }
                try { bitmaps.set(src, await shareLogoCache.get(src)); }
                catch (error) {
                    console.warn('分享图 Logo 加载失败，使用文字', error);
                    shareLogoCache.delete(src); bitmaps.set(src, null);
                }
            }));
            return bitmaps;
        }

        // 行是否有可绘制的 logo（image 需 bitmap 已加载成功；emoji 需有字符）
	        function rowHasDrawableLogo(row) {
	            if (!row) return false;
	            if (row.logoType === 'emoji') return !!row.logo;
	            if (row.logoType === 'image') return !!row.bitmap;
	            return false;
	        }

	        async function generateSharePngBlob() {
	            const rows = getShareRows();
	            if (rows.length === 0) {
	                throw new Error('没有可分享的换算结果（请先输入任意金额）');
	            }
	            const logoBitmaps = await preloadShareLogoBitmaps(rows);
	            const rowsForShare = rows.map((row) => ({
	                ...row,
	                bitmap: row.logoType === 'image' ? (logoBitmaps.get(row.logo) || null) : null
	            }));

			            // 横向分享图（landscape）
			            const BASE_W = 1350;
			            const MAX_W = 20000; // 允许更宽的分享图（受浏览器/设备画布上限影响）
			            let W = BASE_W;
			            const scale = 2;
			            const ACCENT = '#FF9F0A'; // Apple 系统橘色（偏计算器风格）
		            const BG = '#000000';
		            const SURFACE = '#000000';
		            const TEXT = '#F5F5F7';
		            const MUTED = '#8E8E93';
		            const BORDER = '#2C2C2E';
			            const PILL_BG = '#1C1C1E';

			            // 动态高度：根据实际有值的行数收缩画布，避免底部大段空白
			            const marginScale = 0.5; // 留白减少 50%
			            const pad = Math.round(72 * marginScale);
			            const sideInset = Math.round(56 * marginScale);
			            const metaTopOffset = 30;
				            const metaLineStep = 37;
			            const titleBaselineOffset = 130; // 避免与左上角信息重叠
			            const afterTitleToRows = 70;
				            const baseLineH = 104;
				            const basePillH = 86;
				            const SOURCE_ROW_SCALE = 2; // 第一行（源值）整体放大倍数
				            const SECONDARY_AMOUNT_SCALE = 1.44; // 第2～6行数字放大比例（缩小 20%）
				            const PRIMARY_TEXT_SCALE = 2;
				            const primaryAmountFontSizeForLayout = Math.round(36 * SOURCE_ROW_SCALE * PRIMARY_TEXT_SCALE);
				            const primaryTickerFontSizeForLayout = Math.round(34 * SOURCE_ROW_SCALE * 0.7 * PRIMARY_TEXT_SCALE);
				            const primaryPillHForLayout = Math.max(
				                basePillH * SOURCE_ROW_SCALE,
				                Math.round(primaryAmountFontSizeForLayout * 1.05 + primaryTickerFontSizeForLayout * 1.05 + 28)
				            );
						            const maxRows = Math.min(6, rowsForShare.length);
					            const colGap = Math.round(56 * marginScale);
					            const baseTotalInnerW = BASE_W - pad * 2 - sideInset * 2;
					            const minLeftColW = 420;
					            const minRightColW = 320;
					            const leftColWBase = Math.max(minLeftColW, Math.floor((baseTotalInnerW - colGap) * 0.55));
					            const rightColWBase = Math.max(minRightColW, baseTotalInnerW - colGap - leftColWBase);

					            // 动态增宽：当主体/副体出现大位数数字时，图片宽度随之变宽以保证完整显示
					            const chainForMeasure = rowsForShare.slice(0, maxRows);
					            const primaryForMeasure = chainForMeasure[0];
					            const secondaryForMeasure = chainForMeasure.slice(1);

					            const mctx = document.createElement('canvas').getContext('2d');
					            const measureText = (font, text) => {
					                mctx.font = font;
					                return mctx.measureText(String(text ?? '')).width;
					            };

					            let requiredLeftColW = leftColWBase;
					            let requiredRightColW = rightColWBase;

						            if (primaryForMeasure) {
						                const shouldDrawLogo = rowHasDrawableLogo(primaryForMeasure);
						                const amountFont = `400 ${primaryAmountFontSizeForLayout}px "PingFang SC"`;
						                const tickerFont = `400 ${primaryTickerFontSizeForLayout}px "PingFang SC"`;
						                const amountW = measureText(amountFont, primaryForMeasure.amount);
						                const tickerLabel = primaryForMeasure.label;
						                const tickerW = measureText(tickerFont, tickerLabel);
						                const logoW = shouldDrawLogo ? ((44 * SOURCE_ROW_SCALE) + (12 * SOURCE_ROW_SCALE)) : 0;
						                const rowW = Math.max(amountW, logoW + tickerW) + 20;
						                requiredLeftColW = Math.max(requiredLeftColW, rowW);
						            }

						            if (secondaryForMeasure.length > 0) {
						                const prefixFont = '400 30px "PingFang SC"';
						                const tickerFont = '400 34px "PingFang SC"';
						                const amountFont = `400 ${Math.round(36 * SECONDARY_AMOUNT_SCALE)}px "PingFang SC"`;
						                const padX = 22;
						                const iconSize = 44;
						                const iconGap = 12;
					                const prefix = '约等于 ≈';
					                const prefixW = measureText(prefixFont, prefix) + 14;

					                for (const r of secondaryForMeasure) {
					                    const shouldDrawLogo = rowHasDrawableLogo(r);
					                    const amountW = measureText(amountFont, r.amount) + 14;
					                    const tickerLabel = r.label;
					                    const tickerW = measureText(tickerFont, tickerLabel);
					                    const logoW = shouldDrawLogo ? (iconSize + iconGap) : 0;
					                    const rowW = padX + prefixW + amountW + logoW + tickerW + padX + 20;
					                    requiredRightColW = Math.max(requiredRightColW, rowW);
					                }
					            }

					            const requiredTotalInnerW = requiredLeftColW + colGap + requiredRightColW;
					            if (requiredTotalInnerW > baseTotalInnerW) {
					                W = Math.min(MAX_W, BASE_W + Math.ceil(requiredTotalInnerW - baseTotalInnerW));
					            }

					            const totalInnerW = W - pad * 2 - sideInset * 2;
					            let rightColW = Math.max(
					                minRightColW,
					                Math.min(totalInnerW - colGap - minLeftColW, requiredRightColW)
					            );
					            let leftColW = totalInnerW - colGap - rightColW;
					            if (leftColW < requiredLeftColW) {
					                leftColW = Math.max(requiredLeftColW, minLeftColW);
					                rightColW = totalInnerW - colGap - leftColW;
					                if (rightColW < minRightColW) {
					                    rightColW = minRightColW;
					                    leftColW = totalInnerW - colGap - rightColW;
					                }
					            }

					            const rowsStartY = pad + titleBaselineOffset + afterTitleToRows;
					            const lineGap = 18;
					            const primaryLineH = Math.max(baseLineH, primaryPillHForLayout + lineGap);
				            const secondaryLineH = Math.max(baseLineH, basePillH + lineGap);
				            const secondaryCount = Math.max(0, maxRows - 1);
				            const leftHeight = primaryLineH;
				            const rightHeight = secondaryCount * secondaryLineH;
			            const rowsHeight = Math.max(leftHeight, rightHeight);
			            const bottomInside = Math.round(56 * marginScale * 0.5); // 下方留白再减少 50%
			            const cardH = Math.max(360, Math.ceil((rowsStartY - pad) + rowsHeight + bottomInside));
			            const H = cardH + pad * 2;
	            
	            const canvas = document.createElement('canvas');
	            canvas.width = W * scale;
	            canvas.height = H * scale;
	            const ctx = canvas.getContext('2d');
	            ctx.scale(scale, scale);
            
            // 背景
	            ctx.fillStyle = BG;
	            ctx.fillRect(0, 0, W, H);
            
	            // 画布内容区域（不再绘制外层卡片边框）
		            const cardX = pad;
		            const cardY = pad;
		            const cardW = W - pad * 2;
		            // cardH 已按内容动态计算
            
		            // 标题
			            const titleX = cardX + sideInset;
			            const titleRightX = cardX + cardW - sideInset;
			            let cursorY = cardY + titleBaselineOffset;
			            
					            const shareTitle = '价值观纠正器';
					            const titleFontSize = 101;
					            ctx.fillStyle = TEXT;
					            ctx.font = `400 ${titleFontSize}px "PingFang SC"`;
					            ctx.fillText(shareTitle, titleX, cursorY);
				            
				            // 右上角信息（与标题最顶部对齐）
				            const titleMetrics = ctx.measureText(shareTitle);
				            const titleAscent = titleMetrics.actualBoundingBoxAscent ?? Math.round(titleFontSize * 0.85);
				            const titleTopY = cursorY - titleAscent;
					            const metaYOffset = Math.round(titleFontSize * 0.1); // 日期 + GitHub 整体下移 10%
					            
					            ctx.textAlign = 'right';
				            ctx.fillStyle = 'rgba(245,245,247,0.7)';
					            const githubLine = 'https://github.com/wolfyxbt/ValuesCorrector';
					            const dateLine = `${formatShareTimestamp()}`;
				            
				            const dateFontSize = 28; // 日期字体缩小 5%（约 29 -> 28）
				            const githubFontSize = 24; // GitHub 字体放大 10%（约 22 -> 24）
				            
				            ctx.font = `400 ${dateFontSize}px "PingFang SC"`;
				            const dateMetrics = ctx.measureText(dateLine);
				            const dateAscent = dateMetrics.actualBoundingBoxAscent ?? Math.round(dateFontSize * 0.85);
				            const dateY = titleTopY + dateAscent + metaYOffset;
				            ctx.fillText(dateLine, titleRightX, dateY);
				            
				            ctx.font = `400 ${githubFontSize}px "PingFang SC"`;
				            ctx.fillText(githubLine, titleRightX, dateY + metaLineStep);
			            
				            // 梯形/阶梯布局：第一行源值，其余行以“约等于 ≈”开头并逐行右移
				            cursorY += afterTitleToRows;
				            const rowsBottomLimit = cardY + cardH - bottomInside;
				            // 结构：第一行（主体）在左侧，其余行（副体）在右侧
				            const leftX = titleX;
				            const rightX = titleRightX - rightColW;
			            // 顺序：严格保持与 UI 显示一致（1→6）
			            const chain = rowsForShare.slice(0, maxRows);
			            const primaryRow = chain[0];
			            const secondaryRows = chain.slice(1);
			            // baseLineH/basePillH/SOURCE_ROW_SCALE 已在上方用于动态高度计算
			            
			            function ellipsize(text, maxWidth) {
			                if (ctx.measureText(text).width <= maxWidth) return text;
			                let t = text;
		                while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
		                    t = t.slice(0, -1);
		                }
		                return t + '…';
		            }
		            
					            function drawRow({ row, x, yTop, w, scale, showPrefix }) {
					                const primaryTextScale = showPrefix ? 1 : PRIMARY_TEXT_SCALE; // 第一个换算单位“数字+单位”放大 200%
					                const amountFontSize = Math.round(36 * scale * (showPrefix ? SECONDARY_AMOUNT_SCALE : 1) * primaryTextScale);
					                const tickerFontSize = Math.round(34 * scale * (showPrefix ? 1 : 0.7) * primaryTextScale);
					                const pillH = showPrefix
					                    ? (basePillH * scale)
					                    : Math.max(basePillH * scale, Math.round(amountFontSize * 1.05 + tickerFontSize * 1.05 + 28));
					                const yMid = yTop + pillH / 2;
					                // 主体行（不显示 prefix）需要与标题左边缘对齐：去掉左侧内缩
					                const padX = showPrefix ? (22 * scale) : 0;
					                const iconSize = 44 * scale;
					                const iconGap = 12 * scale;
					                const textStartX = x + padX;
					                const textY = yMid + (12 * scale) + (showPrefix ? 0 : Math.round(pillH * 0.2)); // 主体行下移 20%
				                const shouldDrawLogo = rowHasDrawableLogo(row);
				                const prefix = showPrefix ? '约等于 ≈' : '';
				                const getTextCenterOffset = (fontSize, text) => {
				                    const metrics = ctx.measureText(text || 'Hg');
				                    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
				                        ? metrics.actualBoundingBoxAscent
				                        : fontSize * 0.8;
				                    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
				                        ? metrics.actualBoundingBoxDescent
				                        : fontSize * 0.2;
				                    return (ascent - descent) / 2;
				                };
				                
				                ctx.textAlign = 'left';
				                ctx.textBaseline = 'alphabetic';
				                let cursorX = textStartX;
				                
					                if (prefix) {
					                    ctx.fillStyle = TEXT;
					                    ctx.font = '400 30px "PingFang SC"';
					                    // Align visible glyph centers, since the amount and label use different font sizes.
                                ctx.fillText(prefix, cursorX, yMid + getTextCenterOffset(30, prefix));
					                    cursorX += ctx.measureText(prefix).width + 14;
					                }
				                
						                // amount
						                ctx.fillStyle = ACCENT;
						                ctx.font = `400 ${amountFontSize}px "PingFang SC"`;
						                let reservedTail = 0;
						                const tickerLabel = row.label;
						                if (showPrefix) {
						                    const prevFont = ctx.font;
						                    ctx.font = `400 ${tickerFontSize}px "PingFang SC"`;
						                    const tickerW = ctx.measureText(tickerLabel).width;
						                    ctx.font = prevFont;
						                    reservedTail = (shouldDrawLogo ? (iconSize + iconGap) : 0) + tickerW + 20;
						                }
					                const amountMaxW = Math.max(140, w - (cursorX - x) - reservedTail);
					                const amountText = ellipsize(row.amount, amountMaxW);
					                ctx.fillText(amountText, cursorX, showPrefix ? yMid + getTextCenterOffset(amountFontSize, amountText) : textY);
				                cursorX += ctx.measureText(amountText).width + 14;

					                // ticker：主体行换行到下方；副体行保持同一行
					                ctx.fillStyle = TEXT;
					                ctx.font = `400 ${tickerFontSize}px "PingFang SC"`;

					                if (!showPrefix) {
					                    const unitY = textY + Math.round(amountFontSize * 0.92);
					                    let unitCursorX = textStartX;
					                    const nextCursorX = shouldDrawLogo ? (unitCursorX + iconSize + iconGap) : unitCursorX;
					                    const tickerMaxW = Math.max(120, (x + w - padX) - nextCursorX);
					                    const ticker = ellipsize(tickerLabel, tickerMaxW);
					                    if (shouldDrawLogo) {
					                        const iconCx = unitCursorX + iconSize / 2;
					                        const iconCy = unitY - getTextCenterOffset(tickerFontSize, ticker);
					                        drawInlineLogo(ctx, {
					                            x: iconCx,
					                            y: iconCy,
					                            size: iconSize,
					                            logoType: row.logoType,
					                            logo: row.logo,
					                            bitmap: row.bitmap
					                        });
					                        unitCursorX = nextCursorX;
					                    }
					                    ctx.fillText(ticker, unitCursorX, unitY);
					                } else {
					                    const nextCursorX = shouldDrawLogo ? (cursorX + iconSize + iconGap) : cursorX;
					                    const tickerMaxW = Math.max(120, (x + w - padX) - nextCursorX);
					                    const ticker = ellipsize(tickerLabel, tickerMaxW);
					                    if (shouldDrawLogo) {
					                        const iconCx = cursorX + iconSize / 2;
					                        const iconCy = yMid;
					                        drawInlineLogo(ctx, {
					                            x: iconCx,
					                            y: iconCy,
					                            size: iconSize,
					                            logoType: row.logoType,
					                            logo: row.logo,
					                            bitmap: row.bitmap
					                        });
					                        cursorX = nextCursorX;
					                    }
					                    ctx.fillText(ticker, cursorX, yMid + getTextCenterOffset(tickerFontSize, ticker));
					                }
					            }
				            
						            // 左侧：主体（第一行）
						            if (primaryRow) {
						                const primaryPillH = primaryPillHForLayout;
						                const primaryYTopOffset = -Math.round(H * 0.1); // 主体整体上移 10%
						                const primaryYTopIdeal = Math.round((H - primaryPillH) / 2) + primaryYTopOffset;
						                const primaryYTopMin = cursorY;
						                const primaryYTopMax = Math.max(primaryYTopMin, rowsBottomLimit - primaryPillH);
						                const primaryYTop = Math.min(primaryYTopMax, Math.max(primaryYTopMin, primaryYTopIdeal));
					                drawRow({
					                    row: primaryRow,
					                    x: leftX,
				                    yTop: primaryYTop,
				                    w: leftColW,
				                    scale: SOURCE_ROW_SCALE,
				                    showPrefix: false
				                });
				            }
				            
				            // 右侧：副体（其余行）
				            let rightCursorY = cursorY;
				            for (let i = 0; i < secondaryRows.length; i++) {
				                drawRow({
				                    row: secondaryRows[i],
				                    x: rightX,
				                    yTop: rightCursorY,
				                    w: rightColW,
				                    scale: 1,
				                    showPrefix: true
				                });
				                rightCursorY += secondaryLineH;
				            }
	            
		            // 右上角已展示 GitHub 链接，底部不再显示网址
	            
	            return await new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) reject(new Error('生成图片失败'));
                    else resolve(blob);
                }, 'image/png', 0.92);
            });
        }

        let shareImageBlob = null;
        let shareImageObjectUrl = null;
        let shareModalReturnFocus = null;

        function syncModalScrollLock() {
            const hasOpenModal = Array.from(document.querySelectorAll('.modal'))
                .some((modal) => modal.getAttribute('aria-hidden') === 'false');
            document.body.classList.toggle('modal-open', hasOpenModal);
            const main = document.querySelector('main');
            if (main) main.inert = hasOpenModal;
        }

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const modal = Array.from(document.querySelectorAll('.modal'))
                .find((item) => item.getAttribute('aria-hidden') === 'false');
            if (!modal) return;

            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )).filter((item) => item.getClientRects().length > 0);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        function closeShareImageModal() {
            const modal = document.getElementById('shareImageModal');
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
            const img = document.getElementById('shareImagePreview');
            if (img) img.src = '';
            if (shareImageObjectUrl) {
                URL.revokeObjectURL(shareImageObjectUrl);
                shareImageObjectUrl = null;
            }
            shareImageBlob = null;
            syncModalScrollLock();
            if (shareModalReturnFocus?.isConnected) shareModalReturnFocus.focus();
            shareModalReturnFocus = null;
        }

	        function openShareImageModal(blob) {
	            shareImageBlob = blob;
	            const modal = document.getElementById('shareImageModal');
	            const img = document.getElementById('shareImagePreview');
	            if (!modal || !img) return;

		            if (shareImageObjectUrl) URL.revokeObjectURL(shareImageObjectUrl);
		            shareImageObjectUrl = URL.createObjectURL(blob);
		            img.src = shareImageObjectUrl;
                    shareModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		            modal.style.display = 'flex';
                    modal.setAttribute('aria-hidden', 'false');
                    syncModalScrollLock();
                    requestAnimationFrame(() => document.getElementById('copyShareImageBtn')?.focus());
		        }

        async function copyShareImageToClipboard() {
            if (!shareImageBlob) throw new Error('图片未就绪');

            if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
                throw new Error('当前浏览器不支持复制图片（请使用下载）');
            }

            const item = new ClipboardItem({ 'image/png': shareImageBlob });
            await navigator.clipboard.write([item]);
        }

        function downloadShareImage() {
            if (!shareImageBlob) throw new Error('图片未就绪');

            const filename = `价值观纠正器-换算结果-${Date.now()}.png`;
            const url = URL.createObjectURL(shareImageBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

	        function setupShareImageModalListeners() {
            const modal = document.getElementById('shareImageModal');
            const copyBtn = document.getElementById('copyShareImageBtn');
            const downloadBtn = document.getElementById('downloadShareImageBtn');
            if (!modal || !copyBtn || !downloadBtn) return;

            if (!copyBtn.dataset.bound) {
                copyBtn.dataset.bound = '1';
                copyBtn.addEventListener('click', async () => {
                    try {
                        await copyShareImageToClipboard();
                        showToast('图片已复制');
                        console.log('✅ 图片已复制到剪贴板');
                    } catch (e) {
                        console.log('复制图片失败:', e);
                        alert(`❌ 复制图片失败：\n\n${e?.message || e}\n\n你可以点击“下载图片”保存后再分享。`);
                    }
                });
            }

            if (!downloadBtn.dataset.bound) {
                downloadBtn.dataset.bound = '1';
                downloadBtn.addEventListener('click', () => {
                    try {
                        downloadShareImage();
                        showToast('图片已下载');
                        console.log('✅ 图片已下载');
                    } catch (e) {
                        console.log('下载图片失败:', e);
                        alert(`❌ 下载图片失败：\n\n${e?.message || e}`);
                    }
                });
            }

            if (!modal.dataset.bound) {
                modal.dataset.bound = '1';

                // 点击遮罩关闭
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeShareImageModal();
                });

                // ESC 关闭
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
                        closeShareImageModal();
                    }
                });
            }
        }

        // 全局：点击空白处关闭所有自定义下拉
        window.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            if (target.closest('.dropdown')) return;
            if (target.closest('.dropdown-menu')) return;
            closeAllDropdowns();
        });

        // ESC：关闭下拉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllDropdowns();
        });

        // 滚动/缩放：重定位已打开的下拉菜单
        window.addEventListener('scroll', (event) => {
            if (event.target instanceof Element && event.target.closest('.dropdown-menu')) return;
            document.querySelectorAll('.dropdown.open').forEach((dd) => positionDropdownMenu(dd));
        }, { passive: true, capture: true });

window.addEventListener('resize', () => {
	            document.querySelectorAll('.dropdown.open').forEach((dd) => positionDropdownMenu(dd));
	        });

	        // iOS Safari 等场景：地址栏收起/弹出会改变 visualViewport，但 window.resize/scroll 不一定稳定触发
	        // 这里额外监听 visualViewport，确保手机端下拉菜单位置与箭头始终对齐目标框
	        if (window.visualViewport && !window.__valuesCorrectorVisualViewportBound) {
	            window.__valuesCorrectorVisualViewportBound = true;
	            window.visualViewport.addEventListener('resize', () => {
	                document.querySelectorAll('.dropdown.open').forEach((dd) => positionDropdownMenu(dd));
	            });
	            window.visualViewport.addEventListener('scroll', () => {
	                document.querySelectorAll('.dropdown.open').forEach((dd) => positionDropdownMenu(dd));
	            }, { passive: true });
	        }

	        // 分享按钮功能：生成换算结果分享图 PNG，并打开预览弹窗
	        if (shareBtn) {
		            shareBtn.addEventListener('click', async () => {
			                try {
			                    const blob = await generateSharePngBlob();

			                    openShareImageModal(blob);
			                    console.log('✅ 分享图已生成（PNG），已打开预览');
			                } catch (err) {
	                    console.error('生成/分享失败:', err);
	                    alert(`❌ 生成分享图失败：\n\n${err?.message || err}`);
	                }
	            });
	        }

	        // 分享网站按钮：复制分享文案
	        const shareSiteBtn = document.getElementById('shareSiteBtn');
	        if (shareSiteBtn) {
	            shareSiteBtn.addEventListener('click', async () => {
	                const text = '价值观纠正器：https://wolfyxbt.github.io/ValuesCorrector/';
	                try {
	                    if (navigator.clipboard?.writeText) {
	                        await navigator.clipboard.writeText(text);
	                    } else {
	                        const ta = document.createElement('textarea');
	                        ta.value = text;
	                        ta.setAttribute('readonly', '');
	                        ta.style.position = 'fixed';
	                        ta.style.left = '-9999px';
	                        ta.style.top = '0';
	                        document.body.appendChild(ta);
	                        ta.select();
	                        document.execCommand('copy');
	                        ta.remove();
	                    }
	                    showToast('网址已复制');
	                    console.log('✅ 网站分享文案已复制');
	                } catch (e) {
	                    console.log('复制网站分享文案失败:', e);
	                    alert(`❌ 复制失败：\n\n${e?.message || e}\n\n你可以手动复制：\n${text}`);
	                }
	            });
	        }

        // 监听beforeinstallprompt事件
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWA安装提示事件触发');
            e.preventDefault();
            deferredPrompt = e;
            // 显示添加到主屏幕按钮
            addToHomeBtn.style.display = 'inline-flex';
            if (document.getElementById('installGuideModal')?.getAttribute('aria-hidden') === 'false') {
                document.getElementById('installGuideAction').textContent = '立即添加';
            }
        });
        
        let installReturnFocus = null;

        function getInstallGuide() {
            const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (ios) return {
                platform: 'iPhone / iPad',
                steps: [
                    ['打开分享菜单', '在 Safari 中打开本网站，轻点浏览器的分享按钮。'],
                    ['添加到主屏幕', '在分享菜单中向下找“添加到主屏幕”。'],
                    ['确认添加', '确认名称后轻点“添加”，回到主屏幕即可找到。']
                ]
            };
            if (/Android/.test(navigator.userAgent)) return {
                platform: 'Android',
                steps: [
                    ['打开浏览器菜单', '使用 Chrome 打开本网站，轻点右上角菜单。'],
                    ['选择添加或安装', '找到“添加到主屏幕”或“安装应用”。'],
                    ['确认添加', '按浏览器提示完成，之后从主屏幕打开。']
                ]
            };
            return {
                platform: '电脑浏览器',
                steps: [
                    ['打开浏览器菜单', '在 Chrome 中查找安装应用入口；Safari 可使用“添加到程序坞”。'],
                    ['确认安装', '按浏览器提示确认名称和安装位置。'],
                    ['随时打开', '从应用列表或程序坞启动；手机上也可以添加到主屏幕。']
                ]
            };
        }

        function showInstallGuide() {
            const modal = document.getElementById('installGuideModal');
            const guide = getInstallGuide();
            document.getElementById('installPlatform').textContent = guide.platform;
            const steps = document.getElementById('installSteps');
            steps.replaceChildren();
            guide.steps.forEach(([title, detail]) => {
                const row = document.createElement('li');
                const heading = document.createElement('strong'); heading.textContent = title;
                const description = document.createElement('p'); description.textContent = detail;
                row.append(heading, description); steps.append(row);
            });
            const action = document.getElementById('installGuideAction');
            action.textContent = deferredPrompt ? '立即添加' : '知道了';
            installReturnFocus = document.activeElement;
            modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
            syncModalScrollLock();
            requestAnimationFrame(() => {
                if (modal.getAttribute('aria-hidden') === 'false') action.focus({ preventScroll: true });
            });
        }

        function closeInstallGuide() {
            const modal = document.getElementById('installGuideModal');
            modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true');
            syncModalScrollLock();
            if (installReturnFocus?.isConnected) installReturnFocus.focus({ preventScroll: true });
            installReturnFocus = null;
        }

        addToHomeBtn.addEventListener('click', showInstallGuide);
        document.addEventListener('DOMContentLoaded', () => {
            const modal = document.getElementById('installGuideModal');
            modal.querySelector('.close').addEventListener('click', closeInstallGuide);
            modal.addEventListener('click', event => { if (event.target === modal) closeInstallGuide(); });
            document.getElementById('installGuideAction').addEventListener('click', async () => {
                if (!deferredPrompt) { closeInstallGuide(); return; }
                const prompt = deferredPrompt;
                deferredPrompt = null;
                const action = document.getElementById('installGuideAction');
                action.disabled = true;
                try {
                    await prompt.prompt();
                    const { outcome } = await prompt.userChoice;
                    if (outcome === 'accepted') closeInstallGuide();
                } catch { showToast('暂时无法自动添加，请按上方步骤操作'); }
                finally { action.disabled = false; action.textContent = '知道了'; }
            });
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.getElementById('installGuideModal')?.getAttribute('aria-hidden') === 'false') closeInstallGuide();
        });

        window.addEventListener('appinstalled', () => {
            addToHomeBtn.style.display = 'none';
            closeInstallGuide();
            showToast('应用已添加');
        });

        // 检测移动设备并显示按钮
        function isMobileDevice() {
            return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        }
        
        // 初始化按钮显示（所有设备都显示）
        setTimeout(() => {
            if (addToHomeBtn) {
                addToHomeBtn.style.display = 'inline-flex';
                console.log('添加到主屏幕按钮已显示');
            }
        }, 500);
        
	        // API状态跟踪
		        let apiStatus = {
		            preset: true,
		            exchangerate: true,
                    coingecko: true // 所有币种价格与自定义代币搜索

		        };

	        // 更新API状态显示
	        function updateApiStatusDisplay(isRealTime, errorMessage) {
	            const statusElement = document.getElementById('apiStatus');
	            if (!statusElement) return;
	            
	            // 确保状态元素始终可见
	            statusElement.style.display = 'block';
	            
	            // 新版：允许传入对象以自定义文案
	            if (typeof isRealTime === 'object' && isRealTime) {
	                statusElement.innerHTML = isRealTime.message || '汇率状态未知';
	                statusElement.style.color = isRealTime.color || '#6c757d';
	                return;
	            }
	            
	            if (isRealTime) {
	                statusElement.innerHTML = '汇率已加载';
	                statusElement.style.color = 'var(--muted)';
	                return;
	            }
	            
	            // 使用传入的错误消息，如果没有则使用默认消息
	            const displayMessage = errorMessage || '汇率加载失败';
	            statusElement.innerHTML = displayMessage;
	            statusElement.style.color = '#b3261e';
	        }

	        // 获取真实汇率
	        async function loadRates({ forceRefresh = false, reason = 'unknown' } = {}) {
            if (loadRatesInFlight) return loadRatesInFlight;
            loadRatesInFlight = (async () => {
                updateApiStatusDisplay({ message: '汇率加载中', color: 'var(--muted)' });
                const activeCustom = new Map();
                for (let i = 1; i <= FIELD_COUNT; i++) {
                    const select = document.getElementById(`currency${i}`);
                    if (select?.value !== 'CUSTOM') continue;
                    const key = select.querySelector('option[value="CUSTOM"]')?.getAttribute('data-token-key');
                    const info = customTokens.get(key);
                    if (info?.id) activeCustom.set(key, info);
                }
                const ids = [...Object.values(COINGECKO_COIN_IDS), ...[...activeCustom.values()].map(info => info.id)];
                const [crypto, fiat] = await Promise.all([
                    getCoinGeckoPrices(ids, { forceRefresh }),
                    getFiatRates({ forceRefresh }).catch(() => {
                        const cached = readCache(CACHE_KEYS.fiatRates, 7 * 24 * 60 * 60 * 1000);
                        return cached?.data ? { fiatData: cached.data, source: 'stale-cache', ts: cached.ts } : null;
                    })
                ]);
                const nextPrices = { USD: 1 };
                for (const { code, rate } of updateFiatCatalog(fiat?.fiatData?.rates, fiat?.source === 'stale-cache')) {
                    nextPrices[`FIAT:${code}`] = 1 / rate;
                }
                for (const [symbol, id] of Object.entries(COINGECKO_COIN_IDS)) {
                    if (crypto.prices[id]) nextPrices[symbol] = crypto.prices[id];
                }
                for (const symbol of FIAT_SYMBOLS) {
                    const rate = fiat?.fiatData?.rates?.[symbol];
                    if (Number.isFinite(rate) && rate > 0) nextPrices[symbol] = 1 / rate;
                }
                for (const asset of PRODUCT_ASSETS) {
                    if (nextPrices[asset.priceCurrency]) nextPrices[asset.symbol] = asset.priceAmount * nextPrices[asset.priceCurrency];
                }
                for (const product of customProducts.values()) {
                    const price = customProductUsdPrice(product, nextPrices);
                    if (price) nextPrices[product.id] = price;
                }
                for (const [key, info] of activeCustom) {
                    info.price = crypto.prices[info.id] || null;
                    info.isEstimated = false;
                    if (info.price) nextPrices[key] = info.price;
                }
                usdPrices = nextPrices;
                if (productSelectId) updateProductCurrencyOptions();
                const missingCustomFiat = Array.from({ length: FIELD_COUNT }, (_, i) => document.getElementById(`currency${i + 1}`)?.value)
                    .some(key => (key?.startsWith('FIAT:') || key?.startsWith('PRODUCT:')) && !nextPrices[key]);
                const incomplete = crypto.missingIds.length > 0 || missingCustomFiat || FIAT_SYMBOLS.some(symbol => !nextPrices[symbol]);
                const stale = crypto.staleIds.length > 0 || fiat?.source === 'stale-cache';
                apiStatus.preset = PRESET_CRYPTO_SYMBOLS.every(symbol => !!nextPrices[symbol]);
                apiStatus.exchangerate = !!fiat;
                updateApiStatusDisplay({
                    message: incomplete ? '部分价格暂不可用' : stale ? '正在使用缓存价格' : '汇率已加载',
                    color: incomplete || stale ? 'var(--warning)' : 'var(--muted)'
                });
                if (document.getElementById(`amount${lastInputField}`)?.value.trim()) convert(lastInputField);
                if (!window.rateRefreshInterval) {
                    window.rateRefreshInterval = setInterval(() => {
                        if (!document.hidden) loadRates({ forceRefresh: true, reason: 'interval' });
                    }, 5 * 60 * 1000);
                }
            })().catch(error => {
                console.error('汇率加载失败', error);
                updateApiStatusDisplay({ message: '汇率加载失败，请稍后重试', color: '#b3261e' });
            }).finally(() => { loadRatesInFlight = null; });
            return loadRatesInFlight;
        }

        // 检测 localStorage 是否可用
	        function checkLocalStorage() {
	            try {
                const testKey = '__localStorage_test__';
	                localStorage.setItem(testKey, 'test');
	                localStorage.removeItem(testKey);
	                localStorageAvailable = true;
	                console.log('✅ localStorage 可用');
	                return true;
	            } catch (e) {
	                localStorageAvailable = false;
	                console.error('❌ localStorage 不可用:', e);
	                alert('浏览器的 localStorage 功能不可用。状态记忆功能将无法使用。\n\n可能原因：\n1. 使用了隐私/无痕模式\n2. 浏览器设置阻止了本地存储\n3. 使用 file:// 协议打开（请使用 HTTP 服务器）');
	                return false;
	            }
	        }

        // 注册 Service Worker（自动更新缓存，解决 PWA 主屏幕书签无法获取最新版本的问题）
        function registerServiceWorker() {
            if (!('serviceWorker' in navigator)) return;

            navigator.serviceWorker.register('./sw.js')
                .then((reg) => {
                    console.log('✅ Service Worker 已注册');

                    // 检测到新版本时自动刷新页面
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (!newWorker) return;

                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                                // 新版本已激活且当前页面有旧 controller → 说明是一次更新
                                console.log('🔄 检测到新版本，即将刷新页面...');
                                window.location.reload();
                            }
                        });
                    });
                })
                .catch((err) => {
                    console.warn('Service Worker 注册失败:', err);
                });
        }

        // 初始化函数
	        function initApp() {
	            console.log('🚀 开始初始化应用...');

                // 由配置生成 6 个换算栏位（必须最先执行，后续逻辑依赖 currencyN / amountN 元素）
                buildCurrencyFields();

                // 注册 Service Worker
                registerServiceWorker();

	            checkLocalStorage();
		            
		            // 先设置事件监听器
		            setupBasicEventListeners();
		            setupShareImageModalListeners();

		            // 初始化移动端自定义键盘（须在 setupBasicEventListeners 之后）
		            initMobileKeyboard();
		            
		            // 初始化自定义下拉（替代系统下拉菜单）
		            for (let i = 1; i <= 6; i++) {
		                const select = document.getElementById(`currency${i}`);
		                if (select) buildCustomDropdown(select);
		            }

	            // 然后恢复状态
	            restoreCustomProducts();
	            restoreState();

            // 在页面关闭前保存状态
            window.addEventListener('beforeunload', function() {
                saveState();
                console.log('🔄 页面关闭前已保存状态');
            });

            // 在页面失去焦点时也保存状态（用户切换标签页）
            window.addEventListener('blur', function() {
                saveState();
                console.log('🔄 页面失去焦点，已保存状态');
            });

            // 页面加载时获取汇率，加载完成后重新计算
            loadRates().then(() => {
            console.log('汇率加载完成，准备设置转换功能');
            
            // 初始化所有select元素的logo显示
            for (let i = 1; i <= 6; i++) {
                const select = document.getElementById(`currency${i}`);
                if (select) {
                    updateSelectDisplay(select);
                }
            }
            
            // API加载完成后，如果有数据就重新计算一次以获得最新汇率
            const hasData = Array.from({length: 6}, (_, i) => i + 1).some(i => 
                document.getElementById(`amount${i}`).value.trim() !== ''
            );
            if (hasData) {
                // API加载完成后，以最后输入的栏位为基准重新计算
                const lastAmount = document.getElementById(`amount${lastInputField}`).value.trim();
                if (lastAmount !== '') {
                    console.log(`API加载完成，以栏位${lastInputField}为基准重新计算最新汇率`);
                    convert(lastInputField);
                }
            }
        });
        }

        // 确保 DOM 加载后执行初始化
        if (document.readyState === 'loading') {
            // DOM 还在加载，等待 DOMContentLoaded 事件
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            // DOM 已经加载完成，直接执行
            initApp();
        }

        // 保存状态到本地存储
        function saveState() {
            const state = {};
            for (let i = 1; i <= 6; i++) {
                state[`amount${i}`] = document.getElementById(`amount${i}`).value;
                state[`currency${i}`] = document.getElementById(`currency${i}`).value;

                // 保存自定义代币信息
                const select = document.getElementById(`currency${i}`);
                const customOption = select ? select.querySelector('option[value="CUSTOM"]') : null;
                if (customOption) {
                    state[`customToken${i}`] = {
                        tokenKey: customOption.getAttribute('data-token-key'),
                        tokenName: customOption.getAttribute('data-token-name'),
                        tokenSymbol: customOption.getAttribute('data-token-symbol'),
                        displayText: customOption.getAttribute('data-display-text'),
                        tokenLogo: customOption.getAttribute('data-token-logo')
                    };
                }
            }
            state.lastInputField = lastInputField; // 保存最后输入的栏位
            state.customTokens = customTokens ? Array.from(customTokens.entries()) : []; // 保存自定义代币数据
            memoryCache.set('valueConverterState', JSON.stringify(state));
            try { localStorage.setItem('valueConverterState', JSON.stringify(state)); } catch { /* 本次会话仍可保存 */ }
            console.log('✅ 状态已保存:', state);
        }
        
        // 从本地存储恢复状态
        function restoreState() {
            let savedState = memoryCache.get('valueConverterState');
            try { savedState = savedState || localStorage.getItem('valueConverterState'); } catch { /* 使用内存状态 */ }
            console.log('🔍 尝试恢复状态，localStorage 内容:', savedState);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    // 已移除的标的按原美元单价恢复，保留旧金额的价值。
                    const retiredUsdPrices = { IPHONE17: 799, MACBOOK: 999 };
                    for (let i = 1; i <= FIELD_COUNT; i++) {
                        const currency = state[`currency${i}`];
                        if (!Object.hasOwn(retiredUsdPrices, currency)) continue;
                        const price = retiredUsdPrices[currency];
                        const amount = parseAmountInputToNumber(state[`amount${i}`] || '');
                        state[`currency${i}`] = 'USD';
                        state[`amount${i}`] = Number.isFinite(amount * price)
                            ? formatNumberForDisplay(amount * price) : '';
                    }
                    console.log('📦 解析后的状态:', state);

                    // 恢复自定义代币数据
                    if (state.customTokens && Array.isArray(state.customTokens)) {
                        customTokens = new Map();
                        for (const [oldKey, info] of state.customTokens) {
                            if (!info || typeof info.id !== 'string' || !info.id) continue;
                            const key = `CG:${info.id}`;
                            customTokens.set(key, { ...info, image: normalizeTokenLogo(info.image), price: null, isEstimated: false });
                            for (let i = 1; i <= FIELD_COUNT; i++) {
                                if (state[`customToken${i}`]?.tokenKey === oldKey) state[`customToken${i}`].tokenKey = key;
                            }
                        }
                    }

                    for (let i = 1; i <= 6; i++) {
                        const amountElement = document.getElementById(`amount${i}`);
                        const selectElement = document.getElementById(`currency${i}`);

                        console.log(`🔧 处理第 ${i} 个字段:`, {
                            savedAmount: state[`amount${i}`],
                            savedCurrency: state[`currency${i}`],
                            currentAmount: amountElement ? amountElement.value : 'null',
                            currentCurrency: selectElement ? selectElement.value : 'null'
                        });

                        if (state[`amount${i}`]) {
                            amountElement.value = state[`amount${i}`];
                            console.log(`  ✅ 金额已恢复为: ${state[`amount${i}`]}`);
                        }
                        if (state[`currency${i}`]) {
                            if (/^FIAT:[A-Z]{3}$/.test(state[`currency${i}`])) {
                                ensureFiatOption(selectElement, state[`currency${i}`].slice(5));
                            }
                            const oldValue = selectElement.value;
                            selectElement.value = state[`currency${i}`];
                            selectElement.setAttribute('data-previous-value', selectElement.value);
                            console.log(`  ✅ 货币已从 ${oldValue} 恢复为: ${selectElement.value}`);

                            // 验证设置是否成功
                            if (selectElement.value !== state[`currency${i}`]) {
                                console.error(`  ❌ 警告：货币设置失败！尝试设置为 ${state[`currency${i}`]}，但实际值为 ${selectElement.value}`);
                            }
                        }

                        // 恢复自定义代币选项的属性
                        if (state[`customToken${i}`]) {
                            const select = document.getElementById(`currency${i}`);
                            const customOption = select ? select.querySelector('option[value="CUSTOM"]') : null;
                            if (customOption) {
                                const tokenInfo = state[`customToken${i}`];
                                customOption.setAttribute('data-token-key', tokenInfo.tokenKey || '');
                                customOption.setAttribute('data-token-name', tokenInfo.tokenName || '');
                                customOption.setAttribute('data-token-symbol', tokenInfo.tokenSymbol || '');
                                customOption.setAttribute('data-display-text', tokenInfo.displayText || '');
                                customOption.setAttribute('data-token-logo', normalizeTokenLogo(tokenInfo.tokenLogo));
                            }
                        }
                    }

                    // 恢复最后输入的栏位
                    if (state.lastInputField) {
                        lastInputField = state.lastInputField;
                    }

                    // 恢复自定义代币的外部显示
                    for (let i = 1; i <= 6; i++) {
                        const select = document.getElementById(`currency${i}`);
                        if (select) {
                            updateSelectDisplay(select);
                        }
                    }

                    console.log('✅ 状态已恢复:', state);
                } catch (error) {
                    console.log('❌ 恢复状态失败:', error);
                }
            } else {
                console.log('⚠️ 没有找到保存的状态');
            }
        }
        
        function convert(sourceIndex) {
            console.log('Convert函数被调用，sourceIndex:', sourceIndex);
            if (updating) {
                console.log('正在更新中，跳过本次转换');
                return;
            }
            
            // 检查汇率服务是否可用
            if (!usdPrices || Object.keys(usdPrices).length === 0) {
                console.error('汇率服务不可用，无法进行转换');
                updating = false;
                return;
            }
            
            updating = true;
            
            const sourceAmountRaw = document.getElementById(`amount${sourceIndex}`).value;
            let sourceCurrency = document.getElementById(`currency${sourceIndex}`).value;
            
            // 处理自定义代币：如果选择的是CUSTOM，获取实际的代币符号
            if (sourceCurrency === 'CUSTOM') {
                const sourceSelect = document.getElementById(`currency${sourceIndex}`);
                const customOption = sourceSelect.querySelector('option[value="CUSTOM"]');
                const tokenKey = customOption ? customOption.getAttribute('data-token-key') : null;
                if (tokenKey) {
                    sourceCurrency = tokenKey;
                }
            }
            
            console.log('转换参数 - 金额(原始):', sourceAmountRaw, '货币:', sourceCurrency);
            console.log('usdPrices存在:', !!usdPrices, '包含资产数量:', usdPrices ? Object.keys(usdPrices).length : 0);
            
            if (!sourceAmountRaw || sourceAmountRaw === '') {
		            for (let i = 1; i <= 6; i++) {
		                if (i !== sourceIndex) {
                        document.getElementById(`amount${i}`).value = '';
                    }
                }
                updating = false;
                return;
            }
            
            const amount = parseAmountInputToNumber(sourceAmountRaw);
            if (isNaN(amount)) {
                updating = false;
                return;
            }
            
            for (let i = 1; i <= 6; i++) {
                if (i !== sourceIndex) {
                    let targetCurrency = document.getElementById(`currency${i}`).value;
                    
                    // 处理目标货币也是自定义代币的情况
                    if (targetCurrency === 'CUSTOM') {
                        const targetSelect = document.getElementById(`currency${i}`);
                        const customOption = targetSelect.querySelector('option[value="CUSTOM"]');
                        const tokenKey = customOption ? customOption.getAttribute('data-token-key') : null;
                        if (tokenKey) {
                            targetCurrency = tokenKey;
                        }
                    }
                    
                    let result;
                    
	                    const rate = getConversionRate(sourceCurrency, targetCurrency);
	                    if (rate != null) {
	                        result = amount * rate;
	                    } else {
	                        document.getElementById(`amount${i}`).value = '';
                        continue;
	                    }
	                    
	                    document.getElementById(`amount${i}`).value = formatNumberForDisplay(result);
	                }
	            }
            
            updating = false;
        }
        
	        // 更新下拉菜单的外部显示
	        function updateSelectDisplay(selectElement) {
	            // 若已启用自定义下拉，改为更新自定义触发器文本，不再使用覆盖层方案
	            const wrapper = selectElement.parentElement;
	            const dropdown = wrapper ? wrapper.querySelector('.dropdown') : null;
	            if (dropdown) {
	                updateCustomDropdownTrigger(selectElement);
	                return;
	            }

	            const selectedValue = selectElement.value;
	            
	            // 处理自定义代币
	            const customOption = selectElement.querySelector('option[value="CUSTOM"]');
	            if (selectedValue === 'CUSTOM' && customOption) {
	                const displayText = customOption.getAttribute('data-display-text');
	                const logoUrl = normalizeTokenLogo(customOption.getAttribute('data-token-logo'));
	                
	                if (displayText && logoUrl) {
	                    // UI 使用图片 Logo
	                    createSelectOverlay(selectElement, logoUrl, displayText, 'image');
	                } else {
	                    restoreOriginalDisplay(selectElement);
	                }
	            }
            // 处理所有预设货币
            else if (currencyLogos[selectedValue]) {
                const currencyData = currencyLogos[selectedValue];
                createSelectOverlay(selectElement, currencyData.logo, currencyData.text, currencyData.type);
            } else {
                restoreOriginalDisplay(selectElement);
            }
        }
        
	        // 创建选择框覆盖层
	        function createSelectOverlay(selectElement, logoUrl, displayText, logoType = 'image') {
	            // 创建一个临时的显示层来覆盖原始的select显示
	            let displayOverlay = selectElement.nextElementSibling;
	            if (!displayOverlay || !displayOverlay.classList.contains('custom-select-display')) {
	                displayOverlay = document.createElement('div');
	                displayOverlay.className = 'custom-select-display';
                
                // 获取select元素的精确位置和样式
                const selectStyles = window.getComputedStyle(selectElement);
                const isMediaQuery480 = window.matchMedia('(max-width: 480px)').matches;
                const isMediaQuery768 = window.matchMedia('(max-width: 768px)').matches;
                
                // 根据媒体查询调整样式
                let adjustedRightMargin = '45px'; // 默认扣除下拉箭头的宽度
                
                if (isMediaQuery480) {
                    adjustedRightMargin = '30px'; // 移动端箭头更小
                } else if (isMediaQuery768) {
                    adjustedRightMargin = '35px'; // 中等屏幕
                }
                
	                displayOverlay.style.cssText = `
	                    position: absolute;
	                    top: 0;
	                    left: 0;
	                    right: ${adjustedRightMargin};
	                    height: 100%;
	                    pointer-events: none;
	                    z-index: 1;
	                    padding: 0;
	                    margin: 0;
	                    font-size: ${selectStyles.fontSize};
	                    font-family: "PingFang SC";
	                    line-height: ${selectStyles.lineHeight};
	                    color: #333;
	                    background: transparent;
	                    box-sizing: border-box;
	                    display: flex;
	                    align-items: center;
	                    justify-content: flex-start;
	                `;
	                
	                // 覆盖层应当相对 select 的包装容器定位（避免在 .field 这个 flex 容器内错位）
	                const wrapper = selectElement.parentElement;
	                if (wrapper) {
	                    wrapper.style.position = 'relative';
	                    wrapper.insertBefore(displayOverlay, selectElement.nextSibling);
	                } else {
	                    // 极端兜底：仍插回原父节点
	                    selectElement.parentNode.style.position = 'relative';
	                    selectElement.parentNode.insertBefore(displayOverlay, selectElement.nextSibling);
	                }
	            }
            
            // 清空内容并添加Logo + 文本
            displayOverlay.innerHTML = '';
            
            // 创建容器div
            const contentDiv = document.createElement('div');
            
            // 重新获取当前的媒体查询状态和样式
            const selectStyles = window.getComputedStyle(selectElement);
            const isMediaQuery480 = window.matchMedia('(max-width: 480px)').matches;
            const isMediaQuery768 = window.matchMedia('(max-width: 768px)').matches;
            
            let paddingLeft = selectStyles.paddingLeft;
            let logoTextGap = '8px';
            let logoSize = '20px';
            let emojiSize = '14px';
            
            if (isMediaQuery480) {
                paddingLeft = '10px'; // 匹配 CSS: padding: 8px 30px 8px 10px
                logoTextGap = '6px'; // 移动端减小间距
                logoSize = '18px'; // 移动端减小logo
                emojiSize = '12px'; // 移动端减小emoji
            } else if (isMediaQuery768) {
                paddingLeft = '12px'; // 匹配 CSS: padding: 10px 35px 10px 12px
                logoTextGap = '7px'; // 中等屏幕减小间距
                logoSize = '19px'; // 中等屏幕稍微减小logo
                emojiSize = '13px'; // 中等屏幕稍微减小emoji
            }
            
            contentDiv.style.cssText = `
                display: flex;
                align-items: center;
                padding-left: ${paddingLeft};
                height: 100%;
                gap: ${logoTextGap};
            `;
            
            // 创建Logo元素
            let logoElement;
            if (logoType === 'emoji') {
                logoElement = document.createElement('div');
                logoElement.textContent = logoUrl; // logoUrl实际上是emoji字符
                logoElement.style.cssText = `
                    width: ${logoSize};
                    height: ${logoSize};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: ${emojiSize};
                    background: rgba(0,0,0,0.1);
                `;
            } else {
                logoElement = document.createElement('img');
                logoElement.src = logoUrl;
                logoElement.style.cssText = `
                    width: ${logoSize};
                    height: ${logoSize};
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                `;
                
                // 处理图片加载失败
                logoElement.onerror = function() {
                    logoElement.style.display = 'none';
                    textSpan.textContent = displayText;
                };
            }
            
            // 创建文本元素
            const textSpan = document.createElement('span');
            textSpan.textContent = displayText;
            textSpan.style.cssText = `
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            
            contentDiv.appendChild(logoElement);
            contentDiv.appendChild(textSpan);
            displayOverlay.appendChild(contentDiv);
            selectElement.style.color = 'transparent';
        }
        
        // 恢复原始显示
	        function restoreOriginalDisplay(selectElement) {
            selectElement.style.color = '';
            const displayOverlay = selectElement.nextElementSibling;
            if (displayOverlay && displayOverlay.classList.contains('custom-select-display')) {
                displayOverlay.style.display = 'none';
            }
        }

		        // 基础换算功能事件监听器
			        function setupBasicEventListeners() {
		            function formatNumberWithThousands(value) {
		                const raw = normalizeMathInput(String(value ?? ''));
		                if (!raw) return '';
		
		                const trimmed = raw.trim();
		                if (!trimmed) return '';
		                if (!isLikelyPlainNumberInput(trimmed)) return raw;
		
		                const sign = trimmed.startsWith('-') ? '-' : '';
		                const body = trimmed.replace(/,/g, '').replace(/^-/, '');
		
		                // 仅保留数字与小数点（保留第一个小数点）
		                const cleaned = body.replace(/[^\d.]/g, '');
		                if (!cleaned) return sign ? '-' : '';
		
		                const firstDot = cleaned.indexOf('.');
		                const hasDot = firstDot !== -1;
		                const integerPartRaw = hasDot ? cleaned.slice(0, firstDot) : cleaned;
		                const decimalPartRaw = hasDot ? cleaned.slice(firstDot + 1).replace(/\./g, '') : '';
		
		                // 允许用户输入以 "." 开头的情况
		                const integerDigits = integerPartRaw.replace(/^0+(?=\d)/, '') || (integerPartRaw === '' ? '' : '0');
		                const groupedInt = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		
		                if (hasDot) {
		                    return `${sign}${groupedInt}.${decimalPartRaw}`;
		                }
		                return `${sign}${groupedInt}`;
		            }
		
		            function applyThousandsSeparatorsToInput(inputEl) {
		                const original = inputEl.value;
		                if (!original) return;
		                // 允许输入表达式：遇到运算符/括号时不做千分位格式化，避免破坏表达式
		                if (!isLikelyPlainNumberInput(original)) return;
		
		                const selStart = inputEl.selectionStart ?? original.length;
		                const leftRaw = original.slice(0, selStart);
		                const leftDigitsCount = leftRaw.replace(/[^\d.]/g, '').length;
		
		                const formatted = formatNumberWithThousands(original);
		                if (formatted === original) return;
		                inputEl.value = formatted;
	
	                // 还原光标位置：保持“光标左侧的数字/小数点字符数量”一致
	                let seen = 0;
	                let newPos = formatted.length;
	                for (let i = 0; i < formatted.length; i++) {
	                    const ch = formatted[i];
	                    if ((ch >= '0' && ch <= '9') || ch === '.') seen++;
	                    if (seen >= leftDigitsCount) {
	                        newPos = i + 1;
	                        break;
	                    }
	                }
	                try {
	                    inputEl.setSelectionRange(newPos, newPos);
	                } catch {}
	            }
	
		            for (let i = 1; i <= 6; i++) {
		                // 金额输入事件
		                document.getElementById(`amount${i}`).addEventListener('input', (e) => {
		                    console.log('Input event triggered for amount' + i);
		                    // 保留表达式输入：仅去掉非白名单字符，避免手机端输入法带入奇怪字符
		                    const inputEl = e.target;
		                    const original = inputEl.value;
		                    const selStart = inputEl.selectionStart ?? original.length;
		                    const leftRaw = original.slice(0, selStart);
		                    const allowed = (s) =>
		                        normalizeMathInput(s).replace(/[^0-9+\-*/().,\s]/g, '');
		                    const sanitized = allowed(original);
		                    if (sanitized !== original) {
		                        // 还原光标：保持“光标左侧的允许字符数量”一致
		                        const leftAllowedCount = allowed(leftRaw).length;
		                        inputEl.value = sanitized;
		                        const newPos = Math.max(0, Math.min(leftAllowedCount, sanitized.length));
		                        try {
		                            inputEl.setSelectionRange(newPos, newPos);
		                        } catch {}
		                    }
		                    applyThousandsSeparatorsToInput(inputEl);
		                    lastInputField = i;
		                    convert(i);
		                    saveState();
		                });

		                // 桌面端：按 Enter 或 = 键把算式替换为计算结果（如 1+1 → 2）
		                document.getElementById(`amount${i}`).addEventListener('keydown', (e) => {
		                    if (e.key === 'Enter' || e.key === '=') {
		                        e.preventDefault();
		                        applyEqualsToInput(e.target);
		                    }
		                });

                // 货币选择事件
                document.getElementById(`currency${i}`).addEventListener('change', function() {
                    console.log('Currency change event triggered for currency' + i);
                    
                    if (this.value === 'CUSTOM_PRODUCT') {
                        this.value = this.getAttribute('data-previous-value') || DEFAULT_CURRENCIES[i - 1];
                        openCustomProductModal(this.id);
                        return;
                    }
                    if (this.value === 'CUSTOM_FIAT') {
                        this.value = this.getAttribute('data-previous-value') || DEFAULT_CURRENCIES[i - 1];
                        openCustomFiatModal(this.id);
                        return;
                    }
                    // 处理自定义代币选择
                    if (this.value === 'CUSTOM') {
                        currentSelectId = this.id;
                        openCustomTokenModal();
                        return;
                    }
                    
                    // Fallback: 检测是否是重复选择CUSTOM的情况（主要用于手机端）
                    if (this.value === 'TEMP_CUSTOM_PLACEHOLDER') {
                        // 如果选择了临时占位符，说明用户重新选择了CUSTOM
                        this.value = 'CUSTOM';
                        currentSelectId = this.id;
                        openCustomTokenModal();
                        return;
                    }
                    
                    // 记住之前的选择
                    this.setAttribute('data-previous-value', this.value);
                    
                    // 更新外部显示
                    updateSelectDisplay(this);
                    
                    // 货币选择变更时，以最后输入的栏位为基准重新计算
                    convert(lastInputField);
                    saveState();
                });
                
                // 处理重新选择自定义代币的特殊情况
                const selectElement = document.getElementById(`currency${i}`);
                
                // 桌面端：使用focus事件
                selectElement.addEventListener('focus', function() {
                    // 当获得焦点时，如果当前是CUSTOM，临时改为一个特殊值
                    if (this.value === 'CUSTOM') {
                        this.setAttribute('data-was-custom', 'true');
                        // 临时设为一个不存在的值，这样再选CUSTOM时会触发change
                        this.value = 'TEMP_CUSTOM_PLACEHOLDER';
                    }
                });
                
                // 手机端：使用touchstart事件作为补充
                selectElement.addEventListener('touchstart', function() {
                    // 在手机端，touchstart可能比focus更可靠
                    if (this.value === 'CUSTOM' && !this.getAttribute('data-was-custom')) {
                        this.setAttribute('data-was-custom', 'true');
                        this.value = 'TEMP_CUSTOM_PLACEHOLDER';
                    }
                });
                
                selectElement.addEventListener('blur', function() {
                    // 失去焦点时，如果还是临时值，恢复为CUSTOM
                    if (this.value === 'TEMP_CUSTOM_PLACEHOLDER' && this.getAttribute('data-was-custom') === 'true') {
                        this.value = 'CUSTOM';
                    }
                    this.removeAttribute('data-was-custom');
                    
                    // 手机端：如果弹窗已打开，确保select完全失去焦点
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    if (isMobile) {
                        const modal = document.getElementById('customTokenModal');
                        if (modal && modal.getAttribute('aria-hidden') === 'false') {
                            // 强制select失去焦点
                            this.blur();
                            // 移除任何可能的焦点
                            if (document.activeElement === this) {
                                document.activeElement.blur();
                            }
                        }
                    }
                });
                
                // 手机端额外的fallback：监听click事件
                selectElement.addEventListener('click', function() {
                    // 记录点击时的值，用于检测是否是重复选择
                    this.setAttribute('data-click-value', this.value);
                });
                
                // 检测select选项变化（针对手机端的特殊处理）
                selectElement.addEventListener('input', function() {
                    const clickValue = this.getAttribute('data-click-value');
                    // 如果点击前是CUSTOM，现在选择的也是CUSTOM，说明是重复选择
                    if (clickValue === 'CUSTOM' && this.value === 'CUSTOM') {
                        // 确保currentSelectId被设置并打开弹窗
                        if (!currentSelectId || !document.getElementById('customTokenModal').style.display || document.getElementById('customTokenModal').style.display === 'none') {
                            currentSelectId = this.id;
                            openCustomTokenModal();
                        }
                    }
                });
                
                // 处理重新选择自定义代币的情况
                // 只在change事件中处理，不使用其他事件
                // 这样避免了下拉菜单打开时就触发弹窗的问题
            }
        }
        
	        // 自定义代币功能
	        let currentSelectId = null;
            let customTokenModalReturnFocus = null;
	        let customTokens = new Map(); // 存储自定义代币数据
	        const tokenSearchSessionCache = new Map(); // 本次页面会话内的搜索缓存（降低 CoinGecko 搜索频率）

	        // ===== 自定义下拉（替代系统 select）=====
	        function getSelectDisplayInfo(selectElement) {
	            const value = selectElement.value;
                if (selectElement.id === 'productCurrency') {
                    return { type: 'none', logo: '', text: selectElement.selectedOptions[0]?.textContent || value };
                }
	            if (value === 'CUSTOM') {
	                const customOption = selectElement.querySelector('option[value="CUSTOM"]');
	                const displayText = customOption?.getAttribute('data-display-text') || '自定义代币';
	                const logoUrl = customOption?.getAttribute('data-token-logo');
	                if (logoUrl) return { type: 'image', logo: logoUrl, text: displayText };
	                return { type: 'emoji', logo: '🪙', text: displayText };
	            }

	            const mapped = currencyLogos?.[value];
	            if (mapped) return { type: mapped.type, logo: mapped.logo, text: mapped.text || value };

	            const opt = selectElement.querySelector(`option[value="${CSS.escape(value)}"]`);
	            return { type: 'none', logo: '', text: (opt?.textContent || value).trim() };
	        }

		        function updateCustomDropdownTrigger(selectElement) {
		            const wrapper = selectElement.parentElement;
		            if (!wrapper) return;
		            const dropdown = wrapper.querySelector('.dropdown');
		            if (!dropdown) return;

		            const { type, logo, text } = getSelectDisplayInfo(selectElement);
		            const logoBox = dropdown.querySelector('.dropdown-logo');
		            const textBox = dropdown.querySelector('.dropdown-text');
                    const trigger = dropdown.querySelector('.dropdown-trigger');
		            if (!logoBox || !textBox) return;

		            textBox.textContent = text;
                    if (trigger) {
                        const fieldNumber = selectElement.id.replace('currency', '');
                        trigger.setAttribute('aria-label', selectElement.id === 'productCurrency' ? `${text}，价格单位` : `${text}，选择第 ${fieldNumber} 栏单位`);
                    }
		            logoBox.innerHTML = '';
		            logoBox.classList.toggle('is-emoji', type === 'emoji');
		            logoBox.classList.toggle('is-image', type === 'image');

		            if (type === 'image' && logo) {
		                const img = document.createElement('img');
		                img.src = logo;
		                img.alt = '';
		                img.onerror = () => {
		                    logoBox.classList.remove('is-image');
		                    logoBox.classList.add('is-emoji');
		                    logoBox.innerHTML = `<span class="dropdown-logo-emoji">•</span>`;
		                };
		                logoBox.appendChild(img);
		            } else if (type === 'emoji' && logo) {
		                const span = document.createElement('span');
		                span.className = 'dropdown-logo-emoji';
		                span.textContent = logo;
		                logoBox.appendChild(span);
		            } else {
		                logoBox.classList.add('is-emoji');
		                logoBox.classList.remove('is-image');
		                const span = document.createElement('span');
		                span.className = 'dropdown-logo-emoji';
		                span.textContent = '•';
		                logoBox.appendChild(span);
		            }

	            // 菜单 portal 在 body 下，通过保存的引用同步选中态。
	            dropdown._menu?.querySelectorAll('.dropdown-item').forEach((item) => {
	                const v = item.getAttribute('data-value');
	                const selected = v === selectElement.value || (v === 'CUSTOM_FIAT' && selectElement.value.startsWith('FIAT:')) || (v === 'CUSTOM_PRODUCT' && selectElement.value.startsWith('PRODUCT:'));
	                item.setAttribute('aria-selected', selected ? 'true' : 'false');
	            });
	        }

	        function closeAllDropdowns(except) {
	            document.querySelectorAll('.dropdown.open').forEach((dd) => {
	                if (except && dd === except) return;
	                dd.classList.remove('open');
	                const trigger = dd.querySelector('.dropdown-trigger');
	                if (trigger) trigger.setAttribute('aria-expanded', 'false');
	                const menu = dd._menu;
	                if (menu) menu.style.display = 'none';
	            });
	        }
	        
        function positionDropdownMenu(dropdown) {
            const trigger = dropdown.querySelector('.dropdown-trigger');
            const menu = dropdown._menu;
            const scroll = menu?.querySelector('.dropdown-menu-scroll');
            if (!trigger || !menu || !scroll) return;

            menu.style.display = 'block';
            menu.style.visibility = 'hidden';
            const vv = window.visualViewport;
            const viewportLeft = vv?.offsetLeft || 0;
            const viewportTop = vv?.offsetTop || 0;
            const viewportWidth = vv?.width || window.innerWidth;
            const viewportHeight = vv?.height || window.innerHeight;
            const margin = 12;
            const gap = 4;
            // Fixed positioning and getBoundingClientRect use the same coordinate space.
            const rect = trigger.getBoundingClientRect();
            const width = Math.min(rect.width, Math.max(0, viewportWidth - margin * 2));
            menu.style.width = `${width}px`;
            scroll.style.maxHeight = `${Math.max(0, Math.min(520, viewportHeight - margin * 2 - 2))}px`;
            const measuredHeight = menu.offsetHeight;
            const belowSpace = viewportTop + viewportHeight - margin - rect.bottom - gap;
            const aboveSpace = rect.top - viewportTop - margin - gap;
            const placeBelow = belowSpace >= Math.min(measuredHeight, 280) || belowSpace >= aboveSpace;
            const availableHeight = Math.max(0, placeBelow ? belowSpace : aboveSpace);
            scroll.style.maxHeight = `${Math.max(0, Math.min(520, availableHeight - 2))}px`;
            const menuHeight = menu.offsetHeight;
            const left = Math.max(viewportLeft + margin, Math.min(rect.left, viewportLeft + viewportWidth - margin - width));
            const top = placeBelow ? rect.bottom + gap : rect.top - gap - menuHeight;
            menu.setAttribute('data-side', placeBelow ? 'bottom' : 'top');
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.visibility = '';
        }

	        function buildCustomDropdown(selectElement) {
	            const wrapper = selectElement.parentElement;
	            if (!wrapper) return;
	            if (wrapper.querySelector('.dropdown')) {
                wrapper.querySelector('.dropdown')._refresh?.();
                updateCustomDropdownTrigger(selectElement);
                return;
            }
            const isPriceCurrency = selectElement.id === 'productCurrency';

		            // 隐藏原生 select，但保留其事件/状态/存储逻辑
		            selectElement.classList.add('native-select-hidden');
                    selectElement.setAttribute('aria-hidden', 'true');
                    selectElement.tabIndex = -1;
                    selectElement.hidden = true;

		            const dropdown = document.createElement('div');
		            dropdown.className = isPriceCurrency ? 'dropdown product-currency-dropdown' : 'dropdown';

	            const trigger = document.createElement('button');
		            trigger.type = 'button';
		            trigger.className = 'dropdown-trigger';
		            trigger.setAttribute('aria-haspopup', isPriceCurrency ? 'dialog' : 'listbox');
		            trigger.setAttribute('aria-expanded', 'false');
                    const menuId = `${selectElement.id}-menu`;
                    trigger.setAttribute('aria-controls', menuId);
                    trigger.id = `${selectElement.id}-trigger`;

	            trigger.innerHTML = `
	                <span class="dropdown-trigger-left">
	                    <span class="dropdown-logo"></span>
	                    <span class="dropdown-text"></span>
	                </span>
	                <svg class="dropdown-chevron" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
	                    <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
	                </svg>
	            `;

		            const menu = document.createElement('div');
		            menu.className = isPriceCurrency ? 'dropdown-menu product-currency-menu' : 'dropdown-menu';
                    menu.id = menuId;
		            menu.setAttribute('role', isPriceCurrency ? 'dialog' : 'listbox');
                    menu.setAttribute('aria-label', isPriceCurrency ? '价格单位选项' : `${selectElement.getAttribute('aria-label')}选项`);
	            // 关键：menu 使用 fixed 定位时，如果在 transform 容器内会发生偏移
	            // 将 menu portal 到 body，保证 fixed 相对视口定位
	            const scroll = document.createElement('div');
	            scroll.className = 'dropdown-menu-scroll';
	            menu.appendChild(scroll);
	            document.body.appendChild(menu);
	            dropdown._menu = menu;

	            const optionHost = isPriceCurrency ? document.createElement('div') : scroll;
            let priceSearch = null, priceEmpty = null;
            const filterPriceOptions = () => {
                if (!priceSearch) return;
                let count = 0;
                for (const item of optionHost.querySelectorAll('.dropdown-item')) {
                    item.hidden = !matchesProductCurrency(item.dataset.value, item.textContent, priceSearch.value);
                    if (!item.hidden) count++;
                }
                priceEmpty.hidden = count > 0;
                scroll.scrollTop = 0;
                if (dropdown.classList.contains('open')) positionDropdownMenu(dropdown);
            };
            if (isPriceCurrency) {
                const header = document.createElement('div'); header.className = 'price-currency-search-header';
                priceSearch = document.createElement('input'); priceSearch.type = 'search';
                priceSearch.className = 'price-currency-search'; priceSearch.placeholder = '搜索币种';
                priceSearch.setAttribute('aria-label', '搜索价格单位'); priceSearch.autocomplete = 'off';
                priceSearch.setAttribute('aria-controls', `${menuId}-options`);
                header.appendChild(priceSearch);
                optionHost.id = `${menuId}-options`; optionHost.setAttribute('role', 'listbox'); optionHost.setAttribute('aria-label', '价格单位搜索结果');
                priceEmpty = document.createElement('p'); priceEmpty.className = 'price-currency-empty';
                priceEmpty.setAttribute('role', 'status'); priceEmpty.textContent = '没有找到币种'; priceEmpty.hidden = true;
                scroll.append(header, optionHost, priceEmpty);
                priceSearch.addEventListener('input', filterPriceOptions);
            }

            // 根据 optgroup/option 构建菜单
            dropdown._refresh = () => {
                optionHost.replaceChildren();
	            const children = Array.from(selectElement.children);
	            for (const child of children) {
	                if (child.tagName === 'OPTGROUP' || child.tagName === 'OPTION') {
                        if (child.tagName === 'OPTGROUP') {
	                    const groupLabel = child.getAttribute('label') || '';
		                    const groupTitle = document.createElement('div');
		                    groupTitle.className = 'dropdown-group';
                            groupTitle.setAttribute('role', 'presentation');
		                    groupTitle.textContent = groupLabel;
	                    optionHost.appendChild(groupTitle);
                        }

	                    const opts = child.tagName === 'OPTION' ? [child] : Array.from(child.querySelectorAll('option'));
	                    for (const opt of opts) {
	                        const value = opt.value;
	                        if (value === 'TEMP_CUSTOM_PLACEHOLDER' || value.startsWith('FIAT:') || value.startsWith('PRODUCT:')) continue;
		                        const item = document.createElement('button');
                                item.type = 'button';
		                        item.className = 'dropdown-item';
	                        item.setAttribute('role', 'option');
	                        item.setAttribute('data-value', value);
	                        item.setAttribute('aria-selected', value === selectElement.value ? 'true' : 'false');

	                        // 显示内容：优先用 currencyLogos（图片/emoji），否则用 option 文本
	                        let displayText = (opt.textContent || value).trim();
	                        let logoType = 'none';
	                        let logo = '';
	                        if (value === 'CUSTOM' || value === 'CUSTOM_FIAT' || value === 'CUSTOM_PRODUCT') {
	                            displayText = value === 'CUSTOM_PRODUCT' ? '自定义实物' : value === 'CUSTOM_FIAT' ? '自定义法币' : '自定义代币';
	                            logoType = 'emoji';
	                            logo = value === 'CUSTOM_PRODUCT' ? '＋' : '🔍';
	                        } else if (!isPriceCurrency && currencyLogos?.[value]) {
	                            const mapped = currencyLogos[value];
	                            logoType = mapped.type;
	                            logo = mapped.logo;
	                            displayText = mapped.text || value;
	                        }

		                        const logoHtml = (() => {
		                            if (logoType === 'image' && logo) return `<span class="dropdown-logo is-image"><img src="${logo}" alt="" onerror="this.remove()"></span>`;
		                            if (logoType === 'emoji' && logo) return `<span class="dropdown-logo is-emoji"><span class="dropdown-logo-emoji">${logo}</span></span>`;
		                            return `<span class="dropdown-logo is-emoji"><span class="dropdown-logo-emoji">•</span></span>`;
		                        })();

	                        if (isPriceCurrency) {
                                const label = document.createElement('span'); label.className = 'dropdown-item-text'; label.textContent = displayText;
                                item.appendChild(label);
                            } else item.innerHTML = `${logoHtml}<span class="dropdown-item-text">${displayText}</span>`;

		                        item.addEventListener('click', () => {
		                            closeAllDropdowns();
		                            trigger.setAttribute('aria-expanded', 'false');
                                    if (value === 'CUSTOM_FIAT') {
                                        openCustomFiatModal(selectElement.id);
                                        return;
                                    }
                                    if (value === 'CUSTOM_PRODUCT') {
                                        openCustomProductModal(selectElement.id);
                                        return;
                                    }
                                    if (value === 'CUSTOM' && selectElement.value !== 'CUSTOM') {
                                        selectElement.setAttribute('data-previous-value', selectElement.value);
                                    }
		                            selectElement.value = value;
		                            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
		                            updateCustomDropdownTrigger(selectElement);
                                    trigger.focus({ preventScroll: true });
		                        });

	                        optionHost.appendChild(item);
	                    }
	                }
	            }

                filterPriceOptions();
                if (dropdown.classList.contains('open')) positionDropdownMenu(dropdown);
            };
            dropdown._refresh();

                    const setDropdownOpen = (open, focusSelected = false) => {
                        closeAllDropdowns(open ? dropdown : null);
                        dropdown.classList.toggle('open', open);
                        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
                        menu.style.display = open ? 'block' : 'none';
                        if (!open) return;
                        if (priceSearch) { priceSearch.value = ''; filterPriceOptions(); }
                        positionDropdownMenu(dropdown);
                        if (priceSearch && !focusSelected && !window.matchMedia('(any-pointer: coarse)').matches) priceSearch.focus({ preventScroll: true });
                        if (focusSelected) {
                            requestAnimationFrame(() => {
                                const selected = menu.querySelector('.dropdown-item[aria-selected="true"]');
                                const fallback = menu.querySelector('.dropdown-item');
                                (selected || fallback)?.focus({ preventScroll: true });
                            });
                        }
                    };

		            trigger.addEventListener('click', (e) => {
		                e.preventDefault();
		                setDropdownOpen(!dropdown.classList.contains('open'));
		            });

                    trigger.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                            e.preventDefault(); e.stopPropagation(); setDropdownOpen(false); return;
                        }
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            setDropdownOpen(true, true);
                        }
                    });

                    menu.addEventListener('keydown', (e) => {
                        const items = Array.from(menu.querySelectorAll('.dropdown-item')).filter(item => !item.hidden);
                        const currentIndex = items.indexOf(document.activeElement);

                        if (e.key === 'Tab') {
                            setDropdownOpen(false); trigger.focus({ preventScroll: true }); return;
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault(); e.stopPropagation();
                            setDropdownOpen(false);
                            trigger.focus({ preventScroll: true });
                            return;
                        }

                        if (e.target === priceSearch && !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
                        let nextIndex = null;
                        if (e.key === 'ArrowDown') nextIndex = Math.min(items.length - 1, currentIndex + 1);
                        if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
                        if (e.key === 'Home') nextIndex = 0;
                        if (e.key === 'End') nextIndex = items.length - 1;
                        if (nextIndex != null) {
                            e.preventDefault();
                            items[nextIndex]?.focus({ preventScroll: true });
                        }
                    });

	            // 监听 select 的变化（包括 restoreState / 自定义代币选择后的更新）
	            selectElement.addEventListener('change', () => updateCustomDropdownTrigger(selectElement));

	            dropdown.appendChild(trigger);
	            wrapper.appendChild(dropdown);
	            updateCustomDropdownTrigger(selectElement);
	        }
        
        
        // 本地常见代币数据库
        function getLocalTokenResults(query) {
            const commonTokens = [
                { id: 'dogecoin', name: 'Dogecoin', symbol: 'doge', large: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png', market_cap_rank: 8 },
                { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png', market_cap_rank: 9 },
                { id: 'polkadot', name: 'Polkadot', symbol: 'dot', large: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.png', market_cap_rank: 12 },
                { id: 'chainlink', name: 'Chainlink', symbol: 'link', large: 'https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png', market_cap_rank: 15 },
                { id: 'polygon', name: 'Polygon', symbol: 'matic', large: 'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png', market_cap_rank: 16 },
                { id: 'avalanche-2', name: 'Avalanche', symbol: 'avax', large: 'https://coin-images.coingecko.com/coins/images/12559/large/coin-round-red.png', market_cap_rank: 17 },
                { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'shib', large: 'https://coin-images.coingecko.com/coins/images/11939/large/shiba.png', market_cap_rank: 18 },
                { id: 'uniswap', name: 'Uniswap', symbol: 'uni', large: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-uni.png', market_cap_rank: 20 },
                { id: 'litecoin', name: 'Litecoin', symbol: 'ltc', large: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png', market_cap_rank: 21 },
                { id: 'near', name: 'NEAR Protocol', symbol: 'near', large: 'https://coin-images.coingecko.com/coins/images/10365/large/near_icon.png', market_cap_rank: 25 },
                { id: 'aptos', name: 'Aptos', symbol: 'apt', large: 'https://coin-images.coingecko.com/coins/images/26455/large/aptos_round.png', market_cap_rank: 30 },
                { id: 'arbitrum', name: 'Arbitrum', symbol: 'arb', large: 'https://coin-images.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg', market_cap_rank: 35 },
                { id: 'optimism', name: 'Optimism', symbol: 'op', large: 'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png', market_cap_rank: 40 }
            ];
            
            const lowerQuery = query.toLowerCase();
            return commonTokens.filter(token => 
                token.name.toLowerCase().includes(lowerQuery) || 
                token.symbol.toLowerCase().includes(lowerQuery)
            );
        }
        
        // 自定义代币的事件监听已合并到上面的currency change事件中
        
        // 打开自定义代币弹窗
        function openCustomTokenModal() {
            invalidateTokenSearch();
            tokenSelectionVersion++;
            const modal = document.getElementById('customTokenModal');
            const searchInput = document.getElementById('tokenSearchInput');
            const currentSelect = currentSelectId ? document.getElementById(currentSelectId) : null;
            customTokenModalReturnFocus =
                currentSelect?.parentElement?.querySelector('.dropdown-trigger') ||
                (document.activeElement instanceof HTMLElement ? document.activeElement : null);

            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            syncModalScrollLock();
            searchInput.value = '';
            document.getElementById('searchResults').innerHTML = '';
            setupSearchInputListener(); // 设置回车键监听

            // 自定义触发器不会唤起原生 select，可在下一帧直接聚焦搜索，避免人为等待。
            requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
        }
        
        // 关闭自定义代币弹窗
        function closeCustomTokenModal() {
            invalidateTokenSearch();
            tokenSelectionVersion++;
            const modal = document.getElementById('customTokenModal');
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            
            // 如果用户没有选择新代币就关闭弹窗，保持当前状态
            if (currentSelectId) {
                const currentSelect = document.getElementById(currentSelectId);
                if (currentSelect && currentSelect.value === 'CUSTOM') {
                    const customOption = currentSelect.querySelector('option[value="CUSTOM"]');
                    const hasToken = customOption && customOption.getAttribute('data-token-key');
                    
                    if (!hasToken) {
                        // 第一次使用自定义代币但没有选择，恢复到之前的选择
                        const previousValue = currentSelect.getAttribute('data-previous-value');
                        if (previousValue && previousValue !== 'CUSTOM') {
                            currentSelect.value = previousValue;
                        } else {
                            currentSelect.value = 'BTC';
                        }
                    }
                    // 如果已经有代币，保持CUSTOM选择不变
                    updateCustomDropdownTrigger(currentSelect);
                }
            }
            
            currentSelectId = null;
            syncModalScrollLock();
            if (customTokenModalReturnFocus?.isConnected) customTokenModalReturnFocus.focus();
            customTokenModalReturnFocus = null;
        }
        
        // 点击弹窗外部关闭
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('customTokenModal');
            if (event.target === modal) {
                closeCustomTokenModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            const modal = document.getElementById('customTokenModal');
            if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
                closeCustomTokenModal();
            }
        });
        
        // 搜索代币
	        let tokenSearchVersion = 0;
        let tokenSelectionVersion = 0;

        function invalidateTokenSearch() {
            tokenSearchVersion++;
            clearTimeout(searchTimeout);
            document.getElementById('loadingIndicator').style.display = 'none';
        }

        async function searchTokens() {
            const query = document.getElementById('tokenSearchInput').value.trim();
            const version = ++tokenSearchVersion;
            if (!query) return;
            const loading = document.getElementById('loadingIndicator');
            const results = document.getElementById('searchResults');
            const isCurrent = () => version === tokenSearchVersion && currentSelectId &&
                document.getElementById('tokenSearchInput').value.trim() === query;
            loading.style.display = 'block';
            results.replaceChildren();
            const key = query.toLowerCase();
            try {
                let cached = tokenSearchSessionCache.get(key);
                if (!cached || nowMs() - cached.ts > 5 * 60 * 1000) {
                    const data = await fetchCoinGeckoJson('search', { query: key });
                    if (!Array.isArray(data?.coins)) throw new Error('搜索数据无效');
                    cached = { ts: nowMs(), coins: data.coins.filter(coin => coin && typeof coin.id === 'string' && typeof coin.symbol === 'string' && typeof coin.name === 'string') };
                    tokenSearchSessionCache.set(key, cached);
                    if (tokenSearchSessionCache.size > 50) tokenSearchSessionCache.delete(tokenSearchSessionCache.keys().next().value);
                }
                if (isCurrent()) displaySearchResults(cached.coins);
            } catch (error) {
                if (isCurrent()) {
                    const fallback = tokenSearchSessionCache.get(key)?.coins || getLocalTokenResults(query);
                    displaySearchResults(fallback);
                    const note = document.createElement('div');
                    note.className = 'no-results';
                    note.textContent = fallback.length ? '搜索暂不可用，显示已缓存或常见代币；选择时仍需获取价格。' :
                        error.status === 429 ? '搜索过于频繁，请稍后重试' : '搜索暂不可用，请稍后重试';
                    results.prepend(note);
                }
            } finally { if (isCurrent()) loading.style.display = 'none'; }
        }

        function displaySearchResults(coins) {
            const results = document.getElementById('searchResults');
            results.replaceChildren();
            if (!coins.length) {
                const empty = document.createElement('div');
                empty.className = 'no-results'; empty.textContent = '未找到相关代币';
                results.append(empty); return;
            }
            for (const coin of coins.slice(0, 10)) {
                const item = document.createElement('div'); item.className = 'token-result';
                item.setAttribute('role', 'button'); item.tabIndex = 0;
                item.onclick = () => selectCustomToken(coin);
                item.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCustomToken(coin); } };
                const image = document.createElement('img'); image.className = 'token-logo'; image.alt = '';
                const logo = normalizeTokenLogo(coin.large || coin.thumb || coin.image);
                if (logo) image.src = logo; else image.hidden = true;
                image.onerror = () => { image.hidden = true; };
                const content = document.createElement('div'); content.className = 'token-content';
                const name = document.createElement('div'); name.className = 'token-name'; name.textContent = coin.name;
                const bottom = document.createElement('div'); bottom.className = 'token-bottom-row';
                const symbol = document.createElement('div'); symbol.className = 'token-symbol'; symbol.textContent = coin.symbol;
                const rank = document.createElement('div'); rank.className = 'token-price'; rank.textContent = `市值排名: ${coin.market_cap_rank || 'N/A'}`;
                bottom.append(symbol, rank); content.append(name, bottom); item.append(image, content); results.append(item);
            }
        }

        async function selectCustomToken(coin) {
            const selectId = currentSelectId;
            if (!selectId) return;
            const version = ++tokenSelectionVersion;
            const isCurrent = () => version === tokenSelectionVersion && currentSelectId === selectId;
            showToast('正在获取代币价格');
            try {
                const result = await getCoinGeckoPrices([coin.id]);
                if (!isCurrent()) return;
                const price = result.prices[coin.id];
                if (!Number.isFinite(price) || price <= 0) throw result.error || new Error('该代币暂无可用价格');
                const key = `CG:${coin.id}`;
                const logo = normalizeTokenLogo(coin.large || coin.thumb || coin.image);
                customTokens.set(key, { id: coin.id, name: coin.name, symbol: coin.symbol, image: logo, price, isEstimated: false });
                const select = document.getElementById(selectId);
                const option = select.querySelector('option[value="CUSTOM"]');
                for (const [attribute, value] of Object.entries({
                    'data-token-key': key, 'data-token-name': coin.name, 'data-token-symbol': coin.symbol.toUpperCase(),
                    'data-token-logo': logo, 'data-display-text': coin.symbol.toUpperCase()
                })) option.setAttribute(attribute, value);
                select.value = 'CUSTOM'; select.setAttribute('data-previous-value', 'CUSTOM');
                usdPrices[key] = price;
                updateSelectDisplay(select);
                const index = Number(selectId.replace('currency', ''));
                closeCustomTokenModal();
                convert(index); saveState();
                if (result.staleIds.length) showToast('实时价格暂不可用，使用最近缓存价格');
            } catch (error) {
                if (isCurrent()) showToast(error.status === 429 ? '请求过于频繁，请稍后再试' : '获取价格失败，请稍后重试');
            }
        }

        // 搜索防抖
        let searchTimeout;
        
        // 自动搜索监听器 - 在弹窗打开时设置
        function setupSearchInputListener() {
            const input = document.getElementById('tokenSearchInput');
            if (input && !input.hasSearchListener) {
                // 手机端特殊处理：添加触摸和聚焦事件
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                if (isMobile) {
                    // 手机端：添加触摸事件来触发聚焦
                    input.addEventListener('touchstart', function(e) {
                        e.stopPropagation(); // 防止事件冒泡
                        this.focus();
                    });
                    
                    // 手机端：当用户第一次点击输入框时自动聚焦
                    input.addEventListener('click', function() {
                        this.placeholder = '输入代币名称或符号...';
                        this.focus();
                    });
                }
                
                input.addEventListener('input', function(e) {
                    const query = e.target.value.trim();
                    invalidateTokenSearch();
                    tokenSelectionVersion++;
                    
                    // 清除之前的搜索定时器
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                    }
                    
                    if (query === '') {
                        // 如果输入为空，清空结果
                        document.getElementById('searchResults').innerHTML = '';
                        document.getElementById('loadingIndicator').style.display = 'none';
                        return;
                    }
                    
                    // 设置防抖延迟：输入停止300毫秒后开始搜索
                    searchTimeout = setTimeout(() => {
                        searchTokens();
                    }, 300);
                });
                
                // 保留回车键搜索
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        if (searchTimeout) {
                            clearTimeout(searchTimeout);
                        }
                        searchTokens();
                    }
                });
                
                input.hasSearchListener = true;
            }
        }

        // ===== 移动端内嵌键盘（页面 UI 的一部分，仅手机端显示）=====
        let mobileKeyboardEl = null;
        let mobileKbActiveInput = null;   // 当前活跃的 amount 输入框元素
        let mobileKbActiveIndex = null;   // 当前活跃的栏位编号 (1~6)

        /**
         * 构建键盘 DOM 并插入 .container 底部
         * 布局：5 行 × 4 列，与页面其他元素风格统一
         */
        function buildMobileKeyboard() {
            if (mobileKeyboardEl) return;

            const container = document.querySelector('.container');
            if (!container) return;

	            const kb = document.createElement('div');
	            kb.className = 'mobile-keyboard';
	            kb.id = 'mobileKeyboard';
                kb.setAttribute('role', 'group');
                kb.setAttribute('aria-label', '计算键盘');

            // 键盘布局定义
            const rows = [
                [
                    { label: 'C', value: 'clear', cls: 'action' },
                    { label: '', value: 'backspace', cls: 'action', isSvg: true },
                    { label: '×', value: '*', cls: 'operator' },
                    { label: '÷', value: '/', cls: 'operator' },
                ],
                [
                    { label: '7', value: '7' },
                    { label: '8', value: '8' },
                    { label: '9', value: '9' },
                    { label: '−', value: '-', cls: 'operator' },
                ],
                [
                    { label: '4', value: '4' },
                    { label: '5', value: '5' },
                    { label: '6', value: '6' },
                    { label: '+', value: '+', cls: 'operator' },
                ],
                [
                    { label: '1', value: '1' },
                    { label: '2', value: '2' },
                    { label: '3', value: '3' },
                    { label: '.', value: '.' },
                ],
                [
                    { label: '0', value: '0', wide: true },
                    { label: '00', value: '00' },
                    { label: '=', value: 'equals', cls: 'equals' },
                ],
            ];

            rows.forEach((row) => {
                const rowDiv = document.createElement('div');
                rowDiv.className = 'kb-row';

                row.forEach((key) => {
                    const btn = document.createElement('button');
	                    btn.type = 'button';
	                    btn.className = 'kb-key' + (key.cls ? ` ${key.cls}` : '');
	                    btn.setAttribute('data-value', key.value);
                        const keyLabels = {
                            clear: '清空',
                            backspace: '退格',
                            '*': '乘',
                            '/': '除',
                            '-': '减',
                            '+': '加',
                            equals: '等于',
                        };
                        btn.setAttribute('aria-label', keyLabels[key.value] || key.label);
	                    if (key.wide) btn.classList.add('wide');

                    if (key.isSvg) {
                        // 退格图标
	                        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
                    } else {
                        btn.textContent = key.label;
                    }

                    // 触屏：touchstart 阻止系统键盘弹出，touchend 执行按键逻辑
                    let touched = false;
                    btn.addEventListener('touchstart', (e) => {
                        e.preventDefault();
                        touched = true;
                    }, { passive: false });

                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        if (touched) {
                            touched = false;
                            handleMobileKeyPress(key.value);
                        }
                    }, { passive: false });

                    // 桌面端：按下时阻止按钮抢走输入框焦点，保持活跃栏位不变
                    btn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                    });

                    // 桌面端（鼠标点击）
                    btn.addEventListener('click', (e) => {
                        if (touched) return; // 避免触屏设备重复触发
                        e.preventDefault();
                        e.stopPropagation();
                        handleMobileKeyPress(key.value);
                    });

                    rowDiv.appendChild(btn);
                });

                kb.appendChild(rowDiv);
            });

            // 插入到 .container 末尾，成为页面的一部分
            container.appendChild(kb);
            mobileKeyboardEl = kb;
        }

        /** 切换当前活跃的输入框 */
        function setActiveKbInput(inputIndex) {
            // 移除上一个输入框的高亮
            if (mobileKbActiveInput) {
                mobileKbActiveInput.classList.remove('kb-active-input');
            }

            mobileKbActiveIndex = inputIndex;
            mobileKbActiveInput = document.getElementById(`amount${inputIndex}`);

            if (mobileKbActiveInput) {
                mobileKbActiveInput.classList.add('kb-active-input');
            }
        }

        /** “等于”：把输入框中的算式就地替换为计算结果（如 1+1 → 2） */
        function applyEqualsToInput(input) {
            if (!input) return;
            const raw = input.value;
            // 空值或纯数字无需计算；算式非法/不完整（如 "1+"）时保持原样不动
            if (!raw || isLikelyPlainNumberInput(raw)) return;
            const result = evaluateMathExpression(raw);
            if (!Number.isFinite(result)) return;
            input.value = formatNumberForDisplay(result);
            // 触发 input 事件，复用既有的千分位格式化、换算、保存逻辑
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        /** 处理键盘按键 */
        function handleMobileKeyPress(value) {
            if (!mobileKbActiveInput) {
                // 如果没有活跃输入框，默认激活第一个
                setActiveKbInput(1);
            }

            const input = mobileKbActiveInput;
            if (!input) return;

            switch (value) {
                case 'clear':
                    input.value = '';
                    break;

                case 'backspace':
                    input.value = input.value.slice(0, -1);
                    break;

                case 'equals':
                    // 求值内部自行触发 input 事件，这里直接返回
                    applyEqualsToInput(input);
                    return;

                default:
                    // 追加字符（数字、运算符、小数点、00）
                    input.value += value;
                    break;
            }

            // 触发 input 事件，激活已有的格式化、换算、保存逻辑
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        /** 初始化内嵌键盘（手机端在栏位下方；桌面端由 CSS 布局到栏位右侧） */
        function initMobileKeyboard() {
            buildMobileKeyboard();

            const mobile = isMobileDevice();
            for (let i = 1; i <= 6; i++) {
                const input = document.getElementById(`amount${i}`);
                if (!input) continue;

                if (mobile) {
                    // 移动端：输入框设为 readonly，阻止系统键盘弹出，只能用内嵌键盘
                    input.setAttribute('readonly', 'readonly');
                    input.setAttribute('inputmode', 'none');

                    // 点击输入框时切换为当前活跃目标
                    input.addEventListener('click', (e) => {
                        e.preventDefault();
                        setActiveKbInput(i);
                    });
                } else {
                    // 桌面端：保留物理键盘直接输入，聚焦即成为内嵌键盘的目标栏位
                    input.addEventListener('focus', () => setActiveKbInput(i));
                }
            }

            // 默认激活第一个输入框
            setActiveKbInput(1);

            console.log(mobile ? '📱 移动端内嵌键盘已初始化' : '🖥️ 桌面端内嵌键盘已初始化');
        }
        
    
