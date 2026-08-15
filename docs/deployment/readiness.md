# Deployment readiness

`assessDeploymentReadiness()` returns Ready, Ready with warnings, or Blocked. It checks environment schemas, secret/browser boundaries, supported framework/target combinations, ports, build/start script evidence, CI evidence, Kubernetes names, replicas, and resources.

Warnings identify evidence that cannot be confirmed locally. Readiness never claims that a database, registry, server, Docker daemon, cluster, or cloud service is reachable. No network check is performed.

Use `forge deployment check PATH --env production --target kubernetes` for a non-mutating report.
