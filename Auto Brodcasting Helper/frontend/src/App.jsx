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

// =============================================
// 공지/빠른전송 설정 localStorage 영속화
// =============================================
const ANNOUNCER_STORE_KEY = 'gripbot_announcer_v1';
function loadAnnouncerStore() {
  try { return JSON.parse(localStorage.getItem(ANNOUNCER_STORE_KEY)) || {}; } catch { return {}; }
}
const STORED = loadAnnouncerStore();

// 플랫폼 집계형 참여 문구: "OOO님 외 N명이 저요!" / "OOO님 외 N명이 추첨에 참여했습니다." 등
// 프롬프터(태블릿/TV)·핫키워드 집계와 동일한 패턴 — 메인 대시보드 채팅 표시에도 동일하게 적용
const AGGREGATE_PARTICIPATION_REGEX = /(님\s*외\s*\d+\s*명이\s*저요[!~\s]*$)|(님\s*외\s*\d+\s*명이\s*추첨에\s*참여했습니다\.?\s*$)|(^추첨에\s*참여했습니다\.?\s*$)/;

// 직원 계정 채팅 — 핫키워드 집계에서만 제외 (일반 시청자 발화가 아니라 랭킹을 왜곡함)
const STAFF_NICKNAMES = new Set(['마녀옷장_AI', '마녀맨']);

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [trends, setTrends] = useState([]);

  // 전체 채팅 보관 (화면 200개 제한과 무관 — 다운로드/시간창 집계용)
  const fullChatLogRef = React.useRef([]);
  const [trendWindowMin, setTrendWindowMin] = useState(3); // 핫키워드 집계 범위(분)
  const [trendTick, setTrendTick] = useState(0); // 채팅이 없어도 시간창이 슬라이드되도록 주기 갱신
  const [chatViewMode, setChatViewMode] = useState('PURE'); // 'NORMAL' | 'PURE' — 순수채팅모드: SYSTEM 안내 제외 (기본 적용)
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
  const [announcerCountdown, setAnnouncerCountdown] = useState(STORED.interval ?? 60);
  const [nextAutoMsg, setNextAutoMsg] = useState('Next Auto Message...');
  const [isAnnouncerModalOpen, setIsAnnouncerModalOpen] = useState(false);

  // Announcer Settings (설정창에서 변경 가능 · localStorage 자동 복원)
  const [announcerInterval, setAnnouncerInterval] = useState(STORED.interval ?? 60);
  const [announcerTemplates, setAnnouncerTemplates] = useState(STORED.templates ?? ['', '', '']);
  const [announcerOrder, setAnnouncerOrder] = useState(STORED.order ?? '1, 2, 3');
  const [announcerPresets, setAnnouncerPresets] = useState(STORED.presets ?? [
    { enabled: false, text: '🔥 지금 {name} 특가 진행 중! {price}에 만나보세요 🛍️' },
    { enabled: false, text: '⏰ 오늘만! {name} {remaining}개 남았어요. 서두르세요!' },
    { enabled: false, text: '✨ {brand} {name} — {k1} {k2} 지금 바로 확인하세요 📦' },
  ]);

  // 빠른 전송 버튼 (개별 타이머 지원 · localStorage 자동 복원)
  const [quickSends, setQuickSends] = useState(STORED.quickSends ?? [
    { label: '무배', text: '', timerOn: false, intervalSec: 300 },
    { label: '증정', text: '', timerOn: false, intervalSec: 300 },
    { label: '배송', text: '', timerOn: false, intervalSec: 300 },
  ]);
  const [minGapSec, setMinGapSec] = useState(STORED.minGapSec ?? 15); // 자동전송 간 최소 간격(초)
  const [quickCountdowns, setQuickCountdowns] = useState([0, 0, 0]);

  // 제품 변경 시 자동 발송 (유통기한 등 간단 안내) — N회만 발송하고 자동 정지, 계속 롤링 안 함
  const [productChangeAnnounce, setProductChangeAnnounce] = useState(STORED.productChangeAnnounce ?? {
    enabled: false, text: '', repeatCount: 2, intervalSec: 8,
  });

  // Announcer Refs (setInterval 내부에서 최신 state 접근용)
  const announcerEnabledRef = React.useRef(false);
  const announcerIntervalRef = React.useRef(STORED.interval ?? 60);
  const announcerTemplatesRef = React.useRef(STORED.templates ?? ['', '', '']);
  const announcerPresetsRef = React.useRef([]);
  const templateIndexRef = React.useRef(0);

  // 통합 스케줄러 Refs
  const quickSendsRef = React.useRef([]);
  const minGapRef = React.useRef(STORED.minGapSec ?? 15);
  const quickRemainRef = React.useRef([]); // 항목별 남은 초
  const lastAutoSendTsRef = React.useRef(0); // 마지막 자동 발송 시각
  const sendQueueRef = React.useRef([]); // 발송 대기 큐 ('ROTATION' | 'QS0'... | 'PRODCHANGE')

  // 제품 변경 자동 발송 상태: remaining=남은 발송 횟수, nextFireAt=다음 발송 예정 시각(ms)
  const productChangeAnnounceRef = React.useRef(productChangeAnnounce);
  const productChangeStateRef = React.useRef({ remaining: 0, nextFireAt: 0 });
  const lastProductKeyRef = React.useRef(null); // 마지막으로 감지한 제품 식별자(변경 감지용)

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
  const scannerModeRef = React.useRef('AUTO');
  useEffect(() => { scannerModeRef.current = scannerMode; }, [scannerMode]);
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
  // 제품 선택 리모콘 — 셀러가 추천한 제품 코드(30초 후 자동 해제). 접속은 고정 링크 + PIN.
  const [suggestedProductId, setSuggestedProductId] = useState(null);
  const suggestedTimeoutRef = React.useRef(null);

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
  useEffect(() => { quickSendsRef.current = quickSends; }, [quickSends]);
  useEffect(() => { minGapRef.current = minGapSec; }, [minGapSec]);
  useEffect(() => { productChangeAnnounceRef.current = productChangeAnnounce; }, [productChangeAnnounce]);

  // [버그 수정] 사이클 진행 중 토글을 끄면 남은 카운트가 안 지워져서, 다시 켜기 전까지
  // 매 간격마다 빈 발송 시도가 큐를 계속 차지해 다른 자동공지가 밀리던 문제 — 끄는 즉시 리셋.
  useEffect(() => {
    if (!productChangeAnnounce.enabled) {
      productChangeStateRef.current = { remaining: 0, nextFireAt: 0 };
    }
  }, [productChangeAnnounce.enabled]);

  // 제품 변경 감지 → 활성화돼있으면 N회 발송 사이클 시작 (기존 사이클은 새 제품으로 리셋)
  // 첫 메시지는 감지 즉시가 아니라 3초 후 발송 (셀러가 제품을 들어보일 시간 확보)
  useEffect(() => {
    const key = selectedProduct ? (selectedProduct.id || selectedProduct.code || selectedProduct.name) : null;
    if (key === lastProductKeyRef.current) return; // 실제로 바뀐 게 아니면 무시(리렌더 등)
    lastProductKeyRef.current = key;
    if (key && productChangeAnnounceRef.current.enabled && productChangeAnnounceRef.current.text?.trim()) {
      productChangeStateRef.current = { remaining: productChangeAnnounceRef.current.repeatCount || 2, nextFireAt: Date.now() + 3000 };
    } else {
      productChangeStateRef.current = { remaining: 0, nextFireAt: 0 };
    }
  }, [selectedProduct]);

  // 설정 변경 시 localStorage 자동 저장 (새로고침해도 유지)
  useEffect(() => {
    try {
      localStorage.setItem(ANNOUNCER_STORE_KEY, JSON.stringify({
        interval: announcerInterval,
        templates: announcerTemplates,
        order: announcerOrder,
        presets: announcerPresets,
        quickSends,
        minGapSec,
        productChangeAnnounce,
      }));
    } catch (e) { /* 저장 실패는 무시 (시크릿 모드 등) */ }
  }, [announcerInterval, announcerTemplates, announcerOrder, announcerPresets, quickSends, minGapSec, productChangeAnnounce]);

  // 핫키워드 시간창 슬라이드용 주기 갱신 (20초)
  useEffect(() => {
    const t = setInterval(() => setTrendTick(x => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

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

  // 제품 데이터 변경 시 selectedProduct 최신화 (코드 수정/판매수량 변경 후 ref stale 방지)
  useEffect(() => {
    if (!selectedProduct) return;
    const current = products.find(p =>
      (p.id && p.id === selectedProduct.id) || (!p.id && p.name === selectedProduct.name)
    );
    if (!current) return;
    if (current.code !== selectedProduct.code ||
        current.sales !== selectedProduct.sales ||
        current.stock !== selectedProduct.stock) {
      setSelectedProduct(current);
      selectedProductRef.current = current;
    }
  }, [products]);

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
  // [개선] 개수 기준(최근 200개) → 시간창 기준(최근 N분)
  // 채팅 속도와 무관하게 항상 "지금"의 키워드를 집계하고,
  // 직전 시간창과 비교해 증감(delta)을 표시합니다.
  // =============================================
  useEffect(() => {
    const STOPWORDS = new Set([
      'ㅋ','ㅋㅋ','ㅋㅋㅋ','ㅋㅋㅋㅋ','ㅎ','ㅎㅎ','ㅎㅎㅎ','ㅠ','ㅠㅠ','ㅜ','ㅜㅜ','ㅇ','ㅇㅇ','ㄷㄷ',
      '네','넵','예','아','오','우','음','와','야','어','응','헐','대박','와우','우와',
      '이','그','저','제','을','를','가','은','는','에','의','도','과','와','로','에서','에게',
      '감사','감사합니다','감사해요','고마워','고맙습니다','ㄳ',
      '안녕','안녕하세요','반가워요','반갑습니다',
      '진짜','정말','완전','너무','많이','그냥','약간','좀',
      '같아','같은','같이','있어','없어','보여','이거','저거','그거',
      '개','명','번','회','원','분','초','저요','저요!','저요!!',
      // [실측 반영] 제품/주제 정보가 없는 순수 정형 질문·요청 어미 — 토큰 단독으로는 의미 없음
      '되나요','되요','돼요','되나','그런가요','그래요','그렇군요','진짜요',
      '부탁드려요','부탁드립니다','부탁드릴게요','부탁해요','부탁드림',
      '몇알이에요','몇개예요','몇개인가요','몇명이에요','어떻게해요','어떻게하나요',
      // [2차 실측 반영] 7/18·7/19 방송(9.6만건) 분석 — 주제 정보 없는 시간 표현/범용 서술어.
      // 진행자 호칭("언니"/"마녀님")은 의도적으로 목록에서 제외(사용자 확인).
      '오늘','내일','어제','저녁에','지금',
      '좋아요','있어요','했어요','혹시',
      // [3차 실측 반영] "해주세요"(558건)를 실제로 뜯어보니 릴릴(88)/선스틱(82)/들깨크림(34) 등
      // 완전히 다른 요청들이 우연히 같은 단어를 써서 뭉쳐진 것뿐 — 주어 없이 단독 노출되면
      // "몇 명이 요청했는지"만 보일 뿐 "뭘 요청했는지"는 알 수 없어 사실상 무의미함.
      // 제품명과 정확히 묶어 보여줄 방법이 없는 한 노출 자체가 오히려 오해를 유발해 제외.
      '해주세요','해줘요','있나요','하나요','제발','주세요',
    ]);

    // [실측 반영] "사고"는 REACTION_PATTERN의 "사고싶"(구매욕구 반응)을 가로채는 문제가 확인돼 제외.
    // 실측 21건 검토 결과 "사고" 단독으로 진짜 구매 문의로 쓰인 사례는 없었음.
    const QUERY_PATTERN = /[?？]|어디|얼마|있나|없나|어때|뭐예|무엇|언제|어떻게|구매|살수|파나요|살게|성분|효과|사이즈|용량|배송|재고|후기|사용법|추천|비교/;
    const REACTION_PATTERN = /저요|최고|짱|신기|이쁘|예쁘|좋아|좋네|좋겠|갖고싶|사고싶|👍|❤|💕|😍|🔥|대박|헐|놀라|완전좋/;

    // [실측 검증] 실제 방송 로그 1727건 분석 결과, 조사가 붙은 상태로 토큰화되어
    // 같은 단어("대왕김치"/"대왕김치랑"/"대왕김치는요" 등)가 최대 5개로 쪼개지는 현상 확인.
    // 접미어 트리밍만으로 "대왕김치" 8위→5위, "물만두" 7위→4위로 순위 개선 검증됨.
    const JOSA_SUFFIXES = ['이라서', '에서는', '에게는', '으로는', '까지는', '부터는',
      '이라도', '으로도', '에서도', '이랑', '과는', '와는', '은요', '는요', '이요', '도요',
      '으로', '에서', '에게', '부터', '까지', '이나', '나요', '인가요', '인가욤', '인가여',
      '은', '는', '이', '가', '을', '를', '도', '만', '과', '와', '로', '나', '랑'
    ].sort((a, b) => b.length - a.length);

    // [실측 재검증] "못난이"(81건 언급된 실제 제품 별칭)가 "못난"+"이"로 잘못 분리되는
    // 오탐 발견 — 한국어는 "이" 지소사(애칭 접미사)와 주격조사 "이"가 동형이라 구분 불가.
    // 잔여 길이 기준을 2→3으로 올려 2음절+조사 패턴만 남기고 실제 고유명사는 보존.
    const stripJosa = (word) => {
      if (word.length <= 2) return word;
      for (const j of JOSA_SUFFIXES) {
        if (word.endsWith(j) && word.length - j.length >= 3) return word.slice(0, -j.length);
      }
      return word;
    };

    // [노이즈 필터] 등장 횟수가 아니라 "몇 명이 말했는가"로 집계하되,
    // 한 사람의 반복도 KEYWORD_REPEAT_CAP회까지는 인정(완전 무시하지 않음).
    // 1로 두면 순수 인원수 집계, 값을 올릴수록 반복 발화의 비중이 커짐.
    const KEYWORD_REPEAT_CAP = 3;
    // [1순위 — 실측 확인된 버그] "OOO님 외 N명이 저요!" / "OOO님 외 N명이 추첨에 참여했습니다."
    // 같은 플랫폼 집계 문구가 토큰화되어 "추첨에"(266~357명), "참여했습니다", "N명이" 등이
    // 실제로는 아무 주제 정보가 없는데도 TOP 순위를 그대로 차지하던 문제. 통째로 제외.
    // [재검증] 닉네임에 공백이 섞인 경우("행복한 날들만 가득님" 등) ^\S+ 로는 못 잡던 걸
    // 발견해 님/외/명이 패턴 자체로 재작성 — 실측 273/371건 전량 매칭 확인.
    const AGGREGATE_PARTICIPATION = /(님\s*외\s*\d+\s*명이\s*저요[!~\s]*$)|(님\s*외\s*\d+\s*명이\s*추첨에\s*참여했습니다\.?\s*$)|(^추첨에\s*참여했습니다\.?\s*$)/;
    const computeFreq = (msgs) => {
      const freqMap = new Map(); // key -> Map(닉네임 -> 등장횟수)
      msgs.forEach(msg => {
        if (!msg.message || msg.intent === 'BOT_REPLY' || msg.nickname === 'SYSTEM') return;
        if (msg.nickname && STAFF_NICKNAMES.has(msg.nickname)) return;
        if (AGGREGATE_PARTICIPATION.test(msg.message.trim())) return;
        const isQuery = QUERY_PATTERN.test(msg.message);
        const isParticipation = !isQuery && (msg.intent === 'BUY' || REACTION_PATTERN.test(msg.message));
        const category = isQuery ? 'QUERY' : isParticipation ? 'PARTICIPATION' : 'QUERY';

        const tokens = msg.message
          .replace(/[^가-힣ㄱ-ㆎa-zA-Z0-9\s]/g, ' ')
          .split(/\s+/)
          .map(w => stripJosa(w.trim()))
          .filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

        const nickname = msg.nickname || '익명';
        tokens.forEach(word => {
          const key = word + '::' + category;
          if (!freqMap.has(key)) freqMap.set(key, new Map());
          const personMap = freqMap.get(key);
          personMap.set(nickname, (personMap.get(nickname) || 0) + 1);
        });
      });
      return freqMap;
    };

    const sumCapped = (personMap) =>
      Array.from(personMap.values()).reduce((sum, c) => sum + Math.min(c, KEYWORD_REPEAT_CAP), 0);

    const now = Date.now();
    const winMs = trendWindowMin * 60000;
    const all = fullChatLogRef.current;
    const currentMsgs = all.filter(m => (m.ts || 0) >= now - winMs);
    const prevMsgs = all.filter(m => (m.ts || 0) >= now - 2 * winMs && (m.ts || 0) < now - winMs);

    if (currentMsgs.length === 0) { setTrends([]); return; }

    const curMap = computeFreq(currentMsgs);
    const prevMap = computeFreq(prevMsgs);

    // [가중치] 제품코드/제품명/브랜드가 언급된 키워드는 실제 구매신호이므로 ×1.8 가중
    // ("ㅋㅋ" 같은 반응 키워드는 그대로 두되, 재미요소로 랭킹엔 남음 — 사용자 확인)
    const PRODUCT_MATCH_BOOST = 1.8;
    const currentProducts = productsRef.current || [];
    const isProductMatch = (term) => currentProducts.some(p =>
      (p.code && p.code.toLowerCase() === term.toLowerCase()) ||
      (p.name && p.name.includes(term)) ||
      (p.brand && p.brand.trim() && p.brand.includes(term))
    );

    const result = Array.from(curMap.entries())
      .map(([key, personMap]) => {
        const sep = key.lastIndexOf('::');
        const term = key.slice(0, sep);
        const baseFreq = sumCapped(personMap); // 1인당 최대 KEYWORD_REPEAT_CAP회까지만 인정
        const matched = isProductMatch(term);
        const frequency = matched ? Math.round(baseFreq * PRODUCT_MATCH_BOOST) : baseFreq;
        const prevPersonMap = prevMap.get(key);
        const prevBaseFreq = prevPersonMap ? sumCapped(prevPersonMap) : 0;
        const prevFreq = matched ? Math.round(prevBaseFreq * PRODUCT_MATCH_BOOST) : prevBaseFreq;
        const delta = prevFreq === 0 ? 'new' : frequency > prevFreq ? 'up' : frequency < prevFreq ? 'down' : 'same';
        return { term, frequency, category: key.slice(sep + 2), delta, isProductMatch: matched };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 30);

    setTrends(result);
  }, [messages, trendWindowMin, trendTick]);

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
  // 템플릿 태그 치환 (전체 순환 · 빠른전송 공용)
  // =============================================
  const resolveAutoTemplate = (template, snippetIdx = 0) => {
    if (!template) return '';
    const product = selectedProductRef.current;
    const keywords = Array.isArray(product?.keywords)
      ? product.keywords.map(k => String(k).replace(/^#/, '').trim()).filter(k => k)
      : [];
    const snippet = keywords.length > 0 ? keywords[snippetIdx % keywords.length] : '';
    const priceStr = product?.price ? `₩${Number(product.price).toLocaleString()}` : '';
    const remaining = product?.stock != null
      ? String((product.stock || 0) - (product.sales || 0)) : '';

    let msg = template
      .replace('{name}',      product?.name    || '(상품 미선택)')
      .replace('{expiry}',    product?.expiry  || '')
      .replace('{brand}',     product?.brand   || '')
      .replace('{price}',     priceStr)
      .replace('{stock}',     String(product?.stock ?? ''))
      .replace('{remaining}', remaining)
      .replace('{code}',      product?.code    || '')
      .replace('{snippet}',   snippet);
    keywords.forEach((kw, i) => { msg = msg.replaceAll(`{k${i + 1}}`, kw); });
    return msg.replace(/\{k\d+\}/g, '');
  };

  const sendAutoChat = (msg) => {
    if (socketRef.current?.readyState === 1) {
      socketRef.current.send(JSON.stringify({
        type: 'SEND_CHAT',
        message: msg,
        requestId: Date.now().toString()
      }));
      return true;
    }
    return false;
  };

  // 템플릿에 사용된 태그 중 실제 값이 비어있는 게 있으면 그 태그 이름들을 반환 (없으면 빈 배열)
  // — "화장품1 유통기한 까지입니다" 처럼 빈칸 있는 메시지가 그대로 나가는 걸 막기 위함
  const findEmptyReferencedTags = (template, product) => {
    const empty = [];
    const fieldMap = { name: product?.name, expiry: product?.expiry, brand: product?.brand, code: product?.code };
    Object.keys(fieldMap).forEach(key => {
      if (template.includes(`{${key}}`) && !fieldMap[key]) empty.push(key);
    });
    if (template.includes('{price}') && !product?.price) empty.push('price');
    if (template.includes('{stock}') && !product?.stock) empty.push('stock');
    if (template.includes('{remaining}') && product?.stock == null) empty.push('remaining');
    const keywords = Array.isArray(product?.keywords) ? product.keywords : [];
    if (template.includes('{snippet}') && keywords.length === 0) empty.push('snippet');
    (template.match(/\{k\d+\}/g) || []).forEach(tag => {
      const idx = parseInt(tag.match(/\d+/)[0], 10) - 1;
      if (!keywords[idx]) empty.push(tag);
    });
    return empty;
  };

  // 전체 순환 공지 1건 발송 (템플릿 없으면 null)
  const fireRotationMessage = () => {
    const customTemplates = announcerTemplatesRef.current.filter(t => t.trim());
    const presetTemplates = announcerPresetsRef.current
      .filter(p => p.enabled && p.text?.trim())
      .map(p => p.text);
    const allTemplates = [...customTemplates, ...presetTemplates];
    if (allTemplates.length === 0) return null;

    const msg = resolveAutoTemplate(
      allTemplates[templateIndexRef.current % allTemplates.length],
      templateIndexRef.current
    );
    templateIndexRef.current = (templateIndexRef.current + 1) % allTemplates.length;
    setNextAutoMsg(msg);
    sendAutoChat(msg);
    return msg;
  };

  // =============================================
  // 통합 자동전송 스케줄러 (1초 틱 하나로 전체 관리)
  // - 전체 순환 공지 + 빠른전송 개별 타이머를 하나의 발송 큐로 통합
  // - 최소 간격(minGapSec) 보장: 동시에 도래해도 순차 발송 → 채팅 도배 방지
  // - 타이머 리셋은 "실제 발송 시각" 기준 → 밀림 누적 없음
  // =============================================
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      // ── 1) 전체 순환 카운트다운 ──
      if (!announcerEnabledRef.current) {
        setAnnouncerCountdown(announcerIntervalRef.current);
        sendQueueRef.current = sendQueueRef.current.filter(s => s !== 'ROTATION');
      } else {
        setAnnouncerCountdown(prev => {
          if (prev <= 1) {
            // 도래 → 큐 삽입 후 0에서 대기 (실제 발송 시 리셋)
            if (!sendQueueRef.current.includes('ROTATION')) sendQueueRef.current.push('ROTATION');
            return 0;
          }
          return prev - 1;
        });
      }

      // ── 2) 빠른전송 개별 카운트다운 ──
      const qs = quickSendsRef.current;
      const remain = quickRemainRef.current;
      qs.forEach((item, i) => {
        const id = 'QS' + i;
        if (!item.timerOn || !item.text?.trim()) {
          remain[i] = item.intervalSec || 0;
          sendQueueRef.current = sendQueueRef.current.filter(s => s !== id);
          return;
        }
        if (remain[i] == null || remain[i] > (item.intervalSec || 0)) remain[i] = item.intervalSec;
        if (remain[i] <= 1) {
          if (!sendQueueRef.current.includes(id)) sendQueueRef.current.push(id);
          remain[i] = 0;
        } else {
          remain[i] = remain[i] - 1;
        }
      });
      setQuickCountdowns([...remain]);

      // ── 2.5) 제품 변경 자동 발송: 남은 횟수가 있고 예정 시각이 됐으면 큐에 삽입 ──
      const pca = productChangeStateRef.current;
      if (pca.remaining > 0 && now >= pca.nextFireAt) {
        if (!sendQueueRef.current.includes('PRODCHANGE')) sendQueueRef.current.push('PRODCHANGE');
      }

      // ── 3) 발송 큐: 최소 간격 충족 시 1건씩 방출 ──
      if (sendQueueRef.current.length > 0 &&
          (now - lastAutoSendTsRef.current) >= minGapRef.current * 1000) {
        const src = sendQueueRef.current.shift();
        if (src === 'ROTATION') {
          const sent = fireRotationMessage();
          if (sent !== null) lastAutoSendTsRef.current = now;
          setAnnouncerCountdown(announcerIntervalRef.current);
        } else if (src === 'PRODCHANGE') {
          const cfg = productChangeAnnounceRef.current;
          const state = productChangeStateRef.current;
          const currentProduct = selectedProductRef.current;
          const emptyTags = (cfg.enabled && cfg.text?.trim())
            ? findEmptyReferencedTags(cfg.text, currentProduct)
            : [];
          if (emptyTags.length > 0) {
            // 값이 비어있는 태그가 있으면 발송 패스 — 제품이 안 바뀌는 한 다시 시도해도
            // 똑같이 비어있을 것이므로 이번 제품에 대한 사이클은 통째로 취소
            console.log(`⏭️ [제품변경 자동발송] 빈 태그(${emptyTags.join(', ')})로 인해 패스`);
            state.remaining = 0;
          } else if (cfg.enabled && cfg.text?.trim()) {
            sendAutoChat(resolveAutoTemplate(cfg.text));
            lastAutoSendTsRef.current = now;
            state.remaining = Math.max(0, state.remaining - 1);
            state.nextFireAt = now + (cfg.intervalSec || 8) * 1000;
          }
        } else {
          const i = Number(src.slice(2));
          const item = quickSendsRef.current[i];
          if (item?.text?.trim()) {
            sendAutoChat(resolveAutoTemplate(item.text));
            lastAutoSendTsRef.current = now;
          }
          quickRemainRef.current[i] = item?.intervalSec || 60;
        }
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 한 번만 실행

  // 빠른전송 수동 탭: 즉시 발송 + 해당 타이머 리셋 (직후 자동 재발송 방지)
  const handleQuickSend = (i) => {
    const item = quickSends[i];
    if (!item?.text?.trim()) {
      showToast('⚙ 설정에서 빠른전송 문구를 먼저 입력하세요.', 'error');
      setIsAnnouncerModalOpen(true);
      return;
    }
    const msg = resolveAutoTemplate(item.text);
    if (sendAutoChat(msg)) {
      lastAutoSendTsRef.current = Date.now();
      quickRemainRef.current[i] = item.intervalSec || 60;
      showToast(`⚡ [${item.label}] 전송 완료`, 'success');
    } else {
      showToast('서버 연결이 없어 전송하지 못했습니다.', 'error');
    }
  };

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

      // ── 제품 선택 리모콘 ────────────────────────
      case 'REMOTE_PICKER_JOINED':
        // 새 리모콘 접속 시 지금 제품 목록을 즉시 재전송 (products 자체는 안 바뀌었을 수 있음)
        if (socketRef.current?.readyState === 1) {
          socketRef.current.send(JSON.stringify({
            type: 'PRODUCTS_FULL_SYNC',
            data: {
              // CODE는 비어있을 수 있어 여러 제품이 같은 값(빈 문자열)을 가질 수 있음 —
              // 항상 고유한 내부 id를 식별자로 사용 (id는 제품 생성 시 항상 자동 부여됨)
              products: productsRef.current.map(p => ({ id: p.id, code: p.code, name: p.name, brand: p.brand || '', price: p.price || 0 }))
            }
          }));
        }
        break;
      case 'SUGGEST_PRODUCT': {
        const productId = payload.data?.id;
        if (!productId) break;
        setSuggestedProductId(productId);
        const target = productsRef.current.find(p => p.id === productId);
        if (target) {
          const el = document.getElementById(`product-row-${target.id || target.code}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (suggestedTimeoutRef.current) clearTimeout(suggestedTimeoutRef.current);
        suggestedTimeoutRef.current = setTimeout(() => setSuggestedProductId(null), 30000);
        break;
      }

      // ── 연결 유지 (Heartbeat) ──────────────────
      case 'PING':
        socketRef.current?.send(JSON.stringify({ type: 'PONG' }));
        break;

      // ── 채팅 메시지 ───────────────────────────
      case 'CHAT_MSG':
      case 'SALES_UPDATE': {
        const d = payload.data;
        const now_cm = Date.now();
        // 중복 검사: 전체 보관 로그의 최근 항목과 대조 (화면 배열과 무관하게 일관 유지)
        const recentLog = fullChatLogRef.current.slice(-30);
        const isDuplicate = recentLog.some(m =>
          m.nickname === d.nickname &&
          m.message === d.message &&
          (now_cm - (m.ts || 0) < 2000)
        );
        if (isDuplicate) break;

        const newMsg = { ...d, ts: d.ts || now_cm };

        // 구매 감지
        const purchaseRegex = /저요|(\d+\s*개)/;
        if (purchaseRegex.test(newMsg.message)) {
          newMsg.intent = 'BUY';
        } else {
          if (newMsg.intent === 'BUY') newMsg.intent = 'CHAT';
        }

        fullChatLogRef.current.push(newMsg); // 전체 보관 (다운로드/키워드 집계용)
        setMessages(prev => [...prev.slice(-199), newMsg]);
        break;
      }

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

        {
          const botMsg_fw = {
            nickname: '🤖 BOT',
            message: `📢 [판매종료] 당첨자 ${winnerCount}명 집계 완료!`,
            intent: 'BOT_REPLY', ts: Date.now()
          };
          fullChatLogRef.current.push(botMsg_fw);
          setMessages(prev => [...prev.slice(-199), botMsg_fw]);
        }
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
      case 'BOT_REPLY': {
        const now_br = Date.now();
        const recentBr = fullChatLogRef.current.slice(-30);
        const isDupBr = recentBr.some(m =>
          m.nickname === '🤖 BOT' &&
          m.message === payload.data.replyText &&
          (now_br - (m.ts || 0) < 2000)
        );
        if (isDupBr) break;
        const botMsg_br = {
          nickname: '🤖 BOT',
          message: payload.data.replyText,
          intent: 'BOT_REPLY',
          keywords: [],
          ts: now_br
        };
        fullChatLogRef.current.push(botMsg_br);
        setMessages(prev => [...prev.slice(-199), botMsg_br]);
        break;
      }

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

      // ── 바코드 스캐너 ─────────────────────────
      case 'SCANNER_CODE': {
        const scannedCode = payload.data?.code;
        if (!scannedCode) break;

        const sendScannerResult = (matched, productName = '') => {
          socketRef.current?.send(JSON.stringify({
            type: 'SCANNER_RESULT',
            data: { matched, productName, code: scannedCode }
          }));
        };

        if (scannerModeRef.current === 'AUTO') {
          // AUTO: code 우선 매칭(항상) → barcode 매칭(autoMatchEnabled ON일 때만)
          const matched = productsRef.current.find(p => p.code && p.code === scannedCode) ||
                          (autoMatchRef.current && productsRef.current.find(p => p.barcode && p.barcode === scannedCode));
          if (matched) {
            handleSelectProduct(matched);
            showToast(`✅ 스캔 매칭: ${matched.name}`, 'success');
            sendScannerResult(true, matched.name);
          } else {
            showToast(`⚠️ 미등록 바코드: ${scannedCode}`, 'error');
            sendScannerResult(false);
          }
        } else {
          // MANUAL: 현재 선택된 제품에 바코드 등록
          const sel = selectedProductRef.current;
          if (!sel) {
            showToast('⚠️ 먼저 제품을 선택하세요.', 'error');
            sendScannerResult(false);
            break;
          }
          if (sel.barcode) {
            showToast(`ℹ️ 이미 바코드 등록됨: ${sel.barcode}`, 'info');
            sendScannerResult(true, sel.name);
            break;
          }
          const updated = productsRef.current.map(p =>
            p.id === sel.id ? { ...p, barcode: scannedCode } : p
          );
          setProducts(updated);
          const updatedSel = { ...sel, barcode: scannedCode };
          selectedProductRef.current = updatedSel;
          setSelectedProduct(updatedSel);
          showToast(`✅ [${sel.name}] 바코드 등록: ${scannedCode}`, 'success');
          sendScannerResult(true, sel.name);
        }
        break;
      }

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

  // 영상창(그립 라이브 스니퍼 창)의 현재 크기/위치를 저장 — 다음 실행부터 자동 복원
  const handleSaveVideoWindow = () => {
    if (!socket) return;
    socket.send(JSON.stringify({ type: 'SAVE_VIDEO_WINDOW' }));
  };

  // 프롬프터창(TV 모드)의 현재 크기/위치를 저장 — 다음 실행부터 자동 복원
  const handleSavePrompterWindow = () => {
    if (!socket) return;
    socket.send(JSON.stringify({ type: 'SAVE_PROMPTER_WINDOW' }));
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    const requestId = Date.now().toString();
    socket.send(JSON.stringify({ type: 'SEND_CHAT', message: chatInput, requestId }));
  };

  const handleUpdateProduct = (idOrCode, field, value) => {
    setProducts(prev => {
      const updated = prev.map(p => {
        // idOrCode가 빈 문자열이면 코드 기반 매칭 금지 (빈 코드 제품 전체 오매칭 방지)
        if (p.id && p.id === idOrCode) return { ...p, [field]: value };
        if (!p.id && idOrCode && p.code === idOrCode) return { ...p, [field]: value };
        return p;
      });
      productsRef.current = updated; // CART_EVENT race condition 방지: ref 즉시 동기화
      return updated;
    });
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

  // 태블릿 프롬프터 "🏆 TOP 정보" 탭 동기화
  // 키워드 집계(STOPWORDS·조사 처리 등)는 여기서만 계산하고, 프롬프터는 결과만 받아 표시.
  // 로직을 두 파일에 중복 구현하면 튜닝할 때마다 어긋나므로 단일 소스로 유지.
  useEffect(() => {
    if (socketRef.current?.readyState === 1) {
      const topProducts = products
        .filter(p => (p.sales || 0) > 0)
        .map(p => ({ code: p.code, name: p.name, sales: p.sales || 0, price: p.price || 0 }));

      socketRef.current.send(JSON.stringify({
        type: 'TOP_STATS_SYNC',
        data: {
          topProducts,
          keywordsQuery: trends.filter(t => t.category === 'QUERY').slice(0, 5),
          keywordsReaction: trends.filter(t => t.category === 'PARTICIPATION').slice(0, 5),
        }
      }));
    }
  }, [products, trends]);

  // 제품 선택 리모콘: 전체 제품 목록(판매 여부 무관) 동기화
  useEffect(() => {
    if (socketRef.current?.readyState === 1) {
      socketRef.current.send(JSON.stringify({
        type: 'PRODUCTS_FULL_SYNC',
        data: {
          products: products.map(p => ({ id: p.id, code: p.code, name: p.name, brand: p.brand || '', price: p.price || 0 }))
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
    const selRef = selectedProductRef.current;
    if (!selRef) {
      showToast('⚠️ 제품을 먼저 선택해주세요.', 'error');
      return;
    }

    // selectedProductRef가 stale할 수 있으므로 productsRef에서 최신 상태로 조회
    const product = productsRef.current.find(p =>
      (p.id && p.id === selRef.id) || (!p.id && p.name === selRef.name)
    );
    if (!product) {
      showToast('⚠️ 제품을 먼저 선택해주세요.', 'error');
      return;
    }

    // 해당 코드가 이미 다른 제품에 등록된 경우 차단 (코드 수정 후 배너 오클릭 방지)
    const existingOwner = productsRef.current.find(p => p.code === code);
    if (existingOwner && existingOwner.id !== product.id) {
      showToast(`⚠️ 코드 "${code}"는 이미 [${existingOwner.name}]에 등록된 코드입니다.\n해당 제품을 선택 후 진행하세요.`, 'error');
      return;
    }

    const matchingLogs = salesLogsRef.current.filter(l => l.code === code && !l.applied);
    const totalCount = matchingLogs.reduce((sum, l) => sum + l.count, 0);

    setProducts(prev => {
      const updated = prev.map(p => {
        const isTarget = p.id ? p.id === product.id : (p.name === product.name);
        return isTarget ? { ...p, code, sales: (p.sales || 0) + totalCount } : p;
      });
      productsRef.current = updated;
      return updated;
    });

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
    const allChat = fullChatLogRef.current; // 전체 채팅 (화면 200개 제한과 무관)
    if (allChat.length === 0 && products.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);

    const wb = XLSX.utils.book_new();

    // 시트 1: 채팅 로그 (전체 보관분)
    const chatSheet = XLSX.utils.aoa_to_sheet([
      ['#', '시간', '닉네임', '메시지', '인텐트'],
      ...allChat.map((m, i) => [
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

    // 시트 3: 브랜드별 집계 (매출 내림차순)
    const brandMap = new Map();
    products.forEach(p => {
      const brand = (p.brand || '').trim() || '(브랜드 미지정)';
      const sold = p.sales || 0;
      const entry = brandMap.get(brand) || { items: 0, qty: 0, revenue: 0 };
      entry.items += 1;
      entry.qty += sold;
      entry.revenue += (p.price || 0) * sold;
      brandMap.set(brand, entry);
    });
    const brandRows = Array.from(brandMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([brand, e], i) => [i + 1, brand, e.items, e.qty, e.revenue]);
    const totalQty = brandRows.reduce((s, r) => s + r[3], 0);
    const totalRev = brandRows.reduce((s, r) => s + r[4], 0);
    const brandSheet = XLSX.utils.aoa_to_sheet([
      ['#', '브랜드', '제품수', '총 판매수량', '총 매출액'],
      ...brandRows,
      ['', '합계', products.length, totalQty, totalRev],
    ]);
    XLSX.utils.book_append_sheet(wb, brandSheet, '브랜드별 집계');

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
        quickSends={quickSends}
        setQuickSends={setQuickSends}
        minGapSec={minGapSec}
        setMinGapSec={setMinGapSec}
        productChangeAnnounce={productChangeAnnounce}
        setProductChangeAnnounce={setProductChangeAnnounce}
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
            messages={messages.filter(m => {
              // 순수채팅모드: 시스템/선착순 안내 등 플랫폼 자동 메시지 제외 (nickname==='SYSTEM')
              if (chatViewMode === 'PURE' && m.nickname === 'SYSTEM') return false;
              // 집계형 참여 문구("OOO님 외 N명이 추첨에 참여했습니다." 등) 제외
              if (m.message && AGGREGATE_PARTICIPATION_REGEX.test(m.message.trim())) return false;
              return ['CHAT', 'INQUIRY', 'REACTION'].includes(m.intent) || !m.intent;
            })}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={sendChatMessage}
            announcerEnabled={announcerEnabled}
            onToggleAnnouncer={handleToggleAnnouncer}
            announcerCountdown={announcerCountdown}
            nextMessage={nextAutoMsg}
            onOpenAnnouncerSettings={() => setIsAnnouncerModalOpen(true)}
            quickSends={quickSends}
            quickCountdowns={quickCountdowns}
            onQuickSend={handleQuickSend}
            chatViewMode={chatViewMode}
            onToggleChatViewMode={() => setChatViewMode(v => v === 'NORMAL' ? 'PURE' : 'NORMAL')}
          />
        </div>

        {/* COL 2: 트렌드 통계 + 실시간 판매 로그 */}
          <StatsPanel
            trends={trends}
            salesLogs={salesLogs}
            products={products}
            onSelectProduct={handleSelectProduct}
            trendWindow={trendWindowMin}
            setTrendWindow={setTrendWindowMin}
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
              suggestedProductId={suggestedProductId}
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
            onSaveVideoWindow={handleSaveVideoWindow}
            onSavePrompterWindow={handleSavePrompterWindow}
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
