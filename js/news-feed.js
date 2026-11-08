/*
 * The News page (feature/news-live-feed, 8 Nov 2026). Draws real stories from /news-feed.json, which
 * .github/workflows/news-feed.yml builds from the IGN, GameSpot, PC Gamer and Polygon feeds every four hours
 * (scripts/build_news.py). Every card is one article: its own headline, date, summary and picture, linking to that article.
 * Stories about the games on this site carry the game's name and can be picked with "Your games".
 * The page says how old the feed is, and says so plainly when there is nothing to show.
 */
(function () {
  'use strict';
  var grid = document.getElementById('newsGrid');
  var status = document.getElementById('newsStatus');
  var chips = document.querySelectorAll('.news-filter');
  if (!grid) return;

  var presets = window.GAME_PRESETS || {};
  var gameArt = {};
  Object.keys(presets).forEach(function (key) {
    var preset = presets[key];
    if (preset && preset.heroName && preset.image) gameArt[preset.heroName] = '/' + preset.image.replace(/^\/+/, '');
  });

  var items = [];
  var filter = 'all';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function safeUrl(url) { return /^https:\/\//.test(url || '') ? url : ''; }
  function ago(iso) {
    var minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return minutes <= 1 ? 'just now' : minutes + ' minutes ago';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : hours + ' hours ago';
    var days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }
  function dateLabel(iso) {
    var date = new Date(iso);
    var hours = (Date.now() - date.getTime()) / 3600000;
    if (hours < 48) return ago(iso);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* The story's own picture. If it has none, or it fails to load, the art of the game it is about; failing that, a
     plain panel with the publisher's name. Never another story's picture. */
  function picture(story, sourceName) {
    var box = el('div', 'news-card-img');
    var fallback = story.games && story.games.length ? gameArt[story.games[0]] : '';
    function panel() {
      box.classList.add('is-plain');
      box.textContent = '';
      box.appendChild(el('span', 'news-card-plain', sourceName));
      box.appendChild(el('div', 'news-card-source', sourceName));
    }
    function show(src, isFallback) {
      var img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = src;
      img.addEventListener('error', function () {
        if (!isFallback && fallback) { box.textContent = ''; show(fallback, true); } else panel();
      });
      box.textContent = '';
      box.appendChild(img);
      box.appendChild(el('div', 'news-card-source', sourceName));
    }
    var own = safeUrl(story.image);
    if (own) show(own, false);
    else if (fallback) show(fallback, true);
    else panel();
    return box;
  }

  function card(story, index, sources) {
    var sourceName = (sources[story.source] && sources[story.source].name) || story.source;
    var link = el('a', 'news-card' + (index === 0 ? ' is-lead' : ''));
    link.href = story.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.source = story.source;
    link.dataset.games = (story.games || []).join('|');
    link.appendChild(picture(story, sourceName));
    var body = el('div', 'news-card-body');
    var meta = el('div', 'news-card-meta');
    var time = el('time', 'news-card-date', dateLabel(story.published));
    time.dateTime = story.published;
    meta.appendChild(time);
    (story.games || []).forEach(function (game) { meta.appendChild(el('span', 'news-card-game', game)); });
    body.appendChild(meta);
    body.appendChild(el('h2', 'news-card-title', story.title));
    if (story.summary) body.appendChild(el('p', 'news-card-text', story.summary));
    body.appendChild(el('span', 'news-card-link', 'Read on ' + sourceName + ' ↗'));
    link.appendChild(body);
    return link;
  }

  function draw(data) {
    var sources = data.sources || {};
    var shown = items.filter(function (story) {
      if (filter === 'all') return true;
      if (filter === 'games') return story.games && story.games.length > 0;
      return story.source === filter;
    });
    grid.textContent = '';
    shown.forEach(function (story, index) { grid.appendChild(card(story, index, sources)); });
    if (!shown.length) {
      var empty = el('p', 'news-empty', filter === 'games'
        ? 'No news about the games we play in the last three weeks. Check back after the next update.'
        : 'No stories from this source right now.');
      grid.appendChild(empty);
    }
  }

  function wire(data) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        filter = chip.dataset.filter || 'all';
        chips.forEach(function (other) {
          other.classList.toggle('active', other === chip);
          other.setAttribute('aria-pressed', String(other === chip));
        });
        draw(data);
      });
    });
  }

  function say(text, kind) {
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind || '';
  }

  fetch('/news-feed.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' })
    .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
    .then(function (data) {
      items = (data.items || []).filter(function (story) { return safeUrl(story.url) && story.title && story.published; });
      grid.removeAttribute('aria-busy');
      if (!items.length || !data.fetchedAt) {
        grid.textContent = '';
        say('The news feed has not run yet. It updates every four hours from IGN, GameSpot, PC Gamer and Polygon.', 'warn');
        return;
      }
      var failed = Object.keys(data.sources || {}).filter(function (key) { return data.sources[key].status !== 'ok'; })
        .map(function (key) { return data.sources[key].name; });
      say('Updated ' + ago(data.fetchedAt) + '. Every story links to the full article on the site that wrote it.'
        + (failed.length ? ' ' + failed.join(' and ') + ' did not answer on the last update, so its stories are from the one before.' : ''));
      wire(data);
      draw(data);
    })
    .catch(function () {
      grid.removeAttribute('aria-busy');
      grid.textContent = '';
      say('The news did not load. Check your connection and refresh the page.', 'warn');
    });
})();
