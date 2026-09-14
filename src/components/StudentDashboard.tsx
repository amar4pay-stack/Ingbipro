import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, orderBy, limit, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserProfile, StudentRecord, QuizData, NewsItem, GlobalSettings, QuizScore } from '../types';
import { 
  GraduationCap, 
  BookOpen, 
  Trophy, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ChevronRight, 
  Newspaper, 
  Calendar,
  User,
  Star,
  Award,
  Zap,
  Loader2,
  BookOpenCheck,
  ClipboardCheck,
  Activity,
  Pencil,
  ChevronLeft,
  LayoutGrid,
  Medal,
  Crown,
  Flame,
  Layers,
  X,
  Lock,
  CheckCircle2,
  CalendarCheck,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

import { SmartQuizView } from './SmartQuizView';

export default function StudentDashboard({ user }: { user: UserProfile }) {
  const [view, setView] = useState<'menu' | 'quizzes' | 'tests' | 'grades' | 'report' | 'attendance'>('menu');
  const [quizzes, setQuizzes] = useState<QuizData[]>([]);
  const [nationalExams, setNationalExams] = useState<any[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizData | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizTimeLeft, setQuizTimeLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [quizResult, setQuizResult] = useState<{ 
    pointsEarned: number;
    correctCount: number;
    total: number;
    qualifiesForTop5: boolean;
    newTotalPoints: number;
    fifthPlaceScore: number;
  } | null>(null);
  const [takenScores, setTakenScores] = useState<QuizScore[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [alreadyCompletedNotice, setAlreadyCompletedNotice] = useState<{
    subject: string;
    score: number;
    correctCount: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user.grade) return;

    // Listen for quizzes for this student's class (strictly locked to their logged-in Grade & Section)
    const quizzesQuery = query(
      collection(db, 'quizzes'), 
      where('grade', '==', user.grade)
    );
    
    const unsubQuizzes = onSnapshot(quizzesQuery, (snapshot) => {
      const studentSec = (user.section || '').trim().toUpperCase();
      const quizList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as QuizData))
        .filter(q => {
          // Strictly deliver only to the class they logged in to
          const quizSec = (q.section || '').trim().toUpperCase();
          if (quizSec && studentSec) {
            return quizSec === studentSec;
          }
          return !quizSec || quizSec === studentSec;
        });
      setQuizzes(quizList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'quizzes');
    });

    // Listen for quizzes already taken by this student (no retakes allowed)
    const unsubScores = onSnapshot(collection(db, 'quizScores'), (snapshot) => {
      const allScores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizScore));
      const myScores = allScores.filter(s => 
        (s.studentId && (s.studentId === user.uid || (user.studentID && s.studentId === user.studentID))) ||
        (s.studentName && s.studentName === user.displayName)
      );
      setTakenScores(myScores);
    }, (error) => {
      console.warn("Could not fetch quiz scores", error);
    });

    // Listen for attendance records for student's class
    const attQuery = query(
      collection(db, 'attendance'),
      where('grade', '==', user.grade),
      where('section', '==', user.section)
    );
    const unsubAtt = onSnapshot(attQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttendanceRecords(list);
    }, (err) => {
      console.warn('Could not fetch attendance records', err);
    });

    // Listen for national exams
    const unsubExams = onSnapshot(collection(db, 'nationalExams'), (snapshot) => {
      const examList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNationalExams(examList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'nationalExams');
    });

    // Listen for news (In-School Only)
    const newsQuery = query(collection(db, 'news'), orderBy('date', 'desc'), limit(10));
    const unsubNews = onSnapshot(newsQuery, (snapshot) => {
      const newsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      const inSchoolNews = newsList.filter(item => item.audience !== 'public');
      setNews(inSchoolNews);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'news');
    });

    // Listen for global settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as GlobalSettings);
      }
    }, (error) => {
      console.warn("Could not fetch global settings", error);
    });

    return () => {
      unsubQuizzes();
      unsubScores();
      unsubAtt();
      unsubNews();
      unsubSettings();
      unsubExams();
    };
  }, [user.grade, user.section, user.stream, user.uid, user.displayName, user.studentID]);

  // Quiz Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeQuiz && quizTimeLeft > 0) {
      timer = setInterval(() => {
        setQuizTimeLeft(prev => {
          if (prev <= 1) {
            handleQuizSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeQuiz, quizTimeLeft]);

  const getQuizTakenRecord = (quiz: QuizData) => {
    return takenScores.find(s => 
      (s.quizId && s.quizId === quiz.id) ||
      (s.subject && s.subject.toUpperCase() === quiz.subject.toUpperCase() && (!s.grade || s.grade === user.grade))
    );
  };

  const startQuiz = (quiz: QuizData) => {
    // Rule: Don't allow student to retake the quizzes
    const prev = getQuizTakenRecord(quiz);
    if (prev) {
      setAlreadyCompletedNotice({
        subject: quiz.subject,
        score: prev.score,
        correctCount: prev.correctCount,
        total: prev.total
      });
      return;
    }

    setActiveQuiz(quiz);
    setQuizAnswers({});
    setQuizTimeLeft(quiz.timeLimit > 0 ? quiz.timeLimit : 0);
    setQuizResult(null);
  };

  const handleQuizSubmit = async () => {
    if (!activeQuiz || isSubmitting) return;
    setIsSubmitting(true);

    try {
      let correctCount = 0;
      activeQuiz.questions.forEach((q, idx) => {
        if (quizAnswers[idx] === q.correctAnswer) {
          correctCount++;
        }
      });

      // RULE 1: GIVE 10 POINT PER 1 CORRECT ANSWER DURING QUIZZES
      const pointsEarned = correctCount * 10;

      // RULE 2: Check if student points qualify them for the Top 5 Student Score
      const topQuery = query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        orderBy('totalQuizPoints', 'desc'),
        limit(5)
      );
      const topSnap = await getDocs(topQuery);
      const currentTopList = topSnap.docs
        .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
        .filter(s => (s.totalQuizPoints || 0) > 0);

      const currentPoints = user.totalQuizPoints || 0;
      const newTotalPoints = currentPoints + pointsEarned;

      let qualifiesForTop5 = false;
      let fifthPlaceScore = 0;

      if (newTotalPoints > 0) {
        if (currentTopList.length < 5) {
          // If fewer than 5 students currently have scores, any positive score enters Top 5
          qualifiesForTop5 = true;
        } else {
          // Check if current user is already in top 5
          const userInTop5 = currentTopList.some(s => s.uid === user.uid);
          if (userInTop5) {
            qualifiesForTop5 = true;
          } else {
            fifthPlaceScore = currentTopList[4]?.totalQuizPoints || 0;
            if (newTotalPoints > fifthPlaceScore) {
              qualifiesForTop5 = true;
            }
          }
        }
      }

      // Save score record to quizScores collection (locks retakes and records performance)
      await addDoc(collection(db, 'quizScores'), {
        studentId: user.uid,
        studentName: user.displayName,
        grade: user.grade,
        stream: user.stream || 'Natural Science',
        sec: user.section,
        subject: activeQuiz.subject,
        quizId: activeQuiz.id,
        score: pointsEarned,
        correctCount,
        total: activeQuiz.questions.length,
        qualifiesForTop5,
        timestamp: new Date().toISOString()
      });

      // RULE 2: Put their name and point on Top student score ONLY IF the point can get them into top 5!
      if (qualifiesForTop5) {
        await updateDoc(doc(db, 'users', user.uid), {
          totalQuizPoints: newTotalPoints
        });
        if (user.studentID) {
          try {
            const stuRef = doc(db, 'students', user.studentID);
            const stuSnap = await getDoc(stuRef);
            if (stuSnap.exists()) {
              await updateDoc(stuRef, { totalQuizPoints: newTotalPoints });
            }
          } catch (e) {
            console.warn('Could not sync student document score', e);
          }
        }
      }

      setQuizResult({ 
        pointsEarned, 
        correctCount, 
        total: activeQuiz.questions.length,
        qualifiesForTop5,
        newTotalPoints,
        fifthPlaceScore
      });
      setActiveQuiz(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'quizScores');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-neon-cyan border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const MenuCard = ({ icon: Icon, title, onClick, color }: { icon: any, title: string, onClick: () => void, color: string }) => (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative group overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-8 text-left transition-all hover:bg-white/[0.08] hover:border-white/20"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-black italic uppercase tracking-tight text-white mb-1">{title}</h3>
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Access <ChevronRight className="inline w-2 h-2 ml-0.5" /></p>
      
      {/* Decorative background element */}
      <div className={`absolute -bottom-4 -right-4 w-16 h-16 opacity-5 transition-opacity group-hover:opacity-10 ${color}`}>
        <Icon className="w-full h-full" />
      </div>
    </motion.button>
  );

  return (
    <div className="max-w-3xl mx-auto p-3 space-y-4">
      {/* Profile Section at Top */}
      <header className="relative p-6 rounded-3xl overflow-hidden bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col items-center text-center">
        {/* Gate Image Background */}
        {settings?.gateImageUrl && (
          <div className="absolute inset-0 z-0 opacity-10">
            <img 
              src={settings.gateImageUrl} 
              alt="School" 
              className="w-full h-full object-cover grayscale"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-dark-bg/50 to-dark-bg" />
          </div>
        )}
        
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <GraduationCap className="w-24 h-24 text-neon-cyan" />
        </div>
        
        <div className="relative z-10 flex flex-col items-center">
          {/* Student Photo */}
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-neon-cyan/30 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-stone-800 flex items-center justify-center text-stone-500">
                  <User className="w-10 h-10" />
                </div>
              )}
            </div>
            <button className="absolute bottom-0 right-0 w-7 h-7 bg-neon-cyan text-black rounded-full flex items-center justify-center border-2 border-dark-bg hover:scale-110 transition-transform">
              <Pencil className="w-3 h-3" />
            </button>
          </div>

          {/* Student Info */}
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-1">{user.displayName}</h1>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-1.5">
              <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Grade</span>
              <span className="text-[10px] font-black text-neon-cyan">{user.grade}</span>
            </div>
            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-1.5">
              <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Section</span>
              <span className="text-[10px] font-black text-neon-cyan">{user.section}</span>
            </div>
            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-1.5">
              <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">ID</span>
              <span className="text-[10px] font-black text-neon-cyan">{user.studentID || 'STU0000'}</span>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'menu' ? (
          <motion.div 
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 py-4"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MenuCard 
              icon={BookOpenCheck} 
              title="Practice Quiz" 
              onClick={() => setView('quizzes')} 
              color="bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30"
            />
            <MenuCard 
              icon={CalendarCheck} 
              title="Attendance" 
              onClick={() => setView('attendance')} 
              color="bg-amber-500/20 text-amber-500 border-amber-500/30"
            />
            <MenuCard 
              icon={Newspaper} 
              title="School News" 
              onClick={() => setView('news' as any)} 
              color="bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
            />
            <MenuCard 
              icon={ClipboardCheck} 
              title="Entrance Simulation" 
              onClick={() => setView('tests')} 
              color="bg-neon-blue/20 text-neon-blue border-neon-blue/30"
            />
            <MenuCard 
              icon={Trophy} 
              title="My Grades" 
              onClick={() => setView('grades')} 
              color="bg-neon-purple/20 text-neon-purple border-neon-purple/30"
            />
            <MenuCard 
              icon={Activity} 
              title="Report" 
              onClick={() => setView('report')} 
              color="bg-red-500/20 text-red-500 border-red-500/30"
            />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setView('menu')}
                className="flex items-center gap-2 text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Menu
              </button>
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-neon-cyan" />
                <h2 className="font-black text-white uppercase text-sm tracking-widest">{view.replace('_', ' ')}</h2>
              </div>
            </div>

            {/* View Content */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 min-h-[300px]">
              {view === 'quizzes' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black italic uppercase tracking-tighter text-neon-cyan">Practice Quizzes</h3>
                      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Select a subject to start immediately</p>
                    </div>
                    <div className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full">
                      <span className="text-[8px] font-black text-neon-cyan uppercase tracking-widest">Grade {user.grade} • Section {user.section || 'A'}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {quizzes.length === 0 ? (
                      <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-3xl">
                        <BookOpen className="w-10 h-10 text-stone-800 mx-auto mb-3" />
                        <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">No active quizzes for your class (Grade {user.grade} - Sec {user.section || 'A'})</p>
                      </div>
                    ) : (
                      Array.from(new Set(quizzes.map(q => q.subject))).map((subject) => {
                        const subjectQuizzes = quizzes.filter(q => q.subject === subject);
                        const latestQuiz = subjectQuizzes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        const takenRecord = getQuizTakenRecord(latestQuiz);
                        const isCompleted = !!takenRecord;
                        
                        return (
                          <motion.button
                            key={subject}
                            whileHover={{ scale: isCompleted ? 1 : 1.02, x: isCompleted ? 0 : 4 }}
                            whileTap={{ scale: isCompleted ? 1 : 0.98 }}
                            onClick={() => startQuiz(latestQuiz)}
                            className={`group relative flex items-center justify-between p-6 rounded-2xl border transition-all text-left ${
                              isCompleted 
                                ? 'bg-white/[0.02] border-emerald-500/20 hover:border-emerald-500/40' 
                                : 'bg-white/5 border-white/10 hover:bg-neon-cyan/5 hover:border-neon-cyan/30'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-transform ${
                                isCompleted
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20 group-hover:scale-110'
                              }`}>
                                {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <BookOpenCheck className="w-6 h-6" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className={`text-lg font-black italic uppercase tracking-tight transition-colors ${
                                    isCompleted ? 'text-stone-300' : 'text-white group-hover:text-neon-cyan'
                                  }`}>
                                    {subject}
                                  </h4>
                                  {isCompleted && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5" /> Completed
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  {isCompleted ? (
                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                      Score: {takenRecord.score} pts • {takenRecord.correctCount}/{takenRecord.total} Correct (No Retakes)
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1">
                                        <Layers className="w-2 h-2" /> {latestQuiz.questions.length} Questions
                                      </span>
                                      <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1">
                                        <Clock className="w-2 h-2" /> {latestQuiz.timeLimit > 0 ? `${Math.floor(latestQuiz.timeLimit / 60)}m` : 'No Limit'}
                                      </span>
                                      <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">
                                        • 10 pts / correct
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              isCompleted
                                ? 'bg-white/5 text-stone-500'
                                : 'bg-white/5 text-stone-600 group-hover:bg-neon-cyan group-hover:text-black'
                            }`}>
                              {isCompleted ? <Lock className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4" />}
                            </div>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {(view as any) === 'news' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-black italic uppercase tracking-tighter">School Announcements</h3>
                  <div className="space-y-4">
                    {news.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px]">No news posted yet</p>
                      </div>
                    ) : (
                      news.map((item) => (
                        <div key={item.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                          {item.imageUrl && (
                            <div className="aspect-video w-full overflow-hidden">
                              <img 
                                src={item.imageUrl} 
                                alt={item.title} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-black italic uppercase tracking-tight text-neon-cyan">{item.title}</h4>
                              <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">
                                {new Date(item.date).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[10px] text-stone-400 font-medium leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {view === 'tests' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-black italic uppercase tracking-tighter text-neon-blue">Entrance Simulation</h3>
                    <div className="px-3 py-1 bg-neon-blue/10 border border-neon-blue/20 rounded-full">
                      <span className="text-[8px] font-black text-neon-blue uppercase tracking-widest">National Exam Prep</span>
                    </div>
                  </div>

                  <SmartQuizView 
                    quizzes={quizzes} 
                    nationalExams={nationalExams} 
                    currentUser={user as any} 
                    isExamSimMode={true} 
                  />
                </div>
              )}

              {view === 'grades' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-black italic uppercase tracking-tighter">My Performance</h3>
                  <div className="grid gap-3">
                    {Object.keys(user.marks || {}).length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px]">No marks recorded yet</p>
                      </div>
                    ) : (
                      Object.entries(user.marks || {}).map(([subject, mark]) => (
                        <div key={subject} className="bg-white/5 p-3 rounded-2xl border border-white/10">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-black italic uppercase tracking-tight">{subject}</span>
                            <span className="text-sm font-black text-neon-cyan">{mark}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${mark}%` }}
                              className="h-full bg-neon-cyan shadow-[0_0_10px_rgba(0,229,255,0.5)]"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {view === 'report' && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Activity className="w-12 h-12 text-red-500 mb-3 opacity-20" />
                  <h3 className="text-lg font-black italic uppercase tracking-tighter mb-1">Student Report</h3>
                  <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px] max-w-[150px]">
                    Detailed academic reports and feedback will be generated here.
                  </p>
                </div>
              )}

              {view === 'attendance' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black italic uppercase tracking-tighter text-amber-400">Class Attendance</h3>
                      <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">
                        Official Roll Call History • Grade {user.grade}th {user.section}
                      </p>
                    </div>
                    <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                        {attendanceRecords.length} Sessions Logged
                      </span>
                    </div>
                  </div>

                  {attendanceRecords.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-white/10 rounded-3xl">
                      <CalendarCheck className="w-10 h-10 text-stone-700 mx-auto mb-3" />
                      <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                        No roll call attendance records recorded yet by your teacher
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {attendanceRecords.map((record) => {
                        // Check if student was present or absent in this record
                        const studentEntry = record.records?.[user.uid] || 
                          (user.studentID && record.records?.[user.studentID]) || 
                          (record.records && Object.entries(record.records).find(([key, val]: [string, any]) => 
                            val?.studentId === user.uid || val?.studentName === user.displayName
                          )?.[1]);
                        
                        const isPresent = studentEntry?.status === 'present' || studentEntry === 'present';
                        const isAbsent = studentEntry?.status === 'absent' || studentEntry === 'absent';
                        const isPending = !isPresent && !isAbsent;

                        return (
                          <div 
                            key={record.id} 
                            className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.08] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                                isPresent 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : isAbsent 
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                  : 'bg-stone-800 text-stone-400 border-white/10'
                              }`}>
                                {isPresent ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-black italic uppercase tracking-tight text-white">
                                    {record.date ? new Date(record.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Session Record'}
                                  </h4>
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                    isPresent 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                      : isAbsent 
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                                      : 'bg-stone-800 text-stone-400'
                                  }`}>
                                    {isPresent ? 'Present' : isAbsent ? 'Absent' : 'Unrecorded'}
                                  </span>
                                </div>
                                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-0.5">
                                  Teacher: {record.teacherName || record.teacherEmail || 'Assigned Instructor'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-mono text-stone-400">
                                {record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz Result Modal */}
      <AnimatePresence>
        {quizResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-[#0E131F] rounded-3xl p-6 text-center border border-white/10 shadow-2xl relative overflow-hidden"
            >
              {quizResult.qualifiesForTop5 ? (
                <>
                  <div className="w-16 h-16 bg-amber-500/15 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                    <Crown className="w-8 h-8 animate-bounce" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-[9px] font-black text-amber-300 uppercase tracking-widest mb-2">
                    🏆 Qualified For Top 5 Student Score!
                  </div>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-1">
                    Outstanding Job!
                  </h2>
                  <p className="text-stone-400 text-xs font-medium mb-6">
                    You scored <strong className="text-amber-400">{quizResult.pointsEarned} pts</strong> (10 pts per correct answer). Your total of <strong className="text-neon-cyan">{quizResult.newTotalPoints} pts</strong> places you on the official Elite Top 5 Leaderboard!
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-neon-cyan/10 text-neon-cyan rounded-full flex items-center justify-center mx-auto mb-4 border border-neon-cyan/20">
                    <Trophy className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-white mb-1">Quiz Completed!</h2>
                  <p className="text-stone-400 text-xs font-medium mb-6">
                    You earned <strong className="text-neon-cyan">{quizResult.pointsEarned} pts</strong> (10 pts per correct answer).
                    {quizResult.fifthPlaceScore > 0 ? (
                      <span className="block text-[10px] text-stone-500 mt-1 font-normal">
                        To enter the Top 5 Student Score, more than {quizResult.fifthPlaceScore} pts are needed.
                      </span>
                    ) : (
                      <span className="block text-[10px] text-stone-500 mt-1 font-normal">
                        Keep answering quizzes to climb the ranks!
                      </span>
                    )}
                  </p>
                </>
              )}
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                  <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-0.5">Points Earned</p>
                  <p className="text-2xl font-black text-neon-cyan">+{quizResult.pointsEarned}</p>
                  <p className="text-[8px] text-stone-400">10 pts / correct</p>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                  <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-0.5">Correct Answers</p>
                  <p className="text-2xl font-black text-white">{quizResult.correctCount} / {quizResult.total}</p>
                  <p className="text-[8px] text-emerald-400 font-bold">Retakes Locked</p>
                </div>
              </div>

              <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl mb-4 text-[9px] text-stone-400 text-left flex items-start gap-2">
                <Lock className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                <span>Quiz results are permanently recorded. Retakes are not permitted in order to safeguard Top Student score integrity.</span>
              </div>

              <button 
                onClick={() => setQuizResult(null)}
                className="w-full bg-neon-cyan text-black py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 transition-all shadow-lg shadow-neon-cyan/20"
              >
                Close Report
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Already Completed Modal Notice */}
      <AnimatePresence>
        {alreadyCompletedNotice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs bg-stone-900 rounded-3xl p-6 text-center border border-white/10 shadow-2xl"
            >
              <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black italic uppercase tracking-tighter text-white mb-1">
                Quiz Already Completed
              </h2>
              <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-4">
                {alreadyCompletedNotice.subject} Assessment
              </p>
              
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-5 text-left space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">Your Score:</span>
                  <span className="font-black text-neon-cyan">{alreadyCompletedNotice.score} pts</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-400">Correct Answers:</span>
                  <span className="font-bold text-white">{alreadyCompletedNotice.correctCount} / {alreadyCompletedNotice.total}</span>
                </div>
                <div className="pt-2 border-t border-white/5 text-[9px] text-amber-300/80 leading-snug">
                  Students are not permitted to retake quizzes. Your score is already permanently locked.
                </div>
              </div>

              <button 
                onClick={() => setAlreadyCompletedNotice(null)}
                className="w-full bg-white/10 text-white hover:bg-white/20 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all"
              >
                Understood
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Quiz Interface */}
      <AnimatePresence>
        {activeQuiz && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0B0F19] overflow-y-auto font-sans"
          >
            <div className="max-w-3xl mx-auto p-4 py-8">
              <header className="flex items-center justify-between mb-8 sticky top-0 bg-[#0B0F19]/90 backdrop-blur-md py-4 z-10 border-b border-white/10 px-4 rounded-b-2xl">
                <div>
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-[#00F2FE]">{activeQuiz.subject}</h2>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] mt-0.5">
                    FINAL ASSESSMENT • 10 PTS / CORRECT
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-xl font-mono font-black text-lg border ${activeQuiz.timeLimit > 0 && quizTimeLeft < 60 ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' : 'bg-white/5 text-[#00F2FE] border-[#00F2FE]/20'}`}>
                    {activeQuiz.timeLimit > 0 ? formatTime(quizTimeLeft) : 'NO LIMIT'}
                  </div>
                  {/* Allow Student to exit Taking attendance while taking quiz */}
                  <button
                    onClick={() => setShowExitConfirm(true)}
                    className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition-colors"
                    title="Exit Quiz"
                  >
                    <X className="w-4 h-4" />
                    <span>Exit</span>
                  </button>
                </div>
              </header>

              {/* Master 16:9 Media Display Banner */}
              <div className="w-full aspect-[16/9] mb-8 relative rounded-[12px] overflow-hidden border border-white/10 bg-[#090D16] shadow-[inset_0_4px_24px_rgba(0,0,0,0.8)] flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B0F19] via-[#111827] to-[#0B0F19] flex flex-col items-center justify-center p-6 text-[#00F2FE]/25 select-none overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] opacity-45" />
                  
                  <div className="relative z-10 w-20 h-20 rounded-full border border-[#00F2FE]/10 flex items-center justify-center shadow-[0_0_50px_rgba(0,242,254,0.03)] mb-3">
                    <div className="absolute inset-0 rounded-full border border-dashed border-[#00F2FE]/15 animate-[spin_60s_linear_infinite]" />
                    <div className="absolute inset-2 rounded-full border border-double border-[#00F2FE]/20 animate-[spin_30s_linear_infinite_reverse]" />
                    <BookOpen className="w-8 h-8 text-[#00F2FE]/30 animate-pulse" />
                  </div>
                  
                  <span className="relative z-10 text-[#00F2FE]/40 font-mono text-[9px] uppercase tracking-[0.3em] font-black leading-none text-center">
                    {activeQuiz.subject.toUpperCase()} ASSESSMENT RESOURCE
                  </span>
                </div>
                {/* Inner shadow overlay */}
                <div className="absolute inset-0 pointer-events-none rounded-[12px] border border-white/5 shadow-[inset_0_4px_30px_rgba(0,0,0,0.9)]" />
              </div>

              <div className="space-y-10 pb-24">
                {activeQuiz.questions.map((q, qIdx) => (
                  <div key={qIdx} className="space-y-4 bg-[#0F1422] p-6 rounded-2xl border border-white/5 shadow-inner">
                    <div className="flex gap-4">
                      <span className="w-8 h-8 bg-[#00F2FE]/10 rounded-xl flex items-center justify-center text-xs font-black text-[#00F2FE] border border-[#00F2FE]/20 shrink-0">
                        {qIdx + 1}
                      </span>
                      <h3 className="text-lg font-semibold text-[#F8FAFC] leading-relaxed tracking-wide whitespace-pre-wrap">{q.question}</h3>
                    </div>

                    {q.image && (
                      <div className="w-full aspect-[16/9] relative rounded-xl overflow-hidden border border-white/10 bg-[#090D16] shadow-[inset_0_4px_24px_rgba(0,0,0,0.8)] flex items-center justify-center my-4">
                        <img 
                          src={q.image} 
                          alt="Question Resource" 
                          className="w-full h-full object-contain p-2 transition-transform duration-500 hover:scale-102" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-xl border border-white/5 shadow-[inset_0_4px_16px_rgba(0,0,0,0.9)]" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px] mt-4">
                      {q.options.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                          className={`w-full text-left px-5 py-4 rounded-xl font-semibold transition-all border-2 text-sm flex items-center gap-4 ${
                            quizAnswers[qIdx] === oIdx 
                              ? 'bg-[#00F2FE]/15 text-[#F8FAFC] border-[#00F2FE] shadow-lg shadow-[#00F2FE]/10' 
                              : 'bg-white/5 text-stone-400 border-white/5 hover:bg-white/10 hover:border-[#00F2FE]/30 hover:text-white'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-xs font-black shrink-0 transition-colors ${
                            quizAnswers[qIdx] === oIdx
                              ? 'bg-[#00F2FE] text-black border-[#00F2FE]'
                              : 'border-white/10 text-stone-400'
                          }`}>
                            {String.fromCharCode(65 + oIdx)}
                          </div>
                          <span className="flex-1 leading-snug">{opt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <footer className="fixed bottom-0 left-0 right-0 p-4 bg-[#0B0F19]/90 backdrop-blur-md border-t border-white/10 z-10 rounded-t-2xl shadow-2xl">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <button 
                    onClick={() => setShowExitConfirm(true)}
                    className="px-6 py-4 bg-white/5 text-stone-400 border border-white/10 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    Exit Quiz
                  </button>
                  <button 
                    onClick={handleQuizSubmit}
                    disabled={isSubmitting || Object.keys(quizAnswers).length < activeQuiz.questions.length}
                    className="flex-1 bg-[#00F2FE] text-black py-4 rounded-xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-[#00F2FE]/20"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Assessment'}
                  </button>
                </div>
              </footer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs bg-stone-900 rounded-3xl p-8 text-center border border-white/10 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black italic uppercase tracking-tighter mb-2">Exit Quiz?</h2>
              <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px] mb-8 leading-relaxed">
                Your current quiz session will be closed and you will return to your student dashboard. Progress is not submitted.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    setActiveQuiz(null);
                    setShowExitConfirm(false);
                  }}
                  className="w-full bg-red-500 text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 transition-all"
                >
                  Yes, Exit Quiz
                </button>
                <button 
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full bg-white/5 text-stone-400 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
                >
                  No, Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
