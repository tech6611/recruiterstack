import { useState, useEffect, useCallback } from 'react'
import type { CandidateTask } from '@/lib/types/database'

export function useTasks(candidateId: string) {
  const [tasks, setTasks] = useState<CandidateTask[]>([])

  const loadTasks = useCallback(async () => {
    const res = await fetch(`/api/candidates/${candidateId}/tasks`)
    if (res.ok) {
      const json = await res.json()
      setTasks(json.data ?? [])
    }
  }, [candidateId])

  useEffect(() => { loadTasks() }, [loadTasks])

  const addTask = useCallback((task: CandidateTask) => {
    setTasks(prev => [...prev, task])
  }, [])

  const updateTask = useCallback((task: CandidateTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? task : t))
  }, [])

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  return { tasks, addTask, updateTask, deleteTask }
}
