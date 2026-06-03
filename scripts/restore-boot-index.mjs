import fs from 'node:fs';

const p = '/app/frontend/dist/index.html';
const bootBlock = `    <div id="root">
      <div class="boot">
        <h1 class="boot__title">Морской&nbsp;Бой</h1>
        <p class="boot__sub">Загрузка</p>
      </div>
    </div>`;

const bootCss = `      .boot {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        text-align: center;
        background-color: #EAE6D7;
      }
      .boot__title {
        font-family: 'Oswald', Impact, sans-serif;
        font-size: 30px;
        letter-spacing: 0.2em;
        font-weight: 700;
        color: #000000;
        text-transform: uppercase;
        margin: 0;
      }
      .boot__sub {
        font-family: 'Oswald', Impact, sans-serif;
        font-size: 12px;
        letter-spacing: 0.26em;
        font-weight: 500;
        color: #444444;
        text-transform: uppercase;
        margin: 0;
      }`;

let t = fs.readFileSync(p, 'utf8');
t = t.replace(/\s+#root:empty::before\s*\{[^}]+\}/s, '');
if (!t.includes('class="boot"')) {
  t = t.replace(/html, body \{ margin: 0; background-color: #EAE6D7; \}/, `html, body { margin: 0; background-color: #EAE6D7; }\n${bootCss}`);
  t = t.replace(/<div id="root"><\/div>/, bootBlock);
  t = t.replace(/<div id="root">\s*<\/div>/, bootBlock);
}
fs.writeFileSync(p, t);
console.log('restored boot in', p);
