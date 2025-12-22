'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import UsersPage from '@/components/pages/UsersPage'

// Admin entrypoint: show admin login (via AuthGate) and then redirect to /users
export default function AdminHomePage() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to /users once authenticated
    router.replace('/users')
  }, [router])

  return (
    <AppLayout>
      <UsersPage />
    </AppLayout>
  )
}










