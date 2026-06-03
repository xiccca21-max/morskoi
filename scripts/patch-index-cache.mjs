import fs from 'node:fs';
const p = '/app/frontend/dist/index.html';
let t = fs.readFileSync(p, 'utf8');
t = t
  .replace(/polyfills-legacy-dGFuDj3Q\.js/g, 'polyfills-legacy-dGFuDj3Q.js?b=cffix3')
  .replace(/index-legacy-Drl6ocFW\.js/g, 'index-legacy-Drl6ocFW.js?b=cffix3');
fs.writeFileSync(p, t);
console.log(t.slice(-380));
