import {expect,test} from 'vitest';
import {LiveScreenGate} from './live-state.js';
const corners=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}] as const;
test('requires three agreeing detections before displaying a screen',()=>{
  const gate=new LiveScreenGate();
  expect(gate.observe(corners,0)).toBe(false);
  expect(gate.observe(corners,100)).toBe(false);
  expect(gate.observe(corners,200)).toBe(true);
  expect(gate.visible(999)).toBe(true);
  expect(gate.visible(1201)).toBe(false);
});
test('missing detection immediately invalidates the previous crop',()=>{
  const gate=new LiveScreenGate();for(let i=0;i<3;i++)gate.observe(corners,i);
  expect(gate.observe(null,3)).toBe(false);expect(gate.visible(3)).toBe(false);
  expect(gate.observe(corners,4)).toBe(false);
});
test('movement and stale gaps require confirmation again',()=>{
  const gate=new LiveScreenGate();for(let i=0;i<3;i++)gate.observe(corners,i);
  expect(gate.observe(corners.map(p=>({x:p.x+.1,y:p.y})),3)).toBe(false);
  expect(gate.observe(corners,1500)).toBe(false);
});
test('confirmed identity survives a processing gap while the old image expires',()=>{
 const gate=new LiveScreenGate();for(let i=0;i<3;i++)gate.observe(corners,i*100);
 expect(gate.visible(1300)).toBe(false);
 expect(gate.observe(corners,1500)).toBe(true);
 expect(gate.observe(null,1600)).toBe(false);
 expect(gate.observe(corners,1700)).toBe(false);
});
test('unconfirmed acquisition cannot accumulate isolated detections over stale gaps',()=>{
 const gate=new LiveScreenGate();expect(gate.observe(corners,0)).toBe(false);expect(gate.observe(corners,1500)).toBe(false);expect(gate.observe(corners,3000)).toBe(false);
});
test('a moved boundary after a processing gap still requires confirmation',()=>{
 const gate=new LiveScreenGate();for(let i=0;i<3;i++)gate.observe(corners,i*100);
 const moved=corners.map(p=>({x:p.x+.05,y:p.y}));
 expect(gate.observe(moved,1500)).toBe(false);expect(gate.observe(moved,1600)).toBe(false);expect(gate.observe(moved,1700)).toBe(true);
});
