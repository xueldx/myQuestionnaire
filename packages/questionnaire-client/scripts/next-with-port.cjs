const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 兼容从 monorepo 根目录启动，手动加载 client 本地环境变量
try {
  const dotenv = require('dotenv');
  const appDir = path.resolve(__dirname, '..');
  const envFiles = ['.env', '.env.local'];

  for (const file of envFiles) {
    const filePath = path.join(appDir, file);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: true });
    }
  }
} catch (error) {
  // 没装 dotenv 时继续使用系统环境变量
}

const command = process.argv[2] || 'dev';
const args = [require.resolve('next/dist/bin/next'), command];

if (command === 'dev') {
  args.push('--turbopack');
}

if (command === 'dev' || command === 'start') {
  const port = process.env.CLIENT_PORT || process.env.PORT || '8878';
  args.push('-p', port);
}

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
