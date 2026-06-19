import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import {
  AlertCircle,
  Camera,
  Check,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Maximize2,
  RefreshCw,
  Scan,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getPublicStorageUrl, hasConfig, productImagesBucket, supabase } from './supabase';
import { JobImageRow, JobRow, OutputFormat, SelectedImage } from './types';
import BarcodeScanner from './components/BarcodeScanner';
import ImageModal from './components/ImageModal';

const MAX_IMAGES = 5;

const cleanCodeValue = (value: string) => value.trim().replace(/[^a-zA-Z0-9_\-]/g, '');

const getCountdown = (expiresAt?: string | null) => {
  if (!expiresAt) return '';

  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return '';

  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const statusLabel = (status?: string | null) => {
  switch (status) {
    case 'uploading':
      return 'Upload';
    case 'pending':
      return 'In coda';
    case 'processing':
      return 'Processing';
    case 'done':
      return 'Pronta';
    case 'error':
      return 'Errore';
    default:
      return 'In coda';
  }
};

const statusClasses = (status?: string | null) => {
  switch (status) {
    case 'done':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'processing':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'error':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'uploading':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const signIn = async () => {
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setMessage(error.message);
    setLoading(false);
  };

  const signUp = async () => {
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) setMessage(error.message);
    else setMessage('Account creato. Controlla la mail se la conferma email e attiva.');

    setLoading(false);
  };

  if (!hasConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-4">
        <div className="max-w-md rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <h1 className="mt-4 text-lg font-bold text-slate-800">Configurazione Supabase mancante</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili ambiente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
            <Sparkles className="h-6 w-6 text-[#1E60F2]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Rembg Marek</h1>
            <p className="text-xs text-slate-500">Accesso operatore</p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#1E60F2]"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#1E60F2]"
          />

          {message && <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-700">{message}</p>}

          <button
            type="button"
            onClick={signIn}
            disabled={loading || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E60F2] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Accedi
          </button>

          <button
            type="button"
            onClick={signUp}
            disabled={loading || !email || !password}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-40"
          >
            Crea account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<'new' | 'status'>('new');

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [productCode, setProductCode] = useState('');
  const [publicCode, setPublicCode] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [marginPercentage, setMarginPercentage] = useState(10);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const [recentJobs, setRecentJobs] = useState<JobRow[]>([]);
  const [tick, setTick] = useState(0);

  const [showScanner, setShowScanner] = useState(false);
  const [activeZoomImage, setActiveZoomImage] = useState<SelectedImage | null>(null);
  const [activePreview, setActivePreview] = useState<{ url: string; fileName: string } | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const cleanedProductCode = useMemo(() => cleanCodeValue(productCode), [productCode]);

  useEffect(() => {
    if (!hasConfig) {
      setCheckingAuth(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setCheckingAuth(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setCheckingAuth(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loadRecentJobs = async () => {
    if (!user) return;

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
        created_by,
        job_images (
          id,
          job_id,
          image_index,
          original_path,
          result_path,
          nas_path,
          file_name,
          status,
          processed_at,
          preview_expires_at,
          storage_deleted_at,
          error
        )
      `)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error) setRecentJobs((data || []) as JobRow[]);
  };

  useEffect(() => {
    if (!user) return;

    loadRecentJobs();

    const interval = setInterval(() => {
      loadRecentJobs();
      setTick((value) => value + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  const resetForm = () => {
    selectedImages.forEach((img) => URL.revokeObjectURL(img.localUrl));
    setSelectedImages([]);
    setProductCode('');
    setPublicCode('');
    setLookupError('');
    setLookupLoading(false);
    setMarginPercentage(10);
    setOutputFormat('png');
    setUploadMessage('');
  };

  const handleLogout = async () => {
    resetForm();
    await supabase.auth.signOut();
  };

  const convertProductCode = async (code: string) => {
    const scannedCode = cleanCodeValue(code);
    if (!scannedCode) return;

    setProductCode(scannedCode);
    setLookupLoading(true);
    setLookupError('');
    setPublicCode('');

    try {
      const response = await fetch('/api/convert-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: scannedCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Codice pubblico non trovato.');
      }

      const convertedCode = String(data.public_code || data.final_code || '').trim();
      if (!convertedCode) throw new Error('Il database non ha restituito un codice pubblico valido.');

      setPublicCode(convertedCode);
    } catch (error: any) {
      setLookupError(error.message || 'Errore conversione codice.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleFilesAdded = (files: FileList | null) => {
    if (!files) return;

    const remainingSlots = MAX_IMAGES - selectedImages.length;
    if (remainingSlots <= 0) {
      alert('Hai gia caricato il numero massimo di immagini (5).');
      return;
    }

    const newImages: SelectedImage[] = [];
    const filesToCount = Math.min(files.length, remainingSlots);

    for (let i = 0; i < filesToCount; i++) {
      const file = files[i];
      newImages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        localUrl: URL.createObjectURL(file),
        approved: true,
      });
    }

    setSelectedImages((prev) => [...prev, ...newImages]);
  };

  const handleDeleteImage = (id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.localUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleTriggerReplace = (id: string) => {
    setReplaceTargetId(id);
    replaceInputRef.current?.click();
  };

  const handleFileReplaced = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !replaceTargetId) return;

    const newFile = files[0];
    setSelectedImages((prev) =>
      prev.map((img) => {
        if (img.id === replaceTargetId) {
          URL.revokeObjectURL(img.localUrl);
          return {
            ...img,
            file: newFile,
            localUrl: URL.createObjectURL(newFile),
            approved: true,
          };
        }
        return img;
      })
    );

    e.target.value = '';
    setReplaceTargetId(null);
  };

  const handleToggleApprove = (id: string) => {
    setSelectedImages((prev) => prev.map((img) => (img.id === id ? { ...img, approved: !img.approved } : img)));
  };

  const uploadOriginal = async (jobId: string, code: string, img: SelectedImage, index: number) => {
    const extension = img.file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `originals/${jobId}/${code}-${index}.${safeExtension}`;

    const { error } = await supabase.storage.from(productImagesBucket).upload(path, img.file, {
      contentType: img.file.type || 'image/jpeg',
      upsert: true,
    });

    if (error) throw error;
    return path;
  };

  const handleConfermaEProcessa = async () => {
    const approvedList = selectedImages.filter((img) => img.approved);

    if (!cleanedProductCode) {
      alert("Il codice prodotto e obbligatorio prima d'inviare.");
      return;
    }

    if (!publicCode) {
      alert('Devi recuperare il codice pubblico prima di procedere.');
      return;
    }

    if (approvedList.length === 0) {
      alert('Devi approvare almeno 1 immagine prima di procedere.');
      return;
    }

    setUploading(true);
    setUploadMessage('Creazione lavoro in corso...');

    try {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          product_code: cleanedProductCode,
          final_code: publicCode,
          margin_percentage: marginPercentage,
          output_format: outputFormat,
          status: 'uploading',
          created_by: user?.id || null,
          error: null,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      if (!job?.id) throw new Error('Job non creato.');

      const imageRows = [];

      for (let index = 0; index < approvedList.length; index++) {
        setUploadMessage(`Upload foto ${index + 1}/${approvedList.length}...`);
        const originalPath = await uploadOriginal(job.id, cleanedProductCode, approvedList[index], index + 1);
        imageRows.push({
          job_id: job.id,
          image_index: index + 1,
          original_path: originalPath,
          status: 'pending',
          error: null,
        });
      }

      const { error: imagesError } = await supabase.from('job_images').insert(imageRows);
      if (imagesError) throw imagesError;

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ status: 'pending', error: null })
        .eq('id', job.id);

      if (updateError) throw updateError;

      resetForm();
      setCurrentTab('status');
      await loadRecentJobs();
    } catch (e: any) {
      console.error(e);
      alert(`Errore durante l'invio: ${e?.message || e}`);
    } finally {
      setUploading(false);
      setUploadMessage('');
    }
  };

  const triggerDownloadFile = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const visibleJobs = recentJobs.filter((job) => (job.job_images || []).length > 0);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] text-[#4A4A40]">
        <Loader2 className="mb-4 h-9 w-9 animate-spin text-[#5A5A40]" />
        <p className="text-xs font-bold uppercase tracking-widest text-[#4A4A40]/70">Inizializzazione sessione...</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-[#F4F6FA] pb-12 font-sans text-slate-800 antialiased selection:bg-[#1E60F2]/10">
      <div className="mx-auto max-w-[500px] px-4 pt-6">
        <header className="mb-4 flex items-center justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50">
              <Sparkles className="h-5 w-5 text-[#1E60F2]" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight text-slate-800">Rembg Marek</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Supabase + NAS/PC</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Scollegati"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <nav className="mb-4 grid grid-cols-2 rounded-[22px] border border-slate-100 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setCurrentTab('new')}
            className={`rounded-[18px] px-3 py-3 text-xs font-bold uppercase tracking-wider transition ${
              currentTab === 'new' ? 'bg-[#1E60F2] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Nuovo Prodotto
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('status')}
            className={`rounded-[18px] px-3 py-3 text-xs font-bold uppercase tracking-wider transition ${
              currentTab === 'status' ? 'bg-[#1E60F2] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Stato Lavori
          </button>
        </nav>

        {currentTab === 'new' && (
          <div className="space-y-4">
            <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#1E60F2]">
                  <Scan className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Codice prodotto</h2>
                  <p className="text-[11px] text-slate-400">Scansiona o inserisci il codice originale</p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={productCode}
                  onChange={(e) => {
                    setProductCode(e.target.value);
                    setPublicCode('');
                    setLookupError('');
                  }}
                  placeholder="Es. VK02138"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-bold text-slate-700 outline-none focus:border-[#1E60F2]"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1E60F2] text-white shadow-sm hover:bg-blue-700"
                >
                  <Scan className="h-5 w-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => convertProductCode(cleanedProductCode)}
                disabled={!cleanedProductCode || lookupLoading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recupera codice pubblico
              </button>

              {lookupLoading && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Ricerca codice pubblico in corso...
                </div>
              )}

              {publicCode && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Codice pubblico: <strong className="font-mono">{publicCode}</strong>
                </div>
              )}

              {lookupError && (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {lookupError}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Impostazioni output</h2>
                  <p className="text-[11px] text-slate-400">Margine e formato finale</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">Margine prodotto</span>
                  <span className="font-mono text-sm font-bold text-[#1E60F2]">{marginPercentage}%</span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={marginPercentage}
                  onChange={(e) => setMarginPercentage(Number(e.target.value))}
                  className="mt-3 w-full"
                />

                <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                  <span>Prodotto piu grande</span>
                  <span>Piu margine</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-700">Formato finale</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOutputFormat('png')}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                      outputFormat === 'png'
                        ? 'bg-[#1E60F2] text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    PNG trasparente
                  </button>

                  <button
                    type="button"
                    onClick={() => setOutputFormat('jpg')}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                      outputFormat === 'jpg'
                        ? 'bg-[#1E60F2] text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    JPEG bianco
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  PNG mantiene trasparenza. JPEG salva con sfondo bianco.
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Foto prodotto</h2>
                    <p className="text-[11px] text-slate-400">Massimo {MAX_IMAGES} immagini</p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">
                  {selectedImages.length}/{MAX_IMAGES}
                </span>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileReplaced}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#1E60F2] px-4 py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
                >
                  <Camera className="h-4 w-4" />
                  Scatta
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedImages.length >= MAX_IMAGES}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs font-bold uppercase tracking-wider text-slate-700 disabled:opacity-40"
                >
                  <Upload className="h-4 w-4" />
                  Carica
                </button>
              </div>

              {selectedImages.length > 0 && (
                <div className="mt-4 space-y-3">
                  {selectedImages.map((img, index) => (
                    <div key={img.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <button
                        type="button"
                        onClick={() => setActiveZoomImage(img)}
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <img src={img.localUrl} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                        <Maximize2 className="absolute bottom-1 right-1 h-4 w-4 rounded bg-white/80 p-0.5 text-slate-500" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-700">Foto {index + 1}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-400">{img.file.name}</p>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleApprove(img.id)}
                            className={`flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold uppercase ${
                              img.approved ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            <Check className="h-3 w-3" />
                            {img.approved ? 'Approvata' : 'Esclusa'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerReplace(img.id)}
                            className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
                          >
                            Cambia
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(img.id)}
                            className="rounded-xl bg-rose-50 px-3 py-2 text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {uploadMessage && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-700">
                {uploadMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfermaEProcessa}
              disabled={uploading || !cleanedProductCode || !publicCode || selectedImages.filter((i) => i.approved).length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-[#1E60F2] px-5 py-5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-500/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              Processa
            </button>
          </div>
        )}

        {currentTab === 'status' && (
          <div className="space-y-4">
            {visibleJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[28px] border border-slate-100 bg-white p-8 py-12 text-center shadow-sm">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-400">
                  <Clock className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">Nessun lavoro attivo</h3>
                <p className="mx-auto mt-2 max-w-[260px] text-xs leading-relaxed text-slate-400">
                  Quando invii un prodotto, qui vedrai pending, processing e preview pronta per 10 minuti.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentTab('new')}
                  className="mt-6 rounded-xl bg-[#1E60F2] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-blue-500/10"
                >
                  Nuovo prodotto
                </button>
              </div>
            ) : (
              visibleJobs.map((job) => (
                <section key={job.id} className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-bold text-slate-800">{job.final_code || job.product_code}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Originale: {job.product_code}</p>
                      <p className="text-[11px] text-slate-500">
                        Margine: {job.margin_percentage ?? 10}% - Formato: {(job.output_format || 'png').toUpperCase()}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${statusClasses(job.status)}`}>
                      {statusLabel(job.status)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(job.job_images || [])
                      .sort((a, b) => a.image_index - b.image_index)
                      .map((image: JobImageRow) => {
                        const countdown = getCountdown(image.preview_expires_at);
                        const previewUrl =
                          image.status === 'done' && image.result_path && countdown ? getPublicStorageUrl(image.result_path) : '';
                        const fileName = image.file_name || `${job.final_code || job.product_code}-${image.image_index}.${job.output_format || 'png'}`;

                        return (
                          <div key={image.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs font-bold text-slate-700">{fileName}</p>
                                <p className="mt-1 text-[11px] text-slate-400">Foto {image.image_index}</p>
                              </div>
                              <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${statusClasses(image.status)}`}>
                                {statusLabel(image.status)}
                              </span>
                            </div>

                            {image.status === 'processing' && (
                              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-blue-700">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Rimozione sfondo in corso...
                              </div>
                            )}

                            {previewUrl && (
                              <div className="mt-3 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setActivePreview({ url: previewUrl, fileName })}
                                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:10px_10px]"
                                >
                                  <img src={previewUrl} alt={fileName} className="h-full w-full object-contain p-1" />
                                  <Maximize2 className="absolute bottom-1 right-1 h-4 w-4 rounded bg-white/90 p-0.5 text-slate-500" />
                                </button>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-emerald-700">Anteprima pronta</p>
                                  <p className="mt-1 font-mono text-[11px] text-slate-500">Visibile per {countdown}</p>
                                  <p className="mt-1 text-[11px] text-slate-400">Clicca per ingrandire</p>
                                </div>
                              </div>
                            )}

                            {image.error && <p className="mt-2 text-xs text-rose-600">{image.error}</p>}
                          </div>
                        );
                      })}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(code) => convertProductCode(code)}
          onClose={() => setShowScanner(false)}
        />
      )}

      {activeZoomImage && (
        <ImageModal
          isOpen={!!activeZoomImage}
          onClose={() => setActiveZoomImage(null)}
          imageUrl={activeZoomImage.localUrl}
          title={`Anteprima locale`}
          isProcessed={false}
          onDelete={() => {
            handleDeleteImage(activeZoomImage.id);
            setActiveZoomImage(null);
          }}
          onReplaceClick={() => handleTriggerReplace(activeZoomImage.id)}
        />
      )}

      {activePreview && (
        <ImageModal
          isOpen={!!activePreview}
          onClose={() => setActivePreview(null)}
          imageUrl={activePreview.url}
          title={`Foto lavorata - ${activePreview.fileName}`}
          isProcessed={true}
          onDownload={() => triggerDownloadFile(activePreview.url, activePreview.fileName)}
        />
      )}
    </div>
  );
}
