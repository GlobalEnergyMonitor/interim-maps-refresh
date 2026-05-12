// Runtime tweaks that site.js doesn't expose via CSS:
//   • relabel verbose navbar dropdown eyebrows to "Region:" / "Filter:"
//   • flip dropup → dropdown (navbar is now at the top)
//   • set search placeholder to "Search this map"
//   • add thousand separators to legend count cells (and re-format
//     whenever site.js mutates them)
(function () {
    function formatCount(text) {
        const n = Number(String(text).replace(/[^0-9.\-]/g, ''));
        if (!Number.isFinite(n)) return text;
        return n.toLocaleString('en-US');
    }

    function formatLegendCounts(root) {
        (root || document).querySelectorAll('.filter-row .col-3').forEach(cell => {
            const raw = cell.textContent.trim();
            if (!raw) return;
            const formatted = formatCount(raw);
            if (formatted !== raw) cell.textContent = formatted;
        });
    }

    function relabel() {
        const country = document.querySelector('#country .nav-link .small');
        if (country) country.textContent = 'Region:';
        const search = document.querySelector('#search-type .nav-link .small');
        if (search) search.textContent = 'Filter:';

        const searchInput = document.querySelector('#search-text');
        if (searchInput) searchInput.placeholder = 'Search this map';

        document.querySelectorAll('.navbar.fixed-bottom .nav-item.dropup').forEach(el => {
            el.classList.remove('dropup');
            el.classList.add('dropdown');
        });

        formatLegendCounts();
    }

    function setMapPadding() {
        // The navbar (top) and legend (bottom-left) float over the map.
        // Tell mapbox where the visible content area is so initial center
        // and any setCenter/fitBounds calls don't put content under them.
        // site.js declares `const map`; we read it via the global scope.
        let m = null;
        try { m = (typeof map !== 'undefined') ? map : window.map; } catch (e) {}
        if (!m || !m.setPadding) return false;
        try {
            m.setPadding({ top: 72, bottom: 24, left: 0, right: 0 });
            return true;
        } catch (e) {
            return false;
        }
    }

    function applyMapPaddingWhenReady() {
        if (setMapPadding()) return;
        // map global isn't ready yet; poll briefly
        let tries = 0;
        const iv = setInterval(() => {
            if (setMapPadding() || ++tries > 40) clearInterval(iv);
        }, 250);
    }

    if (document.readyState === 'complete') { relabel(); applyMapPaddingWhenReady(); }
    else window.addEventListener('load', () => { relabel(); applyMapPaddingWhenReady(); });

    // site.js re-renders count cells when the filter changes.
    // Watch the filter form and re-format any digits-only text that lands in .col-3.
    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
        const obs = new MutationObserver(() => formatLegendCounts(filterForm));
        obs.observe(filterForm, { childList: true, subtree: true, characterData: true });
    } else {
        window.addEventListener('load', () => {
            const f = document.getElementById('filter-form');
            if (!f) return;
            const obs = new MutationObserver(() => formatLegendCounts(f));
            obs.observe(f, { childList: true, subtree: true, characterData: true });
        });
    }
})();
