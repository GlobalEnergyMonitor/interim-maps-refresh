// Runtime tweaks that site.js doesn't expose via CSS:
//   • relabel verbose navbar dropdown eyebrows to "Region:" / "Search in:"
//   • flip dropup → dropdown (navbar is now at the top)
//   • set search placeholder to "Search this map"
//   • add thousand separators to legend count cells (and re-format
//     whenever site.js mutates them)
//   • zoom map to the selected region/country after a Region pick
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
        if (search) search.textContent = 'Search in:';

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

    // Zoom the map to whatever country/continent the user picks in the
    // Region dropdown. Reading state from site.js's globals: `map`,
    // `config.selectedCountries`, `config.geojson`, `config.countryField`,
    // `config.center`, and `determineZoom()`. Bounds are computed from the
    // tracker's own features (not country polygon boundaries) so the view
    // tightens around where the projects actually are.
    function expandBboxFromCoords(coords, b) {
        if (typeof coords[0] === 'number') {
            const [x, y] = coords;
            if (x < b[0]) b[0] = x;
            if (y < b[1]) b[1] = y;
            if (x > b[2]) b[2] = x;
            if (y > b[3]) b[3] = y;
            return;
        }
        for (const c of coords) expandBboxFromCoords(c, b);
    }

    function boundsForSelection() {
        const cfg = window.config;
        if (!cfg || !cfg.geojson || !cfg.countryField) return null;
        const selected = cfg.selectedCountries || [];
        if (selected.length === 0) return null;
        const countryField = cfg.countryField;
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        let hit = false;
        for (const f of cfg.geojson.features) {
            const raw = f.properties && f.properties[countryField];
            if (raw == null) continue;
            const list = String(raw).split(';').map(s => s.trim());
            if (!selected.some(c => list.includes(c))) continue;
            if (!f.geometry || !f.geometry.coordinates) continue;
            expandBboxFromCoords(f.geometry.coordinates, b);
            hit = true;
        }
        return hit && isFinite(b[0]) ? b : null;
    }

    // Zoom level for a given bbox span (in degrees). Empirically tuned to
    // give roughly country-sized framing on a 1600×900 viewport. Mapbox's
    // own fitBounds misbehaves on globe projection (wraps the long way
    // around), so we compute center+zoom and flyTo instead.
    function zoomForSpan(lngSpan, latSpan) {
        const span = Math.max(lngSpan, latSpan * 1.5);
        if (span > 80) return 1.5;
        if (span > 40) return 2.5;
        if (span > 20) return 3.5;
        if (span > 10) return 4.5;
        if (span > 5) return 5.5;
        if (span > 2) return 6.5;
        return 7;
    }

    function zoomToSelection() {
        let m = null;
        try { m = (typeof map !== 'undefined') ? map : window.map; } catch (e) {}
        if (!m) return;
        const cfg = window.config;
        const selected = (cfg && cfg.selectedCountries) || [];
        if (selected.length === 0) {
            if (cfg && cfg.center) {
                const z = (typeof determineZoom === 'function') ? determineZoom() : m.getZoom();
                m.flyTo({ center: cfg.center, zoom: z, duration: 800 });
            }
            return;
        }
        const b = boundsForSelection();
        if (!b) return;
        const center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        const zoom = zoomForSpan(b[2] - b[0], b[3] - b[1]);
        m.flyTo({ center, zoom, duration: 800 });
    }

    function bindRegionZoom() {
        const root = document.getElementById('country_select');
        if (!root) return false;
        root.addEventListener('click', function (e) {
            const a = e.target.closest('.country-dropdown-item');
            if (!a) return;
            // Defer so site.js's own click handler (also on bubble) has
            // already updated config.selectedCountries before we read it.
            setTimeout(zoomToSelection, 0);
        });
        // site.js leaves a 200ms close delay on continent submenus, which
        // causes the previous submenu to linger on screen while the next
        // one opens. Close all other submenus immediately when the user
        // hovers a new continent row.
        root.addEventListener('mouseover', function (e) {
            const li = e.target.closest('li.continent-li');
            if (!li) return;
            root.querySelectorAll('li.continent-li .submenu').forEach(sub => {
                if (!li.contains(sub)) sub.style.display = 'none';
            });
        });
        return true;
    }

    function bindRegionZoomWhenReady() {
        if (bindRegionZoom()) return;
        let tries = 0;
        const iv = setInterval(() => {
            if (bindRegionZoom() || ++tries > 40) clearInterval(iv);
        }, 250);
    }

    if (document.readyState === 'complete') { relabel(); applyMapPaddingWhenReady(); bindRegionZoomWhenReady(); }
    else window.addEventListener('load', () => { relabel(); applyMapPaddingWhenReady(); bindRegionZoomWhenReady(); });

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
