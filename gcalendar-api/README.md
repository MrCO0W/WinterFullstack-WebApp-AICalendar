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
    ```
    git clone <repository-url>
    cd gcalendar-api
    ```

2. **의존성 설치**
    ```
    npm install
    ```

3. **환경 변수 설정**  
프로젝트 루트 디렉터리에 `.env` 파일을 생성하고 아래 환경 변수를 설정합니다.
    ```
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=your_db_username
    DB_PASSWORD=your_db_user_password
    DB_NAME=your_db_name
    PORT=3001
    GEMINI_API_KEY=your_gemini_api_key
    ```

### 사용 방법
* **개발 모드 실행**
    ```
    npm run dev
    ```
    서버는 `http://localhost:3001`에서 실행됩니다 (Nodemon 사용).

* **프로덕션 모드 실행**
    ```
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
    * The API receives an image from the client
    * The API sends the image to Gemini
    * Gemini responds with a JSON payload formatted for the Google Calendar API

### Installation
1. **Clone the repository**
    ```
    git clone <repository-url>
    cd gcalendar-api
    ```

2. **Install dependencies**
    ```
    npm install
    ```

3. **Configure Environment Variables**  
Create a `.env` file in the root directory and configure the following environment variables:
    ```
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=your_db_username
    DB_PASSWORD=your_db_user_password
    DB_NAME=your_db_name
    PORT=3001
    GEMINI_API_KEY=your_gemini_api_key
    ```

### Usage
* **Run in Development Mode**
    ```
    npm run dev
    ```
    The server will start at `http://localhost:3001` (using Nodemon).

* **Run in Production Mode**
    ```
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
