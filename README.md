# AI Calendar

**이미지나 텍스트로 전달받은 일정을 Gemini로 분석하고 Google Calendar에 추가하는 것을 목표로 하는 AI 일정 등록 서비스입니다.**

포스터, 행사 안내문, 대화 속 약속을 일일이 옮겨 적는 번거로움을 줄이기 위해 만들었습니다. 사용자가 이미지를 업로드하거나 일정이 담긴 문장을 입력하면 Gemini가 일정 제목, 날짜, 시간, 장소를 추출하고, 이를 Google Calendar에 등록하는 흐름을 지향합니다.

예를 들어 행사 포스터를 올리거나 “9월 10일 오후 2시 서울에서 팀 회의”라고 입력해 캘린더에 추가할 일정을 준비할 수 있습니다.

> 현재는 Gemini 기반 일정 추출과 서버 저장까지 구현되어 있으며, Google 계정 인증과 Google Calendar 등록 기능은 아직 구현되지 않았습니다.

Express 백엔드와 React 클라이언트로 구성됩니다.

## 주요 기능 요약

현재 구현된 기능은 백엔드 API로 사용할 수 있습니다.

| 기능 | 설명 |
| --- | --- |
| 이미지에서 일정 추출 | 포스터나 안내문 이미지를 업로드하면 Gemini가 일정 정보를 추출합니다. |
| 텍스트에서 일정 추출 | 일정이 포함된 문장을 입력하면 제목, 설명, 장소, 시작·종료 날짜와 시간으로 정리합니다. |
| 이미지와 문구 함께 분석 | 이미지에 보충 문구를 함께 전달할 수 있습니다. 문구의 정보를 우선하고 잘못된 날짜를 교정하도록 모델에 지시합니다. |
| 일정 JSON 생성 | 추출한 정보를 `summary`, `description`, `location`, `start`, `end` 필드로 구성해 응답합니다. |
| 분석 자료 저장 | 업로드 이미지와 결과 JSON을 서버에 저장하고 PostgreSQL에 파일 경로와 생성 시각을 기록합니다. 저장 완료 여부는 별도 확인이 필요합니다. |
| 이미지 업로드 수동 테스트 | 별도 HTML 테스트 페이지에서 이미지를 전송하고 API 응답을 확인할 수 있습니다. |

예를 들어 “2026년 9월 10일 오후 2시부터 3시까지 서울에서 팀 회의”를 입력하면 제목·장소·시작 및 종료 시간이 담긴 일정 JSON을 생성합니다. 실제 추출 결과는 모델 응답에 따라 달라집니다.

## 구현 상태

| 구성 | 현재 상태 |
| --- | --- |
| 백엔드 | 이미지·텍스트·복합 입력 분석, 일정 JSON 저장, PostgreSQL 경로 기록 |
| 클라이언트 | React 기본 템플릿. 입력 화면 및 API 연동 미구현 |
| Google Calendar | 인증 및 실제 일정 등록 미구현 |

현재 응답은 날짜와 시간을 분리한 프로젝트 자체 JSON 형식입니다.

## 기술 스택

| 영역 | 기술 | 용도 |
| --- | --- | --- |
| 언어 | JavaScript, HTML, CSS | 서버 로직과 웹 화면 작성 |
| 프론트엔드 | React 19, React DOM, Create React App | 화면 구성, 개발 서버, 빌드 |
| 백엔드 | Node.js, Express 5 | HTTP API 서버, ES Modules 사용 |
| AI | Gemini, Google GenAI SDK | 이미지·텍스트에서 일정 정보 추출 |
| 데이터베이스 | PostgreSQL, node-postgres(`pg`) | 분석 파일 경로와 생성 시각 기록 |
| 파일 저장 | 로컬 파일 시스템, Multer | 이미지 업로드 및 일정 JSON 보관 |
| 개발·테스트 | nodemon, React Testing Library, Jest(react-scripts 제공) | 서버 자동 재시작, 기본 화면 테스트 |
| 연동 예정 | Google Calendar | 추출한 일정 등록. 현재 인증·등록 코드 미구현 |

## 설치 환경 및 라이브러리

### 별도로 준비할 항목

- **Node.js와 npm**: 백엔드와 클라이언트 의존성 설치 및 실행에 필요합니다. 저장소에는 Node.js 버전 고정 설정이 없습니다.
- **PostgreSQL 서버**: 직접 설치하거나 접속 가능한 서버를 준비합니다. `npm install`로 PostgreSQL 서버가 설치되지는 않습니다.
- **Gemini API 키**: 백엔드 `.env`의 `GEMINI_API_KEY`에 설정합니다.

### 백엔드 라이브러리

버전은 `gcalendar-api/package.json`에 선언된 범위입니다.

| 라이브러리 | 버전 | 용도 |
| --- | --- | --- |
| `express` | `^5.2.1` | 서버와 API 라우팅 |
| `@google/genai` | `^1.38.0` | Gemini API 호출 |
| `multer` | `^2.0.2` | multipart 이미지 업로드 처리 |
| `pg` | `^8.17.2` | PostgreSQL 연결 및 SQL 실행 |
| `dotenv` | `^17.2.3` | `.env` 환경 변수 로드 |
| `cors` | `^2.8.6` | 브라우저의 교차 출처 요청 허용 설정 |
| `sharp` | `^0.34.5` | 이미지 처리 라이브러리. 의존성에 등록되어 있지만 현재 분석 경로에서는 미사용 |
| `nodemon` | `^3.1.11` | 개발용 의존성. 코드 변경 시 서버 재시작 |

### 클라이언트 라이브러리

버전은 `gcalendar-client/package.json`에 선언된 범위입니다.

| 라이브러리 | 버전 | 용도 |
| --- | --- | --- |
| `react`, `react-dom` | 각각 `^19.2.4` | UI 컴포넌트 구성 및 브라우저 렌더링 |
| `react-scripts` | `5.0.1` | 개발 서버, 빌드, 테스트 실행 |
| `web-vitals` | `^2.1.4` | 웹 성능 측정 도구 |
| `@testing-library/react` | `^16.3.2` | React 컴포넌트 테스트 |
| `@testing-library/dom` | `^10.4.1` | 테스트에서 DOM 요소 탐색 |
| `@testing-library/jest-dom` | `^6.9.1` | DOM 검증용 Jest matcher |
| `@testing-library/user-event` | `^13.5.0` | 테스트에서 사용자 입력 시뮬레이션 |

### 라이브러리 설치 방법

위 라이브러리는 이미 각 폴더의 `package.json`에 등록되어 있어 개별 설치할 필요가 없습니다. 저장소 루트에서 다음 명령으로 두 앱의 의존성을 모두 설치합니다.

```powershell
cd gcalendar-api
npm install
cd ../gcalendar-client
npm install
cd ..
```

`fs`, `path`는 Node.js 내장 모듈로 추가 설치가 필요 없습니다. 미사용 실험 파일 `services/gemini.js`가 참조하는 `file-type`도 현재 서버 실행에는 필요하지 않습니다. Google Calendar 연동용 라이브러리는 현재 의존성에 포함되어 있지 않습니다.

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
