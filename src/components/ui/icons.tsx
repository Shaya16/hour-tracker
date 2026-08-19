/**
 * Hand-rolled icon set — a dozen 24px glyphs, stroked to match the mockup's light
 * line weight. Cheaper and more consistent than pulling in an icon package.
 */

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
    'aria-hidden': true,
  } as const
}

const S = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function TimerIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="13" r="8" {...S} strokeWidth={strokeWidth} />
      <path d="M12 9.5V13l2.5 1.5M9 2h6" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function CalendarIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="5" width="18" height="16" rx="4" {...S} strokeWidth={strokeWidth} />
      <path d="M3 10h18M8 3v4M16 3v4" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ChartIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function SettingsIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" {...S} strokeWidth={strokeWidth} />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        {...S}
        strokeWidth={strokeWidth}
      />
    </svg>
  )
}

export function PlayIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 5.5a1 1 0 0 1 1.53-.85l9 6.5a1 1 0 0 1 0 1.7l-9 6.5A1 1 0 0 1 8 18.5Z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="6.5" y="5" width="4" height="14" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.6" fill="currentColor" />
    </svg>
  )
}

export function StopIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  )
}

export function PlusIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ChevronLeft({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 6l-6 6 6 6" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ChevronRight({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 6l6 6-6 6" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function TrashIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function CloseIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12M18 6L6 18" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function CheckIcon({ size = 24, className, strokeWidth = 2.2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function CloudIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 18a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.7-1.5A4.25 4.25 0 0 1 17.5 18Z" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function DownloadIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function UploadIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 15V3m0 0L8 7m4-4l4 4M4 19h16" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function BriefcaseIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="7" width="18" height="13" rx="3" {...S} strokeWidth={strokeWidth} />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function CoffeeIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" {...S} strokeWidth={strokeWidth} />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M7 3v2M11 3v2" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function EditIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function HomeIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 10.5 12 3.5l8.5 7" {...S} strokeWidth={strokeWidth} />
      <path
        d="M5.5 9.8V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.8"
        {...S}
        strokeWidth={strokeWidth}
      />
      <path d="M9.5 20.5V15a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.5" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ClockIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" {...S} strokeWidth={strokeWidth} />
      <path d="M12 7.2V12l3.4 2" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ArrowRightIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function BoltIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M13.5 2.5 5 13.5h5.5L10 21.5 19 10.5h-5.5Z" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function NoteIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 6.5h14M5 12h14M5 17.5h8.5" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function TargetIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" {...S} strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="4" {...S} strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TrendUpIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 17.5 9.5 11l4 4L21 7.5" {...S} strokeWidth={strokeWidth} />
      <path d="M15.5 7.5H21v5.5" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}

export function ReceiptIcon({ size = 24, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        d="M5.5 21V4.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1V21l-2.6-1.6-2.4 1.6-2.4-1.6L8.1 21 5.5 19.4Z"
        {...S}
        strokeWidth={strokeWidth}
      />
      <path d="M9 8.5h6M9 12.5h4" {...S} strokeWidth={strokeWidth} />
    </svg>
  )
}
