// Gjør feltene valgfrie, så vi kan beregne bars fra 'since' hvis 'bars' mangler
export type TvPreset = Record<string, { bars?: number; since?: string }>;

const LS_KEY = 'tvPreset';

export function parsePreset(input: string): TvPreset {
  const m = input.match(/TV_PRESET\s*=(.*)$/s);
  const json = m ? m[1] : input;
  const obj = JSON.parse(json);
  // (valider gjerne litt her)
  return obj as TvPreset;
}

export function loadPreset(): TvPreset | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as TvPreset) : null;
  } catch { return null; }
}

export function savePreset(p: TvPreset | null): void {
  if (p == null) {
    localStorage.removeItem(LS_KEY);
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  }
}