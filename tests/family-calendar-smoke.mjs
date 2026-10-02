import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
const names = [
  ...(await readFile('src/lib/api.js', 'utf8')).matchAll(
    /export async function (\w+)/g,
  ),
].map((m) => m[1])
const header = `import { fixture, call } from '/tests/family-calendar-fixtures.js';\n`
const output = '.test-results/family-calendar'
await mkdir(output, { recursive: true })
const server = await createServer({
  configFile: false,
  plugins: [
    {
      name: 'calendar-test-fixtures',
      enforce: 'pre',
      transform(_, id) {
        const file = id.replaceAll('\\', '/').split('?')[0]
        if (file.endsWith('/context/AuthContext.jsx'))
          return (
            header +
            `export const AuthProvider = ({children})=>children; export const useAuth=()=>fixture('useAuth',[]);`
          )
        const hook = file.match(/\/hooks\/(use\w+)\.js$/)?.[1]
        if (hook)
          return (
            header + `export const ${hook}=(...args)=>fixture('${hook}',args);`
          )
        if (file.endsWith('/lib/api.js'))
          return (
            header +
            names
              .map(
                (name) =>
                  `export const ${name}=(...args)=>call('${name}',args);`,
              )
              .join('\n')
          )
        if (file.endsWith('/lib/supabaseClient.js'))
          return 'export const supabase = {};'
      },
    },
    react(),
  ],
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
})
await server.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
})
const errors = []
page.on('pageerror', (err) => errors.push(err.message))
await page.route('**/*', (route) =>
  route.request().url().startsWith('http://127.0.0.1:5179')
    ? route.continue()
    : route.abort(),
)
async function close() {
  await page.keyboard.press('Escape')
  await page.locator('dialog[open]').waitFor({ state: 'detached' })
}
async function shot(name) {
  const modal = page.locator('dialog[open]')
  if (await modal.count()) {
    assert.equal(await modal.count(), 1)
    await modal.evaluate((element) => (element.scrollTop = 0))
  } else await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `${output}/${name}.png`,
    animations: 'disabled',
    fullPage: !(await modal.count()),
  })
}
async function noOverflow() {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  )
  for (const modal of await page.locator('dialog[open]').all())
    assert(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
}
try {
  await page.goto('http://127.0.0.1:5179/')
  const home = page.locator('.family-events-home')
  await home.getByRole('heading', { name: '앞으로 챙길 일' }).waitFor()
  await home
    .locator('.event-summary .money-number')
    .getByText('400,000원', { exact: true })
    .waitFor()
  await home
    .getByText('금액 미정 1건 · 돈을 쓸 날짜 기준', { exact: true })
    .waitFor()
  await home.getByText('확인할 지난 일정 1건').click()
  await home.getByRole('button', { name: /확인할 지난 행사/ }).waitFor()
  const previousSpend = await page.locator('.hero-amount').innerText()
  await noOverflow()
  await shot('desktop-home')
  await home.getByRole('button', { name: '+ 일정 추가', exact: true }).click()
  await page.getByLabel('일정 이름').fill('테스트 부모님 생신')
  await page.getByLabel('날짜 기준').selectOption('lunar')
  await page.getByLabel('월', { exact: true }).fill('1')
  await page.getByLabel('일', { exact: true }).fill('1')
  await page.getByLabel('준비할 돈', { exact: true }).selectOption('amount')
  await page.getByLabel('예정 금액 (원)').fill('150000')
  await page.evaluate(() => (window.__failNext = true))
  await page.getByRole('button', { name: '일정 저장', exact: true }).click()
  await page
    .getByRole('alert')
    .getByText(/테스트 저장 실패/)
    .waitFor()
  assert.equal(
    await page.getByLabel('일정 이름').inputValue(),
    '테스트 부모님 생신',
  )
  await shot('lunar-birthday-form')
  await page.getByRole('button', { name: '일정 저장', exact: true }).click()
  await page.locator('dialog[open]').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.hero-amount').innerText(), previousSpend)
  const saved = await page.evaluate(() =>
    window.__calls.filter((c) => c.name === 'saveFamilyEvent').at(-1),
  )
  assert.equal(saved.args[1].calendar, 'lunar')
  assert.equal(saved.args[2][0].planned_amount, 150000)
  assert.equal(saved.args[2][1].planned_amount, null)
  // Existing gift connects without another transaction.
  await home.getByRole('button', { name: /지연 결혼식/ }).click()
  await page
    .getByRole('button', { name: '기존 지출 연결', exact: true })
    .click()
  await page.getByRole('button', { name: /기존 축의금 송금/ }).click()
  await page.getByRole('heading', { name: '연결된 실제 지출 1건' }).waitFor()
  await page.getByRole('button', { name: '지출 마무리', exact: true }).click()
  await page
    .getByRole('dialog', { name: '지출을 마무리할까요?' })
    .getByRole('button', { name: '마무리', exact: true })
    .click()
  await page
    .getByRole('button', { name: '다시 준비하기', exact: true })
    .waitFor()
  await noOverflow()
  await shot('completed-wedding')
  await close()
  // Partial expense: 300,000 planned -> 200,000 actual -> 100,000 remaining.
  await home.getByRole('button', { name: /민수 아버님 생신/ }).click()
  await page
    .getByRole('button', { name: '이 일정에 지출 기록', exact: true })
    .click()
  assert.equal(await page.getByLabel('금액 (원)').inputValue(), '300,000')
  await page.getByLabel('금액 (원)').fill('200000')
  await page.getByLabel('출금할 보유처').selectOption('cash-1')
  await page.getByRole('button', { name: '기록하기', exact: true }).click()
  await page.getByRole('heading', { name: '연결된 실제 지출 1건' }).waitFor()
  await page
    .locator('.event-money-grid .money-number')
    .getByText('100,000원', { exact: true })
    .waitFor()
  await page.getByRole('button', { name: '일정 수정', exact: true }).click()
  await page.getByLabel('수정 범위').selectOption('future')
  await page.getByText(/이후 일정의 기본 날짜와 이름/).waitFor()
  await page.keyboard.press('Escape')
  await page
    .getByRole('dialog', { name: '민수 아버님 생신', exact: true })
    .waitFor()
  await close()
  await home.getByRole('link', { name: /전체 보기/ }).click()
  await page
    .getByRole('heading', { name: '가족 캘린더', exact: true })
    .waitFor()
  await page
    .locator('.event-toolbar')
    .getByRole('button', { name: '일정', exact: true })
    .click()
  assert.equal(await page.locator('.calendar-expense').count(), 0)
  await page
    .locator('.event-toolbar')
    .getByRole('button', { name: '거래', exact: true })
    .click()
  assert.equal(await page.locator('.calendar-event-title').count(), 0)
  await page
    .locator('.event-toolbar')
    .getByRole('button', { name: '전체', exact: true })
    .click()
  await noOverflow()
  await shot('desktop-calendar')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await noOverflow()
    await shot(`mobile-calendar-${width}`)
    await page
      .locator('.event-toolbar')
      .getByRole('button', { name: '+ 일정 추가' })
      .click()
    await page.getByLabel('종류').selectOption('wedding')
    assert.equal(await page.getByLabel('반복', { exact: true }).count(), 0)
    await page.getByLabel('행사일', { exact: true }).waitFor()
    await page.getByLabel('일정 이름').fill('친구 결혼식')
    await page.getByLabel('예정 축의금', { exact: true }).selectOption('amount')
    await page.getByLabel('예정 금액 (원)').fill('100000')
    await noOverflow()
    await shot(`mobile-wedding-form-${width}`)
    if (width === 320) {
      await page.getByRole('button', { name: '일정 저장', exact: true }).click()
      await page.locator('dialog[open]').waitFor({ state: 'detached' })
      const wedding = await page.evaluate(() =>
        window.__calls.filter((c) => c.name === 'saveFamilyEvent').at(-1),
      )
      assert.equal(wedding.args[1].annual, false)
      assert.equal(wedding.args[2].length, 1)
      assert.equal(wedding.args[2][0].planned_amount, 100000)
    } else await close()
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: home planning summary, lunar registration, failed save retention, unchanged spending, existing expense linking, completion, partial expense, recurrence editing, calendar filters, mobile 390/320px',
  )
} catch (error) {
  await shot('failure')
  throw error
} finally {
  await browser.close()
  await server.close()
}
