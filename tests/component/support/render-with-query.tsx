import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import * as React from "react";

/**
 * Fresh Query client per check: no retries (a failing stub must surface as
 * an error state, not a silent retry), no cross-check cache.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function renderWithQuery(ui: React.ReactElement, options?: RenderOptions) {
  const client = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    options
  );
  return { client, ...result };
}
