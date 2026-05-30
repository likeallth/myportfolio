'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="navbar">
      <Link href="/" className="nav-logo">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--color-primary)', filter: 'drop-shadow(0 0 8px rgba(0, 210, 255, 0.5))' }}
        >
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <span>PENSION PORTFOLIO</span>
      </Link>

      <nav className="nav-links">
        <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
          포트폴리오 대시보드
        </Link>
        <Link href="/sync" className={`nav-item ${pathname === '/sync' ? 'active' : ''}`}>
          거래 내역 동기화
        </Link>
        <Link href="/settings" className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}>
          연동 설정
        </Link>
      </nav>
    </header>
  );
}
