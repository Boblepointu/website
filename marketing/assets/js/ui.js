(function() {
  // Theme toggle
  document.addEventListener('click', function(e) {
    var b = e.target.closest('[data-toggle-theme]');
    if (!b) return;
    var d = document.documentElement;
    d.classList.toggle('dark');
    localStorage.setItem('theme', d.classList.contains('dark') ? 'dark' : 'light');
  });

  // Mobile nav toggle
  document.addEventListener('click', function(e) {
    var b = e.target.closest('[data-toggle-mobile-nav]');
    if (!b) return;
    var n = document.getElementById('mobile-nav');
    if (!n) return;
    n.classList.toggle('hidden');
    b.setAttribute('aria-expanded', n.classList.contains('hidden') ? 'false' : 'true');
  });

  // Dropdowns: defer DOM reads to next frame to avoid forced layout during first paint
  function initDropdowns() {
  var dropdowns = Array.from(document.querySelectorAll('[data-dropdown]'));
  if (dropdowns.length) {
    var close = function(el) {
      var menu = el.querySelector('[data-dropdown-menu]');
      var trigger = el.querySelector('[data-dropdown-trigger]');
      if (!menu || !trigger) return;
      menu.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    };
    var open = function(el) {
      var menu = el.querySelector('[data-dropdown-menu]');
      var trigger = el.querySelector('[data-dropdown-trigger]');
      if (!menu || !trigger) return;
      menu.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
    };
    dropdowns.forEach(function(el) {
      var trigger = el.querySelector('[data-dropdown-trigger]');
      var closeTimer = null;
      if (!trigger) return;
      var scheduleClose = function() { clearTimeout(closeTimer); closeTimer = setTimeout(function() { close(el); }, 140); };
      var cancelClose = function() { clearTimeout(closeTimer); };
      el.addEventListener('mouseenter', function() { cancelClose(); open(el); });
      el.addEventListener('mouseleave', scheduleClose);
      el.addEventListener('focusin', function() { cancelClose(); open(el); });
      el.addEventListener('focusout', function() { if (!el.contains(document.activeElement)) scheduleClose(); });
      trigger.addEventListener('click', function(a) {
        a.preventDefault();
        cancelClose();
        var expanded = trigger.getAttribute('aria-expanded') === 'true';
        dropdowns.forEach(function(x) { if (x !== el) close(x); });
        if (expanded) close(el); else open(el);
      });
    });
    document.addEventListener('click', function(e) {
      dropdowns.forEach(function(el) { if (!el.contains(e.target)) close(el); });
    });
  }
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(initDropdowns);
  } else {
    initDropdowns();
  }
})();
