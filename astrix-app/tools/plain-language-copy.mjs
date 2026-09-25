// Prompt 19: inspect copy, never identifiers, selectors, classes, URLs or state keys.
// Node ships Acorn for its own syntax tooling, so validation needs no npm install.
import {runInNewContext} from 'node:vm';
const exports={};
const bundled=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if(!bundled)throw new Error('Plain-language validation requires Node with its bundled Acorn parser.');
runInNewContext(bundled,{exports,module:{exports}});
export const bannedCopy=/\b(?:verified|unverified|owned|unowned|authenticated|authoritative|evidence|ownership|verifying|verification|authentication|authority|evidenced|real\s+account|real\s+equipped|live\s+Bungie|fresh\s+Bungie)\b/i;

export function htmlCopyRanges(source){
  const ranges=[],tokens=/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g;
  for(const match of source.matchAll(tokens)){
    const text=match[0];if(text.startsWith('<!--'))continue;
    if(text.startsWith('<')){
      for(const attr of text.matchAll(/\b(?:title|alt|aria-label|aria-description|aria-valuetext|placeholder|content)\s*=\s*(["'])([\s\S]*?)\1/g)){
        if(!attr[2])continue;
        const start=match.index+attr.index+attr[0].indexOf(attr[1])+1;
        ranges.push({start,end:start+attr[2].length});
      }
    }else if(text.trim())ranges.push({start:match.index,end:match.index+text.length});
  }
  return ranges;
}

export function visibleCopySegments(file,source){
  const result=[];
  const add=(start,end,context)=>{if(end>start)result.push({start,end,text:source.slice(start,end),context});};
  const parseJS=(script,offset=0)=>{
    const ast=exports.parse(script,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});
    const code=node=>script.slice(node.start,node.end);
    function walk(node,parent,anc=[]){
      if(!node||typeof node!=='object')return;
      const chain=[...anc,node];
      const excluded=anc.some(a=>a.type==='AssignmentExpression'&&/\.(?:className|id)\b/.test(code(a.left)))||anc.some(a=>a.type==='CallExpression'&&/^(?:console\.|.*\.(?:querySelector(?:All)?|closest|matches|getElementById|classList\.|getAttribute|removeAttribute))/.test(code(a.callee)))||anc.some(a=>a.type==='CallExpression'&&/\.setAttribute$/.test(code(a.callee))&&!['title','alt','aria-label','placeholder'].includes(a.arguments[0]?.value));
      if(!excluded&&node.type==='Literal'&&typeof node.value==='string'){
        const key=parent?.type==='Property'?(parent.key.name||parent.key.value):'';
        const sink=/^(?:title|label|message|reason|description|detail|summary|note|tooltip|hint|empty|caption|name|statusText)$/.test(key)||anc.some(a=>a.type==='AssignmentExpression'&&/\.(?:textContent|innerText|innerHTML|outerHTML|title)$/.test(code(a.left)));
        const internal=(parent?.type==='Property'&&parent.key===node)||/^(?:Import|Export)/.test(parent?.type||'')||parent?.type==='MemberExpression'||(parent?.type==='BinaryExpression'&&parent.operator!=='+')||parent?.type==='SwitchCase'||(parent?.type==='CallExpression'&&parent.callee.name==='add'&&parent.arguments[0]===node);
        const value=node.value.trim();
        if(!internal&&!/^(?:https?:|\.?\.?\/|\[data-)|\.(?:mjs|js|css)(?:\?|$)/.test(value)&&!/^['"]?\s*[\w-]+=['"]?$/.test(value)&&!/^[-\w]+-[\w-]+(?:\s+is-[\w-]+)*$/.test(value)&&(!/^[\w:.-]+$/.test(value)||sink||/^[A-Z]/.test(value))){
          const start=node.start+1,raw=script.slice(start,node.end-1);
          if(raw.includes('<'))for(const range of htmlCopyRanges(raw))add(offset+start+range.start,offset+start+range.end,'markup literal');
          else add(offset+start,offset+node.end-1,'literal');
        }
      }
      if(!excluded&&node.type==='TemplateLiteral'){
        const start=node.start+1,mask=script.slice(start,node.end-1).split('');
        for(const expression of node.expressions)for(let i=expression.start-start-2;i<expression.end-start+1;i++)mask[i]='_';
        const markup=mask.join(''),ranges=markup.includes('<')?htmlCopyRanges(markup):[{start:0,end:markup.length}];
        for(const quasi of node.quasis)for(const range of ranges){
          const from=Math.max(quasi.start,start+range.start),to=Math.min(quasi.end,start+range.end);
          if(!markup.includes('<')&&/^[-\w]+-[\w-]+(?:\s+is-[\w-]*)*$/.test(script.slice(from,to).trim()))continue;
          add(offset+from,offset+to,'template');
        }
      }
      for(const [key,value] of Object.entries(node))if(!['start','end'].includes(key)){
        if(Array.isArray(value))for(const child of value)walk(child,node,chain);
        else if(value&&typeof value==='object')walk(value,node,chain);
      }
    }
    walk(ast,null);
  };
  if(file.endsWith('.html')){
    const masked=source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,match=>' '.repeat(match.length));
    for(const range of htmlCopyRanges(masked))add(range.start,range.end,'html');
    for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(match[2].trim()&&!/\bsrc\s*=|application\/(?:ld\+)?json/i.test(match[1]))parseJS(match[2],match.index+match[0].indexOf('>')+1);
  }else if(file.endsWith('.css')){
    const masked=source.replace(/\/\*[\s\S]*?\*\//g,match=>' '.repeat(match.length));
    for(const match of masked.matchAll(/\bcontent\s*:\s*(["'])(.*?)\1/g)){const start=match.index+match[0].indexOf(match[1])+1;add(start,start+match[2].length,'css content');}
  }else parseJS(source);
  return result;
}
