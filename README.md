# WebFiles

A modern web-based file manager with a VSCode-like interface.

> Screenshots coming soon

## Features

| Category | Features |
|----------|----------|
| **File Management** | Browse, upload, download, rename, delete, search |
| **Editing** | Multi-tab editor with syntax highlighting (50+ languages), code formatting |
| **Preview** | Markdown, HTML, images, audio, video, PDF |
| **Knowledge Base** | Obsidian vault browser, wiki-links, knowledge graph, backlinks, tag cloud |
| **Batch Operations** | Multi-select, batch copy/move/delete/rename |
| **Archives** | Create and extract zip/tar.gz files |
| **Terminal** | Built-in terminal with tmux backend, persistent sessions |
| **Docker** | View container logs, exec into containers |
| **Sharing** | Time-limited share links |
| **Mobile** | Responsive design with touch-optimized controls |
| **Security** | Password protection, 30-day sessions, path restriction |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/BradZhone/webfiles.git
cd webfiles
npm install

# 2. Start server
./manage.sh start

# 3. Open browser
# http://localhost:8765
# On first visit, you'll be asked to set a password
```

### Obsidian Vault

WebFiles can browse Obsidian vaults with full support for wiki-links, tags, callouts, and knowledge graph visualization.

To use the knowledge base feature:

1. Start WebFiles with your home directory containing an Obsidian vault
2. Click the **知识库** (Knowledge Base) button in the navigation bar
3. Select your vault directory from the file browser
4. Browse notes with rendered wiki-links, view the knowledge graph, explore backlinks and tags

You can optionally configure allowed vault paths in `config.json`:

```json
{
  "vaultPaths": ["/home/user/my-vault", "/home/user/notes"]
}
```

## Configuration

### Zero Config

WebFiles works out of the box. Just start it and open the URL. On first visit, set your password through the web interface - no manual configuration needed.

### Optional: Environment Variables

```bash
# Change port
WEBFILES_PORT=9000 ./manage.sh start

# Restrict file access to specific directory
WEBFILES_HOME=/data/files ./manage.sh start

# Custom session secret (for multi-instance deployments)
WEBFILES_SECRET=your-random-string ./manage.sh start

# Disable authentication (for testing only)
WEBFILES_NOAUTH=1 ./manage.sh start
```

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBFILES_PORT` | `8765` | Server port |
| `WEBFILES_HOME` | `$HOME` | Root directory for file access |
| `WEBFILES_SECRET` | auto-generated | Session encryption key |
| `WEBFILES_NOAUTH` | — | Set to `1` to disable authentication (testing only) |

### Optional: config.json

For persistent configuration, create `config.json` in the project root:

```json
{
  "port": 8765,
  "homeDir": "/path/to/files",
  "sessionSecret": "your-random-string",
  "vaultPaths": ["/path/to/vault"]
}
```

> **Note:** Password is set through the web interface on first visit. Do not manually set `passwordHash`.

### Change Password

Click the gear (settings) icon in the top-right corner to change your password.

## Management

```bash
./manage.sh start    # Start server
./manage.sh stop     # Stop server
./manage.sh restart  # Restart server
./manage.sh status   # Check status
./manage.sh logs     # View logs (Ctrl+C to exit)
```

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | |
| Linux/macOS | | Windows not supported |
| tmux | | Required for terminal feature |
| Docker | | Optional, for container features |

### Install tmux (if needed)

```bash
# Ubuntu/Debian
sudo apt install tmux

# CentOS/RHEL
sudo yum install tmux

# macOS
brew install tmux
```

## Security

- **Password**: Set via web interface, stored as SHA-256 hash
- **Session**: 30-day persistence with secure cookies
- **Path restriction**: Users can only access files within `WEBFILES_HOME`
- **Config exclusion**: `config.json` is excluded from git

## File Structure

```
webfiles/
├── server.js           # Main server
├── package.json        # Dependencies
├── manage.sh           # Management script
├── public/
│   └── index.html      # Web interface (single-file app)
├── config.json         # Your config (auto-created, gitignored)
├── favorites.json      # Bookmarks (gitignored)
├── shares.json         # Share links (gitignored)
└── terminals.json      # Terminal sessions (gitignored)
```

## API

### File Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files` | List directory |
| `GET/POST` | `/api/file` | Read/save file |
| `POST` | `/api/create` | Create file/folder |
| `DELETE` | `/api/file` | Delete file/folder |
| `PUT` | `/api/rename` | Rename |
| `POST` | `/api/upload` | Upload files |
| `GET` | `/api/download` | Download file/folder |
| `GET` | `/api/search` | Search files |
| `POST` | `/api/batch-*` | Batch operations |
| `POST` | `/api/compress` | Create archive |
| `POST` | `/api/extract` | Extract archive |
| `POST` | `/api/change-password` | Change password |
| `*` | `/api/favorites` | Manage bookmarks |
| `*` | `/api/share` | Manage shares |
| `*` | `/api/terminals` | Manage terminals |
| `GET` | `/api/containers` | List Docker containers |

### Vault (Knowledge Base)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/vault/graph?vault=PATH` | Knowledge graph — nodes and edges from wiki-links |
| `GET` | `/api/vault/backlinks?vault=PATH&file=FILE` | Backlinks for a specific note |
| `GET` | `/api/vault/tags?vault=PATH` | All tags and associated files |
| `POST` | `/api/vault/parse` | Parse a Markdown file (body, links, tags, headings) |

See [docs/api-reference.md](docs/api-reference.md) for full API documentation.

## Testing

```bash
# Install test dependencies
npx playwright install chromium

# Run all tests
npx playwright test

# Run API tests only
npx playwright test --project=api

# Run UI tests only
npx playwright test --project=ui
```

## License

MIT
