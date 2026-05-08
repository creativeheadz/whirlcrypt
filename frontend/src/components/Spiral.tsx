import React, { useMemo } from 'react'

interface SpiralProps {
  size?: number | string
  className?: string
  /** thickness of the spiral stroke (in viewBox units, 0..100) */
  stroke?: number
  /** number of full turns */
  turns?: number
  /** record tick marks (boundary marks along the spiral) */
  ticks?: number
  /** color override (default uses currentColor — inherits text color) */
  color?: string
  /** show the central salt dot */
  showOrigin?: boolean
  /** show the terminal ember dot (auth tag) */
  showTerminus?: boolean
  title?: string
}

/**
 * Whirlcrypt mark — an RFC-8188 record-spiral glyph.
 *
 * The spiral is a logarithmic vortex drawn around a central salt point.
 * Tick marks at regular angular intervals symbolise record boundaries
 * (each RFC-8188 record ends in a 16-byte AES-GCM auth tag); the terminal
 * ember dot is the final auth tag that seals the stream.
 */
const Spiral: React.FC<SpiralProps> = ({
  size = 32,
  className,
  stroke = 1.4,
  turns = 2.75,
  ticks = 11,
  color,
  showOrigin = true,
  showTerminus = true,
  title,
}) => {
  const { path, tickLines, terminus } = useMemo(() => {
    const cx = 50
    const cy = 50
    const rStart = 2.5
    const rEnd = 38

    const steps = 240
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const theta = t * turns * Math.PI * 2 - Math.PI / 2 // start pointing up
      const r = rStart + (rEnd - rStart) * t
      const x = cx + r * Math.cos(theta)
      const y = cy + r * Math.sin(theta)
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
    }
    const path = 'M ' + pts.join(' L ')

    const tickLines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (let i = 1; i <= ticks; i++) {
      const t = i / (ticks + 1)
      const theta = t * turns * Math.PI * 2 - Math.PI / 2
      const r = rStart + (rEnd - rStart) * t
      const x = cx + r * Math.cos(theta)
      const y = cy + r * Math.sin(theta)
      // tick is perpendicular to radius, length grows outward
      const len = 1.2 + 1.5 * t
      const tx = -Math.sin(theta) * len
      const ty = Math.cos(theta) * len
      tickLines.push({ x1: x - tx, y1: y - ty, x2: x + tx, y2: y + ty })
    }

    // terminal point
    const lastTheta = turns * Math.PI * 2 - Math.PI / 2
    const tx = cx + rEnd * Math.cos(lastTheta)
    const ty = cy + rEnd * Math.sin(lastTheta)
    return { path, tickLines, terminus: { x: tx, y: ty } }
  }, [turns, ticks])

  const stroke_ = color ?? 'currentColor'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* spiral arm */}
      <path
        d={path}
        fill="none"
        stroke={stroke_}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* record tick marks */}
      {tickLines.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={stroke_}
          strokeWidth={stroke * 0.85}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
      {/* salt origin */}
      {showOrigin ? (
        <circle cx={50} cy={50} r={1.6} fill={stroke_} />
      ) : null}
      {/* terminal auth-tag dot — uses ember explicitly even if stroke is currentColor */}
      {showTerminus ? (
        <circle
          cx={terminus.x}
          cy={terminus.y}
          r={1.8}
          fill="var(--ember)"
        />
      ) : null}
    </svg>
  )
}

export default Spiral
