import { useSettings, settings, type Language } from "./settings";
import { ptBR } from "./i18n-pt";

/**
 * Tiny i18n: English text is the key. `t("Join a friend")` returns the pt-BR string when the
 * language is Portuguese, otherwise the English text. `{name}` placeholders are filled from vars.
 */
export function translate(lang: Language, text: string, vars?: Record<string, string | number>) {
  let out = lang === "pt-BR" ? (ptBR[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export type T = (text: string, vars?: Record<string, string | number>) => string;

/** React components: re-render when the language changes. */
export function useT(): T {
  const { language } = useSettings();
  return (text, vars) => translate(language, text, vars);
}

/** Outside React (session errors, sounds…). */
export const t: T = (text, vars) => translate(settings.get().language, text, vars);
