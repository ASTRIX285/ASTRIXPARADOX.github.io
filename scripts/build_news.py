#!/usr/bin/env python3
"""Builds news-feed.json for pages/news.html from the publishers' own RSS feeds (feature/news-live-feed, 8 Nov 2026).

Every story is a real article: its title, link, date, summary and picture come from the publisher's feed, and the card
links to that article. Nothing is typed in by hand. Stories about the games ASTRIX PARADOX features (the heroName list in
js/game-presets.js) are tagged with the game, so the page can show "Your games".

Run by .github/workflows/news-feed.yml every four hours. Standard library only.
  python3 scripts/build_news.py                      fetch the feeds and write news-feed.json
  python3 scripts/build_news.py --from-files a.xml   build from saved feed files instead (tests); the file name's first
                                                     word picks the source (ign-sample.xml is IGN)
"""
import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'news-feed.json'
PRESETS = ROOT / 'js' / 'game-presets.js'

SOURCES = {
    'ign': {'name': 'IGN', 'url': 'https://feeds.feedburner.com/ign/games-all'},
    'gamespot': {'name': 'GameSpot', 'url': 'https://www.gamespot.com/feeds/game-news'},
    'pcgamer': {'name': 'PC Gamer', 'url': 'https://www.pcgamer.com/rss/'},
    'polygon': {'name': 'Polygon', 'url': 'https://www.polygon.com/rss/index.xml'},
}
MAX_ITEMS = 48          # stories kept on the page
PER_SOURCE = 18         # newest stories taken from each feed
MAX_AGE_DAYS = 21       # older stories drop off
SUMMARY_CHARS = 220
UA = 'ASTRIX-PARADOX-News/1.0 (+https://astrixparadox.com/pages/news.html)'

NS = {
    'media': 'http://search.yahoo.com/mrss/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'atom': 'http://www.w3.org/2005/Atom',
    'dc': 'http://purl.org/dc/elements/1.1/',
}


def featured_games():
    """[(name, [patterns])] from the heroName lines in js/game-presets.js, so the tags follow the site's own list."""
    text = PRESETS.read_text(encoding='utf-8')
    names = re.findall(r'heroName:\s*"([^"]+)"', text)
    games = []
    for name in names:
        keys = {name}
        if ':' in name:                        # "Black Myth: Wukong" also matches "Wukong"
            keys.add(name.split(':', 1)[1].strip())
        if name.lower().startswith('the '):    # "The Division 2" also matches "Division 2"
            keys.add(name[4:])
        patterns = [re.compile(r'(?<![\w])' + re.escape(key).replace(r'\ ', r'\s+') + r'(?![\w])', re.I) for key in keys]
        games.append((name, patterns))
    return games


def clean_text(raw, limit=None):
    text = re.sub(r'</?(?:b|i|em|strong|a|span|u|small|sup|sub)\b[^>]*>', '', raw or '', flags=re.I)  # inline tags: no gap
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)
    if limit and len(text) > limit:
        cut = text[:limit].rsplit(' ', 1)[0].rstrip(',;:.')
        text = cut + '...'
    return text


def canonical(url):
    """The article URL without tracking parameters, so the same story is kept once."""
    parts = urlsplit((url or '').strip())
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        return ''
    query = [(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith(('utm_', 'ref', 'cmpid', 'icid'))]
    return urlunsplit(('https', parts.netloc.lower(), parts.path, urlencode(query), ''))


def https_image(url):
    url = html.unescape((url or '').strip())
    if url.startswith('//'):
        url = 'https:' + url
    if url.startswith('http://'):
        url = 'https://' + url[7:]
    return url if url.startswith('https://') else ''


def first_image(item):
    """The story's picture: media:content or media:thumbnail, an image enclosure, or the first <img> in its text."""
    best = None
    for tag in ('media:content', 'media:group/media:content'):
        for node in item.findall(tag, NS):
            medium = (node.get('medium') or '').lower()
            kind = (node.get('type') or '').lower()
            if medium in ('', 'image') and (not kind or kind.startswith('image')):
                width = int(node.get('width') or 0)
                if best is None or width > best[0]:
                    best = (width, node.get('url'))
    if best and https_image(best[1]):
        return https_image(best[1])
    for node in item.findall('media:thumbnail', NS):
        if https_image(node.get('url')):
            return https_image(node.get('url'))
    for node in item.findall('enclosure'):
        if (node.get('type') or '').startswith('image') and https_image(node.get('url')):
            return https_image(node.get('url'))
    for tag in ('content:encoded', 'description', 'atom:content', 'atom:summary'):
        node = item.find(tag, NS)
        if node is not None and node.text:
            match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', node.text, re.I)
            if match and https_image(match.group(1)):
                return https_image(match.group(1))
    return ''


def parse_date(raw):
    raw = (raw or '').strip()
    if not raw:
        return None
    try:
        value = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        try:
            value = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_feed(source, xml_bytes):
    """Stories from one RSS 2.0 or Atom feed."""
    root = ET.fromstring(xml_bytes)
    items = root.findall('./channel/item') or root.findall('atom:entry', NS)
    out = []
    for item in items:
        def text(*tags):
            for tag in tags:
                node = item.find(tag, NS)
                if node is not None and (node.text or '').strip():
                    return node.text
            return ''
        link = text('link')
        if not link:
            for node in item.findall('atom:link', NS):
                if node.get('rel', 'alternate') == 'alternate' and node.get('href'):
                    link = node.get('href')
                    break
        url = canonical(link)
        title = clean_text(text('title', 'atom:title'))
        if not url or not title:
            continue
        published = parse_date(text('pubDate', 'dc:date', 'atom:published', 'atom:updated'))
        if not published:
            continue
        out.append({
            'source': source,
            'title': title,
            'url': url,
            'published': published.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'summary': clean_text(text('description', 'atom:summary', 'content:encoded'), SUMMARY_CHARS),
            'image': first_image(item),
        })
    out.sort(key=lambda story: story['published'], reverse=True)
    return out[:PER_SOURCE]


def title_key(title):
    return re.sub(r'[^a-z0-9]+', ' ', title.lower()).strip()


def build(stories_by_source, previous, now):
    games = featured_games()
    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    merged = []
    for source in SOURCES:
        fresh = stories_by_source.get(source)
        # A feed that failed this time keeps its stories from the last good run, so a source never just vanishes.
        merged += fresh if fresh is not None else [s for s in previous.get('items', []) if s.get('source') == source]
    seen_urls, seen_titles, kept = set(), set(), []
    for story in sorted(merged, key=lambda s: s['published'], reverse=True):
        if parse_date(story['published']) < cutoff:
            continue
        key = title_key(story['title'])
        if story['url'] in seen_urls or key in seen_titles:
            continue
        seen_urls.add(story['url'])
        seen_titles.add(key)
        haystack = story['title'] + ' ' + story.get('summary', '')
        story = dict(story)
        story['games'] = [name for name, patterns in games if any(p.search(haystack) for p in patterns)]
        kept.append(story)
    return kept[:MAX_ITEMS]


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-files', nargs='*')
    parser.add_argument('--out', default=str(OUT))
    parser.add_argument('--now')
    args = parser.parse_args()
    now = parse_date(args.now) if args.now else datetime.now(timezone.utc)
    out = Path(args.out)
    previous = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}

    stories, status = {}, {}
    if args.from_files is not None:
        for name in args.from_files:
            source = Path(name).name.split('-')[0].split('.')[0]
            stories[source] = parse_feed(source, Path(name).read_bytes())
            status[source] = 'ok'
    else:
        for source, info in SOURCES.items():
            try:
                stories[source] = parse_feed(source, fetch(info['url']))
                status[source] = 'ok'
                print(f'{info["name"]}: {len(stories[source])} stories')
            except Exception as error:  # one bad feed never stops the others
                status[source] = 'failed'
                print(f'{info["name"]}: failed ({error})', file=sys.stderr)

    if not any(value == 'ok' for value in status.values()):
        print('Every feed failed: keeping the last news-feed.json.', file=sys.stderr)
        return 0

    items = build(stories, previous, now)
    result = {
        'fetchedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'sources': {key: {'name': info['name'], 'status': status.get(key, 'failed')} for key, info in SOURCES.items()},
        'items': items,
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Wrote {len(items)} stories, {sum(1 for s in items if s["games"])} about featured games.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
