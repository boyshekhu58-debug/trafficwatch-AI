import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, Image as ImageIcon } from 'lucide-react';

// Resize image in browser to limit uploads from mobile devices
const resizeImage = (file, maxWidth = 2048, maxHeight = 2048, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.onload = () => {
          let { width, height } = img;
          // Compute new size while preserving aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Image compression failed'));
              // Preserve filename but use .jpg for broad compatibility
              const newFile = new File([blob], (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' });
              resolve(newFile);
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = (err) => reject(err);
        img.src = ev.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
};

const PhotoUpload = ({ onUpload, loading }) => {
  const fileInputRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  // Camera capture state
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' or 'environment'
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } , audio: false });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Camera start failed', err);
      alert('Could not access camera. Please allow camera permissions or use the file picker.');
    }
  };

  const stopCamera = () => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    mediaStreamRef.current = null;
    setCameraActive(false);
  };

  const flipCamera = async () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    // Restart camera with new facing mode
    stopCamera();
    await startCamera();
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
    stopCamera();
    // Reuse existing upload flow (compression will skip if small)
    await handleSelectedFile(file);
  };

  const handleSelectedFile = async (file) => {
    if (!file) return;

    // Accept all images from mobile (HEIC/HEIF may not have browser support everywhere, so fallback to try/except)
    if (!file.type || !file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    // Client-side max size check (50MB) - we'll compress large images
    const MAX_SIZE = 50 * 1024 * 1024;
    let fileToUpload = file;

    try {
      setProcessing(true);
      setProgress(0);

      // If file is bigger than 2MB, compress/resize it for mobile uploads
      if (file.size > 2 * 1024 * 1024) {
        const compressed = await resizeImage(file, 2048, 2048, 0.85);
        fileToUpload = compressed;
      }

      // Final size check (hard limit)
      if (fileToUpload.size > MAX_SIZE) {
        alert('File too large after compression. Please use a smaller image or reduce resolution.');
        setProcessing(false);
        return;
      }

      // Provide an onProgress callback to parent upload handler
      const progressCb = (p) => setProgress(p);
      await onUpload(fileToUpload, progressCb);
      setProgress(0);
    } catch (err) {
      console.error('Image processing/upload failed', err);
      alert('Failed to process image. Try a different photo or file format.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleSelectedFile(file);
  };

  // Stop camera when component unmounts
  React.useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <Card className="bg-white border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Upload Photo</h3>
      <div className="space-y-4">
        <div
          data-testid="photo-upload-dropzone"
          onClick={() => !loading && fileInputRef.current?.click()}
          className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-all shadow-sm"
        >
          {loading || processing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-700">{processing ? 'Processing...' : 'Uploading...'}</p>
              {progress > 0 && <p className="text-slate-500 text-sm mt-1">{progress}%</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white rounded-full p-4 shadow">
                <ImageIcon className="w-8 h-8 text-slate-900" />
              </div>
              <div>
                <p className="text-slate-900 font-medium">Click to upload photo</p>
                <p className="text-xs text-slate-500 mt-1">Images from camera or gallery supported (auto-compress). Max 50MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Camera capture controls */}
        <div className="flex items-center gap-2">
          {!cameraActive ? (
            <>
              <button type="button" onClick={startCamera} className="px-3 py-1 bg-blue-600 text-white rounded">Use Camera</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1 bg-slate-100 rounded">Choose File</button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button type="button" onClick={captureFromCamera} className="px-3 py-1 bg-green-600 text-white rounded">Capture</button>
                <button type="button" onClick={flipCamera} className="px-3 py-1 bg-slate-100 rounded">Flip</button>
                <button type="button" onClick={stopCamera} className="px-3 py-1 bg-red-600 text-white rounded">Close</button>
              </div>
            </>
          )}
        </div>

        {cameraActive && (
          <div className="mt-3">
            <video ref={videoRef} autoPlay playsInline muted className="w-[280px] h-auto rounded" />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="photo-file-input"
        />
      </div>
    </Card>
  );
};

export default PhotoUpload;

