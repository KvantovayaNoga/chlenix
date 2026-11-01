import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { useState } from 'react';
import { AvatarCropper } from './AvatarCropper';

interface AvatarUploadProps {
  currentAvatar?: string;
  onAvatarChange: (avatar: string | undefined) => void;
}

export function AvatarUpload({ currentAvatar, onAvatarChange }: AvatarUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    // сбрасываем input, чтобы можно было повторно выбрать тот же файл
    e.target.value = '';
  };

  const handleCrop = (cropped: string) => {
    onAvatarChange(cropped);
    setImageSrc(null);
  };

  const handleCancel = () => {
    setImageSrc(null);
  };

  const handleRemove = () => {
    onAvatarChange(undefined);
  };

  if (imageSrc) {
    return (
      <div className="fixed inset-0 z-[100]">
        <AvatarCropper
          imageSrc={imageSrc}
          onCrop={handleCrop}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative group">
          {currentAvatar ? (
            <img
              src={currentAvatar}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-600 cursor-pointer hover:border-indigo-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-gray-400 group-hover:text-indigo-400 transition-colors" />
            </div>
          )}
          {currentAvatar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 transition-colors opacity-0 group-hover:opacity-100"
              title="Удалить аватар"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="avatar-upload"
          />
          <label
            htmlFor="avatar-upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            {currentAvatar ? 'Изменить аватар' : 'Загрузить аватар'}
          </label>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG до 5MB</p>
        </div>
      </div>
    </div>
  );
}
