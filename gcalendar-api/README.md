# Backend API - GCalendar APP

## 📄 README (Language Toggle)

<details>
<summary><strong>🇰🇷 한국어</strong></summary>

### 프로젝트 개요
* **이미지 및 텍스트 기반 일정 생성**
    * 클라이언트로부터 이미지나 텍스트 데이터를 전달받습니다.
    * Gemini AI를 통해 데이터를 분석하고 Google Calendar API 형식의 JSON을 생성합니다.
    * 생성된 일정 파일(.json)과 업로드된 이미지는 서버에 저장되며, 해당 경로를 데이터베이스에 로그로 기록합니다.

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

3. **디렉터리 구조 확인**
    ```text
    GCalendar
    ├── gcalendar-api
    │   ├── uploads
    │   │   ├── images <-- 업로드된 이미지 저장소
    │   │   └── plans  <-- Gemini 분석 결과(JSON) 저장소
    │   ├── .env
    │   └── ...
    └── gcalendar-client
    ```

4. **환경 변수 설정** (`.env`)
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
    1. 데이터베이스 생성: `CREATE DATABASE gcalendar_db;`
    2. `logs` 테이블 생성:
        ```sql
        CREATE TABLE logs (
            id bigint generated always as identity primary key, 
            messagepath varchar(255) not null, -- JSON 파일 경로
            imagepath varchar(255),            -- 이미지 파일 경로 (텍스트 분석 시 NULL)
            created_at timestamp with time zone default CURRENT_TIMESTAMP
        );
        ```
    3. **권한 부여**:
        ```sql
        CREATE USER your_db_username WITH PASSWORD 'your_db_user_password';
        GRANT ALL PRIVILEGES ON DATABASE gcalendar_db TO your_db_username;
        GRANT ALL PRIVILEGES ON TABLE logs TO your_db_username;
        GRANT USAGE, CREATE ON SCHEMA public TO your_db_username;
        ```

### API 엔드포인트
| 구분 | 메서드 | 엔드포인트 | 설명 |
| :--- | :--- | :--- | :--- |
| Image | `POST` | `/analyze/image` | 이미지 분석 후 JSON 저장 및 DB 로그 생성 |
| Text | `POST` | `/analyze/text` | 텍스트 분석 후 JSON 저장 및 DB 로그 생성 |

### 라이선스
이 프로젝트는 MIT License를 따릅니다.
</details>

---

<details open>
<summary><strong>🇺🇸 English</strong></summary>

### Project Overview
* **Image & Text-Based Plan Generation**
    * Receives image or text data from the client.
    * Analyzes data via Gemini AI and generates JSON formatted for Google Calendar.
    * Saves the generated plan (.json) and uploaded images to the server, then logs the file paths in the database.

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

3. **Directory Structure**
    ```text
    GCalendar
    ├── gcalendar-api
    │   ├── uploads
    │   │   ├── images <-- Uploaded images storage
    │   │   └── plans  <-- Parsed JSON results storage
    │   ├── .env
    │   └── ...
    └── gcalendar-client
    ```

4. **Environment Variables** (`.env`)
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
    1. Create Database: `CREATE DATABASE gcalendar_db;`
    2. Create `logs` Table:
        ```sql
        CREATE TABLE logs (
            id bigint generated always as identity primary key, 
            messagepath varchar(255) not null, -- Path to JSON file
            imagepath varchar(255),            -- Path to image file (NULL for text analysis)
            created_at timestamp with time zone default CURRENT_TIMESTAMP
        );
        ```
    3. **User & Permissions**:
        ```sql
        CREATE USER your_db_username WITH PASSWORD 'your_db_user_password';
        GRANT ALL PRIVILEGES ON DATABASE gcalendar_db TO your_db_username;
        GRANT ALL PRIVILEGES ON TABLE logs TO your_db_username;
        GRANT USAGE, CREATE ON SCHEMA public TO your_db_username;
        ```

### API Endpoints
| Category | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| Image | `POST` | `/analyze/image` | Analyzes image, saves JSON, and creates DB log |
| Text | `POST` | `/analyze/text` | Analyzes text, saves JSON, and creates DB log |

### License
This project is licensed under the MIT License.
</details>