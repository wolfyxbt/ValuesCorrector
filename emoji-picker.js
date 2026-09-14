// Local Unicode catalog; only loaded when the user opens the picker.
const EMOJI_GROUPS = [
    ['😀', '表情'], ['👋', '人物'], ['🦰', '发型肤色'], ['🐻', '动物自然'],
    ['🍔', '食物饮品'], ['🚗', '旅行地点'], ['⚽', '活动'], ['💡', '物品'],
    ['❤️', '符号'], ['🏳️', '旗帜']
];
let emojiCatalogPromise = null;
function loadEmojiCatalog() {
    if (!emojiCatalogPromise) {
        emojiCatalogPromise = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch('assets/emoji/catalog.json?v=17.0', { signal: controller.signal });
                if (!response.ok) throw new Error('Emoji catalog unavailable');
                const data = await response.json();
                if (!Array.isArray(data.entries)) throw new Error('Invalid emoji catalog');
                return data.entries;
            } finally { clearTimeout(timer); }
        })().catch(error => { emojiCatalogPromise = null; throw error; });
    }
    return emojiCatalogPromise;
}
function filterEmojiCatalog(entries, query, group) {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter(([emoji, label, category, keywords]) => needle
        ? `${emoji} ${label} ${keywords}`.toLocaleLowerCase().includes(needle)
        : category === group);
}

document.addEventListener('DOMContentLoaded', () => {
    const dropdown = document.getElementById('productEmojiDropdown');
    const trigger = document.getElementById('productEmojiTrigger');
    const menu = document.createElement('div');
    menu.id = 'productEmojiMenu'; menu.className = 'dropdown-menu emoji-picker-menu';
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', '选择 Emoji');
    const scroll = document.createElement('div'); scroll.className = 'dropdown-menu-scroll';
    menu.appendChild(scroll); document.body.appendChild(menu); dropdown._menu = menu;
    const header = document.createElement('div'); header.className = 'emoji-picker-header';
    const search = document.createElement('input'); search.type = 'search'; search.className = 'emoji-search';
    search.placeholder = '搜索表情'; search.setAttribute('aria-label', '搜索 Emoji'); search.autocomplete = 'off';
    const categories = document.createElement('div'); categories.className = 'emoji-categories';
    categories.setAttribute('role', 'group'); categories.setAttribute('aria-label', '表情分类');
    const status = document.createElement('div'); status.className = 'emoji-picker-status';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const grid = document.createElement('div'); grid.className = 'emoji-grid';
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '表情列表');
    const more = document.createElement('button'); more.type = 'button'; more.className = 'emoji-more'; more.textContent = '显示更多';
    header.append(search, categories); scroll.append(header, status, grid, more);
    let entries = null, group = 0, limit = 96, retry = false;
    const isOpen = () => dropdown.classList.contains('open');
    const close = () => { closeAllDropdowns(); trigger.focus({ preventScroll: true }); };
    const render = (resetScroll = true) => {
        if (!entries || !isOpen()) return;
        const matches = filterEmojiCatalog(entries, search.value, group);
        grid.replaceChildren();
        status.textContent = matches.length ? `${search.value.trim() ? '搜索结果' : EMOJI_GROUPS[group][1]} · ${matches.length}` : '没有找到表情';
        for (const [emoji, label] of matches.slice(0, limit)) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'emoji-choice';
            button.textContent = emoji; button.title = label; button.setAttribute('aria-label', label);
            button.setAttribute('aria-pressed', String(productDraftEmoji === emoji));
            button.addEventListener('click', () => { selectProductEmoji(emoji); close(); });
            grid.appendChild(button);
        }
        for (const button of categories.children) button.setAttribute('aria-pressed', String(!search.value.trim() && Number(button.dataset.group) === group));
        more.hidden = matches.length <= limit; more.textContent = '显示更多'; retry = false;
        if (resetScroll) scroll.scrollTop = 0;
        positionDropdownMenu(dropdown);
    };
    EMOJI_GROUPS.forEach(([emoji, name], index) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = emoji;
        button.title = name; button.dataset.group = index; button.setAttribute('aria-label', name);
        button.addEventListener('click', () => { group = index; limit = 96; search.value = ''; render(); });
        categories.appendChild(button);
    });
    const open = async () => {
        closeAllDropdowns(dropdown); dropdown.classList.add('open'); trigger.setAttribute('aria-expanded', 'true');
        menu.style.display = 'block'; search.value = ''; limit = 96;
        if (entries) render();
        else { grid.replaceChildren(); status.textContent = '正在加载表情…'; more.hidden = true; positionDropdownMenu(dropdown); }
        if (!window.matchMedia('(any-pointer: coarse)').matches) search.focus({ preventScroll: true });
        try {
            entries = await loadEmojiCatalog();
            if (isOpen()) render();
        } catch {
            if (!isOpen()) return;
            status.textContent = '表情加载失败'; more.textContent = '重试'; more.hidden = false; retry = true;
            positionDropdownMenu(dropdown);
        }
    };
    trigger.addEventListener('click', () => { if (isOpen()) close(); else open(); });
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); open(); }
        if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); close(); }
    });
    search.addEventListener('input', () => { limit = 96; render(); });
    more.addEventListener('click', () => {
        if (retry) { open(); return; }
        const previous = limit; limit += 96; render(false);
        grid.children[previous]?.focus({ preventScroll: true });
    });
    menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === 'Tab') {
            event.stopPropagation();
            const items = Array.from(menu.querySelectorAll('input, button')).filter(el => !el.hidden && el.getClientRects().length);
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
            else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
        }
        const items = Array.from(grid.children), index = items.indexOf(document.activeElement);
        if (index < 0) return;
        const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
        if (step) { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, index + step))]?.focus(); }
    });
});
