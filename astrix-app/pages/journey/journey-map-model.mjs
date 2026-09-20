export const POINT_TYPES=Object.freeze({
  activity:'Activities & missions',raid:'Raids',dungeon:'Dungeons',strike:'Strikes',
  landing:'Landing zones',vendor:'Vendors',area:'Areas','lost-sector':'Lost Sectors',
  location:'Other points of interest',chest:'Region chests'
});

const normalise=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').trim();
export const hasMapPosition=entry=>Number.isFinite(entry?.position?.x)&&Number.isFinite(entry?.position?.y)&&entry.position.x>=0&&entry.position.x<=100&&entry.position.y>=0&&entry.position.y<=100;

// Only use artwork attached to this definition. Never substitute a type glyph,
// another activity's icon, or Bungie's missing-icon placeholder.
export function directorIconUrl(entry){
  const path=[entry?.icon,...(entry?.variants||[]).map(variant=>variant.icon)]
    .find(value=>typeof value==='string'&&/^\/common\/destiny2_content\/icons\/[a-zA-Z0-9_]+\.png$/.test(value));
  return path?`https://www.bungie.net${path}`:null;
}

// Source coordinates stay relative to the full 4K/6K export. The viewer crops
// only canvas padding, transforming both image and points through this rectangle.
export const DIRECTOR_VIEW_BOXES=Object.freeze({
  'pale-heart':Object.freeze({x:0,y:472,width:3840,height:1216})
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
    id:`chest-${index}`,type:'chest',name:chest.name,description:chest.location,
    completed:typeof chest.collected==='boolean'?chest.collected:null,variants:[],position:null
  }));
}
