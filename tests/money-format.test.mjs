import test from 'node:test'
import assert from 'node:assert/strict'
import { formatKoreanWon, formatMoneyInput, formatWonWithReading } from '../src/utils/format.js'

test('금액을 반올림한 만 단위가 아닌 정확한 한글 단위로 표시', () => {
  for (const [amount, expected] of [
    [0, '0원'], [9999, '9999원'], [10000, '1만원'],
    [10001, '1만 1원'], [100000000, '1억원'],
    [123958230, '1억 2395만 8230원'],
    [100000001, '1억 1원'], [100010000, '1억 1만원'],
    [-123958230, '-1억 2395만 8230원'],
    [1000000000000, '1조원'], [9007199254740991, '9007조 1992억 5474만 991원'],
    [12345.67, '1만 2345.67원'], [10000.5, '1만 0.5원'],
  ]) assert.equal(formatKoreanWon(amount), expected)
  assert.equal(formatWonWithReading(123958230), '123,958,230원 (1억 2395만 8230원)')
})

test('입력값의 빈 상태, 음수, 천 단위 콤마를 유지', () => {
  for (const [raw, expected] of [
    ['', ''], ['-', '-'], ['0', '0'], ['999', '999'],
    ['1000', '1,000'], ['123958230', '123,958,230'],
    ['-123958230', '-123,958,230'],
  ]) assert.equal(formatMoneyInput(raw), expected)
})
