import React from 'react'
import Spiral from './Spiral'

interface LogoProps {
  className?: string
  /** show only the spiral mark (no wordmark) */
  markOnly?: boolean
  /** size of the spiral, in px */
  markSize?: number
}

/**
 * Whirlcrypt masthead — letterpress wordmark in Fraunces italic, anchored
 * by the RFC-8188 record-spiral mark in ember.
 */
const Logo: React.FC<LogoProps> = ({ className, markOnly = false, markSize = 32 }) => {
  return (
    <div
      className={`flex items-baseline gap-3 select-none text-ink ${className || ''}`}
      style={{ lineHeight: 1 }}
    >
      <span className="text-ember" style={{ display: 'inline-flex', alignSelf: 'center' }}>
        <Spiral size={markSize} title="Whirlcrypt" />
      </span>
      {!markOnly && (
        <span
          className="font-display"
          style={{
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)',
            letterSpacing: '-0.01em',
          }}
        >
          Whirlcrypt
        </span>
      )}
    </div>
  )
}

export default Logo
