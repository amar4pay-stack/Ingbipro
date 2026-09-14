import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QuizQuestion, QuizData, Grade, Stream, StudentRecord, QuizScore, NationalExam, EXAM_YEARS, UserProfile } from '../types';
import { BookOpen, Trophy, ChevronLeft, Timer, GraduationCap, Layers, AlertCircle, Zap, CheckCircle2, XCircle, Loader2, Save, X, Lock, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, query, onSnapshot, where, orderBy, limit, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface SmartQuizViewProps {
  quizzes: QuizData[];
  nationalExams: NationalExam[];
  currentUser?: StudentRecord | null;
  isExamSimMode?: boolean;
}

export function SmartQuizView({ quizzes, nationalExams, currentUser, isExamSimMode = false }: SmartQuizViewProps) {
  const [activeGrade, setActiveGrade] = useState<Grade | null>(isExamSimMode ? '12' : null);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [targetQuestionCount, setTargetQuestionCount] = useState<number | null>(null);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [qualifiesForTop5, setQualifiesForTop5] = useState(false);
  
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [animatedScore, setAnimatedScore] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [allScores, setAllScores] = useState<QuizScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'quizScores'));
    const unsub = onSnapshot(q, (snapshot) => {
      const scores = snapshot.docs.map(doc => doc.data() as QuizScore);
      setAllScores(scores);
      setScoresLoading(false);
    });
    return () => unsub();
  }, []);
  
  const isAlreadyTaken = useMemo(() => {
    if (!currentUser || !activeSubject || quizFinished) return false;
    const currentId = currentUser.studentID || currentUser.id || currentUser.uid;
    return allScores.some(s => 
      (s.studentName === currentUser.name || (currentId && s.studentId === currentId)) && 
      s.subject.toLowerCase() === activeSubject.toLowerCase() && 
      (!s.grade || s.grade === activeGrade)
    );
  }, [allScores, currentUser, activeSubject, activeGrade, quizFinished]);

  const rawQuestions = useMemo(() => {
    if (isExamSimMode) {
      if (!activeYear || !activeStream || !activeSubject) return [];
      const exam = nationalExams.find(e => 
        e.year === activeYear && 
        e.stream === activeStream && 
        (e.subject.toLowerCase() === activeSubject.toLowerCase() || e.id.includes(activeSubject.replace(/\s/g, '_')))
      );
      return exam?.questions || [];
    } else {
      if (!activeGrade || !activeStream || !activeSubject) return [];
      const quiz = quizzes.find(q => q.grade === activeGrade && q.stream === activeStream && q.subject === activeSubject);
      return quiz?.questions || [];
    }
  }, [isExamSimMode, activeGrade, activeStream, activeYear, activeSubject, quizzes, nationalExams]);

  const currentQuestions = useMemo(() => {
    if (!targetQuestionCount) return rawQuestions;
    return rawQuestions.slice(0, targetQuestionCount);
  }, [rawQuestions, targetQuestionCount]);

  const timeLimit = useMemo(() => {
    if (isExamSimMode) {
      const exam = nationalExams.find(e => 
        e.year === activeYear && 
        e.stream === activeStream && 
        (e.subject.toLowerCase() === activeSubject.toLowerCase() || e.id.includes(activeSubject.replace(/\s/g, '_')))
      );
      const baseLimit = exam?.timeLimit || 3600;
      if (targetQuestionCount && rawQuestions.length > 0) {
        return Math.floor((baseLimit / rawQuestions.length) * targetQuestionCount);
      }
      return baseLimit;
    } else {
      if (!activeGrade || !activeStream || !activeSubject) return 0;
      const quiz = quizzes.find(q => q.grade === activeGrade && q.stream === activeStream && q.subject === activeSubject);
      return quiz?.timeLimit || 0;
    }
  }, [isExamSimMode, activeGrade, activeStream, activeYear, activeSubject, quizzes, nationalExams, targetQuestionCount, rawQuestions]);

  useEffect(() => {
    if (activeSubject && targetQuestionCount && !quizFinished && !feedback && !isAlreadyTaken && timeLimit > 0) {
      if (currentQuestionIndex === 0 && (timeLeft === 30 || timeLeft === 0)) setTimeLeft(timeLimit);
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSubject, targetQuestionCount, currentQuestionIndex, quizFinished, feedback, isAlreadyTaken, timeLimit]);

  useEffect(() => {
    if (quizFinished && currentQuestions.length > 0) {
      const correctCount = selectedAnswers.reduce((acc, ans, idx) => acc + (ans === (currentQuestions[idx]?.correctAnswer ?? -2) ? 1 : 0), 0);
      // RULE 1: GIVE 10 POINT PER 1 CORRECT ANSWER DURING QUIZZES
      const pointsEarned = correctCount * 10;

      const recordQuizCompletion = async () => {
        let isTop5 = false;
        try {
          // Check if points qualify for Top 5
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

          if (pointsEarned > 0) {
            if (currentTopList.length < 5) {
              isTop5 = true;
            } else {
              const fifthPlace = currentTopList[4]?.totalQuizPoints || 0;
              if (pointsEarned > fifthPlace) {
                isTop5 = true;
              }
            }
          }
          setQualifiesForTop5(isTop5);

          const studentDocId = currentUser?.uid || currentUser?.id;
          const studentIdentifier = currentUser?.studentID || studentDocId;

          const scoreData: QuizScore = {
            studentName: currentUser?.name || "STUDENT",
            studentId: studentIdentifier,
            grade: activeGrade || "12",
            stream: activeStream || "Natural",
            sec: currentUser?.section || "A",
            subject: activeSubject || "Test",
            score: pointsEarned,
            correctCount: correctCount,
            total: currentQuestions.length,
            qualifiesForTop5: isTop5,
            timestamp: new Date().toISOString()
          };
          
          await addDoc(collection(db, 'quizScores'), scoreData);

          // RULE 2: Only update user's totalQuizPoints on leaderboard if they qualify for Top 5!
          if (isTop5) {
            if (studentDocId) {
              try {
                await updateDoc(doc(db, 'users', studentDocId), {
                  totalQuizPoints: increment(pointsEarned)
                });
              } catch (e) {
                console.warn('Could not update users doc', e);
              }
            } else if (currentUser?.studentID) {
              // Search user by studentID
              try {
                const uq = query(collection(db, 'users'), where('studentID', '==', currentUser.studentID));
                const uSnap = await getDocs(uq);
                uSnap.forEach(async (d) => {
                  await updateDoc(d.ref, { totalQuizPoints: increment(pointsEarned) });
                });
              } catch (e) {
                console.warn('Could not update user by studentID', e);
              }
            }
          }
        } catch (err) {
          console.warn('Could not record quiz score', err);
        }
      };

      recordQuizCompletion();

      let start = 0;
      const duration = 2000;
      const incrementVal = Math.max(1, pointsEarned / (duration / 50));
      const timer = setInterval(() => {
        start += incrementVal;
        if (start >= pointsEarned) {
          setAnimatedScore(pointsEarned);
          clearInterval(timer);
        } else {
          setAnimatedScore(Math.floor(start));
        }
      }, 50);
      return () => clearInterval(timer);
    }
  }, [quizFinished, currentQuestions.length, selectedAnswers, currentUser, activeGrade, activeStream, activeSubject]);

  const handleAutoSubmit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = -1;
    setSelectedAnswers(newAnswers);
    setFeedback('wrong');
  };

  const startQuiz = (grade: Grade, stream: Stream, subject: string, year?: string) => {
    setActiveGrade(grade);
    setActiveStream(stream);
    setActiveSubject(subject);
    if (year) setActiveYear(year);
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setQuizFinished(false);
    setFeedback(null);
    setTargetQuestionCount(null);
  };

  const handleAnswerSelect = (value: string) => {
    if (feedback || isAlreadyTaken) return;
    const currentQ = currentQuestions[currentQuestionIndex];
    if (!currentQ) return;

    const answerIndex = parseInt(value);
    const isCorrect = answerIndex === currentQ.correctAnswer;
    
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
    setFeedback(isCorrect ? 'correct' : 'wrong');
  };

  const nextQuestion = () => {
    setFeedback(null);
    if (currentQuestionIndex < currentQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
    }
  };

  const resetQuiz = () => {
    setActiveGrade(isExamSimMode ? '12' : null);
    setActiveStream(null);
    setActiveYear(null);
    setActiveSubject(null);
    setTargetQuestionCount(null);
    setQuizFinished(false);
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setFeedback(null);
    setAnimatedScore(0);
  };

  const goBack = () => {
    if (quizFinished) {
      resetQuiz();
      return;
    }
    if (targetQuestionCount) setTargetQuestionCount(null);
    else if (activeSubject) setActiveSubject(null);
    else if (activeYear) setActiveYear(null);
    else if (activeStream) setActiveStream(null);
    else if (activeGrade && !isExamSimMode) setActiveGrade(null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentQ = currentQuestions[currentQuestionIndex];

  const STREAM_SUBJECTS: Record<Stream, string[]> = {
    Natural: ['Physics', 'Chemistry', 'Biology', 'Maths', 'English', 'Civics'],
    Social: ['Geography', 'History', 'Economics', 'Maths', 'English', 'Civics']
  };

  return (
    <div className="w-full max-w-5xl mx-auto border border-white/10 bg-[#0B0F19] backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden rounded-[1rem] md:rounded-[2rem]">
      <div className="border-b border-white/5 relative px-3 md:px-8 py-3 md:py-4 bg-[#0B0F19]/90">
        {(activeGrade || activeStream || activeSubject) && !quizFinished && (
          <button onClick={goBack} className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white z-10 font-black uppercase text-[7px] md:text-[9px] tracking-widest bg-white/5 rounded-full px-2 md:px-4 h-6 md:h-8 flex items-center gap-1.5">
            <ChevronLeft className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" /> BACK
          </button>
        )}
        <h2 className="text-center text-xs md:text-xl font-black text-[#00F2FE] flex items-center justify-center tracking-tighter uppercase italic leading-none">
          {isExamSimMode ? <GraduationCap className="mr-1.5 md:mr-2 h-4 w-4 md:h-6 md:w-6 text-[#FFD700]" /> : <BookOpen className="mr-1.5 md:mr-2 h-4 w-4 md:h-6 md:w-6 text-[#00F2FE]" />}
          <span className="truncate">{isExamSimMode ? 'ENTRANCE SIMULATION' : 'SMART QUIZ'}</span>
        </h2>
      </div>
      
      <div className="p-3 md:p-8">
        {!currentUser && !isExamSimMode ? (
          <div className="text-center py-20 space-y-4">
             <AlertCircle className="h-16 w-16 text-neon-blue mx-auto opacity-20" />
             <p className="text-sm font-black text-stone-500 uppercase tracking-widest">Please login as a student first.</p>
          </div>
        ) : !activeGrade ? (
          <div className="grid grid-cols-2 gap-3 md:gap-6 py-2 md:py-6 max-w-xl mx-auto">
            {(['9', '10', '11', '12'] as Grade[]).map(grade => (
              <button key={grade} onClick={() => setActiveGrade(grade)} className="h-16 md:h-24 border border-white/5 bg-white/5 hover:bg-neon-blue hover:text-black font-black text-xl md:text-3xl italic transition-all duration-300 rounded-xl md:rounded-2xl group relative overflow-hidden">
                <span className="relative z-10 tracking-tighter">Grade {grade}</span>
              </button>
            ))}
          </div>
        ) : !activeStream ? (
          <div className="grid grid-cols-2 gap-3 md:gap-6 py-2 md:py-6 max-w-2xl mx-auto">
            {(['Natural', 'Social'] as Stream[]).map(stream => (
              <button key={stream} onClick={() => setActiveStream(stream)} className="h-20 md:h-28 border border-white/10 bg-white/5 hover:bg-[#FFD700] hover:text-black font-black text-base md:text-xl tracking-[0.1em] md:tracking-[0.15em] rounded-xl md:rounded-2xl transition-all">
                {stream.toUpperCase()}
              </button>
            ))}
          </div>
        ) : isExamSimMode && !activeYear ? (
          <div className="space-y-4 md:space-y-8 py-1 md:py-2 max-w-3xl mx-auto">
            <h2 className="text-center text-[8px] md:text-xs font-black text-white/50 uppercase tracking-[0.2em] md:tracking-[0.4em] italic">PICK A YEAR</h2>
            <div className="grid grid-cols-3 gap-2 md:gap-4">
              {EXAM_YEARS.map(year => (
                <button key={year} onClick={() => setActiveYear(year)} className="h-10 md:h-14 border border-white/5 bg-white/5 hover:border-[#FFD700] hover:text-[#FFD700] font-black text-base md:text-lg rounded-lg md:rounded-xl transition-all">{year}</button>
              ))}
            </div>
          </div>
        ) : !activeSubject ? (
          <div className="grid grid-cols-2 gap-2 md:gap-4 py-2 md:py-6 max-w-xl mx-auto">
            {STREAM_SUBJECTS[activeStream!].map(subject => (
              <button key={subject} onClick={() => setActiveSubject(subject)} className="h-12 md:h-16 border border-white/5 bg-white/5 hover:border-neon-blue hover:text-neon-blue font-black uppercase tracking-widest text-[10px] md:text-xs rounded-lg md:rounded-xl transition-all">{subject}</button>
            ))}
          </div>
        ) : !targetQuestionCount ? (
          <div className="space-y-4 md:space-y-8 py-2 md:py-6 max-w-xl mx-auto text-center">
            <div className="space-y-1 md:space-y-2">
              <Layers className="h-10 w-10 md:h-16 md:w-16 text-neon-blue mx-auto opacity-20" />
              <h3 className="text-xl md:text-3xl font-black text-white uppercase italic tracking-tighter">QUESTIONS</h3>
              <p className="text-[7px] md:text-[9px] text-stone-500 uppercase tracking-[0.2em] md:tracking-[0.4em] font-black">How many questions?</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {[10, 25, 50, 100].map(count => (
                <button 
                  key={count} 
                  disabled={rawQuestions.length < count && count !== 10}
                  onClick={() => setTargetQuestionCount(count)} 
                  className="h-12 md:h-20 border border-white/5 bg-white/5 hover:border-neon-blue hover:text-neon-blue font-black text-xl md:text-3xl italic rounded-lg md:rounded-xl transition-all disabled:opacity-20"
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        ) : isAlreadyTaken ? (
          <div className="text-center space-y-8 md:space-y-10 py-12 md:py-16 max-w-xl mx-auto px-4">
            <AlertCircle className="h-16 w-16 md:h-24 md:w-24 text-red-500 mx-auto opacity-30" />
            <div className="space-y-2 md:space-y-3">
              <h3 className="text-3xl md:text-5xl font-black text-white uppercase italic tracking-tighter">STOP</h3>
              <p className="text-stone-500 text-[10px] md:text-sm uppercase tracking-widest font-bold">You already finished <b>{activeSubject}</b>.</p>
            </div>
            <button onClick={goBack} className="w-full bg-neon-blue text-black font-black h-14 md:h-16 rounded-xl md:rounded-2xl text-base md:text-lg uppercase tracking-widest">GO BACK</button>
          </div>
        ) : quizFinished ? (
          <div className="text-center space-y-8 md:space-y-12 py-4 md:py-10 max-w-2xl mx-auto px-4">
             <div className="relative inline-block">
                {qualifiesForTop5 ? (
                  <>
                    <Crown className="h-20 w-20 md:h-32 md:w-32 text-amber-400 mx-auto drop-shadow-[0_0_30px_rgba(245,158,11,0.5)] animate-bounce" />
                    <Zap className="h-8 w-8 text-[#FFD700] absolute -top-2 -right-2 animate-pulse" />
                  </>
                ) : (
                  <>
                    <Trophy className="h-20 w-20 md:h-32 md:w-32 text-neon-blue mx-auto drop-shadow-[0_0_30px_rgba(0,123,255,0.4)]" />
                    <Zap className="h-8 w-8 text-[#FFD700] absolute -top-2 -right-2 animate-pulse" />
                  </>
                )}
             </div>
             <div className="space-y-4">
                {qualifiesForTop5 ? (
                  <div className="inline-block px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs font-black text-amber-300 uppercase tracking-widest">
                    🏆 Qualified For Official Top 5 Student Leaderboard!
                  </div>
                ) : null}
                <h3 className="text-3xl md:text-5xl font-black text-emerald-500 uppercase tracking-tighter italic">ASSESSMENT FINISHED</h3>
                <div className="text-6xl md:text-9xl font-black text-neon-cyan drop-shadow-[0_0_40px_rgba(0,242,254,0.6)] italic leading-none">
                  {animatedScore} <span className="text-3xl md:text-5xl">PTS</span>
                </div>
                <p className="text-[10px] md:text-xs font-black text-stone-400 uppercase tracking-widest">
                  10 Points per correct answer • Retakes locked
                </p>
                <div className="flex justify-center gap-6 md:gap-10 pt-4">
                   <div className="text-center bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                      <p className="text-[8px] md:text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">CORRECT ANSWERS</p>
                      <p className="text-lg md:text-2xl font-black text-white italic">
                        {selectedAnswers.reduce((acc, ans, idx) => acc + (ans === currentQuestions[idx]?.correctAnswer ? 1 : 0), 0)} / {currentQuestions.length}
                      </p>
                   </div>
                   <div className="text-center bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                      <p className="text-[8px] md:text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">LEADERBOARD STATUS</p>
                      <p className={`text-lg md:text-2xl font-black italic ${qualifiesForTop5 ? 'text-amber-400' : 'text-stone-400'}`}>
                        {qualifiesForTop5 ? 'TOP 5 RANKED' : 'UNRANKED'}
                      </p>
                   </div>
                </div>
                {!qualifiesForTop5 && (
                  <p className="text-[10px] text-stone-500 max-w-md mx-auto">
                    Note: Your points are earned, but only scores qualifying in the top 5 are displayed on the official Top Student Score.
                  </p>
                )}
             </div>
             <button onClick={resetQuiz} className="w-full bg-neon-cyan text-black font-black h-16 md:h-20 rounded-xl md:rounded-[1.5rem] text-xl md:text-2xl uppercase tracking-[0.1em] md:tracking-[0.2em] shadow-xl transition-all hover:brightness-110">
               FINISH & RETURN
             </button>
          </div>
        ) : currentQuestions.length > 0 && currentQ ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-full">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-[#0B0F19]/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 gap-4 shadow-lg">
              <div className="flex flex-col text-center sm:text-left">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#00F2FE]">
                  {isExamSimMode ? 'FINAL ASSESSMENT' : (activeSubject ? activeSubject.toUpperCase() : 'SMART QUIZ')}
                </span>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                  Question {currentQuestionIndex + 1} of {currentQuestions.length} • 10 PTS / CORRECT
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#090D16] px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                  <Timer className="h-4 w-4 text-[#00F2FE] animate-pulse" />
                  <span className="font-mono font-black text-sm md:text-base text-white leading-none">
                    {timeLimit > 0 ? formatTime(timeLeft) : 'NO LIMIT'}
                  </span>
                </div>
                {/* Allow student to exit quiz */}
                <button
                  onClick={resetQuiz}
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl flex items-center gap-1 text-xs font-black uppercase tracking-wider transition-colors"
                  title="Exit Quiz"
                >
                  <X className="w-4 h-4" />
                  <span>Exit</span>
                </button>
              </div>
            </div>
            
            {/* 16:9 Media Display Container */}
            <div className="w-full aspect-[16/9] relative rounded-[12px] overflow-hidden border border-white/10 bg-[#090D16] shadow-[inset_0_4px_24px_rgba(0,0,0,0.8)] flex items-center justify-center">
              {currentQ.image ? (
                <img 
                  src={currentQ.image} 
                  alt="Quiz Illustration" 
                  className="w-full h-full object-contain p-2 transition-transform duration-500 hover:scale-102" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                /* Dynamic, premium geometric thematic placeholder graphics */
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B0F19] via-[#111827] to-[#0B0F19] flex flex-col items-center justify-center p-6 text-[#00F2FE]/25 select-none overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
                  
                  <div className="relative z-10 w-20 h-20 rounded-full border border-[#00F2FE]/10 flex items-center justify-center shadow-[0_0_50px_rgba(0,242,254,0.03)] mb-3">
                    <div className="absolute inset-0 rounded-full border border-dashed border-[#00F2FE]/15 animate-[spin_60s_linear_infinite]" />
                    <div className="absolute inset-2 rounded-full border border-double border-[#00F2FE]/20 animate-[spin_30s_linear_infinite_reverse]" />
                    <BookOpen className="w-8 h-8 text-[#00F2FE]/30 animate-pulse" />
                  </div>
                  
                  <span className="relative z-10 text-[#00F2FE]/40 font-mono text-[9px] uppercase tracking-[0.3em] font-black leading-none">
                    {isExamSimMode ? 'FINAL ENTRANCE ASSESSMENT' : (activeSubject ? activeSubject.toUpperCase() : 'VISUAL RESOURCE')}
                  </span>
                </div>
              )}
              {/* Inner shadow overlay */}
              <div className="absolute inset-0 pointer-events-none rounded-[12px] border border-white/5 shadow-[inset_0_4px_30px_rgba(0,0,0,0.9)]" />
            </div>

            {/* Question Area (Generous Padding & breathe space) */}
            <div className="p-6 md:p-8 bg-[#0F1422] rounded-2xl border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
              <h2 className="text-lg md:text-2xl font-semibold text-[#F8FAFC] leading-relaxed tracking-wide whitespace-pre-wrap">
                {currentQ.question}
              </h2>
            </div>

            {/* Options Layout (2-column, 2-row CSS grid) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px] relative z-10">
              {Array.isArray(currentQ.options) && currentQ.options.map((opt: string, idx: number) => (
                <button 
                  key={idx} 
                  disabled={!!feedback} 
                  onClick={() => handleAnswerSelect(idx.toString())} 
                  className={`flex items-center space-x-4 p-4 rounded-xl border-2 transition-all cursor-pointer group/ans text-left ${
                    !feedback ? "border-white/5 bg-white/5 hover:border-[#00F2FE]/40 hover:bg-[#00F2FE]/5" : 
                    selectedAnswers[currentQuestionIndex] === idx ? (idx === currentQ.correctAnswer ? "border-emerald-500 bg-emerald-500/10 text-emerald-100" : "border-red-500 bg-red-500/10 text-red-100") :
                    idx === currentQ.correctAnswer ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-200" : "border-white/5 bg-white/5 opacity-55"
                  }`}
                >
                  <div className={`flex aspect-square size-8 items-center justify-center rounded-lg font-black text-sm border-2 transition-all shrink-0 ${
                    !feedback ? "border-white/10 text-stone-400 group-hover/ans:border-[#00F2FE] group-hover/ans:text-[#00F2FE]" : 
                    idx === currentQ.correctAnswer ? "bg-emerald-500 text-black border-emerald-500" : 
                    (selectedAnswers[currentQuestionIndex] === idx ? "bg-red-500 text-black border-red-500" : "border-white/10 text-stone-500")
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="flex-1 text-xs md:text-sm font-semibold text-white/95 leading-snug">{opt}</span>
                  {feedback && idx === currentQ.correctAnswer && <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />}
                  {feedback && selectedAnswers[currentQuestionIndex] === idx && idx !== currentQ.correctAnswer && <XCircle className="size-5 text-red-500 shrink-0" />}
                </button>
              ))}
            </div>

            <button onClick={nextQuestion} disabled={!feedback} className="w-full bg-[#00F2FE] text-black font-black h-12 md:h-16 rounded-lg md:rounded-2xl text-lg md:text-2xl uppercase tracking-[0.15em] md:tracking-[0.3em] italic shadow-xl transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50">
              {currentQuestionIndex === currentQuestions.length - 1 ? 'FINISH' : 'NEXT'}
            </button>
          </div>
        ) : (
          <div className="text-center py-20 md:py-32 opacity-20 italic tracking-[0.3em] md:tracking-[0.5em] font-black text-sm md:text-xl flex flex-col items-center gap-4">
            <Zap className="size-12 md:size-20 animate-pulse" />
            NO DATA FOUND FOR THIS ARCHIVE
          </div>
        )}
      </div>
    </div>
  );
}
