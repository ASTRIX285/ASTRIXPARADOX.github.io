#!/usr/bin/env python3
"""
ASTRIX PARADOX — Auto Clips Builder
Fetches YouTube playlists via YouTube Data API v3
Rewrites pages/clips.html automatically
"""

import os, json, re, urllib.request, urllib.parse
from datetime import datetime

# ── CONFIG ──────────────────────────────────────────────────
API_KEY = os.environ.get('YOUTUBE_API_KEY', '')

PLAYLISTS = [
   # {'game': 'stream-clips',      'label': 'Stream Clips',      'id': 'PLYwP61l5jB7T4PdLZAenCjMrVrD-hhd_I'},
    {'game': 'crimson-desert',    'label': 'Crimson Desert',    'id': 'PLYwP61l5jB7RKcMiDhH34xc1JpZg3xrGi'},
    {'game': 'black-myth-wukong', 'label': 'Black Myth: Wukong', 'id': 'PLYwP61l5jB7RlDQMOa7ibloAxJMT4gbkV'},
    {'game': 'god-of-war',        'label': 'God of War',        'id': 'PLYwP61l5jB7RCG1LA_4ZZWqCMdtHhgP7l'},
    {'game': 'destiny',           'label': 'Destiny',           'id': 'PLYwP61l5jB7S2nt10JFHXRKblkEQ_kEy3'},
    # Add more as content grows:
    # {'game': 'warframe',        'label': 'Warframe',        'id': 'PLxxxxxxx'},
    # {'game': 'borderlands',     'label': 'Borderlands',     'id': 'PLxxxxxxx'},
    # {'game': 'destiny-2',       'label': 'Destiny 2',       'id': 'PLxxxxxxx'},
]

# ── TYPE DETECTION ───────────────────────────────────────────
# Order matters — first match wins
TYPE_RULES = [
    ('boss',      ['boss', 'boss kill', 'killed', 'defeated', 'slain', 'fight']),
    ('guide',     ['guide', 'how to', 'how-to', 'tutorial', 'tips', 'explained']),
    ('build',     ['build', 'setup', 'loadout', 'gear', 'equipment', 'spec', 'patch']),
    ('pve',       ['pve', 'dungeon', 'raid', 'camp', 'expansion', 'quest', 'mission', 'request']),
    ('puzzle',    ['puzzle', 'riddle', 'secret', 'hidden', 'mystery', 'cipher']),
    ('challenge', ['challenge', 'challenged', 'hardcore', 'no death', 'speedrun']),
    ('funny',     ['funny', 'fail', 'lol', 'oops', 'gone wrong', 'cursed', 'chaos']),
    ('missions',  ['story', 'adventure', 'campaign', 'chapter', 'episode', 'journey', 'narrative', 'cutscene', 'dialogue', 'lore']),
    ('highlight', []),  # catch-all default
]

BADGE_LABELS = {
    'boss':      'Boss',
    'guide':     'Guide',
    'build':     'Build',
    'pve':       'PvE',
    'puzzle':    'Puzzle',
    'challenge': 'Challenge',
    'funny':     'Funny',
    'missions':  'Missions',
    'highlight': 'Highlight',
}

def detect_type(title):
    # First: check for explicit |Tag| bracket in title — this always wins
    bracket = re.search(r'\|([^\|]+)\|', title)
    if bracket:
        tag = bracket.group(1).strip().lower()
        tag_map = {
            'boss':      'boss',
            'boss kill': 'boss',
            'guide':     'guide',
            'build':     'build',
            'pve':       'pve',
            'pvp':       'pvp',
            'puzzle':    'puzzle',
            'challenge': 'challenge',
            'funny':     'funny',
            'missions':  'missions',
            'highlight': 'highlight',
            'clip':      'highlight',
        }
        if tag in tag_map:
            return tag_map[tag]

    # Fallback: keyword detection from title
    title_lower = title.lower()
    for type_key, keywords in TYPE_RULES:
        if not keywords:  # catch-all
            return type_key
        if any(kw in title_lower for kw in keywords):
            return type_key
    return 'highlight'

def format_duration(iso):
    """Convert PT4M15S → 4:15"""
    m = re.search(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso or '')
    if not m:
        return '0:00'
    h, mn, s = (int(x or 0) for x in m.groups())
    if h:
        return f'{h}:{mn:02d}:{s:02d}'
    return f'{mn}:{s:02d}'

def format_date(iso):
    """Convert 2026-04-04T... → Apr 04, 2026"""
    try:
        dt = datetime.strptime(iso[:10], '%Y-%m-%d')
        return dt.strftime('%b %d, %Y')
    except:
        return iso[:10]

def api_get(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read())

def fetch_playlist(playlist_id):
    """Fetch all videos from a playlist."""
    videos, page_token = [], None
    while True:
        params = {
            'part': 'snippet',
            'playlistId': playlist_id,
            'maxResults': 50,
            'key': API_KEY,
        }
        if page_token:
            params['pageToken'] = page_token
        url = 'https://www.googleapis.com/youtube/v3/playlistItems?' + urllib.parse.urlencode(params)
        data = api_get(url)
        for item in data.get('items', []):
            sn = item['snippet']
            vid_id = sn['resourceId']['videoId']
            videos.append({
                'id':        vid_id,
                'title':     sn['title'],
                'published': sn['publishedAt'],
            })
        page_token = data.get('nextPageToken')
        if not page_token:
            break
    return videos

def fetch_durations(video_ids):
    """Fetch durations for a list of video IDs."""
    durations = {}
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i:i+50]
        params = {
            'part': 'contentDetails',
            'id':   ','.join(chunk),
            'key':  API_KEY,
        }
        url = 'https://www.googleapis.com/youtube/v3/videos?' + urllib.parse.urlencode(params)
        data = api_get(url)
        for item in data.get('items', []):
            durations[item['id']] = item['contentDetails']['duration']
    return durations

def build_card(video, game_key, game_label, delay_class=''):
    vid_id     = video['id']
    title      = video['title']
    date       = format_date(video['published'])
    duration   = video['duration']
    type_key   = detect_type(title)
    type_label = BADGE_LABELS.get(type_key, 'Highlight')
    thumb      = f'https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg'
    fallback   = f'../img/games/{game_key}.jpg'
    yt_url     = f'https://www.youtube.com/watch?v={vid_id}'
    ml = f'{game_label} — {title}'.replace("'", "\\'")
    ms = f'{game_label} · {type_label}'.replace("'", "\\'")

    return f'''
      <div class="clip-card reveal{delay_class}" data-game="{game_key}" data-type="{type_key}">
        <div class="clip-thumb" onclick="openClip('{vid_id}','{ml}','{ms}')">
          <img src="{thumb}" alt="{title}" onerror="this.src='{fallback}'">
          <div class="clip-thumb-overlay">
            <div class="clip-play-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
          </div>
          <div class="clip-game-badge">{game_label}</div>
          <div class="clip-type-badge">{type_label}</div>
          <div class="clip-duration">{duration}</div>
        </div>
        <div class="clip-body">
          <div class="clip-title">{title}</div>
          <div class="clip-meta">
            <span class="clip-date">{date}</span>
            <div class="clip-links">
              <a href="{yt_url}" target="_blank" class="clip-link">YouTube &#8599;</a>
            </div>
          </div>
        </div>
      </div>'''

def build_game_buttons():
    btns = ['<button class="filter-btn game-btn active" data-game="all" onclick="filterClips(this,\'game\')">All</button>']
    for pl in PLAYLISTS:
        btns.append(f'<button class="filter-btn game-btn" data-game="{pl["game"]}" onclick="filterClips(this,\'game\')">{pl["label"]}</button>')
    return '\n        '.join(btns)

def build_sections_html(sections):
    html = []
    for sec in sections:
        game  = sec['game']
        label = sec['label']
        section_cards = '\n'.join(sec['cards'])
        html.append(f'''
      <div class="game-section" data-section="{game}">
        <div class="game-section-header">
          <div class="game-section-line"></div>
          <span class="game-section-label">{label}</span>
          <div class="game-section-line"></div>
        </div>
        <div class="clips-grid">
{section_cards}
        </div>
      </div>''')
    return '\n'.join(html)

def build_html(sections, total):
    game_buttons = build_game_buttons()
    cards_html   = build_sections_html(sections)

    return '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clips &amp; Highlights | ASTRIX PARADOX</title>
  <link rel="stylesheet" href="https://use.typekit.net/tnp6kbq.css">
  <link rel="stylesheet" href="/css/astrix-site-typography.css?v=20260903-bahnschrift-1">
  <link rel="stylesheet" href="/css/astrix-palette.css?v=20260917-approved-1">
  <link rel="stylesheet" href="../css/style.css?v=20260917-approved-palette-1">

  <!-- Favicons -->
  <link rel="icon" type="image/png" sizes="32x32" href="../img/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../img/favicon/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="../img/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="../img/favicon/android-chrome-192x192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="../img/favicon/android-chrome-512x512.png">
  <link rel="manifest" href="../site.webmanifest">
  <link rel="icon" href="../img/favicon/favicon.ico">

  <style>
    /* Keep this page and the automated builder in sync: readable text uses the shared palette. */
    .clips-hero .section-title .accent{color:var(--white)}
    .footer-copy{color:var(--grey)}
    .clips-hero{padding:calc(var(--nav-height) + 60px) 40px 60px;background:var(--dark-2);border-bottom:1px solid rgba(139,0,0,0.2);position:relative;overflow:hidden}
    .clips-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 80% 50%,rgba(139,0,0,0.15) 0%,transparent 60%)}
    .filter-wrap{background:var(--dark-2);border-bottom:1px solid rgba(139,0,0,0.25);padding:0 40px}
    .filter-inner{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:0}
    .filter-row{display:flex;align-items:center;gap:0;min-height:52px;border-bottom:1px solid rgba(139,0,0,0.1)}
    .filter-row:last-child{border-bottom:none}
    .filter-label{font-family:'bahnschrift-semicondensed',monospace;font-size:8px;letter-spacing:4px;color:var(--grey);text-transform:uppercase;min-width:60px;padding-right:16px;border-right:1px solid rgba(139,0,0,0.2);margin-right:4px;flex-shrink:0}
    .filter-pills{display:flex;flex-wrap:wrap;gap:2px;padding:8px 0 8px 8px}
    .filter-btn{font-family:'bahnschrift-semicondensed',monospace;font-size:9px;letter-spacing:2px;padding:7px 18px;border:1px solid transparent;color:var(--grey);cursor:pointer;text-transform:uppercase;transition:all 0.2s;background:transparent;white-space:nowrap}
    .filter-btn:hover{color:var(--white);border-color:rgba(139,0,0,0.5);background:rgba(139,0,0,0.06)}
    .filter-btn.game-btn.active{color:var(--white);background:rgba(139,0,0,0.2);border-color:var(--crimson-mid)}
    .filter-btn.type-btn.active{color:var(--dark);background:var(--gold);border-color:var(--gold)}
    .game-section{margin-bottom:48px}
    .game-section.hidden{display:none}
    .game-section-header{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-top:8px}
    .game-section-label{font-family:'bahnschrift-semicondensed',monospace;font-size:10px;letter-spacing:5px;color:var(--gold);text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .game-section-line{flex:1;height:1px;background:linear-gradient(to right,rgba(201,168,76,0.4),transparent)}
    .game-section-header .game-section-line:first-child{background:linear-gradient(to left,rgba(201,168,76,0.4),transparent)}
    #clipsGrid{display:block}
    .game-section{margin-bottom:60px}
    .clips-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:2px}
    .clip-card{background:var(--dark-2);border:1px solid rgba(139,0,0,0.15);overflow:hidden;transition:border-color 0.3s;position:relative}
    .clip-card:hover{border-color:rgba(139,0,0,0.4)}
    .clip-card.hidden{display:none}
    .clip-thumb{aspect-ratio:16/9;position:relative;background:#000;cursor:pointer;overflow:hidden}
    .clip-thumb img{width:100%;height:100%;object-fit:cover;transition:transform 0.4s}
    .clip-card:hover .clip-thumb img{transform:scale(1.04)}
    .clip-thumb-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 50%);display:flex;align-items:center;justify-content:center}
    .clip-play-btn{width:56px;height:56px;border-radius:50%;background:rgba(139,0,0,0.9);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.2s}
    .clip-card:hover .clip-play-btn{transform:scale(1.12);background:var(--crimson-mid)}
    .clip-play-btn svg{margin-left:4px}
    .clip-game-badge{position:absolute;top:10px;left:10px;font-family:"bahnschrift-semicondensed",monospace;font-size:8px;letter-spacing:2px;color:var(--white);background:var(--crimson);padding:3px 10px;text-transform:uppercase}
    .clip-type-badge{position:absolute;top:10px;right:10px;font-family:"bahnschrift-semicondensed",monospace;font-size:8px;letter-spacing:2px;color:var(--dark);background:var(--gold);padding:3px 10px;text-transform:uppercase}
    .clip-duration{position:absolute;bottom:10px;right:10px;font-family:"bahnschrift-semicondensed",monospace;font-size:9px;color:var(--white);background:rgba(0,0,0,0.8);padding:2px 8px;letter-spacing:1px}
    .clip-body{padding:16px 20px}
    .clip-title{font-family:"bahnschrift-semicondensed",monospace;font-size:12px;font-weight:600;color:var(--white);line-height:1.4;margin-bottom:8px;letter-spacing:0.5px}
    .clip-meta{display:flex;justify-content:space-between;align-items:center}
    .clip-date{font-size:11px;color:var(--grey);letter-spacing:1px}
    .clip-links{display:flex;gap:10px}
    .clip-link{font-family:"bahnschrift-semicondensed",monospace;font-size:8px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;text-decoration:none;transition:color 0.2s}
    .clip-link:hover{color:var(--gold-light)}
    .clip-modal{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);align-items:center;justify-content:center}
    .clip-modal.open{display:flex}
    .clip-modal-inner{position:relative;width:92vw;max-width:1100px}
    .clip-modal-close{position:absolute;top:-44px;right:0;font-family:"bahnschrift-semicondensed",monospace;font-size:10px;letter-spacing:2px;color:var(--grey);background:none;border:none;cursor:pointer;text-transform:uppercase}
    .clip-modal-close:hover{color:var(--white)}
    .clip-modal-frame{position:relative;padding-top:56.25%;background:#000}
    .clip-modal-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:none}
    .clip-modal-label{font-family:"bahnschrift-semicondensed",monospace;font-size:10px;letter-spacing:2px;color:var(--grey);text-align:center;margin-top:16px;text-transform:uppercase}
    .clip-modal-source{font-family:"bahnschrift-semicondensed",monospace;font-size:8px;letter-spacing:2px;color:var(--gold);text-align:center;margin-top:6px}
    .clips-stats{display:flex;gap:24px;align-items:center;padding:12px 0;font-family:"bahnschrift-semicondensed",monospace;font-size:9px;letter-spacing:2px;color:var(--grey);border-bottom:1px solid rgba(139,0,0,0.1);margin-bottom:24px;flex-wrap:wrap}
    .clips-stats span{color:var(--white)}
    @media(max-width:768px){.clips-hero{padding:calc(var(--nav-height) + 40px) 20px 40px}.clips-grid{grid-template-columns:1fr}.filter-wrap{padding:0 20px}.filter-label{min-width:48px;font-size:7px;letter-spacing:2px}.filter-btn{font-size:8px;padding:6px 12px}}
  </style>
</head>
<body>
<nav class="nav">
  <a class="nav-logo" href="../index.html" aria-label="ASTRIX PARADOX home">
    <img src="../img/logo.png" alt="ASTRIX PARADOX">
    <span>ASTRIX<span class="accent">285</span></span>
  </a>
  <button class="nav-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="site-navigation"><span></span><span></span><span></span></button>
  <div class="nav-links" id="site-navigation">
    <a href="../index.html">Home</a>
    <a href="reviews.html">Reviews</a>
    <a href="news.html">News</a>
    <a href="clips.html" class="active">Clips</a>
    <a href="games.html">Universes</a>
    <a href="../tools/">Tools</a>
    <a href="join.html">Join Us</a>
  </div>
  <div class="nav-live">
    <div class="nav-live-dot" id="navDot"></div>
    <span class="nav-live-text" id="navText">OFFLINE</span>
  </div>
</nav>

<div class="clips-hero">
  <div style="max-width:1100px;margin:0 auto;position:relative;z-index:1;">
    <div class="section-eyebrow" style="animation:fadeUp 0.8s ease 0.2s both;">AUTO-GENERATED HIGHLIGHTS</div>
    <h1 class="section-title" style="animation:fadeUp 0.8s ease 0.4s both;">Clips &amp; <span class="accent">Highlights</span></h1>
    <p style="color:var(--grey);max-width:500px;margin-top:16px;animation:fadeUp 0.8s ease 0.6s both;">The best moments from every stream — captured live and published straight here.</p>
    <div style="display:flex;gap:16px;margin-top:24px;animation:fadeUp 0.8s ease 0.8s both;flex-wrap:wrap;">
      <a href="https://www.youtube.com/@ASTRIXPARADOX" target="_blank" class="btn-primary" style="font-size:10px;padding:10px 24px;">&#9654; &nbsp; YouTube Channel &#8599;</a>
    </div>
  </div>
</div>

<div class="gold-line"></div>

<div class="filter-wrap">
  <div class="filter-inner">
    <div class="filter-row">
      <span class="filter-label">Game</span>
      <div class="filter-pills">
        __GAME_BUTTONS__
      </div>
    </div>
    <div class="filter-row">
      <span class="filter-label">Type</span>
      <div class="filter-pills">
        <button class="filter-btn type-btn active" data-type="all" onclick="filterClips(this,'type')">All</button>
        <button class="filter-btn type-btn" data-type="highlight" onclick="filterClips(this,'type')">Highlight</button>
        <button class="filter-btn type-btn" data-type="boss" onclick="filterClips(this,'type')">Boss</button>
        <button class="filter-btn type-btn" data-type="guide" onclick="filterClips(this,'type')">Guide</button>
        <button class="filter-btn type-btn" data-type="build" onclick="filterClips(this,'type')">Build</button>
        <button class="filter-btn type-btn" data-type="pve" onclick="filterClips(this,'type')">PvE</button>
        <button class="filter-btn type-btn" data-type="puzzle" onclick="filterClips(this,'type')">Puzzle</button>
        <button class="filter-btn type-btn" data-type="challenge" onclick="filterClips(this,'type')">Challenge</button>
        <button class="filter-btn type-btn" data-type="missions" onclick="filterClips(this,'type')">Missions</button>
        <button class="filter-btn type-btn" data-type="funny" onclick="filterClips(this,'type')">Funny</button>
      </div>
    </div>
  </div>
</div>

<section class="section" style="background:var(--dark);padding-top:32px;">
  <div style="max-width:1100px;margin:0 auto;">
    <div class="clips-stats">
      SHOWING <span id="clipCount">__TOTAL__</span> CLIPS
      &nbsp;&middot;&nbsp; <a href="https://www.youtube.com/@ASTRIXPARADOX" target="_blank" style="color:var(--gold);font-family:'bahnschrift-semicondensed',monospace;font-size:9px;letter-spacing:2px;">SUBSCRIBE ON YOUTUBE &#8599;</a>
    </div>
    <div id="clipsGrid">
__CARDS_HTML__
    </div>
  </div>
</section>

<footer class="footer">
  <div class="footer-social">
    <a href="https://x.com/ASTRIX285" target="_blank">X / Twitter</a>
    <a href="https://discord.com/invite/6dcyrbpdzN" target="_blank">Discord</a>
    <a href="https://www.twitch.tv/astrix285x" target="_blank">Twitch</a>
    <a href="https://www.facebook.com/xASTRIX285x" target="_blank">Facebook</a>
    <a href="https://www.youtube.com/c/ASTRIX285Gaming" target="_blank">YouTube</a>
  </div>
  <div class="gold-line" style="margin-bottom:20px;"></div>
  <div class="footer-copy">&copy; 2025 ASTRIX PARADOX &mdash; Built for the community, powered by gaming passion and history.</div>
  <p class="apx-bungie-attribution">Destiny 2 content and materials are trademarks and copyrights of Bungie, Inc. ASTRIX PARADOX is not affiliated with or endorsed by Bungie.</p>
</footer>

<div class="clip-modal" id="clipModal">
  <div class="clip-modal-inner">
    <button class="clip-modal-close" onclick="closeClip()">&#10005; Close</button>
    <div class="clip-modal-frame">
      <iframe id="clipFrame" allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>
    <div class="clip-modal-label" id="clipLabel"></div>
    <div class="clip-modal-source" id="clipSource"></div>
  </div>
</div>

<script src="../js/main.js?v=20260913-mobile-nav-1"></script>
<script>
  var activeGame='all', activeType='all';
  function filterClips(btn, dim) {
    var selector = dim === 'game' ? '.game-btn' : '.type-btn';
    document.querySelectorAll(selector).forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    if (dim === 'game') activeGame = btn.dataset.game;
    if (dim === 'type') activeType = btn.dataset.type;
    var count = 0;
    document.querySelectorAll('.game-section').forEach(function(sec) {
      var gameMatch = activeGame === 'all' || sec.dataset.section === activeGame;
      sec.classList.toggle('hidden', !gameMatch);
    });
    document.querySelectorAll('.clip-card').forEach(function(card) {
      var gameMatch = activeGame === 'all' || card.dataset.game === activeGame;
      var typeMatch = activeType === 'all' || card.dataset.type === activeType;
      card.classList.toggle('hidden', !gameMatch || !typeMatch);
      if (gameMatch && typeMatch) count++;
    });
    document.querySelectorAll('.game-section').forEach(function(sec) {
      if (activeGame !== 'all') return;
      var visible = sec.querySelectorAll('.clip-card:not(.hidden)').length;
      sec.classList.toggle('hidden', visible === 0);
    });
    document.getElementById('clipCount').textContent = count;
  }
  function openClip(id, label, source) {
    document.getElementById('clipFrame').src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
    document.getElementById('clipLabel').textContent = label;
    document.getElementById('clipSource').textContent = source;
    document.getElementById('clipModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeClip() {
    document.getElementById('clipFrame').src = '';
    document.getElementById('clipModal').classList.remove('open');
    document.body.style.overflow = '';
  }
  document.getElementById('clipModal').addEventListener('click', function(e){ if(e.target===this) closeClip(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeClip(); });
</script>
</body>
</html>'''.replace('__GAME_BUTTONS__', game_buttons).replace('__TOTAL__', str(total)).replace('__CARDS_HTML__', cards_html)

def main():
    print('Fetching playlists...')
    sections = []
    total = 0
    delays = ['', ' reveal-delay-1', ' reveal-delay-2']

    for pl in PLAYLISTS:
        print(f'  → {pl["label"]}')
        videos = fetch_playlist(pl['id'])
        if not videos:
            continue
        video_ids = [v['id'] for v in videos]
        durations = fetch_durations(video_ids)
        for v in videos:
            v['duration'] = format_duration(durations.get(v['id'], ''))
        videos.sort(key=lambda v: v['published'], reverse=True)
        cards = []
        for i, v in enumerate(videos):
            card = build_card(v, pl['game'], pl['label'], delays[i % 3])
            cards.append(card)
            total += 1
        sections.append({'game': pl['game'], 'label': pl['label'], 'cards': cards})

    html = build_html(sections, total)
    out = os.path.join(os.path.dirname(__file__), '..', 'pages', 'clips.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Done — {total} clips written to clips.html')

if __name__ == '__main__':
    main()
