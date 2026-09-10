// Firestore 백엔드. 화면(app.js)이 쓰는 메서드 이름/반환 모양은 예전 Apps Script 버전과
// 똑같아서 app.js는 거의 안 바뀝니다. 대신 훨씬 빠르고, 아래 settings는 실시간으로 갱신됩니다.

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

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

function resolveMissionText(template, participant) {
  const t = String(template == null ? "" : template);
  if (!participant) return t;
  return t
    .split("[파트너]")
    .join(participant.partner || "(파트너 미지정)")
    .split("[네메시스]")
    .join(participant.nemesis || "(네메시스 미지정)")
    .split("[티어]")
    .join(
      participant.tier != null && participant.tier !== ""
        ? String(participant.tier)
        : "(티어 미지정)"
    );
}

// ---------- 설정 (실시간) ----------
let _settings = { currentEvent: null, personalRankingVisible: false, eventStarted: false };
let _settingsLoaded = false;
db.doc("config/settings").onSnapshot(
  (snap) => {
    const d = snap.exists ? snap.data() : {};
    _settings = {
      currentEvent: d.currentEvent || null,
      personalRankingVisible: !!d.personalRankingVisible,
      eventStarted: !!d.eventStarted,
    };
    _settingsLoaded = true;
    window.dispatchEvent(new CustomEvent("settingschange", { detail: _settings }));
  },
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
        mission: resolveMissionText(x.mission, me),
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
          mission: resolveMissionText(d.mission, me),
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

  async setCurrentEvent(_adminName, eventName) {
    return adminWrite(() =>
      db.doc("config/settings").set({ currentEvent: eventName }, { merge: true })
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

  async addPersonalScoresBatch(_adminName, entries) {
    return adminWrite(async () => {
      const batch = db.batch();
      entries.forEach((e) => {
        batch.set(db.collection("personalScores").doc(), {
          name: e.targetName,
          event: e.event,
          note: e.note,
          points: Number(e.points),
          ts: serverTimestamp(),
        });
      });
      await batch.commit();
    }, entries.length);
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
        mission: p ? resolveMissionText(x.mission, p) : x.mission,
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
