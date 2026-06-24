import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, X } from 'lucide-react';

type BarcodeScannerProps = {
  onScan: (code: string) => void;
  onClose: () => void;
};

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);
  const onScanRef = useRef(onScan);

  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let alreadyScanned = false;

    const startScanner = async () => {
      try {
        setError('');
        setStarted(false);

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Fotocamera non supportata da questo browser.');
        }

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (!devices || devices.length === 0) {
          throw new Error('Nessuna fotocamera trovata.');
        }

        const backCamera =
          devices.find((device) =>
            /back|rear|environment|posteriore/i.test(device.label)
          ) || devices[devices.length - 1];

        if (cancelled || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader();

        controlsRef.current = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current,
          (result) => {
            if (!result || alreadyScanned) return;

            const text = result.getText();

            if (!text) return;

            alreadyScanned = true;

            try {
              controlsRef.current?.stop();
            } catch {}

            onScanRef.current(text);
          }
        );

        if (!cancelled) {
          setStarted(true);
        }
      } catch (err: any) {
        console.error(err);

        if (!cancelled) {
          setError(
            err?.message ||
              'Impossibile avviare la fotocamera. Controlla i permessi camera e usa HTTPS.'
          );
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;

      try {
        controlsRef.current?.stop();
      } catch {}

      controlsRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-[#1E60F2]" />

            <div>
              <h2 className="text-lg font-black text-slate-800">
                Scanner Barcode
              </h2>
              <p className="text-sm font-semibold text-slate-500">
                Inquadra il codice prodotto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-11 w-11 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="bg-[#020617] p-4">
          <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {!started && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
                Avvio fotocamera...
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-white text-sm font-bold leading-6">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 text-center text-sm font-semibold text-slate-500">
          Avvicina il codice a barre, tienilo ben illuminato e orizzontale.
        </div>
      </div>
    </div>
  );
}