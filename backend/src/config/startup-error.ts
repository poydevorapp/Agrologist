export function startupErrorMessage(error: unknown, host: string, port: number): string {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE') {
    return `Backend could not start because ${host}:${port} is already in use. ` +
      `Another backend may already be running; check http://${host}:${port}/health or stop the old process.`;
  }
  return 'Backend startup failed. Check environment configuration and database connectivity.';
}
