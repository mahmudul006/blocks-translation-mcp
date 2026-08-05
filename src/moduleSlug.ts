/** APP_USER_MANAGEMENT -> app-user-management (lowercase, underscores to hyphens). */
export function moduleSlugFromPrefix(prefix: string): string {
  return prefix.toLowerCase().replace(/_/g, '-');
}
