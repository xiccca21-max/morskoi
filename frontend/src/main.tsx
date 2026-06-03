import './sentry';
import { tgReady } from './lib/telegram';
import ReactDOM from 'react-dom/client';

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
