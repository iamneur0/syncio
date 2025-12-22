'use client'

import AppLayout from '@/components/layout/AppLayout'
import UserLibraryPage from '@/components/pages/user/UserLibraryPage'
import { Home, Activity, BookOpen, Share2, Settings } from 'lucide-react'

const userNavigation = [
  { name: 'Home', icon: Home, id: 'home', path: '/user/home' },
  { name: 'Activity', icon: Activity, id: 'activity', path: '/user/activity' },
  { name: 'Library', icon: BookOpen, id: 'library', path: '/user/library' },
  { name: 'Shares', icon: Share2, id: 'shares', path: '/user/shares' },
  { name: 'Settings', icon: Settings, id: 'settings', path: '/user/settings' },
]

export default function UserLibraryRoute() {
  return (
    <AppLayout navigation={userNavigation}>
      <UserLibraryPage />
    </AppLayout>
  )
}

