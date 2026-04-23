# WebFiles

A modern web-based file manager and knowledge base with Obsidian-style markdown features, built-in terminal, and knowledge graph visualization.

## Features

### File Manager
- Browse, upload, download, rename, move, copy, delete files
- Multi-tab code editor with syntax highlighting (CodeMirror)
- Image/media preview with thumbnail generation
- Drag-and-drop upload
- Batch operations (multi-select, compress, extract)
- File sharing with time-limited links
- Bookmark/favorites

### Knowledge Base (Obsidian-compatible)
- Multiple vault management with VS Code-style sidebar
- Obsidian Flavored Markdown: wiki-links, callouts, tags, embeds, mermaid diagrams
- YAML frontmatter with Properties display
- Interactive knowledge graph (vis-network) with:
  - Cross-vault aggregation
  - Node search and vault filtering
  - Click tooltip with file info
  - Hover to highlight connections
- Backlinks and outlinks tracking
- Tag-based search and filtering
- Document CRUD with auto-updated timestamps
- Cross-vault wiki-link resolution

### Terminal
- Multi-tab terminal with tmux session persistence
- WebSocket with auto-reconnect and status indicator
- In-terminal search (Ctrl+F)
- Font size adjustment
- Mobile keyboard with quick commands
- Tab rename (double-click)
- Context menu copy/paste
- "Open terminal here" from file manager

### System
- Real-time system stats (CPU, Memory, Disk, Network)
- One-click system boost
- Dark theme (Catppuccin-inspired)
- Mobile responsive with collapsible sidebar
- Password authentication with session management

## Quick Start

```bash
git clone https://github.com/BradZhone/webfiles.git
cd webfiles
npm install
node server.js
```

Open `http://localhost:8765` in your browser.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBFILES_PORT` | `8765` | Server port |
| `WEBFILES_HOME` | `$HOME` | Root directory |
| `WEBFILES_NOAUTH` | - | Set to `1` to disable auth |
| `WEBFILES_SECRET` | auto | Session secret |

## API Reference

### File Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files?path=` | List directory contents |
| POST | `/api/upload` | Upload files |
| POST | `/api/file` | Create file/folder |
| PUT | `/api/file` | Rename/move file |
| DELETE | `/api/file` | Delete file |
| GET | `/api/file/content?path=` | Read file content |
| POST | `/api/compress` | Compress files |
| POST | `/api/unzip` | Extract archive |

### Knowledge Base
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vault/paths` | List saved vault paths |
| POST | `/api/vault/paths` | Add vault path |
| DELETE | `/api/vault/paths` | Remove vault path |
| GET | `/api/vault/graph?vault=` | Get knowledge graph data |
| GET | `/api/vault/backlinks?vault=&file=` | Get backlinks + outlinks |
| GET | `/api/vault/tags?vault=` | Get all tags |
| POST | `/api/vault/parse` | Parse markdown file |
| POST | `/api/vault/write` | Create/update file |
| DELETE | `/api/vault/file` | Delete vault file |
| GET | `/api/browse?path=` | Browse directories |

### Terminal
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/terminals` | List terminal sessions |
| POST | `/api/terminal` | Create terminal |
| DELETE | `/api/terminal/:id` | Close terminal |
| WS | `/terminal/:id` | WebSocket connection |

## Tech Stack

- **Backend**: Node.js, Express 5, node-pty, WebSocket
- **Frontend**: Vanilla JS (single-file), CodeMirror, xterm.js, vis-network, marked.js, mermaid, highlight.js
- **All dependencies via CDN** — no build step required

## License

MIT
