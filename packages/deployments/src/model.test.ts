import { describe, expect, it } from 'vitest';
import {
  architectureFingerprint,
  compatibleDeploymentTargets,
  createEnvironmentProfiles,
  deploymentProjectFromWorkspace,
  parseDeploymentTargetId,
  serializeEnvironmentProfiles,
  validateEnvironmentProfiles,
  validateKubernetesName,
  validateKubernetesResources,
  validateReplicas,
} from './model.js';
import { saasProject, saasWorkspace } from './fixtures.js';

describe('environment and deployment model', () => {
  it('creates deterministic serializable environment profiles', () => {
    const project = saasProject();
    const first = createEnvironmentProfiles(project.variables);
    expect(first.map(({ id }) => id)).toEqual(['local', 'staging', 'production']);
    expect(serializeEnvironmentProfiles(first)).toBe(
      serializeEnvironmentProfiles(createEnvironmentProfiles(project.variables)),
    );
    expect(serializeEnvironmentProfiles(first)).not.toMatch(/[A-Z]:\\Users|\/Users\//u);
  });

  it('assigns every workspace variable to a service or infrastructure owner', () => {
    const project = deploymentProjectFromWorkspace(saasWorkspace());
    expect(project.variables.length).toBeGreaterThan(3);
    expect(
      project.variables.every(({ owner }) => /^(?:service|database|infrastructure):/u.test(owner)),
    ).toBe(true);
    expect(project.variables.find(({ name }) => name === 'DATABASE_URL')).not.toHaveProperty(
      'exampleValue',
    );
  });

  it.each(['VITE_DATABASE_PASSWORD', 'NEXT_PUBLIC_SECRET', 'PUBLIC_TOKEN'])(
    'blocks secret exposure through %s',
    (name) => {
      const project = saasProject();
      project.variables.push({
        name,
        owner: 'service:web',
        description: 'unsafe',
        required: true,
        secret: true,
        browserVisible: true,
        profiles: ['production'],
      });
      const result = validateEnvironmentProfiles(project);
      expect(result.status).toBe('blocked');
      expect(result.errors.some(({ code }) => code === 'BROWSER_SECRET_EXPOSURE')).toBe(true);
    },
  );

  it('detects invalid names, duplicates, ownership conflicts, and missing profile definitions', () => {
    const project = saasProject();
    project.variables = [
      {
        name: 'bad-name',
        owner: 'service:web',
        description: '',
        required: true,
        secret: false,
        browserVisible: false,
        profiles: [],
      },
      {
        name: 'API_URL',
        owner: 'service:web',
        description: '',
        required: true,
        secret: false,
        browserVisible: false,
        profiles: ['production'],
      },
      {
        name: 'API_URL',
        owner: 'service:web',
        description: '',
        required: true,
        secret: false,
        browserVisible: false,
        profiles: ['production'],
      },
      {
        name: 'API_URL',
        owner: 'service:api',
        description: '',
        required: true,
        secret: false,
        browserVisible: false,
        profiles: ['production'],
      },
    ];
    const result = validateEnvironmentProfiles(
      project,
      createEnvironmentProfiles(project.variables).map((profile) =>
        profile.id === 'production' ? { ...profile, variables: [] } : profile,
      ),
    );
    expect(new Set(result.errors.map(({ code }) => code)).size).toBeGreaterThanOrEqual(4);
  });

  it('detects duplicate ports and impossible service overrides', () => {
    const project = saasProject();
    project.services[1]!.port = project.services[0]!.port;
    const profiles = createEnvironmentProfiles(project.variables);
    profiles[0]!.serviceOverrides.push({ serviceId: 'missing' });
    expect(validateEnvironmentProfiles(project, profiles).errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['DUPLICATE_PORT', 'INVALID_SERVICE_OVERRIDE']),
    );
  });

  it('filters targets based on actual framework compatibility', () => {
    const project = saasProject();
    expect(compatibleDeploymentTargets(project)).toEqual(
      expect.arrayContaining([
        'docker-compose',
        'generic-docker',
        'kubernetes',
        'static-export',
        'node-server',
      ]),
    );
    const databaseOnly = {
      ...project,
      services: project.services.filter(({ implementation }) => implementation === 'postgres'),
    };
    expect(compatibleDeploymentTargets(databaseOnly)).toEqual(['docker-compose', 'kubernetes']);
  });

  it('maps friendly CLI target aliases without inventing deployment behavior', () => {
    expect(parseDeploymentTargetId('docker', saasProject())).toBe('docker-compose');
    expect(parseDeploymentTargetId('k8s')).toBe('kubernetes');
    expect(() => parseDeploymentTargetId('cloud')).toThrow(/Unsupported/u);
  });

  it.each([
    ['valid-name', true],
    ['Invalid_Name', false],
    ['-invalid', false],
    ['a'.repeat(64), false],
  ])('validates Kubernetes DNS name %s', (name, valid) =>
    expect(validateKubernetesName(name)).toBe(valid),
  );

  it('bounds replicas and Kubernetes resources', () => {
    expect(validateReplicas(1)).toBe(true);
    expect(validateReplicas(21)).toBe(false);
    expect(
      validateKubernetesResources({
        cpuRequest: '100m',
        memoryRequest: '128Mi',
        cpuLimit: '500m',
        memoryLimit: '1Gi',
      }),
    ).toBe(true);
    expect(
      validateKubernetesResources({
        cpuRequest: '2',
        memoryRequest: 'lots',
        cpuLimit: '1',
        memoryLimit: 'none',
      }),
    ).toBe(false);
  });

  it('creates a portable stable architecture fingerprint', () => {
    const one = architectureFingerprint(saasProject(), 'kubernetes');
    const two = architectureFingerprint(saasProject(), 'kubernetes');
    expect(one).toBe(two);
    expect(one).toMatch(/^[a-f0-9]{64}$/u);
    expect(one).not.toContain('ashra');
  });
});
