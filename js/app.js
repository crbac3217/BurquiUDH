// 로그인 지속(localStorage) + 해시 라우팅 + 뷰 렌더링

const USER_KEY = "trackfield_user";
const $app = document.getElementById("app");

// 화면이 비어있는 채로 멈추면 원인을 알 수 없으니, 에러를 화면에 띄웁니다.
function showFatal(msg) {
  if ($app) {
    $app.innerHTML =
      '<section class="card"><h1>⚠️ 문제가 생겼어요</h1>' +
      '<p class="sub" style="white-space:pre-wrap;word-break:break-all">' +
      String(msg).replace(/</g, "&lt;") +
      "</p><button class=\"wide-btn\" onclick=\"location.reload()\">새로고침</button></section>";
  }
}
window.addEventListener("error", (e) => {
  console.error("[fatal]", e.error || e.message);
  showFatal((e.error && e.error.stack) || e.message || "알 수 없는 오류");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[fatal-promise]", e.reason);
  showFatal((e.reason && (e.reason.stack || e.reason.message)) || String(e.reason));
});

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

// 흑팀/백팀은 이름 그대로 검정/흰색 배지로, 그 외 팀명은 기본(파란색) 배지로.
function teamBadgeHtml(team) {
  if (!team) return "";
  const cls =
    team === "흑팀" ? " team-badge-black" : team === "백팀" ? " team-badge-white" : "";
  return `<span class="team-badge${cls}">${escapeHtml(team)}</span>`;
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

async function viewDashboard(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <div>
          <p class="sub">환영합니다</p>
          <h1>${escapeHtml(user)}님 👋</h1>
        </div>
        <button class="ghost" id="logout-btn">로그아웃</button>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const [{ team }, settings] = await Promise.all([
    API.getMyTeam(user),
    API.getSettings(),
  ]);
  const isAdmin = user === ADMIN_NAME;

  const currentEventBanner = settings.currentEvent
    ? `<p class="current-event-banner">🔴 지금 진행 중: <strong>${escapeHtml(
        settings.currentEvent
      )}</strong></p>`
    : "";

  const adminMenuItem = isAdmin
    ? `<a class="menu-item menu-item-admin" href="#/admin">
        <span class="menu-icon">🛠️</span>
        <span>관리자 패널</span>
      </a>`
    : "";

  // 대회가 아직 시작 전이면(관리자 제외) 우리팀 보기 말고는 다 감춥니다.
  if (!settings.eventStarted && !isAdmin) {
    $app.innerHTML = `
      <section class="card">
        <header class="topbar">
          <div>
            <p class="sub">환영합니다</p>
            <h1>${escapeHtml(user)}님 👋</h1>
            ${teamBadgeHtml(team)}
          </div>
          <button class="ghost" id="logout-btn">로그아웃</button>
        </header>
        <p class="current-event-banner">🚦 대회가 아직 시작되지 않았어요. 시작 전엔 우리팀만 볼 수 있어요.</p>
        <nav class="menu">
          <a class="menu-item" href="#/team">
            <span class="menu-icon">👥</span>
            <span>우리팀 보기</span>
          </a>
        </nav>
      </section>
    `;
    document.getElementById("logout-btn").addEventListener("click", logout);
    return;
  }

  const rankingMenuItem =
    settings.personalRankingVisible || isAdmin
      ? `<a class="menu-item" href="#/ranking">
          <span class="menu-icon">🏅</span>
          <span>개인 랭킹${settings.personalRankingVisible ? "" : " (비공개 미리보기)"}</span>
        </a>`
      : "";

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <div>
          <p class="sub">환영합니다</p>
          <h1>${escapeHtml(user)}님 👋</h1>
          ${teamBadgeHtml(team)}
        </div>
        <button class="ghost" id="logout-btn">로그아웃</button>
      </header>
      ${currentEventBanner}
      <nav class="menu">
        ${adminMenuItem}
        <a class="menu-item" href="#/events">
          <span class="menu-icon">📋</span>
          <span>종목 목록</span>
        </a>
        <a class="menu-item" href="#/team">
          <span class="menu-icon">👥</span>
          <span>우리팀 보기</span>
        </a>
        <a class="menu-item" href="#/scores">
          <span class="menu-icon">🏆</span>
          <span>팀 점수판</span>
        </a>
        <a class="menu-item" href="#/my-score">
          <span class="menu-icon">📊</span>
          <span>내 점수</span>
        </a>
        ${rankingMenuItem}
        <a class="menu-item" href="#/mission">
          <span class="menu-icon">🕵️</span>
          <span>내 히든미션</span>
        </a>
      </nav>
    </section>
  `;
  document.getElementById("logout-btn").addEventListener("click", logout);
}

async function viewMyTeam(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>👥 우리팀</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const { team, teammates } = await API.getMyTeam(user);

  const list = teammates.length
    ? `<ul class="team-roster">${teammates
        .map(
          (name) => `
        <li class="team-roster-item${name === user ? " me" : ""}">
          <span>${escapeHtml(name)}</span>
          ${name === user ? '<span class="me-tag">나</span>' : ""}
        </li>`
        )
        .join("")}</ul>`
    : `<p class="empty">팀 정보가 아직 없어요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <div>
          <p class="sub">우리팀</p>
          <h1>👥 팀원 목록</h1>
          ${teamBadgeHtml(team)}
        </div>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      ${list}
    </section>
  `;
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
    .map((ev) => {
      const metaParts = [];
      if (ev.capacity) metaParts.push(`인원 ${escapeHtml(String(ev.capacity))}`);
      if (ev.points) metaParts.push(`${ev.points}점`);
      return `
      <li class="event-item">
        <span class="event-icon">${escapeHtml(ev.icon)}</span>
        <div>
          <p class="event-name">${escapeHtml(ev.name)}</p>
          <p class="event-desc">${escapeHtml(ev.desc)}</p>
          ${metaParts.length ? `<p class="event-meta">${metaParts.join(" · ")}</p>` : ""}
        </div>
      </li>`;
    })
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
                <span class="person-name">${teamBadgeHtml(team.key)}</span>
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

async function viewPersonalRanking(user) {
  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🏅 개인 랭킹</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <p class="loading">불러오는 중...</p>
    </section>
  `;
  const { visible, ranking } = await API.getPersonalRanking(user);

  if (!visible) {
    $app.innerHTML = `
      <section class="card">
        <header class="topbar">
          <h1>🏅 개인 랭킹</h1>
          <a class="ghost" href="#/dashboard">← 뒤로</a>
        </header>
        <p class="empty">아직 공개되지 않았어요.</p>
      </section>
    `;
    return;
  }

  const rows = ranking.length
    ? ranking
        .map(
          (r, i) => `
        <li class="score-row-wrap">
          <div class="score-row${r.name === user ? " me" : ""}">
            <span class="rank">${i + 1}</span>
            <span class="person-name">${escapeHtml(r.name)}</span>
            <span class="score">${r.total}점</span>
          </div>
        </li>`
        )
        .join("")
    : `<p class="empty">아직 등록된 점수가 없어요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🏅 개인 랭킹</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>
      <ul class="score-list">${rows}</ul>
    </section>
  `;
}

// ---------- 관리자(이학균) 패널 ----------

// 관리자 쓰기 결과가 실패면 알림. (예전엔 조용히 실패해서 "왜 안되지" 하게 됐음)
function flashAdminError(res) {
  if (res && res.success === false) {
    const msg = {
      not_admin:
        "관리자 권한이 없어요.\n이학균으로 로그인했는지, Firebase 콘솔 config/admin.uid가 비어있는지(→ 다시 로그인하면 자동 등록) 확인하세요.",
      write_failed:
        "쓰기에 실패했어요.\nFirestore 보안 규칙을 최신 firestore.rules로 다시 게시했는지 확인하세요.",
      id_exists: "이미 있는 ID예요.",
      no_id: "ID를 입력하세요.",
    };
    alert(msg[res.error] || `실패: ${res.error || "알 수 없음"}`);
    return true;
  }
  return false;
}

// 개인점수/개인상은 하나씩 등록할 때마다 서버로 보내면(+전체 새로고침) 느리니까,
// 여기 큐에 모아뒀다가 한 번에 전송합니다. 관리자 패널을 떠나면(페이지 새로고침 등) 비워집니다.
let adminPendingScores = [];

async function viewAdmin(user, feedback) {
  if (user !== ADMIN_NAME) {
    navigate("#/dashboard");
    return;
  }
  $app.innerHTML = loadingCard("불러오는 중...");

  const [events, settings, names] = await Promise.all([
    API.getEvents(),
    API.getSettings(),
    API.getAllowedNames(),
  ]);

  const missions = settings.currentEvent
    ? await API.getMissionsByEvent(settings.currentEvent)
    : [];

  renderAdmin(user, events, settings, names, missions, feedback);
}

function renderAdmin(user, events, settings, names, missions, feedback) {
  const currentEventData = events.find((ev) => ev.name === settings.currentEvent);
  const defaultPoints = currentEventData && currentEventData.points ? currentEventData.points : 20;

  const eventOptions = events
    .map(
      (ev) =>
        `<option value="${escapeHtml(ev.name)}"${
          ev.name === settings.currentEvent ? " selected" : ""
        }>${escapeHtml(ev.icon)} ${escapeHtml(ev.name)}</option>`
    )
    .join("");

  const nameOptions = names
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
    .join("");

  const STATUS_BUTTONS = ["진행중", "성공", "실패"];
  const missionRows = missions.length
    ? missions
        .map((m, i) => {
          const currentStatus = m.status || "진행중";
          const buttons = STATUS_BUTTONS.map(
            (s) =>
              `<button type="button" class="mini-btn status-${s}${
                s === currentStatus ? " active" : ""
              }" data-idx="${i}" data-status="${s}">${s}</button>`
          ).join("");
          return `
        <li class="admin-mission-row">
          <div class="admin-mission-text">
            <span>${escapeHtml(m.mission)}</span>
            <span class="admin-mission-meta">${m.points}점 · ${
              m.claimedBy ? escapeHtml(m.claimedBy) : "아직 아무도 안 가져감"
            }</span>
          </div>
          <div class="admin-mission-actions">${buttons}</div>
        </li>`;
        })
        .join("")
    : `<p class="empty">이 종목에 연결된 미션이 없어요.</p>`;

  const eventSection = settings.currentEvent
    ? `
      <div class="admin-section">
        <p class="admin-section-title">
          팀 결과 선언 — ${escapeHtml(settings.currentEvent)}
          ${currentEventData && currentEventData.points ? `<span class="admin-default-points">(기본 ${currentEventData.points}점)</span>` : ""}
        </p>
        <div class="admin-inline-form">
          <input id="team-points" type="number" value="${defaultPoints}" min="0" />
          <button type="button" class="team-win-btn" data-team="흑팀">흑팀 승리</button>
          <button type="button" class="team-win-btn" data-team="백팀">백팀 승리</button>
        </div>
      </div>

      <div class="admin-section">
        <p class="admin-section-title">개인점수 선언 <span class="admin-default-points">(목록에 추가만 하고, 아래에서 한번에 전송)</span></p>
        <form id="personal-score-form" class="admin-stack-form">
          <select name="name">${nameOptions}</select>
          <input name="note" type="text" placeholder="비고 (예: 1등, 3등)" required />
          <input name="points" type="number" value="${defaultPoints}" required />
          <button type="submit">목록에 추가</button>
        </form>
      </div>

      <div class="admin-section">
        <p class="admin-section-title">개인상 선언</p>
        <form id="personal-award-form" class="admin-stack-form">
          <select name="name">${nameOptions}</select>
          <input name="note" type="text" placeholder="상 이름 (예: MVP, 수훈상)" required />
          <input name="points" type="number" value="${defaultPoints}" required />
          <button type="submit">목록에 추가</button>
        </form>
      </div>

      <div class="admin-section">
        <p class="admin-section-title">전송 대기 목록 (${adminPendingScores.length}건)</p>
        ${
          adminPendingScores.length
            ? `<ul class="admin-pending-list">${adminPendingScores
                .map(
                  (p, i) => `
              <li class="admin-pending-item">
                <span>${escapeHtml(p.targetName)} · ${escapeHtml(p.note)} · ${p.points}점</span>
                <button type="button" class="pending-remove-btn" data-idx="${i}">✕</button>
              </li>`
                )
                .join("")}</ul>
              <button type="button" id="send-batch-btn" class="wide-btn">📤 ${adminPendingScores.length}건 한번에 전송</button>`
            : `<p class="hint">위에서 항목을 추가하면 여기 쌓여요. 다 모으고 나서 한번에 전송하면 됩니다.</p>`
        }
      </div>

      <div class="admin-section">
        <p class="admin-section-title">관련 히든미션 판정</p>
        <ul class="admin-mission-list">${missionRows}</ul>
      </div>`
    : `<p class="hint">종목을 먼저 설정하면 결과 선언/미션 판정 메뉴가 나와요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🛠️ 관리자 패널</h1>
        <a class="ghost" href="#/dashboard">← 뒤로</a>
      </header>

      ${feedback ? `<p class="admin-feedback">${escapeHtml(feedback)}</p>` : ""}

      <div class="admin-section">
        <p class="admin-section-title">대회 시작 여부</p>
        <button type="button" id="event-started-toggle-btn" class="wide-btn">
          ${
            settings.eventStarted
              ? "🟢 시작됨 (누르면 시작 전으로)"
              : "⚪ 시작 전 — 참가자는 우리팀만 볼 수 있어요 (누르면 시작으로)"
          }
        </button>
      </div>

      <div class="admin-section">
        <p class="admin-section-title">지금 진행 중인 종목</p>
        <form id="event-form" class="admin-inline-form">
          <select id="event-select">
            <option value="">— 선택 —</option>
            ${eventOptions}
          </select>
          <button type="submit">설정</button>
        </form>
      </div>

      ${eventSection}

      <div class="admin-section">
        <p class="admin-section-title">데이터 관리</p>
        <a class="menu-item" href="#/admin/scores">
          <span class="menu-icon">🧾</span>
          <span>점수 로그 관리 (수정·삭제)</span>
        </a>
        <a class="menu-item" href="#/admin/missions">
          <span class="menu-icon">🎯</span>
          <span>미션칩 전체 관리 (실시간)</span>
        </a>
        <a class="menu-item" href="#/admin/pins">
          <span class="menu-icon">🔑</span>
          <span>PIN 관리 (초기화)</span>
        </a>
      </div>

      <div class="admin-section">
        <p class="admin-section-title">개인 랭킹 공개</p>
        <button type="button" id="ranking-toggle-btn" class="wide-btn">
          ${
            settings.personalRankingVisible
              ? "🔓 공개 중 (누르면 비공개로)"
              : "🔒 비공개 (누르면 공개로)"
          }
        </button>
      </div>
    </section>
  `;

  document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const eventName = document.getElementById("event-select").value;
    if (flashAdminError(await API.setCurrentEvent(user, eventName || null))) return;
    viewAdmin(
      user,
      eventName ? `진행 종목을 "${eventName}"(으)로 설정했어요.` : "진행 종목을 해제했어요."
    );
  });

  document.getElementById("ranking-toggle-btn").addEventListener("click", async () => {
    await API.setPersonalRankingVisible(user, !settings.personalRankingVisible);
    viewAdmin(user);
  });

  document.getElementById("event-started-toggle-btn").addEventListener("click", async () => {
    await API.setEventStarted(user, !settings.eventStarted);
    viewAdmin(user);
  });

  if (!settings.currentEvent) return;

  // 팀 승리는 이 패널에 표시되는 다른 데이터에 영향을 안 주니, 서버 확인 후
  // 전체를 다시 불러오지 않고 그 자리에서 바로 다시 그립니다(네트워크 왕복 1번만).
  document.querySelectorAll(".team-win-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const points = Number(document.getElementById("team-points").value) || 0;
      await API.addTeamScore(user, btn.dataset.team, settings.currentEvent, "승리", points);
      renderAdmin(
        user,
        events,
        settings,
        names,
        missions,
        `${btn.dataset.team} 승리 ${points}점 등록했어요.`
      );
    });
  });

  // 개인점수/개인상은 서버로 바로 안 보내고 큐에만 쌓습니다 — 네트워크 호출 없이 즉시 반영.
  document.getElementById("personal-score-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    adminPendingScores.push({
      targetName: f.name.value,
      event: settings.currentEvent,
      note: f.note.value,
      points: Number(f.points.value),
    });
    renderAdmin(user, events, settings, names, missions, feedback);
  });

  document.getElementById("personal-award-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    adminPendingScores.push({
      targetName: f.name.value,
      event: settings.currentEvent,
      note: f.note.value,
      points: Number(f.points.value),
    });
    renderAdmin(user, events, settings, names, missions, feedback);
  });

  document.querySelectorAll(".pending-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      adminPendingScores.splice(Number(btn.dataset.idx), 1);
      renderAdmin(user, events, settings, names, missions, feedback);
    });
  });

  const sendBatchBtn = document.getElementById("send-batch-btn");
  if (sendBatchBtn) {
    sendBatchBtn.addEventListener("click", async () => {
      const entries = adminPendingScores;
      sendBatchBtn.disabled = true;
      sendBatchBtn.textContent = "전송 중...";
      await API.addPersonalScoresBatch(user, entries);
      adminPendingScores = [];
      renderAdmin(user, events, settings, names, missions, `${entries.length}건 한번에 등록했어요.`);
    });
  }

  // 미션 판정은 그 목록만 새로 받아와서 다시 그립니다(전체 재조회 안 함).
  document.querySelectorAll(".admin-mission-row .mini-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const chip = missions[Number(btn.dataset.idx)];
      if (flashAdminError(await API.setMissionStatus(user, chip.id, btn.dataset.status))) return;
      const freshMissions = await API.getMissionsByEvent(settings.currentEvent);
      renderAdmin(user, events, settings, names, freshMissions);
    });
  });
}

// ---------- 관리자: 미션칩 전체 관리 (실시간) ----------

let _adminMissionEditing = null; // 지금 수정 중인 chipId

async function viewAdminMissions(user) {
  if (user !== ADMIN_NAME) {
    navigate("#/dashboard");
    return;
  }
  $app.innerHTML = loadingCard("불러오는 중...");

  const [events, names] = await Promise.all([API.getEvents(), API.getAllowedNames()]);
  const eventNames = events.map((e) => e.name);
  let chips = [];
  let query = "";

  const rerender = () => renderAdminMissions(user, chips, eventNames, names, query);

  _activeUnsub = API.onMissionChips((list) => {
    chips = list.sort((a, b) => a.id.localeCompare(b.id));
    rerender();
  });

  // renderAdminMissions가 검색어 변경 시 query만 갱신하도록 closure 노출
  window._adminMissionsSetQuery = (q) => {
    query = q;
    rerender();
  };
}

function renderAdminMissions(user, chips, eventNames, names, query) {
  const STATUSES = ["진행중", "성공", "실패"];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? chips.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          String(c.mission || "").toLowerCase().includes(q) ||
          String(c.event || "").toLowerCase().includes(q)
      )
    : chips;

  // ID 앞 2글자로 그룹
  const groupLabel = { EZ: "EZ · 쉬움", MD: "MD · 중간", HD: "HD · 어려움" };
  const groups = {};
  for (const c of filtered) {
    const key = c.id.slice(0, 2).toUpperCase();
    (groups[key] = groups[key] || []).push(c);
  }

  const eventOpts = (sel) =>
    `<option value=""${!sel ? " selected" : ""}>(종목 없음)</option>` +
    eventNames
      .map(
        (n) =>
          `<option value="${escapeHtml(n)}"${n === sel ? " selected" : ""}>${escapeHtml(n)}</option>`
      )
      .join("");

  const assignOpts = (sel) =>
    `<option value=""${!sel ? " selected" : ""}>(미배정)</option>` +
    names
      .map(
        (n) =>
          `<option value="${escapeHtml(n)}"${n === sel ? " selected" : ""}>${escapeHtml(n)}</option>`
      )
      .join("");

  const chipHtml = (c) => {
    if (_adminMissionEditing === c.id) {
      return `
        <li class="admin-mission-row editing" data-id="${escapeHtml(c.id)}">
          <div class="admin-mission-text"><strong>${escapeHtml(c.id)}</strong></div>
          <form class="admin-stack-form chip-edit-form">
            <textarea name="mission" rows="2">${escapeHtml(c.mission || "")}</textarea>
            <div class="admin-inline-form">
              <input name="points" type="number" value="${c.points || 0}" />
              <select name="event">${eventOpts(c.event || "")}</select>
            </div>
            <div class="admin-mission-actions">
              <button type="submit" class="mini-btn active status-성공">저장</button>
              <button type="button" class="mini-btn chip-edit-cancel">취소</button>
              <button type="button" class="mini-btn status-실패 chip-delete">삭제</button>
            </div>
          </form>
        </li>`;
    }
    const cur = c.status || (c.claimedBy ? "진행중" : null);
    const statusBtns = STATUSES.map(
      (s) =>
        `<button type="button" class="mini-btn status-${s}${
          s === cur ? " active" : ""
        }" data-id="${escapeHtml(c.id)}" data-status="${s}">${s}</button>`
    ).join("");
    return `
      <li class="admin-mission-row" data-id="${escapeHtml(c.id)}">
        <div class="admin-mission-text">
          <span><strong>${escapeHtml(c.id)}</strong> · ${c.points || 0}점 · ${escapeHtml(c.event || "종목없음")}</span>
          <span class="admin-mission-meta">${escapeHtml(c.mission || "")}</span>
          <span class="admin-mission-meta">배정:
            <select class="chip-assign" data-id="${escapeHtml(c.id)}">${assignOpts(c.claimedBy || "")}</select>
          </span>
        </div>
        <div class="admin-mission-actions">
          ${statusBtns}
          <button type="button" class="mini-btn chip-edit" data-id="${escapeHtml(c.id)}">수정</button>
        </div>
      </li>`;
  };

  const groupsHtml =
    Object.keys(groups)
      .sort()
      .map(
        (k) => `
      <div class="admin-section">
        <p class="admin-section-title">${escapeHtml(groupLabel[k] || k)} (${groups[k].length})</p>
        <ul class="admin-mission-list">${groups[k].map(chipHtml).join("")}</ul>
      </div>`
      )
      .join("") || `<p class="empty">검색 결과가 없어요.</p>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🎯 미션칩 전체 관리</h1>
        <a class="ghost" href="#/admin">← 뒤로</a>
      </header>
      <input id="chip-search" type="text" placeholder="ID / 미션 / 종목 검색" value="${escapeHtml(query)}" />
      <p class="hint">전체 ${chips.length}개 · 실시간 반영. 누가 스캔하면 여기 바로 떠요.</p>
      ${groupsHtml}
      <div class="admin-section">
        <p class="admin-section-title">새 미션칩 추가</p>
        <form id="chip-add-form" class="admin-stack-form">
          <input name="chipId" type="text" placeholder="missionId (예: EZ99, QR에 인쇄될 값)" required />
          <textarea name="mission" rows="2" placeholder="미션 내용 ([파트너]/[네메시스]/[티어] 사용 가능)" required></textarea>
          <div class="admin-inline-form">
            <input name="points" type="number" placeholder="점수" required />
            <select name="event">${eventOpts("")}</select>
          </div>
          <button type="submit">추가</button>
        </form>
      </div>
    </section>
  `;

  const search = document.getElementById("chip-search");
  search.addEventListener("input", () => window._adminMissionsSetQuery(search.value));

  $app.querySelectorAll(".mini-btn[data-status]").forEach((btn) => {
    btn.addEventListener("click", async () =>
      flashAdminError(await API.setMissionStatus(user, btn.dataset.id, btn.dataset.status))
    );
  });

  $app.querySelectorAll(".chip-assign").forEach((sel) => {
    sel.addEventListener("change", async () => {
      flashAdminError(await API.assignMissionChip(user, sel.dataset.id, sel.value || null));
    });
  });

  $app.querySelectorAll(".chip-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      _adminMissionEditing = btn.dataset.id;
      renderAdminMissions(user, chips, eventNames, names, query);
    });
  });

  $app.querySelectorAll(".chip-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      _adminMissionEditing = null;
      renderAdminMissions(user, chips, eventNames, names, query);
    });
  });

  $app.querySelectorAll(".chip-edit-form").forEach((form) => {
    const chipId = form.closest(".admin-mission-row").dataset.id;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const patch = {
        mission: form.mission.value,
        points: form.points.value,
        event: form.event.value,
      };
      _adminMissionEditing = null;
      renderAdminMissions(user, chips, eventNames, names, query);
      flashAdminError(await API.updateMissionChip(user, chipId, patch));
    });
    form.querySelector(".chip-delete").addEventListener("click", async () => {
      if (!confirm(`${chipId} 삭제할까요?`)) return;
      _adminMissionEditing = null;
      flashAdminError(await API.deleteMissionChip(user, chipId));
    });
  });

  const addForm = document.getElementById("chip-add-form");
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await API.createMissionChip(user, addForm.chipId.value, {
      mission: addForm.mission.value,
      points: addForm.points.value,
      event: addForm.event.value,
    });
    if (flashAdminError(res)) return;
    addForm.reset();
  });
}

// ---------- 관리자: 점수 로그 관리 (수정·삭제, 실시간) ----------

let _adminScoreEditing = null; // "personal:<id>" 또는 "team:<id>"

async function viewAdminScores(user) {
  if (user !== ADMIN_NAME) {
    navigate("#/dashboard");
    return;
  }
  $app.innerHTML = loadingCard("불러오는 중...");
  _activeUnsub = API.onScoreLog(({ personal, team }) => {
    renderAdminScores(user, personal, team);
  });
}

function renderAdminScores(user, personal, team) {
  const row = (kind, e) => {
    const key = `${kind}:${e.id}`;
    const who = kind === "team" ? e.team : e.name;
    if (_adminScoreEditing === key) {
      return `
        <li class="admin-mission-row editing" data-key="${key}">
          <div class="admin-mission-text"><strong>${escapeHtml(who || "")}</strong> · ${escapeHtml(e.event || "")}</div>
          <form class="admin-stack-form score-edit-form">
            <input name="note" type="text" value="${escapeHtml(e.note || "")}" placeholder="비고" />
            <div class="admin-inline-form">
              <input name="points" type="number" value="${e.points || 0}" />
              <button type="submit" class="mini-btn active status-성공">저장</button>
              <button type="button" class="mini-btn score-edit-cancel">취소</button>
              <button type="button" class="mini-btn status-실패 score-delete">삭제</button>
            </div>
          </form>
        </li>`;
    }
    return `
      <li class="admin-mission-row" data-key="${key}">
        <div class="admin-mission-text">
          <span><strong>${escapeHtml(who || "?")}</strong> · ${escapeHtml(e.event || "")} · ${e.points || 0}점</span>
          <span class="admin-mission-meta">${escapeHtml(e.note || "")}</span>
        </div>
        <div class="admin-mission-actions">
          <button type="button" class="mini-btn score-edit" data-key="${key}">수정</button>
        </div>
      </li>`;
  };

  const section = (title, kind, list) => `
    <div class="admin-section">
      <p class="admin-section-title">${title} (${list.length})</p>
      ${
        list.length
          ? `<ul class="admin-mission-list">${list.map((e) => row(kind, e)).join("")}</ul>`
          : `<p class="empty">아직 없어요.</p>`
      }
    </div>`;

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🧾 점수 로그 관리</h1>
        <a class="ghost" href="#/admin">← 뒤로</a>
      </header>
      <p class="hint">최신순 · 실시간. 잘못 넣은 점수는 여기서 [수정]으로 비고/점수를 고치거나 삭제하세요.</p>
      ${section("팀 점수", "team", team)}
      ${section("개인 점수", "personal", personal)}
    </section>
  `;

  const findEntry = (key) => {
    const [kind, id] = key.split(":");
    const list = kind === "team" ? team : personal;
    return { kind, id, entry: list.find((x) => x.id === id) };
  };

  $app.querySelectorAll(".score-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      _adminScoreEditing = btn.dataset.key;
      renderAdminScores(user, personal, team);
    });
  });
  $app.querySelectorAll(".score-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      _adminScoreEditing = null;
      renderAdminScores(user, personal, team);
    });
  });
  $app.querySelectorAll(".score-edit-form").forEach((form) => {
    const key = form.closest(".admin-mission-row").dataset.key;
    const { kind, id } = findEntry(key);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const patch = { note: form.note.value, points: form.points.value };
      _adminScoreEditing = null;
      renderAdminScores(user, personal, team);
      flashAdminError(await API.updateScoreEntry(user, kind, id, patch));
    });
    form.querySelector(".score-delete").addEventListener("click", async () => {
      if (!confirm("이 점수 기록을 삭제할까요?")) return;
      _adminScoreEditing = null;
      flashAdminError(await API.deleteScoreEntry(user, kind, id));
    });
  });
}

// ---------- 관리자: PIN 관리 (초기화, 실시간) ----------

async function viewAdminPins(user) {
  if (user !== ADMIN_NAME) {
    navigate("#/dashboard");
    return;
  }
  $app.innerHTML = loadingCard("불러오는 중...");
  _activeUnsub = API.onLogins((logins) => renderAdminPins(user, logins));
}

function renderAdminPins(user, logins) {
  const rows = logins
    .map(
      (l) => `
      <li class="admin-mission-row">
        <div class="admin-mission-text">
          <span><strong>${escapeHtml(l.name)}</strong></span>
          <span class="admin-mission-meta">${l.hasPin ? "🔒 PIN 설정됨" : "⚪ PIN 없음 (아직 미설정)"}</span>
        </div>
        <div class="admin-mission-actions">
          ${
            l.hasPin
              ? `<button type="button" class="mini-btn status-실패 pin-reset" data-name="${escapeHtml(l.name)}">PIN 초기화</button>`
              : `<span class="admin-mission-meta">—</span>`
          }
        </div>
      </li>`
    )
    .join("");

  $app.innerHTML = `
    <section class="card">
      <header class="topbar">
        <h1>🔑 PIN 관리</h1>
        <a class="ghost" href="#/admin">← 뒤로</a>
      </header>
      <p class="hint">초기화하면 그 사람은 다음 로그인 때 PIN을 새로 설정합니다. (실시간)</p>
      <ul class="admin-mission-list">${rows}</ul>
    </section>
  `;

  $app.querySelectorAll(".pin-reset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      if (!confirm(`${name}님 PIN을 초기화할까요?\n다음 로그인 때 새 PIN을 설정하게 됩니다.`)) return;
      btn.disabled = true;
      flashAdminError(await API.resetPin(user, name));
    });
  });
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

// ---------- 뷰 정리(실시간 리스너 구독 해제) ----------

let _activeUnsub = null;

function cleanupView() {
  if (_activeUnsub) {
    try {
      _activeUnsub();
    } catch (e) {
      /* noop */
    }
    _activeUnsub = null;
  }
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
  "#/team": (user) => viewMyTeam(user),
  "#/scores": () => viewTeamScores(),
  "#/my-score": (user) => viewMyScore(user),
  "#/ranking": (user) => viewPersonalRanking(user),
  "#/mission": (user) => viewMission(user),
  "#/scan": (user) => viewScan(user),
  "#/admin": (user) => viewAdmin(user),
  "#/admin/missions": (user) => viewAdminMissions(user),
  "#/admin/scores": (user) => viewAdminScores(user),
  "#/admin/pins": (user) => viewAdminPins(user),
};

// 대회 시작 전(관리자 제외)에도 볼 수 있는 라우트. 그 외는 직접 주소로 들어가도 막힘.
const ALWAYS_ALLOWED_ROUTES = ["#/login", "#/dashboard", "#/team"];

async function render() {
  if (location.hash !== "#/scan") {
    stopCamera();
  }
  cleanupView();
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

  if (user !== ADMIN_NAME && !ALWAYS_ALLOWED_ROUTES.includes(hash)) {
    const { eventStarted } = await API.getSettings();
    if (!eventStarted && hash !== "#/dashboard") {
      location.hash = "#/dashboard";
      return;
    }
  }

  const view = ROUTES[hash] || ROUTES["#/dashboard"];
  view(user);
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

// 지금 화면을 조용히 다시 그립니다. (카메라 스캔 중이면 건드리지 않음)
function autoRerender() {
  if (location.hash === "#/scan") return;
  render();
}

// 설정(진행 종목 / 대회 시작 / 랭킹 공개)이 실시간으로 바뀌면 즉시 화면을 갱신합니다.
// → 관리자가 "대회 시작"을 켜는 순간 모두의 대시보드가 자동으로 잠금 해제됩니다.
window.addEventListener("settingschange", autoRerender);

// 탭이 백그라운드였다가 다시 보이거나 창에 포커스가 오면, 실시간 리스너가 못 따라잡았을 수
// 있으니 설정을 강제로 다시 읽어옵니다. 값이 실제로 바뀌었으면 settingschange가 떠서
// 위 autoRerender가 실행됩니다. (안 바뀌었으면 화면 안 건드림 → Ctrl+F5 불필요)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") API.refreshSettings();
});
window.addEventListener("focus", () => API.refreshSettings());
