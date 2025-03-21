import { execFileSync } from 'child_process';
import os from 'os';

async function runScripts() {
  switch (os.platform()) {
  case 'darwin':
    await (await import('./download/tools.mjs')).default('darwin');
    await (await import('./download/hyperkit.mjs')).default();
    await (await import('./download/lima.mjs')).default();
    break;
  case 'win32':
    await (await import('./download/tools.mjs')).default('win32');
    await (await import('./download/tools.mjs')).default('linux');
    await (await import('./download/wsl.mjs')).default();
    break;
  }
}

runScripts().then(() => {
  execFileSync('node', ['node_modules/electron-builder/out/cli/cli.js', 'install-app-deps'], { stdio: 'inherit' });
})
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
