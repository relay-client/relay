export type AppThemeMode = 'system' | 'dark' | 'light';
export type ResolvedAppTheme = 'dark' | 'light';

export type LightThemeVariantId =
  | 'light'
  | 'light-monochrome'
  | 'light-pastel'
  | 'catppuccin-latte'
  | 'vscode-light';

export type DarkThemeVariantId =
  | 'dark'
  | 'dark-monochrome'
  | 'dark-pastel'
  | 'catppuccin-frappe'
  | 'catppuccin-macchiato'
  | 'catppuccin-mocha'
  | 'nord'
  | 'vscode-dark';

export type ThemeVariantId = LightThemeVariantId | DarkThemeVariantId;

export type AppTheme = {
  mode: AppThemeMode;
  light: LightThemeVariantId;
  dark: DarkThemeVariantId;
};

export type ThemeVariant = {
  id: ThemeVariantId;
  mode: ResolvedAppTheme;
  name: string;
  preview: {
    background: string;
    surface: string;
    rail: string;
    border: string;
    accent: string;
    text: string;
  };
};

export const THEME_KEY = 'relay.theme.v2';
const LEGACY_THEME_KEY = 'relay.theme.v1';

export const DEFAULT_THEME_SETTINGS: AppTheme = {
  mode: 'system',
  light: 'light',
  dark: 'dark',
};

export const THEME_VARIANTS: ThemeVariant[] = [
  {
    id: 'light',
    mode: 'light',
    name: 'Light',
    preview: { background: '#ffffff', surface: '#f8f8f8', rail: '#f1f1f1', border: '#cccccc', accent: '#4a55d4', text: '#343434' },
  },
  {
    id: 'light-monochrome',
    mode: 'light',
    name: 'Light Monochrome',
    preview: { background: '#ffffff', surface: '#f8f8f8', rail: '#eaeaea', border: '#cbcbcb', accent: '#525252', text: '#343434' },
  },
  {
    id: 'light-pastel',
    mode: 'light',
    name: 'Light Pastel',
    preview: { background: '#fdfaf7', surface: '#f7f4ef', rail: '#e2dbd1', border: '#d3cabc', accent: '#d16c6c', text: '#2b2f3a' },
  },
  {
    id: 'catppuccin-latte',
    mode: 'light',
    name: 'Catppuccin Latte',
    preview: { background: '#eff1f5', surface: '#e6e9ef', rail: '#ccd0da', border: '#acb0be', accent: '#8839ef', text: '#4c4f69' },
  },
  {
    id: 'vscode-light',
    mode: 'light',
    name: 'VS Code Light',
    preview: { background: '#ffffff', surface: '#f3f3f3', rail: '#dddddd', border: '#cecece', accent: '#007acc', text: '#000000' },
  },
  {
    id: 'dark',
    mode: 'dark',
    name: 'Dark',
    preview: { background: '#1a1a1a', surface: '#222224', rail: '#333333', border: '#444444', accent: '#5865f2', text: '#cccccc' },
  },
  {
    id: 'dark-monochrome',
    mode: 'dark',
    name: 'Dark Monochrome',
    preview: { background: '#1e1e1e', surface: '#252526', rail: '#3D3D3D', border: '#444444', accent: '#a3a3a3', text: '#d4d4d4' },
  },
  {
    id: 'dark-pastel',
    mode: 'dark',
    name: 'Dark Pastel',
    preview: { background: '#1a1625', surface: '#1f1a2e', rail: '#352e4d', border: '#453d5c', accent: '#f0a6ca', text: '#e8e0f0' },
  },
  {
    id: 'catppuccin-frappe',
    mode: 'dark',
    name: 'Catppuccin Frappé',
    preview: { background: '#303446', surface: '#292c3c', rail: '#414559', border: '#626880', accent: '#ca9ee6', text: '#c6d0f5' },
  },
  {
    id: 'catppuccin-macchiato',
    mode: 'dark',
    name: 'Catppuccin Macchiato',
    preview: { background: '#24273a', surface: '#1e2030', rail: '#363a4f', border: '#5b6078', accent: '#c6a0f6', text: '#cad3f5' },
  },
  {
    id: 'catppuccin-mocha',
    mode: 'dark',
    name: 'Catppuccin Mocha',
    preview: { background: '#1e1e2e', surface: '#181825', rail: '#313244', border: '#585b70', accent: '#cba6f7', text: '#cdd6f4' },
  },
  {
    id: 'nord',
    mode: 'dark',
    name: 'Nord',
    preview: { background: '#2e3440', surface: '#3b4252', rail: '#434c5e', border: '#4c566a', accent: '#88c0d0', text: '#d8dee9' },
  },
  {
    id: 'vscode-dark',
    mode: 'dark',
    name: 'VS Code Dark',
    preview: { background: '#1e1e1e', surface: '#252526', rail: '#3c3c3c', border: '#454545', accent: '#007acc', text: '#d4d4d4' },
  },
];

export const LIGHT_THEME_VARIANTS = THEME_VARIANTS.filter((variant): variant is ThemeVariant & { id: LightThemeVariantId; mode: 'light' } => variant.mode === 'light');
export const DARK_THEME_VARIANTS = THEME_VARIANTS.filter((variant): variant is ThemeVariant & { id: DarkThemeVariantId; mode: 'dark' } => variant.mode === 'dark');

const LIGHT_THEME_IDS = new Set<ThemeVariantId>(LIGHT_THEME_VARIANTS.map(variant => variant.id));
const DARK_THEME_IDS = new Set<ThemeVariantId>(DARK_THEME_VARIANTS.map(variant => variant.id));
const THEME_VARIANT_BY_ID = new Map<ThemeVariantId, ThemeVariant>(THEME_VARIANTS.map(variant => [variant.id, variant]));

function isAppThemeMode(value: unknown): value is AppThemeMode {
  return value === 'system' || value === 'dark' || value === 'light';
}

function isLightThemeVariant(value: unknown): value is LightThemeVariantId {
  return typeof value === 'string' && LIGHT_THEME_IDS.has(value as ThemeVariantId);
}

function isDarkThemeVariant(value: unknown): value is DarkThemeVariantId {
  return typeof value === 'string' && DARK_THEME_IDS.has(value as ThemeVariantId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeThemeSettings(input: unknown): AppTheme {
  if (isAppThemeMode(input)) {
    return { ...DEFAULT_THEME_SETTINGS, mode: input };
  }
  if (!isRecord(input)) return { ...DEFAULT_THEME_SETTINGS };
  return {
    mode: isAppThemeMode(input.mode) ? input.mode : DEFAULT_THEME_SETTINGS.mode,
    light: isLightThemeVariant(input.light) ? input.light : DEFAULT_THEME_SETTINGS.light,
    dark: isDarkThemeVariant(input.dark) ? input.dark : DEFAULT_THEME_SETTINGS.dark,
  };
}

export function systemTheme(): ResolvedAppTheme {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readStoredAppTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return normalizeThemeSettings(JSON.parse(stored));
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    const migrated = normalizeThemeSettings(legacy);
    if (legacy) localStorage.setItem(THEME_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {}
  return { ...DEFAULT_THEME_SETTINGS };
}

export function resolveAppTheme(settings: AppTheme): ResolvedAppTheme {
  return settings.mode === 'system' ? systemTheme() : settings.mode;
}

export function themeVariantFor(settings: AppTheme, resolvedAppTheme = resolveAppTheme(settings)): ThemeVariant {
  const id = resolvedAppTheme === 'light' ? settings.light : settings.dark;
  return THEME_VARIANT_BY_ID.get(id) ?? THEME_VARIANT_BY_ID.get(DEFAULT_THEME_SETTINGS[resolvedAppTheme])!;
}

export function applyDocumentTheme(settings: AppTheme = readStoredAppTheme()) {
  const appTheme = normalizeThemeSettings(settings);
  const resolvedAppTheme = resolveAppTheme(appTheme);
  const themeVariant = themeVariantFor(appTheme, resolvedAppTheme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolvedAppTheme;
    document.documentElement.dataset.themeVariant = themeVariant.id;
    document.documentElement.style.colorScheme = resolvedAppTheme;
  }
  return { appTheme, resolvedAppTheme, themeVariant };
}

export function syncNativeThemeBackground(resolvedAppTheme: ResolvedAppTheme, themeVariant = themeVariantFor(DEFAULT_THEME_SETTINGS, resolvedAppTheme)) {
  const hex = themeVariant.preview.background.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  try {
    if (resolvedAppTheme === 'dark') window.runtime?.WindowSetDarkTheme?.();
    else window.runtime?.WindowSetLightTheme?.();
    window.runtime?.WindowSetBackgroundColour?.(r, g, b, 255);
    void window.go?.api?.App?.SetAppThemeBackground?.(resolvedAppTheme, themeVariant.preview.background);
  } catch {}
}

export const initialThemeState = applyDocumentTheme();
