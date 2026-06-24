import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
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
const MARGINS = [5, 10, 15, 20];

export default function App() {
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
  const [margin, setMargin] = useState(5);
  const [saveFormat, setSaveFormat] = useState<SaveFormat>('jpg');

  const [showScanner, setShowScanner] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const cleanedProductCode = useMemo(() => productCode.trim(), [productCode]);

  const canProcess =
    cleanedProductCode &&
    publicCode &&
    selectedImages.length > 0 &&
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

    loadRecentJobs(false);

    const interval = window.setInterval(() => {
      loadRecentJobs(false);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!cleanedProductCode) {
      setPublicCode('');
      setConversionError('');
      return;
    }

    const timer = window.setTimeout(() => {
      convertProductCode(cleanedProductCode);
    }, 600);

    return () => window.clearTimeout(timer);
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

  const loadRecentJobs = async (showLoading = true) => {
    if (showLoading) setRefreshingJobs(true);

    try {
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
        .neq('status', 'uploading')
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      setJobs((data || []) as Job[]);
    } catch (error: any) {
      if (showLoading) {
        alert(error.message || 'Errore aggiornamento lavori.');
      }
    } finally {
      if (showLoading) setRefreshingJobs(false);
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

  const resetForm = () => {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));

    setProductCode('');
    setPublicCode('');
    setConversionError('');
    setSelectedImages([]);
    setMargin(5);
    setSaveFormat('jpg');
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

    if (selectedImages.length === 0) {
      alert('Aggiungi almeno una foto.');
      return;
    }

    setUploading(true);

    try {
      const safeMargin = MARGINS.includes(margin) ? margin : 15;

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          product_code: cleanedProductCode,
          final_code: publicCode,
          margin_percentage: safeMargin,
          output_format: saveFormat,
          status: 'uploading',
          created_by: user?.id || null,
          error: null,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i];
        const imageIndex = i + 1;
        const originalExtension =
          image.file.name.split('.').pop()?.toLowerCase() || 'jpg';

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

      const { error: readyError } = await supabase
        .from('jobs')
        .update({
          status: 'pending',
          error: null,
        })
        .eq('id', job.id);

      if (readyError) throw readyError;

      resetForm();
      setActiveTab('new');
      await loadRecentJobs(false);
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

    const cacheVersion = image.processed_at || image.id;

    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${image.result_path}?v=${encodeURIComponent(cacheVersion)}`;
  };

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-xl border border-slate-200">
          <AlertCircle className="h-9 w-9 text-amber-500" />
          <h1 className="mt-4 text-lg font-black text-slate-800">
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
        <Loader2 className="h-7 w-7 animate-spin text-[#1E60F2]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-5">
        <div className="w-full max-w-[390px] rounded-[26px] bg-white p-6 shadow-xl border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-[#1E60F2]" />
            </div>

            <div>
              <h1 className="text-[24px] font-black text-slate-800 leading-none">
                Rembg USP
              </h1>

              <p className="mt-1 text-sm font-semibold text-slate-500">
                Accesso operatore
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-[#1E60F2]"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-[#1E60F2]"
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
              className="w-full rounded-2xl bg-[#1E60F2] px-5 py-3 text-base font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {authLoading ? 'Attendi...' : 'Accedi'}
            </button>

            <button
              type="button"
              onClick={handleSignup}
              disabled={authLoading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-black text-slate-700 disabled:opacity-50"
            >
              Crea account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-4">
      <div className="mx-auto w-full max-w-[390px] pb-14">
        <header className="rounded-[26px] bg-white border border-slate-200 shadow-sm px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Sparkles className="h-7 w-7 text-[#1E60F2]" />
            </div>

            <h1 className="text-[20px] font-black text-slate-800 leading-none whitespace-nowrap">
              Rembg USP
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[15px] font-black text-slate-700">
              Utente
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="h-12 w-12 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500 shrink-0"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="mt-5 rounded-[26px] bg-white border border-slate-100 shadow-sm p-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`rounded-[20px] py-4 flex items-center justify-center gap-2 text-[12px] font-black tracking-wide transition ${
              activeTab === 'new'
                ? 'bg-[#1E60F2] text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400'
            }`}
          >
            <Plus className="h-5 w-5" />
            NUOVO PRODOTTO
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`rounded-[20px] py-4 flex items-center justify-center gap-2 text-[12px] font-black tracking-wide transition ${
              activeTab === 'status'
                ? 'bg-[#1E60F2] text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400'
            }`}
          >
            <Clock3 className="h-5 w-5" />
            STATO LAVORI
          </button>
        </div>

        {activeTab === 'new' && (
          <>
            <section className="mt-5 rounded-[26px] bg-white border border-slate-200 shadow-sm p-5">
              <h2 className="text-[13px] font-black tracking-wide text-slate-800 uppercase">
                CODICE PRODOTTO
              </h2>

              <div className="mt-4 flex gap-3">
                <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
                  <FileText className="h-6 w-6 text-slate-400" />

                  <input
                    value={productCode}
                    onChange={(event) => {
                      setProductCode(event.target.value);
                      setPublicCode('');
                      setConversionError('');
                    }}
                    placeholder="Codice Articolo"
                    className="w-full bg-transparent text-base font-bold text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="h-[58px] w-[58px] rounded-2xl bg-[#1E60F2] text-white shadow-lg shadow-blue-600/20 flex items-center justify-center"
                >
                  <ScanLine className="h-7 w-7" />
                </button>
              </div>

              {isConverting && (
                <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#1E60F2] flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ricerca codice pubblico...
                </div>
              )}

              {publicCode && (
                <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">
                    Codice pubblico
                  </p>
                  <p className="mt-1 text-lg font-black text-emerald-800">
                    {publicCode}
                  </p>
                </div>
              )}

              {conversionError && (
                <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  {conversionError}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-[26px] bg-white border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-black tracking-wide text-slate-800 uppercase">
                  FOTO PRODOTTO ORIGINALI
                </h2>

                <span className="rounded-2xl bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-600">
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

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="rounded-[22px] border-2 border-dashed border-blue-300 bg-blue-50/50 p-5 flex flex-col items-center justify-center gap-3 disabled:opacity-40"
                >
                  <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                    <Camera className="h-6 w-6 text-[#1E60F2]" />
                  </div>
                  <span className="text-sm font-black text-[#1E60F2]">
                    Scatta Foto
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="rounded-[22px] border-2 border-dashed border-slate-200 bg-slate-50 p-5 flex flex-col items-center justify-center gap-3 disabled:opacity-40"
                >
                  <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                    <Upload className="h-6 w-6 text-slate-500" />
                  </div>
                  <span className="text-sm font-black text-slate-600 text-center">
                    Carica da Galleria
                  </span>
                </button>
              </div>

              {selectedImages.length > 0 && (
                <div className="mt-5 space-y-3">
                  {selectedImages.map((image, index) => (
                    <div
                      key={image.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3"
                    >
                      <img
                        src={image.previewUrl}
                        alt={`Foto ${index + 1}`}
                        className="h-[93.5px] w-[93.5px] min-w-[93.5px] rounded-[20px] object-cover bg-white border border-slate-200"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-700">
                          Foto {index + 1}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {image.file.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-[26px] bg-white border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-black tracking-wide text-slate-800 uppercase">
                  MARGINE
                </h2>

                <span className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-1.5 text-base font-black text-[#1E60F2]">
                  {margin}%
                </span>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2">
                {MARGINS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMargin(value)}
                    className={`rounded-xl border px-2 py-3 text-sm font-black ${
                      margin === value
                        ? 'bg-[#1E60F2] text-white border-[#1E60F2] shadow-lg shadow-blue-600/20'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {value}%
                  </button>
                ))}
              </div>

              <div className="my-5 h-px bg-slate-100" />

              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-black tracking-wide text-slate-800 uppercase">
                  FORMATO
                </h2>

                <span className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-black text-[#1E60F2] uppercase">
                  {saveFormat === 'jpg' ? 'jpeg' : saveFormat}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSaveFormat('jpg')}
                  className={`rounded-2xl border px-4 py-4 text-center ${
                    saveFormat === 'jpg'
                      ? 'bg-[#1E60F2] text-white border-[#1E60F2] shadow-lg shadow-blue-600/20'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <p className="text-base font-black">JPEG</p>
                  <p className="mt-1 text-xs opacity-70">sfondo bianco</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSaveFormat('png')}
                  className={`rounded-2xl border px-4 py-4 text-center ${
                    saveFormat === 'png'
                      ? 'bg-[#1E60F2] text-white border-[#1E60F2] shadow-lg shadow-blue-600/20'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <p className="text-base font-black">PNG</p>
                  <p className="mt-1 text-xs opacity-70">sfondo trasparente</p>
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={handleProcess}
              disabled={!canProcess}
              className="mt-6 w-full rounded-[22px] bg-[#1E60F2] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3 disabled:bg-blue-200 disabled:text-blue-400 disabled:shadow-none"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Conferma e Processa
                  <ChevronRight className="h-5 w-5" />
                </>
              )}
            </button>
          </>
        )}

        {activeTab === 'status' && (
          <>
            {jobs.length === 0 ? (
              <section className="mt-5 rounded-[34px] bg-white border border-slate-100 shadow-sm px-6 py-16 flex flex-col items-center justify-center text-center min-h-[360px]">
                <div className="h-16 w-16 rounded-[22px] border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <Clock3 className="h-8 w-8 text-slate-400" />
                </div>

                <h3 className="mt-8 text-[18px] font-black tracking-[0.18em] text-slate-800 uppercase">
                  NESSUN LAVORO ATTIVO
                </h3>

                <p className="mt-5 max-w-[285px] text-[15px] font-semibold leading-7 text-slate-400">
                  Non c&apos;è nessuna lavorazione attiva in questo momento. Crea un
                  codice prodotto e carica le immagini nella scheda &quot;Nuovo Prodotto&quot;.
                </p>

                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="mt-8 rounded-2xl bg-[#1E60F2] px-8 py-4 text-sm font-black tracking-wide text-white shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  INIZIA ORA
                </button>
              </section>
            ) : (
              <section className="mt-5 rounded-[26px] bg-white border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-black tracking-wide text-slate-800 uppercase">
                    STATO LAVORI
                  </h2>

                  <button
                    type="button"
                    onClick={() => loadRecentJobs(true)}
                    disabled={refreshingJobs}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 active:scale-95 disabled:opacity-60 flex items-center gap-2"
                  >
                    {refreshingJobs && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#1E60F2]" />
                    )}
                    {refreshingJobs ? 'Aggiorno...' : 'Aggiorna'}
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {jobs.flatMap((job) =>
                    (job.job_images || []).map((image) => {
                      const countdown = getCountdown(image.preview_expires_at);
                      const previewUrl = getPreviewUrl(image);
                      const formatLabel = (job.output_format || 'jpg').toUpperCase();

                      return (
                        <div
                          key={image.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex items-start gap-3">
                            {previewUrl ? (
                              <button
                                type="button"
                                onClick={() => setActivePreviewUrl(previewUrl)}
                                className="h-[93.5px] w-[93.5px] min-w-[93.5px] overflow-hidden rounded-[20px] border border-slate-200 bg-white"
                              >
                                <img
                                  src={previewUrl}
                                  alt={image.file_name || 'preview'}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="h-[93.5px] w-[93.5px] min-w-[93.5px] rounded-[20px] border border-slate-200 bg-white flex items-center justify-center">
                                {image.status === 'processing' ? (
                                  <Loader2 className="h-7 w-7 animate-spin text-[#1E60F2]" />
                                ) : (
                                  <ImageIcon className="h-7 w-7 text-slate-300" />
                                )}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-xs font-black text-slate-800 truncate">
                                {image.file_name ||
                                  `${job.final_code || job.product_code}-${image.image_index}.${job.output_format || 'jpg'}`}
                              </p>

                              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                Originale: {job.product_code}
                              </p>

                              <p className="text-[11px] font-semibold text-slate-500">
                                Margine: {job.margin_percentage ?? 15}% · {formatLabel}
                              </p>

                              {image.error && (
                                <p className="mt-2 text-xs font-bold text-rose-600">
                                  {image.error}
                                </p>
                              )}

                              {image.status === 'done' && countdown && (
                                <p className="mt-2 text-xs font-mono font-black text-[#1E60F2]">
                                  Preview {countdown}
                                </p>
                              )}
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                                image.status === 'done'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : image.status === 'processing'
                                    ? 'bg-blue-100 text-[#1E60F2]'
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
              </section>
            )}
          </>
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
          <div className="relative w-full max-w-3xl rounded-[24px] bg-white p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setActivePreviewUrl(null)}
              className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white shadow flex items-center justify-center text-slate-600"
            >
              <X className="h-5 w-5" />
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