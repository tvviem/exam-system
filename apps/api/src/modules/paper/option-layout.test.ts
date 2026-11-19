import { describe, expect, it } from 'vitest';
import { optionLayoutOf } from './option-layout';

// Chuỗi mẫu có độ rộng (kể cả nhãn "A. " đậm, 12 pt) đo độc lập bằng PyMuPDF:
// 30,1 mm; 43,7 mm; 77,0 mm; 92,3 mm. Đề mẫu của Trường: tới 32,3 mm là một hàng, 40,8 đến 77,4 mm là hai cột, từ 85,6 mm là mỗi dòng một Phương án.
const SHORT = 'Thuật toán sắp';
// sát biên mà đề mẫu đã chứng minh: một hàng tới 32,3 mm; hai cột từ 40,8 mm; mỗi dòng từ 85,6 mm
const JUST_OVER_ROW = 'Thuật toán sắp xếp nổi';
const JUST_OVER_COLUMNS = 'Thuật toán sắp xếp nổi bọt chạy trong thời gian bậc';
const MEDIUM = 'Thuật toán sắp xếp nổi bọt chạy trong thời';
const LONG = 'Thuật toán sắp xếp nổi bọt chạy trong thời gian bậc hai';

describe('optionLayoutOf: cách xếp Phương án theo độ rộng chữ (Q413)', () => {
  it('Phương án ngắn xếp một hàng bốn cột', () => {
    expect(optionLayoutOf(['1', '2', '3', '4'])).toBe('row');
    expect(optionLayoutOf([SHORT, '2', '3', '4'])).toBe('row');
  });

  it('Phương án vừa xếp hai hàng hai cột', () => {
    expect(optionLayoutOf([MEDIUM, '2', '3', '4'])).toBe('columns');
  });

  it('sát biên: vượt một hàng thì sang hai cột, vượt hai cột thì sang mỗi dòng', () => {
    expect(optionLayoutOf([JUST_OVER_ROW, '2', '3', '4'])).toBe('columns');
    expect(optionLayoutOf([JUST_OVER_COLUMNS, '2', '3', '4'])).toBe('lines');
  });

  it('Phương án dài xếp mỗi Phương án một dòng', () => {
    expect(optionLayoutOf([LONG, '2', '3', '4'])).toBe('lines');
  });

  it('một Phương án dài buộc cả câu xếp dòng riêng, dù ba Phương án kia ngắn', () => {
    expect(optionLayoutOf(['1', '2', '3', LONG])).toBe('lines');
  });

  it('số Phương án khác bốn: cột chia theo số Phương án, vẫn theo độ rộng', () => {
    expect(optionLayoutOf(['Đúng', 'Sai'])).toBe('row');
    expect(optionLayoutOf([MEDIUM, MEDIUM])).toBe('row'); // hai Phương án: mỗi cột rộng nửa dòng
    expect(optionLayoutOf([MEDIUM, MEDIUM, MEDIUM])).toBe('columns');
  });
});
