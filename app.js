		        let rates = {};
		        let updating = false;
		        let lastInputField = 1; // 记录最后一次输入数字的栏位
		        let localStorageAvailable = false;
		        let loadRatesInFlight = null;

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
		        const CACHE_VERSION = 1;
		        const CACHE_KEYS = {
	            presetCryptoPrices: `valueConverter:caches:v${CACHE_VERSION}:presetCryptoPrices`,
	            binanceSpotPrices: `valueConverter:caches:v${CACHE_VERSION}:binanceSpotPrices`,
	            okxSpotPrices: `valueConverter:caches:v${CACHE_VERSION}:okxSpotPrices`,
	            fiatRates: `valueConverter:caches:v${CACHE_VERSION}:fiatRates`,
	            coingeckoTokenPrice: `valueConverter:caches:v${CACHE_VERSION}:coingeckoTokenPrice`
	        };
	        
	        const memoryCache = new Map();
	        
	        function nowMs() {
	            return Date.now();
	        }
	        
	        function readCache(key, maxAgeMs) {
	            const raw = (() => {
	                if (localStorageAvailable) {
	                    try {
	                        return localStorage.getItem(key);
	                    } catch (e) {
	                        return null;
	                    }
	                }
	                return memoryCache.get(key) || null;
	            })();
	            
	            if (!raw) return null;
	            
	            try {
	                const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
	                if (!payload || typeof payload.ts !== 'number') return null;
	                if (typeof maxAgeMs === 'number' && maxAgeMs >= 0) {
	                    if (nowMs() - payload.ts > maxAgeMs) return null;
	                }
	                return payload;
	            } catch (e) {
	                return null;
	            }
	        }
	        
	        function writeCache(key, data) {
	            const payload = { ts: nowMs(), data };
	            if (localStorageAvailable) {
	                try {
	                    localStorage.setItem(key, JSON.stringify(payload));
	                } catch (e) {
	                    // localStorage 满了或不可用时，退回内存缓存
	                    memoryCache.set(key, payload);
	                }
	            } else {
	                memoryCache.set(key, payload);
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
	        
		        // ===== 预设币种实时价格（CoinPaprika）=====
		        // 说明：使用 CoinPaprika 的 ticker 接口获取 5 个预设主流代币的 USD 实时价格。
		        const COINPAPRIKA_TICKER_URLS = {
		            BTC: 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin/',
		            ETH: 'https://api.coinpaprika.com/v1/tickers/eth-ethereum',
		            BNB: 'https://api.coinpaprika.com/v1/tickers/bnb-bnb/',
		            OKB: 'https://api.coinpaprika.com/v1/tickers/okb-okb/',
		            SOL: 'https://api.coinpaprika.com/v1/tickers/sol-solana/'
		        };
		        
		        async function fetchCoinPaprikaUsdPrice({ symbol, url }) {
		            const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 8000);
		            if (!res.ok) {
		                const error = new Error(`CoinPaprika 请求失败（${symbol}）: ${res.status}`);
		                error.status = res.status;
		                throw error;
		            }
		            
		            const data = await res.json();
		            const priceRaw = data?.quotes?.USD?.price;
		            const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(priceRaw);
		            if (!Number.isFinite(price) || price <= 0) {
		                throw new Error(`CoinPaprika 返回数据异常，缺少 ${symbol} USD 价格`);
		            }
		            return price;
		        }
		        
		        async function getPresetCryptoPrices({ forceRefresh = false } = {}) {
		            const TTL_MS = 30 * 1000; // 30秒：组合价格缓存
		            if (!forceRefresh) {
		                const cached = readCache(CACHE_KEYS.presetCryptoPrices, TTL_MS);
		                if (cached?.data) return { prices: cached.data, source: 'cache', ts: cached.ts };
		            }
		            
		            const entries = await Promise.all(
		                Object.entries(COINPAPRIKA_TICKER_URLS).map(async ([symbol, url]) => {
		                    const price = await fetchCoinPaprikaUsdPrice({ symbol, url });
		                    return [symbol, price];
		                })
		            );
		            const prices = Object.fromEntries(entries);
		            
		            for (const k of ['BTC', 'ETH', 'BNB', 'SOL', 'OKB']) {
		                if (!Number.isFinite(prices[k]) || prices[k] <= 0) throw new Error(`预设币种价格不完整，缺少 ${k}`);
		            }
		            
		            writeCache(CACHE_KEYS.presetCryptoPrices, prices);
		            return { prices, source: 'realtime', ts: nowMs() };
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
	            const presetCryptoSet = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'OKB']);
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
	                const isCrypto = (value === 'CUSTOM') || presetCryptoSet.has(value);
	                
	                if (value === 'CUSTOM') {
	                    const customOption = selectEl.querySelector('option[value="CUSTOM"]');
	                    const displayText = customOption?.getAttribute('data-display-text');
	                    label = displayText ? `${displayText}` : '自定义代币';
	                    // 分享图：加密货币不展示 Logo（按需只在 ticker 前加 $）
	                    logoType = 'none';
	                    logo = '';
	                } else {
	                    // 优先使用与界面一致的映射（emoji/logo + 显示文本）
	                    const mapped = (typeof currencyLogos !== 'undefined') ? currencyLogos[value] : null;
	                    if (mapped) {
	                        label = mapped.text || value;
	                        // 分享图：加密货币不展示 Logo；非加密可展示 emoji / 图片
	                        if (presetCryptoSet.has(value)) {
	                            logoType = 'none';
	                            logo = '';
	                        } else if (mapped.type === 'image' && mapped.logo) {
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
	                    isCrypto,
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
	                ctx.textBaseline = 'middle';
	                ctx.fillText(logo, x, y + 1);
	            }
	            ctx.restore();
	        }

	        async function preloadShareLogoBitmaps(rows) {
	            const sources = Array.from(
	                new Set(
	                    rows
	                        .filter((row) => row.logoType === 'image' && row.logo)
	                        .map((row) => row.logo)
	                )
	            );
	            const bitmaps = new Map();
	            await Promise.all(
	                sources.map(async (src) => {
	                    try {
	                        const res = await fetch(src, { mode: 'cors', credentials: 'same-origin' });
	                        if (!res.ok) throw new Error(`logo fetch failed: ${res.status}`);
	                        const blob = await res.blob();
	                        await new Promise((resolve) => {
	                            const img = new Image();
	                            const objectUrl = URL.createObjectURL(blob);
	                            img.onload = () => {
	                                URL.revokeObjectURL(objectUrl);
	                                bitmaps.set(src, img);
	                                resolve();
	                            };
	                            img.onerror = () => {
	                                URL.revokeObjectURL(objectUrl);
	                                bitmaps.set(src, null);
	                                resolve();
	                            };
	                            img.src = objectUrl;
	                        });
	                    } catch (e) {
	                        bitmaps.set(src, null);
	                    }
	                })
	            );
	            return bitmaps;
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
						                const shouldDrawLogo = !primaryForMeasure.isCrypto;
						                const amountFont = `400 ${primaryAmountFontSizeForLayout}px "PingFang SC"`;
						                const tickerFont = `400 ${primaryTickerFontSizeForLayout}px "PingFang SC"`;
						                const amountW = measureText(amountFont, primaryForMeasure.amount);
						                const tickerLabel = primaryForMeasure.isCrypto ? `$${primaryForMeasure.label}` : primaryForMeasure.label;
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
					                    const shouldDrawLogo = !r.isCrypto;
					                    const amountW = measureText(amountFont, r.amount) + 14;
					                    const tickerLabel = r.isCrypto ? `$${r.label}` : r.label;
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
				                const hasInlineLogo = row.logoType === 'emoji'
				                    ? !!row.logo
				                    : row.logoType === 'image'
				                        ? !!row.bitmap
				                        : false;
				                const shouldDrawLogo = !row.isCrypto && hasInlineLogo;
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
					                    ctx.fillText(prefix, cursorX, textY);
					                    cursorX += ctx.measureText(prefix).width + 14;
					                }
				                
						                // amount
						                ctx.fillStyle = ACCENT;
						                ctx.font = `400 ${amountFontSize}px "PingFang SC"`;
						                let reservedTail = 0;
						                const tickerLabel = row.isCrypto ? `$${row.label}` : row.label;
						                if (showPrefix) {
						                    const prevFont = ctx.font;
						                    ctx.font = `400 ${tickerFontSize}px "PingFang SC"`;
						                    const tickerW = ctx.measureText(tickerLabel).width;
						                    ctx.font = prevFont;
						                    reservedTail = (shouldDrawLogo ? (iconSize + iconGap) : 0) + tickerW + 20;
						                }
					                const amountMaxW = Math.max(140, w - (cursorX - x) - reservedTail);
					                const amountText = ellipsize(row.amount, amountMaxW);
					                ctx.fillText(amountText, cursorX, textY);
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
					                        const iconCy = textY - getTextCenterOffset(tickerFontSize, ticker);
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
					                    ctx.fillText(ticker, cursorX, textY);
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

        function closeShareImageModal() {
            const modal = document.getElementById('shareImageModal');
            if (modal) modal.style.display = 'none';
            const img = document.getElementById('shareImagePreview');
            if (img) img.src = '';
            if (shareImageObjectUrl) {
                URL.revokeObjectURL(shareImageObjectUrl);
                shareImageObjectUrl = null;
            }
            shareImageBlob = null;
        }

	        function openShareImageModal(blob) {
	            shareImageBlob = blob;
	            const modal = document.getElementById('shareImageModal');
	            const img = document.getElementById('shareImagePreview');
	            if (!modal || !img) return;

	            if (shareImageObjectUrl) URL.revokeObjectURL(shareImageObjectUrl);
	            shareImageObjectUrl = URL.createObjectURL(blob);
	            img.src = shareImageObjectUrl;
	            modal.style.display = 'block';
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
                    if (e.key === 'Escape' && modal.style.display === 'block') {
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
        window.addEventListener('scroll', () => {
            document.querySelectorAll('.dropdown.open').forEach((dd) => positionDropdownMenu(dd));
        }, { passive: true });

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
        });
        
        // 点击添加到主屏幕按钮
        addToHomeBtn.addEventListener('click', async () => {
            const isMobile = isMobileDevice();
            
            if (!isMobile) {
                // 桌面端提示
                showDesktopPrompt();
                return;
            }
            
            if (deferredPrompt) {
                // Android Chrome: 直接触发安装提示
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA安装结果: ${outcome}`);
                if (outcome === 'accepted') {
                    alert('应用已成功添加到主屏幕！🎉');
                }
                deferredPrompt = null;
            } else {
                // 移动端手动指引
                if (window.navigator.standalone === false) {
                    // iOS Safari: 显示更直观的添加指引
                    showIOSInstallPrompt();
                } else {
                    // 显示手动添加指引
                    showManualInstallInstructions();
                }
            }
        });
        
        // 桌面端提示
        function showDesktopPrompt() {
            const popup = document.createElement('div');
            popup.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
	                    font-family: "PingFang SC";
                    animation: fadeIn 0.3s ease-out;
                ">
                    <div style="
                        background: white;
                        padding: 30px;
                        border-radius: 20px;
                        text-align: center;
                        max-width: 380px;
                        margin: 20px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        animation: slideUp 0.3s ease-out;
                    ">
                        <div style="margin-bottom: 20px;">
                            <svg width="60" height="60" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	                                <path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zM7 4V3h10v1H7zM7 18V6h10v12H7zM7 21v-1h10v1H7z" fill="#1d1d1f"/>
	                                <path d="M12 8l-4 4h2.5v3h3v-3H16l-4-4z" fill="#1d1d1f"/>
	                            </svg>
	                        </div>
	                        <h3 style="margin: 0 0 15px 0; color: #1d1d1f; font-size: 24px;">移动设备专享</h3>
	                        <p style="color: #6e6e73; font-size: 16px; line-height: 1.6; margin: 15px 0;">
	                            添加到主屏幕功能需要在手机上使用
	                        </p>
	                        <p style="color: #6e6e73; font-size: 14px; line-height: 1.5; margin: 15px 0;">
	                            请用手机浏览器打开本网站，<br>
	                            即可将价值观纠正器添加到手机主屏幕
	                        </p>
	                        <button onclick="this.parentElement.parentElement.remove()" style="
	                            background: #1d1d1f;
	                            color: white;
	                            border: none;
	                            padding: 12px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            transition: transform 0.2s;
                            margin-top: 10px;
                        ">知道了</button>
                    </div>
                </div>
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { transform: translateY(30px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                </style>
            `;
            document.body.appendChild(popup);
            
            // 点击外部关闭
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    popup.remove();
                }
            });
        }

        // iOS专门的安装提示
        function showIOSInstallPrompt() {
            const popup = document.createElement('div');
            popup.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    font-family: "PingFang SC";
                    animation: fadeIn 0.3s ease-out;
                ">
                    <div style="
                        background: white;
                        padding: 25px;
                        border-radius: 20px;
                        text-align: center;
                        max-width: 320px;
                        margin: 20px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        animation: slideUp 0.3s ease-out;
                    ">
                        <div style="margin-bottom: 15px;">
                            <svg width="50" height="50" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	                                <path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zM7 4V3h10v1H7zM7 18V6h10v12H7zM7 21v-1h10v1H7z" fill="#1d1d1f"/>
	                                <path d="M12 8l-4 4h2.5v3h3v-3H16l-4-4z" fill="#1d1d1f"/>
	                            </svg>
	                        </div>
	                        <h3 style="margin: 0 0 15px 0; color: #1d1d1f; font-size: 20px;">添加到主屏幕</h3>
	                        <p style="color: #1d1d1f; font-size: 14px; line-height: 1.5; margin: 10px 0;">
	                            <span style="display: inline-block; width: 20px; height: 20px; background: #1d1d1f; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 12px; margin-right: 8px;">1</span>
	                            点击底部的"分享"按钮
	                        </p>
	                        <p style="color: #1d1d1f; font-size: 14px; line-height: 1.5; margin: 10px 0;">
	                            <span style="display: inline-block; width: 20px; height: 20px; background: #1d1d1f; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 12px; margin-right: 8px;">2</span>
	                            选择"添加到主屏幕"
	                        </p>
	                        <p style="color: #1d1d1f; font-size: 14px; line-height: 1.5; margin: 10px 0 20px 0;">
	                            <span style="display: inline-block; width: 20px; height: 20px; background: #1d1d1f; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 12px; margin-right: 8px;">3</span>
	                            点击"添加"完成
	                        </p>
	                        <button onclick="this.parentElement.parentElement.remove()" style="
	                            background: #1d1d1f;
	                            color: white;
	                            border: none;
	                            padding: 12px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            transition: transform 0.2s;
                        ">知道了</button>
                    </div>
                </div>
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { transform: translateY(30px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                </style>
            `;
            document.body.appendChild(popup);
            
            // 点击外部关闭
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    popup.remove();
                }
            });
        }

        // 手动添加指引
        function showManualInstallInstructions() {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isAndroid = /Android/.test(navigator.userAgent);
            
            let message = '';
            if (isIOS) {
                message = '在Safari中：\n1. 点击底部分享按钮 📤\n2. 选择"添加到主屏幕"\n3. 点击"添加"';
            } else if (isAndroid) {
                message = '在Chrome中：\n1. 点击右上角菜单 ⋮\n2. 选择"添加到主屏幕"\n3. 点击"添加"';
            } else {
                message = '请在移动设备上使用浏览器的"添加到主屏幕"功能';
            }
            
            alert(message);
        }
        
        // 检查是否已经安装
        window.addEventListener('appinstalled', () => {
            console.log('PWA已安装到主屏幕');
            addToHomeBtn.style.display = 'none';
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
		            coinpaprika: true,
		            exchangerate: true,
		            coingecko: true, // 仅用于“自定义代币”相关功能（搜索/价格）
		            rateLimited: false,
		            backoffUntil: 0
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
	                statusElement.style.color = '#6e6e73';
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
	            // 显示加载状态
	            const statusElement = document.getElementById('apiStatus');
	            if (statusElement) {
	                statusElement.innerHTML = '汇率加载中';
                statusElement.style.color = '#6e6e73';
                statusElement.style.display = 'block';
	            }
	            
	            try {
	                console.log(`loadRates 开始，原因: ${reason}, forceRefresh: ${forceRefresh}`);
	                
	                // 如果正在退避（例如被限流），强制走缓存，避免雪上加霜
	                if (apiStatus.backoffUntil && nowMs() < apiStatus.backoffUntil) {
	                    forceRefresh = false;
	                }
	                
	                const [{ prices: cryptoPrices, source: cryptoSource, ts: cryptoTs }, { fiatData, source: fiatSource, ts: fiatTs }] =
	                    await Promise.all([
		                        (async () => {
			                            try {
			                                const r = await getPresetCryptoPrices({ forceRefresh });
			                                apiStatus.preset = true;
			                                apiStatus.coinpaprika = true;
			                                apiStatus.rateLimited = false;
			                                return r;
			                            } catch (e) {
			                                console.warn('预设币种价格获取失败，尝试使用缓存:', e);
			                                apiStatus.preset = false;
			                                apiStatus.coinpaprika = false;
			                                if (e?.status === 429) {
			                                    apiStatus.rateLimited = true;
			                                    apiStatus.backoffUntil = nowMs() + 10 * 60 * 1000; // 10分钟退避
			                                }
	                                const stale = readCache(CACHE_KEYS.presetCryptoPrices, -1);
	                                if (stale?.data) return { prices: stale.data, source: 'stale-cache', ts: stale.ts };
	                                throw e;
	                            }
	                        })(),
		                        (async () => {
		                            try {
		                                const r = await getFiatRates({ forceRefresh });
		                                apiStatus.exchangerate = true;
		                                apiStatus.rateLimited = false;
		                                return r;
		                            } catch (e) {
		                                console.warn('ExchangeRate 获取失败，尝试使用缓存:', e);
		                                apiStatus.exchangerate = false;
		                                if (e?.status === 429) {
		                                    apiStatus.rateLimited = true;
		                                    apiStatus.backoffUntil = nowMs() + 10 * 60 * 1000; // 10分钟退避
		                                }
	                                const stale = readCache(CACHE_KEYS.fiatRates, -1);
	                                if (stale?.data) return { fiatData: stale.data, source: 'stale-cache', ts: stale.ts };
	                                throw e;
	                            }
	                        })()
	                    ]);
	                
	                const currencies = ['CNY', 'JPY', 'KRW', 'SGD', 'AED', 'HKD', 'MYR', 'TWD'];
	                const cryptos = ['BTC', 'ETH', 'SOL', 'BNB', 'OKB'];
                const products = ['ZHUJIAO', 'KFC', 'IN11', 'IPHONE17', 'FERRARI_SF90', 'PATEK', 'XIAOXIAO_HOME', 'MACBOOK'];
	                const productPrices = { 
	                    ZHUJIAO: 20 / fiatData.rates.CNY,       // 20 CNY 转换为 USD
	                    KFC: 50 / fiatData.rates.CNY,           // 50 CNY 转换为 USD
	                    IN11: 3000 / fiatData.rates.CNY,        // 3000 CNY 转换为 USD
                    IPHONE17: 799,                          // 799 USD
                    FERRARI_SF90: 8500000 / fiatData.rates.CNY, // 8,500,000 CNY 转换为 USD
                    PATEK: 1200000 / fiatData.rates.CNY,    // 1,200,000 CNY 转换为 USD
                    XIAOXIAO_HOME: 74540000 / fiatData.rates.CNY, // 74,540,000 CNY 转换为 USD
                    MACBOOK: 999                            // 999 USD
                };
                
                rates = {};
                
                // 构建汇率矩阵
                // 获取自定义代币符号列表
                const customTokenSymbols = customTokens ? Array.from(customTokens.keys()) : [];
                const allCurrencies = [...cryptos, ...customTokenSymbols, 'USD', ...currencies, ...products];
                allCurrencies.forEach(from => {
                    rates[from] = {};
                    allCurrencies.forEach(to => {
                        if (from === to) {
                            rates[from][to] = 1;
                        } else if (cryptos.includes(from) && cryptos.includes(to)) {
                            // 加密货币之间
                            rates[from][to] = cryptoPrices[from] / cryptoPrices[to];
                        } else if (cryptos.includes(from) && to === 'USD') {
                            // 加密货币到美元
                            rates[from][to] = cryptoPrices[from];
                        } else if (from === 'USD' && cryptos.includes(to)) {
                            // 美元到加密货币
                            rates[from][to] = 1 / cryptoPrices[to];
                        } else if (cryptos.includes(from) && currencies.includes(to)) {
                            // 加密货币到其他法币
                            rates[from][to] = cryptoPrices[from] * fiatData.rates[to];
                        } else if (currencies.includes(from) && cryptos.includes(to)) {
                            // 其他法币到加密货币
                            rates[from][to] = 1 / (cryptoPrices[to] * fiatData.rates[from]);
                        } else if (customTokens && customTokenSymbols.includes(from) && customTokenSymbols.includes(to)) {
                            // 自定义代币之间
                            const fromPrice = customTokens.get(from).price;
                            const toPrice = customTokens.get(to).price;
                            rates[from][to] = fromPrice / toPrice;
                        } else if (customTokens && customTokenSymbols.includes(from) && to === 'USD') {
                            // 自定义代币到美元
                            rates[from][to] = customTokens.get(from).price;
                        } else if (customTokens && from === 'USD' && customTokenSymbols.includes(to)) {
                            // 美元到自定义代币
                            rates[from][to] = 1 / customTokens.get(to).price;
                        } else if (customTokens && customTokenSymbols.includes(from) && cryptos.includes(to)) {
                            // 自定义代币到预设加密货币
                            const fromPrice = customTokens.get(from).price;
                            rates[from][to] = fromPrice / cryptoPrices[to];
                        } else if (customTokens && cryptos.includes(from) && customTokenSymbols.includes(to)) {
                            // 预设加密货币到自定义代币
                            const toPrice = customTokens.get(to).price;
                            rates[from][to] = cryptoPrices[from] / toPrice;
                        } else if (customTokens && customTokenSymbols.includes(from) && currencies.includes(to)) {
                            // 自定义代币到其他法币
                            const fromPrice = customTokens.get(from).price;
                            rates[from][to] = fromPrice * fiatData.rates[to];
                        } else if (customTokens && currencies.includes(from) && customTokenSymbols.includes(to)) {
                            // 其他法币到自定义代币
                            const toPrice = customTokens.get(to).price;
                            rates[from][to] = 1 / (toPrice * fiatData.rates[from]);
                        } else if (from === 'USD' && currencies.includes(to)) {
                            // 美元到其他法币
                            rates[from][to] = fiatData.rates[to];
                        } else if (currencies.includes(from) && to === 'USD') {
                            // 其他法币到美元
                            rates[from][to] = 1 / fiatData.rates[from];
                        } else if (currencies.includes(from) && currencies.includes(to)) {
                            // 法币之间
                            rates[from][to] = fiatData.rates[to] / fiatData.rates[from];
                        } else if (products.includes(from) && to === 'USD') {
                            // 产品到美元 (1 iPhone17 = 799 USD)
                            rates[from][to] = productPrices[from];
                        } else if (from === 'USD' && products.includes(to)) {
                            // 美元到产品 (1 USD = 1/799 iPhone17)
                            rates[from][to] = 1 / productPrices[to];
                        } else if (products.includes(from) && currencies.includes(to)) {
                            // 产品到其他法币
                            rates[from][to] = productPrices[from] * fiatData.rates[to];
                        } else if (currencies.includes(from) && products.includes(to)) {
                            // 其他法币到产品
                            rates[from][to] = 1 / (productPrices[to] * fiatData.rates[from]);
                        } else if (cryptos.includes(from) && products.includes(to)) {
                            // 加密货币到产品
                            rates[from][to] = cryptoPrices[from] / productPrices[to];
                        } else if (products.includes(from) && cryptos.includes(to)) {
                            // 产品到加密货币
                            rates[from][to] = productPrices[from] / cryptoPrices[to];
                        } else if (customTokens && customTokenSymbols.includes(from) && products.includes(to)) {
                            // 自定义代币到产品
                            const fromPrice = customTokens.get(from).price;
                            rates[from][to] = fromPrice / productPrices[to];
                        } else if (customTokens && products.includes(from) && customTokenSymbols.includes(to)) {
                            // 产品到自定义代币
                            const toPrice = customTokens.get(to).price;
                            rates[from][to] = productPrices[from] / toPrice;
                        } else if (products.includes(from) && products.includes(to)) {
                            // 产品之间
                            rates[from][to] = productPrices[from] / productPrices[to];
                        }
                    });
	                });
	                
	                console.log('汇率加载成功:', rates);
	                
	                const parts = [];
		                if (cryptoSource === 'realtime') parts.push('预设币种（CoinPaprika 实时）');
		                else if (cryptoSource === 'cache') parts.push(`预设币种（CoinPaprika 缓存 ${formatAge(cryptoTs)}）`);
		                else if (cryptoSource === 'stale-cache') parts.push(`预设币种（CoinPaprika 旧缓存 ${formatAge(cryptoTs)}）`);
		                else parts.push(`预设币种（未知来源 ${cryptoSource || 'unknown'}）`);
	                
		                if (fiatSource === 'realtime') parts.push('ExchangeRate 实时');
		                else if (fiatSource === 'cache') parts.push(`ExchangeRate 缓存（${formatAge(fiatTs)}）`);
		                else parts.push(`ExchangeRate 旧缓存（${formatAge(fiatTs)}）`);
		                
		                const allRealtime = (cryptoSource === 'realtime') && (fiatSource === 'realtime');
		                const detailMessage = `汇率已加载（${parts.join(' + ')}）`;
		                console.log(detailMessage);
		                updateApiStatusDisplay({
		                    message: '汇率已加载',
		                    color: allRealtime ? '#1d1d1f' : '#6e6e73'
		                });
	                
	                // 设置定期刷新汇率状态（每5分钟检查一次）
	                if (!window.rateRefreshInterval) {
	                    window.rateRefreshInterval = setInterval(async () => {
	                        try {
	                            await loadRates({ forceRefresh: true, reason: 'interval' });
	                        } catch (error) {
	                            console.log('定期刷新失败，将在下次尝试');
	                        }
	                    }, 5 * 60 * 1000); // 5分钟
	                }
		            } catch (error) {
		                console.error('汇率加载失败:', error);
		                
		                // 根据错误类型显示不同的提示信息
		                let errorMessage = '';
	                if (error?.status === 429 || apiStatus.rateLimited) {
	                    errorMessage = '汇率服务触发访问频率限制，正在使用缓存或请稍后再试';
	                } else if (!apiStatus.preset && !apiStatus.exchangerate) {
	                    errorMessage = '汇率服务暂时不可用（预设币价与法币汇率均失败）';
	                } else if (!apiStatus.preset) {
	                    errorMessage = '预设币种价格服务暂时不可用（CoinPaprika）';
	                } else if (!apiStatus.exchangerate) {
	                    errorMessage = 'ExchangeRate 法币汇率服务暂时不可用';
	                } else {
	                    errorMessage = '汇率加载失败，请稍后再试';
	                }
	                
	                console.error(errorMessage);
	                updateApiStatusDisplay({ message: '汇率加载失败', color: '#b3261e' });
	                
	                // 清空汇率，表示服务不可用
	                rates = {};
	            }
	            })().finally(() => {
	                loadRatesInFlight = null;
	            });
	            
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
            localStorage.setItem('valueConverterState', JSON.stringify(state));
            console.log('✅ 状态已保存:', state);
        }
        
        // 从本地存储恢复状态
        function restoreState() {
            const savedState = localStorage.getItem('valueConverterState');
            console.log('🔍 尝试恢复状态，localStorage 内容:', savedState);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    console.log('📦 解析后的状态:', state);

                    // 恢复自定义代币数据
                    if (state.customTokens && Array.isArray(state.customTokens)) {
                        customTokens = new Map(state.customTokens);
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
                            const oldValue = selectElement.value;
                            selectElement.value = state[`currency${i}`];
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
                                customOption.setAttribute('data-token-logo', tokenInfo.tokenLogo || '');
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
            if (!rates || Object.keys(rates).length === 0) {
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
            console.log('rates对象存在:', !!rates, '包含货币数量:', rates ? Object.keys(rates).length : 0);
            
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
                    
	                    if (sourceCurrency === targetCurrency) {
	                        result = amount;
	                    } else if (rates[sourceCurrency] && rates[sourceCurrency][targetCurrency]) {
	                        result = amount * rates[sourceCurrency][targetCurrency];
	                    } else {
	                        result = 0;
	                    }
	                    
	                    document.getElementById(`amount${i}`).value = formatNumberForDisplay(result);
	                }
	            }
            
            updating = false;
        }
        
	        // 所有货币的logo和显示文本映射
	        const currencyLogos = {
	            // 加密货币 - UI 使用图片 logo（注意：分享图仍使用 emoji，避免 canvas/CORS 问题）
	            'BTC': { logo: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', text: 'BTC', type: 'image' },
	            'ETH': { logo: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', text: 'ETH', type: 'image' },
	            'SOL': { logo: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', text: 'SOL', type: 'image' },
	            'BNB': { logo: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', text: 'BNB', type: 'image' },
	            'OKB': { logo: 'https://assets.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png', text: 'OKB', type: 'image' },
            // 法币 - 使用emoji
	            'USD': { logo: '🇺🇸', text: 'USD', type: 'emoji' },
	            'CNY': { logo: '🇨🇳', text: 'CNY', type: 'emoji' },
	            'TWD': { logo: '🇹🇼', text: 'TWD', type: 'emoji' },
	            'HKD': { logo: '🇭🇰', text: 'HKD', type: 'emoji' },
	            'JPY': { logo: '🇯🇵', text: 'JPY', type: 'emoji' },
	            'KRW': { logo: '🇰🇷', text: 'KRW', type: 'emoji' },
	            'SGD': { logo: '🇸🇬', text: 'SGD', type: 'emoji' },
            'AED': { logo: '🇦🇪', text: 'AED', type: 'emoji' },
            'MYR': { logo: '🇲🇾', text: 'MYR', type: 'emoji' },
            // 实物 - 使用emoji
            'ZHUJIAO': { logo: '🍚', text: '猪脚饭', type: 'emoji' },
            'KFC': { logo: '🍗', text: 'KFC', type: 'emoji' },
            'IN11': { logo: '💃', text: 'in11 嫩模', type: 'emoji' },
            'IPHONE17': { logo: '📱', text: 'iPhone17', type: 'emoji' },
            'MACBOOK': { logo: '💻', text: 'MacBook Air', type: 'emoji' },
            'PATEK': { logo: 'assets/logos/enheng-patek.png', text: '嗯哼的百达斐丽', type: 'image' },
            'XIAOXIAO_HOME': { logo: 'assets/logos/xiaoxia-home.png', text: '小侠的新房', type: 'image' },
            'FERRARI_SF90': { logo: 'assets/logos/0xsun-ferrari.png', text: '0xSun 的法拉利', type: 'image' }
        };

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
	                const logoUrl = customOption.getAttribute('data-token-logo');
	                
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
                
                // 货币选择事件
                document.getElementById(`currency${i}`).addEventListener('change', function() {
                    console.log('Currency change event triggered for currency' + i);
                    
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
                        if (modal && modal.style.display === 'block') {
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
	        let customTokens = new Map(); // 存储自定义代币数据
	        const tokenSearchSessionCache = new Map(); // 本次页面会话内的搜索缓存（降低 CoinGecko 搜索频率）

	        // ===== 自定义下拉（替代系统 select）=====
	        function getSelectDisplayInfo(selectElement) {
	            const value = selectElement.value;
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
		            if (!logoBox || !textBox) return;

		            textBox.textContent = text;
		            logoBox.innerHTML = '';
		            logoBox.classList.toggle('is-emoji', type === 'emoji');
		            logoBox.classList.toggle('is-image', type === 'image');

		            if (type === 'image' && logo) {
		                const img = document.createElement('img');
		                img.src = logo;
		                img.alt = text;
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

	            // 同步选中态
	            dropdown.querySelectorAll('.dropdown-item').forEach((item) => {
	                const v = item.getAttribute('data-value');
	                const selected = v === selectElement.value;
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
	            const menu = dropdown._menu || dropdown.querySelector('.dropdown-menu');
	            if (!trigger || !menu) return;
	            const scroll = menu.querySelector('.dropdown-menu-scroll');
	            
	            // 打开时菜单是 display:block 才能测量尺寸
	            const wasHidden = menu.style.display === '' || menu.style.display === 'none';
	            if (wasHidden) menu.style.display = 'block';
	            menu.style.visibility = 'hidden';
	            
	            // 在 iOS Safari 等环境下，visualViewport 可能与布局视口存在偏移（地址栏/缩放/键盘）
	            // 使用 offset 修正，保证 fixed 定位与 getBoundingClientRect 的坐标系一致
	            const vv = window.visualViewport;
	            const viewportOffsetLeft = vv ? vv.offsetLeft : 0;
	            const viewportOffsetTop = vv ? vv.offsetTop : 0;
	            const viewportWidth = vv ? vv.width : window.innerWidth;
	            const viewportHeight = vv ? vv.height : window.innerHeight;

	            const triggerRectRaw = trigger.getBoundingClientRect();
	            const triggerRect = {
	                left: triggerRectRaw.left + viewportOffsetLeft,
	                right: triggerRectRaw.right + viewportOffsetLeft,
	                top: triggerRectRaw.top + viewportOffsetTop,
	                bottom: triggerRectRaw.bottom + viewportOffsetTop,
	                width: triggerRectRaw.width,
	                height: triggerRectRaw.height
	            };

	            const menuRectRaw = menu.getBoundingClientRect();
	            const menuRect = {
	                left: menuRectRaw.left + viewportOffsetLeft,
	                right: menuRectRaw.right + viewportOffsetLeft,
	                top: menuRectRaw.top + viewportOffsetTop,
	                bottom: menuRectRaw.bottom + viewportOffsetTop,
	                width: menuRectRaw.width,
	                height: menuRectRaw.height
	            };
	            const gap = 12;
	            const margin = 12;
	            
	            // 约束范围：
	            // - 桌面：尽量保证菜单完整展示在主卡片（.container）内部，体验更“贴近组件”
	            // - 手机端：优先保证在“视口”内可见（允许超出卡片边界），否则会因为卡片较窄导致菜单被迫翻转/错位
	            const isMobileLayout = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
	            const containerEl = !isMobileLayout ? document.querySelector('.container') : null;
	            const containerRectRaw = containerEl ? containerEl.getBoundingClientRect() : null;
	            const containerRect = containerRectRaw
	                ? {
	                        left: containerRectRaw.left + viewportOffsetLeft,
	                        right: containerRectRaw.right + viewportOffsetLeft,
	                        top: containerRectRaw.top + viewportOffsetTop,
	                        bottom: containerRectRaw.bottom + viewportOffsetTop
	                  }
	                : null;
	            const bounds = containerRect
	                ? {
	                        left: containerRect.left,
	                        right: containerRect.right,
	                        top: containerRect.top,
	                        bottom: containerRect.bottom
	                  }
	                : {
	                        left: viewportOffsetLeft + margin,
	                        right: viewportOffsetLeft + viewportWidth - margin,
	                        top: viewportOffsetTop + margin,
	                        bottom: viewportOffsetTop + viewportHeight - margin
	                  };
	            
	            // 额外兜底：同时不能超出视口
	            bounds.left = Math.max(bounds.left, viewportOffsetLeft + margin);
	            bounds.top = Math.max(bounds.top, viewportOffsetTop + margin);
	            bounds.right = Math.min(bounds.right, viewportOffsetLeft + viewportWidth - margin);
	            bounds.bottom = Math.min(bounds.bottom, viewportOffsetTop + viewportHeight - margin);
	            
	            // 目标：点击目标框后，从右侧“侧弹”出现，并允许滚动选择。
	            // 视觉上更接近把原本“向下弹出”改成“向右弹出”：菜单与目标框垂直居中对齐。
	            let side = 'right';
	            let left = triggerRect.right + gap;
	            let top = triggerRect.top;
	            
	            // 宽度：略大于目标框，但不超过卡片/视口
	            let width = Math.max(260, Math.min(360, Math.max(triggerRect.width, menuRect.width || 300)));
	            width = Math.min(width, Math.max(220, bounds.right - bounds.left));
	            
	            if (left + width > bounds.right) {
	                // 桌面：允许翻转到左侧
	                // 手机：优先保持“从右侧冒出”，因为容器太窄会导致错误翻转
	                if (!isMobileLayout) {
	                    left = triggerRect.left - gap - width;
	                    side = 'left';
	                }
	            }
	            
	            left = Math.max(bounds.left, Math.min(left, bounds.right - width));
	            
	            // 高度：限制最大高度并允许滚动；优先保证不超出卡片范围
	            const maxHeight = Math.min(680, Math.max(200, bounds.bottom - bounds.top - margin * 2));
	            const desiredHeight = Math.min(menuRect.height || 520, maxHeight);
	            top = triggerRect.top + (triggerRect.height - desiredHeight) / 2;
	            top = Math.max(bounds.top, Math.min(top, bounds.bottom - desiredHeight));
	            // 再兜底一次，确保不会越出视口
	            top = Math.max(viewportOffsetTop + margin, Math.min(top, viewportOffsetTop + viewportHeight - margin - desiredHeight));
	            
	            // 箭头位置：指向触发器的垂直中心
	            const arrowCenterY = triggerRect.top + triggerRect.height / 2;
	            let arrowTop = arrowCenterY - top;
	            arrowTop = Math.max(20, Math.min(arrowTop, desiredHeight - 20));
	            menu.style.setProperty('--arrow-top', `${Math.floor(arrowTop)}px`);
	            menu.setAttribute('data-side', side);
	            
	            menu.style.width = `${Math.floor(width)}px`;
	            menu.style.left = `${Math.floor(left)}px`;
	            menu.style.top = `${Math.floor(top)}px`;
	            if (scroll) scroll.style.maxHeight = `${Math.floor(maxHeight)}px`;
	            menu.style.visibility = '';
	            if (wasHidden) menu.style.display = 'block';
	        }

	        function buildCustomDropdown(selectElement) {
	            const wrapper = selectElement.parentElement;
	            if (!wrapper) return;
	            if (wrapper.querySelector('.dropdown')) return;

	            // 隐藏原生 select，但保留其事件/状态/存储逻辑
	            selectElement.classList.add('native-select-hidden');

	            const dropdown = document.createElement('div');
	            dropdown.className = 'dropdown';

	            const trigger = document.createElement('button');
	            trigger.type = 'button';
	            trigger.className = 'dropdown-trigger';
	            trigger.setAttribute('aria-haspopup', 'listbox');
	            trigger.setAttribute('aria-expanded', 'false');

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
	            menu.className = 'dropdown-menu';
	            menu.setAttribute('role', 'listbox');
	            // 关键：menu 使用 fixed 定位时，如果在 transform 容器内会发生偏移
	            // 将 menu portal 到 body，保证 fixed 相对视口定位
	            const scroll = document.createElement('div');
	            scroll.className = 'dropdown-menu-scroll';
	            menu.appendChild(scroll);
	            document.body.appendChild(menu);
	            dropdown._menu = menu;

	            // 根据 optgroup/option 构建菜单
	            const children = Array.from(selectElement.children);
	            for (const child of children) {
	                if (child.tagName === 'OPTGROUP') {
	                    const groupLabel = child.getAttribute('label') || '';
	                    const groupTitle = document.createElement('div');
	                    groupTitle.className = 'dropdown-group';
	                    groupTitle.textContent = groupLabel;
	                    scroll.appendChild(groupTitle);

	                    const opts = Array.from(child.querySelectorAll('option'));
	                    for (const opt of opts) {
	                        const value = opt.value;
	                        if (value === 'TEMP_CUSTOM_PLACEHOLDER') continue;
	                        const item = document.createElement('div');
	                        item.className = 'dropdown-item';
	                        item.setAttribute('role', 'option');
	                        item.setAttribute('data-value', value);
	                        item.setAttribute('aria-selected', value === selectElement.value ? 'true' : 'false');

	                        // 显示内容：优先用 currencyLogos（图片/emoji），否则用 option 文本
	                        let displayText = (opt.textContent || value).trim();
	                        let logoType = 'none';
	                        let logo = '';
	                        if (value === 'CUSTOM') {
	                            displayText = '自定义代币';
	                            logoType = 'emoji';
	                            logo = '🔍';
	                        } else if (currencyLogos?.[value]) {
	                            const mapped = currencyLogos[value];
	                            logoType = mapped.type;
	                            logo = mapped.logo;
	                            displayText = mapped.text || value;
	                        }

		                        const logoHtml = (() => {
		                            if (logoType === 'image' && logo) return `<span class="dropdown-logo is-image"><img src="${logo}" alt="${displayText}" onerror="this.remove()"></span>`;
		                            if (logoType === 'emoji' && logo) return `<span class="dropdown-logo is-emoji"><span class="dropdown-logo-emoji">${logo}</span></span>`;
		                            return `<span class="dropdown-logo is-emoji"><span class="dropdown-logo-emoji">•</span></span>`;
		                        })();

	                        item.innerHTML = `${logoHtml}<span class="dropdown-item-text">${displayText}</span>`;

	                        item.addEventListener('click', () => {
	                            closeAllDropdowns();
	                            trigger.setAttribute('aria-expanded', 'false');
	                            selectElement.value = value;
	                            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
	                            updateCustomDropdownTrigger(selectElement);
	                        });

	                        scroll.appendChild(item);
	                    }
	                }
	            }

	            trigger.addEventListener('click', (e) => {
	                e.preventDefault();
	                const willOpen = !dropdown.classList.contains('open');
	                closeAllDropdowns(willOpen ? dropdown : null);
	                dropdown.classList.toggle('open', willOpen);
	                trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
	                if (willOpen) {
	                    menu.style.display = 'block';
	                    positionDropdownMenu(dropdown);
	                } else {
	                    menu.style.display = 'none';
	                }
	            });

	            // 监听 select 的变化（包括 restoreState / 自定义代币选择后的更新）
	            selectElement.addEventListener('change', () => updateCustomDropdownTrigger(selectElement));

	            dropdown.appendChild(trigger);
	            wrapper.appendChild(dropdown);
	            updateCustomDropdownTrigger(selectElement);
	        }
        
        // 基于市值排名估算价格的函数
        function getEstimatedPrice(coin) {
            // 如果没有市值排名，给一个默认的小价格
            if (!coin.market_cap_rank) {
                return 0.001; // 默认 $0.001
            }
            
            const rank = coin.market_cap_rank;
            
            // 基于市值排名的粗略价格估算
            if (rank <= 10) return 50; // 前10名，大概$50
            if (rank <= 50) return 5; // 前50名，大概$5
            if (rank <= 100) return 1; // 前100名，大概$1
            if (rank <= 500) return 0.1; // 前500名，大概$0.1
            if (rank <= 1000) return 0.01; // 前1000名，大概$0.01
            return 0.001; // 其他，大概$0.001
        }
        
        // 本地常见代币数据库
        function getLocalTokenResults(query) {
            const commonTokens = [
                { id: 'dogecoin', name: 'Dogecoin', symbol: 'doge', large: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', market_cap_rank: 8 },
                { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', market_cap_rank: 9 },
                { id: 'polkadot', name: 'Polkadot', symbol: 'dot', large: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', market_cap_rank: 12 },
                { id: 'chainlink', name: 'Chainlink', symbol: 'link', large: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', market_cap_rank: 15 },
                { id: 'polygon', name: 'Polygon', symbol: 'matic', large: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', market_cap_rank: 16 },
                { id: 'avalanche-2', name: 'Avalanche', symbol: 'avax', large: 'https://assets.coingecko.com/coins/images/12559/large/coin-round-red.png', market_cap_rank: 17 },
                { id: 'shiba-inu', name: 'Shiba Inu', symbol: 'shib', large: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', market_cap_rank: 18 },
                { id: 'uniswap', name: 'Uniswap', symbol: 'uni', large: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png', market_cap_rank: 20 },
                { id: 'litecoin', name: 'Litecoin', symbol: 'ltc', large: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', market_cap_rank: 21 },
                { id: 'near', name: 'NEAR Protocol', symbol: 'near', large: 'https://assets.coingecko.com/coins/images/10365/large/near_icon.png', market_cap_rank: 25 },
                { id: 'aptos', name: 'Aptos', symbol: 'apt', large: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', market_cap_rank: 30 },
                { id: 'arbitrum', name: 'Arbitrum', symbol: 'arb', large: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg', market_cap_rank: 35 },
                { id: 'optimism', name: 'Optimism', symbol: 'op', large: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png', market_cap_rank: 40 }
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
            document.getElementById('customTokenModal').style.display = 'block';
            document.getElementById('tokenSearchInput').value = '';
            document.getElementById('searchResults').innerHTML = '';
            setupSearchInputListener(); // 设置回车键监听
            
            // 检测是否为移动设备
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 手机端：先强制所有select失去焦点
            if (isMobile) {
                // 立即强制所有select元素失去焦点
                const allSelects = document.querySelectorAll('select');
                allSelects.forEach(select => {
                    select.blur();
                });
                
                // 确保当前没有任何元素有焦点
                if (document.activeElement && document.activeElement.tagName === 'SELECT') {
                    document.activeElement.blur();
                }
            }
            
            // 自动聚焦到输入框
            if (isMobile) {
                // 手机端：延长延迟并强制聚焦，确保select事件完全结束
                setTimeout(() => {
                    const searchInput = document.getElementById('tokenSearchInput');
                    if (searchInput) {
                        searchInput.placeholder = '输入代币名称或符号...';
                        
                        // 再次确保没有select元素有焦点
                        const activeElement = document.activeElement;
                        if (activeElement && activeElement.tagName === 'SELECT') {
                            activeElement.blur();
                        }
                        
                        // 强制聚焦到搜索输入框
                        searchInput.focus();
                        
                        // 备选方案：触发点击事件来确保聚焦
                        setTimeout(() => {
                            if (document.activeElement !== searchInput) {
                                searchInput.click();
                                searchInput.focus();
                            }
                        }, 50);
                    }
                }, 600); // 更长的延迟确保所有select相关事件完成
            } else {
                // 桌面端：正常处理
                setTimeout(() => {
                    const searchInput = document.getElementById('tokenSearchInput');
                    if (searchInput) {
                        searchInput.focus();
                    }
                }, 100);
            }
        }
        
        // 关闭自定义代币弹窗
        function closeCustomTokenModal() {
            document.getElementById('customTokenModal').style.display = 'none';
            
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
                }
            }
            
            currentSelectId = null;
        }
        
        // 点击弹窗外部关闭
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('customTokenModal');
            if (event.target === modal) {
                closeCustomTokenModal();
            }
        });
        
        // 搜索代币
	        async function searchTokens() {
	            const query = document.getElementById('tokenSearchInput').value.trim();
	            if (!query) {
	                return;
	            }
	            
	            const queryKey = query.toLowerCase();
	            const cached = tokenSearchSessionCache.get(queryKey);
	            if (cached && nowMs() - cached.ts < 60 * 1000) {
	                displaySearchResults(cached.coins || []);
	                return;
	            }
	            
	            const loadingIndicator = document.getElementById('loadingIndicator');
	            const searchResults = document.getElementById('searchResults');
            
            // 显示加载动画
            loadingIndicator.style.display = 'block';
            searchResults.innerHTML = '';
            
	            try {
	                // 使用CoinGecko API搜索代币
	                let searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
	                console.log('搜索URL:', searchUrl);
	                
	                let response;
	                try {
	                    response = await fetchJsonWithTimeout(searchUrl, {
	                        method: 'GET',
	                        headers: {
	                            'Accept': 'application/json'
	                        }
	                    }, 8000);
	                    
	                    apiStatus.coingecko = true;
	                } catch (corsError) {
	                    console.log('搜索API直接访问失败，使用本地数据库:', corsError);
	                    apiStatus.coingecko = false;
	                    // 使用本地的常见代币数据库作为备用
	                    const localResults = getLocalTokenResults(query);
	                    response = {
	                        ok: true,
                        json: async () => ({ coins: localResults })
                    };
                }
                
                if (!response.ok) {
                    throw new Error('搜索请求失败');
                }
	                
	                const data = await response.json();
	                loadingIndicator.style.display = 'none';
	                const coins = data.coins || [];
	                tokenSearchSessionCache.set(queryKey, { ts: nowMs(), coins });
	                displaySearchResults(coins);
	                
	            } catch (error) {
	                console.error('搜索代币时出错:', error);
	                apiStatus.coingecko = false;
	                loadingIndicator.style.display = 'none';
	                searchResults.innerHTML = '<div class="no-results">搜索失败，请稍后重试</div>';
	            }
	        }
        
        // 显示搜索结果
        function displaySearchResults(coins) {
            const searchResults = document.getElementById('searchResults');
            
            if (coins.length === 0) {
                searchResults.innerHTML = '<div class="no-results">未找到相关代币</div>';
                return;
            }
            
            searchResults.innerHTML = '';
            
            // 限制显示前10个结果
            coins.slice(0, 10).forEach(coin => {
                const tokenDiv = document.createElement('div');
                tokenDiv.className = 'token-result';
                tokenDiv.onclick = () => selectCustomToken(coin);
                
                tokenDiv.innerHTML = `
                    <img src="${coin.large || coin.thumb}" alt="${coin.name}" class="token-logo" onerror="this.style.display='none'">
                    <div class="token-content">
                        <div class="token-name-row">
                            <div class="token-name">${coin.name}</div>
                        </div>
                        <div class="token-bottom-row">
                            <div class="token-symbol">${coin.symbol}</div>
                            <div class="token-price">
                                市值排名: ${coin.market_cap_rank || 'N/A'}
                            </div>
                        </div>
                    </div>
                `;
                
                searchResults.appendChild(tokenDiv);
            });
        }
        
        // 选择自定义代币
	        async function selectCustomToken(coin) {
	            const selectId = currentSelectId; // 先保存，避免 closeCustomTokenModal() 把 currentSelectId 清空
	            try {
	                console.log('选择的代币:', coin);
	                
	                const tokenPriceCacheKey = `${CACHE_KEYS.coingeckoTokenPrice}:${coin.id}`;
	                const cachedPrice = readCache(tokenPriceCacheKey, 2 * 60 * 1000); // 2分钟
	                
	                let price = 0;
	                let isEstimated = false;
	                
	                if (cachedPrice?.data?.price) {
	                    price = cachedPrice.data.price;
	                    isEstimated = !!cachedPrice.data.isEstimated;
	                    console.log(`使用缓存价格（${formatAge(cachedPrice.ts)}）:`, price);
	                } else {
	                    // 获取代币详细信息和价格（CoinGecko）
	                    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`;
	                    console.log('请求价格URL:', priceUrl);
	                    
	                    let response;
	                    try {
	                        response = await fetchJsonWithTimeout(priceUrl, {
	                            method: 'GET',
	                            headers: { 'Accept': 'application/json' }
	                        }, 8000);
	                        
	                        apiStatus.coingecko = true;
	                    } catch (corsError) {
	                        console.log('直接访问失败，尝试使用备用方案:', corsError);
	                        apiStatus.coingecko = false;
	                        
	                        // 如果直接访问失败，使用一个备用的价格估算（基于市值排名）
	                        const estimatedPrice = getEstimatedPrice(coin);
	                        console.log('使用估算价格:', estimatedPrice);
	                        response = {
	                            ok: true,
	                            status: 200,
	                            statusText: 'OK',
	                            json: async () => ({ [coin.id]: { usd: estimatedPrice } })
	                        };
	                        isEstimated = true;
	                        console.log('⚠️ 注意：正在使用基于市值排名的估算价格，可能不够准确');
	                    }
	                    
	                    if (!response.ok) {
	                        console.error('价格API请求失败:', response.status, response.statusText);
	                        throw new Error(`获取代币价格失败: ${response.status} ${response.statusText}`);
	                    }
	                    
	                    const priceData = await response.json();
	                    console.log('价格数据:', priceData);
	                    
	                    price = priceData[coin.id]?.usd || 0;
	                    console.log('解析出的价格:', price);
	                    
	                    writeCache(tokenPriceCacheKey, { price, isEstimated });
	                }
	                
	                if (price === 0) {
	                    console.warn('价格为0，可能数据有误');
	                }
                
                // 存储自定义代币信息
                const tokenKey = coin.symbol.toUpperCase();
                const logoUrl = coin.large || coin.thumb || coin.image;
	                customTokens.set(tokenKey, {
	                    id: coin.id,
	                    name: coin.name,
	                    symbol: coin.symbol,
	                    image: logoUrl,
	                    price: price,
	                    isEstimated: isEstimated || price === getEstimatedPrice(coin) // 标记是否为估算价格
	                });
                
                // 不添加到下拉菜单，只在当前会话中使用
                
                // 设置触发搜索的下拉菜单使用自定义代币
	                if (selectId) {
	                    const currentSelect = document.getElementById(selectId);
	                    if (currentSelect) {
                        // 保持CUSTOM选项的原始文本"🔍 自定义代币"，但存储代币信息
                        const customOption = currentSelect.querySelector('option[value="CUSTOM"]');
                        if (customOption) {
                            // 更新代币信息（覆盖之前的选择）
                            customOption.setAttribute('data-token-key', tokenKey);
                            customOption.setAttribute('data-token-name', coin.name);
                            customOption.setAttribute('data-token-symbol', coin.symbol.toUpperCase());
                            customOption.setAttribute('data-token-logo', logoUrl);
                            
                            // 设置外部显示的文本（只显示代币符号，Logo将通过CSS显示）
                            customOption.setAttribute('data-display-text', coin.symbol.toUpperCase());
                        }
                        currentSelect.value = 'CUSTOM';
                        
                        // 记住这个选择作为"之前的值"
                        currentSelect.setAttribute('data-previous-value', 'CUSTOM');
                        
                        // 立即更新外部显示
                        updateSelectDisplay(currentSelect);
                    }
	                }
	                
	                // 重算汇率矩阵以包含新的自定义代币
	                // 默认不强制刷新基础汇率（预设币价/ExchangeRate），避免短时间内重复请求
	                await loadRates({ forceRefresh: false, reason: 'customTokenSelected' });
	                
	                // 关闭弹窗
	                closeCustomTokenModal();
	                
	                // 重新计算转换
	                if (selectId) {
	                    const selectIndex = parseInt(selectId.replace('currency', ''));
	                    convert(selectIndex);
	                    saveState();
	                }
	                
	            } catch (error) {
	                console.error('选择代币时出错:', error);
                console.error('错误详情:', error.message);
                console.error('错误堆栈:', error.stack);
                
	                // 提供更详细的错误信息
	                let errorMessage = '获取代币信息失败';
	                if (apiStatus.rateLimited || error.message.includes('429')) {
	                    errorMessage = 'API调用已达限制，请等待几分钟后重试';
	                } else if (!apiStatus.coingecko) {
	                    errorMessage = 'CoinGecko 服务暂时不可用，自定义代币功能可能受影响';
	                } else if (error.message.includes('Failed to fetch')) {
	                    errorMessage += '：网络连接问题，请检查网络或稍后重试';
	                } else if (error.message.includes('403') || error.message.includes('401')) {
	                    errorMessage += '：API访问受限';
                } else {
                    errorMessage += `：${error.message}`;
                }
                
                alert(errorMessage);
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
                    { label: '00', value: '00', wide: true },
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
                    if (key.wide) btn.classList.add('wide');

                    if (key.isSvg) {
                        // 退格图标
                        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
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

                    // 桌面端后备（鼠标点击）
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

                default:
                    // 追加字符（数字、运算符、小数点、00）
                    input.value += value;
                    break;
            }

            // 触发 input 事件，激活已有的格式化、换算、保存逻辑
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        /** 初始化移动端键盘（仅手机端执行） */
        function initMobileKeyboard() {
            if (!isMobileDevice()) return;

            buildMobileKeyboard();

            // 移动端：将 amount 输入框设为 readonly，阻止系统键盘弹出
            for (let i = 1; i <= 6; i++) {
                const input = document.getElementById(`amount${i}`);
                if (!input) continue;

                input.setAttribute('readonly', 'readonly');
                input.setAttribute('inputmode', 'none');

                // 点击输入框时切换为当前活跃目标
                input.addEventListener('click', (e) => {
                    e.preventDefault();
                    setActiveKbInput(i);
                });
            }

            // 默认激活第一个输入框
            setActiveKbInput(1);

            console.log('📱 移动端内嵌键盘已初始化');
        }
        
    
