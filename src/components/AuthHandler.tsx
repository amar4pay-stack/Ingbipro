import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { UserProfile, GlobalSettings, Stream } from '../types';
import { GraduationCap, ShieldCheck, Loader2, ArrowRight, Shield, User, LogIn, UserPlus, ShieldAlert, Lock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

const GOOGLE_ICON_URL = "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg";

export default function AuthHandler({ 
  mode, 
  setMode, 
  onAuthComplete 
}: { 
  mode: 'student' | 'teacher' | 'principal',
  setMode: (mode: 'student' | 'teacher' | 'principal') => void,
  onAuthComplete: (user: UserProfile | null) => void 
}) {
  const [studentIdentifier, setStudentIdentifier] = useState(''); // Can be Name or ID
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [teacherGrade, setTeacherGrade] = useState('9');
  const [teacherSection, setTeacherSection] = useState('A');
  const [teacherKey, setTeacherKey] = useState('');
  const [teacherAction, setTeacherAction] = useState<'login' | 'register'>('login');
  const [showRegistrationClosedModal, setShowRegistrationClosedModal] = useState(false);
  const [showClassRequestSuccessModal, setShowClassRequestSuccessModal] = useState(false);
  const [showUnassignedClassModal, setShowUnassignedClassModal] = useState(false);
  const [unassignedClassData, setUnassignedClassData] = useState<{
    uid: string;
    email: string;
    displayName: string;
    requestedGrade: string;
    requestedSection: string;
  } | null>(null);
  const [submittingClassRequest, setSubmittingClassRequest] = useState(false);
  const [masterUser, setMasterUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<GlobalSettings | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as GlobalSettings);
      }
    }, (error) => {
      console.warn("Could not fetch global settings, using defaults.", error);
      setSettings({ disableTeacherRegistration: false });
    });
    return () => unsub();
  }, []);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const trimmedIdentifier = studentIdentifier.trim();
      const trimmedPassword = password.trim();

      // First, try to find the student by ID
      let studentDoc = await getDoc(doc(db, 'students', trimmedIdentifier));
      let studentData = studentDoc.exists() ? studentDoc.data() : null;

      // If not found by ID, try to find by Name (Exact match)
      if (!studentData) {
        const q = query(collection(db, 'students'), where('name', '==', trimmedIdentifier));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          studentDoc = querySnapshot.docs[0];
          studentData = studentDoc.data();
        }
      }

      // If still not found, try common case variations (Uppercase/Lowercase)
      if (!studentData) {
        const variations = [trimmedIdentifier.toUpperCase(), trimmedIdentifier.toLowerCase(), trimmedIdentifier.charAt(0).toUpperCase() + trimmedIdentifier.slice(1).toLowerCase()];
        for (const variant of variations) {
          if (variant === trimmedIdentifier) continue; // Skip if already tried
          const q = query(collection(db, 'students'), where('name', '==', variant));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            studentDoc = querySnapshot.docs[0];
            studentData = studentDoc.data();
            break;
          }
        }
      }
      
      if (!studentData) {
        throw new Error('Student not found. Please check your Name or ID.');
      }

      if (String(studentData.password).trim() !== trimmedPassword) {
        throw new Error('Incorrect Password. Please try again.');
      }

      const internalEmail = `${studentData.studentID}@school.internal`;
      const internalPassword = `auth_${studentData.studentID}_secure`; // Fixed internal password
      
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, internalEmail, internalPassword);
      } catch (err: any) {
        if (
          err.code === 'auth/user-not-found' || 
          err.code === 'auth/invalid-credential' || 
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-login-credentials'
        ) {
          try {
            userCredential = await createUserWithEmailAndPassword(auth, internalEmail, internalPassword);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              // Intended account exists, so re-try sign-in with potentially updated auth or report
              console.warn("Auth user already exists but sign in failed:", err);
              throw new Error('Authentication system error: Sync issue. Please contact the administrator.');
            } else {
              console.error("Internal Auth Error:", createErr);
              throw new Error('Authentication system error. Please try again later.');
            }
          }
          
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: internalEmail,
            displayName: studentData.name,
            role: 'student',
            isApproved: true,
            createdAt: new Date().toISOString(),
            grade: studentData.grade,
            section: studentData.section,
            photoUrl: studentData.photoUrl || '',
            studentID: studentData.studentID,
            marks: studentData.marks || {}
          }).catch(error => handleFirestoreError(error, OperationType.WRITE, `users/${userCredential.user.uid}`));
        } else {
          throw err;
        }
      }

      // Update existing user profile with latest student data if needed
      if (userCredential) {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          grade: studentData.grade,
          section: studentData.section,
          photoUrl: studentData.photoUrl || '',
          studentID: studentData.studentID,
          marks: studentData.marks || {}
        }, { merge: true }).catch(error => handleFirestoreError(error, OperationType.WRITE, `users/${userCredential.user.uid}`));
      }

    } catch (err: any) {
      setError(err.message || 'Invalid Student Credentials');
      console.error("Login Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClassAccessRequest = async () => {
    if (!unassignedClassData) return;
    setSubmittingClassRequest(true);
    try {
      const targetClass = `${unassignedClassData.requestedGrade}-${unassignedClassData.requestedSection}`;
      const userDocRef = doc(db, 'users', unassignedClassData.uid);
      await updateDoc(userDocRef, {
        pendingClassRequests: arrayUnion(targetClass)
      });
      setShowUnassignedClassModal(false);
      setShowClassRequestSuccessModal(true);
    } catch (err: any) {
      console.error("Error submitting class request:", err);
      try {
        const targetClass = `${unassignedClassData.requestedGrade}-${unassignedClassData.requestedSection}`;
        const userDocRef = doc(db, 'users', unassignedClassData.uid);
        const userDoc = await getDoc(userDocRef);
        const existingRequests = userDoc.data()?.pendingClassRequests || [];
        if (!existingRequests.includes(targetClass)) {
          existingRequests.push(targetClass);
        }
        await setDoc(userDocRef, { pendingClassRequests: existingRequests }, { merge: true });
        setShowUnassignedClassModal(false);
        setShowClassRequestSuccessModal(true);
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Failed to submit class request');
      }
    } finally {
      setSubmittingClassRequest(false);
    }
  };

  const handleTeacherLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        await signOut(auth);
        setError("No Teacher Account (TA) found for this email. If you are a new teacher, please click 'Create TA Account' below to register.");
        return;
      }

      const userData = userDoc.data();
      if (userData.role !== 'teacher') {
        await signOut(auth);
        setError(`This Google account is registered as a ${userData.role}, not a teacher.`);
        return;
      }

      // If teacher is not yet approved by Principal
      if (!userData.isApproved) {
        await signOut(auth);
        setShowClassRequestSuccessModal(true);
        return;
      }

      // Check class assignment restriction
      const targetClass = `${teacherGrade}-${teacherSection}`;
      const assignedClasses: string[] = userData.assignedClasses || [];
      
      let isPermitted = false;
      if (assignedClasses.length > 0) {
        isPermitted = assignedClasses.includes(targetClass);
      } else {
        // Unrestricted default for existing teachers before assignment rules
        isPermitted = true;
      }

      if (!isPermitted) {
        // Teacher tried to log in to an unassigned class
        await signOut(auth);
        setUnassignedClassData({
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: userData.displayName || 'Teacher',
          requestedGrade: teacherGrade,
          requestedSection: teacherSection
        });
        setShowUnassignedClassModal(true);
        return;
      }

      // Teacher is approved and assigned to this class! Update active grade and section
      await setDoc(userDocRef, {
        grade: teacherGrade,
        section: teacherSection
      }, { merge: true });

    } catch (err: any) {
      setError(err.message || 'Teacher Login Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (settings?.disableTeacherRegistration) {
      setShowRegistrationClosedModal(true);
      return;
    }

    if (settings?.teacherAccessKey && teacherKey !== settings.teacherAccessKey) {
      setError('Invalid Teacher Access Key');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      const targetClass = `${teacherGrade}-${teacherSection}`;

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName || 'Teacher',
          role: 'teacher',
          isApproved: false,
          createdAt: new Date().toISOString(),
          grade: teacherGrade,
          section: teacherSection,
          assignedClasses: [],
          pendingClassRequests: [targetClass]
        });

        await signOut(auth);
        setShowClassRequestSuccessModal(true);
      } else {
        const userData = userDoc.data();
        if (userData.role !== 'teacher') {
          await signOut(auth);
          setError(`This Google account is registered as a ${userData.role}, not a teacher.`);
          return;
        }

        if (!userData.isApproved) {
          await updateDoc(userDocRef, {
            pendingClassRequests: arrayUnion(targetClass)
          });
          await signOut(auth);
          setShowClassRequestSuccessModal(true);
        } else {
          const assignedClasses: string[] = userData.assignedClasses || [];
          const isPermitted = assignedClasses.length > 0 ? assignedClasses.includes(targetClass) : true;
          if (!isPermitted) {
            await signOut(auth);
            setUnassignedClassData({
              uid: result.user.uid,
              email: result.user.email || '',
              displayName: userData.displayName || 'Teacher',
              requestedGrade: teacherGrade,
              requestedSection: teacherSection
            });
            setShowUnassignedClassModal(true);
          } else {
            await setDoc(userDocRef, {
              grade: teacherGrade,
              section: teacherSection
            }, { merge: true });
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Teacher Registration Failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePrincipalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterUser !== 'admin' || passphrase !== '1212_13') {
      setError('Invalid Master Credentials');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || 'Principal',
        role: 'principal',
        isApproved: true,
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(error => handleFirestoreError(error, OperationType.WRITE, `users/${result.user.uid}`));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden border transition-colors duration-500 ${
          mode === 'student' 
            ? 'bg-white border-black/5' 
            : 'bg-black border-white/10'
        }`}
      >
        {/* 16:9 Header Image */}
        <div className="aspect-video w-full relative">
          <img 
            src={
              mode === 'teacher' 
                ? (settings?.teacherGateImageUrl || settings?.gateImageUrl || "https://picsum.photos/seed/teacher_login/800/450")
                : (settings?.studentGateImageUrl || settings?.gateImageUrl || "https://picsum.photos/seed/school_portal/800/450?grayscale")
            } 
            alt="School Header" 
            className={`w-full h-full object-cover transition-opacity duration-500 ${mode === 'student' ? 'opacity-100' : 'opacity-80'}`}
            referrerPolicy="no-referrer"
          />
          <div className={`absolute inset-0 bg-gradient-to-t via-transparent transition-colors duration-500 flex flex-col items-center justify-end pb-4 ${
            mode === 'student' 
              ? 'from-black/60' 
              : 'from-black'
          }`}>
            <p className={`text-[8px] font-black uppercase tracking-[0.5em] mb-1 transition-colors duration-500 ${
              mode === 'student' ? 'text-white' : 'text-neon-cyan'
            }`}>
              {settings?.schoolName || 'INGIBI HIGH SCHOOL'}
            </p>
            <div className={`h-0.5 w-6 mb-2 transition-colors duration-500 ${
              mode === 'student' ? 'bg-white' : 'bg-neon-cyan'
            }`}></div>
          </div>
        </div>

        <div className="p-6 text-center">
            <header className="mb-6">
              <h1 className={`text-xl font-black italic uppercase tracking-tighter leading-none transition-colors duration-500 ${
                mode === 'student' ? 'text-stone-900' : 'text-white'
              }`}>
                {mode === 'student' && 'STUDENT PORTAL'}
                {mode === 'teacher' && (teacherAction === 'login' ? 'TEACHER LOGIN (TA)' : 'CREATE TA ACCOUNT')}
                {mode === 'principal' && 'PRINCIPAL AUTH'}
              </h1>
              <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 italic transition-colors duration-500 ${
                mode === 'student' ? 'text-stone-400' : 'text-stone-500'
              }`}>
                {mode === 'student' && 'ENTER CREDENTIALS'}
                {mode === 'teacher' && (teacherAction === 'login' ? 'FACULTY MANAGEMENT ACCESS' : 'REGISTER NEW FACULTY ACCOUNT')}
                {mode === 'principal' && 'MASTER AUTHORITY LEVEL'}
              </p>
            </header>

          {error && (
            <div className={`mb-4 p-3 border text-[10px] font-bold rounded-xl flex items-center gap-2 transition-colors duration-500 ${
              mode === 'student' 
                ? 'bg-red-50 border-red-100 text-red-600' 
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              <ShieldCheck className="w-4 h-4" />
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {mode === 'student' && (
              <motion.form 
                key="student"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleStudentLogin}
                className="space-y-4"
              >
                <div className="text-left">
                  <label className={`block text-[8px] font-black uppercase tracking-widest mb-1 ml-3 transition-colors duration-500 ${
                    mode === 'student' ? 'text-stone-500' : 'text-stone-500'
                  }`}>STUDENT NAME OR ID</label>
                  <input 
                    type="text" 
                    required
                    value={studentIdentifier}
                    onChange={(e) => setStudentIdentifier(e.target.value)}
                    placeholder="ENTER NAME OR ID"
                    className={`w-full px-4 py-3 rounded-[1rem] text-sm font-black outline-none transition-all ${
                      mode === 'student' 
                        ? 'bg-stone-50 border border-stone-100 text-stone-900 placeholder:text-stone-300 focus:border-neon-cyan' 
                        : 'bg-white/5 border border-white/10 text-white placeholder:text-stone-700 focus:border-neon-cyan'
                    }`}
                  />
                </div>
                <div className="text-left">
                  <label className={`block text-[8px] font-black uppercase tracking-widest mb-1 ml-3 transition-colors duration-500 ${
                    mode === 'student' ? 'text-stone-500' : 'text-stone-500'
                  }`}>PASSWORD</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full px-4 py-3 rounded-[1rem] text-sm font-black outline-none transition-all ${
                      mode === 'student' 
                        ? 'bg-stone-50 border border-stone-100 text-stone-900 placeholder:text-stone-300 focus:border-neon-cyan' 
                        : 'bg-white/5 border border-white/10 text-white placeholder:text-stone-700 focus:border-neon-cyan'
                    }`}
                  />
                </div>
                <button 
                  disabled={loading}
                  className="w-full bg-neon-blue text-white py-3 rounded-[1rem] text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-neon-blue/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      CONNECT <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {mode === 'teacher' && (
              <motion.div 
                key="teacher"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherAction('login');
                      setError('');
                    }}
                    className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      teacherAction === 'login' 
                        ? 'bg-[#FFD700] text-black shadow-md font-extrabold' 
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    TA Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (settings?.disableTeacherRegistration) {
                        setShowRegistrationClosedModal(true);
                      } else {
                        setTeacherAction('register');
                        setError('');
                      }
                    }}
                    className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      teacherAction === 'register' 
                        ? 'bg-[#FFD700] text-black shadow-md font-extrabold' 
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Create TA
                  </button>
                </div>

                <form onSubmit={teacherAction === 'login' ? handleTeacherLogin : handleTeacherRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-left">
                      <label htmlFor="grade-select" className="block text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-3 cursor-pointer">GRADE</label>
                      <div className="relative transition-all hover:scale-[1.02]">
                        <select 
                          id="grade-select"
                          value={teacherGrade}
                          onChange={(e) => setTeacherGrade(e.target.value)}
                          className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-[1.2rem] text-sm font-black text-white focus:border-neon-cyan outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="9" className="bg-black text-white">9</option>
                          <option value="10" className="bg-black text-white">10</option>
                          <option value="11" className="bg-black text-white">11</option>
                          <option value="12" className="bg-black text-white">12</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-neon-cyan/60 rotate-45" />
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <label htmlFor="section-select" className="block text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-3 cursor-pointer">SECTION</label>
                      <div className="relative transition-all hover:scale-[1.02]">
                        <select 
                          id="section-select"
                          value={teacherSection}
                          onChange={(e) => setTeacherSection(e.target.value)}
                          className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-[1.2rem] text-sm font-black text-white focus:border-neon-cyan outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="A" className="bg-black text-white">A</option>
                          <option value="B" className="bg-black text-white">B</option>
                          <option value="C" className="bg-black text-white">C</option>
                          <option value="D" className="bg-black text-white">D</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-neon-cyan/60 rotate-45" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {teacherAction === 'register' && settings?.teacherAccessKey && (
                    <div className="text-left">
                      <label className="block text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-3">REQUIRED ACCESS KEY</label>
                      <input 
                        type="password" 
                        placeholder="Enter Key"
                        value={teacherKey}
                        onChange={(e) => setTeacherKey(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[1rem] text-sm font-black placeholder:text-stone-700 focus:border-neon-cyan outline-none transition-all text-white"
                        autoComplete="off"
                      />
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#FFD700] text-black py-4 rounded-[1.2rem] text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-black" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <img src={GOOGLE_ICON_URL} alt="Google" className="w-4 h-4" />
                        <span>{teacherAction === 'login' ? 'SIGN IN WITH GOOGLE' : 'REGISTER TA WITH GOOGLE'}</span>
                      </div>
                    )}
                  </button>
                </form>

                {/* Sub-mode navigation links */}
                <div className="pt-1 text-center">
                  {teacherAction === 'login' ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-stone-400 font-medium">Don't have a Teacher Account (TA)?</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (settings?.disableTeacherRegistration) {
                            setShowRegistrationClosedModal(true);
                          } else {
                            setTeacherAction('register');
                            setError('');
                          }
                        }}
                        className="text-[10px] font-black text-neon-cyan hover:underline uppercase tracking-wider flex items-center justify-center gap-1 mx-auto"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Create TA Account Here
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] text-stone-400 font-medium">Already have an approved TA Account?</p>
                      <button
                        type="button"
                        onClick={() => {
                          setTeacherAction('login');
                          setError('');
                        }}
                        className="text-[10px] font-black text-neon-cyan hover:underline uppercase tracking-wider flex items-center justify-center gap-1 mx-auto"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Login to TA Account
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {mode === 'principal' && (
              <motion.form 
                key="principal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handlePrincipalLogin}
                className="space-y-4"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20 shadow-lg shadow-red-500/10">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-left">
                    <label className="block text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-3">MASTER USERNAME</label>
                    <input 
                      type="text" 
                      required
                      value={masterUser}
                      onChange={(e) => setMasterUser(e.target.value)}
                      placeholder="Master Username"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[1rem] text-sm font-black placeholder:text-stone-700 focus:border-red-500 outline-none transition-all text-white"
                    />
                  </div>
                  <div className="text-left">
                    <label className="block text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-3">MASTER PASSWORD</label>
                    <input 
                      type="password" 
                      required
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[1rem] text-sm font-black placeholder:text-stone-700 focus:border-red-500 outline-none transition-all text-white"
                    />
                  </div>
                </div>
                <button 
                  disabled={loading}
                  className="w-full bg-[#ff0055] text-white py-3 rounded-[1rem] text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#e6004d] transition-all disabled:opacity-50 shadow-xl shadow-red-500/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>OPEN GOD MODE</>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <footer className={`mt-8 pt-4 border-t transition-colors duration-500 ${
            mode === 'student' ? 'border-stone-100' : 'border-white/5'
          }`}>
            <button 
              onClick={() => {
                if (mode === 'student') setMode('teacher');
                else if (mode === 'teacher') setMode('principal');
                else setMode('student');
                setError('');
              }}
              className={`flex items-center justify-center gap-1 mx-auto text-[8px] font-black uppercase tracking-[0.2em] transition-colors duration-500 ${
                mode === 'student' 
                  ? 'text-stone-400 hover:text-stone-600' 
                  : 'text-stone-500 hover:text-neon-cyan'
              }`}
            >
              <Shield className="w-2.5 h-2.5" />
              SWITCH ACCESS MODE
            </button>
          </footer>
        </div>
      </motion.div>

      {/* Registration Closed Pop-up Modal */}
      <AnimatePresence>
        {showRegistrationClosedModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-stone-950 border-2 border-amber-500/80 rounded-3xl p-6 shadow-[0_0_35px_rgba(245,158,11,0.25)] relative overflow-hidden text-center space-y-4"
            >
              <button 
                onClick={() => setShowRegistrationClosedModal(false)}
                className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <ShieldAlert className="w-7 h-7 animate-pulse" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">
                  Registration Closed
                </h3>
                <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em]">
                  Registration for TA Account is Closed
                </p>
              </div>

              <p className="text-xs font-semibold text-stone-300 leading-relaxed px-2">
                New Teacher Account (TA) registration has been locked by the Principal.
              </p>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 text-left">
                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-0.5">Existing Teachers:</p>
                <p className="text-[10px] text-stone-300 font-medium leading-normal">
                  If you already have an approved Teacher Account, you can still sign in using the <span className="text-white font-bold">TA Login</span> option.
                </p>
              </div>

              <button 
                onClick={() => {
                  setShowRegistrationClosedModal(false);
                  setTeacherAction('login');
                }}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                Go to TA Login
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unassigned Class Form / Modal */}
      <AnimatePresence>
        {showUnassignedClassModal && unassignedClassData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-stone-950 border-2 border-[#FFD700] rounded-3xl p-6 shadow-[0_0_40px_rgba(255,215,0,0.2)] relative overflow-hidden text-center space-y-4"
            >
              <button 
                onClick={() => setShowUnassignedClassModal(false)}
                className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-[#FFD700]/10">
                <Lock className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">
                  Class Access Restricted
                </h3>
                <p className="text-[10px] font-black text-[#FFD700] uppercase tracking-[0.2em]">
                  Grade {unassignedClassData.requestedGrade} - Section {unassignedClassData.requestedSection}
                </p>
              </div>

              <p className="text-xs font-semibold text-stone-300 leading-relaxed px-2">
                You are currently not assigned to teach <span className="text-white font-bold">Grade {unassignedClassData.requestedGrade} / Section {unassignedClassData.requestedSection}</span>. Please fill out the class access request form below.
              </p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-3">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-white/5 pb-2">REQUEST FORM DETAILS</p>
                <div>
                  <label className="text-[8px] font-black text-stone-500 uppercase tracking-widest block mb-0.5">FACULTY MEMBER</label>
                  <p className="text-xs font-black text-white">{unassignedClassData.displayName} ({unassignedClassData.email})</p>
                </div>
                <div>
                  <label className="text-[8px] font-black text-stone-500 uppercase tracking-widest block mb-0.5">REQUESTED CLASS</label>
                  <span className="inline-block px-3 py-1 bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 rounded-lg text-xs font-black uppercase tracking-wider">
                    Grade {unassignedClassData.requestedGrade} - Section {unassignedClassData.requestedSection}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowUnassignedClassModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-stone-400 font-black text-xs uppercase tracking-widest rounded-xl transition-all border border-white/10"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmitClassAccessRequest}
                  disabled={submittingClassRequest}
                  className="flex-1 py-3.5 bg-[#FFD700] hover:bg-[#ffe033] text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#FFD700]/20 flex items-center justify-center gap-2"
                >
                  {submittingClassRequest ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    "SUBMIT REQUEST FORM"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Class Request Success Confirmation Pop-up Modal */}
      <AnimatePresence>
        {showClassRequestSuccessModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-gradient-to-b from-stone-900 to-black border-2 border-emerald-500/80 rounded-3xl p-6 shadow-[0_0_45px_rgba(16,185,129,0.3)] relative overflow-hidden text-center space-y-4"
            >
              <button 
                onClick={() => setShowClassRequestSuccessModal(false)}
                className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <ShieldCheck className="w-9 h-9 animate-bounce" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-black uppercase italic tracking-tight text-white">
                  Form Submitted!
                </h3>
                <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-[0.2em] rounded-full border border-emerald-500/30">
                  REQUEST PENDING APPROVAL
                </span>
              </div>

              <p className="text-xs font-extrabold text-stone-200 leading-relaxed px-3 py-4 bg-white/5 rounded-2xl border border-white/10">
                You have successfully filled the form. Please wait until the Principal approves it and assigns the class to you.
              </p>

              <button 
                onClick={() => setShowClassRequestSuccessModal(false)}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
              >
                OK, UNDERSTOOD
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
