import Image from 'next/image'

interface ProviderBadgeProps {
  providerType?: string | null
  size?: 'sm' | 'md'
}

const ICONS: Record<string, string> = {
  stremio: '/assets/stremio-icon.png',
  nuvio: '/assets/nuvio-icon.png',
}

export default function ProviderBadge({ providerType, size = 'sm' }: ProviderBadgeProps) {
  if (!providerType || !ICONS[providerType]) return null
  const px = size === 'sm' ? 16 : 20
  return (
    <Image
      src={ICONS[providerType]}
      alt={providerType}
      width={px}
      height={px}
      className="inline-block flex-shrink-0"
      style={{ verticalAlign: 'middle' }}
    />
  )
}
