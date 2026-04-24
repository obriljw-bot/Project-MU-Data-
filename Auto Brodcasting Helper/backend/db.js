import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

// DB 파일 경로 설정 (data 폴더 내)
const dbFolder = path.resolve('data');
const dbPath = path.join(dbFolder, 'grip_chat.db');

// data 폴더가 없으면 생성
if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder);
}

let dbInstance = null;

export async function initDB() {
    if (dbInstance) return dbInstance;

    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log(`📂 Database connected: ${dbPath}`);

    // 1. 기본 채팅 로그 테이블
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            nickname TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. 심층 분석 로그 테이블 (Phase 2+)
    // intent: BUY(구매), INQUIRY(문의), LOCATION(위치), REACTION(호응), NONE
    // details: 추출된 색상, 사이즈 등 JSON 문자열
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS chat_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            intent TEXT,
            details TEXT,
            is_answered BOOLEAN DEFAULT 0,
            FOREIGN KEY(chat_id) REFERENCES chat_logs(id)
        );
    `);

    // 3. 키워드 트렌드 집계 테이블 (누적)
    // URL별로 분리하기 위해 source_url 컬럼 추가 및 PK 변경

    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS keyword_trends (
        term TEXT,
        source_url TEXT DEFAULT 'unknown',
        frequency INTEGER DEFAULT 1,
        last_seen INTEGER,
        category TEXT DEFAULT 'PARTICIPATION',
        PRIMARY KEY (term, source_url)
      )
    `);

    // Migration for existing tables (Try add column)
    try {
        await dbInstance.exec(`ALTER TABLE keyword_trends ADD COLUMN category TEXT DEFAULT 'PARTICIPATION'`);
    } catch (e) {
        // Ignore "duplicate column name" error
    }

    // 4. 상품 정보 (방송시마다 업데이트 가능)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS products (
            code TEXT PRIMARY KEY,   -- 관리 코드 (예: P001, RED_HOOD)
            name TEXT NOT NULL,      -- 상품명
            price TEXT,              -- 가격 정보
            keywords TEXT,           -- 매칭 키워드 (콤마 구분, 예: "레드후드,빨간거,저거")
            description TEXT         -- 추가 설명 (유통기한 등)
        );
    `);

    // 5. 자동응답 규칙
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS reply_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,      -- KEYWORD, PATTERN
            trigger TEXT NOT NULL,   -- 감지 단어
            response TEXT NOT NULL,
            active INTEGER DEFAULT 1
        );
    `);

    console.log("✔ Database schema initialized.");
    return dbInstance;
}

export function getDB() {
    if (!dbInstance) {
        throw new Error("Database not initialized. Call initDB() first.");
    }
    return dbInstance;
}
