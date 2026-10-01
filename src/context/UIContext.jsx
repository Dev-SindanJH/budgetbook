import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const UIContext = createContext(null)
function PromptDialog({ options, onResolve }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      (options.fields || []).map((f) => [f.name, f.value ?? '']),
    ),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    const message = options.validate?.(values)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setBusy(true)
    try {
      await options.onSubmit?.(values)
      onResolve(values)
    } catch (err) {
      setError(err.message || '저장하지 못했어요. 다시 시도해주세요.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={options.title}
      description={options.description}
      onClose={() => onResolve(null)}
      busy={busy}
      className="confirm-modal"
    >
      <form onSubmit={submit}>
        {(options.fields || []).map((field, index) => (
          <div className="field" key={field.name}>
            <label htmlFor={`prompt-${field.name}`}>{field.label}</label>
            <input
              id={`prompt-${field.name}`}
              type={field.type || 'text'}
              required={field.required !== false}
              min={field.min}
              max={field.max}
              maxLength={field.maxLength}
              data-autofocus={index === 0 ? '' : undefined}
              value={values[field.name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.name]: e.target.value }))
              }
            />
          </div>
        ))}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            data-autofocus={!options.fields?.length ? '' : undefined}
            onClick={() => onResolve(null)}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`btn ${options.danger ? 'btn-danger-solid' : 'btn-primary'}`}
          >
            {busy ? '처리 중…' : options.confirmLabel || '확인'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
export function UIProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [notice, setNotice] = useState(null)
  const resolver = useRef(null)
  const sequence = useRef(0)
  const location = useLocation()
  const resolve = useCallback((value) => {
    resolver.current?.(value)
    resolver.current = null
    setRequest(null)
  }, [])
  const ask = useCallback(
    (options) =>
      new Promise((done) => {
        resolver.current?.(null)
        resolver.current = done
        setRequest({ ...options, id: ++sequence.current })
      }),
    [],
  )
  const confirm = useCallback(
    async (description, options = {}) =>
      (await ask({
        title: '삭제할까요?',
        description,
        danger: true,
        confirmLabel: '삭제',
        ...options,
      })) !== null,
    [ask],
  )
  const notify = useCallback(
    (message, error = false) =>
      setNotice({ message, error, id: ++sequence.current }),
    [],
  )
  useEffect(() => {
    resolve(null)
  }, [location.pathname, resolve])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 4500)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => () => resolver.current?.(null), [])
  return (
    <UIContext.Provider value={{ ask, confirm, notify }}>
      {children}
      {request && (
        <PromptDialog key={request.id} options={request} onResolve={resolve} />
      )}
      {notice && (
        <div
          className={`toast${notice.error ? ' toast-error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          <Icon name={notice.error ? 'info' : 'check'} />
          <span>{notice.message}</span>
          <button
            className="icon-button"
            aria-label="알림 닫기"
            onClick={() => setNotice(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </UIContext.Provider>
  )
}
export function useUI() {
  return useContext(UIContext)
}
