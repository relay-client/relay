import { writable } from 'svelte/store';

export const UI_SCALE_STORAGE_KEY = 'relay.uiScale.v1';
export const UI_SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const DEFAULT_UI_SCALE = 1;
export const ROOT_FONT_PX = 16;

let currentScale = DEFAULT_UI_SCALE;
export const uiScale = writable(DEFAULT_UI_SCALE);

export function currentUiScale(): number {
  return currentScale;
}

export function normalizeUiScale(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_UI_SCALE;
  return UI_SCALE_STEPS.reduce((best, step) => (Math.abs(step - parsed) < Math.abs(best - parsed) ? step : best), DEFAULT_UI_SCALE);
}

export function stepUiScale(current: number, direction: 1 | -1): number {
  const index = UI_SCALE_STEPS.indexOf(normalizeUiScale(current) as (typeof UI_SCALE_STEPS)[number]);
  const next = Math.min(UI_SCALE_STEPS.length - 1, Math.max(0, index + direction));
  return UI_SCALE_STEPS[next];
}

export function loadUiScale(): number {
  try {
    return normalizeUiScale(localStorage.getItem(UI_SCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

export function saveUiScale(scale: number): void {
  try {
    if (scale === DEFAULT_UI_SCALE) localStorage.removeItem(UI_SCALE_STORAGE_KEY);
    else localStorage.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {}
}

export function applyUiScale(scale: number = loadUiScale()): number {
  const normalized = normalizeUiScale(scale);
  currentScale = normalized;
  uiScale.set(normalized);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (normalized === DEFAULT_UI_SCALE) root.style.removeProperty('font-size');
    else root.style.fontSize = `${normalized * 100}%`;
  }
  return normalized;
}

export function rem(logicalPx: number): string {
  return `${logicalPx / ROOT_FONT_PX}rem`;
}

export function toLogicalPx(screenPx: number): number {
  return screenPx / currentScale;
}

export function toScreenPx(logicalPx: number): number {
  return logicalPx * currentScale;
}
