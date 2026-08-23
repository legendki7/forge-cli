import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = process.cwd();
const styles = readFileSync(path.join(desktopRoot, 'src', 'styles.css'), 'utf8');

describe('ForgeKi visual identity', () => {
  it.each([
    '--brand',
    '--brand-hover',
    '--brand-soft',
    '--canvas',
    '--sidebar',
    '--surface',
    '--surface-subtle',
    '--surface-active',
    '--text',
    '--text-muted',
    '--text-faint',
    '--border',
    '--border-strong',
    '--success',
    '--warning',
    '--danger',
    '--radius-sm',
    '--radius',
    '--radius-lg',
  ])('defines the %s design token', (token) => {
    expect(styles).toContain(`${token}:`);
  });

  it('defines explicit brand-aware dark and system themes', () => {
    expect(styles).toContain(":root[data-theme='dark']");
    expect(styles).toContain(":root[data-theme='system']");
    expect(styles).toContain('--canvas: #12161c');
    expect(styles).toContain('--surface: #1c222c');
  });

  it.each(['forgeki-mark.png', 'forgeki-app-icon.png'])('%s is a padded 1024px PNG', (name) => {
    const image = readFileSync(path.join(desktopRoot, 'src', 'assets', 'brand', name));
    expect(image.subarray(1, 4).toString()).toBe('PNG');
    expect(image.readUInt32BE(16)).toBe(1024);
    expect(image.readUInt32BE(20)).toBe(1024);
  });
});
