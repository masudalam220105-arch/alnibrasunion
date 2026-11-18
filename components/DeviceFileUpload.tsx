'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileText,
  ImageIcon,
  Video,
  File,
  X,
  CheckCircle2,
  ExternalLink,
  Download,
} from 'lucide-react';
import {
  isSupportedImageFile,
  uploadFileToSupabaseStorage,
  uploadImageAsset,
  type StorageFolder,
} from '@/lib/supabase-storage';

export interface UploadedFileMeta {
  url: string;
  name: string;
  size: number;
  type: string;
  storagePath?: string;
}

export interface DeviceFileUploadProps {
  label?: string;
  accept?: string;
  helpText?: string;
  maxSizeMb?: number;
  storageFolder?: StorageFolder;
  destination?: 'public' | 'user';
  currentUrl?: string;
  currentName?: string;
  currentFileUrl?: string;
  currentFileName?: string;
  onFileUploaded?: (file: UploadedFileMeta) => void;
  onSelect?: (file: { dataUrl: string; fileName: string; fileType: string }) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onClear?: () => void;
  compact?: boolean;
}

function buildMetaFromUrl(url: string, name?: string, accept?: string): UploadedFileMeta {
  const isImg =
    url.startsWith('data:image/') ||
    /\.(png|jpg|jpeg|webp|gif|avif|bmp)(\?|$)/i.test(url) ||
    Boolean(name && /\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i.test(name)) ||
    Boolean(accept && accept.includes('image/') && !url.endsWith('.pdf'));
  return {
    url,
    name: name || (isImg ? 'Uploaded_Image' : 'Uploaded_Document'),
    size: 0,
    type: isImg ? 'image/jpeg' : 'document',
  };
}

export function DeviceFileUpload({
  label = 'Upload from Your Device',
  accept = 'image/*,application/pdf,.doc,.docx',
  helpText = 'Upload documents, images, PDFs, or files up to 15 MB',
  maxSizeMb = 15,
  storageFolder,
  destination = 'public',
  currentUrl,
  currentName,
  currentFileUrl,
  currentFileName,
  onFileUploaded,
  onSelect,
  onUploadingChange,
  onClear,
  compact = false,
}: DeviceFileUploadProps) {
  const effectiveUrl = currentUrl || currentFileUrl || '';
  const effectiveName = currentName || currentFileName;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localMeta, setLocalMeta] = useState<UploadedFileMeta | null>(null);
  const uploadedMeta: UploadedFileMeta | null = !effectiveUrl
    ? null
    : localMeta && localMeta.url === effectiveUrl
      ? localMeta
      : buildMetaFromUrl(effectiveUrl, effectiveName, accept);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resolveFolder = (file: File): StorageFolder => {
    if (storageFolder) return storageFolder;
    if (file.type.startsWith('video/')) return 'videos';
    if (isSupportedImageFile(file)) return 'gallery';
    return 'resources';
  };

  const processFile = async (file: File) => {
    setErrorMessage(null);
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMessage(`File exceeds the maximum allowed size of ${maxSizeMb} MB (${formatFileSize(file.size)}).`);
      return;
    }

    const imageOnlyInput = Boolean(accept && accept.trim() === 'image/*');
    if (imageOnlyInput && !isSupportedImageFile(file)) {
      setErrorMessage('Please select a valid raster image file (JPG, PNG, WEBP, GIF, BMP, or AVIF).');
      return;
    }

    setUploadProgress(15);
    onUploadingChange?.(true);
    try {
      const folder = resolveFolder(file);
      const uploaded = isSupportedImageFile(file)
        ? await uploadImageAsset(file, {
            folder,
            destination,
            maxSizeMb,
            maxDimension: folder === 'avatars' ? 900 : 1400,
            preserveTransparency: folder === 'official-branding' || folder === 'branding',
            onProgress: (pct) => setUploadProgress(pct),
          })
        : await uploadFileToSupabaseStorage(
            file,
            folder,
            destination,
            (pct) => setUploadProgress(pct)
          );
      const meta: UploadedFileMeta = {
        url: uploaded.url,
        name: uploaded.fileName,
        size: uploaded.sizeBytes,
        type: uploaded.contentType,
        storagePath: uploaded.storagePath,
      };
      setLocalMeta(meta);
      setUploadProgress(null);
      onUploadingChange?.(false);
      onFileUploaded?.(meta);
      onSelect?.({
        dataUrl: meta.url,
        fileName: meta.name,
        fileType: meta.type,
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to upload and process the selected file. Please try again.';
      setErrorMessage(msg);
      setUploadProgress(null);
      onUploadingChange?.(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void processFile(file);
    }
  };

  const handleRemove = () => {
    if (uploadProgress !== null) return;
    setLocalMeta(null);
    setUploadProgress(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear?.();
  };

  const isImage = (meta: UploadedFileMeta) => {
    return (
      meta.type.startsWith('image') ||
      meta.url.startsWith('data:image/') ||
      /\.(png|jpg|jpeg|webp|gif|avif)(\?|$)/i.test(meta.url) ||
      /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(meta.name)
    );
  };

  const isVideo = (meta: UploadedFileMeta) => {
    return (
      meta.type.startsWith('video/') ||
      meta.url.startsWith('data:video/') ||
      meta.name.match(/\.(mp4|webm|ogg)$/i)
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
        {uploadProgress !== null ? (
          <span className="text-[11px] text-amber-700 font-medium inline-flex items-center gap-1 font-mono-tabular">
            Uploading... {uploadProgress}%
          </span>
        ) : uploadedMeta ? (
          <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1 font-mono-tabular">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            File Attached
          </span>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* When no file is selected yet */}
      {!uploadedMeta && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl transition-all cursor-pointer text-center ${
            compact ? 'p-3.5' : 'p-5'
          } ${
            isDragging
              ? 'border-[#C5A059] bg-[#C5A059]/10'
              : 'border-slate-300 hover:border-[#0B192C] bg-[#FAF9F5]/70 hover:bg-white'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 text-[#0B192C] flex items-center justify-center shadow-xs">
              <UploadCloud className="w-5 h-5 text-[#C5A059]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#0B192C]">
                Click to browse or drag and drop your file here
              </p>
              <p className="text-[11px] text-slate-500">{helpText}</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload in progress */}
      {uploadProgress !== null && (
        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#0B192C]">Processing upload...</span>
            <span className="font-mono-tabular text-slate-500">{uploadProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0B192C] transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {errorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Uploaded file preview card */}
      {uploadedMeta && uploadProgress === null && (
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            {isImage(uploadedMeta) ? (
              <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                {/* Local user device uploaded preview image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedMeta.url}
                  alt={uploadedMeta.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : isVideo(uploadedMeta) ? (
              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5" />
              </div>
            ) : uploadedMeta.name.endsWith('.pdf') ? (
              <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <File className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#0B192C] truncate max-w-xs sm:max-w-md">
                {uploadedMeta.name}
              </p>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                {uploadedMeta.size > 0 ? formatFileSize(uploadedMeta.size) : 'Ready'} ·{' '}
                {isImage(uploadedMeta) ? 'Image Asset' : 'Document File'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {uploadedMeta.url && (
              <a
                href={uploadedMeta.url}
                target="_blank"
                rel="noreferrer"
                download={uploadedMeta.name}
                aria-label={`View or download ${uploadedMeta.name}`}
                className="p-1.5 text-slate-600 hover:text-[#0B192C] hover:bg-slate-100 rounded-lg transition-colors"
                title="Preview / Download file"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove attached file"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeviceFileUpload;
