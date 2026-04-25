'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { UserAuthProvider } from '@/lib/hooks/useUserAuth';
import { UserAuthGate } from '@/components/user/UserAuthGate';
import { UserSidebar } from '@/components/user/UserSidebar';
import { UserPageContainer } from '@/components/user/UserPageContainer';

/**
 * User panel layout with sidebar navigation
 * 
 * All user pages (home, library, activity, etc.) use this layout.
 * Requires Stremio OAuth authentication.
 */
export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const path = pathname || '/user';

    let section = 'Home';
    if (path.startsWith('/user/library')) section = 'Library';
    else if (path.startsWith('/user/activity')) section = 'Activity';
    else if (path.startsWith('/user/addons')) section = 'Addons';
    else if (path.startsWith('/user/shares')) section = 'Shares';
    else if (path.startsWith('/user/settings')) section = 'Settings';

    document.title = `Syncio - ${section}`;
  }, [pathname]);

  return (
    <UserAuthProvider>
      <UserAuthGate>
        <div className="relative min-h-screen">
          <UserSidebar />
          <UserPageContainer>
            {children}
          </UserPageContainer>
        </div>
      </UserAuthGate>
    </UserAuthProvider>
  );
}
