import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: '연금 자산 포트폴리오 대시보드',
  description: '증권사 거래 내역과 구글 시트를 실시간 연동하는 스마트 자산 관리 대시보드',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="app-container">
          <Header />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
