export type RecordBase = { id: string; createdAt: string; updatedAt: string };
export type Note = RecordBase & {
  title: string;
  content: string;
  category: string;
  tags: string[];
  pinned: boolean;
  journalDate: string | null;
  goalId: string | null;
  taskId: string | null;
};
export type Milestone = {
  id?: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  targetDate: string | null;
};
export type Goal = RecordBase & {
  title: string;
  description: string;
  category: string;
  term: "short" | "long";
  targetDate: string;
  status: "active" | "paused" | "completed";
  archived: boolean;
  taskIds: string[];
  milestones: Milestone[];
  progress: number;
};
export type Day = {
  date: string;
  scheduled: boolean;
  completed: boolean;
  future: boolean;
};
export type Habit = RecordBase & {
  title: string;
  category: string;
  timeZone: string;
  startDate: string;
  archived: boolean;
  weekdays: number[];
  today: string;
  currentStreak: number;
  longestStreak: number;
  consistency: number;
  scheduledCount: number;
  completedCount: number;
  week: Day[];
  weekHistory: {
    start: string;
    end: string;
    scheduled: number;
    completed: number;
  }[];
  completions: string[];
};
