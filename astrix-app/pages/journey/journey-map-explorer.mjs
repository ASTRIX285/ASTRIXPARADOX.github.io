import {POINT_TYPES,hasMapPosition,mapCatalogueEntries,filterMapEntries,clusterMapEntries,regionChestEntries} from './journey-map-model.mjs?v=20260920-1';

const loaders=Object.freeze({
  edz:()=>import('./assets/map-data/edz.mjs?v=20260920-1'),
  nessus:()=>import('./assets/map-data/nessus.mjs?v=20260920-1'),
  moon:()=>import('./assets/map-data/moon.mjs?v=20260920-1'),
  europa:()=>import('./assets/map-data/europa.mjs?v=20260920-1'),
  neomuna:()=>import('./assets/map-data/neomuna.mjs?v=20260920-1'),
  kepler:()=>import('./assets/map-data/kepler.mjs?v=20260920-1'),
  'pale-heart':()=>import('./assets/map-data/pale-heart.mjs?v=20260920-1'),
  'dreaming-city':()=>import('./assets/map-data/dreaming-city.mjs?v=20260920-1'),
  'throne-world':()=>import('./assets/map-data/throne-world.mjs?v=20260920-1'),
  cosmodrome:()=>import('./assets/map-data/cosmodrome.mjs?v=20260920-1')
});
const make=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
};
const button=(className,text)=>{
  const node=make('button',className,text);node.type='button';return node;
};

export function createJourneyMapExplorer({key,label,staticMarkers,viewport,markerIcon,onFocus}){
  const layer=make('div','journey-map-marker-layer');
  layer.setAttribute('aria-label',`${label} map points`);
  const root=make('section','journey-map-explorer');
  root.setAttribute('aria-label',`${label} activities and points of interest`);
  const heading=make('h3',null,'ACTIVITIES & POINTS OF INTEREST');
  const note=make('p','journey-map-catalogue-note','Explore Director locations and activity details. Some activities are seasonal or historical; current availability is not verified.');
  const filters=make('div','journey-map-point-filters');
  const searchLabel=make('label',null,'Find a point');
  const search=make('input');search.type='search';search.placeholder='Search activities, vendors and places';
  searchLabel.append(search);
  const typeLabel=make('label',null,'Show');
  const type=make('select');type.append(new Option('All points',''));typeLabel.append(type);
  filters.append(searchLabel,typeLabel);
  const count=make('p','journey-map-point-count','Loading points of interest...');count.setAttribute('role','status');
  const columns=make('div','journey-map-point-columns');
  const list=make('div','journey-map-point-list');list.setAttribute('aria-label','Matching map points');
  const details=make('section','journey-map-point-details');details.id=`journeyMapPoint-${key}`;
  details.setAttribute('aria-label','Selected point');details.setAttribute('aria-live','polite');
  details.append(make('p',null,'Select a map symbol or a point from the list.'));
  columns.append(list,details);root.append(heading,note,filters,count,columns);
  let baseEntries=mapCatalogueEntries(null,staticMarkers),chests=[],entries=baseEntries,visible=entries,scale=1,selected='',loaded=false;

  function select(entry,{focusMap=false}={}){
    selected=entry.id;
    details.replaceChildren(make('h4',null,entry.name),make('p','journey-map-point-kind',POINT_TYPES[entry.type]||'Point of interest'));
    if(entry.description)details.append(make('p',null,entry.description));
    const positionNote=hasMapPosition(entry)?entry.position.approximate?'Approximate Director position.':'Director position.':'Map position unavailable.';
    details.append(make('p','journey-map-position-note',positionNote));
    if(hasMapPosition(entry)){
      const locate=button('journey-map-locate','Show on map');
      locate.addEventListener('click',()=>{onFocus(entry.position);viewport.focus({preventScroll:true});});
      details.append(locate);
      if(focusMap)onFocus(entry.position);
    }
    if(entry.type==='chest')details.append(make('p','journey-map-completion',entry.completed===true?'Collected':entry.completed===false?'Not collected':'Collection status unavailable'));
    if(entry.variants?.length){
      details.append(make('h5',null,'ACTIVITY OPTIONS'));
      for(const variant of entry.variants){
        const option=make('details','journey-map-activity-option');
        option.append(make('summary',null,variant.name));
        if(variant.description)option.append(make('p',null,variant.description));
        if(variant.activityType)option.append(make('p','journey-map-point-kind',variant.activityType));
        option.append(make('p','journey-map-availability','Availability and completion are not verified. Launch activities in Destiny 2.'));
        details.append(option);
      }
    }
    for(const item of root.querySelectorAll('[data-point-id]'))item.setAttribute('aria-pressed',String(item.dataset.pointId===selected));
    for(const item of layer.children)item.classList.toggle('is-selected',item._pointIds.includes(selected));
  }

  function renderMarkers(){
    const oldFocus=document.activeElement?.closest?.('.journey-map-marker');
    const focusId=oldFocus&&layer.contains(oldFocus)?oldFocus._pointIds[0]:null;
    const groups=clusterMapEntries(visible,viewport.clientWidth||1000,viewport.clientHeight||562,scale);
    layer.replaceChildren(...groups.map(group=>{
      const entry=group.entries[0],multiple=group.entries.length>1;
      const item=button('journey-map-marker');
      item.dataset.markerKey=entry.markerKey||entry.id;
      item.dataset.markerType=entry.type;
      item._pointIds=group.entries.map(point=>point.id);
      item.style.left=`${group.x}%`;item.style.top=`${group.y}%`;
      const name=multiple?`${group.entries.length} nearby points`:entry.name;
      item.setAttribute('aria-label',name);item.setAttribute('aria-controls',details.id);
      item.classList.toggle('is-selected',item._pointIds.includes(selected));
      const icon=make('span','journey-map-marker-icon');
      if(multiple){icon.textContent=String(group.entries.length);icon.classList.add('is-cluster');}
      else icon.append(markerIcon(entry.type));
      const copy=make('span','journey-map-marker-copy');copy.append(make('strong',null,name));
      item.append(icon,copy);
      item.addEventListener('click',()=>{
        if(!multiple){select(entry);return;}
        details.replaceChildren(make('h4',null,'Nearby points'));
        for(const point of group.entries){const choice=button('journey-map-point-result',point.name);choice.addEventListener('click',()=>select(point));details.append(choice);}
      });
      return item;
    }));
    if(focusId)[...layer.children].find(item=>item._pointIds.includes(focusId))?.focus({preventScroll:true});
  }

  function render(){
    entries=[...baseEntries,...chests];
    visible=filterMapEntries(entries,search.value,type.value);
    count.textContent=`${visible.length} points, ${visible.filter(hasMapPosition).length} with map positions${loaded?'':' (loading catalogue)'}`;
    list.replaceChildren(...visible.map(entry=>{
      const result=button('journey-map-point-result');
      result.dataset.pointId=entry.id;result.setAttribute('aria-controls',details.id);result.setAttribute('aria-pressed',String(entry.id===selected));
      result.append(make('strong',null,entry.name),make('small',null,`${POINT_TYPES[entry.type]||'Point of interest'}${hasMapPosition(entry)?' · On map':''}`));
      result.addEventListener('click',()=>select(entry,{focusMap:true}));
      return result;
    }));
    if(!visible.length)list.append(make('p','journey-map-no-points','No points match your search.'));
    if(selected&&!visible.some(entry=>entry.id===selected)){
      selected='';details.replaceChildren(make('p',null,'Select a map symbol or a point from the list.'));
    }
    renderMarkers();
  }

  function refreshTypes(){
    const selectedType=type.value;
    const kinds=new Set([...baseEntries,...chests].map(entry=>entry.type));
    type.replaceChildren(new Option('All points',''),...Object.entries(POINT_TYPES).filter(([kind])=>kinds.has(kind)).map(([kind,name])=>new Option(name,kind)));
    type.value=kinds.has(selectedType)?selectedType:'';
  }
  search.addEventListener('input',render);type.addEventListener('change',render);
  const ready=(async()=>{
    try{
      const {default:catalogue}=await loaders[key]();
      if(catalogue.key!==key)throw new Error('Destination mismatch');
      baseEntries=mapCatalogueEntries(catalogue,staticMarkers);loaded=true;refreshTypes();render();
      return {key,status:'ready',entries:baseEntries.length};
    }catch{
      render();count.textContent='The destination catalogue could not load. Reload the page to try again.';
      return {key,status:'unavailable',entries:baseEntries.length};
    }
  })();
  return {root,layer,ready,refreshMarkers(next=scale){scale=next;renderMarkers();},setChests(progress){chests=regionChestEntries(progress);refreshTypes();render();const active=chests.find(entry=>entry.id===selected);if(active)select(active);}};
}
