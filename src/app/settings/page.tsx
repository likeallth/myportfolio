'use client';

import { useState, useEffect, Suspense } from 'react';

function SettingsContent() {
  const [gasUrl, setGasUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [targetStock, setTargetStock] = useState(60);
  const [targetBond, setTargetBond] = useState(20);
  const [targetGold, setTargetGold] = useState(10);
  const [targetCash, setTargetCash] = useState(10);
  const [isSavingRatio, setIsSavingRatio] = useState(false);



  // Apps Script code to display for copying
  const appsScriptCode = `function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = e.parameter.sheetName;
    
    // 특정 시트의 거래내역 전체 조회 (동기화 중복 체크용)
    if (sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      var rows = sheet ? sheet.getDataRange().getValues() : [];
      return ContentService.createTextOutput(JSON.stringify({ success: true, values: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 대시보드 메인 데이터 조회 시, 추가 시트가 없다면 자동 초기화 및 업데이트 수행
    var balanceSheet = ss.getSheetByName("종합잔고조회");
    var balanceData = balanceSheet ? balanceSheet.getDataRange().getValues() : [];
    
    var portfolioSheet = ss.getSheetByName("연금투자_portfolio");
    var portfolioData = portfolioSheet ? portfolioSheet.getRange("B1:G10").getValues() : [];
    
    var dashSheet = ss.getSheetByName("portfolio_dashbord");
    var divSheet = ss.getSheetByName("월별분배금");
    if (!dashSheet || !divSheet) {
      updateDashboardAndDividends(ss);
    }
    
    // 다시 로드하여 전달
    dashSheet = ss.getSheetByName("portfolio_dashbord");
    divSheet = ss.getSheetByName("월별분배금");
    
    var dividendSummaryData = divSheet ? divSheet.getRange("A1:F100").getValues() : [];
    var dividendsDetailData = divSheet ? divSheet.getRange("H1:L200").getValues() : [];
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      balanceData: balanceData,
      portfolioData: portfolioData,
      dividendSummaryData: dividendSummaryData,
      dividendsDetailData: dividendsDetailData
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === 'sync') {
      var sheetName = payload.sheetName;
      var rowsToAppend = payload.rows;
      
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        throw new Error("시트를 찾을 수 없습니다: " + sheetName);
      }
      
      // 1. 행 업데이트 (기존 중복 데이터 수정)
      var rowsToUpdate = payload.updates;
      if (rowsToUpdate && rowsToUpdate.length > 0) {
        for (var uIdx = 0; uIdx < rowsToUpdate.length; uIdx++) {
          var update = rowsToUpdate[uIdx];
          var rowIndex = update.rowIndex;
          var values = update.values;
          sheet.getRange(rowIndex, 2, 1, values.length).setValues([values]);
        }
      }
      
      // 2. 행 추가
      if (rowsToAppend && rowsToAppend.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.insertRowsAfter(lastRow, rowsToAppend.length);
        
        var startRow = lastRow + 1;
        var numRows = rowsToAppend.length;
        var numCols = rowsToAppend[0].length;
        
        var range = sheet.getRange(startRow, 1, numRows, numCols);
        range.setValues(rowsToAppend);
      }
      
      var newMaxRow = sheet.getLastRow();
      
      // 2. K2:O2 영역의 집계 수식 범위 자동 확장
      var formulaRange = sheet.getRange("K2:O2");
      var formulas = formulaRange.getFormulas()[0];
      
      var updatedFormulas = formulas.map(function(formula) {
        if (formula && formula.startsWith('=')) {
          var updated = formula.replace(/([A-Za-z]+4:[A-Za-z]+)[0-9]+/gi, function(match, prefix) {
            var oldLimitMatch = match.match(/[0-9]+$/);
            var oldLimit = oldLimitMatch ? parseInt(oldLimitMatch[0]) : 0;
            if (newMaxRow > oldLimit) {
              return prefix + newMaxRow;
            }
            return match;
          });
          return updated;
        }
        return formula;
      });
      
      formulaRange.setFormulas([updatedFormulas]);
      
      // 3. 거래 내역 동기화 후, 대시보드와 분배금 현황 자동 업데이트 실행!
      updateDashboardAndDividends(ss);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        newMaxRow: newMaxRow
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 수동 재계산 액션 지원
    if (action === 'recalculate') {
      updateDashboardAndDividends(ss);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "잘못된 액션 요청입니다." }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ----------------------------------------------------
// 통합 업데이트 실행
// ----------------------------------------------------
function updateDashboardAndDividends(ss) {
  updateBalanceSheetFormulas(ss);
  updateDashboardSheet(ss);
  updateMonthlyDividendsSheet(ss);
}

function ensureSheetExists(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// 종합잔고조회 시트에 구글 파이낸스 실시간 수식 입력
function updateBalanceSheetFormulas(ss) {
  var sheet = ss.getSheetByName("종합잔고조회");
  if (!sheet) return;
  
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(1, 1, lastRow, 14);
  var values = range.getValues();
  
  // 계좌 total 금액 행 검색
  var totalRowIdx = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][6]).trim() === "계좌 total 금액") {
      totalRowIdx = i + 1; // 1-based row index
      break;
    }
  }
  
  if (totalRowIdx === -1) return;
  
  // 1. 개별 종목 행 수식 입력 (Row 4부터 totalRowIdx - 2까지)
  for (var r = 4; r <= totalRowIdx - 2; r++) {
    var valA = String(values[r-1][0]).trim(); // Column A
    var valB = String(values[r-1][1]).trim(); // Column B
    
    if (valA === "180" || valA === "660" || valA === "IRP") {
      if (valB.indexOf("A") === 0 && valB.length === 7) {
        // 주식/ETF 종목인 경우 구글파이낸스 실시간 주가 반영
        sheet.getRange(r, 7).setFormula('=IF(ISBLANK(B' + r + '), "", GOOGLEFINANCE("KRX:" & RIGHT(B' + r + ', 6)))');
        sheet.getRange(r, 8).setFormula('=E' + r + '*F' + r);
        sheet.getRange(r, 9).setFormula('=E' + r + '*G' + r);
      } else if (valB && valB !== "nan" && valB.length > 0) {
        // 일반 펀드/MMF인 경우 (MMF는 1000좌 기준이므로 단가를 1000으로 나눔)
        sheet.getRange(r, 8).setFormula('=E' + r + '*F' + r + '/1000');
        sheet.getRange(r, 9).setFormula('=E' + r + '*G' + r + '/1000');
      }
      
      sheet.getRange(r, 10).setFormula('=I' + r + '-H' + r);
      sheet.getRange(r, 11).setFormula('=IF(H' + r + '=0, 0, J' + r + '/H' + r + ')');
    }
  }
  
  // 2. 하단 계좌별 및 전체 합계 영역 수식 설정
  var rTotal = totalRowIdx;
  var r180 = totalRowIdx + 1;
  var r660 = totalRowIdx + 2;
  var rIrp = totalRowIdx + 3;
  
  // 전체 계좌 합계 수식
  sheet.getRange(rTotal, 8).setFormula('=SUM(H' + r180 + ':H' + rIrp + ')');
  sheet.getRange(rTotal, 9).setFormula('=SUM(I' + r180 + ':I' + rIrp + ')');
  sheet.getRange(rTotal, 10).setFormula('=I' + rTotal + '-H' + rTotal);
  sheet.getRange(rTotal, 11).setFormula('=J' + rTotal + '/H' + rTotal);
  sheet.getRange(rTotal, 13).setFormula('=SUM(M' + r180 + ':M' + rIrp + ')');
  sheet.getRange(rTotal, 14).setFormula('=(I' + rTotal + '-M' + rTotal + ')/M' + rTotal);
  
  // 180 계좌 합계 수식
  sheet.getRange(r180, 8).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', 180, H$4:H' + (rTotal - 2) + ')');
  sheet.getRange(r180, 9).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', 180, I$4:I' + (rTotal - 2) + ')');
  sheet.getRange(r180, 10).setFormula('=I' + r180 + '-H' + r180);
  sheet.getRange(r180, 11).setFormula('=J' + r180 + '/H' + r180);
  sheet.getRange(r180, 13).setFormula("='180개인연금저축'!K2");
  sheet.getRange(r180, 14).setFormula('=(I' + r180 + '-M' + r180 + ')/M' + r180);
  
  // 660 계좌 합계 수식
  sheet.getRange(r660, 8).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', 660, H$4:H' + (rTotal - 2) + ')');
  sheet.getRange(r660, 9).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', 660, I$4:I' + (rTotal - 2) + ')');
  sheet.getRange(r660, 10).setFormula('=I' + r660 + '-H' + r660);
  sheet.getRange(r660, 11).setFormula('=J' + r660 + '/H' + r660);
  sheet.getRange(r660, 13).setFormula("='660개인연금저축'!K2");
  sheet.getRange(r660, 14).setFormula('=(I' + r660 + '-M' + r660 + ')/M' + r660);
  
  // IRP 계좌 합계 수식
  sheet.getRange(rIrp, 8).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', "IRP", H$4:H' + (rTotal - 2) + ')');
  sheet.getRange(rIrp, 9).setFormula('=SUMIF(A$4:A' + (rTotal - 2) + ', "IRP", I$4:I' + (rTotal - 2) + ')');
  sheet.getRange(rIrp, 10).setFormula('=I' + rIrp + '-H' + rIrp);
  sheet.getRange(rIrp, 11).setFormula('=J' + rIrp + '/H' + rIrp);
  sheet.getRange(rIrp, 13).setFormula("='828개인IRP'!K2");
  sheet.getRange(rIrp, 14).setFormula('=(I' + rIrp + '-M' + rIrp + ')/M' + rIrp);
}

// portfolio_dashbord 시트 생성 및 갱신 (요약 테이블 + 자산군 비중 테이블 + 차트)
function updateDashboardSheet(ss) {
  var sheet = ensureSheetExists(ss, "portfolio_dashbord");
  sheet.clear();
  
  // 기존 차트 제거
  var charts = sheet.getCharts();
  for (var i = 0; i < charts.length; i++) {
    sheet.removeChart(charts[i]);
  }
  
  // 1. 요약 테이블 작성
  var summaryHeaders = ['계좌 구분', '입금액(원금)', '매입금액', '평가금액', '평가손익', '원금대비 수익률', '매입금대비 수익률'];
  var summaryRows = [
    ['180개인연금저축', "='180개인연금저축'!K2", '=SUMIF(종합잔고조회!$A:$A, 180, 종합잔고조회!$H:$H)', '=SUMIF(종합잔고조회!$A:$A, 180, 종합잔고조회!$I:$I)', "=D2-C2", "=IF(B2=0, 0, (D2-B2)/B2)", "=IF(C2=0, 0, E2/C2)"],
    ['660개인연금저축', "='660개인연금저축'!K2", '=SUMIF(종합잔고조회!$A:$A, 660, 종합잔고조회!$H:$H)', '=SUMIF(종합잔고조회!$A:$A, 660, 종합잔고조회!$I:$I)', "=D3-C3", "=IF(B3=0, 0, (D3-B3)/B3)", "=IF(C3=0, 0, E3/C3)"],
    ['828개인IRP', "='828개인IRP'!K2", '=SUMIF(종합잔고조회!$A:$A, "IRP", 종합잔고조회!$H:$H)', '=SUMIF(종합잔고조회!$A:$A, "IRP", 종합잔고조회!$I:$I)', "=D4-C4", "=IF(B4=0, 0, (D4-B4)/B4)", "=IF(C4=0, 0, E4/C4)"],
    ['전체 합계', "=SUM(B2:B4)", "=SUM(C2:C4)", "=SUM(D2:D4)", "=D5-C5", "=IF(B5=0, 0, (D5-B5)/B5)", "=IF(C5=0, 0, E5/C5)"]
  ];
  
  sheet.getRange(1, 1, 1, 7).setValues([summaryHeaders]).setFontWeight("bold").setBackground("#e2e8f0").setHorizontalAlignment("center");
  sheet.getRange(2, 1, 4, 7).setFormulas(summaryRows);
  sheet.getRange(2, 1, 4, 1).setFontWeight("bold");
  sheet.getRange(5, 1, 1, 7).setFontWeight("bold").setBackground("#f1f5f9");
  sheet.getRange("B2:E5").setNumberFormat("#,##0");
  sheet.getRange("F2:G5").setNumberFormat("0.00%");
  
  // 2. 자산 배분 비중 테이블 작성 (수직 레이아웃)
  var allocHeaders = ['구분', '180개인연금저축', '660개인연금저축', '828개인IRP', '전체 합계'];
  var allocRows = [
    ['주식', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 180, 종합잔고조회!$D:$D, "주식")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 660, 종합잔고조회!$D:$D, "주식")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, "IRP", 종합잔고조회!$D:$D, "주식")', "=SUM(B9:D9)"],
    ['채권', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 180, 종합잔고조회!$D:$D, "채권")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 660, 종합잔고조회!$D:$D, "채권")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, "IRP", 종합잔고조회!$D:$D, "채권")', "=SUM(B10:D10)"],
    ['금(Gold)', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 180, 종합잔고조회!$D:$D, "gold")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 660, 종합잔고조회!$D:$D, "gold")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, "IRP", 종합잔고조회!$D:$D, "gold")', "=SUM(B11:D11)"],
    ['현금성 자산', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 180, 종합잔고조회!$D:$D, "현금")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, 660, 종합잔고조회!$D:$D, "현금")', '=SUMIFS(종합잔고조회!$I:$I, 종합잔고조회!$A:$A, "IRP", 종합잔고조회!$D:$D, "현금")', "=SUM(B12:D12)"],
    ['합계', "=SUM(B9:B12)", "=SUM(C9:C12)", "=SUM(D9:D12)", "=SUM(E9:E12)"]
  ];
  
  sheet.getRange(8, 1, 1, 5).setValues([allocHeaders]).setFontWeight("bold").setBackground("#cbd5e1").setHorizontalAlignment("center");
  sheet.getRange(9, 1, 5, 5).setFormulas(allocRows);
  sheet.getRange(9, 1, 5, 1).setFontWeight("bold");
  sheet.getRange(13, 1, 1, 5).setFontWeight("bold").setBackground("#f1f5f9");
  sheet.getRange("B9:E13").setNumberFormat("#,##0");
  
  // 3. 차트 생성
  // 전체 합계 차트
  var totalChart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange("A9:A12"))
    .addRange(sheet.getRange("E9:E12"))
    .setOption('title', '전체 자산 포트폴리오 비율')
    .setOption('pieHole', 0.4)
    .setPosition(2, 8, 0, 0)
    .build();
  sheet.insertChart(totalChart);
  
  // 180 계좌 차트
  var chart180 = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange("A9:A12"))
    .addRange(sheet.getRange("B9:B12"))
    .setOption('title', '180개인연금저축 비율')
    .setOption('pieHole', 0.4)
    .setPosition(2, 14, 0, 0)
    .build();
  sheet.insertChart(chart180);
  
  // 660 계좌 차트
  var chart660 = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange("A9:A12"))
    .addRange(sheet.getRange("C9:C12"))
    .setOption('title', '660개인연금저축 비율')
    .setOption('pieHole', 0.4)
    .setPosition(16, 8, 0, 0)
    .build();
  sheet.insertChart(chart660);
  
  // IRP 계좌 차트
  var chartIRP = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange("A9:A12"))
    .addRange(sheet.getRange("D9:D12"))
    .setOption('title', '828개인IRP 비율')
    .setOption('pieHole', 0.4)
    .setPosition(16, 14, 0, 0)
    .build();
  sheet.insertChart(chartIRP);
  
  sheet.autoResizeColumns(1, 19);
}

// 월별 분배금(배당금) 시트 구축 (월별 피벗 테이블 + 전체 내역)
function updateMonthlyDividendsSheet(ss) {
  var sheet = ensureSheetExists(ss, "월별분배금");
  sheet.clear();
  
  // 1. 거래 내역에서 분배금 추출
  var dividends = getDividendTransactions(ss);
  
  // 날짜 역순 정렬 (최신 순)
  dividends.sort(function(a, b) {
    return b.date.localeCompare(a.date);
  });
  
  // 2. 우측에 상세 내역 작성 (H열부터)
  var detailHeaders = ['거래일자', '계좌', '종목코드', '종목명', '분배금(배당금)'];
  sheet.getRange(1, 8, 1, 5).setValues([detailHeaders]).setFontWeight("bold").setBackground("#cbd5e1").setHorizontalAlignment("center");
  
  var detailRows = [];
  for (var i = 0; i < dividends.length; i++) {
    var div = dividends[i];
    detailRows.push([div.date, div.account, div.symbol, div.name, div.amount]);
  }
  
  if (detailRows.length > 0) {
    sheet.getRange(2, 8, detailRows.length, 5).setValues(detailRows);
    sheet.getRange(2, 12, detailRows.length, 1).setNumberFormat("#,##0");
  }
  
  // 3. 고유 년-월 추출 (정렬은 시간순 - 오래된 순)
  var ymMappings = {};
  for (var i = 0; i < dividends.length; i++) {
    var div = dividends[i];
    var ymKey = div.year + "-" + div.month;
    ymMappings[ymKey] = { year: parseInt(div.year), month: parseInt(div.month) };
  }
  
  var ymList = [];
  for (var key in ymMappings) {
    ymList.push(ymMappings[key]);
  }
  
  ymList.sort(function(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  
  // 4. 좌측에 월별 요약 테이블 작성 (A~F열)
  var summaryHeaders = ['년도', '월', '180개인연금저축', '660개인연금저축', '828개인IRP', '월별 합계'];
  sheet.getRange(1, 1, 1, 6).setValues([summaryHeaders]).setFontWeight("bold").setBackground("#e2e8f0").setHorizontalAlignment("center");
  
  var summaryRows = [];
  for (var k = 0; k < ymList.length; k++) {
    var item = ymList[k];
    var r = k + 2; // Row index
    
    // SUMIFS 수식 활용하여 동적 집계 연동
    var formula180 = '=SUMIFS($L$2:$L, $I$2:$I, "180개인연금저축", $H$2:$H, ">="&DATE(A' + r + ',B' + r + ',1), $H$2:$H, "<="&EOMONTH(DATE(A' + r + ',B' + r + ',1),0))';
    var formula660 = '=SUMIFS($L$2:$L, $I$2:$I, "660개인연금저축", $H$2:$H, ">="&DATE(A' + r + ',B' + r + ',1), $H$2:$H, "<="&EOMONTH(DATE(A' + r + ',B' + r + ',1),0))';
    var formulaIrp = '=SUMIFS($L$2:$L, $I$2:$I, "828개인IRP", $H$2:$H, ">="&DATE(A' + r + ',B' + r + ',1), $H$2:$H, "<="&EOMONTH(DATE(A' + r + ',B' + r + ',1),0))';
    var formulaTotal = '=SUM(C' + r + ':E' + r + ')';
    
    summaryRows.push([item.year, item.month, formula180, formula660, formulaIrp, formulaTotal]);
  }
  
  if (summaryRows.length > 0) {
    sheet.getRange(2, 1, summaryRows.length, 6).setFormulas(summaryRows);
    sheet.getRange(2, 3, summaryRows.length, 4).setNumberFormat("#,##0");
    sheet.getRange(2, 1, summaryRows.length, 2).setFontWeight("bold").setHorizontalAlignment("center");
  }
  
  sheet.autoResizeColumns(1, 13);
}

// 각 계좌 거래내역 시트에서 분배금 거래 검색 및 가공
function getDividendTransactions(ss) {
  var sheets = ["180개인연금저축", "660개인연금저축", "828개인IRP"];
  var dividends = [];
  
  for (var sIdx = 0; sIdx < sheets.length; sIdx++) {
    var sheetName = sheets[sIdx];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 4) continue;
    var data = sheet.getRange(1, 1, lastRow, 10).getValues();
    
    for (var i = 3; i < data.length; i++) {
      var row = data[i];
      var type = String(row[2] || "").trim();
      
      // 분배금 또는 배당 관련 키워드가 있는 경우
      if (type.indexOf("분배") !== -1 || type.indexOf("배당") !== -1) {
        var dateVal = row[1];
        var dateStr = "";
        
        if (dateVal instanceof Date) {
          dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else {
          var rawDate = String(dateVal).trim();
          var cleaned = rawDate.replace(/[^0-9]/g, '');
          if (cleaned.length >= 8) {
            dateStr = cleaned.slice(0, 4) + "-" + cleaned.slice(4, 6) + "-" + cleaned.slice(6, 8);
          } else {
            dateStr = rawDate;
          }
        }
        
        var amount = parseFloat(String(row[6]).replace(/,/g, "")) || 0;
        var symbol = String(row[5] || "").trim();
        var name = "";
        
        // 시계열 방향 정렬에 맞춰서 2줄 구조에서 종목명 추출
        if (i + 1 < data.length) {
          var nextColB = String(data[i+1][1]).trim();
          var isNextSeq = !nextColB.includes("/") && !nextColB.includes("-") && /^[0-9]+$/.test(nextColB);
          if (isNextSeq) {
            name = String(data[i+1][5] || "").trim();
          }
        }
        if (!name && i - 1 >= 3) {
          var prevColB = String(data[i-1][1]).trim();
          var isPrevSeq = !prevColB.includes("/") && !prevColB.includes("-") && /^[0-9]+$/.test(prevColB);
          if (isPrevSeq) {
            name = String(data[i-1][5] || "").trim();
          }
        }
        
        dividends.push({
          account: sheetName,
          date: dateStr,
          year: dateStr.slice(0, 4),
          month: dateStr.slice(5, 7),
          symbol: symbol,
          name: name || "기타 배당/분배금",
          amount: amount
        });
      }
    }
  }
  return dividends;
}
`;

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok) {
        setGasUrl(data.gasUrl || '');
        setIsConnected(data.isConnected);
        setTargetStock(data.targetStock ?? 60);
        setTargetBond(data.targetBond ?? 20);
        setTargetGold(data.targetGold ?? 10);
        setTargetCash(data.targetCash ?? 10);
      } else {
        setMessage({ text: '설정을 불러오는데 실패했습니다.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'API 통신 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gasUrl }),
      });

      if (res.ok) {
        setMessage({ text: '구글 앱스 스크립트 웹 앱 URL이 저장되었습니다.', type: 'success' });
        fetchSettings();
      } else {
        const data = await res.json();
        setMessage({ text: `저장 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: '저장 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('정말 연동을 해제하시겠습니까? 등록된 웹 앱 주소가 삭제됩니다.')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings', { method: 'DELETE' });
      if (res.ok) {
        setMessage({ text: '연동이 해제되었습니다.', type: 'success' });
        setGasUrl('');
        setIsConnected(false);
        fetchSettings();
      } else {
        setMessage({ text: '연동 해제에 실패했습니다.', type: 'error' });
      }
    } catch {
      setMessage({ text: '연동 해제 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRatios = async (e: React.FormEvent) => {
    e.preventDefault();
    const sum = Number(targetStock) + Number(targetBond) + Number(targetGold) + Number(targetCash);
    if (Math.abs(sum - 100) > 0.01) {
      alert(`자산 비율의 합계는 반드시 100%여야 합니다. (현재 합계: ${sum}%)`);
      return;
    }

    setIsSavingRatio(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStock,
          targetBond,
          targetGold,
          targetCash,
        }),
      });

      if (res.ok) {
        setMessage({ text: '목표 자산 비중 설정이 성공적으로 저장되었습니다.', type: 'success' });
      } else {
        const data = await res.json();
        setMessage({ text: `비율 저장 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: '비율 저장 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSavingRatio(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(appsScriptCode);
    alert('구글 앱스 스크립트 코드가 클립보드에 복사되었습니다!');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '2rem' }}>연동 설정</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        GCP 클라우드 가입 없이, 구글 시트 내 구글 앱스 스크립트(GAS)를 배포하여 대시보드와 초간단 양방향 통신을 활성화합니다.
      </p>

      {message && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            background: message.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            border: `1px solid ${message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Left Side: Setup Form and Copy Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Form Panel */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              1. 웹 앱 연동 주소 입력
            </h2>
            
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                <div className="spinner"></div>
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Google Apps Script 웹 앱 URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={gasUrl}
                    onChange={(e) => setGasUrl(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    구글 시트에서 배포 후 발급받은 웹 앱 고유 URL을 그대로 입력해 주세요.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSaving}>
                    {isSaving ? <div className="spinner"></div> : '설정 저장하기'}
                  </button>
                  {isConnected && (
                    <button type="button" onClick={handleDisconnect} className="btn btn-secondary">
                      연동 해제
                    </button>
                  )}
                </div>
              </form>
            )}

            {isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0, 230, 118, 0.05)', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--color-success)' }}>
                <span className="badge badge-green">연동 중</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  시트가 연결되어 동기화할 준비가 되었습니다.
                </span>
              </div>
            )}
          </div>

          {/* Target Ratio Panel */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              ⚙️ 목표 자산 배분 비중 설정
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              대시보드와 리밸런싱 가이드에서 비교 기준으로 사용될 각 자산군별 목표 투자 비율을 % 단위로 입력해 주세요. (네 항목의 합계가 100%여야 합니다)
            </p>

            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
                <div className="spinner"></div>
              </div>
            ) : (
              <form onSubmit={handleSaveRatios} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">📈 주식 비중 (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="100"
                      value={targetStock}
                      onChange={(e) => setTargetStock(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">⚖️ 채권 비중 (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="100"
                      value={targetBond}
                      onChange={(e) => setTargetBond(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">🪙 금(Gold) 비중 (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="100"
                      value={targetGold}
                      onChange={(e) => setTargetGold(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">💵 현금성 자산 비중 (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="100"
                      value={targetCash}
                      onChange={(e) => setTargetCash(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>합계 비율:</span>
                  <span style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: Number(targetStock) + Number(targetBond) + Number(targetGold) + Number(targetCash) === 100 ? 'var(--color-success)' : 'var(--color-danger)'
                  }}>
                    {Number(targetStock) + Number(targetBond) + Number(targetGold) + Number(targetCash)}%
                  </span>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSavingRatio}>
                  {isSavingRatio ? <div className="spinner"></div> : '목표 비중 저장하기'}
                </button>
              </form>
            )}
          </div>

          {/* Copy Script Code Panel */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem' }}>2. 구글 앱스 스크립트 소스 코드</h2>
              <button onClick={handleCopyCode} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                📋 코드 복사하기
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              아래 코드를 복사하여 구글 시트의 **[확장 프로그램] &gt; [Apps Script]** 편집기에 붙여넣고 저장해 주세요.
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: '#04060f',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '1rem',
                  fontSize: '0.75rem',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  color: '#22c55e',
                  lineHeight: '1.5',
                }}
              >
                {appsScriptCode}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Side: Simple Setup Guide */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            💡 초간단 연동 가이드
          </h2>
          <div style={{ fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p>GCP 설정이 전혀 필요 없으며 아래 5단계만 진행하면 모든 세팅이 완료됩니다.</p>
            
            <strong style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>1단계: 시트 내 스크립트 창 열기</strong>
            <p>본인의 구글 드라이브에서 **`연금투자일지` 스프레드시트**를 엽니다. 상단 메뉴바에서 <strong>[확장 프로그램] &gt; [Apps Script]</strong>를 차례대로 클릭합니다.</p>

            <strong style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>2단계: 코드 붙여넣기</strong>
            <p>새 브라우저 탭에 코드 편집기 창이 뜨면, 기존에 써있는 <code>function myFunction() ...</code> 등의 내용을 모두 지운 뒤, 왼쪽의 <strong>[구글 앱스 스크립트 소스 코드]</strong>를 복사(📋 코드 복사하기 버튼 클릭)하여 그대로 붙여넣습니다.</p>

            <strong style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>3단계: 스크립트 프로젝트 저장</strong>
            <p>편집기 상단 메뉴에 있는 **저장 아이콘(💾 디스크 모양)**을 눌러 코드를 저장합니다.</p>

            <strong style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>4단계: 웹 앱으로 배포하기</strong>
            <ol style={{ paddingLeft: '1.2rem' }}>
              <li>우측 상단 파란색 <strong>[배포] &gt; [새 배포]</strong> 단추를 누릅니다.</li>
              <li>톱니바퀴 아이콘을 누르고 <strong>[웹 앱]</strong>을 선택합니다.</li>
              <li>다음 항목을 지정하고 <strong>[배포]</strong>를 누릅니다:
                <ul style={{ paddingLeft: '1.2rem', marginTop: '0.25rem' }}>
                  <li><strong>설명</strong>: <code>Pension Sync API</code></li>
                  <li><strong>다음 사용자로 실행</strong>: <code>웹 앱을 액세스하는 사용자</code> (또는 본인 계정)</li>
                  <li><strong>액세스 권한이 있는 사용자</strong>: <strong>모든 사용자(Anyone)</strong> (로컬 대시보드와 통신을 위해 반드시 &apos;모든 사용자&apos;로 설정해야 합니다.)</li>
                </ul>
              </li>
              <li>최초 배포 시 <strong>[액세스 승인]</strong> 창이 뜨면, 본인의 구글 계정을 클릭하고, 경고 창이 나오면 <strong>[Advanced(고급)] &gt; [Go to Untitled project (unsafe)(이동)]</strong>을 눌러 권한을 전부 허용(Allow)해 줍니다.</li>
            </ol>

            <strong style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>5단계: URL 주소 등록</strong>
            <p>배포 완료 후 창에 표시되는 **[웹 앱 URL]** 주소를 마우스로 복사하여, 왼쪽 <strong>[Google Apps Script 웹 앱 URL]</strong> 입력창에 붙여넣고 <strong>[설정 저장하기]</strong>를 클릭하면 끝입니다!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-secondary)' }}>설정 화면 로딩 중...</p>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
