import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import {TvBrand,tvPlatformLabel} from './tv-presentation.js';
afterEach(cleanup);
test.each([
 ['webos','LG','6.5.3','webOS'],
 ['tizen','Samsung','9.0','Tizen'],
 ['whale','Philips','2.0','Whale OS'],
] as const)('%s uses its logo and the supplied OS version', (platform,brand,version,name)=>{
 render(<TvBrand platform={platform}/>);
 expect(screen.getByRole('img',{name:brand}).getAttribute('src')).toBe(`/${brand.toLowerCase()}-logo.svg`);
 expect(tvPlatformLabel(platform,{model:'Synthetic TV',platformVersion:version,firmwareVersion:'99.8'})).toBe(`${name} ${version}`);
 expect(tvPlatformLabel(platform,{model:'Synthetic TV',firmwareVersion:'99.8'})).toBe(name);
});
