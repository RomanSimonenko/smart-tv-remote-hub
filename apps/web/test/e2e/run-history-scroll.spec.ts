import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {test} from '../support/tv-fixture.js';

test('only run rows scroll while title, filters and column headers stay visible',async({page,tv})=>{
 await tv.setupAndLogin(page);
 const tvId=randomUUID(),caseId=randomUUID();
 const runs=Array.from({length:60},(_,index)=>({id:randomUUID(),caseId,caseTitle:`Синтетический запуск ${index+1}`,caseVersion:1,tvId,platform:'webos',tvName:'Синтетический ТВ',startedAt:1_790_000_000_000-index*1000,endedAt:1_790_000_000_500-index*1000,status:'failed',savedCount:1,itemCount:1,revision:0}));
 await page.route(/\/api\/test-runs(?:\?.*)?$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({runs,next:'next-page'})}));
 await page.getByRole('button',{name:'Запуски',exact:true}).click();
 await expect(page.getByRole('button',{name:'Синтетический запуск 1 · v1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();
 for(const viewport of [{width:1138,height:1248},{width:1280,height:720},{width:1138,height:520}]){
  await page.setViewportSize(viewport);
  const scroll=page.locator('.test-runs .cases-table-scroll tbody');
  const header=await page.locator('.test-runs thead').boundingBox();
  const body=await scroll.boundingBox();
  expect(header!.height).toBeLessThan(60);
  const headerColors=await page.locator('.test-runs thead').evaluate(element=>({corner:getComputedStyle(element).backgroundColor,cell:getComputedStyle(element.querySelector('th')!).backgroundColor}));
  expect(headerColors.corner).toBe(headerColors.cell);
  const clippedHeaders=await page.locator('.test-runs th').evaluateAll(cells=>cells.some(cell=>cell.scrollWidth>cell.clientWidth));
  expect(clippedHeaders).toBe(false);
  expect(body!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);
  await scroll.evaluate(element=>{element.scrollTop=0;});
  const positions=async()=>page.locator('.test-runs').evaluate(element=>({title:element.querySelector('h1')!.getBoundingClientRect().top,filters:element.querySelector('.runs-filters')!.getBoundingClientRect().top,header:element.querySelector('th')!.getBoundingClientRect().top,row:element.querySelector('tbody tr')!.getBoundingClientRect().top,documentScroll:document.documentElement.scrollHeight,windowHeight:innerHeight}));
  const before=await positions();
  await scroll.hover();await page.mouse.wheel(0,900);
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(100);
  const after=await positions();
  expect(after.title).toBeCloseTo(before.title,0);expect(after.filters).toBeCloseTo(before.filters,0);expect(after.header).toBeCloseTo(before.header,0);expect(after.row).toBeLessThan(before.row-100);
  expect(after.documentScroll).toBeLessThanOrEqual(after.windowHeight);
  await expect(page.getByRole('button',{name:'Загрузить ещё',exact:true})).toBeInViewport();
  if(viewport.height===1248)await page.screenshot({path:'.local/playwright/run-history-scroll.png'});
 }
});
