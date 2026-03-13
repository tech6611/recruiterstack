'use client'

import { useState, useEffect } from 'react'

export interface AppSettings {
  company_name: string
  company_website: string
  recruiter_name: string
  recruiter_email: string
  recruiter_title: string
  /** Field IDs shown on each kanban candidate card (user-configurable) */
  kanban_card_fields: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  company_name: '',
  company_website: '',
  recruiter_name: '',
  recruiter_email: '',
  recruiter_title: '',
  kanban_card_fields: ['company'],
}

/** All configurable kanban card field definitions */
export const KANBAN_CARD_FIELD_OPTIONS = [
  { id: 'company',   label: 'Title / Company',      description: 'Current role & employer shown below name' },
  { id: 'source',    label: 'Source',               description: 'How the candidate entered the pipeline'  },
  { id: 'ai_signal', label: 'AI Signal',            description: 'AI recommendation (Strong Yes / No…)'   },
  { id: 'ai_score',  label: 'AI Score',             description: 'Numeric AI compatibility score'          },
  { id: 'days',      label: 'Days in Pipeline',     description: 'Time elapsed since application'          },
  { id: 'location',  label: 'Location',             description: 'Candidate location'                      },
] as const

const STORAGE_KEY = 'recruiterstack_settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
      }
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [])

  const save = (updated: AppSettings) => {
    setSettings(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore
    }
  }

  return { settings, save, loaded }
}
