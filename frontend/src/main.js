import { jsx as _jsx } from "react/jsx-runtime";
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
// Telegram Mini App лучше работает с HashRouter (не ломается навигация в WebView)
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(HashRouter, { children: _jsx(App, {}) }));
