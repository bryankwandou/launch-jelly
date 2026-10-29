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
    shallowHex: '#3bf2b8',
    deepHex: '#0a5e46',
    causticHex: '#a7ffdf',
    specularHex: '#ecfff8',
    swatchGradient: 'radial-gradient(circle at 32% 28%, #98ffdc 0%, #24d49a 52%, #076348 100%)',
    ior: 1.385,
    absorptionScale: 1.05,
  },
  curacao: {
    key: 'curacao',
    label: 'Curaçao',
    subtitle: 'Azure Laraha Gel',
    shallowHex: '#38c8ff',
    deepHex: '#074378',
    causticHex: '#aeeaff',
    specularHex: '#eefaff',
    swatchGradient: 'radial-gradient(circle at 32% 28%, #a6e9ff 0%, #1ca8f5 52%, #063d73 100%)',
    ior: 1.392,
    absorptionScale: 1.12,
  },
  blackcurrant: {
    key: 'blackcurrant',
    label: 'Blackcurrant',
    subtitle: 'Cassis Ribes Gel',
    shallowHex: '#b85cff',
    deepHex: '#3b0a63',
    causticHex: '#eebaff',
    specularHex: '#fbf0ff',
    swatchGradient: 'radial-gradient(circle at 32% 28%, #e9b8ff 0%, #9b38eb 52%, #390861 100%)',
    ior: 1.404,
    absorptionScale: 1.24,
  },
};

export const SCENE_PALETTE = {
  dayBackground: '#eceae4',
  dayFloor: '#e5e2da',
  stormBackground: '#181e29',
  stormFloor: '#141923',
  sandDry: '#dfd1b4',
  sandWet: '#b7a382',
  strataTop: '#c4b496',
  strataMidA: '#a68c6d',
  strataMidB: '#8e7358',
  strataDeep: '#61564a',
  strataBedrock: '#433f3b',
  concreteLight: '#d8d5ce',
  concreteDark: '#8c8a84',
  asphalt: '#373a40',
  hangarWall: '#e6e4de',
  hangarRoof: '#334155',
  hangarTrim: '#1e293b',
  towerRed: '#c83a2b',
  towerWhite: '#f1efe9',
  craneYellow: '#d98a1c',
  bargeHull: '#1f2630',
  bargeDeck: '#2d3642',
  bargeMarkings: '#e8e6df',
  tugHull: '#24303f',
  tugCabin: '#f0ede6',
  fairingBoatHull: '#1d4ed8',
  fairingNet: '#eab308',
  rocketBody: '#f7f7f5',
  rocketInterstage: '#1b1e24',
  rocketSoot: '#2b2927',
  flameCore: '#fffdf2',
  flameMid: '#ff9d2e',
  flameOuter: '#e03c1f',
  coralPink: '#e06d53',
  coralGold: '#d99b26',
  coralViolet: '#8b5cf6',
  kelpGreen: '#1f6f54',
  palmTrunk: '#6e553e',
  palmLeaf: '#3b6e38',
} as const;
