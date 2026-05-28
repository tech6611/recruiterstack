'use client'

import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Network, UserCog } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmployeeStatus } from '@/lib/types/database'

type Node = {
  id: string
  status: EmployeeStatus
  manager_id: string | null
  person: { name: string; email: string } | null
}

type TreeNode = Node & { children: TreeNode[] }

const STATUS_DOT: Record<EmployeeStatus, string> = {
  pending:    'bg-amber-400',
  active:     'bg-emerald-500',
  terminated: 'bg-slate-300',
}

function buildTree(nodes: Node[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const n of nodes) byId.set(n.id, { ...n, children: [] })

  const roots: TreeNode[] = []
  for (const node of Array.from(byId.values())) {
    if (node.manager_id && byId.has(node.manager_id)) {
      byId.get(node.manager_id)!.children.push(node)
    } else {
      // No manager, OR manager points to someone outside the live set —
      // treat as a root (likely a top-level person or an orphan reference).
      roots.push(node)
    }
  }

  // Sort each level alphabetically by name for stable display.
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => (a.person?.name ?? '').localeCompare(b.person?.name ?? ''))
    for (const n of arr) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

function Row({ node, depth, expanded, toggle }: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
}) {
  const isOpen = expanded.has(node.id)
  const hasKids = node.children.length > 0
  return (
    <>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={() => hasKids && toggle(node.id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${hasKids ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600' : 'invisible'}`}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[node.status]}`} title={node.status} />

        <Link
          href={`/hris/employees/${node.id}`}
          className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
        >
          {node.person?.name ?? 'Unknown'}
          <span className="ml-2 text-xs text-slate-400">{node.person?.email ?? ''}</span>
        </Link>

        {hasKids && (
          <span className="shrink-0 text-xs text-slate-400">
            {node.children.length} report{node.children.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isOpen && node.children.map(child => (
        <Row key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </>
  )
}

export default function OrgChartPage() {
  const { orgId } = useAuth()
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchTree = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hris/org-chart')
    if (res.ok) {
      const j = await res.json()
      const data = (j.data ?? []) as Node[]
      setNodes(data)
      // Default-expand every node so the user sees the whole shape on first load.
      setExpanded(new Set(data.map(n => n.id)))
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchTree() }, [fetchTree, orgId])

  const tree = useMemo(() => buildTree(nodes), [nodes])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (!flags.hris) {
    return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Network className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Org chart</h1>
          <p className="text-sm text-slate-500">
            Reporting structure across {nodes.length} live employee{nodes.length === 1 ? '' : 's'}.
            Click anyone to open their record.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-400">
            <UserCog className="h-8 w-8 text-slate-300" />
            No active employees yet. Hire someone in the ATS to populate the chart.
          </div>
        ) : (
          <div>
            {tree.map(root => (
              <Row key={root.id} node={root} depth={0} expanded={expanded} toggle={toggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
