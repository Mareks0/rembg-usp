import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
  Html5QrcodeSupportedFormats,
} from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const containerId = useMemo(
    () => `barcode-scanner-reader-${Math.random().toString(36).slice(2)}`,
    []
  );

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const closingRef = useRef(false);
  const [error, setError] = useState('');

  const stopScanner = async () => {
    if (closingRef.current) return;
    closingRef.current = true;

    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      await scannerRef.current?.clear();
    } catch (e) {
      console.warn('Scanner cleanup:', e);
    }
  };

  useEffect(() => {
    closingRef.current = false;

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
      ],
      verbose: false,
    });

    scannerRef.current = scanner;

    const scanConfig: Html5QrcodeCameraScanConfig = {
      fps: 15,
      aspectRatio: 1.3333333,
      disableFlip: false,
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.floor(viewfinderWidth * 0.88),
        height: Math.floor(viewfinderHeight * 0.38),
      }),
    };

    scanner
      .start(
        { facingMode: { ideal: 'environment' } },
        scanConfig,
        async (decodedText) => {
          await stopScanner();
          onScan(decodedText.trim());
          onClose();
        },
        () => {}
      )
      .catch((e) => {
        console.error(e);
        setError('Impossibile avviare la fotocamera. Controlla i permessi camera e usa HTTPS.');
      });

    return () => {
      stopScanner();
    };
  }, [containerId, onClose, onScan]);

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-[#1E60F2]" />
            <div>
              <h2 className="font-bold text-slate-800">Scanner Barcode</h2>
              <p className="text-xs text-slate-500">Inquadra il codice prodotto</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-[#020617] p-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
            <div id={containerId} className="absolute inset-0 h-full w-full" />

            {!error && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="relative h-[38%] w-[88%] rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-[#1E60F2] shadow-[0_0_12px_#1E60F2]" />
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white px-5 py-5 text-center">
          <p className="text-sm leading-relaxed text-slate-500">
            Avvicina il codice a barre, tienilo ben illuminato e orizzontale.
          </p>
        </div>
      </div>
    </div>
  );
}
