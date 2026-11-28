import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorScreen';
import GamingCompanion from './components/GamingCompanion';
import { installErrorHandlers } from './lib/diagnostics';
import './styles.css';
import './hud.css';
import './automation.css';
import './gaming.css';

installErrorHandlers();

const companion = new URLSearchParams(window.location.search).get('companion') === '1';
if (companion) document.documentElement.classList.add('is-gaming-companion');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      {companion ? <GamingCompanion /> : <App />}
    </ErrorBoundary>,
  );
}
