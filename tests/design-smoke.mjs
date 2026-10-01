// Run with: node tests/design-smoke.mjs
// Set PLAYWRIGHT_MODULE_PATH if Playwright is supplied outside this project.
// All data/API/auth modules are replaced in this test server. No real account is used.
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const output = path.resolve('.test-results/design')
await mkdir(output, { recursive: true })
const api = await readFile('src/lib/api.js', 'utf8')
const names = [...api.matchAll(/export async function (\w+)/g)].map((m) => m[1])
const fixtureImport = `import { fixture, call } from '/tests/design-fixtures.js';\n`
const server = await createServer({
  configFile: false,
  plugins: [
    {
      name: 'isolated-design-fixtures',
      enforce: 'pre',
      transform(_source, id) {
        const file = id.replaceAll('\\', '/').split('?')[0]
        if (file.endsWith('/context/AuthContext.jsx'))
          return (
            fixtureImport +
            `export const AuthProvider = ({ children }) => children; export const useAuth = () => fixture('useAuth', []);`
          )
        const hook = file.match(/\/hooks\/(use\w+)\.js$/)?.[1]
        if (hook)
          return (
            fixtureImport +
            `export const ${hook} = (...args) => fixture('${hook}', args);`
          )
        if (file.endsWith('/lib/api.js'))
          return (
            fixtureImport +
            names
              .map(
                (n) => `export const ${n} = (...args) => call('${n}', args);`,
              )
              .join('\n')
          )
        if (file.endsWith('/lib/supabaseClient.js'))
          return `export const supabase = { auth: { signUp: async () => ({}), signInWithPassword: async () => ({error:{message:'테스트 로그인 오류'}}) }, rpc: async () => ({data:{invite_code:'FAMILY'}}) };`
      },
    },
    react(),
  ],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
// Fail closed: any unexpected external request is blocked.
await page.route('**/*', (route) =>
  route.request().url().startsWith('http://127.0.0.1:5178')
    ? route.continue()
    : route.abort(),
)
let visit = 0
await page.addInitScript(() => {
  const params = new URL(location.href).searchParams
  window.__scenario = params.get('scenario') || 'normal'
  window.__authMode = params.get('auth') || 'signed'
})
async function go(route = '/', scenario = 'normal', auth = 'signed') {
  await page.goto(
    `http://127.0.0.1:5178/?visit=${++visit}&scenario=${scenario}&auth=${auth}#${route}`,
  )
  await page.locator('.page-title, .auth-title').first().waitFor()
}
async function shot(name) {
  await page.screenshot({
    path: `${output}/${name}.png`,
    fullPage: !(await page.locator('dialog[open]').count()),
  })
}
async function noOverflow(label) {
  const dims = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert(
    dims.scroll <= dims.width + 1,
    `${label}: horizontal overflow ${JSON.stringify(dims)}`,
  )
  const dialog = page.locator('dialog[open]')
  if (await dialog.count())
    assert(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      `${label}: dialog overflow`,
    )
}
async function close() {
  await page.keyboard.press('Escape')
  await page.locator('dialog[open]').waitFor({ state: 'detached' })
}
try {
  await go()
  await page.locator('.hero-amount').getByText('650,000원', { exact: true }).waitFor()
  await page.locator('.hero-amount').getByText('65만원', { exact: true }).waitFor()
  const expectedSavings = (new Date().getMonth() + 1) * 200000
  const expectedAssets = (6250000 + 1560000 + expectedSavings).toLocaleString('ko-KR') + '원'
  await page.locator('.asset-strip-value').getByText(expectedAssets, { exact: true }).waitFor()
  await noOverflow('desktop home')
  await shot('desktop-home')
  await page.getByRole('button', { name: '지출 기록', exact: true }).click()
  await page.getByRole('dialog', { name: '지출 기록' }).waitFor()
  assert.equal(
    await page.locator(':focus').getAttribute('id'),
    'transaction-amount',
  )
  const moneyInput = page.getByLabel('금액 (원)')
  await moneyInput.pressSequentially('123958230')
  assert.equal(await moneyInput.inputValue(), '123,958,230')
  await page.getByText('1억 2395만 8230원', { exact: true }).waitFor()
  // A paste with commas, replacement in the middle, and separator deletion.
  await moneyInput.fill('123,958,230')
  await moneyInput.evaluate((input) => input.setSelectionRange(4, 7))
  await page.keyboard.type('111')
  assert.equal(await moneyInput.inputValue(), '123,111,230')
  assert.equal(await moneyInput.evaluate((input) => input.selectionStart), 7)
  await moneyInput.fill('1,234')
  await moneyInput.evaluate((input) => input.setSelectionRange(2, 2))
  await page.keyboard.press('Backspace')
  assert.equal(await moneyInput.inputValue(), '234')
  await moneyInput.fill('1,234')
  await moneyInput.evaluate((input) => input.setSelectionRange(1, 1))
  await page.keyboard.press('Delete')
  assert.equal(await moneyInput.inputValue(), '134')
  await moneyInput.fill('')
  assert.equal(await moneyInput.inputValue(), '')
  await moneyInput.fill('0')
  assert.equal(await moneyInput.evaluate((input) => input.checkValidity()), false)
  await moneyInput.fill('9007199254740992')
  assert.equal(await moneyInput.evaluate((input) => input.checkValidity()), false)
  await moneyInput.fill('18000')
  assert.equal(await moneyInput.inputValue(), '18,000')
  await page.getByText('1만 8000원', { exact: true }).waitFor()
  await page.getByLabel('결제수단', { exact: true }).selectOption('신용카드')
  await page.getByLabel('사용한 신용카드').selectOption('card-1')
  await page.getByLabel('카드 결제대금 출금 보유처').selectOption('cash-1')
  await shot('desktop-transaction-modal')
  // A failed save must preserve the values and keep the dialog open.
  await page.evaluate(() => {
    window.__failSave = true
  })
  await page.getByRole('button', { name: '기록하기', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByLabel('금액 (원)').inputValue(), '18,000')
  await page.evaluate(() => {
    window.__failSave = false
  })
  await page.getByRole('button', { name: '기록하기', exact: true }).click()
  await page.locator('dialog').waitFor({ state: 'detached' })
  assert.equal(
    await page.evaluate(
      () => window.__calls.filter((x) => x.name === 'addTransaction').length,
    ),
    2,
  )
  assert.equal(await page.evaluate(() => window.__calls.at(-1).args[0].cash_asset_id), 'cash-1')
  assert.equal(await page.evaluate(() => window.__calls.at(-1).args[0].amount), 18000)
  assert.equal(await page.evaluate(() => window.__calls.at(-1).args[0].cash_balance_included), true)
  await page.getByRole('button', { name: '수입 기록', exact: true }).click()
  await page.getByLabel('금액 (원)').fill('100000')
  await page.getByRole('button', { name: '기록하기', exact: true }).click()
  assert.equal(await page.getByRole('dialog').count(), 1, 'new income requires a cash account')
  await page.getByLabel('입금할 보유처').selectOption('cash-1')
  await page.getByRole('button', { name: '기록하기', exact: true }).click()
  await page.locator('dialog').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.__calls.at(-1).args[0].type), 'income')
  await page.getByLabel('조회할 구성원').selectOption('member-2')
  await page
    .getByText('선택한 구성원의 지출이에요.')
    .waitFor()
  await page.getByLabel('조회할 구성원').selectOption('all')
  await page.getByRole('button', { name: /카드 결제 일정/ }).click()
  await shot('card-schedule')
  await close()
  await go('/transactions')
  await page.getByRole('button', { name: '수정', exact: true }).first().click()
  await page.getByText('기존 잔액에 포함된 내역이에요.', { exact: false }).waitFor()
  await page.getByRole('button', { name: '수정 완료' }).click()
  await page.locator('dialog').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.__calls.at(-1).args[1].cash_balance_included), false)
  await page.getByRole('button', { name: '삭제', exact: true }).first().click()
  await page.getByRole('dialog', { name: '이 내역을 삭제할까요?' }).waitFor()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  assert.equal(
    await page.evaluate(
      () =>
        (window.__calls || []).filter((x) => x.name === 'deleteTransaction')
          .length,
    ),
    0,
  )
  await shot('desktop-transactions')
  await page.getByRole('button', { name: '달력', exact: true }).click()
  await shot('desktop-calendar')
  await go('/statistics')
  await shot('desktop-analysis')
  // Each asset form, plus delete confirmations, must use the same accessible dialog.
  for (const [tab, add, fields, submit, apiName] of [
    ['cash', '현금 항목 추가', { '보유처': '테스트 통장', '금액 (원)': '200000' }, '항목 추가', 'saveCashAsset'],
    ['savings', '적금 추가', { '적금 이름': '테스트 적금', '매달 납입액': '100000' }, '적금 추가', 'addSavingsPlan'],
    ['stocks', '보유 주식 추가', { '종목코드': '005930', '총 보유 수량': '10' }, '주식 저장', 'saveStockHolding'],
    ['loans', '대출 추가', { '대출 이름': '테스트 대출', '상환일': '2030-12-31', '대출금액': '1000000', '연이율 (%)': '3.5' }, '대출 추가', 'addLoan'],
  ]) {
    await go(`/budget?tab=${tab}`)
    await noOverflow(`desktop ${tab}`)
    await shot(`desktop-${tab}`)
    await page.getByRole('button', { name: add, exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await noOverflow(`${tab} modal`)
    await shot(`modal-${tab}`)
    const dialog = page.getByRole('dialog')
    for (const [label, value] of Object.entries(fields)) await dialog.getByLabel(label, { exact: true }).fill(value)
    if (tab === 'savings') await dialog.getByLabel('납입할 보유처').selectOption('cash-1')
    if (tab === 'loans') await dialog.getByLabel('이자 출금 보유처').selectOption('cash-1')
    await page.evaluate(() => { window.__failSave = true })
    await dialog.getByRole('button', { name: submit, exact: true }).click()
    await dialog.getByText('테스트: 저장에 실패했어요. 다시 시도해주세요.', { exact: true }).waitFor()
    for (const [label, value] of Object.entries(fields)) {
      const money = ['금액 (원)', '매달 납입액', '대출금액'].includes(label)
      assert.equal(await dialog.getByLabel(label, { exact: true }).inputValue(), money ? Number(value).toLocaleString('ko-KR') : value)
    }
    if (tab === 'cash') {
      await dialog.getByLabel('금액 (원)', { exact: true }).fill('-123958230')
      assert.equal(await dialog.getByLabel('금액 (원)', { exact: true }).inputValue(), '-123,958,230')
      await dialog.getByText('-1억 2395만 8230원', { exact: true }).waitFor()
      await dialog.getByLabel('금액 (원)', { exact: true }).fill('200000')
    }
    if (tab !== 'stocks') await dialog.locator('.money-input-reading').getByText(tab === 'cash' ? '20만원' : tab === 'loans' ? '100만원' : '10만원', { exact: true }).waitFor()
    await page.setViewportSize({ width: 320, height: 844 })
    await noOverflow(`320 ${tab} modal`)
    await shot(`mobile-modal-${tab}`)
    await page.evaluate(() => { window.__failSave = false })
    await dialog.getByRole('button', { name: submit, exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate((name) => window.__calls.filter((c) => c.name === name).length, apiName), 2)
    if (tab !== 'stocks') {
      const payload = await page.evaluate(() => window.__calls.at(-1).args[0])
      assert.equal(tab === 'cash' ? payload.amount : tab === 'loans' ? payload.principal_amount : payload.monthly_amount,
        tab === 'cash' ? 200000 : tab === 'loans' ? 1000000 : 100000)
    }
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page
      .getByRole('button', { name: '삭제', exact: true })
      .first()
      .click()
    await page.getByRole('dialog').waitFor()
    await close()
  }
  await go('/budget?tab=budget')
  await page.locator('.asset-overview .summary-value').getByText(expectedAssets, { exact: true }).waitFor()
  await page.locator('.asset-overview-detail').getByText(expectedSavings.toLocaleString('ko-KR') + '원', { exact: true }).waitFor()
  assert.equal(await page.getByText('카테고리별 월 예산').count(), 0)
  assert.equal(await page.getByText('거래 기준 현금 잔액').count(), 0)
  await page.getByText('보유 현금 항목', { exact: true }).waitFor()
  await go('/settings')
  await shot('desktop-settings')
  await page
    .locator('.credit-card-item')
    .getByRole('button', { name: '수정', exact: true })
    .click()
  await page.getByRole('dialog', { name: '신용카드 수정' }).waitFor()
  await page
    .getByLabel('카드 별명', { exact: true })
    .last()
    .fill('새 카드 이름')
  await page.evaluate(() => {
    window.__failSave = true
  })
  await page.getByRole('button', { name: '변경 저장' }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(
    await page.locator('dialog').getByLabel('카드 별명').inputValue(),
    '새 카드 이름',
  )
  await shot('modal-card-error')
  await close()
  await page.evaluate(() => {
    window.__failSave = false
  })
  await page.getByRole('button', { name: '전체 데이터 초기화' }).click()
  await page.getByRole('button', { name: '계속', exact: true }).click()
  await page.getByRole('dialog', { name: '정말 초기화할까요?' }).waitFor()
  await shot('modal-reset')
  await close()
  assert.equal(
    await page.evaluate(
      () =>
        (window.__calls || []).filter((x) => x.name === 'resetFamilyData')
          .length,
    ),
    0,
  )
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of [
      '/',
      '/transactions',
      '/transactions?view=calendar',
      '/statistics',
      '/budget?tab=cash',
      '/budget?tab=savings',
      '/budget?tab=loans',
      '/budget?tab=stocks',
      '/budget?tab=budget',
      '/settings',
    ]) {
      await go(route)
      await noOverflow(`${width} ${route}`)
      if (width === 390)
        await shot(`mobile-${route.replace(/[^a-z]/gi, '-') || 'home'}`)
    }
    await go('/')
    await page.getByRole('button', { name: '지출 기록', exact: true }).click()
    await noOverflow(`${width} input modal`)
    if (width === 390) await shot('mobile-transaction-modal')
    // Native modal must contain keyboard focus and restore it on close.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      assert(
        await page.evaluate(() => !!document.activeElement?.closest('dialog')),
      )
    }
    await close()
    assert.equal(await page.locator(':focus').textContent(), '지출 기록')
  }
  for (const scenario of ['empty', 'long', 'loading']) {
    await page.setViewportSize({ width: 320, height: 844 })
    await go('/', scenario)
    await noOverflow(scenario)
    await shot(`state-${scenario}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await go('/login', 'normal', 'login')
  await shot('desktop-login')
  await page.getByRole('button', { name: '회원가입', exact: true }).click()
  await page.getByLabel('이름', { exact: true }).waitFor()
  await page.setViewportSize({ width: 320, height: 844 })
  await noOverflow('signup')
  await shot('mobile-signup')
  await go('/family-setup', 'normal', 'family')
  await noOverflow('family')
  await shot('mobile-family')
  await page.getByRole('button', { name: '초대 코드로 참여' }).click()
  await page.getByLabel('초대 코드').waitFor()
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('\n')}`)
  console.log(
    'PASS: responsive routes, all editor/confirmation dialogs, failed saves, cancel safety, modal focus, auth states, empty/long/loading states. Screenshots: ' +
      output,
  )
} finally {
  await browser.close()
  await server.close()
}
