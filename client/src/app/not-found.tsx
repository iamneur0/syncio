import React from 'react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-semibold mb-3">Page not found</h2>
        <p className="theme-text-3 mb-6">The page you are looking for does not exist.</p>
        <Link href="/" className="px-4 py-2 rounded-md accent-bg accent-text hover:opacity-90">
          Go home
        </Link>
      </div>
    </div>
  )
}



