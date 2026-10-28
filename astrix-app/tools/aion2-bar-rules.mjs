// The game's skill bar rules (Miguel, in game, 25 Oct 2026), shared by the advisor and level planner tests so every
// class is held to the same rules at every level. Moved here from test-aion2-advisor.mjs unchanged.
import assert from 'node:assert/strict';

/* The game's bar (Miguel, in game, 25 Oct 2026): fingers rest on W A S D, so 1 to 4, Q and E are the reachable keys and
   5 to 8 a stretch. Cooldown skills and stigmas claim 1 to 4, cover (stagger, heal, defensive) claims Q and E; the rest
   (toggle, dash, movement) take what is left of those six, and only then 5 to 8. A cooldown or cover key outside its own
   keys is allowed only once those are full. No skill the Daeva has now sits on 5 to 8 while a reachable key is free or
   only held for a later skill. A build's second stack sits on key 1; no own skill on right click. */
const REACH=['1','2','3','4','Q','E'];
const KEY_GROUP={cover:['Q','E'],cooldown:['1','2','3','4'],rest:['5','6','7','8']};
const groupOfStack=stack=>{
  const reason=stack.skills[0]?.reason??null;
  if(['stagger','heal','defensive'].includes(reason))return 'cover';
  if(stack.skills.some(skill=>skill.stigma)||!['toggle','dash','movement'].includes(reason))return 'cooldown';
  return 'rest';
};
export function assertKeyGroups(bar,tag){
  const used=key=>bar.stacks[key].skills.length>0||Boolean(bar.stacks[key].reserved?.length);
  if(bar.secondStack){
    assert.equal(bar.secondStackKey,'1',`${tag}: the second stack on key 1`);
    assert.ok(!used('1'),`${tag}: key 1 holds only the second stack`);
    assert.ok(bar.stacks[bar.secondStack].skills.length>0,`${tag}: the second stack has skills`);
  }
  assert.ok(!bar.stacks.RMB.skills.length,`${tag}: no own skill on right click (it is the main line's)`);
  // AION 2 stacks only on 1 to 4, Q, E and right click (Miguel, in game, 25 Oct 2026): 5 to 8 hold one skill each.
  for(const key of ['5','6','7','8'])assert.ok(bar.stacks[key].skills.length<=1&&(bar.stacks[key].reserved?.length??0)<=1,`${tag}: key ${key} holds a stack, but 5 to 8 cannot`);
  const holdsNow=key=>bar.stacks[key].skills.length>0||(bar.secondStack&&key==='1');
  for(const key of ['5','6','7','8'].filter(key=>bar.stacks[key].skills.length))
    assert.ok(REACH.every(holdsNow),`${tag}: ${bar.stacks[key].skills[0].name} is on ${key} while a reachable key (${REACH.filter(k=>!holdsNow(k)).join(', ')}) is free or held for later`);
  for(const key of bar.left.filter(key=>key!=='RMB'&&bar.stacks[key].skills.length)){
    const group=groupOfStack(bar.stacks[key]);
    if(KEY_GROUP[group].includes(key)||group==='rest')continue;
    const full=KEY_GROUP[group].every(k=>used(k)||(bar.secondStack&&k==='1'));
    assert.ok(full,`${tag}: ${bar.stacks[key].skills[0].name} (${group}) is on ${key} while its own keys ${KEY_GROUP[group].join(', ')} have room`);
  }
}
