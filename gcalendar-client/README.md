# AI Calendar Client

React와 React Router로 구성된 Google 캘린더 클라이언트입니다. 이미지·텍스트 분석, 결과 편집, 색상 선택, 일정 등록·삭제를 제공합니다.

설치, 환경 변수, Google OAuth 설정, 스크린샷 사용법은 [프로젝트 README](../README.md)를 참고하세요. 현재 폴더명은 `g_calendar-client`입니다.

| 명령 | 용도 |
| --- | --- |
| npm install | 의존성 설치 |
| npm start | 개발 서버 실행 |
| npm run build | 배포 번들 생성 |
| npm test -- --watchAll=false | 테스트 한 번 실행 |

`.env.example`을 `.env`로 복사한 뒤 Google 클라이언트 ID와 API 주소를 설정합니다. 환경 변수 변경 후 개발 서버를 재시작하세요. `.env`에는 브라우저에 공개 가능한 설정만 넣습니다.
