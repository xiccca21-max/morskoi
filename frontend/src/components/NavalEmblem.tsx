/** Геральдический герб «Морского Боя»: щит, якорь, золотая рамка.
 *  Вынесен в отдельный компонент, чтобы переиспользовать в шапке и на splash. */
export function NavalEmblem({ size = 32 }: { size?: number }) {
  const h = (size / 32) * 36;
  return (
    <svg width={size} height={h} viewBox="0 0 32 36" fill="none" aria-hidden>
      {/* Щит */}
      <path
        d="M16 1 L31 6.5 L31 20.5 C31 28.5 23.5 33 16 35.5 C8.5 33 1 28.5 1 20.5 L1 6.5 Z"
        fill="url(#emblemRed)"
      />
      {/* Золотая рамка */}
      <path
        d="M16 1 L31 6.5 L31 20.5 C31 28.5 23.5 33 16 35.5 C8.5 33 1 28.5 1 20.5 L1 6.5 Z"
        fill="none"
        stroke="rgba(212,168,44,0.80)"
        strokeWidth="1.4"
      />
      {/* Внутренняя рамка */}
      <path
        d="M16 3.5 L28.5 8 L28.5 20.5 C28.5 27 22.5 31 16 33 C9.5 31 3.5 27 3.5 20.5 L3.5 8 Z"
        fill="none"
        stroke="rgba(212,168,44,0.22)"
        strokeWidth="0.8"
      />
      {/* Якорь — кольцо */}
      <circle cx="16" cy="10.5" r="2.2" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Якорь — поперечина */}
      <line x1="11" y1="13.5" x2="21" y2="13.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      {/* Якорь — шток */}
      <line x1="16" y1="13.5" x2="16" y2="27.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      {/* Якорь — левая лапа */}
      <path d="M16 27.5 Q12 27.5 11 23.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      {/* Якорь — правая лапа */}
      <path d="M16 27.5 Q20 27.5 21 23.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      {/* Звёздочки по бокам якоря */}
      <circle cx="10" cy="20" r="0.9" fill="rgba(212,168,44,0.7)" />
      <circle cx="22" cy="20" r="0.9" fill="rgba(212,168,44,0.7)" />
      <defs>
        <linearGradient id="emblemRed" x1="1" y1="1" x2="31" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d82020" />
          <stop offset="55%" stopColor="#b01616" />
          <stop offset="100%" stopColor="#880e0e" />
        </linearGradient>
      </defs>
    </svg>
  );
}
