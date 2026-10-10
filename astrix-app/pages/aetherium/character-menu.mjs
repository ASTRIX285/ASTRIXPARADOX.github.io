/**
 * Character menu (The Aetherium, hub/aetherium/gear/): one Daeva's name and numbers, then three cards in the
 * same style as the Ascent Plan menu. Gear, Skills and Daevanion each open their own page for this Daeva.
 * First paint needs only /aion2/character; the small game-wide facts file is read only to name a board that is not open yet.
 */
import { ascentUrl, daevanionPageUrl, gearPageUrl, loadProgression, prefetchDaevanionAdvice, regionName, skillsUrl } from './aetherium-data.mjs';
import { $, esc, isPending, number } from './aetherium-ui.mjs';
import { failPage, startCharacterPage } from './character-page.mjs';
import { nodeArt } from './daevanion-board.mjs';

const GLYPH = {
  gear: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5l15 6v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 15v18M17 22h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  skills: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38L30 18M30 18l4-10 6 6-10 4M14 30l4 4M8 40l4-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  daevanion: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h8v8H8zM20 8h8v8h-8zM32 8h8v8h-8zM20 20h8v8h-8zM8 32h8v8H8zM20 32h8v8h-8zM32 32h8v8h-8zM12 16v16M36 16v16M16 24h4M28 24h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>'
};

function renderHeader(model) {
  const p = model.profile;
  $('#aeHeader').innerHTML = `
    <div>
      <h1 class="ae-name">${esc(p.name)}</h1>
      <p class="ae-subline">${[p.title, `${p.class} Lv ${p.level}`, p.raceName, p.server.name, regionName(model.source.region)].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="ae-figures"><span>Combat power <b>${number(p.combatPower)}</b></span><span>Item level <b>${isPending(p.itemLevel) ? '-' : number(p.itemLevel)}</b></span></p>
    </div>
    <a class="btn" href="/hub/aetherium/">Back to Daeva Card</a>`;
}

const art = (src, glyph) => (src
  ? `<img src="${esc(src)}" alt="" width="84" height="84" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : GLYPH[glyph]);

/* The badge says what it counts in words ("17 worn", "22 skills", "3 boards"), never a bare number. */
function card({ view, href, name, status, blurb, count, noun, image }) {
  return `<a class="ae-menu-card" href="${esc(href)}" data-view="${view}">
      <span class="ae-menu-art" data-fallback="${view}">${art(image, view)}</span>
      <span class="ae-menu-name">${esc(name)}</span>
      <span class="ae-menu-status">${esc(status)}</span>
      <span class="ae-menu-blurb">${esc(blurb)}</span>
      ${count ? `<span class="ae-menu-badge is-words">${count} ${esc(noun)}</span>` : ''}
    </a>`;
}

/** The three cards for one Daeva, counted from the character call alone. */
function renderCards(model, ref, progression) {
  const worn = model.gear.filter(slot => !slot.empty);
  const learned = model.skills.filter(skill => skill.category !== 'Dp' && skill.acquired);
  const stigmas = model.skills.filter(skill => skill.category === 'Dp');
  const open = model.daevanion.filter(board => board.open);
  const first = open[0] ?? null;
  const unopened = progression?.records?.find(record => record.id === 'daevanion-boards')?.value?.[0] ?? null;
  const boardLine = first
    ? `${first.name}: ${first.nodesTaken} / ${first.nodesTotal} nodes`
    : unopened ? `${unopened.name} opens at Lv ${unopened.unlockLevel}` : 'No board open yet';
  $('#aeCards').innerHTML = [
    card({
      view: 'gear', href: gearPageUrl(ref), name: 'Gear', status: `${worn.length} of ${model.gear.length} worn`,
      blurb: 'Worn items, stats, pet and wings', count: worn.length, noun: 'worn', image: worn[0]?.icon ?? null
    }),
    card({
      view: 'skills', href: skillsUrl(ref, model.profile.class), name: 'Skills',
      status: `${learned.length} ${learned.length === 1 ? 'skill' : 'skills'} · ${stigmas.filter(skill => skill.acquired).length} of ${stigmas.length} stigmas`,
      blurb: 'Mastery and Stigma', count: learned.length, noun: learned.length === 1 ? 'skill' : 'skills', image: learned.find(skill => skill.category === 'Active')?.icon ?? null
    }),
    card({
      view: 'daevanion', href: daevanionPageUrl(ref, model.profile.class, first?.id ?? null), name: 'Daevanion', status: boardLine,
      blurb: 'Boards and nodes', count: open.length, noun: open.length === 1 ? 'board' : 'boards', image: nodeArt('unique', true, model.profile.class)
    })
  ].join('');
}

// A game icon that fails to load drops away and leaves our own glyph.
document.addEventListener('error', event => {
  const img = event.target;
  const holder = img instanceof HTMLImageElement ? img.closest('.ae-menu-art') : null;
  if (holder && GLYPH[holder.dataset.fallback]) holder.innerHTML = GLYPH[holder.dataset.fallback];
}, true);

startCharacterPage({
  prefetch: className => prefetchDaevanionAdvice(className),
  async render({ model, ref }) {
    renderHeader(model);
    const progression = await loadProgression().catch(() => null);
    renderCards(model, ref, progression);
  },
  next: ({ model, ref }) => ({ label: 'Next: Your next moves', href: ascentUrl(ref, model.profile.class), note: 'Step 3 of 3: what to fix and what to do, in order' })
}).catch(error => failPage('character menu', error));
