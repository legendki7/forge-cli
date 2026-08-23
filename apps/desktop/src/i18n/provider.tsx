import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { ar } from './ar';
import { en } from './en';
import type { Language, Translate, TranslationKey, TranslationParameters } from './types';

const catalogs = { en, ar } as const;
const attributes = ['aria-label', 'aria-description', 'placeholder', 'title'] as const;
const technicalTags = new Set(['CODE', 'KBD', 'PRE', 'SAMP']);

function interpolate(value: string, parameters?: TranslationParameters) {
  if (!parameters) return value;
  return value.replace(/\{(\w+)\}/g, (match, key: string) => String(parameters[key] ?? match));
}

export function translate(
  language: Language,
  key: TranslationKey,
  parameters?: TranslationParameters,
) {
  const value = catalogs[language][key] ?? en[key];
  return interpolate(value, parameters);
}

export function missingTranslationKeys(language: Language): TranslationKey[] {
  return (Object.keys(en) as TranslationKey[]).filter((key) => !catalogs[language][key]);
}

const I18nContext = createContext<{ language: Language; t: Translate }>({
  language: 'en',
  t: (key, parameters) => interpolate(en[key], parameters),
});

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(
    () => ({
      language,
      t: ((key, parameters) => translate(language, key, parameters)) as Translate,
    }),
    [language],
  );

  useLayoutEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

function keyForVisibleText(value: string): TranslationKey | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const keys = Object.keys(en) as TranslationKey[];
  return keys.find((key) => en[key] === normalized || ar[key] === normalized);
}

function isTechnicalValue(value: string) {
  const text = value.trim();
  return (
    /^(?:[a-z]:[\\/]|\/|https?:\/\/|github\.com\/)/iu.test(text) ||
    /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(text) ||
    /^(?:[a-f\d]{7,64}|:\d{2,5})$/iu.test(text) ||
    /^@?[\w.-]+\/[\w.-]+$/u.test(text) ||
    /^[\w.-]+\.(?:json|ya?ml|toml|ts|tsx|js|jsx|css|md|dockerignore)$/iu.test(text)
  );
}

function localizeNode(root: HTMLElement, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !technicalTags.has(parent.tagName) && !parent.closest('.technical-value')) {
      const raw = node.nodeValue ?? '';
      if (isTechnicalValue(raw)) {
        parent.classList.add('technical-value');
        parent.setAttribute('dir', 'ltr');
      }
      const key = keyForVisibleText(raw);
      if (key) {
        const translated = translate(language, key);
        const next = raw.replace(raw.trim(), translated);
        if (next !== raw) node.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }

  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    for (const attribute of attributes) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      const key = keyForVisibleText(raw);
      if (key) {
        const translated = translate(language, key);
        if (translated !== raw) element.setAttribute(attribute, translated);
      }
    }
  }
}

export function LocalizedRoot({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { language } = useI18n();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    localizeNode(element, language);
    const observer = new MutationObserver(() => localizeNode(element, language));
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return (
    <div ref={root} {...props}>
      {children}
    </div>
  );
}

export function TechnicalValue({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <bdi className={`technical-value ${className}`.trim()} dir="ltr" {...props}>
      {children}
    </bdi>
  );
}
