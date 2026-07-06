import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TUTORIALS } from '../tutorials'
import ReadFirstBlock from '../content/read-first-block'
import QueryAccount from '../content/query-account'
import StreamLiveOps from '../content/stream-live-ops'
import SendAward from '../content/send-award'
import TransferViz from '../content/transfer-viz'
import OnboardWithInvites from '../content/onboard-with-invites'
import Webhooks from '../content/webhooks'
import BuildTipBot from '../content/build-tip-bot'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const meta = TUTORIALS.find((t) => t.slug === slug)
  return { title: meta?.title ?? 'Tutorial' }
}

function renderContent(slug: string) {
  switch (slug) {
    case 'read-first-block':     return <ReadFirstBlock />
    case 'query-account':        return <QueryAccount />
    case 'stream-live-ops':      return <StreamLiveOps />
    case 'send-award':           return <SendAward />
    case 'transfer-viz':         return <TransferViz />
    case 'onboard-with-invites': return <OnboardWithInvites />
    case 'webhooks':             return <Webhooks />
    case 'build-tip-bot':        return <BuildTipBot />
    default:                     return null
  }
}

export default async function TutorialPage({ params }: Props) {
  const { slug } = await params
  const meta = TUTORIALS.find((t) => t.slug === slug)
  if (!meta) return notFound()

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/learn" className="font-prose text-xs text-fg-dim hover:text-fg">
          ← Learn
        </Link>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{meta.title}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-acc-green font-mono">{meta.time}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-dim font-prose">
            {meta.difficulty}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6 font-prose text-sm text-fg-muted [&_code]:font-mono [&_code]:text-fg [&_h3]:text-fg [&_h3]:font-semibold [&_h3]:mt-2 [&_strong]:text-fg">
        {renderContent(slug)}
      </div>
    </div>
  )
}
