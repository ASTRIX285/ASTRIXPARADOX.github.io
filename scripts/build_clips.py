#!/usr/bin/env python3
"""
ASTRIX PARADOX — Auto Clips Builder
Fetches YouTube playlists via YouTube Data API v3
Rewrites only the clips block in pages/clips.html (between its markers)
"""

import os, sys, json, re, urllib.request, urllib.parse
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

# ── PAGE BLOCKS ──────────────────────────────────────────────
# pages/clips.html is the source of truth for layout and styling.
# This script only replaces the text between these markers.
CARDS_START = '<!-- CLIPS:START -->'
CARDS_END   = '<!-- CLIPS:END -->'
COUNT_START = '<!-- CLIPS-COUNT:START -->'
COUNT_END   = '<!-- CLIPS-COUNT:END -->'
PAGE = os.path.join(os.path.dirname(__file__), '..', 'pages', 'clips.html')

def fail(message):
    print(f'ERROR: {message}', file=sys.stderr)
    sys.exit(1)

def block(text, start, end):
    """Return (before, inside, after) for one marker pair, or stop."""
    if text.count(start) != 1 or text.count(end) != 1:
        fail(f'{start} and {end} must each appear once in clips.html. Nothing was written.')
    head, rest = text.split(start, 1)
    inside, tail = rest.split(end, 1)
    if end in head:
        fail(f'{end} comes before {start} in clips.html. Nothing was written.')
    return head, inside, tail

def replace_block(text, start, end, content):
    head, _, tail = block(text, start, end)
    return head + start + content + end + tail

def existing_sections(text):
    """Read the cards already between the markers, so the block can be rebuilt
    without the YouTube API. The clip data stays as it is."""
    _, inside, _ = block(text, CARDS_START, CARDS_END)
    labels = {pl['game']: pl['label'] for pl in PLAYLISTS}
    section_mark = '\n      <div class="game-section" data-section="'
    card_mark = '\n      <div class="clip-card'
    card_close = '\n      </div>'
    # A card ends with its own closing tag; the grid and section close right after the last one.
    grid_end = card_close + '\n        </div>\n      </div>'
    sections = []
    for chunk in inside.split(section_mark)[1:]:
        game = chunk.split('"', 1)[0]
        label_html = chunk.split('<span class="game-section-label">', 1)[1].split('</span>', 1)[0]
        grid = chunk.split('<div class="clips-grid">\n', 1)[1]
        cards = []
        for piece in grid.split(card_mark)[1:]:
            # Drop the newline build_sections_html puts between cards, so reruns stay identical.
            card = card_mark + piece.rstrip('\n')
            end = card.find(grid_end)
            if end >= 0:
                card = card[:end + len(card_close)]
            cards.append(card)
        sections.append({'game': game, 'label': labels.get(game, label_html), 'cards': cards})
    return sections

def write_blocks(page, sections):
    with open(page, encoding='utf-8', newline='') as f:
        text = f.read()
    total = sum(len(sec['cards']) for sec in sections)
    # Check both marker pairs before changing anything.
    block(text, CARDS_START, CARDS_END)
    block(text, COUNT_START, COUNT_END)
    text = replace_block(text, CARDS_START, CARDS_END, build_sections_html(sections) + '\n    ')
    text = replace_block(text, COUNT_START, COUNT_END, str(total))
    with open(page, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    return total

def fetch_sections():
    print('Fetching playlists...')
    sections = []
    delays = ['', ' reveal-delay-1', ' reveal-delay-2']
    for pl in PLAYLISTS:
        print(f'  > {pl["label"]}')
        videos = fetch_playlist(pl['id'])
        if not videos:
            continue
        video_ids = [v['id'] for v in videos]
        durations = fetch_durations(video_ids)
        for v in videos:
            v['duration'] = format_duration(durations.get(v['id'], ''))
        videos.sort(key=lambda v: v['published'], reverse=True)
        cards = [build_card(v, pl['game'], pl['label'], delays[i % 3]) for i, v in enumerate(videos)]
        sections.append({'game': pl['game'], 'label': pl['label'], 'cards': cards})
    return sections

def main():
    page = PAGE
    if '--page' in sys.argv:
        page = sys.argv[sys.argv.index('--page') + 1]
    if '--reuse-cards' in sys.argv:
        # Rebuild the cards block from the clips already on the page.
        with open(page, encoding='utf-8', newline='') as f:
            sections = existing_sections(f.read())
    else:
        if not API_KEY:
            fail('YOUTUBE_API_KEY is not set. Nothing was written.')
        sections = fetch_sections()
    if not any(sec['cards'] for sec in sections):
        fail('No clips found. Nothing was written.')
    total = write_blocks(page, sections)
    print(f'Done: {total} clips written to the clips block')

if __name__ == '__main__':
    main()
