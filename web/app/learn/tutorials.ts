import type { TutorialMeta } from '@/components/TutorialCard'

export const TUTORIALS: TutorialMeta[] = [
  {
    slug: 'read-first-block',
    title: 'Read your first block',
    description: 'Fetch a VIZ block by number and inspect the operations it contains.',
    time: '5 min',
    difficulty: 'beginner',
  },
  {
    slug: 'query-account',
    title: 'Query an account',
    description: 'Read account balances, SHARES, and current energy percentage.',
    time: '5 min',
    difficulty: 'beginner',
  },
  {
    slug: 'transfer-viz',
    title: 'Transfer VIZ',
    description: 'Move liquid VIZ between accounts with an optional memo.',
    time: '5 min',
    difficulty: 'beginner',
  },
  {
    slug: 'stream-live-ops',
    title: 'Stream live operations',
    description: 'Connect to the WebSocket feed and react to operations in real time.',
    time: '10 min',
    difficulty: 'intermediate',
  },
  {
    slug: 'send-award',
    title: 'Send an award',
    description: 'Use @viz-cx/core to construct, sign, and broadcast an award operation.',
    time: '10 min',
    difficulty: 'intermediate',
  },
  {
    slug: 'onboard-with-invites',
    title: 'Onboard users with invites',
    description: 'Fund an invite and register a fresh, capitalized account from a secret.',
    time: '10 min',
    difficulty: 'intermediate',
  },
  {
    slug: 'webhooks',
    title: 'React to events with webhooks',
    description: 'Get signed op deliveries pushed to your server — no persistent socket.',
    time: '10 min',
    difficulty: 'intermediate',
  },
  {
    slug: 'build-tip-bot',
    title: 'Build a tip bot',
    description: 'Stream live transfers and auto-award senders — a complete app in ~40 lines.',
    time: '15 min',
    difficulty: 'advanced',
  },
]
