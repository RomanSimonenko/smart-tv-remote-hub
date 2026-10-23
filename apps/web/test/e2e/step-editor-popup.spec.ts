import {expect,type Locator} from '@playwright/test';
import {test} from '../support/tv-fixture.js';

async function expectCenteredIcons(buttons:Locator){
 const geometry=await buttons.evaluateAll(elements=>elements.map(element=>{const button=element.getBoundingClientRect(),icon=element.querySelector('svg')!.getBoundingClientRect();return {label:element.getAttribute('aria-label'),x:Math.abs(icon.x+icon.width/2-button.x-button.width/2),y:Math.abs(icon.y+icon.height/2-button.y-button.height/2)};}));
 expect(geometry.length).toBeGreaterThan(0);for(const item of geometry){expect(item.x,item.label??'icon').toBeLessThan(0.5);expect(item.y,item.label??'icon').toBeLessThan(0.5);}
}

test('single step dialog uses existing remote, keeps rows inline and protects drafts in RU/EN',async({page,tv},testInfo)=>{
 await page.setViewportSize({width:1650,height:1248});await tv.setupAndLogin(page);
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();await page.getByRole('button',{name:'Создать тест-кейс'}).click();
 await page.getByLabel('Название',{exact:true}).fill('Синтетический макет шага');await page.getByRole('button',{name:'Добавить шаг',exact:true}).click();await page.getByRole('button',{name:'Добавить шаг Когда',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Параметры шага 1'});await expect(dialog).toBeVisible();await page.getByLabel('Описание шага',{exact:true}).fill('Пользователь открывает раздел «Каталог».');
 const mutations:string[]=[];page.on('request',request=>{if(/\/(commands|holds|power)(\/|$)/.test(new URL(request.url()).pathname)&&request.method()!=='GET')mutations.push(request.url());});
 const remote=dialog.getByRole('group',{name:'Пульт',exact:true});
 for(const name of ['Вправо','Вправо','OK'])await remote.getByRole('button',{name,exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(1);await expect(dialog).toHaveCSS('width','1000px');await expect(dialog.locator('.step-key-hold-unavailable')).toHaveCount(0);await page.getByLabel('Удерживать кнопку 1',{exact:true}).check();
 const hold=page.getByLabel('Длительность удержания 1, мс',{exact:true});await expect(hold).toHaveCSS('appearance','textfield');await page.getByRole('button',{name:'Увеличить удержание нажатия 1 на 100 мс',exact:true}).click();await expect(hold).toHaveValue('1100');await hold.fill('4000');
 await dialog.getByRole('button',{name:'Добавить условие',exact:true}).click();await expectCenteredIcons(dialog.locator('.text-condition-row button'));await dialog.getByRole('button',{name:'Удалить условие 1',exact:true}).click();
 await expectCenteredIcons(dialog.locator('.step-key-actions button,.step-key-spinner button,.step-key-drag'));
 const rowGeometry=()=>page.locator('.step-key-row').first().evaluate(element=>{const controls=[...element.querySelectorAll('.step-key-label,.step-key-pause,.step-key-hold,.step-key-actions')].map(el=>el.getBoundingClientRect());const box=element.getBoundingClientRect();return {centers:controls.map(r=>r.y+r.height/2),overflow:element.scrollWidth>element.clientWidth,right:Math.max(...controls.map(r=>r.right)),rowRight:box.right};});
 for(const width of [1650,1440,1280]){
  await page.setViewportSize({width,height:width===1650?1248:1024});const geometry=await rowGeometry();expect(Math.max(...geometry.centers)-Math.min(...geometry.centers)).toBeLessThan(2);expect(geometry.overflow).toBe(false);expect(geometry.right).toBeLessThanOrEqual(geometry.rowRight);
  await page.screenshot({path:testInfo.outputPath(`step-popup-ru-${width}.png`)});
 }
 await page.getByRole('button',{name:'Скрыть пульт'}).click();await expect(remote).toHaveCount(0);await page.getByRole('button',{name:'Добавить нажатия'}).click();await expect(remote).toBeVisible();
 await page.getByLabel('Описание шага',{exact:true}).focus();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Продолжить редактирование',exact:true})).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(1);
 await page.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();await expect(page.getByLabel('Описание шага',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Сохранить шаг',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:/Выбрать шаг 1/})).toBeFocused();
 for(const width of [955,1024,1100,1280]){
  await page.setViewportSize({width,height:1248});const geometry=await page.locator('.case-step-row').first().evaluate(element=>{const row=element.getBoundingClientRect(),select=element.querySelector('.case-step-select')!.getBoundingClientRect(),actions=element.querySelector('.case-step-actions')!.getBoundingClientRect();return {height:row.height,centerDelta:Math.abs(select.y+select.height/2-actions.y-actions.height/2),actionsRight:actions.right,rowRight:row.right,selectRight:select.right,actionsLeft:actions.left};});
  expect(geometry.height,`step row at ${width}px`).toBe(60);expect(geometry.centerDelta).toBeLessThan(2);expect(geometry.actionsRight).toBeLessThan(geometry.rowRight);expect(geometry.selectRight).toBeLessThanOrEqual(geometry.actionsLeft);
  await expectCenteredIcons(page.locator('.case-step-actions button'));
  if(width===955)await page.screenshot({path:testInfo.outputPath('step-row-955.png')});
 }
 await page.getByRole('button',{name:'Сохранить тест-кейс',exact:true}).click();await expect(page.getByText('Тест-кейс сохранён',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Выбрать шаг 1/}).click();await page.getByLabel('Описание шага',{exact:true}).fill('Отброшенная правка');await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('button',{name:'Не сохранять и закрыть'}).click();
 await page.getByRole('button',{name:/Выбрать шаг 1/}).click();await expect(page.getByLabel('Описание шага',{exact:true})).toHaveValue('Пользователь открывает раздел «Каталог».');await page.getByRole('button',{name:'Отмена',exact:true}).click();
 await page.locator('.app-sidebar').getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Язык интерфейса').selectOption('en');await page.locator('.app-sidebar').getByRole('button',{name:'Test cases',exact:true}).click();await page.getByRole('button',{name:'Синтетический макет шага',exact:true}).click();await page.locator('.case-step-select').first().click();
 await expect(page.getByRole('dialog',{name:'Step parameters 1'})).toBeVisible();const geometry=await rowGeometry();expect(Math.max(...geometry.centers)-Math.min(...geometry.centers)).toBeLessThan(2);expect(geometry.overflow).toBe(false);await page.screenshot({path:testInfo.outputPath('step-popup-en-1280.png')});expect(mutations).toEqual([]);
});
