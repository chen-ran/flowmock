// Ported from Floway apps/web/src/lib/dashboard-route-handle.ts (MIT). See NOTICE.md.
interface DashboardRouteHandle {
  contentLayout: 'workspace';
}

export const dashboardWorkspaceHandle = {
  contentLayout: 'workspace',
} as const satisfies DashboardRouteHandle;

export const isDashboardWorkspaceHandle = (value: unknown): value is DashboardRouteHandle =>
  !!value && typeof value === 'object' && (value as { contentLayout?: unknown }).contentLayout === 'workspace';
