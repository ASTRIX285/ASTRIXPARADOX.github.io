export const POINT_TYPES=Object.freeze({
  activity:'Activities & missions',raid:'Raids',dungeon:'Dungeons',strike:'Strikes',
  landing:'Landing zones',vendor:'Vendors',area:'Areas','lost-sector':'Lost Sectors',
  location:'Other points of interest',chest:'Region chests'
});

const normalise=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').trim();
export const hasMapPosition=entry=>Number.isFinite(entry?.position?.x)&&Number.isFinite(entry?.position?.y)&&entry.position.x>=0&&entry.position.x<=100&&entry.position.y>=0&&entry.position.y<=100;

// Only return Bungie artwork attached to this definition. Prompt 24 supplies
// separately drawn type glyphs when an official image is absent or fails.
export function directorIconUrl(entry){
  const path=[entry?.icon,...(entry?.variants||[]).map(variant=>variant.icon)]
    .map(value=>typeof value==='string'?value.replace(/^https:\/\/www\.bungie\.net(?=\/)/,''):value)
    .find(value=>typeof value==='string'&&/^\/common\/destiny2_content\/icons\/[a-zA-Z0-9_]+\.png$/.test(value));
  return path?`https://www.bungie.net${path}`:null;
}

// Source coordinates stay relative to the full 4K/6K export. Keep every map in
// the same 16:9 frame; Pale Heart fills it through its 200% opening zoom.
export const DIRECTOR_VIEW_BOXES=Object.freeze({
  'pale-heart':Object.freeze({x:0,y:0,width:3840,height:2160})
});
export const directorViewBox=key=>DIRECTOR_VIEW_BOXES[key]||{x:0,y:0,width:3840,height:2160};
export function directorViewPosition(position,view){
  return {x:(position.x*38.4-view.x)/view.width*100,y:(position.y*21.6-view.y)/view.height*100};
}

export function mapCatalogueEntries(catalogue,staticMarkers=[]){
  const entries=(catalogue?.entries||[]).map(entry=>({...entry,variants:[...(entry.variants||[])]}));
  // Retain the approved Cosmodrome pin coordinates and join their public definitions.
  for(const marker of staticMarkers){
    const entry=entries.find(row=>normalise(row.name.split(':')[0])===normalise(marker.name)&&row.type===marker.type)
      ||entries.find(row=>normalise(row.name)===normalise(marker.name));
    const position={x:marker.x,y:marker.y,basis:'approved-cosmodrome',approximate:false};
    if(entry){entry.position=position;entry.type=marker.type;entry.name=marker.name;entry.markerKey=marker.key;}
    else entries.push({id:marker.key,markerKey:marker.key,type:marker.type,name:marker.name,position,variants:[]});
  }
  return entries;
}

export function filterMapEntries(entries,query='',type=''){
  const terms=normalise(query).split(/\s+/).filter(Boolean);
  return entries.filter(entry=>(!type||entry.type===type)&&terms.every(term=>normalise([entry.name,entry.description,...(entry.variants||[]).map(v=>v.name)].join(' ')).includes(term)));
}

export function clusterMapEntries(entries,width,height,scale=1){
  const groups=[];
  for(const entry of entries.filter(hasMapPosition)){
    const {x,y}=entry.position;
    const nearby=groups.find(group=>Math.hypot((group.x-x)*width*scale/100,(group.y-y)*height*scale/100)<32);
    if(nearby)nearby.entries.push(entry);
    else groups.push({x,y,entries:[entry]});
  }
  return groups;
}

export function regionChestEntries(progress){
  return (progress?.chests||[]).map((chest,index)=>({
    id:`chest-${chest.id||index}`,type:'chest',name:chest.name,description:chest.location,
    completed:typeof chest.collected==='boolean'?chest.collected:null,variants:[],position:null
  }));
}

export function normaliseRegionChestProgress(key,value){
  if(!value||value.key!==key||!Array.isArray(value.chests))return null;
  const chests=value.chests.map(chest=>({
    id:chest.id,name:String(chest.name||'').trim(),location:String(chest.location||'').trim(),
    collected:typeof chest.collected==='boolean'?chest.collected:null
  }));
  if(chests.some(chest=>!chest.name||!chest.location)||value.total!==chests.length)return null;
  const discovered=chests.filter(chest=>chest.collected===true).length;
  if(value.discovered!==discovered)return null;
  const missing=chests.filter(chest=>chest.collected===false).length;
  return {total:chests.length,discovered,missing,unknown:chests.length-discovered-missing,chests};
}

// Prompt 24: original geometric drawings, not copied game or third-party icons.
const MARKER_PATHS=Object.freeze({
  chest:'M4 10V7h16v3M3 10h18v10H3zM3 14h18M10 12h4v5h-4z',
  'lost-sector':'M3 20V11a9 9 0 0 1 18 0v9M7 20v-9a5 5 0 0 1 10 0v9M10 20v-8h4v8',
  activity:'M12 3 21 12 12 21 3 12zM12 8v8M8 12h8',
  vendor:'M4 9h16v11H4zM3 9l2-5h14l2 5M9 20v-7h6v7',
  landing:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  area:'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  location:'M12 21s-7-8-7-12a7 7 0 0 1 14 0c0 4-7 12-7 12zM9 9h6M12 6v6'
});
export const canRenderMapMarker=entry=>hasMapPosition(entry)&&Object.hasOwn(POINT_TYPES,entry.type);
export function markerGlyphMarkup(type){
  if(!Object.hasOwn(POINT_TYPES,type))return '';
  const kind=['raid','dungeon','strike'].includes(type)?'activity':type;
  return `<svg class="journey-map-marker-glyph" data-marker-glyph="${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${MARKER_PATHS[kind]}"/></svg>`;
}

// Europa sourcing request: a coordinate or a type glyph alone cannot qualify a marker.
const MARKER_DEFINITION_TYPES=new Set(['DestinyActivityDefinition','DestinyVendorDefinition','DestinyPlaceDefinition','DestinyDestinationDefinition']);
export function canRenderSourcedMapMarker(entry){
  const definition=entry?.definition,properties=definition?.displayProperties,source=entry?.position?.source;
  const safeUrl=value=>{try{return new URL(value).protocol==='https:';}catch{return false;}};
  return Boolean(canRenderMapMarker(entry)&&MARKER_DEFINITION_TYPES.has(definition?.table)
    &&Number.isInteger(definition?.hash)&&definition.hash>0
    &&definition.nameField==='name'&&properties?.name?.trim()&&entry.name===properties.name
    &&['icon','mapIcon','smallTransparentIcon','largeTransparentIcon'].includes(definition.iconField)
    &&entry.icon===properties[definition.iconField]&&directorIconUrl({icon:entry.icon})
    &&entry.position.basis==='hand-placed'&&source?.publisher?.trim()
    &&safeUrl(source.url)&&safeUrl(source.image)&&/^[a-f0-9]{64}$/.test(source.sha256)
    &&Array.isArray(source.imageSize)&&source.imageSize.length===2
    &&source.imageSize.every(n=>Number.isFinite(n)&&n>0)
    &&Array.isArray(source.pixel)&&source.pixel.length===2
    &&source.pixel.every((n,i)=>Number.isFinite(n)&&n>=0&&n<=source.imageSize[i])
    &&source.notes?.trim());
}
export function applySourcedMapMarkers(catalogue,audit){
  if(catalogue.key!==audit.key||catalogue.manifestVersion!==audit.manifestVersion)throw new Error('Marker source mismatch');
  const approved=new Map(audit.markers.filter(canRenderSourcedMapMarker).map(entry=>[entry.id,entry]));
  return {...catalogue,entries:catalogue.entries.map(entry=>approved.get(entry.id)||{...entry,position:null})};
}
