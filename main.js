"use strict";

/*
 * QUIZSPRINT
 * Three-file browser demo.
 *
 * Demo accounts and progress are stored in localStorage.
 * This is NOT a shared online database.
 *
 * Back4App connection settings are intentionally not faked.
 * Configure a real Parse application before enabling online accounts.
 */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "quizsprint_demo_v1";
const SESSION_KEY = "quizsprint_session_v1";

let users = [];
let quizzes = [];
let classes = [];
let attempts = [];
let currentUser = null;
let isSignup = false;
let currentQuiz = null;
let quizStartedAt = 0;
let questionCount = 0;
let toastTimeout;

const translations = {
  en: {
    home: "🏠 Home", study: "📚 Study", quizzes: "📝 Quizzes",
    classes: "🏫 Classes", leaderboard: "🏆 Leaderboard",
    profile: "👤 Profile", teacher: "👩‍🏫 Teacher Center",
    logout: "Log out", login: "Log in",
    signup: "Create account", explore: "Explore quizzes →",
    ready: "Ready to sprint? ⚡", search: "Search quizzes...",
    empty: "Nothing here yet. Check back soon!",
    points: "SprintPoints", time: "Time learned",
    streak: "Daily streak", classCount: "Classes"
  },
  vi: {
    home: "🏠 Trang chủ", study: "📚 Học tập", quizzes: "📝 Bài kiểm tra",
    classes: "🏫 Lớp học", leaderboard: "🏆 Bảng xếp hạng",
    profile: "👤 Hồ sơ", teacher: "👩‍🏫 Trung tâm giáo viên",
    logout: "Đăng xuất", login: "Đăng nhập",
    signup: "Tạo tài khoản", explore: "Khám phá bài kiểm tra →",
    ready: "Sẵn sàng bứt phá? ⚡", search: "Tìm bài kiểm tra...",
    empty: "Chưa có nội dung. Hãy quay lại sau!",
    points: "SprintPoints", time: "Thời gian học",
    streak: "Chuỗi ngày học", classCount: "Lớp học"
  }
};

let language = localStorage.getItem("qs_language") || "en";

function makeId(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 3200);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      users, quizzes, classes, attempts
    }));
  } catch (error) {
    console.error(error);
    notify("Could not save data. Browser storage may be full.");
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    users = Array.isArray(saved.users) ? saved.users : [];
    quizzes = Array.isArray(saved.quizzes) ? saved.quizzes : [];
    classes = Array.isArray(saved.classes) ? saved.classes : [];
    attempts = Array.isArray(saved.attempts) ? saved.attempts : [];
  } catch (error) {
    console.error("Could not read saved data:", error);
    users = [];
    quizzes = [];
    classes = [];
    attempts = [];
  }
}

function restoreSession() {
  const id = sessionStorage.getItem(SESSION_KEY);
  currentUser = users.find((user) => user.id === id) || null;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function previousDay(dateString) {
  const date = new Date(dateString);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function ensureUserFields(user) {
  if (!Array.isArray(user.joinedClasses)) user.joinedClasses = [];
  if (!Number.isFinite(user.points)) user.points = 0;
  if (!Number.isFinite(user.totalSeconds)) user.totalSeconds = 0;
  if (!Number.isFinite(user.streak)) user.streak = 0;
  if (!Number.isFinite(user.bestStreak)) user.bestStreak = 0;
  if (!Number.isFinite(user.completedQuizzes)) user.completedQuizzes = 0;
  if (!user.createdAt) user.createdAt = new Date().toISOString();
  if (!Array.isArray(user.badges)) user.badges = [];
  return user;
}

function updateDailyStreak(user) {
  const date = today();
  if (user.lastActiveDate === date) return;

  if (user.lastActiveDate === previousDay(date)) {
    user.streak = (user.streak || 0) + 1;
  } else {
    user.streak = 1;
  }

  user.bestStreak = Math.max(user.bestStreak || 0, user.streak);
  user.lastActiveDate = date;
}

function checkAchievements(user) {
  const achievements = [
    { id: "first", title: "First Sprint", emoji: "🚀", test: () => user.completedQuizzes >= 1 },
    { id: "points200", title: "200 Points", emoji: "⚡", test: () => user.points >= 200 },
    { id: "points1000", title: "1000 Points", emoji: "💎", test: () => user.points >= 1000 },
    { id: "quizzes10", title: "Quiz Explorer", emoji: "📚", test: () => user.completedQuizzes >= 10 },
    { id: "streak7", title: "7-Day Streak", emoji: "🔥", test: () => user.bestStreak >= 7 },
    { id: "hours", title: "Learning Hour", emoji: "⏱️", test: () => user.totalSeconds >= 3600 }
  ];

  achievements.forEach((achievement) => {
    if (achievement.test() && !user.badges.includes(achievement.id)) {
      user.badges.push(achievement.id);
      notify(`Achievement unlocked: ${achievement.emoji} ${achievement.title}!`);
    }
  });
}

function seedData() {
  if (quizzes.length) return;

  const starter = [
    {
      title: "Lớp 4: Toán — Phép tính",
      subject: "Math", grade: "4",
      description: "Practice basic arithmetic.",
      questions: [
        { text: "125 + 275 = ?", options: ["300", "400", "500", "350"], correct: 1 },
        { text: "8 × 7 = ?", options: ["54", "48", "56", "64"], correct: 2 },
        { text: "900 − 365 = ?", options: ["545", "535", "525", "635"], correct: 1 }
      ]
    },
    {
      title: "Lớp 4: Tiếng Việt — Từ ngữ",
      subject: "Vietnamese", grade: "4",
      description: "Practice Vietnamese vocabulary.",
      questions: [
        { text: "Từ nào là danh từ?", options: ["Chạy", "Xanh", "Học sinh", "Nhanh"], correct: 2 },
        { text: "Từ trái nghĩa với 'chăm chỉ' là gì?", options: ["Siêng năng", "Lười biếng", "Cần cù", "Tốt bụng"], correct: 1 }
      ]
    },
    {
      title: "Lớp 4: Khoa học",
      subject: "Science", grade: "4",
      description: "Explore basic science concepts.",
      questions: [
        { text: "Which is a source of light?", options: ["A rock", "The Sun", "A book", "A chair"], correct: 1 },
        { text: "Plants generally need what to grow?", options: ["Light and water", "Plastic", "Darkness only", "Metal"], correct: 0 }
      ]
    },
    {
      title: "Lớp 4: Lịch sử và Địa lí",
      subject: "History", grade: "4",
      description: "Explore history and geography.",
      questions: [
        { text: "What does a map help us do?", options: ["Locate places", "Cook food", "Measure sound", "Grow plants"], correct: 0 },
        { text: "Which is a natural feature?", options: ["A river", "A classroom", "A notebook", "A pencil"], correct: 0 }
      ]
    },
    {
      title: "English Vocabulary",
      subject: "English", grade: "4",
      description: "Build your English vocabulary.",
      questions: [
        { text: "What is the plural of 'child'?", options: ["Childs", "Children", "Childes", "Childrens"], correct: 1 },
        { text: "Choose the correct sentence.", options: ["She are happy.", "She is happy.", "She be happy.", "She am happy."], correct: 1 }
      ]
    },
    {
      title: "Programming Basics",
      subject: "Programming", grade: "all",
      description: "Try some beginner programming questions.",
      questions: [
        { text: "What does HTML mainly describe?", options: ["Web page structure", "Computer hardware", "Internet speed", "Battery level"], correct: 0 },
        { text: "Which is a JavaScript variable declaration?", options: ["let score = 5;", "make score 5", "variable: score", "score becomes"], correct: 0 }
      ]
    }
  ];

  quizzes = starter.map((quiz) => ({
    ...quiz,
    id: makeId("quiz"),
    ownerId: "system",
    published: true,
    assignedClassId: "",
    createdAt: new Date().toISOString()
  }));

  save();
}

function userById(id) {
  return users.find((user) => user.id === id);
}

function classById(id) {
  return classes.find((item) => item.id === id);
}

function isTeacher() {
  return currentUser?.role === "teacher";
}

function getUserClasses(user = currentUser) {
  if (!user) return [];
  if (user.role === "teacher") {
    return classes.filter((item) => item.teacherId === user.id);
  }
  return classes.filter((item) => (user.joinedClasses || []).includes(item.id));
}

function canSeeQuiz(quiz) {
  if (!quiz.published) return false;
  if (quiz.ownerId === "system" || quiz.ownerId === currentUser?.id) return true;
  if (!quiz.assignedClassId) return true;

  const klass = classById(quiz.assignedClassId);
  if (!klass) return false;

  if (currentUser?.role === "teacher") return klass.teacherId === currentUser.id;
  return (currentUser?.joinedClasses || []).includes(klass.id);
}

function quizIcon(subject) {
  return ({
    Math: "🔢", Vietnamese: "📖", Science: "🔬",
    History: "🌏", English: "🔤", Programming: "💻"
  })[subject] || "📝";
}

function renderQuizCard(quiz) {
  const count = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  return `
    <article class="quiz-card">
      <div class="quiz-icon">${quizIcon(quiz.subject)}</div>
      <span class="tag">${escapeHTML(quiz.subject)}</span>
      <h3>${escapeHTML(quiz.title)}</h3>
      <p class="muted small">${escapeHTML(quiz.description || "Ready for a new challenge?")}</p>
      <div class="quiz-meta">
        <span>🎯 ${count} questions</span>
        <span>🎓 Grade ${escapeHTML(quiz.grade || "all")}</span>
      </div>
      <button class="btn primary" data-take-quiz="${escapeHTML(quiz.id)}">Start quiz →</button>
    </article>`;
}

function showPage(page) {
  if (!currentUser) {
    $("#authPage").classList.remove("hidden");
    $("#app").classList.add("hidden");
    return;
  }

  if (page === "teacher" && !isTeacher()) page = "home";

  $("#authPage").classList.add("hidden");
  $("#app").classList.remove("hidden");

  $$(".page").forEach((section) => section.classList.add("hidden"));
  const target = $(`#page-${page}`);
  if (target) target.classList.remove("hidden");

  $$(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  renderPage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderPage(page) {
  switch (page) {
    case "home": renderHome(); break;
    case "study": renderStudy(); break;
    case "quizzes": renderQuizzes(); break;
    case "classes": renderClasses(); break;
    case "leaderboard": renderLeaderboard(); break;
    case "profile": renderProfile(); break;
    case "teacher": renderTeacher(); break;
  }
}

function renderHome() {
  $("#welcomeTitle").textContent = `${language === "vi" ? "Sẵn sàng bứt phá?" : "Ready to sprint?"} ⚡`;
  $("#statPoints").textContent = currentUser.points;
  $("#statStreak").textContent = `${currentUser.streak} ${language === "vi" ? "ngày" : "days"}`;
  $("#statTime").textContent = formatTime(currentUser.totalSeconds);
  $("#statClasses").textContent = getUserClasses().length;

  const visible = quizzes.filter(canSeeQuiz).slice(0, 3);
  $("#homeQuizzes").innerHTML = visible.length
    ? visible.map(renderQuizCard).join("")
    : `<div class="empty">No quizzes available yet.</div>`;

  renderAchievements("#homeAchievements");
}

function formatTime(seconds) {
  const minutes = Math.floor((seconds || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}

function renderAchievements(selector) {
  const all = [
    { id: "first", title: "First Sprint", emoji: "🚀" },
    { id: "points200", title: "200 Points", emoji: "⚡" },
    { id: "points1000", title: "1000 Points", emoji: "💎" },
    { id: "quizzes10", title: "Quiz Explorer", emoji: "📚" },
    { id: "streak7", title: "7-Day Streak", emoji: "🔥" },
    { id: "hours", title: "Learning Hour", emoji: "⏱️" }
  ];

  $(selector).innerHTML = all.map((item) => {
    const earned = currentUser.badges.includes(item.id);
    return `<article class="achievement ${earned ? "" : "locked"}">
      <div class="emoji">${item.emoji}</div>
      <strong>${escapeHTML(item.title)}</strong>
      <p class="muted small">${earned ? "Unlocked!" : "Not yet earned"}</p>
    </article>`;
  }).join("");
}

function renderQuizzes() {
  const search = ($("#quizSearch").value || "").toLowerCase().trim();
  const subject = $("#quizSubjectFilter").value;

  const filtered = quizzes.filter(canSeeQuiz).filter((quiz) => {
    const matchesSearch = `${quiz.title} ${quiz.description || ""}`.toLowerCase().includes(search);
    return matchesSearch && (subject === "all" || quiz.subject === subject);
  });

  $("#quizList").innerHTML = filtered.length
    ? filtered.map(renderQuizCard).join("")
    : `<div class="empty">No matching quizzes found.</div>`;
}

function renderStudy() {
  const grade = $("#studyGrade").value || "4";
  const subject = $("#studySubject").value;

  const filtered = quizzes.filter(canSeeQuiz).filter((quiz) => {
    const gradeMatches = quiz.grade === grade || quiz.grade === "all";
    const subjectMatches = subject === "all" || quiz.subject === subject;
    return gradeMatches && subjectMatches;
  });

  $("#studyContent").innerHTML = filtered.length
    ? filtered.map(renderQuizCard).join("")
    : `<div class="empty">No starter activities for this selection yet. Teachers can create quizzes in Teacher Center.</div>`;
}

function renderClasses() {
  const mine = getUserClasses();

  $("#classList").innerHTML = mine.length ? mine.map((klass) => {
    const teacher = userById(klass.teacherId);
    const memberCount = klass.memberIds.length;
    const assigned = quizzes.filter((quiz) => quiz.assignedClassId === klass.id).length;

    return `<div class="row-item">
      <div>
        <strong>${escapeHTML(klass.name)}</strong>
        <p class="muted small">Teacher: ${escapeHTML(teacher?.username || "Teacher")} · ${memberCount} students · ${assigned} quizzes</p>
        ${isTeacher() ? `<p class="small">Join code: <strong>${escapeHTML(klass.code)}</strong></p>` : ""}
      </div>
      ${isTeacher() ? `<button class="btn secondary" data-view-class="${escapeHTML(klass.id)}">Manage</button>` : ""}
    </div>`;
  }).join("") : `<div class="empty">No classes yet. Join a class using a code, or ask a teacher to enroll you.</div>`;

  $("#createClassForm").classList.toggle("hidden", !isTeacher());
  $("#joinClassForm").classList.toggle("hidden", isTeacher());
}

function renderLeaderboard() {
  const students = users.filter((user) => user.role === "student")
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  $("#leaderboardList").innerHTML = students.length ? students.map((user, index) => `
    <div class="row-item">
      <div class="user-row">
        <div class="rank">${index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}</div>
        <div class="avatar">${escapeHTML(user.username.slice(0, 1).toUpperCase())}</div>
        <div><strong>${escapeHTML(user.username)} ${user.id === currentUser.id ? "(You)" : ""}</strong>
        <p class="muted small">Level ${Math.floor(user.points / 100) + 1} · ${user.completedQuizzes} quizzes completed</p></div>
      </div>
      <strong>${user.points} pts</strong>
    </div>`).join("") : `<div class="empty">No students on the leaderboard yet.</div>`;
}

function renderProfile() {
  $("#profileContent").innerHTML = `
    <div class="user-row">
      <div class="avatar">${escapeHTML(currentUser.username.slice(0, 1).toUpperCase())}</div>
      <div><h2>${escapeHTML(currentUser.username)}</h2>
      <p class="muted">${currentUser.role === "teacher" ? "Teacher account" : "Student account"}</p></div>
    </div>
    <hr style="border:0;border-top:1px solid var(--border);margin:20px 0">
    <div class="stats-grid">
      <article class="stat-card"><span>SprintPoints</span><strong>${currentUser.points}</strong></article>
      <article class="stat-card"><span>Level</span><strong>${Math.floor(currentUser.points / 100) + 1}</strong></article>
      <article class="stat-card"><span>Quizzes completed</span><strong>${currentUser.completedQuizzes}</strong></article>
      <article class="stat-card"><span>Achievements</span><strong>${currentUser.badges.length}</strong></article>
    </div>
    <p style="margin-top:20px">⏱️ Time learned: <strong>${formatTime(currentUser.totalSeconds)}</strong></p>
    <p>🔥 Current streak: <strong>${currentUser.streak} days</strong></p>
    <p>🏅 Best streak: <strong>${currentUser.bestStreak} days</strong></p>
    <p>🏫 Classes: <strong>${getUserClasses().length}</strong></p>
    <p class="muted small">Demo accounts are stored in this browser. Do not use a real password here.</p>`;
}

function renderTeacher() {
  if (!isTeacher()) return;

  const ownClasses = classes.filter((item) => item.teacherId === currentUser.id);
  $("#assignClass").innerHTML = `<option value="">No class assignment</option>` +
    ownClasses.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("");

  $("#teacherClassList").innerHTML = ownClasses.length ? ownClasses.map((klass) => {
    const members = klass.memberIds.map(userById).filter(Boolean);
    return `<div class="row-item">
      <div><strong>${escapeHTML(klass.name)}</strong>
      <p class="muted small">Code: ${escapeHTML(klass.code)} · ${members.length} students</p>
      <p class="small">${members.length ? members.map((member) => escapeHTML(member.username)).join(", ") : "No students enrolled yet"}</p></div>
      <button class="btn secondary" data-view-class="${escapeHTML(klass.id)}">View class</button>
    </div>`;
  }).join("") : `<div class="empty">Create a class from the Classes page first.</div>`;

  const ownQuizIds = quizzes.filter((quiz) => quiz.ownerId === currentUser.id).map((quiz) => quiz.id);
  const ownAttempts = attempts.filter((attempt) => ownQuizIds.includes(attempt.quizId));

  $("#teacherScores").innerHTML = ownAttempts.length ? ownAttempts.map((attempt) => {
    const student = userById(attempt.userId);
    const quiz = quizzes.find((item) => item.id === attempt.quizId);
    return `<div class="row-item">
      <div><strong>${escapeHTML(student?.username || "Former student")}</strong>
      <p class="muted small">${escapeHTML(quiz?.title || "Quiz")} · ${new Date(attempt.date).toLocaleString()}</p></div>
      <strong>${attempt.score}/${attempt.total}</strong>
    </div>`;
  }).join("") : `<div class="empty">Scores for your quizzes will appear here.</div>`;
}

function addQuestionEditor(question = {}) {
  questionCount++;
  const index = questionCount;
  const div = document.createElement("div");
  div.className = "question-item";
  div.dataset.questionIndex = String(index);

  div.innerHTML = `
    <h3>Question ${index}</h3>
    <label>Question text<textarea class="q-text" required maxlength="500">${escapeHTML(question.text || "")}</textarea></label>
    <div class="option-fields">
      <label>Option A<input class="q-option" required maxlength="200" value="${escapeHTML(question.options?.[0] || "")}"></label>
      <label>Option B<input class="q-option" required maxlength="200" value="${escapeHTML(question.options?.[1] || "")}"></label>
      <label>Option C<input class="q-option" required maxlength="200" value="${escapeHTML(question.options?.[2] || "")}"></label>
      <label>Option D<input class="q-option" required maxlength="200" value="${escapeHTML(question.options?.[3] || "")}"></label>
    </div>
    <label>Correct answer
      <select class="q-correct">
        <option value="0">A</option><option value="1">B</option>
        <option value="2">C</option><option value="3">D</option>
      </select>
    </label>
    <button type="button" class="btn secondary remove-question">Remove question</button>`;

  div.querySelector(".q-correct").value = String(question.correct ?? 0);
  div.querySelector(".remove-question").addEventListener("click", () => {
    div.remove();
    renumberQuestionEditors();
  });

  $("#questionBuilder").appendChild(div);
  renumberQuestionEditors();
}

function renumberQuestionEditors() {
  $$("#questionBuilder .question-item").forEach((item, index) => {
    item.querySelector("h3").textContent = `Question ${index + 1}`;
  });
}

function getQuestionsFromForm() {
  const items = $$("#questionBuilder .question-item");
  if (!items.length) throw new Error("Add at least one question.");

  return items.map((item) => {
    const text = item.querySelector(".q-text").value.trim();
    const options = [...item.querySelectorAll(".q-option")].map((input) => input.value.trim());
    const correct = Number(item.querySelector(".q-correct").value);

    if (!text || options.some((option) => !option)) {
      throw new Error("Complete every question and all four answer options.");
    }
    return { text, options, correct };
  });
}

function createClass(name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a class name.");

  let code;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (classes.some((klass) => klass.code === code));

  const klass = {
    id: makeId("class"),
    name: cleanName,
    code,
    teacherId: currentUser.id,
    memberIds: [],
    createdAt: new Date().toISOString()
  };

  classes.push(klass);
  save();
  return klass;
}

function joinClass(code) {
  const klass = classes.find((item) => item.code.toUpperCase() === code.trim().toUpperCase());
  if (!klass) throw new Error("Class code not found.");

  if (klass.teacherId === currentUser.id) {
    throw new Error("You cannot join your own class as a student.");
  }
  if (currentUser.role !== "student") {
    throw new Error("Only student accounts can join classes.");
  }

  if (!currentUser.joinedClasses.includes(klass.id)) {
    currentUser.joinedClasses.push(klass.id);
    if (!klass.memberIds.includes(currentUser.id)) klass.memberIds.push(currentUser.id);
    save();
  }
  return klass;
}

function showClassDetails(classId) {
  const klass = classById(classId);
  if (!klass || klass.teacherId !== currentUser.id || !isTeacher()) {
    notify("You do not have permission to manage this class.");
    return;
  }

  const members = klass.memberIds.map(userById).filter(Boolean);
  const assignedQuizzes = quizzes.filter((quiz) => quiz.assignedClassId === klass.id);

  const details = [
    `Class: ${klass.name}`,
    `Join code: ${klass.code}`,
    `Students: ${members.map((user) => user.username).join(", ") || "None"}`,
    `Assigned quizzes: ${assignedQuizzes.map((quiz) => quiz.title).join(", ") || "None"}`,
    "",
    "To assign a quiz, choose this class in the quiz creation form."
  ].join("\n");

  alert(details);
}

function startQuiz(quizId) {
  const quiz = quizzes.find((item) => item.id === quizId && canSeeQuiz(item));
  if (!quiz || !quiz.questions?.length) {
    notify("This quiz is unavailable.");
    return;
  }

  currentQuiz = quiz;
  quizStartedAt = Date.now();

  $("#takeQuizContent").innerHTML = `
    <h1>${quizIcon(quiz.subject)} ${escapeHTML(quiz.title)}</h1>
    <p class="muted">${quiz.questions.length} questions · Earn up to ${quiz.questions.length * 10} SprintPoints</p>
    <form id="takeQuizForm">
      ${quiz.questions.map((question, index) => `
        <div class="quiz-question">
          <h3>${index + 1}. ${escapeHTML(question.text)}</h3>
          ${question.options.map((option, optionIndex) => `
            <label class="answer-option">
              <input type="radio" name="answer-${index}" value="${optionIndex}" required>
              <span>${String.fromCharCode(65 + optionIndex)}. ${escapeHTML(option)}</span>
            </label>`).join("")}
        </div>`).join("")}
      <button class="btn primary full" type="submit">Submit answers</button>
    </form>`;

  showPage("take-quiz");

  $("#takeQuizForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuiz();
  });
}

function submitQuiz() {
  if (!currentQuiz) return;

  const form = $("#takeQuizForm");
  if (!form.reportValidity()) return;

  const elapsed = Math.max(10, Math.round((Date.now() - quizStartedAt) / 1000));
  const formData = new FormData(form);
  let correctCount = 0;

  currentQuiz.questions.forEach((question, index) => {
    if (Number(formData.get(`answer-${index}`)) === question.correct) correctCount++;
  });

  const total = currentQuiz.questions.length;
  const pointsEarned = correctCount * 10;
  const percentage = Math.round((correctCount / total) * 100);

  currentUser.points += pointsEarned;
  currentUser.totalSeconds += elapsed;
  currentUser.completedQuizzes++;
  updateDailyStreak(currentUser);
  checkAchievements(currentUser);

  attempts.push({
    id: makeId("attempt"),
    userId: currentUser.id,
    quizId: currentQuiz.id,
    score: correctCount,
    total,
    pointsEarned,
    seconds: elapsed,
    date: new Date().toISOString()
  });

  save();

  $("#takeQuizContent").innerHTML = `
    <div class="result">
      <div style="font-size:3rem">${percentage >= 70 ? "🎉" : "💪"}</div>
      <h1>${percentage >= 70 ? "Great work!" : "Keep practicing!"}</h1>
      <p>You completed <strong>${escapeHTML(currentQuiz.title)}</strong>.</p>
      <strong>${correctCount}/${total}</strong>
      <p>${percentage}% correct</p>
      <p>⚡ You earned <strong>${pointsEarned} SprintPoints</strong>.</p>
      <p>⏱️ Learning time: ${formatTime(elapsed)}</p>
      <button class="btn primary" data-page="quizzes">Back to quizzes</button>
      <button class="btn secondary" data-page="home">View dashboard</button>
    </div>
    <div class="panel" style="margin-top:20px">
      <h2>Review your answers</h2>
      ${currentQuiz.questions.map((question, index) => {
        const selected = Number(new FormData(form).get(`answer-${index}`));
        return `<div class="quiz-question">
          <h3>${index + 1}. ${escapeHTML(question.text)}</h3>
          <p>Your answer: ${escapeHTML(question.options[selected])}</p>
          <p>Correct answer: <strong>${escapeHTML(question.options[question.correct])}</strong></p>
          <span>${selected === question.correct ? "✅ Correct" : "📖 Review this question"}</span>
        </div>`;
      }).join("")}
    </div>`;

  currentQuiz = null;
  refreshUserDisplay();
  notify(`Quiz complete! +${pointsEarned} SprintPoints`);
}

function refreshUserDisplay() {
  $("#userDisplay").textContent = currentUser ? currentUser.username : "Guest";
  $("#logoutButton").classList.toggle("hidden", !currentUser);
  $$(".teacher-only").forEach((element) => {
    element.classList.toggle("hidden", !isTeacher());
  });
}

function enterApp() {
  refreshUserDisplay();
  $("#authPage").classList.add("hidden");
  $("#app").classList.remove("hidden");
  showPage("home");
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  refreshUserDisplay();
  $("#app").classList.add("hidden");
  $("#authPage").classList.remove("hidden");
  $("#authPassword").value = "";
  showAuthMode(false);
}

function showAuthMode(signup) {
  isSignup = signup;
  $("#loginTab").classList.toggle("active", !signup);
  $("#signupTab").classList.toggle("active", signup);
  $("#roleLabel").classList.toggle("hidden", !signup);
  $("#authSubmit").textContent = signup ? "Create account" : "Log in";
  $("#authTitle").textContent = signup ? "Create your account" : "Welcome to QuizSprint!";
  $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  $("#authMessage").textContent = "";
}

async function handleAuth(event) {
  event.preventDefault();

  const username = $("#authUsername").value.trim();
  const password = $("#authPassword").value;
  const role = $("#authRole").value;

  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
    notify("Username must be 3–24 characters using letters, numbers, _ . or -.");
    return;
  }

  if (password.length < 6) {
    notify("Password must be at least 6 characters.");
    return;
  }

  /*
   * Demo-only authentication. Passwords are stored as plain text
   * in localStorage, so NEVER use real passwords in demo mode.
   * Use Back4App Parse.User authentication for real accounts.
   */
  if (isSignup) {
    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      notify("That username already exists in this browser.");
      return;
    }

    const user = ensureUserFields({
      id: makeId("user"),
      username,
      password,
      role,
      points: 0,
      totalSeconds: 0,
      streak: 0,
      bestStreak: 0,
      completedQuizzes: 0,
      joinedClasses: [],
      badges: [],
      createdAt: new Date().toISOString()
    });

    users.push(user);
    currentUser = user;
    updateDailyStreak(user);
  } else {
    const user = users.find((item) =>
      item.username.toLowerCase() === username.toLowerCase() &&
      item.password === password
    );

    if (!user) {
      notify("Incorrect username or password.");
      return;
    }
    currentUser = ensureUserFields(user);
    updateDailyStreak(currentUser);
  }

  sessionStorage.setItem(SESSION_KEY, currentUser.id);
  save();
  enterApp();
  notify(`Welcome, ${currentUser.username}!`);
}

function applyLanguage() {
  const t = translations[language];
  $("#languageButton").textContent = language === "en" ? "🌐 EN" : "🌐 VI";
  $("#logoutButton").textContent = t.logout;

  $$("[data-page]").forEach((button) => {
    const key = button.dataset.page;
    if (t[key]) button.textContent = t[key];
  });

  $("#quizSearch").placeholder = t.search;
  if (currentUser) renderPage($(".page:not(.hidden)")?.id.replace("page-", "") || "home");
}

function init() {
  load();
  seedData();

  for (let grade = 1; grade <= 12; grade++) {
    const option = document.createElement("option");
    option.value = String(grade);
    option.textContent = `Grade ${grade} / Lớp ${grade}`;
    option.selected = grade === 4;
    $("#studyGrade").appendChild(option);
  }

  $("#loginTab").addEventListener("click", () => showAuthMode(false));
  $("#signupTab").addEventListener("click", () => showAuthMode(true));
  $("#authForm").addEventListener("submit", handleAuth);
  $("#logoutButton").addEventListener("click", logout);

  $("#themeButton").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("qs_theme", document.body.classList.contains("dark") ? "dark" : "light");
    $("#themeButton").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
  });

  $("#languageButton").addEventListener("click", () => {
    language = language === "en" ? "vi" : "en";
    localStorage.setItem("qs_language", language);
    applyLanguage();
  });

  $("#quizSearch").addEventListener("input", renderQuizzes);
  $("#quizSubjectFilter").addEventListener("change", renderQuizzes);
  $("#studyGrade").addEventListener("change", renderStudy);
  $("#studySubject").addEventListener("change", renderStudy);

  $("#createClassForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isTeacher()) return notify("Teacher access required.");
    try {
      const klass = createClass($("#newClassName").value);
      $("#newClassName").value = "";
      renderClasses();
      notify(`Class created! Join code: ${klass.code}`);
    } catch (error) {
      notify(error.message);
    }
  });

  $("#joinClassForm").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const klass = joinClass($("#joinCode").value);
      $("#joinCode").value = "";
      renderClasses();
      notify(`You joined ${klass.name}!`);
    } catch (error) {
      notify(error.message);
    }
  });

  $("#addQuestionButton").addEventListener("click", () => addQuestionEditor());

  $("#createQuizForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isTeacher()) return notify("Teacher access required.");

    try {
      const title = $("#newQuizTitle").value.trim();
      const subject = $("#newQuizSubject").value;
      const grade = $("#newQuizGrade").value;
      const assignedClassId = $("#assignClass").value;
      const questions = getQuestionsFromForm();

      if (!title) throw new Error("Enter a quiz title.");

      if (assignedClassId) {
        const klass = classById(assignedClassId);
        if (!klass || klass.teacherId !== currentUser.id) {
          throw new Error("Choose a class you manage.");
        }
      }

      quizzes.push({
        id: makeId("quiz"),
        title,
        subject,
        grade,
        description: `Created by ${currentUser.username}`,
        questions,
        ownerId: currentUser.id,
        assignedClassId,
        published: true,
        createdAt: new Date().toISOString()
      });

      save();
      $("#createQuizForm").reset();
      $("#questionBuilder").innerHTML = "";
      addQuestionEditor();
      notify("Quiz published successfully!");
      showPage("quizzes");
    } catch (error) {
      notify(error.message || "Could not create the quiz.");
    }
  });

  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      showPage(pageButton.dataset.page);
      return;
    }

    const quizButton = event.target.closest("[data-take-quiz]");
    if (quizButton) {
      startQuiz(quizButton.dataset.takeQuiz);
      return;
    }

    const classButton = event.target.closest("[data-view-class]");
    if (classButton) showClassDetails(classButton.dataset.viewClass);
  });

  const savedTheme = localStorage.getItem("qs_theme");
  if (savedTheme === "dark") document.body.classList.add("dark");
  $("#themeButton").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";

  restoreSession();
  if (currentUser) {
    ensureUserFields(currentUser);
    updateDailyStreak(currentUser);
    save();
    enterApp();
  } else {
    refreshUserDisplay();
    showAuthMode(false);
  }

  $("#connectionStatus").textContent = "Demo mode";
  applyLanguage();
}

document.addEventListener("DOMContentLoaded", init);
