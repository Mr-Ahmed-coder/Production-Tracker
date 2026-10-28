export type Task = {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  completed: boolean;
  dueDate: string;
  category: string;
};
export const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const demoTasks: Task[] = [
  {
    id: "demo-1",
    title: "Finish a chapter of Atomic Habits",
    priority: "High",
    completed: false,
    dueDate: localDate(),
    category: "Personal growth",
  },
  {
    id: "demo-2",
    title: "Design my personal portfolio",
    priority: "Medium",
    completed: false,
    dueDate: localDate(),
    category: "Creative work",
  },
  {
    id: "demo-3",
    title: "Go for a 30-minute walk",
    priority: "Low",
    completed: true,
    dueDate: localDate(),
    category: "Wellbeing",
  },
  {
    id: "demo-4",
    title: "Write my evening reflection",
    priority: "Low",
    completed: false,
    dueDate: localDate(),
    category: "Mindfulness",
  },
];
export const focusData = [
  { day: "Mon", hours: 2.5 },
  { day: "Tue", hours: 4 },
  { day: "Wed", hours: 3.5 },
  { day: "Thu", hours: 5 },
  { day: "Fri", hours: 7 },
  { day: "Sat", hours: 3 },
  { day: "Sun", hours: 1.5 },
];
export const goals = [
  {
    title: "Build a reading habit",
    detail: "Read 12 books this year",
    progress: 67,
    date: "Oct 25",
    icon: "book",
  },
  {
    title: "Launch my portfolio",
    detail: "Design → build → share",
    progress: 45,
    date: "Oct 29",
    icon: "code",
  },
  {
    title: "Run my first 5K",
    detail: "A stronger version of me",
    progress: 80,
    date: "Nov 02",
    icon: "run",
  },
];
export const habits = [
  {
    title: "Morning meditation",
    detail: "10 minutes of clarity",
    streak: 12,
    days: [true, true, true, true, true, false, true],
  },
  {
    title: "Read 20 pages",
    detail: "A little wiser, every day",
    streak: 8,
    days: [true, true, false, true, true, true, true],
  },
  {
    title: "Move my body",
    detail: "Make time for yourself",
    streak: 5,
    days: [true, false, true, true, true, true, false],
  },
];
