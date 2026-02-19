# WebFiles

A modern web-based file manager with a VSCode-like interface.

![](screenshot.png)

## Features

| Category | Features |
|----------|----------|
| **File Management** | Browse, upload, download, rename, delete, search |
| **Editing** | Multi-tab editor with syntax highlighting (50+ languages), code formatting |
| **Preview** | Markdown, HTML, images, audio, video, PDF |
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
```

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBFILES_PORT` | `8765` | Server port |
| `WEBFILES_HOME` | `$HOME` | Root directory for file access |
| `WEBFILES_SECRET` | auto-generated | Session encryption key |

### Optional: config.json

For persistent configuration, create `config.json` in the project root:

```json
{
  "port": 8765,
  "homeDir": "/path/to/files",
  "sessionSecret": "your-random-string"
}
```

> **Note:** Password is set through the web interface on first visit. Do not manually set `passwordHash`.

### Change Password

Click the ⚙️ (settings) icon in the top-right corner to change your password.

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

## License

MIT
