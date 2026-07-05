'use client'
import type { ReactNode } from 'react'
import { WalletProvider, useWallet } from '@/lib/wallet'
import { ToastProvider } from '@/lib/toast'
import { NotificationsProvider } from '@/lib/notifications'
import { ConnectModal } from './ConnectModal'

function ModalMount() {
  const { modalOpen, closeModal, modalMode } = useWallet()
  return <ConnectModal open={modalOpen} onClose={closeModal} mode={modalMode} />
}

export function WalletLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>
        <NotificationsProvider>
          {children}
          <ModalMount />
        </NotificationsProvider>
      </WalletProvider>
    </ToastProvider>
  )
}
