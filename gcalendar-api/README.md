# AI Calendar API

Express 5, Google GenAI SDK, Multer, PostgreSQL(`pg`) 기반 일정 추출 서버입니다. 환경 변수, 업로드 폴더 및 DB 준비는 [루트 README](../README.md)를 참고하세요.

## 실행

`gcalendar-api`에서 `npm install` 후 `npm run dev`로 실행합니다. `npm start`는 자동 재시작 없이 실행합니다. 기본 포트는 `3001`이며 `.env`의 `PORT`로 변경할 수 있습니다. 별도 빌드·자동 테스트 명령은 없습니다.

## API

| 메서드 | 경로 | Content-Type | 입력 |
| --- | --- | --- | --- |
| POST | `/analyze/text` | `application/json` | `text`: 필수 텍스트 |
| POST | `/analyze/image` | `multipart/form-data` | `image`: 필수 파일 한 개 |
| POST | `/analyze/multi` | `multipart/form-data` | `image`: 필수 파일 한 개, `prompt`: 선택 보충 문구 |

복합 분석의 텍스트 필드명은 `prompt`입니다. 모델에는 이 문구를 이미지 정보보다 우선하도록 지시합니다.

### 요청 예시 (PowerShell)

서버 실행 후 별도 터미널에서 호출합니다. 이미지 예시는 `gcalendar-api`의 샘플 파일을 사용합니다.

```powershell
$body = @{ text = '2026년 9월 10일 오후 2시부터 3시까지 서울에서 팀 회의' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/analyze/text' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

curl.exe http://localhost:3001/analyze/image -F "image=@poster.png"
curl.exe http://localhost:3001/analyze/multi -F "image=@poster.png" -F "prompt=장소는 서울로 변경해 주세요"
```

### 성공 응답 예시

실제 내용은 모델 출력에 따라 달라집니다.

```json
{
  "success": true,
  "message": {
    "summary": "팀 회의",
    "description": "팀 회의 진행",
    "location": "서울",
    "start": { "date": "2026-09-10", "time": "14:00", "timeZone": "Asia/Seoul" },
    "end": { "date": "2026-09-10", "time": "15:00", "timeZone": "Asia/Seoul" }
  }
}
```

성공 응답에는 위 필드 외에 저장된 로그 ID인 `logId`가 포함됩니다. Google Calendar 등록은 클라이언트가 Google REST API를 직접 호출합니다.

### 오류

| 상황 | HTTP 상태 | message |
| --- | --- | --- |
| 텍스트 누락 또는 공백 | 400 | `text is required` |
| 이미지 누락 또는 빈 파일 | 400 | `Image upload failed (empty file)` |
| 모델 출력 JSON 파싱 실패 | 500 | `Gemini output is not valid JSON` (`raw` 포함) |
| 분석 중 예외 | 500 | 예외 메시지 |

위 표는 라우트가 처리하는 오류입니다. 업로드 미들웨어 오류 등은 같은 JSON 형식을 보장하지 않습니다.

## 저장 및 수동 확인

이미지는 `uploads/images/`, 결과 JSON은 `uploads/plans/`에 저장합니다. DB `logs`에는 `messagepath`, `imagepath`를 기록하며 텍스트 분석의 `imagepath`는 `NULL`입니다.

서버 실행 후 `index.html`을 브라우저에서 열어 이미지 업로드를 확인할 수 있습니다. Express가 이 페이지를 제공하지는 않습니다. 페이지의 API 주소는 `http://localhost:3001/analyze/image`로 고정되어 있습니다.

현재 분석 API는 파일 저장과 DB 삽입 완료를 기다린 뒤 응답합니다. 실제 파일과 DB 기록을 함께 확인할 수 있습니다.

```sql
SELECT id, messagepath, imagepath, created_at
FROM logs
ORDER BY created_at DESC
LIMIT 10;
```

## 문제 해결

- `ENOENT`: `gcalendar-api`에서 실행 중인지, 두 업로드 폴더가 존재하는지 확인합니다.
- DB 오류: PostgreSQL 실행 상태, `.env` 값, 해당 DB의 `logs` 테이블 및 소유자를 확인합니다.
- Gemini 오류: API 키와 코드에 지정된 모델의 계정별 사용 가능 여부를 확인합니다.
- `Cannot GET /`: 루트 경로는 구현되지 않았습니다. 위 POST API를 사용합니다.

구현 제한과 라이선스는 [루트 README](../README.md)를 참고하세요.

## 분석 기록 API

| 메서드 | 경로 | 역할 |
| --- | --- | --- |
| GET | `/analyze/logs?limit=50` | 최근 기록 조회, 최대 200개 |
| PATCH | `/analyze/logs/:id/event` | JSON 본문의 `eventId`를 로그에 연결 |
| GET | `/analyze/logs/by-event/:eventId` | Google 이벤트에 연결된 최근 로그 조회 |
| GET | `/analyze/logs/:id/raw` | 원본 일정 JSON과 이미지 경로 조회 |
| DELETE | `/analyze/logs` | 전체 로그 및 연결된 파일 삭제 |

이미지와 JSON 파일은 `/uploads` 정적 경로로 제공됩니다. 현재 기록 API는 사용자별 인증·분리가 없으며 전체 삭제는 모든 로그에 적용됩니다. DB에는 `summary`, `event_id` 컬럼도 필요합니다. 신규·기존 DB 설정은 [루트 README](../README.md)를 따르세요.
