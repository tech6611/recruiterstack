const isDev = process.env.NODE_ENV !== 'production'

type LogMeta = Record<string, unknown>

function formatMessage(level: string, message: string, meta?: LogMeta, error?: unknown) {
  if (isDev) {
    const prefix = { info: 'ℹ', warn: '⚠', error: '✖' }[level] ?? '•'
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
    const errStr = error instanceof Error ? `\n  ${error.stack}` : ''
    return `${prefix} ${message}${metaStr}${errStr}`
  }

  const entry: LogMeta = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }
  if (error instanceof Error) {
    entry.error_name = error.name
    entry.error_message = error.message
    entry.stack = error.stack
  } else if (error !== undefined) {
    entry.error = String(error)
  }
  return JSON.stringify(entry)
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.log(formatMessage('info', message, meta))
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(formatMessage('warn', message, meta))
  },
  error(message: string, error?: unknown, meta?: LogMeta) {
    console.error(formatMessage('error', message, meta, error))
  },
}
