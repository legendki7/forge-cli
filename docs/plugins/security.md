# Plugin security model

Community plugins are data, not programs. ForgeKi does not run plugin hooks, JavaScript, binaries,
shell commands, package-manager installs, deployment actions, or network requests.

At validation and installation boundaries ForgeKi:

- enforces the closed Manifest v1 schema and explicit permission-to-contribution mapping;
- rejects traversal, absolute and URL paths, symlinks, executable extensions, lifecycle scripts,
  shell operators, non-registry dependency sources, duplicate identifiers, and unsafe templates;
- limits manifests to 256 KiB, each referenced file to 1 MiB, and an installed bundle to 10 MiB;
- copies through a staging directory and records SHA-256 hashes for the manifest and files;
- revalidates manifests and integrity before catalog, generation, and scanner use;
- disables corrupted plugins and never lets a local plugin override a built-in identity;
- routes generated output through the normal conflict detector and exclusive no-overwrite writer.

The desktop frontend is not a trust boundary. Its Rust commands allowlist operations and selected
directories, while the Node worker parses requests again and recomputes generation plans from the
installed registry. Error messages shown to the UI are sanitized.

Local plugins should still be reviewed before installation: permissions and the exact safety report
are shown in the Marketplace and CLI.
