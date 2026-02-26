export interface Scene {
  id: number;
  file: string;
  displayName: string;
  color: string;
  isDefault: boolean;
  textColor: string;
  shadowColor: string;
  credit: string;
}

function computeTextColor(hex: string): { textColor: string; shadowColor: string } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const isLight = r * 0.299 + g * 0.587 + b * 0.114 > 186;
  return {
    textColor: isLight ? '#333333' : '#ffffff',
    shadowColor: isLight ? '#ffffff' : '#000000',
  };
}

const SCENE_DATA: Array<{ id: number; credit: string; file: string; isDefault: boolean; displayName: string; color: string }> = [
  { id: 1, credit: 'Windows Live Messenger Team', file: 'default.png', isDefault: true, displayName: 'Default', color: '#3bb2ea' },
  { id: 2, credit: 'Windows Live Messenger Team', file: 'MesmerizingWhite.png', isDefault: false, displayName: 'Mesmerizing White', color: '#ffffff' },
  { id: 3, credit: 'Windows Live Messenger Team', file: '0001.png', isDefault: false, displayName: 'Daisy Hill', color: '#96e2f0' },
  { id: 4, credit: 'Windows Live Messenger Team', file: '0007.png', isDefault: false, displayName: 'Field', color: '#fbaf2e' },
  { id: 5, credit: 'Windows Live Messenger Team', file: 'Silhouette.png', isDefault: false, displayName: 'Silhouette', color: '#f39b36' },
  { id: 6, credit: 'Windows Live Messenger Team', file: 'Morty.png', isDefault: false, displayName: 'Morty', color: '#c6dbdf' },
  { id: 7, credit: 'Windows Live Messenger Team', file: '0006.png', isDefault: false, displayName: 'Dawn', color: '#7ba2d3' },
  { id: 8, credit: 'Windows Live Messenger Team', file: 'zune_02.png', isDefault: false, displayName: 'zune_02', color: '#de96b3' },
  { id: 9, credit: 'Windows Live Messenger Team', file: 'DottieGreen.png', isDefault: false, displayName: 'Dottie Green', color: '#97d732' },
  { id: 10, credit: 'Windows Live Messenger Team', file: '0004.png', isDefault: false, displayName: 'Violet Springtime', color: '#663c92' },
  { id: 11, credit: 'Windows Live Messenger Team', file: '0003.png', isDefault: false, displayName: 'Cherry Blossoms', color: '#fbdbd9' },
  { id: 12, credit: 'Windows Live Messenger Team', file: 'zune_05.png', isDefault: false, displayName: 'zune_05', color: '#252222' },
  { id: 13, credit: 'Windows Live Messenger Team', file: 'zune_01.png', isDefault: false, displayName: 'zune_01', color: '#931075' },
  { id: 14, credit: 'Windows Live Messenger Team', file: '0005.png', isDefault: false, displayName: 'Flourish', color: '#d30563' },
  { id: 15, credit: 'Windows Live Messenger Team', file: 'CarbonFiber.png', isDefault: false, displayName: 'Carbon Fiber', color: '#010101' },
  { id: 16, credit: 'Windows Live Messenger Team', file: 'Robot.png', isDefault: false, displayName: 'Robot', color: '#374c5d' },
  { id: 17, credit: 'Windows Live Messenger Team', file: 'Graffiti.png', isDefault: false, displayName: 'Graffiti', color: '#eae7e2' },
  { id: 18, credit: 'Windows Live Messenger Team', file: '0002.png', isDefault: false, displayName: 'Bamboo', color: '#93cb1b' },
  { id: 19, credit: 'Windows Live Messenger Team', file: 'zune_06.png', isDefault: false, displayName: 'zune_06', color: '#f4b7cc' },
  { id: 20, credit: 'Windows Live Messenger Team', file: 'zune_04.png', isDefault: false, displayName: 'zune_04', color: '#000000' },
  { id: 21, credit: 'Windows Live Messenger Team', file: '0008.png', isDefault: false, displayName: 'Mesmerizing Brown', color: '#614040' },
  { id: 22, credit: 'Windows Live Messenger Team', file: 'zune_03.png', isDefault: false, displayName: 'zune_03', color: '#832727' },
  { id: 23, credit: 'Windows Live Messenger Team', file: 'ButterflyPattern.png', isDefault: false, displayName: 'Butterfly Pattern', color: '#575757' },
  { id: 24, credit: 'Microsoft', file: 'BetaFish.png', isDefault: false, displayName: 'Beta Fish', color: '#24b3ce' },
  { id: 25, credit: 'Microsoft', file: 'Halo.png', isDefault: false, displayName: 'Halo', color: '#a13d12' },
  { id: 26, credit: 'maverik', file: 'Floral.png', isDefault: false, displayName: 'Floral', color: '#f9aed4' },
  { id: 27, credit: 'maverik', file: 'HelloKitty.png', isDefault: false, displayName: 'Hello Kitty', color: '#f4a1cb' },
  { id: 28, credit: 'supra', file: 'Caustics.jpg', isDefault: false, displayName: 'Caustics', color: '#265080' },
  { id: 29, credit: 'daftendirjerrekt909', file: 'XboxGrunge.png', isDefault: false, displayName: 'Xbox Grunge', color: '#829d4e' },
  { id: 30, credit: 'C418/vadimos', file: 'VolumeBeta.png', isDefault: false, displayName: 'Volume Beta', color: '#000001' },
  { id: 34, credit: 'CallyHam', file: 'Harmony.png', isDefault: false, displayName: 'Harmony', color: '#32b4f5' },
  { id: 36, credit: 'alexander', file: 'Bliss.png', isDefault: false, displayName: 'Bliss', color: '#84aaf3' },
  { id: 38, credit: 'supra', file: 'LiveLights.png', isDefault: false, displayName: 'Live Lights', color: '#1da840' },
  { id: 79, credit: 'StuxDek', file: 'Aerochat.png', isDefault: false, displayName: 'Aerochat', color: '#A2CEEF' },
];

const SCENES: Scene[] = SCENE_DATA.map(s => {
  const { textColor, shadowColor } = computeTextColor(s.color);
  return { ...s, textColor, shadowColor };
});

class ThemeService {
  private static _instance: ThemeService;
  private _scenes: Scene[] = SCENES;
  private _currentScene: Scene;

  private constructor() {
    this._currentScene = this._scenes.find(s => s.isDefault) || this._scenes[0];
  }

  static get instance(): ThemeService {
    if (!ThemeService._instance) {
      ThemeService._instance = new ThemeService();
    }
    return ThemeService._instance;
  }

  get scenes(): Scene[] {
    return this._scenes;
  }

  get currentScene(): Scene {
    return this._currentScene;
  }

  setScene(id: number): void {
    const scene = this._scenes.find(s => s.id === id);
    if (scene) {
      this._currentScene = scene;
    }
  }

  sceneFromBannerColor(hex: string | null): Scene {
    if (!hex) return this._scenes.find(s => s.isDefault) || this._scenes[0];

    const match = this._scenes.find(s => s.color.toLowerCase() === hex.toLowerCase());
    if (match) return match;

    const defaultScene = this._scenes.find(s => s.isDefault) || this._scenes[0];
    const { textColor, shadowColor } = computeTextColor(hex);
    return {
      ...defaultScene,
      color: hex,
      textColor,
      shadowColor,
    };
  }
}

export const themeService = ThemeService.instance;
