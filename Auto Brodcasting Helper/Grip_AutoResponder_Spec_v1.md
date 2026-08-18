# Grip 라이브 채팅 자동응답 시스템 기획안 (v1.0)

작성일: 2025-12-09  
작성자: (내부) OneBridge / Grip Auto Responder 프로젝트

---

## 1. 프로젝트 개요

### 1.1 목적

Grip 라이브 커머스 방송 중 올라오는 실시간 채팅을 **자동으로 감시·분류**하고,  
사전에 정의된 규칙에 따라 **자동으로 답변**하거나, **방송자/매니저에게 인사이트를 제공**하는 시스템.

초기 목표는 **“모든 채팅에 대응하는 챗봇”이 아니라**,  
- **제품 관련 문의와 반복 질문에만 집중**하고
- **실제 방송 진행을 보조하는 세미-자동 에이전트**를 만드는 것.

### 1.2 핵심 기능 (MVP 범위)

1. Grip 웹 방송 페이지에서 **실시간 채팅 감시 & 추출**
2. 채팅 메시지에 대해 **텍스트 분류**
   - 제품명 관련
   - 일반 문의(사이즈, 배송, 가격 등)
   - 의미 없는 채팅 / 잡담
3. 분류 결과에 따라 **자동응답 여부 결정**
4. 사전 세팅된 **키워드 & 응답 템플릿 기반 자동응답**
5. **중복 문의가 많은 제품/내용 TOP 리스트** 실시간 집계 & 화면 표시
6. 채팅 데이터 및 응답 내역을 **SQLite** 에 저장 (선택적 기능, ON/OFF 가능)
7. 응답 딜레이 / 동일 답변 Rate Limit 을 **사용자 설정 가능**

---

## 2. 기술 스택

### 2.1 백엔드 / 봇

- **Node.js** (v20 이상 권장)
- **Playwright** (`chromium` 사용)
  - Grip 라이브 방송 페이지 접속
  - DOM Hooking 으로 채팅 메시지 가로채기
- **WebSocket 서버 (ws)**  
  - 봇 → 프론트엔드로 실시간 채팅 스트림 전달
- **SQLite** (파일 DB)
  - 채팅 로그, 자동응답 로그, 키워드/응답 설정 저장

### 2.2 프론트엔드

- **React** (함수형 컴포넌트)
- **Vite** (개발/빌드 툴)
- **TailwindCSS**
- 상태 관리 (선택)
  - 초기: React `useState`, `useReducer`
  - 확장: Zustand 또는 Redux Toolkit

### 2.3 기타 / 운영

- **npm / pnpm**: 패키지 매니저
- **PM2** (추후)  
  - 봇 프로세스 상시 동작 / 자동 재시작
- 추후 연동 후보
  - **n8n**: 외부 자동화 / ERP 연동
  - **Supabase / PostgreSQL**: 대규모 로그/분석용

---

## 3. 아키텍처 개요

### 3.1 전체 구조

```text
[Grip Live 방송 페이지]
          ▲
          │ (Playwright - Chromium)
          │
[Node.js Bot (grip-bot)]
   ├─ 채팅 DOM Hook (nickname, message)
   ├─ 분류 엔진 (키워드 + 유사도)
   ├─ 자동응답 엔진 (딜레이 / rate limit)
   ├─ SQLite Logger
   └─ WebSocket Broadcaster
          │
          ▼
[React Dashboard (Vite + Tailwind)]
   ├─ Live Chat Viewer (실시간)
   ├─ 분류/응답 로그 뷰어
   ├─ 키워드 & 응답 템플릿 관리 UI
   └─ 인기 질문/제품 TOP 랭킹
```

### 3.2 데이터 플로우

1. Playwright가 Grip 방송 URL 접속
2. DOM Hooking 으로 `nickname`, `message`를 **실시간 캡처**
3. Bot 내부에서 메시지 → **전처리 & 분류**
4. 분류 결과에 따라:
   - 자동응답 대상 → 응답 텍스트 결정 → 딜레이 후 Grip 채팅창에 입력 & 전송
   - 의미 없는 채팅 → 무시 (로그만 저장)
5. 모든 메시지/응답은 SQLite에 저장 (선택)
6. 동시에 WebSocket 서버를 통해 프론트엔드로 **실시간 push**
7. React 대시보드는 이를 받아:
   - 실시간 채팅 스트림 표시
   - 분류결과 및 응답 여부 표시
   - 키워드/응답 설정 로드 & 수정

---

## 4. 기존 베이스코드 (핵심 Hook 코드)

### 4.1 Grip 채팅 DOM Hook (이미 검증된 코드)

```js
import playwright from "playwright";

const URL = "https://www.grip.show/content/o1mxylxo";

(async () => {
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("▶ 페이지 접속 중...");
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  console.log("✔ 페이지 로드 완료!");
  console.log("🧲 DOM Hooking 시작!");

  // Node에 메시지를 보내기 위한 Hook
  await page.exposeFunction("chatHook", (nickname, text) => {
    console.log(`💬 ${nickname}: ${text}`);
  });

  // appendChild Override Hook
  await page.evaluate(() => {
    const originalAppend = Element.prototype.appendChild;

    Element.prototype.appendChild = function (child) {
      try {
        if (child.classList?.contains("message-item")) {
          const nickname = child.querySelector(".nickname")?.innerText?.trim();
          const text = child.querySelector(".text")?.innerText?.trim();

          if (nickname && text) {
            // @ts-ignore
            window.chatHook(nickname, text);
          }
        }
      } catch (e) {}

      return originalAppend.call(this, child);
    };
  });

  console.log("🔥 채팅 감시 준비 완료. 채팅 올라오면 즉시 출력됩니다.");
})();
```

이 코드는 **실제 Grip 방송 페이지**에서 검증 완료된 베이스 코드이며,  
이 위에 **분류/응답/전송/로그/대시보드 연동**을 쌓아올릴 계획이다.

---

## 5. 기능 설계 (MVP 기준)

### 5.1 실시간 채팅 감시

- Grip 방송 URL을 설정 (환경변수 또는 설정 파일)
- Bot 시작 시 해당 URL 자동 접속
- DOM Hook을 통해 `nickname`, `message` 실시간 수신
- 내부 이벤트 스트림으로 메시지 전달:  
  `onChatMessage({ nickname, message, ts })`

### 5.2 채팅 분류 로직

#### 5.2.1 카테고리 정의

- `PRODUCT_RELATED` (제품명/옵션 언급)
- `QUESTION` (사이즈, 재고, 배송, 가격 등 문의)
- `NOISE` (이모지, 잡담, 감탄사, 게임 참여 메시지 등)

#### 5.2.2 분류 방식

- **키워드 기반 + 유사도 검색**

1. 키워드 사전
   - 제품 키워드 목록 (예: `["청록", "베이지", "후드", "#170", "슬리퍼"]`)
   - 문의 키워드 목록 (예: `["사이즈", "몇", "있나요", "언제", "배송", "재고", "가격", "할인"])
   - 의미 없는 패턴 (예: `"ㅋㅋ", "ㅎㅎ", "헐", "헉", 이모지 다수` 등)

2. 유사도 검색
   - 편집거리(Levenshtein) 또는 부분 일치 + 자모 분리 옵션
   - 예: `"사이즈요?"`, `"사이즈좀 알려줘요"`, `"방금 사이즈 뭐라하셨죠"` → 모두 `사이즈 문의`로 분류

3. 기본 알고리즘 (의사 코드)

```js
function classifyMessage(message) {
  if (matchesNoise(message)) return "NOISE";
  if (matchesProductKeyword(message)) return "PRODUCT_RELATED";
  if (matchesQuestionPattern(message)) return "QUESTION";
  return "NOISE";
}
```

### 5.3 자동응답 로직

#### 5.3.1 응답 트리거 조건

- `NOISE` → 응답 없음 (로그만)
- `PRODUCT_RELATED` → 해당 제품/옵션에 대한 안내 텍스트 (선택)
- `QUESTION` → 사전세팅된 규칙에 따라 응답

예시 규칙:

- 메시지에 `"사이즈"` 관련 ⇒ `SIZE_TEMPLATE`
- `"배송"` 관련 ⇒ `SHIPPING_TEMPLATE`
- `"품절"`, `"재고"` ⇒ `STOCK_TEMPLATE`

#### 5.3.2 응답 딜레이

- **사용자 설정 가능**
  - 초기 기본값: **1.5초**
- 구현 방식
  - `setTimeout` 또는 `await delay(ms)` 사용
  - 연속 메시지일 경우, 큐에 쌓아서 순차 처리

```js
const config = {
  replyDelayMs: 1500, // UI에서 설정 가능
};

async function sendAutoReply(text) {
  await delay(config.replyDelayMs);
  await typeAndSendInGrip(text);
}
```

#### 5.3.3 동일 답변 Rate Limit

- 동일한 응답 텍스트를 **5초 이내 반복 발송 금지**
- 향후 UI에서 5초 → 사용자가 변경 가능하도록

```js
const lastReplyMap = new Map(); // replyText -> lastTimestamp

function canSendReply(replyText, nowTs) {
  const lastTs = lastReplyMap.get(replyText) ?? 0;
  const limitMs = config.sameReplyCooltimeMs; // 초기 5000ms
  if (nowTs - lastTs < limitMs) return false;
  lastReplyMap.set(replyText, nowTs);
  return true;
}
```

### 5.4 SQLite 기반 데이터 저장

#### 5.4.1 DB 파일

- `data/grip_chat.db`

#### 5.4.2 테이블 설계 (초기버전)

```sql
-- 채팅 로그
CREATE TABLE chat_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,       -- UNIX timestamp (ms)
  nickname    TEXT NOT NULL,
  message     TEXT NOT NULL,
  category    TEXT NOT NULL,          -- PRODUCT_RELATED / QUESTION / NOISE
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 자동응답 로그
CREATE TABLE reply_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  nickname    TEXT,                   -- 대상자 (없을 수도 있음)
  question    TEXT,
  reply_text  TEXT NOT NULL,
  rule_key    TEXT,                   -- 어떤 규칙/키워드에 의해 응답했는지
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 키워드/응답 설정
CREATE TABLE reply_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key    TEXT NOT NULL,          -- 'SIZE', 'SHIPPING' 등
  pattern     TEXT NOT NULL,          -- 기준 키워드 또는 패턴
  reply_text  TEXT NOT NULL,          -- 응답 템플릿
  active      INTEGER NOT NULL DEFAULT 1
);
```

### 5.5 대시보드 UI (A안)

#### 5.5.1 레이아웃

- 좌측: **Live Chat Viewer**
  - 실시간 채팅 + 분류 결과 표시
- 중앙: **자동응답 로그 / 디버그**
  - 어떤 메시지에 어떤 규칙으로 응답했는지 표시
- 우측: **키워드 & 응답 규칙 관리 + 인기 질문/제품 TOP**

#### 5.5.2 주요 컴포넌트

- `<ChatStreamPanel />`
  - WebSocket → `messages` 상태 업데이트
  - `nickname`, `message`, `category` 컬러 구분

- `<ReplyLogPanel />`
  - 최근 자동응답 리스트 표

- `<RulesConfigPanel />`
  - `reply_rules` CRUD UI
  - 패턴 / 응답 텍스트 수정

- `<StatsPanel />`
  - 최근 5분 / 30분 기준 TOP 질문, TOP 제품 키워드 표시

---

## 6. 개발 순서 (로드맵)

### 6.1 Phase 1 — Bot 기초 구축

1. Playwright + Grip DOM Hook 코드 프로젝트로 분리
2. 채팅 메시지 구조 정의 (`{ ts, nickname, message }`)
3. 간단한 `classifyMessage()` 함수로 콘솔에 카테고리 표시
4. SQLite 연결 → `chat_logs` 저장

### 6.2 Phase 2 — 자동응답 엔진

1. 키워드/패턴 기반 분류 고도화
2. `reply_rules` 테이블/파일 베이스로 응답 매핑
3. 자동응답 딜레이 적용 (`replyDelayMs` = 1.5초)
4. 동일 답변 Rate Limit (`sameReplyCooltimeMs` = 5000ms)
5. Playwright로 Grip 채팅 입력창에 텍스트 입력 + 엔터 전송 기능 구현

### 6.3 Phase 3 — WebSocket + React 대시보드

1. Node.js 에서 `ws` 서버 오픈 (`ws://localhost:9001` 등)
2. 채팅/응답 이벤트 발생 시 WebSocket 브로드캐스트
3. Vite + React + Tailwind 프로젝트 생성
4. 대시보드 레이아웃 구현 (A안)
5. 실시간 Chat Viewer / Reply Log 표시

### 6.4 Phase 4 — 키워드 & 규칙 관리 UI

1. 프론트에서 규칙 목록 조회 (백엔드 HTTP API)
2. 새로운 패턴/응답 추가, 수정, 삭제
3. 즉시 반영 가능하도록 인메모리 캐시 + SQLite 동기화

### 6.5 Phase 5 — 고도화 & 확장

1. 유사도 검색 알고리즘 튜닝 (자모 분리, 편집거리 등)
2. 인기 질문/제품 TOP 통계 계산 API 추가
3. 대시보드에 기간 필터/브랜드 필터 추가
4. 추후 GPT 기반 **AI 자동응답 추천 기능** 추가 (옵션)

---

## 7. 코드 스타일 & 개발 규칙

### 7.1 백엔드 (Node.js)

- **ES Module 기반**
  - `type: "module"` + `import` 사용
- 파일 구조 예시:

```text
/backend
  grip-bot.js           # Playwright + Hook 엔트리
  classifier.js         # classifyMessage, 유사도 로직
  responder.js          # 자동응답 결정 + rate limit
  grip-sender.js        # Grip 채팅창 입력/전송 로직
  ws-server.js          # WebSocket broadcast
  db.js                 # SQLite 초기화 및 쿼리 래퍼
  config.js             # 설정값 (delay, cooltime 등)
```

- 함수/모듈 스타일
  - 순수 함수 지향 (`classifyMessage`, `buildReply` 등)
  - I/O (Playwright, DB, WS) 는 별도 모듈로 분리
  - `async/await` 통일, `then` 체인 지양
  - 로그는 `console.log` 단계에서 시작, 추후 `pino`나 `winston`으로 확장 가능성 고려

### 7.2 프론트엔드 (React)

- 함수형 컴포넌트 + Hooks
- Tailwind 기반 스타일링
- 컴포넌트 책임 최소화
  - `views` vs `components` vs `hooks` 디렉토리 분리 가능
- 상태 관리
  - 초기: `useState`, `useEffect`
  - 메시지 스트림: `useRef` + `useEffect`로 WebSocket 관리

### 7.3 공통 규칙

- 주석은 **“왜”** 를 설명, “무엇”은 코드로 표현
- 임시/테스트 코드도 **되도록 모듈화**해서 붙였다 떼기 쉽게 설계
- `TODO:` 태그를 통해 향후 개선 포인트 명시
- Git 커밋 메시지 규칙 (예시)
  - `feat: add reply rate limit`
  - `fix: grip sender selector for chat input`
  - `chore: add sqlite schema migration`

---

## 8. 확장 방향

1. **여러 Grip 방송 동시 모니터링**  
   - 방송 URL 리스트 관리 → Playwright 컨텍스트 여러 개 띄우기

2. **ERP / 재고 시스템 연동**
   - 특정 제품 문의 발생 시 → ERP 재고/가격 조회 → 응답 텍스트에 실시간 반영

3. **AI 기반 질문 이해 & 답변 추천**
   - GPT / Claude / Vertex AI 연결
   - 자동응답은 규칙 기반 유지, AI는 “추천”만 제공 → 사람/매니저가 클릭 시 전송

4. **n8n 연동**
   - 채팅 로그를 n8n으로 보내서
     - CRM 태깅
     - 특이 고객/클레임 자동 분류
     - 후속 DM 자동 발송 플로우 구성

---

## 9. 요약

- 현재 기획안은 **실시간 채팅 감시 + 분류 + 규칙 기반 자동응답 + 모니터링 UI + SQLite 로그**까지 포함한 **MVP v1.0 상세 설계**이다.
- 이미 Grip DOM Hook 베이스 코드는 검증 완료되었으며,  
  이 설계를 따르면 **점진적으로 기능을 추가하면서도 구조를 유지할 수 있는 형태**가 된다.
- 다음 단계는:
  1. 이 설계안 기준으로 **backend 초기 skeleton 코드**를 구성하고
  2. 이어서 **React 대시보드 기본 틀**을 만드는 순서로 개발을 진행한다.
