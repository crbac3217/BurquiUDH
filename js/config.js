// ⚙️ Firebase 설정
//
// Firebase 콘솔 > 프로젝트 설정 > 내 앱 > 웹 앱에서 나오는 firebaseConfig를 그대로 붙여넣습니다.
// apiKey는 "비밀"이 아니라 프로젝트 식별자일 뿐입니다 — 보안은 Firestore 보안 규칙으로 합니다
// (firestore.rules 참고). 그래서 이 값이 클라이언트에 노출돼도 괜찮습니다.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbDBMKlfuVUqRu40SJtpGk0_5M0nxA_Sw",
  authDomain: "burqtracknfield.firebaseapp.com",
  projectId: "burqtracknfield",
  storageBucket: "burqtracknfield.firebasestorage.app",
  messagingSenderId: "1065903903431",
  appId: "1:1065903903431:web:4928bcad9e62a6bc6364e2",
};

// 이 이름으로 로그인(+PIN 확인)하면 그 사람의 익명 UID가 config/admin에 등록되고,
// 그 뒤로는 그 UID만 관리자 쓰기(점수 선언/미션 판정/설정 변경)가 가능합니다.
const ADMIN_NAME = "이학균";
