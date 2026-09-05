# AI Calendar

이미지와 텍스트에서 Gemini로 일정 정보를 추출하는 프로젝트입니다. Express 백엔드와 React 클라이언트로 구성됩니다.

## 구현 상태

| 구성 | 현재 상태 |
| --- | --- |
| 백엔드 | 이미지·텍스트·복합 입력 분석, 일정 JSON 저장, PostgreSQL 경로 기록 |
| 클라이언트 | React 기본 템플릿. 입력 화면 및 API 연동 미구현 |
| Google Calendar | 인증 및 실제 일정 등록 미구현 |

현재 응답은 날짜와 시간을 분리한 프로젝트 자체 JSON 형식입니다.

## 구조

```text
.
├── gcalendar-api/
│   ├── index.js             # Express 서버
│   ├── router/analyzer.js   # 분석 API
│   ├── db/db.js             # PostgreSQL 연결
│   ├── services/gemini.js   # 서버에 연결되지 않은 실험 코드
│   ├── index.html          # 이미지 업로드 테스트 페이지
│   └── uploads/            # 실행 전에 생성, Git에서 제외
│       ├── images/
│       └── plans/
└── gcalendar-client/
    ├── public/
    └── src/App.js           # React 기본 화면
```

## 로컬 실행

Node.js, npm, PostgreSQL, Gemini API 키가 필요합니다. 각 앱에 package-lock.json이 있으며 Node.js 버전 고정 설정은 없습니다. 아래 명령은 PowerShell 기준입니다.

### 1. 백엔드 준비

저장소 루트에서 실행합니다.

```powershell
cd gcalendar-api
npm install
New-Item -ItemType Directory -Force uploads/images, uploads/plans
```

`gcalendar-api/.env`를 생성합니다.

```dotenv
PORT=3001
GEMINI_API_KEY=your_gemini_api_key
DB_HOST=localhost
DB_PORT=5432
DB_USER=gcalendar_user
DB_PASSWORD=replace_with_your_password
DB_NAME=gcalendar_db
```

`.env`는 Git에서 제외됩니다. 파일 저장 경로는 작업 디렉터리 기준이므로 서버는 반드시 `gcalendar-api`에서 실행합니다.

### 2. DB 설정

PostgreSQL 관리자 계정으로 다음 SQL을 실행합니다. 비밀번호는 `.env`와 일치시킵니다.

```sql
CREATE USER gcalendar_user WITH PASSWORD 'replace_with_your_password';
CREATE DATABASE gcalendar_db OWNER gcalendar_user;
```

이후 `gcalendar_db`에 `gcalendar_user`로 접속하여 테이블을 생성합니다. 이 구성에서는 애플리케이션 사용자가 테이블을 소유합니다.

```sql
CREATE TABLE logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    messagepath varchar(255) NOT NULL,
    imagepath varchar(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
```

### 3. 서버 실행

`gcalendar-api`에서 실행합니다.

```powershell
npm run dev
```

기본 주소는 `http://localhost:3001`입니다. 자동 재시작 없이 실행하려면 `npm start`를 사용합니다. `/`에는 화면이나 상태 확인 API가 없습니다.

### 4. 클라이언트 실행

별도 터미널에서 저장소 루트 기준으로 실행합니다.

```powershell
cd gcalendar-client
npm install
npm start
```

`http://localhost:3000`에서 React 기본 화면을 확인할 수 있습니다.

- [백엔드 API 사용법](gcalendar-api/README.md)
- [클라이언트 명령과 구조](gcalendar-client/README.md)

## 분석 흐름과 제한

요청 → 이미지 저장(이미지 포함 시) → Gemini 호출 → JSON 파싱 → 일정 파일 저장 및 DB 기록 요청 → 응답 순으로 처리합니다. 모델명은 `router/analyzer.js`에 `gemini-3-flash-preview`로 지정되어 있습니다.

- 파일 저장 및 DB 삽입 완료를 기다리지 않고 응답하므로 `success: true`가 영구 저장 성공을 보장하지 않습니다.
- 생성된 JSON의 필수 필드나 날짜를 엄격히 검증하지 않습니다. 복합 분석의 날짜 교정은 모델에 대한 지시입니다.
- 인증, 업로드 크기·파일 형식 제한, 요청 횟수 제한이 없고 CORS는 전체 허용입니다.
- 저장 파일의 조회·삭제 API와 자동 정리는 미구현입니다.
- `services/gemini.js`는 서버에서 사용하지 않는 실험 코드입니다. 미정의 변수와 의존성 목록에 없는 `file-type` 참조가 있습니다.

## 검증 및 라이선스

백엔드에는 자동 테스트 명령이 없습니다. 클라이언트 테스트는 기본 링크 표시만 확인합니다. 실제 분석과 저장 검증에는 유효한 Gemini 키와 실행 중인 PostgreSQL이 필요합니다.

루트 [LICENSE](LICENSE)는 MIT입니다. 백엔드 `package.json`의 `license`는 `ISC`로 되어 있어 파일과 메타데이터가 불일치합니다.
