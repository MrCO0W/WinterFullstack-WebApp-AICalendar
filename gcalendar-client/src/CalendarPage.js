import { createPortal } from "react-dom";
import "./CalendarWorkspace.css";
import { API_BASE_URL } from "./config";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * CalendarMonthBoard (Full rewrite)
 * - 화면 전체 Month View 렌더링
 * - Google Calendar 색상(/colors) + (event.colorId 우선, 없으면 primary calendarList.colorId)
 * - 선택 월 기준 앞뒤 12개월 범위를 최대 2000개까지 조회
 * - IndexedDB 캐시(용량/성능 측면에서 localStorage보다 안전)
 * - 등록 결과를 화면과 IndexedDB에 반영
 */

/* =========================
 * Date utilities
 * ========================= */
const pad2 = (n) => String(n).padStart(2, "0");


function monthValueFromDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; // "YYYY-MM"
}

function toRFC3339(date) {
  // Date -> RFC3339(오프셋 포함)
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());

  const tzMin = -date.getTimezoneOffset(); // KST=+540
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const tzh = pad2(Math.floor(abs / 60));
  const tzm = pad2(abs % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
}

function getMonthRangeLocal(ym /* "YYYY-MM" */) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr); // 1~12
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0); // exclusive
  return { start, end };
}

function getBulkRangeAround(selectedMonth, monthsBack = 12, monthsForward = 12) {
  const [yStr, mStr] = selectedMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr); // 1~12

  // 선택 월 1일 기준으로 -monthsBack ~ +monthsForward
  const start = new Date(y, (m - 1) - monthsBack, 1, 0, 0, 0);
  const end = new Date(y, (m - 1) + monthsForward + 1, 1, 0, 0, 0); // exclusive
  return { start, end };
}


function buildMonthGrid(ym /* "YYYY-MM" */) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);

  const first = new Date(y, m - 1, 1);
  const firstDow = first.getDay(); // 0=Sun
  const gridStart = new Date(y, m - 1, 1 - firstDow);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function sameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/* =========================
 * Event range / day matching
 * ========================= */
function parseEventRange(ev) {
  const startStr = ev.start?.dateTime ?? ev.start?.date;
  const endStr = ev.end?.dateTime ?? ev.end?.date;
  if (!startStr || !endStr) return null;

  const isAllDay = Boolean(ev.start?.date && ev.end?.date);

  const start = new Date(startStr);
  const endExclusive = new Date(endStr);

  let endInclusive;
  if (isAllDay) {
    endInclusive = new Date(endExclusive);
    endInclusive.setDate(endInclusive.getDate() - 1);
    endInclusive.setHours(23, 59, 59, 999);
  } else {
    endInclusive = new Date(endExclusive);
  }

  return { start, endInclusive, isAllDay };
}

function isEventOnDay(ev, dayDate) {
  const range = parseEventRange(ev);
  if (!range) return false;

  const dayStart = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    0,
    0,
    0
  );
  const dayEnd = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    23,
    59,
    59,
    999
  );

  return !(range.endInclusive < dayStart || range.start > dayEnd);
}


/* =========================
 * IndexedDB simple KV store
 * ========================= */
const DB_NAME = "gcal_cache_db_v1";
const STORE_NAME = "kv";
const CACHE_KEY = "primary_bulk_cache_v1";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}


async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result ?? null);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(true);
    tx.oncomplete = () => db.close();
  });
}

function eventTouchesMonth(ev, selectedMonth /* "YYYY-MM" */) {
  const { start: mStart, end: mEndExcl } = getMonthRangeLocal(selectedMonth);
  const mEndIncl = new Date(mEndExcl);
  mEndIncl.setMilliseconds(mEndIncl.getMilliseconds() - 1);

  const r = parseEventRange(ev);
  if (!r) return false;

  // 월 범위와 이벤트 범위가 겹치면 true
  return !(r.endInclusive < mStart || r.start > mEndIncl);
}

/* =========================
 * Google API fetchers
 * ========================= */

async function deleteEventFromGoogleCalendar(eventId, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`delete 실패 ${res.status}: ${txt}`);
  }

  return true;
}

async function fetchOrThrow(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem("google_access_token");
    sessionStorage.removeItem("login_session_id");
    throw new Error("UNAUTHENTICATED");
  }
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchColors(authHeaders) {
  return fetchOrThrow("https://www.googleapis.com/calendar/v3/colors", {
    headers: authHeaders,
  });
}

async function fetchPrimaryCalendarColorId(authHeaders) {
  const data = await fetchOrThrow(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: authHeaders }
  );
  const primary = (data.items ?? []).find((c) => c.primary === true) ?? null;
  return primary?.colorId ?? null;
}

function pickMinimalEventFields(items) {
  // 저장/렌더에 필요한 필드만 남겨 IndexedDB 용량/속도 최적화
  return (items ?? []).map((ev) => ({
    id: ev.id ?? null,
    summary: ev.summary ?? null,
    description: ev.description ?? null,
    location: ev.location ?? null,
    colorId: ev.colorId ?? null,
    start: ev.start
      ? {
          date: ev.start.date ?? null,
          dateTime: ev.start.dateTime ?? null,
          timeZone: ev.start.timeZone ?? null,
        }
      : null,
    end: ev.end
      ? {
          date: ev.end.date ?? null,
          dateTime: ev.end.dateTime ?? null,
          timeZone: ev.end.timeZone ?? null,
        }
      : null,
  }));
}

async function fetchEventsBulk({ authHeaders, range, limit = 2000 }) {
  let pageToken = null;
  const all = [];

  const fields =
  "items(id,summary,description,location,colorId,start(dateTime,date,timeZone),end(dateTime,date,timeZone)),nextPageToken";

  while (all.length < limit) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", toRFC3339(range.start));
    url.searchParams.set("timeMax", toRFC3339(range.end));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", String(Math.min(2500, limit - all.length)));
    url.searchParams.set("fields", fields);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: authHeaders });
    if (!res.ok) throw new Error(`events ${res.status}: ${await res.text()}`);

    const data = await res.json();
    all.push(...(data.items ?? []));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return pickMinimalEventFields(all.slice(0, limit));
}

/* =========================
 * Main component
 * ========================= */
export default function CalendarMonthBoard() {
  const navigate = useNavigate();
  const gridRef = useRef(null);
  const accessToken = sessionStorage.getItem("google_access_token");
  const loginSessionId = sessionStorage.getItem("login_session_id") ?? "0";

  const [status, setStatus] = useState();
  const [analysisError, setAnalysisError] = useState("");
  const [imageAttempt, setImageAttempt] = useState(0);
  const workspaceRef = useRef(null);
  const [selectedMonth, setSelectedMonth] = useState(monthValueFromDate());

  const [events, setEvents] = useState([]);
  const [colors, setColors] = useState(null);
  const [primaryCalColorId, setPrimaryCalColorId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [droppedImageUrl, setDroppedImageUrl] = useState(null);
  
  const [droppedFile, setDroppedFile] = useState(null);
  const imageRequestRef = useRef(null);
  const imageInputRef = useRef(null);

  function removeImage() {
    imageRequestRef.current?.abort();
    setDroppedFile(null);
    setIsAnalyzingImage(false);
    setDroppedImageUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function attachImage(file) {
    if (!file?.type?.startsWith("image/")) {
      setAnalysisError("이미지 파일을 선택해 주세요.");
      return;
    }
    imageRequestRef.current?.abort();
    setDroppedFile(file);
    setDroppedImageUrl(URL.createObjectURL(file));
  }

  function handleImagePaste(event) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    attachImage(file);
  }

  useEffect(() => {
    return () => { if (droppedImageUrl) URL.revokeObjectURL(droppedImageUrl); };
  }, [droppedImageUrl]);

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsStatus, setLogsStatus] = useState("");
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isProcessingText, setIsProcessingText] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const busy = isAnalyzingImage || isProcessingText || isCreatingEvent;
  useEffect(() => {
    if (!busy) return;
    const focused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (focused?.isConnected) focused.focus();
    };
  }, [busy]);
  const submitLockRef = useRef(false); 


  async function fetchLogs(limit = 50) {
    const res = await fetch(`${API_BASE_URL}/analyze/logs?limit=50`)
    if (!res.ok) throw new Error(`logs fetch 실패 ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message ?? "logs fetch 실패");
    return data.logs ?? [];
  }


  async function openLogs() {
    try {
      setLogsStatus("로그 불러오는 중...");
      setIsLogOpen(true);
      const rows = await fetchLogs(50);
      setLogs(rows);
      setLogsStatus("");
    } catch (e) {
      setLogsStatus(String(e));
    }
  }

  async function clearLogsOnServer() {
    const res = await fetch(`${API_BASE_URL}/analyze/logs`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`logs delete 실패 ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data?.success) throw new Error(data?.message ?? "logs delete 실패");
    return true;
  }

  async function handleClearLogs() {
    const ok = window.confirm("모든 로그를 삭제하시겠습니까?");
    if (!ok) return;

    try {
      setLogsStatus("로그 삭제 중...");
      await clearLogsOnServer();

      // 즉시 UI 반영
      setLogs([]);
      setLogsStatus(""); 
    } catch (e) {
      setLogsStatus(String(e));
    }
  }

  function mapGeminiErrorMessage(err) {
    const msg = String(err?.message ?? err ?? "");

    const tokenLike =
      /429|too\s*many\s*requests|rate\s*limit|quota|insufficient|resource\s*exhausted|exceeded|tokens?|max.*tokens?|context.*length/i.test(
        msg
      );

    if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return "서버에 연결할 수 없습니다. 백엔드 실행 상태와 네트워크를 확인한 후 다시 시도하세요.";
    if (/TimeoutError|시간 초과/i.test(msg)) return "분석 시간이 초과되었습니다. 잠시 후 다시 시도하세요.";
    if (tokenLike) return "AI 사용 한도에 도달했습니다. 잠시 후 다시 시도하거나 API 사용량을 확인하세요.";

    return msg || "오류가 발생했습니다.";
  }

  function resetLeftInputs() {
    setDraft({
      __logId: null,
    colorId: "",
      summary: "",
      description: "",
      location: "",
      start: { date: "", dateTime: "", timeZone: "Asia/Seoul" },
      end: { date: "", dateTime: "", timeZone: "Asia/Seoul" },
    });
    setNlText("");
    removeImage();
  }



  const [draft, setDraft] = useState({
    __logId: null,
    colorId: "",
    summary: "",
    description: "",
    location: "",
    start: { date: "", dateTime: "", timeZone: "Asia/Seoul" },
    end: { date: "", dateTime: "", timeZone: "Asia/Seoul" },
  });


  const [nlText, setNlText] = useState("");

  const authHeaders = useMemo(() => {
    return { Authorization: `Bearer ${accessToken}` };
  }, [accessToken]);


  function changeMonth(delta) {
    setSelectedMonth((prev) => {
      const [y, m] = prev.split("-");
      if(Number(m) + delta < 1) 
        return `${Number(y)-1}-12`;
      if(Number(m) + delta > 12)
        return `${Number(y)+1}-1`
      return `${y}-${Number(m) + delta}`;
    });
  }

  function getEventColors(ev) {
    if (!colors) return { bg: "#e5e7eb", fg: "#111827" };

    const eventColorId = ev.colorId ?? null;
    const calColorId = primaryCalColorId ?? null;

    const palette =
      (eventColorId && colors.event?.[eventColorId]) ||
      (calColorId && colors.calendar?.[calColorId]) ||
      null;

    if (!palette) return { bg: "#e5e7eb", fg: "#111827" };
    return { bg: palette.background, fg: palette.foreground };
  }

    function normalizeTime(t) {
    if (!t) return "";
    return String(t).trim().replace(/\./g, ":"); // 00.00 -> 00:00
  }


  function isHHMM(t) {
    return /^\d{2}:\d{2}$/.test(t);
  }

  function buildRFC3339FromDateAndTimeLocal(dateStr, timeStr) {
    // dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0);
    return toRFC3339(dt); // 기존 함수 사용 (오프셋 포함)
  }

  function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 0, 0, 0);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }


  async function insertEventToGoogleCalendar(draft) {
    if (!accessToken) throw new Error("accessToken 없음");

    const eventBody = {
      ...(draft.colorId ? { colorId: draft.colorId } : {}),
      summary: draft.summary || "",
      description: draft.description || "",
      location: draft.location || "",
      start: {},
      end: {},
    }

    const startDate = draft?.start?.date ?? "";
    const endDate = draft?.end?.date ?? "";

    // UI에서는 dateTime 칸에 "시간(HH:MM 또는 HH.MM)"만 들어온다고 가정
    const startTime = normalizeTime(draft?.start?.dateTime ?? "");
    const endTime = normalizeTime(draft?.end?.dateTime ?? "");

    // ✅ 시간 이벤트: date + time -> RFC3339 로 변환해서 dateTime에 넣음
    if (startDate && endDate && isHHMM(startTime) && isHHMM(endTime)) {
      eventBody.start.dateTime = buildRFC3339FromDateAndTimeLocal(startDate, startTime);
      eventBody.end.dateTime = buildRFC3339FromDateAndTimeLocal(endDate, endTime);

      if (draft.start?.timeZone) eventBody.start.timeZone = draft.start.timeZone;
      if (draft.end?.timeZone) eventBody.end.timeZone = draft.end.timeZone;
    }
    else if (startDate && endDate) {
      eventBody.start.date = startDate;
      eventBody.end.date = addDays(endDate, 1); // ✅ end는 exclusive로 +1
    }
    else {
      throw new Error("start.date와 end.date는 필수입니다. (시간 이벤트/종일 이벤트 모두)");
    }

    console.log("INSERT_EVENT_BODY", eventBody);

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      signal: AbortSignal.timeout(90000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`insert 실패 ${res.status}: ${txt}`);
    }

    return await res.json(); 
  }

  function buildNextDraft(prev, extracted, logId = null) {
    return {
      ...prev,
      __logId: logId ?? prev.__logId ?? null,
      summary: extracted?.summary ?? "",
      description: extracted?.description ?? "",
      location: extracted?.location ?? "",
      start: {
        ...prev.start,
        date: extracted?.start?.date ?? "",
        dateTime: extracted?.start?.time ?? "",
        timeZone: extracted?.start?.timeZone ?? "Asia/Seoul",
      },
      end: {
        ...prev.end,
        date: extracted?.end?.date ?? "",
        dateTime: extracted?.end?.time ?? "",
        timeZone: extracted?.end?.timeZone ?? "Asia/Seoul",
      },
    };
  }

  async function handleConfirmCreateWithDraft(draftToSubmit) {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    try {
      setAnalysisError("");
      setIsCreatingEvent(true);
      setStatus("등록 중...");
      const created = await insertEventToGoogleCalendar(draftToSubmit);

      const eventId = created?.id;
      const logId = draftToSubmit.__logId;

      if (logId && eventId) {
        await fetch(`${API_BASE_URL}/analyze/logs/${logId}/event`, {
          signal: AbortSignal.timeout(15000),
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
      }

      const minimal = pickMinimalEventFields([created])[0];
      minimal.__logId = logId ?? null;

      setEvents((prev) => upsertEvent(prev, minimal));
      await upsertEventIntoCache(minimal);

      setStatus("등록 완료");
      resetLeftInputs();
    } catch (e) {
      setStatus(String(e));
      setAnalysisError(mapGeminiErrorMessage(e));
    } finally {
      setIsCreatingEvent(false); // ✅ 추가
      submitLockRef.current = false;
    }
  }

  async function handleConfirmCreate() {
    return handleConfirmCreateWithDraft(draft);
  }

  function upsertEvent(list, ev) {
  if (!ev?.id) return [ev, ...list];
  const idx = list.findIndex((x) => x.id === ev.id);
  if (idx === -1) return [ev, ...list];
  const copy = list.slice();
  copy[idx] = ev;
  return copy;
}

  async function upsertEventIntoCache(minimalEvent) {
    const cache = await idbGet(CACHE_KEY);

    if (!cache?.events) {
      const bulkRange = getBulkRangeAround(monthValueFromDate(), 12, 12);
      await idbSet(CACHE_KEY, {
        savedAt: Date.now(),
        range: { start: bulkRange.start.toISOString(), end: bulkRange.end.toISOString() },
        colors,
        primaryCalColorId,
        events: [minimalEvent],
      });
      return;
    }

    const nextEvents = upsertEvent(cache.events, minimalEvent);

    await idbSet(CACHE_KEY, {
      ...cache,
      savedAt: Date.now(),
      events: nextEvents,
    });
  }

  async function handleDeleteEvent(ev) {
    if (!ev?.id) return;

    const ok = window.confirm("이 이벤트를 삭제하시겠습니까?");
    if (!ok) return;

    try {
      setStatus("삭제 중...");
      await deleteEventFromGoogleCalendar(ev.id, accessToken);

      // ✅ 화면에서 즉시 제거
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));

      setSelectedEvent(null);

      setStatus("삭제 완료");
    } catch (e) {
      setStatus(String(e));
      setAnalysisError(mapGeminiErrorMessage(e));
    }
  }

  
  async function sendNaturalLanguage(text) {
    const res = await fetch(`${API_BASE_URL}/analyze/text`, {
      signal: AbortSignal.timeout(90000),
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error(`text analyze 실패 ${res.status}: ${await res.text()}`);

    return await res.json(); // { success: true, message: {...} } 또는 { success:true, message:"{...json...}" }
  }

  // 1) 로그인 체크
  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
    }
  }, [accessToken, navigate]);

  useEffect(() => {
    if (!accessToken) return;

    (async () => {
      try {
        setStatus("로드 중...");

        const [colorsJson, primaryColorId] = await Promise.all([
          fetchColors(authHeaders),
          fetchPrimaryCalendarColorId(authHeaders),
        ]);

        const bulkRange = getBulkRangeAround(selectedMonth, 12, 12);
        const bulkEvents = await fetchEventsBulk({
          authHeaders,
          range: bulkRange,
          limit: 2000,
        });

        setColors(colorsJson);
        setPrimaryCalColorId(primaryColorId);
        setEvents(bulkEvents);

        setStatus();
      } catch (e) {
        if (String(e).includes("UNAUTHENTICATED")) {
          navigate("/login", { replace: true });
          return;
        }
        setStatus(`로드 실패: ${String(e)}`);
      }

    })();
  }, [accessToken, authHeaders, selectedMonth, loginSessionId]);

  // 2) 드롭된 이미지 분석
  useEffect(() => {
    if (!droppedFile) return;
    const controller = new AbortController();
    imageRequestRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 90000);

    (async () => {
      try {
        setAnalysisError("");
        setIsAnalyzingImage(true);
        setStatus("이미지 분석 중...");

        const res = await fetch(`${API_BASE_URL}/analyze/image`, {
          signal: controller.signal,
          method: "POST",
          body: (() => {
            const fd = new FormData();
            fd.append("image", droppedFile);
            return fd;
          })(),
        });

        // ✅ 항상 본문을 먼저 읽고
        const rawText = await res.text();

        // ✅ JSON이 아니면 즉시 에러
        let data;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error("서버 응답이 JSON이 아닙니다.");
        }

        // ✅ HTTP 실패 또는 success:false면 에러
        if (!res.ok || data?.success === false) {
          const serverMsg = data?.message ?? data?.error ?? `HTTP ${res.status}`;
          throw new Error(`${res.status} ${serverMsg}`);
        }

        if (controller.signal.aborted) return;
        const extracted = data.message;
        if (!extracted || typeof extracted !== "object" || !extracted.summary || !extracted.start?.date || !extracted.end?.date) throw new Error("분석 결과에 제목 또는 날짜가 없습니다. 입력 내용을 보완해 다시 시도하세요.");
        const logId = data.logId;

        setDraft((prev) => {
          const next = buildNextDraft(prev, extracted, logId);
          if (autoSubmit) queueMicrotask(() => { if (!controller.signal.aborted) handleConfirmCreateWithDraft(next); });
          return next;
        });

        setStatus("분석 완료");
      } catch (e) {
        if (controller.signal.aborted && !timedOut) return;
        setAnalysisError(timedOut ? "이미지 분석 시간이 초과되었습니다. 다시 시도해 주세요." : mapGeminiErrorMessage(e));
        setStatus("이미지 분석 실패");
      } finally {
        clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setIsAnalyzingImage(false);
      }
    })();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [droppedFile, imageAttempt]);


  const monthGrid = useMemo(() => buildMonthGrid(selectedMonth), [selectedMonth]);
  const [yearStr, monthStr] = selectedMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const today = new Date();

  return (
        <div className="calendar-workspace" ref={workspaceRef} inert={busy} aria-busy={busy}>
      {busy && createPortal(
        <div className="processing-overlay" role="dialog" aria-modal="true" aria-labelledby="processing-title" tabIndex={-1} ref={(node) => node?.focus()} onKeyDown={(event) => { if (event.key === "Tab") event.preventDefault(); }}>
          <div className="processing-card" role="status" aria-live="polite">
            <div className="processing-spinner" aria-hidden="true" />
            <h2 id="processing-title">{isAnalyzingImage ? "이미지를 분석하고 있어요" : isProcessingText ? "텍스트를 분석하고 있어요" : "일정을 등록하고 있어요"}</h2>
            <p>잠시만 기다려 주세요. 완료되면 화면이 다시 활성화됩니다.</p>
          </div>
        </div>, document.body
      )}
      {/* Left panel (toggle) */}
      {isSidebarOpen && (
        <aside className="analysis-panel" aria-label="이미지 분석과 텍스트 프롬프트">
          <h2>AI 일정 만들기</h2>
          <p className="analysis-help">이미지 또는 텍스트로 일정을 준비하고 내용을 확인해 등록하세요.</p>
          <p role="status">{status || (isAnalyzingImage ? "이미지 분석 중..." : isProcessingText ? "텍스트 분석 중..." : "")}</p>
          {analysisError && <div className="analysis-error" role="alert"><strong>처리하지 못했어요</strong><p>{analysisError}</p><p>입력 내용은 유지됩니다. 내용을 확인한 후 다시 시도하세요.</p><button onClick={() => setAnalysisError("")}>닫기</button></div>}
          <section className="analysis-input-section" aria-label="분석할 내용">
          <h3>1. 분석할 내용</h3>
          <p className="analysis-help">이미지를 첨부하거나 아래에 일정을 입력하세요.</p>
          <div className="image-actions">
            <label className="image-picker">이미지 선택
              <input ref={imageInputRef} type="file" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) attachImage(e.target.files[0]); e.target.value = ""; }} />
            </label>
            {droppedImageUrl && <><button type="button" onClick={() => setImageAttempt((value) => value + 1)}>다시 분석</button><button type="button" onClick={removeImage}>이미지 제거</button></>}
          </div>          {/* 상단 1/3: 드래그 앤 드롭 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) attachImage(file);
            }}
            onPaste={handleImagePaste}
            tabIndex={0}
            aria-label="이미지 붙여넣기 또는 드롭 영역"            style={{
              position: "relative",
              flex: "0 0 180px",
              border: "2px dashed #cbd5e1",
              borderRadius: 12,
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
              textAlign: "center",
              overflow: "hidden",
              minHeight: 0,
            }}
          >

            {droppedImageUrl ? (
              <img
                src={droppedImageUrl}
                alt="드롭한 이미지"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ fontWeight: 700, opacity: 0.75 }}>
                이미지를 드래그하거나 이 영역에서 Ctrl+V로 붙여넣으세요
              </div>
            )}
          </div>

            <div style={{ marginTop: "auto", display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 800 }}>텍스트 프롬프트</div>
              <textarea
                aria-label="텍스트 프롬프트"
                onPaste={handleImagePaste}
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                placeholder="일정을 입력하거나 복사한 이미지를 Ctrl+V로 붙여넣으세요"
                rows={3}
                style={{
                  width: "90%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  outline: "none",
                  resize: "vertical",
                }}
              />
              <button
                disabled={isAnalyzingImage || isProcessingText || isCreatingEvent}
                onClick={async () => {
                  const text = (nlText ?? "").trim();
                  if (!text) { setAnalysisError("분석할 텍스트를 입력해 주세요."); return; }
                  try {
                    setAnalysisError("");
                    setIsProcessingText(true);

                    const data = await sendNaturalLanguage(nlText);
                    if (!data?.success) throw new Error(data?.message ?? "text analyze 실패");

                    let extracted = data.message;
                    if (typeof extracted === "string") extracted = JSON.parse(extracted);

                    if (!extracted || typeof extracted !== "object" || !extracted.summary || !extracted.start?.date || !extracted.end?.date) throw new Error("분석 결과에 제목 또는 날짜가 없습니다. 입력 내용을 보완해 주세요.");
                    setDraft((prev) => {
                      const next = buildNextDraft(prev, extracted, data.logId);

                      if (autoSubmit) {
                        queueMicrotask(() => handleConfirmCreateWithDraft(next));
                      }
                      return next;
                    });

                  } catch (e) {
                    setAnalysisError(mapGeminiErrorMessage(e));
                    setStatus("텍스트 분석 실패");
                  } finally {
                    setIsProcessingText(false);
                  }
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "transparent",
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                전송
              </button>
            </div>
          </section>
          <section className="analysis-result-section" aria-label="분석 결과">
          {/* 하단 2/3: 텍스트 입력 */}
          <div style={{ flex: 7, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* 하단 절반: 입력 영역 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>2. 분석 결과 · 확인 및 수정</div>

            <button
              disabled={isAnalyzingImage || isProcessingText || isCreatingEvent}
              onClick={handleConfirmCreate}
              style={{
                border: "1px solid #e5e7eb",
                background: "transparent",
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              캘린더에 등록
            </button>
          </div>


            <fieldset className="event-color-picker">
              <legend>일정 색상</legend>
              <p className="analysis-help">Google Calendar에도 선택한 색상으로 등록됩니다.</p>
              <div className="event-color-options">
                <label>
                  <input type="radio" name="event-color" value="" checked={!draft.colorId} onChange={() => setDraft((prev) => ({ ...prev, colorId: "" }))} />
                  캘린더 기본색
                </label>
                {Object.entries(colors?.event ?? {}).map(([id, color]) => (
                  <label key={id} title={`일정 색상 ${id}`}>
                    <input type="radio" name="event-color" value={id} checked={draft.colorId === id} onChange={() => setDraft((prev) => ({ ...prev, colorId: id }))} aria-label={`일정 색상 ${id}`} />
                    <span className="event-color-swatch" style={{ backgroundColor: color.background }} aria-hidden="true" />
                    <span>{id}</span>
                  </label>
                ))}
              </div>
              {!colors?.event && <p className="analysis-help">색상 목록을 불러오지 못했습니다. Google 연결 상태를 확인해 주세요. 기본색으로 등록할 수 있습니다.</p>}
              <div className="event-color-preview" style={{ backgroundColor: (draft.colorId ? colors?.event?.[draft.colorId]?.background : colors?.calendar?.[primaryCalColorId]?.background) || "#dbeafe", color: "#172033" }}>
                {draft.summary || "일정 색상 미리보기"}
              </div>
            </fieldset>
            {/* summary */}
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>summary</div>
              <input
                value={draft.summary}
                onChange={(e) => setDraft((p) => ({ ...p, summary: e.target.value }))}
                placeholder="일정 제목"
                style={{
                  width: "90%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  outline: "none",
                }}
              />
            </label>

            {/* description */}
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>description</div>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                placeholder="일정 설명"
                rows={3}
                style={{
                  width: "90%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </label>

            {/* location */}
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>location</div>
              <input
                value={draft.location}
                onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))}
                placeholder="일정 장소"
                style={{
                  width: "90%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  outline: "none",
                }}
              />
            </label>

            {/* start */}
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>start</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  value={draft.start.date}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, start: { ...p.start, date: e.target.value } }))
                  }
                  placeholder="date (yyyy-mm-dd)"
                  style={{ padding: "10px 12px", width: "80%", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
                />
                <input
                  value={draft.start.dateTime}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, start: { ...p.start, dateTime: e.target.value } }))
                  }
                  placeholder="time (hh:mm)"
                  style={{ padding: "10px 12px", width: "80%", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
                />
              </div>
              <input
                value={draft.start.timeZone}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, start: { ...p.start, timeZone: e.target.value } }))
                }
                placeholder="timeZone (예: Asia/Seoul)"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
              />
            </div>

            {/* end */}
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>end</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  value={draft.end.date}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, end: { ...p.end, date: e.target.value } }))
                  }
                  placeholder="date (yyyy-mm-dd)"
                  style={{ padding: "10px 12px", width: "80%", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
                />
                <input
                  value={draft.end.dateTime}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, end: { ...p.end, dateTime: e.target.value } }))
                  }
                  placeholder="time (hh:mm)"
                  style={{ padding: "10px 12px", width: "80%", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
                />
              </div>
              <input
                value={draft.end.timeZone}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, end: { ...p.end, timeZone: e.target.value } }))
                }
                placeholder="timeZone (예: Asia/Seoul)"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" }}
              />
            </div>


          </div>
          </div>
          </section>
        </aside>

      )}

    {/* 3) Right main */}
    <main className="calendar-panel" aria-label="Google 캘린더">
      <h2 className="calendar-heading">내 캘린더</h2>
      {/* Header */}
        <button
          onClick={() => setIsSidebarOpen((v) => !v)}
          style={{
            width: 40,
            height: 40,
            fontSize: 20,
            cursor: "pointer",
            background: "transparent",
            border: "none"
          }}
          aria-label="메뉴 열기/닫기"
        >
          ☰
        </button>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e5e7eb",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          {/* 왼쪽(비워두거나 메뉴 버튼 같은 것) */}
          <div />

          {/* 가운데: 화살표 + 연/월 (같이 중앙) */}
          <div style={{ display: "flex", gap: 12, fontSize: 20, alignItems: "center", justifyContent: "center" }}>
            <button onClick={() => changeMonth(-1)} style={{background: "transparent", border: "none"}}>◀</button>
            <div style={{ fontWeight: 700 }}>
              {year}년 {month}월
            </div>
            <button onClick={() => changeMonth(1)} style={{background: "transparent", border: "none"}}>▶</button>
          </div>

          {/* 오른쪽: status */}
          <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setAutoSubmit((v) => !v)}
              style={{
                border: autoSubmit ? "1px solid #3b82f6" : "1px solid #e5e7eb",
                background: autoSubmit ? "#dbeafe" : "transparent",
                color: autoSubmit ? "#1d4ed8" : "#374151",
                padding: "9px 14px",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                transition: "all 0.15s ease",
              }}
              aria-pressed={autoSubmit}
            >
              자동 등록
            </button>

            <button
              onClick={openLogs}
              style={{
                border: "1px solid #e5e7eb",
                background: "transparent",
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              로그 확인
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          {["일", "월", "화", "수", "목", "금", "토"].map((w, idx) => (
          <div
            key={w}
            style={{
              padding: 8,
              fontWeight: 700,
              textAlign: "center",
              color: idx === 0 ? "#dc2626" : idx === 6 ? "#2563eb" : "#111827", // 일=빨강, 토=파랑
            }}
          >
            {w}
          </div>
        ))}
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          role="application"
          aria-label="캘린더 격자"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              changeMonth(-1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              changeMonth(1);
            }
          }}
          onMouseDown={() => {
            // 클릭하면 격자가 포커스를 먹어서 그때부터 방향키 동작
            gridRef.current?.focus();
          }}
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "1fr",
            outline: "none", // 포커스 테두리 보기 싫으면
          }}
        >
          {monthGrid.map((day) => {
            const inMonth = day.getMonth() === month - 1;
            const dayEvents = events.filter((ev) => isEventOnDay(ev, day));
            const dow = day.getDay(); // 0=일, 6=토

            return (
              <div
                key={day.toISOString()}
                style={{
                  borderRight: "1px solid #e5e7eb",
                  borderBottom: "1px solid #e5e7eb",
                  padding: 8,
                  overflow: "hidden",
                  background: inMonth ? "#fff" : "#f9fafb",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      background: sameDay(day, today) ? "#282d3a" : "transparent",
                      color: sameDay(day, today)
                        ? "#fff"
                        : dow === 0
                        ? "#dc2626"   // 일요일
                        : dow === 6
                        ? "#2563eb"   // 토요일
                        : "#111827",
                      opacity: inMonth ? 1 : 0.45,
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6}}>
                  {dayEvents.slice(0, 6).map((ev) => {
                    const faded = !eventTouchesMonth(ev, selectedMonth);
                    const { bg, fg } = getEventColors(ev);
                    const title = ev.summary ?? "(제목 없음)";

                    const openDetail = () => {
                      setSelectedEvent(ev);
                    };

                    return (
                      <div
                        key={`${ev.id}_${day.toDateString()}`}
                        title={title}
                        role="button"
                        tabIndex={0}
                        onClick={openDetail}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDetail();
                          }
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: bg,
                          color: fg,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          opacity: faded ? 0.35 : 1,
                          cursor: "pointer",
                        }}
                      >
                        {title}
                      </div>
                    );
                  })}

                  {dayEvents.length > 6 && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      +{dayEvents.length - 6}개 더보기
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
          <EventModal
            open={Boolean(selectedEvent)}
            event={selectedEvent}
            colors={colors}
            primaryCalColorId={primaryCalColorId}
            onClose={() => {
              setSelectedEvent(null);
            }}
            onDelete={handleDeleteEvent}   // ✅ 추가
          />
          <LogsModal
            open={isLogOpen}
            logs={logs}
            status={logsStatus}
            onClose={() => setIsLogOpen(false)}
            onClear={handleClearLogs}
          />

    </main>
  </div>

  );
}

function formatWhenBySchema(ev) {
  const s = ev?.start ?? null;
  const e = ev?.end ?? null;

  const sIsAllDay = Boolean(s?.date && !s?.dateTime);
  const eIsAllDay = Boolean(e?.date && !e?.dateTime);

  // date / dateTime 둘 다 없으면
  if (!s || !e || (!s.date && !s.dateTime) || (!e.date && !e.dateTime)) return "-";

  // 종일 이벤트(date 기반): end.date는 보통 "exclusive(다음날)"이므로 하루 빼서 표시
  if (sIsAllDay && eIsAllDay) {
    const startDate = new Date(`${s.date}T00:00:00`);
    const endExcl = new Date(`${e.date}T00:00:00`);
    const endIncl = new Date(endExcl);
    endIncl.setDate(endIncl.getDate() - 1);

    const sTxt = `${startDate.getFullYear()}-${pad2(startDate.getMonth() + 1)}-${pad2(startDate.getDate())}`;
    const eTxt = `${endIncl.getFullYear()}-${pad2(endIncl.getMonth() + 1)}-${pad2(endIncl.getDate())}`;

    const tz = s.timeZone ?? e.timeZone ?? null;
    const tzTxt = tz ? ` (${tz})` : "";

    return sTxt === eTxt ? `${sTxt} (종일)${tzTxt}` : `${sTxt} ~ ${eTxt} (종일)${tzTxt}`;
  }

  // 시간 이벤트(dateTime 기반)
  const start = new Date(s.dateTime ?? s.date);
  const end = new Date(e.dateTime ?? e.date);

  const sTxt = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())} ${pad2(
    start.getHours()
  )}:${pad2(start.getMinutes())}`;
  const eTxt = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())} ${pad2(
    end.getHours()
  )}:${pad2(end.getMinutes())}`;

  const tz = s.timeZone ?? e.timeZone ?? null;
  const tzTxt = tz ? ` (${tz})` : "";

  return `${sTxt} ~ ${eTxt}${tzTxt}`;
}


function getEventPalette(ev, colors, primaryCalColorId) {
  if (!colors) return { bg: "#e5e7eb", fg: "#111827" };

  const eventColorId = ev.colorId ?? null;
  const calColorId = primaryCalColorId ?? null;

  const palette =
    (eventColorId && colors.event?.[eventColorId]) ||
    (calColorId && colors.calendar?.[calColorId]) ||
    null;

  if (!palette) return { bg: "#e5e7eb", fg: "#111827" };
  return { bg: palette.background, fg: palette.foreground };
}

function EventModal({ open, event, colors, primaryCalColorId, onClose, onDelete }) {
  const [rawLog, setRawLog] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleClose = () => {
    setShowRaw(false);
    setRawLog(null);
    onClose();
  };

  async function loadRawFromDB() {
    // 1) logId가 있으면 그걸 우선 사용
    let logId = event?.__logId ?? null;

    // 2) 없으면 eventId로 DB에서 찾기
    if (!logId && event?.id) {
      const a = await fetch(`${API_BASE_URL}/analyze/logs/by-event/${event.id}`);
      if (a.ok) {
        const ad = await a.json();
        logId = ad?.log?.id ?? null;
      }
    }

    // 3) 그래도 없으면 "연결된 로그 없음"
    if (!logId) {
      setRawLog({ noLog: true, plan: null, imgUrl: null });
      return;
    }

    // 4) raw 로드
    const b = await fetch(`${API_BASE_URL}/analyze/logs/${logId}/raw`);
    if (!b.ok) {
      setRawLog({ noLog: true, plan: null, imgUrl: null });
      return;
    }

    const bd = await b.json();
    if (!bd?.success) {
      setRawLog({ noLog: true, plan: null, imgUrl: null });
      return;
    }

    const imgPath = bd.raw?.imagepath ?? null;
    const imgUrl = imgPath ? `${API_BASE_URL}/${imgPath.replace(/\\/g, "/")}` : null;

    setRawLog({ noLog: false, plan: bd.raw?.plan ?? null, imgUrl });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !event) return null;

  const title = event.summary ?? "(제목 없음)";
  const description = event.description ?? "-";
  const location = event.location ?? "-";
  const when = formatWhenBySchema(event);

  const { bg } = getEventPalette(event, colors, primaryCalColorId);

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: bg }} />
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
          </div>

          <button
            onClick={handleClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 8,
            }}
            aria-label="닫기"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7, fontWeight: 700 }}>summary</div>
            <div style={{ whiteSpace: "pre-wrap", fontWeight: 700 }}>{title}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7, fontWeight: 700 }}>description</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{description}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7, fontWeight: 700 }}>location</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{location}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7, fontWeight: 700 }}>when</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{when}</div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={async () => {
              if (showRaw) {
                setShowRaw(false);
                setRawLog(null);
                return;
              }
              setShowRaw(true);
              await loadRawFromDB();
            }}
            style={{
              border: "1px solid #e5e7eb",
              background: "transparent",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {showRaw ? "원본 데이터 닫기" : "원본 데이터 보기"}
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {onDelete(event)
                  setShowRaw(false);
                  setRawLog(null);}}
              style={{
                border: "1px solid #fecaca",
                background: "#fee2e2",
                color: "#991b1b",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              삭제
            </button>

            <button
              onClick={handleClose}
              style={{
                border: "1px solid #e5e7eb",
                background: "transparent",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* Raw */}
        {showRaw && (
          <div style={{ padding: 16, paddingTop: 0, display: "grid", gap: 12 }}>
            {rawLog?.noLog ? (
              <div style={{ opacity: 0.7, fontWeight: 600 }}>연결된 로그가 없습니다.</div>
            ) : (
              <>
                {rawLog?.imgUrl ? (
                  <img
                    src={rawLog.imgUrl}
                    alt="원본 이미지"
                    style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 8 }}
                  />
                ) : (
                  <div style={{ opacity: 0.7 }}>원본 이미지 없음</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function formatKST(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function LogsModal({ open, logs, status, onClose, onClear }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>이벤트 로그</div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 8,
            }}
            aria-label="닫기"
            title="닫기"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          {status ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{status}</div>
          ) : null}

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 220px",
                gap: 0,
                padding: "10px 12px",
                fontWeight: 800,
                background: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div>제목</div>
              <div>추가 시간</div>
            </div>

            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {(logs ?? []).map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 220px",
                    padding: "10px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    fontSize: 13,
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.summary ?? "-"}
                  </div>
                  <div style={{ whiteSpace: "nowrap" }}>{formatKST(row.created_at)}</div>
                </div>
              ))}

              {(!logs || logs.length === 0) && !status && (
                <div style={{ padding: 12, opacity: 0.7 }}>로그가 없습니다.</div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={onClear}
            disabled={!logs || logs.length === 0}
            style={{
              border: "1px solid #fecaca",
              background: (!logs || logs.length === 0) ? "#f9fafb" : "#fee2e2",
              color: (!logs || logs.length === 0) ? "#9ca3af" : "#991b1b",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: (!logs || logs.length === 0) ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            로그 삭제
          </button>

          <button
            onClick={onClose}
            style={{
              border: "1px solid #e5e7eb",
              background: "transparent",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
