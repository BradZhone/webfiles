# WebFiles Vault API Reference

> Vault API documentation — matches the current server.js implementation  
> Version: 1.1  
> Updated: 2026-04-14

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Common Conventions](#2-common-conventions)
- [3. GET /api/vault/graph](#3-get-apivaultgraph)
- [4. GET /api/vault/backlinks](#4-get-apivaultbacklinks)
- [5. GET /api/vault/tags](#5-get-apivaulttags)
- [6. POST /api/vault/parse](#6-post-apivaultparse)
- [7. Error Reference](#7-error-reference)

---

## 1. Overview

The Vault API provides endpoints for browsing and analyzing Obsidian-compatible Markdown vaults. Features include knowledge graph generation, backlink discovery, tag aggregation, and Markdown file parsing.

**Base path**: `/api/vault`

All endpoints require authentication (session cookie from POST `/login`).

**Key capabilities**:
- Scan a vault directory and build a graph of wiki-link relationships
- Find all notes that link to a given note (backlinks)
- Aggregate tags across all notes in a vault
- Parse individual Markdown files extracting metadata, links, tags, and headings

**Caching**: Results are cached using an LRU cache (20 entries, 5-minute TTL). Repeated requests within the TTL return cached data.

---

## 2. Common Conventions

### Authentication

All vault endpoints require an authenticated session. Send the session cookie obtained from `POST /login`.

### Vault Path Validation

All endpoints accepting a `vault` parameter perform the following security checks:

1. Path is resolved to an absolute path via `path.resolve()`
2. Path must be within `WEBFILES_HOME` (the configured home directory)
3. If `vaultPaths` is configured in `config.json`, the path must match one of the allowed vault paths
4. Path must exist and be a directory

### Response Format

Responses are plain JSON objects (no wrapper). Error responses include an `error` field.

---

## 3. GET /api/vault/graph

Build a knowledge graph from wiki-link relationships between Markdown files in a vault.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vault` | string (query) | Yes | Absolute path to the vault directory |

### Response (200 OK)

```json
{
  "nodes": [
    {
      "id": "my-note",
      "label": "my-note",
      "path": "folder/my-note.md",
      "tags": ["project", "web"],
      "group": "folder"
    }
  ],
  "edges": [
    {
      "from": "my-note",
      "to": "other-note"
    }
  ]
}
```

**Node fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The note's basename (filename without `.md`) |
| `label` | string | Display label (same as `id`) |
| `path` | string | Relative path from vault root |
| `tags` | string[] | Tags extracted from frontmatter and inline `#tags` |
| `group` | string | Directory name, used for visual grouping |

**Edge fields**:

| Field | Type | Description |
|-------|------|-------------|
| `from` | string | Source node `id` (basename of linking file) |
| `to` | string | Target node `id` (basename of linked file) |

Edges are only created when both source and target files exist in the vault. Duplicate edges are deduplicated.

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `vault` parameter, invalid path, path outside HOME_DIR, or directory doesn't exist |

### Example

```bash
curl "http://localhost:8765/api/vault/graph?vault=/home/user/my-vault" \
  -b "connect.sid=SESSION_COOKIE"
```

---

## 4. GET /api/vault/backlinks

Find all notes that contain a `[[wiki-link]]` pointing to the specified file.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vault` | string (query) | Yes | Absolute path to the vault directory |
| `file` | string (query) | Yes | Relative path to the target file within the vault |

### Response (200 OK)

```json
{
  "file": "my-note",
  "backlinks": [
    {
      "path": "daily/2026-04-13.md",
      "name": "2026-04-13.md",
      "basename": "2026-04-13",
      "metadata": {
        "title": "April 13 Notes",
        "tags": ["daily", "log"]
      }
    }
  ]
}
```

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `file` | string | Basename of the target file |
| `backlinks` | object[] | List of files that link to the target |
| `backlinks[].path` | string | Relative path from vault root |
| `backlinks[].name` | string | Filename including extension |
| `backlinks[].basename` | string | Filename without `.md` extension |
| `backlinks[].metadata` | object\|null | Parsed frontmatter (null if no frontmatter) |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `vault` or `file` parameter, invalid vault path |

### Example

```bash
curl "http://localhost:8765/api/vault/backlinks?vault=/home/user/my-vault&file=projects/webfiles.md" \
  -b "connect.sid=SESSION_COOKIE"
```

---

## 5. GET /api/vault/tags

Get all tags in a vault with their associated files. Tags are extracted from both YAML frontmatter `tags: [...]` arrays and inline `#tag` syntax.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vault` | string (query) | Yes | Absolute path to the vault directory |

### Response (200 OK)

```json
{
  "tags": {
    "project": [
      {
        "path": "projects/webfiles.md",
        "name": "webfiles.md",
        "basename": "webfiles"
      }
    ],
    "daily": [
      {
        "path": "daily/2026-04-13.md",
        "name": "2026-04-13.md",
        "basename": "2026-04-13"
      }
    ]
  },
  "totalFiles": 42
}
```

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `tags` | object | Map of tag name → array of files with that tag |
| `tags[tagName]` | object[] | List of files tagged with `tagName` |
| `tags[tagName][].path` | string | Relative path from vault root |
| `tags[tagName][].name` | string | Filename including extension |
| `tags[tagName][].basename` | string | Filename without `.md` extension |
| `totalFiles` | number | Total number of `.md` files scanned in the vault |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `vault` parameter, invalid path |

### Example

```bash
curl "http://localhost:8765/api/vault/tags?vault=/home/user/my-vault" \
  -b "connect.sid=SESSION_COOKIE"
```

---

## 6. POST /api/vault/parse

Parse a single Markdown file, extracting metadata, body content, wiki-links, tags, and headings.

### Request Body

Content-Type: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | string | Yes | Relative path to the file within the vault, or absolute path |
| `vault` | string | No | Vault directory path. If provided, `file` is resolved relative to it |

### Response (200 OK)

```json
{
  "metadata": {
    "title": "My Note",
    "tags": ["project", "web"],
    "date": "2026-04-13"
  },
  "body": "# My Note\n\nThis is the body content without frontmatter...",
  "links": ["other-note", "reference"],
  "tags": ["project", "web", "javascript"],
  "headings": [
    { "level": 1, "text": "My Note" },
    { "level": 2, "text": "Overview" }
  ],
  "basename": "my-note"
}
```

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `metadata` | object\|null | Parsed YAML frontmatter key-value pairs. Array values (e.g., `tags: [a, b]`) are parsed into arrays. Null if no frontmatter present |
| `body` | string | Markdown content with frontmatter stripped |
| `links` | string[] | Wiki-link targets extracted from `[[target]]` and `[[target\|alias]]` syntax |
| `tags` | string[] | Tags from both frontmatter and inline `#tag` syntax |
| `headings` | object[] | List of headings with `level` (1-6) and `text` |
| `basename` | string | Filename without `.md` extension |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `file` parameter |
| 403 | Resolved file path is outside `WEBFILES_HOME` |
| 404 | File not found |

### Example

```bash
curl -X POST "http://localhost:8765/api/vault/parse" \
  -H "Content-Type: application/json" \
  -b "connect.sid=SESSION_COOKIE" \
  -d '{"vault": "/home/user/my-vault", "file": "projects/webfiles.md"}'
```

---

## 7. Error Reference

### Common Error Format

```json
{
  "error": "Human-readable error description"
}
```

Some endpoints also include a `message` field with additional details.

### Error Status Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 400 | Bad Request | Missing required parameters, invalid vault path, path validation failure |
| 403 | Forbidden | File path resolves outside `WEBFILES_HOME` |
| 404 | Not Found | File does not exist |
| 500 | Internal Error | Filesystem errors, unexpected server errors |

### Path Security

All path parameters are validated against:

1. **HOME_DIR boundary**: Resolved path must start with `WEBFILES_HOME`
2. **vaultPaths whitelist**: If `config.json` contains `vaultPaths`, the resolved path must match one of the listed prefixes
3. **Directory check**: For vault parameters, the path must be an existing directory

Attempts to use path traversal (e.g., `../../etc/passwd`) are blocked by `path.resolve()` normalization followed by the prefix check.
