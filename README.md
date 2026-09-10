# 운동회 앱

친구/지인들과의 운동회를 위한 점수 트래킹 + 개인 히든미션(QR) 웹앱.
빌드 도구 없이 순수 HTML/CSS/JS + Firebase(Firestore)로 돌아갑니다. GitHub Pages에 그대로 올립니다.

백엔드는 **Firestore**라서 점수/설정이 **실시간으로** 모든 기기에 반영됩니다. (관리자가 팀 승리를 선언하면 모두의 점수판이 즉시 갱신, "대회 시작"을 켜면 모두의 대시보드가 즉시 잠금 해제)

## 폴더 구조

```
index.html                     진입점 + Firebase SDK 로드 + 캐시버스팅
css/style.css                   스타일 (글래스모피즘, 배경 SVG 위 카드 UI)
js/config.js                    Firebase 설정(firebaseConfig) + ADMIN_NAME
js/api.js                       Firestore 래퍼 (화면이 쓰는 모든 read/write, settings 실시간 구독)
js/app.js                       로그인 지속 + 해시 라우팅 + 화면 렌더링 + QR 스캔
js/vendor/jsQR.min.js           QR코드 디코딩 라이브러리 (MIT, 로컬 vendor)
assets/background.svg           배경 이미지
firestore.rules                 Firestore 보안 규칙 (콘솔에 붙여넣을 것)
sheet-template/easy-sheet.pdf · middle-sheet.pdf · hard-sheet.pdf   난이도별 QR 인쇄 PDF (A4, QR 2cm)
sheet-template/qr-codes/        미션칩 QR PNG 낱개 파일 (58개, 파일명 = missionId)
ToClaude/                       (git 제외) 마이그레이션 원본 xlsx 등 작업용
```

## Firestore 데이터 모델

| 컬렉션/문서 | 내용 |
|---|---|
| `config/settings` | `{ currentEvent, personalRankingVisible, eventStarted }` — 앱이 실시간 구독 |
| `config/admin` | `{ uid }` — 관리자 익명 UID 하나. 비어있으면 ADMIN_NAME으로 처음 로그인한 사람이 자동 등록 |
| `events/{eNN}` | `{ name, icon, desc, capacity, points, order }` — 종목 마스터 (종목 목록 화면이 여기서 읽음) |
| `participants/{이름}` | `{ name, gender, team, partner, tier, nemesis }` |
| `logins/{이름}` | `{ name, pinHash, salt }` — PIN은 salt+SHA-256 해시만 저장 |
| `missionChips/{missionId}` | `{ mission, points, event, claimedBy, claimedAt, status }` |
| `personalScores/{auto}` | `{ name, event, note, points, ts }` — 추가 전용 로그 |
| `teamScores/{auto}` | `{ team, event, note, points, ts }` — 추가 전용 로그 |

편집은 Firebase 콘솔 > Firestore Database에서 직접 합니다 (표 형태 UI).

## Firebase 최초 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성
2. **Firestore Database** 만들기 (지역 `asia-northeast3` 서울)
3. **Authentication > Sign-in method > 익명(Anonymous)** 사용 설정
4. **프로젝트 설정 > 내 앱 > 웹 앱(</>)** → `firebaseConfig`를 `js/config.js`에 붙여넣기
5. **Firestore Database > 규칙** 탭에 `firestore.rules` 내용을 통째로 붙여넣고 **게시**
6. 데이터 초기 세팅: `ToClaude/`의 마이그레이션 스크립트(`migrate.mjs`)를 규칙이 테스트 모드일 때 1회 실행하거나, 콘솔에서 직접 입력. (이미 완료돼 있으면 생략)

> `firebaseConfig`의 `apiKey`는 비밀이 아니라 프로젝트 식별자입니다. 노출돼도 괜찮고, 실제 보안은 `firestore.rules`가 합니다.

## 로그인은 어떻게 유지되나요?

- 이름+PIN을 확인하고 입장하면 `localStorage.trackfield_user`에 이름이 저장됩니다.
- 페이지를 다시 열면 라우터가 이 값을 확인해서 자동으로 대시보드로 보내줍니다.
- 로그아웃하면 지워지고 로그인 화면으로 돌아갑니다.
- "누가 로그인할 수 있는지(명단)"는 `participants` 컬렉션의 문서 ID 목록입니다. 사람 추가/삭제는 콘솔에서만 하면 되고 앱 재배포 불필요.

## 로그인 흐름 (이름 + 4자리 PIN)

1. 이름 입력 → `participants`에 있는지 확인
2. `logins/{이름}`에 `pinHash`가 없으면(최초) → **PIN 설정 화면** (실제 쓰는 비밀번호와 겹치지 말라는 경고 포함)
3. 있으면 → PIN 입력 화면. 클라이언트가 `sha256(pin + salt)`를 계산해 저장된 해시와 비교
4. 성공하면 이름을 `localStorage`에 저장 → 다음부터 자동 로그인

PIN 해시는 클라이언트에서 검증합니다. 즉 `logins` 문서를 읽을 수 있는 사람은 해시를 얻어 4자리(1만 가지)를 오프라인 무차별 대입할 수 있습니다 — Apps Script 버전과 위험도 동일한, 친구 행사 수준에서 감수하는 트레이드오프입니다. **실제로 쓰는 PIN과 겹치지 않게** 안내 문구가 뜨는 이유입니다. 규칙은 "이미 설정된 pinHash 덮어쓰기"를 막아 계정 가로채기는 방지합니다. (PIN 초기화는 콘솔에서 해당 문서의 `pinHash`/`salt` 필드를 지우면 됩니다)

## 히든미션은 어떻게 동작하나요? (QR 스캔 + 진행중/성공/실패)

- 미션칩마다 고유 `missionId`(예: `EZ02RT1`)와 배점이 있고, 그 ID를 QR로 인쇄해 현장에 숨깁니다.
- 참가자가 "QR 스캔"으로 칩을 읽으면 트랜잭션으로 `claimedBy`에 자기 이름을 씁니다. **아직 아무도 안 가져간 칩만** 가져갈 수 있고(규칙 + 트랜잭션으로 경합 방지), 스캔 즉시 상태는 `진행중`.
- 한 사람이 여러 칩을 가질 수 있습니다. "내 히든미션" 화면에 상태(진행중⏳/성공✅/실패❌)와 함께 표시됩니다.
- **성공/실패 판정은 관리자**가 관리자 패널에서 버튼으로 합니다(또는 콘솔에서 `status` 수정).
- `status`가 `성공`인 칩의 배점은 "내 점수"를 볼 때 실시간으로 읽어서 합산됩니다 (따로 옮겨적지 않음, 나중에 정정해도 즉시 반영).

### 히든미션 템플릿: [파트너] / [네메시스] / [티어]

`missionChips.mission` 안에 아래 토큰을 넣으면 **그 칩을 가져간 사람 기준**으로 치환되어 표시됩니다.

| 토큰 | 치환 | 예시 |
|---|---|---|
| `[파트너]` | 그 사람의 `partner` | "피구에서 [파트너] 아웃시키기" → "피구에서 김여경 아웃시키기" |
| `[네메시스]` | 그 사람의 `nemesis` | "돼지씨름에서 [네메시스] 상대로 승리하기" |
| `[티어]` | 그 사람의 `tier` | "발야구에서 [티어]루타 달성" → "발야구에서 2루타 달성" |

치환은 클라이언트가 하지만 항상 **본인(=칩을 가져간 사람)의** participant 정보로만 계산되므로 남의 파트너/네메시스가 보이지 않습니다. `tier`/`nemesis`가 비어있으면 "(티어 미지정)"처럼 표시되니 그 토큰을 쓰는 미션 전에 채워두세요.

## 점수: 개인 vs 팀

- **팀 점수 (`teamScores`)**: 종목 승리/패배 등. **누구나 보는 공개 순위**(대시보드 "팀 점수판"), 최종 우승팀 판정용.
- **개인 점수 (`personalScores`)**: MVP·개인 등수 등. **본인만** 볼 수 있음 (앱에 남의 개인 점수를 보여주는 화면이 없음).

**"내 점수"(개인 총점)에는 세 가지가 합쳐집니다**: ① `personalScores` 수동 입력분 ② 성공한 히든미션 배점 ③ **내가 속한 팀이 `teamScores`에서 받은 점수**. 우리 팀이 이기면 팀원 각자의 개인 총점에도 더해집니다. (셋 다 조회 시 실시간 합산 — 정정하면 즉시 반영)

> 앱 UI엔 남의 개인 점수를 보여주는 화면이 없지만, `personalScores` 컬렉션 자체는 로그인한 참가자면 개발자도구로 읽을 수는 있습니다(익명 UID를 이름에 묶을 수 없어 규칙으로 "본인 것만"을 만들 수 없음). Apps Script 버전보단 약간 느슨한데, 대부분 MVP/등수 메모라 민감도가 낮고 랭킹은 어차피 마지막에 공개되므로 감수하는 부분입니다.

## 관리자 패널 (`ADMIN_NAME`으로 로그인 시)

`js/config.js`의 `ADMIN_NAME`(기본 `"이학균"`)으로 로그인하면 대시보드에 **🛠️ 관리자 패널** 메뉴가 추가로 뜹니다. 이 사람으로 로그인/PIN설정에 처음 성공하면 그 기기의 익명 UID가 `config/admin.uid`에 자동 등록되고, 이후 관리자 쓰기는 그 UID만 가능합니다.

1. **대회 시작 여부 토글** — 꺼져있는 동안(관리자 제외) 참가자 대시보드는 "우리팀 보기"만 남고 나머지가 다 감춰집니다(직접 주소로 들어가도 라우터가 막음). 켜는 순간 실시간으로 모두의 대시보드가 열립니다.
2. **지금 진행 중인 종목 설정** — 고르면 모든 참가자 대시보드에 "🔴 지금 진행 중: OO" 배너가 실시간으로 뜹니다.
3. 종목 설정 후 나타나는 결과 선언 UI:
   - **팀 결과 선언**: 흑팀/백팀 승리 버튼(점수 기본값은 그 종목의 `points`, 수정 가능) → `teamScores`에 추가
   - **개인점수/개인상 선언**: 이름+비고+점수를 "전송 대기 목록"에 쌓았다가 **한 번에 전송**(요청 1회) → `personalScores`에 추가
   - **관련 히든미션 판정**: 그 종목(`event`)에 묶인 칩 목록에서 진행중/성공/실패 버튼으로 즉시 판정
4. **미션칩 전체 관리** (`#/admin/missions`) — 58개 전부를 EZ/MD/HD 그룹으로 보고 실시간(누가 스캔하면 즉시 반영)으로 관리. 검색, 아무 칩이나 상태 판정, 미션 내용·점수·종목 인라인 수정, 삭제, 새 칩 추가. 콘솔 안 열고 앱에서 다 됩니다.
5. **개인 랭킹 공개 토글** — 켜면 모두의 대시보드에 "🏅 개인 랭킹" 메뉴가 뜨고 전체 개인 순위를 볼 수 있습니다. 꺼져있으면 관리자만 미리보기. (평소 개인 점수는 본인만 보는 게 기본 — 이건 "행사 마지막 다 같이 순위 공개" 연출용 스위치)

> ⚠️ 관리자 UID가 한 번 등록된 뒤 관리자가 브라우저 데이터를 지우면 익명 UID가 바뀌어 관리자 권한이 풀립니다. 그때는 콘솔에서 `config/admin.uid`를 비우면 다음 로그인 때 다시 자동 등록됩니다. 하루짜리 행사에선 보통 문제 없습니다.

## 미션 QR 칩 준비하기

1. `sheet-template/`의 **`easy-sheet.pdf` / `middle-sheet.pdf` / `hard-sheet.pdf`** 3장을 인쇄. QR은 실제 20mm(2cm), A4 한 장에 7열 그리드. 인쇄 설정에서 **배율 100% / 실제 크기**로.
2. 점선대로 잘라서 현장에 숨깁니다. 라벨엔 QR + ID만 있고 미션 내용/점수는 없음 (스캔해야 보임).
3. 각 ID의 미션 내용은 관리자 패널 "미션칩 전체 관리" 또는 `missionChips` 컬렉션에서 확인.
4. 칩을 더 만들려면 관리자 패널에서 추가(문서 ID = missionId) 후 `ToClaude/build_print_pdfs.py`를 다시 실행하면 QR PNG와 인쇄 PDF가 새로 생성됩니다. (먼저 Firestore에서 `chips.json` 갱신 — 스크립트 참고)

## GitHub Pages로 배포하기

1. 이 폴더를 GitHub 리포에 push
2. **Settings > Pages** → Source: `Deploy from a branch`, 브랜치 `master`, 폴더 `/ (root)`
3. `https://<username>.github.io/<repo>/` 에서 접속

QR 스캔(카메라)은 **HTTPS에서만** 동작 — GitHub Pages는 기본 HTTPS라 OK, 로컬은 `http://localhost` 예외로 허용됨.

## 남은 작업 / TODO

- 실시간 리스너를 팀 점수판/개인 랭킹/내 점수 화면에도 확대 (지금은 `config/settings`만 실시간, 나머지는 화면 진입 시 1회 조회)
- `missionChips`의 중복 ID `MD14PT1` (자동으로 `MD14PT1-2`로 저장됨) — 필요하면 콘솔에서 정리 + QR 재생성
- `sheet-template/`의 xlsx는 이제 참고용 (백엔드는 Firestore) — QR 인쇄 시트는 최신 상태
