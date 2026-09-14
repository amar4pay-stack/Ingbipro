import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, addDoc, deleteDoc, setDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, StudentRecord, GlobalSettings, QuizData, QuizQuestion, Stream, Grade, NewsItem } from '../types';
import { Users, GraduationCap, Save, Loader2, Search, Plus, X, BookOpen, Trash2, Clock, Newspaper, Calendar, User, Lock, UserPlus, AlertCircle, ArrowUpDown, CheckCircle, Image, Edit2, Edit3, Eye, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { compressAndEncodeImage } from '../utils/fileUtils';

export default function TeacherDashboard({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMarks, setEditingMarks] = useState<{ [studentId: string]: { [subject: string]: number } }>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'students' | 'quizzes' | 'news' | 'attendance' | 'registration'>('students');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>(user.subjects || ['MATH', 'HISTORY', 'ENGLISH', 'AFFAN OROMO', 'IT']);
  const [newSubject, setNewSubject] = useState('');
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [allQuizzes, setAllQuizzes] = useState<QuizData[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream>('Natural');
  const [editingQuiz, setEditingQuiz] = useState<QuizData | null>(null);
  const [newQuizSubject, setNewQuizSubject] = useState('');
  const [isSavingQuiz, setIsSavingQuiz] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [isAttendanceStarted, setIsAttendanceStarted] = useState(false);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  const [attendanceResults, setAttendanceResults] = useState<{ [id: string]: 'present' | 'absent' }>({});
  const [isAttendanceFinished, setIsAttendanceFinished] = useState(false);
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historyDetails, setHistoryDetails] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attSearch, setAttSearch] = useState('');

  const historyDates = React.useMemo(() => {
    const dates = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push({
        full: d.toLocaleDateString('en-GB'),
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDay: d.toLocaleDateString('en-US', { weekday: 'long' }),
        date: d.getDate().toString().padStart(2, '0'),
        month: d.toLocaleDateString('en-US', { month: 'long' })
      });
    }
    return dates;
  }, []);

  const filteredHistoryDates = React.useMemo(() => {
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toLocaleDateString('en-GB');

    if (!attSearch) {
      return historyDates.filter(d => d.full === yesterdayStr);
    }
    
    const search = attSearch.toLowerCase();
    return historyDates.filter(d => 
      d.full.toLowerCase().includes(search) || 
      d.month.toLowerCase().includes(search)
    );
  }, [historyDates, attSearch]);

  useEffect(() => {
    if (!user.grade || !user.section || activeTab !== 'attendance') return;
    const q = query(
      collection(db, 'attendance'),
      where('grade', '==', user.grade),
      where('section', '==', user.section)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => doc.data());
      setAttendanceHistory(history);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    });
    return () => unsub();
  }, [user.grade, user.section, activeTab]);

  const fetchHistoryDetails = async (date: string) => {
    if (selectedHistoryDate === date) {
      setSelectedHistoryDate(null);
      setHistoryDetails(null);
      return;
    }
    setSelectedHistoryDate(date);
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('grade', '==', user.grade),
        where('section', '==', user.section),
        where('date', '==', date)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setHistoryDetails(snap.docs[0].data());
      } else {
        setHistoryDetails(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    } finally {
      setLoadingHistory(false);
    }
  };

  const finishAttendance = async () => {
    if (Object.keys(attendanceResults).length === 0) return;
    
    const anyAbsent = Object.values(attendanceResults).some(v => v === 'absent');
    const allPresent = !anyAbsent && Object.keys(attendanceResults).length === filteredStudents.length;

    const attendanceDoc = {
      date: attendanceDate,
      grade: user.grade,
      section: user.section,
      teacherId: user.uid,
      results: attendanceResults,
      anyAbsent,
      allPresent,
      timestamp: new Date().toISOString()
    };

    try {
      const docId = `${attendanceDate.replace(/\//g, '-')}_${user.grade}_${user.section}`;
      await setDoc(doc(db, 'attendance', docId), attendanceDoc);
      setIsAttendanceFinished(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendance');
    }
  };

  const toggleAttendance = (studentId: string) => {
    setAttendanceResults(prev => {
      const current = prev[studentId];
      if (current === 'present') return { ...prev, [studentId]: 'absent' };
      return { ...prev, [studentId]: 'present' };
    });
  };

  const finishAttendanceManual = async () => {
    if (Object.keys(attendanceResults).length < filteredStudents.length) {
      if (!confirm('Some students are not marked. Continue?')) return;
    }
    await finishAttendance();
  };

  const handleAttendance = (direction: 'present' | 'absent') => {
    const studentId = filteredStudents[currentStudentIndex].studentID;
    setAttendanceResults(prev => ({ ...prev, [studentId]: direction }));
    if (currentStudentIndex < filteredStudents.length - 1) {
      setCurrentStudentIndex(prev => prev + 1);
    } else {
      finishAttendance();
    }
  };

  // Student Registration State
  const [addStuName, setAddStuName] = useState('');
  const [addStuPass, setAddStuPass] = useState('');
  const [addStuGender, setAddStuGender] = useState<'Male' | 'Female'>('Male');
  const [addStuPhotoFile, setAddStuPhotoFile] = useState<File | null>(null);
  const [addStuPhotoPreview, setAddStuPhotoPreview] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [sortBy, setSortBy] = useState<'none' | 'name-asc'>('none');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredStudent, setRegisteredStudent] = useState<{ id: string; name: string } | null>(null);
  const stuFileRef = React.useRef<HTMLInputElement>(null);

  // Quiz Maker State (Manual Input & Management)
  const [quizSubject, setQuizSubject] = useState('');
  const [quizGrade, setQuizGrade] = useState<Grade>((user.grade as Grade) || '12');
  const [quizStream, setQuizStream] = useState<Stream>(user.stream || 'Social');
  const [quizSection, setQuizSection] = useState<string>(user.section || 'A');

  // Keep quiz target strictly in sync with the teacher's active logged-in classroom
  useEffect(() => {
    if (user.grade) setQuizGrade(user.grade as Grade);
    if (user.section) setQuizSection(user.section);
    if (user.stream) setQuizStream(user.stream);
  }, [user.grade, user.section, user.stream]);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [quizToDelete, setQuizToDelete] = useState<QuizData | null>(null);
  const [isDeletingQuiz, setIsDeletingQuiz] = useState(false);
  const [previewQuiz, setPreviewQuiz] = useState<QuizData | null>(null);
  const [quizFilter, setQuizFilter] = useState<'my' | 'all'>('my');
  const [quizSearchTerm, setQuizSearchTerm] = useState('');
  const [quizSuccessMsg, setQuizSuccessMsg] = useState<string | null>(null);
  const quizEditorRef = React.useRef<HTMLDivElement>(null);
  const [questionText, setQuestionText] = useState('');
  const [quizOptions, setQuizOptions] = useState({ a: '', b: '', c: '', d: '' });
  const [correctOption, setCorrectOption] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [questionNumber, setQuestionNumber] = useState(1);
  const [quizTimeLimit, setQuizTimeLimit] = useState(30);
  const [noTimeLimit, setNoTimeLimit] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const questionImageFileRef = React.useRef<HTMLInputElement>(null);
  const [questionImageFile, setQuestionImageFile] = useState<File | null>(null);
  const [questionImagePreview, setQuestionImagePreview] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'quizzes'));
    const unsub = onSnapshot(q, (snapshot) => {
      const quizData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as QuizData[];
      setAllQuizzes(quizData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'quizzes');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user.subjects) {
      setSubjects(user.subjects);
    }
  }, [user.subjects]);

  useEffect(() => {
    const fetchSettings = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'global'));
      if (docSnap.exists()) {
        setSettings(docSnap.data() as GlobalSettings);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!user.grade || !user.section) return;

    const q = query(
      collection(db, 'students'), 
      where('grade', '==', user.grade),
      where('section', '==', user.section)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const studentData = snapshot.docs.map(doc => ({
        studentID: doc.id,
        ...doc.data()
      })) as StudentRecord[];
      setStudents(studentData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students');
    });

    return () => unsub();
  }, [user.grade, user.section]);
  
  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('date', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snapshot) => {
      const newsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NewsItem[];
      const inSchoolNews = newsData.filter(item => item.audience !== 'public');
      setNews(inSchoolNews);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'news');
    });
    return () => unsub();
  }, []);

  const handleMarkChange = (studentId: string, subject: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditingMarks(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subject]: numValue
      }
    }));
  };

  const saveMarks = async (studentId: string) => {
    const marksToSave = editingMarks[studentId];
    if (!marksToSave) return;

    setSaving(studentId);
    try {
      const student = students.find(s => s.studentID === studentId);
      const updatedMarks = { ...(student?.marks || {}), ...marksToSave };
      
      await updateDoc(doc(db, 'students', studentId), {
        marks: updatedMarks
      });
      
      setEditingMarks(prev => {
        const newState = { ...prev };
        delete newState[studentId];
        return newState;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`);
    } finally {
      setSaving(null);
    }
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const subject = newSubject.trim().toUpperCase();
    if (!subject) return;
    
    if (!subjects.includes(subject)) {
      const updatedSubjects = [...subjects, subject];
      setSubjects(updatedSubjects);
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          subjects: updatedSubjects
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
    setNewSubject('');
  };

  const removeSubject = async (subjectToRemove: string) => {
    const updatedSubjects = subjects.filter(s => s !== subjectToRemove);
    setSubjects(updatedSubjects);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        subjects: updatedSubjects
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const filteredStudents = React.useMemo(() => {
    let result = students.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentID.includes(searchTerm)
    );
    
    if (sortBy === 'name-asc') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return result;
  }, [students, searchTerm, sortBy]);

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStuName || !addStuPass) return;
    
    if (!user.isApproved) {
      alert('Your account is not yet approved by the principal. You cannot add students.');
      return;
    }

    setIsAddingStudent(true);
    try {
      let photoUrl = '';
      if (addStuPhotoFile) {
        photoUrl = await compressAndEncodeImage(addStuPhotoFile, 400);
      }

      const studentId = `STU${Math.floor(1000 + Math.random() * 9000)}`;
      await setDoc(doc(db, 'students', studentId), {
        studentID: studentId,
        name: addStuName.trim(),
        password: addStuPass.trim(),
        gender: addStuGender,
        grade: user.grade || '12',
        section: user.section || 'A',
        stream: user.stream || 'Social',
        photoUrl,
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
      setRegisteredStudent({ id: studentId, name: addStuName.trim() });
      setShowSuccessModal(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'students');
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleStartEditQuiz = (quiz: QuizData) => {
    setEditingQuizId(quiz.id);
    setQuizSubject(quiz.subject);
    setQuizGrade(quiz.grade || (user.grade as Grade) || '12');
    setQuizStream(quiz.stream || user.stream || 'Social');
    setQuizSection(quiz.section || user.section || 'A');
    if (quiz.timeLimit === 0) {
      setNoTimeLimit(true);
      setQuizTimeLimit(30);
    } else {
      setNoTimeLimit(false);
      setQuizTimeLimit(Math.max(1, Math.floor(quiz.timeLimit / 60)));
    }
    setQuizQuestions([...quiz.questions]);
    setQuestionText('');
    setQuizOptions({ a: '', b: '', c: '', d: '' });
    setCorrectOption('A');
    setQuestionNumber(quiz.questions.length + 1);
    setQuestionImageFile(null);
    setQuestionImagePreview('');
    setEditingQuestionIndex(null);

    setTimeout(() => {
      quizEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleCancelEditQuiz = () => {
    setEditingQuizId(null);
    setQuizSubject('');
    setQuizQuestions([]);
    setQuestionText('');
    setQuizOptions({ a: '', b: '', c: '', d: '' });
    setCorrectOption('A');
    setQuestionNumber(1);
    setQuestionImageFile(null);
    setQuestionImagePreview('');
    setEditingQuestionIndex(null);
    if (questionImageFileRef.current) {
      questionImageFileRef.current.value = '';
    }
  };

  const handleConfirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    setIsDeletingQuiz(true);
    try {
      await deleteDoc(doc(db, 'quizzes', quizToDelete.id));
      if (editingQuizId === quizToDelete.id) {
        handleCancelEditQuiz();
      }
      setQuizSuccessMsg(`Quiz "${quizToDelete.subject}" was deleted successfully.`);
      setQuizToDelete(null);
      setTimeout(() => setQuizSuccessMsg(null), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${quizToDelete.id}`);
    } finally {
      setIsDeletingQuiz(false);
    }
  };

  const handleAddOrUpdateQuestion = async () => {
    if (!questionText.trim()) return;
    
    setIsSavingQuiz(true);
    let questionImgUrl = questionImagePreview;
    if (questionImageFile) {
      try {
        questionImgUrl = await compressAndEncodeImage(questionImageFile, 800);
      } catch (err) {
        console.error("Error compressing question image:", err);
      }
    }

    const qItem: QuizQuestion = {
      question: questionText.trim(),
      options: [quizOptions.a, quizOptions.b, quizOptions.c, quizOptions.d],
      correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctOption),
      ...(questionImgUrl ? { image: questionImgUrl } : {})
    };
    
    if (editingQuestionIndex !== null) {
      setQuizQuestions(prev => {
        const copy = [...prev];
        copy[editingQuestionIndex] = qItem;
        return copy;
      });
      setEditingQuestionIndex(null);
      setQuestionNumber(quizQuestions.length + 1);
    } else {
      setQuizQuestions(prev => [...prev, qItem]);
      setQuestionNumber(prev => prev + 1);
    }

    setQuestionText('');
    setQuizOptions({ a: '', b: '', c: '', d: '' });
    setCorrectOption('A');
    setQuestionImageFile(null);
    setQuestionImagePreview('');
    if (questionImageFileRef.current) {
      questionImageFileRef.current.value = '';
    }
    setIsSavingQuiz(false);
  };

  const handleEditQuestionInList = (index: number) => {
    const q = quizQuestions[index];
    if (!q) return;
    setEditingQuestionIndex(index);
    setQuestionNumber(index + 1);
    setQuestionText(q.question);
    setQuizOptions({
      a: q.options[0] || '',
      b: q.options[1] || '',
      c: q.options[2] || '',
      d: q.options[3] || ''
    });
    const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    setCorrectOption(letters[q.correctAnswer] || 'A');
    setQuestionImagePreview(q.image || '');
    setQuestionImageFile(null);
  };

  const handleCancelQuestionEdit = () => {
    setEditingQuestionIndex(null);
    setQuestionText('');
    setQuizOptions({ a: '', b: '', c: '', d: '' });
    setCorrectOption('A');
    setQuestionNumber(quizQuestions.length + 1);
    setQuestionImageFile(null);
    setQuestionImagePreview('');
    if (questionImageFileRef.current) {
      questionImageFileRef.current.value = '';
    }
  };

  const handleRemoveQuestionFromList = (index: number) => {
    setQuizQuestions(prev => prev.filter((_, i) => i !== index));
    if (editingQuestionIndex === index) {
      handleCancelQuestionEdit();
    } else if (editingQuestionIndex !== null && editingQuestionIndex > index) {
      setEditingQuestionIndex(prev => (prev !== null ? prev - 1 : null));
    }
  };

  const handleSaveQuiz = async () => {
    let questionsToSave = [...quizQuestions];
    
    if (questionText.trim()) {
      let currentQuestionImgUrl = questionImagePreview;
      if (questionImageFile) {
        try {
          currentQuestionImgUrl = await compressAndEncodeImage(questionImageFile, 800);
        } catch (err) {
          console.error("Error compressing final question image:", err);
        }
      }
      const qItem: QuizQuestion = {
        question: questionText.trim(),
        options: [quizOptions.a, quizOptions.b, quizOptions.c, quizOptions.d],
        correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctOption),
        ...(currentQuestionImgUrl ? { image: currentQuestionImgUrl } : {})
      };
      if (editingQuestionIndex !== null) {
        questionsToSave[editingQuestionIndex] = qItem;
      } else {
        questionsToSave.push(qItem);
      }
    }

    if (questionsToSave.length === 0 || !quizSubject.trim()) {
      return;
    }
    
    setIsSavingQuiz(true);
    try {
      const targetGrade = (user.grade as Grade) || quizGrade || '12';
      const targetSection = user.section || quizSection || 'A';
      const targetStream = user.stream || quizStream || 'Social';

      if (editingQuizId) {
        // UPDATE EXISTING POSTED QUIZ
        const updatePayload = {
          subject: quizSubject.trim().toUpperCase(),
          grade: targetGrade,
          stream: targetStream,
          section: targetSection,
          questions: questionsToSave,
          timeLimit: noTimeLimit ? 0 : quizTimeLimit * 60,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(doc(db, 'quizzes', editingQuizId), updatePayload);
        setQuizSuccessMsg(`Quiz "${quizSubject.trim().toUpperCase()}" updated for Grade ${targetGrade} - Section ${targetSection}!`);
        handleCancelEditQuiz();
        setTimeout(() => setQuizSuccessMsg(null), 4000);
      } else {
        // CREATE NEW POSTED QUIZ
        const quizDoc = {
          subject: quizSubject.trim().toUpperCase(),
          grade: targetGrade,
          stream: targetStream,
          section: targetSection,
          questions: questionsToSave,
          timeLimit: noTimeLimit ? 0 : quizTimeLimit * 60,
          createdAt: new Date().toISOString(),
          teacherId: user.uid,
          teacherEmail: user.email || '',
          teacherName: user.displayName || user.email?.split('@')[0] || 'Teacher'
        };

        await addDoc(collection(db, 'quizzes'), quizDoc);
        setQuizSuccessMsg(`Quiz "${quizSubject.trim().toUpperCase()}" posted to Grade ${targetGrade} - Section ${targetSection}!`);
        handleCancelEditQuiz();
        setTimeout(() => setQuizSuccessMsg(null), 4000);
      }
    } catch (error) {
      handleFirestoreError(error, editingQuizId ? OperationType.UPDATE : OperationType.CREATE, `quizzes/${editingQuizId || ''}`);
    } finally {
      setIsSavingQuiz(false);
    }
  };

  const displayedQuizzes = React.useMemo(() => {
    return allQuizzes.filter(q => {
      const isMine = q.teacherId === user.uid || q.teacherEmail === user.email;
      if (quizFilter === 'my') {
        return isMine || (!q.teacherId && q.grade === user.grade && (user.subjects || []).includes(q.subject));
      }
      return true;
    }).filter(q => {
      if (!quizSearchTerm.trim()) return true;
      const term = quizSearchTerm.toLowerCase();
      return (
        q.subject.toLowerCase().includes(term) ||
        (q.grade && q.grade.toLowerCase().includes(term)) ||
        (q.stream && q.stream.toLowerCase().includes(term))
      );
    });
  }, [allQuizzes, quizFilter, quizSearchTerm, user.uid, user.email, user.grade, user.subjects]);

  const handleDeleteStudent = async (studentID: string) => {
    if (!user.isApproved) {
      alert('Your account is not yet approved by the principal. You cannot delete students.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'students', studentID));
      setStudentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${studentID}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-white p-3 md:p-4">
      {/* Quiz Delete Confirmation Modal */}
      <AnimatePresence>
        {quizToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm bg-[#0E131F] border border-red-500/40 rounded-3xl p-6 text-center space-y-5 shadow-[0_0_50px_rgba(239,68,68,0.25)]"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mx-auto text-red-400">
                <Trash2 className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black italic uppercase tracking-tight text-white">Delete Quiz?</h3>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Are you sure you want to permanently delete the posted quiz for <strong className="text-white">{quizToDelete.subject}</strong>?
                </p>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-300 font-medium">
                  Grade {quizToDelete.grade} • {quizToDelete.stream} Stream • {quizToDelete.questions.length} Questions
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  type="button"
                  disabled={isDeletingQuiz}
                  onClick={() => setQuizToDelete(null)}
                  className="py-3 bg-white/5 border border-white/10 text-stone-300 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  disabled={isDeletingQuiz}
                  onClick={handleConfirmDeleteQuiz}
                  className="py-3 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-red-500/25 flex items-center justify-center gap-1.5"
                >
                  {isDeletingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" /> Yes, Delete</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quiz Preview Modal */}
      <AnimatePresence>
        {previewQuiz && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-[#0E131F] border border-white/10 rounded-3xl p-6 space-y-5 max-h-[85vh] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/10 text-[#00E5FF] flex items-center justify-center border border-[#00E5FF]/20">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black italic uppercase tracking-tight text-white">{previewQuiz.subject}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                      <span>Grade {previewQuiz.grade}</span>
                      <span>•</span>
                      <span>{previewQuiz.stream}</span>
                      <span>•</span>
                      <span>{previewQuiz.timeLimit > 0 ? `${Math.floor(previewQuiz.timeLimit / 60)} Mins` : 'No Time Limit'}</span>
                      <span>•</span>
                      <span className="text-[#00E5FF]">{previewQuiz.questions.length} Questions</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewQuiz(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {previewQuiz.questions.map((q, idx) => (
                  <div key={idx} className="p-4 bg-black/30 border border-white/5 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#00E5FF]/20 text-[#00E5FF] font-black text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <p className="text-sm font-bold text-white">{q.question}</p>
                      </div>
                    </div>

                    {q.image && (
                      <div className="rounded-xl overflow-hidden border border-white/10 max-w-sm">
                        <img src={q.image} alt="Question" className="w-full max-h-48 object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, optIdx) => {
                        const letter = ['A', 'B', 'C', 'D'][optIdx];
                        const isCorrect = q.correctAnswer === optIdx;
                        return (
                          <div 
                            key={optIdx} 
                            className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                              isCorrect 
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold' 
                                : 'bg-white/5 border-white/5 text-stone-300'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isCorrect ? 'bg-emerald-500 text-black' : 'bg-white/10 text-stone-400'
                            }`}>
                              {letter}
                            </span>
                            <span className="flex-1 truncate">{opt}</span>
                            {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setPreviewQuiz(null)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-stone-300 rounded-xl text-xs font-bold transition-all"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const qToEdit = previewQuiz;
                    setPreviewQuiz(null);
                    handleStartEditQuiz(qToEdit);
                  }}
                  className="px-4 py-2.5 bg-amber-400 text-black hover:brightness-110 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit This Quiz
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {studentToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xs bg-black border-2 border-red-500 rounded-3xl p-8 text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-white">Warning</h3>
                <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest leading-relaxed">
                  Do you want to delete this student permanently?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setStudentToDelete(null)}
                  className="py-3 bg-white/5 border border-white/10 text-stone-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
                >
                  NO
                </button>
                <button 
                  onClick={() => handleDeleteStudent(studentToDelete)}
                  className="py-3 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-red-500/20"
                >
                  YES
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Classroom Manager Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-32 rounded-2xl overflow-hidden border border-white/10 shadow-xl"
        >
          <img 
            src={settings?.gateImageUrl || "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80"} 
            alt="Classroom" 
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0C10] via-transparent to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
            <h1 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-white mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              CLASSROOM <span className="text-[#FFD700]">MANAGER</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="px-3 py-0.5 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-full text-[#FFD700] text-[8px] font-black uppercase tracking-widest">
                Grade {user.grade}
              </span>
              <span className="w-6 h-6 flex items-center justify-center bg-white/5 border border-white/10 rounded-full text-stone-400 text-[8px] font-black uppercase">
                {user.section}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-5 gap-1.5">
          <button 
            onClick={() => setActiveTab('students')}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all ${
              activeTab === 'students' 
                ? 'bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                : 'bg-white/5 text-stone-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Students
          </button>
          <button 
            onClick={() => setActiveTab('quizzes')}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all ${
              activeTab === 'quizzes' 
                ? 'bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                : 'bg-white/5 text-stone-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Quizzes
          </button>
          <button 
            onClick={() => setActiveTab('news')}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all ${
              activeTab === 'news' 
                ? 'bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                : 'bg-white/5 text-stone-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            News
          </button>
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all ${
              activeTab === 'attendance' 
                ? 'bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                : 'bg-white/5 text-stone-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Attendance
          </button>
          <button 
            onClick={() => setActiveTab('registration')}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all ${
              activeTab === 'registration' 
                ? 'bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                : 'bg-white/5 text-stone-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'students' && (
            <div 
              key="students-tab"
              className="space-y-4"
            >
              {/* My Subjects Section */}
              <div className="bg-[#12151C] p-3 md:p-4 rounded-2xl border border-white/5 space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-base font-black italic uppercase tracking-tight text-[#FFD700]">My Subjects</h2>
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Add or remove class subjects</p>
                </div>

                <form onSubmit={addSubject} className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      placeholder="SUBJECT NAME"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full px-3 py-3 bg-black/40 border border-white/10 rounded-lg text-[10px] font-black text-white placeholder:text-stone-600 focus:border-[#FFD700] outline-none transition-all"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="p-3 bg-[#FFD700] text-black rounded-lg hover:brightness-110 transition-all shadow-lg shadow-[#FFD700]/20"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((subject) => (
                    <div 
                      key={subject}
                      className="flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded-md group hover:border-[#FFD700]/30 transition-all"
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest text-stone-300 group-hover:text-white">{subject}</span>
                      <button 
                        onClick={() => removeSubject(subject)}
                        className="text-stone-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approval Status Warning */}
              {!user.isApproved && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Account Pending Approval</p>
                    <p className="text-[9px] font-medium text-stone-400 leading-relaxed">Your account must be approved by the principal before you can add or delete students. Please contact your school administrator.</p>
                  </div>
                </div>
              )}

              {/* Search & Sort Bar */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between bg-black border border-neon-cyan/30 p-4 rounded-2xl">
                  <span className="text-[11px] font-black text-white uppercase tracking-widest">Marking Mode</span>
                  <button 
                    onClick={() => setIsMarkingMode(!isMarkingMode)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isMarkingMode ? 'bg-neon-cyan' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${isMarkingMode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="relative group flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600 group-focus-within:text-neon-blue transition-colors" />
                    <input 
                      type="text"
                      placeholder="SEARCH STUDENTS..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3.5 bg-[#12151C] border border-white/5 rounded-xl text-[11px] font-black placeholder:text-stone-600 focus:border-neon-blue outline-none transition-all text-white"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="h-full px-4 bg-[#12151C] border border-white/5 rounded-xl text-[11px] font-black text-stone-400 focus:border-neon-blue outline-none transition-all appearance-none cursor-pointer pr-10"
                    >
                      <option value="none">SORT BY</option>
                      <option value="name-asc">NAME A-Z</option>
                    </select>
                    <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Student List */}
              <div className="space-y-6">
                {loading ? (
                  <div className="p-10 text-center bg-[#12151C] rounded-[2rem] border border-white/5 shadow-2xl">
                    <Loader2 className="w-10 h-10 animate-spin text-neon-blue mx-auto mb-4" />
                    <p className="text-stone-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Accessing Student Records...</p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="p-10 text-center bg-[#12151C] rounded-[2rem] border border-white/5 shadow-2xl">
                    <p className="text-stone-500 font-black uppercase tracking-widest text-[10px]">No students found in this section</p>
                  </div>
                ) : !isMarkingMode ? (
                  /* Table View (Default) */
                  <div className="bg-black border border-neon-cyan/20 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-bottom border-neon-cyan/20 bg-neon-cyan/5">
                          <th className="px-4 py-3 text-[11px] font-black text-neon-cyan uppercase tracking-widest">#</th>
                          <th className="px-4 py-3 text-[11px] font-black text-neon-cyan uppercase tracking-widest">Full Name</th>
                          <th className="px-4 py-3 text-[11px] font-black text-neon-cyan uppercase tracking-widest">Gender</th>
                          <th className="px-4 py-3 text-[11px] font-black text-neon-cyan uppercase tracking-widest">Student ID</th>
                          <th className="px-4 py-3 text-[11px] font-black text-neon-cyan uppercase tracking-widest text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student, index) => (
                          <tr key={student.studentID} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-4 text-[11px] font-black text-stone-500">{(index + 1).toString().padStart(2, '0')}</td>
                            <td className="px-4 py-4 text-[12px] font-black text-white uppercase italic">{student.name}</td>
                            <td className="px-4 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                student.gender === 'Male' 
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                  : 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                              }`}>
                                {student.gender}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-[11px] font-black text-stone-400 tracking-wider">{student.studentID}</td>
                            <td className="px-4 py-4 text-right">
                              <button 
                                onClick={() => setStudentToDelete(student.studentID)}
                                className="p-1.5 text-red-500/50 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Card View (Marking Mode ON) */
                  filteredStudents.map((student, index) => (
                    <div 
                      key={student.studentID}
                      className="bg-[#12151C] rounded-[2rem] border border-white/5 overflow-hidden hover:border-neon-blue/30 transition-all group relative shadow-xl hover:shadow-neon-blue/5"
                    >
                      <div className="p-5 md:p-6 flex flex-col lg:flex-row gap-4">
                        {/* Student Info */}
                        <div className="flex items-center gap-3 lg:w-1/4">
                          <div className="flex flex-col items-center justify-center min-w-[24px]">
                            <span className="text-[11px] font-black text-[#FFD700]">#{index + 1}</span>
                          </div>
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10 group-hover:border-neon-blue transition-all">
                            <img 
                              src={student.photoUrl || `https://picsum.photos/seed/${student.studentID}/200/200`} 
                              alt={student.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <h3 className="text-base font-black italic uppercase text-white group-hover:text-neon-blue transition-colors leading-none">{student.name}</h3>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{student.studentID}</p>
                              <span className={`text-[7px] font-black uppercase tracking-widest ${
                                student.gender === 'Male' ? 'text-blue-400' : 'text-pink-400'
                              }`}>
                                • {student.gender}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Marks Management */}
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {subjects.map((subject) => (
                              <div key={subject} className="space-y-1">
                                <label className="text-[7px] font-black text-stone-600 uppercase tracking-widest ml-1">{subject}</label>
                                <input 
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={editingMarks[student.studentID]?.[subject] ?? student.marks?.[subject] ?? ''}
                                  onChange={(e) => handleMarkChange(student.studentID, subject, e.target.value)}
                                  className="w-full px-2 py-2.5 bg-black/60 border border-white/5 rounded-lg text-white font-black text-center text-[11px] focus:border-neon-blue outline-none transition-all"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="lg:w-40 flex items-center justify-end gap-2">
                          <AnimatePresence>
                            {editingMarks[student.studentID] && (
                              <motion.button 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={() => saveMarks(student.studentID)}
                                disabled={saving === student.studentID}
                                className="flex-1 bg-neon-blue text-white py-3 rounded-lg font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-1.5 hover:brightness-110 transition-all"
                              >
                                {saving === student.studentID ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Save className="w-3 h-3" /> Save</>
                                )}
                              </motion.button>
                            )}
                          </AnimatePresence>
                          <button 
                            onClick={() => setStudentToDelete(student.studentID)}
                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <motion.div 
              key="attendance-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {!isAttendanceStarted ? (
                <div className="p-8 text-center bg-[#12151C] rounded-[2rem] border border-white/5 shadow-2xl space-y-6">
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-neon-cyan/10 flex items-center justify-center border border-neon-cyan/20 mx-auto">
                      <Calendar className="w-6 h-6 text-neon-cyan" />
                    </div>
                    <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">Attendance Session</h2>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Enter date to begin roll call</p>
                  </div>

                  <div className="space-y-4 max-w-[240px] mx-auto">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="DD/MM/YY"
                        value={attendanceDate}
                        onChange={(e) => setAttendanceDate(e.target.value)}
                        className="w-full px-4 py-4 bg-black/40 border border-neon-cyan/30 rounded-xl text-center text-neon-cyan font-black text-base outline-none focus:border-neon-cyan transition-all placeholder:text-neon-cyan/20"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        if (filteredStudents.length === 0) {
                          alert('No students found in this section.');
                          return;
                        }
                        setIsAttendanceStarted(true);
                        setCurrentStudentIndex(0);
                        setAttendanceResults({});
                        setIsAttendanceFinished(false);
                      }}
                      className="w-full py-4 bg-neon-cyan text-black rounded-xl font-black uppercase tracking-widest text-[11px] shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:brightness-110 active:scale-95 transition-all"
                    >
                      START SESSION
                    </button>
                  </div>

                  {/* Attendance History Vertical List */}
                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <div className="px-2 space-y-3">
                      <h3 className="text-xs font-black text-neon-cyan uppercase tracking-[0.2em]">Attendance History</h3>
                      <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-600 group-focus-within:text-neon-cyan transition-colors" />
                        <input 
                          type="text"
                          placeholder="Search Month or Date (e.g. May, 06/05/2026)"
                          value={attSearch}
                          onChange={(e) => setAttSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black placeholder:text-stone-700 focus:border-neon-cyan outline-none transition-all text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {filteredHistoryDates.length === 0 ? (
                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                          <p className="text-stone-600 font-bold uppercase tracking-widest text-[9px]">No records found for that search</p>
                        </div>
                      ) : (
                        filteredHistoryDates.map((d) => {
                          const record = attendanceHistory.find(h => h.date === d.full);
                          const isSelected = selectedHistoryDate === d.full;
                        
                        let statusText = 'No Record';
                        let statusColor = 'text-stone-600';
                        let borderColor = 'border-white/5';

                        if (record) {
                          statusText = 'Completed';
                          statusColor = record.allPresent ? 'text-green-500' : 'text-red-500';
                          borderColor = record.allPresent ? 'border-green-500/20' : 'border-red-500/20';
                        }

                        if (isSelected) {
                          borderColor = 'border-neon-cyan/50';
                        }

                        return (
                          <div key={d.full} className="space-y-2">
                            <button
                              onClick={() => fetchHistoryDetails(d.full)}
                              className={`w-full bg-white/5 p-4 rounded-2xl border transition-all flex items-center justify-between group hover:bg-white/[0.08] ${borderColor} ${isSelected ? 'bg-white/[0.08]' : ''}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center border ${isSelected ? 'bg-neon-cyan/20 border-neon-cyan' : 'bg-black/40 border-white/10'}`}>
                                  <span className={`text-[7px] font-black uppercase ${isSelected ? 'text-neon-cyan' : 'text-stone-500'}`}>{d.day}</span>
                                  <span className={`text-xs font-black ${isSelected ? 'text-neon-cyan' : 'text-white'}`}>{d.date}</span>
                                </div>
                                <div className="text-left">
                                  <h4 className="text-[11px] font-black text-white uppercase tracking-tight">{d.fullDay}, {d.full}</h4>
                                  <p className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${statusColor}`}>
                                    {statusText}
                                  </p>
                                </div>
                              </div>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center border border-white/10 text-stone-600 group-hover:text-white transition-colors ${isSelected ? 'rotate-180 text-neon-cyan border-neon-cyan/30' : ''}`}>
                                <ArrowUpDown className="w-3 h-3" />
                              </div>
                            </button>

                            {/* History Details Summary (Inline) */}
                            <AnimatePresence>
                              {isSelected && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-black/40 rounded-2xl border border-white/5 p-4 space-y-4 mx-1 mb-2">
                                    {loadingHistory ? (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-neon-cyan" />
                                      </div>
                                    ) : !historyDetails ? (
                                      <div className="text-center py-4 space-y-2">
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                                          <Calendar className="w-5 h-5 text-stone-700" />
                                        </div>
                                        <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest">No session recorded for this date</p>
                                      </div>
                                    ) : (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 text-center">
                                            <p className="text-[8px] font-black text-green-500 uppercase">Present</p>
                                            <p className="text-sm font-black text-white">
                                              {Object.values(historyDetails.results).filter(v => v === 'present').length}
                                            </p>
                                          </div>
                                          <div className="bg-red-500/5 p-2 rounded-xl border border-red-500/10 text-center">
                                            <p className="text-[8px] font-black text-red-500 uppercase">Absent</p>
                                            <p className="text-sm font-black text-white">
                                              {Object.values(historyDetails.results).filter(v => v === 'absent').length}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                          {students.map(student => {
                                            const status = historyDetails.results[student.studentID];
                                            if (!status) return null;
                                            
                                            const isPresent = status === 'present';
                                            const isAbsent = status === 'absent';

                                            return (
                                              <div 
                                                key={student.studentID} 
                                                className={`bg-[#121212] p-4 rounded-xl border transition-all flex flex-col justify-center min-h-[70px] ${
                                                  isPresent 
                                                    ? 'border-2 border-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.3)]' 
                                                    : isAbsent 
                                                      ? 'border-2 border-red-500' 
                                                      : 'border-neon-cyan/20'
                                                }`}
                                              >
                                                <span className={`text-[11px] font-black uppercase transition-colors ${isAbsent ? 'text-red-500' : 'text-white'}`}>
                                                  {student.name}
                                                </span>
                                                <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest mt-0.5">
                                                  {student.studentID}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                    </div>
                  </div>
                </div>
              ) : isAttendanceFinished ? (
                <div className="p-8 text-center bg-[#12151C] rounded-[2rem] border border-white/5 shadow-2xl space-y-6">
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 mx-auto">
                      <Save className="w-6 h-6 text-green-500" />
                    </div>
                    <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">Session Complete</h2>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">{attendanceDate}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                      <p className="text-[10px] font-black text-green-500 uppercase">Present</p>
                      <p className="text-xl font-black text-white">{Object.values(attendanceResults).filter(v => v === 'present').length}</p>
                    </div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                      <p className="text-[10px] font-black text-red-500 uppercase">Absent</p>
                      <p className="text-xl font-black text-white">{Object.values(attendanceResults).filter(v => v === 'absent').length}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsAttendanceStarted(false)}
                    className="w-full py-3 bg-white/5 border border-white/10 text-stone-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
                  >
                    BACK TO MENU
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between px-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-neon-cyan uppercase tracking-widest">Attendance Session</span>
                      <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">{attendanceDate}</span>
                    </div>
                    <button 
                      onClick={() => setIsAttendanceStarted(false)}
                      className="p-2 bg-white/5 rounded-full text-stone-600 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Digital Badge Card */}
                  <div className="flex flex-col items-center py-4">
                    <div 
                      style={{ clipPath: 'polygon(15% 0%, 100% 0%, 100% 85%, 85% 100%, 0% 100%, 0% 15%)' }}
                      className="w-full max-w-[280px] aspect-[3/4] bg-gradient-to-br from-[#1a1a1a] to-[#000000] border border-white/5 relative flex flex-col p-6 overflow-hidden"
                    >
                      {/* Badge Decorative Header */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-neon-cyan/20" />
                      
                      {/* Student ID - Top Right Box */}
                      <div className="absolute top-6 right-6">
                        <div className="bg-white/5 px-3 py-1.5 border border-white/10 rounded flex flex-col items-end">
                          <span className="text-[6px] font-black text-stone-600 uppercase tracking-tighter leading-none">ID CODE</span>
                          <span className="text-[10px] font-black text-white italic tracking-widest">{filteredStudents[currentStudentIndex].studentID}</span>
                        </div>
                      </div>

                      {/* Name - Dead Center */}
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                        <span className="text-[8px] font-black text-neon-cyan uppercase tracking-[0.4em] mb-4 opacity-50">AUTHORIZED STUDENT</span>
                        <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none [text-shadow:0_0_20px_rgba(255,255,255,0.1)]">
                          {filteredStudents[currentStudentIndex].name}
                        </h3>
                        <div className="w-12 h-0.5 bg-neon-cyan mt-4 opacity-30" />
                      </div>

                      {/* Control Buttons - Bottom Squares */}
                      <div className="grid grid-cols-2 gap-4 mt-auto pt-6">
                        <button 
                          onClick={() => handleAttendance('absent')}
                          className="aspect-square bg-black border-2 border-red-500 rounded flex flex-col items-center justify-center gap-1 group active:scale-95 transition-all shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        >
                          <X className="w-6 h-6 text-red-500" />
                          <span className="text-[8px] font-black text-red-500 tracking-widest">ABSENT</span>
                        </button>

                        <button 
                          onClick={() => handleAttendance('present')}
                          className="aspect-square bg-black border-2 border-neon-cyan rounded flex flex-col items-center justify-center gap-1 group active:scale-95 transition-all shadow-[0_0_15px_rgba(0,229,255,0.1)]"
                        >
                          <Users className="w-6 h-6 text-neon-cyan" />
                          <span className="text-[8px] font-black text-neon-cyan tracking-widest">PRESENT</span>
                        </button>
                      </div>

                      {/* Decorative elements */}
                      <div className="absolute bottom-2 left-6 text-[6px] font-black text-stone-800 uppercase italic">
                        INGIBI SECURE ID
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-8 flex gap-1 items-center">
                      {filteredStudents.map((_, idx) => (
                        <div 
                          key={idx}
                          className={`h-1 transition-all rounded-full ${
                            idx === currentStudentIndex 
                              ? 'w-6 bg-neon-cyan' 
                              : idx < currentStudentIndex 
                                ? 'w-1.5 bg-neon-cyan/40' 
                                : 'w-1.5 bg-white/5'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* History Preview (Optional, simplified) */}
                  <div className="mt-4 text-center">
                    <span className="text-[8px] font-black text-stone-600 uppercase tracking-widest">
                      Marking {currentStudentIndex + 1} of {filteredStudents.length}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'registration' && (
            <motion.div 
              key="registration-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-[#12151C] p-6 md:p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-neon-cyan/10 rounded-2xl text-neon-cyan border border-neon-cyan/20">
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Student Registration</h2>
                      <p className="text-[11px] font-black text-stone-500 uppercase tracking-widest">Add new student to {user.grade}{user.section}</p>
                    </div>
                  </div>
                  <div className="px-4 py-1 bg-white/5 rounded-full border border-white/10">
                    <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{user.stream}</span>
                  </div>
                </div>

                <form onSubmit={addStudent} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <User className="w-3.5 h-3.5" /> Full Name
                      </label>
                      <input 
                        type="text" 
                        value={addStuName}
                        onChange={(e) => setAddStuName(e.target.value)}
                        placeholder="Enter full name"
                        className="w-full px-5 py-5 bg-black border border-white/10 rounded-2xl text-base font-black placeholder:text-stone-700 focus:border-neon-cyan outline-none transition-all text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5" /> Password
                      </label>
                      <input 
                        type="text" 
                        value={addStuPass}
                        onChange={(e) => setAddStuPass(e.target.value)}
                        placeholder="Set password"
                        className="w-full px-5 py-5 bg-black border border-white/10 rounded-2xl text-base font-black placeholder:text-stone-700 focus:border-neon-cyan outline-none transition-all text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" /> Gender
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setAddStuGender('Male')}
                          className={`py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border ${
                            addStuGender === 'Male' 
                              ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                              : 'bg-white/5 text-stone-500 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          Male
                        </button>
                        <button 
                          type="button"
                          onClick={() => setAddStuGender('Female')}
                          className={`py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border ${
                            addStuGender === 'Female' 
                              ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]' 
                              : 'bg-white/5 text-stone-500 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          Female
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5" /> Student Photo
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <button 
                        type="button"
                        onClick={() => stuFileRef.current?.click()}
                        className="w-full sm:flex-1 px-6 py-5 bg-white/5 border border-white/10 rounded-2xl text-stone-400 text-sm font-black flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {addStuPhotoFile ? addStuPhotoFile.name : 'CHOOSE PHOTO'}
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
                          <img src={addStuPhotoPreview} className="w-16 h-16 rounded-2xl object-cover border-2 border-neon-cyan/30" alt="Preview" />
                          <button 
                            type="button"
                            onClick={() => {
                              setAddStuPhotoFile(null);
                              setAddStuPhotoPreview('');
                              if (stuFileRef.current) stuFileRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:scale-110 transition-transform"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button 
                    type="submit"
                    disabled={isAddingStudent || !addStuName || !addStuPass || !user.isApproved}
                    className="w-full py-6 bg-neon-cyan text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_0_30px_rgba(0,229,255,0.2)] flex items-center justify-center gap-3"
                  >
                    {isAddingStudent ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <><UserPlus className="w-5 h-5" /> REGISTER STUDENT</>
                    )}
                  </button>

                  {!user.isApproved && (
                    <p className="text-center text-[9px] font-black text-amber-500 uppercase tracking-widest animate-pulse">
                      Principal approval required to register students
                    </p>
                  )}
                </form>
              </div>
            </motion.div>
          )}

          {activeTab === 'quizzes' && (
            <motion.div 
              key="quizzes-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              {/* Notification Banner */}
              {quizSuccessMsg && (
                <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.15)] animate-in fade-in duration-200">
                  <div className="flex items-center gap-2.5 text-xs font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{quizSuccessMsg}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setQuizSuccessMsg(null)} 
                    className="p-1 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Edit Mode Alert Banner */}
              {editingQuizId && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Editing Live Quiz</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px] font-mono">ID: {editingQuizId.slice(0, 8)}</span>
                      </div>
                      <p className="text-xs text-stone-200 font-bold mt-0.5">
                        Modifying <strong className="text-amber-300">{quizSubject}</strong> (Grade {user.grade || quizGrade} • Section {user.section || quizSection} • {quizQuestions.length} Questions)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEditQuiz}
                    className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-stone-200 text-xs font-bold rounded-xl transition-all self-end sm:self-auto"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}

              {/* Quiz Maker & Editor Section */}
              <div ref={quizEditorRef} className="bg-[#0D1017] p-5 md:p-7 rounded-3xl border border-white/5 space-y-6 shadow-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${editingQuizId ? 'bg-amber-400 animate-pulse' : 'bg-[#00E5FF]'}`} />
                      <h2 className="text-lg font-black italic uppercase tracking-tight text-white">
                        {editingQuizId ? 'Edit Posted Quiz' : 'Quiz Maker'}
                      </h2>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {editingQuizId 
                        ? `Updating assessment for your logged-in classroom (Grade ${user.grade || '12'} - Section ${user.section || 'A'}).` 
                        : `Quizzes are strictly delivered only to your logged-in classroom (Grade ${user.grade || '12'} - Section ${user.section || 'A'}).`}
                    </p>
                  </div>

                  {editingQuizId && (
                    <button
                      type="button"
                      onClick={handleCancelEditQuiz}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-stone-400 text-xs font-bold rounded-xl transition-all"
                    >
                      Discard Changes
                    </button>
                  )}
                </div>

                {/* Settings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Subject */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3 text-[#00E5FF]" /> Subject
                    </label>
                    <div className="relative">
                      <select 
                        value={quizSubject}
                        onChange={(e) => setQuizSubject(e.target.value)}
                        className="w-full bg-[#141824] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase outline-none focus:border-[#00E5FF]/40 transition-all cursor-pointer"
                      >
                        <option value="">-- Choose Subject --</option>
                        {subjects.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Target Classroom (Locked to Logged-in Class) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                      <GraduationCap className="w-3 h-3 text-[#00E5FF]" /> Target Classroom
                    </label>
                    <div className="flex items-center justify-between bg-[#141824] border border-[#00E5FF]/20 rounded-xl px-3.5 py-2.5 shadow-[0_0_15px_rgba(0,229,255,0.05)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse shrink-0" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">
                          Grade {user.grade || quizGrade} • Section {user.section || quizSection}
                        </span>
                      </div>
                      <span className="text-[8px] font-black text-[#00E5FF] bg-[#00E5FF]/10 px-2 py-0.5 rounded border border-[#00E5FF]/20 uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Logged In
                      </span>
                    </div>
                  </div>

                  {/* Time Limit */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-[#00E5FF]" /> Time Limit
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={noTimeLimit}
                          onChange={(e) => setNoTimeLimit(e.target.checked)}
                          className="w-3 h-3 rounded border-white/10 bg-black/40 text-[#00E5FF] focus:ring-0"
                        />
                        <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider">No Limit</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-2 bg-[#141824] px-3 py-2 rounded-xl border border-white/10">
                      <input 
                        type="number"
                        min="1"
                        max="300"
                        disabled={noTimeLimit}
                        value={quizTimeLimit}
                        onChange={(e) => setQuizTimeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                        className="bg-transparent text-sm font-bold text-white w-14 outline-none disabled:opacity-30"
                      />
                      <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">MINUTES</span>
                    </div>
                  </div>
                </div>

                {/* Added Questions List */}
                {quizQuestions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                        Questions in Quiz ({quizQuestions.length})
                      </span>
                      <span className="text-[9px] text-[#00E5FF] font-bold">
                        Total {quizQuestions.length * 10} Points Available
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {quizQuestions.map((q, idx) => {
                        const isBeingEdited = editingQuestionIndex === idx;
                        const correctLetter = ['A', 'B', 'C', 'D'][q.correctAnswer] || 'A';
                        return (
                          <div 
                            key={idx} 
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                              isBeingEdited 
                                ? 'bg-amber-500/10 border-amber-500/40' 
                                : 'bg-[#141824] border-white/5 hover:border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                isBeingEdited ? 'bg-amber-400 text-black' : 'bg-white/5 text-[#00E5FF]'
                              }`}>
                                {idx + 1}
                              </span>
                              {q.image && (
                                <img 
                                  src={q.image} 
                                  alt="Thumb" 
                                  className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0" 
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <div className="truncate flex-1">
                                <p className="text-xs font-bold text-white truncate">{q.question}</p>
                                <div className="flex items-center gap-2 text-[9px] text-stone-400 font-medium mt-0.5">
                                  <span className="text-emerald-400 font-bold">Key: Option {correctLetter}</span>
                                  <span>•</span>
                                  <span>{q.options.filter(Boolean).length} Options</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditQuestionInList(idx)}
                                title="Edit question"
                                className="p-2 text-stone-400 hover:text-amber-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestionFromList(idx)}
                                title="Remove question"
                                className="p-2 text-stone-400 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Question Input Card */}
                <div className="bg-[#141824] p-4 md:p-5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                        editingQuestionIndex !== null 
                          ? 'bg-amber-400 text-black' 
                          : 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30'
                      }`}>
                        {editingQuestionIndex !== null ? editingQuestionIndex + 1 : questionNumber}
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-white">
                          {editingQuestionIndex !== null ? `Editing Question #${editingQuestionIndex + 1}` : `Add Question #${questionNumber}`}
                        </h4>
                        <p className="text-[10px] text-stone-500">Enter prompt, optional photo, 4 choices, and select the correct answer.</p>
                      </div>
                    </div>

                    {editingQuestionIndex !== null && (
                      <button
                        type="button"
                        onClick={handleCancelQuestionEdit}
                        className="px-2.5 py-1 text-[10px] font-bold text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <textarea 
                    placeholder="Type question statement here..."
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-xs text-white font-medium placeholder:text-stone-600 focus:border-[#00E5FF]/40 outline-none transition-all min-h-[72px] resize-none"
                  />

                  {/* Image Upload for Question */}
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-[#00E5FF]" /> Question Diagram / Image (Optional)
                      </label>
                      {questionImagePreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuestionImageFile(null);
                            setQuestionImagePreview('');
                            if (questionImageFileRef.current) questionImageFileRef.current.value = '';
                          }}
                          className="text-[9px] font-bold text-red-400 hover:text-red-300"
                        >
                          Remove Image
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => questionImageFileRef.current?.click()}
                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-stone-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/10 hover:border-[#00E5FF]/30 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#00E5FF]" />
                        {questionImageFile ? questionImageFile.name : (questionImagePreview ? 'Change Image' : 'Attach Image')}
                      </button>
                      <input
                        type="file"
                        ref={questionImageFileRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setQuestionImageFile(file);
                            setQuestionImagePreview(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                        accept="image/*"
                      />
                      {questionImagePreview && (
                        <div className="relative shrink-0">
                          <img 
                            src={questionImagePreview} 
                            className="w-14 h-14 rounded-xl object-cover border border-[#00E5FF]/30 shadow-md" 
                            alt="Question Preview" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4 Choices */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                      Options & Correct Answer:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                        const isCorrect = correctOption === letter;
                        return (
                          <div 
                            key={letter} 
                            className={`flex items-center gap-2.5 bg-black/30 p-2.5 rounded-xl border transition-all ${
                              isCorrect 
                                ? 'border-emerald-500/40 bg-emerald-500/5' 
                                : 'border-white/5 focus-within:border-white/20'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCorrectOption(letter)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 transition-all ${
                                isCorrect 
                                  ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                                  : 'bg-white/5 text-stone-400 hover:bg-white/10'
                              }`}
                            >
                              {letter}
                            </button>
                            <input 
                              type="text"
                              placeholder={`Option ${letter} text...`}
                              value={quizOptions[letter.toLowerCase() as keyof typeof quizOptions]}
                              onChange={(e) => setQuizOptions(prev => ({ ...prev, [letter.toLowerCase()]: e.target.value }))}
                              className="flex-1 bg-transparent text-xs text-white font-medium outline-none placeholder:text-stone-600"
                            />
                            {isCorrect && (
                              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider pr-1">
                                Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button 
                      type="button"
                      onClick={handleAddOrUpdateQuestion}
                      disabled={!questionText.trim()}
                      className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                      {editingQuestionIndex !== null ? (
                        <><Save className="w-3.5 h-3.5 text-amber-400" /> Update This Question</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5 text-[#00E5FF]" /> Add Question To Quiz</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Primary Quiz Post / Update Actions */}
                <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row gap-3">
                  {editingQuizId && (
                    <button
                      type="button"
                      onClick={handleCancelEditQuiz}
                      className="py-3.5 px-5 bg-white/5 hover:bg-white/10 text-stone-300 rounded-2xl font-bold uppercase tracking-wider text-xs transition-all"
                    >
                      Cancel Editing
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={handleSaveQuiz}
                    disabled={isSavingQuiz || !quizSubject.trim() || (quizQuestions.length === 0 && !questionText.trim())}
                    className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${
                      editingQuizId 
                        ? 'bg-amber-400 text-black shadow-amber-500/20' 
                        : 'bg-[#00E5FF] text-black shadow-[#00E5FF]/20'
                    }`}
                  >
                    {isSavingQuiz ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : editingQuizId ? (
                      <><Save className="w-4 h-4" /> UPDATE POSTED QUIZ</>
                    ) : (
                      <><Save className="w-4 h-4" /> SAVE & POST QUIZ</>
                    )}
                  </button>
                </div>
              </div>

              {/* Posted Quizzes Management List */}
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#00E5FF]" /> Posted Quizzes
                    </h3>
                    <p className="text-xs text-stone-400">
                      Manage, edit questions, preview keys, or delete active school quizzes.
                    </p>
                  </div>

                  {/* Filter and Counter */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuizFilter('my')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        quizFilter === 'my' 
                          ? 'bg-[#00E5FF] text-black' 
                          : 'bg-white/5 text-stone-400 hover:bg-white/10'
                      }`}
                    >
                      My Quizzes ({allQuizzes.filter(q => q.teacherId === user.uid || q.teacherEmail === user.email).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuizFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        quizFilter === 'all' 
                          ? 'bg-[#00E5FF] text-black' 
                          : 'bg-white/5 text-stone-400 hover:bg-white/10'
                      }`}
                    >
                      All ({allQuizzes.length})
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search quizzes by subject or class section..."
                    value={quizSearchTerm}
                    onChange={(e) => setQuizSearchTerm(e.target.value)}
                    className="w-full bg-[#0D1017] border border-white/5 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-stone-600 outline-none focus:border-[#00E5FF]/40 transition-all"
                  />
                  {quizSearchTerm && (
                    <button 
                      type="button"
                      onClick={() => setQuizSearchTerm('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Quizzes List Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displayedQuizzes.length === 0 ? (
                    <div className="col-span-full text-center py-12 border border-dashed border-white/10 rounded-3xl space-y-2">
                      <BookOpen className="w-8 h-8 text-stone-600 mx-auto opacity-40" />
                      <p className="text-stone-400 font-bold uppercase tracking-wider text-xs">No posted quizzes found</p>
                      <p className="text-[10px] text-stone-600">Create one above to make assessments available to students.</p>
                    </div>
                  ) : (
                    displayedQuizzes.map((quiz) => {
                      const isCurrentlyEditing = editingQuizId === quiz.id;
                      const isMyQuiz = quiz.teacherId === user.uid || quiz.teacherEmail === user.email;
                      return (
                        <div 
                          key={quiz.id} 
                          className={`p-4 rounded-3xl border transition-all space-y-3 flex flex-col justify-between ${
                            isCurrentlyEditing 
                              ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.15)]' 
                              : 'bg-[#0D1017] border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 bg-[#00E5FF]/10 rounded-2xl flex items-center justify-center text-[#00E5FF] border border-[#00E5FF]/20 shrink-0">
                                  <BookOpen className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-black italic uppercase tracking-tight text-white">{quiz.subject}</h4>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] font-black bg-[#00E5FF]/10 text-[#00E5FF] px-2 py-0.5 rounded-md border border-[#00E5FF]/20 uppercase">
                                      Grade {quiz.grade} • Sec {quiz.section || user.section || 'A'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {isMyQuiz && (
                                <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30">
                                  Yours
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[10px] text-stone-400 font-medium pt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#00E5FF]" /> 
                                {quiz.timeLimit > 0 ? `${Math.floor(quiz.timeLimit / 60)} Mins` : 'No Limit'}
                              </span>
                              <span>•</span>
                              <span className="text-stone-300 font-bold">
                                {quiz.questions?.length || 0} Questions
                              </span>
                              <span>•</span>
                              <span className="text-emerald-400 font-bold">
                                {(quiz.questions?.length || 0) * 10} Pts
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons Row */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => setPreviewQuiz(quiz)}
                              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#00E5FF]" />
                              Preview
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditQuiz(quiz)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                  isCurrentlyEditing
                                    ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20'
                                    : 'bg-white/5 hover:bg-amber-500/20 text-stone-300 hover:text-amber-300'
                                }`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                {isCurrentlyEditing ? 'Editing' : 'Edit'}
                              </button>

                              <button
                                type="button"
                                onClick={() => setQuizToDelete(quiz)}
                                title="Delete quiz"
                                className="p-2 text-stone-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-xl transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'news' && (
            <motion.div
              key="news-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="text-center space-y-1 mb-4">
                <h2 className="text-lg font-black italic uppercase tracking-tighter text-[#00E5FF]">SCHOOL NEWS</h2>
                <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest">Latest Updates</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {news.length > 0 ? (
                  news.map((item) => (
                    <motion.div
                      key={item.id}
                      className="bg-[#0A0C10] border border-white/5 rounded-2xl overflow-hidden group hover:border-neon-blue transition-all"
                    >
                      {item.imageUrl && (
                        <div className="relative h-32 overflow-hidden">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0C10] to-transparent opacity-60" />
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 uppercase tracking-widest">
                          <Calendar className="w-2.5 h-2.5 text-neon-blue" />
                          {new Date(item.date).toLocaleDateString()}
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-tight leading-tight">{item.title}</h3>
                        <p className="text-[10px] font-medium text-stone-400 leading-relaxed line-clamp-2">{item.content}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <Newspaper className="w-6 h-6 text-stone-700 mx-auto mb-2 opacity-20" />
                    <p className="text-[8px] font-black text-stone-600 uppercase tracking-widest">No news posted yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Success Modal for Student Registration */}
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
                    Student was successfully added to <span className="text-[#00E5FF]">grade {user.grade} (sec {user.section})</span>. Give them the Login ID above to access their portal dashboard.
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
      </div>
    </div>
  );
}
