const TOOL_INTROS=Object.freeze({
  'destiny-2':Object.freeze({
    id:'destiny-2',
    gameName:'Destiny 2',
    developerName:'Bungie',
    eyebrow:'DESTINY 2 GUARDIAN FORGE',
    title:'Guardian Journey',
    purpose:"Forge prepares your Bungie data so it can understand your Guardian's journey so far in Destiny 2. Journey brings your characters, gear, progress and activity together in one place.",
    limitations:'Forge can only use the account and game records Bungie provides. Missing or delayed records remain unavailable until Bungie returns them.',
    ctaLabel:'ENTER FORGE',
    loadingLabel:'Forge is preparing your Guardian data and opening Journey.',
    keyArt:'/img/games/D2_JB.jpg',
    keyArtAlt:'Destiny 2 key art featuring the Traveler',
    developerLogo:'/img/brands/bungie-logo.svg',
    developerLogoAlt:'Bungie',
    disclaimer:'ASTRIX PARADOX is not officially affiliated with Bungie.'
  })
});

function toolIntroConfig(gameId){return TOOL_INTROS[gameId]||null;}

export {TOOL_INTROS,toolIntroConfig};
