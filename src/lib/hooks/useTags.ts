import { useState, useEffect, useCallback } from 'react'
import type { CandidateTag } from '@/lib/types/database'

export function useTags(candidateId: string) {
  const [tags, setTags] = useState<CandidateTag[]>([])

  const loadTags = useCallback(async () => {
    const res = await fetch(`/api/candidates/${candidateId}/tags`)
    if (res.ok) {
      const json = await res.json()
      setTags(json.data ?? [])
    }
  }, [candidateId])

  useEffect(() => { loadTags() }, [loadTags])

  const addTag = useCallback((tag: CandidateTag) => {
    setTags(prev => [...prev, tag])
  }, [])

  const removeTag = useCallback((tagId: string) => {
    setTags(prev => prev.filter(t => t.id !== tagId))
  }, [])

  return { tags, addTag, removeTag }
}
