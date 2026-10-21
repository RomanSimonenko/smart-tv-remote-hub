import type { TvIdentity, TvPlatform } from '@remote-webos-tv/contracts';

export function tvPlatformLabel(platform: TvPlatform, identity: TvIdentity | undefined): string {
  const name = platform === 'tizen' ? 'Tizen' : platform === 'whale' ? 'Whale OS' : 'webOS';
  return identity?.platformVersion ? `${name} ${identity.platformVersion}` : name;
}

export function TvBrand({ platform, className }: { platform: TvPlatform; className?: string }) {
  const brand = platform === 'whale' ? 'Philips' : platform === 'tizen' ? 'Samsung' : 'LG';
  return <img className={className} data-platform={platform} src={`/${brand.toLowerCase()}-logo.svg`} alt={brand} />;
}
