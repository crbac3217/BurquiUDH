// Firestore 백엔드. 화면(app.js)이 쓰는 메서드 이름/반환 모양은 예전 Apps Script 버전과
// 똑같아서 app.js는 거의 안 바뀝니다. 대신 훨씬 빠르고, 아래 settings는 실시간으로 갱신됩니다.

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const deleteField = firebase.firestore.FieldValue.delete;
const arrayUnion = firebase.firestore.FieldValue.arrayUnion;

// 익명 로그인 — 보안 규칙이 request.auth를 요구하므로, 모든 요청 전에 이게 끝나야 합니다.
const authReady = auth
  .signInAnonymously()
  .then(() => auth.currentUser && auth.currentUser.uid)
  .catch((err) => {
    console.error("[api] 익명 로그인 실패:", err);
    return null;
  });

// ---------- 해시 (PIN) ----------
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- 참가자 캐시 + 미션 텍스트 치환 ----------
const _participantCache = {};
async function getParticipant(name) {
  if (name in _participantCache) return _participantCache[name];
  const snap = await db.doc(`participants/${name}`).get();
  const p = snap.exists ? snap.data() : null;
  _participantCache[name] = p;
  return p;
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// 미션 문구의 [파트너]/[네메시스]/[티어] 토큰을 그 사람 기준으로 치환.
// asHtml=true면 치환값(또는 미치환 토큰)을 색상 <span>으로 감싼 안전한 HTML을 반환.
function resolveMissionText(template, participant, asHtml) {
  const t = String(template == null ? "" : template);
  const tier =
    participant && participant.tier != null && participant.tier !== ""
      ? String(participant.tier)
      : null;
  const vals = {
    "[파트너]": [(participant && participant.partner) || null, "partner", "(파트너 미지정)"],
    "[네메시스]": [(participant && participant.nemesis) || null, "nemesis", "(네메시스 미지정)"],
    "[티어]": [tier, "tier", "(티어 미지정)"],
  };
  if (!asHtml) {
    let out = t;
    for (const tok in vals) out = out.split(tok).join(vals[tok][0] || vals[tok][2]);
    return out;
  }
  let out = escHtml(t);
  for (const tok in vals) {
    const [val, cls, fallback] = vals[tok];
    const inner = escHtml(val || fallback);
    out = out.split(tok).join(`<span class="mtok mtok-${cls}">${inner}</span>`);
  }
  return out;
}

// ---------- 설정 (실시간) ----------
let _settings = {
  currentEvent: null,
  personalRankingVisible: false,
  eventStarted: false,
  revealedEvents: [],
};
let _settingsLoaded = false;
function applySettingsSnap(d) {
  const next = {
    currentEvent: (d && d.currentEvent) || null,
    personalRankingVisible: !!(d && d.personalRankingVisible),
    eventStarted: !!(d && d.eventStarted),
    revealedEvents: (d && Array.isArray(d.revealedEvents) ? d.revealedEvents : []).slice(),
  };
  const changed =
    !_settingsLoaded ||
    next.currentEvent !== _settings.currentEvent ||
    next.personalRankingVisible !== _settings.personalRankingVisible ||
    next.eventStarted !== _settings.eventStarted ||
    next.revealedEvents.join("|") !== (_settings.revealedEvents || []).join("|");
  _settings = next;
  _settingsLoaded = true;
  if (changed) {
    window.dispatchEvent(new CustomEvent("settingschange", { detail: _settings }));
  }
}

db.doc("config/settings").onSnapshot(
  (snap) => applySettingsSnap(snap.exists ? snap.data() : {}),
  (err) => console.warn("[api] settings 구독 실패:", err)
);

// ---------- 관리자 UID ----------
let _adminUidCache = null;
async function loadAdminUid() {
  if (_adminUidCache !== null) return _adminUidCache;
  const snap = await db.doc("config/admin").get();
  _adminUidCache = snap.exists ? snap.data().uid || "" : "";
  return _adminUidCache;
}

// ADMIN_NAME으로 로그인/PIN설정에 성공한 사람이 처음이면, 그 사람 UID를 관리자로 등록.
async function claimAdminIfNeeded() {
  const uid = await authReady;
  if (!uid) return;
  const current = await loadAdminUid();
  if (current) return;
  try {
    await db.doc("config/admin").set({ uid });
    _adminUidCache = uid;
  } catch (err) {
    console.warn("[api] 관리자 UID 등록 실패(권한):", err);
  }
}

async function isAdminNow() {
  const uid = await authReady;
  const adminUid = await loadAdminUid();
  return !!uid && uid === adminUid;
}

async function adminWrite(fn, count) {
  await authReady;
  if (!(await isAdminNow())) return { success: false, error: "not_admin" };
  try {
    await fn();
    return count != null ? { success: true, count } : { success: true };
  } catch (err) {
    console.warn("[api] 관리자 쓰기 실패:", err);
    return { success: false, error: "write_failed" };
  }
}

const API = {
  // 실시간으로 유지되는 설정을 즉시 반환(첫 로드만 살짝 기다림).
  async getSettings() {
    await authReady;
    if (!_settingsLoaded) {
      await new Promise((resolve) => {
        if (_settingsLoaded) return resolve();
        const h = () => {
          window.removeEventListener("settingschange", h);
          resolve();
        };
        window.addEventListener("settingschange", h);
        setTimeout(h, 4000);
      });
    }
    return { ..._settings };
  },

  // 탭이 백그라운드였다가 돌아왔을 때처럼, 실시간 리스너가 아직 못 따라잡았을 수 있을 때
  // 설정을 강제로 한 번 직접 읽어와서 갱신합니다.
  async refreshSettings() {
    await authReady;
    try {
      const snap = await db.doc("config/settings").get();
      applySettingsSnap(snap.exists ? snap.data() : {});
    } catch (err) {
      console.warn("[api] refreshSettings 실패:", err);
    }
    return { ..._settings };
  },

  // 관리자 인식 진단용. 이 기기의 익명 UID와 config/admin에 등록된 UID를 비교.
  async adminDiag() {
    const uid = await authReady;
    _adminUidCache = null; // 항상 최신값 확인
    const adminUid = await loadAdminUid();
    return {
      uid: uid || null,
      adminUid: adminUid || null,
      isAdmin: !!uid && uid === adminUid,
    };
  },

  // 이 기기를 관리자로 (재)등록. config/admin.uid가 비어있을 때만 규칙상 성공.
  async reclaimAdmin() {
    const uid = await authReady;
    if (!uid) return { success: false, error: "no_auth" };
    try {
      await db.doc("config/admin").set({ uid });
      _adminUidCache = uid;
      return { success: true };
    } catch (err) {
      console.warn("[api] reclaimAdmin 실패:", err);
      return { success: false, error: "write_failed" };
    }
  },

  async getEvents() {
    await authReady;
    const snap = await db.collection("events").orderBy("order").get();
    return snap.docs.map((d) => d.data());
  },

  async getAllowedNames() {
    await authReady;
    const snap = await db.collection("participants").get();
    return snap.docs.map((d) => d.id);
  },

  async getMyTeam(name) {
    await authReady;
    const me = await getParticipant(name);
    if (!me || !me.team) return { team: null, teammates: [] };
    const snap = await db
      .collection("participants")
      .where("team", "==", me.team)
      .get();
    return { team: me.team, teammates: snap.docs.map((d) => d.id) };
  },

  async hasPin(name) {
    await authReady;
    const snap = await db.doc(`logins/${name}`).get();
    return { hasPin: snap.exists && !!snap.data().pinHash };
  },

  // 최초 1회만 성공. pinHash가 이미 있으면 규칙이 덮어쓰기를 막습니다(가로채기 방지).
  async setPin(name, pin) {
    await authReady;
    const ref = db.doc(`logins/${name}`);
    const snap = await ref.get();
    if (snap.exists && snap.data().pinHash) {
      return { success: false, error: "already set" };
    }
    const salt = crypto.randomUUID();
    const pinHash = await sha256Hex(pin + salt);
    try {
      await ref.set({ name, pinHash, salt }, { merge: true });
      if (name === ADMIN_NAME) await claimAdminIfNeeded();
      return { success: true };
    } catch (err) {
      console.warn("[api] setPin 실패:", err);
      return { success: false, error: "write_failed" };
    }
  },

  async login(name, pin) {
    await authReady;
    const snap = await db.doc(`logins/${name}`).get();
    if (!snap.exists || !snap.data().pinHash) return { success: false };
    const { pinHash, salt } = snap.data();
    const ok = (await sha256Hex(pin + salt)) === pinHash;
    if (ok && name === ADMIN_NAME) await claimAdminIfNeeded();
    return { success: ok };
  },

  // PersonalScoreLog(수동 입력) + 성공한 히든미션 + 소속 팀 TeamScoreLog를 합쳐서 반환.
  async getMyScoreLog(name) {
    await authReady;
    const [personalSnap, me, chipSnap] = await Promise.all([
      db.collection("personalScores").where("name", "==", name).get(),
      getParticipant(name),
      db.collection("missionChips").where("claimedBy", "==", name).get(),
    ]);

    const personal = personalSnap.docs.map((d) => {
      const x = d.data();
      return { event: x.event, note: x.note, points: x.points };
    });

    const missionScores = chipSnap.docs
      .filter((d) => d.data().status === "성공")
      .map((d) => {
        const x = d.data();
        return {
          event: "개인미션",
          note: resolveMissionText(x.mission, me),
          points: x.points,
        };
      });

    let teamScores = [];
    if (me && me.team) {
      const tSnap = await db
        .collection("teamScores")
        .where("team", "==", me.team)
        .get();
      teamScores = tSnap.docs.map((d) => {
        const x = d.data();
        return { event: x.event, note: `${x.note} (우리팀)`, points: x.points };
      });
    }

    return personal.concat(missionScores, teamScores);
  },

  async getTeamScoreLog() {
    await authReady;
    const snap = await db.collection("teamScores").get();
    return snap.docs.map((d) => d.data());
  },

  async getMyMissions(name) {
    await authReady;
    const [me, snap] = await Promise.all([
      getParticipant(name),
      db.collection("missionChips").where("claimedBy", "==", name).get(),
    ]);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        mission: resolveMissionText(x.mission, me, true),
        points: x.points,
        status: x.status || "진행중",
      };
    });
  },

  // QR로 읽은 미션칩 id를 이 이름에 귀속(트랜잭션으로 "먼저 스캔한 사람" 보장).
  async claimMissionChip(name, chipId) {
    await authReady;
    const me = await getParticipant(name);
    const ref = db.doc(`missionChips/${chipId}`);
    try {
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { success: false, error: "not_found" };
        const d = snap.data();
        if (d.claimedBy && d.claimedBy !== name) {
          return { success: false, error: "claimed_by_other" };
        }
        const alreadyMine = d.claimedBy === name;
        if (!alreadyMine) {
          tx.update(ref, {
            claimedBy: name,
            claimedAt: serverTimestamp(),
            status: "진행중",
          });
        }
        return {
          success: true,
          mission: resolveMissionText(d.mission, me, true),
          points: d.points,
          status: alreadyMine ? d.status || "진행중" : "진행중",
          alreadyMine,
        };
      });
    } catch (err) {
      console.warn("[api] claimMissionChip 실패:", err);
      return { success: false, error: "network" };
    }
  },

  // ---------- 관리자 전용 ----------

  // 진행 종목 설정 = 그 종목의 블러를 풀어줌(revealedEvents에 누적).
  // 빈 값으로 해제 = "초기화" → 진행 종목 없애고 블러 전부 다시 걸기.
  async setCurrentEvent(_adminName, eventName) {
    return adminWrite(() =>
      eventName
        ? db.doc("config/settings").set(
            { currentEvent: eventName, revealedEvents: arrayUnion(eventName) },
            { merge: true }
          )
        : db
            .doc("config/settings")
            .set({ currentEvent: null, revealedEvents: [] }, { merge: true })
    );
  },

  async setPersonalRankingVisible(_adminName, visible) {
    return adminWrite(() =>
      db
        .doc("config/settings")
        .set({ personalRankingVisible: !!visible }, { merge: true })
    );
  },

  async setEventStarted(_adminName, started) {
    return adminWrite(() =>
      db.doc("config/settings").set({ eventStarted: !!started }, { merge: true })
    );
  },

  async addTeamScore(_adminName, team, event, note, points) {
    return adminWrite(() =>
      db.collection("teamScores").add({
        team,
        event,
        note,
        points: Number(points),
        ts: serverTimestamp(),
      })
    );
  },

  async addPersonalScore(_adminName, targetName, event, note, points) {
    return adminWrite(() =>
      db.collection("personalScores").add({
        name: targetName,
        event,
        note,
        points: Number(points),
        ts: serverTimestamp(),
      })
    );
  },

  async getMissionsByEvent(eventName) {
    await authReady;
    const snap = await db
      .collection("missionChips")
      .where("event", "==", eventName)
      .get();
    const out = [];
    for (const d of snap.docs) {
      const x = d.data();
      const p = x.claimedBy ? await getParticipant(x.claimedBy) : null;
      out.push({
        id: d.id,
        mission: resolveMissionText(x.mission, p, true),
        points: x.points,
        claimedBy: x.claimedBy || null,
        status: x.status || null,
      });
    }
    return out;
  },

  async setMissionStatus(_adminName, chipId, status) {
    return adminWrite(() =>
      db.doc(`missionChips/${chipId}`).update({ status })
    );
  },

  // 미션칩 전체 관리용 — 모든 칩을 실시간으로 구독. unsubscribe 함수를 반환.
  onMissionChips(callback) {
    let unsub = () => {};
    authReady.then(() => {
      unsub = db.collection("missionChips").onSnapshot(
        (snap) => {
          callback(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          );
        },
        (err) => console.warn("[api] missionChips 구독 실패:", err)
      );
    });
    return () => unsub();
  },

  // patch: { mission?, points?, event? } 중 바꿀 것만
  async updateMissionChip(_adminName, chipId, patch) {
    const clean = {};
    if (patch.mission !== undefined) clean.mission = String(patch.mission);
    if (patch.points !== undefined) clean.points = Number(patch.points);
    if (patch.event !== undefined) clean.event = patch.event || null;
    return adminWrite(() => db.doc(`missionChips/${chipId}`).update(clean));
  },

  async createMissionChip(_adminName, chipId, data) {
    await authReady;
    if (!(await isAdminNow())) return { success: false, error: "not_admin" };
    const id = String(chipId).trim();
    if (!id) return { success: false, error: "no_id" };
    const ref = db.doc(`missionChips/${id}`);
    const existing = await ref.get();
    if (existing.exists) return { success: false, error: "id_exists" };
    try {
      await ref.set({
        mission: String(data.mission || ""),
        points: Number(data.points) || 0,
        event: data.event || null,
        claimedBy: null,
        claimedAt: null,
        status: null,
      });
      return { success: true };
    } catch (err) {
      console.warn("[api] createMissionChip 실패:", err);
      return { success: false, error: "write_failed" };
    }
  },

  async deleteMissionChip(_adminName, chipId) {
    return adminWrite(() => db.doc(`missionChips/${chipId}`).delete());
  },

  // 관리자가 미션칩을 사람에게 수동 배정/배정해제 (QR 스캔이 안 될 때 대비).
  // name이 빈 값이면 배정 해제(claimedBy/claimedAt/status 초기화).
  async assignMissionChip(_adminName, chipId, name) {
    return adminWrite(async () => {
      const ref = db.doc(`missionChips/${chipId}`);
      if (!name) {
        await ref.update({ claimedBy: null, claimedAt: null, status: null });
        return;
      }
      const cur = (await ref.get()).data() || {};
      await ref.update({
        claimedBy: name,
        claimedAt:
          cur.claimedBy === name && cur.claimedAt ? cur.claimedAt : serverTimestamp(),
        status: cur.claimedBy === name ? cur.status || "진행중" : "진행중",
      });
    });
  },

  // 점수 로그 관리용 — 팀/개인 점수 로그를 최신순으로 실시간 구독. unsubscribe 반환.
  onScoreLog(callback) {
    let personal = [];
    let team = [];
    let u1 = () => {};
    let u2 = () => {};
    const emit = () => callback({ personal, team });
    authReady.then(() => {
      u1 = db
        .collection("personalScores")
        .orderBy("ts", "desc")
        .onSnapshot(
          (snap) => {
            personal = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            emit();
          },
          (err) => console.warn("[api] personalScores 구독 실패:", err)
        );
      u2 = db
        .collection("teamScores")
        .orderBy("ts", "desc")
        .onSnapshot(
          (snap) => {
            team = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            emit();
          },
          (err) => console.warn("[api] teamScores 구독 실패:", err)
        );
    });
    return () => {
      u1();
      u2();
    };
  },

  // kind: "personal" | "team", patch: { note?, points? } 중 바꿀 것만
  async updateScoreEntry(_adminName, kind, id, patch) {
    const col = kind === "team" ? "teamScores" : "personalScores";
    const clean = {};
    if (patch.note !== undefined) clean.note = String(patch.note);
    if (patch.points !== undefined) clean.points = Number(patch.points);
    return adminWrite(() => db.doc(`${col}/${id}`).update(clean));
  },

  async deleteScoreEntry(_adminName, kind, id) {
    const col = kind === "team" ? "teamScores" : "personalScores";
    return adminWrite(() => db.doc(`${col}/${id}`).delete());
  },

  // PIN 관리용 — 로그인 문서들을 실시간 구독. [{ name, hasPin }] 로 콜백. unsubscribe 반환.
  onLogins(callback) {
    let unsub = () => {};
    authReady.then(() => {
      unsub = db.collection("logins").onSnapshot(
        (snap) => {
          callback(
            snap.docs
              .map((d) => ({ name: d.id, hasPin: !!d.data().pinHash }))
              .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          );
        },
        (err) => console.warn("[api] logins 구독 실패:", err)
      );
    });
    return () => unsub();
  },

  // 관리자가 특정 사람 PIN 초기화 → 다음 로그인 때 새로 설정하게 됨.
  async resetPin(_adminName, name) {
    return adminWrite(() =>
      db.doc(`logins/${name}`).update({
        pinHash: deleteField(),
        salt: deleteField(),
      })
    );
  },

  async getPersonalRanking(name) {
    await authReady;
    const settings = await this.getSettings();
    if (!settings.personalRankingVisible && !(await isAdminNow())) {
      return { visible: false, ranking: [] };
    }
    const [pSnap, tSnap, mSnap, partSnap] = await Promise.all([
      db.collection("personalScores").get(),
      db.collection("teamScores").get(),
      db.collection("missionChips").get(),
      db.collection("participants").get(),
    ]);

    const teamOf = {};
    const totals = {};
    partSnap.forEach((d) => {
      teamOf[d.id] = d.data().team;
      totals[d.id] = 0;
    });
    pSnap.forEach((d) => {
      const x = d.data();
      if (x.name in totals) totals[x.name] += Number(x.points || 0);
    });
    mSnap.forEach((d) => {
      const x = d.data();
      if (x.status === "성공" && x.claimedBy in totals) {
        totals[x.claimedBy] += Number(x.points || 0);
      }
    });
    tSnap.forEach((d) => {
      const x = d.data();
      for (const n in totals) if (teamOf[n] === x.team) totals[n] += Number(x.points || 0);
    });

    const ranking = Object.entries(totals)
      .map(([n, t]) => ({ name: n, total: t }))
      .sort((a, b) => b.total - a.total);
    return { visible: true, ranking };
  },
};
