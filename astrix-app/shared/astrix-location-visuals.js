/* astrix-location-visuals.js
   Per-destination VISUAL data for the Journey atmosphere/selector, keyed to the same
   keys as ForgeDestinations (astrix-destination-theme.js).

   Accents are Forge original values grounded in each destination's official Bungie art
   (Bungie's manifest carries no destination colour; these are NOT Braytech's palette).
   Drop art at the image path — a missing image degrades to the colour atmosphere.
   This file holds NO progression data; verified checklist data binds at runtime. */
(function installForgeLocationVisuals(global){
  'use strict';
  global.FORGE_LOCATION_VISUALS = Object.freeze({
    'pale-heart':   {accent:'201,168,106', image:'/astrix-app/shared/locations/pale-heart.jpeg',   lore:'A surreal domain of memory within the Traveler, corrupted by the Witness.'},
    'dreaming-city':{accent:'138,107,200', image:'/astrix-app/shared/locations/dreaming-city.jpg', lore:'The Awoken’s cursed realm, locked in a three-week cycle of blessing and curse.'},
    'neomuna':      {accent:'64,200,210',  image:'/astrix-app/shared/locations/neomuna.jpg',       lore:'Neptune. A hidden neon metropolis defended by the Cloud Striders.'},
    'europa':       {accent:'127,178,230', image:'/astrix-app/shared/locations/europa.jpg',        lore:'Jupiter’s frozen moon. Braytech ruins above the Deep Stone Crypt.'},
    'throne-world': {accent:'90,190,170',  image:'/astrix-app/shared/locations/throne-world.webp',  lore:'The Witch Queen’s realm of swamp, palace and lucent brood.'},
    'nessus':       {accent:'214,120,90',  image:'/astrix-app/shared/locations/nessus.png',        lore:'A Centaur consumed by the Vex, red groves over machine depths.'},
    'edz':          {accent:'110,150,80',  image:'/astrix-app/shared/locations/edz.png',           lore:'Earth. Overgrown ruins, Fallen scavengers and Cabal excavation.'},
    'moon':         {accent:'154,160,168', image:'/astrix-app/shared/locations/moon.jpg',          lore:'Luna. The Hellmouth yawns beneath the Scarlet Keep and the grey dust.'},
    'cosmodrome':   {accent:'170,120,80',  image:'/astrix-app/shared/locations/cosmodrome.jpg',    lore:'Old Russia. Where Guardians first rose among the rusted rockets.'},
    'tower':        {accent:'150,150,160', image:'/astrix-app/shared/locations/tower.jpg',         lore:'The Last City’s bastion. A social space, not a focusable destination.'}
  });
})(globalThis);
