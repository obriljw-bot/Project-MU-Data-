export const config = {
    // 타겟 방송 URL (변경 가능)
    targetUrl: "https://www.grip.show/content/3ex2gkg9",

    // 크롤링 설정
    checkIntervalMs: 100, // DOM 감지 주기 (MutationObserver 사용 시 보조적 용도)

    // 자동응답 설정
    autoReply: {
        enabled: true,
        minDelayMs: 1500,
        maxDelayMs: 3000,
        rateLimit: 5000 // 동일 답변 쿨타임
    },

    // 분석 엔진 설정 (Phase 2)
    analysis: {
        keywordMinLength: 2, // 2글자 이상만 키워드로 취급
        ignoreList: ["ㅋㅋ", "ㅎㅎ", "너무", "진짜", "완전", "어서오세요"] // 분석 제외 단어
    }
};
