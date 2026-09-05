# AI Calendar Client

React 19와 Create React App(`react-scripts` 5) 기반 클라이언트입니다. 현재 `src/App.js`는 React 로고와 `Learn React` 링크를 보여주는 기본 템플릿입니다.

이미지 업로드, 텍스트 입력, 분석 결과 표시, 캘린더 화면 및 백엔드 연동은 미구현입니다. 전체 구성은 [루트 README](../README.md)를 참고하세요.

## 실행

저장소 루트에서 실행합니다.

```powershell
cd gcalendar-client
npm install
npm start
```

기본 주소는 `http://localhost:3000`입니다. 현재 기본 화면은 백엔드 없이 실행할 수 있습니다.

## 명령

다음 명령은 `gcalendar-client`에서 실행합니다.

| 명령 | 설명 |
| --- | --- |
| `npm start` | 개발 서버 실행 |
| `npm run build` | `build/`에 배포용 정적 파일 생성 |
| `npm test` | 감시 모드로 테스트 실행 |
| `npm test -- --watchAll=false` | 테스트 한 번 실행 |

기존 테스트는 `Learn React` 링크 표시만 확인하며 분석 API나 서버 통합을 검증하지 않습니다.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `src/index.js` | React 진입점 |
| `src/App.js` | 기본 화면 |
| `src/App.css`, `src/index.css` | 화면 및 전역 스타일 |
| `src/App.test.js`, `src/setupTests.js` | 기본 테스트 및 설정 |
| `public/index.html` | HTML 템플릿 |

현재 API 주소 환경 변수나 개발 프록시는 설정되어 있지 않습니다. 연동 구현 시 [백엔드 문서](../gcalendar-api/README.md)의 요청 필드와 응답 구조를 참고하세요.
