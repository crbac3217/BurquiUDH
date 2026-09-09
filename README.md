# 운동회 앱

친구/지인들과의 운동회를 위한 점수 트래킹 + 개인 히든미션(QR) 웹앱.
빌드 도구 없이 순수 HTML/CSS/JS로 만들어져 있어 GitHub Pages에 바로 올릴 수 있습니다.

## 폴더 구조

```
index.html                진입점, 뷰 컨테이너(#app)
css/style.css               스타일 (글래스모피즘, 배경 SVG 위에 카드 UI)
js/config.js                 백엔드(Apps Script) URL 설정
js/data.js                    ⚠️ 백엔드 미연결 시에만 쓰이는 오프라인 mock 데이터 (실사용 땐 전부 시트에서 옴)
js/api.js                      백엔드 fetch 래퍼 (URL 없으면 자동 mock 폴백)
js/app.js                      로그인 지속 + 해시 라우팅 + 화면 렌더링 + QR 스캔
js/vendor/jsQR.min.js          QR코드 디코딩 라이브러리 (MIT, 로컬에 vendor)
assets/background.svg          배경 이미지
sheet-template/운동회_시트.xlsx  구글시트로 바로 가져올 수 있는 백엔드 스프레드시트 템플릿
sheet-template/mission-qr-print.html  히든미션 칩용 QR 인쇄 시트
sheet-template/qr-codes/       미션칩 QR PNG 낱개 파일
```

## 로그인은 어떻게 유지되나요?

로그인 "지속"은 서버 세션 없이 `localStorage`만 사용합니다.

- 이름+PIN을 확인하고 입장하면 `localStorage.trackfield_user`에 이름이 저장됩니다.
- 페이지를 다시 열면 `app.js`의 라우터가 이 값을 확인해서, 있으면 자동으로 대시보드로 보내줍니다.
- 로그아웃하면 이 값이 지워지고 다시 로그인 화면으로 돌아갑니다.

같은 브라우저/기기에서만 유지되는 방식이라 별도 서버 세션 없이도 "다시 들어오면 로그인되어 있는" 경험을 만들 수 있습니다. (기기를 바꾸면 이름+PIN을 다시 입력해야 합니다)

반면 "누가 로그인할 수 있는지(참가자 명단)"는 코드에 하드코딩하지 않고 **백엔드(Google Sheet)에서 관리**합니다. 로그인 화면을 열 때마다 `API.getAllowedNames()`로 명단을 받아와서 검사하기 때문에, 사람을 추가/삭제해도 시트만 고치면 되고 앱을 다시 배포할 필요가 없습니다.

## 로그인 흐름 (이름 + 4자리 PIN)

다른 사람이 내 이름으로 들어오지 못하게, 이름만으로는 부족하고 PIN도 맞아야 합니다.

1. 이름을 입력 → 참가자 명단(`Participants` 시트)에 있는지 확인
2. 그 이름에 PIN이 아직 없으면(최초 로그인) → **PIN을 새로 설정하는 화면**이 뜸 (이때 "실제로 쓰는 비밀번호/PIN과 겹치지 말라"는 경고 문구가 함께 보입니다)
3. 이미 PIN이 있으면 → PIN 입력 화면이 뜨고, 맞아야 입장 가능
4. 로그인에 성공하면 이름이 `localStorage`에 저장되어 다음 방문부터는 자동 로그인(PIN 재입력 불필요)

PIN은 평문으로 저장하지 않고 Apps Script에서 **salt + SHA-256 해시**로만 시트(`Login`)에 저장합니다. 다만 **4자리 숫자는 경우의 수가 10,000개뿐이라, 시트에 접근할 수 있는 사람(진행자)이 마음만 먹으면 오프라인으로 무차별 대입해 알아낼 수 있습니다.** 그래서 앱은 PIN을 처음 만들 때 아래 경고를 반드시 보여줍니다:

> ⚠️ 이 PIN은 진행자가 무차별 대입으로 알아낼 수 있어요. 은행 비밀번호, 폰 잠금 PIN 등 실제로 쓰는 번호와 절대 겹치지 않는, 오늘 이 앱에서만 쓸 번호로 정해주세요.

- **PIN을 잊어버렸다면**: 진행자가 `Login` 시트에서 해당 참가자의 `pinHash`/`salt` 칸을 비워주면 다음 로그인 때 다시 "PIN 설정" 화면이 뜹니다.

## 히든미션은 어떻게 동작하나요? (QR 스캔 + 진행중/성공/실패)

**실물 QR 칩을 현장에 숨겨두고, 스캔한 사람에게 귀속**되는 방식입니다.

- 미션마다 고유한 `missionId`(예: `M01`)와 **배점(`points`)**이 있고, 그 값을 인쇄한 QR 칩을 현장 곳곳에 숨겨둡니다. (`sheet-template/mission-qr-print.html` 참고 — 잘라서 숨기면 됩니다. 이 인쇄물에는 미션 내용/점수가 아니라 QR과 ID만 나와요, 스캔해야 무슨 미션이고 몇 점인지 알 수 있게)
- 참가자가 앱에서 "QR 스캔해서 미션 찾기"를 누르면 카메라가 켜지고, QR을 비추면 자동으로 인식됩니다 (카메라가 안 되면 코드 직접 입력도 가능).
- 스캔한 `missionId`가 **아직 아무도 안 가져간 칩이면** → 그 사람 것이 되고 미션 내용 + 배점이 공개되며, 상태가 **`진행중`**으로 시작합니다.
- **이미 다른 사람이 가져간 칩이면** → "이미 다른 사람이 가져간 미션이에요"라고 뜨고 실패합니다. (`MissionChips` 시트의 `claimedBy`가 이미 채워져 있으면 거부)
- 한 사람이 **여러 개의 칩**을 가져갈 수 있습니다 — "내 히든미션" 화면에 지금까지 모은 미션이 배점 + 상태(진행중⏳/성공✅/실패❌)와 함께 리스트로 보입니다.
- **성공/실패 판정은 앱이 아니라 진행자가 합니다.** 참가자가 실제로 미션을 해내는 걸 진행자가 확인하면, `MissionChips` 시트의 `status` 칸을 `진행중`에서 `성공` 또는 `실패`로 직접 바꿔주면 됩니다. 앱은 그 값을 그대로 읽어서 보여줄 뿐입니다.
- **`status`가 `성공`인 칩의 `points`는 "내 점수" 화면을 열 때마다 자동으로 합산됩니다.** 별도로 어딘가에 옮겨 적지 않고, 앱이 `PersonalScoreLog`와 `MissionChips`(status=성공인 것만)를 그때그때 같이 읽어서 더하는 방식이라 — 진행자는 `status`만 바꾸면 되고, 나중에 실수를 정정해도(성공→실패로 되돌리는 등) 바로바로 반영됩니다.
- 동시에 여러 명이 같은 칩을 스캔하는 경우를 대비해, Apps Script 쪽에서 `LockService`로 잠깐 잠금을 걸고 처리합니다(아래 코드 참고) — 진짜로 먼저 스캔한 사람만 가져가게.

## 점수는 개인 vs 팀으로 나뉩니다

- **개인 점수 (`PersonalScoreLog`)**: MVP, 개인 등수처럼 한 사람에게 붙는 점수. **본인만 볼 수 있어요** — 앱은 로그인한 사람 이름으로만 조회하고, 다른 사람 개인 점수를 보여주는 화면 자체가 없습니다. (진행자는 시트의 `PersonalTotals`에서 전체를 볼 수 있고, 개인 시상 정할 때 참고용으로 씁니다)
- **팀 점수 (`TeamScoreLog`)**: 종목 승리/패배처럼 팀 단위로 매기는 점수. **누구나 볼 수 있는 공개 순위**(대시보드의 "팀 점수판")이고, 운동회 마지막에 이 합산으로 우승팀이 정해집니다.

두 로그 다 이전과 같은 누적 로그 형식이에요 — 점수를 줄 때마다 한 행 추가, 총점은 자동 합산.

**"내 점수"(개인 총점)에는 세 가지가 다 합쳐집니다**: ① `PersonalScoreLog`에 진행자가 수동으로 넣은 점수, ② 성공 처리된 히든미션의 배점, ③ **내가 속한 팀이 `TeamScoreLog`에서 받은 점수**. 즉 우리 팀이 이기면 그 점수가 팀원 각자의 개인 총점에도 그대로 더해집니다 — 팀 우승 여부(공개 순위)와 개인 총점(비공개, 미션/시상 포함)을 나누되, 팀 성과가 개인 성과에서 빠지지는 않게 한 거예요. (셋 다 시트에 실제로 합쳐서 옮겨 적진 않고, 조회할 때마다 세 곳을 읽어서 합산 — 그래서 진행자가 나중에 값을 정정해도 바로 반영됩니다)

> ⚠️ 참고: `getMyScoreLog`는 클라이언트가 보낸 `name` 파라미터로만 필터링합니다. 앱 UI는 항상 로그인한 본인 이름으로만 요청하니 화면에 남의 개인 점수가 보일 일은 없지만, Apps Script URL 자체는 "URL을 아는 사람은 정의된 액션을 호출은 할 수 있다"는 한계가 있으므로(위 섹션 참고) 매우 민감한 정보를 넣는 용도로는 적합하지 않습니다. 친구들 운동회 재미용 점수 수준에서는 문제없는 선택입니다.

## participant 시트: 팀 / 성별 / 커플

`Participants` 시트 컬럼: `name`, `gender`(남/여), `team`(흑팀/백팀), `partner`(커플 상대 이름), `tier`(1~3), `nemesis`(라이벌 이름).

기본 템플릿은 아래 6커플 12명의 `name`/`gender`/`team`/`partner`가 미리 채워져 있습니다 (팀은 이름 순서대로 흑/백 번갈아 6:6 배정 — 커플이 다른 팀으로 나뉘도록 기본 설정했으니, 같은 팀으로 묶고 싶으면 시트에서 `team` 값만 바꾸면 됩니다):

| 이름 | 성별 | 커플 상대 |
|---|---|---|
| 이학균 | 남 | 김여경 |
| 김여경 | 여 | 이학균 |
| 홍상웅 | 남 | 최연수 |
| 최연수 | 여 | 홍상웅 |
| 이재열 | 남 | 박지원 |
| 박지원 | 여 | 이재열 |
| 송효준 | 남 | 전주현 |
| 전주현 | 남 | 송효준 |
| 강이수 | 남 | 박시안 |
| 박시안 | 여 | 강이수 |
| 박종혁 | 남 | 황은비 |
| 황은비 | 여 | 박종혁 |

`tier`(1~3)와 `nemesis`(라이벌)는 **비어있는 채로** 들어가 있습니다 — 어떻게 나눌지는 알려주지 않아서, 시트에서 직접 채워주세요. 이 두 값은 아래 히든미션 템플릿 치환에 쓰입니다.

### 히든미션 템플릿: [파트너] / [네메시스] / [티어]

`MissionChips` 시트의 `mission` 칸에 아래 토큰을 넣으면, **그 칩을 가져간 사람 기준**으로 자동 치환되어 화면에 표시됩니다.

| 토큰 | 치환되는 값 | 예시 템플릿 → 실제 표시 |
|---|---|---|
| `[파트너]` | 그 사람의 `partner` | "피구에서 [파트너] 맞춰서 아웃시키기" → "피구에서 김여경 맞춰서 아웃시키기" |
| `[네메시스]` | 그 사람의 `nemesis` | "부리또 듀얼에서 [네메시스] 상대로 승리하기" → "부리또 듀얼에서 최연수 상대로 승리하기" |
| `[티어]` | 그 사람의 `tier` | "발야구에서 [티어]루타 달성하기" → "발야구에서 2루타 달성하기" |

`Participants`에 해당 값이 비어있으면 "(파트너 미지정)"처럼 안내 문구가 대신 표시되니, 이 토큰을 쓰는 미션을 배치하기 전에 `tier`/`nemesis`를 꼭 채워두세요. 치환은 클라이언트가 아니라 **Apps Script(서버)에서** 처리해서, 남의 파트너/네메시스가 실수로 잘못 보이는 일은 없습니다 — 항상 그 칩을 가져간 사람 본인 기준으로만 계산됩니다.

## 관리자 패널 (`ADMIN_NAME`으로 로그인 시)

`js/config.js`의 `ADMIN_NAME`(기본값 `"이학균"`)으로 로그인하면 대시보드에 **🛠️ 관리자 패널** 메뉴가 추가로 뜹니다. 이 이름으로 로그인한 사람은 일반 참가자 화면(내 점수, 내 히든미션 등)도 그대로 다 볼 수 있고, 추가로:

1. **대회 시작 여부 토글** — 꺼져있는(기본값) 동안은 관리자를 제외한 모든 참가자의 대시보드가 **"👥 우리팀 보기"만 남고 나머지 메뉴가 다 감춰집니다** (직접 주소창에 `#/scores`처럼 쳐서 들어가려고 해도 라우터가 대시보드로 돌려보냅니다). 다 같이 모이기 전에 미리 로그인만 해두고 팀 확인 정도만 하게 하고 싶을 때 켜두는 "대기실" 스위치예요. 관리자가 **켜면** 그때부터 전체 메뉴(종목 목록/점수판/미션 등)가 열립니다.
2. **지금 진행 중인 종목 설정** — 드롭다운에서 종목을 고르면 `Settings.currentEvent`에 저장되고, 모든 참가자의 대시보드 상단에 "🔴 지금 진행 중: OO" 배너로 뜹니다.
3. 종목을 설정하면 그 아래로 결과 선언 UI가 나타납니다:
   - **팀 결과 선언**: 흑팀/백팀 승리 버튼 (점수 직접 입력) → `TeamScoreLog`에 한 줄 추가
   - **개인점수 선언** / **개인상 선언**: 이름 선택 + 비고 + 점수 입력 → `PersonalScoreLog`에 한 줄 추가 (내부적으로는 같은 동작이고, 구분은 그냥 UI 편의상 나눠놓은 것)
   - **관련 히든미션 판정**: `MissionChips`에서 `event`가 지금 설정한 종목과 같은 칩들이 목록으로 뜨고, 진행중/성공/실패 버튼을 눌러 바로 판정 (시트를 직접 열 필요 없음)
4. **개인 랭킹 공개 토글** — 켜면 모든 참가자의 대시보드에 "🏅 개인 랭킹" 메뉴가 나타나고 전체 개인 순위를 볼 수 있습니다. 꺼져있으면 관리자 본인만 미리보기로 볼 수 있고, 다른 사람에게는 메뉴 자체가 안 보입니다. (평소엔 개인 점수가 본인에게만 보이는 게 기본값이라는 건 안 바뀝니다 — 이건 "행사 마지막에 다 같이 순위 공개" 같은 연출용 스위치입니다)

> ⚠️ 관리자 판별은 그냥 **이름이 `ADMIN_NAME`과 정확히 같은지**로만 체크합니다 (다른 로그인처럼 PIN도 걸려있긴 하지만, 이름 자체가 이 README/코드에 그대로 적혀있어서 완전한 보안은 아닙니다). Apps Script 쪽 관리자 액션들도 전부 `adminName === ADMIN_NAME`을 서버에서 다시 확인하니 URL을 아는 사람이 이름만 흉내내서 관리자 액션을 부르는 게 완전히 막히진 않습니다 — 친구들끼리 하는 행사 규모에서 감수하는 수준의 트레이드오프입니다 (같은 철학이 PIN/Apps Script URL 노출 부분에도 이미 적용돼 있어요). 정말 걱정되면 `ADMIN_NAME`을 아무도 모르는 이름으로 바꿔서 `js/config.js`와 Apps Script 양쪽에 똑같이 넣어두세요.

## 왜 Google Sheets 링크나 키를 코드에 직접 안 넣나요?

GitHub Pages는 정적 호스팅이라 리포에 올라간 모든 JS 코드는 브라우저에서 그대로 볼 수 있습니다.
Google Sheets API 키나 서비스 계정 credential을 클라이언트 코드에 넣으면 **시트 전체**가 노출됩니다.

그래서 이 프로젝트는 **Google Apps Script를 프록시로 사용**합니다:

- 실제 시트는 비공개로 유지됩니다.
- Apps Script를 "웹 앱"으로 배포하면 URL 하나가 생기는데, 이 URL로 할 수 있는 일은 **스크립트에 직접 작성한 함수로만 한정**됩니다.
- 즉 이 URL이 공개되어도 시트를 통째로 읽거나 마음대로 수정할 수는 없고, 딱 코드에 정의한 동작만 가능합니다.

완벽한 보안은 아니지만(URL을 아는 사람은 정의된 액션은 호출 가능), 친구들끼리 하는 운동회 앱 수준에는 충분하고 별도 유료 서비스나 SDK 없이 무료로 구현할 수 있습니다.

## 스프레드시트 구조 (`sheet-template/운동회_시트.xlsx`)

이 파일을 구글 시트에 **파일 > 가져오기 > 업로드**로 올리면 아래 시트가 그대로 들어옵니다.

- **DB**: 다른 시트/앱이 참조하는 마스터 리스트. **1행=종목, 2행=아이콘, 3행=종목 설명, 4행=인원(참가 가능 인원, "ALL" 또는 숫자), 5행=점수(그 종목 기본 배점)**. 참가자 이름 목록은 `Participants` 시트가 대신하니 여기엔 없어도 됩니다. 앱의 "종목 목록" 화면이 이 시트를 직접 읽어오기 때문에, 여기서 종목/인원/점수를 추가·수정하면 코드 수정이나 재배포 없이 바로 앱에 반영됩니다 — `js/data.js`는 이제 백엔드 연결이 안 됐을 때만 쓰이는 예비용일 뿐입니다. (`인원`/`점수` 행이 아예 없는 예전 구조여도 에러 없이 그냥 빈 값으로 처리됩니다)
  > ⚠️ 다른 시트들(Participants/Login/PersonalScoreLog/TeamScoreLog/MissionChips)의 이름 드롭다운은 예전에 "DB 4행(이름)"을 참조하도록 걸려있을 수 있어요. DB 시트 행 구성을 바꿨다면(이름 행을 지웠거나 위치가 밀렸다면), 그 드롭다운들의 참조 범위(데이터 > 데이터 확인)를 `Participants!$A$2:$A$13`처럼 실제 이름이 있는 곳으로 다시 잡아줘야 드롭다운이 정상적으로 뜹니다. (드롭다운이 깨져도 앱 동작 자체엔 영향 없고, 셀에 이름 수동 입력하는 데는 문제 없어요)
- **Participants**: `name`, `gender`, `team`, `partner`, `tier`, `nemesis` — 명단 + 성별 + 팀 + 커플 + 티어 + 네메시스(라이벌). 12명 6커플의 이름/성별/팀/파트너는 미리 채워져 있고, `tier`/`nemesis`는 비어있으니 직접 채워주세요.
- **Login**: `name`, `pinHash`, `salt` — PIN 로그인 정보 (해시만 저장, 앱이 자동으로 채움)
- **PersonalScoreLog**: `name`, `event`, `note`, `points` — 개인 점수 누적 로그. **본인만** 앱에서 조회 가능
- **TeamScoreLog**: `team`, `event`, `note`, `points` — 팀 점수 누적 로그. **누구나** 앱에서 조회 가능 (우승팀 판정용)
- **MissionChips**: `missionId`, `mission`(`[파트너]`/`[네메시스]`/`[티어]` 토큰 사용 가능), `points`, `claimedBy`, `claimedAt`, `status`(진행중/성공/실패), `event` — QR 히든미션 칩 목록. `event`가 채워진 칩은 관리자 패널에서 그 종목을 설정했을 때 판정 목록에 뜨고, 비어있으면(`null`) 특정 종목에 안 묶인 상시 미션입니다. `status`가 `성공`인 칩의 점수는 앱이 "내 점수" 조회할 때 실시간으로 읽어서 합산합니다(별도 적립 절차 없음). 칩을 더 만들고 싶으면 이 시트에 행을 추가하고 `sheet-template/qr-codes`용 QR을 새로 생성하면 됩니다.
- **TeamLeaderboard**: `SUMIF`로 팀별 총점을 자동 계산하는 읽기 전용 뷰 (앱 없이 시트만 봐도 우승팀 확인 가능)
- **PersonalTotals**: `SUMIF`로 개인별 총점을 자동 계산하는 **진행자 전용** 참고용 뷰 (앱에는 노출되지 않음 — 개인 시상 정할 때 쓰세요)
- **Settings**: `key`, `value` 두 컬럼짜리 시트. 아래처럼 3행이면 됩니다 — 관리자 패널이 이 값을 읽고 씁니다.

  | key | value |
  |---|---|
  | currentEvent | (비워두기) |
  | personalRankingVisible | FALSE |
  | eventStarted | FALSE |

## Google Apps Script 백엔드 연결하기

1. 위 xlsx를 구글 시트로 가져옵니다.
2. 스프레드시트 메뉴에서 **확장 프로그램 > Apps Script**를 엽니다.
3. 아래 코드를 붙여넣습니다. (`doGet`/`doPost`가 액션을 분기하고, 각 함수가 시트를 읽고 씁니다)

   ```js
   function doGet(e) {
     const action = e.parameter.action;
     if (action === "getEvents") return respond(getEvents());
     if (action === "getAllowedNames") return respond(getAllowedNames());
     if (action === "getMyTeam") return respond(getMyTeam(e.parameter.name));
     if (action === "hasPin") return respond(hasPin(e.parameter.name));
     if (action === "getMyScoreLog") return respond(getMyScoreLog(e.parameter.name));
     if (action === "getTeamScoreLog") return respond(getTeamScoreLog());
     if (action === "getMyMissions") return respond(getMyMissions(e.parameter.name));
     if (action === "getSettings") return respond(getSettings());
     if (action === "getMissionsByEvent") return respond(getMissionsByEvent(e.parameter.event));
     if (action === "getPersonalRanking") return respond(getPersonalRanking(e.parameter.name));
     return respond({ error: "unknown action" });
   }

   function doPost(e) {
     const body = JSON.parse(e.postData.contents);
     if (body.action === "setPin") return respond(setPin(body.name, body.pin));
     if (body.action === "login") return respond(login(body.name, body.pin));
     if (body.action === "claimMissionChip") return respond(claimMissionChip(body.name, body.chipId));
     if (body.action === "setCurrentEvent") return respond(setCurrentEvent(body.adminName, body.eventName));
     if (body.action === "setPersonalRankingVisible") return respond(setPersonalRankingVisible(body.adminName, body.visible));
     if (body.action === "addTeamScore") return respond(addTeamScore(body.adminName, body.team, body.event, body.note, body.points));
     if (body.action === "addPersonalScore") return respond(addPersonalScore(body.adminName, body.targetName, body.event, body.note, body.points));
     if (body.action === "addPersonalScoresBatch") return respond(addPersonalScoresBatch(body.adminName, body.entries));
     if (body.action === "setMissionStatus") return respond(setMissionStatus(body.adminName, body.chipId, body.status));
     if (body.action === "setEventStarted") return respond(setEventStarted(body.adminName, body.started));
     return respond({ error: "unknown action" });
   }

   function respond(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj))
       .setMimeType(ContentService.MimeType.JSON);
   }

   // ---- 종목 목록 (DB 시트: 1행 종목, 2행 아이콘, 3행 설명, 4행 인원, 5행 점수 — 열 방향으로 나열) ----
   // 4행(인원)/5행(점수)이 없는 예전 시트여도 에러 없이 그냥 빈 값으로 처리됩니다.

   function getEvents() {
     const sheet = SpreadsheetApp.getActive().getSheetByName("DB");
     const values = sheet.getDataRange().getValues(); // [ [종목,...], [아이콘,...], [설명,...], [인원,...], [점수,...] ]
     const [names, icons, descs, capacities, points] = values;
     const events = [];
     for (let c = 1; c < names.length; c++) {
       if (!names[c]) continue;
       events.push({
         name: names[c],
         icon: icons[c] || "🏅",
         desc: descs[c] || "",
         capacity: capacities ? capacities[c] || null : null,
         points: points && points[c] ? Number(points[c]) : 0,
       });
     }
     return events;
   }

   // ---- 참가자 명단 (Participants 시트: name, gender, team, partner, tier, nemesis) ----

   function getAllowedNames() {
     const sheet = SpreadsheetApp.getActive().getSheetByName("Participants");
     const values = sheet.getDataRange().getValues();
     return values.slice(1).filter((r) => r[0]).map((r) => r[0]);
   }

   function findParticipant_(name) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("Participants");
     const values = sheet.getDataRange().getValues(); // [name, gender, team, partner, tier, nemesis]
     for (let i = 1; i < values.length; i++) {
       if (values[i][0] === name) {
         const [n, gender, team, partner, tier, nemesis] = values[i];
         return { name: n, gender, team, partner, tier, nemesis };
       }
     }
     return null;
   }

   // 이 사람의 팀 이름 + 같은 팀 사람들 이름 목록 ("우리팀 보기" 화면용).
   function getMyTeam(name) {
     const p = findParticipant_(name);
     if (!p || !p.team) return { team: null, teammates: [] };
     const sheet = SpreadsheetApp.getActive().getSheetByName("Participants");
     const values = sheet.getDataRange().getValues();
     const teammates = values.slice(1)
       .filter((r) => r[0] && r[2] === p.team)
       .map((r) => r[0]);
     return { team: p.team, teammates };
   }

   // mission 텍스트의 [파트너]/[네메시스]/[티어]를, 그 미션을 가져간 사람(name) 기준으로 치환.
   function resolveMissionText_(template, name) {
     const p = findParticipant_(name);
     return template
       .split("[파트너]").join(p && p.partner ? p.partner : "(파트너 미지정)")
       .split("[네메시스]").join(p && p.nemesis ? p.nemesis : "(네메시스 미지정)")
       .split("[티어]").join(p && p.tier ? String(p.tier) : "(티어 미지정)");
   }

   // ---- PIN 로그인 (Login 시트: name, pinHash, salt) ----

   function hashPin_(pin, salt) {
     const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin + salt);
     return bytes.map((b) => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0")).join("");
   }

   function findLoginRow_(name) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("Login");
     const values = sheet.getDataRange().getValues(); // [name, pinHash, salt]
     for (let i = 1; i < values.length; i++) {
       if (values[i][0] === name) return { sheet, rowIndex: i + 1, row: values[i] };
     }
     return null;
   }

   function hasPin(name) {
     const found = findLoginRow_(name);
     return { hasPin: !!(found && found.row[1]) };
   }

   function setPin(name, pin) {
     if (!/^\d{4}$/.test(pin)) return { success: false, error: "invalid pin" };
     const found = findLoginRow_(name);
     if (!found) return { success: false, error: "not in list" };
     if (found.row[1]) return { success: false, error: "already set" }; // 가로채기 방지
     const salt = Utilities.getUuid();
     const hash = hashPin_(pin, salt);
     found.sheet.getRange(found.rowIndex, 2, 1, 2).setValues([[hash, salt]]);
     return { success: true };
   }

   function login(name, pin) {
     const found = findLoginRow_(name);
     if (!found || !found.row[1]) return { success: false };
     const hash = hashPin_(pin, found.row[2]);
     return { success: hash === found.row[1] };
   }

   // ---- 개인 점수 로그 ----
   // PersonalScoreLog(수동 입력분) + MissionChips(status=성공인 히든미션) + 소속 팀의
   // TeamScoreLog(우리팀이 받은 점수도 내 개인 총점에 포함)를 합쳐서 반환합니다.
   // name으로 필터링해서 그 사람 것만 반환 — 앱은 항상 로그인한 본인 이름으로만 요청합니다.
   // 전부 실시간으로 읽기만 하므로, 진행자가 나중에 값을 정정해도 바로 반영됩니다.

   function getMyScoreLog(name) {
     const personalSheet = SpreadsheetApp.getActive().getSheetByName("PersonalScoreLog");
     const personal = personalSheet.getDataRange().getValues().slice(1)
       .filter((r) => r[0] === name)
       .map((r) => ({ event: r[1], note: r[2], points: r[3] }));

     const chipSheet = SpreadsheetApp.getActive().getSheetByName("MissionChips");
     const missionScores = chipSheet.getDataRange().getValues().slice(1)
       .filter((r) => r[0] && r[3] === name && r[5] === "성공")
       .map((r) => ({ event: "개인미션", note: resolveMissionText_(r[1], name), points: r[2] }));

     let teamScores = [];
     const participant = findParticipant_(name);
     if (participant && participant.team) {
       const teamSheet = SpreadsheetApp.getActive().getSheetByName("TeamScoreLog");
       teamScores = teamSheet.getDataRange().getValues().slice(1)
         .filter((r) => r[0] === participant.team)
         .map((r) => ({ event: r[1], note: `${r[2]} (우리팀)`, points: r[3] }));
     }

     return personal.concat(missionScores, teamScores);
   }

   // ---- 팀 점수 로그 (TeamScoreLog 시트: team, event, note, points) ----
   // 필터링 없이 전체 반환 — 누구나 볼 수 있는 공개 순위입니다.

   function getTeamScoreLog() {
     const sheet = SpreadsheetApp.getActive().getSheetByName("TeamScoreLog");
     const values = sheet.getDataRange().getValues();
     return values.slice(1).filter((r) => r[0])
       .map((r) => ({ team: r[0], event: r[1], note: r[2], points: r[3] }));
   }

   // ---- 히든미션 QR 칩 ----
   // MissionChips 시트 컬럼: missionId(A) mission(B) points(C) claimedBy(D) claimedAt(E) status(F)

   function getMyMissions(name) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("MissionChips");
     const values = sheet.getDataRange().getValues();
     return values.slice(1)
       .filter((r) => r[0] && r[3] === name)
       .map((r) => ({
         id: r[0],
         mission: resolveMissionText_(r[1], name),
         points: r[2],
         status: r[5] || "진행중",
       }));
   }

   function claimMissionChip(name, chipId) {
     const lock = LockService.getScriptLock();
     lock.waitLock(5000); // 동시에 같은 칩을 스캔해도 한 명만 가져가게
     try {
       const sheet = SpreadsheetApp.getActive().getSheetByName("MissionChips");
       const values = sheet.getDataRange().getValues();
       for (let i = 1; i < values.length; i++) {
         if (values[i][0] === chipId) {
           const claimedBy = values[i][3];
           if (claimedBy && claimedBy !== name) {
             return { success: false, error: "claimed_by_other" };
           }
           const alreadyMine = claimedBy === name;
           if (!alreadyMine) {
             // claimedBy, claimedAt, status를 한 번에 채웁니다 (진행중으로 시작)
             sheet.getRange(i + 1, 4, 1, 3).setValues([[name, new Date(), "진행중"]]);
           }
           const status = alreadyMine ? (values[i][5] || "진행중") : "진행중";
           return {
             success: true,
             mission: resolveMissionText_(values[i][1], name),
             points: values[i][2],
             status,
             alreadyMine,
           };
         }
       }
       return { success: false, error: "not_found" };
     } finally {
       lock.releaseLock();
     }
   }

   // ---- 관리자(이학균) 전용 ----
   // Settings 시트: key, value (행 2개: currentEvent / personalRankingVisible)

   const ADMIN_NAME = "이학균"; // js/config.js의 ADMIN_NAME과 반드시 똑같이 맞추세요.

   function isAdmin_(name) {
     return name === ADMIN_NAME;
   }

   function getSettingValue_(key) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("Settings");
     const values = sheet.getDataRange().getValues();
     for (let i = 1; i < values.length; i++) {
       if (values[i][0] === key) return values[i][1];
     }
     return null;
   }

   function setSettingValue_(key, value) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("Settings");
     const values = sheet.getDataRange().getValues();
     for (let i = 1; i < values.length; i++) {
       if (values[i][0] === key) {
         sheet.getRange(i + 1, 2).setValue(value);
         return;
       }
     }
     sheet.appendRow([key, value]);
   }

   function getSettings() {
     return {
       currentEvent: getSettingValue_("currentEvent") || null,
       personalRankingVisible: getSettingValue_("personalRankingVisible") === true,
       eventStarted: getSettingValue_("eventStarted") === true,
     };
   }

   function setCurrentEvent(adminName, eventName) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     setSettingValue_("currentEvent", eventName);
     return { success: true };
   }

   // 대회 시작 전엔(관리자 제외) 참가자 대시보드가 "우리팀 보기" 말고 다 감춥니다.
   function setEventStarted(adminName, started) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     setSettingValue_("eventStarted", started === true || started === "true");
     return { success: true };
   }

   function setPersonalRankingVisible(adminName, visible) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     setSettingValue_("personalRankingVisible", visible === true || visible === "true");
     return { success: true };
   }

   // 팀 결과 선언 → TeamScoreLog에 한 줄 추가.
   function addTeamScore(adminName, team, event, note, points) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     SpreadsheetApp.getActive().getSheetByName("TeamScoreLog")
       .appendRow([team, event, note, Number(points)]);
     return { success: true };
   }

   // 개인점수/개인상 선언 → PersonalScoreLog에 한 줄 추가.
   function addPersonalScore(adminName, targetName, event, note, points) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     SpreadsheetApp.getActive().getSheetByName("PersonalScoreLog")
       .appendRow([targetName, event, note, Number(points)]);
     return { success: true };
   }

   // 위와 같지만 여러 건을 한 번에 추가 (관리자 패널의 "전송 대기 목록"에서 한번에 전송할 때).
   // entries: [{ targetName, event, note, points }, ...]
   function addPersonalScoresBatch(adminName, entries) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     if (!entries || !entries.length) return { success: true, count: 0 };
     const sheet = SpreadsheetApp.getActive().getSheetByName("PersonalScoreLog");
     const rows = entries.map((e) => [e.targetName, e.event, e.note, Number(e.points)]);
     sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
     return { success: true, count: rows.length };
   }

   // 지금 설정된 종목(event열, G)에 묶인 미션칩 목록. 관리자 패널의 판정 리스트용.
   // MissionChips 컬럼: missionId(A) mission(B) points(C) claimedBy(D) claimedAt(E) status(F) event(G)
   function getMissionsByEvent(eventName) {
     const sheet = SpreadsheetApp.getActive().getSheetByName("MissionChips");
     const values = sheet.getDataRange().getValues();
     return values.slice(1)
       .filter((r) => r[0] && r[6] === eventName)
       .map((r) => ({
         id: r[0],
         mission: r[3] ? resolveMissionText_(r[1], r[3]) : r[1],
         points: r[2],
         claimedBy: r[3] || null,
         status: r[5] || null,
       }));
   }

   // 관리자가 미션 상태를 직접 성공/실패/진행중으로 바꿉니다 (시트 직접 편집 대신 앱에서 처리).
   function setMissionStatus(adminName, chipId, status) {
     if (!isAdmin_(adminName)) return { success: false, error: "not_admin" };
     if (["진행중", "성공", "실패"].indexOf(status) === -1) {
       return { success: false, error: "invalid_status" };
     }
     const sheet = SpreadsheetApp.getActive().getSheetByName("MissionChips");
     const values = sheet.getDataRange().getValues();
     for (let i = 1; i < values.length; i++) {
       if (values[i][0] === chipId) {
         sheet.getRange(i + 1, 6).setValue(status); // F열 = status
         return { success: true };
       }
     }
     return { success: false, error: "not_found" };
   }

   // 전체 공개 개인 랭킹. personalRankingVisible이 꺼져있으면 관리자 본인 외엔 가려서 반환.
   function getPersonalRanking(name) {
     const visible = getSettings().personalRankingVisible;
     if (!visible && !isAdmin_(name)) return { visible: false, ranking: [] };
     const ranking = getAllowedNames()
       .map((n) => ({
         name: n,
         total: getMyScoreLog(n).reduce((sum, e) => sum + Number(e.points || 0), 0),
       }))
       .sort((a, b) => b.total - a.total);
     return { visible: true, ranking };
   }
   ```

4. 우측 상단 **배포 > 새 배포** → 유형 "웹 앱" → 액세스 권한 "모든 사용자"로 배포합니다.
5. 발급된 웹 앱 URL을 `js/config.js`의 `APPS_SCRIPT_URL`에 붙여넣습니다.

`APPS_SCRIPT_URL`이 비어 있으면 앱은 자동으로 `js/data.js`의 mock 데이터로 동작하니, 백엔드 없이도 UI/흐름 테스트가 가능합니다.

## 히든미션 QR 칩 준비하기

1. `sheet-template/mission-qr-print.html`을 브라우저로 열어서 인쇄(또는 인쇄 → PDF로 저장)합니다. `sheet-template/qr-codes/M01.png` ~ `M08.png` 낱개 파일도 있으니 필요하면 따로 써도 됩니다.
2. 인쇄물을 잘라서 현장 곳곳에 숨겨둡니다. (라벨에는 QR과 ID만 있고 미션 내용은 없어요 — 스캔해야 알 수 있음)
3. 각 ID가 어떤 미션인지는 `MissionChips` 시트에서만 확인할 수 있습니다.
4. 칩을 더 추가하고 싶으면 `MissionChips` 시트에 새 `missionId`/`mission`/`points` 행을 추가하고, 같은 방식으로 QR을 새로 만들면 됩니다 (파이썬 `qrcode` 라이브러리로 `qrcode.make("M09").save("M09.png")` 하듯이 생성).
5. 행사 당일, 참가자가 스캔해서 `진행중`이 된 미션을 실제로 해내는지 확인하고 `status`를 `성공`/`실패`로 바꿔주세요 — 이게 앱의 "내 히든미션" 화면에 그대로 반영되고, `성공`이면 그 칩의 `points`가 "내 점수" 화면에도 바로 합산되어 보입니다.

## GitHub Pages로 배포하기

1. 이 폴더를 GitHub 리포지토리로 push합니다.
2. 리포지토리 **Settings > Pages**로 이동합니다.
3. Source를 `Deploy from a branch`로 설정하고, 브랜치는 `main`(또는 사용 중인 브랜치), 폴더는 `/ (root)`로 지정합니다.
4. 잠시 후 `https://<username>.github.io/<repo>/`에서 접속할 수 있습니다.

QR 스캔 기능은 카메라 접근이 필요해서 **HTTPS에서만 동작**합니다 — GitHub Pages는 기본이 HTTPS라 문제없지만, 로컬에서 테스트할 때 `http://localhost`는 예외로 허용되니 그대로 테스트 가능합니다.

## 남은 작업 / TODO

- 미션레이스 서브미션 추가 (현재 2개: 레몬 먹고 휘파람 불기 / 사격으로 캔 넘어뜨리기)
- Apps Script 실제 배포 및 `config.js` 연결
- 점수 입력은 진행자가 `PersonalScoreLog`/`TeamScoreLog` 시트에 직접 행을 추가하는 방식 (앱에서 점수를 입력하는 UI는 아직 없음 — 필요하면 추가 가능)
- 미션 성공/실패 판정도 진행자가 `MissionChips.status`를 직접 바꾸는 방식 (앱 안에 진행자용 판정 UI는 아직 없음)
- 미션칩을 실제로 몇 개, 어디에 숨길지는 현장 상황 보고 정하기
