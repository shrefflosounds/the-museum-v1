/**
 * TEXT LOADER — reads GAME_TEXT.txt (in this same folder) and swaps in your custom words.
 * Format of GAME_TEXT.txt:   name = text you want
 *   - lines starting with # are notes
 *   - leave the right side empty to remove that text
 *   - **double stars** make words bold (only where noted)
 *   - {words in braces} are filled in by the game
 * If GAME_TEXT.txt is missing or a line is deleted, the original text is used.
 */
(function () {
  'use strict';
  var map = Object.create(null);

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'GAME_TEXT.txt?t=' + Date.now(), false); // synchronous so text is ready before the game starts
    xhr.overrideMimeType('text/plain; charset=utf-8');
    xhr.send(null);
    if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
      xhr.responseText.split(/\r?\n/).forEach(function (line) {
        if (/^\s*(#|\[|$)/.test(line)) return;
        var i = line.indexOf('=');
        if (i < 0) return;
        var key = line.slice(0, i).trim();
        if (key) map[key] = line.slice(i + 1).trim();
      });
    }
  } catch (e) {
    console.warn('GAME_TEXT.txt could not be loaded — using original text.', e);
  }

  function has(key) { return Object.prototype.hasOwnProperty.call(map, key); }

  function t(key, fallback, vars) {
    var s = has(key) ? map[key] : fallback;
    if (s == null) s = '';
    if (vars) s = String(s).replace(/\{(\w+)\}/g, function (m, n) { return n in vars ? vars[n] : m; });
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function boldify(s) {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function hideIfEmpty(el, v) {
    // (buttons and game-controlled elements with an id are never hidden)
    if (v === '' && el.tagName !== 'BUTTON' && !el.id) el.style.display = 'none';
  }

  window.GameText = { t: t, has: has, map: map };

  // ---- Apply to the on-screen menus / HUD ----
  if (has('window_title')) document.title = map.window_title;

  var nodes = document.querySelectorAll('[data-text]');
  for (var i = 0; i < nodes.length; i++) {
    var key = nodes[i].getAttribute('data-text');
    if (has(key)) { nodes[i].textContent = map[key]; hideIfEmpty(nodes[i], map[key]); }
  }
  nodes = document.querySelectorAll('[data-html-text]');
  for (i = 0; i < nodes.length; i++) {
    key = nodes[i].getAttribute('data-html-text');
    if (has(key)) { nodes[i].innerHTML = boldify(map[key]); hideIfEmpty(nodes[i], map[key]); }
  }
  nodes = document.querySelectorAll('[data-href-text]');
  for (i = 0; i < nodes.length; i++) {
    key = nodes[i].getAttribute('data-href-text');
    if (has(key) && map[key]) nodes[i].setAttribute('href', map[key]);
  }
  nodes = document.querySelectorAll('[data-title-text]');
  for (i = 0; i < nodes.length; i++) {
    key = nodes[i].getAttribute('data-title-text');
    if (has(key)) nodes[i].setAttribute('title', map[key]);
  }

  // Room name shown at the top of the screen when the game starts
  var room = document.getElementById('room-indicator');
  if (room) room.textContent = t('hud.room_format', '{floor} • {area}', { floor: t('floor.1', '1ST FLOOR'), area: t('area.hosmer_gallery', 'HOSMER GALLERY') });

  // "✓ RECOVERED" tag on the map checklist
  if (has('map.recovered_tag')) {
    var st = document.createElement('style');
    st.textContent = '.objective-list li.completed::after { content: ' + JSON.stringify(map['map.recovered_tag']) + ' !important; }';
    document.head.appendChild(st);
  }
})();
