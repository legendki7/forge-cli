# Workspace security

Workspace JSON is bounded to 256 KiB and has a closed schema. It cannot provide absolute paths, traversal, lifecycle commands, shell fragments, remote templates, or plugin execution. Counts, paths, ports, file sizes, connections, and browser-secret boundaries are validated before writing.

Desktop access is limited to native-picker-selected directories. Imports are read-only, bounded, symlink-aware, and not run at startup. Generation uses exclusive writes and atomic staging.

Phase 3 plugins receive no workspace capability. Future contributions require an explicit declarative schema; executable community hooks, shell, network, and arbitrary code remain prohibited.
