import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'

interface InvitationStatusBadgeProps {
  isComplete: boolean
  isExpired: boolean
}

/**
 * Status badge for invitations showing Expired, Full, or Incomplete
 */
export function InvitationStatusBadge({ isComplete, isExpired }: InvitationStatusBadgeProps) {
  const { theme } = useTheme()
  const accentStyles = getEntityColorStyles(theme, 1)
  const baseBackground = accentStyles.accentHex
  const accentTextColor = accentStyles.textColor
  const syncedDot = '#22c55e'
  const unsyncedDot = '#ef4444'
  
  const config = isExpired
    ? {
        text: 'Expired',
        background: baseBackground,
        dot: unsyncedDot,
        textColor: accentTextColor
      }
    : isComplete
    ? {
        text: 'Full',
        background: baseBackground,
        dot: syncedDot,
        textColor: accentTextColor
      }
    : {
        text: 'Incomplete',
        background: baseBackground,
        dot: unsyncedDot,
        textColor: accentTextColor
      }

  return (
    <div 
      className="inline-flex items-center px-2 py-1 text-xs font-medium cursor-default"
      style={{ 
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        paddingLeft: '8px',
        paddingRight: '8px',
        paddingTop: '4px',
        paddingBottom: '4px',
        backgroundColor: config.background,
        color: config.textColor
      }}
      title={isExpired ? 'Expired (invitation has expired)' : isComplete ? 'Full (max uses reached)' : 'Incomplete (not all invites used)'}
    >
      <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: config.dot }} />
      {config.text}
    </div>
  )
}

