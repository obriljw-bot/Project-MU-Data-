import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Header } from './components/Header';
import { ChatStream } from './components/ChatStream';
import { StatsPanel } from './components/StatsPanel';
import { ProductTable } from './components/ProductTable';
import { ControlPanel } from './components/ControlPanel';
import { ProductManagerModal } from './components/ProductManagerModal';
import { PrompterOverlay } from './components/PrompterOverlay';
import { AnnouncerSettingsModal } from './components/AnnouncerSettingsModal';
import { ScannerGuideModal } from './components/ScannerGuideModal';

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [trends, setTrends] = useState([]);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [chatInput, setChatInput] = useState('');

  // Prompter & Selection State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const selectedProductRef = React.useRef(selectedProduct);

  const [prompterMsg, setPrompterMsg] = useState(null); // { mode: 'TEXT'|'PRODUCT', ... }
  const prompterMsgRef = React.useRef(null); // WS 핸들러에서 프롬프터 열림 여부 확인용
  const [prompterInput, setPrompterInput] = useState('');

  // Sales Counting Toggle
  const [isSalesCountingEnabled, setIsSalesCountingEnabled] = useState(true);
  const salesCountingRef = React.useRef(isSalesCountingEnabled);

  // Global Stats Toggle (Footer)
  const [showGlobalStats, setShowGlobalStats] = useState(false);

  // =============================================
  // Auto Announcer State
  // =============================================
  const [announcerEnabled, setAnnouncerEnabled] = useState(false);
  const [announcerCountdown, setAnnouncerCountdown] = useState(60);
  const [nextAutoMsg, setNextAutoMsg] = useState('Next Auto Message...');
  const [isAnnouncerModalOpen, setIsAnnouncerModalOpen] = useState(false);

  // Announcer Settings (설정창에서 변경 가능)
  const [announcerInterval, setAnnouncerInterval] = useState(60);
  const [announcerTemplates, setAnnouncerTemplates] = useState(['', '', '']);
  const [announcerOrder, setAnnouncerOrder] = useState('1, 2, 3');
  const [announcerPresets, setAnnouncerPresets] = useState([
    { enabled: false, text: '🔥 지금 {name} 특가 진행 중! {price}에 만나보세요 🛍️' },
    { enabled: false, text: '⏰ 오늘만! {name} {remaining}개 남았어요. 서두르세요!' },
    { enabled: false, text: '✨ {brand} {name} — {k1} {k2} 지금 바로 확인하세요 📦' },
  ]);

  // Announcer Refs (setInterval 내부에서 최신 state 접근용)
  const announcerEnabledRef = React.useRef(false);
  const announcerIntervalRef = React.useRef(60);
  const announcerTemplatesRef = React.useRef(['', '', '']);
  const announcerPresetsRef = React.useRef([]);
  const templateIndexRef = React.useRef(0);

  // =============================================
  // [V4.3 오리지널 엔진] 선착순 실시간 참여 / 판매 로그
  // =============================================
  const [fcfsParticipation, setFcfsParticipation] = useState(0);
  const [fcfsTarget, setFcfsTarget] = useState(null);
  const [fcfsCode, setFcfsCode] = useState('');

  const [salesLogs, setSalesLogs] = useState([]); // { id, code, count, productName, applied, ts }
  const salesLogsRef = React.useRef([]);
  useEffect(() => { salesLogsRef.current = salesLogs; }, [salesLogs]);

  // =============================================
  // 스캐너 모드 / 로그 검색 / 코드 자동매칭
  // =============================================
  const [scannerMode, setScannerMode] = useState('AUTO');
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(true); // 바코드 자동 매칭 ON/OFF
  const autoMatchRef = React.useRef(true);
  useEffect(() => { autoMatchRef.current = autoMatchEnabled; }, [autoMatchEnabled]);

  // =============================================
  // Scanner / 외부 기기 State
  // =============================================
  const [isScannerGuideOpen, setIsScannerGuideOpen] = useState(false);
  const [localIp, setLocalIp] = useState('');
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [adminPin, setAdminPin] = useState('');

  // =============================================
  // Ref 동기화
  // =============================================
  useEffect(() => { selectedProductRef.current = selectedProduct; }, [selectedProduct]);
  useEffect(() => { prompterMsgRef.current = prompterMsg; }, [prompterMsg]);
  useEffect(() => { salesCountingRef.current = isSalesCountingEnabled; }, [isSalesCountingEnabled]);
  useEffect(() => { announcerEnabledRef.current = announcerEnabled; }, [announcerEnabled]);
  useEffect(() => { announcerIntervalRef.current = announcerInterval; }, [announcerInterval]);
  useEffect(() => { announcerTemplatesRef.current = announcerTemplates; }, [announcerTemplates]);
  useEffect(() => { announcerPresetsRef.current = announcerPresets; }, [announcerPresets]);

  // Toast State
  const [toast, setToast] = useState(null);

  // =============================================
  // 커스텀 Confirm 모달 State
  // =============================================
  const [confirmModal, setConfirmModal] = useState({ visible: false, message: '', onConfirm: null, onCancel: null });

  // Product State (In-Memory)
  const [products, setProducts] = useState([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // productsRef: WS 핸들러 내에서 최신 products 접근용
  const productsRef = React.useRef(products);
  useEffect(() => { productsRef.current = products; }, [products]);

  // fcfsCodeRef: 핸들러/이벤트 내 최신 감지 코드 접근용
  const fcfsCodeRef = React.useRef('');
  useEffect(() => { fcfsCodeRef.current = fcfsCode; }, [fcfsCode]);

  // [V5.0] 지문(Fingerprint) 기반 정규화 ref
  // fingerprint: 상위 3인 닉네임 조합 (판매 동일성 식별자)
  // count: 마지막으로 기록된 당첨 수량
  // logId: 현재 활성 로그 ID (수량 업데이트 대상 추적)
  const lastFcfsWinnersRef = React.useRef({ fingerprint: '', count: 0, logId: '' });

  // =============================================
  // Live Hot Keywords — 실시간 채팅 키워드 분석
  // messages 변경 시마다 클라이언트 측 빈도 계산
  // =============================================
  useEffect(() => {
    if (messages.length === 0) { setTrends([]); return; }

    const STOPWORDS = new Set([
      'ㅋ','ㅋㅋ','ㅋㅋㅋ','ㅋㅋㅋㅋ','ㅎ','ㅎㅎ','ㅎㅎㅎ','ㅠ','ㅠㅠ','ㅜ','ㅜㅜ','ㅇ','ㅇㅇ','ㄷㄷ',
      '네','넵','예','아','오','우','음','와','야','어','응','헐','대박','와우','우와',
      '이','그','저','제','을','를','가','은','는','에','의','도','과','와','로','에서','에게',
      '감사','감사합니다','감사해요','고마워','고맙습니다','ㄳ',
      '안녕','안녕하세요','반가워요','반갑습니다',
      '진짜','정말','완전','너무','많이','그냥','약간','좀',
      '같아','같은','같이','있어','없어','보여','이거','저거','그거',
      '개','명','번','회','원','분','초','저요','저요!','저요!!',
    ]);

    const QUERY_PATTERN = /[?？]|어디|얼마|있나|없나|어때|뭐예|무엇|언제|어떻게|구매|살수|파나요|살게|사고|성분|효과|사이즈|용량|배송|재고|후기|사용법|추천|비교/;
    const REACTION_PATTERN = /저요|최고|짱|신기|이쁘|예쁘|좋아|좋네|좋겠|갖고싶|사고싶|👍|❤|💕|😍|🔥|대박|헐|놀라|완전좋/;

    const freqMap = new Map();

    messages.forEach(msg => {
      if (!msg.message || msg.intent === 'BOT_REPLY') return;
      const isQuery = QUERY_PATTERN.test(msg.message);
      const isParticipation = !isQuery && (msg.intent === 'BUY' || REACTION_PATTERN.test(msg.message));
      const category = isQuery ? 'QUERY' : isParticipation ? 'PARTICIPATION' : 'QUERY';

      const tokens = msg.message
        .replace(/[^가-힣ㄱ-ㆎa-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

      tokens.forEach(word => {
        const key = word + '::' + category;
        freqMap.set(key, (freqMap.get(key) || 0) + 1);
      });
    });

    const result = Array.from(freqMap.entries())
      .filter(([, freq]) => freq >= 1)
      .map(([key, frequency]) => {
        const sep = key.lastIndexOf('::');
        return { term: key.slice(0, sep), frequency, category: key.slice(sep + 2) };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 30);

    setTrends(result);
  }, [messages]);

  // =============================================
  // WebSocket 연결 (AUTH_SYSTEM 인증 포함)
  // =============================================
  const socketRef = React.useRef(null);

  const connect = () => {
    if (socketRef.current && (socketRef.current.readyState === 0 || socketRef.current.readyState === 1)) return;

    console.log("Attempting to connect...");
    const ws = new WebSocket('ws://localhost:8081');
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Connected');
      setIsConnected(true);
      setSocket(ws);
      // 로컬 관리자 인증: 서버에 "나는 이 PC야" 신호 전송
      ws.send(JSON.stringify({ type: 'AUTH_SYSTEM' }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleWsMessage(payload);
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };

    ws.onclose = () => {
      console.log('❌ Disconnected. Retrying...');
      setIsConnected(false);
      setSocket(null);
      socketRef.current = null;
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WS connection error:", err);
      ws.close();
    };

    setSocket(ws);
  };

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        console.log("Cleaning up WebSocket...");
        socketRef.current.close();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =============================================
  // 공지 자동 타이머 (프론트엔드 자체 관리)
  // =============================================
  useEffect(() => {
    const timer = setInterval(() => {
      // OFF 상태면 카운트다운을 현재 interval 값으로 리셋 유지
      if (!announcerEnabledRef.current) {
        setAnnouncerCountdown(announcerIntervalRef.current);
        return;
      }

      setAnnouncerCountdown(prev => {
        if (prev <= 1) {
          // 🔔 카운트다운 완료 → 공지 메시지 자동 전송
          // 커스텀 템플릿 + 활성화된 프리셋 병합
          const customTemplates = announcerTemplatesRef.current.filter(t => t.trim());
          const presetTemplates = announcerPresetsRef.current
            .filter(p => p.enabled && p.text?.trim())
            .map(p => p.text);
          const allTemplates = [...customTemplates, ...presetTemplates];

          if (allTemplates.length > 0) {
            const product = selectedProductRef.current;
            const keywords = Array.isArray(product?.keywords)
              ? product.keywords.map(k => String(k).replace(/^#/, '').trim()).filter(k => k)
              : [];
            const snippetIdx = templateIndexRef.current;
            const snippet = keywords.length > 0 ? keywords[snippetIdx % keywords.length] : '';
            const priceStr = product?.price ? `₩${Number(product.price).toLocaleString()}` : '';
            const remaining = product?.stock != null
              ? String((product.stock || 0) - (product.sales || 0)) : '';

            let msg = allTemplates[templateIndexRef.current % allTemplates.length]
              .replace('{name}',      product?.name    || '(상품 미선택)')
              .replace('{expiry}',    product?.expiry  || '')
              .replace('{brand}',     product?.brand   || '')
              .replace('{price}',     priceStr)
              .replace('{stock}',     String(product?.stock ?? ''))
              .replace('{remaining}', remaining)
              .replace('{code}',      product?.code    || '')
              .replace('{snippet}',   snippet);
            keywords.forEach((kw, i) => { msg = msg.replaceAll(`{k${i + 1}}`, kw); });
            msg = msg.replace(/\{k\d+\}/g, '');

            templateIndexRef.current = (templateIndexRef.current + 1) % allTemplates.length;
            setNextAutoMsg(msg);
            if (socketRef.current?.readyState === 1) {
              socketRef.current.send(JSON.stringify({
                type: 'SEND_CHAT',
                message: msg,
                requestId: Date.now().toString()
              }));
            }
          }
          // 다음 카운트다운 시작
          return announcerIntervalRef.current;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []); // 마운트 시 한 번만 실행

  // =============================================
  // 판매량 적용
  // =============================================
  // targetProduct: 특정 제품 직접 지정 (없으면 현재 선택 제품)
  const applySalesCount = (count, targetProduct = null, newCode = null) => {
    const target = targetProduct || selectedProductRef.current;
    if (!target) {
      showToast("No product selected to apply sales count!", "error");
      return;
    }
    setProducts(prev => prev.map(p => {
      const isMatch = target.id ? p.id === target.id : (p.name === target.name);
      if (isMatch) {
        // [V4.3 오리지널 핵심] 코드가 비어있을 때만 새로 감지된 코드를 부여하고, 
        // 수량은 딱 한 번만 정확하게 합산합니다.
        const finalCode = p.code || newCode || p.code;
        return { ...p, code: finalCode, sales: (p.sales || 0) + count };
      }
      return p;
    }));
    if (count > 0) {
      showToast(`✅ [${target.name}] 판매 ${count}개 반영 완료`, "success");
    } else if (newCode) {
      showToast(`✅ [${target.name}] 코드 등록 완료`, "success");
    }

    // [V4.3] 정산 완료 후 선택된 제품 정보도 최신화하여 UI 괴리 및 로직 stale 방지
    const sel = selectedProductRef.current;
    if (sel && (sel.id === target.id || sel.name === target.name)) {
      const updatedProduct = { ...sel, code: (sel.code || newCode || sel.code), sales: (sel.sales || 0) + count };
      setSelectedProduct(updatedProduct);
      selectedProductRef.current = updatedProduct;
    }

    setFcfsCode('');
    fcfsCodeRef.current = '';
  };

  // =============================================
  // WebSocket 메시지 처리
  // =============================================
  const handleWsMessage = (payload) => {
    switch (payload.type) {

      // ── 인증 관련 ──────────────────────────────
      case 'AUTH_REQUIRED':
        // 서버가 인증 요청 → 즉시 로컬 관리자 인증 재전송
        socketRef.current?.send(JSON.stringify({ type: 'AUTH_SYSTEM' }));
        break;
      case 'AUTH_SUCCESS':
        console.log('✅ WS 인증 성공');
        break;

      // ── 서버 정보 (IP, 터널주소) ───────────────
      case 'SERVER_INFO':
        if (payload.data?.localIp) setLocalIp(payload.data.localIp);
        if (payload.data?.tunnelUrl) setTunnelUrl(payload.data.tunnelUrl);
        break;
      case 'TUNNEL_READY':
        if (payload.data?.tunnelUrl) setTunnelUrl(payload.data.tunnelUrl);
        break;

      // ── 연결 유지 (Heartbeat) ──────────────────
      case 'PING':
        socketRef.current?.send(JSON.stringify({ type: 'PONG' }));
        break;

      // ── 채팅 메시지 ───────────────────────────
      case 'CHAT_MSG':
      case 'SALES_UPDATE':
        setMessages(prev => {
          const isDuplicate = prev.some(m =>
            m.nickname === payload.data.nickname &&
            m.message === payload.data.message &&
            (new Date().getTime() - (m.ts || 0) < 2000)
          );
          if (isDuplicate) return prev;

          const newMsg = {
            ...payload.data,
            ts: payload.data.ts || Date.now()
          };

          // 구매 감지
          const purchaseRegex = /저요|(\d+\s*개)/;
          if (purchaseRegex.test(newMsg.message)) {
            newMsg.intent = 'BUY';
          } else {
            if (newMsg.intent === 'BUY') newMsg.intent = 'CHAT';
          }

          return [...prev.slice(-199), newMsg];
        });
        break;

      // ── 선착순 실시간 참여 카운터 (디스플레이 전용) ─────────────
      // 판매 시스템(fcfsCode, lastFcfsWinnersRef)과 완전 분리
      // 판매 경계는 CART_EVENT가 담당 — 여기서 판매 상태 건드리지 않음
      case 'FCFS_PARTICIPATION':
        setFcfsParticipation(payload.data?.count || 0);
        if (payload.data?.target != null) setFcfsTarget(payload.data.target);
        break;

      // ── 선착순 당첨 — V5.0 지문(Fingerprint) 기반 정규화 ──
      case 'FCFS_WINNERS': {
        const winnerCount = payload.data.count;
        const fingerprint = payload.data.fingerprint || '';
        const now_fw = Date.now();

        const last = lastFcfsWinnersRef.current;

        if (fingerprint && fingerprint === last.fingerprint) {
          // ── 동일 지문: 같은 판매의 수량 업데이트 or 중복 신호 ──
          if (winnerCount > last.count) {
            // 성장형 신호 (참여자 증가) → 기존 로그 수량만 갱신
            const updatedLogs = salesLogsRef.current.map(l =>
              l.id === last.logId ? { ...l, count: winnerCount } : l
            );
            salesLogsRef.current = updatedLogs;
            setSalesLogs(updatedLogs);
            lastFcfsWinnersRef.current = { ...last, count: winnerCount };
            console.log(`🔄 [FCFS] 동일 지문 수량 갱신: ${last.count} → ${winnerCount}`);
          } else {
            // 완전한 중복 신호 → 무시
            console.log(`⚠️ [FCFS] 중복 신호 차단 (지문 일치, 수량 동일: ${winnerCount})`);
          }
          break;
        }

        // ── 지문 없는 신호 폴백 방어막 ──
        // hasUnapplied 제거: 미매칭(applied:false) 로그가 남아있으면 이후 같은 수량 판매를 영구 차단하는 오탐 발생
        // isTimeLocked만 사용: CART 이후 ts가 0으로 리셋되므로 다음 판은 항상 통과
        if (!fingerprint) {
          const isTimeLocked = (winnerCount === last.count && (now_fw - (last.ts || 0) < 10000));
          if (isTimeLocked) {
            console.log(`⚠️ [FCFS] 지문 없음 — 시간 잠금 차단 (${winnerCount}명, ${Math.round((now_fw - last.ts) / 1000)}초 경과)`);
            break;
          }
          // 폴백 통과 시 시간 기록
          lastFcfsWinnersRef.current = { ...last, count: winnerCount, ts: now_fw };
        }

        // ── 새로운 지문: 신규 판매 로그 생성 ──
        const newLog = {
          id: crypto.randomUUID(),
          count: winnerCount,
          ts: Date.now(),
          productName: '',
          code: '',
          applied: false
        };

        lastFcfsWinnersRef.current = { fingerprint, count: winnerCount, logId: newLog.id, ts: now_fw };

        setMessages(prev => [...prev.slice(-199), {
          nickname: '🤖 BOT',
          message: `📢 [판매종료] 당첨자 ${winnerCount}명 집계 완료!`,
          intent: 'BOT_REPLY', ts: Date.now()
        }]);
        showToast(`📢 [판매종료] 당첨자 ${winnerCount}명 집계 완료!`, 'info');

        // ref 동기 업데이트 → CART_EVENT가 바로 뒤따라와도 최신 로그를 읽을 수 있음
        const nextLogs_fw = [newLog, ...salesLogsRef.current.slice(0, 99)];
        salesLogsRef.current = nextLogs_fw;
        setSalesLogs(nextLogs_fw);
        break;
      }

      // ── 채팅 경로 당첨 힌트 — 참고 로그만 (판매 정산 개입 없음) ──
      case 'FCFS_CHAT_HINT': {
        const hintCount = payload.data?.count;
        console.log(`💬 [FCFS_CHAT_HINT] 채팅 당첨 감지 (참고용): ${hintCount}명`);
        break;
      }

      // ── 장바구니 감지 — V4.3 오리지널 정산 ──
      case 'SYSTEM_PRODUCT_CART_EVENT': {
        const { code } = payload.data || {};
        if (!code) break;

        fcfsCodeRef.current = code;
        setFcfsCode(code);

        // [V4.3] 장바구니 핀을 꽂더라도, 10초 시간 자물쇠는 리셋하지 않습니다. 
        // 브라우저에서 늦게 도착하는 중복 신호가 리셋된 틈을 타서 들어오는 것을 원천 차단합니다.

        // 1순위: 제품 리스트에서 코드 매칭 (철저한 보안을 위해 100% 일치할 때만 자동 정산)
        const allProducts_cart = productsRef.current;
        let foundProduct_cart = allProducts_cart.find(p => p.code && p.code === code) || 
                                (autoMatchRef.current && allProducts_cart.find(p => p.barcode && p.barcode === code));

        // 2순위: 리스트에 없을 때만 → 프롬프터가 열려있는 제품에 코드 부여 후보로 선정
        // [V4.3] 근본적 해결: selectedProductRef가 과거 정보(코드 없음)를 가지고 있을 수 있으므로, 
        // 정산 직전에 반드시 최신 제품 리스트에서 해당 제품의 현재 상태를 다시 확인합니다.
        if (!foundProduct_cart) {
          const isPrompterOpen = prompterMsgRef.current?.mode === 'PRODUCT';
          const sel = selectedProductRef.current;
          const currentSelected = (isPrompterOpen && sel) 
            ? allProducts_cart.find(p => (p.id && p.id === sel.id) || (p.name === sel.name)) 
            : null;
          
          if (currentSelected && !currentSelected.code) {
            foundProduct_cart = currentSelected;
          }
        }

        // salesLogsRef는 FCFS_WINNERS에서 동기 업데이트됨 → 항상 최신값 보장
        const targetLog_cart = salesLogsRef.current.find(l => !l.code && !l.applied);

        if (foundProduct_cart && targetLog_cart) {
          const updatedLogs = salesLogsRef.current.map(l =>
            l.id === targetLog_cart.id
              ? { ...l, code, applied: true, productName: foundProduct_cart.name }
              : l
          );
          salesLogsRef.current = updatedLogs;
          setSalesLogs(updatedLogs);
          applySalesCount(targetLog_cart.count, foundProduct_cart, code);
        } else if (targetLog_cart) {
          // 제품 없음: 코드만 기록
          const updatedLogs = salesLogsRef.current.map(l =>
            l.id === targetLog_cart.id ? { ...l, code } : l
          );
          salesLogsRef.current = updatedLogs;
          setSalesLogs(updatedLogs);
        }

        // CART_EVENT = 판매 경계 신호
        // [V5.1] count·ts 리셋 복구: CART 후 다음 판이 같은 수량이어도 신규 로그를 만들 수 있도록.
        // fingerprint는 유지(지문이 있는 경우 CART 직후 DOM 폴링 오탐 방어용).
        // DOM 폴링의 lastWinnerCount는 sniffer에서 이미 CART 시 리셋 안 함(화면 소멸 시 리셋) →
        // CART 직후 DOM 폴링이 재발사할 위험이 없으므로 App.jsx 리셋은 안전.
        lastFcfsWinnersRef.current = {
          ...lastFcfsWinnersRef.current, // fingerprint 유지
          count: 0,
          ts: 0,
          logId: ''
        };
        fcfsCodeRef.current = '';
        break;
      }

      // ── 통계 / 트렌드 ─────────────────────────
      case 'STATS_UPDATE':
        if (payload.data.trends) setTrends(payload.data.trends);
        break;
      case 'TREND_UPDATE':
        setTrends(payload.data);
        break;

      // ── 서버 상태 (Auto-Reply 등) ──────────────
      case 'STATE':
        if (payload.data?.autoReplyEnabled !== undefined) setAutoReplyEnabled(payload.data.autoReplyEnabled);
        if (payload.data?.currentUrl) setTargetUrl(payload.data.currentUrl);
        break;

      // ── 봇 응답 ───────────────────────────────
      case 'BOT_REPLY':
        setMessages(prev => {
          const isDuplicate = prev.some(m =>
            m.nickname === '🤖 BOT' &&
            m.message === payload.data.replyText &&
            (Date.now() - (m.ts || 0) < 2000)
          );
          if (isDuplicate) return prev;
          return [...prev.slice(-199), {
            nickname: '🤖 BOT',
            message: payload.data.replyText,
            intent: 'BOT_REPLY',
            keywords: [],
            ts: Date.now()
          }];
        });
        break;

      // ── 채팅 전송 결과 ────────────────────────
      case 'CHAT_SEND_RESULT':
        if (payload.success) {
          showToast("Message Sent Successfully", 'success');
          setChatInput('');
        } else {
          showToast(`Send Failed: ${payload.error}`, 'error');
        }
        break;

      // ── 리포트 내보내기 결과 ──────────────────
      case 'EXPORT_COMPLETE':
        alert(payload.data.success
          ? `✅ Report Saved: ${payload.data.path}`
          : `❌ Failed: ${payload.data.error}`
        );
        break;

      // ── 프롬프터 표시 ─────────────────────────
      case 'SHOW_CUE':
        setPrompterMsg(payload.data);
        break;

      default:
        break;
    }
  };

  // =============================================
  // 공지 ON/OFF 토글
  // =============================================
  const handleToggleAnnouncer = () => {
    const newEnabled = !announcerEnabled;
    setAnnouncerEnabled(newEnabled);
    // ON으로 바꿀 때 카운트다운 초기화
    if (newEnabled) {
      templateIndexRef.current = 0;
      setAnnouncerCountdown(announcerInterval);
    } else {
      setAnnouncerCountdown(announcerInterval);
    }
  };

  // =============================================
  // 스캐너 가이드 열기 (PIN 자동 조회)
  // =============================================
  const handleOpenScannerGuide = async () => {
    try {
      const res = await fetch('http://localhost:8081/admin/pin');
      if (res.ok) {
        const data = await res.json();
        setAdminPin(data.pin || '----');
      }
    } catch (e) {
      console.error('PIN 조회 실패:', e);
      setAdminPin('----');
    }
    setIsScannerGuideOpen(true);
  };

  // =============================================
  // 기타 핸들러
  // =============================================
  const toggleAutoReply = () => {
    if (!socket) return;
    const newState = !autoReplyEnabled;
    setAutoReplyEnabled(newState);
    socket.send(JSON.stringify({ type: 'TOGGLE_AUTO_REPLY', enabled: newState }));
  };

  const handleUrlUpdate = () => {
    if (!targetUrl.trim() || !socket) return;
    socket.send(JSON.stringify({ type: 'UPDATE_URL', url: targetUrl }));
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    const requestId = Date.now().toString();
    socket.send(JSON.stringify({ type: 'SEND_CHAT', message: chatInput, requestId }));
  };

  const handleUpdateProduct = (idOrCode, field, value) => {
    setProducts(prev => prev.map(p => {
      if ((p.id && p.id === idOrCode) || (!p.id && p.code === idOrCode)) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleUpdateLogCode = (logId, newCode) => {
    setSalesLogs(prev => prev.map(l => l.id === logId ? { ...l, code: newCode } : l));
    // ref도 함께 업데이트하여 동기화
    salesLogsRef.current = salesLogsRef.current.map(l => l.id === logId ? { ...l, code: newCode } : l);
  };

  // [V4.3] 태블릿 전체 통계 실시간 동기화 (전체 방송 누적 통계용)
  useEffect(() => {
    if (socketRef.current?.readyState === 1) {
      const tSold = products.reduce((sum, p) => sum + (p.sales || 0), 0);
      const tRevenue = products.reduce((sum, p) => sum + ((p.sales || 0) * (p.price || 0)), 0);
      
      socketRef.current.send(JSON.stringify({ 
        type: 'SYNC_GLOBAL_STATS', 
        data: { 
          totalSold: tSold,
          totalRevenue: tRevenue
        } 
      }));
    }
  }, [products]);

  // 프롬프터: 상품 선택 시 실시간 동기화
  useEffect(() => {
    if (prompterMsg?.mode === 'PRODUCT' && prompterMsg.product) {
      // ID 우선, 없으면 이름으로 매칭 (코드는 변경될 수 있으므로 매칭 기준으로 덜 안전함)
      const currentProduct = products.find(p =>
        (p.id && prompterMsg.product.id && p.id === prompterMsg.product.id) ||
        (p.name && p.name === prompterMsg.product.name)
      );
      if (currentProduct) {
        if (
          currentProduct.sales !== prompterMsg.product.sales || 
          currentProduct.stock !== prompterMsg.product.stock ||
          currentProduct.code !== prompterMsg.product.code
        ) {
          setPrompterMsg(prev => ({ ...prev, product: currentProduct }));
          // [V4.3] 태블릿 동기화: 제품 정보와 함께 전체 집계(Total) 데이터도 함께 전송합니다.
          if (socketRef.current?.readyState === 1) {
            const allProducts = productsRef.current;
            const tSold = allProducts.reduce((sum, p) => sum + (p.sales || 0), 0);
            const tRevenue = allProducts.reduce((sum, p) => sum + ((p.sales || 0) * (p.price || 0)), 0);

            socketRef.current.send(JSON.stringify({ 
              type: 'SYNC_SELECTION', 
              data: { 
                product: currentProduct,
                totalSold: tSold,
                totalRevenue: tRevenue
              } 
            }));
          }
        }
      }
    }
  }, [products, prompterMsg]);

  // 공통: 제품 선택 확정 처리
  const applyProductSelection = (finalProduct) => {
    setSelectedProduct(finalProduct);
    selectedProductRef.current = finalProduct;
    // 로컬 프롬프터 즉시 업데이트 (자신이 보낸 메시지는 서버가 안 돌려주는 경우 방지)
    setPrompterMsg({ mode: 'PRODUCT', product: finalProduct });
    if (socketRef.current?.readyState === 1) {
      const allProducts = productsRef.current;
      const tSold = allProducts.reduce((sum, p) => sum + (p.sales || 0), 0);
      const tRevenue = allProducts.reduce((sum, p) => sum + ((p.sales || 0) * (p.price || 0)), 0);

      socketRef.current.send(JSON.stringify({ 
        type: 'SYNC_SELECTION', 
        data: { 
          product: finalProduct,
          totalSold: tSold,
          totalRevenue: tRevenue
        } 
      }));
    }
  };

  // V4.3 오리지널: 플로팅 배너 터치 시 수동 매칭
  const handleMapNewCode = (code) => {
    const product = selectedProductRef.current;
    if (!product) {
      showToast('⚠️ 제품을 먼저 선택해주세요.', 'error');
      return;
    }

    const matchingLogs = salesLogsRef.current.filter(l => l.code === code && !l.applied);
    const totalCount = matchingLogs.reduce((sum, l) => sum + l.count, 0);

    setProducts(prev => prev.map(p => {
      const isTarget = p.id ? p.id === product.id : (p.name === product.name);
      return isTarget ? { ...p, code, sales: (p.sales || 0) + totalCount } : p;
    }));

    const updatedProduct = { ...product, code, sales: (product.sales || 0) + totalCount };
    setSelectedProduct(updatedProduct);
    selectedProductRef.current = updatedProduct;
    setPrompterMsg({ mode: 'PRODUCT', product: updatedProduct });

    setSalesLogs(prev => prev.map(l => 
      (l.code === code && !l.applied) ? { ...l, applied: true, productName: product.name } : l
    ));
    showToast(`✅ [수동 매칭] ${product.name} +${totalCount}개`, 'success');
  };

  const handleRematchPending = () => {
    const allProducts = productsRef.current;
    const toApply = []; // 업데이터 밖에서 처리할 항목들

    setSalesLogs(prev => {
      const updated = prev.map(log => {
        if (log.applied || !log.code) return log;
        const found = allProducts.find(p => p.code === log.code) ||
                      (autoMatchRef.current && allProducts.find(p => p.barcode === log.code));
        if (found) {
          toApply.push({ count: log.count, product: found });
          return { ...log, applied: true, productName: found.name };
        }
        return log;
      });
      return updated;
    });

    // applySalesCount는 setSalesLogs 업데이터 밖에서 호출
    if (toApply.length > 0) {
      toApply.forEach(({ count, product }) => applySalesCount(count, product));
      showToast(`🔄 일괄 갱신: ${toApply.reduce((s, x) => s + x.count, 0)}개 정산 완료`, 'success');
    }
  };

  const handleSelectProduct = (product) => {
    const isSame = (selectedProduct?.id && selectedProduct.id === product.id) ||
                   (!selectedProduct?.id && selectedProduct?.name === product.name);
    
    if (isSame) {
      setSelectedProduct(null);
      selectedProductRef.current = null;
      setPrompterMsg(null);
      return;
    }

    applyProductSelection(product);
  };

  // 셀러 프롬프터: 텍스트 큐 전송
  const handleSendCue = () => {
    if (!prompterInput.trim() || !socket) return;
    socket.send(JSON.stringify({ type: 'SEND_CUE', data: { message: prompterInput } }));
    setPrompterInput('');
  };

  // =============================================
  // 채팅 + 판매 데이터 통합 CSV 다운로드
  // =============================================
  const handleDownloadReport = () => {
    if (messages.length === 0 && products.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleString('ko-KR');

    // CSV 셀 이스케이프
    const esc = (v) => {
      const s = (v == null) ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const toRow = (cells) => cells.map(esc).join(',');

    const rows = [];

    // 섹션 1: 채팅 로그
    rows.push('[채팅 로그] ' + timeStr);
    rows.push(toRow(['#', '시간', '닉네임', '메시지', '인텐트']));
    messages.forEach((m, i) => {
      rows.push(toRow([
        i + 1,
        m.ts ? new Date(m.ts).toLocaleString('ko-KR') : '',
        m.nickname || '',
        m.message || '',
        m.intent || '',
      ]));
    });

    rows.push('');

    // 섹션 2: 제품 판매 현황
    rows.push('[제품 판매 현황] ' + timeStr);
    rows.push(toRow(['#', '코드', '브랜드', '제품명', '가격', '재고', '판매', '잔여', '매출액', '유통기한']));
    products.forEach((p, i) => {
      const sold = p.sales || 0;
      rows.push(toRow([
        i + 1,
        p.code || '',
        p.brand || '',
        p.name || '',
        p.price || 0,
        p.stock || 0,
        sold,
        (p.stock || 0) - sold,
        (p.price || 0) * sold,
        p.expiry || '',
      ]));
    });

    // xlsx 라이브러리로 진짜 엑셀 파일 생성 (인코딩/줄바꿈 문제 원천 차단)
    const wb = XLSX.utils.book_new();

    // 시트 1: 채팅 로그
    const chatSheet = XLSX.utils.aoa_to_sheet([
      ['#', '시간', '닉네임', '메시지', '인텐트'],
      ...messages.map((m, i) => [
        i + 1,
        m.ts ? new Date(m.ts).toLocaleString('ko-KR') : '',
        m.nickname || '',
        m.message || '',
        m.intent || '',
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, chatSheet, '채팅 로그');

    // 시트 2: 제품 판매 현황
    const productSheet = XLSX.utils.aoa_to_sheet([
      ['#', '코드', '브랜드', '제품명', '가격', '재고', '판매', '잔여', '매출액', '유통기한'],
      ...products.map((p, i) => {
        const sold = p.sales || 0;
        return [
          i + 1,
          p.code || '',
          p.brand || '',
          p.name || '',
          p.price || 0,
          p.stock || 0,
          sold,
          (p.stock || 0) - sold,
          (p.price || 0) * sold,
          p.expiry || '',
        ];
      }),
    ]);
    XLSX.utils.book_append_sheet(wb, productSheet, '제품 판매 현황');

    XLSX.writeFile(wb, 'live_report_' + dateStr + '.xlsx');
  };

  // =============================================
  // 집계 계산
  // =============================================
  const displayedProducts = (selectedProduct && !showGlobalStats)
    ? products.filter(p => (p.id && p.id === selectedProduct.id) || (!p.id && p.code === selectedProduct.code))
    : products;

  const totalStocks = displayedProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
  const totalSold = displayedProducts.reduce((sum, p) => sum + (p.sales || 0), 0);
  const totalRevenue = displayedProducts.reduce((sum, p) => sum + ((p.sales || 0) * (p.price || 0)), 0);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // =============================================
  // 렌더링
  // =============================================
  return (
    <div className="h-[100dvh] bg-gray-950 text-white font-sans flex flex-col overflow-hidden relative">

      {/* 프롬프터 오버레이 */}
      <PrompterOverlay
        prompterMsg={prompterMsg}
        onClose={() => setPrompterMsg(null)}
        onUpdateProduct={handleUpdateProduct}
        unmappedCodes={(selectedProduct && !selectedProduct.code)
          ? Array.from(new Set(salesLogs.filter(l => l.code && !l.applied).map(l => l.code)))
          : []
        }
        onMapNewCode={handleMapNewCode}
      />

      {/* 공지 설정 모달 */}
      <AnnouncerSettingsModal
        isOpen={isAnnouncerModalOpen}
        onClose={() => setIsAnnouncerModalOpen(false)}
        interval={announcerInterval}
        setInterval={setAnnouncerInterval}
        templates={announcerTemplates}
        setTemplates={setAnnouncerTemplates}
        order={announcerOrder}
        setOrder={setAnnouncerOrder}
        nextMessage={nextAutoMsg}
        selectedProduct={selectedProduct}
        presets={announcerPresets}
        setPresets={setAnnouncerPresets}
      />

      {/* 스캐너 가이드 모달 */}
      {isScannerGuideOpen && (
        <ScannerGuideModal
          localIp={localIp}
          tunnelUrl={tunnelUrl}
          adminPin={adminPin}
          onClose={() => setIsScannerGuideOpen(false)}
        />
      )}

      {/* Toast 알림 */}
      {toast && (
        <div className={`absolute top-10 right-10 px-4 py-2 rounded shadow-lg z-50 animate-bounce ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      {/* 커스텀 Confirm 모달 */}
      {confirmModal.visible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-72 flex flex-col overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
              <span className="text-sm font-bold text-white">{confirmModal.title}</span>
            </div>
            {/* 내용 */}
            <div className="px-4 py-3 space-y-1.5">
              {(confirmModal.lines || []).map((line, i) => (
                <div key={i} className="text-xs text-gray-300 flex items-center gap-2">
                  <span className="text-gray-600">•</span>
                  <span>{line}</span>
                </div>
              ))}
              {confirmModal.question && (
                <p className="text-[11px] text-yellow-300 mt-2 pt-2 border-t border-gray-800">
                  {confirmModal.question}
                </p>
              )}
            </div>
            {/* 버튼 */}
            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={confirmModal.onCancel}
                className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <Header isConnected={isConnected} targetUrl={targetUrl} onReconnect={connect} />

      <div className="flex-1 grid grid-cols-12 grid-rows-1 gap-0 overflow-hidden min-h-0">

        {/* COL 1: 채팅 + 자동 공지 */}
        <div className="col-span-4 flex flex-col border-r border-gray-800 min-h-0 overflow-hidden h-full">
          <ChatStream
            messages={messages.filter(m => ['CHAT', 'INQUIRY', 'REACTION'].includes(m.intent) || !m.intent)}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={sendChatMessage}
            announcerEnabled={announcerEnabled}
            onToggleAnnouncer={handleToggleAnnouncer}
            announcerCountdown={announcerCountdown}
            nextMessage={nextAutoMsg}
            onOpenAnnouncerSettings={() => setIsAnnouncerModalOpen(true)}
          />
        </div>

        {/* COL 2: 트렌드 통계 + 실시간 판매 로그 */}
          <StatsPanel
            trends={trends}
            salesLogs={salesLogs}
            onApplyAll={handleRematchPending}
            onUpdateLogCode={handleUpdateLogCode}
            onApplySingle={(logId) => {
              // App.jsx의 handleRematchPending이 내부적으로 salesLogsRef를 참조하므로 
              // handleUpdateLogCode로 ref가 업데이트된 후 호출하면 됨
              handleRematchPending();
            }}
            onDeleteSingle={(logId) => {
              const next = salesLogsRef.current.filter(l => l.id !== logId);
              salesLogsRef.current = next;
              setSalesLogs(next);
            }}
            onClearSalesLogs={() => { setSalesLogs([]); salesLogsRef.current = []; }}
          />

        {/* COL 3: 상품 + 컨트롤 */}
        <div className="col-span-6 bg-gray-900 flex flex-col min-h-0 overflow-hidden h-full">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            <ProductTable
              products={products}
              selectedProduct={selectedProduct}
              onSelectProduct={handleSelectProduct}
              onAdd={() => setIsProductModalOpen(true)}
              onEdit={() => setIsProductModalOpen(true)}
              onDelete={(code) => setProducts(p => p.filter(x => x.code !== code))}
              onUpdateProduct={handleUpdateProduct}
            />
          </div>

          {/* 집계 요약 (4칸) */}
          <div className="grid grid-cols-4 gap-px bg-gray-800 border-t border-gray-800 flex-none text-center relative group">
            <button
              onClick={() => setShowGlobalStats(!showGlobalStats)}
              className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 text-[10px] px-2 py-0.5 rounded-full border shadow-sm transition-all ${showGlobalStats
                ? 'bg-blue-600 text-white border-blue-400 opacity-100'
                : 'bg-gray-700 text-gray-400 border-gray-600 opacity-0 group-hover:opacity-100'
                }`}
              title="Toggle Global vs Item Stats"
            >
              {showGlobalStats ? 'GLOBAL STATS' : 'AUTO STATS'}
            </button>

            {selectedProduct && !showGlobalStats && (
              <div className="absolute top-0 left-0 w-full h-full bg-yellow-900/10 pointer-events-none border-t border-yellow-600/50 animate-pulse"></div>
            )}
            {/* 선착순 실시간 참여 + 코드 + 목표수량 */}
            <div className="bg-gray-900 px-2 py-1.5 z-10">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider flex items-center gap-1 flex-wrap">
                <span>선착순 참여</span>
                {fcfsCode && (
                  <span className="font-mono text-purple-300 bg-purple-900/30 px-1 py-0.5 rounded text-[8px] leading-none">
                    {fcfsCode}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-bold text-purple-400">{fcfsParticipation.toLocaleString()}</span>
                {fcfsTarget != null && fcfsTarget > 0 ? (
                  <span className="text-[10px] text-gray-400">/ {fcfsTarget.toLocaleString()}개</span>
                ) : (
                  <span className="text-[10px] text-gray-600">개</span>
                )}
              </div>
            </div>
            <div className="bg-gray-900 p-2 z-10">
              <div className="text-[10px] text-gray-500 uppercase">
                {selectedProduct && !showGlobalStats ? 'Sold (Item)' : 'Total Sold'}
              </div>
              <div className="text-lg font-bold text-red-400">{totalSold.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900 p-2 z-10">
              <div className="text-[10px] text-gray-500 uppercase">
                {selectedProduct && !showGlobalStats ? 'Revenue (Item)' : 'Total Revenue'}
              </div>
              <div className="text-lg font-bold text-yellow-400">{totalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900 p-2 z-10">
              <div className="text-[10px] text-gray-500 uppercase">Rem. Stock</div>
              <div className="text-lg font-bold text-blue-400">{(totalStocks - totalSold).toLocaleString()}</div>
            </div>
          </div>

          <ControlPanel
            autoReplyEnabled={autoReplyEnabled}
            toggleAutoReply={toggleAutoReply}
            isSalesCountingEnabled={isSalesCountingEnabled}
            toggleSalesCounting={() => setIsSalesCountingEnabled(!isSalesCountingEnabled)}
            targetUrl={targetUrl}
            setTargetUrl={setTargetUrl}
            handleUrlUpdate={handleUrlUpdate}
            prompterInput={prompterInput}
            setPrompterInput={setPrompterInput}
            onSendCue={handleSendCue}
            onResetAnalysis={() => socket?.send(JSON.stringify({ type: 'RESET_ANALYSIS' }))}
            onDownloadReport={handleDownloadReport}
            onOpenScannerGuide={handleOpenScannerGuide}
            scannerMode={scannerMode}
            onToggleScannerMode={() => setScannerMode(m => m === 'AUTO' ? 'MANUAL' : 'AUTO')}
            autoMatchEnabled={autoMatchEnabled}
            onToggleAutoMatch={() => setAutoMatchEnabled(v => !v)}
            products={products}
            onSelectProduct={handleSelectProduct}
            recentSales={messages.filter(m => ['BUY', 'BOT_REPLY', 'SYSTEM'].includes(m.intent)).slice(-50).reverse()}
          />
        </div>

        <ProductManagerModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          products={products}
          setProducts={setProducts}
          onSave={(newList) => setProducts(newList)}
        />
      </div>
    </div>
  );
}

export default App;
