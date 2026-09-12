// Explicit currency-to-flag mapping; shared currencies use a code badge.
const FIAT_FLAGS = {
    "USD": "us",
    "AED": "ae",
    "AFN": "af",
    "ALL": "al",
    "AMD": "am",
    "ANG": "cw",
    "AOA": "ao",
    "ARS": "ar",
    "AUD": "au",
    "AWG": "aw",
    "AZN": "az",
    "BAM": "ba",
    "BBD": "bb",
    "BDT": "bd",
    "BGN": "bg",
    "BHD": "bh",
    "BIF": "bi",
    "BMD": "bm",
    "BND": "bn",
    "BOB": "bo",
    "BRL": "br",
    "BSD": "bs",
    "BTN": "bt",
    "BWP": "bw",
    "BYN": "by",
    "BZD": "bz",
    "CAD": "ca",
    "CDF": "cd",
    "CHF": "ch",
    "CLF": "cl",
    "CLP": "cl",
    "CNH": "cn",
    "CNY": "cn",
    "COP": "co",
    "CRC": "cr",
    "CUP": "cu",
    "CVE": "cv",
    "CZK": "cz",
    "DJF": "dj",
    "DKK": "dk",
    "DOP": "do",
    "DZD": "dz",
    "EGP": "eg",
    "ERN": "er",
    "ETB": "et",
    "EUR": "european_union",
    "FJD": "fj",
    "FKP": "fk",
    "FOK": "fo",
    "GBP": "gb",
    "GEL": "ge",
    "GGP": "gg",
    "GHS": "gh",
    "GIP": "gi",
    "GMD": "gm",
    "GNF": "gn",
    "GTQ": "gt",
    "GYD": "gy",
    "HKD": "hk",
    "HNL": "hn",
    "HRK": "hr",
    "HTG": "ht",
    "HUF": "hu",
    "IDR": "id",
    "ILS": "il",
    "IMP": "im",
    "INR": "in",
    "IQD": "iq",
    "IRR": "ir",
    "ISK": "is",
    "JEP": "je",
    "JMD": "jm",
    "JOD": "jo",
    "JPY": "jp",
    "KES": "ke",
    "KGS": "kg",
    "KHR": "kh",
    "KID": "ki",
    "KMF": "km",
    "KRW": "kr",
    "KWD": "kw",
    "KYD": "ky",
    "KZT": "kz",
    "LAK": "la",
    "LBP": "lb",
    "LKR": "lk",
    "LRD": "lr",
    "LSL": "ls",
    "LYD": "ly",
    "MAD": "ma",
    "MDL": "md",
    "MGA": "mg",
    "MKD": "mk",
    "MMK": "mm",
    "MNT": "mn",
    "MOP": "mo",
    "MRU": "mr",
    "MUR": "mu",
    "MVR": "mv",
    "MWK": "mw",
    "MXN": "mx",
    "MYR": "my",
    "MZN": "mz",
    "NAD": "na",
    "NGN": "ng",
    "NIO": "ni",
    "NOK": "no",
    "NPR": "np",
    "NZD": "nz",
    "OMR": "om",
    "PAB": "pa",
    "PEN": "pe",
    "PGK": "pg",
    "PHP": "ph",
    "PKR": "pk",
    "PLN": "pl",
    "PYG": "py",
    "QAR": "qa",
    "RON": "ro",
    "RSD": "rs",
    "RUB": "ru",
    "RWF": "rw",
    "SAR": "sa",
    "SBD": "sb",
    "SCR": "sc",
    "SDG": "sd",
    "SEK": "se",
    "SGD": "sg",
    "SHP": "sh-hl",
    "SLE": "sl",
    "SLL": "sl",
    "SOS": "so",
    "SRD": "sr",
    "SSP": "ss",
    "STN": "st",
    "SYP": "sy",
    "SZL": "sz",
    "THB": "th",
    "TJS": "tj",
    "TMT": "tm",
    "TND": "tn",
    "TOP": "to",
    "TRY": "tr",
    "TTD": "tt",
    "TVD": "tv",
    "TWD": "tw",
    "TZS": "tz",
    "UAH": "ua",
    "UGX": "ug",
    "UYU": "uy",
    "UZS": "uz",
    "VES": "ve",
    "VND": "vn",
    "VUV": "vu",
    "WST": "ws",
    "XCG": "cw",
    "YER": "ye",
    "ZAR": "za",
    "ZMW": "zm",
    "ZWG": "zw",
    "ZWL": "zw"
};

let fiatCatalog = [];
let fiatCatalogStale = false;
let fiatPickerSelectId = null;
let fiatPickerVersion = 0;
let fiatReturnFocus = null;
const fiatNameCache = new Map();
const FIAT_ALIASES = { USD: '美元 美金 美元', CNY: '人民币 人民幣', CNH: '离岸人民币', HKD: '港币 港幣 港元', TWD: '台币 台幣 新台币', SGD: '新币 新幣 新元', MYR: '马币 馬幣 林吉特', KRW: '韩元 韩币 韓元', JPY: '日元 日币 日圓', GBP: '英镑 英鎊', EUR: '欧元 歐元', THB: '泰铢 泰銖', AED: '迪拉姆 阿联酋', AUD: '澳元 澳币 澳幣' };

function getFiatNames(code) {
    if (!fiatNameCache.has(code)) {
        const name = locale => {
            try { return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) || code; }
            catch { return code; }
        };
        fiatNameCache.set(code, { name: name('zh-CN'), englishName: name('en') });
    }
    return fiatNameCache.get(code);
}

function getFiatLogo(code) {
    if (Object.hasOwn(FIAT_FLAGS, code)) return `assets/logos/fiat/${FIAT_FLAGS[code]}.svg`;
    if (!/^[A-Z]{3}$/.test(code)) return '';
    // Currency codes are validated before inclusion in this self-contained SVG.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256" fill="#334155"/><text x="256" y="268" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="148" font-weight="700" fill="#fff">${code}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function updateFiatCatalog(rates, stale = false) {
    fiatCatalogStale = stale;
    fiatCatalog = Object.entries(rates || {})
        .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0)
        .map(([code, rate]) => ({ code, rate, ...getFiatNames(code) }))
        .sort((a, b) => a.code.localeCompare(b.code));
    return fiatCatalog;
}

function findFiatCurrencies(query) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    const matches = fiatCatalog.filter(coin =>
        `${coin.code} ${coin.name} ${coin.englishName} ${FIAT_ALIASES[coin.code] || ''}`.toLocaleLowerCase().includes(needle));
    return matches.sort((a, b) => Number(b.code.toLowerCase() === needle) - Number(a.code.toLowerCase() === needle));
}

function ensureFiatOption(select, code) {
    if (!/^[A-Z]{3}$/.test(code)) return null;
    const preset = ASSET_CONFIG.find(asset => asset.category === 'fiat' && asset.symbol === code);
    if (preset) return code;
    const key = `FIAT:${code}`;
    currencyLogos[key] = { text: code, type: 'image', logo: getFiatLogo(code) };
    if (!Array.from(select.options).some(option => option.value === key)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = code;
        select.querySelector('optgroup[data-category="fiat"]').appendChild(option);
    }
    return key;
}

function renderFiatResults() {
    const host = document.getElementById('fiatSearchResults');
    const input = document.getElementById('fiatSearchInput');
    const status = document.getElementById('fiatSearchStatus');
    const matches = findFiatCurrencies(input.value);
    host.replaceChildren();
    if (!fiatCatalog.length) {
        status.textContent = '暂时无法获取法币列表，请重试。';
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'share-btn'; retry.textContent = '重新加载';
        retry.onclick = () => refreshFiatPicker(); host.append(retry); return;
    }
    status.textContent = `${fiatCatalogStale ? '使用最近缓存汇率。' : ''}支持 ${fiatCatalog.length} 种货币${input.value.trim() ? `，找到 ${matches.length} 项` : '，输入名称或代码搜索'}。`;
    if (!matches.length) {
        const empty = document.createElement('p'); empty.className = 'no-results';
        empty.textContent = '未找到支持的法币，请尝试名称或三位货币代码。'; host.append(empty); return;
    }
    for (const coin of matches) {
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'token-result fiat-result';
        item.setAttribute('aria-label', `${coin.code} ${coin.name}`);
        const logo = document.createElement('img'); logo.className = 'token-logo'; logo.alt = '';
        logo.loading = 'lazy'; logo.src = getFiatLogo(coin.code);
        const content = document.createElement('span'); content.className = 'token-content';
        const name = document.createElement('span'); name.className = 'token-name'; name.textContent = coin.name;
        const code = document.createElement('span'); code.className = 'token-symbol'; code.textContent = `${coin.code} · ${coin.englishName}`;
        content.append(name, code); item.append(logo, content);
        item.onclick = () => selectCustomFiat(coin.code); host.append(item);
    }
}

async function refreshFiatPicker() {
    const version = ++fiatPickerVersion;
    document.getElementById('fiatSearchStatus').textContent = '正在加载法币列表…';
    document.getElementById('fiatSearchResults').replaceChildren();
    try { await loadRates({ reason: 'fiat-picker' }); }
    catch { /* Show the retry state without changing the selected currency. */ }
    if (version === fiatPickerVersion && fiatPickerSelectId) renderFiatResults();
}

function openCustomFiatModal(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    closeAllDropdowns();
    fiatPickerSelectId = selectId;
    fiatPickerVersion++;
    fiatReturnFocus = select.parentElement.querySelector('.dropdown-trigger');
    const modal = document.getElementById('customFiatModal');
    modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
    document.getElementById('fiatSearchInput').value = '';
    syncModalScrollLock();
    if (fiatCatalog.length) renderFiatResults(); else refreshFiatPicker();
    requestAnimationFrame(() => {
        if (fiatPickerSelectId === selectId) document.getElementById('fiatSearchInput').focus({ preventScroll: true });
    });
}

function closeCustomFiatModal() {
    fiatPickerVersion++;
    fiatPickerSelectId = null;
    const modal = document.getElementById('customFiatModal');
    modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true');
    syncModalScrollLock();
    if (fiatReturnFocus?.isConnected) fiatReturnFocus.focus({ preventScroll: true });
    fiatReturnFocus = null;
}

function selectCustomFiat(code) {
    if (!fiatPickerSelectId || !fiatCatalog.some(coin => coin.code === code)) return;
    const select = document.getElementById(fiatPickerSelectId);
    const key = ensureFiatOption(select, code);
    if (!key || !Number.isFinite(usdPrices[key]) || usdPrices[key] <= 0) {
        document.getElementById('fiatSearchStatus').textContent = '该法币暂无可用汇率，请稍后重试。'; return;
    }
    select.value = key;
    select.setAttribute('data-previous-value', key);
    updateSelectDisplay(select);
    closeCustomFiatModal();
    convert(lastInputField);
    saveState();
    if (fiatCatalogStale) showToast('实时汇率暂不可用，使用最近缓存汇率');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fiatSearchInput').addEventListener('input', renderFiatResults);
    document.getElementById('fiatSearchInput').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
            const results = findFiatCurrencies(event.target.value);
            if (results.length === 1 || results[0]?.code.toLowerCase() === event.target.value.trim().toLowerCase()) {
                event.preventDefault(); selectCustomFiat(results[0].code);
            }
        }
    });
    const modal = document.getElementById('customFiatModal');
    modal.querySelector('.close').addEventListener('click', closeCustomFiatModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeCustomFiatModal(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && fiatPickerSelectId) closeCustomFiatModal();
    });
});
