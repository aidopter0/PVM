import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.js';

describe('parseCsv', () => {
  it('parses headers case-insensitively and trims values', () => {
    expect(parseCsv('SKU, Name \nA1, Apple \n')).toEqual([{ sku: 'A1', name: 'Apple' }]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    const csv = 'sku,name\r\nB2,"Sauce, ""Hot""\n500g"\r\nC3,Plain';
    expect(parseCsv(csv)).toEqual([
      { sku: 'B2', name: 'Sauce, "Hot"\n500g' },
      { sku: 'C3', name: 'Plain' },
    ]);
  });

  it('skips blank lines, strips a BOM and fills missing cells', () => {
    expect(parseCsv('﻿sku,name,brand\n\nD4,Dates\n')).toEqual([{ sku: 'D4', name: 'Dates', brand: '' }]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
