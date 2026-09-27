// Bounded, local diagnostics. Labels and durations only, never account or item data.
const key=Symbol.for('astrix.engine.timings.v1');
const records=globalThis[key]||(globalThis[key]=[]);
export const ENGINE_BUDGETS=Object.freeze({profile:1000,dimImport:1000,generate:2000,handoff:4000});
export function beginEngineTiming(stage){
  const start=performance.now(),marks=[];let ended=false;
  return {
    mark(name){marks.push({stage:name,ms:performance.now()-start});},
    end(status='complete'){
      if(ended)return;ended=true;
      const row={stage,status,ms:performance.now()-start,marks};
      records.push(row);if(records.length>128)records.shift();
      return row;
    }
  };
}
export const engineTimings=()=>records.map(row=>({...row,marks:row.marks.map(mark=>({...mark}))}));
export const afterEnginePaint=()=>new Promise(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>requestAnimationFrame(resolve)):setTimeout(resolve,0));
