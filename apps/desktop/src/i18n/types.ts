import type { en } from './en';

export type Language = 'en' | 'ar';
export type TranslationKey = keyof typeof en;
export type TranslationCatalog = { readonly [K in TranslationKey]: string };
export type TranslationParameters = Readonly<Record<string, string | number>>;
export type Translate = (key: TranslationKey, parameters?: TranslationParameters) => string;
