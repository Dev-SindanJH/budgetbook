# 가족 가계부 웹앱 기획서

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명(가안) | 우리집 가계부 |
| 목적 | 가족이 함께 보는, 통계·차트 중심의 상세 가계부 웹앱 |
| 사용 환경 | 웹 브라우저 |
| 로그인 | 있음 (Supabase Auth) |
| 데이터 저장 | Supabase(PostgreSQL) 클라우드 저장 — 기기 상관없이 동기화 |
| 핵심 가치 | 어디에 얼마를 썼는지 한눈에, 예산 초과는 미리 경고 |

## 2. 인증 및 가족 공유 방식 (Supabase)

Supabase를 백엔드로 쓰면서 브라우저 저장 방식의 한계(기기마다 데이터가 따로 노는 문제)가 해결됩니다. 대신 로그인과 "가족 그룹" 개념이 새로 필요합니다.

- **로그인**: Supabase Auth로 이메일(비밀번호 또는 매직링크) 로그인
- **가족 그룹(family)**: 가입 시 그룹을 새로 만들거나, 가족이 공유한 초대 코드로 기존 그룹에 참여
- **데이터 공유 방식**: 모든 거래/예산/카테고리 데이터에 `family_id`를 붙여서 저장 → 같은 가족 그룹 구성원은 기기와 상관없이 동일한 데이터를 실시간으로 조회
- **데이터 격리**: Supabase의 RLS(Row Level Security) 정책으로 "같은 family_id를 가진 로그인 사용자만 조회/수정 가능"하도록 제한 → 다른 가족의 데이터는 절대 보이지 않음
- **실시간 동기화(선택)**: Supabase Realtime을 연결하면, 한 명이 지출을 입력하는 즉시 다른 가족 구성원 화면에도 자동 반영 가능

## 3. 핵심 기능 정의

### 3-1. 수입/지출 입력 및 목록 관리
- 입력 항목: 날짜, 금액, 구분(수입/지출), 카테고리, 결제수단, 작성자(가족 구성원), 메모
- 목록: 날짜별 그룹핑, 최신순 정렬
- 필터: 기간, 카테고리, 작성자, 수입/지출 구분
- 검색: 메모/카테고리 텍스트 검색
- 수정/삭제 가능

### 3-2. 카테고리별 통계(차트)
- 이번 달 카테고리별 지출 비중 → 파이(도넛) 차트
- 카테고리별 금액 순위 → 막대그래프
- 기간을 바꿔가며(주/월/년) 조회 가능

### 3-3. 예산 설정 및 초과 알림
- 카테고리별 + 전체 월 예산 설정
- 진행률 바로 "예산 대비 얼마나 썼는지" 표시
- 80% 도달 시 주의, 100% 초과 시 경고 색상/배너 표시

### 3-4. 월별/연도별 비교 분석
- 최근 6~12개월 수입/지출 추이 → 라인 또는 막대 그래프
- 전월 대비 증감률(%) 표시
- 연간 총 수입/지출/저축액 요약

## 4. 정보구조(사이트맵)

위에 표시된 다이어그램과 같이 **홈 대시보드**를 허브로 4개 화면(내역 관리, 통계, 예산 관리, 설정)으로 구성됩니다. 여기에 앱 최초 진입 시 거치는 **로그인 → 가족 그룹 만들기/참여하기** 단계가 앞단에 추가됩니다(아래 흐름 다이어그램 참고). 로그인이 끝나면 자동으로 홈 대시보드로 이동합니다.

## 5. 화면별 상세 설계

### 5-1. 로그인 및 가족 그룹
- 이메일로 로그인/회원가입 (Supabase Auth)
- 최초 접속 시 "가족 그룹 만들기" 또는 "초대 코드로 참여하기" 선택
- 그룹 만들기: 그룹 이름 입력 → 초대 코드 자동 생성 → 카톡 등으로 가족에게 공유
- 참여하기: 전달받은 초대 코드 입력 → 그룹 합류
- 로그인 완료 시 자동으로 홈 대시보드로 이동, 다음 방문부터는 자동 로그인 유지

### 5-2. 홈 대시보드
- 이번 달 요약 카드: 총 수입 / 총 지출 / 잔액
- 전체 예산 진행률 바
- 최근 거래 5건 리스트
- 카테고리 비중 미니 도넛 차트
- 가족 구성원별 이번 달 지출 요약 (누가 얼마 썼는지)

### 5-3. 내역 관리
- 우측 하단 `+` 버튼으로 거래 추가
- 입력 폼: 날짜 / 금액 / 수입·지출 토글 / 카테고리 선택 / 결제수단 / 작성자 / 메모
- 목록: 날짜별 그룹 헤더 + 항목 카드
- 상단 필터바: 기간, 카테고리, 작성자

### 5-4. 통계
- 상단에서 기간 선택 (이번 달 / 지난달 / 올해 / 사용자 지정)
- 카테고리별 도넛 차트 + 범례(금액, 비율)
- 카테고리별 막대그래프(순위)
- 월별 추이 라인 차트
- 가족 구성원별 지출 비교 막대그래프

### 5-5. 예산 관리
- 카테고리별 예산 입력 리스트
- 카테고리마다 진행률 바 + "OO원 남음" 표시
- 초과 카테고리는 상단에 별도로 모아 경고 표시

### 5-6. 설정
- 카테고리 추가/수정/삭제, 아이콘·색상 지정
- 가족 구성원 추가/수정 (이름, 색상 태그)
- 데이터 내보내기(JSON 다운로드) / 가져오기(파일 업로드)
- 전체 데이터 초기화

## 6. 데이터 모델 (Supabase Postgres 스키마 예시)

```sql
-- 가족 그룹
families (
  id uuid primary key,
  name text,
  invite_code text unique,
  created_at timestamp
)

-- 사용자 프로필 (Supabase Auth의 auth.users와 1:1 연결)
profiles (
  id uuid primary key references auth.users,
  family_id uuid references families,
  name text,
  color text
)

-- 카테고리
categories (
  id uuid primary key,
  family_id uuid references families,
  name text,
  type text check (type in ('income','expense')),
  color text,
  icon text
)

-- 거래 내역
transactions (
  id uuid primary key,
  family_id uuid references families,
  member_id uuid references profiles,
  date date,
  type text check (type in ('income','expense')),
  amount numeric,
  category_id uuid references categories,
  payment_method text,
  memo text,
  created_at timestamp
)

-- 예산
budgets (
  id uuid primary key,
  family_id uuid references families,
  category_id uuid references categories,
  month text,        -- 예: '2026-07'
  limit_amount numeric
)
```

**RLS(Row Level Security) 정책 예시**: 모든 테이블에 "요청한 사용자의 `family_id`와 행의 `family_id`가 같을 때만 select/insert/update/delete 허용"하는 정책을 적용합니다. 이렇게 하면 같은 가족끼리는 자유롭게 데이터를 주고받지만, 다른 가족의 데이터는 애초에 조회 자체가 불가능합니다.

## 7. 화면 흐름 요약

1. 앱 접속 → 로그인 → (최초 1회) 가족 그룹 만들기/참여하기
2. 홈 대시보드에서 이번 달 현황 파악
3. `+` 버튼으로 지출/수입 빠르게 기록 → 가족 모두에게 즉시 반영
4. 통계 화면에서 어디에 많이 썼는지 확인
5. 예산 관리에서 카테고리별 한도 대비 사용량 점검
6. 필요 시 설정에서 카테고리·구성원 정리

## 8. 기술 스택 제안

| 영역 | 제안 |
|---|---|
| 프론트엔드 | React + supabase-js |
| 차트 라이브러리 | Chart.js 또는 Recharts |
| 백엔드 | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| 인증 | Supabase Auth (이메일 로그인, 필요 시 소셜 로그인 추가 가능) |
| 데이터 격리 | Supabase RLS 정책으로 family_id 단위 접근 제한 |
| 배포 | 프론트엔드는 Vercel/Netlify 등 정적 호스팅, 백엔드는 Supabase 프로젝트 |

## 9. 우선순위 제안 (MVP → 확장)

**1차 (MVP)**
- Supabase Auth 로그인, 가족 그룹 만들기/참여하기
- 수입/지출 입력·목록·수정·삭제 (family_id 기준 공유)
- 홈 대시보드 요약
- 카테고리별 도넛 차트

**2차**
- 예산 설정 및 초과 알림
- 월별 추이 차트, 가족 구성원별 비교
- Supabase Realtime으로 실시간 동기화

**3차 (확장, 선택)**
- 반복 거래 자동 입력
- Supabase Storage로 영수증 사진 첨부
- 알림(푸시/이메일, Supabase Edge Functions 활용)

## 10. 향후 확장 아이디어

- Supabase Realtime으로 완전 실시간 동기화 (지금 입력하면 가족 화면에 바로 뜸)
- 반복 지출(구독료, 월세 등) 자동 등록
- Supabase Storage로 영수증 사진 첨부 및 OCR 금액 인식
- Supabase Edge Functions로 예산 초과 시 알림(푸시/이메일) 발송
- 소셜 로그인(구글 등) 추가로 가입 절차 간소화

## 11. 다음 단계

이 기획을 바탕으로 실제 동작하는 프로토타입(React + Supabase)을 바로 만들어드릴 수 있습니다. 다만 Supabase 프로젝트 생성 및 연동 키 발급이 먼저 필요합니다. 준비되셨다면 "1차 MVP부터 만들어줘"라고 말씀해 주세요.
