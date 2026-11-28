import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorScreen';
import { installErrorHandlers } from './lib/diagnostics';
import './styles.css';

installErrorHandlers();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
