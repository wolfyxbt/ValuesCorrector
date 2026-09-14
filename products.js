// Custom products stay on this device. Uploaded images never leave the browser.
const PRODUCT_STORAGE_KEY = 'valuesCorrectorProducts';
const PRODUCT_LIMIT = 20;
let customProducts = new Map();
let productSelectId = null;
let productEditId = null;
let productDraftLogo = '';
let productDraftEmoji = '';
let productImageVersion = 0;
let productImageBusy = false;
let productReturnFocus = null;

// Accept one complete emoji, including skin tones, flags and joined family symbols.
function normalizeProductEmoji(value) {
    if (typeof value !== 'string') return null;
    const emoji = value.trim();
    if (!emoji) return '';
    if (emoji.length > 64) return null;
    const pattern = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*)$/u;
    return pattern.test(emoji) ? emoji : null;
}

function validateCustomProduct(value) {
    if (!value || !/^PRODUCT:[a-zA-Z0-9-]{1,64}$/.test(value.id || '')) return null;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name || Array.from(name).length > 30 || !Number.isFinite(value.price) || value.price <= 0 || value.price > 1e15) return null;
    const logo = typeof value.logo === 'string' && value.logo.length <= 200000 && /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.logo) ? value.logo : '';
    const currency = value.currency === undefined ? 'USD' : value.currency;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
    const emoji = normalizeProductEmoji(value.emoji || '') || '';
    return { id: value.id, name, price: value.price, currency, logo: emoji ? '' : logo, emoji };
}

function customProductLogo(product) {
    if (product.logo) return product.logo;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="128" fill="#334155"/><path d="m64 91 64-32 64 32v74l-64 32-64-32zm0 0 64 33 64-33m-64 33v73" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/></svg>');
}

function customProductUsdPrice(product, prices = usdPrices) {
    const currency = product.currency || 'USD';
    const rate = currency === 'USD' ? 1 : prices[`FIAT:${currency}`];
    const price = product.price * rate;
    return Number.isFinite(price) && price > 0 ? price : null;
}

function updateProductCurrencyOptions(selected) {
    const select = document.getElementById('productCurrency');
    if (!select) return;
    const currency = selected || select.value || 'USD';
    const codes = new Set(['USD', 'CNY', ...ASSET_CONFIG.filter(a => a.category === 'fiat').map(a => a.symbol), ...fiatCatalog.map(a => a.code), currency]);
    select.replaceChildren();
    for (const code of codes) {
        const option = document.createElement('option'); option.value = code;
        const name = code === 'CNY' ? '人民币' : getFiatNames(code).name;
        option.textContent = `${name} ${code}`;
        select.appendChild(option);
    }
    select.value = currency;
    buildCustomDropdown(select);
}

function syncCustomProducts() {
    for (const product of customProducts.values()) {
        currencyLogos[product.id] = { text: product.name, type: product.emoji ? 'emoji' : 'image', logo: product.emoji || customProductLogo(product) };
        const price = customProductUsdPrice(product);
        if (price) usdPrices[product.id] = price; else delete usdPrices[product.id];
    }
    for (let i = 1; i <= FIELD_COUNT; i++) {
        const select = document.getElementById(`currency${i}`);
        if (!select) continue;
        const group = select.querySelector('optgroup[data-category="product"]');
        for (const product of customProducts.values()) {
            let option = Array.from(select.options).find(item => item.value === product.id);
            if (!option) { option = document.createElement('option'); option.value = product.id; group.appendChild(option); }
            option.textContent = product.name;
        }
        updateSelectDisplay(select);
    }
}

function restoreCustomProducts() {
    try {
        const data = JSON.parse(localStorage.getItem(PRODUCT_STORAGE_KEY) || '[]');
        if (!Array.isArray(data)) return;
        customProducts = new Map(data.slice(0, PRODUCT_LIMIT).map(validateCustomProduct).filter(Boolean).map(item => [item.id, item]));
        syncCustomProducts();
    } catch { /* A missing or unavailable local store leaves the standard assets usable. */ }
}

function persistCustomProducts(next) {
    // Persist first so a full/blocked store never looks like a successful save.
    localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(Array.from(next.values())));
    customProducts = next;
    syncCustomProducts();
}

function productStatus(message) { document.getElementById('productStatus').textContent = message; }

function updateProductLogoPreview() {
    const image = document.getElementById('productLogoPreview');
    const emoji = document.getElementById('productEmojiPreview');
    image.hidden = !!productDraftEmoji;
    image.src = customProductLogo({ logo: productDraftLogo });
    emoji.hidden = !productDraftEmoji;
    emoji.textContent = productDraftEmoji;
    document.getElementById('productLogoRemove').hidden = !productDraftLogo && !productDraftEmoji;
    document.getElementById('productEmojiInput').value = productDraftEmoji;
}

function selectProductEmoji(emoji) {
    emoji = normalizeProductEmoji(emoji);
    if (emoji === null) { productStatus('请输入一个 Emoji；组合表情、肤色和国旗也可以。'); return; }
    // A pending image upload must not overwrite a later emoji selection.
    productImageVersion++; productImageBusy = false;
    productDraftLogo = ''; productDraftEmoji = emoji;
    document.getElementById('productLogoFile').value = '';
    updateProductLogoPreview(); productStatus('');
}

function resetProductForm(product = null) {
    productImageVersion++;
    productImageBusy = false;
    productEditId = product?.id || null;
    productDraftLogo = product?.logo || '';
    productDraftEmoji = product?.emoji || '';
    document.getElementById('productName').value = product?.name || '';
    document.getElementById('productPrice').value = product ? String(product.price) : '';
    updateProductCurrencyOptions(product?.currency || 'USD');
    document.getElementById('productLogoFile').value = '';
    updateProductLogoPreview();
    document.getElementById('productSave').textContent = product ? '保存修改并使用' : '保存并使用';
    document.getElementById('productNew').hidden = !product;
    productStatus('');
}

function chooseCustomProduct(id) {
    if (!productSelectId || !customProducts.has(id)) return;
    const select = document.getElementById(productSelectId);
    select.value = id; select.setAttribute('data-previous-value', id);
    updateSelectDisplay(select);
    closeCustomProductModal();
    convert(lastInputField); saveState();
}

function renderCustomProductList() {
    const list = document.getElementById('savedProducts'); list.replaceChildren();
    document.getElementById('savedProductsSection').hidden = !customProducts.size;
    for (const product of customProducts.values()) {
        const row = document.createElement('div'); row.className = 'saved-product';
        const use = document.createElement('button'); use.type = 'button'; use.className = 'saved-product-use';
        use.setAttribute('aria-label', `使用${product.name}`);
        const img = document.createElement(product.emoji ? 'span' : 'img');
        if (product.emoji) { img.className = 'product-emoji'; img.textContent = product.emoji; img.setAttribute('aria-hidden', 'true'); }
        else { img.src = customProductLogo(product); img.alt = ''; }
        const text = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = product.name;
        const price = document.createElement('small'); price.textContent = `${product.price.toLocaleString('zh-CN', { maximumFractionDigits: 12 })} ${product.currency || 'USD'} / 件`;
        text.append(name, price); use.append(img, text); use.onclick = () => chooseCustomProduct(product.id);
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'product-text-button'; edit.textContent = '编辑';
        edit.setAttribute('aria-label', `编辑${product.name}`); edit.onclick = () => {
            resetProductForm(product);
            document.getElementById('productForm').scrollIntoView({ block: 'start', behavior: 'smooth' });
        };
        row.append(use, edit); list.append(row);
    }
}

function openCustomProductModal(selectId) {
    const select = document.getElementById(selectId); if (!select) return;
    closeAllDropdowns(); productSelectId = selectId;
    productReturnFocus = select.parentElement.querySelector('.dropdown-trigger');
    resetProductForm(customProducts.get(select.value)); renderCustomProductList();
    const modal = document.getElementById('customProductModal');
    modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
    syncModalScrollLock();
    const version = productImageVersion;
    requestAnimationFrame(() => {
        if (productSelectId !== selectId || productImageVersion !== version) return;
        const target = window.matchMedia('(any-pointer: coarse)').matches ? modal.querySelector('.close') : document.getElementById('productName');
        target.focus({ preventScroll: true });
    });
}

function closeCustomProductModal() {
    closeAllDropdowns();
    productImageVersion++; productSelectId = null; productImageBusy = false;
    const modal = document.getElementById('customProductModal');
    modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true');
    syncModalScrollLock();
    if (productReturnFocus?.isConnected) productReturnFocus.focus({ preventScroll: true });
    productReturnFocus = null;
}

async function prepareProductLogo(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的 PNG、JPG 或 WebP 图片。');
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { img.src = ''; reject(new Error('图片读取超时，请重试。')); }, 10000);
            img.onload = () => { clearTimeout(timer); resolve(); };
            img.onerror = () => { clearTimeout(timer); reject(new Error('无法读取这张图片，请换一张。')); };
            img.src = url;
        });
        if (!img.naturalWidth || !img.naturalHeight) throw new Error('这张图片没有有效尺寸。');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
        // Keep the whole mark inside the circular display area, including square corners.
        const scale = 176 / Math.max(img.naturalWidth, img.naturalHeight);
        const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
        ctx.drawImage(img, (256 - width) / 2, (256 - height) / 2, width, height);
        const logo = canvas.toDataURL('image/webp', 0.85);
        if (logo.length > 200000) throw new Error('图片压缩后仍过大，请换一张较简单的 Logo。');
        return logo;
    } finally { URL.revokeObjectURL(url); }
}

async function onProductLogoChange(event) {
    const file = event.target.files[0]; if (!file) return;
    const version = ++productImageVersion; productImageBusy = true; productStatus('正在处理图片…');
    try {
        const logo = await prepareProductLogo(file);
        if (version !== productImageVersion || !productSelectId) return;
        productDraftLogo = logo; productDraftEmoji = '';
        updateProductLogoPreview();
        productStatus('');
    } catch (error) {
        if (version === productImageVersion && productSelectId) productStatus(error.message);
    } finally { if (version === productImageVersion) productImageBusy = false; }
}

function saveCustomProduct(event) {
    event.preventDefault();
    if (!productSelectId) return;
    if (normalizeProductEmoji(document.getElementById('productEmojiInput').value) === null) { productStatus('请输入一个 Emoji，或清空后使用图片。'); return; }
    if (productImageBusy) { productStatus('图片还在处理中，请稍等。'); return; }
    const item = validateCustomProduct({
        id: productEditId || `PRODUCT:${crypto.randomUUID()}`,
        name: document.getElementById('productName').value,
        price: Number(document.getElementById('productPrice').value), currency: document.getElementById('productCurrency').value, logo: productDraftLogo, emoji: productDraftEmoji
    });
    if (!item) { productStatus('请填写 1–30 字的名称，以及大于 0 的有效单价。'); return; }
    if (!customProductUsdPrice(item)) { productStatus('该币种汇率暂不可用，请等汇率加载后重试。'); return; }
    if (!productEditId && customProducts.size >= PRODUCT_LIMIT) { productStatus('最多保存 20 个自定义实物，请编辑已有实物。'); return; }
    const next = new Map(customProducts); next.set(item.id, item);
    try { persistCustomProducts(next); }
    catch { productStatus('保存失败：浏览器存储不可用或空间不足，请移除 Logo 后重试。'); return; }
    chooseCustomProduct(item.id);
    showToast('自定义实物已保存');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('productForm').addEventListener('submit', saveCustomProduct);
    document.getElementById('productLogoFile').addEventListener('change', onProductLogoChange);
    document.getElementById('productNew').addEventListener('click', () => resetProductForm());
    document.getElementById('productLogoRemove').addEventListener('click', () => selectProductEmoji(''));
    const emojiInput = document.getElementById('productEmojiInput');
    emojiInput.addEventListener('focus', () => emojiInput.select());
    emojiInput.addEventListener('input', event => {
        if (!event.isComposing) selectProductEmoji(emojiInput.value);
    });
    emojiInput.addEventListener('compositionend', () => selectProductEmoji(emojiInput.value));
    const modal = document.getElementById('customProductModal');
    modal.querySelector('.close').addEventListener('click', closeCustomProductModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeCustomProductModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && productSelectId) closeCustomProductModal(); });
});
