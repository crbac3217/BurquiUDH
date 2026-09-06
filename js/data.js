// ⚠️ 이 파일은 APPS_SCRIPT_URL이 비어있을 때만 쓰이는 "오프라인 mock 폴백"입니다.
// 실제 운영 중엔(백엔드 연결되어 있으면) 아래 내용은 전혀 쓰이지 않고,
// 전부 Google Sheet(DB / Participants / MissionChips 등)에서 실시간으로 가져옵니다.
// 즉 종목·이름·미션을 바꾸고 싶으면 이 파일이 아니라 시트를 고치세요.

// 참가자 명단(+팀/성별/커플/티어/네메시스) mock. 실제 데이터는 Participants 시트.
const MOCK_PARTICIPANTS = [
  {
    name: "홍길동",
    team: "흑팀",
    gender: "남",
    partner: "김철수",
    tier: 2,
    nemesis: "이영희",
  },
  {
    name: "김철수",
    team: "백팀",
    gender: "남",
    partner: "홍길동",
    tier: 1,
    nemesis: "홍길동",
  },
  {
    name: "이영희",
    team: "흑팀",
    gender: "여",
    partner: "",
    tier: 3,
    nemesis: "김철수",
  },
];

// 종목 목록(이모지+설명) mock. 실제 데이터는 DB 시트 1~3행(종목/아이콘/설명).
const MOCK_EVENTS = [
  { name: "돼지씨름", icon: "🐷", desc: "모래판 위에서 펼쳐지는 몸싸움 대결!" },
  {
    name: "미션레이스",
    icon: "🎯",
    desc: "코스마다 주어지는 미션을 클리어하며 달리는 레이스 (예: 레몬 먹고 휘파람 불기, 사격으로 캔 넘어뜨리기)",
  },
  { name: "계주", icon: "🏃", desc: "팀 대항 이어달리기" },
  { name: "피구", icon: "🏐", desc: "팀 대항 피구 대결" },
  {
    name: "부리또 듀얼",
    icon: "🌯",
    desc: "부리또처럼 몸을 돌돌 감싸고 벌이는 대결",
  },
  { name: "발야구", icon: "⚽", desc: "발로 하는 야구" },
  { name: "단체줄넘기", icon: "🪢", desc: "팀워크로 넘는 단체 줄넘기" },
  {
    name: "쓰레빠 양궁",
    icon: "🩴",
    desc: "슬리퍼를 던져 과녁을 맞히는 양궁",
  },
  {
    name: "고깔 의자뺏기",
    icon: "🪑",
    desc: "음악이 멈추면 고깔(의자)을 차지하라",
  },
  {
    name: "인물퀴즈",
    icon: "🧑",
    desc: "이 사람은 누구일까요? 인물 맞히기 퀴즈",
  },
  { name: "음악퀴즈", icon: "🎵", desc: "노래 한 소절 듣고 제목 맞히기" },
];

// 개인 점수 로그 — 본인만 볼 수 있는 개별 점수(MVP, 개인 등수 등) mock.
// 실제 데이터는 PersonalScoreLog 시트.
const MOCK_PERSONAL_SCORE_LOG = [
  { name: "홍길동", event: "쓰레빠 양궁", note: "3등", points: 20 },
  { name: "홍길동", event: "발야구", note: "MVP", points: 20 },
  { name: "김철수", event: "쓰레빠 양궁", note: "1등", points: 40 },
];

// 팀 점수 로그 — 누구나 볼 수 있는 공개 팀 순위용 mock. 실제 데이터는 TeamScoreLog 시트.
const MOCK_TEAM_SCORE_LOG = [
  { team: "흑팀", event: "쓰레빠 양궁", note: "우승", points: 30 },
  { team: "백팀", event: "쓰레빠 양궁", note: "준우승", points: 15 },
  { team: "흑팀", event: "발야구", note: "승리", points: 20 },
  { team: "백팀", event: "발야구", note: "패배", points: 5 },
];

// 히든미션 "칩" 목록 mock. 실제 데이터는 MissionChips 시트.
//
// mission 텍스트 안에 [파트너] / [네메시스] / [티어] 를 넣으면, 그 칩을 가져간
// 사람의 Participants 정보(partner/nemesis/tier)로 자동 치환되어 표시됩니다.
// 예: "피구에서 [파트너] 맞춰서 아웃시키기" → 실제로는 "피구에서 김철수 맞춰서 아웃시키기"
//
// 칩마다 고유 id를 QR코드로 인쇄해서 현장에 숨겨두고, 스캔한 사람에게 귀속됩니다
// (먼저 스캔한 사람 소유, 남이 이미 가져간 칩은 다른 사람이 스캔해도 실패).
// 한 사람이 여러 칩을 가져갈 수 있습니다. 스캔하면 "진행중" 상태가 되고, 실제로
// 미션을 해냈는지는 진행자가 시트에서 "성공"/"실패"로 나중에 판정합니다.
// "성공"으로 바뀌는 순간 그 칩의 points가 그 사람의 개인 점수 로그에 자동으로
// 더해집니다(Apps Script onEdit).
const MOCK_MISSION_CHIPS = [
  { id: "M01", mission: "오늘 처음 만난 사람과 하이파이브 5번 하기", points: 10 },
  { id: "M02", mission: "진행자 몰래 셀카 찍고 보여주기", points: 15 },
  { id: "M03", mission: "피구에서 [파트너] 맞춰서 아웃시키기", points: 20 },
  { id: "M04", mission: "부리또 듀얼에서 [네메시스] 상대로 승리하기", points: 25 },
  { id: "M05", mission: "발야구에서 [티어]루타 달성하기", points: 20 },
  { id: "M06", mission: "돼지씨름 [티어]번 이기기", points: 20 },
  { id: "M07", mission: "[네메시스]와 하이파이브하고 화해하기", points: 15 },
  { id: "M08", mission: "[파트너]와 함께 사진찍기", points: 10 },
];

// mock 전용 — 클레임한 미션 텍스트의 [파트너]/[네메시스]/[티어]를 실제 값으로 치환.
// (실제 백엔드에서는 Apps Script가 동일한 로직을 서버에서 수행합니다)
function resolveMockMissionText(template, name) {
  const p = MOCK_PARTICIPANTS.find((x) => x.name === name);
  return template
    .split("[파트너]")
    .join(p && p.partner ? p.partner : "(파트너 미지정)")
    .split("[네메시스]")
    .join(p && p.nemesis ? p.nemesis : "(네메시스 미지정)")
    .split("[티어]")
    .join(p && p.tier != null && p.tier !== "" ? String(p.tier) : "(티어 미지정)");
}
