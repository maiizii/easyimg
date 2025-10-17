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
const dotenv = require('dotenv');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

const envCandidates = [
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env')
];

let envLoaded = false;
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  dotenv.config();
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

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

const validApiKeys = (process.env.API_KEYS || process.env.API_KEY || '')
  .split(',')
  .map(key => key.trim())
  .filter(Boolean);

const requireApiKey = (req, res, next) => {
  if (validApiKeys.length === 0) {
    return next();
  }

  const headerKey = req.get('x-api-key');
  if (headerKey && validApiKeys.includes(headerKey)) {
    return next();
  }

  return res.status(401).json({ error: 'Invalid API key' });
};

// 配置文件存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳-随机数-原始文件名
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
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
      url: `/images/${file.filename}`,
      fullUrl: `${req.protocol}://${req.get('host')}/images/${file.filename}`,
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
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
    const files = fs.readdirSync(UPLOAD_DIR);
    const imageFiles = files.map(filename => {
      const filePath = path.join(UPLOAD_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        name: filename,
        url: `/images/${filename}`,
        fullUrl: `${req.protocol}://${req.get('host')}/images/${filename}`,
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
