/**
 * 图床后端服务示例 - 部署到VPS使用
 * 
 * 安装依赖：
 * npm install express multer cors
 * 
 * 运行：
 * node server.js
 * 
 * 生产环境建议使用 PM2：
 * npm install -g pm2
 * pm2 start server.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

const envCandidates = [
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env')
];

const parseEnvValue = (rawValue) => {
  if (rawValue === undefined) {
    return '';
  }

  let value = rawValue;

  const trimmed = value.trim();
  const startsWithQuote = trimmed.startsWith('"') || trimmed.startsWith("'");
  const endsWithQuote = trimmed.endsWith('"') || trimmed.endsWith("'");

  if (!startsWithQuote) {
    const commentIndex = value.indexOf('#');
    if (commentIndex !== -1) {
      value = value.slice(0, commentIndex);
    }
  }

  value = value.trim();

  if (!value) {
    return '';
  }

  if (startsWithQuote && endsWithQuote && value.length >= 2) {
    value = value.slice(1, -1);
  }

  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
};

const loadEnvFile = (envPath) => {
  if (!fs.existsSync(envPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      if (!line || line.trim().startsWith('#')) {
        continue;
      }

      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_\.-]*)\s*=\s*(.*)\s*$/);

      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = parseEnvValue(rawValue);
      }
    }

    return true;
  } catch (error) {
    console.warn(`读取环境变量文件失败: ${envPath}`, error);
    return false;
  }
};

let envLoaded = false;
for (const envPath of envCandidates) {
  if (loadEnvFile(envPath)) {
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  loadEnvFile(path.resolve('.env'));
}

const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const resolveFrontendDistDir = () => {
  const candidates = [];

  if (process.env.FRONTEND_DIST_DIR) {
    const envPath = process.env.FRONTEND_DIST_DIR.trim();

    if (envPath) {
      if (path.isAbsolute(envPath)) {
        candidates.push(envPath);
      } else {
        candidates.push(path.resolve(__dirname, envPath));
        candidates.push(path.resolve(process.cwd(), envPath));
      }
    }
  }

  candidates.push(path.resolve(__dirname, '..'));
  candidates.push(path.resolve(__dirname, '../dist'));
  candidates.push(path.resolve(process.cwd(), 'dist'));
  candidates.push(path.resolve(process.cwd(), '..'));

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }

  return null;
};

const FRONTEND_DIST_DIR = resolveFrontendDistDir();
const hasFrontendBuild = Boolean(FRONTEND_DIST_DIR);

// CORS配置 - 允许您的前端域名访问
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const normalizeBoolean = (value, defaultValue) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const allowSameHostOrigin = normalizeBoolean(process.env.ALLOW_SAME_HOST_ORIGIN, true);

const baseCorsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
};

const corsOptionsDelegate = (req, callback) => {
  const requestOrigin = req.header('Origin');

  if (!requestOrigin) {
    return callback(null, { ...baseCorsOptions, origin: true });
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) {
    return callback(null, { ...baseCorsOptions, origin: requestOrigin });
  }

  if (allowSameHostOrigin) {
    try {
      const originHost = new URL(requestOrigin).host;
      const requestHost = req.header('Host');

      if (originHost && requestHost && originHost === requestHost) {
        return callback(null, { ...baseCorsOptions, origin: requestOrigin });
      }
    } catch (error) {
      console.warn(`无法解析 Origin: ${requestOrigin}`, error);
    }
  }

  return callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
};

app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate));

app.use(express.json());

const apiPagePassword = (process.env.API_PAGE_PASSWORD || '').trim();

const buildSecret = () => {
  if (apiPagePassword) {
    return {
      value: crypto.createHash('sha256').update(apiPagePassword, 'utf8').digest('hex'),
      ephemeral: false
    };
  }

  const randomSecret = crypto.randomBytes(32).toString('hex');
  console.warn('API_PAGE_PASSWORD 未配置，已使用临时密钥。重启服务后已生成的 API 密钥将失效。');
  return { value: randomSecret, ephemeral: true };
};

const { value: apiKeySecret, ephemeral: isEphemeralSecret } = buildSecret();

const CLIENT_ID_PATTERN = /^[a-f0-9]{32,128}$/;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;

const createSignature = (clientId) => {
  return crypto.createHmac('sha256', apiKeySecret).update(clientId, 'utf8').digest('hex');
};

const createApiKeyForClientId = (clientId) => {
  const normalized = typeof clientId === 'string' ? clientId.trim().toLowerCase() : '';
  if (!CLIENT_ID_PATTERN.test(normalized)) {
    throw new Error('客户端标识格式不正确');
  }
  const signature = createSignature(normalized);
  return `${normalized}.${signature}`;
};

const verifyApiKey = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') {
    return { valid: false };
  }

  const trimmedKey = rawKey.trim();
  const segments = trimmedKey.split('.');

  if (segments.length !== 2) {
    return { valid: false };
  }

  const [clientId, signature] = segments;

  if (!CLIENT_ID_PATTERN.test(clientId) || !SIGNATURE_PATTERN.test(signature)) {
    return { valid: false };
  }

  const expectedSignature = createSignature(clientId);

  let providedBuffer;
  let expectedBuffer;

  try {
    providedBuffer = Buffer.from(signature, 'hex');
    expectedBuffer = Buffer.from(expectedSignature, 'hex');
  } catch (error) {
    return { valid: false };
  }

  if (providedBuffer.length !== expectedBuffer.length) {
    return { valid: false };
  }

  const valid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  return valid ? { valid: true, clientId } : { valid: false };
};

const resolveClientDirectory = (clientId) => {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('客户端标识不合法');
  }

  const clientDir = path.join(UPLOAD_DIR, clientId);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }
  return clientDir;
};

const requireApiKey = (req, res, next) => {
  const headerKey = req.get('x-api-key')
    || (() => {
      const authorization = req.get('authorization') || '';
      if (authorization.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7).trim();
      }
      return '';
    })();

  const { valid, clientId } = verifyApiKey(headerKey);

  if (valid) {
    req.clientId = clientId;
    return next();
  }

  return res.status(401).json({ error: 'Invalid API key' });
};

app.post('/api/auth/api-key', (req, res) => {
  if (!apiPagePassword) {
    return res.status(400).json({ error: '访问密码未配置，无法生成 API 密钥' });
  }

  const password = (req.body && req.body.password ? String(req.body.password) : '').trim();
  const clientId = (req.body && req.body.clientId ? String(req.body.clientId) : '').trim().toLowerCase();

  if (!password || password !== apiPagePassword) {
    return res.status(401).json({ error: '访问密码不正确' });
  }

  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return res.status(400).json({ error: '客户端标识格式不正确' });
  }

  try {
    const apiKey = createApiKeyForClientId(clientId);
    return res.json({
      success: true,
      apiKey,
      clientId,
      ephemeralSecret: isEphemeralSecret
    });
  } catch (error) {
    console.error('生成 API 密钥失败:', error);
    return res.status(500).json({ error: '生成 API 密钥失败' });
  }
});

// 配置文件存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const clientId = req.clientId || '';
      const clientDir = resolveClientDirectory(clientId);
      cb(null, clientDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳-随机数-原始文件名
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// 文件过滤器 - 只允许图片
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP, SVG)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制10MB
  }
});

// 静态文件服务 - 提供图片访问
app.use('/images', express.static(UPLOAD_DIR));

// 上传接口
app.post('/api/upload', requireApiKey, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const uploadedFiles = req.files.map(file => ({
      name: file.originalname,
      url: `/images/${req.clientId}/${file.filename}`,
      fullUrl: `${req.protocol}://${req.get('host')}/images/${req.clientId}/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 删除图片接口
app.delete('/api/images/:filename', requireApiKey, (req, res) => {
  try {
    const filename = req.params.filename;
    const clientDir = resolveClientDirectory(req.clientId);
    const normalizedPath = path.resolve(clientDir, filename);

    if (!normalizedPath.startsWith(clientDir)) {
      return res.status(400).json({ error: '非法的文件路径' });
    }

    if (fs.existsSync(normalizedPath)) {
      fs.unlinkSync(normalizedPath);
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (error) {
    console.error('删除错误:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 获取图片列表接口
app.get('/api/images', requireApiKey, (req, res) => {
  try {
    const clientDir = resolveClientDirectory(req.clientId);
    const files = fs.readdirSync(clientDir);
    const imageFiles = files.map(filename => {
      const filePath = path.join(clientDir, filename);
      const stats = fs.statSync(filePath);
      return {
        name: filename,
        url: `/images/${req.clientId}/${filename}`,
        fullUrl: `${req.protocol}://${req.get('host')}/images/${req.clientId}/${filename}`,
        size: stats.size,
        uploadTime: stats.mtime
      };
    });

    res.json({
      success: true,
      files: imageFiles
    });
  } catch (error) {
    console.error('获取列表错误:', error);
    res.status(500).json({ error: '获取列表失败' });
  }
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '图床服务运行正常' });
});

if (hasFrontendBuild) {
  app.use(express.static(FRONTEND_DIST_DIR, {
    setHeaders: (res, filePath) => {
      if (path.extname(filePath) === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/images')) {
      return next();
    }

    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
}

// 错误处理
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ error: error.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`图床服务器运行在端口 ${PORT}`);
  console.log(`上传目录: ${UPLOAD_DIR}`);
  if (hasFrontendBuild) {
    console.log(`前端静态资源目录: ${FRONTEND_DIST_DIR}`);
  } else {
    console.warn('未检测到前端静态资源构建目录，跳过静态资源托管');
  }
});
