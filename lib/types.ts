
export type ActionTheme = 'Collaboration' | 'Feedback' | 'Accountability' | 'Connection' | 'Coaching';

export interface ActionCard {
  id: string;
  cohortId?: string | null;
  /** Zero-based sequence chosen during draft-plan review. */
  planOrder?: number | null;
  theme: ActionTheme;
  title: string;
  how: string;
  why: string;
  timeEstimate: string;
  /** True for AI-generated personal actions (visible only to their creator). */
  isPersonal?: boolean;
  /** Whole-number share of the cohort plan's 1,000-point starting balance. */
  planPoints?: number;
}

export interface UserAction {
  id: string;
  actionId: string;
  cohortId?: string | null;
  status: 'scheduled' | 'success' | 'failed' | 'skipped';
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledAt?: string; // ISO string for validation queue filter
  /** When user committed (with or without schedule). Used for "Accepted on xyz" in validation queue. */
  acceptedAt?: string;
  acceptedDate?: string;
  acceptedTime?: string;
  completedAt?: string;
  completedLate?: boolean;
  missedAt?: string;
  isCalendarSynced?: boolean;
  reflection?: string;
  pointsDelta?: number;
  pointsSettledAt?: string;
}

export interface FeedItem {
  id: string;
  cohortId?: string | null;
  userId: string;
  userName: string;
  actionTitle: string;
  type: 'READ' | 'ACCEPTED' | 'SCHEDULED' | 'DECLINED' | 'SUCCESS';
  timestamp: number;
  likes: number;
}

export interface UserProfile {
  name: string;
  /** League index (0–4) derived from profiles.league_index for DB-backed store; legacy clients may treat this as an importance slider. */
  importanceRating: number;
  weeklyGoal: number;
  totalPoints: number;
  onboarded: boolean;
  streak: number;
}

/** DB profile row (profiles table): multi-tenant company_id and role */
export interface DbProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: string | null;
  role: "user" | "admin" | "superadmin";
  /** For user roles, league index: 0=Starter,1=Bronze,2=Silver,3=Gold,4=Diamond. */
  league_index: number;
  weekly_goal: number;
  total_points: number;
  streak: number;
  last_active_at: string | null;
  created_at: string;
}

export enum League {
  Starter = 'Starter',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Diamond = 'Diamond'
}

/** A trainer's display profile (name + photo). No login of their own — company
 * admins and superadmins read what participants send them. */
export interface Trainer {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** A superadmin-managed label assignable to a participant's cohort membership. */
export interface ParticipantTag {
  id: string;
  name: string;
}

/** A group of users within a company sharing Prepare content and an action plan. */
export interface Cohort {
  id: string;
  /** Derived legacy composite of batchName and moduleName ("batch — module", or just "batch"). */
  name: string;
  /** Required first part of the cohort's two-part name, e.g. the batch/group name. */
  batchName: string;
  /** Optional second part of the cohort's two-part name, e.g. the training module. */
  moduleName?: string | null;
  description?: string | null;
  trainingContent?: string | null;
  businessContext?: string | null;
  startDate?: string | null;
  memberCount: number;
  logoUrl?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  trainerId?: string | null;
  trainer?: Trainer | null;
}

/** One private message a participant sent their trainer ("what do you want
 * from this session?") — an append-only log, admin/superadmin-facing shape
 * with the sender's name attached. */
export interface TrainerExpectation {
  id: string;
  cohortId: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
}

/** The same message, from the sending participant's own point of view — no
 * userName needed since it's always "you". */
export interface TrainerExpectationMessage {
  id: string;
  message: string;
  createdAt: string;
}

export interface CompanyBrand {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** A cohort available in the participant-wide cohort switcher. */
export interface CohortOption extends Cohort {
  companyId: string;
  archivedAt?: string | null;
  isCurrent: boolean;
  isSelected: boolean;
}

export interface CohortMember {
  id: string;
  fullName: string | null;
  email: string | null;
  /** The tag assigned to this participant for this specific cohort membership, if any. */
  tag?: ParticipantTag | null;
}

export interface CohortMessage {
  id: string;
  cohortId: string;
  senderId: string;
  senderName: string;
  senderRole: 'participant' | 'trainer';
  message: string;
  createdAt: string;
}

export interface JourneyData {
  error?: string;
  cohort: Cohort | null;
  roster: CohortMember[];
  items: PrepareContentItem[];
  progress: UserPrepareProgress[];
  trainerMessages: TrainerExpectationMessage[];
}

export type PrepareContentType = 'video' | 'quiz' | 'preread';

export interface QuizOption {
  id: string;
  optionText: string;
  /** Only ever populated server-side for the authoring UI; never sent to a regular user's browser. */
  isCorrect?: boolean;
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  options: QuizOption[];
}

export interface PrepareContentItem {
  id: string;
  type: PrepareContentType;
  title: string;
  description: string | null;
  /** Short eyebrow pill shown above the title (e.g. "CEO WELCOME"). Falls back to a type-based default when unset. */
  badgeLabel?: string | null;
  isActive: boolean;
  videoUrl?: string | null;
  videoDurationSeconds?: number | null;
  prereadUrl?: string | null;
  prereadBody?: string | null;
  questions?: QuizQuestion[];
  /** Number of questions in a quiz item, populated by listCohortContent for the Prepare page. */
  questionCount?: number;
}

export interface UserPrepareProgress {
  contentItemId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completedAt?: string | null;
  /** Only present for quiz items with at least one attempt. */
  lastScore?: number | null;
  lastTotalQuestions?: number | null;
}
