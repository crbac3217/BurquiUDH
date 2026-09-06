// 백엔드(Apps Script) 연동 래퍼. URL이 설정되어 있으면 실제로 fetch하고,
// 없거나 실패하면 로컬 mock 데이터로 자연스럽게 폴백합니다.

// mock(오프라인) 경로 전용 — 실제 백엔드에서는 Apps Script가 salt를 붙여 해시합니다.
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readMockClaims() {
  try {
    return JSON.parse(localStorage.getItem("mock_mission_claims") || "{}");
  } catch {
    return {};
  }
}

function writeMockClaims(claims) {
  localStorage.setItem("mock_mission_claims", JSON.stringify(claims));
}

const MISSION_STATUS_IN_PROGRESS = "진행중";

// Apps Script가 액션을 못 알아들으면 respond({ error: "unknown action" })을 200 OK로
// 돌려줍니다(HTTP 상태만으로는 실패인지 알 수 없음) — 배포된 코드가 구버전이라 이 액션이
// 아직 없을 때 나오는 신호라, 이 모양이면 일부러 throw해서 mock 폴백을 타게 만듭니다.
// {success:false, ...}처럼 정상적으로 실행됐지만 결과가 실패인 응답과는 구분해야 하므로,
// success 키가 없는 error 응답일 때만 "지원 안 하는 액션"으로 취급합니다.
function isUnsupportedActionResponse(data) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "error" in data &&
    !("success" in data)
  );
}

async function fetchApps(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error("bad response");
  const data = await res.json();
  if (isUnsupportedActionResponse(data)) {
    throw new Error(`backend action not supported: ${data.error}`);
  }
  return data;
}

const API = {
  // 종목 목록 [{ name, icon, desc }, ...] — 실제로는 DB 시트 1~3행에서 가져옵니다.
  async getEvents() {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(`${CONFIG.APPS_SCRIPT_URL}?action=getEvents`);
      } catch (err) {
        console.warn("[API] getEvents 실패, mock 데이터 사용:", err);
      }
    }
    return MOCK_EVENTS;
  },

  async getAllowedNames() {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(
          `${CONFIG.APPS_SCRIPT_URL}?action=getAllowedNames`
        );
      } catch (err) {
        console.warn("[API] getAllowedNames 실패, mock 데이터 사용:", err);
      }
    }
    return MOCK_PARTICIPANTS.map((p) => p.name);
  },

  // 이 이름에 이미 PIN이 설정되어 있는지 (없으면 최초 로그인 = 설정 화면으로)
  async hasPin(name) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(
          `${CONFIG.APPS_SCRIPT_URL}?action=hasPin&name=${encodeURIComponent(
            name
          )}`
        );
      } catch (err) {
        console.warn("[API] hasPin 실패, mock 데이터 사용:", err);
      }
    }
    return { hasPin: localStorage.getItem(`mock_pin_${name}`) !== null };
  },

  // 최초 1회만 성공. 이미 설정되어 있으면 서버(Apps Script)가 거부해야 함(가로채기 방지).
  async setPin(name, pin) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "setPin", name, pin }),
        });
      } catch (err) {
        console.warn("[API] setPin 실패, mock으로 폴백:", err);
      }
    }
    if (localStorage.getItem(`mock_pin_${name}`) !== null) {
      return { success: false, error: "already set" };
    }
    localStorage.setItem(`mock_pin_${name}`, await sha256Hex(pin));
    return { success: true };
  },

  async login(name, pin) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "login", name, pin }),
        });
      } catch (err) {
        console.warn("[API] login 실패, mock으로 폴백:", err);
      }
    }
    const stored = localStorage.getItem(`mock_pin_${name}`);
    if (stored === null) return { success: false };
    const hash = await sha256Hex(pin);
    return { success: hash === stored };
  },

  // 본인의 개인 점수 로그만 반환 [{ event, note, points }, ...] — 다른 사람 것은 서버에
  // 요청 자체를 하지 않으므로 화면에는 절대 노출되지 않습니다.
  async getMyScoreLog(name) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(
          `${CONFIG.APPS_SCRIPT_URL}?action=getMyScoreLog&name=${encodeURIComponent(
            name
          )}`
        );
      } catch (err) {
        console.warn("[API] getMyScoreLog 실패, mock 데이터 사용:", err);
      }
    }
    return MOCK_PERSONAL_SCORE_LOG.filter((e) => e.name === name).map(
      ({ event, note, points }) => ({ event, note, points })
    );
  },

  // 팀 점수 로그 [{ team, event, note, points }, ...] — 모두에게 공개되는 팀 순위용.
  async getTeamScoreLog() {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(
          `${CONFIG.APPS_SCRIPT_URL}?action=getTeamScoreLog`
        );
      } catch (err) {
        console.warn("[API] getTeamScoreLog 실패, mock 데이터 사용:", err);
      }
    }
    return MOCK_TEAM_SCORE_LOG;
  },

  // 이 사람이 지금까지 스캔해서 가져간 히든미션 칩 목록 (진행중/성공/실패 상태 포함).
  async getMyMissions(name) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(
          `${CONFIG.APPS_SCRIPT_URL}?action=getMyMissions&name=${encodeURIComponent(
            name
          )}`
        );
      } catch (err) {
        console.warn("[API] getMyMissions 실패, mock 데이터 사용:", err);
      }
    }
    const claims = readMockClaims();
    return MOCK_MISSION_CHIPS.filter(
      (chip) => claims[chip.id] && claims[chip.id].name === name
    ).map((chip) => ({
      id: chip.id,
      mission: resolveMockMissionText(chip.mission, name),
      points: chip.points,
      status: claims[chip.id].status,
    }));
  },

  // QR로 읽은 미션칩 id를 이 이름에 귀속시킵니다. 스캔 즉시는 "진행중" 상태가 되고,
  // 실제 성공/실패 판정은 진행자가 시트(MissionChips.status)에서 나중에 매깁니다.
  // 이미 남이 가져간 칩이면 실패, 이미 본인 것이면 alreadyMine:true로 현재 상태만 반환.
  async claimMissionChip(name, chipId) {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        return await fetchApps(CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "claimMissionChip", name, chipId }),
        });
      } catch (err) {
        console.warn("[API] claimMissionChip 실패, mock으로 폴백:", err);
      }
    }
    const chip = MOCK_MISSION_CHIPS.find((c) => c.id === chipId);
    if (!chip) return { success: false, error: "not_found" };
    const claims = readMockClaims();
    const existing = claims[chipId];
    if (existing && existing.name !== name) {
      return { success: false, error: "claimed_by_other" };
    }
    const alreadyMine = !!existing;
    if (!alreadyMine) {
      claims[chipId] = { name, status: MISSION_STATUS_IN_PROGRESS };
      writeMockClaims(claims);
    }
    return {
      success: true,
      mission: resolveMockMissionText(chip.mission, name),
      points: chip.points,
      status: claims[chipId].status,
      alreadyMine,
    };
  },
};
