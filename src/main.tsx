import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { RecoveryBoundary } from './components/RecoveryBoundary';
import './styles.css';
import 'katex/dist/katex.min.css';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <RecoveryBoundary>
        <App />
      </RecoveryBoundary>
    </BrowserRouter>
  </QueryClientProvider>,
);
