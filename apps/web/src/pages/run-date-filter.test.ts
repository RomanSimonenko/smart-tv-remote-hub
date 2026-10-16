import {describe,it,expect} from 'vitest';
import {parseRunDateFilter} from './run-date-filter.js';
describe('Russian run date filters',()=>{
 it('accepts empty values and Russian dates',()=>{
  expect(parseRunDateFilter('')).toBeUndefined();
  expect(parseRunDateFilter('16.10.2026')).toBe(new Date(2026,9,16).getTime());
  expect(parseRunDateFilter('16.10.2026',true)).toBe(new Date(2026,9,16,23,59,59,999).getTime());
 });
 it('rejects malformed and impossible dates',()=>{
  for(const value of ['2026-10-16','31.02.2026','29.02.2025','00.10.2026','16.13.2026','1.1.2026'])expect(parseRunDateFilter(value)).toBeNull();
  expect(parseRunDateFilter('29.02.2024')).toBe(new Date(2024,1,29).getTime());
 });
});
