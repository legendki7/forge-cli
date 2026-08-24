import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { betaVerificationCommands } from '../scripts/beta-verify.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workflow = (name: string) => readFileSync(path.join(root, '.github/workflows', name), 'utf8');

describe('protected Phase 7 workflows', () => {
  it('keeps the Beta verifier non-publishing', () => {
    const commands = betaVerificationCommands.flat().join(' ');
    expect(commands).not.toMatch(/publish|release create|tag|push/iu);
    expect(commands).toContain('install --frozen-lockfile');
    expect(commands).toContain('release:verify');
  });

  it('requires manual protected confirmation and beta-only npm publication', () => {
    const content = workflow('beta-release.yml');
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain("inputs.confirm == 'PUBLISH_FORGEKI_BETA'");
    expect(content).toContain('environment: public-beta');
    expect(content).toContain('changeset publish --tag beta');
    expect(content).toContain('prerelease');
    expect(content).not.toContain('--tag latest');
    expect(content).not.toContain('pull_request:');
  });

  it('keeps the dry run inspection-only', () => {
    const content = workflow('release-dry-run.yml');
    expect(content).toContain('release:beta:verify');
    expect(content).toContain('upload-artifact');
    expect(content).not.toMatch(/npm publish|changeset publish|gh release create/iu);
  });

  it('fails Marketplace publication closed and self-verifies emergency revocations', () => {
    const marketplace = workflow('marketplace-publish.yml');
    expect(marketplace).toContain('marketplace-production-guard.mjs');
    expect(marketplace).toContain('No production Marketplace hosting provider is configured');
    const revocation = workflow('revocation-emergency.yml');
    expect(revocation).toContain('reason:');
    expect(revocation).toContain('verify-signed-marketplace.mjs');
    expect(revocation).toContain('nothing was published automatically');
  });

  it('verifies Marketplace clean builds across the supported Node.js matrix', () => {
    const content = workflow('ci.yml');
    expect(content).toContain('node: [20, 22, 24]');
    expect(content).toContain('run: pnpm marketplace:verify');
    expect(content).not.toContain('if: matrix.node == 22');

    const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(metadata.scripts['marketplace:build']).toBe(
      'pnpm -r --filter @forgecli7/marketplace... --sort build',
    );
  });
});
