(() => {
    const storageKey = 'valuesCorrectorTheme';
    const root = document.documentElement;
    let theme = 'dark';
    try {
        if (localStorage.getItem(storageKey) === 'light') theme = 'light';
    } catch { /* A blocked storage area must not prevent theme switching. */ }

    function applyTheme(nextTheme) {
        theme = nextTheme;
        root.dataset.theme = theme;
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.content = theme === 'dark' ? '#080808' : '#f5f5f7';
        const button = document.getElementById('themeToggle');
        if (button) {
            const label = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
            button.setAttribute('aria-label', label);
            button.title = label;
        }
    }

    applyTheme(theme);
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(theme);
        document.getElementById('themeToggle').addEventListener('click', () => {
            applyTheme(theme === 'dark' ? 'light' : 'dark');
            try { localStorage.setItem(storageKey, theme); } catch { /* Keep the session choice. */ }
        });
    });
})();
