import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isBuild = args.includes('build');
const isPreview = args.includes('preview');

// 1. Check if standard local node_modules has vite (e.g. Render, CI, Linux, standard npm install)
const localViteBin = path.resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const localViteJs = path.resolve('node_modules', 'vite', 'bin', 'vite.js');

// 2. Fallback location used on Windows to bypass Google Drive virtual file system locks
const externalViteJs = 'C:/Users/Ashwin/qc_frontend_modules/node_modules/vite/bin/vite.js';
const externalConfig = 'C:/Users/Ashwin/qc_frontend_modules/vite.config.mjs';

let cmd;
let cmdArgs;

if (fs.existsSync(localViteBin)) {
  cmd = localViteBin;
  cmdArgs = args;
} else if (fs.existsSync(localViteJs)) {
  cmd = process.execPath;
  cmdArgs = [localViteJs, ...args];
} else if (fs.existsSync(externalViteJs)) {
  cmd = process.execPath;
  cmdArgs = [externalViteJs, ...args];
  if (fs.existsSync(externalConfig) && !args.includes('--config')) {
    cmdArgs.push('--config', externalConfig);
  }
  if (!isBuild && !isPreview && !args.includes('--host')) {
    cmdArgs.push('--host', '0.0.0.0');
  }
} else {
  cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  cmdArgs = ['vite', ...args];
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
