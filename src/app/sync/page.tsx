'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

interface UploadedFile {
  file: File;
  matchedSheet: string;
  isValid: boolean;
}

interface SyncResult {
  filename: string;
  sheetName: string;
  allCount: number;
  newCount: number;
  newTransactions: Array<{
    date: string;
    type: string;
    symbol: string;
    name: string;
    amount: number;
    seq: number;
    price: number | null;
    quantity: number | null;
  }>;
  success: boolean;
  error?: string;
}

export default function SyncPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMatchedSheet = (filename: string): { name: string; isValid: boolean } => {
    if (filename.includes('180')) {
      return { name: '180개인연금저축', isValid: true };
    }
    if (filename.includes('660')) {
      return { name: '660개인연금저축', isValid: true };
    }
    if (filename.includes('828')) {
      return { name: '828개인IRP', isValid: true };
    }
    return { name: '알 수 없음 (파일명에 180, 660, 828 누락)', isValid: false };
  };

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setErrorMessage(null);
    setResults(null);

    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file.name.endsWith('.csv')) {
        setErrorMessage('오직 미래에셋 HTS에서 다운로드한 .csv 형식의 파일만 업로드할 수 있습니다.');
        continue;
      }

      // Check if file already added
      if (files.some(f => f.file.name === file.name)) continue;

      const match = getMatchedSheet(file.name);
      newFiles.push({
        file,
        matchedSheet: match.name,
        isValid: match.isValid,
      });
    }

    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (files.length <= 1) {
      setResults(null);
    }
  };

  const handleClearAll = () => {
    setFiles([]);
    setResults(null);
    setErrorMessage(null);
  };

  const handleSyncSubmit = async () => {
    if (files.length === 0) return;
    const invalidFiles = files.filter(f => !f.isValid);
    if (invalidFiles.length > 0) {
      setErrorMessage("파일명 계좌 매칭이 '알 수 없음'인 파일은 업로드할 수 없습니다.");
      return;
    }

    setIsSyncing(true);
    setErrorMessage(null);
    setResults(null);

    const formData = new FormData();
    files.forEach(f => {
      formData.append('files', f.file);
    });

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
        // Clear files queue upon success
        setFiles([]);
      } else {
        setErrorMessage(data.error || '동기화 통신 에러가 발생했습니다.');
      }
    } catch {
      setErrorMessage('동기화 처리 중 서버 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '2rem' }}>거래 내역 동기화</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        미래에셋증권에서 받은 개인연금 및 IRP 거래 내역 CSV 파일을 업로드하여 구글 시트에 일자별로 중복 없이 누적합니다.
      </p>

      {errorMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger)',
            color: varColorDanger(),
            fontWeight: 500,
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start', marginBottom: '2rem' }}>
        {/* Upload Zone */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            CSV 거래내역 업로드
          </h2>
          
          <div
            className={`upload-zone ${isDragging ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv"
              multiple
              onChange={(e) => handleFileChange(e.target.files)}
            />
            <div className="upload-icon">📥</div>
            <div>
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>마우스로 파일을 끌어서 놓으세요</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>또는 컴퓨터에서 파일 선택하기</p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              * 지원 규격: 180개인연금저축.csv / 660개인연금저축.csv / 828개인IRP.csv
            </span>
          </div>
        </div>

        {/* Selected Files Queue */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>업로드 대기열 ({files.length})</h2>
            {files.length > 0 && (
              <button onClick={handleClearAll} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                전체 삭제
              </button>
            )}
          </div>

          {files.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              선택된 거래내역 파일이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto' }}>
                {files.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{item.file.name}</span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>매칭 대상:</span>
                        <span className={`badge ${item.isValid ? 'badge-blue' : 'badge-danger'}`}>
                          {item.matchedSheet}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSyncSubmit}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 'auto', gap: '0.75rem' }}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <div className="spinner"></div>
                    <span>구글 시트 동기화 중...</span>
                  </>
                ) : (
                  <>
                    <span>🔄 구글 시트 동기화 시작</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sync Results Display */}
      {results && (
        <div className="glass-panel" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            📊 동기화 실행 결과 보고서
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {results.map((res, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.01)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  padding: '1.5rem',
                }}
              >
                {/* Result header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{res.filename}</h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      시트명: <strong>{res.sheetName}</strong>
                    </span>
                  </div>

                  <div>
                    {res.success ? (
                      res.newCount > 0 ? (
                        <span className="badge badge-green" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
                          동기화 성공 (+{res.newCount}건 누적)
                        </span>
                      ) : (
                        <span className="badge badge-blue" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
                          누적 완료 (새로운 거래 없음)
                        </span>
                      )
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                        실패
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                {!res.success ? (
                  <p style={{ color: 'var(--color-danger)', fontSize: '0.95rem' }}>❌ 에러 내용: {res.error}</p>
                ) : res.newCount === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    구글 시트에 이미 해당 파일의 최신 거래내역이 완전히 입력되어 있습니다. 겹치는 부분을 건너뛰었습니다.
                  </p>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      미래에셋 파일의 {res.allCount}건 중 <strong>{res.newCount}건</strong>의 거래가 새로 감지되어 구글 시트 하단에 중복 없이 성공적으로 누적되었고, 상단 집계 수식 범위가 자동 연장되었습니다.
                    </p>
                    
                    <div className="table-container">
                      <table className="premium-table">
                        <thead>
                          <tr>
                            <th>거래일자</th>
                            <th>거래번호</th>
                            <th>거래종류</th>
                            <th>종목번호</th>
                            <th>종목명 (또는 내용)</th>
                            <th style={{ textAlign: 'right' }}>수량</th>
                            <th style={{ textAlign: 'right' }}>단가</th>
                            <th style={{ textAlign: 'right' }}>거래금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {res.newTransactions.map((tx, tIdx) => (
                            <tr key={tIdx}>
                              <td>{tx.date}</td>
                              <td>{tx.seq}</td>
                              <td>
                                <span className={`badge ${
                                  tx.type.includes('매수') ? 'badge-danger' : tx.type.includes('매도') || tx.type.includes('입금') || tx.type.includes('분배금') ? 'badge-green' : 'badge-blue'
                                }`}
                                style={{
                                  background: tx.type.includes('매수') ? 'var(--color-danger-bg)' : tx.type.includes('매도') || tx.type.includes('입금') || tx.type.includes('분배금') ? 'var(--color-success-bg)' : '',
                                  color: tx.type.includes('매수') ? 'var(--color-danger)' : tx.type.includes('매도') || tx.type.includes('입금') || tx.type.includes('분배금') ? 'var(--color-success)' : ''
                                }}>
                                  {tx.type}
                                </span>
                              </td>
                              <td>{tx.symbol || '-'}</td>
                              <td>{tx.name || '-'}</td>
                              <td style={{ textAlign: 'right' }}>{tx.quantity !== null ? tx.quantity.toLocaleString() : '-'}</td>
                              <td style={{ textAlign: 'right' }}>{tx.price !== null ? `₩${tx.price.toLocaleString()}` : '-'}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {tx.amount > 0 ? `₩${tx.amount.toLocaleString()}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <Link href="/" className="btn btn-primary" style={{ padding: '0.8rem 2.5rem' }}>
              📊 업데이트된 대시보드 홈으로 가기
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  function varColorDanger() {
    return 'var(--color-danger)';
  }
}
