import { IconUser, IconCat, IconDog, IconDeer, IconRobot, IconRocket, IconPlanet, IconStar, IconLeaf, IconTree, IconMountain, IconSun, IconMoon, IconDeviceGamepad, IconHeadphones, IconDeviceDesktop } from '@tabler/icons-react';
import type { OwnerProfile } from '@remote-webos-tv/contracts';

export const avatarOptions = {
  user: { label: 'Пользователь', Icon: IconUser }, cat: { label: 'Кот', Icon: IconCat },
  dog: { label: 'Собака', Icon: IconDog }, deer: { label: 'Олень', Icon: IconDeer },
  robot: { label: 'Робот', Icon: IconRobot }, rocket: { label: 'Ракета', Icon: IconRocket },
  planet: { label: 'Планета', Icon: IconPlanet }, star: { label: 'Звезда', Icon: IconStar },
  leaf: { label: 'Лист', Icon: IconLeaf }, tree: { label: 'Дерево', Icon: IconTree },
  mountain: { label: 'Гора', Icon: IconMountain }, sun: { label: 'Солнце', Icon: IconSun },
  moon: { label: 'Луна', Icon: IconMoon }, gamepad: { label: 'Геймпад', Icon: IconDeviceGamepad },
  headphones: { label: 'Наушники', Icon: IconHeadphones }, monitor: { label: 'Монитор', Icon: IconDeviceDesktop },
};
export function ProfileAvatar({ avatarId, displayName }: Pick<OwnerProfile, 'avatarId' | 'displayName'>) {
  const Icon = avatarId ? avatarOptions[avatarId].Icon : null;
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toLocaleUpperCase('ru');
  return <span className="profile-avatar" aria-hidden="true">{Icon ? <Icon /> : initials}</span>;
}
