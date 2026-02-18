# WebFiles

A modern web-based file manager with a VSCode-like interface. Browse, edit, upload, and manage your files through a clean web interface.

## Features

- **File Browsing** - Navigate directories with breadcrumb navigation
- **Code Editing** - Syntax highlighting for 20+ languages via CodeMirror
- **Markdown Preview** - Live preview with GitHub-style rendering
- **HTML Preview** - Live preview in iframe
- **Media Support** - Preview images, audio, video, and PDF files
- **File Upload** - Drag & drop or select multiple files (up to 100MB each)
- **Batch Operations** - Multi-select for copy, move, delete
- **File Search** - Recursive search by filename
- **Favorites** - Bookmark frequently used directories
- **Path Jump** - Direct navigation to any path
- **Mobile Friendly** - Responsive design for phones and tablets
- **Session Persistence** - 30-day login sessions

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
# or
./manage.sh start
```

### 3. Access the Interface

Open `http://<your-server-ip>:8765` in your browser.

On first launch, you'll be prompted to set a password.

## Configuration

### Method 1: Environment Variables

```bash
export WEBFILES_PORT=8765
export WEBFILES_HOME=/path/to/your/files
export WEBFILES_SECRET=your-random-secret-string

npm start
```

### Method 2: config.json

Copy the example config and edit:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "port": 8765,
  "homeDir": "/path/to/your/files",
  "sessionSecret": "generate-a-random-string-here",
  "passwordHash": "sha256-hash-of-your-password"
}
```

#### Generate Password Hash

```bash
echo -n "your-password" | sha256sum
```

### Configuration Priority

1. Environment variables (highest priority)
2. config.json
3. Default values

| Variable | Config Key | Default | Description |
|----------|------------|---------|-------------|
| `WEBFILES_PORT` | `port` | 8765 | Server port |
| `WEBFILES_HOME` | `homeDir` | $HOME | Root directory for file access |
| `WEBFILES_SECRET` | `sessionSecret` | random | Session encryption key |

## Management

```bash
./manage.sh start    # Start server
./manage.sh stop     # Stop server
./manage.sh restart  # Restart server
./manage.sh status   # Check status
./manage.sh logs     # View logs
./manage.sh config   # Show configuration
```

## Security Notes

1. **config.json is excluded from git** - Your password hash and session secret won't be committed
2. **First-time password setup** - Access the web interface to set your initial password
3. **Session persistence** - Sessions last 30 days by default
4. **Path restriction** - Users can only access files within the configured home directory

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List directory contents |
| GET | `/api/file` | Get file content |
| POST | `/api/file` | Save file content |
| POST | `/api/create` | Create file or folder |
| DELETE | `/api/file` | Delete file or folder |
| PUT | `/api/rename` | Rename file or folder |
| POST | `/api/upload` | Upload files |
| GET | `/api/download` | Download file or folder (zip) |
| GET | `/api/search` | Search files by name |
| POST | `/api/batch-delete` | Delete multiple items |
| POST | `/api/batch-copy` | Copy multiple items |
| POST | `/api/batch-move` | Move multiple items |
| GET/POST/DELETE | `/api/favorites` | Manage favorites |

## Directory Structure

```
webfiles/
├── server.js           # Main server
├── package.json        # Dependencies
├── manage.sh           # Management script
├── config.example.json # Configuration template
├── config.json         # Your config (gitignored)
├── favorites.json      # User favorites (gitignored)
├── public/
│   └── index.html      # Web interface
└── README.md           # This file
```

## Requirements

- Node.js 18+
- Linux/macOS

## License

MIT
