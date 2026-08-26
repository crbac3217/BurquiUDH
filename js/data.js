// 참가자 명단(+팀/성별/커플)은 실제로는 Google Sheet(백엔드, Participants 시트)에서 관리합니다.
// 여기 있는 값은 APPS_SCRIPT_URL이 비어있을 때만 쓰이는 로컬 mock 폴백입니다.
// (명단을 코드에 하드코딩하면 사람 추가/수정할 때마다 배포를 다시 해야 하므로 피합니다)
const MOCK_PARTICIPANTS = [
  { name: "홍길동", team: "흑팀", gender: "남", partner: "김철수" },
  { name: "김철수", team: "백팀", gender: "남", partner: "홍길동" },
  { name: "이영희", team: "흑팀", gender: "여", partner: "" },
];

// 종목 목록 (이모지 + 설명). 필요하면 자유롭게 추가/수정하세요.
const EVENTS = [
  {
    id: "pig-ssireum",
    name: "돼지씨름",
    icon: "🐷",
    desc: "모래판 위에서 펼쳐지는 몸싸움 대결!",
  },
  {
    id: "mission-race",
    name: "미션레이스",
    icon: "🎯",
    desc: "코스마다 주어지는 미션을 클리어하며 달리는 레이스",
    missions: ["레몬 먹고 휘파람 불기", "사격으로 캔 넘어뜨리기"],
  },
  {
    id: "relay",
    name: "계주",
    icon: "🏃",
    desc: "팀 대항 이어달리기",
  },
  {
    id: "dodgeball",
    name: "피구",
    icon: "🏐",
    desc: "팀 대항 피구 대결",
  },
  {
    id: "burrito-duel",
    name: "부리또 듀얼",
    icon: "🌯",
    desc: "부리또처럼 몸을 돌돌 감싸고 벌이는 대결",
  },
  {
    id: "kickball",
    name: "발야구",
    icon: "⚽",
    desc: "발로 하는 야구",
  },
  {
    id: "jump-rope",
    name: "단체줄넘기",
    icon: "🪢",
    desc: "팀워크로 넘는 단체 줄넘기",
  },
  {
    id: "slipper-archery",
    name: "쓰레빠 양궁",
    icon: "🩴",
    desc: "슬리퍼를 던져 과녁을 맞히는 양궁",
  },
  {
    id: "cone-chair",
    name: "고깔 의자뺏기",
    icon: "🪑",
    desc: "음악이 멈추면 고깔(의자)을 차지하라",
  },
  {
    id: "person-quiz",
    name: "인물퀴즈",
    icon: "🧑",
    desc: "이 사람은 누구일까요? 인물 맞히기 퀴즈",
  },
  {
    id: "music-quiz",
    name: "음악퀴즈",
    icon: "🎵",
    desc: "노래 한 소절 듣고 제목 맞히기",
  },
];

// 개인 점수 로그 — 본인만 볼 수 있는 개별 점수(MVP, 개인 등수 등).
// 팀 우승과는 무관하게, 나중에 개인 시상 등에 참고용으로 씁니다.
const MOCK_PERSONAL_SCORE_LOG = [
  { name: "홍길동", event: "쓰레빠 양궁", note: "3등", points: 20 },
  { name: "홍길동", event: "발야구", note: "MVP", points: 20 },
  { name: "김철수", event: "쓰레빠 양궁", note: "1등", points: 40 },
];

// 팀 점수 로그 — 누구나 볼 수 있는 공개 팀 순위용 (승리/패배 등).
// 운동회 마지막에 어느 팀이 우승했는지는 이 로그의 합산으로 결정됩니다.
const MOCK_TEAM_SCORE_LOG = [
  { team: "흑팀", event: "쓰레빠 양궁", note: "우승", points: 30 },
  { team: "백팀", event: "쓰레빠 양궁", note: "준우승", points: 15 },
  { team: "흑팀", event: "발야구", note: "승리", points: 20 },
  { team: "백팀", event: "발야구", note: "패배", points: 5 },
];

// 히든미션 "칩" 목록. 실제로는 칩마다 고유 id를 QR코드로 인쇄해서 현장에 숨겨두고,
// 참가자가 앱 카메라로 스캔하면 그 id가 그 사람에게 귀속됩니다(먼저 스캔한 사람 소유,
// 남이 이미 가져간 칩은 다른 사람이 스캔해도 실패). 한 사람이 여러 칩을 가져갈 수 있습니다.
// 스캔하면 바로 "진행중" 상태가 되고, 실제로 미션을 해냈는지는 진행자가 시트에서
// "성공"/"실패"로 나중에 판정합니다.
// 실제 목록/소유자/상태는 Apps Script(MissionChips 시트)가 관리하고, 아래는 오프라인 mock용입니다.
const MOCK_MISSION_CHIPS = [
  { id: "M01", mission: "오늘 처음 만난 사람과 하이파이브 5번 하기" },
  { id: "M02", mission: "진행자 몰래 셀카 찍고 보여주기" },
  { id: "M03", mission: "처음 만난 사람 이름 외워서 소개하기" },
  { id: "M04", mission: "경기 중 우스꽝스러운 세리머니 하기" },
  { id: "M05", mission: "다른 팀 대놓고 크게 응원해주기" },
  { id: "M06", mission: "오늘 있었던 재밌는 순간 한 줄로 기록하기" },
  { id: "M07", mission: "아무나 붙잡고 하이파이브 챌린지 성공시키기" },
  { id: "M08", mission: "본인 소개를 3초 안에 임팩트있게 하기" },
];
