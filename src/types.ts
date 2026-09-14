export type UserRole = 'student' | 'teacher' | 'principal';

export type Grade = '9' | '10' | '11' | '12';
export type Stream = 'Natural' | 'Social';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  image?: string;
}

export interface QuizData {
  id: string;
  subject: string;
  grade: Grade;
  stream: Stream;
  section?: string;
  questions: QuizQuestion[];
  timeLimit: number; // in seconds
  createdAt: string;
  updatedAt?: string;
  teacherId?: string;
  teacherEmail?: string;
  teacherName?: string;
}

export interface QuizScore {
  id?: string;
  studentId?: string;
  quizId?: string;
  studentName: string;
  grade: string;
  stream: string;
  sec: string;
  subject: string;
  score: number;
  correctCount: number;
  total: number;
  qualifiesForTop5?: boolean;
  timestamp: string;
}

export interface NationalExam {
  id: string;
  year: string;
  stream: Stream;
  subject: string;
  questions: QuizQuestion[];
  timeLimit: number;
}

export const EXAM_YEARS = ['2016', '2015', '2014', '2013', '2012'];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: any;
  grade?: string;
  section?: string;
  stream?: Stream;
  gender?: 'Male' | 'Female';
  photoUrl?: string;
  studentID?: string;
  subjects?: string[];
  marks?: { [subject: string]: number };
  totalQuizPoints?: number;
  assignedClasses?: string[];
  pendingClassRequests?: string[];
  completedQuizIds?: string[];
}

export interface GlobalSettings {
  disableTeacherRegistration: boolean;
  schoolName?: string;
  gateImageUrl?: string; // Fallback
  studentGateImageUrl?: string;
  teacherGateImageUrl?: string;
  teacherAccessKey?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: string;
  imageUrl?: string;
  audience?: 'public' | 'inschool';
}

export interface StudentRecord {
  id?: string;
  uid?: string;
  studentID: string;
  name: string;
  password?: string;
  gender: 'Male' | 'Female';
  grade: string;
  section: string;
  stream: Stream;
  photoUrl?: string;
  marks?: { [subject: string]: number };
  status: string;
}
