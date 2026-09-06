// ⚙️ 백엔드 설정
//
// 1) Google Sheet를 하나 만들고, 확장 프로그램 > Apps Script 로 들어가서
//    스코어/미션을 읽고 쓰는 함수를 작성한 뒤 "웹 앱으로 배포"하세요.
//    (자세한 절차는 README.md 참고)
// 2) 배포된 Web App URL을 아래 APPS_SCRIPT_URL에 붙여넣으세요.
//
// APPS_SCRIPT_URL이 비어있으면 앱은 자동으로 로컬 mock 데이터로 동작합니다.
// 즉, 실제 시트를 연결하지 않아도 UI/흐름을 바로 테스트할 수 있습니다.
//
// 주의: 여기에 절대 Google Sheets API 키나 서비스 계정 credential을 직접
// 넣지 마세요. Apps Script Web App URL은 "이 URL로 할 수 있는 일"이
// 스크립트에 정의된 함수로 한정되기 때문에 노출되어도 시트 원본이
// 그대로 뚫리지 않습니다. (반면 API 키/credential은 그 자체로 시트 전체에
// 접근 가능하므로 절대 클라이언트 코드에 넣으면 안 됩니다.)
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyDuVRYKT7_cIv9xAfDpfAzAbORJQlRvpYwwmNAlWKhZzGbS1dwmJMd2J5bkOYeuk2krg/exec"
};
