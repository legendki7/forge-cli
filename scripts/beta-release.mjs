import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const RELEASE_CHANNELS = Object.freeze({ beta: 'beta', stable: 'latest' });
export const PUBLIC_DESKTOP_ARTIFACTS = Object.freeze([/_x64-setup\.exe$/u, /_x64_en-US\.msi$/u]);

export function discoverPublishablePackages(root) {
  const directories = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(directory, entry.name);
      const manifest = path.join(candidate, 'package.json');
      if (existsSync(manifest)) {
        const metadata = readJson(manifest);
        if (!metadata.private && metadata.name?.startsWith('@forgecli7/')) {
          directories.push({ directory: slash(path.relative(root, candidate)), ...metadata });
        }
      }
      if (entry.name === 'plugins') visit(candidate);
    }
  };
  visit(path.join(root, 'packages'));
  return directories.sort((left, right) => left.name.localeCompare(right.name));
}

export function orderPackages(packages) {
  const byName = new Map(packages.map((item) => [item.name, item]));
  const result = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (item) => {
    if (visited.has(item.name)) return;
    if (visiting.has(item.name)) throw new Error(`Circular public dependency: ${item.name}`);
    visiting.add(item.name);
    for (const name of Object.keys(item.dependencies ?? {}).sort()) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }
    visiting.delete(item.name);
    visited.add(item.name);
    result.push(item);
  };
  for (const item of packages) visit(item);
  return result;
}

export function validateReleaseVersion(version, channel = 'beta') {
  const pattern = channel === 'beta' ? /^\d+\.\d+\.\d+-beta\.\d+$/u : /^\d+\.\d+\.\d+$/u;
  if (!pattern.test(version)) throw new Error(`Invalid ${channel} release version: ${version}`);
  return version;
}

export function validateDistTag(channel, tag) {
  const expected = RELEASE_CHANNELS[channel];
  if (!expected || tag !== expected) {
    throw new Error(`Release channel ${channel} must use npm dist-tag ${expected ?? '(invalid)'}.`);
  }
  if (channel === 'beta' && tag === 'latest') throw new Error('Beta must never use latest.');
}

export function auditVersionConsistency(root) {
  const desktopPackage = readJson(path.join(root, 'apps/desktop/package.json'));
  const tauri = readJson(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'));
  const cargo = readFileSync(path.join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
  const cargoVersion = /^version\s*=\s*"([^"]+)"/mu.exec(cargo)?.[1];
  const versions = {
    desktopPackage: desktopPackage.version,
    tauri: tauri.version,
    cargo: cargoVersion,
  };
  if (new Set(Object.values(versions)).size !== 1) {
    throw new Error(`Desktop version drift: ${JSON.stringify(versions)}`);
  }
  return { version: tauri.version, versions };
}

export function createReleaseManifest({ root, version, channel, commit, artifacts }) {
  validateReleaseVersion(version, channel);
  if (!/^[0-9a-f]{7,40}$/u.test(commit)) throw new Error('Release commit must be a Git SHA.');
  const entries = artifacts.map((artifact) => {
    const filename = path.basename(artifact.file);
    if (filename !== artifact.filename || path.isAbsolute(artifact.filename)) {
      throw new Error(`Release artifact filename must not contain a path: ${artifact.filename}`);
    }
    const absolute = path.resolve(root, artifact.file);
    const bytes = readFileSync(absolute);
    return {
      filename,
      platform: artifact.platform,
      architecture: artifact.architecture,
      type: artifact.type,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...(artifact.updaterSignature ? { updaterSignature: artifact.updaterSignature.trim() } : {}),
    };
  });
  entries.sort((left, right) => left.filename.localeCompare(right.filename));
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    version,
    channel,
    commit,
    artifacts: entries,
  };
}

export function createChecksums(manifest) {
  return `${manifest.artifacts.map(({ sha256, filename }) => `${sha256}  ${filename}`).join('\n')}\n`;
}

export function createUpdaterMetadata({ version, channel, notes, artifactUrl, signature }) {
  validateReleaseVersion(version, channel);
  const url = new URL(artifactUrl);
  if (
    url.protocol !== 'https:' ||
    !['github.com', 'objects.githubusercontent.com'].includes(url.hostname)
  ) {
    throw new Error('Updater artifact URL must use HTTPS on an approved immutable host.');
  }
  if (!signature?.trim()) throw new Error('Production updater metadata requires a signature.');
  return {
    version,
    notes,
    platforms: {
      'windows-x86_64': { url: artifactUrl, signature: signature.trim() },
    },
  };
}

export function createGithubReleasePlan(version, filenames) {
  validateReleaseVersion(version, 'beta');
  const internal = filenames.filter((filename) =>
    /forgeki-worker|target|debug|node_modules|\.map$/iu.test(filename),
  );
  if (internal.length)
    throw new Error(`Internal artifacts cannot be released: ${internal.join(', ')}`);
  for (const required of [
    'SHA256SUMS.txt',
    'release-manifest.json',
    'forgeki-sbom.cdx.json',
    'THIRD_PARTY_NOTICES.md',
  ]) {
    if (!filenames.includes(required)) throw new Error(`GitHub release is missing ${required}.`);
  }
  return {
    tag: `forgeki-v${version}`,
    title: `ForgeKi ${version} Beta`,
    prerelease: true,
    latest: false,
    assets: [...filenames].sort(),
  };
}

export function auditPrivateReleaseMaterial(root) {
  const findings = [];
  const ignored = new Set(['.git', 'node_modules', 'target', 'release-staging', 'graphify-out']);
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) pending.push(path.join(directory, entry.name));
        continue;
      }
      const relative = slash(path.relative(root, path.join(directory, entry.name)));
      if (
        /\.(?:pfx|p12|jks)$/iu.test(entry.name) ||
        /(?:^|\/)(?:id_ed25519|id_rsa|.*private.*\.key)$/iu.test(relative)
      ) {
        findings.push(relative);
      }
    }
  }
  return findings.sort();
}

export function assertProductionSigningKey(value, source = '') {
  if (!value?.trim())
    throw new Error('Production signing key is required; unsigned fallback is forbidden.');
  if (/TEST_|fixture|packages\/marketplace\/src\/fixtures/iu.test(`${source}\n${value}`)) {
    throw new Error('Test signing keys cannot be used for production publication.');
  }
  if (!/PRIVATE KEY|^[A-Za-z0-9+/=]{40,}$/u.test(value.trim())) {
    throw new Error('Production signing key material is malformed.');
  }
  return true;
}

export function createCycloneDxSbom(root) {
  const packages = discoverPublishablePackages(root);
  const components = [];
  for (const item of packages) {
    components.push({
      type: 'library',
      name: item.name,
      version: item.version,
      purl: `pkg:npm/${encodeURIComponent(item.name)}@${item.version}`,
    });
  }
  const cargo = readFileSync(path.join(root, 'apps/desktop/src-tauri/Cargo.lock'), 'utf8');
  for (const block of cargo.split('[[package]]').slice(1)) {
    const name = /^name = "([^"]+)"/mu.exec(block)?.[1];
    const version = /^version = "([^"]+)"/mu.exec(block)?.[1];
    if (name && version)
      components.push({ type: 'library', name, version, purl: `pkg:cargo/${name}@${version}` });
  }
  components.sort((left, right) => left.purl.localeCompare(right.purl));
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${deterministicUuid(components)}`,
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: 'ForgeKi',
        version: auditVersionConsistency(root).version,
      },
    },
    components,
  };
}

export function prepareReleaseStaging(root, files) {
  const staging = path.join(root, 'release-staging');
  if (
    path.basename(staging) !== 'release-staging' ||
    path.dirname(staging) !== path.resolve(root)
  ) {
    throw new Error('Unsafe release staging path.');
  }
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const file of files) copyFileSync(file, path.join(staging, path.basename(file)));
  return staging;
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function artifactSize(file) {
  return statSync(file).size;
}

function deterministicUuid(value) {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function slash(value) {
  return value.replaceAll('\\', '/');
}
