'use client'

import { useState } from 'react'

export default function DragTestPage() {
  const [items, setItems] = useState(['Widget A', 'Widget B', 'Widget C', 'Widget D'])
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'))
    if (isNaN(sourceIdx) || sourceIdx === targetIdx) { setDragOverIdx(null); return }
    const next = [...items]
    const [moved] = next.splice(sourceIdx, 1)
    next.splice(targetIdx, 0, moved)
    setItems(next)
    setDragOverIdx(null)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginBottom: 16, fontSize: 18, fontWeight: 'bold' }}>Drag Test — Minimal</h1>

      <h2 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Test 1: Entire div is draggable</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {items.map((item, idx) => (
          <div
            key={item}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => handleDrop(e, idx)}
            style={{
              padding: 16,
              border: `2px solid ${dragOverIdx === idx ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 8,
              background: dragOverIdx === idx ? '#eff6ff' : 'white',
              cursor: 'grab',
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <h2 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Test 2: Only handle is draggable (flex sibling)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {items.map((item, idx) => (
          <div
            key={item}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => handleDrop(e, idx)}
            style={{
              display: 'flex',
              border: `2px solid ${dragOverIdx === idx ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 8,
              background: dragOverIdx === idx ? '#eff6ff' : 'white',
            }}
          >
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              style={{
                width: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                color: '#94a3b8',
                flexShrink: 0,
              }}
            >
              ⠿
            </div>
            <div style={{ flex: 1, padding: 16 }}>
              {item} (handle-only drag)
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Test 3: Handle + scrollable content</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 200 }}>
        {items.map((item, idx) => (
          <div
            key={item}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => handleDrop(e, idx)}
            style={{
              display: 'flex',
              border: `2px solid ${dragOverIdx === idx ? '#3b82f6' : '#e2e8f0'}`,
              borderRadius: 8,
              background: dragOverIdx === idx ? '#eff6ff' : 'white',
              overflow: 'hidden',
            }}
          >
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              style={{
                width: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                color: '#94a3b8',
                flexShrink: 0,
              }}
            >
              ⠿
            </div>
            <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
              <p style={{ fontWeight: 600 }}>{item}</p>
              {Array.from({ length: 20 }).map((_, i) => (
                <p key={i} style={{ fontSize: 12, color: '#64748b' }}>Scrollable content line {i + 1}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
