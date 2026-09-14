import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, GlobalSettings, Grade, Stream, NewsItem } from '../types';
import { Users, Settings, CheckCircle, ShieldAlert, ToggleLeft, ToggleRight, Loader2, UserCircle, Newspaper, Plus, Trash2, GraduationCap, Image as ImageIcon, Save, UserPlus, Upload, Search, User, Lock, X, Crown, Star, Flame, ChevronRight, Pencil } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { compressAndEncodeImage } from '../utils/fileUtils';
import { motion, AnimatePresence } from 'motion/react';

export default function PrincipalDashboard() {
  const [activeTab, setActiveTab] = useState<'school' | 'news' | 'students' | 'faculty' | 'tsm'>('school');
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsImageFile, setNewsImageFile] = useState<File | null>(null);
  const [newsImagePreview, setNewsImagePreview] = useState('');
  const [newsAudience, setNewsAudience] = useState<'public' | 'inschool'>('inschool');
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [newsToDelete, setNewsToDelete] = useState<NewsItem | null>(null);
  const [isDeletingNews, setIsDeletingNews] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<UserProfile | null>(null);
  const [isManagingSubjects, setIsManagingSubjects] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // TSM Category States
  const [tsmUsers, setTsmUsers] = useState<UserProfile[]>([]);
  const [editingTsmUser, setEditingTsmUser] = useState<UserProfile | null>(null);
  const [editPointsInput, setEditPointsInput] = useState<string>('');
  const [isSavingPoints, setIsSavingPoints] = useState(false);
  const [tsmSearch, setTsmSearch] = useState('');

  // Student Management State
  const [addStuName, setAddStuName] = useState('');
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [studentNameToDelete, setStudentNameToDelete] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [addStuPass, setAddStuPass] = useState('');
  const [addStuGender, setAddStuGender] = useState<'Male' | 'Female'>('Male');
  const [addStuGrade, setAddStuGrade] = useState<Grade>('9');
  const [addStuSec, setAddStuSec] = useState('A');
  const [addStuStream, setAddStuStream] = useState<Stream>('Natural');
  const [addStuPhotoFile, setAddStuPhotoFile] = useState<File | null>(null);
  const [addStuPhotoPreview, setAddStuPhotoPreview] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredStudent, setRegisteredStudent] = useState<{ id: string; name: string; grade: string; section: string } | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // General Settings State
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newStudentGateFile, setNewStudentGateFile] = useState<File | null>(null);
  const [newStudentGatePreview, setNewStudentGatePreview] = useState('');
  const [newTeacherGateFile, setNewTeacherGateFile] = useState<File | null>(null);
  const [newTeacherGatePreview, setNewTeacherGatePreview] = useState('');
  const [newAccessKey, setNewAccessKey] = useState('');
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const newsFileRef = useRef<HTMLInputElement>(null);
  const stuFileRef = useRef<HTMLInputElement>(null);
  const studentGateFileRef = useRef<HTMLInputElement>(null);
  const teacherGateFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Listen for pending teachers
    const teachersQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));
    const unsubTeachers = onSnapshot(teachersQuery, (snapshot) => {
      const teacherList = snapshot.docs.map(snapshotDoc => snapshotDoc.data() as UserProfile);
      setTeachers(teacherList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Listen for all students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({
        studentID: doc.id,
        ...doc.data()
      }));
      setStudents(studentList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students');
    });

    // Listen for global settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as GlobalSettings;
        setSettings(data);
        setNewSchoolName(data.schoolName || '');
        setNewStudentGatePreview(data.studentGateImageUrl || data.gateImageUrl || '');
        setNewTeacherGatePreview(data.teacherGateImageUrl || data.gateImageUrl || '');
        setNewAccessKey(data.teacherAccessKey || '');
      } else {
        setDoc(doc(db, 'settings', 'global'), { disableTeacherRegistration: false })
          .catch(error => handleFirestoreError(error, OperationType.WRITE, 'settings/global'));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    // Listen for news
    const unsubNews = onSnapshot(query(collection(db, 'news'), orderBy('date', 'desc')), (snapshot) => {
      const newsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      setNews(newsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'news');
    });

    // Listen for student users (TSM)
    const tsmQuery = query(
      collection(db, 'users'),
      where('role', '==', 'student')
    );
    const unsubTsm = onSnapshot(tsmQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data() as UserProfile);
      // Sort in-memory desc by totalQuizPoints (handling undefined as 0)
      list.sort((a, b) => (b.totalQuizPoints || 0) - (a.totalQuizPoints || 0));
      setTsmUsers(list);
    }, (error) => {
      // Don't crash workspace on initial load before indices are built
      console.warn("Could not fetch user charts for TSM", error);
    });

    return () => {
      unsubTeachers();
      unsubStudents();
      unsubSettings();
      unsubNews();
      unsubTsm();
    };
  }, []);

  const toggleTeacherReg = async () => {
    if (!settings) return;
    try {
      await updateDoc(doc(db, 'settings', 'global'), {
        disableTeacherRegistration: !settings.disableTeacherRegistration
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const approveTeacher = async (uid: string, approve: boolean) => {
    try {
      const teacher = teachers.find(t => t.uid === uid);
      let updatePayload: any = { isApproved: approve };
      if (approve && teacher) {
        const currentAssigned = teacher.assignedClasses || [];
        if (currentAssigned.length === 0 && teacher.grade && teacher.section) {
          updatePayload.assignedClasses = [`${teacher.grade}-${teacher.section}`];
        }
      }
      await updateDoc(doc(db, 'users', uid), updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const approveTeacherClassRequest = async (uid: string, classCode: string) => {
    try {
      const teacher = teachers.find(t => t.uid === uid);
      if (!teacher) return;
      const currentAssigned = teacher.assignedClasses || [];
      const newAssigned = currentAssigned.includes(classCode) ? currentAssigned : [...currentAssigned, classCode];
      const newPending = (teacher.pendingClassRequests || []).filter(c => c !== classCode);

      await updateDoc(doc(db, 'users', uid), {
        isApproved: true,
        assignedClasses: newAssigned,
        pendingClassRequests: newPending
      });
      alert(`Approved & assigned ${classCode} to ${teacher.displayName || 'teacher'}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const updateTeacherAssignedClasses = async (uid: string, assignedClasses: string[]) => {
    try {
      await updateDoc(doc(db, 'users', uid), { assignedClasses });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const deleteStudent = async (id: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', id));
      setStudentToDelete(null);
      setStudentNameToDelete('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.studentID.includes(studentSearch)
  );

  const updateGeneralSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      let studentGateUrl = newStudentGatePreview;
      if (newStudentGateFile) {
        const base64Url = await compressAndEncodeImage(newStudentGateFile, 600);
        if (base64Url) {
          studentGateUrl = base64Url;
        } else {
          alert('Failed to process student image. Please try again.');
          setIsUpdatingSettings(false);
          return;
        }
      }

      let teacherGateUrl = newTeacherGatePreview;
      if (newTeacherGateFile) {
        const base64Url = await compressAndEncodeImage(newTeacherGateFile, 600);
        if (base64Url) {
          teacherGateUrl = base64Url;
        } else {
          alert('Failed to process teacher image. Please try again.');
          setIsUpdatingSettings(false);
          return;
        }
      }

      // Use setDoc with merge: true to ensure it works even if doc doesn't exist
      await setDoc(doc(db, 'settings', 'global'), {
        schoolName: newSchoolName,
        studentGateImageUrl: studentGateUrl,
        teacherGateImageUrl: teacherGateUrl,
        teacherAccessKey: newAccessKey
      }, { merge: true });
      
      setNewStudentGateFile(null);
      setNewTeacherGateFile(null);
      alert('General Settings updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const deleteNews = async (id: string) => {
    setIsDeletingNews(true);
    try {
      await deleteDoc(doc(db, 'news', id));
      setNewsToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `news/${id}`);
    } finally {
      setIsDeletingNews(false);
    }
  };

  const handleStartEditNews = (item: NewsItem) => {
    setEditingNewsId(item.id);
    setNewsTitle(item.title);
    setNewsContent(item.content);
    setNewsAudience(item.audience || 'inschool');
    setNewsImagePreview(item.imageUrl || '');
    setNewsImageFile(null);
    if (newsFileRef.current) newsFileRef.current.value = '';
  };

  const handleCancelEditNews = () => {
    setEditingNewsId(null);
    setNewsTitle('');
    setNewsContent('');
    setNewsAudience('inschool');
    setNewsImagePreview('');
    setNewsImageFile(null);
    if (newsFileRef.current) newsFileRef.current.value = '';
  };

  const updateTeacherSubjects = async (uid: string, subjects: string[]) => {
    try {
      await updateDoc(doc(db, 'users', uid), { subjects });
      alert('Teacher subjects updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleSaveTsmPoints = async (uid: string, points: number) => {
    setIsSavingPoints(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        totalQuizPoints: points
      });
      setEditingTsmUser(null);
      setEditPointsInput('');
      alert('Student score updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setIsSavingPoints(false);
    }
  };

  const handleRemoveTsmScore = async (student: UserProfile) => {
    if (!confirm(`Are you sure you want to remove the score of ${student.displayName} from the leaderboard?`)) return;
    try {
      await updateDoc(doc(db, 'users', student.uid), {
        totalQuizPoints: 0
      });
      alert('Score removed successfully (reset to 0).');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${student.uid}`);
    }
  };

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStuName || !addStuPass) return;
    setIsAddingStudent(true);
    try {
      // Generate a random ID: 2026 + 4 digits
      const randomId = `2026${Math.floor(1000 + Math.random() * 9000)}`;
      
      let photoUrl = '';
      if (addStuPhotoFile) {
        photoUrl = await compressAndEncodeImage(addStuPhotoFile, 400);
      }

      await setDoc(doc(db, 'students', randomId), {
        studentID: randomId,
        name: addStuName.trim(),
        password: addStuPass.trim(),
        gender: addStuGender,
        grade: addStuGrade,
        section: addStuSec,
        stream: addStuStream,
        photoUrl: photoUrl,
        status: 'Active',
        marks: {},
        createdAt: new Date().toISOString()
      });
      
      setAddStuName('');
      setAddStuPass('');
      setAddStuGender('Male');
      setAddStuPhotoFile(null);
      setAddStuPhotoPreview('');
      if (stuFileRef.current) stuFileRef.current.value = '';
      
      setRegisteredStudent({ id: randomId, name: addStuName.trim(), grade: addStuGrade, section: addStuSec });
      setShowSuccessModal(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students');
    } finally {
      setIsAddingStudent(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500 border border-red-500/30 neon-glow">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter text-red-500">Master Admin</h1>
          </div>
          <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px] ml-1">Central Control Unit</p>
        </div>

        {/* Registration Toggle */}
        <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-4 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/5 rounded-xl text-stone-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-black italic uppercase text-[10px] tracking-tight">System Status</h2>
              <p className="text-[8px] text-stone-500 font-bold uppercase tracking-widest">Teacher Reg</p>
            </div>
          </div>
          <button 
            onClick={toggleTeacherReg}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border ${
              settings?.disableTeacherRegistration 
                ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            }`}
          >
            {settings?.disableTeacherRegistration ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {settings?.disableTeacherRegistration ? 'Locked' : 'Open'}
          </button>
        </div>
      </header>

      {/* Category Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {[
          { id: 'school', label: 'School', icon: Settings },
          { id: 'news', label: 'News', icon: Newspaper },
          { id: 'students', label: 'Students', icon: GraduationCap },
          { id: 'faculty', label: 'Faculty', icon: Users },
          { id: 'tsm', label: 'TSM', icon: Crown },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border ${
              activeTab === tab.id
                ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_20px_rgba(0,229,255,0.3)]'
                : 'bg-white/5 text-stone-400 border-white/10 hover:bg-white/10'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {activeTab === 'school' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Settings className="w-4 h-4 text-neon-cyan" />
                <h2 className="font-black text-stone-500 uppercase text-[10px] tracking-[0.3em]">General Settings</h2>
              </div>
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">School Name</label>
                    <input 
                      type="text" 
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="Change School Name"
                      className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black text-white placeholder:text-stone-600 focus:border-neon-cyan focus:bg-black/60 outline-none transition-all shadow-inner"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Student Portal Image</label>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => studentGateFileRef.current?.click()}
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-stone-400 text-[10px] font-black flex items-center justify-center gap-2 hover:bg-white/10 hover:text-white transition-all border-dashed"
                      >
                        <Upload className="w-4 h-4" />
                        {newStudentGateFile ? newStudentGateFile.name : 'Change Student Image'}
                      </button>
                      <input 
                        type="file" 
                        ref={studentGateFileRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setNewStudentGateFile(file);
                            setNewStudentGatePreview(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                        accept="image/*"
                      />
                      {newStudentGatePreview && (
                        <div className="relative group">
                          <img src={newStudentGatePreview} className="w-14 h-14 rounded-xl object-cover border-2 border-neon-cyan/20 shadow-lg" alt="Preview" />
                          <button 
                            type="button"
                            onClick={() => {
                              setNewStudentGateFile(null);
                              setNewStudentGatePreview(settings?.studentGateImageUrl || settings?.gateImageUrl || '');
                              if (studentGateFileRef.current) studentGateFileRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Teacher Portal Image</label>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => teacherGateFileRef.current?.click()}
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-stone-400 text-[10px] font-black flex items-center justify-center gap-2 hover:bg-white/10 hover:text-white transition-all border-dashed"
                      >
                        <Upload className="w-4 h-4" />
                        {newTeacherGateFile ? newTeacherGateFile.name : 'Change Teacher Image'}
                      </button>
                      <input 
                        type="file" 
                        ref={teacherGateFileRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setNewTeacherGateFile(file);
                            setNewTeacherGatePreview(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                        accept="image/*"
                      />
                      {newTeacherGatePreview && (
                        <div className="relative group">
                          <img src={newTeacherGatePreview} className="w-14 h-14 rounded-xl object-cover border-2 border-neon-cyan/20 shadow-lg" alt="Preview" />
                          <button 
                            type="button"
                            onClick={() => {
                              setNewTeacherGateFile(null);
                              setNewTeacherGatePreview(settings?.teacherGateImageUrl || settings?.gateImageUrl || '');
                              if (teacherGateFileRef.current) teacherGateFileRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Teacher Access Key</label>
                    <input 
                      type="text" 
                      value={newAccessKey}
                      onChange={(e) => setNewAccessKey(e.target.value)}
                      placeholder="Set Teacher Access Key"
                      className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black text-white placeholder:text-stone-600 focus:border-neon-cyan focus:bg-black/60 outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={updateGeneralSettings}
                    disabled={isUpdatingSettings}
                    className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-neon-cyan/20"
                  >
                    {isUpdatingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Settings</>}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'news' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-neon-cyan" />
                  <h2 className="font-black text-stone-500 uppercase text-[10px] tracking-[0.3em]">
                    {editingNewsId ? 'Edit Announcement' : 'Post School News'}
                  </h2>
                </div>
                {editingNewsId && (
                  <button
                    type="button"
                    onClick={handleCancelEditNews}
                    className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-stone-400 hover:text-white uppercase tracking-widest transition-all"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newsTitle || !newsContent) return;
                    setIsPosting(true);
                    try {
                      let imageUrl = newsImagePreview;
                      if (newsImageFile) {
                        imageUrl = await compressAndEncodeImage(newsImageFile, 600);
                      }

                      if (editingNewsId) {
                        await updateDoc(doc(db, 'news', editingNewsId), {
                          title: newsTitle.trim(),
                          content: newsContent.trim(),
                          imageUrl: imageUrl,
                          audience: newsAudience
                        });
                        alert('News Announcement Updated Successfully!');
                      } else {
                        const newsId = Date.now().toString();
                        await setDoc(doc(db, 'news', newsId), {
                          title: newsTitle.trim(),
                          content: newsContent.trim(),
                          imageUrl: imageUrl,
                          audience: newsAudience,
                          date: new Date().toISOString()
                        });
                        alert('News Posted Successfully!');
                      }

                      setEditingNewsId(null);
                      setNewsTitle('');
                      setNewsContent('');
                      setNewsAudience('inschool');
                      setNewsImageFile(null);
                      setNewsImagePreview('');
                      if (newsFileRef.current) newsFileRef.current.value = '';
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, 'news');
                    } finally {
                      setIsPosting(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Announcement Title</label>
                        <input 
                          type="text" 
                          value={newsTitle}
                          onChange={(e) => setNewsTitle(e.target.value)}
                          placeholder="E.G. MIDTERM EXAM SCHEDULE"
                          className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black text-white placeholder:text-stone-600 focus:border-neon-cyan focus:bg-black/60 outline-none transition-all shadow-inner"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Target Audience</label>
                        <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10">
                          <button
                            type="button"
                            onClick={() => setNewsAudience('inschool')}
                            className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                              newsAudience === 'inschool'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-400/30'
                                : 'text-stone-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            In-School Only
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewsAudience('public')}
                            className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                              newsAudience === 'public'
                                ? 'bg-neon-cyan text-black shadow-md shadow-neon-cyan/30 border border-neon-cyan'
                                : 'text-stone-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            Public News
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">News Image</label>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => newsFileRef.current?.click()}
                            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-stone-400 text-[10px] font-black flex items-center justify-center gap-2 hover:bg-white/10 hover:text-white transition-all"
                          >
                            <Upload className="w-4 h-4" />
                            {newsImageFile ? newsImageFile.name : newsImagePreview ? 'Change Image' : 'Upload Image'}
                          </button>
                          <input 
                            type="file" 
                            ref={newsFileRef}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setNewsImageFile(file);
                                setNewsImagePreview(URL.createObjectURL(file));
                              }
                            }}
                            className="hidden"
                            accept="image/*"
                          />
                          {newsImagePreview && (
                            <div className="relative shrink-0">
                              <img src={newsImagePreview} className="w-12 h-12 rounded-xl object-cover border border-white/10 shadow-lg" alt="Preview" />
                              <button
                                type="button"
                                onClick={() => {
                                  setNewsImageFile(null);
                                  setNewsImagePreview('');
                                  if (newsFileRef.current) newsFileRef.current.value = '';
                                }}
                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-0.5 rounded-full hover:scale-110 transition-transform shadow"
                                title="Remove Image"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-3">Content</label>
                      <textarea 
                        value={newsContent}
                        onChange={(e) => setNewsContent(e.target.value)}
                        placeholder="Write news caption..."
                        rows={7}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black text-white placeholder:text-stone-600 focus:border-neon-cyan focus:bg-black/60 outline-none transition-all resize-none shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {editingNewsId && (
                      <button 
                        type="button"
                        onClick={handleCancelEditNews}
                        className="flex-1 bg-white/5 text-stone-300 py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all border border-white/10"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      disabled={isPosting || !newsTitle || !newsContent}
                      className="flex-1 bg-neon-blue text-white py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-neon-blue/20"
                    >
                      {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingNewsId ? <><Pencil className="w-4 h-4" /> Update News</> : <><Newspaper className="w-4 h-4" /> Post News</>}
                    </button>
                  </div>
                </form>

                {/* News List */}
                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <Newspaper className="w-3.5 h-3.5 text-stone-500" />
                    <h3 className="font-black text-stone-500 uppercase text-[9px] tracking-[0.2em]">Current News</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {news.length === 0 ? (
                      <div className="col-span-full text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <p className="text-stone-500 font-bold uppercase tracking-widest text-[8px]">No news posted yet</p>
                      </div>
                    ) : (
                      news.map((item) => (
                        <div key={item.id} className={`bg-white/5 p-4 rounded-2xl border ${editingNewsId === item.id ? 'border-[#00E5FF] bg-[#00E5FF]/5' : 'border-white/10'} flex items-center justify-between gap-4 transition-all`}>
                          <div className="flex items-center gap-4 overflow-hidden">
                            {item.imageUrl && (
                              <img src={item.imageUrl} className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" alt="" referrerPolicy="no-referrer" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h4 className="text-sm font-black italic uppercase text-white truncate max-w-[150px]">{item.title}</h4>
                                {item.audience === 'public' ? (
                                  <span className="px-2 py-0.5 bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan text-[8px] font-black rounded-full uppercase tracking-wider shrink-0">
                                    Public
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[8px] font-black rounded-full uppercase tracking-wider shrink-0">
                                    In-School
                                  </span>
                                )}
                              </div>
                              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">{new Date(item.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button 
                              onClick={() => handleStartEditNews(item)}
                              className="p-2.5 bg-[#00E5FF]/10 text-[#00E5FF] rounded-xl hover:bg-[#00E5FF] hover:text-black transition-all border border-[#00E5FF]/20"
                              title="Edit News"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setNewsToDelete(item)}
                              className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                              title="Delete News"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'students' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-neon-cyan" />
                  <h2 className="font-black text-stone-500 uppercase text-[10px] tracking-[0.3em]">Manage Students</h2>
                </div>
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600" />
                  <input 
                    type="text"
                    placeholder="SEARCH..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black placeholder:text-stone-600 focus:border-neon-cyan outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md space-y-6">
                <div className="bg-[#12151C] p-6 rounded-2xl border border-white/5 space-y-6 shadow-2xl shadow-black/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-red-500/10 rounded-xl text-red-500 shadow-inner">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-black italic uppercase tracking-tight text-white">Student Registration</h2>
                      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Enroll new student</p>
                    </div>
                  </div>

                  <form onSubmit={addStudent} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Full Name
                        </label>
                        <input 
                          type="text" 
                          value={addStuName}
                          onChange={(e) => setAddStuName(e.target.value)}
                          placeholder="Enter full name"
                          className="w-full px-5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs font-black placeholder:text-stone-700 focus:border-red-500/30 focus:bg-black/60 outline-none transition-all shadow-inner"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Password
                        </label>
                        <input 
                          type="text" 
                          value={addStuPass}
                          onChange={(e) => setAddStuPass(e.target.value)}
                          placeholder="Set password"
                          className="w-full px-5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs font-black placeholder:text-stone-700 focus:border-red-500/30 focus:bg-black/60 outline-none transition-all shadow-inner"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Gender
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            type="button"
                            onClick={() => setAddStuGender('Male')}
                            className={`py-2.5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all border ${
                              addStuGender === 'Male' 
                                ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' 
                                : 'bg-black/40 text-stone-500 border-white/5 hover:bg-black/60'
                            }`}
                          >
                            Male
                          </button>
                          <button 
                            type="button"
                            onClick={() => setAddStuGender('Female')}
                            className={`py-2.5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all border ${
                              addStuGender === 'Female' 
                                ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' 
                                : 'bg-black/40 text-stone-500 border-white/5 hover:bg-black/60'
                            }`}
                          >
                            Female
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">Grade</label>
                        <select 
                          value={addStuGrade}
                          onChange={(e) => setAddStuGrade(e.target.value as Grade)}
                          className="w-full px-5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs font-black text-white outline-none focus:border-red-500/30 transition-all appearance-none cursor-pointer"
                        >
                          <option value="9" className="bg-[#12151C]">Grade 9</option>
                          <option value="10" className="bg-[#12151C]">Grade 10</option>
                          <option value="11" className="bg-[#12151C]">Grade 11</option>
                          <option value="12" className="bg-[#12151C]">Grade 12</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">Section</label>
                        <select 
                          value={addStuSec}
                          onChange={(e) => setAddStuSec(e.target.value)}
                          className="w-full px-5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs font-black text-white outline-none focus:border-red-500/30 transition-all appearance-none cursor-pointer"
                        >
                          {['A', 'B', 'C', 'D', 'E', 'F'].map(sec => (
                            <option key={sec} value={sec} className="bg-[#12151C]">Section {sec}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">Stream</label>
                        <select 
                          value={addStuStream}
                          onChange={(e) => setAddStuStream(e.target.value as Stream)}
                          className="w-full px-5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs font-black text-white outline-none focus:border-red-500/30 transition-all appearance-none cursor-pointer"
                        >
                          <option value="Natural" className="bg-[#12151C]">Natural Science</option>
                          <option value="Social" className="bg-[#12151C]">Social Science</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 pt-2">
                      <div className="flex-1 flex items-center gap-4">
                        <button 
                          type="button"
                          onClick={() => stuFileRef.current?.click()}
                          className="flex-1 px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-stone-400 text-[10px] font-black flex items-center justify-center gap-2 hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                          <Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          {addStuPhotoFile ? addStuPhotoFile.name : 'Upload Photo'}
                        </button>
                        <input 
                          type="file" 
                          ref={stuFileRef}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setAddStuPhotoFile(file);
                              setAddStuPhotoPreview(URL.createObjectURL(file));
                            }
                          }}
                          className="hidden"
                          accept="image/*"
                        />
                        {addStuPhotoPreview && (
                          <div className="relative group">
                            <img src={addStuPhotoPreview} className="w-14 h-14 rounded-xl object-cover border-2 border-red-500/20 shadow-lg" alt="Preview" />
                            <button 
                              type="button"
                              onClick={() => {
                                setAddStuPhotoFile(null);
                                setAddStuPhotoPreview('');
                                if (stuFileRef.current) stuFileRef.current.value = '';
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        type="submit"
                        disabled={isAddingStudent || !addStuName || !addStuPass}
                        className="px-8 py-3.5 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-red-500/20 flex items-center justify-center gap-2 min-w-[180px]"
                      >
                        {isAddingStudent ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <><UserPlus className="w-4 h-4" /> Register Student</>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Student List */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <p className="text-stone-500 font-bold uppercase tracking-widest text-[10px]">No students found</p>
                    </div>
                  ) : (
                    filteredStudents.map((student) => (
                      <div key={student.studentID} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-4 hover:bg-white/[0.08] transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                            <img 
                              src={student.photoUrl || `https://picsum.photos/seed/${student.studentID}/100/100`} 
                              alt={student.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div>
                            <h4 className="text-sm font-black italic uppercase text-white leading-none">{student.name}</h4>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">ID: {student.studentID}</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest ${
                                student.gender === 'Male' ? 'text-blue-400' : 'text-pink-400'
                              }`}>{student.gender}</span>
                              <span className="text-[9px] font-black text-neon-cyan uppercase tracking-widest">G-{student.grade}/{student.section}</span>
                              <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest">{student.stream}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setSelectedStudent(student)}
                            className="p-2.5 bg-neon-cyan/10 text-neon-cyan rounded-xl hover:bg-neon-cyan hover:text-black transition-all border border-neon-cyan/20"
                            title="View Details"
                          >
                            <User className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setStudentToDelete(student.studentID);
                              setStudentNameToDelete(student.name);
                            }}
                            className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                            title="Delete Student"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'faculty' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Users className="w-4 h-4 text-neon-cyan" />
                <h2 className="font-black text-stone-500 uppercase text-[10px] tracking-[0.3em]">Faculty Management</h2>
              </div>
              
              <div className="grid gap-3">
                {teachers.length === 0 ? (
                  <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <p className="text-stone-500 font-bold uppercase tracking-widest text-[10px]">No faculty members found</p>
                  </div>
                ) : (
                  teachers.map((teacher) => (
                    <motion.div 
                      key={teacher.uid} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.07] transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-neon-cyan/10 rounded-xl flex items-center justify-center text-neon-cyan border border-neon-cyan/20">
                          <UserCircle className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-base font-black italic uppercase tracking-tight leading-none">{teacher.displayName || 'Unnamed Teacher'}</h3>
                          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">{teacher.email}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <p className="text-[9px] text-stone-600 font-black uppercase tracking-widest">Joined: {new Date(teacher.createdAt).toLocaleDateString()}</p>
                            {teacher.grade && teacher.section && (
                              <p className="text-[9px] text-neon-cyan font-black uppercase tracking-widest">Default: G-{teacher.grade}/{teacher.section}</p>
                            )}
                          </div>

                          {/* Assigned Classes badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Permitted Classes:</span>
                            {(teacher.assignedClasses || []).length > 0 ? (
                              (teacher.assignedClasses || []).map((cls) => (
                                <span key={cls} className="px-2 py-0.5 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-[9px] font-black uppercase rounded-md">
                                  Grade {cls}
                                </span>
                              ))
                            ) : (
                              <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-stone-500 text-[9px] font-bold uppercase rounded-md">
                                Unrestricted
                              </span>
                            )}
                          </div>

                          {/* Pending Class Requests Notification & 1-Click Approve */}
                          {(teacher.pendingClassRequests || []).length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                              <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                Class Access Form Request:
                              </span>
                              {(teacher.pendingClassRequests || []).map((reqClass) => (
                                <div key={reqClass} className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-black text-[9px] rounded-md border border-amber-500/40 uppercase">
                                    Grade {reqClass}
                                  </span>
                                  <button 
                                    onClick={() => approveTeacherClassRequest(teacher.uid, reqClass)}
                                    className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black text-[9px] font-black uppercase rounded-lg shadow-sm transition-all flex items-center gap-1"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    Approve & Assign
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {teacher.isApproved ? (
                          <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3" />
                            Verified
                          </div>
                        ) : (
                          <div className="px-3 py-1 bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-amber-500/20 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Pending
                          </div>
                        )}
                        
                        <div className="h-8 w-px bg-white/10 hidden md:block" />
                        
                        <button 
                          onClick={() => setSelectedTeacher(teacher)}
                          className="p-2.5 bg-white/5 text-stone-400 rounded-xl hover:bg-white/10 transition-all border border-white/10"
                          title="Manage Subjects"
                        >
                          <Settings className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => approveTeacher(teacher.uid, !teacher.isApproved)}
                          className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            teacher.isApproved 
                              ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' 
                              : 'bg-neon-cyan text-black border-neon-cyan hover:bg-neon-cyan/90 shadow-lg shadow-neon-cyan/20'
                          }`}
                        >
                          {teacher.isApproved ? 'Revoke' : 'Approve'}
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeTab === 'tsm' && (
            <section className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-neon-cyan animate-pulse" />
                  <h2 className="font-black text-stone-500 uppercase text-[10px] tracking-[0.3em]">Top Student Manager (TSM)</h2>
                </div>
                
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600" />
                  <input 
                    type="text"
                    placeholder="SEARCH STUDENTS..."
                    value={tsmSearch}
                    onChange={(e) => setTsmSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black placeholder:text-stone-600 focus:border-neon-cyan outline-none transition-all uppercase tracking-widest text-[#00E5FF]"
                  />
                </div>
              </div>

              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md space-y-6">
                <div className="bg-[#12151C] p-4 rounded-xl border border-white/5">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest leading-relaxed">
                    This manager lets you live-edit and remove student scores from the global <span className="text-neon-cyan">Top Student Chart / Leaderboard</span>. Resetting or clearing a score will drop the student from the rankings chart instantly.
                  </p>
                </div>

                <div className="grid gap-3">
                  {tsmUsers.filter(u => 
                    (u.displayName || '').toLowerCase().includes(tsmSearch.toLowerCase()) || 
                    (u.studentID || '').toLowerCase().includes(tsmSearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <p className="text-stone-500 font-bold uppercase tracking-widest text-[9px] tracking-[0.3em]">No student user accounts found</p>
                    </div>
                  ) : (
                    tsmUsers.filter(u => 
                      (u.displayName || '').toLowerCase().includes(tsmSearch.toLowerCase()) || 
                      (u.studentID || '').toLowerCase().includes(tsmSearch.toLowerCase())
                    ).map((student, index) => (
                      <motion.div 
                        key={student.uid} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.07] transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="font-mono text-xs font-black text-stone-500 w-8 text-center bg-white/5 rounded px-1.5 py-0.5">
                            {student.totalQuizPoints && student.totalQuizPoints > 0 ? `#${index + 1}` : "unranked"}
                          </div>
                          <div className="w-12 h-12 bg-white/5 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
                            {student.photoUrl ? (
                              <img src={student.photoUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <UserCircle className="w-8 h-8 text-stone-600" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-black italic uppercase text-white">{student.displayName}</h4>
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">
                              ID: {student.studentID || 'No ID'} &bull; Grade: {student.grade || 'N/A'}{student.section || ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 justify-between md:justify-end">
                          <div className="bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 flex flex-col items-end">
                            <span className="text-[6px] font-black text-stone-500 uppercase tracking-widest leading-none mb-1">SCORE / POINTS</span>
                            <span className="text-xs font-black font-mono text-[#00E5FF] tracking-wider leading-none">
                              {student.totalQuizPoints || 0} pts
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setEditingTsmUser(student);
                                setEditPointsInput(String(student.totalQuizPoints || 0));
                              }}
                              className="px-4 py-2 bg-neon-cyan/20 text-[#00E5FF] rounded-xl hover:bg-neon-cyan hover:text-black transition-all border border-[#00E5FF]/20 text-[9px] font-black uppercase tracking-widest animate-pulse"
                              title="Edit Points"
                            >
                              Edit Points
                            </button>
                            <button 
                              onClick={() => handleRemoveTsmScore(student)}
                              className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20 text-[9px] font-black uppercase tracking-widest"
                              title="Remove Score"
                            >
                              Remove Score
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Student Details Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-stone-900 rounded-3xl p-6 border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-neon-cyan/20">
                    <img 
                      src={selectedStudent.photoUrl || `https://picsum.photos/seed/${selectedStudent.studentID}/100/100`} 
                      alt={selectedStudent.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-white">{selectedStudent.name}</h3>
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">ID: {selectedStudent.studentID}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 bg-white/5 rounded-xl text-stone-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Grade & Section</p>
                    <p className="text-sm font-black text-neon-cyan uppercase tracking-tighter">G-{selectedStudent.grade} / {selectedStudent.section}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Stream</p>
                    <p className="text-sm font-black text-white uppercase tracking-tighter">{selectedStudent.stream}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-2">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Academic Performance</h4>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {Object.keys(selectedStudent.marks || {}).length === 0 ? (
                      <div className="text-center py-6 bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <p className="text-[8px] font-black text-stone-600 uppercase tracking-widest">No marks recorded</p>
                      </div>
                    ) : (
                      Object.entries(selectedStudent.marks || {}).map(([subject, mark]: [string, any]) => (
                        <div key={subject} className="bg-white/5 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-tight">{subject}</span>
                          <span className="text-xs font-black text-neon-cyan">{mark}%</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedStudent(null)}
                className="w-full mt-8 py-3 bg-white/5 text-stone-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all border border-white/10"
              >
                Close Panel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teacher Subjects Modal */}
      <AnimatePresence>
        {selectedTeacher && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-stone-900 rounded-3xl p-6 border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-neon-cyan/10 rounded-2xl flex items-center justify-center text-neon-cyan border border-neon-cyan/20">
                    <UserCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-white">{selectedTeacher.displayName}</h3>
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Faculty Member</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTeacher(null)}
                  className="p-2 bg-white/5 rounded-xl text-stone-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-2">
                    <GraduationCap className="w-3.5 h-3.5 text-neon-cyan" />
                    <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Assigned Subjects</h4>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {(selectedTeacher.subjects || []).length === 0 ? (
                      <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest px-2">No subjects assigned</p>
                    ) : (
                      (selectedTeacher.subjects || []).map((subject) => (
                        <div key={subject} className="flex items-center gap-2 px-3 py-1.5 bg-neon-cyan/10 text-neon-cyan rounded-lg border border-neon-cyan/20">
                          <span className="text-[10px] font-black uppercase tracking-tight">{subject}</span>
                          <button 
                            onClick={() => {
                              const newSubjects = (selectedTeacher.subjects || []).filter(s => s !== subject);
                              updateTeacherSubjects(selectedTeacher.uid, newSubjects);
                              setSelectedTeacher({ ...selectedTeacher, subjects: newSubjects });
                            }}
                            className="text-neon-cyan hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <input 
                      type="text" 
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="Add new subject..."
                      className="flex-1 px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-[10px] font-black placeholder:text-stone-700 focus:border-neon-cyan outline-none transition-all"
                    />
                    <button 
                      onClick={() => {
                        if (!newSubject) return;
                        const newSubjects = [...(selectedTeacher.subjects || []), newSubject.trim()];
                        updateTeacherSubjects(selectedTeacher.uid, newSubjects);
                        setSelectedTeacher({ ...selectedTeacher, subjects: newSubjects });
                        setNewSubject('');
                      }}
                      className="p-2.5 bg-neon-cyan text-black rounded-xl hover:brightness-110 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Restricted Class Access Assignments */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 px-2">
                    <Lock className="w-3.5 h-3.5 text-[#FFD700]" />
                    <h4 className="text-[10px] font-black text-[#FFD700] uppercase tracking-widest">
                      Restricted Class Access Assignments
                    </h4>
                  </div>
                  <p className="text-[10px] text-stone-400 font-medium px-2">
                    Select which specific classes this teacher is permitted to access and manage:
                  </p>
                  
                  <div className="grid grid-cols-4 gap-2">
                    {['9-A', '9-B', '9-C', '9-D', '10-A', '10-B', '10-C', '10-D', '11-A', '11-B', '11-C', '11-D', '12-A', '12-B', '12-C', '12-D'].map((classCode) => {
                      const isAssigned = (selectedTeacher.assignedClasses || []).includes(classCode);
                      return (
                        <button 
                          key={classCode}
                          onClick={() => {
                            const currentAssigned = selectedTeacher.assignedClasses || [];
                            const newAssigned = isAssigned
                              ? currentAssigned.filter(c => c !== classCode)
                              : [...currentAssigned, classCode];
                            
                            updateTeacherAssignedClasses(selectedTeacher.uid, newAssigned);
                            setSelectedTeacher({ ...selectedTeacher, assignedClasses: newAssigned });
                          }}
                          className={`py-2 px-1 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all border ${
                            isAssigned
                              ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                              : 'bg-white/5 border-white/10 text-stone-500 hover:bg-white/10 hover:text-stone-300'
                          }`}
                        >
                          Grade {classCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedTeacher(null)}
                className="w-full mt-8 py-3 bg-white/5 text-stone-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all border border-white/10"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Student Deletion Warning Modal */}
      <AnimatePresence>
        {studentToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-stone-950 border-2 border-red-500 rounded-3xl p-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full flex items-center justify-center shadow-lg shadow-red-500/10 animate-pulse">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-black uppercase tracking-tighter text-white">
                  Critical Warning
                </h3>

                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest leading-relaxed px-2">
                  You are about to permanently delete the student account for <span className="text-red-500 font-extrabold">{studentNameToDelete}</span> (ID: <span className="text-white">{studentToDelete}</span>). This action cannot be undone.
                </p>

                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 w-full text-left space-y-2 mt-2">
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest leading-none font-bold">CONSEQUENCES:</p>
                  <ul className="list-disc pl-4 text-[9px] font-bold text-stone-300 uppercase tracking-widest space-y-1.5 list-inside">
                    <li>The student's portal login access will be blocked immediately.</li>
                    <li>All academic records, performance charts, and grade points will be shredded.</li>
                    <li>This student record is deleted permanently from the core database.</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
                  <button 
                    onClick={() => {
                      setStudentToDelete(null);
                      setStudentNameToDelete('');
                    }}
                    className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black text-stone-400 uppercase tracking-widest transition-all"
                  >
                    CANCEL ACTION
                  </button>
                  <button 
                    onClick={() => deleteStudent(studentToDelete)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "SHRED STUDENT"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Success Modal for Student Registration (Principal Portal) */}
      <AnimatePresence>
        {showSuccessModal && registeredStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-gradient-to-b from-stone-900 to-black border-2 border-green-500/30 rounded-3xl p-6 shadow-[0_0_35px_rgba(34,197,94,0.15)] relative overflow-hidden"
            >
              {/* Accent neon green line top */}
              <div className="absolute top-0 left-0 w-full h-1 bg-green-500 animate-pulse" />
              
              <div className="flex flex-col items-center text-center gap-4">
                {/* Glowing Green Right Check Icon in the Middle */}
                <div className="w-16 h-16 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.2)] animate-pulse">
                  <CheckCircle className="w-8 h-8" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-lg font-black uppercase tracking-widest text-[#00E5FF]">
                    Student Registered
                  </h3>
                  <p className="text-[7px] font-black text-stone-500 uppercase tracking-[0.3em]">
                    Enrollment Completed Successfully
                  </p>
                </div>

                {/* Student Card Block */}
                <div className="bg-stone-950/80 border border-white/5 rounded-2xl p-4 w-full text-center space-y-1">
                  <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest leading-none">STUDENT NAME</p>
                  <p className="text-sm font-black text-white uppercase italic tracking-wide">{registeredStudent.name}</p>
                  
                  <div className="pt-2 mt-2 border-t border-white/5 flex flex-col items-center">
                    <span className="text-[6px] font-black text-stone-600 uppercase tracking-tighter leading-none mb-1">PORTAL LOGIN ID</span>
                    <span className="text-xs font-mono font-black text-[#00E5FF] tracking-wider select-all">{registeredStudent.id}</span>
                  </div>
                </div>

                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest leading-relaxed max-w-[240px]">
                  Student was successfully registered in <span className="text-[#00E5FF]">grade {registeredStudent.grade} (sec {registeredStudent.section})</span>. Give them the Login ID above to access their portal dashboard.
                </p>

                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setRegisteredStudent(null);
                  }}
                  className="w-full py-3.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-widest text-[9px] rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-[1.01] active:scale-[0.98] transition-all"
                >
                  CONTINUE WORKSPACE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit TSM Points Modal */}
      <AnimatePresence>
        {editingTsmUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-stone-950 border-2 border-[#00E5FF]/30 rounded-3xl p-6 shadow-[0_0_35px_rgba(0,229,255,0.15)] relative overflow-hidden"
            >
              {/* Top border glow */}
              <div className="absolute top-0 left-0 w-full h-1 bg-[#00E5FF] animate-pulse" />
              
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                  <Crown className="w-8 h-8" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-lg font-black uppercase tracking-widest text-[#00E5FF]">Edit Student Score</h3>
                  <p className="text-[7px] font-black text-stone-500 uppercase tracking-[0.3em]">Leaderboard Adjustments</p>
                </div>

                <div className="bg-stone-900 border border-white/5 rounded-2xl p-4 w-full space-y-2 text-left">
                  <div>
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest leading-none mb-1">STUDENT NAME</p>
                    <p className="text-sm font-black text-white uppercase italic">{editingTsmUser.displayName}</p>
                  </div>
                  <div>
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest leading-none mb-1">GRADE / SECTION</p>
                    <p className="text-xs font-black text-[#00E5FF] uppercase">{editingTsmUser.grade ? `${editingTsmUser.grade}th ${editingTsmUser.section || ''}` : 'N/A'}</p>
                  </div>
                </div>

                <div className="w-full space-y-1.5 text-left">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">New Total Quiz Points</label>
                  <input 
                    type="number"
                    value={editPointsInput}
                    onChange={(e) => setEditPointsInput(e.target.value)}
                    placeholder="EX. 1500"
                    className="w-full px-5 py-3.5 bg-black/40 border border-white/10 rounded-xl text-base font-bold text-white placeholder:text-stone-700 focus:border-neon-cyan focus:bg-black/80 outline-none transition-all shadow-inner text-center font-mono"
                  />
                </div>

                <div className="flex gap-3 w-full mt-2">
                  <button 
                    onClick={() => {
                      setEditingTsmUser(null);
                      setEditPointsInput('');
                    }}
                    className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black text-stone-400 uppercase tracking-widest transition-all"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => {
                      const parsed = parseInt(editPointsInput);
                      if (isNaN(parsed) || parsed < 0) {
                        alert('Please enter a valid non-negative points number');
                        return;
                      }
                      handleSaveTsmPoints(editingTsmUser.uid, parsed);
                    }}
                    disabled={isSavingPoints}
                    className="flex-1 py-3 bg-neon-cyan hover:brightness-110 disabled:opacity-50 text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-neon-cyan/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isSavingPoints ? <Loader2 className="w-4 h-4 animate-spin" /> : "SAVE CHANGES"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* News Deletion Confirmation Modal */}
      <AnimatePresence>
        {newsToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-stone-950 border-2 border-red-500/80 rounded-3xl p-6 shadow-[0_0_35px_rgba(239,68,68,0.25)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse" />

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full flex items-center justify-center shadow-lg shadow-red-500/10 animate-pulse">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">
                    Delete Announcement
                  </h3>
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em]">Confirmation Required</p>
                </div>

                <p className="text-xs font-semibold text-stone-300 leading-relaxed px-2">
                  Are you sure you want to permanently delete the news announcement <span className="text-red-400 font-black">"{newsToDelete.title}"</span>?
                </p>

                <div className="bg-red-500/5 border border-red-500/15 rounded-2xl p-4 w-full text-left space-y-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Notice:</p>
                  <p className="text-[10px] text-stone-300 font-medium leading-normal">
                    This announcement will be removed from all student and teacher dashboards immediately. This action cannot be undone.
                  </p>
                </div>

                <div className="flex gap-3 w-full mt-2">
                  <button 
                    onClick={() => setNewsToDelete(null)}
                    className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black text-stone-400 uppercase tracking-widest transition-all"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => deleteNews(newsToDelete.id)}
                    disabled={isDeletingNews}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isDeletingNews ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "DELETE NEWS"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
