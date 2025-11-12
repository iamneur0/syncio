'use client'

import { Inter } from 'next/font/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/contexts/ThemeContext'

import './globals.css'
import AuthGate from '@/components/auth/AuthGate'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Syncio</title>
        <meta name="application-name" content="Syncio" />
        <meta name="apple-mobile-web-app-title" content="Syncio" />
        <meta name="description" content="Syncio - Stremio Group Manager" />
        {/* Single theme-color; ThemeProvider updates it dynamically */}
        <meta name="theme-color" content="#111827" />
        {/* Pre-init theme to avoid flash and fix overscroll background before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  // Silence console in browser unless NEXT_PUBLIC_DEBUG is true
                  var dbg = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1')) || (typeof window !== 'undefined' && (window.NEXT_PUBLIC_DEBUG === 'true' || window.NEXT_PUBLIC_DEBUG === '1'));
                  if (!dbg) { var noop=function(){}; console.log=noop; console.info=noop; console.warn=noop; }
                  var d = document.documentElement;
                  var saved = localStorage.getItem('theme');
                  var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = saved || (isDark ? 'dark' : 'light');
                  if (theme === 'modern' || theme === 'modern-dark') theme = 'dark';
                  var themeClasses = ['light','dark','modern','modern-dark','mono','aubergine','hoth','aurora','choco-mint','ochin','work-hard'];
                  themeClasses.forEach(function(cls){ d.classList.remove(cls); });
                  d.classList.add(theme);
                  var tag = document.querySelector('meta[name="theme-color"]');
                  if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name','theme-color'); document.head.appendChild(tag); }
                  var colors = { light: '#f9fafb', dark: '#111827', mono: '#000000', 'modern': '#f9fafb', 'modern-dark': '#111827', 'aubergine': '#1f1029', 'hoth': '#f5f7fb', 'aurora': '#141827', 'choco-mint': '#1f2620', 'ochin': '#101f33', 'work-hard': '#2d2213' };
                  tag.setAttribute('content', colors[theme] || '#111827');
                } catch(e){}
              })();
            `
          }}
        />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#6B46C1" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthGate>
              {children}
            </AuthGate>
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 2000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
