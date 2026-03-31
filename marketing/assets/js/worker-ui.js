(function() {
  // Scroll restore
  var K = 'lotusia-scroll-restore';
  var q = function(v) { return String(v || '').replace(/[^A-Za-z0-9_-]/g, ''); };
  var hasPagerParam = function(href) { return /[?&][A-Za-z0-9_]*page=/i.test(String(href || '')); };
  var save = function(groupEl) {
    try {
      var y = window.scrollY || window.pageYOffset || 0;
      var payload = { from: location.pathname + location.search, y: y, ts: Date.now() };
      if (groupEl) {
        var gid = q(groupEl.getAttribute('data-pagination-group') || '');
        if (gid) { var gtop = (groupEl.getBoundingClientRect().top || 0) + y; payload.group = gid; payload.offset = y - gtop; }
      }
      sessionStorage.setItem(K, JSON.stringify(payload));
    } catch (_) {}
  };
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!hasPagerParam(href)) return;
    if (href.charAt(0) !== '/') return;
    save(a.closest('[data-pagination-group]'));
  });
  document.addEventListener('change', function(e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches('select[data-page-size-select]')) return;
    save(el.closest('[data-pagination-group]'));
  });
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var raw = sessionStorage.getItem(K);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (!s || !Number.isFinite(s.y)) return;
    if (Date.now() - Number(s.ts || 0) > 20000) return;
    var fromPath = String(s.from || '').split('?')[0] || '';
    if (fromPath && fromPath !== location.pathname) return;
    var targetY = Math.max(0, Number(s.y) || 0);
    if (s.group) {
      var g = document.querySelector('[data-pagination-group="' + q(s.group) + '"]');
      if (g) { var gy = (g.getBoundingClientRect().top || 0) + (window.scrollY || window.pageYOffset || 0); targetY = Math.max(0, gy + Number(s.offset || 0)); }
    }
    var root = document.documentElement;
    var body = document.body;
    var lockInstant = function(on) {
      if (!root) return;
      if (on) { root.style.setProperty('scroll-behavior', 'auto', 'important'); if (body) body.style.setProperty('scroll-behavior', 'auto', 'important'); }
      else { root.style.removeProperty('scroll-behavior'); if (body) body.style.removeProperty('scroll-behavior'); }
    };
    lockInstant(true);
    var jump = function() { window.scrollTo(0, targetY); };
    jump();
    requestAnimationFrame(jump);
    window.addEventListener('DOMContentLoaded', jump, { once: true });
    window.addEventListener('load', function() { jump(); sessionStorage.removeItem(K); setTimeout(function() { lockInstant(false); }, 0); }, { once: true });
  } catch (_) {}
})();

(function() {
  // Avatar boot with error/load handling
  if (window.__lotusiaAvatarBoot) return;
  var parseSources = function(img) {
    if (Array.isArray(img.__avatarSources)) return img.__avatarSources;
    var raw = img.getAttribute('data-avatar-sources') || '';
    if (!raw) { img.__avatarSources = []; return img.__avatarSources; }
    var out = [];
    var parts = raw.split(',');
    for (var i = 0; i < parts.length; i++) { try { var dec = decodeURIComponent(parts[i] || ''); if (dec && out.indexOf(dec) === -1) out.push(dec); } catch (_) {} }
    img.__avatarSources = out;
    return out;
  };
  var avatarNext = function(img) {
    if (!img) return;
    var list = parseSources(img);
    var step = Number(img.getAttribute('data-avatar-step') || '0');
    if (!Number.isFinite(step) || step < 0) step = 0;
    var next = step + 1;
    if (next < list.length) { img.setAttribute('data-avatar-step', String(next)); img.src = list[next]; return; }
    img.style.display = 'none';
  };
  window.__lotusiaAvatarNext = avatarNext;
  var boot = function() {
    var nodes = document.querySelectorAll('img[data-avatar-img]');
    for (var i = 0; i < nodes.length; i++) {
      var img = nodes[i];
      var list = parseSources(img);
      if (!list.length) continue;
      if (!img.__avatarListeners) {
        img.addEventListener('error', function() { avatarNext(this); });
        img.addEventListener('load', function() { this.style.display = 'block'; });
        img.__avatarListeners = true;
      }
      if (!img.getAttribute('src')) { img.setAttribute('data-avatar-step', '0'); img.src = list[0]; }
    }
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot, { once: true }); }
  else { boot(); }
  window.__lotusiaAvatarBoot = true;
})();

(function() {
  // Table cell ellipsis
  var run = function() {
    var nodes = document.querySelectorAll('table th, table td, table td a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el) continue;
      if (el.children && el.children.length > 0 && el.tagName !== 'A') continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      var txt = (el.textContent || '').trim();
      if (!txt) continue;
      el.title = txt;
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'ellipsis';
      el.style.whiteSpace = 'nowrap';
      if (el.tagName === 'A' && el.style.display !== 'inline-block') { el.style.display = 'inline-block'; }
    }
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', run); }
  else { run(); }
})();

(function() {
  // Page-size select toggle
  document.addEventListener('click', function(e) {
    var b = e.target.closest('[data-page-size-select]');
    if (!b) return;
    var root = b.closest('[data-page-size-root]');
    if (!root) return;
    var menus = document.querySelectorAll('[data-page-size-menu]');
    for (var i = 0; i < menus.length; i++) {
      if (root.contains(menus[i])) continue;
      menus[i].classList.add('hidden');
      var t = menus[i].previousElementSibling;
      if (t && t.setAttribute) t.setAttribute('aria-expanded', 'false');
    }
    var m = root.querySelector('[data-page-size-menu]');
    if (!m) return;
    var isOpen = b.getAttribute('aria-expanded') === 'true';
    m.classList.toggle('hidden', isOpen);
    b.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  });
})();
