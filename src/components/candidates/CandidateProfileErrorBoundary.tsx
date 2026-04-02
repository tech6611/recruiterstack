'use client'
import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertCircle } from 'lucide-react'

interface State { hasError: boolean; error: Error | null }

export default class CandidateProfileErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-3">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="font-medium text-slate-600">Something went wrong</p>
          <p className="text-xs text-slate-400 max-w-sm text-center">
            An error occurred while loading this candidate profile.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-4 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
