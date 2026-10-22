import { useState } from 'react'
import { useUI } from '../context/UIContext'
import { useCashAssets } from '../hooks/useCashAssets'
import { useCardNotifications } from '../hooks/useCardNotifications'
import {
  createCardNotificationToken,
  deleteCardNotificationToken,
  updateCreditCard,
} from '../lib/api'
import { formatWon } from '../utils/format'

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_card_notification`
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const STATUS = {
  recorded: '기록함',
  canceled: '취소됨',
  cancel_applied: '취소 반영',
  cancel_unmatched: '확인 필요',
  card_unmatched: '카드 없음',
  unparsed: '읽지 못함',
  error: '오류',
}

function dateTime(value) {
  return value ? value.replace('T', ' ').slice(0, 16) : ''
}

function CardLink({ card, assets, onSaved }) {
  const [last4, setLast4] = useState(card.last4 || '')
  const [assetId, setAssetId] = useState(card.default_cash_asset_id || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const changed = last4 !== (card.last4 || '') || assetId !== (card.default_cash_asset_id || '')

  async function save(e) {
    e.preventDefault()
    if (last4 && !/^[0-9]{4}$/.test(last4)) {
      setMessage('카드 번호 끝 4자리를 숫자로 입력해주세요')
      return
    }
    if (last4 && !assetId) {
      setMessage('결제대금이 빠져나갈 보유처를 선택해주세요')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await updateCreditCard(card.id, { last4: last4 || null, default_cash_asset_id: assetId || null })
      await onSaved()
      setMessage(last4 ? '알림 자동 등록에 연결했어요' : '자동 등록 연결을 해제했어요')
    } catch (err) {
      setMessage(err.code === '23505' ? '같은 끝 4자리를 쓰는 카드가 이미 있어요' : err.message || '저장하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="credit-card-form card-link-form" onSubmit={save}>
      <strong className="card-link-name">{card.nickname}</strong>
      <div className="field">
        <label htmlFor={`card-last4-${card.id}`}>카드 번호 끝 4자리</label>
        <input id={`card-last4-${card.id}`} inputMode="numeric" placeholder="예: 4371"
          value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      </div>
      <div className="field">
        <label htmlFor={`card-asset-${card.id}`}>결제대금 출금 보유처</label>
        <select id={`card-asset-${card.id}`} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">보유처를 선택하세요</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !changed}>
        {busy ? '저장 중...' : '저장'}
      </button>
      {message && <div className="hint-text card-link-message" role="status">{message}</div>}
    </form>
  )
}

export default function CardNotificationSettings({ family, profile, cards, onCardsChanged }) {
  const { confirm, notify } = useUI()
  const { assets } = useCashAssets(family?.id)
  const { token, notifications, error, refresh } = useCardNotifications(family?.id, profile?.id)
  const [newToken, setNewToken] = useState('')
  const [busy, setBusy] = useState(false)
  const myCards = cards.filter((card) => card.owner_id === profile?.id && card.active)
  const cardName = (id) => cards.find((card) => card.id === id)?.nickname

  async function handleCreateToken() {
    if (token && !(await confirm('기존 키를 넣어둔 휴대폰은 더 이상 알림을 보낼 수 없어요. 새 키로 바꿔 넣어주세요.', {
      title: '연결 키를 새로 만들까요?',
      confirmLabel: '새로 만들기',
    }))) return
    setBusy(true)
    try {
      setNewToken(await createCardNotificationToken())
      await refresh()
    } catch (err) {
      notify(err.message || '연결 키를 만들지 못했어요', true)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteToken() {
    if (!(await confirm('이 키를 넣어둔 휴대폰의 알림은 더 이상 기록되지 않아요.', { title: '연결 키를 삭제할까요?' }))) return
    try {
      await deleteCardNotificationToken(profile.id)
      setNewToken('')
      await refresh()
      notify('연결 키를 삭제했어요')
    } catch (err) {
      notify(err.message || '연결 키를 삭제하지 못했어요', true)
    }
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      notify(`${label}을(를) 복사했어요`)
    } catch {
      notify('복사하지 못했어요. 길게 눌러 직접 복사해주세요', true)
    }
  }

  const setupRows = [
    ['주소 (URL)', ENDPOINT],
    ['헤더 apikey', API_KEY],
    ['헤더 x-card-token', newToken],
    ['헤더 Content-Type', 'text/plain'],
    ['본문 (Body)', '[notification]'],
  ]

  return (
    <div className="card settings-wide card-notification-settings">
      <div className="section-title">카드 결제 알림 자동 등록</div>
      <div className="hint-text" style={{ marginBottom: 12 }}>
        안드로이드 자동화 앱(MacroDroid)이 삼성카드 카카오톡·문자 알림을 보내면 지출로 바로 기록해요.
        승인 취소 알림이 오면 기록한 지출을 지우고, 카톡과 문자가 함께 와도 한 번만 기록해요.
        가맹점별로 마지막에 고른 카테고리를 기억해요.
      </div>

      <h3 className="settings-subtitle">1. 카드 연결</h3>
      {myCards.length === 0 ? (
        <div className="hint-text">위의 내 신용카드에서 카드를 먼저 등록해주세요.</div>
      ) : myCards.map((card) => (
        <CardLink key={card.id} card={card} assets={assets} onSaved={onCardsChanged} />
      ))}

      <h3 className="settings-subtitle">2. 이 휴대폰 연결 키</h3>
      <div className="settings-list-item">
        <span>
          {token
            ? `키 있음 · ${dateTime(token.created_at)} 생성 · ${token.last_used_at ? `마지막 수신 ${dateTime(token.last_used_at)}` : '아직 받은 알림 없음'}`
            : '아직 연결 키가 없어요'}
        </span>
        <span className="credit-card-actions">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={handleCreateToken}>
            {token ? '새로 만들기' : '연결 키 만들기'}
          </button>
          {token && <button type="button" className="btn btn-sm btn-ghost" onClick={handleDeleteToken}>삭제</button>}
        </span>
      </div>
      {newToken && (
        <div className="card-notification-setup">
          <div className="hint-text">
            연결 키는 지금 한 번만 보여요. MacroDroid의 <strong>HTTP 요청(POST)</strong> 동작에 아래 값을 그대로 넣어주세요.
          </div>
          {setupRows.map(([label, value]) => (
            <div className="setup-row" key={label}>
              <span className="setup-label">{label}</span>
              <code>{value}</code>
              <button type="button" className="btn btn-sm" onClick={() => copy(value, label)}>복사</button>
            </div>
          ))}
        </div>
      )}

      <h3 className="settings-subtitle">
        3. 최근 받은 알림
        <button type="button" className="btn btn-sm btn-ghost" onClick={refresh}>새로고침</button>
      </h3>
      {error && <div className="error-text">알림 기록을 불러오지 못했어요.</div>}
      {notifications.length === 0 ? (
        <div className="hint-text">아직 받은 알림이 없어요.</div>
      ) : notifications.map((n) => (
        <div className="settings-list-item card-notification-item" key={n.id}>
          <span>
            <strong>{n.merchant || n.raw_text.slice(0, 30)}</strong>
            {n.amount != null && ` · ${n.kind === 'cancel' ? '-' : ''}${formatWon(n.amount)}`}
            {n.installment_months > 1 && ` · ${n.installment_months}개월`}
            <span className="tx-meta">
              {dateTime(n.approved_at || n.created_at)}
              {cardName(n.card_id) ? ` · ${cardName(n.card_id)}` : n.card_last4 ? ` · 끝자리 ${n.card_last4}` : ''}
              {n.message && ` · ${n.message}`}
            </span>
          </span>
          <span className={`badge notification-status ${n.status}`}>{STATUS[n.status] || n.status}</span>
        </div>
      ))}
    </div>
  )
}
