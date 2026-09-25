// Public content debut order, not manifest visibility dates or player activity.
// Names identify Bungie activities; notes and ordering code are original.
// Variants of a mission share its debut order. Featured Pantheon encounters share
// their June 16, 2026 direct-launch release wave; later weekly rotations do not
// reorder the catalogue. The two launch gauntlets precede the June 13 full gauntlet.
export const RELEASE_ORDER_VERSION = '20260925-1';
export const RELEASE_SOURCES = [
  'https://help.bungie.net/hc/en-us/articles/4408041224852-Years-of-Destiny',
  'https://www.bungie.net/7/en/News/Article/twid_09_25_2025',
  'https://www.bungie.net/7/en/News/Article/twid_10_02_2025',
  'https://www.bungie.net/7/en/News/Article/renegades_launch_blog',
  'https://www.bungie.net/7/en/News/Article/twid_06_11_2026',
  'https://help.bungie.net/hc/en-us/articles/39007140765204-Destiny-2-Known-Issues-and-Vital-Information'
];
// Oldest to newest within each series; equal ranks denote the same release wave.
export const RELEASE_ORDER: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  raids: {
    'Leviathan': 1, 'Leviathan, Eater of Worlds': 2, 'Leviathan, Spire of Stars': 3,
    'Last Wish': 4, 'Scourge of the Past': 5, 'Crown of Sorrow': 6,
    'Garden of Salvation': 7, 'Deep Stone Crypt': 8, 'Vault of Glass': 9,
    'Vow of the Disciple': 10, "King's Fall": 11, 'Root of Nightmares': 12,
    "Crota's End": 13, 'The Pantheon: Atraks Sovereign': 14,
    'The Pantheon: Oryx Exalted': 15, 'The Pantheon: Rhulk Indomitable': 16,
    'The Pantheon: Nezarec Sublime': 17, "Salvation's Edge": 18,
    'The Desert Perpetual': 19, 'The Desert Perpetual (Epic)': 20,
    'Pantheon: Calus Resplendent': 21, 'Pantheon: Morgeth Surpassing': 21,
    'Pantheon: Insurrection Prime Revolutionary': 22,
    'Featured Reprise: Argos: The Pantheon': 23,
    'Featured Reprise: Calus: The Pantheon': 23,
    'Featured Reprise: Gahlran: The Pantheon': 23,
    'Featured Encore: Consecrated Mind: The Pantheon': 23,
    'Featured Encore: Insurrection Prime: The Pantheon': 23,
    'Featured Encore: Morgeth: The Pantheon': 23,
    'Featured Encore: Warpriest: The Pantheon': 23
  },
  dungeons: {
    'The Shattered Throne': 1, 'Pit of Heresy': 2, 'Prophecy': 3,
    'Grasp of Avarice': 4, 'Duality': 5, 'Spire of the Watcher': 6,
    'Ghosts of the Deep': 7, "Warlord's Ruin": 8, "Vesper's Host": 9,
    'Sundered Doctrine': 10, 'Equilibrium': 11
  },
  exotic: {
    'The Whisper': 1, 'Zero Hour': 2, 'Harbinger': 3, 'Presage': 4,
    'Vox Obscura': 5, "Operation: Seraph's Shield": 6,
    '//node.ovrd.AVALON//': 7, 'Starcrossed': 8, 'Dual Destiny': 9,
    'Encore': 10, 'Encore: Overture': 10, 'Encore: Concerto': 10, 'Encore: Coda': 10,
    "Kell's Fall": 11, "Kell's Fall: Diffraction": 11,
    "Kell's Fall: Distortion": 11, "Kell's Fall: Reflection": 11,
    'Derealize': 12, 'Heliostat': 13,
    'Oblation': 14, 'Oblation: Bloodline': 14, 'Oblation: Immolation': 14, 'Oblation: Soulfed': 14
  }
};
export function releaseOrder(series: string, name: string): number | null {
  return RELEASE_ORDER[series]?.[name] ?? null;
}
