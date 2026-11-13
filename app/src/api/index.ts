/* The app's one door to the server: typed endpoints, errors, cache hooks, live events. */
export { ApiError, apiBase, http, isApiError, request, setApiBase } from './client';
export { checkServer, type Health, parseHealth, type Status, startBackend } from './health';
export {
  clearQueryCache,
  getQueryData,
  invalidate,
  type QueryState,
  setQueryData,
  useMutation,
  useQuery,
} from './query';
export { openEventStream, type StreamStatus, streamUrl, useEventStream } from './sse';
export { studio } from './studio';
export * from './types';
