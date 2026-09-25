// Europa marker audit: 25 September 2026. Positions are manual, never Bungie coordinates.
// Dropped candidate labels are audit references only and are never used as rendered markers.
export default {
  "key": "europa",
  "manifestVersion": "244213.26.06.29.2000-1-bnet.65864",
  "checkedAt": "2026-09-25",
  "sources": {
    "DestinyActivityDefinition": {
      "url": "https://www.bungie.net/common/destiny2_content/json/en/DestinyActivityDefinition-a8ba855a-93c7-4014-8f2e-d92357fdfb42.json",
      "sha256": "65ded57ff463042acab202f9e2925ad2d9b719554fcce497c3af7cb7a9281f73"
    },
    "DestinyVendorDefinition": {
      "url": "https://www.bungie.net/common/destiny2_content/json/en/DestinyVendorDefinition-a8ba855a-93c7-4014-8f2e-d92357fdfb42.json",
      "sha256": "97b1447835851f91535edf2d488f225d2027f37c480dc5344cc92551dc4ff8d6"
    },
    "DestinyPlaceDefinition": {
      "url": "https://www.bungie.net/common/destiny2_content/json/en/DestinyPlaceDefinition-a8ba855a-93c7-4014-8f2e-d92357fdfb42.json",
      "sha256": "e0bb49c01604ef0d5a5aaa1a85ad5ce2e242ee4396a186e49ea31dc77f22c50a"
    },
    "DestinyDestinationDefinition": {
      "url": "https://www.bungie.net/common/destiny2_content/json/en/DestinyDestinationDefinition-a8ba855a-93c7-4014-8f2e-d92357fdfb42.json",
      "sha256": "b52f0e0e2b28f1273e4f3058ef6896b6127352e30fb5b0030ed4d4fdb490ec72"
    }
  },
  "checklistAuditSource": "https://www.bungie.net/common/destiny2_content/json/en/DestinyChecklistDefinition-a8ba855a-93c7-4014-8f2e-d92357fdfb42.json",
  "coordinateFrame": {
    "width": 3840,
    "height": 2160,
    "unit": "percent",
    "asset": "europa-director-map-4k.webp",
    "sha256": "2fdbaaed5473330ba7a08d8114c029ed6a7c4895fe53895560471a33d68c7b66"
  },
  "markers": [
    {
      "id": "node-1162322578",
      "type": "raid",
      "name": "Deep Stone Crypt",
      "icon": "/common/destiny2_content/icons/bd7a1fc995f87be96698263bc16698e7.png",
      "variants": [],
      "definition": {
        "table": "DestinyActivityDefinition",
        "hash": 910380154,
        "nameField": "name",
        "iconField": "icon",
        "displayProperties": {
          "name": "Deep Stone Crypt",
          "icon": "/common/destiny2_content/icons/bd7a1fc995f87be96698263bc16698e7.png"
        }
      },
      "position": {
        "x": 50,
        "y": 24,
        "basis": "hand-placed",
        "approximate": true,
        "source": {
          "publisher": "Shacknews / Sam Chandler",
          "url": "https://www.shacknews.com/article/121651/deep-stone-crypt-raid-guide-destiny-2",
          "image": "https://shacknews-www.s3.amazonaws.com/assets/editorial/2020/11/destiny-2-deep-stone-crypt-recommended-power.jpg",
          "sha256": "487e4a6e6dd929b4c37a6e4f9046ce3b27f1ce6dd65d885e88b39f62ed9c1c03",
          "imageSize": [
            2048,
            1152
          ],
          "pixel": [
            1230,
            380
          ],
          "notes": "Director launch node, not a claimed walkable entrance. Hand placed northeast of Eventide and above Asterion, using Riis-Reborn Approach and Eventide outlines as landmarks."
        }
      }
    },
    {
      "id": "location-405582238",
      "type": "vendor",
      "name": "Variks the Loyal",
      "icon": "/common/destiny2_content/icons/5c10e5368ea852046f8f1493d1a3c0a8.png",
      "variants": [],
      "definition": {
        "table": "DestinyVendorDefinition",
        "hash": 2531198101,
        "nameField": "name",
        "iconField": "mapIcon",
        "displayProperties": {
          "name": "Variks the Loyal",
          "mapIcon": "/common/destiny2_content/icons/5c10e5368ea852046f8f1493d1a3c0a8.png"
        }
      },
      "position": {
        "x": 41,
        "y": 70,
        "basis": "hand-placed",
        "approximate": true,
        "source": {
          "publisher": "Windows Central / Brendan Lowry",
          "url": "https://www.windowscentral.com/how-get-secret-europa-loot-chest-destiny-2-beyond-light",
          "image": "https://cdn.mos.cms.futurecdn.net/WvC6Vttbfz2DZ26fNDiNia.jpg",
          "sha256": "3a4bbda2d1b4374008aa705dbec8244affc91888fa9825294fe9b7ccc51c0506",
          "imageSize": [
            2048,
            1152
          ],
          "pixel": [
            958,
            837
          ],
          "notes": "Vendor symbol north of the landing zone at the Charon crossing building. Hand placed against the building and the road junction, not calculated from Bungie coordinates."
        }
      }
    }
  ],
  "dropped": [
    {
      "id": "node-1415671661",
      "candidate": "Darkness's Doorstep",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 3270200327,
          "displayProperties": {
            "name": "Darkness's Doorstep",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-374408126",
      "candidate": "Destiny 2: Beyond Light",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 3076941090,
          "displayProperties": {
            "name": "Destiny 2: Beyond Light",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-785952601",
      "candidate": "Europa Sabotage",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 949315777,
          "displayProperties": {
            "name": "Europa Sabotage",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-1242600699",
      "candidate": "Simulation: Safeguard",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 1262994080,
          "displayProperties": {
            "name": "Simulation: Safeguard",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 3784931086,
          "displayProperties": {
            "name": "Simulation: Agility",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2361093350,
          "displayProperties": {
            "name": "Simulation: Survival",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-4193338934",
      "candidate": "Simulation: Safeguard Heroic",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 3959604832,
          "displayProperties": {
            "name": "Simulation: Safeguard Heroic",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 3360152151,
          "displayProperties": {
            "name": "Simulation: Survival Heroic",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-2086913351",
      "candidate": "The Communion: Normal",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 2463352493,
          "displayProperties": {
            "name": "The Communion: Normal",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 1725925815,
          "displayProperties": {
            "name": "The Communion: Legendary",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-2555789499",
      "candidate": "The Dark Priestess: Advanced",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 2370020739,
          "displayProperties": {
            "name": "The Dark Priestess: Advanced",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2370020738,
          "displayProperties": {
            "name": "The Dark Priestess: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2370020741,
          "displayProperties": {
            "name": "The Dark Priestess: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-1608568536",
      "candidate": "The Technocrat: Advanced",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 2555419880,
          "displayProperties": {
            "name": "The Technocrat: Advanced",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2555419881,
          "displayProperties": {
            "name": "The Technocrat: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2555419886,
          "displayProperties": {
            "name": "The Technocrat: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-2614677575",
      "candidate": "The Warrior: Advanced",
      "type": "activity",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 2994479751,
          "displayProperties": {
            "name": "The Warrior: Advanced",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2994479750,
          "displayProperties": {
            "name": "The Warrior: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2994479745,
          "displayProperties": {
            "name": "The Warrior: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "area-1747045785",
      "candidate": "Asterion Abyss",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1439553579",
      "candidate": "Beyond",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-290285391",
      "candidate": "Bray Exoscience",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2868856804",
      "candidate": "Cadmus Ridge",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2724165023",
      "candidate": "Charon's Crossing",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1142232514",
      "candidate": "Clarity Control",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1375449673",
      "candidate": "Creation",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1894007759",
      "candidate": "Desolation",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-578926554",
      "candidate": "Eternity",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-396959363",
      "candidate": "Eventide Ruins",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1675523467",
      "candidate": "Gale's Watch",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1190179400",
      "candidate": "Glassway",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2854982003",
      "candidate": "Kell's Rising",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2188131170",
      "candidate": "Nexus",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1690293884",
      "candidate": "Rapture",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2912349828",
      "candidate": "Riis-Reborn Approach",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2379681761",
      "candidate": "Technocrat's Iron",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-2575972120",
      "candidate": "Well of Infinitude",
      "type": "area",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "node-925220658",
      "candidate": "Vesper's Host",
      "type": "dungeon",
      "reason": "Activity displayProperties contain only missing_icon_d2.png; no usable manifest icon. No cited hand placement accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 1915770060,
          "displayProperties": {
            "name": "Vesper's Host",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-2680526835",
      "candidate": "Vesper's Host: Normal",
      "type": "dungeon",
      "reason": "Activity displayProperties contain only missing_icon_d2.png; no usable manifest icon. No cited hand placement accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 300092127,
          "displayProperties": {
            "name": "Vesper's Host: Normal",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 4293676253,
          "displayProperties": {
            "name": "Vesper's Host: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "location-3248923090",
      "candidate": "Beyond",
      "type": "landing",
      "reason": "No landing-zone name/icon pair in the four allowed definition displayProperties. LocationDefinition is outside this task's allowed sources.",
      "definitions": []
    },
    {
      "id": "location-1449129642",
      "candidate": "Charon's Crossing",
      "type": "landing",
      "reason": "No landing-zone name/icon pair in the four allowed definition displayProperties. LocationDefinition is outside this task's allowed sources.",
      "definitions": []
    },
    {
      "id": "location-530134044",
      "candidate": "Eventide Ruins",
      "type": "landing",
      "reason": "No landing-zone name/icon pair in the four allowed definition displayProperties. LocationDefinition is outside this task's allowed sources.",
      "definitions": []
    },
    {
      "id": "location-3561601879",
      "candidate": "Darkness's Doorstep",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-1141782482",
      "candidate": "Eramis, Kell of Darkness",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-1717091390",
      "candidate": "Exo Challenge",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-1712070260",
      "candidate": "Phylaks, the Warrior",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-2781680271",
      "candidate": "Praksis, the Technocrat",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-1613064205",
      "candidate": "Public Event (Optional)",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-3907057846",
      "candidate": "Reforging the Past",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-403319292",
      "candidate": "Rising Resistance",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-2454391228",
      "candidate": "Stealing Stasis",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-3935649325",
      "candidate": "The Communion",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "location-612586127",
      "candidate": "The New Kell",
      "type": "location",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": []
    },
    {
      "id": "area-1247760733",
      "candidate": "Bunker E15",
      "type": "lost-sector",
      "reason": "Activity displayProperties contain only missing_icon_d2.png; no usable manifest icon. No cited hand placement accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 1648125538,
          "displayProperties": {
            "name": "Bunker E15: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 3981864035,
          "displayProperties": {
            "name": "Bunker E15: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 3981864036,
          "displayProperties": {
            "name": "Bunker E15: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 1648125541,
          "displayProperties": {
            "name": "Bunker E15: Legend",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "area-4129597795",
      "candidate": "Concealed Void",
      "type": "lost-sector",
      "reason": "Activity displayProperties contain only missing_icon_d2.png; no usable manifest icon. No cited hand placement accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 912873274,
          "displayProperties": {
            "name": "Concealed Void: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 912873277,
          "displayProperties": {
            "name": "Concealed Void: Legend",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 4044885806,
          "displayProperties": {
            "name": "Concealed Void: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 4044885801,
          "displayProperties": {
            "name": "Concealed Void: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "area-3723853248",
      "candidate": "Perdition",
      "type": "lost-sector",
      "reason": "Activity displayProperties contain only missing_icon_d2.png; no usable manifest icon. No cited hand placement accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 1070981425,
          "displayProperties": {
            "name": "Perdition: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 1962464162,
          "displayProperties": {
            "name": "Perdition: Master",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 1962464165,
          "displayProperties": {
            "name": "Perdition: Expert",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 1070981430,
          "displayProperties": {
            "name": "Perdition: Legend",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "node-1043740986",
      "candidate": "The Glassway",
      "type": "strike",
      "reason": "No complete allowed definition and cited hand placement; legacy graph coordinates are not accepted.",
      "definitions": [
        {
          "table": "DestinyActivityDefinition",
          "hash": 3965479856,
          "displayProperties": {
            "name": "The Glassway",
            "icon": "/common/destiny2_content/icons/3642cf9e2acd174dcab5b5f9e3a3a45d.png",
            "hasIcon": true
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2226120409,
          "displayProperties": {
            "name": "The Glassway",
            "icon": "/common/destiny2_content/icons/3642cf9e2acd174dcab5b5f9e3a3a45d.png",
            "hasIcon": true
          }
        },
        {
          "table": "DestinyActivityDefinition",
          "hash": 2930649307,
          "displayProperties": {
            "name": "The Glassway",
            "icon": "/img/misc/missing_icon_d2.png",
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "location-1070597417",
      "candidate": "Campsite",
      "type": "vendor",
      "reason": "No inspected Director screenshot with a hand-placed position accepted.",
      "definitions": [
        {
          "table": "DestinyVendorDefinition",
          "hash": 2744903348,
          "displayProperties": {
            "name": "Campsite",
            "mapIcon": "/common/destiny2_content/icons/0517d3652040b815f6c4eed4a6d8fc39.png",
            "icon": "/common/destiny2_content/icons/b4771bc3d2408158bfefc5636155542b.png",
            "hasIcon": true
          }
        }
      ]
    },
    {
      "id": "location-1998167324",
      "candidate": "Exo Stranger",
      "type": "vendor",
      "reason": "No inspected Director screenshot with a hand-placed position accepted.",
      "definitions": [
        {
          "table": "DestinyVendorDefinition",
          "hash": 4254652401,
          "displayProperties": {
            "name": "Exo Stranger",
            "mapIcon": "/common/destiny2_content/icons/84aa95fcc37b4073812116738e68ad89.png",
            "icon": null,
            "hasIcon": false
          }
        }
      ]
    },
    {
      "id": "chest-1697465175-3888342093",
      "candidate": "82. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 3888342093
    },
    {
      "id": "chest-1697465175-201955226",
      "candidate": "83. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 201955226
    },
    {
      "id": "chest-1697465175-763777083",
      "candidate": "84. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 763777083
    },
    {
      "id": "chest-1697465175-2131720755",
      "candidate": "85. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 2131720755
    },
    {
      "id": "chest-1697465175-3206775572",
      "candidate": "86. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 3206775572
    },
    {
      "id": "chest-1697465175-260886981",
      "candidate": "87. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 260886981
    },
    {
      "id": "chest-1697465175-1636954546",
      "candidate": "88. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 1636954546
    },
    {
      "id": "chest-1697465175-995760197",
      "candidate": "89. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 995760197
    },
    {
      "id": "chest-1697465175-3941648788",
      "candidate": "90. Europa",
      "type": "chest",
      "reason": "Checklist name is an audit reference only, not an allowed marker-name source. No allowed definition icon or cited position.",
      "checklistHash": 1697465175,
      "entryHash": 3941648788
    }
  ]
};
