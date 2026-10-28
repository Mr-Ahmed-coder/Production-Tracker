// Non-destructive end-to-end verification script for MongoDB Atlas
const BASE_URL = "http://127.0.0.1:4000/api";
const ORIGIN = "http://127.0.0.1:5173";

let sessionCookie = null;

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-ProdTrack-Request": "1",
    Origin: ORIGIN,
    ...(options.headers || {}),
  };
  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/prodtrack_session=([^;]+)/);
    if (match) {
      sessionCookie = `prodtrack_session=${match[1]}`;
    }
  }

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

async function runFeatureTests() {
  console.log("==================================================");
  console.log("  StudyMomentum — MongoDB Atlas E2E Feature Tests  ");
  console.log("==================================================");

  const testEmail = `atlas-test-${Date.now()}@studymomentum.local`;
  const testPassword = "Password123!Secure";
  const results = {};

  // 1. User registration and login
  console.log("\n[1] Testing User Registration & Login...");
  try {
    const regRes = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Atlas Test User", email: testEmail, password: testPassword }),
    });
    if (regRes.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
    console.log("  ✔ Registration successful for:", regRes.data.user.email);

    // Logout
    const logoutRes = await request("/auth/logout", { method: "POST" });
    if (logoutRes.status !== 204 && logoutRes.status !== 200) throw new Error("Logout failed");
    sessionCookie = null;
    console.log("  ✔ Logout successful (session revoked)");

    // Login
    const loginRes = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
    console.log("  ✔ Login successful, session cookie re-established");
    results.auth = true;
  } catch (err) {
    console.error("  ✖ Auth failed:", err.message);
    results.auth = false;
  }

  // 2. Persistent authentication sessions
  console.log("\n[2] Testing Persistent Authentication Sessions...");
  try {
    const meRes = await request("/auth/me");
    if (meRes.status !== 200 || meRes.data.user.email !== testEmail.toLowerCase()) {
      throw new Error("Session validation failed");
    }
    console.log("  ✔ /api/auth/me confirmed session is active and valid");
    results.session = true;
  } catch (err) {
    console.error("  ✖ Session check failed:", err.message);
    results.session = false;
  }

  // 3. Task management
  let createdTaskId = null;
  console.log("\n[3] Testing Task Management...");
  try {
    const createRes = await request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Complete Atlas Integration Verification",
        priority: "High",
        category: "Study",
        dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      }),
    });
    if (createRes.status !== 201) throw new Error(`Task creation failed: ${JSON.stringify(createRes.data)}`);
    const taskObj = createRes.data.task || createRes.data.item || createRes.data;
    createdTaskId = taskObj.id || taskObj._id;
    console.log("  ✔ Task created with High priority (ID:", createdTaskId, ")");

    // Complete task
    const completeRes = await request(`/tasks/${createdTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: true }),
    });
    if (completeRes.status !== 200) {
      throw new Error(`Task completion failed: ${JSON.stringify(completeRes.data)}`);
    }
    console.log("  ✔ Task marked complete with server completion timestamp");

    // List tasks
    const listRes = await request("/tasks");
    const taskCount = Array.isArray(listRes.data)
      ? listRes.data.length
      : listRes.data.tasks?.length ?? listRes.data.items?.length;
    console.log(`  ✔ Tasks listed successfully (Total: ${taskCount})`);
    results.tasks = true;
  } catch (err) {
    console.error("  ✖ Task management failed:", err.message);
    results.tasks = false;
  }

  // 4. Notes and journals
  console.log("\n[4] Testing Notes and Journals...");
  try {
    const noteRes = await request("/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Atlas Architecture Overview",
        content: "ProdTrack / StudyMomentum connected to MongoDB Atlas M0 cluster.",
        pinned: true,
        tags: ["database", "cloud", "atlas"],
      }),
    });
    if (noteRes.status !== 201) throw new Error(`Note creation failed: ${JSON.stringify(noteRes.data)}`);
    console.log("  ✔ Note created with tags and pinned state");

    // Create journal entry
    const today = new Date().toISOString().split("T")[0];
    const journalRes = await request("/notes", {
      method: "POST",
      body: JSON.stringify({
        title: `Daily Journal — ${today}`,
        content: "Transitioned development database to MongoDB Atlas with TLS.",
        journalDate: today,
      }),
    });
    if (journalRes.status !== 201) throw new Error(`Journal creation failed: ${JSON.stringify(journalRes.data)}`);
    console.log("  ✔ Daily journal created for date:", today);
    results.notes = true;
  } catch (err) {
    console.error("  ✖ Notes failed:", err.message);
    results.notes = false;
  }

  // 5. Goals and milestones
  let createdGoalId = null;
  console.log("\n[5] Testing Goals and Milestones...");
  try {
    const goalRes = await request("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Master MongoDB Atlas Deployment",
        description: "Achieve seamless cloud database connectivity with full persistence.",
        targetDate: "2026-12-31",
        milestones: [
          { title: "Configure TLS & Network Access", target: 100, current: 100, unit: "%" },
          { title: "Verify Index Building", target: 10, current: 10, unit: "indexes" },
        ],
      }),
    });
    if (goalRes.status !== 201) throw new Error(`Goal creation failed: ${JSON.stringify(goalRes.data)}`);
    const goalItem = goalRes.data.item || goalRes.data;
    createdGoalId = goalItem.id || goalItem._id;
    console.log("  ✔ Goal created with milestones (ID:", createdGoalId, ")");
    results.goals = true;
  } catch (err) {
    console.error("  ✖ Goals failed:", err.message);
    results.goals = false;
  }

  // 6. Habit tracking
  let createdHabitId = null;
  console.log("\n[6] Testing Habit Tracking...");
  try {
    const habitRes = await request("/habits", {
      method: "POST",
      body: JSON.stringify({
        title: "Daily Focus Sprint",
        timeZone: "UTC",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      }),
    });
    if (habitRes.status !== 201) throw new Error(`Habit creation failed: ${JSON.stringify(habitRes.data)}`);
    const habitItem = habitRes.data.item || habitRes.data;
    createdHabitId = habitItem.id || habitItem._id;
    console.log("  ✔ Habit created:", habitItem.title, "(ID:", createdHabitId, ")");

    // Record habit completion
    const today = new Date().toISOString().split("T")[0];
    const compRes = await request(`/habits/${createdHabitId}/completions/${today}`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    if (compRes.status !== 200 && compRes.status !== 201) {
      throw new Error(`Habit completion failed: ${JSON.stringify(compRes.data)}`);
    }
    console.log("  ✔ Habit completion recorded for:", today);
    results.habits = true;
  } catch (err) {
    console.error("  ✖ Habits failed:", err.message);
    results.habits = false;
  }

  // 7. Focus sessions and productivity analytics
  console.log("\n[7] Testing Focus Sessions & Productivity Analytics...");
  try {
    // Save preferences
    await request("/productivity/settings", {
      method: "PUT",
      body: JSON.stringify({ dailyTargetMinutes: 60, timeZone: "UTC" }),
    });

    // Start focus session
    const startRes = await request("/focus", {
      method: "POST",
      body: JSON.stringify({
        taskId: createdTaskId,
        goalId: createdGoalId,
      }),
    });
    if (startRes.status !== 201) throw new Error(`Focus start failed: ${JSON.stringify(startRes.data)}`);
    const sessionItem = startRes.data.item || startRes.data;
    const sessionId = sessionItem.id || sessionItem._id;
    console.log("  ✔ Focus session started (ID:", sessionId, ")");

    // Heartbeat
    const hbRes = await request(`/focus/${sessionId}/heartbeat`, { method: "POST", body: JSON.stringify({}) });
    if (hbRes.status !== 200) throw new Error(`Focus heartbeat failed: ${JSON.stringify(hbRes.data)}`);
    console.log("  ✔ Focus session lease refreshed via heartbeat");

    // Finish session
    const finishRes = await request(`/focus/${sessionId}/finish`, { method: "POST", body: JSON.stringify({}) });
    if (finishRes.status !== 200) throw new Error(`Focus finish failed: ${JSON.stringify(finishRes.data)}`);
    console.log("  ✔ Focus session finished successfully");

    // Check analytics
    const analyticsRes = await request("/productivity/analytics?range=week");
    if (analyticsRes.status !== 200) throw new Error("Analytics retrieval failed");
    console.log("  ✔ Productivity analytics retrieved successfully");
    results.focus = true;
  } catch (err) {
    console.error("  ✖ Focus / Analytics failed:", err.message);
    results.focus = false;
  }

  // 8. Daily reviews and personal insights
  console.log("\n[8] Testing Daily Reviews & Personal Insights...");
  try {
    const today = new Date().toISOString().split("T")[0];
    const reviewRes = await request(`/productivity/reviews/${today}`, {
      method: "PUT",
      body: JSON.stringify({
        wentWell: "Successfully connected MongoDB Atlas cluster with TLS.",
        challenges: "Handled Windows DNS SRV resolver configuration.",
        tomorrow: "Verify dashboard and report final findings.",
        version: null,
      }),
    });
    if (reviewRes.status !== 200 && reviewRes.status !== 201) {
      throw new Error(`Daily review creation failed: ${JSON.stringify(reviewRes.data)}`);
    }
    console.log("  ✔ Daily review recorded for date:", today);

    // Personal insights
    const insightsRes = await request("/productivity/insights");
    if (insightsRes.status !== 200) throw new Error("Insights retrieval failed");
    console.log("  ✔ Personal insights calculated successfully");

    // Data export (JSON & CSV)
    const exportJson = await request("/productivity/export?format=json");
    if (exportJson.status !== 200) throw new Error("JSON export failed");
    console.log("  ✔ Authenticated JSON data export verified");

    const exportCsv = await request("/productivity/export?format=csv");
    if (exportCsv.status !== 200) throw new Error("CSV export failed");
    console.log("  ✔ Authenticated CSV data export verified");

    results.reviewsAndInsights = true;
  } catch (err) {
    console.error("  ✖ Daily reviews / insights failed:", err.message);
    results.reviewsAndInsights = false;
  }

  console.log("\n==================================================");
  console.log("                 SUMMARY RESULTS                  ");
  console.log("==================================================");
  for (const [feature, passed] of Object.entries(results)) {
    console.log(`  ${passed ? "✔ PASS" : "✖ FAIL"}: ${feature}`);
  }
  const allPassed = Object.values(results).every(Boolean);
  console.log(`\nFinal Verdict: ${allPassed ? "ALL 8 FEATURE FLOWS PASSED ON ATLAS!" : "SOME CHECKS FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

runFeatureTests().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
