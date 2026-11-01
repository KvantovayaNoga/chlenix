import { useState, useRef, useEffect } from 'react';
import { Upload, X, Check } from 'lucide-react';

interface AvatarUploadProps {
  currentAvatar?: string;
  onAvatarChange: (avatar: string | undefined) => void;
}

export function AvatarUpload({ currentAvatar, onAvatarChange }: AvatarUploadProps) {
  const [isCropping, setIsCropping] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setIsCropping(true);
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setDrawStart({ x, y });
    setCropBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const width = currentX - drawStart.x;
    const height = currentY - drawStart.y;
    
    setCropBox({
      x: width < 0 ? currentX : drawStart.x,
      y: height < 0 ? currentY : drawStart.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleCrop = () => {
    if (!imageSrc || !canvasRef.current || cropBox.width === 0 || cropBox.height === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const containerWidth = 400;
      const containerHeight = 400;
      const scale = Math.min(containerWidth / img.width, containerHeight / img.height);
      
      // Вычисляем координаты в исходном изображении
      const sourceX = cropBox.x / scale;
      const sourceY = cropBox.y / scale;
      const sourceWidth = cropBox.width / scale;
      const sourceHeight = cropBox.height / scale;

      canvas.width = 200;
      canvas.height = 200;
      
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, 200, 200
      );

      const croppedAvatar = canvas.toDataURL('image/jpeg', 0.9);
      onAvatarChange(croppedAvatar);
      setIsCropping(false);
      setImageSrc(null);
    };
    img.src = imageSrc;
  };

  const handleCancel = () => {
    setIsCropping(false);
    setImageSrc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onAvatarChange(undefined);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDrawing(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  if (isCropping && imageSrc) {
    return (
      <div className="space-y-4">
        <div 
          ref={containerRef}
          className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden cursor-crosshair select-none"
          style={{ width: '400px', height: '400px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <img
            src={imageSrc}
            alt="Crop preview"
            className="absolute"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
          {cropBox.width > 0 && cropBox.height > 0 && (
            <div
              className="absolute border-2 border-white shadow-lg pointer-events-none"
              style={{
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.width}px`,
                height: `${cropBox.height}px`,
              }}
            >
              <div className="absolute inset-0 bg-white/10"></div>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <button
            onClick={handleCrop}
            disabled={cropBox.width === 0 || cropBox.height === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
            Применить
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Отмена
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Нарисуйте квадрат мышью для выбора области аватара
        </p>
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
