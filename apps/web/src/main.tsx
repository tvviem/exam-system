import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { retryDelay, shouldRetry } from './lib/query-policy';
import { registerServiceWorker } from './lib/register-sw';
import { routeTree } from './routeTree.gen';

registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry, retryDelay } },
});
const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy phần tử #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
