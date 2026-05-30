'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SummaryData {
  purchaseAmount: number;
  evalAmount: number;
  profitLoss: number;
  yieldPct: number;
  principal: number;
  yieldOnPrincipalPct: number;
}

interface AccountSummary {
  account: string;
  purchaseAmount: number;
  evalAmount: number;
  profitLoss: number;
  yieldPct: number;
  principal: number;
  yieldOnPrincipalPct: number;
}

interface Asset {
  account: string;
  symbol: string;
  name: string;
  category: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  purchaseAmount: number;
  evalAmount: number;
  profitLoss: number;
  yieldPct: number;
}

interface Allocation {
  category: string;
  amount: number;
  ratio: number;
  targetRatio: number;
  targetAmount: number;
  requiredAmount: number;
}

interface CategoryAlloc {
  '주식': number;
  '채권': number;
  '금(Gold)': number;
  '현금성 자산': number;
  '합계': number;
}

interface DividendSummary {
  year: number;
  month: number;
  amount180: number;
  amount660: number;
  amountIrp: number;
  total: number;
}

interface DividendDetail {
  date: string;
  account: string;
  symbol: string;
  name: string;
  amount: number;
}

interface DashboardResponse {
  isConnected: boolean;
  error?: string;
  summary: SummaryData;
  accounts: AccountSummary[];
  assets: Asset[];
  allocations: Record<string, Allocation[]>;
  categoryAllocations: Record<string, CategoryAlloc>;
  dividends: {
    summary: DividendSummary[];
    details: DividendDetail[];
  };
}

interface DonutSegment {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  totalLabel: string;
  totalValue: string;
  segments: DonutSegment[];
  isPercentageOnly?: boolean;
}

// Interactive SVG Donut Chart Component
function DonutChart({ title, totalLabel, totalValue, segments, isPercentageOnly = false }: DonutChartProps) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius; // ~314.16

  // Clean segments with positive value/percentage
  const validSegments = segments.filter(s => s.percentage > 0);
  const totalPercentage = validSegments.reduce((sum, s) => sum + s.percentage, 0);

  // If sum of percentages is 0 (or empty), show a fallback gray circle
  const isEmpty = totalPercentage <= 0;

  let cumulativePercent = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)', width: '100%' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '0.25rem' }}>{title}</h3>
      
      <div className="donut-svg-wrapper">
        <svg viewBox="0 0 120 120" className="donut-svg" width="100%" height="100%">
          {/* Base circle background */}
          <circle cx="60" cy="60" r={radius} fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
          
          {isEmpty ? (
            <circle cx="60" cy="60" r={radius} fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
          ) : (
            validSegments.map((seg, idx) => {
              // Normalize percentage to sum to 100% for drawing if the total exceeds or is below slightly due to rounding
              const normPct = (seg.percentage / totalPercentage) * 100;
              const strokeLength = (circumference * normPct) / 100;
              const strokeOffset = circumference - (circumference * cumulativePercent) / 100;
              cumulativePercent += normPct;
              
              return (
                <circle
                  key={idx}
                  className="donut-segment"
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="10"
                  strokeDasharray={`${strokeLength} ${circumference}`}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                />
              );
            })
          )}
        </svg>
        <div className="donut-center-text" style={{ width: '120px' }}>
          <span className="donut-center-label">{totalLabel}</span>
          <span className="donut-center-value" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{totalValue}</span>
        </div>
      </div>

      <div className="donut-legend" style={{ gap: '0.4rem', marginTop: '0.5rem' }}>
        {segments.map((seg, idx) => {
          return (
            <div key={idx} className="donut-legend-item" style={{ fontSize: '0.8rem', padding: '0.15rem 0' }}>
              <span className="donut-legend-label">
                <span className="donut-legend-dot" style={{ backgroundColor: seg.color }}></span>
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{seg.name}</span>
              </span>
              <span className="donut-legend-amount" style={{ fontSize: '0.8rem' }}>
                {isPercentageOnly || seg.value === 0 ? '' : `₩${Math.round(seg.value).toLocaleString()}`}
                <span className="donut-legend-pct" style={{ marginLeft: isPercentageOnly || seg.value === 0 ? '0' : '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {seg.percentage.toFixed(1)}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Monthly Distributions Bar Chart Component
function DividendBarChart({ summary }: { summary: DividendSummary[] }) {
  if (!summary || summary.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', color: 'var(--text-secondary)' }}>
        수령한 분배금(배당금) 내역이 없습니다.
      </div>
    );
  }

  // Find max value for scaling
  const maxVal = Math.max(...summary.map(s => s.total), 1);
  const height = 140;
  const width = 500;
  const barWidth = 20;
  const gap = 14;
  const totalWidth = summary.length * (barWidth + gap) - gap;

  return (
    <div className="bar-chart-wrapper" style={{ height: '240px' }}>
      <div style={{ overflowX: 'auto', width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${Math.max(width, totalWidth + 50)} 200`} className="bar-svg">
          {/* Y-axis helper lines */}
          <line x1="30" y1="20" x2={Math.max(width, totalWidth + 50)} y2="20" stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
          <line x1="30" y1="80" x2={Math.max(width, totalWidth + 50)} y2="80" stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
          <line x1="30" y1="140" x2={Math.max(width, totalWidth + 50)} y2="140" stroke="rgba(255,255,255,0.05)" />

          {summary.map((s, idx) => {
            const barHeight = (s.total / maxVal) * height;
            const x = 40 + idx * (barWidth + gap);
            const y = 140 - barHeight;

            return (
              <g key={idx}>
                {/* Bar rectangle */}
                <rect
                  className="bar-rect"
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx="3"
                  ry="3"
                  fill="url(#barGradient)"
                />
                {/* X-axis labels (Month) */}
                <text
                  x={x + barWidth / 2}
                  y="160"
                  fill="var(--text-secondary)"
                  fontSize="9"
                  textAnchor="middle"
                  fontFamily="var(--font-primary)"
                >
                  {s.month}월
                </text>
                {/* Year label boundary */}
                {(idx === 0 || summary[idx - 1].year !== s.year) && (
                  <text
                    x={x + barWidth / 2}
                    y="175"
                    fill="var(--color-primary)"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="var(--font-primary)"
                  >
                    '{String(s.year).slice(2)}
                  </text>
                )}
                {/* Value text above bar */}
                {s.total > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 5}
                    fill="var(--text-primary)"
                    fontSize="8"
                    fontWeight="600"
                    textAnchor="middle"
                    fontFamily="var(--font-primary)"
                  >
                    {s.total >= 10000 ? `${(s.total / 10000).toFixed(1)}만` : `${Math.round(s.total / 1000)}천`}
                  </text>
                )}
              </g>
            );
          })}

          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [selectedChartAcc, setSelectedChartAcc] = useState<'전체' | '180개인연금저축' | '660개인연금저축' | '828개인IRP'>('전체');

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        console.error('Failed to fetch dashboard data.');
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRecalculate = async () => {
    if (!confirm('구글 시트의 전체 수식, 포트폴리오 요약 테이블 및 월별 분배금 시트를 다시 계산하시겠습니까? (이 작업은 약 5~10초 소요됩니다)')) return;
    setIsRecalculating(true);
    try {
      const res = await fetch('/api/recalculate', { method: 'POST' });
      if (res.ok) {
        alert('구글 시트 재계산 및 테이블 업데이트가 완료되었습니다!');
        fetchDashboardData();
      } else {
        const errData = await res.json();
        alert(`재계산 실패: ${errData.error}`);
      }
    } catch {
      alert('재계산 중 통신 오류가 발생했습니다.');
    } finally {
      setIsRecalculating(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>구글 시트에서 포트폴리오 데이터를 실시간으로 동기화하는 중...</p>
      </div>
    );
  }

  if (!data || !data.isConnected) {
    return (
      <div style={{ maxWidth: '600px', margin: '6rem auto', textAlign: 'center' }} className="glass-panel">
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⛓️</div>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>구글 시트 미연동</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '2rem' }}>
          대시보드를 작동시키기 위해서는 구글 시트의 앱스 스크립트(Apps Script) 웹 앱 연동 주소가 등록되어 있어야 합니다.
          설정 페이지로 이동하여 본인의 구글 시트에 스크립트를 저장하고 배포된 URL을 등록해 주세요.
        </p>
        <Link href="/settings" className="btn btn-primary" style={{ padding: '0.8rem 2.5rem' }}>
          ⚙️ 연동 설정 페이지로 이동하기
        </Link>
      </div>
    );
  }

  const { summary, accounts, assets, allocations, dividends } = data;

  // Calculate total dividends received
  const totalDividends = dividends.details.reduce((sum, d) => sum + d.amount, 0);

  const currentAllocations = allocations[selectedChartAcc] || [];

  // 1. Actual Segments
  const actualTotal = currentAllocations.reduce((sum, a) => sum + a.amount, 0);
  const actualSegments: DonutSegment[] = currentAllocations.map(a => {
    let color = '#10b981'; // 현금
    if (a.category === '주식') color = '#2563eb';
    else if (a.category === '채권') color = '#8b5cf6';
    else if (a.category === '금(Gold)') color = '#eab308';
    return {
      name: a.category,
      value: a.amount,
      percentage: a.ratio,
      color,
    };
  });
  const actualTotalValueText = actualTotal >= 10000 ? `₩${Math.round(actualTotal / 10000).toLocaleString()}만` : `₩${Math.round(actualTotal).toLocaleString()}`;

  // 2. Target Segments
  const targetSegments: DonutSegment[] = currentAllocations.map(a => {
    let color = '#10b981';
    if (a.category === '주식') color = '#2563eb';
    else if (a.category === '채권') color = '#8b5cf6';
    else if (a.category === '금(Gold)') color = '#eab308';
    return {
      name: a.category,
      value: a.targetAmount,
      percentage: a.targetRatio,
      color,
    };
  });
  const targetTotal = targetSegments.reduce((sum, s) => sum + s.value, 0);
  const targetTotalValueText = targetTotal >= 10000 ? `₩${Math.round(targetTotal / 10000).toLocaleString()}만` : `₩${Math.round(targetTotal).toLocaleString()}`;

  // 3. Rebalancing Purchases Segments (requiredAmount > 0)
  const buyAllocations = currentAllocations.filter(a => a.requiredAmount > 0);
  const totalBuyAmount = buyAllocations.reduce((sum, a) => sum + a.requiredAmount, 0);
  const rebalanceSegments: DonutSegment[] = currentAllocations.map(a => {
    let color = '#10b981';
    if (a.category === '주식') color = '#2563eb';
    else if (a.category === '채권') color = '#8b5cf6';
    else if (a.category === '금(Gold)') color = '#eab308';
    
    const val = a.requiredAmount > 0 ? a.requiredAmount : 0;
    const pct = totalBuyAmount > 0 ? (val / totalBuyAmount) * 100 : 0;
    
    return {
      name: a.category,
      value: val,
      percentage: pct,
      color,
    };
  });
  const rebalanceTotalValueText = totalBuyAmount >= 10000 ? `₩${Math.round(totalBuyAmount / 10000).toLocaleString()}만` : `₩${Math.round(totalBuyAmount).toLocaleString()}`;

  const selectedAccShortName = selectedChartAcc === '전체' ? '전체' : selectedChartAcc.replace('개인연금저축', '').replace('개인', '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>종합 포트폴리오 현황</h1>
          <p style={{ color: 'var(--text-secondary)' }}>구글 파이낸스 실시간 주가가 연동된 자산 분배 및 수익률 대시보드</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleRecalculate} className="btn btn-secondary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.875rem' }} disabled={isRecalculating}>
            {isRecalculating ? <div className="spinner" style={{ width: '16px', height: '16px' }}></div> : '⚡ 구글시트 전체 재계산'}
          </button>
          <button onClick={fetchDashboardData} className="btn btn-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.875rem' }}>
            🔄 화면 새로고침
          </button>
        </div>
      </div>

      {/* 1. Global Summary Cards (Glow Cards) */}
      <div className="summary-grid">
        <div className="glass-panel glow-card-blue summary-card">
          <span className="summary-label">총 평가 자산 (실시간 반영)</span>
          <span className="summary-value">₩{summary.evalAmount.toLocaleString()}</span>
          <div className="summary-change">
            <span style={{ color: 'var(--text-secondary)' }}>투자 원금 대비</span>
            <span className={summary.yieldOnPrincipalPct >= 0 ? 'change-up' : 'change-down'}>
              {summary.yieldOnPrincipalPct >= 0 ? '▲' : '▼'} {Math.abs(summary.yieldOnPrincipalPct).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="glass-panel glow-card-purple summary-card">
          <span className="summary-label">총 납입 원금</span>
          <span className="summary-value">₩{summary.principal.toLocaleString()}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>거래내역 누적 입금액 합계</span>
        </div>

        <div className="glass-panel summary-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
          <span className="summary-label">누적 평가 손익</span>
          <span className="summary-value" style={{ color: summary.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {summary.profitLoss >= 0 ? '+' : ''}₩{summary.profitLoss.toLocaleString()}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>평균 매입금액 대비 평가 손익</span>
        </div>

        <div className="glass-panel summary-card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <span className="summary-label">포트폴리오 전체 수익률</span>
          <span className="summary-value" style={{ color: summary.yieldPct >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {summary.yieldPct >= 0 ? '+' : ''}{summary.yieldPct.toFixed(2)}%
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>매입금액 대비 평단 수익률</span>
        </div>
      </div>

      {/* 2. Account Breakdown Grid */}
      <div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>계좌별 자산 현황</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {accounts.map((acc, idx) => (
            <div key={idx} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{acc.account}</span>
                <span className={`badge ${
                  acc.account.includes('180') ? 'badge-blue' : acc.account.includes('660') ? 'badge-purple' : 'badge-green'
                }`}>
                  {acc.account.includes('IRP') ? '퇴직연금' : '개인연금'}
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>평가금액</p>
                  <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>₩{acc.evalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>납입원금</p>
                  <p style={{ fontWeight: 600 }}>₩{acc.principal.toLocaleString()}</p>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>평가손익</p>
                  <p style={{ fontWeight: 700, color: acc.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {acc.profitLoss >= 0 ? '+' : ''}₩{acc.profitLoss.toLocaleString()}
                  </p>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>원금수익률</p>
                  <p style={{ fontWeight: 700, color: acc.yieldOnPrincipalPct >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {acc.yieldOnPrincipalPct >= 0 ? '+' : ''}{acc.yieldOnPrincipalPct.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Asset Allocation Mix & Rebalancing Grid */}
      <div className="dashboard-grid">
        
        {/* Left Column: Asset Allocation Pie Charts (Category Mixes) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>📊 포트폴리오 자산 배분 비중 ({selectedAccShortName})</h2>
            
            {/* Account Selector Tabs */}
            <div className="chart-tabs">
              {(['전체', '180개인연금저축', '660개인연금저축', '828개인IRP'] as const).map((acc) => (
                <button
                  key={acc}
                  className={`chart-tab ${selectedChartAcc === acc ? 'active' : ''}`}
                  onClick={() => setSelectedChartAcc(acc)}
                >
                  {acc === '전체' ? '전체' : acc.replace('개인연금저축', '').replace('개인', '')}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', width: '100%', marginTop: '0.5rem' }}>
            <DonutChart
              title="실제 자산 배분 현황"
              totalLabel="평가 금액"
              totalValue={actualTotalValueText}
              segments={actualSegments}
            />
            <DonutChart
              title="목표 자산 배분 현황"
              totalLabel="목표 금액"
              totalValue={targetTotalValueText}
              segments={targetSegments}
            />
            <DonutChart
              title="조정(매수) 필요 비중"
              totalLabel="매수 필요 금액"
              totalValue={rebalanceTotalValueText}
              segments={rebalanceSegments}
            />
          </div>
        </div>

        {/* Right Column: Rebalancing Guide Widget */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            ⚖️ 자산 리밸런싱 가이드 ({selectedAccShortName} 기준)
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            설정해 두신 목표 자산 배분 비중에 도달하기 위해 거래(매수/매도)해야 할 필요 자산 규모입니다.
          </p>

          <div className="rebalance-list">
            {currentAllocations.map((alloc, idx) => {
              const isBuy = alloc.requiredAmount > 0;
              const isNeutral = Math.abs(alloc.requiredAmount) < 1000;
              
              if (isNeutral) {
                return (
                  <div key={idx} className="rebalance-item" style={{ borderLeftColor: 'var(--text-muted)' }}>
                    <div className="rebalance-asset">
                      <span className="rebalance-name">{alloc.category}</span>
                      <span className="rebalance-action">비중 적정 (조정 불필요)</span>
                    </div>
                    <span className="rebalance-value" style={{ color: 'var(--text-muted)' }}>₩0</span>
                  </div>
                );
              }

              return (
                <div key={idx} className={`rebalance-item ${isBuy ? 'buy' : 'sell'}`}>
                  <div className="rebalance-asset">
                    <span className="rebalance-name">{alloc.category}</span>
                    <span className="rebalance-action" style={{ color: isBuy ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {isBuy ? '➕ 추가 매수 필요' : '➖ 비중 축소 (매도 필요)'}
                    </span>
                  </div>
                  <span className="rebalance-value" style={{ color: isBuy ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {isBuy ? '+' : '-'}₩{Math.abs(alloc.requiredAmount).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Target vs Actual Bar Gauges Card */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          자산 배분 현황 (실제 비율 vs 목표 비율 - {selectedAccShortName} 기준)
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {currentAllocations.map((alloc, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem' }}>
                <span style={{ fontWeight: 600 }}>{alloc.category}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  실제 <strong>{alloc.ratio.toFixed(1)}%</strong> / 목표 <strong>{alloc.targetRatio.toFixed(1)}%</strong>
                </span>
              </div>

              {/* Custom Dual Bar Gauge */}
              <div style={{ height: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', position: 'relative', border: '1px solid var(--border-color)', overflow: 'hidden', margin: '0.25rem 0' }}>
                {/* Current Ratio Bar */}
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(alloc.ratio, 100)}%`,
                    background: 'linear-gradient(90deg, #1d4ed8 0%, var(--color-primary) 100%)',
                    borderRadius: '7px',
                    transition: 'width 0.8s ease-out',
                    boxShadow: '0 0 8px rgba(0, 210, 255, 0.3)',
                  }}
                ></div>
                
                {/* Target Marker */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${Math.min(alloc.targetRatio, 100)}%`,
                    width: '3px',
                    background: 'var(--color-secondary)',
                    boxShadow: '0 0 6px #9d4edd',
                    zIndex: 10,
                  }}
                  title={`목표 비중: ${alloc.targetRatio}%`}
                ></div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>평가액: ₩{alloc.amount.toLocaleString()}</span>
                <span>목표액: ₩{alloc.targetAmount.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Monthly Distributions & Dividends Section */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>💵 월별 분배금 및 배당금 현황</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              거래내역에서 추출된 ETF 분배금 및 배당금 입금 통계
            </p>
          </div>
          <span className="badge badge-green" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
            누적 수령액: ₩{totalDividends.toLocaleString()}
          </span>
        </div>

        <div className="dashboard-grid">
          {/* Left Column: Bar Chart */}
          <div>
            <DividendBarChart summary={dividends.summary} />
          </div>

          {/* Right Column: Detailed Dividends Log */}
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
              최근 분배금 입금 내역
            </h3>
            <div className="scroll-panel">
              <table className="premium-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>계좌</th>
                    <th>종목명</th>
                    <th style={{ textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {dividends.details.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        기록된 입금 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    dividends.details.map((div, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-secondary)' }}>{div.date}</td>
                        <td>
                          <span className={`badge ${
                            div.account.includes('180') ? 'badge-blue' : div.account.includes('660') ? 'badge-purple' : 'badge-green'
                          }`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                            {div.account.replace('개인연금저축', '').replace('개인', '')}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={div.name}>
                          {div.name}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>
                          +₩{div.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Complete Holdings Table */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          📑 포트폴리오 보유 종목 전체 명세
        </h2>
        
        <div className="table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>계좌 구분</th>
                <th>종목코드</th>
                <th>보유 종목명</th>
                <th>자산 분류</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'right' }}>평균단가</th>
                <th style={{ textAlign: 'right' }}>현재가 (실시간)</th>
                <th style={{ textAlign: 'right' }}>매입 금액</th>
                <th style={{ textAlign: 'right' }}>평가 금액</th>
                <th style={{ textAlign: 'right' }}>평가 손익</th>
                <th style={{ textAlign: 'right' }}>수익률</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, idx) => (
                <tr key={idx}>
                  <td>
                    <span className={`badge ${
                      asset.account.includes('180') ? 'badge-blue' : asset.account.includes('660') ? 'badge-purple' : 'badge-green'
                    }`} style={{ fontSize: '0.75rem' }}>
                      {asset.account}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{asset.symbol || '-'}</td>
                  <td style={{ fontWeight: 600 }}>{asset.name}</td>
                  <td>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {asset.category || '-'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{asset.quantity.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{asset.avgPrice > 0 ? (asset.avgPrice > 1000 ? `₩${asset.avgPrice.toLocaleString()}` : asset.avgPrice.toLocaleString()) : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>{asset.currentPrice > 0 ? (asset.currentPrice > 1000 ? `₩${asset.currentPrice.toLocaleString()}` : asset.currentPrice.toLocaleString()) : '-'}</td>
                  <td style={{ textAlign: 'right' }}>₩{asset.purchaseAmount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₩{asset.evalAmount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: asset.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {asset.profitLoss >= 0 ? '+' : ''}₩{asset.profitLoss.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: asset.yieldPct >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {asset.yieldPct >= 0 ? '+' : ''}{asset.yieldPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
