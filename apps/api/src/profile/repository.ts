import type Database from 'better-sqlite3';
import { profileResponseSchema, profileUpdateSchema, type OwnerProfile, type ProfileUpdate } from '@remote-webos-tv/contracts';

export interface ProfileRepository { read(): OwnerProfile; update(input: ProfileUpdate): OwnerProfile }
export function createProfileRepository(sqlite: Database.Database): ProfileRepository {
  const select = sqlite.prepare('SELECT username, COALESCE(display_name, username) AS displayName, avatar_id AS avatarId FROM owner WHERE id = 1');
  const update = sqlite.prepare('UPDATE owner SET display_name = ?, avatar_id = ? WHERE id = 1');
  const read = () => profileResponseSchema.parse(select.get());
  return {
    read,
    update(input) {
      const value = profileUpdateSchema.parse(input);
      return sqlite.transaction(() => {
        if (update.run(value.displayName, value.avatarId).changes !== 1) throw new Error('Owner profile is unavailable');
        return read();
      })();
    },
  };
}
