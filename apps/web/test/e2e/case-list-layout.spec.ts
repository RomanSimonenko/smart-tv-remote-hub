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

test('editor keeps step descriptions readable at the supported minimum width',async({page,tv},testInfo)=>{
 await tv.setupAndLogin(page);
 await expect(page.getByRole('button',{name:'Добавить ТВ',exact:true})).toBeVisible();
 const session=await(await page.request.get(tv.origin+'/api/auth/session')).json();
 const item={id:randomUUID(),title:'Проверка читаемости шагов',description:'',group:'Демо',steps:[
  {id:randomUUID(),kind:'given',text:'Пользователь находится на главной странице'},
  {id:randomUUID(),kind:'when',text:'Пользователь открывает раздел настроек'},
  {id:randomUUID(),kind:'then',text:'Пользователь видит заголовок настроек'},
 ]};
 expect((await page.request.post(tv.origin+'/api/test-cases',{headers:{origin:tv.origin,'x-csrf-token':session.csrfToken},data:item})).status()).toBe(201);
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:item.title,exact:true}).click();
 await expect(page.getByRole('heading',{name:'Редактор тест-кейса',exact:true})).toBeVisible();
 await expect(page.locator('.case-step-text')).toHaveCount(3);
 for(const width of [1280,1440]){
  await page.setViewportSize({width,height:900});
  for(const text of await page.locator('.case-step-text').all()){
   const size=await text.evaluate(e=>({width:e.getBoundingClientRect().width,visible:e.clientHeight,full:e.scrollHeight}));
   expect(size.width).toBeGreaterThanOrEqual(200);
   expect(size.full).toBeLessThanOrEqual(size.visible);
  }
  await expect(page.getByRole('button',{name:'Дублировать шаг 1 Дано',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Выбрать шаг 1 Дано:/}).click();
  await expect(page.getByLabel('Описание шага',{exact:true})).toHaveValue(item.steps[0]!.text);
  await page.screenshot({path:testInfo.outputPath(`editor-readable-${width}.png`)});
  await page.getByRole('button',{name:'Закрыть параметры шага',exact:true}).click();
 }
});
