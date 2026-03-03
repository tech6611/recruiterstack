'use client'

import { useState, useEffect } from 'react'

export interface AppSettings {
  company_name: string
  company_website: string
  recruiter_name: string
  recruiter_email: string
  recruiter_title: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  company_name: '',
  company_website: '',
  recruiter_name: '',
  recruiter_email: '',
  recruiter_title: '',
}

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
