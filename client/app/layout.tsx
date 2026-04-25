import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/lib/theme";
import { UserCacheProvider } from "@/components/providers/UserCacheProvider";

export const metadata: Metadata = {
  title: "Syncio - Users, Groups & Addons",
  description: "Syncio - Stremio Addon and User Management System",
  applicationName: "Syncio",
  icons: {
    icon: [
      { url: '/logo-black.png', media: '(prefers-color-scheme: light)' },
      { url: '/logo-white.png', media: '(prefers-color-scheme: dark)' },
    ],
    apple: [
      { url: '/logo-black.png', media: '(prefers-color-scheme: light)' },
      { url: '/logo-white.png', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased aurora-scrollbar overflow-x-hidden bg-page"
        style={{
          color: 'var(--color-text)'
        }}
      >
        <ThemeProvider>
          <UserCacheProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </UserCacheProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
