import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

export default function Modal({
  title,
  description,
  children,
  onClose,
  busy = false,
  className = '',
}) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog
      .querySelector(
        '[data-autofocus], input:not([type="hidden"]), select, textarea',
      )
      ?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(
    <dialog
      ref={ref}
      className={`modal-box ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const items = [
          ...e.currentTarget.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ].filter((item) => item.getClientRects().length)
        const first = items[0],
          last = items[items.length - 1]
        if (!first) {
          e.preventDefault()
          return
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === e.currentTarget)
        ) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || busy) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose()
      }}
    >
      <div className="modal-handle" aria-hidden="true" />
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="닫기"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {description && (
        <p id={descriptionId} className="modal-description">
          {description}
        </p>
      )}
      {children}
    </dialog>,
    document.body,
  )
}
