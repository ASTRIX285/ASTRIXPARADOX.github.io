import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const workers=[],timers=new Map();let sequence=0;
class Worker {constructor(){this.sent=[];workers.push(this);}postMessage(value){this.sent.push(value);}terminate(){this.terminated=true;}reply(data){this.onmessage({data});}}
const source=readFileSync(new URL('../core/engine-profile-client.mjs',import.meta.url),'utf8').replace('export function','function').replace('import.meta.url',"'https://astrixparadox.com/core/client.mjs'");
const context=vm.createContext({Worker,URL,Map,Promise,Error,setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});vm.runInContext(source,context);
const call=()=>context.runProfileTask('normalise',{payload:{}});
const first=call(),second=call();assert.equal(workers[0].sent.length,0);assert.deepEqual([...timers.values()].map(t=>t.ms),[15000]);
// A cold worker taking longer than 4s to import modules has no execution timer yet.
workers[0].reply({type:'ready'});assert.equal(workers[0].sent.length,1);assert.deepEqual([...timers.values()].map(t=>t.ms),[4000]);
workers[0].reply({id:workers[0].sent[0].id,result:'first'});assert.equal(await first,'first');assert.equal(workers[0].sent.length,2);assert.equal(timers.size,1);
workers[0].reply({id:workers[0].sent[1].id,result:'second'});assert.equal(await second,'second');assert.equal(timers.size,0);
const stalled=call(),queued=call(),failures=Promise.all([assert.rejects(stalled,/processing timed out/),assert.rejects(queued,/processing timed out/)]);
[...timers.values()][0].fn();await failures;assert.equal(workers[0].terminated,true);assert.equal(timers.size,0);
const retry=call();assert.equal(workers.length,2);workers[1].reply({type:'ready'});workers[1].reply({id:workers[1].sent[0].id,result:'recovered'});assert.equal(await retry,'recovered');
const broken=call(),failed=assert.rejects(broken,/worker failed/);workers[1].onerror();await failed;
const malformed=call(),parseFailure=assert.rejects(malformed,error=>error.name==='SyntaxError');
workers[2].reply({type:'ready'});workers[2].reply({id:workers[2].sent[0].id,error:'Unexpected end of JSON input',errorName:'SyntaxError'});await parseFailure;
workers[2].onerror();
const boot=call(),bootFailure=assert.rejects(boot,/startup timed out/);[...timers.values()][0].fn();await bootFailure;assert.equal(timers.size,0);
assert.match(readFileSync(new URL('../core/engine-profile-worker.mjs',import.meta.url),'utf8'),/self.postMessage\(\{type:'ready'\}\)/);
console.log('PROFILE_WORKER_LIFECYCLE=PASS bounded startup, sequential jobs, processing deadline, termination and retry');
