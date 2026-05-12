import { config } from '../config.js';

export class AutoResponder {
    constructor() {
        this.lastReplyTimes = new Map(); // { responseText: timestamp }
    }

    /**
     * 분석 결과를 바탕으로 응답 텍스트를 결정
     * @param {Object} analysisResult { intent, keywords, details }
     * @returns {string|null} 응답할 텍스트 또는 null
     */
    determineReply(analysisResult) {
        const { intent, keywords } = analysisResult;

        // 1. Intent 기반 응답 규칙
        if (intent === 'INQUIRY') {
            if (this.hasKeyword(keywords, ['가격', '얼마', '비용'])) {
                return "현재 방송 특가로 판매 중입니다! 상품 상세 페이지를 확인해 주세요 :)";
            }
            if (this.hasKeyword(keywords, ['배송', '언제'])) {
                return "오늘 오후 3시 이전 주문 건은 당일 발송됩니다! 🚚";
            }
            if (this.hasKeyword(keywords, ['유통기한'])) {
                return "제품 상세페이지 하단 표기일로부터 2년입니다.";
            }
            if (this.hasKeyword(keywords, ['사이즈', '치수'])) {
                return "정사이즈로 나왔습니다. 상세 사이즈표를 참고해주세요!";
            }
        }

        if (intent === 'LOCATION') {
            // 위치 관련 질문은 난이도가 높으므로, 일단 매니저 호출 멘트나 특정 안내
            return "방송에 나온 상품이 궁금하시군요! 곧 자세히 보여드릴게요.";
        }

        // 2. 구매 의사 표현에 대한 반응 (옵션)
        if (intent === 'BUY') {
            // 너무 잦은 반응은 좋지 않으니 확률적으로 하거나 생략
            // return "탁월한 선택이십니다! 👍"; 
        }

        return null;
    }

    hasKeyword(extractedKeywords, targetKeywords) {
        return extractedKeywords.some(k => targetKeywords.some(t => k.includes(t)));
    }

    /**
     * Rate Limit 체크 및 최종 결정
     */
    shouldSend(replyText) {
        if (!replyText) return false;

        const now = Date.now();
        const lastSent = this.lastReplyTimes.get(replyText) || 0;
        const cooldown = config.autoReply.rateLimit || 5000;

        if (now - lastSent < cooldown) {
            console.log(`⏳ Rate Limit Ignored: "${replyText}"`);
            return false;
        }

        this.lastReplyTimes.set(replyText, now);
        return true;
    }
}
