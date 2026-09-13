(function installForgeDestinationTheme(global){
  'use strict';

  const STORAGE_KEY='astrix-paradox-destination';
  const DESTINATIONS=Object.freeze([
    Object.freeze({key:'pale-heart',label:'The Pale Heart',aliases:['pale heart','the pale heart','traveler']}),
    Object.freeze({key:'europa',label:'Europa',aliases:['europa','glassway','the glassway']}),
    Object.freeze({key:'dreaming-city',label:'The Dreaming City',aliases:['dreaming city','the dreaming city']}),
    Object.freeze({key:'edz',label:'EDZ',aliases:['edz','european dead zone']}),
    Object.freeze({key:'cosmodrome',label:'Cosmodrome',aliases:['cosmodrome']}),
    Object.freeze({key:'moon',label:'Moon',aliases:['moon','the moon']}),
    Object.freeze({key:'neomuna',label:'Neomuna',aliases:['neomuna']}),
    Object.freeze({key:'nessus',label:'Nessus',aliases:['nessus']}),
    Object.freeze({key:'throne-world',label:'Throne World',aliases:['throne world','savathun throne world','savathuns throne world']}),
    Object.freeze({key:'tower',label:'Tower',aliases:['tower','the tower']})
  ]);
  const byKey=new Map(DESTINATIONS.map(destination=>[destination.key,destination]));
  const byAlias=new Map(DESTINATIONS.flatMap(destination=>[
    [destination.key,destination.key],
    ...destination.aliases.map(alias=>[alias,destination.key])
  ]));

  function clean(value){
    return String(value??'').trim().toLowerCase().replace(/[’']/g,'').replace(/[_/]+/g,' ').replace(/\s+/g,' ');
  }

  function keyOf(value){
    const normalized=clean(value);
    if(!normalized)return '';
    return byAlias.get(normalized)||byAlias.get(normalized.replace(/-/g,' '))||'';
  }

  function labelOf(value){
    return byKey.get(keyOf(value))?.label||'';
  }

  function current(){
    return keyOf(document.documentElement.dataset.location);
  }

  function set(value,{persist=true}={}){
    const key=keyOf(value);
    if(key)document.documentElement.dataset.location=key;
    else document.documentElement.removeAttribute('data-location');
    if(persist){
      try{
        if(key)localStorage.setItem(STORAGE_KEY,key);
        else localStorage.removeItem(STORAGE_KEY);
      }catch{}
    }
    document.dispatchEvent(new CustomEvent('forge:destination-changed',{detail:{key,label:labelOf(key)}}));
    return key;
  }

  function restore(){
    let stored='';
    try{stored=localStorage.getItem(STORAGE_KEY)||'';}catch{}
    return set(stored,{persist:false});
  }

  function options({includeDefault=true}={}){
    return [
      ...(includeDefault?[{key:'',label:'Default atmosphere'}]:[]),
      ...DESTINATIONS.map(({key,label})=>({key,label}))
    ];
  }

  global.ForgeDestinations=Object.freeze({DESTINATIONS,STORAGE_KEY,current,keyOf,labelOf,options,restore,set});
  restore();
})(globalThis);
