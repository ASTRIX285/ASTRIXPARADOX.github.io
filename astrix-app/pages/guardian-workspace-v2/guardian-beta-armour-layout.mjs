function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function iconMarkup(item,label){
  const icon=String(item?.icon ?? "").trim();

  if(!icon){
    return '<span class="beta-slot-glyph">◇</span>';
  }

  return `<img src="${esc(icon)}" alt="${esc(label)}" title="${esc(label)}" onerror="this.style.display='none'">`;
}

function modSlot(mod){
  if(!mod){
    return `
      <div
        class="beta-armour-mod-slot empty"
        title="Empty armour mod slot"
        aria-label="Empty armour mod slot"
      >
        <span class="beta-slot-glyph">◇</span>
      </div>
    `;
  }

  const name=mod.name ?? `Destiny mod ${mod.hash ?? ""}`;
  const description=mod.description ?? "";
  const hash=mod.bungieHash ?? mod.hash ?? "";

  return `
    <div
      class="beta-armour-mod-slot filled"
      title="${esc(name)}${description ? ` — ${esc(description)}` : ""}"
      data-mod-hash="${esc(hash)}"
      aria-label="${esc(name)}"
    >
      ${iconMarkup(mod,name)}
    </div>
  `;
}

function clearTraitState(card){
  card.classList.remove("has-beta-exotic-trait");
  card.querySelector(".beta-exotic-trait-inline")?.remove();

  card.querySelectorAll(".beta-primary-armour-image")
    .forEach(img=>img.classList.remove("beta-primary-armour-image"));
}

function renderExoticTraitInline(card,item){
  clearTraitState(card);

  const trait=item?.intrinsicTrait;
  if(!trait)return;

  const name=trait.name ?? "Exotic intrinsic trait";
  const description=trait.description ?? "";
  const hash=trait.bungieHash ?? trait.hash ?? "";

  const armourImage=card.querySelector("img");

  if(armourImage){
    armourImage.classList.add("beta-primary-armour-image");
  }

  card.classList.add("has-beta-exotic-trait");

  const traitButton=document.createElement("button");
  traitButton.type="button";
  traitButton.className="beta-exotic-trait-inline";
  traitButton.dataset.traitHash=String(hash);

  traitButton.title=[
    name,
    description,
    hash ? `Bungie hash: ${hash}` : ""
  ].filter(Boolean).join(" — ");

  traitButton.setAttribute(
    "aria-label",
    description ? `${name}. ${description}` : name
  );

  traitButton.innerHTML=iconMarkup(trait,name);

  card.appendChild(traitButton);
}

function renderArmourDetails(armour=[]){
  const cards=[
    ...document.querySelectorAll(".arm-grid .arm")
  ];

  cards.forEach((card,index)=>{
    const item=armour[index] ?? null;

    card.querySelector(".beta-armour-functional")?.remove();
    clearTraitState(card);

    if(!item)return;

    const isExotic=Boolean(item?.intrinsicTrait);
    const slotCount=isExotic ? 5 : 6;

    renderExoticTraitInline(card,item);

    const mods=[...(item.mods ?? [])];

    while(mods.length<slotCount){
      mods.push(null);
    }

    const functional=document.createElement("div");
    functional.className="beta-armour-functional";

    functional.innerHTML=`
      <div class="beta-armour-mod-heading">
        <span>ARMOUR MODS</span>
        <small>${slotCount} SLOTS</small>
      </div>

      <div class="beta-armour-mod-grid ${isExotic ? "is-exotic" : ""}">
        ${mods
          .slice(0,slotCount)
          .map(modSlot)
          .join("")}
      </div>
    `;

    card.appendChild(functional);
  });
}

function receiveGuardian(detail){
  const armour=Array.isArray(detail?.armour)
    ? detail.armour
    : [];

  requestAnimationFrame(()=>{
    renderArmourDetails(armour);
  });
}

document.addEventListener(
  "forge:guardian-selection-changed",
  event=>receiveGuardian(event.detail)
);

document.addEventListener(
  "forge:beta-fixture-loaded",
  event=>receiveGuardian(event.detail)
);
