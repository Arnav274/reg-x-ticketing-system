/**
 * Where the backend lives. The single owner of this value.
 *
 * Its own module rather than a named export from ticketsApi.ts, even though
 * classifyApi.ts already imports types from there. A base URL is not a tickets
 * concept, and useAuthContext.ts should not have to depend on the ticket API
 * module to learn where the server is. ticketsApi.ts had already become the
 * default home for shared frontend constants (CATEGORIES, PRODUCT_NAMES), and
 * this stops that trend rather than extending it.
 *
 * Deliberately a constant, not configuration. Making it environment-driven is a
 * deployment concern rather than de-duplication; consolidating here means there
 * is exactly one place for that to land if it is ever wanted.
 */
export const API_BASE_URL = "http://localhost:3000";
