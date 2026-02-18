const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

const app = express();

// 配置文件
const CONFIG_FILE = path.join(__dirname, 'config.json');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

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
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
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

// 认证中间件
function requireAuth(req, res, next) {
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
        return res.redirect('/');
    }

    if (verifyPassword(password)) {
        req.session.authenticated = true;
        return res.redirect('/');
    }

    res.redirect('/login?error=' + encodeURIComponent('密码错误'));
});

// 登出
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
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

// 主页面
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  文件管理器已启动\n  http://<服务器IP>:${PORT}\n  Home: ${HOME_DIR}\n`);
});
