# Backend API - GCalendar APP

## 📄 README (Language Toggle)

<details>
<summary><strong>🇰🇷 한국어</strong></summary>

### 프로젝트 개요
* **이미지 기반 일정 생성**
    * API는 클라이언트로부터 이미지를 전달받습니다.
    * API는 이미지를 Gemini로 전송합니다.
    * Gemini는 Google Calendar API 형식에 맞는 JSON 응답을 반환합니다.

### 설치 방법
1. **저장소 클론**
    ```bash
    git clone <repository-url>
    cd gcalendar-api
    ```

2. **의존성 설치**
    ```bash
    npm install
    ```

3. **디렉터리 추가**
    ```text
    GCalendar
    ├── gcalendar-api
    │   ├── uploads    <-- (NEW) 일정 분석 저장소 상위 루트
    │   │   ├── images <-- (NEW) 이미지 저장소
    │   │   └── plans  <-- (NEW) Gemini 파싱 결과 저장소
    │   ├── .env
    │   └── ...
    └── gcalendar-client
    ```

4. **환경 변수 설정** 프로젝트 루트 디렉터리에 `.env` 파일을 생성하고 아래 환경 변수를 설정합니다.
    ```env
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=your_db_username
    DB_PASSWORD=your_db_user_password
    DB_NAME=gcalendar_db
    PORT=3001
    GEMINI_API_KEY=your_gemini_api_key
    ```

5. **DB 설정**
    1. PostgreSQL 설치 및 실행
    2. 데이터베이스 생성
        ```sql
        CREATE DATABASE gcalendar_db;
        ```
    3. `logs` 테이블 생성
        ```sql
        CREATE TABLE logs (
            id bigint generated always as identity primary key, 
            messagepath varchar(255) not null, 
            filepath varchar(255) not null, 
            created_at timestamp with time zone default CURRENT_TIMESTAMP
        );
        ```
    4. **DB 유저 생성 및 권한 부여**
        ```sql
        -- 유저 생성
        CREATE USER your_db_username WITH PASSWORD 'your_db_user_password';
        
        -- 권한 부여
        GRANT ALL PRIVILEGES ON DATABASE gcalendar_db TO your_db_username;
        GRANT INSERT, SELECT ON TABLE logs TO your_db_username;
        -- PostgreSQL 15 이상인 경우 public 스키마 권한 추가 필요
        GRANT USAGE, CREATE ON SCHEMA public TO your_db_username;
        ```

### 사용 방법
* **개발 모드 실행**
    ```bash
    npm run dev
    ```
    서버는 `http://localhost:3001`에서 실행됩니다 (Nodemon 사용).

* **프로덕션 모드 실행**
    ```bash
    npm start
    ```

### API 엔드포인트
| 구분 | 메서드 | 엔드포인트 | 설명 |
| :--- | :--- | :--- | :--- |
| Analyze | `POST` | `/analyze/image` | 이미지를 분석하여 JSON 응답으로 변환 |

> [!TIP]
> API 테스트 예시는 [`index.html`](./index.html) 파일을 참고하세요.

### 라이선스
이 프로젝트는 MIT License를 따릅니다.  
자세한 내용은 [LICENSE](./LICENSE) 파일을 확인하세요.

</details>

---

<details open>
<summary><strong>🇺🇸 English</strong></summary>

### Project Overview
* **Image-Based Plan Generation**
    * The API receives an image from the client.
    * The API sends the image to Gemini.
    * Gemini responds with a JSON payload formatted for the Google Calendar API.

### Installation
1. **Clone the repository**
    ```bash
    git clone <repository-url>
    cd gcalendar-api
    ```

2. **Install dependencies**
    ```bash
    npm install
    ```

3. **Add Directories**
    ```text
    GCalendar
    ├── gcalendar-api
    │   ├── uploads    <-- (NEW) Root directory for analysis storage
    │   │   ├── images <-- (NEW) Storage for uploaded images
    │   │   └── plans  <-- (NEW) Storage for Gemini's parsed JSON results
    │   ├── .env
    │   └── ...
    └── gcalendar-client
    ```

4. **Configure Environment Variables** Create a `.env` file in the root directory:
    ```env
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=your_db_username
    DB_PASSWORD=your_db_user_password
    DB_NAME=gcalendar_db
    PORT=3001
    GEMINI_API_KEY=your_gemini_api_key
    ```

5. **Database Setup**
    1. Install and run PostgreSQL
    2. Create a Database
        ```sql
        CREATE DATABASE gcalendar_db;
        ```
    3. Create `logs` Table
        ```sql
        CREATE TABLE logs (
            id bigint generated always as identity primary key, 
            messagepath varchar(255) not null, 
            filepath varchar(255) not null, 
            created_at timestamp with time zone default CURRENT_TIMESTAMP
        );
        ```
    4. **Create User & Grant Permissions**
        ```sql
        -- Create a new user
        CREATE USER your_db_username WITH PASSWORD 'your_db_user_password';
        
        -- Grant privileges
        GRANT ALL PRIVILEGES ON DATABASE gcalendar_db TO your_db_username;
        GRANT INSERT, SELECT ON TABLE logs TO your_db_username;
        -- Required for PostgreSQL 15+ 
        GRANT USAGE, CREATE ON SCHEMA public TO your_db_username;
        ```

### Usage
* **Run in Development Mode**
    ```bash
    npm run dev
    ```
    The server will start at `http://localhost:3001` (using Nodemon).

* **Run in Production Mode**
    ```bash
    npm start
    ```

### API Endpoints
| Category | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| Analyze | `POST` | `/analyze/image` | Analyzes the image and transforms it into a JSON response |

> [!TIP]
> For detailed API test examples, please refer to the [`index.html`](./index.html) file.

### License
This project is distributed under the MIT License.  
See the [LICENSE](./LICENSE) file for details.

</details>