// The game's skill bar rules, shared by the advisor and level planner tests so every class is held to the same rules at
// every level.
import assert from 'node:assert/strict';

/* The bar by cooldown (Miguel, in game, 28 Oct 2026; mechanics.json skill-bar). This replaces the 25 Oct key groups
   (Q and E cover, 1 to 4 cooldowns, the second stack on key 1).
   - Right click: the main line (instant, spammable). No own skill sits on right click.
   - Q and E: stacks of up to four of the shortest cooldowns, Q the shorter stack. Never a long cooldown (45 s and over),
     never a toggle, dash, movement or charged skill.
   - 1 to 4: the long cooldowns, one per key; a long cooldown goes on 5 to 8 only when 1 to 4 are full.
   - 5 to 8: one skill each. The game stacks on 1 to 4, Q, E and right click only.
   - Inside a stack the longest cooldown is on row 0; an always-ready skill only on the top row. */
const LONG=45;
const OWN_ONLY=['toggle','dash','movement','charged'];
const cdOf=skill=>skill.noCooldown?0:skill.cooldownSeconds;
export function assertKeyGroups(bar,tag){
  const long=bar.longCooldown??LONG;
  // The build's second stack is drawn on its key (Q or E): read it there.
  const skillsOn=key=>(key===bar.secondStackKey&&bar.secondStack?bar.stacks[bar.secondStack]:bar.stacks[key]).skills;
  assert.ok(!skillsOn('RMB').length,`${tag}: no own skill on right click (it is the main line's)`);
  for(const key of ['5','6','7','8'])assert.ok(skillsOn(key).length<=1,`${tag}: key ${key} holds a stack, but 5 to 8 cannot`);
  for(const key of ['Q','E']){
    for(const skill of skillsOn(key)){
      assert.ok(!(cdOf(skill)>=long),`${tag}: ${skill.name} (${skill.cooldownSeconds} s, a long cooldown) is stacked on ${key}`);
      assert.ok(!OWN_ONLY.includes(skill.reason),`${tag}: ${skill.name} (${skill.reason}) keeps a key of its own, not a stack on ${key}`);
      assert.ok(!skill.cooldownPending,`${tag}: ${skill.name} has no captured cooldown, so it cannot be ranked into the ${key} stack`);
    }
  }
  // An always-ready skill is the shortest of all: a stack of only that is never the longer one.
  const top=key=>Math.max(-1,...skillsOn(key).map(cdOf).filter(Number.isFinite));
  if(top('Q')>0&&top('E')>0)assert.ok(top('Q')<=top('E'),`${tag}: Q (longest ${top('Q')} s) is not the shorter stack against E (longest ${top('E')} s)`);
  for(const key of ['Q','E','1','2','3','4']){
    // The build's own stack keeps the build's rows: that is the macro's order.
    if(key===bar.secondStackKey)continue;
    const list=skillsOn(key);
    // Rows the stack ranks by cooldown; a skill with no captured cooldown keeps the build's own order.
    if(list.some(skill=>skill.cooldownPending))continue;
    const timed=list.filter(skill=>cdOf(skill)!==0);
    for(let row=1;row<timed.length;row++)assert.ok((cdOf(timed[row])??0)<=(cdOf(timed[row-1])??0)||timed[row].conditional,`${tag}: key ${key}: ${timed[row].name} (${cdOf(timed[row])} s) sits above ${timed[row-1].name} (${cdOf(timed[row-1])} s); the longest goes on row 0`);
  }
  const freeReach=['1','2','3','4'].filter(key=>!skillsOn(key).length);
  for(const key of ['5','6','7','8'])for(const skill of skillsOn(key))
    assert.ok(!freeReach.length,`${tag}: ${skill.name} is on ${key} while ${freeReach.join(', ')} is free`);
  for(const key of ['5','6','7','8'])for(const skill of skillsOn(key))
    if(cdOf(skill)>=long)assert.ok(['1','2','3','4'].every(k=>skillsOn(k).length),`${tag}: ${skill.name} (long) on ${key} while 1 to 4 have room`);
  assert.deepEqual(bar.problems,[],`${tag}: bar problems`);
}
