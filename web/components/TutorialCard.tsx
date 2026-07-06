import Link from 'next/link'

export interface TutorialMeta {
  slug: string
  title: string
  description: string
  time: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
}

export function TutorialCard({ meta }: { meta: TutorialMeta }) {
  return (
    <Link
      href={`/learn/${meta.slug}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors"
    >
      <span className="font-prose text-sm font-medium text-acc-blue">{meta.title}</span>
      <span className="font-prose text-xs text-fg-muted flex-1">{meta.description}</span>
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-acc-green font-mono">{meta.time}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-dim font-prose">
          {meta.difficulty}
        </span>
      </div>
    </Link>
  )
}
