import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase, hasConfig } from './supabase';
import BarcodeScanner from './components/BarcodeScanner';

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  approved: boolean;
};

type SaveFormat = 'png' | 'jpg';

type JobImage = {
  id: string;
  image_index: number;
  status: string | null;
  result_path: string | null;
  nas_path: string | null;
  file_name: string | null;
  processed_at: string | null;
  preview_expires_at: string | null;
  storage_deleted_at: string | null;
  error: string | null;
};

type Job = {
  id: string;
  product_code: string;
  final_code: string | null;
  margin_percentage: number | null;
  output_format: SaveFormat | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  job_images: JobImage[];
};

const MAX_IMAGES = 5;
const BUCKET_NAME = 'product-images';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<'new' | 'status'>('new');

  const [productCode, setProductCode] = useState('');
  const [publicCode, setPublicCode] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState('');

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [margin, setMargin] = useState(15);
  const [saveFormat, setSaveFormat] = useState<SaveFormat>('png');

  const [showScanner, setShowScanner] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const cleanedProductCode = useMemo(() => productCode.trim(), [productCode]);

  const approvedImages = useMemo(
    () => selectedImages.filter((image) => image.approved),
    [selectedImages]
  );

  const canProcess =
    cleanedProductCode &&
    publicCode &&
    approvedImages.length > 0 &&
    !uploading &&
    !isConverting;

  useEffect(() => {
    if (!hasConfig) {
      setCheckingAuth(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setCheckingAuth(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    loadRecentJobs();

    const interval = setInterval(() => {
      loadRecentJobs();
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!cleanedProductCode) {
      setPublicCode('');
      setConversionError('');
      return;
    }

    const timer = setTimeout(() => {
      convertProductCode(cleanedProductCode);
    }, 600);

    return () => clearTimeout(timer);
  }, [cleanedProductCode]);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Errore accesso.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Errore creazione account.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const convertProductCode = async (code: string) => {
    const cleanCode = code.trim();

    if (!cleanCode) return;

    setIsConverting(true);
    setPublicCode('');
    setConversionError('');

    try {
      const response = await fetch('/api/convert-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: cleanCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Codice pubblico non trovato.');
      }

      const converted = String(data.public_code || data.final_code || '').trim();

      if (!converted) {
        throw new Error('Il codice pubblico non è valido.');
      }

      setPublicCode(converted);
    } catch (error: any) {
      setConversionError(error.message || 'Errore conversione codice.');
    } finally {
      setIsConverting(false);
    }
  };

  const loadRecentJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        id,
        product_code,
        final_code,
        margin_percentage,
        output_format,
        status,
        created_at,
        processed_at,
        error,
        job_images (
          id,
          image_index,
          status,
          result_path,
          nas_path,
          file_name,
          processed_at,
          preview_expires_at,
          storage_deleted_at,
          error
        )
      `)
      .order('created_at', { ascending: false })
      .limit(25);

    if (!error) {
      setJobs((data || []) as Job[]);
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;

    const remainingSlots = MAX_IMAGES - selectedImages.length;
    const acceptedFiles = Array.from(files).slice(0, remainingSlots);

    const newImages = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      approved: true,
    }));

    setSelectedImages((current) => [...current, ...newImages]);
  };

  const removeImage = (id: string) => {
    setSelectedImages((current) => {
      const target = current.find((image) => image.id === id);

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((image) => image.id !== id);
    });
  };

  const toggleApproved = (id: string) => {
    setSelectedImages((current) =>
      current.map((image) =>
        image.id === id ? { ...image, approved: !image.approved } : image
      )
    );
  };

  const resetForm = () => {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));

    setProductCode('');
    setPublicCode('');
    setConversionError('');
    setSelectedImages([]);
    setMargin(15);
    setSaveFormat('png');
  };

  const handleProcess = async () => {
    if (!cleanedProductCode) {
      alert('Inserisci il codice articolo.');
      return;
    }

    if (!publicCode) {
      alert('Attendi il codice pubblico prima di procedere.');
      return;
    }

    if (approvedImages.length === 0) {
      alert('Aggiungi almeno una foto.');
      return;
    }

    setUploading(true);

    try {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          product_code: cleanedProductCode,
          final_code: publicCode,
          margin_percentage: margin,
          output_format: saveFormat,
          status: 'pending',
          created_by: user?.id || null,
          error: null,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      for (let i = 0; i < approvedImages.length; i++) {
        const image = approvedImages[i];
        const imageIndex = i + 1;
        const originalExtension = image.file.name.split('.').pop() || 'jpg';
        const originalPath = `originals/${job.id}/${cleanedProductCode}-${imageIndex}.${originalExtension}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(originalPath, image.file, {
            contentType: image.file.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { error: imageError } = await supabase.from('job_images').insert({
          job_id: job.id,
          image_index: imageIndex,
          original_path: originalPath,
          status: 'pending',
        });

        if (imageError) throw imageError;
      }

      resetForm();
      setActiveTab('status');
      loadRecentJobs();
    } catch (error: any) {
      alert(error.message || 'Errore durante il processo.');
    } finally {
      setUploading(false);
    }
  };

  const getCountdown = (expiresAt?: string | null) => {
    if (!expiresAt) return '';

    const diffMs = new Date(expiresAt).getTime() - Date.now();

    if (diffMs <= 0) return '';

    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getPreviewUrl = (image: JobImage) => {
    const countdown = getCountdown(image.preview_expires_at);

    if (image.status !== 'done' || !image.result_path || !countdown) {
      return '';
    }

    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${image.result_path}`;
  };

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl border border-slate-200">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-black text-slate-800">
            Configurazione Supabase mancante
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili ambiente.
          </p>
        </div>
      </div>
    );
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
        <div className="w-full max-w-[500px] rounded-[32px] bg-white p-8 shadow-xl border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-blue-600" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-slate-800">Rembg USP</h1>
              <p className="text-sm font-semibold text-slate-500">Accesso operatore</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg outline-none focus:border-blue-500"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg outline-none focus:border-blue-500"
            />

            {authError && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={authLoading}
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {authLoading ? 'Attendi...' : 'Accedi'}
            </button>

            <button
              type="button"
              onClick={handleSignup}
              disabled={authLoading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-lg font-black text-slate-700 disabled:opacity-50"
            >
              Crea account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-8">
      <div className="mx-auto w-full max-w-[500px] pb-20">
        <header className="rounded-[30px] bg-white border border-slate-200 shadow-sm p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-blue-600" />
            </div>

            <h1 className="text-2xl font-black text-slate-800">Rembg USP</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-700">Utente</span>

            <button
              type="button"
              onClick={handleLogout}
              className="h-14 w-14 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500"
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>
        </header>

        <div className="mt-8 rounded-[30px] bg-white border border-slate-100 shadow-sm p-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`rounded-[24px] py-5 flex items-center justify-center gap-3 text-lg font-black tracking-wide transition ${
              activeTab === 'new'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400'
            }`}
          >
            <Plus className="h-6 w-6" />
            NUOVO PRODOTTO
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`rounded-[24px] py-5 flex items-center justify-center gap-3 text-lg font-black tracking-wide transition ${
              activeTab === 'status'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400'
            }`}
          >
            <Clock3 className="h-6 w-6" />
            STATO LAVORI
          </button>
        </div>

        {activeTab === 'new' && (
          <>
            <section className="mt-8 rounded-[30px] bg-white border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-black tracking-wide text-slate-800">
                CODICE ARTICOLO
              </h2>

              <div className="mt-6 flex gap-3">
                <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 flex items-center gap-4">
                  <FileText className="h-7 w-7 text-slate-400" />

                  <input
                    value={productCode}
                    onChange={(event) => {
                      setProductCode(event.target.value);
                      setPublicCode('');
                      setConversionError('');
                    }}
                    placeholder="Es: 789403329"
                    className="w-full bg-transparent text-xl font-bold text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="h-[74px] w-[74px] rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center"
                >
                  <ScanLine className="h-8 w-8" />
                </button>
              </div>

              {isConverting && (
                <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ricerca codice pubblico...
                </div>
              )}

              {publicCode && (
                <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-wide">
                    Codice pubblico
                  </p>
                  <p className="mt-1 text-xl font-black text-emerald-800">
                    {publicCode}
                  </p>
                </div>
              )}

              {conversionError && (
                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  {conversionError}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-[30px] bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-wide text-slate-800">
                  FOTO
                </h2>

                <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
                  {selectedImages.length} di {MAX_IMAGES}
                </span>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />

              <div className="mt-6 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="rounded-[24px] border-2 border-dashed border-blue-300 bg-blue-50/50 p-8 flex flex-col items-center justify-center gap-4 disabled:opacity-40"
                >
                  <div className="h-16 w-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                    <Camera className="h-8 w-8 text-blue-600" />
                  </div>
                  <span className="text-lg font-black text-blue-600">Scatta Foto</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 p-8 flex flex-col items-center justify-center gap-4 disabled:opacity-40"
                >
                  <div className="h-16 w-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                    <Upload className="h-8 w-8 text-slate-500" />
                  </div>
                  <span className="text-lg font-black text-slate-600">
                    Carica da Galleria
                  </span>
                </button>
              </div>

              {selectedImages.length === 0 ? (
                <div className="mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 p-10 flex flex-col items-center justify-center text-center">
                  <ImageIcon className="h-12 w-12 text-slate-300" />
                  <p className="mt-4 text-lg font-black text-slate-400">
                    NESSUNA FOTO INSERITA
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">
                    Aggiungi fino a 5 foto alla volta.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {selectedImages.map((image, index) => (
                    <div
                      key={image.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3"
                    >
                      <img
                        src={image.previewUrl}
                        alt={`Foto ${index + 1}`}
                        className="h-20 w-20 rounded-xl object-cover bg-white"
                      />

                      <div className="flex-1">
                        <p className="text-sm font-black text-slate-700">
                          Foto {index + 1}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {image.file.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleApproved(image.id)}
                        className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                          image.approved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <Check className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-[30px] bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-wide text-slate-800">
                  MARGINE
                </h2>

                <span className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2 text-lg font-black text-blue-600">
                  {margin}%
                </span>
              </div>

              <div className="mt-6 grid grid-cols-6 gap-2">
                {[10, 15, 20, 30, 40, 50].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMargin(value)}
                    className={`rounded-2xl border px-3 py-4 text-sm font-black ${
                      margin === value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                        : 'bg-white text-slate-600 border-slate-700'
                    }`}
                  >
                    {value}%
                  </button>
                ))}
              </div>

              <div className="my-7 h-px bg-slate-100" />

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-wide text-slate-800">
                  FORMATO
                </h2>

                <span className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2 text-sm font-black text-blue-600 uppercase">
                  {saveFormat}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSaveFormat('png')}
                  className={`rounded-2xl border px-4 py-5 text-center ${
                    saveFormat === 'png'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                      : 'bg-white text-slate-600 border-slate-700'
                  }`}
                >
                  <p className="text-xl font-black">PNG</p>
                  <p className="mt-1 text-sm opacity-70">sfondo trasparente</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSaveFormat('jpg')}
                  className={`rounded-2xl border px-4 py-5 text-center ${
                    saveFormat === 'jpg'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                      : 'bg-white text-slate-600 border-slate-700'
                  }`}
                >
                  <p className="text-xl font-black">JPEG</p>
                  <p className="mt-1 text-sm opacity-70">sfondo bianco</p>
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={handleProcess}
              disabled={!canProcess}
              className="mt-8 w-full rounded-[26px] bg-blue-600 px-6 py-6 text-xl font-black text-white shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3 disabled:bg-blue-200 disabled:text-blue-400 disabled:shadow-none"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  Conferma e Processa
                  <ChevronRight className="h-6 w-6" />
                </>
              )}
            </button>
          </>
        )}

        {activeTab === 'status' && (
          <section className="mt-8 rounded-[30px] bg-white border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-wide text-slate-800">
                STATO LAVORI
              </h2>

              <button
                type="button"
                onClick={loadRecentJobs}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
              >
                Aggiorna
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 p-10 flex flex-col items-center justify-center text-center">
                <Clock3 className="h-12 w-12 text-slate-300" />
                <p className="mt-4 text-lg font-black text-slate-400">
                  NESSUN LAVORO
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  I processi appariranno qui.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {jobs.flatMap((job) =>
                  (job.job_images || []).map((image) => {
                    const countdown = getCountdown(image.preview_expires_at);
                    const previewUrl = getPreviewUrl(image);

                    return (
                      <div
                        key={image.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-start gap-3">
                          {previewUrl ? (
                            <button
                              type="button"
                              onClick={() => setActivePreviewUrl(previewUrl)}
                              className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white"
                            >
                              <img
                                src={previewUrl}
                                alt={image.file_name || 'preview'}
                                className="h-full w-full object-contain"
                              />
                            </button>
                          ) : (
                            <div className="h-20 w-20 rounded-xl border border-slate-200 bg-white flex items-center justify-center">
                              {image.status === 'processing' ? (
                                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                              ) : (
                                <ImageIcon className="h-7 w-7 text-slate-300" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-black text-slate-800 truncate">
                              {image.file_name ||
                                `${job.final_code || job.product_code}-${image.image_index}.${job.output_format || 'png'}`}
                            </p>

                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Originale: {job.product_code}
                            </p>

                            <p className="text-xs font-semibold text-slate-500">
                              Pubblico: {job.final_code || '-'}
                            </p>

                            <p className="text-xs font-semibold text-slate-500">
                              Margine: {job.margin_percentage ?? 15}% · Formato:{' '}
                              {(job.output_format || 'png').toUpperCase()}
                            </p>

                            {image.error && (
                              <p className="mt-2 text-xs font-bold text-rose-600">
                                {image.error}
                              </p>
                            )}

                            {image.status === 'done' && countdown && (
                              <p className="mt-2 text-xs font-mono font-black text-blue-600">
                                Preview {countdown}
                              </p>
                            )}
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                              image.status === 'done'
                                ? 'bg-emerald-100 text-emerald-700'
                                : image.status === 'processing'
                                  ? 'bg-blue-100 text-blue-700'
                                  : image.status === 'error'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {image.status || job.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(code) => {
            setProductCode(code);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {activePreviewUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-3xl rounded-[28px] bg-white p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setActivePreviewUrl(null)}
              className="absolute right-4 top-4 z-10 h-11 w-11 rounded-full bg-white shadow flex items-center justify-center text-slate-600"
            >
              <X className="h-6 w-6" />
            </button>

            <img
              src={activePreviewUrl}
              alt="Anteprima processata"
              className="max-h-[80vh] w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;