/**
 * Shared Tailwind CSS class constants for consistent form styling.
 * Consolidates duplicated inputCls/labelCls from 8+ files.
 */

/** Standard input field — slate background */
export const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'

/** Input field — white background variant (used in public forms) */
export const inputClsWhite = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'

/** Standard label */
export const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
