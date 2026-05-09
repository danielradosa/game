// Bump this when SaveData shape changes. Client-side migrate(data, from)
// in /src/game/save-migrate.ts handles forward migration. Server treats
// the blob as opaque.
export const SAVE_VERSION = 1 as const
export type SaveVersion = typeof SAVE_VERSION
