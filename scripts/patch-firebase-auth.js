import fs from 'node:fs';
import path from 'node:path';

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  const targetResolve = `    resolve(cred) {
        debugAssert(this.pendingPromise, 'Pending promise was never set');
        this.pendingPromise.resolve(cred);
        this.unregisterAndCleanUp();
    }`;

  const safeResolve = `    resolve(cred) {
        if (!this.pendingPromise) return;
        this.pendingPromise.resolve(cred);
        this.unregisterAndCleanUp();
    }`;

  const targetReject = `    reject(error) {
        debugAssert(this.pendingPromise, 'Pending promise was never set');
        this.pendingPromise.reject(error);
        this.unregisterAndCleanUp();
    }`;

  const safeReject = `    reject(error) {
        if (!this.pendingPromise) return;
        this.pendingPromise.reject(error);
        this.unregisterAndCleanUp();
    }`;

  if (content.includes(targetResolve)) {
    content = content.replace(targetResolve, safeResolve);
    modified = true;
  }

  if (content.includes(targetReject)) {
    content = content.replace(targetReject, safeReject);
    modified = true;
  }

  // Also handle minified/slightly different spacing if any
  const regexResolve = /resolve\((\w+)\)\s*\{\s*debugAssert\(this\.pendingPromise,\s*['"]Pending promise was never set['"]\);/g;
  if (regexResolve.test(content)) {
    content = content.replace(regexResolve, 'resolve($1) { if (!this.pendingPromise) return;');
    modified = true;
  }

  const regexReject = /reject\((\w+)\)\s*\{\s*debugAssert\(this\.pendingPromise,\s*['"]Pending promise was never set['"]\);/g;
  if (regexReject.test(content)) {
    content = content.replace(regexReject, 'reject($1) { if (!this.pendingPromise) return;');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Patch] Successfully patched Firebase Auth assertion in: ${filePath}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      patchFile(fullPath);
    }
  }
}

const authDist = path.resolve(process.cwd(), 'node_modules/@firebase/auth/dist');
walkDir(authDist);
