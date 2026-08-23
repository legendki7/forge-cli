import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';
import {
  I18nProvider,
  LocalizedRoot,
  TechnicalValue,
  missingTranslationKeys,
  translate,
} from './provider';

describe('Desktop localization catalogs', () => {
  it('has exact English and Arabic key parity with no missing or empty translations', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(missingTranslationKeys('en')).toEqual([]);
    expect(missingTranslationKeys('ar')).toEqual([]);
    expect(Object.values(ar).every((value) => value.trim().length > 0)).toBe(true);
  });

  it('uses deterministic interpolation and preserves required technical product terms', () => {
    expect(
      translate('ar', 'Used restricted plugin {id} in generation.', { id: 'forgeki.docker' }),
    ).toContain('forgeki.docker');
    for (const term of ['ForgeKi', 'Docker', 'GitHub Actions', 'Kubernetes']) {
      expect(JSON.stringify(ar)).toContain(term);
    }
  });

  it('applies Arabic and English root attributes and keeps technical values LTR-isolated', async () => {
    const { rerender } = render(
      <I18nProvider language="ar">
        <LocalizedRoot>
          <span>Settings</span>
          <TechnicalValue>C:\projects\forgeki</TechnicalValue>
        </LocalizedRoot>
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText('الإعدادات')).toBeVisible());
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('C:\\projects\\forgeki')).toHaveAttribute('dir', 'ltr');

    rerender(
      <I18nProvider language="en">
        <LocalizedRoot>
          <span>الإعدادات</span>
        </LocalizedRoot>
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText('Settings')).toBeVisible());
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });
});
