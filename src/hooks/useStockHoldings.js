import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useStockHoldings(familyId) {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quoteError, setQuoteError] = useState('')
  const [refreshingPrices, setRefreshingPrices] = useState(false)

  const refresh = useCallback(async ({ updatePrices = true, forcePrices = false } = {}) => {
    if (!familyId) return
    setLoading(true)
    setError('')
    const { data: rows, error: holdingsError } = await supabase
      .from('stock_holdings').select('*').eq('family_id', familyId).order('created_at')
    if (holdingsError) {
      setError(holdingsError.message)
      setLoading(false)
      return
    }
    const stocks = rows || []
    const symbols = stocks.map((stock) => stock.symbol)
    async function loadQuotes() {
      if (symbols.length === 0) return new Map()
      const { data, error: priceError } = await supabase
        .from('stock_quotes').select('*').in('symbol', symbols)
      if (priceError) throw priceError
      return new Map((data || []).map((quote) => [quote.symbol, quote]))
    }
    let quoteMap = new Map()
    try {
      quoteMap = await loadQuotes()
      setQuoteError('')
      if (updatePrices && stocks.length > 0) {
        setRefreshingPrices(true)
        const requests = stocks.map((stock) => ({ symbol: stock.symbol, market: stock.market }))
        for (let i = 0; i < requests.length; i += 20) {
          const { data, error: functionError } = await supabase.functions.invoke('stock-quotes', {
            body: { stocks: requests.slice(i, i + 20), force: forcePrices },
          })
          if (functionError) {
            let detail = null
            try { detail = await functionError.context?.json?.() } catch { /* non-JSON response */ }
            throw new Error(detail?.error || functionError.message)
          }
          if (data?.error) throw new Error(data.error)
        }
        quoteMap = await loadQuotes()
      }
    } catch (err) {
      setQuoteError(err.message || '시세를 불러오지 못했어요')
    } finally {
      setRefreshingPrices(false)
    }
    setHoldings(stocks.map((stock) => ({ ...stock, quote: quoteMap.get(stock.symbol) || null })))
    setLoading(false)
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  const valued = holdings.filter((stock) => stock.quote?.market === stock.market)
  const totalValue = valued.reduce((sum, stock) => sum + Number(stock.quantity) * Number(stock.quote.closing_price), 0)
  const missingCount = holdings.length - valued.length
  return { holdings, loading, error, quoteError, refreshingPrices, totalValue, missingCount, refresh }
}
