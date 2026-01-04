import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';

const VideoUpload = ({ onUpload, loading }) => {
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm p-6 rounded-2xl">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Upload Video</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Upload traffic footage for automatic violation analysis.
      </p>
      <div className="space-y-4">
        <div
          data-testid="upload-dropzone"
          onClick={() => !loading && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-slate-800 transition-all"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-500 dark:text-slate-300">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-blue-500/10 rounded-full p-4">
                <Upload className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className="text-slate-900 dark:text-white font-medium">Click to select video</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported formats: MP4, AVI, MOV
                </p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="video-file-input"
        />
      </div>
    </Card>
  );
};

export default VideoUpload;
