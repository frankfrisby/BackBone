# Extensions

BACKBONE extension system for packaging and distributing skills, integrations, and agent behaviors.

## Structure

```
extensions/
├── built-in/          # First-party extensions shipped with BACKBONE
├── community/         # Community-contributed extensions (via registry)
└── local/             # User's local extensions (not committed)
```

## Extension Format

Each extension is a directory with:
- `manifest.json` — metadata, dependencies, permissions
- `index.js` — entry point
- `skills/` — skill definitions (optional)
- `tools/` — tool definitions (optional)

## Creating an Extension

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "What it does",
  "type": "skill|integration|agent",
  "permissions": ["read:goals", "write:memory"],
  "entrypoint": "index.js"
}
```
