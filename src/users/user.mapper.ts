import type { User } from '../generated/prisma/client';

/** What the API exposes about a user. Never includes the password hash. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneCountryCode: user.phoneCountryCode,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    language: user.language,
    role: user.role,
    emailVerified: !!user.emailVerifiedAt,
    notificationsEnabled: user.notificationsEnabled,
    createdAt: user.createdAt,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
