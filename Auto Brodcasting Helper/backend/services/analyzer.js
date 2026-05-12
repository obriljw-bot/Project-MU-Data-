import { config } from '../config.js';

export class ChatAnalyzer {
    constructor() {
        // DB 연결은 주입받거나 import해서 사용
    }

    /**
     * 메시지를 분석하여 의도(Intent)와 키워드를 추출
     * @param {string} message 
     * @returns {Object} { intent, keywords, details }
     */
    analyze(message) {
        const cleanMsg = message.trim();
        const intent = this.classifyIntent(cleanMsg);
        const keywords = this.extractKeywords(cleanMsg);

        // Category Classification (Simplified)
        let category = 'PARTICIPATION'; // Default
        if (['INQUIRY', 'LOCATION'].includes(intent)) {
            category = 'QUERY';
        } else if (['BUY', 'REACTION'].includes(intent)) {
            category = 'PARTICIPATION';
        } else {
            category = 'NONE';
        }

        return {
            intent,
            keywords,
            category, // New Field
            details: {}
        };
    }

    classifyIntent(message) {
        // 의도별 키워드/패턴 정의
        const PATTERNS = {
            BUY: [
                /주세요$/, /할래요/, /살래요/, /저요/, /달라해요/, /구매/, /삽니다/,
                /[0-9]+개/, /색상/ // "차콜색 이요" 등의 패턴
            ],
            INQUIRY: [
                /얼마/, /가격/, /비싸/, /세일/, /할인/, /비용/,
                /유통기한/, /언제/, /배송/, /사이즈/, /재고/, /있나요/,
                /섭취/, /연령/, /가능한가요/, /보여주세요/, /\?$/
            ],
            LOCATION: [
                /뒤에/, /바닥에/, /옆에/, /입고있는/, /마네킹/, /왼쪽/, /오른쪽/
            ],
            REACTION: [
                /ㅋㅋ/, /ㅎㅎ/, /와우/, /대박/, /이쁘다/, /예뻐요/, /좋아요/, /헐/
            ]
        };

        for (const [intent, regexes] of Object.entries(PATTERNS)) {
            for (const regex of regexes) {
                if (regex.test(message)) {
                    return intent;
                }
            }
        }

        return 'NONE';
    }

    extractKeywords(message) {
        // 1. 기본 공백 분리
        const tokens = message.split(/\s+/);

        // 2. 필터링 (설정된 길이 이상, 무시 리스트 제외)
        return tokens.filter(token => {
            // 특수문자 제거 후 길이 체크
            const pureToken = token.replace(/[^가-힣a-zA-Z0-9]/g, "");
            if (pureToken.length < (config.analysis.keywordMinLength || 2)) return false;

            // 무시 리스트 확인
            const ignoreList = config.analysis.ignoreList || [];
            if (ignoreList.some(ignore => pureToken.includes(ignore))) return false;

            return true;
        }).map(token => token.replace(/[^가-힣a-zA-Z0-9]/g, "")); // 정제된 토큰 반환
    }
}
