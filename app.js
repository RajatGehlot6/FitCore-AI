// FitCore AI — Main JavaScript

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyC1yQ4z14qSZW_3GbstfcdNLhKpubh7ypM",
  authDomain: "fit-core-ai.firebaseapp.com",
  databaseURL: "https://fit-core-ai-default-rtdb.firebaseio.com",
  projectId: "fit-core-ai",
  storageBucket: "fit-core-ai.firebasestorage.app",
  messagingSenderId: "925051808853",
  appId: "1:925051808853:web:1b2c26ca6c2f946d3c38dc"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// --- DATABASE & CONFIG ---
const EXERCISE_DB = {
  chest: ["Bench Press", "Incline Dumbbell Press", "Push-ups", "Cable Crossovers", "Chest Flyes", "Dips"],
  back: ["Pull-ups", "Lat Pulldown", "Barbell Row", "Deadlift", "Seated Cable Row", "Face Pulls"],
  shoulders: ["Overhead Press", "Lateral Raises", "Front Raises", "Reverse Pec Deck", "Arnold Press", "Upright Row"],
  biceps: ["Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Cable Curl"],
  triceps: ["Tricep Pushdown", "Skullcrushers", "Overhead Extension", "Close-Grip Bench", "Kickbacks"],
  legs: ["Squats", "Leg Press", "Lunges", "Leg Extension", "Leg Curl", "Calf Raises", "Romanian Deadlift"],
  core: ["Crunches", "Plank", "Leg Raises", "Russian Twists", "Ab Wheel Rollout", "Cable Crunches"],
  cardio: ["Treadmill Running", "Cycling", "Rowing Machine", "Jump Rope", "Stairmaster", "Elliptical"]
};

const MUSCLE_EMOJIS = { chest: "🦍", back: "🦅", shoulders: "🥥", biceps: "💪", triceps: "🦾", legs: "🦵", core: "🍫", cardio: "🏃" };

// --- STATE MANAGEMENT ---
let state = {
  profile: null,
  goals: null,
  dailyLogs: {},
  settings: { reminders: true }
};

// Current view state
let currentView = {
  page: 'dashboard',
  selectedMuscle: null,
  selectedExercise: null
};

// Load/Save using Firestore
async function saveState() {
  if (currentUser) {
    try {
      await db.collection('users').doc(currentUser.uid).set(state);
    } catch(e) { console.error("Error saving to cloud:", e); }
  }
}
async function loadState() {
  if (currentUser) {
    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      if (doc.exists) {
        state = doc.data();
        return true;
      }
    } catch(e) {
      console.error("Error loading from cloud (might be Firestore Rules):", e);
    }
  }
  return false;
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getTodayLog() {
  const key = getTodayKey();
  if (!state.dailyLogs[key]) {
    state.dailyLogs[key] = {
      checkedIn: false,
      weight: state.profile ? state.profile.weight : 0,
      water: 0,
      caloriesIn: 0,
      macros: { protein: 0, carbs: 0, fat: 0 },
      meals: [],
      workout: { plannedMuscles: [], exercises: [] }
    };
    saveState();
  }
  return state.dailyLogs[key];
}

// --- AI CALCULATIONS ---
function calculateAI() {
  if (!state.profile) return;
  const p = state.profile;
  
  // BMR (Mifflin-St Jeor)
  let bmr = (10 * p.weight) + (6.25 * p.height) - (5 * p.age);
  bmr += (p.gender === 'male') ? 5 : -161;
  
  // TDEE Multipliers
  const activityMult = { 'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55, 'active': 1.725, 'extreme': 1.9 };
  let tdee = bmr * (activityMult[p.activityLevel] || 1.2);
  
  // Goals Calculation
  let calGoal = tdee;
  if (p.goal === 'lose') calGoal -= 500;
  if (p.goal === 'gain') calGoal += 300;
  
  let proteinGoal = p.weight * 2; // 2g per kg
  let fatGoal = p.weight * 0.8; // 0.8g per kg
  let carbsGoal = (calGoal - (proteinGoal * 4) - (fatGoal * 9)) / 4;
  
  let waterGoal = p.weight * 35; // 35ml per kg
  
  state.goals = {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calGoal),
    protein: Math.round(proteinGoal),
    carbs: Math.max(0, Math.round(carbsGoal)),
    fat: Math.round(fatGoal),
    water: Math.round(waterGoal)
  };
  saveState();
}

function getBMI(w, h) { return (w / Math.pow(h/100, 2)).toFixed(1); }
function getBMICategory(bmi) {
  if(bmi < 18.5) return 'Underweight';
  if(bmi < 25) return 'Normal Weight';
  if(bmi < 30) return 'Overweight';
  return 'Obese';
}

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => {
  apply3DTilt();
  
  // Start Notification loop (placeholder until logged in)
  let notifInterval;
  
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      document.getElementById('authOverlay').classList.add('hidden');
      
      const loaded = await loadState();
      
      if (!loaded || !state.profile) {
        document.getElementById('onboarding').classList.remove('hidden');
        updateOnboardingProgress(1, 5);
      } else {
        initMainApp();
      }
      
      if(state.settings && state.settings.reminders) {
        notifInterval = setInterval(checkReminders, 60000);
      }
    } else {
      currentUser = null;
      document.getElementById('authOverlay').classList.remove('hidden');
      document.getElementById('mainApp').classList.add('hidden');
      document.getElementById('onboarding').classList.add('hidden');
      if (notifInterval) clearInterval(notifInterval);
    }
  });
});

// --- AUTH LOGIC ---
async function handleAuth() {
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPassword').value;
  const errDiv = document.getElementById('authError');
  const btn = document.getElementById('btnAuthAction');
  
  if(!email || !pass) {
    errDiv.innerText = "Please enter email and password.";
    return;
  }
  
  errDiv.innerText = "";
  btn.innerText = "Loading...";
  
  try {
    // Attempt Login
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    if(e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      // If user doesn't exist or wrong pass, try to create account (if it was just not-found)
      try {
        await auth.createUserWithEmailAndPassword(email, pass);
      } catch(regErr) {
        errDiv.innerText = regErr.message;
      }
    } else {
      errDiv.innerText = e.message;
    }
  }
  btn.innerText = "Log In / Register";
}

async function handleLogout() {
  await auth.signOut();
  state = { profile: null, goals: null, dailyLogs: {}, settings: { reminders: true } };
}

function initMainApp() {
  document.getElementById('mainApp').classList.remove('hidden');
  renderSidebarProfile();
  showPage('dashboard');
  
  // Check if today needs checkin
  const log = getTodayLog();
  if (!log.checkedIn) {
    setTimeout(showCheckin, 1000);
  }
}

// --- ONBOARDING LOGIC ---
let obStep = 1;
let obData = { name:'', age:0, gender:'male', weight:0, height:0, goal:'', activityLevel:'' };

function updateOnboardingProgress(step, total) {
  document.getElementById('obProgressFill').style.width = `${(step/total)*100}%`;
}

function obNext(step) {
  // Validation
  if(step===1) {
    obData.name = document.getElementById('ob-name').value;
    obData.age = parseInt(document.getElementById('ob-age').value);
    obData.gender = document.getElementById('ob-gender').value;
    if(!obData.name || !obData.age) return showToast('⚠️', 'Please fill all fields');
  }
  if(step===2) {
    obData.weight = parseFloat(document.getElementById('ob-weight').value);
    obData.height = parseInt(document.getElementById('ob-height').value);
    if(!obData.weight || !obData.height) return showToast('⚠️', 'Please enter your measurements');
  }
  if(step===3 && !obData.goal) return showToast('⚠️', 'Select a fitness goal');
  if(step===4 && !obData.activityLevel) return showToast('⚠️', 'Select an activity level');

  document.getElementById(`step${step}`).classList.remove('active');
  obStep++;
  document.getElementById(`step${obStep}`).classList.add('active');
  updateOnboardingProgress(obStep, 5);
}

function obBack(step) {
  document.getElementById(`step${step}`).classList.remove('active');
  obStep--;
  document.getElementById(`step${obStep}`).classList.add('active');
  updateOnboardingProgress(obStep, 5);
}

function selectGoal(goal) {
  obData.goal = goal;
  document.querySelectorAll('.goal-card').forEach(el => el.classList.remove('selected'));
  document.getElementById(`goal-${goal}`).classList.add('selected');
}

function selectActivity(act) {
  obData.activityLevel = act;
  document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('selected'));
  document.getElementById(`act-${act}`).classList.add('selected');
}

function completeOnboarding() {
  state.profile = { ...obData };
  calculateAI();
  saveState();
  
  if("Notification" in window) {
    Notification.requestPermission();
  }
  
  document.getElementById('onboarding').classList.add('hidden');
  initMainApp();
}

// --- NAVIGATION ---
function showPage(pageId) {
  // Hide all
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  // Show target
  document.getElementById(`page-${pageId}`).classList.add('active');
  if(document.getElementById(`nav-${pageId}`)) {
    document.getElementById(`nav-${pageId}`).classList.add('active');
  }
  
  currentView.page = pageId;
  
  // Render specific pages
  if(pageId === 'dashboard') renderDashboard();
  if(pageId === 'water') renderWaterPage();
  if(pageId === 'calories') renderCaloriesPage();
  if(pageId === 'workout') renderWorkoutPage();
  if(pageId === 'progress') renderProgressPage();
  if(pageId === 'ai') renderAICoach();
}

// --- DAILY CHECKIN ---
let plannedMuscles = [];
function showCheckin() {
  document.getElementById('checkinModal').classList.remove('hidden');
  document.getElementById('checkin-weight').value = state.profile.weight;
  
  const container = document.getElementById('checkinMuscles');
  container.innerHTML = '';
  Object.keys(MUSCLE_EMOJIS).forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'mc-chip';
    chip.innerHTML = `${MUSCLE_EMOJIS[m]} ${m.charAt(0).toUpperCase() + m.slice(1)}`;
    chip.onclick = () => {
      chip.classList.toggle('selected');
      if(plannedMuscles.includes(m)) plannedMuscles = plannedMuscles.filter(x => x !== m);
      else plannedMuscles.push(m);
    };
    container.appendChild(chip);
  });
}

function saveCheckin() {
  const w = parseFloat(document.getElementById('checkin-weight').value);
  if(!w) return;
  
  state.profile.weight = w;
  calculateAI(); // recalc based on new weight
  
  const log = getTodayLog();
  log.weight = w;
  log.checkedIn = true;
  log.workout.plannedMuscles = [...plannedMuscles];
  saveState();
  
  document.getElementById('checkinModal').classList.add('hidden');
  renderDashboard();
  showToast('🌟', 'Check-in complete! Let\'s crush it.');
}

function skipCheckin() {
  const log = getTodayLog();
  log.checkedIn = true;
  saveState();
  document.getElementById('checkinModal').classList.add('hidden');
}

// --- DASHBOARD RENDER ---
function renderDashboard() {
  const log = getTodayLog();
  const goals = state.goals;
  
  // Greeting
  const hour = new Date().getHours();
  let greet = "Good Evening";
  if(hour < 12) greet = "Good Morning";
  else if(hour < 18) greet = "Good Afternoon";
  document.getElementById('dashGreeting').innerText = `${greet}, ${state.profile.name}!`;
  
  // AI Msg
  const msgs = [
    "Stay hydrated! Your muscles need it.",
    "Consistency is the key to progress.",
    `Your target today: ${goals.calories} kcal. You got this!`,
    "Push harder today than you did yesterday."
  ];
  document.getElementById('dashAIMessage').innerText = msgs[Math.floor(Math.random()*msgs.length)];
  
  // Streak
  const streak = calculateStreak();
  document.getElementById('streakBadge').innerHTML = `🔥 ${streak} day streak`;
  
  // Water Card
  const wPct = Math.min(100, Math.round((log.water / goals.water) * 100));
  document.getElementById('waterPct').innerText = `${wPct}%`;
  document.getElementById('waterAmt').innerText = log.water;
  document.getElementById('waterGoalDisp').innerText = goals.water;
  updateRing('waterRing', wPct);
  
  // Calorie Card
  const cPct = Math.min(100, Math.round((log.caloriesIn / goals.calories) * 100));
  document.getElementById('calPct').innerText = `${cPct}%`;
  document.getElementById('calAmt').innerText = log.caloriesIn;
  document.getElementById('calGoalDisp').innerText = goals.calories;
  updateRing('calRing', cPct);
  
  // Workout Card
  const wStat = document.getElementById('workoutStatus');
  if(log.workout.exercises.length > 0) {
    document.getElementById('wsIcon').innerText = "🔥";
    document.getElementById('wsText').innerText = "Crushing It";
    document.getElementById('wsSub').innerText = `${log.workout.exercises.length} exercises done`;
  } else if(log.workout.plannedMuscles.length > 0) {
    document.getElementById('wsIcon').innerText = "🎯";
    document.getElementById('wsText').innerText = "Leg Day?";
    document.getElementById('wsSub').innerText = `Planned: ${log.workout.plannedMuscles.join(', ')}`;
  } else {
    document.getElementById('wsIcon').innerText = "😴";
    document.getElementById('wsText').innerText = "Rest Day";
    document.getElementById('wsSub').innerText = "Or tap to log";
  }
  
  // Weight Card
  document.getElementById('weightBig').innerText = `${state.profile.weight} kg`;
  const bmi = getBMI(state.profile.weight, state.profile.height);
  document.getElementById('bmiBadge').innerText = `BMI: ${bmi} (${getBMICategory(bmi)})`;
  
  // Today Summary
  const sumDiv = document.getElementById('dashSummary');
  sumDiv.innerHTML = `
    <div class="summary-item"><div><strong>💧 Water</strong><br><small>${log.water} / ${goals.water} ml</small></div><span>${wPct}%</span></div>
    <div class="summary-item"><div><strong>🔥 Calories</strong><br><small>${log.caloriesIn} / ${goals.calories} kcal</small></div><span>${cPct}%</span></div>
    <div class="summary-item"><div><strong>🥩 Protein</strong><br><small>${log.macros.protein} / ${goals.protein} g</small></div></div>
  `;
}

function renderSidebarProfile() {
  const p = state.profile;
  const sp = document.getElementById('sidebarProfile');
  sp.innerHTML = `
    <div class="sp-avatar">${p.name.charAt(0).toUpperCase()}</div>
    <div class="sp-info"><div>${p.name}</div><small>${p.goal.toUpperCase()}</small></div>
  `;
}

// --- WATER LOGIC ---
function addWater(ml) {
  const log = getTodayLog();
  log.water += ml;
  saveState();
  if(currentView.page === 'dashboard') renderDashboard();
  if(currentView.page === 'water') renderWaterPage();
  showToast('💧', `Added ${ml}ml water`);
}

function addCustomWater() {
  const v = parseInt(document.getElementById('customWaterAmt').value);
  if(v && v > 0) {
    addWater(v);
    document.getElementById('customWaterAmt').value = '';
  }
}
function quickAddWater(ml) { addWater(ml); }

function renderWaterPage() {
  const log = getTodayLog();
  const goals = state.goals;
  const pct = Math.min(100, Math.round((log.water / goals.water) * 100));
  
  document.getElementById('waterBigPct').innerText = `${pct}%`;
  document.getElementById('waterBigAmt').innerText = `${log.water} / ${goals.water} ml`;
  updateRing('waterBigRing', pct, 502);
  
  const tl = document.getElementById('waterLog');
  tl.innerHTML = `<div class="water-log-item"><span class="wl-time">Today</span><span class="wl-amt">${log.water} ml total</span></div>`;
}

// --- CALORIES LOGIC ---
function renderCaloriesPage() {
  const log = getTodayLog();
  const goals = state.goals;
  
  const pct = Math.min(100, Math.round((log.caloriesIn / goals.calories) * 100));
  document.getElementById('calBigPct').innerText = `${pct}%`;
  document.getElementById('calBigAmt').innerText = `${log.caloriesIn} kcal`;
  updateRing('calBigRing', pct, 502);
  
  document.getElementById('calGoalLabel').innerText = `${goals.calories} kcal`;
  document.getElementById('calConsumed').innerText = `${log.caloriesIn} kcal`;
  document.getElementById('calRemaining').innerText = `${Math.max(0, goals.calories - log.caloriesIn)} kcal`;
  
  renderMacroChart();
  renderMealList();
}

let mChart = null;
function renderMacroChart() {
  const log = getTodayLog();
  const ctx = document.getElementById('macroChart').getContext('2d');
  
  if(mChart) mChart.destroy();
  mChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [log.macros.protein, log.macros.carbs, log.macros.fat],
        backgroundColor: ['#10b981', '#06b6d4', '#f59e0b'],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: { plugins: { legend: { display: false } } }
  });
  
  document.getElementById('macroLegend').innerHTML = `
    <div class="ml-item"><div class="ml-dot" style="background:#10b981"></div>${log.macros.protein}g P</div>
    <div class="ml-item"><div class="ml-dot" style="background:#06b6d4"></div>${log.macros.carbs}g C</div>
    <div class="ml-item"><div class="ml-dot" style="background:#f59e0b"></div>${log.macros.fat}g F</div>
  `;
}

function showQuickMeal() { document.getElementById('quickMealModal').classList.remove('hidden'); }
function closeQuickMeal() { document.getElementById('quickMealModal').classList.add('hidden'); }

function saveQuickMeal() {
  const name = document.getElementById('qmName').value || 'Quick Meal';
  const cal = parseInt(document.getElementById('qmCal').value) || 0;
  const p = parseInt(document.getElementById('qmProtein').value) || 0;
  const c = parseInt(document.getElementById('qmCarbs').value) || 0;
  const f = parseInt(document.getElementById('qmFat').value) || 0;
  
  if(!cal) return showToast('⚠️', 'Please enter calories');
  quickMeal(name, cal, p, c, f);
  closeQuickMeal();
}

function addMeal() {
  const name = document.getElementById('mealName').value || 'Meal';
  const cal = parseInt(document.getElementById('mealCal').value) || 0;
  const p = parseInt(document.getElementById('mealProtein').value) || 0;
  const c = parseInt(document.getElementById('mealCarbs').value) || 0;
  const f = parseInt(document.getElementById('mealFat').value) || 0;
  
  if(!cal) return showToast('⚠️', 'Please enter calories');
  quickMeal(name, cal, p, c, f);
  
  document.getElementById('mealName').value = '';
  document.getElementById('mealCal').value = '';
  document.getElementById('mealProtein').value = '';
  document.getElementById('mealCarbs').value = '';
  document.getElementById('mealFat').value = '';
}

function quickMeal(name, cal, p, c, f) {
  const log = getTodayLog();
  log.meals.push({ name, cal, p, c, f, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) });
  log.caloriesIn += cal;
  log.macros.protein += p;
  log.macros.carbs += c;
  log.macros.fat += f;
  saveState();
  
  if(currentView.page === 'dashboard') renderDashboard();
  if(currentView.page === 'calories') renderCaloriesPage();
  showToast('🍽️', `Logged ${name}`);
}

function removeMeal(idx) {
  const log = getTodayLog();
  const m = log.meals[idx];
  log.caloriesIn -= m.cal;
  log.macros.protein -= m.p;
  log.macros.carbs -= m.c;
  log.macros.fat -= m.f;
  log.meals.splice(idx, 1);
  saveState();
  renderCaloriesPage();
}

function renderMealList() {
  const list = document.getElementById('mealList');
  const log = getTodayLog();
  if(log.meals.length === 0) {
    list.innerHTML = `<div style="color:var(--t2)">No meals logged today yet.</div>`;
    return;
  }
  
  list.innerHTML = log.meals.map((m, i) => `
    <div class="meal-item">
      <div class="mi-info">
        <div class="mi-name">${m.name}</div>
        <div class="mi-macros">${m.time} • ${m.p}P / ${m.c}C / ${m.f}F</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="mi-cal">${m.cal}</div>
        <button class="mi-delete btn-icon" onclick="removeMeal(${i})">🗑️</button>
      </div>
    </div>
  `).join('');
}

// --- WORKOUT LOGIC ---
function renderWorkoutPage() {
  renderMuscleGrid();
  renderWorkoutLog();
}

function renderMuscleGrid() {
  const mg = document.getElementById('muscleGrid');
  mg.innerHTML = Object.keys(EXERCISE_DB).map(m => `
    <div class="muscle-card" onclick="selectMuscle('${m}')">
      <div class="mc-icon">${MUSCLE_EMOJIS[m]}</div>
      <div class="mc-name">${m.toUpperCase()}</div>
    </div>
  `).join('');
}

function selectMuscle(m) {
  currentView.selectedMuscle = m;
  document.getElementById('muscleGrid').style.display = 'none';
  const sec = document.getElementById('exerciseSection');
  sec.style.display = 'block';
  document.getElementById('selectedMuscleTitle').innerText = `${MUSCLE_EMOJIS[m]} ${m.toUpperCase()} Exercises`;
  
  const list = document.getElementById('exerciseList');
  list.innerHTML = EXERCISE_DB[m].map(ex => `
    <div class="ex-item" onclick="selectExercise('${ex}')">${ex}</div>
  `).join('');
  document.getElementById('setForm').style.display = 'none';
}

function clearMuscle() {
  document.getElementById('muscleGrid').style.display = 'grid';
  document.getElementById('exerciseSection').style.display = 'none';
  currentView.selectedMuscle = null;
  currentView.selectedExercise = null;
}

function selectExercise(ex) {
  currentView.selectedExercise = ex;
  document.getElementById('setForm').style.display = 'block';
  document.getElementById('selectedExerciseName').innerText = ex;
  // Clear inputs
  document.getElementById('setSets').value = '';
  document.getElementById('setReps').value = '';
  document.getElementById('setWeight').value = '';
}

function logSet() {
  const s = parseInt(document.getElementById('setSets').value);
  const r = parseInt(document.getElementById('setReps').value);
  const w = parseFloat(document.getElementById('setWeight').value) || 0;
  
  if(!s || !r) return showToast('⚠️', 'Enter sets and reps');
  
  const log = getTodayLog();
  const exName = currentView.selectedExercise;
  
  // Find if exercise already logged today
  let exLog = log.workout.exercises.find(e => e.name === exName);
  if(!exLog) {
    exLog = { name: exName, sets: [] };
    log.workout.exercises.push(exLog);
  }
  
  for(let i=0; i<s; i++) {
    exLog.sets.push({ reps: r, weight: w });
  }
  
  saveState();
  renderWorkoutLog();
  showToast('🏋️', `Logged ${s}x${r} ${exName}`);
  document.getElementById('setSets').value = '';
  document.getElementById('setReps').value = '';
}

function removeExercise(idx) {
  const log = getTodayLog();
  log.workout.exercises.splice(idx, 1);
  saveState();
  renderWorkoutLog();
}

function renderWorkoutLog() {
  const log = getTodayLog();
  const div = document.getElementById('workoutLog');
  
  if(log.workout.exercises.length === 0) {
    div.innerHTML = `<div style="color:var(--t2)">No exercises logged yet. Let's lift!</div>`;
    document.getElementById('workoutStats').innerHTML = '';
    return;
  }
  
  div.innerHTML = log.workout.exercises.map((ex, i) => `
    <div class="workout-log-item">
      <div class="wli-header">
        <span>${ex.name}</span>
        <button class="btn-ghost" style="padding:0;color:var(--r)" onclick="removeExercise(${i})">Remove</button>
      </div>
      <div class="wli-sets">
        ${ex.sets.map((s, j) => `<div class="wli-set">Set ${j+1}: <strong>${s.reps}x</strong> @ ${s.weight}kg</div>`).join('')}
      </div>
    </div>
  `).join('');
  
  // Calculate Volume
  let totalVol = 0;
  let totalSets = 0;
  log.workout.exercises.forEach(ex => {
    ex.sets.forEach(s => {
      totalSets++;
      totalVol += (s.reps * s.weight);
    });
  });
  
  document.getElementById('workoutStats').innerHTML = `
    <div><strong>Total Sets:</strong> ${totalSets}</div>
    <div><strong>Total Volume:</strong> ${totalVol} kg</div>
  `;
}

// --- PROGRESS PAGE ---
function renderProgressPage() {
  // Stats row
  const allLogs = Object.values(state.dailyLogs);
  const workoutCount = allLogs.filter(l => l.workout.exercises.length > 0).length;
  
  document.getElementById('progressStatsRow').innerHTML = `
    <div class="p-stat"><div>Total Workouts</div><div class="p-stat-val">${workoutCount}</div></div>
    <div class="p-stat"><div>Current Weight</div><div class="p-stat-val">${state.profile.weight} kg</div></div>
    <div class="p-stat"><div>Current Streak</div><div class="p-stat-val">${calculateStreak()} 🔥</div></div>
  `;
  
  renderWeightChart();
  renderCalChart();
  renderHeatmap();
}

let wChart, cChart;
function renderWeightChart() {
  const ctx = document.getElementById('weightChart').getContext('2d');
  
  // Get last 30 days data
  let labels = [];
  let data = [];
  const keys = Object.keys(state.dailyLogs).sort();
  keys.slice(-30).forEach(k => {
    labels.push(k.slice(5)); // MM-DD
    data.push(state.dailyLogs[k].weight);
  });
  
  if(wChart) wChart.destroy();
  wChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weight (kg)',
        data: data,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { suggestedMin: state.profile.weight - 5, suggestedMax: state.profile.weight + 5 }
      }
    }
  });
}

function renderCalChart() {
  const ctx = document.getElementById('calChart').getContext('2d');
  
  let labels = [];
  let data = [];
  const keys = Object.keys(state.dailyLogs).sort();
  keys.slice(-14).forEach(k => {
    labels.push(k.slice(5));
    data.push(state.dailyLogs[k].caloriesIn);
  });
  
  if(cChart) cChart.destroy();
  cChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Calories',
        data: data,
        backgroundColor: '#f59e0b',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

function renderHeatmap() {
  const hm = document.getElementById('workoutHeatmap');
  hm.innerHTML = '';
  // Generate 90 cells
  for(let i=0; i<90; i++) {
    // Dummy heatmap generation based on logs
    const lvl = Math.floor(Math.random() * 4); 
    hm.innerHTML += `<div class="hm-cell lvl-${lvl}"></div>`;
  }
}

// --- AI COACH PAGE ---
async function renderAICoach() {
  const goals = state.goals;
  const log = getTodayLog();
  
  // Update static sections first
  document.getElementById('statsBreakdown').innerHTML = `
    <div class="sb-card"><div class="sb-title">BMR (Resting Burn)</div><div class="sb-val">${goals.bmr} kcal</div></div>
    <div class="sb-card"><div class="sb-title">TDEE (Total Burn)</div><div class="sb-val">${goals.tdee} kcal</div></div>
    <div class="sb-card"><div class="sb-title">Daily Protein</div><div class="sb-val">${goals.protein} g</div></div>
  `;
  
  document.getElementById('badgesGrid').innerHTML = `
    <div class="badge"><div class="badge-icon">🎯</div><div class="badge-name">Goal Setter</div></div>
    <div class="badge"><div class="badge-icon">🔥</div><div class="badge-name">${calculateStreak()} Day Streak</div></div>
    <div class="badge" style="opacity:${log.workout.exercises.length > 0 ? '1' : '0.3'}"><div class="badge-icon">🏋️</div><div class="badge-name">Workout Logged</div></div>
  `;
  
  // Show loading state for AI
  document.getElementById('aiReportCard').innerHTML = `
    <div class="ai-greeting">Hi ${state.profile.name}, analyzing your data...</div>
    <div class="ai-msg" style="color: var(--c)">Connecting to Gemini AI to generate personalized insights 🧠✨</div>
  `;
  document.getElementById('weeklyTips').innerHTML = '';

  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: state.profile,
        log: log,
        goals: goals,
        streak: calculateStreak()
      })
    });

    if (!response.ok) throw new Error('API Error');

    const aiData = await response.json();

    if (aiData.error) throw new Error(aiData.error);

    document.getElementById('aiReportCard').innerHTML = `
      <div class="ai-greeting">${aiData.greeting}</div>
      <div class="ai-msg">${aiData.analysis}</div>
      <button class="btn-primary" onclick="renderAICoach()">Refresh AI Plan 🤖</button>
    `;

    document.getElementById('weeklyTips').innerHTML = aiData.tips.map(tip => `
      <div class="tip-card">
        <div class="tip-title">${tip.title}</div>
        <div>${tip.content}</div>
      </div>
    `).join('');

  } catch (error) {
    console.error(error);
    document.getElementById('aiReportCard').innerHTML = `
      <div class="ai-greeting">Oops! Connection Failed</div>
      <div class="ai-msg" style="color: var(--r)">Could not connect to the AI backend. Make sure the Node.js server is running and the Gemini API key is configured in .env.</div>
      <button class="btn-secondary" onclick="renderAICoach()">Try Again</button>
    `;
  }
}

// --- UTILS & HELPERS ---
function calculateStreak() {
  let streak = 0;
  const d = new Date();
  while(true) {
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(state.dailyLogs[k] && state.dailyLogs[k].checkedIn) {
      streak++;
      d.setDate(d.getDate()-1);
    } else {
      break;
    }
  }
  return streak;
}

function updateRing(id, pct, maxDash = 188.5) {
  const el = document.getElementById(id);
  if(!el) return;
  const offset = maxDash - (pct / 100) * maxDash;
  el.style.strokeDashoffset = Math.max(0, offset);
}

// 3D Tilt Effect
function apply3DTilt() {
  document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.card-3d').forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const xc = rect.width / 2;
      const yc = rect.height / 2;
      const dx = x - xc;
      const dy = y - yc;
      card.style.transform = `perspective(1000px) rotateY(${dx / 20}deg) rotateX(${-dy / 20}deg) scale3d(1.02, 1.02, 1.02)`;
    });
  });
  document.addEventListener('mouseout', () => {
    document.querySelectorAll('.card-3d').forEach(card => card.style.transform = '');
  });
}

// Toast
function showToast(icon, msg) {
  const t = document.getElementById('notifToast');
  document.getElementById('notifIcon').innerText = icon;
  document.getElementById('notifMsg').innerText = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 4000);
}
function dismissToast() { document.getElementById('notifToast').classList.add('hidden'); }

// Reminders
function checkReminders() {
  const h = new Date().getHours();
  // Simple check for water every 2 hrs from 8am to 8pm
  if(h >= 8 && h <= 20 && h%2 === 0) {
    showToast('💧', 'Remember to drink a glass of water!');
  }
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }).catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}
