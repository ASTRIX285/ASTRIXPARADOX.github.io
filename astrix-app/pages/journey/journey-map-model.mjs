export const POINT_TYPES=Object.freeze({
  activity:'Activities & missions',raid:'Raids',dungeon:'Dungeons',strike:'Strikes',
  landing:'Landing zones',vendor:'Vendors',area:'Areas','lost-sector':'Lost Sectors',
  location:'Other points of interest',chest:'Region chests'
});

const normalise=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').trim();
export const hasMapPosition=entry=>Number.isFinite(entry?.position?.x)&&Number.isFinite(entry?.position?.y)&&entry.position.x>=0&&entry.position.x<=100&&entry.position.y>=0&&entry.position.y<=100;

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
