import React, { useState, useEffect } from 'react';
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

  // Announcer Refs (setInterval 내부에서 최신 state 접근용)
  const announcerEnabledRef = React.useRef(false);
  const announcerIntervalRef = React.useRef(60);
  const announcerTemplatesRef = React.useRef(['', '', '']);
  const templateIndexRef = React.useRef(0);

  // =============================================
  // 선착순 실시간 참여 / 완료 판매 기록
  // =============================================
  const [fcfsParticipation, setFcfsParticipation] = useState(0);
  const [fcfsTarget, setFcfsTarget] = useState(null);       // 목표 판매수량
  const [fcfsCode, setFcfsCode] = useState('');             // 감지된 제품 코드
  const [completedSales, setCompletedSales] = useState([]);
  const [pendingSales, setPendingSales] = useState([]);     // 매칭 대기 중인 판매 { id, code, count, ts }
  const pendingSalesRef = React.useRef([]);
  useEffect(() => { pendingSalesRef.current = pendingSales; }, [pendingSales]);

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
  useEffect(() => { salesCountingRef.current = isSalesCountingEnabled; }, [isSalesCountingEnabled]);
  useEffect(() => { announcerEnabledRef.current = announcerEnabled; }, [announcerEnabled]);
  useEffect(() => { announcerIntervalRef.current = announcerInterval; }, [announcerInterval]);
  useEffect(() => { announcerTemplatesRef.current = announcerTemplates; }, [announcerTemplates]);

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
          const templates = announcerTemplatesRef.current.filter(t => t.trim());
          if (templates.length > 0) {
            const msg = templates[templateIndexRef.current % templates.length]
              .replace('{name}', selectedProductRef.current?.name || '(상품 미선택)')
              .replace('{expiry}', selectedProductRef.current?.expiry || '')
              .replace('{snippet}', '');
            templateIndexRef.current = (templateIndexRef.current + 1) % templates.length;
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
  const applySalesCount = (count, targetProduct = null) => {
    const target = targetProduct || selectedProductRef.current;
    if (!target) {
      showToast("No product selected to apply sales count!", "error");
      return;
    }
    setProducts(prev => prev.map(p => {
      const isMatch = target.id ? p.id === target.id : (p.code && p.code === target.code);
      return isMatch ? { ...p, sales: (p.sales || 0) + count } : p;
    }));
    showToast(`✅ [${target.name}] 판매 ${count}개 자동 반영 완료`, "success");
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

      // ── 선착순 실시간 참여 카운터 ─────────────
      case 'FCFS_PARTICIPATION':
        setFcfsParticipation(payload.data?.count || 0);
        if (payload.data?.target != null) setFcfsTarget(payload.data.target);
        break;

      // ── 선착순 당첨 — 로직1: 코드 매칭 즉시 반영 / 로직2: 매칭 실패 시 대기열
      case 'FCFS_WINNERS': {
        const winnerCount = payload.data.count;
        const detectedCode = fcfsCodeRef.current;

        // 채팅 로그에 기록
        setMessages(prev => {
          const isDup = prev.some(m =>
            m.intent === 'BOT_REPLY' &&
            m.message.includes(`당첨자 ${winnerCount}명`) &&
            (Date.now() - (m.ts || 0) < 5000)
          );
          if (isDup) return prev;
          return [...prev.slice(-199), {
            nickname: '🤖 BOT',
            message: `📢 [판매종료] 당첨자 ${winnerCount}명 집계 완료!`,
            intent: 'BOT_REPLY', keywords: [], ts: Date.now()
          }];
        });

        // 참여/목표 카운터 + 감지 코드 리셋 (다음 판매에서 이전 코드 재사용 방지)
        setFcfsParticipation(0);
        setFcfsTarget(null);
        setFcfsCode('');
        fcfsCodeRef.current = '';

        // ── 로직1: 제품 목록에서 코드 매칭 시도 ──────────────
        // 코드 매칭(항상) + 바코드 매칭(토글 ON일 때만)
        const matchedProduct = detectedCode
          ? productsRef.current.find(p =>
              (p.code && p.code === detectedCode) ||
              (autoMatchRef.current && p.barcode && p.barcode === detectedCode)
            )
          : null;

        if (matchedProduct) {
          // 로직1: 매칭 성공 → 즉시 판매수 반영
          applySalesCount(winnerCount, matchedProduct);
          setCompletedSales(prev => [{
            id: crypto.randomUUID(),
            count: winnerCount, ts: Date.now(),
            productName: matchedProduct.name,
            code: detectedCode,
            matched: true
          }, ...prev.slice(0, 49)]);
        } else {
          // 로직2: 매칭 실패 → 대기열에 추가, 수동 연결 대기
          const pendingId = crypto.randomUUID();
          setPendingSales(prev => [...prev, {
            id: pendingId,
            code: detectedCode || '',
            count: winnerCount,
            ts: Date.now()
          }]);
          setCompletedSales(prev => [{
            id: crypto.randomUUID(),
            count: winnerCount, ts: Date.now(),
            productName: '⏳ 매칭 대기',
            code: detectedCode || '',
            matched: false,
            pendingId
          }, ...prev.slice(0, 49)]);
          showToast(`⏳ [${detectedCode || '코드 없음'}] ${winnerCount}개 — 제품 선택 대기중`, 'error');
        }
        break;
      }

      // ── 장바구니 감지 → 코드 저장 + 매칭 제품 자동 선택 ──
      case 'SYSTEM_PRODUCT_CART_EVENT': {
        const { code } = payload.data || {};
        if (!code) break;

        // 감지된 코드 저장 (선착순 참여 카드 표시 + 제품 선택 시 자동 입력용)
        // ref 즉시 동기 업데이트 (useEffect 비동기 딜레이 방지)
        fcfsCodeRef.current = code;
        setFcfsCode(code);
        setFcfsParticipation(0); // 새 제품 시작 시 참여 초기화

        // ── 코드 매칭: 항상 동작 (p.code 필드) ──────────────
        const allProducts = productsRef.current;
        let found = allProducts.find(p => p.code && p.code === code);

        // ── 바코드 매칭: ON일 때만 추가 시도 (p.barcode 필드) ─
        if (!found && autoMatchRef.current) {
          found = allProducts.find(p => p.barcode && p.barcode === code);
        }

        if (found) {
          setSelectedProduct(found);
          selectedProductRef.current = found;
          if (socketRef.current?.readyState === 1) {
            socketRef.current.send(JSON.stringify({ type: 'SYNC_SELECTION', data: { product: found } }));
          }
          showToast(`📦 제품 자동 선택: ${found.name}`, 'success');
        }
        // 코드 저장됨 → 사용자가 직접 클릭 시 자동 입력에 사용
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

  // 프롬프터: 상품 선택 시 실시간 동기화
  useEffect(() => {
    if (prompterMsg?.mode === 'PRODUCT' && prompterMsg.product) {
      const currentProduct = products.find(p =>
        (p.id && p.id === prompterMsg.product.id) ||
        (!p.id && p.code === prompterMsg.product.code)
      );
      if (currentProduct) {
        if (currentProduct.sales !== prompterMsg.product.sales || currentProduct.stock !== prompterMsg.product.stock) {
          setPrompterMsg(prev => ({ ...prev, product: currentProduct }));
        }
      }
    }
  }, [products, prompterMsg]);

  // 공통: 제품 선택 확정 처리
  const applyProductSelection = (finalProduct) => {
    setSelectedProduct(finalProduct);
    selectedProductRef.current = finalProduct;
    if (socketRef.current?.readyState === 1) {
      socketRef.current.send(JSON.stringify({ type: 'SYNC_SELECTION', data: { product: finalProduct } }));
    }
  };

  // 상품 선택 → 프롬프터 동기화 + 로직3: 대기 판매수 코드 연결
  const handleSelectProduct = (product) => {
    const isSame = (selectedProduct?.id && selectedProduct.id === product.id) ||
      (!selectedProduct?.id && selectedProduct?.code === product.code);

    if (isSame) {
      setSelectedProduct(null);
      selectedProductRef.current = null;
      return;
    }

    const currentPending = pendingSalesRef.current;
    const detectedCode = fcfsCodeRef.current;

    if (!product.code && currentPending.length > 0) {
      // ── 로직3: 코드 없는 제품 선택 + 대기 판매 존재 → 커스텀 팝업으로 확인 ──
      const firstPending = currentPending[0];
      const confirmLines = [
        `감지 코드: ${firstPending.code || '(코드 없음)'}`,
        `대기 판매수: ${firstPending.count}개`,
        `선택 제품: ${product.name}`,
      ];

      setConfirmModal({
        visible: true,
        title: '📦 선착순 판매 매칭',
        lines: confirmLines,
        question: '위 제품에 코드를 입력하고 판매수를 적용할까요?',
        onConfirm: () => {
          setConfirmModal({ visible: false });
          const newCode = firstPending.code || '';
          setProducts(prev => prev.map(p => {
            if (p.id ? p.id === product.id : p.code === product.code) {
              return { ...p, code: newCode, sales: (p.sales || 0) + firstPending.count };
            }
            return p;
          }));
          const finalProduct = { ...product, code: newCode };
          setPendingSales(prev => prev.filter(s => s.id !== firstPending.id));
          setCompletedSales(prev => prev.map(s =>
            s.pendingId === firstPending.id
              ? { ...s, productName: product.name, matched: true }
              : s
          ));
          showToast(`✅ [${product.name}] 코드 매칭 + ${firstPending.count}개 반영 완료`, 'success');
          applyProductSelection(finalProduct);
        },
        onCancel: () => {
          setConfirmModal({ visible: false });
          // 취소 시: 코드 변경 없이 제품만 선택
          applyProductSelection(product);
        }
      });
      return; // 모달 응답 대기
    }

    let finalProduct = product;
    if (!product.code && detectedCode) {
      // 대기 판매 없을 때: 감지된 코드만 자동 입력
      setProducts(prev => prev.map(p => {
        if (p.id ? p.id === product.id : p.code === product.code) {
          return { ...p, code: detectedCode };
        }
        return p;
      }));
      finalProduct = { ...product, code: detectedCode };
      showToast(`📋 코드 자동 입력: ${detectedCode}`, 'success');
    }

    applyProductSelection(finalProduct);
  };

  // =============================================
  // 추가로직: 대기 판매 재매칭 (갱신 버튼)
  // =============================================
  const handleRematchPending = () => {
    const pending = pendingSalesRef.current;
    if (pending.length === 0) {
      setCompletedSales([]);
      return;
    }

    const currentProducts = productsRef.current;
    const matched = [];
    const remaining = [];

    pending.forEach(sale => {
      if (!sale.code) { remaining.push(sale); return; }
      // 코드 매칭(항상) + 바코드 매칭(토글 ON일 때만)
      const found = currentProducts.find(p =>
        (p.code && p.code === sale.code) ||
        (autoMatchRef.current && p.barcode && p.barcode === sale.code)
      );
      found ? matched.push({ sale, product: found }) : remaining.push(sale);
    });

    if (matched.length > 0) {
      // 매칭된 판매 일괄 반영
      matched.forEach(({ sale, product }) => {
        setProducts(prev => prev.map(p => {
          const isMatch = p.id ? p.id === product.id : (p.code && p.code === product.code);
          return isMatch ? { ...p, sales: (p.sales || 0) + sale.count } : p;
        }));
      });
      // completedSales 매칭 완료 표시
      const matchedIds = matched.map(m => m.sale.id);
      setCompletedSales(prev => prev.map(s => {
        if (s.pendingId && matchedIds.includes(s.pendingId)) {
          const m = matched.find(x => x.sale.id === s.pendingId);
          return { ...s, matched: true, productName: m?.product.name || s.productName };
        }
        return s;
      }));
      setPendingSales(remaining);
      showToast(`✅ ${matched.length}건 재매칭 완료 — 미매칭 ${remaining.length}건 잔여`, 'success');
    } else {
      showToast('현재 제품 목록에서 매칭 가능한 코드가 없습니다', 'error');
    }
  };

  // 셀러 프롬프터: 텍스트 큐 전송
  const handleSendCue = () => {
    if (!prompterInput.trim() || !socket) return;
    socket.send(JSON.stringify({ type: 'SEND_CUE', data: { message: prompterInput } }));
    setPrompterInput('');
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

        {/* COL 2: 트렌드 통계 + Completed Sales */}
        <StatsPanel
          trends={trends}
          completedSales={completedSales}
          pendingSalesCount={pendingSales.length}
          onRematch={handleRematchPending}
          onClearCompletedSales={() => { setCompletedSales([]); setPendingSales([]); }}
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
            onDownloadReport={() => socket?.send(JSON.stringify({ type: 'EXPORT_DATA' }))}
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
