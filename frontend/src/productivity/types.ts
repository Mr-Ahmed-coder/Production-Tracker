export type FocusSession = {
  id: string;
  state: "running" | "paused" | "finished" | "discarded";
  active: boolean;
  taskId: string | null;
  goalId: string | null;
  createdAt: string;
  endedAt: string | null;
  durationMs: number;
  serverNow: string;
  leaseUntil: string | null;
};
export type Preferences = { timeZone: string; dailyTargetMinutes: number };
export type ActivityDay = {
  date: string;
  focusMs: number;
  focusHours: number;
  targetPercent: number;
  planned: number;
  plannedCompleted: number;
  tasksCompleted: number;
  habitsScheduled: number;
  habitsCompleted: number;
  habitConsistency: number | null;
  milestonesAchieved: number;
};
export type Analytics = Preferences & {
  today: string;
  days: ActivityDay[];
  legacyCompletedTasks: number;
  goals: {
    id: string;
    title: string;
    status: string;
    archived: boolean;
    progress: number;
    milestonesCompleted: number;
    milestonesTotal: number;
  }[];
  achieved: { date: string; title: string; goal: string }[];
  tasks: { id: string; title: string; dueDate: string; completed: boolean }[];
  completedTasks: { id: string; title: string; date: string }[];
  completedHabits: { title: string; date: string; timeZone: string }[];
};
export type Review = {
  id: string;
  date: string;
  wentWell: string;
  challenges: string;
  tomorrow: string;
  updatedAt: string;
  version: number;
};

export type Insights = {
  timeZone: string;
  today: string;
  dailyTargetMinutes: number;
  sufficientData: boolean;
  sufficiencyNotice: string | null;
  activeDaysCount: number;
  weeklyComparison: {
    thisWeek: {
      focusHours: number;
      tasksCompleted: number;
      habitConsistency: number | null;
    };
    lastWeek: {
      focusHours: number;
      tasksCompleted: number;
      habitConsistency: number | null;
    };
    focusChangeHours: number;
    tasksChange: number;
    habitConsistencyChange: number | null;
    bestDay: {
      day: string;
      averageHours: number;
    } | null;
  };
  focusConsistency: {
    currentTargetStreak: number;
    longestTargetStreak: number;
    daysMetTargetLast14: number;
    daysMetTargetLast30: number;
    totalFocusPast30Hours: number;
    weekdayPercent: number;
    weekendPercent: number;
  };
  taskPatterns: {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
    overdueCount: number;
    overdueTasks: {
      id: string;
      title: string;
      dueDate: string;
      priority: string;
    }[];
    highPriorityPending: { id: string; title: string; dueDate: string }[];
    priorityBreakdown: {
      High: { total: number; completed: number };
      Medium: { total: number; completed: number };
      Low: { total: number; completed: number };
    };
    completedOnTime: number;
    completedLate: number;
  };
  habitAdherence: {
    activeCount: number;
    overallConsistency: number;
    mostConsistentHabit: {
      title: string;
      streak: number;
      consistency: number;
    } | null;
    missedYesterdayCount: number;
    missedYesterday: { id: string; title: string }[];
  };
  goalProgress: {
    total: number;
    active: number;
    completed: number;
    totalMilestones: number;
    achievedMilestones: number;
    upcomingMilestones: {
      title: string;
      goalTitle: string;
      targetDate: string;
    }[];
    nearCompletion: { id: string; title: string; progress: number }[];
  };
  suggestions: {
    type: string;
    title: string;
    message: string;
    actionTo?: string;
    actionLabel?: string;
  }[];
  explanations: Record<string, string>;
};
