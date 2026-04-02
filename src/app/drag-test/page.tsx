'use client'

import { useState } from 'react'

export default function DragTestPage() {
  const [items, setItems] = useState(['Widget A', 'Widget B', 'Widget C', 'Widget D'])
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [log, setLog] = useState<string[]>([])

  function addLog(msg: string) {
    setLog(prev => [msg, ...prev].slice(0, 10))
  }

  function handleDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx))
    e.dataTransfer.effectAllowed = 'move'
    addLog(`dragStart: item ${idx}`)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIdx !== idx) {
      setDragOverIdx(idx)
      addLog(`dragOver: item ${idx}`)
    }
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'))
    addLog(`drop: source=${sourceIdx} target=${targetIdx}`)
    if (isNaN(sourceIdx) || sourceIdx === targetIdx) { setDragOverIdx(null); return }
    const next = [...items]
    const [moved] = next.splice(sourceIdx, 1)
    next.splice(targetIdx, 0, moved)
    setItems(next)
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    addLog('dragEnd')
    setDragOverIdx(null)
  }

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
        Drag & Drop Test (outside dashboard layout)
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        This page renders outside the dashboard layout — no Sidebar, no overflow-auto wrapper.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {items.map((item, idx) => (
          <div
            key={item + idx}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            style={{
              padding: 20,
              border: `2px solid ${dragOverIdx === idx ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 8,
              background: dragOverIdx === idx ? '#eff6ff' : 'white',
              cursor: 'grab',
              userSelect: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div style={{ padding: 12, background: '#f1f5f9', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Event Log:</p>
        {log.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Drag a widget to see events...</p>
        ) : (
          log.map((l, i) => <p key={i} style={{ color: '#475569' }}>{l}</p>)
        )}
      </div>
    </div>
  )
}
