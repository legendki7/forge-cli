import type {
  DeploymentProject,
  DeploymentTargetId,
  EnvironmentProfile,
  PlannedEnvironmentVariable,
} from './model.js';

export type {
  DeploymentPlanOptions,
  DeploymentProject,
  DeploymentTargetId,
  EnvironmentProfile,
  EnvironmentProfileId,
  KubernetesResources,
  PlannedEnvironmentVariable,
} from './model.js';
export type {
  DeploymentProfile,
  DeploymentReadiness,
  DeploymentServicePlan,
  DeploymentWarning,
  PlannedDeploymentFile,
} from './generation.js';
export type {
  DeploymentDriftEntry,
  DeploymentDriftState,
  DeploymentScanEvidence,
  DeploymentScanResult,
} from './scanner.js';

export const ENVIRONMENT_PROFILE_IDS = ['local', 'staging', 'production'] as const;
export const DEPLOYMENT_TARGET_IDS = [
  'docker-compose',
  'generic-docker',
  'kubernetes',
  'static-export',
  'node-server',
] as const;

export const DEPLOYMENT_TARGETS: readonly {
  id: DeploymentTargetId;
  name: string;
  description: string;
}[] = [
  {
    id: 'docker-compose',
    name: 'Docker Compose',
    description: 'Multi-service Docker configuration.',
  },
  {
    id: 'generic-docker',
    name: 'Generic Docker',
    description: 'Production-oriented Dockerfiles.',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Starter manifests for review and manual use.',
  },
  {
    id: 'static-export',
    name: 'Static Export',
    description: 'Static frontend hosting metadata.',
  },
  {
    id: 'node-server',
    name: 'Node Server',
    description: 'Generic Node runtime instructions.',
  },
] as const;

export function createEnvironmentProfiles(
  variables: readonly PlannedEnvironmentVariable[],
): EnvironmentProfile[] {
  return ENVIRONMENT_PROFILE_IDS.map((id) => ({
    schemaVersion: 1,
    id,
    name: id[0]!.toUpperCase() + id.slice(1),
    description:
      id === 'local'
        ? 'Configuration for development on this computer.'
        : id === 'staging'
          ? 'A test environment that behaves similarly to production.'
          : 'The live environment used by real users.',
    variables: variables
      .filter(({ profiles }) => profiles.includes(id))
      .map(({ name }) => ({ name, configured: false }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    serviceOverrides: [],
  }));
}

export function compatibleDeploymentTargets(project: DeploymentProject): DeploymentTargetId[] {
  const implementations = new Set(project.services.map(({ implementation }) => implementation));
  const result = new Set<DeploymentTargetId>();
  const applications = project.services.filter(({ implementation }) =>
    ['nextjs', 'react-vite', 'express'].includes(implementation),
  );
  const infrastructure = project.services.some(({ implementation }) =>
    ['postgres', 'redis'].includes(implementation),
  );
  if (project.services.length > 1 || infrastructure) result.add('docker-compose');
  if (applications.length) {
    result.add('generic-docker');
    result.add('kubernetes');
  }
  if (implementations.has('postgres') || implementations.has('redis')) result.add('kubernetes');
  if (
    applications.some(
      ({ implementation }) => implementation === 'express' || implementation === 'nextjs',
    )
  )
    result.add('node-server');
  if (
    applications.some(
      ({ implementation, staticExportCompatible }) =>
        implementation === 'react-vite' || (implementation === 'nextjs' && staticExportCompatible),
    )
  )
    result.add('static-export');
  return DEPLOYMENT_TARGET_IDS.filter((id) => result.has(id));
}
