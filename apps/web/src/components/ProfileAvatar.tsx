import { IconUser, IconCat, IconDog, IconDeer, IconRobot, IconRocket, IconPlanet, IconStar, IconLeaf, IconTree, IconMountain, IconSun, IconMoon, IconDeviceGamepad, IconHeadphones, IconDeviceDesktop } from '@tabler/icons-react';
import type { OwnerProfile } from '@remote-webos-tv/contracts';

export const avatarOptions = {
  user: { label: 'avatarUser', Icon: IconUser }, cat: { label: 'avatarCat', Icon: IconCat },
  dog: { label: 'avatarDog', Icon: IconDog }, deer: { label: 'avatarDeer', Icon: IconDeer },
  robot: { label: 'avatarRobot', Icon: IconRobot }, rocket: { label: 'avatarRocket', Icon: IconRocket },
  planet: { label: 'avatarPlanet', Icon: IconPlanet }, star: { label: 'avatarStar', Icon: IconStar },
  leaf: { label: 'avatarLeaf', Icon: IconLeaf }, tree: { label: 'avatarTree', Icon: IconTree },
  mountain: { label: 'avatarMountain', Icon: IconMountain }, sun: { label: 'avatarSun', Icon: IconSun },
  moon: { label: 'avatarMoon', Icon: IconMoon }, gamepad: { label: 'avatarGamepad', Icon: IconDeviceGamepad },
  headphones: { label: 'avatarHeadphones', Icon: IconHeadphones }, monitor: { label: 'avatarMonitor', Icon: IconDeviceDesktop },
};
export function ProfileAvatar({ avatarId, displayName }: Pick<OwnerProfile, 'avatarId' | 'displayName'>) {
  const Icon = avatarId ? avatarOptions[avatarId].Icon : null;
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toLocaleUpperCase('ru');
  return <span className="profile-avatar" aria-hidden="true">{Icon ? <Icon /> : initials}</span>;
}
