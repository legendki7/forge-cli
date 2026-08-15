# Declarative Plugin Packages

`.forgeki-plugin` packages are deterministic canonical JSON bundles containing
`forgeki.plugin.json`, an optional safe Markdown README, and `templates/`. File order and paths are
normalized and timestamps, machine paths, executable bits, and unrelated hidden files are absent.

ForgeKi rejects absolute/traversal paths, Windows drive paths, duplicate files, symlinks, hardlinks,
devices, executable extensions, files over 1 MB, more than 200 files, and packages over 10 MB. It
verifies digest, publisher signature, identity, manifest, permissions, and Phase 3 safety before an
atomic install. README HTML/scripts, embeds, remote images, and `javascript:` links are not rendered.
