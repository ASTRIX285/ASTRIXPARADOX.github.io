// Per-game footer rules. Each game folder supplies its footer lines in
// astrix-app/games/<game>/footer.json:
//   { "default": true, "lines": [...] }          claims every page no other game claims (Destiny)
//   { "pagePrefixes": ["hub/workbench/"], ... }  claims pages by repo path (Division)
// A page carries every line of its own game's footer, word for word, and no line of another game's.
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

export function loadFooterRules(root){
  const games=join(root,'astrix-app','games');
  return readdirSync(games).filter(game=>existsSync(join(games,game,'footer.json'))).sort()
    .map(game=>({game,...JSON.parse(readFileSync(join(games,game,'footer.json'),'utf8'))}));
}

export function footerRuleFor(path,rules){
  const claims=rules.flatMap(rule=>(rule.pagePrefixes??[]).filter(prefix=>path.startsWith(prefix)).map(prefix=>({rule,length:prefix.length})));
  claims.sort((a,b)=>b.length-a.length);
  return claims[0]?.rule??rules.find(rule=>rule.default)??null;
}

const decode=text=>text.replace(/&#39;|&apos;|&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&');

export function footerErrors(path,html,rules){
  const footers=[...html.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].map(match=>decode(match[1]));
  if(!footers.length)return [`${path}: footer missing`];
  const rule=footerRuleFor(path,rules);
  if(!rule)return [`${path}: no game footer rule covers this page`];
  const text=footers.join('\n');
  const errors=[];
  for(const line of rule.lines)if(!text.includes(line))errors.push(`${path}: ${rule.game} footer line missing: "${line.slice(0,60)}..."`);
  for(const other of rules){
    if(other===rule)continue;
    for(const line of other.lines)if(text.includes(line))errors.push(`${path}: carries the ${other.game} footer line on a ${rule.game} page`);
  }
  return errors;
}
