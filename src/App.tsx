import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, getDocFromServer, collection, query, where, getDocs, updateDoc, orderBy, limit } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import AuthHandler from './components/AuthHandler';
import PrincipalDashboard from './components/PrincipalDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import TeacherOnboarding from './components/TeacherOnboarding';
import StudentDashboard from './components/StudentDashboard';
import PublicNewsFeed from './components/PublicNewsFeed';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Loader2, 
  LogOut, 
  Clock, 
  ShieldAlert, 
  GraduationCap, 
  Menu, 
  X, 
  LayoutGrid, 
  UserCircle, 
  ShieldCheck, 
  Newspaper, 
  Trophy,
  Star,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from './utils/errorHandling';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'student' | 'teacher' | 'principal'>('student');
  const [currentView, setCurrentView] = useState<'dashboard' | 'leaderboard' | 'news'>('dashboard');
  const [topStudents, setTopStudents] = useState<UserProfile[]>([]);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    // Test Firestore connection
    const testConnection = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const { getDoc } = await import('firebase/firestore');
        await getDoc(docRef);
      } catch (error) {
        console.warn("Initial connection test failed, but continuing...", error);
      }
    };
    testConnection();

    // Add default student DARU if not exists
    const setupDefaultStudent = async () => {
      try {
        const { setDoc, doc, getDoc, updateDoc } = await import('firebase/firestore');
        const stuRef = doc(db, 'students', 'STU0000');
        const stuSnap = await getDoc(stuRef);
        if (!stuSnap.exists()) {
          await setDoc(stuRef, {
            studentID: 'STU0000',
            name: 'Daru',
            password: '1234',
            grade: '12',
            section: 'A',
            stream: 'Social',
            status: 'Active',
            marks: {
              'Mathematics': 85,
              'Physics': 78,
              'Chemistry': 92,
              'English': 88
            },
            totalQuizPoints: 1250,
            photoUrl: 'https://picsum.photos/seed/student/200/200',
            createdAt: new Date().toISOString()
          });
          console.log('Default student Daru created');
        } else if (stuSnap.data().password !== '1234' || stuSnap.data().name !== 'Daru' || !stuSnap.data().totalQuizPoints) {
          // Force update if it's different or missing points
          await updateDoc(stuRef, { 
            password: '1234',
            name: 'Daru',
            totalQuizPoints: stuSnap.data().totalQuizPoints || 1250
          });
          console.log('Default student Daru credentials synchronized');
        }

        // Also ensure the user profile for the default student has the points for the leaderboard
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('studentID', '==', 'STU0000'));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          if (!userDoc.data().totalQuizPoints) {
            await updateDoc(userDoc.ref, { totalQuizPoints: 1250 });
          }
        }
      } catch (error) {
        console.error('Error setting up default student:', error);
      }
    };
    setupDefaultStudent();

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up previous profile listener if it exists
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        // Listen to user profile
        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            setUser(snapshot.data() as UserProfile);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    // Listen for top students for the global leaderboard (strictly Top 5)
    const topStudentsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      orderBy('totalQuizPoints', 'desc'),
      limit(5)
    );
    const unsubTopStudents = onSnapshot(topStudentsQuery, (snapshot) => {
      const students = snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(s => (s.totalQuizPoints || 0) > 0)
        .slice(0, 5);
      setTopStudents(students);
    }, (error) => {
      console.warn("Could not fetch top students", error);
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      unsubTopStudents();
    };
  }, []);

  const SidebarItem = ({ icon: Icon, label, onClick, active }: { icon: any, label: string, onClick?: () => void, active?: boolean }) => (
    <button 
      onClick={() => {
        onClick?.();
        setIsSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-4 px-8 py-4 transition-all group border-l-4 ${
        active 
          ? 'text-neon-cyan bg-white/10 border-neon-cyan shadow-[inset_10px_0_20px_rgba(0,229,255,0.05)]' 
          : 'text-stone-400 hover:text-neon-cyan hover:bg-white/5 border-transparent hover:border-neon-cyan'
      }`}
    >
      <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
      <span className="font-bold tracking-widest uppercase text-[11px]">{label}</span>
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-dark-bg text-white selection:bg-neon-cyan/30">
        {/* Main Header */}
        <header className="fixed top-0 left-0 right-0 z-40 px-6 py-4 flex items-center gap-4 bg-dark-bg/80 backdrop-blur-md border-b border-white/5">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-12 h-12 bg-neon-cyan border-2 border-neon-cyan rounded-none flex items-center justify-center text-black shadow-[0_0_20px_rgba(0,229,255,0.5)] hover:brightness-110 transition-all"
          >
            <Menu className="w-7 h-7" />
          </button>
          <div>
            <h1 className="text-sm font-black tracking-tighter italic uppercase leading-none text-white">INGIBI HIGH SCHOOL</h1>
            <p className="text-[10px] font-bold text-neon-cyan uppercase tracking-[0.2em] mt-0.5">ONLINE PORTAL</p>
          </div>
        </header>

        {/* Sidebar Overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
              <motion.aside 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-72 bg-sidebar-bg sidebar-blur z-[60] border-r border-white/10"
              >
                <div className="p-8 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-black italic uppercase leading-none text-white">INGIBI HIGH SCHOOL</h2>
                    <p className="text-[10px] font-bold text-neon-cyan uppercase tracking-widest mt-1">ONLINE PORTAL</p>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-stone-500 hover:text-white transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="py-6">
                  <p className="px-8 text-[10px] font-black text-stone-600 uppercase tracking-[0.3em] mb-4">MENU</p>
                  <SidebarItem 
                    icon={GraduationCap} 
                    label="Student Area" 
                    active={currentView === 'dashboard' && (!user || user.role === 'student')}
                    onClick={() => {
                      if (!user) setAuthMode('student');
                      setCurrentView('dashboard');
                    }} 
                  />
                  <SidebarItem 
                    icon={UserCircle} 
                    label="Teacher Area" 
                    active={currentView === 'dashboard' && user?.role === 'teacher'}
                    onClick={() => {
                      if (!user) setAuthMode('teacher');
                      setCurrentView('dashboard');
                    }} 
                  />
                  <SidebarItem 
                    icon={ShieldCheck} 
                    label="Principal Area" 
                    active={currentView === 'dashboard' && user?.role === 'principal'}
                    onClick={() => {
                      if (!user) setAuthMode('principal');
                      setCurrentView('dashboard');
                    }} 
                  />
                  <SidebarItem 
                    icon={Newspaper} 
                    label="News" 
                    active={currentView === 'news'}
                    onClick={() => setCurrentView('news')}
                  />
                  <SidebarItem 
                    icon={Trophy} 
                    label="Top Students" 
                    active={currentView === 'leaderboard'}
                    onClick={() => setCurrentView('leaderboard')}
                  />
                </div>

                {user && (
                  <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/5 bg-black/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-neon-cyan/20 flex items-center justify-center text-neon-cyan border border-neon-cyan/30">
                        <UserCircle className="w-6 h-6" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold truncate">{user.displayName}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-black">{user.role}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => signOut(auth)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all border border-red-500/20"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <main className="pt-24 min-h-screen">
          <div className="max-w-3xl mx-auto px-4 pb-12">
            {currentView === 'leaderboard' ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.2)] mb-2">
                    <Trophy className="w-8 h-8 text-amber-500 animate-bounce" />
                  </div>
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">TOP 5 STUDENT SCORE</h2>
                  <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.4em]">The Elite Top 5 Quiz Champions</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] font-black text-amber-400 uppercase tracking-widest mt-1">
                    <span>10 Points Per Correct Answer • Top 5 Qualification</span>
                  </div>
                </div>

                <div className="bg-black rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-2 sm:px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">#Rank</th>
                        <th className="px-2 sm:px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Name</th>
                        <th className="px-2 sm:px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Grade</th>
                        <th className="px-2 sm:px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topStudents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-20 text-center">
                            <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">No qualifying Top 5 rankings yet</p>
                          </td>
                        </tr>
                      ) : (
                        topStudents.map((student, index) => (
                          <motion.tr
                            key={student.uid}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors ${
                              index === 0 ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="px-2 sm:px-6 py-4">
                              <div className={`font-black italic text-base sm:text-lg flex items-center gap-1.5 ${
                                index === 0 ? 'text-amber-400' : 
                                index === 1 ? 'text-stone-300' : 
                                index === 2 ? 'text-amber-600' : 'text-stone-500'
                              }`}>
                                {index === 0 && <Crown className="w-4 h-4 text-amber-400 inline" />}
                                #{index + 1}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-4">
                              <span className={`font-black italic uppercase tracking-tight text-xs sm:text-sm ${
                                index === 0 ? 'text-amber-400' : 'text-white'
                              }`}>
                                {student.displayName}
                              </span>
                            </td>
                            <td className="px-2 sm:px-6 py-4">
                              <span className="text-[9px] sm:text-[10px] font-black text-stone-400 uppercase tracking-widest whitespace-nowrap">{student.grade}th {student.section}</span>
                            </td>
                            <td className="px-2 sm:px-6 py-4 text-right">
                              <span className="text-sm sm:text-base font-black italic tracking-tighter text-neon-cyan drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                                {student.totalQuizPoints || 0} <span className="text-[10px] font-normal text-stone-400 not-italic">pts</span>
                              </span>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div className="p-3 bg-white/[0.02] border-t border-white/5 text-center">
                    <p className="text-[8px] font-bold text-stone-500 uppercase tracking-widest">
                      * Student scores are added to this chart only when finishing a quiz with points high enough to enter the Top 5.
                    </p>
                  </div>
                </div>
              </div>
            ) : currentView === 'news' ? (
              <PublicNewsFeed />
            ) : !user ? (
              <AuthHandler 
                mode={authMode} 
                setMode={setAuthMode} 
                onAuthComplete={() => {}} 
              />
            ) : (
              <>
                {user.role === 'principal' && <PrincipalDashboard />}
                
                {user.role === 'teacher' && (
                  <>
                    {!(user as any).onboarded ? (
                      <TeacherOnboarding user={user} />
                    ) : !user.isApproved ? (
                      <div className="flex items-center justify-center p-4">
                        <div className="w-full max-w-sm bg-white/5 rounded-[2rem] shadow-2xl p-6 text-center border border-white/10 backdrop-blur-xl">
                          <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 neon-glow border border-amber-500/20">
                            <Clock className="w-6 h-6" />
                          </div>
                          <h1 className="text-lg font-black text-white mb-2 uppercase italic">Pending Approval</h1>
                          <p className="text-stone-400 mb-6 font-medium text-xs">
                            Your account has been created successfully. A Principal must approve your access before you can enter the system.
                          </p>
                          <button 
                            onClick={() => signOut(auth)}
                            className="w-full bg-white/5 text-stone-400 py-3 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/10 text-xs"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    ) : (
                      <TeacherDashboard user={user} />
                    )}
                  </>
                )}

                {user.role === 'student' && (
                  <StudentDashboard user={user} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
