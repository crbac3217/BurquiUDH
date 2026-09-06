// 로그인 지속(localStorage) + 해시 라우팅 + 뷰 렌더링

const USER_KEY = "trackfield_user";
const $app = document.getElementById("app");

function getUser() {
  return localStorage.getItem(USER_KEY);
}

function setUser(name) {
  localStorage.setItem(USER_KEY, name);
}

function logout() {
  localStorage.removeItem(USER_KEY);
  navigate("#/login");
}

function navigate(hash) {
  if (location.hash === hash) {
    render();
  } else {
    location.hash = hash;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 뷰 렌더러 ----------

function loadingCard(msg) {
  return `
    <section class="card login-card">
      <h1>🏃 운동회 앱</h1>
      <p class="sub">${escapeHtml(msg)}</p>
    </section>
  `;
}

async function viewLogin() {
  $app.innerHTML = loadingCard("참가자 명단을 확인하는 중...");
  const allowedNames = await API.getAllowedNames();
  renderNameStep(allowedNames);
}

function renderNameStep(allowedNames, errorMsg) {
  $app.innerHTML = `
    <section class="card login-card">
      <h1>🏃 운동회 앱</h1>
      <p class="sub">참가자 명단에 있는 이름만 입장할 수 있어요.</p>
      <form id="login-form">
        <input id="login-name" type="text" placeholder="이름을 입력하세요" autocomplete="off" required />
        ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ""}
        <button type="submit">다음</button>
      </form>
    </section>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("login-name").value.trim();
    if (!name) return;
    if (!allowedNames.includes(name)) {
      renderNameStep(
        allowedNames,
        `"${name}" 님은 참가자 명단에 없어요. 이름을 다시 확인해주세요.`
      );
      return;
    }
    $app.innerHTML = loadingCard("확인하는 중...");
    const { hasPin } = await API.hasPin(name);
    if (hasPin) {
      renderPinStep(allowedNames, name);
    } else {
      renderSetPinStep(allowedNames, name);
    }
  });
}

const PIN_PATTERN_ATTRS =
  'type="tel" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"';

function renderPinStep(allowedNames, name, errorMsg) {
  $app.innerHTML = `
    <section class="card login-card">
      <h1>🔒 ${escapeHtml(name)}님</h1>
      <p class="sub">4자리 PIN을 입력하세요.</p>
      <form id="pin-form">
        <input id="pin-input" ${PIN_PATTERN_ATTRS} placeholder="••••" required />
        ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ""}
        <button type="submit">입장하기</button>
      </form>
      <button class="ghost back-btn" id="back-btn" type="button">← 다른 이름으로</button>
    </section>
  `;
  document
    .getElementById("back-btn")
    .addEventListener("click", () => renderNameStep(allowedNames));
  document.getElementById("pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pin-input").value;
    if (!/^\d{4}$/.test(pin)) {
      renderPinStep(allowedNames, name, "PIN은 숫자 4자리예요.");
      return;
    }
    $app.innerHTML = loadingCard("확인하는 중...");
    const result = await API.login(name, pin);
    if (!result.success) {
      renderPinStep(allowedNames, name, "PIN이 올바르지 않아요.");
      return;
    }
    setUser(name);
    navigate("#/dashboard");
  });
}

function renderSetPinStep(allowedNames, name, errorMsg) {
  $app.innerHTML = `
    <section class="card login-card">
      <h1>👋 ${escapeHtml(name)}님, 처음이시네요!</h1>
      <p class="sub">다른 사람이 내 이름으로 못 들어오게 4자리 PIN을 만들어주세요.</p>
      <p class="warning">⚠️ 이 PIN은 진행자(관리 시트에 접근 가능한 사람)가 마음만 먹으면 무차별 대입으로 알아낼 수 있어요.
      은행 비밀번호, 폰 잠금 PIN 등 실제로 쓰는 번호와 절대 겹치지 않는, 오늘 이 앱에서만 쓸 번호로 정해주세요.</p>
      <form id="set-pin-form">
        <input id="pin1" ${PIN_PATTERN_ATTRS} placeholder="새 PIN (숫자 4자리)" required />
        <input id="pin2" ${PIN_PATTERN_ATTRS} placeholder="PIN 확인" required />
        ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ""}
        <button type="submit">PIN 설정하고 입장</button>
      </form>
      <button class="ghost back-btn" id="back-btn" type="button">← 다른 이름으로</button>
    </section>
  `;
  document
    .getElementById("back-btn")
    .addEventListener("click", () => renderNameStep(allowedNames));
  document
    .getElementById("set-pin-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin1 = document.getElementById("pin1").value;
      const pin2 = document.getElementById("pin2").value;
      if (!/^\d{4}$/.test(pin1)) {
        renderSetPinStep(allowedNames, name, "PIN은 숫자 4자리예요.");
        return;
      }
      if (pin1 !== pin2) {
        renderSetPinStep(allowedNames, name, "PIN이 서로 달라요.");
        return;
      }
      $app.innerHTML = loadingCard("설정하는 중...");
      const result = await API.setPin(name, pin1);
      if (!result.success) {
        renderSetPinStep(
          allowedNames,
          name,
          "설정에 실패했어요. 이미 설정되어 있다면 뒤로 가서 PIN으로 입장해주세요."
        );
        return;
      }
      setUser(name);
      navigate("#/dashboard");
    });
}

function viewDashboard(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <div>
          <p class="sub">환영합니다</p>
          <h1>${escapeHtml(user)}님 👋</h1>
        </div>
        <button class="ghost" id="logout-btn">로그아웃</button>
      </header>
      <nav class="menu">
        <a class="menu-item" href="#/events">
          <span class="menu-icon">📋</span>
          <span>종목 목록</span>
        </a>
        <a class="menu-item" href="#/scores">
          <span class="menu-icon">🏆</span>
          <span>팀 점수판</span>
        </a>
        <a class="menu-item" href="#/my-score">
          <span class="menu-icon">📊</span>
          <span>내 점수</span>
        </a>
        <a class="menu-item" href="#/mission">
          <span class="menu-icon">🕵️</span>
          <span>내 히든미션</span>
        </a>
      </nav>
    </section>
  `;
  document.getElementById("logout-btn").addEventListener("click", logout);
}

async function viewEvents() {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>📋 종목 목록</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const events = await API.getEvents();

  const items = events
    .map(
      (ev) => `
      <li class="event-item">
        <span class="event-icon">${escapeHtml(ev.icon)}</span>
        <div>
          <p class="event-name">${escapeHtml(ev.name)}</p>
          <p class="event-desc">${escapeHtml(ev.desc)}</p>
        </div>
      </li>`
    )
    .join("");

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>📋 종목 목록</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <ul class="event-list">${items}</ul>
    </section>
  `;
}

function aggregateScoreLog(log, keyField) {
  const byKey = new Map();
  for (const entry of log) {
    const key = entry[keyField];
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }
  return Array.from(byKey.entries())
    .map(([key, entries]) => ({
      key,
      entries,
      total: entries.reduce((sum, e) => sum + e.points, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

// ---- 팀 점수판: 누구나 볼 수 있는 공개 순위 ----

async function viewTeamScores() {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🏆 팀 점수판</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const log = await API.getTeamScoreLog();
  const ranking = aggregateScoreLog(log, "team");
  renderTeamScoreList(ranking);
}

function renderTeamScoreList(ranking, expandedTeam) {
  const rows = ranking.length
    ? ranking
        .map((team, i) => {
          const isOpen = team.key === expandedTeam;
          const breakdown = team.entries
            .map(
              (e) => `
              <li class="score-detail-row">
                <span class="detail-event">${escapeHtml(e.event)}</span>
                <span class="detail-note">${escapeHtml(e.note)}</span>
                <span class="detail-points">${e.points}점</span>
              </li>`
            )
            .join("");
          return `
            <li class="score-row-wrap">
              <button class="score-row" data-idx="${i}">
                <span class="rank">${i + 1}</span>
                <span class="person-name">${escapeHtml(team.key)}</span>
                <span class="score">${team.total}점</span>
                <span class="chevron">${isOpen ? "▲" : "▼"}</span>
              </button>
              ${
                isOpen
                  ? `<ul class="score-breakdown">${breakdown}</ul>`
                  : ""
              }
            </li>`;
        })
        .join("")
    : `<p class="empty">아직 등록된 팀 점수가 없어요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🏆 팀 점수판</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <ul class="score-list">${rows}</ul>
    </section>
  `;

  $app.querySelectorAll(".score-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const key = ranking[idx].key;
      renderTeamScoreList(ranking, key === expandedTeam ? null : key);
    });
  });
}

// ---- 내 점수: 본인에게만 보이는 개인 점수 ----

async function viewMyScore(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>📊 내 점수</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const entries = await API.getMyScoreLog(user);
  const total = entries.reduce((sum, e) => sum + e.points, 0);

  const rows = entries.length
    ? entries
        .map(
          (e) => `
        <li class="score-detail-row">
          <span class="detail-event">${escapeHtml(e.event)}</span>
          <span class="detail-note">${escapeHtml(e.note)}</span>
          <span class="detail-points">${e.points}점</span>
        </li>`
        )
        .join("")
    : `<p class="empty">아직 개인 점수가 없어요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>📊 내 점수</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="my-score-total">총 ${total}점</p>
      <ul class="score-breakdown">${rows}</ul>
      <p class="hint">* 이 점수는 본인에게만 보여요. 팀 우승 여부는 팀 점수판을 확인하세요.</p>
    </section>
  `;
}

async function viewMission(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🕵️ 내 히든미션</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const missions = await API.getMyMissions(user);

  const STATUS_META = {
    진행중: { icon: "⏳", cls: "in-progress" },
    성공: { icon: "✅", cls: "success" },
    실패: { icon: "❌", cls: "fail" },
  };
  const list = missions.length
    ? `<ul class="mission-owned-list">${missions
        .map((m) => {
          const meta = STATUS_META[m.status] || STATUS_META["진행중"];
          return `
        <li class="mission-owned-item status-${meta.cls}">
          <span class="mission-owned-icon">${meta.icon}</span>
          <span class="mission-owned-text">${escapeHtml(m.mission)}<br/><span class="mission-owned-points">${m.points}점${m.status === "성공" ? " · 내 점수에 반영됨" : ""}</span></span>
          <span class="mission-owned-status">${escapeHtml(m.status)}</span>
        </li>`;
        })
        .join("")}</ul>`
    : `<p class="empty">아직 찾은 히든미션이 없어요. QR을 스캔해서 찾아보세요!</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🕵️ 내 히든미션</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      ${list}
      <button id="scan-btn" class="wide-btn">📷 QR 스캔해서 미션 찾기</button>
      <p class="hint">* 현장에 숨겨진 미션 칩을 스캔하면 그 미션이 내 것이 돼요. 먼저 스캔한 사람이 임자라 다른 사람은 같은 칩을 가져갈 수 없어요.</p>
    </section>
  `;
  document
    .getElementById("scan-btn")
    .addEventListener("click", () => navigate("#/scan"));
}

// ---------- QR 스캔 ----------

let activeCameraStream = null;

function stopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }
}

async function viewScan(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>📷 미션 QR 스캔</h1>
        <a class="ghost" href="#/mission" id="scan-back">← 뒤로</a>
      </header>
      <div class="scan-box">
        <video id="scan-video" playsinline muted></video>
        <div class="scan-frame"></div>
      </div>
      <p class="scan-status" id="scan-status">카메라를 켜는 중...</p>
      <details class="manual-entry">
        <summary>카메라가 안 되면 여기를 눌러 코드 직접 입력</summary>
        <form id="manual-form">
          <input id="manual-id" type="text" placeholder="미션 칩 코드 (예: M01)" autocomplete="off" />
          <button type="submit">확인</button>
        </form>
      </details>
    </section>
  `;

  document.getElementById("scan-back").addEventListener("click", stopCamera);

  document.getElementById("manual-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("manual-id").value.trim().toUpperCase();
    if (!id) return;
    await handleScannedCode(user, id);
  });

  const video = document.getElementById("scan-video");
  const statusEl = document.getElementById("scan-status");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let stopped = false;

  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
  } catch (err) {
    console.warn("[scan] 카메라 권한 실패:", err);
    statusEl.textContent =
      "카메라를 사용할 수 없어요. 아래에서 코드를 직접 입력해주세요.";
    return;
  }

  video.srcObject = activeCameraStream;
  await video.play();
  statusEl.textContent = "QR코드를 화면 안에 비춰주세요.";

  function tick() {
    if (stopped || !activeCameraStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        stopped = true;
        stopCamera();
        handleScannedCode(user, code.data.trim().toUpperCase());
        return;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function handleScannedCode(user, chipId) {
  stopCamera();
  $app.innerHTML = loadingCard("확인하는 중...");
  const result = await API.claimMissionChip(user, chipId);

  if (!result.success) {
    const messages = {
      not_found: "알 수 없는 코드예요. 다시 확인해주세요.",
      claimed_by_other: "앗, 이미 다른 사람이 가져간 미션이에요!",
      network: "확인 중 문제가 생겼어요. 다시 시도해주세요.",
    };
    $app.innerHTML = `
      <section class="card">
        <header class="topbar">
          <h1>📷 미션 QR 스캔</h1>
          <a class="ghost" href="#/mission">← 뒤로</a>
        </header>
        <p class="error">${escapeHtml(messages[result.error] || "실패했어요. 다시 시도해주세요.")}</p>
        <button id="retry-btn" class="wide-btn">다시 스캔하기</button>
      </section>
    `;
    document
      .getElementById("retry-btn")
      .addEventListener("click", () => viewScan(user));
    return;
  }

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>${result.alreadyMine ? "이미 찾은 미션이에요" : "🎉 미션 발견!"}</h1>
      </header>
      <div class="mission-box">
        <p class="mission-text">${escapeHtml(result.mission)}</p>
        <p class="mission-points-badge">성공 시 ${result.points}점</p>
        <p class="sub">지금부터 미션을 수행해주세요. 진행자가 확인해서 "성공"으로 바꾸면 이 점수가 내 점수판에 자동으로 들어가요.</p>
      </div>
      <button id="ok-btn" class="wide-btn">내 히든미션으로</button>
    </section>
  `;
  document
    .getElementById("ok-btn")
    .addEventListener("click", () => navigate("#/mission"));
}

// ---------- 라우터 ----------

const ROUTES = {
  "#/login": () => viewLogin(),
  "#/dashboard": (user) => viewDashboard(user),
  "#/events": () => viewEvents(),
  "#/scores": () => viewTeamScores(),
  "#/my-score": (user) => viewMyScore(user),
  "#/mission": (user) => viewMission(user),
  "#/scan": (user) => viewScan(user),
};

function render() {
  if (location.hash !== "#/scan") {
    stopCamera();
  }
  const user = getUser();
  let hash = location.hash;

  if (!hash) {
    hash = user ? "#/dashboard" : "#/login";
    location.hash = hash;
    return; // hashchange가 다시 render()를 호출함
  }

  if (!user && hash !== "#/login") {
    location.hash = "#/login";
    return;
  }

  if (user && hash === "#/login") {
    location.hash = "#/dashboard";
    return;
  }

  const view = ROUTES[hash] || ROUTES["#/dashboard"];
  view(user);
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
