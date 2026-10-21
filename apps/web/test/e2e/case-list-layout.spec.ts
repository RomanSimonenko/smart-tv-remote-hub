import {expect} from '@playwright/test';
import {test} from '../support/tv-fixture.js';
import {randomUUID} from 'node:crypto';

test('case titles get remaining width and stay within two lines; sidebar avatar has no circle',async({page,tv},testInfo)=>{
 await tv.setupAndLogin(page);
 const title='Синтетический длинный тест-кейс — переход между настройками и проверка всех надписей на экране '.repeat(2).trim();
 const item={id:randomUUID(),title,description:'',group:'',status:'ready',version:1,createdAt:1,updatedAt:1,steps:[{id:randomUUID(),kind:'given',text:'Синтетический шаг'}]};
 await page.route('**/api/test-cases',route=>route.fulfill({json:{cases:[item]}}));
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();
 for(const width of [1432,1052]){
  await page.setViewportSize({width,height:1248});
  const row=page.getByRole('row',{name:`Открыть тест-кейс: ${title}`,exact:true});
  await expect(row).toBeVisible();
  const sizes=await row.locator('td').evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect().width));
  expect(sizes[0]).toBeGreaterThan(sizes[1]!);
  expect(sizes[4]).toBe(64);
  const text=row.locator('.case-title');
  const height=await text.evaluate(element=>({height:element.getBoundingClientRect().height,line:parseFloat(getComputedStyle(element).lineHeight),overflow:element.scrollHeight>element.clientHeight}));
  expect(height.height).toBeLessThanOrEqual(height.line*2+1);
  expect(height.overflow).toBe(true);
  await expect(row.locator('.case-open')).toHaveAttribute('title',title);
  await page.screenshot({path:testInfo.outputPath(`cases-${width}.png`)});
 }
 const avatar=page.locator('.sidebar-profile .profile-avatar');
 await expect(avatar).toHaveCSS('border-top-width','0px');
 await expect(avatar).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});
