import './sentry';
import { tgReady } from './lib/telegram';
import ReactDOM from 'react-dom/client';

// ── Защита от падения "NotFoundError: Failed to execute 'removeChild' on 'Node'" ──
// В Telegram WebView (старый WebKit) при анимациях/смене роутов React и framer-motion
// иногда пытаются удалить/вставить узел, который уже отцеплён от родителя. Браузер
// кидает исключение → срабатывает ErrorBoundary, а старый DOM остаётся висеть.
// Делаем removeChild/insertBefore безопасными: в этом единственном «битом» случае
// просто не трогаем DOM (в норме parentNode === this и поведение не меняется).
(function patchDomNodeRaces() {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const realRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return realRemove.call(this, child) as T;
  };
  const realInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) return newNode;
    return realInsert.call(this, newNode, refNode) as T;
  };
})();

// Снимаем нативный спиннер Telegram до React (иначе «бесконечная загрузка» в клиенте TG).
tgReady();
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

// BrowserRouter: HashRouter затирал #tgWebAppData и ломал вход в Telegram Mini App.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
