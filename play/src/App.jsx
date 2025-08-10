import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

// Contract
// - JSON files under src/scripts/*.json
// - Shape: { "title": string, "paragraphs": string[] } or { "title": string, "text": string }
// - Auto-detected and listed; selecting one loads its content

const useScripts = () => {
  // Eagerly import all JSON files under src/scripts
  const modules = useMemo(
    () => import.meta.glob('./scripts/**/*.json', { eager: true }),
    []
  )
  const list = Object.entries(modules)
    .map(([path, mod]) => {
      const name = path.split('/').slice(-1)[0].replace(/\.json$/, '')
      const data = mod.default ?? mod
      return { id: path, name, data }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return list
}

function normalizeText(data) {
  if (!data) return ''
  if (Array.isArray(data.paragraphs)) return data.paragraphs.join('\n\n')
  if (typeof data.text === 'string') return data.text
  if (Array.isArray(data)) return data.join('\n\n')
  return String(data)
}

export default function App() {
  const scripts = useScripts()
  const [selectedId, setSelectedId] = useState(scripts[0]?.id)
  const selected = scripts.find(s => s.id === selectedId)
  const [fontSize, setFontSize] = useState(36)
  const [speed, setSpeed] = useState(40) // px per second
  const [mirror, setMirror] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCounting, setIsCounting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showText, setShowText] = useState(true)
  const [reveal, setReveal] = useState(false)
  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)

  useEffect(() => {
    // Reset scroll when script changes
    const el = viewportRef.current
    if (el) el.scrollTop = 0
  }, [selectedId])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Handle 3-2-1 countdown before starting
  useEffect(() => {
    if (!isCounting) return
    if (countdown <= 0) {
      setIsCounting(false)
  setShowText(true)
  setReveal(true)
  setPlaying(true)
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [isCounting, countdown])

  useEffect(() => {
    // Animation loop for autoscroll
    if (!playing) {
      cancelAnimationFrame(rafRef.current)
      lastTsRef.current = 0
      return
    }
    const step = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      const el = viewportRef.current
      const content = contentRef.current
      if (el && content) {
        el.scrollTop += speed * dt
        const maxScroll = content.offsetHeight - el.clientHeight
        if (el.scrollTop >= maxScroll - 1) {
          setPlaying(false)
          return // stop at bottom
        }
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed])

  const text = normalizeText(selected?.data)
  const maxSpeed = 2000 // sync with slider max
  const revealMs = (() => {
    // Map speed (0..maxSpeed) -> duration (slow -> longer)
    const minMs = 400
    const maxMs = 1400
    const s = Math.max(0, Math.min(speed, maxSpeed))
    const normalized = 1 - s / maxSpeed // 0 (fast) .. 1 (slow)
    return Math.round(minMs + normalized * (maxMs - minMs))
  })()

  const startCountdown = (seconds = 3) => {
    const el = viewportRef.current
    if (el) el.scrollTop = 0
    setPlaying(false)
    lastTsRef.current = 0
  setShowText(false)
  setReveal(false)
    setCountdown(seconds)
    setIsCounting(true)
  }

  const onPlayClick = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (isCounting) {
      // cancel countdown
      setIsCounting(false)
      setCountdown(0)
      return
    }
    startCountdown(3)
  }

  return (
    <div className="teleprompter-app">
      <header className="tp-header">
        <h1>Teleprompter</h1>
        <div className="tp-controls">
          <label>
            Script:
            <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
              {scripts.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Font: {fontSize}px
            <input type="range" min={16} max={96} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>
          <label>
            Speed: {speed}px/s
            <input type="range" min={0} max={2000} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>
          <label className="tp-checkbox">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror
          </label>
          <button onClick={onPlayClick}>{isCounting ? 'Cancel' : (playing ? 'Pause' : 'Play')}</button>
          <button onClick={() => { const el = viewportRef.current; if (el) el.scrollTop = 0; setPlaying(false) }}>Reset</button>
          <button onClick={async () => {
            try {
              if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen()
              } else {
                await document.exitFullscreen()
              }
            } catch {}
          }}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
        </div>
      </header>

      <main className={`tp-viewport ${mirror ? 'mirror' : ''}`} ref={viewportRef}>
  <div className={`tp-content ${!showText ? 'tp-hidden' : ''} ${reveal ? 'tp-reveal' : ''}`} ref={contentRef} style={{ fontSize: fontSize, '--tpRevealMs': `${revealMs}ms` }}>
          {text ? text.split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          )) : (
            <p className="tp-empty">Place JSON scripts in src/scripts. Example files have been added.</p>
          )}
        </div>
        {isCounting && (
          <div className="tp-countdown" aria-live="polite" aria-atomic="true">
            <div key={countdown} className="tp-count-digit">{countdown}</div>
          </div>
        )}
      </main>

      <footer className="tp-footer" style={{ marginTop: '2rem', paddingBottom: '1rem' }}>
        <small>Tip: Add new scripts as .json files under src/scripts. They will appear automatically.</small>
      </footer>
    </div>
  )
}
