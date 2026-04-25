'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageContainer } from "@/components/layout/PageContainer";

interface MobileMenuContextType {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const MobileMenuContext = createContext<MobileMenuContextType>({
  isOpen: false,
  onOpen: () => {},
  onClose: () => {},
});

export function useMobileMenu() {
  return useContext(MobileMenuContext);
}

/**
 * Admin layout with sidebar navigation
 * 
 * All admin pages (dashboard, users, groups, etc.) use this layout.
 * Each page uses useMobileMenu() hook to get the menu open function for the Header.
 */
export default function AdminClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const handleOpen = () => setIsMobileMenuOpen(true);
  const handleClose = () => setIsMobileMenuOpen(false);

  return (
    <MobileMenuContext.Provider value={{ isOpen: isMobileMenuOpen, onOpen: handleOpen, onClose: handleClose }}>
      <div className="relative min-h-screen">
        <Sidebar 
          isOpen={isMobileMenuOpen} 
          onClose={handleClose} 
        />
        <PageContainer>
          {children}
        </PageContainer>
      </div>
    </MobileMenuContext.Provider>
  );
}
