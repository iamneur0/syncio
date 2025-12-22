'use client'

import AppLayout from '@/components/layout/AppLayout'
import UserSettingsPage from '@/components/pages/user/UserSettingsPage'
import { Home, Activity, BookOpen, Share2, Settings } from 'lucide-react'

const userNavigation = [
  { name: 'Home', icon: Home, id: 'home', path: '/user/home' },
  { name: 'Activity', icon: Activity, id: 'activity', path: '/user/activity' },
  { name: 'Library', icon: BookOpen, id: 'library', path: '/user/library' },
  { name: 'Shares', icon: Share2, id: 'shares', path: '/user/shares' },
  { name: 'Settings', icon: Settings, id: 'settings', path: '/user/settings' },
]

export default function UserSettingsRoute() {
  return (
    <AppLayout navigation={userNavigation}>
      <UserSettingsPage />
    </AppLayout>
  )
}

