import { z } from 'zod';

export const profileAvatarIds = ['user', 'cat', 'dog', 'deer', 'robot', 'rocket', 'planet', 'star', 'leaf', 'tree', 'mountain', 'sun', 'moon', 'gamepad', 'headphones', 'monitor'] as const;
export const profileUpdateSchema = z.strictObject({
  displayName: z.string().trim().refine(value => [...value].length >= 1 && [...value].length <= 64),
  avatarId: z.enum(profileAvatarIds).nullable(),
});
export const profileResponseSchema = z.strictObject({
  username: z.string(),
  // Existing login names may contain whitespace; reads preserve the migration fallback exactly.
  displayName: z.string().refine(value => [...value].length >= 1 && [...value].length <= 64),
  avatarId: z.enum(profileAvatarIds).nullable(),
});
export type ProfileUpdate = Readonly<z.infer<typeof profileUpdateSchema>>;
export type OwnerProfile = Readonly<z.infer<typeof profileResponseSchema>>;
