import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('public/index.html','utf8');
const integration = readFileSync('public/integration.js','utf8');
for (const marker of ['id="main-content"','id="auth-modal"','id="sell-modal"','id="header-user-area"','id="sell-product-form"','src="integration.js"','loginGoogle()']) {
  if (!html.includes(marker)) throw new Error('Elemen Tukuin yang dibutuhkan tidak ada: '+marker);
}
for (const marker of ['firebase.auth.GoogleAuthProvider','api(\'uploadSignature\')','api(\'saveProduct\'','syncNow']) {
  if (!integration.includes(marker)) throw new Error('Fitur integrasi hilang: '+marker);
}
for (const file of ['firestore.rules','public/firebase-config.js','netlify/functions/api.mjs','netlify/functions/sync-scheduled.mjs','server/shared.mjs']) {
  if (!existsSync(file)) throw new Error('File wajib hilang: '+file);
}
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
for (const [i, match] of inlineScripts.entries()) new vm.Script(match[1],{ filename:`index.html inline script ${i+1}`});
new vm.Script(integration,{filename:'integration.js'});
console.log('OK: HTML Tukuin, JavaScript dan file integrasi valid secara statis.');
console.log('Catatan: login API, Firestore, Cloudinary, dan Sheets perlu pengujian akun nyata setelah deploy.');
