const express = require('express');
const session = require('express-session');
// body-parser removed — using Express 5 built-in middleware
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const http = require('http');
const { WebSocketServer } = require('ws');
const os = require('os');
const pty = require('node-pty');
const unzipper = require('unzipper');
const tar = require('tar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 配置文件
const CONFIG_FILE = path.join(__dirname, 'config.json');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');
const SHARES_FILE = path.join(__dirname, 'shares.json');

// 加载配置文件（如果存在）
function loadConfigFile() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

const configFile = loadConfigFile();

// 优先级：环境变量 > 配置文件 > 默认值
const PORT = process.env.WEBFILES_PORT || configFile.port || 8765;
const HOME_DIR = process.env.WEBFILES_HOME || configFile.homeDir || process.env.HOME || '/home/brad';
const sessionSecret = process.env.WEBFILES_SECRET || configFile.sessionSecret || crypto.randomBytes(32).toString('hex');
const vaultPaths = configFile.vaultPaths || [];

// 读取或创建配置
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

function saveConfig(config) {
    config.sessionSecret = sessionSecret;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 收藏夹管理
function loadFavorites() {
    try {
        return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function saveFavorites(favorites) {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
}

// 分享链接管理
function loadShares() {
    try {
        return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveShares(shares) {
    fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

// 清理过期的分享链接
function cleanExpiredShares() {
    const shares = loadShares();
    const now = Date.now();
    let changed = false;

    for (const [id, share] of Object.entries(shares)) {
        if (share.expiry && share.expiry < now) {
            delete shares[id];
            changed = true;
        }
    }

    if (changed) saveShares(shares);
}

// 启动时清理过期分享
cleanExpiredShares();

// 初始化密码
function initPassword(password) {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    saveConfig({ passwordHash: hash });
    return hash;
}

// 验证密码
function verifyPassword(password) {
    const config = loadConfig();
    if (!config) return false;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash === config.passwordHash;
}

// 获取文件类型
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', ico: 'image',
        mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
        mp4: 'video', webm: 'video', mkv: 'video', mov: 'video', avi: 'video',
        pdf: 'pdf',
        md: 'markdown', markdown: 'markdown',
        html: 'html', htm: 'html'
    };
    return types[ext] || 'binary';
}

// 文件上传配置
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dest = req.query.dest || HOME_DIR;
            const resolvedDest = path.resolve(dest);
            if (!resolvedDest.startsWith(HOME_DIR)) {
                return cb(new Error('无权访问'));
            }
            if (!fs.existsSync(resolvedDest)) {
                fs.mkdirSync(resolvedDest, { recursive: true });
            }
            cb(null, resolvedDest);
        },
        filename: (req, file, cb) => {
            // 处理中文文件名
            const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            cb(null, originalName);
        }
    }),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// 中间件
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
    secret: sessionSecret,
    resave: true,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

// NOAUTH mode for testing
const NOAUTH = process.env.WEBFILES_NOAUTH === '1';

// 认证中间件
function requireAuth(req, res, next) {
    if (NOAUTH) return next();
    if (req.session && req.session.authenticated) {
        return next();
    }
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login');
}

// 登录页面
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }

    const hasPassword = loadConfig() !== null;

    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>文件管理器 - 登录</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #16213e;
            padding: 30px;
            border-radius: 16px;
            width: 100%;
            max-width: 360px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        }
        h1 { color: #fff; text-align: center; margin-bottom: 8px; font-size: 24px; }
        .subtitle { color: #666; text-align: center; margin-bottom: 25px; font-size: 14px; }
        input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #2a3f5f;
            border-radius: 10px;
            background: #0f0f23;
            color: #fff;
            font-size: 16px;
            margin-bottom: 15px;
        }
        input:focus { outline: none; border-color: #4cc9f0; }
        input::placeholder { color: #555; }
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #4cc9f0, #4361ee);
            color: #fff;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        button:active { transform: scale(0.98); }
        .error { color: #ff6b6b; text-align: center; margin-bottom: 15px; font-size: 14px; display: none; }
        .icon { text-align: center; font-size: 48px; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📁</div>
        <h1>文件管理器</h1>
        <p class="subtitle">${hasPassword ? '请输入密码登录' : '首次使用，请设置密码'}</p>
        <div class="error" id="error"></div>
        <form method="POST" action="/login">
            <input type="password" name="password" placeholder="${hasPassword ? '输入密码' : '设置新密码'}" required autofocus>
            <button type="submit">${hasPassword ? '登录' : '设置密码'}</button>
        </form>
    </div>
    <script>
        const params = new URLSearchParams(window.location.search);
        if (params.get('error')) {
            const el = document.getElementById('error');
            el.style.display = 'block';
            el.textContent = decodeURIComponent(params.get('error'));
        }
    </script>
</body>
</html>
    `);
});

// 登录处理
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.redirect('/login?error=' + encodeURIComponent('请输入密码'));

    const config = loadConfig();
    if (!config) {
        initPassword(password);
        req.session.authenticated = true;
        return req.session.save((err) => {
            if (err) console.error('Session save error:', err);
            res.redirect('/');
        });
    }

    if (verifyPassword(password)) {
        req.session.authenticated = true;
        return req.session.save((err) => {
            if (err) console.error('Session save error:', err);
            res.redirect('/');
        });
    }

    res.redirect('/login?error=' + encodeURIComponent('密码错误'));
});

// 登出
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// API: 修改密码
app.post('/api/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '请填写所有字段' });
    }

    if (!verifyPassword(currentPassword)) {
        return res.status(400).json({ error: '当前密码错误' });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({ error: '新密码至少4个字符' });
    }

    initPassword(newPassword);
    res.json({ success: true, message: '密码修改成功' });
});

// API: 获取目录内容
app.get('/api/files', requireAuth, (req, res) => {
    const dirPath = req.query.path || HOME_DIR;
    const resolvedPath = path.resolve(dirPath);

    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        const items = fs.readdirSync(resolvedPath);
        const files = items
            .map(item => {
                const itemPath = path.join(resolvedPath, item);
                try {
                    const stats = fs.statSync(itemPath);
                    return {
                        name: item,
                        path: itemPath,
                        isDirectory: stats.isDirectory(),
                        size: stats.size,
                        modified: stats.mtime,
                        type: stats.isDirectory() ? 'directory' : getFileType(item)
                    };
                } catch {
                    return null;
                }
            })
            .filter(item => item !== null)
            .sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

        res.json({ path: resolvedPath, files, parent: path.dirname(resolvedPath) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 获取图片缩略图
app.get('/api/thumbnail', requireAuth, (req, res) => {
    const filePath = req.query.path;
    const size = parseInt(req.query.size) || 64; // 默认64px

    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        const stats = fs.statSync(resolvedPath);
        if (stats.isDirectory()) return res.status(400).json({ error: '这是文件夹' });

        // 只处理图片文件，限制大小5MB
        const ext = resolvedPath.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico'];
        if (!imageExts.includes(ext)) {
            return res.status(400).json({ error: '不是图片文件' });
        }
        if (stats.size > 5 * 1024 * 1024) {
            return res.status(413).json({ error: '文件太大' });
        }

        // 读取文件并返回base64
        const data = fs.readFileSync(resolvedPath);
        const mime = getMimeType(ext);
        res.json({
            success: true,
            data: data.toString('base64'),
            mime: mime,
            size: stats.size
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function getMimeType(ext) {
    const mimes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
        'ico': 'image/x-icon',
        'svg': 'image/svg+xml'
    };
    return mimes[ext] || 'application/octet-stream';
}

// API: 获取文件内容
app.get('/api/file', requireAuth, (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        const stats = fs.statSync(resolvedPath);
        if (stats.isDirectory()) return res.status(400).json({ error: '这是文件夹' });
        if (stats.size > 10 * 1024 * 1024) return res.status(413).json({ error: '文件太大' });

        const fileType = getFileType(resolvedPath);
        const ext = resolvedPath.split('.').pop().toLowerCase();

        // 图片/音频/视频/PDF - 返回 base64
        if (['image', 'audio', 'video', 'pdf'].includes(fileType)) {
            const buffer = fs.readFileSync(resolvedPath);
            const mimeTypes = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
                mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
                flac: 'audio/flac', aac: 'audio/aac',
                mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
                mov: 'video/quicktime', avi: 'video/x-msvideo',
                pdf: 'application/pdf'
            };
            const mimeType = mimeTypes[ext] || 'application/octet-stream';
            return res.json({ path: resolvedPath, type: fileType, mime: mimeType, data: buffer.toString('base64'), size: stats.size });
        }

        // 文本文件
        const buffer = fs.readFileSync(resolvedPath);
        const isBinary = buffer.slice(0, 8000).some(byte => byte === 0);

        if (isBinary) {
            return res.json({ path: resolvedPath, type: 'binary', isBinary: true, size: stats.size });
        }

        res.json({ path: resolvedPath, type: fileType, content: buffer.toString('utf-8'), isBinary: false, size: stats.size });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 保存文件
app.post('/api/file', requireAuth, (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        if (fs.existsSync(resolvedPath)) {
            fs.copyFileSync(resolvedPath, resolvedPath + '.bak.' + Date.now());
        }
        fs.writeFileSync(resolvedPath, content, 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 创建
app.post('/api/create', requireAuth, (req, res) => {
    const { path: itemPath, type } = req.body;
    if (!itemPath || !type) return res.status(400).json({ error: '参数不完整' });

    const resolvedPath = path.resolve(itemPath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        if (type === 'file') {
            fs.writeFileSync(resolvedPath, '');
        } else {
            fs.mkdirSync(resolvedPath, { recursive: true });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 删除
app.delete('/api/file', requireAuth, (req, res) => {
    const { path: itemPath } = req.body;
    if (!itemPath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(itemPath);
    if (!resolvedPath.startsWith(HOME_DIR) || resolvedPath === HOME_DIR) {
        return res.status(403).json({ error: '无权删除' });
    }

    try {
        fs.rmSync(resolvedPath, { recursive: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 批量删除
app.post('/api/batch-delete', requireAuth, (req, res) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths)) return res.status(400).json({ error: '参数不完整' });

    const results = [];
    for (const itemPath of paths) {
        const resolvedPath = path.resolve(itemPath);
        if (!resolvedPath.startsWith(HOME_DIR) || resolvedPath === HOME_DIR) {
            results.push({ path: itemPath, success: false, error: '无权删除' });
            continue;
        }
        try {
            fs.rmSync(resolvedPath, { recursive: true });
            results.push({ path: itemPath, success: true });
        } catch (error) {
            results.push({ path: itemPath, success: false, error: error.message });
        }
    }
    res.json({ results });
});

// API: 重命名
app.put('/api/rename', requireAuth, (req, res) => {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) return res.status(400).json({ error: '参数不完整' });

    const resolvedOldPath = path.resolve(oldPath);
    if (!resolvedOldPath.startsWith(HOME_DIR) || resolvedOldPath === HOME_DIR) {
        return res.status(403).json({ error: '无权操作' });
    }

    try {
        const newPath = path.join(path.dirname(resolvedOldPath), newName);
        fs.renameSync(resolvedOldPath, newPath);
        res.json({ success: true, newPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 下载文件
app.get('/api/download', requireAuth, (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    try {
        const stats = fs.statSync(resolvedPath);

        // 如果是文件夹，打包下载
        if (stats.isDirectory()) {
            const folderName = path.basename(resolvedPath);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(folderName)}.zip`);

            const archive = archiver('zip', { zlib: { level: 5 } });
            archive.pipe(res);
            archive.directory(resolvedPath, folderName);
            archive.finalize();

            archive.on('error', (err) => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: '打包失败' });
                }
            });
            return;
        }

        // 单文件下载
        const filename = path.basename(resolvedPath);
        const ext = filename.split('.').pop().toLowerCase();

        const mimeTypes = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
            webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
            mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
            pdf: 'application/pdf', zip: 'application/zip',
            html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
            json: 'application/json', txt: 'text/plain', md: 'text/markdown'
        };

        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = fs.createReadStream(resolvedPath);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('Download error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: '下载失败' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 批量复制
app.post('/api/batch-copy', requireAuth, (req, res) => {
    const { paths, dest } = req.body;
    if (!paths || !Array.isArray(paths) || !dest) {
        return res.status(400).json({ error: '参数错误' });
    }

    const resolvedDest = path.resolve(dest);
    if (!resolvedDest.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    const results = [];
    for (const srcPath of paths) {
        try {
            const resolvedSrc = path.resolve(srcPath);
            if (!resolvedSrc.startsWith(HOME_DIR)) {
                results.push({ path: srcPath, success: false, error: '无权访问' });
                continue;
            }

            const name = path.basename(resolvedSrc);
            const targetPath = path.join(resolvedDest, name);

            if (fs.statSync(resolvedSrc).isDirectory()) {
                fs.cpSync(resolvedSrc, targetPath, { recursive: true });
            } else {
                fs.copyFileSync(resolvedSrc, targetPath);
            }
            results.push({ path: srcPath, success: true });
        } catch (e) {
            results.push({ path: srcPath, success: false, error: e.message });
        }
    }

    res.json({ success: true, results });
});

// API: 批量移动
app.post('/api/batch-move', requireAuth, (req, res) => {
    const { paths, dest } = req.body;
    if (!paths || !Array.isArray(paths) || !dest) {
        return res.status(400).json({ error: '参数错误' });
    }

    const resolvedDest = path.resolve(dest);
    if (!resolvedDest.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    const results = [];
    for (const srcPath of paths) {
        try {
            const resolvedSrc = path.resolve(srcPath);
            if (!resolvedSrc.startsWith(HOME_DIR)) {
                results.push({ path: srcPath, success: false, error: '无权访问' });
                continue;
            }

            const name = path.basename(resolvedSrc);
            const targetPath = path.join(resolvedDest, name);

            fs.renameSync(resolvedSrc, targetPath);
            results.push({ path: srcPath, success: true });
        } catch (e) {
            results.push({ path: srcPath, success: false, error: e.message });
        }
    }

    res.json({ success: true, results });
});

// API: 文件上传
app.post('/api/upload', requireAuth, upload.array('files', 20), (req, res) => {
    try {
        const files = req.files.map(f => ({
            name: f.filename,
            path: f.path,
            size: f.size
        }));
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: 文件搜索
app.get('/api/search', requireAuth, (req, res) => {
    const { query, path: searchPath, recursive } = req.query;
    if (!query) return res.status(400).json({ error: '缺少搜索关键词' });

    const basePath = searchPath || HOME_DIR;
    const resolvedBase = path.resolve(basePath);

    if (!resolvedBase.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    const results = [];
    const queryLower = query.toLowerCase();
    const maxResults = 100;

    function searchDir(dirPath, depth) {
        if (results.length >= maxResults) return;
        if (depth > 10) return; // 限制搜索深度

        try {
            const items = fs.readdirSync(dirPath);
            for (const item of items) {
                if (results.length >= maxResults) break;

                const itemPath = path.join(dirPath, item);
                try {
                    const stats = fs.statSync(itemPath);

                    // 匹配文件名
                    if (item.toLowerCase().includes(queryLower)) {
                        results.push({
                            name: item,
                            path: itemPath,
                            isDirectory: stats.isDirectory(),
                            size: stats.size,
                            modified: stats.mtime,
                            type: stats.isDirectory() ? 'directory' : getFileType(item)
                        });
                    }

                    // 递归搜索子目录
                    if (stats.isDirectory() && recursive !== 'false') {
                        searchDir(itemPath, depth + 1);
                    }
                } catch { }
            }
        } catch { }
    }

    searchDir(resolvedBase, 0);
    res.json({ query, path: resolvedBase, results, total: results.length });
});

// API: 收藏夹管理
app.get('/api/favorites', requireAuth, (req, res) => {
    res.json({ favorites: loadFavorites() });
});

app.post('/api/favorites', requireAuth, (req, res) => {
    const { path: favPath, name } = req.body;
    if (!favPath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(favPath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    const favorites = loadFavorites();

    // 检查是否已存在
    if (favorites.some(f => f.path === resolvedPath)) {
        return res.json({ success: true, favorites });
    }

    favorites.push({
        path: resolvedPath,
        name: name || path.basename(resolvedPath),
        addedAt: Date.now()
    });

    saveFavorites(favorites);
    res.json({ success: true, favorites });
});

app.delete('/api/favorites', requireAuth, (req, res) => {
    const { path: favPath } = req.body;
    let favorites = loadFavorites();

    if (favPath) {
        favorites = favorites.filter(f => f.path !== favPath);
    } else {
        favorites = [];
    }

    saveFavorites(favorites);
    res.json({ success: true, favorites });
});

// API: 批量重命名
app.post('/api/batch-rename', requireAuth, (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: '参数不完整' });
    }

    const results = [];
    for (const item of items) {
        const { oldPath, newName } = item;
        if (!oldPath || !newName) {
            results.push({ path: oldPath, success: false, error: '参数不完整' });
            continue;
        }

        const resolvedOldPath = path.resolve(oldPath);
        if (!resolvedOldPath.startsWith(HOME_DIR) || resolvedOldPath === HOME_DIR) {
            results.push({ path: oldPath, success: false, error: '无权操作' });
            continue;
        }

        try {
            const newPath = path.join(path.dirname(resolvedOldPath), newName);
            // 检查目标是否已存在
            if (fs.existsSync(newPath)) {
                results.push({ path: oldPath, success: false, error: '目标名称已存在' });
                continue;
            }
            fs.renameSync(resolvedOldPath, newPath);
            results.push({ path: oldPath, success: true, newPath });
        } catch (error) {
            results.push({ path: oldPath, success: false, error: error.message });
        }
    }

    res.json({ results });
});

// API: 文件分享
app.post('/api/share', requireAuth, (req, res) => {
    const { path: filePath, expiry } = req.body;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: '文件不存在' });
    }

    // 生成唯一分享ID
    const shareId = crypto.randomBytes(8).toString('hex');
    const shares = loadShares();

    shares[shareId] = {
        path: resolvedPath,
        name: path.basename(resolvedPath),
        createdAt: Date.now(),
        expiry: expiry > 0 ? Date.now() + expiry * 1000 : null
    };

    saveShares(shares);
    res.json({ success: true, shareId });
});

// API: 访问分享文件
app.get('/s/:shareId', (req, res) => {
    const { shareId } = req.params;
    const shares = loadShares();
    const share = shares[shareId];

    if (!share) {
        return res.status(404).send('分享链接不存在或已过期');
    }

    // 检查是否过期
    if (share.expiry && share.expiry < Date.now()) {
        delete shares[shareId];
        saveShares(shares);
        return res.status(410).send('分享链接已过期');
    }

    // 检查文件是否存在
    if (!fs.existsSync(share.path)) {
        return res.status(404).send('文件不存在');
    }

    const stats = fs.statSync(share.path);

    if (stats.isDirectory()) {
        // 压缩文件夹后下载
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(share.name)}.zip`);

        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(res);
        archive.directory(share.path, share.name);
        archive.finalize();
    } else {
        // 直接下载文件
        res.download(share.path, share.name);
    }
});

// API: 批量压缩
app.post('/api/compress', requireAuth, (req, res) => {
    const { paths, outputPath } = req.body;
    if (!paths || !Array.isArray(paths) || !outputPath) {
        return res.status(400).json({ error: '参数错误' });
    }

    const resolvedOutput = path.resolve(outputPath);
    if (!resolvedOutput.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    // 检查输出路径是否已存在
    if (fs.existsSync(resolvedOutput)) {
        return res.status(400).json({ error: '目标文件已存在' });
    }

    const archive = archiver('zip', { zlib: { level: 5 } });
    const output = fs.createWriteStream(resolvedOutput);

    output.on('close', () => {
        res.json({ success: true, size: archive.pointer() });
    });

    archive.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });

    archive.pipe(output);

    for (const itemPath of paths) {
        const resolvedPath = path.resolve(itemPath);
        if (!resolvedPath.startsWith(HOME_DIR)) continue;

        try {
            const stats = fs.statSync(resolvedPath);
            const name = path.basename(resolvedPath);

            if (stats.isDirectory()) {
                archive.directory(resolvedPath, name);
            } else {
                archive.file(resolvedPath, { name });
            }
        } catch (e) {
            console.error('压缩失败:', itemPath, e.message);
        }
    }

    archive.finalize();
});

// API: 解压文件
app.post('/api/unzip', requireAuth, async (req, res) => {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(HOME_DIR)) {
        return res.status(403).json({ error: '无权访问' });
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: '文件不存在' });
    }

    const ext = resolvedPath.split('.').pop().toLowerCase();
    const dirPath = path.dirname(resolvedPath);
    const baseName = path.basename(resolvedPath, path.extname(resolvedPath));
    const outputDir = path.join(dirPath, baseName);

    try {
        if (ext === 'zip') {
            // 解压 ZIP
            fs.mkdirSync(outputDir, { recursive: true });
            fs.createReadStream(resolvedPath)
                .pipe(unzipper.Extract({ path: outputDir }))
                .on('close', () => res.json({ success: true, outputDir }))
                .on('error', (err) => res.status(500).json({ error: err.message }));
        } else if (ext === 'tar' || ext === 'gz' || ext === 'tgz') {
            // 解压 TAR/TAR.GZ
            fs.mkdirSync(outputDir, { recursive: true });
            await tar.x({
                file: resolvedPath,
                cwd: outputDir
            });
            res.json({ success: true, outputDir });
        } else {
            res.status(400).json({ error: '不支持的压缩格式' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 系统状态 API ==========
let previousNetworkStats = null;

app.get('/api/system-stats', requireAuth, (req, res) => {
    try {
        const stats = {};

        // CPU 信息
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        const totalUsage = totalTick - totalIdle;
        const cpuUsage = ((totalUsage / totalTick) * 100).toFixed(1);

        stats.cpu = {
            usage: parseFloat(cpuUsage),
            cores: cpus.length,
            loadAvg: os.loadavg()
        };

        // 内存信息
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = ((usedMem / totalMem) * 100).toFixed(1);

        stats.memory = {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usage: parseFloat(memUsage)
        };

        // 磁盘信息 (通过 df 命令获取根分区)
        try {
            const dfOutput = require('child_process').execSync('df -B1 / | tail -1', { encoding: 'utf-8' });
            const parts = dfOutput.trim().split(/\s+/);
            if (parts.length >= 4) {
                const diskTotal = parseInt(parts[1]);
                const diskUsed = parseInt(parts[2]);
                const diskUsage = ((diskUsed / diskTotal) * 100).toFixed(1);
                stats.disk = {
                    total: diskTotal,
                    used: diskUsed,
                    usage: parseFloat(diskUsage)
                };
            }
        } catch (e) {
            stats.disk = { total: 0, used: 0, usage: 0 };
        }

        // 网络信息 (通过 /proc/net/dev 获取)
        try {
            const netDev = fs.readFileSync('/proc/net/dev', 'utf-8');
            const lines = netDev.split('\n');
            let totalRx = 0, totalTx = 0;

            lines.forEach(line => {
                const match = line.match(/\s*(.+?):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
                if (match && !match[1].includes('lo:')) {
                    totalRx += parseInt(match[2]);
                    totalTx += parseInt(match[3]);
                }
            });

            const currentStats = { rx: totalRx, tx: totalTx, time: Date.now() };

            if (previousNetworkStats) {
                const timeDiff = (currentStats.time - previousNetworkStats.time) / 1000;
                const rxDiff = currentStats.rx - previousNetworkStats.rx;
                const txDiff = currentStats.tx - previousNetworkStats.tx;

                stats.network = {
                    rxSpeed: rxDiff / timeDiff,
                    txSpeed: txDiff / timeDiff,
                    rxTotal: totalRx,
                    txTotal: totalTx
                };
            } else {
                stats.network = {
                    rxSpeed: 0,
                    txSpeed: 0,
                    rxTotal: totalRx,
                    txTotal: totalTx
                };
            }

            previousNetworkStats = currentStats;
        } catch (e) {
            stats.network = { rxSpeed: 0, txSpeed: 0, rxTotal: 0, txTotal: 0 };
        }

        // 系统信息
        stats.system = {
            uptime: os.uptime(),
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch()
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 系统优化 API ==========
app.post('/api/system-optimize', requireAuth, async (req, res) => {
    const { actions } = req.body;

    // 立即返回，后台执行优化
    res.json({ success: true, message: '优化任务已启动' });

    // 后台执行优化操作
    setImmediate(() => {
        const execCommand = (cmd) => {
            try {
                return require('child_process').execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
            } catch (e) {
                return null;
            }
        };

        const execSudo = (cmd) => {
            try {
                return require('child_process').execSync(`sudo ${cmd}`, { encoding: 'utf-8', timeout: 10000 });
            } catch (e) {
                return null;
            }
        };

        if (actions.includes('memory')) {
            execSudo('sync');
            execSudo('sh -c "echo 3 > /proc/sys/vm/drop_caches"');
        }

        if (actions.includes('temp')) {
            execSudo('find /tmp -type f -mtime +1 -delete 2>/dev/null');
            execSudo('find /var/tmp -type f -mtime +1 -delete 2>/dev/null');
        }

        if (actions.includes('packages')) {
            execSudo('apt-get clean -y 2>/dev/null');
            execSudo('dnf clean all 2>/dev/null');
            execCommand('pip cache purge 2>/dev/null');
            execCommand('npm cache clean --force 2>/dev/null');
        }

        if (actions.includes('logs')) {
            execSudo('journalctl --vacuum-time=7d 2>/dev/null');
            execSudo('find /var/log -name "*.log.*" -mtime +7 -delete 2>/dev/null');
            execSudo('find /var/log -name "*.gz" -mtime +7 -delete 2>/dev/null');
        }

        if (actions.includes('thumbnails')) {
            const thumbDir = require('os').homedir() + '/.cache/thumbnails';
            execCommand(`rm -rf ${thumbDir}/* 2>/dev/null`);
        }
    });
});

// 主页面
app.get('/', requireAuth, (req, res) => {
    const fs = require('fs');
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace("'__HOME_DIR__'", `'${HOME_DIR}'`);
    res.type('html').send(html);
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ========== 终端管理 ==========
const TERMINALS_FILE = path.join(__dirname, 'terminals.json');
const terminalConnections = new Map(); // 存储活跃的 WebSocket 连接
const terminalPtyProcesses = new Map(); // 存储共享的 pty 进程
const terminalBuffers = new Map(); // 存储输出缓冲区

// 加载终端配置
function loadTerminalsConfig() {
    try {
        return JSON.parse(fs.readFileSync(TERMINALS_FILE, 'utf-8'));
    } catch {
        return { terminals: {} };
    }
}

// 保存终端配置
function saveTerminalsConfig(config) {
    fs.writeFileSync(TERMINALS_FILE, JSON.stringify(config, null, 2));
}

// 获取 tmux 会话列表
function getTmuxSessions() {
    try {
        const result = require('child_process').execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""', { encoding: 'utf-8' });
        return result.trim().split('\n').filter(s => s.startsWith('webfiles_'));
    } catch {
        return [];
    }
}

// 创建或恢复 tmux 会话
function ensureTmuxSession(terminalId, workDir) {
    const sessionName = `webfiles_${terminalId}`;
    try {
        // 检查会话是否已存在
        require('child_process').execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
        return true;
    } catch {
        // 会话不存在，尝试创建
        try {
            require('child_process').execSync(`tmux new-session -d -s ${sessionName} -c "${workDir}"`, { encoding: 'utf-8' });
            // 启用鼠标模式和终端滚动
            try {
                require('child_process').execSync(`tmux set-option -t ${sessionName} mouse on 2>/dev/null`);
                require('child_process').execSync(`tmux set-option -t ${sessionName} terminal-overrides 'xterm*:smcup@:rmcup@:*256col*:Tc' 2>/dev/null`);
            } catch {}
            return true;
        } catch (e) {
            return false;
        }
    }
}

// API: 获取终端列表（以配置文件为主，自动恢复丢失的会话）
app.get('/api/terminals', requireAuth, (req, res) => {
    const config = loadTerminalsConfig();
    const tmuxSessions = getTmuxSessions();
    const tmuxSessionSet = new Set(tmuxSessions);

    const terminalList = [];
    
    // 遍历配置文件中的所有终端
    for (const [id, savedInfo] of Object.entries(config.terminals)) {
        const sessionName = `webfiles_${id}`;
        const workDir = savedInfo.cwd || HOME_DIR;
        
        // 检查 tmux 会话是否存在，如果不存在则尝试恢复
        if (!tmuxSessionSet.has(sessionName)) {
            // 尝试恢复 tmux 会话
            const restored = ensureTmuxSession(id, workDir);
            if (!restored) {
                // tmux 不可用，跳过此终端（或标记为不可用）
                continue;
            }
        }
        
        terminalList.push({
            id,
            name: savedInfo.name || id.split('_')[0] || 'Terminal',
            cwd: workDir,
            createdAt: savedInfo.createdAt || Date.now()
        });
    }

    res.json({ terminals: terminalList });
});

// API: 创建终端
app.post('/api/terminals', requireAuth, (req, res) => {
    const { id, cwd, name } = req.body;
    const terminalId = id || 'term_' + Date.now();
    const sessionName = `webfiles_${terminalId}`;
    const workDir = cwd && cwd.startsWith(HOME_DIR) ? cwd : HOME_DIR;
    const terminalName = name || workDir.split('/').pop() || 'Terminal';

    try {
        // 检查 tmux 是否已安装
        require('child_process').execSync('which tmux', { encoding: 'utf-8' });

        // 检查会话是否已存在
        try {
            require('child_process').execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
            // 会话已存在，确保鼠标模式开启
            try {
                require('child_process').execSync(`tmux set-option -t ${sessionName} mouse on 2>/dev/null`);
                // 启用终端滚动模式 - 让鼠标滚轮直接滚动终端历史
                require('child_process').execSync(`tmux set-option -t ${sessionName} terminal-overrides 'xterm*:smcup@:rmcup@:*256col*:Tc' 2>/dev/null`);
            } catch {}
        } catch {
            // 创建新的 tmux 会话
            require('child_process').execSync(`tmux new-session -d -s ${sessionName} -c "${workDir}"`, { encoding: 'utf-8' });
            // 启用鼠标模式
            try {
                require('child_process').execSync(`tmux set-option -t ${sessionName} mouse on 2>/dev/null`);
                // terminal-overrides 禁用 alternate screen，让滚动直接作用于历史缓冲区
                require('child_process').execSync(`tmux set-option -t ${sessionName} terminal-overrides 'xterm*:smcup@:rmcup@:*256col*:Tc' 2>/dev/null`);
            } catch {}
        }

        // 保存终端配置
        const config = loadTerminalsConfig();
        config.terminals[terminalId] = {
            name: terminalName,
            cwd: workDir,
            createdAt: Date.now()
        };
        saveTerminalsConfig(config);

        res.json({ success: true, id: terminalId, sessionName, name: terminalName, cwd: workDir });
    } catch (e) {
        res.json({ success: true, id: terminalId, sessionName, name: terminalName, cwd: workDir, fallback: true });
    }
});

// API: 重命名终端
app.put('/api/terminals/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const config = loadTerminalsConfig();
    if (config.terminals[id]) {
        config.terminals[id].name = name;
        saveTerminalsConfig(config);
        res.json({ success: true });
    } else {
        config.terminals[id] = { name, cwd: HOME_DIR, createdAt: Date.now() };
        saveTerminalsConfig(config);
        res.json({ success: true });
    }
});

// API: 关闭终端
app.delete('/api/terminals/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const sessionName = `webfiles_${id}`;

    // 关闭 tmux 会话
    try {
        require('child_process').execSync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`, { encoding: 'utf-8' });
    } catch {}

    // 从配置中删除
    const config = loadTerminalsConfig();
    delete config.terminals[id];
    saveTerminalsConfig(config);

    // 关闭所有相关连接
    if (terminalConnections.has(id)) {
        const connections = terminalConnections.get(id);
        connections.forEach(ws => {
            if (ws.readyState === 1) ws.close();
        });
        terminalConnections.delete(id);
    }

    res.json({ success: true });
});

// 获取或创建 pty 进程
function getOrCreatePtyProcess(terminalId, workDir) {
    if (terminalPtyProcesses.has(terminalId)) {
        return terminalPtyProcesses.get(terminalId);
    }

    const sessionName = `webfiles_${terminalId}`;
    let ptyProcess;
    let useTmux = false;

    try {
        // 检查 tmux 会话是否存在
        require('child_process').execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
        useTmux = true;

        // attach 到 tmux 会话
        ptyProcess = pty.spawn('tmux', ['attach', '-t', sessionName], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: workDir,
            env: { ...process.env, TERM: 'xterm-256color' }
        });
    } catch {
        // tmux 会话不存在，创建普通 shell（非持久化）
        ptyProcess = pty.spawn(os.platform() === 'win32' ? 'powershell.exe' : 'bash', [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: workDir,
            env: { ...process.env, TERM: 'xterm-256color' }
        });
    }

    const ptyInfo = { process: ptyProcess, useTmux, lastActivity: Date.now() };

    // 初始化缓冲区
    terminalBuffers.set(terminalId, []);
    
    // 数据缓冲区大小限制
    const MAX_BUFFER_SIZE = 100 * 1024; // 100KB

    // 发送输出到所有连接的客户端
    ptyProcess.onData((data) => {
        ptyInfo.lastActivity = Date.now();
        
        // 添加到缓冲区（用于新连接的客户端）
        const buffer = terminalBuffers.get(terminalId) || [];
        buffer.push({ data, timestamp: Date.now() });
        
        // 限制缓冲区大小
        let totalSize = buffer.reduce((sum, item) => sum + item.data.length, 0);
        while (totalSize > MAX_BUFFER_SIZE && buffer.length > 1) {
            totalSize -= buffer.shift().data.length;
        }
        terminalBuffers.set(terminalId, buffer);

        // 广播到所有连接的客户端
        const connections = terminalConnections.get(terminalId);
        if (connections) {
            connections.forEach(clientWs => {
                try {
                    if (clientWs.readyState === 1) {
                        // 检查缓冲区，避免发送过快
                        if (clientWs.bufferedAmount < 64 * 1024) {
                            clientWs.send(data);
                        }
                    }
                } catch (e) {
                    console.error('Error sending to client:', e);
                }
            });
        }
    });

    ptyProcess.onExit(({ exitCode }) => {
        const connections = terminalConnections.get(terminalId);
        if (connections) {
            connections.forEach(clientWs => {
                try {
                    if (clientWs.readyState === 1) {
                        clientWs.send(`\r\n\x1b[33m终端已退出 (code: ${exitCode})\x1b[0m\r\n`);
                    }
                } catch {}
            });
        }
        terminalPtyProcesses.delete(terminalId);
        terminalBuffers.delete(terminalId);
    });

    terminalPtyProcesses.set(terminalId, ptyInfo);
    return ptyInfo;
}

// WebSocket 处理
wss.on('connection', (ws, req) => {
    const match = req.url.match(/\/terminal\/(.+)/);
    if (!match) {
        ws.close();
        return;
    }

    const terminalId = match[1];
    const config = loadTerminalsConfig();
    const terminalInfo = config.terminals[terminalId] || {};
    const workDir = terminalInfo.cwd || HOME_DIR;

    // 存储连接
    if (!terminalConnections.has(terminalId)) {
        terminalConnections.set(terminalId, new Set());
    }
    terminalConnections.get(terminalId).add(ws);

    // 获取或创建共享的 pty 进程
    const ptyInfo = getOrCreatePtyProcess(terminalId, workDir);
    const ptyProcess = ptyInfo.process;

    // 发送缓冲区内容给新连接的客户端
    const buffer = terminalBuffers.get(terminalId) || [];
    if (buffer.length > 0) {
        // 延迟发送缓冲区内容，确保客户端已准备好
        setTimeout(() => {
            if (ws.readyState === 1) {
                const recentData = buffer.slice(-20).map(item => item.data).join('');
                ws.send(recentData);
            }
        }, 50);
    }

    // 心跳检测
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // 接收 WebSocket 输入
    ws.on('message', (data) => {
        try {
            ws.isAlive = true;
            ptyInfo.lastActivity = Date.now();
            
            const msg = JSON.parse(data);
            if (msg.type === 'input') {
                ptyProcess.write(msg.data);
            } else if (msg.type === 'resize') {
                try {
                    ptyProcess.resize(msg.cols, msg.rows);
                } catch {}
            }
        } catch (e) {
            console.error('Terminal message error:', e);
        }
    });

    ws.on('close', () => {
        // 移除连接
        if (terminalConnections.has(terminalId)) {
            terminalConnections.get(terminalId).delete(ws);
        }

        // 检查是否还有其他连接，如果没有则考虑关闭 pty
        const connections = terminalConnections.get(terminalId);
        if (!connections || connections.size === 0) {
            // 非tmux模式下，延迟关闭pty（允许短暂重连）
            if (!ptyInfo.useTmux) {
                setTimeout(() => {
                    const currentConnections = terminalConnections.get(terminalId);
                    if (!currentConnections || currentConnections.size === 0) {
                        try { ptyProcess.kill(); } catch {}
                        terminalPtyProcesses.delete(terminalId);
                        terminalBuffers.delete(terminalId);
                    }
                }, 5000); // 5秒后关闭
            }
        }
    });
});

// 定期检查死连接
const HEARTBEAT_INTERVAL = 30000; // 30秒
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);


// ========== Vault Cache ==========
class VaultCache {
  constructor(maxSize = 20, ttlMs = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.ts > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, ts: Date.now() });
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.includes(prefix)) this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
  }
}

const vaultCache = new VaultCache(20, 5 * 60 * 1000);

// ========== Vault API (Obsidian Integration) ==========

// Vault 辅助函数
function extractWikiLinks(content) {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = [];
  let match = regex.exec(content);
  while (match !== null) {
    links.push(match[1].trim());
    match = regex.exec(content);
  }
  return links;
}

function extractTags(content) {
  const tags = new Set();
  // frontmatter tags
// frontmatter tags - bracket format: tags: [a, b, c]
const fmBracket = content.match(/^---[\s\S]*?tags:\s*\[([^\]]+)\]/);
if (fmBracket) {
  fmBracket[1].split(',').forEach(t => {
    const cleaned = t.trim().replace(/^["']|["']$/g, '');
    if (cleaned) tags.add(cleaned);
  });
}
// frontmatter tags - YAML list format: tags:\n  - tag1\n  - tag2
const fmList = content.match(/^---[\s\S]*?tags:\s*\n((?:\s+-\s+.+\n?)*)/);
if (fmList) {
  fmList[1].split('\n').forEach(line => {
    const m = line.match(/^\s+-\s+(.+)/);
    if (m) {
      const cleaned = m[1].trim().replace(/^["']|["']$/g, '');
      if (cleaned) tags.add(cleaned);
    }
  });
}
  // 行内 tags（排除 Markdown 标题）
  const body = content.replace(/^---[\s\S]*?---\n?/, '');
  const lines = body.split('\n');
  lines.forEach(line => {
    if (/^#{1,6}\s/.test(line)) return; // 跳过标题行
    const tagRegex = /(?:^|[\s(])#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5/]*)/g;
    let m = tagRegex.exec(line);
    while (m !== null) {
      tags.add(m[1]);
      m = tagRegex.exec(line);
    }
  });
  return [...tags];
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { metadata: null, body: content };
  const yamlStr = match[1];
  const body = content.slice(match[0].length).replace(/^\n+/, '');
  const metadata = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listItem = line.match(/^\s+-\s+(.+)/);
    if (listItem && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    if (currentKey && currentList) {
      metadata[currentKey] = currentList;
      currentList = null;
    }
    const kv = line.match(/^(\w[\w-]*):\s*(.*)?$/);
    if (kv) {
      currentKey = kv[1].trim();
      const val = (kv[2] || '').trim();
      if (val === '') {
        currentList = null;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        metadata[currentKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        currentKey = null;
      } else {
        metadata[currentKey] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    }
  }
  if (currentKey && currentList) {
    metadata[currentKey] = currentList;
  }
  if (currentKey && !currentList && !(currentKey in metadata)) {
    metadata[currentKey] = '';
  }
  return { metadata, body };
}

function scanVault(vaultPath) {
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const { metadata, body } = parseFrontmatter(content);
          const links = extractWikiLinks(content);
          const tags = extractTags(content);
          files.push({
            path: fullPath,
            relativePath: path.relative(vaultPath, fullPath),
            name: entry.name,
            basename: entry.name.replace(/\.md$/, ''),
            metadata,
            links,
            tags
          });
        } catch (e) {
          // 跳过无法读取的文件
        }
      }
    }
  }
  walk(vaultPath);
  return files;
}

function validateVaultPath(vaultPath, homeDir) {
  const resolved = path.resolve(vaultPath);
  if (!resolved.startsWith(homeDir)) return false;
  try { return fs.statSync(resolved).isDirectory(); } catch { return false; }
}

// GET /api/browse - browse directories for vault selector
app.get('/api/browse', requireAuth, (req, res) => {
  const dirPath = req.query.path || HOME_DIR;
  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(HOME_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ path: resolved, dirs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
      });

    // GET /api/vault/paths - retrieve saved vault paths from config
  app.get('/api/vault/paths', requireAuth, (req, res) => {
  const config = loadConfigFile();
  res.json({ paths: config.vaultPaths || [] });
});

// POST /api/vault/paths - add a vault path to config
app.post('/api/vault/paths', requireAuth, (req, res) => {
  const { path: vaultPath } = req.body;
  if (!vaultPath) return res.status(400).json({ error: 'Missing path' });
  const resolved = path.resolve(vaultPath);
  if (!resolved.startsWith(HOME_DIR)) {
    return res.status(403).json({ error: 'Path must be under home directory' });
  }
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
  } catch {
    return res.status(400).json({ error: 'Directory does not exist' });
  }
  const config = loadConfigFile();
  if (!config.vaultPaths) config.vaultPaths = [];
  if (!config.vaultPaths.includes(resolved)) {
    config.vaultPaths.push(resolved);
  }
  config.sessionSecret = sessionSecret;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ paths: config.vaultPaths });
  });

  // DELETE /api/vault/paths - remove a vault path from config
  app.delete('/api/vault/paths', requireAuth, (req, res) => {
  const { path: vaultPath } = req.body;
  if (!vaultPath) return res.status(400).json({ error: 'Missing path' });
  const config = loadConfigFile();
  if (!config.vaultPaths) config.vaultPaths = [];
  config.vaultPaths = config.vaultPaths.filter(p => p !== vaultPath);
  config.sessionSecret = sessionSecret;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ paths: config.vaultPaths });
  });

  // Vault API 端点

  // GET /api/vault/graph - 构建笔记关系图
  app.get('/api/vault/graph', requireAuth, (req, res) => {
  const vaultPath = req.query.vault;
  if (!vaultPath || !validateVaultPath(vaultPath, HOME_DIR)) {
    return res.status(400).json({ error: 'Invalid vault path' });
  }

  // Check cache first
  const cacheKey = 'graph:' + vaultPath;
  const cached = vaultCache.get(cacheKey);
  if (cached) return res.json(cached);

  const files = scanVault(vaultPath);

  // 构建节点
  const nodeMap = new Map();
  files.forEach(f => {
    nodeMap.set(f.basename, {
      id: f.basename,
      label: f.basename,
      path: f.relativePath,
      tags: f.tags,
      group: path.dirname(f.relativePath) || 'root'
    });
  });

  // 构建边
  const edges = [];
  const edgeSet = new Set();
  files.forEach(f => {
    f.links.forEach(target => {
      const key = `${f.basename}->${target}`;
      if (nodeMap.has(target) && !edgeSet.has(key) && f.basename !== target) {
        edgeSet.add(key);
        edges.push({ from: f.basename, to: target });
      }
    });
  });

  const result = { nodes: Array.from(nodeMap.values()), edges };
  vaultCache.set(cacheKey, result);
  res.json(result);
});

// GET /api/vault/backlinks - 获取笔记的反向链接
app.get('/api/vault/backlinks', requireAuth, (req, res) => {
  const { vault, file } = req.query;
  if (!vault || !file || !validateVaultPath(vault, HOME_DIR)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Check cache first
  const cacheKey = 'backlinks:' + vault + ':' + file;
  const cached = vaultCache.get(cacheKey);
  if (cached) return res.json(cached);

  const targetBasename = path.basename(file, '.md');
  const files = scanVault(vault);

  const backlinks = files.filter(f =>
    f.links.some(link => link === targetBasename)
  ).map(f => ({
    path: f.relativePath,
    name: f.name,
    basename: f.basename,
    metadata: f.metadata
  }));

  const result = { file: targetBasename, backlinks };
  vaultCache.set(cacheKey, result);
  res.json(result);
});

// GET /api/vault/tags - 获取所有标签及其关联笔记
app.get('/api/vault/tags', requireAuth, (req, res) => {
  const vaultPath = req.query.vault;
  if (!vaultPath || !validateVaultPath(vaultPath, HOME_DIR)) {
    return res.status(400).json({ error: 'Invalid vault path' });
  }

  // Check cache first
  const cacheKey = 'tags:' + vaultPath;
  const cached = vaultCache.get(cacheKey);
  if (cached) return res.json(cached);

  const files = scanVault(vaultPath);
  const tagMap = {};
  files.forEach(f => {
    f.tags.forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push({ path: f.relativePath, name: f.name, basename: f.basename });
    });
  });
  const result = { tags: tagMap, totalFiles: files.length };
  vaultCache.set(cacheKey, result);
  res.json(result);
});

// POST /api/vault/parse - 解析单个 Markdown 文件
app.post('/api/vault/parse', requireAuth, (req, res) => {
  const { file, vault } = req.body;
  if (!file) return res.status(400).json({ error: 'Missing file parameter' });

  const filePath = vault ? path.join(vault, file) : file;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(HOME_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const { metadata, body } = parseFrontmatter(content);
    const links = extractWikiLinks(content);
    const tags = extractTags(content);
    const headings = [];
    body.split('\n').forEach(line => {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) headings.push({ level: m[1].length, text: m[2].trim() });
    });

    res.json({
      metadata,
      body,
      links,
      tags,
      headings,
      basename: path.basename(resolved, '.md')
    });
  } catch (e) {
    res.status(404).json({ error: 'File not found', message: e.message });
  }
});

// POST /api/vault/write — Create or update a markdown file
app.post('/api/vault/write', requireAuth, (req, res) => {
    const { vault, file, content } = req.body;
    if (!vault || !file) return res.status(400).json({ error: 'vault and file required' });
    if (!validateVaultPath(vault, HOME_DIR)) return res.status(400).json({ error: 'Invalid vault path' });
    const filePath = path.join(vault, file);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(vault))) return res.status(400).json({ error: 'Path traversal' });
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
        fs.writeFileSync(resolved, content || '', 'utf-8');
        if (vaultCache) { vaultCache.invalidatePrefix(vault); }
        res.json({ success: true, path: file });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/vault/file — Delete a file
app.delete('/api/vault/file', requireAuth, (req, res) => {
    const { vault, file } = req.body;
    if (!vault || !file) return res.status(400).json({ error: 'vault and file required' });
    if (!validateVaultPath(vault, HOME_DIR)) return res.status(400).json({ error: 'Invalid vault path' });
    const filePath = path.join(vault, file);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(vault))) return res.status(400).json({ error: 'Path traversal' });
    try {
        if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
        fs.unlinkSync(resolved);
        if (vaultCache) { vaultCache.invalidatePrefix(vault); }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// JSON error handler for API routes
app.use("/api", (err, req, res, next) => {
    console.error("API Error:", err.message);
    res.status(err.status || 500).json({ error: "Internal server error", message: err.message });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  文件管理器已启动\n  http://<服务器IP>:${PORT}\n  Home: ${HOME_DIR}\n`);
});
