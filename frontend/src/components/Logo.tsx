import React from 'react'
import logoImage from '../assets/images/whirlcrypt-logo.png'

const Logo: React.FC<{ className?: string }>= ({ className }) => {
  return (
    <div className={`flex items-center justify-center select-none ${className || ''}`}>
      <img
        src={logoImage}
        alt="Whirlcrypt Logo"
        className="h-12 w-auto object-contain"
      />
    </div>
  )
}

export default Logo

