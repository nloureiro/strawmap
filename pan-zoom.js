/**
 * PanZoom — Vanilla JS zoom for inline SVG with custom search.
 *
 * - Mouse wheel: zoom centered on cursor
 * - Mouse drag: pan when zoomed in (clamped to map bounds)
 * - Double-click: reset to fit
 * - Touch: pinch-to-zoom, single-finger pan (clamped)
 * - Ctrl+F: custom search with SVG highlights
 * - Click: follows links in the SVG
 */
const PanZoom = (() => {
  const ZOOM_SPEED = 0.002;
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 20;
  const DRAG_THRESHOLD = 5;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function init(containerId, opts) {
    const container = document.getElementById(containerId);
    const loadingEl = opts.loadingEl ? document.getElementById(opts.loadingEl) : null;

    let svgEl = null;
    let scale = 1;
    let tx = 0, ty = 0;

    // Mouse drag state
    let dragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragOriginTx = 0, dragOriginTy = 0;
    let dragMoved = false;

    // Touch state
    let touchStartX = 0, touchStartY = 0;
    let touchOriginTx = 0, touchOriginTy = 0;
    let touching = false;
    let touchMoved = false;
    let lastTouchDist = 0;
    let lastTouchCx = 0, lastTouchCy = 0;

    // Search state
    let searchWords = [];
    let highlightGroup = null;
    let matches = [];
    let searchBar = null;
    let searchInput = null;
    let searchCount = null;

    // ── Transform ──

    function clampTranslation() {
      const rect = container.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      const sw = vb.width * scale;
      const sh = vb.height * scale;

      if (sw > rect.width) {
        tx = Math.min(0, Math.max(rect.width - sw, tx));
      } else {
        tx = (rect.width - sw) / 2;
      }
      if (sh > rect.height) {
        ty = Math.min(0, Math.max(rect.height - sh, ty));
      } else {
        ty = (rect.height - sh) / 2;
      }
    }

    function applyTransform() {
      if (!svgEl) return;
      svgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function isZoomedIn() {
      return scale > fitScale() + 0.001;
    }

    function updateCursor() {
      container.style.cursor = isZoomedIn() ? 'grab' : 'default';
    }

    function fitToViewport() {
      if (!svgEl || !container) return;
      const rect = container.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      if (!vb || vb.width === 0) return;

      const scaleX = rect.width / vb.width;
      const scaleY = rect.height / vb.height;
      scale = Math.min(scaleX, scaleY) * 0.95;
      tx = (rect.width - vb.width * scale) / 2;
      ty = (rect.height - vb.height * scale) / 2;
      applyTransform();
      updateCursor();
    }

    function cleanGoogleUrls(root) {
      root.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
        const m = href.match(/google\.com\/url\?q=([^&]+)/);
        if (m) {
          const real = decodeURIComponent(m[1]);
          a.setAttribute('href', real);
          if (a.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
            a.setAttributeNS('http://www.w3.org/1999/xlink', 'href', real);
          }
        }
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    }

    // ── Mouse: wheel zoom + click for links ──

    function fitScale() {
      const rect = container.getBoundingClientRect();
      const vb = svgEl && svgEl.viewBox.baseVal;
      if (!rect.width || !vb || !vb.width) return MIN_SCALE;
      return Math.min(rect.width / vb.width, rect.height / vb.height) * 0.95;
    }

    function onWheel(e) {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = -e.deltaY * ZOOM_SPEED;
      const minScale = fitScale();
      const newScale = Math.min(MAX_SCALE, Math.max(minScale, scale * (1 + delta)));

      // At or below fit scale — snap to centered fit
      if (newScale <= minScale) {
        fitToViewport();
        return;
      }

      const ratio = newScale / scale;
      tx = mx - ratio * (mx - tx);
      ty = my - ratio * (my - ty);
      scale = newScale;
      clampTranslation();
      applyTransform();
      updateCursor();
    }

    // ── Mouse drag (only when zoomed in) ──

    function onMouseDown(e) {
      if (e.button !== 0 || !isZoomedIn()) return;
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOriginTx = tx;
      dragOriginTy = ty;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!dragMoved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      dragMoved = true;
      tx = dragOriginTx + dx;
      ty = dragOriginTy + dy;
      clampTranslation();
      applyTransform();
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      updateCursor();
    }

    function onClick(e) {
      // Suppress click if we just finished a drag
      if (dragMoved) {
        dragMoved = false;
        return;
      }
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target) {
        const link = target.closest('a');
        if (link) {
          e.preventDefault();
          const href = link.getAttribute('href') || link.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          if (href) window.open(href, '_blank', 'noopener');
        }
      }
    }

    function onDblClick(e) {
      e.preventDefault();
      fitToViewport();
    }

    // ── Touch: single-finger pan + pinch-to-zoom ──

    function touchDist(t1, t2) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e) {
      if (e.touches.length === 1) {
        touching = true;
        touchMoved = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchOriginTx = tx;
        touchOriginTy = ty;
      } else if (e.touches.length === 2) {
        touching = false;
        lastTouchDist = touchDist(e.touches[0], e.touches[1]);
        lastTouchCx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchCy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }

    function onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && touching) {
        // Single-finger pan only when zoomed in
        if (!isZoomedIn()) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (!touchMoved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
        touchMoved = true;
        tx = touchOriginTx + dx;
        ty = touchOriginTy + dy;
        clampTranslation();
        applyTransform();
      } else if (e.touches.length === 2) {
        const dist = touchDist(e.touches[0], e.touches[1]);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        if (lastTouchDist > 0) {
          const rect = container.getBoundingClientRect();
          const mx = cx - rect.left;
          const my = cy - rect.top;
          const ratio = dist / lastTouchDist;
          const minScale = fitScale();
          const newScale = Math.min(MAX_SCALE, Math.max(minScale, scale * ratio));

          if (newScale <= minScale) {
            fitToViewport();
          } else {
            const actualRatio = newScale / scale;
            tx = mx - actualRatio * (mx - tx) + (cx - lastTouchCx);
            ty = my - actualRatio * (my - ty) + (cy - lastTouchCy);
            scale = newScale;
            clampTranslation();
            applyTransform();
          }
        }

        lastTouchDist = dist;
        lastTouchCx = cx;
        lastTouchCy = cy;
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length === 0) {
        touching = false;
        touchMoved = false;
        lastTouchDist = 0;
      } else if (e.touches.length === 1) {
        touching = true;
        touchMoved = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchOriginTx = tx;
        touchOriginTy = ty;
        lastTouchDist = 0;
      }
    }

    // ── Search ──

    function initSearch() {
      const dataEl = svgEl.querySelector('#search-data');
      if (dataEl) {
        try {
          searchWords = JSON.parse(dataEl.getAttribute('data-words') || '[]');
        } catch (e) {
          searchWords = [];
        }
        dataEl.remove();
      }

      highlightGroup = document.createElementNS(SVG_NS, 'g');
      highlightGroup.id = 'search-highlights';
      svgEl.appendChild(highlightGroup);

      searchBar = document.createElement('div');
      searchBar.className = 'map-search-bar';
      searchBar.style.display = 'none';
      searchBar.innerHTML =
        '<input type="text" placeholder="Search in map…" spellcheck="false">' +
        '<span class="search-count"></span>' +
        '<button class="search-close" title="Close (Escape)">&times;</button>';
      container.parentElement.appendChild(searchBar);

      searchInput = searchBar.querySelector('input');
      searchCount = searchBar.querySelector('.search-count');
      const closeBtn = searchBar.querySelector('.search-close');

      let debounceTimer = 0;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => doSearch(searchInput.value), 80);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSearch();
        }
      });
      closeBtn.addEventListener('click', closeSearch);

      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          openSearch();
        }
      });
    }

    function openSearch() {
      searchBar.style.display = 'flex';
      searchInput.focus();
      searchInput.select();
    }

    function closeSearch() {
      searchBar.style.display = 'none';
      searchInput.value = '';
      clearHighlights();
      matches = [];
      searchCount.textContent = '';
    }

    function doSearch(query) {
      clearHighlights();
      matches = [];

      const q = query.trim().toLowerCase();
      if (!q || searchWords.length === 0) {
        searchCount.textContent = '';
        return;
      }

      const queryWords = q.split(/\s+/);
      for (let i = 0; i < searchWords.length; i++) {
        const wt = searchWords[i].t.toLowerCase();
        for (const qw of queryWords) {
          if (wt.includes(qw)) {
            matches.push(i);
            break;
          }
        }
      }

      if (matches.length > 0) {
        drawHighlights();
        searchCount.textContent = `${matches.length} found`;
      } else {
        searchCount.textContent = 'No matches';
      }
    }

    function clearHighlights() {
      if (!highlightGroup) return;
      while (highlightGroup.firstChild) highlightGroup.removeChild(highlightGroup.firstChild);
    }

    function drawHighlights() {
      clearHighlights();
      const PAD = 3;
      matches.forEach(wi => {
        const w = searchWords[wi];
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', w.x - PAD);
        rect.setAttribute('y', w.y - PAD);
        rect.setAttribute('width', w.w + PAD * 2);
        rect.setAttribute('height', w.h + PAD * 2);
        rect.setAttribute('rx', 3);
        rect.setAttribute('fill', '#ff8c00');
        rect.setAttribute('fill-opacity', '0.45');
        rect.setAttribute('stroke', '#e65100');
        rect.setAttribute('stroke-width', '1.5');
        highlightGroup.appendChild(rect);
      });
    }

    // ── Load SVG ──

    fetch(opts.svgUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(svgText => {
        if (loadingEl) loadingEl.style.display = 'none';

        container.innerHTML = svgText;
        svgEl = container.querySelector('svg');
        if (!svgEl) throw new Error('No <svg> in response');

        const vb = svgEl.viewBox.baseVal;
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.setAttribute('width', vb.width);
        svgEl.setAttribute('height', vb.height);
        svgEl.style.position = 'absolute';
        svgEl.style.top = '0';
        svgEl.style.left = '0';
        svgEl.style.transformOrigin = '0 0';
        svgEl.style.willChange = 'transform';
        svgEl.style.overflow = 'visible';

        cleanGoogleUrls(svgEl);
        initSearch();
        fitToViewport();

        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        container.addEventListener('click', onClick);
        container.addEventListener('dblclick', onDblClick);
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);
        window.addEventListener('resize', fitToViewport);
      })
      .catch(err => {
        console.error('PanZoom load error:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        container.innerHTML =
          '<div class="map-error">' +
          'Failed to load the strawmap. ' +
          '<a href="' + (opts.fallbackUrl || '#') + '" target="_blank">View on Google Drawings ↗</a>' +
          '</div>';
      });
  }

  return { init };
})();
