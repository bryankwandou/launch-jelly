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
    shallowHex: '#4bf5c1',
    deepHex: '#0d7a5b',
    causticHex: '#b8ffe7',
    specularHex: '#f0fff9',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #b3ffe4 0%, #2dd49e 50%, #0b6e4f 100%)',
    ior: 1.385,
    absorptionScale: 1.05,
  },
  curacao: {
    key: 'curacao',
    label: 'Curaçao',
    subtitle: 'Azure Laraha Gel',
    shallowHex: '#3ecbff',
    deepHex: '#08518f',
    causticHex: '#baf0ff',
    specularHex: '#f0faff',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #b8efff 0%, #1ea8f5 50%, #074782 100%)',
    ior: 1.392,
    absorptionScale: 1.12,
  },
  blackcurrant: {
    key: 'blackcurrant',
    label: 'Blackcurrant',
    subtitle: 'Cassis Ribes Gel',
    shallowHex: '#c266ff',
    deepHex: '#4b0f7a',
    causticHex: '#f3c7ff',
    specularHex: '#fcf2ff',
    swatchGradient: 'radial-gradient(circle at 34% 28%, #f0c4ff 0%, #a23df0 50%, #420b6e 100%)',
    ior: 1.404,
    absorptionScale: 1.24,
  },
};

export const SCENE_PALETTE = {
  dayBackground: '#e6e8ea',
  dayFloor: '#e2e4e7',
  stormBackground: '#181e29',
  stormFloor: '#141923',
  sandDry: '#e8dfc8',
  sandWet: '#cdbda0',
  strataTop: '#e8e2d5',
  strataMidA: '#d2c0a0',
  strataMidB: '#b89972',
  strataDeep: '#786c61',
  strataBedrock: '#47423c',
  concreteLight: '#d2cfc8',
  concreteDark: '#8c8a84',
  asphalt: '#373a40',
  hangarWall: '#eceae4',
  hangarRoof: '#334155',
  hangarTrim: '#1e293b',
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
  palmLeaf: '#4d7c3f',
} as const;
