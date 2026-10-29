export type JellyFlavourKey = 'lime' | 'curacao' | 'blackcurrant';

export interface JellyFlavourSpec {
  key: JellyFlavourKey;
  label: string;
  subtitle: string;
  shallowHex: string;
  deepHex: string;
  causticHex: string;
  specularHex: string;
  swatchGradient: string;
  ior: number;
  absorptionScale: number;
}

export const JELLY_FLAVOURS: Record<JellyFlavourKey, JellyFlavourSpec> = {
  lime: {
    key: 'lime',
    label: 'Lime',
    subtitle: 'Emerald Citrus Gel',
    shallowHex: '#7efce0',
    deepHex: '#24c49b',
    causticHex: '#dcfff4',
    specularHex: '#ffffff',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #b3ffe4 0%, #2dd49e 50%, #0b6e4f 100%)',
    ior: 1.385,
    absorptionScale: 1.05,
  },
  curacao: {
    key: 'curacao',
    label: 'Curaçao',
    subtitle: 'Azure Laraha Gel',
    shallowHex: '#7ce2ff',
    deepHex: '#188cf2',
    causticHex: '#dff7ff',
    specularHex: '#ffffff',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #b8efff 0%, #1ea8f5 50%, #074782 100%)',
    ior: 1.392,
    absorptionScale: 1.12,
  },
  blackcurrant: {
    key: 'blackcurrant',
    label: 'Blackcurrant',
    subtitle: 'Cassis Ribes Gel',
    shallowHex: '#df9eff',
    deepHex: '#842ce0',
    causticHex: '#f8e0ff',
    specularHex: '#ffffff',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #f0c4ff 0%, #a23df0 50%, #420b6e 100%)',
    ior: 1.404,
    absorptionScale: 1.24,
  },
};

export const SCENE_PALETTE = {
  dayBackground: '#e6e8ea',
  dayFloor: '#e3e5e8',
  stormBackground: '#181e29',
  stormFloor: '#141923',
  sandDry: '#ede5d2',
  sandWet: '#d8ccb4',
  strataTop: '#f2eee6',
  strataMidA: '#dfd5c3',
  strataMidB: '#c9bba3',
  strataDeep: '#9e9283',
  strataBedrock: '#786e62',
  concreteLight: '#dcdad3',
  concreteDark: '#8c8a84',
  asphalt: '#373a40',
  hangarWall: '#f1f2f4',
  hangarRoof: '#e2e6ec',
  hangarTrim: '#94a3b8',
  towerRed: '#d93829',
  towerWhite: '#f5f4f0',
  craneYellow: '#eab308',
  bargeHull: '#272c35',
  bargeDeck: '#3b424f',
  bargeMarkings: '#f8fafc',
  tugHull: '#dc2626',
  tugCabin: '#ffffff',
  fairingBoatHull: '#2563eb',
  fairingNet: '#334155',
  rocketBody: '#f8f8f6',
  rocketInterstage: '#1b1f27',
  rocketSoot: '#2b2927',
  flameCore: '#fffdf2',
  flameMid: '#ff9d2e',
  flameOuter: '#e03c1f',
  coralPink: '#e06d53',
  coralGold: '#eab308',
  coralViolet: '#a855f7',
  kelpGreen: '#1f6f54',
  palmTrunk: '#785f47',
  palmLeaf: '#558b44',
} as const;
