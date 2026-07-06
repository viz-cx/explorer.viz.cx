import type { Metadata } from 'next'
import { TutorialCard } from '@/components/TutorialCard'
import { TUTORIALS } from './tutorials'

export const metadata: Metadata = { title: 'Learn' }

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Learn</h1>
        <p className="mt-1 font-prose text-sm text-fg-dim">Developer guides for building on VIZ.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TUTORIALS.map((meta) => (
          <TutorialCard key={meta.slug} meta={meta} />
        ))}
      </div>
    </div>
  )
}
