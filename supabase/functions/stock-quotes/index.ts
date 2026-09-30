import { createClient } from 'npm:@supabase/supabase-js@2.110.0'

type RequestedStock = { symbol: string; market: 'KOSPI' | 'KOSDAQ' }
type Quote = RequestedStock & {
  name: string
  closing_price: number
  price_date: string
  fetched_at: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function koreanDate(offsetDays: number) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  now.setUTCDate(now.getUTCDate() - offsetDays)
  return now.toISOString().slice(0, 10).replaceAll('-', '')
}

async function fetchMarket(market: RequestedStock['market'], day: string, key: string) {
  const endpoint = market === 'KOSPI' ? 'stk_bydd_trd' : 'ksq_bydd_trd'
  const url = `https://data-dbg.krx.co.kr/svc/apis/sto/${endpoint}?basDd=${day}`
  const response = await fetch(url, {
    headers: { AUTH_KEY: key, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`KRX ${market} HTTP ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body.OutBlock_1)) throw new Error(`KRX ${market} 응답 형식 오류`)
  return body.OutBlock_1 as Record<string, string>[]
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'POST 요청만 사용할 수 있어요' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
      || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
    if (!url || !publicKey || !serviceKey) return json({ error: '서버 설정을 확인해주세요' }, 503)

    const authorization = request.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return json({ error: '로그인이 필요해요' }, 401)
    const userClient = createClient(url, publicKey)
    const { data: authData, error: authError } = await userClient.auth.getUser(authorization.slice(7))
    if (authError || !authData.user) return json({ error: '로그인이 필요해요' }, 401)

    const body = await request.json()
    const rawStocks = body?.stocks
    if (!Array.isArray(rawStocks) || rawStocks.length < 1 || rawStocks.length > 20) {
      return json({ error: '한 번에 1~20개 종목을 조회할 수 있어요' }, 400)
    }
    const stocks: RequestedStock[] = rawStocks.map((stock) => ({
      symbol: String(stock.symbol || '').trim(),
      market: stock.market,
    }))
    if (stocks.some((stock) => !/^\d{6}$/.test(stock.symbol) || !['KOSPI', 'KOSDAQ'].includes(stock.market))) {
      return json({ error: '국내 주식 종목코드와 시장을 확인해주세요' }, 400)
    }
    const unique = [...new Map(stocks.map((stock) => [stock.symbol, stock])).values()]
    const admin = createClient(url, serviceKey)
    const { data: cached, error: cacheError } = await admin
      .from('stock_quotes').select('*').in('symbol', unique.map((stock) => stock.symbol))
    if (cacheError) throw cacheError
    const cachedBySymbol = new Map<string, Quote>((cached || []).map((quote) => [quote.symbol, quote]))
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
    const force = body.force === true
    const stale = unique.filter((stock) => {
      const quote = cachedBySymbol.get(stock.symbol)
      return force || !quote || quote.market !== stock.market || new Date(quote.fetched_at).getTime() < sixHoursAgo
    })
    if (stale.length === 0) return json({ quotes: cached, missing: [] })

    const krxKey = Deno.env.get('KRX_API_KEY')
    if (!krxKey) return json({ error: 'KRX_API_KEY가 설정되지 않았어요', code: 'KRX_KEY_MISSING' }, 503)

    const unresolved = new Map(stale.map((stock) => [stock.symbol, stock]))
    const found: Quote[] = []
    const markets = [...new Set(stale.map((stock) => stock.market))]
    for (let offset = 0; offset < 14 && unresolved.size > 0; offset += 1) {
      const day = koreanDate(offset)
      const results = await Promise.all(markets.map(async (market) => ({
        market,
        rows: await fetchMarket(market, day, krxKey),
      })))
      for (const { market, rows } of results) {
        for (const row of rows) {
          const symbol = String(row.ISU_CD || row.ISU_SRT_CD || '').trim()
          const requestStock = unresolved.get(symbol)
          if (!requestStock || requestStock.market !== market) continue
          const price = Number(String(row.TDD_CLSPRC || '').replaceAll(',', ''))
          if (!Number.isFinite(price) || price <= 0) continue
          const existing = cachedBySymbol.get(symbol)
          const priceDate = String(row.BAS_DD || day).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
          if (!existing || existing.price_date <= priceDate) {
            found.push({ symbol, market, name: String(row.ISU_NM || symbol), closing_price: price,
              price_date: priceDate, fetched_at: new Date().toISOString() })
          }
          unresolved.delete(symbol)
        }
      }
    }

    if (found.length > 0) {
      const { error } = await admin.from('stock_quotes').upsert(found, { onConflict: 'symbol' })
      if (error) throw error
    }
    const { data: latest, error: latestError } = await admin
      .from('stock_quotes').select('*').in('symbol', unique.map((stock) => stock.symbol))
    if (latestError) throw latestError
    return json({ quotes: latest || [], missing: [...unresolved.keys()] })
  } catch (error) {
    console.error('Stock quote refresh failed:', error)
    return json({ error: 'KRX 종가를 가져오지 못했어요. 인증키와 API 이용 승인을 확인해주세요.' }, 502)
  }
})
